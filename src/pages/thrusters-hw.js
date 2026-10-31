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
function describeDir(d) {
  if (d[0] > 0.5) return 'forward';
  if (d[0] < -0.5) return 'backward';
  return `${d[2] > 0 ? 'up' : 'down'} and to ${d[1] > 0 ? 'port' : 'starboard'}`;
}
const NAMEPART = { V: 'vector (fore-aft)', H: 'heave (tilted 45°)', U: 'upper', L: 'lower', P: 'port', S: 'starboard' };
const nameWords = (n) => `${NAMEPART[n[0]]}, ${NAMEPART[n[1]]}, ${NAMEPART[n[2]]}`;

function layoutFigure(D, TH, pinv, MOTIONS, wrenchOf) {
  const svg = $('#lay-svg'), note = $('#lay-note');
  let mode = 'each', motion = 'surge', sel = null;
  const motionSeg = $('#lay-motion');
  seg($('#lay-mode'), [['each', 'Each thruster'], ['motion', 'Make a motion']], mode, (v) => {
    mode = v; sel = null; motionSeg.style.display = v === 'motion' ? '' : 'none'; draw();
  });
  seg(motionSeg, MOTIONS.map((m) => [m[0], m[1]]), motion, (v) => { motion = v; draw(); });
  motionSeg.hidden = false;
  motionSeg.style.display = 'none';

  // Screen direction of a push, seen from the bow: robot +y (port) -> right, +z (up) -> up.
  const screen = (d) => { const l = Math.hypot(d[1], d[2]) || 1; return [d[1] / l, -d[2] / l]; };
  const forces = () => {
    if (mode !== 'motion') return null;
    const m = MOTIONS.find((x) => x[0] === motion);
    return mulMV(pinv, wrenchOf(m));
  };

  function draw() {
    const u = 1600 / Math.max(svg.clientWidth || 800, 1); // user units per css px
    const fs = (u > 3 ? 10.5 : 13.5) * u, accent = css('--accent'), ink = css('--ink');
    svg.innerHTML = '';
    const f = forces();
    const fmax = f ? Math.max(...f.map(Math.abs)) : 1;
    for (const t of TH) {
      const [px, py] = t.front_px;
      const outer = t.name[0] === 'V';
      const g = el('g', { class: 'tm' + (sel === t.index ? ' sel' : '') + (f && Math.abs(f[t.index]) < 0.05 ? ' idle' : ''), tabindex: 0, role: 'button', 'aria-label': `Thruster ${t.index} ${t.name}` }, svg);
      const val = f ? f[t.index] : 1;
      const mag = f ? Math.abs(val) / fmax : 1;
      const hot = sel === t.index;
      const color = hot ? accent : ink;
      const R = 62;
      el('circle', { cx: px, cy: py, r: R, class: 'ring', 'stroke-width': 2.2 * u }, g);
      if (outer) {
        // along the robot: a dot (toward the viewer, forward) or a cross (away, backward)
        const fwd = val * t.dir[0] > 0, s = 16 + 30 * mag;
        if (Math.abs(val) >= 0.05) {
          if (fwd) el('circle', { cx: px, cy: py, r: s * 0.55, fill: color }, g);
          else {
            el('line', { x1: px - s * 0.6, y1: py - s * 0.6, x2: px + s * 0.6, y2: py + s * 0.6, stroke: color, 'stroke-width': 4 * u, 'stroke-linecap': 'round' }, g);
            el('line', { x1: px - s * 0.6, y1: py + s * 0.6, x2: px + s * 0.6, y2: py - s * 0.6, stroke: color, 'stroke-width': 4 * u, 'stroke-linecap': 'round' }, g);
          }
        }
      } else if (Math.abs(val) >= 0.05) {
        const [sx, sy] = screen(t.dir).map((c) => c * Math.sign(val));
        const L = (70 + 150 * mag) * (u > 3 ? 1.45 : 1), h = Math.min(15 * u, 30);
        const x2 = px + sx * L, y2 = py + sy * L;
        el('line', { x1: px, y1: py, x2: x2 - sx * h * 1.2, y2: y2 - sy * h * 1.2, stroke: color, 'stroke-width': 4.2 * u, 'stroke-linecap': 'round' }, g);
        el('path', { d: `M${x2},${y2} L${x2 - sx * h * 2.2 - sy * h},${y2 - sy * h * 2.2 + sx * h} L${x2 - sx * h * 2.2 + sy * h},${y2 - sy * h * 2.2 - sx * h}Z`, fill: color }, g);
      }
      // label: outer ones above/below the guard, inner ones toward the middle
      const up = py < 545;
      // (inner ones on the side away from their positive arrow)
      const lx = px, anchor = 'middle';
      const ly = outer ? (up ? py + R + fs * 1.25 : py - R - fs * 0.55) : (up ? py + R + fs * 1.15 : py - R - fs * 0.4);
      const label = f && Math.abs(val) >= 0.05 ? `${t.index} ${t.name} ${sgn(val, 1)} N` : `${t.index} ${t.name}`;
      const tx = el('text', { x: lx, y: ly, 'text-anchor': anchor, class: 'tm-label halo', style: `font-size:${fs}px;stroke-width:${4 * u}px` }, g);
      tx.textContent = label;
      el('circle', { cx: px, cy: py, r: R * 1.5, class: 'hit' }, g);
      // redraw after the event has finished bubbling (tapOutside must still find the target in the figure)
      const pick = () => { sel = t.index; requestAnimationFrame(draw); };
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(); });
      g.addEventListener('pointerdown', pick);
      g.addEventListener('focus', () => { if (sel !== t.index) pick(); });
    }
    // side labels: mid-height on wide screens, top corners (clear of the arrows) on phones
    const narrowSvg = u > 3;
    for (const [x, text, a] of [[14, narrowSvg ? 'STBD' : 'STARBOARD', 'start'], [1586, 'PORT', 'end']]) {
      const s = el('text', { x, y: narrowSvg ? fs * 0.9 : 545, 'text-anchor': a, class: 'tm-side halo', style: `font-size:${fs * 0.85}px;stroke-width:${4 * u}px` }, svg);
      s.textContent = text;
    }
    info(f);
  }

  function info(f) {
    const m = MOTIONS.find((x) => x[0] === motion);
    let head = '';
    if (f) {
      const used = TH.filter((t) => Math.abs(f[t.index]) >= 0.05).map((t) => `${t.name} ${sgn(f[t.index])}`);
      head = `<b>${m[1]} ${m[2]}, ${m[4]} ${m[3] < 3 ? 'N' : 'N·m'}:</b> ${used.join(', ')} N. `;
    }
    if (sel === null) {
      note.innerHTML = head + (f ? 'Tap a thruster for its details.' : 'Tap or hover a thruster: its name, its ESC, which way it pushes and what each newton does to the robot.');
      return;
    }
    const t = TH[sel];
    const col = D.T.map((r) => r[t.index]);
    const per = col.map((v, k) => (Math.abs(v) >= 0.02 ? `${AXES[k]} ${sgn(v, 2)} ${UNIT[k]}` : null)).filter(Boolean).join(', ');
    const pos = t.pos_com.map((v) => (v * 100).toFixed(0).replace('-', '−'));
    note.innerHTML = head + `<b>${t.index} ${t.name}</b>: ${nameWords(t.name)}. A positive command pushes the robot <b>${describeDir(t.dir)}</b>. ` +
      `ESC board ${t.board}, slot ${t.slot}; bytes ${t.slot * 2}–${t.slot * 2 + 1} of CAN frame <code>0x${t.can_id.toString(16).toUpperCase().padStart(3, '0')}</code>. ` +
      `${t.inverted ? 'Reverse-pitch propeller (<code>type: 1</code>): the firmware spins this motor backwards.' : 'Standard propeller (<code>type: 0</code>).'} ` +
      `From the centre of mass: ${pos[0]} cm forward, ${pos[1]} cm to port, ${pos[2]} cm up. Each newton gives ${per}.`;
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
    mpc: `<b>riptide_mpc</b> on the Orin. Every 50 ms it solves for eight thruster forces, inside ±${D.limits.per_thruster} N each and ${D.limits.total} N in total. <a href="control/thrusters.html">Thrusters and allocation</a> explains how.`,
    f2r: '<b>forceToRpm</b> inverts the T200 thrust curve (Blue Robotics data) for each thruster, then rounds to a whole rpm. Zero force means 0 rpm: stop.',
    can: '<b>Raw CAN frames</b> on <code>can0</code>, one per ESC board: IDs <code>0x0B0</code> (board 0) and <code>0x0F0</code> (board 1), four signed 16-bit RPMs each, high byte first. No ROS, no micro-ROS in between.',
    topic: '<b><code>thruster_forces</code></b> carries the same eight forces in newtons. The Nereus simulator applies them to its model of Talos; the Nereus viewer draws them as arrows.',
    req: '<b><code>command/requested_rpm</code></b> (<code>DshotCommand</code>) carries the eight RPMs sent to CAN, so a bag records what the ESC boards were asked for.',
    board: `<b>ESC board ×2.</b> The RP2040's first core takes the CAN frame; the second runs the RPM loop for four thrusters at about 2,400 Hz: feed-forward plus PI, clamped to ±${fw.hard_limit} of ±999. Targets older than ${fw.cmd_timeout_ms} ms stop the thrusters.`,
    esc: '<b>APD 80F3 ESC ×8</b>, firmware patched by the team to reverse in DShot mode. Each gets a 16-bit DShot600 frame every loop cycle and answers with its electrical RPM on the same wire.',
    t200: `<b>T200 thruster ×8.</b> Brushless, ${fw.pole_pairs} pole pairs: the ESC's electrical RPM divided by ${fw.pole_pairs} is the propeller RPM.`,
    poac: `<b>The POAC board</b> switches <code>MOTOR_PWR</code>, the ESC supply, off whenever Talos is killed. The ESC boards see their supply drop under ${fw.esc_on_mv / 1000} V and hold the thrusters off for ${fw.powerup_delay_ms / 1000} s after it returns.`,
    tele: '<b><code>state/thrusters/telemetry</code></b>, one message per board every 500 ms: disabled flags, supply voltage, loop count, and per ESC its RPM, temperature, voltage and current.',
  };
  const nodes = [
    { id: 'mpc', x: 95, y: 62, label: 'riptide_mpc', sub: '8 forces (N), 20 Hz', bold: true },
    { id: 'f2r', x: 290, y: 62, label: 'forceToRpm', sub: 'T200 curve' },
    { id: 'can', x: 480, y: 62, label: 'can0', sub: '0x0B0 · 0x0F0' },
    { id: 'board', x: 680, y: 62, label: 'ESC board ×2', sub: 'RPM loop, 2.4 kHz', bold: true },
    { id: 'tele', x: 870, y: 62, label: 'telemetry', sub: '2 Hz per board' },
    { id: 'topic', x: 95, y: 175, label: 'thruster_forces', sub: 'Nereus, viewer' },
    { id: 'req', x: 290, y: 175, label: 'requested_rpm', sub: 'for bags' },
    { id: 'poac', x: 480, y: 175, label: 'POAC', sub: 'kill → MOTOR_PWR' },
    { id: 'esc', x: 680, y: 175, label: 'APD 80F3 ×8', sub: 'patched ESCs', bold: true },
    { id: 't200', x: 680, y: 285, label: 'T200 ×8', sub: '7 pole pairs', bold: true },
  ];
  const edges = [
    { from: 'mpc', to: 'f2r' }, { from: 'f2r', to: 'can' }, { from: 'can', to: 'board', label: 'CAN' },
    { from: 'board', to: 'esc', label: 'DShot600', bend: -18, lx: 702, ly: 122, anchor: 'start' }, { from: 'esc', to: 'board', dash: true, label: 'RPM', bend: -18, lx: 658, ly: 122, anchor: 'end' },
    { from: 'esc', to: 't200', label: '3 phases' }, { from: 'poac', to: 'esc', label: 'power' },
    { from: 'mpc', to: 'topic' }, { from: 'f2r', to: 'req' }, { from: 'board', to: 'tele', dash: true },
  ];
  const narrow = {
    below: 620, width: 360, height: 560, bands: [],
    nodes: {
      mpc: { x: 90, y: 40 }, topic: { x: 268, y: 40 },
      f2r: { x: 90, y: 135 }, req: { x: 268, y: 135 },
      can: { x: 90, y: 230 },
      board: { x: 90, y: 330 }, tele: { x: 268, y: 330 },
      esc: { x: 90, y: 430 }, poac: { x: 268, y: 430 },
      t200: { x: 90, y: 520 },
    },
    edges: {
      'board>esc': { bend: -18, lx: 112, ly: 384, anchor: 'start' }, 'esc>board': { bend: -18, lx: 68, ly: 384, anchor: 'end' },
    },
  };
  const g = new Graph($('#path-graph'), {
    width: 960, height: 320, nodes, edges, narrow,
    bands: [
      { label: 'Orin', points: [[8, 22], [565, 22], [565, 222], [8, 222]] },
      { label: 'Board stack', points: [[580, 22], [770, 22], [770, 222], [580, 222]] },
    ],
    info: (n) => { note.innerHTML = n ? INFO[n.id] : 'Tap or hover a box for what it does.'; },
  });
  g.highlight(null);
}

// --------------------------------------------------------------------------------- one command step by step
function follow(D, TH) {
  const P = D.propeller, fw = D.firmware;
  const scale = P.rho * P.diameter ** 4 / 3600;
  const thrust = (rpm, k) => (k[0] + k[1] * rpm) * scale * rpm * rpm;
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

  function draw() {
    const F = +slider.value;
    out.textContent = `${F >= 0 ? '+' : '−'}${Math.abs(F).toFixed(1)} N`;
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
    const items = [
      ['The MPC asks', `<b>${sgn(F)} N</b> on thruster ${t.index} (${t.name}): push ${F === 0 ? 'nothing' : F > 0 ? describeDir(t.dir) : describeDir(t.dir.map((v) => -v))}. Published on <code>thruster_forces</code>.`],
      ['Force to RPM', F === 0 ? '0 N is <b>0 rpm</b>: stop the motor.' :
        `K<sub>T</sub> = ${k[0]} + ${k[1].toExponential(2).replace('e-5', '×10⁻⁵')} × ${Math.abs(rpmExact).toFixed(0)} = ${ktv.toFixed(4)}, so |F| = ${Math.abs(F).toFixed(1)} N needs <b>${rpm.toLocaleString('en-US')} rpm</b>.`],
      ['CAN frame', `ID <code>0x${t.can_id.toString(16).toUpperCase().padStart(3, '0')}</code> to ESC board ${t.board}, 8 data bytes (other thrusters at 0 here):<div class="th-bytes">${bytes.map((b, i) => `<span class="${(i >> 1) === t.slot ? 'on' : ''}">${hex(b)}</span>`).join('')}</div>${rpm < 0 ? 'Negative RPMs are sent as two\'s complement.' : ''}`],
      ['ESC board', `${t.inverted ? `Thruster ${t.index} is <b>inverted</b>: the loop flips its sign. ` : ''}Feed-forward for ${rpm.toLocaleString('en-US')} rpm: <b>${ffv}</b>${ffv !== clamped ? `, clamped to ${clamped}` : ''} of ±999${t.inverted && throttle ? `, sent as <b>${throttle}</b>` : ''}. The PI loop trims this from the measured RPM.`],
      ['DShot frame', `Value <b>${dval}</b> (${throttle > 0 ? '48 + throttle: one direction' : throttle < 0 ? '1048 + |throttle|: the other direction' : 'stop'}), telemetry bit 0, checksum ${crc.toString(2).padStart(4, '0')}:<div class="th-bits">${bits.map((b, i) => `<span class="${i < 11 ? 'v' : i < 12 ? 't' : 'c'}">${b}</span>`).join('')}</div>16 bits at 600 kbit/s: 27 µs, sent about 2,400 times a second.`],
      ['Motor', erpm ? `Turning <b>${t.inverted ? (rpm > 0 ? 'backwards' : 'forwards') : (rpm > 0 ? 'forwards' : 'backwards')}</b> as the ESC sees it, at ${Math.abs(rpm).toLocaleString('en-US')} rpm = ${erpm.toLocaleString('en-US')} electrical rpm. The ESC reports one electrical turn about every ${period.toFixed(0)} µs. Telemetry, in steps of 100 electrical rpm, shows about <b>${throttle < 0 ? '−' : ''}${telem.toLocaleString('en-US')} rpm</b>.` : 'Stopped.'],
      ['Thrust and current', F === 0 ? 'No thrust, no current.' : `${Math.abs(F).toFixed(1)} N ${F > 0 ? 'forward' : 'reverse'} thrust. At 18 V that draws about <b>${amps.toFixed(1)} A</b> (${(amps * 18).toFixed(0)} W).`],
    ];
    steps.innerHTML = items.map(([h, b]) => `<li><span class="th-step">${h}</span><div>${b}</div></li>`).join('');
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
function curves(D) {
  const volts = Object.keys(D.t200).map(Number).sort((a, b) => a - b);
  const base = css('--state') || '#2a78d6';
  const col = (i) => (i < 3 ? mix('#f3f7f7', base, 0.45 + i * 0.2) : mix(base, '#0f2633', (i - 3) * 0.28));
  let xMode = 'rpm', yMode = 'force';
  const chart = new LineChart($('#cur-chart'), { height: 300, digits: 1, xDigits: 0 });
  const fitBox = $('#cur-fit');
  seg($('#cur-x'), [['rpm', 'RPM'], ['pwm', 'Throttle']], xMode, (v) => { xMode = v; draw(); });
  seg($('#cur-y'), [['force', 'Thrust'], ['current', 'Current'], ['power', 'Power']], yMode, (v) => { yMode = v; draw(); });
  fitBox.addEventListener('change', draw);
  const P = D.propeller, scale = P.rho * P.diameter ** 4 / 3600;
  const thrust = (n, k) => (k[0] + k[1] * n) * scale * n * n;
  const rpmFor = (f, k) => { let lo = 0, hi = 6000; for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (thrust(m, k) < f) lo = m; else hi = m; } return lo; };
  const capF = rpmFor(D.limits.per_thruster, P.kt_forward), capR = rpmFor(D.limits.per_thruster, P.kt_reverse);

  function draw() {
    const yi = { force: 4, current: 2, power: 3 }[yMode];
    const series = volts.map((v, i) => {
      const pts = D.t200[v].map((r) => ({ x: xMode === 'rpm' ? (r[0] < 1500 ? -r[1] : r[1]) * (r[4] === 0 && r[1] === 0 ? 1 : 1) : (r[0] - 1500) / 4, y: r[yi] }))
        .filter((p) => xMode === 'pwm' || !(Math.abs(p.x) < 1 && p.y !== 0));
      pts.sort((a, b) => a.x - b.x);
      return { name: `${v} V`, color: col(i), values: pts, width: 1.8 };
    });
    if (fitBox.checked && yMode === 'force' && xMode === 'rpm') {
      const pts = [];
      for (let n = -3700; n <= 3950; n += 50) pts.push({ x: n, y: n < 0 ? -thrust(-n, P.kt_reverse) : thrust(n, P.kt_forward) });
      series.push({ name: 'MPC fit', color: css('--reference'), values: pts, dash: true, width: 2 });
    }
    const xLabel = xMode === 'rpm' ? 'rpm (reverse < 0)' : 'throttle (% of full, reverse < 0)';
    const yLabel = { force: 'thrust (N)', current: 'current (A)', power: 'power (W)' }[yMode];
    const markers = yMode === 'force' && xMode === 'rpm' ? [{ x: capF, label: '24 N' }, { x: -capR, label: '−24 N' }] : [];
    chart.set(series, { xLabel, yLabel, unit: { force: 'N', current: 'A', power: 'W' }[yMode], digits: yMode === 'power' ? 0 : 1, markers, yZero: yMode === 'force', xDomain: xMode === 'rpm' ? ($('#cur-chart').clientWidth < 520 ? [-3750, 3750] : [-4000, 4000]) : [-100, 100] });
    $('#cur-read').innerHTML = `<span>Talos's cap: <b>24 N</b> = <b>${Math.round(capF).toLocaleString('en-US')} rpm</b> forward, <b>${Math.round(capR).toLocaleString('en-US')} rpm</b> reverse (MPC fit)</span>`;
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
      name, color: colors[i], points: true, r: 3, opacity: 0.85,
      values: rows.map((r) => ({ x: xMode === 'rpm' ? r[1] : r[0], y: r[2] })).sort((a, b) => a.x - b.x),
    }));
    if (xMode === 'rpm') {
      const pts = [];
      for (let n = -3100; n <= 3100; n += 50) pts.push({ x: n, y: n < 0 ? -thrust(-n, P.kt_reverse) : thrust(n, P.kt_forward) });
      series.push({ name: 'Blue Robotics fit', color: css('--ink-2'), values: pts, dash: true, width: 1.8 });
    }
    chart.set(series, { xLabel: xMode === 'rpm' ? 'measured rpm' : 'raw ESC command (of ±999)', yZero: true, xDomain: xMode === 'rpm' ? [-3200, 3200] : [-750, 750] });
  }
  draw();
}

// -------------------------------------------------------------------------------------------- pool usage
function usage(D, TH) {
  const U = D.usage, host = $('#use-chart'), note = $('#use-note');
  let sel = null;
  const def = `${U.minutes} of ${U.minutes_total} minutes (releases, ramps and null-space patterns left out), ${U.samples.toLocaleString('en-US')} commands. The total of all eight was at the ${D.limits.total} N cap <b>${(U.total_at_cap * 100).toFixed(1)} %</b> of the time, ${Math.round(U.cap_in_runs * 100)} % of that in the speed runs; median total ${U.total_median} N. Tap or hover a row.`;
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
    note.innerHTML = `<b>${t.index} ${t.name}</b>: forward ${pc(U.forward[sel])}, reverse ${pc(U.reverse[sel])}, within ±${U.idle_band} N ${pc(U.idle[sel])}. Mean |F| ${U.mean_abs[sel]} N, 99th percentile ${U.p99_abs[sel]} N, largest ${U.max_abs[sel]} N; ${U.at_limit[sel] ? `at the 24 N limit ${pc(U.at_limit[sel])} of the time` : 'never at the 24 N limit'}.`;
  }
  new ResizeObserver(() => draw()).observe(host);
  tapOutside(host, () => { if (sel !== null) { sel = null; draw(); } });
  draw();
}

// ------------------------------------------------------------------------------------ one reversed thruster
function reversed(D, TH, T, pinv, MOTIONS, wrenchOf) {
  let motion = 'surge', rev = 0;
  seg($('#rev-m'), MOTIONS.map((m) => [m[0], m[1]]), motion, (v) => { motion = v; draw(); });
  seg($('#rev-t'), TH.map((t) => [t.index, t.name]), rev, (v) => { rev = v; draw(); });
  const host = $('#rev-chart'), note = $('#rev-note');
  function draw() {
    const m = MOTIONS.find((x) => x[0] === motion);
    const w = wrenchOf(m), f = mulMV(pinv, w);
    const fr = f.map((v, i) => (i === rev ? -v : v));
    const got = mulMV(T, fr);
    const W = Math.max(280, host.clientWidth || 600), lw = W < 480 ? 78 : 96, vw = 64, rowH = 30, H = AXES.length * rowH + 22;
    const spanF = Math.max(1, ...[0, 1, 2].flatMap((k) => [Math.abs(w[k]), Math.abs(got[k])]));
    const spanM = Math.max(0.5, ...[3, 4, 5].flatMap((k) => [Math.abs(w[k]), Math.abs(got[k])]));
    const x0 = lw, x1 = W - vw, zero = (x0 + x1) / 2;
    let span = spanF;
    const sx = (v) => zero + (v / span) * ((x1 - x0) / 2);
    host.innerHTML = '';
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Asked and produced wrench' }, host);
    el('line', { x1: zero, x2: zero, y1: 2, y2: H - 18, stroke: css('--muted') }, svg);
    AXES.forEach((a, k) => {
      const y = 4 + k * rowH;
      span = k < 3 ? spanF : spanM;
      el('text', { x: lw - 10, y: y + rowH / 2 + 2, 'text-anchor': 'end', class: 'label' }, svg).textContent = `${a} (${UNIT[k]})`;
      const ga = got[k], wa = w[k];
      if (Math.abs(ga) > 1e-3) el('rect', { x: Math.min(sx(0), sx(ga)), y: y + 5, width: Math.abs(sx(ga) - sx(0)), height: rowH - 12, fill: Math.abs(ga - wa) > 0.05 ? css('--accent') : css('--ink-2'), rx: 2 }, svg);
      if (Math.abs(wa) > 1e-3) el('rect', { x: Math.min(sx(0), sx(wa)), y: y + 3, width: Math.abs(sx(wa) - sx(0)), height: rowH - 8, fill: 'none', stroke: css('--ink'), 'stroke-width': 1.4, 'stroke-dasharray': '4 3', rx: 2 }, svg);
      el('text', { x: W - 4, y: y + rowH / 2 + 2, 'text-anchor': 'end', class: 'label' }, svg).textContent = Math.abs(ga) < 0.005 ? '0' : sgn(ga, 1);
    });
    el('text', { x: zero, y: H - 4, 'text-anchor': 'middle', class: 'label' }, svg).textContent = `bar ends: ±${spanF.toFixed(0)} N, ±${spanM.toFixed(1)} N·m`;
    const t = TH[rev];
    const k = m[3];
    const extra = AXES.map((a, j) => (j !== k && Math.abs(got[j]) >= 0.05 ? `${sgn(got[j])} ${UNIT[j]} of ${a}` : null)).filter(Boolean);
    const fk = f[rev];
    note.innerHTML = Math.abs(fk) < 0.3
      ? `<b>${t.name}</b> is hardly used for ${m[1].toLowerCase()} in this allocation (${sgn(fk)} N), so reversing it changes almost nothing here. Try another motion or thruster.`
      : `Asked for <b>${m[4]} ${UNIT[k]} of ${m[1].toLowerCase()}</b> (${m[2]}); ${t.name} should give ${sgn(fk)} N but gives ${sgn(-fk)} N. Result: ${sgn(got[k])} ${UNIT[k]} of ${m[1].toLowerCase()}${extra.length ? `, plus <b>${extra.join(', ')}</b> that nobody asked for` : ''}.`;
  }
  new ResizeObserver(() => draw()).observe(host);
  draw();
}

main();
