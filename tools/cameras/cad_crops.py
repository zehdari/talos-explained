#!/usr/bin/env python3
"""In-context CAD crops for cameras.html (public/img/cameras/cad_{ffc_front,dfc_below}.webp): the full-resolution
SolidWorks renders (/tmp/cadshots/raw/talos-{front,bottom}.bmp, see docs/media/cad.md) cropped to the starboard tube,
with the camera ringed in the site's accent orange.
Usage: python3 cad_crops.py [raw dir]"""
import os, sys
from PIL import Image, ImageDraw

RAW = sys.argv[1] if len(sys.argv) > 1 else '/tmp/cadshots/raw'
OUT = os.path.join(os.path.dirname(__file__), '../../public/img/cameras')
ACCENT = (217, 72, 15)

# Boxes in raw-render pixels (4756 x 2644 renders): crop (x0, y0, x1, y1) and the camera to ring.
JOBS = [
    ('talos-front', 'cad_ffc_front', (1982, 845, 3071, 1571), (2390, 1126, 2626, 1226)),
    ('talos-bottom', 'cad_dfc_below', (1950, 894, 3552, 1962), (2414, 1265, 2547, 1580)),
]
for src, name, crop, ring in JOBS:
    im = Image.open(f'{RAW}/{src}.bmp').convert('RGB')
    d = ImageDraw.Draw(im)
    pad = 22
    d.rounded_rectangle((ring[0] - pad, ring[1] - pad, ring[2] + pad, ring[3] + pad), radius=28, outline=ACCENT, width=11)
    out = im.crop(crop).resize((1200, 800), Image.LANCZOS)
    p = f'{OUT}/{name}.webp'
    out.save(p, 'WEBP', quality=84, method=6)
    print(p, os.path.getsize(p))
