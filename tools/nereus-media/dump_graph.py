#!/usr/bin/env python3
"""Dump the live ROS 2 graph (every node's publishers, subscribers, services, clients, action servers/clients)
and every topic with its type, endpoints and QoS, while the Nereus full stack runs.

    python3 dump_graph.py OUT_DIR      (writes rosgraph.json and topics_graph.json)
"""
import json, sys, time
import rclpy
from rclpy.node import Node
from rclpy.action import get_action_client_names_and_types_by_node, get_action_server_names_and_types_by_node

out = sys.argv[1]
rclpy.init()
n = Node('media_graph_dump')
end = time.monotonic() + 6
while time.monotonic() < end:
    rclpy.spin_once(n, timeout_sec=0.2)
me = '/media_graph_dump'
def fq(name, ns): return (ns.rstrip('/') + '/' + name) if ns != '/' else '/' + name
def pairs(lst): return [{'name': a, 'type': b[0] if len(b) == 1 else b} for a, b in sorted(lst)]
nodes = []
for name, ns in sorted(n.get_node_names_and_namespaces(), key=lambda x: fq(x[0], x[1])):
    full = fq(name, ns)
    if full in (me,) or name.startswith('_'): continue
    rec = {'node': full, 'name': name, 'namespace': ns}
    for key, fn in (('publishers', n.get_publisher_names_and_types_by_node), ('subscribers', n.get_subscriber_names_and_types_by_node),
                    ('services', n.get_service_names_and_types_by_node), ('clients', n.get_client_names_and_types_by_node)):
        try: rec[key] = pairs(fn(name, ns))
        except Exception as e: rec[key] = []; rec.setdefault('errors', []).append(f'{key}: {e}')
    try: rec['action_servers'] = pairs(get_action_server_names_and_types_by_node(n, name, ns))
    except Exception as e: rec['action_servers'] = []; rec.setdefault('errors', []).append(str(e))
    try: rec['action_clients'] = pairs(get_action_client_names_and_types_by_node(n, name, ns))
    except Exception as e: rec['action_clients'] = []; rec.setdefault('errors', []).append(str(e))
    # action plumbing topics/services (_action/...) are folded into the action entries
    for key in ('publishers', 'subscribers', 'services', 'clients'):
        rec[key] = [e for e in rec[key] if '/_action/' not in e['name']]
    nodes.append(rec)
def qos(i):
    q = i.qos_profile
    return {'reliability': q.reliability.name.lower(), 'durability': q.durability.name.lower(), 'history': q.history.name.lower(), 'depth': q.depth}
topics = []
for t, types in sorted(n.get_topic_names_and_types()):
    if '/_action/' in t: continue
    pubs = [i for i in n.get_publishers_info_by_topic(t) if fq(i.node_name, i.node_namespace) != me]
    subs = [i for i in n.get_subscriptions_info_by_topic(t) if fq(i.node_name, i.node_namespace) != me]
    topics.append({'topic': t, 'type': types[0] if len(types) == 1 else types,
                   'publishers': [{'node': fq(i.node_name, i.node_namespace), **qos(i)} for i in pubs],
                   'subscribers': [{'node': fq(i.node_name, i.node_namespace), **qos(i)} for i in subs]})
json.dump({'captured': time.strftime('%Y-%m-%d %H:%M:%S'), 'nodes': nodes}, open(f'{out}/rosgraph_raw.json', 'w'), indent=1)
json.dump({'captured': time.strftime('%Y-%m-%d %H:%M:%S'), 'topics': topics}, open(f'{out}/topics_graph.json', 'w'), indent=1)
print(len(nodes), 'nodes', len(topics), 'topics')
