// The network map on computers.html: two boxes (inside the hull, on the surface) joined by the tether, a traffic
// filter that lights one kind of flow (and hides the edges that only exist in that view), Tailscale badges, and a
// readout strip above the drawing that shows the filter's text or the tapped machine's note.
// Own renderer (not viz/graph.js): it needs per-filter edges, badges and a phone layout with larger text.
import { el } from './chart.js';

const measure = document.createElement('canvas').getContext('2d');
const textW = (t, weight, size) => {
  measure.font = `${weight} ${size}px 'Archivo Variable', Archivo, system-ui, sans-serif`;
  return measure.measureText(t).width;
};

export class NetMap {
  // nodes: [{id, label, sub, html, bold, ts}]; edges: [{from, to, flows: {filter: dir}, style, only, width, label, plan: [filter]}]
  // filters: [{id, label, color, text}]; layouts: {narrow: {...}, wide: {...}} with W, H, bands, fs: [label, sub],
  // pos: {id: [x, y, {label, sub}]}, paths: {'from>to': d}, labels: {'from>to': [x, y, anchor]}
  constructor({ host, read, seg, nodes, edges, filters, layouts, below = 620, reduced = false }) {
    Object.assign(this, { host, read, seg, nodes, edges, filters, layouts, below, reduced });
    this.filter = filters[0].id;
    this.selected = null;
    this.hover = null;
    this.buttons = filters.map((f) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.innerHTML = `${f.color ? `<i class="dot" style="background:${f.color}"></i>` : ''}${f.label}`;
      b.addEventListener('click', () => { this.filter = f.id; this.selected = null; this.apply(); });
      seg.appendChild(b);
      return b;
    });
    this.build();
    new ResizeObserver(() => { if (this.isNarrow() !== this.narrow) this.build(); }).observe(host);
    let visible = true;
    new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(host);
    const t0 = performance.now();
    const loop = (now) => {
      if (visible && this.dots.length) {
        const u = ((now - t0) / 2400) % 1;
        for (const d of this.dots) {
          let s = (u + d.phase) % 1;
          if (d.rev) s = 1 - s;
          const p = d.path.getPointAtLength(s * d.len);
          d.dot.setAttribute('cx', p.x);
          d.dot.setAttribute('cy', p.y);
        }
      }
      requestAnimationFrame(loop);
    };
    if (!reduced) requestAnimationFrame(loop);
  }
  isNarrow() { return (this.host.clientWidth || innerWidth) < this.below; }
  build() {
    this.narrow = this.isNarrow();
    const L = this.narrow ? this.layouts.narrow : this.layouts.wide;
    const [fl, fs] = L.fs;
    const svg = el('svg', { class: 'graph nm' + (this.narrow ? ' narrow' : ''), viewBox: `0 0 ${L.W} ${L.H}`, role: 'group', 'aria-label': 'Talos network map' });
    svg.style.setProperty('--nm-l', fl + 'px');
    svg.style.setProperty('--nm-s', fs + 'px');
    if (this.svg) this.svg.replaceWith(svg); else this.host.appendChild(svg);
    this.svg = svg;
    const gB = el('g', {}, svg);
    for (const b of L.bands) {
      el('path', { class: 'band', d: `M${b.points.map((q) => q.join(',')).join('L')}Z` }, gB);
      const t = el('text', { class: 'band-label nm-band', x: b.points[0][0] + 6, y: b.points[0][1] + fs + 4 }, gB);
      t.textContent = b.label;
    }
    const gE = el('g', {}, svg);
    this.gDots = el('g', {}, svg);
    const gN = el('g', {}, svg);
    const gL = el('g', {}, svg);
    this.N = new Map();
    for (const n0 of this.nodes) {
      const p = L.pos[n0.id];
      const n = { ...n0, ...(p[2] || {}), x: p[0], y: p[1] };
      const w = Math.max(textW(n.label, n.bold ? 650 : 500, fl), n.sub ? textW(n.sub, 400, fs) : 0) + 22;
      const h = n.sub ? fl + fs + 20 : fl + 18;
      const g = el('g', { class: 'node nm-node', tabindex: 0, role: 'button', 'aria-pressed': 'false', 'aria-label': `${n.label}${n.sub ? ', ' + n.sub : ''}`, transform: `translate(${n.x},${n.y})` }, gN);
      el('rect', { x: -w / 2, y: -h / 2, width: w, height: h, rx: 7 }, g);
      const t = el('text', { y: n.sub ? -fs / 2 - 1 : 0, class: 'nm-l' + (n.bold ? ' b' : '') }, g);
      t.textContent = n.label;
      if (n.sub) { const s = el('text', { y: fl / 2 + 2, class: 'sub nm-s' }, g); s.textContent = n.sub; }
      if (n.ts) {
        const bg = el('g', { class: 'nm-ts', transform: `translate(${w / 2 - 4},${-h / 2})` }, g);
        el('rect', { x: -14, y: -9, width: 28, height: 18, rx: 9 }, bg);
        const tt = el('text', { y: 0.5 }, bg); tt.textContent = 'TS';
      }
      g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { this.hover = n.id; this.show(); } });
      g.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { this.hover = null; this.show(); } });
      g.addEventListener('click', () => { this.selected = this.selected === n.id ? null : n.id; this.show(); this.reveal(); });
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.selected = this.selected === n.id ? null : n.id; this.show(); } });
      this.N.set(n.id, { ...n, g, w, h });
    }
    svg.addEventListener('click', (e) => { if (!e.target.closest('.node') && this.selected) { this.selected = null; this.show(); } });
    this.E = this.edges.map((e) => {
      const key = `${e.from}>${e.to}`;
      const a = this.N.get(e.from), b = this.N.get(e.to);
      let d = L.paths?.[key];
      if (!d) {
        const p0 = this.anchor(a, b), p1 = this.anchor(b, a);
        d = `M${p0.x},${p0.y} L${p1.x},${p1.y}`;
      }
      const path = el('path', { class: `edge nm-edge ${e.style || 'cable'}${e.only ? ' only' : ''}`, d }, gE);
      if (e.width) path.style.strokeWidth = e.width;
      let label = null;
      const lp = L.labels?.[key];
      if (lp) {
        label = el('text', { class: `elabel nm-elabel${e.only ? ' only' : ''}`, x: lp[0], y: lp[1] }, gL);
        if (lp[2]) label.style.textAnchor = lp[2];
        label.textContent = lp[3] || e.label;
      }
      return { ...e, path, label };
    });
    this.apply();
  }
  anchor(n, toward) {
    const dx = toward.x - n.x, dy = toward.y - n.y;
    const s = Math.min((n.w / 2 + 2) / Math.abs(dx || 1e-9), (n.h / 2 + 2) / Math.abs(dy || 1e-9));
    return { x: n.x + dx * s, y: n.y + dy * s };
  }
  apply() {
    const f = this.filters.find((x) => x.id === this.filter);
    this.buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(this.filters[i].id === this.filter)));
    this.svg.style.setProperty('--flow', f.color || 'var(--accent)');
    this.gDots.replaceChildren();
    this.dots = [];
    const all = f.id === 'all';
    const lit = new Set();
    for (const e of this.E) {
      const dir = all ? undefined : e.flows[f.id];
      const on = dir !== undefined;
      e.path.classList.toggle('flow-on', on);
      e.path.classList.toggle('flow-off', !all && !on);
      e.path.classList.toggle('shown', on);
      const planned = on && !!e.plan?.includes(f.id); // drawn dashed, no moving dots: set up on paper, not checked
      e.path.classList.toggle('planned', planned);
      if (e.label) e.label.classList.toggle('flow-off', !all && !on);
      if (e.label && e.only) e.label.classList.toggle('shown', on);
      if (on) { lit.add(e.from); lit.add(e.to); }
      if (!on || planned || this.reduced || e.style === 'tunnel') continue;
      const len = e.path.getTotalLength();
      const make = (rev, phase) => this.dots.push({ path: e.path, rev, phase, len, dot: el('circle', { class: 'pulse flow-dot', r: this.narrow ? 4 : 3.6 }, this.gDots) });
      if (dir >= 0) make(false, 0);
      if (dir <= 0) make(true, dir === 0 ? 0.5 : 0);
    }
    this.N.forEach((n, id) => n.g.classList.toggle('dim', !all && !lit.has(id)));
    this.show();
  }
  // After a tap low in the drawing, bring the readout back on screen if it scrolled away above (the drawing is
  // short enough that the tapped machine stays in view too).
  reveal() {
    if (!this.selected) return;
    const r = this.read.getBoundingClientRect();
    if (r.top < 56) this.read.scrollIntoView({ block: 'start', behavior: this.reduced ? 'auto' : 'smooth' });
  }
  show() {
    const id = this.hover || this.selected;
    this.N.forEach((n, k) => {
      n.g.classList.toggle('hot', k === id);
      n.g.setAttribute('aria-pressed', String(k === this.selected));
    });
    const f = this.filters.find((x) => x.id === this.filter);
    this.read.classList.toggle('node-on', !!id);
    this.read.innerHTML = id ? this.N.get(id).html : f.text;
  }
}
