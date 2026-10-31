import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/actuators.css';
import { el } from '../viz/chart.js';

setup();

const TF = 'https://github.com/osu-uwrt/titan_firmware/blob/master/talos/PoacBoard/src';
const RC = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed';
const RA = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping';
const NE = 'https://github.com/osu-uwrt/nereus/blob/main';
const esc = (s) => String(s).replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

let data, L;
const range = (a) => (Array.isArray(a) ? `#L${a[0]}-L${a[1]}` : `#L${a}`);

fetch(BASE + 'data/actuators/actuators.json').then((r) => r.json()).then((d) => {
  data = d;
  L = d.lines;
  launcher(document.getElementById('lv'));
  poac(document.getElementById('poac-stage'), document.getElementById('poac-note'));
  shot(document.getElementById('shot-panel'));
  claw(document.getElementById('claw-svg'), document.getElementById('claw-note'), document.getElementById('claw-ctl'));
});

// ------------------------------------------------------------------------------------------------ launcher
// The POAC's torpedo/marker logic (ros_torp.c + actuator.c on master) next to Nereus's (mechanisms.cpp).
function launcher(root) {
  const fw = data.firmware;
  const sim = data.nereus.mechanisms;
  const cooldownMs = sim.torpedo_launcher.parameters.cooldown_s * 1000;
  const E = data.status_enums;
  const SIM_T = data.nereus.status_map.torpedo_state.enum_map; // disarmed busy loaded empty -> numbers
  const SIM_D = data.nereus.status_map.dropper_state.enum_map;
  const S = {
    rules: 'fw', enabled: false, armed: false, torp: fw.torpedoes, mark: fw.markers,
    angle: fw.home_deg, move: null, cooldown: null, log: [],
  };
  const dialBox = root.querySelector('#lv-dial');
  const statusEl = root.querySelector('#lv-status');
  const logEl = root.querySelector('#lv-log');
  const enabledEl = root.querySelector('#lv-enabled');

  // ---- dial
  const W = 400, H = 252, cx = 200, cy = 142, R = 86;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lv-svg', role: 'img', 'aria-label': 'Launcher servo angle' }, dialBox);
  const pol = (deg, r) => { const a = ((210 - deg) * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const arc = (d0, d1, r) => { const [x0, y0] = pol(d0, r), [x1, y1] = pol(d1, r); return `M${x0},${y0} A${r},${r} 0 ${Math.abs(d1 - d0) > 180 ? 1 : 0} 1 ${x1},${y1}`; };
  el('path', { d: arc(0, 240, R), class: 'lv-track' }, svg);
  el('path', { d: arc(fw.home_deg, 240, R), class: 'lv-zone torp' }, svg);
  el('path', { d: arc(0, fw.home_deg, R), class: 'lv-zone mark' }, svg);
  const marks = [
    [fw.marker_second_deg, 'Marker 2', 'end'], [fw.marker_first_deg, 'Marker 1', 'end'], [fw.home_deg, 'Home', 'middle'],
    [fw.torp_first_deg, 'Torpedo 1', 'start'], [fw.torp_second_deg, 'Torpedo 2', 'start'],
  ];
  for (const [d, name, anchor] of marks) {
    const [x0, y0] = pol(d, R - 7), [x1, y1] = pol(d, R + 7), [tx, ty] = pol(d, R + 18);
    el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'lv-tick' }, svg);
    const t = el('text', { x: tx, y: anchor === 'middle' ? ty - 2 : ty + 4, 'text-anchor': anchor, class: 'lv-mark halo' }, svg);
    t.textContent = `${name} ${d}°`;
  }
  const needle = el('line', { x1: cx, y1: cy, class: 'lv-needle' }, svg);
  el('circle', { cx, cy, r: 6, class: 'lv-hub' }, svg);
  const angleText = el('text', { x: cx, y: cy + 30, 'text-anchor': 'middle', class: 'lv-angle' }, svg);
  const phaseText = el('text', { x: cx, y: cy + 48, 'text-anchor': 'middle', class: 'lv-phase' }, svg);
  // payload tubes: markers left, torpedoes right
  const tubes = [];
  const tube = (x, y, kind, i) => {
    const g = el('g', {}, svg);
    el('rect', { x, y, width: 34, height: 14, rx: 7, class: `lv-tube ${kind}` }, g);
    const lab = el('text', { x: x + 17, y: y + 26, 'text-anchor': 'middle', class: 'lv-tubelab' }, g);
    lab.textContent = `${kind === 'torp' ? 'T' : 'M'}${i + 1}`;
    tubes.push({ g, kind, i });
  };
  tube(10, 214, 'mark', 0); tube(50, 214, 'mark', 1);
  tube(W - 84, 214, 'torp', 0); tube(W - 44, 214, 'torp', 1);
  const simNote = el('text', { x: 4, y: 14, class: 'lv-simnote' }, svg);

  // ---- model
  const now = () => performance.now();
  const busy = () => (S.rules === 'fw' ? !!S.move : !!(S.cooldown && now() < S.cooldown.until));
  function say(cmd, ok, text, note) {
    S.log.unshift({ cmd, ok, text, note, rules: S.rules });
    S.log.length = Math.min(S.log.length, 6);
  }
  // Firmware move: out at 300 deg/s, 250 ms settle, home (asked as a 0 ms move: drawn fast), 250 ms settle.
  function startMove(target, torque) {
    const t = now();
    const from = S.angle;
    const outMs = (Math.abs(target - from) / fw.servo_max_dps) * 1000;
    const back = 120; // drawn duration of the "as fast as it can" return
    S.move = { t0: t, from, target, outMs, back, total: outMs + fw.postmove_ms + back + fw.postmove_ms, torque };
    loop();
  }
  function cmd(c) {
    const fwMode = S.rules === 'fw';
    if (fwMode) {
      if (c === 'arm') {
        if (S.armed) return say(c, false, 'Already Armed');
        if (!S.enabled) return say(c, false, 'Kill Switch Removed');
        S.armed = true;
        return say(c, true, '', 'servo load (torque on) written and read back');
      }
      if (c === 'disarm') { S.armed = false; return say(c, true, '', 'torque off'); }
      if (c === 'reload') {
        if (S.move) return say(c, false, 'Busy');
        S.torp = fw.torpedoes; S.mark = fw.markers;
        return say(c, true, '', `counts back to ${fw.torpedoes}; arming unchanged`);
      }
      if (c === 'torpedo') {
        if (!S.enabled) return say(c, false, 'Kill Switch Removed');
        if (!S.armed) return say(c, false, 'Not Armed');
        if (S.torp <= 0) return say(c, false, 'All Torpedos Fired');
        if (S.move) return say(c, false, 'Already Firing');
        const target = S.torp === 2 ? fw.torp_first_deg : fw.torp_second_deg;
        S.torp--;
        startMove(target, true);
        return say(c, true, '', `servo to ${target}°, then home`);
      }
      if (c === 'dropper') {
        if (S.mark <= 0) return say(c, false, 'All Dropped');
        const target = S.mark === 2 ? fw.marker_first_deg : fw.marker_second_deg;
        S.mark--;
        const warn = [];
        if (!S.enabled) warn.push('killed');
        if (!S.armed) warn.push('disarmed');
        if (S.move) warn.push('mid-move');
        if (S.move && S.move.torque) { const a = S.angle; S.move = null; S.angle = a; }
        if (S.armed) startMove(target, true);
        return say(c, true, '', warn.length
          ? `accepted although ${warn.join(', ')}: the dropper isn't checked${S.armed ? '' : '. Torque is off; whether the servo moves is up to it (not drawn)'}`
          : `servo to ${target}°, then home`, warn.length > 0);
      }
    } else {
      const blocked = !S.enabled || !S.armed;
      if (c === 'arm') {
        if (!S.enabled) return say(c, false, 'Cannot arm while killed');
        S.armed = true; return say(c, true, 'Armed');
      }
      if (c === 'disarm') { S.armed = false; return say(c, true, 'Disarmed'); }
      if (c === 'reload') {
        S.torp = 2; S.mark = 2; S.cooldown = null; S.armed = false;
        return say(c, true, 'Reloaded and disarmed');
      }
      if (c === 'torpedo' || c === 'dropper') {
        if (blocked) return say(c, false, 'Mechanism is disarmed or vehicle is killed');
        if (busy()) return say(c, false, 'Release group is busy');
        const key = c === 'torpedo' ? 'torp' : 'mark';
        if (S[key] <= 0) return say(c, false, 'No ammunition; reload first');
        S[key]--;
        S.cooldown = { until: now() + cooldownMs, owner: c };
        loop();
        return say(c, true, 'Payload released', `slot_${1 - S[key]} leaves at ${data.nereus.launch_speed_m_s[c === 'torpedo' ? 'torpedo_launcher' : 'dropper']} m/s; ${cooldownMs / 1000} s cooldown`);
      }
    }
  }
  function status() {
    const b = busy();
    if (S.rules === 'fw') {
      const ts = !S.armed ? 1 : S.move ? 4 : S.torp > 0 ? 3 : 5;
      const ds = !S.armed ? 1 : S.move ? 3 : S.mark > 0 ? 2 : 4;
      return { armed: S.armed, ts, ds, b };
    }
    const blocked = !S.enabled || !S.armed;
    const own = (k) => S.cooldown && now() < S.cooldown.until && S.cooldown.owner === k;
    const ts = blocked ? SIM_T.disarmed : own('torpedo') ? SIM_T.busy : S.torp > 0 ? SIM_T.loaded : SIM_T.empty;
    const ds = blocked ? SIM_D.disarmed : own('dropper') ? SIM_D.busy : S.mark > 0 ? SIM_D.loaded : SIM_D.empty;
    return { armed: S.armed, ts, ds, b };
  }
  const nm = (grp, v) => `${v} ${(E[grp][v] || '').toUpperCase()}`;

  // ---- draw
  function draw() {
    const t = now();
    let phase = 'idle at home';
    if (S.rules === 'fw' && S.move) {
      const m = S.move, dt = t - m.t0;
      if (dt < m.outMs) { S.angle = m.from + (m.target - m.from) * (dt / m.outMs); phase = `→ ${m.target}° at ${fw.servo_max_dps}°/s`; }
      else if (dt < m.outMs + fw.postmove_ms) { S.angle = m.target; phase = `settling ${fw.postmove_ms} ms`; }
      else if (dt < m.outMs + fw.postmove_ms + m.back) { const k = (dt - m.outMs - fw.postmove_ms) / m.back; S.angle = m.target + (fw.home_deg - m.target) * k; phase = 'back home, full speed'; }
      else if (dt < m.total) { S.angle = fw.home_deg; phase = `settling ${fw.postmove_ms} ms`; }
      else { S.angle = fw.home_deg; S.move = null; }
    } else if (S.rules === 'sim') {
      phase = busy() ? `cooldown ${((S.cooldown.until - t) / 1000).toFixed(2)} s` : 'no servo: slots release directly';
    }
    const [nx, ny] = pol(S.angle, R - 16);
    needle.setAttribute('x2', nx); needle.setAttribute('y2', ny);
    svg.classList.toggle('sim', S.rules === 'sim');
    svg.classList.toggle('torque', S.rules === 'fw' && S.armed);
    angleText.textContent = S.rules === 'fw' ? `${Math.round(S.angle)}°` : '';
    phaseText.textContent = phase;
    simNote.textContent = S.rules === 'sim' ? 'Nereus has no servo: the dial is not used' : (S.armed ? 'torque on (armed)' : 'torque off (disarmed)');
    for (const tb of tubes) {
      const left = tb.kind === 'torp' ? S.torp : S.mark;
      // firmware fires torpedo 1 (200 deg) first; tube index i is "loaded" while i >= 2 - left
      tb.g.classList.toggle('empty', tb.i < 2 - left);
    }
    const st = status();
    statusEl.innerHTML = `<tbody>
      <tr><th>actuators_armed</th><td>${st.armed}</td></tr>
      <tr><th>torpedo_state</th><td>${nm('torpedo', st.ts)}</td></tr>
      <tr><th>torpedo_available_count</th><td>${S.torp}</td></tr>
      <tr><th>dropper_state</th><td>${nm('dropper', st.ds)}</td></tr>
      <tr><th>dropper_available_count</th><td>${S.mark}</td></tr>
      <tr><th>busy</th><td>${st.b}</td></tr></tbody>`;
    logEl.innerHTML = S.log.length ? S.log.map((l) => `<li class="${l.ok ? (l.note === true ? 'warn' : 'ok') : 'no'}"><b>${l.cmd}</b> → cmd_status <b>${l.ok}</b>${l.text ? ` · “${esc(l.text)}”` : ''}${typeof l.note === 'string' ? ` <span>${esc(l.note)}</span>` : ''}</li>`).join('')
      : '<li class="hint">Enable the robot, arm, then fire.</li>';
    for (const b of root.querySelectorAll('[data-cmd]')) b.setAttribute('aria-pressed', 'false');
  }
  let raf = 0;
  function loop() {
    cancelAnimationFrame(raf);
    const step = () => {
      draw();
      if ((S.rules === 'fw' && S.move) || (S.rules === 'sim' && busy())) raf = requestAnimationFrame(step);
      else draw();
    };
    if (reduced && S.move) S.move.t0 -= S.move.total; // jump to the end
    step();
  }
  root.querySelector('#lv-btns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    cmd(b.dataset.cmd);
    loop();
  });
  enabledEl.addEventListener('change', () => {
    S.enabled = enabledEl.checked;
    if (!S.enabled) {
      if (S.rules === 'sim' && S.armed) { S.armed = false; say('kill', true, '', 'a kill disarms everything in Nereus', false); }
      else if (S.rules === 'fw' && S.armed) say('kill', true, '', 'still armed: the POAC does not disarm on a kill (TODO in safety_handle_kill)', true);
    }
    loop();
  });
  for (const b of root.querySelectorAll('#lv-rules button')) {
    b.addEventListener('click', () => {
      for (const o of root.querySelectorAll('#lv-rules button')) o.setAttribute('aria-pressed', String(o === b));
      Object.assign(S, { rules: b.dataset.r, armed: false, torp: 2, mark: 2, move: null, cooldown: null, angle: fw.home_deg, log: [] });
      loop();
    });
  }
  draw();
}

// ------------------------------------------------------------------------------------------------ POAC rings
async function poac(stage, note) {
  const hot = await fetch(BASE + 'data/boards/hotspots.json').then((r) => r.json());
  const spots = Object.fromEntries(hot.boards.poac.top.spots.map((s) => [s.ref, s]));
  const fw = data.firmware;
  const pick = [
    ['J5', 'Stack link', 'CAN H/L arrive here, chained through the other boards, along with power. The internal bus is CAN FD.'],
    ['U2C', 'CAN transceiver', 'Turns the bus voltages into logic levels for the controller.'],
    ['U1C', 'CAN controller (MCP2517FD)', 'Holds the CAN frames for the RP2040, which reads it over SPI. The micro-ROS client runs on top.'],
    ['U1R', 'RP2040', `Runs the micro-ROS client and the actuator code (ros_torp.c, actuator.c). A PIO state machine makes the servo's half-duplex UART on GPIO ${fw.servo_pin}, ${fw.baud} baud.`],
    ['PS1', '15 V regulator', 'Off the battery bus, before the kill switch. The servo supply hangs off this rail, so a kill does not cut it.'],
    ['U2', '12 V LDO (MIC29300-12)', 'Makes 12 V from 15 V for one thing only: the servo connector.'],
    ['LID_CONN1', 'Servo connector', 'GND, 12V, ACT_PWM_5V and ACT_CHECK_5V go out through the hull lid to the launcher servo.'],
  ];
  const rings = [];
  pick.forEach(([ref, label, text], i) => {
    const s = spots[ref];
    if (!s) return;
    const b = document.createElement('button');
    b.className = s.y < 0.15 ? 'poac-ring low' : 'poac-ring'; // near the top edge: badge below the ring
    b.style.left = `${s.x * 100}%`;
    b.style.top = `${s.y * 100}%`;
    // Keep each ring inside the render: cap the radius at the distance to the top edge (in width units).
    const img = stage.querySelector('img');
    const aspect = Number(img.getAttribute('height')) / Number(img.getAttribute('width'));
    const d = Math.min(Math.max(s.r * 2, 0.045), 2 * Math.max(0.02, s.y - 0.008) * aspect) * 100;
    b.style.width = `${d}%`;
    b.setAttribute('aria-label', `${i + 1}: ${label}`);
    b.innerHTML = `<span>${i + 1}</span>`;
    const show = () => {
      rings.forEach((r) => r.classList.toggle('on', r === b));
      note.innerHTML = `<b>${i + 1}. ${esc(label)}</b> <code>${esc(ref)}</code>. ${esc(text)}`;
    };
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    b.addEventListener('click', show);
    b.addEventListener('focus', show);
    stage.appendChild(b);
    rings.push(b);
  });
}

// ------------------------------------------------------------------------------------------------ shot timeline
function shot(root) {
  const fw = data.firmware, tr = data.translator, tree = data.tree;
  const out1 = ((fw.torp_first_deg - fw.home_deg) / fw.servo_max_dps) * 1000;
  // Firmware-side times (ms from the tree's call). UART read-back ~30 ms is two 10 ms ticks plus the reply.
  const tWrite = 30, tOutEnd = tWrite + out1, tSettle1 = tOutEnd + fw.postmove_ms, tBack = tSettle1 + 30, tIdle = tBack + fw.postmove_ms;
  const tReply = fw.cmd_status_ms, tTrans = tr.feedback_period_s * 1000;
  const tWaitEnd = tTrans + tree.fire_torpedo.wait_s * 1000;
  const statusTicks = [300, 800, 1300, 1800, 2300, 2800];
  const tDone = statusTicks.find((t) => t >= tWaitEnd + tree.wait_for_actuators.poll_s * 1000);
  const ms = (t) => (t >= 1000 ? `${(t / 1000).toFixed(2)} s` : `${Math.round(t)} ms`);
  const link = (href, text) => `<a href="${href}">${text}</a>`;

  const ROBOT = {
    domain: [0, 3000], unit: 1000,
    lanes: [['tree', 'Tree', '--state'], ['tr', 'Translator', '--s7'], ['poac', 'CAN + POAC', '--s4'], ['servo', 'Servo', '--prediction'], ['status', 'Status topics', '--ink-2']],
    steps: [
      { lane: 'tree', a: 0, b: tTrans, title: 'The tree calls the service',
        body: `<code>FireTorpedo</code> runs <code>CallTriggerService</code> on <code>command/actuator/torpedo</code>. It waits up to 1 s for the server to exist, then up to ${tree.fire_torpedo.time_limit_s} s for the answer, checking each tick.`,
        code: '<Action ID="CallTriggerService" srv_name="{torpedo_srv}" time_limit_secs="1"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'RepairCompMpcTree.xml') },
      { lane: 'tr', a: 0, b: tTrans, title: 'The translator publishes the topic and waits',
        body: `<code>actuator_service_translator</code> publishes an empty message on the topic of the same name, then sleeps in ${ms(tTrans)} steps until <code>state/actuator/cmd_status</code> arrives. There is no timeout.`,
        code: 'publisher.publish(Empty())\nself.await_data = True\nwhile (self.await_data):\n    sleep(self.FEEDBACK_PERIOD)   # 0.2 s\nreturn self.feedback',
        src: link(`${RC}/riptide_hardware/riptide_hardware2/actuator_service_translator.py${range(L.translator.wait)}`, 'actuator_service_translator.py') },
      { lane: 'poac', a: 2, b: 8, title: 'micro-ROS carries it over CAN',
        body: 'The <code>copro_agent</code> on the Orin forwards the message to the POAC\'s micro-ROS client over the internal CAN FD bus (<code>can0</code>). A few milliseconds; not measured.',
        code: 'micro_ros_agent can -D can0 -v4 -m rmw',
        src: link(`${RC}/riptide_hardware/launch/copro_agent.launch.py`, 'copro_agent.launch.py') },
      { lane: 'poac', a: 8, b: tWrite, title: 'The firmware checks, then moves the servo',
        body: `<code>torpedo_fire()</code> refuses if the robot is killed, not armed, out of torpedoes or already moving. Otherwise it queues a move to ${fw.torp_first_deg}° (${fw.torp_second_deg}° for the second torpedo) and counts one torpedo gone. Packets leave on the next ${fw.uart_tick_ms} ms tick and are read back.`,
        code: 'if (safety_kill_get_asserting_kill()) { *errMsgOut = "Kill Switch Removed"; return false; }\nif (!enabled)     { *errMsgOut = "Not Armed"; return false; }\nif (num_torp <= 0) { *errMsgOut = "All Torpedos Fired"; return false; }\nif (move_active)  { *errMsgOut = "Already Firing"; return false; }\nservo_set_deg_then_home(TORP_2_DEG);   // 200 deg, first torpedo\nnum_torp--;',
        src: link(`${TF}/actuators/ros_torp.c${range(L.ros_torp.torpedo_fire)}`, 'ros_torp.c') },
      { lane: 'poac', a: tReply, b: tTrans, point: true, title: 'The answer goes back',
        body: `The board publishes <code>cmd_status</code> (true) and <code>cmd_feedback</code> (empty) on its next ${fw.cmd_status_ms} ms tick. The translator notices at its next check and returns <code>success: true</code>; the tree's node turns SUCCESS. Somewhere between ${fw.cmd_status_ms} and ${fw.cmd_status_ms + tTrans} ms after the call.`,
        code: '#define SERVO_UPDATE_CMD_STATUS_PERIOD_MS 100',
        src: link(`${TF}/main.c${range(L.main.timers)}`, 'main.c') },
      { lane: 'servo', a: tWrite, b: tOutEnd, title: `The servo turns ${fw.home_deg}° → ${fw.torp_first_deg}°`,
        body: `The move time is planned from the firmware's ${fw.servo_max_dps}°/s: ${fw.torp_first_deg - fw.home_deg}° takes ${ms(out1)} (the second torpedo, ${fw.torp_second_deg - fw.home_deg}°, ${ms(((fw.torp_second_deg - fw.home_deg) / fw.servo_max_dps) * 1000)}). Along the way the pushing arm releases the spring and the torpedo leaves. <code>busy</code> is true from here.`,
        code: 'uint16_t target = deg * (1000.0 / 240.0);\nuint16_t move_time_ms = fabs(deg - curr_deg) * (1.0 / SERVO_MAX_DPS) * 1000;',
        src: link(`${TF}/actuators/actuator.c${range(L.actuator.set_deg)}`, 'actuator.c') },
      { lane: 'servo', a: tOutEnd, b: tIdle, title: 'Settle, go home, settle',
        body: `${fw.postmove_ms} ms after the planned move ends, an alarm sends it home to ${fw.home_deg}°. That return is planned from a position reading that hasn't come back yet, so it is asked as a 0 ms move: the servo goes as fast as it can. Another ${fw.postmove_ms} ms and <code>busy</code> drops, about ${ms(tIdle)} after the call.`,
        code: 'move_complete_alarm = add_alarm_in_ms(curr_move_time_ms + SERVO_POSTMOVE_DELAY_MS, ...);\n// servo_move_complete_cb: move_active = false; servo_read_deg(); servo_go_home();',
        src: link(`${TF}/actuators/actuator.c${range(L.actuator.complete)}`, 'actuator.c') },
      { lane: 'status', ticks: statusTicks, a: statusTicks[0], b: statusTicks[2], title: 'Status lags behind',
        body: `<code>state/actuator/status</code> and <code>busy</code> go out every ${fw.status_ms} ms, so anything watching sees the shot up to half a second late. Here (one possible phase) <code>busy</code> reads true at ${ms(statusTicks[0])} and ${ms(statusTicks[1])}, false from ${ms(statusTicks[2])}.`,
        code: '#define ACTUATOR_STATUS_TIME_MS 500',
        src: link(`${TF}/actuators/ros_torp.c${range(L.ros_torp.status)}`, 'ros_torp.c') },
      { lane: 'tree', a: tTrans, b: tDone, title: 'The tree waits it out',
        body: `<code>FireTorpedo</code> then waits a flat ${tree.fire_torpedo.wait_s} s, and <code>WaitForActuators</code> polls every ${tree.wait_for_actuators.poll_s} s for a fresh <code>busy</code> = false. The shot is done for the tree around ${ms(tDone)}: almost all of it is waiting, by design, so the next move can't start while a spring is still being released.`,
        code: '<Action ID="Wait" seconds="2"/>\n<SubTree ID="WaitForActuators" timeout_secs="10"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.WaitForActuators)}`, 'WaitForActuators') },
    ],
  };

  // Measured in the Nereus media run (sim seconds from the torpedo's release).
  const rows = data.nereus_shot.rows;
  const leaf = (r) => r[1] === 'stack' && r[2][r[2].length - 1];
  const firstCall = rows.find((r) => leaf(r) === 'CallTriggerService')[0];
  const waitStart = rows.find((r) => r[0] > firstCall && leaf(r) === 'Wait')[0];
  const hit = rows.find((r) => r[1] === 'event' && r[2].result === 'success');
  const waitEnd = rows.find((r) => r[0] > waitStart + 1 && leaf(r) === 'FireTorpedo')[0];
  const settle = rows.find((r) => leaf(r) === 'Wait' && r[2].includes('WaitForController'))[0];
  const reset = rows.find((r) => r[1] === 'event' && r[2].kind === 'tasks')[0];
  const call2 = rows.filter((r) => leaf(r) === 'CallTriggerService')[1][0];
  const after2 = rows.find((r) => r[0] > call2 && leaf(r) === 'SetActuatorsArmed')[0];
  const mech = data.nereus.mechanisms.torpedo_launcher.parameters;
  const SIM = {
    domain: [-1.3, 7.6], unit: 1,
    lanes: [['tree', 'Tree', '--state'], ['br', 'Nereus bridge', '--s7'], ['launch', 'Launcher', '--prediction'], ['torp', 'Torpedo', '--s8']],
    steps: [
      { lane: 'tree', a: settle, b: firstCall, title: 'Lined up and settled',
        body: `<code>WaitForController</code> has been checking once a second that the controller's trust is above ${tree.shoot.scale_trust} and that <code>torpedo_0_link</code> is within ${tree.shoot.ctrler_dist * 100} cm of the hole's axis, ${tree.shoot.shoot_prox} m out. It passes, and the tree moves on to fire.`,
        code: `<SubTree ID="WaitForController" dist="ctrler_dist" link_frame="link_1" target_frame="object_1_frame" trust="scale_trust"/>`,
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.ShootBothObjectsMpc)}`, 'ShootBothObjectsMpc') },
      { lane: 'tree', a: firstCall, b: waitStart, title: 'Service call and answer',
        body: `The same <code>CallTriggerService</code> as on the robot. The answer came back in ${Math.round((waitStart - firstCall) * 1000)} ms (the logger's resolution is a few ms): the bridge answers in-process instead of waiting for a board.`,
        code: '<Action ID="CallTriggerService" srv_name="{torpedo_srv}" time_limit_secs="1"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
      { lane: 'br', a: 0, b: 0, point: true, title: 'The bridge fires the launcher',
        body: 'The service maps to <code>mechanisms.torpedo_launcher.fire</code>. It checks arming and kill, the shared cooldown and the ammunition, then releases <code>slot_0</code> as a free body. The task log has it as <code>torpedo released, slot 0</code>.',
        code: '- id: fire_torpedo\n  service: command/actuator/torpedo\n  action: \'command:mechanisms.torpedo_launcher.fire\'',
        src: link(`${NE}/content/packs/bridges/uwrt_talos/bridge.yaml${range(L.bridge.services)}`, 'bridge.yaml') },
      { lane: 'launch', a: 0, b: mech.cooldown_s, title: `${mech.cooldown_s} s cooldown`,
        body: `Torpedoes and markers share one cooldown group, standing in for the single servo. <code>busy</code> is true for ${mech.cooldown_s} s, much shorter than the robot's servo cycle.`,
        code: `cooldown_s: ${mech.cooldown_s}\ncooldown_group: ${mech.cooldown_group}`,
        src: link(`${NE}/content/packs/robots/talos/robot.yaml${range(L.robot_yaml.mechanisms)}`, 'robot.yaml') },
      { lane: 'torp', a: 0, b: hit[0], title: `Flight: ${Math.round(hit[0] * 1000)} ms to the hole`,
        body: `The torpedo leaves at ${data.nereus.launch_speed_m_s.torpedo_launcher} m/s (a ${mech.launch.spring_energy_j} J spring into ${(mech.projectile.mass_kg * 1000).toFixed(1)} g plus added mass), turns under drag and buoyancy, and passes through <code>${esc(hit[2].target)}</code> ${Math.round(hit[0] * 1000)} ms later.`,
        code: `launch: {spring_energy_j: ${mech.launch.spring_energy_j}}   # speed = sqrt(2E / (m + m_added)) + vehicle velocity`,
        src: link(`${NE}/libraries/session/src/mechanisms.cpp`, 'mechanisms.cpp') },
      { lane: 'tree', a: waitStart, b: waitEnd, title: 'The tree waits 2 s',
        body: `Then <code>WaitForActuators</code> finds <code>busy</code> already false, and <code>FireTorpedo</code> ends ${(waitEnd).toFixed(2)} s after the release. The tree slides across to the second hole.`,
        code: '<Action ID="Wait" seconds="2"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
      { lane: 'br', a: reset, b: after2, point2: call2, title: 'The second shot is refused, silently',
        body: `At ${reset.toFixed(1)} s the tasks are reset (the scorecard run was being started by hand), which reloads and disarms. The second call at ${call2.toFixed(1)} s is refused at once, but <code>FireTorpedo</code> is wrapped in a <code>ForceSuccess</code>, so the tree goes straight on: ${Math.round((after2 - call2) * 1000)} ms later it is disarming, then it heads for the table as if it had fired.`,
        code: '<BehaviorTree ID="FireTorpedo">\n  <ForceSuccess name="REMOVE ME"> ...',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
    ],
  };

  const box = root.querySelector('#shot-gantt');
  const card = root.querySelector('#shot-card');
  const count = root.querySelector('#shot-count');
  let mode = ROBOT, sel = 0;

  function draw() {
    box.innerHTML = '';
    const w = Math.max(280, box.clientWidth || 600);
    const narrow = w < 520;
    const labW = narrow ? 0 : 104, padR = 14, laneH = narrow ? 50 : 32, top = 6;
    const H = top + mode.lanes.length * laneH + 30;
    const svg = el('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, class: 'chart shot-svg', role: 'img', 'aria-label': 'Torpedo shot timeline' }, box);
    const [d0, d1] = mode.domain;
    const x = (t) => labW + ((t - d0) / (d1 - d0)) * (w - labW - padR);
    const laneY = Object.fromEntries(mode.lanes.map(([id], i) => [id, top + i * laneH]));
    // axis
    const step = mode === ROBOT ? 500 : 1;
    const g = el('g', { class: 'axis' }, svg);
    for (let t = Math.ceil(d0 / step) * step; t <= d1 + 1e-9; t += step) {
      el('line', { x1: x(t), x2: x(t), y1: top, y2: H - 24, class: t === 0 ? 'zero' : 'gridline' }, g);
      const tx = el('text', { x: x(t), y: H - 8, 'text-anchor': 'middle' }, g);
      tx.textContent = mode === ROBOT ? (t === 0 ? '0' : `${(t / 1000).toFixed(1)} s`) : `${t} s`;
    }
    mode.lanes.forEach(([id, name, color]) => {
      const y = laneY[id];
      el('rect', { x: labW, y: y + 2, width: w - labW - padR, height: laneH - 4, class: 'lane-bg' }, svg);
      const t = el('text', narrow ? { x: labW + 4, y: y + 14, class: 'lane-lab halo' } : { x: labW - 8, y: y + laneH / 2 + 4, 'text-anchor': 'end', class: 'lane-lab' }, svg);
      t.textContent = name;
      t.style.fill = css(color);
    });
    const lastNum = {};
    const badges = [];
    // Badge spacing: on a phone, steps a few ms apart sit on top of each other, so their numbers are spread
    // out and made the tap targets (drawn last, on top of every bar).
    const gap = narrow ? 20 : 11;
    mode.steps.forEach((s, i) => {
      const lane = mode.lanes.find((l) => l[0] === s.lane);
      const color = css(lane[2]);
      const y = laneY[s.lane] + (narrow ? 29 : 7), h = laneH - (narrow ? 33 : 14);
      const grp = el('g', { class: `step${i === sel ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Step ${i + 1}: ${s.title}` }, svg);
      const hit = el('rect', { x: x(s.a) - 6, y: laneY[s.lane], width: Math.max(12, x(s.b) - x(s.a) + 12), height: laneH, class: 'hit' }, grp);
      hit.style.fill = 'transparent';
      if (s.ticks) {
        for (const t of s.ticks) el('rect', { x: x(t) - 2, y, width: 4, height: h, rx: 1, fill: color, class: 'bar' }, grp);
      } else if (s.point) {
        el('path', { d: `M${x(s.a)},${y - 1} l5,${h / 2 + 1} l-5,${h / 2 + 1} l-5,${-(h / 2 + 1)}z`, fill: color, class: 'bar' }, grp);
        if (s.b !== s.a) {
          el('line', { x1: x(s.a), x2: x(s.b), y1: y + h / 2, y2: y + h / 2, stroke: color, 'stroke-dasharray': '3 3', class: 'bar' }, grp);
          el('path', { d: `M${x(s.b)},${y - 1} l5,${h / 2 + 1} l-5,${h / 2 + 1} l-5,${-(h / 2 + 1)}z`, fill: color, class: 'bar' }, grp);
        }
      } else {
        el('rect', { x: x(s.a), y, width: Math.max(4, x(s.b) - x(s.a)), height: h, rx: 3, fill: color, class: 'bar' }, grp);
        if (s.point2 !== undefined) el('path', { d: `M${x(s.point2)},${y - 3} l5,${h / 2 + 3} l-5,${h / 2 + 3} l-5,${-(h / 2 + 3)}z`, fill: css('--s8'), class: 'bar' }, grp);
      }
      let nx = Math.min(x(s.a) + (s.point ? 8 : 4), w - padR - 8);
      if (lastNum[s.lane] !== undefined && nx < lastNum[s.lane] + gap) nx = lastNum[s.lane] + gap;
      lastNum[s.lane] = nx;
      const num = el('text', { x: nx, y: y - 2, class: 'step-num halo' }, grp);
      num.textContent = i + 1;
      badges.push([i, nx, y]);
      grp.addEventListener('click', () => select(i));
      grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    });
    for (const [i, nx, y] of badges) {
      const r = el('rect', { x: nx - gap / 2 + 3, y: y - 16, width: gap, height: 20, class: 'badge-hit' }, svg);
      r.style.fill = 'transparent';
      r.style.cursor = 'pointer';
      r.addEventListener('click', () => select(i));
    }
  }
  function select(i) {
    sel = Math.max(0, Math.min(mode.steps.length - 1, i));
    const s = mode.steps[sel];
    const tA = mode === ROBOT ? ms(s.a) : `${s.a.toFixed(2)} s`;
    const tB = mode === ROBOT ? ms(s.b) : `${s.b.toFixed(2)} s`;
    card.innerHTML = `<div class="shot-when">Step ${sel + 1} of ${mode.steps.length} · ${s.a === s.b ? tA : `${tA} → ${tB}`}</div>
      <h3>${s.title}</h3><p>${s.body}</p><pre><code>${esc(s.code)}</code></pre><div class="src">Source: ${s.src}</div>`;
    count.textContent = `${sel + 1} / ${mode.steps.length}`;
    root.querySelector('#shot-prev').disabled = sel === 0;
    root.querySelector('#shot-next').disabled = sel === mode.steps.length - 1;
    draw();
  }
  root.querySelector('#shot-prev').addEventListener('click', () => select(sel - 1));
  root.querySelector('#shot-next').addEventListener('click', () => select(sel + 1));
  for (const b of root.querySelectorAll('#shot-mode button')) {
    b.addEventListener('click', () => {
      for (const o of root.querySelectorAll('#shot-mode button')) o.setAttribute('aria-pressed', String(o === b));
      mode = b.dataset.m === 'sim' ? SIM : ROBOT;
      select(0);
    });
  }
  let lastW = 0;
  new ResizeObserver(() => { const w = box.clientWidth; if (w !== lastW) { lastW = w; draw(); } }).observe(box);
  select(0);
}

// ------------------------------------------------------------------------------------------------ claw
function claw(box, note, ctl) {
  const p = data.nereus.mechanisms.claw.parameters;
  const minGap = p.min_gap_m * 1000, maxGap = p.max_gap_m * 1000, speed = p.jaw_speed_m_s * 1000; // mm, mm/s per jaw
  const travel = (maxGap - minGap) / 2;
  const S = { q: 0, dir: 0, target: 0, remain: null, last: 0, cmd: null };
  const W = 360, H = 150, cx = W / 2, scale = 1.05;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'claw-svg', role: 'img', 'aria-label': 'Claw jaws, seen from the bow' }, box);
  el('rect', { x: 20, y: 18, width: W - 40, height: 10, rx: 3, class: 'claw-rack' }, svg);
  el('circle', { cx, cy: 23, r: 11, class: 'claw-pinion' }, svg);
  const jawL = el('path', { class: 'claw-jaw' }, svg);
  const jawR = el('path', { class: 'claw-jaw' }, svg);
  const gapLine = el('line', { y1: 128, y2: 128, class: 'claw-gap' }, svg);
  const gapText = el('text', { x: cx, y: 145, 'text-anchor': 'middle', class: 'claw-text' }, svg);
  const jaw = (edge, side) => {
    // edge = x of the gripping face; jaw drawn outward from it
    const s = side, w = 46;
    return `M${edge},34 L${edge},104 L${edge + s * 14},118 L${edge + s * w},40 L${edge + s * w},34 Z`;
  };
  function draw() {
    const gap = minGap + 2 * S.q;
    const half = (gap / 2) * scale;
    jawL.setAttribute('d', jaw(cx - half, -1));
    jawR.setAttribute('d', jaw(cx + half, 1));
    gapLine.setAttribute('x1', cx - half); gapLine.setAttribute('x2', cx + half);
    gapText.textContent = `gap ${gap.toFixed(1)} mm`;
    const state = S.dir === 0 ? (S.q <= 0.01 ? 'closed' : S.q >= travel - 0.01 ? 'fully open' : 'stopped') : S.dir > 0 ? 'opening' : 'closing';
    note.innerHTML = S.cmd === null
      ? `Starts closed (gap ${minGap} mm), as in Nereus. Full open takes ${(travel / speed).toFixed(1)} s.`
      : `<b>claw_move_s ${S.cmd}</b>: ${state}. Each jaw has moved ${S.q.toFixed(0)} of ${travel.toFixed(0)} mm${S.remain !== null && S.dir !== 0 ? `, ${(S.remain / 1000).toFixed(1)} s left on the timer` : ''}.`;
  }
  let raf = 0;
  function run() {
    cancelAnimationFrame(raf);
    S.last = performance.now();
    const step = (t) => {
      const dt = Math.min(100, t - S.last); S.last = t;
      if (S.remain !== null) { S.remain -= dt; if (S.remain <= 0) { S.dir = 0; S.remain = null; } }
      if (S.dir !== 0) {
        const d = (speed * dt) / 1000;
        S.q += Math.max(-d, Math.min(d, S.target - S.q));
        if (Math.abs(S.target - S.q) < 1e-6) S.dir = 0;
      }
      draw();
      if (S.dir !== 0) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }
  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    const s = Number(b.dataset.s);
    S.cmd = s.toFixed(1);
    if (s === 0) { S.dir = 0; S.remain = null; }
    else { S.dir = s > 0 ? 1 : -1; S.target = s > 0 ? travel : 0; S.remain = Math.abs(s) * 1000; }
    if (reduced && S.dir !== 0) { // jump to where the move would end
      const d = Math.min(Math.abs(S.target - S.q), (speed * S.remain) / 1000);
      S.q += S.dir * d; S.dir = 0; S.remain = null; draw();
    } else run();
    draw();
  });
  draw();
}
