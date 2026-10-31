#!/usr/bin/env python3
"""Talos power-and-data block diagram -> public/data/electrical/system.json.

Blocks and links come from the boards media library (public/data/boards/power.json and boards.json, built by
tools/boards/build_data.py from the Altium designs and firmware) plus the data links drawn in the 2026 design report
(RS26 TDR, Fig. 15 "Talos electrical architecture"). Each link a block card mentions is checked against power.json
or boards.json here, so a renamed net or connector fails the build instead of going stale on the page.

    python3 -I tools/electrical/build_system.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/data/electrical/system.json'
EB = 'https://github.com/osu-uwrt/electric_boogaloo/blob/master/'
EB_TREE = 'https://github.com/osu-uwrt/electric_boogaloo/tree/master/'
TF = 'https://github.com/osu-uwrt/titan_firmware/blob/master/'
RC = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/'
TDR26 = 'https://robonation.org/app/uploads/sites/4/2026/07/RS26_TDR_TheOhioState_UWRT.pdf'
TDR23 = 'https://org.osu.edu/osu-uwrt/files/2023/06/TDR_THEOhioStateUniversity_RS2023.pdf'
TDR24 = 'https://org.osu.edu/osu-uwrt/files/2024/06/TDR_THEOhioStateUniversity_RS2024.pdf'
CFG = TF + 'talos/SmartBattery/bq40z80_files/BQ40Z80%20Configuration.txt'

power = json.loads((ROOT / 'public/data/boards/power.json').read_text())
boards = {b['id']: b for b in json.loads((ROOT / 'public/data/boards/boards.json').read_text())['boards']}
pnodes = {n['id']: n for n in power['nodes']}
pedges = {(e['from'], e['to']): e for e in power['edges']}


def conn(board, ref):
    """A connector line from boards.json, e.g. 'J6 CAMERA CAGE (Molex Mini-Fit Jr 8-pin): CANL, GND x3, ...'."""
    for c in boards[board]['connectors']:
        if c['ref'] == ref:
            label = f" {c['label']}" if c.get('label') else ''
            return f"{c['ref']}{label} ({c['type']}): {c['carries']}"
    sys.exit(f'no connector {ref} on {board}')


def need(a, b):
    if (a, b) not in pedges:
        sys.exit(f'power.json has no edge {a} -> {b}')
    return pedges[(a, b)]


# Cross-checks: the power paths the cards describe must exist in the board library.
for a, b in [('bat_port', 'or'), ('bat_stbd', 'or'), ('or', 'vplus'), ('vplus', 'kill'), ('kill', 'motor_pwr'),
             ('motor_pwr', 'esc0'), ('motor_pwr', 'esc1'), ('vplus', 'vreg'), ('vreg', 'r15'), ('vreg', 'r5'),
             ('r15', 'r12'), ('r12', 'servo'), ('stack', 'led'), ('stack', 'ivc'), ('r15', 'ccbb'), ('r5', 'ccbb'),
             ('ccbb', 'orin'), ('ccbb', 'dvl'), ('ccbb', 'switch'), ('ccbb', 'depth'), ('ccbb', 'cage_fans')]:
    need(a, b)

N = []


def node(id, label, sub, group, title, what, rows, link=None, source=None, inferred=False):
    N.append({'id': id, 'label': label, 'sub': sub, 'group': group, 'card': {
        'title': title, 'what': what, 'rows': rows, 'link': link, 'source': source, 'inferred': inferred}})


bat_rows = [
    ['Cells', 'MaxAmps LiPo, 8000 mAh, 5S2P (5 in series, 2 in parallel)'],
    ['Voltage', '18.5 V nominal; 16 V empty, about 20.75 V charged'],
    ['Energy', '148 Wh'],
    ['Protection', 'BQ40Z80 gas gauge and protector; 45 A self-control fuse; output off below 3.2 V per cell'],
]
node('bat_p', 'Port battery', '5S LiPo, 148 Wh', 'battery', 'Port smart battery housing',
     'One of two identical sealed housings, each with its own BMS board and microcontroller board. Plugs into the hull with a power SubConn and a telemetry SubConn.',
     bat_rows + [['Into the POAC', conn('poac', 'J3')], ['Data', 'external CAN bus, 250 kbit/s, to the Orin HAT']],
     {'href': '#batteries', 'text': 'Batteries, below'}, CFG + '#L4')
node('bat_s', 'Starboard battery', '5S LiPo, 148 Wh', 'battery', 'Starboard smart battery housing',
     'Same design as the port housing. The housing reports which side it is on from a side-detect pin, not from its CAN ID.',
     bat_rows + [['Into the POAC', conn('poac', 'J4')], ['Data', 'external CAN bus, 250 kbit/s, to the Orin HAT']],
     {'href': '#batteries', 'text': 'Batteries, below'}, CFG + '#L4')
node('ksw', 'Kill switch', 'Hall-effect sensor', 'out', 'Physical kill switch',
     'A Hall-effect sensor (2024 design report) wired to the POAC. With the switch out, thruster power is cut in hardware, whatever the software does.',
     [['Into the POAC', conn('poac', 'J1')], ['Cuts', 'MOTOR_PWR only: ESCs and thrusters'], ['Also on J1', 'the AUX switch, read as state/aux']],
     {'href': '#kill', 'text': 'The kill switch, below'}, TDR24)
node('or', 'Ideal-diode OR', 'V+ battery bus', 'poac', 'Battery OR ("balancer")',
     pnodes['or']['detail'] + ' Reverse current from one pack into the other is blocked.',
     [['Parts', '2 x LTC4412 controllers, 4 x SiR167DP P-channel MOSFETs'], ['Output', 'V+, the battery bus'],
      ['Reported', 'state/electrical port_powering, stbd_powering; state/batteries_balanced when both supply']],
     {'href': '#two-packs', 'text': 'Two packs, one bus'}, power['sources']['poac_power_sheet'])
node('kill', 'Kill MOSFETs', 'V+ to MOTOR_PWR', 'poac', 'Kill MOSFETs',
     'The thruster power switch. Three P-channel MOSFETs in parallel connect V+ to MOTOR_PWR, the ESC supply. They conduct only while MOTOR_EN is on: the physical switch is in AND the microcontroller holds SOFTWARE_KILL at "run".',
     [['Parts', '3 x SiR167DP (30 V, 60 A each), 3 x TC4432 gate drivers, DG448 analog switch'],
      ['Out', conn('poac', 'J7, J8')], ['Return', conn('poac', 'J9, J10')]],
     {'href': 'commanding.html', 'text': 'Kill slots and software kill'}, power['sources']['poac_kill_sheet'])
node('mcu', 'POAC microcontroller', 'CAN id 1', 'poac', 'POAC RP2040',
     'Runs the kill-switch logic (the software kill slots), measures the rails with a 16-bit ADC and drives the actuator servo. It reports as the "power board" on CAN, client 1.',
     [['Publishes', 'state/kill, state/electrical (1 s), state/aux, state/batteries_balanced'],
      ['Listens', 'command/software_kill, command/electrical (fans), command/actuator/*']],
     {'href': 'boards.html', 'text': 'The POAC board'}, TF + 'talos/PoacBoard/src/ros.c')
node('reg15', '15 V module', 'PS1, 20 A', 'poac', '15 V regulator',
     'TDK-Lambda i6A4W020A033V non-isolated DC-DC module (9-53 V in, 20 A), trimmed to 15 V. Fed from Vreg, which is V+ through a Schottky diode.',
     [['Feeds', 'camera cage board (Orin, DVL, Peltier output if fitted), stack link, 12 V LDO'],
      ['Measured', 'state/electrical twelve_volt_voltage (the name is historical); expect 14.7-16.0 V']],
     {'href': '#rails', 'text': 'Regulators and rails'}, power['sources']['poac_power_sheet'])
node('reg5', '5 V module', 'PS2, 20 A', 'poac', '5 V regulator',
     'The same TDK-Lambda module, trimmed to 5 V. Each board in the stack and the camera cage makes its own 3.3 V from this with an LM1117 LDO.',
     [['Feeds', 'board logic (POAC microcontroller, stack link, camera cage), network switch, fans, depth sensor, LED strip'],
      ['Measured', 'state/electrical five_volt_voltage; expect 4.7-5.7 V']],
     {'href': '#rails', 'text': 'Regulators and rails'}, power['sources']['poac_power_sheet'])
node('reg12', '12 V LDO', 'servo only', 'poac', '12 V regulator',
     'MIC29300-12, a 3 A linear regulator from the 15 V rail. Its only load is the actuator servo on the lid connector. Not measured by the ADC.',
     [['Out', conn('poac', 'LID_CONN1')]],
     {'href': 'actuators.html', 'text': 'Torpedoes, dropper and claw'}, power['sources']['poac_power_sheet'])
esc_rows = [
    ['In', 'MOTOR_PWR on Redcube terminals "ESC V+" / "ESC GND"'],
    ['Protection', 'reverse-voltage MOSFETs, 60 A board fuse, one 15 A fuse per ESC'],
    ['ESCs', '4 x APD 80F3 (rated 15-35 V, 80 A)'],
    ['Logic', '5 V on the ESC stack link (where the cable comes from is not in the designs)'],
]
node('esc0', 'ESC board 0', 'CAN id 2', 'stack', 'ESC board 0 (thrusters 0-3)',
     'Carrier for four ESCs. Solder jumper SB1 left open makes it board 0, CAN client 2.',
     esc_rows + [['Out', conn('esc', 'J5')]],
     {'href': 'thrusters-hw.html', 'text': 'Thrusters and ESCs'}, power['sources']['esc'])
node('esc1', 'ESC board 1', 'CAN id 3', 'stack', 'ESC board 1 (thrusters 4-7)',
     'The same board with SB1 bridged, so it reads as board 1, CAN client 3.',
     esc_rows + [['Out', conn('esc', 'J5')]],
     {'href': 'thrusters-hw.html', 'text': 'Thrusters and ESCs'}, power['sources']['esc'])
node('thr03', 'Thrusters 0-3', '4 x T200', 'out', 'Thrusters 0-3',
     'Blue Robotics T200s, three motor phases each, through the lid SubConns. The ESCs drive them with bidirectional DShot600 and report RPM back.',
     [['Peak current', 'about 7 A forward, 10 A reverse at Talos\'s 24 N limit (T200 data, 18 V)'], ['Fuse', '15 A per ESC']],
     {'href': '#budget', 'text': 'Power budget'}, 'https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/')
node('thr47', 'Thrusters 4-7', '4 x T200', 'out', 'Thrusters 4-7',
     'The other four T200s, on ESC board 1.',
     [['Peak current', 'about 7 A forward, 10 A reverse at 24 N (T200 data, 18 V)'], ['Fuse', '15 A per ESC']],
     {'href': '#budget', 'text': 'Power budget'}, 'https://bluerobotics.com/store/thrusters/t100-t200-thrusters/t200-thruster-r2-rp/')
node('led', 'LED board', 'CAN id 6', 'stack', 'LED board',
     'Two ST L99LD20 buck LED drivers run straight from V+ and feed an aluminium RGBW LED module. Logic runs from 5 V.',
     [['In', conn('led', 'J2')], ['Out', conn('led', 'J1')]],
     {'href': 'boards.html', 'text': 'The circuit boards'}, EB_TREE + 'TalosBoards/Year%20One/LED_Board')
node('ivc', 'IVC board', 'CAN id 8', 'stack', 'IVC board (acoustic modem)',
     'Sends and hears 17/19 kHz tones. The transmit power amplifier runs on an isolated +/-24 V converter from V+ (1.5 A fuse); the receive chain on an isolated +/-5 V converter from 5 V.',
     [['In', conn('ivc', 'J2')], ['Out', conn('ivc', 'J1')]],
     {'href': 'boards.html', 'text': 'The circuit boards'}, power['sources']['ivc'])
node('servo', 'Actuator servo', '12 V', 'out', 'Torpedo and marker servo',
     'A Hiwonder bus servo in an underwater housing. 12 V power plus a half-duplex serial data line at 115200 baud, level-shifted to 5 V.',
     [['From', conn('poac', 'LID_CONN1')]],
     {'href': 'actuators.html', 'text': 'Torpedoes, dropper and claw'}, TF + 'talos/PoacBoard/src/actuators/ros_torp.c')
node('ccbb', 'Camera cage board', 'CAN id 4', 'cage', 'Camera cage breakout board',
     'Takes 15 V, 5 V and the internal CAN bus from the POAC and hands them out inside the camera cage. Switches the Orin and a Peltier output (15 V, if one is fitted) and four fans (5 V); reads the depth sensor.',
     [['In', conn('ccbb', 'J6')], ['To the Orin', conn('ccbb', 'J17')], ['CAN to the Orin', conn('ccbb', 'J10')],
      ['Also', 'RGB status strip (J9), external CAN + 15 V (J1/J5), extra power (J11)']],
     {'href': 'boards.html', 'text': 'The circuit boards'}, power['sources']['ccbb'])
node('orin', 'Jetson AGX Orin', '15 V, switched', 'cage', 'NVIDIA Jetson AGX Orin',
     'The main computer. Its 15 V comes through an FDD4141 switch on the camera cage board, on at boot. command/electrical CYCLE_COMPUTER turns it off for 5 s and back on.',
     [['Power', conn('ccbb', 'J17')], ['Data', 'Ethernet to the switch, GMSL2 to the cameras, CAN and serial through its HAT and M.2 card']],
     {'href': 'computers.html', 'text': 'Computers and networks'}, TF + 'talos/CameraCageBB/src/ros.c#L160')
node('hat', 'Orin HAT', 'CAN + RS-232', 'cage', 'Jetson AGX breakout ("Orin HAT")',
     'Plugs onto the Orin\'s 40-pin header: two CAN transceivers (can0 internal, can1 external) and an RS-232 transceiver for the IMU, which it also powers (5 V).',
     [['CAN', conn('agx_breakout', 'J1')], ['IMU', conn('agx_breakout', 'J2')],
      ['Not confirmed', 'the 2026 report shows an "Orin HAT"; that it is this electric_boogaloo design (Jetson AGX Breakout) is inferred']],
     {'href': 'computers.html', 'text': 'Computers and networks'}, TDR26, inferred=True)
node('imu', 'VN-100 IMU', 'RS-232', 'cage', 'VectorNav VN-100 IMU',
     'Serial over RS-232 through the HAT, /dev/ttyTHS0 on the Orin. Powered with 5 V from the HAT.',
     [['Port', '/dev/ttyTHS0 (riptide_hardware imu.launch.py)']],
     {'href': 'sensors.html', 'text': 'Navigation sensors'}, RC + 'riptide_hardware/launch/imu.launch.py')
node('fogb', 'FOG board', 'M.2 RS-422', 'cage', 'Jetson M.2 RS-422 card ("FOG board")',
     'An M.2 card in the Orin. It makes the gyro\'s supply (boost to 8 V, then a 5 V LDO) and converts RS-422.',
     [['Gyro', conn('agx_m2', 'J1')], ['Port', '/dev/ttyTHS2 (riptide_gyro gyro_config.yaml)'],
      ['Not confirmed', 'the 2026 report shows a "FOG board"; that it is this M.2 RS-422 design is inferred (a 2024 commit calls it the FOG board)']],
     {'href': 'sensors.html', 'text': 'Navigation sensors'}, TDR24, inferred=True)
node('fog', 'Fibre-optic gyro', 'RS-422', 'cage', 'Fizoptika fibre-optic gyro',
     'Yaw rate. Power and RS-422 from the FOG board; the 2025 design report describes the pogo-pin mount that replaced its fragile pin connector.',
     [['From', 'FOG board J1']], {'href': 'sensors.html', 'text': 'Navigation sensors'}, TDR26)
node('zed', 'ZED X cameras', 'GMSL2, x2', 'cage', 'Stereolabs ZED X cameras',
     'Front (ZED X) and downward (ZED X Mini) stereo cameras, on the Orin\'s GMSL2 capture card.',
     [['Link', 'GMSL2 capture card on the Orin (team website)']], {'href': 'cameras.html', 'text': 'The cameras'}, TDR26)
node('sw', 'Network switch', '5 V', 'cage', 'Ethernet switch',
     'Joins the Orin, the DVL and the tether on one wired network (192.168.1.0/24). Powered with 5 V from the camera cage board. Model not in the designs.',
     [['Power', conn('ccbb', 'J16')], ['DVL link', conn('ccbb', 'J13')]],
     {'href': 'computers.html', 'text': 'Computers and networks'}, power['sources']['ccbb'])
node('dvl', 'Nortek DVL1000', '15 V on Ethernet', 'out', 'Nortek DVL1000',
     'One cable carries both: the camera cage board injects 15 V and ground on two spare pins of the DVL\'s Ethernet cable, and passes the data pairs on to the switch.',
     [['Cable', conn('ccbb', 'J14')]], {'href': 'sensors.html', 'text': 'Navigation sensors'}, power['sources']['ccbb'])
node('depth', 'Depth sensor', 'Bar02, 5 V I2C', 'out', 'Blue Robotics Bar02 depth sensor',
     'MS5837-02BA pressure sensor read over I2C by the camera cage board, which publishes state/depth/raw. The short I2C run is deliberate: see "Why CAN".',
     [['Cable', conn('ccbb', 'J15')]], {'href': 'sensors.html', 'text': 'Navigation sensors'}, power['sources']['ccbb'])
node('fans', 'Fans', '5 V, switched', 'cage', 'Cooling fans',
     'Up to four cage fans on the camera cage board and one board-stack fan on the POAC, all 5 V and switched by MOSFETs, on at boot. command/electrical ENABLE_FANS / DISABLE_FANS.',
     [['Cage', 'J2, J4, J7, J8 (FAN 1-4), with tachometers'], ['Stack', conn('poac', 'J11')],
      ['Not confirmed', 'how many fans and whether the Peltier cooler (J3, 15 V) are fitted today']],
     None, power['sources']['ccbb'], inferred=True)
node('tether', 'Tether', 'Ethernet', 'out', 'Ethernet tether',
     'Through a lid SubConn to the surface router. Off for competition runs; then the physical switch is the only kill.',
     [['Network', '192.168.1.0/24, router 192.168.1.1']], {'href': 'computers.html', 'text': 'Computers and networks'}, TDR23)

ids = {n['id'] for n in N}
E = []


def edge(a, b, layer, kind, desc, label=None, inferred=False):
    assert a in ids and b in ids, (a, b)
    E.append({'from': a, 'to': b, 'layer': layer, 'kind': kind, 'desc': desc, 'label': label, 'inferred': inferred})


# power
edge('bat_p', 'or', 'power', 'battery', 'VPORT through Anderson PP45 J3', 'VPORT')
edge('bat_s', 'or', 'power', 'battery', 'VSTBD through Anderson PP45 J4', 'VSTBD')
edge('or', 'kill', 'power', 'battery', 'V+, the battery bus', 'V+')
edge('kill', 'esc0', 'power', 'motor', need('motor_pwr', 'esc0')['net'] + ' on Redcube M4 terminals', 'MOTOR_PWR')
edge('kill', 'esc1', 'power', 'motor', 'MOTOR_PWR on Redcube M4 terminals')
edge('esc0', 'thr03', 'power', 'motor', 'three motor phases per thruster, J5 "Thruster SubConn"')
edge('esc1', 'thr47', 'power', 'motor', 'three motor phases per thruster, J5 "Thruster SubConn"')
edge('or', 'reg15', 'power', 'rail', 'Vreg: V+ through the MBRB2545CT Schottky', 'Vreg')
edge('or', 'reg5', 'power', 'rail', 'Vreg: V+ through the MBRB2545CT Schottky')
edge('reg15', 'reg12', 'power', 'rail', '15 V into the MIC29300-12 LDO')
edge('reg12', 'servo', 'power', 'rail', '12 V on LID_CONN1', '12 V')
edge('or', 'led', 'power', 'battery', 'V+ on the stack link, for the LED drivers')
edge('or', 'ivc', 'power', 'battery', 'V+ on the stack link, for the isolated +/-24 V converter')
edge('reg15', 'ccbb', 'power', 'rail', '15 V and 5 V on POAC J6 "CAMERA CAGE" to CCBB J6', '15 V')
edge('reg5', 'ccbb', 'power', 'rail', '5 V on the same cable', '5 V')
edge('ccbb', 'orin', 'power', 'rail', 'ORIN_PWR: 15 V through an FDD4141 switch, J17')
edge('ccbb', 'dvl', 'power', 'rail', '15 V on pins 7-8 of the DVL Ethernet cable, J14')
edge('ccbb', 'sw', 'power', 'rail', '5 V on J16')
edge('ccbb', 'depth', 'power', 'rail', '5 V on J15')
edge('ccbb', 'fans', 'power', 'rail', 'switched 5 V on J2/J4/J7/J8')
edge('orin', 'hat', 'power', 'rail', '40-pin header')
edge('hat', 'imu', 'power', 'rail', '5 V on J2')
edge('orin', 'fogb', 'power', 'rail', 'M.2 slot; the card boosts to 8 V and regulates 5 V for the gyro')
edge('fogb', 'fog', 'power', 'rail', '5 V')
edge('reg5', 'mcu', 'power', 'rail', '5 V into its LM1117 3.3 V regulator')
# data
edge('ksw', 'kill', 'data', 'signal', 'KILL_SWITCH on POAC J1: drives MOTOR_EN directly, and is read by the RP2040 (PHYS_KILLSWITCH)')
edge('mcu', 'kill', 'data', 'signal', 'SOFTWARE_KILL: the RP2040 can break MOTOR_EN through the DG448', 'SOFTWARE_KILL')
edge('mcu', 'servo', 'data', 'serial', 'half-duplex UART, 115200 baud, level-shifted to 5 V')
for a, b in [('hat', 'ccbb'), ('ccbb', 'mcu'), ('mcu', 'esc0'), ('esc0', 'esc1'), ('esc1', 'ivc'), ('ivc', 'led')]:
    edge(a, b, 'data', 'can', 'internal CAN FD bus (can0), 1 Mbit/s, 5 Mbit/s data phase', 'CAN FD' if a == 'hat' else None)
edge('hat', 'bat_p', 'data', 'can2', 'external CAN bus (can1), classic CAN 250 kbit/s, through the camera cage board\'s EXT. CAN jacks', 'CAN 250k')
edge('hat', 'bat_s', 'data', 'can2', 'external CAN bus (can1), classic CAN 250 kbit/s, through the camera cage board\'s EXT. CAN jacks')
edge('esc0', 'thr03', 'data', 'signal', 'bidirectional DShot600 to each ESC, RPM back')
edge('esc1', 'thr47', 'data', 'signal', 'bidirectional DShot600 to each ESC, RPM back')
edge('sw', 'orin', 'data', 'eth', 'Ethernet', 'Ethernet')
edge('sw', 'dvl', 'data', 'eth', 'Ethernet pairs through CCBB J13/J14')
edge('sw', 'tether', 'data', 'eth', 'Ethernet to the surface')
edge('hat', 'imu', 'data', 'serial', 'RS-232, /dev/ttyTHS0')
edge('fogb', 'fog', 'data', 'serial', 'RS-422, /dev/ttyTHS2')
edge('orin', 'zed', 'data', 'gmsl', 'GMSL2', 'GMSL2')
edge('ccbb', 'depth', 'data', 'i2c', 'I2C at 200 kHz')
edge('orin', 'fogb', 'data', 'serial', 'M.2 (UART)')
edge('orin', 'hat', 'data', 'serial', '40-pin header: CAN controllers and UART')

def browsable(url):
    """A .SchDoc is binary and GitHub can't show it: link its project folder instead."""
    if url and url.startswith(EB) and url.endswith('.SchDoc'):
        return EB_TREE + url[len(EB):].rsplit('/', 1)[0]
    return url


for n in N:
    n['card']['source'] = browsable(n['card']['source'])

out = {'about': __doc__.split('\n')[0], 'sources': {'power': 'public/data/boards/power.json', 'boards': 'public/data/boards/boards.json', 'tdr26': TDR26},
       'nodes': N, 'edges': E}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(out, indent=1))
print('wrote', OUT, len(N), 'nodes', len(E), 'edges', file=sys.stderr)
