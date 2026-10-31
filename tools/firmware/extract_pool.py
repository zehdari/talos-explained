#!/usr/bin/env python3
"""ESC board data from a real pool run, for the firmware chapter's telemetry figure.

Reads one riptide_mpc identification bag and writes public/data/firmware/pool_esc.json:
  - req: the RPM targets the MPC sent (command/requested_rpm, the same numbers it writes to CAN), 20 Hz
  - tel: each ESC board's state/thrusters/telemetry (2 Hz per board): ESC-reported RPM, current, temperature,
         supply voltage, disabled_flags, controller ticks
  - stats over the whole bag: core-1 loop rate, telemetry period, how often state/kill came in

Needs ROS 2 Humble and riptide_msgs2 sourced:
  source /opt/ros/humble/setup.bash; source ~/osu-uwrt/release/install/setup.bash
  systemd-run --user --scope -p MemoryMax=4G python3 tools/firmware/extract_pool.py BAGDIR OUT.json [t0 t1]
t0/t1 pick the window (seconds from the start of the bag); without them the busiest 90 s are chosen.
"""
import json, sys
import numpy as np
import rosbag2_py
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message

bag, out = sys.argv[1], sys.argv[2]
r = rosbag2_py.SequentialReader()
r.open(rosbag2_py.StorageOptions(uri=bag, storage_id='sqlite3'), rosbag2_py.ConverterOptions('cdr', 'cdr'))
types = {t.name: t.type for t in r.get_all_topics_and_types()}
want = ['/talos/command/requested_rpm', '/talos/state/thrusters/telemetry', '/talos/state/kill']
r.set_filter(rosbag2_py.StorageFilter(topics=want))
cls = {k: get_message(types[k]) for k in want}
req, tel, kill = [], [], []
while r.has_next():
    k, data, t = r.read_next()
    t *= 1e-9
    m = deserialize_message(data, cls[k])
    if k == want[0]:
        req.append([t] + list(m.values))
    elif k == want[1]:
        row = {'t': t, 'b': m.start_thruster_num // 4, 'flags': m.disabled_flags, 'vcc': m.vcc_voltage,
               'powered': m.escs_powered, 'moving': m.thrusters_moving, 'ticks': m.tick_cnt, 'dt_us': m.packet_delta_us,
               'esc': [[e.rpm, e.current, e.temperature_c, e.voltage, int(e.esc_online)] for e in m.esc_telemetry]}
        tel.append(row)
    else:
        kill.append([t, bool(m.data)])
req = np.array(req)
t0bag = min(req[0, 0], tel[0]['t'], kill[0][0])

# loop rate of core 1 (ticks per telemetry period), ignoring the first packet of each board
rates = [x['ticks'] / (x['dt_us'] * 1e-6) for x in tel if x['dt_us'] > 0 and x['dt_us'] < 2e6]
periods = np.diff([x['t'] for x in tel if x['b'] == 0])
kill_dt = np.diff([k[0] for k in kill])
stats = {
    'bag': bag.rstrip('/').split('/')[-2], 'duration_s': round(float(req[-1, 0] - t0bag), 1),
    'req_hz': round(float(len(req) / (req[-1, 0] - req[0, 0])), 2),
    'tel_period_s': round(float(np.median(periods)), 3),
    'loop_hz_median': round(float(np.median(rates)), 0), 'loop_hz_p5': round(float(np.percentile(rates, 5)), 0),
    'loop_hz_p95': round(float(np.percentile(rates, 95)), 0),
    'kill_period_ms_median': round(float(np.median(kill_dt) * 1000), 0),
    'kill_true_count': int(sum(k[1] for k in kill)), 'kill_count': len(kill),
    'flags_seen': sorted({x['flags'] for x in tel}),
    'vcc_range': [round(min(x['vcc'] for x in tel), 2), round(max(x['vcc'] for x in tel), 2)],
    'temp_range': [min(e[2] for x in tel for e in x['esc']), max(e[2] for x in tel for e in x['esc'])],
}

# choose the window
W = 90.0
if len(sys.argv) > 4:
    a, b = float(sys.argv[3]) + t0bag, float(sys.argv[4]) + t0bag
else:
    tt = req[:, 0]
    act = np.abs(np.diff(req[:, 1:], axis=0)).sum(1)
    best, a = -1, tt[0]
    for s in np.arange(tt[0], tt[-1] - W, 5.0):
        sel = (tt[1:] >= s) & (tt[1:] < s + W)
        v = act[sel].sum()
        if v > best:
            best, a = v, s
    b = a + W
rs = req[(req[:, 0] >= a) & (req[:, 0] <= b)]
ts = [x for x in tel if a <= x['t'] <= b]
data = {
    'about': 'Talos pool run, riptide_mpc identification bag. req = command/requested_rpm (what the MPC put on CAN). '
             'tel = state/thrusters/telemetry per ESC board: esc = [rpm, current A, temperature C, voltage V, online].',
    'stats': stats, 'window': [round(a - t0bag, 1), round(b - t0bag, 1)],
    'req': [[round(x[0] - a, 3)] + [int(v) for v in x[1:]] for x in rs],
    'tel': [{**x, 't': round(x['t'] - a, 3), 'vcc': round(x['vcc'], 2),
             'esc': [[int(e[0]), round(e[1], 2), int(e[2]), round(e[3], 2), e[4]] for e in x['esc']]} for x in ts],
}
json.dump(data, open(out, 'w'), separators=(',', ':'))
print(json.dumps(stats, indent=1), 'window', data['window'], len(data['req']), len(data['tel']))
