#!/usr/bin/env python3
"""Phone version of public/img/launch/launcher-running.webp: the parts the caption points at, big enough to read.

Stacks three crops of the desktop screenshot (same pixels, nothing redrawn): the navigation row's name and its
"2/4 completed" bar side by side, the Monitored Topics box, and the start of the first two Launch Log lines.
Run: python3 tools/launch/crop_phone.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "public/img/launch/launcher-running.webp"
OUT = ROOT / "public/img/launch/launcher-running-phone.webp"

im = Image.open(SRC).convert("RGB")
W = 640
name = im.crop((12, 140, 230, 186))          # "- navigation"
bar = im.crop((800, 140, 1190, 186))         # its progress bar, 2/4 completed
topics = im.crop((12, 190, 652, 352))        # Monitored Topics with Present / Not Present
log = im.crop((0, 862, 486, 908))            # first two Launch Log lines, up to the process name (cyan: starting)
gap = 8
H = name.height + topics.height + log.height + 2 * gap
out = Image.new("RGB", (W, H), im.getpixel((5, 120)))
logbg = Image.new("RGB", (W, log.height), im.getpixel((5, 1050)))
out.paste(name, (0, 0))
out.paste(bar, (W - bar.width, 0))
y = name.height + gap
out.paste(topics, (0, y))
y += topics.height + gap
out.paste(logbg, (0, y))
out.paste(log.crop((0, 0, 486, 23)), (0, y))
out.paste(log.crop((0, 23, 466, 46)), (0, y + 23))
out.save(OUT, "WEBP", quality=88, method=6)
print(OUT, out.size, OUT.stat().st_size, "bytes")
