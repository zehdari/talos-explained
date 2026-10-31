// The front page's 3D Talos: the team's CAD (public/models/talos-hero.glb, built by tools/cad/build_hero.py) with
// systems you can pick and containers (hull, cages, battery pods) you can open. Frame: +X port, +Y up, +Z bow, metres.
// The page (src/pages/index.js) owns the state and the words; this module draws it.
//
// createTalosHero(THREE, mods, opts) -> { setView(view), resize() } or null when WebGL is missing.
//   view = { sel: item id | null, ctx: item id | null (the open container whose parts are shown), path: [ids] }
//   opts.items: id -> { nodes:Set, children:[ids], shell:[nodes], anchorNode, color, name }
//   opts.onPick(nodeName | null, ctxId): a tap on the model (null = empty space)
//   opts.onHover(itemName | null)
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createTalosHero(THREE, { OrbitControls, GLTFLoader, RoomEnvironment }, opts) {
  const { canvas, stage, labelHost, loading, items, systems, modelUrl, reduced } = opts;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, stencil: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no context');
  } catch (e) {
    return null;
  }
  const coarse = matchMedia('(pointer: coarse)').matches;
  let dprCap = coarse ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(devicePixelRatio, dprCap));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  scene.environment = envMap;
  scene.add(new THREE.HemisphereLight(0xf4fbfd, 0x7d98a2, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(2.2, 4, 3);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdcefff, 0.5);
  fill.position.set(-3, -1, -2);
  scene.add(fill);

  const camera = new THREE.PerspectiveCamera(28, 1, 0.02, 30);
  const HOME = { target: new THREE.Vector3(0, -0.06, 0.03), dir: new THREE.Vector3(1.0, 0.52, 1.2).normalize(), dist: 2.7 };
  const HOME_AZ = Math.atan2(HOME.dir.x, HOME.dir.z);
  camera.position.copy(HOME.target).addScaledVector(HOME.dir, HOME.dist);
  const controls = new OrbitControls(camera, canvas);
  // OrbitControls sets touch-action: none, which would trap vertical swipes on the first screen of the site.
  canvas.style.touchAction = 'pan-y';
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.enablePan = false;
  controls.enableZoom = false; // the page scrolls with the wheel; pinch would fight the page on phones
  controls.rotateSpeed = 0.8;
  // At the top level, until someone touches it, the model sways slowly about the home view (+-28 deg, 26 s) instead
  // of spinning all the way round: the bow-quarter view is the one that explains Talos best.
  let swayT = 0;
  const HOME_EL = Math.asin(HOME.dir.y);
  const swayDir = () => {
    const az = HOME_AZ + 0.49 * Math.sin((2 * Math.PI * swayT) / 26);
    return new THREE.Vector3(Math.sin(az) * Math.cos(HOME_EL), Math.sin(HOME_EL), Math.cos(az) * Math.cos(HOME_EL));
  };
  controls.update();
  let touched = false;
  controls.addEventListener('start', () => { touched = true; tween = null; kick(); });
  controls.addEventListener('change', () => kick());

  // A soft shadow under the robot to ground it.
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(15,38,51,0.32)');
    gr.addColorStop(1, 'rgba(15,38,51,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  })();
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.95), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0, -0.5, 0.0);
  shadow.renderOrder = -1;
  if (!/[?&]poster\b/.test(location.search)) scene.add(shadow);   // ?poster: tools render the fallback image without it

  const model = new THREE.Group();
  scene.add(model);
  // Everything not picked goes see-through: a little at the top level (to keep the robot around the pick), almost
  // all the way inside a container (the rest of the robot would fog the view at close range).
  const GHOST = new THREE.MeshStandardMaterial({ color: 0xd3e2e6, transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  const GHOST_FAR = GHOST.clone();
  GHOST_FAR.opacity = 0.05;
  // The picked part writes 1 into the stencil buffer; ghosts and faded parts skip those pixels, so nothing in front
  // fogs the pick (an x-ray view of it).
  const STENCIL_SKIP = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
  const STENCIL_MARK = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp };
  Object.assign(GHOST, STENCIL_SKIP);
  Object.assign(GHOST_FAR, STENCIL_SKIP);
  const meshes = [];             // every mesh: userData { node, real, fade, glass }
  const nodeMeshes = new Map();  // node -> [mesh]
  const nodeBox = new Map();     // node -> Box3 (world)
  let loaded = false;

  // ------------------------------------------------------------------ state
  let view = { sel: null, ctx: null, path: [] };
  const nodesOf = (id) => items[id]?.nodes || new Set();
  function boxOf(nodeSet) {
    const b = new THREE.Box3();
    nodeSet.forEach((n) => { const nb = nodeBox.get(n); if (nb) b.union(nb); });
    return b;
  }

  // ------------------------------------------------------------------ dots
  let dots = [];
  function buildDots() {
    labelHost.textContent = '';
    const ids = view.ctx ? items[view.ctx].children : systems;
    dots = ids.filter((id) => items[id]).map((id) => {
      const it = items[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'th-dot';
      b.style.setProperty('--c', it.color || 'var(--ink)');
      b.innerHTML = `<span>${it.name}</span>`;
      b.setAttribute('aria-label', it.name);
      b.tabIndex = -1; // the names under the model do the same job for keyboards and screen readers
      b.addEventListener('click', (e) => { e.stopPropagation(); opts.onDot(id); });
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      labelHost.appendChild(b);
      const anchor = it.anchorNode ? new Set([it.anchorNode]) : it.nodes;
      const pos = new THREE.Vector3();
      const bb = boxOf(anchor);
      if (!bb.isEmpty()) bb.getCenter(pos);
      if (it.anchor) pos.fromArray(it.anchor);
      return { el: b, id, pos };
    });
    placeDots();
  }
  const tmp = new THREE.Vector3();
  function placeDots() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    for (const d of dots) {
      tmp.copy(d.pos).project(camera);
      const x = ((tmp.x + 1) / 2) * w, y = ((1 - tmp.y) / 2) * h;
      const off = !loaded || tmp.z > 1 || x < 10 || x > w - 10 || y < 10 || y > h - 10;
      d.el.style.visibility = off ? 'hidden' : '';
      d.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-7px, -50%)`;
      d.el.classList.toggle('on', d.id === view.sel);
      d.el.classList.toggle('open', d.id === view.sel && view.sel === view.ctx);
      d.el.classList.toggle('dim', !!view.sel && view.sel !== view.ctx && d.id !== view.sel);
    }
  }

  // ------------------------------------------------------------------ looks
  function fadeOf(m) {
    // the other parts of an open container: washed out and see-through, so the picked one stands out
    if (!m.userData.fade) {
      const f = m.userData.real.clone();
      f.transparent = true;
      f.opacity = m.userData.glass ? 0.08 : 0.13;
      f.depthWrite = false;
      if (!m.userData.glass) { f.emissive = new THREE.Color(0xcfdde2); f.emissiveIntensity = 0.55; }
      Object.assign(f, STENCIL_SKIP);
      m.userData.fade = f;
    }
    return m.userData.fade;
  }
  const ACCENT = new THREE.Color(0xd9480f);
  const HI_REST = 0.1;    // after the glow a faint orange tint stays, so pale parts stand out from the pale ghosts
  function hiOf(m) {
    // the picked part: its own colours, with a brief orange glow when it is picked
    if (m.userData.glass) return m.userData.real;
    if (!m.userData.hi) {
      const h = m.userData.real.clone();
      h.emissive = ACCENT.clone();
      h.emissiveIntensity = 0;
      Object.assign(h, STENCIL_MARK);
      m.userData.hi = h;
    }
    return m.userData.hi;
  }
  let flash = null;   // { t0, mats }
  function applyLook() {
    if (!loaded) return;
    const focus = view.sel ? nodesOf(view.sel) : null;
    const ctxNodes = view.ctx ? nodesOf(view.ctx) : null;
    const shell = new Set();
    view.path.forEach((id) => (items[id]?.shell || []).forEach((n) => shell.add(n)));
    // Inside a container the rest of the robot is hidden (at close range its ghost would fog the view), except the
    // container's own surroundings (its `context` nodes, e.g. the hull tube around a cage), drawn faintly.
    const context = new Set();
    view.path.forEach((id) => (items[id]?.context || []).forEach((n) => context.add(n)));
    const isolate = view.path.some((id) => items[id]?.context);
    const flashMats = [];
    for (const m of meshes) {
      const n = m.userData.node;
      let mat, vis = true;
      if (!focus) mat = m.userData.real;
      else if (focus.has(n) && !(shell.has(n) && view.sel === view.ctx)) {
        mat = hiOf(m);
        if (mat !== m.userData.real) { if (view.sel !== view.ctx) flashMats.push(mat); else mat.emissiveIntensity = 0; }
      }
      else if (ctxNodes && ctxNodes.has(n) && !shell.has(n)) mat = fadeOf(m);
      else if (isolate && !ctxNodes.has(n)) { mat = GHOST_FAR; vis = context.has(n); }
      else mat = GHOST;
      m.material = mat;
      m.visible = vis;
    }
    flash = flashMats.length && !reduced ? { t0: performance.now(), mats: flashMats } : null;
    flashMats.forEach((h) => (h.emissiveIntensity = HI_REST));
    kick();
  }

  // ------------------------------------------------------------------ camera
  // On a wide stage the words sit on the left: draw the model right of centre.
  let wide = false, shiftX = 0;
  const framing = () => ({ frac: wide ? 0.56 : 0.94, fracH: wide ? 0.78 : 0.86 });
  function fitDistance(box, dir) {
    // distance from the box centre at which all 8 corners fit the free part of the view, looking along -dir
    const { frac, fracH } = framing();
    const d = (dir || camera.position.clone().sub(controls.target)).clone().normalize();
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), d).normalize();
    const up = new THREE.Vector3().crossVectors(d, right);
    const tv = Math.tan(((camera.fov * Math.PI) / 180) / 2) * fracH, th = Math.tan(((camera.fov * Math.PI) / 180) / 2) * camera.aspect * frac;
    const c = box.getCenter(new THREE.Vector3()), p = new THREE.Vector3();
    let need = 0.05;
    for (let i = 0; i < 8; i++) {
      p.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(c);
      const z = p.dot(d);
      need = Math.max(need, z + Math.abs(p.dot(right)) / th, z + Math.abs(p.dot(up)) / tv);
    }
    return need;
  }
  let tween = null;
  function flyTo(target, dist, dir) {
    const from = { t: controls.target.clone(), p: camera.position.clone() };
    const d = dir || camera.position.clone().sub(controls.target).normalize();
    const to = { t: target.clone(), p: target.clone().addScaledVector(d, dist) };
    if (reduced) {
      controls.target.copy(to.t); camera.position.copy(to.p); controls.update(); kick();
      return;
    }
    tween = { from, to, t0: performance.now(), dur: 900 };
    kick();
  }
  function homeDist() {
    if (!canvas.clientWidth || !canvas.clientHeight) return HOME.dist;
    const box = new THREE.Box3(new THREE.Vector3(-0.47, -0.47, -0.36), new THREE.Vector3(0.47, 0.31, 0.41));
    // the box's corners stick out past the robot itself, so a little closer than a strict fit
    return loaded ? Math.max(fitDistance(box, HOME.dir) * (wide ? 0.98 : 0.84), 1.0) : HOME.dist;
  }
  function frameView(animate = true) {
    let target, dist;
    if (!view.sel) {
      target = HOME.target.clone();
      dist = homeDist();
    } else {
      const b = boxOf(nodesOf(view.sel));
      if (b.isEmpty()) return;
      target = b.getCenter(new THREE.Vector3());
      const open = view.sel === view.ctx;
      if (!view.ctx) {
        // a system at the top level: move toward it but keep the robot around it in view
        dist = THREE.MathUtils.clamp(fitDistance(b) * 2.6, 0.55, homeDist());
      } else {
        // never closer than this (keeps context around small parts), never farther than the whole robot
        dist = THREE.MathUtils.clamp(fitDistance(b) * (open ? 1.08 : 1.6), 0.3, homeDist());
      }
    }
    // back home before anyone has turned it: land where the sway is, so it carries on without a jump
    const dir = !view.sel && !touched ? swayDir() : null;
    if (animate) flyTo(target, dist, dir);
    else {
      const dir = camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(target);
      camera.position.copy(target).addScaledVector(dir, dist);
      controls.update();
      kick();
    }
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    wide = w > 900;
    shiftX = wide ? -w * 0.2 : 0;
    if (wide) camera.setViewOffset(w, h, shiftX, h * 0.02, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    if (!view.sel && !touched && !tween) {
      const dir = camera.position.clone().sub(controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(dir, homeDist());
    }
    kick();
  }

  // ------------------------------------------------------------------ load
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(modelUrl, (gltf) => {
    gltf.scene.updateMatrixWorld(true);
    const known = new Set();
    Object.values(items).forEach((it) => it.nodes.forEach((n) => known.add(n)));
    const glassMats = new Map();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      let p = o, node = null;
      while (p) { if (p.name && known.has(p.name)) { node = p.name; break; } p = p.parent; }
      if (!node) { let q = o; while (q && !q.name) q = q.parent; node = q?.name || 'other'; }
      const src = o.material;
      const kind = src.userData?.kind || (src.transparent ? 'glass' : 'plastic');
      let real;
      if (kind === 'glass') {
        const key = src.color.getHexString();
        real = glassMats.get(key);
        if (!real) {
          real = new THREE.MeshStandardMaterial({ color: src.color.clone().lerp(new THREE.Color(0xeaf6fb), 0.5), roughness: 0.05, metalness: 0,
            transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.6 });
          glassMats.set(key, real);
        }
      } else {
        real = src;
        real.side = THREE.DoubleSide;
        real.envMapIntensity = kind === 'metal' ? 0.9 : 0.45;
        if (kind === 'metal') { real.metalness = Math.min(real.metalness, 0.7); real.roughness = Math.max(real.roughness, 0.32); }
      }
      o.material = real;
      o.userData = { node, real, glass: kind === 'glass' };
      if (kind === 'glass') o.renderOrder = 2;
      o.matrixAutoUpdate = false;
      meshes.push(o);
      if (!nodeMeshes.has(node)) nodeMeshes.set(node, []);
      nodeMeshes.get(node).push(o);
      o.geometry.computeBoundingBox();
      const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (!nodeBox.has(node)) nodeBox.set(node, new THREE.Box3());
      nodeBox.get(node).union(wb);
    });
    model.add(gltf.scene);
    loaded = true;
    loading.hidden = true;
    stage.classList.add('ready');
    buildDots();
    applyLook();
    resize();
    frameView(false);
    controls.update();
    opts.onLoad?.();
  }, (ev) => opts.onProgress?.(ev.loaded, ev.total), () => opts.onError?.());

  // ------------------------------------------------------------------ picking
  const ray = new THREE.Raycaster();
  const ndc = (e) => {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  // What a tap at e hits: the nearest solid mesh in reach (inside the open container, else anywhere); glass and
  // ghosted shells only when nothing else is there.
  function hitNode(e) {
    if (!loaded) return null;
    ray.setFromCamera(ndc(e), camera);
    const ctxNodes = view.ctx ? nodesOf(view.ctx) : null;
    const shell = new Set();
    view.path.forEach((id) => (items[id]?.shell || []).forEach((n) => shell.add(n)));
    const cand = ctxNodes ? meshes.filter((m) => ctxNodes.has(m.userData.node)) : meshes;
    const hits = ray.intersectObjects(cand, false);
    const solid = hits.find((h) => !h.object.userData.glass && !shell.has(h.object.userData.node));
    const any = solid || hits.find((h) => !h.object.userData.glass) || hits[0];
    return any ? any.object.userData.node : null;
  }
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 7 || performance.now() - down.t > 700) return;
    down = null;
    opts.onPick(hitNode(e));
  });
  let hoverEv = null, hoverT = 0;
  const tip = opts.tip;
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || e.buttons) { tip.hidden = true; return; }
    hoverEv = e;
    kick();
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; hoverEv = null; canvas.style.cursor = ''; });
  function doHover(now) {
    if (!hoverEv || now - hoverT < 90) return;
    hoverT = now;
    const e = hoverEv;
    hoverEv = null;
    const label = opts.labelFor(hitNode(e));
    canvas.style.cursor = label ? 'pointer' : '';
    if (!label) { tip.hidden = true; return; }
    const r = stage.getBoundingClientRect();
    tip.textContent = label;
    tip.hidden = false;
    tip.style.transform = `translate(${e.clientX - r.left + 14}px, ${e.clientY - r.top - 12}px)`;
  }

  // ------------------------------------------------------------------ render on demand
  let visible = true, running = false, idle = 0;
  const frameTimes = [];
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  function kick() {
    idle = 0;
    if (running || !visible || document.hidden) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(loop);
  }
  let last = 0;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function loop(now) {
    if (!visible || document.hidden) { running = false; return; }
    const dt = now - last;
    last = now;
    let moving = false;
    if (tween) {
      const k = Math.min(1, (now - tween.t0) / tween.dur), e = ease(k);
      controls.target.lerpVectors(tween.from.t, tween.to.t, e);
      camera.position.lerpVectors(tween.from.p, tween.to.p, e);
      if (k >= 1) tween = null;
      moving = true;
    }
    if (flash) {
      const k = (now - flash.t0) / 1300;
      const e = HI_REST + (k >= 1 ? 0 : 0.5 * Math.pow(1 - k, 2) * Math.min(1, k * 6));
      flash.mats.forEach((h) => (h.emissiveIntensity = e));
      if (k >= 1) flash = null;
      moving = true;
    }
    const auto = loaded && !reduced && !view.sel && !touched && !tween;
    if (auto) {
      swayT += Math.min(dt, 50) / 1000;
      const r = camera.position.distanceTo(controls.target);
      camera.position.copy(controls.target).addScaledVector(swayDir(), r);
    }
    if (controls.update() || auto) moving = true;
    renderer.render(scene, camera);
    placeDots();
    doHover(now);
    // A slow device: lower the resolution once.
    if (loaded && dt > 0 && dt < 500) {
      frameTimes.push(dt);
      if (frameTimes.length > 40) frameTimes.shift();
      if (frameTimes.length === 40 && dprCap > 1 && frameTimes.reduce((a, b) => a + b) / 40 > 45) {
        dprCap = 1;
        renderer.setPixelRatio(1);
        resize();
        frameTimes.length = 0;
      }
    }
    if (!moving && !hoverEv) idle++;
    if (idle > 8) { running = false; return; }
    requestAnimationFrame(loop);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();
  kick();

  return {
    setView(v, { fly = true } = {}) {
      const ctxChanged = v.ctx !== view.ctx;
      view = v;
      if (!loaded) return;
      if (ctxChanged) buildDots();
      applyLook();
      if (fly) frameView(true);
      kick();
    },
    resize,
    loaded: () => loaded,
  };
}
