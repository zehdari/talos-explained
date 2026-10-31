import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/mechanical.css';
import { barChart, el } from '../viz/chart.js';
import { Graph } from '../viz/graph.js';

setup();

const BASE = import.meta.env.BASE_URL;
const CAD = (f) => `${BASE}media/cad/${f}.webp`;
const GH = 'https://github.com/osu-uwrt';
const YAML = `${GH}/riptide_core/blob/followpath-speed/riptide_descriptions/config/talos.yaml`;
const MODEL = `${GH}/riptide_control/blob/mpc/riptide_mpc/config/models/talos.yaml`;
const fmt = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');

fetch(`${BASE}data/mechanical/mechanical.json`).then((r) => r.json()).then(init);

function init(data) {

// ---------------------------------------------------------------- 3D explorer
// Systems of the CAD model. anchor: where the hotspot sits (CAD metres: +X port, +Y up, +Z bow);
// explode: how far the system moves when pulled apart.
const thrusterNodes = data.groups.filter((g) => g.group === 'thrusters').map((g) => g.node);
const SYSTEMS = [
  { id: 'frame', name: 'Frame', nodes: ['frame', 'thruster_guards', 'cables'], anchor: [0.15, -0.205, 0.155], img: 'ctx-frame-iso',
    text: 'Four triangular corner modules, joined by two cross bars under the hull and braced by stainless cables. Everything else mounts to it. This group also holds the thruster guards and the modelled cables.',
    facts: [['Size', '805 × 555 × 346 mm, bare'], ['Metal', '6063 C-channel, 5052 plate, 6061 angle'], ['CAD mass', '7.6 kg with thrusters and foam']], link: ['#frame', 'The frame'] },
  { id: 'thrusters', name: 'Thrusters', nodes: thrusterNodes, anchor: [0.406, 0.244, 0.075], img: 'ctx-thrusters-iso',
    text: 'Eight Blue Robotics T200s, all at one fore-aft position. Each orange arrow shows which way that thruster pushes Talos when its command is positive (from talos.yaml).',
    facts: [['Outer four', 'V: push fore and aft'], ['Inner four', 'H: tilted 45°, push up or down and sideways'], ['Limit', '±24 N each, 73 N total']], link: ['#thrusters', 'Eight thrusters in one plane'] },
  { id: 'hull', name: 'Main hull', nodes: ['hull'], anchor: [0.215, 0.07, 0.14], img: 'ctx-main-housing-iso',
    text: 'Two clear polycarbonate tubes between aluminium rings: flat windows at the bow, removable lids with every connector at the stern.',
    facts: [['Size', '532 × 261 × 403 mm'], ['Seals', 'Static O-rings at the rings and lids'], ['CAD mass', '17.8 kg, with the cages and bottles']], link: ['#hull', 'The main hull'] },
  { id: 'electronics', name: 'Electronics', nodes: ['electronics'], inside: true, anchor: [0.123, 0.03, 0.06], explode: [0, 0, -0.55], img: 'sub-housing-internals-iso',
    text: 'One cage per tube. Starboard: the Jetson AGX Orin, the forward camera and the IMU. Port: the stack of circuit boards behind a 90 mm fan. Both slide out of the stern.',
    facts: [['Starboard', 'Orin, GMSL2 card, ZED X Mini, VN-100'], ['Port', 'Board stack, kill switch sensor, LED boards']], link: ['#inside', 'Inside the hull'] },
  { id: 'batteries', name: 'Battery pods', nodes: ['batteries'], split: 0.24, anchor: [0.274, 0.078, 0.2], explode: [0.24, 0, 0], img: 'ctx-battery-pods-iso',
    text: 'Two milled aluminium pods, one per side, clipped onto rails. Each holds a LiPo pack, its battery-management board and a display behind a window.',
    facts: [['Size', 'about 82 × 150 × 380 mm each'], ['Pack', 'MaxAmps 8000 mAh 5S2P, 18.5 V']], link: ['#batteries', 'Battery pods'] },
  { id: 'foam', name: 'Buoyancy', nodes: ['foam'], anchor: [0.048, 0.2, 0.02], explode: [0, 0.3, 0], img: 'ctx-buoyancy-iso',
    text: 'A foam block in each corner module, a centre block between the tubes, and two bottles on top of the hull. They decide how much Talos floats and where the lift acts.',
    facts: [['Net buoyancy', '+1.63 N (MPC model)'], ['COB', '22.5 mm above the COM']], link: ['#trim', 'Buoyancy and trim'] },
  { id: 'dvl', name: 'DVL', nodes: ['dvl'], anchor: [0, -0.25, 0.0], explode: [0, -0.3, 0], img: 'ctx-dvl-below',
    text: 'A Nortek DVL1000 (300 m model) under the middle of the robot, on two brackets. It measures Talos\'s velocity over the pool floor.',
    facts: [['Mount', 'turned 45° (talos.yaml)'], ['Rate', '8 Hz']], link: ['sensors.html#dvl', 'Navigation sensors: DVL'] },
  { id: 'down_camera', name: 'Down camera', nodes: ['down_camera'], inside: true, anchor: [-0.126, -0.1, 0.0], img: 'sub-down-camera-below',
    text: 'A second ZED X Mini, mounted against the bottom of the starboard tube and looking down through its wall. When the computer cage slides in, a slide-in adapter connects it, so there is no cable to plug in by hand (2025 report).',
    facts: [['Frame', 'dfc'], ['Note', 'the CAD has it rolled 180° from the robot']], link: ['cameras.html', 'The cameras'] },
  { id: 'acoustics', name: 'Acoustics', nodes: ['acoustics'], anchor: [-0.127, -0.29, -0.17], explode: [0, -0.18, -0.12], img: 'ctx-acoustics-below',
    text: 'The hydrophone pod (an H1C hydrophone and its preamp in a small housing) low at the stern on the starboard side, and the transducer that sends acoustic messages on the port side.',
    facts: [], link: ['sensors.html#acoustics', 'Navigation sensors: acoustics'] },
  { id: 'launcher', name: 'Launcher', nodes: ['launcher'], anchor: [0.14, -0.154, 0.245], explode: [0.08, -0.25, 0], img: 'ctx-torpedo-marker-launcher-iso',
    text: 'The V8 torpedo and marker launcher: two torpedoes pointing forward and two markers pointing down, all released by one servo.',
    facts: [], link: ['actuators.html', 'Torpedoes, dropper and claw'] },
  { id: 'claw', name: 'Claw', nodes: ['claw'], anchor: [0, -0.40, 0.32], explode: [0, -0.12, 0.22], img: 'ctx-claw-iso',
    text: 'One servo turns a pinion between two racks to open and close the jaws. It hangs below the bow and is the lowest point of the robot.',
    facts: [['Reach', 'hangs 81 mm below the rest of the robot']], link: ['actuators.html', 'Torpedoes, dropper and claw'] },
  { id: 'magnet_poker', name: 'Magnet poker', nodes: ['magnet_poker'], anchor: [-0.14, -0.192, 0.33], explode: [-0.06, 0, 0.25], img: 'ctx-magnet-poker-iso',
    text: 'A printed rod with a magnet at its tip, held on by zip ties, pointing forward under the starboard side.',
    facts: [], link: ['actuators.html', 'Torpedoes, dropper and claw'] },
  { id: 'kill_switch', name: 'Kill switch', nodes: ['kill_switch'], anchor: [0.123, 0.057, 0.2], explode: [0, 0.05, 0.3], img: 'ctx-kill-switch-iso',
    text: 'The red handle on the port bow window. Pulling it cuts power to the thrusters and nothing else. This group also holds the SubConn cover over the port lid\'s connectors.',
    facts: [['Sensor', 'a Hall-effect switch behind the window']], link: ['electrical.html#kill', 'Power and wiring: the kill switch'] },
];
// Focus point for each system: halfway between the robot's middle and the system's box centre, so the camera eases, not jumps.
const boxOf = (nodes) => {
  const gs = data.groups.filter((g) => nodes.includes(g.node));
  const mn = [0, 1, 2].map((i) => Math.min(...gs.map((g) => g.min[i]))), mx = [0, 1, 2].map((i) => Math.max(...gs.map((g) => g.max[i])));
  return { mn, mx, c: mn.map((v, i) => (v + mx[i]) / 2) };
};
SYSTEMS.forEach((s) => {
  s.colour = data.groups.find((g) => g.node === s.nodes[0])?.colour || '#7d8f99';
  const c = boxOf(s.nodes).c;
  s.focus = [c[0] * 0.5, -0.06 + (c[1] + 0.06) * 0.5, 0.02 + (c[2] - 0.02) * 0.5];
});

const F = data.frames;
const MARKERS = [
  { id: 'com', label: 'COM', pos: F.com, color: '#2a78d6', dx: -46, dy: 10 },
  { id: 'cob', label: 'COB', pos: F.cob, color: '#1baf7a', dx: 8, dy: -12 },
  { id: 'base', label: 'base_link', pos: F.base_link, color: '#0f2633', dx: 4, dy: 16 },
  { id: 'origin', label: 'origin', pos: F.origin, color: '#546d79', dx: 6, dy: -30 },
];
const robotToCad = (d) => [d[1], d[2], d[0]];
const THR_LABELS = data.thrusters.map((t) => ({ node: t.glb_node, name: t.name, dir: robotToCad(t.dir) }));

const chips = document.getElementById('mx-chips');
const card = document.getElementById('mx-card');
const hullSeg = document.getElementById('mx-hull');
const framesSeg = document.getElementById('mx-frames');
const explodeIn = document.getElementById('mx-explode');
let explorer = null, current = null;

const chipEls = SYSTEMS.map((s) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mx-chip';
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<i style="background:${s.colour}"></i>${s.name}`;
  b.addEventListener('click', () => pick(current === s.id ? null : s.id));
  chips.appendChild(b);
  return b;
});

const OVERVIEW = `<h3>Talos, system by system</h3>
  <p>Each colour is one system. Tap a name above, a dot or a part of the model. Make the hull see-through to look at the cages inside.</p>
  <dl class="spec"><dt>Size</dt><dd>925 × 639 × 582 mm without claw and poker</dd><dt>Mass</dt><dd>32.4 kg dry (scale)</dd><dt>Model</dt><dd>233k triangles, from the July 2026 CAD</dd></dl>`;

function renderCard(id) {
  const s = SYSTEMS.find((x) => x.id === id);
  if (!s) { card.innerHTML = OVERVIEW; return; }
  const facts = s.facts.length ? `<dl class="spec">${s.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '';
  card.innerHTML = `<h3>${s.name}</h3><p>${s.text}</p>${facts}
    <img src="${CAD(s.img)}" alt="${s.name} highlighted on the CAD" loading="lazy">
    <div class="mx-more">More: <a href="${s.link[0]}">${s.link[1]}</a></div>`;
}
function setSeg(seg, v) { seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
function pick(id) {
  current = id || null;
  chipEls.forEach((b, i) => b.setAttribute('aria-pressed', String(SYSTEMS[i].id === current)));
  renderCard(current);
  explorer?.select(current);
}
renderCard(null);
hullSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setSeg(hullSeg, b.dataset.v);
  explorer?.setHull(b.dataset.v);
});
framesSeg.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  setSeg(framesSeg, b.dataset.v);
  explorer?.setMarkers(b.dataset.v === 'on');
});
explodeIn.addEventListener('input', () => explorer?.setExplode(+explodeIn.value));

// Build the 3D view only when it comes near the screen (three.js and the 2.7 MB model are the heaviest things here).
const view = document.getElementById('mx-view');
new IntersectionObserver((entries, obs) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  obs.disconnect();
  import('../viz/mechanical-explorer.js').then(({ createExplorer }) => {
    const loading = document.getElementById('mx-loading');
    explorer = createExplorer(document.getElementById('mx-canvas'), {
      groups: SYSTEMS, markers: MARKERS, thrusterLabels: THR_LABELS, labelHost: document.getElementById('mx-labels'),
      onPick: pick,
      onHullAuto: (v) => setSeg(hullSeg, v),
      onLoad: (err) => { loading.hidden = !err; if (err) loading.textContent = 'The 3D model did not load.'; },
    });
    if (!explorer) loading.hidden = true;
    else {
      explorer.setHull(hullSeg.querySelector('[aria-pressed="true"]').dataset.v);
      explorer.setExplode(+explodeIn.value);
      explorer.setMarkers(framesSeg.querySelector('[aria-pressed="true"]').dataset.v === 'on');
      explorer.select(current);
    }
  });
}, { rootMargin: '400px' }).observe(view);

// ---------------------------------------------------------------- bar charts (CAD masses)
function responsiveBars(host, rowsFn, opts) {
  let lastW = 0;
  const draw = () => {
    const w = host.clientWidth;
    if (!w || Math.abs(w - lastW) < 2) return;
    lastW = w;
    const narrow = w < 520;
    barChart(host, rowsFn(), { ...opts, width: narrow ? Math.max(w, 330) : 640, labelW: narrow ? opts.labelW * 0.85 : opts.labelW, valueW: narrow ? 52 : 64, rowH: narrow ? 24 : 26 });
  };
  new ResizeObserver(draw).observe(host);
  draw();
  return () => { lastW = 0; draw(); };
}
const SUB_NAME = {
  main_housing: ['Main hull assembly', '#2a78d6'], frame_thruster_modules: ['Corner modules', '#7d8f99'], battery_pods: ['Battery pods', '#eda100'],
  dvl: ['DVL', '#1baf7a'], torpedo_marker_launcher: ['Launcher', '#6250d6'], claw: ['Claw', '#6250d6'], duplicate_foam: ['Duplicate foam', '#e87ba4'],
  cables: ['Modelled cables', '#3f5b67'], frame_crossbars_rails: ['Bars, rails, cables', '#7d8f99'], kill_switch_covers: ['Kill switch, cover', '#e34948'],
  acoustics: ['Acoustics', '#1baf7a'], magnet_poker: ['Magnet poker', '#6250d6'], down_camera: ['Down camera', '#1baf7a'],
};
const massRows = () => [...data.cad_mass.subsystems].sort((a, b) => b.kg - a.kg).map((s) => {
  const [label, color] = SUB_NAME[s.id] || [s.id, '#7d8f99'];
  return { label, segments: [{ value: s.kg, color, name: label }] };
});
const MAT_NAME = (n) => (n.startsWith('(none') ? 'No material set' : n.replace('1.4310 (X10CrNi18-8)', 'Stainless 18-8').replace(' (SS)', '').replace('Stainless Steel (ferritic)', 'Stainless (ferritic)').replace('PC High Viscosity', 'Polycarbonate').replace('Acrylic (Medium-high impact)', 'Acrylic').replace('PBT General Purpose', 'PBT'));
const matRows = () => [...data.materials].sort((a, b) => b.kg - a.kg).filter((m) => m.kg >= 0.01).map((m) => {
  const label = MAT_NAME(m.name);
  const over = label === 'No material set' || label === 'Brass';
  return { label, segments: [{ value: m.kg, color: over ? '#d9480f' : '#3f5b67', name: label }] };
});
{
  const seg = document.getElementById('mx-mass-seg');
  let by = 'group';
  const redraw = responsiveBars(document.getElementById('mx-mass'), () => (by === 'group' ? massRows() : matRows()), { unit: 'kg', digits: 2, labelW: 136 });
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.v === by) return;
    by = b.dataset.v;
    setSeg(seg, by);
    redraw();
  });
}

// ---------------------------------------------------------------- thrusters from the front
{
  const svg = document.getElementById('mx-thr-svg');
  const out = document.getElementById('mx-thr-card');
  const seg = document.getElementById('mx-thr-seg');
  const im = data.images['talos-front'];
  const px = (X) => im.x0 + ((X - im.u[0]) / (im.u[1] - im.u[0])) * (im.x1 - im.x0);
  const py = (Y) => im.y1 - ((Y - im.v[0]) / (im.v[1] - im.v[0])) * (im.y1 - im.y0);
  const MOTIONS = [
    { id: 'names', label: 'Names', title: 'Which thruster is which', text: 'Seen from the front, so port is on the right. Dashed lines are the tilted thrusters\' axes; the corner ones point straight at you. Pick a motion above, or tap a thruster.' },
    { id: 'surge', label: 'Forward', title: 'Surge: forward', text: 'Only the four corner thrusters. The lower two push a little harder: the centre of mass sits nearer them, and equal pushes would pitch the nose down.' },
    { id: 'sway', label: 'Sideways', title: 'Sway: toward port', text: 'Almost only the four tilted thrusters. All push toward port; their up and down halves cancel in diagonal pairs. The corners add 2 % to cancel a small yaw, as the tilted four sit 1 cm ahead of the centre of mass.' },
    { id: 'heave', label: 'Up', title: 'Heave: up', text: 'Almost only the four tilted thrusters. All push up; their sideways halves cancel, upper pair against lower pair. The corners add 3 % to cancel a small pitch, as the tilted four sit 1 cm ahead of the centre of mass.' },
    { id: 'roll', label: 'Roll', title: 'Roll: port side up', text: 'The tilted thrusters again: up on the port side, down on the starboard side, and sideways in opposite directions top and bottom. Every push turns Talos the same way.' },
    { id: 'pitch', label: 'Pitch', title: 'Pitch: nose down', text: 'Only the corners: the upper pair pushes forward and the lower pair back.' },
    { id: 'yaw', label: 'Yaw', title: 'Yaw: turn to port', text: 'Only the corners: the starboard pair pushes forward and the port pair back.' },
  ];
  let mode = 'names', picked = null;
  MOTIONS.forEach((m) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.label;
    b.dataset.v = m.id;
    b.setAttribute('aria-pressed', String(m.id === mode));
    b.addEventListener('click', () => { mode = m.id; picked = null; draw(); });
    seg.appendChild(b);
  });
  const thr = data.thrusters.map((t) => ({ ...t, x: px(t.cad_origin_mm[0] / 1000), y: py(t.cad_origin_mm[1] / 1000) }));
  const words = (d) => {
    const w = [];
    if (d[0] > 0.5) w.push('forward'); else if (d[0] < -0.5) w.push('backward');
    if (d[2] > 0.3) w.push('up'); else if (d[2] < -0.3) w.push('down');
    if (d[1] > 0.3) w.push('toward port'); else if (d[1] < -0.3) w.push('toward starboard');
    return w.join(' and ');
  };
  const LETTERS = { V: 'vector (fore and aft)', H: 'heave (tilted 45°)', U: 'upper', L: 'lower', P: 'port', S: 'starboard' };
  const marker = (id, color) => {
    const m = el('marker', { id, viewBox: '0 0 10 10', refX: 5, refY: 5, markerWidth: 3.4, markerHeight: 3.4, orient: 'auto-start-reverse' });
    el('path', { d: 'M0,0 L10,5 L0,10 z', fill: color }, m);
    return m;
  };
  function draw() {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === mode)));
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    defs.appendChild(marker('mx-ah', '#d9480f'));
    defs.appendChild(marker('mx-ah-rev', '#2a78d6'));
    const f = mode === 'names' ? null : data.motions[mode];
    // centre of mass
    const cx = px(F.com[0]), cy = py(F.com[1]);
    el('path', { class: 'com', d: `M${cx - 22},${cy}H${cx + 22}M${cx},${cy - 22}V${cy + 22}` }, svg);
    el('text', { class: 'com-label', x: cx + 26, y: cy - 14, 'font-size': 30, fill: '#0f2633', 'paint-order': 'stroke', stroke: '#fff', 'stroke-width': 8 }, svg).textContent = 'COM';
    thr.forEach((t, j) => {
      const g = el('g', { class: 'thr' + (picked === j ? ' on' : ''), tabindex: 0, role: 'button', 'aria-label': t.name }, svg);
      const d = t.dir; // robot axes: x fwd, y port, z up
      const inPlane = Math.hypot(d[1], d[2]);
      if (!f && inPlane > 0.5) {
        const ux = d[1] / inPlane, uy = -d[2] / inPlane;
        el('line', { class: 'axis', x1: t.x - ux * 120, y1: t.y - uy * 120, x2: t.x + ux * 120, y2: t.y + uy * 120 }, g);
      }
      el('circle', { class: 'hit', cx: t.x, cy: t.y, r: 80 }, g);
      el('circle', { class: 'ring', cx: t.x, cy: t.y, r: 44 }, g);
      if (!f && inPlane < 0.5) el('circle', { cx: t.x, cy: t.y, r: 9, fill: '#0f2633' }, g);
      if (f) {
        const k = f[j];
        const rev = k < 0;
        const cls = 'push' + (rev ? ' rev' : '');
        const fx = k * d[0];
        if (Math.abs(fx) > 0.05) {
          const r = 10 + 26 * Math.abs(fx);
          if (fx > 0) el('circle', { class: cls, cx: t.x, cy: t.y, r: r * 0.45 }, g);
          else {
            const a = r * 0.75;
            el('path', { class: cls, d: `M${t.x - a},${t.y - a}L${t.x + a},${t.y + a}M${t.x + a},${t.y - a}L${t.x - a},${t.y + a}`, 'stroke-width': 9, fill: 'none' }, g);
          }
          el('circle', { cx: t.x, cy: t.y, r, fill: 'none', 'stroke-width': 6, class: cls, style: 'fill:none' }, g);
        }
        const sx = k * d[1], sy = -k * d[2], len = Math.hypot(sx, sy);
        if (len > 0.05) {
          const L = 70 + 150 * len;
          const ux = sx / len, uy = sy / len;
          el('line', { class: cls, x1: t.x + ux * 46, y1: t.y + uy * 46, x2: t.x + ux * (46 + L), y2: t.y + uy * (46 + L), 'stroke-width': 13, 'stroke-linecap': 'round', 'marker-end': `url(#mx-ah${rev ? '-rev' : ''})` }, g);
        }
      }
      const below = t.name[1] === 'L';
      const tx = el('text', { x: t.x, y: t.y + (below ? 92 : -62) }, g);
      tx.textContent = t.name;
      const choose = () => { picked = picked === j ? null : j; draw(); };
      g.addEventListener('click', choose);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });
    // the card
    const m = MOTIONS.find((x) => x.id === mode);
    let html = `<h3>${m.title}</h3><p>${m.text}</p>`;
    if (f) {
      html += `<div class="bars">${thr.map((t, j) => {
        const v = f[j], w = Math.abs(v) * 50;
        return `<span class="n">${t.name}</span><span class="b"><span class="${v < 0 ? 'rev' : ''}" style="left:${v < 0 ? 50 - w : 50}%;width:${w}%"></span></span><span class="v">${fmt(v * 100, 0)} %</span>`;
      }).join('')}</div><p style="font-size:.82rem">Commands as a share of the largest one; orange forward, blue reversed.</p>`;
    }
    if (picked !== null) {
      const t = thr[picked];
      const p = t.pose;
      html += `<h3 style="margin-top:.8rem">${t.name}</h3><dl class="spec">
        <dt>Letters</dt><dd>${[...t.name].map((c) => LETTERS[c]).join(', ')}</dd>
        <dt>Positive push</dt><dd>${words(t.dir)}</dd>
        <dt>Position</dt><dd>x ${fmt(p[0], 3)}, y ${fmt(p[1], 3)}, z ${fmt(p[2], 3)} m (<a href="${YAML}#L397-L438">talos.yaml</a>)</dd>
        <dt>Index</dt><dd>${t.index} in the thruster list</dd>
        <dt>CAD part</dt><dd><code>${t.cad_part}</code></dd></dl>`;
    }
    out.innerHTML = html;
  }
  draw();
}

// ---------------------------------------------------------------- outside the hull
{
  const OUT = [
    ['DVL', 'Nortek DVL1000, under the middle on two brackets, turned 45° (the <code>dvl</code> pose in <code>talos.yaml</code>).', 'ctx-dvl-below', [1600, 1594], [['sensors.html#dvl', 'DVL']]],
    ['Down camera', 'A ZED X Mini inside the starboard tube, against its bottom wall, looking down through it.', 'sub-down-camera-below', [1600, 874], [['cameras.html', 'Cameras']]],
    ['Depth sensor', 'In the starboard lid. The CAD shows a Bar30; the firmware drives it as a Bar02.', 'ctx-depth-sensor-zoom', [1600, 1037], [['sensors.html#depth', 'Depth']]],
    ['Hydrophones and transducer', 'Low at the stern: the hydrophone pod to starboard, the transducer that sends acoustic messages to port.', 'ctx-acoustics-below', [1600, 1594], [['sensors.html#acoustics', 'Acoustics'], ['boards.html#led-ivc', 'IVC board']]],
    ['Torpedo and marker launcher', 'Under the hull, port of centre: torpedoes point forward, markers drop down.', 'ctx-torpedo-marker-launcher-below', [1600, 1594], [['actuators.html#launcher', 'The launcher']]],
    ['Claw', 'Hangs below the bow, the lowest point of the robot, on a hinged arm.', 'ctx-claw-iso', [1600, 1759], [['actuators.html#claw', 'The claw']]],
    ['Magnet poker', 'In the July CAD, a rod pointing forward under the starboard side. The files disagree on where it is.', 'ctx-magnet-poker-iso', [1600, 1759], [['actuators.html#claw', 'The magnet poker']]],
    ['Kill switch', 'A red handle on the port bow window.', 'ctx-kill-switch-iso', [1600, 1759], [['electrical.html#kill', 'Kill switch']]],
  ];
  const list = document.getElementById('mx-out-list');
  const img = document.getElementById('mx-out-img');
  const items = OUT.map(([name, where, , , links], i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-pressed', String(i === 0));
    b.innerHTML = `<b>${name}</b><span>${where}</span>`;
    b.addEventListener('click', () => show(i));
    li.appendChild(b);
    const more = document.createElement('div');
    more.className = 'mx-out-more';
    more.innerHTML = 'More: ' + links.map(([h, t]) => `<a href="${h}">${t}</a>`).join(', ');
    li.appendChild(more);
    list.appendChild(li);
    return li;
  });
  function show(i) {
    const [name, where, f, [w, h]] = OUT[i];
    img.src = CAD(f);
    img.width = w; img.height = h;
    img.alt = `${name} highlighted on the CAD of Talos. ${where.replace(/<[^>]+>/g, '')}`;
    items.forEach((li, k) => { li.classList.toggle('on', k === i); li.firstChild.setAttribute('aria-pressed', String(k === i)); });
  }
  show(0);
}

// ---------------------------------------------------------------- trim
{
  const B = data.body.buoyancy_N, Wt = data.body.weight_N, g = data.body.g, cob = data.body.cob_rel, mass = data.body.model_mass_kg;
  const P = data.pinv; // 8x6
  const im = data.images['talos-side-port'];
  // side view: image x grows toward the stern (u = -Z), image y grows downward (v = Y)
  const px = (Z) => im.x0 + ((-Z - im.u[0]) / (im.u[1] - im.u[0])) * (im.x1 - im.x0);
  const py = (Y) => im.y1 - ((Y - im.v[0]) / (im.v[1] - im.v[0])) * (im.y1 - im.y0);
  const toZ = (x) => -(im.u[0] + ((x - im.x0) / (im.x1 - im.x0)) * (im.u[1] - im.u[0]));
  const toY = (y) => im.v[0] + ((im.y1 - y) / (im.y1 - im.y0)) * (im.v[1] - im.v[0]);
  const rot = document.getElementById('mx-trim-rot');
  const svg = document.getElementById('mx-trim-svg');
  const top = document.getElementById('mx-trim-top');
  const out = document.getElementById('mx-trim-out');
  const wIn = document.getElementById('mx-trim-w'), wOut = document.getElementById('mx-trim-wo');
  const modeSeg = document.getElementById('mx-trim-mode');
  const com = F.com; // CAD m
  let item = { Z: 0.22, Y: -0.30 }; // on the claw's arm
  let mode = 'on';

  const comX = px(com[2]), comY = py(com[1]);
  rot.style.transformOrigin = `${(comX / 1600) * 100}% ${(comY / 1618) * 100}%`;
  const mk = (cls, attrs, parent = svg) => el(cls, attrs, parent);
  // static markers
  const dot = (x, y, color, label, dx, dy, anchor = 'start') => {
    mk('circle', { cx: x, cy: y, r: 13, fill: color, stroke: '#fff', 'stroke-width': 4 });
    const t = mk('text', { x: x + dx, y: y + dy, fill: color, 'text-anchor': anchor });
    t.textContent = label;
  };
  dot(comX, comY, '#2a78d6', 'COM', -26, 44, 'end');
  dot(px(F.cob[2]), py(F.cob[1]), '#1baf7a', 'COB', 24, -22);
  mk('path', { d: `M${px(F.base_link[2]) - 16},${py(F.base_link[1])}H${px(F.base_link[2]) + 16}M${px(F.base_link[2])},${py(F.base_link[1]) - 16}V${py(F.base_link[1]) + 16}`, stroke: '#0f2633', 'stroke-width': 5 });
  mk('text', { x: px(F.base_link[2]) + 22, y: py(F.base_link[1]) + 12, fill: '#0f2633' }).textContent = 'base_link';
  mk('text', { x: im.x0 + 6, y: im.y0 + 50, fill: '#546d79' }).textContent = '← bow';
  const itemLine = mk('line', { stroke: '#d9480f', 'stroke-width': 4, 'stroke-dasharray': '10 8' });
  const itemDot = mk('circle', { r: 26, fill: '#d9480f', stroke: '#fff', 'stroke-width': 6 });
  const itemArrow = mk('path', { fill: '#d9480f' });
  // drag handle (only while the picture is level)
  const handle = el('circle', { class: 'drag', r: 120, fill: 'transparent' }, top);

  function physics(wg) {
    const Wa = (wg / 1000) * g; // N, positive sinks
    const p = [item.Z - com[2], item.X ?? 0, item.Y - com[1]]; // robot axes relative to the COM (x fwd, y port, z up)
    const Fz = B - Wt - Wa;
    const tx = cob[1] * B - p[1] * Wa, ty = -cob[0] * B + p[0] * Wa;
    const tau = [0, 0, Fz, tx, ty, 0];
    const f = P.map((row) => -row.reduce((s, v, i) => s + v * tau[i], 0));
    const A = -B * cob[2] + Wa * p[2], C = -B * cob[0] + Wa * p[0];
    let th = Math.PI - Math.atan2(C, A);
    th = Math.atan2(Math.sin(th), Math.cos(th));
    return { Fz, ty, f, th, sum: f.reduce((s, v) => s + Math.abs(v), 0), max: Math.max(...f.map(Math.abs)) };
  }
  const base = physics(0);
  function draw() {
    const wg = +wIn.value;
    wOut.textContent = `${wg > 0 ? '+' : wg < 0 ? '−' : ''}${Math.abs(wg)} g`;
    const x = px(item.Z), y = py(item.Y);
    itemDot.setAttribute('cx', x); itemDot.setAttribute('cy', y);
    itemLine.setAttribute('x1', comX); itemLine.setAttribute('y1', comY); itemLine.setAttribute('x2', x); itemLine.setAttribute('y2', y);
    const s = Math.sign(wg) || 0, L = Math.min(110, 30 + Math.abs(wg) * 0.25);
    itemArrow.setAttribute('d', s ? `M${x - 9},${y + s * 30}V${y + s * (30 + L)}H${x - 20}L${x},${y + s * (52 + L)}L${x + 20},${y + s * (30 + L)}H${x + 9}V${y + s * 30}Z` : '');
    handle.setAttribute('cx', x); handle.setAttribute('cy', y);
    handle.style.pointerEvents = mode === 'on' ? '' : 'none';
    const r = physics(wg);
    const deg = (r.th * 180) / Math.PI;
    rot.style.transform = mode === 'off' ? `rotate(${(-deg).toFixed(2)}deg)` : '';
    const rule = 0.005 * mass * g;
    const pitchWord = (d) => (Math.abs(d) < 0.5 ? 'level' : `${fmt(Math.abs(d), 0)}° nose-${d < 0 ? 'up' : 'down'}`);
    const flips = Math.abs(deg) > 90;
    out.innerHTML = `<dl class="spec">
      <dt>Net buoyancy</dt><dd><b>${r.Fz >= 0 ? '+' : '−'}${fmt(Math.abs(r.Fz), 2)} N</b> ${r.Fz >= rule ? `<span class="ok">over RoboSub's ${fmt(rule, 2)} N</span>` : r.Fz > 0 ? `<span class="bad">floats, under RoboSub's ${fmt(rule, 2)} N</span>` : '<span class="bad">sinks</span>'}</dd>
      <dt>Held level by</dt><dd><b>${fmt(r.sum, 1)} N</b> of thrust in total, largest ${fmt(r.max, 1)} N of 24 (model as is: ${fmt(base.sum, 1)} N)</dd>
      <dt>Pitch torque</dt><dd><b>${fmt(Math.abs(r.ty), 2)} N·m</b> ${Math.abs(r.ty) < 0.005 ? '' : r.ty < 0 ? 'nose-up' : 'nose-down'}</dd>
      <dt>Thrusters off</dt><dd><b>${flips ? 'turns over' : pitchWord(deg)}</b> (model as is: ${pitchWord((base.th * 180) / Math.PI)})</dd>
    </dl>
    <p>${wg === 0 ? 'No part added: this is the model as identified.' : mode === 'off' ? 'Switch back to <em>holding level</em> to move the part.' : 'Drag the orange dot to move the part.'}</p>`;
  }
  wIn.addEventListener('input', draw);
  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.v;
    modeSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  // dragging, in the picture's own coordinates
  const toSvg = (e) => {
    const r = top.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 1600, ((e.clientY - r.top) / r.height) * 1618];
  };
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const [x, y] = toSvg(e);
    const cx = Math.min(Math.max(x, im.x0), im.x1), cy = Math.min(Math.max(y, im.y0), im.y1);
    item = { Z: toZ(cx), Y: toY(cy) };
    draw();
  });
  const stop = () => (dragging = false);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  draw();
}

// ---------------------------------------------------------------- where the geometry lives
{
  const host = document.getElementById('mx-graph');
  const note = document.getElementById('mx-graph-note');
  const hint = 'Tap or hover a box.';
  const a = (href, text) => `<a href="${href}">${text}</a>`;
  const nodes = [
    { id: 'cad', x: 110, y: 170, label: 'SolidWorks CAD', sub: 'Talos 7-11-26', html: '<b>The CAD.</b> The design model this page is drawn from (<em>Talos 7-11-26</em>). The camera positions and the inertia in the configs come from it; the MPC model\'s mass comes from the newer "TalosMostlyGood" CAD (2026-10-24).' },
    { id: 'scale', x: 110, y: 55, label: 'A scale', sub: 'mass', html: '<b>Weighing the robot.</b> The dry mass in <code>talos.yaml</code> (32.444 kg) is a scale weight; so is the 34.084 kg wet weigh-in that the 2026-10-03 fit used.' },
    { id: 'pool', x: 110, y: 290, label: 'pool_identify', sub: 'a session in the pool', html: `<b>Pool identification.</b> Flies a scripted session and fits buoyancy, centre of buoyancy, drag and added mass (${a('control/identify.html', 'System identification')}).` },
    { id: 'yaml', x: 380, y: 100, label: 'talos.yaml', sub: 'riptide_descriptions', bold: true, html: `<b>${a(YAML, 'riptide_descriptions/config/talos.yaml')}.</b> The vehicle config: <code>base_link</code>, mass, COM, inertia, and the pose of every thruster, sensor, camera and tool, all measured from <code>origin</code>.` },
    { id: 'model', x: 380, y: 250, label: 'models/talos.yaml', sub: 'riptide_mpc', bold: true, html: `<b>${a(MODEL, 'riptide_mpc/config/models/talos.yaml')}.</b> The MPC's model of the real robot. Mass 34.307 kg from the newer CAD; inertia from the July CAD; COM from the wet weigh-in; displaced volume, COB, drag and added mass from the pool fit.` },
    { id: 'xacro', x: 640, y: 50, label: 'talos.xacro → URDF', sub: 'robot_state_publisher', html: `<b>The URDF.</b> ${a(`${GH}/riptide_core/blob/followpath-speed/riptide_descriptions/robots/talos.xacro`, 'talos.xacro')} reads <code>talos.yaml</code>; ${a(`${GH}/riptide_core/blob/followpath-speed/riptide_hardware/launch/navigation.launch.py#L44-L70`, 'navigation.launch.py')} runs it and starts <code>robot_state_publisher</code>.` },
    { id: 'tf', x: 820, y: 130, label: 'TF frames', sub: 'talos/base_link, …', html: `<b>TF.</b> <code>talos/base_link</code>, <code>talos/origin</code> and a frame for each sensor and thruster (${a('perception/frames.html', 'how TF works')}).` },
    { id: 'mpc', x: 640, y: 210, label: 'riptide_mpc', sub: 'the controller', html: `<b>The MPC.</b> Thruster and sensor poses from <code>talos.yaml</code>, the body and hydrodynamics from its model file. At start-up it checks its IMU and DVL mounts against TF (${a('control/model.html', 'the model it flies')}).` },
    { id: 'nereus', x: 640, y: 320, label: 'robots/talos/robot.yaml', sub: 'Nereus', html: `<b>${a(`${GH}/nereus/blob/main/content/packs/robots/talos/robot.yaml`, 'Nereus\'s robot pack')}.</b> Its own copy of the frames, body, thrusters and sensors, plus the meshes the simulator draws. Kept in step with the MPC model by hand.` },
    { id: 'sim', x: 840, y: 320, label: 'Nereus', sub: 'simulator + viewer', html: `<b>The simulator.</b> Flies the robot pack's body and draws its meshes (${a('nereus.html', 'Nereus')}).` },
  ];
  const edges = [
    { from: 'cad', to: 'yaml', dash: true, label: 'positions' },
    { from: 'scale', to: 'yaml', dash: true },
    { from: 'cad', to: 'model', dash: true, label: 'mass (newer CAD)' },
    { from: 'pool', to: 'model', label: 'fit' },
    { from: 'yaml', to: 'xacro' },
    { from: 'xacro', to: 'tf' },
    { from: 'yaml', to: 'mpc', label: 'poses' },
    { from: 'model', to: 'mpc', label: 'body' },
    { from: 'tf', to: 'mpc', dash: false, label: 'check', bend: 0 },
    { from: 'model', to: 'nereus', dash: true, label: 'copied' },
    { from: 'nereus', to: 'sim' },
  ];
  const narrow = {
    below: 600, width: 400, height: 610,
    nodes: {
      scale: { x: 100, y: 36 }, pool: { x: 300, y: 36 }, cad: { x: 200, y: 136 },
      yaml: { x: 100, y: 236 }, model: { x: 300, y: 236 }, mpc: { x: 200, y: 346 },
      xacro: { x: 100, y: 456 }, nereus: { x: 300, y: 456 }, tf: { x: 100, y: 566 }, sim: { x: 300, y: 566 },
    },
    edges: {
      'tf>mpc': { via: [240, 480], label: 'check', lx: 214, ly: 470 },
      'cad>yaml': { lx: 160, ly: 182, anchor: 'start' },
      'cad>model': { lx: 252, ly: 202, anchor: 'end' },
    },
  };
  new Graph(host, { width: 940, height: 370, nodes, edges, narrow, info: (n) => { note.innerHTML = n ? n.html : hint; } });
  note.textContent = hint;
}

// ---------------------------------------------------------------- gallery
{
  const VIEWS = [
    ['talos-iso', 'From above, front left', 'The default view: bow and port side.'],
    ['talos-iso-rear', 'From above, rear right', 'The stern: lids, the SubConn cover, battery connectors.'],
    ['talos-iso-below', 'From below, front left', 'Claw, DVL, down camera, launcher and acoustics.'],
    ['talos-front', 'Front', 'Straight from the bow: both windows, the four corner thrusters.'],
    ['talos-back', 'Back', 'Straight from the stern.'],
    ['talos-side-port', 'Port side', 'Bow to the left. The triangular modules face-on.'],
    ['talos-side-starboard', 'Starboard side', 'Bow to the right.'],
    ['talos-top', 'Top', 'From above, bow up.'],
    ['talos-bottom', 'Bottom', 'From below, bow up.'],
    ['talos-hull-hidden-iso', 'Hull hidden', 'The tubes, rings, windows and lids hidden: the two cages inside.'],
    ['talos-hull-hidden-top', 'Hull hidden, top', 'From above, hull hidden.'],
    ['talos-systems-iso', 'Systems', 'Each system in one colour, as in the 3D model.', true],
    ['talos-systems-front', 'Systems, front', 'Each system in one colour, from the bow.', true],
    ['talos-systems-port', 'Systems, port', 'Each system in one colour, from the port side.', true],
    ['talos-systems-top', 'Systems, top', 'Each system in one colour, from above.', true],
    ['talos-systems-below', 'Systems, below', 'Each system in one colour, from below.', true],
  ];
  const SIZES = { 'talos-iso': [1600, 1759], 'talos-iso-rear': [1600, 1637], 'talos-iso-below': [1600, 1594], 'talos-front': [1600, 1265], 'talos-back': [1600, 1265],
    'talos-side-port': [1600, 1618], 'talos-side-starboard': [1600, 1618], 'talos-top': [1600, 1251], 'talos-bottom': [1600, 1251], 'talos-hull-hidden-iso': [1600, 1759],
    'talos-hull-hidden-top': [1600, 2045], 'talos-systems-iso': [1600, 1759], 'talos-systems-front': [1600, 1265], 'talos-systems-port': [1600, 1618], 'talos-systems-top': [1600, 1251], 'talos-systems-below': [1600, 1594] };
  const LEGEND = [['Frame', '#7d8f99'], ['Main hull', '#2a78d6'], ['Buoyancy', '#e87ba4'], ['Thrusters', '#d9480f'], ['Batteries', '#eda100'], ['Sensors outside', '#1baf7a'], ['Tools', '#6250d6'], ['Kill switch, cover', '#e34948']];
  const img = document.getElementById('mx-gal-img');
  const cap = document.getElementById('mx-gal-cap');
  const legend = document.getElementById('mx-legend');
  const thumbs = document.getElementById('mx-thumbs');
  legend.innerHTML = LEGEND.map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join('');
  const btns = VIEWS.map(([f, title, text, sys], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', title);
    b.setAttribute('aria-pressed', String(i === 0));
    b.innerHTML = `<img src="${BASE}img/mechanical/thumbs/${f}.webp" alt="" loading="lazy">`;
    b.addEventListener('click', () => show(i));
    thumbs.appendChild(b);
    return b;
  });
  function show(i) {
    const [f, title, text, sys] = VIEWS[i];
    img.src = CAD(f);
    img.width = SIZES[f][0]; img.height = SIZES[f][1];
    img.alt = `Talos CAD render: ${title.toLowerCase()}. ${text}`;
    cap.innerHTML = `<b>${title}.</b> ${text}`;
    legend.hidden = !sys;
    btns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
  }
  show(0);
}
}
