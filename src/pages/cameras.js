import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/cameras.css';
import { Graph } from '../viz/graph.js';
import { el, tapOutside } from '../viz/chart.js';

setup();

const DATA = `${BASE}data/cameras/`;
const IMG = `${BASE}img/cameras/`;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const getJSON = (name) => fetch(DATA + name).then((r) => r.json());
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function seg(host, options, value, onPick, label) {
  const sp = document.createElement('span');
  sp.className = 'seg';
  sp.setAttribute('role', 'group');
  if (label) sp.setAttribute('aria-label', label);
  const buttons = options.map(([v, text]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset.v = v;
    b.setAttribute('aria-pressed', String(v === value));
    b.onclick = () => { set(v); onPick(v); };
    sp.appendChild(b);
    return b;
  });
  const set = (v) => buttons.forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === String(v))));
  host.appendChild(sp);
  return { el: sp, set };
}
function slider(host, label, min, max, step, value, fmt, onInput) {
  const l = document.createElement('label');
  l.innerHTML = `${label} <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"> <output></output>`;
  const input = l.querySelector('input'), out = l.querySelector('output');
  const upd = () => { out.textContent = fmt(+input.value); onInput(+input.value); };
  input.addEventListener('input', upd);
  host.appendChild(l);
  out.textContent = fmt(value);
  return input;
}
const preload = (src) => { const i = new Image(); i.src = src; return i; };
// The page's own images: in HTML a base-absolute src gets the base prefixed twice by the dev server, so set them here.
document.querySelectorAll('img[data-src]').forEach((i) => { i.src = IMG + i.dataset.src; });

// ---------- a real stereo pair: flick between the eyes ----------
{
  const img = document.getElementById('eye-img');
  const tag = document.getElementById('eye-tag');
  const note = document.getElementById('eye-note');
  const src = { left: IMG + 'pool_left.webp', right: IMG + 'pool_right.webp' };
  preload(src.right);
  let eye = 'left', timer = null;
  const ctl = document.getElementById('eye-controls');
  const eyes = seg(ctl, [['left', 'Left eye'], ['right', 'Right eye']], 'left', (v) => { stop(); show(v); }, 'Which eye');
  const flick = document.createElement('button');
  flick.type = 'button';
  flick.className = 'btn';
  flick.textContent = 'Flicker';
  flick.setAttribute('aria-pressed', 'false');
  ctl.appendChild(flick);
  function show(v) {
    eye = v;
    img.src = src[v];
    tag.textContent = v === 'left' ? 'Left eye' : 'Right eye';
    eyes.set(v);
  }
  function stop() { clearInterval(timer); timer = null; flick.setAttribute('aria-pressed', 'false'); }
  flick.onclick = () => {
    if (timer) return stop();
    flick.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => show(eye === 'left' ? 'right' : 'left'), 480);
  };
  document.getElementById('eye-stage').addEventListener('click', () => { stop(); show(eye === 'left' ? 'right' : 'left'); });
  note.innerHTML = 'Disparity measured in this pair (full-resolution pixels): <b>~250 px</b> on the pole, <b>~45 px</b> on the checkerboard, <b>10–25 px</b> on the far wall. Bigger shift, closer object.';
}

// ---------- the camera data path ----------
{
  const host = document.getElementById('pipe-graph');
  const note = document.getElementById('pipe-note');
  const R = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/';
  const nodes = [
    { id: 'ffc', x: 85, y: 70, label: 'Forward ZED X Mini', sub: 'ffc · camera_id 0', info: 'Looks ahead, pitched 2.9° down. Two image sensors 50 mm apart behind one window. Its <code>serial_number</code> (55348591) in <code>ffc_config.yaml</code> is how the SDK knows this one is ffc.' },
    { id: 'dfc', x: 85, y: 170, label: 'Down ZED X Mini', sub: 'dfc · camera_id 1', info: 'Looks straight down, 12 cm to starboard of <code>base_link</code>. Serial 51491740 in <code>dfc_config.yaml</code>.' },
    { id: 'card', x: 265, y: 120, label: 'GMSL2 capture card', sub: 'in the camera cage', info: 'Turns each camera\'s GMSL2 serial link back into video for the Orin. GMSL2 carries high-rate video over one thin cable.' },
    { id: 'zed', x: 455, y: 120, label: 'zed_node ×2', sub: 'ZED SDK on the GPU', info: `Two <code>stereolabs::ZedCamera</code> components in one process, <code>zed_container</code>, started by <a href="${R}launch/zed.launch.py">zed.launch.py</a>. Each grabs 1920 × 1200 at 15 Hz, rectifies with the underwater calibration and computes depth (NEURAL_PLUS on ffc). It only produces the topics someone subscribes to.` },
    { id: 'topics', x: 650, y: 120, label: '/talos/<cam>/zed_node/…', sub: 'rgb · depth · camera_info', info: 'Raw images (<code>bgra8</code>, <code>32FC1</code>) plus a JPEG <code>/compressed</code> twin of each colour image made by <code>image_transport</code>. Topic names and frames are listed in the next sections.' },
    { id: 'det', x: 830, y: 50, label: 'yolo_orientation', sub: 'detector, one camera', info: 'Reads the active camera\'s compressed colour image, its depth image and <code>camera_info</code>, all on the Orin. <code>set_camera_is_dfc</code> picks the camera.' },
    { id: 'pic', x: 830, y: 130, label: 'picture_taker', sub: 'calibration pairs', info: `Saves raw stereo pairs from <code>stereo_raw/image_raw_color</code> on its <code>capture_image</code> service (<a href="${R}riptide_hardware2/picture_taker.py">picture_taker.py</a>). Started subscribed, so the raw side-by-side image is produced while it runs.` },
    { id: 'tether', x: 650, y: 214, label: 'Tether', sub: 'Zenoh to the laptop', info: 'The link between the robot and the laptop: everything the laptop subscribes to crosses it. Only JPEG colour images belong on it; one raw image stream is about 1.1 Gbit/s.' },
    { id: 'viewer', x: 650, y: 300, label: 'Nereus viewer', sub: 'camera cards', info: 'The operator UI on the laptop. Its "Forward camera" and "Downward camera" cards show the compressed images (and depth, if you switch a card to Depth).' },
    { id: 'sim', x: 455, y: 300, label: 'Nereus bridge', sub: 'simulator only', info: 'Runs on the simulator machine, not the Orin. In simulation there are no ZED nodes: the bridge renders both cameras and publishes the topics the stack uses, with the same names and frames, JPEG at quality 93.' },
  ];
  const edges = [
    { from: 'ffc', to: 'card', label: 'GMSL2' },
    { from: 'dfc', to: 'card', label: 'GMSL2' },
    { from: 'card', to: 'zed' },
    { from: 'zed', to: 'topics' },
    { from: 'topics', to: 'det' },
    { from: 'topics', to: 'pic' },
    { from: 'topics', to: 'tether', label: 'JPEG' },
    { from: 'tether', to: 'viewer' },
    { from: 'sim', to: 'topics', dash: true },
  ];
  const narrow = {
    below: 620, width: 380, height: 680,
    bands: [
      { label: 'CAMERA CAGE', points: [[14, 18], [366, 18], [366, 214], [14, 214]] },
      { label: 'ORIN', points: [[14, 234], [214, 234], [214, 326], [366, 326], [366, 474], [14, 474]] },
      { label: 'SIMULATOR', points: [[226, 234], [366, 234], [366, 314], [226, 314]] },
      { label: 'LAPTOP', points: [[14, 562], [366, 562], [366, 664], [14, 664]] },
    ],
    nodes: {
      ffc: { x: 98, y: 70 }, dfc: { x: 282, y: 70 }, card: { x: 190, y: 170 },
      zed: { x: 112, y: 286 }, sim: { x: 296, y: 280 }, topics: { x: 190, y: 370 },
      det: { x: 90, y: 440 }, pic: { x: 290, y: 440 },
      tether: { x: 190, y: 518 }, viewer: { x: 190, y: 614 },
    },
    edges: {
      'ffc>card': { label: '' }, 'dfc>card': { label: '' },
      'topics>tether': { lx: 198, ly: 490, anchor: 'start' },
    },
  };
  new Graph(host, {
    width: 920, height: 344, nodes, edges, narrow,
    bands: [
      { label: 'CAMERA CAGE', points: [[14, 22], [350, 22], [350, 205], [14, 205]] },
      { label: 'ORIN', points: [[370, 22], [918, 22], [918, 175], [370, 175]] },
      { label: 'SIMULATOR', points: [[370, 256], [545, 256], [545, 336], [370, 336]] },
      { label: 'LAPTOP', points: [[560, 256], [918, 256], [918, 336], [560, 336]] },
    ],
    info: (n) => { note.innerHTML = n ? `<b>${esc(n.label)}.</b> ${n.info}` : 'Tap or hover a box.'; },
  });
}

// ---------- parameter layers ----------
getJSON('params.json').then((P) => {
  const list = document.getElementById('param-list');
  const ctl = document.getElementById('param-controls');
  document.getElementById('param-rev').textContent = `${P.wrapper.rev} (${P.wrapper.date})`;
  let cam = 'ffc', filter = 'all';
  seg(ctl, [['ffc', 'Forward (ffc)'], ['dfc', 'Down (dfc)']], cam, (v) => { cam = v; draw(); }, 'Camera');
  seg(ctl, [['all', 'All'], ['talos', 'Set by Talos'], ['wrapper', 'Wrapper defaults']], filter, (v) => { filter = v; draw(); }, 'Filter');
  const files = () => ['common_stereo.yaml', 'zedxm.yaml', `${cam}_config.yaml`];
  const show = (v) => (v === null || v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v));
  function draw() {
    list.replaceChildren();
    const open = new Set([...document.querySelectorAll('#param-list details[open]')].map((d) => d.dataset.key));
    for (const r of P.rows) {
      const c = r[cam];
      if (c.win === null) continue;
      if (filter === 'talos' && c.win !== 2) continue;
      if (filter === 'wrapper' && c.win === 2) continue;
      const d = document.createElement('details');
      d.dataset.key = r.key;
      if (open.has(r.key)) d.open = true;
      const short = r.key.replace(/^[a-z_]+\./, '');
      d.innerHTML = `<summary><code class="k">${short}</code><span class="v">${show(c.value)}</span><span class="src src-${c.win}">${c.win === 2 ? 'Talos' : files()[c.win].replace('.yaml', '')}</span></summary>
        <div class="more"><p>${r.why}</p><ol class="layers">${c.layers.map((v, i) => `<li class="${i === c.win ? 'win' : v === null ? 'none' : 'lost'}"><span>${files()[i]}</span><code>${show(v)}</code></li>`).join('')}</ol><p class="full"><code>${r.key}</code></p></div>`;
      list.appendChild(d);
    }
  }
  draw();
});

// ---------- field of view ----------
Promise.all([getJSON('fov.json')]).then(([F]) => {
  const svg = document.getElementById('fov-svg');
  const note = document.getElementById('fov-note');
  const ctl = document.getElementById('fov-controls');
  let view = 'side', H = 1.5, D = 3.0;
  seg(ctl, [['side', 'Side view'], ['top', 'Top view']], view, (v) => { view = v; draw(); }, 'View');
  slider(ctl, 'Height', 0.5, 4, 0.05, H, (v) => `${v.toFixed(2)} m`, (v) => { H = v; draw(); });
  slider(ctl, 'Distance', 0.5, 6, 0.05, D, (v) => `${v.toFixed(2)} m`, (v) => { D = v; draw(); });
  document.getElementById('fov-legend').innerHTML =
    '<span><i style="background:var(--state)"></i>Forward camera</span><span><i style="background:var(--prediction)"></i>Down camera</span><span><i style="background:var(--ink)"></i>Target at Distance</span><span><i style="background:var(--water-deep)"></i>Pool floor</span>';

  const cams = F.cams;
  const mv = (R, v) => [0, 1, 2].map((i) => R[i][0] * v[0] + R[i][1] * v[1] + R[i][2] * v[2]);
  // ray through pixel (u, v) in base_link, scaled so its optical z (the ZED's depth) is 1
  const ray = (c, u, v) => mv(c.R, [(u - c.rect[2]) / c.rect[0], (v - c.rect[3]) / c.rect[1], 1]);
  const at = (c, d, t) => [c.pos[0] + d[0] * t, c.pos[1] + d[1] * t, c.pos[2] + d[2] * t];
  const tFloor = (c, d) => (d[2] < -1e-6 ? (-H - c.pos[2]) / d[2] : Infinity);
  const ffc = cams.ffc, dfc = cams.dfc;
  const deg = (r) => (r * 180) / Math.PI;
  const hfov = (c) => deg(Math.atan(c.rect[2] / c.rect[0]) + Math.atan((c.w - c.rect[2]) / c.rect[0]));
  const vfov = (c) => deg(Math.atan(c.rect[3] / c.rect[1]) + Math.atan((c.h - c.rect[3]) / c.rect[1]));

  // clip a polygon (2D points) to the half-plane f(p) >= 0
  function clip(poly, f) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length], fa = f(a), fb = f(b);
      if (fa >= 0) out.push(a);
      if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    }
    return out;
  }

  function draw() {
    svg.replaceChildren();
    const side = view === 'side';
    const P2 = (p) => (side ? [p[0], p[2]] : [p[0], p[1]]); // world -> drawing plane
    const sil = F.silhouette[side ? 'side' : 'top'];
    const range = [0.3, F.depth_range.ffc[1]];
    // forward camera: edges of the image in the drawn plane (rows in side view, columns in top view)
    const fA = side ? ray(ffc, ffc.rect[2], 0) : ray(ffc, 0, ffc.rect[3]);
    const fB = side ? ray(ffc, ffc.rect[2], ffc.h) : ray(ffc, ffc.w, ffc.rect[3]);
    const fMid = ray(ffc, ffc.rect[2], ffc.rect[3]);
    // down camera: columns run fore and aft, rows port-starboard
    const dA = side ? ray(dfc, 0, dfc.rect[3]) : null, dB = side ? ray(dfc, dfc.w, dfc.rect[3]) : null;
    const corners = [[0, 0], [dfc.w, 0], [dfc.w, dfc.h], [0, dfc.h]].map(([u, v]) => ray(dfc, u, v));
    const foot = corners.map((d) => at(dfc, d, tFloor(dfc, d)));
    const ffcFloorT = side ? tFloor(ffc, fB) : Infinity;
    const ffcFloor = isFinite(ffcFloorT) ? at(ffc, fB, ffcFloorT) : null;

    // view window, metres
    const sb = sil.bounds;
    const phone = (svg.clientWidth || 900) < 520; // a phone keeps the view tight around the target
    const xFar = Math.min(7, phone ? Math.max(D + 0.5, 1.6) : Math.max(D + 0.7, 2.2, ffcFloor && ffcFloor[0] < 6.5 ? ffcFloor[0] + 0.4 : 0));
    let x0 = Math.min(sb[0][0], ...foot.map((p) => p[0])) - 0.25, x1 = xFar, y0, y1;
    if (side) { y0 = -H - 0.3; y1 = Math.max(sb[1][1] + 0.25, 0.9); }
    else {
      const w = Math.max(...foot.map((p) => Math.abs(p[1])), Math.abs(at(ffc, fA, D)[1]), Math.abs(at(ffc, fB, D)[1]), sb[1][1], -sb[0][1]);
      y0 = -w - 0.3; y1 = w + 0.3;
    }
    const k = 900 / (x1 - x0), Wv = 900, Hv = Math.round((y1 - y0) * k);
    svg.setAttribute('viewBox', `0 0 ${Wv} ${Hv}`);
    const X = (x) => (x - x0) * k, Y = (y) => (y1 - y) * k;
    const pts = (ps) => ps.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    // drawn scale: the svg fills the width unless max-height caps it
    const maxH = parseFloat(getComputedStyle(svg).maxHeight) || Infinity;
    const scale = Math.min((svg.clientWidth || Wv) / Wv, maxH / Hv);
    const fz = Math.max(13, 12.5 / scale);
    const label = (x, y, text, attrs = {}) => { const t = el('text', { x, y, class: 'halo', ...attrs }, svg); t.style.fontSize = `${fz}px`; t.textContent = text; return t; };
    const defs = el('defs', {}, svg);
    const cp = el('clipPath', { id: 'fov-clip' }, defs);
    el('rect', { x: 0, y: 0, width: Wv, height: Hv }, cp);
    const g = el('g', { 'clip-path': 'url(#fov-clip)' }, svg);

    // metre grid
    for (let x = Math.ceil(x0); x <= x1; x++) el('line', { x1: X(x), x2: X(x), y1: 0, y2: Hv, stroke: css('--grid'), 'stroke-width': 1 }, g);
    for (let y = Math.ceil(y0); y <= y1; y++) el('line', { x1: 0, x2: Wv, y1: Y(y), y2: Y(y), stroke: css('--grid'), 'stroke-width': 1 }, g);

    const blue = css('--state'), green = css('--prediction'), ink = css('--ink');
    const L = 40; // a long way, clipped by the view
    const cone = (c, a, b, color, near, far, floorClip) => {
      const p = P2(c.pos);
      const A = (t) => P2(at(c, a, t)), B = (t) => P2(at(c, b, t));
      const f = floorClip ? (q) => q[1] + H : () => 1;
      const shape = (t0, t1) => clip([A(t0), A(t1), B(t1), B(t0)], f);
      const sDepth = shape(near, far), sFar = shape(far, L);
      if (sFar.length > 2) el('polygon', { points: pts(sFar), fill: color, opacity: 0.08 }, g);
      if (sDepth.length > 2) el('polygon', { points: pts(sDepth), fill: color, opacity: 0.22 }, g);
      for (const d of [a, b]) {
        const t = floorClip ? Math.min(L, tFloor(c, d)) : L;
        el('line', { x1: X(p[0]), y1: Y(p[1]), x2: X(P2(at(c, d, t))[0]), y2: Y(P2(at(c, d, t))[1]), stroke: color, 'stroke-width': 1.6 }, g);
      }
    };

    if (side) {
      // pool floor
      el('rect', { x: 0, y: Y(-H), width: Wv, height: Hv - Y(-H), fill: css('--water') }, g);
      el('line', { x1: 0, x2: Wv, y1: Y(-H), y2: Y(-H), stroke: css('--water-deep'), 'stroke-width': 3 }, g);
      cone(ffc, fA, fB, blue, range[0], range[1], true);
      cone(dfc, dA, dB, green, 0.3, F.depth_range.dfc[1], true);
      // down-camera footprint on the floor
      const fx = foot.map((p) => p[0]);
      el('line', { x1: X(Math.min(...fx)), x2: X(Math.max(...fx)), y1: Y(-H), y2: Y(-H), stroke: green, 'stroke-width': 6, 'stroke-linecap': 'round' }, g);
      if (ffcFloor) el('circle', { cx: X(ffcFloor[0]), cy: Y(-H), r: 5, fill: blue }, g);
    } else {
      cone(ffc, fA, fB, blue, range[0], range[1], false);
      el('polygon', { points: pts(foot.map(P2)), fill: green, opacity: 0.25, stroke: green, 'stroke-width': 2 }, g);
    }
    // the target: the image's extent at depth D (a plane square to the forward camera)
    const tA = P2(at(ffc, fA, D)), tB = P2(at(ffc, fB, D));
    el('line', { x1: X(tA[0]), y1: Y(tA[1]), x2: X(tB[0]), y2: Y(tB[1]), stroke: ink, 'stroke-width': 3, 'stroke-linecap': 'round' }, g);
    // Talos
    const path = sil.polys.map((poly) => `M${pts(poly).replace(/ /g, 'L')}Z`).join('');
    el('path', { d: path, fill: css('--ink-2'), 'fill-rule': 'evenodd', opacity: 0.9 }, g);
    for (const [c, col] of [[ffc, blue], [dfc, green]]) {
      const p = P2(c.pos);
      el('circle', { cx: X(p[0]), cy: Y(p[1]), r: 5.5, fill: col, stroke: css('--paper'), 'stroke-width': 2 }, g);
    }
    // labels
    const fwdEnd = P2(at(ffc, fMid, range[1]));
    if (fwdEnd[0] < x1 - 0.1) label(X(fwdEnd[0]) - 6, Y(fwdEnd[1]) - 8, 'depth ends at 4 m', { 'text-anchor': 'end', fill: blue });
    label(X(tB[0]) + 8, Y(tB[1]) - 8, `${D.toFixed(2)} m`, { 'text-anchor': X(tB[0]) > Wv - 90 ? 'end' : 'start' });
    if (side) label(8, Y(-H) + fz + 6, `floor, ${H.toFixed(2)} m below base_link`, {});
    // scale bar
    const sx = Wv - 20 - k, sy = Hv - 14;
    el('line', { x1: sx, x2: sx + k, y1: sy, y2: sy, stroke: ink, 'stroke-width': 2 }, svg);
    label(sx + k / 2, sy - 6, '1 m', { 'text-anchor': 'middle' });

    // readout
    const w = D * (ffc.w / ffc.rect[0]), h = D * (ffc.h / ffc.rect[1]);
    const gateFrom = F.props.gate_width / (ffc.w / ffc.rect[0]);
    const boardAt = F.props.torpedo_board / (ffc.h / ffc.rect[1]);
    const hd = H + dfc.pos[2]; // down camera above the floor
    const fl = foot.map((p) => p[0]), fwdth = foot.map((p) => p[1]);
    const len = Math.max(...fl) - Math.min(...fl), wid = Math.max(...fwdth) - Math.min(...fwdth);
    note.innerHTML =
      `<p><b style="color:var(--state)">Forward</b>, ${hfov(ffc).toFixed(1)}° × ${vfov(ffc).toFixed(1)}°. At ${D.toFixed(2)} m the image covers <b>${w.toFixed(2)} m × ${h.toFixed(2)} m</b>, ${(1000 * D / ffc.rect[0]).toFixed(1)} mm per pixel. ` +
      `The ${F.props.gate_width.toFixed(1)} m gate fits across from ${gateFrom.toFixed(2)} m; the ${F.props.torpedo_board.toFixed(2)} m torpedo board fills the height at ${boardAt.toFixed(2)} m.` +
      (ffcFloor ? ` The floor enters the bottom of the image ${(ffcFloor[0] - ffc.pos[0]).toFixed(1)} m ahead.` : '') + '</p>' +
      `<p><b style="color:var(--prediction)">Down</b>, ${hfov(dfc).toFixed(1)}° fore–aft × ${vfov(dfc).toFixed(1)}° across, ${hd.toFixed(2)} m above the floor: footprint <b>${len.toFixed(2)} m × ${wid.toFixed(2)} m</b>, ${(1000 * hd / dfc.rect[0]).toFixed(2)} mm per pixel.</p>`;
  }
  draw();
  let lastW = 0;
  new ResizeObserver(() => { if (svg.clientWidth !== lastW) { lastW = svg.clientWidth; draw(); } }).observe(svg);
});

// ---------- bandwidth ----------
getJSON('bandwidth.json').then((B) => {
  const ctl = document.getElementById('bw-controls');
  const host = document.getElementById('bw-chart');
  const note = document.getElementById('bw-note');
  let scene = 'bench', rate = 15, q = 95;
  seg(ctl, [['bench', 'Lab (real)'], ['pool', 'Pool (from video)'], ['nereus', 'Nereus']], scene, (v) => { scene = v; draw(); }, 'Scene');
  slider(ctl, 'Rate', 1, 15, 1, rate, (v) => `${v} Hz`, (v) => { rate = v; draw(); });
  slider(ctl, 'JPEG quality', 50, 100, 5, q, (v) => `${v}`, (v) => { q = v; draw(); });
  const jpeg = () => {
    const c = B.curves[scene];
    const i = c.findIndex(([qq]) => qq >= q);
    if (c[i][0] === q || i === 0) return c[i][1];
    const [q0, s0] = c[i - 1], [q1, s1] = c[i];
    return s0 + ((s1 - s0) * (q - q0)) / (q1 - q0);
  };
  const mbit = (bytes) => (bytes * 8 * rate) / 1e6;
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  function draw() {
    const j = jpeg();
    const rows = [
      { label: 'JPEG colour, one camera', v: mbit(j), color: css('--s7') },
      { label: 'JPEG colour, both cameras', v: mbit(2 * j), color: css('--s7') },
      { label: 'Raw colour (bgra8), one', v: mbit(B.raw.bgra8), color: css('--s8') },
      { label: 'Raw depth (32FC1), one', v: mbit(B.raw.depth32), color: css('--s8') },
      { label: 'Raw side-by-side (picture_taker)', v: mbit(B.raw.stereo_raw_bgra8), color: css('--s8') },
      { label: 'Raw colour + depth, both', v: mbit(2 * (B.raw.bgra8 + B.raw.depth32)), color: css('--s8') },
    ];
    host.replaceChildren();
    const wrap = document.createElement('div');
    wrap.style.position = 'relative';
    host.appendChild(wrap);
    const narrow = host.clientWidth < 560;
    const W = narrow ? 380 : 720, rowH = narrow ? 50 : 30, labelW = narrow ? 0 : 230, top = 6, axisH = 26;
    const Hc = top + rows.length * rowH + axisH;
    const svg = el('svg', { class: 'chart', viewBox: `0 0 ${W} ${Hc}` }, wrap);
    wrap.appendChild(tip);
    const lo = 0.5, hi = 20000, x0 = labelW + 4, x1 = W - 8;
    const sx = (v) => x0 + ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (x1 - x0);
    const plotTop = top, plotBot = top + rows.length * rowH;
    for (const t of [1, 10, 100, 1000, 10000]) {
      el('line', { x1: sx(t), x2: sx(t), y1: plotTop, y2: plotBot, stroke: css('--grid') }, svg);
      el('text', { class: 'label', x: sx(t), y: plotBot + 17, 'text-anchor': 'middle' }, svg).textContent = t >= 1000 ? `${t / 1000} Gbit/s` : `${t}${t === 1 ? ' Mbit/s' : ''}`;
    }
    for (const [t, name] of [[100, '100 Mbit Ethernet'], [1000, 'Gigabit']]) {
      el('line', { x1: sx(t), x2: sx(t), y1: plotTop - 2, y2: plotBot, stroke: css('--ink-2'), 'stroke-dasharray': '4 4', 'stroke-width': 1.3 }, svg);
    }
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      const barY = narrow ? y + 22 : y + (rowH - 16) / 2;
      if (narrow) el('text', { class: 'label', x: 4, y: y + 14 }, svg).textContent = r.label;
      else el('text', { class: 'label', x: labelW - 6, y: y + rowH / 2 + 4, 'text-anchor': 'end' }, svg).textContent = r.label;
      const rect = el('rect', { x: x0, y: barY, width: Math.max(2, sx(r.v) - x0), height: 16, rx: 3, fill: r.color, style: 'cursor:pointer' }, svg);
      const txt = r.v >= 100 ? r.v.toFixed(0) : r.v.toFixed(1);
      const vx = sx(r.v) + 6, inside = vx > x1 - 70;
      el('text', { class: inside ? 'bw-val in' : 'bw-val', x: inside ? sx(r.v) - 6 : vx, y: barY + 12.5, 'text-anchor': inside ? 'end' : 'start' }, svg).textContent = `${txt} Mbit/s`;
      const show = () => {
        tip.innerHTML = `${r.label}: <b>${txt} Mbit/s</b> (${(r.v / 8).toFixed(1)} MB/s)`;
        tip.hidden = false;
        const b = rect.getBoundingClientRect(), wb = wrap.getBoundingClientRect();
        tip.style.left = `${Math.min(Math.max(b.left + b.width / 2 - wb.left, 90), wb.width - 90)}px`;
        tip.style.top = `${b.top - wb.top}px`;
        tip.style.transform = 'translate(-50%, -110%)';
      };
      rect.addEventListener('pointerdown', show);
      rect.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
      rect.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hidden = true; });
    });
    tapOutside(svg, () => (tip.hidden = true));
    const sceneName = { pool: 'the July 2025 pool frame (decoded from H.265 video, so smaller than a live frame)', bench: 'the lab bench frame', nereus: 'a Nereus torpedo frame' }[scene];
    note.innerHTML = `One 1920 × 1200 JPEG of ${sceneName} at quality ${q}: <b>${(j / 1000).toFixed(0)} KB</b>, against <b>${(B.raw.bgra8 / 1e6).toFixed(1)} MB</b> raw (${(B.raw.bgra8 / j).toFixed(0)}× smaller). ` +
      `Nereus's published JPEGs (quality 93) measured over a whole mission: median <b>${(median(B.jpeg.sim_ffc) / 1000).toFixed(0)} KB</b> forward, <b>${(median(B.jpeg.sim_dfc) / 1000).toFixed(0)} KB</b> down.`;
  }
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  draw();
  let lastW = host.clientWidth;
  new ResizeObserver(() => { if (Math.abs(host.clientWidth - lastW) > 20) { lastW = host.clientWidth; draw(); } }).observe(host);
});

// ---------- which camera each task uses ----------
getJSON('trees.json').then((T) => {
  const host = document.getElementById('tree-cams');
  const names = {
    GateTreeMpc: 'Gate', TorpedoTreeMpc: 'Torpedo', MagnetTreeMpc: 'Magnet lights',
    BinTreeMpc: 'Bins', dropObjectMpc: 'Drop a marker', pickupObjectMpc: 'Pick up an object', NewTableTreeMpc: 'Table',
  };
  const rows = T.trees.filter((t) => t.reachable && names[t.tree]); // only subtrees the main tree can reach
  rows.sort((a, b) => Object.keys(names).indexOf(a.tree) - Object.keys(names).indexOf(b.tree));
  const chip = (c) => `<span class="cam-chip cam-${c}">${c === 'ffc' ? 'Forward' : 'Down'}</span>`;
  host.innerHTML = `<table class="params cam-trees"><thead><tr><th>Task</th><th>Subtree</th><th>Camera</th></tr></thead><tbody>${rows
    .map((t) => `<tr><td>${names[t.tree]}</td><td><code>${t.tree}</code></td><td>${[...new Set(t.cams)].map(chip).join(' → ')}</td></tr>`)
    .join('')}</tbody></table>`;
});

// ---------- Nereus colour and depth ----------
{
  const img = document.getElementById('sim-img');
  const key = document.getElementById('sim-key');
  const ctl = document.getElementById('sim-controls');
  let cam = 'ffc', kind = 'rgb';
  for (const c of ['ffc', 'dfc']) for (const k of ['rgb', 'depth']) if (c !== 'ffc' || k !== 'rgb') preload(`${IMG}nereus_${c}_${k}.webp`);
  seg(ctl, [['ffc', 'Forward'], ['dfc', 'Down']], cam, (v) => { cam = v; show(); }, 'Camera');
  const kinds = seg(ctl, [['rgb', 'Colour (JPEG)'], ['depth', 'Depth (32FC1)']], kind, (v) => { kind = v; show(); }, 'Image');
  function show() {
    img.src = `${IMG}nereus_${cam}_${kind}.webp`;
    img.alt = `Nereus ${cam === 'ffc' ? 'forward' : 'down'} camera ${kind === 'rgb' ? 'colour image' : 'depth image, coloured by distance'}`;
    key.hidden = kind !== 'depth';
    const max = cam === 'ffc' ? 4 : 2;
    key.innerHTML = `<span>0 m</span><i class="ramp"></i><span>${max} m</span><span class="none"><i></i>no depth</span>`;
  }
  document.getElementById('sim-stage').addEventListener('click', () => { kind = kind === 'rgb' ? 'depth' : 'rgb'; kinds.set(kind); show(); });
  show();
}
