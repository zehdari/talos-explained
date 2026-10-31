import sys
from PIL import Image
import os
src, dst = sys.argv[1], sys.argv[2]
crop = tuple(map(int, sys.argv[3].split(','))) if len(sys.argv) > 3 and sys.argv[3] != '-' else None
width = int(sys.argv[4]) if len(sys.argv) > 4 else None
im = Image.open(src).convert('RGB')
if crop: im = im.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
if width and im.width > width: im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
q = 85
while True:
    im.save(dst, 'WEBP', quality=q, method=6)
    if os.path.getsize(dst) < 290_000 or q <= 50: break
    q -= 7
print(os.path.basename(dst), im.size, os.path.getsize(dst) // 1024, 'KB q', q)
