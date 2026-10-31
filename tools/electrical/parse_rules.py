#!/usr/bin/env python3
"""electric_boogaloo PCB design rules and stackup -> public/data/electrical/rules.json.

Reads JLCPCB_4Layers.RUL (an Altium design-rule export: one rule per record, `|KEY=VALUE|` fields) and
JLCPCB_4Layers.stackup from the root of osu-uwrt/electric_boogaloo, and keeps the rules a new member meets first,
converted from mil to mm.

    python3 -I tools/electrical/parse_rules.py /tmp/gh/electric_boogaloo
"""
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'public/data/electrical/rules.json'
EB = 'https://github.com/osu-uwrt/electric_boogaloo/blob/master/'


def mm(v):
    m = re.match(r'([\d.Ee+-]+)\s*mil', v.strip().rstrip('\xb6'))
    return round(float(m.group(1)) * 0.0254, 3) if m else None


def records(text):
    for rec in re.split(r'[\x00-\x08\r\n]+', text):
        if 'RULEKIND=' in rec:
            yield dict(kv.split('=', 1) for kv in rec.split('|') if '=' in kv)


# (rule NAME, field, what it means for you)
WANT = [
    ('Clearance JLCPCB 4 layer', 'GAP', 'Clearance', 'Minimum gap between copper on different nets'),
    ('Width JLCPCB 4 layer', 'MINLIMIT', 'Track width, minimum', 'Thinnest track allowed'),
    ('Width JLCPCB 4 layer', 'PREFEREDWIDTH', 'Track width, default', 'What a new track starts at; power needs far wider'),
    ('RoutingVias JLCPCB 4 layer', 'HOLEWIDTH', 'Via hole, default', 'Drill for a new via'),
    ('RoutingVias JLCPCB 4 layer', 'WIDTH', 'Via pad, default', 'Copper ring diameter of a new via'),
    ('RoutingVias JLCPCB 4 layer', 'MINHOLEWIDTH', 'Via hole, minimum', 'Smallest drill for a via'),
    ('HoleSize JLCPCB Pad', 'MINLIMIT', 'Pad hole, minimum', 'Smallest drill for a through-hole pad'),
    ('MinimumAnnularRing JLCPCB Via', 'MINIMUMRING', 'Annular ring, via', 'Copper left around a via drill'),
    ('BoardOutlineClearance JLCPCB', 'GAP', 'Copper to board edge', 'Keep copper this far from the outline'),
    ('SilkToSolderMaskClearance JLCPCB', 'MINSILKSCREENTOMASKGAP', 'Silkscreen to pads', 'Silk is clipped this far from exposed copper'),
    ('ComponentClearance', 'GAP', 'Component to component', 'Minimum body-to-body gap'),
]


def main():
    root = Path(sys.argv[1])
    rules = {r.get('NAME'): r for r in records((root / 'JLCPCB_4Layers.RUL').read_bytes().decode('latin1'))}
    rows = []
    for name, field, label, means in WANT:
        r = rules[name]
        rows.append({'rule': name, 'label': label, 'mm': mm(r[field]), 'mil': r[field].rstrip('\xb6'), 'means': means})
    st = (root / 'JLCPCB_4Layers.stackup').read_bytes().decode('utf-8-sig', 'ignore')
    d = dict(kv.split('=', 1) for kv in st.split('|') if '=' in kv)
    layers, i = [], 0
    while f'LAYER_V8_{i}NAME' in d:
        name = d[f'LAYER_V8_{i}NAME']
        cu, diel = d.get(f'LAYER_V8_{i}COPTHICK'), d.get(f'LAYER_V8_{i}DIELHEIGHT')
        if cu or (diel and 'Solder' not in (d.get(f'LAYER_V8_{i}DIELMATERIAL') or '')):
            layers.append({'name': name, 'kind': 'copper' if cu else 'dielectric', 'mm': mm(cu or diel),
                           'material': d.get(f'LAYER_V8_{i}DIELMATERIAL'), 'er': d.get(f'LAYER_V8_{i}DIELCONST')})
        i += 1
    out = {'source': EB + 'JLCPCB_4Layers.RUL', 'stackup_source': EB + 'JLCPCB_4Layers.stackup',
           'rules': rows, 'stackup': layers, 'total_mm': round(sum(l['mm'] for l in layers), 2)}
    OUT.write_text(json.dumps(out, indent=1))
    for r in rows:
        print(r['label'], r['mm'], file=sys.stderr)
    print(layers, out['total_mm'], file=sys.stderr)


if __name__ == '__main__':
    main()
