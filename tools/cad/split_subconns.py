"""Move the SubConn connectors (bulkhead mcbh/mcdc, inline mcil plugs) and the SubConn cover out of the other
subsystem STLs into their own subconns.stl, using the component boxes in tree_Talos.jsonl.

usage: ~/tools/cadvenv/bin/python -I split_subconns.py STL_IN_DIR STL_OUT_DIR
A connected piece moves when its box sits inside (2 mm tolerance) the box of a SubConn part or the cover.
"""
import json, os, re, shutil, sys
import numpy as np, trimesh

src, dst = sys.argv[1:3]
here = os.path.dirname(os.path.abspath(__file__))
os.makedirs(dst, exist_ok=True)
rows = [json.loads(l) for l in open(os.path.join(here, 'tree_Talos.jsonl'))]
PAT = re.compile(r'(^|/|_)(mcbh|mcil|mcdc|hpbh|hpil|dbh|dil)\d|^Subconn Cover', re.I)
boxes = np.array([r['box'] for r in rows if r['box'] and not r['nchild'] and not r['suppressed'] and not r['hidden']
                  and PAT.search(r['name'])], float)
tol = 2.0
print(len(boxes), 'SubConn part boxes')
moved = []
for f in sorted(os.listdir(src)):
    if not f.endswith('.stl'):
        continue
    m = trimesh.load(os.path.join(src, f), process=True)
    if f in ('thrusters.stl', 'thruster_guards.stl', 'foam.stl', 'electronics.stl'):
        shutil.copy(os.path.join(src, f), os.path.join(dst, f)); continue
    parts = m.split(only_watertight=False)
    keep, take = [], []
    for p in parts:
        lo, hi = p.bounds
        inside = np.all((boxes[:, :3] - tol <= lo) & (hi <= boxes[:, 3:] + tol), axis=1)
        (take if inside.any() else keep).append(p)
    print(f, len(parts), 'pieces ->', len(take), 'SubConn pieces')
    moved += take
    out = trimesh.util.concatenate(keep) if keep else None
    if out is not None:
        out.export(os.path.join(dst, f))
trimesh.util.concatenate(moved).export(os.path.join(dst, 'subconns.stl'))
print('subconns.stl', sum(len(p.faces) for p in moved), 'faces')
