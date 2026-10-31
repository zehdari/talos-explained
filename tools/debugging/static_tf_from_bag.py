#!/usr/bin/env python3
"""Re-publish a bag's /tf_static (and the one-off /tf_static-like frames) as a latched static broadcaster.

    python3 static_tf_from_bag.py BAGDIR

`ros2 bag play --start-offset S` skips every message before S, including the /tf_static messages that were
published once when the stack started. Without them a viewer or TF lookup can't connect the robot to the world.
Run this alongside the player (same ROS_DOMAIN_ID / RMW) to put the statics back.
"""
import sys
import rclpy
import rosbag2_py
from rclpy.serialization import deserialize_message
from tf2_msgs.msg import TFMessage
from tf2_ros import StaticTransformBroadcaster

bag = sys.argv[1]
r = rosbag2_py.SequentialReader()
r.open(rosbag2_py.StorageOptions(uri=bag, storage_id=''), rosbag2_py.ConverterOptions('cdr', 'cdr'))
r.set_filter(rosbag2_py.StorageFilter(topics=['/tf_static']))
statics = {}
while r.has_next():
    _, data, _ = r.read_next()
    for t in deserialize_message(data, TFMessage).transforms:
        statics[t.child_frame_id] = t          # the last one per child wins
rclpy.init()
node = rclpy.create_node('bag_static_tf')
StaticTransformBroadcaster(node).sendTransform(list(statics.values()))
node.get_logger().info(f'{len(statics)} static frames from {bag}')
rclpy.spin(node)
