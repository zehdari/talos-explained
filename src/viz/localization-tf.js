// The TF explorer for the localization chapter: the whole TF tree (public/data/rosgraph/tf.json, captured in Nereus)
// as a collapsible list, Talos drawn from above and from behind (CAD silhouettes, tools/localization/silhouettes.py)
// with every talos/* frame as a dot, and a card with the selected transform. Tap a row or a dot.
import { el } from './chart.js';

const BASE = import.meta.env.BASE_URL;
const R2D = 180 / Math.PI;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// ---- quaternions [x, y, z, w]
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
function qrot(q, v) {
  const [x, y, z, w] = q;
  const ix = w * v[0] + y * v[2] - z * v[1], iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0], iw = -x * v[0] - y * v[1] - z * v[2];
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}
// ROS roll, pitch, yaw (fixed x, y, z axes), degrees
function rpy(q) {
  const [x, y, z, w] = q;
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return [roll, pitch, yaw].map((a) => a * R2D);
}

// ---- what each frame is. Keys are frame names; patterns after.
const CORE = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/';
const NAV = `${CORE}riptide_hardware/launch/navigation.launch.py`;
const ABOUT = {
  world: 'The fixed root of the tree. Every other frame hangs below it. Its children <code>odom</code> and <code>map</code> are static transforms.',
  odom: 'Where the EKF\'s adding-up started: x, y and heading are zero wherever <code>base_link</code> was when the EKF came up. <code>world → odom</code> is a static identity ("until we get SLAM").',
  map: 'The course. <code>world → map</code> comes from the AprilTag calibration (chameleon_tf\'s <code>world_to_map</code>), x, y and yaw only; identity until then. In Nereus it stays identity because Talos starts at the map origin.',
  offset: 'Mapping\'s correction: where the course really sits relative to the prior map, a pure translation learned from detections. Every course object below it moves with it (<a href="perception/frames.html">Frames, targets and the mission tree</a>).',
  'talos/base_link': 'The body: the frame that "is" Talos, x forward, y port, z up. The EKF publishes <code>odom → talos/base_link</code> at its 30 Hz (about 20 Hz measured on the loaded capture machine). Velocities in <code>odometry/filtered</code> are in these axes.',
  'talos/origin': 'The CAD datum. Every pose in <code>talos.yaml</code> is measured from it; <code>base_link</code> is 14 cm behind, 3 cm to port and 9 cm below it.',
  'talos/base_inertia': 'The centre of mass, measured with everything on: 1 cm behind, 0.7 cm to port and 7.7 cm above <code>base_link</code>.',
  'talos/imu_link': 'The VN-100 IMU, mounted upside down and turned −90° (roll 180°, yaw −90°). Fixed joint, so on <code>/tf_static</code>.',
  'talos/imu_revolute_link': 'A second copy of the IMU pose on a zero-range revolute joint, re-sent on <code>/tf</code>.',
  'talos/dvl_link': 'The DVL, turned −45° and 16 cm below <code>base_link</code>. A zero-range revolute joint, so it is on <code>/tf</code>, not <code>/tf_static</code>: a bag tool that reads only statics won\'t find it.',
  'talos/pressure_link': 'The Bar02 depth sensor on the camera cage. <code>depth_converter.py</code> looks up this offset once and turns it with the attitude to give <code>base_link</code>\'s depth.',
  'talos/fog_link': 'The fibre-optic gyro. Its pose is all zeros: for a gyro only the axis matters, and every point of a rigid body turns at the same rate.',
  'talos/ffc_base_link': 'The forward ZED X Mini\'s body centre, from <code>talos.yaml</code>. The frames below come from the zed_wrapper\'s own description.',
  'talos/dfc_base_link': 'The downward ZED X Mini\'s body centre, turned to look straight down.',
  'talos/pose_sensor_link': 'A ground-truth pose sensor mount left in <code>robot_sensors.xacro</code> from an older simulator. Nothing in the current stack uses it.',
  'talos/hitch_link': 'An actuator mount from <code>talos.yaml</code> (all zeros).',
  'tag36h11:0': 'The AprilTag (family 36h11, id 0, 0.508 m), published by apriltag_ros when the forward camera sees it. Disconnected in this capture: the tag was out of view, so TF had no camera → tag link.',
  estimated_origin_frame: 'A fixed 0.4572 m (18 in) from the tag: the point the course map is measured from. The tag calibration copies <code>world → estimated_origin_frame</code> into <code>world → map</code>.',
  'simulator/talos/base_link': 'Nereus\'s truth: where Talos really is. Sim only, a separate branch so the viewer can draw truth and the EKF\'s estimate side by side.',
};
function about(name) {
  if (ABOUT[name]) return ABOUT[name];
  let m;
  if ((m = name.match(/^talos\/thruster_(\d)$/))) return `Thruster ${m[1]}: where it pushes and along which axis (x). The MPC's allocation uses the same poses (<a href="control/thrusters.html">Thrusters and allocation</a>). Continuous joint, so on <code>/tf</code>.`;
  if (/optical_frame$/.test(name)) return 'A camera optical frame: z out of the lens, x right, y down in the image. Detections are reported in it, and TF carries them to the body and the course.';
  if (/_camera_link$/.test(name)) return 'The ZED\'s mounting point, 16 mm below the body centre along the camera\'s z (zed_wrapper\'s description).';
  if (/^talos\/(acoustics)/.test(name)) return 'A hydrophone position from <code>talos.yaml</code>. Nothing in the current code uses it (<a href="sensors.html#acoustics">acoustics</a>).';
  if (/^talos\/(claw|magnet|torpedo|droppers|poker)/.test(name)) return 'An actuator: where it acts, so autonomy can line it up over a target (<a href="actuators.html">Torpedoes, dropper and claw</a>).';
  if (/^simulator\//.test(name)) return 'Part of Nereus\'s truth branch: the same camera mount, at the true pose.';
  if (/target|pre_|post_/.test(name)) return 'A pose for autonomy to drive to, kept by mapping relative to its prop (<a href="perception/frames.html">Frames, targets and the mission tree</a>).';
  return 'A course object from mapping: its prior position plus what the cameras have seen (<a href="perception/map.html">The course map</a>).';
}
function publisher(e) {
  const p = e.parent, c = e.child;
  if (p === 'world' && c === 'odom') return `static_transform_publisher (<a href="${NAV}#L196-L203">navigation.launch.py</a>)`;
  if (p === 'world' && c === 'map') return 'chameleon_tf <code>world_to_map</code> (<a href="https://github.com/osu-uwrt/riptide_perception/blob/mapping-estimator/riptide_mapping/launch/mapping.launch.py#L73-L101">mapping.launch.py</a>)';
  if (c === 'talos/base_link') return `the EKF, robot_localization (<a href="${NAV}#L126-L140">navigation.launch.py</a>)`;
  if (c === 'estimated_origin_frame') return `static_transform_publisher (<a href="${CORE}riptide_hardware/launch/apriltag.launch.py#L47-L53">apriltag.launch.py</a>)`;
  if (p.startsWith('simulator/') || c.startsWith('simulator/')) return 'Nereus (sim only)';
  if (/_camera_link$|optical_frame$/.test(c) && p.startsWith('talos/')) return 'zed_state_publisher (zed_wrapper description)';
  if (p.startsWith('talos/')) return e.static ? 'robot_state_publisher' : 'robot_state_publisher, from joint states';
  return 'mapping (mapping.py)';
}

// Child order in the tree: the frames a reader is looking for first.
const RANK = ['odom', 'map', 'simulator/talos/base_link', 'talos/base_link', 'talos/origin', 'talos/imu_link', 'talos/imu_revolute_link',
  'talos/fog_link', 'talos/dvl_link', 'talos/pressure_link', 'talos/ffc_base_link', 'talos/dfc_base_link', 'talos/base_inertia'];
const rank = (n) => { const i = RANK.indexOf(n); return i < 0 ? (n.startsWith('talos/thruster') ? 50 : 60) : i; };
const OPEN = new Set(['world', 'odom', 'talos/base_link', 'talos/origin', 'tag36h11:0']);

export function createTfExplorer({ views, tree, card, side, tf, sil, links }) {
  const edges = new Map(tf.edges.map((e) => [e.child, e]));
  const kids = new Map();
  for (const e of tf.edges) {
    if (!kids.has(e.parent)) kids.set(e.parent, []);
    kids.get(e.parent).push(e.child);
  }
  for (const [, v] of kids) v.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));
  const count = (n) => (kids.get(n) || []).reduce((s, c) => s + 1 + count(c), 0);

  // Every frame below talos/base_link, in talos/origin (the drawings' frame).
  const inOrigin = new Map();
  const blo = edges.get('talos/origin').sample.xyz; // origin in base_link
  (function walk(f, t, q) {
    inOrigin.set(f, { t: [t[0] - blo[0], t[1] - blo[1], t[2] - blo[2]], q });
    for (const c of kids.get(f) || []) {
      const s = edges.get(c).sample;
      walk(c, qrot(q, s.xyz).map((v, i) => v + t[i]), qmul(q, s.quat_xyzw));
    }
  })('talos/base_link', [0, 0, 0], [0, 0, 0, 1]);

  // ---------------------------------------------------------------- drawings
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const AX = [['x', '--s8'], ['y', '--s6'], ['z', '--state']];
  const GAP = 44, TOPPAD = 32;
  const W = sil.top.px[0];
  const H = TOPPAD + sil.top.px[1] + GAP + sil.rear.px[1] + 4;
  const svg = el('svg', { class: 'tfx-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Talos from above and from behind, with its frames' }, views);
  const panels = [
    { key: 'top', s: sil.top, y0: TOPPAD, label: 'From above, bow up', uv: (p) => [-p[1], p[0]] },
    { key: 'rear', s: sil.rear, y0: TOPPAD + sil.top.px[1] + GAP, label: 'From behind', uv: (p) => [-p[1], p[2]] },
  ];
  const toPx = (P, p) => {
    const [u, v] = P.uv(p), s = P.s;
    return [((u - s.u[0]) / (s.u[1] - s.u[0])) * s.px[0], P.y0 + ((s.v[1] - v) / (s.v[1] - s.v[0])) * s.px[1]];
  };
  for (const P of panels) {
    el('image', { href: BASE + 'img/localization/' + P.s.file, x: 0, y: P.y0, width: P.s.px[0], height: P.s.px[1] }, svg);
    const t = el('text', { class: 'tfx-vlabel', x: 2, y: P.y0 - 7 }, svg);
    t.textContent = P.label;
    const r = el('text', { class: 'tfx-vlabel side', x: W - 2, y: P.y0 - 7, 'text-anchor': 'end' }, svg);
    r.textContent = 'port ←   → starboard';
  }
  const gDots = el('g', {}, svg), gSel = el('g', {}, svg);
  const dots = [];
  for (const [f, T] of inOrigin) {
    for (const P of panels) {
      const [x, y] = toPx(P, T.t);
      const c = el('circle', { class: 'tfx-dot', cx: x.toFixed(1), cy: y.toFixed(1), r: 4.5 }, gDots);
      dots.push({ f, x, y, c });
    }
  }
  const note = el('text', { class: 'tfx-vnote', x: W / 2, y: TOPPAD + sil.top.px[1] / 2, 'text-anchor': 'middle' }, svg);

  function drawSelection(f) {
    gSel.innerHTML = '';
    dots.forEach((d) => d.c.classList.toggle('on', d.f === f));
    const T = inOrigin.get(f);
    note.textContent = T ? '' : 'Not on Talos: this frame is in the pool';
    svg.classList.toggle('off', !T);
    if (!T) return;
    const L = 0.1; // m
    for (const P of panels) {
      const [x0, y0] = toPx(P, T.t);
      AX.forEach(([name, v], i) => {
        const a = qrot(T.q, [0, 0, 0].map((_, k) => (k === i ? L : 0)));
        const [x1, y1] = toPx(P, T.t.map((c, k) => c + a[k]));
        const len = Math.hypot(x1 - x0, y1 - y0), col = css(v);
        if (len < 6) { // pointing at or away from the viewer
          el('circle', { cx: x0, cy: y0, r: 11 + i * 3, fill: 'none', stroke: col, 'stroke-width': 2 }, gSel);
          return;
        }
        const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
        el('line', { x1: x0, y1: y0, x2: x1 - ux * 7, y2: y1 - uy * 7, stroke: col, 'stroke-width': 3.2, 'stroke-linecap': 'round' }, gSel);
        el('path', { d: `M${x1},${y1} L${x1 - ux * 11 - uy * 5},${y1 - uy * 11 + ux * 5} L${x1 - ux * 11 + uy * 5},${y1 - uy * 11 - ux * 5}Z`, fill: col }, gSel);
        const lt = el('text', { class: 'tfx-axl', x: x1 + ux * 9, y: y1 + uy * 9 + 4, 'text-anchor': 'middle', fill: col }, gSel);
        lt.textContent = name;
      });
      el('circle', { class: 'tfx-dot on', cx: x0, cy: y0, r: 7 }, gSel);
    }
  }
  svg.addEventListener('pointerdown', (e) => {
    const r = svg.getBoundingClientRect(), k = W / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    let best = null, bd = 22 * k;
    for (const d of dots) {
      const dd = Math.hypot(d.x - x, d.y - y) - (rank(d.f) < 50 ? 3 : 0); // ties go to sensors over thrusters
      if (dd < bd) { bd = dd; best = d; }
    }
    if (best) select(best.f, 'views');
  });

  // ---------------------------------------------------------------- tree
  const rows = new Map();
  const open = new Set(OPEN);
  // On a phone the tree has no scroll box of its own: start with talos/origin's ~40 frames folded away.
  if (matchMedia('(max-width: 760px)').matches) open.delete('talos/origin');
  function rowFor(name, depth) {
    const li = document.createElement('li');
    li.setAttribute('role', 'treeitem');
    const row = document.createElement('div');
    row.className = 'tfx-row';
    row.style.paddingLeft = `${0.2 + depth * 0.85}rem`;
    const ch = kids.get(name) || [];
    const e = edges.get(name);
    const tog = document.createElement('button');
    tog.type = 'button';
    tog.className = 'tfx-tog';
    if (ch.length) {
      tog.setAttribute('aria-label', `Show or hide the ${count(name)} frames below ${name}`);
      tog.onclick = (ev) => { ev.stopPropagation(); open.has(name) ? open.delete(name) : open.add(name); render(); };
    } else tog.disabled = true;
    const lab = document.createElement('button');
    lab.type = 'button';
    lab.className = 'tfx-name';
    lab.innerHTML = `<span>${esc(name).replace(/([/_])/g, '$1<wbr>')}</span>`
      + (ch.length && !open.has(name) ? `<small class="tfx-more">+${count(name)}</small>` : '')
      + (e ? `<small class="tfx-badge ${e.static ? 'st' : ''}">${e.static ? 'static' : Math.round(e.rate_hz * 10) / 10 + ' Hz'}</small>` : '<small class="tfx-badge root">root</small>');
    lab.onclick = () => select(name, 'tree');
    row.append(tog, lab);
    if (ch.length) row.classList.add(open.has(name) ? 'is-open' : 'is-shut');
    li.appendChild(row);
    rows.set(name, row);
    if (ch.length && open.has(name)) {
      const ul = document.createElement('ul');
      ul.setAttribute('role', 'group');
      ch.forEach((c) => ul.appendChild(rowFor(c, depth + 1)));
      li.appendChild(ul);
    }
    return li;
  }
  const roots = tf.roots.slice().sort((a, b) => (a === 'world' ? -1 : b === 'world' ? 1 : 0));
  function render() {
    rows.clear();
    const ul = document.createElement('ul');
    roots.forEach((r) => ul.appendChild(rowFor(r, 0)));
    tree.replaceChildren(ul);
    if (selected) {
      rows.get(selected)?.classList.add('on');
      placeCard(lastFrom);
    }
  }

  // ---------------------------------------------------------------- card
  const narrow = matchMedia('(max-width: 760px)');
  let selected = null, lastFrom = 'views';
  function placeCard(from) {
    if (!narrow.matches) { if (card.parentElement !== side || side.firstChild !== card) side.prepend(card); return; }
    if (from === 'tree' && rows.get(selected)) rows.get(selected).after(card);
    else views.after(card);
  }
  narrow.addEventListener('change', () => placeCard(lastFrom));
  const f3 = (v) => (Math.abs(v) < 5e-5 ? '0' : v.toFixed(Math.abs(v) >= 1 ? 2 : 3));
  const fdeg = (v) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1)) + '°';
  function select(name, from) {
    selected = name; lastFrom = from;
    for (let p = edges.get(name)?.parent; p; p = edges.get(p)?.parent) open.add(p);
    render();
    drawSelection(name);
    const e = edges.get(name);
    let h = `<h3><code>${esc(name)}</code></h3>`;
    if (e) {
      const [r, p, y] = rpy(e.sample.quat_xyzw);
      h += `<p class="tfx-from">in <button type="button" class="tfx-jump" data-f="${esc(e.parent)}"><code>${esc(e.parent)}</code></button> · ${e.static ? 'static' : `${Math.round(e.rate_hz * 10) / 10} Hz`} · ${publisher(e)}</p>`;
      // A transform that moves (the EKF's pose, the map, Nereus's truth): say so before the numbers, which are one
      // mid-run snapshot, not a normal pose.
      const moving = !e.static && !/joint states/.test(publisher(e));
      if (moving) h += '<p class="tfx-from tfx-moving"><b>Changes continuously.</b> One sample from the Nereus capture, mid-run:</p>';
      h += `<table class="tfx-off${moving ? ' sample' : ''}"><tr><th></th><th>x</th><th>y</th><th>z</th></tr><tr><th>m</th>${e.sample.xyz.map((v) => `<td>${f3(v)}</td>`).join('')}</tr>`
        + `<tr><th></th><th>roll</th><th>pitch</th><th>yaw</th></tr><tr><th></th><td>${fdeg(r)}</td><td>${fdeg(p)}</td><td>${fdeg(y)}</td></tr></table>`;
      if (!e.static && !moving) h += '<p class="tfx-from">Re-sent with the joint states, which stay at zero, so the value never changes.</p>';
    } else h += '<p class="tfx-from">A root: it has no parent in this capture.</p>';
    h += `<p>${about(name)}</p>`;
    if (links[name]) h += `<p class="tfx-src"><a href="${links[name]}">Its pose in talos.yaml</a></p>`;
    card.innerHTML = h;
    card.querySelector('.tfx-jump')?.addEventListener('click', (ev) => select(ev.currentTarget.dataset.f, from));
    // On a wide screen the tree scrolls in its own box: bring a frame picked on the drawing into view there.
    const row = rows.get(name);
    if (from === 'views' && !narrow.matches && row) {
      const rb = row.getBoundingClientRect(), tb = tree.getBoundingClientRect();
      if (rb.top < tb.top || rb.bottom > tb.bottom) tree.scrollTop += rb.top - tb.top - tb.height / 3;
    }
  }
  render();
  select('talos/base_link', 'views');
  return { select };
}
