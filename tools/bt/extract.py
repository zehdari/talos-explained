#!/usr/bin/env python3
"""Behaviour-trees chapter data from riptide_autonomy's competition tree.

  python3 tools/bt/extract.py [path/to/riptide_autonomy]

Writes public/data/bt/:
  searchmpc.json   the SearchMpc subtree (every element, attributes, source line) plus the TorpedoTreeMpc call
                   that runs it and the values its remapped keys hold there (for the tick simulator)
  subtrees.json    every SubTree call reachable from the main tree of RepairCompMpcTree.xml: child port -> parent
                   key, and the literal the parent wrote to that key with SetBlackboard, if it did
  usage.json       how often each built-in control node / decorator and each custom node appears in that file
"""
import collections, json, os, subprocess, sys
from lxml import etree

REPO = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/osu-uwrt/release/src/riptide_autonomy')
TREE = 'trees/RepairCompMpcTree.xml'
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'bt')
os.makedirs(OUT, exist_ok=True)

root = etree.parse(os.path.join(REPO, TREE)).getroot()
commit = subprocess.run(['git', '-C', REPO, 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()
trees = {bt.get('ID'): bt for bt in root.findall('BehaviorTree')}
model = root.find('TreeNodesModel')
GENERIC = {'Action', 'Condition', 'Decorator', 'Control', 'SubTree'}


def node(e):
    """One XML element as {tag, id, name, attrs, line, children}."""
    attrs = {k: v for k, v in e.attrib.items() if k not in ('ID', 'name')}
    out = {'tag': e.tag, 'line': e.sourceline}
    if e.get('ID'):
        out['id'] = e.get('ID')
    if e.get('name'):
        out['name'] = e.get('name')
    if attrs:
        out['attrs'] = attrs
    kids = [node(c) for c in e if isinstance(c.tag, str)]
    if kids:
        out['children'] = kids
    return out


def literals(bt):
    """Keys a tree writes with SetBlackboard to a fixed (non-{ref}) value: key -> value, or "a | b" if it writes
    different fixed values in different branches."""
    vals = {}
    for e in bt.iter('SetBlackboard'):
        v = e.get('value', '')
        if not (v.startswith('{') and v.endswith('}')):
            vals.setdefault(e.get('output_key'), [])
            if v not in vals[e.get('output_key')]:
                vals[e.get('output_key')].append(v)
    return {k: ' | '.join(v) for k, v in vals.items()}


def subtree_ports(sid):
    m = model.find(f"SubTree[@ID='{sid}']")
    if m is None:
        return {}
    return {p.get('name'): {'default': p.get('default'), 'doc': (p.text or '').strip() or None}
            for p in m.findall('input_port') if p.get('name') != '__shared_blackboard'}


# ---- SearchMpc and the call that runs it ----
search = trees['SearchMpc']
call = next(e for e in trees['TorpedoTreeMpc'].iter('SubTree') if e.get('ID') == 'SearchMpc')
parent_vals = literals(trees['TorpedoTreeMpc'])
remap = {k: v for k, v in call.attrib.items() if k not in ('ID', '__shared_blackboard')}
json.dump({
    'source': {'repo': 'riptide_autonomy', 'branch': 'autonomy-mapping', 'commit': commit, 'file': TREE},
    'tree': node(search),
    'call': {'parent': 'TorpedoTreeMpc', 'line': call.sourceline, 'remap': remap,
             'values': {port: parent_vals.get(key) for port, key in remap.items()}},
    'declared': subtree_ports('SearchMpc'),
}, open(os.path.join(OUT, 'searchmpc.json'), 'w'), indent=1)

# ---- every SubTree call reachable from the main tree ----
main = root.get('main_tree_to_execute')
calls, seen, order = [], set(), [main]
while order:
    tid = order.pop(0)
    if tid in seen:
        continue
    seen.add(tid)
    bt = trees[tid]
    vals = literals(bt)
    for e in bt.iter('SubTree'):
        child = e.get('ID')
        shared = e.get('__shared_blackboard', 'false') == 'true'
        declared = subtree_ports(child)
        ports = []
        for k, v in e.attrib.items():
            if k in ('ID', '__shared_blackboard'):
                continue
            ports.append({'port': k, 'key': v, 'value': vals.get(v)})
        unmapped = [p for p in declared if p not in e.attrib]
        calls.append({'parent': tid, 'child': child, 'line': e.sourceline, 'shared': shared,
                      'ports': ports, 'unmapped': unmapped})
        order.append(child)
json.dump({'source': {'commit': commit, 'file': TREE}, 'main': main, 'calls': calls,
           'trees_in_file': len(trees)}, open(os.path.join(OUT, 'subtrees.json'), 'w'), indent=1)

# ---- node usage in the file (all BehaviorTree elements) ----
use = collections.Counter()
for bt in trees.values():
    for e in bt.iter():
        if e is bt or not isinstance(e.tag, str):
            continue
        use[e.tag + ':' + e.get('ID') if e.tag in GENERIC else e.tag] += 1
json.dump({'source': {'commit': commit, 'file': TREE}, 'counts': dict(use.most_common())},
          open(os.path.join(OUT, 'usage.json'), 'w'), indent=1)
print('SearchMpc line', search.sourceline, 'call line', call.sourceline, '| calls', len(calls), '| trees', len(trees))
