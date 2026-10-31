import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/ros2.css';
import { el } from '../viz/chart.js';

setup();
// The shared table wrapper lets code break after every _ and /. These tables become cards on phones, where each
// name fits on a line, so names only wrap at spaces: never "mpc_" / "controller".
document.querySelectorAll('table.ros2-qos code, table.ros2-names code, table.ros2-cli code').forEach((c) => c.querySelectorAll('wbr').forEach((w) => w.remove()));
// Commands wrap only between arguments: never after the "--" of a flag, which invites copying a broken command.
document.querySelectorAll('table.ros2-cli code').forEach((c) => {
  if (c.children.length) return;
  const words = c.textContent.split(' ');
  c.replaceChildren(...words.flatMap((w, i) => {
    const s = document.createElement('span');
    s.className = 'tok';
    s.textContent = w;
    return i ? [document.createTextNode(' '), s] : [s];
  }));
});

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

function fmtHz(v) {
  if (v === null || v === undefined) return null;
  if (v === 0) return '0';
  return v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(1);
}
// The rate tag on a topic. Null means "no message in either 3 s window": a topic with publishers is then only quiet
// (it sends on events), and "no pub" is kept for topics nobody publishes.
function rateTag(t) {
  if (!t) return '';
  const vals = [t.hz, t.hz2].filter((v) => v !== null && v !== undefined);
  if (!vals.length) return t.pubs.length ? 'quiet' : 'no pub';
  const v = Math.max(...vals);
  if (!v) return 'quiet';
  return fmtHz(v) + ' Hz';
}
function fmtBytes(b) {
  if (!b) return null;
  return b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1000 ? (b / 1000).toFixed(1) + ' kB' : Math.round(b) + ' B';
}

const FOCUS0 = { k: 'node', id: '/talos/mpc_controller' };
const CAP = 6; // neighbour cards per side before "+N more" (4 on phones)
const ROWS = 3; // link rows per card before "+N more"

// The ROS graph as a focus view: one node (or one subsystem) in the middle, what it gets data from on the left and
// what it sends data to on the right. Never the whole 44-link graph at once: that can't be followed on any screen.
class RosGraph {
  constructor(data, ifaces) {
    this.d = data;
    this.fig = document.querySelector('#graph-fig .rg');
    this.flow = document.getElementById('rg-flow');
    this.detail = document.getElementById('rg-detail');
    this.trailEl = document.getElementById('rg-trail');
    this.found = document.getElementById('rg-found');
    this.sel = document.getElementById('rg-sel');
    this.nodes = new Map(data.nodes.map((n) => [n.id, n]));
    this.topics = new Map(data.topics.map((t) => [t.name, t]));
    this.infra = new Set(data.infra);
    this.defs = new Map(ifaces.map((i) => [`riptide_msgs2/${i.kind}/${i.name}`, i]));
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
    this.focus = FOCUS0;
    this.trail = [];
    this.moreSides = new Set();
    this.moreCards = new Set();
    this.buildControls();
    this.fig.addEventListener('click', (e) => this.onClick(e));
    this.flow.addEventListener('pointerover', (e) => this.hover(e.target.closest('.rg-card'), true));
    this.flow.addEventListener('pointerout', (e) => this.hover(e.target.closest('.rg-card'), false));
    new ResizeObserver(() => this.layout()).observe(this.flow);
    this.render();
  }

  // ---------- controls: the focus picker and search ----------
  buildControls() {
    const groups = GROUPS.map((g) => [g, this.d.nodes.filter((n) => n.group === g.id)]).filter(([, ns]) => ns.length);
    let html = '<optgroup label="A whole subsystem">' + groups.map(([g, ns]) => `<option value="group:${g.id}">${esc(g.label)} (${ns.length} node${ns.length > 1 ? 's' : ''})</option>`).join('') + '</optgroup>';
    for (const [g, ns] of groups) {
      const order = [...g.order.map((l) => ns.find((n) => n.label === l)).filter(Boolean), ...ns.filter((n) => !g.order.includes(n.label))];
      html += `<optgroup label="${esc(g.label)} nodes">` + order.map((n) => `<option value="node:${esc(n.id)}">${esc(n.label)}</option>`).join('') + '</optgroup>';
    }
    this.sel.innerHTML = html;
    this.sel.addEventListener('change', () => {
      const [k, ...rest] = this.sel.value.split(':');
      this.go({ k, id: rest.join(':') });
    });
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
      hits = hits.slice(0, 12);
      cur = 0;
      res.innerHTML = hits.length
        ? hits.map((x, i) => `<button type="button" data-i="${i}" class="${i === 0 ? 'on' : ''}"><span>${brk(short(x.id))}</span><small>${x.tag}</small></button>`).join('')
        : '<div class="rg-none">Nothing in the capture matches.</div>';
      res.hidden = false;
    };
    const pick = (i) => {
      const x = hits[i];
      if (!x) return;
      q.value = '';
      res.hidden = true;
      q.blur();
      if (x.k === 'node') this.go({ k: 'node', id: x.id });
      else this.showFound(x.k, x.id);
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

  // A topic or service found by search: shown right under the search box, where the user is looking.
  showFound(k, id) {
    this.found.innerHTML = `<button type="button" class="rg-close" data-close aria-label="Close">×</button>
      <div class="rg-kind">Search result · ${k === 'topic' ? 'topic' : esc(this.svcs.get(id)?.kind || 'service')}</div>
      <h3 class="rg-title">${brk(id)}</h3>${k === 'topic' ? this.topicInfo(this.topics.get(id)) : this.svcInfo(this.svcs.get(id))}`;
    this.found.hidden = false;
  }

  onClick(e) {
    const t = e.target;
    if (t.closest('[data-close]')) { this.found.hidden = true; return; }
    const go = t.closest('[data-go]');
    if (go) {
      if (go.dataset.go === 'crumb') {
        const i = +go.dataset.i;
        const f = this.trail[i];
        this.trail = this.trail.slice(0, i);
        this.go(f, false);
      } else {
        if (this.found.contains(go)) this.found.hidden = true;
        this.go({ k: go.dataset.go, id: go.dataset.id });
      }
      return;
    }
    const more = t.closest('[data-more]');
    if (more) {
      const set = more.dataset.more === 'side' ? this.moreSides : this.moreCards;
      set.add(more.dataset.key);
      this.render(false);
      return;
    }
    const tb = t.closest('[data-topic], [data-svc]');
    if (tb) this.toggleInfo(tb);
  }

  go(f, remember = true) {
    if (!f || (f.k === this.focus.k && f.id === this.focus.id)) return;
    if (remember) this.trail.push(this.focus);
    if (this.trail.length > 6) this.trail.shift();
    this.focus = f;
    this.moreSides.clear();
    this.moreCards.clear();
    this.render(true);
  }

  // ---------- the links around the focus ----------
  groupOf(id) { return this.nodes.get(id)?.group; }
  // A link name can be both a topic and a service (/talos/set_pose is): it is a topic link only if the topic
  // really runs from one node to the other.
  linkKind(v, from, to) {
    const t = this.topics.get(v);
    if (t && t.pubs.some(([n]) => n === from) && t.subs.some(([n]) => n === to)) return 'topic';
    return this.svcs.get(v)?.kind || 'topic';
  }

  // [{ k, id, links: [names] }] for one side ('in': into the focus, 'out': out of it)
  neighbours(side) {
    const f = this.focus;
    const m = new Map();
    const add = (k, id, e) => {
      if (!m.has(id)) m.set(id, { k, id, links: [] });
      const l = m.get(id).links;
      e.via.forEach((v) => {
        const kind = this.linkKind(v, e.from, e.to);
        const idle = !!e.idle?.includes(v);
        const have = l.find((x) => x.v === v && x.kind === kind);
        if (!have) l.push({ v, kind, idle });
        else if (!idle) have.idle = false; // a subsystem link is idle only if every publisher behind it is
      });
    };
    for (const e of this.d.edges) {
      if (f.k === 'node') {
        if (side === 'in' && e.to === f.id) add('node', e.from, e);
        if (side === 'out' && e.from === f.id) add('node', e.to, e);
      } else {
        const a = this.groupOf(e.from), b = this.groupOf(e.to);
        if (a === b) continue;
        if (side === 'in' && b === f.id) add('group', a, e);
        if (side === 'out' && a === f.id) add('group', b, e);
      }
    }
    const gi = (x) => GROUPS.findIndex((g) => g.id === (x.k === 'node' ? this.groupOf(x.id) : x.id));
    // topics first, then calls; neighbours in data-flow order (simulator first, operator last)
    const list = [...m.values()].sort((a, b) => gi(a) - gi(b) || a.id.localeCompare(b.id));
    list.forEach((x) => x.links.sort((a, b) => (a.kind !== 'topic') - (b.kind !== 'topic') || a.v.localeCompare(b.v)));
    // Neighbours that share exactly the same links become one card: "odometry/filtered → these eight nodes"
    // instead of eight cards each saying the same thing.
    const sig = (x) => x.links.map((l) => `${l.kind}:${l.v}:${l.idle ? 1 : 0}`).join('|');
    const out = [], bySig = new Map();
    for (const x of list) {
      const k = sig(x);
      const first = bySig.get(k);
      if (first) (first.ids ||= [first.id]).push(x.id);
      else { bySig.set(k, x); out.push(x); }
    }
    return out;
  }

  rowHtml({ v, kind, idle }) {
    if (kind === 'topic') {
      const t = this.topics.get(v);
      return `<li><button type="button" class="rg-row${idle ? ' idle' : ''}" data-topic="${esc(v)}" aria-expanded="false"><span class="rg-tn">${brk(short(v))}</span><b>${idle ? 'idle in sim' : rateTag(t)}</b></button></li>`;
    }
    return `<li><button type="button" class="rg-row svc" data-svc="${esc(v)}" aria-expanded="false"><span class="rg-tn">${brk(short(v))}</span><b>${kind} call</b></button></li>`;
  }

  nameBtn(k, id) {
    const isNode = k === 'node';
    const n = isNode ? this.nodes.get(id) : null;
    const g = GROUP[isNode ? n?.group : id];
    const label = isNode ? (n ? n.label : short(id)) : g.label;
    return `<button type="button" class="rg-name" data-go="${k}" data-id="${esc(id)}" style="--g:${g?.color || 'var(--muted)'}" aria-label="Focus on ${esc(label)}"><i></i><span><u>${brk(label)}</u>${isNode ? `<small>${esc(g?.label || '')}</small>` : ''}</span><em aria-hidden="true">›</em></button>`;
  }

  cardHtml(side, x) {
    const key = side + ':' + x.id;
    const all = this.moreCards.has(key);
    const rows = all ? x.links : x.links.slice(0, this.stack ? 2 : ROWS);
    const extra = x.links.length - rows.length;
    const svcOnly = x.links.every((l) => l.kind !== 'topic');
    const names = x.ids
      ? `<div class="rg-names"><p class="rg-n">${x.ids.length} ${x.k === 'node' ? 'nodes' : 'subsystems'}, the same link${x.links.length > 1 ? 's' : ''}</p><div class="rg-list">${x.ids.map((id) => (x.k === 'node' ? this.nodeRef(id) : `<button type="button" class="rg-chip" data-go="group" data-id="${esc(id)}" style="--g:${GROUP[id].color}"><i></i>${esc(GROUP[id].label)}</button>`)).join('')}</div></div>`
      : this.nameBtn(x.k, x.id);
    return `<div class="rg-card${svcOnly ? ' svc' : ''}${x.ids ? ' multi' : ''}" data-key="${esc(key)}">
      ${names}
      <ul class="rg-rows">${rows.map((v) => this.rowHtml(v)).join('')}</ul>
      ${extra > 0 ? `<button type="button" class="rg-more" data-more="card" data-key="${esc(key)}">+${extra} more</button>` : ''}
    </div>`;
  }

  colHtml(side, list) {
    const count = list.reduce((s, x) => s + (x.ids ? x.ids.length : 1), 0);
    const head = (side === 'in' ? 'Gets data from' : 'Sends data to') + (count ? ` <small>${count}</small>` : '');
    const all = this.moreSides.has(side);
    const shown = all ? list : list.slice(0, this.stack ? 4 : CAP);
    const extra = list.slice(shown.length).reduce((s, x) => s + (x.ids ? x.ids.length : 1), 0);
    let body = shown.map((x) => this.cardHtml(side, x)).join('');
    if (extra > 0) body += `<button type="button" class="rg-more side" data-more="side" data-key="${side}">+${extra} more ${this.focus.k === 'node' ? 'node' : 'subsystem'}${extra > 1 ? 's' : ''}</button>`;
    if (!list.length) body = `<p class="rg-empty">${side === 'in' ? 'No other node sends it data in the capture.' : 'No other node uses its output in the capture.'}</p>`;
    return `<section class="rg-col rg-${side}"><h4 class="rg-colh">${head}</h4>${body}</section>`;
  }

  // A focus with no links at all: one note in place of two empty columns.
  emptyHtml() {
    const f = this.focus;
    const why = f.id === '/riptide_acoustics' || f.id === 'acoustics'
      ? 'No links in the capture: Nereus doesn’t simulate the hydrophones, so acoustics had nothing to listen to. On the robot it reads <code>ivc/pinger/selected_freq_amp_stream</code> (<a href="https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_acoustics/src/Acoustics.cpp">Acoustics.cpp</a>).'
      : 'No links to other nodes in the capture.';
    return `<section class="rg-col rg-none"><p class="rg-empty">${why}</p></section>`;
  }

  focusHtml() {
    const f = this.focus;
    if (f.k === 'node') {
      const n = this.nodes.get(f.id);
      const g = GROUP[n.group];
      return `<div class="rg-focus" style="--g:${g.color}" aria-live="polite"><div class="rg-kind"><i></i>${esc(g.label)} · node</div>
        <h3 class="rg-title">${brk(n.label)}</h3><p>${esc(n.role)}</p></div>`;
    }
    const g = GROUP[f.id];
    const ms = this.d.nodes.filter((n) => n.group === f.id);
    return `<div class="rg-focus" style="--g:${g.color}" aria-live="polite"><div class="rg-kind"><i></i>Subsystem · ${esc(g.where)}</div>
      <h3 class="rg-title">${esc(g.label)}</h3>
      <div class="rg-members">${ms.map((n) => `<button type="button" class="rg-chip" data-go="node" data-id="${esc(n.id)}">${brk(n.label)}</button>`).join('')}</div></div>`;
  }

  render(scroll = false) {
    const f = this.focus;
    this.stack = (this.flow.clientWidth || this.fig.clientWidth) < 560;
    this.sel.value = `${f.k}:${f.id}`;
    // the trail: where you came from, tap a step to go back to it
    if (this.trail.length) {
      const nm = (x) => (x.k === 'node' ? this.nodes.get(x.id)?.label || short(x.id) : GROUP[x.id].label);
      this.trailEl.innerHTML = this.trail.map((x, i) => `<button type="button" data-go="crumb" data-i="${i}">${brk(nm(x))}</button><span aria-hidden="true">›</span>`).join('') + `<b>${brk(nm(f))}</b>`;
      this.trailEl.hidden = false;
    } else this.trailEl.hidden = true;
    const ins = this.neighbours('in'), outs = this.neighbours('out');
    const none = !ins.length && !outs.length;
    this.flow.classList.toggle('lone', none);
    this.flow.innerHTML = none
      ? `<svg class="rg-wires" aria-hidden="true"></svg><div class="rg-mid">${this.focusHtml()}</div>${this.emptyHtml()}`
      : `<svg class="rg-wires" aria-hidden="true"></svg>${this.colHtml('in', ins)}<div class="rg-mid">${this.focusHtml()}</div>${this.colHtml('out', outs)}`;
    this.detail.innerHTML = f.k === 'node' ? this.nodeDetail(this.nodes.get(f.id)) : this.groupDetail(GROUP[f.id]);
    this.layout();
    if (scroll) {
      const r = this.flow.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight * 0.6) this.fig.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }

  // Wide: three columns joined by short wires. Narrow: one column, in reading order, with no wires at all.
  layout() {
    const W = this.flow.clientWidth;
    if (!W) return;
    const stack = W < 560;
    this.flow.classList.toggle('stack', stack);
    if (stack !== this.stack) { this.stack = stack; this.render(); return; }
    const svg = this.flow.querySelector('.rg-wires');
    if (!svg) return;
    svg.replaceChildren();
    if (stack) return;
    const box = this.flow.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
    svg.setAttribute('width', box.width);
    svg.setAttribute('height', box.height);
    const defs = el('defs', {}, svg);
    const mk = el('marker', { id: 'rg-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0,1 L9,5 L0,9 z', fill: 'var(--ink-2)' }, mk);
    const mh = el('marker', { id: 'rg-arrow-h', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
    el('path', { d: 'M0,1 L9,5 L0,9 z', fill: 'var(--accent)' }, mh);
    const fr = this.flow.querySelector('.rg-focus').getBoundingClientRect();
    for (const side of ['in', 'out']) {
      const cards = [...this.flow.querySelectorAll(`.rg-${side} .rg-card`)];
      const n = cards.length;
      const span = Math.max(0, Math.min(fr.height - 24, n * 14));
      cards.forEach((c, i) => {
        const r = c.getBoundingClientRect();
        const cy = r.top + Math.min(r.height / 2, 20) - box.top;
        const fy = fr.top + fr.height / 2 - box.top + (n > 1 ? (i / (n - 1) - 0.5) * span : 0);
        const [x0, y0, x1, y1] = side === 'in'
          ? [r.right - box.left, cy, fr.left - box.left - 2, fy]
          : [fr.right - box.left, fy, r.left - box.left - 2, cy];
        const mx = (x0 + x1) / 2;
        const p = el('path', { class: 'rg-wire' + (c.classList.contains('svc') ? ' svc' : ''), d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1}`, 'marker-end': 'url(#rg-arrow)' }, svg);
        c._wire = p;
      });
    }
  }

  hover(card, on) {
    if (!card || !card._wire) return;
    card._wire.classList.toggle('hot', on);
    card._wire.setAttribute('marker-end', on ? 'url(#rg-arrow-h)' : 'url(#rg-arrow)');
  }

  // A tapped topic or service opens its facts in place, under the row or chip list it was tapped in.
  toggleInfo(btn) {
    const open = btn.getAttribute('aria-expanded') === 'true';
    this.fig.querySelectorAll('.rg-tinfo').forEach((x) => x.remove());
    this.fig.querySelectorAll('[aria-expanded="true"]').forEach((x) => x.setAttribute('aria-expanded', 'false'));
    if (open) { this.layout(); return; }
    const isTopic = btn.dataset.topic !== undefined;
    const html = isTopic ? this.topicInfo(this.topics.get(btn.dataset.topic)) : this.svcInfo(this.svcs.get(btn.dataset.svc));
    const li = btn.closest('li');
    const box = h(li ? 'li' : 'div', { class: 'rg-tinfo' });
    box.innerHTML = (li ? '' : `<div class="rg-tname">${brk(btn.dataset.topic || btn.dataset.svc)}</div>`) + html;
    if (li) li.after(box);
    else (btn.closest('.rg-list') || btn).after(box);
    btn.setAttribute('aria-expanded', 'true');
    this.layout();
  }

  // ---------- facts ----------
  nodeRef(id, count, tag = '') {
    const n = this.nodes.get(id);
    if (!n) return `<span class="rg-plain">${brk(id.replace(/^\//, ''))}</span>`;
    return `<button type="button" class="rg-chip" data-go="node" data-id="${esc(id)}" style="--g:${GROUP[n.group]?.color}"><i></i>${brk(n.label)}${count > 1 ? ` <small>×${count}</small>` : ''}${tag ? ` <small>${esc(tag)}</small>` : ''}</button>`;
  }
  typeHtml(type) {
    const def = this.defs.get(type);
    let s = `<code>${brk(type)}</code>`;
    if (def) {
      const text = def.lines.map((l) => l.t).join('\n').replace(/\n{3,}/g, '\n\n');
      s += `<details class="rg-def"><summary>Its definition</summary><pre>${esc(text)}</pre></details>`;
    }
    return s;
  }
  topicInfo(t) {
    if (!t) return '';
    const facts = [];
    const r1 = fmtHz(t.hz), r2 = fmtHz(t.hz2);
    if (!t.pubs.length) facts.push(['Rate', 'nobody published it during the capture']);
    else if (r1 === null && r2 === null || (t.hz === 0 && t.hz2 === 0) || (t.hz === 0 && r2 === null) || (r1 === null && t.hz2 === 0)) facts.push(['Rate', 'quiet: nothing sent while Talos held still, because it is sent on events, not on a timer']);
    else facts.push(['Rate', `${r1 ?? '–'} Hz before the run, ${r2 ?? '–'} Hz after it`]);
    if (t.qos.length) facts.push(['QoS', t.qos.map((q) => q.replace('/', ', ').replace('_', ' ')).join('; ') + (t.latched ? ' (latched for late joiners)' : '')]);
    const size = fmtBytes(t.bytes);
    if (size) facts.push(['Size', size + ' per message']);
    const simNote = t.sim
      ? /\/simulator\/|\/sim_/.test(t.name)
        ? 'Only the simulator publishes it; it doesn’t exist on the robot.'
        : 'In Nereus the simulator publishes it; on the robot a driver or a board does.'
      : '';
    const infra = this.infra.has(t.name) ? 'Nearly every node uses it, so it isn’t drawn as a link.' : '';
    const hint = [t.note, simNote, infra].filter(Boolean).map(esc).join(' ');
    return `<div class="rg-type">${this.typeHtml(t.type)}</div>
      <dl class="rg-facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${hint ? `<p class="rg-hint">${hint}</p>` : ''}
      <p class="rg-sub">Published by</p><div class="rg-list">${t.pubs.map(([n, c]) => this.nodeRef(n, c, t.idle?.includes(n) ? 'idle in sim' : '')).join('') || '<span class="rg-hint">nobody</span>'}</div>
      <p class="rg-sub">Subscribed by</p><div class="rg-list">${t.subs.map(([n, c]) => this.nodeRef(n, c)).join('') || '<span class="rg-hint">nobody</span>'}</div>
      ${t.subs.some(([, c]) => c > 1) ? '<p class="rg-hint">×N: one node holding N subscriptions to it.</p>' : ''}`;
  }
  svcInfo(v) {
    if (!v) return '';
    const under = v.kind === 'action'
      ? `<p class="rg-hint">An action: underneath, three services (<code>send_goal</code>, <code>cancel_goal</code>, <code>get_result</code>) and two topics (<code>feedback</code>, <code>status</code>) under <code>${brk(short(v.name))}/_action/</code>.</p>`
      : '';
    return `<div class="rg-type">${this.typeHtml(v.type)}</div>${under}
      <p class="rg-sub">${v.kind === 'action' ? 'Action server' : 'Server'}</p><div class="rg-list">${v.servers.map((n) => this.nodeRef(n)).join('') || '<span class="rg-hint">nobody serves it in sim</span>'}</div>
      <p class="rg-sub">Called by</p><div class="rg-list">${v.clients.map((n) => this.nodeRef(n)).join('') || '<span class="rg-hint">nobody during the capture</span>'}</div>`;
  }

  topicChip(name, count) {
    return `<button type="button" class="rg-tchip" data-topic="${esc(name)}" aria-expanded="false">${brk(short(name))}${count > 1 ? ` <small>×${count}</small>` : ''} <b>${rateTag(this.topics.get(name))}</b></button>`;
  }
  svcChip(name) {
    return `<button type="button" class="rg-tchip" data-svc="${esc(name)}" aria-expanded="false">${brk(short(name))}</button>`;
  }

  foot() {
    return `<p class="rg-foot">Captured in Nereus while the full stack ran <code>RepairCompMpcTree</code>. Rates are what a busy desktop delivered, not robot specs; <b>quiet</b> means nothing was sent while Talos held still. Not drawn as links: <code>/clock</code>, <code>/tf</code>, <code>/tf_static</code>, <code>/rosout</code>, <code>/parameter_events</code> and <code>/diagnostics</code>, which nearly every node uses, and the hidden helper nodes <code>tf2</code> creates.</p>`;
  }

  nodeDetail(n) {
    const [pkg, exe] = n.package.includes(':') ? n.package.split(':').map((s) => s.trim()) : [n.package, null];
    const launchName = n.launch ? n.launch.split('/').pop() : null;
    const pub = n.pub.filter(([t]) => !this.infra.has(t)), sub = n.sub.filter(([t]) => !this.infra.has(t));
    const srv = [...n.srv.filter(([s]) => !PARAM_SRV.test(s)), ...n.asrv];
    const calls = [...n.cli.filter(([s]) => !PARAM_SRV.test(s)), ...n.acli];
    const paramCalls = [...new Set(n.cli.filter(([s]) => PARAM_SRV.test(s)).map(([s]) => s.replace(PARAM_SRV, '')))];
    const dis = (title, items) => (items.length ? `<details class="rg-all"><summary>${title} <small>${items.length}</small></summary><div class="rg-list">${items.join('')}</div></details>` : '');
    return `<dl class="rg-facts rg-node-facts">
        <dt>Package</dt><dd><code class="nw">${esc(pkg)}</code>${exe ? `, executable <code class="nw">${esc(exe)}</code>` : ''}</dd>
        <dt>Runs</dt><dd>${esc(RUNS[n.runs] || n.runs)}</dd>
        ${launchName ? `<dt>Started by</dt><dd><a href="${esc(n.launch)}">${brk(launchName)}</a></dd>` : ''}
        ${paramCalls.length ? `<dt>Also</dt><dd>changes the parameters of ${paramCalls.map((p) => `<code>${brk(short(p))}</code>`).join(', ')}</dd>` : ''}
      </dl>
      <div class="rg-alls">
      ${dis('Every topic it publishes', pub.map(([t, c]) => this.topicChip(t, c)))}
      ${dis('Every topic it subscribes to', sub.map(([t, c]) => this.topicChip(t, c)))}
      ${dis('Services and actions it serves', srv.map(([s]) => this.svcChip(s)))}
      ${dis('Services and actions it calls', calls.map(([s]) => this.svcChip(s)))}
      </div>${this.foot()}`;
  }

  groupDetail(g) {
    const ms = this.d.nodes.filter((n) => n.group === g.id);
    return `<ul class="rg-roles">${ms.map((n) => `<li><button type="button" class="rg-chip" data-go="node" data-id="${esc(n.id)}" style="--g:${g.color}"><i></i>${brk(n.label)}</button> ${esc(n.role)}</li>`).join('')}</ul>${this.foot()}`;
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
  ControllerCommand: `One half of a setpoint for the MPC. Two topics carry it: <code>controller/linear</code> (position or velocity) and <code>controller/angular</code> (attitude or turn rate). Until both halves have a mode, the MPC outputs nothing. Leave <code>mode</code> unset and you send DISABLED (0): the MPC goes idle.`,
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
  'KillSwitchReport:KILL_SWITCH_PHYSICAL': `Slot 0, the physical kill switch: the handle on the port bow window (<a href="commanding.html#kill">Commanding Talos</a>). The board reads it directly and rejects a ROS report on slot 0.`,
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
  const side = note.parentElement;
  const maBody = side.parentElement;
  const narrowQ = matchMedia('(max-width: 760px)');
  let cur = null, sel = -1, yamlMap = {};
  // Where the explanation sits. Wide: beside the file. Phones: above the file until a line is tapped, then right
  // under that line, so the answer appears where the tap happened.
  function placeNote() {
    lines.querySelectorAll('.ma-inline').forEach((x) => x.remove());
    if (!narrowQ.matches) { if (note.parentElement !== side) side.prepend(note); return; }
    if (sel < 0) { maBody.before(note); return; }
    const li = h('li', { class: 'ma-inline' });
    li.appendChild(note);
    lines.children[sel].after(li);
    const r = note.getBoundingClientRect();
    if (r.bottom > innerHeight) scrollBy({ top: Math.min(r.bottom - innerHeight + 12, r.top - 70), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }
  narrowQ.addEventListener('change', placeNote);

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
      // banner comments ("# =====…") only: real comments wrap so they can be read whole
      if (l.k === 'comment' && /^\s*#\s*[=\-#*~]{6,}\s*$/.test(l.t)) b.classList.add('cmt');
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
    placeNote();
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
    lines.querySelectorAll(':scope > li:not(.ma-inline) > button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === sel)));
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
    note.innerHTML = `<div class="ma-k">${kind}</div>${l.k !== 'blank' && !narrowQ.matches ? `<div class="ma-line">${lineHtml(l)}</div>` : ''}${body}`;
    renderYaml(l.k === 'field' ? yamlMap[l.name + ':' + l._part] : null);
    placeNote();
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
    payload: '{}   # no fields',
    text: 'Opening the Autonomy panel asks <code>doTask</code> which trees exist. The viewer sends the request and carries on drawing; the reply arrives in a callback.' },
  { from: 'a', to: 'v', label: 'trees', kind: 'Service response', name: '/talos/autonomy/list_trees', type: 'riptide_msgs2/srv/ListTrees',
    payload: 'trees:\n- …/trees/ActuatorTrees.xml\n- …/trees/BinTree.xml\n- …\n- …/trees/RepairCompMpcTree.xml\n- …',
    text: '<code>doTask</code> lists every <code>.xml</code> file in its tree folders, as full paths. The panel\'s picker shows them.' },
  { from: 'v', to: 'a', label: 'run_tree goal', kind: 'Action goal', name: '/talos/autonomy/run_tree', type: 'riptide_msgs2/action/ExecuteTree',
    payload: 'tree: …/trees/RepairCompMpcTree.xml',
    text: 'Start sends one of those paths back as a goal. Underneath, this is a call to the service <code>autonomy/run_tree/_action/send_goal</code>, with a fresh goal ID.' },
  { from: 'a', to: 'v', label: 'accepted', kind: 'Goal response', name: '/talos/autonomy/run_tree', type: 'riptide_msgs2/action/ExecuteTree',
    payload: 'accepted: true',
    text: '<code>doTask</code> rejects the goal if a tree is already running or the file doesn\'t exist. Here it accepts, loads the XML and starts ticking the tree every 30 ms. The viewer\'s Motion panel switches to "Autonomy owns motion".' },
  { from: 'a', to: 'v', label: 'tree_stack', topic: true, kind: 'Topic', name: '/talos/autonomy/tree_stack', type: 'riptide_msgs2/msg/TreeStack',
    payload: 'stack:\n- MISSION\n- CompMissionTreeMpc\n- COMP\n- ForceSuccess\n- SlalomPathMpc\nnode_id: 0',
    text: 'Whenever a tree node starts or finishes, <code>doTask</code> publishes the stack of running nodes, root first. It is a topic, not the action\'s feedback, so every viewer sees it, not only the one that pressed Start. This stack is from the capture, as the slalom started; deeper nodes, down to the <code>FollowPath</code> calls, join it as they run.' },
  { from: 'a', to: 'm', label: 'follow_path', kind: 'Action goal', name: '/talos/follow_path', type: 'riptide_msgs2/action/FollowPath',
    payload: 'path_points:\n- header:\n    stamp: …\n    frame_id: world\n  pose:\n    position: {x: …, y: …, z: …}\n    orientation: …\n- …\nsegments: []    # straight lines\nmax_speed: 0.0  # the MPC\'s own limit',
    text: 'The tree\'s <code>FollowPath</code> node turns its <code>waypoints</code> attribute (<code>"x,y,z,yaw; …"</code>) into a goal for the MPC (<a href="https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/include/riptide_autonomy/bt_actions/FollowPath.btaction.hpp#L64"><code>FollowPath.btaction.hpp</code></a>). It gives up after its <code>timeout</code>, 60 s unless the tree sets another.' },
  { from: 'm', to: 'a', label: 'feedback', topic: true, kind: 'Action feedback', name: '/talos/follow_path/_action/feedback', type: 'riptide_msgs2/action/FollowPath',
    payload: 'has_generated: true\ncurrent_prog: …   # how far along\nexpected_prog: …  # path length',
    text: 'Every 50 ms control tick while the path runs. Feedback is an ordinary topic underneath, so any node or laptop could watch it.' },
  { from: 'm', to: 'a', label: 'result', kind: 'Action result', name: '/talos/follow_path', type: 'riptide_msgs2/action/FollowPath',
    payload: 'error_code: 0   # NO_ERROR\nerror_msg: \'\'\n# status: SUCCEEDED',
    text: 'When the reference has reached the last point and Talos has settled near it (settle trust 0.8, or within 10 cm and 0.1 rad and slow), the MPC succeeds the goal and holds the end pose (<a href="https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc/src/mpc_controller_node.cpp#L1116"><code>mpc_controller_node.cpp</code></a>). A new <code>controller/linear</code> or <code>angular</code> setpoint would end it early instead, as aborted, with the reason in <code>error_msg</code>.' },
  { from: 'a', to: 'm', label: 'DISABLED', topic: true, kind: 'Topics', name: '/talos/controller/linear + /talos/controller/angular', type: 'riptide_msgs2/msg/ControllerCommand',
    payload: 'mode: 0   # DISABLED, on both',
    text: 'Many paths, detections and actuator calls later, the tree ends. <code>doTask</code> publishes DISABLED on both controller topics ("no reason for it to be going"), and the MPC goes idle.' },
  { from: 'a', to: 'v', label: 'result', kind: 'Action result', name: '/talos/autonomy/run_tree', type: 'riptide_msgs2/action/ExecuteTree',
    payload: 'error: false\nreturncode: 2   # tree: SUCCESS\n# status: SUCCEEDED',
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
    const fs = narrow ? 12.5 : 13; // css px: the svg is drawn at its real width, so this is the rendered size
    const L = 22, R = 4, top = 4, headH = 42, rowH = narrow ? 29 : 36;
    const colW = (W - L - R) / LIVES.length;
    const X = Object.fromEntries(LIVES.map((l, i) => [l.id, L + colW * (i + 0.5)]));
    const y0 = top + headH + 26;
    const H = y0 + rowH * (STEPS.length - 1) + 12;
    const svg = el('svg', { class: 'ac-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': 'Message sequence' });
    const uid = Math.random().toString(36).slice(2, 7);
    const defs = el('defs', {}, svg);
    for (const [id, c] of [['a', 'var(--ink-2)'], ['h', 'var(--accent)'], ['f', 'var(--muted)']]) {
      const m = el('marker', { id: `ac-${id}-${uid}`, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: c }, m);
    }
    for (const l of LIVES) {
      el('line', { class: 'life', x1: X[l.id], x2: X[l.id], y1: top + headH, y2: H - 4 }, svg);
      const g = el('g', { class: 'head' }, svg);
      const bw = Math.min(colW - 6, 170);
      el('rect', { x: X[l.id] - bw / 2, y: top, width: bw, height: headH, rx: 7 }, g);
      const t = el('text', { x: X[l.id], y: top + headH / 2 - 8, style: `font-size:${fs}px` }, g);
      t.textContent = narrow && l.short ? l.short : l.label;
      const s = el('text', { class: 'sub', x: X[l.id], y: top + headH / 2 + 9, style: `font-size:${narrow ? 11.5 : 12}px` }, g);
      s.textContent = l.sub;
    }
    msgs = STEPS.map((st, i) => {
      const y = y0 + rowH * i;
      const g = el('g', { class: 'msg' + (st.topic ? ' topic' : ''), tabindex: 0, role: 'button', 'aria-label': `Step ${i + 1}: ${st.kind} ${st.name}` }, svg);
      el('rect', { class: 'hit', x: 0, y: y - rowH + 6, width: W, height: rowH }, g);
      const x0 = X[st.from], x1 = X[st.to];
      const dir = Math.sign(x1 - x0);
      el('path', { d: `M${x0 + dir * 3},${y} L${x1 - dir * 3},${y}` }, g);
      const t = el('text', { x: (x0 + x1) / 2, y: y - 5, style: `font-size:${fs - 0.5}px` }, g);
      t.textContent = st.label;
      const n = el('text', { class: 'step-n', x: L - 8, y: y + 4, style: `font-size:${narrow ? 12 : 12.5}px` }, g);
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
      m.path.setAttribute('marker-end', `url(#ac-${j === step ? 'h' : j > step ? 'f' : 'a'}-${m.path.dataset.uid})`);
    });
    const st = STEPS[step];
    count.textContent = `Step ${step + 1} of ${STEPS.length}`;
    prev.disabled = step === 0;
    const last = step === STEPS.length - 1;
    next.textContent = last ? 'Start over' : 'Next ›';
    next.setAttribute('aria-label', last ? 'Back to step 1' : 'Next step');
    detail.innerHTML = `<div class="ac-k">${esc(st.kind)}</div><div class="ac-name">${brk(st.name)}</div><div class="ac-type">${brk(st.type)}</div><pre>${esc(st.payload)}</pre><p>${st.text}</p>`;
  }
  prev.addEventListener('click', () => go(step - 1));
  next.addEventListener('click', () => go(step === STEPS.length - 1 ? 0 : step + 1));
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
  const ORIN = [
    { id: 'ekf', label: 'EKF', sub: 'ekf_localization_node' },
    { id: 'mpc', label: 'MPC', sub: 'mpc_controller' },
    { id: 'auto', label: 'autonomy', sub: 'doTask' },
  ];
  const LAPS = [
    { id: 'viewer', label: 'Nereus viewer', short: 'viewer', sub: 'laptop 1' },
    { id: 'cli', label: 'ros2 topic echo', short: 'ros2 CLI', sub: 'laptop 2' },
  ];
  const ROUTER = { id: 'router', label: 'Zenoh router', sub: 'rmw_zenohd, TCP 7447', short: 'rmw_zenohd · 7447', router: true };
  const INFO = {
    dds: {
      ekf: 'A DDS participant on the Orin. It announces itself by multicast to the whole network and keeps a connection to every participant it shares a topic with, laptops included.',
      mpc: 'Same for every node: discovery traffic grows with the number of participants, on both sides of the tether.',
      auto: 'Same for every node: discovery traffic grows with the number of participants, on both sides of the tether.',
      viewer: 'Each laptop node must hear the Orin\'s multicast announcements and connect to each Orin node. Wi-Fi and routers often drop multicast, and then the laptop sees nothing.',
      cli: 'Even one <code>ros2 topic echo</code> is a full participant, discovered by and connected to everyone.',
    },
    zenoh: {
      ekf: 'A Zenoh session on the Orin. It reaches the router on the same computer.',
      mpc: 'A Zenoh session on the Orin. It reaches the router on the same computer.',
      auto: 'A Zenoh session on the Orin. It reaches the router on the same computer.',
      router: '<b>rmw_zenohd</b>, started at boot by the Orin\'s launcher service. It listens on TCP port 7447, does discovery for every session, and forwards data to the laptops.',
      viewer: 'A client session: one outgoing TCP connection to <code>tcp/orin2:7447</code> (<code>zenoh_session.json5</code>). All its data goes through the router; the robot never connects back.',
      cli: 'The command line is a client like any other node. Run it with <code>--no-daemon</code> after switching RMW, or the old daemon answers.',
    },
  };
  const DEFAULT = {
    dds: '<b>5 participants, 10 connections, 6 of them across the tether.</b> Every participant discovers every other by multicast and connects to each one it shares a topic with. Tap a box.',
    zenoh: '<b>5 sessions, 5 connections, all to the router.</b> Only the two laptop connections cross the tether. Tap a box.',
  };
  let mode = 'zenoh', sel = null, width = 0;

  function draw() {
    const W = Math.max(280, box.clientWidth || 600);
    width = W;
    const narrow = W < 520;
    const z = mode === 'zenoh';
    const fs = narrow ? 13 : 14, fsub = narrow ? 12 : 12.5;
    const bh = narrow ? 34 : 44; // box height (narrow boxes have no subtitle, except the router)
    const pos = {};
    // Orin band: three nodes on one row with Zenoh (router below them); with DDS, the MPC drops between the
    // other two so that the EKF-autonomy link doesn't run through it.
    const oy = narrow ? 44 : 54;
    const xs = [W * 0.17, W * 0.5, W * 0.83];
    ORIN.forEach((n, i) => { pos[n.id] = { x: xs[i], y: oy + (!z && n.id === 'mpc' ? (narrow ? 58 : 62) : 0) }; });
    if (z) pos.router = { x: W * 0.5, y: oy + (narrow ? 82 : 92) };
    const tetherY = narrow ? 196 : 206;
    const ly = tetherY + (narrow ? 72 : 78);
    pos.viewer = { x: W * 0.28, y: ly };
    pos.cli = { x: W * 0.72, y: ly };
    const H = ly + bh / 2 + 34;
    const nodes = [...ORIN, ...(z ? [ROUTER] : []), ...LAPS];
    const edges = [];
    if (z) [...ORIN, ...LAPS].forEach((n) => edges.push([n.id, 'router']));
    else {
      const all = [...ORIN, ...LAPS].map((n) => n.id);
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) edges.push([all[i], all[j]]);
    }
    const svg = el('svg', { class: 'zn-svg', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'group', 'aria-label': z ? 'Zenoh: every session connects to the router on the Orin' : 'DDS: every participant connects to every other' });
    // bands: labels sit where no edge enters (top-left of the Orin band, bottom-left of the laptop band)
    el('rect', { class: 'zn-band', x: 0, y: 0, width: W, height: tetherY - 14, rx: 8 }, svg);
    el('rect', { class: 'zn-band', x: 0, y: tetherY + 14, width: W, height: H - tetherY - 14, rx: 8 }, svg);
    const t1 = el('text', { class: 'zn-blabel', x: 10, y: 17 }, svg); t1.textContent = narrow ? 'ON THE ORIN' : 'ON THE ORIN (TALOS)';
    const t2 = el('text', { class: 'zn-blabel', x: 10, y: H - 10 }, svg); t2.textContent = 'TOPSIDE LAPTOPS';
    // the tether
    el('line', { class: 'zn-tether', x1: 6, x2: W - 6, y1: tetherY, y2: tetherY }, svg);
    const tl = el('text', { class: 'zn-tlabel', x: W - 10, y: tetherY - 5 }, svg); tl.textContent = 'tether';
    const gE = el('g', {}, svg);
    const half = (id) => ({ w: (narrow ? (id === 'router' ? 130 : id === 'viewer' || id === 'cli' ? 92 : 78) : (id === 'router' ? 170 : 150)) / 2, h: (id === 'router' && narrow ? 42 : bh) / 2 });
    const edgeEls = edges.map(([a, b]) => {
      const p = pos[a], q = pos[b];
      const g = el('g', { class: 'zn-edge' }, gE);
      el('line', { x1: p.x, y1: p.y, x2: q.x, y2: q.y }, g);
      // where it crosses the tether
      if ((p.y - tetherY) * (q.y - tetherY) < 0) {
        const t = (tetherY - p.y) / (q.y - p.y);
        el('circle', { class: 'zn-cross', cx: p.x + (q.x - p.x) * t, cy: tetherY, r: 4 }, g);
      }
      return { a, b, g };
    });
    const nodeEls = nodes.map((n) => {
      const p = pos[n.id], s = half(n.id);
      const g = el('g', { class: 'zn-node' + (n.router ? ' router' : ''), tabindex: 0, role: 'button', 'aria-label': n.label, transform: `translate(${p.x},${p.y})` }, svg);
      el('rect', { x: -s.w, y: -s.h, width: 2 * s.w, height: 2 * s.h, rx: 7 }, g);
      const showSub = !narrow || n.router || n.id === 'viewer' || n.id === 'cli';
      const t = el('text', { y: showSub ? -7 : 0, style: `font-size:${fs}px` }, g);
      t.textContent = narrow && n.short && !n.router ? n.short : n.label;
      if (showSub) {
        const st = el('text', { class: 'sub', y: 10, style: `font-size:${fsub}px` }, g);
        st.textContent = narrow && n.short && n.router ? n.short : n.sub;
      }
      const pick = () => { sel = sel === n.id ? null : n.id; highlight(); };
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      return { n, g };
    });
    function highlight() {
      nodeEls.forEach(({ n, g }) => g.classList.toggle('hot', n.id === sel));
      edgeEls.forEach(({ a, b, g }) => {
        g.classList.toggle('hot', !!sel && (a === sel || b === sel));
        g.classList.toggle('dim', !!sel && a !== sel && b !== sel);
      });
      const n = nodes.find((x) => x.id === sel);
      note.innerHTML = n ? `<b>${esc(n.label)}.</b> ${INFO[mode][n.id]}` : DEFAULT[mode];
    }
    box.replaceChildren(svg);
    highlight();
  }
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.m;
    sel = null;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  new ResizeObserver(() => { const w = box.clientWidth; if (w && Math.abs(w - width) > 1) draw(); }).observe(box);
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
