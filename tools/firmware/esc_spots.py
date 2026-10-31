#!/usr/bin/env python3
"""Tap targets for the ESC board figure in firmware.html: where the parts the firmware talks to sit on the
top render (public/media/boards/esc-top.webp, made by tools/boards/render_all.sh).

Same mm -> px mapping as tools/boards/hotspots.py (board outline from the soldermask-green pixels, KiCad board box
from the converted PCB), with a different list of parts. Needs the boards work dir (tools/boards/convert_all.sh and
render_all.sh leave esc.json and esc_top.png there).

Usage: WORK=/tmp/boards_work python3 tools/firmware/esc_spots.py > public/data/firmware/esc_spots.json
"""
import json, os, pathlib, sys
import numpy as np
from PIL import Image

WORK = pathlib.Path(os.environ.get('WORK', '/tmp/boards_work'))
BORDER, MAXSIDE = 12, 1400

# ref -> id used by the page. Refs and values are from the ESC board PCB (electric_boogaloo, via esc.json).
REFS = ['U1R', 'U2R', 'Y1R', 'U1C', 'U2C', 'SW1C', 'D1C', 'J1R', 'SW1R', 'SW2R', 'J11', 'SB1', 'J12', 'J6',
        'M1', 'M2', 'M3', 'M4', 'J7', 'J8', 'J9', 'J10', 'R3', 'R4']

summary = json.loads((WORK / 'esc.json').read_text())
rgba = np.asarray(Image.open(WORK / 'esc_top.png').convert('RGBA'))
a = rgba[..., 3] > 191
r, g, b = (rgba[..., i].astype(int) for i in range(3))
ys, xs = np.nonzero(a & (g > r + 12) & (g > b + 4))
x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
ox, oy = summary['origin_mm']
w, h = summary['size_mm']
s = ((x1 - x0) / w + (y1 - y0) / h) / 2
ty, tx = np.nonzero(a)
tx0, ty0, tx1, ty1 = tx.min(), ty.min(), tx.max() + 1, ty.max() + 1
W, H = tx1 - tx0 + 2 * BORDER, ty1 - ty0 + 2 * BORDER

fps = {f['ref']: f for f in summary['footprints']}
spots = {}
for ref in REFS:
    f = fps.get(ref)
    if not f or f['side'] != 'top':
        print('missing', ref, file=sys.stderr)
        continue
    bx, by, bw, bh = f.get('pads_bbox_mm') or f['bbox_mm']
    cx, cy = bx + bw / 2, by + bh / 2
    px, py = x0 + (cx - ox) * s, y0 + (cy - oy) * s
    spots[ref] = {'value': f['value'], 'x': round((px - tx0 + BORDER) / W, 4), 'y': round((py - ty0 + BORDER) / H, 4)}

json.dump({'generated_by': 'tools/firmware/esc_spots.py', 'image': 'media/boards/esc-top.webp',
           'image_px': [round(W * min(1, MAXSIDE / max(W, H))), round(H * min(1, MAXSIDE / max(W, H)))],
           'spots': spots}, sys.stdout, indent=1)
print()
