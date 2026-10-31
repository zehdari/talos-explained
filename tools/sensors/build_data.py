# Builds public/data/sensors/*.json from bags extracted with extract.py and from the release configs.
#   python3 extract.py ~/robot/bench/imu_ekf_bench/imu_ekf_bench_0.db3 /tmp/sens_bench.npz      (2026-10-27, IMU rate cov 0.01)
#   python3 extract.py ~/robot/bench/imu_ekf_bench2/imu_ekf_bench2_0.db3 /tmp/sens_bench2.npz    (same day, rate cov 1e-5)
#   python3 extract.py ~/robot/mpc_ident/runs/talos_20261026_204748/bag/bag_0.db3 /tmp/sens_pool.npz  (pool, 2026-10-26)
#   python3 build_data.py
import json, os
import numpy as np
import yaml

HOME = os.path.expanduser('~')
OUT = os.path.join(os.path.dirname(__file__), '../../public/data/sensors')
os.makedirs(OUT, exist_ok=True)
R2D = 180 / np.pi
CORE = HOME + '/osu-uwrt/release/src/riptide_core'


def r(a, n=4):
    return [round(float(x), n) for x in a]


def binmean(t, y, dt, t0, t1):
    """Mean of y in bins of width dt (drops empty bins)."""
    edges = np.arange(t0, t1 + 1e-9, dt)
    idx = np.digitize(t, edges) - 1
    ok = (idx >= 0) & (idx < len(edges) - 1)
    s = np.bincount(idx[ok], y[ok], len(edges) - 1)
    c = np.bincount(idx[ok], None, len(edges) - 1)
    m = c > 0
    return (edges[:-1] + dt / 2)[m], s[m] / c[m]


def save(name, obj):
    p = os.path.join(OUT, name)
    with open(p, 'w') as f:
        json.dump(obj, f, separators=(',', ':'))
    print(name, os.path.getsize(p) // 1024, 'KB')


def load(p):
    d = np.load(p)
    return d, d['t_start'][0]


# IMU axes -> body axes: imu_link is roll 180 deg, yaw -90 deg from the body (talos.yaml imu pose), so
# body roll rate = -imu y, pitch rate = -imu x, yaw rate = -imu z (checked against the FOG and the EKF: r = -0.999).
def body_rates(imu):
    return -imu[:, 3], -imu[:, 2], -imu[:, 4]


# ---------- still on the bench: noise and heading drift ----------
bA, tA = load('/tmp/sens_bench.npz')
bB, tB = load('/tmp/sens_bench2.npz')
still = {}
imu, fog = bB['vectornav_imu'], bB['gyro_twist']
ti, tf = imu[:, 1] - tB, fog[:, 1] - tB
w0 = 60.0
m, mf = (ti >= w0) & (ti < w0 + 2), (tf >= w0) & (tf < w0 + 2)
_, _, yaw_imu = body_rates(imu)
roll_imu, pitch_imu, _ = body_rates(imu)
still['noise'] = {
    'imu_t': r(ti[m] - w0, 4), 'imu_yaw': r(yaw_imu[m] * R2D, 4), 'imu_roll': r(roll_imu[m] * R2D, 4),
    'fog_t': r(tf[mf] - w0, 4), 'fog_yaw': r(fog[mf, 5] * R2D, 4),
}
stats = {}
for name, (d, t0, a, b) in {'A': (bA, tA, 57, 150), 'B': (bB, tB, 42, 149)}.items():
    imu, fog = d['vectornav_imu'], d['gyro_twist']
    ti, tf = imu[:, 1] - t0, fog[:, 1] - t0
    m, mf = (ti >= a) & (ti < b), (tf >= a) & (tf < b)
    roll, pitch, yaw = body_rates(imu)
    # integrate each rate over the still window (trapezoid on its own stamps), sample at 5 Hz
    hi = np.concatenate([[0], np.cumsum(np.diff(ti[m]) * (yaw[m][1:] + yaw[m][:-1]) / 2)]) * R2D
    hf = np.concatenate([[0], np.cumsum(np.diff(tf[mf]) * (fog[mf, 5][1:] + fog[mf, 5][:-1]) / 2)]) * R2D
    grid = np.arange(0, b - a, 0.2)
    still['drift' + name] = {'t': r(grid, 2), 'imu': r(np.interp(grid, ti[m] - a, hi), 4), 'fog': r(np.interp(grid, tf[mf] - a, hf), 4)}
    acc = imu[m, 5:8]
    stats[name] = {
        'seconds': b - a,
        'imu_rate_std_rad_s': r(np.array([roll[m].std(), pitch[m].std(), yaw[m].std()]), 6),
        'fog_rate_std_rad_s': round(float(fog[mf, 5].std()), 6),
        'imu_yaw_bias_deg_h': round(float(yaw[m].mean() * R2D * 3600), 2),
        'fog_bias_deg_h': round(float(fog[mf, 5].mean() * R2D * 3600), 2),
        'accel_std_m_s2': r(acc.std(0), 4),
        'imu_hz': round(float(m.sum() / (b - a)), 1), 'fog_hz': round(float(mf.sum() / (b - a)), 1),
        'imu_rate_cov': float(imu[0, 13]),
    }
still['stats'] = stats
save('still.json', still)
print(json.dumps(stats, indent=1))

# (The EKF roll-rate comparison moved to the localization chapter, localization.html#lag.)

# ---------- pool: DVL, depth and yaw rate (ident run talos_20261026_204748, untethered) ----------
P, tP = load('/tmp/sens_pool.npz')
dv, dp, fg, im = P['dvl_twist'], P['depth_pose'], P['gyro_twist'], P['vectornav_imu']
c, s = np.cos(-np.pi / 4), np.sin(-np.pi / 4)  # dvl_link yaw -45 deg (talos.yaml dvl pose)
pool = {}
a, b = 440, 540
m = (dv[:, 1] - tP >= a) & (dv[:, 1] - tP < b)
x, y = dv[m, 2], dv[m, 3]
pool['dvl'] = {'t0': a, 't': r(dv[m, 1] - tP - a, 3), 'x': r(x), 'y': r(y), 'z': r(dv[m, 4]),
               'bx': r(c * x - s * y), 'by': r(s * x + c * y)}
a, b = 680, 940
md = (dp[:, 1] - tP >= a) & (dp[:, 1] - tP < b)
tdp, zdp = binmean(dp[md, 1] - tP, dp[md, 2], 0.2, a, b)
mv = (dv[:, 1] - tP >= a) & (dv[:, 1] - tP < b)
tv, vz = dv[mv, 1] - tP, dv[mv, 4]
zint = zdp[0] + np.concatenate([[0], np.cumsum(np.diff(tv) * (vz[1:] + vz[:-1]) / 2)])
pool['depth'] = {'t0': a, 't': r(tdp - a, 2), 'z': r(zdp, 4), 'dvl_t': r(tv - a, 3), 'dvl_z': r(zint, 4), 'dvl_vz': r(vz)}
a, b = 820, 940
tfg, yf = binmean(fg[:, 1] - tP, fg[:, 5], 0.05, a, b)
tim, yi = binmean(im[:, 1] - tP, -im[:, 4], 0.05, a, b)
pool['yaw'] = {'t0': a, 'fog_t': r(tfg - a, 3), 'fog': r(yf * R2D, 3), 'imu_t': r(tim - a, 3), 'imu': r(yi * R2D, 3)}
pool['dvl_age_ms'] = r(np.percentile(dv[:, 0] - dv[:, 1], [5, 50, 95]) * 1e3, 1)
pool['dvl_fom'] = round(float(np.sqrt(np.median(dv[:, 6]))), 5)
pool['dvl_gap_max_s'] = round(float(np.diff(dv[:, 0]).max()), 2)
# DVL scatter while holding still: per-axis std in 5 s windows whose mean |v| < 1 cm/s and peak |v| < 3 cm/s
# (includes any real motion during the hold, so it is an upper bound on sensor noise)
hold = []
for a0 in np.arange(0, dv[-1, 1] - tP - 5, 2.5):
    m = (dv[:, 1] - tP >= a0) & (dv[:, 1] - tP < a0 + 5)
    if m.sum() < 30:
        continue
    v = dv[m, 2:5]
    if np.abs(v.mean(0)).max() < 0.01 and np.abs(v).max() < 0.03:
        hold.append(v.std(0))
pool['dvl_hold_std_mm_s'] = {'windows': len(hold), 'median': r(np.median(hold, 0) * 1e3, 2)}
save('pool.json', pool)

# ---------- one second of messages (receive time on the Orin) ----------
T0 = tP + 470.0
tl = {}
for key, name in [('vectornav_imu', 'IMU'), ('gyro_twist', 'FOG'), ('depth_pose', 'Depth'), ('dvl_twist', 'DVL'),
                  ('odometry_filtered', 'EKF'), ('controller_mpc_state', 'MPC')]:
    a = P[key]
    m = (a[:, 0] >= T0 - 0.2) & (a[:, 0] < T0 + 1.0)
    tl[name] = {'recv': r(a[m, 0] - T0, 5), 'stamp': r(a[m, 1] - T0, 5)}
    print(name, int(((a[:, 0] >= T0) & (a[:, 0] < T0 + 1)).sum()), 'msgs in 1 s')
save('timeline.json', tl)

# ---------- catalog: poses and parameters straight from the configs ----------
talos = yaml.safe_load(open(CORE + '/riptide_descriptions/config/talos.yaml'))
gyro = yaml.safe_load(open(CORE + '/riptide_gyro/config/gyro_config.yaml'))['/**/riptide_gyro']['ros__parameters']
imucfg = yaml.safe_load(open(CORE + '/riptide_imu/config/vectornav.yaml'))['/**/riptide_imu']['ros__parameters']
cat = {
    'base_link': talos['base_link'], 'com': talos['com'],
    'poses': {k: talos[k]['pose'] for k in ['imu', 'fog', 'dvl', 'depth']},
    'hydrophones': {k: talos['acoustics'][k]['pose'] for k in ['port', 'starboard']},
    'gyro': {k: gyro[k] for k in ['a', 'b', 'c', 'd', 'f', 'g', 'rate_norm_mean', 'rate_norm_std', 'temp_norm_mean', 'temp_norm_std', 'cal_temp_limits', 'variance', 'max_publish_rate']},
    'imu_cov': {k: imucfg[k] for k in ['orientation_covariance', 'angular_velocity_covariance', 'linear_acceleration_covariance']},
}
save('catalog.json', cat)
