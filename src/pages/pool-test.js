import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/pool-test.css';
import { el, barChart } from '../viz/chart.js';

setup();

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const REL = 'https://github.com/osu-uwrt/riptide_release';

const data = await fetch(BASE + 'data/pool-test/pool-test.json').then((r) => r.json());

// ---------------------------------------------------------------- the release diary
{
  const LANES = [
    { k: 'pre', label: 'Before a test', color: css('--accent') },
    { k: 'post', label: 'After a test', color: css('--state') },
    { k: 'lake', label: 'Lake test', color: css('--prediction') },
    { k: 'comp', label: 'RoboSub', color: css('--s7') },
    { k: 'other', label: 'Other commits', color: css('--muted') },
    { k: 'tag', label: 'Tags', color: css('--ink') },
  ];
  const KIND = Object.fromEntries(LANES.map((l) => [l.k, l]));
  const ev = [
    ...data.release.commits.map((c) => ({ ...c, t: Date.parse(c.d) })),
    ...data.release.tags.map((g) => ({ k: 'tag', d: g.d, h: g.h, s: g.name, t: Date.parse(g.d) })),
  ].sort((a, b) => a.t - b.t);
  const tests = ev.filter((e) => e.k !== 'other');
  const host = document.getElementById('rel-timeline');
  const note = document.getElementById('rel-note');
  const n = (k) => ev.filter((e) => e.k === k).length;
  document.getElementById('rel-counts').innerHTML = LANES.filter((l) => l.k !== 'other')
    .map((l) => `<span><i style="background:${l.color}"></i>${l.label.toLowerCase()} <b>${n(l.k)}</b></span>`).join('');
  const t0 = Date.parse('2022-12-01'), t1 = Date.parse('2026-12-01');
  let sel = tests.length - 1, svg, pts = [];

  function describe(e) {
    const what = e.k === 'tag' ? `Tag <code>${esc(e.s)}</code>` : `“${esc(e.s)}”`;
    const link = e.k === 'tag' ? `${REL}/releases/tag/${encodeURIComponent(e.s)}` : `${REL}/commit/${e.h}`;
    return `<b>${e.d}</b> · ${KIND[e.k].label} · ${what} · <a href="${link}"><code>${e.h}</code></a>`;
  }
  function mark(i) {
    pts.forEach((p) => p.node.classList.toggle('on', p.i === i));
    const e = ev[i];
    note.innerHTML = describe(e);
  }
  function draw() {
    const W = host.clientWidth || 600;
    const narrow = W < 520;
    const left = narrow ? 8 : 112, right = 10, top = narrow ? 10 : 6, laneH = narrow ? 30 : 24;
    const H = top + LANES.length * laneH + 22;
    host.innerHTML = '';
    svg = el('svg', { class: 'chart rel-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, host);
    const sx = (t) => left + ((t - t0) / (t1 - t0)) * (W - left - right);
    // years
    for (let y = 2023; y <= 2026; y++) {
      const x = sx(Date.parse(`${y}-01-01`));
      el('line', { x1: x, x2: x, y1: top - 2, y2: H - 18, stroke: css('--grid') }, svg);
      el('text', { class: 'label', x: x + 3, y: H - 5, 'font-size': 11 }, svg).textContent = y;
    }
    LANES.forEach((l, j) => {
      const y = top + j * laneH + laneH / 2;
      el('line', { x1: left, x2: W - right, y1: y, y2: y, stroke: css('--rule'), 'stroke-dasharray': '2 3' }, svg);
      if (!narrow) el('text', { class: 'label', x: left - 8, y: y + 4, 'text-anchor': 'end', 'font-size': 11.5 }, svg).textContent = l.label;
      else el('text', { class: 'label rel-lane', x: left + 2, y: y - 7, 'font-size': 10 }, svg).textContent = l.label;
    });
    pts = ev.map((e, i) => {
      const j = LANES.findIndex((l) => l.k === e.k);
      const x = sx(e.t), y = top + j * laneH + laneH / 2;
      const r = e.k === 'other' ? (narrow ? 2.8 : 2.4) : narrow ? 3.2 : 4;
      const node = e.k === 'tag'
        ? el('rect', { x: x - r, y: y - r, width: 2 * r, height: 2 * r, transform: `rotate(45 ${x} ${y})`, fill: KIND[e.k].color, class: 'rel-pt' }, svg)
        : el('circle', { cx: x, cy: y, r, fill: KIND[e.k].color, 'fill-opacity': e.k === 'other' ? 0.45 : 0.9, class: 'rel-pt' }, svg);
      return { i, x, y, node };
    });
    const pick = (ev2) => {
      const b = svg.getBoundingClientRect();
      const px = ev2.clientX - b.left, py = ev2.clientY - b.top;
      let best = null, bd = Infinity;
      for (const p of pts) {
        const d = (p.x - px) ** 2 + 4 * (p.y - py) ** 2;
        if (d < bd) { bd = d; best = p; }
      }
      return bd < 900 ? best : null;
    };
    svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { const p = pick(e); if (p) mark(p.i); } });
    svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mark(ev.indexOf(tests[sel])); });
    svg.addEventListener('pointerdown', (e) => {
      const p = pick(e);
      if (!p) return;
      const k = tests.indexOf(ev[p.i]);
      if (k >= 0) sel = k;
      mark(p.i);
    });
    mark(ev.indexOf(tests[sel]));
  }
  const step = (d) => { sel = Math.min(Math.max(sel + d, 0), tests.length - 1); mark(ev.indexOf(tests[sel])); };
  document.getElementById('rel-prev').onclick = () => step(-1);
  document.getElementById('rel-next').onclick = () => step(1);
  new ResizeObserver(() => draw()).observe(host);
}

// ---------------------------------------------------------------- the pretest checks
{
  const P = data.pretest;
  const rates = Object.entries(P.rates).map(([t, hz]) => `<code>${t.replace('/zed_node/rgb/image_rect_color/compressed', ' … compressed')}</code> ${hz}`).join(', ');
  const D = {
    R1: 'No submodule checked out away from its pin, nothing uncommitted, in release or any submodule.',
    R2: 'The release commit and every commit it pins are on the GitHub remote.',
    R3: 'An rsync dry run finds no deployed file that differs from release, and the Orin built after its last copy. On FAIL it prints the deploy commands for a person.',
    R4: 'WARN if apt installed or upgraded anything on the Orin or op-top in the last 3 days.',
    R5: '<code>checkBT</code> parses every tree. It rewrites the files as it goes, so the tool snapshots the trees folder and restores it.',
    R6: 'Only with <code>--with-tests</code>: <code>colcon test</code> for riptide_mpc, riptide_mapping2 and riptide_autonomy2.',
    B0: 'A person confirms the O-ring sealing surfaces inside both lids are clean.',
    B1: 'SSH works, the launcher answers, the ROS graph is visible. WARN if op-top and Orin clocks differ by more than 50 ms.',
    B2: '<code>talos_launch_bench_mpc.yaml</code> is loaded; any stopped bench launch is started (sensors and perception only). WARN if <code>control_system</code> is running.',
    B3: 'Every board reports on <code>state/firmware</code> with no faults: POAC, both ESC boards, camera cage, LED, IVC, and both battery housings with <code>--power battery</code>. Debug firmware warns; versions are only shown.',
    B4: `Rails in range: 15 V rail 14.7–16.0 V, 5 V 4.7–5.7 V, 3.3 V 3.2–3.4 V. On batteries, the bus at least ${P.battery_min_v} V.`,
    B5: `Minimum rates in Hz, one topic at a time for 5 s: ${rates}.`,
    B6: 'Information only: <code>state/kill</code>, the physical switch, and who is asserting a software kill.',
    B7: 'All 8 ESCs online. <code>disabled_flags</code> may only hold the bits expected while disabled: <code>SAFETY_KILLED</code> and the stale-RPM bits.',
    B8: 'The deployed <code>mpc.yaml</code> has <code>table_mode</code> off and hardware output on, and <code>can0</code> is up. Then it starts the MPC under a held kill on slot 3, only after both ESC boards report <code>SAFETY_KILLED</code>, checks its params and log, and stops it.',
    B9: `Hands off for ${P.drift.window_s} s: odometry drifts less than ${P.drift.max_linear_m_per_hr} m/h and ${P.drift.max_yaw_deg_per_min}°/min in yaw.`,
    B10: `Mean gyro rate over the same window. WARN above ${P.gyro_warn_deg_s}°/s, with the tare command for a person. Never tares.`,
    B11: 'Every frame resolves from <code>talos/base_link</code>: world, odom, IMU, DVL, pressure sensor, both cameras, all 8 thrusters.',
    B12: `Reads the DVL's settings page (a read-only GET) and compares 15 fields with the recorded ones, e.g. sound speed ${P.dvl.dvlCalculateSoundSpeed} at ${P.dvl.dvlSpeedOfSound} m/s, salinity ${P.dvl.dvlSalinity}.`,
    B13: 'Saves one frame from each camera into the report.',
    G0: 'Bench launches running; a person confirms Talos is on its stand, thrusters clear, someone at the kill switch. Fingerprints the code for G7.',
    G1: 'Tilt about 10° starboard, 10° nose down, turn about 20° left: the right axis moves at least 6° with the right sign. A finger on the depth sensor reads at least 1 cm deeper.',
    G2: 'A torpedo prop held 1–2 m in front of the front camera is detected and <code>mapping/torpedo</code> updates. The mapping target is set and restored.',
    G3: 'With <code>--apriltag</code>: the tag frame appears in TF, then the Mapping panel\'s calibration action succeeds.',
    G4: 'Enable, Enter, one cycle 0–7: in each 3 s window only that thruster\'s ESC turns. Then the physical kill stops everything within 1 s. Always ended with SIGINT.',
    G5: 'Arms the actuators (they only arm while enabled; the controller stays off), fires the torpedo and dropper after asking, then disarms.',
    G6: 'Sign-offs: procedures dry-run, PVT passed, green subconn cover on, team told hands off.',
    G7: 'The release checkout and the deployed code haven\'t changed since G0.',
    S0: 'Planned: its own ROS domain, localhost only, so the sim can\'t reach the robot.',
    S1: 'Planned: start Nereus with the stack, viewer and cameras.',
    S2: 'Planned: wait for the clock, odometry, the MPC and detections.',
    S3: 'Planned: mapping sees the props the scenario puts in view, so a perception failure isn\'t blamed on a tree.',
    S4: 'Planned: hold two depths and headings, compare truth with the EKF.',
    S5: 'Planned: each chosen tree from a fresh sim: result, time, score.',
    D1: 'Planned: the deployed code is the commit that passed.',
    D2: 'Planned: the same boards and sensors are present.',
    D3: 'Planned: controller basics, table mode off.',
  };
  const STAGES = [['all', 'All'], ['repo', 'repo'], ['bench', 'bench'], ['guided', 'guided'], ['planned', 'planned']];
  const pickEl = document.getElementById('chk-pick');
  const list = document.getElementById('chk-list');
  let cur = 'bench';
  const render = () => {
    const ORDER = ['repo', 'bench', 'guided', 'sim', 'dayof'];
    const rows = P.checks.filter((c) => cur === 'all' || (cur === 'planned' ? !c.built : c.built && c.stage === cur))
      .sort((x, y) => ORDER.indexOf(x.stage) - ORDER.indexOf(y.stage));
    list.innerHTML = rows.map((c) => `<div class="chk${c.built ? '' : ' planned'}"><span class="id">${c.id}</span><div><b>${esc(c.title)}</b> <span class="st">${c.stage}</span><p>${D[c.id] || ''}</p></div></div>`).join('');
  };
  for (const [k, label] of STAGES) {
    const b = h('button', null, label);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(k === cur));
    b.onclick = () => { cur = k; pickEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); render(); };
    pickEl.appendChild(b);
  }
  render();
}

// ---------------------------------------------------------------- the thruster test
{
  const TH = data.thrusters, TT = data.thruster_test;
  const N = TH.length, WIN = TT.window_s * 1000, ESC_DELAY = 5000;
  const svg = document.getElementById('tt-svg');
  const term = document.getElementById('tt-term');
  const stateEl = document.getElementById('tt-state');
  const acts = document.getElementById('tt-actions');
  const note = document.getElementById('tt-note');
  const DIR = { V: 'a vector thruster, pointing forward (surge, yaw and pitch)', H: 'a heave thruster, angled at 45° (sway, heave and roll)' };
  const describe = (t) => {
    const [d, v, s] = t.name;
    return `<b>${t.name}, thruster ${t.i}</b>: ${v === 'U' ? 'upper' : 'lower'} ${s === 'P' ? 'port' : 'starboard'}, ${DIR[d]}. ESC board ${t.i < 4 ? 0 : 1}.`;
  };

  // geometry: rear view, screen x = -y (starboard on the right), screen y = -z
  const ys = TH.map((t) => -t.pos[1]), zs = TH.map((t) => -t.pos[2]);
  const pad = 0.12;
  const minX = Math.min(...ys) - pad, maxX = Math.max(...ys) + pad, minY = Math.min(...zs) - pad, maxY = Math.max(...zs) + pad;
  const S = 400 / (maxX - minX);
  const VW = 400, VH = Math.round((maxY - minY) * S) + 40;
  svg.setAttribute('viewBox', `0 0 ${VW} ${VH}`);
  const P = (x, y) => [(x - minX) * S, (y - minY) * S + 14];
  // hull outline (schematic): a box spanning the thruster cluster
  const [hx0, hy0] = P(-0.24, -0.16), [hx1, hy1] = P(0.3, 0.16);
  el('rect', { x: hx0, y: hy0, width: hx1 - hx0, height: hy1 - hy0, rx: 26, fill: css('--paper-3'), stroke: css('--rule') }, svg);
  const midY = (hy0 + hy1) / 2;
  el('text', { x: 4, y: midY + 4, 'font-size': 12, fill: css('--muted'), class: 'label' }, svg).textContent = 'port';
  el('text', { x: VW - 4, y: midY + 4, 'font-size': 12, fill: css('--muted'), 'text-anchor': 'end', class: 'label' }, svg).textContent = 'starboard';
  el('text', { x: VW / 2, y: VH - 6, 'font-size': 11.5, fill: css('--muted'), 'text-anchor': 'middle', class: 'label' }, svg).textContent = 'seen from behind';
  const nodes = TH.map((t, i) => {
    const [cx, cy] = P(ys[i], zs[i]);
    const g = el('g', { class: 'tt-th', tabindex: 0, role: 'button', 'aria-label': `${t.name}, thruster ${t.i}` }, svg);
    if (t.name[0] === 'V') {
      el('circle', { cx, cy, r: 30, class: 'tt-duct' }, g);
    } else {
      // angled thruster: draw its duct along its axis projected on the rear view
      const ax = -t.axis[1], ay = -t.axis[2];
      const ang = (Math.atan2(ay, ax) * 180) / Math.PI;
      el('rect', { x: cx - 30, y: cy - 13, width: 60, height: 26, rx: 12, class: 'tt-duct', transform: `rotate(${ang} ${cx} ${cy})` }, g);
    }
    const rot = el('g', { class: 'tt-prop', style: `transform-origin:${cx}px ${cy}px` }, g);
    for (let k = 0; k < 3; k++) el('ellipse', { cx, cy: cy - 10, rx: 4.5, ry: 10, transform: `rotate(${k * 120} ${cx} ${cy})` }, rot);
    el('circle', { cx, cy, r: 3.5, class: 'tt-hub' }, g);
    const below = zs[i] > 0, portSide = cx < VW / 2;
    const lab = t.name[0] === 'V'
      ? { x: cx, y: cy + (below ? 48 : -38), 'text-anchor': 'middle' }
      : { x: cx + (portSide ? 34 : -34), y: cy + 5, 'text-anchor': portSide ? 'start' : 'end' };
    el('text', { ...lab, class: 'tt-name' }, g).textContent = `${t.i} ${t.name}`;
    const show = () => { note.innerHTML = describe(t); nodes.forEach((n) => n.g.classList.toggle('sel', n.g === g)); };
    g.addEventListener('pointerdown', show);
    g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
    return { g, t };
  });
  note.innerHTML = 'Tap a thruster for its name. Names, from the naming comment in <code>talos.yaml</code>: H (heave, angled 45°) or V (vector, pointing forward), then Upper/Lower, then Port/Starboard.';

  // state machine
  const st = { running: false, start: 0, sw: true, viewer: false, power: 0, done: false, lastIdx: -1, pulledAfterCycle: false, cycles: 0 };
  const lines = [];
  const say = (s, cls = '') => { lines.push(`<span class="${cls}">${esc(s)}</span>`); while (lines.length > 9) lines.shift(); term.innerHTML = lines.join('\n'); };
  const killed = () => !st.sw || !st.viewer;
  const escReady = (now) => !killed() && st.power && now - st.power >= ESC_DELAY;
  const B = {};
  const mk = (id, label, fn, primary) => { const b = h('button', `btn${primary ? ' primary' : ''}`, label); b.type = 'button'; b.onclick = fn; acts.appendChild(b); B[id] = b; };
  mk('run', '1 · Run the test', () => {
    st.running = true; st.start = performance.now(); st.lastIdx = -1;
    say('ros@orin2:~$ ros2 run riptide_controllers2 thruster_test_canbus', 'cmd');
    tick();
  }, true);
  mk('enable', '2 · Enable in the viewer', () => { st.viewer = true; if (st.sw) st.power = performance.now(); tick(); });
  mk('pull', '3 · Pull the kill switch', () => { st.sw = false; st.power = 0; tick(); });
  mk('stop', '4 · Ctrl-C', () => { st.running = false; st.done = true; say('^C ' + TT.lines.stop, 'stop'); tick(); });
  mk('reset', 'Reset', () => { Object.assign(st, { running: false, start: 0, sw: true, viewer: false, power: 0, done: false, lastIdx: -1, cycles: 0 }); lines.length = 0; term.innerHTML = '<span class="dim">Controller stopped in the launcher. Viewer: killed. Switch: in.</span>'; tick(); });
  B.reset.classList.add('ghost');

  function tick() {
    const now = performance.now();
    let idx = -1;
    if (st.running) {
      idx = Math.floor((now - st.start) / WIN) % N;
      const cyc = Math.floor((now - st.start) / WIN);
      if (cyc !== st.lastIdx) {
        st.lastIdx = cyc;
        say(`${TT.lines.testing}${idx}...`);
        if (cyc === 0) say(TT.lines.init); // printed by the first send_thruster_cmd_canbus call, after the printf
      }
    }
    const spinning = st.running && escReady(now) ? idx : -1;
    nodes.forEach((n, i) => { n.g.classList.toggle('spin', i === spinning); n.g.classList.toggle('cur', st.running && i === idx); });
    const delayLeft = st.power && !killed() ? Math.max(0, ESC_DELAY - (now - st.power)) : 0;
    const escTxt = killed() ? 'no power (killed)' : delayLeft > 0 ? `power-on delay ${(delayLeft / 1000).toFixed(1)} s` : 'ready';
    stateEl.innerHTML = `<span class="${st.sw ? 'ok' : 'bad'}">switch <b>${st.sw ? 'in' : 'out'}</b></span>`
      + `<span class="${st.viewer ? 'ok' : 'bad'}">viewer <b>${st.viewer ? 'enabled' : 'KILL'}</b></span>`
      + `<span class="${escReady(now) ? 'ok' : killed() ? 'bad' : 'wait'}">ESCs <b>${escTxt}</b></span>`
      + `<span>${spinning >= 0 ? `spinning <b>${TH[spinning].name}</b> at ${TT.rpm} rpm` : st.running ? '<b>nothing spinning</b>' : st.done ? 'test stopped' : 'test not running'}</span>`;
    B.run.disabled = st.running || st.done;
    B.enable.disabled = st.viewer || !st.running;
    B.pull.disabled = !st.sw || !st.viewer;
    B.stop.disabled = !st.running;
    if (st.running || delayLeft > 0) requestAnimationFrame(tick);
  }
  B.reset.onclick();
  addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

// ---------------------------------------------------------------- the operator's screen
{
  // Positions in the 1480 x 940 screenshot. What each control does: nereus docs/viewer.md.
  const SPOTS = [
    [176, 62, 'KILL / Enable', 'One button, also at the top of the Motion panel. The viewer starts on KILL; Enable clears slot 1 and latches, so Talos keeps running if the tether comes off.'],
    [856, 62, 'Health chips', '<code>FOG</code> temperature (amber at 55 °C), <code>DVL</code> bottom lock, <code>CPU</code> temperature (only with the diagnostics launch, no longer started), <code>PORT</code> and <code>STBD</code> battery charge (amber below 50 %, red below 20 %). A red <code>BAG</code> chip appears while a bag records.'],
    [1279, 62, 'Edit map', 'Ctrl+M. Moves the props in riptide_mapping\'s prior map to where they are in this pool.'],
    [516, 18, 'Search, Ctrl+P', 'Typed moves (<code>forward 0.5</code>, <code>turn 30</code>) and plots (<code>plot disturbance</code>).'],
    [370, 207, 'Motion', 'Actual, commanded and error per axis. Watch the error column on the first small moves.'],
    [391, 512, 'Dive in place', 'Holds the current x, y and heading, level, at the configured depth. The first thing to send after Enable.'],
    [97, 664, 'Mapping', '<strong>Calibrate</strong> on the AprilTag sets <code>world → map</code>; Lock map picks the mapping target.'],
    [282, 664, 'Autonomy', 'Pick a tree, Start, Stop. Manual commands are blocked while a tree runs.'],
    [990, 300, 'Pool view', 'Talos drawn from its own localization estimate, here in front of the AprilTag board.'],
    [1330, 102, 'Cameras', 'Forward and downward ZED streams. Check for fog or bubbles on the lens.'],
    [1242, 684, 'Recording, Bagging', 'SVO video on the robot; <code>ros2 bag record</code> on the robot or on op-top.'],
    [1398, 684, 'Electrical, Actuators', 'Power commands, mag cal, gyro tare; arm, fire torpedoes, drop markers.'],
  ];
  const wrap = document.getElementById('vw');
  const key = document.getElementById('vw-key');
  const img = wrap.querySelector('img');
  const IW = 1480, IH = 940, CROP = 520; // source px shown across the loupe
  // On a phone the full screenshot is ~350 px wide and unreadable: a tapped spot is shown enlarged below it.
  const loupe = h('div', 'vw-loupe', '<div class="vw-crop"><span class="vw-ring"></span></div><p></p>');
  loupe.setAttribute('aria-live', 'polite');
  wrap.after(loupe);
  const crop = loupe.querySelector('.vw-crop'), ring = loupe.querySelector('.vw-ring'), cap = loupe.querySelector('p');
  const showLoupe = (k) => {
    const [x, y, title, text] = SPOTS[k];
    loupe.classList.add('on');
    const lw = crop.clientWidth, lh = crop.clientHeight;
    if (!lw) return;
    const sc = lw / CROP, ch = lh / sc;
    const left = Math.min(Math.max(x - CROP / 2, 0), IW - CROP), top = Math.min(Math.max(y - ch / 2, 0), IH - ch);
    crop.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    crop.style.backgroundSize = `${IW * sc}px ${IH * sc}px`;
    crop.style.backgroundPosition = `${-left * sc}px ${-top * sc}px`;
    ring.style.left = `${(x - left) * sc}px`;
    ring.style.top = `${(y - top) * sc}px`;
    cap.innerHTML = `<b>${k + 1} · ${title}.</b> ${text}`;
  };
  const narrow = () => matchMedia('(max-width: 560px)').matches;
  const items = [];
  const pick = (k) => {
    items.forEach(([b, li], j) => { b.classList.toggle('on', j === k); li.classList.toggle('on', j === k); });
    if (narrow()) showLoupe(k);
  };
  SPOTS.forEach(([x, y, title, text], k) => {
    const b = h('button', 'vw-spot', String(k + 1));
    b.type = 'button';
    b.style.left = `${(100 * x) / 1480}%`;
    b.style.top = `${(100 * y) / 940}%`;
    b.setAttribute('aria-label', `${k + 1}: ${title}`);
    const li = h('li', null, `<b>${title}.</b> ${text}`);
    li.value = k + 1;
    b.addEventListener('click', () => { pick(k); if (!narrow()) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(k); });
    li.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(k); });
    li.addEventListener('click', () => { pick(k); if (narrow()) wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    wrap.appendChild(b);
    key.appendChild(li);
    items.push([b, li]);
  });
}

// ---------------------------------------------------------------- the first eight seconds after the switch goes in
{
  const host = document.getElementById('start-strip');
  const rows = [
    { label: 'state/kill', segs: [[-1, 0, 'killed', 'bad'], [0, 8, 'false', 'ok']] },
    { label: 'ESCs', segs: [[-1, 0, 'no power', 'bad'], [0, 5, 'power-on delay', 'wait'], [5, 8, 'ready', 'ok']] },
    { label: 'Tree', segs: [[-1, 0, 'polling', 'wait'], [0, 1, 'wait 1 s', 'wait'], [1, 6, 'starting in 5 s', 'wait'], [6, 8, 'moving', 'go']] },
  ];
  const fill = { bad: '#f3d6ca', wait: css('--paper-3'), ok: '#d3ebe1', go: css('--accent') };
  const draw = () => {
    const W = Math.max(280, host.clientWidth || 600);
    const narrow = W < 480, fs = narrow ? 10.5 : 11.5;
    const left = narrow ? 62 : 92, right = 10, rowH = 34, top = 6;
    const H = top + rows.length * rowH + 32;
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart strip-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Timeline of the eight seconds after the kill switch is inserted' }, host);
    const sx = (t) => left + ((t + 1) / 9) * (W - left - right);
    rows.forEach((r, j) => {
      const y = top + j * rowH;
      el('text', { class: 'label', x: left - 8, y: y + rowH / 2 + 1, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': fs }, svg).textContent = r.label;
      for (const [a, b, text, k] of r.segs) {
        const w = sx(b) - sx(a) - 2;
        el('rect', { x: sx(a) + 1, y: y + 5, width: w, height: rowH - 10, rx: 4, fill: fill[k] }, svg);
        if (text.length * fs * 0.56 > w - 4) continue; // no room on a narrow screen
        el('text', { class: 'label', x: (sx(a) + sx(b)) / 2, y: y + rowH / 2 + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, style: `fill:${k === 'go' ? '#fff' : css('--ink')}` }, svg).textContent = text;
      }
    });
    const yb = top + rows.length * rowH;
    for (let t = 0; t <= 8; t += narrow ? 2 : 1) {
      el('line', { x1: sx(t), x2: sx(t), y1: yb, y2: yb + 4, stroke: css('--muted') }, svg);
      el('text', { class: 'label', x: sx(t), y: yb + 16, 'text-anchor': 'middle', 'font-size': fs }, svg).textContent = `${t} s`;
    }
    el('line', { x1: sx(0), x2: sx(0), y1: top, y2: yb, stroke: css('--ink'), 'stroke-width': 1.5 }, svg);
    el('text', { class: 'label', x: sx(0) - 4, y: yb + 29, 'text-anchor': 'end', 'font-size': fs, style: `fill:${css('--accent')}` }, svg).textContent = 'switch in';
  };
  new ResizeObserver(draw).observe(host);
}

// ---------------------------------------------------------------- tethered vs untethered
{
  const T = data.tether;
  const host = document.getElementById('tether');
  const items = [
    ['Net buoyancy', 'net_buoyancy_N', 'N', 2],
    ['COB forward of COM', 'cob_x_mm', 'mm', 1],
    ['Leftover force (RMS)', 'res_force_N', 'N', 2],
    ['Leftover torque (RMS)', 'res_torque_Nm', 'N·m', 2],
  ];
  for (const [title, key, unit, digits] of items) {
    const box = h('div', 'tether-item');
    box.appendChild(h('div', 'tether-title', title));
    const c = h('div');
    box.appendChild(c);
    host.appendChild(box);
    barChart(c, [
      { label: 'tethered', unit: ' ' + unit, segments: [{ value: T.tethered[key], color: css('--s8'), name: 'tethered' }] },
      { label: 'untethered', unit: ' ' + unit, segments: [{ value: T.untethered[key], color: css('--state'), name: 'untethered' }] },
    ], { width: 320, rowH: 26, digits, labelW: 84, valueW: 78 });
  }
}

// ---------------------------------------------------------------- the checklist
{
  const KEY = 'talos-explained:pool-test-checklist';
  const G = data.checklist;
  const host = document.getElementById('pool-checklist');
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { done = {}; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* private mode */ } };
  const all = G.flatMap((p) => p.steps.map((s) => s.id));
  const head = h('div', 'pc-head');
  const bar = h('div', 'pc-bar', '<div class="pc-fill"></div><span class="pc-count"></span>');
  const tools = h('div', 'pc-tools');
  const openAll = h('button', 'btn', 'Open all'); openAll.type = 'button';
  const clear = h('button', 'btn', 'New test'); clear.type = 'button';
  tools.append(openAll, clear);
  head.append(bar, tools);
  host.appendChild(head);
  const nav = h('nav', 'pc-phases');
  nav.setAttribute('aria-label', 'Checklist phases');
  host.appendChild(nav);

  const link = (href, label) => `<a href="${href}">${esc(label)}</a>`;
  const phaseEls = [];
  G.forEach((p, pi) => {
    const sec = h('section', 'pc-phase');
    sec.id = `pc-${p.id}`;
    const title = h('div', 'pc-group', `<span class="n">${pi + 1}</span>${esc(p.title)}<span class="pc-pcount"></span>`);
    sec.appendChild(title);
    const ol = h('ol', 'pc');
    for (const s of p.steps) {
      const li = h('li');
      li.dataset.id = s.id;
      if (s.safety) li.classList.add('safety');
      const tags = `${s.safety ? '<span class="pc-tag safe">safety</span>' : ''}${s.checks ? `<span class="pc-tag ids">${esc(s.checks)}</span>` : ''}`;
      const body = [];
      if (s.why) body.push(`<p>${s.why}</p>`);
      if (s.id === 'packlist') body.push(document.getElementById('pack-list').outerHTML.replace('id="pack-list"', ''));
      if (s.cmd) body.push(`<pre class="cmd"${s.where ? ` data-where="${esc(s.where)}"` : ''}><code>${esc(s.cmd)}</code></pre>`);
      if (s.refs) body.push(`<p class="pc-refs">${s.refs.map(([href, label]) => link(href, label)).join(' · ')}</p>`);
      li.innerHTML = `<input type="checkbox" id="pc-${s.id}" aria-label="Done: ${esc(s.t)}"><details><summary><span class="t">${esc(s.t)}</span>${tags}</summary><div class="pc-body">${body.join('')}</div></details>`;
      const box = li.querySelector('input');
      box.checked = !!done[s.id];
      li.classList.toggle('done', box.checked);
      box.onchange = () => { done[s.id] = box.checked; li.classList.toggle('done', box.checked); save(); count(); };
      ol.appendChild(li);
    }
    sec.appendChild(ol);
    host.appendChild(sec);
    const a = h('a', null, `<span class="pc-dot"></span>${esc(p.title)}`);
    a.href = `#pc-${p.id}`;
    nav.appendChild(a);
    phaseEls.push({ p, sec, a, title });
  });

  function count() {
    const n = all.filter((id) => done[id]).length;
    bar.querySelector('.pc-fill').style.width = `${(100 * n) / all.length}%`;
    bar.querySelector('.pc-count').textContent = n === all.length ? `All ${all.length} done. Good test.` : `${n} of ${all.length} done`;
    for (const { p, a, title } of phaseEls) {
      const k = p.steps.filter((s) => done[s.id]).length;
      title.querySelector('.pc-pcount').textContent = `${k}/${p.steps.length}`;
      a.classList.toggle('full', k === p.steps.length);
      a.classList.toggle('part', k > 0 && k < p.steps.length);
    }
  }
  openAll.onclick = () => {
    const ds = [...host.querySelectorAll('details')];
    const open = !ds.every((d) => d.open);
    ds.forEach((d) => (d.open = open));
    openAll.textContent = open ? 'Close all' : 'Open all';
  };
  let armed = 0;
  clear.onclick = () => {
    if (!Object.values(done).some(Boolean)) return;
    if (Date.now() - armed > 3000) { armed = Date.now(); clear.textContent = 'Tap again to clear'; setTimeout(() => (clear.textContent = 'New test'), 3000); return; }
    done = {};
    save();
    host.querySelectorAll('ol.pc input').forEach((b) => { b.checked = false; b.closest('li').classList.remove('done'); });
    clear.textContent = 'New test';
    count();
  };
  count();
}

