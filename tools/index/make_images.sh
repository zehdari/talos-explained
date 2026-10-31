#!/bin/sh
# Stills for the front page's "follow one decision" figure, cropped from the Nereus media library
# (public/media/nereus, see docs/media/nereus.md). Run from the repo root: sh tools/index/make_images.sh
set -e
M=public/media/nereus
O=public/img/index
mkdir -p "$O"
w() { ffmpeg -loglevel error -y "$@"; }
# 1. What the forward camera sends: a Nereus forward-camera frame of the torpedo board, 960x600 (the cameras
#    chapter's still; the viewer's camera card, 351 px wide, was too soft at the figure's size).
cp public/img/cameras/nereus_ffc_rgb.webp $O/step-camera.webp
# 2. The detector's annotated stream at sim 1:48, the whole board in view (cameras-yolo.mp4, left half).
w -ss 10.8 -i $M/cameras-yolo.mp4 -frames:v 1 -vf "crop=960:574:0:26,scale=800:-1" -q:v 82 $O/step-detect.webp
# 3. Depth cloud on the board plus the YOLO detection points, in the viewer.
w -i $M/viewer-point-clouds-close.webp -vf "crop=520:350:545:330" -q:v 85 $O/step-pose.webp
# 5. The tree running (Autonomy panel, its execution stack down to the last whole row; the source ends mid-row 04)
#    above the launcher armed (Actuators panel, down to Fire torpedo). Stacked, so the still is not a thin strip.
w -i $M/viewer-tree-running.webp -i $M/viewer-tree-running.webp -filter_complex \
  "[0]crop=400:267:0:705[a];[1]crop=418:183:1172:727,scale=400:-2,pad=400:ih+6:0:6:0x0f2633[b];[a][b]vstack" -q:v 88 $O/step-tree.webp
# 6. Lining up: the motion table (commanded vs actual) and Talos with its thrust arrows in front of the board.
w -i $M/viewer-tree-running.webp -i $M/viewer-tree-running.webp -filter_complex \
  "[0]crop=390:215:0:255,pad=390:330:0:58:0xf3f7f7[a];[1]crop=470:330:560:400[b];[a][b]hstack" -q:v 85 $O/step-mpc.webp
# 7. An ESC board (render of its PCB design), four thrusters per board.
w -i public/media/boards/esc-top.webp -vf "scale=760:-1" -q:v 86 $O/step-esc.webp
# Hero poster: the 3D model as the page draws it, shown while the GLB loads. Needs the dev server.
node tools/index/hero_poster.mjs
python3 -c "
from PIL import Image
im = Image.open('/tmp/hero-poster.png'); c = im.crop(im.split()[-1].getbbox())
c.resize((round(c.width * 720 / c.height), 720), Image.LANCZOS).save('$O/hero-poster.webp', quality=72, method=6)"
