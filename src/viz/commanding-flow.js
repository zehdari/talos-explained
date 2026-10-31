// The shared node/edge Graph plus "routes": a set of edges lit at once, with dots running along them,
// for stories told across several links (a goal reaching the thrusters, a kill reaching every board).
import { Graph } from './graph.js';
import { el } from './chart.js';

export class FlowGraph extends Graph {
  constructor(container, opts) {
    super(container, opts);
    this.dots = this.dots || [];
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let visible = true;
    new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(container);
    const t0 = performance.now();
    const loop = (now) => {
      if (visible && !reduced && this.dots.length) {
        const u = (((now - t0) / 1000) % 1.8) / 1.8;
        for (const d of this.dots) {
          const p = d.path.getPointAtLength(u * d.len);
          d.dot.setAttribute('cx', p.x);
          d.dot.setAttribute('cy', p.y);
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // Rebuilding for the other (phone / desktop) layout keeps the current route.
  build(narrow) {
    super.build(narrow);
    this.dots = [];
    if (this.routeKeys) this.applyRoute();
  }

  // Clearing a node highlight goes back to the route, not to an unlit graph.
  highlight(id) {
    super.highlight(id);
    if (!id && this.routeKeys) this.applyRoute();
    else this.clearDots();
  }

  // keys: ['from>to', ...] or null for none.
  route(keys) {
    this.routeKeys = keys && keys.length ? new Set(keys) : null;
    this.selected = null;
    if (this.routeKeys) this.applyRoute();
    else super.highlight(null);
  }

  clearDots() {
    for (const d of this.dots || []) d.dot.remove();
    this.dots = [];
  }

  applyRoute() {
    const keys = this.routeKeys;
    const nodes = new Set();
    this.clearDots();
    for (const e of this.edges) {
      const on = keys.has(`${e.from}>${e.to}`);
      if (on) { nodes.add(e.from); nodes.add(e.to); }
      e.path.classList.toggle('hot', on);
      e.path.classList.toggle('dim', !on);
      if (this.arrows && e.arrow !== false) e.path.setAttribute('marker-end', `url(#arrow${on ? '-hot' : ''}${this.uid()})`);
      if (e.label) e.label.style.opacity = on ? 1 : 0.25;
      if (on) {
        const dot = el('circle', { class: 'pulse', r: 3.4 }, this.gPulses);
        const len = e.path.getTotalLength();
        const p = e.path.getPointAtLength(0);
        dot.setAttribute('cx', p.x);
        dot.setAttribute('cy', p.y);
        this.dots.push({ dot, path: e.path, len });
      }
    }
    this.nodes.forEach((n, k) => {
      n.g.classList.toggle('dim', !nodes.has(k));
      n.g.classList.remove('hot');
    });
  }
}
