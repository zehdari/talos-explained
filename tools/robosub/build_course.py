#!/usr/bin/env python3
"""Build public/data/robosub/course.json: the RoboSub 2026 course as Talos sees it, for robosub.html.

    python3 tools/robosub/build_course.py

Sources (all read, nothing invented):
  - Nereus's robosub_2026 pack (~/osu-uwrt/release/nereus/content/packs): the pool, every task's geometry,
    the scenario's task placements (which match Talos's prior map), the scoring points and score rows.
  - riptide_mapping2's init_data, installed copy (the layout Nereus's course matches; the mapping-estimator
    branch's src config has the table moved for RPAC testing): the navigation waypoints the tree flies to.
  - riptide_autonomy trees/RepairCompMpcTree.xml: line numbers of each task's subtree, for links.
  - public/data/mission_hero_exact.json (built by tools/perception from the exact-course Nereus run bag):
    Talos's true path, decimated, with task phases taken from the tree's own log lines.
"""
import json
import math
import re
from pathlib import Path

import yaml

HOME = Path.home()
ROOT = Path(__file__).resolve().parents[2]
PACKS = HOME / 'osu-uwrt/release/nereus/content/packs'
TASKS = PACKS / 'tasks/robosub_2026'
SCEN = PACKS / 'scenarios/talos_uwrt/scenario.yaml'
POOL = PACKS / 'pools/robosub_2026/pool.yaml'
MAPCFG = HOME / 'osu-uwrt/release/install/riptide_mapping2/share/riptide_mapping2/config/config.yaml'
TREE = HOME / 'osu-uwrt/release/src/riptide_autonomy/trees/RepairCompMpcTree.xml'
RUN = ROOT / 'public/data/mission_hero_exact.json'
OUT = ROOT / 'public/data/robosub/course.json'

load = lambda p: yaml.safe_load(open(p))
r3 = lambda v: round(v, 3)


def yaw_of(q):  # wxyz -> yaw (rad)
    w, x, y, z = q
    return math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))


class Place:
    """A task frame placed in the world: position + yaw (deg)."""

    def __init__(self, p, yaw_deg):
        self.p, self.yaw = p, math.radians(yaw_deg)

    def __call__(self, x, y):
        c, s = math.cos(self.yaw), math.sin(self.yaw)
        return [r3(self.p[0] + c * x - s * y), r3(self.p[1] + s * x + c * y)]


def frames(task):
    return {f['id']: f for f in task.get('frames', [])}


def main():
    scen = load(SCEN)
    pool = load(POOL)
    tasks = {t: load(TASKS / f'{t}.yaml') for t in ['gate', 'slalom', 'torpedo', 'bins', 'surface', 'table']}
    pack = load(TASKS / 'tasks.yaml')
    place = {t['task']: Place(t['position_m'], t['yaw_deg']) for t in scen['task_placements']}
    depth = {t['task']: t['position_m'][2] for t in scen['task_placements']}
    yaw = {t['task']: t['yaw_deg'] for t in scen['task_placements']}
    out = {'source': 'nereus robosub_2026 pack + scenario talos_uwrt; riptide_mapping2 init_data (installed)'}

    # ---- pool outline and lane lines (pool frame -> world) ----
    pp = Place(scen['pool_placement']['position_m'], scen['pool_placement']['yaw_deg'])
    L, W = pool['parameters']['length_m'], pool['parameters']['width_m']
    out['pool'] = {'corners': [pp(0, 0), pp(L, 0), pp(L, W), pp(0, W)], 'length_m': L, 'width_m': W,
                   'depth_m': pool['parameters']['depth_m']}
    g = pool['markings']['lane_grid']
    inset, lanes = g['inset_m'], []
    n, sp = g['along_x']['count'], g['along_x']['spacing_m']
    for i in range(n):  # parallel to pool x, centred across the width
        y = W / 2 + (i - (n - 1) / 2) * sp
        lanes.append([pp(inset, y), pp(L - inset, y)])
    n, sp = g['along_y']['count'], g['along_y']['spacing_m']
    for i in range(n):
        x = L / 2 + (i - (n - 1) / 2) * sp
        lanes.append([pp(x, inset), pp(x, W - inset)])
    out['lanes'] = lanes
    out['lane_width_m'] = pool['markings']['width_m']

    # ---- tasks ----
    T = {}
    # Gate: posts, top bar, divider, the two role halves (task +X is the approach/start side).
    gp, gf = place['gate'], frames(tasks['gate'])
    boxes = {b['id']: b for b in tasks['gate']['props'][0]['parameters']['collision_boxes']}
    py = boxes['post_pos_y']['center_m'][1]
    T['gate'] = {
        'center': gp(0, 0), 'depth': depth['gate'], 'yaw': yaw['gate'],
        'posts': [gp(0, -py), gp(0, py)], 'divider': gp(0, 0),
        'halves': {k.replace('gate_', ''): gp(*gf[k]['position_m'][:2]) for k in ('gate_repair', 'gate_rescue')},
        'approach': gp(1.5, 0), 'width_m': boxes['top_bar']['size_m'][1],
        'opening_top_m': tasks['gate']['regions'][0]['parameters']['bounds_local']['z_lt_m'],
    }
    # Slalom: three rows, each white / red / white. Row half-width from the mesh extent (1.581 m incl. the 21 mm
    # pipe radius) -> poles at y = 0 and +-1.56 in the row frame.
    sp_, sf = place['slalom'], frames(tasks['slalom'])
    rows = []
    for rid in ('slalom_front', 'slalom_middle', 'slalom_back'):
        rx, ry = sf[rid]['position_m'][:2]
        rows.append({'id': rid, 'poles': [sp_(rx, ry - 1.56), sp_(rx, ry), sp_(rx, ry + 1.56)]})
    band = tasks['slalom']['regions'][0]['parameters']['depth_band_m']
    T['slalom'] = {'center': sp_(-2.12, 0.35), 'depth': depth['slalom'], 'yaw': yaw['slalom'], 'rows': rows,
                   'approach': sp_(1.5, 0), 'depth_band_m': band}
    # Torpedo board: 0.61 m square in the task's y-z plane; holes from the panel uv.
    tp, panel = place['torpedo'], tasks['torpedo']['regions'][0]['parameters']
    hs = panel['half_size_m']
    holes = []
    for h in panel['holes']:
        u, v = h['uv']
        holes.append({'id': h['id'], 'class': h['class'], 'size': h['size'],
                      'y': r3((u - 0.5) * 2 * hs), 'z': r3((v - 0.5) * 2 * hs), 'r': r3(h['radius_uv'] * 2 * hs)})
    T['torpedo'] = {'center': tp(0, 0), 'depth': depth['torpedo'], 'yaw': yaw['torpedo'],
                    'board': [tp(0, -hs), tp(0, hs)], 'face': tp(0.6, 0), 'half_size_m': hs, 'holes': holes}
    # Bins: four crates (class per the scenario's run options, else the pack default) and two magnet lights.
    bp, bf = place['bins'], frames(tasks['bins'])
    opts = {o['key']: o['default'] for o in pack['run_options']}
    opts.update(scen.get('run', {}).get('options', {}))
    crate = tasks['bins']['regions'][0]['parameters']
    T['bins'] = {'center': bp(0, 0), 'depth': depth['bins'], 'yaw': yaw['bins'], 'crate_m': crate['outer_width_m'],
                 'crates': [{'id': k, 'class': opts[f'{k}_class'], 'p': bp(*bf[k]['position_m'][:2])}
                            for k in ('bin_vinyl1', 'bin_vinyl2', 'bin_vinyl3', 'bin_vinyl4')],
                 'lights': [{'id': k, 'p': bp(*bf[k]['position_m'][:2])} for k in ('magnet_target1', 'magnet_target2')],
                 'trigger_m': tasks['bins']['regions'][4]['parameters']['trigger_distance_m']}
    # Octagon (surface task) and the table under it.
    op, of = place['surface'], frames(tasks['surface'])
    ap = tasks['surface']['regions'][0]['parameters']['apothem_m']
    rc = ap / math.cos(math.pi / 8)
    T['surface'] = {'center': op(0, 0), 'yaw': yaw['surface'], 'apothem_m': ap,
                    'octagon': [op(rc * math.cos(math.pi / 8 + k * math.pi / 4), rc * math.sin(math.pi / 8 + k * math.pi / 4)) for k in range(8)],
                    'signs': {k: op(*of[k]['position_m'][:2]) for k in ('compass', 'hammer_and_wrench', 'buoy', 'sos')}}
    tb, tf = place['table'], frames(tasks['table'])
    for o in scen.get('task_frames', []):  # the scenario moves some loose objects
        if o['task'] == 'table':
            tf[o['frame']] = {'position_m': o['position_m']}
    slab = tasks['table']['props'][0]['parameters']['collision_boxes'][0]['size_m'][0] / 2
    bx = {r['id']: r['parameters']['half_extents_xy_m'] for r in tasks['table']['regions']}
    expected = {p['id']: p['parameters']['expected_region'].replace('_basket', '')
                for p in tasks['table']['props'] if p['type'] == 'rigid_body'}

    def rect(cx, cy, hx, hy):
        return [tb(cx - hx, cy - hy), tb(cx + hx, cy - hy), tb(cx + hx, cy + hy), tb(cx - hx, cy + hy)]

    T['table'] = {'center': tb(0, 0), 'depth': depth['table'], 'yaw': yaw['table'], 'slab': rect(0, 0, slab, slab),
                  'baskets': {k.replace('_basket', ''): rect(tf[k]['position_m'][0], tf[k]['position_m'][1], *bx[k])
                              for k in ('helmet_basket', 'warning_basket')},
                  'props': [{'id': k, 'p': tb(*tf[k]['position_m'][:2]), 'basket': expected[k]}
                            for k in ('pill', 'bandage', 'nut_and_bolt', 'plug')]}
    out['tasks'] = T
    out['start'] = [r3(v) for v in scen['initial']['position_m'][:2]]
    out['start_depth'] = scen['initial']['position_m'][2]

    # ---- waypoints the tree flies between (mapping priors) ----
    init = load(MAPCFG)['/talos/riptide_mapping2']['ros__parameters']['init_data']
    wp = {}
    for k in ('pre_torpedo_pose', 'pre_table_pose', 'pre_bin_pose', 'pre_return_home'):
        p = init[k]['pose']
        assert init[k]['parent'] == 'map', k
        wp[k.replace('_pose', '')] = [r3(p['x']), r3(p['y'])]
    out['waypoints'] = wp

    # ---- points and score rows ----
    rules = pack['scoring_rules'][0]['parameters']
    out['points'] = rules['points']
    out['roles'] = rules['roles']
    out['score_rows'] = pack['score_rows']
    out['requires'] = pack['requires']

    # ---- tree line numbers ----
    lines = TREE.read_text().splitlines()
    ids = {}
    for i, l in enumerate(lines, 1):
        m = re.search(r'<BehaviorTree ID="([^"]+)"', l)
        if m:
            ids[m.group(1)] = i
        if 'Path: leave bins, straight home through the gate' in l:
            ids['_home_path'] = i
    out['tree_lines'] = {k: ids[k] for k in ('BehaviorTree', 'CompMissionTreeMpc', 'WaitForKillSwitch', 'PrepForRun', 'Dive',
                                             'GateTreeMpc', 'FlipTree', 'SlalomPathMpc', 'RandomPingerTree', 'TorpedoTreeMpc',
                                             'ShootBothObjectsMpc', 'NewTableTreeMpc', 'pickupObjectMpc', 'dropObjectMpc',
                                             'SurfaceTree', 'SpinTreeMpc', 'BinTreeMpc', 'MagnetTreeMpc', 'ActivateMagnetMpc',
                                             '_home_path')}
    out['tree_length'] = len(lines)

    # ---- the exact-course Nereus run: path + phases from the tree's own log ----
    run = json.load(open(RUN))
    marks = [('Gate', 'GATE TIME'), ('Slalom', 'SALMONI TIME'), ('Pinger', 'RANDOM PINGER TIME'),
             ('Torpedo', 'Setting mapping to target torpedo'), ('Table', 'set_camera_is_dfc: Successfully switched from ffc to dfc'),
             ('Bins', 'BIN TIME'), ('Magnets', 'BinaryClassifier started for class magnet'), ('Home', 'WINNING TIME')]
    starts = []
    for name, needle in marks:
        t = next(t for t, msg in run['tree_log'] if needle in msg and all(t > s for _, s in starts))
        starts.append((name, t))
    end = run['duration']
    out['run'] = {
        'phases': [[n, r3(t), r3(starts[i + 1][1] if i + 1 < len(starts) else end)] for i, (n, t) in enumerate(starts)],
        'start_t': r3(run['tree_log'][0][0]),
        'end_t': r3(end),
        # [t, x, y] every ~1 s
        'path': [[r3(p[0]), r3(p[1]), r3(p[2])] for p in run['truth_path'][::2]],
    }

    # ---- view box: everything drawn, plus a margin ----
    xs, ys = [], []

    def walk(o):
        if isinstance(o, list) and len(o) == 2 and all(isinstance(v, (int, float)) for v in o):
            xs.append(o[0]); ys.append(o[1])
        elif isinstance(o, list):
            for v in o: walk(v)
        elif isinstance(o, dict):
            for v in o.values(): walk(v)
    walk(T); walk(wp); walk(out['start']); walk([p[1:] for p in out['run']['path']])
    m = 1.6
    out['view'] = [r3(min(xs) - m), r3(min(ys) - m), r3(max(xs) + m), r3(max(ys) + m)]

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(f'wrote {OUT} ({OUT.stat().st_size // 1024} KB), view {out["view"]}, phases {out["run"]["phases"]}')


if __name__ == '__main__':
    main()
