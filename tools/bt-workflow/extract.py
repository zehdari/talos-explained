#!/usr/bin/env python3
"""Facts for the "Writing and testing trees" chapter, read from a riptide_autonomy checkout.

    python3 tools/bt-workflow/extract.py [~/osu-uwrt/release/src/riptide_autonomy] > public/data/bt-workflow/autonomy.json

Writes: every tree file's subtrees compared with trees/.groot/workspace.xml (same / differs / only in the file),
the workspace's node models, the C++ nodes (header ports, simple nodes) and which of them the workspace lists,
and the GTest cases per test file.
"""
import glob
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

root = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else '~/osu-uwrt/release/src/riptide_autonomy')
trees_dir = os.path.join(root, 'trees')


def canon(el):
    """A subtree's XML without whitespace differences, so formatting alone never counts as a change."""
    for e in el.iter():
        e.text = (e.text or '').strip() or None
        e.tail = None
    return ET.tostring(el)


ws = ET.parse(os.path.join(trees_dir, '.groot/workspace.xml')).getroot()
ws_trees = {b.get('ID'): canon(b) for b in ws.findall('BehaviorTree')}
ws_model = ws.find('TreeNodesModel')
# "Differs" doesn't say which copy is newer. Recent competition work goes into RepairCompMpcTree.xml, so each
# differing subtree is also compared with that file's copy: if the workspace matches it, the file is behind.
REF = 'RepairCompMpcTree.xml'
ref_trees = {b.get('ID'): canon(b) for b in ET.parse(os.path.join(trees_dir, REF)).getroot().findall('BehaviorTree')}
ws_nodes = {c.get('ID'): c.tag for c in ws_model if c.tag != 'SubTree'}

files = []
for path in sorted(glob.glob(os.path.join(trees_dir, '*.xml')), key=lambda p: os.path.basename(p).lower()):
    r = ET.parse(path).getroot()
    main = r.get('main_tree_to_execute')
    same, differs, only = [], [], []
    for b in r.findall('BehaviorTree'):
        i = b.get('ID')
        if i == main:
            continue
        if i not in ws_trees:
            only.append(i)
        elif canon(b) != ws_trees[i]:
            differs.append(i)
        else:
            same.append(i)
    model = r.find('TreeNodesModel')
    files.append({
        'file': os.path.basename(path),
        'kb': round(os.path.getsize(path) / 1024),
        'main': main,
        'same': len(same),
        'differs': sorted(differs, key=str.lower),
        'only': sorted(only, key=str.lower),
        # differing subtrees where the workspace has the reference file's copy (this file is behind) ...
        'behind': sorted([i for i in differs if ref_trees.get(i) == ws_trees[i]], key=str.lower),
        # ... and where this file has the reference file's copy (the workspace is behind)
        'ahead': sorted([i for i in differs if ref_trees.get(i) == canon(r.find(f"BehaviorTree[@ID='{i}']"))], key=str.lower),
        'models': 0 if model is None else len([c for c in model if c.tag != 'SubTree']),
    })

# C++ nodes: one header per node, file name = class name = node ID
nodes = []
for kind in ('actions', 'conditions', 'decorators'):
    for h in sorted(glob.glob(os.path.join(root, f'include/riptide_autonomy/bt_{kind}/*.hpp'))):
        name = os.path.basename(h).split('.')[0]
        src = open(h).read()
        m = re.search(r'providedPorts\(\)\s*\{\s*return\s*\{(.*?)\};', src, re.S)
        ports = []
        if m:
            for d, p in re.findall(r'(UwrtInput|UwrtOutput|InputPort<[^>]*>|OutputPort<[^>]*>)\(\s*"(\w+)"', m.group(1)):
                ports.append({'name': p, 'dir': 'out' if 'Output' in d else 'in'})
        base = re.search(r'class\s+\w+\s*:\s*public\s+(\w+)', src)
        test = os.path.join(root, f'test/riptide_autonomy/bt_{kind}/Test{name}.cpp')
        ntests = len(re.findall(r'^TEST_F\(', open(test).read(), re.M)) if os.path.exists(test) else 0
        nodes.append({'name': name, 'kind': kind[:-1], 'base': base.group(1) if base else '', 'ports': ports,
                      'tests': ntests, 'in_workspace': name in ws_nodes})

simple_src = open(os.path.join(root, 'src/riptide_autonomy/bt_actions/SimpleActions.simple.cpp')).read()
for name in re.findall(r'registerSimpleUwrtAction\(factory,\s*"(\w+)"', simple_src):
    test = os.path.join(root, f'test/riptide_autonomy/bt_actions/Test{name}.cpp')
    ntests = len(re.findall(r'^TEST_F\(', open(test).read(), re.M)) if os.path.exists(test) else 0
    nodes.append({'name': name, 'kind': 'simple', 'base': 'UWRTSimpleActionNode', 'ports': [], 'tests': ntests,
                  'in_workspace': name in ws_nodes})

tests = []
for t in sorted(glob.glob(os.path.join(root, 'test/riptide_autonomy/**/*.cpp'), recursive=True)):
    n = len(re.findall(r'^TEST_F\(', open(t).read(), re.M))
    if n:
        tests.append({'file': os.path.relpath(t, root), 'cases': n})

commit = subprocess.run(['git', '-C', root, 'log', '-1', '--format=%h %ad', '--date=short'],
                        capture_output=True, text=True).stdout.strip()
branch = subprocess.run(['git', '-C', root, 'branch', '--show-current'], capture_output=True, text=True).stdout.strip()

json.dump({
    'source': {'branch': branch, 'commit': commit, 'reference': REF},
    'workspace': {
        'subtrees': len(ws_trees),
        'models': {t: sum(1 for v in ws_nodes.values() if v == t) for t in ('Action', 'Condition', 'Decorator')},
    },
    'files': files,
    'nodes': nodes,
    'tests': tests,
}, sys.stdout, indent=1)
print()
