#!/usr/bin/env python3
"""Side (x-z) and top (x-y) silhouettes of Talos, in the CAD `origin` frame (metres), from the Nereus robot pack meshes.
Writes simplified polygons (outer outlines plus holes) to JSON. Run under a memory cap:
  systemd-run --user --scope -p MemoryMax=6G ~/tools/cadvenv/bin/python silhouette.py <nereus talos pack dir> <out.json>"""
import sys, json, numpy as np, cv2, trimesh
pack, out = sys.argv[1], sys.argv[2]
RES = 0.002  # metres per pixel
parts = [('assets/visual/Talos3_body.glb', [0, 0, 0]),
         ('assets/visual/claw/assembly_static.glb', [0.1845620038521386, 0.034362, -0.4164364383477267]),
         ('assets/visual/claw/assembly_left.glb', [0.1845620038521386, 0.034362, -0.4164364383477267]),
         ('assets/visual/claw/assembly_right.glb', [0.1845620038521386, 0.034362, -0.4164364383477267])]
tris = []
for path, off in parts:
    s = trimesh.load(f'{pack}/{path}')
    m = s.to_geometry() if hasattr(s, 'to_geometry') else s
    tris.append(m.triangles + np.array(off))
T = np.concatenate(tris)
res = {}
for view, (a, b) in {'side': (0, 2), 'top': (0, 1)}.items():
    P = T[:, :, [a, b]]
    lo = P.reshape(-1, 2).min(0) - 0.01; hi = P.reshape(-1, 2).max(0) + 0.01
    W, H = (np.ceil((hi - lo) / RES)).astype(int) + 1
    px = np.round((P - lo) / RES).astype(np.int32)
    px[:, :, 1] = H - 1 - px[:, :, 1]  # image rows grow downward; world up is +z / +y
    img = np.zeros((H, W), np.uint8)
    cv2.fillPoly(img, list(px), 255)
    img = cv2.morphologyEx(img, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, hier = cv2.findContours(img, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    for c in cs:
        if cv2.contourArea(c) < 40: continue  # drop specks under ~1.6 cm^2
        c = cv2.approxPolyDP(c, 1.2, True).reshape(-1, 2).astype(float)
        xy = np.stack([lo[0] + c[:, 0] * RES, lo[1] + (H - 1 - c[:, 1]) * RES], 1)
        polys.append(np.round(xy, 4).tolist())
    res[view] = {'bounds': [np.round(lo, 4).tolist(), np.round(hi, 4).tolist()], 'polys': polys}
    print(view, W, H, len(polys), sum(len(p) for p in polys), 'points')
json.dump(res, open(out, 'w'), separators=(',', ':'))
