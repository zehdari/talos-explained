"""Convert SolidWorks SaveBMP captures to cropped webp for the site.

usage: python3 bmp2webp.py IN.bmp OUT.webp [--width 1600] [--pad 0.05] [--aspect 16:10]
Crops to the non-white content plus padding, optionally pads to an aspect ratio, resizes, saves webp under ~300 KB.
"""
import sys, argparse, os
from PIL import Image, ImageChops

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--width', type=int, default=1600)
ap.add_argument('--pad', type=float, default=0.05)
ap.add_argument('--aspect', default='')
ap.add_argument('--maxkb', type=int, default=290)
ap.add_argument('--grey-red', action='store_true', help='turn saturated pure-red pixels (CAD face colours that ignore the grey override) grey; the orange highlight is kept')
ap.add_argument('--drop-small', type=float, default=0, help='ignore detached blobs smaller than this fraction of the largest when cropping (and paint them white)')
a = ap.parse_args()

im = Image.open(a.src).convert('RGB')
if a.grey_red:
    import numpy as np
    arr = np.array(im).astype(float)
    hsv = np.array(im.convert('HSV')).astype(float)
    h, sat = hsv[..., 0] * 360 / 255, hsv[..., 1] / 255
    red = ((h < 9) | (h > 345)) & (sat > 0.45)
    lum = arr @ [0.299, 0.587, 0.114]
    grey = np.clip(0.80 * 255 * (0.35 + 0.65 * lum / max(lum[red].max() if red.any() else 1, 1)), 0, 255)
    for k in range(3):
        arr[..., k] = np.where(red, grey * [0.80, 0.82, 0.84][k] / 0.80, arr[..., k])
    im = Image.fromarray(arr.clip(0, 255).astype('uint8'))
bg = Image.new('RGB', im.size, (255, 255, 255))
diff = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 12 else 0)
if a.drop_small:
    import numpy as np
    from scipy import ndimage
    mask = np.array(diff) > 0
    lab, n = ndimage.label(ndimage.binary_dilation(mask, iterations=6))
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = np.isin(lab, 1 + np.flatnonzero(sizes >= a.drop_small * sizes.max()))
    arr = np.array(im); arr[mask & ~keep] = 255; im = Image.fromarray(arr)
    diff = Image.fromarray(((mask & keep) * 255).astype('uint8'))
box = diff.getbbox()
if box is None:
    sys.exit(f'{a.src}: blank image')
x0, y0, x1, y1 = box
w, h = x1 - x0, y1 - y0
p = int(max(w, h) * a.pad)
x0 -= p; y0 -= p; x1 += p; y1 += p
if a.aspect:
    aw, ah = map(float, a.aspect.split(':'))
    w, h = x1 - x0, y1 - y0
    if w / h < aw / ah:
        nw = h * aw / ah; d = (nw - w) / 2; x0 -= d; x1 += d
    else:
        nh = w * ah / aw; d = (nh - h) / 2; y0 -= d; y1 += d
x0, y0, x1, y1 = map(int, map(round, (x0, y0, x1, y1)))
canvas = Image.new('RGB', (x1 - x0, y1 - y0), (255, 255, 255))
canvas.paste(im, (-x0, -y0))
if canvas.width > a.width:
    canvas = canvas.resize((a.width, round(canvas.height * a.width / canvas.width)), Image.LANCZOS)
os.makedirs(os.path.dirname(os.path.abspath(a.dst)), exist_ok=True)
for q in (88, 82, 76, 70, 62, 55):
    canvas.save(a.dst, 'WEBP', quality=q, method=6)
    if os.path.getsize(a.dst) <= a.maxkb * 1024:
        break
print(f'{a.dst}: {canvas.size[0]}x{canvas.size[1]} q{q} {os.path.getsize(a.dst)//1024} KB')
