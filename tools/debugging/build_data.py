#!/usr/bin/env python3
"""Build the Debugging chapter's data: the symptom finder and the bag figures.

    python3 -I tools/debugging/build_data.py

Reads tools/debugging/symptoms.yaml and public/data/debugging/bags.json (made by bag_stats.py) and writes
public/data/debugging/symptoms.json and public/data/debugging/bag_budget.json.

Every repo link in symptoms.yaml is checked against the local checkout of the branch the site links to: the file
must exist there and the cited lines must be inside it. A bad link stops the build.
"""
import json, os, subprocess, sys
import yaml

HOME = os.path.expanduser('~')
SITE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# key: (local repo, git ref to check, GitHub repo, branch in the link)
REPOS = {
    'release': (f'{HOME}/osu-uwrt/release', 'HEAD', 'riptide_release', 'master'),
    'launch': (f'{HOME}/osu-uwrt/release/src/riptide_launch', 'HEAD', 'riptide_launch', 'newsim'),
    'core': (f'{HOME}/osu-uwrt/release/src/riptide_core', 'HEAD', 'riptide_core', 'followpath-speed'),
    'control': (f'{HOME}/osu-uwrt/release/src/riptide_control', 'HEAD', 'riptide_control', 'mpc'),
    'perception': (f'{HOME}/osu-uwrt/release/src/riptide_perception', 'HEAD', 'riptide_perception', 'mapping-estimator'),
    'dvl': (f'{HOME}/osu-uwrt/release/src/nortek_dvl', 'HEAD', 'nortek_dvl', 'DvlWaterTrackFallback'),
    'nereus': (f'{HOME}/osu-uwrt/release/nereus', 'HEAD', 'nereus', 'main'),
    'firmware': (f'{HOME}/osu-uwrt/development/titan_firmware', 'origin/master', 'titan_firmware', 'master'),
    'setup': (f'{HOME}/osu-uwrt/riptide_setup', 'HEAD', 'riptide_setup', 'humble'),
}


def git_lines(repo, ref, path):
    r = subprocess.run(['git', '-C', repo, 'show', f'{ref}:{path}'], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f'missing: {repo} {ref}:{path}')
    return r.stdout.count('\n') + 1


def link(src):
    if len(src) == 2:                                   # [label, href], or [label, null] for a source with no public link
        return {'label': src[0], 'href': src[1]}
    label, key, path, lines = src
    if key == 'site':
        if not os.path.exists(os.path.join(SITE, path)):
            sys.exit(f'missing site file {path}')
        return {'label': label, 'href': f'https://github.com/zehdari/talos-explained/blob/main/{path}'}
    repo, ref, gh, branch = REPOS[key]
    n = git_lines(repo, ref, path)
    frag = ''
    if lines is not None:
        a, _, b = str(lines).partition('-')
        a, b = int(a), int(b or a)
        if not (1 <= a <= b <= n):
            sys.exit(f'lines {lines} outside {path} ({n} lines)')
        frag = f'#L{a}' + (f'-L{b}' if b != a else '')
        if path.endswith('.md'):                        # GitHub renders markdown; line anchors need the plain view
            frag = '?plain=1' + frag
    return {'label': label, 'href': f'https://github.com/osu-uwrt/{gh}/blob/{branch}/{path}{frag}'}


def symptoms():
    d = yaml.safe_load(open(os.path.join(SITE, 'tools/debugging/symptoms.yaml')))
    out = []
    for s in d['symptoms']:
        assert s['cat'] in d['categories'], s['id']
        out.append({k: s[k] for k in ('id', 'cat', 'symptom', 'cause', 'check')} | {'src': [link(x) for x in s['src']]})
    json.dump({'categories': d['categories'], 'symptoms': out},
              open(os.path.join(SITE, 'public/data/debugging/symptoms.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'{len(out)} symptoms, all links checked')


# Topic groups for the bag budget figure: label, members, where the numbers come from, ticked by default
GROUPS = [
    ('Fast IMU and FOG', ['/talos/vectornav/imu', '/talos/gyro/twist'], 'pool', True),
    ('EKF odometry', ['/talos/odometry/filtered'], 'pool', True),
    ('TF', ['/tf', '/tf_static'], 'pool', True),
    ('DVL and depth', ['/talos/dvl_twist', '/talos/depth/pose'], 'pool', True),
    ('MPC state, reference, disturbance', ['/talos/controller/mpc/state', '/talos/controller/mpc/reference',
                                           '/talos/controller/mpc/disturbance', '/talos/controller/mpc/solve_time_ms',
                                           '/talos/controller_debug_wrench', '/talos/controller/scale/trust'], 'pool', True),
    ('Thrust, RPM and ESC telemetry', ['/talos/thruster_forces', '/talos/command/requested_rpm',
                                       '/talos/state/thrusters/telemetry', '/talos/state/thrusters/rpm',
                                       '/talos/controller/linear', '/talos/controller/angular',
                                       '/talos/controller/identification/thrusters'], 'pool', True),
    ('Kill, enable and session flags', ['/talos/state/kill', '/talos/controller/motion_enabled',
                                        '/talos/pool_identify/done'], 'pool', True),
    ('Detections', ['/talos/detected_objects'], 'sim', False),
    ('Mapping estimates (every object)', ['re:^/talos/mapping/'], 'sim', False),
    ('Behaviour tree stack', ['/talos/autonomy/tree_stack'], 'sim', False),
    ('Detector point cloud', ['/talos/yolo_orientation/point_cloud'], 'sim', False),
    ('Annotated detector image', ['/talos/yolo_orientation/annotated/compressed'], 'sim', False),
]


def budget():
    bags = {b['name']: b for b in json.load(open(os.path.join(SITE, 'public/data/debugging/bags.json')))['bags']}
    groups = []
    for label, members, src, on in GROUPS:
        tops = bags[src]['topics']
        sel = [t for t in tops if any(t['topic'].startswith(m[3:].lstrip('^')) if m.startswith('re:') else t['topic'] == m
                                      for m in members)]
        assert sel, label
        groups.append({'label': label, 'src': src, 'on': on, 'bps': round(sum(t['bps'] for t in sel)),
                       'hz': [round(t['hz'], 1) for t in sel], 'topics': [t['topic'] for t in sel]})
    summary = {k: {'dir': b['dir'], 'duration_s': b['duration_s'], 'file_bytes': b['file_bytes'],
                   'messages': b['messages'], 'storage': b['storage']} for k, b in bags.items()}
    # Message ages for the time figure: robot bags only, stamped topics only
    ages = {}
    for k in ('pool', 'bench'):
        ages[k] = [{'topic': t['topic'], 'hz': t['hz'], **t['age']} for t in bags[k]['topics'] if 'age' in t]
    json.dump({'groups': groups, 'bags': summary, 'ages': ages},
              open(os.path.join(SITE, 'public/data/debugging/bag_budget.json'), 'w'), separators=(',', ':'))
    for g in groups:
        print(f"  {g['label']:36s} {g['bps'] / 1e3:8.1f} kB/s  {len(g['topics'])} topics ({g['src']})")


if __name__ == '__main__':
    symptoms()
    budget()
