#!/usr/bin/env python3
"""Build public/data/boards/boards.json and power.json for the electrical/boards chapters.

Curated facts live in this file (each with a source link). Measured bits are merged in from:
  - $WORK/<id>.json         board size + footprint/net summary (tools/boards/convert_pcb.py)
  - $WORK/topics.json       ROS topics per firmware (tools/boards/firmware_topics.py)
Run:  WORK=/tmp/boards_work python3 tools/boards/build_data.py
"""
import json, os, pathlib

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
WORK = pathlib.Path(os.environ.get('WORK', '/tmp/boards_work'))
OUT = ROOT / 'public' / 'data' / 'boards'
MEDIA = '/talos-explained/media/boards/'

TF = 'https://github.com/osu-uwrt/titan_firmware/blob/master/'
CM = 'https://github.com/osu-uwrt/titan_canmore/blob/f6273e2c25f0202788be01e41338a6bbd6320006/'
EB = 'https://github.com/osu-uwrt/electric_boogaloo/blob/master/'
EBT = 'https://github.com/osu-uwrt/electric_boogaloo/tree/master/'
RC = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/'
REL = 'https://github.com/osu-uwrt/electric_boogaloo/releases/tag/'


def enc(p):
    return p.replace(' ', '%20')


topics = json.loads((WORK / 'topics.json').read_text()) if (WORK / 'topics.json').exists() else {}


def size(board_id):
    f = WORK / f'{board_id}.json'
    return json.loads(f.read_text())['size_mm'] if f.exists() else None


LANDSCAPE = {'ccbb', 'led', 'ivc'}
_hs = ROOT / 'public' / 'data' / 'boards' / 'hotspots.json'
HOTSPOT_IDS = set(json.loads(_hs.read_text())['boards']) if _hs.exists() else set()


def media(board_id, sch=()):
    m = {'top': MEDIA + f'{board_id}-top.webp', 'bottom': MEDIA + f'{board_id}-bottom.webp'}
    if board_id in LANDSCAPE:
        m['top_landscape'] = MEDIA + f'{board_id}-top-landscape.webp'
        m['bottom_landscape'] = MEDIA + f'{board_id}-bottom-landscape.webp'
    if board_id in HOTSPOT_IDS:
        m['hotspots'] = f'/talos-explained/data/boards/hotspots.json (boards.{board_id})'
    if sch:
        m['schematics'] = [{'src': MEDIA + f'{s}.webp', 'caption': c} for s, c in sch]
    return m


# ---------------------------------------------------------------------------------------------
# Shared pieces
# ---------------------------------------------------------------------------------------------
can_buses = [
    {
        'bus_id': 1, 'name': 'internal',
        'protocol': 'CAN FD', 'nominal_bps': 1_000_000, 'data_bps': 5_000_000,
        'orin_interface': 'can0',
        'members': ['poac', 'esc0', 'esc1', 'ccbb', 'led', 'ivc'],
        'agent': 'micro_ros_agent can -D can0 -m rmw (launched by riptide_hardware2 hardware.launch.py)',
        'sources': [TF + 'lib/titan_boards/include/robots/talos.h#L16-L21',
                    CM + 'canmore/include/canmore/client_ids.h',
                    RC + 'riptide_hardware/launch/copro_agent.launch.py'],
    },
    {
        'bus_id': 2, 'name': 'external',
        'protocol': 'classic CAN', 'nominal_bps': 250_000,
        'orin_interface': 'can1 (inferred: the AGX breakout has two CAN transceivers, can0 and can1)',
        'members': ['sbh_mcu (port)', 'sbh_mcu (stbd)'],
        'agent': 'The can1 agent entry in copro_agent.launch.py is commented out.',
        'sources': [TF + 'lib/titan_boards/include/robots/talos.h#L23-L25',
                    RC + 'riptide_hardware/launch/copro_agent.launch.py'],
    },
]

client_ids = {
    'internal': [
        {'id': 1, 'name': 'POWER_BOARD', 'used_by': 'POAC board (reuses the old power board ID)'},
        {'id': 2, 'name': 'ESC_BOARD0', 'used_by': 'ESC board 0 (thrusters 0-3)'},
        {'id': 3, 'name': 'ESC_BOARD1', 'used_by': 'ESC board 1 (thrusters 4-7)'},
        {'id': 4, 'name': 'CAMERA_CAGE_BB', 'used_by': 'Camera cage breakout board'},
        {'id': 5, 'name': 'ACTUATOR_BOARD', 'used_by': 'Mark 2 actuator board (retired on Talos; POAC took over)'},
        {'id': 6, 'name': 'LED_BOARD', 'used_by': 'LED board'},
        {'id': 7, 'name': 'SBC_BOARD', 'used_by': 'SBC board (board header only; no Talos firmware project)'},
        {'id': 8, 'name': 'IVC_BOARD', 'used_by': 'IVC board'},
    ],
    'external': [
        {'id': 1, 'name': 'SMART_BATERY_PORT', 'used_by': 'Smart battery housing (see note on IDs)'},
        {'id': 2, 'name': 'SMART_BATERY_STBD', 'used_by': 'Smart battery housing (see note on IDs)'},
        {'id': 6, 'name': 'DOWNWARDS_CAMERA', 'used_by': 'Old downwards camera (2023-24); Talos now uses a ZED X Mini'},
    ],
    'source': CM + 'canmore/include/canmore/client_ids.h',
}

mcu_block = {
    'name': 'RP2040 + CAN block',
    'summary': 'Every Talos board uses the same copy-pasted Altium device sheet: an RP2040, 16 MB flash, '
               'a 12 MHz crystal, a Tag-Connect SWD pad, reset/boot buttons, an RGB status LED, and an '
               'MCP2517FD SPI CAN FD controller with a TJA1442 transceiver and a slide switch for the 120 ohm '
               'termination (2 x 60.4 ohm, split).',
    'parts': [
        {'ref': 'U1R', 'part': 'RP2040', 'role': 'microcontroller (2 x Cortex-M0+)'},
        {'ref': 'U2R', 'part': 'W25Q128JVSIQ', 'role': '128 Mbit (16 MB) QSPI flash'},
        {'ref': 'Y1R', 'part': '12 MHz crystal', 'role': 'RP2040 clock'},
        {'ref': 'J1R', 'part': 'TC2030 Tag-Connect', 'role': 'SWD debug/programming'},
        {'ref': 'U1C', 'part': 'MCP2517FD', 'role': 'CAN FD controller on SPI0'},
        {'ref': 'U2C', 'part': 'TJA1442AT', 'role': 'CAN transceiver'},
        {'ref': 'SW1C', 'part': 'CAS-220TA DPDT slide switch', 'role': 'CAN termination on/off ("TERM ON" on the silk)'},
        {'ref': 'D1C', 'part': 'EAST1616RGBB4', 'role': 'RGB status LED (red = fault)'},
    ],
    'firmware_facts': [
        {'text': 'The RP2040 makes a 4 MHz clock from its 48 MHz USB clock on GPIO21 and feeds it to the '
                 'MCP2517FD, which multiplies it by 10 to 40 MHz. SPI runs at 20 MHz.',
         'source': TF + 'lib/driver_canbus/src/can_mcp251XFD.c#L54-L62'},
        {'text': 'Pin map shared by every board: CAN controller on SPI0 (nCS 17, SCK 18, MOSI 19, MISO 20), '
                 'clock out on 21, interrupt on 22, status LED on 13/14/15, debug UART TX on 16.',
         'source': TF + 'lib/titan_boards/include/boards/mk2/blocks/rp2040_can_block.h'},
        {'text': 'The termination switch state is read back through the controller (MCP2517FD_TERM_SENSE_ON_INT0).',
         'source': TF + 'lib/titan_boards/include/boards/mk2/blocks/rp2040_can_block.h'},
    ],
    'why': 'Mark 1 had I2C trouble over long wires (a 3 ft run to the depth sensor). Mark 2 put an RP2040 on '
           'every board and joined them with CAN instead of a shared I2C bus (story in the comments of '
           'tools/DeviceList.jsonc).',
    'why_source': TF + 'tools/DeviceList.jsonc',
    'design_sheet': EB + 'Device_Sheets/RP2040_with_CAN.SchDot',
    'media': {'schematic': MEDIA + 'rp2040-can-block.webp'},
}

# ---------------------------------------------------------------------------------------------
# Boards
# ---------------------------------------------------------------------------------------------
boards = []

boards.append({
    'id': 'poac',
    'name': 'POAC board',
    'aka': ['Power/Actuator board', 'PoActuator', 'Combined Power Actuator', 'Mark 2 Combined Power/Actuator Board'],
    'status': 'on-talos',
    'status_basis': 'confirmed: talos/PoacBoard firmware, DeviceList "Talos Poactuator Board", pretest_checks expects it at bus 1 id 1',
    'location': 'board stack (the port-side electronics housing holds the board stack, per the 2024 team website)',
    'purpose': 'Takes both batteries, ORs them into one bus, makes the 15 V, 5 V, 12 V and 3.3 V rails, '
               'switches thruster power with the kill switch, measures the rails, and drives the torpedo/marker servo.',
    'why': 'Combines the Mark 2 power board and actuator board into one board to free space in the housing '
           '(team website). It keeps the power board\'s CAN ID 1, so software that looks for "the power board" still finds it.',
    'mcu': 'RP2040 (shared RP2040 + CAN block)',
    'key_ics': [
        {'ref': 'PS1', 'part': 'TDK-Lambda i6A4W020A033V-001-R', 'role': '15 V rail. Non-isolated DC-DC module, 9-53 V in, 3.3-15 V out, 20 A (trim R12 = 1.24 k)'},
        {'ref': 'PS2', 'part': 'TDK-Lambda i6A4W020A033V-001-R', 'role': '5 V rail, same module (trim R13 = 8.56 k)'},
        {'ref': 'U2', 'part': 'MIC29300-12WU', 'role': '3 A LDO, 15 V -> 12 V for the servo output'},
        {'ref': 'U3', 'part': 'LM1117-3.3', 'role': '800 mA LDO, 5 V -> 3.3 V for the RP2040 block'},
        {'ref': 'U4, U6', 'part': 'LTC4412 + 2 x SiR167DP each', 'role': 'ideal-diode OR controllers: port and starboard battery onto V+ ("battery balancer" on the schematic)'},
        {'ref': 'U5', 'part': 'MBRB2545CT', 'role': 'Schottky diode, V+ -> Vreg (the regulators\' input)'},
        {'ref': 'Q2-Q4', 'part': '3 x SiR167DP (P-ch 30 V 60 A)', 'role': 'kill switch: V+ -> MOTOR_PWR (thruster power)'},
        {'ref': 'U10-U12', 'part': '3 x TC4432', 'role': 'gate drivers for Q2-Q4'},
        {'ref': 'U13', 'part': 'DG448', 'role': 'analog switch: the RP2040 SOFTWARE_KILL line can break the kill switch signal'},
        {'ref': 'U7', 'part': 'MCP3428', 'role': '16-bit 4-channel ADC on I2C (0x68): 3V3, Vreg, 15V, 5V'},
        {'ref': 'U1', 'part': 'SHT41', 'role': 'temperature + humidity'},
        {'ref': 'U8', 'part': 'TXB0102', 'role': '3.3 V <-> 5 V level shifter for the servo data line'},
        {'ref': 'Q5/Q6', 'part': 'FDD4141 + PMV13XN', 'role': 'fan switch (5 V)'},
    ],
    'connectors': [
        {'ref': 'J3', 'type': 'Anderson PP45 2x2', 'label': 'PORT BATTERY', 'carries': 'VPORT, GND'},
        {'ref': 'J4', 'type': 'Anderson PP45 2x2', 'label': 'STBD BATTERY', 'carries': 'VSTBD, GND'},
        {'ref': 'J7, J8', 'type': 'Redcube M4 85 A terminal', 'label': 'ESC PWR', 'carries': 'MOTOR_PWR (switched by the kill circuit)'},
        {'ref': 'J9, J10', 'type': 'Redcube M4 85 A terminal', 'label': 'ESC GND', 'carries': 'GND'},
        {'ref': 'J5', 'type': 'Molex Mini-Fit Jr 6-pin', 'label': 'STACK LINK', 'carries': 'CANL, GND, V+, CANH, 5V, 15V'},
        {'ref': 'J6', 'type': 'Molex Mini-Fit Jr 8-pin', 'label': 'CAMERA CAGE', 'carries': 'CANL, GND x3, CANH, 5V, 15V x2'},
        {'ref': 'J1', 'type': 'Molex Mini-Fit Jr 4-pin', 'label': 'KILL / AUX', 'carries': 'GND, GND, KILL_SWITCH, AUX_SWITCH'},
        {'ref': 'LID_CONN1', 'type': 'Molex Mini-Fit Jr 4-pin', 'label': 'LID_CONN', 'carries': 'GND, 12V, ACT_PWM_5V (servo data), ACT_CHECK_5V'},
        {'ref': 'J11', 'type': 'JST XH 3-pin', 'label': 'FAN', 'carries': 'FAN_TACH, FAN_PWR, GND'},
        {'ref': 'J2', 'type': 'micro-USB', 'label': '', 'carries': 'RP2040 USB'},
    ],
    'power': {
        'inputs': ['port battery (J3)', 'starboard battery (J4)'],
        'makes': ['V+ (battery bus, after ideal-diode OR)', 'MOTOR_PWR (V+ through the kill switch)', 'Vreg', '15V', '12V', '5V', '3V3'],
        'feeds': ['ESC boards (MOTOR_PWR)', 'stack link (V+, 15V, 5V)', 'camera cage (15V, 5V)', 'servo on the lid (12V)', 'fan (5V)'],
    },
    'firmware': {
        'project': 'talos/PoacBoard', 'url': TF + 'talos/PoacBoard',
        'pico_board': 'talos/poac_board', 'board_header': TF + 'lib/titan_boards/include/boards/talos/poac_board.h',
        'facts': [
            {'text': 'Reads the physical kill switch on GPIO1 (interrupt on both edges) and drives SOFTWARE_KILL on GPIO2. '
                     'GPIO2 starts in the kill state before safety is up.',
             'source': TF + 'talos/PoacBoard/src/safety_interface.c'},
            {'text': 'Publishes state/kill every 150 ms and state/electrical every 1 s.', 'source': TF + 'talos/PoacBoard/src/main.c'},
            {'text': 'state/electrical: three_volt (ADC ch1, 10k/10k divider), balanced (ch2 = Vreg, 10k/1k), '
                     'twelve_volt (ch3, which is wired to the 15 V rail), five_volt (ch4); port/stbd_powering from the LTC4412 STAT pins. '
                     'port_voltage and stbd_voltage are sent as 0.',
             'source': TF + 'talos/PoacBoard/src/ros.c#L133-L157'},
            {'text': 'Turns the fan on at boot; command/electrical ENABLE_FANS / DISABLE_FANS switches it.', 'source': TF + 'talos/PoacBoard/src/ros.c'},
            {'text': 'Drives one Hiwonder bus servo (half-duplex UART at 115200 baud from a PIO state machine on GPIO27) '
                     'that indexes 2 torpedoes (240 and 200 deg) and 2 markers (0 and 50 deg). Firing is refused while killed or not armed.',
             'source': TF + 'talos/PoacBoard/src/actuators/ros_torp.c'},
        ],
    },
    'ros': topics.get('PoacBoard'),
    'can': {'bus': 'internal', 'client_id': 1, 'id_name': 'CANMORE_CLIENT_ID_POWER_BOARD'},
    'revision': {
        'design': EB + enc('TalosBoards/Year One/PoActuator/Combined_Power_Actuator/PoactuatorPCB4.PcbDoc'),
        'project': EBT + enc('TalosBoards/Year One/PoActuator/Combined_Power_Actuator'),
        'schematic_pdf': REL + 'talos_boards',
        'notes': 'Project PCB is PoactuatorPCB4 (ECO logs Jan 2024; PDF in the 2023-24 board-order release, Feb 2024). '
                 'Last commit 2026-02-18: "poactuator fix to create separate output for servo 12V". '
                 'Project title/revision fields are still the template placeholders, so no revision number.',
    },
    'size_mm': size('poac'),
    'media': media('poac', [('poac-sch-kill-switch', 'Kill switch circuit'),
                            ('poac-sch-battery-or', 'Port battery ideal-diode OR ("battery balancer")'),
                            ('poac-sch-regulators', '15 V and 5 V regulators'),
                            ('poac-sch-power-page', 'Whole power sheet')]),
})

boards.append({
    'id': 'esc',
    'name': 'ESC board',
    'count': 2,
    'aka': ['ESC MK II'],
    'status': 'on-talos',
    'status_basis': 'confirmed: talos/ESCBoard firmware, CAN IDs 2 and 3, pretest_checks expects both',
    'location': 'board stack',
    'purpose': 'Carries four APD 80F3 ESCs and talks to them with bidirectional DShot. Two identical boards drive the 8 thrusters.',
    'why': 'Bidirectional DShot gives RPM feedback on the same wire as the command. The APD firmware had no 3D (reversible) '
           'DShot mode, so the team patched the ESC firmware to add it.',
    'why_source': TF + 'talos/ESCBoard/esc_firmware_patching/README.md',
    'mcu': 'RP2040 (shared RP2040 + CAN block)',
    'key_ics': [
        {'ref': 'M1-M4', 'part': 'APD 80F3[X] ESC', 'role': 'brushless ESC, 15-35 V, 80 A (schematic part description)'},
        {'ref': 'F1-F4', 'part': 'Bel Fuse 0685H9150-01', 'role': '15 A fast fuse, one per ESC'},
        {'ref': 'F5', 'part': 'Eaton 1245HC60', 'role': '60 A fuse on the board input'},
        {'ref': 'Q1, Q2', 'part': '2 x SiR167DP (P-ch 30 V 60 A)', 'role': 'reverse-voltage protection'},
        {'ref': 'U1', 'part': 'LM1117-3.3', 'role': '5 V -> 3.3 V'},
        {'ref': 'R3/R4', 'part': '10k / 1k divider', 'role': 'VCC_MEAS: thruster supply voltage into the RP2040 ADC'},
    ],
    'connectors': [
        {'ref': 'J1, J2', 'type': 'Redcube M4 85 A terminal', 'label': 'ESC V+', 'carries': 'VIN (thruster power from the POAC)'},
        {'ref': 'J3, J4', 'type': 'Redcube M4 85 A terminal', 'label': 'ESC GND', 'carries': 'GND'},
        {'ref': 'J5', 'type': 'Molex Mini-Fit Jr 12-pin', 'label': 'Thruster SubConn', 'carries': '3 motor phases x 4 ESCs'},
        {'ref': 'J6', 'type': 'Molex Mini-Fit Jr 6-pin', 'label': 'ESC Stack Link', 'carries': 'GND, CANL x2, 5V, CANH x2'},
        {'ref': 'J7-J10', 'type': '4-pin 2.54 mm header', 'label': 'FLASH CONN', 'carries': '5V, RX, TX, GND to each ESC (for the APD configurator)'},
        {'ref': 'J12', 'type': '2x5 2.54 mm header', 'label': 'breakout', 'carries': 'PWM (DShot) and telemetry lines of all four ESCs'},
        {'ref': 'SB1', 'type': 'solder jumper', 'label': 'Board ID Jumper', 'carries': 'unpopulated = ID 0 (thrusters 0-3), populated = ID 1 (thrusters 4-7)'},
        {'ref': 'J11', 'type': 'micro-USB', 'label': '', 'carries': 'RP2040 USB'},
    ],
    'power': {'inputs': ['MOTOR_PWR from the POAC (J1/J2)', '5V from the stack link (J6)'],
              'makes': ['VCC (after reverse protection + 60 A fuse)', '3V3'],
              'feeds': ['4 ESCs through 15 A fuses']},
    'firmware': {
        'project': 'talos/ESCBoard', 'url': TF + 'talos/ESCBoard',
        'pico_board': 'mk2/esc_board', 'board_header': TF + 'lib/titan_boards/include/boards/mk2/esc_board.h',
        'facts': [
            {'text': 'DShot600, bidirectional, from PIO0; ESC UART telemetry read by PIO1.', 'source': TF + 'talos/ESCBoard/include/dshot.h#L32'},
            {'text': 'Thrusters are held off for 5 s after ESC power appears (ESC_POWERUP_DELAY_MS 5000).', 'source': TF + 'talos/ESCBoard/include/dshot.h#L29'},
            {'text': 'If no new RPM command arrives within 500 ms the thrusters stop, and stay off for 1 s.', 'source': TF + 'talos/ESCBoard/include/dshot.h#L22-L26'},
            {'text': 'ESC power counts as on above 9 V on VCC_MEAS.', 'source': TF + 'talos/ESCBoard/include/dshot.h#L39'},
            {'text': 'Core 1 runs the RPM controller; disabled_flags explain why it is off: SAFETY_KILLED, ESC_BOARD_OFF, '
                     'ESC_POWERON_DELAY, TGT_RPM_STALE, TGT_RPM_STALE_PENALTY, CONTROLLER_UNCONFIGURED.',
             'source': TF + 'talos/ESCBoard/include/core1.h'},
            {'text': 'The board reads the ID jumper on GPIO29 at boot: 0 -> CAN client 2, 1 -> CAN client 3.', 'source': TF + 'talos/ESCBoard/src/main.c#L47'},
            {'text': 'Uses 7 pole pairs to turn electrical RPM into shaft RPM.', 'source': TF + 'talos/ESCBoard/include/dshot.h'},
        ],
    },
    'ros': topics.get('ESCBoard'),
    'can': {'bus': 'internal', 'client_id': [2, 3], 'id_name': 'CANMORE_CLIENT_ID_ESC_BOARD0 / ESC_BOARD1'},
    'revision': {
        'design': EB + enc('TempestBoards/MK2/ESC/ESC.PcbDoc_Large.PcbDoc'),
        'project': EBT + 'TempestBoards/MK2/ESC',
        'project_revision': '1.1', 'design_review': '01/08/2023', 'team_lead': 'Robert Pafford',
        'schematic_pdf': REL + 'Tempest_mk_2',
        'notes': 'Designed for Tempest Mark 2 (Jan 2023) and reused on Talos. The repo has later edits '
                 '(Oct-Dec 2025: "ESC Voltage protector", traces); unconfirmed whether the boards in Talos were rebuilt.',
    },
    'size_mm': size('esc'),
    'media': media('esc', [('esc-sch-blocks', 'Block-level sheet'),
                           ('esc-sch-reverse-protection', 'Reverse-voltage protection')]),
})

boards.append({
    'id': 'ccbb',
    'name': 'Camera cage breakout board',
    'aka': ['CCBB', 'Camera Cage BB MK II'],
    'status': 'on-talos',
    'status_basis': 'confirmed: talos/CameraCageBB firmware, CAN ID 4, pretest_checks expects it',
    'location': 'camera cage (the computer side, with the Orin)',
    'purpose': 'Power and I/O hub of the camera cage: switches Orin power, reads the depth sensor, '
               'runs fans and the RGB status strip, injects power into the DVL Ethernet cable, and joins the Orin to both CAN buses.',
    'mcu': 'RP2040 (shared RP2040 + CAN block)',
    'key_ics': [
        {'ref': 'Q6', 'part': 'FDD4141 (P-ch)', 'role': 'Orin power switch, 15 V (ORIN_SW, GPIO6)'},
        {'ref': 'Q1', 'part': 'FDD4141 (P-ch)', 'role': 'Peltier switch, 15 V (PELT_SW, GPIO5)'},
        {'ref': 'Q4', 'part': 'TSM500P02CX (P-ch)', 'role': 'fan switch, 5 V (FAN_SW, GPIO0)'},
        {'ref': 'Q3', 'part': 'SiR167DP (P-ch)', 'role': 'reverse-polarity protection on the 15 V input'},
        {'ref': 'U1', 'part': 'LM1117-3.3', 'role': '5 V -> 3.3 V'},
        {'ref': 'U2', 'part': 'SHT41', 'role': 'temperature + humidity'},
    ],
    'connectors': [
        {'ref': 'J6', 'type': 'Mini-Fit Jr 8-pin', 'label': 'CAM CAGE (from POAC)', 'carries': 'internal CAN, 5V, 15V'},
        {'ref': 'J17', 'type': 'Mini-Fit Jr 4-pin', 'label': 'ORIN', 'carries': 'switched 15 V Orin power'},
        {'ref': 'J10', 'type': 'JST XH 5-pin', 'label': 'ORIN CAN', 'carries': 'external CAN H/L, GND, internal CAN H/L (to the Orin)'},
        {'ref': 'J1, J5', 'type': 'Mini-Fit Jr 4-pin', 'label': 'EXT. CAN', 'carries': 'external CAN + 15V'},
        {'ref': 'J14', 'type': 'RJ45 (Wurth WR-MJ)', 'label': 'DVL SUBCONN', 'carries': 'DVL Ethernet pairs + 15V/GND on pins 7-8 ("Ethernet Power Injection")'},
        {'ref': 'J13', 'type': 'RJ45 (Wurth WR-MJ)', 'label': 'DVL | SWITCH', 'carries': 'the same Ethernet pairs, on to the network switch (no power)'},
        {'ref': 'J16', 'type': 'Mini-Fit Jr 2-pin', 'label': 'SWITCH', 'carries': '5V for the network switch ("Network Switch Power")'},
        {'ref': 'J15', 'type': 'JST GH 4-pin', 'label': 'depth sensor', 'carries': '5V, SCL, SDA, GND'},
        {'ref': 'J18', 'type': '4-pin header', 'label': 'Depth Backup', 'carries': '5V, SCL, SDA, GND'},
        {'ref': 'J3', 'type': 'Mini-Fit Jr 2-pin', 'label': 'PELTIER', 'carries': 'switched 15V'},
        {'ref': 'J2, J4, J7, J8', 'type': 'JST XH 3-pin', 'label': 'FAN 1-4', 'carries': 'GND, FAN_PWR (5V), tach'},
        {'ref': 'J9', 'type': 'JST XH 3-pin', 'label': 'LED STRIP', 'carries': '5V, RGB_DATA, GND'},
        {'ref': 'J11', 'type': 'Mini-Fit Jr 4-pin vertical', 'label': 'EXTRA POWER', 'carries': '3V3, 5V, 15V, GND'},
        {'ref': 'J12', 'type': 'micro-USB', 'label': '', 'carries': 'RP2040 USB'},
    ],
    'power': {'inputs': ['15V and 5V from the POAC (J6)'],
              'makes': ['3V3'],
              'feeds': ['Orin (15V, switched)', 'DVL (15V via Ethernet power injection)', 'network switch (5V)',
                        'Peltier (15V, switched)', 'fans (5V, switched)', 'depth sensor (5V)', 'RGB strip (5V)', 'external CAN devices (15V)']},
    'firmware': {
        'project': 'talos/CameraCageBB', 'url': TF + 'talos/CameraCageBB',
        'pico_board': 'mk2/camera_cage_bb', 'board_header': TF + 'lib/titan_boards/include/boards/mk2/camera_cage_bb.h',
        'facts': [
            {'text': 'Reads the depth sensor as an MS5837-02BA on I2C (200 kHz) and publishes state/depth/raw in frame talos/pressure_link.',
             'source': TF + 'talos/CameraCageBB/src/main.c'},
            {'text': 'Turns the Orin switch and the fans on at boot.', 'source': TF + 'talos/CameraCageBB/src/main.c'},
            {'text': 'Drives the RGB status strip from PIO0; command/led messages with the CCB target bit set it.', 'source': TF + 'talos/CameraCageBB/src/ros.c'},
            {'text': 'Still creates a state/leak publisher, but its periodic publish is commented out. The team no longer uses the leak sensor.',
             'source': TF + 'talos/CameraCageBB/src/main.c'},
        ],
    },
    'ros': topics.get('CameraCageBB'),
    'can': {'bus': 'internal', 'client_id': 4, 'id_name': 'CANMORE_CLIENT_ID_CAMERA_CAGE_BB'},
    'links': ['Bridges both CAN buses to the Orin (J10)', 'External CAN out (J1, J5)'],
    'revision': {
        'design': EB + 'TempestBoards/MK2/CameraCageBB/CameraCageBB.PcbDoc',
        'project': EBT + 'TempestBoards/MK2/CameraCageBB',
        'project_revision': '1.1', 'design_review': '1/10/2023', 'team_lead': 'Robert Pafford',
        'schematic_pdf': REL + 'Tempest_mk_2',
        'notes': 'Mark 2 design (Jan 2023). Last commit 2024-11-10 "Added connectors and LDOs".',
    },
    'size_mm': size('ccbb'),
    'media': media('ccbb'),
})

boards.append({
    'id': 'led',
    'name': 'LED board',
    'aka': ['LED Control'],
    'status': 'on-talos',
    'status_basis': 'confirmed: talos/LEDBoard firmware, CAN ID 6, pretest_checks expects it. '
                    'The Year One design matches the firmware pin map (2 drivers, CONN_CHK, TEMP_SENSE); '
                    'the Year Two LED_Board (5 drivers + analog mux) is not supported by the current firmware.',
    'location': 'board stack',
    'purpose': 'Drives the vehicle light (an RGBW LED module) with two buck LED drivers; used for status signalling.',
    'mcu': 'RP2040 (shared RP2040 + CAN block)',
    'key_ics': [
        {'ref': 'U1, U2', 'part': '2 x ST L99LD20', 'role': 'SPI-controlled buck LED drivers (1.5 A), 2 channels each = R, G, B, W'},
        {'ref': 'L1-L4', 'part': 'SRR1280-221K', 'role': '220 uH buck inductors'},
        {'ref': 'U3', 'part': 'LM1117-3.3', 'role': '5 V -> 3.3 V'},
    ],
    'connectors': [
        {'ref': 'J1', 'type': 'Samtec LS2 10-pin', 'label': 'LED module', 'carries': 'R/G/B/W anodes, GND, Temp_Sense (NTC), Conn CHK'},
        {'ref': 'J2', 'type': 'Mini-Fit Jr 6-pin', 'label': 'stack link', 'carries': 'CANL, GND, V+, CANH, 5V'},
        {'ref': 'J3', 'type': 'micro-USB', 'label': '', 'carries': 'RP2040 USB'},
    ],
    'power': {'inputs': ['V+ and 5V from the stack link'], 'makes': ['3V3'], 'feeds': ['LED module (from V+ through the drivers)']},
    'firmware': {
        'project': 'talos/LEDBoard', 'url': TF + 'talos/LEDBoard',
        'pico_board': 'talos/led_board', 'board_header': TF + 'lib/titan_boards/include/boards/talos/led_board.h',
        'facts': [
            {'text': 'Subscribes to state/depth/raw and scales brightness with depth; also has temperature protection '
                     '(commit history, Oct-Nov 2024).', 'source': TF + 'talos/LEDBoard'},
            {'text': 'Peak current set to 45 (driver register units, "see LED controller datasheet").', 'source': TF + 'talos/LEDBoard/src/ledc_driver.c'},
        ],
    },
    'ros': topics.get('LEDBoard'),
    'can': {'bus': 'internal', 'client_id': 6, 'id_name': 'CANMORE_CLIENT_ID_LED_BOARD'},
    'revision': {
        'design': EB + enc('TalosBoards/Year One/LED_Board/LED_Control.PcbDoc'),
        'project': EBT + enc('TalosBoards/Year One/LED_Board'),
        'schematic_pdf': REL + 'talos_boards',
        'notes': 'Year One (2023-24) design; template placeholders for title/revision. A Year Two redesign '
                 '(TalosBoards/Year Two/LED_Board, 5 drivers) exists in the repo.',
    },
    'size_mm': size('led'),
    'media': media('led'),
})

boards.append({
    'id': 'led_module',
    'name': 'LED module (aluminium)',
    'status': 'on-talos (inferred)',
    'status_basis': 'inferred: in the 2023-24 Talos board-order release next to the LED board; the LED board connector carries R/G/B/W + an NTC like this module',
    'purpose': 'Aluminium-core LED board with four RGBW LEDs and a 22 k NTC thermistor, driven by the LED board.',
    'mcu': None,
    'key_ics': [
        {'ref': 'D1-D4 (4 x)', 'part': 'OSRAM LE RTDUW S2WM', 'role': 'RGBW LED'},
        {'ref': 'U1', 'part': 'NTCS0603E3223FMT', 'role': '22 k NTC thermistor (Temp_Sense)'},
    ],
    'revision': {'design': EB + enc('TalosBoards/Year One/LED_aluminum/LED_aluminum/LED_Al.PcbDoc'),
                 'project_title': 'LED Aluminum', 'team_lead': 'Sam Tomlinson', 'schematic_pdf': REL + 'talos_boards'},
    'size_mm': size('led_module'),
    'media': media('led_module'),
})

boards.append({
    'id': 'ivc',
    'name': 'IVC board',
    'aka': ['Inter-Vehicle Communication board'],
    'status': 'on-talos',
    'status_basis': 'confirmed: talos/IVCBoard firmware, CAN ID 8, DeviceList "Talos IVC Board", pretest_checks expects it',
    'location': 'board stack',
    'purpose': 'Acoustic modem for talking to the second vehicle: drives a transducer and listens on a hydrophone. '
               'Also has a Bluetooth audio module that can play sound through the transducer.',
    'mcu': 'RP2040 (shared RP2040 + CAN block)',
    'key_ics': [
        {'ref': 'U6', 'part': 'TRACO THN 15-2425N', 'role': 'isolated DC-DC, V+ -> +/-24 V for the power amplifier (fused 1.5 A, F1)'},
        {'ref': 'U2', 'part': 'OPA548', 'role': 'power op-amp driving the transducer'},
        {'ref': 'U9', 'part': 'OPA604', 'role': 'signal amplifier'},
        {'ref': 'U1', 'part': 'OPA1664', 'role': 'transmit low-pass filter'},
        {'ref': 'U8', 'part': 'AM1DS-0505DH30', 'role': 'isolated 5 V -> +/-5 V for the receive chain'},
        {'ref': 'U13-U16', 'part': 'OPA228 + 3 x OPA2889', 'role': 'hydrophone receive amplifier/filter'},
        {'ref': 'U11, U12', 'part': 'MAX4520', 'role': 'selects RP2040 signal or Bluetooth audio for transmit'},
        {'ref': 'U17', 'part': 'Microchip BM83', 'role': 'Bluetooth 5.0 audio module'},
        {'ref': 'U7', 'part': 'LM1117-3.3', 'role': '5 V -> 3.3 V'},
    ],
    'connectors': [
        {'ref': 'J1', 'type': 'Mini-Fit Jr 4-pin', 'label': 'ACOUSTICS INTERCONNECT', 'carries': 'TransducerOut, HydrophoneIn, GND'},
        {'ref': 'J2', 'type': 'Mini-Fit Jr 6-pin', 'label': 'STACK LINK', 'carries': 'CAN, GND, V+, 5V'},
        {'ref': 'J5', 'type': 'Mini-Fit Jr 4-pin', 'label': 'HYD (backup hydrophone)', 'carries': '+5, -5, HydrophoneIn, GND'},
        {'ref': 'J3', 'type': 'micro-USB', 'label': 'RP2040', 'carries': 'RP2040 USB'},
        {'ref': 'J4', 'type': 'micro-USB', 'label': '', 'carries': 'BM83 USB'},
    ],
    'power': {'inputs': ['V+ and 5V from the stack link'], 'makes': ['+/-24 V', '+/-5 V', '3V3'], 'feeds': ['transducer', 'hydrophone preamp']},
    'firmware': {
        'project': 'talos/IVCBoard', 'url': TF + 'talos/IVCBoard',
        'pico_board': 'talos/ivc_board', 'board_header': TF + 'lib/titan_boards/include/boards/talos/ivc_board.h',
        'facts': [
            {'text': 'Two-tone FSK: 17 kHz and 19 kHz, 50 ms per symbol; packets are 8 data bits + a 4-bit CRC.',
             'source': TF + 'talos/IVCBoard/src/ivc.c#L17-L26'},
            {'text': 'Receive uses an FFT (kiss FFT) on the ADC samples.', 'source': TF + 'talos/IVCBoard/src/ivc.c'},
            {'text': 'Schematic note: "Populate SB5 0 ohm for Lil\' Boat, DNP for Talos". The firmware picks its Talos '
                     'thresholds when GPIO6 (BOARD_ID_PIN) reads low.', 'source': TF + 'talos/IVCBoard/src/ivc.c'},
        ],
    },
    'ros': topics.get('IVCBoard'),
    'can': {'bus': 'internal', 'client_id': 8, 'id_name': 'CANMORE_CLIENT_ID_IVC_BOARD'},
    'revision': {
        'design': EB + enc('TalosBoards/Year Two/IVC/IvcBoard.PcbDoc'),
        'project': EBT + enc('TalosBoards/Year Two/IVC'),
        'project_title': 'IVC Board', 'project_revision': '1.0', 'team_lead': 'John Ulm',
        'schematic_pdf': REL + 'ssfb_boards',
        'notes': 'Designed Mar-Apr 2025 ("ivc board ready to go out confirmed" 2025-03-19, "fixed opa548 lead mix-up" 2025-04-06).',
    },
    'size_mm': size('ivc'),
    'media': media('ivc', [('ivc-sch-top', 'Top-level block sheet'), ('ivc-sch-transmit', 'Transmit chain')]),
})

boards.append({
    'id': 'sbh_mcu',
    'name': 'Smart battery housing MCU board',
    'count': 2,
    'aka': ['SBH MCU'],
    'status': 'on-talos',
    'status_basis': 'confirmed: talos/SmartBattery firmware; pretest_checks expects two housings on the external bus when running on batteries',
    'location': 'inside each battery housing (port and starboard)',
    'purpose': 'Reads the battery management chip, shows status on a small OLED, and reports the pack over the external CAN bus.',
    'mcu': 'RP2040 (shared RP2040 + CAN block)',
    'key_ics': [
        {'ref': 'U1', 'part': 'TS30041-M050', 'role': 'buck, battery -> 5 V'},
        {'ref': 'U2', 'part': 'XC9236A33', 'role': 'buck, 5 V -> 3.3 V'},
        {'ref': 'Q1-Q4', 'part': 'DMP3056L + 3 x AO3404A', 'role': 'soft power latch: reed switch, PWR_CTRL (MCU holds itself on) or PACK_PWR turns the board on'},
        {'ref': 'S1', 'part': 'reed switch', 'role': 'magnet-operated power button through the sealed housing'},
        {'ref': 'DS1', 'part': '0.91" 128x32 I2C OLED', 'role': 'status display'},
        {'ref': 'U3', 'part': 'SHT41', 'role': 'temperature + humidity'},
    ],
    'connectors': [
        {'ref': 'J1', 'type': 'Molex Milli-Grid 8-pin', 'label': 'to BMS board', 'carries': 'CANL, CANH, BMS SCL/SDA, BMS_WAKE, GND, PACK_PWR, VBAT'},
        {'ref': 'J2', 'type': 'micro-USB', 'label': '', 'carries': 'RP2040 USB'},
    ],
    'firmware': {
        'project': 'talos/SmartBattery', 'url': TF + 'talos/SmartBattery',
        'pico_board': 'mk2/sbh_mcu', 'board_header': TF + 'lib/titan_boards/include/boards/mk2/sbh_mcu.h',
        'facts': [
            {'text': 'Talks SMBus to the BQ40Z80 from a PIO state machine (the BMS I2C pins are swapped relative to the RP2040 pin mux).',
             'source': TF + 'lib/titan_boards/include/boards/mk2/sbh_mcu.h'},
            {'text': 'Its CAN client ID is the housing serial number stored in flash at 0x101FF000 (housings #1-#5 in DeviceList), '
                     'not the PORT/STBD constants; port vs starboard is reported in BatteryStatus.detect.',
             'source': TF + 'talos/SmartBattery/src/main.c#L200'},
            {'text': 'Switches itself off when the pack is idle and the display is off.', 'source': TF + 'talos/SmartBattery/src/main.c'},
            {'text': 'The leak-triggered emergency power cut is commented out ("once leak false positives are fixed").',
             'source': TF + 'talos/SmartBattery/src/ros.c'},
        ],
    },
    'ros': topics.get('SmartBattery'),
    'can': {'bus': 'external', 'client_id': 'housing serial number (see firmware facts)', 'id_name': 'CANMORE_CLIENT_ID_SMART_BATERY_PORT / STBD are defined but not used by this firmware'},
    'revision': {
        'design': EB + 'TempestBoards/MK2/SBH_MCU/SBH_MCU.PcbDoc',
        'project': EBT + 'TempestBoards/MK2/SBH_MCU',
        'project_title': 'Smart Battery Housing | MCU', 'project_revision': '1.1', 'design_review': '01/09/2023', 'team_lead': 'Robert Pafford',
        'schematic_pdf': REL + 'Tempest_mk_2',
    },
    'size_mm': size('sbh_mcu'),
    'media': media('sbh_mcu'),
})

boards.append({
    'id': 'sbh_bms',
    'name': 'Smart battery housing BMS board',
    'count': 2,
    'aka': ['SBH BMS'],
    'status': 'on-talos',
    'status_basis': 'confirmed as the partner of the SBH MCU board (SmartBattery firmware reads a BQ40Z80)',
    'location': 'inside each battery housing',
    'purpose': 'Battery management: cell monitoring and balancing, protection FETs, a 45 A protector fuse and the pack terminals.',
    'mcu': None,
    'key_ics': [
        {'ref': 'U2', 'part': 'TI BQ40Z80', 'role': 'battery management / gas gauge'},
        {'ref': 'Q1, Q2', 'part': '2 x PSMN4R4-80BS (N-ch 80 V 100 A)', 'role': 'charge/discharge protection FETs'},
        {'ref': 'F1', 'part': 'Littelfuse ITV9550L2045MR', 'role': '45 A self-control protector'},
        {'ref': 'U1', 'part': 'MAX4520', 'role': 'wake switch'},
    ],
    'connectors': [
        {'ref': 'J2-J5', 'type': 'Redcube M4 85 A terminals', 'label': 'Pack+, Pack-, BAT-, Pack_in+', 'carries': 'cell stack and pack output'},
        {'ref': 'J6', 'type': 'JST XH 6-pin', 'label': 'balance', 'carries': 'cell taps (5 cells)'},
        {'ref': 'J7, J8', 'type': 'JST GH 2-pin', 'label': 'thermistors', 'carries': 'pack temperature'},
        {'ref': 'J1', 'type': 'Mini-Fit Jr 6-pin vertical', 'label': 'external', 'carries': 'CAN H/L, Pack- , Pack+ (5 A fuse), Side_Detection, Detect'},
        {'ref': 'J10', 'type': 'Milli-Grid 8-pin', 'label': 'to MCU board', 'carries': 'CAN, SMBus, Wake, BAT-, BAT+'},
    ],
    'battery': {
        'cells_in_series': 5,
        'cells_source': TF + 'talos/SmartBattery/bq40z80_files/chemistry_identification/config.txt',
        'cell_protection_mV': {'under_voltage': 3000, 'over_voltage': 4200},
        'discharge_overcurrent_mA': {'OCD1': 11250, 'OCD2': 20000},
        'protection_source': TF + 'talos/SmartBattery/bq40z80_files/sbh_bms_config.gg.csv',
        'note': 'Values from the BQ40Z80 gas-gauge config file in the repo; unconfirmed that every pack runs exactly this file. '
                'The same file lists Design Capacity 2000 mAh, which may be a placeholder.',
    },
    'revision': {
        'design': EB + 'TempestBoards/MK2/SBH_BMS/SBM_BMS.PcbDoc',
        'project': EBT + 'TempestBoards/MK2/SBH_BMS',
        'project_title': 'Smart Battery Housing | BMS', 'project_revision': '1.1', 'team_lead': 'Robert Pafford',
        'schematic_pdf': REL + 'Tempest_mk_2',
        'notes': 'Updated 2026-02-15 ("previous versions did the current calculation slightly wrong").',
    },
    'size_mm': size('sbh_bms'),
    'media': media('sbh_bms'),
})

boards.append({
    'id': 'agx_breakout',
    'name': 'Jetson AGX breakout',
    'status': 'orin-side (inferred)',
    'status_basis': 'inferred: the team website lists a "CAN breakout board" on the Orin; this is the only Orin 40-pin board with two CAN transceivers. '
                    'Software opens the IMU on /dev/ttyTHS0 and the CAN agent on can0.',
    'location': 'on the Orin\'s 40-pin header',
    'purpose': 'Adds CAN transceivers for the Orin\'s two built-in CAN controllers (can0, can1) and an RS-232 port for the VectorNav IMU.',
    'mcu': None,
    'key_ics': [
        {'ref': 'U1, U2', 'part': '2 x TJA1442AT', 'role': 'CAN transceivers for can1 and can0, each with a termination switch'},
        {'ref': 'U3', 'part': 'SN65C3221E', 'role': 'RS-232 transceiver (IMU UART)'},
    ],
    'connectors': [
        {'ref': 'J3', 'type': '40-pin 0.1" receptacle', 'label': 'Orin header', 'carries': 'can0/can1 TX/RX, UART, 3V3, 5V'},
        {'ref': 'J1', 'type': 'JST XH 5-pin', 'label': 'CAN', 'carries': 'can1 H/L, GND, can0 H/L'},
        {'ref': 'J2', 'type': 'JST XH 4-pin', 'label': 'IMU', 'carries': '5V, RS-232 TX/RX, GND'},
    ],
    'revision': {
        'design': EB + 'TempestBoards/MK2/Jetson_AGX_Breakout/jetson_agx_breakout.PcbDoc',
        'project_title': 'Jetson AGX Breakout', 'project_revision': '1.0 (silk says REV 1.1.1; release agx_breakout_1_1_0 "Release 1.1.1")', 'design_review': '12/22/2022', 'team_lead': 'Robert Pafford',
        'notes': 'Latest commit 2026-09-24: "Deleted NMOS components so that pin 1 on J2 is always at 5V" (IMU power no longer switched).',
    },
    'size_mm': size('agx_breakout'),
    'media': media('agx_breakout'),
})

boards.append({
    'id': 'agx_m2',
    'name': 'Jetson AGX M.2 RS-422 card',
    'aka': ['FOG board'],
    'status': 'orin-side (inferred)',
    'status_basis': 'inferred: the team website lists an "RS 422 breakout board (Fiber Optic Gyro interface)"; '
                    'this M.2 card carries an RS-422 transceiver and a commit calls it the "FOG board". The gyro config uses /dev/ttyTHS2.',
    'location': 'Orin M.2 E-key slot',
    'purpose': 'Gives the Orin an RS-422 serial port and a 5 V supply for the fibre-optic gyro.',
    'mcu': None,
    'key_ics': [
        {'ref': 'U2', 'part': 'MaxLinear SP335E', 'role': 'RS-232/RS-422/RS-485 transceiver (RS-422 here)'},
        {'ref': 'U3', 'part': 'LM27313', 'role': 'boost, 3.3 V -> 8 V'},
        {'ref': 'U4', 'part': 'LP38693-5.0', 'role': 'LDO, 8 V -> 5 V for the gyro'},
        {'ref': 'U1', 'part': 'TLV70018', 'role': '1.8 V LDO for the transceiver logic side'},
    ],
    'connectors': [{'ref': 'J1', 'type': 'Molex 505567 7-pin', 'label': 'gyro', 'carries': '5V, GND, TX+/-, RX+/-'}],
    'revision': {'design': EB + enc('TalosBoards/Year One/Jetson_AGX_M.2/Jetson_AGX_M.2.PcbDoc'),
                 'notes': '2024-10-06 "Revert FOG board changes since it works as-is"; Nov-Dec 2025 commits add an SPI-to-RS422 variant (work in progress).',
                 'schematic_pdf': REL + 'talos_boards'},
    'size_mm': size('agx_m2'),
    'media': media('agx_m2'),
})

boards.append({
    'id': 'mk2_power',
    'name': 'Mark 2 power board (retired)',
    'status': 'retired',
    'status_basis': 'replaced by the POAC board (same CAN ID 1; talos/PowerBoard firmware still in the repo)',
    'purpose': 'Original Mark 2 power distribution: battery ORing, 15 V/5 V regulators, kill switch.',
    'firmware': {'project': 'talos/PowerBoard', 'url': TF + 'talos/PowerBoard', 'pico_board': 'mk2/power_board'},
    'revision': {'design': EB + 'TempestBoards/MK2/PowerBoard/MK2_PD.PcbDoc', 'project_revision': '1.1', 'schematic_pdf': REL + 'Tempest_mk_2'},
    'size_mm': size('mk2_power'),
    'media': media('mk2_power'),
})

boards.append({
    'id': 'mk2_actuator',
    'name': 'Mark 2 actuator board (retired)',
    'status': 'retired',
    'status_basis': 'its jobs moved to the POAC board; talos/Actuator firmware (CAN ID 5) still in the repo',
    'purpose': 'Old actuator board: claw motor driver (DRV8801), coil-gun style torpedo charging, droppers.',
    'firmware': {'project': 'talos/Actuator', 'url': TF + 'talos/Actuator', 'pico_board': 'mk2/actuator_board'},
    'revision': {'design': EB + 'TempestBoards/MK2/ActuatorMKII/ActuatorMKII.PcbDoc', 'project_revision': '1.1', 'schematic_pdf': REL + 'Tempest_mk_2'},
    'size_mm': size('mk2_actuator'),
    'media': media('mk2_actuator'),
})

boards_doc = {
    'generated': '2026-10-30',
    'about': 'Talos circuit boards: what each does, its parts, connectors, firmware and CAN identity. '
             'See docs/media/boards.md for sources and which facts are confirmed vs inferred.',
    'source_commits': {
        'electric_boogaloo': 'bf41bfe (master, 2026-10-04)',
        'titan_firmware': '058df2a (master); local checkout 39c07af',
        'titan_canmore': 'f6273e2',
        'riptide_core': 'followpath-speed 720bdd9',
    },
    'can_buses': can_buses,
    'client_ids': client_ids,
    'mcu_block': mcu_block,
    'boards': boards,
}

# ---------------------------------------------------------------------------------------------
# Power tree
# ---------------------------------------------------------------------------------------------
P = EB + enc('TalosBoards/Year One/PoActuator/Combined_Power_Actuator/')
power = {
    'generated': '2026-10-30',
    'about': 'Power tree from the batteries to the loads, as far as the board designs show. '
             'Each node has the board it lives on; edges carry the net name from the design. '
             '"confidence" is confirmed (seen in a schematic/netlist or code) or inferred.',
    'nodes': [
        {'id': 'bat_port', 'label': 'Port battery', 'kind': 'battery', 'board': 'sbh_bms',
         'detail': '5 Li-ion cells in series (BQ40Z80 config), 45 A protector fuse', 'confidence': 'confirmed'},
        {'id': 'bat_stbd', 'label': 'Starboard battery', 'kind': 'battery', 'board': 'sbh_bms',
         'detail': 'same housing design as port', 'confidence': 'confirmed'},
        {'id': 'or', 'label': 'Ideal-diode OR', 'kind': 'distribution', 'board': 'poac',
         'detail': '2 x LTC4412 + 4 x SiR167DP. Whichever battery is higher supplies V+; STAT pins report which are supplying.', 'confidence': 'confirmed'},
        {'id': 'vplus', 'label': 'V+ battery bus', 'kind': 'rail', 'board': 'poac', 'volts': 'battery (about 15-21 V for 5 cells)',
         'detail': 'Diagnostics warn below 18.5 V (battery_volt.warn) and list 17 V as thruster_cutoff.', 'confidence': 'confirmed',
         'source': RC + 'riptide_hardware/cfg/diagnostic_thresholds.yaml'},
        {'id': 'kill', 'label': 'Kill switch', 'kind': 'switch', 'board': 'poac',
         'detail': '3 x SiR167DP high-side P-FETs with TC4432 gate drivers. Needs the physical switch AND the RP2040 SOFTWARE_KILL line to allow power.', 'confidence': 'confirmed'},
        {'id': 'motor_pwr', 'label': 'MOTOR_PWR', 'kind': 'rail', 'board': 'poac', 'volts': 'V+ when enabled, 0 when killed', 'confidence': 'confirmed'},
        {'id': 'esc0', 'label': 'ESC board 0', 'kind': 'board', 'board': 'esc',
         'detail': 'reverse protection, 60 A fuse, 4 x 15 A fuses, 4 ESCs', 'confidence': 'confirmed'},
        {'id': 'esc1', 'label': 'ESC board 1', 'kind': 'board', 'board': 'esc', 'confidence': 'confirmed'},
        {'id': 'thrusters', 'label': '8 thrusters', 'kind': 'load', 'detail': '4 per ESC board', 'confidence': 'confirmed'},
        {'id': 'vreg', 'label': 'Vreg', 'kind': 'rail', 'board': 'poac', 'volts': 'V+ minus a Schottky drop',
         'detail': 'MBRB2545CT Schottky from V+; measured as "balanced_voltage" (diagnostics expect 18.5-21.5 V)', 'confidence': 'confirmed'},
        {'id': 'r15', 'label': '15 V rail', 'kind': 'rail', 'board': 'poac', 'volts': 15,
         'detail': 'PS1 TDK-Lambda i6A4W (20 A module). Reported as "twelve_volt_voltage"; diagnostics expect 14.7-16.0 V.', 'confidence': 'confirmed'},
        {'id': 'r5', 'label': '5 V rail', 'kind': 'rail', 'board': 'poac', 'volts': 5,
         'detail': 'PS2 TDK-Lambda i6A4W (20 A module); diagnostics expect 4.7-5.7 V', 'confidence': 'confirmed'},
        {'id': 'r12', 'label': '12 V (servo)', 'kind': 'rail', 'board': 'poac', 'volts': 12,
         'detail': 'MIC29300-12 LDO from 15 V; only goes to LID_CONN1. Not measured by the ADC.', 'confidence': 'confirmed'},
        {'id': 'r33', 'label': '3.3 V (each board)', 'kind': 'rail', 'volts': 3.3,
         'detail': 'LM1117-3.3 from 5 V on every RP2040 board; the POAC reports its own (3.2-3.4 V expected)', 'confidence': 'confirmed'},
        {'id': 'servo', 'label': 'Torpedo/marker servo', 'kind': 'load', 'board': 'poac', 'detail': 'Hiwonder bus servo on the lid connector', 'confidence': 'confirmed'},
        {'id': 'fan_poac', 'label': 'Board-stack fan', 'kind': 'load', 'board': 'poac', 'detail': '5 V, switched', 'confidence': 'confirmed'},
        {'id': 'stack', 'label': 'Stack link', 'kind': 'distribution', 'detail': 'Mini-Fit Jr: CAN + V+ + 5V + 15V', 'confidence': 'confirmed'},
        {'id': 'led', 'label': 'LED board', 'kind': 'board', 'board': 'led', 'detail': 'LED drivers run from V+, logic from 5 V', 'confidence': 'confirmed'},
        {'id': 'ivc', 'label': 'IVC board', 'kind': 'board', 'board': 'ivc', 'detail': 'V+ (1.5 A fuse) -> isolated +/-24 V for the transducer amp; 5 V -> +/-5 V for receive', 'confidence': 'confirmed'},
        {'id': 'ccbb', 'label': 'Camera cage breakout', 'kind': 'board', 'board': 'ccbb', 'detail': 'gets 15 V and 5 V from the POAC "CAMERA CAGE" connector', 'confidence': 'confirmed'},
        {'id': 'orin', 'label': 'Jetson AGX Orin', 'kind': 'load', 'board': 'ccbb', 'detail': '15 V through FDD4141 switch (ORIN_SW, on at boot)', 'confidence': 'confirmed'},
        {'id': 'dvl', 'label': 'DVL', 'kind': 'load', 'board': 'ccbb', 'detail': '15 V injected on pins 7-8 of its Ethernet cable: CCBB J14 (silk "DVL SUBCONN") carries 15V + GND there; J13 (silk "DVL | SWITCH") passes the data pairs on to the network switch', 'confidence': 'confirmed (netlist + silk); the DVL\'s own supply range is not in the designs'},
        {'id': 'switch', 'label': 'Network switch', 'kind': 'load', 'board': 'ccbb', 'detail': '5 V on J16 (schematic "Network Switch Power", silk "SWITCH")', 'confidence': 'confirmed (connector); switch model not in the designs'},
        {'id': 'peltier', 'label': 'Peltier cooler', 'kind': 'load', 'board': 'ccbb', 'detail': '15 V switched (PELT_SW)', 'confidence': 'inferred (only the connector and switch are confirmed; whether a Peltier is fitted today is unconfirmed)'},
        {'id': 'cage_fans', 'label': 'Cage fans (up to 4)', 'kind': 'load', 'board': 'ccbb', 'detail': '5 V switched, tach inputs', 'confidence': 'confirmed'},
        {'id': 'depth', 'label': 'Depth sensor', 'kind': 'load', 'board': 'ccbb', 'detail': '5 V + I2C (MS5837-02BA, i.e. Bar02)', 'confidence': 'confirmed'},
        {'id': 'rgb', 'label': 'RGB status strip', 'kind': 'load', 'board': 'ccbb', 'detail': '5 V', 'confidence': 'confirmed'},
        {'id': 'ext_can', 'label': 'External CAN devices', 'kind': 'load', 'board': 'ccbb', 'detail': '15 V + external CAN on J1/J5', 'confidence': 'confirmed (connector); what is plugged in today is unconfirmed'},
    ],
    'edges': [
        {'from': 'bat_port', 'to': 'or', 'net': 'VPORT', 'via': 'POAC J3 (Anderson PP45)'},
        {'from': 'bat_stbd', 'to': 'or', 'net': 'VSTBD', 'via': 'POAC J4 (Anderson PP45)'},
        {'from': 'or', 'to': 'vplus', 'net': 'V+'},
        {'from': 'vplus', 'to': 'kill', 'net': 'V+'},
        {'from': 'kill', 'to': 'motor_pwr', 'net': 'MOTOR_PWR'},
        {'from': 'motor_pwr', 'to': 'esc0', 'net': 'MOTOR_PWR', 'via': 'Redcube M4 terminals'},
        {'from': 'motor_pwr', 'to': 'esc1', 'net': 'MOTOR_PWR', 'via': 'Redcube M4 terminals'},
        {'from': 'esc0', 'to': 'thrusters', 'net': 'ESC phases', 'via': 'J5 Thruster SubConn'},
        {'from': 'esc1', 'to': 'thrusters', 'net': 'ESC phases', 'via': 'J5 Thruster SubConn'},
        {'from': 'vplus', 'to': 'vreg', 'net': 'Vreg', 'via': 'MBRB2545CT'},
        {'from': 'vreg', 'to': 'r15', 'net': '15V', 'via': 'PS1'},
        {'from': 'vreg', 'to': 'r5', 'net': '5V', 'via': 'PS2'},
        {'from': 'r15', 'to': 'r12', 'net': '12V', 'via': 'MIC29300-12'},
        {'from': 'r12', 'to': 'servo', 'net': '12V', 'via': 'LID_CONN1'},
        {'from': 'r5', 'to': 'r33', 'net': '3V3', 'via': 'LM1117-3.3 on each board'},
        {'from': 'r5', 'to': 'fan_poac', 'net': 'FAN_PWR'},
        {'from': 'vplus', 'to': 'stack', 'net': 'V+', 'via': 'POAC J5'},
        {'from': 'r15', 'to': 'stack', 'net': '15V', 'via': 'POAC J5'},
        {'from': 'r5', 'to': 'stack', 'net': '5V', 'via': 'POAC J5'},
        {'from': 'stack', 'to': 'led', 'net': 'V+, 5V'},
        {'from': 'stack', 'to': 'ivc', 'net': 'V+, 5V'},
        {'from': 'r5', 'to': 'esc0', 'net': '5V', 'via': 'ESC stack link (logic)', 'confidence': 'inferred (ESC J6 carries 5V; the cable to the POAC is not in the designs)'},
        {'from': 'r15', 'to': 'ccbb', 'net': '15V', 'via': 'POAC J6 -> CCBB J6'},
        {'from': 'r5', 'to': 'ccbb', 'net': '5V', 'via': 'POAC J6 -> CCBB J6'},
        {'from': 'ccbb', 'to': 'orin', 'net': 'ORIN_PWR (15V)', 'via': 'CCBB J17'},
        {'from': 'ccbb', 'to': 'dvl', 'net': '15V', 'via': 'CCBB J14 pins 7-8'},
        {'from': 'ccbb', 'to': 'switch', 'net': '5V', 'via': 'CCBB J16'},
        {'from': 'ccbb', 'to': 'peltier', 'net': '15V switched', 'via': 'CCBB J3'},
        {'from': 'ccbb', 'to': 'cage_fans', 'net': 'FAN_PWR (5V)', 'via': 'CCBB J2/J4/J7/J8'},
        {'from': 'ccbb', 'to': 'depth', 'net': '5V', 'via': 'CCBB J15'},
        {'from': 'ccbb', 'to': 'rgb', 'net': '5V', 'via': 'CCBB J9'},
        {'from': 'ccbb', 'to': 'ext_can', 'net': '15V', 'via': 'CCBB J1/J5'},
    ],
    'measurements': {
        'topic': '/talos/state/electrical (riptide_msgs2/ElectricalReadings), 1 Hz from the POAC',
        'fields': [
            {'field': 'three_volt_voltage', 'measures': '3V3 on the POAC', 'adc': 'MCP3428 ch1, 10k/10k', 'expect': [3.2, 3.4]},
            {'field': 'balanced_voltage', 'measures': 'Vreg (battery bus after the Schottky)', 'adc': 'ch2, 10k/1k', 'expect': [18.5, 21.5]},
            {'field': 'twelve_volt_voltage', 'measures': 'the 15 V rail (name is historical)', 'adc': 'ch3, 10k/1k', 'expect': [14.7, 16.0]},
            {'field': 'five_volt_voltage', 'measures': '5V', 'adc': 'ch4, 10k/1k', 'expect': [4.7, 5.7]},
            {'field': 'port_powering / stbd_powering', 'measures': 'LTC4412 STAT: is this battery supplying V+', 'adc': 'GPIO 10/11'},
            {'field': 'port_voltage / stbd_voltage', 'measures': 'always 0 on the POAC', 'adc': None},
        ],
        'expect_source': RC + 'riptide_hardware/cfg/diagnostic_thresholds.yaml',
        'code_source': TF + 'talos/PoacBoard/src/ros.c#L133-L157',
    },
    'sources': {
        'poac_power_sheet': P + 'Poactuator_Power_Circuits.SchDoc',
        'poac_kill_sheet': P + 'Poactuator_KillSwitch.SchDoc',
        'poac_pdf': REL + 'talos_boards',
        'ccbb': EB + 'TempestBoards/MK2/CameraCageBB/CameraCageBB.SchDoc',
        'esc': EB + 'TempestBoards/MK2/ESC/ESC.SchDoc',
        'ivc': EB + enc('TalosBoards/Year Two/IVC/PowerAndConnections.SchDoc'),
        'sbh_bms': EB + 'TempestBoards/MK2/SBH_BMS/SBH_BMS.SchDoc',
    },
}

OUT.mkdir(parents=True, exist_ok=True)
(OUT / 'boards.json').write_text(json.dumps(boards_doc, indent=1, ensure_ascii=False) + '\n')
(OUT / 'power.json').write_text(json.dumps(power, indent=1, ensure_ascii=False) + '\n')
print('wrote', OUT / 'boards.json', OUT / 'power.json')
