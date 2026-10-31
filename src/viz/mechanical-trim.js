// "Adding a part, from the side": a trim calculator on the CAD side view of Talos. Drag a part (the orange dot) to
// where it goes, set its weight in water, and see the net buoyancy, the thrust needed to hold level, and how Talos
// would hang with the thrusters off. Used by mechanical.html#trim.
//
// Use: import { mountTrim } from '../viz/mechanical-trim.js';
//      fetch(`${BASE}data/mechanical/mechanical.json`).then((r) => r.json()).then((data) => mountTrim(host, data));
// host is an empty element inside a <figure class="fig">; the figure's caption is the page's own. Suggested caption:
// "<b>Adding a part, from the side.</b> Drag the orange dot to where the part goes and set its weight in water: its
// weight minus the water it displaces (100 g of aluminium weighs 63 g in water; foam is negative). COM (blue) and
// COB (green) are the MPC model's. <em>Thrusters off</em> tilts Talos to where the model says it would hang."
import { el } from './chart.js';
import '../css/mechanical-trim.css';

const BASE = import.meta.env.BASE_URL;
const fmt = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d).replace('-', '−');
const W = 1600, H = 1618; // the side render's pixel size, used as the SVG viewBox

export function mountTrim(host, data) {
  host.classList.add('panel', 'mx-trim');
  host.innerHTML = `
    <div class="controls mx-trim-controls">
      <label>Added part (in water) <input type="range" min="-400" max="400" step="10" value="150"><output></output></label>
      <div class="seg" role="group" aria-label="Thrusters"><button data-v="on" aria-pressed="true">Thrusters holding level</button><button data-v="off" aria-pressed="false">Thrusters off</button></div>
    </div>
    <div class="mx-trim-body">
      <div class="mx-trim-pic">
        <div class="mx-trim-rot">
          <img src="${BASE}media/cad/talos-side-port.webp" srcset="${BASE}img/mechanical/800/talos-side-port.webp 800w, ${BASE}media/cad/talos-side-port.webp 1600w" sizes="(max-width: 640px) 100vw, 580px" width="${W}" height="${H}" alt="Talos from the port side (CAD), bow to the left." loading="lazy">
          <svg class="mx-trim-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true"></svg>
        </div>
        <svg class="mx-trim-top" viewBox="0 0 ${W} ${H}" aria-label="Drag the orange dot to place the part"></svg>
      </div>
      <div class="mx-trim-out" aria-live="polite"></div>
    </div>`;
  const F = data.frames;
  const B = data.body.buoyancy_N, Wt = data.body.weight_N, g = data.body.g, cob = data.body.cob_rel, mass = data.body.model_mass_kg;
  const P = data.pinv; // 8x6
  const im = data.images['talos-side-port'];
  // side view: image x grows toward the stern (u = -Z), image y grows downward (v = Y)
  const px = (Z) => im.x0 + ((-Z - im.u[0]) / (im.u[1] - im.u[0])) * (im.x1 - im.x0);
  const py = (Y) => im.y1 - ((Y - im.v[0]) / (im.v[1] - im.v[0])) * (im.y1 - im.y0);
  const toZ = (x) => -(im.u[0] + ((x - im.x0) / (im.x1 - im.x0)) * (im.u[1] - im.u[0]));
  const toY = (y) => im.v[0] + ((im.y1 - y) / (im.y1 - im.y0)) * (im.v[1] - im.v[0]);
  const rot = host.querySelector('.mx-trim-rot');
  const svg = host.querySelector('.mx-trim-svg');
  const top = host.querySelector('.mx-trim-top');
  const out = host.querySelector('.mx-trim-out');
  const wIn = host.querySelector('input[type=range]'), wOut = host.querySelector('output');
  const modeSeg = host.querySelector('.seg');
  // Picture pixels per screen pixel: labels and the handle are sized in screen pixels, whatever the picture's width.
  let k = 4;
  const com = F.com; // CAD m
  let item = { Z: 0.22, Y: -0.30 }; // a part on the claw's arm
  let mode = 'on';

  const comX = px(com[2]), comY = py(com[1]);
  const cobX = px(F.cob[2]), cobY = py(F.cob[1]);
  rot.style.transformOrigin = `${(comX / W) * 100}% ${(comY / H) * 100}%`;
  // In the turning layer: the COM and COB dots and the part (they belong to the robot).
  const comDot = el('circle', { cx: comX, cy: comY, fill: '#2a78d6', stroke: '#fff' }, svg);
  const cobDot = el('circle', { cx: cobX, cy: cobY, fill: '#13734f', stroke: '#fff' }, svg);
  const itemLine = el('line', { stroke: '#d9480f', 'stroke-width': 4, 'stroke-dasharray': '10 8' }, svg);
  const itemDot = el('circle', { fill: '#d9480f', stroke: '#fff', 'stroke-width': 6 }, svg);
  const itemArrow = el('path', { fill: '#d9480f' }, svg);
  // In the level layer: labels (always upright), the bow marker and the drag handle.
  const comLab = el('text', { fill: '#2a78d6', 'text-anchor': 'end' }, top);
  comLab.textContent = 'COM';
  const cobLab = el('text', { fill: '#13734f', 'text-anchor': 'start' }, top);
  cobLab.textContent = 'COB';
  const bow = el('text', { x: 24, fill: '#546d79', class: 'bow' }, top);
  bow.textContent = '← bow';
  const ring = el('circle', { class: 'hint', fill: 'none', stroke: '#d9480f' }, top);
  const handle = el('circle', { class: 'drag', fill: 'transparent' }, top);

  function physics(wg) {
    const Wa = (wg / 1000) * g; // N, positive sinks
    const p = [item.Z - com[2], 0, item.Y - com[1]]; // robot axes relative to the COM (x fwd, y port, z up)
    const Fz = B - Wt - Wa;
    const tx = cob[1] * B - p[1] * Wa, ty = -cob[0] * B + p[0] * Wa;
    const tau = [0, 0, Fz, tx, ty, 0];
    const f = P.map((row) => -row.reduce((s, v, i) => s + v * tau[i], 0));
    const A = -B * cob[2] + Wa * p[2], C = -B * cob[0] + Wa * p[0];
    let th = Math.PI - Math.atan2(C, A);
    th = Math.atan2(Math.sin(th), Math.cos(th));
    return { Fz, ty, f, th, sum: f.reduce((s, v) => s + Math.abs(v), 0), max: Math.max(...f.map(Math.abs)) };
  }
  const base = physics(0);

  // The picture turns by -deg about the COM; labels are drawn level at the turned positions.
  let shown = 0, anim = null;
  const turn = (x, y, deg) => {
    const a = (-deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [comX + (x - comX) * c - (y - comY) * s, comY + (x - comX) * s + (y - comY) * c];
  };
  function placeTurned(deg) {
    rot.style.transform = Math.abs(deg) > 0.01 ? `rotate(${(-deg).toFixed(2)}deg)` : '';
    [comDot, cobDot].forEach((d) => { d.setAttribute('r', 4 * k); d.setAttribute('stroke-width', 1.2 * k); });
    itemLine.setAttribute('stroke-width', 1.2 * k);
    const [ax, ay] = turn(comX, comY, deg), [bx, by] = turn(cobX, cobY, deg);
    // COM's label to the left and below, COB's to the right and above: they never meet.
    comLab.setAttribute('x', ax - 8 * k); comLab.setAttribute('y', ay + 15 * k);
    cobLab.setAttribute('x', bx + 8 * k); cobLab.setAttribute('y', by - 6 * k);
    const [ix, iy] = turn(px(item.Z), py(item.Y), deg);
    ring.setAttribute('cx', ix); ring.setAttribute('cy', iy); ring.setAttribute('r', 19 * k); ring.setAttribute('stroke-width', 2 * k); ring.setAttribute('stroke-dasharray', `${4 * k} ${3 * k}`);
    ring.style.display = mode === 'on' ? '' : 'none';
    handle.setAttribute('cx', ix); handle.setAttribute('cy', iy); handle.setAttribute('r', 26 * k);
    bow.setAttribute('y', 18 * k);
  }
  function animateTo(deg) {
    cancelAnimationFrame(anim);
    const from = shown, t0 = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 500), e = 1 - (1 - k) ** 3;
      shown = from + (deg - from) * e;
      placeTurned(shown);
      if (k < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function draw(animate = false) {
    const wg = +wIn.value;
    wOut.textContent = `${wg > 0 ? '+' : wg < 0 ? '−' : ''}${Math.abs(wg)} g`;
    const x = px(item.Z), y = py(item.Y);
    itemDot.setAttribute('cx', x); itemDot.setAttribute('cy', y); itemDot.setAttribute('r', 11 * k); itemDot.setAttribute('stroke-width', 2 * k);
    itemLine.setAttribute('x1', comX); itemLine.setAttribute('y1', comY); itemLine.setAttribute('x2', x); itemLine.setAttribute('y2', y);
    const s = Math.sign(wg) || 0, L = k * Math.min(28, 8 + Math.abs(wg) * 0.06), o = 12 * k, a = 2.2 * k, hw = 5 * k;
    itemArrow.setAttribute('d', s ? `M${x - a},${y + s * o}V${y + s * (o + L)}H${x - hw}L${x},${y + s * (o + 6 * k + L)}L${x + hw},${y + s * (o + L)}H${x + a}V${y + s * o}Z` : '');
    handle.style.pointerEvents = mode === 'on' ? '' : 'none';
    const r = physics(wg);
    const deg = mode === 'off' ? (r.th * 180) / Math.PI : 0;
    if (animate) animateTo(deg); else { cancelAnimationFrame(anim); shown = deg; placeTurned(deg); }
    const rule = 0.005 * mass * g;
    const pitchWord = (d) => (Math.abs(d) < 0.5 ? 'level' : `${fmt(Math.abs(d), 0)}° nose-${d < 0 ? 'up' : 'down'}`);
    const thDeg = (r.th * 180) / Math.PI;
    const intro = item.Z === 0.22 && item.Y === -0.30 && wg === 150
      ? '<p><b>Starting example:</b> a 150 g tool on the claw arm, low at the bow.</p>' : '';
    out.innerHTML = `${intro}<dl class="spec">
      <dt>Net buoyancy</dt><dd><b>${r.Fz >= 0 ? '+' : '−'}${fmt(Math.abs(r.Fz), 2)} N</b> ${r.Fz >= rule ? `<span class="ok">over RoboSub's ${fmt(rule, 2)} N</span>` : r.Fz > 0 ? `<span class="bad">floats, under RoboSub's ${fmt(rule, 2)} N</span>` : '<span class="bad">sinks</span>'}</dd>
      <dt>Held level by</dt><dd><b>${fmt(r.sum, 1)} N</b> of thrust in total, largest ${fmt(r.max, 1)} N of 24 (model as is: ${fmt(base.sum, 1)} N)</dd>
      <dt>Pitch torque</dt><dd><b>${fmt(Math.abs(r.ty), 2)} N·m</b> ${Math.abs(r.ty) < 0.005 ? '' : r.ty < 0 ? 'nose-up' : 'nose-down'}</dd>
      <dt>Thrusters off</dt><dd><b>${Math.abs(thDeg) > 90 ? 'turns over' : pitchWord(thDeg)}</b> (model as is: ${pitchWord((base.th * 180) / Math.PI)})</dd>
    </dl>
    <p>${wg === 0 ? 'No part added: this is the model as identified.' : mode === 'off' ? 'Switch back to <em>holding level</em> to move the part.' : 'Drag the orange dot to move the part.'}</p>`;
  }
  wIn.addEventListener('input', () => draw());
  modeSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.v;
    modeSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw(true);
  });
  new ResizeObserver(() => {
    const w = top.getBoundingClientRect().width;
    if (!w) return;
    k = W / w;
    host.querySelector('.mx-trim-pic').style.setProperty('--k', k);
    draw();
  }).observe(top);
  // dragging, in the picture's own coordinates (only while level, so screen and picture coordinates agree)
  const toSvg = (e) => {
    const r = top.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  let dragging = false;
  handle.addEventListener('pointerdown', (e) => { dragging = true; handle.setPointerCapture(e.pointerId); e.preventDefault(); });
  handle.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const [x, y] = toSvg(e);
    const cx = Math.min(Math.max(x, im.x0), im.x1), cy = Math.min(Math.max(y, im.y0), im.y1);
    item = { Z: toZ(cx), Y: toY(cy) };
    draw();
  });
  const stop = () => (dragging = false);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
  draw();
}
