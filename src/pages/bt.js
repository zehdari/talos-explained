import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/bt.css';
import { Graph } from '../viz/bt-graph.js';
import { Sim, IDLE, RUNNING, SUCCESS, FAILURE, TICK } from '../viz/bt-engine.js';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/';
const TREE_URL = GH + 'trees/RepairCompMpcTree.xml';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const getJSON = (f) => fetch(`${BASE}data/bt/${f}`).then((r) => r.json());


// ---------- doTask's loop ----------
{
  const host = document.getElementById('dotask-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const INFO = {
    goal: '<b>ExecuteTree goal</b> on <code>autonomy/run_tree</code>: the path of a tree file, sent by the Nereus viewer\'s autonomy panel. Rejected if the file does not exist. (There is also an "already running" check, but it never fires: the worker thread is detached at once. See Chapter 2.)',
    load: '<b>Build the tree.</b> <code>createTreeFromFile</code> parses the XML and creates every node; <code>initRosForTree</code> then gives each Talos node the ROS node handle and calls its <code>rosInit()</code>. Loggers start: the <code>.fbl</code> file in ~/btlogs and the node stack on <code>autonomy/tree_stack</code>.',
    tick: '<b>tickRoot()</b>: one tick, from the root down. While the root answers RUNNING, <code>doTask</code> sleeps to the next 30&nbsp;ms mark and ticks again, about 33 times a second. Tap the other steps for the rest.',
    sleep: '<b>RUNNING:</b> check for a cancel, then <code>loop_rate.sleep()</code>, an <code>rclcpp::Rate</code> of 30&nbsp;ms: it sleeps whatever is left of the 30&nbsp;ms, so roughly 33 ticks a second when ticks are quick. Then tick again.',
    halt: '<b>Cancel requested</b> (the viewer\'s Stop): <code>haltTree()</code> halts every RUNNING node. <code>FollowPath</code> cancels its MPC goal; most other nodes do nothing when halted. The kill switch does not end a tree: its check is commented out.',
    done: '<b>Tree ends.</b> <code>doTask</code> publishes <code>DISABLED</code> on <code>controller/linear</code> and <code>controller/angular</code>. The LEDs breathe green for SUCCESS, red for FAILURE. After a cancel the root is still RUNNING: the goal is marked canceled and the LEDs breathe red. If a node throws, the LEDs flash red fast and the goal is aborted.',
  };
  new Graph(host, {
    width: 900, height: 250, defaultId: 'tick',
    nodes: [
      { id: 'goal', x: 95, y: 55, label: 'ExecuteTree goal', sub: 'autonomy/run_tree' },
      { id: 'load', x: 290, y: 55, label: 'Build the tree', sub: 'XML → nodes, rosInit' },
      { id: 'tick', x: 485, y: 55, label: 'tickRoot()', sub: 'one tick', bold: true },
      { id: 'sleep', x: 485, y: 200, label: 'sleep to next 30 ms', sub: 'loop_rate.sleep()' },
      { id: 'done', x: 790, y: 55, label: 'Tree ends', sub: 'controller off, LEDs' },
      { id: 'halt', x: 790, y: 200, label: 'haltTree()', sub: 'halt RUNNING nodes' },
    ],
    edges: [
      { from: 'goal', to: 'load' }, { from: 'load', to: 'tick' },
      { from: 'tick', to: 'sleep', label: 'RUNNING', bend: -28 },
      { from: 'sleep', to: 'tick', bend: -28 },
      { from: 'tick', to: 'done', label: 'SUCCESS / FAILURE' },
      { from: 'tick', to: 'halt', label: 'cancel', lx: 655, ly: 118 },
      { from: 'halt', to: 'done' },
    ],
    narrow: {
      // phones: drawn 300 wide so the text lands at 12-13 px on a 390 px screen
      below: 880, width: 300, height: 432,
      nodes: {
        goal: { x: 150, y: 30 }, load: { x: 150, y: 108 }, tick: { x: 150, y: 190 },
        sleep: { x: 72, y: 296, label: 'sleep, 30 ms' }, halt: { x: 226, y: 296 }, done: { x: 150, y: 402 },
      },
      edges: {
        'tick>sleep': { bend: 20, lx: 40, ly: 236 }, 'sleep>tick': { bend: 20 },
        'tick>done': { lx: 150, ly: 352 }, 'tick>halt': { lx: 214, ly: 238, anchor: 'start' },
      },
    },
    info: (n) => { note.innerHTML = INFO[n ? n.id : 'tick']; },
  }).highlight(null);
  host.appendChild(note);
}

// ---------- WaitForKillSwitch, one tick at a time ----------
{
  const host = document.getElementById('wfk-graph');
  const SVGNS = 'http://www.w3.org/2000/svg';
  // the nodes of RepairCompMpcTree.xml lines 3087-3103, in document order; d = depth
  const N = [
    { id: 'root', d: 0, label: 'Sequence', sub: 'the subtree', x: 481, y: 40, bold: true, k: 'ctrl' },
    { id: 'st1', d: 1, label: 'SetStatus', sub: 'waiting', x: 76, y: 150, w: 104, k: 'ros' },
    { id: 'info1', d: 1, label: 'Info', sub: 'Waiting…', x: 204, y: 150, w: 112, k: 'act' },
    { id: 'wait5a', d: 1, label: 'Wait', sub: '5 s', x: 328, y: 150, w: 96, k: 'ros' },
    { id: 'retry', d: 1, label: 'RetryUntilSuccessful', sub: 'num_attempts −1', x: 481, y: 150, w: 170, bold: true, k: 'dec' },
    { id: 'seq', d: 2, label: 'Sequence', sub: 'one check', x: 481, y: 255, w: 150, bold: true, k: 'ctrl' },
    { id: 'get', d: 3, label: 'GetBoolTopic', sub: 'state/kill', x: 298, y: 360, w: 150, k: 'ros' },
    { id: 'inv', d: 3, label: 'Inverter', sub: '"IsFalse"', x: 443, y: 360, w: 100, k: 'dec' },
    { id: 'istrue', d: 4, label: 'IsTrue', sub: '{kill_switch_inserted}', x: 443, y: 460, k: 'cond' },
    { id: 'wait1', d: 3, label: 'Wait', sub: '1 s', x: 561, y: 360, w: 96, k: 'ros' },
    { id: 'info2', d: 3, label: 'Info', sub: 'INSERTED…', x: 684, y: 360, w: 110, k: 'act' },
    { id: 'st2', d: 1, label: 'SetStatus', sub: 'starting', x: 638, y: 150, w: 104, k: 'ros' },
    { id: 'wait5b', d: 1, label: 'Wait', sub: '5 s', x: 758, y: 150, w: 96, k: 'ros' },
  ];
  const PARENT = { st1: 'root', info1: 'root', wait5a: 'root', retry: 'root', st2: 'root', wait5b: 'root', seq: 'retry', get: 'seq', inv: 'seq', wait1: 'seq', info2: 'seq', istrue: 'inv' };
  const INFO = {
    root: '<b>Sequence</b>: ticks its six children in order. While one is RUNNING it comes straight back to it on the next tick, without re-ticking the ones before.',
    st1: '<b>SetStatus</b> <code>waiting</code>: LEDs solid red. Finishes in <code>onStart</code>, so it returns SUCCESS at once.',
    info1: '<b>Info</b>: prints "Waiting for kill switch insert..." and returns SUCCESS.',
    wait5a: '<b>Wait</b> 5 s: RUNNING on every tick until 5 s have passed since its first tick, then SUCCESS.',
    retry: '<b>RetryUntilSuccessful</b>, <code>num_attempts="-1"</code>: if its child fails, it resets the child and ticks it again in the same tick, forever. RUNNING passes straight up.',
    seq: '<b>Sequence</b>: one check of the switch. Read the topic, check it says false, wait 1 s, print. Any FAILURE fails the whole check.',
    get: '<b>GetBoolTopic</b> on <code>state/kill</code>: subscribes in <code>onStart</code> and returns RUNNING; SUCCESS once a message has arrived, written to <code>kill_switch_inserted</code>. FAILURE after 3 s with no message.',
    inv: '<b>Inverter</b> (named "IsFalse"): turns SUCCESS into FAILURE and back. Together with <code>IsTrue</code> it asks "is the value false?"',
    istrue: '<b>IsTrue</b>, a condition: SUCCESS if <code>kill_switch_inserted</code> is true, which <code>state/kill</code> makes it while the robot is killed.',
    wait1: '<b>Wait</b> 1 s: RUNNING until a second has passed.',
    info2: '<b>Info</b>: prints "KILL SWITCH INSERTED, TREE STARTING IN 5 SECONDS".',
    st2: '<b>SetStatus</b> <code>starting</code>: LEDs blink blue.',
    wait5b: '<b>Wait</b> 5 s, then the subtree succeeds and the mission goes on.',
  };
  // per scene: for each node it reached, [order, status] for each time this tick reached it
  const S = 'SUCCESS', F = 'FAILURE', R = 'RUNNING';
  const SCENES = [
    { label: 'First tick', t: { root: [[1, R]], st1: [[2, S]], info1: [[3, S]], wait5a: [[4, R]] },
      text: '<code>Sequence</code> ticks <code>SetStatus</code> (LEDs red) and <code>Info</code>, which both finish at once, then <code>Wait</code>, which returns RUNNING. The Sequence stops there and returns RUNNING too.' },
    { label: 'After 5 s', t: { root: [[1, R]], wait5a: [[2, S]], retry: [[3, R]], seq: [[4, R]], get: [[5, R]] },
      text: 'About 167 ticks later (5 s at 30 ms a tick), the Sequence goes straight back to <code>Wait</code>; the first two are not ticked again. <code>Wait</code> succeeds, so the tick goes on through the retry and its Sequence to <code>GetBoolTopic</code>, which subscribes and returns RUNNING. RUNNING passes all the way up.' },
    { label: 'Killed', t: { root: [[1, R]], retry: [[2, R]], seq: [[3, F], [7, R]], get: [[4, S], [8, R]], inv: [[5, F]], istrue: [[6, S]] },
      text: 'A message says killed. <code>GetBoolTopic</code> writes <code>true</code> and succeeds; <code>IsTrue</code> succeeds, the <code>Inverter</code> turns that into FAILURE, and the inner Sequence fails. The retry resets it and ticks it again in the same tick (7, 8): <code>GetBoolTopic</code> starts a fresh read and returns RUNNING.' },
    { label: 'Not killed', t: { root: [[1, R]], retry: [[2, R]], seq: [[3, R]], get: [[4, S]], inv: [[5, S]], istrue: [[6, F]], wait1: [[7, R]] },
      text: 'A message says not killed. <code>GetBoolTopic</code> writes <code>false</code>; <code>IsTrue</code> fails, the <code>Inverter</code> turns that into SUCCESS, and the Sequence moves on to <code>Wait</code> 1 s, which returns RUNNING.' },
    { label: 'After 1 s', t: { root: [[1, R]], retry: [[2, S]], seq: [[3, S]], wait1: [[4, S]], info2: [[5, S]], st2: [[6, S]], wait5b: [[7, R]] },
      text: 'The inner Sequence resumes at <code>Wait</code> (it does not read the switch again), prints, and succeeds, and so does the retry. The outer Sequence moves on: LEDs blink blue, and the last <code>Wait</code> runs.' },
  ];
  let scene = 0, picked = null;
  host.innerHTML = `<div class="controls wfk-steps">
      <button class="btn wfk-step" data-d="-1" aria-label="Previous step">‹</button>
      <span class="seg" role="group" aria-label="Which step">${SCENES.map((c, i) => `<button data-s="${i}" aria-pressed="${i === scene}" aria-label="${i + 1}: ${c.label}"><b>${i + 1}</b><span class="w"> ${c.label}</span></button>`).join('')}</span>
      <button class="btn wfk-step" data-d="1" aria-label="Next step">›</button>
    </div>
    <div class="wfk-svg"></div>
    <div class="bt-tree wfk-outline" role="tree" aria-label="WaitForKillSwitch"></div>
    <div class="graph-note wfk-scene" aria-live="polite"></div>
    <div class="wfk-info"></div>`;
  const gHost = host.querySelector('.wfk-svg');
  const outline = host.querySelector('.wfk-outline');
  // the drawn tree needs its full 830 px; narrower, the same nodes show as an indented outline
  // (830 units wide: drawn any smaller its text drops under 11 px, so below that width the outline shows instead)
  new ResizeObserver(() => host.classList.toggle('as-outline', host.clientWidth - 2 * parseFloat(getComputedStyle(host).paddingLeft) < 830)).observe(host);

  const graph = new Graph(gHost, {
    width: 830, height: 500, arrows: false, dim: false,
    nodes: N.map((n) => ({ ...n, h: 58 })),
    edges: Object.entries(PARENT).map(([c, p]) => ({ from: p, to: c, opacity: 0 })),
    info: (n) => { if (n || picked) { picked = n ? n.id : null; showInfo(); } },
  });
  // tree lines: down from the parent, along a bar, down onto the top of each child; three lines of text in each box
  graph.nodes.forEach((n) => { const [a, b] = n.g.querySelectorAll('text'); a.setAttribute('y', -15); b.setAttribute('y', 1); });
  Object.entries(PARENT).forEach(([c, p]) => {
    const a = graph.nodes.get(p), b = graph.nodes.get(c);
    const top = a.y + a.h / 2, mid = (top + b.y - b.h / 2) / 2;
    const path = document.createElementNS(SVGNS, 'path');
    path.setAttribute('class', 'edge wfk-elbow');
    path.setAttribute('d', `M${a.x},${top} V${mid} H${b.x} V${b.y - b.h / 2 - 1}`);
    graph.gEdges.appendChild(path);
  });
  graph.svg.classList.add('wfk');

  const visits = (id) => SCENES[scene].t[id];
  function drawSvg() {
    graph.svg.querySelectorAll('.wfk-x').forEach((e) => e.remove());
    graph.nodes.forEach((n, id) => {
      const v = visits(id);
      n.g.classList.toggle('wfk-off', !v);
      ['SUCCESS', 'FAILURE', 'RUNNING'].forEach((st) => n.g.classList.toggle('wfk-' + st, !!v && v[v.length - 1][1] === st));
      if (!v) return;
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('class', 'wfk-x wfk-chip');
      t.setAttribute('x', 0); t.setAttribute('y', 17); t.style.textAnchor = 'middle';
      v.forEach(([o, st], k) => {
        if (k) { const sp = document.createElementNS(SVGNS, 'tspan'); sp.textContent = ', '; sp.setAttribute('class', 'then'); t.appendChild(sp); }
        const ord = document.createElementNS(SVGNS, 'tspan'); ord.setAttribute('class', 'ord'); ord.textContent = o + ' '; t.appendChild(ord);
        const sp = document.createElementNS(SVGNS, 'tspan'); sp.setAttribute('class', 'st ' + st); sp.textContent = st; t.appendChild(sp);
      });
      n.g.appendChild(t);
    });
  }
  function drawOutline() {
    outline.innerHTML = N.map((n) => {
      const v = visits(n.id);
      const last = v ? v[v.length - 1][1] : null;
      const det = v && v.length > 1 ? `${v[0][1]} first, then ${v[1][1]} when the retry ticks it again` : '';
      return `<div class="bt-row${v ? ' now' : ' off'}${picked === n.id ? ' sel' : ''}" style="--d:${n.d}" data-n="${n.id}" role="treeitem" tabindex="0">
        <span class="chip ${last || ''}${v ? ' now' : ''}">${last || 'not ticked'}</span><span class="ord">${v ? v.map((x) => x[0]).join(', ') : ''}</span>
        <span class="txt"><span class="kind ${n.k}">${n.label}</span> <span class="lbl">${esc(n.sub)}</span>${det ? `<span class="det">${det}</span>` : ''}</span></div>`;
    }).join('');
  }
  function showInfo() {
    host.querySelector('.wfk-info').innerHTML = picked ? INFO[picked] : '<span class="bt-muted">Tap a node for what it does.</span>';
    outline.querySelectorAll('.bt-row').forEach((r) => r.classList.toggle('sel', r.dataset.n === picked));
  }
  function show(i) {
    scene = Math.max(0, Math.min(SCENES.length - 1, i));
    host.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.s === scene)));
    host.querySelector('[data-d="-1"]').disabled = scene === 0;
    host.querySelector('[data-d="1"]').disabled = scene === SCENES.length - 1;
    host.querySelector('.wfk-scene').innerHTML = `<b>Step ${scene + 1} of 5: ${SCENES[scene].label}.</b> ${SCENES[scene].text}`;
    drawSvg(); drawOutline(); showInfo();
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]');
    if (b) return show(+b.dataset.s);
    const d = e.target.closest('button[data-d]');
    if (d) return show(scene + +d.dataset.d);
    const r = e.target.closest('.bt-row[data-n]');
    if (r) { picked = picked === r.dataset.n ? null : r.dataset.n; showInfo(); }
  });
  outline.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset.n) { e.preventDefault(); e.target.click(); } });
  show(0);
}

// ---------- the 2022 TDR's PrimitiveMovePosition, redrawn ----------
{
  const host = document.getElementById('tdr-tree');
  // [depth, kind class, node, detail, new since 2022]
  const R = [
    [0, 'ctrl', 'PrimitiveMovePosition', 'subtree, called with x, y, z'],
    [1, 'ctrl', 'Sequence', '', true],
    [2, 'act', 'SetBlackboard ×2', 'depth limits −0.75 and −2.5 m', true],
    [2, 'ctrl', 'IfThenElse ×2', 'clamp z between them', true],
    [2, 'act', 'Info', '"Translating to XYZ…"', true],
    [2, 'dec', 'RetryUntilSuccessfulOrTimeout', '30 s in 2022; {timeout} s today'],
    [3, 'ctrl', 'Sequence', ''],
    [4, 'ros', 'PublishToController', 'mode 3, position x, y, z'],
    [4, 'ros', 'Wait', '0.25 s', true],
    [4, 'ros', 'GetOdometry', '"Get Current XYZ" → cx, cy, cz'],
    [4, 'act', 'CalculateDistance', 'dist from (x, y, z) to (cx, cy, cz)'],
    [4, 'cond', 'CompareNums', '"At goal point?" dist < 0.25'],
    [2, 'act', 'Info', '"Translation Complete."', true],
  ];
  host.innerHTML = `<div class="bt-tree tdr-outline" role="tree" aria-label="PrimitiveMovePosition">${R.map(([d, k, kind, det, isNew]) => `<div class="bt-row now static${isNew ? ' new' : ''}" style="--d:${d}" role="treeitem"><span class="txt"><span class="kind ${k}">${kind.replace(/(Retry|Until|Successful|Blackboard)(?=[A-Z])/g, '$1<wbr>')}</span> <span class="lbl">${esc(det)}</span>${isNew ? '<span class="tag new">new</span>' : ''}</span></div>`).join('')}</div>`;
  const a = document.querySelector('a[data-href]');
  if (a) a.href = BASE + a.dataset.href;
}

// ---------- control node and decorator tables (counts from the XML) ----------
// identifiers may break only after an underscore or where <wbr> says, never with a hyphen
const wb = (h) => h.replace(/<code>([^<]*)<\/code>/g, (m, c) => `<code>${c.replace(/_/g, '_<wbr>')}</code>`);
getJSON('usage.json').then(({ counts }) => {
  const c = (k) => counts[k] ?? 0;
  const table = (host, head, rows) => {
    document.getElementById(host).innerHTML = `<table class="params bt-table bt-cards"><thead><tr>${head.map((h, i) => `<th${i === head.length - 1 ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr><td><code>${r[0]}</code></td><td>${wb(r[1])}</td><td class="num">${r[2]}<span class="u"> use${r[2] === 1 ? '' : 's'}</span></td></tr>`).join('')}</tbody></table>`;
  };
  table('control-table', ['Node', 'What it does', 'Uses'], [
    ['Sequence', 'Ticks its children in order until one fails or runs. Resumes at the RUNNING child next tick.', c('Sequence')],
    ['Fallback', 'Ticks its children in order until one succeeds or runs. Fails if all fail.', c('Fallback')],
    ['IfThenElse', 'Ticks the first child; then the second if it succeeded, else the third (fails if there is no third).', c('IfThenElse')],
    ['ReactiveSequence', 'Ticks its children from the first on every tick; halts the running child if an earlier one fails.', c('ReactiveSequence')],
    ['Parallel', 'Ticks all its children every tick; done when <code>success_threshold</code> succeed or <code>failure_threshold</code> fail.', c('Parallel')],
    ['Switch2', 'Ticks the child whose case matches a blackboard value.', c('Switch2')],
  ]);
  table('decorator-table', ['Decorator', 'What it does', 'Uses'], [
    ['ForceSuccess', 'Returns SUCCESS whenever the child finishes, whatever it returned.', c('ForceSuccess')],
    ['RetryUntilSuccessful', 'Ticks a failed child again <em>in the same tick</em>, up to <code>num_attempts</code> times (−1: forever).', c('RetryUntilSuccessful')],
    ['Retry<wbr>Until<wbr>Successful<wbr>OrTimeout', 'Talos\'s: <em>one try per tick</em> until the child succeeds. After <code>num_seconds</code> it returns FAILURE, without halting a RUNNING child.', c('Decorator:RetryUntilSuccessfulOrTimeout')],
    ['ForceFailure', 'Returns FAILURE whenever the child finishes.', c('ForceFailure')],
    ['Inverter', 'Swaps SUCCESS and FAILURE; RUNNING passes through.', c('Inverter')],
    ['Repeat', 'Runs the child <code>num_cycles</code> times; fails at the first FAILURE.', c('Repeat')],
    ['Delay', 'Waits <code>delay_msec</code> (RUNNING meanwhile), then ticks the child.', c('Delay')],
    ['BlackboardCheck<wbr>String', 'Ticks the child only if <code>value_A</code> equals <code>value_B</code>, else returns <code>return_on_mismatch</code>. The trees write <code>"0"</code> there, which is not a status name, so the library falls back to FAILURE.', c('BlackboardCheckString')],
  ]);
});

// ---------- the SearchMpc simulator ----------
const KIND = {
  Sequence: 'ctrl', Fallback: 'ctrl', ReactiveSequence: 'ctrl', IfThenElse: 'ctrl',
  Inverter: 'dec', ForceSuccess: 'dec', ForceFailure: 'dec', RetryUntilSuccessfulOrTimeout: 'dec',
  SeenRecently: 'cond', MapConverged: 'cond', CompareNums: 'cond',
};
const ROS_NODES = new Set(['FollowPath', 'CenterDetection', 'SetMappingTarget', 'getCovariance', 'Wait', 'SetStatus']);
const FOLDABLE = new Set(['SetBlackboard', 'Info', 'Math', 'Format', 'AddWaypoint', 'AddArc']);
const SEM = {
  Sequence: 'Ticks its children in order. Stops at the first FAILURE (and resets) or RUNNING (and resumes there next tick, without re-checking the earlier ones). SUCCESS when all have succeeded.',
  ReactiveSequence: 'Ticks its children from the first on every tick. If one now fails, the running one is halted. Used here so the conditions in front of FollowPath are re-checked while it flies.',
  Fallback: 'Ticks its children in order until one succeeds. FAILURE only if all fail.',
  IfThenElse: 'Ticks the first child; if it succeeds, the second; otherwise the third.',
  Inverter: 'Turns SUCCESS into FAILURE and FAILURE into SUCCESS.',
  ForceSuccess: 'Returns SUCCESS whenever its child finishes.',
  ForceFailure: 'Returns FAILURE whenever its child finishes.',
  RetryUntilSuccessfulOrTimeout: 'Talos\'s decorator: re-ticks its child after each FAILURE (one try per tick) until it succeeds, or FAILURE once num_seconds have passed since its first tick. It does not halt a child that is still RUNNING then.',
  SetBlackboard: 'Writes value to the key output_key. Always SUCCESS.',
  Info: 'Prints message to the log, with {key} filled in. Always SUCCESS.',
  Error: 'Prints message as an error. Always SUCCESS.',
  Format: 'Writes the format string, with {key} filled in, to out.',
  Math: 'Writes a operator b to out.',
  CompareNums: 'Condition: a test b, with test one of <, > or ==.',
  AddWaypoint: 'Appends one waypoint to a FollowPath waypoint string (here shown as a summary).',
  AddArc: 'Appends an arc of waypoints, panning as it goes, to a FollowPath waypoint string (summary here).',
  AlwaysSuccess: 'Returns SUCCESS.',
  SeenRecently: 'Condition: SUCCESS if the detector (or mapping) reported this class within max_age_secs. Answers from a cached time, so it is cheap to re-check every tick. Here: your "Torpedo in view" switch.',
  MapConverged: 'Condition: SUCCESS once mapping\'s error for the object is below target_cov. Here: your "Map converged" switch.',
  SetStatus: 'Sets the LED pattern. Finishes in onStart.',
  SetMappingTarget: 'Calls the mapping_target service (which props mapping updates). RUNNING until the reply; here it arrives on the next tick.',
  getCovariance: 'Subscribes to mapping/<Target> and waits for one message, then writes its error to Covariance. Here the message arrives on the next tick; the value comes from your "Map converged" switch.',
  Wait: 'RUNNING until seconds have passed since its first tick.',
  FollowPath: 'Async action: onStart parses the waypoints; onRunning sends the goal to the MPC\'s follow_path server, waits for it to be accepted, then for the result. onHalted cancels the goal. You decide when the path is finished.',
  CenterDetection: 'Async action: chases the latest detection until Talos is square on to it (you press Centred). FAILURE if no detection for 1.5 s (take the torpedo out of view) or after timeout_secs.',
};
const short = (s, n = 64) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

Promise.all([getJSON('searchmpc.json')]).then(([data]) => {
  const host = document.getElementById('bt-sim');
  const inputs = data.call.values; // the keys TorpedoTreeMpc maps in, and their values there
  // labels show the remapped inputs' values ("torpedo", not "{object_name}"); the XML in the detail keeps the keys
  // keys set once by a SetBlackboard in the subtree (hold_secs = 8, ...), so labels can show them before tick 1
  const DEFAULTS = {}, setCount = {};
  (function walk(t) {
    if (t.tag === 'SetBlackboard' && t.attrs) { const k = t.attrs.output_key; setCount[k] = (setCount[k] || 0) + 1; DEFAULTS[k] = t.attrs.value; }
    (t.children || []).forEach(walk);
  })(data.tree);
  const fill = (t) => String(t ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in inputs ? inputs[k]
    : sim && sim.bb.has(k) ? String(sim.bb.get(k)) : setCount[k] === 1 && !/[{]/.test(DEFAULTS[k]) ? DEFAULTS[k] : m));
  const key = (t) => String(t ?? '').replace(/^\{(\w+)\}$/, '$1'); // an output port's key, without the braces
  const S_ = '\u00a0'; // a number and its unit stay on one line
  function label(n) {
    const s = n.spec, a = s.attrs || {}, k = n.kind, ph = phoneQ.matches;
    switch (k) {
      case 'SetBlackboard': return `${a.output_key} = ${a.value}`;
      case 'Info': case 'Error': return `"${short(fill(a.message || ''), ph ? 34 : 46)}"`;
      case 'Math': return `${key(a.out)} = ${key(a.a)} ${a.operator} ${key(a.b)}`;
      case 'Format': return `${key(a.out)} = "${fill(a.format)}"`;
      case 'CompareNums': return `${key(a.a)} ${a.test} ${fill(a.b)}` + (s.name ? ` · ${short(s.name, ph ? 26 : 36)}` : '');
      case 'SeenRecently': return `${fill(a.object_name)} in the last ${a.max_age_secs}${S_}s`;
      case 'MapConverged': return `${fill(a.object)} below ${fill(a.target_cov)}`;
      case 'getCovariance': return `${key(a.Covariance)} ← mapping/${fill(a.Target)}`;
      case 'FollowPath': return `${a.waypoints === '{sweep_path}' ? 'the sweep path' : fill(a.waypoints)}, timeout ${a.timeout}${S_}s`;
      case 'CenterDetection': return `${fill(a.object_name)}, timeout ${a.timeout_secs}${S_}s`;
      case 'Wait': return `${a.seconds}${S_}s`;
      case 'SetStatus': return a.status;
      case 'SetMappingTarget': return `target ${fill(a.target_object)}`;
      case 'RetryUntilSuccessfulOrTimeout': return `${s.name ? short(s.name.split(',')[0], 40) + ' · ' : ''}${fill(a.num_seconds)}${S_}s`;
      default: return s.name ? short(s.name, ph ? 40 : 70) : '';
    }
  }
  // phones: the live detail in fewer words
  const shortDet = (d) => (phoneQ.matches ? d.replace('goal accepted, Talos is flying the path', 'flying the path').replace('goal sent to follow_path', 'goal sent').replace('onStart: waypoints parsed', 'waypoints parsed').replace('; ', ' · ') : d);
  // the real ReactiveSequence shows as a Sequence when "plain Sequence" is picked
  const swapped = (n) => plain && n.spec.tag === 'ReactiveSequence';
  // long names break only where a word starts, never mid-word
  const kindName = (n) => (swapped(n) ? 'Sequence' : n.kind === 'RetryUntilSuccessfulOrTimeout' ? 'Retry<wbr>Until<wbr>Successful<wbr>OrTimeout' : n.kind);
  const plainName = (n) => (swapped(n) ? 'Sequence' : n.kind);

  let sim, plain = false, selected = null, timer = null, note = '', bbAll = false;
  const userOpen = new Set(), userShut = new Set();

  host.innerHTML = `
    <div class="bt-bar">
      <div class="bt-run">
        <button class="btn primary" data-a="step">Step</button>
        <button class="btn" data-a="next" title="Tick on until something changes (up to 10 s of tree time)"><span class="lg">Skip to next change</span><span class="sm">Skip</span></button>
        <button class="btn" data-a="play" aria-pressed="false">Play</button>
        <button class="btn" data-a="reset">Reset</button>
        <span class="bt-clock" aria-live="polite"></span>
      </div>
      <div class="bt-world" role="group" aria-label="The ROS side">
        <label class="bt-switch"><input type="checkbox" data-w="seen"> Torpedo in view</label>
        <label class="bt-switch"><input type="checkbox" data-w="converged"> Map converged</label>
        <button class="btn" data-a="arrive" disabled>Path finished</button>
        <button class="btn" data-a="centred" disabled>Centred</button>
      </div>
      <div class="bt-hint"></div>
    </div>
    <div class="bt-grid">
      <div class="bt-main">
        <div class="bt-variant"><span>Around <code>FollowPath</code>:</span>
          <span class="seg" role="group" aria-label="Control node around FollowPath"><button aria-pressed="true" data-v="reactive">ReactiveSequence (real)</button><button aria-pressed="false" data-v="plain">plain Sequence</button></span></div>
        <div class="bt-tree" role="tree" aria-label="SearchMpc subtree" tabindex="-1"></div>
        <div class="bt-now" aria-live="polite"></div>
      </div>
      <div class="bt-side">
        <div class="bt-detail"></div>
        <h3 class="panel-h">Log</h3>
        <ol class="bt-log"></ol>
        <h3 class="panel-h">Blackboard</h3>
        <div class="bt-bb"></div>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const treeEl = $('.bt-tree');

  function reset() {
    stop();
    sim = new Sim(data.tree.children[0], inputs, { plainSequence: plain });
    note = '';
    selected = null;
    userOpen.clear(); userShut.clear();
    host.querySelectorAll('[data-w]').forEach((i) => (i.checked = false));
    render();
    treeEl.scrollTop = 0;
  }
  function stop() { clearInterval(timer); timer = null; const b = $('[data-a="play"]'); if (b) { b.setAttribute('aria-pressed', 'false'); b.textContent = 'Play'; } }

  // A branch is open if this tick went into it or something in it is RUNNING; otherwise it shows as one row.
  // The reader's own taps on a caret win.
  function busy(n) {
    if (sim.visits.has(n.id) && n.parent) return true;
    if (n.status === RUNNING) return true;
    return n.children.some(busy);
  }
  const countAll = (n) => n.children.reduce((a, c) => a + 1 + countAll(c), 0);
  function isOpen(n) {
    if (userOpen.has(n.id)) return true;
    if (userShut.has(n.id)) return false;
    if (!n.parent || countAll(n) < 3) return true; // a decorator round one leaf costs a row either way
    return n.children.some(busy);
  }

  // ---- the outline: rows for nodes, plus folds for runs of quick bookkeeping leaves ----
  function rows() {
    const out = [];
    const walk = (n, d) => {
      out.push({ type: 'node', n, d });
      if (!n.children.length || !isOpen(n)) return;
      const ch = n.children;
      for (let i = 0; i < ch.length;) {
        let j = i;
        while (j < ch.length && FOLDABLE.has(ch[j].kind)) j++;
        if (j - i >= 3) {
          const fk = `f${n.id}-${i}`;
          const run = ch.slice(i, j);
          const open = userOpen.has(fk);
          out.push({ type: 'fold', key: fk, run, d: d + 1, open });
          if (open) run.forEach((c) => walk(c, d + 2));
          i = j;
        } else { walk(ch[i], d + 1); i++; }
      }
    };
    walk(sim.root, 0);
    return out;
  }
  function chip(n) {
    const v = sim.visits.get(n.id);
    if (v) return { st: v.result, now: true, order: v.order };
    return { st: n.status, now: false };
  }
  const ST = { [SUCCESS]: 'SUCCESS', [FAILURE]: 'FAILURE', [RUNNING]: 'RUNNING', [IDLE]: 'IDLE' };
  function stale(n) {
    if (n.status !== RUNNING) return false;
    for (let p = n.parent; p; p = p.parent) if (p.status !== RUNNING) return true;
    return false;
  }
  function render(follow) {
    const R = rows();
    treeEl.innerHTML = '<div class="bt-crumb" aria-hidden="true"></div>' + R.map((r) => {
      if (r.type === 'fold') {
        const counts = {};
        r.run.forEach((c) => (counts[c.kind] = (counts[c.kind] || 0) + 1));
        const text = Object.entries(counts).map(([k, v]) => (v > 1 ? `${v} × ${k}` : k)).join(', ');
        const ticked = r.run.map((c) => sim.visits.get(c.id)).filter(Boolean);
        const st = ticked.length ? ticked[ticked.length - 1].result : IDLE;
        return `<div class="bt-row fold${ticked.length ? ' now' : ''}" style="--d:${r.d}" data-fold="${r.key}" data-parent="${r.run[0].parent.id}" role="treeitem" aria-expanded="${r.open}" tabindex="0">
          <span class="caret">${r.open ? '▾' : '▸'}</span><span class="chip ${st}${ticked.length ? ' now' : ''}">${ticked.length ? ST[st] : 'idle'}</span>${ticked.length ? `<span class="ord">${ticked[0].order}–${ticked[ticked.length - 1].order}</span>` : ''}
          <span class="txt"><span class="lbl">${esc(text)}</span></span></div>`;
      }
      const n = r.n, c = chip(n);
      const isStale = stale(n);
      const hasKids = n.children.length > 0;
      const open = hasKids && isOpen(n);
      const det = n.detail && (c.now || n.status === RUNNING) ? shortDet(n.detail()) : ''; // live details only where the tick is
      const shut = hasKids && !open ? `${countAll(n)} nodes inside, not ticked${phoneQ.matches ? '' : ' now'}` : '';
      const cls = swapped(n) ? 'ctrl' : KIND[n.kind] || (ROS_NODES.has(n.kind) ? 'ros' : 'act');
      return `<div class="bt-row${c.now ? ' now' : ''}${selected === n.id ? ' sel' : ''}${sim.halted.has(n.id) ? ' halted' : ''}${isStale ? ' stale' : ''}" style="--d:${r.d}" data-id="${n.id}" role="treeitem" tabindex="0"${hasKids ? ` aria-expanded="${open}"` : ''}>
        <span class="caret"${hasKids ? ' data-toggle="1"' : ''}>${hasKids ? (open ? '▾' : '▸') : ''}</span><span class="chip ${c.st}${c.now ? ' now' : ''}">${c.st === IDLE ? 'idle' : ST[c.st]}</span>${c.now ? `<span class="ord" title="order reached in this tick">${c.order}</span>` : ''}
        <span class="txt"><span class="kind ${cls}">${kindName(n)}</span> <span class="lbl">${esc(label(n))}</span>${swapped(n) ? '<span class="tag swap">swapped in</span>' : ''}${sim.halted.has(n.id) ? '<span class="tag halt">halted</span>' : ''}${isStale ? '<span class="tag stale">left running</span>' : ''}${det ? `<span class="det">${esc(det)}</span>` : shut ? `<span class="det">${shut}</span>` : ''}</span></div>${selected === n.id && narrowQ.matches ? `<div class="bt-detail inline" style="--d:${r.d}">${detailHTML()}</div>` : ''}`;
    }).join('');
    renderSide();
    crumb(); // before following: its height is part of the box's layout
    if (follow) followTick(follow);
  }
  // After a tick, bring what it did into view: the last row it reached, the control node that row sits in
  // (the ReactiveSequence or the swapped-in Sequence round FollowPath, say), and any row it halted or changed,
  // as many of them as fit, nearest first. Phones and tablets scroll the tree's own box; desktops scroll the page,
  // under the sticky bar. Nothing moves when they are already in view.
  const boxMode = () => getComputedStyle(treeEl).overflowY === 'auto'; // the tree has its own scroll box (narrow screens)
  const boxed = () => boxMode() && treeEl.scrollHeight > treeEl.clientHeight + 2;
  const rowFor = (n) => { for (let p = n; p; p = p.parent) { const r = treeEl.querySelector(`.bt-row[data-id="${p.id}"]`); if (r) return r; } return null; };
  function followTick(before) {
    let best = null, ord = -1;
    treeEl.querySelectorAll('.bt-row.now').forEach((r) => {
      const o = +(r.querySelector('.ord')?.textContent.split('–').pop() || 0);
      if (o > ord) { ord = o; best = r; }
    });
    if (!best) return;
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    if (boxMode()) {
      // first the box itself: wholly on screen under the bar, if it was half hidden behind it or below the fold
      const bb = treeEl.getBoundingClientRect(), barB = Math.max(0, $('.bt-bar').getBoundingClientRect().bottom);
      if (bb.height < innerHeight - barB - 12 && (bb.top < barB + 2 || bb.bottom > innerHeight - 4)) window.scrollBy({ top: bb.top < barB + 2 ? bb.top - barB - 6 : bb.bottom - innerHeight + 8, behavior });
      if (!boxed()) return;
    }
    const bn = best.dataset.id ? sim.nodes[+best.dataset.id] : null;
    let anc = bn ? bn.parent : sim.nodes[+best.dataset.parent];
    while (anc && KIND[anc.kind] !== 'ctrl') anc = anc.parent;
    const changed = [...treeEl.querySelectorAll('.bt-row.now[data-id]')].filter((r) => {
      const v = sim.visits.get(+r.dataset.id);
      return before instanceof Map && v && v.result !== before.get(+r.dataset.id);
    }).reverse();
    const want = [best, anc && rowFor(anc), ...treeEl.querySelectorAll('.bt-row.halted'), ...changed].filter(Boolean);
    const inBox = boxed();
    const crumbH = inBox ? treeEl.querySelector('.bt-crumb')?.offsetHeight || 0 : 0;
    const pos = (r) => { if (inBox) return [r.offsetTop, r.offsetTop + r.offsetHeight]; const b = r.getBoundingClientRect(); return [b.top, b.bottom]; };
    let lo, hi;
    if (inBox) { lo = treeEl.scrollTop + crumbH + 4; hi = treeEl.scrollTop + treeEl.clientHeight - 6; }
    else { lo = Math.max(0, $('.bt-bar').getBoundingClientRect().bottom) + 8; hi = innerHeight - 10; }
    const room = hi - lo;
    let [top, bot] = pos(want[0]);
    for (const r of want.slice(1)) {
      const [t, b] = pos(r);
      if (Math.max(bot, b) - Math.min(top, t) <= room) { top = Math.min(top, t); bot = Math.max(bot, b); }
    }
    const d = bot - top > room ? top - lo : top < lo ? top - lo : bot > hi ? bot - hi : 0;
    if (Math.abs(d) < 2) return;
    if (inBox) treeEl.scrollTo({ top: treeEl.scrollTop + d, behavior });
    else window.scrollBy({ top: d, behavior });
  }
  // Phones and tablets: a line at the top of the tree's box names the branches scrolled out above it,
  // so a deep row never loses the node it sits in. Tap one to scroll back to it.
  function crumb() {
    const el = treeEl.querySelector('.bt-crumb');
    if (!el) return;
    const top = '<span class="bt-muted">SearchMpc. Tap a row for its XML, ▸ to open a branch.</span>';
    if (!boxed()) { el.innerHTML = top; return; }
    const edge = treeEl.scrollTop + el.offsetHeight;
    const first = [...treeEl.querySelectorAll('.bt-row')].find((r) => r.offsetTop + r.offsetHeight * 0.5 > edge);
    let n = first ? (first.dataset.id ? sim.nodes[+first.dataset.id] : sim.nodes[+first.dataset.parent]) : null;
    const hidden = [];
    for (let p = n && first.dataset.id ? n.parent : n; p && p.parent; p = p.parent) {
      const r = treeEl.querySelector(`.bt-row[data-id="${p.id}"]`);
      if (r && r.offsetTop < edge) hidden.push(p);
    }
    if (!hidden.length) { el.innerHTML = top; return; }
    const p = hidden[0]; // the nearest; the line is too short for the whole path
    el.innerHTML = `<span class="bt-muted">in ${hidden.length > 1 ? '… › ' : ''}</span><span class="cr" data-jump="${p.id}"><b>${plainName(p)}</b>${swapped(p) ? '<span class="tag swap">swapped in</span>' : ''}${p.spec.name ? ' ' + esc(p.spec.name.split(',')[0]) : ''}</span>`;
  }
  treeEl.addEventListener('scroll', () => requestAnimationFrame(crumb), { passive: true });
  const phoneQ = matchMedia('(max-width: 640px)');
  phoneQ.addEventListener('change', () => render());
  const narrowQ = matchMedia('(max-width: 900px)');
  narrowQ.addEventListener('change', () => render());
  function detailHTML() {
    if (selected === null) return '<p class="bt-muted">Tap a node to see its XML and what it does.</p>';
    const n = sim.nodes[selected], s = n.spec;
    const attrs = Object.entries(s.attrs || {}).filter(([, v]) => v !== '');
    const xml = `&lt;${s.tag}${s.id ? ` ID="${esc(s.id)}"` : ''}${s.name ? ` name="${esc(s.name)}"` : ''}${attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}${n.children.length ? '&gt;' : '/&gt;'}`;
    return `<div class="bt-dhead"><b>${kindName(n)}</b> <a href="${TREE_URL}#L${s.line}">line ${s.line}</a></div>
      <p>${esc(SEM[swapped(n) ? 'Sequence' : n.kind] || '')}${swapped(n) ? ' (Swapped in for the real ReactiveSequence.)' : ''}</p>
      <pre class="bt-xml"><code>${xml}</code></pre>
      <p class="bt-muted">Status now: ${n.status}${n.detail && n.detail() ? ' · ' + esc(n.detail()) : ''}</p>`;
  }
  const byName = (re) => sim.nodes.find((n) => re.test(n.spec.name || ''));
  function hintText() {
    const w = sim.world, res = sim.result;
    if (note) return note;
    if (res) return `SearchMpc finished with ${res}. In TorpedoTreeMpc a ForceSuccess around it lets the task carry on either way. Reset to run it again.`;
    if (sim.tickNo === 0) return 'Press Step to tick the root once.';
    const fp = sim.nodes.find((n) => n.kind === 'FollowPath');
    if (fp && sim.halted.has(fp.id)) return `The ReactiveSequence re-checks ${w.seen ? 'SeenRecently' : 'MapConverged'} every tick. Now it succeeds, its Inverter fails, so FollowPath is halted (MPC goal cancelled) and ${w.seen ? 'the chase starts' : 'the sweep ends'}.`;
    if (w.flying && plain && w.seen) return 'The torpedo is in view, but a plain Sequence goes straight back to its RUNNING FollowPath and never re-checks SeenRecently: nothing reacts until the path ends.';
    if (w.flying && plain) return 'FollowPath is flying the sweep, under a plain Sequence now. Turn Torpedo in view on and step: does anything notice?';
    if (w.flying) return 'FollowPath is flying the sweep. Turn Torpedo in view on (or Map converged) and step, or press Path finished.';
    if (w.centring) return 'CenterDetection is chasing the torpedo. Press Centred, or turn Torpedo in view off for 1.5 s to lose it.';
    const hold = byName(/^Hold it centered/);
    if (hold && hold.status === RUNNING) return 'Holding still until the map converges (8 s at most): turn Map converged on, or turn Torpedo in view off for 2 s. Skip jumps ahead.';
    const running = sim.nodes.filter((n) => n.status === RUNNING && !n.children.length && !stale(n)).map((n) => n.kind);
    if (running.includes('getCovariance')) return 'getCovariance is waiting for one message from the map; it arrives on the next tick. Map converged decides what it says.';
    if (running.includes('SetMappingTarget')) return 'SetMappingTarget is waiting for its service reply; step on.';
    if (running.includes('FollowPath')) return 'FollowPath is sending its goal to the MPC; step on.';
    return 'Step on.';
  }
  function renderSide() {
    const w = sim.world;
    const res = sim.result;
    $('.bt-clock').innerHTML = `<span class="c1">Tick <b>${sim.tickNo}</b> · ${sim.t.toFixed(2)} s</span><span class="c2"><span class="sep"> · </span><b class="st-${res || sim.root.status}">${res || sim.root.status}</b>${plain ? '<span class="tag swap">plain<span class="lg"> Sequence</span></span>' : ''}</span>`;
    $('[data-a="arrive"]').disabled = !w.flying || !!res;
    $('[data-a="centred"]').disabled = !w.centring || !!res;
    host.querySelectorAll('[data-a="step"],[data-a="next"],[data-a="play"]').forEach((b) => (b.disabled = !!res));
    // phones: the one ROS button that can be pressed now sits at the end of the hint
    const now = res ? '' : w.flying ? 'arrive' : w.centring ? 'centred' : '';
    $('.bt-hint').innerHTML = esc(hintText()) + (now ? ` <button class="btn ph" data-a="${now}">${now === 'arrive' ? 'Path finished' : 'Centred'}</button>` : '');

    // what this tick did, right under the tree
    const wrote = [...sim.wrote].map((k) => `<code>${esc(k)}</code> = ${esc(short(String(sim.bb.get(k)), 28))}${sim.written.has(k) ? '' : ' <span class="bt-muted">(same)</span>'}`);
    const said = sim.events.filter((e) => e.tick === sim.tickNo && sim.tickNo > 0);
    $('.bt-now').innerHTML = sim.tickNo === 0 ? '<span class="bt-muted">After each tick: what it wrote to the blackboard and logged.</span>'
      : `<div><b>Tick ${sim.tickNo} wrote</b> ${wrote.length ? wrote.join(', ') : '<span class="bt-muted">nothing</span>'}</div>${said.length ? `<div><b>Log</b> ${said.slice(-3).map((e) => `<span class="${e.cls}">${esc(e.msg)}</span>`).join(' · ')}</div>` : ''}`;

    // detail of the selected node: beside the tree, or under its row on narrow screens
    $('.bt-detail').innerHTML = detailHTML();
    // blackboard: the remapped inputs and the keys this tick wrote; the rest on request
    const keys = [...sim.bb.keys()];
    keys.sort((a, b) => (sim.bbInfo.get(b)?.remapped ? 1 : 0) - (sim.bbInfo.get(a)?.remapped ? 1 : 0));
    const shown = bbAll ? keys : keys.filter((k) => sim.bbInfo.get(k)?.remapped || sim.written.has(k));
    $('.bt-bb').innerHTML = `<table class="bt-bbt"><tbody>${shown.map((k) => {
      const info = sim.bbInfo.get(k) || {};
      let v = sim.bb.get(k);
      const from = info.remapped && data.call.remap[k] !== k ? ` <span class="bt-muted">(caller's <code>${esc(data.call.remap[k])}</code>)</span>` : '';
      if (k === 'cov') v += ' (from your Map switch)';
      return `<tr class="${sim.written.has(k) ? 'hot' : ''}"><td><code>${esc(k)}</code>${info.remapped ? '<span class="tag remap">remapped in</span>' : ''}</td><td>${esc(short(String(v), 90))}${from}</td></tr>`;
    }).join('')}</tbody></table>${keys.length > shown.length || bbAll ? `<button class="btn bt-bball" data-a="bball">${bbAll ? 'Show only this tick\'s keys' : `Show all ${keys.length} keys`}</button>` : ''}`;

    // log
    const ev = sim.events.slice(-14).reverse();
    $('.bt-log').innerHTML = ev.length ? ev.map((e) => `<li class="${e.cls}"><span>${e.tick}</span>${esc(e.msg)}</li>`).join('') : '<li class="empty">Nothing yet. The number is the tick.</li>';
  }

  const statuses = () => new Map(sim.nodes.map((n) => [n.id, n.status]));
  function act(a) {
    note = '';
    let follow = false;
    if (a === 'step') { follow = statuses(); sim.tick(); }
    else if (a === 'next') {
      const t0 = sim.t;
      follow = statuses();
      const ok = sim.untilChange(10);
      const w = sim.world;
      note = ok ? (sim.t - t0 > 0.05 ? `Skipped ${(sim.t - t0).toFixed(2)} s of tree time to the next change.` : '')
        : plain && w.flying && w.seen ? 'Still nothing after 10 s more: a plain Sequence never re-checks SeenRecently while FollowPath runs. Only Path finished (or the 90 s timeout) ends the sweep.'
        : 'Nothing changed in 10 s of tree time. Each press skips up to 10 s more.';
    } else if (a === 'reset') { reset(); return; } else if (a === 'arrive') sim.world.pathDone = true;
    else if (a === 'centred') sim.world.centred = true;
    else if (a === 'bball') bbAll = !bbAll;
    else if (a === 'play') {
      if (timer) { stop(); } else {
        const b = $('[data-a="play"]');
        b.setAttribute('aria-pressed', 'true'); b.textContent = 'Pause';
        timer = setInterval(() => { const st = statuses(); sim.tick(); if (sim.result) stop(); render(st); }, 220);
      }
    }
    if (a === 'arrive' || a === 'centred') note = 'The MPC reports it on the next tick: press Step.';
    render(follow);
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (b) { act(b.dataset.a); return; }
    const v = e.target.closest('button[data-v]');
    if (v) {
      plain = v.dataset.v === 'plain';
      host.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === v)));
      reset();
      note = plain ? 'A plain Sequence now sits round FollowPath. Step until it flies, then turn Torpedo in view on.' : '';
      renderSide();
      return;
    }
    const j = e.target.closest('[data-jump]');
    if (j) { const r = treeEl.querySelector(`.bt-row[data-id="${j.dataset.jump}"]`); if (r) treeEl.scrollTo({ top: r.offsetTop - (treeEl.querySelector('.bt-crumb')?.offsetHeight || 0) - 4, behavior: 'smooth' }); return; }
    const fold = e.target.closest('.bt-row.fold');
    if (fold) { const k = fold.dataset.fold; userOpen.has(k) ? userOpen.delete(k) : userOpen.add(k); render(); return; }
    const row = e.target.closest('.bt-row[data-id]');
    if (row) {
      const id = +row.dataset.id, n = sim.nodes[id];
      if (e.target.closest('[data-toggle]')) {
        if (isOpen(n)) { userOpen.delete(id); userShut.add(id); } else { userShut.delete(id); userOpen.add(id); }
      } else selected = selected === id ? null : id;
      render();
    }
  });
  host.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('bt-row')) { e.preventDefault(); e.target.click(); }
  });
  host.addEventListener('change', (e) => {
    const w = e.target.dataset.w;
    if (!w) return;
    if (w === 'seen') sim.world.seen = e.target.checked;
    if (w === 'converged') sim.world.converged = e.target.checked;
    note = w === 'seen' ? (e.target.checked ? 'Detections arrive from the next tick on. Step to see who notices.' : 'No more detections from the next tick on.')
      : e.target.checked ? 'The map now reports a small error. Step to see who notices.' : '';
    renderSide();
  });
  // Phones and tablets: the bar sticks under the Chapters button, or at the very top while that button is tucked
  // away; while stuck it gets an opaque strip above it, so rows scrolling past don't show through.
  const bar = $('.bt-bar'), menu = document.querySelector('.menu-btn');
  const stuck = () => {
    const top = parseFloat(getComputedStyle(bar).top) || 0;
    host.classList.toggle('bar-stuck', host.getBoundingClientRect().top < top - 1 && host.getBoundingClientRect().bottom > top + bar.offsetHeight);
  };
  if (menu) new MutationObserver(() => { host.classList.toggle('pill-off', menu.classList.contains('tucked')); stuck(); }).observe(menu, { attributes: true, attributeFilter: ['class'] });
  addEventListener('scroll', stuck, { passive: true });
  addEventListener('resize', stuck);
  reset();
});

// ---------- subtree remapping explorer ----------
getJSON('subtrees.json').then((d) => {
  const host = document.getElementById('remap');
  const numeric = (s) => s !== null && s !== undefined && /^-?\d+(\.\d+)?$/.test(s);
  const byParent = new Map();
  d.calls.forEach((c, i) => { if (!byParent.has(c.parent)) byParent.set(c.parent, []); byParent.get(c.parent).push(i); });
  const example = Math.max(0, d.calls.findIndex((c) => c.parent === 'Dive' && c.child === 'PrimitiveMovePosition'));
  const lostCalls = d.calls.map((c, i) => (c.ports.some((p) => numeric(p.key) && p.value === null) ? i : -1)).filter((i) => i >= 0);
  let lostAt = -1;
  host.innerHTML = `<div class="controls remap-pick">
      <span class="seg" role="group" aria-label="Jump to"><button data-j="ex" aria-pressed="true">Example: Dive</button><button data-j="lost" aria-pressed="false">Never written <span class="n">(${lostCalls.length})</span></button></span>
      <label>or any call <select id="remap-pick">${[...byParent.entries()].map(([p, ix]) => `<optgroup label="in ${esc(p)}">${ix.map((i) => `<option value="${i}"${i === example ? ' selected' : ''}>${esc(p)} → ${esc(d.calls[i].child)} · L${d.calls[i].line}</option>`).join('')}</optgroup>`).join('')}</select></label>
    </div>
    <pre class="bt-xml" id="remap-xml"></pre><div id="remap-table"></div>
    <div class="legend remap-legend"><span><i class="sw lit"></i>a number passed through a key named after it</span><span><i class="sw lost"></i>that key is never written</span><span><b>—</b> set at run time or passed down</span></div>
    <div class="graph-note" id="remap-note"></div>`;
  const select = host.querySelector('#remap-pick');
  const show = (i) => {
    const c = d.calls[i];
    select.value = String(i);
    const attrs = c.ports.map((p) => ` ${p.port}="${esc(p.key)}"`).join('');
    const sharedAttr = c.shared_attr != null ? ` __shared_blackboard="${esc(c.shared_attr)}"` : ''; // printed only where the XML has it
    host.querySelector('#remap-xml').innerHTML = `<code>&lt;SubTree ID="${esc(c.child)}"${sharedAttr}${attrs}/&gt;</code>`;
    host.querySelector('#remap-table').innerHTML = c.ports.length
      ? `<table class="params bt-table remap-t"><thead><tr><th>Port in ${esc(c.child)}</th><th>Caller's key</th><th>Value there</th></tr></thead><tbody>${c.ports.map((p) => {
        const lit = numeric(p.value) && p.key === p.value;
        const lost = numeric(p.key) && p.value === null; // the number trick without its SetBlackboard
        const val = p.value !== null ? esc(p.value) : lost ? '<span class="bt-lost">never written</span>' : '<span class="bt-muted">—</span>';
        return `<tr class="${lit ? 'lit' : lost ? 'lost' : ''}"><td><code>${esc(p.port).replace(/_/g, '_<wbr>')}</code></td><td><code>${esc(p.key)}</code></td><td>${val}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<p class="bt-muted">No ports: the subtree only uses its own keys.</p>';
    const tricks = c.ports.filter((p) => numeric(p.value) && p.key === p.value).length;
    const lost = c.ports.filter((p) => numeric(p.key) && p.value === null).length;
    host.querySelector('#remap-note').innerHTML = `<a href="${TREE_URL}#L${c.line}">Line ${c.line}</a> of RepairCompMpcTree.xml.`
      + (tricks ? ` ${tricks} of ${c.ports.length} port${c.ports.length > 1 ? 's' : ''} pass a number through a key named after it.` : '')
      + (lost ? ` <b>${lost === 1 ? 'One port names' : `${lost} ports name`} a number the caller never writes</b>, so inside the subtree the port is empty and the node falls back to its C++ default.` : '')
      + (c.unmapped.length ? ` Declared but not mapped: <code>${c.unmapped.map(esc).join('</code>, <code>')}</code> (missing inside the subtree).` : '');
  };
  const press = (j) => host.querySelectorAll('[data-j]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.j === j)));
  host.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-j]');
    if (!b) return;
    if (b.dataset.j === 'ex') { lostAt = -1; show(example); }
    else { lostAt = (lostAt + 1) % lostCalls.length; show(lostCalls[lostAt]); }
    host.querySelector('[data-j="lost"] .n').textContent = lostAt >= 0 ? `${lostAt + 1} of ${lostCalls.length}` : `(${lostCalls.length})`;
    press(b.dataset.j);
  });
  select.addEventListener('change', (e) => { lostAt = -1; host.querySelector('[data-j="lost"] .n').textContent = `(${lostCalls.length})`; press(null); show(+e.target.value); });
  show(example);
});

// ---------- SearchMpc as a state machine ----------
{
  const host = document.getElementById('fsm-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const INFO = {
    sweep: '<b>Sweep</b>: <code>FollowPath</code> flies arcs round the estimate, inside a <code>ReactiveSequence</code> behind two inverted conditions (<code>SeenRecently</code> 0.5 s, <code>MapConverged</code>). It ends when the target is seen, the map converges, or the path ends (finished, rejected, or the 90 s <code>FollowPath</code> timeout).',
    chase: '<b>Chase</b>: a <code>Sequence</code> that needs <code>SeenRecently</code> (1 s), then <code>CenterDetection</code> inside <code>ForceSuccess</code>, so losing it still moves on.',
    hold: '<b>Hold</b>: <code>RetryUntilSuccessfulOrTimeout</code> (8 s) around a <code>Fallback</code>: <code>MapConverged</code>, or not seen for 2 s.',
    check: '<b>Check</b>: <code>getCovariance</code>, then a <code>Fallback</code>: <code>CompareNums</code> cov &lt; target_cov ends the sweep loop; otherwise this sweep fails and the 100 s retry starts another.',
    widen: '<b>Widen</b>: an <code>IfThenElse</code> under <code>ForceFailure</code>: if nothing was seen in 20 s, <code>Math</code> adds 1 to <code>stage</code> (0, 1, 2, then back to 0).',
    last: '<b>Last check</b>: the 100 s <code>RetryUntilSuccessfulOrTimeout</code> sits in a <code>ForceSuccess</code>, so converging and running out of time both lead here. <code>getCovariance</code> reads the map once more: cov &lt; target_cov succeeds, anything else is a failure.',
    done: '<b>Done</b>: <code>SearchMpc</code> returns SUCCESS.',
    fail: '<b>Not found</b>: an <code>Error</code> logs "Could not find torpedo after 100 seconds." inside a <code>ForceFailure</code>, so <code>SearchMpc</code> returns FAILURE. Its caller wraps it in a <code>ForceSuccess</code>.',
  };
  const BOX = ['sweep', 'chase', 'hold', 'check', 'widen'];
  const g = new Graph(host, {
    width: 900, height: 380, defaultId: 'sweep',
    bands: [{ label: '100 S LIMIT · RETRYUNTILSUCCESSFULORTIMEOUT', dash: true, points: [[20, 22], [640, 22], [640, 362], [20, 362]], lx: 34, ly: 42 }],
    nodes: [
      { id: 'sweep', x: 120, y: 105, label: 'Sweep', sub: 'FollowPath arcs' },
      { id: 'chase', x: 330, y: 105, label: 'Chase', sub: 'CenterDetection' },
      { id: 'hold', x: 540, y: 105, label: 'Hold', sub: 'until converged' },
      { id: 'check', x: 540, y: 280, label: 'Check', sub: 'cov < target?' },
      { id: 'widen', x: 120, y: 280, label: 'Widen', sub: 'stage + 1' },
      { id: 'last', x: 765, y: 250, label: 'Last check', sub: 'cov < target?' },
      { id: 'done', x: 705, y: 345, label: 'Done', sub: 'SUCCESS', bold: true },
      { id: 'fail', x: 840, y: 345, label: 'Not found', sub: 'Error, FAILURE', bold: true },
    ],
    edges: [
      { from: 'sweep', to: 'chase', label: 'seen' },
      { from: 'chase', to: 'hold', label: 'centred or lost' },
      { from: 'hold', to: 'check', label: 'converged, lost or 8 s', lx: 530, ly: 166, anchor: 'end' },
      { from: 'sweep', to: 'check', d: 'M150,130 V196 H505 V255', label: 'not seen: path ended or map converged', lx: 330, ly: 189 },
      { from: 'check', to: 'widen', label: 'nothing seen for 20 s' },
      { from: 'widen', to: 'sweep', d: 'M90,255 V130', label: 'wider', lx: 82, ly: 196, anchor: 'end' },
      { from: 'check', to: 'sweep', d: 'M540,305 V338 H44 V105 H58', label: 'seen lately: sweep again round the new estimate', lx: 300, ly: 331 },
      { from: 'check', to: 'last', label: 'converged', lx: 680, ly: 248 },
      { from: BOX, to: 'last', key: 'box>last', d: 'M640,80 H765 V225', dash: true, label: '100 s up', lx: 700, ly: 72 },
      { from: 'last', to: 'done', label: 'yes', lx: 724, ly: 302, anchor: 'end' },
      { from: 'last', to: 'fail', label: 'no', lx: 812, ly: 302, anchor: 'start' },
    ],
    narrow: {
      // phones: the loop as a column inside the 100 s box, the endings below it
      below: 880, width: 300, height: 600,
      bands: [{ label: '100 S LIMIT', dash: true, points: [[4, 6], [296, 6], [296, 420], [4, 420]], lx: 14, ly: 24 }],
      nodes: {
        sweep: { x: 165, y: 62 }, chase: { x: 165, y: 145 }, hold: { x: 165, y: 228 }, check: { x: 165, y: 311 },
        widen: { x: 58, y: 380 }, last: { x: 165, y: 480 }, done: { x: 80, y: 565 }, fail: { x: 222, y: 565 },
      },
      edges: {
        'sweep>chase': { lx: 173, ly: 104, anchor: 'start' },
        // '|' breaks a label onto two lines; labels on the side rails sit on their line
        'chase>hold': { label: 'centred / lost', lx: 173, ly: 187, anchor: 'start' },
        'hold>check': { label: 'converged, lost|or 8 s', lx: 173, ly: 263, anchor: 'start' },
        'sweep>check': { d: 'M222,62 H272 V311 H230', label: 'path|ended', lx: 272, ly: 98 },
        'check>widen': { d: 'M108,311 H58 V355', label: 'nothing seen', lx: 66, ly: 344, anchor: 'start' },
        'widen>sweep': { d: 'M30,355 V62 H102', label: 'wider', lx: 30, ly: 290 },
        'check>sweep': { d: 'M118,322 C80,322 70,260 70,190 C70,110 80,74 104,74', label: 'seen|lately', lx: 70, ly: 182 },
        'check>last': { lx: 173, ly: 395, anchor: 'start' },
        'box>last': { d: 'M250,420 V480 H226', label: '100 s up', lx: 256, ly: 452, anchor: 'start' },
        'last>done': { lx: 108, ly: 518, anchor: 'end' },
        'last>fail': { lx: 200, ly: 518, anchor: 'start' },
      },
    },
    info: (n) => { note.innerHTML = INFO[n ? n.id : 'sweep']; },
  });
  // two-line edge labels ('a|b'), also after the graph rebuilds for another width
  const split = () => host.querySelectorAll('text.elabel').forEach((t) => {
    if (!t.textContent.includes('|')) return;
    const x = t.getAttribute('x');
    const [a, b] = t.textContent.split('|');
    t.textContent = '';
    [a, b].forEach((line, i) => { const sp = document.createElementNS('http://www.w3.org/2000/svg', 'tspan'); sp.setAttribute('x', x); if (i) sp.setAttribute('dy', '1.15em'); sp.textContent = line; t.appendChild(sp); });
  });
  split();
  new MutationObserver(split).observe(host, { childList: true, subtree: true });
  g.highlight(null);
  host.appendChild(note);
}
