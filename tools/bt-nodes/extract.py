#!/usr/bin/env python3
"""Build the catalogue of riptide_autonomy's custom behaviour-tree nodes from the real source.

    python3 tools/bt-nodes/extract.py [--autonomy ~/osu-uwrt/release/src/riptide_autonomy]
                                      [--mission /tmp/perc/mission11_data.json]

Reads
  include/riptide_autonomy/bt_{actions,conditions,decorators}/*.hpp   one class per file (file name = class = XML ID)
  src/riptide_autonomy/bt_actions/SimpleActions.simple.cpp            the "simple" actions, registered by function
  include/riptide_autonomy/autonomy_lib.hpp                            topic and service name constants
  trees/*.xml and trees/.groot/workspace.xml                           where each node is used, and Groot's models
  tools/bt-nodes/notes.json                                            the hand-written group, summary and notes
and, if given, the tree stack of a recorded Nereus mission (the perception site's bag_to_mission.py output) to
measure how long each node type was the deepest running node.

Writes public/data/bt-nodes/catalogue.json and public/data/bt-nodes/mission_time.json.
"""
import argparse, collections, json, os, re, subprocess
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
ap = argparse.ArgumentParser()
ap.add_argument('--autonomy', default=os.path.expanduser('~/osu-uwrt/release/src/riptide_autonomy'))
ap.add_argument('--mission', default='/tmp/perc/mission11_data.json')
ap.add_argument('--comp', default='RepairCompMpcTree.xml')
args = ap.parse_args()
A = args.autonomy
BRANCH = 'autonomy-mapping'
GH = f'https://github.com/osu-uwrt/riptide_autonomy/blob/{BRANCH}/'


def read(p):
    with open(p) as f:
        return f.read()


def line_of(text, pos):
    return text.count('\n', 0, pos) + 1


def match_close(text, i, open_ch='(', close_ch=')'):
    """Index just past the bracket matching text[i] == open_ch, skipping string and char literals."""
    depth = 0
    j = i
    while j < len(text):
        c = text[j]
        if text.startswith('//', j):
            j = text.find('\n', j)
            continue
        if text.startswith('/*', j):
            j = text.find('*/', j) + 2
            continue
        if c in '"\'':
            q = c
            j += 1
            while j < len(text) and text[j] != q:
                j += 2 if text[j] == '\\' else 1
        elif c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return j + 1
        j += 1
    raise ValueError('unbalanced')


# ---------- constants from autonomy_lib.hpp ----------
lib = read(f'{A}/include/riptide_autonomy/autonomy_lib.hpp')
CONSTS = dict(re.findall(r'\b([A-Z_]+)\s*=\s*"([^"]*)"', lib))

PORT_RE = re.compile(r'(UwrtInput|UwrtOutput|BT::InputPort<std::string>|BT::OutputPort<std::string>)\(\s*"(\w+)"(?:\s*,\s*"((?:[^"\\]|\\.)*)")?\s*\)')
GET_RE = re.compile(r'tryGet(Required|Optional)Input<([^>]+(?:<[^>]*>)?)>\(\s*(?:this|&n)\s*,\s*"(\w+)"\s*,')
POST_RE = re.compile(r'postOutput<([^>]+)>\(\s*(?:this|&n)\s*,\s*"(\w+)"')


def parse_ports(block):
    out = []
    for kind, name, desc in PORT_RE.findall(block):
        out.append({'name': name, 'dir': 'out' if 'Output' in kind else 'in', 'desc': (desc or '').replace('\\"', '"')})
    return out


def fill_port_types(ports, body):
    """Types, defaults and required/optional from the tryGet*Input and postOutput calls."""
    by = {p['name']: p for p in ports}
    for m in GET_RE.finditer(body):
        req, typ, name = m.group(1), m.group(2).strip(), m.group(3)
        start = m.end()
        end = match_close(body, m.start() + body[m.start():].index('('), '(', ')') - 1
        default = body[start:end].strip()
        # the default is the third argument; a fourth (warnIfUndefined) never appears in node code
        p = by.get(name)
        if not p:
            continue
        p.setdefault('types', [])
        if typ not in p['types']:
            p['types'].append(typ)
        p.setdefault('defaults', [])
        if default not in p['defaults']:
            p['defaults'].append(default)
        if req == 'Required':
            p['required'] = True
        else:
            p.setdefault('required', False)
    for typ, name in POST_RE.findall(body):
        p = by.get(name)
        if p:
            p.setdefault('types', [])
            if typ not in p['types']:
                p['types'].append(typ)


TYPE_SHORT = {
    'riptide_msgs2::msg::ControllerCommand': 'riptide_msgs2/ControllerCommand',
    'riptide_msgs2::msg::LedCommand': 'riptide_msgs2/LedCommand',
    'riptide_msgs2::msg::MappingTargetInfo': 'riptide_msgs2/MappingTargetInfo',
    'riptide_msgs2::msg::ActuatorStatus': 'riptide_msgs2/ActuatorStatus',
    'vision_msgs::msg::Detection3DArray': 'vision_msgs/Detection3DArray',
    'nav_msgs::msg::Odometry': 'nav_msgs/Odometry',
    'std_msgs::msg::Bool': 'std_msgs/Bool', 'std_msgs::msg::String': 'std_msgs/String',
    'std_msgs::msg::Float32': 'std_msgs/Float32', 'std_msgs::msg::Float64': 'std_msgs/Float64',
    'std_msgs::msg::UInt16': 'std_msgs/UInt16',
    'sensor_msgs::msg::Imu': 'sensor_msgs/Imu', 'geometry_msgs::msg::Twist': 'geometry_msgs/Twist',
    'geometry_msgs::msg::PoseWithCovarianceStamped': 'geometry_msgs/PoseWithCovarianceStamped',
    'riptide_msgs2::srv::MappingTarget': 'riptide_msgs2/MappingTarget', 'std_srvs::srv::SetBool': 'std_srvs/SetBool',
    'std_srvs::srv::Trigger': 'std_srvs/Trigger', 'riptide_msgs2::srv::SetString': 'riptide_msgs2/SetString',
    'riptide_msgs2::srv::StartBinaryClassifier': 'riptide_msgs2/StartBinaryClassifier',
    'robot_localization::srv::SetPose': 'robot_localization/SetPose',
    'riptide_msgs2::action::FollowPath': 'riptide_msgs2/FollowPath',
}


def ros_interfaces(body):
    aliases = dict((a, t) for a, t in re.findall(r'using\s+(\w+)\s*=\s*([\w:]+)\s*;', body))
    methods = [(m.start(), m.group(1)) for m in re.finditer(r'\b(rosInit|onStart|onRunning|onHalted|tick|subscribe|holdCurrentHeading|publishPosition|publishHeading|finish)\s*\([^;{]*\)\s*(?:override\s*)?\{', body)]

    def when(pos):
        prev = [n for s, n in methods if s < pos]
        n = prev[-1] if prev else '?'
        return 'load' if n == 'rosInit' else ('tick' if n in ('subscribe', 'tick') else 'start')

    defines = dict(re.findall(r'#define\s+(\w+)\s+"([^"]*)"', body))
    # a name taken from a port at start: show the port
    VAR_PORT = {'srvName': '<srv_name>', 'topic': '<topic>', '_topic': '<topic>', 'topicName': 'mapping/<Target>'}

    def name_of(expr):
        expr = expr.strip()
        m = re.match(r'"([^"]*)"\s*\+\s*(\w+)$', expr)
        if m:
            return m.group(1) + '<' + m.group(2) + '>', False
        if expr.startswith('"'):
            return expr.strip('"'), True
        if expr in CONSTS:
            return CONSTS[expr], True
        if expr in defines:
            return defines[expr], True
        if expr in VAR_PORT:
            return VAR_PORT[expr], False
        return expr, False

    out = []
    patterns = [
        ('pub', r'create_publisher<([\w:]+)>\(\s*([^,]+),'),
        ('sub', r'create_subscription<([\w:]+)>\(\s*([^,]+),'),
        ('client', r'(?<!rclcpp_action::)create_client<([\w:]+)>\(\s*([^)]+)\)'),
        ('action', r'rclcpp_action::create_client<([\w:]+)>\(\s*\w+\s*,\s*([^)]+)\)'),
    ]
    for kind, pat in patterns:
        for m in re.finditer(pat, body):
            typ = aliases.get(m.group(1), m.group(1))
            name, fixed = name_of(m.group(2))
            out.append({'kind': kind, 'type': TYPE_SHORT.get(typ, typ), 'name': name, 'fixed': fixed, 'when': when(m.start())})
    if 'AsyncParametersClient' in body:
        out.append({'kind': 'param', 'type': 'parameter client', 'name': 'controller__stunt__safe_mode', 'fixed': True, 'when': 'load'})
    # de-duplicate (same interface created in two places)
    seen, res = set(), []
    for r in out:
        k = (r['kind'], r['name'])
        if k not in seen:
            seen.add(k)
            res.append(r)
    return res


nodes = {}
KIND = {'bt_actions': 'action', 'bt_conditions': 'condition', 'bt_decorators': 'decorator'}
BASE = {'UWRTActionNode': 'stateful', 'UWRTConditionNode': 'condition', 'UWRTDecoratorNode': 'decorator'}
for d, kind in KIND.items():
    folder = f'{A}/include/riptide_autonomy/{d}'
    for fn in sorted(os.listdir(folder)):
        if not fn.endswith('.hpp'):
            continue
        text = read(f'{folder}/{fn}')
        nid = fn.split('.')[0]
        cm = re.search(r'class\s+(\w+)\s*:\s*public\s+(\w+)', text)
        assert cm and cm.group(1) == nid, fn
        pp = text.index('providedPorts()')
        ret = text.index('return', pp)
        block = text[ret:match_close(text, text.index('{', ret), '{', '}')]
        ports = parse_ports(block)
        fill_port_types(ports, text)
        rel = f'include/riptide_autonomy/{d}/{fn}'
        nodes[nid] = {
            'id': nid, 'kind': kind, 'base': BASE.get(cm.group(2), cm.group(2)), 'file': rel,
            'url': f'{GH}{rel}#L{line_of(text, cm.start())}', 'portsUrl': f'{GH}{rel}#L{line_of(text, pp)}',
            'lines': text.count('\n') + 1, 'ports': ports,
            'ros': ros_interfaces(text), 'tf': bool(re.search(r'lookupTransform\(|tfBuffer->', text)),
        }

# ---------- the simple actions ----------
SIMPLE = 'src/riptide_autonomy/bt_actions/SimpleActions.simple.cpp'
text = read(f'{A}/{SIMPLE}')


def func_body(name):
    m = re.search(r'(?:BT::NodeStatus|bool|void)\s+' + name + r'\s*\(([^)]*)\)\s*\{', text)
    return m.start(), text[m.start():match_close(text, m.end() - 1, '{', '}')]


for m in re.finditer(r'registerSimpleUwrtAction\(\s*factory\s*,\s*"(\w+)"\s*,\s*(\w+)\s*,', text):
    nid, fn = m.group(1), m.group(2)
    call = text[m.start():match_close(text, text.index('(', m.start()), '(', ')')]
    ports = parse_ports(call)
    fpos, body = func_body(fn)
    for helper in ('beginWaypoint', 'appendHeading'):
        if helper + '(' in body:
            body += func_body(helper)[1]
    fill_port_types(ports, body)
    nodes[nid] = {
        'id': nid, 'kind': 'action', 'base': 'simple', 'file': SIMPLE,
        'url': f'{GH}{SIMPLE}#L{line_of(text, fpos)}', 'portsUrl': f'{GH}{SIMPLE}#L{line_of(text, m.start())}',
        'lines': body.count('\n') + 1, 'ports': ports, 'ros': [],
        'tf': False, 'func': fn,
    }

# ---------- hand-written notes ----------
notes = json.load(open(f'{HERE}/notes.json'))
missing = sorted(set(nodes) - set(notes['nodes']))
extra = sorted(set(notes['nodes']) - set(nodes))
assert not missing and not extra, (missing, extra)
for nid, n in notes['nodes'].items():
    node = nodes[nid]
    for k, v in n.items():
        if k == 'ports':  # per-port overrides (a default the code computes, say)
            for p in node['ports']:
                p.update(v.get(p['name'], {}))
        elif k == 'ros':
            node['ros'] = v
        else:
            node[k] = v
    for p in node['ports']:
        unknown = [d for d in p.get('defaults', [])]
        def clean(d):
            d = d.strip()
            if re.fullmatch(r'"[^"]*"', d):
                return d[1:-1] or 'empty'
            return re.sub(r'^(-?[\d.]+)f$', r'\1', d)
        p['default'] = p.pop('defaultText', None) or (' / '.join(clean(d) for d in unknown) if unknown else None)
        p.pop('defaults', None)
        p['type'] = p.pop('typeText', None) or (' / '.join(p.pop('types', [])) or 'string')
        p.pop('types', None)

# ---------- the trees ----------
TREES = f'{A}/trees'
CUSTOM = set(nodes)
CONTROL_TAGS = ('Action', 'Condition', 'Decorator', 'Control')
SKIP_ATTR = ('ID', 'name', '__shared_blackboard')
OUT_PORTS = {nid: [p['name'] for p in n['ports'] if p['dir'] == 'out'] for nid, n in nodes.items()}
RUNTIME = '(set while running)'


def node_type(e):
    if e.tag in CONTROL_TAGS:
        return e.get('ID')
    return e.tag


def load_tree(path):
    root = ET.parse(path).getroot()
    defs = {bt.get('ID'): bt for bt in root.findall('BehaviorTree')}
    model = {}
    tnm = root.find('TreeNodesModel')
    if tnm is not None:
        for e in tnm:
            if e.get('ID') in CUSTOM:
                model[e.get('ID')] = sorted(p.get('name') for p in e if p.tag.endswith('_port'))
    return root.get('main_tree_to_execute'), defs, model


def expand(defs, main, visit):
    """Walk the tree as doTask would build it, every SubTree instantiated where it is used. visit(elem, tree_id,
    known) is called for each node; known maps a blackboard key to the literal values it can hold (statically)."""
    count = collections.Counter()

    def resolve(v, known):
        m = re.fullmatch(r'\{(\w+)\}', v or '')
        if m:
            return known.get(m.group(1)) or {v}
        return {v}

    def walk(tree_id, known, depth):
        if depth > 40:
            raise RuntimeError('subtree recursion')
        bt = defs[tree_id]

        def rec(e):
            t = node_type(e)
            if e.tag == 'SubTree':
                sub = e.get('ID')
                count['SubTree'] += 1
                if e.get('__shared_blackboard') == 'true':
                    walk(sub, known, depth + 1)
                else:  # BT.CPP v3: each attribute remaps the subtree port to a parent blackboard key
                    child = {k: set(known.get(v, set())) for k, v in e.attrib.items() if k not in SKIP_ATTR}
                    walk(sub, child, depth + 1)
                return
            count[t] += 1
            if e.tag == 'SetBlackboard':
                key = e.get('output_key')
                known.setdefault(key, set()).update(resolve(e.get('value'), known))
            visit(e, t, tree_id, {k: resolve(v, known) for k, v in e.attrib.items() if k not in SKIP_ATTR})
            for port in OUT_PORTS.get(t, ()):  # a key a node writes while running has no literal value
                key = (e.get(port) or '').strip('{}')
                if key:
                    known.setdefault(key, set()).add(RUNTIME)
            for c in e:
                rec(c)

        for c in bt:
            rec(c)

    walk(main, {}, 0)
    return count


# per-file usage (reachable from the file's main tree only)
files = sorted(f for f in os.listdir(TREES) if f.endswith('.xml'))
usage_files = collections.defaultdict(list)
for f in files:
    main, defs, _ = load_tree(f'{TREES}/{f}')
    seen = set()
    expand(defs, main, lambda e, t, tid, attrs: seen.add(t) if t in CUSTOM else None)
    for t in seen:
        usage_files[t].append(f)

# the competition tree in detail
main, defs, comp_model = load_tree(f'{TREES}/{args.comp}')
inst = collections.Counter()
places = collections.defaultdict(set)  # (subtree, element id) pairs: static places in the reachable subtrees
in_subtrees = collections.defaultdict(collections.Counter)
values = collections.defaultdict(lambda: collections.defaultdict(collections.Counter))
reachable = set()
names = collections.defaultdict(collections.Counter)  # instance name -> node types, for the mission stack


def visit(e, t, tid, attrs):
    reachable.add(tid)
    names[e.get('name') or t][t] += 1
    if t not in CUSTOM:
        return
    inst[t] += 1
    places[t].add((tid, id(e)))
    in_subtrees[t][tid] += 1
    for k, vs in attrs.items():
        for v in vs:
            values[t][k][v] += 1


all_count = expand(defs, main, visit)
for e in ET.parse(f'{TREES}/{args.comp}').getroot().iter():
    pass

_, _, ws_model = load_tree(f'{TREES}/.groot/workspace.xml')

for nid, n in nodes.items():
    src_ports = sorted(p['name'] for p in n['ports'])
    n['use'] = {
        'instances': inst.get(nid, 0),
        'places': len(places.get(nid, ())),
        'subtrees': [[k, c] for k, c in sorted(in_subtrees.get(nid, {}).items(), key=lambda kv: (-kv[1], kv[0]))],
        'files': usage_files.get(nid, []),
        'values': {k: [[v, c] for v, c in sorted(vs.items(), key=lambda kv: (-kv[1], kv[0]))][:40 if k in ('srv_name', 'topic') else 10]
                   for k, vs in values.get(nid, {}).items()
                   if any(v not in ('',) for v in vs)},
    }
    n['groot'] = {
        'workspace': nid in ws_model, 'workspaceMatches': ws_model.get(nid) == src_ports if nid in ws_model else None,
        'compModel': nid in comp_model, 'compMatches': comp_model.get(nid) == src_ports if nid in comp_model else None,
    }

# ROS endpoints the expanded competition tree opens before its first tick
load_counts = collections.Counter()
for nid, c in inst.items():
    for r in nodes[nid]['ros']:
        if r.get('when') == 'load':
            load_counts[r['kind']] += c

builtins = {t: c for t, c in all_count.items() if t not in CUSTOM and t != 'SubTree'}
rev = subprocess.run(['git', '-C', A, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
cat = {
    'source': {'repo': 'osu-uwrt/riptide_autonomy', 'branch': BRANCH, 'commit': rev, 'compTree': args.comp,
               'compUrl': f'{GH}trees/{args.comp}', 'treeFiles': len(files)},
    'groups': notes['groups'],
    'comp': {
        'subtreesDefined': len(defs), 'subtreesReachable': len(reachable), 'subtreeInstances': all_count['SubTree'],
        'nodeInstances': sum(c for t, c in all_count.items() if t != 'SubTree'),
        'customInstances': sum(inst.values()), 'builtins': dict(sorted(builtins.items(), key=lambda kv: -kv[1])),
        'openedAtLoad': dict(load_counts),
    },
    'nodes': sorted(nodes.values(), key=lambda n: (notes['groups'].index(next(g for g in notes['groups'] if g['id'] == n['group'])), n['id'].lower())),
}
out = f'{SITE}/public/data/bt-nodes'
os.makedirs(out, exist_ok=True)
with open(f'{out}/catalogue.json', 'w') as f:
    json.dump(cat, f, separators=(',', ':'))
print(f'{len(nodes)} nodes; comp tree: {cat["comp"]["nodeInstances"]} node instances, {sum(inst.values())} custom, '
      f'{len(reachable)}/{len(defs)} subtrees reachable; opened at load {dict(load_counts)}')

# ---------- one recorded mission: time as the deepest running node ----------
if args.mission and os.path.exists(args.mission):
    stack = json.load(open(args.mission))['tree']
    secs, starts = collections.Counter(), collections.Counter()
    unmapped = collections.Counter()

    def type_of(name):
        c = names.get(name)
        if not c:
            return None
        return c.most_common(1)[0][0] if len(c) == 1 else (c.most_common(1)[0][0] if c.most_common(1)[0][1] > sum(c.values()) / 2 else None)

    prev_top = None
    for i, (t, s) in enumerate(stack):
        top = s[-1] if s else None
        t_next = stack[i + 1][0] if i + 1 < len(stack) else t
        ty = type_of(top) if top else None
        if ty is None and top:
            unmapped[top] += t_next - t
        elif ty:
            secs[ty] += t_next - t
            if top != prev_top or (i > 0 and len(stack[i - 1][1]) < len(s)):
                starts[ty] += 1
        prev_top = top
    t0, t1 = stack[0][0], stack[-1][0]
    rows = [{'id': k, 'secs': round(v, 1), 'starts': starts[k], 'custom': k in CUSTOM,
             'group': next((n['group'] for n in nodes.values() if n['id'] == k), None)}
            for k, v in secs.most_common() if v >= 0.05]
    mt = {'run': 'mission11', 'tree': 'RepairCompMpcTree', 'start': round(t0, 1), 'end': round(t1, 1), 'rows': rows,
          'unmapped': [[k, round(v, 1)] for k, v in unmapped.most_common(10)]}
    with open(f'{out}/mission_time.json', 'w') as f:
        json.dump(mt, f, separators=(',', ':'))
    print(f'mission: {t1 - t0:.0f} s; top: {rows[:8]}; unmapped: {mt["unmapped"][:5]}')
