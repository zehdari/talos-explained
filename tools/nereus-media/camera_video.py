#!/usr/bin/env python3
"""Compose the simulator camera video from the tree-run bag: the detector's annotated YOLO stream (large) beside
the raw forward (ffc) and down (dfc) camera images, on the sim clock, sped up, with the current tree step.
    python3 camera_video.py BAG TREE_LOG.jsonl OUT.mp4 [--speed 8] [--t0 SIM] [--t1 SIM]"""
import argparse, json, os, subprocess, tempfile, cv2, numpy as np, rosbag2_py
from rclpy.serialization import deserialize_message
from rosidl_runtime_py.utilities import get_message
ap = argparse.ArgumentParser(); ap.add_argument('bag'); ap.add_argument('log'); ap.add_argument('out')
ap.add_argument('--speed', type=float, default=8); ap.add_argument('--fps', type=int, default=15)
ap.add_argument('--chapters', help='JSON [[sim_time, label], ...] to show instead of the raw stack'); ap.add_argument('--t0', type=float); ap.add_argument('--t1', type=float); a = ap.parse_args()
TOP = {'/talos/yolo_orientation/annotated/compressed': 'yolo', '/talos/ffc/zed_node/rgb/image_rect_color/compressed': 'ffc',
       '/talos/dfc/zed_node/rgb/image_rect_color/compressed': 'dfc'}
tmp = tempfile.mkdtemp(prefix='camvid_', dir='/tmp/nmedia')
r = rosbag2_py.SequentialReader()
r.open(rosbag2_py.StorageOptions(uri=a.bag, storage_id=''), rosbag2_py.ConverterOptions('cdr', 'cdr'))
r.set_filter(rosbag2_py.StorageFilter(topics=list(TOP)))
T = get_message('sensor_msgs/msg/CompressedImage'); idx = {k: [] for k in TOP.values()}; pairs = []
while r.has_next():
    topic, data, bt = r.read_next(); m = deserialize_message(data, T); k = TOP[topic]
    st = m.header.stamp.sec + m.header.stamp.nanosec * 1e-9
    if k == 'ffc': pairs.append((bt * 1e-9, st))
    if st == 0: st = -bt * 1e-9  # the annotated stream is unstamped: place it by receipt time below
    fn = f'{tmp}/{k}_{len(idx[k]):06d}.jpg'; open(fn, 'wb').write(bytes(m.data)); idx[k].append((st, fn, m.header.frame_id))
pb = np.array([p[0] for p in pairs]); ps = np.array([p[1] for p in pairs])
for k in idx:  # receipt (wall) time -> sim stamp, from the ffc images' receipt vs header stamps
    idx[k] = [(float(np.interp(-s0, pb, ps)) - 0.05 if s0 < 0 else s0, fn, fid) for s0, fn, fid in idx[k]]
    idx[k].sort()
# tree steps from the logger (sim time), shown as the label
steps = []
for line in open(a.log):
    e = json.loads(line)
    if e['kind'] == 'stack' and e['data']:
        s = e['data']; label = next((x for x in reversed(s) if x[:1].isupper() and len(x) > 3), s[-1])
        steps.append((e['sim'], ' > '.join(s[3:6]) if len(s) > 3 else s[-1]))
if a.chapters: steps = [tuple(c) for c in json.load(open(a.chapters))]
t0 = a.t0 or idx['yolo'][0][0]; t1 = a.t1 or idx['yolo'][-1][0]
W, H = 1280, 600; BIG = (960, 600); SM = (320, 200)
font = cv2.FONT_HERSHEY_SIMPLEX
def latest(k, t):
    lst = idx[k]; lo, hi = 0, len(lst)
    while lo < hi:
        mid = (lo + hi) // 2
        if lst[mid][0] <= t: lo = mid + 1
        else: hi = mid
    return lst[lo - 1] if lo else None
cache = {}
def img(rec, size):
    if rec is None: return np.full((size[1], size[0], 3), 40, np.uint8)
    key = (rec[1], size)
    if key not in cache:
        cache.clear(); im = cv2.imread(rec[1]); cache[key] = cv2.resize(im, size, interpolation=cv2.INTER_AREA)
    return cache[key]
proc = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-s', f'{W}x{H}', '-r', str(a.fps), '-i', '-',
                         '-c:v', 'libx264', '-crf', '27', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-g', str(2 * a.fps), '-movflags', '+faststart', a.out], stdin=subprocess.PIPE)
n = int((t1 - t0) / a.speed * a.fps)
imgs = {}
for i in range(n):
    t = t0 + i * a.speed / a.fps
    f = np.full((H, W, 3), 245, np.uint8)
    y = latest('yolo', t); f[:, :960] = img(y, BIG) if y else 40
    for j, k in enumerate(('ffc', 'dfc')):
        rec = latest(k, t); f[j * 200:(j + 1) * 200, 960:] = cv2.resize(cv2.imread(rec[1]), SM) if rec and (i % 2 == 0 or k not in imgs) else imgs.get(k, np.full((200, 320, 3), 40, np.uint8))
        imgs[k] = f[j * 200:(j + 1) * 200, 960:].copy()
        cv2.rectangle(f, (960, j * 200), (1279, j * 200 + 22), (38, 26, 15), -1)
        cv2.putText(f, {'ffc': 'Forward camera (ffc)', 'dfc': 'Down camera (dfc)'}[k], (966, j * 200 + 16), font, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    cam = 'dfc' if y and 'dfc' in y[2] else ('ffc' if y and 'ffc' in y[2] else 'active camera')
    cv2.rectangle(f, (0, 0), (420, 26), (38, 26, 15), -1)
    cv2.putText(f, f'YOLO detector output ({cam})', (8, 18), font, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    st = [s for s in steps if s[0] <= t]; lab = st[-1][1] if st else ''
    cv2.putText(f, 'Task', (968, 430), font, 0.45, (90, 90, 90), 1, cv2.LINE_AA)
    words, line, yy = lab.split(' '), '', 455
    for w in words:
        if cv2.getTextSize(line + ' ' + w, font, 0.5, 1)[0][0] > 300: cv2.putText(f, line, (968, yy), font, 0.5, (20, 20, 20), 1, cv2.LINE_AA); yy += 22; line = w
        else: line = (line + ' ' + w).strip()
    cv2.putText(f, line, (968, yy), font, 0.5, (20, 20, 20), 1, cv2.LINE_AA)
    el = t - t0
    cv2.putText(f, f'sim {int(el // 60)}:{int(el % 60):02d}   x{a.speed:g}', (968, 585), font, 0.55, (20, 20, 20), 1, cv2.LINE_AA)
    proc.stdin.write(f.tobytes())
proc.stdin.close(); proc.wait()
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', str(min(20, n / a.fps / 2)), '-i', a.out, '-frames:v', '1', '-q:v', '4', a.out.replace('.mp4', '.jpg')], check=True)
print('frames', {k: len(v) for k, v in idx.items()}, 'video s', round(n / a.fps, 1), 'tmp', tmp)
