import { setup } from '../layout.js';
import { LineChart, el } from '../viz/chart.js';
import { Simulation } from '../engine/sim.js';
import { solveBoxQp } from '../engine/qp.js';
import { loadDemo, loadTrace, series } from './demo.js';

setup();

// ---------- manifold picture ----------
{
  const host = document.getElementById('manifold-fig');
  let th = 2.2, svg = null, builtW = 0;
  const delta = 0.75;
  const build = () => {
    // Drawn at the panel's own width up to 560 units, the circle centred, so labels keep their size on a phone.
    const W = Math.round(Math.max(300, Math.min(560, host.clientWidth || 560))), H = W < 420 ? 300 : 330;
    builtW = host.clientWidth;
    // Centred; on a phone shifted right, so the labels of the starting point (upper left) have room.
    const R = Math.min(125, W / 2 - 70), cx = W < 420 ? W - R - 16 : W / 2, cy = H / 2;
    if (svg) svg.remove();
    svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, style: 'touch-action:pan-y' }, host);
    el('circle', { cx, cy, r: R, fill: 'none', stroke: 'var(--ink-2)', 'stroke-width': 1.5 }, svg);
    el('text', { class: 'label', x: cx, y: cy + 4, 'text-anchor': 'middle' }, svg).textContent = 'unit attitudes';
    const g = el('g', {}, svg);
    // A label just outside the circle along the outward direction (ux, uy), kept inside the drawing.
    const label = (at, ux, uy, text, off = 14) => {
      const t = el('text', { class: 'label halo', y: at[1] + off * uy + 4 }, g);
      t.textContent = text;
      const len = t.getComputedTextLength?.() || text.length * 6.5;
      let x = at[0] + off * ux;
      const end = ux < 0;
      // No room beside the point: lift the label above (or below) it instead of pushing it over the point.
      if (end ? x - len < 6 : x + len > W - 6) {
        t.setAttribute('y', at[1] + (uy < 0 ? -12 : 20));
        x = end ? Math.max(6 + len, at[0] + 4) : Math.min(W - 6 - len, at[0] - 4);
      }
      x = end ? Math.max(6 + len, Math.min(W - 6, x)) : Math.max(6, Math.min(W - 6 - len, x));
      t.setAttribute('x', x);
      t.setAttribute('text-anchor', end ? 'end' : 'start');
    };
    const draw = () => {
      g.innerHTML = '';
      const p = [cx + R * Math.cos(th), cy - R * Math.sin(th)];
      const t = [-Math.sin(th), -Math.cos(th)]; // tangent (screen coords, counterclockwise)
      const add = [p[0] + R * delta * t[0], p[1] + R * delta * t[1]];
      const bp = [cx + R * Math.cos(th + delta), cy - R * Math.sin(th + delta)];
      el('line', { x1: p[0], y1: p[1], x2: add[0], y2: add[1], stroke: 'var(--muted)', 'stroke-width': 2, 'stroke-dasharray': '5 4' }, g);
      el('circle', { cx: add[0], cy: add[1], r: 5, fill: 'var(--muted)' }, g);
      el('path', { d: `M${p[0]},${p[1]} A${R},${R} 0 0 0 ${bp[0]},${bp[1]}`, fill: 'none', stroke: 'var(--prediction)', 'stroke-width': 3.5, 'stroke-linecap': 'round' }, g);
      el('circle', { cx: bp[0], cy: bp[1], r: 6, fill: 'var(--prediction)', stroke: 'var(--paper-2)', 'stroke-width': 2 }, g);
      const dot = el('circle', { cx: p[0], cy: p[1], r: 9, fill: 'var(--accent)', stroke: 'var(--paper-2)', 'stroke-width': 2, style: 'cursor:grab;touch-action:none' }, g);
      const da = Math.hypot(add[0] - cx, add[1] - cy);
      label(add, (add[0] - cx) / da, (add[1] - cy) / da, 'x + δ: off the surface', 18);
      label(bp, Math.cos(th + delta), -Math.sin(th + delta), 'x ⊞ δ: along it');
      label(p, Math.cos(th), -Math.sin(th), 'x', 16);
      dot.addEventListener('pointerdown', (e) => {
        dot.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const r = svg.getBoundingClientRect();
          const x = ((ev.clientX - r.left) / r.width) * W - cx, y = cy - ((ev.clientY - r.top) / r.height) * H;
          th = Math.atan2(y, x);
          draw();
        };
        dot.addEventListener('pointermove', move);
        dot.addEventListener('pointerup', () => dot.removeEventListener('pointermove', move), { once: true });
      });
    };
    draw();
  };
  build();
  new ResizeObserver(() => { if (host.clientWidth && Math.abs(host.clientWidth - builtW) > 4) build(); }).observe(host);
}

// ---------- the condensed Hessian ----------
{
  const grid = document.getElementById('h-grid');
  const left = document.createElement('div'), right = document.createElement('div');
  grid.append(left, right);
  const info = document.getElementById('h-info');
  const names = ['VUS', 'VUP', 'HUS', 'HUP', 'HLS', 'HLP', 'VLS', 'VLP'];
    // Continuous blue ramp on a square-root scale; the smallest coupling is still visibly blue, never background.
  const seqColor = (u) => {
    const t = Math.sqrt(Math.max(0, Math.min(1, u)));
    const lo = [205, 226, 251], hi = [13, 54, 107];
    return `rgb(${lo.map((l, i) => Math.round(l + (hi[i] - l) * t)).join(',')})`;
  };
  // diverging: blue (negative) - neutral - orange (positive)
  const div = (u) => {
    const t = Math.min(1, Math.abs(u));
    const end = u < 0 ? [42, 120, 214] : [235, 104, 52], mid = [231, 239, 240];
    const c = mid.map((m, i) => Math.round(m + (end[i] - m) * t));
    return `rgb(${c.join(',')})`;
  };
  let sim = null, k = 0;
  const drawStages = (H, n) => {
    const N = n / 8, S = 440, pad = 52, cs = (S - pad) / N;
    const B = Array.from({ length: N }, (_, j) => Array.from({ length: N }, (_, kk) => {
      let v = 0;
      for (let a = 0; a < 8; a++) for (let c = 0; c < 8; c++) v += H[(8 * j + a) * n + 8 * kk + c] ** 2;
      return Math.sqrt(v);
    }));
    const mx = Math.max(...B.flat());
    let cells = '';
    B.forEach((row, j) => row.forEach((v, kk) => {
      cells += `<rect x="${pad + kk * cs}" y="${pad + j * cs}" width="${cs + 0.3}" height="${cs + 0.3}" fill="${seqColor(v / mx)}" data-j="${j}" data-k="${kk}" data-v="${(v / mx).toFixed(2)}"/>`;
    }));
    let ticks = '';
    for (let t = 0; t < N; t += 5) {
      ticks += `<text class="label" x="${pad + (t + 0.5) * cs}" y="${pad - 8}" text-anchor="middle">${t}</text><text class="label" x="${pad - 8}" y="${pad + (t + 0.5) * cs + 4}" text-anchor="end">${t}</text>`;
    }
    left.innerHTML = `<div style="font-family:var(--sans);font-size:.86rem;color:var(--ink-2);margin-bottom:.3rem">Coupling between stages (each cell: one 8 × 8 block of H)</div><svg class="chart" viewBox="0 0 ${S} ${S}" style="touch-action:pan-y;cursor:crosshair">${cells}${ticks}<text class="label" x="${pad}" y="14">stage of one command →</text><text class="label" transform="translate(14 ${pad}) rotate(90)">stage of the other →</text><rect class="pick" width="${cs}" height="${cs}" fill="none" stroke="var(--accent)" stroke-width="2" visibility="hidden"/></svg><div class="cell-readout" style="font-family:var(--sans);font-size:.84rem;color:var(--ink-2);margin-top:.3rem;min-height:1.3em">Tap or hover a cell.</div>`;
    // Tap, drag or hover a cell to read it (an SVG <title> never shows on a touch screen).
    const svg = left.querySelector('svg'), pick = svg.querySelector('.pick'), out = left.querySelector('.cell-readout');
    const read = (e) => {
      const c = document.elementFromPoint(e.clientX, e.clientY); // not e.target: a touch stays captured by its first cell
      if (!c?.dataset || c.dataset.j === undefined) return;
      pick.setAttribute('x', c.getAttribute('x'));
      pick.setAttribute('y', c.getAttribute('y'));
      pick.setAttribute('visibility', 'visible');
      out.innerHTML = `Stages <b>${c.dataset.j}</b> and <b>${c.dataset.k}</b>: <b>${c.dataset.v}</b> of the largest block`;
    };
    svg.addEventListener('pointerdown', read);
    svg.addEventListener('pointermove', read);
  };
  const drawBlock = (H, n) => {
    const S = 420, pad = 44, cs = (S - pad) / 8;
    const blk = names.map((_, a) => names.map((_, b) => H[a * n + b]));
    const mx = Math.max(...blk.flat().map(Math.abs));
    let cells = '';
    blk.forEach((row, a) => row.forEach((v, b) => {
      const u = v / mx;
      cells += `<rect x="${pad + b * cs}" y="${pad + a * cs}" width="${cs - 2}" height="${cs - 2}" rx="2" fill="${div(u)}"/><text x="${pad + b * cs + cs / 2 - 1}" y="${pad + a * cs + cs / 2 + 3}" text-anchor="middle" style="font-size:11.5px;fill:${Math.abs(u) > 0.6 ? '#fff' : 'var(--ink)'}">${u.toFixed(2)}</text>`;
    }));
    const labels = names.map((nm, i) => `<text class="label" x="${pad + i * cs + cs / 2}" y="${pad - 8}" text-anchor="middle">${nm}</text><text class="label" x="${pad - 6}" y="${pad + i * cs + cs / 2 + 4}" text-anchor="end">${nm}</text>`).join('');
    right.innerHTML = `<div style="font-family:var(--sans);font-size:.86rem;color:var(--ink-2);margin-bottom:.3rem">Stage 0's block: how the eight first commands interact</div><svg class="chart" viewBox="0 0 ${S} ${S}">${cells}${labels}</svg><div class="legend" style="margin-top:.3rem"><span><i style="background:rgb(235,104,52);height:8px"></i>same effect (positive)</span><span><i style="background:rgb(42,120,214);height:8px"></i>opposite effects (negative)</span></div>`;
  };
  const run = () => {
    if (!sim) sim = new Simulation({ settings: { model_step: 0.01 } });
    const goals = [[1.2, 0.6, -1.3], [0.2, -0.5, -0.8], [1.5, -0.3, -1.1]];
    const ref = sim.holdHere();
    ref.position = goals[k++ % goals.length];
    for (let i = 0; i < 14; i++) sim.tick(ref);
    sim.controller.debug = true;
    const out = sim.tick(ref);
    sim.controller.debug = false;
    const n = Math.round(Math.sqrt(out.H.length));
    drawStages(out.H, n);
    drawBlock(out.H, n);
    info.textContent = `${n} × ${n}, solved in ${out.solve_ms.toFixed(0)} ms with ${out.qp_iterations} QP iteration${out.qp_iterations === 1 ? '' : 's'} (browser).`;
  };
  document.getElementById('h-run').addEventListener('click', run);
  new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { obs.disconnect(); setTimeout(run, 50); } }).observe(grid);
}

// ---------- projected Newton in 2-D ----------
{
  const host = document.getElementById('qp-fig');
  // The plot is a square SVG; the readout is HTML beside it (under it on a phone), so its text never scales down.
  const W = 440, H = 440, S = 6.5, ox = 220, oy = 220; // 1 N = S px
  const wrap = document.createElement('div');
  wrap.className = 'qp-wrap';
  host.appendChild(wrap);
  const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, style: 'touch-action:pan-y;overflow:hidden' }, wrap);
  const side = document.createElement('div');
  side.className = 'qp-read';
  wrap.appendChild(side);
  const toS = (p) => [ox + p[0] * S, oy - p[1] * S];
  const toW = (x, y) => [(x - ox) / S, (oy - y) / S];
  const lim = (W / 2 - 10) / S; // keep the handles inside the drawing
  let c = [31, 12], x0 = [-10, -16];
  const gC = el('g', {}, svg), gB = el('g', {}, svg), gP = el('g', {}, svg), gH = el('g', {}, svg);
  const [bx, by] = toS([-24, 24]);
  el('rect', { x: bx, y: by, width: 48 * S, height: 48 * S, fill: 'rgba(15,38,51,0.04)', stroke: 'var(--ink)', 'stroke-width': 1.5 }, gB);
  const draw = () => {
    const rot = (+document.getElementById('qp-rot').value * Math.PI) / 180, cond = +document.getElementById('qp-cond').value;
    document.getElementById('qp-rot-o').textContent = `${(+document.getElementById('qp-rot').value).toFixed(0)}°`;
    document.getElementById('qp-cond-o').textContent = `${cond.toFixed(1)}`;
    const cr = Math.cos(rot), sr = Math.sin(rot), l1 = 1, l2 = cond;
    const Hm = [cr * cr * l1 + sr * sr * l2, cr * sr * (l1 - l2), cr * sr * (l1 - l2), sr * sr * l1 + cr * cr * l2];
    const Hf = Float64Array.from(Hm);
    const g = Float64Array.from([-(Hm[0] * c[0] + Hm[1] * c[1]), -(Hm[2] * c[0] + Hm[3] * c[1])]);
    const x = Float64Array.from(x0);
    const trace = [];
    const res = solveBoxQp(Hf, g, Float64Array.from([-24, -24]), Float64Array.from([24, 24]), x, 2, 50, 1e-8, trace);
    gC.innerHTML = '';
    const [ccx, ccy] = toS(c);
    for (const lev of [4, 16, 36, 64, 100, 160, 240, 340]) {
      el('ellipse', { cx: ccx, cy: ccy, rx: Math.sqrt((2 * lev) / l1) * S, ry: Math.sqrt((2 * lev) / l2) * S, transform: `rotate(${(-rot * 180) / Math.PI} ${ccx} ${ccy})`, fill: 'none', stroke: 'var(--rule)', 'stroke-width': 1.2 }, gC);
    }
    gP.innerHTML = '';
    const pts = trace.map(toS);
    el('path', { d: pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(''), fill: 'none', stroke: 'var(--accent)', 'stroke-width': 2 }, gP);
    pts.forEach((p, i) => { if (i) el('circle', { cx: p[0], cy: p[1], r: 4.5, fill: 'var(--accent)', stroke: 'var(--paper-2)', 'stroke-width': 2 }, gP); });
    gH.innerHTML = '';
    const cross = el('g', { style: 'cursor:grab' }, gH);
    cross.style.touchAction = 'none'; // the handles take every drag; the rest of the plot still scrolls the page
    el('circle', { cx: ccx, cy: ccy, r: 16, fill: 'transparent' }, cross);
    el('path', { d: `M${ccx - 8},${ccy - 8}L${ccx + 8},${ccy + 8}M${ccx + 8},${ccy - 8}L${ccx - 8},${ccy + 8}`, stroke: 'var(--ink)', 'stroke-width': 2.5 }, cross);
    const [sx0, sy0] = toS(x0);
    const start = el('circle', { cx: sx0, cy: sy0, r: 8, fill: 'var(--paper)', stroke: 'var(--ink)', 'stroke-width': 2, style: 'cursor:grab;touch-action:none' }, gH);
    const drag = (node, set) => node.addEventListener('pointerdown', (e) => {
      node.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const r = svg.getBoundingClientRect();
        set(toW(((ev.clientX - r.left) / r.width) * W, ((ev.clientY - r.top) / r.height) * H));
        draw();
      };
      node.addEventListener('pointermove', move);
      node.addEventListener('pointerup', () => node.removeEventListener('pointermove', move), { once: true });
    });
    drag(cross, (p) => (c = p.map((v) => Math.max(-lim, Math.min(lim, v)))));
    drag(start, (p) => (x0 = p.map((v) => Math.max(-24, Math.min(24, v)))));
    const active = [0, 1].filter((i) => Math.abs(Math.abs(x[i]) - 24) < 1e-6).map((i) => `u${'₁₂'[i]}`).join(', ') || 'none';
    side.innerHTML = `<p><b>Iterations:</b> ${res.iterations}${res.converged ? ', converged' : ''}<br><b>Solution:</b> (${x[0].toFixed(2)}, ${x[1].toFixed(2)})<br><b>Active bounds:</b> ${active}</p>`
      + '<p class="key">Box: −24 ≤ uᵢ ≤ 24<br>× unconstrained minimum<br>○ warm start<br><span style="color:var(--accent)">●</span> iterates</p>';
  };
  ['qp-rot', 'qp-cond'].forEach((id) => document.getElementById(id).addEventListener('input', draw));
  draw();
}

// ---------- RTI stats ----------
{
  const host = document.getElementById('rti-charts');
  const a = document.createElement('div'), b = document.createElement('div');
  host.append(a, b);
  const ca = new LineChart(a, { height: 220, xLabel: 'time (s)', yLabel: 'C++ solve time (ms)', unit: 'ms', digits: 1, legend: false });
  const cb = new LineChart(b, { height: 220, xLabel: 'time (s)', yLabel: 'QP iterations (browser)', unit: '', digits: 0, legend: false });
  loadTrace('path').then((d) => {
    ca.set([{ name: 'solve time', color: 'var(--state)', width: 1.5, values: d.t.map((t, i) => ({ x: t, y: d.solve_ms[i] })) },
      { name: '50 ms period', color: 'var(--ink-2)', dash: true, width: 1.2, noTip: true, values: [{ x: d.t[0], y: 50 }, { x: d.t.at(-1), y: 50 }] }], { yDomain: [0, 55] });
  });
  loadDemo('gov_on').then((d) => cb.set([{ name: 'QP iterations', color: 'var(--prediction)', width: 1.5, values: series(d, (r) => r.qp) }], { yDomain: [0, 6] }));
}
