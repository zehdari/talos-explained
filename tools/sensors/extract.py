# Pulls the navigation-sensor topics out of a ROS 2 sqlite bag into a compact .npz.
# Each array row: [bag receive time s, header stamp s, fields...]. Needs ROS Humble + riptide_msgs2 sourced:
#   source /opt/ros/humble/setup.bash; source ~/osu-uwrt/release/install/setup.bash
#   systemd-run --user --scope -p MemoryMax=6G python3 extract.py <bag.db3> <out.npz> [t0 t1]  (t0/t1: seconds from bag start)
import sqlite3, sys
import numpy as np
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message

def st(h):
    return h.stamp.sec + h.stamp.nanosec * 1e-9

FIELDS = {
    'sensor_msgs/msg/Imu': lambda m: [st(m.header), m.angular_velocity.x, m.angular_velocity.y, m.angular_velocity.z,
                                      m.linear_acceleration.x, m.linear_acceleration.y, m.linear_acceleration.z,
                                      m.orientation.w, m.orientation.x, m.orientation.y, m.orientation.z,
                                      m.orientation_covariance[0], m.angular_velocity_covariance[0]],
    'geometry_msgs/msg/TwistWithCovarianceStamped': lambda m: [st(m.header), m.twist.twist.linear.x, m.twist.twist.linear.y,
                                      m.twist.twist.linear.z, m.twist.twist.angular.z, m.twist.covariance[0], m.twist.covariance[35]],
    'geometry_msgs/msg/PoseWithCovarianceStamped': lambda m: [st(m.header), m.pose.pose.position.z, m.pose.covariance[14]],
    'nav_msgs/msg/Odometry': lambda m: [st(m.header), m.pose.pose.position.x, m.pose.pose.position.y, m.pose.pose.position.z,
                                      m.pose.pose.orientation.w, m.pose.pose.orientation.x, m.pose.pose.orientation.y, m.pose.pose.orientation.z,
                                      m.twist.twist.linear.x, m.twist.twist.linear.y, m.twist.twist.linear.z,
                                      m.twist.twist.angular.x, m.twist.twist.angular.y, m.twist.twist.angular.z],
}
WANT = ['/talos/vectornav/imu', '/talos/gyro/twist', '/talos/dvl_twist', '/talos/depth/pose', '/talos/odometry/filtered', '/talos/controller/mpc/state']

bag, out = sys.argv[1], sys.argv[2]
db = sqlite3.connect(bag)
t_start = db.execute('select min(timestamp) from messages').fetchone()[0]
lo = t_start + int(float(sys.argv[3]) * 1e9) if len(sys.argv) > 3 else 0
hi = t_start + int(float(sys.argv[4]) * 1e9) if len(sys.argv) > 4 else 1 << 62
res = {'t_start': np.array([t_start / 1e9])}
for tid, name, typ in db.execute('select id, name, type from topics'):
    if name not in WANT or typ not in FIELDS:
        continue
    cls = get_message(typ)
    f = FIELDS[typ]
    rows = [[ts / 1e9] + f(deserialize_message(data, cls))
            for ts, data in db.execute('select timestamp, data from messages where topic_id=? and timestamp between ? and ? order by timestamp', (tid, lo, hi))]
    key = name.split('/talos/')[-1].replace('/', '_')
    res[key] = np.array(rows, dtype=np.float64)
    print(key, res[key].shape, flush=True)
np.savez_compressed(out, **res)
