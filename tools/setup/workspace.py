#!/usr/bin/env python3
"""The release workspace as data: its submodules (pins and tracked branches) and its colcon packages
(build type, repo, DEPLOY_IGNORE, description, internal dependencies, whether it exists at the pinned commit), plus what colcon's package selection
flags pick for each package (`colcon list --packages-up-to / --packages-above`). Run with ROS 2 sourced:

    source /opt/ros/humble/setup.bash && python3 tools/setup/workspace.py [~/osu-uwrt/release]

Writes public/data/setup/workspace.json.
"""
import json, re, subprocess, sys, xml.etree.ElementTree as ET
from pathlib import Path

WS = Path(sys.argv[1] if len(sys.argv) > 1 else '~/osu-uwrt/release').expanduser()
OUT = Path(__file__).resolve().parents[2] / 'public/data/setup/workspace.json'


def run(*cmd, cwd=WS):
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, check=True).stdout


# submodules: path, url, tracked branch (.gitmodules), pinned commit and what is checked out locally
mods = {}
for line in run('git', 'config', '-f', '.gitmodules', '--list').splitlines():
    m = re.match(r'submodule\.(.+?)\.(path|url|branch)=(.*)', line)
    if m:
        mods.setdefault(m[1], {})[m[2]] = m[3]
pins = {}
for line in run('git', 'ls-tree', '-r', 'HEAD').splitlines():
    meta, path = line.split('\t')
    mode, kind, sha = meta.split()
    if kind == 'commit':
        pins[path] = sha
submodules = []
for name, m in mods.items():
    sub = WS / m['path']
    branch = run('git', 'rev-parse', '--abbrev-ref', 'HEAD', cwd=sub).strip()
    submodules.append({'path': m['path'], 'url': m['url'].removesuffix('.git'), 'tracks': m.get('branch', ''),
                       'pinned': pins.get(m['path'], '')[:7], 'local_branch': branch})

# packages
rows = [l.split('\t') for l in run('colcon', 'list', '--topological-order').splitlines()]
names = [r[0] for r in rows]
# Only packages that belong to the release repo (a submodule); untracked folders someone dropped in src/ are skipped.
in_repo = lambda path: any(path == s['path'] or path.startswith(s['path'] + '/') for s in submodules)
rows = [r for r in rows if in_repo(r[1])]
names = [r[0] for r in rows]
pkgs = []
for i, (name, path, kind) in enumerate(rows):
    root = ET.parse(WS / path / 'package.xml').getroot()
    deps = sorted({d.text.strip() for d in root if d.tag.endswith('depend') and d.text and d.text.strip() in names})
    desc = (root.findtext('description') or '').strip()
    desc = re.sub(r'\s+', ' ', desc)
    repo = next((s['path'] for s in submodules if path == s['path'] or path.startswith(s['path'] + '/')), '')
    pkgs.append({
        'name': name, 'path': path, 'type': kind.strip('()').replace('ros.', ''), 'repo': repo, 'order': i,
        'deploy_ignore': (WS / path / 'DEPLOY_IGNORE').exists(), 'description': desc, 'deps': deps,
        'up_to': [n for n in run('colcon', 'list', '-n', '--packages-up-to', name).split() if n in names],
        'above': [n for n in run('colcon', 'list', '-n', '--packages-above', name).split() if n in names],
    })

# What a fresh `git clone --recursive` gets: is each package also in its submodule at the pinned commit (has a
# package.xml there, not under a COLCON_IGNORE)? Nested submodules (serial_library in opbox_software) count as present.
def at_pin(path, repo):
    sha = run('git', 'ls-tree', 'HEAD', repo).split()[2]
    tree = [l.split('\t') for l in run('git', 'ls-tree', '-r', sha, cwd=WS / repo).splitlines()]
    files = {f for meta, f in tree if meta.split()[1] == 'blob'}
    nested = [f for meta, f in tree if meta.split()[1] == 'commit']
    rel = path[len(repo):].lstrip('/')
    under = lambda d: rel == d or rel.startswith(d + '/') or d == ''
    if any(under(n) for n in nested):
        return True
    ignored = [f.rpartition('/')[0] for f in files if f.rpartition('/')[2] == 'COLCON_IGNORE']
    return (f'{rel}/package.xml' if rel else 'package.xml') in files and not any(under(i) for i in ignored)


for p in pkgs:
    p['at_pin'] = at_pin(p['path'], p['repo'])

ignored = sorted(str(p.parent.relative_to(WS)) for p in (WS / 'src').rglob('COLCON_IGNORE')
                 if not any(x in p.parts for x in ('build', 'install', 'log')) and in_repo(str(p.parent.relative_to(WS))))
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({'release_head': run('git', 'rev-parse', '--short', 'HEAD').strip(), 'submodules': submodules,
                           'packages': pkgs, 'colcon_ignored': ignored,
                           'pin_count': sum(p['at_pin'] for p in pkgs)}, indent=1))
print(len(submodules), 'submodules,', len(pkgs), 'packages,', sum(p['at_pin'] for p in pkgs), 'at the pins; not at the pins:',
      [p['name'] for p in pkgs if not p['at_pin']], '; ignored:', ignored)
