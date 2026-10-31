import { setup } from '../layout.js';
import { el } from '../viz/chart.js';
import '../css/chapter.css';
import '../css/launch.css';

setup();
const BASE = import.meta.env.BASE_URL;
// Public images: set from JS (a root-absolute src in the HTML gets the base twice on the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });
document.querySelectorAll('source[data-srcset]').forEach((s) => { s.srcset = BASE + s.dataset.srcset; });
document.querySelectorAll('a[data-href]').forEach((x) => { x.href = BASE + x.dataset.href; });
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
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th');

// ---------------------------------------------------------------- launch explorer
const MODES = {
  pool: {
    label: 'Pool test',
    desc: `The Orin's launcher runs ${c('talos_launch_mpc.yaml')}; op-top runs only the viewer. Rows are in <a href="#start-order">start order</a>: press Start from the top.`,
    cols: [{ yaml: 'talos_launch_mpc.yaml', title: 'Orin · launcher' }, { tree: 'robot_viewer', title: 'op-top', cmd: 'ros2 launch nereus robot.launch.py' }],
  },
  bench: {
    label: 'Bench',
    desc: `Out of the water: ${c('talos_launch_bench_mpc.yaml')} swaps the DVL driver for ${c('fake_dvl.py')}. Everything except ${c('control_system')} is safe to start.`,
    cols: [{ yaml: 'talos_launch_bench_mpc.yaml', title: 'Orin · launcher', bench: true }, { tree: 'robot_viewer', title: 'op-top', cmd: 'ros2 launch nereus robot.launch.py' }],
  },
  sim: {
    label: 'Simulation',
    desc: `On your laptop one command starts the simulator, the stack (riptide_bringup2 with ${c('hardware:=none')}) and the viewer. No launcher. Tap a launch file to see its programs.`,
    cols: [{ tree: 'sim', title: 'Your laptop', cmd: 'ros2 launch nereus sim.launch.py \\\n  active_control_model:=mpc \\\n  mpc_model:=sim', sim: true }],
  },
  hil: {
    label: 'HIL',
    desc: `Hardware in the loop: the Orin runs ${c('talos_launch_sim_hil_mpc.yaml')} (no hardware, no cameras); a desk computer runs the simulator and the viewer. The MPC still sends RPM to the ESCs: keep the physical kill switch out.`,
    cols: [{ yaml: 'talos_launch_sim_hil_mpc.yaml', title: 'Orin · launcher' }, { tree: 'sim_hil_laptop', title: 'Desk computer', cmd: 'ros2 launch nereus sim.launch.py stack:=false' }],
  },
};
const OLDER = {
  'talos_launch.yaml': `The pool list before the MPC. Its ${c('control_system')} has no ${c('active_control_model')}, so the default (hybrid) starts the legacy ${c('complete_controller')}.`,
  'talos_launch_bench.yaml': `The bench list for the legacy controller (${c('active_control_model:=complete')}).`,
  'talos_launch_debug.yaml': 'An old debugging list: hardware appears twice, and the legacy controller.',
  'talos_launch_sim_hil.yaml': `HIL with the old simulator (${c('c_simulator')}) and RViz on the Orin, and the legacy controller. Replaced by Nereus.`,
};

const CTRL = 'riptide_controllers2/control_system.launch.py';
// Start order (rank) and a one-line purpose per launch entry (package/file).
const ENTRIES = {
  'riptide_hardware2/hardware.launch.py': { rank: 1, purpose: 'Board link and sensor drivers' },
  'riptide_hardware2/hardware_fake_dvl.launch.py': { rank: 1, purpose: 'hardware, with a fake DVL for the bench' },
  'riptide_hardware2/navigation.launch.py': { rank: 2, purpose: 'EKF, depth converter, robot model' },
  'riptide_hardware2/zed.launch.py': { rank: 3, purpose: 'Both cameras' },
  'tensor_detector/tensorrt.launch.py': { rank: 4, purpose: 'The YOLO detector' },
  'riptide_mapping2/mapping.launch.py': { rank: 5, purpose: 'Course map, world → map' },
  'riptide_autonomy2/autonomy.launch.py': { rank: 6, purpose: 'Behaviour trees, actuators' },
  [CTRL]: { rank: 7, purpose: 'The controller' },
  'riptide_navigation/navigation.launch.py': { purpose: 'riptide_navigation: a Simulink alternative' },
  'riptide_hardware2/diagnostics.launch.py': { purpose: 'Monitors, no longer used' },
  'c_simulator/physics_simulator.launch.py': { purpose: 'Old simulator, replaced by Nereus' },
  'riptide_rviz/rviz_start.launch.py': { purpose: 'RViz, replaced by the Nereus viewer' },
};
// Longer notes shown when an entry is open.
const ENTRY_NOTES = {
  'riptide_hardware2/hardware.launch.py': `The board link (the micro-ROS agent on ${c('can0')}) and the sensor drivers: DVL, IMU on ${c('/dev/ttyTHS1')}, fibre-optic gyro on ${c('/dev/ttyTHS2')}. Also the AprilTag detector, acoustics and three helpers. Everything else reads its topics.`,
  'riptide_hardware2/hardware_fake_dvl.launch.py': `${c('hardware.launch.py')} for the bench: ${c('fake_dvl.py')} publishes zero velocity (5 mm/s of noise, every 0.125 s) instead of the DVL driver, so the EKF still has a velocity input. Here ${c('imu_power_cycle')} starts without ${c('imu_pwr_cycle.yaml')}, so its pin_id is the default 0.`,
  'riptide_hardware2/navigation.launch.py': `The ${a('localization.html', 'EKF')}, the depth converter and the robot model, which publishes every sensor, camera and thruster frame on ${c('/tf_static')}. Writes ${c('/tmp/model.urdf')}.`,
  'riptide_hardware2/zed.launch.py': `Both ZED X Mini cameras as components of one container process, and the calibration-photo taker (${a('cameras.html', 'The cameras')}). Start it after navigation, which publishes the camera frames.`,
  'tensor_detector/tensorrt.launch.py': `The YOLO detector, on whichever camera the tree selects (${a('perception/detector.html', 'The detector, frame by frame')}).`,
  'riptide_mapping2/mapping.launch.py': `The course map and ${c('chameleon_tf')}, which publishes ${c('world → map')} (${a('perception/map.html', 'The course map')}).`,
  'riptide_autonomy2/autonomy.launch.py': `${c('doTask')}, which runs behaviour trees when the viewer asks, and the actuator service translator (${a('bt.html', 'Behaviour trees')}).`,
  'riptide_hardware2/diagnostics.launch.py': 'Diagnostic monitors and their aggregator. The team no longer starts them; the viewer\'s CPU chip stays grey without them.',
  'c_simulator/physics_simulator.launch.py': 'The old simulator, replaced by Nereus.',
  'riptide_rviz/rviz_start.launch.py': 'RViz and its marker publishers: the old operator GUI, replaced by the Nereus viewer.',
};
const UNUSED = new Set(['riptide_hardware2/diagnostics.launch.py', 'c_simulator/physics_simulator.launch.py', 'riptide_rviz/rviz_start.launch.py']);
const keyOf = (e) => `${e.package}/${e.file}`;
const inUse = (e) => !UNUSED.has(keyOf(e)) && !e.missing;

const isProc = (r) => !r.skipped && (r.kind === 'node' || r.kind === 'container' || r.kind === 'process');
// On a laptop, navigation's two camera-frame publishers only start when zed_wrapper is installed.
const zedOnly = (r, ctx) => !!ctx?.sim && /zed_state_publisher/.test(r.fqn || '');
function countProcs(nodes, ctx) {
  let n = 0;
  for (const r of nodes || []) {
    if (r.skipped || zedOnly(r, ctx)) continue;
    if (isProc(r)) n++;
    if (r.kind === 'include') n += countProcs(r.children, ctx);
  }
  return n;
}
const procs = (n) => `${n} ${n === 1 ? 'process' : 'processes'}`;
const tail = (s) => (s || '').replace(/\/$/, '').split('/').pop();
const shortFile = (p) => tail(p);

function nodeTitle(r) {
  if (r.kind === 'process' || r.kind === 'component') return r.name;
  if (/<node_name_unspecified>/.test(r.fqn || '')) return 'diagnostic aggregator (unnamed)';
  // keep a namespace below the robot's (ffc/…, dfc/…, apriltag/…) so same-named nodes stay apart
  const rel = (r.fqn || '').replace(/^\/talos\//, '').replace(/^\//, '');
  return rel || r.executable;
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
  const nS = g.services.length, nA = g.action_servers.length;
  const serves = [nS && `${nS} service${nS > 1 ? 's' : ''}`, nA && `${nA} action${nA > 1 ? 's' : ''}`].filter(Boolean);
  if (serves.length) bits.push(`serves ${serves.join(' and ')}`);
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
    rows.push(`<dt>Node</dt><dd>${c(r.fqn)}${r.name_from_code ? ' <span class="lx-none">(the launch file leaves it unnamed; this is the name its code gives)</span>' : ''}${/<node_name_unspecified>/.test(r.fqn || '') ? ' <span class="lx-none">(the launch file gives it no name)</span>' : ''}</dd>`);
    rows.push(`<dt>Program</dt><dd>${c(r.package)} · ${c(r.executable)}</dd>`);
  }
  if (r.url) rows.push(`<dt>Started by</dt><dd>${a(r.url, c(shortFile(r.file)) + (r.line ? ` line ${r.line}` : ''))}</dd>`);
  if (r.prefix) rows.push(`<dt>Prefix</dt><dd>${c(r.prefix)}${/taskset -c 11/.test(r.prefix) ? ': pinned to CPU core 11, set only when control_system finds /home/ros/colcon_deploy (the Orin). Only the overseer (and the legacy complete_controller) get it; riptide_mpc\'s node is not pinned.' : ''}</dd>`);
  if (r.respawn) rows.push('<dt>Respawn</dt><dd>yes: launch restarts it whenever it exits</dd>');
  if (r.kind !== 'process' && r.kind !== 'component') rows.push(`<dt>Parameters</dt><dd>${paramHtml(r.params)}</dd>`);
  if (r.args && r.args.length) rows.push(`<dt>Arguments</dt><dd>${c(r.args.join(' '))}</dd>`);
  if (r.src) rows.push(`<dt>Source</dt><dd>${a(r.src, c(shortFile(r.src)))}</dd>`);
  if (ctx.sim && /zed_state_publisher/.test(r.fqn || '')) rows.push('<dt>On a laptop</dt><dd class="lx-warn">Only started when zed_wrapper is installed. Without it navigation prints "zed_wrapper not found. Launching without zed TF" and skips both (the media run did).</dd>');
  rows.push(capturedHtml(r));
  return `${r.role ? `<p>${esc(r.role)}</p>` : ''}<dl>${rows.join('')}</dl>`;
}

// A program row: tap to open what it does.
function progRow(r, ctx, parent, { ring = false, label, sub, role } = {}) {
  const li = h('li', { class: 'lx-node' + (zedOnly(r, ctx) ? ' dim' : '') }, parent);
  const b = h('button', { type: 'button', class: 'lx-nbtn', 'aria-expanded': 'false' }, li);
  b.innerHTML = `<i class="dot${ring ? ' ring' : ''}" aria-hidden="true"></i><span class="nm">${esc(label ?? nodeTitle(r))}</span><span class="ex">${zedOnly(r, ctx) ? '<b class="zo">only with zed_wrapper</b> · ' : ''}${esc(sub ?? nodeSub(r))}</span>`;
  const info = h('div', { class: 'lx-ninfo', hidden: '' }, li);
  b.addEventListener('click', () => {
    const open = info.hidden;
    if (open && !info.innerHTML) info.innerHTML = nodeInfo(role === undefined ? r : { ...r, role }, ctx);
    info.hidden = !open;
    b.setAttribute('aria-expanded', String(open));
  });
  return li;
}

function compRole(comp) {
  if (/Zed/.test(comp.plugin)) {
    return comp.namespace === 'ffc'
      ? 'The forward ZED X Mini: HD1200 (1920×1200) at 15 fps, NEURAL_PLUS depth to 4 m (ffc_config.yaml).'
      : `The ${comp.namespace === 'dfc' ? 'downward' : ''} ZED X Mini: HD1200 (1920×1200) at 15 fps (${comp.namespace}_config.yaml).`;
  }
  if (comp.plugin === 'AprilTagNode') return 'AprilTag detector: 36h11 tags of 0.508 m, on the forward camera\'s compressed images.';
  return '';
}

// `fold`: launch files that start programs become rows you open (the simulator's long tree).
function renderNodes(list, ctx, parent, fold = false) {
  for (const r of list || []) {
    if (r.skipped || r.kind === 'error' || r.kind === 'load') continue;
    if (r.kind === 'include') {
      const n = countProcs(r.children, ctx);
      if (!n && !(r.children || []).some((x) => zedOnly(x, ctx))) continue;
      // A launch file that only wraps one program: show the program alone ("Started by" names the file).
      if (!fold && n === 1 && countProcs(r.children) === 1) { renderNodes(r.children, ctx, parent, fold); continue; }
      const li = h('li', { class: 'lx-inc' }, parent);
      const direct = (r.children || []).some((x) => isProc(x));
      if (fold && direct) {
        const b = h('button', { type: 'button', class: 'lx-incbtn', 'aria-expanded': 'false' }, li);
        b.innerHTML = `<span class="nm">${esc(shortFile(r.file).replace(/\.launch\.py$/, ''))}</span><span class="lx-ecount">${procs(n)}</span>`;
        const ul = h('ul', { hidden: '' }, li);
        const link = h('li', { class: 'lx-file' }, ul);
        link.innerHTML = r.url ? a(r.url, esc(shortFile(r.file))) : esc(shortFile(r.file));
        renderNodes(r.children, ctx, ul, false);
        b.addEventListener('click', () => { ul.hidden = !ul.hidden; b.setAttribute('aria-expanded', String(!ul.hidden)); });
      } else {
        const f = h('span', { class: 'lx-file' }, li);
        f.innerHTML = r.url ? a(r.url, esc(shortFile(r.file))) : esc(shortFile(r.file));
        const ul = h('ul', {}, li);
        renderNodes(r.children, ctx, ul, fold);
      }
      continue;
    }
    const li = progRow(r, ctx, parent);
    if (r.kind === 'container' && r.children?.length) {
      const ul = h('ul', { class: 'lx-comp' }, li);
      for (const comp of r.children) {
        progRow(comp, ctx, ul, { ring: true, label: comp.namespace ? `${comp.namespace}/${comp.name}` : comp.name, sub: `component · ${comp.plugin}`, role: compRole(comp) });
      }
    }
  }
}

function entryNote(e, ctx) {
  const key = keyOf(e);
  if (key === 'riptide_navigation/navigation.launch.py') {
    const n = e.topics.length;
    return `A navigation node built from a Simulink model; its package isn't in the release sources, so it can't be opened here. Start one navigation, not both: only riptide_hardware2's publishes the camera frames ${c('zed')} needs. The launcher also waits for ${c('/a')}, a placeholder that nothing in the release sources publishes: unless the Simulink node does, this entry stays at ${n - 1}/${n} completed.`;
  }
  if (key === CTRL) {
    const m = (e.args.find((x) => x.startsWith('active_control_model:=')) || '').split(':=')[1];
    const what = m === 'mpc' ? `Starts ${a('control/index.html', 'riptide_mpc')}, the controller overseer and a drag-calibration server. ${c('active_control_model:=mpc')} picks the MPC; anything else, or leaving it out, starts the legacy ${c('complete_controller')}.` : `Starts the legacy ${c('complete_controller')} (${m ? c('active_control_model:=' + m) : 'no active_control_model, so the default hybrid'}).`;
    return `${what} <span class="lx-warn">${ctx.bench ? 'On the bench it stays stopped: an enabled robot with the controller up spins the thrusters.' : 'Start it last, with Talos killed.'}</span>`;
  }
  return ENTRY_NOTES[key] || '';
}

function entryDetails(e, y, pos) {
  const args = e.args.map((x) => c(x)).join(' ');
  const waits = e.topics.length
    ? `<ul class="lx-topics">${e.topics.map((t) => `<li>${c(t.name)} <span>${esc(t.type.replace('/msg/', '/'))}</span></li>`).join('')}</ul>`
    : '<span class="lx-none">no topics: shows Running as soon as it starts</span>';
  const where = `${e.url ? a(e.url, c(e.package + '/' + e.file)) : c(e.package + '/' + e.file)}, ${y.url && e.yaml_line ? a(y.url + '#L' + e.yaml_line, `${ordinal(pos)} in the list file`) : `${ordinal(pos)} in the list file`}`;
  return `<details class="lx-more"><summary>Arguments and the topics it waits for</summary><dl><dt>Launch file</dt><dd>${where}</dd><dt>Arguments</dt><dd>${args}</dd><dt>Running once seen</dt><dd>${waits}</dd>${e.printed?.length ? `<dt>Prints at start</dt><dd>${e.printed.map((p) => c(p)).join('<br>')}</dd>` : ''}</dl></details>`;
}

function renderEntry(e, pos, badge, y, ctx, ol, openIt, dup = false) {
  const key = keyOf(e);
  const danger = key === CTRL;
  const li = h('li', { class: 'lx-entry' + (inUse(e) && !dup ? '' : ' unused') + (danger ? ' danger' : '') }, ol);
  const head = h('button', { type: 'button', class: 'lx-ehead', 'aria-expanded': 'false' }, li);
  const n = countProcs(e.children);
  const friendly = e.file.replace(/\.launch\.py$/, '');
  let purpose = ENTRIES[key]?.purpose || e.package;
  if (danger) {
    const mpc = e.args.includes('active_control_model:=mpc');
    purpose = ctx.bench ? 'The controller: keep it stopped' : mpc ? 'The controller (riptide_mpc)' : 'The legacy controller';
  }
  if (dup) purpose = 'The same file again: start only one';
  head.innerHTML = `<span class="lx-badge">${badge}</span><span class="lx-ename">${esc(friendly)}</span><span class="lx-epurp">${esc(purpose)}</span><span class="lx-ecount">${e.missing ? 'not in sources' : procs(n)}</span>`;
  const body = h('div', { class: 'lx-ebody', hidden: '' }, li);
  const note = entryNote(e, ctx);
  if (note) h('p', { class: 'lx-enote' }, body).innerHTML = note;
  const ul = h('ul', { class: 'lx-tree' }, body);
  renderNodes(e.children, ctx, ul);
  if (!ul.children.length) ul.remove();
  const det = h('div', { class: 'lx-einfo' }, body);
  det.innerHTML = entryDetails(e, y, pos);
  const set = (open) => { body.hidden = !open; head.setAttribute('aria-expanded', String(open)); };
  head.addEventListener('click', () => set(body.hidden));
  set(!!openIt);
}

function renderColumn(col, data, ctx, host) {
  const sec = h('section', { class: 'lx-col' }, host);
  const hd = h('div', { class: 'lx-col-h' }, sec);
  if (col.yaml) {
    const y = data.yamls.find((x) => x.file === col.yaml);
    // An entry whose launch file already appeared earlier in the list is a duplicate: don't count it.
    const seen = new Set();
    const dups = new Set(y.entries.filter((e) => { const d = seen.has(keyOf(e)); seen.add(keyOf(e)); return d; }));
    const used = y.entries.filter((e) => inUse(e) && !dups.has(e));
    const nUsed = used.reduce((s, e) => s + countProcs(e.children), 0);
    hd.innerHTML = `<b>${esc(col.title)}</b> ${a(y.url, c(y.file))}<span class="lx-count">${used.length} entries in use · ${procs(nUsed)}</span>`;
    if (col.older) {
      // Older lists: file order, no start-order numbers.
      h('p', { class: 'lx-hint' }, sec).textContent = 'An older list, in file order. Tap an entry for its programs.';
      const ol = h('ol', { class: 'lx-entries' }, sec);
      y.entries.forEach((e, i) => renderEntry(e, i + 1, '–', y, ctx, ol, false, dups.has(e)));
      return;
    }
    // Ranked entries in start order (ties keep file order); the rest under "Also in the file".
    const idx = new Map(y.entries.map((e, i) => [e, i]));
    const ranked = y.entries.filter((e) => inUse(e) && ENTRIES[keyOf(e)]?.rank).sort((p, q) => ENTRIES[keyOf(p)].rank - ENTRIES[keyOf(q)].rank || idx.get(p) - idx.get(q));
    const rest = y.entries.filter((e) => !ranked.includes(e));
    h('p', { class: 'lx-hint' }, sec).textContent = 'Numbers are the start order. Tap an entry for its programs.';
    const ol = h('ol', { class: 'lx-entries' }, sec);
    ranked.forEach((e, i) => {
      const last = keyOf(e) === CTRL;
      const badge = last ? (ctx.bench ? '!' : 'last') : String(i + 1);
      renderEntry(e, idx.get(e) + 1, badge, y, ctx, ol, i === 0);
    });
    if (rest.length) {
      h('div', { class: 'lx-also' }, sec).textContent = 'Also in the file';
      const ol2 = h('ol', { class: 'lx-entries' }, sec);
      rest.forEach((e) => renderEntry(e, idx.get(e) + 1, '–', y, ctx, ol2, false));
    }
  } else {
    const t = data[col.tree];
    const total = countProcs(t.children), run = countProcs(t.children, ctx);
    hd.innerHTML = `<b>${esc(col.title)}</b> ${a(t.url, c(t.file))}<span class="lx-count">${procs(run)}${run !== total ? ` (${total} with zed_wrapper)` : ''}</span>`;
    const cmd = h('pre', { class: 'lx-cmd' }, sec);
    cmd.textContent = col.cmd;
    const ul = h('ul', { class: 'lx-tree lx-root' }, sec);
    renderNodes(t.children, ctx, ul, true);
  }
}

async function explorer() {
  const host = document.getElementById('lx-cols');
  const modesEl = document.getElementById('lx-modes');
  const older = document.getElementById('lx-older');
  const desc = document.getElementById('lx-desc');
  const [data, graph] = await Promise.all([
    fetch(BASE + 'data/launch/launch_tree.json').then((r) => r.json()),
    fetch(BASE + 'data/rosgraph/rosgraph.json').then((r) => r.json()).catch(() => null),
  ]);
  if (graph) ROSGRAPH = new Map(graph.nodes.map((n) => [n.node, n]));
  for (const f of Object.keys(OLDER)) h('option', { value: f }, older).textContent = f;

  function show(mode, oldFile) {
    modesEl.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (!oldFile) older.value = '';
    const m = oldFile ? { desc: OLDER[oldFile], cols: [{ yaml: oldFile, title: 'Orin · launcher', older: true }] } : MODES[mode];
    desc.innerHTML = m.desc;
    host.innerHTML = '';
    host.classList.toggle('two', m.cols.length > 1);
    for (const col of m.cols) renderColumn(col, data, { sim: !!col.sim, bench: !!col.bench }, host);
  }
  for (const [k, m] of Object.entries(MODES)) {
    const b = h('button', { type: 'button', 'data-mode': k, 'aria-pressed': 'false' }, modesEl);
    b.textContent = m.label;
    b.addEventListener('click', () => show(k));
  }
  older.addEventListener('change', () => { if (older.value) show(null, older.value); else show('pool'); });
  show('pool');
}

// ---------------------------------------------------------------- who feeds whom: one entry in focus
async function deps() {
  const chips = document.getElementById('dx-chips');
  const flow = document.getElementById('dx-flow');
  const d = await fetch(BASE + 'data/launch/deps.json').then((r) => r.json());
  const ORDER = ['hardware', 'navigation', 'zed', 'tensorrt', 'mapping', 'autonomy', 'control_system'];
  const SUB = { hardware: 'drivers, board link', navigation: 'EKF, robot model', zed: 'both cameras', tensorrt: 'YOLO detector', mapping: 'course map', autonomy: 'behaviour trees', control_system: 'the MPC', viewer: 'on op-top, not a launcher entry' };
  const rank = (k) => ORDER.indexOf(k); // viewer: -1
  const badge = (k) => (k === 'viewer' ? '<span class="dx-n op">op-top</span>' : `<span class="dx-n">${k === 'control_system' ? 'last' : rank(k) + 1}</span>`);
  const NOTES = {
    control_system: `Start the viewer before it: the viewer holds a software kill (${c('command/software_kill')} to hardware) until someone presses Enable. Thrust isn't drawn: on the robot the MPC writes RPM straight to the ESC boards over CAN. Its ${c('thruster_forces')} and ${c('command/requested_rpm')} topics are copies for logs and the viewer.`,
    hardware: `It takes zed's camera topics for the AprilTag detector, which ${c('hardware.launch.py')} also starts. On the robot its own topics come from the boards (through the micro-ROS agent) and the IMU, FOG and DVL drivers; in this capture, from the simulator, so links that only exist on the robot (${c('command/led')} to the LED board) are missing.`,
    zed: `Needs navigation's camera frames on ${c('/tf_static')} (not drawn: TF is left out), so start it after navigation. In this capture the simulator publishes the camera topics.`,
    viewer: 'The viewer is not a launcher entry: op-top runs it. Start it before control_system.',
  };
  const count = (items) => {
    const n = {};
    items.forEach((it) => { n[it.kind] = (n[it.kind] || 0) + 1; });
    return Object.entries(n).map(([k, v]) => `${v} ${k}${v > 1 ? 's' : ''}`).join(', ');
  };
  const item = (it) => `<li><code>${esc(it.name).replace(/\//g, '/<wbr>')}</code>${it.kind !== 'topic' ? ` <span class="dx-kind">${it.kind}</span>` : ''}</li>`;
  let sel = 'control_system';
  for (const k of [...ORDER, 'viewer']) {
    const b = h('button', { type: 'button', 'data-k': k, 'aria-pressed': 'false' }, chips);
    b.innerHTML = k === 'viewer' ? 'viewer' : `${k === 'control_system' ? '' : rank(k) + 1 + ' '}${k}`;
    b.addEventListener('click', () => pick(k));
  }
  // A link is "back" when it points up the start order: the earlier entry simply waits for it.
  const isBack = (from, to) => from !== 'viewer' && to !== 'viewer' && rank(from) > rank(to);
  function card(other, items, dir) {
    // dir 'in': other -> sel; 'out': sel -> other
    const back = dir === 'in' ? isBack(other, sel) : isBack(sel, other);
    const why = !back ? '' : dir === 'in'
      ? `<span class="dx-why">starts later: ${esc(sel)} waits for it</span>`
      : `<span class="dx-why">started earlier: it waits for ${esc(sel)}</span>`;
    // Wide screens list the names; phones fold them behind the count, so a whole entry fits on about one screen.
    const n = count(items);
    return `<li class="dx-card${back ? ' back' : ''}${other === 'viewer' ? ' op' : ''}"><div class="dx-row"><button type="button" class="dx-go" data-k="${other}" aria-label="Focus on ${esc(other)}">${badge(other)}<b>${esc(other)}</b></button><span class="dx-cnt">${n}</span><button type="button" class="dx-tog" aria-expanded="false">${n}</button></div>${why}<ul class="dx-items">${items.map(item).join('')}</ul></li>`;
  }
  function pick(k) {
    sel = k;
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    const r9 = (x) => (rank(x) < 0 ? 99 : rank(x)); // the viewer last
    const ins = d.links.filter((l) => l.to === k).sort((p, q) => r9(p.from) - r9(q.from));
    const outs = d.links.filter((l) => l.from === k).sort((p, q) => r9(p.to) - r9(q.to));
    flow.innerHTML = `
      <div class="dx-mid"><div class="dx-box">${badge(k)}<b>${esc(k)}</b><span>${esc(SUB[k])}</span></div>${NOTES[k] ? `<p class="dx-note">${NOTES[k]}</p>` : ''}</div>
      <div class="dx-col dx-in"><div class="dx-h">Takes from</div>${ins.length ? `<ul class="dx-cards">${ins.map((l) => card(l.from, l.items, 'in')).join('')}</ul>` : '<p class="dx-none">No topics from other entries.</p>'}</div>
      <div class="dx-col dx-out"><div class="dx-h">Gives to</div>${outs.length ? `<ul class="dx-cards">${outs.map((l) => card(l.to, l.items, 'out')).join('')}</ul>` : '<p class="dx-none">Nothing to the other entries.</p>'}</div>`;
    flow.querySelectorAll('.dx-go').forEach((b) => b.addEventListener('click', () => pick(b.dataset.k)));
    flow.querySelectorAll('.dx-tog').forEach((b) => b.addEventListener('click', () => {
      b.setAttribute('aria-expanded', String(b.closest('.dx-card').classList.toggle('open')));
    }));
  }
  pick(sel);
}

// ---------------------------------------------------------------- the launcher, inside: a step-by-step flow
function inside() {
  const svgHost = document.getElementById('lf-svg');
  const stepsEl = document.getElementById('lf-steps');
  const text = document.getElementById('lf-text');
  const prev = document.getElementById('lf-prev'), next = document.getElementById('lf-next');
  const L = RL + 'remote_launch/launcher.py';
  const BOXES = {
    systemd: ['systemd', 'ros_launcher.service'],
    launcher: ['launcher.py', 'the page, port 8080'],
    clients: ['Browser', 'or a script'],
    zenoh: ['Zenoh router', 'rmw_zenohd'],
    entry: ['Entry process', 'one per entry'],
    monitor: ['Topic monitor', 'one per entry'],
    nodes: ["The entry's nodes", 'drivers, EKF, MPC…'],
  };
  // Two layouts: phone (drawn at about 1:1 in a 320-unit box) and wide.
  const LAYOUT = {
    narrow: {
      W: 320, H: 312, bw: 132, bh: 46,
      at: { systemd: [8, 8], clients: [180, 8], launcher: [60, 90, 200], entry: [8, 176], monitor: [172, 176], nodes: [8, 262], zenoh: [172, 262] },
      edges: {
        'systemd>launcher': { d: 'M74,54 L100,90', lx: 74, ly: 80, anchor: 'end' },
        'clients>launcher': { d: 'M226,54 L214,90', lx: 210, ly: 74, anchor: 'end' },
        'launcher>clients': { d: 'M246,90 L258,54', lx: 262, ly: 74, anchor: 'start' },
        'launcher>zenoh': { d: 'M260,113 H314 V285 H304', lx: 312, ly: 152, anchor: 'end' },
        'launcher>entry': { d: 'M92,136 L80,176', lx: 76, ly: 160, anchor: 'end' },
        'entry>launcher': { d: 'M112,176 L124,136', lx: 128, ly: 160, anchor: 'start' },
        'launcher>monitor': { d: 'M196,136 L208,176', lx: 204, ly: 160, anchor: 'end' },
        'monitor>launcher': { d: 'M228,176 L216,136', lx: 232, ly: 160, anchor: 'start' },
        'entry>nodes': { d: 'M74,222 L74,262', lx: 82, ly: 246, anchor: 'start' },
        'nodes>zenoh': { d: 'M140,292 L172,292', lx: 156, ly: 310, anchor: 'middle' },
        'nodes>monitor': { d: 'M140,262 L172,222', lx: 154, ly: 236, anchor: 'end' },
      },
    },
    wide: {
      W: 640, H: 260, bw: 160, bh: 48,
      at: { systemd: [20, 10], launcher: [240, 10], clients: [460, 10], zenoh: [20, 112], entry: [240, 112], monitor: [460, 112], nodes: [240, 206] },
      edges: {
        'systemd>launcher': { d: 'M180,34 L240,34', lx: 210, ly: 27, anchor: 'middle' },
        'clients>launcher': { d: 'M460,26 L400,26', lx: 430, ly: 19, anchor: 'middle' },
        'launcher>clients': { d: 'M400,44 L460,44', lx: 430, ly: 60, anchor: 'middle' },
        'launcher>zenoh': { d: 'M270,58 L150,112', lx: 196, ly: 76, anchor: 'end' },
        'launcher>entry': { d: 'M310,58 L310,112', lx: 304, ly: 90, anchor: 'end' },
        'entry>launcher': { d: 'M330,112 L330,58', lx: 336, ly: 90, anchor: 'start' },
        'launcher>monitor': { d: 'M372,58 L478,112', lx: 412, ly: 98, anchor: 'end' },
        'monitor>launcher': { d: 'M498,112 L392,58', lx: 492, ly: 88, anchor: 'start' },
        'entry>nodes': { d: 'M320,160 L320,206', lx: 328, ly: 186, anchor: 'start' },
        'nodes>zenoh': { d: 'M240,222 L120,160', lx: 170, ly: 210, anchor: 'end' },
        'nodes>monitor': { d: 'M400,222 L520,160', lx: 470, ly: 210, anchor: 'start' },
      },
    },
  };
  const LABEL = {
    'systemd>launcher': 'starts', 'clients>launcher': 'Start', 'launcher>clients': 'status', 'launcher>zenoh': 'starts',
    'launcher>entry': 'starts', 'entry>launcher': 'output', 'launcher>monitor': 'starts', 'monitor>launcher': '1 byte per topic',
    'entry>nodes': 'starts', 'nodes>zenoh': 'join', 'nodes>monitor': 'topics',
  };
  const STEPS = [
    { boxes: ['systemd', 'launcher'], edges: ['systemd>launcher'],
      html: `<b>systemd starts the launcher.</b> At boot, ${a(RL + 'ros_launcher.service', c('ros_launcher.service'))} runs ${c('launcher.py')} as user ${c('ros')} and restarts it 500 ms after any exit. Everything the launcher starts stays inside the service, so stopping the service stops it all.` },
    { boxes: ['launcher', 'zenoh'], edges: ['launcher>zenoh'],
      html: `<b>The launcher starts the Zenoh router.</b> It kills any old router, then runs the command in ${c('DISCOVERY_SERVER_CMD')} (<a href="#zenoh-router">which one</a>). Every node and laptop joins the ROS graph through it. If the router dies, the launcher stops everything and exits.` },
    { boxes: ['clients', 'launcher', 'entry'], edges: ['clients>launcher', 'launcher>entry'],
      html: `<b>You press Start.</b> The page sends a JSON command over the websocket. The launcher starts a second copy of ${c('launcher.py')}, the entry process, in its own session and process group: one signal reaches it and everything it starts.` },
    { boxes: ['entry', 'nodes', 'zenoh', 'launcher'], edges: ['entry>nodes', 'nodes>zenoh', 'entry>launcher'],
      html: `<b>The entry process runs the launch file</b> with the same code as ${c('ros2 launch')}. Its nodes start and join the graph through the router. Their output comes back to the launcher line by line, for the page's Launch Log.` },
    { boxes: ['launcher', 'monitor', 'nodes'], edges: ['launcher>monitor', 'nodes>monitor'],
      html: `<b>A third copy, the topic monitor, watches.</b> It is the only part of the launcher that joins ROS as a node; the parent never touches ROS (${a(L + '#L1145-L1150', 'why')}). It subscribes to the topics listed for this entry.` },
    { boxes: ['monitor', 'launcher', 'clients'], edges: ['monitor>launcher', 'launcher>clients'],
      html: `<b>The entry shows Running.</b> The first time each topic publishes, the monitor writes one byte to the launcher; when it has seen them all, it exits. The launcher sends every page the status at least every 1.5 s.` },
  ];
  let step = 0, narrow = null, svg = null;
  const parts = { boxes: {}, edges: {} };
  function build() {
    const w = svgHost.clientWidth || innerWidth;
    const n = w < 520;
    if (n === narrow && svg) return;
    narrow = n;
    const Lo = n ? LAYOUT.narrow : LAYOUT.wide;
    svgHost.innerHTML = '';
    svg = el('svg', { class: 'lf-svg' + (n ? ' narrow' : ''), viewBox: `0 0 ${Lo.W} ${Lo.H}`, role: 'img', 'aria-label': 'The launcher and the processes it starts' }, svgHost);
    svg.style.maxWidth = Lo.W * (n ? 1.15 : 1.05) + 'px';
    const defs = el('defs', {}, svg);
    for (const [id, col] of [['lf-arr', 'var(--rule)'], ['lf-arr-hot', 'var(--accent)']]) {
      const mk = el('marker', { id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: col }, mk);
    }
    const gE = el('g', {}, svg), gB = el('g', {}, svg), gL = el('g', {}, svg);
    for (const [k, e] of Object.entries(Lo.edges)) {
      const p = el('path', { class: 'lf-edge', d: e.d, 'marker-end': 'url(#lf-arr)' }, gE);
      const t = el('text', { class: 'lf-elabel', x: e.lx, y: e.ly, 'text-anchor': e.anchor }, gL);
      t.textContent = LABEL[k];
      parts.edges[k] = { p, t };
    }
    for (const [k, [label, sub]] of Object.entries(BOXES)) {
      const [x, y, bw = Lo.bw] = Lo.at[k];
      const g = el('g', { class: 'lf-box', transform: `translate(${x},${y})`, tabindex: 0, role: 'button', 'aria-label': label }, gB);
      el('rect', { width: bw, height: Lo.bh, rx: 7 }, g);
      el('text', { x: bw / 2, y: Lo.bh / 2 - 7, class: 'lf-name' }, g).textContent = label;
      el('text', { x: bw / 2, y: Lo.bh / 2 + 10, class: 'lf-sub' }, g).textContent = sub;
      const go = () => { const i = STEPS.findIndex((s) => s.boxes.includes(k)); show(STEPS[step].boxes.includes(k) ? step : i); };
      g.addEventListener('click', go);
      g.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      parts.boxes[k] = g;
    }
    show(step);
  }
  STEPS.forEach((_, i) => {
    const b = h('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': `Step ${i + 1}` }, stepsEl);
    b.textContent = i + 1;
    b.addEventListener('click', () => show(i));
  });
  function show(i) {
    step = i;
    const s = STEPS[i];
    stepsEl.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
    for (const [k, g] of Object.entries(parts.boxes)) g.classList.toggle('hot', s.boxes.includes(k));
    for (const [k, { p, t }] of Object.entries(parts.edges)) {
      const on = s.edges.includes(k);
      p.classList.toggle('hot', on);
      p.setAttribute('marker-end', `url(#lf-arr${on ? '-hot' : ''})`);
      t.classList.toggle('hot', on);
    }
    text.innerHTML = `<span class="lf-of">Step ${i + 1} of ${STEPS.length}</span> ${s.html}`;
    prev.disabled = i === 0;
    next.disabled = i === STEPS.length - 1;
  }
  prev.addEventListener('click', () => show(Math.max(0, step - 1)));
  next.addEventListener('click', () => show(Math.min(STEPS.length - 1, step + 1)));
  new ResizeObserver(build).observe(svgHost);
  build();
}

explorer();
deps();
inside();
