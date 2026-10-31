import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/ros2.css';
import { Graph } from '../viz/graph.js';
import { el } from '../viz/chart.js';

setup();

const BASE = import.meta.env.BASE_URL;
const GH_MSGS = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
// Long ROS names may break after / and _ instead of widening a phone screen.
const brk = (s) => esc(s).replace(/([_/])/g, '$1<wbr>');
// HTML elements (el() from chart.js makes SVG ones).
const h = (tag, attrs = {}, parent) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};
const short = (name) => (name.startsWith('/talos/') ? name.slice(7) : name);

const dataP = Promise.all(
  ['ros2/graph.json', 'ros2/interfaces.json'].map((f) => fetch(BASE + 'data/' + f).then((r) => r.json())),
);

// ======================================================================================
// 1. The ROS graph explorer
// ======================================================================================
// Rows of the diagram, top to bottom, roughly in the order data flows: sensors (the simulator), estimation,
// perception, the tree, the controller, and the operator's laptop.
const GROUPS = [
  { id: 'simulator', label: 'Simulator', where: 'sim only', color: 'var(--s7)', order: ['physics_simulator', 'sim_supervisor'] },
  { id: 'navigation', label: 'Navigation', where: 'Orin', color: 'var(--state)', order: ['depth_converter', 'ekf_localization_node', 'robot_state_publisher', 'joint_state_publisher', 'odom_to_world_broadcaster'] },
  { id: 'perception', label: 'Perception', where: 'Orin', color: 'var(--prediction)', order: ['yolo_orientation', 'riptide_mapping2', 'apriltag_36h11', 'tag_container', 'world_to_map', 'surface_frame_node'] },
  { id: 'autonomy', label: 'Autonomy', where: 'Orin', color: 'var(--s4)', order: ['autonomy', 'ActuatorTranslator'] },
  { id: 'control', label: 'Control', where: 'Orin', color: 'var(--reference)', order: ['mpc_controller', 'controller_overseer', 'calibrate_drag'] },
  { id: 'acoustics', label: 'Acoustics', where: 'Orin', color: 'var(--muted)', order: ['riptide_acoustics'] },
  { id: 'operator', label: 'Operator', where: 'your laptop', color: 'var(--s5)', order: ['viewer_panels', 'nereus_viewer', 'viewer_plots', 'nereus_viewer_timing'] },
];
const GROUP = Object.fromEntries(GROUPS.map((g) => [g.id, g]));
const RUNS = {
  robot: 'Robot stack. On Talos it runs on the Orin; in Nereus, on your computer next to the simulator.',
  'sim only': 'Simulator only: it does not exist on the robot.',
  'sim and real robot (operator laptop)': 'Operator laptop, with the simulator or with the real robot.',
};
const PARAM_SRV = /\/(get_parameters|set_parameters|set_parameters_atomically|list_parameters|describe_parameters|get_parameter_types)$/;

const measure = document.createElement('canvas').getContext('2d');
function textW(s, size = 12, weight = 400) {
  measure.font = `${weight} ${size}px 'Archivo Variable', Archivo, system-ui, sans-serif`;
  return measure.measureText(s).width;
}

function fmtHz(v) {
  if (v === null || v === undefined) return null;
  if (v === 0) return '0';
  return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(1);
}
function rateTag(t) {
  if (!t) return '';
  const v = t.hz2 || t.hz;
  if (v === null || v === undefined) return 'no pub';
  if (!v) return 'quiet';
  return fmtHz(v) + ' Hz';
}
function fmtBytes(b) {
  if (!b) return null;
  return b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1000 ? (b / 1000).toFixed(1) + ' kB' : Math.round(b) + ' B';
}

class RosGraph {
  constructor(data, ifaces) {
    this.d = data;
    this.root = document.getElementById('rg-graph');
    this.detail = document.getElementById('rg-detail');
    this.nodes = new Map(data.nodes.map((n) => [n.id, n]));
    this.topics = new Map(data.topics.map((t) => [t.name, t]));
    this.infra = new Set(data.infra);
    this.defs = new Map(ifaces.map((i) => [`riptide_msgs2/${i.kind}/${i.name}`, i]));
    // Services and actions: who serves and who calls each one.
    this.svcs = new Map();
    const svc = (name, type, kind) => {
      if (!this.svcs.has(name)) this.svcs.set(name, { name, type, kind, servers: [], clients: [] });
      return this.svcs.get(name);
    };
    for (const n of data.nodes) {
      n.srv.forEach(([s, ty]) => svc(s, ty, 'service').servers.push(n.id));
      n.asrv.forEach(([s, ty]) => svc(s, ty, 'action').servers.push(n.id));
      n.cli.forEach(([s, ty]) => svc(s, ty, 'service').clients.push(n.id));
      n.acli.forEach(([s, ty]) => svc(s, ty, 'action').clients.push(n.id));
    }
    for (const e of data.edges) e.svc = e.via.every((v) => !this.topics.has(v));
    this.state = { filter: null, sel: null, preview: null };
    this.history = [];
    this.width = 0;
    this.buildControls();
    this.draw();
    new ResizeObserver(() => {
      const w = this.root.clientWidth;
      if (w && Math.abs(w - this.width) > 1) this.draw();
    }).observe(this.root);
    this.detail.addEventListener('click', (e) => {
      const b = e.target.closest('[data-go]');
      if (!b) return;
      if (b.dataset.go === 'back') {
        const prev = this.history.pop();
        this.select(prev || null, false);
        return;
      }
      if (b.dataset.go === 'group') { this.setFilter(b.dataset.id); return; }
      this.select({ k: b.dataset.go, id: b.dataset.id });
    });
  }

  // ---------- controls: subsystem chips and search ----------
  buildControls() {
    const chips = document.getElementById('rg-chips');
    const mk = (id, label, color, count) => {
      const b = h('button', { type: 'button', class: 'rg-chip', 'aria-pressed': 'false' }, chips);
      b.dataset.id = id || '';
      b.innerHTML = (color ? `<i style="background:${color}"></i>` : '') + esc(label) + (count ? ` <small>${count}</small>` : '');
      b.addEventListener('click', () => this.setFilter(id && this.state.filter !== id ? id : null));
      return b;
    };
    this.chipEls = [mk(null, 'Everything', null, this.d.nodes.length)];
    for (const g of GROUPS) {
      const n = this.d.nodes.filter((x) => x.group === g.id).length;
      if (n) this.chipEls.push(mk(g.id, g.label, g.color, n));
    }
    const legend = h('div', { class: 'rg-legend' });
    legend.innerHTML = '<span><i></i>topic</span><span><i class="dash"></i>service or action call</span><span class="txt">Hz: measured in sim on a loaded desktop, not a robot spec</span><span class="txt"><b>quiet</b>: sent nothing while Talos held still</span>';
    document.getElementById('rg-results').after(legend);
    const q = document.getElementById('rg-q');
    const res = document.getElementById('rg-results');
    let hits = [];
    let cur = 0;
    const show = () => {
      const s = q.value.trim().toLowerCase();
      if (!s) { res.hidden = true; return; }
      hits = [];
      for (const n of this.d.nodes) if (n.id.toLowerCase().includes(s)) hits.push({ k: 'node', id: n.id, tag: 'node' });
      for (const t of this.d.topics) if (t.name.toLowerCase().includes(s)) hits.push({ k: 'topic', id: t.name, tag: 'topic' });
      for (const v of this.svcs.values()) if (!PARAM_SRV.test(v.name) && v.name.toLowerCase().includes(s)) hits.push({ k: 'svc', id: v.name, tag: v.kind });
      hits = hits.slice(0, 16);
      cur = 0;
      res.innerHTML = hits.length
        ? hits.map((h, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}"><span>${brk(h.id)}</span><small>${h.tag}</small></button>`).join('')
        : '<div class="rg-none">Nothing in the capture matches.</div>';
      res.hidden = false;
    };
    const pick = (i) => {
      const h = hits[i];
      if (!h) return;
      q.value = '';
      res.hidden = true;
      this.select({ k: h.k, id: h.id });
    };
    q.addEventListener('input', show);
    q.addEventListener('focus', show);
    q.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { res.hidden = true; q.blur(); }
      if (e.key === 'Enter') { e.preventDefault(); pick(cur); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        cur = Math.max(0, Math.min(hits.length - 1, cur + (e.key === 'ArrowDown' ? 1 : -1)));
        res.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === cur));
      }
    });
    res.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) pick(+b.dataset.i); });
    document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.rg-search, .rg-results')) res.hidden = true; });
  }

  setFilter(id) {
    this.state.filter = id || null;
    this.state.sel = null;
    this.history = [];
    this.chipEls.forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.id || null) === this.state.filter)));
    this.refresh();
  }

  select(sel, remember = true) {
    const cur = this.state.sel;
    if (remember && cur && !(sel && cur.k === sel.k && cur.id === sel.id)) this.history.push(cur);
    if (!sel) this.history = [];
    this.state.sel = sel;
    this.state.preview = null;
    this.refresh();
  }

  // ---------- layout and drawing ----------
  draw() {
    const W = Math.max(280, this.root.clientWidth || 600);
    this.width = W;
    const narrow = W < 560;
    const LBL = narrow ? 0 : 104; // the left column for row labels
    const padX = narrow ? 6 : 10, gap = narrow ? 8 : 12, nodeH = 28, lineGap = narrow ? 12 : 14, padY = 10;
    const size = narrow ? 11.5 : 12;
    const pos = new Map();
    const bands = [];
    let y = 0;
    for (const g of GROUPS) {
      const ns = g.order.map((label) => this.d.nodes.find((n) => n.label === label)).filter(Boolean);
      // anything not in the hand-made order still gets drawn
      this.d.nodes.filter((n) => n.group === g.id && !ns.includes(n)).forEach((n) => ns.push(n));
      if (!ns.length) continue;
      const top = y;
      let yy = top + padY + (narrow ? 17 : 0);
      const avail = W - LBL - 2 * padX;
      const items = ns.map((n) => ({ n, w: Math.ceil(textW(n.label, size) + 24) }));
      const lines = [];
      let line = [], lw = 0;
      for (const it of items) {
        if (line.length && lw + gap + it.w > avail) { lines.push(line); line = []; lw = 0; }
        lw += (line.length ? gap : 0) + it.w;
        line.push(it);
      }
      if (line.length) lines.push(line);
      for (const ln of lines) {
        const sum = ln.reduce((a, it) => a + it.w, 0);
        // spread a line's boxes evenly; a line that only just fits is packed and centred
        const s = Math.max(gap, (avail - sum) / (ln.length + 1));
        const tight = sum + s * (ln.length + 1) > avail;
        let x = LBL + padX + (tight ? (avail - sum - gap * (ln.length - 1)) / 2 : s);
        for (const it of ln) {
          pos.set(it.n.id, { x: x + it.w / 2, y: yy + nodeH / 2, w: it.w, h: nodeH, n: it.n });
          x += it.w + (tight ? gap : s);
        }
        yy += nodeH + lineGap;
      }
      const bottom = yy - lineGap + padY;
      bands.push({ g, top, bottom });
      y = bottom + 6;
    }
    const H = y;
    this.pos = pos;

    const svg = el('svg', { class: 'rg-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'Talos ROS graph' });
    const uid = Math.random().toString(36).slice(2, 7);
    const defs = el('defs', {}, svg);
    for (const [id, c, o] of [['a', 'var(--ink-2)', 0.4], ['h', 'var(--accent)', 1]]) {
      const m = el('marker', { id: `rg-${id}-${uid}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: c, 'fill-opacity': o }, m);
    }
    this.mk = { a: `url(#rg-a-${uid})`, h: `url(#rg-h-${uid})` };
    this.bandEls = new Map();
    const gB = el('g', {}, svg);
    for (const b of bands) {
      const r = el('rect', { class: 'rg-band', x: 0, y: b.top, width: W, height: b.bottom - b.top, rx: 8 }, gB);
      this.bandEls.set(b.g.id, r);
      if (narrow) {
        const t = el('text', { class: 'rg-blabel', x: 10, y: b.top + 15 }, gB);
        t.textContent = b.g.label.toUpperCase();
        const s = el('text', { class: 'rg-bsub', x: 14 + textW(b.g.label.toUpperCase(), 10.5, 650) * 1.08, y: b.top + 15 }, gB);
        s.textContent = '· ' + b.g.where;
      } else {
        const mid = (b.top + b.bottom) / 2;
        const t = el('text', { class: 'rg-blabel', x: 12, y: mid - 2 }, gB);
        t.textContent = b.g.label.toUpperCase();
        const s = el('text', { class: 'rg-bsub', x: 12, y: mid + 12 }, gB);
        s.textContent = b.g.where;
      }
    }

    // Edge ends spread along the side of each box they meet, sorted by where the other end is, so arrows into a
    // busy node don't all land on one point.
    const ends = new Map();
    const addEnd = (id, side, other, key) => {
      const k = id + side;
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push({ other, key });
    };
    const geo = this.d.edges.map((e, i) => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) return null;
      const same = Math.abs(a.y - b.y) < 1;
      const down = b.y > a.y;
      const sa = same ? 't' : down ? 'b' : 't', sb = same ? 't' : down ? 't' : 'b';
      addEnd(e.from, sa, b.x, i + 'a');
      addEnd(e.to, sb, a.x, i + 'b');
      return { e, a, b, sa, sb, same };
    });
    const off = new Map();
    for (const [k, list] of ends) {
      const p = pos.get(k.slice(0, -1));
      list.sort((u, v) => u.other - v.other);
      const span = Math.max(0, p.w - 20);
      const step = list.length > 1 ? Math.min(12, span / (list.length - 1)) : 0;
      list.forEach((it, j) => off.set(it.key, (j - (list.length - 1) / 2) * step));
    }
    const gE = el('g', {}, svg);
    this.edgeEls = [];
    geo.forEach((g, i) => {
      if (!g) return;
      const { e, a, b, sa, sb, same } = g;
      const x0 = a.x + off.get(i + 'a'), x1 = b.x + off.get(i + 'b');
      const y0 = sa === 'b' ? a.y + a.h / 2 : a.y - a.h / 2;
      const y1 = sb === 'b' ? b.y + b.h / 2 + 1 : b.y - b.h / 2 - 1;
      let d;
      if (same) {
        const lift = 16 + Math.min(26, Math.abs(x1 - x0) * 0.12);
        d = `M${x0},${y0} C${x0},${y0 - lift} ${x1},${y1 - lift} ${x1},${y1}`;
      } else {
        const dy = (y1 - y0) * 0.5;
        d = `M${x0},${y0} C${x0},${y0 + dy} ${x1},${y1 - dy} ${x1},${y1}`;
      }
      const w = Math.min(2.6, 1 + Math.log2(e.via.length) * 0.5);
      const p = el('path', { class: 'rg-edge' + (e.svc ? ' svc' : ''), d, 'stroke-width': w, 'marker-end': this.mk.a }, gE);
      const t = el('title', {}, p);
      t.textContent = `${short(e.from)} → ${short(e.to)}: ${e.via.map(short).join(', ')}`;
      this.edgeEls.push({ e, p });
    });

    const gN = el('g', {}, svg);
    this.nodeEls = new Map();
    for (const [id, p] of pos) {
      const g = el('g', { class: 'rg-node', tabindex: 0, role: 'button', 'aria-label': `${id}, ${GROUP[p.n.group]?.label || ''}`, transform: `translate(${p.x},${p.y})` }, gN);
      el('rect', { x: -p.w / 2, y: -p.h / 2, width: p.w, height: p.h, rx: 6 }, g);
      el('circle', { class: 'tick', cx: -p.w / 2 + 10, cy: 0, r: 4, style: `fill:${GROUP[p.n.group]?.color || 'var(--muted)'}` }, g);
      const t = el('text', { x: -p.w / 2 + 18, y: 0.5, style: `font-size:${size}px` }, g);
      t.textContent = p.n.label;
      // No hover preview while the detail is docked under the graph (narrow layouts): it would grow over the node.
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !this.state.sel && !this.docked()) { this.state.preview = { k: 'node', id }; this.refresh(); } });
      g.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && this.state.preview) { this.state.preview = null; this.refresh(); } });
      g.addEventListener('click', () => {
        const s = this.state.sel;
        this.select(s && s.k === 'node' && s.id === id ? null : { k: 'node', id });
      });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.select({ k: 'node', id }); } });
      this.nodeEls.set(id, g);
    }
    svg.addEventListener('click', (e) => { if (!e.target.closest('.rg-node') && this.state.sel) this.select(null); });
    this.root.replaceChildren(svg);
    this.refresh();
  }

  docked() {
    return getComputedStyle(this.detail).position === 'sticky' && this.detail.getBoundingClientRect().left < this.root.getBoundingClientRect().right;
  }

  // ---------- highlight + detail ----------
  focusSets() {
    const f = this.state.preview || this.state.sel;
    const hot = new Set(), peer = new Set(), edges = new Set();
    if (f && f.k === 'node') {
      hot.add(f.id);
      this.edgeEls.forEach(({ e }, i) => { if (e.from === f.id || e.to === f.id) { edges.add(i); peer.add(e.from === f.id ? e.to : e.from); } });
      return { hot, peer, edges, any: true };
    }
    if (f && (f.k === 'topic' || f.k === 'svc')) {
      const ends = f.k === 'topic'
        ? [...(this.topics.get(f.id)?.pubs || []), ...(this.topics.get(f.id)?.subs || [])].map(([n]) => n)
        : [...(this.svcs.get(f.id)?.servers || []), ...(this.svcs.get(f.id)?.clients || [])];
      ends.forEach((n) => hot.add(n));
      this.edgeEls.forEach(({ e }, i) => { if (e.via.includes(f.id)) edges.add(i); });
      return { hot, peer, edges, any: true };
    }
    if (this.state.filter) {
      for (const n of this.d.nodes) if (n.group === this.state.filter) peer.add(n.id);
      this.edgeEls.forEach(({ e }, i) => {
        if (peer.has(e.from) || peer.has(e.to)) { edges.add(i); hot.add(e.from); hot.add(e.to); }
      });
      // in a subsystem view, members are drawn bold and their peers plain
      for (const id of peer) hot.delete(id);
      return { hot: new Set(), peer, keep: hot, edges, any: true, group: true };
    }
    return { hot, peer, edges, any: false };
  }

  refresh() {
    const s = this.focusSets();
    for (const [id, g] of this.nodeEls) {
      const lit = s.hot.has(id) || s.peer.has(id) || (s.keep && s.keep.has(id));
      g.classList.toggle('hot', s.hot.has(id));
      g.classList.toggle('peer', s.peer.has(id));
      g.classList.toggle('dim', s.any && !lit);
    }
    this.edgeEls.forEach(({ p }, i) => {
      const on = s.edges.has(i);
      p.classList.toggle('hot', on && !s.group);
      p.classList.toggle('on', on && !!s.group);
      p.classList.toggle('dim', s.any && !on);
      p.setAttribute('marker-end', on && !s.group ? this.mk.h : this.mk.a);
    });
    for (const [gid, r] of this.bandEls) r.classList.toggle('on', this.state.filter === gid && !this.state.sel);
    this.renderDetail();
  }

  nodeRef(id, count) {
    const n = this.nodes.get(id);
    const color = n ? GROUP[n.group]?.color : 'var(--muted)';
    const label = n ? n.label : id.replace(/^\//, '');
    if (!n) return `<span class="rg-plain">${brk(label)}</span>`;
    return `<button type="button" class="rg-ref node" data-go="node" data-id="${esc(id)}"><i style="background:${color}"></i>${brk(label)}${count > 1 ? ` <b>×${count}</b>` : ''}</button>`;
  }
  topicRef(name, count) {
    const t = this.topics.get(name);
    const tag = rateTag(t);
    return `<button type="button" class="rg-ref" data-go="topic" data-id="${esc(name)}">${brk(short(name))}${count > 1 ? ` <b>×${count}</b>` : ''}${tag ? ` <b>${tag}</b>` : ''}</button>`;
  }
  svcRef(name) {
    return `<button type="button" class="rg-ref" data-go="svc" data-id="${esc(name)}">${brk(short(name))}</button>`;
  }
  typeHtml(type) {
    const def = this.defs.get(type);
    let h = `<code>${brk(type)}</code>`;
    if (def) {
      const text = def.lines.map((l) => l.t).join('\n').replace(/\n{3,}/g, '\n\n');
      h += `<details class="rg-def"><summary>Show its definition (${esc(def.path.replace('riptide_msgs/', ''))})</summary><pre>${esc(text)}</pre></details>`;
    }
    return h;
  }
  backHtml() {
    const prev = this.history[this.history.length - 1];
    return prev ? `<button type="button" class="rg-back" data-go="back">‹ Back to ${esc(short(prev.id))}</button>` : '';
  }

  renderDetail() {
    const f = this.state.preview || this.state.sel;
    const d = this.detail;
    if (f && f.k === 'node') d.innerHTML = this.nodeHtml(this.nodes.get(f.id));
    else if (f && f.k === 'topic') d.innerHTML = this.topicHtml(this.topics.get(f.id));
    else if (f && f.k === 'svc') d.innerHTML = this.svcHtml(this.svcs.get(f.id));
    else if (this.state.filter) d.innerHTML = this.groupHtml(GROUP[this.state.filter]);
    else d.innerHTML = this.introHtml();
  }

  introHtml() {
    const by = (r) => this.d.nodes.filter((n) => n.runs === r).length;
    return `<div class="rg-kind">The whole graph</div>
      <p><b>${this.d.nodes.length} nodes</b>, <b>${this.d.topics.length} topics</b> and <b>${this.d.edges.length}</b> node-to-node links. ${by('robot')} nodes are the robot stack, ${by('sim only')} are the simulator and ${by('sim and real robot (operator laptop)')} are the viewer on your laptop.</p>
      <p class="rg-hint">Tap a node, pick a subsystem, or search.</p>`;
  }

  groupHtml(g) {
    const members = this.d.nodes.filter((n) => n.group === g.id);
    const ids = new Set(members.map((n) => n.id));
    const peers = new Set();
    this.d.edges.forEach((e) => { if (ids.has(e.from) && !ids.has(e.to)) peers.add(e.to); if (ids.has(e.to) && !ids.has(e.from)) peers.add(e.from); });
    return `<div class="rg-kind">Subsystem · ${esc(g.where)}</div><h3 class="rg-title">${esc(g.label)}</h3>
      <p class="rg-sub">${members.length} node${members.length > 1 ? 's' : ''}</p><div class="rg-list">${members.map((n) => this.nodeRef(n.id)).join('')}</div>
      ${peers.size ? `<p class="rg-sub">Talks to</p><div class="rg-list">${[...peers].map((p) => this.nodeRef(p)).join('')}</div>` : '<p class="rg-hint" style="margin-top:.6rem">No links to other nodes in the capture: Nereus does not simulate acoustics.</p>'}`;
  }

  nodeHtml(n) {
    if (!n) return '';
    const g = GROUP[n.group];
    const [pkg, exe] = n.package.includes(':') ? n.package.split(':').map((s) => s.trim()) : [n.package, null];
    const launchName = n.launch ? n.launch.split('/').pop() : null;
    const split = (list) => [list.filter(([t]) => !this.infra.has(t)), list.filter(([t]) => this.infra.has(t)).map(([t]) => t)];
    const [pub, pubI] = split(n.pub), [sub, subI] = split(n.sub);
    const calls = n.cli.filter(([s]) => !PARAM_SRV.test(s));
    const paramCalls = [...new Set(n.cli.filter(([s]) => PARAM_SRV.test(s)).map(([s]) => s.replace(PARAM_SRV, '')))];
    const peers = new Set();
    this.d.edges.forEach((e) => { if (e.from === n.id) peers.add(e.to); if (e.to === n.id) peers.add(e.from); });
    const sec = (title, items) => (items.length ? `<p class="rg-sub">${title}</p><div class="rg-list">${items.join('')}</div>` : '');
    const infra = [...new Set([...pubI, ...subI])];
    return `${this.backHtml()}<div class="rg-kind">${esc(g?.label || n.group)} · node</div>
      <h3 class="rg-title">${brk(n.id)}</h3>
      <p>${esc(n.role)}</p>
      <dl class="rg-facts">
        <dt>Package</dt><dd><code>${esc(pkg)}</code>${exe ? `, executable <code>${brk(exe)}</code>` : ''}</dd>
        <dt>Runs</dt><dd>${esc(RUNS[n.runs] || n.runs)}</dd>
        ${launchName ? `<dt>Started by</dt><dd><a href="${esc(n.launch)}">${brk(launchName)}</a></dd>` : ''}
      </dl>
      ${sec(`Publishes (${pub.length})`, pub.map(([t, c]) => this.topicRef(t, c)))}
      ${sec(`Subscribes (${sub.length})`, sub.map(([t, c]) => this.topicRef(t, c)))}
      ${sec('Serves (services)', n.srv.filter(([s]) => !PARAM_SRV.test(s)).map(([s]) => this.svcRef(s)))}
      ${sec('Serves (actions)', n.asrv.map(([s]) => this.svcRef(s)))}
      ${sec('Calls (services)', calls.map(([s]) => this.svcRef(s)))}
      ${sec('Calls (actions)', n.acli.map(([s]) => this.svcRef(s)))}
      ${paramCalls.length ? `<p class="rg-sub">Changes parameters of</p><div class="rg-list">${paramCalls.map((p) => this.nodeRef(p)).join('')}</div>` : ''}
      ${sec('Linked nodes', [...peers].map((p) => this.nodeRef(p)))}
      ${infra.length ? `<p class="rg-hint" style="margin-top:.7rem">Also on the shared topics ${infra.map((t) => `<code>${esc(t)}</code>`).join(', ')}.</p>` : ''}`;
  }

  topicHtml(t) {
    if (!t) return '';
    const facts = [];
    const r1 = fmtHz(t.hz), r2 = fmtHz(t.hz2);
    if (r1 === null && r2 === null) facts.push(['Rate', 'No publisher during the capture.']);
    else facts.push(['Measured', `${r1 ?? '–'} Hz holding still before the run, ${r2 ?? '–'} Hz after it${t.hz === 0 && t.hz2 === 0 ? ' (sent on events, not on a timer)' : ''}`]);
    if (t.cfg !== null && t.cfg !== undefined) facts.push(['Nereus bridge', t.cfg ? `${t.cfg} Hz` : 'on events']);
    if (t.qos.length) facts.push(['Publisher QoS', t.qos.map((q) => q.replace('/', ', ').replace('_', ' ')).join('; ') + (t.latched ? ' (latched for late joiners)' : '')]);
    const size = fmtBytes(t.bytes);
    if (size) facts.push(['Mean size', size]);
    const simNote = t.sim
      ? /\/simulator\/|\/sim_/.test(t.name)
        ? 'Published only by the simulator; it does not exist on the robot.'
        : 'In Nereus the simulator publishes it, standing in for the hardware: on the robot a driver or a board does.'
      : '';
    const infra = this.infra.has(t.name) ? '<p class="rg-hint">Nearly every node uses this topic, so it isn’t drawn as links.</p>' : '';
    return `${this.backHtml()}<div class="rg-kind">Topic</div><h3 class="rg-title">${brk(t.name)}</h3>
      <div>${this.typeHtml(t.type)}</div>
      <dl class="rg-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${simNote ? `<p class="rg-hint">${simNote}</p>` : ''}${infra}
      <p class="rg-sub">Publishers (${t.pubs.length})</p><div class="rg-list">${t.pubs.map(([n, c]) => this.nodeRef(n, c)).join('') || '<span class="rg-hint">none</span>'}</div>
      <p class="rg-sub">Subscribers (${t.subs.length})</p><div class="rg-list">${t.subs.map(([n, c]) => this.nodeRef(n, c)).join('') || '<span class="rg-hint">none</span>'}</div>
      ${t.subs.some(([, c]) => c > 1) ? '<p class="rg-hint" style="margin-top:.5rem">×N: one node holding N subscriptions to the topic.</p>' : ''}`;
  }

  svcHtml(v) {
    if (!v) return '';
    const under = v.kind === 'action'
      ? `Underneath: the services <code>${brk(short(v.name))}/_action/send_goal</code>, <code>cancel_goal</code> and <code>get_result</code>, and the topics <code>feedback</code> and <code>status</code>.`
      : '';
    return `${this.backHtml()}<div class="rg-kind">${v.kind === 'action' ? 'Action' : 'Service'}</div><h3 class="rg-title">${brk(v.name)}</h3>
      <div>${this.typeHtml(v.type)}</div>
      ${under ? `<p class="rg-hint" style="margin-top:.5rem">${under}</p>` : ''}
      <p class="rg-sub">${v.kind === 'action' ? 'Action server' : 'Server'}</p><div class="rg-list">${v.servers.map((n) => this.nodeRef(n)).join('') || '<span class="rg-hint">nobody serves it in sim</span>'}</div>
      <p class="rg-sub">Clients</p><div class="rg-list">${v.clients.map((n) => this.nodeRef(n)).join('') || '<span class="rg-hint">none during the capture</span>'}</div>`;
  }
}

// ======================================================================================
// 2. Anatomy of a message
// ======================================================================================
const ANATOMY = [
  { name: 'ControllerCommand', kind: 'msg' },
  { name: 'KillSwitchReport', kind: 'msg' },
  { name: 'ListTrees', kind: 'srv' },
  { name: 'ExecuteTree', kind: 'action' },
  { name: 'FollowPath', kind: 'action' },
];
const MPC_NODE = 'https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc/src/mpc_controller_node.cpp';
const DOTASK = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/src/riptide_autonomy/DoTask.cpp';
const INTRO = {
  ControllerCommand: `One half of a setpoint for the MPC. Two topics carry it: <code>controller/linear</code> (position or velocity) and <code>controller/angular</code> (attitude or turn rate). Until both halves have a mode, the MPC outputs nothing.`,
  KillSwitchReport: `A report from one software kill switch, sent on <code>command/software_kill</code>. The POAC board's firmware reads it, so this message is compiled into the boards too. <a href="commanding.html#kill">Commanding Talos</a> has the full rules.`,
  ListTrees: `A service: the request is above the <code>---</code>, the response below. This one has an empty request. The viewer calls it on <code>autonomy/list_trees</code> to fill its tree picker.`,
  ExecuteTree: `An action: goal, then result, then feedback, split by <code>---</code>. The viewer sends it to <code>autonomy/run_tree</code> to start a mission tree.`,
  FollowPath: `The action the trees use to fly: the MPC serves it on <code>follow_path</code>. Also a goal, a result (with constants) and feedback.`,
};
const NOTES = {
  'ControllerCommand:POSITION': `Mode 3, go to and hold a target. Linear: <code>setpoint_vect</code> is the position. Angular: <code>setpoint_quat</code> is the attitude.`,
  'ControllerCommand:VELOCITY': `Mode 2: <code>setpoint_vect</code> is a velocity (linear half) or the turn rates (angular half).`,
  'ControllerCommand:FEEDFORWARD': `Mode 1. With both halves in FEEDFORWARD the MPC skips its optimisation and only allocates the feed-forward body wrench from <code>controller/FF_body_force</code> to the thrusters (<a href="https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc/src/mpc.cpp#L358"><code>mpc.cpp</code></a>).`,
  'ControllerCommand:DISABLED': `Mode 0. Either half DISABLED and the MPC goes idle (<a href="https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc/src/mpc.cpp#L353"><code>mpc.cpp</code></a>). <code>doTask</code> sends it on both topics when a tree ends.`,
  'ControllerCommand:mode': `Which of the four constants above this command is. A new command on either topic also preempts a running <code>follow_path</code> (<a href="${MPC_NODE}#L1186">line 1186</a>).`,
  'ControllerCommand:setpoint_vect': `Linear half: the target position in POSITION mode, or a velocity in VELOCITY mode. Angular half: the turn rates in VELOCITY mode; ignored in POSITION mode.`,
  'ControllerCommand:setpoint_quat': `Angular half, POSITION mode: the target attitude. An all-zero quaternion means "hold the attitude you have now" (<a href="${MPC_NODE}#L1203">line 1203</a>). Leave it unset and you get the default <code>w: 1</code>: "face +x".`,
  'KillSwitchReport:NUM_KILL_SWITCHES': `Four slots, numbered 0 to 3.`,
  'KillSwitchReport:KILL_SWITCH_PHYSICAL': `Slot 0, the switch on the hull. The board reports it to itself, and rejects a ROS report on slot 0.`,
  'KillSwitchReport:KILL_SWITCH_RQT_CONTROLLER': `Slot 1. Named for the old rqt controller plugin; today the Nereus viewer owns it and reports every 50 ms, asserting kill until someone presses Enable.`,
  'KillSwitchReport:KILL_SWITCH_TOPSIDE_BUTTON': `Slot 2, for a topside kill box.`,
  'KillSwitchReport:KILL_SWITCH_DEBUG': `Slot 3, for people and tools at the command line. The pre-test tool holds its bench kill here.`,
  'KillSwitchReport:sender_id': `Who is reporting. A kill locks its slot to this sender: only the same <code>sender_id</code> can clear it, and anyone else's clear is rejected.`,
  'KillSwitchReport:kill_switch_id': `Which slot this report is for: one of the four constants above.`,
  'KillSwitchReport:switch_asserting_kill': `<code>true</code> means "kill".`,
  'KillSwitchReport:switch_needs_update': `<code>true</code> makes the report a heartbeat: if the slot then goes 500 ms without a report, the board kills. <code>false</code> latches the report until the next one on that slot. A latched "not killed" is how a robot ends up enabled with nobody driving.`,
  'ListTrees:sep1': `Nothing above this line: the request has no fields, so the call is <code>ros2 service call /talos/autonomy/list_trees riptide_msgs2/srv/ListTrees</code> with no data.`,
  'ListTrees:trees': `The full path of every <code>.xml</code> file in the folders <code>doTask</code> searches (<a href="${DOTASK}#L339"><code>handleService</code></a>), 34 trees in the release repo.`,
  'ExecuteTree:tree': `The path of the tree file to run, one of the strings <code>ListTrees</code> returned. <code>doTask</code> rejects the goal if a tree is already running or the file doesn't exist.`,
  'ExecuteTree:sep1': `End of the goal, start of the result.`,
  'ExecuteTree:sep2': `End of the result, start of the feedback.`,
  'ExecuteTree:error': `<code>true</code> when the tree was canceled or stopped because the robot was killed.`,
  'ExecuteTree:returncode': `The tree's final status: 2 is SUCCESS, 3 is FAILURE. The action itself ends "succeeded" either way, so this is the field to check (<a href="${DOTASK}#L286">DoTask.cpp</a>).`,
  'ExecuteTree:stack': `The names of the running tree nodes, root first. <code>doTask</code> never sends feedback: it publishes the same <code>TreeStack</code> on the topic <code>autonomy/tree_stack</code>, which every viewer can watch.`,
  'FollowPath:path_points': `The waypoints. Each is a <code>PoseStamped</code>, so each carries its own frame in its header. The tree's <code>FollowPath</code> node puts them in <code>world</code> unless a waypoint names another frame.`,
  'FollowPath:segments': `How to reach each point: a <code>PathSegment</code> (straight line or arc, and a heading mode) per point. Empty means straight lines.`,
  'FollowPath:max_speed': `A cruise speed cap for this path only; 0 keeps the controller's own limit (<code>motion.linear_speed</code>, 0.6 m/s in <code>mpc.yaml</code>).`,
  'FollowPath:sep1': `End of the goal, start of the result.`,
  'FollowPath:sep2': `End of the result, start of the feedback.`,
  'FollowPath:error_code': `One of the four constants below. A path that a new setpoint preempts, or that you cancel, still ends with <code>NO_ERROR</code>: the reason is in <code>error_msg</code>.`,
  'FollowPath:error_msg': `Why the path ended early, for example "preempted by a controller/linear setpoint". Empty when it arrived.`,
  'FollowPath:has_generated': `<code>true</code> once the MPC has turned the goal into a path. The MPC sends feedback every 50 ms control tick.`,
  'FollowPath:current_prog': `How far along the path the reference is.`,
  'FollowPath:expected_prog': `The path's total length. <code>current_prog</code> reaching it means the reference is at the end.`,
};
const TYPE_NOTE = {
  bool: '<code>true</code> or <code>false</code>',
  uint8: 'a whole number from 0 to 255',
  uint16: 'a whole number from 0 to 65,535',
  uint32: 'a whole number from 0 to about 4.3 billion',
  int32: 'a whole number, negative or positive',
  float32: 'a 32-bit decimal number',
  float64: 'a 64-bit decimal number (a Python <code>float</code>)',
  string: 'text',
  'geometry_msgs/Vector3': 'a standard message nested inside this one: three <code>float64</code>, <code>x</code>, <code>y</code> and <code>z</code>',
  'geometry_msgs/Point': 'a standard nested message: <code>x</code>, <code>y</code>, <code>z</code>',
  'geometry_msgs/Quaternion': 'a standard nested message: <code>x</code>, <code>y</code>, <code>z</code>, <code>w</code>, an orientation, which defaults to <code>w: 1</code> (no rotation)',
  'geometry_msgs/PoseStamped': 'a standard message: a <code>header</code> (time stamp and frame) and a <code>pose</code> (position and orientation)',
  'riptide_msgs2/PathSegment': "another of the team's messages, <code>PathSegment</code>",
  TreeStack: "another message from the same package (no package prefix needed): <code>string[] stack</code> and <code>uint32 node_id</code>",
};
const NESTED = {
  'geometry_msgs/Vector3': [['x', '0.0'], ['y', '0.0'], ['z', '0.0']],
  'geometry_msgs/Point': [['x', '0.0'], ['y', '0.0'], ['z', '0.0']],
  'geometry_msgs/Quaternion': [['x', '0.0'], ['y', '0.0'], ['z', '0.0'], ['w', '1.0']],
  TreeStack: [['stack', '[]'], ['node_id', '0']],
};
const PRIM_DEFAULT = { bool: 'false', string: "''", float32: '0.0', float64: '0.0' };

function typeNote(l) {
  const base = TYPE_NOTE[l.type] || `a <code>${esc(l.type)}</code>`;
  if (l.array === undefined) return base;
  // "a list of" + the element's description without its own article
  return `a list of any length (a Python list, a <code>std::vector</code> in C++), each item ${base}`;
}

function Anatomy(ifaces) {
  const tabs = document.getElementById('ma-tabs');
  const lines = document.getElementById('ma-lines');
  const note = document.getElementById('ma-note');
  const yaml = document.getElementById('ma-yaml');
  const sub = document.getElementById('ma-sub');
  const pathEl = document.getElementById('ma-path');
  const byName = new Map(ifaces.map((i) => [i.name, i]));
  let cur = null, sel = -1, yamlMap = {};

  const tabBtns = ANATOMY.map((a) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'false' }, tabs);
    b.innerHTML = `${a.name}<small>.${a.kind}</small>`;
    b.addEventListener('click', () => show(a.name));
    return b;
  });

  function yamlFor(iface) {
    // one block per part (msg: one; srv: request/response; action: goal/result/feedback); constants aren't fields
    const parts = [[]];
    iface.lines.forEach((l) => { if (l.k === 'sep') parts.push([]); else if (l.k === 'field') parts[parts.length - 1].push(l); });
    const heads = iface.kind === 'srv' ? ['# request', '# response'] : iface.kind === 'action' ? ['# goal', '# result', '# feedback'] : [null];
    const out = [];
    const map = {};
    parts.forEach((fields, pi) => {
      if (heads[pi]) out.push(`<span class="cm">${heads[pi]}</span>`);
      if (!fields.length) out.push('{}');
      for (const f of fields) {
        const start = out.length;
        if (f.array !== undefined) out.push(`${f.name}: []`);
        else if (NESTED[f.type]) {
          out.push(`${f.name}:`);
          NESTED[f.type].forEach(([k, v]) => out.push(`  ${k}: ${v}`));
        } else out.push(`${f.name}: ${PRIM_DEFAULT[f.type] ?? '0'}`);
        map[f.name + ':' + pi] = [start, out.length];
      }
      if (pi < parts.length - 1) out.push('');
    });
    return { out, map };
  }

  function show(name) {
    cur = byName.get(name);
    sel = -1;
    tabBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(ANATOMY[i].name === name)));
    pathEl.innerHTML = `<a href="${GH_MSGS}${cur.path}">riptide_core/${esc(cur.path)}</a>`;
    lines.replaceChildren();
    let part = 0, sepN = 0;
    cur.lines.forEach((l, i) => {
      const li = h('li', {}, lines);
      if (l.k === 'sep') { part += 1; sepN += 1; }
      l._part = part;
      l._sep = l.k === 'sep' ? sepN : 0;
      const b = h('button', { type: 'button', 'aria-pressed': 'false' }, li);
      b.innerHTML = `<span class="code">${lineHtml(l)}</span>`;
      // A blank line keeps its row (and line number) and stays tappable, but
      // has nothing to name, so it stays out of the tab order and the a11y tree.
      if (l.k === 'blank') { b.classList.add('blank'); b.tabIndex = -1; b.setAttribute('aria-hidden', 'true'); }
      b.addEventListener('click', () => pick(i));
    });
    const y = yamlFor(cur);
    yamlMap = y.map;
    yaml.dataset.lines = JSON.stringify(y.out);
    sub.innerHTML = cur.kind === 'msg'
      ? 'Every field at its default, as <code>ros2 topic echo</code> prints it'
      : cur.kind === 'srv'
        ? 'The default request and response, in YAML'
        : 'The default goal, result and feedback, in YAML';
    renderYaml(null);
    note.innerHTML = `<div class="ma-k">${esc(cur.kind === 'msg' ? 'Message' : cur.kind === 'srv' ? 'Service' : 'Action')}</div><p>${INTRO[cur.name]}</p><p class="rg-hint">Tap any line of the file.</p>`;
  }

  function lineHtml(l) {
    if (l.k === 'blank') return '';
    if (l.k === 'sep') return '<span class="sep">---</span>';
    if (l.k === 'comment') return `<span class="cm">${esc(l.t.trim())}</span>`;
    if (l.k === 'other') return esc(l.t);
    const arr = l.array !== undefined ? `[${l.array}]` : '';
    let h = `<span class="t">${esc(l.type)}${arr}</span> <span class="n">${esc(l.name)}</span>`;
    if (l.value !== undefined) h += ` = <span class="v">${esc(l.value)}</span>`;
    if (l.comment) h += ` <span class="cm">${esc(l.comment)}</span>`;
    return h;
  }

  function renderYaml(range) {
    const out = JSON.parse(yaml.dataset.lines);
    yaml.innerHTML = out.map((s, i) => (range && i >= range[0] && i < range[1] ? `<span class="hl">${s.startsWith('<') ? s : esc(s)}</span>` : s.startsWith('<') ? s : esc(s))).join('\n');
  }

  function pick(i) {
    sel = sel === i ? -1 : i;
    lines.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === sel)));
    if (sel < 0) { show(cur.name); return; }
    const l = cur.lines[sel];
    const specific = NOTES[`${cur.name}:${l.k === 'sep' ? 'sep' + l._sep : l.name}`];
    let kind, body;
    if (l.k === 'field') {
      kind = 'Field';
      body = `<p><code>${esc(l.name)}</code> is ${typeNote(l)}.</p>${specific ? `<p>${specific}</p>` : ''}`;
    } else if (l.k === 'const') {
      kind = 'Constant';
      body = `<p>A constant, not a field: it is never sent. Code compares against it, as <code>${esc(cur.name)}.${esc(l.name)}</code> in Python or <code>${esc(cur.name)}::${esc(l.name)}</code> in C++.</p>${specific ? `<p>${specific}</p>` : ''}`;
    } else if (l.k === 'sep') {
      kind = 'Separator';
      body = `<p>${specific || 'Splits the parts of the interface.'}</p>`;
    } else if (l.k === 'comment') {
      kind = 'Comment';
      body = `<p>A comment. The code generator ignores it, but <code>ros2 interface show</code> prints it, so comments are where a field gets its documentation.</p>`;
    } else {
      kind = 'Blank line';
      body = '<p>Blank lines only group the file for people.</p>';
    }
    note.innerHTML = `<div class="ma-k">${kind}</div>${l.k !== 'blank' ? `<div class="ma-line">${lineHtml(l)}</div>` : ''}${body}`;
    renderYaml(l.k === 'field' ? yamlMap[l.name + ':' + l._part] : null);
  }

  show(ANATOMY[0].name);
}

// ======================================================================================
// 3. Starting a mission, message by message
// ======================================================================================
const LIVES = [
  { id: 'v', label: 'Viewer', sub: 'viewer_panels' },
  { id: 'a', label: 'Tree executor', short: 'doTask', sub: 'autonomy' },
  { id: 'm', label: 'Controller', sub: 'mpc_controller' },
];
const STEPS = [
  { from: 'v', to: 'a', label: 'list_trees', kind: 'Service request', name: '/talos/autonomy/list_trees', type: 'riptide_msgs2/srv/ListTrees',
    payload: '{}    # the request has no fields',
    text: 'Opening the Autonomy panel asks <code>doTask</code> which trees exist. The viewer sends the request and carries on drawing; the reply arrives in a callback.' },
  { from: 'a', to: 'v', label: 'trees', kind: 'Service response', name: '/talos/autonomy/list_trees', type: 'riptide_msgs2/srv/ListTrees',
    payload: 'trees:\n- …/riptide_autonomy2/trees/ActuatorTrees.xml\n- …/riptide_autonomy2/trees/BinTree.xml\n- …\n- …/riptide_autonomy2/trees/RepairCompMpcTree.xml\n- …',
    text: '<code>doTask</code> lists every <code>.xml</code> file in its tree folders, as full paths. The panel\'s picker shows them.' },
  { from: 'v', to: 'a', label: 'run_tree goal', kind: 'Action goal', name: '/talos/autonomy/run_tree', type: 'riptide_msgs2/action/ExecuteTree',
    payload: 'tree: …/riptide_autonomy2/trees/RepairCompMpcTree.xml',
    text: 'Start sends one of those paths back as a goal. Underneath, this is a call to the service <code>autonomy/run_tree/_action/send_goal</code>, with a fresh goal ID.' },
  { from: 'a', to: 'v', label: 'accepted', kind: 'Goal response', name: '/talos/autonomy/run_tree', type: 'riptide_msgs2/action/ExecuteTree',
    payload: 'accepted: true',
    text: '<code>doTask</code> rejects the goal if a tree is already running or the file doesn\'t exist. Here it accepts, loads the XML and starts ticking the tree every 30 ms. The viewer\'s Motion panel switches to "Autonomy owns motion".' },
  { from: 'a', to: 'v', label: 'tree_stack', topic: true, kind: 'Topic', name: '/talos/autonomy/tree_stack', type: 'riptide_msgs2/msg/TreeStack',
    payload: 'stack: [MISSION, CompMissionTreeMpc, COMP, ForceSuccess,\n        SlalomPathMpc]\nnode_id: 0',
    text: 'Whenever a tree node starts or finishes, <code>doTask</code> publishes the stack of running nodes, root first. It is a topic, not the action\'s feedback, so every viewer sees it, not only the one that pressed Start. This stack is from the capture, as the slalom started; deeper nodes, down to the <code>FollowPath</code> calls, join it as they run.' },
  { from: 'a', to: 'm', label: 'follow_path', kind: 'Action goal', name: '/talos/follow_path', type: 'riptide_msgs2/action/FollowPath',
    payload: 'path_points:\n- header: {frame_id: world, stamp: …}\n  pose: {position: {x: …, y: …, z: …}, orientation: …}\n- …\nsegments: […]   # or empty: straight lines\nmax_speed: 0.0  # the controller\'s own limit',
    text: 'The tree\'s <code>FollowPath</code> node turns its <code>waypoints</code> attribute (<code>"x,y,z,yaw; …"</code>) into a goal for the MPC (<a href="https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/include/riptide_autonomy/bt_actions/FollowPath.btaction.hpp#L64"><code>FollowPath.btaction.hpp</code></a>). It gives up after its <code>timeout</code>, 60 s unless the tree sets another.' },
  { from: 'm', to: 'a', label: 'feedback', topic: true, kind: 'Action feedback', name: '/talos/follow_path/_action/feedback', type: 'riptide_msgs2/action/FollowPath',
    payload: 'has_generated: true\ncurrent_prog: …    # how far along the path\nexpected_prog: …   # the path\'s length',
    text: 'Every 50 ms control tick while the path runs. Feedback is an ordinary topic underneath, so any node or laptop could watch it.' },
  { from: 'm', to: 'a', label: 'result', kind: 'Action result', name: '/talos/follow_path', type: 'riptide_msgs2/action/FollowPath',
    payload: 'error_code: 0   # NO_ERROR\nerror_msg: \'\'\n# status: SUCCEEDED',
    text: 'When the reference has reached the last point and Talos has settled near it (settle trust 0.8, or within 10 cm and 0.1 rad and slow), the MPC succeeds the goal and holds the end pose (<a href="https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc/src/mpc_controller_node.cpp#L1116"><code>mpc_controller_node.cpp</code></a>). A new <code>controller/linear</code> or <code>angular</code> setpoint would end it early instead, as aborted, with the reason in <code>error_msg</code>.' },
  { from: 'a', to: 'm', label: 'DISABLED', topic: true, kind: 'Topics', name: '/talos/controller/linear + /talos/controller/angular', type: 'riptide_msgs2/msg/ControllerCommand',
    payload: 'mode: 0   # DISABLED, sent on both topics',
    text: 'Many paths, detections and actuator calls later, the tree ends. <code>doTask</code> publishes DISABLED on both controller topics ("no reason for it to be going"), and the MPC goes idle.' },
  { from: 'a', to: 'v', label: 'result', kind: 'Action result', name: '/talos/autonomy/run_tree', type: 'riptide_msgs2/action/ExecuteTree',
    payload: 'error: false\nreturncode: 2   # the tree\'s status: SUCCESS\n# status: SUCCEEDED',
    text: 'The goal ends "succeeded" whether the tree\'s status was SUCCESS or FAILURE; <code>returncode</code> tells them apart. The viewer only reports success for SUCCEEDED, no error and returncode 2. In the capture, <code>doTask</code> logged <code>Tree ended with status SUCCESS</code>.' },
];

function Sequence() {
  const root = document.getElementById('ac-svg');
  const detail = document.getElementById('ac-detail');
  const count = document.getElementById('ac-count');
  const prev = document.getElementById('ac-prev');
  const next = document.getElementById('ac-next');
  const legend = h('div', { class: 'legend' });
  legend.innerHTML = '<span><i style="background:var(--ink-2)"></i>service or action call</span><span><i class="dash" style="color:var(--ink-2)"></i>topic</span>';
  root.after(legend);
  let step = 0, width = 0, msgs = [];

  function draw() {
    const W = Math.max(280, root.clientWidth || 600);
    width = W;
    const narrow = W < 520;
    const L = 22, R = 6, top = 8, headH = narrow ? 40 : 44, rowH = narrow ? 38 : 40;
    const colW = (W - L - R) / LIVES.length;
    const X = Object.fromEntries(LIVES.map((l, i) => [l.id, L + colW * (i + 0.5)]));
    const y0 = top + headH + 26;
    const H = y0 + rowH * (STEPS.length - 1) + 22;
    const svg = el('svg', { class: 'ac-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'Message sequence' });
    const uid = Math.random().toString(36).slice(2, 7);
    const defs = el('defs', {}, svg);
    for (const [id, c] of [['a', 'var(--ink-2)'], ['h', 'var(--accent)']]) {
      const m = el('marker', { id: `ac-${id}-${uid}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: c }, m);
    }
    for (const l of LIVES) {
      el('line', { class: 'life', x1: X[l.id], x2: X[l.id], y1: top + headH, y2: H - 4 }, svg);
      const g = el('g', { class: 'head' }, svg);
      const bw = Math.min(colW - 8, 170);
      el('rect', { x: X[l.id] - bw / 2, y: top, width: bw, height: headH, rx: 7 }, g);
      const t = el('text', { x: X[l.id], y: top + headH / 2 - 8, style: narrow ? 'font-size:11.5px' : '' }, g);
      t.textContent = narrow && l.short ? l.short : l.label;
      const s = el('text', { class: 'sub', x: X[l.id], y: top + headH / 2 + 9, style: narrow ? 'font-size:10.5px' : '' }, g);
      s.textContent = l.sub;
    }
    msgs = STEPS.map((st, i) => {
      const y = y0 + rowH * i;
      const g = el('g', { class: 'msg' + (st.topic ? ' topic' : ''), tabindex: 0, role: 'button', 'aria-label': `Step ${i + 1}: ${st.kind} ${st.name}` }, svg);
      el('rect', { class: 'hit', x: 0, y: y - rowH / 2 - 4, width: W, height: rowH }, g);
      const x0 = X[st.from], x1 = X[st.to];
      const dir = Math.sign(x1 - x0);
      el('path', { d: `M${x0 + dir * 3},${y} L${x1 - dir * 3},${y}` }, g);
      const t = el('text', { x: (x0 + x1) / 2, y: y - 6, style: narrow ? 'font-size:10.5px' : '' }, g);
      t.textContent = st.label;
      const n = el('text', { class: 'step-n', x: L - 6, y: y + 4 }, g);
      n.textContent = i + 1;
      g.addEventListener('click', () => go(i));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(i); } });
      return { g, path: g.querySelector('path') };
    });
    root.replaceChildren(svg);
    msgs.forEach((m) => m.path.dataset.uid = uid);
    go(step);
  }

  function go(i) {
    step = Math.max(0, Math.min(STEPS.length - 1, i));
    msgs.forEach((m, j) => {
      m.g.classList.toggle('now', j === step);
      m.g.classList.toggle('future', j > step);
      m.path.setAttribute('marker-end', `url(#ac-${j === step ? 'h' : 'a'}-${m.path.dataset.uid})`);
    });
    const st = STEPS[step];
    count.textContent = `Step ${step + 1} of ${STEPS.length}`;
    prev.disabled = step === 0;
    next.disabled = step === STEPS.length - 1;
    detail.innerHTML = `<div class="ac-k">${esc(st.kind)}</div><div class="ac-name">${brk(st.name)}</div><div class="ac-type">${brk(st.type)}</div><pre>${esc(st.payload)}</pre><p>${st.text}</p>`;
  }
  prev.addEventListener('click', () => go(step - 1));
  next.addEventListener('click', () => go(step + 1));
  new ResizeObserver(() => { const w = root.clientWidth; if (w && Math.abs(w - width) > 1) draw(); }).observe(root);
  draw();
}

// ======================================================================================
// 4. Who connects to whom: DDS against Zenoh
// ======================================================================================
function Middleware() {
  const box = document.getElementById('zenoh-diagram');
  const note = document.getElementById('zenoh-note');
  const seg = document.getElementById('zn-seg');
  const robotNodes = [
    { id: 'ekf', label: 'EKF', sub: 'ekf_localization_node', x: 120, y: 66 },
    { id: 'mpc', label: 'MPC', sub: 'mpc_controller', x: 320, y: 66 },
    { id: 'auto', label: 'autonomy', sub: 'doTask', x: 520, y: 66 },
  ];
  const laptops = [
    { id: 'viewer', label: 'Nereus viewer', sub: 'laptop 1', x: 210, y: 266 },
    { id: 'cli', label: 'ros2 topic echo', sub: 'laptop 2', x: 430, y: 266 },
  ];
  const router = { id: 'router', label: 'Zenoh router', sub: 'rmw_zenohd · TCP 7447', x: 320, y: 140, fill: '#fbe3d6', stroke: 'var(--accent)', bold: true };
  const narrowPos = {
    ekf: { x: 52, y: 62, sub: '' }, mpc: { x: 170, y: 62, sub: '' }, auto: { x: 284, y: 62, sub: '' },
    router: { x: 170, y: 140, sub: 'rmw_zenohd · 7447' },
    viewer: { x: 88, y: 290, sub: 'laptop 1', label: 'viewer' }, cli: { x: 250, y: 290, sub: 'laptop 2', label: 'ros2 CLI' },
  };
  const INFO = {
    dds: {
      ekf: 'A DDS participant on the Orin. It announces itself by multicast to the whole network and keeps a connection to every participant it shares a topic with, laptops included.',
      mpc: 'Same for every node: discovery traffic grows with the number of participants, on both sides of the tether.',
      auto: 'Same for every node: discovery traffic grows with the number of participants, on both sides of the tether.',
      viewer: 'Each laptop node must hear the Orin\'s multicast announcements and connect back to each Orin node. Multicast is often dropped by Wi-Fi and routers, and then the laptop sees nothing.',
      cli: 'Even one <code>ros2 topic echo</code> is a full participant, discovered by and connected to everyone.',
    },
    zenoh: {
      ekf: 'A Zenoh session on the Orin. It reaches the router on the same computer.',
      mpc: 'A Zenoh session on the Orin. It reaches the router on the same computer.',
      auto: 'A Zenoh session on the Orin. It reaches the router on the same computer.',
      router: '<b>rmw_zenohd</b>, started at boot by the Orin\'s launcher service. It listens on TCP port 7447, does discovery for every session, and forwards data to the client sessions on laptops.',
      viewer: 'A client session: one outgoing TCP connection to <code>tcp/orin2:7447</code> (<code>zenoh_session.json5</code>). All its data goes through the router; the robot never connects back.',
      cli: 'The command line is a client like any other node. Run it with <code>--no-daemon</code> after switching RMW, or the old daemon answers.',
    },
  };
  const DEFAULT = {
    dds: '<b>5 participants, 10 connections.</b> Every participant discovers every other by multicast, and connects to each one it shares a topic with. Tap a box.',
    zenoh: '<b>5 sessions, 5 connections, all to the router.</b> Only the two laptop connections cross the tether. Tap a box.',
  };
  let mode = 'zenoh';
  function draw() {
    box.replaceChildren();
    const z = mode === 'zenoh';
    const nodes = [...robotNodes, ...(z ? [router] : []), ...laptops].map((n) => ({ ...n, info: INFO[mode][n.id] }));
    let edges;
    if (z) edges = [...robotNodes, ...laptops].map((n) => ({ from: n.id, to: 'router' }));
    else {
      const all = [...robotNodes, ...laptops].map((n) => n.id);
      edges = [];
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) edges.push({ from: all[i], to: all[j], bend: all[i] === 'ekf' && all[j] === 'auto' ? -50 : 0 });
    }
    const narrowEdges = { 'ekf>auto': { bend: -40 } };
    new Graph(box, {
      width: 640, height: 306, nodes, edges, arrows: false,
      bands: [
        { label: 'ON THE ORIN (TALOS)', points: [[8, 10], [632, 10], [632, 180], [8, 180]] },
        { label: 'TOPSIDE LAPTOPS', points: [[8, 214], [632, 214], [632, 298], [8, 298]] },
      ],
      narrow: {
        below: 520, width: 340, height: 340, nodes: narrowPos, edges: narrowEdges,
        bands: [
          { label: 'ON THE ORIN', points: [[6, 10], [334, 10], [334, 178], [6, 178]] },
          { label: 'TOPSIDE LAPTOPS', points: [[6, 236], [334, 236], [334, 332], [6, 332]] },
        ],
      },
      info: (n) => { note.innerHTML = n ? `<b>${esc(n.label)}.</b> ${n.info}` : DEFAULT[mode]; },
    });
    note.innerHTML = DEFAULT[mode];
  }
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.m;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  draw();
}

// ======================================================================================
Middleware();
Sequence();
dataP.then(async ([graph, ifaces]) => {
  if (document.fonts?.ready) await document.fonts.ready;
  new RosGraph(graph, ifaces);
  Anatomy(ifaces);
});
