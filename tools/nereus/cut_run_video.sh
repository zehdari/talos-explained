#!/bin/bash
# Phone-friendly cut of the whole tree run: the viewer's 3D pool view only, step titles burned in at the top.
# 6x up to the table, then 12x (the table, bins and home legs are long). Raw times are seconds of the screen
# recording; the late ones were read off the viewer's run timer (sim s = raw - 41 - ~4.6 early on).
set -e
SRC=/tmp/nmedia/rec/tree.mkv
OUT=/home/cameron/talos-explained/public/img/nereus/tree-run.mp4
F=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf
R=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
S=41      # raw seconds at video t=0
K=183.9   # raw second where 6x becomes 12x (the table starts)
END=618   # raw second the cut ends (a few seconds after the controller is killed)
# step titles: raw start, raw end, text
steps=(
"41|45.6|Waiting for the kill switch"
"45.6|49.1|Dive"
"49.1|74.0|Gate"
"74.0|110.1|Slalom"
"110.1|146.3|Pinger: skipped (no acoustics)"
"146.3|176.1|Torpedo"
"176.1|183.9|Torpedo hits fire (large)"
"183.9|445.4|Table: claw moves 3 items"
"445.4|550.0|Bins: markers and magnets"
"550.0|609.0|Home through the gate"
"609.0|999|Done: controller killed"
)
v() { python3 -c "a=$1-$S; k=$K-$S; print(round(a/6 if a<k else k/6+(a-k)/12,3))"; }
KV=$(v $K)
vf="crop=760:700:404:220,setpts='if(lt((PTS-STARTPTS)*TB,$K-$S),(PTS-STARTPTS)/6,($K-$S)/TB/6+((PTS-STARTPTS)-($K-$S)/TB)/12)',fps=30,drawbox=x=0:y=0:w=iw:h=62:color=0x0f2633@0.88:t=fill"
for s in "${steps[@]}"; do
  IFS='|' read a b t <<< "$s"
  va=$(v $a); vb=$(v $b)
  t=${t//:/\\:}
  vf+=",drawtext=fontfile=$F:text='$t':fontsize=36:fontcolor=white:x=20:y=13:enable='between(t,$va,$vb)'"
done
vf+=",drawtext=fontfile=$R:text='6×':fontsize=30:fontcolor=0xcfe7ec:x=w-tw-20:y=16:enable='lt(t,$KV)'"
vf+=",drawtext=fontfile=$R:text='12×':fontsize=30:fontcolor=0xcfe7ec:x=w-tw-20:y=16:enable='gte(t,$KV)'"
ffmpeg -v error -y -ss $S -t $(python3 -c "print($END-$S)") -i $SRC -vf "$vf" -an -c:v libx264 -preset slow -crf 28 -pix_fmt yuv420p -movflags +faststart $OUT
ffmpeg -v error -y -ss 0.2 -i $OUT -frames:v 1 -q:v 4 ${OUT%.mp4}.jpg
for s in "${steps[@]}"; do IFS='|' read a b t <<< "$s"; echo "$(v $a) $t"; done
ls -la $OUT ${OUT%.mp4}.jpg
