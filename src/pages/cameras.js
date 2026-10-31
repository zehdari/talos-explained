import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/cameras.css';
import { el } from '../viz/chart.js';

setup();

const DATA = `${BASE}data/cameras/`;
const IMG = `${BASE}img/cameras/`;
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const getJSON = (name) => fetch(DATA + name).then((r) => r.json());
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const narrowMQ = matchMedia('(max-width: 520px)');
const CORE = 'https://github.com/osu-uwrt/riptide_core';
const commit = (h) => `<a href="${CORE}/commit/${h}">${h}</a>`;

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
  l.className = 'cam-slider';
  l.innerHTML = `<span>${label}</span> <input type="range" min="${min}" max="${max}" step="${step}" value="${value}"> <output></output>`;
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
  const zoom = document.getElementById('eye-zoom');
  const stage = document.getElementById('eye-stage');
  const src = { left: IMG + 'pool_left.webp', right: IMG + 'pool_right.webp' };
  preload(src.right);
  // Close-ups, in the 1280 × 800 image's pixels: crop box and the feature's column in the left eye.
  const spots = [
    { n: 1, name: 'Pole', crop: [100, 400, 260, 195], x: 312, y: 470, mx: 410, my: 470 },
    { n: 2, name: 'Board', crop: [430, 652, 100, 75], x: 479, y: 690, mx: 440, my: 640 },
    { n: 3, name: 'Far wall', crop: [373, 303, 80, 60], x: 413, y: 333, mx: 475, my: 333 },
  ];
  const tiles = spots.map((s) => {
    const [x0, y0, w, h] = s.crop;
    const f = document.createElement('figure');
    f.className = 'cam-tile';
    f.innerHTML = `<div class="pic" style="aspect-ratio:${w}/${h};background-size:${(1280 / w) * 100}% auto;background-position:${(x0 / (1280 - w)) * 100}% ${(y0 / (800 - h)) * 100}%"><i style="left:${((s.x - x0) / w) * 100}%"></i></div><figcaption><b>${s.n}</b> ${s.name}</figcaption>`;
    zoom.appendChild(f);
    // the matching marker on the full image
    const m = document.createElement('span');
    m.className = 'cam-spot';
    m.textContent = s.n;
    m.style.left = `${(s.mx / 1280) * 100}%`;
    m.style.top = `${(s.my / 800) * 100}%`;
    stage.appendChild(m);
    return f.querySelector('.pic');
  });
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
    tiles.forEach((t) => { t.style.backgroundImage = `url(${src[v]})`; });
    tag.textContent = v === 'left' ? 'Left eye' : 'Right eye';
    stage.classList.toggle('right', v === 'right');
    eyes.set(v);
  }
  function stop() { clearInterval(timer); timer = null; flick.setAttribute('aria-pressed', 'false'); }
  flick.onclick = () => {
    if (timer) return stop();
    flick.setAttribute('aria-pressed', 'true');
    timer = setInterval(() => show(eye === 'left' ? 'right' : 'left'), 520);
  };
  stage.addEventListener('click', () => { stop(); show(eye === 'left' ? 'right' : 'left'); });
  [...zoom.children].forEach((t) => t.addEventListener('click', () => { stop(); show(eye === 'left' ? 'right' : 'left'); }));
  show('left');
  note.innerHTML = 'How far each one shifts between the eyes, in full-resolution pixels: <b>1</b> the pole about <b>250 px</b>, <b>2</b> the board about <b>35 px</b>, <b>3</b> the far wall about <b>25 px</b>. Bigger shift, closer object.';
}

// ---------- the camera data path: a top-to-bottom flow, tap a box for its note ----------
{
  const host = document.getElementById('pipe-flow');
  const ctl = document.getElementById('pipe-controls');
  const R = `${CORE}/blob/followpath-speed/riptide_hardware/`;
  const N = {
    ffc: { t: 'Forward ZED X Mini', s: 'looks ahead', info: `Behind the starboard tube's flat bow window, pitched 2.9° down. It is <code>ffc</code> (<code>camera_id</code> 0) because its serial number, 55348591, is in <code>ffc_config.yaml</code>. Swap the serials and forward and down swap too.` },
    dfc: { t: 'Down ZED X Mini', s: 'looks down', info: `Inside the starboard tube, looking out through its clear bottom. It is <code>dfc</code> (<code>camera_id</code> 1) because its serial number, 51491740, is in <code>dfc_config.yaml</code>.` },
    card: { t: 'GMSL2 capture card', s: 'turns the links back into frames', info: 'Each camera sends uncompressed video, power and control over one coax cable (GMSL2). The card turns that back into frames for the Orin, so raw pixels never cross USB or Ethernet.' },
    zed: { t: 'zed_node ×2', s: 'ZED SDK, on the GPU', info: `Two <code>ZedCamera</code> components in one process, <code>zed_container</code>, started by <a href="${R}launch/zed.launch.py">zed.launch.py</a>. Each grabs 1920 × 1200 at 15 Hz, rectifies with the underwater calibration and computes depth on every frame. It only publishes topics someone subscribes to.` },
    topics: { t: 'Camera topics', s: 'colour, depth, calibration', info: 'Under <code>/talos/ffc/zed_node/</code> and <code>/talos/dfc/zed_node/</code>: raw colour and depth images, <code>camera_info</code> (the lens model), and a JPEG <code>/compressed</code> copy of each colour image. <a href="#topics">The full list</a>.',
      sim: 'The same names and frames as on the robot, at 15 Hz. Colour comes only as JPEG (quality 93); there is no raw colour and no <code>stereo_raw</code>.' },
    det: { t: 'yolo_orientation', s: 'the detector, one camera at a time', info: 'Reads the active camera\'s JPEG, depth image and <code>camera_info</code>. <code>set_camera_is_dfc</code> picks the camera (<a href="#switching">below</a>).' },
    pic: { t: 'picture_taker', s: 'saves calibration pairs', info: `Saves raw stereo pairs from the forward camera on its <code>capture_image</code> service (<a href="${R}riptide_hardware2/picture_taker.py">picture_taker.py</a>). It subscribes from launch, so the forward node makes the raw side-by-side image (about 2.2 Gbit/s) the whole time; its <code>enable_subscription</code> service turns that off.`,
      sim: 'Not running: it is started by <code>zed.launch.py</code>, which sim doesn\'t launch.' },
    tag: { t: 'AprilTag node', s: 'forward JPEG', info: `<code>apriltag_ros</code>, started by <code>hardware.launch.py</code> through <a href="${R}launch/apriltag.launch.py">apriltag.launch.py</a>. Reads the forward camera's JPEG and <code>camera_info</code>.`,
      sim: 'Not running: it is started by <code>hardware.launch.py</code>, which sim doesn\'t launch.' },
    tether: { t: 'JPEGs over the tether', info: 'The Ethernet tether joins Talos to the team network. Everything your laptop subscribes to crosses it, as one Zenoh connection to the router on the Orin. Only JPEG colour images belong on it: one raw image stream is about 1.1 Gbit/s.',
      simT: 'JPEGs to the viewer', sim: 'The viewer\'s camera cards in <em>ROS</em> mode subscribe to the same JPEG topics; in <em>Truth</em> mode they show the simulator\'s own render instead.' },
    viewer: { t: 'Nereus viewer', s: 'camera cards on your laptop', info: 'The operator screen. Its <em>Forward camera</em> and <em>Downward camera</em> cards show the JPEGs, or depth if you switch a card to Depth (that pulls raw images: close it during a run).',
      simS: 'the simulator\'s own window' },
    sim: { t: 'Nereus bridge', s: 'renders both cameras', info: 'Runs on the simulator machine. There are no ZED nodes in sim: the bridge renders both cameras from the Talos robot pack and publishes the topics the stack uses (<a href="#nereus">below</a>).' },
  };
  const LAYOUT = {
    robot: [
      { band: 'Cameras', rows: [['ffc', 'dfc']] },
      { arrow: 'GMSL2, one coax each' },
      { band: 'On the Orin', rows: [['card'], 'down', ['zed'], 'down', ['topics'], { label: 'Read on the Orin', items: ['det', 'pic', 'tag'] }] },
      { arrow: 'tether' },
      { band: 'Your laptop', rows: [['viewer']] },
    ],
    sim: [
      { band: 'Simulator', rows: [['sim']] },
      { arrow: 'the same topics' },
      { band: 'The stack', sub: 'on your machine, or on the Orin in a hardware-in-the-loop test', rows: [['topics'], { label: 'Read by', items: ['det', 'pic', 'tag'] }] },
      { arrow: 'tether' },
      { band: 'Viewer', rows: [['viewer']] },
    ],
  };
  let mode = 'robot', sel = 'zed';
  seg(ctl, [['robot', 'On the robot'], ['sim', 'In simulation']], mode, (v) => { mode = v; if (v === 'sim' && ['ffc', 'dfc', 'card', 'zed'].includes(sel)) sel = 'sim'; if (v === 'robot' && sel === 'sim') sel = 'zed'; draw(); }, 'Where');
  const note = document.createElement('div');
  note.className = 'cam-fnote';
  note.setAttribute('aria-live', 'polite');
  const btns = {};
  function node(id) {
    const n = N[id], sim = mode === 'sim';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fn';
    b.dataset.id = id;
    if (sim && (id === 'pic' || id === 'tag')) b.classList.add('off');
    const off = sim && (id === 'pic' || id === 'tag');
    b.innerHTML = `<b>${esc(n.t)}</b><span>${esc(off ? 'not running in sim' : sim && n.simS ? n.simS : n.s)}</span>`;
    b.onclick = () => { sel = sel === id ? null : id; place(); };
    btns[id] = b;
    return b;
  }
  function draw() {
    host.replaceChildren();
    for (const k in btns) delete btns[k];
    for (const part of LAYOUT[mode]) {
      if (part.arrow) {
        const a = document.createElement('div');
        a.className = 'fa out';
        if (part.arrow === 'tether') {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'fa-btn';
          b.dataset.id = 'tether';
          b.textContent = mode === 'sim' ? N.tether.simT : N.tether.t;
          b.onclick = () => { sel = sel === 'tether' ? null : 'tether'; place(); };
          btns.tether = b;
          a.appendChild(b);
        } else a.innerHTML = `<span>${esc(part.arrow)}</span>`;
        host.appendChild(a);
        continue;
      }
      const band = document.createElement('section');
      band.className = 'fb';
      band.innerHTML = `<div class="fl">${esc(part.band)}${part.sub ? ` <small>${esc(part.sub)}</small>` : ''}</div>`;
      for (const r of part.rows) {
        if (r === 'down') { const a = document.createElement('div'); a.className = 'fa'; band.appendChild(a); continue; }
        if (Array.isArray(r)) {
          const row = document.createElement('div');
          row.className = 'fr';
          r.forEach((id) => row.appendChild(node(id)));
          band.appendChild(row);
          continue;
        }
        const a = document.createElement('div');
        a.className = 'fa';
        band.appendChild(a);
        const g = document.createElement('div');
        g.className = 'fgroup';
        g.innerHTML = `<div class="fgl">${esc(r.label)}</div>`;
        const items = document.createElement('div');
        items.className = 'fitems';
        r.items.forEach((id) => items.appendChild(node(id)));
        g.appendChild(items);
        band.appendChild(g);
      }
      host.appendChild(band);
    }
    place();
  }
  // The note goes right under the tapped box (under its row, or under the whole group on a wide screen).
  function place() {
    for (const [id, b] of Object.entries(btns)) b.setAttribute('aria-expanded', String(id === sel));
    if (!sel || !btns[sel]) { note.remove(); return; }
    const n = N[sel], b = btns[sel];
    const text = mode === 'sim' && n.sim ? n.sim : n.info;
    const title = sel === 'tether' ? (mode === 'sim' ? n.simT : n.t) : n.t;
    note.innerHTML = `<b>${esc(title)}.</b> ${text}`;
    const inGroup = b.closest('.fitems');
    const anchor = inGroup ? (narrowMQ.matches ? b : inGroup) : b.closest('.fr') || b.closest('.fa');
    anchor.after(note);
  }
  narrowMQ.addEventListener('change', place);
  draw();
}

// ---------- the settings each ZED node ends up with ----------
getJSON('params.json').then((P) => {
  const list = document.getElementById('param-list');
  const ctl = document.getElementById('param-controls');
  document.getElementById('param-rev').textContent = `${P.wrapper.rev} (${P.wrapper.date})`;
  let cam = 'ffc', filter = 'main';
  const MAIN = ['general.serial_number', 'general.grab_resolution', 'general.pub_resolution', 'general.grab_frame_rate', 'general.optional_opencv_calibration_file', 'general.self_calib', 'depth.depth_mode', 'depth.min_depth', 'depth.max_depth', 'pos_tracking.pos_tracking_enabled', 'pos_tracking.publish_tf'];
  // Why each main setting is what it is (per camera where they differ); other rows use the data file's note.
  const WHY = {
    'general.grab_resolution': 'The full 1920 × 1200 sensor: the most pixels on a small, far prop.',
    'general.pub_resolution': 'Publish at the full grab size. The wrapper default would halve it.',
    'general.grab_frame_rate': `Was 30 until June 2026 (${commit('9a249b2')}). No reason was recorded; a lower rate does leave more GPU time for depth and the detector.`,
    'general.optional_opencv_calibration_file': 'The team’s underwater calibration, used instead of the factory one. The path is absolute on the Orin, so a new file needs a deploy and a restart.',
    'general.self_calib': `Off on the forward camera since July 2025 (${commit('131b61c')}) and the down camera since June 2026 (${commit('9a249b2')}). Start-up self-calibration could replace the underwater calibration.`,
    'depth.depth_mode': {
      ffc: `The slowest, most accurate mode, <a href="https://docs.stereolabs.com/docs/depth-sensing/depth-modes">for small or distant objects</a> (${commit('09d5c55')}, July 2026).`,
      dfc: 'Not set by Talos, so the wrapper decides. Its <code>common_stereo.yaml</code> says <code>NEURAL_LIGHT</code> (the fastest neural mode) as committed, but the team’s dev checkout has it edited to <code>NEURAL_PLUS</code>. Check the robot: <code>ros2 param get /talos/dfc/zed_node depth.depth_mode</code>.',
    },
    'depth.min_depth': 'Wrapper default. Nothing closer gets depth.',
    'depth.max_depth': { ffc: 'Forward depth stops at 4 m: stereo error grows with distance squared.', dfc: 'Not set by Talos; the down camera keeps the wrapper’s 10 m.' },
    'pos_tracking.pos_tracking_enabled': 'Not set by Talos. The SDK’s own visual odometry keeps running, and it needs depth, so depth is computed every frame even with nobody subscribed.',
    'pos_tracking.publish_tf': 'Only the tracking’s TF is off: the EKF owns <code>odom → base_link</code>.',
  };
  const CHECK = { 'depth.depth_mode': ['dfc'] };
  seg(ctl, [['ffc', 'Forward (ffc)'], ['dfc', 'Down (dfc)']], cam, (v) => { cam = v; draw(); }, 'Camera');
  seg(ctl, [['main', 'Main settings'], ['all', `All ${P.rows.length}`]], filter, (v) => { filter = v; draw(); }, 'Which settings');
  const files = () => ['common_stereo.yaml', 'zedxm.yaml', `${cam}_config.yaml`];
  const show = (v) => (v === null || v === undefined ? '—' : v === '' ? '"" (empty)' : typeof v === 'string' ? v : JSON.stringify(v));
  const UNIT = { 'general.grab_frame_rate': ' Hz', 'general.pub_frame_rate': ' Hz', 'depth.point_cloud_freq': ' Hz', 'depth.min_depth': ' m', 'depth.max_depth': ' m' };
  const withUnit = (key, v) => (typeof v === 'number' && UNIT[key] ? `${v}${UNIT[key]}` : show(v));
  const brk = (t) => esc(t).replace(/_/g, '_<wbr>');
  function draw() {
    const open = new Set([...list.querySelectorAll('details[open]')].map((d) => d.dataset.key));
    list.replaceChildren();
    const keys = filter === 'main' ? MAIN : P.rows.map((r) => r.key);
    for (const key of keys) {
      const r = P.rows.find((x) => x.key === key);
      const c = r && r[cam];
      if (!c || c.win === null) continue;
      const d = document.createElement('details');
      d.dataset.key = r.key;
      if (open.has(r.key)) d.open = true;
      const short = r.key.replace(/^[a-z_]+\./, '');
      const w = WHY[r.key];
      const why = w ? (typeof w === 'string' ? w : w[cam]) : r.why;
      const check = (CHECK[r.key] || []).includes(cam);
      d.innerHTML = `<summary><span class="chev" aria-hidden="true"></span><code class="k"><span class="pre">${brk(r.key.slice(0, r.key.length - short.length))}</span>${brk(short)}</code><span class="v">${brk(withUnit(r.key, c.value))}${check ? ' <em class="flag">check</em>' : ''}</span><span class="src src-${c.win}">${c.win === 2 ? 'Talos' : files()[c.win].replace('.yaml', '')}</span></summary>
        <div class="more"><p>${why}</p><ol class="layers">${c.layers.map((v, i) => `<li class="${i === c.win ? 'win' : v === null ? 'none' : 'lost'}"><span>${files()[i]}</span><code>${brk(withUnit(r.key, v))}</code></li>`).join('')}</ol></div>`;
      list.appendChild(d);
    }
  }
  draw();
});

// ---------- field of view ----------
getJSON('fov.json').then((F) => {
  const svg = document.getElementById('fov-svg');
  const note = document.getElementById('fov-note');
  const ctl = document.getElementById('fov-controls');
  const legend = document.getElementById('fov-legend');
  let view = 'side', H = 1.5, D = 3.0;
  seg(ctl, [['side', 'Side view'], ['top', 'Top view']], view, (v) => { view = v; draw(); }, 'View');
  slider(ctl, 'Height above floor', 0.5, 4, 0.05, H, (v) => `${v.toFixed(2)} m`, (v) => { H = v; draw(); });
  slider(ctl, 'Target distance', 0.5, 6, 0.05, D, (v) => `${v.toFixed(2)} m`, (v) => { D = v; draw(); });

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
    const dA = side ? ray(dfc, 0, dfc.rect[3]) : null, dB = side ? ray(dfc, dfc.w, dfc.rect[3]) : null;
    const corners = [[0, 0], [dfc.w, 0], [dfc.w, dfc.h], [0, dfc.h]].map(([u, v]) => ray(dfc, u, v));
    const foot = corners.map((d) => at(dfc, d, tFloor(dfc, d)));
    const ffcFloorT = tFloor(ffc, side ? fB : ray(ffc, ffc.rect[2], ffc.h));
    const ffcFloor = isFinite(ffcFloorT) ? at(ffc, side ? fB : ray(ffc, ffc.rect[2], ffc.h), ffcFloorT) : null;

    // view window, metres: always out past the 4 m depth limit and the target, and the floor entry if it is near
    const sb = sil.bounds;
    const Wv = 900;
    const x0 = Math.min(sb[0][0], ...foot.map((p) => p[0])) - 0.25;
    const x1 = Math.min(7.2, Math.max(D + 0.7, range[1] + 0.55, side && ffcFloor && ffcFloor[0] < 6.6 ? ffcFloor[0] + 0.35 : 0));
    const k = Wv / (x1 - x0);
    const cw = svg.clientWidth || Wv;
    const maxH = parseFloat(getComputedStyle(svg).maxHeight) || Infinity;
    // label size in viewBox units for about 12.5 px on screen; the bottom margin is sized from it
    let scale = cw / Wv, fz = 13, y0, y1, Hv;
    for (let it = 0; it < 3; it++) {
      fz = Math.max(13, 12.5 / scale);
      if (side) { y0 = -H - (fz * 1.9) / k; y1 = Math.max(sb[1][1], 0.45) + (fz * 2.4) / k; }
      else {
        const tw = Math.max(...foot.map((p) => Math.abs(p[1])), Math.abs(at(ffc, fA, D)[1]), Math.abs(at(ffc, fB, D)[1]), sb[1][1], -sb[0][1]);
        y0 = -tw - (fz * 3.0) / k; y1 = tw + (fz * 2.9) / k;
      }
      Hv = Math.round((y1 - y0) * k);
      scale = Math.min(cw / Wv, maxH / Hv);
    }
    const u = 1 / scale; // viewBox units per screen pixel
    svg.setAttribute('viewBox', `0 0 ${Wv} ${Hv}`);
    const X = (x) => (x - x0) * k, Y = (y) => (y1 - y) * k;
    const pts = (ps) => ps.map((p) => `${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join(' ');
    const label = (x, y, text, attrs = {}, parent = svg) => { const t = el('text', { x, y, class: 'halo', ...attrs }, parent); t.style.fontSize = `${fz}px`; t.style.strokeWidth = `${4 * u}px`; t.textContent = text; return t; };
    const defs = el('defs', {}, svg);
    const cp = el('clipPath', { id: 'fov-clip' }, defs);
    el('rect', { x: 0, y: 0, width: Wv, height: Hv }, cp);
    const g = el('g', { 'clip-path': 'url(#fov-clip)' }, svg);

    // metre grid
    for (let x = Math.ceil(x0); x <= x1; x++) el('line', { x1: X(x), x2: X(x), y1: 0, y2: Hv, stroke: css('--grid'), 'stroke-width': u }, g);
    for (let y = Math.ceil(y0); y <= y1; y++) el('line', { x1: 0, x2: Wv, y1: Y(y), y2: Y(y), stroke: css('--grid'), 'stroke-width': u }, g);

    const blue = css('--state'), green = css('--prediction'), ink = css('--ink');
    const L = 40; // a long way, clipped by the view
    const cone = (c, a, b, color, near, far, floorClip) => {
      const p = P2(c.pos);
      const A = (t) => P2(at(c, a, t)), B = (t) => P2(at(c, b, t));
      const f = floorClip ? (q) => q[1] + H : () => 1;
      const shape = (t0, t1) => clip([A(t0), A(t1), B(t1), B(t0)], f);
      const sDepth = shape(near, far), sFar = shape(far, L);
      if (sFar.length > 2) el('polygon', { points: pts(sFar), fill: color, opacity: 0.08 }, g);
      if (sDepth.length > 2) el('polygon', { points: pts(sDepth), fill: color, opacity: 0.24 }, g);
      for (const d of [a, b]) {
        const t = floorClip ? Math.min(L, tFloor(c, d)) : L;
        el('line', { x1: X(p[0]), y1: Y(p[1]), x2: X(P2(at(c, d, t))[0]), y2: Y(P2(at(c, d, t))[1]), stroke: color, 'stroke-width': 1.6 * u }, g);
      }
    };

    if (side) {
      el('rect', { x: 0, y: Y(-H), width: Wv, height: Hv - Y(-H), fill: css('--water') }, g);
      el('line', { x1: 0, x2: Wv, y1: Y(-H), y2: Y(-H), stroke: css('--water-deep'), 'stroke-width': 3 * u }, g);
      cone(ffc, fA, fB, blue, range[0], range[1], true);
      cone(dfc, dA, dB, green, 0.3, F.depth_range.dfc[1], true);
      const fx = foot.map((p) => p[0]);
      el('line', { x1: X(Math.min(...fx)), x2: X(Math.max(...fx)), y1: Y(-H), y2: Y(-H), stroke: green, 'stroke-width': 5 * u, 'stroke-linecap': 'round' }, g);
    } else {
      cone(ffc, fA, fB, blue, range[0], range[1], false);
      el('polygon', { points: pts(foot.map(P2)), fill: green, opacity: 0.25, stroke: green, 'stroke-width': 2 * u }, g);
    }
    // the target: the image's extent at depth D (a plane square to the forward camera)
    const tA = P2(at(ffc, fA, D)), tB = P2(at(ffc, fB, D));
    el('line', { x1: X(tA[0]), y1: Y(tA[1]), x2: X(tB[0]), y2: Y(tB[1]), stroke: ink, 'stroke-width': 3 * u, 'stroke-linecap': 'round' }, g);
    // Talos
    const path = sil.polys.map((poly) => `M${pts(poly).replace(/ /g, 'L')}Z`).join('');
    el('path', { d: path, fill: css('--ink-2'), 'fill-rule': 'evenodd', opacity: 0.9 }, g);
    for (const [c, col] of [[ffc, blue], [dfc, green]]) {
      const p = P2(c.pos);
      el('circle', { cx: X(p[0]), cy: Y(p[1]), r: Math.max(5.5, 4.5 * u), fill: col, stroke: css('--paper'), 'stroke-width': 1.5 * u }, g);
    }
    // Labels are placed from candidate spots: the first one that stays in the view and clear of
    // everything placed so far (other labels, Talos, the dots, the target, cone edges) wins.
    const boxes = [], segs = [];
    const reserve = (x, y, w, h) => boxes.push({ x, y, width: w, height: h, shape: true });
    const seg2 = (p, q) => segs.push([X(p[0]), Y(p[1]), X(q[0]), Y(q[1])]);
    const overlaps = (a, b, pad) => a.x < b.x + b.width + pad && b.x < a.x + a.width + pad && a.y < b.y + b.height + pad && b.y < a.y + a.height + pad;
    // does segment (x1,y1)-(x2,y2) cross the box? (Liang-Barsky)
    const crosses = (bb, [x1, y1, x2, y2], pad) => {
      const dx = x2 - x1, dy = y2 - y1;
      let t0 = 0, t1 = 1;
      for (const [pp, q] of [[-dx, x1 - (bb.x - pad)], [dx, bb.x + bb.width + pad - x1], [-dy, y1 - (bb.y - pad)], [dy, bb.y + bb.height + pad - y1]]) {
        if (pp === 0) { if (q < 0) return false; continue; }
        const r = q / pp;
        if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
      return true;
    };
    const free = (bb) => bb.x >= 3 * u && bb.x + bb.width <= Wv - 3 * u && bb.y >= 1 * u && bb.y + bb.height <= Hv - 1 * u &&
      !boxes.some((b) => overlaps(bb, b, b.shape ? 1.5 * u : 5 * u)) && !segs.some((sg) => crosses(bb, sg, 1.5 * u));
    function put(text, cands, { color, bold = 650, optional = false } = {}) {
      const t = label(0, 0, text, { 'font-weight': bold });
      if (color) t.style.fill = color;
      const at3 = ([x, y, anchor, alt]) => { t.textContent = alt || text; t.setAttribute('x', x); t.setAttribute('y', y); t.setAttribute('text-anchor', anchor || 'start'); return t.getBBox(); };
      for (const c of cands) { const bb = at3(c); if (free(bb)) { boxes.push(bb); return t; } }
      if (optional) { t.remove(); return null; }
      boxes.push(at3(cands[0]));
      return t;
    }
    // things labels must not cover
    reserve(X(sb[0][0]), Y(sb[1][1]), (sb[1][0] - sb[0][0]) * k, (sb[1][1] - sb[0][1]) * k);
    seg2(tA, tB);
    for (const [c, a2, b2, fc] of side ? [[ffc, fA, fB, true], [dfc, dA, dB, true]] : [[ffc, fA, fB, false]]) {
      for (const d of [a2, b2]) seg2(P2(c.pos), P2(at(c, d, fc ? Math.min(L, tFloor(c, d)) : L)));
    }
    if (side) reserve(0, Y(-H) - 2 * u, Wv, 4 * u); // the floor line
    else { const fp = foot.map(P2); fp.forEach((q, i) => seg2(q, fp[(i + 1) % fp.length])); }

    const floorDot = side && ffcFloor && ffcFloor[0] < x1;
    if (floorDot) {
      el('circle', { cx: X(ffcFloor[0]), cy: Y(-H), r: 4.5 * u, fill: blue, stroke: css('--paper'), 'stroke-width': 1.5 * u }, svg);
      reserve(X(ffcFloor[0]) - 5 * u, Y(-H) - 5 * u, 10 * u, 10 * u);
    }
    const sx0 = X(sb[0][0]), sx1 = X(sb[1][0]), sMid = (sx0 + sx1) / 2, sTop = Y(sb[1][1]), sBot = Y(sb[0][1]);
    if (side) {
      // the floor first (bottom-left), then Talos with the bow arrow beside it
      put(`floor, ${H.toFixed(2)} m down`, [[6 * u, Y(-H) + fz + 3 * u, 'start']], { bold: 450 });
      const tl = put('Talos', [[Math.max(sMid, 3 * u + fz * 1.3), sTop - 6 * u, 'middle'], [6 * u, sTop - 6 * u, 'start']]);
      const tb = tl.getBBox();
      put('bow →', [[tb.x + tb.width + 12 * u, sTop - 6 * u, 'start'], [6 * u, fz * 1.1, 'start']]);
    } else {
      const port = put('↑ port', [[6 * u, fz + 2 * u, 'start']]);
      put('bow →', [[6 * u + port.getComputedTextLength() + 18 * u, fz + 2 * u, 'start']]);
      put('↓ starboard', [[6 * u, Hv - 6 * u, 'start']]);
      put('Talos', [[sMid, sTop - 6 * u, 'middle'], [sMid, sBot + fz + 2 * u, 'middle'], [Math.max(sx0, 6 * u), sTop - 6 * u, 'start']]);
    }
    // the target's distance, by one end of its line
    {
      const [lo, hi] = Y(tA[1]) > Y(tB[1]) ? [tA, tB] : [tB, tA]; // lower end on screen first
      const xs = X(tA[0]), lowY = Math.min(Y(lo[1]), side ? Y(-H) - 6 * u : Hv), hiY = Math.max(Y(hi[1]), 0);
      const txt = `${D.toFixed(2)} m`;
      const along = [0.2, 0.35, 0.5, 0.65].flatMap((f) => { const y = hiY + (lowY - hiY) * f + fz * 0.35; return [[xs + 8 * u, y, 'start'], [xs - 8 * u, y, 'end']]; });
      const cands = side
        ? [[xs + 8 * u, lowY - 6 * u, 'start'], [xs - 8 * u, lowY - 6 * u, 'end'], [xs + 8 * u, hiY + fz + 4 * u, 'start'], [xs - 8 * u, hiY + fz + 4 * u, 'end'], ...along]
        : [[xs + 8 * u, hiY + fz + 2 * u, 'start'], [xs - 8 * u, hiY + fz + 2 * u, 'end'], [xs, hiY - 6 * u, 'middle'], ...along];
      put(txt, cands, { bold: 600 });
    }
    // where the floor comes into the bottom of the forward view
    if (floorDot) {
      const fx = X(ffcFloor[0]), by = Y(-H) + fz + 3 * u;
      put(`floor in view, ${(ffcFloor[0] - ffc.pos[0]).toFixed(1)} m`, [[fx - 5 * u, by + 2 * u, 'end'], [fx + 8 * u, by, 'start'], [fx - 8 * u, Y(-H) - 8 * u, 'end']], { color: blue, bold: 500 });
    }
    // where forward depth stops: by the 4 m edge of the darker shading, shorter text if space is tight
    {
      const top = P2(at(ffc, fA, range[1])), bot = P2(at(ffc, fB, range[1]));
      const ys = [0.5, 0.35, 0.65, 0.2, 0.8].map((f) => Y(top[1]) + (Y(bot[1]) - Y(top[1])) * f + fz * 0.35).filter((y) => y > fz && y < (side ? Y(-H) - 4 * u : Hv - fz));
      const xb = (y) => X(top[0]) + (X(bot[0]) - X(top[0])) * ((y - Y(top[1])) / (Y(bot[1]) - Y(top[1]) || 1));
      const cands = [];
      for (const text of ['depth ends, 4 m', 'depth to 4 m']) for (const y of ys) cands.push([xb(y) - 6 * u, y, 'end', text]);
      for (const y of ys) cands.push([xb(y) + 6 * u, y, 'start', 'depth to 4 m']);
      for (const y of ys) cands.push([xb(y) - 4 * u, y, 'end', '4 m'], [xb(y) + 4 * u, y, 'start', '4 m']);
      put('depth ends, 4 m', cands, { color: blue, bold: 600 });
    }
    // which cone is which camera: optional, the legend says it too
    {
      const cands = [];
      for (const t of [0.9, 1.4, 1.9, 2.5, 3.2]) { const q = P2(at(ffc, fMid, t)); cands.push([X(q[0]), Y(q[1]) + fz * 0.35, 'middle']); }
      put('ffc', cands, { color: blue, optional: true });
    }
    if (side) {
      const cands = [[X(dfc.pos[0]), Y(-H) - 10 * u, 'middle']];
      for (const f of [0.6, 0.75, 0.9, 0.45]) { const q = P2(at(dfc, dA, f * tFloor(dfc, dA))); cands.push([X(q[0]) - 6 * u, Y(q[1]), 'end']); }
      put('dfc', cands, { color: green, optional: true });
    } else {
      const fp = foot.map(P2), fx0 = Math.min(...fp.map((q) => q[0])), fy0 = Math.min(...fp.map((q) => q[1])), fy1 = Math.max(...fp.map((q) => q[1]));
      put('dfc', [[X(fx0) + 4 * u, Y(fy0) - 6 * u, 'start'], [X(fx0) + 4 * u, Y(fy0) + fz + 3 * u, 'start'], [X(fx0) + 4 * u, Y(fy1) + fz + 4 * u, 'start'], [X(fx0) + 4 * u, Y(fy1) - 5 * u, 'start']], { color: green, optional: true });
    }

    legend.innerHTML = '<span><i style="background:var(--state)"></i>Forward camera (ffc)</span><span><i style="background:var(--prediction)"></i>Down camera (dfc)</span><span><i class="cam-grid-sw"></i>Grid: 1 m squares</span><span><i class="cam-shade-sw"></i>Darker shade: also gets depth</span>' +
      (side ? '<span><i style="background:var(--water-deep)"></i>Pool floor</span>' : '') +
      '<span><i style="background:var(--ink)"></i>Target: what fits in the frame at that distance</span>';

    // readout
    const w = D * (ffc.w / ffc.rect[0]), h = D * (ffc.h / ffc.rect[1]);
    const gateFrom = F.props.gate_width / (ffc.w / ffc.rect[0]);
    const boardAt = F.props.torpedo_board / (ffc.h / ffc.rect[1]);
    const hd = H + dfc.pos[2]; // down camera above the floor
    const fl = foot.map((p) => p[0]), fwdth = foot.map((p) => p[1]);
    const len = Math.max(...fl) - Math.min(...fl), wid = Math.max(...fwdth) - Math.min(...fwdth);
    note.innerHTML =
      `<p><b><i class="cam-sw" style="--c:var(--state)"></i>Forward</b>, ${hfov(ffc).toFixed(1)}° × ${vfov(ffc).toFixed(1)}°. At ${D.toFixed(2)} m the frame covers <b>${w.toFixed(2)} m × ${h.toFixed(2)} m</b>, ${(1000 * D / ffc.rect[0]).toFixed(1)} mm per pixel. ` +
      `The whole gate (${F.props.gate_width.toFixed(2)} m across its posts) fits in the frame from ${gateFrom.toFixed(1)} m away; the ${F.props.torpedo_board.toFixed(2)} m torpedo board fills the height at ${boardAt.toFixed(2)} m.` +
      (ffcFloor ? ` The floor enters the bottom of the frame ${(ffcFloor[0] - ffc.pos[0]).toFixed(1)} m ahead.` : '') + '</p>' +
      `<p><b><i class="cam-sw" style="--c:var(--prediction)"></i>Down</b>, ${hfov(dfc).toFixed(1)}° fore–aft × ${vfov(dfc).toFixed(1)}° across, ${hd.toFixed(2)} m above the floor: footprint <b>${len.toFixed(2)} m × ${wid.toFixed(2)} m</b>, ${(1000 * hd / dfc.rect[0]).toFixed(2)} mm per pixel.</p>`;
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
  slider(ctl, 'Frame rate', 1, 15, 1, rate, (v) => `${v} Hz`, (v) => { rate = v; draw(); });
  slider(ctl, 'JPEG quality', 50, 100, 5, q, (v) => `${v}`, (v) => { q = v; draw(); });
  const jpeg = () => {
    if (scene === 'bench' && q === 95) return B.jpeg.real_ffc_bench; // the frame as the robot sent it
    const c = B.curves[scene];
    const i = c.findIndex(([qq]) => qq >= q);
    if (c[i][0] === q || i === 0) return c[i][1];
    const [q0, s0] = c[i - 1], [q1, s1] = c[i];
    return s0 + ((s1 - s0) * (q - q0)) / (q1 - q0);
  };
  const mbit = (bytes) => (bytes * 8 * rate) / 1e6;
  const fmt = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
  const MB = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;
  function draw() {
    const j = jpeg();
    const groups = [
      { title: 'Over the tether to your laptop', lines: true, rows: [
        { label: 'JPEG colour, one camera', v: mbit(j), color: css('--s7') },
        { label: 'JPEG colour, both cameras', v: mbit(2 * j), color: css('--s7') },
        { label: 'Raw colour, one camera', v: mbit(B.raw.bgra8), color: css('--s8') },
        { label: 'Raw depth, one camera', v: mbit(B.raw.depth32), color: css('--s8') },
      ] },
      { title: 'Stays on the Orin', rows: [
        { label: 'Raw stereo pair for picture_taker', v: mbit(B.raw.stereo_raw_bgra8), color: css('--s8') },
        { label: 'Raw colour + depth, both cameras', v: mbit(2 * (B.raw.bgra8 + B.raw.depth32)), color: css('--s8') },
      ] },
    ];
    host.replaceChildren();
    const W = Math.max(300, Math.round(host.clientWidth || 700));
    const narrow = W < 560;
    const labelW = narrow ? 0 : 250, rowH = narrow ? 44 : 30, barH = 16, headH = 26, refH = 22, axisH = 28;
    let Hc = 4;
    for (const g of groups) Hc += headH + (g.lines ? refH : 0) + g.rows.length * rowH + 8;
    Hc += axisH;
    const svg = el('svg', { class: 'chart cam-bw', viewBox: `0 0 ${W} ${Hc}`, width: W, height: Hc }, host);
    const lo = 0.5, hi = 12000, x0 = labelW + 4, x1 = W - 6;
    const sx = (v) => x0 + ((Math.log10(Math.max(v, lo)) - Math.log10(lo)) / (Math.log10(hi) - Math.log10(lo))) * (x1 - x0);
    const plotTop = 4, plotBot = Hc - axisH;
    for (const t of narrow ? [1, 10, 100, 1000] : [1, 10, 100, 1000, 10000]) {
      el('line', { x1: sx(t), x2: sx(t), y1: plotTop, y2: plotBot, stroke: css('--grid') }, svg);
      const tx = el('text', { class: 'tick', x: sx(t), y: plotBot + 18, 'text-anchor': t === 1 ? 'start' : t === 10000 ? 'end' : 'middle' }, svg);
      tx.textContent = t >= 1000 ? `${t / 1000} Gbit/s` : `${t}${t === 1 ? ' Mbit/s' : ''}`;
      if (t === 1) tx.setAttribute('x', sx(t) - 4);
    }
    // Value labels never sit on a dashed Ethernet line: inside the bar if it fits, else right of the bar
    // or just past a line. On phones the lines only run through the bars, and a value that can't sit on
    // its bar row goes on the row's label line, right-aligned.
    const REFS = [[100, '100 Mbit/s', -1], [1000, '1 Gbit/s', 1]];
    const refX = REFS.map(([v]) => sx(v));
    const crossesRef = (a, b, lines) => lines && refX.some((x) => x > a - 4 && x < b + 4);
    let y = plotTop;
    for (const g of groups) {
      el('text', { class: 'head', x: 0, y: y + 17 }, svg).textContent = g.title;
      y += headH;
      const top = y;
      if (g.lines) {
        el('text', { class: 'ref muted', x: 0, y: top + 13 }, svg).textContent = 'Ethernet:';
        for (const [v, name, side] of REFS) el('text', { class: 'ref', x: sx(v) + side * 5, y: top + 13, 'text-anchor': side < 0 ? 'end' : 'start' }, svg).textContent = name;
        y += refH;
      }
      const lineLayer = el('g', {}, svg);
      const spans = []; // per row: the y range and the x ranges taken by text
      for (const r of g.rows) {
        const barY = narrow ? y + 20 : y + (rowH - barH) / 2;
        let nameW = 0;
        if (narrow) { const n = el('text', { class: 'rl', x: 0, y: y + 14 }, svg); n.textContent = r.label; nameW = n.getComputedTextLength(); }
        else el('text', { class: 'rl', x: labelW - 8, y: y + rowH / 2 + 4.5, 'text-anchor': 'end' }, svg).textContent = r.label;
        const bx = sx(r.v);
        el('rect', { x: x0, y: barY, width: Math.max(2, bx - x0), height: barH, rx: 3, fill: r.color }, svg);
        const t = el('text', { class: 'bw-val', x: bx + 6, y: barY + 12.5 }, svg);
        t.textContent = `${fmt(r.v)} Mbit/s · ${fmt(r.v / 8)} MB/s`;
        const tw = t.getComputedTextLength();
        const fitsIn = bx - x0 >= tw + 14;
        const cands = [];
        if (!crossesRef(bx + 6, bx + 6 + tw, g.lines) && bx + 6 + tw <= x1) cands.push(['out', bx + 6]);
        if (fitsIn) cands.push(['in', bx - 6]);
        if (!narrow && g.lines) for (const rx of refX) if (rx > bx && rx + 6 + tw <= x1 && !crossesRef(rx + 6 + 1, rx + 6 + tw, true)) cands.push(['out', rx + 6]);
        if (!cands.length && narrow) {
          // a phone with no room: Mbit/s only, right of the bar (the readout below has the bytes)
          const full = t.textContent;
          t.textContent = `${fmt(r.v)} Mbit/s`;
          const sw = t.getComputedTextLength();
          if (!crossesRef(bx + 6, bx + 6 + sw, g.lines) && bx + 6 + sw <= x1) cands.push(['out', bx + 6]);
          else t.textContent = full;
        }
        let pick = cands[0];
        if (!pick && narrow && nameW + 12 + tw <= x1) pick = ['line', x1];
        if (!pick) pick = fitsIn ? ['in', bx - 6] : ['out', bx + 6];
        if (pick[0] === 'in') { t.setAttribute('x', pick[1]); t.setAttribute('text-anchor', 'end'); t.classList.add('in'); }
        else if (pick[0] === 'line') { t.setAttribute('x', pick[1]); t.setAttribute('y', y + 14); t.setAttribute('text-anchor', 'end'); }
        else t.setAttribute('x', pick[1]);
        const busy = [];
        if (narrow) busy.push([0, nameW]);
        if (pick[0] === 'line') busy.push([x1 - tw, x1]);
        spans.push({ a: y, b: y + rowH, busy, bar: [barY - 4, barY + barH + 4] });
        y += rowH;
      }
      if (g.lines) {
        // The lines sit behind the bars and stop short of any text on a row's label line.
        for (const x of refX) {
          const runs = [[top + 17, top + refH]];
          for (const sp of spans) {
            const hit = sp.busy.some(([l, r]) => x > l - 5 && x < r + 5);
            runs.push(hit ? sp.bar : [sp.a, sp.b]);
          }
          const merged = [];
          for (const r of runs) { const last = merged[merged.length - 1]; if (last && r[0] - last[1] < 1) last[1] = Math.max(last[1], r[1]); else merged.push([...r]); }
          for (const [a, b] of merged) el('line', { x1: x, x2: x, y1: a, y2: b, stroke: css('--ink-2'), 'stroke-dasharray': '4 4', 'stroke-width': 1.3 }, lineLayer);
        }
      }
      y += 8;
    }
    const sceneName = { pool: 'the July 2025 pool frame (decoded from video, so smaller than a live frame)', bench: 'the lab bench frame', nereus: 'a Nereus torpedo frame' }[scene];
    const median = (a) => { const s = [...a].sort((p, r) => p - r); return s[Math.floor(s.length / 2)]; };
    note.innerHTML = `One 1920 × 1200 JPEG of ${sceneName} at quality ${q}: <b>${MB(j)}</b>, against <b>${(B.raw.bgra8 / 1e6).toFixed(1)} MB</b> raw (${(B.raw.bgra8 / j).toFixed(0)}× smaller). ` +
      `Nereus's JPEGs (quality 93) over a whole mission: median <b>${MB(median(B.jpeg.sim_ffc))}</b> forward, <b>${MB(median(B.jpeg.sim_dfc))}</b> down.`;
  }
  draw();
  let lastW = host.clientWidth;
  new ResizeObserver(() => { if (Math.abs(host.clientWidth - lastW) > 8) { lastW = host.clientWidth; draw(); } }).observe(host);
});

// ---------- which camera each task uses ----------
getJSON('trees.json').then((T) => {
  const host = document.getElementById('tree-cams');
  const names = {
    GateTreeMpc: 'Gate', TorpedoTreeMpc: 'Torpedo', MagnetTreeMpc: 'Magnet poker',
    BinTreeMpc: 'Bins', dropObjectMpc: 'Drop a marker', pickupObjectMpc: 'Pick up an object', NewTableTreeMpc: 'Table',
  };
  const rows = T.trees.filter((t) => t.reachable && names[t.tree]); // only subtrees the main tree can reach
  rows.sort((a, b) => Object.keys(names).indexOf(a.tree) - Object.keys(names).indexOf(b.tree));
  const chip = (c) => `<span class="cam-chip cam-${c}">${c === 'ffc' ? 'Forward' : 'Down'}</span>`;
  host.innerHTML = `<table class="params cam-trees"><thead><tr><th>Task</th><th>Camera</th></tr></thead><tbody>${rows
    .map((t) => `<tr><td>${names[t.tree]}<code>${t.tree}</code></td><td>${[...new Set(t.cams)].map(chip).join(' → ')}</td></tr>`)
    .join('')}</tbody></table>`;
});

// ---------- Nereus colour and depth ----------
{
  const img = document.getElementById('sim-img');
  const key = document.getElementById('sim-key');
  const ctl = document.getElementById('sim-controls');
  const stage = document.getElementById('sim-stage');
  const tag = document.createElement('span');
  tag.className = 'cam-eye-tag';
  stage.appendChild(tag);
  let cam = 'ffc', kind = 'rgb';
  for (const c of ['ffc', 'dfc']) for (const k of ['rgb', 'depth']) if (c !== 'ffc' || k !== 'rgb') preload(`${IMG}nereus_${c}_${k}.webp`);
  seg(ctl, [['ffc', 'Forward'], ['dfc', 'Down']], cam, (v) => { cam = v; show(); }, 'Camera');
  const kinds = seg(ctl, [['rgb', 'Colour'], ['depth', 'Depth']], kind, (v) => { kind = v; show(); }, 'Image');
  function show() {
    img.src = `${IMG}nereus_${cam}_${kind}.webp`;
    img.alt = `Nereus ${cam === 'ffc' ? 'forward' : 'down'} camera ${kind === 'rgb' ? 'colour image' : 'depth image, coloured by distance'}`;
    tag.textContent = `${cam === 'ffc' ? 'Forward' : 'Down'} · ${kind === 'rgb' ? 'Colour' : 'Depth'}`;
    key.hidden = kind !== 'depth';
    const max = cam === 'ffc' ? 4 : 2;
    key.innerHTML = `<span>near, 0 m</span><i class="ramp"></i><span>${max} m</span>${cam === 'ffc' ? '<span class="none"><i></i>no depth</span>' : ''}`;
  }
  stage.addEventListener('click', () => { kind = kind === 'rgb' ? 'depth' : 'rgb'; kinds.set(kind); show(); });
  show();
}
