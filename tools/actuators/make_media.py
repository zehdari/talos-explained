"""Crops and composites for actuators.html, from the shared CAD renders in public/media/cad.

  python3 tools/actuators/make_media.py      -> public/img/actuators/*.webp

where.webp: the three ctx-*-iso renders share one camera, so their orange groups are merged onto one robot:
launcher orange (--accent), claw purple (--s7), magnet poker blue (--state), then cropped to the lower half.
"""
from pathlib import Path
import colorsys
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CAD = ROOT / 'public/media/cad'
OUT = ROOT / 'public/img/actuators'
OUT.mkdir(parents=True, exist_ok=True)


def load(name):
    return np.asarray(Image.open(CAD / f'{name}.webp').convert('RGB')).astype(np.float32)


def orange_mask(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r - b) > 40


def recolour(a, mask, hex_rgb):
    """Give masked pixels the target colour, keeping the render's shading (value relative to the brightest)."""
    t = np.array([int(hex_rgb[i:i + 2], 16) for i in (1, 3, 5)], np.float32)
    v = a.max(-1, keepdims=True) / 255.0          # shading of the orange
    shade = np.clip(v / 0.85, 0, 1.25)            # 0.85 ~ value of a lit orange face
    lit = np.clip(t * np.minimum(shade, 1) + (255 - t) * np.clip(shade - 1, 0, 1), 0, 255)
    out = a.copy()
    out[mask] = lit[mask]
    return out


def save(a, name, box=None, width=None, q=86):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)) if isinstance(a, np.ndarray) else a
    if box:
        im = im.crop(box)
    if width and im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im.save(OUT / name, 'WEBP', quality=q, method=6)
    print(name, im.size)


# ---- where each mechanism sits
L, C, P = load('ctx-torpedo-marker-launcher-iso'), load('ctx-claw-iso'), load('ctx-magnet-poker-iso')
base = recolour(L, orange_mask(L), '#d9480f')
base = recolour(np.where(orange_mask(C)[..., None], C, base), orange_mask(C), '#6250d6')
base = recolour(np.where(orange_mask(P)[..., None], P, base), orange_mask(P), '#2a78d6')
save(base, 'where.webp', box=(40, 640, 1320, 1759), width=1100)

# ---- launcher, cropped to the mechanism (the long mounting bracket mostly dropped)
save(Image.open(CAD / 'sub-torpedo-marker-launcher-iso.webp').convert('RGB'), 'launcher-iso.webp', box=(30, 385, 1110, 965), width=1080)
save(Image.open(CAD / 'sub-torpedo-marker-launcher-port.webp').convert('RGB'), 'launcher-port.webp', box=(30, 30, 960, 480), width=930)
save(Image.open(CAD / 'sub-torpedo-marker-launcher-below.webp').convert('RGB'), 'launcher-below.webp', box=(30, 30, 1100, 800), width=1070)

# ---- claw: the bow view cropped to the racks and jaws
save(Image.open(OUT / 'claw-front.webp').convert('RGB'), 'claw-jaws.webp', box=(0, 960, 1244, 1720))
# the claw itself (servo, rack housing, jaws), the long mount arm cropped off
save(Image.open(CAD / 'sub-claw-iso.webp').convert('RGB'), 'claw-iso.webp', box=(40, 1010, 800, 1830))

# ---- Nereus clips (public/video/actuators): recorded 2026-10-31 with the scripts in tools/actuators/clips/.
# Simulator only (`ros2 launch nereus sim.launch.py stack:=false viewer:=false cameras:=false`, domain 87), the viewer
# on a private Xvfb :91 with labels off and a fixed orbit (viewer.sh FOCUS YAW PITCH DIST). hold.py re-places Talos
# through /talos/set_sim_pose at 20 Hz (no controller runs) and fires at set wall times; real_time_factor on
# /talos/physics_simulator slows the sim so the software-rendered viewer gets enough frames.
#   torpedo-side: viewer.sh torpedo 2.3 0.06 2.0; shoot.sh torpF "17.5468 2.4174 -1.2535 10.164" "27:torpedo" 5 63 0.015
#                 (torpedo_0_link 0.6 m in front of fire_large; hit fire_large). Encoded 8x slow:
#                 -ss 17 -t 33, crop=500:375:320:140, mpdecimate, setpts=0.12*PTS, minterpolate=24, scale 640x480.
#   claw-bow:     viewer.sh Vehicle 0 0.0 1.3; RTF 0.1; hold.py 18.8187 9.1551 -1.1028 0 92 0:unkill 3:notify_reload
#                 6:arm 10:claw:2 32:dz:-0.08:10 45:claw:-2 68:dz:0.25:15 (claw_link on nut_and_bolt). Real time:
#                 -ss 28 -t 58, crop=573:430:150:330, mpdecimate, setpts=0.1*PTS, minterpolate=24, scale 640x480.
# A dropper clip was tried and dropped: from every open side the marker falls behind a crate or the frame legs.
