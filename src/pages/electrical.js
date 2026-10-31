import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/electrical.css';
import { Graph } from '../viz/graph.js';
import { LineChart, el, tapOutside } from '../viz/chart.js';

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

// ---------------------------------------------------------------- 1. the block diagram
const KIND = {
  battery: { layer: 'power', color: 'var(--s8)', width: 3.2, name: 'Battery and thruster power' },
  motor: { layer: 'power', color: 'var(--s8)', width: 3.2 },
  rail: { layer: 'power', color: 'var(--s4)', width: 2, name: 'Regulated rails' },
  can: { layer: 'data', color: 'var(--state)', width: 2.4, name: 'CAN' },
  can2: { layer: 'data', color: 'var(--state)', width: 1.6 },
  eth: { layer: 'data', color: 'var(--prediction)', width: 2, name: 'Ethernet' },
  serial: { layer: 'data', color: 'var(--s7)', width: 1.5, name: 'Serial, I2C, GMSL2, DShot, kill lines' },
  signal: { layer: 'data', color: 'var(--s7)', width: 1.5 },
  i2c: { layer: 'data', color: 'var(--s7)', width: 1.5 },
  gmsl: { layer: 'data', color: 'var(--s7)', width: 1.5 },
};

// The wide layout (viewBox 1090 x 640), hand-placed: power flows left to right (batteries, POAC, its loads, the camera
// cage) and the CAN chain runs down the column of stack boards, as in the 2026 design report's architecture figure.
const WIDE = {
  ksw: [70, 130], bat_p: [70, 245], bat_s: [70, 325],
  kill: [235, 130], or: [235, 285],
  mcu: [405, 60], reg12: [405, 350], reg15: [405, 430], reg5: [405, 510],
  esc0: [575, 60], esc1: [575, 130], ivc: [575, 200], led: [575, 270], servo: [575, 350], depth: [555, 515], dvl: [575, 600],
  thr03: [745, 60], thr47: [745, 130], tether: [745, 215], sw: [745, 300], ccbb: [745, 440], fans: [745, 580],
  hat: [895, 300], orin: [895, 440], fogb: [895, 580],
  imu: [1020, 300], zed: [1020, 440], fog: [1020, 580],
};
// Control points that steer a link around other blocks.
const VIA = {
  'ccbb>mcu': [405, 350], 'hat>bat_p': [480, 830], 'hat>bat_s': [470, 760],
  'sw>dvl': [660, 520], 'hat>ccbb': [840, 400], 'mcu>servo': [470, 260],
};
// Phones get the same blocks as an indented tree instead: [id, how it connects, link kind, children].
const POWER_TREE = [
  ['bat_p', 'VPORT, Anderson PP45 into POAC J3', 'battery'],
  ['bat_s', 'VSTBD, Anderson PP45 into POAC J4', 'battery'],
  ['or', 'both packs in; out comes V+, the battery bus', 'battery', [
    ['kill', 'V+; the kill switch and software decide', 'battery', [
      ['esc0', 'MOTOR_PWR, Redcube terminals', 'motor', [['thr03', 'three phases each', 'motor']]],
      ['esc1', 'MOTOR_PWR, Redcube terminals', 'motor', [['thr47', 'three phases each', 'motor']]],
    ]],
    ['led', 'V+ on the stack link, for the LED drivers', 'battery'],
    ['ivc', 'V+ on the stack link, for the ±24 V converter', 'battery'],
    ['reg15', 'Vreg: V+ through a Schottky diode', 'rail', [
      ['reg12', '15 V in', 'rail', [['servo', '12 V on the lid connector', 'rail']]],
      ['ccbb', '15 V on the camera-cage cable', 'rail', [
        ['orin', 'switched 15 V', 'rail', [
          ['hat', '40-pin header', 'rail', [['imu', '5 V', 'rail']]],
          ['fogb', 'M.2 slot', 'rail', [['fog', '5 V (boosted, then regulated)', 'rail']]],
        ]],
        ['dvl', '15 V on two spare pins of its Ethernet cable', 'rail'],
      ]],
    ]],
    ['reg5', 'Vreg', 'rail', [
      ['ccbb', '5 V on the camera-cage cable', 'rail', [
        ['sw', '5 V', 'rail'], ['depth', '5 V', 'rail'], ['fans', 'switched 5 V', 'rail'],
      ]],
    ]],
  ]],
];
const DATA_TREE = [
  ['orin', 'the main computer', 'serial', [
    ['hat', '40-pin header', 'serial', [
      ['ccbb', 'internal CAN FD (can0), 1 / 5 Mbit/s', 'can', [
        ['mcu', 'CAN FD', 'can', [
          ['esc0', 'CAN FD', 'can', [['esc1', 'CAN FD', 'can', [['ivc', 'CAN FD', 'can', [['led', 'CAN FD', 'can']]]]]]],
          ['kill', 'SOFTWARE_KILL line', 'signal'],
          ['servo', 'serial, 115200 baud', 'serial'],
        ]],
        ['depth', 'I2C', 'i2c'],
      ]],
      ['bat_p', 'external CAN (can1), 250 kbit/s', 'can2'],
      ['bat_s', 'external CAN (can1), 250 kbit/s', 'can2'],
      ['imu', 'RS-232', 'serial'],
    ]],
    ['sw', 'Ethernet', 'eth', [['dvl', 'Ethernet, through the cage board', 'eth'], ['tether', 'Ethernet', 'eth']]],
    ['fogb', 'M.2', 'serial', [['fog', 'RS-422', 'serial']]],
    ['zed', 'GMSL2', 'gmsl'],
  ]],
  ['ksw', 'KILL_SWITCH line', 'signal', [['kill', 'drives MOTOR_EN with SOFTWARE_KILL', 'signal']]],
  ['esc0', '', 'signal', [['thr03', 'DShot600, RPM back', 'signal']]],
  ['esc1', '', 'signal', [['thr47', 'DShot600, RPM back', 'signal']]],
];

async function systemDiagram() {
  const sys = await load('system.json');
  const host = document.getElementById('sys-graph');
  const card = document.getElementById('sys-card');
  const byId = Object.fromEntries(sys.nodes.map((n) => [n.id, n]));
  const names = Object.fromEntries(sys.nodes.map((n) => [n.id, n.card.title]));
  const nodes = sys.nodes.map((n) => ({ id: n.id, x: WIDE[n.id][0], y: WIDE[n.id][1], label: n.label, sub: n.sub, w: 120, data: n }));
  // A pair joined by both a power and a data link: bow the data one so both show.
  const pairs = new Set(sys.edges.filter((e) => KIND[e.kind].layer === 'power').map((e) => `${e.from}>${e.to}`));
  const edges = sys.edges.map((e) => {
    const k = KIND[e.kind], key = `${e.from}>${e.to}`;
    const twin = k.layer === 'data' && pairs.has(key);
    return { ...e, color: k.color, width: k.width, dash: e.inferred || e.kind === 'can2', arrow: false, label: null, via: VIA[key], bend: twin ? 16 : 0, layer: k.layer };
  });
  const bands = [
    { label: 'POAC BOARD', points: [[172, 28], [470, 28], [470, 545], [172, 545]], lx: 178, ly: 22 },
    { label: 'BOARD STACK', points: [[510, 28], [640, 28], [640, 290], [510, 290]], lx: 515, ly: 22 },
    { label: 'CAMERA CAGE', points: [[680, 270], [1084, 270], [1084, 600], [680, 600]], lx: 1000, ly: 264 },
  ];
  let mode = 'power', selected = null;
  const hint = '<span class="el-hint">Tap or hover a block.</span>';
  const wide = document.createElement('div');
  const tree = document.createElement('div');
  tree.className = 'el-tree-wrap';
  host.append(wide, tree);
  const graph = new Graph(wide, {
    width: 1090, height: 640, nodes, edges, bands, arrows: false,
    info: (n) => { applyMode(); if (n) { selected = n.id; showCard(selected); } }, // the card keeps the last block shown, so its links stay clickable
  });

  function showCard(id) {
    if (!id) { card.innerHTML = hint; return; }
    const d = byId[id].card;
    const links = sys.edges.filter((e) => (e.from === id || e.to === id) && (mode === 'both' || KIND[e.kind].layer === mode));
    card.innerHTML = `
      <div class="el-card-head"><b>${esc(d.title)}</b>${d.inferred ? '<span class="el-tag">partly unconfirmed</span>' : ''}</div>
      <p>${esc(d.what)}</p>
      <dl class="spec">${d.rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${links.length ? `<div class="el-links"><span>${mode === 'both' ? 'Links' : mode === 'power' ? 'Power links' : 'Data links'}</span><ul>${links.map((e) => {
        const other = e.from === id ? e.to : e.from;
        return `<li><i style="background:${KIND[e.kind].color}"></i>${e.from === id ? 'to' : 'from'} <b>${esc(names[other])}</b>: ${esc(e.desc)}${e.inferred ? ' (inferred)' : ''}</li>`;
      }).join('')}</ul></div>` : ''}
      <div class="el-card-foot">${d.link ? `<a href="${d.link.href}">${esc(d.link.text)}</a>` : ''}${d.source ? `<a href="${d.source}" target="_blank" rel="noopener">Source</a>` : ''}</div>`;
  }
  function applyMode() {
    const shown = new Set();
    for (const e of graph.edges) {
      const on = mode === 'both' || e.layer === mode;
      e.path.style.display = on ? '' : 'none';
      if (on) { shown.add(e.from); shown.add(e.to); }
    }
    graph.nodes.forEach((n, id) => n.g.classList.toggle('off', !shown.has(id)));
  }

  // ---- the phone tree
  const item = ([id, how, kind, kids]) => `<li style="--k:${KIND[kind].color}"${kind === 'can2' ? ' class="dash"' : ''}><button type="button" data-id="${id}"${id === selected ? ' aria-pressed="true"' : ''}><b>${esc(byId[id].label)}</b> <small>${esc(byId[id].sub)}</small></button>${how ? `<span class="el-how">${esc(how)}</span>` : ''}${kids ? `<ul>${kids.map(item).join('')}</ul>` : ''}</li>`;
  function drawTree() {
    const parts = [];
    if (mode !== 'data') parts.push(`<div class="el-tree-h">Power, from the batteries down</div><ul class="el-tree">${POWER_TREE.map(item).join('')}</ul>`);
    if (mode !== 'power') parts.push(`<div class="el-tree-h">Data, from the Orin out</div><ul class="el-tree">${DATA_TREE.map(item).join('')}</ul>`);
    if (tree.contains(card)) { home.insertBefore(card, homeNext); card.style.marginLeft = card.style.width = ''; }
    tree.innerHTML = parts.join('');
  }
  // On a phone the card opens right under the tapped name; on a wide screen it sits under the diagram.
  const home = card.parentElement, homeNext = card.nextSibling;
  tree.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (!b) return;
    const same = selected === b.dataset.id && tree.contains(card);
    selected = same ? null : b.dataset.id;
    tree.querySelectorAll('button[data-id]').forEach((x) => x.setAttribute('aria-pressed', String(x === b && !same)));
    showCard(selected);
    if (selected) {
      (b.nextElementSibling?.classList.contains('el-how') ? b.nextElementSibling : b).after(card);
      // full width of the tree, whatever the indent
      card.hidden = false;
      card.style.marginLeft = '0px';
      card.style.marginLeft = `${tree.getBoundingClientRect().left - card.getBoundingClientRect().left}px`;
      card.style.width = `${tree.clientWidth}px`;
    }
    card.hidden = !selected;
  });
  const layout = () => {
    const narrow = host.clientWidth < 640;
    wide.hidden = narrow;
    tree.hidden = !narrow;
    if (!narrow && card.parentElement !== home) { home.insertBefore(card, homeNext); card.style.marginLeft = card.style.width = ''; }
    card.hidden = narrow && !tree.contains(card);
  };
  new ResizeObserver(layout).observe(host);
  layout();

  document.querySelectorAll('#sys-mode button').forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    document.querySelectorAll('#sys-mode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    graph.highlight(graph.selected ?? null);
    drawTree();
    showCard(selected);
    layout();
    legend();
  }));
  function legend() {
    const items = Object.values(KIND).filter((k) => k.name && (mode === 'both' || k.layer === mode));
    document.getElementById('sys-legend').innerHTML = items.map((k) => `<span><i style="background:${k.color};height:${Math.min(k.width, 3)}px"></i>${k.name}</span>`).join('')
      + (mode !== 'power' ? '<span><i class="dash" style="color:var(--state)"></i>external CAN</span>' : '');
  }
  legend();
  drawTree();
  graph.highlight(null);
  card.innerHTML = hint;
}

// ---------------------------------------------------------------- 2. battery voltage ladder
async function voltLadder(pool) {
  const bat = await load('battery.json');
  const host = document.getElementById('volt-ladder');
  const note = document.getElementById('volt-note');
  const marks = bat.marks.filter((m) => m.id !== 'nominal');
  const nominal = bat.marks.find((m) => m.id === 'nominal');
  const T = pool.totals;
  const defaultNote = `<b>${nominal.pack_v} V nominal</b> (${nominal.cell_v} V per cell): ${esc(nominal.text)}`;
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
      H = 128;
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
        const t = el('text', { x: x + (i === marks.length - 1 ? 0 : 0), y: ly, 'text-anchor': i === 0 ? 'start' : x > W - 140 ? 'end' : 'middle', class: 'mlabel' }, g);
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
      marks.forEach((m) => {
        const g = el('g', { class: 'mark', tabindex: 0 }, svg);
        const y = pos(m.pack_v);
        const c = m.id === 'warn' ? 'var(--s4)' : 'var(--s8)';
        el('line', { x1: x + 8, x2: x + 28, y1: y, y2: y, stroke: c, 'stroke-width': 2 }, g);
        el('circle', { cx: x, cy: y, r: 5, fill: c, stroke: 'var(--paper-2)', 'stroke-width': 2 }, g);
        el('text', { x: x + 34, y: y + 4, class: 'mlabel' }, g).textContent = `${m.label}, ${m.pack_v} V`;
        el('rect', { x: 0, y: y - 14, width: W, height: 28, fill: 'transparent' }, g);
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
  note.insertAdjacentHTML('afterend', '');
}

// ---------------------------------------------------------------- 3. power budget explorer
function budgetExplorer(T200, pool) {
  const ENERGY_WH = 2 * 148, FUSE_ESC = 15, FUSE_BOARD = 60, PACK_LIMIT = 45;
  const s = { thrust: 24, n: 8, dir: 'forward', volts: 19.5, hotel: 45 };
  const tot = pool.totals;
  const presets = [
    { label: 'Pool-run average', set: { thrust: Math.round(tot.mean_thrust_n), n: 8, dir: 'forward' }, note: `The 2026-10-26 run averaged ${tot.mean_thrust_n} N in total. Spread evenly, that is cheaper than the real, uneven spread (estimated ${tot.est_mean_current_a} A on average).` },
    { label: '73 N on 8', set: { thrust: 73, n: 8, dir: 'forward' }, note: 'The full software budget, shared by all eight thrusters.' },
    { label: '73 N on 4', set: { thrust: 73, n: 4, dir: 'forward' }, note: 'The same budget on four thrusters, as in pure surge: more current for the same thrust.' },
    { label: '24 N each, reverse', set: { thrust: 192, n: 8, dir: 'reverse' }, note: 'Every thruster at its 24 N limit in reverse. The software never allows this much in total (73 N cap); it shows what the fuses would see.' },
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
    <label>Bus voltage <input type="range" id="b-v" min="16" max="20.7" step="0.1"><output></output></label>
    <label>Electronics <input type="range" id="b-h" min="0" max="150" step="5"><output></output></label>
    <div class="seg" role="group" aria-label="Thrust direction"><button type="button" data-d="forward">Forward</button><button type="button" data-d="reverse">Reverse</button></div>`;
  const $ = (id) => document.getElementById(id);
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
  function bar(label, value, limit, limitLabel, max) {
    const over = value > limit;
    const w = Math.min(100, (value / max) * 100), lw = (limit / max) * 100;
    return `<div class="el-bar${over ? ' over' : ''}"><div class="el-bar-l">${label}</div><div class="el-bar-t"><span style="width:${w}%"></span><em style="left:${lw}%" title="${limitLabel}"></em></div><div class="el-bar-v">${Number.isFinite(value) ? fmt(value) + ' A' : 'n/a'}</div><div class="el-bar-n">${limitLabel}</div></div>`;
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
    bars.innerHTML =
      bar('Each thruster', i1, FUSE_ESC, '15 A ESC fuse', 50) +
      bar('Busiest ESC board', board, FUSE_BOARD, '60 A board fuse', 120) +
      bar('Battery bus', bus, PACK_LIMIT, '45 A for 5 s, per pack', 120);
    const beyond = !Number.isFinite(i1);
    readout.innerHTML = beyond
      ? `<b>${fmt(each)} N per thruster is more than a T200 makes</b> at ${s.volts.toFixed(1)} V (${fmt(fmax)} N ${s.dir}).`
      : `<b>${fmt(each)} N</b> per thruster ${s.dir}: ${fmt(i1, 2)} A each, ${fmt(thrA)} A for the thrusters (${fmt(thrA * s.volts, 0)} W) plus ${fmt(hotelA)} A of electronics. <b>${fmt(P, 0)} W</b> from the packs: about <b>${hours >= 10 ? fmt(hours, 0) : fmt(hours, 1)} h</b> on 296 Wh.${each > 24 ? ' Above the 24 N per-thruster software limit.' : ''}${s.thrust > 73 ? ' Above the 73 N total limit.' : ''}${bus > PACK_LIMIT ? ' One pack alone would trip its 45 A limit after 5 s; both packs sharing would not.' : ''}`;
    chart.set([
      { name: 'forward', color: 'var(--state)', values: curve('forward', s.volts) },
      { name: 'reverse', color: 'var(--reference)', values: curve('reverse', s.volts) },
      { name: '15 A fuse', color: 'var(--s8)', dash: true, width: 1.5, values: [{ x: 0, y: 15 }, { x: 50, y: 15 }], noTip: true },
      { name: 'this load', color: 'var(--ink)', points: true, r: 5.5, opacity: 1, values: beyond ? [] : [{ x: each, y: i1 }], noTip: true },
    ], { xDomain: [0, 50], yDomain: [0, 30], markers: [{ x: 24, label: '24 N limit' }] });
  }
  presets[0] && host.querySelector('button').click();
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
    { name: `fit: ${(-slope * 1000).toFixed(0)} mΩ, r = ${r.toFixed(2)}`, color: 'var(--s8)', width: 2, values: [{ x: 0, y: icpt * 1000 }, { x: 27, y: (icpt + slope * 27) * 1000 }] },
  ], { xDomain: [0, 27], yDomain: [-750, 250] });

  const floor = Math.round(T.esc_current_at_floor_frac * 100);
  document.getElementById('pool-facts').innerHTML = `
    <li><strong>Thrust.</strong> ${T.mean_thrust_n} N in total on average, and it hit the 73 N cap in the fastest runs.</li>
    <li><strong>Estimated current.</strong> ${T.est_mean_current_a} A on average, ${T.est_peak_current_a} A at the peak. That's ${T.est_charge_ah} Ah or ${T.est_energy_wh} Wh for the thrusters over ${(T.duration_s / 60).toFixed(1)} minutes, about ${Math.round((T.est_energy_wh / 296) * 100)}% of both packs.</li>
    <li><strong>The ESCs' own current field isn't usable.</strong> It read the floor value, 0.04 A per ESC, in ${floor}% of the seconds, and their charge counters add up to only ${T.esc_consumption_ah} Ah. Their RPM and voltage readings track fine.</li>
    <li><strong>Voltage.</strong> The bus fell from ${T.v_start} V to ${T.v_end} V over the run, with dips to ${T.v_min} V under load. It sags about ${(-slope).toFixed(3)} V per estimated amp (r = ${r.toFixed(2)}), so the T200 estimate and the voltage agree. At the 45 A pack limit, that sag would be about ${(-slope * 45).toFixed(1)} V.</li>
    <li><strong>ESC temperature</strong> peaked at ${T.temp_max} °C.</li>`;
}

// ---------------------------------------------------------------- 5. design rules
async function rulesTable() {
  const r = await load('rules.json');
  const host = document.getElementById('rules');
  const maxMm = Math.max(...r.stackup.map((l) => l.mm));
  host.innerHTML = `
    <table class="params el-rules"><thead><tr><th>Rule</th><th>mm</th><th>What it means</th></tr></thead><tbody>
    ${r.rules.map((x) => `<tr><td>${esc(x.label)}</td><td>${x.mm}</td><td>${esc(x.means)}</td></tr>`).join('')}
    </tbody></table>
    <div class="el-stack" aria-label="Board stackup">
      <div class="el-stack-h">Stackup, ${r.total_mm} mm in total (layers not to scale)</div>
      ${r.stackup.map((l) => `<div class="el-layer ${l.kind}"><i style="height:${l.kind === 'copper' ? 6 : Math.max(14, (l.mm / maxMm) * 60)}px"></i><span>${esc(l.name)}${l.material ? ` · ${esc(l.material)}` : ''} · ${l.mm} mm${l.kind === 'copper' ? ` (${Math.round((l.mm / 0.035) * 10) / 10} oz)` : ''}</span></div>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------- go
systemDiagram();
Promise.all([load('t200.json'), load('pool_power.json')]).then(([t, pool]) => {
  const T200 = t200Model(t);
  voltLadder(pool);
  budgetExplorer(T200, pool);
  poolRun(pool);
});
rulesTable();
