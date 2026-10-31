#!/usr/bin/env python3
"""Log the autonomy execution stack, task events and run score with wall and sim time while a tree runs
(used to cut the viewer video). python3 tree_logger.py OUT.jsonl"""
import json, sys, time, rclpy
from rclpy.node import Node
from riptide_msgs2.msg import TreeStack
from rosgraph_msgs.msg import Clock
from std_msgs.msg import String
out = open(sys.argv[1], 'a', buffering=1)
rclpy.init(); n = Node('media_tree_logger'); clk = {'t': 0.0}; last = {'stack': None}
n.create_subscription(Clock, '/clock', lambda m: clk.update(t=m.clock.sec + m.clock.nanosec * 1e-9), 10)
def w(kind, data): out.write(json.dumps({'wall': round(time.time(), 3), 'sim': round(clk['t'], 3), 'kind': kind, 'data': data}) + '\n')
def st(m):
    s = list(m.stack)
    if s != last['stack']: last['stack'] = s; w('stack', s)
n.create_subscription(TreeStack, '/talos/autonomy/tree_stack', st, 10)
n.create_subscription(String, '/talos/simulator/task_events', lambda m: w('task_event', m.data), 50)
def sc(m):
    if m.data != last.get('score'): last['score'] = m.data; w('run_score', m.data)
n.create_subscription(String, '/talos/simulator/run_score', sc, 10)
rclpy.spin(n)
