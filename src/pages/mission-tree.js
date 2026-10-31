import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/mission-tree.css';
import { Graph } from '../viz/graph.js';
import { el } from '../viz/chart.js';
import { TreeExplorer, fmtT } from '../viz/mission-tree-explorer.js';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/trees/';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const load = (f) => fetch(`${BASE}data/mission-tree/${f}`).then((r) => r.json());

Promise.all([load('tree.json'), load('run.json')]).then(([tree, run]) => {
  flowGraph(run);
  explorer(tree, run);
  treeFiles(tree);
});
searchFigure();

// ---------- the mission in one picture ----------
function flowGraph(run) {
  const seg = (label) => run.segments.filter((s) => s[2] === label).reduce((a, s) => a + (s[1] - s[0]), 0);
  const secs = (...labels) => Math.round(labels.reduce((a, l) => a + seg(l), 0));
  const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`);
  const N = (id, label, x, y, sub, info) => ({ id, label, x, y, sub, info, w: 96 });
  const nodes = [
    N('kill', 'Kill switch', 62, 130, 'then 5 s', 'WaitForKillSwitch and PrepForRun: wait for state/kill to read not killed, wait 5 s, lock the map with no target, reload and disarm the actuators.'),
    N('dive', 'Dive', 170, 130, dur(secs('Dive')), 'Straight down to −0.75 m (the tree asks for −0.56; PrimitiveMovePosition won\'t go shallower than −0.75). The only step that can end the mission: 60 s to reach depth.'),
    N('gate', 'Gate', 278, 130, dur(secs('Gate')), 'GateTreeMpc: through gate_repair from its prior, map locked. The old FlipTree turns the controller off for 10 s on the way.'),
    N('slalom', 'Slalom', 386, 130, dur(secs('Slalom')), 'SlalomPathMpc: one look to 0.3, then one path through the three pole sets, on the side the gate picked, ending at the torpedo\'s stand-off.'),
    N('pinger', 'Pinger', 494, 130, dur(secs('Pinger')), 'RandomPingerTree: listen 10 s at the torpedo and 10 s at the table. Louder at the torpedo stop means table first. In Nereus there is no pinger: torpedo first.'),
    N('torp', 'Torpedo', 616, 55, dur(secs('To torpedo', 'Torpedo')), 'Map the board (to 0.0025) and both holes (to 0.0005), then shoot torpedo 0 into the large hole and torpedo 1 into the small one.'),
    N('table', 'Table', 616, 205, dur(secs('To table', 'Table')), 'Map both baskets to 0.0005, fit the table to them, then four times: pick up an item, surface, drop it in its basket. Spin and surface at the end.'),
    N('bins', 'Bins', 738, 130, dur(secs('To bins', 'Bins')), 'Split the two fire vinyls with the binary classifier and drop a marker on each from 1 m.'),
    N('mag', 'Magnets', 846, 130, dur(secs('Magnets')), 'Fit the bin\'s CAD to the vinyls, then touch each magnet with magnet_link and hold 2 s.'),
    N('home', 'Home', 954, 130, dur(secs('Home')), 'One path out of the bins and back through the gate\'s prior, then the controller is disabled.'),
  ];
  const edges = [
    { from: 'kill', to: 'dive' }, { from: 'dive', to: 'gate' }, { from: 'gate', to: 'slalom' }, { from: 'slalom', to: 'pinger' },
    { from: 'pinger', to: 'torp', label: 'torpedo first' }, { from: 'pinger', to: 'table', label: 'table first' },
    { from: 'torp', to: 'table', bend: 22 }, { from: 'table', to: 'torp', bend: 22 },
    { from: 'torp', to: 'bins' }, { from: 'table', to: 'bins' }, { from: 'bins', to: 'mag' }, { from: 'mag', to: 'home' },
  ];
  const host = document.getElementById('flow-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const hint = 'Tap a task.';
  const col = [[170, 32], [170, 102], [170, 172], [170, 242], [170, 312]];
  const narrow = {
    width: 340, height: 660, below: 640,
    nodes: {
      kill: { x: col[0][0], y: col[0][1] }, dive: { x: col[1][0], y: col[1][1] }, gate: { x: col[2][0], y: col[2][1] },
      slalom: { x: col[3][0], y: col[3][1] }, pinger: { x: col[4][0], y: col[4][1] },
      torp: { x: 75, y: 400 }, table: { x: 265, y: 400 },
      bins: { x: 170, y: 478 }, mag: { x: 170, y: 556 }, home: { x: 170, y: 634 },
    },
    edges: {
      'pinger>torp': { lx: 92, ly: 352, anchor: 'end' }, 'pinger>table': { lx: 248, ly: 352, anchor: 'start' },
    },
  };
  new Graph(host, {
    width: 1016, height: 260, nodes, edges, narrow,
    info: (n) => { note.innerHTML = n ? `<b>${n.label}.</b> ${n.info}` : hint; },
  });
  host.appendChild(note);
  note.textContent = hint;
}

// ---------- the explorer ----------
function explorer(tree, run) {
  const ex = new TreeExplorer({
    tree, run,
    treeEl: document.getElementById('mt-tree'),
    crumbsEl: document.getElementById('mt-crumbs'),
    detailEl: document.getElementById('mt-detail'),
    searchEl: document.getElementById('mt-q'),
  });
  // On a narrow screen the detail panel sits below the tree: after a tap on a row, bring its top into view if it is
  // off screen, leaving the tree's lower half visible above it.
  const detailEl = document.getElementById('mt-detail');
  ex.treeEl.addEventListener('click', (e) => {
    if (!e.target.closest('.mt-row') || e.target.closest('.mt-caret') || !matchMedia('(max-width: 860px)').matches) return;
    const top = detailEl.getBoundingClientRect().top;
    if (top > innerHeight - 90) {
      window.scrollBy({ top: top - innerHeight * 0.5, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  });
  const play = document.getElementById('mt-play'), scrub = document.getElementById('mt-scrub'), timeOut = document.getElementById('mt-time');
  const follow = document.getElementById('mt-follow'), segsEl = document.getElementById('mt-segs');
  const taskEl = document.getElementById('mt-task'), taskT = document.getElementById('mt-taskt'), segNow = document.getElementById('mt-segnow');
  let curSeg = null;
  function showTask(s, preview) {
    taskEl.textContent = s ? s[2] : t < (run.segments[0] || [0])[0] ? 'Waiting for the kill switch' : '–';
    taskT.textContent = s ? `${fmtT(s[0])}–${fmtT(s[1])}` : '';
    segNow.classList.toggle('preview', !!preview);
  }
  const runEl = document.getElementById('mt-running'), logEl = document.getElementById('mt-log');
  const video = document.getElementById('mt-video');
  video.src = `${BASE}${run.video.src}`;
  const end = run.duration;
  scrub.max = end;
  let t = 0, playing = false, speed = 16, last = 0, lastDraw = 0;

  // the task strip
  const TRANSIT = /^To |^Kill|^Prep|^Dive/;
  for (const [a, b, label] of run.segments) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.style.left = `${(a / end) * 100}%`;
    btn.style.width = `${((b - a) / end) * 100}%`;
    btn.title = `${label}, ${fmtT(a)}–${fmtT(b)}`;
    btn.setAttribute('aria-label', btn.title);
    btn.innerHTML = `<span>${label}</span>`;
    if (TRANSIT.test(label)) btn.classList.add('transit');
    btn.onclick = () => jump(a + 0.3);
    // hovering a segment names it under the strip; the strip itself has no room for most names
    btn.onmouseenter = () => showTask([a, b, label], true);
    btn.onmouseleave = () => showTask(curSeg, false);
    segsEl.appendChild(btn);
  }
  const fitLabels = () => {
    segsEl.querySelectorAll('button').forEach((b) => b.classList.toggle('short', b.firstChild.offsetWidth > b.clientWidth - 4));
  };
  new ResizeObserver(fitLabels).observe(segsEl);

  const at = (rows, time) => { let lo = -1; for (let i = 0; i < rows.length && rows[i][0] <= time; i++) lo = i; return lo; };
  function update(force) {
    scrub.value = t;
    timeOut.textContent = fmtT(t);
    const si = at(run.segments, t);
    const s = si >= 0 && t <= run.segments[si][1] + 0.5 ? run.segments[si] : null;
    if (s !== curSeg || !segNow.classList.contains('preview')) { curSeg = s; showTask(s, false); }
    segsEl.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === si && !!s)));
    const li = at(run.log, t);
    logEl.textContent = li >= 0 ? run.log[li][2] : '–';
    const changed = ex.setTime(t);
    runEl.textContent = ex.runningLabel();
    const now = performance.now();
    if ((changed || force) && (force || !playing || now - lastDraw > 120)) {
      lastDraw = now;
      ex.render();
      if (ex.follow) ex.scrollToLeaf();
      if (ex.sel !== null) ex.detail();
    }
    // the camera, kept in step
    if (video.readyState >= 1) {
      const vt = Math.min(Math.max(t - run.video.t0, 0), video.duration || end);
      const rate = playing ? speed : 0;
      if (rate) {
        if (video.playbackRate !== rate) video.playbackRate = rate;
        if (video.paused) video.play().catch(() => {});
      } else if (!video.paused) video.pause();
      if (!video.seeking && Math.abs(video.currentTime - vt) > (rate ? 2 + rate * 0.2 : 0.3)) video.currentTime = vt;
    }
  }
  function frame(now) {
    if (!playing) return;
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    t = Math.min(end, t + dt * speed);
    update();
    if (t >= end) { setPlaying(false); return; }
    requestAnimationFrame(frame);
  }
  function setPlaying(on) {
    playing = on;
    if (!on) { video.pause(); update(true); }
    play.textContent = on ? 'Pause' : t >= end ? 'Replay' : 'Play';
    play.setAttribute('aria-pressed', String(on));
    if (on) {
      if (t >= end) t = 0;
      last = performance.now();
      requestAnimationFrame(frame);
    }
  }
  function jump(time) { t = Math.max(0, Math.min(end, time)); update(true); }
  play.onclick = () => setPlaying(!playing);
  scrub.oninput = () => { t = +scrub.value; update(); };
  scrub.onchange = () => update(true);
  document.querySelectorAll('#mt-speed button').forEach((b) => {
    b.onclick = () => {
      speed = +b.dataset.v;
      document.querySelectorAll('#mt-speed button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
    };
  });
  follow.onchange = () => { ex.follow = follow.checked; if (!ex.follow) ex.auto.clear(); ex.leafPath = undefined; update(true); };
  document.getElementById('mt-collapse').onclick = () => {
    const q = document.getElementById('mt-q');
    q.value = ''; ex.query = '';
    ex.collapse();
  };

  // the "Open in the explorer" links in each task section
  document.querySelectorAll('a.mt-jump').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const s = run.segments.find((x) => x[2] === a.dataset.seg);
      if (s) jump(s[0] + 0.3);
      const p = ex.find(a.dataset.node, s ? s[0] + 0.3 : null);
      if (p !== null) { ex.reveal(p); ex.select(p, true); }
      document.getElementById('explorer-fig').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    });
  });

  video.addEventListener('loadedmetadata', () => { if (!playing) video.currentTime = Math.min(Math.max(t - run.video.t0, 0), video.duration); });

  // start at the gate, with the task tree open down to what is running
  const gate = run.segments.find((x) => x[2] === 'Gate');
  t = gate ? gate[0] + 2 : 0;
  update(true);
  ex.detail();
}

// ---------- how Talos searches ----------
function searchFigure() {
  const host = document.getElementById('srch-fig');
  const note = document.getElementById('srch-note');
  const FOV = (27 * Math.PI) / 180; // SearchMpc's own note: the forward camera sees ±27°
  // SearchMpc's stages with the torpedo's numbers (max_dist 2, min_dist 1)
  const STAGES = [
    { sweep: 0.5, pan: 0.5, step: 0.25, dist: 2, text: 'First sweep: 0.5 rad each way round the estimate at max_dist = 2 m, panning the heading 0.5 rad each way. The camera\'s ±27° then covers about ±3 m round the estimate.' },
    { sweep: 1.0, pan: 0.7, step: 0.5, dist: 3, text: 'After a sweep that saw nothing: wider and farther, 1.0 rad each way at 1.5 × max_dist = 3 m, panning 0.7 rad, to see a board that faces another way or is hidden from one side.' },
    { sweep: 1.0, pan: 0.5, step: 0.5, dist: 1.5, text: 'Then wider and closer, 1.0 rad at 0.75 × max_dist = 1.5 m (never under min_dist = 1 m), for a small target or one beyond the estimate. Then round again from the first sweep, until the 100 s run out.' },
  ];
  const SPIRAL = { r0: 0.25, r1: 2.0, step: 0.25, speed: 0.2 };
  let mode = '0';

  function arcPieces(st) {
    // the three AddArcs: 0 → +sweep, +sweep → −sweep, −sweep → 0; pieces as AddArc cuts them (alternating pan)
    const legs = [[0, st.sweep], [st.sweep, -2 * st.sweep], [-st.sweep, st.sweep]];
    const pts = [];
    for (const [a0, sw] of legs) {
      const pieces = 2 * Math.max(1, Math.ceil(Math.abs(sw) / (2 * st.step) - 1e-9));
      for (let k = 0; k < pieces; k++) {
        const ang = a0 + (sw * (k + 1)) / pieces;
        pts.push({ ang, pan: k % 2 === 0 ? st.pan : -st.pan });
      }
    }
    return pts;
  }

  function draw() {
    host.innerHTML = '';
    // drawn at 1:1 in CSS pixels (no scaling), so the labels stay the size the stylesheet gives them
    const W = Math.max(280, Math.min(Math.floor(host.clientWidth), 680));
    const phone = W < 520;
    const ink = css('--ink'), accent = css('--accent'), state = css('--state');
    const svg = el('svg', { role: 'img' }, host);
    const label = (x, y, text, cls, anchor = 'start') => {
      const t = el('text', { x, y, class: `lbl ${cls}`, 'text-anchor': anchor }, svg);
      t.textContent = text;
      return t;
    };
    let H;
    if (mode !== 'spiral') {
      const st = STAGES[+mode];
      const far = Math.max(...STAGES.map((q) => q.dist));
      const wide = Math.max(...STAGES.map((q) => q.sweep)) + 0.15;
      // world → screen: the estimate at (cx, cy); its +x (the side Talos is on) points down the screen
      const k = Math.min(62, (W - 70) / (2 * far * Math.sin(wide))), cx = W / 2, cy = 34;
      H = Math.ceil(cy + far * k + 40);
      const S = (x, y) => [cx - y * k, cy + x * k];
      const pts = arcPieces(st);
      // camera wedges at each piece's end, under everything else
      for (const p of pts) {
        const px = st.dist * Math.cos(p.ang), py = st.dist * Math.sin(p.ang);
        const look = Math.atan2(-py, -px) + p.pan; // facing the estimate, plus the pan
        const L = st.dist + 0.35;
        const a1 = look - FOV, a2 = look + FOV;
        const [sx, sy] = S(px, py);
        const [ax, ay] = S(px + L * Math.cos(a1), py + L * Math.sin(a1)), [bx, by] = S(px + L * Math.cos(a2), py + L * Math.sin(a2));
        el('path', { d: `M${sx},${sy} L${ax},${ay} L${bx},${by} Z`, class: 'wedge' }, svg);
      }
      // distance rings for all three stages, faint
      const rings = [];
      for (const s of STAGES) {
        const [x0, y0] = S(s.dist * Math.cos(-wide), s.dist * Math.sin(-wide)), [x1, y1] = S(s.dist * Math.cos(wide), s.dist * Math.sin(wide));
        el('path', { d: `M${x0},${y0} A${s.dist * k},${s.dist * k} 0 0 0 ${x1},${y1}`, fill: 'none', stroke: css('--rule'), 'stroke-dasharray': '3 4' }, svg);
        rings.push([x1 - 4, y1 + 4, `${s.dist} m`]);
      }
      // the path: start in front, then the three arcs
      let d = '';
      const seq = [{ ang: 0 }, ...pts];
      seq.forEach((p, i) => {
        const [x, y] = S(st.dist * Math.cos(p.ang), st.dist * Math.sin(p.ang));
        if (i === 0) d = `M${x},${y}`;
        else {
          const prev = seq[i - 1].ang, sweep = p.ang - prev;
          d += ` A${st.dist * k},${st.dist * k} 0 0 ${sweep > 0 ? 0 : 1} ${x},${y}`;
        }
      });
      el('path', { d, fill: 'none', stroke: state, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
      for (const p of seq) {
        const [x, y] = S(st.dist * Math.cos(p.ang), st.dist * Math.sin(p.ang));
        el('circle', { cx: x, cy: y, r: 3.5, fill: css('--paper'), stroke: state, 'stroke-width': 2 }, svg);
      }
      // board and labels last, with a halo, so the wedges never cover them
      el('rect', { x: cx - 0.6 * k, y: cy - 7, width: 1.2 * k, height: 7, fill: css('--paper-3'), stroke: ink, 'stroke-width': 1.5, rx: 2 }, svg);
      el('circle', { cx, cy, r: 3.5, fill: accent }, svg);
      label(cx + 0.6 * k + 8, cy - 1, phone ? 'estimate' : "torpedo's estimate", 'strong');
      for (const [x, y, t] of rings) label(x, y, t, 'small', 'end');
      const [tx, ty] = S(st.dist, 0);
      label(tx, ty + 24, phone ? 'Talos starts here' : 'Talos starts here, facing the board', 'strong', 'middle');
      note.innerHTML = `<b>Stage ${mode}.</b> ${st.text} As soon as the board is seen (in the last 0.5 s) or converged, the sweep stops and Talos chases it with <code>CenterDetection</code>.`;
    } else {
      const k = Math.min(64, (W - 40) / 4.4);
      H = Math.ceil(4 * k + 62);
      const cx = W / 2, cy = 2 * k + 18;
      const turns = (SPIRAL.r1 - SPIRAL.r0) / SPIRAL.step;
      const total = turns * 2 * Math.PI;
      // sample the spiral, measuring its length as it goes
      const pts = [];
      let len = 0, px = null, py = null;
      for (let i = 0; i <= 1400; i++) {
        const f = i / 1400, a = total * f, r = SPIRAL.r0 + (SPIRAL.r1 - SPIRAL.r0) * f;
        const x = r * Math.cos(a), y = r * Math.sin(a);
        if (px !== null) len += Math.hypot(x - px, y - py);
        px = x; py = y;
        pts.push([x, y, len]);
      }
      const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * k).toFixed(1)},${(cy - y * k).toFixed(1)}`).join('');
      el('path', { d, fill: 'none', stroke: state, 'stroke-width': 1.6, opacity: 0.85 }, svg);
      el('circle', { cx, cy, r: 4, fill: accent }, svg);
      const cuts = [[60, 'baskets, 60 s'], [120, 'bins, 120 s'], [180, 'items, 180 s']];
      const marks = cuts.map(([s, text]) => {
        const want = s * SPIRAL.speed;
        const q = pts.find((p) => p[2] >= want) || pts[pts.length - 1];
        const x = cx + q[0] * k, y = cy - q[1] * k;
        el('circle', { cx: x, cy: y, r: 5, fill: accent, stroke: css('--paper'), 'stroke-width': 1.5 }, svg);
        return [x, y, text];
      });
      label(cx, cy + 18, 'estimate', 'strong', 'middle');
      for (const [x, y, text] of marks) {
        // to the outside of the spiral, unless that runs off the figure
        const tw = text.length * 7;
        let right = x > cx;
        if (right && x + 9 + tw > W - 2) right = false;
        if (!right && x - 9 - tw < 2) right = true;
        label(right ? x + 9 : x - 9, y + 4, text, 'strong', right ? 'start' : 'end');
      }
      label(cx, H - 8, `${turns} turns, ${len.toFixed(0)} m of path: ${(len / SPIRAL.speed / 60).toFixed(1)} min at 0.2 m/s`, 'small', 'middle');
      note.innerHTML = `<b>The down camera's spiral.</b> It starts 0.25 m from the estimate and opens 0.25 m per turn out to 2 m, at 0.2 m/s with the heading held. The whole spiral would take ${(len / SPIRAL.speed / 60).toFixed(1)} minutes; every timeout ends it sooner ("timeout_sec usually ends it first", says the tree). The moment the object is in view it stops and follows the detection instead.`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
  }
  document.querySelectorAll('#srch-pick button').forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.s;
      document.querySelectorAll('#srch-pick button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      draw();
    };
  });
  let lastW = null;
  new ResizeObserver(() => { const w = Math.min(Math.floor(host.clientWidth), 680); if (w !== lastW) { lastW = w; draw(); } }).observe(host);
}

// ---------- every file in trees/ ----------
function treeFiles(tree) {
  // One line each, from reading each file's main tree. g: current (moves with FollowPath, written for the MPC),
  // test (small utility trees), legacy (moves with Move / SmartMovePosition, from before riptide_mpc).
  const ABOUT = {
    'RepairCompMpcTree.xml': ['current', 'The competition mission, repair side. This chapter.'],
    'RescueCompMpcTree.xml': ['current', 'The same mission with repair_mission = 0: gate_rescue, the blood holes and vinyls, and the sos image at the table.'],
    'PreQualMpcTree.xml': ['current', 'Prequalification as one FollowPath: through the gate, round the pole facing it, back through the gate (300 s).'],
    'PreQualMpcSpinTree.xml': ['current', 'The same prequal path with a steady spin along it.'],
    'IdentificationTree.xml': ['current', 'Dive, go to the mapping origin and run pool_identify, the MPC\'s <a href="control/identify.html">system identification</a>.'],
    'SlalomPath.xml': ['current', 'The slalom on its own: one FollowPath through the pole sets, after the older MiniSearch.'],
    'ActuatorTrees.xml': ['test', 'Bench test: check the actuator states, arm, fire the torpedoes three times, disarm. No motion.'],
    'SurfaceTree.xml': ['test', 'Dive, then the old surface subtree.'],
    'ZeroTree.xml': ['test', 'Dive, move to (0, 0, −1), stop.'],
    'TestTree.xml': ['test', 'Dive and run the old FlipTree.'],
    'ReturnHomeTree.xml': ['test', 'Dive and run the old return-home subtree.'],
    'TestTorpedoTree.xml': ['test', 'The torpedo task with the older Search and MiniSearch.'],
    'RandomPingerTree.xml': ['test', 'The pinger decision, followed by the older torpedo, bin and surface subtrees.'],
    'CompMissionTree.xml': ['legacy', 'The full pre-MPC mission (CompMissionTree), repair side.'],
    'CompTree.xml': ['legacy', 'The pre-MPC mission, picking repair or rescue from a blackboard value.'],
    'test_comp_tree.xml': ['legacy', 'A copy of CompMissionTree.xml.'],
    'RepairCompTree.xml': ['legacy', 'The pre-MPC mission, repair side.'],
    'RescueCompTree.xml': ['legacy', 'The pre-MPC mission, rescue side.'],
    'CompLiteTree.xml': ['legacy', 'A short mission: slalom, torpedo, bins, surface.'],
    'NewCompLiteTree.xml': ['legacy', 'A short mission: gate, slalom, bins, torpedo.'],
    'RepairCompLiteTree.xml': ['legacy', 'A short mission without the table (CompLiteMissionTree), repair side.'],
    'RescueCompLiteTree.xml': ['legacy', 'The same short mission, rescue side.'],
    'GateTree.xml': ['legacy', 'The gate on its own, with the old flip.'],
    'GateSlalomTree.xml': ['legacy', 'The gate, then the old slalom.'],
    'SlalomTree.xml': ['legacy', 'The old slalom (SingleSlalom, PassThroughSlalom subtrees).'],
    'SlalomTreeBackup.xml': ['legacy', 'An older copy of the slalom.'],
    'TorpedoTree.xml': ['legacy', 'The torpedo task on its own.'],
    'BinTree.xml': ['legacy', 'The bins and magnets on their own.'],
    'FullTableTree.xml': ['legacy', 'The table task on its own (NewTableTree).'],
    'DemoTableTree.xml': ['legacy', 'A table pickup demo.'],
    'BuoyTree.xml': ['legacy', 'A buoy task from an older course.'],
    'DeployTankTree.xml': ['legacy', 'From an older course: deploy Liltank, the team\'s other vehicle, and find the fish and reef shark.'],
    'LiltankCompTree.xml': ['legacy', 'A mission for Liltank itself.'],
    'PreQualTree.xml': ['legacy', 'The pre-MPC prequal, as RelativeMove steps.'],
  };
  const LABEL = { current: 'MPC era', test: 'Test', legacy: 'Older' };
  const list = document.getElementById('trees-list');
  const order = { current: 0, test: 1, legacy: 2 };
  const files = tree.files.map((f) => ({ ...f, g: (ABOUT[f.file] || ['legacy'])[0], about: (ABOUT[f.file] || [, ''])[1] }))
    .sort((a, b) => order[a.g] - order[b.g] || (b.file === 'RepairCompMpcTree.xml') - (a.file === 'RepairCompMpcTree.xml') || a.file.localeCompare(b.file));
  list.innerHTML = files.map((f) => `<li data-g="${f.g}"><div class="top"><a href="${GH}${f.file}">${f.file}</a><span class="tag ${f.g}">${LABEL[f.g]}</span>`
    + `<span class="meta">${f.lines.toLocaleString('en-US')} lines · ${f.reach} subtrees</span></div><p>${f.about}</p></li>`).join('');
  document.querySelectorAll('#trees-pick button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#trees-pick button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      list.querySelectorAll('li').forEach((li) => { li.hidden = b.dataset.g !== 'all' && li.dataset.g !== b.dataset.g; });
    };
  });
}
