import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/localization.css';
import { el } from '../viz/chart.js';
import { LocChart } from '../viz/localization-chart.js';
import { FlowGraph } from '../viz/localization-flow.js';
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

// A y range that fits what is inside the x window [x0, x1], with 10 % to spare.
function fitY(series, [x0, x1]) {
  let lo = Infinity, hi = -Infinity;
  for (const s of series) for (const p of s.values) if (p.x >= x0 && p.x <= x1) { lo = Math.min(lo, p.y); hi = Math.max(hi, p.y); }
  const pad = (hi - lo) * 0.1 || 0.01;
  return [lo - pad, hi + pad];
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
    groups: document.getElementById('tfx-groups'),
    views: document.getElementById('tfx-views'),
    chain: document.getElementById('tfx-chain'),
    tree: document.getElementById('tfx-tree'),
    card: document.getElementById('tfx-card'),
    all: document.getElementById('tfx-all'),
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
  const NAME = { IMU: 'IMU', FOG: 'fibre-optic gyro', DVL: 'DVL', Depth: 'depth sensor' };
  return `<b>${label[0].toUpperCase() + label.slice(1)}.</b> ${by.length ? 'Measured by the ' + by.map((n) => NAME[n] || n).join(' and the ') + '.' : ''} ${extra} Process noise <i>Q</i> = ${sci(ekf.process_noise.diag[i])} per second (<a href="${ekf.process_noise.link}">talos_ekf.yaml</a>).`;
}
ekfP.then((ekf) => {
  const host = document.getElementById('fuse'), note = document.getElementById('fuse-note');
  const order = ['IMU', 'FOG', 'DVL', 'Depth'];
  const sensors = order.map((n) => ekf.sensors.find((s) => s.name === n));
  // A table: one row per kind of state, one column per sensor, and a last column for the states nothing measures.
  // Every one of the 15 states appears once, under whatever feeds it.
  const axisName = (i) => { const g = Math.floor(i / 3); return g === 1 || g === 3 ? AXES[3 + (i % 3)] : AXES[i % 3]; };
  const feeder = (i) => sensors.find((s) => s.config[i]);
  let h = '<div class="fuse-tab" role="table" aria-label="Which sensor feeds which of the 15 states">';
  h += '<div class="fuse-row fuse-head" role="row"><div class="fuse-g" role="columnheader"></div>';
  h += sensors.map((s) => `<div role="columnheader"><button type="button" class="fuse-sensor" data-row="${s.name}"><i style="background:var(${SENSOR[s.name].color})"></i>${s.name}</button></div>`).join('');
  h += '<div role="columnheader" class="fuse-none">Nothing<small>added up</small></div></div>';
  GROUPS.forEach(([g, u], gi) => {
    h += `<div class="fuse-row" role="row"><div class="fuse-g" role="rowheader">${g}<small>${u}</small></div>`;
    for (const col of [...sensors, null]) {
      const ids = [0, 1, 2].map((k) => gi * 3 + k).filter((i) => (col ? feeder(i) === col : !feeder(i)));
      h += `<div role="cell" class="fuse-c">${ids.map((i) => `<button type="button" class="fuse-chip${col ? '' : ' none'}" data-col="${i}" style="${col ? `--c:var(${SENSOR[col.name].color})` : ''}" aria-label="${ekf.state[i]}: ${col ? 'from the ' + col.name : 'not measured'}">${axisName(i)}</button>`).join('')}</div>`;
    }
    h += '</div>';
  });
  h += '</div>';
  host.innerHTML = h;
  const DEFAULT = `Each of the 15 states sits under the sensor that feeds it (<a href="${ekf.process_noise.link.split('#')[0]}">talos_ekf.yaml</a>). Tap a state for its process noise, or a sensor for its topic and the states it feeds.`;
  note.innerHTML = DEFAULT;
  const tab = host.querySelector('.fuse-tab');
  const clear = () => { host.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot')); tab.classList.remove('dim'); };
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    clear();
    b.classList.add('hot');
    if (b.dataset.col !== undefined) note.innerHTML = stateNote(+b.dataset.col, ekf);
    else {
      // a sensor: light up every state it feeds, dim the rest
      const k = order.indexOf(b.dataset.row);
      tab.classList.add('dim');
      host.querySelectorAll('.fuse-row:not(.fuse-head)').forEach((row) => row.querySelectorAll('.fuse-c')[k].querySelectorAll('.fuse-chip').forEach((c) => c.classList.add('lit')));
      const s = ekf.sensors.find((x) => x.name === b.dataset.row), info = SENSOR[s.name];
      note.innerHTML = `<b>${s.name}</b> (<code>${esc(s.topic)}</code>, ${info.rate}). ${info.what} <a href="${s.link}">Its lines in the config</a>.`;
    }
    if (!tab.classList.contains('dim')) host.querySelectorAll('.lit').forEach((x) => x.classList.remove('lit'));
  });

  // The covariances the messages report, against the real noise: one notation (powers of ten), and the ratio in words.
  const R = ekf.reported;
  const p10 = (v) => { const e = Math.floor(Math.log10(v) + 1e-9), m = +(v / 10 ** e).toPrecision(2); return `${m === 1 ? '' : m + '×'}10${String(e).split('').map((c) => SUP[c]).join('')}`; };
  const ratio = (rep, real) => { const r = rep / real; const n = r >= 1 ? r : 1 / r; const k = n >= 1000 ? Math.round(n / 1000) * 1000 : n >= 100 ? Math.round(n / 10) * 10 : Math.round(n); return `${k.toLocaleString('en-US')}× too ${r >= 1 ? 'little' : 'much'}`; };
  const rows = [
    ['IMU roll, pitch', R.imu_orientation.link, `${p10(R.imu_orientation.value[1])}, ${p10(R.imu_orientation.value[0])} <small>(in body axes; the file lists them in the IMU's turned axes)</small>`, 0.0002, '250–1,250× too little, but filtered: leave it'],
    ['IMU turn rates', R.imu_rate.link, p10(R.imu_rate.value), 0.0009],
    ['IMU acceleration', R.imu_accel.link, p10(R.imu_accel.value), 0.035],
    ['FOG yaw rate', R.fog_rate.link, p10(R.fog_rate.value), 0.0011],
    ['DVL velocity', R.dvl.link, '≈7.6×10⁻⁷ <small>(its figure of merit², per ping)</small>', 0.006, ratio(7.6e-7, 0.006 ** 2)],
    ['Depth', R.depth.link, p10(R.depth.value), 0.0007],
  ];
  document.getElementById('cov-table').innerHTML = rows.map(([what, link, rep, sd, trust]) => {
    const t = trust || ratio(+(link === R.imu_rate.link ? R.imu_rate.value : link === R.imu_accel.link ? R.imu_accel.value : link === R.fog_rate.link ? R.fog_rate.value : R.depth.value), sd * sd);
    return `<tr><td data-l=""><a href="${link}">${what}</a></td><td data-l="Reports">${rep}</td><td data-l="Really">${p10(sd * sd)}</td><td data-l="Trusted"><b>${t}</b></td></tr>`;
  }).join('');
});

// ---------------------------------------------------------------- 3. sensors -> estimators -> users
// One bus from the sensors to each estimator, one from the EKF to its users: no edge crosses another.
{
  const box = document.getElementById('flow'), note = document.getElementById('flow-note');
  const nodes = [
    { id: 'sensors', x: 102, y: 195, w: 172, label: '4 sensors', sub: 'IMU · FOG · DVL · depth', bold: true, name: 'The four sensors',
      info: `<ul class="flow-list">
        <li><b>IMU</b> <code>vectornav/imu</code>, 400 Hz: roll, pitch, their rates and acceleration to the EKF. The MPC estimator takes its rates directly and its tilt as a slow reference (1 s).</li>
        <li><b>FOG</b> <code>gyro/twist</code>, ≈475 Hz: yaw rate to both; heading is its integral in both.</li>
        <li><b>DVL</b> <code>dvl_twist</code>, 8 Hz: velocity to both. Each reading is about 125 ms old: the EKF applies it to its current state; the MPC estimator compares it with its own velocity at the reading's stamp (gain 0.7).</li>
        <li><b>Depth</b> <code>depth/pose</code>, 20 Hz: z to both; the MPC estimator blends it in over 0.3 s.</li></ul>` },
    { id: 'ekf', x: 410, y: 120, w: 170, label: 'EKF', sub: 'robot_localization · 30 Hz', bold: true, name: 'The EKF',
      info: '<code>ekf_localization_node</code> publishes <code>odometry/filtered</code> (pose in <code>odom</code>, velocity in the body) and the TF <code>odom → talos/base_link</code>. Its model is kinematics only.' },
    { id: 'mpcest', x: 410, y: 270, w: 170, label: 'MPC estimator', sub: 'inside mpc_controller', bold: true, name: 'The MPC estimator',
      info: '<code>state_estimator.cpp</code> predicts with the Fossen model and the thrust the MPC commanded, then corrects with each sensor. It is on time; the EKF only anchors its x, y and heading (<a href="control/estimation.html">Feedback and model error</a>).' },
    { id: 'mapping', x: 745, y: 50, w: 150, label: 'Mapping', sub: 'odometry + TF', name: 'Mapping',
      info: 'Places each detection with TF and sizes the course\'s drift from the odometry (<a href="#users">details below</a>).' },
    { id: 'autonomy', x: 745, y: 120, w: 150, label: 'Autonomy', sub: 'odometry + TF', name: 'Autonomy',
      info: 'Reads <code>odometry/filtered</code> and finds targets through TF.' },
    { id: 'viewer', x: 745, y: 190, w: 150, label: 'Viewer', sub: 'TF', name: 'The Nereus viewer',
      info: 'Draws Talos at the EKF\'s pose; in sim, the truth beside it.' },
    { id: 'mpc', x: 745, y: 270, w: 150, label: 'MPC', sub: 'plans from it', name: 'The MPC',
      info: 'Plans from the estimator\'s state, not the EKF\'s (<a href="#users">why</a>).' },
  ];
  const USERS = ['mapping', 'autonomy', 'viewer'];
  const yOf = Object.fromEntries(nodes.map((n) => [n.id, n.y]));
  const edges = [
    { from: 'sensors', to: 'ekf', points: [[190, 195], [250, 195], [250, 120], [322, 120]] },
    { from: 'sensors', to: 'mpcest', points: [[190, 195], [250, 195], [250, 270], [322, 270]] },
    { from: 'ekf', to: 'mpcest', dash: true, points: [[410, 145], [410, 245]], label: 'anchor: x, y, yaw', lx: 420, ly: 199, anchor: 'start' },
    ...USERS.map((u) => ({ from: 'ekf', to: u, points: [[497, 120], [580, 120], [580, yOf[u]], [667, yOf[u]]] })),
    { from: 'mpcest', to: 'mpc', points: [[497, 270], [667, 270]] },
  ];
  // Phones: sensors on top, the two estimators side by side, each one's users in a column beneath it.
  const NY = { mapping: 262, autonomy: 314, viewer: 366 };
  const narrowNodes = {
    sensors: { x: 165, y: 52, w: 306, label: 'IMU · FOG · DVL · depth', sub: 'the same four topics go to both' },
    ekf: { x: 68, y: 160, w: 120, sub: 'robot_localization' },
    mpcest: { x: 258, y: 160, w: 128, sub: 'inside the MPC' },
    ...Object.fromEntries(USERS.map((u) => [u, { x: 112, y: NY[u], w: 148 }])),
    mpc: { x: 258, y: 262, w: 128 },
  };
  const narrowEdges = {
    'sensors>ekf': { points: [[100, 77], [100, 135]] },
    'sensors>mpcest': { points: [[258, 77], [258, 135]] },
    'ekf>mpcest': { points: [[130, 160], [192, 160]], label: 'anchor', lx: 161, ly: 152, anchor: 'middle' },
    ...Object.fromEntries(USERS.map((u) => [`ekf>${u}`, { points: [[18, 185], [18, NY[u]], [36, NY[u]]] }])),
    'mpcest>mpc': { points: [[258, 185], [258, 237]] },
  };
  const DEFAULT = 'Both estimators read the same four topics; only the MPC uses its own estimator. Tap a box to see what it takes and gives.';
  const draw = () => new FlowGraph(box, {
    width: 860, height: 300, nodes, edges, label: 'Sensors feed the EKF and the MPC estimator; the EKF feeds mapping, autonomy and the viewer, and anchors the MPC estimator, which feeds the MPC',
    bands: [
      { label: 'SENSORS', points: [[8, 8], [196, 8], [196, 292], [8, 292]] },
      { label: 'ESTIMATORS', points: [[300, 8], [520, 8], [520, 292], [300, 292]] },
      { label: 'USERS', points: [[610, 8], [852, 8], [852, 292], [610, 292]] },
    ],
    narrow: {
      below: 560, width: 330, height: 400, nodes: narrowNodes, edges: narrowEdges,
      bands: [
        { label: 'SENSORS', points: [[4, 4], [326, 4], [326, 84], [4, 84]] },
        { label: 'ESTIMATORS', points: [[4, 104], [326, 104], [326, 196], [4, 196]] },
        { label: 'USERS', points: [[4, 216], [326, 216], [326, 394], [4, 394]], lx: 196, ly: 228 },
      ],
    },
    info: (n) => { note.innerHTML = n ? `<b>${esc(n.name)}.</b> ${n.info}` : DEFAULT; },
  });
  note.innerHTML = DEFAULT;
  (document.fonts?.ready || Promise.resolve()).then(draw);
}

// ---------------------------------------------------------------- 4. the one-axis filter
{
  const modeHost = document.getElementById('kf-mode'), ctl = document.getElementById('kf-controls');
  const presetHost = document.getElementById('kf-presets'), zoomHost = document.getElementById('kf-zoom');
  const readout = document.getElementById('kf-readout'), tapline = document.getElementById('kf-tap');
  const TAP = 'Tap the chart to read values.';
  const chart = new LocChart(document.getElementById('kf-chart'), {
    height: 260, xLabel: 'time (s)', digits: 3, xDigits: 2,
    readout: (h) => { tapline.innerHTML = h || TAP; },
  });
  tapline.textContent = TAP;
  const st = { mode: 'rate', zoom: 'first', rate: { Rd: 1e-2, Qd: 1e-5 }, velocity: { Rs: 7.6e-7, Qs: 2.5e-5 } };
  const CFG = {
    rate: {
      y: 'pitch rate (rad/s)', unit: 'rad/s', nu: 1000, nuName: 'mrad/s', sensor: 'gyro', real: 'σ² ≈ 8×10⁻⁷ (σ 0.0009 rad/s)',
      sliders: [['Rd', 'Gyro covariance', -8, 0], ['Qd', 'Rate process noise', -6, -1]],
      presets: [['Talos config', { Rd: 1e-2, Qd: 1e-5 }], ['Replay fix', { Rd: 1e-5, Qd: 1e-5 }], ['Real noise', { Rd: 1e-6, Qd: 1e-5 }]],
      // the hold: still, before the first move, where every setting has settled
      first: [0.6, 3.2], hold: [0.15, 0.95],
    },
    velocity: {
      y: 'surge (m/s)', unit: 'm/s', nu: 1000, nuName: 'mm/s', sensor: 'DVL', real: 'σ² ≈ 3.6×10⁻⁵ (σ 6 mm/s, Nereus robot.yaml)',
      sliders: [['Rs', 'DVL covariance', -8, -3], ['Qs', 'Velocity process noise', -7, -1]],
      presets: [['Talos config', { Rs: 7.6e-7, Qs: 2.5e-5 }], ['Real noise', { Rs: 3.6e-5, Qs: 2.5e-5 }], ['+ Q ×100', { Rs: 3.6e-5, Qs: 2.5e-3 }]],
      first: [0.6, 3.4], hold: [4.6, 6.4],
    },
  };
  // On a phone the sliders start folded away under the presets.
  const fine = document.getElementById('kf-fine');
  if (!matchMedia('(max-width: 640px)').matches) fine.open = true;
  let inputs = {};
  const markPreset = () => {
    const c = CFG[st.mode], s = st[st.mode];
    const same = (vals) => Object.entries(vals).every(([k, v]) => Math.abs(Math.log10(s[k]) - Math.log10(v)) < 0.05);
    presetHost.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(same(c.presets[i][1]))));
  };
  function buildControls() {
    const c = CFG[st.mode], s = st[st.mode];
    ctl.innerHTML = '';
    inputs = {};
    for (const [k, label, lo, hi] of c.sliders) {
      const l = document.createElement('label');
      l.innerHTML = `<span>${label}</span> <input type="range" min="${lo}" max="${hi}" step="0.1" value="${Math.log10(s[k])}" aria-label="${label}, log scale"> <output></output>`;
      const inp = l.querySelector('input'), out = l.querySelector('output');
      inp.addEventListener('input', () => { s[k] = 10 ** +inp.value; out.textContent = sci(s[k]); markPreset(); update(); });
      out.textContent = sci(s[k]);
      inputs[k] = [inp, out];
      ctl.appendChild(l);
    }
    presetHost.innerHTML = c.presets.map(([name], i) => `<button type="button" data-i="${i}">${name}</button>`).join('');
    presetHost.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      Object.assign(s, c.presets[+b.dataset.i][1]);
      for (const [k, io] of Object.entries(inputs)) { io[0].value = Math.log10(s[k]); io[1].textContent = sci(s[k]); }
      markPreset();
      update();
    }));
    markPreset();
  }
  let pending = 0;
  function update() {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(compute);
  }
  // The lag the chart marks. Surge: the best-fit delay of the estimate against the true motion (the estimate is a
  // staircase at the DVL's 8 Hz, so a single crossing would jump in 125 ms steps), drawn from the true motion's
  // half-way point. Pitch rate: from the true rate's first peak to the estimate's.
  function lagMark(r) {
    const dt = r.dt;
    if (st.mode === 'velocity') {
      let t1 = 0;
      while (t1 < r.truth.length && r.truth[t1] < 0.25) t1++;
      return { t1: t1 * dt, t2: t1 * dt + r.lag, y: 0.25, size: null };
    }
    let i1 = 0, i2 = Math.round(1 / dt);
    for (let i = Math.round(1 / dt); i < Math.round(3.4 / dt); i++) { if (r.truth[i] > r.truth[i1]) i1 = i; if (r.clean[i] > r.clean[i2]) i2 = i; }
    return { t1: i1 * dt, t2: i2 * dt, y: r.clean[i2], y1: r.truth[i1], size: r.clean[i2] / r.truth[i1] };
  }
  function compute() {
    const c = CFG[st.mode], s = st[st.mode];
    const r = run(st.mode, { ...SETUPS[st.mode], ...s });
    const every = 4, pts = (arr) => Array.from({ length: Math.floor((arr.length - 1) / every) + 1 }, (_, i) => ({ x: i * every * r.dt, y: arr[i * every] }));
    const series = [];
    if (st.mode === 'velocity') {
      series.push({ name: 'DVL readings, when they arrive', short: 'DVL', color: css('--ink'), values: r.meas.map((m) => ({ x: m.t, y: m.y })), points: true, r: 3, opacity: 0.85 });
      series.push({ name: 'true motion', short: 'true', color: css('--muted'), values: pts(r.truth), dash: true, width: 1.6 });
    } else {
      // The gyro's noise is tiny next to these rates: its readings are the true motion, so no separate truth line.
      series.push({ name: 'gyro readings (the true rate)', short: 'gyro', color: css('--ink-2'), values: r.meas.filter((_, i) => i % 4 === 0).map((m) => ({ x: m.t, y: m.y })), width: 1.6 });
    }
    series.push({ name: 'EKF estimate', short: 'EKF', color: css('--state'), values: pts(r.est), width: 2.4 });
    const xw = st.zoom === 'first' ? c.first : st.zoom === 'hold' ? c.hold : null;
    const L = lagMark(r), ms = Math.round((L.t2 - L.t1) * 1000);
    if (xw) for (const s of series) s.values = s.values.filter((p) => p.x >= xw[0] - 0.02 && p.x <= xw[1] + 0.02);
    const overlay = st.zoom === 'hold' ? null : (g, { sx, sy }) => {
      const xa = sx(L.t1), xb = sx(L.t2), y = sy(L.y) - (st.mode === 'rate' ? 12 : 0);
      const ink = css('--accent');
      if (st.mode === 'rate') el('line', { x1: xa, x2: xa, y1: sy(L.y1), y2: y, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, g);
      if (xb - xa > 3) {
        el('line', { x1: xa, x2: xb, y1: y, y2: y, stroke: ink, 'stroke-width': 1.6 }, g);
        for (const xx of [xa, xb]) el('line', { x1: xx, x2: xx, y1: y - 5, y2: y + 5, stroke: ink, 'stroke-width': 1.6 }, g);
      }
      const t = el('text', { x: xb + 7, y: y + 4, fill: css('--accent-ink'), 'font-size': 12.5, 'font-weight': 650, class: 'marker-label' }, g);
      t.textContent = `${st.mode === 'rate' ? 'peak ' : ''}${ms} ms late`;
    };
    const hold = st.zoom === 'hold';
    chart.set(series, { yLabel: c.y, unit: c.unit, xDomain: xw, yDomain: xw ? fitY(series, xw) : null, digits: hold ? 4 : 3, xStep: hold ? (st.mode === 'rate' ? 0.2 : 0.5) : null, overlay });
    const key = st.mode === 'rate' ? 'Rd' : 'Rs';
    readout.innerHTML = `<span>${st.mode === 'rate' ? 'Peak lag' : 'Lag'} <b>${ms} ms</b></span>`
      + (L.size ? `<span>Peak height <b>${Math.round(L.size * 100)} %</b></span>` : '')
      + `<span>Noise <b>${(r.noise * c.nu).toFixed(2)} ${c.nuName}</b></span>`
      + `<span class="kf-cmp">The ${c.sensor} reports σ² = ${sci(s[key])}; really ${c.real}.</span>`;
  }
  segment(modeHost, (k) => { st.mode = k; buildControls(); update(); });
  segment(zoomHost, (k) => { st.zoom = k; update(); });
  buildControls();
  compute();
}

// ---------------------------------------------------------------- 5. the replays
replayP.then((d) => {
  const sigHost = document.getElementById('rp-sig'), zoomHost = document.getElementById('rp-zoom');
  const varHost = document.getElementById('rp-var'), note = document.getElementById('rp-note'), tapline = document.getElementById('rp-tap');
  // Lags from ~/robot/ekf_replay/analyze.py on these replays (see tools/localization/replay_data.py).
  const VARIANTS = [
    ['C', 'Gyro fix + smoothing', { surge: '292 ms' }, 'with the gyro fix and smoothing', 'gyro fix + smoothing'],
    ['E', '+ velocity noise ×100', { surge: '96 ms' }, 'with velocity process noise ×100 as well', 'velocity noise ×100 too'],
    ['D', 'No IMU acceleration', { surge: '394 ms' }, 'with the fixes but without IMU acceleration', 'no IMU acceleration'],
  ];
  const AS = { surge: '351 ms' };
  // Each choice shows its lag, so the list doubles as a summary.
  const varButtons = () => VARIANTS.map(([k, n, lag]) => `<button type="button" data-k="${k}" aria-pressed="${k === st.v}"><span>${n}</span><b>${lag.surge}</b></button>`).join('');
  const st = { sig: 'surge', zoom: 'one', v: 'E' };
  const TAP = 'Tap the chart to read values.';
  const chart = new LocChart(document.getElementById('rp-chart'), {
    height: 260, xLabel: 'time (s)', digits: 3, xDigits: 2,
    readout: (h) => { tapline.innerHTML = h || TAP; },
  });
  tapline.textContent = TAP;
  const P = (arr) => arr.map(([x, y]) => ({ x, y }));
  const ZOOM = { surge: [1.6, 3.8], pitch: [7.6, 10.4] };
  // When a series first rises through `level` inside [a, b] (linear between samples), or where it peaks.
  const crossing = (v, level, [a, b]) => {
    for (let i = 1; i < v.length; i++) if (v[i].x >= a && v[i].x <= b && v[i - 1].y < level && v[i].y >= level) return v[i - 1].x + ((level - v[i - 1].y) / (v[i].y - v[i - 1].y)) * (v[i].x - v[i - 1].x);
    return null;
  };
  const peak = (v, [a, b]) => v.filter((p) => p.x >= a && p.x <= b).reduce((m, p) => (p.y > m.y ? p : m), { x: a, y: -Infinity });
  function draw() {
    const g = d[st.sig];
    const pitch = st.sig === 'pitch', one = st.zoom === 'one';
    // In pitch rate the three changes are the same (all have the gyro fix): show the one, with a note, not the list.
    const vk = pitch ? 'E' : st.v;
    const sensor = !pitch
      ? { name: 'DVL (body axes, at its stamp)', short: 'DVL', color: css('--ink'), values: P(g.dvl), points: one, width: 1.6, r: 3, opacity: one ? 0.9 : 0.8 }
      : { name: 'IMU pitch rate', short: 'IMU', color: css('--ink'), values: P(g.imu), width: 1.4, opacity: 0.85 };
    const v = VARIANTS.find((x) => x[0] === vk);
    const cA = css('--state'), cV = css('--prediction');
    const series = [
      sensor,
      { name: 'EKF as configured', short: 'configured', color: cA, values: P(g.A), width: 2 },
      { name: pitch ? 'EKF with the gyro fix' : `EKF, ${v[4]}`, short: 'fix', color: cV, values: P(g[vk]), width: 2 },
    ];
    const xw = one ? ZOOM[st.sig] : null;
    if (xw) for (const s of series) s.values = s.values.filter((p) => p.x >= xw[0] - 0.05 && p.x <= xw[1] + 0.05);
    // The close-up's lesson, marked: surge, how much later each EKF crosses half speed than the DVL; pitch rate,
    // how much later the configured EKF peaks than the IMU.
    let overlay = null;
    if (one && !pitch) {
      const t0 = crossing(series[0].values, 0.25, xw), tA = crossing(series[1].values, 0.25, xw), tV = crossing(series[2].values, 0.25, xw);
      overlay = (o, { sx, sy }) => {
        const y0 = sy(0.25), ink = css('--ink'), acc = css('--accent');
        el('line', { x1: sx(t0), x2: sx(t0), y1: y0, y2: y0 + 36, stroke: ink, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, o);
        [[tA, cA, 'configured', 14], [tV, cV, 'fix', 32]].forEach(([t, col, name, dy]) => {
          const xa = sx(t0), xb = sx(t), y = y0 + dy;
          el('line', { x1: xb, x2: xb, y1: y0, y2: y, stroke: col, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, o);
          el('line', { x1: xa, x2: xb, y1: y, y2: y, stroke: acc, 'stroke-width': 1.6 }, o);
          for (const xx of [xa, xb]) el('line', { x1: xx, x2: xx, y1: y - 4, y2: y + 4, stroke: acc, 'stroke-width': 1.6 }, o);
          el('circle', { cx: xb, cy: y0, r: 3.2, fill: col, stroke: css('--paper-2'), 'stroke-width': 1.2 }, o);
          const tx = el('text', { x: xb + 6, y: y + 4, fill: css('--accent-ink'), 'font-size': 12.5, 'font-weight': 650, class: 'marker-label' }, o);
          tx.textContent = `${name} ${Math.round((t - t0) * 1000)} ms`;
        });
        el('circle', { cx: sx(t0), cy: y0, r: 3.2, fill: ink, stroke: css('--paper-2'), 'stroke-width': 1.2 }, o);
      };
    } else if (one && pitch) {
      const pI = peak(series[0].values, xw), pA = peak(series[1].values, [pI.x - 0.1, xw[1]]);
      overlay = (o, { sx, sy }) => {
        const acc = css('--accent'), xa = sx(pI.x), xb = sx(pA.x), y = sy(pA.y) - 12;
        el('line', { x1: xa, x2: xa, y1: sy(pI.y), y2: y, stroke: acc, 'stroke-width': 1, 'stroke-dasharray': '2 2' }, o);
        el('line', { x1: xa, x2: xb, y1: y, y2: y, stroke: acc, 'stroke-width': 1.6 }, o);
        for (const xx of [xa, xb]) el('line', { x1: xx, x2: xx, y1: y - 5, y2: y + 5, stroke: acc, 'stroke-width': 1.6 }, o);
        const tx = el('text', { x: xb + 7, y: y + 4, fill: css('--accent-ink'), 'font-size': 12.5, 'font-weight': 650, class: 'marker-label' }, o);
        tx.textContent = `peak ${Math.round((pA.x - pI.x) * 1000)} ms late`;
      };
    }
    chart.set(series, { yLabel: pitch ? 'pitch rate (rad/s)' : 'surge (m/s)', unit: pitch ? 'rad/s' : 'm/s', xDomain: xw || [0, 32], yDomain: xw ? fitY(series, xw) : null, xStep: xw ? null : 5, overlay });
    note.innerHTML = !pitch
      ? `${one ? 'This start: the half-way crossings, marked. ' : ''}Over all 16 starts the median lag is <b>${AS.surge}</b> as configured and <b>${v[2].surge}</b> ${esc(v[3])}.`
      : `Pitch-rate lag, best fit over the run: <b>340 ms</b> at 19&nbsp;% of the size as configured, <b>50 ms</b> at 97&nbsp;% with the gyro fix. Roll rate: 335 ms at 23&nbsp;%, then 45 ms at 96&nbsp;%.`;
    varHost.innerHTML = pitch
      ? '<p class="rp-same">All three changes include the gyro fix, so their pitch rates are the same.</p>'
      : varButtons();
  }
  segment(sigHost, (k) => { st.sig = k; draw(); });
  segment(zoomHost, (k) => { st.zoom = k; draw(); });
  varHost.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.v = b.dataset.k; draw(); } });
  draw();
});
