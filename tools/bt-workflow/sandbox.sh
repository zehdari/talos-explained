#!/bin/bash
# Rebuilds the "Writing and testing trees" worked example in a throwaway copy of riptide_autonomy, so nothing in the
# real workspace (or on the robot) changes. What the chapter shows came from running these steps on 2026-10-30
# against autonomy-mapping b636000.
#
#   tools/bt-workflow/sandbox.sh [/tmp/btws]          # copy, create the node, build with tests, run its tests
#   then, in two shells with `source <ws>/env.sh`:
#     ros2 run riptide_autonomy2 doTask --ros-args -r __ns:=/talos -r __node:=autonomy -p log_file_dir:=<ws>/btlogs
#     ros2 action send_goal /talos/autonomy/run_tree riptide_msgs2/action/ExecuteTree \
#       "{tree: <ws>/src/riptide_autonomy/trees/DeeperThanDemo.xml}"
#   (with something publishing /talos/odometry/filtered; the chapter used a 10 Hz rclpy publisher at z = -1)
set -e
WS=${1:-/tmp/btws}
HERE=$(cd "$(dirname "$0")" && pwd)
SRC=~/osu-uwrt/release/src/riptide_autonomy

rm -rf "$WS" && mkdir -p "$WS/src"
git -C "$SRC" archive --format=tar --prefix=riptide_autonomy/ HEAD | tar -x -C "$WS/src"

# An isolated ROS domain, so the sandbox never talks to a running stack.
cat > "$WS/env.sh" <<EOF
source /opt/ros/humble/setup.bash
source ~/osu-uwrt/release/install/setup.bash
source $WS/install/setup.bash 2>/dev/null || true
export ROS_DOMAIN_ID=179 ROS_LOCALHOST_ONLY=1 RMW_IMPLEMENTATION=rmw_fastrtps_cpp
EOF
source "$WS/env.sh"

cd "$WS"
python3 src/riptide_autonomy/src/riptide_autonomy/assistant/btassistant.py create condition DeeperThan --no-rebuild
cp "$HERE/example/DeeperThan.btcondition.hpp" src/riptide_autonomy/include/riptide_autonomy/bt_conditions/
cp "$HERE/example/TestDeeperThan.cpp" src/riptide_autonomy/test/riptide_autonomy/bt_conditions/
cp "$HERE/example/DeeperThanDemo.xml" src/riptide_autonomy/trees/

# About 3.5 min with tests. Memory is tight on Cam-PC: cap it.
systemd-run --user --scope -p MemoryMax=6G --quiet env MAKEFLAGS=-j4 \
  colcon build --packages-select riptide_autonomy2 --cmake-args -DAUTONOMY_BUILD_TESTS=ON
source "$WS/install/setup.bash"

# GTEST_FILTER, not --gtest_filter: the BtTest fixture passes the original argc to rclcpp::init.
GTEST_FILTER='*DeeperThan*:*all_trees_load*' ros2 run riptide_autonomy2 test_nodes || true
