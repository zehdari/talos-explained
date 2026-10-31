#!/usr/bin/env python3
"""Images for the "Hull, frame and layout" chapter. Run from the repo root.

- Team photos of Talos (from the team website's image library, ~/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles)
  -> public/img/mechanical/*.webp, 1400 px wide.
- Crops of the "ctx-*" renders (one part in orange on a grey Talos) around the orange part, for the
  "Outside the hull" figure -> public/img/mechanical/crop/*.webp, 4:3, at most 1000 px wide.
- 800 px copies of every CAD render the chapter shows (named in mechanical.html or src/pages/mechanical.js),
  used through srcset so phones don't download the 1600 px originals
  -> public/img/mechanical/800/*.webp.
"""
import glob, os, re
from PIL import Image

SRC = os.path.expanduser('~/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles')
for src, name in [('talos-3.jpg', 'talos-front-lab'), ('talos-2.jpg', 'talos-cages-out')]:
    im = Image.open(f'{SRC}/{src}').convert('RGB')
    im.thumbnail((1400, 1400))
    im.save(f'public/img/mechanical/{name}.webp', 'WEBP', quality=80, method=6)

# Crops around the orange highlight. Value: the smallest crop width in source pixels (more = more context).
import numpy as np
os.makedirs('public/img/mechanical/crop', exist_ok=True)
CROPS = {'ctx-kill-switch-iso': 720, 'ctx-magnet-poker-iso': 760, 'ctx-torpedo-marker-launcher-below': 1000, 'ctx-claw-iso': 1000,
         'ctx-dvl-below': 900, 'ctx-acoustics-below': 900, 'ctx-depth-sensor-zoom': 700}
for name, minw in CROPS.items():
    img = Image.open(f'public/media/cad/{name}.webp').convert('RGB')
    a = np.asarray(img).astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    ys, xs = np.nonzero((r > 150) & (g < 140) & (b < 90) & (r - g > 80))
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
    W, H = img.size
    cw = min(max(minw, (x1 - x0) * 1.6, (y1 - y0) * 1.6 * 4 / 3), W)
    ch = min(cw * 3 / 4, H)
    cw = ch * 4 / 3
    L = min(max((x0 + x1) / 2 - cw / 2, 0), W - cw)
    T = min(max((y0 + y1) / 2 - ch / 2, 0), H - ch)
    c = img.crop((int(L), int(T), int(L + cw), int(T + ch)))
    c.thumbnail((1000, 750), Image.LANCZOS)
    c.save(f'public/img/mechanical/crop/{name}.webp', 'WEBP', quality=82, method=6)

os.makedirs('public/img/mechanical/800', exist_ok=True)
text = open('mechanical.html').read() + open('src/pages/mechanical.js').read()
names = set(re.findall(r'/media/cad/([a-z0-9-]+)\.webp', text)) | set(re.findall(r"'((?:ctx|talos|sub)-[a-z0-9-]+)'", text))
for name in sorted(names):
    f = f'public/media/cad/{name}.webp'
    if not os.path.exists(f):
        continue
    im = Image.open(f).convert('RGB')
    im.thumbnail((800, 2000), Image.LANCZOS)
    im.save(f'public/img/mechanical/800/{name}.webp', 'WEBP', quality=80, method=6)
