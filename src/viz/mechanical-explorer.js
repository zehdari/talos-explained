// The CAD model of Talos (public/models/talos-cad.glb) for the "Hull, frame and layout" chapter: pick a system,
// make the hull see-through, pull the systems apart, show the COM / COB / base_link markers.
// Everything is in the CAD frame (three's own axes): +X port, +Y up, +Z bow, metres.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const BASE = import.meta.env.BASE_URL;
const v3 = (p) => new THREE.Vector3(p[0], p[1], p[2]);
const GHOST = new THREE.Color('#c9d6d9');
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

// groups: [{ id, nodes: [glb node names], anchor: [x,y,z], explode: [dx,dy,dz], inside, split }]
// markers: [{ id, label, pos, color }]; thrusterLabels: [{ node, name, dir }]
export function createExplorer(canvas, { groups, markers = [], thrusterLabels = [], labelHost, onPick, onLoad, onHullAuto }) {
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
  const camera = new THREE.PerspectiveCamera(32, 1, 0.02, 30);
  const home = { target: new THREE.Vector3(0, -0.06, 0.02), dir: new THREE.Vector3(1.05, 0.62, 1.2).normalize(), dist: 2.0 };
  camera.position.copy(home.target).addScaledVector(home.dir, home.dist);
  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(home.target);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 0.7;
  controls.maxDistance = 5;
  controls.update();

  scene.add(new THREE.HemisphereLight(0xf7fbfc, 0x8a9ea6, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.4);
  fill.position.set(-3, -1, -2);
  scene.add(fill);

  const model = new THREE.Group();
  scene.add(model);
  const byGroup = new Map(groups.map((g) => [g.id, { ...g, meshes: [] }]));
  const nodeToGroup = new Map();
  groups.forEach((g) => g.nodes.forEach((n) => nodeToGroup.set(key(n), g.id)));
  const thrusterMeshes = new Map();

  // Dots (hotspots) and markers are HTML, placed every frame.
  const dots = groups.map((g) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mx-dot';
    b.innerHTML = `<span>${g.name}</span>`;
    b.setAttribute('aria-label', g.name);
    b.addEventListener('click', (e) => { e.stopPropagation(); onPick?.(g.id); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    labelHost.appendChild(b);
    return { el: b, g, pos: v3(g.anchor) };
  });
  const marks = markers.map((m) => {
    const d = document.createElement('div');
    d.className = 'mx-dot mark';
    d.innerHTML = `<span>${m.label}</span>`;
    d.style.setProperty('--c', m.color);
    d.hidden = true;
    labelHost.appendChild(d);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.011, 18, 12), new THREE.MeshBasicMaterial({ color: m.color, depthTest: false, transparent: true }));
    mesh.position.copy(v3(m.pos));
    mesh.renderOrder = 20;
    mesh.visible = false;
    scene.add(mesh);
    d.firstChild.style.borderColor = m.color;
    return { el: d, mesh, pos: v3(m.pos), dx: m.dx || 0, dy: m.dy || 0 };
  });
  const tnames = thrusterLabels.map((t) => {
    const d = document.createElement('div');
    d.className = 'mx-dot tname';
    d.innerHTML = `<span>${t.name}</span>`;
    d.hidden = true;
    labelHost.appendChild(d);
    return { el: d, t, pos: new THREE.Vector3() };
  });
  // Thrust direction arrows, shown with the thrusters.
  const arrows = [];

  let selected = null, hullMode = 'solid', explode = 0, showMarks = false, loaded = false;

  function applyLook() {
    for (const [id, g] of byGroup) {
      const on = !selected || selected === id;
      for (const m of g.meshes) {
        const mat = m.material;
        const isHull = id === 'hull';
        mat.color.copy(on ? m.userData.color : GHOST);
        let opacity = on ? 1 : 0.22;
        if (isHull && hullMode === 'glass') opacity = selected && !on ? 0.08 : 0.2;
        mat.opacity = opacity;
        mat.transparent = opacity < 1;
        mat.depthWrite = opacity >= 1;
        m.visible = !(isHull && hullMode === 'off');
        m.renderOrder = opacity < 1 ? 2 : 0;
      }
    }
    dots.forEach((d) => {
      d.el.classList.toggle('on', d.g.id === selected);
      d.el.classList.toggle('dim', !!selected && d.g.id !== selected);
    });
    const thr = selected === 'thrusters';
    tnames.forEach((t) => (t.el.hidden = !thr));
    arrows.forEach((a) => (a.visible = thr));
  }

  function applyExplode() {
    for (const g of byGroup.values()) {
      const e = g.explode || [0, 0, 0];
      g.meshes.forEach((m) => {
        const k = m.userData.explode || e;
        m.position.set(k[0] * explode, k[1] * explode, k[2] * explode);
      });
    }
    dots.forEach((d) => {
      const e = d.g.explode || [0, 0, 0];
      d.pos.set(d.g.anchor[0] + e[0] * explode, d.g.anchor[1] + e[1] * explode, d.g.anchor[2] + e[2] * explode);
    });
  }

  new GLTFLoader().load(`${BASE}models/talos-cad.glb`, (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      let name = key(o.name);
      let id = nodeToGroup.get(name);
      if (!id) { name = key(o.parent?.name); id = nodeToGroup.get(name); }
      if (!id) return;
      const g = byGroup.get(id);
      // The file stores the site's sRGB colours as glTF's linear factors: read them back as sRGB.
      const c0 = o.material.color, color = new THREE.Color().setRGB(c0.r, c0.g, c0.b, THREE.SRGBColorSpace);
      const world = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const parts = g.split ? splitByX(world) : [world];
      parts.forEach((geo, k) => {
        const mesh = new THREE.Mesh(toCreasedNormals(geo, (35 * Math.PI) / 180),
          new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.6, envMap, envMapIntensity: 0.35, side: THREE.DoubleSide }));
        mesh.userData = { group: id, color };
        if (g.split) mesh.userData.explode = [(k === 0 ? 1 : -1) * g.split, 0, 0];
        if (id === 'thrusters') thrusterMeshes.set(name, mesh);
        g.meshes.push(mesh);
        model.add(mesh);
      });
    });
    // A thrust-direction arrow at each thruster's mesh centre.
    for (const t of thrusterLabels) {
      const m = thrusterMeshes.get(key(t.node));
      if (!m) continue;
      m.geometry.computeBoundingBox();
      const c = m.geometry.boundingBox.getCenter(new THREE.Vector3());
      tnames.find((x) => x.t === t).pos.copy(c);
      const dir = v3(t.dir).normalize();
      const a = new THREE.ArrowHelper(dir, c.clone().addScaledVector(dir, 0.06), 0.16, 0xd9480f, 0.05, 0.035);
      a.line.material.depthTest = false; a.cone.material.depthTest = false;
      a.renderOrder = 15;
      a.visible = false;
      arrows.push(a);
      scene.add(a);
    }
    loaded = true;
    applyLook();
    applyExplode();
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

  let fitted = 0;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // Narrow views: back off so the whole robot fits across.
    const want = home.dist * Math.max(1, 1.0 / Math.max(camera.aspect, 0.5));
    if (Math.abs(want - fitted) > 0.01 && !touched) {
      fitted = want;
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, want);
    }
  }
  let touched = false;
  controls.addEventListener('start', () => (touched = true));
  new ResizeObserver(resize).observe(canvas);
  resize();

  const tmp = new THREE.Vector3();
  function place(el, p, w, h, dx = 0, dy = 0) {
    tmp.copy(p).project(camera);
    const x = (tmp.x + 1) / 2 * w, y = (1 - tmp.y) / 2 * h;
    const off = tmp.z > 1 || x < -20 || x > w + 20 || y < -20 || y > h + 20;
    el.style.visibility = off ? 'hidden' : '';
    el.style.transform = `translate(${(x + dx).toFixed(1)}px, ${(y + dy).toFixed(1)}px) translate(-6.5px, -50%)`;
  }
  // Ease the orbit target toward the selected group.
  const goal = home.target.clone();
  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(canvas);
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    controls.target.lerp(goal, 0.08);
    controls.update();
    renderer.render(scene, camera);
    if (hoverQueued) doHover();
    const w = canvas.clientWidth, h = canvas.clientHeight;
    dots.forEach((d) => place(d.el, d.pos, w, h));
    marks.forEach((m) => { if (!m.el.hidden) place(m.el, m.pos, w, h, m.dx, m.dy); });
    tnames.forEach((t) => { if (!t.el.hidden) place(t.el, t.pos, w, h, -6, -22); });
  });

  return {
    select(id) {
      selected = id || null;
      const g = selected && byGroup.get(selected);
      if (g?.inside && hullMode === 'solid') { hullMode = 'glass'; onHullAuto?.('glass'); }
      if (g) goal.set(...g.focus); else goal.copy(home.target);
      applyLook();
    },
    setHull(mode) { hullMode = mode; applyLook(); },
    setExplode(k) { explode = k; applyExplode(); },
    setMarkers(on) {
      showMarks = on;
      marks.forEach((m) => { m.el.hidden = !on; m.mesh.visible = on; });
    },
  };
}
