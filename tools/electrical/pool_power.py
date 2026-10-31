#!/usr/bin/env python3
"""ESC telemetry from a pool bag -> public/data/electrical/pool_power.json.

Reads /talos/state/thrusters/telemetry (riptide_msgs2/DshotPartialTelemetry, one message per ESC board about
every 0.5 s: per-ESC voltage, current, temperature, rpm from the APD ESCs' UART telemetry) and
/talos/thruster_forces (the MPC's commanded force per thruster, 20 Hz). Bins both into 1 s steps and writes
  t        seconds from the first telemetry message
  v        bus voltage: median of the 8 ESC voltage readings (V)
  i        measured thruster current: sum of the 8 ESC currents (A)
  f        commanded thrust: sum of |force| over the 8 thrusters, averaged over the bin (N)
  fmax     largest single-thruster |force| in the bin (N)
  temp     hottest ESC (deg C)
  iest     thruster current estimated from the commanded forces with Blue Robotics' T200 data (t200.json, built by
           t200_data.py) at the measured bus voltage: every 20 Hz force sample, forward or reverse branch by sign,
           interpolated between the two nearest voltage sheets, then averaged over the bin (A)
plus run totals.

Needs ROS 2 Humble and riptide_msgs2 sourced:
  source /opt/ros/humble/setup.bash; source ~/osu-uwrt/release/install/setup.bash
  python3 tools/electrical/pool_power.py ~/robot/mpc_ident/runs/talos_20261026_204748/bag 2026-10-26
"""
import json
import sys
from pathlib import Path

import numpy as np
import rosbag2_py
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message

OUT = Path(__file__).resolve().parents[2] / 'public/data/electrical/pool_power.json'
T200 = json.loads((Path(__file__).resolve().parents[2] / 'public/data/electrical/t200.json').read_text())['volts']
VOLTS = sorted(int(v) for v in T200)


def t200_current(force, volts):
    """Supply current (A) of one T200 making `force` N (sign = direction) on a `volts` supply."""
    def at(v):
        br = np.array(T200[str(v)]['forward' if force >= 0 else 'reverse'])
        return float(np.interp(abs(force), np.r_[0, br[:, 0]], np.r_[0, br[:, 1]]))
    v = min(max(volts, VOLTS[0]), VOLTS[-1])
    lo = max(x for x in VOLTS if x <= v)
    hi = min(x for x in VOLTS if x >= v)
    if lo == hi:
        return at(lo)
    w = (v - lo) / (hi - lo)
    return (1 - w) * at(lo) + w * at(hi)
TEL, FORCES = '/talos/state/thrusters/telemetry', '/talos/thruster_forces'


def read(bag):
    r = rosbag2_py.SequentialReader()
    r.open(rosbag2_py.StorageOptions(uri=bag, storage_id='sqlite3'), rosbag2_py.ConverterOptions('cdr', 'cdr'))
    types = {t.name: t.type for t in r.get_all_topics_and_types()}
    r.set_filter(rosbag2_py.StorageFilter(topics=[TEL, FORCES]))
    cls = {k: get_message(types[k]) for k in (TEL, FORCES)}
    tel, frc = [], []
    while r.has_next():
        k, data, t = r.read_next()
        m = deserialize_message(data, cls[k])
        t *= 1e-9
        if k == TEL:
            s = m.start_thruster_num
            for j, e in enumerate(m.esc_telemetry):
                tel.append([t, s + j, e.voltage, e.current, e.temperature_c, e.rpm, m.vcc_voltage, e.consumption_ah, float(e.esc_online)])
        else:
            frc.append([t] + list(m.data)[:8])
    return np.array(tel), np.array(frc)


def main():
    bag, label = sys.argv[1], sys.argv[2]
    tel, frc = read(bag)
    t0 = tel[:, 0].min()
    tel[:, 0] -= t0
    frc[:, 0] -= t0
    # ESC voltage readings occasionally glitch (one 135 V sample in 2026-10-26); the median below skips them
    edges = np.arange(0, tel[:, 0].max() + 1.0, 1.0)
    rows = []
    for a, b in zip(edges[:-1], edges[1:]):
        w = (tel[:, 0] >= a) & (tel[:, 0] < b)
        fw = (frc[:, 0] >= a) & (frc[:, 0] < b)
        if not w.any() or not fw.any():
            continue
        # latest reading of each ESC within the bin
        cur = {}
        for row in tel[w]:
            cur[int(row[1])] = row
        if len(cur) < 8:
            continue
        rr = np.array(list(cur.values()))
        v = float(np.median(rr[(rr[:, 2] > 5) & (rr[:, 2] < 30), 2]))
        f = frc[fw, 1:9]
        iest = float(np.mean([sum(t200_current(x, v) for x in sample) for sample in f]))
        rows.append([round(a, 1), round(v, 3), round(float(rr[:, 3].sum()), 3), round(float(np.abs(f).sum(1).mean()), 2),
                     round(float(np.abs(f).max()), 2), int(rr[:, 4].max()), round(iest, 3)])
    rows = np.array(rows)
    # totals from the ESCs' own coulomb counters (last reading of each ESC)
    last = {}
    for row in tel:
        last[int(row[1])] = row
    ah = float(sum(r[7] for r in last.values()))
    dur = float(rows[-1, 0] - rows[0, 0])
    out = {
        'label': label,
        'bag': Path(bag).parent.name,
        'about': 'Talos pool identification run, untethered. ESC telemetry (APD 80F3 UART) and MPC thruster forces, binned to 1 s.',
        'columns': ['t', 'v', 'i', 'f', 'fmax', 'temp', 'iest'],
        'rows': rows.tolist(),
        'totals': {
            'duration_s': round(dur, 1),
            'esc_consumption_ah': round(ah, 4),
            'mean_current_a': round(float(rows[:, 2].mean()), 3),
            'peak_current_a': round(float(rows[:, 2].max()), 2),
            'mean_thrust_n': round(float(rows[:, 3].mean()), 2),
            'peak_thrust_n': round(float(rows[:, 3].max()), 2),
            'v_start': round(float(np.median(rows[:30, 1])), 2),
            'v_end': round(float(np.median(rows[-30:, 1])), 2),
            'v_min': round(float(rows[:, 1].min()), 2),
            'temp_max': int(rows[:, 5].max()),
            'est_mean_current_a': round(float(rows[:, 6].mean()), 2),
            'est_peak_current_a': round(float(rows[:, 6].max()), 2),
            'est_charge_ah': round(float(rows[:, 6].sum()) / 3600, 3),
            'est_energy_wh': round(float((rows[:, 6] * rows[:, 1]).sum()) / 3600, 2),
            'esc_current_at_floor_frac': round(float(np.mean(rows[:, 2] <= 0.33)), 3),
        },
    }
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(json.dumps(out['totals'], indent=1), file=sys.stderr)
    print('wrote', OUT, OUT.stat().st_size, file=sys.stderr)


if __name__ == '__main__':
    main()
