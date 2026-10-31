#!/usr/bin/env bash
# robosub.html's run video: public/video/mission_8x.mp4 (the whole Nereus viewer window, 1280x720) cropped to the
# middle of the 3D pool view, where the follow camera keeps Talos, with the task name burned in at the top left.
#   public/img/robosub/run_8x.mp4 (+ run_8x.jpg poster)
# Chapters come from public/data/mission_video.json (video seconds); "Table" is shown as "Octagon" as on the page.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
V=$ROOT/public/video/mission_8x.mp4
OUT=$ROOT/public/img/robosub
FONT=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf

# drawtext filters, one per chapter, from the JSON
DT=$(python3 - "$ROOT/public/data/mission_video.json" "$FONT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); font = sys.argv[2]
ch = [[0.0, 'Start']] + [[t, {'Table': 'Octagon'}.get(n, n)] for t, n in d['chapters']]
end = 9999
out = []
for i, (t, n) in enumerate(ch):
    b = ch[i + 1][0] if i + 1 < len(ch) else end
    out.append(f"drawtext=fontfile={font}:text='{n}':x=18:y=16:fontsize=34:fontcolor=0xf3f7f7:box=1:boxcolor=0x0f2633@0.82:boxborderw=10:enable='between(t,{t},{b})'")
out.append(f"drawtext=fontfile={font}:text='8x speed':x=w-tw-18:y=16:fontsize=24:fontcolor=0xf3f7f7:box=1:boxcolor=0x0f2633@0.82:boxborderw=8")
print(','.join(out))
PY
)
# 3D view spans x 283..1280, y 70..503 of the frame; Talos sits near x 780. Keep a 16:9 window round it.
CROP="crop=768:432:396:70"
ffmpeg -v error -y -i "$V" -vf "$CROP,$DT" -an -c:v libx264 -preset slow -crf 25 -pix_fmt yuv420p -movflags +faststart "$OUT/run_8x.mp4"
ffmpeg -v error -y -ss 2.6 -i "$OUT/run_8x.mp4" -frames:v 1 -q:v 4 "$OUT/run_8x.jpg"
ls -la "$OUT"/run_8x.*
