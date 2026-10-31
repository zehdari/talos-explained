#!/usr/bin/env python3
"""Images for the "Hull, frame and layout" chapter. Run from the repo root.

- Team photos of Talos (from the team website's image library, ~/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles)
  -> public/img/mechanical/*.webp, 1400 px wide.
- Thumbnails of the whole-vehicle CAD renders (public/media/cad/talos-*.webp) for the gallery
  -> public/img/mechanical/thumbs/*.webp.
- 800 px copies of every CAD render the chapter shows (named in mechanical.html or src/pages/mechanical.js),
  used through srcset so phones don't download the 1600 px originals
  -> public/img/mechanical/800/*.webp.
"""
import glob, os, re
from PIL import Image

SRC = os.path.expanduser('~/osu-uwrt/uwrt.org/src/assets/placeholder/vehicles')
os.makedirs('public/img/mechanical/thumbs', exist_ok=True)
for src, name in [('talos-3.jpg', 'talos-front-lab'), ('talos-2.jpg', 'talos-cages-out')]:
    im = Image.open(f'{SRC}/{src}').convert('RGB')
    im.thumbnail((1400, 1400))
    im.save(f'public/img/mechanical/{name}.webp', 'WEBP', quality=80, method=6)
for f in sorted(glob.glob('public/media/cad/talos-*.webp')):
    im = Image.open(f).convert('RGB')
    im.thumbnail((260, 200))
    im.save(f'public/img/mechanical/thumbs/{os.path.basename(f)}', 'WEBP', quality=78, method=6)

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
