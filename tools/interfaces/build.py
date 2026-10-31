#!/usr/bin/env python3
"""Build the Interfaces appendix data: public/data/interfaces/interfaces.json.

    python3 -I tools/interfaces/build.py

Merges, without needing ROS:
  - the Nereus full-stack capture (public/data/rosgraph: rosgraph.json, topics.json, tf.json, params_*.json),
  - the real robot's extra nodes and topics from tools/interfaces/curated.yaml (read from the code),
  - the micro-ROS firmware topics, parsed from titan_firmware master talos/<Board>/src/*.c (QoS from
    rclc_*_init_default / _best_effort),
  - measured robot rates from the 2026-10-26 pool bag (public/data/debugging/bags.json, "pool"),
  - "explained in" links found by scanning every chapter's HTML for <code>name</code> under an <h2 id>.
GitHub links point at the branch in use; line numbers are looked up in the local clones with `git show <ref>:<path>`.
"""
import fnmatch, glob, html, json, os, re, subprocess, sys
import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(os.path.join(HERE, '..', '..'))
DATA = os.path.join(SITE, 'public', 'data')
CUR = yaml.safe_load(open(os.path.join(HERE, 'curated.yaml')))
REPOS = CUR['repos']

# ---------------------------------------------------------------- git helpers
_files, _trees = {}, {}


def git_show(repo, path, ref=None):
    r = REPOS[repo]
    ref = ref or r['ref']
    key = (repo, ref, path)
    if key not in _files:
        try:
            _files[key] = subprocess.run(['git', '-C', os.path.expanduser(r['local']), 'show', f'{ref}:{path}'],
                                         capture_output=True, text=True, check=True).stdout
        except subprocess.CalledProcessError:
            _files[key] = None
    return _files[key]


def git_tree(repo):
    if repo not in _trees:
        r = REPOS[repo]
        out = subprocess.run(['git', '-C', os.path.expanduser(r['local']), 'ls-tree', '-r', '--name-only', r['ref']],
                             capture_output=True, text=True, check=True).stdout
        _trees[repo] = out.split('\n')
    return _trees[repo]


def expand(repo, pats):
    """Expand globs ('src/**/*.cpp') against the repo's tree at its ref."""
    out = []
    for p in pats:
        if any(c in p for c in '*?['):
            out += [f for f in git_tree(repo) if fnmatch.fnmatch(f, p)]
        else:
            out.append(p)
    return out


def gh(repo, path, line=None, branch=None):
    r = REPOS[repo]
    u = f"https://github.com/{r['gh']}/blob/{branch or r['branch']}/{path}"
    return u + (f'#L{line}' if line else '')


def find_line(repo, path, regex, ref=None):
    txt = git_show(repo, path, ref)
    if not txt:
        return None
    rx = re.compile(regex)
    for i, ln in enumerate(txt.split('\n'), 1):
        if rx.search(ln):
            return i
    return None


def split_ref(spec, default_repo):
    """'repo:path' or 'path' -> (repo, path)."""
    if ':' in spec and spec.split(':', 1)[0] in REPOS:
        return spec.split(':', 1)
    return default_repo, spec


def code_link(repo, files, name, node_id=None):
    """Link to the line in a node's files that names this topic/service; falls back to the first file."""
    rel = name.lstrip('/')
    pats = [rf'["\']/?(talos/)?{re.escape(rel)}["\']']
    if node_id and rel.startswith(node_id + '/'):
        pats.append(rf'["\']~/{re.escape(rel[len(node_id) + 1:])}["\']')
    pats.append(rf'(topic|service|action|_topic|_service|_action|status_topic|command_topic):\s*/?{re.escape(rel)}\s*(#|$|,|\}})')
    for pat in pats:
        for f in expand(repo, files):
            ln = find_line(repo, f, pat)
            if ln:
                return gh(repo, f, ln)
    fs = expand(repo, files)
    return gh(repo, fs[0]) if fs else None


# ---------------------------------------------------------------- inputs
rg = json.load(open(os.path.join(DATA, 'rosgraph', 'rosgraph.json')))
tp = json.load(open(os.path.join(DATA, 'rosgraph', 'topics.json')))
tfj = json.load(open(os.path.join(DATA, 'rosgraph', 'tf.json')))
fw = json.load(open(os.path.join(DATA, 'firmware', 'firmware.json')))
bags = {b['name']: b for b in json.load(open(os.path.join(DATA, 'debugging', 'bags.json')))['bags']}
pool = {t['topic']: t for t in bags['pool']['topics']}

NS = '/talos/'
HOST_TRIGGER = '/<hostname>/autonomy/bag_trigger'


def rel(name):
    """Fully qualified -> the key used on the page: relative to /talos/, else absolute."""
    if name.startswith(NS):
        return name[len(NS):]
    if name.endswith('/autonomy/bag_trigger'):
        return HOST_TRIGGER
    return name


def node_key(fq):
    return fq[len(NS):] if fq.startswith(NS) else fq.lstrip('/')


SUBS = {s['id']: s for s in CUR['subsystems']}


def subsystem_of(name):
    for pre, sid in CUR['subsystem_rules']:
        if name.startswith(pre):
            return sid
    return 'power'


def chapter_rule(name):
    for pre, ch in CUR['chapter_rules']:
        if name.startswith(pre):
            return ch
    return None


# ---------------------------------------------------------------- nodes
nodes = {}
SKIP_NODE = re.compile(r'transform_listener_impl|^launch_ros')
side_of_group = {'simulator': 'sim', 'operator': 'laptop'}

for n in rg['nodes']:
    k = node_key(n['node'])
    if SKIP_NODE.search(k):
        continue
    meta = CUR['node_meta'].get(k, {})
    node = {
        'id': k, 'fq': n['node'], 'package': meta.get('package', n['package']), 'sub': None,
        'side': side_of_group.get(n['group'], 'stack'), 'group': n['group'], 'role': n['role'],
        'launch': n['launch'], 'chapter': meta.get('chapter'), 'repo': meta.get('repo'), 'files': meta.get('files', []),
        'config': [], 'dump': meta.get('dump'), 'status': meta.get('status'),
    }
    if meta.get('launch'):
        lr, lp = meta['launch']
        node['launch'] = gh(lr, lp)
    for c in meta.get('config', []):
        r, p = split_ref(c, meta['repo'])
        node['config'].append({'label': '/'.join(p.split('/')[-2:]), 'path': (r + '/' + p) if r in ('riptide_autonomy', 'nereus') else p, 'url': gh(r, p)})
    if meta.get('files'):
        fs = expand(meta['repo'], meta['files'])
        node['source'] = gh(meta['repo'], fs[0]) if fs else None
    nodes[k] = node

for rn in CUR['robot_nodes']:
    k = rn['id']
    node = {
        'id': k, 'fq': rn['fq'], 'package': rn['package'], 'sub': rn['sub'], 'side': rn['side'], 'role': rn['role'],
        'chapter': rn.get('chapter'), 'repo': rn['repo'], 'files': rn.get('files', []), 'config': [],
        'status': rn.get('status'), 'launch': gh(rn['repo'], rn['launch']) if rn.get('launch') else None,
    }
    for c in rn.get('config', []):
        r, p = split_ref(c, rn['repo'])
        node['config'].append({'label': '/'.join(p.split('/')[-2:]), 'path': (r + '/' + p) if r in ('riptide_autonomy', 'nereus') else p, 'url': gh(r, p)})
    fs = expand(rn['repo'], rn.get('files', []))
    node['source'] = gh(rn['repo'], fs[0]) if fs else None
    nodes[k] = node

# ---------------------------------------------------------------- interfaces
items = {}   # (kind, name) -> item


def item(kind, name, typ=None):
    key = (kind, name)
    if key not in items:
        items[key] = {'kind': kind, 'name': name, 'types': [], 'pubs': [], 'subs': [], 'qos': [], 'latched': False}
    it = items[key]
    if typ and typ not in it['types']:
        it['types'].append(typ)
    return it


def add_end(it, role, node_id, count=1, link=None, side=None):
    lst = it[role]
    for e in lst:
        if e['n'] == node_id:
            e['c'] = max(e['c'], count)
            if link and not e.get('code'):
                e['code'] = link
            return
    e = {'n': node_id, 'c': count}
    if link:
        e['code'] = link
    if side:
        e['side'] = side
    lst.append(e)


def node_code(node_id, name):
    nd = nodes.get(node_id)
    if not nd or not nd.get('repo') or not nd.get('files'):
        return None
    return code_link(nd['repo'], nd['files'], name, node_id)


# topics from the capture
for t in tp['topics']:
    name = rel(t['topic'])
    it = item('topic', name, t['type'])
    from collections import Counter
    for role, key in (('pubs', 'publishers'), ('subs', 'subscribers')):
        for nfq, c in Counter(t[key]).items():
            k = node_key(nfq)
            if SKIP_NODE.search(k) or k not in nodes:
                continue
            add_end(it, role, k, c, node_code(k, name if name != HOST_TRIGGER else 'autonomy/bag_trigger'))
    for q in t['publisher_qos'] or []:
        if q not in it['qos']:
            it['qos'].append(q)
    it['latched'] = it['latched'] or t['latched']
    rs = [x for x in (t['rate_hz'], t['rate_hz_pass2']) if x is not None]
    if rs:
        it['sim_hz'] = [t['rate_hz'], t['rate_hz_pass2']]
    if t['sim_configured_hz'] is not None:
        it['sim_cfg_hz'] = t['sim_configured_hz']
    if t.get('mean_bytes'):
        it['bytes'] = t['mean_bytes']

# services and actions from the capture
PARAM_SRV = re.compile(r'/(describe_parameters|get_parameter_types|get_parameters|list_parameters|set_parameters|set_parameters_atomically)$')
param_clients = {}
for n in rg['nodes']:
    k = node_key(n['node'])
    if SKIP_NODE.search(k) or k not in nodes:
        continue
    for kind, role, key in (('service', 'pubs', 'services'), ('service', 'subs', 'clients'),
                            ('action', 'pubs', 'action_servers'), ('action', 'subs', 'action_clients')):
        for s in n[key]:
            if PARAM_SRV.search(s['name']) or '/_container/' in s['name']:
                if PARAM_SRV.search(s['name']) and key == 'clients' and s['name'].startswith(NS):
                    param_clients.setdefault(k, set()).add(s['name'][len(NS):].rsplit('/', 1)[0])
                continue
            it = item(kind, rel(s['name']), s['type'])
            add_end(it, role, k, 1, node_code(k, rel(s['name'])))

# the robot's own nodes
for rn in CUR['robot_nodes']:
    k = rn['id']
    for name, typ, *q in rn.get('pubs', []):
        it = item('topic', name, typ)
        add_end(it, 'pubs', k, 1, node_code(k, name))
        if q and q[0] and q[0] not in it['qos']:
            it['qos'].append(q[0])
    for name, typ in rn.get('subs', []):
        add_end(item('topic', name, typ), 'subs', k, 1, node_code(k, name))
    for name, typ in rn.get('services', []):
        add_end(item('service', name, typ), 'pubs', k, 1, node_code(k, name))
    for name, typ in rn.get('clients', []):
        add_end(item('service', name, typ), 'subs', k, 1, node_code(k, name))
    for name, typ in rn.get('actions', []):
        add_end(item('action', name, typ), 'pubs', k, 1, node_code(k, name))

# ---------------------------------------------------------------- firmware (micro-ROS)
INIT = re.compile(r'rclc_(publisher|subscription)_init(?:_(default|best_effort))?\s*\(\s*&?\s*[\w.\[\]>-]+\s*,\s*&?\s*\w+\s*,'
                  r'\s*ROSIDL_GET_MSG_TYPE_SUPPORT\(\s*(\w+)\s*,\s*msg\s*,\s*(\w+)\s*\)\s*,\s*([\w"/]+)\s*(?:,\s*&?\s*(\w+)\s*)?\)', re.S)
DEFINE = re.compile(r'#define\s+(\w+)\s+"([^"]+)"')
fw_projects = {p['id']: p for p in fw['projects']}


def parse_board(dirpath, ref=None, repo='titan_firmware'):
    files = [f for f in git_tree(repo) if f.startswith(dirpath + '/') and f.endswith('.c')] if not ref else [dirpath]
    defs, found = {}, []
    for f in files:
        txt = git_show(repo, f, ref) or ''
        for m in DEFINE.finditer(txt):
            ln = txt[:m.start()].count('\n') + 1
            defs.setdefault(m.group(1), {})[f] = (m.group(2), f, ln)
    for f in files:
        txt = git_show(repo, f, ref) or ''
        for m in INIT.finditer(txt):
            kind, qos, pkg, msg, topic, prof = m.groups()
            if topic.startswith('"'):
                tname, tf_, tl = topic.strip('"'), f, txt[:m.start()].count('\n') + 1
            elif topic in defs:
                tname, tf_, tl = defs[topic].get(f) or next(iter(defs[topic].values()))
            else:
                continue
            be = qos == 'best_effort' or (prof or '').endswith('sensor_data')
            found.append({'kind': kind, 'qos': 'best_effort/volatile' if be else 'reliable/volatile',
                          'type': f'{pkg}/msg/{msg}', 'name': tname, 'file': tf_, 'line': tl})
    return found


board_rows = []
for b in CUR['boards']:
    k = b['id']
    p = fw_projects[b['firmware_id']]
    nodes[k] = {
        'id': k, 'fq': b['node'], 'package': f"titan_firmware: talos/{b['dir']}", 'sub': 'power', 'side': 'board',
        'role': f"{b['label']} firmware (RP2040, micro-ROS over CAN through copro_agent).",
        'chapter': b['chapter'], 'status': b.get('status'),
        'source': gh('titan_firmware', f"talos/{b['dir']}/src/ros.c"), 'launch': None, 'config': [], 'repo': 'titan_firmware',
    }
    if b['id'] == 'smart_battery':
        nodes[k]['role'] = ('Smart battery housing firmware, on the external CAN bus (can1). Its micro-ROS agent is '
                            'commented out in copro_agent.launch.py, so these topics don\'t reach ROS right now.')
    for e in parse_board(f"talos/{b['dir']}"):
        it = item('topic', e['name'], e['type'].replace('/msg/', '/msg/'))
        add_end(it, 'pubs' if e['kind'] == 'publisher' else 'subs', k, 1, gh('titan_firmware', e['file'], e['line']))
        if e['kind'] == 'publisher' and e['qos'] not in it['qos']:
            it['qos'].append(e['qos'])
    # cross-check with firmware.json (built from the same sources by the Firmware chapter)
    got = {(x['name']) for x in parse_board(f"talos/{b['dir']}")}
    want = {x['topic'] for x in p['publishes'] + p['subscribes']}
    if got != want:
        print(f"  note: {b['dir']}: parsed {sorted(got - want)} extra, {sorted(want - got)} missing vs firmware.json",
              file=sys.stderr)

# IVCBoard2 pinger topics (titan_firmware blake/ivc)
iv = CUR['ivc2']
nodes['ivc_board2'] = {
    'id': 'ivc_board2', 'fq': '/talos/ivc_board', 'package': 'titan_firmware: talos/IVCBoard2 (branch blake/ivc)',
    'sub': 'acoustics', 'side': 'board', 'repo': 'titan_firmware', 'config': [], 'launch': None,
    'role': 'IVC board firmware with the pinger listening mode (IVCBoard2, on branch blake/ivc).',
    'chapter': 'sensors.html#acoustics', 'source': gh('titan_firmware', iv['path'], branch=iv['branch']),
}
for role, lst in (('pubs', iv['pubs']), ('subs', iv['subs'])):
    for name, typ in lst:
        ln = find_line('titan_firmware', iv['path'], rf'"{re.escape(name)}"', ref=iv['ref'])
        add_end(item('topic', name, typ), role, 'ivc_board2', 1, gh('titan_firmware', iv['path'], ln, branch=iv['branch']))

# ---------------------------------------------------------------- sides, rates, chapters
SIDE_ROBOT = {'stack', 'laptop', 'robot', 'board', 'tool'}
SIDE_SIM = {'stack', 'laptop', 'sim'}


def avail(it):
    def sides(lst):
        r = any(nodes[e['n']]['side'] in SIDE_ROBOT for e in lst)
        s = any(nodes[e['n']]['side'] in SIDE_SIM for e in lst)
        return r, s
    r, s = sides(it['pubs'])
    if not it['pubs']:
        r, s = sides(it['subs'])
        it['nopub'] = True
    if not it['subs'] and it['kind'] == 'topic':
        it['nosub'] = True
    return 'both' if r and s else 'robot' if r else 'sim'


robot_rates = {r[0]: r for r in CUR['robot_rates']}
for it in items.values():
    it['avail'] = avail(it)
    it['sub'] = subsystem_of(it['name'])
    if it['name'] == HOST_TRIGGER:
        it['sub'] = 'autonomy'
    it['note'] = CUR['notes'].get(it['name'], '')
    full = it['name'] if it['name'].startswith('/') else NS + it['name']
    if it['kind'] == 'topic' and full in pool:
        it['robot_hz'] = {'hz': pool[full]['hz'], 'how': 'pool bag'}
    elif it['kind'] == 'topic' and it['name'] in robot_rates:
        _, hz, why, repo, path, pat = robot_rates[it['name']]
        ln = find_line(repo, path, re.escape(pat))
        it['robot_hz'] = {'hz': hz, 'how': why, 'url': gh(repo, path, ln)}
    # the one source link for the row: a robot-stack publisher/server first, then anything
    order = sorted(it['pubs'], key=lambda e: {'stack': 0, 'robot': 1, 'board': 2, 'laptop': 3, 'tool': 4, 'sim': 5}[nodes[e['n']]['side']])
    src = next((e['code'] for e in order if e.get('code')), None)
    if not src:
        src = next((e['code'] for e in it['subs'] if e.get('code')), None)
    it['src'] = src

# special notes on duplicated names
for nm in ('command/actuator/arm', 'command/actuator/torpedo', 'command/actuator/dropper', 'command/actuator/notify_reload'):
    if ('service', nm) in items:
        items[('service', nm)]['note'] = ('Served by actuator_service_translator, which publishes the topic of the same name '
                                          'and waits for state/actuator/cmd_status. In Nereus the simulator serves it too.')
if ('service', 'command/actuator/claw') in items:
    items[('service', 'command/actuator/claw')]['note'] = 'Nereus only: open (true) or close (false) the claw as a service.'

# ---------------------------------------------------------------- collapse mapping/<object>
obj_topics = sorted(k for k in items if k[0] == 'topic' and k[1].startswith('mapping/')
                    and items[k]['types'] == ['geometry_msgs/msg/PoseWithCovarianceStamped']
                    and [e['n'] for e in items[k]['pubs']] == ['riptide_mapping2'])
objs = [k[1].split('/', 1)[1] for k in obj_topics]
if obj_topics:
    first = items[obj_topics[0]]
    hz = [items[k].get('sim_hz', [None, None]) for k in obj_topics]
    grp = dict(first, name='mapping/<object>', objects=objs, aliases=[k[1] for k in obj_topics],
               note=(f'One pose per course object ({len(objs)} in the capture), with its covariance, in map. The same '
                     'estimates are on /tf as <object>_frame.'),
               sim_hz=[min(h[0] for h in hz if h[0] is not None), max(h[0] for h in hz if h[0] is not None)],
               sim_hz_range=True)
    grp['src'] = code_link('riptide_perception', ['riptide_mapping/riptide_mapping2/mapping.py'], 'mapping/')
    ln = find_line('riptide_perception', 'riptide_mapping/riptide_mapping2/mapping.py', r'mapping/')
    grp['src'] = gh('riptide_perception', 'riptide_mapping/riptide_mapping2/mapping.py', ln)
    for k in obj_topics:
        del items[k]
    items[('topic', 'mapping/<object>')] = grp

# ---------------------------------------------------------------- TF frames
COURSE_ROOTS = {'map'}
frames = []


def frame_pub(p, c, static):
    if (p, c) == ('world', 'odom'):
        return ['odom_to_world_broadcaster'], 'both'
    if (p, c) == ('world', 'map'):
        return ['world_to_map'], 'both'
    if (p, c) == ('odom', 'talos/base_link'):
        return ['ekf_localization_node'], 'both'
    if p == 'world' and c.startswith('simulator/') or p.startswith('simulator/'):
        return ['physics_simulator'], 'sim'
    if re.match(r'talos/(ffc|dfc)_(camera_link|left_camera_optical_frame)$', p) and 'optical' in c:
        return ['physics_simulator'], 'sim'
    if p == 'tag36h11:0':
        return ['surface_frame_node'], 'both'
    if p.startswith('talos/'):
        return ['robot_state_publisher'], 'both'
    return ['riptide_mapping2'], 'both'


course = []
for e in tfj['edges']:
    p, c = e['parent'], e['child']
    pubs, av = frame_pub(p, c, e['static'])
    row = {'kind': 'frame', 'name': c, 'parent': p, 'static': e['static'], 'sim_hz': e.get('rate_hz'),
           'xyz': e['sample']['xyz'], 'quat': e['sample']['quat_xyzw'], 'pubs': [{'n': x, 'c': 1} for x in pubs],
           'subs': [], 'avail': av, 'types': [], 'qos': []}
    if pubs == ['riptide_mapping2']:
        course.append(row)
        continue
    frames.append(row)

# robot-only: the ZED description's frames (zed_macro.urdf.xacro, model zedxm) under each camera link
for cam in ('ffc', 'dfc'):
    b = f'talos/{cam}'
    for p, c in ((f'{b}_camera_link', f'{b}_camera_center'), (f'{b}_camera_center', f'{b}_left_camera_frame'),
                 (f'{b}_left_camera_frame', f'{b}_left_camera_optical_frame'), (f'{b}_camera_center', f'{b}_right_camera_frame'),
                 (f'{b}_right_camera_frame', f'{b}_right_camera_optical_frame')):
        frames.append({'kind': 'frame', 'name': c, 'parent': p, 'static': True, 'pubs': [{'n': 'zed_state_publisher', 'c': 1}],
                       'subs': [], 'avail': 'robot', 'types': [], 'qos': [],
                       'note': 'On the robot the ZED description adds the lens frames; in Nereus the bridge publishes the optical frames straight under the camera link.'})
frames.append({'kind': 'frame', 'name': 'tag36h11:0', 'parent': 'talos/ffc_left_camera_optical_frame', 'static': False,
               'pubs': [{'n': 'apriltag_36h11', 'c': 1}], 'subs': [], 'avail': 'both', 'types': [], 'qos': [],
               'note': 'The AprilTag board as the forward camera sees it; published only while the tag is in view (not in the capture).'})
frames.append({'kind': 'frame', 'name': 'ghost/base_link', 'parent': "the viewer's fixed frame", 'static': False,
               'pubs': [{'n': 'viewer_panels', 'c': 1}], 'subs': [], 'avail': 'both', 'types': [], 'qos': [],
               'note': "The viewer's current motion command as a frame (setpoint_frame in talos_uwrt_panels.yaml), published while it has a fresh command."})
if course:
    names = sorted({r['name'] for r in course})
    frames.append({'kind': 'frame', 'name': '<object>_frame', 'parent': 'map → offset → …', 'static': False,
                   'sim_hz': course[0].get('sim_hz'), 'pubs': [{'n': 'riptide_mapping2', 'c': 1}], 'subs': [],
                   'avail': 'both', 'types': [], 'qos': [], 'objects': names, 'aliases': names,
                   'tree': [[r['parent'], r['name']] for r in course],
                   'note': (f'Mapping\'s course: map → offset → one frame per object, some nested (gate → gate_repair_frame). '
                            f'{len(names)} frames in the capture, all on /tf.')})

# One row per child frame: where Talos and Nereus give a frame different parents, keep both.
merged = {}
for f in frames:
    c = f['name']
    if c in merged:
        g = merged[c]
        if 'alt' not in g:
            g['alt'] = [{'parent': g['parent'], 'pubs': g['pubs'], 'avail': g['avail'], 'static': g['static']}]
        g['alt'].append({'parent': f['parent'], 'pubs': f['pubs'], 'avail': f['avail'], 'static': f['static']})
        # Talos first
        g['alt'].sort(key=lambda x: x['avail'] != 'robot')
        g['parent'] = ' / '.join(x['parent'] for x in g['alt'])
        g['pubs'] = [p for x in g['alt'] for p in x['pubs']]
        g['avail'] = 'both'
        g['note'] = f.get('note') or g.get('note', '')
    else:
        merged[c] = f
frames = list(merged.values())

FRAME_NOTES = {
    'odom': 'Fixed to world (identity). The EKF\'s pose is relative to odom.',
    'map': 'The course map\'s origin. Tag calibration moves world → map.',
    'talos/base_link': 'The body. x forward, y to port, z up.',
    'talos/origin': 'CAD datum all sensor poses are measured from.',
    'estimated_origin_frame': 'Where the map origin sits relative to the AprilTag board.',
    'simulator/talos/base_link': 'Nereus truth: where Talos really is.',
    'talos/imu_link': 'The IMU, mounted upside down and turned −90° (talos.yaml). The EKF rotates its messages into base_link through this frame.',
    'talos/dvl_link': 'The DVL, turned −45° and below base_link. On /tf rather than /tf_static (a zero-range revolute joint), so a tool that reads only /tf_static won\'t find it.',
    'talos/fog_link': 'The fibre-optic gyro. Its pose is all zeros: only the axis matters for a rate.',
    'talos/pressure_link': 'The depth sensor. depth_converter uses this offset to report base_link\'s depth.',
    'talos/ffc_camera_link': 'Forward camera mount, from talos.yaml. On Talos the ZED description continues below it; in Nereus the bridge adds the optical frame.',
    'talos/dfc_camera_link': 'Down camera mount, from talos.yaml. On Talos the ZED description continues below it; in Nereus the bridge adds the optical frame.',
    'talos/ffc_left_camera_optical_frame': 'Forward images are stamped in this frame (z out of the lens, x right, y down).',
    'talos/dfc_left_camera_optical_frame': 'Down images are stamped in this frame (z out of the lens, x right, y down).',
    'world': 'The fixed root: the pool in Nereus.',
}
for i, nm in enumerate(['VUS', 'VUP', 'HUS', 'HUP', 'HLS', 'HLP', 'VLS', 'VLP']):
    FRAME_NOTES[f'talos/thruster_{i}'] = (f'Thruster {i}, {nm} (the order of talos.yaml\'s thruster list, which the MPC also uses). '
                                          'A continuous joint, so it is sent on /tf.')
for t in ('torpedo_link', 'torpedo_0_link', 'torpedo_1_link', 'droppers_link', 'claw_link', 'magnet_link', 'poker_link', 'hitch_link'):
    FRAME_NOTES[f'talos/{t}'] = 'A tool frame from talos.yaml (where a torpedo, marker, the claw or a magnet leaves the robot or grips).'
for f in frames:
    f.setdefault('note', FRAME_NOTES.get(f['name'], ''))
    if f.get('alt'):
        t, n = f['alt'][0]['parent'], f['alt'][1]['parent']
        f['note'] = (FRAME_NOTES.get(f['name'], '') + f' On Talos its parent is {t} (the ZED description); '
                     f'in Nereus it is {n} (the bridge).').strip()
    f['sub'] = 'simulator' if f['name'].startswith('simulator/') else 'mapping' if f['name'] in ('map', '<object>_frame', 'tag36h11:0', 'estimated_origin_frame') else 'estimation'
    pn = f['pubs'][0]['n']
    nd = nodes.get(pn, {})
    f['src'] = nd.get('source')
    if pn == 'robot_state_publisher':
        f['src'] = gh('riptide_core', 'riptide_descriptions/config/talos.yaml')
    if pn == 'physics_simulator':
        ln = find_line('nereus', 'content/packs/bridges/uwrt_talos/bridge.yaml', rf'child: {re.escape(f["name"])}\b')
        f['src'] = gh('nereus', 'content/packs/bridges/uwrt_talos/bridge.yaml', ln)
    if pn == 'zed_state_publisher':
        ln = find_line('zed_wrapper', 'zed_wrapper/urdf/zed_macro.urdf.xacro', rf'link name="\$\{{name\}}_{re.escape(f["name"].split("_", 1)[1])}"')
        f['src'] = gh('zed_wrapper', 'zed_wrapper/urdf/zed_macro.urdf.xacro', ln)

# ---------------------------------------------------------------- chapter mentions
site_js = open(os.path.join(SITE, 'src', 'site.js')).read()
TITLES = dict(re.findall(r"href: '([^']+)', title: (?:'([^']*)'|\"([^\"]*)\")", site_js) and
              [(h, a or b) for h, a, b in re.findall(r"href: '([^']+)', title: (?:'([^']*)'|\"([^\"]*)\")", site_js)])
pages = sorted(glob.glob(os.path.join(SITE, '*.html')) + glob.glob(os.path.join(SITE, 'perception', '*.html'))
               + glob.glob(os.path.join(SITE, 'control', '*.html')))
CODE = re.compile(r'<code>([^<]{2,120})</code>')
H2 = re.compile(r'<h2 id="([^"]+)"[^>]*>(.*?)</h2>', re.S)
mentions = {}   # name -> list of (href#id)
sections = {}   # href#id -> section title
for pth in pages:
    href = os.path.relpath(pth, SITE)
    if href in ('interfaces.html', 'glossary.html') or href not in TITLES:
        continue
    txt = open(pth).read()
    heads = [(m.start(), m.group(1), re.sub(r'<[^>]+>', '', m.group(2)).strip()) for m in H2.finditer(txt)]
    for m in CODE.finditer(txt):
        v = html.unescape(m.group(1)).strip()
        if v.startswith(NS):
            v = v[len(NS):]
        h = [x for x in heads if x[0] < m.start()]
        anchor = f'{href}#{h[-1][1]}' if h else href
        sections[anchor] = (TITLES[href], h[-1][2] if h else '')
        lst = mentions.setdefault(v, [])
        if anchor not in lst:
            lst.append(anchor)


def chapters_for(it):
    names = [it['name']] + it.get('aliases', [])
    if it['kind'] == 'frame':
        names = [it['name']]
    found = []
    for nm in names:
        for a in mentions.get(nm, []):
            if a not in found:
                found.append(a)
    prim = chapter_rule(it['name']) if it['kind'] != 'frame' else None
    if not prim and it['kind'] != 'frame':
        ends = [e['n'] for e in it['pubs'] + it['subs']]
        if it['avail'] != 'sim':
            ends = [n for n in ends if nodes[n]['side'] != 'sim']
        pn = ends[0] if ends else None
        if pn and nodes.get(pn, {}).get('chapter'):
            prim = nodes[pn]['chapter']
    if it['kind'] == 'frame':
        prim = 'perception/frames.html#tree' if it['sub'] == 'mapping' else 'nereus.html#bridge' if it['sub'] == 'simulator' else 'localization.html#frames'
    if not prim:
        prim = SUBS[it['sub']]['chapter']
    # the primary first, then the most specific other mentions (deduped by page), at most 5 more
    others, pages_seen = [], {prim.split('#')[0]}
    for a in found:
        pg = a.split('#')[0]
        if pg in pages_seen:
            continue
        pages_seen.add(pg)
        others.append(a)
    return [prim] + others[:5]


def ch_label(a):
    href, _, anc = a.partition('#')
    t = TITLES.get(href, href)
    if href.startswith('perception/') and href != 'perception/index.html':
        t = 'Perception: ' + t
    if href.startswith('control/') and href != 'control/index.html':
        t = 'Control: ' + t
    if href == 'perception/index.html':
        t = 'Perception overview'
    if href == 'control/index.html':
        t = 'Control overview'
    sec = ''
    if anc:
        # section title from the page itself
        pth = os.path.join(SITE, href)
        if os.path.exists(pth):
            m = re.search(rf'<h([23]) id="{re.escape(anc)}"[^>]*>(.*?)</h\1>', open(pth).read(), re.S)
            if m:
                sec = html.unescape(re.sub(r'<[^>]+>', '', m.group(2))).strip()
            else:
                print(f'  warning: no h2 #{anc} in {href}', file=sys.stderr)
    return {'href': a, 'page': t, 'sec': sec}


all_items = list(items.values()) + frames
for it in all_items:
    it['ch'] = [ch_label(a) for a in chapters_for(it)]
for nd in nodes.values():
    if nd.get('chapter'):
        nd['ch'] = ch_label(nd['chapter'])
    if nd['id'] in param_clients:
        nd['param_clients'] = sorted(param_clients[nd['id']])

# nodes: what each one touches (by item id), for the node detail
for it in all_items:
    for role in ('pubs', 'subs'):
        for e in it[role]:
            nd = nodes.get(e['n'])
            if nd is None:
                print(f"  warning: unknown node {e['n']} on {it['name']}", file=sys.stderr)
                continue
            nd.setdefault('touch', []).append([it['kind'], it['name'], role])
for nd in nodes.values():
    if not nd.get('sub'):
        subs = [subsystem_of(n) for k, n, r in nd.get('touch', []) if r == 'pubs' and k != 'frame' and subsystem_of(n) != 'ros']
        nd['sub'] = max(sorted(set(subs)), key=subs.count) if subs else {'operator': 'operator', 'simulator': 'simulator'}.get(nd.get('group'), 'ros')
    nd['sub'] = CUR['node_meta'].get(nd['id'], {}).get('sub', nd['sub'])
    nd['touch'] = [t for t in nd.get('touch', []) if t[1] not in ('/rosout', '/parameter_events', '/clock')]
    if nd['id'] in ('nereus_viewer', 'viewer_panels', 'viewer_plots', 'nereus_viewer_timing'):
        nd['sub'] = 'operator'
    if nd['id'] in ('physics_simulator', 'sim_supervisor'):
        nd['sub'] = 'simulator'
    if nd.get('dump'):
        d = json.load(open(os.path.join(DATA, 'rosgraph', nd['dump'])))
        flat = {}

        def walk(pre, v):
            if isinstance(v, dict):
                for kk, vv in v.items():
                    walk(f'{pre}.{kk}' if pre else kk, vv)
            else:
                flat[pre] = v
        walk('', d['parameters'])
        nd['params'] = flat

# ---------------------------------------------------------------- write
def clean(it):
    out = {k: v for k, v in it.items() if v not in (None, [], '', False) or k in ('pubs', 'subs')}
    return out


subsystem_order = [s['id'] for s in CUR['subsystems']]
kind_order = {'topic': 0, 'service': 1, 'action': 2, 'frame': 3}
rows = sorted(all_items, key=lambda r: (subsystem_order.index(r['sub']), kind_order[r['kind']], r['name'].lower()))
node_rows = sorted(nodes.values(), key=lambda n: (subsystem_order.index(n['sub']), n['id'].lower()))
for nd in node_rows:
    nd.pop('files', None)
    nd.pop('repo', None)
    nd.pop('group', None)
    nd.pop('chapter', None)

out = {
    'generated': 'tools/interfaces/build.py',
    'capture': rg['captured'],
    'pool_bag': {'name': 'talos_20261026_204748', 'duration_s': bags['pool']['duration_s']},
    'subsystems': [{'id': s['id'], 'label': s['label']} for s in CUR['subsystems']],
    'items': [clean(r) for r in rows],
    'nodes': [clean(n) for n in node_rows],
}
os.makedirs(os.path.join(DATA, 'interfaces'), exist_ok=True)
dst = os.path.join(DATA, 'interfaces', 'interfaces.json')
json.dump(out, open(dst, 'w'), separators=(',', ':'), ensure_ascii=False)
cnt = {}
for r in rows:
    cnt[r['kind']] = cnt.get(r['kind'], 0) + 1
print(f'wrote {dst}: {cnt}, nodes {len(node_rows)}, {os.path.getsize(dst) // 1024} KB')
