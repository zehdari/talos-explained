#!/usr/bin/env python3
"""Blue Robotics T200 performance data -> public/data/electrical/t200.json.

Source: Blue Robotics, "T200 Public Performance Data 10-20V (September 2019)",
https://cad.bluerobotics.com/T200-Public-Performance-Data-10-20V-September-2019.xlsx
(linked from https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/).

One sheet per supply voltage (10, 12, 14, 16, 18, 20 V), rows every 4 us of PWM from 1100 to 1900 us, columns
PWM, RPM, Current (A), Voltage (V), Power (W), Force (kgf), Efficiency (g/W). Read with the standard library
(no openpyxl). Writes, per voltage, the forward and reverse branches as [force N, current A, rpm] sorted by force,
dropping the dead band (zero force rows).

    python3 -I tools/electrical/t200_data.py T200-Public-Performance-Data-10-20V-September-2019.xlsx
"""
import json
import re
import sys
import zipfile
from pathlib import Path

KGF = 9.80665
OUT = Path(__file__).resolve().parents[2] / 'public/data/electrical/t200.json'


def sheets(path):
    z = zipfile.ZipFile(path)
    strings = [re.sub(r'<[^>]+>', '', s).strip() for s in
               re.findall(r'<si>(.*?)</si>', z.read('xl/sharedStrings.xml').decode(), re.S)]
    wb = z.read('xl/workbook.xml').decode()
    names = re.findall(r'<sheet [^>]*name="([^"]+)"', wb)
    for i, name in enumerate(names, 1):
        rows = re.findall(r'<row [^>]*>(.*?)</row>', z.read(f'xl/worksheets/sheet{i}.xml').decode(), re.S)
        if not rows:
            continue
        cell = r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(?:<f>.*?</f>)?(?:<v>([^<]*)</v>)?</c>)'
        head = {c: strings[int(v)] for c, a, v in re.findall(cell, rows[0]) if 't="s"' in a and v}
        col = {k: next(c for c, h in head.items() if h.lower().startswith(k)) for k in ('pwm', 'rpm', 'current', 'force')}
        data = []
        for r in rows[1:]:
            v = {c: float(x) for c, a, x in re.findall(cell, r) if x and 't="s"' not in a}
            if all(col[k] in v for k in col):
                data.append({k: v[col[k]] for k in col})
        yield name, data


def main():
    out = {
        'source': 'Blue Robotics, T200 Public Performance Data 10-20V (September 2019)',
        'url': 'https://cad.bluerobotics.com/T200-Public-Performance-Data-10-20V-September-2019.xlsx',
        'units': {'force': 'N (kgf x 9.80665)', 'current': 'A', 'rpm': 'rev/min'},
        'volts': {},
    }
    for name, rows in sheets(sys.argv[1]):
        volts = int(re.match(r'(\d+)', name).group(1))
        fwd = sorted({(round(r['force'] * KGF, 3), round(r['current'], 3), round(r['rpm'])) for r in rows if r['pwm'] > 1500 and r['force'] > 0})
        rev = sorted({(round(-r['force'] * KGF, 3), round(r['current'], 3), round(r['rpm'])) for r in rows if r['pwm'] < 1500 and r['force'] < 0})
        out['volts'][volts] = {'forward': [list(x) for x in fwd], 'reverse': [list(x) for x in rev]}
        print(volts, 'V: max forward', fwd[-1], 'max reverse', rev[-1], file=sys.stderr)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print('wrote', OUT, OUT.stat().st_size, 'bytes', file=sys.stderr)


if __name__ == '__main__':
    main()
