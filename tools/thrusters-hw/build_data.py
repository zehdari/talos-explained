#!/usr/bin/env python3
"""Data for the "Thrusters and ESCs" chapter -> public/data/thrusters-hw/thrusters.json.

Inputs (all read-only):
  - riptide_core (followpath-speed): riptide_descriptions/config/talos.yaml   thruster names, types, poses, COM
  - riptide_control (mpc): riptide_mpc/config/models/talos.yaml               mass/COM the MPC uses, limits, K_T
  - riptide_control (mpc): riptide_mpc/data/thruster_cal_2023-10-10/*.csv     the team's force-gauge runs
  - titan_firmware (master): talos/ESCBoard                                   inversion mask, gains, FF, DShot constants
  - public/data/cad/assembly.json                                             CAD thruster positions (for the picture)
  - Blue Robotics "T200 Public Performance Data 10-20V (September 2019)" .xlsx (argument 1), from
    https://cad.bluerobotics.com/T200-Public-Performance-Data-10-20V-September-2019.xlsx
  - the 2026-10-26 untethered identification run (pool_identify_node, run talos_20261026_204748):
      argument 2: thruster_forces + state_kill extracted to an .npz with
        ~/robot/mpc_ident/tools/extract.py <bag dir> untethered.npz
        (the bag is the Orin's recording of that run; a copy is in ~/robot/mpc_ident/runs/talos_20261026_204748/bag)
      argument 3: the run directory with segments.csv (what each test segment was) and recording.csv
        (its samples, with times), written by pool_identify_node. Used to drop the identification inputs
        (releases with every thruster off, per-thruster ramps, null-space patterns), so the pool statistics
        are only what the MPC chose itself.

    python3 -I tools/thrusters-hw/build_data.py T200-Public-Performance-Data-10-20V-September-2019.xlsx \
        untethered.npz ~/robot/mpc_ident/runs/talos_20261026_204748

Prints the facts the page quotes, so they can be checked against the text.
"""
import csv
import json
import math
import re
import sys
import zipfile
from pathlib import Path

import numpy as np
import yaml

HOME = Path.home()
SITE = Path(__file__).resolve().parents[2]
CORE = HOME / 'osu-uwrt/release/src/riptide_core'
CTRL = HOME / 'osu-uwrt/release/src/riptide_control'
FW = HOME / 'osu-uwrt/development/titan_firmware/talos/ESCBoard'
OUT = SITE / 'public/data/thrusters-hw/thrusters.json'
KGF = 9.80665


def rpy_matrix(r, p, y):
    """R = Rz(y) Ry(p) Rx(r), as riptide_mpc's rpyToQuaternion and URDF."""
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    return np.array([
        [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr],
        [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr],
        [-sp, cp * sr, cp * cr],
    ])


def firmware():
    core1 = (FW / 'src/core1.c').read_text()
    tc = (FW / 'src/Thruster_Controller/ThrusterController.c').read_text()
    dh = (FW / 'include/dshot.h').read_text()
    masks = [int(m, 2) for m in re.findall(r'inverted_mask = 0b([01]+);', core1)]
    gain = lambda name: int(re.search(rf'core1_set_{name}\((\d+)\)', core1).group(1))
    ff_f = [int(x) for x in re.search(r'dShotValue = (-?\d+) \+ (\d+) \* targetRPM \+ (\d+) \* \(targetRPM', tc).groups()]
    ff_r = [int(x) for x in re.search(r'dShotValue = (-?\d+) \+ (\d+) \* targetRPM - (\d+) \* \(targetRPM', tc).groups()]
    define = lambda name: int(re.search(rf'#define {name} (\d+)', dh).group(1))
    return {
        'inverted_mask': masks,  # per board, bit i = slot i
        'p_gain': gain('p_gain'), 'i_gain': gain('i_gain'), 'i_bound': gain('i_bound'),
        'hard_limit': gain('hard_limit'), 'min_command': gain('min_command'),
        'ff_forward': ff_f, 'ff_reverse': [ff_r[0], ff_r[1], -ff_r[2]],  # c0 + c1 rpm + c2 rpm^2, all / 1e6
        'ff_deadzone_rpm': 50,
        'dshot_rate_k': define('DSHOT_RATE'), 'pole_pairs': define('ESC_NUM_POLE_PAIRS'),
        'cmd_timeout_ms': define('DSHOT_MIN_UPDATE_RATE_MS'), 'timeout_penalty_ms': define('DSHOT_UPDATE_DISABLE_TIME_MS'),
        'powerup_delay_ms': define('ESC_POWERUP_DELAY_MS'), 'min_frame_us': define('DSHOT_MIN_FRAME_TIME_US'),
        'telem_packet_delay': define('TELEM_PACKET_DELAY'), 'esc_on_mv': define('ESC_POWER_THRESHOLD_MV'),
        # APD configurator settings as stored on Talos's ESCs: [index, value, the team's note on its meaning]
        'esc_config': esc_config(),
    }


def esc_config():
    d = FW / 'esc_firmware_patching'
    values = [int(x) for x in (d / 'Talos_Config.cfg').read_text().split()]
    notes = {}
    for line in (d / 'settings_meanings.txt').read_text().splitlines():
        m = re.match(r'\s*(\d+): (.*)', line)
        if m:
            notes[int(m.group(1))] = m.group(2).strip()
    return [[i, v, notes.get(i, '')] for i, v in enumerate(values)]


def blue_robotics(path):
    z = zipfile.ZipFile(path)
    strings = [re.sub(r'<[^>]+>', '', s).strip() for s in
               re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode(), re.S)]
    names = re.findall(r'<sheet [^>]*name="([^"]+)"', z.read('xl/workbook.xml').decode())
    out = {}
    for i, name in enumerate(names, 1):
        m = re.match(r'(\d+) V', name)
        if not m:
            continue
        rows = re.findall(r'<row [^>]*>(.*?)</row>', z.read(f'xl/worksheets/sheet{i}.xml').decode(), re.S)
        cell = r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(?:<f[^>]*?/>|<f[^>]*>.*?</f>)?(?:<v>([^<]*)</v>)?</c>)'
        head = {c: strings[int(v)].lower() for c, a, v in re.findall(cell, rows[0]) if 't="s"' in a and v}
        col = {k: next(c for c, h in head.items() if h.startswith(k)) for k in ('pwm', 'rpm', 'current', 'power', 'force')}
        data = []
        for r in rows[1:]:
            v = {c: float(x) for c, a, x in re.findall(cell, r) if x and 't="s"' not in a}
            if all(col[k] in v for k in col):
                data.append([v[col['pwm']], round(v[col['rpm']]), round(v[col['current']], 3),
                             round(v[col['power']], 2), round(v[col['force']] * KGF, 3)])
        data.sort()
        out[int(m.group(1))] = data
    return out


def gauge_runs():
    runs = {}
    for f in sorted((CTRL / 'riptide_mpc/data/thruster_cal_2023-10-10').glob('*.csv')):
        rows = list(csv.reader(f.open()))
        data = [[int(r[0]), int(r[1]), float(r[2])] for r in rows[1:] if r]
        out = []
        for sign in (1, -1):  # tare each direction at its lowest command, as fit_thrust_curve.py does
            d = sorted([x for x in data if np.sign(x[0]) == sign], key=lambda x: abs(x[0]))
            if not d:
                continue
            f0 = d[0][2]
            out += [[x[0], x[1], round(abs(x[2] - f0) * sign, 3)] for x in d]
        runs[f.stem] = sorted(out)
    return runs


def segment_kinds(t, run_dir):
    """Label each sample time with its identification segment kind ('between' outside any segment) and,
    for 'run' segments, the label and speed."""
    run_dir = Path(run_dir).expanduser()
    segs = {int(r['id']): r for r in csv.DictReader((run_dir / 'segments.csv').open())}
    span = {}
    for r in csv.DictReader((run_dir / 'recording.csv').open()):
        s, ts = int(r['segment']), float(r['t'])
        a, b = span.get(s, (ts, ts))
        span[s] = (min(a, ts), max(b, ts))
    kind = np.full(len(t), 'between', dtype=object)
    label = np.full(len(t), '', dtype=object)
    for s, (a, b) in span.items():
        m = (t >= a - 0.13) & (t <= b + 0.13)  # recording.csv is at 8 Hz: half a sample either side
        kind[m] = segs[s]['kind']
        label[m] = f"{segs[s]['label']} {segs[s]['speed']}"
    return kind, label, segs


def usage(npz_path, run_dir, T, limit, total_limit):
    d = np.load(npz_path)
    f = d['thruster_forces']
    kill = d['state_kill']
    t = f[:, 0]
    enabled = np.interp(t, kill[:, 0], kill[:, 1]) < 0.5
    kind, label, segs = segment_kinds(t, run_dir)
    # Identification inputs, not the MPC's own choice: releases (all thrusters forced to 0),
    # ramps (one thruster forced to a ramp) and null-space patterns (a bias added on top).
    ident = np.isin(kind, ['release', 'ramp', 'null'])
    share = {k: round(float((enabled & (kind == k)).sum() / enabled.sum()), 3)
             for k in ('hold', 'ramp', 'null', 'run', 'release', 'between')}
    keep = enabled & ~ident
    F = f[keep, 1:]
    absF = np.abs(F)
    total = absF.sum(1)
    at_cap = total >= total_limit - 0.1
    kk = kind[keep]
    edges = np.arange(-24.5, 25, 1.0)  # 1 N bins; the middle one is the idle band, |F| <= 0.5 N
    hist = [np.histogram(F[:, i], bins=edges)[0].tolist() for i in range(8)]
    wrench = (T @ F.T).T
    hold = enabled & (kind == 'hold') & np.array([lab.startswith('hold level') for lab in label])
    run_max = max(float(r['speed']) for r in segs.values() if r['kind'] == 'run' and int(r['axis']) in (0, 1))
    return {
        'source': 'thruster_forces (the MPC command, 20 Hz), untethered identification run 2026-10-26 20:47 '
                  '(talos_20261026_204748), without releases, thruster ramps and null-space patterns',
        'minutes_total': round(float((t[-1] - t[0]) / 60), 1),
        'minutes': round(float(keep.sum() / 20 / 60), 1),
        'samples': int(len(F)),
        'enabled_fraction': round(float(enabled.mean()), 3),
        'segment_share': share,
        'run_max_speed': run_max,
        'idle_band': 0.5,
        'forward': [round(float(x), 4) for x in (F > 0.5).mean(0)],
        'reverse': [round(float(x), 4) for x in (F < -0.5).mean(0)],
        'idle': [round(float(x), 4) for x in (absF <= 0.5).mean(0)],
        'at_limit': [round(float(x), 5) for x in (absF >= limit - 0.1).mean(0)],
        'at_limit_in_runs': round(float(((absF >= limit - 0.1).any(1) & (kk == 'run')).sum()
                                        / max(1, (absF >= limit - 0.1).any(1).sum())), 3),
        'mean_abs': [round(float(x), 2) for x in absF.mean(0)],
        'p99_abs': [round(float(x), 1) for x in np.percentile(absF, 99, axis=0)],
        'max_abs': [round(float(x), 1) for x in absF.max(0)],
        'hist_edges': edges.tolist(),
        'hist': hist,
        'total_hist_edges': list(range(0, 80, 5)),
        'total_hist': np.histogram(total, bins=list(range(0, 80, 5)))[0].tolist(),
        'total_at_cap': round(float(at_cap.mean()), 4),
        'cap_in_runs': round(float((at_cap & (kk == 'run')).sum() / at_cap.sum()), 3),
        'cap_by_run': {k: round(float(at_cap[label[keep] == k].mean()), 3)
                       for k in sorted(set(label[keep][kk == 'run']))},
        'total_median': round(float(np.median(total)), 1),
        'total_p90': round(float(np.percentile(total, 90)), 1),
        'mean_wrench': [round(float(x), 2) for x in wrench.mean(0)],
        # Holding still, level: the two 'hold level' segments. What it takes to stay put (trim and buoyancy).
        'hold_level_wrench': [round(float(x), 2) for x in (T @ f[hold, 1:].T).T.mean(0)],
        'hold_level_forces': [round(float(x), 2) for x in f[hold, 1:].mean(0)],
        'hold_level_seconds': round(float(hold.sum() / 20), 1),
    }


def main():
    vehicle = yaml.safe_load((CORE / 'riptide_descriptions/config/talos.yaml').read_text())
    model = yaml.safe_load((CTRL / 'riptide_mpc/config/models/talos.yaml').read_text())
    fw = firmware()
    com = np.array(model['com'])  # the MPC's model file gives its own COM (vehicle config frame)
    cad = json.loads((SITE / 'public/data/cad/assembly.json').read_text())['thrusters']

    # ctx-thrusters-front.webp (1600 x 1265, seen from the bow): measured from the orange rotor blobs,
    # CAD X (port) -> right, CAD Y (up) -> up, centre (800, 545) px, 1.645 px/mm.
    def front_px(p):
        return [round(800 + p[0] * 1.645), round(545 - p[1] * 1.645)]

    thrusters, cols = [], []
    for i, t in enumerate(vehicle['thrusters']):
        x, y, z, r, p, yw = t['pose']
        d = rpy_matrix(r, p, yw) @ np.array([1.0, 0, 0])
        d[np.abs(d) < 1e-3] = 0
        pos = np.array([x, y, z]) - com
        m = np.cross(pos, d)
        cols.append(np.concatenate([d, m]))
        board, slot = divmod(i, 4)
        inverted = bool(fw['inverted_mask'][board] >> slot & 1)
        name = t['name']
        outer = name[0] == 'V'
        port, upper = name[2] == 'P', name[1] == 'U'
        match = [c for c in cad if c['position'].startswith('outer' if outer else 'inner')
                 and (c['origin_cad_mm'][0] > 0) == port and (c['origin_cad_mm'][1] > 0) == upper]
        assert len(match) == 1, name
        thrusters.append({
            'index': i, 'name': name, 'type': t['type'], 'pose': t['pose'],
            'board': board, 'slot': slot, 'can_id': (2 + board) << 6 | 1 << 5 | 1 << 4,
            'inverted': inverted,
            'dir': [round(float(v), 4) for v in d],
            'pos_com': [round(float(v), 4) for v in pos],
            'moment': [round(float(v), 4) for v in m],
            'cad_part': match[0]['part'],
            'front_px': front_px(match[0]['origin_cad_mm']),
        })
    T = np.array(cols).T
    for t in thrusters:
        assert t['inverted'] == (t['type'] == 1), f"{t['name']}: type {t['type']} vs firmware inversion {t['inverted']}"

    hw = model['hardware']
    dyn = model['thruster_dynamics']
    rho, D = model['water_density'], hw['propeller_diameter']
    out = {
        'sources': {
            'vehicle': 'riptide_core followpath-speed riptide_descriptions/config/talos.yaml',
            'model': 'riptide_control mpc riptide_mpc/config/models/talos.yaml',
            'firmware': 'titan_firmware master talos/ESCBoard',
            't200': 'Blue Robotics, T200 Public Performance Data 10-20V (September 2019)',
        },
        'com': model['com'],
        'thrusters': thrusters,
        'T': [[round(float(v), 4) for v in row] for row in T],
        'limits': {'per_thruster': dyn['forward_max_force'], 'per_thruster_reverse': dyn['reverse_max_force'],
                   'total': hw['total_thrust_limit']},
        'dynamics': {k: dyn[k] for k in ('delay', 'rise_time_constant', 'fall_time_constant', 'slew_rate')},
        'propeller': {'diameter': D, 'rho': rho, 'kt_forward': hw['thrust_coefficient_forward'],
                      'kt_reverse': hw['thrust_coefficient_reverse']},
        'firmware': fw,
        'test': {'rpm': 300, 'seconds': 3.0, 'period_ms': 30},
        't200': blue_robotics(sys.argv[1]),
        'gauge_2023': gauge_runs(),
        'usage': usage(sys.argv[2], sys.argv[3], T, dyn['forward_max_force'], hw['total_thrust_limit']),
    }

    # Facts quoted in the text
    scale = rho * D ** 4 / 3600
    F = lambda rpm, k: (k[0] + k[1] * rpm) * scale * rpm * rpm
    kf, kr = hw['thrust_coefficient_forward'], hw['thrust_coefficient_reverse']
    def inv(f, k):
        r = np.linspace(0, 6000, 600001)
        return float(np.interp(f, F(r, k), r))
    print('rpm for 24 N fwd/rev', round(inv(24, kf)), round(inv(24, kr)))
    print('force at 300 rpm fwd', round(F(300, kf), 3))
    for v in (16, 18, 20):
        rows = out['t200'][v]
        fw_rows = [r for r in rows if r[0] > 1500 and r[4] > 0]
        cur = np.interp(24, [r[4] for r in fw_rows], [r[2] for r in fw_rows])
        print(f'{v} V: max fwd {max(r[4] for r in rows):.1f} N, max rev {-min(r[4] for r in rows):.1f} N, '
              f'current at 24 N fwd {cur:.1f} A, max current {max(r[2] for r in rows):.1f} A')
    # gauge vs Blue Robotics at the same rpm (forward, above 2 N)
    for name, run in out['gauge_2023'].items():
        pts = [(r[1], r[2]) for r in run if r[0] > 0 and r[2] > 2]
        ratio = np.mean([f / F(rpm, kf) for rpm, f in pts])
        print(f'gauge {name}: forward force / BR fit at same rpm = {ratio:.2f} ({len(pts)} pts); '
              f'max {max(r[0] for r in run)} -> {max(r[1] for r in run)} rpm, {max(r[2] for r in run):.1f} N')
    u = out['usage']
    print('usage', u['minutes'], 'of', u['minutes_total'], 'min; shares', u['segment_share'], 'cap in runs', u['cap_in_runs'],
          'limit in runs', u['at_limit_in_runs'])
    print('cap by run', u['cap_by_run'])
    print('usage total at cap', u['total_at_cap'], 'median total', u['total_median'],
          'p90', u['total_p90'], 'mean wrench', u['mean_wrench'])
    print('level hold', u['hold_level_seconds'], 's: wrench', u['hold_level_wrench'], 'forces', u['hold_level_forces'])
    print('at per-thruster limit', u['at_limit'])
    print('idle', u['idle'])
    print('T rank', np.linalg.matrix_rank(T))
    for t in thrusters:
        print(t['index'], t['name'], 'board', t['board'], 'slot', t['slot'], 'inv', t['inverted'], 'dir', t['dir'],
              'px', t['front_px'], hex(t['can_id']))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT, OUT.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
