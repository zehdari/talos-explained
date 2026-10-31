#!/usr/bin/env python3
"""Crops and markers for the launch chapter, from the real screenshots (same pixels; only an orange outline and tag
are drawn on top), sized so their text is at least 11 px on a 390 px phone.

- img/launch/launcher-running-marked.webp: the desktop launcher shot with navigation's "2/4 completed" bar outlined.
- img/launch/launcher-running-phone.webp (428 px wide): the navigation row and its bar (outlined), the Monitored
  Topics box, and the mapping row with its "Running" bar.
- img/launch/viewer-killed-motion.webp (314 px wide): the viewer's Motion panel only (Enable, "Robot: killed",
  the axis table with dashes under Commanded; the Position/Feedforward toggle row left out), from media/nereus/viewer-startup-killed.webp. Shown at 1:1 or larger.

Run: python3 tools/launch/crop_phone.py
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ORANGE = (217, 72, 15)  # --accent
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def tag(draw, xy, text, size, anchor):
    """An orange tag with white text; `anchor` is the corner xy refers to ('rt' right-top, 'rm' right-middle)."""
    f = ImageFont.truetype(FONT, size)
    l, t, r, b = draw.textbbox((0, 0), text, font=f)
    pw, ph = size * 0.45, size * 0.3
    w, h = r - l + 2 * pw, b - t + 2 * ph
    x, y = xy
    x0 = x - w
    y0 = y if anchor == "rt" else y - h / 2
    draw.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=size * 0.3, fill=ORANGE)
    draw.text((x0 + pw - l, y0 + ph - t), text, font=f, fill=(255, 255, 255))


def launcher():
    src = ROOT / "public/img/launch/launcher-running.webp"
    im = Image.open(src).convert("RGB")

    # desktop: outline the navigation bar, tag it on its left
    big = im.copy()
    d = ImageDraw.Draw(big)
    d.rounded_rectangle((801, 143, 1184, 182), radius=6, outline=ORANGE, width=5)
    tag(d, (790, 162), "stuck at 2/4", 24, "rm")
    out_p = ROOT / "public/img/launch/launcher-running-marked.webp"
    big.save(out_p, "WEBP", quality=90, method=6)
    print(out_p, big.size, out_p.stat().st_size, "bytes")

    # phone
    out_p = ROOT / "public/img/launch/launcher-running-phone.webp"
    W = 428
    rows = []

    def entry_row(y0, y1):
        name = im.crop((12, y0, 138, y1))       # "- navigation" / "+ mapping"
        bar = im.crop((882, y0, 1178, y1))      # its progress bar
        row = Image.new("RGB", (W, y1 - y0), im.getpixel((5, y0 + 2)))
        row.paste(name, (0, 0))
        row.paste(bar, (W - bar.width, 0))
        return row

    rows.append(entry_row(140, 186))
    rows.append(im.crop((12, 190, 12 + W, 352)))   # Monitored Topics, Present / Not Present
    rows.append(entry_row(575, 621))
    gap = 6
    H = sum(r.height for r in rows) + gap * (len(rows) - 1)
    out = Image.new("RGB", (W, H), im.getpixel((5, 120)))
    y = 0
    for r in rows:
        out.paste(r, (0, y))
        y += r.height + gap
    d = ImageDraw.Draw(out)
    d.rounded_rectangle((W - 300, 2, W - 2, 44), radius=6, outline=ORANGE, width=4)
    tag(d, (W - 4, 52), "stuck at 2/4", 17, "rt")
    out.save(out_p, "WEBP", quality=90, method=6)
    print(out_p, out.size, out_p.stat().st_size, "bytes")


def viewer():
    src = ROOT / "public/media/nereus/viewer-startup-killed.webp"
    out_p = ROOT / "public/img/launch/viewer-killed-motion.webp"
    im = Image.open(src).convert("RGB")
    # Motion panel, left part: Enable, Robot: killed, the status line, then the axis table up to Error.
    # The Position/Feedforward toggle row between them is left out (it would be cut mid-word at this width).
    top, table = im.crop((4, 92, 318, 216)), im.crop((4, 254, 318, 468))
    out = Image.new("RGB", (top.width, top.height + table.height + 4), (255, 255, 255))
    out.paste(top, (0, 0))
    out.paste(table, (0, top.height + 4))
    out.save(out_p, "WEBP", quality=92, method=6)
    print(out_p, out.size, out_p.stat().st_size, "bytes")


launcher()
viewer()
