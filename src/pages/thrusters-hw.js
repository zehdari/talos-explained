import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/thrusters-hw.css';
import { Graph } from '../viz/graph.js';
import { LineChart, el, tapOutside } from '../viz/chart.js';

setup();
const BASE = import.meta.env.BASE_URL;
const $ = (s) => document.querySelector(s);
// Public images: src from BASE_URL (a root-absolute src in the HTML would get the base twice on the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });

const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const sgn = (v, d = 1) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
const AXES = ['surge', 'sway', 'heave', 'roll', 'pitch', 'yaw'];
const UNIT = ['N', 'N', 'N', 'N·m', 'N·m', 'N·m'];

// Segmented buttons: options [[value, label]], returns a setter.
function seg(host, options, value, onPick) {
  host.innerHTML = '';
  const buttons = options.map(([v, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = label;
    b.setAttribute('aria-pressed', String(v === value));
    b.addEventListener('click', () => { set(v); onPick(v); });
    host.appendChild(b);
    return [v, b];
  });
  const set = (v) => buttons.forEach(([x, b]) => b.setAttribute('aria-pressed', String(x === v)));
  return set;
}

// Mix two #rrggbb colours: t = 0 gives a, 1 gives b.
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------------------------------- linear algebra
function inv(A) {
  const n = A.length, M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * n; j++) M[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c];
      for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[c][j];
    }
  }
  return M.map((r) => r.slice(n));
}
const mulMV = (M, v) => M.map((r) => r.reduce((s, x, j) => s + x * v[j], 0));

async function main() {
  const D = await fetch(BASE + 'data/thrusters-hw/thrusters.json').then((r) => r.json());
  const TH = D.thrusters;
  const T = D.T; // 6 x 8
  const Tt = T[0].map((_, j) => T.map((r) => r[j]));
  const pinv = (() => { // T^T (T T^T)^-1, 8 x 6
    const A = T.map((r) => T.map((q) => r.reduce((s, x, k) => s + x * q[k], 0)));
    const Ai = inv(A);
    return Tt.map((col) => Ai[0].map((_, j) => col.reduce((s, x, k) => s + x * Ai[k][j], 0)));
  })();
  // A unit request on one axis: 20 N or 4 N·m.
  const MOTIONS = [
    ['surge', 'Surge', 'forward', 0, 20], ['sway', 'Sway', 'to port', 1, 20], ['heave', 'Heave', 'up', 2, 20],
    ['roll', 'Roll', 'starboard side down', 3, 4], ['pitch', 'Pitch', 'nose down', 4, 4], ['yaw', 'Yaw', 'turning left', 5, 4],
  ];
  const wrenchOf = (m) => { const w = [0, 0, 0, 0, 0, 0]; w[m[3]] = m[4]; return w; };

  layoutFigure(D, TH, pinv, MOTIONS, wrenchOf);
  pathGraph(D);
  follow(D, TH);
  escConfig(D);
  curves(D);
  gauge(D);
  usage(D, TH);
  reversed(D, TH, T, pinv, MOTIONS, wrenchOf);
}

// ---------------------------------------------------------------------------- which way each thruster pushes
// Push direction in words; `d` is the push on the robot (x forward, y port, z up).
function describeDir(d) {
  if (d[0] > 0.5) return 'forward';
  if (d[0] < -0.5) return 'backward';
  return `${d[2] > 0 ? 'up' : 'down'} and to ${d[1] > 0 ? 'port' : 'starboard'}`;
}
const NAMEPART = { V: 'vector (fore-aft)', H: 'heave (tilted 45°)', U: 'upper', L: 'lower', P: 'port', S: 'starboard' };
const nameWords = (n) => `${NAMEPART[n[0]]}, ${NAMEPART[n[1]]}, ${NAMEPART[n[2]]}`;
const IDLE = 0.5; // N: below this a thruster counts as idle in the figures
// Screen direction of a push, seen from the bow: robot +y (port) -> right, +z (up) -> up.
const screenDir = (d) => { const l = Math.hypot(d[1], d[2]) || 1; return [d[1] / l, -d[2] / l]; };

// A small glyph for a push: a dot (forward, toward you), a cross (backward) or an arrow, as on the figure.
function glyph(d, sign = 1) {
  if (sign === 0) return '<svg class="th-g" viewBox="-9 -9 18 18" aria-hidden="true"><line x1="-4" x2="4" y1="0" y2="0"/></svg>';
  const dd = d.map((v) => v * sign);
  if (Math.abs(dd[0]) > 0.5) {
    return dd[0] > 0
      ? '<svg class="th-g" viewBox="-9 -9 18 18" aria-hidden="true"><circle r="7.2" class="o"/><circle r="2.8" class="f"/></svg>'
      : '<svg class="th-g" viewBox="-9 -9 18 18" aria-hidden="true"><circle r="7.2" class="o"/><path d="M-3.6,-3.6L3.6,3.6M-3.6,3.6L3.6,-3.6"/></svg>';
  }
  const [sx, sy] = screenDir(dd), a = (Math.atan2(sy, sx) * 180) / Math.PI;
  return `<svg class="th-g" viewBox="-9 -9 18 18" aria-hidden="true"><g transform="rotate(${a.toFixed(0)})"><line x1="-7" x2="3" y1="0" y2="0"/><path class="f" d="M7.5,0L1.5,-4.2L1.5,4.2Z"/></g></svg>`;
}

function layoutFigure(D, TH, pinv, MOTIONS, wrenchOf) {
  const svg = $('#lay-svg'), note = $('#lay-note'), cards = $('#lay-cards'), cap = $('#lay-cap');
  let mode = 'each', motion = 'surge', sel = null;
  const motionSeg = $('#lay-motion');
  const setMotion = seg(motionSeg, MOTIONS.map((m) => [m[0], m[1]]), motion, (v) => { motion = v; sel = null; draw(); });
  seg($('#lay-mode'), [['each', 'Each thruster'], ['motion', 'Make a motion']], mode, (v) => {
    mode = v; sel = null; motionSeg.style.display = v === 'motion' ? '' : 'none'; setMotion(motion); draw();
  });
  motionSeg.hidden = false;
  motionSeg.style.display = 'none';
  // One line per motion: what the allocation does, in words.
  const HOW = {
    surge: 'The four outer thrusters push forward, the lower pair a little harder because it sits closer to the centre of mass. The inner four rest.',
    sway: 'Only the inner four. Each pushes diagonally, upper and lower opposite ways vertically, so only the sideways parts add up.',
    heave: 'Only the inner four, all pushing up. Port and starboard push opposite ways sideways, so those parts cancel.',
    roll: 'Only the inner four. The two starboard ones push down and the two port ones up; the upper pair also pushes to starboard and the lower pair to port, so Talos rolls starboard side down.',
    pitch: 'The upper outer pair pushes forward and the lower pair backward: the top moves ahead of the bottom, nose down.',
    yaw: 'The starboard outer pair pushes forward and the port pair backward, so Talos turns to port.',
  };
  const caption = {
    each: '<b>Which way each thruster pushes, seen from the bow.</b> Starboard is on your left. Arrows show the push on the robot for a positive command; a dot means forward (toward you), a cross backward. The cards below are laid out like the thrusters. Tap a thruster or a card for its details. CAD render, July 2026.',
    motion: '<b>One way to make each motion, seen from the bow.</b> Each thruster\'s push for the chosen motion: arrows, dots (forward) and crosses (backward) grow with the force; grey thrusters rest. These are the smallest forces that give exactly that push (the <a class="gl" href="glossary.html#term-allocation">minimum-norm allocation</a>); the MPC itself also weighs limits and timing (<a href="control/thrusters.html#allocation">Thrusters and allocation</a>).',
  };

  const forces = () => (mode === 'motion' ? mulMV(pinv, wrenchOf(MOTIONS.find((x) => x[0] === motion))) : null);
  const pick = (i) => { sel = sel === i ? null : i; requestAnimationFrame(draw); };

  function draw() {
    const u = 1600 / Math.max(svg.clientWidth || 800, 1); // user units per css px
    const accent = css('--accent'), ink = css('--ink');
    svg.innerHTML = '';
    const f = forces();
    const fmax = f ? Math.max(...f.map(Math.abs)) : 1;
    const R = Math.max(60, 15 * u); // ring radius: at least 15 css px
    const MID = 545; // half way between the upper and lower inner thrusters
    const h = 6 * u, start = R + 3 * u; // arrowhead half-width; arrows start just outside the ring
    // Arrow geometry for an inner thruster: direction, wanted length beyond the ring, and the room it has
    // (head inside the picture and on its own side of the middle line, so two arrows can't meet).
    const arrow = (t, val, mag) => {
      const [sx, sy] = screenDir(t.dir).map((c) => c * Math.sign(val));
      const [px, py] = t.front_px;
      const lim = [];
      if (sy > 0) lim.push(((py < MID ? MID - 7 * u : 1090 - 10 * u) - py) / sy);
      if (sy < 0) lim.push(((py > MID ? MID + 7 * u : 10 * u) - py) / sy);
      if (sx > 0) lim.push((1600 - 10 * u - px) / sx);
      if (sx < 0) lim.push((10 * u - px) / sx);
      return { sx, sy, want: (24 + 40 * mag) * u * (u > 3 ? 1 : 1.25) + 2.2 * h, room: Math.min(...lim) - start };
    };
    // one scale for every arrow, so lengths still compare when one of them has to shrink to fit
    const k = Math.min(1, ...TH.filter((t) => t.name[0] === 'H' && !(f && Math.abs(f[t.index]) < IDLE))
      .map((t) => { const a = arrow(t, f ? f[t.index] : 1, f ? Math.abs(f[t.index]) / fmax : 1); return a.room / a.want; }));
    for (const t of TH) {
      const [px, py] = t.front_px;
      const outer = t.name[0] === 'V', stbd = t.name[2] === 'S';
      const val = f ? f[t.index] : 1;
      const idle = f && Math.abs(val) < IDLE;
      const mag = f ? Math.abs(val) / fmax : 1;
      const hot = sel === t.index, color = hot ? accent : ink;
      const g = el('g', { class: 'tm' + (hot ? ' sel' : '') + (idle ? ' idle' : ''), tabindex: 0, role: 'button', 'aria-label': `Thruster ${t.index} ${t.name}` }, svg);
      el('circle', { cx: px, cy: py, r: R, class: 'ring', 'stroke-width': 2.2 * u }, g);
      if (!idle && outer) {
        // along the robot: a dot (toward the viewer, forward) or a cross (away, backward), inside the ring
        if (val * t.dir[0] > 0) el('circle', { cx: px, cy: py, r: R * (0.3 + 0.3 * mag), fill: color }, g);
        else {
          const s = R * (0.32 + 0.28 * mag);
          el('path', { d: `M${px - s},${py - s}L${px + s},${py + s}M${px - s},${py + s}L${px + s},${py - s}`, stroke: color, 'stroke-width': 3.6 * u, 'stroke-linecap': 'round' }, g);
        }
      } else if (!idle) {
        const { sx, sy, want } = arrow(t, val, mag);
        const L = start + Math.max(2.6 * h, want * k);
        const x1 = px + sx * start, y1 = py + sy * start, x2 = px + sx * L, y2 = py + sy * L;
        el('line', { x1, y1, x2: x2 - sx * h * 1.6, y2: y2 - sy * h * 1.6, stroke: color, 'stroke-width': 4 * u, 'stroke-linecap': 'round' }, g);
        el('path', { d: `M${x2},${y2} L${x2 - sx * h * 2.4 - sy * h},${y2 - sy * h * 2.4 + sx * h} L${x2 - sx * h * 2.4 + sy * h},${y2 - sy * h * 2.4 - sx * h}Z`, fill: color }, g);
      }
      // index badge, toward the middle: level with the ring for the outer four; for the inner four diagonally,
      // across their arrow's line so no arrow (either sign) runs over it
      const toMid = stbd ? 1 : -1, up = t.name[1] === 'U' ? 1 : -1, off = R + 11 * u;
      const bx = px + toMid * (outer ? off : off / Math.SQRT2), by = py + (outer ? 0 : up * off / Math.SQRT2);
      el('circle', { cx: bx, cy: by, r: 10.5 * u, class: 'badge' }, g);
      el('text', { x: bx, y: by, class: 'badge-t', style: `font-size:${13 * u}px` }, g).textContent = t.index;
      el('circle', { cx: px, cy: py, r: R + 16 * u, class: 'hit' }, g);
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && sel !== t.index) { sel = t.index; requestAnimationFrame(draw); } });
      g.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') pick(t.index); else if (sel !== t.index) pick(t.index); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(t.index); } });
    }
    drawCards(f);
    cap.innerHTML = caption[mode];
    info(f);
  }

  // The cards: two columns as seen from the bow (starboard left), rows top to bottom like the thrusters.
  function drawCards(f) {
    cards.innerHTML = '<div class="th-cards-h">starboard</div><div class="th-cards-h">port</div>';
    for (const t of TH) {
      const val = f ? f[t.index] : 1;
      const idle = f && Math.abs(val) < IDLE;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'th-card' + (idle ? ' idle' : '');
      b.setAttribute('aria-pressed', String(sel === t.index));
      const dirWords = describeDir(t.dir.map((v) => v * Math.sign(val)));
      const what = !f ? dirWords : idle ? 'rests' : `<b>${sgn(val)} N</b> ${dirWords}`;
      b.innerHTML = `<span class="th-card-top"><span class="th-idx">${t.index}</span><span class="th-nm">${t.name}</span>${glyph(t.dir, idle ? 0 : Math.sign(val))}</span><span class="th-card-v">${what}</span>`;
      b.addEventListener('click', () => pick(t.index));
      cards.appendChild(b);
    }
  }

  function info(f) {
    const m = MOTIONS.find((x) => x[0] === motion);
    if (f) {
      const head = `<b>${m[1]} ${m[2]}, ${m[4]} ${m[3] < 3 ? 'N' : 'N·m'}.</b> `;
      if (sel === null) { note.innerHTML = head + HOW[motion]; return; }
      const t = TH[sel], v = f[sel];
      note.innerHTML = Math.abs(v) < IDLE
        ? `<b>${t.index} ${t.name}</b> rests for this motion.`
        : `<b>${t.index} ${t.name}: ${sgn(v)} N</b>, pushing ${describeDir(t.dir.map((x) => x * Math.sign(v)))}${v < 0 ? ', against its arrow' : ''}.`;
      return;
    }
    if (sel === null) {
      note.innerHTML = 'Tap a thruster or a card: its name, which way it pushes, and where it sits.';
      return;
    }
    const t = TH[sel];
    const [, y, z] = t.pos_com.map((v) => Math.round(v * 100));
    note.innerHTML = `<b>${t.index} ${t.name}</b>: ${nameWords(t.name)}. A positive command pushes the robot <b>${describeDir(t.dir)}</b>. ` +
      `ESC board ${t.board}, slot ${t.slot}. ${t.inverted ? 'Opposite-hand propeller (<code>type: 1</code>): the firmware spins this motor backwards.' : 'Standard propeller (<code>type: 0</code>).'} ` +
      `It sits ${Math.abs(y)} cm to ${y > 0 ? 'port' : 'starboard'} and ${Math.abs(z)} cm ${z > 0 ? 'above' : 'below'} the centre of mass.`;
  }

  new ResizeObserver(() => draw()).observe(svg);
  tapOutside($('#lay'), () => { if (sel !== null) { sel = null; draw(); } });
  draw();
}

// ---------------------------------------------------------------------------------------------- path graph
function pathGraph(D) {
  const note = $('#path-note');
  const fw = D.firmware;
  const INFO = {
    mpc: `<b>riptide_mpc</b>, the controller, on the Orin. Every 50 ms it solves for eight thruster forces (±${D.limits.per_thruster} N each, ${D.limits.total} N in total; <a href="control/thrusters.html">Thrusters and allocation</a>), then turns each into a target RPM by inverting the T200 thrust curve (<code>forceToRpm</code>, <a href="#curves">below</a>).`,
    can: '<b><code>can0</code></b>, the Orin\'s CAN port. Targets go out as two raw frames, one per ESC board: <code>0x0B0</code> for thrusters 0–3 and <code>0x0F0</code> for 4–7, each with four signed 16-bit RPMs, no ROS in between. The boards\' micro-ROS traffic (telemetry, faults) comes back on the same bus.',
    topic: '<b><code>thruster_forces</code></b> carries the eight forces in newtons. The Nereus simulator applies them to its model of Talos; the Nereus viewer draws them as arrows.',
    req: '<b><code>command/requested_rpm</code></b> carries the eight RPMs sent to CAN, so a bag records what the ESC boards were asked for.',
    board: `<b>ESC board ×2</b>, in the board stack. It keeps the latest targets and runs the RPM loop for its four thrusters, up to 2,500 times a second, clamped to ±${fw.hard_limit} of ±999. Targets older than ${fw.cmd_timeout_ms} ms stop the thrusters.`,
    esc: '<b>APD 80F3 ESC ×8</b>, four on each ESC board, with firmware the team patched to reverse in DShot mode. Each gets a 16-bit DShot600 frame every loop cycle and answers with the motor speed on the same wire.',
    t200: `<b>T200 thruster ×8</b>, out on the frame. Brushless, ${fw.pole_pairs} pole pairs: the ESC's electrical RPM divided by ${fw.pole_pairs} is the propeller RPM.`,
    poac: `<b>The POAC</b>, the power board in the board stack, switches <code>MOTOR_PWR</code>, the ESC supply, off whenever Talos is killed. The ESC boards see their supply drop under ${fw.esc_on_mv / 1000} V and hold the thrusters off for ${fw.powerup_delay_ms / 1000} s after it returns.`,
    tele: '<b><code>state/thrusters/telemetry</code></b>, a micro-ROS topic sent back over the same CAN bus: one message per ESC board every 500 ms with its disabled flags, supply voltage, and each ESC\'s RPM, temperature, voltage and current. If <code>can0</code> is down, commands and telemetry both stop.',
  };
  const nodes = [
    { id: 'mpc', x: 115, y: 72, label: 'riptide_mpc', sub: 'forces → RPM, 20 Hz', bold: true },
    { id: 'can', x: 370, y: 72, label: 'can0', sub: '0x0B0 · 0x0F0' },
    { id: 'topic', x: 115, y: 178, label: 'thruster_forces', sub: 'sim + viewer' },
    { id: 'req', x: 290, y: 178, label: 'requested_rpm', sub: 'for bags' },
    { id: 'tele', x: 370, y: 268, label: 'telemetry', sub: '2 Hz per board' },
    { id: 'board', x: 632, y: 72, label: 'ESC board ×2', sub: 'RPM loop', bold: true },
    { id: 'esc', x: 632, y: 178, label: 'APD 80F3 ×8', sub: 'patched ESCs', bold: true },
    { id: 'poac', x: 632, y: 268, label: 'POAC', sub: 'cuts power on kill' },
    { id: 't200', x: 862, y: 178, label: 'T200 ×8', sub: '7 pole pairs', bold: true },
  ];
  const edges = [
    { from: 'mpc', to: 'can' }, { from: 'mpc', to: 'topic' }, { from: 'mpc', to: 'req' },
    { from: 'can', to: 'board', label: 'RPM targets', bend: -12, ly: 52 }, { from: 'board', to: 'can', dash: true, label: 'micro-ROS', bend: -12, ly: 106 },
    { from: 'board', to: 'esc', label: 'DShot600', bend: -18, lx: 654, ly: 128, anchor: 'start' }, { from: 'esc', to: 'board', dash: true, label: 'RPM', bend: -18, lx: 610, ly: 128, anchor: 'end' },
    { from: 'esc', to: 't200', label: '3 phases' }, { from: 'poac', to: 'esc', label: 'power', lx: 642, ly: 228, anchor: 'start' },
    { from: 'can', to: 'tele', dash: true },
  ];
  const narrow = {
    below: 620, width: 320, height: 545,
    bands: [
      { label: 'ORIN', points: [[10, 8], [310, 8], [310, 256], [10, 256]] },
      { label: 'BOARD STACK', points: [[10, 284], [310, 284], [310, 462], [10, 462]], lx: 206, ly: 300 },
    ],
    nodes: {
      mpc: { x: 86, y: 52 }, topic: { x: 232, y: 104 }, req: { x: 232, y: 162 },
      can: { x: 86, y: 222 }, tele: { x: 232, y: 222 },
      board: { x: 86, y: 330 }, esc: { x: 86, y: 425 }, poac: { x: 232, y: 425 },
      t200: { x: 86, y: 512 },
    },
    edges: {
      'can>board': { bend: -14, lx: 104, ly: 274, anchor: 'start' }, 'board>can': { bend: -14, lx: 68, ly: 274, anchor: 'end' },
      'board>esc': { bend: -16, lx: 106, ly: 382, anchor: 'start' }, 'esc>board': { bend: -16, lx: 66, ly: 382, anchor: 'end' },
      'esc>t200': { lx: 94, ly: 474, anchor: 'start' },
      'poac>esc': { lx: 156, ly: 416, anchor: 'middle' },
    },
  };
  const g = new Graph($('#path-graph'), {
    width: 960, height: 320, nodes, edges, narrow, label: 'The thrust path from the MPC to the thrusters',
    bands: [
      { label: 'ORIN', points: [[10, 22], [470, 22], [470, 308], [10, 308]] },
      { label: 'BOARD STACK', points: [[505, 22], [760, 22], [760, 308], [505, 308]] },
    ],
    info: (n) => { note.innerHTML = n ? INFO[n.id] : 'Tap or hover a box for what it does.'; },
  });
  g.highlight(null);
}

// --------------------------------------------------------------------------------- one command step by step
function follow(D, TH) {
  const P = D.propeller, fw = D.firmware;
  const scale = P.rho * P.diameter ** 4 / 3600;
  const forceToRpm = (f) => { // HardwareConfig::forceToRpm, propeller branch
    if (f === 0 || !isFinite(f)) return 0;
    const [a, b] = f > 0 ? P.kt_forward : P.kt_reverse;
    const target = Math.abs(f) / scale;
    let r = Math.sqrt(target / a);
    for (let i = 0; i < 50; i++) {
      const step = ((a + b * r) * r * r - target) / ((2 * a + 3 * b * r) * r);
      r -= step;
      if (Math.abs(step) <= 1e-12 * r) break;
    }
    return Math.sign(f) * r;
  };
  const ff = (rpm) => { // thruster_controller_feed_forward (integer maths, truncating division as in C)
    if (rpm < fw.ff_deadzone_rpm && rpm > -fw.ff_deadzone_rpm) return 0;
    const c = rpm > 0 ? fw.ff_forward : fw.ff_reverse;
    return Math.trunc((c[0] + c[1] * rpm + c[2] * rpm * rpm) / 1e6);
  };
  const br18 = D.t200['18'];
  const currentAt = (f) => { // Blue Robotics 18 V: current for a given thrust, on the right branch
    if (f === 0) return 0;
    const rows = br18.filter((r) => (f > 0 ? r[0] > 1500 && r[4] > 0 : r[0] < 1500 && r[4] < 0)).map((r) => [Math.abs(r[4]), r[2]]).sort((a, b) => a[0] - b[0]);
    const x = Math.abs(f);
    for (let i = 1; i < rows.length; i++) if (rows[i][0] >= x) {
      const [x0, y0] = rows[i - 1], [x1, y1] = rows[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0 || 1);
    }
    return rows.at(-1)[1];
  };
  let th = 2;
  const steps = $('#fol-steps'), slider = $('#fol-f'), out = $('#fol-f-o');
  seg($('#fol-pick'), TH.map((t) => [t.index, `${t.index} ${t.name}`]), th, (v) => { th = v; draw(); });
  slider.addEventListener('input', draw);
  const hex = (b) => b.toString(16).toUpperCase().padStart(2, '0');
  const n = (v) => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US');

  function draw() {
    const F = +slider.value;
    out.textContent = `${sgn(F)} N`.replace(/^0\.0/, '0');
    const t = TH[th];
    const rpmExact = forceToRpm(F), rpm = Math.max(-32768, Math.min(32767, Math.round(rpmExact)));
    const u16 = rpm & 0xffff;
    const bytes = Array(8).fill(0);
    bytes[t.slot * 2] = u16 >> 8; bytes[t.slot * 2 + 1] = u16 & 0xff;
    const ffv = ff(rpm), clamped = Math.max(-fw.hard_limit, Math.min(fw.hard_limit, ffv));
    const throttle = (t.inverted ? -1 : 1) * clamped;
    const dval = throttle > 0 ? 48 + throttle : throttle < 0 ? 1048 - throttle : 0;
    const cmd = (dval & 0x7ff) << 1; // telemetry bit 0
    const crc = (~(cmd ^ (cmd >> 4) ^ (cmd >> 8))) & 0xf;
    const frame = (cmd << 4) | crc;
    const bits = frame.toString(2).padStart(16, '0').split('');
    const erpm = Math.abs(rpm) * fw.pole_pairs;
    const period = erpm ? 60e6 / erpm : 0;
    // UART telemetry counts in hundreds of electrical rpm; the firmware scales by 100 / pole pairs (integer maths)
    const telem = Math.trunc(Math.floor(erpm / 100) * 100 / fw.pole_pairs);
    const amps = currentAt(F);
    const k = F >= 0 ? P.kt_forward : P.kt_reverse;
    const ktv = k[0] + k[1] * Math.abs(rpmExact);
    const along = F > 0 ? `along its arrow: ${describeDir(t.dir)}` : `against its arrow: ${describeDir(t.dir.map((v) => -v))}`;
    const spinsFwd = t.inverted ? rpm < 0 : rpm > 0;
    const items = F === 0 ? [
      ['The MPC asks', '0 N', `Nothing from thruster ${t.index} (${t.name}).`],
      ['Force to RPM', '0 rpm', 'Zero force is zero RPM: stop the motor.'],
      ['CAN frame', `<code>0x${t.can_id.toString(16).toUpperCase().padStart(3, '0')}</code>`, `All zeros for this slot.<div class="th-bytes">${bytes.map((b, i) => `<span class="${(i >> 1) === t.slot ? 'on' : ''}">${hex(b)}</span>`).join('')}</div>`],
      ['ESC board', 'throttle 0', 'No target, no throttle.'],
      ['DShot frame', 'value 0', `Value 0 means stop.<div class="th-bits">${bits.map((b, i) => `<span class="${i < 11 ? 'v' : i < 12 ? 't' : 'c'}">${b}</span>`).join('')}</div>`],
      ['Telemetry', '0 rpm', 'The motor stands still.'],
      ['Thrust and current', '0 N · 0 A', 'No thrust, no current.'],
    ] : [
      ['The MPC asks', `${sgn(F)} N`, `Thruster ${t.index} (${t.name}): push ${along}.`],
      ['Force to RPM', `${n(rpm)} rpm`, `Inverting the T200 curve: K<sub>T</sub> = ${k[0]} + ${k[1].toExponential(2).replace('e-5', '×10⁻⁵')} × ${Math.abs(rpmExact).toFixed(0)} = ${ktv.toFixed(4)} gives ${Math.abs(F).toFixed(1)} N.`],
      ['CAN frame', `<code>0x${t.can_id.toString(16).toUpperCase().padStart(3, '0')}</code>`, `To ESC board ${t.board}. Slot ${t.slot} is bytes ${t.slot * 2}–${t.slot * 2 + 1}, high byte first${rpm < 0 ? ', negative as two\'s complement' : ''}:<div class="th-bytes">${bytes.map((b, i) => `<span class="${(i >> 1) === t.slot ? 'on' : ''}">${hex(b)}</span>`).join('')}</div>`],
      ['ESC board', `throttle ${n(throttle)}`, `First guess for ${n(rpm)} rpm: ${n(ffv)}${ffv !== clamped ? `, clamped to ${n(clamped)}` : ''} of ±999${t.inverted ? '; this slot is inverted (<code>type: 1</code>), so the sign flips' : ''}. The PI loop trims it.`],
      ['DShot frame', `value ${dval}`, `${throttle > 0 ? '48 + throttle (48–1047: ESC forward)' : '1048 + |throttle| (1049–2047: ESC reverse)'}, telemetry bit 0, checksum ${crc.toString(2).padStart(4, '0')}:<div class="th-bits">${bits.map((b, i) => `<span class="${i < 11 ? 'v' : i < 12 ? 't' : 'c'}">${b}</span>`).join('')}</div>`],
      ['Telemetry', `${n(throttle < 0 ? -telem : telem)} rpm`, `The motor turns ${spinsFwd ? 'forwards' : 'backwards'} as the ESC sees it: ${Math.abs(rpm).toLocaleString('en-US')} rpm × ${fw.pole_pairs} pole pairs = ${erpm.toLocaleString('en-US')} electrical rpm, one electrical turn every ${Math.round(period).toLocaleString('en-US')} µs. Telemetry rounds to 100 electrical rpm.`],
      ['Thrust and current', `${sgn(F)} N · ${amps.toFixed(1)} A`, `${Math.abs(F).toFixed(1)} N ${F > 0 ? 'along' : 'against'} its arrow, drawing about ${amps.toFixed(1)} A (${(amps * 18).toFixed(0)} W) at 18 V.`],
    ];
    steps.innerHTML = items.map(([h, key, b]) => `<li><span class="th-step">${h}</span><b class="th-key-v">${key}</b><div class="th-step-b">${b}</div></li>`).join('');
  }
  draw();
}

// -------------------------------------------------------------------------------------------- ESC settings
function escConfig(D) {
  const C = Object.fromEntries(D.firmware.esc_config.map(([i, v]) => [i, v]));
  const yes = (v) => (v ? 'yes' : 'no');
  const rows = [
    ['Input signal', C[20] === 2 ? ['DShot (auto rate)', 'DShot150', 'DShot300', 'DShot600'][C[21]] : C[20], 'Matches the firmware\'s <code>DSHOT_RATE 600</code>'],
    ['Telemetry', yes(C[12]), 'The UART packets the ESC board asks for'],
    ['Reverse direction', C[2] ? 'reverse' : 'normal', 'Direction is set by the ESC board firmware instead'],
    ['Current limit', `${C[8]} A`, 'Above the 15 A fuse on each ESC, so the fuse is the real limit'],
    ['Temperature limit', `${C[16]} °C`, ['then power limited to 50 %', 'then power limited to 75 %', 'then hard shutdown', 'no action'][C[17]]],
    ['Ramp up / down', `${C[3]} / ${C[4]} % per 100 ms`, 'How fast the ESC follows a throttle change'],
  ];
  $('#cfg-body').innerHTML = rows.map(([a, b, c]) => `<tr><td>${a}</td><td>${b}</td><td>${c}</td></tr>`).join('');
}

// ---------------------------------------------------------------------------------------------- T200 curves
// The shared chart picks too few x ticks for ±4000 rpm on a phone (only 0); add ±3000 there.
class RpmChart extends LineChart {
  draw() {
    super.draw();
    const ticks = this.o.extraXTicks, mp = this.map;
    if (!ticks || !mp || mp.W >= 520) return;
    const axis = this.svg.querySelector('g.axis');
    for (const v of ticks) {
      const t = el('text', { x: mp.sx(v), y: mp.H - mp.m.b + 15, 'text-anchor': 'middle' }, axis);
      t.textContent = (v < 0 ? '−' : '') + Math.abs(v);
    }
  }
}
function curves(D) {
  const volts = Object.keys(D.t200).map(Number).sort((a, b) => a - b);
  const base = css('--state') || '#2a78d6';
  // light to dark with voltage; the lightest is still 3:1 against the panel
  const col = (i) => (i < 3 ? mix('#e7eff0', base, 0.74 + i * 0.13) : mix(base, '#0f2633', (i - 3) * 0.28));
  let xMode = 'rpm', yMode = 'force';
  const chart = new RpmChart($('#cur-chart'), { height: 300, digits: 1, xDigits: 0 });
  const fitBox = $('#cur-fit');
  seg($('#cur-x'), [['rpm', 'RPM'], ['pwm', 'Throttle']], xMode, (v) => { xMode = v; draw(); });
  seg($('#cur-y'), [['force', 'Thrust'], ['current', 'Current'], ['power', 'Power']], yMode, (v) => { yMode = v; draw(); });
  fitBox.addEventListener('change', draw);
  const fitLabel = $('#cur-fit-l');
  const P = D.propeller, scale = P.rho * P.diameter ** 4 / 3600;
  const thrust = (n, k) => (k[0] + k[1] * n) * scale * n * n;
  const rpmFor = (f, k) => { let lo = 0, hi = 6000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (thrust(m, k) < f) lo = m; else hi = m; } return lo; };
  const capF = rpmFor(D.limits.per_thruster, P.kt_forward), capR = rpmFor(D.limits.per_thruster, P.kt_reverse);
  const currentAt24 = () => { // Blue Robotics 18 V, forward: current at 24 N
    const rows = D.t200['18'].filter((r) => r[0] > 1500 && r[4] > 0).sort((a, b) => a[4] - b[4]);
    const j = rows.findIndex((r) => r[4] >= D.limits.per_thruster);
    const [a, b] = [rows[j - 1], rows[j]];
    return a[2] + (b[2] - a[2]) * (D.limits.per_thruster - a[4]) / (b[4] - a[4]);
  };

  function draw() {
    const yi = { force: 4, current: 2, power: 3 }[yMode];
    const series = volts.map((v, i) => {
      const pts = D.t200[v].map((r) => ({ x: xMode === 'rpm' ? (r[0] < 1500 ? -r[1] : r[1]) * (r[4] === 0 && r[1] === 0 ? 1 : 1) : (r[0] - 1500) / 4, y: r[yi] }))
        .filter((p) => xMode === 'pwm' || !(Math.abs(p.x) < 1 && p.y !== 0));
      pts.sort((a, b) => a.x - b.x);
      return { name: `${v} V`, color: col(i), values: pts, width: 1.8 };
    });
    const fitShown = yMode === 'force' && xMode === 'rpm';
    fitLabel.hidden = !fitShown; // the fit only exists as thrust against RPM
    if (fitBox.checked && fitShown) {
      const pts = [];
      for (let n = -3700; n <= 3950; n += 50) pts.push({ x: n, y: n < 0 ? -thrust(-n, P.kt_reverse) : thrust(n, P.kt_forward) });
      series.push({ name: 'Blue Robotics fit (used by the MPC)', color: css('--reference'), values: pts, dash: true, width: 2 });
    }
    const xLabel = xMode === 'rpm' ? 'rpm (reverse < 0)' : 'throttle (% of full, reverse < 0)';
    const yLabel = { force: 'thrust (N)', current: 'current (A)', power: 'power (W)' }[yMode];
    const markers = yMode === 'force' && xMode === 'rpm' ? [{ x: capF, label: '24 N' }, { x: -capR, label: '−24 N' }] : [];
    chart.set(series, { xLabel, yLabel, unit: { force: 'N', current: 'A', power: 'W' }[yMode], digits: yMode === 'power' ? 0 : 1, markers, yZero: yMode === 'force', xDomain: xMode === 'rpm' ? [-4000, 4000] : [-100, 100], extraXTicks: xMode === 'rpm' ? [-3000, 3000] : null });
    const i24 = currentAt24();
    $('#cur-read').innerHTML = {
      force: xMode === 'rpm'
        ? `<span>Talos's cap: <b>24 N</b> takes <b>${Math.round(capF).toLocaleString('en-US')} rpm</b> forward, <b>${Math.round(capR).toLocaleString('en-US')} rpm</b> in reverse (the fit).</span>`
        : '<span>At full throttle a T200 gives <b>51 N</b> at 16 V but <b>66 N</b> at 20 V: the same throttle, a different thrust.</span>',
      current: `<span>Talos's cap of <b>24 N</b> takes about <b>${i24.toFixed(0)} A</b> at 18 V; full throttle takes <b>24–32 A</b> (16–20 V), above each ESC's 15 A fuse.</span>`,
      power: `<span>Talos's cap of <b>24 N</b> takes about <b>${(i24 * 18).toFixed(0)} W</b> at 18 V; full throttle takes <b>390–645 W</b> (16–20 V).</span>`,
    }[yMode];
  }
  draw();
}

// ------------------------------------------------------------------------------------------ force gauge runs
function gauge(D) {
  const runs = Object.entries(D.gauge_2023);
  const colors = ['--state', '--s4', '--s5', '--s7', '--prediction'].map(css);
  let xMode = 'rpm';
  const chart = new LineChart($('#g-chart'), { height: 300, digits: 1, xDigits: 0, yLabel: 'force (N)' });
  seg($('#g-x'), [['rpm', 'RPM'], ['cmd', 'ESC command']], xMode, (v) => { xMode = v; draw(); });
  const P = D.propeller, scale = P.rho * P.diameter ** 4 / 3600;
  const thrust = (n, k) => (k[0] + k[1] * n) * scale * n * n;
  function draw() {
    const series = runs.map(([name, rows], i) => ({
      name: name === 'Talos1r1' ? 'Talos1, run 1 (also in reverse)' : name.replace(/^t(\d)r(\d)$/, 'Thruster $1, run $2'), color: colors[i], points: true, r: 3, opacity: 0.85,
      values: rows.map((r) => ({ x: xMode === 'rpm' ? r[1] : r[0], y: r[2] })).sort((a, b) => a.x - b.x),
    }));
    if (xMode === 'rpm') {
      const pts = [];
      for (let n = -3100; n <= 3100; n += 50) pts.push({ x: n, y: n < 0 ? -thrust(-n, P.kt_reverse) : thrust(n, P.kt_forward) });
      series.push({ name: 'Blue Robotics fit (used by the MPC)', color: css('--ink-2'), values: pts, dash: true, width: 1.8 });
    }
    chart.set(series, { xLabel: xMode === 'rpm' ? 'measured rpm' : 'raw ESC command (of ±999)', yZero: true, xDomain: xMode === 'rpm' ? [-3200, 3200] : [-750, 750] });
  }
  draw();
}

// -------------------------------------------------------------------------------------------- pool usage
function usage(D, TH) {
  const U = D.usage, host = $('#use-chart'), note = $('#use-note');
  let sel = null;
  const def = 'Tap a row for one thruster\'s numbers.';
  function draw() {
    const W = Math.max(280, host.clientWidth || 600);
    const lw = W < 480 ? 66 : 84, rowH = W < 480 ? 34 : 38, top = 6, H = top + TH.length * rowH + 30;
    const x0 = lw, x1 = W - 8, edges = U.hist_edges, nb = edges.length - 1;
    const bw = (x1 - x0) / nb;
    const maxFrac = Math.max(...U.hist.flat()) / U.samples;
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart th-use', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Histogram of each thruster\'s commanded force' }, host);
    const rev = css('--state'), fwd = css('--reference');
    TH.forEach((t, i) => {
      const y = top + i * rowH;
      const g = el('g', { class: 'use-row' + (sel === i ? ' sel' : ''), tabindex: 0 }, svg);
      el('rect', { x: 0, y, width: W, height: rowH, class: 'use-bg' }, g);
      el('text', { x: lw - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'label' }, g).textContent = `${t.index} ${t.name}`;
      el('line', { x1: x0, x2: x1, y1: y + rowH - 4, y2: y + rowH - 4, stroke: css('--rule') }, g);
      U.hist[i].forEach((c, b) => {
        if (!c) return;
        const h = Math.sqrt(c / U.samples / maxFrac) * (rowH - 8);
        const mid = (edges[b] + edges[b + 1]) / 2;
        el('rect', { x: x0 + b * bw + 0.5, y: y + rowH - 4 - h, width: Math.max(1, bw - 1), height: h, fill: Math.abs(mid) <= 0.5 ? css('--muted') : mid < 0 ? rev : fwd }, g);
      });
      const pick = () => { sel = i; requestAnimationFrame(draw); };
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(); });
      g.addEventListener('pointerdown', pick);
      g.addEventListener('focus', () => { if (sel !== i) pick(); });
    });
    const ay = top + TH.length * rowH + 14;
    for (const v of [-24, -12, 0, 12, 24]) {
      const x = x0 + ((v - edges[0]) / (edges.at(-1) - edges[0])) * (x1 - x0);
      el('line', { x1: x, x2: x, y1: top, y2: ay - 10, stroke: v === 0 ? css('--muted') : css('--grid'), 'stroke-dasharray': v === 0 ? '' : '2 3' }, svg);
      el('text', { x, y: ay + 2, 'text-anchor': v === -24 ? 'start' : v === 24 ? 'end' : 'middle', class: 'label' }, svg).textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${v === 24 ? ' N' : ''}`;
    }
    el('text', { x: x0, y: H - 1, class: 'label' }, svg).textContent = 'reverse';
    el('text', { x: x1, y: H - 1, 'text-anchor': 'end', class: 'label' }, svg).textContent = 'forward';
    if (sel === null) { note.innerHTML = def; return; }
    const pc = (v) => (v * 100).toFixed(v < 0.01 && v > 0 ? 2 : 1) + ' %';
    const t = TH[sel];
    note.innerHTML = `<b>${t.index} ${t.name}</b>: forward ${pc(U.forward[sel])} of the time, reverse ${pc(U.reverse[sel])}, within ±${U.idle_band} N ${pc(U.idle[sel])}. Averages ${U.mean_abs[sel]} N; 99 % of commands under ${U.p99_abs[sel]} N; ${U.at_limit[sel] ? `at the 24 N limit ${pc(U.at_limit[sel])} of the time` : `never at the 24 N limit (largest ${U.max_abs[sel]} N)`}.`;
  }
  new ResizeObserver(() => draw()).observe(host);
  tapOutside(host, () => { if (sel !== null) { sel = null; draw(); } });
  draw();
}

// ------------------------------------------------------------------------------------ one reversed thruster
// What a signed amount on each axis does to the robot, in words.
const MOVE = [['drift forward', 'drift backward'], ['drift to port', 'drift to starboard'], ['rise', 'sink'],
  ['roll starboard side down', 'roll port side down'], ['pitch nose down', 'pitch nose up'], ['turn left', 'turn right']];
function reversed(D, TH, T, pinv, MOTIONS, wrenchOf) {
  let motion = 'surge', rev = 0;
  seg($('#rev-m'), MOTIONS.map((m) => [m[0], m[1]]), motion, (v) => { motion = v; draw(); });
  seg($('#rev-t'), TH.map((t) => [t.index, `${t.index} ${t.name}`]), rev, (v) => { rev = v; draw(); });
  const host = $('#rev-chart'), note = $('#rev-note');
  const SPAN = [20, 20, 20, 5, 5, 5]; // fixed scales, so choices compare
  function draw() {
    const m = MOTIONS.find((x) => x[0] === motion);
    const w = wrenchOf(m), f = mulMV(pinv, w);
    const fr = f.map((v, i) => (i === rev ? -v : v));
    const got = mulMV(T, fr);
    const W = Math.max(280, host.clientWidth || 600), narrow = W < 480;
    const lw = narrow ? 64 : 96, cw = narrow ? 44 : 64, rowH = 30, top = 18, H = top + AXES.length * rowH + 20;
    const x0 = lw, x1 = W - 2 * cw - 6, zero = (x0 + x1) / 2;
    const sx = (v, k) => zero + (Math.max(-SPAN[k], Math.min(SPAN[k], v)) / SPAN[k]) * ((x1 - x0) / 2);
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Asked and produced push on each axis' }, host);
    el('line', { x1: zero, x2: zero, y1: top, y2: top + AXES.length * rowH, stroke: css('--muted') }, svg);
    el('text', { x: W - cw - 4, y: 11, 'text-anchor': 'end', class: 'label' }, svg).textContent = 'asked';
    el('text', { x: W - 4, y: 11, 'text-anchor': 'end', class: 'label' }, svg).textContent = 'got';
    AXES.forEach((a, k) => {
      const y = top + k * rowH;
      el('text', { x: lw - 8, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'label' }, svg).textContent = a;
      const ga = got[k], wa = w[k], wrong = Math.abs(ga - wa) > 0.05;
      if (Math.abs(ga) >= 0.05) el('rect', { x: Math.min(sx(0, k), sx(ga, k)), y: y + 7, width: Math.abs(sx(ga, k) - sx(0, k)), height: rowH - 14, fill: wrong ? css('--accent') : css('--ink-2'), rx: 2 }, svg);
      if (Math.abs(wa) >= 0.05) el('rect', { x: Math.min(sx(0, k), sx(wa, k)), y: y + 3, width: Math.abs(sx(wa, k) - sx(0, k)), height: rowH - 6, fill: 'none', stroke: css('--ink'), 'stroke-width': 1.4, 'stroke-dasharray': '4 3', rx: 2 }, svg);
      const fmt = (v) => (Math.abs(v) < 0.05 ? '0' : sgn(v, 1));
      el('text', { x: W - cw - 4, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'label' }, svg).textContent = fmt(wa);
      const tg = el('text', { x: W - 4, y: y + rowH / 2 + 4, 'text-anchor': 'end', class: 'label' + (wrong ? ' th-wrong' : '') }, svg);
      tg.textContent = fmt(ga);
    });
    const ay = top + AXES.length * rowH + 14;
    el('text', { x: zero, y: ay, 'text-anchor': 'middle', class: 'label' }, svg).textContent = 'bar ends: ±20 N, ±5 N·m';
    const t = TH[rev], k = m[3], fk = f[rev];
    const extra = AXES.map((a, j) => (j !== k && Math.abs(got[j]) >= 0.3 ? MOVE[j][got[j] > 0 ? 0 : 1] : null)).filter(Boolean);
    const unit = UNIT[k];
    const main = got[k] * Math.sign(w[k]);
    note.innerHTML = Math.abs(fk) < IDLE
      ? `<b>${t.index} ${t.name}</b> rests for ${m[1].toLowerCase()}, so reversing it changes nothing here. Try another motion or thruster.`
      : `Asked for <b>${m[4]} ${unit} of ${m[1].toLowerCase()}</b> (${m[2]}). ${t.name} should give ${sgn(fk)} N but gives ${sgn(-fk)} N, so Talos gets <b>${sgn(main)} ${unit}</b> of ${m[1].toLowerCase()} instead` +
        `${extra.length ? ` and would also <b>${extra.join(', ').replace(/, ([^,]*)$/, ' and $1')}</b>` : ''}. The MPC would fight this, harder the more it corrects.`;
  }
  new ResizeObserver(() => draw()).observe(host);
  draw();
}

main();
