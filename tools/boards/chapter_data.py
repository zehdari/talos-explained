#!/usr/bin/env python3
"""Build the data behind the boards chapter (boards.html) from the boards fact library.

Reads   public/data/boards/boards.json    (tools/boards/build_data.py)
        public/data/boards/hotspots.json  (tools/boards/hotspots.py)
Writes  public/data/boards/explorer.json  one record per board for the board explorer: tap targets on each render
                                          joined to the part / connector facts, image sizes, topics, links
        public/data/boards/system.json    the system diagram: who is on which bus, what each board publishes and
                                          subscribes, and which Orin-side code uses each topic (checked against the
                                          local repos below, so every link points at a file that exists)

Run:    python3 tools/boards/chapter_data.py
Repos:  ~/osu-uwrt/release (riptide_release and submodules), ~/osu-uwrt/release/nereus
"""
import json, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / 'public' / 'data' / 'boards'
REL = pathlib.Path.home() / 'osu-uwrt' / 'release'

boards = json.loads((DATA / 'boards.json').read_text())
hot = json.loads((DATA / 'hotspots.json').read_text())['boards']

# ------------------------------------------------------------------------------------------------ explorer
# Board order and grouping in the picker.
ORDER = [
    ('poac', 'hull', 'POAC'), ('esc', 'hull', 'ESC ×2'), ('ccbb', 'hull', 'Camera cage BB'), ('led', 'hull', 'LED'),
    ('led_module', 'hull', 'LED module'), ('ivc', 'hull', 'IVC'),
    ('sbh_mcu', 'battery', 'Battery MCU'), ('sbh_bms', 'battery', 'Battery BMS'),
    ('agx_breakout', 'orin', 'Orin HAT'), ('agx_m2', 'orin', 'FOG card'),
    ('mk2_power', 'retired', 'Mk 2 power'), ('mk2_actuator', 'retired', 'Mk 2 actuator'),
]
GROUPS = {'hull': 'In the hull', 'battery': 'In each battery housing', 'orin': 'On the Orin', 'retired': 'Retired'}
LANDSCAPE = {'ccbb', 'led', 'ivc'}

# Where each board sits and how sure we are. The 2026 TDR's electrical architecture figure (Fig. 15) names every
# board below, including the "Orin HAT" and "FOG Board", which settles the two Orin-side boards.
TDR = 'https://robonation.org/app/uploads/sites/4/2026/07/RS26_TDR_TheOhioState_UWRT.pdf'
WHERE = {
    'poac': 'Board stack, port hull',
    'esc': 'Board stack, port hull',
    'ccbb': 'Camera cage, starboard hull',
    'led': 'On the stack link, next to the IVC board (TDR Fig. 15)',
    'led_module': 'Driven by the LED board (TDR Fig. 15: "LED Aluminum Board")',
    'ivc': 'On the stack link (TDR Fig. 15)',
    'sbh_mcu': 'Inside each smart battery housing',
    'sbh_bms': 'Inside each smart battery housing',
    'agx_breakout': "On the Orin's 40-pin header (TDR Fig. 15: \"Orin HAT\")",
    'agx_m2': "In the Orin's M.2 E-key slot (TDR Fig. 15: \"FOG Board\")",
    'mk2_power': 'Replaced by the POAC',
    'mk2_actuator': 'Replaced by the POAC',
}
STATUS = {'on-talos': 'On Talos', 'on-talos (inferred)': 'On Talos', 'orin-side (inferred)': 'On Talos', 'retired': 'Retired'}

# Hotspot "value" strings that are Altium library comments rather than part names.
CLEAN = {
    'SHT14 SENSOR HUMID/TEMP': 'SHT41', 'Comment': 'Molex Mini-Fit Jr', 'CAN Transceiver': 'TJA1442AT',
    'Switch DPDT': 'CAS-220TA slide switch', 'IC VOLTAGE FEEDBACK 2 CIRC 8SOIC': 'dual op-amp',
    'RF TXRX MOD BT PCB TH SMD': 'Microchip BM83', 'Battery Managment IC': 'TI BQ40Z80',
    'MOSFET N-Ch 80V 100A D2PAK': 'PSMN4R4-80BS (N-ch 80 V 100 A)', 'MOSFET P-Ch 30V 60A SO-8': 'SiR167DP (P-ch 30 V 60 A)',
    '0 Ohm Jumper No Fit': 'solder jumper', 'REG BUCK 5V 1A': 'TS30041-M050', 'REG BUCK 3.3V 600mA': 'XC9236A33',
    'DISP OLED 128x32': '0.91 in 128×32 OLED', '10pos 3.8A conn': 'Samtec LS2 10-pin', 'Mini-Fit Jr R/A': 'Molex Mini-Fit Jr',
    'Mini-Fit Jr VERT': 'Molex Mini-Fit Jr', 'XH2.54 VERT': 'JST XH', 'JST GH VERT': 'JST GH', '615008142621': 'Würth RJ45',
    'USB_MICRO R/A': 'micro-USB', 'PP45 R/A': 'Anderson PP45', 'Redcube M4 Term 85A': 'Würth Redcube M4, 85 A',
    'HEADER VERT 2.54MM': '2.54 mm header', 'HEADER DUAL VERT 2.54MM': '2×5 2.54 mm header', '7-534206-0': '40-pin receptacle',
    '505567-0781': 'Molex 505567 7-pin', 'Reed Switch': 'reed switch', 'APD 80F3[X]': 'APD 80F3',
    'I6A4W020A033V-001-R': 'TDK-Lambda i6A4W020A033V', 'MIC29300-12WU-TR': 'MIC29300-12', 'LTC4412ES6TRPBF': 'LTC4412',
    'LM1117IMPX-3.3/NOPB': 'LM1117-3.3', 'SIR167DP-T1-GE3': 'SiR167DP', 'TC4432EOA713': 'TC4432', 'DG448DV-T1-E3': 'DG448',
    'MCP3428-E/SL': 'MCP3428', 'L99LD20Q6TR': 'ST L99LD20', 'OPA548F/500G3': 'OPA548', 'AM1DS-0505DH30LPZ': 'AM1DS-0505DH30',
    'OPA1664AIDR': 'OPA1664', 'THN 15-2425N': 'TRACO THN 15-2425N', '1245HC60-RTR': 'Eaton 1245HC60',
    '0685H9150-01': 'Bel 0685H9150', 'SP335EER1-L': 'SP335E', 'LM27313XMF/NOPB': 'LM27313', 'LP38693SD-5.0/NOPB': 'LP38693-5.0',
    'SN65C3221EPWR': 'SN65C3221E', 'ITV9550L2045MR': 'Littelfuse ITV9550L2045MR',
}


def expand(refs):
    """'U4, U6' / 'Q2-Q4' / 'Q5/Q6' / 'J2, J4, J7, J8' -> set of single references."""
    out = set()
    for part in re.split(r'[,/]\s*', refs):
        part = part.strip()
        m = re.fullmatch(r'([A-Z_]+)(\d+)([A-Z]*)\s*-\s*([A-Z_]*)(\d+)([A-Z]*)', part)
        if m:
            for k in range(int(m.group(2)), int(m.group(5)) + 1):
                out.add(f'{m.group(1)}{k}{m.group(3)}')
        elif part:
            out.add(part)
    return out


mcu_parts = {p['ref']: p for p in boards['mcu_block']['parts']}


def spot_detail(b, s):
    """Join a tap target to the board's part or connector facts."""
    ref = s['ref']
    for c in b.get('connectors') or []:
        if ref in expand(c['ref']):
            return c['type'], (f'{c["label"]}: ' if c['label'] else '') + c['carries']
    for k in b.get('key_ics') or []:
        if ref in expand(k['ref']):
            return k['part'], k['role']
    if ref in mcu_parts:
        p = mcu_parts[ref]
        return p['part'], p['role'] + ' (shared RP2040 + CAN block)'
    return CLEAN.get(s['value'], s['value']), ''


def rot(s):
    """Tap target on the -landscape copy (rotated 90° counter-clockwise): (x, y) -> (y, 1 - x)."""
    return {**s, 'x': s['y'], 'y': round(1 - s['x'], 4)}


by_id = {b['id']: b for b in boards['boards']}
explorer = []
for bid, group, short in ORDER:
    b = by_id[bid]
    hs = hot.get(bid, {})
    rec = {
        'id': bid, 'name': b['name'], 'short': short, 'group': group, 'groupLabel': GROUPS[group],
        'status': STATUS.get(b['status'], b['status']), 'statusBasis': b.get('status_basis'),
        'count': b.get('count') or 1, 'where': WHERE[bid], 'purpose': b['purpose'], 'why': b.get('why'),
        'whySource': b.get('why_source'), 'mcu': b.get('mcu'), 'size': b.get('size_mm'), 'can': b.get('can'),
        'firmware': ({k: b['firmware'][k] for k in ('project', 'url', 'pico_board') if k in b['firmware']} if b.get('firmware') else None),
        'firmwareFacts': (b.get('firmware') or {}).get('facts', []),
        'revision': b.get('revision'), 'battery': b.get('battery'), 'power': b.get('power'),
        'ros': b.get('ros'), 'landscape': bid in LANDSCAPE, 'images': {}, 'spots': {}, 'parts': [], 'connectors': [],
        'schematics': (b.get('media') or {}).get('schematics', []),
    }
    for side in ('top', 'bottom'):
        px = (hs.get(side) or {}).get('image_px')
        rec['images'][side] = {'src': f'media/boards/{bid}-{side}.webp', 'w': px[0], 'h': px[1]} if px else None
        spots = []
        for s in (hs.get(side) or {}).get('spots', []):
            part, desc = spot_detail(b, s)
            spots.append({'ref': s['ref'], 'label': s['label'], 'part': CLEAN.get(part, part), 'desc': desc,
                          'x': s['x'], 'y': s['y'], 'r': s['r']})
        rec['spots'][side] = spots
        if bid in LANDSCAPE and px:
            rec['images'][side + 'L'] = {'src': f'media/boards/{bid}-{side}-landscape.webp', 'w': px[1], 'h': px[0]}
            rec['spots'][side + 'L'] = [rot(s) for s in spots]
    # The two renders without measured sizes (mk2 boards) still need image sizes for the stage.
    for side in ('top', 'bottom'):
        if rec['images'][side] is None:
            from PIL import Image  # only for boards without hotspots
            with Image.open(ROOT / 'public' / 'media' / 'boards' / f'{bid}-{side}.webp') as im:
                rec['images'][side] = {'src': f'media/boards/{bid}-{side}.webp', 'w': im.width, 'h': im.height}
    on = {s['ref']: side for side in ('top', 'bottom') for s in rec['spots'][side]}
    for k in b.get('key_ics') or []:
        rec['parts'].append({**k, 'spot': next((on[r] for r in sorted(expand(k['ref'])) if r in on), None),
                             'spotRef': next((r for r in sorted(expand(k['ref'])) if r in on), None)})
    for c in b.get('connectors') or []:
        rec['connectors'].append({**c, 'spot': next((on[r] for r in sorted(expand(c['ref'])) if r in on), None),
                                  'spotRef': next((r for r in sorted(expand(c['ref'])) if r in on), None)})
    explorer.append(rec)

(DATA / 'explorer.json').write_text(json.dumps({
    'about': 'Board explorer data for boards.html, generated by tools/boards/chapter_data.py from boards.json and hotspots.json.',
    'mcuBlock': boards['mcu_block'], 'canBuses': boards['can_buses'], 'clientIds': boards['client_ids'],
    'boards': explorer}, indent=1, ensure_ascii=False))

# ------------------------------------------------------------------------------------------------ system diagram
# Orin-side users of the board topics. Each entry: (repo dir relative to ~/osu-uwrt/release, GitHub base, path, what).
# Only code that runs with today's stack: the diagnostics monitors (electrical_monitor, firmware_monitor, ...) and
# RViz panels are left out because the team no longer uses them.
GH = {
    'src/riptide_core': 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/',
    'src/riptide_control': 'https://github.com/osu-uwrt/riptide_control/blob/mpc/',
    'src/riptide_perception': 'https://github.com/osu-uwrt/riptide_perception/blob/mapping-estimator/',
    'src/riptide_autonomy': 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/',
    'nereus': 'https://github.com/osu-uwrt/nereus/blob/main/',
}
USERS = {
    'state/kill': [('src/riptide_control', 'riptide_mpc/src/mpc_controller_node.cpp', 'mpc_controller holds the thrusters at zero while killed'),
                   ('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: the enable / kill state in the command bar')],
    'command/software_kill': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: Enable and Kill (kill switch slot 1)')],
    'state/depth/raw': [('src/riptide_core', 'riptide_hardware/riptide_hardware2/depth_converter.py', 'depth_converter turns it into depth/pose for the EKF')],
    'command/led': [('src/riptide_autonomy', 'include/riptide_autonomy/autonomy_lib.hpp', 'mission tree status colours'),
                    ('src/riptide_perception', 'riptide_mapping/riptide_mapping2/mapping.py', 'mapping pulses the light on a detection'),
                    ('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: LED colour picker')],
    'command/electrical': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: Electrical panel (cycle computer, fans, LEDs, clear depth ...)')],
    'command/actuator/torpedo': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: Actuators panel'),
                                 ('src/riptide_core', 'riptide_hardware/riptide_hardware2/actuator_service_translator.py', 'turns the trees\' actuator services into these topics')],
    'state/actuator/status': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: Actuators panel')],
    'state/battery': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: PORT / STBD charge readings')],
    'ivc/tx': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: IVC panel')],
    'ivc/rx': [('nereus', 'content/viewer/talos_uwrt_panels.yaml', 'Nereus viewer: IVC panel')],
    'state/thrusters/rpm': [('src/riptide_control', 'riptide_mpc/src/pool_identify_node.cpp', 'pool_identify records it during system identification')],
    'state/thrusters/telemetry': [('src/riptide_control', 'riptide_mpc/src/pool_identify_node.cpp', 'pool_identify records it during system identification')],
}
users = {}
for topic, lst in USERS.items():
    users[topic] = []
    for repo, path, what in lst:
        f = REL / repo / path
        if not f.exists():
            raise SystemExit(f'missing {f}')
        text = f.read_text(errors='ignore')
        leaf = topic
        if leaf not in text and leaf.split('/')[-1] not in text:
            raise SystemExit(f'{topic} not mentioned in {f}')
        users[topic].append({'href': GH[repo] + path, 'file': path.split('/')[-1], 'what': what})

system = {
    'about': 'System diagram data for boards.html, generated by tools/boards/chapter_data.py.',
    'boards': {b['id']: {'name': b['name'], 'count': b['count'], 'can': b['can'], 'firmware': b['firmware'], 'ros': b['ros']}
               for b in explorer if b['ros']},
    'users': users,
    'thrusterFrames': {
        'text': 'mpc_controller sends each ESC board one 8-byte CAN frame per control tick: four signed 16-bit RPMs, big-endian, on CANmore utility channel 0. Thrusters 0-3 go to client 2, 4-7 to client 3.',
        'sender': 'https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_controllers/models/complete_system/send_thruster_cmd_canbus.c',
        'receiver': 'https://github.com/osu-uwrt/titan_firmware/blob/master/talos/ESCBoard/src/main.c#L131-L161',
    },
}
(DATA / 'system.json').write_text(json.dumps(system, indent=1, ensure_ascii=False))
print('explorer.json:', len(explorer), 'boards;', 'system.json:', len(users), 'topics with users')
