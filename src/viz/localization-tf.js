// The TF explorer for the localization chapter: Talos drawn from above and from behind (CAD silhouettes,
// tools/localization/silhouettes.py) with one labelled group of frames at a time, a small chain for the frames in the
// pool, a card for the chosen transform, and the whole TF tree (public/data/rosgraph/tf.json, captured in Nereus).
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
  odom: 'Where the EKF\'s adding-up started: x, y and heading are zero wherever <code>base_link</code> was when the EKF came up. Its z is the depth sensor\'s: 0 at the surface, negative below. <code>world → odom</code> is a static identity ("until we get SLAM").',
  map: 'The course. <code>world → map</code> comes from the AprilTag calibration (chameleon_tf\'s <code>world_to_map</code>), x, y and yaw only; identity until then. In Nereus it stays identity because Talos starts at the map origin.',
  offset: 'Mapping\'s correction: where the course really sits relative to the prior map, a pure translation learned from detections. Every course object below it moves with it (<a href="perception/frames.html">Frames, targets and the mission tree</a>).',
  'talos/base_link': 'The body: the frame that "is" Talos, x forward, y port, z up. The EKF publishes <code>odom → talos/base_link</code>, set to 30 Hz; in this sim capture it reached about 20 Hz because the laptop was busy. Velocities in <code>odometry/filtered</code> are in these axes.',
  'talos/origin': 'The CAD datum: the farthest-port screw on the front of the camera cage (<code>talos.yaml</code>, line 1). Every pose in <code>talos.yaml</code> is measured from it; <code>base_link</code> is 14 cm behind, 3 cm to port and 9 cm below it.',
  'talos/base_inertia': 'The centre of mass, measured with everything on: 1 cm behind, 0.7 cm to port and 7.7 cm above <code>base_link</code>.',
  'talos/imu_link': 'The VN-100 IMU, mounted upside down and turned −90° (roll 180°, yaw −90°). Fixed joint, so on <code>/tf_static</code>.',
  'talos/imu_revolute_link': 'A second copy of the IMU pose on a zero-range revolute joint, re-sent on <code>/tf</code>.',
  'talos/dvl_link': 'The DVL, turned −45° and 16 cm below <code>base_link</code>. A zero-range revolute joint, so it is on <code>/tf</code>, not <code>/tf_static</code>: a bag tool that reads only statics won\'t find it.',
  'talos/pressure_link': 'The Bar02 depth sensor, in the starboard lid (<a href="sensors.html#depth">depth</a>), 13.5 cm above <code>base_link</code>. <code>depth_converter.py</code> looks up this offset once and turns it with the attitude to give <code>base_link</code>\'s depth.',
  'talos/fog_link': 'The fibre-optic gyro. Its pose is all zeros, so it sits on <code>talos/origin</code>: for a gyro only the axis matters, and every point of a rigid body turns at the same rate.',
  'talos/ffc_base_link': 'The forward ZED X Mini\'s body centre, from <code>talos.yaml</code>. The frames below come from the zed_wrapper\'s own description.',
  'talos/dfc_base_link': 'The downward ZED X Mini\'s body centre, turned to look straight down.',
  'talos/pose_sensor_link': 'A ground-truth pose sensor mount left in <code>robot_sensors.xacro</code> from an older simulator. Nothing in the current stack uses it.',
  'talos/hitch_link': 'An actuator mount from <code>talos.yaml</code>, all zeros, so it sits on <code>talos/origin</code>. Nothing uses it.',
  'tag36h11:0': 'The AprilTag (family 36h11, id 0, 0.508 m), published by apriltag_ros when the forward camera sees it. Disconnected in this capture: the tag was out of view, so TF had no camera → tag link.',
  estimated_origin_frame: 'A fixed 0.4572 m (18 in) from the tag: the point the course map is measured from. The tag calibration copies <code>world → estimated_origin_frame</code> into <code>world → map</code>.',
  'simulator/talos/base_link': 'Nereus\'s truth: where Talos really is. Sim only, a separate branch so the viewer can draw truth and the EKF\'s estimate side by side.',
};
function about(name) {
  if (ABOUT[name]) return ABOUT[name];
  let m;
  if ((m = name.match(/^talos\/thruster_(\d)$/))) {
    const n = THR[+m[1]];
    const what = { V: 'vector: pushes fore and aft', H: 'heave: tilted 45°, so it pushes up and down and sideways' }[n[0]];
    return `Thruster ${m[1]} is <b>${n}</b> in <code>talos.yaml</code> (<a href="glossary.html#term-thruster-names">thruster names</a>): ${what}; ${n[1] === 'U' ? 'upper' : 'lower'}; ${n[2] === 'P' ? 'port' : 'starboard'}. The frame is where it pushes, along its x axis. The MPC's allocation uses the same poses (<a href="control/thrusters.html">Thrusters and allocation</a>). Continuous joint, so on <code>/tf</code>.`;
  }
  if (/optical_frame$/.test(name)) return 'A camera optical frame: z out of the lens, x right, y down in the image. Detections are reported in it, and TF carries them to the body and the course.';
  if (/_camera_link$/.test(name)) return 'The ZED\'s mounting point, 16 mm below the body centre along the camera\'s z (zed_wrapper\'s description).';
  if (/^talos\/(acoustics)/.test(name)) return 'One of two hydrophone poses kept in <code>talos.yaml</code> from the old two-hydrophone design. Talos now has a single hydrophone (pinger and IVC receive); nothing uses these frames (<a href="sensors.html#acoustics">acoustics</a>).';
  if (/^talos\/(claw|poker)/.test(name)) return 'An actuator\'s working point, so autonomy can line it up on a target (<a href="actuators.html">Torpedoes, dropper and claw</a>). It is where the tool acts, ahead of the frame, so the dot sits outside the drawn outline.';
  if (/^talos\/magnet/.test(name)) return 'An actuator\'s working point, so autonomy can line it up over a target (<a href="actuators.html">Torpedoes, dropper and claw</a>). It is where the magnet acts, below the frame, so the dot sits outside the drawn outline.';
  if (/^talos\/(torpedo|droppers)/.test(name)) return 'An actuator: where it fires or drops from, so autonomy can line it up on a target (<a href="actuators.html">Torpedoes, dropper and claw</a>).';
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
const OPEN = new Set(['world', 'odom', 'talos/base_link', 'tag36h11:0']);

// The drawing shows one group of frames at a time, each dot labelled. Everything else is in the tree.
const T = (i) => `talos/thruster_${i}`;
const THR = ['VUS', 'VUP', 'HUS', 'HUP', 'HLS', 'HLP', 'VLS', 'VLP']; // talos.yaml's names, thruster 0 to 7
const GROUPS = [
  { k: 'sensors', name: 'Sensors', frames: ['talos/base_link', 'talos/origin', 'talos/fog_link', 'talos/base_inertia', 'talos/imu_link', 'talos/dvl_link', 'talos/pressure_link', 'talos/ffc_base_link', 'talos/dfc_base_link'] },
  { k: 'thrusters', name: 'Thrusters', frames: [0, 1, 2, 3, 4, 5, 6, 7].map(T) },
  { k: 'actuators', name: 'Actuators', frames: ['talos/torpedo_link', 'talos/droppers_link', 'talos/claw_link', 'talos/magnet_link', 'talos/poker_link'] },
  { k: 'pool', name: 'In the pool', frames: ['world', 'odom', 'map', 'offset', 'simulator/talos/base_link', 'tag36h11:0', 'estimated_origin_frame'] },
];
const SHORT = {
  'talos/base_link': 'base_link', 'talos/origin': 'origin', 'talos/fog_link': 'FOG', 'talos/base_inertia': 'COM', 'talos/imu_link': 'IMU',
  'talos/dvl_link': 'DVL', 'talos/pressure_link': 'depth', 'talos/ffc_base_link': 'ffc', 'talos/dfc_base_link': 'dfc',
  'talos/torpedo_link': 'torpedoes', 'talos/droppers_link': 'droppers', 'talos/claw_link': 'claw', 'talos/magnet_link': 'magnet', 'talos/poker_link': 'poker',
};
const short = (f) => SHORT[f] || (f.match(/thruster_(\d)$/) ? THR[+f.slice(-1)] : f.replace(/^talos\//, ''));

export function createTfExplorer({ groups: groupHost, views, chain, tree, card, all, tf, sil, links }) {
  const edges = new Map(tf.edges.map((e) => [e.child, e]));
  const kids = new Map();
  for (const e of tf.edges) {
    if (!kids.has(e.parent)) kids.set(e.parent, []);
    kids.get(e.parent).push(e.child);
  }
  for (const [, v] of kids) v.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'en', { numeric: true }));
  const count = (n) => (kids.get(n) || []).reduce((s, c) => s + 1 + count(c), 0);
  const ancestors = (n) => { const out = []; for (let p = edges.get(n)?.parent; p; p = edges.get(p)?.parent) out.push(p); return out; };

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

  // ---------------------------------------------------------------- group chips
  groupHost.innerHTML = GROUPS.map((g) => `<button type="button" data-k="${g.k}" aria-pressed="false">${g.name}</button>`).join('');
  const groupOf = (f) => GROUPS.find((g) => g.frames.includes(f))?.k || (inOrigin.has(f) ? null : 'pool');
  let group = 'sensors';
  groupHost.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) select(GROUPS.find((g) => g.k === b.dataset.k).frames[0], 'chips');
  });

  // ---------------------------------------------------------------- drawings
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const AX = [['x', '--s8'], ['y', '--s6'], ['z', '--state']];
  const GAP = 52, TOPPAD = 40;
  const W = sil.top.px[0];
  // A few frames sit outside the CAD outline (the claw's and poker's points ahead of it, the magnet's below it): when
  // they are shown, the view grows to hold them, with the outline drawn where it belongs inside it.
  const svg = el('svg', { class: 'tfx-svg', role: 'img', 'aria-label': 'Talos from above and from behind, with the chosen frames' }, views);
  const panels = [
    { key: 'top', uv: (p) => [-p[1], p[0]], label: 'From above, bow up' },
    { key: 'rear', uv: (p) => [-p[1], p[2]], label: 'From behind' },
  ];
  for (const P of panels) {
    P.s = sil[P.key];
    P.ppm = P.s.px[1] / (P.s.v[1] - P.s.v[0]);
    P.img = el('image', { href: BASE + 'img/localization/' + P.s.file, x: 0, width: P.s.px[0], height: P.s.px[1] }, svg);
    P.t = el('text', { class: 'tfx-vlabel', x: 2 }, svg);
    P.t.textContent = P.label;
    P.r = el('text', { class: 'tfx-vlabel side', x: W - 2, 'text-anchor': 'end' }, svg);
    P.r.textContent = 'port ←  → starboard';
  }
  function layout(frames, sel) {
    let y = TOPPAD;
    // the chosen frame's axis tips (0.1 m, plus room for the letter) must fit too
    const S = inOrigin.get(sel);
    const tips = S ? [0, 1, 2].map((i) => qrot(S.q, [0, 0, 0].map((_, j) => (j === i ? 0.13 : 0))).map((c, j) => c + S.t[j])) : [];
    for (const P of panels) {
      P.v0 = P.s.v[0]; P.v1 = P.s.v[1];
      for (const f of frames) {
        const T0 = inOrigin.get(f);
        if (!T0) continue;
        const v = P.uv(T0.t)[1];
        P.v0 = Math.min(P.v0, v - 0.03); P.v1 = Math.max(P.v1, v + 0.03);
      }
      for (const t of tips) { const v = P.uv(t)[1]; P.v0 = Math.min(P.v0, v); P.v1 = Math.max(P.v1, v); }
      P.h = (P.v1 - P.v0) * P.ppm;
      P.y0 = y;
      P.img.setAttribute('y', P.y0 + (P.v1 - P.s.v[1]) * P.ppm);
      y += P.h + GAP;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${y - GAP + 4}`);
  }
  const toPx = (P, p) => {
    const [u, v] = P.uv(p), s = P.s;
    return [((u - s.u[0]) / (s.u[1] - s.u[0])) * s.px[0], P.y0 + (P.v1 - v) * P.ppm];
  };
  const gOver = el('g', {}, svg);
  let hits = []; // [{fs, x, y}] tappable dots in svg units
  let labHits = []; // [{fs, b: [x0, y0, x1, y1]}] label boxes in svg units

  // Where a label can go around its dot: right, left, above, below, then the diagonals, at growing distances.
  const DIRS = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [-1, -1], [1, 1], [-1, 1]];
  function drawBody(visible, sel) {
    layout(visible, sel);
    gOver.innerHTML = '';
    hits = []; labHits = [];
    const sw = svg.getBoundingClientRect().width;
    if (!sw) return;
    const k = W / sw; // svg units per screen px
    const fs = 12.5 * k, rDot = 6 * k;
    for (const { y0, t, r } of panels) {
      t.setAttribute('y', y0 - 9 * k); r.setAttribute('y', y0 - 9 * k);
      t.style.fontSize = `${12.5 * k}px`; r.style.fontSize = `${11.5 * k}px`;
    }
    const gDots = el('g', {}, gOver), gLines = el('g', {}, gOver), gSel = el('g', {}, gOver), gLabels = el('g', {}, gOver);
    // The selected frame's axes: worked out first, so the labels can keep clear of them.
    const T0 = inOrigin.get(sel), L = 0.1; // m
    const axes = new Map(panels.map((P) => [P, []]));
    if (T0) for (const P of panels) {
      const [x0, y0] = toPx(P, T0.t);
      AX.forEach(([name, v], i) => {
        const a = qrot(T0.q, [0, 0, 0].map((_, j) => (j === i ? L : 0)));
        const [x1, y1] = toPx(P, T0.t.map((c, j) => c + a[j]));
        axes.get(P).push({ name, v, i, x0, y0, x1, y1 });
      });
    }
    for (const P of panels) {
      // points along each drawn axis (and its letter), which a label must not cover
      const pts = [];
      for (const a of axes.get(P)) {
        const len = Math.hypot(a.x1 - a.x0, a.y1 - a.y0);
        if (len < 6 * k) continue;
        const n = Math.ceil(len / (4 * k)) + 3;
        for (let j = 0; j <= n; j++) pts.push([a.x0 + ((a.x1 - a.x0) * j) / (n - 3), a.y0 + ((a.y1 - a.y0) * j) / (n - 3)]);
      }
      // Dots that land on the same spot in this view share one dot and one label ("origin · FOG").
      const spots = [];
      for (const f of visible) {
        const T0 = inOrigin.get(f);
        if (!T0) continue;
        const [x, y] = toPx(P, T0.t);
        const near = spots.find((s) => Math.hypot(s.x - x, s.y - y) < rDot * 1.7);
        if (near) near.fs.push(f); else spots.push({ x, y, fs: [f] });
      }
      const boxes = [], top = P.y0, bot = P.y0 + P.h;
      const hitsDot = (b) => spots.some((s) => s.x > b[0] - rDot && s.x < b[2] + rDot && s.y > b[1] - rDot && s.y < b[3] + rDot)
        || pts.some(([x, y]) => x > b[0] - 2 * k && x < b[2] + 2 * k && y > b[1] - 2 * k && y < b[3] + 2 * k);
      const free = (b) => b[0] >= 2 && b[2] <= W - 2 && b[1] >= top && b[3] <= bot
        && !boxes.some((o) => b[0] < o[2] + 3 * k && b[2] > o[0] - 3 * k && b[1] < o[3] + 2 * k && b[3] > o[1] - 2 * k) && !hitsDot(b);
      // Labels go outward from the middle of the group, so neighbours' labels don't swap sides.
      const cx0 = spots.reduce((a, s) => a + s.x, 0) / (spots.length || 1), cy0 = spots.reduce((a, s) => a + s.y, 0) / (spots.length || 1);
      for (const s of spots) {
        const on = s.fs.includes(sel);
        const ox = s.x - cx0, oy = s.y - cy0, ol = Math.hypot(ox, oy);
        const dirs = ol < 4 * k ? DIRS : DIRS.slice().sort((a, b) => (b[0] * ox + b[1] * oy) / Math.hypot(...b) - (a[0] * ox + a[1] * oy) / Math.hypot(...a));
        el('circle', { class: `tfx-dot${on ? ' on' : ''}`, cx: s.x, cy: s.y, r: on ? rDot * 1.25 : rDot }, gDots);
        hits.push({ fs: s.fs, x: s.x, y: s.y });
        // One tspan per frame, so a tap on a name in a shared label ("origin · FOG") picks that frame.
        const t = el('text', { class: `tfx-lab${on ? ' on' : ''}`, 'font-size': fs }, gLabels);
        s.fs.forEach((f, j) => {
          if (j) el('tspan', {}, t).textContent = ' · ';
          const ts = el('tspan', { 'data-f': f, class: f === sel ? 'on' : '' }, t);
          ts.textContent = short(f);
        });
        const w = t.getComputedTextLength(), h = fs;
        let placed = null;
        for (let ring = 0; ring < 7 && !placed; ring++) {
          const d = rDot + 4 * k + ring * 14 * k;
          for (const [dx, dy] of dirs) {
            const cx = s.x + dx * (d + (dx ? w / 2 : 0)), cy = s.y + dy * (d + h / 2);
            const b = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2];
            if (free(b)) { placed = { b, ring }; break; }
          }
        }
        if (!placed) { const b = [s.x + rDot + 4 * k, s.y - h / 2, s.x + rDot + 4 * k + w, s.y + h / 2]; placed = { b, ring: 0 }; }
        const [x0, y0, x1, y1] = placed.b;
        boxes.push(placed.b);
        labHits.push({ fs: s.fs, b: placed.b });
        t.setAttribute('x', (x0 + x1) / 2);
        t.setAttribute('y', (y0 + y1) / 2);
        t.setAttribute('text-anchor', 'middle');
        t.setAttribute('dominant-baseline', 'central');
        // a leader from the dot to the nearest edge of its label
        const lx = Math.max(x0, Math.min(s.x, x1)), ly = Math.max(y0, Math.min(s.y, y1));
        if (Math.hypot(lx - s.x, ly - s.y) > rDot + 3 * k) el('line', { class: 'tfx-lead', x1: s.x, y1: s.y, x2: lx, y2: ly, 'stroke-width': 1.2 * k }, gLines);
      }
    }
    for (const P of panels) for (const { name, v, i, x0, y0, x1, y1 } of axes.get(P)) {
      const len = Math.hypot(x1 - x0, y1 - y0), col = css(v);
      if (len < 6 * k) { // pointing at or away from the viewer
        el('circle', { cx: x0, cy: y0, r: (11 + i * 3) * k, fill: 'none', stroke: col, 'stroke-width': 2 * k }, gSel);
        continue;
      }
      const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
      el('line', { x1: x0, y1: y0, x2: x1 - ux * 6 * k, y2: y1 - uy * 6 * k, stroke: col, 'stroke-width': 2.6 * k, 'stroke-linecap': 'round' }, gSel);
      el('path', { d: `M${x1},${y1} L${x1 - (ux * 9 + uy * 4) * k},${y1 - (uy * 9 - ux * 4) * k} L${x1 - (ux * 9 - uy * 4) * k},${y1 - (uy * 9 + ux * 4) * k}Z`, fill: col }, gSel);
      const lt = el('text', { class: 'tfx-axl', x: x1 + ux * 9 * k, y: y1 + uy * 9 * k, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: col, 'font-size': 13 * k }, gSel);
      lt.textContent = name;
    }
  }
  // A tap picks a frame by its name first (the obvious target), then by its dot. A name or dot shared by two frames
  // picks the first, then the next on a second tap.
  const pick = (fs) => select(fs.includes(selected) ? fs[(fs.indexOf(selected) + 1) % fs.length] : fs[0], 'views');
  svg.addEventListener('click', (e) => {
    const onName = e.target.closest?.('tspan[data-f]');
    if (onName) return select(onName.dataset.f, 'views');
    const r = svg.getBoundingClientRect(), k = W / r.width;
    const x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k;
    const pad = 7 * k;
    let best = null, bd = Infinity;
    for (const L of labHits) {
      const [x0, y0, x1, y1] = L.b;
      if (x < x0 - pad || x > x1 + pad || y < y0 - pad || y > y1 + pad) continue;
      const dd = Math.hypot(x - (x0 + x1) / 2, y - (y0 + y1) / 2);
      if (dd < bd) { bd = dd; best = L; }
    }
    if (best) return pick(best.fs);
    bd = 16 * k;
    for (const d of hits) {
      const dd = Math.hypot(d.x - x, d.y - y);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (best) pick(best.fs);
  });

  // ---------------------------------------------------------------- frames in the pool: a small chain
  const courseCount = count('offset');
  const CHAIN = [
    ['world', 0, 'the root'],
    ['odom', 1, 'static: the same as world'],
    ['talos/base_link', 2, 'the EKF, 30 Hz'],
    ['map', 1, 'the tag calibration'],
    ['offset', 2, 'mapping\'s correction'],
    ['course', 3, `${courseCount - 0} course frames below`],
    ['simulator/talos/base_link', 1, 'Nereus\'s truth (sim only)'],
    ['tag36h11:0', 0, 'the tag, when a camera sees it'],
    ['estimated_origin_frame', 1, '0.4572 m from the tag'],
  ];
  chain.innerHTML = CHAIN.map(([f, d, what]) => `<button type="button" class="tfx-cr" data-f="${esc(f)}" style="--d:${d}"><code>${f === 'course' ? 'gate_frame, torpedo_frame, …' : esc(f)}</code><small>${what}</small></button>`).join('');
  chain.addEventListener('click', (e) => {
    const b = e.target.closest('.tfx-cr');
    if (b) select(b.dataset.f === 'course' ? 'gate_frame' : b.dataset.f, 'chips');
  });
  function drawChain(sel) {
    const anc = ancestors(sel);
    const key = CHAIN.some(([f]) => f === sel) ? sel
      : anc.includes('offset') ? 'course' : anc.includes('simulator/talos/base_link') ? 'simulator/talos/base_link' : sel;
    chain.querySelectorAll('.tfx-cr').forEach((b) => b.classList.toggle('on', b.dataset.f === key));
  }

  // ---------------------------------------------------------------- tree
  const rows = new Map();
  const open = new Set(OPEN);
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
      tog.setAttribute('aria-expanded', String(open.has(name)));
      tog.onclick = (ev) => { ev.stopPropagation(); open.has(name) ? open.delete(name) : open.add(name); render(); };
    } else tog.disabled = true;
    const lab = document.createElement('button');
    lab.type = 'button';
    lab.className = 'tfx-name';
    const hz = e && !e.static ? Math.round(e.rate_hz * 10) / 10 : null;
    const title = name === 'talos/base_link' ? ' title="Measured in this capture; the EKF is set to 30 Hz"' : hz ? ' title="Measured in this capture"' : '';
    lab.innerHTML = `<span>${esc(name).replace(/([/_])/g, '$1<wbr>')}</span>`
      + (ch.length && !open.has(name) ? `<small class="tfx-more">+${count(name)}</small>` : '')
      + (e ? `<small class="tfx-badge ${e.static ? 'st' : ''}"${title}>${e.static ? 'static' : hz + ' Hz'}</small>` : '<small class="tfx-badge root">root</small>');
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
    if (selected) rows.get(selected)?.classList.add('on');
  }

  // ---------------------------------------------------------------- card
  const narrow = matchMedia('(max-width: 760px)');
  if (!narrow.matches) all.open = true; // a phone starts with the long tree folded away
  let selected = null;
  const f3 = (v) => (Math.abs(v) < 5e-5 ? '0' : v.toFixed(Math.abs(v) >= 1 ? 2 : 3));
  const fdeg = (v) => (Math.abs(v) < 0.05 ? '0' : v.toFixed(1)) + '°';
  function redraw() {
    const g = groupOf(selected);
    group = g;
    groupHost.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === g)));
    const pool = g === 'pool';
    views.classList.toggle('pool', pool);
    if (pool) drawChain(selected);
    else drawBody(g ? GROUPS.find((x) => x.k === g).frames : [selected], selected);
  }
  function select(name, from) {
    selected = name;
    for (const p of ancestors(name)) open.add(p);
    render();
    redraw();
    const e = edges.get(name);
    let h = `<h3><code>${esc(name)}</code></h3>`;
    if (e) {
      const [r, p, y] = rpy(e.sample.quat_xyzw);
      h += `<p class="tfx-from">in <button type="button" class="tfx-jump" data-f="${esc(e.parent)}"><code>${esc(e.parent)}</code></button> · ${e.static ? 'static' : `${Math.round(e.rate_hz * 10) / 10} Hz`} · ${publisher(e)}</p>`;
      // A transform that moves (the EKF's pose, the map, Nereus's truth): say so before the numbers, which are one
      // mid-run snapshot, not a normal pose.
      const moving = !e.static && !/joint states/.test(publisher(e));
      if (moving) h += '<p class="tfx-from tfx-moving"><b>Changes all the time.</b> One moment of the Nereus run, not a typical pose:</p>';
      h += `<table class="tfx-off${moving ? ' sample' : ''}"><tr><th></th><th>x</th><th>y</th><th>z</th></tr><tr><th>m</th>${e.sample.xyz.map((v) => `<td>${f3(v)}</td>`).join('')}</tr>`
        + `<tr><th></th><th>roll</th><th>pitch</th><th>yaw</th></tr><tr><th></th><td>${fdeg(r)}</td><td>${fdeg(p)}</td><td>${fdeg(y)}</td></tr></table>`;
      if (!e.static && !moving) h += '<p class="tfx-from">Re-sent with the joint states, which stay at zero, so the value never changes.</p>';
    } else h += '<p class="tfx-from">A root: it has no parent in this capture.</p>';
    h += `<p>${about(name)}</p>`;
    if (links[name]) h += `<p class="tfx-src"><a href="${links[name]}">Its pose in talos.yaml</a></p>`;
    card.innerHTML = h;
    card.querySelector('.tfx-jump')?.addEventListener('click', (ev) => select(ev.currentTarget.dataset.f, from));
    const row = rows.get(name);
    if (from === 'tree' && narrow.matches) {
      // The drawing and the card are above the tree on a phone: bring them back into view.
      views.closest('.tfx').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    } else if (from !== 'tree' && all.open && !narrow.matches && row) {
      // On a wide screen the tree scrolls in its own box: bring the frame into view there.
      const rb = row.getBoundingClientRect(), tb = tree.getBoundingClientRect();
      if (rb.top < tb.top || rb.bottom > tb.bottom) tree.scrollTop += rb.top - tb.top - tb.height / 3;
    }
  }
  new ResizeObserver(() => { if (selected) redraw(); }).observe(views);
  render();
  select('talos/base_link', 'chips');
  return { select };
}
