#!/usr/bin/env python3
"""Build public/data/computers/*.json from the real team configs.

  python3 tools/computers/build_data.py [--release ~/osu-uwrt/release] [--firmware ~/osu-uwrt/development/titan_firmware]

launches.json  every Talos launch file the robot launcher (remote_launch) can load: its entries, their
               launch arguments and the topics the launcher waits for before it calls an entry "running".
can_ids.json   the CANmore bus and client IDs (titan_canmore client_ids.h) and the internal/external bus rates
               (titan_boards robots/talos.h).
"""
import argparse, json, os, re, yaml

ap = argparse.ArgumentParser()
ap.add_argument('--release', default=os.path.expanduser('~/osu-uwrt/release'))
ap.add_argument('--firmware', default=os.path.expanduser('~/osu-uwrt/development/titan_firmware'))
ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '../../public/data/computers'))
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)

# ---- launch files ----
ldir = os.path.join(a.release, 'src/riptide_launch/remote_launch/launches')
files = []
for name in sorted(os.listdir(ldir)):
    if not (name.startswith('talos') and name.endswith('.yaml')):
        continue
    with open(os.path.join(ldir, name)) as f:
        data = yaml.safe_load(f)
    entries = []
    for e in data['launches']:
        t = e.get('topics') or []
        topics = [{'name': t[i], 'type': t[i + 1], 'sensor': str(t[i + 2]) == '1'} for i in range(0, len(t), 3)]
        entries.append({'package': e['package'], 'file': e['file'], 'args': e.get('args') or [], 'topics': topics})
    files.append({'file': name, 'entries': entries})
order = ['talos_launch_mpc.yaml', 'talos_launch_bench_mpc.yaml', 'talos_launch_sim_hil_mpc.yaml']
files.sort(key=lambda f: (order.index(f['file']) if f['file'] in order else 99, f['file']))
with open(os.path.join(a.out, 'launches.json'), 'w') as f:
    json.dump({'source': 'riptide_launch/remote_launch/launches (branch newsim)', 'files': files}, f, indent=1)

# ---- CAN IDs ----
ids_h = os.path.join(a.firmware, 'lib/titan_canmore/canmore/include/canmore/client_ids.h')
bus, out = None, {'buses': {}, 'clients': []}
for line in open(ids_h):
    m = re.match(r'#define CANMORE_BUS_ID_(\w+) (\d+)', line)
    if m:
        bus = m.group(1).lower()
        out['buses'][bus] = {'id': int(m.group(2))}
        continue
    m = re.match(r'#define CANMORE_CLIENT_ID_(\w+) (\d+)', line)
    if m and bus:
        out['clients'].append({'bus': bus, 'id': int(m.group(2)), 'name': m.group(1).lower()})
talos_h = open(os.path.join(a.firmware, 'lib/titan_boards/include/robots/talos.h')).read()
for b in ('internal', 'external'):
    r = re.search(rf'#define {b.upper()}_CAN_RATE (\d+)', talos_h)
    fd = re.search(rf'#define {b.upper()}_CAN_ENABLE_FD (\d)', talos_h)
    fdr = re.search(rf'#define {b.upper()}_CAN_FD_RATE (\d+)', talos_h)
    out['buses'][b].update({'rate': int(r.group(1)), 'fd': fd.group(1) == '1', 'fd_rate': int(fdr.group(1)) if fdr else None})
with open(os.path.join(a.out, 'can_ids.json'), 'w') as f:
    json.dump(out, f, indent=1)
print('wrote', len(files), 'launch files and', len(out['clients']), 'CAN clients to', os.path.abspath(a.out))
