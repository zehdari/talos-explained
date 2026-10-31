// Nereus architecture as a loop, not a graph: the Nereus side, the ROS topics that cross the bridge (out and in),
// and Talos's own stack as one straight chain. Every box and topic row is a button; tapping one lights what it
// talks to and opens its note (under the tapped row on phones, under the figure on wide screens).
// Same markup at every width: a container query turns the three blocks into columns when the figure is 960 px or
// wider, and an SVG overlay draws the links between the blocks (bridge to the topics, topics to the stack, and the
// thrust coming back), measured from the laid-out boxes. Used only by the Nereus chapter.

const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);

// id: [title, sub, note, related ids]
const ITEMS = {
  packs: ['Packs', 'YAML: robot, pool, course, ROS wiring',
    `<b>Packs.</b> YAML in <a href="https://github.com/osu-uwrt/nereus/tree/main/content/packs"><code>content/packs</code></a>: the robot, the pool, the course, the ROS wiring, and a scenario that picks one of each and places everything. No number about Talos is in the C++.`,
    ['resolve']],
  resolve: ['Resolve', 'checks them, writes one resolved.json',
    `<b>Resolve.</b> <code>nereus-packs resolve</code> checks every pack against its JSON schema and against each other, then writes one <code>resolved.json</code>. <code>sim.launch.py</code> runs it first, so the simulator and the viewer read the same file.`,
    ['packs', 'sim', 'viewer']],
  sim: ['nereus-sim', 'the world in 2 ms ticks, both cameras',
    `<b>nereus-sim.</b> Steps the world in 2 ms ticks: thrusters, the 6-DOF body, contacts, sensors, mechanisms, payloads, props and tasks. Renders both cameras on the GPU. Runs under <code>sim_supervisor.py</code>, which can restart it in another pool.`,
    ['resolve', 'bridge']],
  bridge: ['ROS bridge', "nereus-sim's ROS node",
    `<b>ROS bridge.</b> The ROS side of <code>nereus-sim</code> (the same program), node <code>/talos/physics_simulator</code>. <code>bridge.yaml</code> maps 39 topic streams and 10 services. It is the only door: every topic listed under "Through the bridge" goes through it (<a href="#bridge">The ROS bridge</a>).`,
    ['sim', 'o-sensors', 'o-images', 'o-kill', 'o-clock', 'o-truth', 'i-thrust', 'i-act', 'i-kill']],
  viewer: ['nereus-viewer', 'operator UI, its own program',
    `<b>nereus-viewer.</b> The 3D pool, camera cards and operator panels. It reads the same <code>resolved.json</code> and talks ROS like the stack: its Enable / KILL is software-kill slot 1, and it starts trees and the scored run. The same program drives the real robot (<a href="viewer.html">The Nereus viewer</a>).`,
    ['resolve', 'o-truth', 'i-kill', 'i-act', 'autonomy']],
  'o-sensors': ['IMU, FOG, DVL, depth', 'EKF, MPC',
    `<b>Navigation sensors</b>: <code>vectornav/imu</code> 400 Hz, <code>gyro/twist</code> (FOG) 500 Hz, <code>dvl_twist</code> 8 Hz, <code>depth/pose</code> 20 Hz, with noise from real pool bags (<a href="#sensors">Sensors and their noise</a>). Both the EKF and the MPC subscribe.`,
    ['bridge', 'ekf', 'mpc']],
  'o-images': ['Camera images, depth', 'detector',
    `<b>Both ZED X Minis</b>: colour (JPEG), depth and point clouds at 15 Hz on the ZED wrapper's topic names, rendered only while someone listens (<a href="#cameras">Cameras</a>).`,
    ['bridge', 'detector']],
  'o-kill': ['state/kill', 'tree, MPC',
    `<b><code>state/kill</code></b>: true while Talos is killed, as the firmware would publish it. The tree waits for it to clear; while it is set the MPC publishes zero thrust.`,
    ['bridge', 'autonomy', 'mpc']],
  'o-clock': ['/clock', 'every node',
    `<b><code>/clock</code></b>: sim time, one message per 2 ms tick. Every stack node runs on it except the YOLO detector (<a href="#time">Sim time</a>).`,
    ['bridge', 'ekf', 'mapping', 'autonomy', 'mpc']],
  'o-truth': ['Truth, score, props', 'viewer',
    `<b>For the operator</b>: the true pose (<code>simulator/ground_truth</code> and its own TF branch), task events and score, prop and projectile poses. The stack ignores them unless you feed the MPC the truth (<code>mpc_odom_topic:=simulator/ground_truth</code>).`,
    ['bridge', 'viewer']],
  'i-thrust': ['thruster_forces', 'from the MPC',
    `<b><code>thruster_forces</code></b>: eight forces in newtons, about 20 a second. This closes the loop: the simulator applies them (after the thruster delay and lag) and moves Talos.`,
    ['mpc', 'bridge']],
  'i-act': ['Actuator commands', 'from the tree, viewer',
    `<b>Actuators</b>: arm, torpedo, dropper, claw. The tree's commands go through <code>ActuatorTranslator</code>, as on the robot; the viewer's Actuators panel sends the same ones.`,
    ['autonomy', 'viewer', 'bridge']],
  'i-kill': ['Kill, Start run', 'from the viewer',
    `<b>From the operator</b>: <code>command/software_kill</code> (only slot 1 counts), and the scorecard's run commands.`,
    ['viewer', 'bridge']],
  ekf: ['EKF', 'robot_localization',
    `<b>EKF</b> (robot_localization). Fuses IMU, FOG, DVL and depth into <code>odometry/filtered</code> and <code>odom → talos/base_link</code>, exactly as on the robot (<a href="localization.html">State estimation</a>).`,
    ['o-sensors', 'mapping', 'mpc']],
  detector: ['YOLO detector', 'yolo_orientation',
    `<b>YOLO detector</b> (riptide_perception). Runs on the active camera's images and uses its depth for 3D poses. Publishes <code>detected_objects</code> (<a href="perception/detector.html">The detector</a>).`,
    ['o-images', 'mapping']],
  mapping: ['Mapping', 'riptide_mapping2',
    `<b>Mapping</b> (riptide_mapping2). Fuses detections, placed with the EKF's pose, into one pose per prop and publishes them as TF frames for the tree to aim at (<a href="perception/map.html">The course map</a>).`,
    ['ekf', 'detector', 'autonomy']],
  autonomy: ['Behaviour tree', 'doTask',
    `<b>Behaviour tree</b> (<code>doTask</code>). Runs a tree such as RepairCompMpcTree: waits for <code>state/kill</code> to clear, sends targets and paths to the MPC, fires actuators (<a href="mission-tree.html">The competition mission</a>).`,
    ['mapping', 'mpc', 'o-kill', 'i-act', 'viewer']],
  mpc: ['MPC', 'riptide_mpc',
    `<b>MPC</b> (riptide_mpc). Reads the sensors itself, takes x, y and heading from the EKF, solves every 50 ms and publishes eight thruster forces. In sim it logs "Hardware output disabled": there are no ESCs, so it publishes <code>thruster_forces</code> only.`,
    ['o-sensors', 'o-kill', 'ekf', 'autonomy', 'i-thrust']],
};


const box = (id, cls = '') => {
  const [t, s] = ITEMS[id];
  return `<button type="button" class="na-box ${cls}" data-id="${id}" aria-pressed="false"><span class="na-t">${esc(t)}</span><span class="na-s">${esc(s)}</span></button>`;
};
const wire = (id) => {
  const [t, s] = ITEMS[id];
  const out = id.startsWith('o-');
  return `<button type="button" class="na-wire" data-id="${id}" aria-pressed="false"><span class="na-wt">${esc(t)}</span><span class="na-wd">${out ? '→ ' : ''}${esc(s)}</span></button>`;
};
const arrow = (label, cls = '') => `<div class="na-arrow ${cls}" aria-hidden="true"><i></i><span>${esc(label)}</span></div>`;
const NS = 'http://www.w3.org/2000/svg';

export function archFigure(root, { start = 'o-sensors' } = {}) {
  root.classList.add('na-wrap');
  root.innerHTML = `
    <div class="na">
      <section class="na-block na-nereus" aria-label="Nereus">
        <div class="na-chain">
          <div class="na-band na-c0">Nereus</div>
          ${box('packs', 'na-c1')}
          ${arrow('YAML', 'na-a1')}
          ${box('resolve', 'na-c2')}
          ${arrow('resolved.json', 'na-a2')}
          ${box('sim', 'na-c3')}
          ${arrow('same program', 'plain na-a3')}
          ${box('bridge', 'na-door na-c4')}
          ${box('viewer', 'na-op na-c5')}
        </div>
      </section>
      <section class="na-block na-wires" aria-label="ROS 2 topics through the bridge">
        <div class="na-band">Through the bridge: ROS 2 topics</div>
        <div class="na-dirh out"><b>Out</b> simulator → stack</div>
        <div class="na-row">${wire('o-sensors')}</div>
        <div class="na-row">${wire('o-images')}</div>
        <div class="na-row">${wire('o-kill')}</div>
        <div class="na-row">${wire('o-clock')}</div>
        <div class="na-row">${wire('o-truth')}</div>
        <div class="na-dirh in"><b>In</b> stack → simulator</div>
        <div class="na-row">${wire('i-thrust')}</div>
        <div class="na-row">${wire('i-act')}</div>
        <div class="na-row">${wire('i-kill')}</div>
      </section>
      <section class="na-block na-stack" aria-label="Talos's own software">
        <div class="na-band">Talos's own software, unchanged</div>
        <div class="na-row na-pair">${box('ekf')}${box('detector')}</div>
        <div class="na-pair-arrows" aria-hidden="true">${arrow('odometry')}${arrow('detections')}</div>
        <div class="na-row">${box('mapping')}</div>
        ${arrow('prop frames')}
        <div class="na-row">${box('autonomy')}</div>
        ${arrow('targets, paths')}
        <div class="na-row">${box('mpc')}</div>
        <div class="na-back"><span><b>thruster_forces</b> go back to the bridge</span></div>
      </section>
    </div>`;
  const grid = root.querySelector('.na');
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'na-links');
  svg.setAttribute('aria-hidden', 'true');
  grid.append(svg);
  const note = document.createElement('div');
  note.className = 'na-note';
  note.setAttribute('aria-live', 'polite');
  const all = [...root.querySelectorAll('[data-id]')];
  const q = (id) => root.querySelector(`[data-id="${id}"]`);
  const wide = () => grid.clientWidth >= 960;
  let cur = start;

  // ---- links between the blocks, from the boxes' laid-out positions
  function path(pts, cls) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M' + pts.map(([x, y]) => `${Math.round(x) + 0.5},${Math.round(y) + 0.5}`).join('L'));
    p.setAttribute('class', cls);
    svg.append(p);
  }
  function links() {
    const o = grid.getBoundingClientRect();
    const R = (n) => { const r = n.getBoundingClientRect(); return { l: r.left - o.left, r: r.right - o.left, t: r.top - o.top, b: r.bottom - o.top, cx: (r.left + r.right) / 2 - o.left, cy: (r.top + r.bottom) / 2 - o.top }; };
    svg.setAttribute('viewBox', `0 0 ${o.width} ${o.height}`);
    svg.setAttribute('width', o.width);
    svg.setAttribute('height', o.height);
    svg.innerHTML = `<defs>
      <marker id="na-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1L10,5L0,9Z" fill="var(--ink-2)"/></marker>
      <marker id="na-head-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,1L10,5L0,9Z" fill="var(--accent)"/></marker></defs>`;
    const bridge = R(q('bridge')), mpc = R(q('mpc')), thrust = R(q('i-thrust'));
    const outs = ['o-sensors', 'o-images', 'o-kill', 'o-clock', 'o-truth'].map((id) => R(q(id)));
    const ins = ['i-thrust', 'i-act', 'i-kill'].map((id) => R(q(id)));
    const wires = R(root.querySelector('.na-wires')), stack = R(root.querySelector('.na-stack')), ner = R(root.querySelector('.na-nereus'));
    if (wide()) {
      // Gap 1: the bridge feeds the OUT rows (a bus on the right of the gap) and the IN rows feed the bridge (a bus on the left).
      const g1a = ner.r + (wires.l - ner.r) * 0.33, g1b = ner.r + (wires.l - ner.r) * 0.7;
      const yo = bridge.t + (bridge.b - bridge.t) * 0.3, yi = bridge.t + (bridge.b - bridge.t) * 0.72;
      path([[bridge.r, yo], [g1b, yo], [g1b, outs[0].cy]], 'na-ln');
      for (const w of outs) path([[g1b, w.cy], [w.l - 2, w.cy]], 'na-ln na-hd');
      path([[g1a, Math.max(yi, ins[2].cy)], [g1a, yi], [bridge.r + 2, yi]], 'na-ln na-hd');
      for (const w of ins) path([[w.l, w.cy], [g1a, w.cy]], 'na-ln');
      // Gap 2: the four topics the stack reads join one line into the stack, at the EKF / detector row.
      const g2 = outs[0].r + (stack.l - outs[0].r) * 0.5, pair = R(root.querySelector('.na-pair'));
      const ey = Math.min(pair.cy, outs[0].cy);
      for (const w of outs.slice(0, 4)) path([[w.r, w.cy], [g2, w.cy]], 'na-ln');
      path([[g2, outs[3].cy], [g2, ey], [stack.l - 2, ey]], 'na-ln na-hd');
      // The return: the MPC's thruster forces into the thruster_forces row.
      const gx = outs[0].r + (stack.l - outs[0].r) * 0.5;
      path([[mpc.l, mpc.cy], [gx, mpc.cy], [gx, thrust.cy], [thrust.r + 2, thrust.cy]], 'na-ln na-hot na-hd-hot');
    } else {
      // Stacked: the bridge's topics go down into the topic block, the topic block feeds the stack below,
      // and the thrust climbs back up the right-hand margin from the MPC to its row.
      const x1 = bridge.cx;
      path([[x1, ner.b], [x1, wires.t - 2]], 'na-ln na-hd na-hs'); // from the block's edge: a note may sit under the bridge
      path([[stack.cx, wires.b], [stack.cx, stack.t - 2]], 'na-ln na-hd');
      const gx = stack.r - 10; // in the blocks' wide right padding
      path([[mpc.r, mpc.cy], [gx, mpc.cy], [gx, thrust.cy], [thrust.r + 2, thrust.cy]], 'na-ln na-hot na-hd-hot');
    }
  }

  function select(id) {
    cur = id;
    const rel = new Set(ITEMS[id][3]);
    for (const b of all) {
      b.setAttribute('aria-pressed', String(b.dataset.id === id));
      b.classList.toggle('rel', rel.has(b.dataset.id));
    }
    note.innerHTML = ITEMS[id][2];
    placeNote();
  }
  // Wide: one note under the three columns, so the columns never move. Stacked: right under the tapped row.
  function placeNote() {
    if (wide()) { if (note.parentNode !== grid || note.nextSibling !== svg) grid.insertBefore(note, svg); }
    else {
      const btn = q(cur);
      const row = btn.closest('.na-pair') ? root.querySelector('.na-pair-arrows') : btn.closest('.na-row, .na-chain');
      row.after(note);
    }
    links();
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (b) select(b.dataset.id);
  });
  let lastW = 0;
  new ResizeObserver(() => {
    const w = grid.clientWidth;
    if (w !== lastW) { lastW = w; placeNote(); } else links();
  }).observe(grid);
  select(start);
}
