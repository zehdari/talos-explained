// The front page: "How Talos works". A 3D hero built from the team's CAD, the whole stack as one diagram,
// one torpedo shot followed through every layer, reading paths and the full chapter list.
import { setup, PARTS, url } from '../layout.js';
import '../css/chapter.css';
import '../css/index.css';
import { Graph } from '../viz/graph.js';

setup();

const BASE = import.meta.env.BASE_URL;
const GH = 'https://github.com/osu-uwrt';
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Repos and the branches Talos runs (riptide_release pins each one).
const REPO = {
  core: `${GH}/riptide_core/blob/followpath-speed`,
  control: `${GH}/riptide_control/blob/mpc`,
  perception: `${GH}/riptide_perception/blob/mapping-estimator`,
  autonomy: `${GH}/riptide_autonomy/blob/autonomy-mapping`,
  launch: `${GH}/riptide_launch/blob/newsim`,
  nereus: `${GH}/nereus/blob/main`,
  firmware: `${GH}/titan_firmware/tree/master`,
  firmwareBlob: `${GH}/titan_firmware/blob/master`,
};

// Chapter titles by href, from the site map, so every link label matches the menu.
const CH = new Map();
PARTS.forEach((p) => p.chapters.forEach((c) => CH.set(c.href, c)));
const chTitle = (href) => {
  const c = CH.get(href.split('#')[0]);
  if (!c) return href;
  if (c.n === '0') return `${c.part.tag || c.part.title}: overview`;
  return c.title;
};
const chLink = (href, label) => `<a href="${url(href)}">${esc(label || chTitle(href))}</a>`;

// ============================================================================ hero: Talos in 3D
// Systems of the CAD model (public/models/talos-cad.glb; frame: +X port, +Y up, +Z bow, metres). anchor: where the
// dot sits. side: split a node's triangles by the sign of x (the one "electronics" node holds both hull cages).
const SYSTEMS = [
  { id: 'thrusters', name: 'Thrusters', nodes: ['thruster'], anchor: [0.406, 0.244, 0.075], color: '#d9480f',
    text: 'Eight Blue Robotics T200s, all in one plane. The four at the corners push fore and aft; the four inner ones are tilted 45° and push up or down and sideways at once.',
    facts: [['Thrust', '±24 N each, 73 N total'], ['Driven by', '2 ESC boards, 4 thrusters each']],
    read: ['thrusters-hw.html', 'control/thrusters.html'] },
  { id: 'frame', name: 'Frame', nodes: ['frame', 'thruster_guards', 'foam'], anchor: [0.15, -0.205, 0.155], color: '#7d8f99',
    text: 'Four triangular corner modules joined by cross bars and braced by cables. Everything else bolts to it. Foam blocks in the modules make Talos float very slightly.',
    facts: [['Size', '925 × 639 × 582 mm'], ['Mass', '32.4 kg dry']],
    read: ['mechanical.html'] },
  { id: 'hull', name: 'Hull', nodes: ['hull'], anchor: [0.215, 0.1, 0.12], color: '#2a78d6',
    text: 'Two clear tubes with flat windows at the bow and every connector on the stern lids. Each tube\'s cage slides out of the stern. Clean the O-rings and pressure-test every time it is sealed.',
    facts: [['Port tube', 'circuit boards'], ['Starboard tube', 'computer, forward camera, IMU']],
    read: ['mechanical.html#hull'] },
  { id: 'computer', name: 'Computer', nodes: ['electronics'], side: -1, anchor: [-0.13, 0.06, 0.05], color: '#008300',
    text: 'A Jetson AGX Orin runs every ROS program on the robot: drivers, EKF, detector, mapping, behaviour trees and the MPC. The forward camera and the IMU share its cage.',
    facts: [['Software', 'ROS 2 Humble over Zenoh'], ['Started by', 'the ros_launcher web page']],
    read: ['computers.html', 'launch.html'] },
  { id: 'boards', name: 'Circuit boards', nodes: ['electronics'], side: 1, anchor: [0.123, 0.03, 0.06], color: '#008300',
    text: 'A stack of team-made boards, each with an RP2040 microcontroller running the team\'s firmware: power and the kill switch, the ESCs, lights and the acoustic modem. They talk to the Orin over CAN.',
    facts: [['Bus', 'CAN FD, can0 on the Orin'], ['Firmware', 'titan_firmware, C on the Pico SDK']],
    read: ['boards.html', 'firmware.html'] },
  { id: 'batteries', name: 'Batteries', nodes: ['batteries'], anchor: [0.274, 0.078, 0.2], color: '#eda100',
    text: 'Two sealed pods, one per side, each with a MaxAmps 8000 mAh 5S LiPo and its own protection board. Whichever pack is higher carries the bus.',
    facts: [['Each pack', '18.5 V nominal, 148 Wh'], ['Rails', '15 V, 5 V, and 12 V for the servo']],
    read: ['electrical.html'] },
  { id: 'kill_switch', name: 'Kill switch', nodes: ['kill_switch'], anchor: [0.123, 0.057, 0.2], color: '#e34948',
    text: 'The handle on the port window. Pulling it cuts power to the thrusters and nothing else, so a kill never reboots the computer. Software can kill too, through the POAC board.',
    facts: [['Cuts', 'MOTOR_PWR, the ESC supply'], ['Software kill', 'four slots; the viewer owns slot 1']],
    read: ['commanding.html', 'electrical.html#kill'] },
  { id: 'subconns', name: 'SubConns', nodes: ['subconns', 'cables'], anchor: [0.14, 0.05, -0.24], color: '#0f2633',
    text: 'Every cable reaches the inside of the hull through a SubConn wet-mate connector on a stern lid: thrusters, batteries, DVL, hydrophone. A snap-on cover protects the port lid\'s connectors. The cables are drawn in light blue.',
    facts: [['Port lid', '17 small bulkheads, 2 battery bulkheads'], ['Starboard lid', '4 bulkheads (2 DBH8F, 2 MCBH4F)']],
    read: ['mechanical.html#hull', 'electrical.html'] },
  { id: 'dvl', name: 'DVL', nodes: ['dvl'], anchor: [0, -0.25, 0.0], color: '#1baf7a',
    text: 'A Nortek DVL1000 under the middle of the robot bounces sound off the pool floor to measure Talos\'s velocity. With the IMU, the gyro and the depth sensor it feeds the EKF.',
    facts: [['Rate', '8 Hz, each reading about 125 ms old'], ['Other sensors', 'VN-100 IMU, fibre-optic gyro, Bar02 depth']],
    read: ['sensors.html', 'localization.html'] },
  { id: 'cameras', name: 'Cameras', nodes: ['down_camera'], anchor: [-0.126, -0.1, 0.0], color: '#1baf7a',
    text: 'Two ZED X Mini stereo cameras: one looks ahead through the starboard window, this one looks down through the tube wall. They give colour and depth for the detector.',
    facts: [['Image', '1920 × 1200 at 15 Hz'], ['Detector', 'YOLO on one camera at a time']],
    read: ['cameras.html', 'perception/index.html'] },
  { id: 'acoustics', name: 'Hydrophone', nodes: ['acoustics'], anchor: [-0.127, -0.29, -0.17], color: '#1baf7a',
    text: 'A hydrophone pod low at the stern listens for the competition pinger; the mission uses it to choose whether the torpedo or the table comes first. A separate transducer sends acoustic messages.',
    facts: [['In Nereus', 'not simulated']],
    read: ['sensors.html#acoustics', 'mission-tree.html'] },
  { id: 'launcher', name: 'Launcher', nodes: ['launcher'], anchor: [0.14, -0.154, 0.245], color: '#6250d6',
    text: 'Two torpedoes pointing forward and two markers pointing down, all released by one servo that the POAC board drives. The firmware won\'t fire unless Talos is enabled and the launcher armed.',
    facts: [['Servo', 'home 120°; torpedoes at 200°, 240°'], ['Markers', 'at 50°, then 0°']],
    read: ['actuators.html'] },
  { id: 'claw', name: 'Claw', nodes: ['claw', 'magnet_poker'], anchor: [0, -0.40, 0.32], color: '#6250d6',
    text: 'A servo-driven rack-and-pinion gripper under the bow carries the table objects. Beside it, a magnet on a rod; Talos flies it onto the target.',
    facts: [['Task', 'sort four objects into two baskets']],
    read: ['actuators.html#claw', 'mission-tree.html'] },
];

const heroCard = document.getElementById('th-card');
const heroChips = document.getElementById('th-chips');
let hero = null, heroSel = null;

const GLANCE = `<div class="th-glance">
  <div><b>32.4</b><span>kg dry</span></div><div><b>8</b><span>thrusters</span></div>
  <div><b>2</b><span>stereo cameras</span></div><div><b>20</b><span>Hz control loop</span></div></div>
  <p class="th-help">Tap a dot or a part of the model. Drag to turn it.</p>`;

function renderHeroCard() {
  const s = SYSTEMS.find((x) => x.id === heroSel);
  if (!s) { heroCard.innerHTML = GLANCE; return; }
  heroCard.innerHTML = `<div class="th-head"><i style="background:${s.color}"></i><b>${s.name}</b><button class="th-x" aria-label="Back to the overview">×</button></div>
    <p>${s.text}</p>
    <dl>${s.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="th-read">${s.read.map((h) => `<a href="${url(h)}">${esc(chTitle(h))} →</a>`).join('')}</div>`;
  heroCard.querySelector('.th-x').onclick = () => pickHero(null);
}
const chipEls = SYSTEMS.map((s) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'th-chip';
  b.setAttribute('aria-pressed', 'false');
  b.innerHTML = `<i style="background:${s.color}"></i>${s.name}`;
  b.onclick = () => pickHero(heroSel === s.id ? null : s.id);
  heroChips.appendChild(b);
  return b;
});
function pickHero(id) {
  heroSel = id || null;
  chipEls.forEach((b, i) => b.setAttribute('aria-pressed', String(SYSTEMS[i].id === heroSel)));
  renderHeroCard();
  hero?.select(heroSel);
  // Narrow screens stack the card under the model and the chips, often below the fold: bring it up (only if it is off screen).
  if (heroSel && matchMedia('(max-width: 1240px)').matches) {
    requestAnimationFrame(() => {
      if (heroCard.getBoundingClientRect().bottom > innerHeight) heroCard.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    });
  }
}
renderHeroCard();

// The 3D model is about 2.8 MB, more than the rest of the page together. A still of it (the poster) shows at once;
// three.js and the model load once the page has finished loading and the browser is idle. With Data Saver on, or on
// a 2G/3G connection, they wait for a tap instead.
const loadingEl = document.getElementById('th-loading');
function startHero() {
  loadingEl.textContent = 'Loading the 3D model…';
  import('three').then((THREE) => Promise.all([
    import('three/examples/jsm/controls/OrbitControls.js'),
    import('three/examples/jsm/loaders/GLTFLoader.js'),
    import('three/examples/jsm/utils/BufferGeometryUtils.js'),
    import('three/examples/jsm/environments/RoomEnvironment.js'),
  ]).then(([{ OrbitControls }, { GLTFLoader }, { toCreasedNormals }, { RoomEnvironment }]) => {
    hero = createHero(THREE, { OrbitControls, GLTFLoader, toCreasedNormals, RoomEnvironment });
    hero?.select(heroSel);
  }));
}
const conn = navigator.connection;
if (conn && (conn.saveData || /(^|-)2g$|^3g$/.test(conn.effectiveType || ''))) {
  loadingEl.innerHTML = '<button type="button" class="btn">Load the 3D model (2.8 MB)</button>';
  loadingEl.querySelector('button').addEventListener('click', startHero, { once: true });
} else {
  const idle = () => (window.requestIdleCallback ? requestIdleCallback(startHero, { timeout: 1500 }) : setTimeout(startHero, 200));
  if (document.readyState === 'complete') idle(); else addEventListener('load', idle, { once: true });
}

function createHero(THREE, { OrbitControls, GLTFLoader, toCreasedNormals, RoomEnvironment }) {
  const canvas = document.getElementById('th-canvas');
  const stage = document.getElementById('th-stage');
  const labelHost = document.getElementById('th-labels');
  const tip = document.getElementById('th-tip');
  const loading = document.getElementById('th-loading');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    // No WebGL: the poster stays, and the chips and the card still work.
    stage.classList.add('no-gl');
    loading.hidden = true;
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 30);
  const home = { target: new THREE.Vector3(0, -0.07, 0.03), dir: new THREE.Vector3(1.0, 0.5, 1.25).normalize(), dist: 2.6 };
  camera.position.copy(home.target).addScaledVector(home.dir, home.dist);
  const controls = new OrbitControls(camera, canvas);
  // OrbitControls sets touch-action: none inline, which would trap vertical swipes on the first screen of the site.
  // pan-y lets the page scroll; sideways drags still turn the model and taps still pick parts.
  canvas.style.touchAction = 'pan-y';
  controls.target.copy(home.target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.enableZoom = false; // the page scrolls with the wheel; pinch would fight the page on phones
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.7;
  controls.update();
  let touched = false;
  controls.addEventListener('start', () => { touched = true; controls.autoRotate = false; });

  scene.add(new THREE.HemisphereLight(0xf7fbfc, 0x7f9ea8, 1.15));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.45);
  fill.position.set(-3, -1, -2);
  scene.add(fill);

  const GHOST = new THREE.Color('#bfd0d4');
  const model = new THREE.Group();
  scene.add(model);
  const groups = new Map(SYSTEMS.map((s) => [s.id, { ...s, meshes: [] }]));
  const hullMeshes = [];
  const key = (n) => String(n || '').replace(/[^A-Za-z0-9-]/g, '_');
  const owner = (name, x) => {
    const k = key(name);
    if (k === 'hull') return 'hull';
    return SYSTEMS.find((s) => s.nodes.some((n) => (n === 'thruster' ? k.startsWith('thruster_') : key(n) === k)) && (!s.side || Math.sign(x) === s.side))?.id;
  };
  const splitByX = (geo) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position.array;
    const out = { 1: [], '-1': [] };
    for (let i = 0; i < pos.length; i += 9) {
      const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3;
      const dst = out[cx >= 0 ? 1 : -1];
      for (let k = 0; k < 9; k++) dst.push(pos[i + k]);
    }
    return [1, -1].map((s) => {
      const b = new THREE.BufferGeometry();
      b.setAttribute('position', new THREE.Float32BufferAttribute(out[s], 3));
      return [s, b];
    });
  };

  // Dots: HTML buttons placed over the model every frame.
  const dots = SYSTEMS.map((s) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'th-dot';
    b.style.setProperty('--c', s.color);
    b.innerHTML = `<span>${s.name}</span>`;
    b.setAttribute('aria-label', s.name);
    b.addEventListener('click', (e) => { e.stopPropagation(); pickHero(heroSel === s.id ? null : s.id); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelHost.appendChild(b);
    return { el: b, s, pos: new THREE.Vector3(...s.anchor) };
  });

  let selected = null, loaded = false;
  function applyLook() {
    for (const [id, g] of groups) {
      if (id === 'hull') continue; // glass: handled below
      const on = !selected || selected === id;
      g.meshes.forEach((m) => {
        m.material.color.copy(on ? m.userData.color : GHOST);
        const op = on ? 1 : 0.2;
        m.material.opacity = op;
        m.material.transparent = op < 1;
        m.material.depthWrite = op >= 1;
      });
    }
    // The hull is glass, a little clearer when something inside is picked.
    hullMeshes.forEach((m) => {
      const on = selected === 'hull';
      m.material.color.copy(on || !selected ? m.userData.color : GHOST);
      m.material.opacity = on ? 0.55 : selected ? 0.1 : 0.26;
    });
    dots.forEach((d) => {
      d.el.classList.toggle('on', d.s.id === selected);
      d.el.classList.toggle('dim', !!selected && d.s.id !== selected);
    });
  }

  new GLTFLoader().load(`${BASE}models/talos-cad.glb`, (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.name || o.parent?.name;
      const c0 = o.material.color, color = new THREE.Color().setRGB(c0.r, c0.g, c0.b, THREE.SRGBColorSpace);
      const world = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const isElec = key(name) === 'electronics' || key(o.parent?.name) === 'electronics';
      const parts = isElec ? splitByX(world) : [[0, world]];
      parts.forEach(([side, geo]) => {
        const id = owner(isElec ? 'electronics' : name, side || 1) || owner(o.parent?.name, side || 1);
        const isHull = id === 'hull';
        const mat = new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: isHull ? 0.15 : 0.6, envMap, envMapIntensity: isHull ? 0.8 : 0.35, side: THREE.DoubleSide, transparent: isHull, opacity: isHull ? 0.26 : 1, depthWrite: !isHull });
        const mesh = new THREE.Mesh(toCreasedNormals(geo, (35 * Math.PI) / 180), mat);
        mesh.userData = { id, color };
        if (isHull) { mesh.renderOrder = 5; hullMeshes.push(mesh); }
        if (id && groups.has(id)) groups.get(id).meshes.push(mesh);
        model.add(mesh);
      });
    });
    // Each dot sits on its system: the anchor, or the centre of the split half for the two cages.
    dots.forEach((d) => {
      const g = groups.get(d.s.id);
      if (!d.s.side || !g.meshes.length) return;
      const box = new THREE.Box3();
      g.meshes.forEach((m) => { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); });
      box.getCenter(d.pos);
    });
    loaded = true;
    loading.hidden = true;
    stage.classList.add('ready');
    applyLook();
  }, undefined, () => { loading.textContent = 'The 3D model did not load.'; });

  // Picking: a tap (not a drag) selects what's under the finger; the glass hull only if nothing is behind it.
  const ray = new THREE.Raycaster();
  const ndc = (e) => {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  function hit(e) {
    if (!loaded) return null;
    ray.setFromCamera(ndc(e), camera);
    const hits = ray.intersectObjects(model.children, false);
    const solid = hits.find((h) => h.object.userData.id && h.object.userData.id !== 'hull');
    return solid?.object.userData.id || hits[0]?.object.userData.id || null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 700) return;
    const id = hit(e);
    pickHero(id && id === heroSel ? null : id);
  });
  let hoverEv = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) { tip.hidden = true; return; }
    hoverEv = e;
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; hoverEv = null; canvas.style.cursor = ''; });
  function doHover() {
    const e = hoverEv;
    hoverEv = null;
    const id = hit(e);
    const s = id && SYSTEMS.find((x) => x.id === id);
    canvas.style.cursor = s ? 'pointer' : '';
    if (!s) { tip.hidden = true; return; }
    const r = stage.getBoundingClientRect();
    tip.textContent = s.name;
    tip.hidden = false;
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top - 12}px)`;
  }

  // On a wide screen the copy sits on the left: draw the robot right of centre.
  let wide = false;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    wide = w > 900;
    if (wide) camera.setViewOffset(w, h, -w * 0.2, h * 0.03, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    if (!touched) {
      // Fit the robot across narrow views (vertical fov is fixed; a tall view needs more distance).
      const dist = home.dist * Math.max(1, 1.05 / Math.max(camera.aspect, 0.4)) * (wide ? 1 : 0.92);
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, dist);
    }
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const tmp = new THREE.Vector3();
  function place(d, w, h) {
    tmp.copy(d.pos).project(camera);
    const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
    const off = tmp.z > 1 || x < 8 || x > w - 8 || y < 8 || y > h - 8;
    d.el.style.visibility = off || !loaded ? 'hidden' : '';
    d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-7px, -50%)`;
  }
  const goal = home.target.clone();
  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    controls.target.lerp(goal, 0.08);
    controls.update();
    renderer.render(scene, camera);
    if (hoverEv) doHover();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    dots.forEach((d) => place(d, w, h));
  });

  return {
    select(id) {
      selected = id || null;
      const d = dots.find((x) => x.s.id === selected);
      // Ease the view a little toward the picked system, not all the way (it should stay the whole robot).
      if (d) goal.copy(home.target).lerp(d.pos, 0.4); else goal.copy(home.target);
      if (selected) { controls.autoRotate = false; }
      if (loaded) applyLook();
    },
  };
}

// ============================================================================ the whole stack
// Nodes of the stack diagram. Desktop: a loop, data up the left, commands down the right. Phones: a list of layers.
const N = {
  viewer: { label: 'Nereus viewer', sub: 'operator laptop', layer: 'Operator', runs: 'The operator laptop (op-top), or yours',
    text: 'The team\'s GUI for the simulator and the robot alike. Its Enable / KILL button owns software kill slot 1. It drives Talos, starts trees, shows the cameras and the map, and talks to Talos only over ROS 2.',
    topics: [['command/software_kill', '20 Hz in Nereus'], ['controller/linear, controller/angular', 'goals, when you drive']],
    code: [`${REPO.nereus}/docs/viewer.md`, 'nereus · docs/viewer.md'], read: ['viewer.html', 'commanding.html'] },
  tree: { label: 'Behaviour tree', sub: 'doTask · 30 ms tick', layer: 'Autonomy', runs: 'The Orin',
    text: 'doTask walks an XML behaviour tree about every 30 ms. For RoboSub that is RepairCompMpcTree.xml: tell mapping what to look for, wait until it is sure, then move and act on that estimate. A task that fails never stops the run.',
    topics: [['follow_path (action)', 'paths for the MPC'], ['controller/linear, controller/angular', 'single setpoints'], ['autonomy/tree_stack', 'what is running']],
    code: [`${REPO.autonomy}/src/riptide_autonomy/DoTask.cpp`, 'riptide_autonomy · DoTask.cpp'], read: ['bt.html', 'mission-tree.html'] },
  translator: { label: 'Actuator translator', sub: 'service → topic', layer: 'Autonomy', runs: 'The Orin',
    text: 'actuator_service_translator turns the tree\'s actuator service calls (arm, fire a torpedo, drop a marker) into the command topics the POAC board listens to, and its replies back into service results.',
    topics: [['command/actuator/torpedo, dropper, arm', 'commands'], ['state/actuator/cmd_status', 'the board\'s yes or no']],
    code: [`${REPO.core}/riptide_hardware/riptide_hardware2/actuator_service_translator.py`, 'riptide_core · actuator_service_translator.py'], read: ['actuators.html#ros'] },
  mapping: { label: 'Mapping', sub: 'a filter per prop', layer: 'Mapping', runs: 'The Orin',
    text: 'Gives every detection a covariance, keeps one Kalman filter per prop plus one shared offset for the whole course, and publishes each prop as a TF frame with how sure it is. The tree tells it which props to update and when to freeze.',
    topics: [['TF: torpedo_frame, fire_hole_large_frame …', 'about 7.5 Hz in Nereus'], ['mapping/<prop>', 'pose + covariance']],
    code: [`${REPO.perception}/riptide_mapping/riptide_mapping2/mapping.py`, 'riptide_perception · mapping.py'], read: ['perception/tracking.html', 'perception/map.html', 'perception/frames.html'] },
  mpc: { label: 'MPC', sub: 'riptide_mpc · 20 Hz', layer: 'Control', runs: 'The Orin',
    text: 'Every 50 ms it plans thrust for all eight thrusters 1.5 s ahead with a physics model of Talos, sends the first 50 ms and starts over. It builds its own on-time state from the IMU, gyro, DVL and depth sensor; the EKF anchors x, y and heading.',
    topics: [['thruster_forces', '20 Hz in Nereus'], ['RPM to the ESC boards', 'raw CAN frames, 20 Hz'], ['controller/scale/trust', 'has it settled?']],
    simTopics: [['thruster_forces', '20 Hz, to the simulator'], ['controller/scale/trust', 'has it settled?']],
    code: [`${REPO.control}/riptide_mpc/src/mpc_controller_node.cpp`, 'riptide_control · mpc_controller_node.cpp'], read: ['control/index.html', 'commanding.html'] },
  detector: { label: 'Detector', sub: 'YOLO · about 10 Hz', layer: 'Perception', runs: 'The Orin (GPU)',
    text: 'yolo_orientation runs a YOLO segmentation model on the active camera, then turns each mask plus depth into a 3D position and facing. Props made of several pieces, like the torpedo board, are assembled here.',
    topics: [['detected_objects', '9–11 Hz in Nereus']],
    code: [`${REPO.perception}/tensor_detector/src/yolo_orientation.py`, 'riptide_perception · yolo_orientation.py'], read: ['perception/detector.html', 'perception/pose.html', 'perception/training.html'] },
  tag: { label: 'AprilTag + chameleon_tf', sub: 'world → map', layer: 'Perception', runs: 'The Orin',
    text: 'An AprilTag detector on the forward camera. A tag calibration before the run sets the world → map transform, which ties the robot\'s odometry to the course map.',
    topics: [['TF world → map', 'static, set by calibration']],
    code: [`${REPO.core}/riptide_hardware/launch/apriltag.launch.py`, 'riptide_core · apriltag.launch.py'], read: ['localization.html', 'perception/map.html'] },
  ekf: { label: 'EKF', sub: 'robot_localization · 30 Hz', layer: 'State estimation', runs: 'The Orin',
    text: 'An extended Kalman filter fuses the IMU, gyro, DVL and depth into one estimate of position, attitude and velocity. Depth, roll and pitch are measured outright; x, y and heading are added up from zero, so they drift.',
    topics: [['odometry/filtered', '30 Hz'], ['TF odom → talos/base_link', 'about 20 Hz in Nereus']],
    code: [`${REPO.core}/riptide_hardware/cfg/talos_ekf.yaml`, 'riptide_core · talos_ekf.yaml'], read: ['localization.html'] },
  drivers: { label: 'Sensor drivers', sub: 'VectorNav · FOG · DVL', layer: 'Drivers', runs: 'The Orin',
    text: 'ROS nodes that read the IMU, the fibre-optic gyro and the DVL and publish them as topics. depth_converter turns the board\'s raw depth into a pose for the EKF.',
    topics: [['vectornav/imu', '400 Hz'], ['gyro/twist', 'about 475 Hz'], ['dvl_twist', '8 Hz'], ['depth/pose', '20 Hz']],
    code: [`${REPO.core}/riptide_hardware/launch/hardware.launch.py`, 'riptide_core · hardware.launch.py'], read: ['sensors.html'] },
  zed: { label: 'ZED wrapper', sub: 'one node per camera', layer: 'Drivers', runs: 'The Orin (GPU)',
    text: 'One ZED node per camera grabs frames, rectifies them with the underwater calibration and computes stereo depth on the GPU.',
    topics: [['ffc/zed_node/rgb/image_rect_color', '15 Hz'], ['depth image', 'same moment as the colour image']],
    code: [`${REPO.core}/riptide_hardware/launch/zed.launch.py`, 'riptide_core · zed.launch.py'], read: ['cameras.html', 'perception/calibration.html'] },
  agent: { label: 'micro-ROS agent', sub: 'CAN ↔ ROS 2', layer: 'Drivers', runs: 'The Orin',
    text: 'copro_agent bridges every board on the CAN bus (can0) into ordinary ROS topics: kill state, depth, actuator commands and status. The MPC\'s thruster commands skip it and go onto CAN raw.',
    topics: [['state/kill', 'from the POAC'], ['state/depth/raw', '20 Hz from the camera cage board']],
    code: [`${REPO.core}/riptide_hardware/launch/copro_agent.launch.py`, 'riptide_core · copro_agent.launch.py'], read: ['firmware.html#microros', 'computers.html#can'] },
  ccbb: { label: 'Camera cage board', sub: 'RP2040 · depth', layer: 'Firmware', runs: 'Its own RP2040',
    text: 'Powers the Orin and the DVL, reads the Bar02 depth sensor over I²C every 50 ms and joins the Orin to CAN.',
    topics: [['state/depth/raw', '20 Hz']],
    code: [`${REPO.firmware}/talos/CameraCageBB`, 'titan_firmware · talos/CameraCageBB'], read: ['boards.html#ccbb', 'firmware.html#depth'] },
  poac: { label: 'POAC board', sub: 'RP2040 · power, kill', layer: 'Firmware', runs: 'Its own RP2040',
    text: 'Power and actuator board. Both batteries in, 15 V, 5 V and 12 V (servo) out, and thruster power only while the hull switch and the software kill slots allow it. It also drives the launcher servo, and refuses to fire unless armed and enabled.',
    topics: [['state/kill', 'every board listens'], ['state/actuator/status', 'every 500 ms']],
    code: [`${REPO.firmware}/talos/PoacBoard`, 'titan_firmware · talos/PoacBoard'], read: ['boards.html#poac', 'firmware.html#kill', 'actuators.html#poac'] },
  esc: { label: 'ESC boards ×2', sub: 'RP2040 · RPM loop', layer: 'Firmware', runs: 'Their own RP2040s',
    text: 'Each runs an RPM loop for four thrusters and drives their ESCs over DShot. They stop the thrusters on their own if commands stop for 0.5 s, or if the POAC\'s kill state goes quiet.',
    topics: [['RPM commands', 'raw CAN from the MPC, 20 Hz'], ['Timeout', '0.5 s without a command']],
    code: [`${REPO.firmware}/talos/ESCBoard`, 'titan_firmware · talos/ESCBoard'], read: ['thrusters-hw.html', 'firmware.html#thrusters'] },
  sensors: { label: 'Nav sensors', sub: 'IMU · FOG · DVL · depth', layer: 'Hardware', runs: 'On and around the hull',
    text: 'A VectorNav VN-100 IMU, a fibre-optic gyro, a Nortek DVL1000 and a Bar02 pressure sensor. None of them measures x, y or compass heading; that has to be added up, and the camera map re-anchors it.',
    topics: [['IMU', '400 Hz'], ['FOG', 'about 475 Hz'], ['DVL', '8 Hz'], ['Depth', '20 Hz']],
    code: null, read: ['sensors.html'] },
  cameras: { label: 'Cameras', sub: '2 × ZED X Mini', layer: 'Hardware', runs: 'Both in the starboard tube: forward behind its window, down against its bottom wall',
    text: 'Two Stereolabs ZED X Mini stereo cameras, forward (ffc) and down (dfc), on GMSL2 to the Orin. The detector reads one at a time; the tree chooses which.',
    topics: [['Image', '1920 × 1200 at 15 Hz'], ['Raw frame', '9.2 MB']],
    code: null, read: ['cameras.html'] },
  power: { label: 'Batteries + kill', sub: '2 × 5S LiPo', layer: 'Hardware', runs: 'Two battery pods, the port window',
    text: 'Two 8000 mAh 5S LiPo packs feed one bus through the POAC. The kill switch cuts the thrusters\' supply and nothing else, so the computer and the boards stay on.',
    topics: [['Each pack', '18.5 V, 148 Wh'], ['Peak draw', 'about 26 A, mostly thrusters (estimate)']],
    code: null, read: ['electrical.html', 'commanding.html'] },
  launcher: { label: 'Launcher + claw', sub: 'servos', layer: 'Hardware', runs: 'Under the hull',
    text: 'One servo releases two spring-loaded torpedoes and two markers. The claw has its own servo. The magnet poker has none: Talos flies it to the target.',
    topics: [['Torpedoes', '2, forward'], ['Markers', '2, down']],
    code: null, read: ['actuators.html'] },
  thrusters: { label: 'Thrusters', sub: '8 × T200', layer: 'Hardware', runs: 'The frame\'s corner modules',
    text: 'Eight Blue Robotics T200s in one plane. Four push fore and aft; four tilted 45° push up or down and sideways at once. Four of them have reverse-pitch propellers and are spun backwards by the firmware.',
    topics: [['Limit', '±24 N each, 73 N total']],
    code: null, read: ['thrusters-hw.html', 'control/thrusters.html'] },
  sim: { label: 'Nereus simulator', sub: 'stands in for the hardware, the boards and the drivers', layer: 'Simulator', runs: 'Your laptop',
    text: 'Publishes the same sensor and camera topics as the real drivers, takes the MPC\'s thruster forces and the actuator commands, and moves a simulated Talos with the same Fossen code the MPC predicts with. Sensor noise comes from real pool bags. It does not simulate acoustics or sensor failures.',
    topics: [['vectornav/imu, gyro/twist, dvl_twist, depth/pose', '400 / 500 / 8 / 20 Hz'], ['both cameras', '1920 × 1200, 15 Hz'], ['state/kill, actuator state', 'like the boards']],
    code: [`${REPO.nereus}/integrations/uwrt/launch/sim.launch.py`, 'nereus · sim.launch.py'], read: ['nereus.html', 'launch.html'] },
};

// Layout for wide screens (viewBox units). Bands are the layers.
const W = 960;
const ROW = { A: 57, B: 147, C: 237, D: 327, E: 417, F: 507, G: 597 };
const band = (label, x0, x1, top, bottom = top + 80) => ({ label, points: [[x0, top], [x1, top], [x1, bottom], [x0, bottom]], lx: x0 + 10, ly: top + 15 });
const ROBOT = {
  pos: {
    viewer: [840, ROW.A], tree: [300, ROW.A], translator: [610, ROW.A],
    mapping: [190, ROW.B], mpc: [840, 192],
    detector: [255, ROW.C], tag: [475, ROW.C],
    ekf: [105, ROW.D],
    drivers: [105, ROW.E], zed: [340, ROW.E], agent: [610, ROW.E],
    ccbb: [235, ROW.F], poac: [610, ROW.F], esc: [840, ROW.F],
    sensors: [105, ROW.G], cameras: [340, ROW.G], power: [505, ROW.G], launcher: [680, ROW.G], thrusters: [860, ROW.G],
  },
  bands: [
    band('AUTONOMY', 8, 712, 10), band('OPERATOR', 728, 952, 10),
    band('MAPPING', 8, 712, 100), band('CONTROL', 728, 952, 100, 270),
    band('PERCEPTION', 8, 712, 190),
    band('STATE ESTIMATION', 8, 952, 280), band('DRIVERS · ON THE ORIN', 8, 952, 370),
    band('FIRMWARE · RP2040 BOARDS', 8, 952, 460), band('HARDWARE', 8, 952, 550),
  ],
  edges: [
    ['sensors', 'drivers', 'IMU, FOG, DVL'], ['sensors', 'ccbb', 'depth'], ['cameras', 'zed', 'GMSL2'],
    ['ccbb', 'agent', 'CAN', { bend: -18, lx: 520, ly: 452 }], ['drivers', 'ekf'], ['agent', 'ekf', 'depth', { lx: 300, ly: 368 }],
    ['zed', 'detector', 'image + depth', { lx: 290, ly: 305, anchor: 'end' }], ['zed', 'tag'],
    ['ekf', 'mapping', 'odometry', { lx: 118, ly: 232 }], ['detector', 'mapping', 'detections', { lx: 270, ly: 190 }], ['tag', 'mapping', 'world → map', { lx: 380, ly: 184 }],
    ['mapping', 'tree', 'prop frames'], ['tree', 'mapping', 'target, lock', { dash: true, bend: -30, lx: 290, ly: 112 }],
    ['ekf', 'mpc', 'odometry (anchor)', { via: [700, 300] }],
    ['drivers', 'mpc', 'IMU, FOG, DVL, depth', { via: [640, 330] }],
    ['tree', 'mpc', 'goals, paths', { lx: 690, ly: 132 }], ['tree', 'translator', 'services', { ly: 50 }],
    ['translator', 'agent', 'command/actuator/*', { lx: 680, ly: 330 }], ['agent', 'poac', 'CAN'],
    ['power', 'poac', 'kill switch', { lx: 535, ly: 548 }], ['poac', 'launcher', 'servo', { lx: 670, ly: 548 }],
    ['poac', 'esc', 'kill state', { dash: true, ly: 500 }],
    ['mpc', 'esc', 'RPM, raw CAN', { lx: 840, ly: 330 }], ['esc', 'thrusters', 'DShot'],
    ['viewer', 'tree', 'start a tree', { via: [560, 2], dash: true, lx: 520, ly: 14 }], ['viewer', 'mpc', 'goals', { dash: true, lx: 868, ly: 128, anchor: 'start' }],
    ['viewer', 'agent', 'kill slot 1', { dash: true, via: [760, 380], lx: 738, ly: 396, anchor: 'start' }],
  ],
};
const SIM = {
  pos: { ...Object.fromEntries(Object.entries(ROBOT.pos).filter(([k]) => ['viewer', 'tree', 'translator', 'mapping', 'mpc', 'detector', 'tag', 'ekf'].includes(k))), sim: [480, 470] },
  height: 550,
  bands: [...ROBOT.bands.slice(0, 6), band('SIMULATOR · REPLACES DRIVERS, FIRMWARE AND HARDWARE', 8, 952, 370, 540)],
  edges: [
    ['sim', 'ekf', 'IMU, FOG, DVL, depth', { lx: 262, ly: 398, anchor: 'start' }], ['sim', 'detector', 'images + depth', { lx: 300, ly: 330 }], ['sim', 'tag'],
    ['ekf', 'mapping', 'odometry', { lx: 118, ly: 232 }], ['detector', 'mapping', 'detections', { lx: 270, ly: 190 }], ['tag', 'mapping', 'world → map', { lx: 380, ly: 184 }],
    ['mapping', 'tree', 'prop frames'], ['tree', 'mapping', 'target, lock', { dash: true, bend: -30, lx: 290, ly: 112 }],
    ['ekf', 'mpc', 'odometry (anchor)', { via: [700, 300] }],
    ['sim', 'mpc', 'IMU, FOG, DVL, depth', { via: [790, 330], lx: 775, ly: 305 }],
    ['tree', 'mpc', 'goals, paths', { lx: 690, ly: 132 }], ['tree', 'translator', 'services', { ly: 50 }],
    ['translator', 'sim', 'command/actuator/*', { via: [625, 400], lx: 632, ly: 330, anchor: 'start' }],
    ['mpc', 'sim', 'thruster_forces', { via: [845, 470], lx: 852, ly: 330, anchor: 'start' }],
    ['viewer', 'sim', 'kill slot 1', { dash: true, via: [760, 330], lx: 800, ly: 150, anchor: 'end' }],
    ['viewer', 'tree', 'start a tree', { via: [560, 2], dash: true, lx: 520, ly: 14 }], ['viewer', 'mpc', 'goals', { dash: true, lx: 868, ly: 128, anchor: 'start' }],
  ],
};
// The order the layers are listed in on phones (and the order the loop runs in).
const LAYERS = ['Operator', 'Autonomy', 'Control', 'Mapping', 'Perception', 'State estimation', 'Drivers', 'Firmware', 'Hardware', 'Simulator'];

const stackHost = document.getElementById('stack-graph');
const stackInfo = document.getElementById('stack-info');
const stackHint = document.getElementById('stack-hint');
let stackMode = 'robot', stackSel = null, stackPinned = null, graph = null, listMode = null;

function cfgFor(mode) { return mode === 'sim' ? SIM : ROBOT; }
function neighbours(mode, id) {
  const c = cfgFor(mode);
  const ins = c.edges.filter((e) => e[1] === id).map((e) => [e[0], e[2]]);
  const outs = c.edges.filter((e) => e[0] === id).map((e) => [e[1], e[2]]);
  return { ins, outs };
}
const STACK_INTRO = `<p class="ix-info-empty"><b>Tap any box.</b> You'll get what it does, the topics it publishes with their rates, the file it lives in and the chapter that explains it. Arrows into and out of it light up.</p>`;
function renderInfo(id) {
  const n = id && N[id];
  if (!n) { stackInfo.innerHTML = STACK_INTRO; return; }
  const { ins, outs } = neighbours(stackMode, id);
  // In Nereus the same nodes run on your laptop, and the simulator takes the place of the boards.
  const sim = stackMode === 'sim';
  const runs = sim && n.runs.startsWith('The Orin') ? 'Your laptop (same code as on the Orin)' : n.runs;
  const topics = (sim && n.simTopics) || n.topics;
  const nb = (list, dir) => list.length ? `<div class="ix-nb"><span>${dir}</span>${list.map(([k, l]) => `<button type="button" data-go="${k}">${esc(N[k].label)}${l ? ` <small>${esc(l)}</small>` : ''}</button>`).join('')}</div>` : '';
  stackInfo.innerHTML = `<div class="ix-info-head"><span class="ix-layer">${n.layer}</span><h3>${esc(n.label)}</h3><span class="ix-runs">Runs on: ${esc(runs)}</span></div>
    <p>${esc(n.text)}</p>
    ${topics?.length ? `<dl class="ix-topics">${topics.map(([t, r]) => `<dt><code>${esc(t)}</code></dt><dd>${esc(r)}</dd>`).join('')}</dl>` : ''}
    ${nb(ins, 'From')}${nb(outs, 'To')}
    <div class="ix-links">${n.code ? `<span>Code: <a href="${n.code[0]}">${esc(n.code[1])}</a></span>` : ''}<span>Read: ${n.read.map((h) => chLink(h)).join(', ')}</span></div>`;
  stackInfo.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => selectStack(b.dataset.go, true)));
}
function selectStack(id, fromInfo) {
  stackSel = id || null;
  stackPinned = stackSel;
  if (graph) graph.highlight(stackSel);
  if (listMode) listMode.querySelectorAll('[data-id]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === stackSel)));
  renderInfo(stackSel);
  if (stackHint) stackHint.hidden = !!stackSel;
  if (fromInfo && listMode) listMode.querySelector(`[data-id="${stackSel}"]`)?.focus({ preventScroll: true });
  // On a phone the info sits below a long list: bring it into view (only if it is off screen).
  if (listMode && stackSel && !fromInfo) {
    const r = stackInfo.getBoundingClientRect();
    if (r.top > innerHeight - 120) stackInfo.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'nearest' });
  }
}
function buildGraph() {
  const c = cfgFor(stackMode);
  const nodes = Object.entries(c.pos).map(([id, [x, y]]) => {
    const n = N[id];
    const o = { id, x, y, label: n.label, sub: n.sub };
    if (id === 'sim') { o.w = 900; o.h = 120; }
    if (['sensors', 'cameras', 'power', 'launcher', 'thrusters'].includes(id)) o.rx = 3; // hardware: square corners
    return o;
  });
  const edges = c.edges.map(([from, to, label, o = {}]) => ({ from, to, label, ...o }));
  stackHost.innerHTML = '';
  // Hover previews a box; a tap (or click) pins it, so the info stays while you move to its links.
  const g = new Graph(stackHost, { width: W, height: c.height || 640, nodes, edges, bands: c.bands, onSelect: (id) => {
    if (g !== graph) return; // an older graph (before a mode switch) still listens to the document
    if (!id && stackPinned && c.pos[stackPinned]) { g.highlight(stackPinned); return; }
    if (id !== stackSel) { stackSel = id; renderInfo(id); stackHint.hidden = !!id; }
  } });
  graph = g;
  g.svg.addEventListener('click', (e) => {
    const el = e.target.closest('.node');
    const id = el ? [...g.nodes].find(([, n]) => n.g === el)?.[0] : null;
    stackPinned = id && id !== stackPinned ? id : null;
    if (id && !stackPinned) { stackPinned = null; g.highlight(null); return; }
    g.highlight(stackPinned);
  });
  // Hardware boxes look different: drawn in the accent colour family, like parts you can touch.
  graph.nodes.forEach((n, id) => { if (['sensors', 'cameras', 'power', 'launcher', 'thrusters'].includes(id)) n.g.classList.add('hw'); if (id === 'sim') n.g.classList.add('simnode'); });
  if (stackSel && !c.pos[stackSel]) stackSel = null;
  stackPinned = stackSel;
  graph.highlight(stackSel);
  if (!reduced) graph.pulse((e) => !e.dash, 2.4);
}
function buildList() {
  const c = cfgFor(stackMode);
  const ids = Object.keys(c.pos);
  const wrap = document.createElement('div');
  wrap.className = 'ix-layers';
  LAYERS.forEach((L) => {
    const here = ids.filter((id) => N[id].layer === L);
    if (!here.length) return;
    const row = document.createElement('div');
    row.className = `ix-row${L === 'Hardware' ? ' hw' : ''}${L === 'Simulator' ? ' simrow' : ''}`;
    row.innerHTML = `<span class="ix-row-label">${L}</span><div class="ix-row-nodes">${here.map((id) => `<button type="button" data-id="${id}" aria-pressed="false"><b>${esc(N[id].label)}</b><small>${esc(N[id].sub)}</small></button>`).join('')}</div>`;
    wrap.appendChild(row);
  });
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) selectStack(stackSel === b.dataset.id ? null : b.dataset.id);
  });
  stackHost.innerHTML = '';
  stackHost.appendChild(wrap);
  listMode = wrap;
  graph = null;
  if (stackSel && !c.pos[stackSel]) stackSel = null;
  selectStack(stackSel);
}
let stackNarrow = null;
function buildStack(force) {
  const narrow = stackHost.clientWidth < 640;
  if (!force && narrow === stackNarrow) return;
  stackNarrow = narrow;
  listMode = null;
  if (narrow) buildList(); else buildGraph();
  renderInfo(stackSel);
  stackHint.textContent = narrow ? 'Tap a box' : 'Tap or hover a box';
}
new ResizeObserver(() => buildStack(false)).observe(stackHost);
buildStack(true);
document.getElementById('stack-mode').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.v === stackMode) return;
  stackMode = b.dataset.v;
  b.parentElement.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  if (stackMode === 'sim' && ['drivers', 'zed', 'agent', 'ccbb', 'poac', 'esc', 'sensors', 'cameras', 'power', 'launcher', 'thrusters'].includes(stackSel)) stackSel = 'sim';
  if (stackMode === 'robot' && stackSel === 'sim') stackSel = null;
  buildStack(true);
});

// ============================================================================ follow one decision
const DX_LAYERS = ['Hardware', 'Firmware', 'Drivers', 'Estimation', 'Perception', 'Mapping', 'Autonomy', 'Control'];
const IMG = (f) => `${BASE}img/index/${f}`;
const STEPS = [
  { short: 'Camera', layers: ['Hardware', 'Drivers'], title: 'The forward camera sees the board',
    text: 'The forward ZED X Mini (<code>ffc</code>) sends 1920 × 1200 frames at 15 Hz over GMSL2. On the Orin the ZED SDK rectifies each one with the underwater calibration and computes stereo depth on the GPU. The tree switched the detector to this camera for the torpedo task.',
    facts: [['Topic', 'ffc/zed_node/rgb/image_rect_color'], ['Also', 'a depth image from the same moment']],
    media: { img: 'step-camera.webp', alt: 'The torpedo board as the forward camera sees it in Nereus: the fire symbol, the fire engine, the blood drop, the ambulance and four rings, with the pool wall behind', cap: 'A forward-camera frame of the torpedo board in Nereus.' },
    read: ['cameras.html', 'perception/calibration.html'] },
  { short: 'Detect', layers: ['Perception'], title: 'YOLO finds the symbols',
    text: 'About ten times a second, <code>yolo_orientation</code> takes the newest colour image and the depth image from the same moment and runs the forward camera\'s YOLO model (a TensorRT engine). Each object comes out as a class, a confidence, a box and a pixel mask. Below 0.65 confidence it is dropped.',
    facts: [['In this frame', 'fire 0.95, fire_engine 0.96, blood 0.95, ambulance 0.96, four circles'], ['Model', 'rs26_ffc_finals']],
    media: { img: 'step-detect.webp', alt: 'The detector\'s annotated image: boxes and masks on fire, fire_engine, blood, ambulance and four circles, each with a confidence near 0.95', cap: 'The detector\'s own annotated output at sim time 1:48.' },
    read: ['perception/detector.html', 'perception/training.html'] },
  { short: 'Board', layers: ['Perception'], title: 'Masks and depth become a board with four holes',
    text: 'Pixels inside each mask become 3D points through the depth image. One plane is fitted through all the symbols together: that is the board and the way it faces. Each ring is placed where its camera ray meets the plane, and the four holes are named by sorting them along the fire → blood axis.',
    facts: [['Published', 'torpedo, fire_hole_large, fire_hole_small, blood_hole_large, blood_hole_small'], ['On', 'detected_objects, 9–11 Hz in Nereus']],
    media: { img: 'step-pose.webp', alt: 'The Nereus viewer showing the forward camera\'s depth as a white point sheet on the torpedo board, with coloured detection points on the symbols', cap: 'The camera\'s depth as points (white) and the detections (colour) on the board.' },
    read: ['perception/pose.html', 'perception/composites.html'] },
  { short: 'Map', layers: ['Mapping', 'Estimation'], title: 'Mapping decides how sure it is',
    text: 'One detection can be wrong. Mapping gives each one a covariance (stereo depth is worse than direction, so it is long along the line of sight), waits until 4 agree within 4 s, then runs a Kalman filter per prop. Positions are in the course map, using the EKF\'s odometry. Each prop goes out as a TF frame such as <code>fire_hole_large_frame</code>, with how sure mapping is.',
    facts: [['Rejects', 'detections more than about 4σ off, after the first 10'], ['Frames', 'about 7.5 Hz in Nereus']],
    media: { svg: 'map', cap: 'Drawing, not data: detections (dots, each with its uncertainty) and the filter\'s estimate (ring) tightening as they agree.' },
    read: ['perception/noise.html', 'perception/tracking.html', 'perception/map.html'] },
  { short: 'Decide', layers: ['Autonomy'], title: 'The tree waits, then commits',
    text: 'The mission tree has been searching for the board. Once mapping\'s error for it is under 0.0025 (σ about 4 cm), it arms the launcher, stands off 1.5 m and targets both fire holes until each is under 0.0005 (σ about 1.7 cm). Then it <em>locks the map</em>, so nothing moves while it aims.',
    facts: [['In Nereus', 'board centred 2.8 s into the search; holes converged 1.5 s after being targeted'], ['Tree', 'RepairCompMpcTree.xml']],
    media: { img: 'step-tree.webp', tall: true, alt: 'Two viewer panels, one above the other: Autonomy, running RepairCompMpcTree.xml with the top of its execution stack; Actuators, armed, with Fire torpedo enabled', cap: 'The tree running, the launcher armed (Nereus viewer).' },
    read: ['mission-tree.html#torpedo', 'perception/frames.html', 'bt.html'] },
  { short: 'Aim', layers: ['Control', 'Estimation'], title: 'The MPC lines the tube up',
    text: 'A <code>FollowPath</code> goal puts the launcher\'s first tube 1.1 m, then 0.6 m in front of the large hole. Every 50 ms the MPC plans 30 steps of 50 ms ahead, from its own estimate of the state with the EKF anchoring x, y and heading. The tree fires only once the MPC says it has settled.',
    facts: [['Settled', 'trust above 0.985 on every axis, tube within 1 cm sideways'], ['Patience', 'two tries, each up to 60 s to fly and 60 s to settle']],
    media: { img: 'step-mpc.webp', alt: 'The viewer\'s motion table (actual, commanded and error in x, y, z, roll, pitch, yaw) beside Talos in front of the board with its thrust arrows', cap: 'Commanded vs actual pose while Talos lines up, and its thrust arrows.' },
    read: ['commanding.html', 'control/index.html', 'control/reference.html'] },
  { short: 'Thrust', layers: ['Control', 'Firmware', 'Hardware'], title: 'Thrust becomes propeller speed',
    text: 'Each tick the MPC turns its eight forces into propeller RPM and writes one raw CAN frame per ESC board, skipping ROS. Each ESC board runs an RPM loop for its four thrusters and drives their ESCs over DShot. If the frames stop for 0.5 s, or the POAC reports a kill, the boards stop the thrusters themselves.',
    facts: [['Rate', '20 Hz, one frame per board'], ['Boards', 'thrusters 0–3 and 4–7']],
    media: { img: 'step-esc.webp', alt: 'Render of the ESC board\'s printed circuit board design', cap: 'An ESC board, rendered from its PCB design.' },
    read: ['thrusters-hw.html', 'firmware.html#thrusters', 'control/thrusters.html'] },
  { short: 'Fire', layers: ['Autonomy', 'Drivers', 'Firmware', 'Hardware'], title: 'Fire',
    text: 'The tree calls a ROS service. <code>actuator_service_translator</code> turns it into <code>command/actuator/torpedo</code>; the micro-ROS agent carries that over CAN to the POAC board. Its firmware fires only if Talos is enabled, the launcher armed and the servo idle. The servo turns from 120° to 200°, a spring pushes the first torpedo out, and the servo goes home. The answer comes back on <code>state/actuator/cmd_status</code>.',
    facts: [['In Nereus', 'released 122.2 s into the run; hit fire_large 0.3 s later'], ['Next', 'the second tube, the small hole, 240°']],
    media: { svg: 'servo', cap: 'The launcher servo\'s positions (from the POAC firmware). Drawing.' },
    read: ['actuators.html', 'boards.html#poac', 'firmware.html'] },
];
const dxSteps = document.getElementById('dx-steps');
const dxBody = document.getElementById('dx-body');
const dxLayers = document.getElementById('dx-layers');
const dxPrev = document.getElementById('dx-prev'), dxNext = document.getElementById('dx-next');
let dx = 0, dxAnim = 0;
dxSteps.innerHTML = STEPS.map((s, i) => `<li><button type="button" data-i="${i}" aria-label="Step ${i + 1}: ${esc(s.title)}"><span>${i + 1}</span>${s.short}</button></li>`).join('');
dxLayers.innerHTML = DX_LAYERS.map((L) => `<span data-l="${L}">${L}</span>`).join('');
dxSteps.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) showStep(+b.dataset.i); });
dxPrev.onclick = () => showStep(Math.max(0, dx - 1));
dxNext.onclick = () => showStep(dx === STEPS.length - 1 ? 0 : dx + 1);

function mapSvg() {
  // Top-down: the board as a line, Talos's camera below, detections scattered along the line of sight.
  return `<svg class="dx-svg" viewBox="0 0 360 250" role="img" aria-label="Drawing: detections scattered around a hole on the board, each with a long uncertainty ellipse along the camera's line of sight, and the filter's estimate shrinking to a small ring">
    <rect x="0" y="0" width="360" height="250" rx="8" fill="var(--paper)"/>
    <line x1="60" y1="70" x2="300" y2="70" stroke="var(--ink)" stroke-width="5" stroke-linecap="round"/>
    <text x="340" y="92" text-anchor="end" class="dx-t">torpedo board (from above)</text>
    <circle cx="150" cy="70" r="5" fill="var(--paper)" stroke="var(--ink)" stroke-width="2"/>
    <text x="112" y="92" text-anchor="end" class="dx-t dx-mut halo" style="stroke:var(--paper)">fire_hole_large</text>
    <path d="M180 232 l-12 -10 h24 z" fill="var(--ink-2)"/>
    <text x="198" y="236" class="dx-t dx-mut">camera</text>
    <line x1="180" y1="222" x2="150" y2="70" stroke="var(--rule)" stroke-dasharray="4 4"/>
    <g id="dx-dets"></g>
    <ellipse id="dx-est" cx="150" cy="70" rx="40" ry="40" fill="rgba(217,72,15,0.08)" stroke="var(--accent)" stroke-width="2"/>
    <text id="dx-read" x="16" y="30" class="dx-t dx-b">waiting for 4 detections to agree</text>
  </svg>`;
}
function servoSvg() {
  // Angles from ros_torp.c / actuator.c: home 120°, torpedoes 200° then 240°, markers 50° then 0°. Range 0–240°.
  const cx = 180, cy = 150, r = 100;
  const pt = (deg, rr = r) => { const a = Math.PI * (210 - deg) / 180; return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
  const arc = (a0, a1, rr) => { const [x0, y0] = pt(a0, rr), [x1, y1] = pt(a1, rr); return `M${x0.toFixed(1)},${y0.toFixed(1)} A${rr},${rr} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`; };
  const mark = (deg, label, cls, dy = 0) => { const [x0, y0] = pt(deg, r - 8), [x1, y1] = pt(deg, r + 8), [tx, ty] = pt(deg, r + 26); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="${cls}"/><text x="${tx}" y="${ty + dy}" text-anchor="middle" class="dx-t ${cls}">${label}</text>`; };
  return `<svg class="dx-svg" viewBox="0 0 360 250" role="img" aria-label="Drawing of the launcher servo dial: home at 120 degrees, torpedoes at 200 and 240, markers at 50 and 0. The needle turns from home to 200 degrees and back.">
    <rect x="0" y="0" width="360" height="250" rx="8" fill="var(--paper)"/>
    <path d="${arc(0, 240, r)}" fill="none" stroke="var(--rule)" stroke-width="10" stroke-linecap="round"/>
    <path d="${arc(120, 240, r)}" fill="none" stroke="rgba(217,72,15,0.25)" stroke-width="10"/>
    ${mark(0, 'marker 2 · 0°', 'dx-m', 4)}${mark(50, 'marker 1 · 50°', 'dx-m')}${mark(120, 'home · 120°', 'dx-h', -4)}${mark(200, 'torpedo 1 · 200°', 'dx-a')}${mark(240, 'torpedo 2 · 240°', 'dx-a', 4)}
    <line id="dx-needle" x1="${cx}" y1="${cy}" x2="${pt(120, r - 16)[0]}" y2="${pt(120, r - 16)[1]}" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="9" fill="var(--ink)"/>
    <text id="dx-servo" x="${cx}" y="${cy + 46}" text-anchor="middle" class="dx-t dx-b">home, 120°</text>
  </svg>`;
}
function animateMap() {
  const g = document.getElementById('dx-dets'), est = document.getElementById('dx-est'), read = document.getElementById('dx-read');
  if (!g) return;
  // A fixed, repeatable scatter: long along the line of sight (camera → hole), short across it.
  const los = Math.atan2(70 - 222, 150 - 180);
  const pts = [[24, 5], [-19, -6], [31, 3], [-10, 8], [14, -5], [-26, 2], [9, 7], [-5, -3], [18, -2], [-15, 5], [3, -7], [10, 3]];
  let k = 0;
  const t0 = performance.now();
  cancelAnimationFrame(dxAnim);
  const frame = (now) => {
    if (!document.getElementById('dx-dets')) return;
    const n = Math.min(pts.length, Math.floor((now - t0) / 550));
    while (k < n) {
      const [a, b] = pts[k];
      const x = 150 + a * Math.cos(los) - b * Math.sin(los), y = 70 + a * Math.sin(los) + b * Math.cos(los);
      g.insertAdjacentHTML('beforeend', `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${(los * 180 / Math.PI).toFixed(1)})"><ellipse rx="26" ry="6" fill="none" stroke="var(--state)" stroke-opacity="0.35"/><circle r="3" fill="var(--state)"/></g>`);
      k++;
    }
    const r = n < 4 ? 40 : Math.max(4, 40 / Math.sqrt(n - 2));
    est.setAttribute('rx', r.toFixed(1));
    est.setAttribute('ry', (r * (n < 4 ? 1 : 0.7)).toFixed(1));
    est.style.opacity = n < 4 ? 0.35 : 1;
    read.textContent = n < 4 ? `waiting for 4 detections to agree (${n})` : n < pts.length ? `${n} detections: the filter is tightening` : 'tight enough: the tree can lock the map';
    if (n < pts.length) dxAnim = requestAnimationFrame(frame);
    else dxAnim = setTimeout(() => { if (document.getElementById('dx-dets')) { g.innerHTML = ''; animateMap(); } }, 2600);
  };
  if (reduced) {
    pts.forEach(() => {});
    g.innerHTML = pts.map(([a, b]) => { const x = 150 + a * Math.cos(los) - b * Math.sin(los), y = 70 + a * Math.sin(los) + b * Math.cos(los); return `<g transform="translate(${x},${y}) rotate(${los * 180 / Math.PI})"><ellipse rx="26" ry="6" fill="none" stroke="var(--state)" stroke-opacity="0.35"/><circle r="3" fill="var(--state)"/></g>`; }).join('');
    est.setAttribute('rx', 5); est.setAttribute('ry', 4); read.textContent = 'tight enough: the tree can lock the map';
    return;
  }
  dxAnim = requestAnimationFrame(frame);
}
function animateServo() {
  const needle = document.getElementById('dx-needle'), label = document.getElementById('dx-servo');
  if (!needle) return;
  const cx = 180, cy = 150, rr = 84;
  const set = (deg) => { const a = Math.PI * (210 - deg) / 180; needle.setAttribute('x2', (cx + rr * Math.cos(a)).toFixed(1)); needle.setAttribute('y2', (cy - rr * Math.sin(a)).toFixed(1)); };
  if (reduced) { set(200); label.textContent = 'torpedo 1 released, 200°'; return; }
  // Move at the firmware's planned 300°/s, settle 250 ms, return home, settle 250 ms; pause and repeat.
  const seq = [[0, 120, 120, 'armed, at home'], [900, 120, 200, 'turning…'], [1167, 200, 200, 'torpedo 1 released, 200°'], [1417, 200, 120, 'back home'], [1683, 120, 120, 'home, 120°'], [4200, 120, 120, '']];
  const t0 = performance.now();
  cancelAnimationFrame(dxAnim);
  const frame = (now) => {
    if (!document.getElementById('dx-needle')) return;
    const t = (now - t0) % 4200;
    let i = 0;
    while (i < seq.length - 2 && t >= seq[i + 1][0]) i++;
    const [ta, a0, a1, txt] = seq[i], tb = seq[i + 1][0];
    const u = Math.min(1, (t - ta) / Math.max(1, tb - ta));
    set(a0 + (a1 - a0) * u);
    if (txt) label.textContent = txt;
    dxAnim = requestAnimationFrame(frame);
  };
  dxAnim = requestAnimationFrame(frame);
}
function showStep(i) {
  dx = i;
  clearTimeout(dxAnim); cancelAnimationFrame(dxAnim);
  const s = STEPS[i];
  dxSteps.querySelectorAll('button').forEach((b, k) => { b.setAttribute('aria-current', k === i ? 'step' : 'false'); b.classList.toggle('done', k < i); });
  dxLayers.querySelectorAll('span').forEach((el) => el.classList.toggle('on', s.layers.includes(el.dataset.l)));
  const media = s.media.img
    ? `<img src="${IMG(s.media.img)}" alt="${esc(s.media.alt)}"${s.media.tall ? ' class="dx-tall"' : ''} loading="lazy">`
    : s.media.svg === 'map' ? mapSvg() : servoSvg();
  dxBody.innerHTML = `<div class="dx-media">${media}<p class="dx-cap">${esc(s.media.cap)}</p></div>
    <div class="dx-text"><span class="dx-kicker">Step ${i + 1} of ${STEPS.length} · ${s.layers.join(' · ')}</span><h3>${s.title}</h3><p>${s.text}</p>
    <dl class="dx-facts">${s.facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    <div class="dx-read">Read: ${s.read.map((h) => chLink(h)).join(' · ')}</div></div>`;
  dxPrev.disabled = i === 0;
  dxNext.textContent = i === STEPS.length - 1 ? 'Start over' : 'Next →';
  if (s.media.svg === 'map') animateMap();
  if (s.media.svg === 'servo') animateServo();
}
showStep(0);

// ============================================================================ repos and branches
const REPOS = [
  ['riptide_core', 'followpath-speed', 'Drivers, the EKF config, the robot description, messages'],
  ['riptide_control', 'mpc', 'riptide_mpc, the controller'],
  ['riptide_perception', 'mapping-estimator', 'The detector and mapping'],
  ['riptide_autonomy', 'autonomy-mapping', 'Behaviour trees and their C++ nodes'],
  ['riptide_launch', 'newsim', 'Launch files and the robot\'s launch lists'],
  ['riptide_gui', 'newsim', 'Older GUI tools (the viewer replaced RViz)'],
  ['nereus', 'main', 'The simulator and the viewer'],
  ['nortek_dvl', 'DvlWaterTrackFallback', 'The DVL driver'],
  ['apriltag_ros', 'CompressedImages', 'AprilTag detector (the team\'s fork; decodes compressed images)'],
  ['titan_firmware', 'master', 'Firmware for every board'],
  ['riptide_release', 'master', 'Pins all of the above; what gets deployed'],
];
document.getElementById('repo-rows').innerHTML = REPOS.map(([r, b, what]) => `<tr><td><a href="${GH}/${r}/tree/${b}"><code>${r}</code></a><span class="ix-br"><code>${b}</code></span></td><td><code>${b}</code></td><td>${what}</td></tr>`).join('');

// ============================================================================ reading paths
const PATHS = [
  { id: 'software', name: 'Software', who: 'You\'ll write or change ROS code anywhere in the stack.', steps: [
    ['ros2.html', 'Nodes, topics and launch files: the vocabulary of everything else.'],
    ['code-map.html', 'Which repo holds what, and which branch Talos runs.'],
    ['setup.html', 'Get the code building on your laptop.'],
    ['nereus.html', 'Run the whole robot in the simulator.'],
    ['viewer.html', 'Drive it, start trees, watch the cameras.'],
    ['launch.html', 'What starts, in what order, on the robot and in sim.'],
    ['debugging.html', 'Bags, topic rates and the order to check things in.'],
    ['interfaces.html', 'Every topic, service and frame in one place.'] ] },
  { id: 'electrical', name: 'Electrical', who: 'You\'ll work on power, boards or firmware.', steps: [
    ['electrical.html', 'Batteries, the kill switch, the rails and where every amp goes.'],
    ['boards.html', 'Each board, its job and its parts.'],
    ['firmware.html', 'The C on the RP2040s: CAN, micro-ROS, kill, flashing.'],
    ['thrusters-hw.html', 'From a CAN frame to a spinning propeller.'],
    ['sensors.html', 'The IMU, gyro, DVL and depth sensor, and how they fail.'],
    ['computers.html', 'The Orin, CAN on the computer side, and the networks.'],
    ['pool-test.html', 'Bench checks before anything gets wet.'] ] },
  { id: 'mechanical', name: 'Mechanical', who: 'You\'ll design, build or service the vehicle.', steps: [
    ['robosub.html', 'The rules that shape the vehicle: size, weight, buoyancy, kill switch.'],
    ['mechanical.html', 'The frame, the hull, sealing, trim and how to get inside.'],
    ['thrusters-hw.html', 'Why the eight thrusters sit where they do.'],
    ['actuators.html', 'The launcher, the claw and the magnet poker.'],
    ['control/model.html', 'How mass, buoyancy and drag show up in the controller.'],
    ['control/identify.html', 'How those numbers are measured in the pool.'],
    ['pool-test.html', 'Sealing, pressure-testing and a day at the pool.'] ] },
  { id: 'autonomy', name: 'Autonomy', who: 'You\'ll work on the mission: what Talos does and when.', steps: [
    ['robosub.html', 'The course, task by task, and how a run is scored.'],
    ['bt.html', 'How a behaviour tree runs, tick by tick.'],
    ['bt-nodes.html', 'The 44 nodes Talos\'s trees are built from.'],
    ['mission-tree.html', 'The competition tree, read task by task.'],
    ['perception/frames.html', 'What the tree asks of mapping, and what it gets back.'],
    ['commanding.html', 'How goals reach the MPC, and what a kill does.'],
    ['bt-workflow.html', 'Edit a tree, add a node, test it in Nereus.'] ] },
  { id: 'perception', name: 'Perception', who: 'You\'ll work on the cameras, the detector or the map.', steps: [
    ['cameras.html', 'The two ZED cameras, from glass to topic.'],
    ['perception/index.html', 'The perception pipeline in one picture.'],
    ['perception/training.html', 'How the YOLO model is trained.'],
    ['perception/detector.html', 'The detector, frame by frame.'],
    ['perception/tracking.html', 'A Kalman filter per prop.'],
    ['perception/map.html', 'One shared offset for the whole course.'],
    ['perception/workflow.html', 'Run it, break it, measure it, change it.'] ] },
  { id: 'controls', name: 'Controls', who: 'You\'ll work on state estimation or the controller.', steps: [
    ['sensors.html', 'What each sensor measures and how far to trust it.'],
    ['localization.html', 'The EKF, its frames, and why it drifts.'],
    ['control/index.html', 'The MPC loop, one tick at a time.'],
    ['control/model.html', 'The Fossen model it predicts with.'],
    ['control/mpc.html', 'The optimal control problem.'],
    ['control/estimation.html', 'Feedback and the learned disturbance.'],
    ['control/identify.html', 'Fitting the model in the pool.'] ] },
  { id: 'pool', name: 'First pool test', who: 'You\'re coming to the pool and want to be useful, and safe.', steps: [
    ['computers.html', 'Which box is which, and how your laptop joins.'],
    ['viewer.html', 'Enable, KILL and the panels you\'ll use.'],
    ['commanding.html', 'Every way Talos stops, and who owns each kill.'],
    ['launch.html', 'Starting the stack in the right order, Talos killed.'],
    ['pool-test.html', 'The whole day, with a checklist for your phone.'],
    ['debugging.html', 'When something doesn\'t work: the order to check.'] ] },
];
const pathSeg = document.getElementById('path-seg'), pathBody = document.getElementById('path-body');
let pathSel = null;
pathSeg.innerHTML = PATHS.map((p) => `<button type="button" data-v="${p.id}" aria-pressed="false">${p.name}</button>`).join('');
pathSeg.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) showPath(b.dataset.v); });
function showPath(id) {
  pathSel = id;
  const p = PATHS.find((x) => x.id === id);
  pathSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === id)));
  pathBody.innerHTML = `<p class="ix-who">${p.who}</p><ol class="ix-steps">${p.steps.map(([h, why]) => {
    const c = CH.get(h.split('#')[0]);
    const where = c ? `${c.part.title}${c.n && c.n !== '' ? ` · ${c.n === '0' ? 'overview' : /^[A-Z]$/.test(c.n) ? 'appendix ' + c.n : 'chapter ' + c.n}` : ''}` : '';
    return `<li><a href="${url(h)}"><strong>${esc(chTitle(h))}</strong></a> <span class="ix-where">${where}</span><br><span>${why}</span></li>`;
  }).join('')}</ol>`;
  markPath(p);
}

// ============================================================================ every chapter
const DESC = {
  'robosub.html': 'The competition, the 2026 course task by task, and which parts of Talos each task uses.',
  'code-map.html': 'Every repo and package, which branch the robot runs, and which chapter explains it.',
  'ros2.html': 'Nodes, topics, services, actions, parameters, TF and Zenoh, with Talos\'s own names.',
  'setup.html': 'From a blank laptop to the code built and running in the simulator, and onto the robot.',
  'mechanical.html': 'The frame, the two-tube hull, where everything sits, trim, and how to get inside.',
  'electrical.html': 'Batteries, the kill switch, the power rails, CAN, and where every amp goes.',
  'boards.html': 'Every team-made board, its job and its parts, in an explorer of the real designs.',
  'firmware.html': 'The RP2040 code: build, CANmore, micro-ROS, kill logic, flashing and debugging.',
  'thrusters-hw.html': 'Eight T200s, the ESC boards, thrust curves, the thruster test and common failures.',
  'actuators.html': 'The launcher, the claw and the magnet, and how a shot gets from the tree to the spring.',
  'sensors.html': 'IMU, fibre-optic gyro, DVL, depth and hydrophone: what each measures and how it fails.',
  'cameras.html': 'Two ZED X Mini cameras, from the glass to a ROS topic, the detector and your laptop.',
  'localization.html': 'The EKF, its frames, why x, y and heading drift, and how the map re-anchors them.',
  'computers.html': 'The Orin, the launcher service, CAN, the networks, the opbox and time sync.',
  'perception/index.html': 'The detector and the map in one picture, with a whole mission replayed from above.',
  'perception/calibration.html': 'Pixels, lenses, and why the factory calibration is wrong underwater.',
  'perception/training.html': 'Recording, labelling, synthetic images from Nereus, augmentation.',
  'perception/detector.html': 'Pairing image and depth, and running YOLO on each frame.',
  'perception/pose.html': 'From a mask and depth to a 3D position and the way a prop faces.',
  'perception/composites.html': 'The torpedo board, the gate signs and the slalom: props made of pieces.',
  'perception/noise.html': 'A covariance for every detection, set by range, angle and motion.',
  'perception/tracking.html': 'A Kalman filter per prop: when to start, what to reject.',
  'perception/map.html': 'One shared offset for the whole course plus a small correction per prop.',
  'perception/frames.html': 'TF frames, mapping targets, locks, and what the mission tree asks for.',
  'perception/mission.html': 'The whole stack swimming the course in Nereus, against the truth.',
  'perception/workflow.html': 'Run it, break it, measure it, change it: the recipe.',
  'perception/math.html': 'Every perception equation on one page.',
  'control/index.html': 'The MPC loop, one 50 ms tick at a time, running live in your browser.',
  'control/model.html': 'Fossen\'s model of a rigid body in water, the same code the simulator runs.',
  'control/thrusters.html': 'Eight thrusters, six ways to move, and why a 30 ms delay belongs in the model.',
  'control/matters.html': 'Which of the model\'s numbers matter for holding still, and which for moving.',
  'control/reference.html': 'Jerk-limited profiles and smooth paths the vehicle can actually follow.',
  'control/mpc.html': 'The optimal control problem the controller solves every tick, written down exactly.',
  'control/solver.html': 'One Gauss–Newton step on a small dense QP, in about 11 ms.',
  'control/estimation.html': 'The estimator and the learned disturbance that make it offset-free.',
  'control/identify.html': 'Fitting buoyancy, drag, added mass and thruster gains in the pool.',
  'control/build.html': 'A recipe for your own vehicle: the order to build an MPC in.',
  'commanding.html': 'Setpoints, paths, teleop, how thrust reaches the propellers, and every kill.',
  'control/math.html': 'Every control equation on one page, with Talos\'s numbers.',
  'bt.html': 'How a behaviour tree runs, tick by tick, and how to read the team\'s XML.',
  'bt-nodes.html': 'All 44 custom nodes: what each does, its ports, what it talks to.',
  'mission-tree.html': 'The competition tree, task by task, replayed on a Nereus run.',
  'bt-workflow.html': 'Edit a tree, add a C++ node, test it alone, then fly it in Nereus.',
  'launch.html': 'What starts, in what order and why, on the robot and in the simulator.',
  'nereus.html': 'The simulator: what it simulates, how it is built, and what it doesn\'t do.',
  'viewer.html': 'The operator GUI for sim and pool: enable, kill, drive, trees, cameras.',
  'pool-test.html': 'The whole day, from freezing the code to tagging the release, with a checklist.',
  'debugging.html': 'What to check in what order, past failures, and recording runs to study later.',
  'interfaces.html': 'Every topic, service, action and TF frame, in one table.',
  'glossary.html': 'The words the team uses, in plain language.',
};
const chapterIndex = document.getElementById('chapter-index');
chapterIndex.innerHTML = PARTS.map((p) => {
  const items = p.chapters.filter((c) => c.href !== 'index.html');
  const tag = p.tag ? ` <span class="ix-tag">${p.tag}</span>` : '';
  return `<p class="part-label">${p.title}${tag}</p><ol class="chapter-list ix-list">${items.map((c) => {
    const n = c.n === '0' ? '0' : c.n;
    return `<li data-href="${c.href}"><span class="ix-n">${n}</span><div><a href="${url(c.href)}"><strong>${esc(c.title)}.</strong></a> ${esc(DESC[c.href] || '')}</div><span class="ix-badge" hidden></span></li>`;
  }).join('')}</ol>`;
}).join('');
function markPath(p) {
  const order = new Map(p.steps.map(([h], i) => [h.split('#')[0], i + 1]));
  chapterIndex.querySelectorAll('li[data-href]').forEach((li) => {
    const k = order.get(li.dataset.href);
    const b = li.querySelector('.ix-badge');
    li.classList.toggle('in-path', !!k);
    b.hidden = !k;
    if (k) { b.textContent = k; b.title = `Step ${k} of the ${p.name} path`; }
  });
}
showPath('software');
