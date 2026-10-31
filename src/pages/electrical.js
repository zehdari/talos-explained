import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/electrical.css';
import { el, tapOutside } from '../viz/chart.js';
import { ClampedChart as LineChart } from '../viz/electrical-chart.js';
import { drawFlow } from '../viz/electrical-flow.js';

setup();

const DATA = BASE + 'data/electrical/';
const load = (f) => fetch(DATA + f).then((r) => r.json());
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '–');

// ---------------------------------------------------------------- T200 model (shared by the explorer)
// t200.json: per supply voltage, forward and reverse branches as [force N, current A, rpm].
function t200Model(t) {
  const volts = Object.keys(t.volts).map(Number).sort((a, b) => a - b);
  const interp = (pts, f) => {
    if (f <= 0) return 0;
    if (f <= pts[0][0]) return (pts[0][1] * f) / pts[0][0];
    for (let i = 1; i < pts.length; i++) if (f <= pts[i][0]) {
      const [f0, i0] = pts[i - 1], [f1, i1] = pts[i];
      return i0 + ((i1 - i0) * (f - f0)) / (f1 - f0);
    }
    return NaN; // beyond what a T200 can make at this voltage
  };
  const at = (v, f, dir) => interp(t.volts[v][dir], f);
  const max = (v, dir) => t.volts[v][dir].at(-1)[0];
  // current (A) of one thruster making `f` newtons in direction `dir` on a `v` volt supply
  const current = (f, v, dir = 'forward') => {
    v = Math.min(Math.max(v, volts[0]), volts.at(-1));
    const lo = volts.filter((x) => x <= v).at(-1), hi = volts.find((x) => x >= v);
    if (lo === hi) return at(lo, f, dir);
    const w = (v - lo) / (hi - lo);
    return (1 - w) * at(lo, f, dir) + w * at(hi, f, dir);
  };
  const maxForce = (v, dir = 'forward') => {
    v = Math.min(Math.max(v, volts[0]), volts.at(-1));
    const lo = volts.filter((x) => x <= v).at(-1), hi = volts.find((x) => x >= v);
    if (lo === hi) return max(lo, dir);
    const w = (v - lo) / (hi - lo);
    return (1 - w) * max(lo, dir) + w * max(hi, dir);
  };
  return { current, maxForce, volts };
}

// ---------------------------------------------------------------- 1. the system, one path at a time
const C = { power: 'var(--s8)', rail: 'var(--s4)', signal: 'var(--s7)', can: 'var(--state)', eth: 'var(--prediction)', video: 'var(--ink-2)' };
const LEGEND = {
  thrust: [['power', 'battery and thruster power'], ['signal', 'kill signals', true]],
  rails: [['power', 'battery bus'], ['rail', 'regulated rail']],
  can: [['can', 'internal CAN'], ['can', 'external CAN', true]],
  orin: [['eth', 'Ethernet'], ['video', 'GMSL2, header, M.2']],
};
const NOTES = {
  thrust: '<b>Thruster power.</b> Both packs meet at the ideal-diode OR. The kill MOSFETs are the only switch on this path, and they conduct only while the kill switch handle is in <em>and</em> the POAC\'s software says "run".',
  rails: '<b>The rails.</b> Each bar is one supply; the blocks under it are what it feeds. Apart from the thrusters, only the LED drivers and the IVC transmitter run straight from V+; everything else runs from the 15 V and 5 V modules.',
  can: '<b>One CAN bus, seven boards.</b> Every board hears every message; the order is just how the cable runs. Under each board, what it drives or reads.',
  orin: '<b>What plugs into the Orin itself.</b> One row per port; the CAN buses get their own step.',
};
const ORDER = ['thrust', 'rails', 'can', 'orin'];
const NEXT = { thrust: 'Next: the rails', rails: 'Next: the CAN bus', can: 'Next: the Orin', orin: 'Back to thruster power' };

// Step 1, drawn: packs to propellers.
const THRUST = {
  nodes: {
    bat_p: { label: 'Port pack', sub: '5S LiPo, 148 Wh' },
    bat_s: { label: 'Starboard pack', sub: '5S LiPo, 148 Wh' },
    or: { label: 'Ideal-diode OR', sub: 'POAC: makes V+' },
    kill: { label: 'Kill MOSFETs', sub: 'POAC: V+ to MOTOR_PWR' },
    ksw: { label: 'Kill switch', sub: 'handle, port bow window' },
    mcu: { label: 'POAC microcontroller', sub: 'software kill' },
    esc0: { label: 'ESC board 0', sub: '4 ESCs, 15 A fuses' },
    esc1: { label: 'ESC board 1', sub: '4 ESCs, 15 A fuses' },
    thr03: { label: 'Thrusters 0–3', sub: '4 × T200, 3 phases each' },
    thr47: { label: 'Thrusters 4–7', sub: '4 × T200, 3 phases each' },
    'go-rails': { label: 'V+ also feeds the rails →', ghost: true },
  },
  links: [
    { from: 'bat_p', to: 'or', color: C.power, width: 3, label: 'VPORT' },
    { from: 'bat_s', to: 'or', color: C.power, width: 3, label: 'VSTBD' },
    { from: 'or', to: 'kill', color: C.power, width: 3, label: 'V+' },
    { from: 'kill', to: 'esc0', color: C.power, width: 3, label: 'MOTOR_PWR' },
    { from: 'kill', to: 'esc1', color: C.power, width: 3 },
    { from: 'esc0', to: 'thr03', color: C.power, width: 3 },
    { from: 'esc1', to: 'thr47', color: C.power, width: 3 },
    { from: 'ksw', to: 'kill', color: C.signal, width: 1.8, dash: true, label: 'KILL_SWITCH' },
    { from: 'mcu', to: 'kill', color: C.signal, width: 1.8, dash: true, label: 'SOFTWARE_KILL' },
    { from: 'or', to: 'go-rails', color: C.rail, width: 2, dash: '2 4' },
  ],
  wide: {
    w: 1000, h: 300,
    at: { bat_p: [80, 100, 140], bat_s: [80, 200, 140], or: [262, 150, 150], kill: [480, 150, 170], ksw: [480, 40, 170], mcu: [480, 262, 170],
      esc0: [710, 100, 130], esc1: [710, 200, 130], thr03: [900, 100, 150], thr47: [900, 200, 150], 'go-rails': [262, 244] },
    route: { 'ksw>kill': 'v', 'mcu>kill': 'v', 'or>go-rails': 'v' },
    mid: { 'bat_p>or': 170, 'bat_s>or': 170, 'kill>esc0': 605, 'kill>esc1': 605 },
    labels: { 'bat_p>or': null, 'bat_s>or': null, 'or>kill': [366, 143], 'kill>esc0': [612, 154, 'start'],
      'ksw>kill': [488, 99, 'start'], 'mcu>kill': [488, 210, 'start'] },
  },
  narrow: {
    w: 330, h: 545,
    at: { bat_p: [83, 28, 150], bat_s: [247, 28, 150], or: [165, 112, 170], ksw: [76, 200, 146], mcu: [254, 200, 146], kill: [165, 290, 180],
      esc0: [83, 385, 150], esc1: [247, 385, 150], thr03: [83, 470, 150], thr47: [247, 470, 150], 'go-rails': [165, 528] },
    route: {
      'ksw>kill': [[76, 223], [76, 246], [112, 246], [112, 265]],
      'mcu>kill': [[254, 223], [254, 246], [218, 246], [218, 265]],
      'or>go-rails': null,
    },
    labels: { 'bat_p>or': null, 'bat_s>or': null, 'or>kill': [172, 161, 'start'], 'kill>esc0': [172, 331, 'start'], 'ksw>kill': null, 'mcu>kill': null },
  },
};

// Steps 2 to 4 are lists of chips: [node id or null, name, note].
const RAILS = [
  { id: 'or', name: 'V+', what: 'battery bus, 16–21 V', from: 'from the ideal-diode OR', color: C.power, loads: [
    ['kill', 'Kill MOSFETs', 'then ESCs, thrusters'], ['led', 'LED board', 'LED drivers'], ['ivc', 'IVC board', 'transmit amp, ±24 V'], ['schottky', 'Schottky diode', 'into both modules'],
  ] },
  { id: 'reg15', name: '15 V', what: 'PS1, 20 A', from: 'TDK-Lambda module', color: C.rail, loads: [
    ['orin', 'Jetson AGX Orin', 'switched by the cage board'], ['dvl', 'DVL', 'on its Ethernet cable'], ['reg12', '12 V LDO', 'for the servos'], [null, 'External CAN jacks', '15 V, on the cage board'],
  ] },
  { id: 'reg5', name: '5 V', what: 'PS2, 20 A', from: 'the same module', color: C.rail, loads: [
    [null, 'Every board\'s logic', 'through its own 3.3 V LDO'], ['sw', 'Network switch', ''], ['fans', 'Fans', 'cage and stack'], ['depth', 'Depth sensor', ''], ['ivc_rx', 'IVC receiver', '±5 V, isolated'],
  ] },
  { id: 'reg12', name: '12 V', what: '3 A', from: 'linear regulator, from 15 V', color: C.rail, loads: [
    ['servo', 'Launcher servo', 'lid connector'], ['claw', 'Claw servo', 'if on the same bus'],
  ] },
];
const CAN_CHAIN = [
  ['hat', 'Orin HAT', 'can0 on the Orin', [], true],
  ['ccbb', 'Camera cage board', 'id 4', [['depth', 'Depth sensor', 'I2C'], ['fans', 'Fans', ''], ['dvl', 'DVL power', '']]],
  ['mcu', 'POAC', 'id 1', [['ksw', 'Kill switch', 'J1'], ['servo', 'Launcher servo', 'serial'], ['claw', 'Claw servo', 'unconfirmed']]],
  ['esc0', 'ESC board 0', 'id 2', [['thr03', 'Thrusters 0–3', 'DShot']]],
  ['esc1', 'ESC board 1', 'id 3', [['thr47', 'Thrusters 4–7', 'DShot']]],
  ['ivc', 'IVC board', 'id 8', [['hyd', 'Hydrophone', 'pinger + IVC in'], ['xdcr', 'Transducer', 'IVC out']]],
  ['led', 'LED board', 'id 6', [[null, 'LED module', 'RGBW']], true],
];
// [port, colour, what plugs into the port, label for the second tier, what hangs off that]
const SPOKES = [
  ['Ethernet', C.eth, [['sw', 'Network switch', '5 V, a hub']], 'via the switch:', [['dvl', 'DVL', 'Nortek DVL1000'], ['tether', 'Tether', 'to the surface']]],
  ['GMSL2 card', C.video, [['ffc', 'ffc camera', 'ZED X Mini, forward'], ['dfc', 'dfc camera', 'ZED X Mini, down']]],
  ['40-pin header', C.video, [['hat', 'Orin HAT', 'CAN for both buses (step 3), RS-232']], 'via the HAT:', [['imu', 'VN-100 IMU', 'RS-232']]],
  ['M.2 slot', C.video, [['fogb', 'FOG board', 'RS-422 card']], 'via the card:', [['fog', 'Fibre-optic gyro', 'RS-422']]],
];

async function systemDiagram() {
  const sys = await load('system.json');
  const byId = Object.fromEntries(sys.nodes.map((n) => [n.id, n]));
  const names = Object.fromEntries(sys.nodes.map((n) => [n.id, n.card.title]));
  const fig = document.querySelector('.el-sys');
  const view = document.getElementById('sys-view');
  const card = document.getElementById('sys-card');
  const note = document.getElementById('sys-note');
  const next = document.getElementById('sys-next');
  const home = card.parentElement, homeNext = card.nextSibling;
  // selected = the node id whose card is open; key = the one element that was tapped (a node can appear twice)
  let step = 'thrust', selected = null, key = null, narrow = false, nkey = 0;

  const chip = ([id, name, sub], cls = '') => {
    const inner = `<b>${esc(name)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    return id && byId[id]
      ? `<button type="button" class="el-chip ${cls}" data-id="${id}" data-key="k${nkey++}" aria-pressed="false">${inner}</button>`
      : `<span class="el-chip static ${cls}">${inner}</span>`;
  };

  function render() {
    nkey = 0;
    note.innerHTML = NOTES[step];
    next.textContent = NEXT[step];
    document.getElementById('sys-legend').innerHTML = LEGEND[step].map(([k, t, dash]) =>
      `<span><i class="${dash ? 'dash' : ''}" style="background:${C[k]};color:${C[k]}"></i>${t}</span>`).join('');
    if (card.parentElement !== home) home.insertBefore(card, homeNext);
    if (step === 'thrust') {
      drawFlow(view, THRUST, { narrow, selected, label: 'Thruster power path', onPick: (id) => {
        if (id === 'go-rails') return go('rails');
        pick(id === selected ? null : id);
      } });
    } else if (step === 'rails') {
      view.innerHTML = `<div class="el-rails-v">${RAILS.map((r) => `
        <div class="el-rail" style="--k:${r.color}">
          <button type="button" class="el-rail-h" data-id="${r.id}" data-key="k${nkey++}" aria-pressed="false"><b>${r.name}</b><span>${esc(r.what)}</span><small>${esc(r.from)}</small></button>
          <ul class="el-loads">${r.loads.map((l) => `<li>${chip(l)}</li>`).join('')}</ul>
        </div>`).join('')}
        <p class="el-rail-33"><b>3.3 V</b> is made on each board by its own LDO from 5 V, for that board's RP2040 and CAN chip.</p></div>`;
    } else if (step === 'can') {
      view.innerHTML = `
        <div class="el-bus-h"><b>Internal CAN</b> <span>can0 · classic CAN, 1 Mbit/s · on the Mini-Fit stack-link cables</span></div>
        <ol class="el-bus">${CAN_CHAIN.map(([id, name, sub, leaves, end], i) => `
          <li class="el-bus-i${end ? ' end' : ''}"><span class="el-n">${i + 1}</span>${chip([id, name, sub], 'board')}
            ${end ? '<span class="el-term">chain end: 120 Ω belongs here</span>' : ''}
            ${leaves.length ? `<ul class="el-leaves">${leaves.map((l) => `<li>${chip(l, 'leaf')}</li>`).join('')}</ul>` : ''}</li>`).join('')}
        </ol>
        <p class="el-bus-note">Termination (120 Ω) belongs at the two ends of the chain; which board switches are on in Talos isn't recorded.</p>
        <div class="el-bus-h ext"><b>External CAN</b> <span>can1 · 250 kbit/s · battery telemetry, not reaching ROS since 2026-10-27</span></div>
        <div class="el-ext">${chip(['hat', 'Orin HAT', 'can1'])}<i></i>${chip(['ccbb', 'Camera cage board', 'EXT. CAN jacks'])}<i></i><span class="el-pair">${chip(['bat_p', 'Port pack', 'id 1'])}${chip(['bat_s', 'Starboard pack', 'id 2'])}</span></div>`;
    } else {
      view.innerHTML = `<div class="el-hub">
        <div class="el-hub-c">${chip(['orin', 'Jetson AGX Orin', 'main computer, camera cage'], 'hub')}</div>
        <ul class="el-spokes">${SPOKES.map(([port, color, items, via, more]) => `
          <li style="--k:${color}"><span class="el-port">${port}</span><span class="el-chain">${items.map((x) => chip(x)).join('')}${via ? `<span class="el-via">${via}</span>${more.map((x) => chip(x, 'leaf')).join('')}` : ''}</span></li>`).join('')}
        </ul></div>`;
    }
    showCard(selected);
    mark();
  }
  const mark = () => view.querySelectorAll('[data-key]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));

  function showCard(id) {
    card.hidden = !id;
    if (!id) { card.innerHTML = ''; return; }
    const d = byId[id].card;
    const links = sys.edges.filter((e) => e.from === id || e.to === id);
    const group = (layer, title) => {
      const ls = links.filter((e) => e.layer === layer);
      return ls.length ? `<div class="el-links"><span>${title}</span><ul>${ls.map((e) => {
        const other = e.from === id ? e.to : e.from;
        return `<li><b>${e.from === id ? 'to' : 'from'} ${esc(names[other])}</b>: ${esc(e.desc)}${e.inferred ? ' (inferred)' : ''}</li>`;
      }).join('')}</ul></div>` : '';
    };
    card.innerHTML = `
      <div class="el-card-head"><b>${esc(d.title)}</b>${d.inferred ? '<span class="el-tag">partly unconfirmed</span>' : ''}<button type="button" class="el-x" aria-label="Close">×</button></div>
      <p>${esc(d.what)}</p>
      <dl class="spec">${d.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${group('power', 'Power')}${group('data', 'Data')}
      <div class="el-card-foot">${d.link ? `<a href="${d.link.href}">${esc(d.link.text)}</a>` : ''}${d.source ? `<a href="${d.source}" target="_blank" rel="noopener">Source</a>` : ''}</div>`;
    card.querySelector('.el-x').addEventListener('click', () => pick(null));
  }

  function pick(id, from) {
    selected = id;
    key = id ? from?.dataset.key ?? null : null;
    if (step === 'thrust') render();
    else {
      mark();
      showCard(id);
    }
    if (!id) return;
    // On a phone the card opens under the row that was tapped, so it never sits far from its block.
    const row = narrow && from?.closest('.el-rail, .el-bus-i, .el-spokes > li, .el-ext');
    if (row) row.after(card);
    else if (card.parentElement !== home) home.insertBefore(card, homeNext);
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function go(s) {
    step = s;
    selected = null;
    key = null;
    document.querySelectorAll('#sys-step button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.step === s)));
    render();
  }

  view.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-key]');
    if (b) pick(b.dataset.key === key ? null : b.dataset.id, b);
  });
  document.querySelectorAll('#sys-step button').forEach((b) => b.addEventListener('click', () => go(b.dataset.step)));
  next.addEventListener('click', () => {
    go(ORDER[(ORDER.indexOf(step) + 1) % ORDER.length]);
    fig.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });
  const layout = () => {
    const n = view.clientWidth < 880; // below this the drawn step would shrink its text under 11 px
    fig.classList.toggle('el-narrow', n);
    if (n === narrow && view.childElementCount) return;
    narrow = n;
    render();
  };
  new ResizeObserver(layout).observe(view);
  layout();
}

// ---------------------------------------------------------------- 1b. the POAC's power section, redrawn
const REG = {
  reg: {
    nodes: {
      vp: { label: 'V+', sub: 'battery bus', static: true },
      sch: { label: 'Schottky diode', sub: 'MBRB2545CT', static: true },
      ps1: { label: 'PS1: TDK-Lambda, 20 A', sub: 'trim resistor 1.24 kΩ', static: true },
      ps2: { label: 'PS2: the same module', sub: 'trim resistor 8.56 kΩ', static: true },
      r15: { label: '15 V', sub: 'Orin, DVL', static: true },
      r5: { label: '5 V', sub: 'logic, switch, fans', static: true },
      ldo: { label: 'MIC29300-12 LDO', sub: '12 V, 3 A: servos', static: true },
    },
    links: [
      { from: 'vp', to: 'sch', color: C.power, width: 3 },
      { from: 'sch', to: 'ps1', color: C.power, width: 3, label: 'Vreg' }, { from: 'sch', to: 'ps2', color: C.power, width: 3 },
      { from: 'ps1', to: 'r15', color: C.rail, width: 2.6 }, { from: 'ps2', to: 'r5', color: C.rail, width: 2.6 },
      { from: 'r15', to: 'ldo', color: C.rail, width: 2.6 },
    ],
    wide: {
      w: 900, h: 220,
      at: { vp: [55, 110, 90], sch: [205, 110, 150], ps1: [440, 55, 220], ps2: [440, 165, 220], r15: [640, 55, 110], r5: [640, 165, 130], ldo: [810, 55, 150] },
      mid: { 'sch>ps1': 322, 'sch>ps2': 322 },
      labels: { 'sch>ps1': [301, 102, 'middle'] },
    },
    narrow: {
      w: 330, h: 390,
      nodes: { ps1: { label: 'PS1, TDK-Lambda', sub: '20 A, trim 1.24 kΩ' }, ps2: { label: 'PS2, same module', sub: '20 A, trim 8.56 kΩ' } },
      at: { vp: [165, 24, 120], sch: [165, 100, 200], ps1: [83, 195, 156], ps2: [247, 195, 156], r15: [83, 280, 150], r5: [247, 280, 150], ldo: [83, 362, 150] },
      labels: { 'sch>ps1': [172, 140, 'start'] },
    },
  },
};
function regFigure() {
  const host = document.getElementById('reg-view');
  let narrow = null;
  new ResizeObserver(() => {
    const n = host.clientWidth < 800;
    if (n === narrow) return;
    narrow = n;
    drawFlow(host, REG.reg, { narrow, label: 'The regulators' });
  }).observe(host);
}

// ---------------------------------------------------------------- 2. battery voltage ladder
async function voltLadder(pool) {
  const bat = await load('battery.json');
  const host = document.getElementById('volt-ladder');
  const note = document.getElementById('volt-note');
  // 18.5 V is both the pack's nominal voltage and the diagnostics warning: one mark, both meanings.
  const nominal = bat.marks.find((m) => m.id === 'nominal');
  const marks = bat.marks.filter((m) => m.id !== 'nominal').map((m) => (m.id === 'warn'
    ? { ...m, label: 'Nominal, warning', text: `The pack's nominal voltage: its capacity is quoted here (8 Ah × ${nominal.pack_v} V = 148 Wh). Also the diagnostics warning: ${m.text}` } : m));
  const T = pool.totals;
  const defaultNote = '<b>Swap packs by 17.5 V</b> (3.5 V per cell). The BMS turns a pack off at 16 V. Tap a mark for the others.';
  note.innerHTML = defaultNote;
  let selected = null;
  const draw = () => {
    host.innerHTML = '';
    const W = host.clientWidth || 600;
    const vertical = W < 560;
    const lo = 14.5, hi = 21.5;
    const svg = el('svg', { class: 'chart el-ladder', role: 'img', 'aria-label': 'Pack voltage scale with the battery limits marked' }, host);
    let H, pos;
    if (!vertical) {
      H = 140;
      const x0 = 30, x1 = W - 30;
      pos = (v) => x0 + ((v - lo) / (hi - lo)) * (x1 - x0);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const y = 70;
      // usable range shading and the pool-run band
      el('rect', { x: pos(16), y: y - 7, width: pos(20.75) - pos(16), height: 14, rx: 3, fill: 'var(--paper-3)' }, svg);
      el('rect', { x: pos(T.v_min), y: y - 7, width: pos(T.v_start) - pos(T.v_min), height: 14, fill: 'var(--state)', opacity: 0.35 }, svg);
      el('rect', { x: pos(T.v_end), y: y - 7, width: pos(T.v_start) - pos(T.v_end), height: 14, fill: 'var(--state)', opacity: 0.6 }, svg);
      el('text', { x: (pos(T.v_min) + pos(T.v_start)) / 2, y: y + 56, 'text-anchor': 'middle', class: 'axisc' }, svg).textContent = 'pool run, 2026-10-26';
      el('line', { x1: x0, x2: x1, y1: y, y2: y, stroke: 'var(--ink-2)' }, svg);
      for (let v = 15; v <= 21; v++) {
        el('line', { x1: pos(v), x2: pos(v), y1: y + 7, y2: y + 12, stroke: 'var(--muted)' }, svg);
        el('text', { x: pos(v), y: y + 25, 'text-anchor': 'middle', class: 'axisv' }, svg).textContent = `${v} V`;
        el('text', { x: pos(v), y: y + 39, 'text-anchor': 'middle', class: 'axisc' }, svg).textContent = `${(v / 5).toFixed(1)}/cell`;
      }
      // labels above the scale in two staggered rows, so neighbours never collide
      marks.forEach((m, i) => {
        const g = el('g', { class: 'mark', tabindex: 0 }, svg);
        const x = pos(m.pack_v), ly = i % 2 ? 36 : 16;
        const c = m.id === 'warn' ? 'var(--s4)' : 'var(--s8)';
        el('line', { x1: x, x2: x, y1: ly + 5, y2: y - 6, stroke: c, 'stroke-width': 1.5 }, g);
        el('circle', { cx: x, cy: y, r: 5, fill: c, stroke: 'var(--paper-2)', 'stroke-width': 2 }, g);
        const t = el('text', { x, y: ly, 'text-anchor': i === 0 ? 'start' : x > W - 140 ? 'end' : 'middle', class: 'mlabel' }, g);
        t.textContent = `${m.label} ${m.pack_v} V`;
        el('rect', { x: x - 30, y: ly - 14, width: 60, height: y - ly + 22, fill: 'transparent' }, g);
        bind(g, m);
      });
    } else {
      // phone: the scale runs down the left, labels to the right
      H = 420;
      const y0 = 24, y1 = H - 24, x = 64;
      pos = (v) => y1 - ((v - lo) / (hi - lo)) * (y1 - y0);
      svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
      el('rect', { x: x - 7, y: pos(20.75), width: 14, height: pos(16) - pos(20.75), rx: 3, fill: 'var(--paper-3)' }, svg);
      el('rect', { x: x - 7, y: pos(T.v_start), width: 14, height: pos(T.v_min) - pos(T.v_start), fill: 'var(--state)', opacity: 0.35 }, svg);
      el('rect', { x: x - 7, y: pos(T.v_start), width: 14, height: pos(T.v_end) - pos(T.v_start), fill: 'var(--state)', opacity: 0.6 }, svg);
      el('line', { x1: x, x2: x, y1: y0, y2: y1, stroke: 'var(--ink-2)' }, svg);
      for (let v = 15; v <= 21; v++) {
        el('line', { x1: x - 12, x2: x - 7, y1: pos(v), y2: pos(v), stroke: 'var(--muted)' }, svg);
        el('text', { x: x - 16, y: pos(v) + 4, 'text-anchor': 'end', class: 'axisv' }, svg).textContent = `${v} V`;
      }
      // Labels keep at least GAP px between baselines: close marks (Charged 20.75 V, Overvoltage 21 V) are pushed
      // apart and joined to their dot by a bent leader. Each tap area runs halfway to its neighbours' labels.
      const GAP = 26;
      const ms = marks.map((m) => ({ m, y: pos(m.pack_v) })).sort((p, q) => p.y - q.y);
      ms.forEach((o, i) => { o.ly = i ? Math.max(o.y, ms[i - 1].ly + GAP) : o.y; });
      for (let i = ms.length - 2; i >= 0; i--) ms[i].ly = Math.min(ms[i].ly, ms[i + 1].ly - GAP);
      ms.forEach((o, i) => {
        const { m, y, ly } = o;
        const g = el('g', { class: 'mark', tabindex: 0 }, svg);
        const c = m.id === 'warn' ? 'var(--s4)' : 'var(--s8)';
        el('path', { d: `M${x + 8},${y} H${x + 18} L${x + 26},${ly} H${x + 30}`, fill: 'none', stroke: c, 'stroke-width': 2 }, g);
        el('circle', { cx: x, cy: y, r: 5, fill: c, stroke: 'var(--paper-2)', 'stroke-width': 2 }, g);
        el('text', { x: x + 34, y: ly + 4, class: 'mlabel' }, g).textContent = `${m.label}, ${m.pack_v} V`;
        const top = i ? (ms[i - 1].ly + ly) / 2 : ly - 16, bot = i < ms.length - 1 ? (ly + ms[i + 1].ly) / 2 : ly + 16;
        el('rect', { x: 0, y: top, width: W, height: bot - top, fill: 'transparent' }, g);
        bind(g, m);
      });
      el('text', { x: x + 34, y: pos((T.v_start + T.v_min) / 2) + 4, class: 'axisc' }, svg).textContent = `pool run, ${T.v_min}-${T.v_start} V`;
    }
    if (selected) svg.querySelectorAll('.mark').forEach((g) => g.classList.toggle('on', g.__m === selected));
  };
  function bind(g, m) {
    g.__m = m;
    const show = () => {
      selected = m;
      host.querySelectorAll('.mark').forEach((x) => x.classList.toggle('on', x === g));
      note.innerHTML = `<b>${esc(m.label)}: ${m.pack_v} V</b> (${m.cell_v} V per cell). ${esc(m.text)} <a href="${m.source}" target="_blank" rel="noopener">Source</a>`;
    };
    g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    g.addEventListener('pointerdown', show);
    g.addEventListener('focus', show);
  }
  tapOutside(host, () => {
    selected = null;
    host.querySelectorAll('.mark').forEach((x) => x.classList.remove('on'));
    note.innerHTML = defaultNote;
  });
  new ResizeObserver(draw).observe(host);
  draw();
}

// ---------------------------------------------------------------- 3. power budget explorer
function budgetExplorer(T200, pool) {
  const ENERGY_WH = 2 * 148, FUSE_ESC = 15, FUSE_BOARD = 60, PACK_LIMIT = 45;
  const s = { thrust: 73, n: 4, dir: 'forward', volts: 19.5, hotel: 45 };
  const tot = pool.totals;
  const presets = [
    { label: 'Pool-run average', set: { thrust: Math.round(tot.mean_thrust_n), n: 8, dir: 'forward' }, note: `The 2026-10-26 run averaged ${tot.mean_thrust_n} N in total. Spread evenly, that is cheaper than the real, uneven spread (estimated ${tot.est_mean_current_a} A on average).` },
    { label: '73 N on 8', set: { thrust: 73, n: 8, dir: 'forward' }, note: 'The full software budget, shared by all eight thrusters.' },
    { label: '73 N on 4', set: { thrust: 73, n: 4, dir: 'forward' }, note: 'The full software budget on four thrusters, as in a straight surge: more current for the same thrust than on eight.' },
    { label: '24 N each, reverse', set: { thrust: 192, n: 8, dir: 'reverse' }, note: 'Every thruster at its 24 N limit in reverse. The 73 N total cap never allows this; it shows what the fuses would see.' },
  ];
  const host = document.getElementById('bud-presets');
  const pnote = document.createElement('div');
  pnote.className = 'el-pnote';
  presets.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.textContent = p.label;
    b.addEventListener('click', () => {
      Object.assign(s, p.set);
      host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      pnote.textContent = p.note;
      sync();
      update();
    });
    host.appendChild(b);
  });
  host.after(pnote);

  const ctl = document.getElementById('bud-controls');
  ctl.innerHTML = `
    <label>Total thrust <input type="range" id="b-thrust" min="0" max="192" step="1"><output></output></label>
    <label>Shared by <input type="range" id="b-n" min="1" max="8" step="1"><output></output></label>
    <div class="seg" role="group" aria-label="Thrust direction"><button type="button" data-d="forward">Forward</button><button type="button" data-d="reverse">Reverse</button></div>
    <details class="el-assume"><summary>Adjust assumptions</summary>
      <label>Bus voltage <input type="range" id="b-v" min="16" max="20.7" step="0.1"><output></output></label>
      <label>Electronics <input type="range" id="b-h" min="0" max="150" step="5"><output></output></label>
    </details>`;
  const $ = (id) => document.getElementById(id);
  // open on wide screens, a tap away on a phone
  if (ctl.clientWidth > 520 || innerWidth > 900) ctl.querySelector('details').open = true;
  const sync = () => {
    $('b-thrust').value = s.thrust; $('b-n').value = s.n; $('b-v').value = s.volts; $('b-h').value = s.hotel;
    ctl.querySelectorAll('[data-d]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.d === s.dir)));
  };
  ctl.addEventListener('input', () => {
    s.thrust = +$('b-thrust').value; s.n = +$('b-n').value; s.volts = +$('b-v').value; s.hotel = +$('b-h').value;
    host.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    pnote.textContent = '';
    update();
  });
  ctl.querySelectorAll('[data-d]').forEach((b) => b.addEventListener('click', () => { s.dir = b.dataset.d; sync(); update(); }));

  const chart = new LineChart($('bud-chart'), { height: 270, xLabel: 'thrust per thruster (N)', yLabel: 'current per thruster (A)', digits: 1, unit: 'A', xDigits: 1 });
  const curve = (dir, v) => {
    const out = [], fmax = T200.maxForce(v, dir);
    for (let f = 0; f <= fmax; f += 0.5) out.push({ x: f, y: T200.current(f, v, dir) });
    return out.filter((p) => Number.isFinite(p.y));
  };
  const bars = $('bud-bars'), readout = $('bud-readout');
  // Every bar on the same footing: its own limit sits at 80% of the track, so the rows can be compared by eye.
  const LIM = 80;
  // `alone` (pack row only): the current if one pack carried the whole bus, drawn as a second tick.
  function bar(label, value, limit, limitLabel, alone = null) {
    const f = value / limit;
    const fa = alone === null ? 0 : alone / limit;
    const cls = !Number.isFinite(f) ? '' : f > 1 || fa > 1 ? ' over' : f > 0.6 ? ' near' : '';
    const w = Number.isFinite(f) ? Math.min(100, f * LIM) : 0;
    const tick = Number.isFinite(fa) && fa > 0 ? `<i class="el-alone" style="left:${Math.min(99.5, fa * LIM)}%"></i>` : '';
    const note = Number.isFinite(f) ? `${Math.round(f * 100)}% of the limit` : '';
    const aloneNote = Number.isFinite(fa) && fa > 0
      ? `; <span class="${fa > 1 ? 'el-warn' : ''}">one pack alone (red tick): ${fmt(alone)} A${fa > 1 ? ', over the limit' : ''}</span>` : '';
    return `<div class="el-bar${cls}"><div class="el-bar-l">${label}</div><div class="el-bar-v">${Number.isFinite(value) ? fmt(value) + ' A' : 'n/a'}</div>
      <div class="el-bar-t"><span style="width:${w}%"></span>${tick}<em style="left:${LIM}%"></em><u style="left:${LIM}%">${limitLabel}</u></div>
      <div class="el-bar-n">${note}${aloneNote}</div></div>`;
  }
  function update() {
    $('b-thrust').nextElementSibling.textContent = `${s.thrust} N`;
    $('b-n').nextElementSibling.textContent = `${s.n} thruster${s.n > 1 ? 's' : ''}`;
    $('b-v').nextElementSibling.textContent = `${s.volts.toFixed(1)} V`;
    $('b-h').nextElementSibling.textContent = `${s.hotel} W`;
    const each = s.thrust / s.n;
    const fmax = T200.maxForce(s.volts, s.dir);
    const i1 = T200.current(each, s.volts, s.dir);
    const board = Math.ceil(s.n / 2) * i1; // thrusters split as evenly as they can be over the two ESC boards
    const thrA = s.n * i1, hotelA = s.hotel / s.volts, bus = thrA + hotelA;
    const P = bus * s.volts;
    const hours = ENERGY_WH / P;
    const half = bus / 2;
    bars.innerHTML =
      bar('Each thruster', i1, FUSE_ESC, '15 A fuse') +
      bar('Busiest ESC board', board, FUSE_BOARD, '60 A fuse') +
      bar('Each pack, if shared evenly', half, PACK_LIMIT, '45 A', Number.isFinite(bus) ? bus : null);
    const beyond = !Number.isFinite(i1);
    let packs = '';
    if (!beyond && half > PACK_LIMIT) packs = ' Even shared evenly, each pack is over its 45 A limit: the BMS would cut out after 5 s.';
    else if (!beyond && bus > PACK_LIMIT) packs = ` Shared evenly, each pack gives ${fmt(half)} A. But the ideal-diode OR lets the higher pack carry everything until the two voltages meet, and ${fmt(bus)} A from one pack would trip its 45 A limit after 5 s.`;
    readout.innerHTML = beyond
      ? `<b>${fmt(each)} N per thruster is more than a T200 makes</b> at ${s.volts.toFixed(1)} V (${fmt(fmax)} N ${s.dir}).`
      : `<b>${fmt(each)} N</b> per thruster ${s.dir}: ${fmt(i1, 2)} A each, <b>${fmt(thrA)} A</b> for the thrusters, plus about ${fmt(hotelA)} A for the electronics (assumed ${s.hotel} W, not measured). That is ${fmt(P, 0)} W from the packs: about ${hours >= 10 ? fmt(hours, 0) : fmt(hours, 1)} h on 296 Wh at this load.${each > 24 ? ' Above the 24 N per-thruster software limit.' : ''}${s.thrust > 73 ? ' Above the 73 N total limit.' : ''}${packs}`;
    chart.set([
      { name: 'forward', color: 'var(--state)', values: curve('forward', s.volts) },
      { name: 'reverse', color: 'var(--reference)', values: curve('reverse', s.volts) },
      { name: '15 A fuse', color: 'var(--s8)', dash: true, width: 1.5, values: [{ x: 0, y: 15 }, { x: 50, y: 15 }], noTip: true },
      { name: 'this load', color: 'var(--ink)', points: true, r: 5.5, opacity: 1, values: beyond ? [] : [{ x: each, y: i1 }], noTip: true },
    ], { xDomain: [0, 50], yDomain: [0, 30], markers: [{ x: 24, label: '24 N limit' }] });
  }
  host.querySelectorAll('button')[2].click(); // 73 N on 4: the bars visibly fill
}

// ---------------------------------------------------------------- 4. the pool run
function poolRun(pool) {
  const cols = Object.fromEntries(pool.columns.map((c, i) => [c, i]));
  const R = pool.rows;
  const series = (c, scale = 1) => R.map((r) => ({ x: r[cols.t] / 60, y: r[cols[c]] * scale }));
  const T = pool.totals;
  const a = new LineChart(document.getElementById('pool-thrust'), { height: 170, yLabel: 'total thrust (N)', digits: 1, unit: 'N', xDigits: 1 });
  a.set([
    { name: 'commanded thrust, sum of |force|', color: 'var(--ink-2)', values: series('f'), width: 1.4 },
    { name: '73 N cap', color: 'var(--s8)', dash: true, width: 1.4, values: [{ x: 0, y: 73 }, { x: R.at(-1)[0] / 60, y: 73 }], noTip: true },
  ], { yDomain: [0, 80] });
  const b = new LineChart(document.getElementById('pool-current'), { height: 170, yLabel: 'thruster current (A)', digits: 2, unit: 'A', xDigits: 1 });
  b.set([
    { name: 'estimated from T200 data', color: 'var(--reference)', values: series('iest'), width: 1.4 },
    { name: 'reported by the ESCs', color: 'var(--state)', values: series('i'), width: 2 },
  ], { yDomain: [0, 28] });
  const c = new LineChart(document.getElementById('pool-volts'), { height: 170, xLabel: 'minutes', yLabel: 'bus voltage at the ESCs (V)', digits: 2, unit: 'V', xDigits: 1 });
  c.set([{ name: 'bus voltage', color: 'var(--state)', values: series('v'), width: 1.4 }], { yDomain: [18.8, 20.1] });

  // voltage dip against estimated current, and the fitted resistance
  const v = R.map((r) => r[cols.v]);
  const dip = v.map((_, i) => {
    const w = v.slice(Math.max(0, i - 60), i + 60).sort((p, q) => p - q);
    return v[i] - w[w.length >> 1];
  });
  const I = R.map((r) => r[cols.iest]);
  const n = I.length, mx = I.reduce((p, q) => p + q, 0) / n, my = dip.reduce((p, q) => p + q, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (I[i] - mx) * (dip[i] - my); sxx += (I[i] - mx) ** 2; syy += (dip[i] - my) ** 2; }
  const slope = sxy / sxx, icpt = my - slope * mx, r = sxy / Math.sqrt(sxx * syy);
  const d = new LineChart(document.getElementById('pool-sag'), { height: 250, xLabel: 'estimated thruster current (A)', yLabel: 'voltage dip (mV)', digits: 0, unit: 'mV', xDigits: 1 });
  d.set([
    { name: 'one second of the run', color: 'var(--state)', points: true, r: 2, opacity: 0.35, values: I.map((x, i) => ({ x, y: dip[i] * 1000 })), noTip: true },
    { name: `fit, ${(-slope * 1000).toFixed(0)} mΩ`, color: 'var(--s8)', width: 2, values: Array.from({ length: 55 }, (_, k) => ({ x: k / 2, y: (icpt + slope * (k / 2)) * 1000 })) },
  ], { xDomain: [0, 27], yDomain: [-750, 250] });

  const floor = Math.round(T.esc_current_at_floor_frac * 100);
  document.getElementById('pool-facts').innerHTML = `
    <li><strong>Thrust.</strong> ${T.mean_thrust_n} N in total on average; it hit the 73 N cap in the fastest runs.</li>
    <li><strong>Estimated current.</strong> ${T.est_mean_current_a} A on average, ${T.est_peak_current_a} A at the peak: ${T.est_energy_wh} Wh for the thrusters over ${(T.duration_s / 60).toFixed(1)} minutes, about ${Math.round((T.est_energy_wh / 296) * 100)}% of both packs.</li>
    <li><strong>The ESCs' own current field isn't usable.</strong> It read its floor, 0.04 A, in ${floor}% of the seconds. Their RPM and voltage readings are fine.</li>
    <li><strong>Voltage.</strong> The bus fell from ${T.v_start} V to ${T.v_end} V, with dips to ${T.v_min} V under load: about ${(-slope).toFixed(3)} V per estimated amp (r = ${r.toFixed(2)}), so the estimate and the voltage agree. ESC temperature peaked at ${T.temp_max} °C.</li>`;
}

// ---------------------------------------------------------------- go
systemDiagram();
regFigure();
Promise.all([load('t200.json'), load('pool_power.json')]).then(([t, pool]) => {
  const T200 = t200Model(t);
  voltLadder(pool);
  budgetExplorer(T200, pool);
  poolRun(pool);
});
