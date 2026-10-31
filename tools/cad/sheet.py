import sys, glob
from PIL import Image, ImageDraw
fs = sorted(sum((glob.glob(p) for p in sys.argv[2:]), []))
W = 420
ims = [Image.open(f).convert('RGB') for f in fs]
th = [im.resize((W, int(im.height * W / im.width))) for im in ims]
H = max(t.height for t in th) + 18
cols = 4
sheet = Image.new('RGB', (W * cols, H * ((len(th) + cols - 1) // cols)), (200, 200, 200))
d = ImageDraw.Draw(sheet)
for i, (t, f) in enumerate(zip(th, fs)):
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(t, (x, y + 18)); d.text((x + 4, y + 3), f.split('/')[-1], fill=(0, 0, 0))
sheet.save(sys.argv[1]); print(sheet.size)
