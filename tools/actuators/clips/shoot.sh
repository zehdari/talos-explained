#!/bin/bash
# shoot.sh NAME "X Y Z YAW" FIRE_ACTIONS(space-separated t:action, wall s; slow phase starts at 4 s) REC_FROM REC_LEN [RTF]
source /tmp/actrec/env.sh; export DISPLAY=:91; cd /tmp/actrec
NAME=$1; POSE=$2; ACTS=$3; RF=$4; RL=$5; RTF=${6:-0.04}
TOTAL=$(python3 -c "print($RF+$RL+1)")
python3 hold.py $POSE $TOTAL 0:unkill 0.5:notify_reload 1:arm $ACTS > hold_$NAME.log 2>&1 &
HP=$!
sleep 2.5; ros2 param set /talos/physics_simulator real_time_factor $RTF >/dev/null
sleep $(python3 -c "print(max(0,$RF-2.5-0.0))")
ffmpeg -v error -y -f x11grab -framerate 15 -video_size 876x760 -i :91+0,170 -t $RL -c:v libx264 -crf 14 -preset ultrafast rec_$NAME.mkv
wait $HP
ros2 param set /talos/physics_simulator real_time_factor 1.0 >/dev/null
cat hold_$NAME.log
