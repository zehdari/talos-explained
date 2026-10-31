#!/usr/bin/env python3
"""Crops for viewer.html, from the Nereus media library (docs/media/nereus.md).

    python3 tools/viewer/make_images.py          # the image crops
    python3 tools/viewer/make_images.py video    # run-pool.mp4 / .jpg, the run video cropped to the pool view

Every crop is cut so that it can be shown at about 1:1 on a phone (at most ~430 px wide), which keeps the viewer's
13 px interface text at 11 px or more. Sources: public/media/nereus/*.webp and the full-resolution screenshots
in /tmp/nmedia/shots (pc_side.png, travel3.png; kept from the 2026-10-30/31 capture runs).
"""
import subprocess
import sys
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parents[2]
MEDIA = SITE / "public/media/nereus"
IMG = SITE / "public/img/viewer"
SHOTS = Path("/tmp/nmedia/shots")

# name: (source, crop box)
CROPS = {
    # (The Motion panel and the four robot panels are redrawn in HTML by src/pages/viewer.js: their two-column
    # layouts can't be cropped narrow enough for a phone without cutting buttons in half.)
    # Scorecard: magnet targets and the latest events. Display: the Course and Localization estimate blocks.
    "scorecard-events": (IMG / "scorecard.webp", (0, 628, 372, 848)),
    "display-ghosts": (IMG / "display-window.webp", (0, 216, 341, 492)),
    # The TF frames window's frame tree, and the forward camera card.
    "tf-tree": (IMG / "tf-frames.webp", (0, 222, 300, 470)),
    "camera-card-ffc": (MEDIA / "viewer-camera-cards.webp", (0, 0, 362, 318)),
    # Pool view crops (the pool view is x 402-1166, y 170-970 of the 1600 x 1000 window).
    "point-clouds-side": (SHOTS / "pc_side.png", (402, 262, 402 + 720, 262 + 396)),
    "mpc-path-long": (SHOTS / "travel3.png", (402 + 183, 170 + 225, 402 + 764, 170 + 545)),
}



def run_video():
    """tree-run-behind.mp4 (the whole 1280 x 800 window) cut to the pool view, x 322-932 and y 132-720, so Talos isn't
    a postage stamp on a phone. The window's burned-in task label sits outside that, so it is drawn again, top left
    (a player's controls cover the bottom), from its change times (read off the video at 0.1 s steps)."""
    labels = [(0, 0.7, "Kill switch in, dive"), (0.7, 4.8, "Gate"), (4.8, 10.9, "Slalom"),
              (10.9, 16.9, "Random pinger (not simulated)"), (16.9, 21.9, "Torpedo"), (21.9, 23.2, "Torpedo hits fire (large)"),
              (23.2, 37.7, "Table - pick up items with the claw"), (37.7, 40.7, "Table - pill grasped"),
              (40.7, 99, "Table - pill dropped on helmet")]
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    draw = ",".join(
        f"drawtext=fontfile={font}:text='{t}':x=10:y=12:fontsize=22:fontcolor=white:box=1:boxcolor=0x0f2633@0.85"
        f":boxborderw=7:enable='gte(t\\,{a})*lt(t\\,{b})'" for a, b, t in labels)
    src, out = MEDIA / "tree-run-behind.mp4", IMG / "run-pool.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-vf", "crop=610:588:322:132," + draw, "-an",
                    "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                    str(out)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "19.5", "-i", str(out), "-frames:v", "1", "-q:v", "4",
                    str(IMG / "run-pool.jpg")], check=True)
    print(out.name, out.stat().st_size // 1024, "kB")


if len(sys.argv) > 1 and sys.argv[1] == "video":
    run_video()
    sys.exit()

for name, (src, box) in CROPS.items():
    if not src.exists():
        print("missing", src)
        continue
    im = Image.open(src).convert("RGB").crop(box)
    out = IMG / f"{name}.webp"
    im.save(out, "WEBP", quality=90, method=6)
    print(out.name, im.size)
