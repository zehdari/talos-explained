#!/bin/bash
# viewer.sh FOCUS YAW PITCH DIST
source /tmp/actrec/env.sh
[ -f /tmp/actrec/viewer.pid ] && kill $(cat /tmp/actrec/viewer.pid) 2>/dev/null; sleep 1
cd ~/osu-uwrt/release/nereus
setsid build/ros-viewer/nereus-viewer --pose-source truth --no-detections --panels none --focus "$1" --orbit $2 $3 $4 --render-rate 30 > /tmp/actrec/viewer.log 2>&1 &
echo $! > /tmp/actrec/viewer.pid
sleep 10
w=$(xdotool search --name "Nereus" | head -1); xdotool windowmove $w 0 0; xdotool windowsize $w 1280 960; sleep 1
xdotool mousemove 598 109; sleep 0.3; xdotool mousedown 1; sleep 0.1; xdotool mouseup 1; sleep 0.3; xdotool mousemove 1270 950
