#!/bin/bash
# The Nereus viewer as robot.launch.py pool:=rpac starts it, fed by a real pool bag, screenshotted headless.
# usage: viewer_shot.sh BAG START_S FRAMES OUT.png [DISPLAY]
#   BAG     a Talos bag (default: the 2026-10-26 untethered identification session in ~/robot/mpc_ident)
#   FRAMES  frames rendered before the screenshot
# Isolated: private DDS domain, localhost only, no Zenoh config, a throwaway viewer config folder.
# Needs an X server on DISPLAY (Xvfb :93 -screen 0 1600x1000x24).
set -e
BAG=${1:-$HOME/robot/mpc_ident/runs/talos_20261026_204748/bag}
START=${2:-600} FRAMES=${3:-900} OUT=${4:-/tmp/pool_viewer.png} DISP=${5:-:93}
NEREUS=$HOME/osu-uwrt/release/nereus
HERE=$(cd "$(dirname "$0")" && pwd)
source /opt/ros/humble/setup.bash
source $HOME/osu-uwrt/release/install/setup.bash
unset ZENOH_CONFIG_OVERRIDE ZENOH_ROUTER_CONFIG_URI ZENOH_SESSION_CONFIG_URI
export RMW_IMPLEMENTATION=rmw_fastrtps_cpp ROS_DOMAIN_ID=93 ROS_LOCALHOST_ONLY=1 DISPLAY=$DISP
export XDG_CONFIG_HOME=/tmp/pool_viewer_cfg XDG_STATE_HOME=/tmp/pool_viewer_state
mkdir -p $XDG_CONFIG_HOME $XDG_STATE_HOME
(cd $NEREUS && .venv/bin/python -m nereus.packs resolve content/packs/scenarios/talos_uwrt_rpac -o /tmp/pool_resolved.json)
python3 $HERE/../debugging/static_tf_from_bag.py $BAG > /tmp/pool_static.log 2>&1 & STATIC=$!
sleep 2
ros2 bag play $BAG --clock 100 --start-offset $START --disable-keyboard-controls > /tmp/pool_play.log 2>&1 & PLAY=$!
(cd $NEREUS && ./build/ros-viewer/nereus-viewer --scenario /tmp/pool_resolved.json --pose-source estimate \
   --use-sim-time true --layout standard --theme ${THEME:-heat-sheet} --focus Vehicle ${EXTRA} \
   --hidden --frames $FRAMES --screenshot $OUT) > /tmp/pool_viewer.log 2>&1 || true
kill -INT $PLAY 2>/dev/null; kill $STATIC 2>/dev/null; wait 2>/dev/null
echo "saved $OUT"
