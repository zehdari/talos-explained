"""Read the tessellated display mesh stored inside a SolidWorks 2015+ .SLDPRT (Contents/DisplayLists),
without SolidWorks. Adapted from ~/hullplanner/tools/import_sw.py (same author, same format notes)."""
import re, struct, zlib
import numpy as np

MARK = b'\x14\x00\x06\x00\x08\x00'


def sections(data):
    pos = [m.start() for m in re.finditer(re.escape(MARK), data)]
    for i, p in enumerate(pos):
        f = struct.unpack_from('<IIIII', data, p + 6)
        nlen = f[4]
        if nlen > 300:
            continue
        name = bytes(((x << 4) & 0xF0) | (x >> 4) for x in data[p + 26:p + 26 + nlen]).decode('latin1')
        start = p + 26 + nlen
        end = pos[i + 1] if i + 1 < len(pos) else len(data)
        try:
            yield name, zlib.decompressobj(-15).decompress(data[start:end])
        except zlib.error:
            pass


def typed_arrays(d):
    out = []
    for m in re.finditer(b'\x02\x00\x00\x00', d):
        o = m.start()
        if o < 8 or o + 8 > len(d):
            continue
        es, ty = struct.unpack_from('<II', d, o - 8)
        if (es, ty) not in ((12, 100), (4, 8)):
            continue
        n = struct.unpack_from('<I', d, o + 4)[0]
        if n and o + 8 + es * n <= len(d):
            out.append((es, n, o + 8))
    return out


def faces(d):
    arrs = typed_arrays(d)
    for (e0, n0, s0), (e1, n1, s1), (e2, n2, s2) in zip(arrs, arrs[1:], arrs[2:]):
        if (e0, e1, e2) != (4, 12, 12) or n1 != n2 or s1 != s0 + 4 * n0 + 16 or s2 != s1 + 12 * n1 + 16:
            continue
        lens = np.frombuffer(d, '<i4', n0, s0)
        if lens.min() < 3 or lens.sum() != n1:
            continue
        P = np.frombuffer(d, '<f4', 3 * n1, s1).reshape(-1, 3).astype(float)
        N = np.frombuffer(d, '<f4', 3 * n1, s2).reshape(-1, 3).astype(float)
        if not np.all(np.isfinite(P)) or not np.allclose(np.linalg.norm(N, axis=1), 1, atol=1e-2):
            continue
        tris, base = [], 0
        for L in lens:
            k = np.arange(L - 2)
            t = np.stack([base + k, base + k + 1, base + k + 2], 1)
            odd = k % 2 == 1
            t[odd] = t[odd][:, [1, 0, 2]]
            tris.append(t)
            base += L
        yield P, N, np.vstack(tris).astype(np.int64)


def part_mesh(path):
    """(P mm, N, T) of the part's largest display list, or None."""
    best = None
    for name, d in sections(open(path, 'rb').read()):
        if name != 'Contents/DisplayLists' or len(d) < 64:
            continue
        fs = list(faces(d))
        if fs and (best is None or sum(len(f[0]) for f in fs) > sum(len(f[0]) for f in best)):
            best = fs
    if not best:
        return None
    P, N, T, off = [], [], [], 0
    for p, n, t in best:
        g = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
        flip = np.einsum('ij,ij->i', g, n[t].sum(1)) < 0
        t[flip] = t[flip][:, [0, 2, 1]]
        P.append(p); N.append(n); T.append(t + off); off += len(p)
    return np.vstack(P) * 1000, np.vstack(N), np.vstack(T)
