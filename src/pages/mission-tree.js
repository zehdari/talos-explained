import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/mission-tree.css';
import { el } from '../viz/chart.js';
import { TreeExplorer, fmtT } from '../viz/mission-tree-explorer.js';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/trees/';
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const load = (f) => fetch(`${BASE}data/mission-tree/${f}`).then((r) => r.json());
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

Promise.all([load('tree.json'), load('run.json')]).then(([tree, run]) => {
  flow(run);
  explorer(tree, run);
  treeFiles(tree);
});
searchFigure();

// The tasks as the explorer's chips name them, and the run's segments each one covers (the trip there included).
const TASKS = [
  ['Kill switch', ['Kill switch', 'Prep']], ['Dive', ['Dive']], ['Gate', ['Gate']], ['Slalom', ['Slalom']], ['Pinger', ['Pinger']],
  ['Torpedo', ['To torpedo', 'Torpedo']], ['Table', ['To table', 'Table']], ['Bins', ['To bins', 'Bins']], ['Magnets', ['Magnets']], ['Home', ['Home']],
];

// ---------- the mission in one picture: a numbered timeline, the pinger's two orders side by side ----------
function flow(run) {
  const end = run.segments[run.segments.length - 1][1];
  const span = (labels) => {
    const ss = run.segments.filter((s) => labels.includes(s[2]));
    return ss.length ? [Math.min(...ss.map((s) => s[0])), Math.max(...ss.map((s) => s[1]))] : null;
  };
  const dur = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : `${Math.round(s)} s`);
  const INFO = {
    'Kill switch': ['start', 'LEDs solid red until the kill switch is in, then a blue flash for 5 s. Then the map is locked with no target, and the actuators are reloaded and disarmed. In Nereus the switch went in at 0:33.', 'Wait for the switch'],
    Dive: ['start', 'Straight down. The tree asks for −0.56 m, but the move never goes shallower than −0.75 m, and within 25 cm counts. This is the one step that can end the mission: it has 60 s to reach depth.', 'The one step that can fail the run'],
    Gate: ['gate', 'Through the gate where the prior map puts it, with the map locked. An old flip in the middle turns the controller off for 10 s.', 'Through the gate from the prior'],
    Slalom: ['slalom', 'A quick look until the slalom is roughly mapped, then one path through the three pole sets on the side the gate picked. It ends near the torpedo.', 'One look, one path'],
    Pinger: ['pinger', 'Listen 10 s near the torpedo and 10 s near the table and compare. The answer picks the order of the next two tasks. Nereus has no pinger, so this run went torpedo first, the default.', 'Picks the order'],
    Torpedo: ['torpedo', 'Search until the board is mapped, map both holes from 1.5 m, then fire one torpedo into the large hole and one into the small hole.', 'Map the holes, fire two'],
    Table: ['table', 'Map the two baskets, then four times: pick up an item with the claw, surface, drop it in its basket. Spin and surface at the end.', 'Sort four items'],
    Bins: ['bins', 'The binary classifier tells the two fire pictures apart; Talos drops one marker on each from 1 m above.', 'A marker on each picture'],
    Magnets: ['magnets', 'Fit the bin\'s CAD model to the two pictures to place the magnets, then touch each magnet and hold 2 s.', 'Touch both magnets'],
    Home: ['home', 'One path out of the bins and back through the gate, then the controller is turned off.', 'Back through the gate'],
  };
  const row = (n, name, ran) => {
    const [sec, info, sum] = INFO[name];
    const segs = TASKS.find((x) => x[0] === name)[1];
    // the trip there (a "To …" segment) drawn lighter than the task itself; the time is the task's own, as in its section
    const trip = ran ? span(segs.filter((x) => x.startsWith('To '))) : null;
    const task = ran ? span(segs.filter((x) => !x.startsWith('To '))) : null;
    const pct = (a, b) => `left:${(a / end) * 100}%;width:${Math.max(0.6, ((b - a) / end) * 100)}%`;
    const bar = task ? `${trip ? `<i class="trip" style="${pct(trip[0], trip[1])}"></i>` : ''}<i style="${pct(task[0], task[1])}"></i>` : '';
    const time = !task ? '' : name === 'Kill switch' ? 'in at 0:33'
      : `${dur(task[1] - task[0])}${trip ? `<small>+ ${dur(trip[1] - trip[0])} trip</small>` : ''}`;
    const jump = task ? ` · <a class="mt-jump" href="#explorer" data-seg="${name}">Replay it in the explorer ↓</a>` : '';
    return `<li class="mt-step${ran ? '' : ' alt'}"><button type="button" class="mt-step-b" aria-expanded="false">`
      + `<span class="n">${n}</span><span class="nm">${name}</span>${ran ? `<span class="tr">${bar}</span><span class="t">${time}</span>` : ''}`
      + `<span class="sum">${sum}</span></button>`
      + `<div class="mt-step-i" hidden><p>${info}</p><p class="go"><a href="#${sec}">Read more ↓</a>${jump}</p></div></li>`;
  };
  // which order this run took: torpedo first if its "To torpedo" leg comes before "To table"
  const tt = span(['To torpedo']), tb = span(['To table']);
  const torpFirst = !tt || !tb || tt[0] < tb[0];
  const laneA = `<div class="mt-lane run"><p class="lh">Torpedo first <span class="mt-tag">this run</span></p><ol start="6">${row(6, 'Torpedo', torpFirst)}${row(7, 'Table', torpFirst)}</ol></div>`;
  const laneB = `<div class="mt-lane"><p class="lh">Table first <span class="mt-off">not in this run</span></p><ol start="6">${row(6, 'Table', !torpFirst)}${row(7, 'Torpedo', !torpFirst)}</ol></div>`;
  const host = document.getElementById('flow-graph');
  host.innerHTML = `<div class="mt-axis" aria-hidden="true"><span>0:00</span><span>run time</span><span>${fmtT(end)}</span></div>`
    + `<ol class="mt-flow">${['Kill switch', 'Dive', 'Gate', 'Slalom', 'Pinger'].map((x, i) => row(i + 1, x, true)).join('')}`
    + `<li class="mt-branch"><p class="bh">The pinger picks one of two orders:</p><div class="mt-lanes">${torpFirst ? laneA + laneB : laneB + laneA}</div></li>`
    + `</ol><ol class="mt-flow" start="8">${['Bins', 'Magnets', 'Home'].map((x, i) => row(i + 8, x, true)).join('')}</ol>`;
  // one task open at a time; its text opens right under it
  host.addEventListener('click', (e) => {
    const b = e.target.closest('.mt-step-b');
    if (!b) return;
    const open = b.getAttribute('aria-expanded') !== 'true';
    host.querySelectorAll('.mt-step-b').forEach((o) => {
      const on = o === b && open;
      o.setAttribute('aria-expanded', String(on));
      o.nextElementSibling.hidden = !on;
      o.parentElement.classList.toggle('on', on);
    });
  });
}

// ---------- the explorer ----------
function explorer(tree, run) {
  const $ = (id) => document.getElementById(id);
  const ex = new TreeExplorer({
    tree, run, treeEl: $('mt-tree'), crumbsEl: $('mt-crumbs'), detailEl: $('mt-detail'), searchEl: $('mt-q'), hitsEl: $('mt-hits'),
  });
  const narrow = () => matchMedia('(max-width: 860px)').matches;
  const detailEl = $('mt-detail');
  // On a narrow screen the detail panel sits below the tree: after a tap on a row, bring its top into view.
  ex.treeEl.addEventListener('click', (e) => {
    if (!e.target.closest('.mt-row') || e.target.closest('.mt-caret') || !narrow()) return;
    const top = detailEl.getBoundingClientRect().top;
    if (top > innerHeight - 90) window.scrollBy({ top: top - innerHeight * 0.5, behavior: smooth() });
  });
  const play = $('mt-play'), scrub = $('mt-scrub'), timeOut = $('mt-time'), follow = $('mt-follow');
  const taskEl = $('mt-task'), taskT = $('mt-taskt'), runEl = $('mt-running'), logEl = $('mt-log');
  const video = $('mt-video');
  video.src = `${BASE}${run.video.src}`;
  const end = run.duration;
  scrub.max = end;
  let t = 0, playing = false, speed = 16, last = 0, lastDraw = 0;

  // the thin bar under the scrubber: where each task falls (transits lighter); the current one is filled
  const barEl = $('mt-bar');
  const TRANSIT = /^To |^Prep/;
  barEl.innerHTML = run.segments.map(([a, b, label]) => `<i class="${TRANSIT.test(label) ? 'tr' : ''}" style="left:${(a / end) * 100}%;width:${((b - a) / end) * 100}%"></i>`).join('');
  const bars = [...barEl.children];
  // the task chips: tap one to jump there
  const chipOf = {};
  TASKS.forEach(([, segs], i) => segs.forEach((s) => { chipOf[s] = i; }));
  const chipsEl = $('mt-chips');
  chipsEl.innerHTML = TASKS.map(([name]) => `<button type="button" aria-pressed="false">${name}</button>`).join('');
  const chips = [...chipsEl.children];
  chips.forEach((b, i) => {
    b.onclick = () => {
      goTask(TASKS[i][0]);
      if (narrow()) { camUnderHead(); return; }
      // bring the tree into view if it is off screen (a chip tapped while reading the detail)
      const top = ex.treeEl.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.7) window.scrollBy({ top: top - 70, behavior: smooth() });
    };
  });

  // On a phone the transport sticks under the Chapters button; once it is stuck, a band above it hides the page
  // scrolling past behind that button.
  const head = document.querySelector('.mt-head'), panel = head.parentElement;
  // On a phone: scroll so the video row sits right under the stuck transport, with the tree below it, so the camera,
  // the running node and the tree are on screen together.
  const camEl = document.querySelector('.mt-cam');
  function camUnderHead() {
    const stickTop = parseFloat(getComputedStyle(head).top) || 0;
    const y = camEl.getBoundingClientRect().top + scrollY - stickTop - head.offsetHeight - 8;
    window.scrollTo({ top: Math.max(0, y), behavior: smooth() });
  }
  // "Back to the running node": on a phone, bring its row into view if the tree is off screen
  ex.onBack = (p) => {
    if (!narrow()) return;
    const r = ex.rowEl(p);
    const hb = head.getBoundingClientRect().bottom;
    if (r && (r.getBoundingClientRect().top < hb || r.getBoundingClientRect().bottom > innerHeight)) camUnderHead();
  };
  const stuck = () => head.classList.toggle('stuck', getComputedStyle(head).position === 'sticky' && head.getBoundingClientRect().top - panel.getBoundingClientRect().top > 24);
  addEventListener('scroll', stuck, { passive: true });
  addEventListener('resize', stuck);
  // a search result picked: bring its row in the tree into view, below the transport on a phone
  ex.onPick = (p) => {
    const rowEl = ex.rowEl(p);
    if (rowEl) window.scrollBy({ top: rowEl.getBoundingClientRect().top - innerHeight * 0.4, behavior: smooth() });
  };
  function clearSearch() { $('mt-q').value = ''; ex.setQuery(''); }
  // Jump to a task: the time it starts, the tree showing that task's own steps, its node in the detail panel.
  function goTask(label) {
    const s = run.segments.find((x) => x[2] === label);
    if (!s) return null;
    clearSearch();
    const r = ex.rowOf(s[3]);
    ex.open = new Set(['']);
    ex.reveal(r);
    ex.focus = ex.hasKids(r) ? r : '';
    ex.open.add(r);
    ex.sel = r;
    ex.pinned = 'task';
    pinChip = chipOf[label];
    ex.leafPath = undefined;
    jump(s[0] + 0.3);
    ex.treeEl.scrollTop = 0;
    return r;
  }
  let pinChip = -1, curChip = -2;

  const at = (rows, time) => { let lo = -1; for (let i = 0; i < rows.length && rows[i][0] <= time; i++) lo = i; return lo; };
  function update(force) {
    scrub.value = t;
    timeOut.textContent = fmtT(t);
    const si = at(run.segments, t);
    const s = si >= 0 && t <= run.segments[si][1] + 0.5 ? run.segments[si] : null;
    taskEl.textContent = s ? s[2] : t < run.segments[0][0] ? 'Waiting to start' : '–';
    taskT.textContent = s ? `${fmtT(s[0])}–${fmtT(s[1])}` : '';
    bars.forEach((b, i) => b.classList.toggle('on', i === si && !!s));
    const ci = s ? chipOf[s[2]] : -1;
    if (ci !== curChip) {
      curChip = ci;
      chips.forEach((b, i) => b.setAttribute('aria-pressed', String(i === ci)));
      // keep the current chip in view in its own row (phones scroll the row sideways), without moving the page
      const c = chips[ci];
      if (c && chipsEl.scrollWidth > chipsEl.clientWidth) {
        const l = c.offsetLeft - chipsEl.offsetLeft, r = l + c.offsetWidth, x = chipsEl.scrollLeft, w = chipsEl.clientWidth;
        const want = l < x + 8 ? l - 8 : r > x + w - 40 ? r - w + 48 : x;
        if (want !== x) chipsEl.scrollTo({ left: Math.max(0, want), behavior: playing ? smooth() : 'auto' });
      }
      // a task picked with a chip lets go once the run moves on to another task
      if (ex.pinned === 'task' && ci !== pinChip) ex.pinned = null;
    }
    const li = at(run.log, t);
    logEl.textContent = li >= 0 ? run.log[li][2] : '–';
    const changed = ex.setTime(t);
    // a phone gets the short form (the task › … › the running node); the full path is in the title
    const full = ex.runningLabel();
    runEl.textContent = narrow() && s ? ex.runningLabel(ex.rowOf(s[3])) : full;
    runEl.title = full;
    const now = performance.now();
    if ((changed || force) && (force || !playing || now - lastDraw > 120)) {
      lastDraw = now;
      if (!ex.pinned && ex.follow && ex.leaf !== null) ex.sel = ex.leaf;
      ex.render();
      if (ex.follow) ex.scrollToLeaf();
      ex.detail();
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
    detailEl.setAttribute('aria-live', on ? 'off' : 'polite');
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
  $('mt-collapse').onclick = () => { clearSearch(); ex.collapse(); };

  // "Replay it in the explorer" links: jump there, and bring the task's row to about a third of the way down the screen
  document.querySelectorAll('a.mt-jump').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const r = goTask(a.dataset.seg);
      if (narrow()) { camUnderHead(); return; }
      const rowEl = r !== null && ex.rowEl(r);
      const target = rowEl || $('explorer-fig');
      const y = target.getBoundingClientRect().top + scrollY - innerHeight * 0.3;
      window.scrollTo({ top: Math.max(0, y), behavior: smooth() });
    });
  });

  video.addEventListener('loadedmetadata', () => { if (!playing) video.currentTime = Math.min(Math.max(t - run.video.t0, 0), video.duration); });

  // start in the gate, the tree open down to what is running and its detail showing
  const gate = run.segments.find((x) => x[2] === 'Gate');
  t = gate ? gate[0] + 2 : 0;
  update(true);
}

// ---------- how Talos searches ----------
function searchFigure() {
  const host = document.getElementById('srch-fig');
  const note = document.getElementById('srch-note');
  const FOV = (27 * Math.PI) / 180; // SearchMpc's own note: the forward camera sees ±27°
  // SearchMpc's three sweeps with the torpedo's numbers (max_dist 2, min_dist 1)
  const STAGES = [
    { name: 'First sweep', sweep: 0.5, pan: 0.5, step: 0.25, dist: 2, text: 'Round the estimate 0.5 rad (29°) each way, 2 m out (the torpedo\'s <code>max_dist</code>), swinging the heading 0.5 rad left and right from stop to stop. With the camera\'s ±27° that covers about ±3 m round the estimate.' },
    { name: 'Wider, farther', sweep: 1.0, pan: 0.7, step: 0.5, dist: 3, text: 'After a sweep that saw nothing: 1 rad (57°) each way, 3 m out (1.5 × <code>max_dist</code>), swinging 0.7 rad, to catch a board that faces another way or is hidden from one side.' },
    { name: 'Wider, closer', sweep: 1.0, pan: 0.5, step: 0.5, dist: 1.5, text: 'Next: 1 rad each way, 1.5 m out (0.75 × <code>max_dist</code>, never under <code>min_dist</code> = 1 m), swinging 0.5 rad, for a small target or one past the estimate. Then the first sweep again, until the 100 s are up.' },
  ];
  const SPIRAL = { r0: 0.25, r1: 2.0, step: 0.25, speed: 0.2 };
  let mode = '0', stop = 0;

  // The stops: in front, then the ends of the pieces AddArc cuts the three arcs into (0 → +sweep, +sweep → −sweep,
  // −sweep → 0), the heading swung +pan and −pan in turn.
  function stopsOf(st) {
    const legs = [[0, st.sweep], [st.sweep, -2 * st.sweep], [-st.sweep, st.sweep]];
    const pts = [{ ang: 0, pan: 0 }];
    for (const [a0, sw] of legs) {
      const pieces = 2 * Math.max(1, Math.ceil(Math.abs(sw) / (2 * st.step) - 1e-9));
      for (let k = 0; k < pieces; k++) pts.push({ ang: a0 + (sw * (k + 1)) / pieces, pan: k % 2 === 0 ? st.pan : -st.pan });
    }
    return pts;
  }

  // One layout for the three sweeps (same scale, so the distances compare) and one for the spiral; the panel takes
  // the tallest, so switching never moves the page.
  function layout(W) {
    const phone = W < 520;
    const wide = 1.0 + 0.15;
    const pts = [];
    for (const s of STAGES) {
      for (const p of stopsOf(s)) {
        const px = s.dist * Math.cos(p.ang), py = s.dist * Math.sin(p.ang);
        pts.push([px, py], [px + 0.5, py]);
      }
      for (const a of [-wide, 0, wide]) pts.push([s.dist * Math.cos(a), s.dist * Math.sin(a)]);
    }
    pts.push([-0.3, -0.7], [-0.3, 0.7]);
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const padX = phone ? 22 : 40;
    const k = Math.min(64, (W - 2 * padX) / (y1 - y0));
    const sweepH = Math.ceil((x1 - x0) * k + 46);
    // on a phone the spiral is kept about as tall as the sweeps, so the fixed panel height leaves little empty space
    const ks = Math.max(36, Math.min(60, (W - 30) / 4.6, phone ? (sweepH + 70 - 120) / 4 : 60));
    const spiralH = Math.ceil(4 * ks + 120);
    return { phone, k, x0, y0, y1, padX, ks, H: Math.max(sweepH, spiralH), sweepH, spiralH };
  }

  function draw() {
    host.innerHTML = '';
    const W = Math.max(280, Math.min(Math.floor(host.clientWidth), 680));
    const L = layout(W);
    const { phone, H } = L;
    const ink = css('--ink'), accent = css('--accent'), state = css('--state'), rule = css('--rule');
    const svg = el('svg', { role: 'img' }, host);
    const label = (x, y, text, cls, anchor = 'start') => {
      const t = el('text', { x, y, class: `lbl ${cls}`, 'text-anchor': anchor }, svg);
      t.textContent = text;
      return t;
    };
    const stepper = document.getElementById('srch-step');
    if (mode !== 'spiral') {
      const st = STAGES[+mode];
      const stops = stopsOf(st);
      stop = Math.min(stop, stops.length - 1);
      const k = L.k;
      // Seen from above. World → screen: the estimate's +x (the side Talos is on) points down the screen and +y to the
      // right, so +angle (counterclockwise from above) is counterclockwise on screen too.
      const cx = L.padX + (-L.y0) * k + ((W - 2 * L.padX) - (L.y1 - L.y0) * k) / 2;
      const cy = 20 - L.x0 * k + (H - L.sweepH) / 2;
      const S = (x, y) => [cx + y * k, cy + x * k];
      const ring = (r, a0, a1) => {
        let d = '';
        for (let i = 0; i <= 60; i++) {
          const a = a0 + ((a1 - a0) * i) / 60;
          const [x, y] = S(r * Math.cos(a), r * Math.sin(a));
          d += `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
        }
        return d;
      };
      // the other sweeps' rings, faint
      for (const s of STAGES) if (s !== st) el('path', { d: ring(s.dist, -1.15, 1.15), fill: 'none', stroke: rule, 'stroke-dasharray': '3 4' }, svg);
      // the camera's view from the chosen stop
      const p = stops[stop];
      const px = st.dist * Math.cos(p.ang), py = st.dist * Math.sin(p.ang);
      const look = Math.atan2(-py, -px) + p.pan;
      const R = st.dist + 0.35;
      const w = [[px, py], [px + R * Math.cos(look - FOV), py + R * Math.sin(look - FOV)], [px + R * Math.cos(look + FOV), py + R * Math.sin(look + FOV)]].map((q) => S(...q));
      el('path', { d: `M${w[0]}L${w[1]}L${w[2]}Z`, class: 'wedge' }, svg);
      // the path flown: on the ring, from −sweep to +sweep (each part of it twice)
      el('path', { d: ring(st.dist, -st.sweep, st.sweep), fill: 'none', stroke: state, 'stroke-width': 2.5, 'stroke-linecap': 'round' }, svg);
      // the estimate and the board
      el('rect', { x: cx - 0.6 * k, y: cy - 7, width: 1.2 * k, height: 7, fill: css('--paper-3'), stroke: ink, 'stroke-width': 1.5, rx: 2 }, svg);
      el('circle', { cx, cy, r: 3.5, fill: accent }, svg);
      label(cx, cy - 14, phone ? 'estimate' : "the torpedo board's estimate", 'strong', 'middle');
      // where the stops are, numbered in the order Talos reaches them (a spot visited twice gets both numbers)
      const spots = new Map();
      stops.forEach((q, i) => { const key = q.ang.toFixed(3); if (!spots.has(key)) spots.set(key, { ang: q.ang, n: [] }); spots.get(key).n.push(i); });
      for (const { ang, n } of spots.values()) {
        const [x, y] = S(st.dist * Math.cos(ang), st.dist * Math.sin(ang));
        const on = n.includes(stop);
        const g = el('g', { class: 'stop', 'data-n': n.join(',') }, svg);
        el('circle', { cx: x, cy: y, r: 16, fill: 'transparent' }, g); // finger-sized target
        el('circle', { cx: x, cy: y, r: on ? 5.5 : 4, fill: on ? state : css('--paper'), stroke: state, 'stroke-width': 2 }, g);
        const [lx, ly] = S((st.dist + 0.28) * Math.cos(ang), (st.dist + 0.28) * Math.sin(ang));
        const t = el('text', { x: lx, y: ly + 4, class: 'lbl num', 'text-anchor': 'middle' }, g);
        n.forEach((i, j) => {
          const ts = el('tspan', { class: i === stop ? 'cur' : '' }, t);
          ts.textContent = (j ? '·' : '') + (i + 1);
        });
      }
      // Talos at the chosen stop: an arrow along its heading
      const [hx, hy] = S(px, py);
      const [ex2, ey2] = S(px + 0.42 * Math.cos(look), py + 0.42 * Math.sin(look));
      el('line', { x1: hx, y1: hy, x2: ex2, y2: ey2, stroke: ink, 'stroke-width': 2, 'marker-end': 'url(#srch-arrow)' }, svg);
      const defs = el('defs', {}, svg);
      const mk = el('marker', { id: 'srch-arrow', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: ink }, mk);
      // the start
      const [sx, sy] = S(st.dist + 0.62, 0);
      label(sx, sy + 6, 'start', 'small', 'middle');
      svg.querySelectorAll('.stop').forEach((g) => {
        g.style.cursor = 'pointer';
        g.addEventListener('click', () => {
          const n = g.dataset.n.split(',').map(Number);
          const j = n.indexOf(stop);
          stop = j < 0 ? n[0] : n[(j + 1) % n.length];
          draw();
        });
      });
      const panTxt = p.pan === 0 ? 'facing the board' : `turned ${Math.abs(p.pan)} rad ${p.pan > 0 ? 'left' : 'right'}`;
      stepper.classList.remove('key');
      stepper.querySelector('output').innerHTML = `Stop <b>${stop + 1}</b> of ${stops.length}, ${panTxt}`;
      note.innerHTML = `<b>${st.name}.</b> ${st.text}`;
    } else {
      // the stepper's row holds the key instead, so the panel keeps its height
      stepper.classList.add('key');
      const k = L.ks;
      const cx = W / 2, cy = (H - 4 * k) / 2 + 2 * k - 10;
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
      el('circle', { cx, cy, r: 4.5, fill: accent }, svg);
      // where each task's timeout cuts it: a hollow ring on the spiral (the estimate is the only filled dot), the label
      // above or below the spiral on a leader line
      const cuts = [[60, 'baskets: 60 s'], [120, 'bins: 120 s'], [180, 'items: 180 s']];
      const top = cy - 2 * k - 14, bot = cy + 2 * k + 24;
      const used = [];
      for (const [s, text] of cuts) {
        const q = pts.find((r) => r[2] >= s * SPIRAL.speed) || pts[pts.length - 1];
        const x = cx + q[0] * k, y = cy - q[1] * k;
        const up = y < cy;
        const ly = up ? top : bot;
        const tw = text.length * 6.6;
        let lx = Math.min(W - 4 - tw / 2, Math.max(4 + tw / 2, x));
        for (const [ux, uy, uw] of used) if (uy === ly && Math.abs(ux - lx) < (uw + tw) / 2 + 8) lx = ux + (lx >= ux ? 1 : -1) * ((uw + tw) / 2 + 8);
        used.push([lx, ly, tw]);
        el('line', { x1: x, y1: y, x2: lx, y2: up ? ly + 4 : ly - 13, stroke: ink, 'stroke-width': 1, opacity: 0.55 }, svg);
        el('circle', { cx: x, cy: y, r: 5, fill: css('--paper'), stroke: ink, 'stroke-width': 2 }, svg);
        label(lx, ly, text, 'strong', 'middle');
      }
      // a 1 m scale bar, and the legend
      const by = 16;
      el('path', { d: `M12,${by - 4}V${by}H${12 + k}V${by - 4}`, fill: 'none', stroke: ink, 'stroke-width': 1.5 }, svg);
      label(12 + k + 6, by + 3, '1 m', 'small');
      stepper.querySelector('output').innerHTML = '<span class="srch-key"><i class="est"></i>the estimate</span><span class="srch-key"><i class="cut"></i>a timeout ends it</span>';
      note.innerHTML = `<b>The down camera's spiral.</b> It starts 0.25 m from the estimate and widens 0.25 m per turn out to 2 m, at 0.2 m/s. The whole spiral would take ${(len / SPIRAL.speed / 60).toFixed(1)} minutes; each task's timeout ends it sooner, and it stops the moment the object is in view.`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
  }
  document.querySelectorAll('#srch-pick button').forEach((b) => {
    b.onclick = () => {
      mode = b.dataset.s;
      stop = 0;
      document.querySelectorAll('#srch-pick button').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
      draw();
    };
  });
  const stepper = document.getElementById('srch-step');
  stepper.querySelectorAll('button').forEach((b) => {
    b.onclick = () => {
      const n = stopsOf(STAGES[+mode] || STAGES[0]).length;
      stop = (stop + (+b.dataset.d) + n) % n;
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
    'RescueCompMpcTree.xml': ['current', 'The same mission for the rescue side: the other gate side, the blood holes and pictures, and the sos image at the table.'],
    'PreQualMpcTree.xml': ['current', 'Prequalification as one path: through the gate, round the pole, back through the gate (300 s).'],
    'PreQualMpcSpinTree.xml': ['current', 'The same prequal path with a steady spin along it.'],
    'IdentificationTree.xml': ['current', 'Dive, go to the mapping origin and run the MPC\'s <a href="control/identify.html">system identification</a>.'],
    'SlalomPath.xml': ['current', 'The slalom on its own: one path through the pole sets.'],
    'ActuatorTrees.xml': ['test', 'Bench test: check the actuators, arm, fire the torpedoes three times, disarm. No motion.'],
    'SurfaceTree.xml': ['test', 'Dive, then the old surface subtree.'],
    'ZeroTree.xml': ['test', 'Dive, move to (0, 0, −1), stop.'],
    'TestTree.xml': ['test', 'Dive and run the old flip.'],
    'ReturnHomeTree.xml': ['test', 'Dive and run the old return-home subtree.'],
    'TestTorpedoTree.xml': ['test', 'The torpedo task with the older searches.'],
    'RandomPingerTree.xml': ['test', 'The pinger decision, followed by the older torpedo, bin and surface subtrees.'],
    'CompMissionTree.xml': ['legacy', 'The full pre-MPC mission, repair side.'],
    'CompTree.xml': ['legacy', 'The pre-MPC mission, picking repair or rescue from a blackboard value.'],
    'test_comp_tree.xml': ['legacy', 'A copy of CompMissionTree.xml.'],
    'RepairCompTree.xml': ['legacy', 'The pre-MPC mission, repair side.'],
    'RescueCompTree.xml': ['legacy', 'The pre-MPC mission, rescue side.'],
    'CompLiteTree.xml': ['legacy', 'A short mission: slalom, torpedo, bins, surface.'],
    'NewCompLiteTree.xml': ['legacy', 'A short mission: gate, slalom, bins, torpedo.'],
    'RepairCompLiteTree.xml': ['legacy', 'A short mission without the table, repair side.'],
    'RescueCompLiteTree.xml': ['legacy', 'The same short mission, rescue side.'],
    'GateTree.xml': ['legacy', 'The gate on its own, with the old flip.'],
    'GateSlalomTree.xml': ['legacy', 'The gate, then the old slalom.'],
    'SlalomTree.xml': ['legacy', 'The old slalom.'],
    'SlalomTreeBackup.xml': ['legacy', 'An older copy of the slalom.'],
    'TorpedoTree.xml': ['legacy', 'The torpedo task on its own.'],
    'BinTree.xml': ['legacy', 'The bins and magnets on their own.'],
    'FullTableTree.xml': ['legacy', 'The table task on its own.'],
    'DemoTableTree.xml': ['legacy', 'A table pickup demo.'],
    'BuoyTree.xml': ['legacy', 'A buoy task from an older course.'],
    'DeployTankTree.xml': ['legacy', 'From an older course: deploy Liltank, the team\'s other vehicle, and find the fish and reef shark.'],
    'LiltankCompTree.xml': ['legacy', 'A mission for Liltank itself.'],
    'PreQualTree.xml': ['legacy', 'The pre-MPC prequal, as relative moves.'],
  };
  const LABEL = { current: 'MPC era', test: 'Test', legacy: 'Older' };
  const list = document.getElementById('trees-list');
  const order = { current: 0, test: 1, legacy: 2 };
  const files = tree.files.map((f) => ({ ...f, g: (ABOUT[f.file] || ['legacy'])[0], about: (ABOUT[f.file] || [, ''])[1] }))
    .sort((a, b) => order[a.g] - order[b.g] || (b.file === 'RepairCompMpcTree.xml') - (a.file === 'RepairCompMpcTree.xml') || a.file.localeCompare(b.file));
  list.innerHTML = files.map((f) => `<li data-g="${f.g}"><div class="top"><a href="${GH}${f.file}">${f.file}</a><span class="tag ${f.g}">${LABEL[f.g]}</span>`
    + `<span class="meta">reaches ${f.reach} subtree${f.reach === 1 ? '' : 's'}</span></div><p>${f.about}</p></li>`).join('');
  const pick = (g) => {
    document.querySelectorAll('#trees-pick button').forEach((o) => o.setAttribute('aria-pressed', String(o.dataset.g === g)));
    list.classList.toggle('all', g === 'all');
    list.querySelectorAll('li').forEach((li) => { li.hidden = g !== 'all' && li.dataset.g !== g; });
  };
  document.querySelectorAll('#trees-pick button').forEach((b) => { b.onclick = () => pick(b.dataset.g); });
  pick('current');
}
