// Behaviour trees chapter's copy of src/viz/graph.js, with: `dim: false` (a tap outlines the node, nothing fades),
// `defaultId` (the node shown when nothing is picked), edges with a hand-drawn `d` path and a `from` that may be a
// list of ids (one exit shared by a group), and bands with `dash: true` (a dashed rounded box instead of a fill).
// Node-and-edge diagrams (SVG). Nodes: {id, x, y, label, sub, shape: 'rect'|'circle'|'square', w, h, info}.
// Edges: {from, to, label, bend, dash, width, color}. Hover or tap a node to light its neighbourhood.
// Bands: labelled regions behind the nodes, {label, points: [[x, y], ...], lx, ly}; corners are rounded by the outline.
import { el } from './chart.js';

const measure = document.createElement('canvas').getContext('2d');
function textWidth(text, weight, size) {
  measure.font = `${weight} ${size}px 'Archivo Variable', Archivo, system-ui, sans-serif`;
  return measure.measureText(text).width;
}

export class Graph {
  // `narrow`: an optional second layout for small screens, used while the container is narrower than `narrow.below`
  // css px: { below, width, height, bands, nodes: { id: { x, y, ... } }, edges: { 'from>to': { bend, via, lx, ly, anchor } } }.
  // It is also used whenever the wide layout would be shrunk below 80% (a small laptop window), where its text would
  // drop under 10 px. `label`: an accessible name for the whole graph.
  constructor(container, { width = 900, height = 360, nodes = [], edges = [], bands = [], onSelect, arrows = true, info, narrow, label, dim = true, defaultId = null } = {}) {
    this.cfg = { width, height, nodes, edges, bands, narrow, label };
    this.dimOthers = dim;
    this.defaultId = defaultId;
    this.container = container;
    this.arrows = arrows;
    this.onSelect = onSelect;
    this.info = info;
    this.build(this.isNarrow());
    if (narrow) {
      new ResizeObserver(() => {
        const n = this.isNarrow();
        if (n === this.narrowOn) return;
        this.build(n);
        this.highlight(this.selected ?? null);
        if (this.pulseArgs) this.pulse(...this.pulseArgs);
      }).observe(container);
    }
    document.addEventListener('pointerdown', (e) => { if (this.selected && !this.svg.contains(e.target)) this.highlight(null); });
  }
  // The width the svg gets: the container's content box (or the window, before the container is laid out).
  boxWidth() {
    const cs = getComputedStyle(this.container);
    const w = this.container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return w > 0 ? w : innerWidth;
  }
  isNarrow() {
    const n = this.cfg.narrow;
    if (!n) return false;
    const w = this.boxWidth();
    return w < (n.below || 600) || w / this.cfg.width < 0.8;
  }
  build(narrow) {
    this.narrowOn = narrow;
    const c = this.cfg, alt = narrow ? c.narrow : null;
    const width = alt ? alt.width : c.width, height = alt ? alt.height : c.height;
    this.W = width; this.H = height;
    // A layout drawn small (one with no phone alternative, on a small laptop): its text grows toward 10 px on screen,
    // up to 20% and only as far as every box has room, so boxes keep their size and the layout stays as drawn.
    // Set once per build; the layout is not rebuilt on resize.
    const scale = this.boxWidth() / width;
    this.gs = Math.min(1.2, Math.max(1, 0.8 / scale)) || 1;
    if (this.gs > 1) {
      for (const n0 of c.nodes) {
        const n = alt?.nodes?.[n0.id] ? { ...n0, ...alt.nodes[n0.id] } : n0;
        if (n.shape === 'circle' || n.shape === 'square' || !(n.label || n.sub)) continue;
        const tw = Math.max(textWidth(n.label || '', n.bold ? 650 : 400, 12.5), textWidth(n.sub || '', 400, 11.5));
        this.gs = Math.min(this.gs, Math.max(1, (Math.max(n.w || 0, tw + 24) - 10) / tw));
      }
    }
    const old = this.svg;
    this.svg = el('svg', { class: alt ? 'graph narrow' : 'graph', viewBox: `0 0 ${width} ${height}`, role: 'group' });
    if (this.gs > 1) this.svg.style.setProperty('--gs', this.gs.toFixed(3));
    // Phone layouts: band labels about 11 px on screen (between 10.5 and 13.5 units).
    if (alt && scale > 0) this.svg.style.setProperty('--band-fs', `${Math.min(13.5, Math.max(10.5, 11 / scale)).toFixed(2)}px`);
    if (c.label) this.svg.setAttribute('aria-label', c.label);
    if (old) old.replaceWith(this.svg); else this.container.appendChild(this.svg);
    const defs = el('defs', {}, this.svg);
    for (const [id, color] of [['arrow', 'var(--ink-2)'], ['arrow-hot', 'var(--accent)']]) {
      const mk = el('marker', { id: id + this.uid(), viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: color }, mk);
    }
    const gBands = el('g', {}, this.svg);
    for (const b of (alt && alt.bands) || c.bands) {
      if (b.dash) {
        const [[x0, y0], , [x1, y1]] = b.points;
        el('rect', { class: 'band dash', x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0), rx: 12 }, gBands);
      } else el('path', { class: 'band', d: `M${b.points.map((q) => q.join(',')).join('L')}Z` }, gBands);
      const t = el('text', { class: 'band-label', x: b.lx ?? b.points[0][0] + 4, y: b.ly ?? b.points[0][1] + 12 }, gBands);
      t.textContent = b.label;
    }
    this.gEdges = el('g', {}, this.svg);
    this.gPulses = el('g', {}, this.svg);
    this.gNodes = el('g', {}, this.svg);
    this.gLabels = el('g', {}, this.svg); // edge labels sit above nodes and edges
    this.nodes = new Map();
    this.edges = [];
    c.nodes.forEach((n) => this.addNode(alt?.nodes?.[n.id] ? { ...n, ...alt.nodes[n.id] } : n));
    c.edges.forEach((e) => { const o = alt?.edges?.[e.key || `${e.from}>${e.to}`]; this.addEdge(o ? { ...e, ...o } : e); });
    // A touch "leaves" as soon as the finger lifts: only a mouse clears the highlight by leaving,
    // so a tapped node stays selected until another is tapped.
    this.svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.highlight(null); });
    // Touch: tapping empty space in the graph, or anywhere outside it, deselects.
    this.svg.addEventListener('pointerdown', (e) => { if (!e.target.closest('.node')) this.highlight(null); });
  }
  uid() {
    if (!this._uid) this._uid = '-' + Math.random().toString(36).slice(2, 8);
    return this._uid;
  }
  addNode(n) {
    const g = el('g', { class: 'node', tabindex: 0, role: 'button', 'aria-pressed': 'false', transform: `translate(${n.x},${n.y})` }, this.gNodes);
    const name = [n.label, n.sub].filter(Boolean).join(', ');
    if (name) g.setAttribute('aria-label', name);
    // Boxes grow to fit their text, so a label is never cut off by its own box.
    const fit = Math.max(textWidth(n.label || '', n.bold ? 650 : 400, 12.5), textWidth(n.sub || '', 400, 11.5)) + 24;
    const w = Math.max(n.w || 0, fit, n.label || n.sub ? 0 : 110), h = n.h || (n.sub ? 46 : 34);
    if (n.shape === 'circle') el('circle', { r: n.r || 20 }, g);
    else if (n.shape === 'square') el('rect', { x: -(n.r || 8), y: -(n.r || 8), width: 2 * (n.r || 8), height: 2 * (n.r || 8), rx: 2 }, g);
    else el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: n.rx ?? 7 }, g);
    if (n.fill) g.firstChild.style.fill = n.fill;
    if (n.stroke) g.firstChild.style.stroke = n.stroke;
    if (n.label) {
      const t = el('text', { y: n.sub ? -7 : 0 }, g);
      if (n.labelY !== undefined) t.setAttribute('y', n.labelY);
      t.textContent = n.label;
      if (n.bold) t.style.fontWeight = 650;
    }
    if (n.sub) {
      const t = el('text', { class: 'sub', y: 10 }, g);
      t.textContent = n.sub;
    }
    g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.highlight(n.id); });
    // A tap selects; tapping the selected node again deselects it.
    g.addEventListener('pointerdown', (e) => this.highlight(e.pointerType !== 'mouse' && this.selected === n.id ? null : n.id));
    g.addEventListener('focus', () => { if (this.selected !== n.id) this.highlight(n.id); });
    this.nodes.set(n.id, { ...n, g, w, h });
  }
  anchor(n, toward) {
    // Point on the node boundary in the direction of `toward`.
    const dx = toward.x - n.x, dy = toward.y - n.y;
    if (n.shape === 'circle') {
      const d = Math.hypot(dx, dy) || 1, r = (n.r || 20) + 2;
      return { x: n.x + (dx / d) * r, y: n.y + (dy / d) * r };
    }
    const hw = (n.shape === 'square' ? n.r || 8 : n.w / 2) + 2, hh = (n.shape === 'square' ? n.r || 8 : n.h / 2) + 2;
    const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
    return { x: n.x + dx * s, y: n.y + dy * s };
  }
  addEdge(e) {
    if (e.d) {
      // a hand-drawn route; the label goes where lx, ly say
      const path = el('path', { class: 'edge', d: e.d }, this.gEdges);
      if (this.arrows && e.arrow !== false) path.setAttribute('marker-end', `url(#arrow${this.uid()})`);
      if (e.dash) path.setAttribute('stroke-dasharray', '5 4');
      if (e.opacity !== undefined) path.style.opacity = e.opacity;
      let label = null;
      if (e.label) {
        label = el('text', { class: 'elabel', x: e.lx, y: e.ly }, this.gLabels);
        if (e.anchor) label.style.textAnchor = e.anchor;
        label.textContent = e.label;
      }
      const edge = { ...e, path, label };
      this.edges.push(edge);
      return edge;
    }
    const a = this.nodes.get(e.from), b = this.nodes.get(e.to);
    const bend = e.bend || 0;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const nx = -(b.y - a.y), ny = b.x - a.x, nl = Math.hypot(nx, ny) || 1;
    // `via`: an explicit control point [x, y] instead of a bend off the midpoint
    const curved = !!(bend || e.via);
    const c = e.via ? { x: e.via[0], y: e.via[1] } : { x: mx + (nx / nl) * bend, y: my + (ny / nl) * bend };
    const p0 = this.anchor(a, curved ? c : b), p1 = this.anchor(b, curved ? c : a);
    const d = curved ? `M${p0.x},${p0.y} Q${c.x},${c.y} ${p1.x},${p1.y}` : `M${p0.x},${p0.y} L${p1.x},${p1.y}`;
    const path = el('path', { class: 'edge', d }, this.gEdges);
    if (this.arrows && e.arrow !== false) path.setAttribute('marker-end', `url(#arrow${this.uid()})`);
    if (e.dash) path.setAttribute('stroke-dasharray', '4 4');
    if (e.width) path.style.strokeWidth = e.width;
    if (e.color) path.style.stroke = e.color;
    if (e.opacity !== undefined) path.style.opacity = e.opacity;
    let label = null;
    if (e.label) {
      // On a curved edge, sit on the curve's midpoint (p0 + 2c + p1) / 4, not on its control point.
      // lx, ly, anchor place it explicitly (beside a short edge, say).
      const lx = e.lx ?? (curved ? (p0.x + 2 * c.x + p1.x) / 4 : mx), ly = e.ly ?? (curved ? (p0.y + 2 * c.y + p1.y) / 4 : my) - 5;
      label = el('text', { class: 'elabel', x: lx, y: ly }, this.gLabels);
      if (e.anchor) label.style.textAnchor = e.anchor;
      label.textContent = e.label;
    }
    const edge = { ...e, path, label };
    this.edges.push(edge);
    return edge;
  }
  highlight(id) {
    this.selected = id;
    // nothing picked: the default node is lit, but nothing else fades
    const dimOthers = this.dimOthers && !!id;
    if (!id && this.defaultId) id = this.defaultId;
    const from = (e) => [].concat(e.from);
    const near = new Set([id]);
    if (id) this.edges.forEach((e) => { if (from(e).includes(id)) near.add(e.to); if (e.to === id) from(e).forEach((f) => near.add(f)); });
    this.nodes.forEach((n, k) => {
      n.g.classList.toggle('dim', dimOthers && !near.has(k));
      n.g.classList.toggle('hot', k === id);
      n.g.setAttribute('aria-pressed', String(k === id));
    });
    this.edges.forEach((e) => {
      const on = id && (from(e).includes(id) || e.to === id);
      e.path.classList.toggle('hot', !!on);
      e.path.classList.toggle('dim', dimOthers && !on);
      if (this.arrows && e.arrow !== false) e.path.setAttribute('marker-end', `url(#arrow${on ? '-hot' : ''}${this.uid()})`);
      if (e.label) { e.label.style.opacity = dimOthers && !on ? 0.2 : 1; e.label.classList.toggle('hot', !!on); }
    });
    if (this.info) this.info(id ? this.nodes.get(id) : null);
    if (this.onSelect) this.onSelect(id);
  }
  // Dots that travel along edges, `period` seconds per lap; respects reduced motion.
  pulse(edgeFilter = () => true, period = 1.6) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.pulseArgs = [edgeFilter, period];
    const svg = this.svg; // a rebuild for the other layout starts a fresh loop; this one stops
    const dots = this.edges.filter(edgeFilter).map((e) => ({ e, dot: el('circle', { class: 'pulse', r: 3.2 }, this.gPulses), len: e.path.getTotalLength() }));
    const t0 = performance.now();
    let visible = true;
    new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(svg);
    const loop = (now) => {
      if (svg !== this.svg) return;
      if (visible) {
        const u = (((now - t0) / 1000) % period) / period;
        dots.forEach(({ e, dot, len }) => {
          const p = e.path.getPointAtLength(((u + (e.phase || 0)) % 1) * len);
          dot.setAttribute('cx', p.x);
          dot.setAttribute('cy', p.y);
        });
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
