#!/usr/bin/env python3
"""Measure what each `source .../setup.bash` adds to a clean shell, for the workspace chains the team uses.

Run on a machine with the workspaces built (paths below). Writes public/data/setup/env_layers.json:
for every chain, each step's added path entries per variable, other variables set, and the ROS packages that
the step makes visible (from the ament resource index of each AMENT_PREFIX_PATH entry). Home paths become ~.

    python3 tools/setup/env_layers.py      # after tools/setup/workspace.py, whose package list it uses
"""
import json, os, subprocess
from pathlib import Path

HOME = str(Path.home())
OUT = Path(__file__).resolve().parents[2] / 'public/data/setup/env_layers.json'
PATHVARS = ['AMENT_PREFIX_PATH', 'CMAKE_PREFIX_PATH', 'COLCON_PREFIX_PATH', 'PATH', 'PYTHONPATH', 'LD_LIBRARY_PATH']
CHAINS = {
    'release': [
        ('/opt/ros/humble/setup.bash', 'ROS 2 Humble (apt)'),
        ('~/osu-uwrt/riptide_setup/install/setup.bash', 'riptide_setup (colcon deploy)'),
        ('~/osu-uwrt/release/install/setup.bash', 'release workspace'),
        ('~/osu-uwrt/release/nereus/build/ros-viewer/ros/setup.bash', 'Nereus launch files'),
    ],
}


def env_after(scripts):
    cmd = ''.join(f'source {s} >/dev/null 2>&1; ' for s in scripts) + 'env -0'
    out = subprocess.run(['env', '-i', f'HOME={HOME}', 'PATH=/usr/bin:/bin', 'bash', '--noprofile', '--norc', '-c', cmd],
                         capture_output=True, text=True, check=True).stdout
    return dict(kv.split('=', 1) for kv in out.split('\0') if '=' in kv)


def packages(prefix):
    idx = Path(prefix) / 'share/ament_index/resource_index/packages'
    return sorted(p.name for p in idx.iterdir()) if idx.is_dir() else []


# Leftovers in install/ whose source is gone (colcon never removes them) are not part of the release repo:
# keep only the packages tools/setup/workspace.py found in it.
WS_JSON = OUT.parent / 'workspace.json'
REPO_PKGS = {p['name'] for p in json.loads(WS_JSON.read_text())['packages']} if WS_JSON.exists() else None
STALE = set()


def tilde(s):
    return s.replace(HOME, '~')


data = {}
for name, chain in CHAINS.items():
    steps, prev = [], env_after([])
    for i, (script, label) in enumerate(chain):
        cur = env_after([s for s, _ in chain[: i + 1]])
        added = {}
        for v in PATHVARS:
            old = [p for p in prev.get(v, '').split(':') if p]
            new = [p for p in cur.get(v, '').split(':') if p]
            add = [tilde(p) for p in new if p not in old]
            if add:
                added[v] = add
        other = {k: tilde(cur[k]) for k in sorted(cur) if k not in PATHVARS and k not in ('_', 'SHLVL', 'PWD', 'OLDPWD')
                 and cur.get(k) != prev.get(k)}
        new_prefixes = [p for p in cur.get('AMENT_PREFIX_PATH', '').split(':') if p and p not in prev.get('AMENT_PREFIX_PATH', '').split(':')]
        pk = sorted({pkg for p in new_prefixes for pkg in packages(p)})
        if REPO_PKGS and 'release/install' in script:
            inst = Path(script.replace('~', HOME)).parent
            STALE.update(d.name for d in inst.iterdir() if d.is_dir() and d.name not in REPO_PKGS)
            pk = [x for x in pk if x in REPO_PKGS]
            new_prefixes = [p for p in new_prefixes if Path(p).name not in STALE]
            for v in added:
                added[v] = [e for e in added[v] if not any(f'/install/{x}' in e for x in STALE)]
        steps.append({'script': script, 'label': label, 'added': added, 'set': other, 'packages': pk,
                      'prefixes': len(new_prefixes)})
        prev = cur
    final = [tilde(p) for p in prev.get('AMENT_PREFIX_PATH', '').split(':') if p and not any(p.endswith('/install/' + x) for x in STALE)]
    data[name] = {'steps': steps, 'ament_prefix_path': final}

OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, indent=1))
for n, d in data.items():
    print(n, [(s['label'], len(s['packages']), {k: len(v) for k, v in s['added'].items()}, list(s['set'])) for s in d['steps']])
