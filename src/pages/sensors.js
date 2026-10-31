import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/sensors.css';
import { LineChart, el } from '../viz/chart.js';
import { createSensorScene } from '../viz/sensors-scene.js';

setup();
// Public images: the base is prepended here, because the dev server and the build treat absolute paths in HTML differently.
document.querySelectorAll('img[data-src]').forEach((img) => (img.src = BASE + img.dataset.src));
// Topic names in this page's tables stay whole (the shared table wrapper adds break points after _ and /).
document.querySelectorAll('table.params td code wbr').forEach((w) => w.remove());
document.querySelectorAll('a[data-href]').forEach((a) => (a.href = BASE + a.dataset.href));
// A link to a folded section (#dvl-settings, #dvl-driver) opens the fold.
const openFold = () => {
  const id = decodeURIComponent(location.hash.slice(1));
  const t = id ? document.getElementById(id) : null;
  const d = t?.closest('details');
  if (d && !d.open) { d.open = true; t.scrollIntoView(); }
};
addEventListener('hashchange', openFold);
openFold();

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
// Each sensor: a CAD picture with the sensor in orange (cropped from media/cad/ctx-*, square), callouts in % of the
// picture (x, y: the part; lx, ly: the label), and a short card. Positions of the parts were found from the CAD
// component boxes (tools/cad/tree_Talos.jsonl): the hydrophone pod sits under the frame, behind the DVL and to
// starboard; the transducer to port.
const SENSORS = [
  {
    id: 'imu', anchor: 'nw', label: 'IMU', title: 'VectorNav VN-100 IMU', href: '#imu', more: 'the IMU',
    what: 'Tilt, turn rates and acceleration.',
    where: 'Inside the hull, at the stern end of the starboard (camera) cage, mounted upside down and turned 90°. The picture hides the hull and the port cage.',
    pic: 'loc-imu', alt: 'The starboard electronics cage with the hull hidden, bow end towards the lower right; the VN-100 is a small orange block at its stern end.',
    marks: [{ x: 19.3, y: 44.3, r: 6, lx: 30, ly: 66, text: 'VN-100' }, { x: 0, y: 0, r: 0, lx: 76, ly: 93, text: 'Bow end', muted: true }],
    rate: '400 Hz', topic: 'vectornav/imu',
  },
  {
    id: 'fog', anchor: 'left', label: 'FOG', dotLabel: 'FOG (axis only)', title: 'Fibre-optic gyro (FOG)', href: '#fog', more: 'the FOG',
    what: 'Yaw rate only, and very steady: Talos\'s heading comes from it.',
    where: 'Not in the CAD, and its pose in <code>talos.yaml</code> is all zeros. It needs none: a gyro reads the same turn rate anywhere on a rigid robot, so only its axis matters (body z, straight up).',
    rate: '≈475 Hz', topic: 'gyro/twist',
  },
  {
    id: 'dvl', anchor: 'below', label: 'DVL', title: 'Nortek DVL1000', href: '#dvl', more: 'the DVL',
    what: 'Velocity over the pool floor, from four sound beams.',
    where: 'Under the hull, near the middle, looking down; turned 45°. The picture looks up at Talos from below the bow.',
    pic: 'loc-dvl', alt: 'Talos seen from below, bow end towards the viewer, with the DVL, a cylinder under the hull, in orange.',
    marks: [{ x: 45.2, y: 62.9, r: 11, lx: 16, ly: 92, text: 'DVL' }, { x: 0, y: 0, r: 0, lx: 23, ly: 43, text: 'Bow windows', muted: true }],
    rate: '8 Hz, each reading ≈125 ms old', topic: 'dvl_twist',
  },
  {
    id: 'depth', anchor: 'ne', label: 'Depth', title: 'Bar02 depth sensor', href: '#depth', more: 'the depth sensor',
    what: 'Depth, from water pressure.',
    where: 'In the starboard lid at the stern of the hull, open to the water. The picture looks at the stern from behind.',
    pic: 'loc-depth', alt: 'The stern of the hull seen from behind, with the depth sensor, a small orange fitting in the middle of the starboard lid.',
    marks: [{ x: 50.5, y: 43.1, r: 5, lx: 50, ly: 22, text: 'Depth sensor' }, { x: 0, y: 0, r: 0, lx: 44, ly: 66, text: 'Starboard lid', muted: true }],
    rate: '20 Hz', topic: 'depth/pose',
  },
  {
    id: 'hydro', anchor: 'above', label: 'Hydrophone', title: 'Hydrophone pod', href: '#acoustics', more: 'acoustics',
    what: 'Listens for the pinger, and receives the other robot\'s IVC messages. A separate transducer sends Talos\'s own.',
    where: 'Under the frame, behind the DVL and to starboard; the transducer is to port. The picture looks up from below the bow.',
    pic: 'loc-hydro', alt: 'Talos seen from below, bow end towards the viewer, with the hydrophone pod under the frame and the small transducer to its side, both in orange.',
    marks: [
      { x: 0, y: 0, r: 0, lx: 23, ly: 43, text: 'Bow windows', muted: true },
      { x: 53.6, y: 82.3, r: 9, lx: 22, ly: 94, text: 'Hydrophone pod' },
      { x: 66.9, y: 71.4, r: 4, lx: 86, ly: 88, text: 'Transducer' },
      { x: 45.2, y: 62.9, r: 0, lx: 42, ly: 60, text: 'DVL', muted: true },
    ],
    rate: '1 Hz, from the first comparison until the next <code>start_sample</code>', topic: 'acoustics/buffer_0_closer',
  },
];

// The FOG has no picture: a small drawing of what it measures instead.
const FOG_PIC = `<svg viewBox="0 0 100 100" class="sx-fogsvg" role="img" aria-label="A turn about the vertical axis">
  <ellipse cx="50" cy="62" rx="30" ry="10" fill="none" stroke="var(--rule)" stroke-width="1.2"/>
  <line x1="50" y1="80" x2="50" y2="20" stroke="var(--state)" stroke-width="2.4"/>
  <path d="M50,12 L45.5,22 L54.5,22 Z" fill="var(--state)"/>
  <path d="M24,66 A30,10 0 0 0 76,66" fill="none" stroke="var(--accent)" stroke-width="2.6"/>
  <path d="M78,63 L70,70 L80,71 Z" fill="var(--accent)"/>
  </svg><span class="sx-fog-z">body z</span><span class="sx-fog-yaw">yaw rate</span>`;

// A small top view of Talos, bow up, with the sensor's spot. CAD frame (+X port, +Z bow), metres, from the CAD's
// bounding boxes (public/data/cad/glb.json): hull tubes X ±0.256, Z −0.233 to 0.143; frame X ±0.403, Z −0.17 to 0.176.
// Sensor spots: talos.yaml poses moved into the CAD frame (DVL at the CAD's DVL centre), the depth sensor on the
// starboard lid, the hydrophone pod and transducer from the CAD's acoustics group.
const MAP_SPOTS = {
  imu: [{ X: -0.183, Z: -0.129 }],
  fog: [{ X: 0, Z: -0.02, axis: true }],
  dvl: [{ X: 0, Z: 0, r: 5.6 }],
  depth: [{ X: -0.14, Z: -0.225 }],
  hydro: [{ X: 0, Z: 0, r: 5.6, ghost: true }, { X: -0.138, Z: -0.189 }, { X: 0.08, Z: -0.15, r: 2.2, hollow: true }],
};
function topMap(id) {
  const x = (X) => 70 - X * 100, y = (Z) => 38 - Z * 100;
  const tube = (x0, x1) => `<rect x="${x(x1)}" y="${y(0.143)}" width="${(x1 - x0) * 100}" height="${(0.143 + 0.233) * 100}" rx="5" class="m-hull"/>`;
  const spots = MAP_SPOTS[id].map((p) => {
    const cx = x(p.X), cy = y(p.Z), r = p.r ?? 3.4;
    if (p.ghost) return `<circle cx="${cx}" cy="${cy}" r="${r}" class="m-ghost"/>`;
    if (p.axis) return `<circle cx="${cx}" cy="${cy}" r="5" class="m-axis"/><circle cx="${cx}" cy="${cy}" r="1.8" class="m-dot"/>`;
    if (p.hollow) return `<circle cx="${cx}" cy="${cy}" r="${r + 1}" class="m-hollow"/>`;
    return `<circle cx="${cx}" cy="${cy}" r="${r + 1.6}" class="m-halo"/><circle cx="${cx}" cy="${cy}" r="${r}" class="m-dot"/>`;
  }).join('');
  return `<svg class="sx-map" viewBox="0 0 140 70" role="img" aria-label="Top view of Talos, bow up, with the sensor's spot in orange">
    <rect x="${x(0.403)}" y="${y(0.176)}" width="80.6" height="${(0.176 + 0.17) * 100}" rx="3" class="m-frame"/>
    ${tube(-0.256, 0)}${tube(0, 0.256)}
    <path d="M70,4 L66,10 L74,10 Z" class="m-bow"/><text x="77" y="11" class="m-t">bow</text>
    <text x="2" y="42" class="m-t">port</text><text x="138" y="42" text-anchor="end" class="m-t">stbd</text>
    ${spots}</svg>`;
}

function picture(s) {
  if (!s.pic) return `<div class="sx-pic sx-pic-fog">${FOG_PIC}</div>`;
  const svg = s.marks.map((m) => {
    if (m.muted) return '';
    // the leader runs from the ring's edge towards the label
    const dx = m.lx - m.x, dy = m.ly - m.y, n = Math.hypot(dx, dy) || 1;
    const c = `<circle cx="${m.x}" cy="${m.y}" r="${m.r}" /><line x1="${m.x + (dx / n) * m.r}" y1="${m.y + (dy / n) * m.r}" x2="${m.lx}" y2="${m.ly}" />`;
    return `<g class="halo">${c}</g>${c}`;
  }).join('');
  const labels = s.marks.map((m) => `<span class="sx-call${m.muted ? ' muted' : ''}" style="left:${m.lx}%;top:${m.ly}%">${m.text}</span>`).join('');
  return `<div class="sx-pic"><img src="${BASE}img/sensors/${s.pic}.webp" width="1000" height="1000" alt="${s.alt}"><svg viewBox="0 0 100 100" aria-hidden="true">${svg}</svg>${labels}</div>`;
}

Promise.all([getJSON('catalog.json')]).then(([cat]) => {
  const card = document.getElementById('sx-card');
  const chips = document.getElementById('sx-chips');
  // 3D positions: talos.yaml for the IMU, DVL and depth sensor; the CAD's H1C hydrophone for the pod (talos.yaml's two
  // acoustics poses are out of date; it has no frame in use, so no axes); the FOG's axis at base_link.
  const bl = [...cat.base_link, 0, 0, 0];
  const poses = { imu: [cat.poses.imu], fog: [bl], dvl: [cat.poses.dvl], depth: [cat.poses.depth], hydro: [cat.hydrophone_cad] };
  const list = [
    ...SENSORS.map((s) => ({ id: s.id, label: s.dotLabel ?? s.label, poses: poses[s.id], anchor: s.anchor, axisOnly: s.id === 'fog', noAxes: s.id === 'hydro' })),
    { id: 'front', label: 'front', muted: true, arrow: true, anchor: 'right', poses: [[cat.base_link[0] + 0.42, cat.base_link[1], cat.base_link[2], 0, 0, 0]] },
  ];
  let scene = null;
  let current = 'imu';
  function pick(id) {
    current = id;
    const s = SENSORS.find((x) => x.id === id);
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === id)));
    card.innerHTML = `${picture(s)}<h3>${s.title}</h3><p>${s.what}</p><div class="sx-where">${topMap(s.id)}<p><b>Where.</b> ${s.where}</p></div>
      <dl class="spec"><dt>Rate</dt><dd>${s.rate}</dd><dt>Topic</dt><dd>${code(s.topic)}</dd></dl>
      <a class="sx-more" href="${s.href}">More on ${s.more} ↓</a>`;
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
  // The 3D model only on screens wide enough to read it; phones get the pictures alone.
  const wide = matchMedia('(min-width: 560px)');
  const make3d = () => {
    if (scene || !wide.matches) return;
    try {
      scene = createSensorScene(document.getElementById('sx-canvas'), { sensors: list, baseLink: cat.base_link, onPick: pick, labelHost: document.getElementById('sx-labels') });
      scene.select(current);
    } catch (e) {
      document.querySelector('.sx-view').classList.add('no-gl');
    }
  };
  wide.addEventListener('change', make3d);
  pick('imu');
  make3d();
});

// ---------------------------------------------------------------- one second of messages
getJSON('timeline.json').then((tl) => {
  const host = document.getElementById('tl-chart');
  const note = document.getElementById('tl-note');
  const ROWS = [
    { k: 'IMU', color: '--state', text: '<b>IMU</b>: 400 messages a second, one every 2.5 ms. Stamped when the driver reads the packet.' },
    { k: 'FOG', color: '--reference', text: '<b>Gyro</b>: about 475 a second. The driver passes a reading on only if 2 ms have gone by since the last one (<code>max_publish_rate</code> 500), so the spacing jitters between 1 and 3.4 ms.' },
    { k: 'Depth', color: '--prediction', text: '<b>Depth</b>: 20 a second, from the camera cage board over CAN, the micro-ROS agent and <code>depth_converter.py</code>.' },
    { k: 'DVL', color: '--s7', h: 66, text: '<b>DVL</b>: 8 a second. Each velocity was measured about 125 ms before it arrived: the hollow dots are the moments of the echoes (the messages\' own stamps), and each thin line runs from an echo to its own arrival. The DVL pings every 125 ms, so each echo happens just as the previous reading arrives.' },
    { k: 'EKF', color: '--s4', text: '<b>EKF</b>: <code>odometry/filtered</code> at 30 Hz. Not a sensor: the filter that fuses the rows above (see <a href="localization.html">Where am I?</a>).' },
    { k: 'MPC', color: '--s5', text: '<b>MPC</b>: the controller\'s own state estimate, once per 50 ms tick.' },
  ];
  const perSecond = Object.fromEntries(ROWS.map((r) => [r.k, tl[r.k].recv.filter((t) => t >= 0 && t < 1).length]));
  let zoom = 1, w0 = 0, hot = null, svg = null;
  const groups = {};
  // The zoomed window starts just before the first DVL echo, so it shows one measurement and its arrival.
  const firstEcho = tl.DVL.stamp.find((t) => t >= 0) ?? 0;
  const inWin = (t) => t >= w0 && t <= w0 + zoom;
  // Highlighting only swaps classes, so a resting mouse can't fight a tap by redrawing the chart.
  const highlight = (k) => {
    hot = k;
    svg?.classList.toggle('has-hot', !!k);
    for (const [key, g] of Object.entries(groups)) g.classList.toggle('hot', key === k);
    const row = ROWS.find((r) => r.k === k);
    if (row) note.innerHTML = row.text + ` <span class="tl-count">${tl[k].recv.filter(inWin).length} in this window.</span>`;
  };
  const draw = () => {
    host.innerHTML = '';
    const W = Math.max(280, host.clientWidth || 600), narrow = W < 520;
    const L = narrow ? 46 : 64, Rm = narrow ? 42 : 56, rowH0 = 34, top = 10;
    const rowY = []; let yy = top;
    ROWS.forEach((r) => { rowY.push(yy); yy += r.h || rowH0; });
    const H = yy + 26;
    svg = el('svg', { class: 'chart tl', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Message arrival times per sensor' }, host);
    const sx = (t) => L + ((t - w0) / zoom) * (W - L - Rm);
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
      const g = el('g', { class: 'tl-row', tabindex: 0 }, svg);
      groups[row.k] = g;
      el('rect', { x: 0, y, width: W, height: rowH, fill: 'transparent' }, g);
      el('text', { x: 4, y: mid + 4, class: 'label' }, g).textContent = row.k;
      el('text', { x: W - 2, y: mid + 4, class: 'label tl-rate', 'text-anchor': 'end' }, g).textContent = `${perSecond[row.k]}/s`;
      const d = tl[row.k], color = css(row.color);
      // DVL: arrival ticks on the upper line, echo dots on a lower line, a thin line from each echo to its own arrival,
      // and an orange bracket measuring the first pair.
      const tickB = row.k === 'DVL' ? y + 24 : y + rowH0 - 7, dotY = y + 39;
      if (row.k === 'DVL') el('text', { x: 4, y: dotY + 4, class: 'label tl-sub' }, g).textContent = 'echo';
      let path = '', bracketDone = false;
      d.recv.forEach((t, i) => {
        if (!inWin(t)) return;
        path += `M${sx(t).toFixed(1)},${y + 7}V${tickB}`;
        if (row.k !== 'DVL') return;
        const s = d.stamp[i], x1 = sx(t);
        if (s < w0) return;
        const x0 = sx(s);
        el('path', { d: `M${(x0 + 4).toFixed(1)},${dotY - 2}L${(x1 - 1).toFixed(1)},${tickB + 1}`, stroke: color, 'stroke-width': 1.2, 'stroke-opacity': 0.55, fill: 'none' }, g);
        el('circle', { cx: x0, cy: dotY, r: 4, fill: 'var(--paper-2)', stroke: color, 'stroke-width': 2 }, g);
        if (!bracketDone) {
          bracketDone = true;
          const by = dotY + 11, acc = css('--accent');
          el('path', { d: `M${x0},${by - 4}V${by}H${x1}V${by - 4}`, stroke: acc, 'stroke-width': 2, fill: 'none' }, g);
          el('line', { x1, x2: x1, y1: tickB + 1, y2: by - 4, stroke: acc, 'stroke-width': 1.2, 'stroke-dasharray': '2 2' }, g);
          const lbl = el('text', { x: (x0 + x1) / 2, y: by + 13, 'text-anchor': 'middle', class: 'label tl-age' }, g);
          lbl.textContent = `${Math.round((t - s) * 1000)} ms old`;
        }
      });
      el('path', { d: path, stroke: color, 'stroke-width': row.k === 'IMU' || row.k === 'FOG' ? (zoom === 1 ? 0.8 : 1.6) : 2.4, fill: 'none' }, g);
      g.addEventListener('pointerdown', () => highlight(row.k));
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && hot !== row.k) highlight(row.k); });
      g.addEventListener('focus', () => { if (hot !== row.k) highlight(row.k); });
    });
    if (hot) highlight(hot);
  };
  // Start on the DVL: its age is the point of the figure.
  hot = 'DVL';
  segment(document.getElementById('tl-zoom'), (z) => { zoom = +z; w0 = zoom === 1 ? 0 : Math.max(0, Math.floor((firstEcho - 0.02) * 100) / 100); draw(); });
  let lastW = 0;
  new ResizeObserver(() => { if (host.clientWidth !== lastW) { lastW = host.clientWidth; draw(); } }).observe(host);
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
      note: `Run 1 began just after hand tilts: the IMU built up <b>${Math.max(...st.driftA.imu).toFixed(2)}°</b> in about 50 s, then levelled off. Run 2: IMU within <b>${Math.max(...st.driftB.imu.map(Math.abs)).toFixed(2)}°</b> (${B.imu_yaw_bias_deg_h.toFixed(1)} °/h on average). FOG within <b>${Math.max(...st.driftA.fog.map(Math.abs), ...st.driftB.fog.map(Math.abs)).toFixed(2)}°</b> in both, after its tare.`,
    }),
    // Two small panels on one y scale, IMU above FOG, so neither trace hides the other.
    noise: () => {
      const lim = Math.ceil(Math.max(...st.noise.imu_yaw.map(Math.abs), ...st.noise.fog_yaw.map(Math.abs)) * 20) / 20;
      const o = { xDomain: [0, 2], yDomain: [-lim, lim], digits: 3, unit: '°/s', legend: false };
      return {
        panels: [
          { opts: { ...o, height: 140, title: 'IMU yaw rate (°/s), 400 Hz' }, series: [{ name: 'IMU', color: blue, values: pts(st.noise.imu_t, st.noise.imu_yaw), width: 1.1 }] },
          { opts: { ...o, height: 160, title: 'FOG yaw rate (°/s), ≈475 Hz', xLabel: 'time (s)' }, series: [{ name: 'FOG', color: orange, values: pts(st.noise.fog_t, st.noise.fog_yaw), width: 1.1 }] },
        ],
        note: `Spread per sample (standard deviation): IMU <b>${(B.imu_rate_std_rad_s[2] * R2D).toFixed(3)} °/s</b>, FOG <b>${(B.fog_rate_std_rad_s * R2D).toFixed(3)} °/s</b>. The FOG is the noisier one sample by sample, yet it drifts far less: fast noise averages out when you add it up, a bias doesn't.`,
      };
    },
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
    host.classList.toggle('noise', k === 'noise'); // the noise panels have no readout strip on a phone: the note gives the numbers
    for (const p of v.panels ?? [v]) {
      chart = new LineChart(host, p.opts);
      chart.set(p.series);
    }
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
  const dvlNote = document.getElementById('dvlp-note');
  const DVLP_NOTES = {
    raw: 'DVL x and y lie almost on top of each other: driving straight forward is equal parts of both, because the DVL is turned 45°.',
    body: 'Turned back by 45°, the same motion is almost all surge; sway stays near zero.',
  };
  segment(document.getElementById('dvlp-pick'), (k) => { showDvl(k); dvlNote.textContent = DVLP_NOTES[k]; });
  showDvl('raw');
  dvlNote.textContent = DVLP_NOTES.raw;

  // Depth: pressure against the integrated DVL heave
  const dp = pool.depth;
  new LineChart(document.getElementById('depth-chart'), { height: 260, xDomain: [0, 260], xLabel: `time (s, from ${dp.t0} s into the run)`, yLabel: 'z (m, 0 = surface)', digits: 2, unit: 'm' }).set([
    { name: 'Pressure sensor', color: blue, values: pts(dp.t, dp.z) },
    { name: 'DVL heave, added up', color: orange, values: pts(dp.dvl_t, dp.dvl_z), dash: true },
  ]);
});

// ---------------------------------------------------------------- DVL beams
{
  const S = Math.sin((25 * Math.PI) / 180), C = Math.cos((25 * Math.PI) / 180);
  const beams = [0, 90, 180, 270].map((az) => { const a = (az * Math.PI) / 180; return [S * Math.cos(a), S * Math.sin(a), -C]; });
  const state = ['ok', 'ok', 'ok', 'ok'];
  const v = [0.3, 0, 0];
  const svgHost = document.getElementById('dvl-svg'), out = document.getElementById('dvl-out');
  const controls = document.getElementById('dvl-controls');
  // Velocity in the DVL's own axes (the diagram's axes), not the robot's: the DVL is turned 45° on Talos.
  slider(controls, 'DVL x', -0.6, 0.6, 0.01, v[0], (x) => `${x.toFixed(2)} m/s`, (x) => { v[0] = x; draw(); });
  slider(controls, 'DVL y', -0.6, 0.6, 0.01, v[1], (x) => `${x.toFixed(2)} m/s`, (x) => { v[1] = x; draw(); });
  slider(controls, 'DVL z', -0.3, 0.3, 0.01, v[2], (x) => `${x.toFixed(2)} m/s`, (x) => { v[2] = x; draw(); });
  // What a tap on a beam does: lose it, or make it read 0.15 m/s too fast.
  let mode = 'lost';
  const row = document.createElement('div');
  row.className = 'dvl-mode';
  row.innerHTML = `<span>Tap a beam to</span><span class="seg" role="group" aria-label="What a tap on a beam does"><button type="button" aria-pressed="true" data-k="lost">Lose it</button><button type="button" aria-pressed="false" data-k="bad">Make it wrong</button></span><button type="button" class="btn">Reset beams</button>`;
  controls.appendChild(row);
  segment(row.querySelector('.seg'), (k) => { mode = k; });
  row.querySelector('.btn').addEventListener('click', () => { state.fill('ok'); draw(); });

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
      const cycle = () => { state[i] = st === mode ? 'ok' : mode; draw(); };
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
    const solved = sol
      ? ['x', 'y', 'z'].map((a, i) => { const off = Math.abs(sol[i] - v[i]) > 1e-3; return `${a} <b class="${off ? 'off' : ''}">${f3(sol[i])}</b>`; }).join(', ') + ' m/s'
      : '<b>nothing</b>';
    const wrongNote = sol && sol.some((x, i) => Math.abs(x - v[i]) > 1e-3) ? ' <span class="dvl-offnote">(orange: not what you set)</span>' : '';
    out.innerHTML = `${verdict}<p class="dvl-solved">Solved: ${solved}${wrongNote}</p>`;
  }
  draw();
}

// ---------------------------------------------------------------- acoustics: the chain from a ping to a decision
{
  const FW_IVC = FW + 'blake/ivc/talos/IVCBoard2/src/';
  const STEPS = [
    {
      k: 'pod', name: 'Hydrophone pod', what: 'Hears the ping',
      out: 'an analog signal',
      more: `An Aquarian Audio H1C hydrophone and a preamplifier in a pod under the frame. The signal goes through analog band-pass filters to the IVC board (${link('https://bpb-us-e1.wpmucdn.com/org.osu.edu/dist/1/19/files/2025/07/Robosub_2025.pdf', '2025 design report')}). The same hydrophone receives IVC messages.`,
    },
    {
      k: 'ivc', name: 'IVC board', what: 'Measures how loud the pinger frequency is',
      out: code('ivc/pinger/selected_freq_amp_stream'), needs: 'viewer',
      more: `Its RP2040 samples the signal, filters it at the chosen pinger frequency (20, 25, 30, 35, 37 or 40 kHz) and streams the loudness. Firmware: ${code('IVCBoard2')} on the ${link(FW_IVC + 'ros.c', code('blake/ivc'))} branch; ${code('master')} has no pinger topics.`,
    },
    {
      k: 'viewer', side: true, name: 'Viewer: Pinger switch', what: 'Turns pinger mode on and picks the frequency',
      more: `The board boots with pinger mode off and streams nothing until ${code('true')} arrives on ${code('ivc/pinger/enable')} (${link(FW_IVC + 'ivc.c#L95-L97', code('ivc.c'))}). No robot node sends it: the viewer's electrical panel does (Pinger, on by default), every second, so a rebooted board recovers (${link('https://github.com/osu-uwrt/nereus/blob/main/content/viewer/talos_uwrt_panels.yaml#L107-L114', code('talos_uwrt_panels.yaml'))}). Its frequency goes through ${link(CORE + 'riptide_hardware/src/pinger_broker.cpp', code('pinger_broker'))}, which re-sends it to the board every second (30 kHz until told otherwise). <b>No viewer, no loudness, and the pinger step fails.</b>`,
    },
    {
      k: 'acoustics', name: 'riptide_acoustics', what: 'Records stop 1 into buffer 0, stop 2 into buffer 1, compares',
      out: code('acoustics/buffer_0_closer'),
      more: `Fills buffer 0 between ${code('acoustics/start_sample')} and ${code('stop_sample')}, then buffer 1, and compares them. From then on it publishes ${code('buffer_0_closer')} (true: buffer 0 was louder) once a second, until the next ${code('start_sample')}; nothing while it is sampling (${link(CORE + 'riptide_acoustics/src/Acoustics.cpp#L120-L193', code('Acoustics.cpp'))}). In ${code('max')} mode, the launch default, it compares the averages if the two peaks are within 1000 of each other; otherwise the old answer stays.`,
    },
    {
      k: 'tree', name: 'Mission tree', what: 'Decides which task to do first',
      out: code('is_table'),
      more: `${code('RandomPingerTree')} listens 10 s at ${code('pre_torpedo_pose')} (buffer 0), then 10 s at ${code('pre_table_pose')}, and stores the answer as ${code('is_table')} (${link('https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/trees/RepairCompMpcTree.xml#L1874-L1908', code('RepairCompMpcTree.xml'))}). If nothing arrives within 3 s, ${code('GetBoolTopic')} writes false (torpedo first) and fails (${link('mission-tree.html#pinger', 'more')}).`,
    },
  ];
  const host = document.getElementById('ac-flow');
  let open = null;
  // One step as a button with its details; the viewer's switch is drawn inside the IVC board's step, as its input.
  const item = (s, n) => {
    const on = open === s.k;
    return `<button type="button" class="ac-head" aria-expanded="${on}" data-k="${s.k}">
        <span class="ac-n">${s.side ? '!' : n}</span>
        <span class="ac-txt"><b>${s.name}</b><span>${s.what}</span></span>
        <span class="ac-chev" aria-hidden="true">${on ? '−' : '+'}</span>
      </button>${on ? `<div class="ac-more">${s.more}</div>` : ''}`;
  };
  const render = () => {
    const main = STEPS.filter((s) => !s.side);
    host.innerHTML = main.map((s, i) => {
      const side = s.needs && STEPS.find((x) => x.k === s.needs);
      return `<li class="ac-step${open === s.k ? ' on' : ''}">${item(s, i + 1)}
        ${side ? `<div class="ac-side${open === side.k ? ' on' : ''}"><span class="ac-needs">needs</span>${item(side)}</div>` : ''}
        ${s.out ? `<div class="ac-out"><span aria-hidden="true">↓</span> ${s.out}</div>` : ''}
      </li>`;
    }).join('');
    host.querySelectorAll('button[data-k]').forEach((b) => b.addEventListener('click', () => { open = open === b.dataset.k ? null : b.dataset.k; render(); }));
  };
  render();

  // The pod, with its parts labelled (positions in % of the picture, found on the render).
  const W = 1507, Hh = 1826, ky = Hh / W;
  const parts = [
    { x: 43, y: 91, r: 7, lx: 80, ly: 91, text: 'H1C hydrophone' },
    { x: 58.5, y: 41, r: 7, lx: 85, ly: 30, text: 'SubConn' },
    { x: 33, y: 63, r: 0, lx: 33, ly: 63, text: 'Pod (preamp inside)' },
    { x: 30, y: 10, r: 0, lx: 26, ly: 9, text: 'Mount' },
  ];
  const svg = parts.filter((m) => m.r).map((m) => {
    const dx = m.lx - m.x, dy = (m.ly - m.y) * ky, d = Math.hypot(dx, dy) || 1;
    const c = `<circle cx="${m.x}" cy="${m.y * ky}" r="${m.r}" /><line x1="${m.x + (dx / d) * m.r}" y1="${m.y * ky + (dy / d) * m.r}" x2="${m.lx}" y2="${m.ly * ky}" />`;
    return `<g class="halo">${c}</g>${c}`;
  }).join('');
  document.getElementById('ac-pod').innerHTML = `<div class="sx-pic ac-pic"><img src="${BASE}media/cad/sub-acoustics-iso.webp" width="${W}" height="${Hh}" loading="lazy" alt="The hydrophone pod: a grey box hanging from an L-shaped aluminium mount, a brass SubConn connector on top and the black cylindrical hydrophone underneath."><svg viewBox="0 0 100 ${100 * ky}" aria-hidden="true">${svg}</svg>${parts.map((m) => `<span class="sx-call${m.r ? '' : ' muted'}" style="left:${m.lx}%;top:${m.ly}%">${m.text}</span>`).join('')}</div>
    <div class="ac-tx"><img src="${BASE}media/cad/sub-transducer-iso.webp" width="1600" height="1263" loading="lazy" alt="The transducer: a cylinder with a square flange and a flat blade at one end."><p><b>The transducer</b>, a separate part to port of the pod. It sends Talos's own IVC messages. Not to scale.</p></div>`;
}

// ---------------------------------------------------------------- troubleshooting
// [sensor, symptom, likely cause, what to check, command to run (optional)]. Each symptom is one collapsed line.
{
  const T = [
    ['imu', 'No <code>vectornav/imu</code>', 'Wrong port (Talos needs <code>imu_port:=/dev/ttyTHS1</code>), or the VN-100 hung.', `It should say 400. Driver log: "Unable to connect to IMU". Viewer electrical panel: Cycle IMU (${link(CORE + 'riptide_hardware/riptide_hardware2/imu_power_cycle.py', 'holds Orin GPIO pin 22 low for 10 s')}).`, 'ros2 topic hz /talos/vectornav/imu'],
    ['imu', 'IMU rate no longer 400 Hz', 'Registers written and not saved, or saved with a different rate.', 'Read the output registers from the viewer\'s electrical panel; save after any change.'],
    ['imu', 'Gaps in <code>vectornav/imu</code>', 'The driver drops a message with NaN, a quaternion component above 1, a rate above 2π rad/s or an acceleration above 20 m/s². A serial hiccup makes the driver reconnect, which reboots the VN-100.', 'Errors in the driver log; <code>ros2 topic hz</code> shows the gaps.'],
    ['imu', 'EKF roll and pitch rates small and late', '<code>angular_velocity_covariance</code> 0.01 in <code>riptide_imu/config/vectornav.yaml</code>.', 'Compare <code>odometry/filtered</code> with the IMU in a bag (<a href="localization.html#lag">The EKF is late</a>).'],
    ['fog', 'Heading creeps while Talos sits still', 'A bad or old tare (taken while moving or tilted). Rarely the gyro itself.', 'With Talos still and level, tare from the viewer (100,000 samples).'],
    ['fog', '<code>temp_within_cal</code> false', 'FOG colder than 37.6 °C (just powered on) or hotter than 51.3 °C.', 'Watch the FOG temperature in the viewer header (warns at 55 °C, errors at 75 °C); let it warm up.'],
    ['fog', 'Yaw rate suspect, <code>gyro/status</code> flags', 'Supply outside 4.75 to 5.25 V, light-source current outside 0.07 to 0.15 A, or diagnostic signal outside 0.95 to 1.05.', 'Read the flags, then check the FOG\'s supply and wiring.', 'ros2 topic echo /talos/gyro/status'],
    ['fog', 'No <code>gyro/twist</code>', 'Port (<code>gyro_port:=/dev/ttyTHS2</code>) or the RS-422 wiring. The driver exits if the port won\'t open.', 'Driver log: "Caught SerialLibraryException". <code>gyro/status</code> shows <code>connected</code> false after 1 s without data.'],
    ['dvl', '<code>dvl/bottom_lock</code> false', 'Too close to the floor, beams on a wall or a prop, bubbles, or out of the water.', 'Viewer DVL readout. Move away from walls; compare the depth with the pool depth. Nereus never loses lock, so test this in the pool.'],
    ['dvl', 'No DVL topics at all', 'DVL unreachable; the driver gives up after 100 s and is restarted.', 'Driver log: "Failed connection attempt to DVL".', 'ping 192.168.1.212'],
    ['dvl', 'Every velocity slightly off', 'Speed of sound on the DVL doesn\'t match the water (set to 1480 m/s; fresh water is ≈1482 m/s at 20 °C, ≈1500 m/s at 27 °C).', 'Compare the DVL web page\'s Measurement Configuration with the water temperature (<code>state/depth/temp</code>).'],
    ['dvl', 'Velocity in the wrong direction', 'TF is missing <code>dvl_link</code>\'s 45° turn. That frame is on <code>/tf</code>, not <code>/tf_static</code> (its joint is <code>revolute</code> in the URDF), so a tool that reads only <code>/tf_static</code> won\'t find it.', 'Ask TF for the turn directly:', 'ros2 run tf2_ros tf2_echo talos/base_link talos/dvl_link'],
    ['depth', 'Depth not zero at the surface', 'Board powered up underwater, or an old surface pressure kept through a watchdog reset.', 'At the surface: Clear depth (<code>CLEAR_DEPTH</code>) in the viewer\'s electrical panel.'],
    ['depth', 'No <code>depth/pose</code>', 'No <code>state/depth/raw</code> (CAN, micro-ROS agent, camera cage board), or <code>depth_converter.py</code> can\'t get <code>odom → base_link</code> yet.', 'It should say 20. Is the EKF running?', 'ros2 topic hz /talos/state/depth/raw'],
    ['acoustics', '<code>buffer_0_closer</code> never changes', 'No loudness stream: pinger mode not on (no viewer running, or its Pinger switch off), or IVC firmware without the pinger. Or the stale <code>max</code>-mode answer.', 'Watch the loudness in the viewer\'s pinger readout, or:', 'ros2 topic hz /talos/ivc/pinger/selected_freq_amp_stream'],
    ['acoustics', '<code>stop_sample</code>: "Cannot compare"', 'A buffer stayed empty: nothing arrived while sampling (pinger mode off, or no stream).', 'As above; check the viewer\'s pinger frequency matches the pinger. Always the case in Nereus, which has no pinger.'],
    ['acoustics', 'Talos goes to the wrong task first', 'The tree reads <code>buffer_0_closer</code> (torpedo louder) as <code>is_table</code>, or a stale <code>max</code>-mode answer.', 'The <code>stop_sample</code> response and the node log give both results; see <a href="robosub.html#tree">RoboSub</a>.'],
  ];
  const pick = document.getElementById('tr-pick'), list = document.getElementById('tr-list');
  const NAMES = [['all', 'All'], ['imu', 'IMU'], ['fog', 'FOG'], ['dvl', 'DVL'], ['depth', 'Depth'], ['acoustics', 'Pinger']];
  pick.innerHTML = NAMES.map(([k, n]) => `<button type="button" data-k="${k}" aria-pressed="${k === 'all'}">${n}</button>`).join('');
  const show = (k) => {
    list.innerHTML = T.filter((r) => k === 'all' || r[0] === k).map(([s, sym, cause, check, cmd]) =>
      `<details class="tr-item"><summary>${k === 'all' ? `<span class="tr-tag">${NAMES.find((x) => x[0] === s)[1]}</span>` : ''}<span class="tr-sym">${sym}</span></summary>
        <div class="tr-row"><span>Likely</span><div>${cause}</div></div>
        <div class="tr-row"><span>Check</span><div>${check}${cmd ? `<pre class="tr-cmd"><code>${cmd}</code></pre>` : ''}</div></div></details>`).join('');
  };
  segment(pick, show);
  show('all');
}
