// A two-state Kalman filter in the shape robot_localization uses for one axis: a value s and its rate d, with
// s' = d and d a random walk. Q is per second and scaled by the time step, as in robot_localization's ekf.cpp
// (P += dt * Q). Two sensors: one measures s, one measures d. A measurement older than the filter's last update
// is applied to the current state (smooth_lagged_data off), or the filter rewinds to its stamp and replays the
// newer measurements (smooth_lagged_data on).
//
// Two set-ups, both with Talos's numbers:
//   velocity: s = surge velocity (DVL, 8 Hz, 125 ms old), d = acceleration (IMU, 400 Hz)
//   rate:     s = pitch angle (IMU attitude, 400 Hz),      d = pitch rate (IMU gyro, 400 Hz)

// Deterministic noise: the same draws on every run, so moving a slider changes only the filter.
function gaussian(seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return () => {
    const u = Math.max(rand(), 1e-12), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

// Smooth 0 -> 1 between t0 and t1 (and its derivative), for jerk-free test motions.
function ramp(t, t0, t1) {
  if (t <= t0) return [0, 0];
  if (t >= t1) return [1, 0];
  const u = (t - t0) / (t1 - t0);
  return [u * u * (3 - 2 * u), (6 * u * (1 - u)) / (t1 - t0)];
}

// Truth profiles: [value, rate] at time t.
const PROFILES = {
  // Surge out to 0.5 m/s and back, ramps as long as the real ones (about 1.5 s).
  velocity: (t) => {
    const [u1, du1] = ramp(t, 1.0, 2.5), [u2, du2] = ramp(t, 6.5, 8.0);
    return [0.5 * (u1 - u2), 0.5 * (du1 - du2)];
  },
  // Pitch tilted by about 10 degrees forward, then back past level, then level: like tilting Talos by hand.
  rate: (t) => {
    const a = 0.17;
    const [u1, d1] = ramp(t, 1.0, 2.0), [u2, d2] = ramp(t, 3.5, 5.0), [u3, d3] = ramp(t, 6.5, 7.5);
    return [a * (u1 - 2 * u2 + u3), a * (d1 - 2 * d2 + d3)];
  },
};

// Talos's numbers. *True: the sensors' real noise (Nereus robot.yaml, measured in 2026-10-03 pool bags).
// R*: the covariance the messages report. Q*: talos_ekf.yaml process noise for that axis.
export const SETUPS = {
  velocity: {
    T: 10, plot: 0, unit: 'm/s', digits: 3,
    sRate: 8, sAge: 0.125, sTrue: 0.006, Rs: 7.6e-7, // DVL: 6 mm/s (robot.yaml); fom^2 median 7.6e-7 (2026-10-26 pool run)
    dRate: 400, dAge: 0, dTrue: 0.035, Rd: 0.01,      // IMU accel: vectornav.yaml linear_acceleration_covariance
    Qs: 2.5e-5, Qd: 1e-5,                             // vx, ax
  },
  rate: {
    T: 9, plot: 1, unit: 'rad/s', digits: 3,
    sRate: 400, sAge: 0, sTrue: 0.0002, Rs: 5e-5,     // IMU attitude (body pitch = IMU x): orientation_covariance
    dRate: 400, dAge: 0, dTrue: 0.0009, Rd: 0.01,     // IMU gyro: angular_velocity_covariance
    Qs: 3e-5, Qd: 1e-5,                               // pitch, pitch rate
  },
};

// Runs the filter. o: a SETUPS entry with any overrides; o.smooth: replay late measurements in stamp order.
// Returns { dt, truth, meas: [{t, stamp, y}] for the plotted state's sensor, est, lag, gain, noise }. The filter runs
// twice, on noisy and on noise-free measurements: lag and gain come from the noise-free run, and noise is how far
// the noisy run strays from it (RMS), so the two effects are measured apart.
export function run(kind, o) {
  const clean = filter(kind, o, false), noisy = filter(kind, o, true);
  const { lag, gain } = xlag(clean.truth, clean.est, clean.dt);
  let ss = 0;
  for (let i = 0; i < noisy.est.length; i++) ss += (noisy.est[i] - clean.est[i]) ** 2;
  return { ...noisy, clean: clean.est, lag, gain, noise: Math.sqrt(ss / noisy.est.length) };
}

function filter(kind, o, withNoise) {
  const prof = PROFILES[kind];
  const dt = 1 / 400, n = Math.round(o.T / dt);
  const g1 = gaussian(11), g2 = gaussian(23);
  const gs = withNoise ? g1 : () => 0, gd = withNoise ? g2 : () => 0;
  // Measurements with their stamps (when measured) and arrival times.
  const ms = [];
  const sStep = Math.round(400 / o.sRate), dStep = Math.round(400 / o.dRate);
  for (let i = 0; i <= n; i++) {
    const t = i * dt, [s, d] = prof(t);
    if (i % sStep === 0) ms.push({ k: 0, stamp: t, arrive: t + o.sAge, y: s + o.sTrue * gs() });
    if (i % dStep === 0) ms.push({ k: 1, stamp: t, arrive: t + o.dAge, y: d + o.dTrue * gd() });
  }
  ms.sort((a, b) => a.arrive - b.arrive || a.k - b.k);

  // State x = [s, d], covariance P (symmetric 2x2: p00, p01, p11).
  let x0 = 0, x1 = 0, p00 = 1, p01 = 0, p11 = 1, tf = 0;
  const predict = (to) => {
    const h = to - tf;
    if (h <= 0) return;
    x0 += h * x1;
    // P = F P F' + h Q, F = [[1, h], [0, 1]]
    p00 += 2 * h * p01 + h * h * p11 + h * o.Qs;
    p01 += h * p11;
    p11 += h * o.Qd;
    tf = to;
  };
  const correct = (k, y) => {
    if (k === 0) {
      const S = p00 + o.Rs, K0 = p00 / S, K1 = p01 / S, r = y - x0;
      x0 += K0 * r; x1 += K1 * r;
      const n00 = (1 - K0) * p00, n01 = (1 - K0) * p01, n11 = p11 - K1 * p01;
      p00 = n00; p01 = n01; p11 = n11;
    } else {
      const S = p11 + o.Rd, K0 = p01 / S, K1 = p11 / S, r = y - x1;
      x0 += K0 * r; x1 += K1 * r;
      const n00 = p00 - K0 * p01, n01 = (1 - K1) * p01, n11 = (1 - K1) * p11;
      p00 = n00; p01 = n01; p11 = n11;
    }
  };
  const snap = () => ({ x0, x1, p00, p01, p11, tf });
  const load = (z) => ({ x0, x1, p00, p01, p11, tf } = z);

  // Process in arrival order. With smoothing, a measurement older than the filter rewinds to the last snapshot
  // before its stamp and replays everything applied since, in stamp order.
  const applied = []; // [{m, before: snapshot}] in stamp order
  const out = new Float64Array(n + 1);
  let mi = 0;
  for (let i = 0; i <= n; i++) {
    const t = i * dt;
    while (mi < ms.length && ms[mi].arrive <= t + 1e-9) {
      const m = ms[mi++];
      if (o.smooth && m.stamp < tf - 1e-9) {
        let j = applied.length;
        while (j > 0 && applied[j - 1].m.stamp > m.stamp) j--;
        const redo = applied.splice(j);
        if (redo.length) load(redo[0].before);
        for (const e of [{ m }, ...redo]) {
          e.before = snap();
          predict(e.m.stamp);
          correct(e.m.k, e.m.y);
          applied.push(e);
        }
      } else {
        const before = snap();
        predict(m.stamp); // no-op when the measurement is older than the filter: it corrects the current state
        correct(m.k, m.y);
        applied.push({ m, before });
      }
      while (applied.length > 800) applied.shift(); // history_length: about 1 s at 800 measurements per s
    }
    // Output: predict to now on a copy (predict_to_current_time), like the 30 Hz publish.
    const h = t - tf;
    out[i] = o.plot === 0 ? x0 + Math.max(h, 0) * x1 : x1;
  }

  const truth = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) truth[i] = prof(i * dt)[o.plot];
  const meas = ms.filter((m) => m.k === o.plot).map((m) => ({ t: m.arrive, stamp: m.stamp, y: m.y })).filter((m) => m.t <= o.T);
  return { dt, truth, est: out, meas };
}

// Lag and gain of b against a, as in ~/robot/ekf_replay/analyze.py: the shift with the best correlation, then a
// least-squares scale at that shift.
function xlag(a, b, dt) {
  const n = a.length, ma = mean(a), mb = mean(b);
  let best = -Infinity, bk = 0;
  for (let k = Math.round(-0.1 / dt); k <= Math.round(1.0 / dt); k += 2) {
    let c = 0, na = 0, nb = 0;
    for (let i = Math.max(0, -k); i < n - Math.max(0, k); i++) {
      const x = a[i] - ma, y = b[i + k] - mb;
      c += x * y; na += x * x; nb += y * y;
    }
    const r = c / Math.sqrt(na * nb || 1);
    if (r > best) { best = r; bk = k; }
  }
  let xy = 0, xx = 0;
  for (let i = Math.max(0, -bk); i < n - Math.max(0, bk); i++) { const x = a[i] - ma, y = b[i + bk] - mb; xy += x * y; xx += x * x; }
  return { lag: bk * dt, gain: xy / (xx || 1) };
}
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
