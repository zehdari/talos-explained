#!/bin/bash
source /tmp/nmedia/env.sh
cd $HOME/osu-uwrt/release/nereus
exec ros2 launch nereus sim.launch.py active_control_model:=mpc mpc_model:=sim close_with_viewer:=false output:=/tmp/nmedia/run/sim > /tmp/nmedia/launch.log 2>&1
