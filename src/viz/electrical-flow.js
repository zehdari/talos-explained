// Small left-to-right (wide) or top-to-bottom (narrow) flow diagrams for the Power and wiring chapter.
// Boxes are placed by hand per layout; links are orthogonal polylines with rounded corners, so nothing crosses.
//
// spec = {
//   nodes: { id: { label, sub, ghost?, input? } },            ghost: text-only pointer to another view
//   links: [{ from, to, color, width, dash, label }],
//   wide:   { w, h, at: { id: [x, y, w?] }, route: { 'a>b': 'h'|'v'|'hv'|'vh'|[[x,y]...] }, labels: { 'a>b': [x, y, anchor] } },
//   narrow: { ...same },   either layout may also override node text: nodes: { id: { label, sub } }
// }
import { el } from './chart.js';

const measure = document.createElement('canvas').getContext('2d');
const textW = (t, size, weight = 400) => {
  measure.font = `${weight} ${size}px 'Archivo Variable', Archivo, system-ui, sans-serif`;
  return measure.measureText(t || '').width;
};

// Rounded polyline through points.
function roundPath(pts, r = 9) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) { d += ` L${x1},${y1}`; continue; }
    const ax = x1 - ((x1 - x0) / l1) * rr, ay = y1 - ((y1 - y0) / l1) * rr;
    const bx = x1 + ((x2 - x1) / l2) * rr, by = y1 + ((y2 - y1) / l2) * rr;
    d += ` L${ax},${ay} Q${x1},${y1} ${bx},${by}`;
  }
  const [xe, ye] = pts.at(-1);
  return d + ` L${xe},${ye}`;
}

export function drawFlow(host, spec, { narrow = false, selected = null, onPick, label } = {}) {
  const L = narrow ? spec.narrow : spec.wide;
  const fs = narrow ? 13.5 : 14, fsSub = narrow ? 12 : 12.5; // wide layouts stay legible down to ~88% scale
  host.innerHTML = '';
  const svg = el('svg', { class: `el-flow${narrow ? ' narrow' : ''}`, viewBox: `0 0 ${L.w} ${L.h}`, role: 'group' }, host);
  if (label) svg.setAttribute('aria-label', label);
  const defs = el('defs', {}, svg);
  const gLinks = el('g', {}, svg), gNodes = el('g', {}, svg), gLabels = el('g', {}, svg);

  // boxes, sized to their text
  const box = {};
  for (const [id, n0] of Object.entries(spec.nodes)) {
    const at = L.at[id];
    const n = L.nodes?.[id] ? { ...n0, ...L.nodes[id] } : n0;
    if (!at) continue;
    const tw = Math.max(textW(n.label, fs, 600), textW(n.sub, fsSub));
    const w = n.ghost ? tw + 8 : Math.max(at[2] || 0, tw + 22);
    const h = n.ghost ? 24 : n.sub ? 46 : 34;
    box[id] = { x: at[0], y: at[1], w, h, n };
  }
  const side = (b, dir) => ({ r: [b.x + b.w / 2, b.y], l: [b.x - b.w / 2, b.y], b: [b.x, b.y + b.h / 2], t: [b.x, b.y - b.h / 2] })[dir];

  const markers = new Map();
  const marker = (color) => {
    if (markers.has(color)) return markers.get(color);
    const id = 'elf' + Math.random().toString(36).slice(2, 8);
    const m = el('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto-start-reverse', markerUnits: 'strokeWidth' }, defs);
    el('path', { d: 'M0,1 L9,5 L0,9 z', fill: color }, m);
    markers.set(color, id);
    return id;
  };

  const linkEls = [];
  for (const k of spec.links) {
    const a = box[k.from], b = box[k.to];
    if (!a || !b) continue;
    const key = `${k.from}>${k.to}`;
    if (L.route && L.route[key] === null) continue; // not drawn in this layout
    const how = L.route?.[key] || (narrow ? 'v' : 'h');
    let pts;
    if (Array.isArray(how)) pts = how;
    else if (how === 'h') {
      const fwd = b.x >= a.x;
      const p0 = side(a, fwd ? 'r' : 'l'), p1 = side(b, fwd ? 'l' : 'r');
      const mx = L.mid?.[key] ?? (p0[0] + p1[0]) / 2;
      pts = [p0, [mx, p0[1]], [mx, p1[1]], p1];
    } else if (how === 'v') {
      const down = b.y >= a.y;
      const p0 = side(a, down ? 'b' : 't'), p1 = side(b, down ? 't' : 'b');
      const my = L.mid?.[key] ?? (p0[1] + p1[1]) / 2;
      pts = [p0, [p0[0], my], [p1[0], my], p1];
    } else if (how === 'vh') {
      const p0 = side(a, b.y >= a.y ? 'b' : 't'), p1 = side(b, b.x >= a.x ? 'l' : 'r');
      pts = [p0, [p0[0], p1[1]], p1];
    } else { // 'hv'
      const p0 = side(a, b.x >= a.x ? 'r' : 'l'), p1 = side(b, b.y >= a.y ? 't' : 'b');
      pts = [p0, [p1[0], p0[1]], p1];
    }
    // stop short of the box so the arrowhead sits on its edge
    const [xa, ya] = pts.at(-2), [xb, yb] = pts.at(-1), len = Math.hypot(xb - xa, yb - ya) || 1;
    pts[pts.length - 1] = [xb - ((xb - xa) / len) * 2, yb - ((yb - ya) / len) * 2];
    const path = el('path', { class: 'el-link', d: roundPath(pts), stroke: k.color, 'stroke-width': k.width || 2.4, fill: 'none' }, gLinks);
    if (k.dash) path.setAttribute('stroke-dasharray', k.dash === true ? '5 4' : k.dash);
    if (!k.noArrow) path.setAttribute('marker-end', `url(#${marker(k.color)})`);
    const lab = L.labels?.[key];
    let t = null;
    if (k.label && lab !== null && lab !== undefined) {
      t = el('text', { class: 'el-flab', x: lab[0], y: lab[1], 'text-anchor': lab[2] || 'middle' }, gLabels);
      t.textContent = k.label;
    }
    linkEls.push({ k, path, t });
  }

  for (const [id, b] of Object.entries(box)) {
    const n = b.n;
    const g = el('g', { class: `el-node${n.ghost ? ' ghost' : ''}${n.input ? ' input' : ''}${n.static ? ' static' : ''}`, transform: `translate(${b.x},${b.y})` }, gNodes);
    if (!n.static) {
      g.setAttribute('tabindex', 0);
      g.setAttribute('role', 'button');
      g.setAttribute('aria-label', [n.label, n.sub].filter(Boolean).join(', '));
      g.setAttribute('aria-pressed', String(id === selected));
    }
    if (id === selected) g.classList.add('on');
    if (n.ghost) {
      el('rect', { x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, fill: 'transparent' }, g);
      const t = el('text', { class: 'gl', y: 0 }, g);
      t.textContent = n.label;
    } else {
      el('rect', { x: -b.w / 2, y: -b.h / 2, width: b.w, height: b.h, rx: 7 }, g);
      const t = el('text', { y: n.sub ? -8 : 0, style: `font-size:${fs}px` }, g);
      t.textContent = n.label;
      if (n.sub) {
        const s = el('text', { class: 'sub', y: 10, style: `font-size:${fsSub}px` }, g);
        s.textContent = n.sub;
      }
    }
    if (!n.static && onPick) {
      const pick = () => onPick(id, g);
      g.addEventListener('click', pick);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    }
  }
  // links touching the selected box stand out
  if (selected) for (const { k, path, t } of linkEls) {
    const on = k.from === selected || k.to === selected;
    path.classList.toggle('dim', !on);
    if (t) t.classList.toggle('dim', !on);
  }
  return svg;
}
