// Talos in the pool with sensor markers, for the Navigation sensors chapter. A trimmed copy of viz/scene.js:
// the CAD model (models/talos-cad.glb), floor and lights, plus markers and frame axes drawn through the hull, and
// tap-to-pick. Picking a sensor tints its CAD part (where the CAD has one) and turns the camera to a view that
// shows it: from below for the DVL and the hydrophone pod, from starboard and behind for the IMU and depth sensor.
// Everything inside `root` is in ROS coordinates (x forward, y left, z up); root turns them into three's y-up.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BASE = import.meta.env.BASE_URL;
const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#e9f4f5';
  g.fillRect(0, 0, 512, 512);
  g.strokeStyle = '#b9d6db';
  g.lineWidth = 3;
  for (let i = 0; i <= 512; i += 64) {
    g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i); g.lineTo(512, i); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ROS fixed-axis roll-pitch-yaw to a rotation: R = Rz(yaw) Ry(pitch) Rx(roll).
function rpyMatrix(r, p, y) {
  return new THREE.Matrix4().makeRotationZ(y).multiply(new THREE.Matrix4().makeRotationY(p)).multiply(new THREE.Matrix4().makeRotationX(r));
}

// sensors: [{id, poses: [[x, y, z, roll, pitch, yaw], ...]}] in the vehicle config's `origin` frame.
// baseLink: base_link in `origin`. onPick(id) when a marker is tapped.
export function createSensorScene(canvas, { sensors, baseLink, onPick, labelHost }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.fog = new THREE.Fog(0xcfe7ec, 6, 18);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 60);
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  scene.add(root);
  const toThree = (p) => v3(p).applyEuler(root.rotation);

  // Talos sits with base_link at P, level and facing +x; a point q of `origin` is at P + q - base_link.
  const P = [0, 0, -1];
  const at = (q) => [P[0] + q[0] - baseLink[0], P[1] + q[1] - baseLink[1], P[2] + q[2] - baseLink[2]];
  const target = at([-0.15, 0.03, -0.05]);
  camera.position.copy(toThree([target[0] + 0.95, target[1] + 0.9, target[2] + 0.5]));
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(toThree(target));
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.6;
  controls.maxDistance = 5;
  controls.update();
  // OrbitControls claims every touch (touch-action: none); give vertical swipes back to the page so it still scrolls.
  canvas.style.touchAction = 'pan-y';

  scene.add(new THREE.HemisphereLight(0xf2fbff, 0x7aa9b3, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 8, 4);
  scene.add(sun);
  // A softer light from below, for the views from under Talos (DVL, hydrophone).
  const under = new THREE.DirectionalLight(0xffffff, 0.9);
  under.position.set(-2, -6, 1);
  scene.add(under);
  const tex = tileTexture();
  tex.repeat.set(16, 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), new THREE.MeshLambertMaterial({ map: tex }));
  floor.position.z = -2.2;
  root.add(floor);

  const body = new THREE.Group();
  body.position.copy(v3(at([0, 0, 0])));
  root.add(body);
  // The CAD model is in the assembly frame (+X port, +Y up, +Z bow, metres). Into talos.yaml's `origin` frame:
  // x = Z + CAD_OFF[0], y = X + CAD_OFF[1], z = Y + CAD_OFF[2]; the offset puts the CAD's DVL on talos.yaml's DVL pose.
  const CAD_OFF = [-0.121, 0.034, 0];
  const cad = new THREE.Group();
  cad.matrixAutoUpdate = false;
  cad.matrix.set(0, 0, 1, CAD_OFF[0], 1, 0, 0, CAD_OFF[1], 0, 1, 0, CAD_OFF[2], 0, 0, 0, 1);
  body.add(cad);
  // Sensor id -> the CAD node that is that sensor (the IMU and depth sensor are inside bigger nodes: dots only).
  const PART = { dvl: 'dvl', hydro: 'acoustics' };
  const GREY = 0xc9d0d4, TINT = 0xe0703f;
  const parts = new Map();
  let picked = null;
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`${BASE}models/talos-cad.glb`, (g) => {
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry = toCreasedNormals(o.geometry, (35 * Math.PI) / 180);
      // One light grey for the whole robot, so only the chosen sensor and the markers carry colour.
      o.material = new THREE.MeshStandardMaterial({ color: GREY, metalness: 0.15, roughness: 0.6, envMap, envMapIntensity: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
      parts.set(o.name || o.parent?.name, o);
    });
    cad.add(g.scene);
    tint();
  });
  function tint() {
    for (const [name, o] of parts) {
      const on = PART[picked] === name;
      o.material.color.set(on ? TINT : GREY);
      o.material.opacity = on ? 1 : 0.92;
    }
  }

  // Markers and frame axes, drawn over the hull (no depth test).
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const overlay = (mat) => { mat.depthTest = false; mat.transparent = true; return mat; };
  const dotGeo = new THREE.SphereGeometry(0.016, 20, 14);
  const AX = 0.22; // axis arrow length: long enough to read past the hull, short enough not to cross the picture
  const shaftGeo = new THREE.CylinderGeometry(0.007, 0.007, AX, 10);
  const headGeo = new THREE.ConeGeometry(0.02, 0.05, 14);
  const ACCENT = 0xd9480f, MUTED = 0x546d79;
  const items = [];
  const axisColors = [css('--s8') || '#e34948', css('--s6') || '#008300', css('--state') || '#2a78d6'];
  for (const s of sensors) {
    s.poses.forEach((pose, k) => {
      const pos = at(pose);
      if (s.arrow) {
        // A muted arrow from base_link to this point (used for 'front'); the label sits at its tip.
        const from = v3(at(baseLink)), to = v3(pos), dir = to.clone().sub(from), len = dir.length();
        const mat = overlay(new THREE.MeshBasicMaterial({ color: 0x546d79, opacity: 0.85 }));
        const arrow = new THREE.Group();
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, len - 0.04, 10), mat);
        shaft.position.y = (len - 0.04) / 2;
        const head = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.04, 14), mat);
        head.position.y = len - 0.02;
        shaft.renderOrder = head.renderOrder = 9;
        arrow.add(shaft, head);
        arrow.position.copy(from);
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
        root.add(arrow);
        const label = labelHost ? document.createElement('span') : null;
        if (label) { label.className = 'sx-label muted'; label.textContent = s.label; labelHost.appendChild(label); }
        items.push({ id: s.id, muted: true, mesh: null, axes: null, label, pos, anchor: 'tip', from: at(baseLink) });
        return;
      }
      const mesh = new THREE.Mesh(dotGeo, overlay(new THREE.MeshBasicMaterial({ color: s.muted ? MUTED : ACCENT })));
      mesh.position.copy(v3(pos));
      mesh.renderOrder = 10;
      mesh.visible = !s.axisOnly; // the FOG has no position on record: only its axis is drawn
      root.add(mesh);
      const axes = new THREE.Group();
      axes.position.copy(v3(pos));
      const R = rpyMatrix(pose[3] || 0, pose[4] || 0, pose[5] || 0);
      const mats = [];
      (s.axisOnly ? [[0, 0, 1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]]).forEach((a, j) => {
        const i = s.axisOnly ? 2 : j;
        // A thick arrow (WebGL lines are always 1 px): a cylinder shaft and a cone head along +Y, turned onto the axis.
        const mat = overlay(new THREE.MeshBasicMaterial({ color: s.axisOnly ? MUTED : axisColors[i] }));
        mats.push(mat);
        const arrow = new THREE.Group();
        const shaft = new THREE.Mesh(shaftGeo, mat);
        shaft.position.y = AX / 2;
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = AX + 0.022;
        shaft.renderOrder = head.renderOrder = 11;
        arrow.add(shaft, head);
        if (s.axisOnly) arrow.scale.set(1, 0.6, 1); // the FOG's axis at base_link: short, so it doesn't cross the picture
        arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v3(a).applyMatrix4(R).normalize());
        axes.add(arrow);
      });
      axes.visible = false;
      root.add(axes);
      let label = null;
      if (labelHost && k === 0) {
        label = document.createElement('button');
        label.type = 'button';
        label.className = 'sx-label' + (s.muted ? ' muted' : '');
        label.textContent = s.label;
        label.dataset.full = s.label;
        if (s.shortLabel) label.dataset.short = s.shortLabel;
        if (!s.muted) label.addEventListener('click', () => onPick?.(s.id));
        else label.tabIndex = -1;
        labelHost.appendChild(label);
      }
      items.push({ id: s.id, muted: s.muted, axisOnly: s.axisOnly, noAxes: s.noAxes, mats, mesh, axes, label, pos, anchor: s.anchor });
    });
  }

  function select(id) {
    for (const it of items) {
      if (!it.mesh) continue;
      const on = it.id === id;
      it.axes.visible = on && !it.muted && !it.noAxes;
      it.mesh.material.color.set(it.muted ? MUTED : ACCENT);
      it.mesh.scale.setScalar(on ? 1.3 : it.muted ? 0.7 : 1);
      // the FOG's axis: grey until the FOG is picked, then blue like every z axis
      if (it.axisOnly) it.mats.forEach((m) => m.color.set(on ? axisColors[2] : MUTED));
      if (it.label) it.label.classList.toggle('on', on);
      // the FOG's label only while the FOG is picked: otherwise it floats over the middle of the hull
      if (it.label && it.axisOnly) it.label.hidden = !on;
    }
    picked = id;
    tint();
    const v = viewFor(id);
    if (v) flyTo(v.target, v.offset);
  }

  // Per-sensor camera: [target in `origin`, camera offset from it in ROS axes (x forward, y left, z up)].
  const posOf = (id) => items.find((it) => it.id === id)?.pos;
  function viewFor(id) {
    const p = posOf(id);
    if (!p) return null;
    if (id === 'dvl') return { target: p, offset: [0.5, 0.36, -1.2] };       // from below, a little forward and to port
    if (id === 'hydro') {                                                    // from below: the pod beside the DVL
      const d = posOf('dvl');
      return { target: [(p[0] + d[0]) / 2, (p[1] + d[1]) / 2, (p[2] + d[2]) / 2], offset: [0.55, 0.5, -1.4] };
    }
    if (id === 'imu') return { target: p, offset: [-0.85, -0.75, 0.55] };      // from starboard, behind and above
    if (id === 'depth') return { target: p, offset: [-1.0, -0.6, 0.3] };       // from behind, starboard
    return { target, offset: [0.95, 0.9, 0.5] };                             // the FOG: the default view
  }
  let tween = null;
  function flyTo(t, off) {
    const toT = toThree(t), toO = toThree(off);
    tween = { t0: performance.now(), ms: 700, fromT: controls.target.clone(), toT, fromO: camera.position.clone().sub(controls.target), toO };
  }
  controls.addEventListener('start', () => (tween = null));
  function step(now) {
    if (!tween) return;
    const k = Math.min(1, (now - tween.t0) / tween.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const len = THREE.MathUtils.lerp(tween.fromO.length(), tween.toO.length(), e);
    const dir = tween.fromO.clone().normalize().lerp(tween.toO.clone().normalize(), e);
    if (dir.lengthSq() < 1e-6) dir.copy(tween.toO).normalize();
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    camera.position.copy(controls.target).addScaledVector(dir.normalize(), len);
    if (k >= 1) tween = null;
  }

  // Taps: the nearest marker within 30 px of the finger, so small dots are easy to hit on a phone.
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const r = canvas.getBoundingClientRect();
    let best = null, bd = 30;
    for (const it of items) {
      if (it.muted) continue;
      const p = toThree(it.pos).project(camera);
      const d = Math.hypot((p.x + 1) / 2 * r.width - (e.clientX - r.left), (1 - p.y) / 2 * r.height - (e.clientY - r.top));
      if (d < bd) { bd = d; best = it; }
    }
    if (best) onPick?.(best.id);
  });

  let fitted = false;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (!fitted) {
      fitted = true;
      if (w < 560) camera.position.sub(controls.target).multiplyScalar(1.1).add(controls.target);
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Labels follow their markers (on the side given by `anchor`); one that would leave the view is clamped to its edge.
  // nw / ne: diagonally up and away, for markers that sit close together.
  const OFFSET = { above: 'translate(-50%, -150%)', below: 'translate(-50%, 55%)', left: 'translate(calc(-100% - 9px), -50%)', right: 'translate(9px, -50%)',
    nw: 'translate(calc(-100% - 7px), calc(-100% - 7px))', ne: 'translate(7px, calc(-100% - 7px))' };
  let narrowLabels = null;
  function placeLabels() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Short names on a phone, so the labels don't cover the markers.
    if ((w < 480) !== narrowLabels) {
      narrowLabels = w < 480;
      for (const it of items) if (it.label?.dataset.short) it.label.textContent = narrowLabels ? it.label.dataset.short : it.label.dataset.full;
    }
    for (const it of items) {
      if (!it.label) continue;
      const p = toThree(it.pos).project(camera);
      if (it.anchor === 'tip') {
        // Just beyond the arrow's tip, along the arrow as seen on screen.
        const q = toThree(it.from).project(camera);
        const tx = (p.x + 1) / 2 * w, ty = (1 - p.y) / 2 * h;
        let dx = tx - (q.x + 1) / 2 * w, dy = ty - (1 - q.y) / 2 * h;
        const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
        const lw = it.label.offsetWidth || 0, lh = it.label.offsetHeight || 0;
        const k = Math.min((lw / 2 + 6) / (Math.abs(dx) || 1e-6), (lh / 2 + 6) / (Math.abs(dy) || 1e-6));
        const x = Math.min(Math.max(tx + dx * k, lw / 2 + 4), w - lw / 2 - 4), y = Math.min(Math.max(ty + dy * k, 14), h - 14);
        it.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
        continue;
      }
      // Keep the whole label inside the view: its width decides how close to an edge the anchor point may go.
      const lw = it.label.offsetWidth || 0, a = it.anchor || 'above';
      const left = a === 'left' || a === 'nw', right = a === 'right' || a === 'ne';
      const lo = left ? lw + 13 : right ? 4 : lw / 2 + 4;
      const hi = left ? w - 4 : right ? w - lw - 13 : w - lw / 2 - 4;
      const top = a === 'nw' || a === 'ne' ? 34 : 14;
      const x = Math.min(Math.max((p.x + 1) / 2 * w, lo), Math.max(lo, hi)), y = Math.min(Math.max((1 - p.y) / 2 * h, top), h - 10);
      it.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${OFFSET[it.anchor] || OFFSET.above}`;
    }
    // Labels that would overlap: the picked one wins, then the order of the list; the losers fade out.
    const shown = [];
    const order = items.filter((it) => it.label && !it.label.hidden).sort((a, b) => (b.label.classList.contains('on') - a.label.classList.contains('on')));
    for (const it of order) {
      const r = it.label.getBoundingClientRect();
      const hit = shown.some((q) => r.left < q.right + 2 && r.right > q.left - 2 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
      it.label.style.visibility = hit ? 'hidden' : '';
      if (!hit) shown.push(r);
    }
  }
  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);
  renderer.setAnimationLoop((now) => {
    if (!visible) return;
    step(now);
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
  });
  return { select };
}
