#!/usr/bin/env bash
# Rebuild public/img/robosub/ (robosub.html's task cards and robot photos).
#   viewer_*.webp  frames of public/video/mission_8x.mp4 (the exact-course Nereus run, 8x), 3D view cropped
#   cam_*.webp     the perception chapter's camera event frames (mission 11) at 1120 px, via cam_frames.py
#                  (needs the annotated frame dump, CAM_FRAMES, default /tmp/perc/cam_m11.mp4.frames)
#   robot_*.webp   vehicle photos from the team website (uwrt.org repo, src/assets/placeholder/vehicles)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$ROOT/public/img/robosub
V=$ROOT/public/video/mission_8x.mp4
PH=$HOME/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles
mkdir -p "$OUT"

grab() { ffmpeg -v error -y -ss "$1" -i "$V" -frames:v 1 -vf "crop=996:430:283:70" -c:v libwebp -quality 82 "$OUT/$2.webp"; }
grab 2.6 viewer_gate
grab 21 viewer_octagon
grab 53 viewer_bins
grab 64.5 viewer_home

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
