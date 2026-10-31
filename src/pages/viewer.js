import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/viewer.css';
import { parseMove, describe } from '../viz/viewer-move.js';

setup();

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const MEDIA = BASE + 'media/nereus/';
const IMG = BASE + 'img/viewer/';
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const minus = (s) => String(s).replace(/^-/, '−');
// The data files load in parallel; each figure waits only for its own, so one missing file breaks one figure.
const getJSON = (f) => fetch(BASE + 'data/viewer/' + f).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
const COURSE = getJSON('course.json'), WIRING = getJSON('wiring.json'), PRIOR = getJSON('priormap.json');
const failed = (id, err) => {
  console.warn(err);
  document.getElementById(id).replaceChildren(h('p', 'vm-err', 'This figure could not load its data. Reload the page to try again.'));
};

// Panels redrawn from the viewer's screenshots as HTML, so their text wraps and stays readable on a phone. A panel is a
// list of rows: ['h', heading] ['p', html, cls] ['btn', label, 'off' | 'red'] ['row', [btn, btn]] ['field', value,
// label?, 'ph'] ['check', label] ['seg', [a, b], on, 'off'] ['err', text].
function mock(rows) {
  const btn = ([label, f]) => `<span class="vx-btn${f ? ' ' + f : ''}">${esc(label)}</span>`;
  return rows.map((r) => {
    switch (r[0]) {
      case 'h': return `<div class="vx-h">${esc(r[1])}</div>`;
      case 'p': return `<div class="vx-p${r[2] ? ' ' + r[2] : ''}">${r[1]}</div>`;
      case 'btn': return btn(r.slice(1));
      case 'row': return `<div class="vx-row">${r[1].map((b) => (b ? btn(b) : '<span></span>')).join('')}</div>`;
      case 'field': return `<div class="vx-fieldrow">${r[2] ? `<span>${esc(r[2])}</span>` : ''}<span class="vx-field${r[3] ? ' ' + r[3] : ''}">${esc(r[1])}</span></div>`;
      case 'check': return `<div class="vx-check"><span class="vx-box" aria-hidden="true"></span>${esc(r[1])}</div>`;
      case 'seg': return `<div class="vx-seg${r[3] ? ' ' + r[3] : ''}">${r[1].map((t, i) => `<span${i === r[2] ? ' class="on"' : ''}>${esc(t)}</span>`).join('')}</div>`;
      case 'err': return `<div class="vx-p vx-err">${esc(r[1])}</div>`;
      default: return '';
    }
  }).join('');
}
// A segmented control that swaps a redrawn panel and its note: options { key: { html, label, note } }.
function mockSwitch(segId, hostId, noteId, options) {
  const host = document.getElementById(hostId), note = document.getElementById(noteId);
  const buttons = [...document.querySelectorAll(`#${segId} button`)];
  const pick = (k) => {
    const o = options[k];
    buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === k));
    host.innerHTML = o.html;
    host.setAttribute('aria-label', o.label);
    note.innerHTML = o.note;
  };
  buttons.forEach((b) => b.addEventListener('click', () => pick(b.dataset.k)));
  pick(buttons[0].dataset.k);
}

// ---------------------------------------------------------------- the annotated tour
// Coordinates are in the 1600 x 1000 screenshots (viewer-startup-killed / viewer-tree-running share one layout).
// box: the part, outlined on the shot. tab: where its number sits, in empty space next to the part, so it never
// covers a label. zoom: what the close-up shows, as short strips stacked, `{ killed, running }` when it differs per
// shot. A strip is [x, y, w, h] plus an optional flag: the strips of a part share one scale (up to 1.6x), and each is
// at most ~300 px wide so that scale stays about 1x or more in a phone's 316 px close-up and the viewer's 10-13 px
// text renders at 11 px or more. 'own': this strip takes its own scale (a line of tiny text). 'img': a 3D view or
// camera image, never enlarged, and may be shrunk to fit. img on the part: every strip is an image.
// k / r: the text for the "Just launched" and "Tree running" shots; lead / tail: text both share.
const TOUR = [
  { t: 'Menus', box: [0, 0, 330, 36], tab: [352, 18], zoom: [[0, 0, 212, 36], [212, 0, 122, 36]],
    k: `<p><b>File</b>: the prior map file, screenshots (<kbd>F12</kbd>), the settings and run-record folders. <b>View</b>: camera, focus, overlays, theme, interface scale and the pool. <b>Windows</b>: show any window, including Plots and Topics. <b>Layout</b>: Standard, Wide view, Camera wall and saved layouts. <b>Help</b>: the keys (<kbd>F1</kbd>).</p><p>The viewer draws its own title bar: drag its empty part to move the window.</p>` },
  { t: 'Search', box: [590, 4, 422, 28], tab: [1066, 18], zoom: [[586, 2, 162, 32], [944, 2, 72, 32]],
    k: `<p><kbd>Ctrl+P</kbd> searches everything the menus do, plus every button, switch and dropdown in every window, even closed ones. Type a few letters in order (<code>cwall</code> finds Camera wall).</p><p>It also takes typed moves (<code>forward 2</code>, <a href="#moves">below</a>), <i>Run &lt;tree&gt;</i> and <code>plot odom z</code>. Enable and KILL are deliberately not in it.</p>` },
  { t: 'Enable / KILL', box: [0, 40, 420, 46], tab: [478, 62], zoom: [[180, 40, 240, 46]], ros: ['command/software_kill', 'state/kill'],
    k: `<p>Green <b>Enable</b>, "Robot: killed". The viewer has been reporting a kill on slot 1 since it opened, so Talos can't move until someone presses Enable.</p><p>The text after the button is the robot's own <code>state/kill</code>. With the kill switch off it stays "killed" even after Enable.</p>`,
    r: `<p>Red <b>KILL</b>, "Robot: enabled". The enable stays on if the viewer closes or the tether comes off.</p><p>One click asserts slot 1, switches the controller off and stops the running tree (<a href="#enable">Enable and KILL</a>).</p>` },
  { t: 'Status chips', box: [788, 44, 372, 36], tab: [764, 62], zoom: [[786, 42, 218, 40], [1006, 42, 156, 40]], ros: ['gyro/status', 'dvl/bottom_lock', '/diagnostics_agg', 'state/battery'],
    k: `<p><b>FOG</b> temperature (amber at 55 °C, red at 75 °C), <b>DVL</b> bottom lock, <b>CPU</b> hottest core (70 / 85 °C), and the <b>PORT</b> and <b>STBD</b> batteries' charge (amber under 50 %, red under 20 %). Hover a chip for details.</p><p>Grey means no data. In sim only the DVL has a source, so it reads "Lock" and the rest stay grey.</p>` },
  { t: 'Run clock and points', box: [1165, 42, 172, 40], tab: [1250, 20], zoom: [[1162, 40, 178, 44]],
    k: `<p>The scorecard's run timer, on sim time, and the points so far. They light amber while a run is on. Start a run from <i>Run tracking</i> in the toolbar.</p><p>Scoring only exists in sim.</p>` },
  { t: 'Edit map', box: [1342, 44, 78, 36], tab: [1381, 20], zoom: [[1334, 40, 92, 44]],
    k: `<p>Opens the prior map editor (<kbd>Ctrl+M</kbd>) on riptide_mapping's <code>config.yaml</code>. The bar turns blue while you edit, and a running simulator pauses. <a href="#mapping">More below</a>.</p>` },
  { t: 'Pose source', box: [1422, 44, 168, 36], tab: [1540, 101], zoom: [[1416, 40, 182, 44]],
    k: `<p>Where the drawn Talos comes from. <code>PHYSICS CONNECTED</code>: simulator truth, in sim. <code>ROBOT (ESTIMATE)</code>: the EKF's <code>map</code> → <code>talos/base_link</code> through TF, at the pool.</p>` },
  { t: 'Pool view toolbar', box: [405, 90, 708, 72], tab: [1092, 184], zoom: [[405, 92, 296, 36], [698, 92, 206, 36], [905, 92, 210, 36], [405, 126, 292, 36], [695, 126, 212, 36]],
    k: `<p><b>Camera</b> (orbit, free, or look through ffc / dfc) and <b>Focus</b> (Vehicle, Course, a task, Claw, Payloads), <b>Follow</b>, then the overlays: <b>Labels</b>, <b>TF</b>, <b>MPC path</b>, <b>Covariance</b>, <b>Thrust</b>. Lit buttons are on.</p><p>Then windows: <b>Display</b>, <b>Scene</b>, <b>Simulation</b>, <b>Run tracking</b>, and <b>Sync sim</b>, pinned by default. <b>+</b> chooses what the toolbar shows.</p>` },
  { t: 'Pool view', box: [402, 168, 764, 802], tab: [432, 200], img: true,
    zoom: { killed: [[470, 330, 660, 420]], running: [[600, 400, 420, 300]] }, ros: ['/tf', 'controller/mpc/predicted_path', 'thruster_forces'],
    lead: `<p>The 3D pool: the course, Talos, and overlays. Left drag orbits, right or middle drag pans, scroll zooms, <kbd>F</kbd> focuses on the point under the cursor.</p>`,
    k: `<p>Here Talos sits at its start pose under the AprilTag board, killed and tilted (pitch −17.8°), seen from above with Follow on.</p>`,
    r: `<p>Just after the torpedo shot, from behind Talos. <b>MPC path</b> is on (lit in the toolbar). The coloured arrows are the detector's markers for the symbols it sees on the board (Vision panel).</p>` },
  { t: 'Motion', box: [0, 88, 400, 616], tab: [372, 101], zoom: [[0, 196, 334, 52], [0, 248, 322, 224]], ros: ['controller/linear', 'controller/angular', 'setTeleop'],
    k: `<p>"Ready / enable to control". The map-frame table shows the <b>Actual</b> pose and <code>--</code> for <b>Commanded</b>: nothing has been sent yet. Command and Dive in place wait for Enable.</p>`,
    r: `<p>"Autonomy owns motion": a tree is driving, so every input is greyed out. <b>Commanded</b> is the tree's setpoint. Just after the torpedo shot, the tree has called Talos back to x 16.84; it is still 0.74 m beyond that, backing off the board.</p>`,
    tail: `<p>The buttons below the table: <a href="#motion">Driving</a>.</p>` },
  { t: 'Mapping, Vision, Autonomy', box: [0, 706, 400, 294], tab: [372, 722], zoom: [[0, 704, 280, 296]], ros: ['autonomy/run_tree', 'autonomy/list_trees', 'autonomy/tree_stack'],
    k: `<p>Three tabs. <b>Autonomy</b> is in front: "Ready", a tree picker, and Start greyed out until Motion is enabled. "None yet: start a tree to see its stack."</p>`,
    r: `<p><b>Autonomy</b>: "Running", <code>RepairCompMpcTree.xml</code>, Stop lit. The execution stack reads <code>MISSION</code> › <code>CompMissionTreeMpc</code> › <code>COMP</code> › <code>Torpedo/bin/table tasks</code>, outermost first.</p>`,
    tail: `<p><b>Mapping</b>: tag calibration, mapping target, lock and reset. <b>Vision</b>: detection markers and point clouds.</p>` },
  { t: 'Camera cards', box: [1168, 88, 432, 638], tab: [1560, 101], zoom: [[1176, 120, 290, 34], [1172, 153, 168, 17, 'own'], [1208, 174, 354, 224, 'img']], ros: ['ffc/zed_node/rgb/image_rect_color/compressed', 'dfc/zed_node/rgb/image_rect_color/compressed'],
    lead: `<p>Forward and downward cameras, ZED X Mini at 1920×1200. <b>RGB / Depth</b>, <b>Truth / ROS</b> and <b>Main view</b> (look through it in the pool view).</p>`,
    k: `<p>Both are on <b>Truth</b>, the viewer's own render from the true camera pose, which is why the forward card shows the tilted start view.</p>`,
    r: `<p>Both are on <b>ROS</b>: the images the stack receives, at 7.3 and 16.3 Hz on this busy desktop. The torpedo board fills the forward card.</p>` },
  { t: 'Course map and robot panels', box: [1168, 726, 432, 274], tab: [1572, 776], zoom: [[1170, 726, 258, 34], [1426, 726, 174, 34], [1172, 760, 270, 56]], ros: ['command/actuator/*', 'state/actuator/status'],
    lead: `<p>Tabs: <b>Course map</b> (top-down, tap a task to focus it), <b>Recording</b>, <b>Bagging</b>, <b>Electrical</b>, <b>Actuators</b> (<a href="#robot-panels">below</a>).</p>`,
    k: `<p>Actuators is in front: "Actuators disarmed", claw and torpedo connected, and only <b>Arm actuators</b> available.</p>`,
    r: `<p>"Actuators armed": the tree armed them for the torpedo, so <b>Fire torpedo</b>, <b>Drop marker</b> and the claw buttons are live.</p>` },
  { t: 'Key strip', box: [402, 972, 764, 28], tab: [1136, 985], zoom: [[410, 973, 206, 25], [612, 973, 146, 25]],
    k: `<p>A reminder of the mouse in the pool view. With <b>Drive with keys</b> on it shows the drive keys and the step size instead.</p>` },
];

{
  const img = document.getElementById('tour-img');
  const shot = document.getElementById('tour-shot');
  const dim = document.getElementById('tour-dim');
  const box = document.getElementById('tour-box');
  const hover = document.getElementById('tour-hover');
  const tab = document.getElementById('tour-tab');
  const loupe = document.getElementById('tour-loupe');
  const title = document.getElementById('tour-title');
  const text = document.getElementById('tour-text');
  const count = document.getElementById('tour-count');
  const nextName = document.getElementById('tour-next-name');
  const fig = document.getElementById('tour-fig');
  const SRC = { killed: MEDIA + 'viewer-startup-killed.webp', running: MEDIA + 'viewer-tree-running.webp' };
  const ALT = {
    killed: img.alt,
    running: 'The same layout while a tree runs: red KILL and Robot: enabled, the Motion panel greyed out with Autonomy owns motion, the Autonomy tab Running RepairCompMpcTree.xml with its execution stack, Talos by the torpedo board with the detector’s coloured arrows, the forward camera card full of the board, and Actuators armed.',
  };
  const pre = new Image(); pre.src = SRC.running; // warm the cache for the switch
  let state = 'killed', cur = 0;

  // The chips: numbers on a phone, numbers and names on wider screens.
  const chipBox = document.getElementById('tour-chips');
  const chips = TOUR.map((s, i) => {
    const b = h('button', 'vt-chip', `<span class="n">${i + 1}</span><span class="t">${esc(s.t)}</span>`);
    b.type = 'button';
    b.setAttribute('aria-label', `${i + 1}: ${s.t}`);
    b.addEventListener('click', () => show(i));
    chipBox.append(b);
    return b;
  });

  // Tap the shot: the smallest part under the finger.
  const at = (e) => {
    const r = shot.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 1600, y = ((e.clientY - r.top) / r.height) * 1000;
    let best = -1, area = Infinity;
    TOUR.forEach((s, i) => {
      const [bx, by, bw, bh] = s.box;
      if (x >= bx && x <= bx + bw && y >= by && y <= by + bh && bw * bh < area) { best = i; area = bw * bh; }
    });
    return best;
  };
  shot.addEventListener('click', (e) => { const i = at(e); if (i >= 0) show(i); });
  shot.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const i = at(e);
    hover.style.display = i >= 0 && i !== cur ? '' : 'none';
    if (i >= 0) { const [x, y, w, hh] = TOUR[i].box; for (const [k, v] of Object.entries({ x, y, width: w, height: hh })) hover.setAttribute(k, v); }
  });
  shot.addEventListener('pointerleave', () => { hover.style.display = 'none'; });
  hover.style.display = 'none';

  // The close-up: the part's strips stacked, each scaled to the loupe's width (text strips share one scale, up to
  // 1.6x; a text strip is never drawn under 0.9x, it is cut at the right instead), with the part's outline where it shows.
  function drawLoupe() {
    const s = TOUR[cur];
    const strips = Array.isArray(s.zoom) ? s.zoom : s.zoom[state];
    const W = loupe.clientWidth || 320;
    const GAP = 6;
    const fit = (w, max) => Math.min(max, W / w);
    const text = strips.filter((r) => !r[4] && !s.img);
    const kText = Math.max(0.9, Math.min(...text.map((r) => fit(r[2], 1.6))));
    const parts = strips.map(([x, y, w, hh, flag]) => {
      const k = s.img || flag === 'img' ? fit(w, 1) : flag === 'own' ? fit(w, 1.6) : kText;
      return { x, y, w: Math.min(w, W / k), hh, k, dh: Math.round(hh * k) };
    });
    const H = parts.reduce((a, p) => a + p.dh, 0) + GAP * (parts.length - 1);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    loupe.width = Math.round(W * dpr); loupe.height = Math.round(H * dpr);
    loupe.style.height = H + 'px';
    loupe.setAttribute('aria-label', `Close-up of ${s.t}`);
    const c = loupe.getContext('2d');
    c.scale(dpr, dpr);
    c.fillStyle = css('--paper-2'); c.fillRect(0, 0, W, H);
    if (!img.complete || !img.naturalWidth) return;
    const f = img.naturalWidth / 1600; // the switch can briefly show a different-size image
    c.imageSmoothingQuality = 'high';
    let oy = 0;
    const [bx, by, bw, bh] = s.box;
    for (const p of parts) {
      const dw = Math.min(W, p.w * p.k);
      const ox = (W - dw) / 2;
      c.save();
      c.beginPath(); c.rect(ox, oy, dw, p.dh); c.clip();
      c.fillStyle = '#0f2633'; c.fillRect(ox, oy, dw, p.dh);
      c.drawImage(img, p.x * f, p.y * f, (dw / p.k) * f, p.hh * f, ox, oy, dw, p.dh);
      // the part's outline, if the strip shows a fair bit of what is round the part
      const rx = ox + (bx - p.x) * p.k, ry = oy + (by - p.y) * p.k;
      if (bx - p.x > 6 || by - p.y > 6 || p.x + p.w - bx - bw > 6 || p.y + p.hh - by - bh > 6) {
        c.strokeStyle = css('--accent'); c.lineWidth = 2.5;
        c.strokeRect(rx, ry, bw * p.k, bh * p.k);
      }
      c.restore();
      oy += p.dh + GAP;
    }
  }

  function show(i) {
    cur = (i + TOUR.length) % TOUR.length;
    const s = TOUR[cur];
    const [x, y, w, hh] = s.box;
    dim.setAttribute('d', `M0 0H1600V1000H0Z M${x} ${y}h${w}v${hh}h${-w}Z`);
    for (const [k, v] of Object.entries({ x, y, width: w, height: hh })) box.setAttribute(k, v);
    hover.style.display = 'none';
    tab.textContent = cur + 1;
    // kept a tab's radius inside the shot, so the ones at the edges aren't cut off
    tab.style.left = `clamp(0.8rem, ${s.tab[0] / 16}%, calc(100% - 0.8rem))`;
    tab.style.top = `clamp(0.8rem, ${s.tab[1] / 10}%, calc(100% - 0.8rem))`;
    chips.forEach((b, j) => { b.classList.toggle('on', j === cur); b.setAttribute('aria-pressed', j === cur); });
    title.textContent = `${cur + 1}. ${s.t}`;
    const ros = s.ros ? `<p class="vt-ros">ROS: ${s.ros.map((r) => `<code>${esc(r)}</code>`).join(', ')}</p>` : '';
    text.innerHTML = (s.lead || '') + (state === 'running' && s.r ? s.r : s.k) + (s.tail || '') + ros;
    count.textContent = `${cur + 1} / ${TOUR.length}`;
    nextName.textContent = TOUR[(cur + 1) % TOUR.length].t;
    drawLoupe();
  }

  document.getElementById('tour-prev').addEventListener('click', () => show(cur - 1));
  document.getElementById('tour-next').addEventListener('click', () => show(cur + 1));
  // The same, under the text (shown when the text sits below the shot): step on without scrolling back up, and
  // bring the new part's close-up into view.
  const stepFromFoot = (d) => { show(cur + d); loupe.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
  document.getElementById('tour-prev2').addEventListener('click', () => stepFromFoot(-1));
  document.getElementById('tour-next2').addEventListener('click', () => stepFromFoot(1));
  fig.addEventListener('keydown', (e) => {
    if (e.target.closest('input')) return;
    if (e.key === 'ArrowRight') { show(cur + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { show(cur - 1); e.preventDefault(); }
  });
  document.querySelectorAll('#tour-state button').forEach((b) => b.addEventListener('click', () => {
    state = b.dataset.s;
    document.querySelectorAll('#tour-state button').forEach((o) => o.setAttribute('aria-pressed', o === b));
    img.src = SRC[state]; img.alt = ALT[state];
    show(cur);
  }));
  img.addEventListener('load', drawLoupe);
  let lastW = 0;
  new ResizeObserver(() => { if (loupe.clientWidth !== lastW) { lastW = loupe.clientWidth; drawLoupe(); } }).observe(loupe);
  show(0);
}

// ---------------------------------------------------------------- Motion panel, two moments
{
  // Read off panel-motion-position.webp and panel-motion-autonomy-owns.webp: [Actual, Commanded, Error, Target].
  const AXES = ['X', 'Y', 'Z', 'Roll', 'Pitch', 'Yaw'];
  const table = (rows, tree) => `<table class="vx-table${tree ? ' tree' : ''}"><thead><tr><th>map</th><th>Actual</th><th>Commanded</th><th>Error</th><th>Target</th></tr></thead><tbody>` +
    rows.map((r, i) => `<tr><th>${AXES[i]}</th>${r.map((v, j) => `<td${j === 2 && Math.abs(v) >= 0.1 ? ' class="big"' : ''}>${j === 3 ? `<span class="vx-in">${minus(v.toFixed(2))}</span>` : minus(v.toFixed(2))}</td>`).join('')}</tr>`).join('') +
    '</tbody></table>';
  const head = (status, tree) => mock([['p', 'Robot: enabled', 'vx-ok'], ['p', status], ['seg', ['Position', 'Feedforward'], 0, tree ? 'off' : '']]);
  mockSwitch('motion-seg', 'motion-mock', 'motion-note', {
    hold: {
      html: head('Position control', false) + table([[15.5, 15.5, 0, 15.5], [2.8, 2.8, 0, 2.8], [-1.4, -1.4, 0, -1.4], [-0.01, 0, 0.01, 0], [0, 0, 0, 0], [0, 0, 0, 0]], false),
      label: 'Motion panel in Position control: Actual, Commanded and Target all x 15.50, y 2.80, z −1.40 and level, errors 0.01 or less.',
      note: `<b>Holding a typed pose.</b> Commanded and Target are the pose typed in, and no Error is over 0.01: Talos is there. <a href="${MEDIA}panel-motion-position.webp">Screenshot</a>` },
    tree: {
      html: head('Autonomy owns motion', true) + table([[17.58, 16.84, -0.74, 16.84], [2.56, 2.42, -0.14, 2.42], [-1.25, -1.47, -0.21, -1.47], [0, 0, 0, 0], [-0.03, 0, 0.03, 0], [10.91, 11.37, 0.47, 11.37]], true),
      label: 'Motion panel while a tree drives: Position and the Target boxes greyed out; Commanded is the tree setpoint x 16.84, y 2.42, z −1.47, yaw 11.37 against Actual 17.58, 2.56, −1.25, 10.91.',
      note: `<b>A tree is driving.</b> "Autonomy owns motion": Position and the Target boxes are greyed out, and Commanded is the tree's setpoint. The big errors (marked) are Talos still on its way to it: the moment in <a href="#tour">the tour</a>'s step 10. <a href="${MEDIA}panel-motion-autonomy-owns.webp">Screenshot</a>` },
  });
}

// ---------------------------------------------------------------- typed moves
(async () => {
  let course;
  try { course = await COURSE; } catch (e) { failed('move-fig', e); return; }
  const START = { p: [0.33, -0.11, -0.75], d: [0, 0, 2.63] }; // the startup screenshot's pose, after Dive in place
  // The simulator's RoboSub 2026 pool in map (nereus pools/robosub_2026 placed by scenarios/talos_uwrt): 22.86 m
  // across x, 50 m along y, 2.13 m deep.
  const POOL = { x0: 0, x1: 22.86, y0: -30.49, y1: 19.51, floor: -2.13 };
  let last = { p: [...START.p], d: [...START.d] };
  const trail = []; // poses already sent
  let view = 'move';
  const input = document.getElementById('move-text');
  const read = document.getElementById('move-read');
  const host = document.getElementById('move-map');
  const depthHost = document.getElementById('move-depth');
  const EX = [['forward 2'], ['turn right 45'], ['turn left 45 forward 2'], ['x 4 yaw 180'], ['go 15.5 2.8 -1.4 0'], ['down 0.5, level'], ['left panels', 'left panels (a search)']];
  const exBox = document.getElementById('move-examples');
  for (const [e, label] of EX) {
    const b = h('button', 'btn', `<code>${esc(label || e)}</code>`);
    b.type = 'button';
    b.addEventListener('click', () => { input.value = e; update(); });
    exBox.append(b);
  }
  const NAMES = { gate: 'gate', slalom_parent: 'slalom', torpedo: 'torpedo', bin: 'bins', table: 'table (sim)', pre_torpedo_pose: 'pre-torpedo', pre_bin_pose: 'pre-bin', pre_return_home: 'pre-home' };
  const C = () => ({ state: css('--state'), ref: css('--reference'), muted: css('--muted'), ink2: css('--ink-2'), grid: css('--grid'), rule: css('--rule'), paper: css('--paper'), paper2: css('--paper-2') });

  // Legend swatches drawn like the marks on the map.
  {
    const c = C();
    const sw = (inner) => `<svg width="18" height="14" viewBox="-9 -7 18 14" aria-hidden="true">${inner}</svg>`;
    const arrowPath = (col) => `<path d="M7 0L-4.2 -3.85L-2.1 0L-4.2 3.85Z" fill="${col}" stroke="${c.paper}" stroke-width="1"/>`;
    document.getElementById('move-legend').innerHTML =
      `<span>${sw(arrowPath(c.state))}last command</span>` +
      `<span>${sw(`<line x1="-8" y1="0" x2="2" y2="0" stroke="${c.ref}" stroke-width="2"/>` + arrowPath(c.ref).replace('M7 0', 'M8 0'))}new target</span>` +
      `<span>${sw(`<circle r="3" fill="${c.ref}"/>`)}each step</span>` +
      `<span>${sw(`<line x1="-8" y1="0" x2="8" y2="0" stroke="${c.muted}" stroke-width="1.6" stroke-dasharray="3 2"/>`)}sent before</span>` +
      `<span>${sw(`<circle r="4.5" fill="${c.ink2}"/>`)}prop</span>` +
      `<span>${sw(`<circle r="3.5" fill="none" stroke="${c.ink2}" stroke-width="1.3"/>`)}pre-pose</span>` +
      `<span>${sw(`<rect x="-4.5" y="-4.5" width="9" height="9" fill="none" stroke="${c.ink2}" stroke-width="1.5"/>`)}table, from the sim course</span>`;
  }

  const outside = (p) => p[0] < POOL.x0 || p[0] > POOL.x1 || p[1] < POOL.y0 || p[1] > POOL.y1;

  function draw(cmd) {
    const c = C();
    const Wp = Math.max(200, host.clientWidth || 320);
    const Hp = Math.round(Math.min(480, Math.max(300, Wp * 1.05)));
    // the region to show, in map metres
    let xa, xb, ya, yb;
    const pts = [last.p, ...(cmd ? cmd.steps.map((s) => s.target.p) : [])];
    if (view === 'course') {
      xa = -1.5; xb = 20.5; ya = -5.5; yb = 13.5;
      for (const p of [...pts, ...trail.map((t) => t.p)]) { xa = Math.min(xa, p[0] - 1); xb = Math.max(xb, p[0] + 1); ya = Math.min(ya, p[1] - 1); yb = Math.max(yb, p[1] + 1); }
    } else {
      xa = Math.min(...pts.map((p) => p[0])) - 3; xb = Math.max(...pts.map((p) => p[0])) + 3;
      ya = Math.min(...pts.map((p) => p[1])) - 3; yb = Math.max(...pts.map((p) => p[1])) + 3;
      const grow = (a, b, min) => { const m = (a + b) / 2, half = Math.max(min, b - a) / 2; return [m - half, m + half]; };
      [xa, xb] = grow(xa, xb, 8); [ya, yb] = grow(ya, yb, 8);
    }
    // screen: x up, y to the left (as the viewer's 2D chart); the bottom 18 px hold the y labels
    const B = 18;
    let s, cx, cy, vis;
    const fit = () => {
      s = Math.min(Wp / (yb - ya), (Hp - B) / (xb - xa));
      cy = (ya + yb) / 2; cx = (xa + xb) / 2;
      vis = { x0: cx - (Hp - B) / 2 / s, x1: cx + (Hp - B) / 2 / s, y0: cy - Wp / 2 / s, y1: cy + Wp / 2 / s };
    };
    fit();
    // This move: a prop at the edge of the view (up to 1.5 m outside it, or under 1 m inside) comes in whole with
    // room for its label, rather than half-drawn at the edge.
    for (let pass = 0; view === 'move' && pass < 3; pass++) {
      let moved = false;
      for (const o of course.props) {
        const near = o.x > vis.x0 - 1.5 && o.x < vis.x1 + 1.5 && o.y > vis.y0 - 1.5 && o.y < vis.y1 + 1.5;
        const edge = o.x < vis.x0 + 1 || o.x > vis.x1 - 1 || o.y < vis.y0 + 1 || o.y > vis.y1 - 1;
        if (near && edge) {
          xa = Math.min(xa, vis.x0, o.x - 1.2); xb = Math.max(xb, vis.x1, o.x + 1.2);
          ya = Math.min(ya, vis.y0, o.y - 1.2); yb = Math.max(yb, vis.y1, o.y + 1.2);
          moved = true;
        }
      }
      if (!moved) break;
      fit();
    }
    const X = (p) => Wp / 2 - (p[1] - cy) * s, Y = (p) => (Hp - B) / 2 - (p[0] - cx) * s;
    const svg = svgEl('svg', { viewBox: `0 0 ${Wp} ${Hp}`, width: Wp, height: Hp, class: 'vm-svg', role: 'img', 'aria-label': 'Top-down map of the course with the last command and the new target' });
    // outside the pool: shaded; the wall as a line
    const px0 = X([0, POOL.y1]), px1 = X([0, POOL.y0]), py0 = Y([POOL.x1, 0]), py1 = Y([POOL.x0, 0]);
    svg.append(svgEl('path', { d: `M-10 -10H${Wp + 10}V${Hp + 10}H-10Z M${px0} ${py0}H${px1}V${py1}H${px0}Z`, fill: c.paper2, 'fill-rule': 'evenodd' }));
    // grid
    const step = [1, 2, 5, 10].find((st) => st * s >= 26) || 10;
    for (let x = Math.ceil(vis.x0 / step) * step; x <= vis.x1; x += step) svg.append(svgEl('line', { x1: 0, x2: Wp, y1: Y([x, 0]), y2: Y([x, 0]), stroke: x === 0 ? c.rule : c.grid, 'stroke-width': x === 0 ? 1.4 : 1 }));
    for (let y = Math.ceil(vis.y0 / step) * step; y <= vis.y1; y += step) svg.append(svgEl('line', { y1: 0, y2: Hp - B, x1: X([0, y]), x2: X([0, y]), stroke: y === 0 ? c.rule : c.grid, 'stroke-width': y === 0 ? 1.4 : 1 }));
    svg.append(svgEl('rect', { x: px0, y: py0, width: px1 - px0, height: py1 - py0, fill: 'none', stroke: c.ink2, 'stroke-width': 2.5 }));
    const text = (x, y, t, cls, anchor = 'start') => { const e = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }); e.textContent = t; svg.append(e); return e; };

    // Every mark's box goes in first (robot, target, steps, props, scale bar); then the prop labels, then the axis
    // labels, each only where it overlaps nothing already placed.
    const marks = [];
    const overlaps = (r, list) => list.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    const inside = (r) => r.x >= 0 && r.x + r.w <= Wp && r.y >= 0 && r.y + r.h <= Hp - B;
    const box = (x, y, rad) => ({ x: x - rad, y: y - rad, w: 2 * rad, h: 2 * rad });
    const robotPts = [last.p, ...(cmd ? [cmd.target.p] : [])];
    for (const p of robotPts) marks.push(box(X(p), Y(p), 12));
    if (cmd) for (const st of cmd.steps) marks.push(box(X(st.target.p), Y(st.target.p), 5));
    const bar = step * s, sy = Hp - B - 30;
    const scaleBox = { x: 2, y: sy, w: Math.max(bar, 30) + 12, h: 28 };
    marks.push(scaleBox);
    const props = course.props.filter((o) => o.x > vis.x0 + 0.2 && o.x < vis.x1 - 0.2 && o.y > vis.y0 + 0.2 && o.y < vis.y1 - 0.2);
    for (const o of props) marks.push(box(X([o.x, o.y]), Y([o.x, o.y]), 6));
    // the path segments as thin boxes, so labels keep off the arrow's line too
    if (cmd) {
      const ps = [last.p, ...cmd.steps.map((st) => st.target.p)];
      for (let k = 1; k < ps.length; k++) {
        const n = Math.max(1, Math.ceil(Math.hypot(X(ps[k]) - X(ps[k - 1]), Y(ps[k]) - Y(ps[k - 1])) / 10));
        for (let t = 1; t < n; t++) { const f = t / n; marks.push(box(X(ps[k - 1]) + (X(ps[k]) - X(ps[k - 1])) * f, Y(ps[k - 1]) + (Y(ps[k]) - Y(ps[k - 1])) * f, 4)); }
      }
    }
    const placed = [];
    const label = (x, y, t, cls, fs, rad) => {
      const w = t.length * fs * 0.6 + 4, hh = fs + 2, d = rad + 2;
      const spots = [[x + d, y - hh / 2], [x - d - w, y - hh / 2], [x - w / 2, y - d - hh], [x - w / 2, y + d],
        [x + d - 2, y - d - hh + 3], [x - d - w + 2, y - d - hh + 3], [x + d - 2, y + d - 3], [x - d - w + 2, y + d - 3]];
      const r = spots.map(([sx, sy]) => ({ x: sx, y: sy, w, h: hh })).find((q) => inside(q) && !overlaps(q, placed) && !overlaps(q, marks));
      if (!r) return false;
      placed.push(r);
      text(r.x + 2, r.y + fs - 1, t, cls);
      return true;
    };

    // scale bar, bottom left, on a paper chip
    svg.append(svgEl('rect', { x: scaleBox.x, y: sy, width: scaleBox.w, height: 28, rx: 4, fill: c.paper, 'fill-opacity': 0.9 }));
    svg.append(svgEl('line', { x1: 8, x2: 8 + bar, y1: sy + 7, y2: sy + 7, stroke: c.ink2, 'stroke-width': 2 }));
    text(8 + bar / 2, sy + 22, `${step} m`, 'vm-axis', 'middle');
    // props: prior-map props filled, pre-poses as rings, the simulator's table as a square
    for (const o of props) {
      const p = [o.x, o.y], pre = o.name.startsWith('pre_');
      if (o.sim) svg.append(svgEl('rect', { x: X(p) - 5, y: Y(p) - 5, width: 10, height: 10, fill: c.paper, stroke: c.ink2, 'stroke-width': 1.6 }));
      else svg.append(svgEl('circle', { cx: X(p), cy: Y(p), r: pre ? 3.8 : 5, fill: pre ? c.paper : c.ink2, stroke: c.ink2, 'stroke-width': pre ? 1.4 : 0 }));
      if (!pre && !o.sim) { const a = (o.yaw * Math.PI) / 180; svg.append(svgEl('line', { x1: X(p), y1: Y(p), x2: X(p) - Math.sin(a) * 13, y2: Y(p) - Math.cos(a) * 13, stroke: c.ink2, 'stroke-width': 1.6 })); }
    }
    for (const o of [...props].sort((a, b) => a.name.startsWith('pre_') - b.name.startsWith('pre_'))) {
      const pre = o.name.startsWith('pre_');
      label(X([o.x, o.y]), Y([o.x, o.y]), NAMES[o.name] || o.name, pre ? 'vm-prop small' : 'vm-prop', pre ? 11 : 12.5, 6);
    }
    // axis labels on the edges, every other grid line when tight, where they clear the marks and labels
    const lstep = step * (step * s < 44 ? 2 : 1);
    for (let x = Math.ceil(vis.x0 / lstep) * lstep; x <= vis.x1; x += lstep) {
      const yy = Y([x, 0]), r = { x: 0, y: yy - 15, w: 38, h: 14 };
      if (yy > 14 && inside(r) && !overlaps(r, placed) && !overlaps(r, marks)) text(4, yy - 3, `x ${minus(x)}`, 'vm-axis');
    }
    for (let y = Math.ceil(vis.y0 / lstep) * lstep; y <= vis.y1; y += lstep) { const xx = X([0, y]); if (xx > 20 && xx < Wp - 20) text(xx, Hp - 5, `y ${minus(y)}`, 'vm-axis', 'middle'); }

    // earlier sends
    const path = [START.p, ...trail.map((t) => t.p)];
    if (path.length > 1) svg.append(svgEl('polyline', { points: path.map((p) => `${X(p)},${Y(p)}`).join(' '), fill: 'none', stroke: c.muted, 'stroke-width': 1.6, 'stroke-dasharray': '4 3' }));
    // map heading → screen direction
    const dir = (yawDeg) => { const a = (yawDeg * Math.PI) / 180; return [-Math.sin(a), -Math.cos(a)]; };
    const arrow = (p, yawDeg, col, { hollow = false, k = 1 } = {}) => {
      const [dx, dy] = dir(yawDeg);
      const pt = (f, l) => [X(p) + (f * dx - l * dy) * k, Y(p) + (f * dy + l * dx) * k];
      const q = [pt(11, 0), pt(-7, 6), pt(-3.5, 0), pt(-7, -6)];
      svg.append(svgEl('path', { d: 'M' + q.map((v) => v.join(' ')).join('L') + 'Z', fill: hollow ? c.paper : col, stroke: hollow ? col : c.paper, 'stroke-width': hollow ? 2 : 1.2, 'stroke-linejoin': 'round' }));
    };
    if (cmd) {
      const ps = [last.p, ...cmd.steps.map((st) => st.target.p)];
      svg.append(svgEl('polyline', { points: ps.map((p) => `${X(p)},${Y(p)}`).join(' '), fill: 'none', stroke: c.ref, 'stroke-width': 2.2 }));
      cmd.steps.forEach((st, i) => { if (i < cmd.steps.length - 1) svg.append(svgEl('circle', { cx: X(st.target.p), cy: Y(st.target.p), r: 3.2, fill: c.ref })); });
    }
    // A move that ends where it started (a pure turn, or only up / down): the last command is drawn as an outline
    // under the new target, and a turn gets a curved arrow from the old heading to the new one.
    const sameSpot = cmd && Math.hypot(cmd.target.p[0] - last.p[0], cmd.target.p[1] - last.p[1]) < 0.05;
    arrow(last.p, last.d[2], c.state, sameSpot ? { hollow: true, k: 1.55 } : {});
    if (cmd) {
      if (sameSpot) {
        const turn = ((((cmd.target.d[2] - last.d[2]) % 360) + 540) % 360) - 180; // degrees, left positive
        if (Math.abs(turn) > 1) {
          const R = 30, n = Math.max(6, Math.round(Math.abs(turn) / 6));
          const at = (deg) => { const [dx, dy] = dir(deg); return [X(last.p) + dx * R, Y(last.p) + dy * R]; };
          const arc = [];
          for (let t = 0; t <= n; t++) arc.push(at(last.d[2] + (turn * t) / n));
          svg.append(svgEl('polyline', { points: arc.map((v) => v.join(',')).join(' '), fill: 'none', stroke: c.ref, 'stroke-width': 2.2 }));
          // arrowhead along the arc's direction at its end
          const [ex, ey] = arc[arc.length - 1], [qx, qy] = arc[arc.length - 2];
          const L = Math.hypot(ex - qx, ey - qy) || 1, ux = (ex - qx) / L, uy = (ey - qy) / L;
          svg.append(svgEl('path', { d: `M${ex + ux * 4} ${ey + uy * 4}L${ex - ux * 6 - uy * 5} ${ey - uy * 6 + ux * 5}L${ex - ux * 6 + uy * 5} ${ey - uy * 6 - ux * 5}Z`, fill: c.ref }));
        }
      }
      arrow(cmd.target.p, cmd.target.d[2], c.ref);
      if (outside(cmd.target.p)) svg.append(svgEl('circle', { cx: X(cmd.target.p), cy: Y(cmd.target.p), r: 14, fill: 'none', stroke: '#a8360a', 'stroke-width': 2, 'stroke-dasharray': '3 2' }));
    }
    host.replaceChildren(svg);
    drawDepth(cmd, Hp);
  }

  // Depth: surface at the top, the pool floor, and the last and new z.
  function drawDepth(cmd, Hp) {
    const c = C();
    const W = 76;
    const zs = [last.p[2], ...(cmd ? [cmd.target.p[2]] : [])];
    const zTop = Math.max(0.4, ...zs.map((z) => z + 0.4)), zBot = Math.min(POOL.floor - 0.4, ...zs.map((z) => z - 0.4));
    const top = 18, bot = Hp - 14;
    const Z = (z) => top + ((zTop - z) / (zTop - zBot)) * (bot - top);
    const svg = svgEl('svg', { viewBox: `0 0 ${W} ${Hp}`, width: W, height: Hp, class: 'vm-svg', role: 'img', 'aria-label': `Depth: last command z ${last.p[2].toFixed(2)} m` + (cmd ? `, new target z ${cmd.target.p[2].toFixed(2)} m` : '') });
    const t = (x, y, s, cls, anchor = 'start') => { const e = svgEl('text', { x, y, class: cls, 'text-anchor': anchor }); e.textContent = s; svg.append(e); };
    t(W / 2, 12, 'depth', 'vm-axis', 'middle');
    svg.append(svgEl('rect', { x: 8, y: Z(0), width: 16, height: Z(POOL.floor) - Z(0), fill: c.paper2 }));
    svg.append(svgEl('line', { x1: 6, x2: 26, y1: Z(0), y2: Z(0), stroke: c.state, 'stroke-width': 1.5 }));
    svg.append(svgEl('line', { x1: 6, x2: 26, y1: Z(POOL.floor), y2: Z(POOL.floor), stroke: c.ink2, 'stroke-width': 2.5 }));
    t(W - 3, Z(0) - 4, 'surface', 'vm-axis', 'end');
    t(W - 3, Z(POOL.floor) + 14, 'floor', 'vm-axis', 'end');
    const mark = (z, col, side) => {
      const y = Z(z);
      svg.append(svgEl('path', { d: side ? `M24 ${y}L33 ${y - 5}L33 ${y + 5}Z` : `M8 ${y}L0 ${y - 5}L0 ${y + 5}Z`, fill: col }));
      svg.append(svgEl('line', { x1: 8, x2: 24, y1: y, y2: y, stroke: col, 'stroke-width': 2.5 }));
    };
    mark(last.p[2], c.state, false);
    const lastY = Z(last.p[2]);
    t(W - 3, lastY + 4, minus(last.p[2].toFixed(2)), 'vm-z', 'end');
    if (cmd) {
      const nz = cmd.target.p[2];
      mark(nz, c.ref, true);
      const ny = Z(nz);
      if (Math.abs(ny - lastY) > 13) t(W - 3, ny + 4, minus(nz.toFixed(2)), 'vm-z ref', 'end');
    }
    depthHost.replaceChildren(svg);
  }

  let current = null;
  function update() {
    const r = parseMove(input.value, last);
    current = r.command;
    const from = `<span class="vm-from">From the last command: ${esc(describe(last))}</span>`;
    const search = /^\s*left\s+panels?\s*$/i.test(input.value)
      ? '<span class="vm-note">In the viewer this is a search: it finds <i>View › Left panels</i> first, and the move hint comes after the results.</span>' : '';
    let warn = '';
    if (r.command) {
      const p = r.command.target.p;
      const w = [];
      if (outside(p)) w.push('outside the pool walls');
      if (p[2] < POOL.floor) w.push(`below the pool floor (${-POOL.floor} m deep)`);
      if (p[2] > 0) w.push('above the surface');
      if (w.length) warn = `<span class="vm-err">The target is ${w.join(' and ')}. The viewer would still send it.</span>`;
    }
    if (!r.isMove) read.innerHTML = `<span class="vm-err">Not a move: the first word must be forward / back / left / right / up / down, turn, x / y / z, roll / pitch / yaw, go or level. In the viewer this text would search windows and controls instead.</span>${from}`;
    else if (!r.command) read.innerHTML = `<span class="vm-err">${esc(r.error)}</span>${search}${from}`;
    else read.innerHTML = `<span class="vm-said">${esc(r.command.summary)}</span><span class="vm-to">→ ${esc(describe(r.command.target))}</span>${warn}${from}`;
    document.getElementById('move-send').disabled = !r.command;
    draw(r.command);
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && current) send(); });
  function send() {
    if (!current) return;
    last = current.target; trail.push(last);
    update();
  }
  document.getElementById('move-send').addEventListener('click', send);
  document.getElementById('move-reset').addEventListener('click', () => { last = { p: [...START.p], d: [...START.d] }; trail.length = 0; update(); });
  document.querySelectorAll('#move-view button').forEach((b) => b.addEventListener('click', () => {
    view = b.dataset.v;
    document.querySelectorAll('#move-view button').forEach((o) => o.setAttribute('aria-pressed', o === b));
    update();
  }));
  let lastW = 0;
  new ResizeObserver(() => { if (host.clientWidth !== lastW) { lastW = host.clientWidth; update(); } }).observe(host);
  update();
})();

// ---------------------------------------------------------------- video chapters
function chapters(videoId, boxId, list) {
  const v = document.getElementById(videoId);
  const box = document.getElementById(boxId);
  for (const [t, s] of list) {
    const b = h('button', 'btn', esc(t));
    b.type = 'button';
    b.addEventListener('click', () => { v.currentTime = s; v.play().catch(() => {}); });
    box.append(b);
  }
}
// Seconds into tree-run-behind.mp4 where its burned-in task label changes (read off the video at 1 s steps).
chapters('run-video', 'run-chapters', [['Dive and gate', 0], ['Slalom', 5], ['Pinger (not simulated)', 11], ['Torpedo', 17], ['Table', 23], ['Pill grasped', 38]]);
// viewer-tour.mp4: the capture's step marks (tools/nereus-media/viewer_tour.sh), divided by the 1.4x speed-up.
chapters('tour-video', 'tour-chapters', [['Typed move', 3], ['Thrust, MPC path', 9.6], ['Camera cards', 18], ['Through the camera', 23.4], ['Point clouds', 27.2], ['TF frames', 32.8], ['Layouts', 36.3], ['Scorecard', 45.5], ['Prior map editor', 49]]);

// ---------------------------------------------------------------- the prior map
(async () => {
  let data;
  try { data = await PRIOR; } catch (e) { failed('prior-fig', e); return; }
  const table = document.getElementById('prior-table');
  const kids = {};
  for (const o of data.objects) (kids[o.parent] ||= []).push(o);
  const open = new Set();
  // moved for an RPAC dive-well test (riptide_perception 2f3da82 "RPAC table"), see the note under the table
  const RPAC = new Set(['table', 'pre_table_pose']);
  const n = (v, d) => minus((Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d));
  const count = (name) => (kids[name] || []).reduce((a, k) => a + 1 + count(k.name), 0);
  function render() {
    const rows = ['<thead><tr><th>Object</th><th>x</th><th>y</th><th>z</th><th>yaw</th></tr></thead><tbody>'];
    const walk = (parent, depth) => {
      for (const o of kids[parent] || []) {
        const sub = count(o.name);
        const tag = RPAC.has(o.name) ? ' <span class="vp-tag" title="Set for an RPAC dive-well test">RPAC</span>' : '';
        const name = sub
          ? `<button type="button" class="vp-tog" data-n="${esc(o.name)}" aria-expanded="${open.has(o.name)}">${esc(o.name)} <span class="vp-n">${sub}</span></button>${tag}`
          : `<span class="vp-leaf">${esc(o.name)}</span>${tag}`;
        rows.push(`<tr class="d${Math.min(depth, 3)}"><td style="--d:${depth}">${name}</td><td>${n(o.x, 2)}</td><td>${n(o.y, 2)}</td><td>${n(o.z, 2)}</td><td>${n(o.yaw, 0)}°</td></tr>`);
        if (open.has(o.name)) walk(o.name, depth + 1);
      }
    };
    walk('map', 0);
    rows.push('</tbody>');
    table.innerHTML = rows.join('');
  }
  table.addEventListener('click', (e) => {
    const b = e.target.closest('.vp-tog');
    if (!b) return;
    const k = b.dataset.n;
    if (open.has(k)) open.delete(k); else open.add(k);
    render();
    table.querySelector(`.vp-tog[data-n="${CSS.escape(k)}"]`)?.focus();
  });
  const all = document.getElementById('prior-all');
  all.addEventListener('click', () => {
    const on = all.getAttribute('aria-pressed') !== 'true';
    open.clear();
    if (on) for (const o of data.objects) if (kids[o.name]) open.add(o.name);
    all.setAttribute('aria-pressed', on);
    all.textContent = on ? 'Close all' : 'Open all';
    render();
  });
  document.getElementById('prior-count').textContent = `${data.objects.length} objects; ${(kids.map || []).length} sit directly in map, the rest are placed relative to them`;
  render();
})();

// ---------------------------------------------------------------- robot panels
// Redrawn from public/media/nereus/panel-*.webp (sim, 2026-10-30), top to bottom as far as the point of each note.
mockSwitch('panels-seg', 'panels-mock', 'panels-note', {
  act: {
    html: mock([['p', 'Actuators disarmed', 'vx-dim'], ['p', '<i class="vx-dot"></i>Claw <b>Connected</b> <i class="vx-dot"></i>Torpedo <b>Connected</b>'],
      ['btn', 'Arm actuators'], ['btn', 'Fire torpedo', 'off'], ['btn', 'Drop marker', 'off'], ['btn', 'Open claw', 'off'], ['btn', 'Close claw', 'off'], ['btn', 'Stop claw', 'off'], ['btn', 'Reload / disarm'],
      ['h', 'Status'], ['p', 'Markers remaining: 0'], ['p', 'Torpedoes remaining: 2']]),
    label: 'Actuators panel, disarmed: Claw Connected, Torpedo Connected, Arm actuators, then greyed Fire torpedo, Drop marker, Open claw, Close claw and Stop claw, Reload / disarm, and the counts: 0 markers, 2 torpedoes.',
    note: `<b>Actuators</b>, disarmed: only <i>Arm actuators</i> is live; the rest light up once armed. <a href="${MEDIA}panel-actuators.webp">Screenshot</a>` },
  rec: {
    html: mock([['h', 'SVO recording'], ['p', 'Path on the robot'], ['field', '~/svos/run'], ['check', 'Add date and time'],
      ['p', 'FFC <span class="vx-dim">service unavailable</span>'], ['row', [['Start FFC', 'off'], ['Stop FFC', 'off']]], ['p', '/home/ros/svos/run_20261030_215431_ffc.svo2', 'vx-path'],
      ['p', 'DFC <span class="vx-dim">service unavailable</span>'], ['row', [['Start DFC', 'off'], ['Stop DFC', 'off']]], ['p', '/home/ros/svos/run_20261030_215431_dfc.svo2', 'vx-path'],
      ['h', 'Still images'], ['btn', 'Capture image', 'off'], ['p', 'Capture service unavailable', 'vx-dim']]),
    label: 'Recording panel: path on the robot ~/svos/run, Add date and time ticked, Start and Stop for FFC and DFC greyed with service unavailable, the file names they would write, and a greyed Capture image.',
    note: `<b>Recording</b>: where the SVO files go on the robot, and Start / Stop for each camera. "Service unavailable" because there is no ZED driver in sim. <a href="${MEDIA}panel-recording.webp">Screenshot</a>` },
  bag: {
    html: mock([['seg', ['Robot', 'This computer'], 0], ['field', 'ros@orin2', 'ssh'], ['btn', 'Record on Robot', 'off'],
      ['err', "Can't reach ros@orin2: ssh: connect to host orin2 port 22: Connection timed out"],
      ['h', 'Bag'], ['p', 'Folder on the robot'], ['field', '~/bags'], ['p', 'Name'], ['field', 'talos'], ['check', 'Add date and time'], ['p', '~/bags/talos_20261030_215420', 'vx-path'],
      ['h', 'Topics'], ['seg', ['All', 'Selected'], 0], ['p', 'Leave out (regex)'], ['field', 'e.g. image|point_cloud', '', 'ph']]),
    label: "Bagging panel: Robot selected, ssh ros@orin2, a greyed Record on Robot button, a red line: Can't reach ros@orin2, connection timed out; then the folder ~/bags, name talos, All topics and an empty Leave out field.",
    note: `<b>Bagging</b>, set to record on the robot over SSH. The red line is what you see when the Orin can't be reached; here there is no robot. <a href="${MEDIA}panel-bagging.webp">Screenshot</a>` },
  ele: {
    html: mock([['h', 'Power'], ['row', [['Cycle computer', 'red'], ['Cycle robot', 'red']]], ['row', [['Kill robot power', 'red'], ['Cycle IMU']]],
      ['row', [['Cycle acoustics'], ['Kill acoustics']]], ['row', [['Enable fans'], ['Disable fans']]], ['row', [['Enable LEDs'], ['Disable LEDs']]], ['row', [['Clear depth'], null]],
      ['h', 'IMU (VectorNav)'], ['btn', 'Mag cal', 'off'], ['p', 'Mag cal action unavailable', 'vx-dim']]),
    label: 'Electrical panel, Power: red Cycle computer, Cycle robot and Kill robot power buttons, then Cycle IMU, Cycle acoustics, Kill acoustics, Enable and Disable fans, Enable and Disable LEDs, Clear depth; below, IMU (VectorNav) with a greyed Mag cal.',
    note: `<b>Electrical › Power.</b> The red buttons cut power to the computer or the whole robot, so they ask before sending. Further down: IMU, FOG, acoustics and IVC. <a href="${MEDIA}panel-electrical.webp">Screenshot</a>` },
});

// ---------------------------------------------------------------- layouts, drawn to scale
{
  // Rectangles in the 1600 x 1000 window, measured off the layout screenshots. The menus and command bar are y 0-88.
  const L = {
    std: { shot: 'viewer-startup-killed.webp', note: '<b>Standard.</b> Everything at once: the layout in the <a href="#tour">tour</a>.',
      boxes: [['Motion', 0, 88, 400, 618], ['Autonomy, Mapping, Vision', 0, 706, 400, 294], ['Pool view', 402, 88, 764, 912, 1], ['Forward camera', 1168, 88, 432, 318], ['Downward camera', 1168, 406, 432, 320], ['Course map, robot panels', 1168, 726, 432, 274]] },
    wide: { shot: 'viewer-layout-wide.webp', note: '<b>Wide view.</b> The pool view gets the width; the cameras and the course map share a strip beneath it.',
      boxes: [['Motion', 0, 88, 400, 612], ['Autonomy, Mapping, Vision', 0, 700, 400, 300], ['Pool view', 402, 88, 1198, 636, 1], ['Forward camera', 402, 726, 398, 274], ['Downward camera', 802, 726, 398, 274], ['Course map, robot panels', 1202, 726, 398, 274]] },
    wall: { shot: 'viewer-layout-camera-wall.webp', note: '<b>Camera wall.</b> Big camera feeds, for watching what the detector sees.',
      boxes: [['Motion', 0, 88, 400, 612], ['Autonomy, Mapping, Vision', 0, 700, 400, 300], ['Pool view', 402, 88, 526, 912, 1], ['Forward camera', 930, 88, 670, 334], ['Downward camera', 930, 422, 670, 338], ['Course map, robot panels', 930, 760, 670, 240]] },
  };
  const tile = document.getElementById('layout-tile');
  const note = document.getElementById('layout-note');
  const buttons = [...document.querySelectorAll('#layout-seg button')];
  const pick = (k) => {
    const l = L[k];
    buttons.forEach((b) => b.setAttribute('aria-pressed', b.dataset.k === k));
    tile.innerHTML = `<div class="vl-bar">Menus and command bar</div>` + l.boxes.map(([t, x, y, w, hh, pool]) =>
      `<div class="vl-box${pool ? ' pool' : ''}" style="left:${x / 16}%;top:${y / 10}%;width:${w / 16}%;height:${hh / 10}%"><span>${esc(t)}</span></div>`).join('');
    tile.setAttribute('aria-label', `${buttons.find((b) => b.dataset.k === k).textContent} layout: ` + l.boxes.map((b) => b[0]).join(', '));
    const after = k === 'std' ? '' : ' (taken after a run, so the Motion panel shows a stale-pose note)';
    note.innerHTML = `${l.note} <a href="${MEDIA + l.shot}">Screenshot</a>${after}.`;
  };
  buttons.forEach((b) => b.addEventListener('click', () => pick(b.dataset.k)));
  pick('std');
}

// ---------------------------------------------------------------- keys (the viewer's F1 window)
{
  // Keys in [brackets] are drawn as key caps. Rows as in app.cpp drawHelpWindow(); the Prior map rows are from
  // docs/viewer.md. `1` marks the first keys a new operator needs.
  const KEYS = [
    ['Pool view', 'Left drag', 'orbit'],
    ['Pool view', 'Right / middle drag', 'pan (detaches Follow)'],
    ['Pool view', 'Scroll', 'zoom'],
    ['Pool view', '[F]', 'focus on the point under the cursor'],
    ['Pool view', 'Free camera', 'click for mouse look, WASD move, Space / Shift up / down, Ctrl fast, Esc release'],
    ['Pool view', 'Gizmo', 'drag an arrow to move, a ring to rotate; Esc during a drag restores the start'],
    ['Robot', '[Ctrl]+[P], then a move', 'a typed move, e.g. forward 2 (see Typed moves above); Enter sends it'],
    ['Robot', 'Drive with keys', 'W / S, A / D, Space / Shift, Q / E: one step a press; [ / ] step size; Esc stops'],
    ['Robot', '[Ctrl]+[P], Run <tree>', 'start an autonomy tree (robot enabled); Stop the tree from there too'],
    ['Robot', 'Enable / KILL', 'never from the keyboard: the button in the command bar'],
    ['Keys', '[Ctrl]+[P]', 'search: windows, layouts, themes, controls, trees; robot moves', 1],
    ['Keys', '[Ctrl]+[P], plot odom z', 'a field or Motion axis in a plot (Shift+Enter: the focused one)'],
    ['Keys', '[Ctrl]+[F]', 'Follow: keep the camera on the focus target', 1],
    ['Keys', '[Ctrl]+[M]', 'edit the prior map / done', 1],
    ['Keys', '[Ctrl]+[S]', 'save the prior map', 1],
    ['Keys', '[F12]', 'save a screenshot (Pictures/Nereus)', 1],
    ['Keys', '[Ctrl]+[Q]', 'quit (asks first if the prior map has unsaved edits)'],
    ['Keys', '[Ctrl]+[Space]', 'maximize the pool view / restore the layout'],
    ['Keys', '[Ctrl]+[Shift]+[1] / [2] / [3]', 'Standard / Wide view / Camera wall layout', 1],
    ['Keys', '[Ctrl]+[[] / [Ctrl]+[]]', 'snap the left / right panels shut, or bring them back'],
    ['Keys', '[F1]', 'controls and shortcuts', 1],
    ['Keys', '[F3]', 'frame-time stats'],
    ['Windows', 'Move', 'drag a tab onto a window to dock it (the arrows show where), beside it to split, away to float it'],
    ['Windows', 'Resize', 'drag the borders between windows'],
    ['Windows', 'Close / reopen', "a tab's x / the Windows menu"],
    ['Windows', 'Layouts', 'saved when the viewer closes; Layout > Save current as, Layout > Standard'],
    ['Windows', 'Pin', 'right-click a tab, or any control in a panel, to put it on the toolbar'],
    ['Windows', 'Toolbar', 'right-click it (or its +) to choose its buttons'],
    ['Windows', 'Look', 'View > Theme, View > Interface scale'],
    ['Prior map', '[←] [→] [↑] [↓] / [Shift]+arrows', 'nudge the selected prop 1 cm / 10 cm'],
    ['Prior map', '[PgUp] / [PgDn]', 'height'],
    ['Prior map', '[Q] / [E]', 'turn 1° (Shift: 15°)'],
    ['Prior map', '[L] / [H] / [Delete]', 'lock / hide / delete the selected prop'],
    ['Prior map', '[Ctrl]+[Z] / [Ctrl]+[Shift]+[Z]', 'undo / redo'],
  ];
  const GROUPS = ['First keys', 'Pool view', 'Robot', 'Keys', 'Windows', 'Prior map', 'All'];
  let group = 'First keys';
  const list = document.getElementById('keys-list');
  const find = document.getElementById('keys-find');
  const count = document.getElementById('keys-count');
  const gBox = document.getElementById('keys-groups');
  const gBtns = GROUPS.map((g) => {
    const b = h('button', 'btn', esc(g));
    b.type = 'button';
    b.addEventListener('click', () => { group = g; find.value = ''; render(); });
    gBox.append(b);
    return b;
  });
  function render() {
    const q = find.value.trim().toLowerCase();
    // a search looks through every key, whatever group is chosen
    const rows = KEYS.filter((k) => (q ? k.slice(0, 3).join(' ').replace(/[[\]]/g, '').toLowerCase().includes(q)
      : group === 'All' || (group === 'First keys' ? k[3] : k[0] === group)));
    gBtns.forEach((b, i) => b.setAttribute('aria-pressed', !q && GROUPS[i] === group));
    list.innerHTML = '';
    let g = '';
    for (const [grp, k, d] of rows) {
      if ((q || group === 'All') && grp !== g) { g = grp; list.append(h('div', 'vk-group', esc(grp))); }
      const r = h('div', 'vk-row');
      r.append(h('div', 'vk-key', esc(k).replace(/\[(.+?)\](?=\s|\+|,|$)/g, '<kbd>$1</kbd>')), h('div', 'vk-do', esc(d)));
      list.append(r);
    }
    if (!rows.length) list.append(h('div', 'vk-none', 'Nothing matches.'));
    count.textContent = q ? `${rows.length} of ${KEYS.length}` : `${rows.length} of ${KEYS.length} keys`;
  }
  find.addEventListener('input', render);
  render();
}

// ---------------------------------------------------------------- ROS wiring
(async () => {
  let data;
  try { data = await WIRING; } catch (e) { failed('wire-fig', e); return; }
  const groupsBox = document.getElementById('wire-groups');
  const select = document.getElementById('wire-select');
  const head = document.getElementById('wire-head');
  const list = document.getElementById('wire-list');
  const short = (n) => n.replace(/^\/talos\//, '');
  const btns = data.groups.map((g, i) => {
    const b = h('button', 'btn', esc(g.title));
    b.type = 'button';
    b.addEventListener('click', () => show(i));
    groupsBox.append(b);
    select.append(new Option(`${g.title} (${g.items.length})`, i));
    return b;
  });
  select.addEventListener('change', () => show(+select.value));
  function show(i) {
    btns.forEach((b, j) => b.setAttribute('aria-pressed', j === i));
    select.value = i;
    const g = data.groups[i];
    const outs = g.items.filter((x) => x.dir === 'out').length;
    head.innerHTML = `<b>${esc(g.title)}</b> · node <code>${esc(g.node)}</code> · ${outs} sent, ${g.items.length - outs} received`;
    list.innerHTML = '';
    g.items.forEach((it, j) => {
      const row = h('div', 'vw-row' + (it.dir === 'out' ? ' out' : ' in'));
      const verb = it.kind === 'topic' ? (it.dir === 'out' ? 'publishes' : 'subscribes') : it.kind === 'service' ? 'calls' : 'sends goals';
      const other = it.peers_note ? esc(it.peers_note)
        : it.peers.length ? it.peers.map((p) => `<code>${esc(short(p))}</code>`).join(' ') : '<span class="vw-none">none in sim</span>';
      const id = `vw-d-${i}-${j}`;
      row.innerHTML =
        `<button type="button" class="vw-sum" aria-expanded="false" aria-controls="${id}">` +
        `<span class="vw-dir" aria-label="${it.dir === 'out' ? 'sent by the viewer' : 'received by the viewer'}">${it.dir === 'out' ? '→' : '←'}</span>` +
        `<span class="vw-main"><code class="vw-name">${esc(short(it.name))}</code><span class="vw-note">${esc(it.note)}</span></span></button>` +
        `<div class="vw-more" id="${id}" hidden>` +
        `<div class="vw-meta"><span>${it.kind}, ${verb}</span><span>${esc(it.type)}</span>${it.rate ? `<span>${it.rate} Hz in sim</span>` : ''}${it.when ? `<span>${esc(it.when)}</span>` : ''}</div>` +
        `<div class="vw-peers"><span class="vw-lbl">Other side in sim</span> ${other}</div>` +
        (it.robot ? `<div class="vw-peers"><span class="vw-lbl">On the robot</span> ${esc(it.robot)}</div>` : '') +
        `</div>`;
      const sum = row.querySelector('.vw-sum'), more = row.querySelector('.vw-more');
      sum.addEventListener('click', () => { const on = sum.getAttribute('aria-expanded') !== 'true'; sum.setAttribute('aria-expanded', on); more.hidden = !on; row.classList.toggle('open', on); });
      list.append(row);
    });
  }
  show(0);
})();
