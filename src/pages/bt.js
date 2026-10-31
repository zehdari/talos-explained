import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/bt.css';
import { Graph } from '../viz/graph.js';
import { Sim, IDLE, RUNNING, SUCCESS, FAILURE, TICK } from '../viz/bt-engine.js';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/';
const TREE_URL = GH + 'trees/RepairCompMpcTree.xml';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const getJSON = (f) => fetch(`${BASE}data/bt/${f}`).then((r) => r.json());
// public images: the base is added here, so the same path works in dev and in the build
document.querySelectorAll('img[data-src]').forEach((i) => (i.src = BASE + i.dataset.src));

// ---------- doTask's loop ----------
{
  const host = document.getElementById('dotask-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const INFO = {
    goal: '<b>ExecuteTree goal</b> on <code>autonomy/run_tree</code>: the path of a tree file. Rejected if the file does not exist. (There is also an "already running" check, but it never fires: the worker thread is detached at once. See Chapter 2.) The Nereus viewer\'s autonomy panel sends it.',
    load: '<b>Build the tree.</b> <code>createTreeFromFile</code> parses the XML and creates every node; <code>initRosForTree</code> then gives each Talos node the ROS node handle and calls its <code>rosInit()</code>. Loggers start: the <code>.fbl</code> file in ~/btlogs and the node stack on <code>autonomy/tree_stack</code>.',
    tick: '<b>tickRoot()</b>: one tick, from the root down. It returns the root\'s status.',
    sleep: '<b>RUNNING:</b> check for a cancel, then <code>loop_rate.sleep()</code>, a <code>rclcpp::Rate</code> of 30 ms, so roughly 33 ticks a second when ticks are quick. Then tick again.',
    halt: '<b>Cancel requested</b> (the viewer\'s Stop): <code>haltTree()</code> halts every RUNNING node, so actions cancel their goals. This is the only way to end a tree early: the kill switch check is commented out.',
    done: '<b>Finished.</b> <code>doTask</code> publishes <code>DISABLED</code> on <code>controller/linear</code> and <code>controller/angular</code>, and the LEDs breathe green for SUCCESS or red otherwise. If a node throws, the LEDs flash red fast and the goal is aborted.',
  };
  new Graph(host, {
    width: 900, height: 250,
    nodes: [
      { id: 'goal', x: 95, y: 55, label: 'ExecuteTree goal', sub: 'autonomy/run_tree' },
      { id: 'load', x: 290, y: 55, label: 'Build the tree', sub: 'XML → nodes, rosInit' },
      { id: 'tick', x: 485, y: 55, label: 'tickRoot()', sub: 'one tick', bold: true },
      { id: 'sleep', x: 485, y: 200, label: 'sleep to next 30 ms', sub: 'loop_rate.sleep()' },
      { id: 'done', x: 790, y: 55, label: 'SUCCESS or FAILURE', sub: 'controller off, LEDs' },
      { id: 'halt', x: 790, y: 200, label: 'haltTree()', sub: 'goal cancelled' },
    ],
    edges: [
      { from: 'goal', to: 'load' }, { from: 'load', to: 'tick' },
      { from: 'tick', to: 'sleep', label: 'RUNNING', bend: -28 },
      { from: 'sleep', to: 'tick', bend: -28 },
      { from: 'tick', to: 'done', label: 'done' },
      { from: 'tick', to: 'halt', label: 'cancel', lx: 655, ly: 118 },
      { from: 'halt', to: 'done' },
    ],
    narrow: {
      below: 600, width: 360, height: 470,
      nodes: {
        goal: { x: 180, y: 35 }, load: { x: 180, y: 120 }, tick: { x: 180, y: 210 },
        sleep: { x: 92, y: 320 }, halt: { x: 272, y: 320 }, done: { x: 180, y: 425 },
      },
      edges: {
        'tick>sleep': { bend: 22, lx: 82, ly: 262 }, 'sleep>tick': { bend: 22 },
        'tick>done': { lx: 198, ly: 300, anchor: 'start' }, 'tick>halt': { lx: 262, ly: 258 },
      },
    },
    info: (n) => { note.innerHTML = n ? INFO[n.id] : 'Tap or hover a step.'; },
  }).highlight(null);
  host.appendChild(note);
}

// ---------- WaitForKillSwitch drawn as a tree, one tick at a time ----------
{
  const host = document.getElementById('wfk-graph');
  const SVGNS = 'http://www.w3.org/2000/svg';
  // the nodes of RepairCompMpcTree.xml lines 3087-3103, in document order; d = depth
  const N = [
    { id: 'root', d: 0, label: 'Sequence', sub: 'the subtree', x: 420, y: 40, bold: true },
    { id: 'st1', d: 1, label: 'SetStatus', sub: 'waiting', x: 62, y: 140 },
    { id: 'info1', d: 1, label: 'Info', sub: 'Waiting for…', x: 168, y: 140 },
    { id: 'wait5a', d: 1, label: 'Wait', sub: '5 s', x: 262, y: 140 },
    { id: 'retry', d: 1, label: 'RetryUntilSuccessful', sub: 'num_attempts −1', x: 420, y: 140, bold: true },
    { id: 'seq', d: 2, label: 'Sequence', sub: 'one check', x: 420, y: 240, bold: true },
    { id: 'get', d: 3, label: 'GetBoolTopic', sub: 'state/kill', x: 226, y: 340 },
    { id: 'inv', d: 3, label: 'Inverter', sub: '"IsFalse"', x: 366, y: 340 },
    { id: 'istrue', d: 4, label: 'IsTrue', sub: '{kill_switch_inserted}', x: 366, y: 440 },
    { id: 'wait1', d: 3, label: 'Wait', sub: '1 s', x: 480, y: 340 },
    { id: 'info2', d: 3, label: 'Info', sub: 'INSERTED…', x: 594, y: 340 },
    { id: 'st2', d: 1, label: 'SetStatus', sub: 'starting', x: 620, y: 140 },
    { id: 'wait5b', d: 1, label: 'Wait', sub: '5 s', x: 740, y: 140 },
  ];
  const PARENT = { st1: 'root', info1: 'root', wait5a: 'root', retry: 'root', st2: 'root', wait5b: 'root', seq: 'retry', get: 'seq', inv: 'seq', wait1: 'seq', info2: 'seq', istrue: 'inv' };
  const INFO = {
    root: '<b>Sequence</b>: ticks its six children in order. While one is RUNNING it comes straight back to it on the next tick, without re-ticking the ones before.',
    st1: '<b>SetStatus</b> <code>waiting</code>: LEDs solid red. Finishes in <code>onStart</code>, so it returns SUCCESS at once.',
    info1: '<b>Info</b>: prints "Waiting for kill switch insert..." and returns SUCCESS.',
    wait5a: '<b>Wait</b> 5 s: RUNNING on every tick until 5 s have passed since its first tick, then SUCCESS.',
    retry: '<b>RetryUntilSuccessful</b>, <code>num_attempts="-1"</code>: if its child fails, it resets the child and ticks it again, forever. RUNNING passes straight up.',
    seq: '<b>Sequence</b>: one check of the switch. Read the topic, check it says false, wait 1 s, print. Any FAILURE fails the whole check.',
    get: '<b>GetBoolTopic</b> on <code>state/kill</code>: subscribes in <code>onStart</code> and returns RUNNING; SUCCESS once a message has arrived, written to <code>kill_switch_inserted</code>. FAILURE after 3 s with no message.',
    inv: '<b>Inverter</b> (named "IsFalse"): turns SUCCESS into FAILURE and back. Together with <code>IsTrue</code> it asks "is the value false?"',
    istrue: '<b>IsTrue</b>, a condition: SUCCESS if <code>kill_switch_inserted</code> is true. <code>state/kill</code> is true while the robot is killed, so this succeeds while the switch is out.',
    wait1: '<b>Wait</b> 1 s: RUNNING until a second has passed.',
    info2: '<b>Info</b>: prints "KILL SWITCH INSERTED, TREE STARTING IN 5 SECONDS".',
    st2: '<b>SetStatus</b> <code>starting</code>: LEDs blink blue.',
    wait5b: '<b>Wait</b> 5 s, then the subtree succeeds and the mission goes on.',
  };
  // what each node returned in one tick, in the order the tick reached it ('A>B': returned A, then B after a re-tick)
  const S = 'SUCCESS', F = 'FAILURE', R = 'RUNNING';
  const SCENES = [
    { key: 'first', label: '1st tick', ret: { root: R, st1: S, info1: S, wait5a: R }, order: ['root', 'st1', 'info1', 'wait5a'],
      text: '<b>The first tick.</b> The Sequence ticks <code>SetStatus</code> (LEDs red) and <code>Info</code>, which both finish at once, then <code>Wait</code>, which returns RUNNING. The Sequence stops there and returns RUNNING too, and so does the root.' },
    { key: 'later', label: '5 s on', ret: { root: R, wait5a: S, retry: R, seq: R, get: R }, order: ['root', 'wait5a', 'retry', 'seq', 'get'],
      text: '<b>5 s later.</b> The Sequence goes straight back to <code>Wait</code> (the first two are not ticked again). <code>Wait</code> succeeds, so the tick goes on to the retry, its Sequence and <code>GetBoolTopic</code>, which subscribes and returns RUNNING. RUNNING passes all the way up.' },
    { key: 'killed', label: 'Killed', ret: { root: R, retry: R, seq: F + '>' + R, get: S + '>' + R, inv: F, istrue: S }, order: ['root', 'retry', 'seq', 'get', 'inv', 'istrue'],
      text: '<b>A message arrives: killed.</b> <code>GetBoolTopic</code> writes <code>true</code> and succeeds. <code>IsTrue</code> succeeds, the <code>Inverter</code> turns that into FAILURE, so the inner Sequence fails. The retry resets it and ticks it again in the same tick: <code>GetBoolTopic</code> starts a fresh read and returns RUNNING, so everything above returns RUNNING.' },
    { key: 'inserted', label: 'Inserted', ret: { root: R, retry: R, seq: R, get: S, inv: S, istrue: F, wait1: R }, order: ['root', 'retry', 'seq', 'get', 'inv', 'istrue', 'wait1'],
      text: '<b>A message arrives: not killed.</b> <code>GetBoolTopic</code> writes <code>false</code>. <code>IsTrue</code> fails, the <code>Inverter</code> turns that into SUCCESS, and the Sequence moves on to <code>Wait</code> 1 s, which returns RUNNING.' },
    { key: 'go', label: '1 s on', ret: { root: R, retry: S, seq: S, wait1: S, info2: S, st2: S, wait5b: R }, order: ['root', 'retry', 'seq', 'wait1', 'info2', 'st2', 'wait5b'],
      text: '<b>One second later.</b> The inner Sequence resumes at <code>Wait</code> (it does not read the switch again), prints, and succeeds. So does the retry. The outer Sequence moves on: LEDs blink blue, and the last <code>Wait</code> runs.' },
  ];
  let scene = 0;
  host.innerHTML = `<div class="controls"><span class="seg" role="group" aria-label="Which tick">${SCENES.map((c, i) => `<button data-s="${i}" aria-pressed="${i === scene}">${c.label}</button>`).join('')}</span></div>`;
  const gHost = document.createElement('div');
  host.appendChild(gHost);
  const note = document.createElement('div');
  note.className = 'graph-note';
  host.appendChild(note);

  // phones: an indented outline, one row per node, with elbow lines drawn here
  const W = 150, H = 38, PITCH = 47, IND = 22;
  const narrowNodes = {};
  N.forEach((n, i) => { narrowNodes[n.id] = { x: 6 + n.d * IND + W / 2, y: 24 + i * PITCH, w: W, h: H }; });
  narrowNodes.info1.sub = 'Waiting for kill…';
  narrowNodes.retry.sub = 'attempts −1';
  narrowNodes.retry.label = 'RetryUntilSuccessful';
  const hideEdges = {};
  Object.entries(PARENT).forEach(([c, p]) => (hideEdges[`${p}>${c}`] = { opacity: 0 }));

  let svgDone = null;
  const graph = new Graph(gHost, {
    width: 830, height: 480, arrows: false,
    nodes: N.map((n) => ({ ...n, h: 58, w: { seq: 150, get: 150, retry: 170 }[n.id] })),
    edges: Object.entries(PARENT).map(([c, p]) => ({ from: p, to: c })),
    narrow: { below: 600, width: 360, height: 24 + (N.length - 1) * PITCH + 30, nodes: narrowNodes, edges: hideEdges },
    info: (n) => { decorate(); note.innerHTML = n ? INFO[n.id] : SCENES[scene].text; },
  });

  function decorate(force) {
    if (!graph.svg || (svgDone === graph.svg && !force)) return;
    const narrow = graph.narrowOn;
    graph.svg.classList.add('wfk');
    graph.svg.querySelectorAll('.wfk-x').forEach((e) => e.remove());
    if (narrow && svgDone !== graph.svg) {
      // elbow lines: down from the parent's left side, across to the child
      Object.entries(PARENT).forEach(([c, p]) => {
        const a = graph.nodes.get(p), b = graph.nodes.get(c);
        const x = a.x - a.w / 2 + 11;
        const path = document.createElementNS(SVGNS, 'path');
        path.setAttribute('class', 'edge wfk-elbow');
        path.setAttribute('d', `M${x},${a.y + a.h / 2} V${b.y} H${b.x - b.w / 2 - 2}`);
        graph.gEdges.appendChild(path);
      });
    }
    if (!narrow && svgDone !== graph.svg) {
      // wide layout: three lines in each box (name, detail, what it returned)
      graph.nodes.forEach((n) => { const [a, b] = n.g.querySelectorAll('text'); a.setAttribute('y', -15); b.setAttribute('y', 1); });
    }
    svgDone = graph.svg;
    const sc = SCENES[scene];
    graph.nodes.forEach((n, id) => {
      const r = sc.ret[id];
      n.g.classList.toggle('wfk-off', !r);
      ['SUCCESS', 'FAILURE', 'RUNNING'].forEach((st) => n.g.classList.toggle('wfk-' + st, !!r && r.split('>').pop() === st));
      if (!r) return;
      const t = document.createElementNS(SVGNS, 'text');
      t.setAttribute('class', 'wfk-x wfk-chip');
      if (narrow) { t.setAttribute('x', n.w / 2 + 7); t.setAttribute('y', 0); t.style.textAnchor = 'start'; }
      else { t.setAttribute('x', 0); t.setAttribute('y', 17); t.style.textAnchor = 'middle'; }
      const ord = document.createElementNS(SVGNS, 'tspan');
      ord.setAttribute('class', 'ord');
      ord.textContent = sc.order.indexOf(id) + 1 + ' ';
      t.appendChild(ord);
      r.split('>').forEach((st, k) => {
        if (k) { const ar = document.createElementNS(SVGNS, 'tspan'); ar.textContent = ' → '; ar.setAttribute('class', 'then'); t.appendChild(ar); }
        const sp = document.createElementNS(SVGNS, 'tspan');
        sp.setAttribute('class', 'st ' + st);
        sp.textContent = st;
        t.appendChild(sp);
      });
      n.g.appendChild(t);
    });
  }
  host.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-s]');
    if (!b) return;
    scene = +b.dataset.s;
    host.querySelectorAll('[data-s]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    decorate(true);
    graph.highlight(null);
  });
  graph.highlight(null);
}

// ---------- control node and decorator tables (counts from the XML) ----------
getJSON('usage.json').then(({ counts }) => {
  const c = (k) => counts[k] ?? 0;
  const table = (host, head, rows) => {
    document.getElementById(host).innerHTML = `<table class="params bt-table"><thead><tr>${head.map((h, i) => `<th${i === head.length - 1 ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows
      .map((r) => `<tr><td><code>${r[0]}</code></td><td>${r[1].replace(/<code>([^<]*)<\/code>/g, '<code><span>$1</span></code>')}</td><td class="num">${r[2]}</td></tr>`).join('')}</tbody></table>`;
  };
  table('control-table', ['Node', 'Ticks its children…', 'Uses'], [
    ['Sequence', 'in order until one fails or runs. Resumes at the RUNNING child next tick.', c('Sequence')],
    ['Fallback', 'in order until one succeeds or runs. Fails if all fail.', c('Fallback')],
    ['IfThenElse', 'the first; then the second if it succeeded, else the third (fails if there is no third).', c('IfThenElse')],
    ['ReactiveSequence', 'from the first on every tick; halts the running child if an earlier one fails.', c('ReactiveSequence')],
    ['Parallel', 'all of them every tick; done when <code>success_threshold</code> succeed or <code>failure_threshold</code> fail.', c('Parallel')],
    ['Switch2', 'the one whose case matches a blackboard value.', c('Switch2')],
  ]);
  table('decorator-table', ['Decorator', 'What it does', 'Uses'], [
    ['ForceSuccess', 'SUCCESS whenever the child finishes, whatever it returned.', c('ForceSuccess')],
    ['RetryUntilSuccessful', 'ticks the child again after a FAILURE, up to <code>num_attempts</code> (−1 forever).', c('RetryUntilSuccessful')],
    ['RetryUntilSuccessful­OrTimeout', 'Talos\'s: ticks the child again after a FAILURE, until it succeeds or <code>num_seconds</code> pass.', c('Decorator:RetryUntilSuccessfulOrTimeout')],
    ['ForceFailure', 'FAILURE whenever the child finishes.', c('ForceFailure')],
    ['Inverter', 'swaps SUCCESS and FAILURE; RUNNING passes through.', c('Inverter')],
    ['Repeat', 'runs the child <code>num_cycles</code> times; fails at the first FAILURE.', c('Repeat')],
    ['Delay', 'waits <code>delay_msec</code> before ticking the child.', c('Delay')],
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
  SeenRecently: 'Condition: SUCCESS if the detector (or mapping) reported this class within max_age_secs. Answers from a cached time, so it is cheap to re-check every tick. Here: your "Torpedo in view" switch.',
  MapConverged: 'Condition: SUCCESS once mapping\'s error for the object is below target_cov. Here: your "Map" switch.',
  SetStatus: 'Sets the LED pattern. Finishes in onStart.',
  SetMappingTarget: 'Calls the mapping_target service (which props mapping updates). RUNNING until the reply; here it arrives on the next tick.',
  getCovariance: 'Subscribes to mapping/<Target> and waits for one message, then writes its error to Covariance. Here the message arrives on the next tick; the value comes from your "Map" switch.',
  Wait: 'RUNNING until seconds have passed since its first tick.',
  FollowPath: 'Async action: onStart parses the waypoints; onRunning sends the goal to the MPC\'s follow_path server, waits for it to be accepted, then for the result. onHalted cancels the goal. You decide when the path is finished.',
  CenterDetection: 'Async action: chases the latest detection until Talos is square on to it (you press Centred). FAILURE if no detection for 1.5 s (take the torpedo out of view) or after timeout_secs.',
};
const short = (s, n = 64) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
function label(n) {
  const s = n.spec, a = s.attrs || {}, k = n.kind;
  switch (k) {
    case 'SetBlackboard': return `${a.output_key} = ${a.value}`;
    case 'Info': case 'Error': return `"${short(a.message || '', 46)}"`;
    case 'Math': return `${a.out} = ${a.a} ${a.operator} ${a.b}`;
    case 'Format': return `${a.out} = "${a.format}"`;
    case 'CompareNums': return `${a.a} ${a.test} ${a.b}` + (s.name ? ` · ${short(s.name, 36)}` : '');
    case 'SeenRecently': return `${a.object_name} in the last ${a.max_age_secs} s`;
    case 'MapConverged': return `${a.object} below ${a.target_cov}`;
    case 'getCovariance': return `${a.Covariance} ← mapping/${a.Target}`;
    case 'FollowPath': return `${a.waypoints}, timeout ${a.timeout} s`;
    case 'CenterDetection': return `${a.object_name}, timeout ${a.timeout_secs} s`;
    case 'Wait': return `${a.seconds} s`;
    case 'SetStatus': return a.status;
    case 'SetMappingTarget': return `target ${a.target_object}`;
    case 'RetryUntilSuccessfulOrTimeout': return `${s.name ? short(s.name, 40) + ' · ' : ''}${a.num_seconds} s`;
    default: return s.name ? short(s.name, 70) : '';
  }
}
const kindName = (k) => (k === 'RetryUntilSuccessfulOrTimeout' ? 'RetryUntilSuccessful­OrTimeout' : k);

Promise.all([getJSON('searchmpc.json')]).then(([data]) => {
  const host = document.getElementById('bt-sim');
  const inputs = data.call.values; // the keys TorpedoTreeMpc maps in, and their values there
  let sim, plain = false, selected = null, timer = null, note = '';
  const folded = new Set(), unfolded = new Set();

  host.innerHTML = `
    <div class="bt-bar">
      <div class="bt-run">
        <button class="btn primary" data-a="step">Step</button>
        <button class="btn" data-a="next">Next change</button>
        <button class="btn" data-a="play" aria-pressed="false">Play</button>
        <button class="btn" data-a="reset">Reset</button>
        <span class="bt-clock" aria-live="polite"></span>
      </div>
      <div class="bt-world">
        <label class="bt-switch"><input type="checkbox" data-w="seen"> Torpedo in view</label>
        <label class="bt-switch"><input type="checkbox" data-w="converged"> Map converged</label>
        <button class="btn" data-a="arrive" disabled>Path finished</button>
        <button class="btn" data-a="centred" disabled>Centred</button>
      </div>
      <div class="bt-hint"></div>
      <ol class="bt-last" aria-hidden="true"></ol>
    </div>
    <div class="bt-grid">
      <div class="bt-main">
        <div class="bt-variant"><span>The sweep's control node:</span>
          <span class="seg" role="group" aria-label="Control node around FollowPath"><button aria-pressed="true" data-v="reactive">ReactiveSequence (real)</button><button aria-pressed="false" data-v="plain">plain Sequence</button></span></div>
        <div class="bt-tree" role="tree" aria-label="SearchMpc subtree"></div>
      </div>
      <div class="bt-side">
        <div class="bt-detail"></div>
        <h4>Blackboard</h4>
        <div class="bt-bb"></div>
        <h4>Log</h4>
        <ol class="bt-log"></ol>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const treeEl = $('.bt-tree');

  function reset() {
    stop();
    sim = new Sim(data.tree.children[0], inputs, { plainSequence: plain });
    note = '';
    host.querySelectorAll('[data-w]').forEach((i) => (i.checked = false));
    if (selected === null || selected >= sim.nodes.length) selected = null;
    if (!folded.size && !unfolded.size) {
      // fold the two long IfThenElse branches that only pick numbers
      for (const n of sim.nodes) if (n.kind === 'IfThenElse' && /arc, pan and distance|widen the next sweep/.test(n.spec.name || '')) folded.add('n' + n.id);
    }
    render();
  }
  function stop() { clearInterval(timer); timer = null; const b = $('[data-a="play"]'); if (b) { b.setAttribute('aria-pressed', 'false'); b.textContent = 'Play'; } }

  // ---- the outline: rows for nodes, plus folds for runs of quick bookkeeping leaves ----
  function rows() {
    const out = [];
    const walk = (n, d) => {
      out.push({ type: 'node', n, d });
      const key = 'n' + n.id;
      const isFolded = folded.has(key);
      if (isFolded || !n.children.length) return;
      const ch = n.children;
      for (let i = 0; i < ch.length;) {
        let j = i;
        while (j < ch.length && FOLDABLE.has(ch[j].kind)) j++;
        if (j - i >= 3) {
          const fk = `f${n.id}-${i}`;
          const run = ch.slice(i, j);
          const open = unfolded.has(fk);
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
  function render() {
    const R = rows();
    treeEl.innerHTML = R.map((r) => {
      if (r.type === 'fold') {
        const counts = {};
        r.run.forEach((c) => (counts[c.kind] = (counts[c.kind] || 0) + 1));
        const text = Object.entries(counts).map(([k, v]) => (v > 1 ? `${v} × ${k}` : k)).join(', ');
        const ticked = r.run.map((c) => sim.visits.get(c.id)).filter(Boolean);
        const st = ticked.length ? ticked[ticked.length - 1].result : IDLE;
        return `<div class="bt-row fold${ticked.length ? ' now' : ''}" style="--d:${r.d}" data-fold="${r.key}" role="treeitem" aria-expanded="${r.open}" tabindex="0">
          <span class="caret">${r.open ? '▾' : '▸'}</span><span class="chip ${st}${ticked.length ? ' now' : ''}">${ticked.length ? ST[st] : 'idle'}</span>
          <span class="txt"><span class="lbl">${r.open ? 'hide' : 'show'} ${esc(text)}</span>${ticked.length ? `<span class="det">${ticked.length} ticked</span>` : ''}</span></div>`;
      }
      const n = r.n, c = chip(n), k = n.kind;
      const isStale = stale(n);
      const hasKids = n.children.length > 0;
      const open = !folded.has('n' + n.id);
      const det = n.detail && (c.now || n.status === RUNNING) ? n.detail() : ''; // live details only where the tick is
      const cls = KIND[k] || (ROS_NODES.has(k) ? 'ros' : 'act');
      return `<div class="bt-row${c.now ? ' now' : ''}${selected === n.id ? ' sel' : ''}${sim.halted.has(n.id) ? ' halted' : ''}${isStale ? ' stale' : ''}" style="--d:${r.d}" data-id="${n.id}" role="treeitem" tabindex="0"${hasKids ? ` aria-expanded="${open}"` : ''}>
        <span class="caret"${hasKids ? ' data-toggle="1"' : ''}>${hasKids ? (open ? '▾' : '▸') : ''}</span><span class="chip ${c.st}${c.now ? ' now' : ''}">${c.st === IDLE ? 'idle' : ST[c.st]}</span>${c.now ? `<span class="ord" title="order reached in this tick">${c.order}</span>` : ''}
        <span class="txt"><span class="kind ${cls}">${kindName(k)}</span> <span class="lbl">${esc(label(n))}</span>${sim.halted.has(n.id) ? '<span class="tag halt">halted</span>' : ''}${isStale ? '<span class="tag stale">left running, never halted</span>' : ''}${det ? `<span class="det">${esc(det)}</span>` : ''}</span></div>${selected === n.id && narrowQ.matches ? `<div class="bt-detail inline" style="--d:${r.d}">${detailHTML()}</div>` : ''}`;
    }).join('');
    renderSide();
  }
  const narrowQ = matchMedia('(max-width: 900px)');
  narrowQ.addEventListener('change', () => render());
  function detailHTML() {
    if (selected === null) return '<p class="bt-muted">Tap a node to see its XML and what it does.</p>';
    const n = sim.nodes[selected], s = n.spec;
    const attrs = Object.entries(s.attrs || {}).filter(([, v]) => v !== '');
    const xml = `&lt;${s.tag}${s.id ? ` ID="${esc(s.id)}"` : ''}${s.name ? ` name="${esc(s.name)}"` : ''}${attrs.map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}${n.children.length ? '&gt;' : '/&gt;'}`;
    const swapped = s.tag === 'ReactiveSequence' && plain;
    return `<div class="bt-dhead"><b>${kindName(n.kind)}</b> <a href="${TREE_URL}#L${s.line}">line ${s.line}</a></div>
      <p>${esc(SEM[swapped ? 'Sequence' : n.kind] || '')}${swapped ? ' (Swapped in for the real ReactiveSequence.)' : ''}</p>
      <pre class="bt-xml"><code>${xml}</code></pre>
      <p class="bt-muted">Status now: ${n.status}${n.detail && n.detail() ? ' · ' + esc(n.detail()) : ''}</p>`;
  }
  function renderSide() {
    const w = sim.world;
    const res = sim.result;
    $('.bt-clock').innerHTML = `Tick <b>${sim.tickNo}</b> · ${sim.t.toFixed(2)} s · SearchMpc <b class="st-${res || sim.root.status}">${res || sim.root.status}</b>`;
    $('[data-a="arrive"]').disabled = !w.flying || !!res;
    $('[data-a="centred"]').disabled = !w.centring || !!res;
    host.querySelectorAll('[data-a="step"],[data-a="next"],[data-a="play"]').forEach((b) => (b.disabled = !!res));
    let hint = note;
    if (!hint) {
      if (res) hint = `SearchMpc finished with ${res}. In TorpedoTreeMpc a ForceSuccess around it lets the task carry on either way. Reset to run it again.`;
      else if (sim.tickNo === 0) hint = 'Press Step to tick the root once.';
      else if (w.flying) hint = 'FollowPath is flying the sweep. Press Path finished, or put the torpedo in view.';
      else if (w.centring) hint = 'CenterDetection is chasing the torpedo. Press Centred, or take it out of view for 1.5 s to lose it.';
    }
    $('.bt-hint').textContent = hint;

    // detail of the selected node: beside the tree, or under its row on narrow screens
    $('.bt-detail').innerHTML = detailHTML();
    // blackboard
    const keys = [...sim.bb.keys()];
    keys.sort((a, b) => (sim.bbInfo.get(b)?.remapped ? 1 : 0) - (sim.bbInfo.get(a)?.remapped ? 1 : 0));
    $('.bt-bb').innerHTML = `<table class="bt-bbt"><tbody>${keys.map((k) => {
      const info = sim.bbInfo.get(k) || {};
      let v = sim.bb.get(k);
      const from = info.remapped && data.call.remap[k] !== k ? ` <span class="bt-muted">(caller's <code>${esc(data.call.remap[k])}</code>)</span>` : '';
      if (k === 'cov') v += ' (from your Map switch)';
      return `<tr class="${sim.written.has(k) ? 'hot' : ''}"><td><code>${esc(k)}</code>${info.remapped ? '<span class="tag remap">remapped in</span>' : ''}</td><td>${esc(short(String(v), 90))}${from}</td></tr>`;
    }).join('')}</tbody></table>`;

    // log
    const ev = sim.events.slice(-14).reverse();
    // phones: the log sits far below the tree, so the latest two lines also show in the sticky bar
    $('.bt-last').innerHTML = ev.slice(0, 2).map((e) => `<li class="${e.cls}"><span>${e.tick}</span>${esc(e.msg)}</li>`).join('');
    $('.bt-log').innerHTML = ev.length ? ev.map((e) => `<li class="${e.cls}"><span>${e.tick}</span>${esc(e.msg)}</li>`).join('') : '<li class="empty">Nothing yet. The number is the tick.</li>';
  }

  function act(a) {
    note = '';
    if (a === 'step') sim.tick();
    else if (a === 'next') {
      const ok = sim.untilChange(10);
      if (!ok) note = 'Nothing changed in 10 s of tree time. Each press skips up to 10 s more.';
    } else if (a === 'reset') { reset(); return; } else if (a === 'arrive') sim.world.pathDone = true;
    else if (a === 'centred') sim.world.centred = true;
    else if (a === 'play') {
      if (timer) { stop(); } else {
        const b = $('[data-a="play"]');
        b.setAttribute('aria-pressed', 'true'); b.textContent = 'Pause';
        timer = setInterval(() => { sim.tick(); if (sim.result) stop(); render(); }, 220);
      }
    }
    render();
  }
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-a]');
    if (b) { act(b.dataset.a); return; }
    const v = e.target.closest('button[data-v]');
    if (v) {
      plain = v.dataset.v === 'plain';
      host.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-pressed', String(x === v)));
      reset();
      return;
    }
    const fold = e.target.closest('.bt-row.fold');
    if (fold) { const k = fold.dataset.fold; unfolded.has(k) ? unfolded.delete(k) : unfolded.add(k); render(); return; }
    const row = e.target.closest('.bt-row[data-id]');
    if (row) {
      const id = +row.dataset.id;
      if (e.target.closest('[data-toggle]')) { const k = 'n' + id; folded.has(k) ? folded.delete(k) : folded.add(k); }
      else selected = selected === id ? null : id;
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
    note = w === 'seen' ? (e.target.checked ? 'Detections arrive from the next tick on. Step to see who notices.' : 'No more detections from the next tick on.') : '';
    renderSide();
  });
  reset();
});

// ---------- subtree remapping explorer ----------
getJSON('subtrees.json').then((d) => {
  const host = document.getElementById('remap');
  const byParent = new Map();
  d.calls.forEach((c, i) => { if (!byParent.has(c.parent)) byParent.set(c.parent, []); byParent.get(c.parent).push(i); });
  const pick = Math.max(0, d.calls.findIndex((c) => c.parent === 'Dive' && c.child === 'PrimitiveMovePosition'));
  host.innerHTML = `<div class="controls"><label>Call <select id="remap-pick">${[...byParent.entries()].map(([p, ix]) => `<optgroup label="in ${esc(p)}">${ix.map((i) => `<option value="${i}"${i === pick ? ' selected' : ''}>${esc(p)} → ${esc(d.calls[i].child)} (line ${d.calls[i].line})</option>`).join('')}</optgroup>`).join('')}</select></label></div>
    <pre class="bt-xml" id="remap-xml"></pre><div id="remap-table"></div><div class="graph-note" id="remap-note"></div>`;
  const numeric = (s) => s !== null && s !== undefined && /^-?\d+(\.\d+)?$/.test(s);
  const show = (i) => {
    const c = d.calls[i];
    const attrs = c.ports.map((p) => ` ${p.port}="${esc(p.key)}"`).join('');
    host.querySelector('#remap-xml').innerHTML = `<code>&lt;SubTree ID="${esc(c.child)}" __shared_blackboard="false"${attrs}/&gt;</code>`;
    host.querySelector('#remap-table').innerHTML = c.ports.length
      ? `<table class="params bt-table"><thead><tr><th>Port in ${esc(c.child)}</th><th>Caller's key</th><th>Value there</th></tr></thead><tbody>${c.ports.map((p) => {
        const lit = numeric(p.value) && p.key === p.value;
        const lost = numeric(p.key) && p.value === null; // the number trick without its SetBlackboard
        const val = p.value !== null ? esc(p.value)
          : lost ? '<span class="bt-lost">never written in the caller: the subtree reads nothing and the node uses its C++ default</span>'
          : '<span class="bt-muted">set at run time, or remapped from further up</span>';
        return `<tr class="${lit ? 'lit' : lost ? 'lost' : ''}"><td><code>${esc(p.port)}</code></td><td><code>${esc(p.key)}</code></td><td>${val}</td></tr>`;
      }).join('')}</tbody></table>`
      : '<p class="bt-muted">No ports: the subtree only uses its own keys.</p>';
    const tricks = c.ports.filter((p) => numeric(p.value) && p.key === p.value).length;
    const lost = c.ports.filter((p) => numeric(p.key) && p.value === null).length;
    host.querySelector('#remap-note').innerHTML = `<a href="${TREE_URL}#L${c.line}">Line ${c.line}</a> of RepairCompMpcTree.xml.`
      + (tricks ? ` ${tricks} of ${c.ports.length} port${c.ports.length > 1 ? 's' : ''} pass a number through a key named after it.` : '')
      + (lost ? ` <b>${lost === 1 ? 'One port names' : `${lost} ports name`} a number the caller never writes</b>, so the trick fails silently here.` : '')
      + (c.unmapped.length ? ` Declared but not mapped: <code>${c.unmapped.map(esc).join('</code>, <code>')}</code> (missing inside the subtree).` : '');
  };
  host.querySelector('#remap-pick').addEventListener('change', (e) => show(+e.target.value));
  show(pick);
});

// ---------- SearchMpc as a state machine ----------
{
  const host = document.getElementById('fsm-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const INFO = {
    sweep: '<b>Sweep</b>: <code>FollowPath</code> flies arcs round the estimate, inside a <code>ReactiveSequence</code> behind two inverted conditions (<code>SeenRecently</code> 0.5 s, <code>MapConverged</code>).',
    chase: '<b>Chase</b>: a <code>Sequence</code> that needs <code>SeenRecently</code> (1 s), then <code>CenterDetection</code> inside <code>ForceSuccess</code>, so losing it still moves on.',
    hold: '<b>Hold</b>: <code>RetryUntilSuccessfulOrTimeout</code> (8 s) around a <code>Fallback</code>: <code>MapConverged</code>, or not seen for 2 s.',
    check: '<b>Check</b>: <code>getCovariance</code>, then a <code>Fallback</code>: <code>CompareNums</code> cov &lt; target_cov, or fail this sweep.',
    widen: '<b>Widen</b>: an <code>IfThenElse</code> under <code>ForceFailure</code>: if nothing was seen in 20 s, <code>Math</code> adds 1 to <code>stage</code> (0, 1, 2, then back to 0).',
    done: '<b>Done</b>: the sweep <code>Sequence</code> succeeds, so the retry decorator returns SUCCESS.',
    out: '<b>Out of time</b>: the 100 s <code>RetryUntilSuccessfulOrTimeout</code> wraps the whole sweep. In a state machine that is an arrow from every state.',
  };
  const T = { dash: true, opacity: 0.55 }; // the 100 s limit, from every state
  new Graph(host, {
    width: 900, height: 330,
    nodes: [
      { id: 'sweep', x: 100, y: 100, label: 'Sweep', sub: 'FollowPath arcs' },
      { id: 'chase', x: 340, y: 100, label: 'Chase', sub: 'CenterDetection' },
      { id: 'hold', x: 580, y: 100, label: 'Hold', sub: 'until converged' },
      { id: 'check', x: 580, y: 265, label: 'Check', sub: 'cov < target?' },
      { id: 'widen', x: 100, y: 265, label: 'Widen', sub: 'stage + 1' },
      { id: 'done', x: 810, y: 265, label: 'Done', sub: 'SUCCESS', bold: true },
      { id: 'out', x: 810, y: 100, label: 'Out of time', sub: '100 s', bold: true },
    ],
    edges: [
      { from: 'sweep', to: 'chase', label: 'seen' },
      { from: 'chase', to: 'hold', label: 'centred or lost' },
      { from: 'hold', to: 'check', label: 'converged, lost or 8 s', lx: 592, ly: 186, anchor: 'start' },
      { from: 'sweep', to: 'check', label: 'path done, unseen', bend: 22, lx: 300, ly: 222 },
      { from: 'check', to: 'sweep', label: 'not yet, but seen', bend: 22, lx: 395, ly: 152 },
      { from: 'check', to: 'done', label: 'converged' },
      { from: 'check', to: 'widen', label: 'not yet, nothing seen', lx: 340, ly: 258 },
      { from: 'widen', to: 'sweep', label: 'wider', lx: 88, ly: 186, anchor: 'end' },
      { from: 'sweep', to: 'out', ...T, bend: -78 },
      { from: 'chase', to: 'out', ...T, bend: -46 },
      { from: 'hold', to: 'out', ...T },
      { from: 'check', to: 'out', ...T },
      { from: 'widen', to: 'out', ...T, bend: 60 },
    ],
    narrow: {
      // phones: the states in a column; only Check's 100 s arrow is drawn (the box says "any state")
      below: 600, width: 360, height: 515,
      nodes: {
        sweep: { x: 180, y: 35 }, chase: { x: 180, y: 125 }, hold: { x: 180, y: 215 }, check: { x: 180, y: 305 },
        widen: { x: 70, y: 400 }, done: { x: 290, y: 400 }, out: { x: 180, y: 480, sub: '100 s, from any state' },
      },
      edges: {
        'sweep>chase': { lx: 190, ly: 84, anchor: 'start' }, 'chase>hold': { label: 'centred / lost', lx: 190, ly: 174, anchor: 'start' },
        'hold>check': { label: 'done or 8 s', lx: 190, ly: 264, anchor: 'start' },
        'sweep>check': { bend: 0, via: [350, 170], label: 'path done', lx: 270, ly: 174, anchor: 'start' },
        'check>sweep': { bend: 0, via: [20, 170], label: 'seen', lx: 108, ly: 178, anchor: 'start' },
        'widen>sweep': { bend: 0, via: [-40, 200], label: 'wider', lx: 50, ly: 216, anchor: 'start' },
        'check>widen': { label: 'unseen', lx: 112, ly: 346, anchor: 'end' },
        'check>done': { lx: 248, ly: 346, anchor: 'start' },
        'check>out': { bend: 0 },
        'sweep>out': { opacity: 0 }, 'chase>out': { opacity: 0 }, 'hold>out': { opacity: 0 }, 'widen>out': { opacity: 0 },
      },
    },
    info: (n) => { note.innerHTML = n ? INFO[n.id] : 'Tap or hover a state.'; },
  }).highlight(null);
  host.appendChild(note);
}
