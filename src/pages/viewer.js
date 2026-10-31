import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/viewer.css';
import { parseMove, describe } from '../viz/viewer-move.js';

setup();

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const MEDIA = BASE + 'media/nereus/';
const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
// The two data files load in parallel; each figure waits only for its own, so one missing file breaks one figure.
const getJSON = (f) => fetch(BASE + 'data/viewer/' + f).then((r) => { if (!r.ok) throw new Error(`${f}: HTTP ${r.status}`); return r.json(); });
const COURSE = getJSON('course.json'), WIRING = getJSON('wiring.json');
const failed = (id, err) => {
  console.warn(err);
  document.getElementById(id).replaceChildren(h('p', 'vm-err', 'This figure could not load its data. Reload the page to try again.'));
};

// ---------------------------------------------------------------- the annotated tour
// Regions are in the 1600 x 1000 screenshots (viewer-startup-killed / viewer-tree-running share one layout).
// `dot` is where the number sits; `k` / `r` give the text for the "Just launched" and "Tree running" shots, and
// `lead` / `tail` the text both shots share (shown before / after it).
const TOUR = [
  { t: 'Menus', box: [0, 0, 330, 36], dot: [40, 18],
    k: `<p><b>File</b>: the prior map file, screenshots (<kbd>F12</kbd>), the settings and run-record folders. <b>View</b>: camera, focus, overlays, theme, interface scale and the pool. <b>Windows</b>: show any window, including Plots and Topics. <b>Layout</b>: Standard, Wide view, Camera wall and saved layouts. <b>Help</b>: the shortcuts (<kbd>F1</kbd>).</p><p>The viewer draws its own title bar: drag its empty part to move the window.</p>` },
  { t: 'Search', box: [590, 4, 422, 28], dot: [800, 18],
    k: `<p><kbd>Ctrl+P</kbd> searches everything the menus do, plus every button, switch and dropdown in every window, even closed ones. Type a few letters in order (<code>cwall</code> finds Camera wall).</p><p>It also takes typed moves (<code>forward 2</code>), <i>Run &lt;tree&gt;</i> and <code>plot odom z</code>. Enable and KILL are deliberately not in it.</p>` },
  { t: 'Enable / KILL', box: [0, 40, 420, 46], dot: [252, 62], ros: ['command/software_kill', 'state/kill'],
    k: `<p>Green <b>Enable</b>, "Robot: killed". The viewer has been reporting a kill on software-kill slot 1 every 50 ms since it opened, so Talos can't move until someone presses Enable.</p><p>The text after the button is the robot's own <code>state/kill</code>. With the hull switch out it stays "killed" even after Enable.</p>`,
    r: `<p>Red <b>KILL</b>, "Robot: enabled". The enable has latched: it holds if the viewer closes or the tether comes off.</p><p>One click asserts slot 1, sends the controller a Disabled command and stops the running tree. Untethered, only the physical switch kills.</p>` },
  { t: 'Status chips', box: [788, 44, 372, 36], dot: [975, 62], ros: ['gyro/status', 'dvl/bottom_lock', '/diagnostics_agg', 'state/battery'],
    k: `<p><b>FOG</b> temperature (amber at 55 °C, red at 75 °C), <b>DVL</b> bottom lock, <b>CPU</b> hottest core (70 / 85 °C), and the <b>PORT</b> and <b>STBD</b> batteries' charge (amber under 50 %, red under 20 %). Hover a chip for details.</p><p>Grey means no data. In sim only the DVL has a source, so it reads "Lock" and the rest stay grey.</p>` },
  { t: 'Run clock and points', box: [1165, 42, 172, 40], dot: [1250, 62],
    k: `<p>The scorecard's run timer, on sim time, and the points so far. They light amber while a run is on. Start a run from <i>Run tracking</i> in the toolbar.</p><p>Scoring only exists in sim.</p>` },
  { t: 'Edit map', box: [1342, 44, 78, 36], dot: [1380, 62],
    k: `<p>Opens the prior map editor (<kbd>Ctrl+M</kbd>) on riptide_mapping's <code>config.yaml</code>. The bar turns blue while you edit, and a running simulator pauses. <a href="#mapping">More below</a>.</p>` },
  { t: 'Pose source', box: [1422, 44, 168, 36], dot: [1505, 62],
    k: `<p>Where the drawn Talos comes from. <code>PHYSICS CONNECTED</code>: simulator truth, in sim. <code>ROBOT (ESTIMATE)</code>: the EKF's <code>map</code> → <code>talos/base_link</code> through TF, at the pool.</p>` },
  { t: 'Pool view toolbar', box: [405, 90, 696, 72], dot: [750, 125],
    k: `<p><b>Camera</b> (orbit, free, or look through ffc / dfc) and <b>Focus</b> (Vehicle, Course, a task, Claw, Payloads), <b>Follow</b>, then the overlays: <b>Labels</b>, <b>TF</b>, <b>MPC path</b>, <b>Covariance</b>, <b>Thrust</b>. Lit buttons are on.</p><p>Then windows: <b>Display</b>, <b>Scene</b>, <b>Simulation</b>, <b>Run tracking</b>, and <b>Sync sim</b>, pinned by default. <b>+</b> chooses what the toolbar shows.</p>` },
  { t: 'Pool view', box: [402, 168, 764, 802], dot: [780, 580], ros: ['/tf', 'controller/mpc/predicted_path', 'thruster_forces'],
    lead: `<p>The 3D pool: the course, Talos, and overlays. Left drag orbits, right or middle drag pans, scroll zooms, <kbd>F</kbd> focuses on the point under the cursor.</p>`,
    k: `<p>Here Talos sits at its start pose under the AprilTag board, killed and tilted (pitch −17.8°), seen from above with Follow on.</p>`,
    r: `<p>MPC path (the thin line) and Thrust (red arrows) are on: the MPC is pushing Talos toward the torpedo board for the tree.</p>` },
  { t: 'Motion', box: [0, 88, 400, 616], dot: [200, 340], ros: ['controller/linear', 'controller/angular', 'setTeleop'],
    k: `<p>"Ready / enable to control". The map-frame table shows the <b>Actual</b> pose and <code>--</code> for <b>Commanded</b>: nothing has been sent yet. Command and Dive in place wait for Enable.</p>`,
    r: `<p>"Autonomy owns motion": a tree is driving, so every input is greyed out. The table still compares <b>Actual</b> with the tree's <b>Commanded</b> setpoint: 0.74 m short in x on the way to the board.</p>`,
    tail: `<p>The buttons below the table: <a href="#motion">Driving</a>.</p>` },
  { t: 'Mapping, Vision, Autonomy', box: [0, 706, 400, 294], dot: [200, 850], ros: ['autonomy/run_tree', 'autonomy/list_trees', 'autonomy/tree_stack'],
    k: `<p>Three tabs. <b>Autonomy</b> is in front: "Ready", a tree picker, and Start greyed out until Motion is enabled. "None yet: start a tree to see its stack."</p>`,
    r: `<p><b>Autonomy</b>: "Running", <code>RepairCompMpcTree.xml</code>, Stop lit. The execution stack reads <code>MISSION</code> › <code>CompMissionTreeMpc</code> › <code>COMP</code> › <code>Torpedo/bin/table tasks</code>, outermost first.</p>`,
    tail: `<p><b>Mapping</b>: tag calibration, mapping target, lock and reset. <b>Vision</b>: detection markers and point clouds.</p>` },
  { t: 'Camera cards', box: [1168, 88, 432, 638], dot: [1385, 290], ros: ['ffc/zed_node/rgb/image_rect_color/compressed', 'dfc/zed_node/rgb/image_rect_color/compressed'],
    lead: `<p>Forward and downward cameras, ZED X Mini at 1920×1200. <b>RGB / Depth</b>, <b>Truth / ROS</b> and <b>Main view</b> (look through it in the pool view).</p>`,
    k: `<p>Both are on <b>Truth</b>, the viewer's own render from the true camera pose, which is why the forward card shows the tilted start view.</p>`,
    r: `<p>Both are on <b>ROS</b>: the images the stack receives, at 7.3 and 16.3 Hz on this busy desktop. The torpedo board fills the forward card.</p>` },
  { t: 'Course map and robot panels', box: [1168, 726, 432, 274], dot: [1385, 860], ros: ['command/actuator/*', 'state/actuator/status'],
    lead: `<p>Tabs: <b>Course map</b> (top-down, tap a task to focus it), <b>Recording</b>, <b>Bagging</b>, <b>Electrical</b>, <b>Actuators</b>.</p>`,
    k: `<p>Actuators is in front: "Actuators disarmed", claw and torpedo connected, and only <b>Arm actuators</b> available.</p>`,
    r: `<p>"Actuators armed": the tree armed them for the torpedo, so <b>Fire torpedo</b>, <b>Drop marker</b> and the claw buttons are live.</p>` },
  { t: 'Key strip', box: [402, 972, 764, 28], dot: [780, 985],
    k: `<p>A reminder of the mouse in the pool view. With <b>Drive with keys</b> on it shows the drive keys and the step size instead.</p>` },
];

{
  const fig = document.getElementById('tour-fig');
  const img = document.getElementById('tour-img');
  const dim = document.getElementById('tour-dim');
  const box = document.getElementById('tour-box');
  const dots = document.getElementById('tour-dots');
  const loupe = document.getElementById('tour-loupe');
  const title = document.getElementById('tour-title');
  const text = document.getElementById('tour-text');
  const count = document.getElementById('tour-count');
  const SRC = { killed: MEDIA + 'viewer-startup-killed.webp', running: MEDIA + 'viewer-tree-running.webp' };
  const ALT = {
    killed: img.alt,
    running: 'The same layout while a tree runs: red KILL and Robot: enabled, the Motion panel greyed out with Autonomy owns motion, the Autonomy tab Running RepairCompMpcTree.xml with its execution stack, Talos approaching the torpedo board with thrust arrows, the forward camera card full of the board, and Actuators armed.',
  };
  const pre = new Image(); pre.src = SRC.running; // warm the cache for the switch
  let state = 'killed', cur = 0;

  const buttons = TOUR.map((s, i) => {
    const b = h('button', 'vt-dot', String(i + 1));
    b.type = 'button';
    // Kept a dot's radius inside the image, so the corner ones aren't cut off.
    b.style.left = `clamp(0.9rem, ${s.dot[0] / 16}%, calc(100% - 0.9rem))`;
    b.style.top = `clamp(0.9rem, ${s.dot[1] / 10}%, calc(100% - 0.9rem))`;
    b.setAttribute('aria-label', `${i + 1}: ${s.t}`);
    b.addEventListener('click', () => show(i));
    dots.append(b);
    return b;
  });

  // On a phone the dots on the shot sit too close to tap reliably, so the same numbers also come as a row of chips.
  const chipBox = document.getElementById('tour-chips');
  const chips = TOUR.map((s, i) => {
    const b = h('button', 'vt-chip', String(i + 1));
    b.type = 'button';
    b.setAttribute('aria-label', `${i + 1}: ${s.t}`);
    b.addEventListener('click', () => show(i));
    chipBox.append(b);
    return b;
  });

  // The close-up: the part's box with some of the screenshot around it, so a thin strip (the command bar) reads in
  // context. The rest is dimmed and the box outlined, as on the screenshot.
  function drawLoupe() {
    const s = TOUR[cur];
    const [x, y, w, hh] = s.box;
    const W = loupe.clientWidth || 300;
    const H = Math.round(Math.min(230, Math.max(110, (W * hh) / w)));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    loupe.width = Math.round(W * dpr); loupe.height = Math.round(H * dpr);
    loupe.style.height = H + 'px';
    const c = loupe.getContext('2d');
    c.fillStyle = css('--ink'); c.fillRect(0, 0, loupe.width, loupe.height);
    if (!img.complete || !img.naturalWidth) return;
    // Source rectangle: the box plus a margin, grown to the loupe's aspect, kept inside the 1600 x 1000 shot.
    const aspect = loupe.width / loupe.height;
    let sw = w * 1.12 + 24, sh = hh * 1.12 + 24;
    if (sw / sh < aspect) sw = sh * aspect; else sh = sw / aspect;
    sw = Math.min(sw, 1600); sh = Math.min(sh, 1000);
    const sx = Math.max(0, Math.min(1600 - sw, x + w / 2 - sw / 2));
    const sy = Math.max(0, Math.min(1000 - sh, y + hh / 2 - sh / 2));
    const k = Math.min(loupe.width / sw, loupe.height / sh);
    const ox = (loupe.width - sw * k) / 2, oy = (loupe.height - sh * k) / 2;
    const sxImg = img.naturalWidth / 1600; // the switch can briefly show a different-size image
    c.imageSmoothingQuality = 'high';
    c.drawImage(img, sx * sxImg, sy * sxImg, sw * sxImg, sh * sxImg, ox, oy, sw * k, sh * k);
    const bx = ox + (x - sx) * k, by = oy + (y - sy) * k, bw = w * k, bh = hh * k;
    c.fillStyle = 'rgba(15, 38, 51, 0.45)';
    c.beginPath(); c.rect(0, 0, loupe.width, loupe.height); c.rect(bx, by, bw, bh); c.fill('evenodd');
    c.strokeStyle = css('--accent'); c.lineWidth = 2.5 * dpr;
    c.strokeRect(bx, by, bw, bh);
  }

  function show(i) {
    cur = (i + TOUR.length) % TOUR.length;
    const s = TOUR[cur];
    const [x, y, w, hh] = s.box;
    dim.setAttribute('d', `M0 0H1600V1000H0Z M${x} ${y}h${w}v${hh}h${-w}Z`);
    for (const [k, v] of Object.entries({ x, y, width: w, height: hh })) box.setAttribute(k, v);
    for (const list of [buttons, chips]) list.forEach((b, j) => { b.classList.toggle('on', j === cur); b.setAttribute('aria-pressed', j === cur); });
    title.textContent = `${cur + 1}. ${s.t}`;
    const ros = s.ros ? `<p class="vt-ros">ROS: ${s.ros.map((r) => `<code>${esc(r)}</code>`).join(', ')}</p>` : '';
    text.innerHTML = (s.lead || '') + (state === 'running' && s.r ? s.r : s.k) + (s.tail || '') + ros;
    count.textContent = `${cur + 1} / ${TOUR.length}`;
    drawLoupe();
  }

  document.getElementById('tour-prev').addEventListener('click', () => show(cur - 1));
  document.getElementById('tour-next').addEventListener('click', () => show(cur + 1));
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
  new ResizeObserver(drawLoupe).observe(loupe);
  show(0);
}

// ---------------------------------------------------------------- typed moves
(async () => {
  let course;
  try { course = await COURSE; } catch (e) { failed('move-fig', e); return; }
  const START = { p: [0.33, -0.11, -0.75], d: [0, 0, 2.63] }; // the startup screenshot's pose, after Dive in place
  let last = { p: [...START.p], d: [...START.d] };
  const trail = []; // poses already sent
  const input = document.getElementById('move-text');
  const read = document.getElementById('move-read');
  const host = document.getElementById('move-map');
  const EX = ['forward 2', 'turn right 45', 'turn left 45 forward 2', 'x 4 yaw 180', 'go 15.5 2.8 -1.4 0', 'down 0.5, level', 'left panels'];
  const exBox = document.getElementById('move-examples');
  for (const e of EX) {
    const b = h('button', 'btn', `<code>${esc(e)}</code>`);
    b.type = 'button';
    b.addEventListener('click', () => { input.value = e; update(); });
    exBox.append(b);
  }
  const NAMES = { gate: 'gate', slalom_parent: 'slalom', torpedo: 'torpedo', bin: 'bins', pre_torpedo_pose: 'pre-torpedo', pre_bin_pose: 'pre-bin', pre_return_home: 'pre-home' };
  document.getElementById('move-legend').innerHTML =
    `<span><i style="background:${css('--state')}"></i>last command</span><span><i style="background:${css('--reference')}"></i>new target</span><span><i class="dash" style="color:${css('--muted')}"></i>sent before</span><span><i style="background:${css('--ink-2')}"></i>prior-map props</span>`;

  // Map frame: x to the right, y up. Fit the course plus wherever the moves go.
  function bounds(points) {
    let x0 = -2, x1 = 23, y0 = -5.5, y1 = 13.5; // x1 leaves room for the torpedo board label
    for (const [x, y] of points) { x0 = Math.min(x0, x - 1); x1 = Math.max(x1, x + 1); y0 = Math.min(y0, y - 1); y1 = Math.max(y1, y + 1); }
    return [x0, x1, y0, y1];
  }

  function arrow(g, p, yawDeg, color, size, opacity = 1) {
    const a = (yawDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const pt = (fx, fy) => [p[0] + (fx * c - fy * s) * size, p[1] + (fx * s + fy * c) * size];
    const pts = [pt(1, 0), pt(-0.6, 0.55), pt(-0.3, 0), pt(-0.6, -0.55)];
    g.append(svgEl('path', { d: 'M' + pts.map((q) => q.join(' ')).join('L') + 'Z', fill: color, 'fill-opacity': opacity, stroke: css('--paper'), 'stroke-width': 0.08 }));
  }

  function draw(cmd) {
    const pts = [last.p, ...trail.map((t) => t.p), ...(cmd ? cmd.steps.map((s) => s.target.p) : [])];
    const [x0, x1, y0, y1] = bounds(pts);
    const W = x1 - x0, H = y1 - y0;
    const svg = svgEl('svg', { viewBox: `${x0} ${-y1} ${W} ${H}`, class: 'vm-svg', role: 'img', 'aria-label': 'Top-down map of the course in the map frame with the last command and the new target' });
    const g = svgEl('g', { transform: 'scale(1,-1)' });
    svg.append(g);
    // grid every metre, heavier every 5
    for (let x = Math.ceil(x0); x <= x1; x++) g.append(svgEl('line', { x1: x, x2: x, y1: y0, y2: y1, stroke: x % 5 ? css('--grid') : css('--rule'), 'stroke-width': x === 0 ? 0.08 : 0.03 }));
    for (let y = Math.ceil(y0); y <= y1; y++) g.append(svgEl('line', { y1: y, y2: y, x1: x0, x2: x1, stroke: y % 5 ? css('--grid') : css('--rule'), 'stroke-width': y === 0 ? 0.08 : 0.03 }));
    const label = (x, y, t, cls, anchor = 'start') => { const e = svgEl('text', { x, y: -y, class: cls, 'text-anchor': anchor }); e.textContent = t; svg.append(e); };
    for (let x = Math.ceil(x0 / 5) * 5; x <= x1; x += 5) label(x + 0.15, y0 + 0.3, `x ${x}`, 'vm-axis');
    for (let y = Math.ceil(y0 / 5) * 5; y <= y1; y += 5) if (y !== Math.ceil(y0 / 5) * 5) label(x0 + 0.2, y + 0.15, `y ${y}`, 'vm-axis');
    // props
    for (const o of course.props) {
      const big = !o.name.startsWith('pre_');
      g.append(svgEl('circle', { cx: o.x, cy: o.y, r: big ? 0.28 : 0.16, fill: big ? css('--ink-2') : 'none', stroke: css('--ink-2'), 'stroke-width': 0.06 }));
      const a = (o.yaw * Math.PI) / 180;
      if (big) g.append(svgEl('line', { x1: o.x, y1: o.y, x2: o.x + Math.cos(a) * 0.7, y2: o.y + Math.sin(a) * 0.7, stroke: css('--ink-2'), 'stroke-width': 0.07 }));
      if (big) label(o.x + 0.4, o.y - 0.15, NAMES[o.name] || o.name, 'vm-prop');
      else label(o.x - 0.32, o.y - 0.15, NAMES[o.name] || o.name, 'vm-prop small', 'end');
    }
    // earlier sends
    const path = [START.p, ...trail.map((t) => t.p)];
    if (path.length > 1) g.append(svgEl('polyline', { points: path.map((p) => `${p[0]},${p[1]}`).join(' '), fill: 'none', stroke: css('--muted'), 'stroke-width': 0.07, 'stroke-dasharray': '0.25 0.18' }));
    // this move, step by step
    if (cmd) {
      const ps = [last.p, ...cmd.steps.map((s) => s.target.p)];
      g.append(svgEl('polyline', { points: ps.map((p) => `${p[0]},${p[1]}`).join(' '), fill: 'none', stroke: css('--reference'), 'stroke-width': 0.1 }));
      cmd.steps.forEach((s, i) => { if (i < cmd.steps.length - 1) g.append(svgEl('circle', { cx: s.target.p[0], cy: s.target.p[1], r: 0.12, fill: css('--reference') })); });
    }
    arrow(g, last.p, last.d[2], css('--state'), 0.75);
    if (cmd) arrow(g, cmd.target.p, cmd.target.d[2], css('--reference'), 0.75, 0.95);
    host.replaceChildren(svg);
  }

  let current = null;
  function update() {
    const r = parseMove(input.value, last);
    current = r.command;
    const from = `<span class="vm-from">From the last command: ${esc(describe(last))}</span>`;
    if (!r.isMove) read.innerHTML = `<span class="vm-err">Not a move: the first word must be forward / back / left / right / up / down, turn, x / y / z, roll / pitch / yaw, go or level. In the viewer this text would search windows and controls instead.</span>${from}`;
    else if (!r.command) read.innerHTML = `<span class="vm-err">${esc(r.error)}</span>${from}`;
    else read.innerHTML = `<span class="vm-said">${esc(r.command.summary)}</span><span class="vm-to">→ ${esc(describe(r.command.target))}</span>${from}`;
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
  update();
})();

// ---------------------------------------------------------------- run video chapters
{
  const v = document.getElementById('run-video');
  const box = document.getElementById('run-chapters');
  // Seconds into tree-run-behind.mp4 where its burned-in task label changes (read off the video at 1 s steps).
  const CH = [['Kill switch, dive', 0], ['Gate', 1], ['Slalom', 5], ['Pinger', 11], ['Torpedo', 17], ['Hit', 22], ['Table', 23], ['Pill grasped', 38]];
  for (const [t, s] of CH) {
    const b = h('button', 'btn', esc(t));
    b.type = 'button';
    b.addEventListener('click', () => { v.currentTime = s; v.play().catch(() => {}); });
    box.append(b);
  }
}

// ---------------------------------------------------------------- shortcuts (the viewer's F1 window)
{
  // Keys in [brackets] are drawn as key caps. Rows as in app.cpp drawHelpWindow(); the Prior map rows are from docs/viewer.md.
  const KEYS = [
    ['Pool view', 'Left drag', 'orbit'],
    ['Pool view', 'Right / middle drag', 'pan (detaches Follow)'],
    ['Pool view', 'Scroll', 'zoom'],
    ['Pool view', '[F]', 'focus on the point under the cursor'],
    ['Pool view', 'Free camera', 'click for mouse look, WASD move, Space / Shift up / down, Ctrl fast, Esc release'],
    ['Pool view', 'Gizmo', 'drag an arrow to move, a ring to rotate; Esc during a drag restores the start'],
    ['Robot', '[Ctrl]+[P], then a move', 'forward / back / left / right / up / down 0.5 (meters, along the heading), turn 30 (left positive), x / y / z -1.5, roll / pitch / yaw 90, go 2 1 -1.5 90, level; several in a row; Enter sends it'],
    ['Robot', 'Drive with keys', 'Ctrl+P or the Motion panel (Position control): W / S forward / back, A / D left / right, Space / Shift up / down, Q / E turn: one step a press; [ / ] step size; Esc stops'],
    ['Robot', '[Ctrl]+[P], Run <tree>', 'start an autonomy tree (robot enabled); Stop the tree from there too'],
    ['Robot', 'Enable / KILL', 'never from the keyboard: the button in the command bar'],
    ['Shortcuts', '[Ctrl]+[P]', 'search: windows, layouts, themes, controls, trees; robot moves'],
    ['Shortcuts', '[Ctrl]+[P], plot odom z', 'a field or Motion axis in a plot (Shift+Enter: the focused one)'],
    ['Shortcuts', '[Ctrl]+[F]', 'Follow: keep the camera on the focus target'],
    ['Shortcuts', '[Ctrl]+[M]', 'edit the prior map / done'],
    ['Shortcuts', '[Ctrl]+[S]', 'save the prior map'],
    ['Shortcuts', '[F12]', 'save a screenshot (Pictures/Nereus)'],
    ['Shortcuts', '[Ctrl]+[Q]', 'quit (asks first if the prior map has unsaved edits)'],
    ['Shortcuts', '[Ctrl]+[Space]', 'maximize the pool view / restore the layout'],
    ['Shortcuts', '[Ctrl]+[Shift]+[1] / [2] / [3]', 'Standard / Wide view / Camera wall layout'],
    ['Shortcuts', '[Ctrl]+[[] / [Ctrl]+[]]', 'snap the left / right panels shut, or bring them back'],
    ['Shortcuts', '[F1]', 'controls and shortcuts'],
    ['Shortcuts', '[F3]', 'frame-time stats'],
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
  const list = document.getElementById('keys-list');
  const find = document.getElementById('keys-find');
  const count = document.getElementById('keys-count');
  function render() {
    const q = find.value.trim().toLowerCase();
    const rows = KEYS.filter((k) => !q || k.join(' ').replace(/[[\]]/g, '').toLowerCase().includes(q));
    list.innerHTML = '';
    let group = '';
    for (const [g, k, d] of rows) {
      if (g !== group) { group = g; list.append(h('div', 'vk-group', esc(g))); }
      const r = h('div', 'vk-row');
      r.append(h('div', 'vk-key', esc(k).replace(/\[(.+?)\](?=\s|\+|,|$)/g, '<kbd>$1</kbd>')), h('div', 'vk-do', esc(d)));
      list.append(r);
    }
    if (!rows.length) list.append(h('div', 'vk-none', 'Nothing matches.'));
    count.textContent = q ? `${rows.length} of ${KEYS.length}` : `${KEYS.length} shortcuts`;
  }
  find.addEventListener('input', render);
  render();
}

// ---------------------------------------------------------------- ROS wiring
(async () => {
  let data;
  try { data = await WIRING; } catch (e) { failed('wire-fig', e); return; }
  const groupsBox = document.getElementById('wire-groups');
  const head = document.getElementById('wire-head');
  const list = document.getElementById('wire-list');
  const KIND = { topic: 'topic', service: 'service', action: 'action' };
  const short = (n) => n.replace(/^\/talos\//, '');
  const peerName = (p) => p.replace(/^\/talos\//, '');
  let cur = 0;
  const btns = data.groups.map((g, i) => {
    const b = h('button', 'btn', esc(g.title));
    b.type = 'button';
    b.addEventListener('click', () => show(i));
    groupsBox.append(b);
    return b;
  });
  function show(i) {
    cur = i;
    btns.forEach((b, j) => b.setAttribute('aria-pressed', j === i));
    const g = data.groups[i];
    const outs = g.items.filter((x) => x.dir === 'out').length;
    head.innerHTML = `<b>${esc(g.title)}</b> · node <code>${esc(g.node)}</code> · ${outs} sent, ${g.items.length - outs} received`;
    list.innerHTML = '';
    for (const it of g.items) {
      const row = h('div', 'vw-row' + (it.dir === 'out' ? ' out' : ' in'));
      const verb = it.kind === 'topic' ? (it.dir === 'out' ? 'publishes' : 'subscribes') : it.kind === 'service' ? 'calls' : 'sends goals';
      const other = it.peers_note ? esc(it.peers_note)
        : it.peers.length ? it.peers.map((p) => `<code>${esc(peerName(p))}</code>`).join(' ') : '<span class="vw-none">none in sim</span>';
      const rate = it.rate ? `${it.rate} Hz in sim` : '';
      row.innerHTML =
        `<div class="vw-dir" aria-label="${it.dir === 'out' ? 'sent by the viewer' : 'received by the viewer'}">${it.dir === 'out' ? '→' : '←'}</div>` +
        `<div class="vw-body"><div class="vw-name"><code>${esc(short(it.name))}</code> <span class="vw-kind">${KIND[it.kind]}, ${verb}</span></div>` +
        `<div class="vw-note">${esc(it.note)}${it.when ? ` <i>(${esc(it.when)})</i>` : ''}</div>` +
        `<div class="vw-meta"><span>${esc(it.type)}</span>${rate ? `<span>${rate}</span>` : ''}</div>` +
        `<div class="vw-peers"><span class="vw-lbl">Other side in sim</span> ${other}</div>` +
        (it.robot ? `<div class="vw-peers"><span class="vw-lbl">On the robot</span> ${esc(it.robot)}</div>` : '') +
        `</div>`;
      list.append(row);
    }
  }
  show(0);
})();
