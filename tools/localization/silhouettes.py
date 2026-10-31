# Two flat-shaded orthographic drawings of Talos for the frame explorer, from the site's own model
# (public/models/talos.glb, in the vehicle's `origin` frame: x forward, y port, z up):
#   talos-top.webp   from above, bow up, starboard to the right
#   talos-rear.webp  from behind, starboard to the right, up is up
# Both share the horizontal axis (-y), so a frame drawn in one lines up with the other. The extents go into
# public/data/localization/silhouettes.json so the page can place frames on them.
#
#   node tools/localization/glb_dump.mjs /tmp/talos_tris.bin
#   systemd-run --user --scope -p MemoryMax=6G python3 tools/localization/silhouettes.py /tmp/talos_tris.bin
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(__file__)
IMG = os.path.join(HERE, '../../public/img/localization')
DATA = os.path.join(HERE, '../../public/data/localization/silhouettes.json')
MM_PER_PX = 1.5
PAD = 0.01  # m around the model

tri = np.fromfile(sys.argv[1] if len(sys.argv) > 1 else '/tmp/talos_tris.bin', dtype=np.float32).reshape(-1, 3, 3).astype(np.float64)
lo, hi = tri.reshape(-1, 3).min(0) - PAD, tri.reshape(-1, 3).max(0) + PAD
n = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12

LIGHT, DARK = np.array([0xe6, 0xee, 0xef]), np.array([0x8d, 0xa7, 0xb0])
EDGE = (0x6f, 0x8c, 0x96, 255)


def draw(name, u_of, v_of, depth, facing, extent_u, extent_v):
    # u: screen right, v: screen up (metres). Painter's order: far to near.
    s = 1000.0 / MM_PER_PX
    W, H = int(np.ceil((extent_u[1] - extent_u[0]) * s)), int(np.ceil((extent_v[1] - extent_v[0]) * s))
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    U = (u_of(tri) - extent_u[0]) * s
    V = (extent_v[1] - v_of(tri)) * s
    order = np.argsort(depth(tri))
    shade = 0.35 + 0.65 * np.abs(facing)  # faces turned to the viewer are lighter
    col = (DARK + (LIGHT - DARK) * shade[:, None]).astype(int)
    for i in order:
        pts = list(zip(U[i], V[i]))
        c = tuple(col[i]) + (255,)
        d.polygon(pts, fill=c, outline=c)
    # A thin outline around the silhouette
    a = np.array(img)[:, :, 3] > 0
    edge = a & ~(np.roll(a, 1, 0) & np.roll(a, -1, 0) & np.roll(a, 1, 1) & np.roll(a, -1, 1))
    arr = np.array(img)
    arr[edge] = EDGE
    img = Image.fromarray(arr)
    path = os.path.join(IMG, name)
    img.save(path, 'WEBP', quality=88, method=6)
    print(name, img.size, os.path.getsize(path), 'bytes')
    return {'file': name, 'px': [W, H], 'u': list(map(float, extent_u)), 'v': list(map(float, extent_v))}


os.makedirs(IMG, exist_ok=True)
# Screen right = -y (starboard) in both views.
eu = (-hi[1], -lo[1])
top = draw('talos-top.webp', lambda t: -t[:, :, 1], lambda t: t[:, :, 0],
           lambda t: t[:, :, 2].max(1), n[:, 2], eu, (lo[0], hi[0]))
rear = draw('talos-rear.webp', lambda t: -t[:, :, 1], lambda t: t[:, :, 2],
            lambda t: -t[:, :, 0].min(1), n[:, 0], eu, (lo[2], hi[2]))
json.dump({'frame': 'talos/origin', 'note': 'u = screen right = -y (starboard); top: v = x (bow up); rear: v = z (up)',
           'top': top, 'rear': rear}, open(DATA, 'w'), indent=1)
print('wrote', DATA)
