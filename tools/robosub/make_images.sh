#!/usr/bin/env bash
# Rebuild public/img/robosub/ (robosub.html's task cards and robot photos).
#   viewer_*.webp  frames of public/video/mission_8x.mp4 (the exact-course Nereus run, 8x), cropped to each subject
#   (the run video itself, run_8x.mp4, is make_video.sh)
#   cam_*.webp     the perception chapter's camera event frames (mission 11) at 1120 px, via cam_frames.py
#                  (needs the annotated frame dump, CAM_FRAMES, default /tmp/perc/cam_m11.mp4.frames)
#   robot_*.webp   vehicle photos from the team website (uwrt.org repo, src/assets/placeholder/vehicles)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$ROOT/public/img/robosub
V=$ROOT/public/video/mission_8x.mp4
PH=$HOME/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles
mkdir -p "$OUT"

# grab TIME NAME W:H:X:Y  (crop inside the 3D view, which spans 996x430 from 283,70 of the 1280x720 frame), 2:1
grab() { IFS=: read -r w hh x y <<<"$3"; ffmpeg -v error -y -ss "$1" -i "$V" -frames:v 1 -vf "crop=$w:$hh:$((283 + x)):$((70 + y))" -c:v libwebp -quality 85 "$OUT/$2.webp"; }
grab 3.0 viewer_gate 640:320:340:0       # gate top bar, both role signs, Talos under the repair half
grab 42 viewer_octagon 600:300:220:85    # octagon ring, Talos inside, the table below
grab 53 viewer_bins 520:290:310:125     # Talos just above the four crates, a magnet light (red, bottom right)
grab 64.5 viewer_home 640:320:180:0      # back on the start side of the gate, still facing the course

python3 "$ROOT/tools/robosub/cam_frames.py" "${CAM_FRAMES:-/tmp/perc/cam_m11.mp4.frames}"

convert "$PH/older-puddles.jpg" -crop 660x440+730+680 +repage -resize 640x427^ -gravity center -extent 640x427 -quality 78 "$OUT/robot_puddles.webp"
for p in "older-maelstrom.png maelstrom" "older-tempest.jpg tempest" "talos-3.jpg talos" "older-ss-flip-barker.png ssfb" "triton-1.jpg triton"; do
  set -- $p
  convert "$PH/$1" -resize 640x427^ -gravity center -extent 640x427 -quality 78 "$OUT/robot_$2.webp"
done
# Riptide 1.0 / 2.0: crop to the vehicle (the originals are team photos)
convert "$PH/older-riptide-1.jpg" -crop 690x460+520+560 +repage -resize 640x427^ -gravity center -extent 640x427 -quality 78 "$OUT/robot_riptide1.webp"
convert "$PH/older-riptide-2.jpg" -crop 480x320+400+270 +repage -resize 640x427^ -gravity center -extent 640x427 -quality 80 "$OUT/robot_riptide2.webp"
ls -la "$OUT"
