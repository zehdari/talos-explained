#!/bin/bash
# Replay part of a real-robot bag into the Nereus viewer, isolated from every robot and laptop.
# usage: viewer_replay.sh BAG START_S FRAMES OUT.png [DISPLAY]   (FRAMES rendered before the screenshot)
# Used for the Debugging chapter's screenshot; the same steps work by hand without --hidden/--screenshot.
set -e
BAG=$1 START=$2 DUR=$3 OUT=$4 DISP=${5:-:91}
NEREUS=$HOME/osu-uwrt/release/nereus
source /opt/ros/humble/setup.bash
source $HOME/osu-uwrt/release/install/setup.bash
# Private, local-only graph: nothing here can reach the robot, and nothing else can reach in.
unset ZENOH_CONFIG_OVERRIDE ZENOH_ROUTER_CONFIG_URI ZENOH_SESSION_CONFIG_URI
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=91 ROS_LOCALHOST_ONLY=1 DISPLAY=$DISP
export XDG_CONFIG_HOME=/tmp/dbg_viewer_cfg   # don't touch anyone's saved viewer layout
mkdir -p $XDG_CONFIG_HOME
[ -f /tmp/dbg_resolved.json ] || (cd $NEREUS && .venv/bin/python -m nereus.packs resolve content/packs/scenarios/talos_uwrt -o /tmp/dbg_resolved.json)
python3 $(dirname $0)/static_tf_from_bag.py $BAG > /tmp/dbg_static.log 2>&1 & STATIC=$!
sleep 2
ros2 bag play $BAG --clock 100 --start-offset $START --disable-keyboard-controls \
  --topics /tf /tf_static /talos/odometry/filtered /talos/controller/mpc/reference /talos/thruster_forces \
           /talos/state/kill /talos/controller/mpc/state /talos/depth/pose > /tmp/dbg_play.log 2>&1 & PLAY=$!
FRAMES=$DUR   # the third argument is a frame count
(cd $NEREUS && ./build/ros-viewer/nereus-viewer --scenario /tmp/dbg_resolved.json --pose-source estimate \
   --use-sim-time true --thrust --mpc-path --layout ${LAYOUT:-standard} --focus Vehicle --robot-only --orbit ${ORBIT:-2.4 0.45 2.6} --hidden --frames $FRAMES --screenshot $OUT) \
   > /tmp/dbg_viewer.log 2>&1 || true
kill -INT $PLAY 2>/dev/null; kill $STATIC 2>/dev/null; wait 2>/dev/null
echo "saved $OUT"
