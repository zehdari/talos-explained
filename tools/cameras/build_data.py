#!/usr/bin/env python3
"""Data for the cameras chapter (public/data/cameras/*.json), all read from the real repos:
  params.json     the ZED parameter layers zed.launch.py loads, per camera (which file sets each value)
  (the pool frame for the JPEG curve is /tmp/camwork/svo_left_full.png; see README.md)
  fov.json        rectified + raw intrinsics (cv2.stereoRectify on the team's calibration files), camera poses from
                  riptide_descriptions talos.yaml, Talos silhouettes (silhouette.py), prop sizes from Nereus
  bandwidth.json  message sizes: raw encodings, measured JPEG sizes (Nereus frames, a real ffc frame), JPEG size vs quality
  trees.json      which camera each RepairCompMpcTree subtree asks the detector for (SetActiveCamera)
Usage: build_data.py [--trees-only]   (paths below are the standard checkouts)"""
import json, math, os, re, subprocess, glob, io
import numpy as np, yaml, cv2
import xml.etree.ElementTree as ET

HOME = os.path.expanduser('~')
REL = f'{HOME}/osu-uwrt/release'
CORE = f'{REL}/src/riptide_core'
CFG = f'{CORE}/riptide_hardware/cfg'
WRAP = f'{REL}/src/zed-ros2-wrapper'
NEREUS = f'{REL}/nereus'
OUT = os.path.join(os.path.dirname(__file__), '../../public/data/cameras')
os.makedirs(OUT, exist_ok=True)

# ---------- trees: which camera each subtree uses ----------
def build_trees():
    """Every subtree that calls SetActiveCamera, and whether the main tree can reach it through SubTree calls."""
    tree_file = f'{REL}/src/riptide_autonomy/trees/RepairCompMpcTree.xml'
    root = ET.parse(tree_file).getroot()
    trees = {bt.get('ID'): bt for bt in root.findall('BehaviorTree')}
    main = root.get('main_tree_to_execute')
    reach, todo = set(), [main]
    while todo:
        t = todo.pop()
        if t in reach or t not in trees: continue
        reach.add(t)
        todo += [st.get('ID') for st in trees[t].iter('SubTree')]
    out = []
    for tid, bt in trees.items():
        calls = [st.get('is_dfc') for st in bt.iter('SubTree') if st.get('ID') == 'SetActiveCamera']
        if calls:
            out.append({'tree': tid, 'cams': ['dfc' if x == '1' else 'ffc' for x in calls], 'reachable': tid in reach})
    json.dump({'file': 'RepairCompMpcTree.xml', 'main': main, 'trees': out}, open(f'{OUT}/trees.json', 'w'), indent=1)
    print(main, out)

import sys
if '--trees-only' in sys.argv:
    build_trees(); sys.exit()

def flat(d, pre=''):
    o = {}
    for k, v in d.items():
        if isinstance(v, dict): o.update(flat(v, f'{pre}{k}.'))
        else: o[pre + k] = v
    return o

def params_of(text):
    d = yaml.safe_load(text)
    return flat(d['/**']['ros__parameters'])

# ---------- parameter layers (zed.launch.py: [common_stereo.yaml, zedxm.yaml, <cam>_config.yaml]) ----------
wrap_rev = subprocess.check_output(['git', '-C', WRAP, 'rev-parse', '--short', 'HEAD'], text=True).strip()
wrap_date = subprocess.check_output(['git', '-C', WRAP, 'log', '-1', '--format=%cs'], text=True).strip()
common = params_of(subprocess.check_output(['git', '-C', WRAP, 'show', 'HEAD:zed_wrapper/config/common_stereo.yaml'], text=True))
zedxm = params_of(subprocess.check_output(['git', '-C', WRAP, 'show', 'HEAD:zed_wrapper/config/zedxm.yaml'], text=True))
cams = {c: params_of(open(f'{CFG}/{c}_config.yaml').read()) for c in ('ffc', 'dfc')}
KEYS = [
    ('general.camera_model', 'Which ZED model the SDK expects.'),
    ('general.serial_number', 'Picks the physical camera: this is how the node knows which ZED is ffc and which is dfc.'),
    ('general.camera_name', 'Prefix of every TF frame the node names (talos/ffc_left_camera_optical_frame, ...).'),
    ('general.grab_resolution', 'Sensor readout mode. HD1200 is the full 1920 × 1200 sensor.'),
    ('general.grab_frame_rate', 'Frames per second grabbed from the camera.'),
    ('general.pub_resolution', 'NATIVE publishes at the grab resolution; CUSTOM divides it by pub_downscale_factor.'),
    ('general.pub_downscale_factor', 'Only used with pub_resolution CUSTOM.'),
    ('general.pub_frame_rate', 'Publishing rate for images and depth (at most the grab rate).'),
    ('general.self_calib', 'Let the SDK re-tune the stereo calibration at start-up. Off: it assumes air and would undo the underwater calibration.'),
    ('general.optional_opencv_calibration_file', 'The team’s underwater OpenCV calibration, used instead of the factory one.'),
    ('depth.depth_mode', 'Stereo matcher. NEURAL_LIGHT, NEURAL and NEURAL_PLUS are the SDK’s learned matchers, fastest to most accurate.'),
    ('depth.min_depth', 'Closer than this: no depth.'),
    ('depth.max_depth', 'Farther than this: no depth.'),
    ('depth.depth_confidence', 'Drop depth pixels the matcher is unsure of (100 keeps everything).'),
    ('depth.depth_texture_conf', 'Drop depth on textureless areas (100 keeps everything).'),
    ('depth.point_cloud_freq', 'Point cloud rate (only produced while someone subscribes).'),
    ('depth.point_cloud_res', 'Point cloud resolution.'),
    ('pos_tracking.pos_tracking_enabled', 'The SDK’s own visual odometry.'),
    ('pos_tracking.publish_tf', 'Off: the camera must not publish odom → camera TF; Talos’s EKF owns odom.'),
    ('sensors.sensors_image_sync', 'Publish the camera’s IMU in step with the images.'),
    ('video.auto_exposure_gain', 'Automatic exposure and gain.'),
    ('video.auto_whitebalance', 'Automatic white balance.'),
]
layers = [
    {'id': 'common', 'file': 'common_stereo.yaml', 'repo': 'zed-ros2-wrapper', 'url': 'https://github.com/stereolabs/zed-ros2-wrapper/blob/master/zed_wrapper/config/common_stereo.yaml'},
    {'id': 'zedxm', 'file': 'zedxm.yaml', 'repo': 'zed-ros2-wrapper', 'url': 'https://github.com/stereolabs/zed-ros2-wrapper/blob/master/zed_wrapper/config/zedxm.yaml'},
    {'id': 'cam', 'file': '<cam>_config.yaml', 'repo': 'riptide_core', 'url': 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/cfg/'},
]
rows = []
for k, why in KEYS:
    row = {'key': k, 'why': why}
    for c in ('ffc', 'dfc'):
        vals = [common.get(k), zedxm.get(k), cams[c].get(k)]
        win = max([i for i, v in enumerate(vals) if v is not None], default=None)
        v = vals[win] if win is not None else None
        if isinstance(v, str) and v.startswith('/home/ros/'): v = v.split('/')[-1]
        row[c] = {'layers': [None if x is None else (x.split('/')[-1] if isinstance(x, str) and x.startswith('/home/') else x) for x in vals], 'win': win, 'value': v}
    rows.append(row)
json.dump({'wrapper': {'rev': wrap_rev, 'date': wrap_date}, 'layers': layers, 'rows': rows}, open(f'{OUT}/params.json', 'w'), indent=1)

# ---------- intrinsics ----------
def calib(f):
    fs = cv2.FileStorage(f'{CFG}/{f}', cv2.FILE_STORAGE_READ)
    g = lambda k: fs.getNode(k).mat()
    K1, D1, K2, D2, R, T = g('K_LEFT'), g('D_LEFT'), g('K_RIGHT'), g('D_RIGHT'), g('R'), g('T')
    _, _, P1, P2, *_ = cv2.stereoRectify(K1, D1, K2, D2, (1920, 1200), R, T / 1000.0, flags=cv2.CALIB_ZERO_DISPARITY, alpha=0)
    return {'file': f, 'raw': [K1[0, 0], K1[1, 1], K1[0, 2], K1[1, 2]], 'rect': [P1[0, 0], P1[1, 1], P1[0, 2], P1[1, 2]],
            'baseline': -P2[0, 3] / P2[0, 0], 'D': D1.ravel().tolist()}

talos = yaml.safe_load(open(f'{CORE}/riptide_descriptions/config/talos.yaml'))
base = np.array(talos['base_link'])
def rpy(r, p, y):
    cr, sr, cp, sp, cy, sy = math.cos(r), math.sin(r), math.cos(p), math.sin(p), math.cos(y), math.sin(y)
    Rx = np.array([[1, 0, 0], [0, cr, -sr], [0, sr, cr]]); Ry = np.array([[cp, 0, sp], [0, 1, 0], [-sp, 0, cp]]); Rz = np.array([[cy, -sy, 0], [sy, cy, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx
OPT = np.array([[0, 0, 1], [-1, 0, 0], [0, -1, 0]])  # optical (x right, y down, z out) -> ZED camera frame (x out, y left, z up)
cal = {'ffc': calib('tirpak_ffc_charuco_3.yaml'), 'dfc': calib('zedxm_dfc_2026_cal.yaml')}
nereus_robot = yaml.safe_load(open(f'{NEREUS}/content/packs/robots/talos/robot.yaml'))
nereus_k = {s['id']: s['parameters']['intrinsics_left'] for s in nereus_robot['sensors'] if s['type'] == 'stereo_camera'}
cams_out = {}
for c in talos['cameras']:
    p = c['pose']
    Rcam = rpy(*p[3:]) @ OPT
    pos = np.array(p[:3]) - base
    cams_out[c['name']] = {'pose_cad': p, 'pos': np.round(pos, 4).tolist(), 'R': np.round(Rcam, 5).tolist(),
                           'w': 1920, 'h': 1200, **{k: (v if k == 'file' else np.round(v, 6 if k in ('baseline', 'D') else 3).tolist()) for k, v in cal[c['name']].items()},
                           'nereus': nereus_k.get(c['name'])}
sil = json.load(open(os.path.join(os.path.dirname(__file__), 'silhouette.json')))  # written by silhouette.py
for v in sil.values():  # origin -> base_link
    off = base[[0, 2]] if v is sil['side'] else base[[0, 1]]
    v['polys'] = [[[round(x - off[0], 4), round(y - off[1], 4)] for x, y in poly] for poly in v['polys']]
    v['bounds'] = [[round(v['bounds'][i][0] - off[0], 4), round(v['bounds'][i][1] - off[1], 4)] for i in (0, 1)]
gate = yaml.safe_load(open(f'{NEREUS}/content/packs/tasks/robosub_2026/gate.yaml'))
torp = open(f'{NEREUS}/content/packs/tasks/robosub_2026/torpedo.yaml').read()
half = float(re.search(r'half_size_m:\s*([\d.]+)', torp).group(1))
gate_w = 2 * float(re.search(r'abs_y_lt_m:\s*([\d.]+)', open(f'{NEREUS}/content/packs/tasks/robosub_2026/gate.yaml').read()).group(1))
json.dump({'cams': cams_out, 'silhouette': sil, 'props': {'gate_width': gate_w, 'torpedo_board': 2 * half},
           'depth_range': {'ffc': [0.3, 4.0], 'dfc': [0.3, 10.0]}}, open(f'{OUT}/fov.json', 'w'), separators=(',', ':'))
for n, c in cams_out.items():
    f = c['rect'][0]
    print(n, 'rect', c['rect'], 'HFOV %.1f VFOV %.1f' % (2 * math.degrees(math.atan(960 / f)), 2 * math.degrees(math.atan(600 / f))), 'pos', c['pos'],
          'image right ->', np.round(np.array(c['R']) @ [1, 0, 0], 3), 'optical axis ->', np.round(np.array(c['R']) @ [0, 0, 1], 3))

# ---------- bandwidth ----------
def jpeg_sizes(paths):
    return [os.path.getsize(p) for p in paths]
sim = {c: jpeg_sizes(sorted(glob.glob(f'/tmp/perc/frames/f*_{c}.jpg'))) for c in ('ffc', 'dfc')}
real_ffc = os.path.getsize(f'{HOME}/robot/snapshots/ffc_20261020_154052.jpg')
# JPEG size against quality, re-encoding three 1920x1200 frames: a Nereus ffc frame, a real underwater frame, the real bench frame
curve_src = {'nereus': '/tmp/perc/frames/f0005_ffc.jpg', 'pool': '/tmp/camwork/svo_left_full.png', 'bench': f'{HOME}/robot/snapshots/ffc_20261020_154052.jpg'}
curves = {}
for name, p in curve_src.items():
    img = cv2.imread(p)
    curves[name] = [[q, len(cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, q])[1])] for q in range(50, 101, 5)]
W, H = 1920, 1200
json.dump({
    'raw': {'bgra8': W * H * 4, 'depth32': W * H * 4, 'stereo_raw_bgra8': 2 * W * H * 4},
    'jpeg': {'sim_ffc': sim['ffc'], 'sim_dfc': sim['dfc'], 'real_ffc_bench': real_ffc},
    'curves': curves,
    'nereus_cloud': (W // 8) * (H // 8) * 32,
}, open(f'{OUT}/bandwidth.json', 'w'), separators=(',', ':'))
for c in sim: print(c, len(sim[c]), 'median', np.median(sim[c]), 'min', min(sim[c]), 'max', max(sim[c]))
print('real ffc', real_ffc); print(curves)

build_trees()
