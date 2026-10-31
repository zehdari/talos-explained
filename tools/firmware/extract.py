#!/usr/bin/env python3
"""Build public/data/firmware/firmware.json from titan_firmware (branch origin/master) and titan_canmore.

Everything is read with `git show origin/master:<path>` so the data matches what is linked on GitHub, not whatever branch
the local checkout happens to be on. Usage:

    python3 tools/firmware/extract.py ~/osu-uwrt/development/titan_firmware > public/data/firmware/firmware.json
"""
import json, re, subprocess, sys
from pathlib import PurePosixPath

REPO = sys.argv[1] if len(sys.argv) > 1 else '/home/cameron/osu-uwrt/development/titan_firmware'
REV = 'origin/master'  # the local master branch may be stale; GitHub's master is origin/master
GH = 'https://github.com/osu-uwrt/titan_firmware/blob/master/'


def git(*args, repo=REPO):
    return subprocess.run(['git', '-C', repo, *args], capture_output=True, text=True, check=True).stdout


def show(path):
    return git('show', f'{REV}:{path}')


def nocomment(cmake):
    return re.sub(r'#[^\n]*', '', cmake)


def ls(*prefix):
    return git('ls-tree', '-r', '--name-only', REV, *prefix).splitlines()


FILES = ls()
CANMORE_SHA = git('ls-tree', REV, 'lib/titan_canmore').split()[2]
CM_REPO = REPO + '/lib/titan_canmore'
PICO_SDK_SHA = git('ls-tree', REV, 'lib/pico-sdk').split()[2]
# Submodules: GitHub has no page for lib/<submodule> in titan_firmware, so link the pinned commit in its own repo.
SUBMODULE_URL = {
    'pico-sdk': f'https://github.com/raspberrypi/pico-sdk/tree/{PICO_SDK_SHA}',
    'titan_canmore': f'https://github.com/osu-uwrt/titan_canmore/tree/{CANMORE_SHA}',
}


def cm_show(path):
    return git('show', f'{CANMORE_SHA}:{path}', repo=CM_REPO)


def num(s):
    s = s.strip().rstrip('uUlL')
    return int(s, 0)


def defines(text):
    out = {}
    for name, val in re.findall(r'^\s*#define\s+(\w+)\s+([^\n/]+)', text, re.M):
        out[name] = val.strip()
    return out


def line_of(path, pattern):
    for i, l in enumerate(show(path).splitlines(), 1):
        if re.search(pattern, l):
            return i
    return None


def link(path, pattern=None):
    n = line_of(path, pattern) if pattern else None
    return GH + path + (f'#L{n}' if n else '')


# ---------------------------------------------------------------- libraries and who links them
lib_targets = {}   # cmake target -> lib dir
lib_links = {}     # cmake target -> [targets]
for f in FILES:
    if not f.startswith('lib/') or not f.endswith('CMakeLists.txt') or f.startswith('lib/pico-sdk') or f.startswith('lib/titan_canmore'):
        continue
    d = f.split('/')[1]
    s = nocomment(show(f))
    for t in re.findall(r'add_library\(\s*(\w+)', s):
        lib_targets[t] = d
    for t, body in re.findall(r'target_link_libraries\(\s*(\w+)\s+(?:INTERFACE|PUBLIC|PRIVATE)?([^)]*)\)', s, re.S):
        lib_links.setdefault(t, []).extend(re.findall(r'[A-Za-z_]\w*', body))
lib_targets['canmore'] = 'titan_canmore'
lib_links.setdefault('micro_ros_can', [])
# titan_bootloader is enabled by a function, not a link; titan_boards and the SDK are pulled in by titan_firmware_init.

LIB_DESC = {
    'pico-sdk': ('sdk', 'Raspberry Pi\'s C SDK for the RP2040: GPIO, PIO, timers, multicore, USB. A git submodule.'),
    'titan_boards': ('titan', 'One header per board (pins, CAN bus, client ID) and one per robot (namespace, CAN rates). PICO_BOARD and UWRT_ROBOT pick them.'),
    'titan_safety': ('titan', 'Watchdog, fault bits, kill switches, crash log and the core 1 check-in.'),
    'titan_bootloader': ('titan', 'The 16 kB bootloader that lets a board be reflashed over CAN or Ethernet.'),
    'titan_canmore': ('titan', 'The CANmore protocol: frame IDs, message fragmentation, heartbeats, register-mapped debug. A git submodule shared with the Orin-side tools.'),
    'titan_debug': ('titan', 'Debug server on CAN channel 14: crash log, faults, memory, GDB stub and remote commands for canmore_cli.'),
    'titan_logger': ('titan', 'LOG_INFO / LOG_WARN / LOG_ERROR with a unit name, printed to the debug UART.'),
    'titan_version': ('titan', 'Builds the version tag (major.minor, branch, commit, dirty flag, builder, time) into the image.'),
    'titan_binary_info': ('titan', 'Extra Pico binary-info records (CAN client IDs, version) that upload_tool reads out of a UF2.'),
    'titan_queue': ('titan', 'A small fixed-size queue used by drivers.'),
    'titan_dual_stdio_usb': ('titan', 'USB serial console that can also reboot the chip into its bootloader.'),
    'micro_ros_pico': ('ros', 'micro-ROS for the RP2040: the prebuilt libmicroros.a plus the CAN, USB and Ethernet transports.'),
    'driver_canbus': ('driver', 'The MCP2517FD CAN controller over SPI, CANmore framing, heartbeats and utility channels.'),
    'driver_async_i2c': ('driver', 'Interrupt-driven I2C, so sensor reads never block the main loop.'),
    'driver_depth': ('driver', 'MS5837 pressure sensor: zeroing, polling, depth.'),
    'driver_led': ('driver', 'The RGB status LED every board has.'),
    'driver_mcp3426': ('driver', 'MCP342x ADC (the POAC board\'s rail voltages).'),
    'driver_sht41': ('driver', 'SHT41 temperature and humidity sensor.'),
    'driver_status_strip': ('driver', 'The camera cage\'s RGB status strip.'),
    'driver_ssd1306': ('driver', 'SSD1306 OLED display (smart battery housings).'),
    'driver_dynamixel': ('driver', 'Dynamixel servo bus (older actuator designs).'),
    'driver_wiznet': ('driver', 'WIZnet Ethernet chip (Puddles\' backplane, not Talos).'),
    'driver_cd74hc4051': ('driver', 'CD74HC4051 analog multiplexer.'),
}

# ---------------------------------------------------------------- projects
PROJECTS = [
    ('talos/PoacBoard', 'POAC board', 'poac'),
    ('talos/ESCBoard', 'ESC boards', 'esc'),
    ('talos/CameraCageBB', 'Camera cage board', 'ccbb'),
    ('talos/LEDBoard', 'LED board', 'led'),
    ('talos/IVCBoard', 'IVC board', 'ivc'),
    ('talos/SmartBattery', 'Smart battery housings', 'sbh'),
]
client_h = cm_show('canmore/include/canmore/client_ids.h')
client_ids = {k: num(v) for k, v in defines(client_h).items() if k.startswith('CANMORE_CLIENT_ID_') or k.startswith('CANMORE_BUS_ID_')}

lib_faults = [('FAULT_WATCHDOG_RESET', 0), ('FAULT_WATCHDOG_WARNING', 1)]
FAULT_DESC = {
    'FAULT_WATCHDOG_RESET': 'The last reset was a crash (watchdog timeout, panic, hard fault or failed assert). Raised at boot; see the crash log.',
    'FAULT_WATCHDOG_WARNING': 'The main loop got within 50 ms of the watchdog timeout (500 ms before safety is initialised).',
    'FAULT_CAN_INTERNAL_ERROR': 'The CAN driver or the MCP2517FD reported an internal error.',
    'FAULT_ROS_ERROR': 'A micro-ROS call failed while setting up publishers and subscribers (RCRETCHECK).',
    'FAULT_TIMER_MISSED': 'A critical periodic task in the main loop ran late and skipped one or more runs.',
    'FAULT_ROS_BAD_COMMAND': 'A ROS command was rejected (bad kill slot, someone else trying to clear a locked kill, bad value).',
    'FAULT_ADC_ERROR': 'The MCP3428 rail-voltage ADC failed an I2C transfer.',
    'FAULT_SHT41_ERROR': 'The SHT41 temperature/humidity sensor failed to read.',
    'FAULT_RPM_CMD_TIMEOUT': 'RPM targets stopped arriving (500 ms) while a thruster was spinning.',
    'FAULT_RAW_MODE': 'The RPM loop is bypassed: targets go to the ESCs as raw throttle (tuning mode).',
    'FAULT_DEPTH_INIT_ERROR': 'The depth sensor failed to start or zero; the driver stops until restarted.',
    'FAULT_DEPTH_ERROR': 'Depth reads failed 5 times in a row, or a read overran.',
    'FAULT_LED_TEMP_WARN': 'LED module temperature warning.',
    'FAULT_LED_OVERTEMP': 'LED module over temperature: the LEDs are limited.',
    'FAULT_BUCK_OVERTEMP': 'LED driver over temperature.',
    'FAULT_BQ40_NOT_CONNECTED': 'The battery gauge (BQ40Z80) does not answer on SMBus.',
    'FAULT_BQ40_SAFETY_STATUS': 'The battery gauge reports a safety condition.',
    'FAULT_BQ40_PF_STATUS': 'The battery gauge reports a permanent failure.',
    'FAULT_BQ40_MISMATCHED_SERIAL': 'The gauge\'s serial number does not match the housing serial stored in flash.',
    'FAULT_BQ40_COMMAND_FAIL': 'A command to the battery gauge failed.',
}

project_out = []
for d, nice, pid in PROJECTS:
    cm = nocomment(show(d + '/CMakeLists.txt'))
    pico_board = re.search(r'set\(PICO_BOARD\s+([\w/]+)', cm).group(1)
    prog = re.search(r'pico_set_program_name\(\s*\w+\s+"([^"]+)"', cm).group(1)
    ver = re.search(r'titan_generate_version_tag\(\s*\w+\s+(\d+)\s+(\d+)', cm)
    bl = re.search(r'titan_enable_bootloader\(\s*\w+\s+(\w+)', cm)
    link_body = re.search(r'target_link_libraries\(\s*\w+\s+PUBLIC([^)]*)\)', cm, re.S).group(1)
    direct = re.findall(r'[A-Za-z_]\w*', link_body)
    # transitive closure inside titan_firmware's lib/
    seen, stack = set(), list(direct)
    while stack:
        t = stack.pop()
        if t in seen:
            continue
        seen.add(t)
        stack.extend(lib_links.get(t, []))
    libdirs = sorted({lib_targets[t] for t in seen if t in lib_targets} | {'pico-sdk', 'titan_boards', 'titan_version', 'titan_binary_info'} | ({'titan_bootloader'} if bl else set()))
    if 'driver_canbus' in libdirs:
        libdirs = sorted(set(libdirs) | {'titan_canmore', 'titan_debug'})
    srcs = [f for f in FILES if f.startswith(d + '/') and f.endswith(('.c', '.h'))]
    text = {f: show(f) for f in srcs}
    allsrc = '\n'.join(text.values())
    # board header -> bus and client id
    bh = show(f'lib/titan_boards/include/boards/{pico_board}.h')
    bdefs = defines(bh)
    bus = bdefs.get('CAN_BUS_NAME', '').replace('_CAN', '').lower() or None
    cid = bdefs.get('CAN_BUS_CLIENT_ID')
    ids = []
    if cid and cid in client_ids:
        ids = [client_ids[cid]]
    for k in ('CAN_BUS_BOARD0_CLIENT_ID', 'CAN_BUS_BOARD1_CLIENT_ID'):
        if k in bdefs and bdefs[k] in client_ids:
            ids.append(client_ids[bdefs[k]])
    # faults
    si = text.get(d + '/include/safety_interface.h', '')
    faults = lib_faults + [(n, int(i)) for n, i in re.findall(r'DEF\((FAULT_\w+),\s*(\d+)\)', si)]
    fault_rows = []
    for n, i in faults:
        raised = bool(re.search(r'safety_raise_fault\w*\(\s*' + n + r'\b', allsrc)) or n in ('FAULT_WATCHDOG_RESET', 'FAULT_WATCHDOG_WARNING', 'FAULT_ROS_ERROR', 'FAULT_CAN_INTERNAL_ERROR')
        # a raise that is commented out does not count
        if raised and n not in ('FAULT_WATCHDOG_RESET', 'FAULT_WATCHDOG_WARNING', 'FAULT_ROS_ERROR', 'FAULT_CAN_INTERNAL_ERROR'):
            live = [l for l in allsrc.splitlines() if re.search(r'safety_raise_fault\w*\(\s*' + n + r'\b', l) and not l.strip().startswith('//')]
            raised = bool(live)
        fault_rows.append({'bit': i, 'name': n.replace('FAULT_', ''), 'desc': FAULT_DESC.get(n, ''), 'raised': raised})
    # timers in main.c
    mainc = text.get(d + '/src/main.c', '')
    live_lines = [l for l in mainc.splitlines() if not l.strip().startswith('//') and not l.strip().startswith('#define')]
    timers = [{'name': n, 'ms': int(v), 'used': any(re.search(r'\b' + n + r'\b', l) for l in live_lines)}
              for n, v in re.findall(r'#define\s+(\w+(?:_MS|_INTERVAL))\s+(\d+)\b', mainc)]
    # topics
    pubs, subs = [], []
    for f, s in text.items():
        if not f.endswith('.c'):
            continue
        defs = dict(re.findall(r'#define\s+([A-Z_0-9]+)\s+"([^"]+)"', s))
        for kind, args in re.findall(r'rclc_(publisher|subscription)_init(?:_\w+)?\s*\((.*?)\);', s, re.S):
            ty = re.search(r'ROSIDL_GET_MSG_TYPE_SUPPORT\(\s*(\w+)\s*,\s*\w+\s*,\s*(\w+)\s*\)', args)
            nm = re.findall(r'\b([A-Z_0-9]+_NAME)\b', args)
            if not nm:
                continue
            row = {'topic': defs.get(nm[0], nm[0]), 'type': f'{ty.group(1)}/{ty.group(2)}' if ty else ''}
            (pubs if kind == 'publisher' else subs).append(row)
    dedup = lambda rows: sorted({r['topic']: r for r in rows}.values(), key=lambda r: r['topic'])
    kill = 'slots' if 'KILL_SWITCH_PHYSICAL' in allsrc else ('state/kill' if '"state/kill"' in allsrc else None)
    last = git('log', REV, '-1', '--format=%ad', '--date=short', '--', d).strip()
    project_out.append({
        'id': pid, 'name': nice, 'dir': d, 'url': GH.replace('/blob/', '/tree/') + d, 'pico_board': pico_board,
        'program_name': prog, 'version': f'{ver.group(1)}.{ver.group(2)}' if ver else None,
        'bootloader': bl.group(1) if bl else None, 'bus': bus, 'client_ids': ids,
        'libs': libdirs, 'faults': fault_rows, 'timers': timers, 'publishes': dedup(pubs), 'subscribes': dedup(subs),
        'kill_input': kill, 'last_change': last,
    })

libs_out = []
for f in sorted({f.split('/')[1] for f in FILES if f.startswith('lib/') and f.count('/') >= 2} | {'pico-sdk', 'titan_canmore'}):
    kind, desc = LIB_DESC.get(f, ('other', ''))
    libs_out.append({'name': f, 'kind': kind, 'desc': desc, 'used_by': [p['id'] for p in project_out if f in p['libs']],
                     'url': SUBMODULE_URL.get(f) or GH.replace('/blob/', '/tree/') + 'lib/' + f})

# ---------------------------------------------------------------- CANmore constants
proto = cm_show('canmore/include/canmore/protocol.h')
pd = defines(proto)
canmore = {
    'commit': CANMORE_SHA[:7],
    'fields': {k: num(pd[k]) for k in ['CANMORE_CLIENT_ID_LENGTH', 'CANMORE_TYPE_LENGTH', 'CANMORE_DIRECTION_LENGTH', 'CANMORE_NOC_LENGTH',
                                       'CANMORE_EXTRA_LENGTH', 'CANMORE_MSG_LEN_LENGTH', 'CANMORE_MSG_SUBTYPE_LENGTH', 'CANMORE_MSG_SINGLE_LENGTH']},
    'channels': {'thruster_cmds': num(pd['CANMORE_CHAN_THRUSTER_CMDS']), 'camera_feed': num(pd['CANMORE_CHAN_CAMERA_FEED']),
                 'remote_tty': num(pd['CANMORE_CHAN_REMOTE_TTY']), 'control_interface': num(pd['CANMORE_CHAN_CONTROL_INTERFACE']),
                 'heartbeat': num(pd['CANMORE_CHAN_HEARTBEAT'])},
    'modes': {k.replace('CANMORE_CONTROL_INTERFACE_MODE_', '').lower(): num(v) for k, v in pd.items() if k.startswith('CANMORE_CONTROL_INTERFACE_MODE_')},
    'heartbeat_interval_ms': num(pd['CANMORE_HEARTBEAT_INTERVAL_MS']),
    'max_msg_length': num(pd['CANMORE_MAX_MSG_LENGTH']),
    'max_frame': num(pd['CANMORE_MAX_FRAME_SIZE']), 'max_fd_frame': num(pd['CANMORE_MAX_FD_FRAME_SIZE']),
    'bootloader_request': re.search(r'BOOTLOADER_REQUEST\s*\\?\s*\{([^}]*)\}', proto).group(1).replace(' ', '').split(','),
    'crc18': {'poly': '0x23979', 'init': '0x3FFFF'},
    'client_ids': {k.replace('CANMORE_CLIENT_ID_', ''): v for k, v in client_ids.items() if k.startswith('CANMORE_CLIENT_ID_')},
    'links': {
        'protocol': f'https://github.com/osu-uwrt/titan_canmore/blob/{CANMORE_SHA}/canmore/include/canmore/protocol.h',
        'msg_encoding': f'https://github.com/osu-uwrt/titan_canmore/blob/{CANMORE_SHA}/canmore/src/msg_encoding.c',
        'client_ids': f'https://github.com/osu-uwrt/titan_canmore/blob/{CANMORE_SHA}/canmore/include/canmore/client_ids.h',
    },
}
talos_h = defines(show('lib/titan_boards/include/robots/talos.h'))
canmore['buses'] = {
    'internal': {'id': 1, 'fd': talos_h['INTERNAL_CAN_ENABLE_FD'] == '1', 'rate': num(talos_h['INTERNAL_CAN_RATE']), 'fd_rate': num(talos_h['INTERNAL_CAN_FD_RATE'])},
    'external': {'id': 2, 'fd': talos_h['EXTERNAL_CAN_ENABLE_FD'] == '1', 'rate': num(talos_h['EXTERNAL_CAN_RATE'])},
}

# ---------------------------------------------------------------- safety, ESC, bootloader, depth constants
sint = defines(show('lib/titan_safety/src/safety_internal.h'))
sh = defines(show('lib/titan_safety/include/titan/safety.h'))
safety = {
    'watchdog_setup_ms': num(sint['SAFETY_WATCHDOG_SETUP_TIMER_MS']), 'watchdog_active_ms': num(sint['SAFETY_WATCHDOG_ACTIVE_TIMER_MS']),
    'warn_setup_ms': num(sint['SAFETY_WATCHDOG_SETUP_FAULT_LESS_THAN_MS']), 'warn_active_ms': num(sint['SAFETY_WATCHDOG_ACTIVE_FAULT_LESS_THAN_MS']),
    'core1_checkin_ms': num(sint['SAFETY_CORE1_CHECKIN_INTERVAL_MS']), 'kill_timeout_ms': num(sh['SAFETY_KILL_SWITCH_TIMEOUT_MS']),
    'crash_log_entries': num(sh['SAFETY_NUM_CRASH_LOG_ENTRIES']), 'max_fault_id': num(sh['MAX_FAULT_ID']),
    'links': {'safety_h': link('lib/titan_safety/include/titan/safety.h'), 'safety_c': link('lib/titan_safety/src/safety.c', r'void safety_tick'),
              'internal_h': link('lib/titan_safety/src/safety_internal.h', 'SAFETY_WATCHDOG_SETUP_TIMER_MS'),
              'kill_switch_c': link('lib/titan_safety/src/kill_switch.c', 'safety_internal_kill_refresh_switches')},
}
dshot = defines(show('talos/ESCBoard/include/dshot.h'))
core1 = show('talos/ESCBoard/src/core1.c')
flags = re.findall(r'#define\s+CORE1_DISABLED_(\w+)\s+(\d+)', show('talos/ESCBoard/include/core1.h'))
esc = {k.lower(): num(dshot[k]) for k in ['DSHOT_MIN_UPDATE_RATE_MS', 'DSHOT_UPDATE_DISABLE_TIME_MS', 'ESC_POWERUP_DELAY_MS', 'DSHOT_RATE',
                                         'ESC_POWER_THRESHOLD_MV', 'TELEM_PACKET_DELAY', 'TELEM_MAX_MISSED_DSHOT_PACKETS', 'DSHOT_MIN_FRAME_TIME_US', 'ESC_NUM_POLE_PAIRS']}
esc['disabled_flags'] = [{'bit': int(b), 'name': n} for n, b in flags]
for k in ['p_gain', 'i_gain', 'i_bound', 'hard_limit', 'min_command']:
    esc[k] = int(re.search(r'core1_set_' + k + r'\((\d+)\)', core1).group(1))
esc['links'] = {'dshot_h': link('talos/ESCBoard/include/dshot.h', 'ESC_POWERUP_DELAY_MS'), 'core1_c': link('talos/ESCBoard/src/core1.c', 'Phase 2'),
                'main_c': link('talos/ESCBoard/src/main.c', 'thruster_cmd_callback'), 'dshot_c': link('talos/ESCBoard/src/dshot.c', 'dshot_update_thrusters'),
                'controller': link('talos/ESCBoard/src/Thruster_Controller/ThrusterController.c', 'thruster_controller_tick'),
                'ros_c': link('talos/ESCBoard/src/ros.c', 'ros_send_telemetry')}
blm = defines(show('lib/titan_bootloader/src/main.c'))
ld = show('lib/titan_bootloader/bootloader_runtime/memmap_bootloader.ld')
bootloader = {k.lower(): num(blm[k]) for k in ['WATCHDOG_TIMEOUT_MS', 'LINK_DELAY_MS', 'BOOT_DELAY_MS', 'BOOTLOADER_TIMEOUT_SEC']}
bootloader['size'] = re.search(r'FLASH_BL\(rx\)\s*:\s*ORIGIN = (\w+), LENGTH = (\w+)', ld).group(2)
bootloader['app_origin'] = re.search(r'FLASH_APP\(r\)\s*:\s*ORIGIN = (\w+)', ld).group(1)
bootloader['links'] = {'main_c': link('lib/titan_bootloader/src/main.c', 'int main'), 'ld': link('lib/titan_bootloader/bootloader_runtime/memmap_bootloader.ld', 'FLASH_BL')}
dh = defines(show('lib/driver_depth/include/driver/depth.h'))
dc = show('lib/driver_depth/src/depth.c')
depth = {'polling_ms': num(dh['DEPTH_POLLING_RATE_MS']), 'bad_reads_fault': num(dh['DEPTH_BAD_READS_FAULT_COUNT']),
         'fluid_density': num(re.search(r'#define FLUID_DENSITY (\d+)', dc).group(1)),
         'oversampling': num(defines(show('lib/driver_depth/src/ms5837_commands.h'))['DEPTH_OVERSAMPLING'])}

out = {
    'generated_by': 'tools/firmware/extract.py',
    'titan_firmware': {'rev': 'master', 'commit': git('rev-parse', '--short', REV).strip(), 'date': git('log', REV, '-1', '--format=%ad', '--date=short').strip()},
    'projects': project_out, 'libs': libs_out, 'canmore': canmore, 'safety': safety, 'esc': esc, 'bootloader': bootloader, 'depth': depth,
}
json.dump(out, sys.stdout, indent=1)
print()
