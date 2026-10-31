"""Read tess.bin written by tess.cs: yields (name, xf[12], [(colour_index, tris float32 (n,3,3) part space m)])."""
import struct
import numpy as np


def read(path):
    with open(path, 'rb') as f:
        data = f.read()
    o = 0
    while o < len(data):
        n, = struct.unpack_from('<i', data, o); o += 4
        name = data[o:o + n].decode('utf8'); o += n
        xf = struct.unpack_from('<12d', data, o); o += 96
        nf, = struct.unpack_from('<i', data, o); o += 4
        faces = []
        for _ in range(nf):
            ci, nfl = struct.unpack_from('<ii', data, o); o += 8
            t = np.frombuffer(data, '<f4', nfl, o).reshape(-1, 3, 3); o += 4 * nfl
            faces.append((ci, t))
        yield name, xf, faces


def to_asm(t, xf):
    """part-space points (...,3) -> assembly frame (SolidWorks MathTransform: p' = p @ R + T)."""
    R = np.array(xf[:9]).reshape(3, 3); T = np.array(xf[9:12])
    return t @ R + T
