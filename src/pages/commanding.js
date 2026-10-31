import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/commanding.css';
import { FlowGraph } from '../viz/commanding-flow.js';
import { KillSim, makeConstants, HISTORY_SECONDS } from '../viz/commanding-killsim.js';

setup();

const BASE = import.meta.env.BASE_URL;
// Public images: set from here, because Vite's dev server rewrites an absolute src under the base a second time.
document.querySelectorAll('img[data-src]').forEach((img) => { img.src = BASE + img.dataset.src; });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (v, n = 2) => '0x' + v.toString(16).toUpperCase().padStart(n, '0');

function segmented(host, options, value, onPick, label) {
  const s = document.createElement('span');
  s.className = 'seg';
  s.setAttribute('role', 'group');
  if (label) s.setAttribute('aria-label', label);
  const buttons = options.map(([v, text]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.dataset.v = v;
    b.setAttribute('aria-pressed', String(v === value));
    b.onclick = () => { set(v); onPick(v); };
    s.appendChild(b);
    return b;
  });
  const set = (v) => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
  host.appendChild(s);
  return { el: s, set };
}

fetch(BASE + 'data/commanding/commanding.json').then((r) => r.json()).then(init);

function init(data) {

// ---------------------------------------------------------------- message definitions
{
  const tabs = document.getElementById('msg-tabs');
  const pre = document.getElementById('msg-text');
  const src = document.getElementById('msg-src');
  const names = ['ControllerCommand', 'FollowPath', 'PathSegment', 'KillSwitchReport', 'DshotCommand'];
  const highlight = (text) => text.split('\n').map((line) => {
    const i = line.indexOf('#');
    const code = i >= 0 ? line.slice(0, i) : line, comment = i >= 0 ? line.slice(i) : '';
    let html = esc(code);
    if (/^---/.test(code)) html = `<span class="sep">${html}</span>`;
    else html = html.replace(/^(\s*)([\w/\[\]]+)(\s+)([A-Za-z_]\w*)/, '$1<span class="k">$2</span>$3<span class="f">$4</span>');
    return html + (comment ? `<span class="c">${esc(comment)}</span>` : '');
  }).join('\n');
  const show = (name) => {
    const m = data.msgs[name];
    pre.innerHTML = `<code>${highlight(m.text)}</code>`;
    src.innerHTML = `<a href="${m.url}">${esc(m.path)}</a>`;
  };
  names.forEach((n, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n;
    b.setAttribute('aria-pressed', String(i === 0));
    b.onclick = () => { tabs.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); show(n); };
    tabs.appendChild(b);
  });
  show(names[0]);
}

// ---------------------------------------------------------------- the message-flow graph
{
  const L = data.mpc.links, F = data.firmware.links, V = data.viewer.links, O = data.overseer.links;
  const canId = (b) => hex(data.can[b].id);
  const NODES = [
    { id: 'bt', label: 'Autonomy', sub: 'behaviour tree', x: 118, y: 75,
      info: 'The mission tree (riptide_autonomy2). Sends goals, waits on settle trust, and waits for <code>state/kill</code> to read false before a run.',
      link: 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/include/riptide_autonomy/bt_actions/FollowPath.btaction.hpp' },
    { id: 'viewer', label: 'Nereus viewer', sub: 'motion panel', x: 118, y: 250,
      info: `The operator UI on a laptop. Commands poses, and owns software kill slot ${data.viewer.slot}: it asserts kill every ${data.viewer.heartbeat_s * 1000} ms until you press Enable.`, link: V.report },
    { id: 'sw', label: 'Kill switch', sub: 'on the hull', x: 118, y: 425,
      info: 'Pulled = killed. The kill line removes ESC power, and the POAC board reads the switch on a GPIO interrupt as slot 0.', link: F.physical },
    { id: 'mpc', label: 'mpc_controller', sub: 'riptide_mpc, 20 Hz', x: 390, y: 75,
      info: `Holds the reference and ticks every ${data.mpc.control_period_s * 1000} ms. It sends zero thrust while killed, while motion is disabled, or with odometry older than ${data.mpc.odom_timeout_s} s.`, link: L.tick },
    { id: 'ov', label: 'controller_overseer', sub: 'riptide_controllers2', x: 390, y: 215,
      info: 'Left over from the Simulink controller and still launched with the MPC. It turns ESC telemetry into <code>controller/motion_enabled</code> and publishes the feedforward wrench.', link: O.telemetry_cb },
    { id: 'agent', label: 'micro-ROS agent', sub: 'on the Orin, can0', x: 390, y: 355,
      info: `Bridges ROS 2 to the boards' micro-ROS clients over the internal CAN bus (CAN FD, ${data.can.rate / 1e6} Mbit/s, ${data.can.fd_rate / 1e6} Mbit/s data). Every ROS message to or from a board crosses it.`,
      link: 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/launch/copro_agent.launch.py' },
    { id: 'esc', label: 'ESC boards 0 and 1', sub: `CAN ${canId('esc0')}, ${canId('esc1')}`, x: 660, y: 145,
      info: `Four thrusters each. Each target expires after ${data.firmware.esc_rpm_timeout_ms.value} ms. A PI speed loop per thruster runs on DShot${data.firmware.dshot_rate_khz.value} with RPM fed back from the ESC.`, link: F.esc_flags },
    { id: 'poac', label: 'POAC board', sub: 'kill authority', x: 660, y: 425,
      info: 'Power and actuator board. It combines the physical switch and the software slots into one kill. It drives the soft-kill pin and publishes <code>state/kill</code>.', link: F.refresh },
    { id: 'thr', label: '8 thrusters', sub: 'ESCs + T200s', x: 850, y: 145,
      info: 'Each ESC runs one T200 at the throttle the board sends. The ESCs are powered through the kill line.', link: 'thrusters-hw.html' },
  ];
  const ms = (o) => `${o.value} ms`;
  const EDGES = [
    { from: 'bt', to: 'mpc', label: 'follow_path, controller/*', bend: 22,
      meta: '<code>follow_path</code> (FollowPath action) and <code>controller/linear</code>, <code>/angular</code> (ControllerCommand)' },
    { from: 'mpc', to: 'bt', label: 'trust, result', bend: 22,
      meta: '<code>controller/scale/trust</code> (Twist, 20 Hz), action feedback (20 Hz) and result' },
    { from: 'viewer', to: 'mpc', label: 'controller/*',
      meta: '<code>controller/linear</code> + <code>/angular</code> (ControllerCommand), on Command and while dragging' },
    { from: 'viewer', to: 'agent', label: 'software_kill', lx: 236, ly: 296,
      meta: `<code>command/software_kill</code> (KillSwitchReport), slot ${data.viewer.slot}, every ${data.viewer.heartbeat_s * 1000} ms` },
    { from: 'agent', to: 'poac', label: 'software_kill', bend: 20, meta: 'the slot reports, over CAN' },
    { from: 'poac', to: 'agent', label: 'state/kill', bend: 20,
      meta: `<code>state/kill</code> (Bool), every ${ms(data.firmware.poac_kill_publish_ms)} and on a change; <code>state/firmware</code> kill bitmasks` },
    { from: 'sw', to: 'poac', label: 'kill line', meta: 'the switch line: ESC power, and a GPIO interrupt on the POAC board' },
    { from: 'poac', to: 'thr', label: 'ESC power', dash: true, meta: 'the kill line; the soft-kill pin can cut it even with the switch in' },
    { from: 'agent', to: 'mpc', label: 'state/kill', via: [215, 215], lx: 296, ly: 250, anchor: 'end',
      meta: '<code>state/kill</code>: true makes the MPC send zeros and abort any path' },
    { from: 'agent', to: 'esc', label: 'state/kill', lx: 560, ly: 260,
      meta: `<code>state/kill</code>, used by the ESC boards as their own heartbeat slot (${ms(data.firmware.switch_timeout_ms)} timeout)` },
    { from: 'mpc', to: 'esc', label: 'raw CAN, 20 Hz', lx: 524, ly: 100,
      meta: `two CAN frames each tick, ${canId('esc0')} and ${canId('esc1')}, four int16 RPMs each, skipping ROS entirely` },
    { from: 'esc', to: 'thr', label: 'DShot600', ly: 133, meta: 'throttle out, RPM back (bidirectional DShot)' },
    { from: 'esc', to: 'ov', label: 'telemetry, 2 Hz', lx: 524, ly: 160,
      meta: `<code>state/thrusters/telemetry</code> (DshotPartialTelemetry), every ${ms(data.firmware.esc_telemetry_ms)} per board, through the agent` },
    { from: 'ov', to: 'mpc', label: 'motion_enabled', lx: 398, ly: 128, anchor: 'start',
      meta: '<code>controller/motion_enabled</code> (Bool) and <code>controller/FF_body_force</code> (1 Hz)' },
  ];
  const narrow = {
    below: 620, width: 360, height: 720, bands: [],
    nodes: {
      bt: { x: 88, y: 46 }, viewer: { x: 272, y: 46 },
      mpc: { x: 88, y: 210 }, ov: { x: 246, y: 182, label: 'overseer', sub: 'controller_overseer' },
      agent: { x: 272, y: 330 }, esc: { x: 88, y: 420, label: 'ESC boards', sub: `${canId('esc0')}, ${canId('esc1')}` },
      poac: { x: 272, y: 480 }, thr: { x: 88, y: 590 }, sw: { x: 272, y: 650 },
    },
    edges: {
      'bt>mpc': { label: 'goals', bend: 20, lx: 56, ly: 132, anchor: 'end' },
      'mpc>bt': { label: 'trust', bend: 20, lx: 122, ly: 132, anchor: 'start' },
      'viewer>mpc': { label: 'controller/*', lx: 196, ly: 112, anchor: 'start' },
      'viewer>agent': { via: [436, 196], label: 'software_kill', lx: 336, ly: 256, anchor: 'end' },
      'agent>poac': { bend: 18, lx: 300, ly: 410, anchor: 'start', label: 'kill reports' },
      'poac>agent': { bend: 18, lx: 244, ly: 410, anchor: 'end', label: 'state/kill' },
      'sw>poac': { lx: 280, ly: 570, anchor: 'start', label: 'kill line' },
      'poac>thr': { lx: 196, ly: 560, anchor: 'end' },
      'agent>mpc': { lx: 190, ly: 254, anchor: 'start', label: '' },
      'agent>esc': { lx: 200, ly: 380, anchor: 'end', label: '' },
      'mpc>esc': { lx: 80, ly: 318, anchor: 'end', label: 'CAN' },
      'esc>thr': { lx: 80, ly: 508, anchor: 'end', label: 'DShot' },
      'esc>ov': { label: '' },
      'ov>mpc': { label: '' },
    },
  };
  const bands = [
    { label: 'WHO COMMANDS', points: [[24, 14], [212, 14], [212, 478], [24, 478]] },
    { label: 'ON THE ORIN', points: [[262, 14], [520, 14], [520, 478], [262, 478]] },
    { label: 'BOARDS AND THRUSTERS', points: [[566, 14], [924, 14], [924, 478], [566, 478]] },
  ];
  const STORIES = [
    { id: 'goal', name: 'A goal', intro: 'A goal from the tree to the propellers, and the answer back.', steps: [
      { edges: ['bt>mpc'], text: '<code>FollowPath</code> sends a goal on <code>follow_path</code>. The MPC checks it, plans the whole path and starts the reference moving.' },
      { edges: ['mpc>esc'], text: `Every ${data.mpc.control_period_s * 1000} ms: estimate, solve, publish <code>thruster_forces</code>, convert to RPM, write frames ${canId('esc0')} and ${canId('esc1')} on <code>can0</code>.` },
      { edges: ['esc>thr'], text: `Each ESC board keeps its four targets for ${data.firmware.esc_rpm_timeout_ms.value} ms. Its speed loops drive the ESCs over DShot600.` },
      { edges: ['mpc>bt'], text: `Feedback every tick (metres along the path). Success once settle trust reaches ${data.mpc.success_trust} at the end.` },
    ] },
    { id: 'enable', name: 'Enable', intro: 'Pressing Enable in the viewer, until the props are allowed to turn.', steps: [
      { edges: ['viewer>agent', 'agent>poac'], text: `The viewer's slot-${data.viewer.slot} report (every ${data.viewer.heartbeat_s * 1000} ms) changes to "not killed".` },
      { edges: ['poac>thr'], text: 'No slot asserting and the switch in: the POAC board releases its soft-kill pin, and the ESCs get power.' },
      { edges: ['poac>agent', 'agent>esc', 'agent>mpc'], text: '<code>state/kill</code> goes false at once. The ESC boards and the MPC clear their kill.' },
      { edges: ['esc>ov', 'ov>mpc'], text: `For ${data.firmware.esc_poweron_delay_ms.value / 1000} s the ESC boards report <code>ESC_POWERON_DELAY</code>, so the overseer keeps <code>motion_enabled</code> false. Then the flags clear and the MPC may drive.` },
    ] },
    { id: 'kill', name: 'Pull the switch', intro: 'Pulling the physical switch.', steps: [
      { edges: ['sw>poac', 'poac>thr'], text: "The switch line drops. ESC power goes, and the POAC board's interrupt marks slot 0 as asserting." },
      { edges: ['poac>agent', 'agent>esc', 'agent>mpc'], text: '<code>state/kill</code> = true goes out at once. The ESC boards zero their throttles, and the MPC sends zeros and aborts any path.' },
      { edges: ['mpc>esc'], text: 'The MPC keeps writing frames of zeros every tick, so the ESC targets never go stale. The reference is kept for when the switch goes back in. A running path is cut short, and its last point becomes the reference.' },
    ] },
    { id: 'health', name: 'Health back', intro: 'What flows back up to the controller and the tree.', steps: [
      { edges: ['esc>ov'], text: 'Each ESC board reports at 2 Hz: disabled flags, RPM, ESC temperature, voltage and current.' },
      { edges: ['ov>mpc'], text: `The overseer turns that into <code>motion_enabled</code>: false after more than ${data.overseer.stop_tolerance.value} flagged messages in a row, or ${data.overseer.power_timeout_s.value} s with none.` },
      { edges: ['poac>agent'], text: '<code>state/kill</code> and <code>state/firmware</code> (with per-slot kill bitmasks) go to anyone listening: the viewer shows "Robot: killed / enabled".' },
      { edges: ['mpc>bt'], text: 'The MPC publishes settle trust each tick. <code>WaitForController</code> and the <code>FollowPath</code> result use it.' },
    ] },
  ];

  const note = document.getElementById('flow-note');
  const stepsEl = document.getElementById('flow-steps');
  let story = STORIES[0];
  const describe = (n) => {
    const ins = EDGES.filter((e) => e.to === n.id), outs = EDGES.filter((e) => e.from === n.id);
    const name = (id) => NODES.find((x) => x.id === id).label;
    const list = (arr, dir) => arr.map((e) => `<li><span class="dir">${dir} ${esc(name(dir === 'from' ? e.from : e.to))}:</span> ${e.meta}</li>`).join('');
    return `<b>${esc(n.label)}.</b> ${n.info} <a href="${n.link}">Code</a>.<ul class="io">${list(ins, 'from')}${list(outs, 'to')}</ul>`;
  };
  const graph = new FlowGraph(document.getElementById('flow-graph'), {
    width: 940, height: 494, nodes: NODES, edges: EDGES, bands, narrow,
    info: (n) => { note.innerHTML = n ? describe(n) : `<b>${story.name}.</b> ${story.intro} Tap a step to light just its links.`; },
  });
  const showStory = (s) => {
    story = s;
    stepsEl.innerHTML = s.steps.map((st, i) => `<li><button type="button" data-i="${i}">${st.text}</button></li>`).join('');
    stepsEl.querySelectorAll('button').forEach((b) => {
      b.onclick = () => {
        const on = b.getAttribute('aria-pressed') !== 'true';
        stepsEl.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', String(on));
        graph.route(on ? s.steps[+b.dataset.i].edges : s.steps.flatMap((x) => x.edges));
      };
    });
    graph.route(s.steps.flatMap((x) => x.edges));
    note.innerHTML = `<b>${s.name}.</b> ${s.intro} Tap a step to light just its links.`;
  };
  segmented(document.getElementById('flow-stories'), STORIES.map((s) => [s.id, s.name]), STORIES[0].id,
    (id) => showStory(STORIES.find((s) => s.id === id)));
  showStory(STORIES[0]);
}

// ---------------------------------------------------------------- force -> RPM -> CAN frame
{
  const hw = data.hardware, names = data.thrusters.names;
  const ktScale = hw.rho * hw.diameter ** 4 / 3600;
  // HardwareConfig::forceToRpm, propeller branch: root of kt_scale (a + b R) R^2 = |F|
  const forceToRpm = (f) => {
    if (f === 0 || !Number.isFinite(f)) return 0;
    const [a, b] = f > 0 ? hw.kt_forward : hw.kt_reverse;
    const target = Math.abs(f) / ktScale;
    let r = Math.sqrt(target / a);
    for (let i = 0; i < 50; i++) {
      const step = ((a + b * r) * r * r - target) / ((2 * a + 3 * b * r) * r);
      r -= step;
      if (Math.abs(step) <= 1e-12 * r) break;
    }
    return Math.sign(f) * r;
  };
  const st = { i: 0, f: 10 };
  const controls = document.getElementById('can-controls');
  const readout = document.getElementById('can-readout');
  const frames = document.getElementById('can-frames');
  const wrap = document.createElement('label');
  wrap.className = 'can-pick';
  wrap.textContent = 'Thruster ';
  segmented(wrap, names.map((n, i) => [String(i), n]), '0', (v) => { st.i = +v; draw(); }, 'Thruster');
  controls.appendChild(wrap);
  const sl = document.createElement('label');
  sl.innerHTML = 'Force <input type="range" min="-24" max="24" step="0.5" value="10" aria-label="Force in newtons"> <output></output>';
  controls.appendChild(sl);
  const input = sl.querySelector('input'), out = sl.querySelector('output');
  input.addEventListener('input', () => { st.f = +input.value; draw(); });
  const lay = data.can.layout;
  const idExplain = (b) => {
    const c = data.can[b];
    return `${hex(c.id)} = client ${c.client} ≪ ${lay.client[0]} | type 1 ≪ ${lay.type[0]} | direction 1 ≪ ${lay.direction[0]} | channel 0`;
  };
  function draw() {
    out.textContent = `${st.f.toFixed(1)} N`;
    const rpm = Math.max(-32768, Math.min(32767, Math.round(forceToRpm(st.f))));
    const u16 = rpm & 0xffff;
    readout.innerHTML = `<span><b>${names[st.i]}</b> (thruster ${st.i})</span><span>${st.f.toFixed(1)} N</span><span>→ <b>${rpm.toLocaleString('en-US')}</b> rpm</span><span>→ int16 <b>${hex(u16, 4)}</b></span>`;
    const cmds = names.map((_, k) => (k === st.i ? u16 : 0));
    frames.innerHTML = ['esc0', 'esc1'].map((b, bi) => {
      const bytes = [];
      for (let k = 0; k < 4; k++) {
        const v = cmds[bi * 4 + k], on = bi * 4 + k === st.i;
        bytes.push(`<div class="pair${on ? ' on' : ''}"><span>${hex(v >> 8).slice(2)}</span><span>${hex(v & 0xff).slice(2)}</span><small>${names[bi * 4 + k]}</small></div>`);
      }
      return `<div class="frame"><div class="fhead"><b>${hex(data.can[b].id)}</b> to ESC board ${bi}<small>${idExplain(b)}</small></div><div class="bytes">${bytes.join('')}</div></div>`;
    }).join('');
  }
  draw();
}

// ---------------------------------------------------------------- the kill simulator
{
  const K = makeConstants(data);
  const sim = new KillSim(K);
  const host = document.getElementById('killsim');
  host.innerHTML = `
    <div class="ks-head">
      <div class="controls"><span class="ks-label">Story</span><span id="ks-stories"></span></div>
      <p class="ks-say" id="ks-say" aria-live="polite"></p>
    </div>
    <div class="ks-grid">
      <div class="ks-controls">
        <div class="ks-group"><h4>Kill switch</h4><div id="ks-switch"></div></div>
        <div class="ks-group"><h4>Nereus viewer <small>slot ${K.viewerSlot}</small></h4>
          <div class="ks-row" id="ks-viewer"></div>
          <div class="ks-row"><button type="button" class="btn ks-enable" id="ks-enable">Enable</button><button type="button" class="btn" id="ks-command">Command: hold here</button></div>
        </div>
        <div class="ks-group"><h4>A laptop <small>sender laptop-cli</small></h4>
          <div class="ks-row" id="ks-slot"></div>
          <div class="ks-row"><label class="ks-check"><input type="checkbox" id="ks-nu" checked> needs_update</label><label class="ks-check"><input type="checkbox" id="ks-repeat"> repeat at 20 Hz</label></div>
          <div class="ks-row"><button type="button" class="btn" id="ks-lkill">Kill</button><button type="button" class="btn" id="ks-lclear">Clear</button><button type="button" class="btn" id="ks-lstop">Stop</button></div>
        </div>
        <div class="ks-group"><h4>On the Orin</h4>
          <div class="ks-row"><span class="ks-mini">micro-ROS agent</span><span id="ks-link"></span></div>
          <div class="ks-row"><span class="ks-mini">control_system</span><span id="ks-control"></span></div>
        </div>
      </div>
      <div class="ks-status">
        <div class="ks-verdict" id="ks-verdict"></div>
        <div class="ks-chain" id="ks-chain"></div>
      </div>
      <div class="ks-detail">
        <div class="table-scroll"><table class="params ks-slots"><thead><tr><th>Slot</th><th>Enabled</th><th>Asserting</th><th>Needs update</th><th>Lock</th></tr></thead><tbody id="ks-slots"></tbody></table></div>
        <div class="ks-strips" id="ks-strips"></div>
        <h4 class="ks-loghead">Events</h4>
        <ol class="ks-log" id="ks-log"></ol>
      </div>
    </div>`;
  const $ = (id) => host.querySelector('#' + id);
  const say = (html) => { $('ks-say').innerHTML = html; };

  const ui = {};
  ui.sw = segmented($('ks-switch'), [['in', 'In'], ['out', 'Out (killed)']], 'in', (v) => { sim.script = []; sim.setSwitch(v === 'in'); }, 'Kill switch');
  ui.viewer = segmented($('ks-viewer'), [['open', 'Open'], ['closed', 'Closed']], 'open', (v) => { sim.script = []; if (v === 'open') { if (!sim.viewer.open) sim.openViewer(); } else sim.closeViewer(); }, 'Viewer');
  ui.slot = segmented($('ks-slot'), [['1', 'Slot 1'], ['2', 'Slot 2'], ['3', 'Slot 3']], '3', () => {}, 'Slot');
  ui.link = segmented($('ks-link'), [['up', 'Up'], ['down', 'Down']], 'up', (v) => { sim.script = []; sim.setLink(v === 'up'); }, 'micro-ROS agent');
  ui.control = segmented($('ks-control'), [['run', 'Running'], ['stop', 'Stopped']], 'run', (v) => { sim.script = []; sim.setControl(v === 'run'); }, 'control_system');
  const laptopSlot = () => +host.querySelector('#ks-slot [aria-pressed="true"]').dataset.v;
  $('ks-enable').onclick = () => { sim.script = []; if (sim.viewer.enabled) sim.viewerKill(false); else sim.viewerEnable(); };
  $('ks-command').onclick = () => {
    sim.script = [];
    if (!sim.inputs.control) sim.note('Viewer: "Control mode service unavailable" (control_system is down)', 'bad');
    else sim.viewerCommand();
  };
  $('ks-lkill').onclick = () => { sim.script = []; sim.laptopSend(laptopSlot(), true, $('ks-nu').checked, $('ks-repeat').checked); };
  $('ks-lclear').onclick = () => { sim.script = []; sim.laptopSend(laptopSlot(), false, $('ks-nu').checked, $('ks-repeat').checked); };
  $('ks-lstop').onclick = () => { sim.laptopStop(); };

  const syncInputs = () => {
    ui.sw.set(sim.inputs.switchIn ? 'in' : 'out');
    ui.viewer.set(sim.viewer.open ? 'open' : 'closed');
    ui.link.set(sim.inputs.link ? 'up' : 'down');
    ui.control.set(sim.inputs.control ? 'run' : 'stop');
    ui.slot.set(String(sim.laptop.slot));
    $('ks-nu').checked = sim.laptop.needsUpdate;
    $('ks-repeat').checked = !!sim.laptop.repeat;
  };

  // Stories: scripted actions with narration, on the simulator's clock.
  const s = (after, run, text) => ({ after, run: () => { run(); if (text) say(text); syncInputs(); } });
  const STORIES = {
    pool: { name: 'Pool run', start: () => sim.reset(), steps: [
      s(0, () => {}, 'Switch in, viewer open. The viewer\'s heartbeat asserts kill on slot 1, so the POAC board keeps ESC power off.'),
      s(2.5, () => sim.viewerEnable(), 'Enable: slot 1 clears and the POAC board turns ESC power on. The ESC boards hold <code>ESC_POWERON_DELAY</code> for 5 s, and the overseer keeps <code>motion_enabled</code> false until then.'),
      s(7, () => sim.viewerCommand(), 'Command: a <code>POSITION</code> pair. The MPC holds position and the thrusters run.'),
      s(3.5, () => sim.closeViewer(), 'Unplug and close the viewer. Its enable latched (<code>needs_update</code> false), so slot 1 stays clear and the run continues.'),
      s(3.5, () => sim.setSwitch(false), 'Pull the switch: ESC power is cut at once, <code>state/kill</code> goes true, and the MPC sends zeros.'),
      s(3.5, () => sim.setSwitch(true), 'Re-insert it: 5 s of power-on delay, then the MPC flies to its last reference again. The reference survived the kill. Had a path been running, that reference would be the path\'s last point.'),
    ] },
    nobody: { name: 'Nobody on a slot', start: () => sim.reset({ viewerOpen: false }), steps: [
      s(0, () => {}, 'Viewer closed, nobody on any software slot, switch in. Slot 0 is the only enabled slot and it is clear, so the POAC board enables. Software slots can only add kills.'),
      s(6, () => {}, 'After the power-on delay everything is ready. Only the MPC\'s <code>DISABLED</code> reference keeps the propellers still.'),
    ] },
    bench: { name: 'Bench hold', start: () => sim.reset({ viewerOpen: false, control: false }), steps: [
      s(0, () => sim.laptopSend(3, true, true, true), 'The pre-test tool holds a kill on slot 3: asserting, <code>needs_update</code>, 20 Hz. If the tool dies, the slot times out and the robot stays killed.'),
      s(2, () => sim.setControl(true), 'Only now does it start <code>control_system</code>. The ESC boards report <code>SAFETY_KILLED</code>, so nothing can spin.'),
      s(3, () => sim.laptopSend(1, true, true, true), 'Releasing. No viewer is up, so first it leaves a kill on slot 1 with <code>needs_update</code>…'),
      s(0.5, () => { sim.laptopStop(); sim.laptopSend(3, false, false, false); }, '…then clears slot 3, latched. Slot 1 times out into a kill, and the robot waits for someone to Enable in the viewer.'),
      s(2.5, () => sim.openViewer(), 'Open the viewer. Its first heartbeat asserts kill on slot 1, which takes the lock from the laptop.'),
      s(1.5, () => sim.viewerEnable(), 'So Enable can clear it.'),
    ] },
    two: { name: 'Two operators', start: () => { sim.reset(); sim.advance(0.3); sim.viewerEnable(); sim.advance(6); sim.hist = []; }, steps: [
      s(0, () => {}, 'The viewer is enabled and the ESCs are ready.'),
      s(2.5, () => sim.laptopSend(1, false, false, false), 'A laptop publishes "not killed" on slot 1. The firmware accepts it, because slot 1 isn\'t asserting. But the viewer sees another sender on its slot and drops its enable: slot 1 asserts kill and the viewer takes the lock.'),
      s(3, () => sim.laptopSend(1, false, false, false), 'The laptop tries to clear slot 1 again. The POAC board rejects it: the lock belongs to the viewer.'),
      s(3, () => sim.viewerEnable(), 'Once the other sender has been quiet for 1 s, the viewer can enable again.'),
    ] },
    agent: { name: 'Agent crash', start: () => { sim.reset(); sim.advance(0.3); sim.viewerEnable(); sim.advance(6); sim.viewerCommand(); sim.advance(1); sim.hist = []; }, steps: [
      s(0, () => {}, 'Talos is holding position.'),
      s(2, () => sim.setLink(false), `The micro-ROS agent on the Orin dies, and no ROS message reaches the boards. The ESC boards stop hearing <code>state/kill</code> and kill once ${K.switchTimeout * 1000} ms pass without it. After about ${K.sessionLoss.toFixed(1)} s of failed heartbeats every board drops its session, and the POAC board kills, because its safety code only runs while connected. The MPC never hears a kill (<code>state/kill</code> came through the agent too), but after ${K.overseerTimeout} s without telemetry the overseer drops <code>motion_enabled</code>, so the MPC sends zeros and would abort a path.`),
      s(4, () => sim.setLink(true), 'The agent restarts. The POAC board reconnects with its slots as they were (slot 1 still clear) and re-enables. The ESC boards report <code>ESC_POWERON_DELAY</code> for 5 s, then <code>motion_enabled</code> returns and the MPC drives to its last reference again.'),
    ] },
  };
  const storyBar = segmented($('ks-stories'), Object.entries(STORIES).map(([k, v]) => [k, v.name]), 'pool', (k) => runStory(k), 'Story');
  function runStory(k) {
    const st = STORIES[k];
    st.start();
    // Past the overseer's start-up flicker (its first flagged telemetry messages still read true, under its
    // tolerance), to the steady, killed state, and drop that from the strips.
    if (k === 'pool') { sim.advance(2); sim.hist = []; }
    sim.log = [];
    sim.play(st.steps);
    storyBar.set(k);
    syncInputs();
  }

  // ---- rendering ----
  const slotNames = ['0 · physical', '1 · viewer', '2 · topside', '3 · debug'];
  const yes = (b) => (b ? '<span class="y">yes</span>' : 'no');
  const LANES = [
    ['sw', 'Switch in'], ['poac', 'POAC enabled'], ['kill', 'state/kill false'], ['esc', 'ESC boards ready'],
    ['motion', 'motion_enabled'], ['thrust', 'Thrusters running'],
  ];
  function chip(label, ok, value) {
    return `<div class="chip ${ok ? 'ok' : 'no'}"><small>${label}</small><b>${value}</b></div>`;
  }
  function render() {
    const p = sim.poac, e = sim.esc, o = sim.overseer, m = sim.mpc, t = sim.t;
    const v = sim.verdict();
    $('ks-verdict').className = 'ks-verdict ' + (v.ok ? 'go' : v.idle ? 'idle' : 'stop');
    $('ks-verdict').innerHTML = `<span class="t">t = ${t.toFixed(1)} s</span>${v.text}`;
    const flagNames = K.flags.filter((f) => e.flags & (1 << f.bit)).map((f) => f.name);
    $('ks-chain').innerHTML = [
      chip('POAC board', !p.asserting, p.asserting ? 'killed' : 'enabled'),
      chip('state/kill', sim.inputs.link && p.stateKill === false, sim.inputs.link ? String(p.stateKill) : 'silent'),
      chip('ESC flags', e.flags === 0, flagNames.length ? flagNames.map((f, i) => `<span class="nw">${f}${i < flagNames.length - 1 ? ',' : ''}</span>`).join(' ') : 'none'),
      chip('motion_enabled', sim.inputs.control && o.motionEnabled, sim.inputs.control ? String(o.motionEnabled) : 'not running'),
      chip('MPC', e.thrustersOn, !sim.inputs.control ? 'not running' : m.killed ? 'killed: zeros' : m.mode === 'DISABLED' ? 'DISABLED: zeros' : m.commanding ? 'thrusting' : 'zeros'),
    ].join('');
    $('ks-slots').innerHTML = p.slots.map((s, i) => {
      const timed = s.enabled && s.needsUpdate && t >= s.timeoutAt;
      const lock = i === 0 ? 'GPIO' : s.lock || '–';
      const assertCell = s.asserting ? '<span class="n">kill</span>' : timed ? '<span class="n">timed out</span>' : s.enabled ? '<span class="y">clear</span>' : '–';
      return `<tr class="${!s.enabled ? 'off' : s.asserting || timed ? 'bad' : ''}"><td>${slotNames[i]}</td><td>${yes(s.enabled)}</td><td>${assertCell}</td><td>${s.enabled ? (s.needsUpdate ? 'yes' : 'no, latched') : '–'}</td><td class="lock">${esc(lock)}</td></tr>`;
    }).join('');
    $('ks-enable').textContent = sim.viewer.enabled ? 'KILL' : 'Enable';
    $('ks-enable').classList.toggle('kill', sim.viewer.enabled);
    $('ks-enable').disabled = !sim.viewer.open;
    $('ks-command').disabled = !sim.viewer.open || !sim.viewer.enabled;
    $('ks-log').innerHTML = sim.log.length
      ? sim.log.map((l) => `<li class="${l.kind}"><span>${l.t.toFixed(2)} s</span> ${esc(l.msg)}</li>`).join('')
      : '<li class="empty">Nothing has changed yet. Events appear here, newest first.</li>';
    drawStrips();
  }
  function drawStrips() {
    const host2 = $('ks-strips');
    const W = Math.max(260, host2.clientWidth), lh = 20, labelW = W < 420 ? 0 : 118, H = LANES.length * lh + 18;
    const x0 = labelW, x1 = W - 4, t1 = sim.t, t0 = t1 - HISTORY_SECONDS;
    const X = (t) => x0 + ((t - t0) / HISTORY_SECONDS) * (x1 - x0);
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Last 20 seconds of each layer">`;
    LANES.forEach(([key, name], li) => {
      const y = li * lh + 3;
      svg += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${lh - 7}" class="lane"/>`;
      let start = null;
      const h = sim.hist;
      for (let i = 0; i <= h.length; i++) {
        const on = i < h.length && h[i][key];
        if (on && start === null) start = h[i].t;
        if (!on && start !== null) {
          const end = i < h.length ? h[i].t : t1;
          svg += `<rect x="${X(start).toFixed(1)}" y="${y}" width="${Math.max(1, X(end) - X(start)).toFixed(1)}" height="${lh - 7}" class="on ${key}"/>`;
          start = null;
        }
      }
      svg += labelW ? `<text x="${labelW - 8}" y="${y + (lh - 7) / 2}" class="lname">${name}</text>` : `<text x="${x0 + 4}" y="${y + (lh - 7) / 2}" class="lname in">${name}</text>`;
    });
    svg += `<text x="${x1}" y="${H - 2}" class="tick" text-anchor="end">now</text><text x="${x0}" y="${H - 2}" class="tick">−${HISTORY_SECONDS} s</text></svg>`;
    host2.innerHTML = svg;
  }

  // ---- clock: real time while on screen ----
  let visible = false, last = null, acc = 0, lastRender = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; last = null; }).observe(host);
  const loop = (now) => {
    if (visible) {
      if (last !== null) {
        acc += Math.min(0.1, (now - last) / 1000);
        while (acc >= 0.01) { sim.step(); acc -= 0.01; }
      }
      last = now;
      if (now - lastRender > 66) { render(); lastRender = now; }
    }
    requestAnimationFrame(loop);
  };
  runStory('pool');
  render();
  requestAnimationFrame(loop);
}
}
