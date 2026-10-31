# Read two topics from a Talos bag into numpy arrays.  usage: python3 read_bag.py BAGDIR
# Needs: source /opt/ros/humble/setup.bash; source ~/osu-uwrt/release/install/setup.bash
import sys
import numpy as np
import rosbag2_py
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message

reader = rosbag2_py.SequentialReader()
reader.open(rosbag2_py.StorageOptions(uri=sys.argv[1], storage_id='sqlite3'),
            rosbag2_py.ConverterOptions('cdr', 'cdr'))
types = {t.name: t.type for t in reader.get_all_topics_and_types()}
want = ['/talos/odometry/filtered', '/talos/dvl_twist']
reader.set_filter(rosbag2_py.StorageFilter(topics=want))

rows = {k: [] for k in want}
while reader.has_next():
    topic, data, t_recv = reader.read_next()              # t_recv: when the recorder got it (ns)
    msg = deserialize_message(data, get_message(types[topic]))
    stamp = msg.header.stamp.sec + msg.header.stamp.nanosec * 1e-9   # when it was measured
    if topic.endswith('filtered'):
        v = msg.twist.twist.linear
        rows[topic].append([stamp, msg.pose.pose.position.z, np.hypot(v.x, v.y)])
    else:
        v = msg.twist.twist.linear                        # in dvl_link, turned 45° from the body
        rows[topic].append([stamp, np.hypot(v.x, v.y), t_recv * 1e-9 - stamp])

odom, dvl = (np.array(rows[k]) for k in want)
print(f'odometry: {len(odom)} msgs, depth {odom[:, 1].min():.2f} to {odom[:, 1].max():.2f} m')
print(f'dvl: {len(dvl)} msgs, median age when recorded {np.median(dvl[:, 2]) * 1000:.0f} ms')
# horizontal speed doesn't care about the 45° mount: compare EKF and DVL on the DVL's stamps
ekf = np.interp(dvl[:, 0], odom[:, 0], odom[:, 2])
print(f'horizontal speed, EKF minus DVL: rms {np.sqrt(np.mean((ekf - dvl[:, 1]) ** 2)):.3f} m/s')
