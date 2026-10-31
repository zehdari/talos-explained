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
            'package': n['package'], 'launch': n['launch'], 'role': n['role'],
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
    edges = [{'from': a, 'to': b, 'via': sorted(set(v))} for (a, b), v in sorted(links.items())]
    data = {'captured': g['captured'], 'note': g['note'], 'nodes': nodes, 'topics': tout, 'edges': edges,
            'infra': sorted(INFRA)}
    (OUT / 'graph.json').write_text(json.dumps(data, separators=(',', ':')))
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
    pk = []
    for p in sorted((RELEASE / 'src').rglob('package.xml')):
        rel = p.relative_to(RELEASE / 'src')
        if any(part in ('build', 'install') for part in rel.parts) or rel.parts[0] in (
                'zed-ros2-wrapper', 'Universal_Robots_ROS2_Description'):
            continue
        x = p.read_text()
        name = re.search(r'<name>([^<]+)</name>', x).group(1)
        bt = re.search(r'<build_type>([^<]+)</build_type>', x)
        ignored = (p.parent / 'COLCON_IGNORE').exists()
        pk.append({'name': name, 'build_type': bt.group(1) if bt else None, 'folder': str(rel.parent),
                   'repo': rel.parts[0], 'ignored': ignored})
    (OUT / 'packages.json').write_text(json.dumps(pk, indent=1))
    c = Counter(p['build_type'] for p in pk if not p['ignored'])
    print(f'packages.json: {len(pk)} packages', dict(c))


if __name__ == '__main__':
    OUT.mkdir(parents=True, exist_ok=True)
    build_graph()
    build_interfaces()
    build_packages()
