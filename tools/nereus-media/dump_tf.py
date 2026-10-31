#!/usr/bin/env python3
"""Listen to /tf and /tf_static and write the TF tree: every parent->child edge, static or not, its measured
rate and a sample transform.   python3 dump_tf.py OUT.json [seconds]"""
import json, sys, time, rclpy
from rclpy.node import Node
from rclpy.qos import QoSProfile, DurabilityPolicy, ReliabilityPolicy, HistoryPolicy
from tf2_msgs.msg import TFMessage
out = sys.argv[1]; dur = float(sys.argv[2]) if len(sys.argv) > 2 else 15
rclpy.init(); n = Node('media_tf_dump'); edges = {}
def cb(m, static):
    now = time.monotonic()
    for t in m.transforms:
        k = (t.header.frame_id.lstrip('/'), t.child_frame_id.lstrip('/'))
        e = edges.setdefault(k, {'parent': k[0], 'child': k[1], 'static': static, 'count': 0, 'first': now, 'last': now})
        e['count'] += 1; e['last'] = now
        if static: e['static'] = True
        tr, q = t.transform.translation, t.transform.rotation
        e['sample'] = {'xyz': [round(tr.x, 4), round(tr.y, 4), round(tr.z, 4)], 'quat_xyzw': [round(q.x, 5), round(q.y, 5), round(q.z, 5), round(q.w, 5)]}
st = QoSProfile(depth=100, durability=DurabilityPolicy.TRANSIENT_LOCAL, reliability=ReliabilityPolicy.RELIABLE, history=HistoryPolicy.KEEP_LAST)
n.create_subscription(TFMessage, '/tf_static', lambda m: cb(m, True), st)
n.create_subscription(TFMessage, '/tf', lambda m: cb(m, False), QoSProfile(depth=200, reliability=ReliabilityPolicy.BEST_EFFORT))
t0 = time.monotonic()
while time.monotonic() - t0 < dur: rclpy.spin_once(n, timeout_sec=0.05)
res = []
for e in sorted(edges.values(), key=lambda e: (e['parent'], e['child'])):
    r = {'parent': e['parent'], 'child': e['child'], 'static': e['static'], 'sample': e['sample']}
    if not e['static']: r['rate_hz'] = round(e['count'] / dur, 1)
    res.append(r)
children = {e['child'] for e in res}
roots = sorted({e['parent'] for e in res} - children)
json.dump({'captured': time.strftime('%Y-%m-%d %H:%M:%S'), 'listen_s': dur, 'roots': roots, 'edges': res}, open(out, 'w'), indent=1)
print(len(res), 'edges; roots', roots)
