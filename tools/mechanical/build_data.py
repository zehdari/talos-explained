#!/usr/bin/env python3
"""Build public/data/mechanical/mechanical.json for the "Hull, frame and layout" chapter.

Reads the vehicle config (riptide_descriptions talos.yaml), the MPC's model of the real Talos
(riptide_mpc config/models/talos.yaml), the CAD data made by tools/cad (public/data/cad/*.json)
and the CAD pictures (to calibrate the front and side views for the overlays).

Run from the repo root:  python3 tools/mechanical/build_data.py
"""
import json, math, os
import numpy as np
import yaml
from PIL import Image

HOME = os.path.expanduser('~')
CORE = f'{HOME}/osu-uwrt/release/src/riptide_core'
CTRL = f'{HOME}/osu-uwrt/release/src/riptide_control'
VEH = f'{CORE}/riptide_descriptions/config/talos.yaml'
MPC = f'{CTRL}/riptide_mpc/config/models/talos.yaml'
OUT = 'public/data/mechanical/mechanical.json'
G = 9.80665  # riptide_mpc fossen_model.cpp kGravity

veh = yaml.safe_load(open(VEH))
mpc = yaml.safe_load(open(MPC))
asm = json.load(open('public/data/cad/assembly.json'))
glb = json.load(open('public/data/cad/glb.json'))

# talos.yaml positions are in its `origin` frame (robot axes: x fore, y port, z up). The CAD frame is
# X port, Y up, Z bow. Inferred in docs/media/cad.md: yaml = CAD (in robot axes) + OFF.
OFF = np.array([-0.14, 0.035, 0.0])
def yaml_to_cad(p):
    r = np.array(p[:3], float) - OFF          # robot axes, CAD origin
    return [round(float(r[1]), 4), round(float(r[2]), 4), round(float(r[0]), 4)]

def rpy_matrix(r, p, y):
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    Ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]])
    Rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]])
    return Rz @ Ry @ Rx

# ---------- body and statics (the MPC flies its own model file's body) ----------
mass = float(mpc['mass'])
com = np.array(mpc['com'], float)
vol = float(mpc['displaced_volume'])
rho = float(mpc['water_density'])
cob_rel = np.array(mpc['cob_relative'], float)
B = rho * G * vol
W = mass * G
body = {
    'dry_kg': veh['mass'], 'wet_kg': 34.084, 'cad_kg_yaml': 34.708,
    'model_mass_kg': mass, 'model_com_yaml': com.tolist(), 'displaced_volume_m3': vol,
    'water_density': rho, 'g': G, 'cob_rel': cob_rel.tolist(),
    'buoyancy_radii': mpc['buoyancy_radii'],
    'buoyancy_N': round(B, 3), 'weight_N': round(W, 3), 'net_buoyancy_N': round(B - W, 3),
    'inertia_diag': veh['inertia'],
    'hull_volume_yaml': veh['hull_volume'],
}

# ---------- frames, in CAD metres ----------
frames = {
    'cad_origin': [0.0, 0.0, 0.0],
    'origin': yaml_to_cad([0, 0, 0]),
    'base_link': yaml_to_cad(veh['base_link']),
    'com': yaml_to_cad(com),
    'cob': yaml_to_cad(com + cob_rel),
}

# ---------- thrusters ----------
cad_thr = asm['thrusters']
def cad_match(name):
    lat = 1 if name[2] == 'P' else -1        # port = CAD +X
    up = 1 if name[1] == 'U' else -1
    outer = name[0] == 'V'
    for t in cad_thr:
        x, y, _ = t['origin_cad_mm']
        if np.sign(x) == lat and np.sign(y) == up and (t['position'].startswith('outer') == outer):
            return t
    raise SystemExit(f'no CAD thruster for {name}')
node_by_part = {}
for n in glb['nodes']:
    if n['group'] == 'thrusters':
        node_by_part[n['node']] = n
thr = []
for i, t in enumerate(veh['thrusters']):
    p = t['pose']
    d = rpy_matrix(p[3], p[4], p[5]) @ np.array([1.0, 0, 0])
    c = cad_match(t['name'])
    part_leaf = c['part'].split('/')[-1]
    node = next(k for k in node_by_part if k == 'thruster ' + part_leaf)
    thr.append({'index': i, 'name': t['name'], 'type': t['type'], 'pose': p,
                'dir': [round(float(v), 4) for v in d], 'pos_cad': yaml_to_cad(p),
                'cad_part': c['part'], 'cad_origin_mm': c['origin_cad_mm'], 'glb_node': node})

# Thruster matrix about the COM and minimum-norm thrust for each unit motion (like control/thrusters.html).
T = np.zeros((6, len(thr)))
for j, t in enumerate(thr):
    r = np.array(t['pose'][:3]) - com
    d = np.array(t['dir'])
    T[:3, j] = d
    T[3:, j] = np.cross(r, d)
P = np.linalg.pinv(T)
motions = {}
for k, name in enumerate(['surge', 'sway', 'heave', 'roll', 'pitch', 'yaw']):
    e = np.zeros(6); e[k] = 1
    f = P @ e
    motions[name] = [round(float(v / np.abs(f).max()), 4) for v in f]

# ---------- sensors and payloads from talos.yaml ----------
pts = {}
for k in ['dvl', 'depth', 'imu', 'poker', 'torpedoes', 'droppers', 'claw', 'magnet']:
    pts[k] = {'pose': veh[k]['pose'], 'cad': yaml_to_cad(veh[k]['pose'])}
for c in veh['cameras']:
    pts[c['name']] = {'pose': c['pose'], 'cad': yaml_to_cad(c['pose'])}
for side in ['port', 'starboard']:
    pts['hydrophone_' + side] = {'pose': veh['acoustics'][side]['pose'], 'cad': yaml_to_cad(veh['acoustics'][side]['pose'])}

# ---------- groups (3D model nodes) with CAD masses ----------
sub = {s['id']: s for s in asm['subsystems']}
groups = [{'node': n['node'], 'group': n['group'], 'label': n['label'], 'colour': n['colour'],
           'min': n['bbox_m']['min'], 'max': n['bbox_m']['max'], 'size': n['bbox_m']['size']} for n in glb['nodes']]
mn = np.min([g['min'] for g in groups], axis=0); mx = np.max([g['max'] for g in groups], axis=0)
no_claw = [g for g in groups if g['node'] not in ('claw', 'magnet_poker')]
mn2 = np.min([g['min'] for g in no_claw], axis=0); mx2 = np.max([g['max'] for g in no_claw], axis=0)
dims = {
    'all_mm': [round(float(v) * 1000) for v in (mx - mn)],
    'no_claw_mm': [round(float(v) * 1000) for v in (mx2 - mn2)],
    'frame_mm': [round(v * 1000) for v in next(g['size'] for g in groups if g['node'] == 'frame')],
    'hull_mm': [round(v * 1000) for v in next(g['size'] for g in groups if g['node'] == 'hull')],
    'extent_min': [round(float(v), 4) for v in mn], 'extent_max': [round(float(v), 4) for v in mx],
}
masses = [{'id': s['id'], 'label': s['label'], 'kg': s['mass_kg']} for s in asm['subsystems']]
materials = [{'name': k, 'kg': v} for k, v in asm['mass_by_material_kg'].items() if v > 0]

# ---------- picture calibration: content box in pixels <-> model extents ----------
def content_box(name):
    im = np.asarray(Image.open(f'public/media/cad/{name}.webp').convert('L'))
    ys, xs = np.where(im < 245)
    return {'w': im.shape[1], 'h': im.shape[0], 'x0': int(xs.min()), 'x1': int(xs.max()), 'y0': int(ys.min()), 'y1': int(ys.max())}
images = {}
# front: image right = CAD +X (port), up = +Y.  side-port: image right = CAD -Z (stern), up = +Y.
images['talos-front'] = {**content_box('talos-front'), 'u': [float(mn[0]), float(mx[0])], 'v': [float(mn[1]), float(mx[1])], 'axes': 'u=+X, v=+Y'}
images['talos-side-port'] = {**content_box('talos-side-port'), 'u': [float(-mx[2]), float(-mn[2])], 'v': [float(mn[1]), float(mx[1])], 'axes': 'u=-Z, v=+Y'}

out = {
    'source': {'vehicle_yaml': 'riptide_core@followpath-speed riptide_descriptions/config/talos.yaml',
               'mpc_model': 'riptide_control@mpc riptide_mpc/config/models/talos.yaml',
               'cad': 'Talos 7-11-26 (public/data/cad)', 'yaml_minus_cad_robot_m': OFF.tolist()},
    'body': body, 'frames': frames, 'thrusters': thr, 'motions': motions,
    'pinv': [[round(float(v), 5) for v in row] for row in P], 'points': pts,
    'groups': groups, 'dims': dims, 'cad_mass': {'total_kg': asm['total']['mass_kg'], 'com_cad_mm': asm['total']['com_cad_mm'], 'subsystems': masses},
    'materials': materials, 'images': images,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(out, open(OUT, 'w'), indent=1)
print('wrote', OUT)
print('net buoyancy N', body['net_buoyancy_N'], 'B', body['buoyancy_N'], 'W', body['weight_N'])
print('frames', frames)
print('dims', dims)
for t in thr: print(t['name'], t['dir'], t['pos_cad'], t['cad_origin_mm'], t['glb_node'])
for k, v in motions.items(): print(k, v)
