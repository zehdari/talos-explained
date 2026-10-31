#!/bin/bash
# Re-captures the two Autonomy panel screenshots at 2x UI scale (2026-10-31), on a private X display and the
# sandbox's isolated ROS domain. Needs a sandbox built by sandbox.sh (default /tmp/btws2) and a built nereus viewer.
#   1. this script starts Xvfb :94, doTask, a 10 Hz fake odometry publisher at z = -1, and the viewer (--ui-scale 2);
#   2. then, by hand with xdotool on DISPLAY=:94 (the viewer only redraws on input: nudge the mouse before each
#      `import -window root`): drag the left dock's right edge (x ~ 858) left to x = 580, press Refresh, open the
#      tree drop-down, type "DeeperThanDemo" in its search box and click the one entry. Crop x 0-566 from just under
#      the Mapping/Vision/Autonomy tabs (y ~ 1078) to below the stack: the "ready" shot;
#   3. with the sandbox's DeeperThanDemo.xml temporarily set to Wait 60 s, send_goal it and capture again: "running".
WS=${1:-/tmp/btws2}
source "$WS/env.sh"
export DISPLAY=:94 XDG_CONFIG_HOME=$WS/xdg
mkdir -p "$XDG_CONFIG_HOME"
Xvfb :94 -screen 0 3200x2000x24 >/dev/null 2>&1 &
sleep 1
timeout 300 ros2 run riptide_autonomy2 doTask --ros-args -r __ns:=/talos -r __node:=autonomy -p log_file_dir:=$WS/btlogs &
timeout 300 python3 -c "
import rclpy
from nav_msgs.msg import Odometry
rclpy.init(); n = rclpy.create_node('fake_odom'); p = n.create_publisher(Odometry, '/talos/odometry/filtered', 10)
def tick():
    m = Odometry(); m.header.stamp = n.get_clock().now().to_msg(); m.header.frame_id = 'world'
    m.pose.pose.position.z = -1.0; m.pose.pose.orientation.w = 1.0; p.publish(m)
n.create_timer(0.1, tick); rclpy.spin(n)" &
cd ~/osu-uwrt/release/nereus
timeout 290 ./build/ros-viewer/nereus-viewer --ui-scale 2 --scenario /tmp/nereus_sim/vid3/resolved.json \
  --pack-dir content/packs/scenarios/talos_uwrt --pose-source estimate --use-sim-time false &
sleep 12
for W in $(xdotool search --name "."); do xdotool windowmove $W 0 0 windowsize $W 3200 2000 2>/dev/null; done
