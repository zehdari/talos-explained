#!/usr/bin/env python3
"""Re-export the task cards' camera shots (public/img/robosub/cam_*.webp) at a sharper size.

    python3 tools/robosub/cam_frames.py FRAMES_DIR

FRAMES_DIR is the annotated YOLO frame dump (/tmp/perc/cam_m11.mp4.frames) that tools/perception/event_cards.py used
for the m11_* event cards (tools/nereus/annot_video.py leaves NNNNNN.jpg + list.txt next to its mp4, and the video's
t0 in <mp4>.t0). The frame for each card is picked exactly as event_cards.py does (the frame on screen 0.3 s after
the event), but kept at 1120 px wide instead of 480.
"""
import bisect, json, sys
from pathlib import Path
import cv2

ROOT = Path(__file__).resolve().parents[2]
fdir = Path(sys.argv[1])
t0f = Path(str(fdir).removesuffix('.frames') + '.t0')
t0 = float(t0f.read_text()) if t0f.exists() else 0.028
files, durs = [], []
for line in open(fdir / 'list.txt'):
    if line.startswith('file'): files.append(line.split("'")[1])
    elif line.startswith('duration'): durs.append(float(line.split()[1]))
times = [t0]
for x in durs[:-1]: times.append(times[-1] + x)

cards = {c[1]: c[0] for c in json.load(open(ROOT / 'public/data/mission_hero_exact.json'))['cards']}
OUT = ROOT / 'public/img/robosub'
for card, name in [('m11_000.webp', 'cam_slalom'), ('m11_003.webp', 'cam_torpedo'), ('m11_005.webp', 'cam_table'), ('m11_016.webp', 'cam_bins')]:
    i = max(0, bisect.bisect_right(times, cards[card] + 0.3) - 1)
    img = cv2.imread(files[i])
    # sanity check against the existing 480 px card
    ref = cv2.imread(str(ROOT / 'public/img/events' / card))
    small = cv2.resize(img, (ref.shape[1], ref.shape[0]), interpolation=cv2.INTER_AREA)
    err = float(((small.astype(float) - ref.astype(float)) ** 2).mean() ** 0.5)
    img = cv2.resize(img, (1120, round(img.shape[0] * 1120 / img.shape[1])), interpolation=cv2.INTER_AREA)
    cv2.imwrite(str(OUT / f'{name}.webp'), img, [cv2.IMWRITE_WEBP_QUALITY, 80])
    print(name, files[i].rsplit('/', 1)[-1], f'rms vs card {err:.1f}', (OUT / f'{name}.webp').stat().st_size // 1024, 'KB')
