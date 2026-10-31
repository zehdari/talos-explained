// Talos in the pool with sensor markers, for the Navigation sensors chapter. A trimmed copy of viz/scene.js:
// the model, floor and lights, plus markers and frame axes drawn through the hull, and tap-to-pick.
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

  scene.add(new THREE.HemisphereLight(0xf2fbff, 0x7aa9b3, 2.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 8, 4);
  scene.add(sun);
  const tex = tileTexture();
  tex.repeat.set(16, 16);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(32, 32), new THREE.MeshLambertMaterial({ map: tex }));
  floor.position.z = -2.2;
  root.add(floor);

  const body = new THREE.Group();
  body.position.copy(v3(at([0, 0, 0])));
  root.add(body);
  new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(`${BASE}models/talos.glb`, (g) => {
    g.scene.traverse((o) => {
      if (!o.isMesh) return;
      const m = o.material;
      o.geometry = toCreasedNormals(o.geometry, (35 * Math.PI) / 180);
      o.material = new THREE.MeshStandardMaterial({ color: m.color, metalness: 0.3, roughness: 0.5, envMap, envMapIntensity: 0.45, side: m.side });
    });
    body.add(g.scene);
  });

  // Markers and frame axes, drawn over the hull (no depth test).
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const overlay = (mat) => { mat.depthTest = false; mat.transparent = true; return mat; };
  const dotGeo = new THREE.SphereGeometry(0.022, 20, 14);
  const shaftGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.18, 10);
  const headGeo = new THREE.ConeGeometry(0.018, 0.045, 14);
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
      const mesh = new THREE.Mesh(dotGeo, overlay(new THREE.MeshBasicMaterial({ color: s.muted ? 0x546d79 : 0x0f2633 })));
      mesh.position.copy(v3(pos));
      mesh.renderOrder = 10;
      root.add(mesh);
      const axes = new THREE.Group();
      axes.position.copy(v3(pos));
      const R = rpyMatrix(pose[3] || 0, pose[4] || 0, pose[5] || 0);
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((a, i) => {
        // A thick arrow (WebGL lines are always 1 px): a cylinder shaft and a cone head along +Y, turned onto the axis.
        const mat = overlay(new THREE.MeshBasicMaterial({ color: axisColors[i] }));
        const arrow = new THREE.Group();
        const shaft = new THREE.Mesh(shaftGeo, mat);
        shaft.position.y = 0.09;
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = 0.2;
        shaft.renderOrder = head.renderOrder = 11;
        arrow.add(shaft, head);
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
      items.push({ id: s.id, muted: s.muted, mesh, axes, label, pos, anchor: s.anchor });
    });
  }

  function select(id) {
    for (const it of items) {
      if (!it.mesh) continue;
      const on = it.id === id;
      it.axes.visible = on && !it.muted;
      it.mesh.material.color.set(on ? 0xd9480f : it.muted ? 0x546d79 : 0x0f2633);
      it.mesh.scale.setScalar(on ? 1.35 : it.muted ? 0.7 : 1);
      if (it.label) it.label.classList.toggle('on', on);
    }
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
  }
  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    controls.update();
    renderer.render(scene, camera);
    placeLabels();
  });
  return { select };
}
