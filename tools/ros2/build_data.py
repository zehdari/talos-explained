#!/usr/bin/env python3
"""Data for the ROS 2 chapter (ros2.html).

  graph.json       the explorer: Talos's ROS graph from the Nereus capture (public/data/rosgraph/), with
                   duplicate subscriptions folded into counts and node-to-node links worked out
  interfaces.json  every riptide_msgs2 message, service and action, parsed line by line from the release repo
  packages.json    each ROS package in the release workspace with its build type (package.xml)

Run from the repo root:  python3 tools/ros2/build_data.py
"""
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RG = ROOT / 'public/data/rosgraph'
OUT = ROOT / 'public/data/ros2'
RELEASE = Path.home() / 'osu-uwrt/release'
MSGS = RELEASE / 'src/riptide_core/riptide_msgs'

# Topics every node touches; they would link everything to everything, so they don't make node-to-node links.
INFRA = {'/clock', '/rosout', '/parameter_events', '/tf', '/tf_static', '/diagnostics', '/diagnostics_agg',
         '/events/write_split'}


# Corrections to rosgraph.json, checked against the launch files.
# actuator_service_translator.py is installed by riptide_hardware2 (riptide_core); autonomy.launch.py only starts it.
FIXES = {'/talos/ActuatorTranslator': {'package': 'riptide_hardware2: actuator_service_translator.py'}}

# Plainer roles than rosgraph.json's (arrows and frame names a new member doesn't know yet).
ROLES = {
    '/talos/depth_converter': 'Turns the camera cage board\'s raw pressure depth (state/depth/raw) into depth/pose for the EKF '
                              'and the MPC. In Nereus the simulator publishes depth/pose itself, so this node has nothing to '
                              'convert and stays idle.',
    '/talos/ekf_localization_node': 'EKF: fuses IMU, FOG, DVL and depth into odometry/filtered and the odom → base_link '
                                    'transform.',
    '/talos/odom_to_world_broadcaster': 'Fixed transform from world to odom.',
    '/talos/surface_frame_node': 'Fixed transform from the AprilTag to the estimated course origin.',
    '/talos/world_to_map': 'Publishes the fixed world → map transform. AprilTag calibration moves it through the '
                           'map/set_transform service and the map/model_tf action.',
    '/riptide_acoustics': 'Pinger acoustics: records the pinger\'s signal strength twice, each time between a '
                          'start_sample and a stop_sample call, then reports whether Talos was closer the first time.',
}

# Publishers that exist in the capture but sent nothing: their links say "idle in sim", not the topic's rate.
# depth_converter only publishes when state/depth/raw arrives (depth_converter.py), and in Nereus nothing publishes
# that: the simulator publishes depth/pose itself (nereus bridge.yaml, id: depth).
IDLE = {('/talos/depth/pose', '/talos/depth_converter')}
TOPIC_NOTES = {
    '/talos/depth/pose': 'On the robot depth_converter is its only publisher, made from the camera cage board\'s raw '
                         'pressure depth. In Nereus the simulator publishes it directly, so depth_converter stays idle.',
    '/talos/state/depth/raw': 'On the robot the camera cage board publishes it (titan_firmware CameraCageBB). Nereus '
                              'doesn\'t simulate it: the simulator publishes depth/pose instead.',
}


def short(name):
    return name[len('/talos/'):] if name.startswith('/talos/') else name.lstrip('/')


def fold(names):
    """['/talos/autonomy', '/talos/autonomy', '/x'] -> [['/talos/autonomy', 2], ['/x', 1]] in first-seen order."""
    c = Counter(names)
    seen, out = set(), []
    for n in names:
        if n not in seen:
            seen.add(n)
            out.append([n, c[n]])
    return out


def build_graph():
    g = json.loads((RG / 'rosgraph.json').read_text())
    topics = json.loads((RG / 'topics.json').read_text())['topics']
    nodes = []
    hidden = set()
    for n in g['nodes']:
        name = n['node']
        if n['group'] == 'internal':
            hidden.add(name)
            continue
        def iface(key):
            return [[k, v] for k, v in Counter((x['name'], x['type']) for x in n[key]).items()]
        nodes.append({
            'id': name, 'label': name.rsplit('/', 1)[-1], 'group': n['group'], 'runs': n['runs'],
            'package': FIXES.get(name, {}).get('package', n['package']), 'launch': n['launch'], 'role': ROLES.get(name, n['role']),
            'pub': [[t, c] for (t, _), c in iface('publishers')],
            'sub': [[t, c] for (t, _), c in iface('subscribers')],
            'srv': [[s, ty] for (s, ty), _ in iface('services')],
            'cli': [[s, ty] for (s, ty), _ in iface('clients')],
            'asrv': [[s, ty] for (s, ty), _ in iface('action_servers')],
            'acli': [[s, ty] for (s, ty), _ in iface('action_clients')],
        })
    # node ids are full names; topics.json uses node base names in pub/sub lists? check
    ids = {n['id'] for n in nodes}
    base = defaultdict(list)
    for n in g['nodes']:
        base[n['node'].rsplit('/', 1)[-1]].append(n['node'])
    tout = []
    for t in topics:
        def full(lst):
            res = []
            for p in lst:
                res.append(p if p.startswith('/') else (base[p][0] if len(base[p]) == 1 else p))
            return [x for x in res if x not in hidden]
        tout.append({
            'name': t['topic'], 'type': t['type'], 'hz': t['rate_hz'], 'hz2': t['rate_hz_pass2'],
            'cfg': t['sim_configured_hz'], 'bytes': t['mean_bytes'], 'latched': t['latched'],
            'sim': t['sim_only'], 'qos': t['publisher_qos'],
            'pubs': fold(full(t['publishers'])), 'subs': fold(full(t['subscribers'])),
            **({'note': TOPIC_NOTES[t['topic']]} if t['topic'] in TOPIC_NOTES else {}),
            **({'idle': [p for (tn, p) in IDLE if tn == t['topic']]} if any(tn == t['topic'] for tn, _ in IDLE) else {}),
        })
    # node-to-node links through data topics
    links = defaultdict(list)
    for t in tout:
        if t['name'] in INFRA:
            continue
        for p, _ in t['pubs']:
            for s, _ in t['subs']:
                if p != s and p in ids and s in ids:
                    links[(p, s)].append(t['name'])
    # services and actions link client -> server too
    servers = defaultdict(list)
    for n in nodes:
        for s, ty in n['srv'] + n['asrv']:
            servers[s].append(n['id'])
    for n in nodes:
        for s, ty in n['cli'] + n['acli']:
            if s.endswith(('/get_parameters', '/set_parameters', '/list_parameters', '/describe_parameters',
                           '/get_parameter_types', '/set_parameters_atomically')):
                continue
            for srv in servers.get(s, []):
                if srv != n['id']:
                    links[(n['id'], srv)].append(s)
    edges = []
    for (a, b), v in sorted(links.items()):
        e = {'from': a, 'to': b, 'via': sorted(set(v))}
        idle = [x for x in e['via'] if (x, a) in IDLE]
        if idle:
            e['idle'] = idle
        edges.append(e)
    data = {'captured': g['captured'], 'note': g['note'], 'nodes': nodes, 'topics': tout, 'edges': edges,
            'infra': sorted(INFRA)}
    text = json.dumps(data, separators=(',', ':'))
    # doTask names its bag trigger after the computer it runs on ("/" + hostname + ...): show it generically,
    # not as the capture machine's name.
    text = re.sub(r'/(?!talos/)[A-Za-z0-9_\-]+/autonomy/bag_trigger', '/<hostname>/autonomy/bag_trigger', text)
    (OUT / 'graph.json').write_text(text)
    print(f'graph.json: {len(nodes)} nodes, {len(tout)} topics, {len(edges)} links')


LINE = re.compile(r'^\s*([A-Za-z_][\w/]*)(\[(\d*)\])?\s+([A-Za-z_]\w*)\s*(=\s*(.+?))?\s*(#.*)?$')


def parse_interface(path):
    lines = []
    for raw in path.read_text().splitlines():
        s = raw.rstrip()
        if not s.strip():
            lines.append({'k': 'blank', 't': ''})
        elif s.strip() == '---':
            lines.append({'k': 'sep', 't': '---'})
        elif s.lstrip().startswith('#'):
            lines.append({'k': 'comment', 't': s})
        else:
            m = LINE.match(s)
            if not m:
                lines.append({'k': 'other', 't': s})
                continue
            typ, arr, size, name, _, value, comment = m.groups()
            d = {'k': 'const' if value is not None else 'field', 't': s, 'type': typ, 'name': name}
            if arr is not None:
                d['array'] = size or ''
            if value is not None:
                d['value'] = value
            if comment:
                d['comment'] = comment
            lines.append(d)
    return lines


def build_interfaces():
    out = []
    for kind, ext in (('msg', '.msg'), ('srv', '.srv'), ('action', '.action')):
        for p in sorted((MSGS / kind).glob('*' + ext)):
            out.append({'kind': kind, 'name': p.stem, 'path': f'riptide_msgs/{kind}/{p.name}',
                        'lines': parse_interface(p)})
    (OUT / 'interfaces.json').write_text(json.dumps(out, separators=(',', ':')))
    print(f'interfaces.json: {len(out)} interfaces')


def build_packages():
    """Packages committed to the release repo's submodules (git ls-files, so untracked local folders don't count).
    The ZED wrapper and the UR description are cloned next to them, not submodules, so they are left out."""
    import subprocess
    subs = re.findall(r'path = src/(\S+)', (RELEASE / '.gitmodules').read_text())
    pk = []
    for repo in sorted(subs):
        d = RELEASE / 'src' / repo
        files = subprocess.run(['git', '-C', str(d), 'ls-files'], capture_output=True, text=True).stdout.split()
        for f in sorted(x for x in files if x == 'package.xml' or x.endswith('/package.xml')):
            p = d / f
            x = p.read_text()
            name = re.search(r'<name>([^<]+)</name>', x).group(1)
            bt = re.search(r'<build_type>([^<]+)</build_type>', x)
            ignored = (p.parent / 'COLCON_IGNORE').exists()
            pk.append({'name': name, 'build_type': bt.group(1) if bt else None,
                       'folder': str(p.parent.relative_to(RELEASE / 'src')), 'repo': repo, 'ignored': ignored})
    (OUT / 'packages.json').write_text(json.dumps(pk, indent=1))
    c = Counter(p['build_type'] for p in pk if not p['ignored'])
    print(f'packages.json: {len(pk)} packages in {len(subs)} submodules; built:', dict(c))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    build_graph()
    build_interfaces()
    build_packages()
