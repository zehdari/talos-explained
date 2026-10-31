"""Build the front-page hero model (public/models/talos-hero.glb) from the per-face SolidWorks tessellation that
tess.cs writes (tess.bin + colors.txt per export folder).

usage (always under a memory cap):
  systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0 ~/tools/cadvenv/bin/python -I \
      tools/cad/build_hero.py OUT_RAW.glb OUT_NODES.json TESS_DIR [TESS_DIR ...]
then compress with gltfpack (see docs/media/cad.md section 3b).

- One glTF node per hero node (hero_nodes.node_of), parented under one node per system; one primitive per
  material. Node and system names are the ids used by public/data/index/hero.json.
- Colours are the CAD's own appearances (face > feature > body > component > part, as tess.cs resolves them).
  Metals, plastics, rubber and clear parts get matching PBR settings; clear parts (CAD transparency, polycarbonate,
  acrylic) are alphaMode BLEND with extras.kind = 'glass'.
- Triangle budget: TOTAL triangles shared out by sqrt(raw triangles) x size, small fasteners and the inside of the
  Orin model get less; parts under the budget keep SolidWorks' tessellation as is. Decimation per (component,
  colour) with fast-simplification. Normals: creased at CREASE degrees.
Frame: Talos.SLDASM assembly frame in metres = glTF Y-up (+X port, +Y up, +Z bow). Origin = CAD origin.
"""
import json, os, re, struct, sys
import numpy as np
import fast_simplification
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, here)
import tessread  # noqa: E402
from hero_nodes import node_of, system_of, FASTENER  # noqa: E402

TOTAL = int(os.environ.get('HERO_TRIS', 1_000_000))
CREASE = 32.0
out_glb, out_json, *dirs = sys.argv[1:]
rows = {}
for l in open(os.path.join(here, 'tree_Talos.jsonl')):
    r = json.loads(l); rows[r['name']] = r

METAL = re.compile(r'6061|5052|6063|alloy|steel|stainless|1\.4310|aisi|brass|copper|alumin', re.I)
METAL_NAME = re.compile(r'stainless|steel|alumin|turnbuckle|crane hook|tension ?rod|draw latch|threaded rod|thimble', re.I)
RUBBER = re.compile(r'rubber|nbr|tpu|o-ring|gasket', re.I)
GLASS_NAME = re.compile(r'PolycarbonateChannels|PolycarbonateViewport|LCD Window|Pod_Lid-|Nalgene Water Bottle-', re.I)


def material_kind(comp, rgba_t):
    r = rows.get(comp, {})
    mat = r.get('material', '') or ''
    leaf = comp.split('/')[-1]
    if rgba_t > 0.3 or GLASS_NAME.search(leaf):
        return 'glass'
    if re.search(r'board|bb-|pcb|_asm|\.step|\.stp', leaf, re.I) and not METAL_NAME.search(leaf):
        return 'plastic'     # circuit boards and vendor STEP models (copper/default materials): not shiny metal
    if RUBBER.search(mat) or RUBBER.search(leaf):
        return 'rubber'
    if METAL.search(mat) or METAL_NAME.search(leaf):
        return 'metal'
    return 'plastic'


def load_colors(d):
    cols = {}
    for l in open(os.path.join(d, 'colors.txt')):
        i, src, vals = (l.rstrip('\n').split('\t') + [''])[:3]
        v = [float(x) for x in vals.split(',')] if vals else None
        cols[int(i)] = v
    return cols


# ------------------------------------------------------------------ read every component
comps = []   # dict(name, node, groups={colkey: tris (n,3,3) float32 m}, raw, size)
for d in dirs:
    cols = load_colors(d)
    for name, xf, faces in tessread.read(os.path.join(d, 'tess.bin')):
        if not faces:
            continue
        node = node_of(name)
        groups = {}
        for ci, t in faces:
            v = cols.get(ci)
            rgb = tuple(round(x, 3) for x in v[:3]) if v else (0.75, 0.75, 0.75)
            tr = round(v[7], 2) if v else 0.0
            kind = material_kind(name, tr)
            key = (rgb, kind)
            groups.setdefault(key, []).append(tessread.to_asm(t.astype(np.float64), xf).astype(np.float32))
        groups = {k: np.concatenate(v) for k, v in groups.items()}
        allp = np.concatenate([g.reshape(-1, 3) for g in groups.values()])
        size = float((allp.max(0) - allp.min(0)).max())
        comps.append(dict(name=name, node=node, groups=groups, raw=sum(len(g) for g in groups.values()), size=size))
print(len(comps), 'components', sum(c['raw'] for c in comps), 'raw triangles')

# ------------------------------------------------------------------ budget


def weight(c):
    w = np.sqrt(c['raw']) * (max(c['size'], 0.004) / 0.05) ** 0.8
    leaf = c['name'].split('/')[-1]
    if FASTENER.search(leaf) or re.search(r'turnbuckle|top hat|hat with no brim|thimble|crane hook', leaf, re.I):
        w *= 0.25
    if re.search(r'o-ring|gasket', leaf, re.I):
        w *= 0.3        # seals: mostly hidden inside the rings and lids
    if c['node'] == 'cc_orin' and c['size'] < 0.03:
        w *= 0.4        # connectors and chips inside the Orin dev kit
    if c['node'].startswith(('thr_', 'hull_', 'cc_ffc', 'dfc', 'kill_switch', 'dvl_body', 'transducer', 'hydro_h1c')):
        w *= 1.4
    return w


W = np.array([weight(c) for c in comps]); R = np.array([c['raw'] for c in comps], float)
lo, hi = 0.0, 1e6
for _ in range(60):
    k = (lo + hi) / 2
    if np.minimum(R, np.maximum(60, k * W)).sum() > TOTAL:
        hi = k
    else:
        lo = k
budget = np.minimum(R, np.maximum(60, lo * W)).astype(int)
print('budget', budget.sum())


def weld(t):
    P = t.reshape(-1, 3)
    q = np.round(P / 2e-6).astype(np.int64)
    _, idx, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    V = P[idx].astype(np.float64)
    F = inv.reshape(-1, 3)
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    return V, F


def simplify(V, F, target):
    if len(F) <= target * 1.05 or len(F) < 40:
        return V, F
    for agg in (5, 7, 9):
        V2, F2 = fast_simplification.simplify(V, F, target_reduction=1 - target / len(F), agg=agg)
        if len(F2) <= target * 1.15:
            break
    if len(F2) < 4:
        return V, F
    return V2, F2


def creased(V, F, angle_deg, FC=None):
    """Split vertices where faces meet at more than angle_deg (or change colour); area-weighted normals inside each
    smooth patch. FC: per-face colour index (or None). Returns V, N, F and the colour index per output vertex."""
    a, b, c = V[F[:, 0]], V[F[:, 1]], V[F[:, 2]]
    fn = np.cross(b - a, c - a)
    ln = np.linalg.norm(fn, axis=1)
    good = ln > 1e-14
    F, fn, ln = F[good], fn[good], ln[good]
    FC = np.zeros(len(F), np.int64) if FC is None else FC[good]
    fu = fn / ln[:, None]
    nf = len(F)
    cv = F.ravel()                       # corner -> vertex
    cf = np.repeat(np.arange(nf), 3)     # corner -> face
    order = np.argsort(cv, kind='stable')
    cvs, cfs = cv[order], cf[order]
    starts = np.r_[0, np.flatnonzero(np.diff(cvs)) + 1]
    counts = np.diff(np.r_[starts, len(cvs)])
    # pairs (corner i, corner j) of the same vertex
    rep = np.repeat(counts, counts)                       # for each sorted corner: its group size
    gstart = np.repeat(starts, counts)
    i_idx = np.repeat(np.arange(len(cvs)), rep)
    off = np.arange(rep.sum()) - np.repeat(np.cumsum(rep) - rep, rep)
    j_idx = gstart[np.repeat(np.arange(len(cvs)), rep)] + off
    cosang = np.cos(np.radians(angle_deg))
    fi, fj = cfs[i_idx], cfs[j_idx]
    ok = (fu[fi] * fu[fj]).sum(1) >= cosang
    acc = np.zeros((len(cvs), 3))
    np.add.at(acc, i_idx[ok], fn[fj[ok]])
    nrm = acc / np.maximum(np.linalg.norm(acc, axis=1), 1e-20)[:, None]
    # unique (vertex, quantised normal) -> output vertex
    qn = np.round(nrm * 2000).astype(np.int64)
    key = np.c_[cvs, qn, FC[cfs]]
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    outV = V[cvs[first]].astype(np.float32)
    outN = nrm[first].astype(np.float32)
    outC = FC[cfs[first]]
    newidx = np.empty(len(cvs), np.int64)
    newidx[order] = inv.ravel()
    return outV, outN, newidx.reshape(-1, 3), outC


# ------------------------------------------------------------------ decimate, merge per (node, material)
merged = {}   # (node, key) -> [(V, F)]
stats = {}
for c, b in zip(comps, budget):
    for key, t in c['groups'].items():
        tb = max(12, int(round(b * len(t) / c['raw'])))
        V, F = weld(t)
        if len(F) == 0:
            continue
        V, F = simplify(V, F, tb)
        rgb, kind = key
        mk = (c['node'], key) if kind == 'glass' else (c['node'], ((1.0, 1.0, 1.0), kind))
        merged.setdefault(mk, []).append((V, F, rgb))
    s = stats.setdefault(c['node'], {'components': 0, 'raw': 0})
    s['components'] += 1; s['raw'] += c['raw']

mats, mat_index = [], {}


def material(key):
    if key in mat_index:
        return mat_index[key]
    (r, g, b), kind = key
    pbr = {'baseColorFactor': [r, g, b, 1.0]}   # (1, 1, 1) for the vertex-coloured kinds
    m = {'name': f'{kind} {r:.3f},{g:.3f},{b:.3f}', 'doubleSided': True, 'extras': {'kind': kind}}
    if kind == 'metal':
        pbr.update(metallicFactor=0.75, roughnessFactor=0.38)
    elif kind == 'rubber':
        pbr.update(metallicFactor=0.0, roughnessFactor=0.85)
    elif kind == 'glass':
        pbr.update(metallicFactor=0.0, roughnessFactor=0.08, baseColorFactor=[r, g, b, 0.22])
        m['alphaMode'] = 'BLEND'
    else:
        pbr.update(metallicFactor=0.0, roughnessFactor=0.55)
    m['pbrMetallicRoughness'] = pbr
    mats.append(m); mat_index[key] = len(mats) - 1
    return mat_index[key]


bin_ = bytearray(); views = []; accs = []; gmeshes = []; nodes = []


def add_view(data, target):
    while len(bin_) % 4:
        bin_.append(0)
    views.append({'buffer': 0, 'byteOffset': len(bin_), 'byteLength': len(data), 'target': target})
    bin_.extend(data)
    return len(views) - 1


node_prims = {}
info = {}
for (node, key), parts in sorted(merged.items(), key=lambda kv: kv[0][0]):
    Vs, Fs, Cs, off = [], [], [], 0
    pal = {}
    for V, F, rgb in parts:
        Vs.append(V); Fs.append(F + off); off += len(V)
        Cs.append(np.full(len(F), pal.setdefault(rgb, len(pal)), np.int64))
    V = np.concatenate(Vs); F = np.concatenate(Fs)
    pV, pN, pF, pC = creased(V, F, CREASE, np.concatenate(Cs))
    vcol = key[1] != 'glass'
    if vcol:
        palarr = np.array(list(pal.keys()), np.float64)
        lin = np.where(palarr <= 0.04045, palarr / 12.92, ((palarr + 0.055) / 1.055) ** 2.4)   # sRGB -> linear
        cols = lin[pC].astype(np.float32)
    pa = add_view(pV.astype('<f4').tobytes(), 34962)
    accs.append({'bufferView': pa, 'componentType': 5126, 'count': len(pV), 'type': 'VEC3', 'min': pV.min(0).tolist(), 'max': pV.max(0).tolist()})
    na = add_view(pN.astype('<f4').tobytes(), 34962)
    accs.append({'bufferView': na, 'componentType': 5126, 'count': len(pN), 'type': 'VEC3'})
    attrs = {'POSITION': len(accs) - 2, 'NORMAL': len(accs) - 1}
    if vcol:
        ca = add_view(cols.astype('<f4').tobytes(), 34962)
        accs.append({'bufferView': ca, 'componentType': 5126, 'count': len(cols), 'type': 'VEC3'})
        attrs['COLOR_0'] = len(accs) - 1
    ia = add_view(pF.astype('<u4').ravel().tobytes(), 34963)
    accs.append({'bufferView': ia, 'componentType': 5125, 'count': pF.size, 'type': 'SCALAR'})
    node_prims.setdefault(node, []).append({'attributes': attrs, 'indices': len(accs) - 1, 'material': material(key)})
    i = info.setdefault(node, {'tris': 0, 'min': [9] * 3, 'max': [-9] * 3, 'materials': 0})
    i['tris'] += len(pF); i['materials'] += 1
    i['min'] = np.minimum(i['min'], pV.min(0)).round(4).tolist(); i['max'] = np.maximum(i['max'], pV.max(0)).round(4).tolist()

systems = {}
for node in node_prims:
    systems.setdefault(system_of(node), []).append(node)
root_children = []
for sysid, ns in sorted(systems.items()):
    kids = []
    for n in sorted(ns):
        gmeshes.append({'name': n, 'primitives': node_prims[n]})
        nodes.append({'name': n, 'mesh': len(gmeshes) - 1})
        kids.append(len(nodes) - 1)
    nodes.append({'name': sysid, 'children': kids})
    root_children.append(len(nodes) - 1)
nodes.append({'name': 'talos', 'children': root_children})

gltf = {'asset': {'version': '2.0', 'generator': 'talos-explained tools/cad/build_hero.py',
                  'extras': {'frame': '+X port, +Y up, +Z bow (Talos.SLDASM assembly frame), metres'}},
        'scene': 0, 'scenes': [{'name': 'Talos', 'nodes': [len(nodes) - 1]}], 'nodes': nodes,
        'meshes': gmeshes, 'materials': mats, 'accessors': accs, 'bufferViews': views,
        'buffers': [{'byteLength': len(bin_)}]}
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * (-len(js) % 4)
while len(bin_) % 4:
    bin_.append(0)
with open(out_glb, 'wb') as fh:
    fh.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)))
    fh.write(struct.pack('<II', len(js), 0x4E4F534A)); fh.write(js)
    fh.write(struct.pack('<II', len(bin_), 0x004E4942)); fh.write(bin_)
for n in info:
    info[n].update(stats.get(n, {}), system=system_of(n))
json.dump({'frame': gltf['asset']['extras']['frame'], 'triangles': sum(i['tris'] for i in info.values()),
           'nodes': info}, open(out_json, 'w'), indent=1)
print(out_glb, os.path.getsize(out_glb) // 1024, 'KB', sum(i['tris'] for i in info.values()), 'tris', len(mats), 'materials')
for n in sorted(info, key=lambda n: -info[n]['tris'])[:25]:
    print(f"  {n:22s} {info[n]['tris']:7d} / raw {info[n]['raw']:8d}  comps {info[n]['components']}")
