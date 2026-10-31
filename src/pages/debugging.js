import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/debugging.css';
import { el, niceTicks } from '../viz/chart.js';

setup();

const BASE = import.meta.env.BASE_URL;
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const load = (f) => fetch(BASE + 'data/debugging/' + f).then((r) => r.json());
const strip = (h) => h.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Inside <code>: long paths may break after a '/', and --flags stay whole, so topics and commands wrap at sensible
// places (short ones like /opt/ros never split)
const codeBreaks = (h) => h.replace(/<code>([^<]*)<\/code>/g, (m, c) =>
  `<code>${(c.length > 20 ? c.replace(/(?<!~)\//g, '/<wbr>') : c).replace(/(^|\s)(--?[a-z][\w-]*)/g, '$1<span class="nw">$2</span>')}</code>`);
const smooth = () => (matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');

Promise.all([load('symptoms.json'), load('bag_budget.json')]).then(([S, B]) => {
  const finder = symptomFinder(S);
  diagnose(S, B, finder);
  budget(B);
  ages(B);
});

// The Likely / Check / From rows of one symptom (used by the finder and inline in the diagnose steps)
const rows = (s, from = true) => `
  <div class="sf-row"><span>Likely</span><div>${codeBreaks(s.cause)}</div></div>
  <div class="sf-row"><span>Check</span><div>${codeBreaks(s.check)}</div></div>
  ${from ? `<div class="sf-row sf-src"><span>From</span><div>${s.src.map((x) => (x.href ? `<a href="${x.href}">${x.label}</a>` : `<span>${x.label}</span>`)).join(' · ')}</div></div>` : ''}`;

// ------------------------------------------------------------------ symptom finder
// Default: one closed group per part of the system ("Kill switch 4"). Typing a word shows only the matches,
// with their groups open.
function symptomFinder(S) {
  const q = document.getElementById('sf-q');
  const list = document.getElementById('sf-list');
  const count = document.getElementById('sf-count');
  const cats = Object.keys(S.categories).filter((c) => S.symptoms.some((s) => s.cat === c));

  list.innerHTML = cats.map((c) => {
    const mine = S.symptoms.filter((s) => s.cat === c);
    return `
    <details class="sf-group" data-cat="${c}">
      <summary><span class="sf-gname">${S.categories[c]}</span><span class="sf-gn" data-n="${mine.length}">${mine.length}</span></summary>
      <div class="sf-items">${mine.map((s) => `
        <details class="sf-item" id="s-${s.id}">
          <summary><span class="sf-sym">${codeBreaks(s.symptom)}</span></summary>
          ${rows(s)}
        </details>`).join('')}
      </div>
    </details>`;
  }).join('');
  const groups = [...list.querySelectorAll('.sf-group')];
  const items = [...list.querySelectorAll('.sf-item')];
  const text = new Map(S.symptoms.map((s) => [s.id, strip(`${s.symptom} ${s.cause} ${s.check} ${S.categories[s.cat]}`).toLowerCase()]));
  let searching = false;

  function apply() {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let n = 0;
    for (const it of items) {
      const ok = words.every((w) => text.get(it.id.slice(2)).includes(w));
      it.hidden = !ok;
      if (ok) n++;
    }
    for (const g of groups) {
      const shown = g.querySelectorAll('.sf-item:not([hidden])').length;
      const gn = g.querySelector('.sf-gn');
      g.hidden = shown === 0;
      gn.textContent = words.length ? `${shown} of ${gn.dataset.n}` : gn.dataset.n;
      if (words.length) g.open = true;
      else if (searching) g.open = false; // search cleared: back to the closed list
    }
    searching = words.length > 0;
    count.textContent = words.length ? `${n} match${n === 1 ? '' : 'es'}` : `${items.length} symptoms`;
    list.classList.toggle('empty', n === 0);
  }
  q.addEventListener('input', apply);
  apply();

  // Open one symptom (from a link): clear the search if it hides it, open its group and it, scroll to it.
  function show(id) {
    const it = document.getElementById('s-' + id);
    if (!it) return;
    if (it.hidden) { q.value = ''; apply(); }
    it.closest('.sf-group').open = true;
    it.open = true;
    it.classList.remove('flash');
    void it.offsetWidth;
    it.classList.add('flash');
    it.scrollIntoView({ behavior: smooth(), block: 'start' });
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#s-"]');
    if (!a) return;
    e.preventDefault();
    history.replaceState(null, '', a.getAttribute('href'));
    show(a.getAttribute('href').slice(3));
  });
  if (location.hash.startsWith('#s-')) requestAnimationFrame(() => show(location.hash.slice(3)));
  return { show, byId: new Map(S.symptoms.map((s) => [s.id, s])) };
}

// ------------------------------------------------------------------ diagnose, step by step
function diagnose(S, B, finder) {
  const root = document.getElementById('dx');
  // Normal rates from the pool session (bag_budget groups carry each topic's measured rate)
  const hz = {};
  for (const g of B.groups) g.topics.forEach((t, i) => { hz[t] = g.hz[i]; });
  const rate = (t) => (hz[t] >= 5 ? Math.round(hz[t]) : hz[t].toFixed(1));
  const RATES = [
    ['/talos/vectornav/imu', 'IMU'], ['/talos/gyro/twist', 'FOG'], ['/talos/odometry/filtered', 'EKF odometry'],
    ['/talos/depth/pose', 'Depth'], ['/talos/dvl_twist', 'DVL, while it has <a class="gl" href="glossary.html#term-bottom-lock">bottom lock</a>'], ['/talos/controller/mpc/state', 'MPC tick'],
    ['/talos/command/requested_rpm', 'RPM command'], ['/talos/state/thrusters/telemetry', 'ESC telemetry'],
  ];
  // Camera streams weren't in the pool bag: these are the pre-test checks' minimums (pretest_checks robots/talos/robot.yaml)
  const MIN = [
    ['ffc/…/image_rect_color/compressed', 8, 'Front camera'],
    ['dfc/…/image_rect_color/compressed', 8, 'Down camera'],
    ['yolo_orientation/…/compressed', 3, 'Detector image'],
  ];
  const rateTable = `<table class="dx-rates"><tbody>${RATES.map(([t, n]) =>
    `<tr><td><b>${n}</b><code>${t.replace('/talos/', '').replace(/\//g, '/<wbr>')}</code></td><td>${rate(t)} Hz</td></tr>`).join('')}${MIN.map(([t, v, n]) =>
    `<tr><td><b>${n}</b><code>${t.replace(/\//g, '/<wbr>')}</code></td><td>≥ ${v} Hz</td></tr>`).join('')}</tbody></table>`;

  const STEPS = [
    {
      q: 'Can your shell see Talos?',
      cmd: ['ros2 topic list --no-daemon | grep /talos'],
      ok: 'A long list of <code>/talos/...</code> topics. The launcher page, <code>http://orin2:8080</code>, loads and says <i>Discovery: Self Hosted (OK)</i>.',
      no: ['zenoh-nothing', 'launcher-down', 'zenoh-router-died'],
    },
    {
      q: 'Are the launches you need running?',
      link: ['Open the launcher page', 'http://orin2:8080'],
      ok: 'The right file is loaded (<code>talos_launch_mpc.yaml</code> in the pool, <code>talos_launch_bench_mpc.yaml</code> on the bench, whose DVL is fake). Every launch you need says <b>Running</b>, not <i>3/4 completed</i> or <i>ERROR!</i>, with one exception: <b>riptide_navigation</b> stops at <i>4/5 completed</i>, because it also waits for a placeholder topic <code>/a</code> that nothing publishes. That is normal. Nothing under <i>Abandoned Launches</i>.',
      no: ['launch-pending', 'launch-died', 'cameras-wrong-nav', 'abandoned', 'fake-dvl'],
    },
    {
      q: 'Is each topic publishing at its normal rate?',
      cmd: ['ros2 topic hz /talos/<topic>'],
      ok: `Close to these (measured on the Orin in a pool session; over the tether, expect a little less). The cameras weren't in that bag: their <b>≥</b> rows are the pre-test checks' minimums, measured one stream at a time.${rateTable}`,
      no: ['no-firmware', 'dvl-lock', 'hz-over-link', 'type-unknown'],
    },
    {
      q: 'Is Talos enabled all the way down?',
      cmd: ['# the kill system: want false', 'ros2 topic echo /talos/state/kill --once',
        '# both ESC boards: want disabled_flags 0', 'ros2 topic echo /talos/state/thrusters/telemetry --no-arr',
        '# the controller: want true', 'ros2 topic echo /talos/controller/motion_enabled --once'],
      ok: 'Kill false; <code>disabled_flags</code> 0 on both ESC boards (telemetry alternates between them: <code>start_thruster_num</code> 0, then 4); <code>motion_enabled</code> true. Allow 5 s after Enable.',
      no: ['esc-delay', 'viewer-kills', 'competing-operator', 'killed-mystery', 'rpm-stale', 'enabled-forever'],
    },
    {
      q: 'Do the values make sense?',
      cmd: ['ros2 topic echo /talos/<topic> --once', 'ros2 run tf2_ros tf2_echo talos/base_link talos/<frame>'],
      ok: 'Signs and sizes match what Talos is doing: plot them in the viewer while you move it by hand on the stand.',
      no: ['ekf-lag', 'drift-still', 'mount-mismatch', 'table-mode', 'hw-output-off', 'model-swap', 'torpedo-classes', 'config-not-taking'],
    },
    {
      q: 'Is the node saying anything?',
      cmd: ['ros2 topic echo /rosout --field msg'],
      ok: 'No repeating warnings. The launcher page shows each launch\'s output while it is open; earlier lines are only in <code>~/.ros/log</code> on the Orin.',
      no: ['stale-sensors', 'no-fresh-odom', 'solve-slow', 'disturbance', 'sim-offset-prior'],
    },
  ];
  const ans = STEPS.map(() => null); // null | 'yes' | 'no'

  const cmdHtml = (lines) => `<pre class="dx-cmd"><code>${lines.map((l) =>
    (l.startsWith('#') ? `<span class="c">${esc(l)}</span>` : esc(l).replace(/(^| )(--?[\w-]+)/g, '$1<span class="nw">$2</span>'))).join('\n')}</code></pre>`;
  // Each usual cause opens in place, sources included, so the stepper never sends you away
  function cause(id) {
    const s = finder.byId.get(id);
    return `<li><details class="dx-cause"><summary><span class="dx-ctext">${codeBreaks(s.symptom)}</span></summary><div class="dx-cbody">${rows(s)}</div></details></li>`;
  }
  function render() {
    const cur = ans.findIndex((a) => a !== 'yes');
    root.innerHTML = STEPS.map((s, i) => {
      const state = ans[i] === 'yes' ? 'done' : i === cur ? (ans[i] === 'no' ? 'fail' : 'active') : 'todo';
      const body = state === 'todo' || state === 'done' ? '' : `
        <div class="dx-body">
          ${s.link ? `<p class="dx-link">${s.link[0]}: <a href="${s.link[1]}" target="_blank" rel="noopener">${s.link[1].replace('http://', '')}</a> <span>(on the robot's network)</span></p>` : cmdHtml(s.cmd)}
          <div class="dx-ok"><span>Healthy</span><div>${s.ok}</div></div>
          ${state === 'fail' ? `<div class="dx-no"><span>Usually</span><ul>${s.no.map(cause).join('')}</ul></div>` : ''}
          <div class="dx-btns">
            ${state === 'fail'
              ? `<button type="button" class="btn primary" data-a="yes" data-i="${i}">Fixed it, go on</button>`
              : `<button type="button" class="btn primary" data-a="yes" data-i="${i}">Yes</button><button type="button" class="btn" data-a="no" data-i="${i}">No</button>`}
          </div>
        </div>`;
      return `<li class="dx-step ${state}"><div class="dx-head"><span class="dx-n">${state === 'done' ? '✓' : i + 1}</span><span class="dx-q">${s.q}</span>${state === 'done' ? `<button type="button" class="dx-redo" data-redo="${i}">Check again</button>` : ''}</div>${body}</li>`;
    }).join('') + (cur === -1
      ? `<li class="dx-step end"><div class="dx-head"><span class="dx-n">✓</span><span class="dx-q">The chain looks healthy. The problem is in the logic: <a href="#bags">record a bag</a> and <a href="#replay">replay it</a> at home.</span></div><div class="dx-btns"><button type="button" class="btn" data-reset>Start over</button></div></li>`
      : '');
  }
  // After an answer the list changes height under your finger: bring the step that now needs you back on screen.
  function bringBack() {
    const t = root.querySelector('.dx-step.active, .dx-step.fail, .dx-step.end');
    if (!t) return;
    const r = t.getBoundingClientRect();
    if (r.top < 64 || r.top > innerHeight * 0.6) t.scrollIntoView({ block: 'start', behavior: smooth() });
    t.querySelector('.btn')?.focus({ preventScroll: true });
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.reset !== undefined) ans.fill(null);
    else if (b.dataset.redo !== undefined) { const i = +b.dataset.redo; for (let k = i; k < ans.length; k++) ans[k] = null; }
    else ans[+b.dataset.i] = b.dataset.a;
    render();
    bringBack();
  });
  render();
}

// ------------------------------------------------------------------ bag budget
function budget(B) {
  const list = document.getElementById('bb-list');
  const minIn = document.getElementById('bb-min'), minOut = document.getElementById('bb-min-o');
  const total = document.getElementById('bb-total'), stack = document.getElementById('bb-stack');
  const note = document.getElementById('bb-note');
  // One distinct theme colour per group
  // (the two slates sit far apart: Kill flags is always a 2 px sliver, the point cloud next to pale cyan and red)
  const COLORS = ['--state', '--s7', '--prediction', '--s4', '--s5', '--s6', '--ink-2', '--reference', '--water-deep', '--s8', '--ink', '--accent-ink'];
  const G = B.groups.map((g, i) => ({ ...g, color: css(COLORS[i % COLORS.length]) }));
  const kb = (bps) => (bps >= 1e5 ? `${(bps / 1e6).toFixed(2)} MB/s` : `${(bps / 1e3).toFixed(1)} kB/s`);
  const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} kB`);

  // Which topics each row holds, shown under its label (readable on a phone, unlike a tooltip)
  const topicsOf = (g) => {
    const t = g.topics.map((x) => x.replace('/talos/', ''));
    return t.length > 7 ? `${t[0].split('/')[0]}/… (${t.length} topics, one per object)` : t.join(', ');
  };
  list.innerHTML = G.map((g, i) => `
    <label class="bb-row">
      <input type="checkbox" data-i="${i}" ${g.on ? 'checked' : ''}>
      <i style="background:${g.color}"></i>
      <span class="bb-name">${g.label}${g.src === 'sim' ? ' <small>sim</small>' : ''}</span>
      <span class="bb-rate">${kb(g.bps)}</span>
      <span class="bb-topics">${topicsOf(g)}</span>
    </label>`).join('');
  const boxes = [...list.querySelectorAll('input')];

  function draw() {
    const min = +minIn.value;
    minOut.textContent = `${min} min`;
    const on = G.filter((g, i) => boxes[i].checked);
    const bps = on.reduce((a, g) => a + g.bps, 0);
    total.innerHTML = `<div><b>${bps ? size(bps * min * 60) : '0'}</b><span>for ${min} min</span></div><div><b>${bps ? kb(bps) : '0'}</b><span>recorded</span></div><div><b>${bps ? size(bps * 3600) : '0'}</b><span>per hour</span></div>`;
    stack.innerHTML = on.map((g) => `<span style="flex:${g.bps};background:${g.color}" title="${g.label}"></span>`).join('');
    const top = on.slice().sort((a, b) => b.bps - a.bps)[0];
    note.innerHTML = !on.length ? 'Nothing ticked.'
      : `<i style="background:${top.color}"></i>Largest: <b>${top.label}</b>, ${Math.round((100 * top.bps) / bps)} % of the bag.`;
  }
  list.addEventListener('change', draw);
  minIn.addEventListener('input', draw);
  draw();

  // Phones: the shared Chapters button floats at the top while you scroll up. The sticky totals step down below it
  // while it shows and back up when it tucks away, so it never sits on the Run length slider.
  const out = document.querySelector('.bb-out');
  const menu = document.querySelector('.menu-btn');
  if (out && menu) {
    const sync = () => out.classList.toggle('below-menu', !menu.classList.contains('tucked'));
    new MutationObserver(sync).observe(menu, { attributes: true, attributeFilter: ['class'] });
    sync();
    // While stuck, it paints a plain band above itself for the button to sit on (rows don't peek through)
    const stuck = () => out.classList.toggle('stuck', innerWidth <= 760
      && Math.abs(out.getBoundingClientRect().top - parseFloat(getComputedStyle(out).top)) < 2);
    addEventListener('scroll', stuck, { passive: true });
    out.addEventListener('transitionend', stuck);
  }
}

// ------------------------------------------------------------------ message ages
function ages(B) {
  const host = document.getElementById('age-chart');
  const note = document.getElementById('age-note');
  const pick = document.getElementById('age-pick');
  const KEEP = ['/talos/vectornav/imu', '/talos/gyro/twist', '/talos/controller/mpc/state', '/talos/controller/mpc/disturbance',
    '/talos/odometry/filtered', '/talos/depth/pose', '/talos/controller/mpc/reference', '/talos/dvl_twist'];
  const WHY = {
    '/talos/vectornav/imu': 'Stamped by the driver as each sample is read, so it is recorded within a millisecond.',
    '/talos/gyro/twist': 'The FOG, the same: stamped on arrival, recorded within a millisecond or two.',
    '/talos/controller/mpc/state': 'The MPC\'s own state estimate, stamped and published in the same tick.',
    '/talos/controller/mpc/disturbance': 'Published right after the state, in the same MPC tick.',
    '/talos/odometry/filtered': 'The EKF stamps its output with the time of the update. These 2 ms are delivery, not the filter\'s lag behind the sensors, which is a separate problem (see the EKF symptom).',
    '/talos/depth/pose': 'Keeps the stamp of the raw reading, which crosses <a class="gl" href="glossary.html#term-can">CAN</a> and <a class="gl" href="glossary.html#term-micro-ros">micro-ROS</a> from the camera cage board before the converter republishes it. Hence 3 to 29 ms.',
    '/talos/controller/mpc/reference': 'Stamped at the start of the MPC tick and published after the solve, so its age is mostly solve time (median 30 ms in this session).',
    '/talos/dvl_twist': 'Back-dated on purpose: the driver subtracts the DVL\'s dt2, the time from the echo to the output, so the stamp says when the water moved past. A fifth of the messages are about 50 ms older (the cluster near 175 ms); the bag doesn\'t hold dt2, so it can\'t say why.',
  };
  let which = 'pool', sel = '/talos/dvl_twist';

  function draw() {
    const rows = B.ages[which].filter((r) => KEEP.includes(r.topic)).sort((a, b) => a.p50 - b.p50);
    if (!rows.some((r) => r.topic === sel)) sel = rows[rows.length - 1].topic;
    const W = host.clientWidth || 600, rowH = 40, top = 6, axisH = 34, padL = 8, padR = 14;
    // Pool: ages from 0.4 to 175 ms, so a log axis; bench: all about -37 ms, so a linear one with zero marked
    const log = which === 'pool';
    let X, ticks;
    if (log) {
      const l0 = Math.log10(0.3), l1 = Math.log10(250);
      X = (v) => padL + ((Math.log10(Math.max(v, 0.3)) - l0) / (l1 - l0)) * (W - padL - padR);
      ticks = W < 420 ? [0.5, 1, 5, 10, 50, 100] : [0.5, 1, 2, 5, 10, 20, 50, 100, 200];
    } else {
      const lo = Math.min(0, ...rows.map((r) => r.p05)), hi = Math.max(0, ...rows.map((r) => r.p95));
      const span = hi - lo, x0 = lo - span * 0.04, x1 = hi + span * 0.06;
      X = (v) => padL + ((v - x0) / (x1 - x0)) * (W - padL - padR);
      ticks = niceTicks(x0, x1, W < 420 ? 4 : 7);
    }
    const H = top + rows.length * rowH + axisH;
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart age-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Message age when recorded, per topic' }, host);
    for (const t of ticks) {
      el('line', { x1: X(t), x2: X(t), y1: top, y2: H - axisH + 4, class: t === 0 ? 'age-zero' : 'age-grid' }, svg);
      const tx = el('text', { x: X(t), y: H - axisH + 18, class: 'age-tick', 'text-anchor': 'middle' }, svg);
      tx.textContent = `${t}`;
    }
    const ax = el('text', { x: W - padR, y: H - 2, class: 'age-tick', 'text-anchor': 'end' }, svg);
    ax.textContent = log ? 'age when recorded (ms, log scale)' : 'age when recorded (ms)';
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const g = el('g', { class: 'age-row' + (r.topic === sel ? ' on' : ''), tabindex: 0, role: 'button', 'aria-label': `${r.topic}: median ${r.p50} ms` }, svg);
      el('rect', { x: 0, y, width: W, height: rowH, class: 'age-hit' }, g);
      const lab = el('text', { x: padL, y: y + 13, class: 'age-label' }, g);
      lab.textContent = r.topic.replace('/talos/', '') + `  ·  ${r.hz >= 5 ? Math.round(r.hz) : r.hz.toFixed(1)} Hz`;
      const cy = y + 27;
      el('line', { x1: X(r.p05), x2: X(r.p95), y1: cy, y2: cy, class: 'age-whisk' }, g);
      el('rect', { x: X(r.p25), y: cy - 6, width: Math.max(2, X(r.p75) - X(r.p25)), height: 12, rx: 2, class: 'age-box' }, g);
      el('line', { x1: X(r.p50), x2: X(r.p50), y1: cy - 8, y2: cy + 8, class: 'age-med' }, g);
      const right = X(r.p95) + 64 <= W;
      const med = el('text', { x: right ? X(r.p95) + 6 : X(r.p05) - 6, y: cy + 4, class: 'age-val', 'text-anchor': right ? 'start' : 'end' }, g);
      med.textContent = `${r.p50.toFixed(r.p50 < 10 && r.p50 > -10 ? 1 : 0)} ms`;
      const choose = () => { sel = r.topic; draw(); };
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') choose(); });
      g.addEventListener('click', choose);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(); } });
    });
    noteFor(rows.find((r) => r.topic === sel));
  }

  function noteFor(r) {
    const hist = r.hist, mx = Math.max(...hist);
    const bars = hist.map((c) => `<i style="height:${Math.max(1, (36 * c) / mx)}px"></i>`).join('');
    const lo = r.hist_lo, hi = r.hist_lo + r.hist_w * hist.length;
    const why = which === 'bench'
      ? (r.topic === '/talos/dvl_twist'
        ? 'Not back-dated like the pool DVL: the bench launch file runs <code>fake_dvl.py</code>, which stamps each message as it sends it. Negative for the same reason as the rest: the recording computer\'s clock was behind the Orin\'s.'
        : 'Negative: the recording computer\'s clock was behind the Orin\'s, so every message appears to arrive before it was sent.')
      : WHY[r.topic];
    note.innerHTML = `<div class="age-hist"><div class="age-bars">${bars}</div><div class="age-axis"><span>${lo.toFixed(1)}</span><span>${hi.toFixed(1)} ms</span></div></div>`
      + `<div><b>${r.topic.replace('/talos/', '')}</b>: median ${r.p50.toFixed(1)} ms, 95 % under ${r.p95.toFixed(1)} ms (${r.n} messages). ${why}</div>`;
  }

  pick.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    which = b.dataset.k;
    pick.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  let lastW = 0;
  new ResizeObserver(() => { if (host.clientWidth !== lastW) { lastW = host.clientWidth; draw(); } }).observe(host);
}
