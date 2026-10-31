#!/usr/bin/env python3
"""Work out where key parts sit on each board render, as fractions of the final webp's width/height,
so a page can put tap targets on the picture.

How: the render is an orthographic top (or bottom) view. The soldermask-green pixels give the board
outline in pixels; the KiCad board bounding box gives it in mm. That fixes the mm -> px mapping.
The same trim/border/resize steps as render_all.sh then give coordinates in the published image.

Usage: WORK=/tmp/boards_work python3 hotspots.py   -> public/data/boards/hotspots.json
Add DEBUG=1 to also write <id>-<side>-hotspots.png overlays into $WORK for checking.
"""
import json, os, pathlib
import numpy as np
from PIL import Image, ImageDraw

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = pathlib.Path(os.environ.get('WORK', '/tmp/boards_work'))
OUT = ROOT / 'public' / 'data' / 'boards' / 'hotspots.json'
MEDIA = ROOT / 'public' / 'media' / 'boards'
BORDER, MAXSIDE = 12, 1400

# (ref, label) per board; side is taken from the footprint
SPOTS = {
    'poac': [('J3', 'Port battery in'), ('J4', 'Starboard battery in'), ('U4', 'Port ideal-diode OR'),
             ('U6', 'Starboard ideal-diode OR'), ('PS1', '15 V regulator'), ('PS2', '5 V regulator'),
             ('U2', '12 V LDO (servo)'), ('U5', 'Vreg Schottky'), ('U3', '3.3 V LDO'),
             ('Q3', 'Kill switch FETs'), ('U11', 'Gate drivers'), ('U13', 'Software kill switch'),
             ('J7', 'ESC power out'), ('J9', 'ESC ground'), ('J5', 'Stack link'), ('J6', 'Camera cage link'),
             ('J1', 'Kill + aux switch'), ('LID_CONN1', 'Servo (lid)'), ('J11', 'Fan'),
             ('U7', 'ADC (rail voltages)'), ('U1', 'Temp/humidity'), ('U1R', 'RP2040'), ('U1C', 'CAN controller'),
             ('U2C', 'CAN transceiver'), ('SW1C', 'CAN termination switch'), ('J2', 'USB')],
    'esc': [('M1', 'ESC 1/5'), ('M2', 'ESC 2/6'), ('M3', 'ESC 3/7'), ('M4', 'ESC 4/8'),
            ('J1', 'ESC V+ in'), ('J3', 'ESC GND'), ('F5', '60 A fuse'), ('Q1', 'Reverse protection'),
            ('F1', '15 A fuse (per ESC)'), ('J5', 'Thruster SubConn'), ('J6', 'ESC stack link'),
            ('J7', 'ESC flash connector'), ('SB1', 'Board ID jumper'), ('J12', 'DShot/telemetry breakout'),
            ('U1R', 'RP2040'), ('U1C', 'CAN controller'), ('SW1C', 'CAN termination switch'), ('J11', 'USB')],
    'ccbb': [('J6', 'Link from POAC'), ('J17', 'Orin power'), ('Q6', 'Orin power switch'), ('J10', 'Orin CAN'),
             ('J1', 'External CAN'), ('J13', 'DVL Ethernet'), ('J14', 'DVL Ethernet + power'), ('J16', 'Network switch power'),
             ('J15', 'Depth sensor'), ('J3', 'Peltier'), ('J2', 'Fan'), ('J9', 'LED strip'), ('J11', 'Extra power'),
             ('U2', 'Temp/humidity'), ('U1R', 'RP2040'), ('U1C', 'CAN controller'), ('SW1C', 'CAN termination switch')],
    'led': [('U1', 'LED driver 1'), ('U2', 'LED driver 2'), ('J1', 'LED module'), ('J2', 'Stack link'),
            ('U1R', 'RP2040'), ('U1C', 'CAN controller'), ('J3', 'USB')],
    'ivc': [('J1', 'Transducer + hydrophone'), ('J2', 'Stack link'), ('U6', '+/-24 V converter'),
            ('U2', 'Power amplifier'), ('U8', '+/-5 V converter'), ('U14', 'Receive filter'), ('U1', 'Transmit filter'),
            ('U17', 'Bluetooth module'), ('J5', 'Backup hydrophone'), ('U1R', 'RP2040'), ('U1C', 'CAN controller')],
    'sbh_mcu': [('DS1', 'OLED display'), ('S1', 'Reed switch'), ('U1', '5 V buck'), ('U2', '3.3 V buck'),
                ('J1', 'To BMS board'), ('U3', 'Temp/humidity'), ('U1R', 'RP2040'), ('U1C', 'CAN controller')],
    'sbh_bms': [('U2', 'BQ40Z80 BMS'), ('Q1', 'Protection FET'), ('Q2', 'Protection FET'), ('F1', '45 A protector'),
                ('J3', 'Pack+'), ('J5', 'Pack-'), ('J6', 'Cell balance taps'), ('J1', 'External connector'),
                ('J10', 'To MCU board')],
    'agx_breakout': [('J3', 'Orin 40-pin header'), ('U1', 'CAN transceiver (can1)'), ('U2', 'CAN transceiver (can0)'),
                     ('U3', 'RS-232 (IMU)'), ('J1', 'CAN out'), ('J2', 'IMU'), ('SW1', 'Termination'), ('SW2', 'Termination')],
    'agx_m2': [('U2', 'RS-422 transceiver'), ('J1', 'Gyro connector'), ('U3', '8 V boost'), ('U4', '5 V LDO')],
}
LANDSCAPE = {'ccbb', 'led', 'ivc'}


def board_px_bbox(rgba):
    a = rgba[..., 3] > 191
    r, g, b = (rgba[..., i].astype(int) for i in range(3))
    green = a & (g > r + 12) & (g > b + 4)
    ys, xs = np.nonzero(green)
    return xs.min(), xs.max(), ys.min(), ys.max()


def place(board_id, side, summary):
    png = WORK / f'{board_id}_{side}.png'
    im = Image.open(png).convert('RGBA')
    rgba = np.asarray(im)
    x0, x1, y0, y1 = board_px_bbox(rgba)
    ox, oy = summary['origin_mm']
    w, h = summary['size_mm']
    sx, sy = (x1 - x0) / w, (y1 - y0) / h
    s = (sx + sy) / 2
    # trimmed box (alpha thresholded like render_all.sh)
    alpha = rgba[..., 3] > 191
    ty, tx = np.nonzero(alpha)
    tx0, ty0, tx1, ty1 = tx.min(), ty.min(), tx.max() + 1, ty.max() + 1
    W, H = tx1 - tx0 + 2 * BORDER, ty1 - ty0 + 2 * BORDER
    k = min(1.0, MAXSIDE / max(W, H))
    fps = {f['ref']: f for f in summary['footprints']}
    spots = []
    for ref, label in SPOTS.get(board_id, []):
        f = fps.get(ref)
        if not f or f['side'] != side:
            continue
        # pads give a tighter box than the footprint (which includes courtyard and text)
        bx, by, bw, bh = f.get('pads_bbox_mm') or f['bbox_mm']
        cx, cy = bx + bw / 2, by + bh / 2
        px = x0 + (cx - ox) * s if side == 'top' else x1 - (cx - ox) * s
        py = y0 + (cy - oy) * s
        fx = (px - tx0 + BORDER) / W
        fy = (py - ty0 + BORDER) / H
        rr = (max(bw, bh) / 2 + 1.0) * s / max(W, H)   # +1 mm so small parts stay tappable
        spots.append({'ref': ref, 'label': label, 'value': f['value'], 'x': round(fx, 4), 'y': round(fy, 4), 'r': round(max(rr, 0.012), 4)})
    info = {'scale_check': round(sx / sy, 3), 'image_px': [round(W * k), round(H * k)], 'spots': spots}
    if board_id in LANDSCAPE:
        info['landscape'] = [{**p, 'x': p['y'], 'y': round(1 - p['x'], 4)} for p in spots]
    if os.environ.get('DEBUG'):
        web = Image.open(MEDIA / f'{board_id}-{side}.webp').convert('RGBA')
        d = ImageDraw.Draw(web)
        for p in spots:
            X, Y = p['x'] * web.width, p['y'] * web.height
            R = p['r'] * max(web.width, web.height)
            d.ellipse([X - R, Y - R, X + R, Y + R], outline=(217, 72, 15, 255), width=4)
            d.text((X + R + 3, Y - 6), p['ref'], fill=(217, 72, 15, 255))
        web.save(WORK / f'{board_id}-{side}-hotspots.png')
    return info


out = {'about': 'Tap targets on the board renders in /media/boards/. x, y = centre as a fraction of the image width '
                'and height; r = radius as a fraction of the longer side. "landscape" gives the same spots for the '
                '-landscape.webp copies (rotated 90 deg counter-clockwise). Generated by tools/boards/hotspots.py.',
       'boards': {}}
for board_id in SPOTS:
    summary = json.loads((WORK / f'{board_id}.json').read_text())
    out['boards'][board_id] = {side: place(board_id, side, summary) for side in ('top', 'bottom')}
    for side in ('top', 'bottom'):
        i = out['boards'][board_id][side]
        print(board_id, side, 'scale x/y', i['scale_check'], 'spots', len(i['spots']))
OUT.write_text(json.dumps(out, indent=1) + '\n')
print('wrote', OUT)
