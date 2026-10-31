#!/usr/bin/env python3
"""Merge the raw graph dump (plus an optional second rate pass and the Nereus bridge config) and the measured rates into public/data/rosgraph/{rosgraph,topics}.json, tagging each
node with where it runs and the launch file that starts it (from riptide_bringup2 bringup.launch.py with
hardware:=none, and Nereus sim.launch.py).
    python3 build_rosgraph.py RAW_GRAPH.json TOPICS_RATES.json OUT_DIR"""
import json, sys
raw, rates, out = json.load(open(sys.argv[1])), json.load(open(sys.argv[2])), sys.argv[3]
rates2 = json.load(open(sys.argv[4])) if len(sys.argv) > 4 else None
import os, yaml
BRIDGE = os.path.expanduser('~/osu-uwrt/release/nereus/content/packs/bridges/uwrt_talos/bridge.yaml')
cfg = {}
for st in yaml.safe_load(open(BRIDGE))['streams']:
    if st.get('direction') == 'publish':
        t = st['topic'] if st['topic'].startswith('/') else '/talos/' + st['topic']
        cfg[t] = st.get('rate_hz')
RC = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/'
RCTL = 'https://github.com/osu-uwrt/riptide_control/blob/mpc/'
RP = 'https://github.com/osu-uwrt/riptide_perception/blob/mapping-estimator/'
RA = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/'
NE = 'https://github.com/osu-uwrt/nereus/blob/main/'
# node -> (group, runs, package / executable, launch file URL, one-line role)
META = {
 '/talos/physics_simulator': ('simulator', 'sim only', 'nereus: nereus-sim', NE + 'integrations/uwrt/launch/sim.launch.py',
     'Nereus simulator: 6-DOF physics, sensors (IMU, FOG, DVL, depth), both ZED cameras, actuators, task scoring. Stands in for the firmware boards and sensor drivers.'),
 '/sim_supervisor': ('simulator', 'sim only', 'nereus: sim_supervisor.py', NE + 'integrations/uwrt/launch/sim_supervisor.py',
     'Starts nereus-sim and restarts it in another pool when the viewer asks.'),
 '/nereus_viewer': ('operator', 'sim and real robot (operator laptop)', 'nereus: nereus-viewer', NE + 'integrations/uwrt/launch/sim.launch.py',
     'Pool viewer: 3D scene, camera cards, scorecard, prior map editor.'),
 '/nereus_viewer_timing': ('operator', 'sim and real robot (operator laptop)', 'nereus: nereus-viewer', NE + 'integrations/uwrt/launch/sim.launch.py',
     'Viewer helper node (clock / timing).'),
 '/talos/viewer_panels': ('operator', 'sim and real robot (operator laptop)', 'nereus: nereus-viewer', NE + 'integrations/uwrt/launch/sim.launch.py',
     'Viewer operator panels: Enable/KILL (software kill slot 1), Motion, Autonomy, Mapping, Actuators, Electrical, Recording, Bagging.'),
 '/talos/viewer_plots': ('operator', 'sim and real robot (operator laptop)', 'nereus: nereus-viewer', NE + 'integrations/uwrt/launch/sim.launch.py',
     'Viewer plot windows (subscribes only to plotted topics).'),
 '/talos/mpc_controller': ('control', 'robot', 'riptide_mpc: mpc_controller', RCTL + 'riptide_controllers/launch/control_system.launch.py',
     'Model predictive controller: pose/velocity targets in, eight thruster forces out.'),
 '/talos/controller_overseer': ('control', 'robot', 'riptide_controllers2: controller_overseer.py', RCTL + 'riptide_controllers/launch/control_system.launch.py',
     'Controller supervisor: publishes controller/motion_enabled and the feed-forward body force, hosts parameter-update services for the older controllers, warns when thruster telemetry stops.'),
 '/talos/calibrate_drag': ('control', 'robot', 'riptide_controllers2: calibrate_drag.py', RCTL + 'riptide_controllers/launch/control_system.launch.py',
     'Drag calibration action server (calibrate_drag_new).'),
 '/talos/ekf_localization_node': ('navigation', 'robot', 'robot_localization: ekf_node', RC + 'riptide_hardware/launch/navigation.launch.py',
     'EKF: fuses IMU, FOG, DVL and depth into odometry/filtered and the odom->base_link transform.'),
 '/talos/depth_converter': ('navigation', 'robot', 'riptide_hardware2: depth_converter.py', RC + 'riptide_hardware/launch/navigation.launch.py',
     'Turns the raw pressure depth into a pose for the EKF.'),
 '/talos/odom_to_world_broadcaster': ('navigation', 'robot', 'tf2_ros: static_transform_publisher', RC + 'riptide_hardware/launch/navigation.launch.py',
     'Static world->odom transform.'),
 '/talos/robot_state_publisher': ('navigation', 'robot', 'robot_state_publisher', RC + 'riptide_hardware/launch/navigation.launch.py',
     'Publishes the robot description and the sensor/thruster frames on Talos.'),
 '/talos/joint_state_publisher': ('navigation', 'robot', 'joint_state_publisher', RC + 'riptide_hardware/launch/navigation.launch.py',
     'Joint states for the robot description.'),
 '/talos/yolo_orientation': ('perception', 'robot', 'tensor_detector: yolo_orientation.py', RP + 'tensor_detector/launch/tensorrt.launch.py',
     'YOLO detector on the active camera (ffc or dfc): detections with 3D poses from depth.'),
 '/talos/riptide_mapping2': ('perception', 'robot', 'riptide_mapping2: mapping.py', RP + 'riptide_mapping/launch/mapping.launch.py',
     'Mapping: fuses detections into one pose estimate per course object (mapping/<object>, TF frames).'),
 '/talos/world_to_map': ('perception', 'robot', 'chameleon_tf', RP + 'riptide_mapping/launch/mapping.launch.py',
     'Publishes world->map on /tf_static; the map/set_transform service and map/model_tf action move it (AprilTag calibration).'),
 '/talos/apriltag/tag_container': ('perception', 'robot', 'rclcpp_components: component_container', RC + 'riptide_hardware/launch/apriltag.launch.py',
     'Container for the AprilTag detector (on the robot started by hardware.launch.py; in sim added by Nereus mission_stack.launch.py).'),
 '/talos/apriltag_36h11': ('perception', 'robot', 'apriltag_ros: AprilTagNode', RC + 'riptide_hardware/launch/apriltag.launch.py',
     'AprilTag (36h11) detector on the front camera, for tag calibration of the map.'),
 '/talos/surface_frame_node': ('perception', 'robot', 'tf2_ros: static_transform_publisher', RC + 'riptide_hardware/launch/apriltag.launch.py',
     'Static tag36h11:0 -> estimated_origin_frame transform.'),
 '/talos/autonomy': ('autonomy', 'robot', 'riptide_autonomy2: doTask', RA + 'launch/autonomy.launch.py',
     'Behavior-tree executor: autonomy/run_tree action, publishes the running stack.'),
 '/talos/ActuatorTranslator': ('autonomy', 'robot', 'riptide_autonomy2: actuator_service_translator.py', RA + 'launch/autonomy.launch.py',
     'Translates actuator services from the trees into actuator command topics.'),
 '/riptide_acoustics': ('acoustics', 'robot', 'riptide_acoustics', RC + 'riptide_acoustics/launch/acoustics.launch.py',
     'Acoustics (pinger) node. Nereus does not simulate acoustics.'),
}
def meta(name):
    if name in META:
        g, r, p, l, d = META[name]; return {'group': g, 'runs': r, 'package': p, 'launch': l, 'role': d}
    if 'transform_listener_impl' in name:
        return {'group': 'internal', 'runs': '-', 'package': 'tf2_ros', 'launch': None, 'role': 'Hidden helper node created by a tf2 TransformListener inside another node.'}
    if name.startswith('/launch_ros'):
        return {'group': 'internal', 'runs': '-', 'package': 'launch_ros', 'launch': None, 'role': 'The ros2 launch process itself (loads composable nodes).'}
    return {'group': 'other', 'runs': '?', 'package': None, 'launch': None, 'role': ''}
NOISE = ('/parameter_events', '/rosout')
nodes = []
MINE = ('/media_', '/rosbag2')  # this capture's own tools
for n in raw['nodes']:
    if n['node'].startswith(MINE): continue
    m = meta(n['node'])
    rec = {'node': n['node'], **m}
    for k in ('publishers', 'subscribers', 'services', 'clients', 'action_servers', 'action_clients'):
        lst = n[k]
        if k in ('services', 'clients'):  # drop the six standard parameter services every node has
            lst = [s for s in lst if not s['name'].startswith(n['node'] + '/') or not any(s['name'].endswith(x) for x in
                   ('/describe_parameters', '/get_parameter_types', '/get_parameters', '/list_parameters', '/set_parameters', '/set_parameters_atomically'))]
        if k in ('publishers', 'subscribers'): lst = [s for s in lst if s['name'] not in NOISE]
        rec[k] = lst
    nodes.append(rec)
rate = {t['topic']: t for t in rates['topics']}
rate2 = {t['topic']: t for t in rates2['topics']} if rates2 else {}
topics = []
group = {n['node']: n['group'] for n in nodes}
for t in raw.get('topics', []) or []: pass
tg = json.load(open(sys.argv[1].replace('rosgraph_raw.json', 'topics_graph.json')))
for t in tg['topics']:
    r = rate.get(t['topic'], {})
    topics.append({'topic': t['topic'], 'type': t['type'], 'rate_hz': r.get('rate_hz'), 'rate_hz_pass2': rate2.get(t['topic'], {}).get('rate_hz'), 'sim_configured_hz': cfg.get(t['topic']), 'mean_bytes': r.get('mean_bytes'),
                   'latched': any(p['durability'] == 'transient_local' for p in t['publishers']),
                   'publishers': [p['node'] for p in t['publishers'] if not p['node'].startswith(MINE)], 'subscribers': [s['node'] for s in t['subscribers'] if not s['node'].startswith(MINE)],
                   'publisher_qos': sorted({p['reliability'] + '/' + p['durability'] for p in t['publishers']}),
                   'sim_only': bool(t['publishers']) and all(group.get(p['node']) == 'simulator' for p in t['publishers'])})
note = ('Captured from the Nereus full stack (sim.launch.py active_control_model:=mpc mpc_model:=sim, robosub pool, rmw_zenoh_cpp) '
        'on a desktop under heavy load (other jobs running): rates are what this machine delivered, not robot specs. '
        'Each topic was measured alone for %gs with a best-effort subscription (rate_hz: pass 1, robot holding still before the tree run; rate_hz_pass2: pass 2, holding still after it); 0 = no message in that window, null = no publisher. sim_configured_hz is the rate the Nereus bridge is configured to publish at (0 = published on events, not on a timer; /clock is published every 2 ms physics step). '
        'On the real robot the topics the simulator publishes come from the sensor drivers and the firmware (micro-ROS) instead.' % rates.get('seconds_per_topic', 3))
json.dump({'captured': raw['captured'], 'note': note, 'groups': sorted({n['group'] for n in nodes}), 'nodes': nodes}, open(out + '/rosgraph.json', 'w'), indent=1)
json.dump({'captured': rates['captured'], 'note': note, 'topics': topics}, open(out + '/topics.json', 'w'), indent=1)
print(len(nodes), 'nodes', len(topics), 'topics', [n['node'] for n in nodes if n['group'] == 'other'])
