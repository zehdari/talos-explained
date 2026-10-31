#!/usr/bin/env bash
# Rebuild public/img/robosub/ (robosub.html's task cards and robot photos).
#   viewer_*.webp  frames of public/video/mission_8x.mp4 (the exact-course Nereus run, 8x), 3D view cropped
#   cam_*.webp     copies of the perception chapter's camera event frames (public/img/events, mission 11)
#   robot_*.webp   vehicle photos from the team website (uwrt.org repo, src/assets/placeholder/vehicles)
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=$ROOT/public/img/robosub
V=$ROOT/public/video/mission_8x.mp4
E=$ROOT/public/img/events
PH=$HOME/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles
mkdir -p "$OUT"

grab() { ffmpeg -v error -y -ss "$1" -i "$V" -frames:v 1 -vf "crop=997:430:283:70,scale=800:-2" -c:v libwebp -quality 80 "$OUT/$2.webp"; }
grab 2.6 viewer_gate
grab 21 viewer_octagon
grab 53 viewer_bins
grab 64.5 viewer_home

cp "$E/m11_000.webp" "$OUT/cam_slalom.webp"
cp "$E/m11_003.webp" "$OUT/cam_torpedo.webp"
cp "$E/m11_005.webp" "$OUT/cam_table.webp"
cp "$E/m11_016.webp" "$OUT/cam_bins.webp"

convert "$PH/older-puddles.jpg" -crop 660x440+730+680 +repage -resize 640x427^ -gravity center -extent 640x427 -quality 78 "$OUT/robot_puddles.webp"
for p in "older-maelstrom.png maelstrom" "older-tempest.jpg tempest" "talos-3.jpg talos" "older-ss-flip-barker.png ssfb" "triton-1.jpg triton"; do
  set -- $p
  convert "$PH/$1" -resize 640x427^ -gravity center -extent 640x427 -quality 78 "$OUT/robot_$2.webp"
done
ls -la "$OUT"
