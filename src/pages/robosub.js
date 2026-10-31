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
const tl = (id, label = id) => `<a href="${TREE_URL}#L${L[id]}"><code>${label}</code></a>`;
const gl = (id, text) => `<a class="gl" href="glossary.html#term-${id}">${text}</a>`;
document.getElementById('tree-len').textContent = fmt(Math.round(data.tree_length / 100) * 100);

// Run phases, plus the start (from the tree's first log line to the gate).
const phases = [['Start', data.run.start_t, data.run.phases[0][1]], ...data.run.phases];
const t0 = phases[0][1];

// In run order. `n` is the handbook's task number.
const TASKS = [
  {
    id: 'start', chip: 'Start', title: 'Start', phases: ['Start'],
    what: 'Start on the surface in the start zone and dive before leaving it. A coin flip can decide which way the vehicle starts facing, for extra points.',
    rules: [
      'Start on the surface in the start zone and submerge before leaving it.',
      'Optional coin flip for points: heads, the vehicle starts roughly parallel to the gate; tails, with its tail toward the gate.',
    ],
    points: [['Heading coin flip (scored with the gate)', P.heading]],
    kit: [],
    sub: ['WaitForKillSwitch', 'Dive'],
    talos: [
      `Waits until the ${gl('kill-switch', 'kill switch')} is put in, then about 6 s more, freezes the map and dives in place, holding its heading.`,
      `Before the run Talos looks at an AprilTag board on the pool wall (${gl('apriltag-calibration', 'AprilTag calibration')}). That fixes the ${gl('map', 'map frame')}, and every later move is a position in it, so the way Talos starts facing doesn't matter to the tree.`,
      'The map marks where the Nereus run started, already 1 m deep, beside the tag board. In a real pool the start zone is wherever the course puts it; the map frame comes from the tag board, not the start.',
    ],
    read: [['commanding.html', 'Commanding Talos'], ['perception/frames.html', 'Frames, targets and the mission tree'], ['pool-test.html', 'Pool test day']],
  },
  {
    id: 'gate', chip: 'Gate', title: 'Gate', n: 1, hb: 'Begin Assessment', phases: ['Gate'],
    what: 'Pass under one half of a 3 m gate. Each half carries two role images, and the half you pass under is your role for the rest of the run.',
    rules: [
      'A 3 m wide PVC gate floats just under the surface, with red and black legs and a red divider down the middle.',
      'One half carries the Survey &amp; Repair images (compass, hammer and wrench), the other Search &amp; Rescue (buoy, SOS).',
      'Pass cleanly: touching the legs costs points, touching the divider is fine. Extra "style" points for each 90° of roll, pitch or yaw while passing.',
    ],
    points: [['Pass through', P.gate], ['Maintain control (judges)', 150], ['Heading coin flip', P.heading], ['Role coin flip, if you take the flipped role', P.role],
      [`Style: per 90°, roll or pitch ${P.style_rp}, yaw ${P.style_yaw}, ${P.max_style_quarters} at most`, P.style_rp * P.max_style_quarters]],
    kit: 'No camera: flown from the map',
    sub: ['GateTreeMpc'],
    talos: [
      'Flies one path through the Survey &amp; Repair half, from 1 m in front of the gate to 1 m behind it, below the top bar.',
      `The camera isn't used: the gate's camera searches are switched off in the tree, so Talos trusts the gate's stored position in its ${gl('prior-map', 'prior map')}.`,
      `Before passing, it works out from the stored positions of the two halves which side of the red pipes to take in the slalom. Under the gate it tries a flip for style points (${tl('FlipTree')}); under the ${gl('mpc', 'MPC')} controller the flip fails and the tree carries on.`,
    ],
    read: [['perception/frames.html', 'Frames, targets and the mission tree'], ['control/reference.html', 'Where to go: profiles and paths'], ['mission-tree.html', 'The competition mission']],
    img: ['viewer_gate.webp', 'Talos passing under the repair half (compass, hammer and wrench); the rescue half (SOS, buoy) is on the right. Nereus viewer.', 640, 320],
  },
  {
    id: 'slalom', chip: 'Slalom', title: 'Slalom', n: 2, hb: 'Avoid Debris', phases: ['Slalom'],
    what: "Three rows of pipes, white, red, white. Pass each row on the same side of the red pipe as you passed the gate's divider, and within the pipes' height.",
    rules: [
      'Three rows of vertical pipes, white, red, white, about 0.9 m tall and moored at different heights.',
      'Pass each row on the same side of the red pipe as you passed the gate divider, and within the height of the pipes.',
    ],
    points: [[`Each row: same side ${P.slalom_same}, other side ${P.slalom_other}`, 3 * P.slalom_same], [`Each row: within the pipes' height, +${P.slalom_depth}`, 3 * P.slalom_depth]],
    kit: [['Camera', `${gl('ffc', 'ffc')} (forward)`]],
    sub: ['SlalomPathMpc'],
    talos: [
      'Stops in front of the slalom and lets the forward camera find the red pipes, so mapping can correct where the slalom is.',
      `Then it ${gl('lock-map', 'locks the map')} and flies one path through all three rows, on the side the gate chose, and on toward the torpedo.`,
    ],
    read: [['perception/detector.html', 'The detector, frame by frame'], ['perception/map.html', 'The course map'], ['control/reference.html', 'Where to go: profiles and paths']],
    img: ['cam_slalom.webp', "The forward camera at the slalom in Nereus. The detector's box marks the red pipe (its class is <code>slalom</code>).", 780, 460],
  },
  {
    id: 'pinger', chip: 'Pinger', title: 'Random pinger', phases: ['Pinger'],
    what: 'An acoustic pinger sits at the torpedo board and another at the octagon, one on at a time. Scoring first at the task that is pinging earns a bonus.',
    rules: [
      'An acoustic pinger (25–40 kHz) sits at the torpedo board and another at the octagon; only one is on at a time. They earn no points by themselves.',
      'The team can ask for a random one. Scoring at the task it marks earns a bonus; the team can then ask to switch, and scoring at the other task earns a bigger one.',
    ],
    points: [['First pinger task scored', P.pinger_first], ['Second pinger task scored', P.pinger_second]],
    kit: [['Uses', `the ${gl('hydrophone', 'hydrophone')}`]],
    sub: ['RandomPingerTree'],
    talos: [
      "Listens for 10 s at the torpedo's waiting point, then 10 s at the table's, and asks which was louder.",
      'The answer picks torpedo or table first, but the tree seems to read it backwards: see <a href="#pinger-caveat">the pinger note</a>.',
      'Nereus has no pinger, so no answer comes and Talos goes to the torpedo first.',
    ],
    read: [['sensors.html', 'Navigation sensors'], ['mission-tree.html#pinger', 'The pinger picks the order']],
  },
  {
    id: 'torpedo', chip: 'Torpedo', title: 'Torpedoes', n: 4, hb: 'Deploy', phases: ['Torpedo'],
    what: "A 0.6 m board with a large and a small opening for each role. Fire up to two torpedoes: most points for your role's large opening, then its small one, from farther than 0.46 m.",
    rules: [
      'A 0.6 m square board with images for both roles and two sizes of opening for each.',
      'Up to two torpedoes. Most points for your role\'s large opening (fire) then its small one (fire engine). More for firing from farther away: 0.3 m and 0.46 m.',
    ],
    points: [['Each torpedo through an opening, 2 at most', 2 * P.torpedo], ['Large then small, both your role', P.sequence], [`Each fired from ≥ ${P.distance_far_m.toFixed(2)} m (≥ ${P.distance_near_m.toFixed(2)} m: ${P.distance_near})`, 2 * P.distance_far]],
    kit: [['Camera', `${gl('ffc', 'ffc')} (forward)`], ['Uses', '2 torpedoes']],
    sub: ['TorpedoTreeMpc', 'ShootBothObjectsMpc'],
    talos: [
      "Flies to its waiting point facing the board and moves about until mapping's estimate of the board settles, to about 5 cm.",
      'Then it finds the two fire openings, lines torpedo 1 up on the large one, closes in to 0.6 m and fires, slides across to the small one and fires torpedo 2.',
      '0.6 m is past the 0.46 m line, so both shots also earn the larger distance bonus.',
    ],
    read: [['actuators.html', 'Torpedoes, dropper and claw'], ['perception/composites.html', 'Props made of several pieces'], ['perception/tracking.html', 'Tracking one object']],
    img: ['cam_torpedo.webp', 'The forward camera at the board. The detector boxes each opening (<code>circle</code>) and each role image: fire, fire engine, blood, ambulance.', 600, 460],
  },
  {
    id: 'table', chip: 'Octagon', title: 'Octagon and table', n: 5, hb: 'Restore', phases: ['Table'],
    what: 'A floating octagon with a table below it. Pick up the items, surface inside the octagon holding them, drop each into its basket, then surface facing the right image.',
    rules: [
      'A 2.7 m PVC octagon floats on the surface. Images hang inside it: compass, hammer and wrench, buoy, SOS. You may surface inside it and dive again.',
      'Below it is a table with two items per role and two baskets: warning (Survey &amp; Repair) and helmet (Search &amp; Rescue).',
      'Points for surfacing inside, surfacing while holding an item, releasing items, putting them in baskets, turning once per item in the baskets, and facing the right image: the first image of your role for one item, the second for two or more.',
    ],
    points: [['Surface inside the octagon', P.surface], [`Face an image: any ${P.facing_other}, your role ${P.facing_correct}, right for the count`, P.facing_count],
      ['Surface holding each object (4)', 4 * P.object_surface], ['Release each object (4)', 4 * P.object_drop],
      [`Each object in a basket: any ${P.basket_other}, its own (4)`, 4 * P.basket_correct], [`Turns = objects in baskets (off by one: ${P.basket_count_near})`, P.basket_count]],
    kit: [['Camera', `${gl('dfc', 'dfc')} (downward)`], ['Uses', 'claw']],
    sub: ['NewTableTreeMpc', 'SpinTreeMpc'],
    talos: [
      "Switches to the downward camera, finds the two baskets and fits the table's layout to them.",
      'Then four times: hover over an item and close the claw, rise inside the octagon holding it, and drop it in its basket. Pill and bandage go to the helmet basket, nut and bolt and plug to the warning basket.',
      'Finally it turns once per item sorted and surfaces facing the hammer and wrench.',
    ],
    read: [['actuators.html', 'Torpedoes, dropper and claw'], ['cameras.html', 'The cameras'], ['perception/frames.html', 'Frames, targets and the mission tree']],
    img: ['viewer_octagon.webp', 'Talos inside the octagon ring, above the table, in the Nereus viewer.', 600, 300],
    img2: ['cam_table.webp', 'What the downward camera sees over the table: the detector boxes the plug, the nut and bolt and the helmet basket.', 800, 560],
  },
  {
    id: 'bins', chip: 'Bins', title: 'Bins and lights', n: 3, hb: 'Recon', phases: ['Bins', 'Magnets'],
    what: "Four bins on a raised pipeline, two fire and two blood. Drop a marker in each of your role's bins, then turn off the lights beside them with a magnet.",
    rules: [
      'A 3D PVC pipeline raised off the pool floor, with four bins along its sides: two marked fire (Survey &amp; Repair), two blood (Search &amp; Rescue).',
      'Drop up to two markers. Most points for one in each of your role\'s two bins.',
      'A light with a magnetic sensor sits near each bin and is on at the start. Bring a magnet close to a sensor to turn its light off; up to two score (Nereus models two).',
    ],
    points: [['Each marker in any bin (2)', 2 * P.bin], ['Each in a different bin of your role, +' + P.bin_class, 2 * P.bin_class], ['Each light turned off (2)', P.light * P.max_lights]],
    kit: [['Camera', `${gl('dfc', 'dfc')}, then ${gl('ffc', 'ffc')}`], ['Uses', '2 markers, magnet']],
    sub: ['BinTreeMpc', 'MagnetTreeMpc'],
    talos: [
      `Uses the downward camera. The two fire bins look the same, so mapping's ${gl('binary-classifier', 'binary classifier')} tells them apart; Talos hovers over each and drops one marker.`,
      'Then it fits the bins\' layout to what it saw, switches to the forward camera, and for each light turns its back to it and backs straight in: the magnet sits at the rear of Talos, underneath.',
    ],
    read: [['actuators.html', 'Torpedoes, dropper and claw'], ['perception/frames.html', 'Frames, targets and the mission tree'], ['cameras.html', 'The cameras']],
    img: ['cam_bins.webp', 'The downward camera over a fire bin (class <code>fire</code>); the red ring on the left is a magnet light.', 820, 520],
    img2: ['viewer_bins.webp', 'The four bins in the Nereus viewer with Talos just above them; the red dot at the bottom right is a magnet light.', 520, 290],
  },
  {
    id: 'home', chip: 'Home', title: 'Return home', n: 6, hb: 'Return Home', phases: ['Home'],
    what: 'At the end of the run, still underwater, pass back through the start gate.',
    rules: ['At the end of the run, still underwater, pass back through the start gate.'],
    points: [['Back through the gate, fully submerged', P.home]],
    kit: 'No camera: flown from the map',
    sub: ['_home_path'],
    talos: [
      'One path: back past the bins, to a waypoint near the gate, then through the gate from 1 m before it to 1 m past. Then the controller stops.',
      'It keeps the heading Talos had after the magnet lights, so it can cross the gate backwards or sideways. In the Nereus run it went through tail first.',
      'No camera check: by now mapping has shifted the whole course to fit what Talos saw, so the gate moved with it.',
    ],
    read: [['perception/map.html', 'The course map'], ['localization.html', 'Where am I? State estimation']],
    img: ['viewer_home.webp', 'Back on the start side of the gate at the end of the Nereus run, still facing the course: Talos came through tail first.', 640, 320],
  },
];
const byId = Object.fromEntries(TASKS.map((t) => [t.id, t]));
const ORDER = TASKS.map((t) => t.id);
const runOf = (t) => phases.filter((p) => t.phases.includes(p[0]));
const startOf = (t) => runOf(t)[0][1] - t0;
const endOf = (t) => { const r = runOf(t); return r[r.length - 1][2] - t0; };
const totalOf = (t) => t.points.reduce((s, r) => s + r[1], 0);

// ---------------------------------------------------------------- the course map
// Octagon and Bins each have two views of numbered stops: there the raw track is a tangle.
// [view id, button, what the numbers mean]
const VIEWS = {
  table: [
    ['table', 'The octagon', '<b class="n">1</b> Four trips between the table and its baskets (the next view). <b class="n">2</b> Turns once per item sorted, then surfaces facing the hammer and wrench.'],
    ['trips', 'The table: 4 trips', 'Each trip: close the claw on the item, rise to the surface inside the octagon holding it, then drop it in its basket. <b class="n">1</b> bandage and <b class="n">2</b> pill go to the helmet basket, <b class="n">3</b> nut and bolt and <b class="n">4</b> plug to the warning basket.'],
  ],
  bins: [
    ['markers', `Markers ${mmss(data.run.phases.find((p) => p[0] === 'Bins')[1] - t0)}`, '<b class="n">1</b> Hovers over a fire bin and drops a marker. <b class="n">2</b> Finds the other fire bin and drops the second.'],
    ['lights', `Lights ${mmss(data.run.phases.find((p) => p[0] === 'Magnets')[1] - t0)}`, '<b class="n">3</b> Stops about 1 m from the first light (small circle), looks at it with the forward camera, turns round and backs the magnet onto it. <b class="n">4</b> The same at the second light, from the far side.'],
  ],
};
const viewsOf = (id) => VIEWS[id] || [[id]];

// Phones get a close-up of one task with every prop labelled; the whole course is one tap away (the locator).
const ASPECT = 1.25; // view width / height
const map = (() => {
  const host = document.getElementById('course-map');
  const T = data.tasks;
  // map (x, y) -> svg (x, -y); boxes are [x, yTop, w, h] in svg units
  const fitBox = (x0, y0, x1, y1) => {
    let w = x1 - x0, hh = y1 - y0;
    if (w / hh > ASPECT) hh = w / ASPECT; else w = hh * ASPECT;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return [cx - w / 2, -cy - hh / 2, w, hh];
  };
  const [vx0, vy0, vx1raw, vy1] = data.view;
  const poolX = Math.max(...data.pool.corners.map((c) => c[0]));
  const WHOLE = fitBox(vx0, vy0, Math.max(vx1raw, poolX + 0.9), vy1);
  const at = (cx, cy, w) => [cx - w / 2, -cy - w / ASPECT / 2, w, w / ASPECT];
  // One box per view. Octagon and Bins have two views each (VIEWS), drawn as numbered stops, not the raw track.
  const CLOSE = {
    start: at(2.3, -1.3, 7.8), gate: at(4.2, -2.2, 5.8), slalom: at(9.8, 1.45, 7.8), pinger: at(18.1, 5.6, 11.8),
    torpedo: at(17.6, 2.55, 4.6), table: at(19.3, 9.14, 4.9), trips: at(19.29, 9.0, 1.9),
    markers: at(13.4, 11.78, 4.4), lights: at(13.4, 12.3, 4.2), home: at(10.6, -0.5, 17),
  };
  // the most px per metre a view may reach on a wide screen (labels are placed for about the phone scale)
  const MAXK = { table: 120, trips: 230, markers: 120, lights: 110 };
  let vb = CLOSE.start.slice();
  const svg = svgEl('svg', { viewBox: vb.join(' '), class: 'rs-svg', role: 'img', 'aria-label': 'Top-down map of the RoboSub 2026 course' }, host);
  const P2 = ([x, y]) => `${x},${-y}`;
  const pts = (a) => a.map(P2).join(' ');
  const layers = {};
  for (const k of ['pool', 'runall', 'runsel', 'props', 'way', 'stops', 'leaders', 'labels', 'hit']) layers[k] = svgEl('g', { class: `l-${k}` }, svg);
  // Text lives in a group scaled down by TS so its font size is not a tiny number (Chrome garbles glyph spacing
  // for font sizes well under 1 user unit).
  const TS = 20;
  const textG = svgEl('g', { transform: `scale(${1 / TS})` }, layers.labels);

  // pool, deck, lanes
  svgEl('rect', { x: -40, y: -60, width: 120, height: 120, class: 'deck' }, layers.pool);
  svgEl('polygon', { points: pts(data.pool.corners), class: 'water' }, layers.pool);
  for (const [a, b] of data.lanes) svgEl('line', { x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], class: 'lane', 'stroke-width': data.lane_width_m }, layers.pool);
  svgEl('polygon', { points: pts(data.pool.corners), class: 'wall' }, layers.pool);
  // tag board on the wall at the map origin, and the map axes (start close-up only)
  svgEl('rect', { x: -0.06, y: -0.45, width: 0.12, height: 0.9, class: 'tagboard' }, layers.pool);
  const defs = svgEl('defs', {}, svg);
  const mk = svgEl('marker', { id: 'rs-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
  svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--ink-2)' }, mk);
  const ax = svgEl('g', { class: 'axes det', 'data-t': 'start' }, layers.pool);
  svgEl('line', { x1: 0, y1: 0, x2: 1.6, y2: 0, 'marker-end': 'url(#rs-arrow)' }, ax);
  svgEl('line', { x1: 0, y1: 0, x2: 0, y2: -1.6, 'marker-end': 'url(#rs-arrow)' }, ax);

  const groups = {};
  const G = (id) => (groups[id] ||= svgEl('g', { class: `task t-${id}` }, layers.props));
  // Solid = Survey & Repair (Talos's role), hollow = Search & Rescue.
  // gate: bar, posts, divider, and a square for each half on the approach side
  {
    const g = G('gate');
    const [a, b] = T.gate.posts;
    svgEl('line', { x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], class: 'gate-bar' }, g);
    for (const p of T.gate.posts) svgEl('circle', { cx: p[0], cy: -p[1], r: 0.14, class: 'gate-post' }, g);
    svgEl('circle', { cx: T.gate.divider[0], cy: -T.gate.divider[1], r: 0.1, class: 'divider' }, g);
    const c = T.gate.center, ap = T.gate.approach;
    const dx = (ap[0] - c[0]) / 1.5 * 0.45, dy = (ap[1] - c[1]) / 1.5 * 0.45;
    for (const [k, p] of Object.entries(T.gate.halves)) {
      svgEl('rect', { x: p[0] + dx - 0.2, y: -(p[1] + dy) - 0.2, width: 0.4, height: 0.4, rx: 0.05, class: `half ${k === 'repair' ? 'mine' : 'theirs'}` }, g);
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
  // torpedo board, and the firing point 0.6 m in front of it
  const tUnit = (() => { const c = T.torpedo.center, f = T.torpedo.face; const d = Math.hypot(f[0] - c[0], f[1] - c[1]); return [(f[0] - c[0]) / d, (f[1] - c[1]) / d]; })();
  const firePt = [T.torpedo.center[0] + tUnit[0] * 0.6, T.torpedo.center[1] + tUnit[1] * 0.6];
  {
    const g = G('torpedo');
    const [a, b] = T.torpedo.board;
    svgEl('line', { x1: a[0], y1: -a[1], x2: b[0], y2: -b[1], class: 'board' }, g);
    const n = [-tUnit[1], tUnit[0]];
    const d = svgEl('g', { class: 'det', 'data-t': 'torpedo' }, g);
    svgEl('line', { x1: T.torpedo.center[0], y1: -T.torpedo.center[1], x2: firePt[0], y2: -firePt[1], class: 'dimline' }, d);
    svgEl('line', { x1: firePt[0] + n[0] * 0.18, y1: -(firePt[1] + n[1] * 0.18), x2: firePt[0] - n[0] * 0.18, y2: -(firePt[1] - n[1] * 0.18), class: 'tick' }, d);
  }
  // bins
  {
    const g = G('bins');
    const s = T.bins.crate_m, yaw = T.bins.yaw;
    for (const c of T.bins.crates) svgEl('rect', { x: c.p[0] - s / 2, y: -c.p[1] - s / 2, width: s, height: s, class: `crate ${c.class === 'fire' ? 'mine' : 'theirs'}`, transform: `rotate(${-yaw} ${c.p[0]} ${-c.p[1]})` }, g);
    for (const l of T.bins.lights) svgEl('circle', { cx: l.p[0], cy: -l.p[1], r: 0.1, class: 'light' }, g);
  }
  // octagon + table
  {
    const g = G('table');
    svgEl('polygon', { points: pts(T.surface.octagon), class: 'octagon' }, g);
    svgEl('polygon', { points: pts(T.table.slab), class: 'table' }, g);
    for (const [k, b] of Object.entries(T.table.baskets)) svgEl('polygon', { points: pts(b), class: `basket ${k === 'warning' ? 'mine' : 'theirs'}` }, g);
    for (const p of T.table.props) svgEl('circle', { cx: p.p[0], cy: -p.p[1], r: 0.05, class: `item ${p.basket === 'warning' ? 'mine' : 'theirs'}` }, g);
    for (const [k, p] of Object.entries(T.surface.signs)) svgEl('rect', { x: p[0] - 0.1, y: -p[1] - 0.1, width: 0.2, height: 0.2, class: `sign ${k === 'compass' || k === 'hammer_and_wrench' ? 'mine' : 'theirs'}` }, g);
  }
  // start
  {
    const g = G('start');
    svgEl('circle', { cx: data.start[0], cy: -data.start[1], r: 0.35, class: 'start' }, g);
  }

  // Talos's path: the whole run thin and grey, the chosen task's part thick, with arrows.
  const runPts = data.run.path.filter((p) => p[0] >= t0 - 0.6);
  svgEl('polyline', { points: runPts.map((p) => `${p[1]},${-p[2]}`).join(' '), class: 'run-all' }, layers.runall);
  const selLine = svgEl('polyline', { class: 'run-sel' }, layers.runsel);
  const arrowG = svgEl('g', { class: 'run-arrows' }, layers.runsel);
  let selPts = [];

  // waypoints (only the chosen task's are shown)
  const wpEls = {};
  for (const [k, p] of Object.entries(data.waypoints)) { wpEls[k] = svgEl('polygon', { class: 'wp' }, layers.way); wpEls[k].p = p; }
  const WP = { pinger: ['pre_torpedo', 'pre_table'], torpedo: ['pre_torpedo'], table: ['pre_table'], markers: ['pre_bin'], home: ['pre_return_home'] };

  // Labels: anchored at a map point, offset in screen pixels so they sit the same at any zoom.
  // `t` is the view (or views) whose close-up shows the label; 'name' labels show only on the whole course.
  const labels = [];
  const label = (text, p, o = {}) => {
    const { dx = 0, dy = 0, anchor = 'middle', cls = '', t = 'name', lead = null } = o;
    const e = svgEl('text', { class: `lab ${cls}`, 'text-anchor': anchor }, textG);
    e.textContent = text;
    let line = null;
    if (lead) line = svgEl('line', { class: 'leader' }, layers.leaders);
    const L2 = { e, p, dx, dy, t: [].concat(t), line, lead, small: cls.includes('small'), badge: cls.includes('num') };
    labels.push(L2);
    return L2;
  };
  const S = T.slalom.rows, G2 = T.gate, Tb = T.table, Su = T.surface.signs, W = data.waypoints;
  const item = Object.fromEntries(Tb.props.map((p) => [p.id, p.p]));
  const crate = Object.fromEntries(T.bins.crates.map((c) => [c.id, c.p]));
  const cx = (b) => [b.reduce((s, q) => s + q[0], 0) / b.length, b.reduce((s, q) => s + q[1], 0) / b.length];
  const half = (k) => { const p = G2.halves[k], c = G2.center, ap = G2.approach; return [p[0] + (ap[0] - c[0]) / 1.5 * 0.45, p[1] + (ap[1] - c[1]) / 1.5 * 0.45]; };
  // whole-course names
  label('Gate', G2.posts[1], { dx: 9, dy: 14, anchor: 'start' });
  label('Slalom', S[2].poles[0], { dy: -14 });
  label('Torpedo', T.torpedo.center, { dx: 10, dy: 18, anchor: 'start' });
  label('Bins', T.bins.center, { dy: -22 });
  label('Octagon', T.surface.center, { dy: -26 });
  label('Nereus start', data.start, { dx: 10, dy: -10, anchor: 'start' });
  // start
  label('Nereus start, 1 m deep', data.start, { dx: 6, dy: 32, anchor: 'start', t: 'start' });
  label('dives in place,', data.start, { dx: 6, dy: 48, anchor: 'start', cls: 'small', t: 'start' });
  label('then heads for the gate', data.start, { dx: 6, dy: 63, anchor: 'start', cls: 'small', t: 'start' });
  label('tag board', [0, 0.45], { dx: 6, dy: -8, anchor: 'start', cls: 'small', t: 'start' });
  label('x', [1.6, 0], { dx: 6, dy: 4, anchor: 'start', cls: 'small axis', t: 'start' });
  label('y', [0, 1.6], { dx: 6, dy: 2, anchor: 'start', cls: 'small axis', t: 'start' });
  label('gate', G2.posts[0], { dy: -12, t: 'start' });
  label('repair', half('repair'), { dy: -16, cls: 'small', t: 'start' });
  label('rescue', half('rescue'), { dx: -16, dy: 4, anchor: 'end', cls: 'small', t: 'start' });
  // gate
  label('repair half (Talos)', half('repair'), { dx: -16, dy: 26, anchor: 'end', t: 'gate' });
  label('rescue half', half('rescue'), { dx: -16, dy: 4, anchor: 'end', t: 'gate' });
  label('divider', G2.divider, { dx: 12, dy: -10, anchor: 'start', t: 'gate' });
  label('post', G2.posts[0], { dx: 12, dy: 4, anchor: 'start', cls: 'small', t: 'gate' });
  label('post', G2.posts[1], { dx: 12, dy: 4, anchor: 'start', cls: 'small', t: 'gate' });
  // slalom
  S.forEach((r, i) => label(`row ${i + 1}`, r.poles[2], { dy: 22, t: 'slalom' }));
  label('red pipe', S[0].poles[1], { dx: 10, dy: 18, anchor: 'start', t: 'slalom' });
  label('white pipe', S[0].poles[0], { dx: -12, dy: 4, anchor: 'end', t: 'slalom' });
  // pinger
  label('listen 10 s', W.pre_torpedo, { dx: -12, dy: 4, anchor: 'end', t: 'pinger' });
  label('listen 10 s', W.pre_table, { dx: -12, dy: 4, anchor: 'end', t: 'pinger' });
  label('torpedo board', T.torpedo.center, { dx: 12, dy: 4, anchor: 'start', t: 'pinger' });
  label('octagon', T.surface.center, { dx: 44, dy: 4, anchor: 'start', t: 'pinger' });
  // torpedo
  label('board', T.torpedo.board[0], { dx: 8, dy: -6, anchor: 'start', t: 'torpedo' });
  label('fires 0.6 m out', firePt, { dx: 0, dy: 46, anchor: 'middle', t: 'torpedo', lead: [0, 32] });
  label('waiting point', W.pre_torpedo, { dx: -12, dy: 4, anchor: 'end', t: 'torpedo' });
  // octagon (the trips themselves are the next view)
  const tableC = cx(Tb.slab);
  label('octagon', T.surface.octagon[2], { dy: -10, t: 'table' });
  label('table', Tb.slab[0], { dx: 8, dy: 14, anchor: 'start', cls: 'small', t: 'table' });
  label('compass', Su.compass, { dx: 10, dy: -6, anchor: 'start', cls: 'small', t: 'table' });
  label('buoy', Su.buoy, { dx: -10, dy: -6, anchor: 'end', cls: 'small', t: 'table' });
  label('hammer and wrench', Su.hammer_and_wrench, { dy: 24, anchor: 'middle', cls: 'small', t: 'table' });
  label('SOS', Su.sos, { dx: 10, dy: 14, anchor: 'start', cls: 'small', t: 'table' });
  label('waiting point', W.pre_table, { dx: -10, dy: -10, anchor: 'end', cls: 'small', t: 'table' });
  // the table, close: four trips, item -> basket
  label('helmet basket', cx(Tb.baskets.helmet), { dy: -14, t: 'trips' });
  label('warning basket', cx(Tb.baskets.warning), { dy: 26, t: 'trips' });
  label('bandage', item.bandage, { dx: 16, dy: 4, anchor: 'start', cls: 'small', t: 'trips' });
  label('plug', item.plug, { dx: 16, dy: 4, anchor: 'start', cls: 'small', t: 'trips' });
  label('pill', item.pill, { dx: -16, dy: 4, anchor: 'end', cls: 'small', t: 'trips' });
  label('nut and bolt', item.nut_and_bolt, { dx: -16, dy: 4, anchor: 'end', cls: 'small', t: 'trips' });
  label('table', Tb.slab[3], { dx: -6, dy: 16, anchor: 'end', cls: 'small', t: 'trips' });
  // bins: markers, then the magnet lights
  const L1 = T.bins.lights[0].p, L2 = T.bins.lights[1].p;
  label('fire bin', crate.bin_vinyl2, { dx: 18, dy: 6, anchor: 'start', t: 'markers' });
  label('fire bin', crate.bin_vinyl3, { dx: -18, dy: -4, anchor: 'end', t: 'markers' });
  label('blood bin', crate.bin_vinyl1, { dx: -18, dy: 6, anchor: 'end', t: 'markers' });
  label('blood bin', crate.bin_vinyl4, { dx: 18, dy: 4, anchor: 'start', t: 'markers' });
  label('light', L1, { dx: -12, dy: 8, anchor: 'end', cls: 'small', t: 'markers' });
  label('light', L2, { dx: 12, dy: -6, anchor: 'start', cls: 'small', t: 'markers' });
  label('waiting point', W.pre_bin, { dx: 12, dy: 4, anchor: 'start', cls: 'small', t: 'markers' });
  label('light', L1, { dx: -10, dy: -8, anchor: 'end', t: 'lights' });
  label('light', L2, { dy: -14, t: 'lights' });
  // home
  label('gate', G2.posts[1], { dy: 22, t: 'home' });
  label('waypoint near the gate', W.pre_return_home, { dx: 8, dy: 22, anchor: 'end', t: 'home' });
  label('from the bins', [13.3, 4.5], { dx: -10, anchor: 'end', cls: 'small', t: 'home' });

  // Numbered stops for the views where the raw track is a tangle. Arrows run prop to prop (kind 'go'; 'back' =
  // Talos reverses onto it; 'look' = which way it faces), each end pulled back by a few px; `bend` bows an arrow
  // sideways (fraction of its length) so trips don't cross. Badges sit on their point, offset in px.
  const standA = [12.0, 11.05], standB = [14.78, 13.56]; // where Talos stopped to look at each light (truth path)
  const bk = (b, u) => [b[0][0] + (b[1][0] - b[0][0]) * u, b[0][1] + (b[1][1] - b[0][1]) * u]; // along a basket's long edge
  const hw = Su.hammer_and_wrench, lookMid = [(tableC[0] + hw[0]) / 2, (tableC[1] + hw[1]) / 2];
  const STOPS = {
    table: { arrows: [[W.pre_table, tableC, 'go', 9, 26], [tableC, hw, 'look', 26, 12]], badges: [[1, [(W.pre_table[0] + tableC[0]) / 2, (W.pre_table[1] + tableC[1]) / 2]], [2, lookMid]] },
    trips: {
      arrows: [
        [item.bandage, bk([Tb.baskets.helmet[0], Tb.baskets.helmet[3]], 0.25), 'go', 12, 3, -0.35],
        [item.pill, bk([Tb.baskets.helmet[0], Tb.baskets.helmet[3]], 0.78), 'go', 12, 3, 0.35],
        [item.nut_and_bolt, bk([Tb.baskets.warning[1], Tb.baskets.warning[2]], 0.7), 'go', 12, 3],
        [item.plug, bk([Tb.baskets.warning[1], Tb.baskets.warning[2]], 0.25), 'go', 12, 3],
      ],
      badges: [[1, item.bandage], [2, item.pill], [3, item.nut_and_bolt], [4, item.plug]],
    },
    markers: { arrows: [[W.pre_bin, crate.bin_vinyl2, 'go', 9, 14], [crate.bin_vinyl2, crate.bin_vinyl3, 'go', 14, 14]], badges: [[1, crate.bin_vinyl2], [2, crate.bin_vinyl3]] },
    lights: {
      arrows: [[standA, L1, 'back', 7, 10], [L1, standB, 'go', 10, 7, -0.1], [standB, L2, 'back', 7, 10]],
      badges: [[3, L1, [12, 16]], [4, L2, [-22, 2]]], marks: [standA, standB],
    },
  };
  const stopG = {};
  for (const [v, s] of Object.entries(STOPS)) {
    const g = svgEl('g', { class: 'stops', 'data-v': v }, layers.stops);
    s.arrowEls = s.arrows.map((a) => ({ a, path: svgEl('path', { class: `sa ${a[2]}` }, g), head: svgEl('polygon', { class: `sh ${a[2]}` }, g) }));
    s.markEls = (s.marks || []).map((p) => ({ p, c: svgEl('circle', { class: 'stand' }, g) }));
    s.badgeEls = s.badges.map(([n, p, off = [0, 0]]) => ({ p, off, c: svgEl('circle', { class: 'badge' }, g), l: label(String(n), p, { dx: off[0], dy: off[1] + 4.2, cls: 'num', t: v }) }));
    stopG[v] = g;
  }
  // a quadratic arrow from a to b bowed by `bend`, trimmed by sa / sb px at its ends; returns points in svg units
  function arrowPts([a, b, , sa, sb, bend = 0], k) {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    const c = [(a[0] + b[0]) / 2 - dy * bend, (a[1] + b[1]) / 2 + dx * bend];
    const N = 32, P = [];
    for (let i = 0; i <= N; i++) { const u = i / N, w = 1 - u; P.push([w * w * a[0] + 2 * w * u * c[0] + u * u * b[0], w * w * a[1] + 2 * w * u * c[1] + u * u * b[1]]); }
    const cum = [0];
    for (let i = 1; i <= N; i++) cum.push(cum[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const L = cum[N], s0 = sa / k, s1 = L - sb / k;
    const at = (s) => { const i = Math.max(1, cum.findIndex((v) => v >= s)); const u = (s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * u, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * u]; };
    if (s1 <= s0 || !len) return null;
    const out = [at(s0)];
    for (let i = 1; i < N; i++) if (cum[i] > s0 && cum[i] < s1) out.push(P[i]);
    out.push(at(s1));
    return out;
  }
  function drawStops(v, k) {
    const s = STOPS[v];
    if (!s) return;
    for (const { a, path, head } of s.arrowEls) {
      const q = arrowPts(a, k);
      if (!q) { path.removeAttribute('d'); head.removeAttribute('points'); continue; }
      const h = 7 / k, e = q[q.length - 1], p = q[q.length - 2];
      const ux = (e[0] - p[0]) / (Math.hypot(e[0] - p[0], e[1] - p[1]) || 1), uy = (e[1] - p[1]) / (Math.hypot(e[0] - p[0], e[1] - p[1]) || 1);
      const base = [e[0] - ux * h * 1.5, e[1] - uy * h * 1.5];
      path.setAttribute('d', 'M' + q.slice(0, -1).concat([base]).map((r) => `${r[0]},${-r[1]}`).join(' L'));
      head.setAttribute('points', [[e[0], e[1]], [base[0] - uy * h, base[1] + ux * h], [base[0] + uy * h, base[1] - ux * h]].map((r) => `${r[0]},${-r[1]}`).join(' '));
    }
    for (const { p, c } of s.markEls) { c.setAttribute('cx', p[0]); c.setAttribute('cy', -p[1]); c.setAttribute('r', 4.5 / k); }
    for (const { p, off, c } of s.badgeEls) { c.setAttribute('cx', p[0] + off[0] / k); c.setAttribute('cy', -p[1] + off[1] / k); c.setAttribute('r', 10 / k); }
  }

  // scale bar (whole course only)
  const sb = svgEl('g', { class: 'scalebar name' }, layers.labels);
  const sbx = vx0 + 0.8, sby = vy0 + 0.8;
  svgEl('line', { x1: sbx, y1: -sby, x2: sbx + 5, y2: -sby }, sb);
  svgEl('line', { x1: sbx, y1: -sby - 0.25, x2: sbx, y2: -sby + 0.25 }, sb);
  svgEl('line', { x1: sbx + 5, y1: -sby - 0.25, x2: sbx + 5, y2: -sby + 0.25 }, sb);
  label('5 m', [sbx + 2.5, sby], { dy: -8, cls: 'small' });

  // hit areas (no tabindex: the step buttons are the keyboard route)
  const hits = {
    gate: [T.gate.center, 1.6], slalom: [T.slalom.center, 2.6], torpedo: [T.torpedo.center, 1.2],
    bins: [T.bins.center, 1.2], table: [T.surface.center, 1.6], start: [data.start, 1.1],
  };
  for (const [id, [c, r]] of Object.entries(hits)) {
    const e = svgEl('circle', { cx: c[0], cy: -c[1], r, class: 'hit' }, layers.hit);
    e.addEventListener('click', () => { if (id !== current) select(id); });
  }

  let current = 'start', view = 'start', whole = false, raf = 0;
  function resize() {
    const k = svg.getBoundingClientRect().width / vb[2]; // px per m
    if (!k) return;
    const fs = 12.5 * TS / k, fsSmall = 11.5 * TS / k, fsNum = 12 * TS / k;
    for (const l of labels) {
      l.e.setAttribute('font-size', l.badge ? fsNum : l.small ? fsSmall : fs);
      l.e.setAttribute('x', (l.p[0] + l.dx / k) * TS);
      l.e.setAttribute('y', (-l.p[1] + l.dy / k) * TS);
      if (l.line) {
        const sx = Math.sign(l.lead[0]) * 5 / k;
        l.line.setAttribute('x1', l.p[0] + sx); l.line.setAttribute('y1', -l.p[1]);
        l.line.setAttribute('x2', l.p[0] + l.lead[0] / k); l.line.setAttribute('y2', -l.p[1] + l.lead[1] / k);
      }
    }
    const d = 6 / k; // waypoint diamonds keep the same size on screen at any zoom
    for (const e of Object.values(wpEls)) { const [x, y] = e.p; e.setAttribute('points', `${x},${-y - d} ${x + d},${-y} ${x},${-y + d} ${x - d},${-y}`); }
    if (!whole) drawStops(view, k);
    arrows(k);
  }
  // arrowheads along the chosen part of the path, about every 110 px on screen
  function arrows(k) {
    arrowG.replaceChildren();
    if (selPts.length < 2) return;
    const seg = [];
    let len = 0;
    for (let i = 1; i < selPts.length; i++) { const a = selPts[i - 1], b = selPts[i]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]); seg.push([a, b, len, l]); len += l; }
    const px = len * k;
    if (px < 30) return;
    const n = Math.max(1, Math.min(8, Math.floor(px / 110)));
    const s = 6 / k;
    for (let j = 0; j < n; j++) {
      const at = len * (j + 0.5) / n;
      const sg = seg.find((q) => at <= q[2] + q[3]) || seg[seg.length - 1];
      if (sg[3] < 1e-6) continue;
      const u = (at - sg[2]) / sg[3];
      const x = sg[0][0] + (sg[1][0] - sg[0][0]) * u, y = sg[0][1] + (sg[1][1] - sg[0][1]) * u;
      const ang = Math.atan2(-(sg[1][1] - sg[0][1]), sg[1][0] - sg[0][0]) * 180 / Math.PI;
      svgEl('polygon', { points: `${1.3 * s},0 ${-s},${0.9 * s} ${-0.4 * s},0 ${-s},${-0.9 * s}`, transform: `translate(${x} ${-y}) rotate(${ang})` }, arrowG);
    }
  }
  let lastW = 0;
  new ResizeObserver(() => {
    const w = svg.getBoundingClientRect().width;
    if (w && Math.abs(w - lastW) > 1 && !raf) { vb = whole ? WHOLE : closeBox(view); svg.setAttribute('viewBox', vb.join(' ')); }
    lastW = w;
    resize();
    locate();
  }).observe(host);

  function show(id, v) {
    const t = byId[id];
    current = id;
    view = v || viewsOf(id)[0][0];
    const stops = !whole && STOPS[view];
    svg.dataset.sel = id;
    svg.dataset.view = whole ? 'whole' : view;
    svg.classList.toggle('whole', whole);
    svg.classList.toggle('stopped', !!stops);
    for (const [k, g] of Object.entries(groups)) g.classList.toggle('sel', k === id || (id === 'home' && k === 'gate'));
    for (const l of labels) {
      const on = whole ? l.t.includes('name') : l.t.includes(view);
      l.e.style.display = on ? '' : 'none';
      if (l.line) l.line.style.display = on ? '' : 'none';
      l.e.classList.toggle('sel', whole && l.t.includes('name') && l.e.textContent.toLowerCase().startsWith((t.chip === 'Start' ? 'nereus' : t.chip).toLowerCase()));
    }
    for (const [k, g] of Object.entries(stopG)) g.style.display = !whole && k === view ? '' : 'none';
    svg.querySelectorAll('.det').forEach((e) => { e.style.display = !whole && e.dataset.t === view ? '' : 'none'; });
    const ws = whole ? [] : WP[view] || [];
    for (const [k, e] of Object.entries(wpEls)) e.style.display = ws.includes(k) ? '' : 'none';
    // the chosen task's part of the path (views with numbered stops leave the raw track grey)
    const runs = runOf(t);
    selPts = stops ? [] : data.run.path.filter((p) => runs.some(([, a, b]) => p[0] >= a - 0.6 && p[0] <= b + 0.6)).map((p) => [p[1], p[2]]);
    selLine.setAttribute('points', selPts.map((p) => `${p[0]},${-p[1]}`).join(' '));
    animateTo(whole ? WHOLE : closeBox(view));
    views(id);
    locate();
  }
  // On a wide screen the close-up shows more of the course instead of blowing the props up.
  function closeBox(v) {
    const b = CLOSE[v], px = svg.getBoundingClientRect().width || 335;
    const w = Math.max(b[2], px / (MAXK[v] || 75)), hh = w / ASPECT;
    return [b[0] + b[2] / 2 - w / 2, b[1] + b[3] / 2 - hh / 2, w, hh];
  }
  function animateTo(to) {
    cancelAnimationFrame(raf);
    const from = vb.slice(), ts = performance.now(), D = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420;
    const step = (now) => {
      const u = D ? Math.min((now - ts) / D, 1) : 1, e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      vb = from.map((v, i) => v + (to[i] - v) * e);
      svg.setAttribute('viewBox', vb.join(' '));
      resize();
      raf = u < 1 ? requestAnimationFrame(step) : 0;
    };
    raf = requestAnimationFrame(step);
  }

  // the views of one step (Octagon, Bins), and what the numbers on the map mean
  const vHost = document.getElementById('course-views');
  const vSeg = vHost.querySelector('.seg'), vNote = vHost.querySelector('.rs-stopnote');
  function views(id) {
    const vs = VIEWS[id];
    vHost.hidden = whole || !vs;
    if (whole || !vs) return;
    vSeg.replaceChildren(...vs.map(([v, name, note]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(v === view) }, name);
      b.addEventListener('click', () => { if (v !== view) show(id, v); });
      return b;
    }));
    vNote.innerHTML = vs.find((x) => x[0] === view)[2];
  }

  // the locator: the whole course, small, with the close-up's box; tapping it swaps close-up and whole course
  const loc = document.getElementById('course-loc');
  const lsvg = svgEl('svg', { viewBox: WHOLE.join(' '), class: 'rs-locsvg', 'aria-hidden': 'true' }, loc);
  svgEl('rect', { x: WHOLE[0] - 1, y: WHOLE[1] - 1, width: WHOLE[2] + 2, height: WHOLE[3] + 2, class: 'deck' }, lsvg);
  svgEl('polygon', { points: pts(data.pool.corners), class: 'water' }, lsvg);
  svgEl('polyline', { points: runPts.map((p) => `${p[1]},${-p[2]}`).join(' '), class: 'run-all' }, lsvg);
  const dots = { start: data.start, gate: T.gate.center, slalom: T.slalom.center, torpedo: T.torpedo.center, table: T.surface.center, bins: T.bins.center };
  for (const p of Object.values(dots)) svgEl('circle', { cx: p[0], cy: -p[1], r: 0.55, class: 'dot' }, lsvg);
  const lbox = svgEl('rect', { class: 'box' }, lsvg);
  const lcap = h('span', { class: 'rs-loccap' }, 'Whole course');
  loc.appendChild(lcap);
  function locate() {
    // the close-up's box, clipped to the locator so it is never drawn cut off
    const b = closeBox(view), m = 0.3;
    const x0 = Math.max(b[0], WHOLE[0] + m), y0 = Math.max(b[1], WHOLE[1] + m);
    const x1 = Math.min(b[0] + b[2], WHOLE[0] + WHOLE[2] - m), y1 = Math.min(b[1] + b[3], WHOLE[1] + WHOLE[3] - m);
    for (const [k, v] of Object.entries({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 })) lbox.setAttribute(k, v);
    lbox.style.display = whole ? 'none' : '';
    lcap.textContent = whole ? 'Close-up' : 'Whole course';
    loc.setAttribute('aria-pressed', String(whole));
    loc.setAttribute('aria-label', whole ? 'Back to the close-up' : 'Show the whole course');
  }
  loc.addEventListener('click', () => { whole = !whole; show(current, view); });
  return { show(id) { show(id); } };
})();

// step buttons: one per task in run order, with the time it starts in the Nereus run
const chips = (() => {
  const host = document.getElementById('task-chips');
  const btns = {};
  for (const t of TASKS) {
    const b = h('button', { type: 'button', 'aria-pressed': 'false' }, `<b>${t.chip}</b><small>${mmss(startOf(t))}</small>`);
    b.setAttribute('aria-label', `${t.chip}, from ${mmss(startOf(t))} in the run`);
    b.addEventListener('click', () => select(t.id));
    btns[t.id] = b;
    host.appendChild(b);
  }
  return { show(id) { for (const [k, b] of Object.entries(btns)) b.setAttribute('aria-pressed', String(k === id)); } };
})();

// under the map: where we are in the run, and previous / next
const stepper = (() => {
  const now = document.getElementById('course-now');
  const prev = document.getElementById('step-prev'), next = document.getElementById('step-next');
  let i = 0;
  prev.addEventListener('click', () => { if (i > 0) select(ORDER[i - 1]); });
  next.addEventListener('click', () => select(ORDER[(i + 1) % ORDER.length]));
  return {
    show(id) {
      i = ORDER.indexOf(id);
      const t = byId[id];
      now.innerHTML = `<span class="step">Step ${i + 1} of ${ORDER.length}</span> <b>${t.title}</b><span class="when">${mmss(startOf(t))} to ${mmss(endOf(t))} in the run</span>`;
      prev.disabled = i === 0;
      prev.innerHTML = i > 0 ? `‹ ${byId[ORDER[i - 1]].chip}` : '‹';
      next.innerHTML = i < ORDER.length - 1 ? `${byId[ORDER[i + 1]].chip} ›` : 'Start again';
      prev.setAttribute('aria-label', i > 0 ? `Previous: ${byId[ORDER[i - 1]].title}` : 'Previous');
      next.setAttribute('aria-label', i < ORDER.length - 1 ? `Next: ${byId[ORDER[i + 1]].title}` : 'Back to the start');
    },
  };
})();

// task card
const wide = matchMedia('(min-width: 861px)');
function card(id) {
  const t = byId[id];
  const host = document.getElementById('task-card');
  const runs = runOf(t);
  const runText = runs.map(([n, a, b]) => `${t.phases.length > 1 ? n.toLowerCase() + ' ' : ''}${mmss(a - t0)}–${mmss(b - t0)}`).join(', ');
  const img = (im) => im ? `<figure class="rs-shot"><img src="${IMG(im[0])}" loading="lazy" decoding="async" alt="${im[1].replace(/<[^>]+>/g, '')}" width="${im[2]}" height="${im[3]}" style="max-width:${im[2]}px"><figcaption>${im[1]}</figcaption></figure>` : '';
  const sub = t.sub.map((s) => s === '_home_path' ? `<a href="${TREE_URL}#L${L._home_path}">the home path</a>` : tl(s)).join(', ');
  const tag = t.n ? `Handbook task ${t.n}, ${t.hb}` : (id === 'pinger' ? 'Not a task: a bonus on two tasks' : 'Before the gate');
  const pts = id === 'start' ? `up to ${fmt(totalOf(t))} points, counted with the gate` : `up to ${fmt(totalOf(t))} points`;
  const kit = typeof t.kit === 'string' ? `<span>${t.kit}</span>` : t.kit.length ? t.kit.map(([k, v]) => `<span><b>${k}</b> ${v}</span>`).join('') : '<span>No camera or mechanism</span>';
  const pics = [t.img, t.img2].filter(Boolean);
  const open = wide.matches ? ' open' : '';
  host.innerHTML = `
    <div class="rs-card-head"><p class="tag">${tag}</p><h3>${t.title}</h3><p class="max"><a href="#scoring">${pts}</a></p></div>
    <p class="what">${t.what}</p>
    <p class="kit">${kit}</p>
    <h4>How Talos does it <span class="subs">${sub}</span></h4>
    <ul>${t.talos.map((r) => `<li>${r}</li>`).join('')}</ul>
    ${pics.length ? `<details class="rs-d"${open}><summary>${pics.length > 1 ? 'Two pictures' : 'A picture'} from the Nereus run</summary>${pics.map(img).join('')}</details>` : ''}
    <details class="rs-d"><summary>What the rules ask</summary><ul>${t.rules.map((r) => `<li>${r}</li>`).join('')}</ul></details>
    <details class="rs-d"><summary>Points, row by row</summary><table class="pts">${t.points.map(([k, v]) => `<tr><td>${k}</td><td>${fmt(v)}</td></tr>`).join('')}</table></details>
    <p class="run">In the Nereus run: <b>${runText}</b> <button type="button" class="btn rs-watch">Watch this task</button></p>
    <p class="readmore"><b>Read more:</b> ${t.read.map(([href, title]) => `<a href="${href}">${title}</a>`).join(' · ')}</p>`;
  host.querySelector('.rs-watch').addEventListener('click', () => video.play(runs[0][1]));
  // keep a number with its unit ("0.6 m") on one line
  const walk = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  while (walk.nextNode()) walk.currentNode.data = walk.currentNode.data.replace(/(\d) (m|cm|s|kg)\b/g, '$1\u00a0$2');
}

// the viewer video of the same run (8x): run time -> video time from the Gate chapter of mission_video.json
const video = (() => {
  const v = document.getElementById('run-video');
  v.poster = IMG('run_8x.jpg');
  v.src = IMG('run_8x.mp4'); // set here: Vite would prefix the base again on an HTML src
  let vd = null;
  fetch(`${BASE}data/mission_video.json`).then((r) => r.json()).then((d) => { vd = d; });
  return {
    play(runT) {
      if (!vd) return;
      const gate = vd.chapters.find((c) => c[1] === 'Gate');
      const off = data.run.phases[0][1] - gate[0] * vd.speed;
      const go = () => { v.currentTime = Math.max(0, (runT - off) / vd.speed); v.play().catch(() => {}); };
      if (v.readyState >= 1) go(); else { v.preload = 'auto'; v.addEventListener('loadedmetadata', go, { once: true }); v.load(); }
      v.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  };
})();

function select(id) {
  map.show(id);
  chips.show(id);
  stepper.show(id);
  card(id);
}
select('gate');

// A link to an anchor inside a closed <details> opens it.
function openTarget() {
  const el = location.hash ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null;
  const d = el?.closest('details');
  if (d && !d.open) { d.open = true; el.scrollIntoView(); }
}
addEventListener('hashchange', openTarget);
openTarget();

// ---------------------------------------------------------------- scoring explorer
{
  // In run order. A row with a reason (third item) is one RepairCompMpcTree doesn't go for.
  const SC = [
    { task: 'Gate', rows: [
      ['Pass through', P.gate],
      ['Maintain control', 150, null, 'judged'],
      ['Heading coin flip', P.heading],
      ['Role coin flip', P.role, null, 'role'],
      [`Style, ${P.max_style_quarters} quarter turns of roll or pitch`, P.style_rp * P.max_style_quarters, 'FlipTree fails under the MPC, so no style points.'],
    ] },
    { task: 'Slalom', rows: [['3 rows on the same side as the gate', 3 * P.slalom_same], ['3 rows within the pipes\' height', 3 * P.slalom_depth]] },
    { task: 'Random pinger', rows: [['First pinger task', P.pinger_first, 'The tree\'s pinger order looks inverted (<a href="#pinger-caveat">see the note</a>), so not counted.', 'judged'], ['Second pinger task', P.pinger_second, 'Comes after the first, so not counted either.', 'judged']] },
    { task: 'Torpedoes', rows: [['2 torpedoes through', 2 * P.torpedo], ['Large then small, your role', P.sequence], ['Both from ≥ 0.46 m', 2 * P.distance_far]] },
    { task: 'Octagon, table', rows: [['Surface inside', P.surface], ['Face the right image', P.facing_count], ['Surface holding each of 4 objects', 4 * P.object_surface], ['Release 4 objects', 4 * P.object_drop], ['4 objects in their baskets', 4 * P.basket_correct], ['Turns = objects in baskets', P.basket_count]] },
    { task: 'Bins, lights', rows: [['2 markers in a bin', 2 * P.bin], ['…each in a different bin of your role', 2 * P.bin_class], ['2 lights turned off', P.light * P.max_lights]] },
    { task: 'Return home', rows: [['Back through the gate', P.home]] },
    { task: 'Inter-vehicle comms', rows: [['Two vehicles talking, by level', 1000, 'Not part of this tree: it needs Talos and Triton working together.', 'judged']] },
  ];
  const list = document.getElementById('score-list');
  const totalEl = document.getElementById('score-total');
  const sum = (rows) => rows.reduce((a, r) => a + r[1], 0);
  const max = Math.max(...SC.map((s) => sum(s.rows)));
  let mode = 'talos';
  const items = SC.map((s) => {
    const det = h('details', { class: 'sc' });
    const sm = h('summary');
    sm.innerHTML = `<span class="name">${s.task}</span><span class="track"><i class="on"></i><i class="rest"></i></span><span class="val"></span>`;
    det.appendChild(sm);
    const ul = h('ul');
    det.appendChild(ul);
    list.appendChild(det);
    return { s, sm, ul };
  });
  function render() {
    let grand = 0;
    for (const { s, sm, ul } of items) {
      // the bar is the same in both modes: dark = rows Talos goes for, light = the rest; the number follows the mode
      const all = sum(s.rows), mine = sum(s.rows.filter((r) => !r[2]));
      const tot = mode === 'talos' ? mine : all;
      grand += tot;
      sm.querySelector('.on').style.width = `${(mine / max) * 100}%`;
      sm.querySelector('.rest').style.width = `${((all - mine) / max) * 100}%`;
      sm.querySelector('.val').textContent = fmt(tot);
      ul.innerHTML = s.rows.map((r) => {
        const off = mode === 'talos' && r[2];
        return `<li class="${off ? 'off' : ''}"><span>${r[0]}${r[3] === 'judged' ? ' <small>(judges only)</small>' : ''}${r[3] === 'role' && mode === 'talos' ? '<em class="note">Counted: the operator starts the Repair or Rescue tree that matches the flip.</em>' : ''}${off ? `<em>${r[2]}</em>` : ''}</span><b>${fmt(r[1])}</b></li>`;
      }).join('');
    }
    totalEl.innerHTML = `<span>${mode === 'talos' ? 'What <code>RepairCompMpcTree</code> goes for' : 'Every row together'}</span><b>${fmt(grand)}</b>`
      + '<small>Plus the weight bonus and, if one slalom row, one bin or torpedo and a full surface in the octagon all score, 100 per minute left.</small>';
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
  const host = document.getElementById('pq-map');
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
  // two lines that keep their spacing at any width, set just below the gate's end in fit()
  const gateT = svgEl('text', { x: 4 * TS, 'text-anchor': 'middle' }, textG);
  gateT.innerHTML = `<tspan x="${4 * TS}">gate, 2 m wide,</tspan><tspan x="${4 * TS}" dy="1.2em">1 m deep</tspan>`;
  texts.push(gateT);
  tx('pole', 14, 0.5);
  svgEl('line', { x1: 14, y1: 0, x2: 14, y2: R, class: 'dim' }, svg);
  tx('3 m', 14.3, -1.6, 'start', 'muted');
  tx('start', 1, 1.5, 'middle', 'muted');
  tx('10 m', 9, -3.5, 'middle', 'muted');
  svgEl('line', { x1: 4, y1: 3.8, x2: 14, y2: 3.8, class: 'dim' }, svg);
  for (const x of [4, 14]) svgEl('line', { x1: x, y1: 3.5, x2: x, y2: 4.1, class: 'dim' }, svg);
  for (const y of [0, R]) svgEl('line', { x1: 13.75, y1: y, x2: 14.25, y2: y, class: 'dim' }, svg);
  const bot = svgEl('g', { class: 'bot' }, svg);
  svgEl('polygon', { points: '0.6,0 0.35,0.2 -0.45,0.2 -0.45,-0.2 0.35,-0.2' }, bot);
  svgEl('circle', { cx: 0.42, cy: 0, r: 0.07, class: 'nose' }, bot);
  function place(i) {
    const { p, look } = pts[Math.min(i, pts.length - 1)];
    const q = pts[Math.min(i + 1, pts.length - 1)].p, pr = pts[Math.max(i - 1, 0)].p;
    const yaw = look ? Math.atan2(look[1] - p[1], look[0] - p[0]) : Math.atan2(q[1] - pr[1], q[0] - pr[0]);
    bot.setAttribute('transform', `translate(${p[0]} ${-p[1]}) rotate(${-yaw * 180 / Math.PI})`);
  }
  place(0);
  function fit() {
    const k = svg.getBoundingClientRect().width / (x1 - x0);
    if (!k) return;
    for (const t of texts) t.setAttribute('font-size', 12 * TS / k);
    gateT.setAttribute('y', (1 + 18 / k) * TS);
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
    ['Riptide 1.0', '2016', null, 'The first AUV, built 2015–16: one main hull in a minimal aluminium chassis. The whole software stack is named after it.', 'robot_riptide1.webp', 'Riptide 1.0 on a wet wooden dock: a black cylindrical hull in a low open frame, team members crouched around it'],
    ['Riptide 2.0', '2017', null, 'The same main hull in a slightly redesigned chassis, with upgraded sensors and better manoeuvrability.', 'robot_riptide2.webp', 'Riptide 2.0 on a blue-covered table: a black cylindrical hull in a grey frame, team members in red shirts behind it'],
    ['Maelstrom', '2018', null, 'Riptide\'s main hull in a new aluminium chassis. 10th of 47 at RoboSub 2018.', 'robot_maelstrom.webp', 'Maelstrom on a stone ledge: a black hull with a clear front dome inside an open, cut-out black aluminium frame'],
    ['Puddles', '2019, 2020', 'puddles', '11th of 55 in 2019, 10th of 33 in 2020.', 'robot_puddles.webp', 'Puddles on a blue-covered table: one long black and clear hull with sponsor logos and a thruster at each end, team members behind'],
    ['Tempest', '2022', 'tempest', 'Started in 2020 for 2021; the pandemic moved its only competition to 2022. First-generation (Mark 1) electronics.', 'robot_tempest.webp', 'Tempest on pavement: two clear-ended hulls side by side under white top plates, on a red frame'],
    ['Talos', '2023 to 2026', 'talos', 'Designed from August 2022 to fix Tempest\'s weak points: stiffer chassis, Mark 2 electronics (a board stack talking over CAN), smart battery housings. Claw added for 2026. 2nd in the Autonomy Challenge in 2024, 4th in 2026.', 'robot_talos.webp', 'Talos on a lab bench, seen from the front: two round clear viewports with electronics inside, thrusters on angled arms'],
    ['SS Flip Barker', '2025', 'liltank?', 'A second vehicle for the 2025 table task: a ballast tank for depth and tracks to drive. Did not qualify.', 'robot_ssfb.webp', 'SS Flip Barker on a beach: black housings and a clear tube with a red end cap, on rubber tracks'],
    ['Triton', '2026', null, 'Rebuilt around the SS Flip Barker\'s hull: smaller than Talos, eight thrusters, boards based on Talos\'s designs, no DVL (ZED X Mini visual odometry), and talks to Talos acoustically. Runs the separate Mercury stack.', 'robot_triton.webp', 'Triton on a stone ledge, seen from the front: a black box frame round a single viewport, white floats at the corners, a red handle on top'],
  ];
  const host = document.getElementById('robots');
  for (const [name, years, code, text, img, alt] of robots) {
    host.appendChild(h('figure', {}, `<img class="media" src="${IMG(img)}" alt="${alt}" loading="lazy" width="640" height="427">`
      + `<figcaption><b>${name}</b> <span class="yr">${years}</span>${code ? ` <code>${code}</code>` : ''}<br>${text}</figcaption>`));
  }
}
