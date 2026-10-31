// The code map's "stack in layers" diagram: boxes in layer bands, data edges, two layouts (wide and phone).
// A page-specific cousin of src/viz/graph.js with what this figure needs:
//  * edges routed as orthogonal polylines (`pts`, plus `a`/`b` ports on the boxes) so nothing crosses;
//  * a kicker line inside each box (the layer, on the phone layout, where there's no room for band labels);
//  * `focus(edgeKeys)`: light a set of edges (one hop of the step-through) and dim the rest;
//  * pulse dots only on lit edges, never at rest, and none under prefers-reduced-motion.
import { el } from './chart.js';

const measure = document.createElement('canvas').getContext('2d');
function textWidth(text, weight, size, spacing = 0) {
  measure.font = `${weight} ${size}px 'Archivo Variable', Archivo, system-ui, sans-serif`;
  return measure.measureText(text).width + spacing * size * text.length;
}
const FS = { label: 13, sub: 11.5, kick: 11.5 };

// A port on a box: ['t'|'b', x?] top/bottom edge (at x), ['l'|'r', y?] left/right edge (at y).
function port(n, spec) {
  const [s, v] = spec;
  if (s === 't') return [v ?? n.x, n.y - n.h / 2 - 1.5];
  if (s === 'b') return [v ?? n.x, n.y + n.h / 2 + 1.5];
  if (s === 'l') return [n.x - n.w / 2 - 1.5, v ?? n.y];
  return [n.x + n.w / 2 + 1.5, v ?? n.y];
}
// Point on the box outline in the direction of `p`.
function toward(n, p) {
  const dx = p[0] - n.x, dy = p[1] - n.y;
  const hw = n.w / 2 + 1.5, hh = n.h / 2 + 1.5;
  const s = Math.min(hw / Math.abs(dx || 1e-9), hh / Math.abs(dy || 1e-9));
  return [n.x + dx * s, n.y + dy * s];
}
// Polyline with rounded corners.
function roundPath(pts, r = 9) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [cx, cy] = pts[i], [nx, ny] = pts[i + 1];
    const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy);
    const k = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${cx - ((cx - px) / l1) * k},${cy - ((cy - py) / l1) * k} Q${cx},${cy} ${cx + ((nx - cx) / l2) * k},${cy + ((ny - cy) / l2) * k}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]},${last[1]}`;
}

export class StackGraph {
  // nodes: [{id, label, sub, kick, side, x, y}], edges: [{from, to, label, dash, both, labelOf, pts, a, b, lx, ly, anchor}],
  // bands: [{label, y, h}]; narrow: {below, width, height, bands, nodes: {id: {...}}, edges: {'from>to': {...}}}.
  // onNode(id | null) fires on a tap or hover of a box (null: tapped outside the boxes).
  constructor(container, { width, height, nodes, edges, bands, narrow, label, onNode }) {
    this.cfg = { width, height, nodes, edges, bands, narrow, label };
    this.container = container;
    this.onNode = onNode;
    this.state = { node: null, edges: [] };
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.build(this.isNarrow());
    new ResizeObserver(() => {
      const n = this.isNarrow();
      if (n !== this.narrowOn) { this.build(n); this.apply(); }
    }).observe(container);
    new IntersectionObserver(([en]) => { this.visible = en.isIntersecting; this.kick(); }).observe(container);
  }
  boxWidth() {
    const cs = getComputedStyle(this.container);
    const w = this.container.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return w > 0 ? w : innerWidth;
  }
  isNarrow() { return this.boxWidth() < this.cfg.narrow.below; }
  build(narrow) {
    this.narrowOn = narrow;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = null; }
    const c = this.cfg, alt = narrow ? c.narrow : null;
    const W = alt ? alt.width : c.width, H = alt ? alt.height : c.height;
    const old = this.svg;
    this.svg = el('svg', { class: 'cms' + (narrow ? ' narrow' : ''), viewBox: `0 0 ${W} ${H}`, role: 'group' });
    if (c.label) this.svg.setAttribute('aria-label', c.label);
    if (old) old.replaceWith(this.svg); else this.container.appendChild(this.svg);
    this.uid = this.uid || '-' + Math.random().toString(36).slice(2, 8);
    const defs = el('defs', {}, this.svg);
    for (const [id, color] of [['a', 'var(--ink-2)'], ['h', 'var(--accent)']]) {
      const mk = el('marker', { id: id + this.uid, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: color }, mk);
    }
    const gB = el('g', {}, this.svg);
    for (const b of (alt ? alt.bands : c.bands)) {
      el('rect', { class: 'cms-band' + (b.side ? ' side' : ''), x: b.x ?? 4, y: b.y, width: b.w ?? W - 8, height: b.h, rx: 10 }, gB);
      if (b.label) {
        const t = el('text', { class: 'cms-blabel', x: (b.x ?? 4) + 14, y: b.y + b.h / 2 }, gB);
        // Two-line headers: "A|B".
        b.label.split('|').forEach((line, i, all) => {
          const ts = el('tspan', { x: (b.x ?? 4) + 14, dy: i === 0 ? `${-(all.length - 1) * 0.6 + 0.35}em` : '1.2em' }, t);
          ts.textContent = line;
        });
      }
    }
    const gE = el('g', {}, this.svg);
    this.gP = el('g', {}, this.svg);
    const gN = el('g', {}, this.svg);
    const gL = el('g', {}, this.svg);
    this.nodes = new Map();
    for (const n0 of c.nodes) {
      const n = alt?.nodes?.[n0.id] ? { ...n0, ...alt.nodes[n0.id] } : n0;
      const kick = narrow ? n.kick : null;
      const w = Math.max(textWidth(n.label, 500, FS.label), textWidth(n.sub || '', 400, FS.sub), kick ? textWidth(kick, 650, FS.kick, 0.07) : 0) + 22;
      const h = kick ? 50 : 46;
      const g = el('g', { class: 'cms-node' + (n.side ? ' side' : ''), tabindex: 0, role: 'button', 'aria-pressed': 'false', transform: `translate(${n.x},${n.y})` }, gN);
      g.setAttribute('aria-label', [n.label, n.sub].filter(Boolean).join(', '));
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 7 }, g);
      const top = kick ? -h / 2 + 11 : -h / 2 + 17;
      if (kick) el('text', { class: 'k', y: top }, g).textContent = kick;
      el('text', { class: 'l', y: kick ? top + 14.5 : top }, g).textContent = n.label;
      if (n.sub) el('text', { class: 's', y: kick ? top + 28.5 : top + 17 }, g).textContent = n.sub;
      // Hover previews a box with a mouse; a tap pins it. Right after a tap the page may scroll the note into view,
      // which slides other boxes under a still mouse: ignore hover for a moment so the tapped box stays selected.
      const hoverOk = (e) => e.pointerType === 'mouse' && performance.now() > (this.hoverLock || 0);
      g.addEventListener('pointerenter', (e) => { if (hoverOk(e)) this.select(n.id, true); });
      g.addEventListener('pointerleave', (e) => { if (hoverOk(e) && this.hover) this.select(null, true); });
      g.addEventListener('click', () => { this.hover = false; this.select(this.state.node === n.id && !this.hoverSel ? null : n.id, false, true); this.hoverSel = false; });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.select(n.id, false, true); } });
      this.nodes.set(n.id, { ...n, g, w, h });
    }
    this.edges = c.edges.map((e0) => {
      const key = `${e0.from}>${e0.to}`;
      const e = { ...e0, ...(alt?.edges?.[key] || c.wideEdges?.[key] || {}), key };
      const a = this.nodes.get(e.from), b = this.nodes.get(e.to);
      const mid = e.pts || [];
      const p0 = e.a ? port(a, e.a) : toward(a, mid[0] || [b.x, b.y]);
      const p1 = e.b ? port(b, e.b) : toward(b, mid[mid.length - 1] || [a.x, a.y]);
      const pts = [p0, ...mid, p1];
      const path = el('path', { class: 'cms-edge' + (e.dash ? ' dash' : ''), d: roundPath(pts) }, gE);
      path.setAttribute('marker-end', `url(#a${this.uid})`);
      if (e.both) path.setAttribute('marker-start', `url(#a${this.uid})`);
      let label = null;
      if (e.label && !e.hideLabel) {
        // default: the middle of the longest segment, nudged up
        let best = 0, lx = 0, ly = 0;
        for (let i = 1; i < pts.length; i++) {
          const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          if (L > best) { best = L; lx = (pts[i][0] + pts[i - 1][0]) / 2; ly = (pts[i][1] + pts[i - 1][1]) / 2 - 5; }
        }
        label = el('text', { class: 'cms-elabel', x: e.lx ?? lx, y: e.ly ?? ly }, gL);
        label.style.textAnchor = e.anchor || 'middle';
        label.textContent = e.label;
      }
      return { ...e, path, label, len: 0 };
    });
    this.svg.addEventListener('click', (e) => { if (!e.target.closest('.cms-node')) this.select(null); });
    this.dots = [];
  }
  // tap: true when a box was tapped or clicked (not hovered), so the page can bring its note into view.
  select(id, hover = false, tap = false) {
    if (hover && !id && !this.hover) return;
    this.hover = hover && !!id;
    if (hover && id) this.hoverSel = true;
    this.state.node = id;
    if (tap) this.hoverLock = performance.now() + 1200;
    this.apply();
    if (this.onNode) this.onNode(id, tap);
  }
  // Light a set of edges (by 'from>to' key); [] clears.
  focus(keys) {
    this.state = { node: null, edges: keys };
    this.apply();
  }
  apply() {
    const { node, edges: keys } = this.state;
    const hot = new Set(node ? this.edges.filter((e) => e.from === node || e.to === node).map((e) => e.key) : keys);
    const near = new Set(node ? [node] : []);
    this.edges.forEach((e) => { if (hot.has(e.key)) { near.add(e.from); near.add(e.to); } });
    const any = hot.size > 0 || !!node;
    this.nodes.forEach((n, k) => {
      n.g.classList.toggle('dim', any && !near.has(k));
      n.g.classList.toggle('hot', k === node);
      n.g.setAttribute('aria-pressed', String(k === node));
    });
    const hotLabels = new Set(this.edges.filter((e) => hot.has(e.key)).map((e) => e.labelOf || e.key));
    this.edges.forEach((e) => {
      const on = hot.has(e.key);
      e.path.classList.toggle('hot', on);
      e.path.classList.toggle('dim', any && !on);
      e.path.setAttribute('marker-end', `url(#${on ? 'h' : 'a'}${this.uid})`);
      if (e.both) e.path.setAttribute('marker-start', `url(#${on ? 'h' : 'a'}${this.uid})`);
      if (e.label) e.label.classList.toggle('dim', any && !on && !hotLabels.has(e.key));
    });
    // Moving dots on the lit edges only (two-way edges get one each way).
    this.gP.replaceChildren();
    this.dots = this.reduced ? [] : this.edges.filter((e) => hot.has(e.key) && !e.dash).flatMap((e) => {
      const len = e.path.getTotalLength();
      const mk = (rev) => ({ e, len, rev, dot: el('circle', { class: 'cms-pulse', r: 3.4 }, this.gP) });
      return e.both ? [mk(false), mk(true)] : [mk(false)];
    });
    this.kick();
  }
  kick() {
    if (this.raf || !this.dots.length || !this.visible) return;
    const t0 = performance.now(), svg = this.svg;
    const loop = (now) => {
      if (svg !== this.svg || !this.dots.length || !this.visible) { this.raf = null; return; }
      const u = (((now - t0) / 1000) % 2.2) / 2.2;
      for (const { e, len, rev, dot } of this.dots) {
        const p = e.path.getPointAtLength((rev ? 1 - u : u) * len);
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
}
