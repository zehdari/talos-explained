#!/usr/bin/env python3
"""Repaint the "no depth" pixels of the Nereus depth images (public/img/cameras/nereus_*_depth.webp) from the old
near-black to a light grey hatch, so they can't be mistaken for the far (dark purple) end of the colour ramp.
images.py now draws the hatch itself; this fixes the already-built webps without the source frames."""
import os, numpy as np
from PIL import Image
from scipy import ndimage
D = os.path.join(os.path.dirname(__file__), '../../public/img/cameras')
OLD = np.array([30, 34, 40])
def hatch(h, w):
    yy, xx = np.mgrid[0:h, 0:w]
    return ((xx + yy) % 14) < 3
for cam in ('ffc', 'dfc'):
    p = f'{D}/nereus_{cam}_depth.webp'
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
    m = np.abs(a - OLD).sum(-1) < 40
    m = ndimage.binary_opening(m, iterations=1)
    m = ndimage.binary_dilation(m, iterations=1) & (np.abs(a - OLD).sum(-1) < 90)
    out = a.copy()
    out[m] = (214, 219, 221)
    out[m & hatch(*m.shape)] = (184, 193, 197)
    Image.fromarray(out.astype(np.uint8)).save(p, 'WEBP', quality=86, method=6)
    print(p, 'repainted', round(float(m.mean()), 3))
