import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/nereus.css';
import { archFigure } from '../viz/nereus-arch.js';
import { LineChart, el, niceTicks } from '../viz/chart.js';

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

// The step titles burned into tree-run.mp4 (video seconds; made by tools/nereus/cut_run_video.sh).
chapters('run-video', 'run-chapters', [[0, 'Kill switch'], [1.35, 'Gate'], [5.5, 'Slalom'], [11.52, 'Pinger'], [17.55, 'Torpedo'], [22.52, 'Torpedo hit'], [23.82, 'Table'], [45.61, 'Bins'], [54.33, 'Home'], [59.24, 'Done']]);

// ------------------------------------------------------------------ architecture
archFigure($('arch-graph'));

// ------------------------------------------------------------------ pack explorer
// Break a path or name only after "/" (and "_" for long identifiers), never mid-word.
const brk = (t, re = /\//g) => esc(t).replace(re, '$&<wbr>');
function packExplorer(P) {
  const kinds = $('pack-kinds'), files = $('pack-files'), body = $('pack-body');
  const MAIN = ['Scenario', 'Robot', 'Course', 'Bridge'];
  const groups = [...new Set(P.map((p) => p.group))];
  const more = groups.filter((g) => !MAIN.includes(g));
  let group = MAIN[0], list = [], cur = 0, all = false;
  kinds.innerHTML = MAIN.map((g, i) => `<button type="button" class="btn" data-g="${g}" aria-pressed="${i === 0}">${g}</button>`).join('')
    + `<button type="button" class="btn nx-more" data-more aria-expanded="false">More…</button>`
    + `<span class="nx-more-list" hidden>${more.map((g) => `<button type="button" class="btn" data-g="${g}" aria-pressed="false">${g}</button>`).join('')}</span>`;
  const moreBtn = kinds.querySelector('[data-more]'), moreList = kinds.querySelector('.nx-more-list');
  const fileLabel = (p) => p.label.replace(/ \(.*\)$/, '').replace(/\.yaml$/, '');
  function showFiles() {
    list = P.filter((p) => p.group === group);
    cur = 0;
    all = false;
    files.hidden = list.length < 2;
    // More than four files (the course): one drop-down instead of rows of chips.
    files.innerHTML = list.length > 4
      ? `<label class="nx-file-pick">File <select>${list.map((p, i) => `<option value="${i}">${esc(fileLabel(p))}</option>`).join('')}</select></label>`
      : list.map((p, i) => `<button type="button" class="btn" data-i="${i}" aria-pressed="${i === 0}">${esc(fileLabel(p))}</button>`).join('');
    showBody();
  }
  // The keys a new member edits or needs first, per kind of pack (the first one opens).
  const KEY = {
    scenario: ['task_placements', 'initial', 'seed', 'pool', 'robot'],
    robot: ['sensors', 'body', 'thrusters', 'mechanisms'],
    pool: ['parameters', 'water_optics', 'lighting'],
    tasks: ['tasks', 'scoring_rules'],
    task: ['props', 'regions', 'events', 'scoring'],
    bridge: ['streams', 'kill', 'clock', 'services'],
    equipment: ['items'],
    labels: ['models', 'tasks'],
    dataset: ['tasks', 'image', 'split', 'randomize'],
  };
  const yamlish = (v) => String(v).replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
  // Long float literals (the body's matrices) shown to 4 significant figures; the GitHub link has the exact file.
  const tidy = (y) => y.replace(/-?\d+\.\d{7,}(?:e-?\d+)?/g, (n) => String(+(+n).toPrecision(4)));
  function showBody() {
    const p = list[cur];
    const want = KEY[p.kind] || [];
    const keys = all || !want.length ? p.keys : want.map((k) => p.keys.find((x) => x.key === k)).filter(Boolean);
    const first = keys.some((k) => k.key === want[0]) ? want[0] : keys[0]?.key;
    const hidden = p.keys.length - keys.length;
    body.innerHTML = `
      <div class="nx-pack-meta"><a href="${p.url}"><code>${brk(p.path)}</code></a><span>${p.lines} lines</span></div>
      ${p.description ? `<p class="nx-pack-desc">${esc(p.description)}${p.kind === 'bridge' ? ' <span class="nx-dim">(No acoustics topics are wired yet: the simulator has no pinger.)</span>' : ''}</p>` : ''}
      <div class="nx-keys">${keys.map((k) => `
        <details class="nx-key"${k.key === first ? ' open' : ''}>
          <summary><code class="nx-k">${brk(k.key, /_/g)}</code><span class="nx-what">${esc(k.what)}</span></summary>
          <pre><code>${esc(tidy(k.yaml))}</code></pre>
          <div class="nx-key-foot">${tidy(k.yaml) !== k.yaml ? 'Long numbers rounded here · ' : ''}${k.more ? `${k.more} more lines not shown · ` : ''}<a href="${p.url}#L${k.line}${k.end > k.line ? '-L' + k.end : ''}">line${k.end > k.line ? 's ' + k.line + '–' + k.end : ' ' + k.line} on GitHub</a></div>
        </details>`).join('')}</div>
      ${hidden > 0 ? `<button type="button" class="btn nx-allkeys" data-all>Show all ${p.keys.length} keys</button>` : all && want.length ? `<button type="button" class="btn nx-allkeys" data-all>Show the main ${Math.min(want.length, p.keys.length)} only</button>` : ''}`;
  }
  kinds.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b === moreBtn) {
      const open = moreList.hidden;
      moreList.hidden = !open;
      moreBtn.setAttribute('aria-expanded', String(open));
      return;
    }
    kinds.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    group = b.dataset.g;
    showFiles();
  });
  files.addEventListener('change', (e) => {
    cur = +e.target.value;
    all = false;
    showBody();
  });
  files.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(files, b);
    cur = +b.dataset.i;
    all = false;
    showBody();
  });
  body.addEventListener('click', (e) => {
    if (!e.target.closest('[data-all]')) return;
    all = !all;
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
    const off = sc.length > Y1 - Y0 ? ` Only the first ${Math.round(Y1 - Y0)} m are drawn: it carries on below the map.` : '';
    note.innerHTML = `<b>${esc(sc.label)}</b>: ${sc.length.toFixed(2)} × ${sc.width.toFixed(2)} m, ${sc.depth.toFixed(2)} m deep${sc.sloped ? ' at the deep end, with a sloped floor' : ''}.${off} ${sc.world_placement ? 'The world is placed from the AprilTag board on the deep-end wall. ' : ''}Thin lines are the floor markings.`;
  }
  function info(item) {
    if (!item) return poolNote();
    if (item.kind === 'board') return (note.innerHTML = `<b>AprilTag board</b> (equipment pack): the map origin. The stack calibrates its map from this tag, so the scenario puts the course relative to it.`);
    if (item.kind === 'start') return (note.innerHTML = `<b>Start</b>: Talos's centre of mass at x ${sc.start[0]}, y ${sc.start[1]}, ${Math.abs(sc.start[2])} m deep, killed and at rest (scenario <code>initial</code>).`);
    const t = item.t;
    const out = !inside(sc.outline, t.xy) ? ' <b>Outside this pool.</b>' : '';
    const fr = t.frames.length ? ` Frames: ${t.frames.map((f) => `<code>${esc(f.id)}</code>`).join(', ')}.` : '';
    note.innerHTML = `<b>${t.task === 'surface' ? 'surface (the octagon)' : esc(t.task)}</b>: x ${m(t.xy[0])}, y ${m(t.xy[1])} m, ${Math.abs(t.z).toFixed(2)} m deep, yaw ${deg(t.yaw)}.${out}${fr}`;
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
    const label = (g, x, y, text, anchor = 'start', lead = null) => {
      if (lead) el('line', { class: 'nx-lead', x1: lead[0], y1: lead[1], x2: x + (anchor === 'end' ? 2 : anchor === 'start' ? -2 : 0), y2: anchor === 'middle' ? y - 12 : y - 4 }, g);
      el('text', { class: 'nx-label', x, y, 'text-anchor': anchor }, g).textContent = text;
    };
    // The octagon sits 0.18 m from the table: draw it last, so its wide touch target is on top, and give the
    // table its touch target on its offset label instead.
    const order = [...sc.tasks].sort((p, q) => (p.task === 'surface') - (q.task === 'surface'));
    for (const t of order) {
      const tg = el('g', {}, svg);
      const cx = sx(t.xy[0]), cy = sy(t.xy[1]);
      // the prop's own frames (bins, magnet lights, baskets, signs): only drawn while the prop is selected
      const fr = el('g', { class: 'nx-frames' }, tg);
      for (const f of t.frames) el('circle', { class: 'nx-frame', cx: sx(f.xy[0]), cy: sy(f.xy[1]), r: 2.6 }, fr);
      const a = (t.yaw * Math.PI) / 180;
      if (t.task === 'gate' && t.frames.length === 2) {
        const [p, q] = t.frames;
        el('line', { class: 'nx-gate', x1: sx(p.xy[0]), y1: sy(p.xy[1]), x2: sx(q.xy[0]), y2: sy(q.xy[1]) }, tg);
        label(tg, cx + 9, cy + 5, 'gate');
      } else if (t.task === 'slalom' && t.frames.length === 3) {
        // three rows joined by the path through them, each row a short bar across it
        const P = t.frames.map((f) => [sx(f.xy[0]), sy(f.xy[1])]);
        el('polyline', { class: 'nx-slalom-path', points: P.map((p) => p.join(',')).join(' ') }, tg);
        el('polyline', { class: 'nx-target-line', points: P.map((p) => p.join(',')).join(' ') }, tg); // fat invisible touch target
        P.forEach((p, i) => {
          const q = P[Math.min(i + 1, 2)], o = P[Math.max(i - 1, 0)];
          const dx = q[0] - o[0], dy = q[1] - o[1], n = Math.hypot(dx, dy) || 1, half = 0.75 * k;
          el('line', { class: 'nx-gate', x1: p[0] - (dy / n) * half, y1: p[1] + (dx / n) * half, x2: p[0] + (dy / n) * half, y2: p[1] - (dx / n) * half }, tg);
        });
        label(tg, P[1][0], P[1][1] + 0.75 * k + 13, 'slalom', 'middle');
      } else if (t.task === 'surface') {
        const R = Math.max(7, 1.1 * k);
        el('circle', { class: 'nx-octagon', cx, cy, r: R }, tg);
        label(tg, cx, cy - R - 5, 'octagon', 'middle');
        el('circle', { class: 'nx-target', cx, cy, r: R + 10 }, tg);
        el('rect', { class: 'nx-target', x: cx - 30, y: cy - R - 22, width: 60, height: 22 }, tg);
      } else {
        el('line', { class: 'nx-yaw', x1: cx, y1: cy, x2: cx + Math.cos(a) * r * 2.6, y2: cy - Math.sin(a) * r * 2.6 }, tg);
        el('circle', { class: 'nx-task', cx, cy, r }, tg);
        if (t.task === 'table') label(tg, cx + 22, cy + 24, 'table', 'start', [cx + 3, cy + 4]);
        else label(tg, cx + r + 4, cy + 4, t.task);
      }
      if (t.task === 'table') el('rect', { class: 'nx-target', x: cx + 12, y: cy + 8, width: 52, height: 26 }, tg); // on the label
      else if (t.task !== 'surface') el('circle', { class: 'nx-target', cx, cy, r: Math.max(14, r * 2.2) }, tg); // big, invisible touch target
      hit(tg, { id: t.task, kind: 'task', t });
    }
    for (const e of sc.equipment) {
      const bg = el('g', {}, svg);
      // The board hangs on the wall at the map origin: a bar along the wall.
      const bx = sx(e.xy[0]), by = sy(e.xy[1]);
      el('rect', { class: 'nx-board', x: bx - 3.5, y: by - 13, width: 7, height: 26, rx: 1.5 }, bg);
      label(bg, bx + 7, by - 17, 'tag board');
      el('circle', { class: 'nx-target', cx: bx, cy: by, r: 12 }, bg);
      hit(bg, { id: 'board', kind: 'board' });
    }
    const st = el('g', {}, svg);
    const stx = sx(sc.start[0]), sty = sy(sc.start[1]);
    // Talos's start: a ring that stays visible even on top of the board, labelled below it
    el('circle', { class: 'nx-start', cx: stx, cy: sty, r: 5.5 }, st);
    label(st, stx, sty + 27, 'start', 'middle', [stx, sty + 6]);
    el('circle', { class: 'nx-target', cx: stx, cy: sty + 10, r: 14 }, st);
    hit(st, { id: 'start', kind: 'start' });
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
// The shared chart's readout shows the x value without a unit; add metres.
class RangeChart extends LineChart {
  hover(e) {
    super.hover(e);
    const d = this.tip.firstElementChild;
    if (d && !this.tip.hidden && !d.textContent.endsWith(' m')) d.textContent += ' m';
  }
}
function depthNoise() {
  const D = { base: 0.002, coef: 0.0015, exp: 2, dropout: 0.005, range: 0.1, edge: 0.2, min: 0.15, max: 4 };
  const rs = [];
  for (let r = D.min; r <= D.max + 1e-9; r += 0.05) rs.push(+r.toFixed(2));
  // Below 0.15 m there is no depth at all: a grey strip from 0, so the axis starts at 0 m.
  const bands = [{ x0: 0, x1: D.min, color: 'rgba(15,38,51,0.08)' }];
  const markers = [{ x: D.min, label: 'no depth below 0.15 m' }];
  const s = new RangeChart($('depth-sigma'), { height: 230, title: 'Depth error', xLabel: 'range (m)', yLabel: '1σ (cm)', digits: 2, xDigits: 2, unit: 'cm', xDomain: [0, D.max], bands, markers });
  s.set([{ name: 'depth error, 1σ', color: css('--state'), values: rs.map((r) => ({ x: r, y: 100 * (D.base + D.coef * r ** D.exp) })) }], { yDomain: [0, 3] });
  const d = new RangeChart($('depth-drop'), { height: 230, title: 'Missing depth', xLabel: 'range (m)', yLabel: 'pixels (%)', digits: 1, xDigits: 2, unit: '%', xDomain: [0, D.max], bands, markers });
  const p = (r, edge) => 100 * Math.min(1, D.dropout + D.range * (r / D.max) ** 2 + (edge ? D.edge : 0));
  d.set([
    { name: 'flat surface', color: css('--state'), values: rs.map((r) => ({ x: r, y: p(r, false) })) },
    { name: 'edge pixels', color: css('--reference'), values: rs.map((r) => ({ x: r, y: p(r, true) })) },
  ], { yDomain: [0, 35] });
}
depthNoise();

// ------------------------------------------------------------------ task events
// The tree's seven steps, always shown; a step with task events opens to list them (one row per object or shot,
// so a grasp, release and landing are one line). The torpedo/table step starts open.
function events(R) {
  const v = $('cam-video'), list = $('events');
  const STEPS = [[3.0, 'Gate'], [26.3, 'Slalom'], [60.8, 'Random pinger (not simulated)'], [94.3, 'Torpedo, then the table'], [373.9, 'Bins'], [476.1, 'Home through the gate'], [533.8, 'KillController: done']];
  const OPEN = 94.3;
  const tag = { torpedo: 'reference', claw: 'prediction', dropper: 's4', magnet: 's7', tasks: 'muted' };
  const s1 = (t) => t.toFixed(1);
  // Group the raw events: a shot with its hit, a marker with its landing, an object from grasp to basket.
  const rows = [];
  const E = R.events;
  for (let i = 0; i < E.length; i++) {
    const [t, e] = E[i];
    const next = E.slice(i + 1).find(([, f]) => f.kind === e.kind && f.id === e.id);
    if (e.kind === 'torpedo' && e.result === 'released') {
      const hit = next && next[1].result === 'success' ? next : null;
      rows.push({ t, kind: e.kind, what: `slot ${e.slot}${hit ? `, hit <code>${hit[1].target}</code>` : ', missed'}` });
    } else if (e.kind === 'dropper' && e.result === 'released') {
      const hit = next && next[1].result === 'success' ? next : null;
      rows.push({ t, kind: e.kind, what: `marker ${e.slot + 1}${hit ? ` → <code>${hit[1].target}</code>` : ', missed'}` });
    } else if (e.kind === 'claw' && e.result === 'grasped') {
      const done = E.slice(i + 1).find(([, f]) => f.kind === 'claw' && f.id === e.id && f.result === 'success');
      rows.push({ t, kind: e.kind, what: `${String(e.id).replace(/_/g, ' ')} → ${done ? `${done[1].target} basket` : 'dropped'}` });
    } else if (e.kind === 'magnet') {
      rows.push({ t, kind: e.kind, what: `lit <code>${e.target}</code>` });
    } else if (e.kind === 'tasks' && e.result === 'reset') {
      rows.push({ t, kind: 'reset', tag: 'tasks', what: 'Start run: score and props reset, so the hit above never scored' });
    }
  }
  const step = STEPS.map(([t, label], i) => ({ t, label, ev: rows.filter((r) => r.t >= t && r.t < (STEPS[i + 1]?.[0] ?? Infinity)) }));
  const evRow = (r) => `<li><button type="button" data-t="${r.t}" aria-label="Play from ${s1(r.t)} s"><i class="nx-play" aria-hidden="true"></i><span class="nx-ev-t">${s1(r.t)}</span><span class="nx-ev-kind" style="--c:var(--${tag[r.tag || r.kind] || 'muted'})">${r.kind}</span><span class="nx-ev-what">${r.what}</span></button></li>`;
  list.innerHTML = step.map((st, i) => `<li class="nx-ev-head${st.ev.length ? ' has' : ''}">
      <button type="button" data-t="${st.t}"${st.ev.length ? ` aria-expanded="${st.t === OPEN}" aria-controls="nx-ev-${i}"` : ''}><i class="nx-play" aria-hidden="true"></i><span class="nx-ev-t">${s1(st.t)}</span><span class="nx-ev-step">${st.label}</span>${st.ev.length ? `<span class="nx-ev-n">${st.ev.length} events</span>` : ''}</button>
      ${st.ev.length ? `<ol class="nx-ev-sub" id="nx-ev-${i}"${st.t === OPEN ? '' : ' hidden'}>${st.ev.map(evRow).join('')}</ol>` : ''}
    </li>`).join('');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    list.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    if (b.hasAttribute('aria-expanded')) {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      $(b.getAttribute('aria-controls')).hidden = !open;
    }
    // The video sits right above the list; only scroll if it is off screen.
    const r = v.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight) v.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
    // The video shows the whole run at exactly 10x simulated time; start a little before the event.
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

const ESC_RANGE = { thruster_telemetry_0_3: '0–3', thruster_telemetry_4_7: '4–7' };
function bridgeList(B) {
  const filter = $('bridge-filter'), list = $('bridge-list'), keyLine = $('bridge-key');
  const KEY_TOPIC = keyLine.innerHTML;
  const KEY_SRV = '<span class="nx-dir srv">srv</span><span class="nx-key-txt">a ROS service the simulator answers: call it and it acts once</span>';
  const CATS = [['sensor', 'Sensors'], ['camera', 'Cameras'], ['command', 'Into the sim'], ['state', 'Sim state'], ['services', 'Services']];
  filter.innerHTML = CATS.map(([k, n], i) => `<button type="button" class="btn" data-k="${k}" aria-pressed="${i === 0}">${n}</button>`).join('');
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
        <code class="nx-topic">${brk(short(s.topic), /[/_]/g)}${ESC_RANGE[s.id] ? ` <span class="nx-dim nx-nowrap">(ESC ${ESC_RANGE[s.id]})</span>` : ''}</code>
        <span class="nx-rate">${rate(s.rate)}</span>
      </summary>
      <dl class="nx-dl">
        <dt>Type</dt><dd><code>${esc(s.type)}</code></dd>
        <dt>Simulator side</dt><dd><code>${esc(s.native)}</code></dd>
        ${s.frame ? `<dt>Frame</dt><dd><code>${esc(s.frame)}</code></dd>` : ''}
        ${opts.length ? `<dt>Options</dt><dd>${esc(opts.join('; '))}</dd>` : ''}
        ${fields.length ? `<dt>Fields</dt><dd><ul class="nx-fields">${fields.map(([f, src]) => `<li><code>${esc(f)}</code> ← ${esc(String(src).replace(/^from /, ''))}</li>`).join('')}</ul></dd>` : ''}
        ${WHY[s.id] ? `<dt>Good to know</dt><dd>${WHY[s.id](B)}</dd>` : ''}
        ${s.note && !WHY[s.id] ? `<dt>Note</dt><dd>${esc(s.note)}</dd>` : ''}
        <dt>${into ? 'Sent by' : 'Listened to by'}</dt><dd>${who.length ? who.map((n) => `<code>${esc(n)}</code>`).join(' ') : '<span class="nx-dim">nobody in that run</span>'}</dd>
        <dt>Measured</dt><dd>${meas(s.measured)}${s.bytes ? `, ${size(s.bytes)} a message` : ''}${shared[s.topic] > 1 ? `; ${shared[s.topic]} streams share this topic, so this is their total` : ''}</dd>
      </dl>
      <a class="nx-line" href="${B.url}#L${s.line}">bridge.yaml line ${s.line}</a>
    </details>`;
  };
  const srow = (s) => `<details class="nx-stream" data-cat="services">
      <summary><span class="nx-dir srv" title="ROS service">srv</span><code class="nx-topic">${brk(short(s.service), /[/_]/g)}</code><span class="nx-rate"></span></summary>
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
    count.textContent = `${n} ${k === 'services' ? 'services' : 'streams'}`;
    keyLine.innerHTML = k === 'services' ? KEY_SRV : KEY_TOPIC;
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
    { id: 'tick', name: 'Tick, /clock', short: 'Tick, /clock', rate: 500, first: 'tick', what: 'Every 2 ms tick advances the plant and publishes <code>/clock</code>.' },
    { id: 'fog', name: 'FOG', rate: 500, what: 'Yaw rate on <code>gyro/twist</code>: a sample on every tick.' },
    { id: 'imu', name: 'IMU', rate: 400, what: 'Due every 2.5 ms, which is not a whole number of ticks, so the gaps run 2, 2, 2, 4 ms (400 a second on average).' },
    { id: 'truth', name: 'Truth TF', rate: 100, what: '<code>world → simulator/talos/base_link</code> and <code>simulator/ground_truth</code>, every 5th tick.' },
    { id: 'mpc', name: 'MPC (stack)', rate: 20, stack: true, what: 'Not the simulator: riptide_mpc solves every 50 ms of sim time. Its phase depends on when it started; drawn here at multiples of 50 ms.' },
    { id: 'depth', name: 'Depth', rate: 20, what: '<code>depth/pose</code> every 50 ms, exactly on a tick.' },
    { id: 'cam', name: 'Cameras', rate: 15, first: 'tick', what: 'First capture on the first tick (2 ms), then one per 66.7 ms slot counted from t = 0: 68, 134, 200, 268 ms. Rendering runs in the background, so images are published a little later.', listed: true },
    { id: 'cloud', name: 'Point clouds', short: 'Clouds', rate: 5, from: 'cam', every: 3, what: 'Every 3rd camera capture, built from the noisy depth and the colour image.' },
    { id: 'dvl', name: 'DVL', rate: 8, what: 'Due every 125 ms, which falls between ticks every other time, so samples come at 126, 250, 376, 500 ms.', listed: true },
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
  // Two windows, each with only the rows that read well in it: the fast sensors over 40 ms, the slow ones over 500 ms.
  const ZOOMS = [
    { T: 40, label: 'Fast: 40 ms', rows: ['tick', 'fog', 'imu', 'truth', 'cam'], sel: 'imu' },
    { T: 500, label: 'Slow: 500 ms', rows: ['depth', 'mpc', 'cam', 'cloud', 'dvl'], sel: 'dvl' },
  ];
  let Z = ZOOMS[0], sel = Z.sel;
  zoom.innerHTML = ZOOMS.map((z, i) => `<button type="button" data-z="${i}" aria-pressed="${z === Z}">${z.label}</button>`).join('');
  function show(row) {
    const ts = times(row, 1000);
    note.innerHTML = `<b>${row.name}</b>, ${row.rate} Hz. ${row.what}${row.stack || row.listed ? '' : ` First samples at ${ts.slice(0, 5).map((t) => +t.toFixed(1)).join(', ')} ms.`}`;
  }
  function draw(W) {
    box.innerHTML = '';
    const T = Z.T, rows = Z.rows.map((id) => ROWS.find((r) => r.id === id));
    const narrow = W < 520;
    const L = narrow ? 92 : 132, R = 14, rowH = 30, top = 4, H = top + rows.length * rowH + 26;
    const svg = el('svg', { class: 'chart nx-sched', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `When each simulated sensor takes a sample, first ${T} ms` }, box);
    const x = (t) => L + (t / T) * (W - L - R);
    const grid = el('g', { class: 'grid' }, svg), ax = el('g', { class: 'axis' }, svg);
    if (T <= 40) for (let t = TICK; t <= T; t += TICK) el('line', { x1: x(t), x2: x(t), y1: top, y2: H - 22, stroke: css('--rule'), 'stroke-dasharray': '2 3' }, grid);
    for (const t of niceTicks(0, T, narrow ? 5 : 8)) {
      el('line', { x1: x(t), x2: x(t), y1: top, y2: H - 22 }, grid);
      // the end label ("500 ms") is wider and right-aligned: skip a tick label that would run into it
      if (t !== T && x(T) - x(t) < (String(T).length + 3) * 7 + String(t).length * 3.6 + 6) continue;
      el('text', { x: x(t), y: H - 6, 'text-anchor': t === T ? 'end' : 'middle' }, ax).textContent = t + (t === T ? ' ms' : '');
    }
    const rowsG = [];
    rows.forEach((row, i) => {
      const y = top + i * rowH;
      const g = el('g', { class: 'nx-srow', tabindex: 0 }, svg);
      el('rect', { class: 'nx-srow-bg', x: 0, y, width: W, height: rowH }, g);
      el('text', { class: 'label', x: L - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, g).textContent = narrow && row.short ? row.short : row.name;
      const color = row.stack ? css('--reference') : css('--state');
      for (const t of times(row, T)) {
        if (T <= 40) el('circle', { cx: x(t), cy: y + rowH / 2, r: 3.8, fill: color }, g);
        else el('line', { x1: x(t), x2: x(t), y1: y + 7, y2: y + rowH - 7, stroke: color, 'stroke-width': 2 }, g);
      }
      const on = () => { sel = row.id; rowsG.forEach(([gg, r]) => gg.classList.toggle('on', r.id === sel)); show(row); };
      g.addEventListener('pointerdown', on);
      g.addEventListener('focus', on);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') on(); });
      rowsG.push([g, row]);
    });
    rowsG.forEach(([gg, r]) => gg.classList.toggle('on', r.id === sel));
    const cur = rows.find((r) => r.id === sel);
    if (cur) show(cur);
  }
  zoom.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(zoom, b);
    Z = ZOOMS[+b.dataset.z];
    sel = Z.sel;
    draw(box.clientWidth);
  });
  onWidth(box, draw);
}
schedule();

// ------------------------------------------------------------------ dataset samples
// One colour per class, distinct within each sample (fire orange against blood pink, not two reds).
const CLASS_COLOR = {
  fire: '--reference', blood: '--s5', circle: '--s7', ambulance: '--prediction', fire_engine: '--s4', compass: '--state',
  hammer_and_wrench: '--s5', buoy: '--s6', sos: '--s4', slalom: '--s8', magnet: '--s8',
  bandage: '--s5', helmet: '--state', nut_and_bolt: '--s4', pill: '--s7', plug: '--reference', warning: '--s6',
};
function samples(D) {
  const camSeg = $('sample-cam'), pick = $('sample-pick'), stage = $('sample-stage'), meta = $('sample-meta'), toggle = $('sample-labels');
  const task = (s) => (s.task ? s.task[0].toUpperCase() + s.task.slice(1) : 'Background');
  const pool = { talos_uwrt_repair_2026: 'RoboSub', talos_uwrt_rpac_look_2026: 'RPAC look' };
  const CAMS = [['ffc', 'Forward'], ['dfc', 'Down']];
  let cam = 'ffc';
  camSeg.innerHTML = CAMS.map(([c, n]) => `<button type="button" data-c="${c}" aria-pressed="${c === cam}">${n}</button>`).join('');
  function chips() {
    const idx = D.samples.map((s, i) => [s, i]).filter(([s]) => s.cam === cam);
    pick.innerHTML = idx.map(([s, i], k) => `<button type="button" class="btn" data-i="${i}" aria-pressed="${k === 0}">${task(s)}</button>`).join('');
    show(idx[0][1]);
  }
  function show(i) {
    const s = D.samples[i];
    const classes = [...new Set(s.polys.map((p) => p.cls))];
    const col = Object.fromEntries(classes.map((c, k) => [c, css(CLASS_COLOR[c] || PALETTE[k % PALETTE.length])]));
    // Zoom in on the labelled objects (at most 1.45x, same aspect) so small props stay readable on a phone.
    // The masks are normalised, so cropping is only a viewBox and an image offset.
    let x0 = 0, y0 = 0, cw = 1;
    if (s.polys.length) {
      const xs = s.polys.flatMap((p) => p.pts.filter((_, k) => k % 2 === 0)), ys = s.polys.flatMap((p) => p.pts.filter((_, k) => k % 2 === 1));
      const pad = 0.04, bx0 = Math.min(...xs) - pad, bx1 = Math.max(...xs) + pad, by0 = Math.min(...ys) - pad, by1 = Math.max(...ys) + pad;
      cw = Math.min(1, Math.max(0.69, bx1 - bx0, by1 - by0));
      if (cw < 0.97) {
        x0 = Math.min(1 - cw, Math.max(0, (bx0 + bx1) / 2 - cw / 2));
        y0 = Math.min(1 - cw, Math.max(0, (by0 + by1) / 2 - cw / 2));
      } else cw = 1;
    }
    const zoomed = cw < 1;
    stage.innerHTML = `<img src="${BASE}${s.img}" width="${s.w}" height="${s.h}" alt="Synthetic ${s.cam === 'ffc' ? 'forward' : 'down'}-camera training image: ${s.task || 'background'}, ${s.environment} look" style="width:${100 / cw}%;left:${(-x0 / cw) * 100}%;top:${(-y0 / cw) * 100}%">`;
    const svg = el('svg', { viewBox: `${x0 * s.w} ${y0 * s.h} ${cw * s.w} ${cw * s.h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, stage);
    for (const p of s.polys) {
      const pts = [];
      for (let k = 0; k < p.pts.length; k += 2) pts.push(`${(p.pts[k] * s.w).toFixed(1)},${(p.pts[k + 1] * s.h).toFixed(1)}`);
      el('polygon', { points: pts.join(' '), fill: col[p.cls], 'fill-opacity': 0.42, stroke: col[p.cls], 'stroke-width': 2.2, 'vector-effect': 'non-scaling-stroke' }, svg);
    }
    svg.style.display = toggle.checked ? '' : 'none';
    const counts = {};
    s.polys.forEach((p) => (counts[p.cls] = (counts[p.cls] || 0) + 1));
    const n = s.polys.length;
    const C = D.counts[s.cam];
    meta.innerHTML = `
      <div class="nx-chips">${classes.length ? classes.map((c) => `<span><i style="background:${col[c]}"></i>${c}${counts[c] > 1 ? ` ×${counts[c]}` : ''}</span>`).join('') : '<span class="nx-dim">Nothing labelled: a background image, so the model also learns what is not a prop.</span>'}</div>
      <div class="nx-sample-facts">${n} labelled ${n === 1 ? 'object' : 'objects'} · look: <b>${s.environment}</b> · pool: ${pool[s.scenario] || esc(s.scenario)} · ${s.split} split${zoomed ? ` · shown ${(1 / cw).toFixed(1)}× zoomed in` : ''}</div>
      <div class="nx-sample-facts">The ${s.cam === 'ffc' ? 'forward-camera (<code>ffc</code>)' : 'down-camera (<code>dfc</code>)'} set: ${(C.train + C.val).toLocaleString('en-US')} images, ${C.classes.length} classes.</div>`;
  }
  camSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(camSeg, b);
    cam = b.dataset.c;
    chips();
  });
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    press(pick, b);
    show(+b.dataset.i);
  });
  toggle.addEventListener('change', () => { const svg = stage.querySelector('svg'); if (svg) svg.style.display = toggle.checked ? '' : 'none'; });
  chips();
}

// ------------------------------------------------------------------ load data
load('nereus/packs.json').then(packExplorer);
load('nereus/course.json').then(courseMap);
load('rosgraph/tree_run.json').then(events);
load('nereus/bridge.json').then(bridgeList);
load('nereus/samples.json').then(samples);
