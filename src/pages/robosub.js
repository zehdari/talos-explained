import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/robosub.css';

setup();

const BASE = import.meta.env.BASE_URL;
const IMG = (f) => `${BASE}img/robosub/${f}`;
const GH = 'https://github.com/osu-uwrt';
const TREE_URL = `${GH}/riptide_autonomy/blob/autonomy-mapping/trees/RepairCompMpcTree.xml`;
const SVGNS = 'http://www.w3.org/2000/svg';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const fmt = (n) => n.toLocaleString('en-US').replace(/,/g, ' ');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
function h(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (html) e.innerHTML = html;
  return e;
}

// ---------------------------------------------------------------- the season
{
  const weeks = [
    ['1 Dec – 1 Apr', 'Registration', 'Online.'],
    ['27 May', 'Design documents due', 'TDR, website and team video; vehicle information.'],
    ['24 Jun', 'Prequalification deadline', 'An unbroken video of one autonomous run, submitted online.'],
    ['11 Jul', 'Check-in', 'Team check-in and orientation. A vehicle needs a safety inspection before its first time in the pool.'],
    ['12–13 Jul', 'Practice and qualifying', 'Practice slots, qualifying runs, design presentations and system assessments.'],
    ['14–15 Jul', 'Semi-finals', 'One 20-minute slot each day, on two different courses. Last run counts.'],
    ['16 Jul', 'Finals and awards', 'Top teams only, scores reset. Best run counts.'],
  ];
  const ol = document.getElementById('week');
  for (const [d, t, x] of weeks) ol.appendChild(h('li', {}, `<span class="d">${d}</span><span class="t"><b>${t}.</b> ${x}</span>`));
}

// ---------------------------------------------------------------- course data + tasks
const data = await fetch(`${BASE}data/robosub/course.json`).then((r) => r.json());
const P = data.points;
const L = data.tree_lines;
const tl = (id, label = id, wrap = false) => `<a href="${TREE_URL}#L${L[id]}"><code>${wrap ? label.replace(/(?<=[a-z])(?=[A-Z])/g, '<wbr>') : label}</code></a>`;
document.getElementById('tree-len').textContent = fmt(Math.round(data.tree_length / 100) * 100);

// Run phases, plus the start (from the tree's first log line to the gate).
const phases = [['Start', data.run.start_t, data.run.phases[0][1]], ...data.run.phases];
const PHASE_COLOR = {
  Start: '--muted', Gate: '--state', Slalom: '--s8', Pinger: '--ink', Torpedo: '--s7',
  Table: '--prediction', Bins: '--s4', Magnets: '--s5', Home: '--s6',
};
const t0 = phases[0][1];

const TASKS = [
  {
    id: 'start', chip: 'Start', title: 'Heading out', phases: ['Start'],
    rules: [
      'Start on the surface in the start zone and submerge before leaving it.',
      'Optional coin flip for points: heads, the vehicle starts roughly parallel to the gate; tails, with its tail toward the gate.',
    ],
    points: [['Heading coin flip (scored with the gate)', P.heading]],
    talos: [
      `${tl('WaitForKillSwitch')} waits until the kill switch is in (<code>state/kill</code> false), then 5 s. ${tl('PrepForRun')} locks the map and disarms the actuators; ${tl('Dive')} goes down in place to 0.56 m holding the starting heading.`,
      'Before the run, the AprilTag board on the wall sets where the <code>map</code> frame is. Every later move is a position in that map, so the tree itself does not care which way Talos starts facing.',
    ],
    read: [['commanding.html', 'Commanding Talos'], ['perception/frames.html', 'Frames, targets and the mission tree'], ['pool-test.html', 'Pool test day']],
  },
  {
    id: 'gate', chip: 'Gate', title: 'Task 1 · Begin Assessment (gate)', phases: ['Gate'],
    rules: [
      'A 3 m wide PVC gate floats just under the surface, with red and black legs and a red divider down the middle.',
      'One half carries the Survey &amp; Repair images (compass, hammer and wrench), the other Search &amp; Rescue (buoy, SOS). The half you pass under is your role for the rest of the run.',
      'Pass cleanly: touching the legs costs points, touching the divider is fine. Extra "style" points for each 90° of roll, pitch or yaw while passing.',
    ],
    points: [['Pass through', P.gate], ['Maintain control (judges)', 150], ['Heading coin flip', P.heading], ['Role coin flip, if you take the flipped role', P.role],
      [`Style: per 90°, roll or pitch ${P.style_rp}, yaw ${P.style_yaw}, ${P.max_style_quarters} at most`, P.style_rp * P.max_style_quarters]],
    camera: 'ffc', mech: 'none',
    talos: [
      `${tl('GateTreeMpc')} flies a path to 1 m in front of the <code>gate_repair</code> half and into it, 1.1 m below that frame, tries the flip, then a second short path 1 m out the back.`,
      'Its camera searches are switched off (an <code>AlwaysFailure</code>): the gate is flown from its prior position in the map.',
      'It works out which side of the repair half the rescue half is on, and passes that to the slalom as <code>sla_pass_on_left</code>.',
      `The flip is ${tl('FlipTree')}, for style points, but under the MPC it fails (it can't set the stunt safe mode) and the tree carries on.`,
    ],
    read: [['perception/frames.html', 'Frames, targets and the mission tree'], ['control/reference.html', 'Where to go: profiles and paths'], ['mission-tree.html', 'The competition mission']],
    img: ['viewer_gate.webp', 'Talos at the gate in the Nereus viewer: the repair half (compass, hammer and wrench) on the left, the rescue half (SOS, buoy) on the right.'],
  },
  {
    id: 'slalom', chip: 'Slalom', title: 'Task 2 · Avoid Debris (slalom)', phases: ['Slalom'],
    rules: [
      'Three rows of vertical pipes, white, red, white, about 0.9 m tall and moored at different heights.',
      'Pass each row on the same side of the red pipe as you passed the gate divider, and within the height of the pipes.',
    ],
    points: [[`Each row: same side ${P.slalom_same}, other side ${P.slalom_other}`, 3 * P.slalom_same], [`Each row: within the pipes' height, +${P.slalom_depth}`, 3 * P.slalom_depth]],
    camera: 'ffc', mech: 'none',
    talos: [
      `${tl('SlalomPathMpc')} parks in front of the slalom and lets mapping refine <code>slalom_parent</code> from the forward camera's <code>slalom</code> detections (the red pipe).`,
      'Then it locks the map and flies one path through all three rows, offset to the side the gate chose, and straight on toward the torpedo.',
    ],
    read: [['perception/detector.html', 'The detector, frame by frame'], ['perception/map.html', 'The course map'], ['control/reference.html', 'Where to go: profiles and paths']],
    img: ['cam_slalom.webp', "The forward camera at the slalom in Nereus, with YOLO's mask on the red pipe."],
  },
  {
    id: 'pinger', chip: 'Pinger', title: 'The random pinger', phases: ['Pinger'],
    rules: [
      'An acoustic pinger (25–40 kHz) sits at the torpedo board and another at the octagon; only one is on at a time. They earn no points by themselves.',
      'The team can ask for a random one. Scoring at the task it marks earns a bonus; the team can then ask to switch, and scoring at the other task earns a bigger one.',
    ],
    points: [['First pinger task scored', P.pinger_first], ['Second pinger task scored', P.pinger_second]],
    camera: 'none', mech: 'acoustics',
    talos: [
      `${tl('RandomPingerTree')} stops at <code>pre_torpedo_pose</code> and listens for 10 s, then at <code>pre_table_pose</code> for another 10 s.`,
      `<a href="${GH}/riptide_core/blob/followpath-speed/riptide_acoustics/src/Acoustics.cpp"><code>riptide_acoustics</code></a> compares the loudest amplitude at the pinger frequency (streamed by the IVC board) in the two windows, falling back to the average when the peaks are within 1000 of each other (<a href="${GH}/riptide_core/blob/followpath-speed/riptide_acoustics/launch/acoustics.launch.py">launch default</a> <code>mode:=max</code>). It publishes <code>buffer_0_closer</code>: no direction finding, just "was the first stop louder".`,
      'The tree stores that as <code>is_table</code>: true (first stop, <code>pre_torpedo</code>, louder) means table first. That looks backwards against the rule, which rewards going first to the task the active pinger marks; see the note under <a href="#tree">One tree for the whole run</a>.',
      'Nereus has no acoustics yet: no answer arrived, the 3 s timeout posted false, and Talos went to the torpedo first.',
    ],
    read: [['boards.html', 'The circuit boards'], ['sensors.html', 'Navigation sensors'], ['mission-tree.html', 'The competition mission']],
  },
  {
    id: 'torpedo', chip: 'Torpedo', title: 'Task 4 · Deploy (torpedoes)', phases: ['Torpedo'],
    rules: [
      'A 0.6 m square board with images for both roles and two sizes of opening for each.',
      'Up to two torpedoes. Most points for your role\'s large opening (fire) then its small one (fire engine). More for firing from farther away: 0.3 m and 0.46 m.',
    ],
    points: [['Each torpedo through an opening, 2 at most', 2 * P.torpedo], ['Large then small, both your role', P.sequence], [`Each fired from ≥ ${P.distance_far_m.toFixed(2)} m (≥ ${P.distance_near_m.toFixed(2)} m: ${P.distance_near})`, 2 * P.distance_far]],
    camera: 'ffc', mech: '2 torpedoes',
    talos: [
      `${tl('TorpedoTreeMpc')} paths to <code>pre_torpedo_pose</code> facing the board, then sweeps until mapping has the board within about 4 cm.`,
      `${tl('ShootBothObjectsMpc')} maps <code>fire_hole_large</code> and <code>fire_hole_small</code> together, holds 1.5 m off until both are within about 2 cm, lines torpedo 1 up on the large hole at 1.1 m then 0.6 m, fires, slides across to the small hole and fires torpedo 2.`,
      '0.6 m from the hole is past the 0.46 m line for the larger distance bonus.',
    ],
    read: [['actuators.html', 'Torpedoes, dropper and claw'], ['perception/composites.html', 'Props made of several pieces'], ['perception/tracking.html', 'Tracking one object']],
    img: ['cam_torpedo.webp', "The forward camera at the board: the detector finds the openings ('circle') and the role images."],
  },
  {
    id: 'table', chip: 'Octagon', title: 'Task 5 · Restore (octagon and table)', phases: ['Table'],
    rules: [
      'A 2.7 m PVC octagon floats on the surface. Images hang inside it: compass, hammer and wrench, buoy, SOS. You may surface inside it and dive again.',
      'Below it is a table with two items per role and two baskets: warning (Survey &amp; Repair) and helmet (Search &amp; Rescue).',
      'Points for surfacing inside, surfacing while holding an item, releasing items, putting them in baskets, turning once per item in the baskets, and facing the right image: the first image of your role for one item, the second for two or more.',
    ],
    points: [['Surface inside the octagon', P.surface], [`Face an image: any ${P.facing_other}, your role ${P.facing_correct}, right for the count`, P.facing_count],
      ['Surface holding each object (4)', 4 * P.object_surface], ['Release each object (4)', 4 * P.object_drop],
      [`Each object in a basket: any ${P.basket_other}, its own (4)`, 4 * P.basket_correct], [`Turns = objects in baskets (off by one: ${P.basket_count_near})`, P.basket_count]],
    camera: 'dfc', mech: 'claw',
    talos: [
      `${tl('NewTableTreeMpc')} switches to the downward camera, finds the helmet and warning baskets, and fits the table to them if both are tight.`,
      `Then four times: ${tl('pickupObjectMpc', 'pickup')} (hover over the item, lock the map, close the claw), ${tl('SurfaceTree')} (rise inside the octagon holding it), ${tl('dropObjectMpc', 'drop')} into its basket. Bandage and pill go to the helmet basket, nut and bolt and plug to the warning basket.`,
      `Finally ${tl('SpinTreeMpc')} turns once per item sorted and surfaces facing the hammer and wrench.`,
    ],
    read: [['actuators.html', 'Torpedoes, dropper and claw'], ['cameras.html', 'The cameras'], ['perception/frames.html', 'Frames, targets and the mission tree']],
    img: ['viewer_octagon.webp', 'Talos inside the octagon over the table in Nereus.'],
    img2: ['cam_table.webp', 'What the downward camera sees: baskets and items, each a class.'],
  },
  {
    id: 'bins', chip: 'Bins', title: 'Task 3 · Recon (bins and lights)', phases: ['Bins', 'Magnets'],
    rules: [
      'A PVC pipeline on the pool floor with four bins: two marked fire (Survey &amp; Repair), two blood (Search &amp; Rescue).',
      'Drop up to two markers. Most points for one in each of your role\'s two bins.',
      'A light with a magnetic sensor sits near each bin and is on at the start. Bring a magnet close to a sensor to turn its light off; up to two score (Nereus models two).',
    ],
    points: [['Each marker in any bin (2)', 2 * P.bin], ['Each in a different bin of your role, +' + P.bin_class, 2 * P.bin_class], ['Each light turned off (2)', P.light * P.max_lights]],
    camera: 'dfc, then ffc', mech: '2 markers, magnet',
    talos: [
      `${tl('BinTreeMpc')} uses the downward camera. The two fire bins look identical, so mapping's binary classifier splits fire detections into <code>bin_target1</code> and <code>bin_target2</code>; Talos hovers over each and drops one marker.`,
      `${tl('MagnetTreeMpc')} then fits the bins' CAD layout to the two vinyls, switches to the forward camera, and for each light lines up with its back to it (the magnet sits at the rear of Talos) and backs straight in (${tl('ActivateMagnetMpc')}).`,
    ],
    read: [['actuators.html', 'Torpedoes, dropper and claw'], ['perception/frames.html', 'Frames, targets and the mission tree'], ['cameras.html', 'The cameras']],
    img: ['cam_bins.webp', 'The downward camera over a fire bin; the red ring on the left is a magnet light.'],
    img2: ['viewer_bins.webp', 'The bins in the Nereus viewer, with a light (red) on the pipeline.'],
  },
  {
    id: 'home', chip: 'Home', title: 'Task 6 · Return home', phases: ['Home'],
    rules: ['At the end of the run, still underwater, pass back through the start gate.'],
    points: [['Back through the gate, fully submerged', P.home]],
    camera: 'none', mech: 'none',
    talos: [
      `One path (<a href="${TREE_URL}#L${L._home_path}">in CompMissionTreeMpc</a>): back up from the bins, to <code>pre_return_home</code>, then 1 m before the gate, through it and 1 m past, all under the gate. Then the controller is stopped.`,
      'There is no camera check: by now mapping has moved the whole course to fit what Talos saw, so the gate goes with it.',
    ],
    read: [['perception/map.html', 'The course map'], ['localization.html', 'Where am I? State estimation']],
    img: ['viewer_home.webp', 'Heading home: the gate seen from behind near the end of the Nereus run.'],
  },
];
const byId = Object.fromEntries(TASKS.map((t) => [t.id, t]));
const phaseTask = {};
for (const t of TASKS) for (const p of t.phases) phaseTask[p] = t.id;

// ---------------------------------------------------------------- the course map
const map = (() => {
  const host = document.getElementById('course-map');
  const [vx0, vy0, vx1raw, vy1] = data.view;
  const poolX = Math.max(...data.pool.corners.map((c) => c[0]));
  const vx1 = Math.max(vx1raw, poolX + 0.9);
  const W = vx1 - vx0, H = vy1 - vy0;
  const svg = svgEl('svg', { viewBox: `${vx0} ${-vy1} ${W} ${H}`, class: 'rs-svg', role: 'img', 'aria-label': 'Top-down map of the RoboSub 2026 course' }, host);
  const P2 = ([x, y]) => `${x},${-y}`;
  const pts = (a) => a.map(P2).join(' ');
  const layers = {};
  for (const k of ['pool', 'path', 'props', 'way', 'labels', 'hit']) layers[k] = svgEl('g', { class: `l-${k}` }, svg);
  // Text lives in a group scaled down by TS so its font size is not a tiny number (Chrome garbles glyph spacing
  // for font sizes well under 1 user unit).
  const TS = 20;
  const textG = svgEl('g', { transform: `scale(${1 / TS})` }, layers.labels);

  // pool, deck, lanes
  svgEl('rect', { x: vx0, y: -vy1, width: W, height: H, class: 'deck' }, layers.pool);
  svgEl('polygon', { points: pts(data.pool.corners), class: 'water' }, layers.pool);
  for (const [a, b] of data.lanes) svgEl('line', { x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], class: 'lane', 'stroke-width': data.lane_width_m }, layers.pool);
  svgEl('polygon', { points: pts(data.pool.corners), class: 'wall' }, layers.pool);
  // tag board on the wall at the map origin, and the map axes
  svgEl('rect', { x: -0.06, y: -0.45, width: 0.12, height: 0.9, class: 'tagboard' }, layers.pool);
  const ax = svgEl('g', { class: 'axes' }, layers.pool);
  svgEl('line', { x1: 0, y1: 0, x2: 1.6, y2: 0, 'marker-end': 'url(#rs-arrow)' }, ax);
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: -1.6, 'marker-end': 'url(#rs-arrow)' }, ax);
  const defs = svgEl('defs', {}, svg);
  const mk = svgEl('marker', { id: 'rs-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse' }, defs);
  svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--ink-2)' }, mk);

  const groups = {};
  const G = (id) => (groups[id] ||= svgEl('g', { class: `task t-${id}` }, layers.props));
  const T = data.tasks;
  // gate
  {
    const g = G('gate');
    const [a, b] = T.gate.posts;
    svgEl('line', { x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], class: 'gate-bar' }, g);
    for (const p of T.gate.posts) svgEl('circle', { cx: p[0], cy: -p[1], r: 0.14, class: 'gate-post' }, g);
    svgEl('circle', { cx: T.gate.divider[0], cy: -T.gate.divider[1], r: 0.1, class: 'red' }, g);
    for (const [k, p] of Object.entries(T.gate.halves)) {
      // half markers drawn on the approach side
      const c = T.gate.center, ap = T.gate.approach;
      const dx = (ap[0] - c[0]) / 1.5 * 0.45, dy = (ap[1] - c[1]) / 1.5 * 0.45;
      svgEl('rect', { x: p[0] + dx - 0.18, y: -(p[1] + dy) - 0.18, width: 0.36, height: 0.36, rx: 0.06, class: `half ${k}` }, g);
    }
  }
  // slalom
  {
    const g = G('slalom');
    for (const r of T.slalom.rows) {
      svgEl('polyline', { points: pts(r.poles), class: 'row' }, g);
      r.poles.forEach((p, i) => svgEl('circle', { cx: p[0], cy: -p[1], r: 0.13, class: i === 1 ? 'pole red' : 'pole white' }, g));
    }
  }
  // torpedo
  {
    const g = G('torpedo');
    const [a, b] = T.torpedo.board;
    svgEl('line', { x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], class: 'board' }, g);
    const c = T.torpedo.center, f = T.torpedo.face;
    svgEl('line', { x1: c[0], y1: -c[1], x2: c[0] + (f[0] - c[0]) * 0.5, y2: -(c[1] + (f[1] - c[1]) * 0.5), class: 'face' }, g);
  }
  // bins
  {
    const g = G('bins');
    const s = T.bins.crate_m, yaw = T.bins.yaw;
    for (const c of T.bins.crates) svgEl('rect', { x: c.p[0] - s / 2, y: -c.p[1] - s / 2, width: s, height: s, class: `crate ${c.class}`, transform: `rotate(${-yaw} ${c.p[0]} ${-c.p[1]})` }, g);
    for (const l of T.bins.lights) svgEl('circle', { cx: l.p[0], cy: -l.p[1], r: 0.12, class: 'light' }, g);
  }
  // octagon + table
  {
    const g = G('table');
    svgEl('polygon', { points: pts(T.surface.octagon), class: 'octagon' }, g);
    svgEl('polygon', { points: pts(T.table.slab), class: 'table' }, g);
    for (const [k, b] of Object.entries(T.table.baskets)) svgEl('polygon', { points: pts(b), class: `basket ${k}` }, g);
    for (const p of T.table.props) svgEl('circle', { cx: p.p[0], cy: -p.p[1], r: 0.045, class: `item ${p.basket}` }, g);
    for (const p of Object.values(T.surface.signs)) svgEl('circle', { cx: p[0], cy: -p[1], r: 0.1, class: 'sign' }, g);
  }
  // start
  {
    const g = G('start');
    svgEl('circle', { cx: data.start[0], cy: -data.start[1], r: 0.45, class: 'start' }, g);
  }

  // waypoints
  const wpG = svgEl('g', { class: 'waypoints' }, layers.way);
  const wpEls = {};
  for (const [k, p] of Object.entries(data.waypoints)) {
    const d = 0.32;
    wpEls[k] = svgEl('polygon', { points: `${p[0]},${-p[1] - d} ${p[0] + d},${-p[1]} ${p[0]},${-p[1] + d} ${p[0] - d},${-p[1]}`, class: 'wp' }, wpG);
  }

  // path, one polyline per phase
  const pathEls = [];
  for (const [name, a, b] of phases) {
    const seg = data.run.path.filter((p) => p[0] >= a - 0.6 && p[0] <= b + 0.6);
    if (seg.length < 2) continue;
    const el = svgEl('polyline', { points: seg.map((p) => `${p[1]},${-p[2]}`).join(' '), class: 'run', stroke: `var(${PHASE_COLOR[name]})` }, layers.path);
    el.dataset.phase = name;
    pathEls.push(el);
  }

  // labels (font size set from the pixel scale)
  const labels = [];
  const label = (text, p, cls = '', anchor = 'middle') => {
    const t = svgEl('text', { x: p[0] * TS, y: -p[1] * TS, class: `lab ${cls}`, 'text-anchor': anchor }, textG);
    t.textContent = text;
    labels.push(t);
    return t;
  };
  const off = (p, dx, dy) => [p[0] + dx, p[1] + dy];
  const lab = {
    gate: label('Gate', off(T.gate.posts[0], 0.2, 0.75)),
    slalom: label('Slalom', off(T.slalom.rows[2].poles[0], -0.1, 0.85)),
    torpedo: label('Torpedo', off(T.torpedo.center, 0.45, 0.75), '', 'start'),
    bins: label('Bins', off(T.bins.center, 0, 1.35)),
    table: label('Octagon', off(T.surface.center, 0, 1.9)),
    start: label('Start', off(data.start, 0.0, -1.35)),
  };
  label('tag board', off([0, 0], 0.35, 0.75), 'small tagl', 'start');
  label('x', [1.85, -0.25], 'small axis', 'start');
  label('y', [0.15, 1.85], 'small axis', 'start');
  const wpNames = { pre_torpedo: 'pre_torpedo', pre_table: 'pre_table', pre_bin: 'pre_bin', pre_return_home: 'pre_return_home' };
  const wpLabels = {};
  for (const [k, p] of Object.entries(data.waypoints)) {
    const left = k === 'pre_table' || k === 'pre_torpedo';
    wpLabels[k] = label(wpNames[k], off(p, left ? -0.5 : 0.5, -0.12), 'small wpl', left ? 'end' : 'start');
  }
  // scale bar: 5 m
  const sb = svgEl('g', { class: 'scalebar' }, layers.labels);
  const sbx = vx0 + 0.8, sby = vy0 + 0.8;
  svgEl('line', { x1: sbx, y1: -sby, x2: sbx + 5, y2: -sby }, sb);
  svgEl('line', { x1: sbx, y1: -sby - 0.25, x2: sbx, y2: -sby + 0.25 }, sb);
  svgEl('line', { x1: sbx + 5, y1: -sby - 0.25, x2: sbx + 5, y2: -sby + 0.25 }, sb);
  label('5 m', [sbx + 2.5, sby + 0.35], 'small');

  // hit areas
  const hits = {
    gate: [T.gate.center, 2.0], slalom: [T.slalom.center, 2.9], torpedo: [T.torpedo.center, 1.6],
    bins: [T.bins.center, 1.6], table: [T.surface.center, 1.9], start: [data.start, 1.3],
  };
  const hitEls = {};
  for (const [id, [c, r]] of Object.entries(hits)) {
    const e = svgEl('circle', { cx: c[0], cy: -c[1], r, class: 'hit', tabindex: -1 }, layers.hit);
    e.addEventListener('click', () => select(id, true));
    e.addEventListener('pointerenter', (ev) => { if (ev.pointerType === 'mouse') hover(id, true); });
    e.addEventListener('pointerleave', (ev) => { if (ev.pointerType === 'mouse') hover(id, false); });
    hitEls[id] = e;
  }
  function hover(id, on) {
    groups[id]?.classList.toggle('hover', on);
    lab[id]?.classList.toggle('hover', on);
  }

  function resize() {
    const k = svg.getBoundingClientRect().width / W; // px per m
    if (!k) return;
    const fs = 12.5 * TS / k, fsSmall = 10.5 * TS / k;
    for (const t of labels) t.setAttribute('font-size', t.classList.contains('small') ? fsSmall : fs);
    svg.classList.toggle('compact', k < 20); // phone: waypoint names only when selected
  }
  new ResizeObserver(resize).observe(host);
  resize();

  function show(id) {
    const t = byId[id];
    svg.classList.toggle('has-sel', true);
    for (const [k, g] of Object.entries(groups)) g.classList.toggle('sel', k === id || (id === 'home' && k === 'gate') || (id === 'pinger' && false));
    for (const [k, t2] of Object.entries(lab)) t2.classList.toggle('sel', k === id || (id === 'home' && k === 'gate'));
    for (const el of pathEls) el.classList.toggle('sel', t.phases.includes(el.dataset.phase));
    const wpSel = { pinger: ['pre_torpedo', 'pre_table'], torpedo: ['pre_torpedo'], table: ['pre_table'], bins: ['pre_bin'], home: ['pre_return_home'] }[id] || [];
    for (const [k, e] of Object.entries(wpEls)) { e.classList.toggle('sel', wpSel.includes(k)); wpLabels[k].classList.toggle('sel', wpSel.includes(k)); }
  }
  return { show, svg, layers };
})();

// toggles
{
  const host = document.getElementById('map-toggles');
  const tog = (label, cls, on = true) => {
    const l = h('label', {}, `<input type="checkbox" ${on ? 'checked' : ''}> ${label}`);
    l.querySelector('input').addEventListener('change', (e) => map.svg.classList.toggle(cls, !e.target.checked));
    host.appendChild(l);
  };
  tog('Talos\'s path in Nereus', 'no-path');
  tog('Waypoints', 'no-way');
}

// map key
{
  const sw = (inner) => `<svg viewBox="-7 -7 14 14" width="14" height="14" aria-hidden="true">${inner}</svg>`;
  const items = [
    [sw('<line x1="-6" y1="0" x2="6" y2="0" stroke="var(--ink)" stroke-width="2.5"/><rect x="-2" y="-5" width="4" height="4" fill="var(--reference)" stroke="var(--ink)" stroke-width=".8"/>'), 'gate, repair half'],
    [sw('<circle cx="-3" r="3" fill="var(--paper)" stroke="var(--ink)"/><circle cx="3.5" r="3" fill="var(--s8)" stroke="var(--ink)"/>'), 'white / red pipe'],
    [sw('<rect x="-6" y="-4" width="5.5" height="5.5" fill="var(--reference)" stroke="var(--ink)" stroke-width=".8"/><rect x="0.5" y="-1.5" width="5.5" height="5.5" fill="var(--s8)" stroke="var(--ink)" stroke-width=".8"/>'), 'fire / blood bin'],
    [sw('<circle r="3.5" fill="var(--paper)" stroke="var(--s8)" stroke-width="2"/>'), 'magnet light'],
    [sw('<rect x="-6" y="-3" width="5" height="6" fill="var(--s4)" stroke="var(--ink)" stroke-width=".8"/><rect x="1" y="-3" width="5" height="6" fill="var(--s8)" stroke="var(--ink)" stroke-width=".8"/>'), 'warning / helmet basket'],
    [sw('<polygon points="0,-5 5,0 0,5 -5,0" fill="var(--paper)" stroke="var(--ink)"/>'), 'waypoint'],
  ];
  const key = h('div', { class: 'rs-key' });
  for (const [s2, t] of items) key.appendChild(h('span', {}, `${s2}${t}`));
  document.getElementById('map-toggles').after(key);
}

// timeline of the Nereus run
const timeline = (() => {
  const host = document.getElementById('run-timeline');
  const span = phases[phases.length - 1][2] - t0;
  const bar = h('div', { class: 'bar' });
  const segs = {};
  for (const [name, a, b] of phases) {
    const s = h('button', { type: 'button', class: 'seg-t', title: `${name}: ${mmss(a - t0)}–${mmss(b - t0)}`, 'aria-label': `${name}, ${mmss(a - t0)} to ${mmss(b - t0)}` });
    s.style.flex = `${b - a} 0 0`;
    s.style.background = `var(${PHASE_COLOR[name]})`;
    s.addEventListener('click', () => select(phaseTask[name], true));
    segs[name] = s;
    bar.appendChild(s);
  }
  host.appendChild(h('div', { class: 'cap' }, `<span>The Nereus run, ${mmss(span)} from start to home</span><span>tap a task</span>`));
  host.appendChild(bar);
  const legend = h('div', { class: 'legend' });
  for (const [name] of phases) legend.appendChild(h('span', {}, `<i style="background:var(${PHASE_COLOR[name]})"></i>${name}`));
  host.appendChild(legend);
  return {
    show(id) { for (const [name, s] of Object.entries(segs)) s.classList.toggle('sel', byId[id].phases.includes(name)); },
  };
})();

// chips
const chips = (() => {
  const host = document.getElementById('task-chips');
  const btns = {};
  for (const t of TASKS) {
    const b = h('button', { type: 'button', 'aria-pressed': 'false' }, t.chip);
    b.addEventListener('click', () => select(t.id));
    btns[t.id] = b;
    host.appendChild(b);
  }
  return { show(id) { for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-pressed', String(k === id)); } };
})();

// task card
function card(id) {
  const t = byId[id];
  const host = document.getElementById('task-card-body');
  const runs = phases.filter((p) => t.phases.includes(p[0]));
  const runText = runs.map(([n, a, b]) => `${t.phases.length > 1 ? n.toLowerCase() + ' ' : ''}${mmss(a - t0)}–${mmss(b - t0)}`).join(', ');
  const total = t.points.reduce((s, r) => s + r[1], 0);
  const img = (im) => im ? `<figure class="rs-shot"><img src="${IMG(im[0])}" alt="${im[1].replace(/<[^>]+>/g, '')}" width="800" height="345"><figcaption>${im[1]}</figcaption></figure>` : '';
  host.innerHTML = `
    <h3>${t.title}</h3>
    ${img(t.img)}
    <h4>What the rules ask</h4>
    <ul>${t.rules.map((r) => `<li>${r}</li>`).join('')}</ul>
    <h4>Points <span class="max">up to ${fmt(total)}</span></h4>
    <table class="pts">${t.points.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('')}</table>
    <h4>How Talos does it</h4>
    ${t.camera ? `<p class="kit"><span><b>Camera</b> ${t.camera}</span><span><b>Uses</b> ${t.mech}</span></p>` : ''}
    <ul>${t.talos.map((r) => `<li>${r}</li>`).join('')}</ul>
    ${img(t.img2)}
    <p class="run">In the Nereus run: <b>${runText}</b></p>
    <p class="readmore"><b>Read more:</b> ${t.read.map(([href, title]) => `<a href="${href}">${title}</a>`).join(' · ')}</p>`;
  host.scrollTop = 0;
}

function select(id, reveal = false) {
  map.show(id);
  timeline.show(id);
  chips.show(id);
  card(id);
  // On phones the card sits below the map, key and timeline: bring it into view after a tap there.
  if (reveal && window.matchMedia('(max-width: 860px)').matches) {
    document.querySelector('#task-card-body h3').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
select('gate');

// ---------------------------------------------------------------- what each task uses
{
  const rows = ['gate', 'slalom', 'pinger', 'torpedo', 'table', 'bins', 'home'];
  const sub = { gate: 'GateTreeMpc', slalom: 'SlalomPathMpc', pinger: 'RandomPingerTree', torpedo: 'TorpedoTreeMpc', table: 'NewTableTreeMpc', bins: 'BinTreeMpc', home: '_home_path' };
  const name = { gate: 'Gate', slalom: 'Slalom', pinger: 'Pinger', torpedo: 'Torpedoes', table: 'Octagon, table', bins: 'Bins, lights', home: 'Return home' };
  const subtree = (id) => id === 'home' ? `<a href="${TREE_URL}#L${L._home_path}">a path</a>` : id === 'bins' ? `${tl('BinTreeMpc', 'BinTreeMpc', true)}, ${tl('MagnetTreeMpc', 'MagnetTreeMpc', true)}` : tl(sub[id], sub[id], true);
  const host = document.getElementById('use-table');
  host.innerHTML = `<table class="params rs-use"><thead><tr><th>Task</th><th>Camera</th><th>Mechanism</th><th>Subtree</th></tr></thead><tbody>${
    rows.map((id) => `<tr><td><button type="button" class="linkish" data-id="${id}">${name[id]}</button></td><td>${byId[id].camera === 'none' ? '–' : byId[id].camera}</td><td>${byId[id].mech === 'none' ? '–' : byId[id].mech}</td><td>${subtree(id)}</td></tr>`).join('')
  }</tbody></table>`;
  host.querySelectorAll('button.linkish').forEach((b) => b.addEventListener('click', () => {
    select(b.dataset.id);
    document.querySelector('.rs-course').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

// ---------------------------------------------------------------- scoring explorer
{
  const SC = [
    { task: 'Gate', color: '--state', rows: [
      ['Pass through', P.gate],
      ['Maintain control', 150, null, 'judged'],
      ['Heading coin flip', P.heading],
      ['Role coin flip', P.role, null, 'role'],
      [`Style, ${P.max_style_quarters} quarter turns of roll or pitch`, P.style_rp * P.max_style_quarters, 'FlipTree fails under the MPC, so no style points.'],
    ] },
    { task: 'Slalom', color: '--s8', rows: [['3 rows on the same side as the gate', 3 * P.slalom_same], ['3 rows within the pipes\' height', 3 * P.slalom_depth]] },
    { task: 'Bins and lights', color: '--s4', rows: [['2 markers in a bin', 2 * P.bin], ['…each in a different bin of your role', 2 * P.bin_class], ['2 lights turned off', P.light * P.max_lights]] },
    { task: 'Torpedoes', color: '--s7', rows: [['2 torpedoes through', 2 * P.torpedo], ['Large then small, your role', P.sequence], ['Both from ≥ 0.46 m', 2 * P.distance_far]] },
    { task: 'Octagon and table', color: '--prediction', rows: [['Surface inside', P.surface], ['Face the right image', P.facing_count], ['Surface holding each of 4 objects', 4 * P.object_surface], ['Release 4 objects', 4 * P.object_drop], ['4 objects in their baskets', 4 * P.basket_correct], ['Turns = objects in baskets', P.basket_count]] },
    { task: 'Return home', color: '--s6', rows: [['Back through the gate', P.home]] },
    { task: 'Random pinger', color: '--muted', rows: [['First pinger task', P.pinger_first, 'The tree\'s pinger order looks inverted (see One tree for the whole run), so this is not counted.', 'judged'], ['Second pinger task', P.pinger_second, 'Comes after the first pinger task, so not counted either.', 'judged']] },
    { task: 'Inter-vehicle comms', color: '--muted', rows: [['Two vehicles talking, by level', 1000, 'Not part of this tree: it needs Talos and Triton working together.', 'judged']] },
  ];
  const list = document.getElementById('score-list');
  const totalEl = document.getElementById('score-total');
  const max = Math.max(...SC.map((s) => s.rows.reduce((a, r) => a + r[1], 0)));
  let mode = 'all';
  const items = SC.map((s) => {
    const det = h('details', { class: 'sc' });
    const sum = h('summary');
    sum.innerHTML = `<span class="name">${s.task}</span><span class="track"></span><span class="val"></span>`;
    det.appendChild(sum);
    const ul = h('ul');
    det.appendChild(ul);
    list.appendChild(det);
    return { s, det, sum, ul };
  });
  function render() {
    let grand = 0;
    for (const { s, sum, ul } of items) {
      const track = sum.querySelector('.track');
      track.innerHTML = '';
      let tot = 0;
      for (const r of s.rows) {
        const off = mode === 'talos' && r[2];
        const seg = h('i');
        seg.style.width = `${(r[1] / max) * 100}%`;
        seg.style.background = off ? 'var(--paper-3)' : `var(${s.color})`;
        if (off) seg.classList.add('off');
        track.appendChild(seg);
        if (!off) tot += r[1];
      }
      grand += tot;
      sum.querySelector('.val').textContent = fmt(tot);
      ul.innerHTML = s.rows.map((r) => {
        const off = mode === 'talos' && r[2];
        return `<li class="${off ? 'off' : ''}"><span>${r[0]}${r[3] === 'judged' ? ' <small>(judges only)</small>' : ''}${r[3] === 'role' && mode === 'talos' ? '<em class="note">Counted: the role is not detected, so the operator starts the Repair or Rescue tree that matches the flip.</em>' : ''}${off ? `<em>${r[2]}</em>` : ''}</span><b>${fmt(r[1])}</b></li>`;
      }).join('');
    }
    totalEl.innerHTML = `<span>${mode === 'talos' ? 'What <code>RepairCompMpcTree</code> goes for' : 'Every row together'}</span><b>${fmt(grand)}</b>`
      + `<small>Plus the weight bonus and, if one slalom row, one bin or torpedo and a full surface in the octagon all score, 100 per minute left.</small>`;
  }
  document.querySelectorAll('#score-mode button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.m;
    document.querySelectorAll('#score-mode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    render();
  }));
  render();
}

// ---------------------------------------------------------------- prequalification path
{
  const host = document.getElementById('prequal');
  // Map frame: prequal_gate (4, 0) yaw 180, prequal_pole (14, 0); the tree's path in the gate frame mapped to map.
  const gate = [4, 0], pole = [14, 0], R = 3;
  const g2m = ([x, y]) => [gate[0] - x, gate[1] - y]; // gate frame (yaw 180) -> map
  const poleG = [gate[0] - pole[0], 0]; // pole in the gate frame: (-10, 0)
  const pts = [];
  const line = (a, b, look) => { for (let i = 0; i <= 20; i++) pts.push({ p: [a[0] + (b[0] - a[0]) * i / 20, a[1] + (b[1] - a[1]) * i / 20], look }); };
  const start = [1, 0];
  line(start, g2m([1, 0]));
  line(g2m([1, 0]), g2m([-1, 0]));
  line(g2m([-1, 0]), g2m([poleG[0], poleG[1] + R]));
  for (let i = 0; i <= 60; i++) {
    const a = Math.PI / 2 + Math.PI * i / 60;
    pts.push({ p: g2m([poleG[0] + R * Math.cos(a), poleG[1] + R * Math.sin(a)]), look: pole });
  }
  line(g2m([poleG[0], poleG[1] - R]), g2m([-1, 0]));
  line(g2m([-1, 0]), g2m([1, 0]));
  const x0 = -0.6, x1 = 18.8, y0 = -4.4, y1 = 4.4;
  const svg = svgEl('svg', { viewBox: `${x0} ${-y1} ${x1 - x0} ${y1 - y0}`, class: 'rs-pq', role: 'img', 'aria-label': 'Prequalification course and path' }, host);
  svgEl('rect', { x: x0, y: -y1, width: x1 - x0, height: y1 - y0, class: 'water' }, svg);
  svgEl('rect', { x: 0, y: -1.2, width: 2, height: 2.4, class: 'zone' }, svg);
  svgEl('polyline', { points: pts.map(({ p }) => `${p[0]},${-p[1]}`).join(' '), class: 'path' }, svg);
  svgEl('line', { x1: 4, y1: -1, x2: 4, y2: 1, class: 'gate' }, svg);
  svgEl('circle', { cx: 14, cy: 0, r: 0.18, class: 'pole' }, svg);
  svgEl('circle', { cx: 14, cy: 0, r: R, class: 'radius' }, svg);
  const texts = [];
  const TS = 20, textG = svgEl('g', { transform: `scale(${1 / TS})` }, svg); // see the course map's TS
  const tx = (s, x, y, anchor = 'middle', cls = '') => { const t = svgEl('text', { x: x * TS, y: -y * TS, 'text-anchor': anchor, class: cls }, textG); t.textContent = s; texts.push(t); };
  tx('gate, 2 m wide, 1 m deep', 3.2, 3.5, 'start');
  tx('pole', 14, 0.5);
  svgEl('line', { x1: 14, y1: 0, x2: 14, y2: R, class: 'dim' }, svg);
  tx('3 m', 14.3, -1.6, 'start', 'muted');
  tx('start', 1, -1.75, 'middle', 'muted');
  tx('10 m', 9, -3.5, 'middle', 'muted');
  svgEl('line', { x1: 4, y1: 3.8, x2: 14, y2: 3.8, class: 'dim' }, svg);
  const bot = svgEl('g', { class: 'bot' }, svg);
  svgEl('polygon', { points: '0.55,0 -0.4,0.32 -0.4,-0.32' }, bot);
  function place(i) {
    const { p, look } = pts[Math.min(i, pts.length - 1)];
    const q = pts[Math.min(i + 1, pts.length - 1)].p, pr = pts[Math.max(i - 1, 0)].p;
    const yaw = look ? Math.atan2(look[1] - p[1], look[0] - p[0]) : Math.atan2(q[1] - pr[1], q[0] - pr[0]);
    bot.setAttribute('transform', `translate(${p[0]} ${-p[1]}) rotate(${-yaw * 180 / Math.PI})`);
  }
  place(0);
  function fit() {
    const k = svg.getBoundingClientRect().width / (x1 - x0);
    if (k) for (const t of texts) t.setAttribute('font-size', 12 * TS / k);
  }
  new ResizeObserver(fit).observe(host);
  const btn = document.getElementById('pq-play');
  let raf = 0;
  btn.addEventListener('click', () => {
    cancelAnimationFrame(raf);
    const T = 7000, tStart = performance.now();
    btn.textContent = 'Replay';
    const step = (now) => {
      const u = Math.min((now - tStart) / T, 1);
      place(Math.round(u * (pts.length - 1)));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

// ---------------------------------------------------------------- the robots
{
  const robots = [
    ['Maelstrom', '2018', null, 'Riptide\'s main hull in a new aluminium chassis. 10th of 47 at RoboSub 2018.', 'robot_maelstrom.webp'],
    ['Puddles', '2019, 2020', 'puddles', '11th of 55 in 2019, 10th of 33 in 2020.', 'robot_puddles.webp'],
    ['Tempest', '2022', 'tempest', 'Started in 2020 for 2021; the pandemic moved its only competition to 2022. First-generation (Mark 1) electronics.', 'robot_tempest.webp'],
    ['Talos', '2023 to 2026', 'talos', 'Designed from August 2022 to fix Tempest\'s weak points: stiffer chassis, Mark 2 electronics (a board stack talking over CAN), smart battery housings. Claw added for 2026.', 'robot_talos.webp'],
    ['SS Flip Barker', '2025', 'liltank', 'A second vehicle for the 2025 table task: a ballast tank for depth and tracks to drive. Did not qualify.', 'robot_ssfb.webp'],
    ['Triton', '2026', 'Mercury stack', 'Rebuilt around the SS Flip Barker\'s hull: smaller than Talos, eight thrusters, boards based on Talos\'s designs, no DVL (ZED X Mini visual odometry), and talks to Talos acoustically.', 'robot_triton.webp'],
  ];
  const host = document.getElementById('robots');
  for (const [name, years, code, text, img] of robots) {
    host.appendChild(h('figure', {}, `<img class="media" src="${IMG(img)}" alt="${name}" loading="lazy" width="640" height="427">`
      + `<figcaption><b>${name}</b> <span class="yr">${years}</span>${code ? ` <code>${code}</code>` : ''}<br>${text}</figcaption>`));
  }
}
