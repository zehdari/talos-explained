#!/usr/bin/env python3
"""Cut the torpedo task of mission11 from the Nereus viewer screen recording, with the running node burned in.

    python3 tools/bt-nodes/clip.py RECORDING.mp4 [--start 144.5 --end 167.5 --speed 2 --offset 0.35]

RECORDING is the viewer recording of mission11 (/tmp/perc/mission11.mp4 on Cam-PC when this was made; the perception
part's 8x video video/mission_8x.mp4 is cut from the same file). Times are seconds of the tree stack
(mission11_tree.json.gz). --offset is recording time minus tree-stack time, found by matching frames of mission_8x.mp4
(its chapter times give wall times) against the recording: 0.35 s.
The label is the deepest running node: its type, and the nearest enclosing node with a written name.
Writes public/video/bt-nodes/torpedo_2x.mp4 and .jpg.
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


def label(st):
    # the deepest custom node that is not a decorator (a decorator on top only waits on its child)
    k = next((k for k in range(len(st) - 1, -1, -1) if TYPE.get(st[k], st[k]) in CUSTOM - DECOR), len(st) - 1)
    ty = TYPE.get(st[k], st[k])
    named = next((x for x in reversed(st[:k + 1]) if ' ' in x and x not in GENERIC), '')
    return f'{ty}  ·  {short(named)}' if named else ty


segs = []
for i, (t, st) in enumerate(stack):
    t1 = stack[i + 1][0] if i + 1 < len(stack) else t
    if t1 <= a.start or t >= a.end or t1 - t < a.min:
        continue
    segs.append((max(t, a.start), min(t1, a.end), label(st)))
for s in segs:
    print(f'{s[0]:7.2f} {s[1] - s[0]:5.2f}  {s[2]}')

vt = lambda t: (t - a.start) / a.speed
font = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
esc = lambda s: s.replace('\\', '\\\\').replace("'", "’").replace(':', '\\:').replace(',', '\\,').replace('%', '\\%')
draws = [f"drawtext=fontfile={font}:text='{esc(l)}':x=24:y=24:fontsize=30:fontcolor=white:box=1:boxcolor=0x0f2633dd:boxborderw=12"
         f":enable='between(t,{vt(t0):.2f},{vt(t1):.2f})'" for t0, t1, l in segs]
draws.append(f"drawtext=fontfile={font}:text='×{a.speed:g}':x=w-tw-24:y=24:fontsize=26:fontcolor=white:box=1:boxcolor=0x0f2633dd:boxborderw=10")
# the 3D view, both cameras and the course map; the side panels are left out
vf = (f"trim=start={a.start + a.offset:.2f}:duration={a.end - a.start:.2f},setpts=(PTS-STARTPTS)/{a.speed},fps=30,"
      f"crop=1494:976:426:104,scale=1280:-2,setsar=1," + ','.join(draws))
out = os.path.join(SITE, 'public/video/bt-nodes/torpedo_2x.mp4')
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', a.rec, '-vf', vf, '-an', '-c:v', 'libx264', '-crf', '27', '-preset', 'slow',
                '-pix_fmt', 'yuv420p', '-g', '30', '-movflags', '+faststart', out], check=True)
subprocess.run(['ffmpeg', '-y', '-v', 'error', '-ss', f'{vt(151.0):.2f}', '-i', out, '-frames:v', '1', '-q:v', '4', out.replace('.mp4', '.jpg')], check=True)
print(out, os.path.getsize(out) // 1024, 'KB')
