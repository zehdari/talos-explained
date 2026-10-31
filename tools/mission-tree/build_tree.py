#!/usr/bin/env python3
"""Parse the competition tree into JSON for the mission-tree chapter's explorer.

    python3 tools/mission-tree/build_tree.py [RIPTIDE_AUTONOMY_DIR] [OUT_JSON]

Reads trees/RepairCompMpcTree.xml (every subtree the main tree reaches, with source line numbers) and the
custom nodes' C++ headers (class doc comment and ports with their descriptions), plus a one-line survey of
every other file in trees/.
"""
import json, re, subprocess, sys
from pathlib import Path
from lxml import etree

REPO = Path(sys.argv[1] if len(sys.argv) > 1 else Path.home() / 'osu-uwrt/release/src/riptide_autonomy')
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else Path(__file__).resolve().parents[2] / 'public/data/mission-tree/tree.json')
FILE = 'trees/RepairCompMpcTree.xml'

root = etree.parse(str(REPO / FILE), etree.XMLParser(remove_comments=True)).getroot()
defs = {b.get('ID'): b for b in root.findall('BehaviorTree')}
main = root.get('main_tree_to_execute')

def node(e):
    a = dict(e.attrib)
    n = {'k': e.tag, 'l': e.sourceline}
    if 'ID' in a: n['id'] = a.pop('ID')
    if 'name' in a: n['n'] = a.pop('name')
    if a: n['a'] = a
    kids = [node(c) for c in e if isinstance(c.tag, str)]
    if kids: n['c'] = kids
    return n

# Subtrees reachable from the main tree, in first-use order.
order, stack = [], [main]
while stack:
    t = stack.pop(0)
    if t in order or t not in defs: continue
    order.append(t)
    stack += [e.get('ID') for e in defs[t].iter('SubTree')]
subtrees = {t: dict(node(list(defs[t])[0]), l0=defs[t].sourceline) for t in order}

# Custom node models: doc comment + ports from the headers, ports from SimpleActions.simple.cpp.
models = {}
PORT = re.compile(r'Uwrt(Input|Output)\(\s*"(\w+)"\s*(?:,\s*"((?:[^"\\]|\\.)*)")?\s*\)|BT::(Input|Output)Port<[^>]*>\(\s*"(\w+)"')
def ports(text):
    out = []
    for m in PORT.finditer(text):
        if m.group(2): out.append({'name': m.group(2), 'dir': m.group(1).lower(), 'desc': (m.group(3) or '').replace('\\"', '"')})
        else: out.append({'name': m.group(5), 'dir': m.group(4).lower(), 'desc': ''})
    return out
def clean_doc(c):
    c = re.sub(r'^/\*\*|\*/$', '', c.strip())
    lines = [re.sub(r'^\s*\*\s?', '', l) for l in c.splitlines()]
    txt = ' '.join(l.strip() for l in lines if l.strip() and not l.strip().startswith('@param') and not l.strip().startswith('@return'))
    return re.sub(r'@brief\s*', '', txt).strip()
for kind, d in [('Action', 'bt_actions'), ('Condition', 'bt_conditions'), ('Decorator', 'bt_decorators')]:
    for h in sorted((REPO / 'include/riptide_autonomy' / d).glob('*.hpp')):
        text = h.read_text()
        cls = h.name.split('.')[0]
        m = re.search(r'(/\*\*(?:(?!\*/).)*\*/)\s*class\s+' + cls + r'\b', text, re.S)
        pp = re.search(r'providedPorts\(\)\s*\{(.*?)\n\s*\}', text, re.S)
        models[cls] = {'kind': kind, 'doc': clean_doc(m.group(1)) if m else '', 'ports': ports(pp.group(1)) if pp else [],
                       'src': str(h.relative_to(REPO))}
simple = (REPO / 'src/riptide_autonomy/bt_actions/SimpleActions.simple.cpp').read_text()
for m in re.finditer(r'registerSimpleUwrtAction\(factory,\s*"(\w+)",\s*\w+,\s*(\{.*?\})\s*\);', simple, re.S):
    line = simple[:m.start()].count('\n') + 1
    models[m.group(1)] = {'kind': 'Action', 'doc': '', 'ports': ports(m.group(2)), 'src': f'src/riptide_autonomy/bt_actions/SimpleActions.simple.cpp#L{line}'}

# Every tree file: main tree, what it reaches, whether it drives with FollowPath (MPC) or Move (old controllers).
def survey(f):
    r = etree.parse(str(f)).getroot()
    d = {b.get('ID'): b for b in r.findall('BehaviorTree')}
    m = r.get('main_tree_to_execute')
    seen, st = [], [m]
    while st:
        t = st.pop(0)
        if t in seen or t not in d: continue
        seen.append(t)
        st += [e.get('ID') for e in d[t].iter('SubTree')]
    ids = {e.get('ID') for t in seen for e in d[t].iter() if e.get('ID')}
    date = subprocess.run(['git', '-C', str(REPO), 'log', '-1', '--format=%ad', '--date=short', '--', str(f.relative_to(REPO))],
                          capture_output=True, text=True).stdout.strip()
    return {'file': f.name, 'lines': sum(1 for _ in open(f)), 'reach': len(seen), 'followpath': 'FollowPath' in ids,
            'move': 'Move' in ids or 'SmartMovePosition' in ids, 'date': date}
files = [survey(f) for f in sorted((REPO / 'trees').glob('*.xml'), key=lambda p: p.name.lower())]

commit = subprocess.run(['git', '-C', str(REPO), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
out = {'file': FILE, 'commit': commit, 'main': main, 'lines': sum(1 for _ in open(REPO / FILE)), 'defined': len(defs),
       'subtrees': subtrees, 'models': models, 'files': files}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out, separators=(',', ':')))
print('wrote', OUT, f'{OUT.stat().st_size / 1e3:.0f} kB,', len(subtrees), 'of', len(defs), 'subtrees,', len(models), 'models')
