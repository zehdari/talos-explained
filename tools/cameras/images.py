#!/usr/bin/env python3
"""Images for the cameras chapter (public/img/cameras/):
  ffc_bench.webp            a real forward-camera frame (rgb/image_rect_color/compressed, bench, 2026-10-20)
  pool_left/right.webp      one raw stereo pair from a 2025 pool SVO2 recording (ZED X, then the forward camera)
  nereus_<cam>_rgb/depth    a Nereus frame as the stack receives it: the JPEG and its depth_registered image
Inputs: ~/robot/snapshots, /tmp/camwork/svo_{left,right}_full.png (decoded with ffmpeg from the SVO2's HEVC stream),
/tmp/perc/frames (saved from the Nereus topics by riptide-perception-explained tools/nereus/grab_frames.py)."""
import os, sys, numpy as np, cv2
from PIL import Image
HOME = os.path.expanduser('~')
OUT = os.path.join(os.path.dirname(__file__), '../../public/img/cameras')
def save(img, name, w, q=80):
    im = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB)) if isinstance(img, np.ndarray) else img
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    p = f'{OUT}/{name}.webp'; im.save(p, 'WEBP', quality=q, method=6); print(p, os.path.getsize(p))
save(cv2.imread(f'{HOME}/robot/snapshots/ffc_20261020_154052.jpg'), 'ffc_bench', 1280)
save(cv2.imread('/tmp/camwork/svo_left_full.png'), 'pool_left', 1280)
save(cv2.imread('/tmp/camwork/svo_right_full.png'), 'pool_right', 1280)
for name, frame in [('ffc', sys.argv[1] if len(sys.argv) > 1 else 'f0005_ffc'), ('dfc', sys.argv[2] if len(sys.argv) > 2 else 'f0013_dfc')]:
    rgb = cv2.imread(f'/tmp/perc/frames/{frame}.jpg')
    d = np.load(f'/tmp/perc/frames/{frame}_depth.npz')['depth'].astype(np.float32)
    lo, hi = 0.0, (4.0 if name == 'ffc' else 2.0)  # colour scale, metres (legend in cameras.js)
    t = np.clip((d - lo) / (hi - lo), 0, 1)
    col = cv2.applyColorMap((255 * (1 - t)).astype(np.uint8), cv2.COLORMAP_VIRIDIS)  # near = bright
    col[~np.isfinite(d)] = (40, 34, 30)  # no depth: dark
    save(rgb, f'nereus_{name}_rgb', 960)
    save(col, f'nereus_{name}_depth', 960)
    print(name, frame, 'depth range', np.nanmin(d), np.nanmax(d), 'nan frac', float(np.mean(~np.isfinite(d))))
