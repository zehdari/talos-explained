# Builds public/data/localization/ekf.json for the localization chapter from the real config files:
#   riptide_core (followpath-speed): riptide_hardware/cfg/talos_ekf.yaml, riptide_imu/config/vectornav.yaml,
#     riptide_gyro/config/gyro_config.yaml, riptide_descriptions/config/talos.yaml
#   titan_firmware: talos/CameraCageBB/src/ros.c (depth variance)
#   nortek_dvl (DvlWaterTrackFallback): nortek_dvl/src/dvl_driver.cpp (DVL covariance = fom^2)
# Every value carries the file and line it came from, so the page can link to it.
#
#   python3 tools/localization/build_data.py
import json, os, re
import yaml

HOME = os.path.expanduser('~')
CORE = f'{HOME}/osu-uwrt/release/src/riptide_core'
FW = f'{HOME}/osu-uwrt/development/titan_firmware'
DVL = f'{HOME}/osu-uwrt/release/src/nortek_dvl'
OUT = os.path.join(os.path.dirname(__file__), '../../public/data/localization/ekf.json')

CORE_URL = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/'
FW_URL = 'https://github.com/osu-uwrt/titan_firmware/blob/master/'
DVL_URL = 'https://github.com/osu-uwrt/nortek_dvl/blob/DvlWaterTrackFallback/'


def lines(path):
    return open(path).read().split('\n')


def line_of(path, pattern, start=0):
    for i, l in enumerate(lines(path)[start:], start + 1):
        if re.search(pattern, l):
            return i
    raise KeyError(f'{pattern} not in {path}')


def link(base, root, rel, line=None, end=None):
    u = base + rel
    if line:
        u += f'#L{line}' + (f'-L{end}' if end else '')
    assert os.path.exists(os.path.join(root, rel)), rel
    return u


EKF_REL = 'riptide_hardware/cfg/talos_ekf.yaml'
ekf_path = f'{CORE}/{EKF_REL}'
ekf = yaml.safe_load(open(ekf_path))['/**/ekf_localization_node']['ros__parameters']
STATE = ['x', 'y', 'z', 'roll', 'pitch', 'yaw', 'vx', 'vy', 'vz', 'vroll', 'vpitch', 'vyaw', 'ax', 'ay', 'az']

sensors = []
for key, name in [('imu0', 'IMU'), ('twist1', 'FOG'), ('twist0', 'DVL'), ('pose0', 'Depth')]:
    ln = line_of(ekf_path, rf'^\s*{key}_config:')
    sensors.append({'key': key, 'name': name, 'topic': ekf[key], 'config': ekf[f'{key}_config'],
                    'queue': ekf.get(f'{key}_queue_size'), 'link': link(CORE_URL, CORE, EKF_REL, ln, ln + 4)})

q_line = line_of(ekf_path, r'^\s*process_noise_covariance:')
Q = ekf['process_noise_covariance']
q_diag = [Q[i * 15 + i] for i in range(15)]

# What each sensor's messages say about their own noise
VN_REL = 'riptide_imu/config/vectornav.yaml'
vn_path = f'{CORE}/{VN_REL}'
vn = yaml.safe_load(open(vn_path))['/**/riptide_imu']['ros__parameters']
GY_REL = 'riptide_gyro/config/gyro_config.yaml'
gy_path = f'{CORE}/{GY_REL}'
gy = yaml.safe_load(open(gy_path))['/**/riptide_gyro']['ros__parameters']
FW_REL = 'talos/CameraCageBB/src/ros.c'
# Linked on master (the local checkout may be on another branch), so read master's copy
import subprocess
fw_src = subprocess.run(['git', '-C', FW, 'show', f'origin/master:{FW_REL}'], capture_output=True, text=True, check=True).stdout.split('\n')
fw_line = next(i for i, l in enumerate(fw_src, 1) if 'depth_variance = ' in l)
fw_var = float(re.search(r'depth_variance = ([0-9.e-]+)', fw_src[fw_line - 1]).group(1))
DVL_REL = 'nortek_dvl/src/dvl_driver.cpp'
dvl_line = line_of(f'{DVL}/{DVL_REL}', r'covariance\[0\] = fom \* fom')

reported = {
    'imu_orientation': {'value': [vn['orientation_covariance'][0], vn['orientation_covariance'][4], vn['orientation_covariance'][8]],
                        'link': link(CORE_URL, CORE, VN_REL, line_of(vn_path, 'orientation_covariance'))},
    'imu_rate': {'value': vn['angular_velocity_covariance'][0],
                 'link': link(CORE_URL, CORE, VN_REL, line_of(vn_path, 'angular_velocity_covariance'))},
    'imu_accel': {'value': vn['linear_acceleration_covariance'][0],
                  'link': link(CORE_URL, CORE, VN_REL, line_of(vn_path, 'linear_acceleration_covariance'))},
    'fog_rate': {'value': gy['variance'], 'link': link(CORE_URL, CORE, GY_REL, line_of(gy_path, r'^\s*variance:'))},
    'depth': {'value': fw_var, 'link': f'{FW_URL}{FW_REL}#L{fw_line}'},
    'dvl': {'value': 'fom²', 'link': link(DVL_URL, DVL, DVL_REL, dvl_line, dvl_line + 2)},
}

# Sensor poses in talos.yaml (the URDF's source), for links from the frame explorer
DESC_REL = 'riptide_descriptions/config/talos.yaml'
desc_path = f'{CORE}/{DESC_REL}'
desc_lines = lines(desc_path)


def pose_line(block):
    i = line_of(desc_path, rf'^{block}:')
    return line_of(desc_path, r'pose:', i - 1)


poses = {
    'talos/base_link': link(CORE_URL, CORE, DESC_REL, line_of(desc_path, r'^base_link:')),
    'talos/base_inertia': link(CORE_URL, CORE, DESC_REL, line_of(desc_path, r'^com:')),
}
for frame, block in [('imu_link', 'imu'), ('dvl_link', 'dvl'), ('pressure_link', 'depth'), ('fog_link', 'fog'),
                     ('claw_link', 'claw'), ('magnet_link', 'magnet'), ('torpedo_link', 'torpedoes'),
                     ('droppers_link', 'droppers'), ('poker_link', 'poker'), ('hitch_link', 'hitch')]:
    poses['talos/' + frame] = link(CORE_URL, CORE, DESC_REL, pose_line(block))
ac = line_of(desc_path, r'^acoustics:')
poses['talos/acoustics_port_link'] = link(CORE_URL, CORE, DESC_REL, line_of(desc_path, r'pose:', ac))
poses['talos/acoustics_starboard_link'] = link(CORE_URL, CORE, DESC_REL, line_of(desc_path, r'pose:', line_of(desc_path, r'starboard:', ac)))
cam = line_of(desc_path, r'^cameras:')
poses['talos/ffc_base_link'] = link(CORE_URL, CORE, DESC_REL, line_of(desc_path, r'^\s*pose:', line_of(desc_path, r'name: ffc', cam)))
poses['talos/dfc_base_link'] = link(CORE_URL, CORE, DESC_REL, line_of(desc_path, r'^\s*pose:', line_of(desc_path, r'name: dfc', cam)))
th = line_of(desc_path, r'^thrusters:')
for k in range(8):
    poses[f'talos/thruster_{k}'] = link(CORE_URL, CORE, DESC_REL, [i for i, l in enumerate(desc_lines, 1) if i > th and re.search(r'^\s*pose:', l)][k])

out = {
    'source': 'Built by tools/localization/build_data.py from riptide_core followpath-speed, titan_firmware and nortek_dvl',
    'state': STATE,
    'sensors': sensors,
    'process_noise': {'diag': q_diag, 'link': link(CORE_URL, CORE, EKF_REL, q_line, q_line + 14)},
    'params': {k: ekf.get(k) for k in ['frequency', 'world_frame', 'odom_frame', 'base_link_frame', 'publish_acceleration',
                                       'predict_to_current_time', 'gravitational_acceleration',
                                       'imu0_remove_gravitational_acceleration']},
    'param_links': {k: link(CORE_URL, CORE, EKF_REL, line_of(ekf_path, rf'^\s*{k}:'))
                    for k in ['frequency', 'world_frame', 'predict_to_current_time', 'publish_acceleration', 'gravitational_acceleration']},
    'reported': reported,
    'poses': poses,
}
json.dump(out, open(OUT, 'w'), indent=1)
print('wrote', OUT, os.path.getsize(OUT), 'bytes')
print('Q diag', q_diag)
