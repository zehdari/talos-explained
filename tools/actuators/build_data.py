#!/usr/bin/env python3
"""Build the data behind the actuators chapter (actuators.html).

Reads the real sources, so every number on the page comes from a file:
  titan_firmware  origin/master  talos/PoacBoard (servo angles, timers, refusal messages)
  riptide_core    followpath-speed  actuator_service_translator.py, ActuatorStatus.msg, talos.yaml poses
  riptide_autonomy autonomy-mapping trees/RepairCompMpcTree.xml (FireTorpedo, FireDropper, arming, claw times)
  nereus          main  robot pack mechanisms, safety.arming, bridge enum maps, viewer actuator buttons
  /tmp/nmedia/rec/tree_log.jsonl (optional): the 2026-10-30 Nereus media run, for the measured shot timeline.
    If it is gone, the measured timeline already in the output is kept.
Writes public/data/actuators/actuators.json, plus line numbers for the source links.

Run: python3 tools/actuators/build_data.py
"""
import json, pathlib, re, subprocess
import xml.etree.ElementTree as ET
import yaml

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / 'public' / 'data' / 'actuators' / 'actuators.json'
HOME = pathlib.Path.home()
REL = HOME / 'osu-uwrt' / 'release'
SRC = REL / 'src'
NER = REL / 'nereus'
TITAN = HOME / 'osu-uwrt' / 'development' / 'titan_firmware'
LOG = pathlib.Path('/tmp/nmedia/rec/tree_log.jsonl')


def git_show(repo, rev, path):
    return subprocess.run(['git', '-C', str(repo), 'show', f'{rev}:{path}'], capture_output=True, text=True,
                          check=True).stdout


def line_of(text, pattern, start=1):
    for i, l in enumerate(text.splitlines(), 1):
        if i >= start and re.search(pattern, l):
            return i
    raise SystemExit(f'pattern not found: {pattern}')


def block(text, pattern):
    """Line range of a C function / XML element starting at the first line matching pattern."""
    a = line_of(text, pattern)
    lines = text.splitlines()
    depth, seen = 0, False
    if pattern.startswith('<'):
        tag = re.match(r'<(\w+)', pattern.lstrip('\\')).group(1) if re.match(r'<(\w+)', pattern) else 'BehaviorTree'
        for i in range(a - 1, len(lines)):
            if f'</{tag}>' in lines[i]:
                return [a, i + 1]
    for i in range(a - 1, len(lines)):
        depth += lines[i].count('{') - lines[i].count('}')
        seen = seen or '{' in lines[i]
        if seen and depth == 0:
            return [a, i + 1]
    raise SystemExit(f'no end for {pattern}')


def define(text, name):
    m = re.search(rf'#define\s+{name}\s+([0-9.]+)', text)
    return float(m.group(1)) if '.' in m.group(1) else int(m.group(1))


out = json.loads(OUT.read_text()) if OUT.exists() else {}
lines = {}

# ---------------------------------------------------------------- firmware (POAC, master)
fw = {'repo': 'osu-uwrt/titan_firmware', 'branch': 'master',
      'commit': subprocess.run(['git', '-C', str(TITAN), 'rev-parse', '--short', 'origin/master'],
                               capture_output=True, text=True).stdout.strip()}
torp = git_show(TITAN, 'origin/master', 'talos/PoacBoard/src/actuators/ros_torp.c')
act = git_show(TITAN, 'origin/master', 'talos/PoacBoard/src/actuators/actuator.c')
main = git_show(TITAN, 'origin/master', 'talos/PoacBoard/src/main.c')
safety = git_show(TITAN, 'origin/master', 'talos/PoacBoard/src/safety_interface.c')
hw = git_show(TITAN, 'origin/master', 'talos/PoacBoard/include/actuators/hiwonder_driver.h')
board = git_show(TITAN, 'origin/master', 'lib/titan_boards/include/boards/talos/poac_board.h')
fw.update({
    'torp_first_deg': define(torp, 'TORP_2_DEG'), 'torp_second_deg': define(torp, 'TORP_1_DEG'),
    'marker_first_deg': define(torp, 'MARKER_2_DEG'), 'marker_second_deg': define(torp, 'MARKER_1_DEG'),
    'torpedoes': define(torp, 'TORP_NUMBER'), 'markers': define(torp, 'DROPPER_NUMBER'),
    'home_deg': int(re.search(r'uint16_t home_deg = (\d+);', act).group(1)),
    'servo_max_dps': define(act, 'SERVO_MAX_DPS'), 'postmove_ms': define(act, 'SERVO_POSTMOVE_DELAY_MS'),
    'max_errors': define(act, 'MAX_NUM_ERRORS'), 'servo_id': int(re.search(r'uint8_t id = (\d+);', act).group(1)),
    'range_deg': 240, 'range_units': 1000,
    'status_ms': define(main, 'ACTUATOR_STATUS_TIME_MS'), 'uart_tick_ms': define(main, 'SERVO_TRANSMIT_PERIOD_MS'),
    'ping_ms': define(main, 'SERVO_PING_PERIOD_MS'), 'cmd_status_ms': define(main, 'SERVO_UPDATE_CMD_STATUS_PERIOD_MS'),
    'baud': int(re.search(r'UART_BAUD (\d+)u', hw).group(1)),
    'uart_timeout_ms': define(hw, 'UART_TIMEOUT_MS'), 'servo_pin': define(board, 'DYNAMIXEL_PWM_PIN'),
    'kill_disarms': 'TODO: disarm actuators' not in safety,
    # refusal messages in live code only (commented-out lines skipped)
    'messages': sorted(set(re.findall(r'\*errMsgOut = "([^"]+)"',
                                      '\n'.join(l for l in torp.splitlines() if not l.strip().startswith('//'))))),
})
lines['ros_torp'] = {
    'defines': [line_of(torp, 'define TORP_NUMBER'), line_of(torp, 'define MARKER_1_DEG')],
    'torpedo_fire': block(torp, r'^bool torpedo_fire'), 'dropper': block(torp, r'^bool dropper_drop_marker'),
    'arm': block(torp, r'^bool actuators_arm'), 'status': block(torp, r'^rcl_ret_t ros_actuators_update_status'),
    'reload': block(torp, r'^bool torpedo_notify_reload'), 'set_home': block(torp, r'^bool torpedo_marker_set_home'),
    'topics': [line_of(torp, 'define BUSY_TOPIC_NAME'), line_of(torp, 'define ACTUATOR_FEEDBACK_STATE_TOPIC_NAME')],
    'claw_state': line_of(torp, r'status_msg.claw_state = 0'),
}
lines['actuator'] = {
    'consts': [line_of(act, 'define SERVO_MAX_DPS'), line_of(act, 'define SERVO_POSTMOVE_DELAY_MS')],
    'home': line_of(act, 'uint16_t home_deg'), 'set_armed': block(act, r'^void servo_set_armed'),
    'set_deg': block(act, r'^uint16_t servo_set_deg'), 'complete': block(act, r'^static int64_t servo_move_complete_cb'),
    'then_home': block(act, r'^void servo_set_deg_then_home'),
}
lines['main'] = {'timers': [line_of(main, 'define ACTUATOR_STATUS_TIME_MS'), line_of(main, 'define SERVO_UPDATE_CMD_STATUS_PERIOD_MS')]}
lines['safety'] = {'todo': line_of(safety, 'TODO: disarm actuators')}
out['firmware'] = fw

# Branch with the claw (unmerged): servo ids and the claw topic.
try:
    claw = git_show(TITAN, 'origin/poac-multiple-servos', 'talos/PoacBoard/src/actuators/ros_claw.c')
    out['firmware_claw_branch'] = {
        'branch': 'poac-multiple-servos', 'claw_servo_id': define(claw, 'CLAW_SERVO_ID'),
        'topic': re.search(r'MOVE_TIME_SUBSCRIPTION_NAME "([^"]+)"', claw).group(1),
        'torp_servo_id': define(git_show(TITAN, 'origin/poac-multiple-servos', 'talos/PoacBoard/src/actuators/ros_torp.c'), 'TORP_SERVO_ID'),
        'last_commit': subprocess.run(['git', '-C', str(TITAN), 'log', '-1', '--format=%ad %s', '--date=short',
                                       'origin/poac-multiple-servos'], capture_output=True, text=True).stdout.strip(),
    }
except subprocess.CalledProcessError:
    pass

# ---------------------------------------------------------------- ROS side (riptide_core)
tr_path = SRC / 'riptide_core/riptide_hardware/riptide_hardware2/actuator_service_translator.py'
tr = tr_path.read_text()
out['translator'] = {'feedback_period_s': float(re.search(r'FEEDBACK_PERIOD = ([0-9.]+)', tr).group(1)),
                     'services': re.findall(r"create_service\((\w+), '([^']+)'", tr)}
lines['translator'] = {'services': [line_of(tr, 'self.torpedo_srv'), line_of(tr, 'self.arm_srv')],
                       'wait': [line_of(tr, 'def pub_empty_with_feedback'), line_of(tr, 'return self.feedback')]}
msg = (SRC / 'riptide_core/riptide_msgs/msg/ActuatorStatus.msg').read_text()
enums = {}
for name, val in re.findall(r'uint8 (\w+)=(\d+)', msg):
    grp, state = name.split('_', 1)
    enums.setdefault(grp.lower(), {})[int(val)] = state.lower()
out['status_enums'] = enums
out['status_fields'] = re.findall(r'^(bool|uint8) (\w+)$', msg, re.M)
talos = yaml.safe_load((SRC / 'riptide_core/riptide_descriptions/config/talos.yaml').read_text())
out['poses'] = {k: talos[k]['pose'] for k in ('torpedoes', 'droppers', 'claw', 'magnet', 'poker')}
out['poses']['torpedo_baseline'] = talos['torpedoes']['baseline']
# talos.yaml poses are children of talos/origin (robot_actuators.xacro); robot_base.xacro puts origin at
# -base_link from base_link. So a pose p in origin is p - base_link in base_link.
bl = talos['base_link']
out['poses']['frame'] = 'talos/origin'
out['poses']['base_link_in_origin'] = bl
out['poses_base_link'] = {k: [round(talos[k]['pose'][j] - bl[j], 4) for j in range(3)]
                          for k in ('torpedoes', 'droppers', 'claw', 'magnet', 'poker')}
ty = (SRC / 'riptide_core/riptide_descriptions/config/talos.yaml').read_text()
lines['talos_yaml'] = [line_of(ty, r'^torpedoes:'), line_of(ty, r'^magnet:') + 1]

# ---------------------------------------------------------------- trees (riptide_autonomy)
tree_path = SRC / 'riptide_autonomy/trees/RepairCompMpcTree.xml'
tree_txt = tree_path.read_text()
root = ET.parse(tree_path).getroot()
bts = {b.get('ID'): b for b in root.findall('BehaviorTree')}


def bb(tree_id):
    return {e.get('output_key'): e.get('value') for e in bts[tree_id].iter('SetBlackboard')
            if not re.fullmatch(r'[-0-9.]+', e.get('output_key') or '')}


def find(tree_id, tag, attr='ID', val=None):
    return [e.attrib for e in bts[tree_id].iter(tag) if val is None or e.get(attr) == val]


ft = bts['FireTorpedo']
out['tree'] = {
    'file': 'RepairCompMpcTree.xml',
    'fire_torpedo': {'wait_s': float(find('FireTorpedo', 'Action', val='Wait')[0]['seconds']),
                     'time_limit_s': float(find('FireTorpedo', 'Action', val='CallTriggerService')[0]['time_limit_secs']),
                     'force_success': ft.find('ForceSuccess') is not None},
    'fire_dropper': {'wait_s': float(find('FireDropper', 'Action', val='Wait')[0]['seconds'])},
    'set_armed': {'wait_s': float(find('SetActuatorsArmed', 'Action', val='Wait')[0]['seconds']),
                  'time_limit_s': float(find('SetActuatorsArmed', 'Action', val='CallSetBoolService')[0]['time_limit_secs'])},
    'wait_for_actuators': {'poll_s': float(find('WaitForActuators', 'Action', val='Wait')[0]['seconds'])},
    'shoot': bb('ShootBothObjectsMpc'),
    'drop': bb('ShootDownwardObjectMpc'),
    'table': {k: v for k, v in bb('NewTableTreeMpc').items() if k.startswith('claw')},
    'magnet': {k: v for k, v in bb('ActivateMagnetMpc').items() if k.startswith('magnet')},
}
for k in ('FireTorpedo', 'FireDropper', 'SetActuatorsArmed', 'WaitForActuators', 'ShootBothObjectsMpc',
          'ShootDownwardObjectMpc', 'TorpedoTreeMpc', 'ReloadActuators', 'PrepForRun', 'ActivateMagnetMpc',
          'NewTableTreeMpc', 'CheckActuatorStates'):
    lines.setdefault('tree', {})[k] = block(tree_txt, rf'<BehaviorTree ID="{k}">')
gas = (SRC / 'riptide_autonomy/include/riptide_autonomy/bt_actions/GetActuatorStatus.btaction.hpp').read_text()
out['tree']['status_timeout_s'] = float(re.search(r'startTime > (\d+)s', gas).group(1))

# ---------------------------------------------------------------- Nereus
robot_txt = (NER / 'content/packs/robots/talos/robot.yaml').read_text()
robot = yaml.safe_load(robot_txt)
mech = {m['id']: m for m in robot['mechanisms']}
out['nereus'] = {'safety': robot['safety'], 'mechanisms': mech,
                 'frames': {f['child']: f['position_m'] for f in robot['frames']['tree']
                            if f['child'] in ('torpedoes_mount', 'droppers_mount', 'claw_mount', 'magnet_mount')}
                 if isinstance(robot.get('frames'), dict) and 'tree' in robot['frames'] else None}
for mid in ('torpedo_launcher', 'dropper'):
    p = mech[mid]['parameters']
    m = p['projectile']['mass_kg'] + p['projectile']['added_mass_kg']
    out['nereus'].setdefault('launch_speed_m_s', {})[mid] = round((2 * p['launch']['spring_energy_j'] / m) ** 0.5, 3)
lines['robot_yaml'] = {'safety': [line_of(robot_txt, r'^safety:'), line_of(robot_txt, r'applies_to')],
                       'mechanisms': [line_of(robot_txt, r'^mechanisms:'), line_of(robot_txt, r'actuated: false')]}
bridge_txt = (NER / 'content/packs/bridges/uwrt_talos/bridge.yaml').read_text()
bridge = yaml.safe_load(bridge_txt)
st = next(s for s in bridge['streams'] if s['id'] == 'actuator_status') if 'streams' in bridge else None
out['nereus']['status_map'] = st['fields'] if st else None
out['nereus']['services'] = [s['service'] for s in bridge.get('services', []) if 'actuator' in s['service']]
lines['bridge'] = {'topics': [line_of(bridge_txt, r'Topic-form actuator commands'), line_of(bridge_txt, r'id: claw_timed_move') + 9],
                   'status': [line_of(bridge_txt, r'id: actuator_status'), line_of(bridge_txt, r'id: actuator_cmd_status') + 8],
                   'services': [line_of(bridge_txt, r'id: arm$'), line_of(bridge_txt, r'id: reset_tasks', line_of(bridge_txt, r'id: arm$')) - 1]}
mtxt = (NER / 'libraries/session/src/mechanisms.cpp').read_text()
out['nereus']['messages'] = sorted(set(re.findall(r'return \{(?:true|false), "([^"]+)"\}', mtxt)))
panels_txt = (NER / 'content/viewer/talos_uwrt_panels.yaml').read_text()
panels = yaml.safe_load(panels_txt)


def walk(o):
    if isinstance(o, dict):
        if o.get('type') == 'uwrt.actuators':
            return o
        for v in o.values():
            r = walk(v)
            if r: return r
    if isinstance(o, list):
        for v in o:
            r = walk(v)
            if r: return r


out['viewer_commands'] = walk(panels)['options']['commands']
lines['panels'] = [line_of(panels_txt, 'type: uwrt.actuators'), line_of(panels_txt, 'id: reload, label')]

# ---------------------------------------------------------------- CAD (from the media library)
asm = json.loads((ROOT / 'public/data/cad/assembly.json').read_text())
want = {'Sinky Torp': 'torpedo', 'Spring (9435K123)': 'spring', 'SER-20XX Servo': 'launcher_servo',
        'Servo - SER-20XX.step': 'claw_servo', 'Torpedoes + Markers V8': 'launcher',
        'EMERGENCYCLAWASSEMBLY': 'claw', 'Magnet poker assembly': 'poker'}
# CAD -> base_link: the CAD frame is +X port, +Y up, +Z bow. Fit a pure offset from the 8 thrusters
# (CAD part origins vs talos.yaml thruster poses, both robot axes), then express the CAD poker box in base_link.
yt = sorted((t['pose'][:3] for t in talos['thrusters']), key=lambda v: (round(v[2], 2), round(v[1], 2)))
ct = sorted((t['origin_robot_m'] for t in asm['thrusters']), key=lambda v: (round(v[2], 2), round(v[1], 2)))
off = [sum(y[j] - c[j] for y, c in zip(yt, ct)) / len(yt) for j in range(3)]  # CAD robot-axes -> talos/origin
glb = json.loads((ROOT / 'public/data/cad/glb.json').read_text())
pk = next(n for n in glb['nodes'] if n['node'] == 'magnet_poker')['bbox_m']
cad2bl = lambda v: [round(v[2] + off[0] - bl[0], 3), round(v[0] + off[1] - bl[1], 3), round(v[1] + off[2] - bl[2], 3)]
out['cad_in_base_link'] = {'cad_to_origin_offset_m': [round(v, 4) for v in off],
                           'poker_min': cad2bl(pk['min']), 'poker_max': cad2bl(pk['max'])}
out['cad'] = {}
for n in asm['nodes']:
    if n['name'] in want and want[n['name']] not in out['cad']:
        out['cad'][want[n['name']]] = {'name': n['name'], 'count': n.get('count'), 'size_mm': n.get('size_mm'),
                                       'material': n.get('material'), 'mass_kg': n.get('mass_kg')}

# ---------------------------------------------------------------- measured shot in Nereus (media run)
if LOG.exists():
    rows = []
    with LOG.open() as f:
        for l in f:
            j = json.loads(l)
            if j['kind'] in ('stack', 'task_event'):
                rows.append(j)
    ev = [r for r in rows if r['kind'] == 'task_event']
    rel = next(r for r in ev if json.loads(r['data'])['kind'] == 'torpedo')
    t0 = rel['sim']
    shot, prev = [], None
    for r in rows:
        t = r['sim'] - t0
        if -1.5 < t < 7.5:
            if r['kind'] == 'task_event':
                shot.append([round(t, 3), 'event', json.loads(r['data'])])
            else:
                s = json.loads(r['data']) if isinstance(r['data'], str) else r['data']
                leaf = s[-1] if s else ''
                key = ' > '.join(s[-3:])
                if key != prev and leaf in ('CallTriggerService', 'Wait', 'FireTorpedo', 'WaitForController',
                                            'FollowPath', 'SetActuatorsArmed', 'CallSetBoolService', 'SetStatus'):
                    shot.append([round(t, 3), 'stack', s[-4:]])
                prev = key
    out['nereus_shot'] = {'source': 'Nereus media run 2026-10-30, RepairCompMpcTree, sim seconds from the torpedo release',
                          'rows': shot}

out['lines'] = lines
OUT.write_text(json.dumps(out, indent=1))
print('wrote', OUT, OUT.stat().st_size, 'bytes')
