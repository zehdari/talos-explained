"""args.txt for tess.cs: every visible (team's saved visibility), resolved leaf component of Talos.SLDASM that is at
least 2 mm across, minus the DVL beam cone and the duplicate top-level foam blocks.
usage: python3 make_tess_args.py > /tmp/cadshots/args.txt"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
rows = [json.loads(l) for l in open(os.path.join(here, 'tree_Talos.jsonl'))]
by = {r['name']: r for r in rows}
SKIP = ('DVL Sensor Cone-1', 'Dorito Foam-1', 'Dorito Foam-3')


def shown(r):
    while True:
        if r['suppressed'] or r['hidden']:
            return False
        if not r['parent']:
            return True
        r = by[r['parent']]


out = [r'C:\talos\explainer_cad\_tess', 'Talos.SLDASM']
for r in rows:
    if r['nchild'] or not r['box'] or not shown(r) or r['name'] in SKIP or r['name'].endswith('/DVL Sensor Cone-1'):
        continue
    if max(r['box'][i + 3] - r['box'][i] for i in range(3)) < 2.0:
        continue
    out.append(r['name'])
print('\n'.join(out))
