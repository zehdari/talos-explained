#!/usr/bin/env python3
"""Native-resolution crops of the Nereus viewer for pool-test.html's "operator's screen" figure.

    python3 tools/pool-test/viewer_crops.py

Sources (all in this repo):
  public/img/pool-test/viewer-robot.webp      robot.launch.py pool:=rpac on a pool bag (viewer_shot.sh)
  public/media/nereus/viewer-startup-killed.webp   the viewer as it opens (sim): green Enable, Robot: killed
  public/media/nereus/panel-mapping.webp, panel-bagging.webp   panel crops at 1:1
Every crop is kept at 1:1 so the UI text stays at the viewer's own size (12-13 px).
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
IMG = ROOT / "public/img/pool-test"
MED = ROOT / "public/media/nereus"


def stack(parts, bg, gap=10, pad=8):
    w = max(p.width for p in parts) + 2 * pad
    h = sum(p.height for p in parts) + gap * (len(parts) - 1) + 2 * pad
    out = Image.new("RGB", (w, h), bg)
    y = pad
    for p in parts:
        out.paste(p, (pad, y))
        y += p.height + gap
    return out


def hcat(a, b):
    out = Image.new("RGB", (a.width + b.width, max(a.height, b.height)))
    out.paste(a, (0, 0))
    out.paste(b, (a.width, 0))
    return out


def main():
    R = Image.open(IMG / "viewer-robot.webp").convert("RGB")
    S = Image.open(MED / "viewer-startup-killed.webp").convert("RGB")
    bg = R.getpixel((600, 60))
    M = Image.open(MED / "panel-mapping.webp").convert("RGB")
    Bg = Image.open(MED / "panel-bagging.webp").convert("RGB")
    pbg = M.getpixel((200, 330))
    crops = {
        # Enable/KILL and the robot state: as it opens (sim shot), then after Enable (robot shot)
        "kill": stack([S.crop((182, 42, 420, 82)), R.crop((182, 42, 420, 82))], bg=bg),
        # health chips, in two rows
        "chips": stack([R.crop((866, 48, 1082, 76)), R.crop((1086, 48, 1234, 76))], bg=bg),
        # search box (the empty middle cut out) and Edit map
        "search": stack([hcat(R.crop((528, 4, 700, 32)), R.crop((892, 4, 952, 32))), R.crop((1242, 45, 1318, 79))], bg=bg),
        "motion": R.crop((6, 118, 390, 540)),
        "autonomy": R.crop((0, 648, 290, 780)),
        # Mapping: the Calibrate button and the mapping target with Lock map (the sim's "waiting for server" line cut)
        "mapping": stack([M.crop((8, 46, 392, 72)), M.crop((8, 256, 392, 298)), M.crop((8, 334, 392, 482))], bg=pbg, gap=6, pad=4),
        # Bagging: where it records, and the topic picker (the sim's "can't reach orin2" line cut)
        "bagging": stack([Bg.crop((10, 64, 412, 180)), Bg.crop((10, 450, 412, 572))], bg=pbg, gap=8, pad=4),
    }
    for k, im in crops.items():
        out = IMG / f"vw-{k}.webp"
        im.save(out, quality=94, method=6)
        print(out.relative_to(ROOT), im.size)


if __name__ == "__main__":
    main()
