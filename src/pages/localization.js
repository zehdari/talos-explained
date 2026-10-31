import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/localization.css';
import { LineChart } from '../viz/chart.js';
import { Graph } from '../viz/graph.js';
import { createTfExplorer } from '../viz/localization-tf.js';
import { run, SETUPS } from '../viz/localization-kf.js';

setup();

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const getJSON = (path) => fetch(BASE + path).then((r) => r.json());
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// 2.5e-5 -> "2.5×10⁻⁵"; 0.01 -> "0.01"
function sci(v) {
  if (v >= 0.001 && v < 1000) return String(+v.toPrecision(3));
  const e = Math.floor(Math.log10(v)), m = +(v / 10 ** e).toPrecision(2);
  return `${m === 1 ? '' : m + '×'}10${String(e).split('').map((c) => SUP[c]).join('')}`;
}

// A segmented control already in the HTML: calls onPick(data-k) and keeps aria-pressed in step.
function segment(host, onPick) {
  const buttons = [...host.querySelectorAll('button')];
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset.k);
  }));
}
function setSeg(host, k) {
  host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.k === k)));
}

const tfP = getJSON('data/rosgraph/tf.json');
const ekfP = getJSON('data/localization/ekf.json');
const silP = getJSON('data/localization/silhouettes.json');
const replayP = getJSON('data/localization/replay.json');

// ---------------------------------------------------------------- 1. TF explorer
Promise.all([tfP, silP, ekfP]).then(([tf, sil, ekf]) => {
  createTfExplorer({
    views: document.getElementById('tfx-views'),
    tree: document.getElementById('tfx-tree'),
    card: document.getElementById('tfx-card'),
    side: document.querySelector('#tfx .tfx-side'),
    tf, sil, links: ekf.poses,
  });
});

// ---------------------------------------------------------------- 2. which sensor feeds which state
const GROUPS = [['Position', 'm'], ['Angle', 'rad'], ['Velocity', 'm/s'], ['Rate', 'rad/s'], ['Accel.', 'm/s²']];
const AXES = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'];
const SENSOR = {
  IMU: { color: '--state', what: 'VN-100: roll and pitch (from its own gravity-referenced filter), roll and pitch rates, and the three accelerations with gravity removed. Not yaw, not yaw rate.', rate: '400 Hz' },
  FOG: { color: '--s7', what: 'Fibre-optic gyro: yaw rate only. Yaw itself is its integral.', rate: '≈475 Hz (throttled to 500)' },
  DVL: { color: '--prediction', what: 'Velocity over the pool floor, all three axes, turned into the body with the −45° mount and the lever arm removed. Only published while it has bottom lock.', rate: '8 Hz, each reading ≈125 ms old' },
  Depth: { color: '--s4', what: 'z only: base_link\'s height, negative below the surface, from depth_converter.py.', rate: '20 Hz' },
};
function stateNote(i, ekf) {
  const g = Math.floor(i / 3), axis = g === 1 || g === 3 ? AXES[3 + (i % 3)] : AXES[i % 3];
  const name = ['position', 'angle', 'velocity', 'rate', 'acceleration'][g];
  const by = ekf.sensors.filter((s) => s.config[i]).map((s) => s.name);
  const extra = {
    0: 'Nothing measures it: integrated from the DVL\'s velocity, so it drifts.',
    1: 'Nothing measures it: integrated from the DVL\'s velocity, so it drifts.',
    2: 'The only position anything measures outright.',
    3: 'Absolute: the IMU senses gravity.', 4: 'Absolute: the IMU senses gravity.',
    5: 'Nothing measures it: integrated from the FOG\'s yaw rate, starting at 0 when the EKF starts.',
    6: 'In the body: surge.', 7: 'In the body: sway.', 8: 'In the body: heave.',
    9: 'Reported by the IMU as 100× noisier (σ) than it is.', 10: 'Reported by the IMU as 100× noisier (σ) than it is.',
    11: 'The FOG, whose bias barely moves.',
    12: `Gravity removed with g = ${ekf.params.gravitational_acceleration} m/s².`,
  }[i] || '';
  const label = axis === 'x' || axis === 'y' || axis === 'z' ? `${axis} ${name}` : `${axis} ${name}`;
  return `<b>${label[0].toUpperCase() + label.slice(1)}.</b> ${by.length ? 'Measured by the ' + by.join(' and the ') + '.' : ''} ${extra} Process noise ${sci(ekf.process_noise.diag[i])} per second.`;
}
ekfP.then((ekf) => {
  const host = document.getElementById('fuse'), note = document.getElementById('fuse-note');
  const order = ['IMU', 'FOG', 'DVL', 'Depth'];
  const sensors = order.map((n) => ekf.sensors.find((s) => s.name === n));
  const qlog = ekf.process_noise.diag.map((q) => Math.log10(q));
  const qmin = Math.min(...qlog), qmax = Math.max(...qlog);
  let h = '<div class="fuse-grid">';
  h += '<div class="fuse-corner"></div>' + GROUPS.map(([g, u]) => `<div class="fuse-group">${g}<small>${u}</small></div>`).join('');
  h += '<div class="fuse-corner"></div>';
  for (let i = 0; i < 15; i++) {
    const g = Math.floor(i / 3), a = g === 1 || g === 3 ? ['r', 'p', 'y'][i % 3] : ['x', 'y', 'z'][i % 3];
    h += `<button type="button" class="fuse-axis g${g}" data-col="${i}" aria-label="${ekf.state[i]}">${a}</button>`;
  }
  for (const s of sensors) {
    const c = SENSOR[s.name].color;
    h += `<button type="button" class="fuse-label" data-row="${s.name}"><i style="background:var(${c})"></i>${s.name}</button>`;
    s.config.forEach((on, i) => {
      h += `<button type="button" class="fuse-cell g${Math.floor(i / 3)}${on ? ' on' : ''}" data-col="${i}" style="${on ? `--c:var(${c})` : ''}" aria-label="${s.name} ${ekf.state[i]}: ${on ? 'fused' : 'not fused'}"></button>`;
    });
  }
  h += '<div class="fuse-label q">Q</div>';
  ekf.process_noise.diag.forEach((q, i) => {
    const t = (qlog[i] - qmin) / (qmax - qmin || 1);
    h += `<button type="button" class="fuse-q g${Math.floor(i / 3)}" data-col="${i}" style="--t:${(0.18 + 0.82 * t).toFixed(2)}" aria-label="process noise ${sci(q)}"></button>`;
  });
  h += '</div>';
  host.innerHTML = h;
  const DEFAULT = `Rows are the four inputs in <a href="${ekf.process_noise.link.split('#')[0]}">talos_ekf.yaml</a>; columns are the 15 states. Process noise runs from ${sci(Math.min(...ekf.process_noise.diag))} to ${sci(Math.max(...ekf.process_noise.diag))} per second (<a href="${ekf.process_noise.link}">L${ekf.process_noise.link.split('#L')[1]}</a>).`;
  note.innerHTML = DEFAULT;
  const clear = () => host.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    clear();
    if (b.dataset.col !== undefined) {
      const i = +b.dataset.col;
      host.querySelectorAll(`[data-col="${i}"]`).forEach((x) => x.classList.add('hot'));
      note.innerHTML = stateNote(i, ekf);
    } else {
      const s = ekf.sensors.find((x) => x.name === b.dataset.row), info = SENSOR[s.name];
      b.classList.add('hot');
      note.innerHTML = `<b>${s.name}</b> (<code>${esc(s.topic)}</code>, ${info.rate}). ${info.what} <a href="${s.link}">Its line in the config</a>.`;
    }
  });

  // The covariances the messages report, against the real noise
  const R = ekf.reported;
  const rows = [
    ['IMU roll, pitch', 'orientation_covariance', R.imu_orientation.link, `${sci(R.imu_orientation.value[0])}, ${sci(R.imu_orientation.value[1])}`, 0.0002, 'rad', ', filtered'],
    ['IMU rates', 'angular_velocity_covariance', R.imu_rate.link, sci(R.imu_rate.value), 0.0009, 'rad/s'],
    ['IMU acceleration', 'linear_acceleration_covariance', R.imu_accel.link, sci(R.imu_accel.value), 0.035, 'm/s²'],
    ['FOG yaw rate', 'variance', R.fog_rate.link, sci(R.fog_rate.value), 0.0011, 'rad/s'],
    ['DVL velocity', 'fom²', R.dvl.link, 'per ping, ≈7.6×10⁻⁷', 0.006, 'm/s'],
    ['Depth', 'variance', R.depth.link, sci(R.depth.value), 0.0007, 'm'],
  ];
  document.getElementById('cov-table').innerHTML = rows.map(([what, field, link, rep, sd, u, note = '']) =>
    `<tr><td>${what} <a href="${link}"><code>${field}</code></a></td><td>${rep}</td><td>${sci(sd * sd)} <small>(σ ${sd} ${u}${note})</small></td></tr>`).join('');
});

// ---------------------------------------------------------------- 3. sensors -> estimators -> users
{
  const box = document.getElementById('flow'), note = document.getElementById('flow-note');
  const S = (k) => `var(${SENSOR[k].color})`;
  const nodes = [
    { id: 'imu', x: 90, y: 62, label: 'IMU', sub: 'vectornav/imu · 400 Hz', stroke: S('IMU'), info: 'Roll, pitch, their rates and acceleration to the EKF. The MPC estimator takes its roll and pitch rates directly (gain 1) and its attitude as a slow tilt reference (1 s).' },
    { id: 'fog', x: 90, y: 134, label: 'FOG', sub: 'gyro/twist · ≈475 Hz', stroke: S('FOG'), info: 'Yaw rate, to both estimators. Heading is its integral in both.' },
    { id: 'dvl', x: 90, y: 206, label: 'DVL', sub: 'dvl_twist · 8 Hz', stroke: S('DVL'), info: 'Velocity, to both. The EKF applies each reading, about 125 ms old, to its current state; the MPC estimator compares it with its own velocity at the reading\'s stamp (gain 0.7).' },
    { id: 'depth', x: 90, y: 278, label: 'Depth', sub: 'depth/pose · 20 Hz', stroke: S('Depth'), info: 'z, to both. The MPC estimator blends it in with a 0.3 s time constant.' },
    { id: 'ekf', x: 430, y: 112, label: 'EKF', sub: 'robot_localization · 30 Hz', bold: true, info: '<code>ekf_localization_node</code>: publishes <code>odometry/filtered</code> (pose in <code>odom</code>, velocity in the body) and the TF <code>odom → talos/base_link</code>. Kinematic model only.' },
    { id: 'mpcest', x: 430, y: 250, label: 'MPC estimator', sub: 'inside mpc_controller', bold: true, info: 'state_estimator.cpp: predicts with the Fossen model and the thrust the MPC commanded, corrects with each sensor. On time; the EKF is only its anchor. <a href="control/estimation.html">Feedback and model error</a>.' },
    { id: 'mapping', x: 770, y: 62, label: 'Mapping', sub: 'odometry + TF', info: 'Distance travelled grows the course drift; speeds widen detections taken while turning or moving; TF places every detection.' },
    { id: 'autonomy', x: 770, y: 134, label: 'Autonomy', sub: 'odometry + TF', info: 'Tree nodes such as GetOdometry read <code>odometry/filtered</code>; moves to targets look them up through TF.' },
    { id: 'viewer', x: 770, y: 206, label: 'Nereus viewer', sub: 'TF', info: 'On the robot it draws Talos at the EKF\'s pose. In sim it can also draw the truth.' },
    { id: 'mpc', x: 770, y: 278, label: 'MPC', sub: 'plans from its own state', info: 'Plans 1.5 s ahead every 50 ms from the estimator\'s state, not the EKF\'s.' },
  ];
  const sens = ['imu', 'fog', 'dvl', 'depth'];
  const edges = [
    ...sens.map((s) => ({ from: s, to: 'ekf', color: S(s === 'imu' ? 'IMU' : s === 'fog' ? 'FOG' : s === 'dvl' ? 'DVL' : 'Depth') })),
    ...sens.map((s) => ({ from: s, to: 'mpcest', color: S(s === 'imu' ? 'IMU' : s === 'fog' ? 'FOG' : s === 'dvl' ? 'DVL' : 'Depth'), opacity: 0.55 })),
    { from: 'ekf', to: 'mpcest', label: 'anchor: x, y, yaw', dash: true },
    { from: 'ekf', to: 'mapping' }, { from: 'ekf', to: 'autonomy' }, { from: 'ekf', to: 'viewer' },
    { from: 'mpcest', to: 'mpc' },
  ];
  const narrowNodes = {
    imu: { x: 46, y: 46, sub: '' }, fog: { x: 128, y: 46, sub: '' }, dvl: { x: 212, y: 46, sub: '' }, depth: { x: 294, y: 46, sub: '' },
    ekf: { x: 92, y: 196, sub: '' }, mpcest: { x: 252, y: 196, label: 'MPC est.', sub: '' },
    mapping: { x: 48, y: 340, sub: '' }, autonomy: { x: 136, y: 340, sub: '' }, viewer: { x: 220, y: 340, label: 'Viewer', sub: '' }, mpc: { x: 298, y: 340, sub: '' },
  };
  const DEFAULT = 'Both estimators read the same four topics. Tap a node to see what it takes and gives.';
  const draw = () => new Graph(box, {
    width: 860, height: 330, nodes, edges,
    bands: [
      { label: 'SENSORS', points: [[8, 8], [176, 8], [176, 322], [8, 322]] },
      { label: 'ESTIMATORS', points: [[318, 8], [544, 8], [544, 322], [318, 322]] },
      { label: 'USERS', points: [[676, 8], [852, 8], [852, 322], [676, 322]], lx: 680 },
    ],
    narrow: {
      below: 560, width: 340, height: 380, nodes: narrowNodes,
      edges: { 'ekf>mpcest': { label: 'anchor' } },
      bands: [
        { label: 'SENSORS', points: [[6, 8], [334, 8], [334, 74], [6, 74]] },
        { label: 'ESTIMATORS', points: [[6, 158], [334, 158], [334, 224], [6, 224]] },
        { label: 'USERS', points: [[6, 302], [334, 302], [334, 368], [6, 368]] },
      ],
    },
    info: (n) => { note.innerHTML = n ? `<b>${esc(n.label)}.</b> ${n.info}` : DEFAULT; },
  });
  note.innerHTML = DEFAULT;
  (document.fonts?.ready || Promise.resolve()).then(draw);
}

// ---------------------------------------------------------------- 4. the one-axis filter
{
  const modeHost = document.getElementById('kf-mode'), ctl = document.getElementById('kf-controls');
  const presetHost = document.getElementById('kf-presets'), zoomHost = document.getElementById('kf-zoom');
  const readout = document.getElementById('kf-readout');
  const chart = new LineChart(document.getElementById('kf-chart'), { height: 270, xLabel: 'time (s)', digits: 3, xDigits: 2 });
  const st = { mode: 'rate', zoom: 'all', rate: { Rd: 1e-2, Qd: 1e-5 }, velocity: { Rs: 7.6e-7, smooth: false } };
  const CFG = {
    rate: {
      y: 'pitch rate (rad/s)', unit: 'rad/s', nu: 1000, nuName: 'mrad/s', sensor: 'gyro', real: 'σ 0.0009 rad/s, σ² ≈ 8×10⁻⁷',
      sliders: [['Rd', 'Gyro covariance', -8, 0, 'the IMU message'], ['Qd', 'Rate process noise', -6, -1, 'talos_ekf.yaml']],
      presets: [['Talos config', { Rd: 1e-2, Qd: 1e-5 }], ['Replay fix', { Rd: 1e-5, Qd: 1e-5 }], ['Real noise', { Rd: 1e-6, Qd: 1e-5 }]],
      hold: { x: [2.3, 3.5], y: [-0.005, 0.005] },
    },
    velocity: {
      y: 'surge (m/s)', unit: 'm/s', nu: 1000, nuName: 'mm/s', sensor: 'DVL', real: 'σ 6 mm/s, σ² ≈ 3.6×10⁻⁵ (Nereus robot.yaml)',
      sliders: [['Rs', 'DVL covariance', -8, -3, 'fom²']],
      presets: [['Talos config', { Rs: 7.6e-7, smooth: false }], ['Smoothing on', { Rs: 7.6e-7, smooth: true }], ['Real DVL noise', { Rs: 3.6e-5, smooth: false }]],
      hold: { x: [4.6, 6.4], y: [0.47, 0.53] },
    },
  };
  let inputs = {};
  function buildControls() {
    const c = CFG[st.mode], s = st[st.mode];
    ctl.innerHTML = '';
    inputs = {};
    for (const [k, label, lo, hi] of c.sliders) {
      const l = document.createElement('label');
      l.innerHTML = `${label} <input type="range" min="${lo}" max="${hi}" step="0.1" value="${Math.log10(s[k])}" aria-label="${label}, log scale"> <output></output>`;
      const inp = l.querySelector('input'), out = l.querySelector('output');
      inp.addEventListener('input', () => { s[k] = 10 ** +inp.value; out.textContent = sci(s[k]); update(); });
      out.textContent = sci(s[k]);
      inputs[k] = [inp, out];
      ctl.appendChild(l);
    }
    if (st.mode === 'velocity') {
      const l = document.createElement('label');
      l.innerHTML = 'Lagged-data smoothing <span class="seg" role="group" aria-label="smooth_lagged_data"><button type="button" data-k="off">Off</button><button type="button" data-k="on">On</button></span>';
      const sg = l.querySelector('.seg');
      setSeg(sg, s.smooth ? 'on' : 'off');
      segment(sg, (k) => { s.smooth = k === 'on'; update(); });
      inputs.smooth = sg;
      ctl.appendChild(l);
    }
    presetHost.innerHTML = '<span class="kf-plabel">Try</span>';
    for (const [name, vals] of c.presets) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn'; b.textContent = name;
      b.onclick = () => {
        Object.assign(s, vals);
        for (const [k, io] of Object.entries(inputs)) if (k !== 'smooth') { io[0].value = Math.log10(s[k]); io[1].textContent = sci(s[k]); }
        if (inputs.smooth) setSeg(inputs.smooth, s.smooth ? 'on' : 'off');
        update();
      };
      presetHost.appendChild(b);
    }
  }
  let pending = 0;
  function update() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(compute);
  }
  function compute() {
    const c = CFG[st.mode], s = st[st.mode];
    const o = { ...SETUPS[st.mode], ...s };
    const r = run(st.mode, o);
    const every = 4, pts = (arr) => Array.from({ length: Math.floor((arr.length - 1) / every) + 1 }, (_, i) => ({ x: i * every * r.dt, y: arr[i * every] }));
    const series = [];
    if (st.mode === 'velocity') series.push({ name: 'DVL readings, when they arrive', color: css('--prediction'), values: r.meas.map((m) => ({ x: m.t, y: m.y })), points: true, r: 3, opacity: 0.9 });
    else series.push({ name: 'gyro readings', color: css('--prediction'), values: r.meas.filter((_, i) => i % 6 === 0).map((m) => ({ x: m.t, y: m.y })), width: 1, opacity: 0.55 });
    series.push({ name: 'true motion', color: css('--ink-2'), values: pts(r.truth), dash: true, width: 1.6 });
    series.push({ name: 'EKF estimate', color: css('--state'), values: pts(r.est), width: 2.4 });
    const z = st.zoom === 'hold' ? c.hold : null;
    chart.set(series, { yLabel: c.y, unit: c.unit, xDomain: z ? z.x : null, yDomain: z ? z.y : null, digits: st.mode === 'velocity' && z ? 4 : 3 });
    const key = st.mode === 'rate' ? 'Rd' : 'Rs';
    readout.innerHTML = `<span>Lag <b>${Math.round(r.lag * 1000)} ms</b></span><span>Size <b>×${r.gain.toFixed(2)}</b></span>`
      + `<span>Noise <b>${(r.noise * c.nu).toFixed(2)} ${c.nuName}</b></span>`
      + `<span class="kf-cmp">The ${c.sensor} reports σ² = ${sci(s[key])}; really ${c.real}</span>`;
  }
  segment(modeHost, (k) => { st.mode = k; buildControls(); update(); });
  segment(zoomHost, (k) => { st.zoom = k; update(); });
  buildControls();
  compute();
}

// ---------------------------------------------------------------- 5. the replays
replayP.then((d) => {
  const sigHost = document.getElementById('rp-sig'), zoomHost = document.getElementById('rp-zoom');
  const varHost = document.getElementById('rp-var'), note = document.getElementById('rp-note');
  // Lags from ~/robot/ekf_replay/analyze.py on these replays (see tools/localization/replay_data.py).
  const VARIANTS = [
    ['C', 'Gyro fix + smoothing', { surge: '292 ms', pitch: '50 ms, ×0.97' }, 'with the gyro fix and smoothing', 'gyro fix + smoothing'],
    ['E', '+ velocity noise ×100', { surge: '96 ms', pitch: '50 ms, ×0.97' }, 'with velocity process noise ×100 as well', 'velocity noise ×100 too'],
    ['D', 'No IMU acceleration', { surge: '394 ms', pitch: '50 ms, ×0.97' }, 'with the fixes but without IMU acceleration', 'no IMU acceleration'],
  ];
  const AS = { surge: '351 ms', pitch: '340 ms, ×0.19' };
  varHost.innerHTML = VARIANTS.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === 'E'}">${n}</button>`).join('');
  const st = { sig: 'surge', zoom: 'one', v: 'E' };
  const chart = new LineChart(document.getElementById('rp-chart'), { height: 270, xLabel: 'time (s)', digits: 3, xDigits: 2 });
  const P = (arr) => arr.map(([x, y]) => ({ x, y }));
  const ZOOM = { surge: [1.4, 4.6], pitch: [7.6, 10.4] };
  function draw() {
    const g = d[st.sig];
    const sensor = st.sig === 'surge'
      ? { name: 'DVL (body axes, at its stamp)', color: css('--ink'), values: P(g.dvl), points: st.zoom === 'one', width: 1.6, r: 3, opacity: st.zoom === 'one' ? 0.9 : 0.8 }
      : { name: 'IMU pitch rate', color: css('--ink'), values: P(g.imu), width: 1.4, opacity: 0.85 };
    const v = VARIANTS.find((x) => x[0] === st.v);
    const series = [
      sensor,
      { name: 'EKF as configured', color: css('--reference'), values: P(g.A), width: 2 },
      { name: `EKF, ${v[4]}`, color: css('--state'), values: P(g[st.v]), width: 2 },
    ];
    // Zoomed: fit the y axis to what is in the window
    let yDomain = null;
    const xw = st.zoom === 'one' ? ZOOM[st.sig] : null;
    if (xw) {
      let lo = Infinity, hi = -Infinity;
      for (const s of series) for (const p of s.values) if (p.x >= xw[0] && p.x <= xw[1]) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
      const pad = (hi - lo) * 0.1;
      yDomain = [lo - pad, hi + pad];
    }
    chart.set(series, { yLabel: st.sig === 'surge' ? 'surge (m/s)' : 'pitch rate (rad/s)', unit: st.sig === 'surge' ? 'm/s' : 'rad/s', xDomain: xw, yDomain });
    note.innerHTML = st.sig === 'surge'
      ? `Velocity lag behind the DVL, median of 16 starts (single starts vary): <b>${AS.surge}</b> as configured, <b>${v[2].surge}</b> ${esc(v[3])}.`
      : `Pitch-rate lag behind the IMU, and size: <b>${AS.pitch}</b> as configured, <b>${v[2].pitch}</b> ${esc(v[3])}.`;
  }
  segment(sigHost, (k) => { st.sig = k; draw(); });
  segment(zoomHost, (k) => { st.zoom = k; draw(); });
  segment(varHost, (k) => { st.v = k; draw(); });
  draw();
});
