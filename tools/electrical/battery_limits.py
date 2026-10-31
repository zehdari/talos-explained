#!/usr/bin/env python3
"""Battery voltage and current limits -> public/data/electrical/battery.json.

Reads the smart battery gas-gauge notes (titan_firmware talos/SmartBattery/bq40z80_files/BQ40Z80 Configuration.txt)
and the diagnostic thresholds (riptide_core riptide_hardware/cfg/diagnostic_thresholds.yaml), finds each limit by
its line, checks the number is still what the page says, and records the line for the link.

    python3 -I tools/electrical/battery_limits.py ~/osu-uwrt/development/titan_firmware ~/osu-uwrt/release/src/riptide_core
"""
import json
import re
import sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / 'public/data/electrical/battery.json'
CFG = 'talos/SmartBattery/bq40z80_files/BQ40Z80 Configuration.txt'
DIAG = 'riptide_hardware/cfg/diagnostic_thresholds.yaml'
TF = 'https://github.com/osu-uwrt/titan_firmware/blob/master/'
RC = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/'
CELLS = 5

# (id, file key, regex on the line, per-cell volts or pack volts, label, what happens)
MARKS = [
    ('pf_suv', 'cfg', r'Threshold: 3\.0V \(Absolute minimum', 3.0, 'cell', 'Permanent failure',
     'Below 3.0 V per cell for 10 s the gas gauge locks the pack out for good. It then has to be opened up: a pack this flat is unsafe to charge.'),
    ('cuv', 'cfg', r'Hard stop discharge at 3\.2V', 3.2, 'cell', 'Empty: output off',
     'Cell undervoltage. At 3.2 V per cell (16 V for the pack, MaxAmps\' recommended cutoff) the BMS turns the output off for 2 s or more. It recovers only after charging past 3.5 V per cell.'),
    ('td', 'cfg', r'Maxamps recommends landing voltage of 17\.5V', 3.5, 'cell', 'Swap alert',
     'Terminate-discharge alarm at 3.5 V per cell, MaxAmps\' recommended landing voltage. The notes call it "the alert for software to swap battery".'),
    ('warn', 'diag', r'^\s*warn: 18\.5', 18.5, 'pack', 'Diagnostics warning',
     'battery_volt.warn in diagnostic_thresholds.yaml. The diagnostics node is no longer run, but the pre-test checks reuse 18.5 V as the minimum bus voltage on batteries.'),
    ('nominal', 'cfg', r'Design Voltage: 18\.5V', 18.5, 'pack', 'Nominal',
     'Design voltage of the 5S pack: 3.7 V per cell. Capacity is quoted at this voltage: 8 Ah x 18.5 V = 148 Wh.'),
    ('full', 'cfg', r'Max Voltage to Charge \(per cell\): 4\.15V', 4.15, 'cell', 'Charged',
     'The notes give 4.15 V per cell as the charge voltage, a little under the 4.2 V maximum.'),
    ('cov', 'cfg', r'Above 4\.2V we\'ll overvoltage', 4.2, 'cell', 'Overvoltage',
     'Cell overvoltage protection at 4.2 V per cell (the cell datasheet maximum). Charging resumes only after the cells fall below 4.0 V.'),
]


def find(lines, pattern):
    for i, line in enumerate(lines, 1):
        if re.search(pattern, line):
            return i, line.strip()
    sys.exit(f'not found: {pattern}')


def main():
    tf, rc = Path(sys.argv[1]), Path(sys.argv[2])
    files = {
        'cfg': ((tf / CFG).read_text().splitlines(), TF + CFG.replace(' ', '%20')),
        'diag': ((rc / DIAG).read_text().splitlines(), RC + DIAG),
    }
    marks = []
    for mid, key, pat, v, per, label, text in MARKS:
        lines, url = files[key]
        n, line = find(lines, pat)
        pack = round(v * CELLS, 2) if per == 'cell' else v
        marks.append({'id': mid, 'pack_v': pack, 'cell_v': round(pack / CELLS, 3), 'label': label, 'text': text,
                      'source': f'{url}#L{n}', 'line': line})
    cfg = files['cfg'][0]

    def num(pattern):
        n, line = find(cfg, pattern)
        return n, line

    facts = {}
    for key, pat in {
        'pack': r'Designed for MaxAmps 8000 mAh 5S2P 18\.5V LiPo',
        'capacity_wh': r'Design Capacity: 148 Wh',
        'discharge_oc': r'Slower limit at 45A \(fuse rating\) for 5 seconds',
        'discharge_peak': r'Faster limit at 80A for 2 seconds',
        'charge_oc': r'Max charge current @5A',
        'ot_discharge': r'60 degC discharge max',
        'ot_charge': r'50 degC charging max',
        'ut': r'0C for 2s, 5C recovery',
        'zero_volt_charge': r'Below 2\.9V, we won\'t let the battery charge',
        'auto_ship': r'We\'ll enter shutdown if the pack isn\'t touched for 1 week',
        'fuse_off': r'0 No fuse right now',
        'pf_rs24': r'IT DID AT RS24',
    }.items():
        n, line = num(pat)
        facts[key] = {'line': line, 'source': f'{files["cfg"][1]}#L{n}'}
    out = {'cells': CELLS, 'marks': marks, 'facts': facts}
    OUT.write_text(json.dumps(out, indent=1))
    print('wrote', OUT, file=sys.stderr)


if __name__ == '__main__':
    main()
