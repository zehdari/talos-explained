"""Decimate the per-subsystem STLs exported by SolidWorks (make_stl_args.py + shots.cs) into one GLB.

usage (run under a memory cap):
  systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0 ~/tools/cadvenv/bin/python -I \
      tools/cad/build_glb.py STL_DIR public/models/talos-cad.glb public/data/cad/glb.json

Frame of the GLB: the Talos.SLDASM assembly frame in metres, which is already glTF's Y-up:
+X = port, +Y = up, +Z = bow (forward). Origin = CAD origin (not the riptide base_link).
One node per subsystem (name = group id, extras.label); the thrusters are split into one node per T200.
Positions only (no normals: the viewer computes creased normals), uint16 indices where they fit.
"""
import json, struct, sys, os
import numpy as np, trimesh, fast_simplification

stl_dir, out_glb, out_json = sys.argv[1:4]
here = os.path.dirname(os.path.abspath(__file__))
groups = json.load(open(os.path.join(here, 'glb_groups.json')))
asm = json.load(open(os.path.join(here, '../../public/data/cad/assembly.json')))
BUDGET = {'hull': 45000, 'frame': 30000, 'electronics': 30000, 'batteries': 14000, 'thrusters': 24000,
          'thruster_guards': 8000, 'foam': 6000, 'dvl': 6000, 'down_camera': 4000, 'launcher': 12000,
          'claw': 8000, 'magnet_poker': 2000, 'acoustics': 6000, 'kill_switch': 4000, 'cables': 14000, 'subconns': 8000}


def decimate(m, target):
    """Quadric decimation toward target triangles. Board parts (resistors, pins) are many tiny closed pieces the
    decimator can't shrink, so pieces under 4 mm are dropped first, and the pass repeats with more aggression."""
    if len(m.faces) > target:
        parts = m.split(only_watertight=False)
        if len(parts) > 1:
            keep = [p for p in parts if (p.bounds[1] - p.bounds[0]).max() >= 0.004]
            m = trimesh.util.concatenate(keep) if keep else m
    v, f = m.vertices.astype(np.float64), m.faces.astype(np.int64)
    for agg in (5, 7, 9):
        if len(f) <= target * 1.1:
            break
        v, f = fast_simplification.simplify(v, f, target_reduction=1 - target / len(f), agg=agg)
    return np.asarray(v, np.float32), np.asarray(f, np.int64)


def hexrgb(h):
    return [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]


meshes = []   # (name, label, colour, V (m), F)
info = []
for g in groups:
    p = os.path.join(stl_dir, g['id'] + '.stl')
    if not os.path.exists(p):
        print('missing', p); continue
    m = trimesh.load(p, process=True)   # merges STL soup vertices
    raw = len(m.faces)
    m.vertices *= 0.001
    if g['id'] == 'thrusters':
        # one node per T200: assign each connected piece to the nearest thruster origin from assembly.json
        cents = np.array([t['origin_cad_mm'] for t in asm['thrusters']]) * 0.001
        parts = m.split(only_watertight=False)
        buckets = [[] for _ in cents]
        for pc in parts:
            buckets[int(np.argmin(np.linalg.norm(cents - pc.bounds.mean(0), axis=1)))].append(pc)
        for t, b in zip(asm['thrusters'], buckets):
            if not b: continue
            mm = trimesh.util.concatenate(b)
            V, F = decimate(mm, BUDGET['thrusters'] // 8)
            name = 'thruster ' + t['part'].split('/')[-1]
            meshes.append((name, f"T200 ({t['module']}, {t['position']})", g['colour'], V, F))
            lo, hi = mm.bounds
            info.append({'node': name, 'group': 'thrusters', 'label': meshes[-1][1], 'colour': g['colour'], 'tris_in': len(mm.faces), 'tris_out': len(F),
                         'bbox_m': {'min': np.round(lo, 4).tolist(), 'max': np.round(hi, 4).tolist(), 'size': np.round(hi - lo, 4).tolist()}})
        continue
    if g['id'] == 'foam':
        # The corner-module foam blocks are ~100-triangle boxes next to the bottles' 20k-triangle hardware: decimating
        # the node as one mesh collapsed them to nothing. Keep small pieces as they are; decimate only the big ones.
        parts = m.split(only_watertight=False)
        small = [p for p in parts if len(p.faces) <= 300 and (p.bounds[1] - p.bounds[0]).max() >= 0.004]
        big = [p for p in parts if len(p.faces) > 300]
        Vb, Fb = decimate(trimesh.util.concatenate(big), BUDGET['foam'] - sum(len(p.faces) for p in small))
        keep = trimesh.util.concatenate(small + [trimesh.Trimesh(Vb, Fb, process=False)])
        V, F = np.asarray(keep.vertices, np.float32), np.asarray(keep.faces, np.int64)
    else:
        V, F = decimate(m, BUDGET.get(g['id'], 6000))
    meshes.append((g['id'], g['label'], g['colour'], V, F))
    lo, hi = m.bounds
    info.append({'node': g['id'], 'group': g['id'], 'label': g['label'], 'colour': g['colour'], 'tris_in': raw, 'tris_out': len(F),
                 'bbox_m': {'min': np.round(lo, 4).tolist(), 'max': np.round(hi, 4).tolist(), 'size': np.round(hi - lo, 4).tolist()}})
    print(f"{g['id']:16s} {raw:8d} -> {len(F):6d} tris, size {np.round((hi - lo) * 1000, 1)} mm")

# --- minimal GLB writer ---
bin_ = bytearray(); views = []; accs = []; gmeshes = []; nodes = []; mats = []


def add_view(data, target):
    while len(bin_) % 4: bin_.append(0)
    views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), 'target': target})
    bin_.extend(data); return len(views) - 1


for name, label, col, V, F in meshes:
    pv = add_view(V.astype('<f4').tobytes(), 34962)
    accs.append({'bufferView': pv, 'componentType': 5126, 'count': len(V), 'type': 'VEC3',
                 'min': V.min(0).tolist(), 'max': V.max(0).tolist()})
    big = len(V) > 65535
    iv = add_view(F.astype('<u4' if big else '<u2').ravel().tobytes(), 34963)
    accs.append({'bufferView': iv, 'componentType': 5125 if big else 5123, 'count': F.size, 'type': 'SCALAR'})
    mats.append({'name': name, 'pbrMetallicRoughness': {'baseColorFactor': hexrgb(col) + [1], 'metallicFactor': 0.2, 'roughnessFactor': 0.6},
                 'doubleSided': True})
    gmeshes.append({'name': name, 'primitives': [{'attributes': {'POSITION': len(accs) - 2}, 'indices': len(accs) - 1, 'material': len(mats) - 1}]})
    nodes.append({'name': name, 'mesh': len(gmeshes) - 1, 'extras': {'label': label}})

gltf = {'asset': {'version': '2.0', 'generator': 'talos-explained tools/cad/build_glb.py',
                  'extras': {'frame': '+X port, +Y up, +Z bow (Talos.SLDASM assembly frame), metres'}},
        'scene': 0, 'scenes': [{'name': 'Talos CAD', 'nodes': list(range(len(nodes)))}], 'nodes': nodes,
        'meshes': gmeshes, 'materials': mats, 'accessors': accs, 'bufferViews': views,
        'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
while len(bin_) % 4: bin_.append(0)
with open(out_glb, 'wb') as fh:
    fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
    fh.write(struct.pack('<II', len(js), 0x4E4F534A)); fh.write(js)
    fh.write(struct.pack('<II', len(bin_), 0x004E4942)); fh.write(bin_)
json.dump({'glb': os.path.basename(out_glb), 'frame': gltf['asset']['extras']['frame'], 'nodes': info}, open(out_json, 'w'), indent=1)
print(out_glb, os.path.getsize(out_glb) // 1024, 'KB', sum(len(m[4]) for m in meshes), 'tris')
