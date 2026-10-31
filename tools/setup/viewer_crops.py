"""Phone crops of the viewer screenshot for setup.html (#nereus figure).

The full 1600x1000 frame is unreadable at 390 px, so phones get three parts of the same frame at native resolution:
the Motion panel, the Autonomy panel, and the two camera images side by side (without their small button rows).
Run: python3 tools/setup/viewer_crops.py   (writes public/img/setup/viewer-*.webp)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'public/media/nereus/viewer-startup-killed.webp'
OUT = ROOT / 'public/img/setup'
CROPS = {  # name: (left, top, right, bottom) in the 1600x1000 frame
    'viewer-motion': (0, 88, 400, 476),     # Motion panel
    'viewer-autonomy': (0, 706, 400, 902),  # Autonomy panel
}
CAMS = [(1209, 177, 1560, 396), (1209, 498, 1560, 716)]  # forward, downward: the images only
GAP = 8
OUT.mkdir(parents=True, exist_ok=True)
im = Image.open(SRC).convert('RGB')
for name, box in CROPS.items():
    c = im.crop(box)
    c.save(OUT / f'{name}.webp', quality=92, method=6)
    print(name, c.size)
cams = [im.crop(b) for b in CAMS]
w = sum(c.width for c in cams) + GAP
pair = Image.new('RGB', (w, max(c.height for c in cams)), (255, 255, 255))
pair.paste(cams[0], (0, 0))
pair.paste(cams[1], (cams[0].width + GAP, 0))
pair.save(OUT / 'viewer-cameras.webp', quality=92, method=6)
print('viewer-cameras', pair.size)
(OUT / 'viewer-bar.webp').unlink(missing_ok=True)
