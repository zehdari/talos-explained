#!/usr/bin/env python3
"""Crop the viewer's pool view out of a full-window point-cloud screenshot.

    python3 tools/nereus/crop_point_cloud.py [/tmp/nmedia/shots/pc_side.png]

The source is a 1600x1000 capture of nereus-viewer (sim.launch.py active_control_model:=mpc mpc_model:=sim,
robosub pool), taken 2026-10-31: Talos placed with set_sim_pose at map (15.6, 2.5, -1.4), level, held by the MPC
about 2.7 m from the torpedo board; Vision panel: Front camera point cloud on, detections off; Thrust off; the
orbit camera above and to the side. Writes public/img/nereus/point-cloud-close.webp (760x475, 16:10).
"""
import sys
from pathlib import Path

from PIL import Image

SRC = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/nmedia/shots/pc_side.png")
OUT = Path(__file__).resolve().parents[2] / "public/img/nereus/point-cloud-close.webp"

Image.open(SRC).convert("RGB").crop((404, 180, 1164, 655)).save(OUT, quality=86, method=6)
print(OUT)
