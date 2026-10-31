#!/usr/bin/env python3
"""List the ROS topics each Talos firmware creates (publishers/subscriptions) by scanning
rclc_*_init calls in titan_firmware/talos/<Board>/src. Usage: firmware_topics.py <titan_firmware> -> JSON."""
import glob, json, re, sys
root = sys.argv[1]
out = {}
for b in ['PoacBoard', 'ESCBoard', 'CameraCageBB', 'LEDBoard', 'IVCBoard', 'SmartBattery']:
    pubs, subs = set(), set()
    for f in glob.glob(f'{root}/talos/{b}/src/**/*.c', recursive=True):
        s = open(f).read()
        defs = dict(re.findall(r'#define\s+([A-Z_0-9]+)\s+"([^"]+)"', s))
        for kind, args in re.findall(r'rclc_(publisher|subscription)_init\w*\s*\((.*?)\);', s, re.S):
            for m in re.findall(r'[A-Z_0-9]+_NAME', args):
                (pubs if kind == 'publisher' else subs).add(defs.get(m, m))
    out[b] = {'publishes': sorted(pubs), 'subscribes': sorted(subs)}
print(json.dumps(out, indent=1))
