# EKF replay curves for the localization chapter (public/data/localization/replay.json).
#
# Input: the EKF replays in ~/robot/ekf_replay (run_variant.sh: the pool identification bag
# talos_20261026_204748 played into a local robot_localization ekf_node with talos_ekf.yaml, one config change per
# variant, output re-recorded to out_pool<V>). Variants, identified from analyze.py's numbers:
#   A  talos_ekf.yaml as on the robot (IMU angular_velocity_covariance 0.01 as recorded)
#   C  + gyro covariance 1e-5 + smooth_lagged_data true, history_length 1.0
#   D  C without IMU linear-acceleration fusion (D.yaml)
#   E  C + velocity process noise x100 (E.yaml: entries 6-8 = 0.0025, 0.0025, 0.004)
#
# Run (ROS 2 Humble for rosbag2_py), under a memory cap:
#   systemd-run --user --scope -p MemoryMax=6G bash -c \
#     'source /opt/ros/humble/setup.bash; python3 tools/localization/replay_data.py'
import csv, json, os, sys
import numpy as np
import rosbag2_py
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message
from tf2_msgs.msg import TFMessage
from scipy.spatial.transform import Rotation as R

HOME = os.path.expanduser('~')
REPLAY = f'{HOME}/robot/ekf_replay'
RUN = f'{HOME}/robot/mpc_ident/runs/talos_20261026_204748'
OUT = os.path.join(os.path.dirname(__file__), '../../public/data/localization/replay.json')
VARIANTS = {'A': 'As configured', 'C': '+ gyro covariance, lagged-data smoothing', 'D': 'C without IMU acceleration',
            'E': 'C + velocity process noise ×100'}


def reader(uri, topics):
    r = rosbag2_py.SequentialReader()
    r.open(rosbag2_py.StorageOptions(uri=uri, storage_id='sqlite3'), rosbag2_py.ConverterOptions('cdr', 'cdr'))
    types = {t.name: t.type for t in r.get_all_topics_and_types()}
    r.set_filter(rosbag2_py.StorageFilter(topics=[t for t in topics if t in types]))
    return r, types


def stamp(h):
    return h.stamp.sec + h.stamp.nanosec * 1e-9


def load(uri):
    r, types = reader(uri, ['/talos/odometry/filtered', '/talos/vectornav/imu', '/talos/dvl_twist'])
    D = {k: [] for k in types}
    while r.has_next():
        k, d, _ = r.read_next()
        m = deserialize_message(d, get_message(types[k]))
        if k.endswith('filtered'):
            w, v = m.twist.twist.angular, m.twist.twist.linear
            D[k].append([stamp(m.header), v.x, v.y, v.z, w.x, w.y, w.z])
        elif k.endswith('imu'):
            w = m.angular_velocity
            D[k].append([stamp(m.header), w.x, w.y, w.z])
        else:
            v = m.twist.twist.linear
            D[k].append([stamp(m.header), v.x, v.y, v.z])
    return {k.split('/talos/')[1]: np.array(v) for k, v in D.items() if v}


# Sensor mounts from the pool bag's TF. imu_link is on /tf_static; dvl_link hangs off a revolute joint, so it is on
# /tf (robot_state_publisher), not /tf_static. Both are fixed: the first sample of each is enough.
r, _ = reader(f'{RUN}/bag', ['/tf_static', '/tf'])
par = {}
while r.has_next():
    k, d, _ = r.read_next()
    for t in deserialize_message(d, TFMessage).transforms:
        if t.child_frame_id in par or t.header.frame_id == 'odom':
            continue
        q, p = t.transform.rotation, t.transform.translation
        par[t.child_frame_id] = (t.header.frame_id, R.from_quat([q.x, q.y, q.z, q.w]), np.array([p.x, p.y, p.z]))
    if 'talos/dvl_link' in par and 'talos/imu_link' in par and 'talos/origin' in par:
        break


def to_base(frame):
    # Rotation and position of `frame` in talos/base_link
    rot, pos, f = R.identity(), np.zeros(3), frame
    while f != 'talos/base_link':
        p, q, x = par[f]
        pos = q.apply(pos) + x
        rot = q * rot
        f = p
    return rot, pos


Rimu, _ = to_base('talos/imu_link')
Rdvl, r_dvl = to_base('talos/dvl_link')
print('dvl in base_link:', np.round(r_dvl, 4), 'yaw', np.degrees(Rdvl.as_euler('xyz'))[2])

# Segment times (wall clock, same as the bag's stamps)
seg = {}
for row in csv.DictReader(open(f'{RUN}/recording.csv')):
    k = int(row['segment']); t = float(row['t']); a = seg.setdefault(k, [t, t]); a[1] = t
t_start = min(a[0] for a in seg.values())

data = {k: load(f'{REPLAY}/out_pool{k}') for k in VARIANTS}
base = data['A']

# DVL -> base_link velocity, as robot_localization does it (ros_filter.cpp, prepareTwist): rotate by the mount, then
# remove the lever arm with the body rate, v = R v_dvl + r x w. The body rate is the IMU's, rotated into base_link.
dvl = base['dvl_twist']
imu_all = base['vectornav/imu']
w_b = Rimu.apply(imu_all[:, 1:4])
w_at = np.stack([np.interp(dvl[:, 0], imu_all[:, 0], w_b[:, i]) for i in range(3)], 1)
dvl_b = Rdvl.apply(dvl[:, 1:4]) + np.cross(r_dvl, w_at)


out = {'source': 'EKF replays of the 2026-10-26 pool identification bag (talos_20261026_204748), ~/robot/ekf_replay',
       'variants': VARIANTS, 'surge': {}, 'pitch': {}, 'hold_std': {}}

# Surge out and back at 0.5 m/s (segments 22 and 23)
t0, t1 = seg[22][0] - 1.0, seg[23][1]
m = (dvl[:, 0] >= t0) & (dvl[:, 0] <= t1)
out['surge']['dvl'] = [[round(t - t0, 3), round(v, 4)] for t, v in zip(dvl[m, 0], dvl_b[m, 0])]
for k, D in data.items():
    o = D['odometry/filtered']; mm = (o[:, 0] >= t0) & (o[:, 0] <= t1)
    out['surge'][k] = [[round(t - t0, 3), round(v, 4)] for t, v in zip(o[mm, 0], o[mm, 1])]
out['surge']['t0_in_run'] = round(t0 - t_start, 2)

# Pitch rate in the same window: surge starts pitch Talos a few degrees (the replay covers 374-933 s of the run)
imu = base['vectornav/imu']; wb = Rimu.apply(imu[:, 1:4]); mi = (imu[:, 0] >= t0) & (imu[:, 0] <= t1)
ti, wi = imu[mi, 0], wb[mi, 1]
keep = np.arange(0, len(ti), 4)  # 400 Hz -> 100 Hz
out['pitch']['imu'] = [[round(ti[i] - t0, 3), round(wi[i], 4)] for i in keep]
for k, D in data.items():
    o = D['odometry/filtered']; mm = (o[:, 0] >= t0) & (o[:, 0] <= t1)
    out['pitch'][k] = [[round(t - t0, 3), round(v, 4)] for t, v in zip(o[mm, 0], o[mm, 5])]

# Noise check: standard deviation of the EKF's surge velocity during the null-space holds (segments 16-17: thrust
# patterns that should produce no motion; the level holds are before the replayed span)
HOLDS = (16, 17)
for k, D in data.items():
    o = D['odometry/filtered']; vals = []
    for s in HOLDS:
        mm = (o[:, 0] >= seg[s][0] + 1) & (o[:, 0] <= seg[s][1] - 1)
        if mm.sum() > 30:
            vals.append(np.std(o[mm, 1]))
    out['hold_std'][k] = round(float(np.mean(vals)) * 1000, 2)  # mm/s
mm = np.zeros(len(dvl), bool)
for s in HOLDS:
    mm |= (dvl[:, 0] >= seg[s][0] + 1) & (dvl[:, 0] <= seg[s][1] - 1)
out['hold_std']['dvl'] = round(float(np.std(dvl_b[mm, 0])) * 1000, 2)

json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('wrote', OUT, os.path.getsize(OUT), 'bytes; hold std mm/s', out['hold_std'])
