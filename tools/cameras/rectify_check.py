#!/usr/bin/env python3
"""Rectified intrinsics of Talos's two ZED X Minis from the team's OpenCV calibration files (cv2.stereoRectify),
compared with what Nereus's robot pack publishes. Usage: rectify_check.py <riptide_hardware/cfg dir>"""
import sys, math, cv2, numpy as np
cfg = sys.argv[1]
for name, f in [('ffc', 'tirpak_ffc_charuco_3.yaml'), ('dfc', 'zedxm_dfc_2026_cal.yaml')]:
    fs = cv2.FileStorage(f'{cfg}/{f}', cv2.FILE_STORAGE_READ)
    g = lambda k: fs.getNode(k).mat()
    K1, D1, K2, D2, R, T = g('K_LEFT'), g('D_LEFT'), g('K_RIGHT'), g('D_RIGHT'), g('R'), g('T')
    for alpha in (0, -1):
        R1, R2, P1, P2, Q, r1, r2 = cv2.stereoRectify(K1, D1, K2, D2, (1920, 1200), R, T / 1000.0, flags=cv2.CALIB_ZERO_DISPARITY, alpha=alpha)
        fx = P1[0, 0]
        print(name, 'alpha', alpha, 'fx %.3f cx %.3f cy %.3f baseline %.5f m' % (fx, P1[0, 2], P1[1, 2], -P2[0, 3] / P2[0, 0]),
              'HFOV %.1f VFOV %.1f' % (2 * math.degrees(math.atan(960 / fx)), 2 * math.degrees(math.atan(600 / fx))))
    fxr = K1[0, 0]; fyr = K1[1, 1]
    print(name, 'raw left fx %.1f fy %.1f -> HFOV %.1f VFOV %.1f' % (fxr, fyr, 2 * math.degrees(math.atan(960 / fxr)), 2 * math.degrees(math.atan(600 / fyr))))
