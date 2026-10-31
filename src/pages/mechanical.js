import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/mechanical.css';
import { barChart, el } from '../viz/chart.js';
import { mountTrim } from '../viz/mechanical-trim.js';

setup();

const BASE = import.meta.env.BASE_URL;
const CAD = (f) => `${BASE}media/cad/${f}.webp`;
// 800 px copies (tools/mechanical/make_images.py) so phones skip the 1600 px renders.
const CAD_SRCSET = (f) => `${BASE}img/mechanical/800/${f}.webp 800w, ${CAD(f)} 1600w`;
const GH = 'https://github.com/osu-uwrt';
const YAML = `${GH}/riptide_core/blob/followpath-speed/riptide_descriptions/config/talos.yaml`;
const MODEL = `${GH}/riptide_control/blob/mpc/riptide_mpc/config/models/talos.yaml`;
const fmt = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');

// Numbered callouts on a CAD render. data-pts = [[label, [target, ...]], ...]; a target is [x %, y %, r, badge x %,
// badge y %]: the part's centre, a ring around it (r in % of the picture's width, or [rx, ry] for an oval; 0 = no
// ring, the badge sits on the part, for big parts) and where its numbered badge goes: beside the part, with a short
// leader line, so the badge never hides what it names. The labels sit in a list under the picture, so nothing
// overlaps on a phone. Tapping a number or a label pairs them up.
const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
  parent.appendChild(e);
  return e;
};
document.querySelectorAll('.mx-callout').forEach((box) => {
  const pts = JSON.parse(box.dataset.pts);
  const img = box.querySelector('img');
  const W = +img.getAttribute('width'), H = +img.getAttribute('height');
  const wrap = document.createElement('div');
  wrap.className = 'mx-callout-pic';
  img.replaceWith(wrap);
  wrap.appendChild(img);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', class: 'mx-callout-svg' }, wrap);
  const ol = document.createElement('ol');
  ol.className = 'mx-callout-list';
  const items = pts.map(([label, targets], i) => {
    const g = svgEl('g', {}, svg);
    const badges = targets.map(([x, y, r, bx = x, by = y]) => {
      const cx = (x * W) / 100, cy = (y * H) / 100, px = (bx * W) / 100, py = (by * H) / 100;
      const [rx, ry] = (Array.isArray(r) ? r : [r, r]).map((v) => (v * W) / 100);
      if (rx) {
        const dx = px - cx, dy = py - cy, k = 1 / Math.hypot(dx / rx, dy / ry);
        if (k < 1) {
          const ln = { x1: cx + dx * k, y1: cy + dy * k, x2: px, y2: py };
          svgEl('line', { ...ln, class: 'halo' }, g);
          svgEl('line', { ...ln, class: 'lead' }, g);
        }
        svgEl('ellipse', { cx, cy, rx, ry, class: 'halo' }, g);
        svgEl('ellipse', { cx, cy, rx, ry, class: 'ring' }, g);
      }
      const m = document.createElement('button');
      m.type = 'button';
      m.className = 'mx-num';
      m.style.left = `${bx}%`;
      m.style.top = `${by}%`;
      m.textContent = i + 1;
      m.setAttribute('aria-label', label.replace(/<[^>]+>/g, ''));
      wrap.appendChild(m);
      return m;
    });
    const li = document.createElement('li');
    li.innerHTML = `<span class="mx-num-key">${i + 1}</span><span>${label}</span>`;
    ol.appendChild(li);
    return { g, badges, li };
  });
  const on = (k) => items.forEach(({ g, badges, li }, i) => {
    g.classList.toggle('on', i === k);
    badges.forEach((b) => b.classList.toggle('on', i === k));
    li.classList.toggle('on', i === k);
  });
  items.forEach(({ badges, li }, i) => {
    [...badges, li].forEach((e) => {
      e.addEventListener('click', () => on(i));
      e.addEventListener('pointerenter', (ev) => ev.pointerType === 'mouse' && on(i));
    });
  });
  const title = box.querySelector('.mx-cage-title');
  if (title) box.insertBefore(title, wrap);
  box.appendChild(ol);
});

fetch(`${BASE}data/mechanical/mechanical.json`).then((r) => r.json()).then(init);

function init(data) {

// ---------------------------------------------------------------- 3D explorer
// Systems of the CAD model, one colour each. view: the direction the camera looks from when the system is picked
// (CAD axes: +X port, +Y up, +Z bow); explode: how far the system moves when pulled apart.
const thrusterNodes = data.groups.filter((g) => g.group === 'thrusters').map((g) => g.node);
const SYSTEMS = [
  { id: 'frame', name: 'Frame', nodes: ['frame', 'thruster_guards'], colour: '#7d8f99', fill: 0.92, view: [1.05, 0.62, 1.2],
    text: 'Four triangular corner modules, joined by two cross bars under the hull and braced by stainless cables. Everything else bolts to it. The thruster guards are in this group too.',
    facts: [['Size', '805 × 555 × 346 mm, bare'], ['Metal', 'aluminium C-channel, plate and angle']], link: ['#frame', 'The frame'] },
  { id: 'thrusters', name: 'Thrusters', nodes: thrusterNodes, colour: '#d9480f', fill: 0.86, view: [0.35, 0.28, 1],
    text: 'Eight Blue Robotics T200s, all in one cross-section. Each arrow shows which way that thruster pushes Talos when its command is positive (from talos.yaml).',
    facts: [['Outer four', 'push fore and aft'], ['Inner four', 'tilted 45°: up or down and sideways'], ['Limit', '±24 N each, 73 N total']], link: ['#thrusters', 'Eight thrusters in one plane'] },
  { id: 'hull', name: 'Main hull', nodes: ['hull'], colour: '#2a78d6', view: [0.9, 0.75, 1],
    text: 'Two clear polycarbonate tubes between aluminium rings: flat windows at the bow, a removable lid on each tube at the stern.',
    facts: [['Size', '513 × 255 × 376 mm, without connectors']], link: ['#hull', 'The main hull'] },
  { id: 'electronics', name: 'Cages', nodes: ['electronics'], colour: '#008300', inside: true, view: [0.55, 1, 0.75], explode: [0, 0, -0.5],
    text: 'One cage per tube, each sliding out of the stern. Starboard: the camera cage. Port: the board stack.',
    facts: [['Starboard', 'Jetson AGX Orin, forward ZED X Mini, VN-100 IMU'], ['Port', 'circuit boards, 90 mm fan, kill switch sensor']], link: ['#inside', 'Inside the hull'] },
  { id: 'batteries', name: 'Batteries', nodes: ['batteries'], colour: '#eda100', split: 0.24, view: [1, 0.55, 0.55], explode: [0.24, 0, 0],
    text: 'Two milled aluminium pods, one per side, clipped onto rails. Each holds a LiPo pack, its battery-management board and a display behind a window.',
    facts: [['Size', 'about 82 × 150 × 380 mm each'], ['Pack', 'MaxAmps 8000 mAh 5S2P, 18.5 V']], link: ['#batteries', 'Battery pods'] },
  { id: 'foam', name: 'Buoyancy', nodes: ['foam'], colour: '#e87ba4', view: [0.8, 0.95, 1], explode: [0, 0.25, 0],
    text: 'A foam block in each of the four corner modules, one between the tubes, and two bottles on top of the hull. With the air in the hull, they set how much Talos floats and where the lift acts.',
    facts: [['Net buoyancy', '+1.6 N (MPC model), just under RoboSub\'s 1.68 N minimum']], link: ['#trim', 'Buoyancy and trim'] },
  { id: 'sensors', name: 'Sensors', nodes: ['dvl', 'down_camera', 'acoustics'], colour: '#1baf7a', fill: 0.8, view: [-0.65, -0.85, 0.75], explode: [0, -0.22, 0],
    labels: [['dvl', 0, 'DVL'], ['down_camera', 0, 'Down camera'], ['acoustics', -1, 'Hydrophone'], ['acoustics', 1, 'Transducer']], splitX: ['acoustics'],
    text: '<b>DVL:</b> a Nortek DVL1000 under the middle, turned 45°; it measures velocity over the pool floor. <b>Down camera:</b> a ZED X Mini inside the starboard tube, looking down through its wall. <b>Hydrophone</b> (starboard, low at the stern): hears the pinger and the other vehicle\'s messages (IVC). <b>Transducer</b> (port): sends IVC messages. The depth sensor is part of the hull here, in the starboard lid (<a href="#hull">the lids</a>).',
    facts: [], link: ['sensors.html', 'Navigation sensors'] },
  { id: 'tools', name: 'Tools', nodes: ['launcher', 'claw', 'magnet_poker'], colour: '#6250d6', view: [0.55, -0.55, 1], explode: [0, -0.15, 0.2],
    labels: [['claw', 0, 'Claw'], ['launcher', 0, 'Launcher'], ['magnet_poker', 0, 'Magnet poker']],
    text: '<b>Claw:</b> hangs below the bow, the lowest point of the robot. <b>Launcher</b> (V8): two torpedoes forward, two markers down, one servo. <b>Magnet poker:</b> a printed rod with a magnet at its tip.',
    facts: [], link: ['actuators.html', 'Torpedoes, dropper and claw'] },
  { id: 'subconns', name: 'SubConns and cables', nodes: ['subconns', 'cables'], colour: '#3d9bb8', fill: 0.9, view: [0.45, 0.4, -1], explode: [0, 0, -0.2],
    text: 'Waterproof SubConn plugs carry every cable into the hull through the two stern lids. The battery pods, the hydrophone pod and the DVL have their own. On the robot a green snap-on cover protects the port lid\'s plugs.',
    facts: [['Port lid', '17 small bulkheads, 2 battery bulkheads'], ['Starboard lid', '4 bulkheads (2 DBH8F, 2 MCBH4F)']], link: ['#sealing', 'Keeping water out'] },
  { id: 'kill_switch', name: 'Kill switch', nodes: ['kill_switch'], colour: '#e34948', view: [0.35, 0.3, 1], explode: [0, 0.05, 0.25], minBox: 0.17, fill: 0.6, hideMarkers: true,
    text: 'The red handle on the port bow window. Pulling it cuts power to the thrusters and nothing else. A Hall-effect sensor behind the window reads it.',
    facts: [], link: ['electrical.html#kill', 'Power and wiring: the kill switch'] },
];

const F = data.frames;
const MARKERS = [
  { id: 'com', label: 'COM', pos: F.com, color: '#2a78d6', side: 'left' },
  { id: 'cob', label: 'COB', pos: F.cob, color: '#13734f', side: 'right' },
];
const robotToCad = (d) => [d[1], d[2], d[0]];
const THR_LABELS = data.thrusters.map((t) => ({ node: t.glb_node, name: t.name, dir: robotToCad(t.dir) }));
const PART_LABELS = SYSTEMS.flatMap((s) => (s.labels || []).map(([node, half, name]) => ({ group: s.id, node, half: half || undefined, name })));

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
  <p>Each colour is one system. Pick one above (or tap a part) and the view turns to it. <em>See-through</em> shows the cages inside the hull.</p>
  <dl class="spec"><dt>Size</dt><dd>925 × 639 × 582 mm, without the claw and poker</dd><dt>Model</dt><dd>the July 2026 CAD, simplified</dd></dl>`;

function renderCard(id) {
  const s = SYSTEMS.find((x) => x.id === id);
  if (!s) { card.innerHTML = OVERVIEW; return; }
  const facts = s.facts.length ? `<dl class="spec">${s.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : '';
  card.innerHTML = `<h3><i style="background:${s.colour}"></i>${s.name}</h3><p>${s.text}</p>${facts}
    <div class="mx-more">More: <a href="${s.link[0]}">${s.link[1]}</a></div>`;
}
function setSeg(seg, v) { seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v))); }
function pick(id) {
  current = id || null;
  chipEls.forEach((b, i) => {
    const on = SYSTEMS[i].id === current;
    b.setAttribute('aria-pressed', String(on));
    if (on && chips.scrollWidth > chips.clientWidth) chips.scrollTo({ left: b.offsetLeft - chips.clientWidth / 2 + b.offsetWidth / 2, behavior: 'smooth' });
  });
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
document.getElementById('mx-reset').addEventListener('click', () => explorer?.reset());
// Mouse: drag in any direction; touch: sideways only (vertical swipes scroll the page).
if (!matchMedia('(pointer: coarse)').matches) document.querySelector('.mx-hint').textContent = 'Drag to turn · click, then scroll to zoom';

// Build the 3D view only when it comes near the screen (three.js and the 2.7 MB model are the heaviest things here).
const view = document.getElementById('mx-view');
new IntersectionObserver((entries, obs) => {
  if (!entries.some((e) => e.isIntersecting)) return;
  obs.disconnect();
  import('../viz/mechanical-explorer.js').then(({ createExplorer }) => {
    const loading = document.getElementById('mx-loading');
    explorer = createExplorer(document.getElementById('mx-canvas'), {
      groups: SYSTEMS, markers: MARKERS, thrusterLabels: THR_LABELS, partLabels: PART_LABELS, labelHost: document.getElementById('mx-labels'),
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
    barChart(host, rowsFn(), { ...opts, width: narrow ? w : 640, labelW: narrow ? opts.labelW * 0.85 : opts.labelW, valueW: narrow ? 52 : 64, rowH: narrow ? 24 : 26 });
  };
  new ResizeObserver(draw).observe(host);
  draw();
  return () => { lastW = 0; draw(); };
}
// Colours follow the 3D explorer's systems.
const SUB_NAME = {
  main_housing: ['Main hull assembly', '#2a78d6'], frame_thruster_modules: ['Corner modules', '#7d8f99'], battery_pods: ['Battery pods', '#eda100'],
  dvl: ['DVL', '#1baf7a'], torpedo_marker_launcher: ['Launcher', '#6250d6'], claw: ['Claw', '#6250d6'],
  cables: ['Cables', '#3d9bb8'], frame_crossbars_rails: ['Bars and rails', '#7d8f99'], kill_switch: ['Kill switch handle', '#e34948'],
  subconn_cover: ['SubConn cover', '#3d9bb8'], acoustics: ['Acoustics', '#1baf7a'], magnet_poker: ['Magnet poker', '#6250d6'], down_camera: ['Down camera', '#1baf7a'],
};
// Parts the CAD counts that aren't on the robot: two duplicate foam blocks, and two hidden parts inside the main hull
// assembly (the old ZED2i camera, 0.237 kg, and a bulkhead mounting plate, 0.283 kg; public/data/cad/assembly.json).
// Taking them out leaves the visible model, 34.9 kg, close to the 34.708 kg SolidWorks gives (talos.yaml).
const HIDDEN = { main_housing: 0.237 + 0.283 };
const NOT_ON_ROBOT = 0.237 + 0.283 + data.cad_mass.subsystems.find((s) => s.id === 'duplicate_foam').kg;
const massRows = () => [
  ...data.cad_mass.subsystems.filter((s) => s.id !== 'duplicate_foam').map((s) => ({ ...s, kg: s.kg - (HIDDEN[s.id] || 0) })).sort((a, b) => b.kg - a.kg).map((s) => {
    const [label, color] = SUB_NAME[s.id] || [s.id, '#7d8f99'];
    return { label, segments: [{ value: s.kg, color, name: label }] };
  }),
  { label: 'Not on the robot', segments: [{ value: NOT_ON_ROBOT, color: '#c9d6d9', name: 'Hidden or duplicate parts' }] },
];
const MAT_NAME = (n) => (n.startsWith('(none') ? 'No material set' : n.startsWith('6061') ? 'Aluminium 6061' : n.replace('1.4310 (X10CrNi18-8)', 'Stainless 18-8').replace(' (SS)', '').replace('Stainless Steel (ferritic)', 'Stainless (ferritic)').replace('PC High Viscosity', 'Polycarbonate').replace('Acrylic (Medium-high impact)', 'Acrylic').replace('PBT General Purpose', 'PBT').replace('6063-O', 'Aluminium 6063').replace('5052-H32', 'Aluminium 5052'));
// The same parts left out by material: the duplicate foam and the plate have no material set, the ZED2i is ABS.
const MAT_HIDDEN = { 'No material set': NOT_ON_ROBOT - 0.237, ABS: 0.237 };
const matRows = () => {
  const kg = new Map(Object.entries(MAT_HIDDEN).map(([k, v]) => [k, -v]));
  data.materials.forEach((m) => kg.set(MAT_NAME(m.name), (kg.get(MAT_NAME(m.name)) || 0) + m.kg));
  return [...kg].sort((a, b) => b[1] - a[1]).filter(([, v]) => v >= 0.01).map(([label, v]) => {
    const over = label === 'No material set' || label === 'Brass';
    return { label, segments: [{ value: v, color: over ? '#d9480f' : '#3f5b67', name: label }] };
  });
};
{
  const seg = document.getElementById('mx-mass-seg');
  const cap = document.getElementById('mx-mass-cap');
  const CAP = {
    group: '<b>Where the CAD\'s mass sits.</b> The visible parts add up to 34.9 kg; half of it is the main hull assembly (tubes, lids, both cages, the bottles). <em>Cables</em> are the thruster, battery and DVL ones, the only ones modelled; <em>bars and rails</em> include the frame\'s tension cables. Grey: 1.4 kg the CAD also counts that isn\'t on the robot (two duplicate foam blocks, a hidden old ZED2i camera and a hidden plate).',
    material: '<b>The same 34.9 kg by material.</b> The orange bars are why the CAD is heavier than the scale: parts with <em>no material set</em> count as water (all the foam, every vendor model), and the brass is the connector models.',
  };
  let by = 'group';
  const redraw = responsiveBars(document.getElementById('mx-mass'), () => (by === 'group' ? massRows() : matRows()), { unit: 'kg', digits: 2, labelW: 150 });
  cap.innerHTML = CAP[by];
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.v === by) return;
    by = b.dataset.v;
    setSeg(seg, by);
    cap.innerHTML = CAP[by];
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
    { id: 'names', label: 'Names', title: 'Which thruster is which', text: 'Seen from the front, so port is on the right. Dashed lines are the tilted thrusters\' axes; the corner ones point straight at you. Pick a motion, or tap a thruster.' },
    { id: 'surge', label: 'Forward', group: 'Move', title: 'Surge: forward', text: 'Only the four corner thrusters. The lower two push a little harder: the centre of mass sits nearer them, and equal pushes would pitch the nose down.' },
    { id: 'sway', label: 'Sideways', group: 'Move', title: 'Sway: toward port', text: 'Almost only the four tilted thrusters. All push toward port; their up and down halves cancel in diagonal pairs. The corners add 2 % to cancel a small yaw, as the tilted four sit 1 cm ahead of the centre of mass.' },
    { id: 'heave', label: 'Up', group: 'Move', title: 'Heave: up', text: 'Almost only the four tilted thrusters. All push up; their sideways halves cancel, upper pair against lower pair. The corners add 3 % to cancel a small pitch.' },
    { id: 'roll', label: 'Roll', group: 'Turn', title: 'Roll: port side up', text: 'The tilted thrusters again: up on the port side, down on the starboard side, and sideways in opposite directions top and bottom. Every push turns Talos the same way.' },
    { id: 'pitch', label: 'Pitch', group: 'Turn', title: 'Pitch: nose down', text: 'Only the corners: the upper pair pushes forward and the lower pair back.' },
    { id: 'yaw', label: 'Yaw', group: 'Turn', title: 'Yaw: turn to port', text: 'Only the corners: the starboard pair pushes forward and the port pair back.' },
  ];
  let mode = 'names', picked = null;
  // Controls: a "Names" button, then two short segmented groups (Move, Turn) that each fit on a phone.
  const ctlButton = (m, parent) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = m.label;
    b.dataset.v = m.id;
    b.setAttribute('aria-pressed', String(m.id === mode));
    b.addEventListener('click', () => { mode = m.id; picked = null; draw(); });
    parent.appendChild(b);
  };
  {
    const names = document.createElement('div');
    names.className = 'seg';
    names.setAttribute('role', 'group');
    names.setAttribute('aria-label', 'Names');
    ctlButton(MOTIONS[0], names);
    seg.appendChild(names);
    for (const grp of ['Move', 'Turn']) {
      const lab = document.createElement('span');
      lab.className = 'mx-thr-grp';
      lab.textContent = grp;
      const g = document.createElement('div');
      g.className = 'seg';
      g.setAttribute('role', 'group');
      g.setAttribute('aria-label', grp);
      MOTIONS.filter((m) => m.group === grp).forEach((m) => ctlButton(m, g));
      const wrap = document.createElement('div');
      wrap.className = 'mx-thr-pair';
      wrap.append(lab, g);
      seg.appendChild(wrap);
    }
  }
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
      const choose = () => { picked = picked === j ? null : j; scrollPick = true; draw(); };
      g.addEventListener('click', choose);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });
    // the card: the tapped thruster first (it's what the reader just touched), then the motion
    const m = MOTIONS.find((x) => x.id === mode);
    let html = '';
    if (picked !== null) {
      const t = thr[picked];
      const p = t.pose;
      html += `<div class="mx-thr-pick" id="mx-thr-pick"><h3>${t.name}</h3><dl class="spec">
        <dt>Letters</dt><dd>${[...t.name].map((c) => LETTERS[c]).join(', ')}</dd>
        <dt>Positive command</dt><dd>pushes ${words(t.dir)}</dd>
        ${f ? `<dt>In this motion</dt><dd>${fmt(f[picked] * 100, 0)} % of the largest command</dd>` : ''}
        <dt>Position</dt><dd>x ${fmt(p[0], 3)}, y ${fmt(p[1], 3)}, z ${fmt(p[2], 3)} m (<a href="${YAML}#L397-L438">talos.yaml</a>)</dd>
        <dt>Index</dt><dd>${t.index} in the thruster list</dd></dl></div>`;
    }
    html += `<h3>${m.title}</h3><p>${m.text}</p>`;
    if (f) {
      html += `<div class="bars">${thr.map((t, j) => {
        const v = f[j], w = Math.abs(v) * 50;
        return `<span class="n${picked === j ? ' on' : ''}">${t.name}</span><span class="b"><span class="${v < 0 ? 'rev' : ''}" style="left:${v < 0 ? 50 - w : 50}%;width:${w}%"></span></span><span class="v">${fmt(v * 100, 0)} %</span>`;
      }).join('')}</div><p class="mx-thr-key">Each command as a share of the largest one. Orange: positive; blue: negative.</p>`;
    }
    out.innerHTML = html;
    if (picked !== null && scrollPick) {
      const r = out.querySelector('#mx-thr-pick').getBoundingClientRect();
      if (r.bottom > innerHeight || r.top < 0) out.querySelector('#mx-thr-pick').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    scrollPick = false;
  }
  let scrollPick = false;
  draw();
}

// ---------------------------------------------------------------- buoyancy and trim: adding a part
mountTrim(document.getElementById('trim-calc'), data);

// ---------------------------------------------------------------- outside the hull
// Desktop: picture on the left, list on the right. Phones: an accordion, with the picture inside the open row
// so a tap always changes something on screen. Pictures are crops of the CAD renders around the part (orange).
{
  const CROP = (f) => `${BASE}img/mechanical/crop/${f}.webp`;
  const OUT = [
    ['DVL', 'Under the middle of the robot on two brackets, turned 45° (the <code>dvl</code> pose in <code>talos.yaml</code>). It measures velocity over the pool floor.', 'ctx-dvl-below', [['sensors.html#dvl', 'DVL']]],
    ['Depth sensor', 'In the starboard lid at the stern, open to the water. The CAD shows a Bar30; the firmware drives it as a Bar02.', 'ctx-depth-sensor-zoom', [['sensors.html#depth', 'Depth']]],
    ['Hydrophone and transducer', 'Low at the stern. The hydrophone pod (starboard) hears both the competition pinger and the other vehicle\'s IVC messages; the transducer (port) sends IVC messages.', 'ctx-acoustics-below', [['sensors.html#acoustics', 'Acoustics'], ['boards.html#led-ivc', 'IVC board']],
      // tags on the crop (x %, y % of the part; x %, y % of the tag): the transducer is small at this scale
      [[65, 38, 'Transducer', 80, 20], [44, 66, 'Hydrophone pod', 70, 86]]],
    ['Torpedo and marker launcher', 'Under the hull, port of centre: two torpedoes point forward, two markers drop down.', 'ctx-torpedo-marker-launcher-below', [['actuators.html#launcher', 'The launcher']]],
    ['Claw', 'Hangs below the bow on a hinged arm; it is the lowest point of the robot.', 'ctx-claw-iso', [['actuators.html#claw', 'The claw']]],
    ['Magnet poker', 'A printed rod with a magnet at its tip. <code>talos.yaml</code> puts it near the centre line at the bow (the <code>poker</code> pose); the July CAD has it 12 cm further to starboard. Check the robot.', 'ctx-magnet-poker-iso', [['actuators.html#claw', 'The magnet poker']]],
    ['Kill switch', 'The red handle on the port bow window. Pull it to cut power to the thrusters.', 'ctx-kill-switch-iso', [['electrical.html#kill', 'Kill switch']]],
  ];
  const host = document.getElementById('mx-out');
  const list = document.getElementById('mx-out-list');
  const pic = document.getElementById('mx-out-pic');
  const img = document.getElementById('mx-out-img');
  const tags = document.createElement('div');
  tags.className = 'mx-out-tags';
  pic.appendChild(tags);
  const narrow = matchMedia('(max-width: 760px)');
  let cur = 0;
  const items = OUT.map(([name, where, , links], i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `<b>${name}</b>`;
    b.addEventListener('click', () => show(i, true));
    const body = document.createElement('div');
    body.className = 'mx-out-body';
    body.innerHTML = `<p>${where}</p><p class="mx-out-more">More: ${links.map(([h, t]) => `<a href="${h}">${t}</a>`).join(', ')}</p>`;
    li.append(b, body);
    list.appendChild(li);
    return li;
  });
  function place() {
    // On phones the picture lives in the open row; on wide screens in its own column.
    if (narrow.matches) items[cur].querySelector('.mx-out-body').prepend(pic);
    else host.prepend(pic);
  }
  function show(i, tapped) {
    const [name, where, f, , tagList = []] = OUT[i];
    cur = i;
    img.src = CROP(f);
    tags.innerHTML = tagList.length ? `<svg viewBox="0 0 100 75" preserveAspectRatio="none" aria-hidden="true">${tagList.map(([x, y, , tx, ty]) => `<line x1="${x}" y1="${y * 0.75}" x2="${tx}" y2="${ty * 0.75}"/><circle cx="${x}" cy="${y * 0.75}" r="0.9"/>`).join('')}</svg>`
      + tagList.map(([, , t, tx, ty]) => `<span style="left:${tx}%;top:${ty}%">${t}</span>`).join('') : '';
    img.alt = `${name} in orange on the CAD of Talos. ${where.replace(/<[^>]+>/g, '')}`;
    items.forEach((li, k) => { li.classList.toggle('on', k === i); li.firstChild.setAttribute('aria-expanded', String(k === i)); });
    place();
    if (tapped && narrow.matches) {
      const r = items[i].getBoundingClientRect();
      if (r.top < 60 || r.bottom > innerHeight) items[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
  narrow.addEventListener('change', place);
  show(0);
}

// ---------------------------------------------------------------- where the geometry lives
// Three columns instead of a node graph: where the numbers come from, the hand-kept files, the code that reads
// them. Tap a card: it opens in place with its links, and the cards it connects to light up.
{
  const host = document.getElementById('mx-flow');
  const a = (href, text) => `<a href="${href}">${text}</a>`;
  const COLS = [
    ['src', 'Where the numbers come from'],
    ['file', 'Files kept by hand'],
    ['use', 'Code that reads them'],
  ];
  const NODES = [
    { id: 'cad', col: 'src', label: 'SolidWorks CAD', sub: 'Talos 7-11-26', html: 'The design model this page is drawn from. The camera and thruster positions and the inertia in the configs came from it; the MPC model\'s mass comes from the newer "TalosMostlyGood" CAD (2026-10-24).' },
    { id: 'scale', col: 'src', label: 'A scale', sub: 'weighing the robot', html: 'The dry mass in <code>talos.yaml</code> (32.444 kg) is a scale weight, and so is the 34.084 kg wet weigh-in after the 2026-10-03 pool test.' },
    { id: 'pool', col: 'src', label: 'Pool identification', sub: 'pool_identify', html: `Flies a scripted session and fits buoyancy, centre of buoyancy, drag and added mass. It writes <code>model_identified.yaml</code> in the session folder; a person copies the result into the model file (${a('control/identify.html', 'System identification')}).` },
    { id: 'yaml', col: 'file', label: 'talos.yaml', sub: 'riptide_descriptions', html: `${a(YAML, 'The vehicle config')}: <code>base_link</code>, mass, COM, inertia, and the pose of every thruster, sensor, camera and tool, all measured from <code>origin</code>.` },
    { id: 'model', col: 'file', label: 'models/talos.yaml', sub: 'riptide_mpc', html: `${a(MODEL, 'The MPC\'s model')} of the real robot: mass, COM and inertia, plus the displaced volume, COB, drag and added mass from the pool fit.` },
    { id: 'nereus', col: 'file', label: 'robot.yaml', sub: 'Nereus robot pack', html: `${a(`${GH}/nereus/blob/main/content/packs/robots/talos/robot.yaml`, 'Nereus\'s own copy')} of the frames (same <code>origin</code> as <code>talos.yaml</code>), the body from the MPC model, the thrusters and sensors, and the meshes it draws. Right now it still has the 2026-10-03 body (34.084 kg).` },
    { id: 'tf', col: 'use', label: 'URDF → TF', sub: 'robot_state_publisher', html: `${a(`${GH}/riptide_core/blob/followpath-speed/riptide_descriptions/robots/talos.xacro`, 'talos.xacro')} reads <code>talos.yaml</code>; ${a(`${GH}/riptide_core/blob/followpath-speed/riptide_hardware/launch/navigation.launch.py#L44-L70`, 'navigation.launch.py')} turns it into a URDF and <code>robot_state_publisher</code> publishes the <code>talos/…</code> frames (${a('perception/frames.html', 'how TF works')}).` },
    { id: 'mpc', col: 'use', label: 'riptide_mpc', sub: 'the controller', html: `Reads thruster and sensor poses from <code>talos.yaml</code> and the body from its model file (${a(`${GH}/riptide_control/blob/mpc/riptide_mpc/launch/mpc_controller.launch.py#L47`, 'mpc_controller.launch.py')}). At start-up it warns if its IMU and DVL mounts differ from TF (${a('control/model.html', 'the model it flies')}).` },
    { id: 'sim', col: 'use', label: 'Nereus', sub: 'simulator and viewer', html: `Flies the robot pack's body and draws its meshes (${a('nereus.html', 'Nereus')}).` },
  ];
  // by: 'hand' = a person copies numbers across; 'code' = a program reads the file.
  const LINKS = [
    ['cad', 'yaml', 'hand', 'positions, inertia'], ['scale', 'yaml', 'hand', 'mass'],
    ['cad', 'model', 'hand', 'mass, inertia'], ['scale', 'model', 'hand', 'COM'], ['pool', 'model', 'hand', 'buoyancy, drag'],
    ['yaml', 'nereus', 'hand', 'frames'], ['model', 'nereus', 'hand', 'body'],
    ['yaml', 'tf', 'code'], ['yaml', 'mpc', 'code', 'poses'], ['model', 'mpc', 'code', 'body'], ['nereus', 'sim', 'code'],
  ];
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  const cards = {};
  host.innerHTML = COLS.map(([c, title], i) => `<div class="mx-col"><h4><span>${i + 1}</span>${title}</h4><div class="mx-col-cards" data-col="${c}"></div></div>`).join('');
  NODES.forEach((n) => {
    const card = document.createElement('div');
    card.className = 'mx-node' + (n.col === 'file' ? ' file' : '');
    card.innerHTML = `<button type="button" aria-expanded="false"><b>${n.label}</b><small>${n.sub}</small></button><div class="mx-node-body"></div>`;
    card.firstChild.addEventListener('click', () => pick(cur === n.id ? null : n.id));
    host.querySelector(`[data-col="${n.col}"]`).appendChild(card);
    cards[n.id] = card;
  });
  const chip = (id, by, what) => `<button type="button" class="mx-rel ${by}" data-go="${id}">${byId[id].label}${what ? `<small>${what}</small>` : ''}</button>`;
  let cur = null;
  function pick(id) {
    cur = id;
    const rel = new Set();
    Object.entries(cards).forEach(([k, c]) => {
      c.classList.remove('on', 'rel', 'dim');
      c.firstChild.setAttribute('aria-expanded', 'false');
      c.lastChild.innerHTML = '';
    });
    host.classList.toggle('picked', !!id);
    if (!id) return;
    const n = byId[id];
    const from = LINKS.filter((l) => l[1] === id), to = LINKS.filter((l) => l[0] === id);
    from.forEach((l) => rel.add(l[0])); to.forEach((l) => rel.add(l[1]));
    const row = (title, list, end) => (list.length ? `<div class="mx-rels"><span>${title}</span>${list.map((l) => chip(l[end], l[2], l[3])).join('')}</div>` : '');
    const hand = (l) => l[2] === 'hand', code = (l) => l[2] === 'code';
    cards[id].lastChild.innerHTML = `<p>${n.html}</p>`
      + row('Filled from, by hand', from.filter(hand), 0) + row('Read from, by code', from.filter(code), 0)
      + row('Copied by hand into', to.filter(hand), 1) + row('Read by', to.filter(code), 1);
    Object.entries(cards).forEach(([k, c]) => c.classList.add(k === id ? 'on' : rel.has(k) ? 'rel' : 'dim'));
    cards[id].firstChild.setAttribute('aria-expanded', 'true');
  }
  host.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (!go) return;
    pick(go.dataset.go);
    const r = cards[go.dataset.go].getBoundingClientRect();
    if (r.top < 60 || r.bottom > innerHeight) cards[go.dataset.go].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  pick('yaml');
}

// ---------------------------------------------------------------- gallery
// Eight plain views, picked by name from a row of chips right under the picture.
{
  const VIEWS = [
    ['talos-iso', 'Angled, above', 'Bow and port side toward you.', [1600, 1759]],
    ['talos-iso-below', 'Angled, below', 'Claw, DVL, launcher and the hydrophone pod.', [1600, 1594]],
    ['talos-front', 'Front', 'Straight from the bow: both windows and the four corner thrusters.', [1600, 1265]],
    ['talos-back', 'Back', 'Straight from the stern: the two lids and their connectors.', [1600, 1265]],
    ['talos-side-port', 'Port', 'Bow to the left; the triangular corner modules face-on.', [1600, 1618]],
    ['talos-side-starboard', 'Starboard', 'Bow to the right.', [1600, 1618]],
    ['talos-top', 'Top', 'Plan view from straight above, bow up.', [1600, 1251]],
    ['talos-bottom', 'Bottom', 'Plan view from straight below, bow up.', [1600, 1251]],
  ];
  const img = document.getElementById('mx-gal-img');
  const cap = document.getElementById('mx-gal-cap');
  const row = document.getElementById('mx-gal-views');
  const btns = VIEWS.map(([, title], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = title;
    b.setAttribute('aria-pressed', String(i === 0));
    b.addEventListener('click', () => show(i, true));
    row.appendChild(b);
    return b;
  });
  function show(i, tapped) {
    const [f, title, text, [w, h]] = VIEWS[i];
    img.srcset = CAD_SRCSET(f);
    img.src = CAD(f);
    img.width = w; img.height = h;
    img.alt = `Talos CAD render, ${title.toLowerCase()}. ${text}`;
    cap.innerHTML = `<b>${title}.</b> ${text}`;
    btns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === i)));
    if (tapped) {
      if (row.scrollWidth > row.clientWidth) row.scrollTo({ left: btns[i].offsetLeft - row.clientWidth / 2 + btns[i].offsetWidth / 2, behavior: 'smooth' });
      const r = img.getBoundingClientRect();
      if (r.top < 0) img.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  show(0);
}
}
