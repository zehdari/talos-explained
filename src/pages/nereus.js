import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/nereus.css';
import { Graph } from '../viz/graph.js';
import { LineChart, barChart, el, niceTicks } from '../viz/chart.js';

setup();

const BASE = import.meta.env.BASE_URL;
const load = (f) => fetch(BASE + 'data/' + f).then((r) => r.json());
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const $ = (id) => document.getElementById(id);
const PALETTE = ['--state', '--reference', '--prediction', '--s4', '--s7', '--s5', '--s6', '--s8'];
const short = (t) => t.replace(/^\/talos\//, '');

// Watches an element's width and calls draw(width) when it changes.
function onWidth(node, draw) {
  let last = 0;
  new ResizeObserver(() => {
    const w = Math.round(node.clientWidth);
    if (w && w !== last) { last = w; draw(w); }
  }).observe(node);
}

// One "selected" button in a group.
function press(group, btn) {
  group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
}

// ------------------------------------------------------------------ videos: jump to a task
function seek(v, t) {
  const go = () => {
    v.currentTime = Math.max(0, Math.min(t, (v.duration || t + 1) - 0.3));
    v.play().catch(() => {});
  };
  if (v.readyState >= 1) go();
  else { v.addEventListener('loadedmetadata', go, { once: true }); v.load(); }
}

function chapters(videoId, boxId, marks) {
  const v = $(videoId), box = $(boxId);
  box.innerHTML = marks.map(([t, label]) => `<button type="button" class="btn" data-t="${t}" aria-pressed="false">${label}</button>`).join('');
  const btns = [...box.querySelectorAll('button')];
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) seek(v, +b.dataset.t);
  });
  const mark = () => {
    let on = -1;
    marks.forEach(([t], i) => { if (v.currentTime >= t - 0.05) on = i; });
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === on && (v.currentTime > 0 || !v.paused))));
  };
  v.addEventListener('timeupdate', mark);
  v.addEventListener('seeked', mark);
}

// Read off the labels burned into the videos (video seconds).
chapters('run-video', 'run-chapters', [[0, 'Kill switch'], [0.7, 'Gate'], [4.8, 'Slalom'], [10.9, 'Pinger'], [16.9, 'Torpedo'], [21.9, 'Hit'], [23.0, 'Table']]);
chapters('cam-video', 'cam-chapters', [[0, 'Gate'], [2.5, 'Slalom'], [5.0, 'Pinger'], [8.8, 'Torpedo'], [12.9, 'Table'], [37.3, 'Bins'], [47.5, 'Home']]);

// ------------------------------------------------------------------ architecture
const ARCH = {
  packs: `<b>Packs.</b> YAML in <a href="https://github.com/osu-uwrt/nereus/tree/main/content/packs"><code>content/packs</code></a>: the robot, the pool, the course, the ROS wiring, and a scenario that picks one of each and places everything. No number about Talos is in the C++.`,
  resolve: `<b>Resolve.</b> <code>python -m nereus.packs resolve</code> checks every pack against its JSON schema, checks them against each other, and writes one <code>resolved.json</code>. <code>sim.launch.py</code> runs it first, so every process reads the same file.`,
  sim: `<b>nereus-sim.</b> Steps the world in 2 ms ticks: thrusters, the 6-DOF body, contacts, sensors, mechanisms, payloads, Bullet props, tasks. Renders both cameras on the GPU. Runs under <code>sim_supervisor.py</code>, which can restart it in another pool.`,
  bridge: `<b>ROS bridge.</b> The ROS side of the same program, node <code>/talos/physics_simulator</code>. <code>bridge.yaml</code> maps 39 topic streams and 10 services, and it publishes <code>/clock</code> and the truth TF. Everything right of it sees ROS topics only.`,
  viewer: `<b>nereus-viewer.</b> The 3D pool, camera cards and operator panels. Its Enable / KILL is software kill slot 1; it starts trees and the scored run. The same program drives the real robot (<a href="viewer.html">The Nereus viewer</a>).`,
  detector: `<b>YOLO detector</b> (<code>yolo_orientation</code>, riptide_perception). Runs on the active camera's images and uses its depth for 3D poses. Publishes <code>detected_objects</code> (<a href="perception/detector.html">The detector</a>).`,
  ekf: `<b>EKF</b> (robot_localization). Fuses IMU, FOG, DVL and depth into <code>odometry/filtered</code> and <code>odom → talos/base_link</code>, exactly as on the robot (<a href="localization.html">State estimation</a>).`,
  mapping: `<b>Mapping</b> (riptide_mapping2). Fuses detections into one pose per prop and publishes them as TF frames for the tree to aim at (<a href="perception/map.html">The course map</a>).`,
  autonomy: `<b>Behaviour tree</b> (<code>doTask</code>). Runs a tree such as RepairCompMpcTree: waits for the kill switch on <code>state/kill</code>, sends targets and paths to the MPC, fires actuators (<a href="mission-tree.html">The competition mission</a>).`,
  mpc: `<b>MPC</b> (riptide_mpc). Reads the sensors itself, takes x, y and heading from the EKF, solves every 50 ms and publishes eight thruster forces. In sim it logs "Hardware output disabled": there are no ESCs, so it publishes <code>thruster_forces</code> only.`,
};

function architecture() {
  const node = (id, label, sub) => ({ id, label, sub, bold: true });
  const nodes = [
    { ...node('packs', 'Packs', 'YAML in content/packs'), x: 120, y: 78 },
    { ...node('resolve', 'Resolve', 'one resolved.json'), x: 120, y: 182 },
    { ...node('sim', 'nereus-sim', 'world in 2 ms ticks'), x: 120, y: 292 },
    { ...node('bridge', 'ROS bridge', 'physics_simulator'), x: 320, y: 292 },
    { ...node('viewer', 'nereus-viewer', 'operator UI'), x: 320, y: 398 },
    { ...node('detector', 'YOLO detector', 'yolo_orientation'), x: 545, y: 78 },
    { ...node('mapping', 'Mapping', 'riptide_mapping2'), x: 800, y: 78 },
    { ...node('ekf', 'EKF', 'robot_localization'), x: 545, y: 192 },
    { ...node('autonomy', 'Behaviour tree', 'doTask'), x: 800, y: 192 },
    { ...node('mpc', 'MPC', 'riptide_mpc'), x: 672, y: 318 },
  ];
  const edges = [
    { from: 'packs', to: 'resolve', label: 'YAML' },
    { from: 'resolve', to: 'sim', label: 'resolved.json' },
    { from: 'sim', to: 'bridge', arrow: false },
    { from: 'bridge', to: 'detector', label: 'images, depth' },
    { from: 'bridge', to: 'ekf', label: 'IMU, FOG, DVL, depth', lx: 420, ly: 222 },
    { from: 'bridge', to: 'mpc', label: 'sensors', lx: 500, ly: 300 },
    { from: 'detector', to: 'mapping', label: 'detections' },
    { from: 'ekf', to: 'mapping', label: 'odometry', lx: 690, ly: 132 },
    { from: 'mapping', to: 'autonomy', label: 'prop frames', lx: 808, ly: 140, anchor: 'start' },
    { from: 'ekf', to: 'mpc', label: 'x, y, heading', lx: 588, ly: 262, anchor: 'end' },
    { from: 'autonomy', to: 'mpc', label: 'targets, paths', lx: 752, ly: 262, anchor: 'start' },
    { from: 'mpc', to: 'bridge', label: 'thruster_forces', via: [480, 348], lx: 560, ly: 354 },
    { from: 'viewer', to: 'bridge', label: 'kill, start run', bend: 22, lx: 302, ly: 352, anchor: 'end' },
    { from: 'bridge', to: 'viewer', label: 'truth, score, scene', bend: 22, lx: 338, ly: 364, anchor: 'start' },
    { from: 'viewer', to: 'autonomy', label: 'run tree', via: [820, 450], dash: true, lx: 760, ly: 395 },
  ];
  const narrow = {
    below: 600, width: 400, height: 760,
    bands: [
      { label: 'NEREUS', points: [[12, 14], [388, 14], [388, 330], [12, 330]] },
      { label: "TALOS'S OWN SOFTWARE, UNCHANGED", points: [[12, 372], [388, 372], [388, 748], [12, 748]] },
    ],
    nodes: {
      packs: { x: 105, y: 62 }, resolve: { x: 105, y: 165 }, sim: { x: 105, y: 280 }, bridge: { x: 290, y: 280 }, viewer: { x: 290, y: 130 },
      ekf: { x: 105, y: 420 }, detector: { x: 290, y: 420 }, mapping: { x: 290, y: 560 }, autonomy: { x: 290, y: 700 }, mpc: { x: 105, y: 700 },
    },
    edges: {
      'packs>resolve': { label: '' },
      'resolve>sim': { label: 'resolved.json', lx: 112, ly: 226, anchor: 'start' },
      'bridge>detector': { label: 'images', lx: 298, ly: 356, anchor: 'start' },
      'bridge>ekf': { label: 'sensors', lx: 170, ly: 350, anchor: 'end' },
      'bridge>mpc': { label: '', bend: -18 },
      'detector>mapping': { label: 'detections', lx: 298, ly: 494, anchor: 'start' },
      'ekf>mapping': { label: 'odometry', lx: 160, ly: 492, anchor: 'start' },
      'mapping>autonomy': { label: 'prop frames', lx: 298, ly: 634, anchor: 'start' },
      'ekf>mpc': { label: 'x, y, heading', lx: 98, ly: 560, anchor: 'end' },
      'autonomy>mpc': { label: 'targets', lx: 198, ly: 718 },
      'mpc>bridge': { label: 'thrust', via: null, bend: -18, lx: 150, ly: 600, anchor: 'start' },
      'viewer>bridge': { label: 'kill', bend: 18, lx: 270, ly: 205, anchor: 'end' },
      'bridge>viewer': { label: 'truth', bend: 18, lx: 310, ly: 205, anchor: 'start' },
      'viewer>autonomy': { label: '', via: [470, 420] },
    },
  };
  const note = $('arch-note');
  new Graph($('arch-graph'), {
    width: 920, height: 450, nodes, edges, narrow,
    bands: [
      { label: 'NEREUS', points: [[22, 22], [412, 22], [412, 436], [22, 436]] },
      { label: "TALOS'S OWN SOFTWARE, UNCHANGED", points: [[448, 22], [906, 22], [906, 436], [448, 436]] },
    ],
    // Keep the last note when nothing is selected, so its links stay clickable.
    info: (n) => { if (n) note.innerHTML = ARCH[n.id]; },
  });
}
architecture();

// ------------------------------------------------------------------ pack explorer
function packExplorer(P) {
  const kinds = $('pack-kinds'), files = $('pack-files'), body = $('pack-body');
  const groups = [...new Set(P.map((p) => p.group))];
  let group = groups[0], list = [], cur = 0;
  kinds.innerHTML = groups.map((g, i) => `<button type="button" data-g="${g}" aria-pressed="${i === 0}">${g}</button>`).join('');
  const fileLabel = (p) => p.label.replace(/ \(.*\)$/, '').replace(/\.yaml$/, '');
  function showFiles() {
    list = P.filter((p) => p.group === group);
    cur = 0;
    files.hidden = list.length < 2;
    files.innerHTML = list.map((p, i) => `<button type="button" class="btn" data-i="${i}" aria-pressed="${i === 0}">${esc(fileLabel(p))}</button>`).join('');
    showBody();
  }
  // The key worth seeing first in each kind of pack.
  const FIRST = { scenario: 'task_placements', robot: 'body', pool: 'parameters', tasks: 'requires', task: 'regions', parts: 'textures', bridge: 'kill', equipment: 'items', labels: 'models', dataset: 'tasks' };
  const yamlish = (v) => String(v).replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
  function showBody() {
    const p = list[cur];
    const first = p.keys.some((k) => k.key === FIRST[p.kind]) ? FIRST[p.kind] : p.keys[0]?.key;
    body.innerHTML = `
      <div class="nx-pack-meta"><a href="${p.url}"><code>${esc(p.path)}</code></a><span>${p.lines} lines · kind <code>${p.kind}</code></span></div>
      ${p.description ? `<p class="nx-pack-desc">${esc(p.description)}</p>` : ''}
      <div class="nx-keys">${p.keys.map((k) => `
        <details class="nx-key"${k.key === first ? ' open' : ''}>
          <summary><code class="nx-k">${esc(k.key)}</code><span class="nx-what">${esc(k.what)}</span><span class="nx-sum">${esc(yamlish(k.summary))}</span></summary>
          <pre><code>${esc(k.yaml)}</code></pre>
          <div class="nx-key-foot">${k.more ? `${k.more} more lines not shown · ` : ''}<a href="${p.url}#L${k.line}${k.end > k.line ? '-L' + k.end : ''}">line${k.end > k.line ? 's ' + k.line + '–' + k.end : ' ' + k.line} on GitHub</a></div>
        </details>`).join('')}</div>`;
  }
  kinds.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(kinds, b);
    group = b.dataset.g;
    showFiles();
  });
  files.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(files, b);
    cur = +b.dataset.i;
    showBody();
  });
  showFiles();
}

// ------------------------------------------------------------------ course map
function courseMap(C) {
  const pick = $('course-pick'), box = $('course-map'), note = $('course-note');
  const S = C.scenarios;
  let sc = S[0], sel = null;
  pick.innerHTML = S.map((s, i) => `<button type="button" data-i="${i}" aria-pressed="${i === 0}">${esc(s.label)}</button>`).join('');
  const X0 = -2.5, X1 = 27, Y0 = -7, Y1 = 20.5; // one window for both pools, in map metres
  const inside = (poly, [x, y]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const deg = (d) => `${d > 0 ? '' : '−'}${Math.abs(d).toFixed(1)}°`;
  const m = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  function poolNote() {
    note.innerHTML = `<b>${esc(sc.label)}</b>: ${sc.length.toFixed(2)} × ${sc.width.toFixed(2)} m, ${sc.depth.toFixed(2)} m deep${sc.sloped ? ' at the deep end, with a sloped floor' : ''}. ${sc.world_placement ? 'The world is placed from the AprilTag board on the deep-end wall. ' : ''}Tap a prop.`;
  }
  function info(item) {
    if (!item) return poolNote();
    if (item.kind === 'board') return (note.innerHTML = `<b>AprilTag board</b> (equipment pack): the map origin. The stack calibrates its map from this tag, so the scenario puts the course relative to it.`);
    if (item.kind === 'start') return (note.innerHTML = `<b>Start</b>: Talos's centre of mass at x ${sc.start[0]}, y ${sc.start[1]}, ${Math.abs(sc.start[2])} m deep, killed and at rest (scenario <code>initial</code>).`);
    const t = item.t;
    const out = !inside(sc.outline, t.xy) ? ' <b>Outside this pool.</b>' : '';
    const fr = t.frames.length ? ` Frames: ${t.frames.map((f) => `<code>${esc(f.id)}</code>`).join(', ')}.` : '';
    note.innerHTML = `<b>${esc(t.task)}</b>: x ${m(t.xy[0])}, y ${m(t.xy[1])} m, ${Math.abs(t.z).toFixed(2)} m deep, yaw ${deg(t.yaw)}.${out}${fr}`;
  }
  function draw(W) {
    box.innerHTML = '';
    const k = Math.min(W / (X1 - X0), 540 / (Y1 - Y0));
    const w = (X1 - X0) * k, h = (Y1 - Y0) * k;
    const sx = (x) => (x - X0) * k, sy = (y) => (Y1 - y) * k;
    const svg = el('svg', { class: 'nx-course-svg', viewBox: `0 0 ${w} ${h}`, width: w, height: h, role: 'img', 'aria-label': `${sc.label} and the course from above` }, box);
    const clip = 'nxclip' + Math.random().toString(36).slice(2, 7);
    el('rect', { x: 0, y: 0, width: w, height: h }, el('clipPath', { id: clip }, el('defs', {}, svg)));
    const g = el('g', { 'clip-path': `url(#${clip})` }, svg);
    el('rect', { x: 0, y: 0, width: w, height: h, class: 'nx-deck' }, g);
    el('path', { class: 'nx-pool', d: 'M' + sc.outline.map(([x, y]) => `${sx(x)},${sy(y)}`).join('L') + 'Z' }, g);
    for (const ln of sc.lanes) el('line', { class: 'nx-lane', x1: sx(ln[0][0]), y1: sy(ln[0][1]), x2: sx(ln[1][0]), y2: sy(ln[1][1]) }, g);
    // metre grid ticks along the edges, every 5 m
    const ax = el('g', { class: 'nx-axis' }, svg);
    for (const x of niceTicks(0, 25, 5)) el('text', { x: sx(x), y: h - 4, 'text-anchor': 'middle' }, ax).textContent = x + (x === 25 ? ' m' : '');
    for (const y of niceTicks(-5, 20, 5)) el('text', { x: 4, y: sy(y) + 4 }, ax).textContent = y;
    const items = [];
    const hit = (gEl, item) => {
      gEl.classList.add('nx-hit');
      gEl.setAttribute('tabindex', 0);
      const on = () => { sel = item.id; mark(); info(item); };
      gEl.addEventListener('pointerdown', on);
      gEl.addEventListener('focus', on);
      gEl.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
      items.push([gEl, item]);
    };
    const r = Math.max(4, Math.min(7, k * 0.3));
    for (const t of sc.tasks) {
      const tg = el('g', {}, svg);
      const cx = sx(t.xy[0]), cy = sy(t.xy[1]);
      if (t.task === 'gate' && t.frames.length === 2) {
        const [a, b] = t.frames;
        el('line', { class: 'nx-gate', x1: sx(a.xy[0]), y1: sy(a.xy[1]), x2: sx(b.xy[0]), y2: sy(b.xy[1]) }, tg);
      }
      if (t.task === 'surface') el('circle', { class: 'nx-octagon', cx, cy, r: Math.max(6, 1.1 * k) }, tg);
      for (const f of t.frames) el('circle', { class: 'nx-frame', cx: sx(f.xy[0]), cy: sy(f.xy[1]), r: 2.2 }, tg);
      const a = (t.yaw * Math.PI) / 180;
      el('line', { class: 'nx-yaw', x1: cx, y1: cy, x2: cx + Math.cos(a) * r * 2.6, y2: cy - Math.sin(a) * r * 2.6 }, tg);
      if (t.task !== 'surface') el('circle', { class: 'nx-task', cx, cy, r }, tg);
      el('circle', { class: 'nx-target', cx, cy, r: Math.max(14, r * 2.2) }, tg); // big, invisible touch target
      const lbl = el('text', { class: 'nx-label', x: cx + (t.task === 'surface' ? 0 : r + 4), y: t.task === 'surface' ? cy - Math.max(6, 1.1 * k) - 5 : cy + 4 + (t.task === 'table' ? 12 : 0), 'text-anchor': t.task === 'surface' ? 'middle' : 'start' }, tg);
      lbl.textContent = t.task === 'surface' ? 'octagon' : t.task;
      hit(tg, { id: t.task, kind: 'task', t });
    }
    for (const e of sc.equipment) {
      const bg = el('g', {}, svg);
      // The board hangs on the wall at the map origin (Talos starts in front of it): a bar along the wall.
      el('rect', { class: 'nx-board', x: sx(e.xy[0]) - 3.5, y: sy(e.xy[1]) - 13, width: 7, height: 26, rx: 1.5 }, bg);
      el('circle', { class: 'nx-target', cx: sx(e.xy[0]), cy: sy(e.xy[1]), r: 12 }, bg);
      hit(bg, { id: 'board', kind: 'board' });
    }
    const st = el('g', {}, svg);
    el('circle', { class: 'nx-start', cx: sx(sc.start[0]), cy: sy(sc.start[1]), r: 4.5 }, st);
    el('circle', { class: 'nx-target', cx: sx(sc.start[0]), cy: sy(sc.start[1]), r: 12 }, st);
    hit(st, { id: 'start', kind: 'start' });
    if (sc.length > Y1 - Y0) {
      const t = el('text', { class: 'nx-axis-note', x: w / 2, y: h - 18, 'text-anchor': 'middle' }, svg);
      t.textContent = `pool continues off the map (${sc.length} m long)`;
    }
    function mark() { items.forEach(([gEl, it]) => gEl.classList.toggle('on', it.id === sel)); }
    mark();
    svg.addEventListener('pointerdown', (e) => { if (!e.target.closest('.nx-hit')) { sel = null; mark(); info(null); } });
  }
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(pick, b);
    sc = S[+b.dataset.i];
    sel = null;
    poolNote();
    draw(box.clientWidth);
  });
  poolNote();
  onWidth(box, draw);
}

// ------------------------------------------------------------------ depth noise (Talos's robot.yaml numbers)
function depthNoise() {
  const D = { base: 0.002, coef: 0.0015, exp: 2, dropout: 0.005, range: 0.1, edge: 0.2, min: 0.15, max: 4 };
  const rs = [];
  for (let r = D.min; r <= D.max + 1e-9; r += 0.05) rs.push(+r.toFixed(2));
  const s = new LineChart($('depth-sigma'), { height: 230, xLabel: 'range (m)', yLabel: 'depth error, 1σ (cm)', digits: 2, xDigits: 2, unit: 'cm', forceLegend: true });
  s.set([{ name: 'error, 1σ', color: css('--state'), values: rs.map((r) => ({ x: r, y: 100 * (D.base + D.coef * r ** D.exp) })) }], { yDomain: [0, 3] });
  const d = new LineChart($('depth-drop'), { height: 230, xLabel: 'range (m)', yLabel: 'pixels with no depth (%)', digits: 1, xDigits: 2, unit: '%' });
  const p = (r, edge) => 100 * Math.min(1, D.dropout + D.range * (r / D.max) ** 2 + (edge ? D.edge : 0));
  d.set([
    { name: 'flat surface', color: css('--state'), values: rs.map((r) => ({ x: r, y: p(r, false) })) },
    { name: 'edge pixel', color: css('--reference'), values: rs.map((r) => ({ x: r, y: p(r, true) })) },
  ], { yDomain: [0, 35] });
}
depthNoise();

// ------------------------------------------------------------------ task events
function events(R) {
  const v = $('cam-video'), list = $('events');
  const STEPS = [[3.0, 'Gate'], [26.3, 'Slalom'], [60.8, 'Random pinger (not simulated)'], [94.3, 'Torpedo, then the table'], [373.9, 'Bins'], [476.1, 'Home through the gate'], [533.8, 'KillController: done']];
  const what = (e) => {
    const id = String(e.id).replace(/_/g, ' ');
    switch (`${e.kind}:${e.result}`) {
      case 'torpedo:released': return `fired from slot ${e.slot}`;
      case 'torpedo:success': return `hit <code>${e.target}</code>`;
      case 'tasks:reset': return 'props reset (Start run)';
      case 'claw:grasped': return `grasped the ${id}`;
      case 'claw:released': return `let go of the ${id}`;
      case 'claw:success': return `${id} landed in the ${e.target} basket`;
      case 'dropper:released': return `marker dropped from slot ${e.slot}`;
      case 'dropper:success': return `marker landed in <code>${e.target}</code>`;
      case 'magnet:activated': return `lit <code>${e.target}</code>`;
      default: return `${e.result} ${e.target || ''}`;
    }
  };
  const tag = { torpedo: 'reference', claw: 'prediction', dropper: 's4', magnet: 's7', tasks: 'muted' };
  const rows = [
    ...STEPS.map(([t, label]) => ({ t, html: `<span class="nx-ev-t">${t.toFixed(1)}</span><span class="nx-ev-step">${label}</span>`, step: true })),
    ...R.events.map(([t, e]) => ({ t, html: `<span class="nx-ev-t">${t.toFixed(1)}</span><span class="nx-ev-kind" style="--c:var(--${tag[e.kind] || 'muted'})">${e.kind}</span><span class="nx-ev-what">${what(e)}</span>` })),
  ].sort((a, b) => a.t - b.t || (b.step ? 1 : -1));
  list.innerHTML = rows.map((r) => `<li${r.step ? ' class="nx-ev-head"' : ''}><button type="button" data-t="${r.t}">${r.html}</button></li>`).join('');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    list.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    // The camera video shows the whole run at exactly 10x simulated time; start a little before the event.
    v.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    seek(v, Math.max(0, +b.dataset.t / 10 - 1));
  });
}

// ------------------------------------------------------------------ bridge streams
// What a new member should know about a few streams and services (from bridge.yaml and the bridge code).
const ALIGN = 'Afterwards the bridge calls <code>/talos/set_pose</code> so the EKF estimate jumps to the truth (never during a run).';
const WHY = {
  thruster_forces: (B) => `Mapped onto the thrusters in the order <code>${B.thrusters.join(' ')}</code>. A message of the wrong length or with a NaN is dropped whole.`,
  software_kill: () => 'Only <code>kill_switch_id</code> 1 (the viewer\'s slot) counts. Unlike the real firmware there is no heartbeat timeout.',
  firmware_kill: () => 'The simulator answers a software kill on this topic, as the firmware would.',
  ekf_odometry: () => 'Read only for <em>Sync sim</em> and for the <code>set_pose</code> alignment.',
  thruster_telemetry_0_3: () => 'A stand-in for the ESC boards: every ESC reports ready, only so <code>controller_overseer</code> doesn\'t time out.',
  thruster_telemetry_4_7: () => 'A stand-in for the ESC boards: every ESC reports ready, only so <code>controller_overseer</code> doesn\'t time out.',
  actuator_status: () => 'Copies the firmware\'s message.',
  actuator_cmd_status: () => 'Copies the firmware\'s reply.',
  ground_truth: () => 'The true pose, beside the EKF\'s estimate. Feed it to the MPC with <code>mpc_odom_topic:=simulator/ground_truth</code> to rule out estimation.',
  set_sim_pose: () => ALIGN,
  sync_sim_to_estimate: () => 'Moves the simulated Talos to where the EKF thinks it is. ' + ALIGN,
  reset_sim_to_start: () => ALIGN,
  reset_scenario: () => ALIGN,
  reset_tasks: () => 'Resets the tasks, the props and the score, reloads the torpedoes and droppers and disarms them. Talos doesn\'t move, so the EKF is left alone.',
};

function bridgeList(B) {
  const filter = $('bridge-filter'), list = $('bridge-list');
  const CATS = [['sensor', 'Sensors'], ['camera', 'Cameras'], ['command', 'Into the sim'], ['state', 'Sim state'], ['services', 'Services'], ['all', 'All']];
  filter.innerHTML = CATS.map(([k, n], i) => `<button type="button" data-k="${k}" aria-pressed="${i === 0}">${n}</button>`).join('');
  const count = document.createElement('span');
  count.className = 'nx-count';
  filter.after(count);
  const shared = {};
  B.streams.forEach((s) => (shared[s.topic] = (shared[s.topic] || 0) + 1));
  const uniq = (a) => [...new Set(a.map(short))];
  const size = (b) => (b == null ? '' : b >= 1e6 ? `${(b / 1e6).toFixed(1)} MB` : b >= 1e3 ? `${(b / 1e3).toFixed(0)} kB` : `${b} B`);
  const rate = (r) => (r ? `${r} Hz` : 'on event');
  const meas = (m) => (m == null ? '–' : m === 0 ? 'none' : `${+m.toFixed(1)} Hz`);
  const row = (s) => {
    const into = s.dir === 'subscribe';
    const fields = Object.entries(s.fields || {});
    const who = into ? uniq(s.pubs) : uniq(s.subs);
    const opts = [];
    if (s.image) opts.push(`${s.image.compression?.toUpperCase() || 'image'}${s.image.quality ? ` quality ${s.image.quality}` : ''}`);
    if (s.point_cloud) opts.push(`every ${s.point_cloud.stride}th pixel`);
    if (s.accept_if) opts.push(`only if ${s.accept_if.map((a) => `${a.field} = ${a.equals}`).join(' and ')}`);
    return `<details class="nx-stream" data-cat="${s.cat}">
      <summary>
        <span class="nx-dir ${into ? 'in' : 'out'}" title="${into ? 'ROS → simulator' : 'simulator → ROS'}">${into ? 'in' : 'out'}</span>
        <code class="nx-topic">${esc(short(s.topic))}</code>
        <span class="nx-rate">${rate(s.rate)}</span>
      </summary>
      <dl class="nx-dl">
        <dt>Type</dt><dd><code>${esc(s.type)}</code></dd>
        <dt>Simulator side</dt><dd><code>${esc(s.native)}</code></dd>
        ${s.frame ? `<dt>Frame</dt><dd><code>${esc(s.frame)}</code></dd>` : ''}
        ${opts.length ? `<dt>Options</dt><dd>${esc(opts.join('; '))}</dd>` : ''}
        ${fields.length ? `<dt>Fields</dt><dd><ul class="nx-fields">${fields.map(([f, src]) => `<li><code>${esc(f)}</code> ← ${esc(String(src).replace(/^from /, ''))}</li>`).join('')}</ul></dd>` : ''}
        ${WHY[s.id] ? `<dt>Good to know</dt><dd>${WHY[s.id](B)}</dd>` : ''}
        ${s.note ? `<dt>Note</dt><dd>${esc(s.note)}</dd>` : ''}
        <dt>${into ? 'Sent by' : 'Listened to by'}</dt><dd>${who.length ? who.map((n) => `<code>${esc(n)}</code>`).join(' ') : '<span class="nx-dim">nobody in that run</span>'}</dd>
        <dt>Measured</dt><dd>${meas(s.measured)}${s.measured1 != null && s.measured1 !== s.measured ? ` (first pass ${meas(s.measured1)})` : ''}${s.bytes ? `, ${size(s.bytes)} a message` : ''}${shared[s.topic] > 1 ? `; ${shared[s.topic]} streams share this topic, so this is their total` : ''}</dd>
      </dl>
      <a class="nx-line" href="${B.url}#L${s.line}">bridge.yaml line ${s.line}</a>
    </details>`;
  };
  const srow = (s) => `<details class="nx-stream" data-cat="services">
      <summary><span class="nx-dir srv" title="ROS service">srv</span><code class="nx-topic">${esc(short(s.service))}</code><span class="nx-rate">service</span></summary>
      <dl class="nx-dl"><dt>Type</dt><dd><code>${esc(s.type)}</code></dd><dt>Does</dt><dd><code>${esc(s.action)}</code>${s.note ? ` (${esc(s.note)})` : ''}</dd>${WHY[s.id] ? `<dt>Good to know</dt><dd>${WHY[s.id](B)}</dd>` : ''}</dl>
      <a class="nx-line" href="${B.url}#L${s.line}">bridge.yaml line ${s.line}</a>
    </details>`;
  list.innerHTML = B.streams.map(row).join('') + B.services.map(srow).join('');
  function apply(k) {
    let n = 0;
    list.querySelectorAll('.nx-stream').forEach((d) => {
      const ok = k === 'all' || d.dataset.cat === k;
      d.hidden = !ok;
      if (ok) n++;
    });
    count.textContent = `${n} ${k === 'services' ? 'services' : k === 'all' ? 'streams and services' : 'streams'}`;
  }
  filter.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(filter, b);
    apply(b.dataset.k);
  });
  apply('sensor');
}

// ------------------------------------------------------------------ sensor schedule (the simulator's own rule)
function schedule() {
  const box = $('sched'), zoom = $('sched-zoom'), note = $('sched-note');
  const TICK = 2; // ms
  const at = (due) => Math.ceil(due / TICK - 1e-9) * TICK; // first tick at or after the due time
  // first: when the first sample is due. Sensors and timed bridge streams: one period after start; cameras: the first tick.
  const ROWS = [
    { id: 'tick', name: 'Physics tick, /clock', short: 'Tick, /clock', rate: 500, first: 'tick', what: 'Every 2 ms tick advances the plant and publishes <code>/clock</code>.' },
    { id: 'fog', name: 'FOG', rate: 500, what: 'Yaw rate on <code>gyro/twist</code>: a sample on every tick.' },
    { id: 'imu', name: 'IMU', rate: 400, what: 'Due every 2.5 ms, which is not a whole number of ticks, so the gaps run 2, 2, 2, 4 ms (400 a second on average).' },
    { id: 'truth', name: 'Truth TF', rate: 100, what: '<code>world → simulator/talos/base_link</code> and <code>simulator/ground_truth</code>, every 5th tick.' },
    { id: 'mpc', name: 'MPC (stack)', rate: 20, stack: true, what: 'Not the simulator: riptide_mpc solves every 50 ms of sim time. Its phase depends on when it started; drawn here at multiples of 50 ms.' },
    { id: 'depth', name: 'Depth', rate: 20, what: '<code>depth/pose</code> every 50 ms, exactly on a tick.' },
    { id: 'cam', name: 'Cameras', rate: 15, first: 'tick', what: 'Each camera is due every 66.7 ms from the first tick: 2, 68, 134, 200, 268 ms… Rendering happens in the background, so images are published a little later.' },
    { id: 'cloud', name: 'Point clouds', rate: 5, from: 'cam', every: 3, what: 'Every 3rd camera capture (5 Hz), built from the noisy depth and the colour image.' },
    { id: 'dvl', name: 'DVL', rate: 8, what: 'Due every 125 ms, which falls between ticks every other time: 126, 250, 376, 500 ms.' },
  ];
  function times(row, T) {
    const out = [];
    if (row.from) {
      const base = times(ROWS.find((r) => r.id === row.from), T);
      return base.filter((_, i) => i % row.every === 0);
    }
    const P = 1000 / row.rate;
    if (row.first === 'tick') {
      if (row.id === 'tick') { for (let t = TICK; t <= T + 1e-9; t += TICK) out.push(t); return out; }
      // cameras: captured on the first tick, then at each following period boundary
      let t = TICK;
      while (t <= T + 1e-9) {
        out.push(t);
        t = at((Math.floor(t / P + 1e-9) + 1) * P);
      }
      return out;
    }
    for (let n = 1; ; n++) {
      const t = row.stack ? n * P : at(n * P);
      if (t > T + 1e-9) break;
      out.push(+t.toFixed(3));
    }
    return out;
  }
  const ZOOMS = [[20, '20 ms'], [200, '200 ms'], [1000, '1 s']];
  let T = 200, sel = null;
  zoom.innerHTML = ZOOMS.map(([t, n]) => `<button type="button" data-t="${t}" aria-pressed="${t === T}">${n}</button>`).join('');
  function show(row) {
    if (!row) { note.innerHTML = 'Tap or hover a row.'; return; }
    const ts = times(row, 1000);
    note.innerHTML = `<b>${row.name}</b>, ${row.rate} Hz. ${row.what}${row.stack ? '' : ` First samples at ${ts.slice(0, 5).map((t) => +t.toFixed(1)).join(', ')} ms; ${ts.length} in the first second.`}`;
  }
  function draw(W) {
    box.innerHTML = '';
    const narrow = W < 520;
    const L = narrow ? 96 : 132, rowH = 26, top = 6, H = top + ROWS.length * rowH + 26;
    const svg = el('svg', { class: 'chart nx-sched', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'When each simulated sensor takes a sample' }, box);
    const x = (t) => L + (t / T) * (W - L - 10);
    const grid = el('g', { class: 'grid' }, svg), ax = el('g', { class: 'axis' }, svg);
    for (const t of niceTicks(0, T, narrow ? 2 : 8)) {
      el('line', { x1: x(t), x2: x(t), y1: top, y2: H - 22 }, grid);
      el('text', { x: x(t), y: H - 6, 'text-anchor': t === T ? 'end' : 'middle' }, ax).textContent = t + (t === T ? ' ms' : '');
    }
    const rowsG = [];
    ROWS.forEach((row, i) => {
      const y = top + i * rowH;
      const g = el('g', { class: 'nx-srow', tabindex: 0 }, svg);
      el('rect', { class: 'nx-srow-bg', x: 0, y, width: W, height: rowH }, g);
      el('text', { class: 'label', x: L - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, g).textContent = narrow && row.short ? row.short : row.name;
      const ts = times(row, T);
      const color = row.stack ? css('--reference') : css('--state');
      const dense = (W - L) / ts.length < 2.5;
      for (const t of ts) {
        if (T <= 20) el('circle', { cx: x(t), cy: y + rowH / 2, r: 3.6, fill: color }, g);
        else el('line', { x1: x(t), x2: x(t), y1: y + 6, y2: y + rowH - 6, stroke: color, 'stroke-width': dense ? 1 : 1.6, opacity: dense ? 0.55 : 1 }, g);
      }
      const on = () => { sel = row.id; rowsG.forEach(([gg, r]) => gg.classList.toggle('on', r.id === sel)); show(row); };
      g.addEventListener('pointerdown', on);
      g.addEventListener('focus', on);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
      rowsG.push([g, row]);
    });
    if (T <= 20) for (let t = TICK; t <= T; t += TICK) el('line', { x1: x(t), x2: x(t), y1: top, y2: H - 22, stroke: css('--rule'), 'stroke-dasharray': '2 3' }, grid);
    rowsG.forEach(([gg, r]) => gg.classList.toggle('on', r.id === sel));
  }
  zoom.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(zoom, b);
    T = +b.dataset.t;
    draw(box.clientWidth);
  });
  onWidth(box, draw);
}
schedule();

// ------------------------------------------------------------------ dataset samples
// One colour per class, distinct within each model's classes (fire orange, blood red).
const CLASS_COLOR = {
  fire: '--reference', blood: '--s8', circle: '--s7', ambulance: '--prediction', fire_engine: '--s4', compass: '--state',
  hammer_and_wrench: '--s5', buoy: '--s6', sos: '--s4', slalom: '--s8', magnet: '--s8',
  bandage: '--s5', helmet: '--state', nut_and_bolt: '--s4', pill: '--s7', plug: '--prediction', warning: '--s6',
};
function samples(D) {
  const pick = $('sample-pick'), stage = $('sample-stage'), meta = $('sample-meta'), toggle = $('sample-labels');
  const name = (s) => `${s.task ? s.task[0].toUpperCase() + s.task.slice(1) : 'Background'} · ${s.cam}`;
  const look = { talos_uwrt_repair_2026: 'RoboSub pool', talos_uwrt_rpac_look_2026: 'RPAC look' };
  pick.innerHTML = D.samples.map((s, i) => `<button type="button" class="btn" data-i="${i}" aria-pressed="${i === 0}">${name(s)}</button>`).join('');
  function show(i) {
    const s = D.samples[i];
    const classes = [...new Set(s.polys.map((p) => p.cls))];
    const col = Object.fromEntries(classes.map((c, k) => [c, css(CLASS_COLOR[c] || PALETTE[k % PALETTE.length])]));
    stage.innerHTML = `<img src="${BASE}${s.img}" width="${s.w}" height="${s.h}" alt="Synthetic ${s.cam} training image: ${s.task || 'background'}, ${s.environment} water">`;
    const svg = el('svg', { viewBox: `0 0 ${s.w} ${s.h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, stage);
    for (const p of s.polys) {
      const pts = [];
      for (let k = 0; k < p.pts.length; k += 2) pts.push(`${(p.pts[k] * s.w).toFixed(1)},${(p.pts[k + 1] * s.h).toFixed(1)}`);
      el('polygon', { points: pts.join(' '), fill: col[p.cls], 'fill-opacity': 0.38, stroke: col[p.cls], 'stroke-width': 2, 'vector-effect': 'non-scaling-stroke' }, svg);
    }
    svg.style.display = toggle.checked ? '' : 'none';
    const counts = {};
    s.polys.forEach((p) => (counts[p.cls] = (counts[p.cls] || 0) + 1));
    const C = D.counts[s.cam];
    meta.innerHTML = `
      <div class="nx-chips">${classes.length ? classes.map((c) => `<span><i style="background:${col[c]}"></i>${c}${counts[c] > 1 ? ` ×${counts[c]}` : ''}</span>`).join('') : '<span class="nx-dim">Nothing labelled: a background image, so the model also learns what is not a prop.</span>'}</div>
      <div class="nx-sample-facts">${s.cam === 'ffc' ? 'Forward' : 'Down'} camera · look <b>${s.environment}</b> · ${look[s.scenario] || esc(s.scenario)} · ${s.split} split · ${s.instances} labelled ${s.instances === 1 ? 'object' : 'objects'}</div>
      <div class="nx-sample-facts">The ${s.cam} set: ${(C.train + C.val).toLocaleString('en-US')} images (${C.train.toLocaleString('en-US')} train, ${C.val.toLocaleString('en-US')} val), ${C.classes.length} classes: ${C.classes.join(', ')}.</div>`;
  }
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(pick, b);
    show(+b.dataset.i);
  });
  toggle.addEventListener('change', () => { const svg = stage.querySelector('svg'); if (svg) svg.style.display = toggle.checked ? '' : 'none'; });
  show(0);
}

// ------------------------------------------------------------------ tests per part
function tests(T) {
  const box = $('tests-chart');
  const note = document.createElement('div');
  note.className = 'graph-note';
  note.textContent = 'Tap or hover a bar.';
  box.after(note);
  const rows = T.rows.slice().sort((a, b) => b.tests - a.tests);
  const total = (lang) => rows.filter((r) => r.lang.startsWith(lang)).reduce((s, r) => s + r.tests, 0);
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = `<span><i style="background:${css('--state')};height:8px"></i>C++, GoogleTest (${total('C++')})</span><span><i style="background:${css('--prediction')};height:8px"></i>Python, pytest (${total('Python')})</span>`;
  box.before(legend);
  onWidth(box, (W) => {
    const narrow = W < 520;
    const svg = barChart(box, rows.map((r) => ({ label: r.name.replace(' (Python)', ''), segments: [{ value: r.tests, color: css(r.lang.startsWith('C++') ? '--state' : '--prediction'), name: r.name }] })), {
      width: W, rowH: 24, digits: 0, labelW: narrow ? 118 : 170, valueW: 40,
    });
    // A full-width hit row per bar (label included): small bars are only a few pixels wide on a phone.
    const labels = svg.querySelectorAll('text.label');
    rows.forEach((r, i) => {
      const hit = el('rect', { class: 'nx-hit', x: 0, y: 3 + i * 24, width: W, height: 24 }, svg);
      const on = () => {
        labels.forEach((t, k) => t.classList.toggle('on', k === i));
        note.innerHTML = `<b>${esc(r.name)}</b>, ${r.tests} tests in <a href="${r.url}"><code>${esc(r.dir)}</code></a>. ${esc(r.what)}`;
      };
      hit.addEventListener('pointerdown', on);
      hit.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
    });
  });
}

// ------------------------------------------------------------------ load data
load('nereus/packs.json').then(packExplorer);
load('nereus/course.json').then(courseMap);
load('rosgraph/tree_run.json').then(events);
load('nereus/bridge.json').then(bridgeList);
load('nereus/samples.json').then(samples);
load('nereus/tests.json').then(tests);
