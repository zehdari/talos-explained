#!/usr/bin/env python3
"""Cut the torpedo task of mission11 from the Nereus viewer screen recording, and write the running node per moment.

    python3 tools/bt-nodes/clip.py RECORDING.mp4 [--start 144.5 --end 167.5 --speed 2 --offset 0.35]

RECORDING is the viewer recording of mission11 (/tmp/perc/mission11.mp4 on Cam-PC when this was made; the perception
part's 8x video video/mission_8x.mp4 is cut from the same file). Times are seconds of the tree stack
(mission11_tree.json.gz). --offset is recording time minus tree-stack time, found by matching frames of mission_8x.mp4
(its chapter times give wall times) against the recording: 0.35 s.
The video is the 3D view cropped to Talos and the torpedo board, with the forward camera's image inset top left (clear of the
browser's video controls),
so it stays readable on a phone. The running node is not burned in: the page draws it under the video from
public/data/bt-nodes/torpedo_labels.json (video seconds), the deepest running custom node that is not a decorator
and the nearest enclosing node with a written name. A stretch with no such node keeps the last label.
Writes public/video/bt-nodes/torpedo_2x.mp4 and .jpg, and the labels.
"""
import argparse, gzip, json, os, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.dirname(os.path.dirname(HERE))
ap = argparse.ArgumentParser()
ap.add_argument('rec')
ap.add_argument('--start', type=float, default=144.5)
ap.add_argument('--end', type=float, default=167.5)
ap.add_argument('--speed', type=float, default=2)
ap.add_argument('--offset', type=float, default=0.35)
ap.add_argument('--min', type=float, default=0.6, help='shortest state worth a label (s)')
a = ap.parse_args()

stack = json.load(gzip.open(os.path.join(HERE, 'mission11_tree.json.gz'), 'rt'))['tree']
cat = json.load(open(os.path.join(SITE, 'public/data/bt-nodes/catalogue.json')))
CUSTOM = {n['id'] for n in cat['nodes']}
GENERIC = {'Sequence', 'Fallback', 'ForceSuccess', 'ForceFailure', 'RetryUntilSuccessful', 'REMOVE ME', 'IfThenElse'}
# the stack holds instance names: map each back to its node type from the tree file
import xml.etree.ElementTree as ET
TYPE = {}
for e in ET.parse(os.path.expanduser('~/osu-uwrt/release/src/riptide_autonomy/trees/RepairCompMpcTree.xml')).iter():
    t = e.get('ID') if e.tag in ('Action', 'Condition', 'Decorator') else e.tag
    TYPE.setdefault(e.get('name') or t, t)
DECOR = {n['id'] for n in cat['nodes'] if n['base'] == 'decorator'}


def short(name):
    name = name.split(':')[0] if len(name) > 44 else name
    return name.split(' (')[0]


segs = []
last = None
for i, (t, st) in enumerate(stack):
    t1 = stack[i + 1][0] if i + 1 < len(stack) else t
    if t1 <= a.start or t >= a.end:
        continue
    k = next((k for k in range(len(st) - 1, -1, -1) if TYPE.get(st[k], st[k]) in CUSTOM - DECOR), None)
    if k is None and last:  # only built-in nodes running: keep the last custom node's label
        lab = last
    else:
        ty = TYPE.get(st[k], st[k]) if k is not None else (TYPE.get(st[-1], st[-1]) if st else '')
        named = next((x for x in reversed(st[:(k if k is not None else len(st) - 1) + 1]) if ' ' in x and x not in GENERIC), '')
        lab = [ty, short(named)]
    last = lab
    t0c, t1c = max(t, a.start), min(t1, a.end)
    if segs and segs[-1][2] == lab:
        segs[-1][1] = t1c
    else:
        segs.append([t0c, t1c, lab])
# fold states shorter than --min into their neighbour, so the strip doesn't flicker
out_segs = []
for s0, s1, lab in segs:
    if out_segs and (s1 - s0 < a.min or out_segs[-1][2] == lab):
        out_segs[-1][1] = s1
    else:
        out_segs.append([s0, s1, lab])
for s in out_segs:
    print(f'{s[0]:7.2f} {s[1] - s[0]:5.2f}  {s[2]}')

vt = lambda t: (t - a.start) / a.speed
labels = [{'t0': round(vt(s0), 2), 't1': round(vt(s1), 2), 'node': lab[0], 'step': lab[1]} for s0, s1, lab in out_segs]
os.makedirs(os.path.join(SITE, 'public/data/bt-nodes'), exist_ok=True)
json.dump({'speed': a.speed, 'labels': labels}, open(os.path.join(SITE, 'public/data/bt-nodes/torpedo_labels.json'), 'w'), separators=(',', ':'))
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
# 3D view: 600x400 round Talos (the viewer follows it, so it stays put) -> 720x480; the forward camera card's image
# (383x239 at 481,835) inset top left at 216 px wide, clear of the browser's controls bar
vf = (f"[0:v]trim=start={a.start + a.offset:.2f}:duration={a.end - a.start:.2f},setpts=(PTS-STARTPTS)/{a.speed},fps=30,split[a][b];"
      f"[a]crop=600:400:860:200,scale=720:480,setsar=1[main];"
      f"[b]crop=383:239:481:835,scale=216:-2,pad=iw+4:ih+4:2:2:color=0x0f2633[cam];"
      f"[main][cam]overlay=12:12,"
      f"drawtext=fontfile={font}:text='×{a.speed:g}':x=w-tw-14:y=14:fontsize=28:fontcolor=white:box=1:boxcolor=0x0f2633dd:boxborderw=8[v]")
out = os.path.join(SITE, 'public/video/bt-nodes/torpedo_2x.mp4')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', a.rec, '-filter_complex', vf, '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '24', '-preset', 'slow',
                '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', out], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{vt(151.0):.2f}', '-i', out, '-frames:v', '1', '-q:v', '4', out.replace('.mp4', '.jpg')], check=True)
print(out, os.path.getsize(out) // 1024, 'KB')
