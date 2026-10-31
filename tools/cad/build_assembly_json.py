"""Turn the SolidWorks tree dump (dump_tree.cs -> tree_Talos.jsonl) into public/data/cad/assembly.json.

usage: python3 tools/cad/build_assembly_json.py tools/cad/tree_Talos.jsonl public/data/cad/assembly.json
Frame: SolidWorks assembly frame of Talos.SLDASM, mm. +Z = bow, +X = port, +Y = up.
"""
import json, sys, re, collections, math

src, dst = sys.argv[1], sys.argv[2]
rows = [json.loads(l) for l in open(src)]
ASM_MASS = {"kg": 36.3031, "com_mm": [7.30, -28.03, -10.66]}   # from dump_tree.cs run on 2026-10-30 (whole assembly)
ASM_GETBOX = [-511.7, -468.1, -357.1, 511.7, 372.2, 404.1]      # AssemblyDoc.GetBox, includes non-visible geometry

by_name = {r['name']: r for r in rows}
children = collections.defaultdict(list)
for r in rows:
    children[r['parent']].append(r)


def fname(r):
    return re.split(r'[\\/]', r['file'])[-1]


def kind(r):
    return 'assembly' if fname(r).lower().endswith('.sldasm') else 'part'


def kg(r):
    return round(r['mass']['kg'], 5) if isinstance(r['mass'], dict) else None


def size(r):
    b = r['box']
    return [round(b[k + 3] - b[k], 1) for k in range(3)] if b else None


nodes = []


def walk(parent_name, parent_id):
    groups = collections.OrderedDict()
    for r in children[parent_name]:
        key = (fname(r), r['config'], r['suppressed'])
        groups.setdefault(key, []).append(r)
    for (fn, cfg, supp), inst in groups.items():
        r = inst[0]
        nid = r['name']
        label = re.sub(r'-\d+$', '', r['name'].split('/')[-1])
        n = {'id': nid, 'name': label, 'parent': parent_id, 'file': fn, 'kind': kind(r), 'count': len(inst),
             'mass_kg': None if supp else kg(r), 'material': r['material'] or None,
             'size_mm': size(r), 'suppressed': supp or None, 'hidden': r['hidden'] or None}
        if len(inst) > 1:
            n['instances'] = [i['name'].split('/')[-1] for i in inst]
        nodes.append({k: v for k, v in n.items() if v is not None})
        if not supp:
            walk(r['name'], nid)


walk('', None)


def visible_box(filt):
    lo = [1e9] * 3; hi = [-1e9] * 3
    for r in rows:
        if r['nchild'] or r['suppressed'] or r['hidden'] or not r['box'] or 'DVL Sensor Cone' in r['name']:
            continue
        if not filt(r['name']):
            continue
        b = r['box']
        for k in range(3):
            lo[k] = min(lo[k], b[k]); hi[k] = max(hi[k], b[k + 3])
    return {'min': [round(v, 1) for v in lo], 'max': [round(v, 1) for v in hi], 'size': [round(hi[k] - lo[k], 1) for k in range(3)]}


def topmass(pats):
    tot = 0.0; names = []
    for r in rows:
        if r['depth'] == 0 and not r['suppressed'] and any(re.search(p, r['name']) for p in pats):
            tot += r['mass']['kg']; names.append(r['name'])
    return round(tot, 3), names


SUBSYSTEMS = [
    ('frame_thruster_modules', 'Frame corner modules (Dorito/Taco) incl. 8 T200s, guards, handles, foam', [r'^Dorito-2$', r'^MirroredDorito-3$', r'^Taco-2$', r'^Mirrored_Taco-5$']),
    ('frame_crossbars_rails', 'Holy L Bars, battery mounting rails, tension cables and turnbuckles', [r'^Holy L Bar', r'Battery Mounting Rail', r'^(Side|Top|Bottom) Cable', r'Turnbuckle']),
    ('main_housing', 'Talos Main Housing: two hulls, lids, viewports, electronics cages, buoyancy bottles', [r'^Talos Main Housing']),
    ('battery_pods', 'Two Smart Battery Housing Assemblies', [r'^Smart Battery Housing Assembly']),
    ('dvl', 'DVL Assembly (Nortek DVL 1000 model + supports)', [r'^DVL Assembly']),
    ('down_camera', 'Down camera (ZED X Mini) + DFC Mount', [r'^ZEDX_Mini', r'^DFC Mount']),
    ('torpedo_marker_launcher', 'Torpedoes + Markers V8 launcher, servo housing, holder', [r'^Torpedoes \+ Markers V8', r'^Torpservoholder', r'^ServoHousing', r'^mounting']),
    ('claw', 'Claw (EMERGENCYCLAWASSEMBLY)', [r'^EMERGENCYCLAWASSEMBLY']),
    ('magnet_poker', 'Magnet poker assembly', [r'^Magnet poker']),
    ('acoustics', 'Acoustics pods (hydrophones), acoustic mount, transducer', [r'^Acoustics Pods', r'^Acoustic_Mount', r'^Transducer-2']),
    ('kill_switch_covers', 'Kill switch and SubConn cover', [r'^Kill Switch', r'^Subconn Cover']),
    ('cables', 'Modelled cables (thruster, battery, DVL)', [r'Thruster \d Cable', r'Battery .*Cable', r'^Macoroni', r'^DVL Cable']),
    ('duplicate_foam', 'Top-level Dorito Foam-1/-3: duplicates of foam already inside Mirrored_Taco-5 and MirroredDorito-3', [r'^Dorito Foam-']),
]
subs = []
for sid, label, pats in SUBSYSTEMS:
    m, names = topmass(pats)
    subs.append({'id': sid, 'label': label, 'mass_kg': m, 'components': names})
covered = set(n for s in subs for n in s['components'])
rest = [r['name'] for r in rows if r['depth'] == 0 and not r['suppressed'] and r['name'] not in covered]

# thrusters: T200 parts, local +z = duct axis (measured from the part transforms)
thr = []
for r in rows:
    if 'T200' not in r['name']:
        continue
    x = r['xf']
    axis = x[6:9]
    c = x[9:12]
    module = r['name'].split('/')[0]
    inner = 'Inner' in r['name']
    thr.append({'part': r['name'], 'module': module, 'position': 'inner (angled)' if inner else 'outer (fore-aft)',
                'origin_cad_mm': [round(v, 1) for v in c],
                'axis_cad': [round(v, 3) for v in axis],
                'origin_robot_m': [round(c[2] / 1000, 4), round(c[0] / 1000, 4), round(c[1] / 1000, 4)],
                'axis_robot': [round(axis[2], 3), round(axis[0], 3), round(axis[1], 3)],
                'mass_kg': kg(r), 'material': r['material'] or None})

mat = collections.defaultdict(float)
for r in rows:
    if r['nchild'] == 0 and not r['suppressed'] and isinstance(r['mass'], dict):
        mat[r['material'] or '(none: SolidWorks default density 1000 kg/m^3)'] += r['mass']['kg']

out = {
    'source': 'Talos 7-11-26 SolidWorks CAD (Talos.SLDASM, configuration Default, saved suppression and visibility kept), '
              'measured with the SolidWorks 2025 API on 2026-10-30. Generated by tools/cad/build_assembly_json.py.',
    'frame': {'units': 'mm and kg (origin_robot_m in metres)',
              'cad_axes': '+X = port, +Y = up, +Z = bow (forward)',
              'robot_axes': 'robot x (forward) = CAD +Z, robot y (port/left) = CAD +X, robot z (up) = CAD +Y; origin = CAD origin, '
                            'NOT the riptide base_link'},
    'total': {
        'mass_kg': ASM_MASS['kg'], 'com_cad_mm': ASM_MASS['com_mm'],
        'mass_note': 'Sum over all resolved components, including hidden ones (e.g. the hidden ZED2i, 0.237 kg) and two duplicate foam '
                     'blocks (0.856 kg). Parts with no material use SolidWorks\' default 1000 kg/m^3. Cables are only partly modelled.',
        'bbox_visible': visible_box(lambda n: True),
        'bbox_visible_without_claw_magnet': visible_box(lambda n: not n.startswith(('EMERGENCYCLAWASSEMBLY', 'Magnet poker'))),
        'bbox_frame': visible_box(lambda n: n.startswith(('Dorito-2', 'MirroredDorito-3', 'Taco-2', 'Mirrored_Taco-5', 'Holy L Bar'))),
        'bbox_solidworks_getbox': {'min': ASM_GETBOX[:3], 'max': ASM_GETBOX[3:], 'size': [round(ASM_GETBOX[k + 3] - ASM_GETBOX[k], 1) for k in range(3)]},
        'components_resolved': sum(1 for r in rows if not r['suppressed']),
        'parts_resolved': sum(1 for r in rows if not r['suppressed'] and r['nchild'] == 0),
        'top_level_suppressed': [r['name'] for r in rows if r['depth'] == 0 and r['suppressed']],
    },
    'subsystems': subs,
    'subsystems_unassigned': rest,
    'thrusters': thr,
    'mass_by_material_kg': {k: round(v, 3) for k, v in sorted(mat.items(), key=lambda kv: -kv[1])},
    'nodes': nodes,
}
json.dump(out, open(dst, 'w'), indent=1)
print(dst, len(nodes), 'nodes', sum(s['mass_kg'] for s in subs), 'kg in subsystems; unassigned', rest)
