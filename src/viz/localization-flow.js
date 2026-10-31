// The localization chapter's "sensors -> estimators -> users" diagram: the shared Graph (src/viz/graph.js) with two
// additions, kept here so the shared file stays as it is:
//   - edges with `points`: an explicit polyline route [[x, y], ...] (orthogonal buses that never cross), with the
//     label at `lx`, `ly`;
//   - band labels with `anchor` (text-anchor), so a label can sit clear of the edges running through its band;
//   - a selection dims every other edge even when the edge has its own opacity.
import { Graph } from './graph.js';
import { el } from './chart.js';

export class FlowGraph extends Graph {
  build(narrow) {
    super.build(narrow);
    const bands = (narrow && this.cfg.narrow?.bands) || this.cfg.bands;
    this.svg.querySelectorAll('.band-label').forEach((t, i) => { if (bands[i]?.anchor) t.style.textAnchor = bands[i].anchor; });
    this.svg.classList.add('loc-flow');
  }
  addEdge(e) {
    if (!e.points) return super.addEdge(e);
    const d = e.points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join('');
    const path = el('path', { class: 'edge', d, 'stroke-linejoin': 'round' }, this.gEdges);
    if (this.arrows && e.arrow !== false) path.setAttribute('marker-end', `url(#arrow${this.uid()})`);
    if (e.dash) path.setAttribute('stroke-dasharray', '4 4');
    if (e.color) path.style.stroke = e.color;
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
  highlight(id) {
    super.highlight(id);
    // An edge's own opacity would win over the .dim class: drop it while something is selected.
    this.edges.forEach((e) => { if (e.opacity !== undefined) e.path.style.opacity = id ? '' : e.opacity; });
  }
}
