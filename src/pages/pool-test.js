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
// A year x month grid of release commits that say they were made before a test. Tap a month for its commits.
{
  const KINDS = { pre: 'before a test', post: 'after a test', lake: 'lake test', comp: 'RoboSub', tag: 'tag' };
  const isPre = (c) => c.k === 'pre' || (c.k === 'lake' && /^pre/i.test(c.s));
  const ev = [
    ...data.release.commits.filter((c) => c.k !== 'other'),
    ...data.release.tags.map((g) => ({ k: 'tag', d: g.d, h: g.h, s: g.name })),
  ].sort((x, y) => (x.d < y.d ? -1 : x.d > y.d ? 1 : 0));
  const Y0 = 2023, Y1 = 2026;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const months = new Map(); // 'YYYY-MM' -> events
  for (const e of ev) {
    const k = e.d.slice(0, 7);
    if (+k.slice(0, 4) < Y0) continue;
    if (!months.has(k)) months.set(k, []);
    months.get(k).push(e);
  }
  const active = [...months.keys()].sort();
  const grid = document.getElementById('rel-grid');
  const out = document.getElementById('rel-month');
  const shade = (n) => (n === 0 ? 'var(--paper)' : `color-mix(in srgb, var(--accent) ${[0, 28, 52, 76, 100][Math.min(n, 4)]}%, var(--paper))`);
  const cells = new Map();
  grid.appendChild(h('span', 'rel-corner'));
  MON.forEach((m) => grid.appendChild(h('span', 'rel-mh', m[0])));
  for (let y = Y1; y >= Y0; y--) {
    grid.appendChild(h('span', 'rel-yr', String(y)));
    for (let m = 1; m <= 12; m++) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      const es = months.get(k) || [];
      const n = es.filter(isPre).length;
      const tag = es.some((e) => e.k === 'tag'), comp = es.some((e) => e.k === 'comp');
      const c = h('button', `rel-cell${comp ? ' comp' : ''}${n >= 3 ? ' dark' : ''}`, `${n || ''}${tag ? '<i class="rel-tag" aria-hidden="true"></i>' : ''}`);
      c.type = 'button';
      c.style.background = shade(n);
      c.disabled = !es.length;
      c.setAttribute('aria-label', `${MON[m - 1]} ${y}: ${n} before a test${tag ? ', tagged' : ''}${comp ? ', RoboSub' : ''}`);
      c.onclick = () => show(k);
      grid.appendChild(c);
      cells.set(k, c);
    }
  }
  let cur = active[active.length - 1];
  function show(k) {
    cur = k;
    cells.forEach((c, key) => c.classList.toggle('on', key === k));
    const es = months.get(k) || [];
    const [y, m] = k.split('-');
    const n = es.filter(isPre).length;
    out.innerHTML = `<b class="rel-mt">${MON[+m - 1]} ${y}</b> <span class="rel-mn">${n} before a test</span><ul>${es.map((e) => {
      const link = e.k === 'tag' ? `${REL}/releases/tag/${encodeURIComponent(e.s)}` : `${REL}/commit/${e.h}`;
      const what = e.k === 'tag' ? `tag <code>${esc(e.s)}</code>` : esc(e.s);
      return `<li class="k-${e.k}"><span class="rel-d">${+e.d.slice(8)} ${MON[+m - 1]}</span><span class="rel-s">${what}</span><span class="rel-k">${KINDS[e.k]} · <a href="${link}"><code>${e.h}</code></a></span></li>`;
    }).join('')}</ul>`;
    document.getElementById('rel-prev').disabled = active.indexOf(k) <= 0;
    document.getElementById('rel-next').disabled = active.indexOf(k) >= active.length - 1;
  }
  const step = (d) => show(active[Math.min(Math.max(active.indexOf(cur) + d, 0), active.length - 1)]);
  document.getElementById('rel-prev').onclick = () => step(-1);
  document.getElementById('rel-next').onclick = () => step(1);
  const nPre = ev.filter(isPre).length, nTag = ev.filter((e) => e.k === 'tag').length;
  document.getElementById('rel-key').innerHTML =
    `<span class="rel-ramp"><i style="background:${shade(1)}"></i><i style="background:${shade(2)}"></i><i style="background:${shade(3)}"></i><i style="background:${shade(4)}"></i> 1, 2, 3, 4+ commits before a test (${nPre} in all)</span>`
    + `<span><i class="rel-tag"></i> a tag (${nTag})</span><span><i class="rel-comp"></i> RoboSub</span><span><i class="rel-none"></i> nothing to open</span>`;
  show(cur);
}

// ---------------------------------------------------------------- the pretest checks
{
  const P = data.pretest;
  const short = (t) => t.replace('/zed_node/rgb/image_rect_color/compressed', ' camera').replace('yolo_orientation/annotated/compressed', 'yolo_orientation/annotated');
  const rates = Object.entries(P.rates).map(([t, hz]) => `<code>${short(t)}</code> ${hz}`).join(', ');
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
    B3: 'Every board reports on <code>state/firmware</code> with no faults: POAC, both ESC boards, camera cage, LED, IVC, and with <code>--power battery</code> both battery housings (missing for now: <a href="#can1">can1</a>). Debug firmware warns; versions are only shown.',
    B4: `Rails in range: 15 V rail 14.7–16.0 V, 5 V 4.7–5.7 V, 3.3 V 3.2–3.4 V. On batteries, the bus at least ${P.battery_min_v} V.`,
    B5: `Minimum rates in Hz, one topic at a time for 5 s: ${rates}.`,
    B6: 'Information only: <code>state/kill</code>, the kill switch, and who is asserting a software kill.',
    B7: 'All 8 ESCs online. Their <code>disabled_flags</code> (why a thruster won\'t turn) may only hold the bits expected while killed: <code>SAFETY_KILLED</code> and the stale-RPM bits.',
    B8: 'The deployed <code>mpc.yaml</code> has <code>table_mode</code> off and hardware output on, and <code>can0</code> is up. Then it starts the MPC under a held kill on slot 3, only after both ESC boards report <code>SAFETY_KILLED</code>, checks its params and log, and stops it.',
    B9: `Hands off for ${P.drift.window_s} s: odometry drifts less than ${P.drift.max_linear_m_per_hr} m/h and ${P.drift.max_yaw_deg_per_min}°/min in yaw.`,
    B10: `Mean gyro rate over the same window. WARN above ${P.gyro_warn_deg_s}°/s, with the tare command for a person. Never tares.`,
    B11: 'Every frame resolves from <code>talos/base_link</code>: world, odom, IMU, DVL, pressure sensor, both cameras, all 8 thrusters.',
    B12: `Reads the DVL's settings page (a read-only GET) and compares 15 fields with the recorded ones, e.g. sound speed ${P.dvl.dvlCalculateSoundSpeed} at ${P.dvl.dvlSpeedOfSound} m/s, salinity ${P.dvl.dvlSalinity}.`,
    B13: 'Saves one frame from each camera into the report, so a person can spot a fogged, covered or swapped camera.',
    G0: 'Bench launches running; a person confirms Talos is on its stand, thrusters clear, someone at the kill switch. Fingerprints the code for G7.',
    G1: 'Tilt about 10° starboard, 10° nose down, turn about 20° left: the right axis moves at least 6° with the right sign. A finger on the depth sensor reads at least 1 cm deeper.',
    G2: 'A torpedo prop held 1–2 m in front of the front camera is detected and <code>mapping/torpedo</code> updates. The <a href="glossary.html#term-mapping-target">mapping target</a> is set and restored.',
    G3: 'With <code>--apriltag</code>: the tag frame appears in TF, then the Mapping panel\'s calibration action succeeds.',
    G4: 'Enable, Enter, one cycle 0–7: in each 3 s window only that thruster\'s ESC turns. Then pulling the kill switch stops everything within 1 s. Always ended with SIGINT.',
    G5: 'Arms the actuators (they only arm while enabled; the controller stays off), fires the torpedo and dropper after asking, then disarms.',
    G6: 'Sign-offs: procedures dry-run, PVT passed, green SubConn cover on, team told hands off.',
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
  const STAGES = [
    ['repo', 'repo', '<b>op-top, once the code is final.</b> Pins, pushed, the Orin runs this code, recent updates, trees parse.'],
    ['bench', 'bench', '<b>Talos on the bench, on a power supply.</b> Read-only: nothing moves. About five minutes.'],
    ['guided', 'guided', '<b>A person at the robot, the viewer open.</b> The tool says what to do, the person does it, the tool checks the data.'],
    ['planned', 'planned', '<b>Not built yet.</b> <code>sim</code>: the chosen trees in Nereus with the real detector, on op-top. <code>dayof</code>: at the pool, nothing changed since the last pass.'],
    ['all', 'All', '<b>Every check,</b> in the order <code>./pretest</code> runs them.'],
  ];
  const pickEl = document.getElementById('chk-pick');
  const stageEl = document.getElementById('chk-stage');
  const list = document.getElementById('chk-list');
  let cur = 'bench';
  const render = () => {
    const ORDER = ['repo', 'bench', 'guided', 'sim', 'dayof'];
    const rows = P.checks.filter((c) => cur === 'all' || (cur === 'planned' ? !c.built : c.built && c.stage === cur))
      .sort((x, y) => ORDER.indexOf(x.stage) - ORDER.indexOf(y.stage));
    const stageTag = cur === 'all' || cur === 'planned';
    stageEl.innerHTML = STAGES.find((s) => s[0] === cur)[2];
    list.innerHTML = rows.map((c) => `<details class="chk${c.built ? '' : ' planned'}"><summary><span class="id">${c.id}</span><span class="t">${esc(c.title)}</span>${stageTag ? `<span class="st">${c.stage}</span>` : ''}</summary><p>${D[c.id] || ''}</p></details>`).join('');
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
  el('text', { x: 2, y: midY + 5, class: 'tt-side-label' }, svg).textContent = 'port';
  el('text', { x: VW - 2, y: midY + 5, 'text-anchor': 'end', class: 'tt-side-label' }, svg).textContent = 'starboard';
  el('text', { x: VW / 2, y: VH - 4, 'text-anchor': 'middle', class: 'tt-side-label' }, svg).textContent = 'seen from behind';
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
  const st = { running: false, start: 0, sw: true, viewer: false, power: 0, done: false, lastIdx: -1, spun: new Set() };
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
  mk('enable', '2 · Enable in the viewer', () => { st.viewer = true; if (st.sw) st.power = performance.now(); say('# watch each thruster spin in its place; pull the handle after a full cycle, 0 to 7', 'dim'); tick(); });
  mk('pull', '3 · Pull the kill switch', () => { st.sw = false; st.power = 0; say('# handle out: ESC power cut, the program still sending', 'dim'); tick(); });
  mk('stop', '4 · Ctrl-C', () => { st.running = false; st.done = true; say('^C ' + TT.lines.stop, 'stop'); tick(); });
  mk('safe', '5 · KILL in the viewer, then handle in', () => { st.viewer = false; st.sw = true; st.power = 0; say('# viewer on KILL first, then the handle back in: safe to touch', 'dim'); tick(); });
  mk('reset', 'Reset', () => { Object.assign(st, { running: false, start: 0, sw: true, viewer: false, power: 0, done: false, lastIdx: -1, spun: new Set() }); lines.length = 0; say('# controller stopped in the launcher; viewer on KILL; handle in', 'dim'); tick(); });
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
    if (spinning >= 0) st.spun.add(spinning);
    const cycled = st.spun.size === N;
    nodes.forEach((n, i) => { n.g.classList.toggle('spin', i === spinning); n.g.classList.toggle('cur', st.running && i === idx); });
    const delayLeft = st.power && !killed() ? Math.max(0, ESC_DELAY - (now - st.power)) : 0;
    const escTxt = killed() ? 'no power (killed)' : delayLeft > 0 ? `power-on delay ${(delayLeft / 1000).toFixed(1)} s` : 'ready';
    stateEl.innerHTML = `<span class="${st.sw ? 'ok' : 'bad'}">kill switch <b>${st.sw ? 'in' : 'out'}</b></span>`
      + `<span class="${st.viewer ? 'ok' : 'bad'}">viewer <b>${st.viewer ? 'enabled' : 'KILL'}</b></span>`
      + `<span class="${escReady(now) ? 'ok' : killed() ? 'bad' : 'wait'}">ESCs <b>${escTxt}</b></span>`
      + `<span>${spinning >= 0 ? `spinning <b>${TH[spinning].name}</b> at ${TT.rpm} rpm` : st.running ? '<b>nothing spinning</b>' : st.done ? (!st.viewer && st.sw ? 'test over: <b>safe</b>' : 'test stopped') : 'test not running'}</span>`;
    B.run.disabled = st.running || st.done;
    B.enable.disabled = st.viewer || !st.running;
    B.pull.disabled = !st.sw || !st.viewer || !cycled;
    B.pull.textContent = !st.sw || cycled || !st.viewer ? '3 · Pull the kill switch' : `3 · Pull the kill switch (after the cycle: ${st.spun.size}/${N})`;
    B.stop.disabled = !st.running;
    B.safe.disabled = !st.done || (!st.viewer && st.sw);
    if (st.running || delayLeft > 0) requestAnimationFrame(tick);
  }
  B.reset.onclick();
  addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
}

// ---------------------------------------------------------------- the operator's screen
// One part of the viewer at a time: where it is on the whole screen (outlined), a 1:1 crop of it, what it's for.
{
  // [chip label, title, crop file, outlined boxes [x0, y0, x1, y1] in the 1480 x 940 screenshot, text]
  const PARTS = [
    ['Enable', 'Enable / KILL', 'kill', [[182, 42, 420, 82], [10, 124, 388, 162]],
      'One button, in the command bar and at the top of the Motion panel. The viewer opens killed (top): it holds a kill on <a href="glossary.html#term-kill-slot">slot 1</a> and the button offers <b>Enable</b>. Press it and the button becomes a red <b>KILL</b> (bottom). Enable latches, so a run survives the tether coming off; KILL only reaches Talos through the tether.'],
    ['Chips', 'Health chips', 'chips', [[866, 48, 1234, 76]],
      '<code>FOG</code> temperature (amber at 55 °C), <code>DVL</code> bottom lock, <code>CPU</code> temperature, <code>PORT</code> and <code>STBD</code> battery charge. Gray means no data: CPU needs <code>diagnostics.launch.py</code>, which isn\'t started any more, and the battery chips wait for <a href="#can1">can1</a>. A red <code>BAG</code> chip appears while a bag records.'],
    ['Motion', 'Motion', 'motion', [[0, 118, 392, 540]],
      'Actual, commanded and error per axis, in the map frame: metres, and degrees for roll, pitch and yaw. Here Talos holds 0.85 m deep, a few centimetres and about 1.4° off: a good hold. On a move the error starts large and should shrink to this. <b>Dive in place</b> is the first move after Enable (<a href="#sensors">the first dive</a>).'],
    ['Search', 'Ctrl+P and Edit map', 'search', [[528, 4, 952, 32], [1242, 45, 1318, 79]],
      'The search box takes typed moves (<code>forward 0.5</code>, <code>turn 30</code>) and plots (<code>plot disturbance</code>). <b>Edit map</b> (Ctrl+M) moves the props in the <a href="glossary.html#term-prior-map">prior map</a> to where they are in this pool.'],
    ['Map', 'Mapping', 'mapping', [[8, 652, 96, 680]],
      'The Mapping tab, under Motion (crop from the simulator). <b>Calibrate</b>, with the AprilTag in view, sets <code>world → map</code>. <b>Lock map</b> fixes the <a href="glossary.html#term-mapping-target">mapping target</a>.'],
    ['Trees', 'Autonomy', 'autonomy', [[0, 648, 290, 780]],
      'Pick a tree, <b>Start</b>, <b>Stop</b>. Start only works while the viewer holds the enable, and manual commands are blocked while a tree runs.'],
    ['Bags', 'Bagging', 'bagging', [[1166, 686, 1318, 714]],
      'Two tabs at the bottom right (crop from the simulator, so Record is grayed: no robot to reach). <b>Bagging</b> records <code>ros2 bag</code> on the robot, so the bag survives the tether; <i>Leave out</i> skips topics by pattern. <b>Recording</b> starts the cameras\' own <a href="glossary.html#term-svo2">SVO</a> video, also on the robot.'],
  ];
  const IW = 1480, IH = 940;
  const pick = document.getElementById('vw-pick');
  const mask = document.getElementById('vw-mask');
  const cropImg = document.querySelector('#vw-crop img');
  const text = document.getElementById('vw-text');
  const sizes = {};
  const show = (k) => {
    const [, label, file, boxes, body] = PARTS[k];
    pick.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
    const holes = boxes.map(([x0, y0, x1, y1]) => `M${x0 - 6} ${y0 - 6}H${x1 + 6}V${y1 + 6}H${x0 - 6}Z`).join('');
    mask.innerHTML = `<path d="M0 0H${IW}V${IH}H0Z${holes}" fill-rule="evenodd" class="vw-dim"/>`
      + boxes.map(([x0, y0, x1, y1]) => `<rect x="${x0 - 6}" y="${y0 - 6}" width="${x1 - x0 + 12}" height="${y1 - y0 + 12}" rx="8" class="vw-box"/>`).join('');
    cropImg.src = `${BASE}img/pool-test/vw-${file}.webp`;
    cropImg.alt = `The viewer's ${label}, at full size`;
    if (sizes[file]) { cropImg.width = sizes[file][0]; cropImg.height = sizes[file][1]; }
    text.innerHTML = `<b>${label}.</b> ${body}`;
  };
  // natural sizes of the crops (tools/pool-test/viewer_crops.py), so each is shown 1:1 or smaller
  Object.assign(sizes, { kill: [254, 106], chips: [232, 82], search: [248, 88], motion: [384, 422], autonomy: [290, 132], mapping: [392, 236], bagging: [410, 254] });
  PARTS.forEach(([label, title], k) => {
    const b = h('button', null, label);
    b.setAttribute('aria-label', title);
    b.type = 'button';
    b.onclick = () => show(k);
    pick.appendChild(b);
  });
  show(0);
}

// ---------------------------------------------------------------- the first seconds after the handle goes in
{
  const host = document.getElementById('start-strip');
  const rows = [
    { label: 'state/kill', segs: [[-1, 0, 'killed', 'bad'], [0, 8, 'false', 'ok']] },
    { label: 'ESCs', segs: [[-1, 0, 'no power', 'bad'], [0, 5, 'power-on delay, 5 s', 'wait'], [5, 8, 'ready', 'ok']] },
    { label: 'Tree', segs: [[-1, 0, 'polling', 'wait'], [0, 1, 'wait 1 s', 'wait'], [1, 6, '"starting in 5 seconds"', 'wait'], [6, 8, 'moves', 'go']] },
  ];
  const STEPS = [
    ['before', 'Handle out. <code>state/kill</code> is true, the ESCs have no power, and the tree polls <code>state/kill</code>.'],
    ['0 s', '<b>Handle in.</b> <code>state/kill</code> goes false; ESC power returns and the ESCs start their power-on delay.'],
    ['1 s', 'The tree has waited 1 s and logs "KILL SWITCH INSERTED, TREE STARTING IN 5 SECONDS".'],
    ['5 s', 'The ESCs are ready.'],
    ['6 s', '<b>The tree moves</b>, a second after the thrusters can turn.'],
  ];
  const mix = (v, p) => `color-mix(in srgb, var(${v}) ${p}%, var(--paper))`;
  const fill = { bad: mix('--accent', 22), wait: 'var(--paper-3)', ok: mix('--prediction', 24), go: 'var(--accent)' };
  const draw = () => {
    const W = host.clientWidth || 600;
    host.innerHTML = '';
    if (W < 520) { // phone: the same story as a list
      const ol = h('ol', 'strip-steps');
      ol.innerHTML = STEPS.map(([t, s]) => `<li><span class="t">${t}</span><span>${s}</span></li>`).join('');
      host.appendChild(ol);
      return;
    }
    const fs = 12.5, left = 86, right = 8, rowH = 38, top = 4;
    const H = top + rows.length * rowH + 40;
    const svg = el('svg', { class: 'chart strip-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Timeline of the eight seconds after the kill switch handle goes in' }, host);
    const sx = (t) => left + ((t + 1) / 9) * (W - left - right);
    rows.forEach((r, j) => {
      const y = top + j * rowH;
      el('text', { class: 'strip-t', x: left - 10, y: y + rowH / 2 + 1, 'text-anchor': 'end', 'dominant-baseline': 'middle', 'font-size': fs }, svg).textContent = r.label;
      for (const [a, b, label, k] of r.segs) {
        el('rect', { x: sx(a) + 1, y: y + 5, width: sx(b) - sx(a) - 2, height: rowH - 10, rx: 4, style: `fill:${fill[k]}` }, svg);
        el('text', { class: 'strip-t', x: (sx(a) + sx(b)) / 2, y: y + rowH / 2 + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fs, style: k === 'go' ? 'fill:var(--paper);font-weight:650' : '' }, svg).textContent = label;
      }
    });
    const yb = top + rows.length * rowH;
    for (let t = 0; t <= 8; t++) {
      el('line', { x1: sx(t), x2: sx(t), y1: yb, y2: yb + 4, stroke: css('--muted') }, svg);
      el('text', { class: 'strip-t muted', x: sx(t), y: yb + 17, 'text-anchor': 'middle', 'font-size': fs }, svg).textContent = `${t} s`;
    }
    el('line', { x1: sx(0), x2: sx(0), y1: top, y2: yb, stroke: css('--ink'), 'stroke-width': 1.5 }, svg);
    el('text', { class: 'strip-t accent', x: sx(0) - 6, y: yb + 33, 'text-anchor': 'end', 'font-size': fs }, svg).textContent = 'handle in';
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
      { label: 'tethered', unit: ' ' + unit, segments: [{ value: T.tethered[key], color: css('--muted'), name: 'tethered' }] },
      { label: 'untethered', unit: ' ' + unit, segments: [{ value: T.untethered[key], color: css('--state'), name: 'untethered' }] },
    ], { width: 320, rowH: 26, digits, labelW: 84, valueW: 78 });
  }
}

// ---------------------------------------------------------------- the checklist
// One phase at a time: the phase chips switch between them, each shows its progress; ticks persist.
{
  const KEY = 'talos-explained:pool-test-checklist';
  const PKEY = KEY + ':phase';
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
  const nav = h('div', 'pc-phases');
  nav.setAttribute('role', 'group');
  nav.setAttribute('aria-label', 'Checklist phase');
  host.appendChild(nav);

  const link = (href, label) => `<a href="${href}">${esc(label)}</a>`;
  const phaseEls = [];
  let curPhase = 0;
  const showPhase = (i, scroll) => {
    curPhase = i;
    try { localStorage.setItem(PKEY, G[i].id); } catch { /* private mode */ }
    phaseEls.forEach((e, j) => { e.sec.hidden = j !== i; e.a.setAttribute('aria-pressed', String(j === i)); });
    openAll.textContent = phaseEls[i].sec.querySelectorAll('details').length && [...phaseEls[i].sec.querySelectorAll('details')].every((d) => d.open) ? 'Close all' : 'Open all';
    if (scroll) nav.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
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
      li.innerHTML = `<label class="pc-hit"><input type="checkbox" id="pc-${s.id}" aria-label="Done: ${esc(s.t)}"></label><details><summary><span class="t">${esc(s.t)}</span>${tags}</summary><div class="pc-body">${body.join('')}</div></details>`;
      const box = li.querySelector('input');
      box.checked = !!done[s.id];
      li.classList.toggle('done', box.checked);
      box.onchange = () => { done[s.id] = box.checked; li.classList.toggle('done', box.checked); save(); count(); };
      ol.appendChild(li);
    }
    sec.appendChild(ol);
    if (pi < G.length - 1) {
      const next = h('button', 'btn pc-next', `Next: ${esc(G[pi + 1].title)} ›`);
      next.type = 'button';
      next.onclick = () => showPhase(pi + 1, true);
      sec.appendChild(next);
    }
    host.appendChild(sec);
    const a = h('button', null, `<span class="pc-dot"></span>${esc(p.short || p.title)}`);
    a.type = 'button';
    a.onclick = () => showPhase(pi);
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
      a.setAttribute('aria-label', `${p.title}: ${k} of ${p.steps.length} done`);
    }
  }
  openAll.onclick = () => {
    const ds = [...phaseEls[curPhase].sec.querySelectorAll('details')];
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
    showPhase(0);
  };
  count();
  // start on the saved phase, else the first one that isn't finished
  let saved = -1;
  try { saved = G.findIndex((p) => p.id === localStorage.getItem(PKEY)); } catch { /* private mode */ }
  const firstOpen = G.findIndex((p) => p.steps.some((s) => !done[s.id]));
  showPhase(saved >= 0 ? saved : Math.max(firstOpen, 0));
  // a link to #pc-<phase> (or a step) opens that phase
  const follow = () => { const m = location.hash.match(/^#pc-(.+)$/); if (!m) return; const i = G.findIndex((p) => p.id === m[1] || p.steps.some((s) => s.id === m[1])); if (i >= 0) showPhase(i); };
  addEventListener('hashchange', follow);
  follow();
}
