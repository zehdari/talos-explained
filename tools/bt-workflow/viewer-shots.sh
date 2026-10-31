#!/bin/bash
# Re-captures the two Autonomy panel screenshots at 2x UI scale (2026-10-31), on a private X display and the
# sandbox's isolated ROS domain. Needs a sandbox built by sandbox.sh (default /tmp/btws2) and a built nereus viewer.
#   1. this script starts Xvfb :94, doTask, a 10 Hz fake odometry publisher at z = -1, and the viewer (--ui-scale 2);
#   2. then, by hand with xdotool on DISPLAY=:94: drag the left dock's splitter (x ~ 476) right to ~860 and the
#      Motion/Autonomy splitter (y ~ 1656) up to ~1000, pick a tree, `import -window root`, crop 840 px wide at y = 1000;
#   3. send_goal a 60 s copy of DeeperThanDemo.xml and capture again for the "running" shot.
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
