#!/bin/bash
# Phone-friendly camera video: only the detector's annotated stream, with the task as a title bar on top.
set -e
SRC=/home/cameron/talos-explained/public/media/nereus/cameras-yolo.mp4
OUT=/home/cameron/talos-explained/public/img/nereus/detector-run.mp4
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
R=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
steps=("0|2.5|Gate: it boxes a slalom pole first" "2.5|5.0|Slalom" "5.0|8.8|Pinger: skipped (no acoustics)" "8.8|12.9|Torpedo" "12.9|37.3|Table: the claw moves items" "37.3|47.5|Bins: markers and magnets" "47.5|99|Home through the gate")
vf="crop=960:572:0:28,pad=960:632:0:60:color=0x0f2633"
for s in "${steps[@]}"; do
  IFS='|' read a b t <<< "$s"; t=${t//:/\\:}
  vf+=",drawtext=fontfile=$F:text='$t':fontsize=38:fontcolor=white:x=22:y=11:enable='between(t,$a,$b)'"
done
vf+=",drawtext=fontfile=$R:text='10×':fontsize=32:fontcolor=0xcfe7ec:x=w-tw-22:y=14"
ffmpeg -v error -y -i $SRC -vf "$vf" -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart $OUT
ffmpeg -v error -y -ss 0.3 -i $OUT -frames:v 1 -q:v 4 ${OUT%.mp4}.jpg
ls -la $OUT ${OUT%.mp4}.jpg
