// The CAD model of Talos (public/models/talos-cad.glb) for the "Hull, frame and layout" chapter: pick a system
// (the camera flies to a view that shows it), make the hull see-through, pull the systems apart, mark COM and COB.
// Everything is in the CAD frame (three's own axes): +X port, +Y up, +Z bow, metres.
//
// Phones: the canvas keeps touch-action pan-y, so a vertical swipe scrolls the page; a sideways drag turns the
// model and two fingers zoom.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BASE = import.meta.env.BASE_URL;
const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const GHOST = new THREE.Color('#c9d6d9');
const UP = new THREE.Vector3(0, 1, 0);
// GLTFLoader turns spaces and some punctuation in node names into underscores: compare names in that form.
const key = (n) => String(n || '').replace(/[^A-Za-z0-9-]/g, '_');

// Split a mesh's triangles into two geometries by the sign of their centroid's x (the two battery pods are one node).
function splitByX(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position.array;
  const a = [], b = [];
  for (let i = 0; i < pos.length; i += 9) {
    const cx = (pos[i] + pos[i + 3] + pos[i + 6]) / 3;
    const dst = cx >= 0 ? a : b;
    for (let k = 0; k < 9; k++) dst.push(pos[i + k]);
  }
  return [a, b].map((arr) => {
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return out;
  });
}

// groups: [{ id, name, nodes: [glb node names], colour, view: [x,y,z] camera direction, explode: [dx,dy,dz], inside, split,
//   splitX: [node names cut in two at x = 0, e.g. the acoustics node: hydrophone pod and transducer],
//   minBox: smallest box (m) the camera frames for this group, hideMarkers: hide the COM/COB pills while picked }]
// markers: [{ id, label, pos, color, side: 'left'|'right' }]; thrusterLabels: [{ node, name, dir }]
// partLabels: [{ group, node, half: 1 (x >= 0) | -1 (x < 0) | undefined, name }]: name pills shown while their group is picked
export function createExplorer(canvas, { groups, markers = [], thrusterLabels = [], partLabels = [], labelHost, home: homeDir = [1.05, 0.62, 1.2], onPick, onLoad, onHullAuto }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.parentElement.classList.add('no-gl');
    return null;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 30);
  camera.position.set(1.4, 0.8, 1.6);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.35;
  controls.maxDistance = 6;
  // OrbitControls sets touch-action:none, which traps a phone reader's scroll: let vertical swipes scroll the page.
  canvas.style.touchAction = 'pan-y';
  // Same for the mouse wheel: it scrolls the page until the reader clicks or touches the model.
  controls.enableZoom = false;
  canvas.addEventListener('pointerdown', () => (controls.enableZoom = true), true);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') controls.enableZoom = false; });

  scene.add(new THREE.HemisphereLight(0xf7fbfc, 0x8a9ea6, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55);
  fill.position.set(-3, -2, -2);
  scene.add(fill);

  const model = new THREE.Group();
  scene.add(model);
  const byGroup = new Map(groups.map((g) => [g.id, { ...g, meshes: [] }]));
  const nodeToGroup = new Map();
  groups.forEach((g) => g.nodes.forEach((n) => nodeToGroup.set(key(n), g.id)));
  const thrusterMeshes = new Map();

  // COM / COB markers: a small sphere in the model, an HTML label beside it.
  const marks = markers.map((m) => {
    const d = document.createElement('div');
    d.className = 'mx-mark ' + (m.side === 'left' ? 'left' : 'right');
    d.innerHTML = `<span style="border-color:${m.color}">${m.label}</span>`;
    d.hidden = true;
    labelHost.appendChild(d);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.009, 18, 12), new THREE.MeshBasicMaterial({ color: m.color, depthTest: false, transparent: true }));
    mesh.position.copy(v3(m.pos));
    mesh.renderOrder = 20;
    mesh.visible = false;
    scene.add(mesh);
    return { el: d, mesh, pos: v3(m.pos) };
  });
  // Name pills: the thrusters' names, and the parts of groups that hold several things (Sensors, Tools).
  const tnames = [...thrusterLabels.map((t) => ({ ...t, group: 'thrusters' })), ...partLabels].map((t) => {
    const d = document.createElement('div');
    d.className = 'mx-tname';
    d.textContent = t.name;
    d.hidden = true;
    labelHost.appendChild(d);
    return { el: d, t, pos: new THREE.Vector3(), mesh: null };
  });
  const partMeshes = new Map(); // node key + half -> mesh
  // Part pills (not the thrusters') get a dot on the part and a leader line to the pill.
  const leadSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  leadSvg.setAttribute('class', 'mx-leads');
  labelHost.prepend(leadSvg);
  tnames.forEach((t) => {
    if (t.t.group === 'thrusters') return;
    t.line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    t.dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    t.dot.setAttribute('r', 3.5);
    leadSvg.append(t.line, t.dot);
  });
  // Thrust direction arrows, shown with the thrusters.
  const arrows = [];

  let selected = null, hullMode = 'solid', explode = 0, loaded = false, markersOn = false;

  function applyLook() {
    for (const [id, g] of byGroup) {
      const on = !selected || selected === id;
      for (const m of g.meshes) {
        const mat = m.material;
        const isHull = id === 'hull';
        mat.color.copy(on ? m.userData.color : GHOST);
        let opacity = on ? 1 : 0.16;
        if (isHull && hullMode === 'glass') opacity = selected && !on ? 0.07 : 0.2;
        mat.opacity = opacity;
        mat.transparent = opacity < 1;
        mat.depthWrite = opacity >= 1;
        mat.emissive.set(selected && on ? m.userData.color : 0x000000);
        mat.emissiveIntensity = selected && on ? 0.25 : 0;
        m.visible = !(isHull && hullMode === 'off');
        m.renderOrder = opacity < 1 ? 2 : 0;
      }
    }
    const thr = selected === 'thrusters';
    tnames.forEach((t) => {
      t.el.hidden = !t.mesh || t.t.group !== selected;
      if (t.line) t.line.style.display = t.dot.style.display = t.el.hidden ? 'none' : '';
    });
    arrows.forEach((a) => (a.visible = thr));
    const g = selected && byGroup.get(selected);
    marks.forEach((m) => { m.el.style.display = g?.hideMarkers ? 'none' : ''; m.mesh.visible = markersOn && !g?.hideMarkers; });
  }

  function applyExplode() {
    for (const g of byGroup.values()) {
      const e = g.explode || [0, 0, 0];
      g.meshes.forEach((m) => {
        const k = m.userData.explode || e;
        m.position.set(k[0] * explode, k[1] * explode, k[2] * explode);
      });
    }
  }

  // Bounding box of a group (or of everything), as drawn now (pulled apart or not).
  function boxOf(id) {
    const box = new THREE.Box3();
    for (const [gid, g] of byGroup) {
      if (id && gid !== id) continue;
      for (const m of g.meshes) {
        if (!m.visible && !(gid === 'hull' && id === 'hull')) continue;
        const b = m.userData.box.clone().translate(m.position);
        box.union(b);
      }
    }
    return box;
  }

  // Camera distance along dir so that every point (box corners, or sampled mesh vertices) fits within `fill` of the view.
  function fitDistance(points, target, dir, fillK) {
    const fwd = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(fwd, UP).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd);
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * fillK;
    const tanH = tanV * camera.aspect;
    let d = 0;
    const c = new THREE.Vector3();
    for (const [arr, off] of points) {
      for (let i = 0; i < arr.length; i += 3) {
        c.set(arr[i] + off.x - target.x, arr[i + 1] + off.y - target.y, arr[i + 2] + off.z - target.z);
        const a = c.dot(dir);
        d = Math.max(d, a + Math.abs(c.dot(right)) / tanH, a + Math.abs(c.dot(up)) / tanV);
      }
    }
    return Math.max(d, controls.minDistance);
  }
  const corners = (box) => [[new Float32Array([0, 1, 2, 3, 4, 5, 6, 7].flatMap((i) => [i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z])), new THREE.Vector3()]];
  // Sampled vertices of what's drawn now (one group, or everything), with each mesh's pull-apart offset.
  function pointsOf(id) {
    const out = [];
    for (const [gid, g] of byGroup) {
      if (id && gid !== id) continue;
      for (const m of g.meshes) if (m.visible || gid === id) out.push([m.userData.sample, m.position]);
    }
    return out;
  }

  // The view for the current selection: its preset direction, centred on it, filling ~60 % of the canvas
  // (the whole robot fills ~95 % in the overview).
  function viewFor(dirOverride) {
    const g = selected && byGroup.get(selected);
    const dir = (dirOverride || v3(g?.view || homeDir)).clone().normalize();
    let box = boxOf(g ? selected : null);
    let pts = pointsOf(g ? selected : null);
    if (box.isEmpty()) { box = boxOf(null); pts = pointsOf(null); }
    const target = box.getCenter(new THREE.Vector3());
    // Pulled apart, the overview may clip the far thruster guards a little rather than shrink the robot.
    let dist = fitDistance(pts, target, dir, g ? g.fill || 0.62 : 0.9 + 0.2 * explode);
    // Small parts: frame at least a 0.3 m box, so some of the robot around them stays in view.
    const mb = g?.minBox ?? 0.3;
    if (g) dist = Math.max(dist, fitDistance(corners(new THREE.Box3().setFromCenterAndSize(target, new THREE.Vector3(mb, mb, mb))), target, dir, 0.62));
    return { target, pos: target.clone().addScaledVector(dir, dist) };
  }

  let tween = null;
  function go(view, ms = 750) {
    if (!ms) {
      tween = null;
      controls.target.copy(view.target);
      camera.position.copy(view.pos);
      controls.update();
      return;
    }
    tween = { t0: performance.now(), ms, fromT: controls.target.clone(), fromO: camera.position.clone().sub(controls.target), toT: view.target, toO: view.pos.clone().sub(view.target) };
  }
  function stepTween(now) {
    if (!tween) return;
    let k = Math.min(1, (now - tween.t0) / tween.ms);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const len = THREE.MathUtils.lerp(tween.fromO.length(), tween.toO.length(), e);
    const dir = tween.fromO.clone().normalize().lerp(tween.toO.clone().normalize(), e);
    if (dir.lengthSq() < 1e-6) dir.copy(tween.toO).normalize();
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    camera.position.copy(controls.target).addScaledVector(dir.normalize(), len);
    if (k >= 1) tween = null;
  }
  let touched = false;
  controls.addEventListener('start', () => { tween = null; touched = true; });

  new GLTFLoader().load(`${BASE}models/talos-cad.glb`, (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      let name = key(o.name);
      let id = nodeToGroup.get(name);
      if (!id) { name = key(o.parent?.name); id = nodeToGroup.get(name); }
      if (!id) return;
      const g = byGroup.get(id);
      const color = new THREE.Color(g.colour);
      const world = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const cut = g.split || g.splitX?.some((n) => key(n) === name);
      const parts = cut ? splitByX(world) : [world];
      parts.forEach((geo, k) => {
        const mesh = new THREE.Mesh(toCreasedNormals(geo, (35 * Math.PI) / 180),
          new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6, envMap, envMapIntensity: 0.35, side: THREE.DoubleSide }));
        mesh.geometry.computeBoundingBox();
        const pos = mesh.geometry.attributes.position.array, step = 3 * Math.max(1, Math.floor(pos.length / 3 / 400));
        const sample = [];
        for (let i = 0; i < pos.length; i += step) sample.push(pos[i], pos[i + 1], pos[i + 2]);
        mesh.userData = { group: id, color, box: mesh.geometry.boundingBox.clone(), sample: new Float32Array(sample) };
        if (g.split) mesh.userData.explode = [(k === 0 ? 1 : -1) * g.split, 0, 0];
        if (id === 'thrusters') thrusterMeshes.set(name, mesh);
        partMeshes.set(cut ? `${name}|${k === 0 ? 1 : -1}` : name, mesh);
        g.meshes.push(mesh);
        model.add(mesh);
      });
    });
    // A thrust-direction arrow at each thruster's mesh centre.
    for (const t of thrusterLabels) {
      const m = thrusterMeshes.get(key(t.node));
      if (!m) continue;
      const c = m.userData.box.getCenter(new THREE.Vector3());
      const tn = tnames.find((x) => x.t.node === t.node && x.t.group === 'thrusters');
      tn.pos.copy(c);
      tn.mesh = m;
      const dir = v3(t.dir).normalize();
      const a = new THREE.ArrowHelper(dir, c.clone().addScaledVector(dir, 0.06), 0.16, 0xd9480f, 0.05, 0.035);
      a.line.material.depthTest = false; a.cone.material.depthTest = false;
      a.renderOrder = 15;
      a.visible = false;
      arrows.push(a);
      scene.add(a);
    }
    // Part pills sit at the centre of their mesh (or half-mesh).
    for (const tn of tnames) {
      if (tn.t.group === 'thrusters') continue;
      const m = partMeshes.get(tn.t.half ? `${key(tn.t.node)}|${tn.t.half}` : key(tn.t.node));
      if (!m) continue;
      tn.mesh = m;
      m.userData.box.getCenter(tn.pos);
    }
    loaded = true;
    applyLook();
    applyExplode();
    resize(true);
    go(viewFor(), 0);
    onLoad?.();
  }, undefined, () => onLoad?.(new Error('model failed to load')));

  // Picking: a tap (not a drag) on the model selects the group under the finger; empty space clears.
  const ray = new THREE.Raycaster();
  const ndc = (e) => {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  function hit(e) {
    if (!loaded) return null;
    ray.setFromCamera(ndc(e), camera);
    const targets = [];
    for (const [id, g] of byGroup) {
      if (id === 'hull' && hullMode !== 'solid') continue; // see through the glass to what's inside
      g.meshes.forEach((m) => m.visible && targets.push(m));
    }
    const h = ray.intersectObjects(targets, false)[0];
    return h ? h.object.userData.group : null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || performance.now() - down.t > 700) return;
    onPick?.(hit(e));
  });
  // Hover (mouse only): name what's under the pointer.
  const tip = labelHost.parentElement.querySelector('.mx-tip');
  let hoverQueued = null;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) { if (tip) tip.hidden = true; return; }
    hoverQueued = e;
  });
  canvas.addEventListener('pointerleave', () => { if (tip) tip.hidden = true; hoverQueued = null; });
  function doHover() {
    const e = hoverQueued;
    hoverQueued = null;
    if (!e || !tip) return;
    const id = hit(e);
    const g = id && byGroup.get(id);
    canvas.style.cursor = g ? 'pointer' : '';
    if (!g) { tip.hidden = true; return; }
    const r = canvas.getBoundingClientRect();
    tip.textContent = g.name;
    tip.hidden = false;
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top - 10}px)`;
  }

  let lastW = 0, lastH = 0;
  function resize(force) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || (!force && w === lastW && h === lastH)) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (loaded && !touched && !force) go(viewFor(), 0);
  }
  new ResizeObserver(() => resize()).observe(canvas);
  resize(true);

  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function project(p, w, h) {
    tmp.copy(p).project(camera);
    return { x: (tmp.x + 1) / 2 * w, y: (1 - tmp.y) / 2 * h, behind: tmp.z > 1 };
  }
  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);
  renderer.setAnimationLoop((now) => {
    if (!visible) return;
    stepTween(now);
    controls.update();
    renderer.render(scene, camera);
    if (hoverQueued) doHover();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    marks.forEach((m) => {
      if (m.el.hidden) return;
      const p = project(m.pos, w, h);
      m.el.style.visibility = p.behind ? 'hidden' : '';
      m.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`;
    });
    // Name pills: above the part if there's room, else below, right or left; a pill that fits nowhere is skipped.
    const placed = [];
    tnames.forEach((t) => {
      if (t.el.hidden) return;
      const p = project(tmp2.copy(t.pos).add(t.mesh.position), w, h);
      const bw = t.el.offsetWidth, bh = t.el.offsetHeight;
      const spots = [[p.x - bw / 2, p.y - bh - 14], [p.x - bw / 2, p.y + 14], [p.x + 16, p.y - bh / 2], [p.x - bw - 16, p.y - bh / 2]];
      const free = ([x, y]) => !(x < 0 || y < 0 || x + bw > w || y + bh > h || placed.some((r) => x < r.x + r.w + 3 && x + bw + 3 > r.x && y < r.y + r.h + 2 && y + bh + 2 > r.y));
      const spot = p.behind ? null : spots.find(free);
      t.el.style.visibility = spot ? '' : 'hidden';
      if (t.line) {
        t.line.style.display = t.dot.style.display = spot ? '' : 'none';
        if (spot) {
          const ex = Math.min(Math.max(p.x, spot[0]), spot[0] + bw), ey = Math.min(Math.max(p.y, spot[1]), spot[1] + bh);
          t.line.setAttribute('x1', p.x); t.line.setAttribute('y1', p.y); t.line.setAttribute('x2', ex); t.line.setAttribute('y2', ey);
          t.dot.setAttribute('cx', p.x); t.dot.setAttribute('cy', p.y);
        }
      }
      if (!spot) return;
      placed.push({ x: spot[0], y: spot[1], w: bw, h: bh });
      t.el.style.transform = `translate(${spot[0].toFixed(1)}px, ${spot[1].toFixed(1)}px)`;
    });
  });

  return {
    select(id) {
      selected = id || null;
      const g = selected && byGroup.get(selected);
      if (g?.inside && hullMode === 'solid') { hullMode = 'glass'; onHullAuto?.('glass'); }
      applyLook();
      if (loaded) { touched = false; go(viewFor()); }
    },
    setHull(mode) { hullMode = mode; applyLook(); },
    setExplode(k) {
      explode = k;
      applyExplode();
      // Refit from the current direction so nothing is pushed out of the canvas.
      if (loaded) go(viewFor(camera.position.clone().sub(controls.target).normalize()), 0);
    },
    setMarkers(on) { markersOn = on; marks.forEach((m) => { m.el.hidden = !on; }); applyLook(); },
    reset() { touched = false; if (loaded) go(viewFor()); },
  };
}
