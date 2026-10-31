import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/commanding.css';
import { FlowSteps } from '../viz/commanding-steps.js';
import { KillSim, makeConstants, HISTORY_SECONDS } from '../viz/commanding-killsim.js';

setup();

const BASE = import.meta.env.BASE_URL;
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

// ---------------------------------------------------------------- the step-through flow
{
  const L = data.mpc.links, F = data.firmware.links, V = data.viewer.links, O = data.overseer.links;
  const id0 = hex(data.can.esc0.id), id1 = hex(data.can.esc1.id);
  const ms = (o) => `${o.value} ms`;
  const tick = data.mpc.control_period_s * 1000, beat = data.viewer.heartbeat_s * 1000, slot = data.viewer.slot;
  const NODES = {
    bt: { label: 'Autonomy', sub: 'behaviour tree', where: 'Orin',
      info: 'The mission tree (riptide_autonomy2). Sends goals, waits on settle trust, and waits for <code>state/kill</code> to read false before a run.',
      link: 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/include/riptide_autonomy/bt_actions/FollowPath.btaction.hpp' },
    viewer: { label: 'Nereus viewer', sub: 'motion panel', where: 'Laptop',
      info: `The operator UI. Commands poses, and owns software kill slot ${slot}: it asserts kill every ${beat} ms until you press Enable.`, link: V.report },
    sw: { label: 'Kill switch', sub: 'red handle, port bow window', where: 'Hull',
      info: 'A Hall-effect sensor behind the window senses the magnet in the handle. Pulled off = killed: the switch line cuts <code>MOTOR_PWR</code>, the ESC boards\' power, in hardware, and the POAC board reads it on a GPIO interrupt as slot 0. The circuit: <a href="boards.html#kill">The circuit boards</a>.', link: F.physical },
    mpc: { label: 'mpc_controller', sub: `riptide_mpc, every ${tick} ms`, where: 'Orin',
      info: `Holds the reference and ticks every ${tick} ms. It sends zero thrust while killed, while motion is disabled, or with odometry older than ${data.mpc.odom_timeout_s} s.`, link: L.tick },
    ov: { label: 'controller_overseer', sub: 'riptide_controllers2', where: 'Orin',
      info: 'Left over from the old controller and still launched with the MPC. It turns ESC telemetry into <code>controller/motion_enabled</code> and publishes the feedforward wrench.', link: O.telemetry_cb },
    agent: { label: 'micro-ROS agent', sub: 'bridges ROS to can0', where: 'Orin',
      info: `Bridges ROS 2 to the boards' micro-ROS clients over the internal CAN bus (<a class="gl" href="glossary.html#term-can-fd">CAN FD</a>, ${data.can.rate / 1e6} Mbit/s, ${data.can.fd_rate / 1e6} Mbit/s data). Every ROS message to or from a board crosses it.`,
      link: 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/launch/copro_agent.launch.py' },
    esc: { label: 'ESC boards 0 and 1', sub: 'four APD ESCs each', where: 'Board',
      info: `Each board keeps its four RPM targets for ${data.firmware.esc_rpm_timeout_ms.value} ms. Its RP2040 runs a PI speed loop per thruster and drives its four on-board APD 80F3 ESCs over DShot${data.firmware.dshot_rate_khz.value}, with RPM fed back. The ESCs drive the motor phases out to the thrusters. Power comes in on <code>MOTOR_PWR</code>, through the kill (<a href="boards.html#kill">circuit</a>).`, link: F.esc_flags },
    poac: { label: 'POAC board', sub: 'decides the kill', where: 'Board',
      info: 'Power and actuator board. It combines the physical switch and the software slots into one kill, drives the soft-kill pin and publishes <code>state/kill</code>.', link: F.refresh },
    thr: { label: '8 thrusters', sub: 'Blue Robotics T200', where: 'Frame',
      info: 'Mounted on the frame outside the hulls. Each is a brushless motor driven by one ESC on an ESC board, through the thruster SubConn.', link: 'thrusters-hw.html' },
  };
  // Every link, for the "Every box" view.
  const EDGES = [
    ['bt', 'mpc', '<code>follow_path</code> (FollowPath action) and <code>controller/linear</code>, <code>/angular</code> (ControllerCommand)'],
    ['mpc', 'bt', `<code>controller/scale/trust</code> (Twist), action feedback (both every ${tick} ms) and the result`],
    ['viewer', 'mpc', '<code>controller/linear</code> + <code>/angular</code> (ControllerCommand), on Command and while dragging'],
    ['viewer', 'agent', `<code>command/software_kill</code> (KillSwitchReport), slot ${slot}, every ${beat} ms`],
    ['agent', 'poac', 'the slot reports, over CAN'],
    ['poac', 'agent', `<code>state/kill</code> (Bool), every ${ms(data.firmware.poac_kill_publish_ms)} and at once on a change; <code>state/firmware</code> with the kill bitmasks`],
    ['sw', 'poac', 'the switch line: cuts ESC power, and a GPIO interrupt on the POAC board'],
    ['poac', 'esc', '<code>MOTOR_PWR</code>, the ESCs\' power; the soft-kill pin can cut it even with the switch in'],
    ['agent', 'mpc', '<code>state/kill</code>: true makes the MPC send zeros and abort any path'],
    ['agent', 'esc', `<code>state/kill</code>, used by the ESC boards as their own heartbeat (${ms(data.firmware.switch_timeout_ms)} timeout)`],
    ['mpc', 'esc', `two raw CAN frames every ${tick} ms, ${id0} and ${id1}, four RPMs each, skipping ROS`],
    ['esc', 'thr', 'motor phases: each on-board ESC drives one T200'],
    ['esc', 'ov', `<code>state/thrusters/telemetry</code>, every ${ms(data.firmware.esc_telemetry_ms)} per board, through the agent`],
    ['ov', 'mpc', '<code>controller/motion_enabled</code> (Bool), and <code>controller/FF_body_force</code> at 1 Hz'],
  ];
  const hop = (k, s, o = {}) => ({ k, s, ...o });
  const off = (h) => ({ ...h, cold: true });
  const G = {
    goal: hop('<code>follow_path</code>', 'or a ControllerCommand per half'),
    can: hop(`raw CAN ${id0}, ${id1}`, `every ${tick} ms, skips ROS`),
    dshot: hop('motor phases', 'ESC drives the T200'),
    trust: hop('trust, feedback, result', `<code>controller/scale/trust</code>, every ${tick} ms`, { back: true }),
  };
  const goalChain = ['bt', 'mpc', 'esc', 'thr'];
  const pathMove = '<code>state/kill</code>';
  const STORIES = [
    { id: 'goal', name: 'A goal', steps: [
      { nodes: goalChain, hops: [G.goal, off(G.can), off(G.dshot)],
        text: `The tree's <code>FollowPath</code> node sends a goal on <code>follow_path</code>. The MPC checks it, plans the whole path and starts the reference moving.` },
      { nodes: goalChain, hops: [off(G.goal), G.can, off(G.dshot)],
        text: `Every ${tick} ms the MPC estimates, solves, publishes <code>thruster_forces</code>, converts them to RPM and writes frames ${id0} and ${id1} on <code>can0</code>.` },
      { nodes: goalChain, hops: [off(G.goal), off(G.can), G.dshot],
        text: `Each ESC board keeps its four targets for ${data.firmware.esc_rpm_timeout_ms.value} ms. A speed loop per thruster drives one of the board's own APD ESCs over <a class="gl" href="glossary.html#term-dshot">DShot600</a> (RPM comes back the same way), and the ESC drives the T200 out on the frame.` },
      { nodes: goalChain, hops: [G.trust, off(G.can), off(G.dshot)],
        text: `Back up: action feedback every tick (metres along the path) and settle trust. The goal succeeds once trust reaches ${data.mpc.success_trust} at the end.` },
    ] },
    { id: 'enable', name: 'Enable', steps: [
      { nodes: ['viewer', 'agent', 'poac'], hops: [hop('<code>software_kill</code>', `slot ${slot}: "not killed", every ${beat} ms`), hop('CAN bus', 'to the board\'s micro-ROS client')],
        text: `You press Enable. The viewer's slot-${slot} report changes to "not killed", and the micro-ROS agent carries it over CAN to the POAC board.` },
      { nodes: ['sw', 'poac', 'esc'], hops: [hop('switch line', 'closed: the switch is in'), hop('<code>MOTOR_PWR</code> on', 'power to the boards\' ESCs')],
        text: 'No slot asserting and the switch in, so the POAC board releases its soft-kill pin and the ESC boards\' ESCs get power.' },
      { nodes: ['poac', 'agent', ['esc', 'mpc']], hops: [hop(`${pathMove} false`, `at once, then every ${ms(data.firmware.poac_kill_publish_ms)}`), hop(pathMove, 'to every subscriber')],
        text: '<code>state/kill</code> goes false at once. The ESC boards and the MPC clear their own kill.' },
      { nodes: ['esc', 'ov', 'mpc'], hops: [hop('telemetry', `every ${ms(data.firmware.esc_telemetry_ms)}, flags set`), hop('<code>motion_enabled</code>', 'true once the flags clear')],
        text: `For ${data.firmware.esc_poweron_delay_ms.value / 1000} s the ESC boards flag <code>ESC_POWERON_DELAY</code> while the ESCs start, so the overseer keeps <code>motion_enabled</code> false. Then the flags clear and the MPC may drive.` },
    ] },
    { id: 'kill', name: 'Switch out', steps: [
      { nodes: ['sw', 'poac', 'esc'], hops: [hop('switch line', 'open: the switch is out'), hop('<code>MOTOR_PWR</code> off', 'in hardware, at once')],
        text: 'You pull the red handle. The switch line opens and the ESCs\' power drops in hardware. The POAC board\'s GPIO interrupt marks slot 0 as asserting.' },
      { nodes: ['poac', 'agent', ['esc', 'mpc']], hops: [hop(`${pathMove} true`, 'at once, on the change'), hop(pathMove, 'to every subscriber')],
        text: 'The ESC boards zero their throttles. The MPC sends zeros and aborts any running path.' },
      { nodes: ['mpc', 'esc'], hops: [hop('raw CAN: zeros', `every ${tick} ms`)],
        text: 'The MPC keeps writing frames of zeros, so the ESC targets never go stale. It keeps its reference for when the switch goes back in (<a href="#survives">what it flies then</a>).' },
      { nodes: ['poac', 'agent', ['viewer', 'bt']], hops: [hop(`${pathMove}, <code>state/firmware</code>`, `every ${ms(data.firmware.poac_kill_publish_ms)}`), hop('through ROS', 'to the operator and the tree')],
        text: 'The viewer shows the robot as killed, and <code>state/firmware</code> says which slot holds the kill. A tree waiting in <code>WaitForKillSwitch</code> stays there.' },
    ] },
  ];
  new FlowSteps(document.getElementById('flow-body'), { nodes: NODES, edges: EDGES, stories: STORIES, segmented });
}

// ---------------------------------------------------------------- message definitions
{
  const tabs = document.getElementById('msg-tabs');
  const pre = document.getElementById('msg-text');
  const src = document.getElementById('msg-src');
  const names = ['ControllerCommand', 'FollowPath', 'PathSegment', 'KillSwitchReport', 'DshotCommand'];
  // One block per line, so a long comment wraps under its own line (see commanding.css). On a phone, a run of
  // comment-only lines is joined into one paragraph, so it wraps as prose instead of ragged '#' fragments.
  const narrow = matchMedia('(max-width: 640px)');
  const isRule = (l) => /^#\s*=+\s*$/.test(l);
  const joinComments = (lines) => lines.reduce((out, l) => {
    const prev = out[out.length - 1];
    const cmt = /^\s*#/.test(l) && !isRule(l);
    if (cmt && prev !== undefined && /^\s*#/.test(prev) && !isRule(prev)) out[out.length - 1] = prev.replace(/\s+$/, '') + ' ' + l.replace(/^\s*#\s*/, '');
    else out.push(l);
    return out;
  }, []);
  const highlight = (text) => (narrow.matches ? joinComments(text.split('\n')) : text.split('\n')).map((line) => {
    const i = line.indexOf('#');
    const code = i >= 0 ? line.slice(0, i) : line, comment = i >= 0 ? line.slice(i) : '';
    let html = esc(code);
    if (/^---/.test(code)) html = `<span class="sep">${html}</span>`;
    else html = html.replace(/^(\s*)([\w/\[\]]+)(\s+)([A-Za-z_]\w*)/, '$1<span class="k">$2</span>$3<span class="f">$4</span>');
    const cls = code.trim() && comment ? 'ln both' : isRule(line) ? 'ln rule' : 'ln';
    return `<span class="${cls}">${html}${comment ? `<span class="c">${esc(comment)}</span>` : ''}${line ? '' : ' '}</span>`;
  }).join('');
  let current = names[0];
  const show = (name) => {
    current = name;
    const m = data.msgs[name];
    pre.innerHTML = `<code>${highlight(m.text.replace(/\n+$/, ''))}</code>`;
    pre.scrollTop = 0;
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
  narrow.addEventListener('change', () => show(current));
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
  const wrap = document.createElement('div');
  wrap.className = 'can-pick';
  // Two rows of four, one per ESC board, so the picker lines up with the two frames below.
  wrap.innerHTML = `<span class="can-lab">Thruster</span><span class="can-rows" aria-hidden="true"><span>${hex(data.can.esc0.id)}</span><span>${hex(data.can.esc1.id)}</span></span>`;
  segmented(wrap, names.map((n, i) => [String(i), n]), '0', (v) => { st.i = +v; draw(); }, 'Thruster');
  controls.appendChild(wrap);
  const sl = document.createElement('label');
  sl.innerHTML = '<span class="can-lab">Force</span> <input type="range" min="-24" max="24" step="0.5" value="10" aria-label="Force in newtons"> <output></output>';
  controls.appendChild(sl);
  const input = sl.querySelector('input'), out = sl.querySelector('output');
  input.addEventListener('input', () => { st.f = +input.value; draw(); });
  const lay = data.can.layout;
  const bits = (b) => {
    const c = data.can[b];
    return `<span class="nw">${hex(c.id)} = ${c.client}≪${lay.client[0]} | 1≪${lay.type[0]} | 1≪${lay.direction[0]} | 0</span>`;
  };
  document.getElementById('can-id').innerHTML = `
    <p>An 11-bit CAN id in titan_canmore's layout (<a href="${data.can.client_ids_url}">client_ids.h</a>), high bits first:</p>
    <ul>
      <li><b>client id</b>, 5 bits: which board. ESC board 0 is ${data.can.esc0.client}, board 1 is ${data.can.esc1.client}.</li>
      <li><b>type</b> = 1: a utility frame, not a micro-ROS message.</li>
      <li><b>direction</b> = 1: from the Orin to the board.</li>
      <li><b>channel</b> = 0: the thruster-command channel.</li>
    </ul>
    <p>Client, type, direction, channel, shifted into place:</p><p class="can-bits">${bits('esc0')}<br>${bits('esc1')}</p>`;
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
      return `<div class="frame"><div class="fhead"><b>${hex(data.can[b].id)}</b> to ESC board ${bi}, thrusters ${bi * 4} to ${bi * 4 + 3}</div><div class="bytes">${bytes.join('')}</div></div>`;
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
    <div class="controls ks-storybar"><span id="ks-stories"></span></div>
    <div class="ks-nav">
      <button type="button" class="btn" id="ks-back">‹ Back</button>
      <span class="ks-count" id="ks-count" aria-live="polite"></span>
      <button type="button" class="btn primary" id="ks-next">Next ›</button>
      <button type="button" class="btn ks-replay" id="ks-replay" aria-label="Replay this story" title="Replay this story">↺</button>
    </div>
    <p class="ks-say" id="ks-say" aria-live="polite"></p>
    <div class="ks-grid">
      <div class="ks-main">
        <div class="ks-verdict" id="ks-verdict"></div>
        <div class="ks-strips" id="ks-strips"></div>
        <div class="ks-chain" id="ks-chain"></div>
      </div>
      <details class="ks-more ks-side" id="ks-ctl">
        <summary>Work the controls yourself</summary>
        <div class="ks-echo" id="ks-echo" aria-hidden="true"></div>
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
      </details>
      <details class="ks-more ks-det" id="ks-det">
        <summary>The four slots and the event log</summary>
        <table class="params ks-slots"><thead><tr><th>Slot</th><th>Enabled</th><th>Asserting</th><th>Kind</th><th class="lock">Lock</th></tr></thead><tbody id="ks-slots"></tbody></table>
        <h4 class="ks-loghead">Events, newest first</h4>
        <ol class="ks-log" id="ks-log"></ol>
      </details>
    </div>`;
  const $ = (id) => host.querySelector('#' + id);
  if (matchMedia('(min-width: 1100px)').matches) { $('ks-ctl').open = true; $('ks-det').open = true; }

  // ---- stories: one action per step; Next jumps the clock to the step's time ----
  // A held step shows one moment: the clock stops there, so the panel matches the narration until Next.
  const s = (after, run, text, hold = false) => ({ after, run, text, hold });
  const h = (after, run, text) => s(after, run, text, true);
  const STORIES = {
    pool: { name: 'Pool run', start: () => { sim.reset(); sim.advance(2); }, steps: [
      s(0, () => {}, 'Switch in, viewer open. The viewer\'s heartbeat asserts kill on slot 1, so the POAC board keeps ESC power off.'),
      s(2.5, () => sim.viewerEnable(), 'Enable: slot 1 clears and the POAC board turns ESC power on. The ESC boards hold <code>ESC_POWERON_DELAY</code> for 5 s, and the overseer keeps <code>motion_enabled</code> false until then.'),
      s(7, () => sim.viewerCommand(), 'Command: a <code>POSITION</code> pair. The MPC holds position and the thrusters run.'),
      s(3.5, () => sim.closeViewer(), 'Unplug and close the viewer. Its enable latched (<code>needs_update</code> false), so slot 1 stays clear and the run continues.'),
      s(3.5, () => sim.setSwitch(false), 'Pull the switch: ESC power is cut at once, <code>state/kill</code> goes true, and the MPC sends zeros.'),
      s(3.5, () => sim.setSwitch(true), 'Put it back in: 5 s of power-on delay, then the MPC flies to its last reference again (<a href="#survives">it survived the kill</a>).'),
    ] },
    nobody: { name: 'Nobody on a slot', start: () => sim.reset({ viewerOpen: false }), steps: [
      s(0, () => {}, 'Viewer closed, nobody on any software slot, switch in. Slot 0 is the only enabled slot and it is clear, so the POAC board enables. Software slots can only add kills.'),
      s(1.6, () => {}, 'The ESC boards hold <code>ESC_POWERON_DELAY</code> for 5 s. <code>motion_enabled</code> blinked true for the first second: the overseer only says false after three flagged telemetry messages in a row, and it had just started.'),
      s(4.5, () => {}, 'After the power-on delay everything is ready. Nothing has sent a command, so only the MPC\'s <code>DISABLED</code> reference keeps the propellers still.'),
    ] },
    bench: { name: 'Bench hold', start: () => sim.reset({ viewerOpen: false, control: false }), steps: [
      s(0, () => sim.laptopSend(3, true, true, true), 'The pre-test tool holds a kill on slot 3: asserting, <code>needs_update</code>, 20 Hz. If the tool dies, the slot times out and the robot stays killed.'),
      s(2, () => sim.setControl(true), 'Only now does it start <code>control_system</code>. The ESC boards report <code>SAFETY_KILLED</code>, so nothing can spin. (A fresh overseer says <code>motion_enabled</code> true until it has seen three flagged telemetry messages in a row, about 1 s.)'),
      s(3, () => sim.laptopSend(1, true, true, true), 'To hand over, it first leaves a kill on slot 1 with <code>needs_update</code>, because no viewer is up yet.'),
      s(0.5, () => { sim.laptopStop(); sim.laptopSend(3, false, false, false); }, 'Then it stops publishing and clears slot 3, latched. Slot 1 times out into a kill, so the robot stays killed until someone presses Enable in the viewer.'),
      s(2.5, () => sim.openViewer(), 'Open the viewer. Its first heartbeat asserts kill on slot 1, which takes the lock from the laptop.'),
      s(1.5, () => sim.viewerEnable(), 'The viewer now holds slot 1\'s lock, so its Enable can clear the kill. ESC power comes on.'),
    ] },
    two: { name: 'Two operators', start: () => { sim.reset(); sim.advance(0.3); sim.viewerEnable(); sim.advance(6); }, steps: [
      s(0, () => {}, 'The viewer is enabled and the ESCs are ready.'),
      s(2.5, () => sim.laptopSend(1, false, false, false), 'A laptop publishes "not killed" on slot 1. The firmware accepts it, because slot 1 isn\'t asserting. But the viewer sees another sender on its slot and drops its enable: slot 1 asserts kill and the viewer takes the lock.'),
      s(3, () => sim.laptopSend(1, false, false, false), 'The laptop tries to clear slot 1 again. The POAC board rejects it: the lock belongs to the viewer.'),
      s(3, () => sim.viewerEnable(), 'Once the other sender has been quiet for 1 s, the viewer can enable again.'),
    ] },
    agent: { name: 'Agent crash', start: () => { sim.reset(); sim.advance(0.3); sim.viewerEnable(); sim.advance(6); sim.viewerCommand(); sim.advance(1); }, steps: [
      s(0, () => {}, 'Talos is holding position.'),
      h(2, () => sim.setLink(false), 'The micro-ROS agent on the Orin dies. No ROS message reaches the boards any more, but nothing has timed out yet, so the thrusters still run on the MPC\'s raw CAN frames.'),
      h(0.55, () => {}, `The ESC boards have not heard <code>state/kill</code> for ${K.switchTimeout * 1000} ms, so they kill and zero their throttles. The thrusters stop here.`),
      h(0.3, () => {}, `About ${K.sessionLoss.toFixed(1)} s after the agent died, more than 7 failed heartbeats make every board drop its micro-ROS session. The POAC board kills and cuts ESC power.`),
      h(1.2, () => {}, `The MPC never heard a kill (that came through the agent too). But after ${K.overseerTimeout} s without ESC telemetry the overseer drops <code>motion_enabled</code>, so the MPC sends zeros as well.`),
      s(2, () => sim.setLink(true), 'The agent restarts. The POAC board reconnects with its slots as they were (slot 1 still clear) and turns ESC power back on, so the ESC boards hold <code>ESC_POWERON_DELAY</code> for 5 s. For the first two flagged telemetry messages the overseer still says true (it waits for three in a row), so <code>motion_enabled</code> blinks on before the delay ends.'),
      s(6, () => {}, 'The delay is over: the flags clear, <code>motion_enabled</code> is true, and the MPC drives to its last reference again.'),
    ] },
  };
  const state = { key: 'pool', idx: 0, at: 0, manual: false, t0: 0 };
  const storyBar = segmented($('ks-stories'), Object.entries(STORIES).map(([k, v]) => [k, v.name]), 'pool', (k) => runStory(k), 'Story');

  // Before the story starts, the strips show the starting state, so 'no history yet' doesn't read as 'off'.
  function prefill() {
    sim.step();
    const now = sim.hist[sim.hist.length - 1];
    sim.hist = [];
    for (let k = HISTORY_SECONDS / 0.05; k >= 1; k--) sim.hist.push({ ...now, t: now.t - k * 0.05 });
    sim.hist.push(now);
    state.t0 = sim.t;
  }
  function runStep(i) {
    const st = STORIES[state.key].steps[i];
    st.run();
    state.idx = i;
    state.at = sim.t;
  }
  function runStory(k, upto = 0) {
    const st = STORIES[k];
    state.key = k;
    state.manual = false;
    st.start();
    prefill();
    sim.log = [];
    runStep(0);
    for (let i = 1; i <= upto; i++) { sim.advance(st.steps[i].after); runStep(i); }
    storyBar.set(k);
    syncInputs();
    render();
  }
  function next() {
    const steps = STORIES[state.key].steps;
    if (state.idx >= steps.length - 1) {
      const keys = Object.keys(STORIES);
      runStory(keys[(keys.indexOf(state.key) + 1) % keys.length]);
      return;
    }
    const wait = steps[state.idx + 1].after - (sim.t - state.at);
    if (wait > 0) sim.advance(wait);
    runStep(state.idx + 1);
    syncInputs();
    render();
  }
  $('ks-next').onclick = () => (state.manual ? runStory(state.key) : next());
  $('ks-back').onclick = () => { if (!state.manual && state.idx > 0) runStory(state.key, state.idx - 1); };
  $('ks-replay').onclick = () => runStory(state.key);

  // ---- manual controls: leave the story ----
  const manual = (fn) => (...a) => { if (!state.manual) { state.manual = true; storyBar.set(''); } fn(...a); syncInputs(); render(); };
  const ui = {};
  ui.sw = segmented($('ks-switch'), [['in', 'In'], ['out', 'Out (killed)']], 'in', manual((v) => sim.setSwitch(v === 'in')), 'Kill switch');
  ui.viewer = segmented($('ks-viewer'), [['open', 'Open'], ['closed', 'Closed']], 'open', manual((v) => {
    if (v === 'open') { if (!sim.viewer.open) sim.openViewer(); } else sim.closeViewer();
  }), 'Viewer');
  ui.slot = segmented($('ks-slot'), [['1', 'Slot 1'], ['2', 'Slot 2'], ['3', 'Slot 3']], '3', () => {}, 'Slot');
  ui.link = segmented($('ks-link'), [['up', 'Up'], ['down', 'Down']], 'up', manual((v) => sim.setLink(v === 'up')), 'micro-ROS agent');
  ui.control = segmented($('ks-control'), [['run', 'Running'], ['stop', 'Stopped']], 'run', manual((v) => sim.setControl(v === 'run')), 'control_system');
  const laptopSlot = () => +host.querySelector('#ks-slot [aria-pressed="true"]').dataset.v;
  $('ks-enable').onclick = manual(() => { if (sim.viewer.enabled) sim.viewerKill(false); else sim.viewerEnable(); });
  $('ks-command').onclick = manual(() => {
    if (!sim.inputs.control) sim.note('Viewer: "Control mode service unavailable" (control_system is down)', 'bad');
    else sim.viewerCommand();
  });
  $('ks-lkill').onclick = manual(() => sim.laptopSend(laptopSlot(), true, $('ks-nu').checked, $('ks-repeat').checked));
  $('ks-lclear').onclick = manual(() => sim.laptopSend(laptopSlot(), false, $('ks-nu').checked, $('ks-repeat').checked));
  $('ks-lstop').onclick = manual(() => sim.laptopStop());

  function syncInputs() {
    ui.sw.set(sim.inputs.switchIn ? 'in' : 'out');
    ui.viewer.set(sim.viewer.open ? 'open' : 'closed');
    ui.link.set(sim.inputs.link ? 'up' : 'down');
    ui.control.set(sim.inputs.control ? 'run' : 'stop');
    ui.slot.set(String(sim.laptop.slot));
    $('ks-nu').checked = sim.laptop.needsUpdate;
    $('ks-repeat').checked = !!sim.laptop.repeat;
  }

  // ---- rendering ----
  const slotNames = ['0 · switch', '1 · viewer', '2 · topside', '3 · debug'];
  const yes = (b) => (b ? '<span class="y">yes</span>' : 'no');
  const LANES = [
    ['sw', 'Switch in'], ['poac', 'POAC enabled'], ['kill', 'state/kill false'], ['esc', 'ESC boards ready'],
    ['motion', 'motion_enabled'], ['thrust', 'Thrusters running'],
  ];
  const chip = (label, ok, value) => `<div class="chip ${ok ? 'ok' : 'no'}"><small>${label}</small><b>${value}</b></div>`;
  let lastSay = '';
  function render() {
    const p = sim.poac, e = sim.esc, o = sim.overseer, m = sim.mpc, t = sim.t;
    const steps = STORIES[state.key].steps;
    let say;
    if (state.manual) {
      const ev = sim.log[0];
      say = `<b>Your controls.</b> ${ev ? `Latest: ${esc(ev.msg)} (t = ${ev.t.toFixed(1)} s).` : 'Change anything above; the result shows below.'}`;
    } else say = steps[state.idx].text;
    if (say !== lastSay) { $('ks-say').innerHTML = say; lastSay = say; }
    $('ks-count').innerHTML = state.manual ? 'Manual' : `Step ${state.idx + 1} of ${steps.length}${steps[state.idx].hold ? '<small>clock paused</small>' : ''}`;
    $('ks-back').disabled = state.manual || state.idx === 0;
    $('ks-next').textContent = state.manual ? 'Resume ›' : state.idx === steps.length - 1 ? 'Next story ›' : 'Next ›';
    const v = sim.verdict();
    $('ks-verdict').className = 'ks-verdict ' + (v.ok ? 'go' : v.idle ? 'idle' : 'stop');
    $('ks-verdict').innerHTML = `<span class="t">t = ${t.toFixed(1)} s</span>${v.text}`;
    // The same verdict at the top of the open controls, so a phone shows the result next to the control tapped.
    $('ks-echo').className = $('ks-verdict').className + ' ks-echo';
    $('ks-echo').innerHTML = $('ks-verdict').innerHTML;
    const flagNames = K.flags.filter((f) => e.flags & (1 << f.bit)).map((f) => f.name);
    $('ks-chain').innerHTML = [
      chip('POAC board', !p.asserting, p.asserting ? 'killed' : 'enabled'),
      chip('state/kill', sim.inputs.link && p.stateKill === false, sim.inputs.link ? String(p.stateKill) : 'silent'),
      chip('ESC flags', e.flags === 0, flagNames.length ? flagNames.map((f, i) => `<span class="nw">${f}${i < flagNames.length - 1 ? ',' : ''}</span>`).join(' ') : 'none'),
      chip('motion_enabled', sim.inputs.control && o.motionEnabled, sim.inputs.control ? String(o.motionEnabled) : 'not running'),
      chip('MPC', sim.inputs.control && m.commanding, !sim.inputs.control ? 'not running' : m.killed ? 'killed: zeros' : m.mode === 'DISABLED' ? 'DISABLED: zeros' : m.commanding ? 'sending RPM' : 'zeros'),
    ].join('');
    $('ks-slots').innerHTML = p.slots.map((s, i) => {
      const timed = s.enabled && s.needsUpdate && t >= s.timeoutAt;
      const lock = i === 0 ? 'GPIO' : s.lock || '–';
      const assertCell = s.asserting ? '<span class="n">kill</span>' : timed ? '<span class="n">timed out</span>' : s.enabled ? '<span class="y">clear</span>' : '–';
      const lockLine = i > 0 && s.lock ? `<small class="lk">lock: ${esc(s.lock)}</small>` : '';
      return `<tr class="${!s.enabled ? 'off' : s.asserting || timed ? 'bad' : ''}"><td>${slotNames[i]}${lockLine}</td><td>${yes(s.enabled)}</td><td>${assertCell}</td><td>${s.enabled ? (s.needsUpdate ? 'heartbeat' : 'latched') : '–'}</td><td class="lock">${esc(lock)}</td></tr>`;
    }).join('');
    $('ks-enable').textContent = sim.viewer.enabled ? 'KILL' : 'Enable';
    $('ks-enable').classList.toggle('kill', sim.viewer.enabled);
    $('ks-enable').disabled = !sim.viewer.open;
    $('ks-command').disabled = !sim.viewer.open || !sim.viewer.enabled;
    $('ks-log').innerHTML = sim.log.length
      ? sim.log.map((l) => `<li class="${l.kind}"><span>${l.t.toFixed(2)} s</span> ${esc(l.msg)}</li>`).join('')
      : '<li class="empty">Nothing has changed yet.</li>';
    drawStrips();
  }
  function drawStrips() {
    const box = $('ks-strips');
    const W = Math.max(260, box.clientWidth), lh = 22, labelW = W < 420 ? 108 : 124, H = LANES.length * lh + 20;
    const x0 = labelW, x1 = W - 2, t1 = sim.t, t0 = t1 - HISTORY_SECONDS;
    const X = (t) => x0 + ((Math.max(t, t0) - t0) / HISTORY_SECONDS) * (x1 - x0);
    let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Last 20 seconds of each layer">`;
    LANES.forEach(([key, name], li) => {
      const y = li * lh + 3, bh = lh - 8;
      svg += `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="${bh}" class="lane"/>`;
      let start = null;
      const h = sim.hist;
      for (let i = 0; i <= h.length; i++) {
        const on = i < h.length && h[i][key];
        if (on && start === null) start = h[i].t;
        if (!on && start !== null) {
          const end = i < h.length ? h[i].t : t1;
          svg += `<rect x="${X(start).toFixed(1)}" y="${y}" width="${Math.max(1, X(end) - X(start)).toFixed(1)}" height="${bh}" class="on ${key}"/>`;
          start = null;
        }
      }
      svg += `<text x="${labelW - 8}" y="${y + bh / 2}" class="lname">${name}</text>`;
    });
    const xs = X(state.t0);
    if (state.t0 > t0) {
      svg += `<line x1="${xs.toFixed(1)}" x2="${xs.toFixed(1)}" y1="0" y2="${LANES.length * lh}" class="start"/>`;
      if (xs - x0 > 46 && x1 - xs > 70) svg += `<text x="${xs.toFixed(1)}" y="${H - 3}" class="tick" text-anchor="middle">story start</text>`;
    }
    svg += `<text x="${x1}" y="${H - 3}" class="tick" text-anchor="end">now</text><text x="${x0}" y="${H - 3}" class="tick">−${HISTORY_SECONDS} s</text></svg>`;
    box.innerHTML = svg;
  }

  // ---- clock: real time while on screen ----
  let visible = false, last = null, acc = 0, lastRender = 0;
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; last = null; }).observe(host);
  const loop = (now) => {
    const held = !state.manual && STORIES[state.key].steps[state.idx].hold;
    if (visible && !held) {
      if (last !== null) {
        acc += Math.min(0.1, (now - last) / 1000);
        while (acc >= 0.01) { sim.step(); acc -= 0.01; }
      }
      last = now;
      if (now - lastRender > 66) { render(); lastRender = now; }
    } else last = null;
    requestAnimationFrame(loop);
  };
  runStory('pool');
  requestAnimationFrame(loop);
}
}
