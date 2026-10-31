import { setup } from '../layout.js';
import { Graph } from '../viz/graph.js';
import { el } from '../viz/chart.js';
import '../css/chapter.css';
import '../css/launch.css';

setup();
const BASE = import.meta.env.BASE_URL;
// Public images: set from JS (a root-absolute src in the HTML gets the base twice on the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });
document.querySelectorAll('source[data-srcset]').forEach((s) => { s.srcset = BASE + s.dataset.srcset; });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const c = (t) => `<code>${esc(t)}</code>`;
const a = (href, text) => `<a href="${href}">${text}</a>`;
const RL = 'https://github.com/osu-uwrt/riptide_launch/blob/newsim/remote_launch/';
// HTML elements (chart.js's el() makes SVG ones).
const h = (tag, attrs = {}, parent) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

// ---------------------------------------------------------------- shared: subsystem groups
const GROUPS = {
  hardware: { label: 'Hardware and drivers', color: 'var(--s4)' },
  navigation: { label: 'Navigation', color: 'var(--state)' },
  control: { label: 'Control', color: 'var(--s8)' },
  perception: { label: 'Perception', color: 'var(--prediction)' },
  autonomy: { label: 'Autonomy', color: 'var(--s7)' },
  sim: { label: 'Simulator', color: 'var(--s5)' },
  operator: { label: 'Viewer', color: 'var(--ink-2)' },
  diagnostics: { label: 'Diagnostics (unused)', color: 'var(--muted)', dim: true },
  legacy: { label: 'Legacy', color: 'var(--muted)', dim: true },
};

// ---------------------------------------------------------------- launch explorer
const MODES = {
  pool: {
    label: 'Pool test',
    desc: `At the pool: the Orin's launcher runs ${c('talos_launch_mpc.yaml')}; op-top runs only the viewer. Start the entries in the order hardware, navigation, zed, tensorrt, mapping, autonomy, and ${c('control_system')} last, with Talos killed.`,
    cols: [{ yaml: 'talos_launch_mpc.yaml', title: 'Orin · launcher' }, { tree: 'robot_viewer', title: 'op-top', cmd: 'ros2 launch nereus robot.launch.py' }],
  },
  bench: {
    label: 'Bench',
    desc: `Out of the water: ${c('talos_launch_bench_mpc.yaml')} swaps the DVL driver for ${c('fake_dvl.py')}. Everything except ${c('control_system')} is safe to start; that one must stay stopped.`,
    cols: [{ yaml: 'talos_launch_bench_mpc.yaml', title: 'Orin · launcher', bench: true }, { tree: 'robot_viewer', title: 'op-top', cmd: 'ros2 launch nereus robot.launch.py' }],
  },
  sim: {
    label: 'Simulation',
    desc: `On your laptop, one command starts the simulator, the stack (riptide_bringup2 with ${c('hardware:=none')}) and the viewer. No launcher.`,
    cols: [{ tree: 'sim', title: 'Your laptop', cmd: 'ros2 launch nereus sim.launch.py active_control_model:=mpc mpc_model:=sim', sim: true }],
  },
  hil: {
    label: 'HIL',
    desc: `Hardware in the loop: the Orin runs the stack from ${c('talos_launch_sim_hil_mpc.yaml')} (no hardware, no cameras); a desk computer runs the simulator and the viewer. The MPC on the Orin still sends RPM to the ESCs over CAN: keep the physical kill switch out.`,
    cols: [{ yaml: 'talos_launch_sim_hil_mpc.yaml', title: 'Orin · launcher' }, { tree: 'sim_hil_laptop', title: 'Desk computer', cmd: 'ros2 launch nereus sim.launch.py stack:=false' }],
  },
};
const OLDER = {
  'talos_launch.yaml': `The pool list before the MPC. Its ${c('control_system')} has no ${c('active_control_model')}, so the default (hybrid) starts the legacy ${c('complete_controller')}.`,
  'talos_launch_bench.yaml': `The bench list for the legacy controller (${c('active_control_model:=complete')}).`,
  'talos_launch_debug.yaml': 'An old debugging list: hardware appears twice, and the legacy controller.',
  'talos_launch_sim_hil.yaml': `HIL with the old simulator (${c('c_simulator')}) and RViz on the Orin, and the legacy controller. Replaced by Nereus.`,
};

// What each launch entry is for (package/file -> note); `danger` marks the controller.
const ENTRY_NOTES = {
  'riptide_hardware2/hardware.launch.py': 'The board link (micro-ROS agent on can0) and the sensor drivers, plus the AprilTag detector, acoustics and three helpers. Start it first.',
  'riptide_hardware2/hardware_fake_dvl.launch.py': `${c('hardware.launch.py')} for the bench: ${c('fake_dvl.py')} publishes zero velocity (5 mm/s of noise, every 0.125 s) instead of the DVL driver, so the EKF still has a velocity input. Here ${c('imu_power_cycle')} starts without ${c('imu_pwr_cycle.yaml')}, so its pin_id is the default 0.`,
  'riptide_hardware2/navigation.launch.py': 'The EKF, the depth converter and the robot model (URDF frames on /tf_static). Writes /tmp/model.urdf.',
  'riptide_navigation/navigation.launch.py': '',
  'riptide_controllers2/control_system.launch.py': 'The controller. Start it last, with Talos killed; never on the bench.',
  'riptide_hardware2/zed.launch.py': 'Both cameras as components of one container process, and the calibration-photo taker.',
  'tensor_detector/tensorrt.launch.py': 'The YOLO detector, on whichever camera the tree selects.',
  'riptide_mapping2/mapping.launch.py': 'The course map and chameleon_tf (world → map).',
  'riptide_autonomy2/autonomy.launch.py': 'The behaviour-tree executor and the actuator service translator.',
  'riptide_hardware2/diagnostics.launch.py': 'Diagnostic monitors and their aggregator. No longer used.',
  'c_simulator/physics_simulator.launch.py': 'The old simulator, replaced by Nereus.',
  'riptide_rviz/rviz_start.launch.py': 'RViz and its marker publishers: the old operator GUI, replaced by the Nereus viewer.',
};
const UNUSED = new Set(['riptide_hardware2/diagnostics.launch.py', 'c_simulator/physics_simulator.launch.py', 'riptide_rviz/rviz_start.launch.py']);

const isProc = (r) => !r.skipped && (r.kind === 'node' || r.kind === 'container' || r.kind === 'process');
// On a laptop, navigation's two camera-frame publishers only start when zed_wrapper is installed.
const zedOnly = (r, ctx) => !!ctx?.sim && /zed_state_publisher/.test(r.fqn || '');
function countProcs(nodes, by, ctx) {
  let n = 0;
  for (const r of nodes) {
    if (r.skipped || zedOnly(r, ctx)) continue;
    if (isProc(r)) { n++; if (by) by[r.group || 'legacy'] = (by[r.group || 'legacy'] || 0) + 1; }
    if (r.kind === 'include') n += countProcs(r.children || [], by, ctx);
  }
  return n;
}
const tail = (s) => (s || '').replace(/\/$/, '').split('/').pop();
const shortFile = (p) => tail(p);

function nodeTitle(r) {
  if (r.kind === 'process') return r.name;
  if (r.kind === 'component') return r.name;
  return tail(r.fqn) || r.executable;
}
function nodeSub(r) {
  if (r.kind === 'process') return 'process';
  if (r.kind === 'component') return r.plugin;
  return `${r.package} · ${r.executable}`;
}

function paramHtml(params) {
  if (!params || !params.length) return '<span class="lx-none">none</span>';
  const files = params.filter((p) => p.file), vals = params.filter((p) => p.name !== undefined);
  const parts = files.map((p) => (p.url ? a(p.url, c(shortFile(p.file))) : c(shortFile(p.file))));
  const show = vals.slice(0, 10).map((p) => {
    let v = typeof p.value === 'string' ? p.value : JSON.stringify(p.value);
    if (v.length > 64) v = v.slice(0, 61) + '…';
    return c(`${p.name}: ${v}`);
  });
  if (vals.length > 10) show.push(`<span class="lx-none">+${vals.length - 10} more</span>`);
  return [...parts, ...show].join(' ');
}

let ROSGRAPH = null; // node name -> captured interfaces (Nereus run)
const GRAPH_ALIAS = { simulator: '/talos/physics_simulator', pool_viewer: '/talos/viewer_panels' };
function capturedHtml(r) {
  if (!ROSGRAPH) return '';
  const key = r.kind === 'process' ? GRAPH_ALIAS[r.name] : r.kind === 'component' ? `/talos/${r.name}` : r.fqn;
  const g = ROSGRAPH.get(key);
  if (!g) return '';
  const list = (xs, n = 6) => xs.slice(0, n).map((x) => c(x.name.replace(/^\/talos\//, ''))).join(', ') + (xs.length > n ? `, +${xs.length - n} more` : '');
  const bits = [];
  if (g.publishers.length) bits.push(`publishes ${g.publishers.length} (${list(g.publishers)})`);
  if (g.subscribers.length) bits.push(`subscribes to ${g.subscribers.length} (${list(g.subscribers)})`);
  const extra = g.services.length + g.action_servers.length;
  if (extra) bits.push(`serves ${extra} service${extra > 1 ? 's' : ''} or action${extra > 1 ? 's' : ''}`);
  if (!bits.length) return '';
  return `<dt>In the sim capture</dt><dd>${key !== r.fqn ? c(key) + ' ' : ''}${bits.join('; ')}. ${a('interfaces.html', 'All interfaces')}.</dd>`;
}

function nodeInfo(r, ctx) {
  const rows = [];
  if (r.kind === 'process') {
    rows.push(`<dt>Runs</dt><dd>${c(r.cmd.map((x) => x.replace(/^.*\/(nereus-(sim|viewer)|sim_supervisor\.py)$/, '$1')).slice(0, 12).join(' '))}${r.cmd.length > 12 ? ' …' : ''}</dd>`);
  } else if (r.kind === 'component') {
    rows.push(`<dt>Component</dt><dd>${c(r.plugin)} from ${c(r.package)}, node ${c((r.namespace ? r.namespace + '/' : '') + r.name)}, loaded into the container above</dd>`);
  } else {
    rows.push(`<dt>Node</dt><dd>${c(r.fqn)}${r.name_from_code ? ' <span class="lx-none">(the launch file leaves it unnamed; this is the name its code gives)</span>' : ''}</dd>`);
    rows.push(`<dt>Program</dt><dd>${c(r.package)} · ${c(r.executable)}</dd>`);
  }
  if (r.url) rows.push(`<dt>Started by</dt><dd>${a(r.url, c(shortFile(r.file)) + (r.line ? ` line ${r.line}` : ''))}</dd>`);
  if (r.prefix) rows.push(`<dt>Prefix</dt><dd>${c(r.prefix)}${/taskset -c 11/.test(r.prefix) ? ": pinned to CPU core 11, set only when control_system finds /home/ros/colcon_deploy (the Orin). Only the overseer (and the legacy complete_controller) get it; riptide_mpc's node is not pinned." : ''}</dd>`);
  if (r.respawn) rows.push('<dt>Respawn</dt><dd>yes: launch restarts it whenever it exits</dd>');
  if (r.kind !== 'process' && r.kind !== 'component') rows.push(`<dt>Parameters</dt><dd>${paramHtml(r.params)}</dd>`);
  if (r.args && r.args.length) rows.push(`<dt>Arguments</dt><dd>${c(r.args.join(' '))}</dd>`);
  if (r.src) rows.push(`<dt>Source</dt><dd>${a(r.src, c(shortFile(r.src)))}</dd>`);
  if (ctx.sim && /zed_state_publisher/.test(r.fqn || '')) rows.push('<dt>On a laptop</dt><dd class="lx-warn">Only started when zed_wrapper is installed. Without it navigation prints "zed_wrapper not found. Launching without zed TF" and skips both (the media run did).</dd>');
  rows.push(capturedHtml(r));
  return `${r.role ? `<p>${esc(r.role)}</p>` : ''}<dl>${rows.join('')}</dl>`;
}

function renderNodes(list, ctx, parent) {
  for (const r of list) {
    if (r.skipped || r.kind === 'error' || r.kind === 'load') continue;
    if (r.kind === 'include') {
      const li = h('li', { class: 'lx-inc' }, parent);
      const f = h('span', { class: 'lx-file' }, li);
      f.innerHTML = r.url ? a(r.url, esc(shortFile(r.file))) : esc(shortFile(r.file));
      const ul = h('ul', {}, li);
      renderNodes(r.children || [], ctx, ul);
      if (!ul.children.length) li.remove();
      continue;
    }
    const g = GROUPS[r.group] || GROUPS.legacy;
    const li = h('li', { class: 'lx-node' + (g.dim || zedOnly(r, ctx) ? ' dim' : '') + (zedOnly(r, ctx) ? ' zed-only' : '') }, parent);
    li.style.setProperty('--c', g.color);
    const b = h('button', { type: 'button', class: 'lx-nbtn', 'aria-expanded': 'false' }, li);
    b.innerHTML = `<i class="dot" aria-hidden="true"></i><span class="nm">${esc(nodeTitle(r))}</span><span class="ex">${zedOnly(r, ctx) ? '<b class="zo">only with zed_wrapper</b> · ' : ''}${esc(nodeSub(r))}</span>`;
    const info = h('div', { class: 'lx-ninfo', hidden: '' }, li);
    b.addEventListener('click', () => {
      const open = info.hidden;
      if (open && !info.innerHTML) info.innerHTML = nodeInfo(r, ctx);
      info.hidden = !open;
      b.setAttribute('aria-expanded', String(open));
    });
    if (r.kind === 'container' && r.children?.length) {
      const ul = h('ul', { class: 'lx-comp' }, li);
      for (const comp of r.children) {
        const cl = h('li', { class: 'lx-node lx-component' }, ul);
        cl.style.setProperty('--c', g.color);
        const cb = h('button', { type: 'button', class: 'lx-nbtn', 'aria-expanded': 'false' }, cl);
        const label = comp.namespace ? `${comp.namespace}/${comp.name}` : comp.name;
        cb.innerHTML = `<i class="dot ring" aria-hidden="true"></i><span class="nm">${esc(label)}</span><span class="ex">component · ${esc(comp.plugin)}</span>`;
        const ci = h('div', { class: 'lx-ninfo', hidden: '' }, cl);
        cb.addEventListener('click', () => {
          const open = ci.hidden;
          if (open && !ci.innerHTML) ci.innerHTML = nodeInfo({ ...comp, role: /Zed/.test(comp.plugin) ? (comp.namespace === 'ffc' ? 'The forward ZED X Mini: HD1200 (1920×1200) at 15 fps, NEURAL_PLUS depth to 4 m (ffc_config.yaml).' : `The ${comp.namespace === 'dfc' ? 'downward' : ''} ZED X Mini: HD1200 (1920×1200) at 15 fps (${comp.namespace}_config.yaml).`) : comp.plugin === 'AprilTagNode' ? 'AprilTag detector: 36h11 tags of 0.508 m, on the forward camera\'s compressed images.' : '' }, ctx);
          ci.hidden = !open;
          cb.setAttribute('aria-expanded', String(open));
        });
      }
    }
  }
}

function entryInfo(e, y, ctx) {
  const key = `${e.package}/${e.file}`;
  const bits = [];
  let note = ENTRY_NOTES[key] ?? '';
  if (e.missing && e.missing_note) note = esc(e.missing_note);
  if (note) bits.push(`<p>${note}</p>`);
  if (key === 'riptide_controllers2/control_system.launch.py') {
    const m = (e.args.find((x) => x.startsWith('active_control_model:=')) || '').split(':=')[1];
    bits.push(`<p class="lx-warn">${m === 'mpc' ? 'Starts riptide_mpc. ' : `Starts the legacy ${c('complete_controller')} (${m ? c('active_control_model:=' + m) : 'no active_control_model, so the default hybrid'}). `}${ctx.bench ? 'On the bench this entry stays stopped: an enabled robot with the controller up spins the thrusters.' : ''}</p>`);
  }
  const args = e.args.map((x) => c(x)).join(' ');
  const waits = e.topics.length
    ? `<ul class="lx-topics">${e.topics.map((t) => `<li>${c(t.name)} <span>${esc(t.type.replace('/msg/', '/'))}</span></li>`).join('')}</ul>`
    : '<span class="lx-none">no topics: shows Running as soon as it starts</span>';
  bits.push(`<dl><dt>Arguments</dt><dd>${args}</dd><dt>Launch file</dt><dd>${e.url ? a(e.url, c(e.package + '/' + e.file)) : c(e.package + '/' + e.file)}${y.url && e.yaml_line ? ` · ${a(y.url + '#L' + e.yaml_line, 'its entry in ' + esc(y.file))}` : ''}</dd><dt>Running once seen</dt><dd>${waits}</dd>${e.printed?.length ? `<dt>Prints at start</dt><dd>${e.printed.map((p) => c(p)).join('<br>')}</dd>` : ''}</dl>`);
  return bits.join('');
}

function renderColumn(col, data, ctx, host) {
  const sec = h('section', { class: 'lx-col' }, host);
  const hd = h('div', { class: 'lx-col-h' }, sec);
  if (col.yaml) {
    const y = data.yamls.find((x) => x.file === col.yaml);
    const total = y.entries.reduce((s, e) => s + countProcs(e.children), 0);
    const used = y.entries.filter((e) => !UNUSED.has(`${e.package}/${e.file}`)).reduce((s, e) => s + countProcs(e.children), 0);
    hd.innerHTML = `<b>${esc(col.title)}</b> ${a(y.url, c(y.file))}<span class="lx-count">${y.entries.length} entries · ${used} processes${used !== total ? ` (${total} with the unused ones)` : ''}</span>`;
    const ol = h('ol', { class: 'lx-entries' }, sec);
    y.entries.forEach((e, i) => {
      const key = `${e.package}/${e.file}`;
      const li = h('li', { class: 'lx-entry' + (UNUSED.has(key) ? ' unused' : '') + (e.missing ? ' missing' : '') }, ol);
      const danger = key === 'riptide_controllers2/control_system.launch.py';
      const head = h('button', { type: 'button', class: 'lx-ehead' + (danger ? ' danger' : ''), 'aria-expanded': 'false' }, li);
      const n = countProcs(e.children);
      const friendly = e.file.replace(/\.launch\.py$/, '');
      head.innerHTML = `<span class="lx-n">${i + 1}</span><span class="lx-ename">${esc(friendly)}</span><span class="lx-epkg">${esc(e.package)}</span><span class="lx-ecount">${e.missing ? 'not in sources' : n + (n === 1 ? ' process' : ' processes')}</span>`;
      const body = h('div', { class: 'lx-ebody' }, li);
      const info = h('div', { class: 'lx-einfo', hidden: '' }, body);
      info.innerHTML = entryInfo(e, y, ctx);
      const ul = h('ul', { class: 'lx-tree' }, body);
      renderNodes(e.children, ctx, ul);
      // The programs are always listed (unused entries stay folded); the header opens the entry's details.
      const folded = UNUSED.has(key) || !ul.children.length;
      if (folded) ul.hidden = true;
      const set = (open) => { info.hidden = !open; if (folded) ul.hidden = !open; head.setAttribute('aria-expanded', String(open)); };
      head.addEventListener('click', () => set(info.hidden));
      set(false);
    });
  } else {
    const t = data[col.tree];
    const total = countProcs(t.children), run = countProcs(t.children, null, ctx);
    hd.innerHTML = `<b>${esc(col.title)}</b> ${a(t.url, c(t.file))}<span class="lx-count">${run} ${run === 1 ? 'process' : 'processes'}${run !== total ? ` (${total} with zed_wrapper)` : ''}</span>`;
    const cmd = h('pre', { class: 'lx-cmd' }, sec);
    cmd.textContent = col.cmd;
    const ul = h('ul', { class: 'lx-tree lx-root' }, sec);
    renderNodes(t.children, ctx, ul);
  }
}

function groupBar(host, counts) {
  host.innerHTML = '';
  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const bar = h('div', { class: 'lx-stack', role: 'img', 'aria-label': Object.entries(counts).map(([k, v]) => `${GROUPS[k]?.label || k} ${v}`).join(', ') }, host);
  const legend = h('div', { class: 'lx-legend' }, host);
  for (const k of Object.keys(GROUPS)) {
    if (!counts[k]) continue;
    const seg = h('span', {}, bar);
    seg.style.flex = counts[k];
    seg.style.background = GROUPS[k].color;
    if (GROUPS[k].dim) seg.style.opacity = 0.45;
    const l = h('span', {}, legend);
    l.innerHTML = `<i style="background:${GROUPS[k].color}${GROUPS[k].dim ? ';opacity:.45' : ''}"></i>${esc(GROUPS[k].label)} <b>${counts[k]}</b>`;
  }
  const t = h('span', { class: 'lx-total' }, legend);
  t.textContent = `${total} in all`;
}

async function explorer() {
  const host = document.getElementById('lx-cols');
  const modesEl = document.getElementById('lx-modes');
  const older = document.getElementById('lx-older');
  const desc = document.getElementById('lx-desc');
  const barHost = document.getElementById('lx-bar');
  const [data, graph] = await Promise.all([
    fetch(BASE + 'data/launch/launch_tree.json').then((r) => r.json()),
    fetch(BASE + 'data/rosgraph/rosgraph.json').then((r) => r.json()).catch(() => null),
  ]);
  if (graph) ROSGRAPH = new Map(graph.nodes.map((n) => [n.node, n]));
  for (const f of Object.keys(OLDER)) h('option', { value: f }, older).textContent = f;

  function show(mode, oldFile) {
    modesEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (!oldFile) older.value = '';
    const m = oldFile ? { desc: OLDER[oldFile], cols: [{ yaml: oldFile, title: 'Orin · launcher' }] } : MODES[mode];
    desc.innerHTML = m.desc;
    host.innerHTML = '';
    host.classList.toggle('two', m.cols.length > 1);
    const counts = {};
    for (const col of m.cols) {
      if (col.yaml) data.yamls.find((y) => y.file === col.yaml).entries.forEach((e) => countProcs(e.children, counts));
      const ctx = { sim: !!col.sim, bench: !!col.bench };
      if (!col.yaml) countProcs(data[col.tree].children, counts, ctx);
      renderColumn(col, data, ctx, host);
    }
    groupBar(barHost, counts);
  }
  for (const [k, m] of Object.entries(MODES)) {
    const b = h('button', { type: 'button', 'data-mode': k, 'aria-pressed': 'false' }, modesEl);
    b.textContent = m.label;
    b.addEventListener('click', () => show(k));
  }
  older.addEventListener('change', () => { if (older.value) show(null, older.value); else show('pool'); });
  show('pool');
}

// ---------------------------------------------------------------- who feeds whom (arc diagram)
async function deps() {
  const host = document.getElementById('deps-svg');
  const note = document.getElementById('deps-note');
  const d = await fetch(BASE + 'data/launch/deps.json').then((r) => r.json());
  const ORDER = ['hardware', 'navigation', 'zed', 'tensorrt', 'mapping', 'autonomy', 'control_system'];
  const SUB = { hardware: 'drivers, board link', navigation: 'EKF, robot model', zed: 'both cameras', tensorrt: 'YOLO detector', mapping: 'course map', autonomy: 'behaviour trees', control_system: 'the MPC' };
  const links = d.links.filter((l) => ORDER.includes(l.from) && ORDER.includes(l.to));
  const W = 420, rowH = 56, top = 24, bw = 156, bh = 40, cx = W / 2;
  const H = top * 2 + rowH * (ORDER.length - 1) + bh;
  const y = (k) => top + bh / 2 + ORDER.indexOf(k) * rowH;
  const svg = el('svg', { class: 'deps-graph', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Launch entries in start order with arcs for the topics between them' }, host);
  const defs = el('defs', {}, svg);
  for (const [id, col] of [['dep-arr', 'var(--ink-2)'], ['dep-arr-b', 'var(--muted)'], ['dep-arr-hot', 'var(--accent)']]) {
    const mk = el('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0,1 L9,5 L0,9 z', fill: col }, mk);
  }
  const gA = el('g', {}, svg), gN = el('g', {}, svg);
  // spread the ends on each side so arcs leaving one box don't share a point
  const ends = {};
  const slot = (k, side) => { const key = k + side; ends[key] = (ends[key] || 0) + 1; return ends[key]; };
  const arcs = links.map((l) => {
    const fwd = ORDER.indexOf(l.from) < ORDER.indexOf(l.to);
    const side = fwd ? 1 : -1;
    const x0 = cx + side * (bw / 2 + 2);
    const s0 = slot(l.from, side), s1 = slot(l.to, side);
    const y0 = y(l.from) + (s0 - 2) * 5, y1 = y(l.to) + (s1 - 2) * 5;
    const bulge = Math.min(Math.abs(y1 - y0) * 0.75 + 18, (W - bw) / 2 - 8) * 2;
    const path = el('path', { class: 'dep-arc' + (fwd ? '' : ' back'), d: `M${x0},${y0} Q${x0 + side * bulge},${(y0 + y1) / 2} ${x0},${y1}`, 'marker-end': `url(#dep-arr${fwd ? '' : '-b'})` }, gA);
    path.style.strokeWidth = 1 + 0.45 * l.items.length;
    return { ...l, path, fwd };
  });
  const boxes = new Map();
  ORDER.forEach((k, i) => {
    const g = el('g', { class: 'dep-node', tabindex: 0, transform: `translate(${cx},${y(k)})` }, gN);
    el('rect', { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: 7 }, g);
    const t = el('text', { y: -6 }, g); t.textContent = `${i + 1}  ${k}`;
    const s = el('text', { class: 'sub', y: 10 }, g); s.textContent = SUB[k];
    boxes.set(k, g);
  });
  const kindLabel = (it) => (it.kind === 'topic' ? c(it.name) : `${c(it.name)} <span class="kind">${it.kind}</span>`);
  // Starts on the controller, the entry the safety rules are about, and returns to it, so the note is never empty.
  const DEFAULT = 'control_system';
  const hint = '<p class="dn-hint">Tap or hover another entry to see what it needs from the others and what they take from it.</p>';
  let sel = null;
  function pick(k) {
    k = k || DEFAULT;
    sel = k;
    arcs.forEach((r) => {
      const on = k && (r.from === k || r.to === k);
      r.path.classList.toggle('hot', !!on);
      r.path.classList.toggle('dim', !!k && !on);
      r.path.setAttribute('marker-end', `url(#dep-arr${on ? '-hot' : r.fwd ? '' : '-b'})`);
    });
    boxes.forEach((g, key) => { g.classList.toggle('hot', key === k); g.classList.toggle('dim', !!k && key !== k && !arcs.some((r) => (r.from === k && r.to === key) || (r.to === k && r.from === key))); });
    const ins = arcs.filter((r) => r.to === k), outs = arcs.filter((r) => r.from === k);
    const line = (r, other) => `<li><b>${esc(other)}</b>: ${r.items.map(kindLabel).join(', ')}</li>`;
    note.innerHTML = `<b>${esc(k)}</b>${ins.length ? `<div class="dn-h">Takes from</div><ul>${ins.map((r) => line(r, r.from)).join('')}</ul>` : '<div class="dn-h">Takes nothing from the other entries</div>'}`
      + (outs.length ? `<div class="dn-h">Gives to</div><ul>${outs.map((r) => line(r, r.to)).join('')}</ul>` : '')
      + (k === 'control_system' ? '<p>Not drawn: on the robot the MPC sends RPM straight to the ESC boards over CAN (not a ROS topic, and not through <code>hardware</code>). It also publishes <code>thruster_forces</code>, which only the simulator reads.</p>' : '')
      + (k === 'hardware' ? '<p>On the robot these come from the boards (through the micro-ROS agent) and the IMU, FOG and DVL drivers; in this capture, from the simulator. Thrust doesn\'t arrive here: the MPC sends RPM to the ESCs over CAN itself.</p>' : '')
      + (k === DEFAULT ? hint : '');
  }
  boxes.forEach((g, k) => {
    g.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') pick(k); });
    g.addEventListener('pointerdown', (e) => pick(e.pointerType !== 'mouse' && sel === k ? null : k));
    g.addEventListener('focus', () => { if (sel !== k) pick(k); });
  });
  svg.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') pick(null); });
  document.addEventListener('pointerdown', (e) => { if (sel !== DEFAULT && !svg.contains(e.target) && !note.contains(e.target)) pick(null); });
  pick(null);
}

// ---------------------------------------------------------------- the launcher, inside
function inside() {
  const host = document.getElementById('inside-graph');
  const note = document.getElementById('inside-note');
  const hint = 'Tap or hover a box to see what that process does.';
  const L = RL + 'remote_launch/launcher.py';
  const N = (id, x, y, label, sub, html, extra = {}) => ({ id, x, y, label, sub, html, ...extra });
  const nodes = [
    N('systemd', 120, 50, 'systemd', 'ros_launcher.service',
      `<b>Starts the launcher at boot and restarts it</b> 500 ms after any exit (${a(RL + 'ros_launcher.service', 'ros_launcher.service')}). Type=notify: the launcher reports READY and a status line ("Current Launchfile: …; N Launches Active") that ${c('systemctl status ros_launcher')} shows. Every child stays in the service's cgroup, so stopping the service stops them all.`),
    N('launcher', 420, 50, 'launcher.py', 'page + websocket, port 8080',
      `<b>The server.</b> Serves the page from ${c('share/remote_launch/pages')}, answers websocket commands at ${c('/ws')}, loads a list, and runs one asyncio task per started entry. It imports no ROS itself (${a(L + '#L1145-L1150', 'launcher.py')}).`, { bold: true }),
    N('clients', 750, 50, 'Browser, scripts', 'websocket clients',
      `<b>Anything that speaks the JSON protocol:</b> the page in a browser, ${c('pretest_checks')}, ${c('launcher_ctl.py')}. They receive status at least every 1.5 s and the log lines of the entries they asked for. <a href="#scripting">The protocol</a>.`),
    N('zenoh', 120, 190, 'rmw_zenohd', 'Zenoh router, port 7447',
      `<b>The ROS 2 router</b> every node and laptop connects to (<a href="computers.html#zenoh">ROS 2 over Zenoh</a>). With ${c('--start-discovery-server')} the launcher kills any old router, stops the ROS daemon and starts this one with ${c('zenoh_router_test.json5')}. If it dies, the launcher shuts everything down and systemd restarts the lot.`),
    N('entry', 420, 190, 'Entry process', 'one per started entry',
      `<b>Start forks a copy of launcher.py</b> with a hidden flag, the package, the file and the arguments. It runs the launch file through ${c('ros2launch.api.launch_a_launch_file')}, the same code as ${c('ros2 launch')}, in its own session and process group, with ${c('RMW_IMPLEMENTATION=rmw_zenoh_cpp')}. Its output is piped back line by line to the pages. Stop sends SIGINT to the whole group.`),
    N('monitor', 750, 190, 'Topic monitor', 'one per started entry',
      `<b>A second fork, the only place the launcher uses rclpy.</b> It subscribes to the entry's listed topics (QoS from the third field: 0 system default, 1 sensor data) and writes one byte, the topic's index, to its stdout the first time each one publishes. When all have, it exits.`),
    N('nodes', 420, 320, "The entry's nodes", 'drivers, EKF, MPC…',
      `<b>Started by the entry's launch process</b> like any ${c('ros2 launch')}: nodes, containers and their components. They inherit the process group, so one SIGINT reaches all of them.`),
    N('laptops', 120, 320, 'Laptops, viewer', 'Zenoh clients',
      '<b>op-top, the viewer and your laptop</b> join the robot\'s ROS graph through the router. The viewer never talks to the launcher: it only sees what the nodes publish.'),
  ];
  const E = (from, to, label, extra = {}) => ({ from, to, label, ...extra });
  const edges = [
    E('systemd', 'launcher', 'starts, restarts'),
    E('clients', 'launcher', 'JSON commands', { bend: -14 }),
    E('launcher', 'clients', 'status, logs', { bend: -14 }),
    E('launcher', 'zenoh', 'starts'),
    E('launcher', 'entry', 'Start: fork', { bend: -26, lx: 446, ly: 122, anchor: 'start' }),
    E('entry', 'launcher', 'output lines', { bend: -26, lx: 394, ly: 122, anchor: 'end' }),
    E('launcher', 'monitor', 'fork', { bend: 0, lx: 560, ly: 138, anchor: 'end' }),
    E('monitor', 'launcher', '1 byte per topic seen', { bend: 40, lx: 648, ly: 104, anchor: 'start' }),
    E('entry', 'nodes', 'starts'),
    E('nodes', 'zenoh', 'ROS traffic'),
    E('nodes', 'monitor', 'listed topics'),
    E('laptops', 'zenoh', ''),
  ];
  new Graph(host, {
    width: 880, height: 360, nodes, edges,
    info: (n) => { note.innerHTML = n ? n.html : hint; },
    narrow: {
      below: 620, width: 380, height: 560,
      nodes: {
        systemd: { x: 95, y: 36 }, clients: { x: 285, y: 36 }, launcher: { x: 190, y: 140 },
        entry: { x: 185, y: 262 }, nodes: { x: 122, y: 390 }, monitor: { x: 298, y: 390 },
        zenoh: { x: 105, y: 515 }, laptops: { x: 295, y: 515 },
      },
      edges: {
        'systemd>launcher': { lx: 70, ly: 96, anchor: 'start' },
        'clients>launcher': { bend: -10, lx: 330, ly: 84, anchor: 'middle' },
        'launcher>clients': { bend: -10, lx: 330, ly: 104, anchor: 'middle' },
        'launcher>zenoh': { via: [-6, 330], lx: 26, ly: 300, anchor: 'end' },
        'launcher>entry': { bend: -16, lx: 206, ly: 205, anchor: 'start' },
        'entry>launcher': { bend: -16, lx: 160, ly: 205, anchor: 'end' },
        'launcher>monitor': { via: [300, 250], lx: 300, ly: 300, anchor: 'start' },
        'monitor>launcher': { via: [372, 230], lx: 372, ly: 186, anchor: 'end' },
        'entry>nodes': { lx: 140, ly: 326, anchor: 'end' },
        'nodes>zenoh': { lx: 124, ly: 458, anchor: 'start' },
        'nodes>monitor': { lx: 212, ly: 356 },
        'laptops>zenoh': {},
      },
    },
  });
  note.innerHTML = hint;
}

explorer();
deps();
inside();
