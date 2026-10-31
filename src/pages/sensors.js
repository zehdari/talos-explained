import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/sensors.css';
import { LineChart, el } from '../viz/chart.js';
import { createSensorScene } from '../viz/sensors-scene.js';

setup();
// Public images: the base is prepended here, because the dev server and the build treat absolute paths in HTML differently.
document.querySelectorAll('img[data-src]').forEach((img) => (img.src = BASE + img.dataset.src));

const CORE = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/';
const DVLREPO = 'https://github.com/osu-uwrt/nortek_dvl/blob/DvlWaterTrackFallback/';
const FW = 'https://github.com/osu-uwrt/titan_firmware/blob/';
const R2D = 180 / Math.PI;
const getJSON = (name) => fetch(`${BASE}data/sensors/${name}`).then((r) => r.json());
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const pts = (xs, ys) => xs.map((x, i) => ({ x, y: ys[i] }));
const code = (s) => `<code>${s}</code>`;
const link = (href, text) => `<a href="${href}">${text}</a>`;

// A segmented control already in the HTML: calls onPick(data-k) and keeps aria-pressed in step.
function segment(host, onPick) {
  const buttons = [...host.querySelectorAll('button')];
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    onPick(b.dataset.k ?? b.dataset.z);
  }));
}

function slider(host, label, min, max, step, value, fmt, onInput) {
  const l = document.createElement('label');
  l.innerHTML = `${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"> <output></output>`;
  const input = l.querySelector('input'), out = l.querySelector('output');
  const update = () => { out.textContent = fmt(+input.value); onInput(+input.value); };
  input.addEventListener('input', update);
  host.appendChild(l);
  out.textContent = fmt(value);
  return input;
}

// ---------------------------------------------------------------- sensor explorer
const SENSORS = [
  {
    id: 'imu', anchor: 'nw', label: 'IMU', title: 'VectorNav VN-100-T IMU', href: '#imu',
    what: 'Tilt (roll and pitch), turn rates about all three axes, and acceleration, from MEMS gyros and accelerometers fused by its own Kalman filter.',
    rows: [
      ['Rate', '400 Hz'],
      ['Topic', `${code('vectornav/imu')} (sensor_msgs/Imu)`],
      ['Frame', `${code('talos/imu_link')}: upside down, turned −90°`],
      ['Driver', `${link(CORE + 'riptide_imu/src/main.cpp', 'riptide_imu')} on ${code('/dev/ttyTHS1')}`],
      ['Used for', 'EKF: roll, pitch, their rates, acceleration. MPC: roll and pitch rates (yaw rate only if the FOG goes quiet).'],
      ['Watch for', 'Rate covariance 0.01 is 10,000× the real noise.'],
    ],
  },
  {
    id: 'fog', anchor: 'left', label: 'FOG', title: 'Fibre-optic gyro (Fizoptika VG103S-2LND)', href: '#fog',
    what: 'Yaw rate only, from the Sagnac phase shift of light sent both ways around a fibre coil. Its bias barely moves, so it is the source of Talos\'s heading.',
    rows: [
      ['Rate', '≈475 Hz (throttled to 500 Hz)'],
      ['Topic', `${code('gyro/twist')} (angular.z), ${code('gyro/status')}`],
      ['Frame', `${code('talos/fog_link')}: pose all zeros in ${code('talos.yaml')} (drawn at the origin). Only the axis matters for a gyro.`],
      ['Driver', `${link(CORE + 'riptide_gyro/src/riptide_gyro/driver.cpp', 'riptide_gyro')}, RS-422 on ${code('/dev/ttyTHS2')}`],
      ['Used for', 'EKF and MPC yaw rate. Yaw itself is its integral.'],
      ['Watch for', 'A bad tare; temperature outside 37.6 to 51.3 °C.'],
    ],
  },
  {
    id: 'dvl', anchor: 'below', label: 'DVL', title: 'Nortek DVL1000', href: '#dvl',
    what: 'Velocity over the pool floor, from the Doppler shift of four sound beams slanted 25° from vertical.',
    rows: [
      ['Rate', '8 Hz; each reading ≈125 ms old on arrival'],
      ['Topic', `${code('dvl_twist')}, ${code('dvl/bottom_lock')}`],
      ['Frame', `${code('talos/dvl_link')}: turned −45°, 24 cm below the centre of mass`],
      ['Driver', `${link(DVLREPO + 'nortek_dvl/src/dvl_driver.cpp', 'nortek_dvl')} over Ethernet, 192.168.1.212:9004`],
      ['Used for', 'EKF and MPC velocity; x and y position are its integral.'],
      ['Watch for', 'Lost bottom lock near the floor or walls; settings on its web page.'],
    ],
  },
  {
    id: 'depth', anchor: 'ne', label: 'Depth', title: 'Bar02 pressure sensor', href: '#depth',
    what: 'Water pressure, turned into depth with fresh-water density. The sensor sits in the starboard lid; the camera cage board\'s RP2040 reads it over I²C.',
    rows: [
      ['Rate', '20 Hz'],
      ['Topic', `${code('state/depth/raw')} → ${code('depth/pose')}`],
      ['Frame', `${code('talos/pressure_link')}, 13.5 cm above ${code('base_link')}`],
      ['Driver', `Firmware ${link(FW + 'fix/depth-timestamps/lib/driver_depth/src/depth.c', 'driver_depth')}, then ${link(CORE + 'riptide_hardware/riptide_hardware2/depth_converter.py', 'depth_converter.py')}`],
      ['Used for', 'EKF and MPC z.'],
      ['Watch for', 'Zeroed at power-up: power up at the surface, or clear depth there.'],
    ],
  },
  {
    id: 'hydro', anchor: 'above', label: 'Hydrophone', dotLabel: 'Hydrophone poses (unused)', shortLabel: 'Hydrophones', title: 'Hydrophone (Aquarian Audio H1C)', href: '#acoustics',
    what: 'Sound pressure. The IVC board filters it at the pinger frequency and streams the loudness; Talos compares two places to tell which task has the pinger.',
    rows: [
      ['Rate', 'Streamed while sampling; one Bool per comparison'],
      ['Topic', `${code('ivc/pinger/selected_freq_amp_stream')} → ${code('acoustics/buffer_0_closer')}`],
      ['Frame', `None in use. The two dots are the port and starboard poses in ${code('talos.yaml')}: no code uses them, and they may be stale.`],
      ['Driver', `IVC board firmware, then ${link(CORE + 'riptide_acoustics/src/Acoustics.cpp', 'riptide_acoustics')}`],
      ['Used for', 'The RandomPinger subtree of the mission.'],
      ['Watch for', 'Loudness only, no direction.'],
    ],
  },
];

Promise.all([getJSON('catalog.json')]).then(([cat]) => {
  const card = document.getElementById('sx-card');
  const chips = document.getElementById('sx-chips');
  const poses = { imu: [cat.poses.imu], fog: [cat.poses.fog], dvl: [cat.poses.dvl], depth: [cat.poses.depth], hydro: [cat.hydrophones.port, cat.hydrophones.starboard] };
  const list = [
    ...SENSORS.map((s) => ({ id: s.id, label: s.dotLabel ?? s.label, shortLabel: s.shortLabel, poses: poses[s.id], anchor: s.anchor })),
    { id: 'base', label: 'base_link', muted: true, anchor: 'below', poses: [[...cat.base_link, 0, 0, 0]] },
    { id: 'front', label: 'front', muted: true, arrow: true, anchor: 'right', poses: [[cat.base_link[0] + 0.42, cat.base_link[1], cat.base_link[2], 0, 0, 0]] },
  ];
  let scene = null;
  function pick(id) {
    const s = SENSORS.find((x) => x.id === id);
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === id)));
    const p = poses[id][0];
    card.innerHTML = `<h3>${s.title}</h3><p>${s.what}</p><dl class="spec">${s.rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}
      <dt>Pose</dt><dd>${p.slice(0, 3).map((v) => v.toFixed(3)).join(', ')} m; rpy ${p.slice(3).map((v) => (v * R2D).toFixed(0) + '°').join(', ')}</dd></dl>
      <a class="sx-more" href="${s.href}">More on the ${s.label === 'Hydrophone' ? 'hydrophone' : s.label === 'Depth' ? 'depth sensor' : s.label} ↓</a>`;
    scene?.select(id);
  }
  SENSORS.forEach((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.k = s.id;
    b.textContent = s.label;
    b.addEventListener('click', () => pick(s.id));
    chips.appendChild(b);
  });
  try {
    scene = createSensorScene(document.getElementById('sx-canvas'), { sensors: list, baseLink: cat.base_link, onPick: pick, labelHost: document.getElementById('sx-labels') });
  } catch (e) {
    document.querySelector('.sx-view').classList.add('no-gl');
  }
  pick('imu');
});

// ---------------------------------------------------------------- one second of messages
getJSON('timeline.json').then((tl) => {
  const host = document.getElementById('tl-chart');
  const note = document.getElementById('tl-note');
  const ROWS = [
    { k: 'IMU', color: '--state', text: '<b>IMU</b>: 400 messages a second, one every 2.5 ms. Stamped when the driver parses the packet.' },
    { k: 'FOG', color: '--reference', text: '<b>Gyro</b>: about 475 a second. The driver passes a reading on only if 2 ms have gone by since the last one (<code>max_publish_rate</code> 500), so spacing jitters between 1 and 3.4 ms.' },
    { k: 'Depth', color: '--prediction', text: '<b>Depth</b>: 20 a second, from the camera cage board over CAN, the micro-ROS agent and <code>depth_converter.py</code>.' },
    { k: 'DVL', color: '--s7', h: 50, text: '<b>DVL</b>: 8 a second. Each velocity was measured about 125 ms before it arrived. The hollow dots (lower line) are the messages\' own stamps, the moments of their echoes; each arrow runs from an echo up to its own arrival. Because the DVL pings every 125 ms, each echo lines up with the previous arrival.' },
    { k: 'EKF', color: '--s4', text: '<b>EKF</b>: <code>odometry/filtered</code> at 30 Hz. Not a sensor: the filter that fuses the rows above (Chapter 9).' },
    { k: 'MPC', color: '--s5', text: '<b>MPC</b>: the controller\'s own state estimate, once per 50 ms tick.' },
  ];
  let zoom = 1, w0 = 0, hot = null;
  // The zoomed window starts just before the first DVL echo, so it shows one measurement and its arrival.
  const firstEcho = tl.DVL.stamp.find((t) => t >= 0) ?? 0;
  const draw = () => {
    host.innerHTML = '';
    const W = Math.max(280, host.clientWidth || 600), narrow = W < 520;
    const L = narrow ? 50 : 64, Rm = 14, rowH0 = 34, top = 10;
    const rowY = []; let yy = top;
    ROWS.forEach((r) => { rowY.push(yy); yy += r.h || rowH0; });
    const H = yy + 26;
    const svg = el('svg', { class: 'chart tl', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Message arrival times per sensor' }, host);
    const sx = (t) => L + ((t - w0) / zoom) * (W - L - Rm);
    // Arrowhead for the DVL echo-to-arrival arcs.
    const mk = el('marker', { id: 'tl-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto' }, el('defs', {}, svg));
    el('path', { d: 'M0,1 L10,5 L0,9 z', fill: css('--s7') }, mk);
    const axis = el('g', { class: 'axis' }, svg);
    const step = zoom === 1 ? 0.1 : 0.02;
    for (let t = Math.ceil(w0 / step - 1e-9) * step; t <= w0 + zoom + 1e-9; t += step) {
      el('line', { x1: sx(t), x2: sx(t), y1: top, y2: H - 22, stroke: 'var(--grid)' }, svg);
      const i = Math.round(t / step);
      if (!narrow || i % 2 === 0) el('text', { x: sx(t), y: H - 6, 'text-anchor': 'middle' }, axis).textContent = `${Math.round(t * 1000)}`;
    }
    el('text', { x: 4, y: H - 6, class: 'tl-unit' }, axis).textContent = 'ms';
    ROWS.forEach((row, j) => {
      const rowH = row.h || rowH0, y = rowY[j], mid = y + rowH0 / 2;
      const g = el('g', { class: 'tl-row' + (hot && hot !== row.k ? ' dim' : '') + (hot === row.k ? ' hot' : ''), tabindex: 0 }, svg);
      el('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }, g);
      el('text', { x: 4, y: mid + 4, class: 'label' }, g).textContent = row.k;
      const d = tl[row.k], color = css(row.color);
      // DVL: arrival ticks on the upper line, echo dots on a lower line, an arrow from each echo to its own arrival.
      const tickB = row.k === 'DVL' ? y + 24 : y + rowH - 7, dotY = y + 39;
      if (row.k === 'DVL') el('text', { x: 4, y: dotY + 4, class: 'label tl-sub' }, g).textContent = 'echo';
      let n = 0;
      const inWin = (t) => t >= w0 && t <= w0 + zoom;
      let path = '';
      d.recv.forEach((t, i) => {
        if (!inWin(t)) return;
        path += `M${sx(t).toFixed(1)},${y + 7}V${tickB}`;
        if (row.k === 'DVL') {
          const s = d.stamp[i], x0 = sx(Math.max(s, w0)), x1 = sx(t);
          // a diagonal from the echo (lower line) up to the foot of its own arrival tick; alternate strength so pairs read apart
          const op = n++ % 2 ? 0.45 : 0.9;
          el('path', { d: `M${(x0 + (s >= w0 ? 4 : 0)).toFixed(1)},${dotY - 1}L${(x1 - 1).toFixed(1)},${tickB + 2}`, stroke: color, 'stroke-width': 1.4, 'stroke-opacity': op, fill: 'none', 'stroke-dasharray': '3 2.5', 'marker-end': 'url(#tl-arrow)' }, g);
          if (s >= w0) el('circle', { cx: sx(s), cy: dotY, r: 4, fill: 'var(--paper-2)', stroke: color, 'stroke-width': 2, 'stroke-opacity': op === 0.9 ? 1 : 0.6 }, g);
        }
      });
      el('path', { d: path, stroke: color, 'stroke-width': row.k === 'IMU' || row.k === 'FOG' ? (zoom === 1 ? 0.8 : 1.6) : 2.4, fill: 'none' }, g);
      const show = () => { hot = row.k; note.innerHTML = row.text + ` <span class="tl-count">${d.recv.filter(inWin).length} in this window.</span>`; draw(); };
      g.addEventListener('pointerdown', show);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && hot !== row.k) show(); });
      g.addEventListener('focus', () => { if (hot !== row.k) show(); });
    });
  };
  note.innerHTML = 'Tap or hover a row for what it is and how it is stamped.';
  segment(document.getElementById('tl-zoom'), (z) => { zoom = +z; w0 = zoom === 1 ? 0 : Math.max(0, Math.floor((firstEcho - 0.02) * 100) / 100); draw(); });
  new ResizeObserver(() => draw()).observe(host);
});

// ---------------------------------------------------------------- still: drift, noise, pool
Promise.all([getJSON('still.json'), getJSON('pool.json')]).then(([st, pool]) => {
  const host = document.getElementById('still-chart');
  const note = document.getElementById('still-note');
  let chart = null;
  const blue = css('--state'), orange = css('--reference');
  const A = st.stats.A, B = st.stats.B;
  const views = {
    drift: () => ({
      opts: { height: 270, xLabel: 'time still (s)', yLabel: 'heading change (°)', digits: 3, unit: '°', yZero: true },
      series: [
        { name: 'IMU, run 1', color: blue, values: pts(st.driftA.t, st.driftA.imu) },
        { name: 'FOG, run 1', color: orange, values: pts(st.driftA.t, st.driftA.fog) },
        { name: 'IMU, run 2', color: blue, dash: true, values: pts(st.driftB.t, st.driftB.imu) },
        { name: 'FOG, run 2', color: orange, dash: true, values: pts(st.driftB.t, st.driftB.fog) },
      ],
      note: `Run 1 began just after hand tilts: the IMU built up <b>${Math.max(...st.driftA.imu).toFixed(2)}°</b> in about 50 s, then levelled off. Run 2: IMU within <b>${Math.max(...st.driftB.imu.map(Math.abs)).toFixed(2)}°</b> (${B.imu_yaw_bias_deg_h} °/h on average). FOG within <b>${Math.max(...st.driftA.fog.map(Math.abs), ...st.driftB.fog.map(Math.abs)).toFixed(2)}°</b> in both, after its tare.`,
    }),
    noise: () => ({
      opts: { height: 270, xLabel: 'time (s)', yLabel: 'yaw rate (°/s)', digits: 3, unit: '°/s', yZero: true },
      series: [
        { name: 'IMU, 400 Hz', color: blue, values: pts(st.noise.imu_t, st.noise.imu_yaw), width: 1.2 },
        { name: 'FOG, ≈475 Hz', color: orange, values: pts(st.noise.fog_t, st.noise.fog_yaw), width: 1.2, opacity: 0.85 },
      ],
      note: `Standard deviation per sample: IMU yaw <b>${(B.imu_rate_std_rad_s[2] * R2D).toFixed(3)} °/s</b>, FOG <b>${(B.fog_rate_std_rad_s * R2D).toFixed(3)} °/s</b>. Noise this fast averages out when integrated; bias doesn't.`,
    }),
    pool: () => ({
      opts: { height: 270, xDomain: [0, 120], xLabel: `time (s, from ${pool.yaw.t0} s into the run)`, yLabel: 'yaw rate (°/s)', digits: 1, unit: '°/s', yZero: true },
      series: [
        { name: 'IMU (−z)', color: blue, values: pts(pool.yaw.imu_t, pool.yaw.imu), width: 1.6 },
        { name: 'FOG', color: orange, values: pts(pool.yaw.fog_t, pool.yaw.fog), width: 1.6, dash: true },
      ],
      note: 'Spins of up to 53 °/s during identification (20 Hz means). In motion the two agree; what separates them is a slow bias that is invisible at this scale.',
    }),
  };
  const show = (k) => {
    const v = views[k]();
    host.innerHTML = '';
    chart = new LineChart(host, v.opts);
    chart.set(v.series);
    note.innerHTML = v.note;
  };
  segment(document.getElementById('still-pick'), show);
  show('drift');

  // DVL in the pool: DVL axes against body axes
  const dvlChart = new LineChart(document.getElementById('dvlp-chart'), { height: 260, xDomain: [0, 100], xLabel: `time (s, from ${pool.dvl.t0} s into the run)`, yLabel: 'velocity (m/s)', digits: 3, unit: 'm/s', yZero: true });
  const dv = pool.dvl;
  const showDvl = (k) => dvlChart.set(k === 'raw'
    ? [
      { name: 'DVL x', color: blue, values: pts(dv.t, dv.x) },
      { name: 'DVL y', color: orange, values: pts(dv.t, dv.y) },
      { name: 'DVL z', color: css('--prediction'), values: pts(dv.t, dv.z) },
    ]
    : [
      { name: 'surge (body x)', color: blue, values: pts(dv.t, dv.bx) },
      { name: 'sway (body y)', color: orange, values: pts(dv.t, dv.by) },
      { name: 'heave (z)', color: css('--prediction'), values: pts(dv.t, dv.z) },
    ]);
  segment(document.getElementById('dvlp-pick'), showDvl);
  showDvl('raw');

  // Depth: pressure against the integrated DVL heave
  const dp = pool.depth;
  new LineChart(document.getElementById('depth-chart'), { height: 260, xDomain: [0, 260], xLabel: `time (s, from ${dp.t0} s into the run)`, yLabel: 'z (m, 0 = surface)', digits: 2, unit: 'm' }).set([
    { name: 'Pressure sensor (depth/pose)', color: blue, values: pts(dp.t, dp.z) },
    { name: 'DVL heave, integrated', color: orange, values: pts(dp.dvl_t, dp.dvl_z), dash: true },
  ]);
});

// ---------------------------------------------------------------- FOG calibration surface
getJSON('catalog.json').then(({ gyro: g }) => {
  const host = document.getElementById('cal-chart');
  const note = document.getElementById('cal-note');
  const controls = document.getElementById('cal-controls');
  const [tLo, tHi] = g.cal_temp_limits;
  const TREF = 45;
  let T = 38, view = 'bend', chart = null; // starts away from 45 °C so the temperature effect shows
  const rate = (raw, temp) => {
    const x = (raw - g.rate_norm_mean) / g.rate_norm_std, y = (temp - g.temp_norm_mean) / g.temp_norm_std;
    return g.a + g.b * x ** 3 + g.c * x * y + g.d * Math.cos(g.f * x + g.g);
  };
  // The straight line: the 45 °C curve's value and slope at zero counts.
  const z0 = rate(0, TREF), slope = (rate(1e3, TREF) - rate(-1e3, TREF)) / 2e3;
  const line = (raw) => z0 + slope * raw;
  const views = `<span class="seg" role="group" aria-label="Calibration view"><button type="button" aria-pressed="true" data-k="bend">Bend</button><button type="button" aria-pressed="false" data-k="full">Full curve</button></span>`;
  controls.insertAdjacentHTML('beforeend', views);
  // On a phone the chart only has room for three x ticks; ±4 million would get just '0', so it shows ±3 million (ticks −2, 0, 2).
  let span = 0;
  const draw = () => {
    span = (host.clientWidth || 600) < 400 ? 3e6 : 4e6;
    const xs = Array.from({ length: 161 }, (_, i) => -span + (i * 2 * span) / 160);
    host.innerHTML = '';
    const bend = view === 'bend';
    chart = new LineChart(host, bend
      ? { height: 260, xLabel: 'raw reading (millions of counts)', yLabel: 'calibrated − straight line (°/s)', digits: 2, unit: '°/s', yZero: true }
      : { height: 260, xLabel: 'raw reading (millions of counts)', yLabel: 'yaw rate (°/s)', digits: 1, unit: '°/s', yZero: true });
    const f = bend ? (r, t) => (rate(r, t) - line(r)) * R2D : (r, t) => rate(r, t) * R2D;
    const series = [{ name: `At ${T.toFixed(1)} °C`, color: css('--accent'), values: xs.map((r) => ({ x: r / 1e6, y: f(r, T) })), width: 2.2 }];
    if (bend) series.push({ name: `At ${TREF} °C (reference)`, color: css('--muted'), dash: true, width: 1.5, values: xs.map((r) => ({ x: r / 1e6, y: f(r, TREF) })) });
    else series.push({ name: 'Straight line', color: css('--muted'), dash: true, width: 1.5, values: xs.map((r) => ({ x: r / 1e6, y: line(r) * R2D })) });
    chart.set(series);
    const r1 = rate(2e6, T) * R2D, b1 = (rate(2e6, T) - line(2e6)) * R2D, bEnd = (rate(span, T) - line(span)) * R2D;
    const lo = rate(2e6, tLo) * R2D, hi = rate(2e6, tHi) * R2D;
    note.innerHTML = `At ${T.toFixed(1)} °C, a reading of 2,000,000 counts is <b>${r1.toFixed(2)} °/s</b>; the straight line is off by <b>${Math.abs(b1).toFixed(2)} °/s</b> there and by ${Math.abs(bEnd).toFixed(1)} °/s at ${span / 1e6} million. Across the calibrated temperatures (${tLo.toFixed(1)} to ${tHi.toFixed(1)} °C) that reading spans ${Math.min(lo, hi).toFixed(2)} to ${Math.max(lo, hi).toFixed(2)} °/s.`;
  };
  slider(controls, 'FOG temperature', tLo, tHi, 0.1, T, (v) => `${v.toFixed(1)} °C`, (v) => { T = v; draw(); });
  segment(controls.querySelector('.seg'), (k) => { view = k; draw(); });
  draw();
  new ResizeObserver(() => { if (((host.clientWidth || 600) < 400 ? 3e6 : 4e6) !== span) draw(); }).observe(host);
});

// ---------------------------------------------------------------- DVL beams
{
  const S = Math.sin((25 * Math.PI) / 180), C = Math.cos((25 * Math.PI) / 180);
  const beams = [0, 90, 180, 270].map((az) => { const a = (az * Math.PI) / 180; return [S * Math.cos(a), S * Math.sin(a), -C]; });
  const state = ['ok', 'ok', 'ok', 'ok'];
  const v = [0.3, 0, 0];
  const svgHost = document.getElementById('dvl-svg'), out = document.getElementById('dvl-out');
  const controls = document.getElementById('dvl-controls');
  slider(controls, 'Surge', -0.6, 0.6, 0.01, v[0], (x) => `${x.toFixed(2)} m/s`, (x) => { v[0] = x; draw(); });
  slider(controls, 'Sway', -0.6, 0.6, 0.01, v[1], (x) => `${x.toFixed(2)} m/s`, (x) => { v[1] = x; draw(); });
  slider(controls, 'Heave', -0.3, 0.3, 0.01, v[2], (x) => `${x.toFixed(2)} m/s`, (x) => { v[2] = x; draw(); });
  const reset = document.createElement('button');
  reset.type = 'button'; reset.className = 'btn'; reset.textContent = 'All beams good';
  reset.addEventListener('click', () => { state.fill('ok'); draw(); });
  controls.appendChild(reset);

  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const f3 = (x) => (Math.abs(x) < 5e-4 ? 0 : x).toFixed(3);
  function solve3(M, y) { // Gaussian elimination with pivoting; null if singular
    const A = M.map((r, i) => [...r, y[i]]);
    for (let c = 0; c < 3; c++) {
      let p = c;
      for (let r = c + 1; r < 3; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      if (Math.abs(A[p][c]) < 1e-9) return null;
      [A[c], A[p]] = [A[p], A[c]];
      for (let r = 0; r < 3; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k < 4; k++) A[r][k] -= f * A[c][k]; }
    }
    return A.map((r, i) => r[3] / r[i]);
  }
  function draw() {
    const meas = beams.map((b, i) => dot(b, v) + (state[i] === 'bad' ? 0.15 : 0));
    const use = beams.map((_, i) => i).filter((i) => state[i] !== 'lost');
    let sol = null, resid = 0;
    if (use.length >= 3) {
      const BtB = [0, 1, 2].map((r) => [0, 1, 2].map((c) => use.reduce((s, i) => s + beams[i][r] * beams[i][c], 0)));
      const Btm = [0, 1, 2].map((r) => use.reduce((s, i) => s + beams[i][r] * meas[i], 0));
      sol = solve3(BtB, Btm);
      if (sol) resid = Math.sqrt(use.reduce((s, i) => s + (dot(beams[i], sol) - meas[i]) ** 2, 0));
    }
    // top view
    const W = 300, H = 300, cx = W / 2, cy = H / 2, R = 96, k = 120;
    svgHost.innerHTML = '';
    const svg = el('svg', { class: 'chart dvl-top', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'DVL beams seen from above' }, svgHost);
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'dvl-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
    el('path', { d: 'M0,1 L9,5 L0,9 z', fill: css('--ink') }, mk);
    // DVL x forward = up on screen, y left = left on screen
    const toS = (x, y) => [cx - y * k, cy - x * k]; // k px per m/s
    el('text', { x: cx, y: 14, 'text-anchor': 'middle', class: 'label' }, svg).textContent = 'DVL x';
    el('text', { x: 6, y: cy - 6, class: 'label' }, svg).textContent = 'y';
    beams.forEach((b, i) => {
      const fx = cx - (b[1] / S) * R, fy = cy - (b[0] / S) * R;
      const st = state[i];
      el('line', { x1: cx, y1: cy, x2: fx, y2: fy, stroke: st === 'lost' ? 'var(--rule)' : 'var(--ink-2)', 'stroke-width': 1.2, 'stroke-dasharray': st === 'lost' ? '3 4' : '' }, svg);
      const g = el('g', { class: 'dvl-beam', tabindex: 0, role: 'button', 'aria-label': `Beam ${i + 1}: ${st}` }, svg);
      el('circle', { cx: fx, cy: fy, r: 26, fill: st === 'lost' ? 'var(--paper)' : st === 'bad' ? '#fde9df' : 'var(--paper)', stroke: st === 'bad' ? css('--accent') : st === 'lost' ? 'var(--rule)' : 'var(--ink)', 'stroke-width': st === 'ok' ? 1.5 : 2, 'stroke-dasharray': st === 'lost' ? '4 3' : '' }, g);
      el('text', { x: fx, y: fy - 5, 'text-anchor': 'middle', class: 'label' }, g).textContent = `beam ${i + 1}`;
      el('text', { x: fx, y: fy + 11, 'text-anchor': 'middle', class: 'label dvl-val' }, g).textContent = st === 'lost' ? 'lost' : `${meas[i] >= 5e-4 ? '+' : ''}${f3(meas[i])}`;
      const cycle = () => { state[i] = st === 'ok' ? 'lost' : st === 'lost' ? 'bad' : 'ok'; draw(); };
      g.addEventListener('click', cycle);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); } });
    });
    el('circle', { cx, cy, r: 7, fill: css('--ink') }, svg);
    const [ax, ay] = toS(v[0], v[1]);
    if (Math.hypot(v[0], v[1]) > 0.02) el('line', { x1: cx, y1: cy, x2: ax, y2: ay, stroke: css('--ink'), 'stroke-width': 2.5, 'marker-end': 'url(#dvl-arrow)' }, svg);
    // readout
    const n = use.length, bad = state.some((s, i) => s === 'bad');
    let verdict;
    if (!sol) verdict = `<p class="dvl-verdict no"><b>No velocity.</b> ${n} beam${n === 1 ? '' : 's'} can't pin down three unknowns: no bottom lock, nothing on <code>dvl_twist</code>.</p>`;
    else if (n === 4) verdict = resid > 1e-4
      ? `<p class="dvl-verdict warn"><b>The beams disagree</b> by ${resid.toFixed(3)} m/s. With a spare beam the error shows, and the DVL's quality figures drop.</p>`
      : '<p class="dvl-verdict ok"><b>Four beams agree.</b> The spare equation is a free consistency check.</p>';
    else verdict = bad
      ? '<p class="dvl-verdict warn"><b>Exactly three beams, one of them wrong:</b> the answer is wrong and nothing can tell.</p>'
      : '<p class="dvl-verdict ok"><b>Three beams: just enough.</b> No spare left to check the answer.</p>';
    out.innerHTML = `<table class="params dvl-tab"><thead><tr><th>Axis</th><th>True</th><th>Solved</th></tr></thead><tbody>${['x', 'y', 'z'].map((a, i) => `<tr><td>v<sub>${a}</sub></td><td>${f3(v[i])}</td><td>${sol ? f3(sol[i]) : '—'}</td></tr>`).join('')}</tbody></table>${verdict}<p class="dvl-tip">Tap a beam: good → lost → wrong by 0.15 m/s.</p>`;
  }
  draw();
}

// ---------------------------------------------------------------- troubleshooting
{
  const T = [
    ['imu', 'No <code>vectornav/imu</code>', 'Wrong port (Talos needs <code>imu_port:=/dev/ttyTHS1</code>), or the VN-100 hung.', `<code>ros2 topic hz /talos/vectornav/imu</code> should say 400. Driver log: "Unable to connect to IMU". Viewer electrical panel: Cycle IMU (${link(CORE + 'riptide_hardware/riptide_hardware2/imu_power_cycle.py', 'holds Orin GPIO pin 22 low for 10 s')}).`],
    ['imu', 'IMU rate no longer 400 Hz', 'Registers written and not saved, or saved with a different rate.', 'Read the output registers from the viewer\'s electrical panel; save after any change.'],
    ['imu', 'Gaps in <code>vectornav/imu</code>', 'The driver drops a message with NaN, a quaternion component above 1, a rate above 2π rad/s or an acceleration above 20 m/s². A serial hiccup also makes the driver reconnect, which reboots the VN-100 (a gap in the data).', 'Driver log errors. <code>ros2 topic hz</code> for gaps.'],
    ['imu', 'EKF roll and pitch rates small and late', '<code>angular_velocity_covariance</code> 0.01 in <code>riptide_imu/config/vectornav.yaml</code>.', 'Compare <code>odometry/filtered</code> twist with the IMU in a bag (<a href="localization.html#lag">The EKF is late</a>).'],
    ['fog', 'Heading creeps while Talos sits still', 'A bad or old tare (taken while moving or tilted). Rarely the gyro itself.', 'With Talos still and level, tare from the viewer (100,000 samples).'],
    ['fog', '<code>temp_within_cal</code> false', 'FOG colder than 37.6 °C (just powered on) or hotter than 51.3 °C.', 'Watch the FOG temperature in the viewer header (warns at 55 °C, errors at 75 °C); let it warm up.'],
    ['fog', 'Yaw rate suspect, <code>gyro/status</code> flags', 'Supply outside 4.75 to 5.25 V, light-source (SLD) current outside 0.07 to 0.15 A, or diagnostic signal outside 0.95 to 1.05.', '<code>ros2 topic echo /talos/gyro/status</code>; check the FOG supply and wiring.'],
    ['fog', 'No <code>gyro/twist</code>', 'Port (<code>gyro_port:=/dev/ttyTHS2</code>) or the RS-422 breakout. The driver exits if the port won\'t open.', 'Driver log: "Caught SerialLibraryException". <code>gyro/status</code> <code>connected</code> goes false after 1 s without a rate frame.'],
    ['dvl', '<code>dvl/bottom_lock</code> false', 'Too close to the floor, beams on a wall or a prop, bubbles, or out of the water.', 'Viewer DVL readout. Move away from walls; check depth against the pool depth. Nereus never loses lock, so test this in the pool.'],
    ['dvl', 'No DVL topics at all', 'DVL unreachable; the driver gives up after 100 s and is respawned.', '<code>ping 192.168.1.212</code>. Driver log: "Failed connection attempt to DVL".'],
    ['dvl', 'Every velocity slightly off', 'Speed of sound on the DVL doesn\'t match the water (1480 m/s fixed; fresh water is ≈1482 m/s at 20 °C, ≈1500 m/s at 27 °C).', 'Compare the DVL web page\'s Measurement Configuration with the pool temperature (<code>state/depth/temp</code>).'],
    ['dvl', 'Velocity in the wrong direction', 'TF missing <code>dvl_link</code>\'s −45° turn (it is on <code>/tf</code>, not <code>/tf_static</code>).', '<code>ros2 run tf2_ros tf2_echo talos/base_link talos/dvl_link</code>'],
    ['depth', 'Depth not zero at the surface', 'Board powered up underwater, or an old surface pressure kept through a watchdog reset.', 'At the surface: Clear depth (<code>CLEAR_DEPTH</code>) in the viewer\'s electrical panel.'],
    ['depth', 'No <code>depth/pose</code>', 'No <code>state/depth/raw</code> (CAN, micro-ROS agent, camera cage board), or <code>depth_converter.py</code> can\'t get <code>odom → base_link</code> yet.', '<code>ros2 topic hz /talos/state/depth/raw</code> (20 Hz); is the EKF running?'],
    ['acoustics', '<code>buffer_0_closer</code> never changes', 'No amplitude stream: pinger mode not enabled (viewer electrical panel → Pinger; no viewer running), or IVC firmware without the pinger. Or the <code>max</code>-mode gap.', 'Watch the amplitude in the viewer\'s pinger readout. <code>ros2 topic hz /talos/ivc/pinger/selected_freq_amp_stream</code>'],
    ['acoustics', '<code>stop_sample</code>: "Cannot compare"', 'A buffer stayed empty: nothing arrived while sampling (pinger mode off, or no stream).', 'Same as above; check the viewer\'s pinger frequency (<code>ivc/pinger/selected_freq_khz</code>) matches the pinger. Always the case in Nereus, which has no pinger.'],
    ['acoustics', 'Talos goes to the wrong task first', 'The tree reads <code>buffer_0_closer</code> (torpedo louder) as <code>is_table</code>, or a stale <code>max</code>-mode answer.', 'The <code>stop_sample</code> response and node log give both results; see <a href="robosub.html#tree">RoboSub</a>.'],
  ];
  const pick = document.getElementById('tr-pick'), list = document.getElementById('tr-list');
  const NAMES = [['all', 'All'], ['imu', 'IMU'], ['fog', 'FOG'], ['dvl', 'DVL'], ['depth', 'Depth'], ['acoustics', 'Pinger']];
  pick.innerHTML = NAMES.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === 'all'}">${n}</button>`).join('');
  const show = (k) => {
    list.innerHTML = T.filter((r) => k === 'all' || r[0] === k).map(([s, sym, cause, check]) =>
      `<div class="tr-item"><div class="tr-sym"><span class="tr-tag">${NAMES.find((x) => x[0] === s)[1]}</span>${sym}</div><div class="tr-row"><span>Likely</span><div>${cause}</div></div><div class="tr-row"><span>Check</span><div>${check}</div></div></div>`).join('');
  };
  segment(pick, show);
  show('all');
}
