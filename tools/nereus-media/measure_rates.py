#!/usr/bin/env python3
"""Measure every published topic's rate and message size, one topic at a time (so the measurement itself
doesn't load the graph), and merge with the graph dump.
    python3 measure_rates.py topics_graph.json OUT.json [seconds_per_topic]"""
import json, sys, time, rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, ReliabilityPolicy, DurabilityPolicy
from rosidl_runtime_py.utilities import get_message
g = json.load(open(sys.argv[1])); out = sys.argv[2]; dur = float(sys.argv[3]) if len(sys.argv) > 3 else 3.0
rclpy.init(); n = Node('media_rate_probe')
res = []
for t in g['topics']:
    rec = dict(t)
    if not t['publishers'] or isinstance(t['type'], list):
        rec['rate_hz'] = None; res.append(rec); continue
    try: T = get_message(t['type'])
    except Exception as e: rec['rate_hz'] = None; rec['note'] = f'type not importable: {e}'; res.append(rec); continue
    latched = any(p['durability'] == 'transient_local' for p in t['publishers'])
    q = QoSProfile(depth=50, reliability=ReliabilityPolicy.BEST_EFFORT,
                   durability=DurabilityPolicy.TRANSIENT_LOCAL if latched else DurabilityPolicy.VOLATILE)
    if latched: q.reliability = ReliabilityPolicy.RELIABLE
    stamps = []; sizes = []
    sub = n.create_subscription(T, t['topic'], lambda m: (stamps.append(time.monotonic()), sizes.append(len(m))), q, raw=True)
    t0 = time.monotonic()
    while time.monotonic() - t0 < 0.7: rclpy.spin_once(n, timeout_sec=0.05)   # discovery + latched burst
    stamps.clear(); sizes.clear(); t0 = time.monotonic()
    while time.monotonic() - t0 < dur: rclpy.spin_once(n, timeout_sec=0.02)
    n.destroy_subscription(sub)
    rec['rate_hz'] = round(len(stamps) / dur, 2)
    rec['mean_bytes'] = int(sum(sizes) / len(sizes)) if sizes else None
    if latched: rec['latched'] = True
    res.append(rec); print(t['topic'], rec['rate_hz'], rec['mean_bytes'], flush=True)
json.dump({'captured': time.strftime('%Y-%m-%d %H:%M:%S'), 'seconds_per_topic': dur, 'topics': res}, open(out, 'w'), indent=1)
