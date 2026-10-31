import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/actuators.css';
import { el } from '../viz/chart.js';

setup();

const TF = 'https://github.com/osu-uwrt/titan_firmware/blob/master/talos/PoacBoard/src';
const RC = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed';
const RA = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping';
const NE = 'https://github.com/osu-uwrt/nereus/blob/main';
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const range = (a) => (Array.isArray(a) ? `#L${a[0]}-L${a[1]}` : `#L${a}`);
const link = (href, text) => `<a href="${href}">${text}</a>`;
const f2 = (v) => (Math.round(v * 100) / 100).toFixed(2); // 2.485 -> 2.49 (toFixed alone gives 2.48)

let data, L;

cardTables();
simClips();

fetch(BASE + 'data/actuators/actuators.json').then((r) => r.json()).then((d) => {
  data = d;
  L = d.lines;
  launcher(document.getElementById('lv'));
  poac(document.getElementById('poac-stage'), document.getElementById('poac-legend'), document.getElementById('poac-note'));
  shot(document.getElementById('shot-panel'));
  claw(document.getElementById('claw-fig'));
  viewerPanel(document.getElementById('vp'));
});

// ------------------------------------------------------------------------------------------------ tables
// Tables marked .cards become one card per row on a phone: each cell gets its column name as data-label.
function cardTables() {
  for (const t of document.querySelectorAll('table.params.cards')) {
    const heads = [...t.querySelectorAll('thead th')].map((th) => th.textContent.trim());
    for (const tr of t.querySelectorAll('tbody tr:not(.group)')) [...tr.children].forEach((td, i) => { td.dataset.label = heads[i] || ''; });
    // The shared layout adds a break chance after every _ and /; in these tables only / may break (claw_link stays whole).
    for (const w of t.querySelectorAll('code wbr')) if (w.previousSibling?.textContent?.endsWith('_')) w.remove();
  }
}

// ------------------------------------------------------------------------------------------------ Nereus clips
// Short loops, muted. They play while on screen (paused under reduced motion); one button pauses or plays.
function simClips() {
  const fig = document.getElementById('sim-fig');
  const video = fig.querySelector('#sim-video');
  const note = fig.querySelector('#sim-note');
  const btn = fig.querySelector('#sim-play');
  const notes = {
    'torpedo-side': 'From port, 8× slower than real time. The starboard torpedo leaves its tube and passes through the large fire hole 0.33 s later; the second torpedo stays in its tube.',
    'claw-bow': 'From the bow, in real time. The open claw is lowered over the nut and bolt, closes on it (claw_move_s −2) and lifts it off the table.',
  };
  let visible = false, userPaused = reduced;
  const sync = () => {
    if (visible && !userPaused) video.play().catch(() => {}); else video.pause();
  };
  video.addEventListener('play', () => { btn.textContent = 'Pause'; });
  video.addEventListener('pause', () => { btn.textContent = 'Play'; });
  btn.textContent = userPaused ? 'Play' : 'Pause';
  btn.addEventListener('click', () => { userPaused = !video.paused; sync(); });
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); }, { threshold: 0.4 }).observe(video);
  for (const b of fig.querySelectorAll('#sim-pick button')) {
    b.addEventListener('click', () => {
      for (const o of fig.querySelectorAll('#sim-pick button')) o.setAttribute('aria-pressed', String(o === b));
      const v = b.dataset.v;
      video.poster = `${BASE}video/actuators/${v}.jpg`;
      video.src = `${BASE}video/actuators/${v}.mp4`;
      note.textContent = notes[v];
      sync();
    });
  }
}

// ------------------------------------------------------------------------------------------------ launcher
// The POAC's torpedo/marker logic (ros_torp.c + actuator.c on master) next to Nereus's (mechanisms.cpp).
function launcher(root) {
  const fw = data.firmware;
  const cooldownMs = data.nereus.mechanisms.torpedo_launcher.parameters.cooldown_s * 1000;
  const E = data.status_enums;
  const SIM_T = data.nereus.status_map.torpedo_state.enum_map; // disarmed busy loaded empty -> numbers
  const SIM_D = data.nereus.status_map.dropper_state.enum_map;
  const S = { rules: 'fw', enabled: false, armed: false, torp: fw.torpedoes, mark: fw.markers, angle: fw.home_deg, move: null, cooldown: null, log: [], counted: [false, false] };
  const replyEl = root.querySelector('#lv-reply');
  const slotsEl = root.querySelector('#lv-slots');
  const statusEl = root.querySelector('#lv-status');
  const older = root.querySelector('#lv-older');
  const NAME = { arm: 'Arm', disarm: 'Disarm', torpedo: 'Fire torpedo', dropper: 'Drop marker', reload: 'Notify reload', kill: 'Kill' };

  // ---- dial (firmware only): 0-240 deg drawn as an arc, home at the top
  const W = 340, H = 186, cx = 170, cy = 112, R = 78;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'lv-svg', role: 'img', 'aria-label': 'Launcher servo angle' }, root.querySelector('#lv-dial'));
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
    const [x0, y0] = pol(d, R - 7), [x1, y1] = pol(d, R + 7);
    el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'lv-tick' }, svg);
    if (anchor === 'middle') {
      const t = el('text', { x: cx, y: cy - R - 13, 'text-anchor': 'middle', class: 'lv-mark' }, svg);
      t.textContent = `${name} ${d}°`;
    } else {
      const [tx, ty] = pol(d, R + 14);
      const t = el('text', { x: tx, y: ty - 2, 'text-anchor': anchor, class: 'lv-mark' }, svg);
      t.textContent = name;
      const a = el('text', { x: tx, y: ty + 13, 'text-anchor': anchor, class: 'lv-deg' }, svg);
      a.textContent = `${d}°`;
    }
  }
  const needle = el('line', { x1: cx, y1: cy, class: 'lv-needle' }, svg);
  el('circle', { cx, cy, r: 6, class: 'lv-hub' }, svg);
  const angleText = el('text', { x: cx, y: cy + 36, 'text-anchor': 'middle', class: 'lv-angle' }, svg);

  // ---- model
  const now = () => performance.now();
  const busy = () => (S.rules === 'fw' ? !!S.move : !!(S.cooldown && now() < S.cooldown.until));
  function say(cmd, ok, text, note, warn = false) {
    S.log.unshift({ cmd, ok, text, note, warn, rules: S.rules });
    S.log.length = Math.min(S.log.length, 6);
  }
  // Firmware move: out at 300 deg/s, 250 ms settle, home (asked as a 0 ms move: drawn fast), 250 ms settle.
  function startMove(target) {
    const from = S.angle;
    const outMs = (Math.abs(target - from) / fw.servo_max_dps) * 1000;
    const back = 120; // drawn duration of the "as fast as it can" return
    S.move = { t0: now(), from, target, outMs, back, total: outMs + fw.postmove_ms + back + fw.postmove_ms, torqueOff: !S.armed };
  }
  function cmd(c) {
    if (S.rules === 'fw') {
      if (c === 'arm') {
        if (S.armed) return say(c, false, 'Already Armed');
        if (!S.enabled) return say(c, false, 'Kill Switch Removed');
        S.armed = true;
        return say(c, true, '', 'Torque on: the servo confirmed it.');
      }
      if (c === 'disarm') { S.armed = false; return say(c, true, '', 'Torque off.'); }
      if (c === 'reload') {
        if (S.move) return say(c, false, 'Busy');
        S.torp = fw.torpedoes; S.mark = fw.markers; S.counted = [false, false];
        return say(c, true, '', `Counts back to ${fw.torpedoes}. Arming is unchanged.`);
      }
      if (c === 'torpedo') {
        if (!S.enabled) return say(c, false, 'Kill Switch Removed');
        if (!S.armed) return say(c, false, 'Not Armed');
        if (S.torp <= 0) return say(c, false, 'All Torpedos Fired');
        if (S.move) return say(c, false, 'Already Firing');
        const target = S.torp === 2 ? fw.torp_first_deg : fw.torp_second_deg;
        S.torp--;
        startMove(target);
        return say(c, true, '', `Servo to ${target}°, then home.`);
      }
      if (c === 'dropper') {
        if (S.mark <= 0) return say(c, false, 'All Dropped');
        const target = S.mark === 2 ? fw.marker_first_deg : fw.marker_second_deg;
        S.counted[2 - S.mark] = !S.armed;
        S.mark--;
        const why = [];
        if (!S.enabled) why.push('killed');
        if (!S.armed) why.push('disarmed');
        if (S.move) why.push('mid-move');
        startMove(target);
        if (!why.length) return say(c, true, '', `Servo to ${target}°, then home.`);
        return say(c, true, '', `Accepted although ${why.join(' and ')}: the dropper only checks the count. The move to ${target}° is sent and busy is true until it ends${S.armed ? '' : '; with torque off, whether the servo turns is up to the servo (dashed needle)'}.`, true);
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
        const v = f2(data.nereus.launch_speed_m_s[c === 'torpedo' ? 'torpedo_launcher' : 'dropper']);
        return say(c, true, 'Payload released', `Slot ${1 - S[key]} (${S[key] === 1 ? 'starboard' : 'port'}) leaves at ${v} m/s; ${cooldownMs / 1000} s cooldown.`);
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
  const entry = (l) => {
    const cls = l.cmd === 'kill' ? (l.warn ? 'warn' : 'info') : l.ok ? (l.warn ? 'warn' : 'ok') : 'no';
    const head = l.cmd === 'kill' ? '<b>Kill</b>' : `<b>${NAME[l.cmd]}</b> → ${l.ok ? 'accepted' : 'refused'}`;
    const why = l.text ? ` · ${l.rules === 'fw' ? 'cmd_feedback' : 'service reply'} “${esc(l.text)}”` : '';
    const note = l.note ? `<span>${l.warn ? '<strong>Unsafe:</strong> ' : ''}${esc(l.note)}</span>` : '';
    return { cls, html: `${head}${why}${note}` };
  };

  // ---- draw
  function draw() {
    const t = now();
    let phase = 'idle at home';
    if (S.rules === 'fw' && S.move) {
      const m = S.move, dt = t - m.t0;
      if (dt < m.outMs) { S.angle = m.from + (m.target - m.from) * (dt / m.outMs); phase = `turning to ${m.target}°`; }
      else if (dt < m.outMs + fw.postmove_ms) { S.angle = m.target; phase = `settling ${fw.postmove_ms} ms`; }
      else if (dt < m.outMs + fw.postmove_ms + m.back) { const k = (dt - m.outMs - fw.postmove_ms) / m.back; S.angle = m.target + (fw.home_deg - m.target) * k; phase = 'back home, full speed'; }
      else if (dt < m.total) { S.angle = fw.home_deg; phase = `settling ${fw.postmove_ms} ms`; }
      else { S.angle = fw.home_deg; S.move = null; phase = 'idle at home'; }
    }
    const sim = S.rules === 'sim';
    root.classList.toggle('sim', sim);
    const [nx, ny] = pol(S.angle, R - 14);
    needle.setAttribute('x2', nx); needle.setAttribute('y2', ny);
    svg.classList.toggle('torque', !sim && S.armed);
    svg.classList.toggle('ghost', !sim && !!S.move && S.move.torqueOff && !S.armed);
    angleText.textContent = `${Math.round(S.angle)}°`;

    // payload tiles (index 0 fires first) + the moving part
    const tiles = sim
      ? [['torp', 0, 'Torpedo', 'slot 0, stbd'], ['torp', 1, 'Torpedo', 'slot 1, port'], ['mark', 0, 'Marker', 'slot 0, stbd'], ['mark', 1, 'Marker', 'slot 1, port']]
      : [['torp', 0, 'Torpedo 1', `${fw.torp_first_deg}°`], ['torp', 1, 'Torpedo 2', `${fw.torp_second_deg}°`], ['mark', 0, 'Marker 1', `${fw.marker_first_deg}°`], ['mark', 1, 'Marker 2', `${fw.marker_second_deg}°`]];
    const left = { torp: S.torp, mark: S.mark };
    const cool = sim && busy() ? (S.cooldown.until - t) / cooldownMs : 0;
    slotsEl.innerHTML = `<div class="lv-tiles">${tiles.map(([k, i, name, sub]) => {
      const loaded = i >= 2 - left[k];
      const gone = k === 'torp' ? 'fired' : !sim && S.counted[i] ? 'counted' : 'dropped';
      return `<div class="lv-tile ${k}${loaded ? '' : ' empty'}"><b>${name}</b><span>${sub}</span><em>${loaded ? 'loaded' : gone}</em></div>`;
    }).join('')}</div>${sim
      ? `<div class="lv-cool${cool > 0 ? ' on' : ''}" aria-hidden="true">cooldown<i><span style="width:${(cool * 100).toFixed(1)}%"></span></i></div><p class="lv-phase">${cool > 0 ? `Shared cooldown: ${((cool * cooldownMs) / 1000).toFixed(2)} s left` : `No servo in Nereus: each slot releases directly, then a shared ${cooldownMs / 1000} s cooldown.`}</p>`
      : `<p class="lv-phase">Servo ${S.move && S.move.torqueOff && !S.armed && phase !== 'idle at home' ? `move sent with torque off: ${phase}` : phase} · torque ${S.armed ? 'on (armed)' : 'off (disarmed)'}</p>`}`;

    const st = status();
    const chip = (k, v, hot) => `<div${hot ? ' class="hot"' : ''}><dt>${k}</dt><dd>${v}</dd></div>`;
    statusEl.innerHTML = chip('armed', st.armed, st.armed)
      + chip('torpedo_state', nm('torpedo', st.ts)) + chip('torpedoes', S.torp)
      + chip('busy', st.b, st.b)
      + chip('dropper_state', nm('dropper', st.ds)) + chip('markers', S.mark);

    if (S.log.length) {
      const e = entry(S.log[0]);
      replyEl.className = `lv-reply ${e.cls}`;
      replyEl.innerHTML = e.html;
    } else {
      replyEl.className = 'lv-reply hint';
      replyEl.innerHTML = S.enabled ? 'Enabled. Tap <b>Arm</b>, then <b>Fire torpedo</b>.' : 'The robot is killed. Tap <b>Fire torpedo</b> to see it refused, then <b>Enabled</b>, <b>Arm</b> and fire.';
    }
    older.hidden = S.log.length < 2;
    older.querySelector('summary').textContent = `Earlier replies (${S.log.length - 1})`;
    older.querySelector('ol').innerHTML = S.log.slice(1).map((l) => { const e = entry(l); return `<li class="${e.cls}">${e.html}</li>`; }).join('');
  }
  let raf = 0;
  function loop() {
    cancelAnimationFrame(raf);
    if (reduced && S.move) S.move.t0 -= S.move.total; // jump to the end
    const step = () => {
      draw();
      if ((S.rules === 'fw' && S.move) || (S.rules === 'sim' && busy())) raf = requestAnimationFrame(step);
      else draw();
    };
    step();
  }
  root.querySelector('#lv-btns').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]');
    if (!b) return;
    cmd(b.dataset.cmd);
    loop();
  });
  for (const b of root.querySelectorAll('#lv-kill button')) {
    b.addEventListener('click', () => {
      const on = b.dataset.k === '1';
      for (const o of root.querySelectorAll('#lv-kill button')) o.setAttribute('aria-pressed', String(o === b));
      if (on === S.enabled) return;
      S.enabled = on;
      if (!on && S.armed) {
        if (S.rules === 'sim') { S.armed = false; say('kill', true, '', 'Nereus disarms everything on a kill.'); }
        else say('kill', true, '', 'still armed. The POAC does not disarm on a kill (a TODO in safety_handle_kill).', true);
      }
      loop();
    });
  }
  for (const b of root.querySelectorAll('#lv-rules button')) {
    b.addEventListener('click', () => {
      for (const o of root.querySelectorAll('#lv-rules button')) o.setAttribute('aria-pressed', String(o === b));
      Object.assign(S, { rules: b.dataset.r, armed: false, torp: 2, mark: 2, move: null, cooldown: null, angle: fw.home_deg, log: [], counted: [false, false] });
      loop();
    });
  }
  draw();
}

// ------------------------------------------------------------------------------------------------ POAC parts
async function poac(stage, legend, note) {
  const hot = await fetch(BASE + 'data/boards/hotspots.json').then((r) => r.json());
  const spots = Object.fromEntries(hot.boards.poac.top.spots.map((s) => [s.ref, s]));
  const fw = data.firmware;
  const img = stage.querySelector('img');
  const IW = Number(img.getAttribute('width')), IH = Number(img.getAttribute('height'));
  // [ref, name, one line, detail, badge position (fractions of the image)]
  const items = [
    ['J6', 'Camera-cage link', 'CAN in from the Orin', 'The Orin\'s CAN leaves on the camera-cage board\'s J10 (ORIN CAN), and that board\'s link to the POAC lands here. 15 V and 5 V go the other way, out to the camera cage. J5 to its left (Stack link) passes the same bus and power on to the other boards in the port stack.', [0.318, 0.26]],
    ['U2C', 'CAN transceiver', 'bus voltages to logic', 'Turns the bus\'s two-wire voltages into logic levels for the controller next to it.', [0.37, 0.52]],
    ['U1C', 'CAN controller', 'holds frames for the RP2040', 'An MCP2517FD. It buffers CAN frames; the RP2040 reads them over SPI.', [0.215, 0.50]],
    ['U1R', 'RP2040', 'runs the actuator code', `The board's microcontroller: the micro-ROS client and the actuator code (ros_torp.c, actuator.c). Its programmable I/O makes the servo's one-wire serial link on GPIO ${fw.servo_pin}, ${fw.baud} baud.`, [0.07, 0.56]],
    ['PS1', '15 V regulator', 'fed before the kill switch', 'Fed from the battery bus ahead of the kill switch, so a kill doesn\'t cut it. The servo supply comes off this rail.', [0.575, 0.06]],
    ['U2', '12 V regulator', 'servo power only', 'A MIC29300-12 that makes 12 V from 15 V for one thing only: the servo connector.', [0.70, 0.20]],
    ['LID_CONN1', 'Servo connector', 'out to the launcher servo', '12 V, ground, the servo\'s data line and a check line go out through the hull lid to the launcher servo.', [0.885, 0.19]],
  ].filter((it) => spots[it[0]]);
  const svg = el('svg', { viewBox: `0 0 ${IW} ${IH}`, class: 'poac-svg' }, stage);
  const marks = items.map(([ref, name], i) => {
    const s = spots[ref];
    const px = s.x * IW, py = s.y * IH, r = Math.min(Math.max(s.r * IW, 18), py - 6);
    const [bx, by] = [items[i][4][0] * IW, items[i][4][1] * IH];
    const g = el('g', { class: 'poac-mark', tabindex: 0, role: 'button', 'aria-label': `${i + 1}: ${name}` }, svg);
    const ring = el('circle', { cx: px, cy: py, r, class: 'ring' }, g);
    const lead = el('line', { class: 'lead' }, g);
    const hit = el('circle', { cx: bx, cy: by, class: 'hit' }, g);
    const badge = el('circle', { cx: bx, cy: by, class: 'badge' }, g);
    const num = el('text', { x: bx, y: by, class: 'num', 'text-anchor': 'middle', 'dominant-baseline': 'central' }, g);
    num.textContent = i + 1;
    g.addEventListener('click', () => select(i));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    return { g, ring, lead, hit, badge, num, px, py, r, bx, by };
  });
  // Badges and their tap targets stay the same size on screen whatever the image's width.
  function size() {
    const k = IW / (stage.clientWidth || IW);
    for (const m of marks) {
      m.badge.setAttribute('r', 12 * k);
      m.hit.setAttribute('r', 22 * k);
      m.num.style.fontSize = `${13 * k}px`;
      m.ring.style.strokeWidth = 2.5 * k;
      m.lead.style.strokeWidth = 2 * k;
      const dx = m.bx - m.px, dy = m.by - m.py, d = Math.hypot(dx, dy);
      const gap = m.r + 2 * k, end = d - 12 * k;
      if (end > gap) {
        Object.entries({ x1: m.px + (dx / d) * gap, y1: m.py + (dy / d) * gap, x2: m.px + (dx / d) * end, y2: m.py + (dy / d) * end }).forEach(([a, v]) => m.lead.setAttribute(a, v));
        m.lead.style.display = '';
      } else m.lead.style.display = 'none';
    }
  }
  new ResizeObserver(size).observe(stage);
  legend.innerHTML = items.map(([, name, line], i) => `<li><button type="button" data-i="${i}"><span class="n">${i + 1}</span><b>${esc(name)}</b><span class="line">${esc(line)}</span></button></li>`).join('');
  const rows = [...legend.querySelectorAll('button')];
  rows.forEach((b, i) => b.addEventListener('click', () => select(i)));
  function select(i) {
    marks.forEach((m, j) => m.g.classList.toggle('on', i === j));
    rows.forEach((b, j) => b.setAttribute('aria-pressed', String(i === j)));
    const [ref, name, , text] = items[i];
    note.innerHTML = `<b>${i + 1}. ${esc(name)}</b> <code>${esc(ref)}</code>. ${esc(text)}`;
  }
  size();
  select(items.findIndex((it) => it[0] === 'U1R'));
}

// ------------------------------------------------------------------------------------------------ shot timeline
function shot(root) {
  const fw = data.firmware, tr = data.translator, tree = data.tree;
  const out1 = ((fw.torp_first_deg - fw.home_deg) / fw.servo_max_dps) * 1000;
  // Firmware-side times (ms from the tree's call). UART read-back ~30 ms is two 10 ms ticks plus the reply.
  const tWrite = 30, tOutEnd = tWrite + out1, tIdle = tOutEnd + fw.postmove_ms + 30 + fw.postmove_ms;
  const tReply = fw.cmd_status_ms, tTrans = tr.feedback_period_s * 1000;
  const tWaitEnd = tTrans + tree.fire_torpedo.wait_s * 1000;
  const statusTicks = [300, 800, 1300, 1800];
  const ms = (t) => (t >= 1000 ? `${(t / 1000).toFixed(2)} s` : `${Math.round(t)} ms`);
  const sec = (t) => `${(Math.abs(t) < 0.005 ? 0 : t).toFixed(2).replace('-', '−')} s`;

  const ROBOT = {
    zero: 'ms after the tree\'s call',
    lanes: [['tree', 'Tree', '--state'], ['tr', 'Translator', '--s7'], ['poac', 'CAN + POAC', '--s4'], ['servo', 'Servo', '--prediction'], ['status', 'Status', '--ink-2']],
    fmt: ms,
    steps: [
      { lane: 'tree', a: 0, b: tTrans, title: 'The tree calls the service',
        body: `<code>FireTorpedo</code> runs <code>CallTriggerService</code> on <code>command/actuator/torpedo</code>. It waits up to 1 s for the server to exist, then up to ${tree.fire_torpedo.time_limit_s} s for the answer.`,
        code: '<Action ID="CallTriggerService" srv_name="{torpedo_srv}" time_limit_secs="1"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'RepairCompMpcTree.xml') },
      { lane: 'tr', a: 0, b: tTrans, title: 'The translator publishes and waits',
        body: `<code>actuator_service_translator</code> publishes an empty message on the topic of the same name, then sleeps in ${ms(tTrans)} steps until <code>state/actuator/cmd_status</code> arrives. There is no timeout.`,
        code: 'publisher.publish(Empty())\nself.await_data = True\nwhile (self.await_data):\n    sleep(self.FEEDBACK_PERIOD)   # 0.2 s\nreturn self.feedback',
        src: link(`${RC}/riptide_hardware/riptide_hardware2/actuator_service_translator.py${range(L.translator.wait)}`, 'actuator_service_translator.py') },
      { lane: 'poac', a: 2, b: 8, title: 'micro-ROS carries it over CAN',
        body: 'The <code>copro_agent</code> on the Orin forwards the message to the POAC\'s micro-ROS client over the internal CAN bus (<code>can0</code>). A few milliseconds; not measured.',
        code: 'micro_ros_agent can -D can0 -v4 -m rmw',
        src: link(`${RC}/riptide_hardware/launch/copro_agent.launch.py`, 'copro_agent.launch.py') },
      { lane: 'poac', a: 8, b: tWrite, title: 'The firmware checks, then moves the servo',
        body: `<code>torpedo_fire()</code> refuses if the robot is killed, not armed, out of torpedoes or already moving. Otherwise it queues a move to ${fw.torp_first_deg}° (${fw.torp_second_deg}° for the second torpedo) and counts one torpedo gone. Packets leave on the next ${fw.uart_tick_ms} ms tick and are read back.`,
        code: 'if (safety_kill_get_asserting_kill()) { *errMsgOut = "Kill Switch Removed"; return false; }\nif (!enabled)     { *errMsgOut = "Not Armed"; return false; }\nif (num_torp <= 0) { *errMsgOut = "All Torpedos Fired"; return false; }\nif (move_active)  { *errMsgOut = "Already Firing"; return false; }\nservo_set_deg_then_home(TORP_2_DEG);   // 200 deg, first torpedo\nnum_torp--;',
        src: link(`${TF}/actuators/ros_torp.c${range(L.ros_torp.torpedo_fire)}`, 'ros_torp.c') },
      { lane: 'servo', a: tWrite, b: tOutEnd, title: `The servo turns ${fw.home_deg}° → ${fw.torp_first_deg}°`,
        body: `The move time is planned from the firmware's ${fw.servo_max_dps}°/s: ${fw.torp_first_deg - fw.home_deg}° takes ${ms(out1)} (the second torpedo, ${fw.torp_second_deg - fw.home_deg}°, ${ms(((fw.torp_second_deg - fw.home_deg) / fw.servo_max_dps) * 1000)}). On the way the pushing arm releases the spring and the torpedo leaves. <code>busy</code> is true from here.`,
        code: 'uint16_t target = deg * (1000.0 / 240.0);\nuint16_t move_time_ms = fabs(deg - curr_deg) * (1.0 / SERVO_MAX_DPS) * 1000;',
        src: link(`${TF}/actuators/actuator.c${range(L.actuator.set_deg)}`, 'actuator.c') },
      { lane: 'poac', a: tReply, b: 2 * tReply, point: true, title: 'The answer goes back',
        body: `The board publishes <code>cmd_status</code> (true) on its next ${fw.cmd_status_ms} ms tick. The translator only looks after its first ${ms(tTrans)} sleep, so the tree gets <code>success: true</code> at about ${ms(tTrans)} (${ms(2 * tTrans)} if the reply is late), and its node turns SUCCESS.`,
        code: '#define SERVO_UPDATE_CMD_STATUS_PERIOD_MS 100',
        src: link(`${TF}/main.c${range(L.main.timers)}`, 'main.c') },
      { lane: 'tree', a: tTrans, b: tWaitEnd, title: `The tree waits ${tree.fire_torpedo.wait_s} s`,
        body: `<code>FireTorpedo</code> then waits a flat ${tree.fire_torpedo.wait_s} s, long after the servo is home. The <code>WaitForActuators</code> after it was meant to poll <code>busy</code>, but it fails at once: its timeout is read from the blackboard key "10", which <code>FireTorpedo</code> never sets. The <code>ForceSuccess</code> around the shot hides that, so the shot is over for the tree at about ${ms(tWaitEnd)} (<a href="mission-tree.html#watch">Things to watch</a>).`,
        code: '<Action ID="Wait" seconds="2"/>\n<SubTree ID="WaitForActuators" __shared_blackboard="false" timeout_secs="10"/>\n<!-- "10" names a blackboard key; nothing in FireTorpedo sets it -->',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
      { lane: 'servo', a: tOutEnd, b: tIdle, title: 'Settle, go home, settle',
        body: `${fw.postmove_ms} ms after the planned move ends, an alarm sends it home to ${fw.home_deg}°, as fast as the servo can go. Another ${fw.postmove_ms} ms and <code>busy</code> drops, about ${ms(tIdle)} after the call.`,
        code: 'move_complete_alarm = add_alarm_in_ms(curr_move_time_ms + SERVO_POSTMOVE_DELAY_MS, ...);\n// servo_move_complete_cb: move_active = false; servo_read_deg(); servo_go_home();',
        src: link(`${TF}/actuators/actuator.c${range(L.actuator.complete)}`, 'actuator.c') },
      { lane: 'status', ticks: statusTicks, a: statusTicks[0], b: statusTicks[2], title: 'Status lags behind',
        body: `<code>state/actuator/status</code> and <code>busy</code> go out every ${fw.status_ms} ms, so anything watching sees the shot up to half a second late. Here (one possible phase) <code>busy</code> reads true at ${ms(statusTicks[0])} and ${ms(statusTicks[1])}, false from ${ms(statusTicks[2])}.`,
        code: '#define ACTUATOR_STATUS_TIME_MS 500',
        src: link(`${TF}/actuators/ros_torp.c${range(L.ros_torp.status)}`, 'ros_torp.c') },
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
    zero: 's from the torpedo\'s release',
    lanes: [['tree', 'Tree', '--state'], ['br', 'Nereus bridge', '--s7'], ['launch', 'Launcher', '--prediction'], ['torp', 'Torpedo', '--s8']],
    fmt: sec,
    steps: [
      { lane: 'tree', a: settle, b: firstCall, title: 'Lined up and settled',
        body: `<code>WaitForController</code> has been checking once a second that the controller's trust is above ${tree.shoot.scale_trust} and that <code>torpedo_0_link</code> is within ${tree.shoot.ctrler_dist * 100} cm of the hole's axis, ${tree.shoot.shoot_prox} m out. It passes, and the tree moves on to fire.`,
        code: '<SubTree ID="WaitForController" dist="ctrler_dist" link_frame="link_1" target_frame="object_1_frame" trust="scale_trust"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.ShootBothObjectsMpc)}`, 'ShootBothObjectsMpc') },
      { lane: 'tree', a: firstCall, b: waitStart, title: 'Service call and answer',
        body: `The same <code>CallTriggerService</code> as on the robot. The answer came back in ${Math.round((waitStart - firstCall) * 1000)} ms (the logger's resolution is a few ms): the bridge answers itself instead of waiting for a board.`,
        code: '<Action ID="CallTriggerService" srv_name="{torpedo_srv}" time_limit_secs="1"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
      { lane: 'br', a: 0, b: 0, point: true, title: 'The bridge fires the launcher',
        body: 'The service maps to <code>mechanisms.torpedo_launcher.fire</code>. It checks arming and kill, the shared cooldown and the ammunition, then releases <code>slot_0</code> as a free body. The task log has it as <code>torpedo released, slot 0</code>.',
        code: '- id: fire_torpedo\n  service: command/actuator/torpedo\n  action: \'command:mechanisms.torpedo_launcher.fire\'',
        src: link(`${NE}/content/packs/bridges/uwrt_talos/bridge.yaml${range(L.bridge.services)}`, 'bridge.yaml') },
      { lane: 'launch', a: 0, b: mech.cooldown_s, title: `${mech.cooldown_s} s cooldown`,
        body: `Torpedoes and markers share one cooldown group, standing in for the single servo. <code>busy</code> is true for ${mech.cooldown_s} s, shorter than the robot's servo cycle.`,
        code: `cooldown_s: ${mech.cooldown_s}\ncooldown_group: ${mech.cooldown_group}`,
        src: link(`${NE}/content/packs/robots/talos/robot.yaml${range(L.robot_yaml.mechanisms)}`, 'robot.yaml') },
      { lane: 'torp', a: 0, b: hit[0], title: `Flight: ${Math.round(hit[0] * 1000)} ms to the hole`,
        body: `The torpedo leaves at ${f2(data.nereus.launch_speed_m_s.torpedo_launcher)} m/s (a ${mech.launch.spring_energy_j} J spring into ${(mech.projectile.mass_kg * 1000).toFixed(1)} g plus added mass), turns under drag and buoyancy, and passes through <code>${esc(hit[2].target)}</code> ${Math.round(hit[0] * 1000)} ms later.`,
        code: `launch: {spring_energy_j: ${mech.launch.spring_energy_j}}   # speed = sqrt(2E / (m + m_added)) + vehicle velocity`,
        src: link(`${NE}/libraries/session/src/mechanisms.cpp`, 'mechanisms.cpp') },
      { lane: 'tree', a: waitStart, b: waitEnd, title: `The tree waits ${tree.fire_torpedo.wait_s} s`,
        body: `Then <code>WaitForActuators</code> fails at once, for the same reason as on the robot (its timeout key is never set), and <code>FireTorpedo</code> ends ${sec(waitEnd)} after the release. The tree slides across to the second hole.`,
        code: '<Action ID="Wait" seconds="2"/>\n<SubTree ID="WaitForActuators" __shared_blackboard="false" timeout_secs="10"/>',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
      { lane: 'tree', a: reset, b: after2, point2: call2, title: 'The second shot is refused, silently',
        body: `At ${sec(reset)} the tasks are reset (the scorecard run was being started by hand), which reloads and disarms. The second call, ◆ at ${sec(call2)}, is refused at once, but the <code>ForceSuccess</code> around <code>FireTorpedo</code> turns that into success: ${Math.round((after2 - call2) * 1000)} ms later the tree is disarming, then it heads for the table as if it had fired.`,
        code: '<BehaviorTree ID="FireTorpedo">\n  <ForceSuccess name="REMOVE ME"> ...',
        src: link(`${RA}/trees/RepairCompMpcTree.xml${range(L.tree.FireTorpedo)}`, 'FireTorpedo') },
    ],
  };

  const box = root.querySelector('#shot-gantt');
  const card = root.querySelector('#shot-card');
  const count = root.querySelector('#shot-count');
  let mode = ROBOT, sel = 0;
  const laneOf = (s) => mode.lanes.find((l) => l[0] === s.lane);

  function cardHTML(s, withTitle) {
    const when = s.a === s.b ? mode.fmt(s.a) : `${mode.fmt(s.a)} → ${mode.fmt(s.b)}`;
    return `<div class="shot-when">Step ${sel + 1} of ${mode.steps.length} · ${when} ${mode === SIM ? 'from the release' : 'after the call'}</div>
      ${withTitle ? `<h3>${s.title}</h3>` : ''}<p>${s.body}</p><pre><code>${esc(s.code)}</code></pre><div class="src">Source: ${s.src}</div>`;
  }

  // Phone: a vertical list of steps; the selected one opens in place.
  function drawList() {
    const ol = document.createElement('ol');
    ol.className = 'shot-steps';
    mode.steps.forEach((s, i) => {
      const [, name, color] = laneOf(s);
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="shot-row" aria-expanded="${i === sel}"><span class="t">${mode.fmt(s.a)}</span><span class="lane" style="--c: var(${color})">${name}</span><span class="ti"><span class="n">${i + 1}.</span> ${s.title}</span></button>`;
      li.firstChild.addEventListener('click', () => select(i));
      if (i === sel) { card.innerHTML = cardHTML(s, false); li.appendChild(card); }
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  // Wide screens: a Gantt chart. The robot's axis is broken: its first 300 ms get 42% of the width.
  function drawGantt(w) {
    const labW = 108, padR = 16, laneH = 40, top = 8, axisH = 40;
    const H = top + mode.lanes.length * laneH + axisH;
    const svg = el('svg', { viewBox: `0 0 ${w} ${H}`, width: w, height: H, class: 'chart shot-svg', role: 'img', 'aria-label': 'Torpedo shot timeline' }, box);
    const pw = w - labW - padR;
    let x, ticks, brk = null;
    if (mode === ROBOT) {
      const split = 300, end = 2400, fa = 0.42, gap = 14;
      const xa = (t) => labW + (t / split) * pw * fa;
      const xb = (t) => labW + pw * fa + gap + ((t - split) / (end - split)) * (pw * (1 - fa) - gap);
      x = (t) => (t <= split ? xa(t) : xb(t));
      ticks = [[0, '0'], [100, '100 ms'], [200, '200 ms'], [300, '300 ms'], [1000, '1 s'], [1500, '1.5 s'], [2000, '2 s']];
      brk = labW + pw * fa + gap / 2;
    } else {
      const [d0, d1] = [-1.3, 7.6];
      x = (t) => labW + ((t - d0) / (d1 - d0)) * pw;
      ticks = [];
      for (let t = -1; t <= 7; t++) ticks.push([t, t === 0 ? '0' : `${t} s`]);
    }
    const laneY = Object.fromEntries(mode.lanes.map(([id], i) => [id, top + i * laneH]));
    const bottom = top + mode.lanes.length * laneH;
    mode.lanes.forEach(([id, name, color]) => {
      const y = laneY[id];
      el('rect', { x: labW, y: y + 2, width: pw, height: laneH - 4, class: 'lane-bg' }, svg);
      el('rect', { x: 2, y: y + laneH / 2 - 5, width: 10, height: 10, rx: 2, fill: css(color) }, svg);
      const t = el('text', { x: 17, y: y + laneH / 2 + 4.5, class: 'lane-lab' }, svg);
      t.textContent = name;
    });
    const g = el('g', { class: 'axis' }, svg);
    for (const [t, lab] of ticks) {
      el('line', { x1: x(t), x2: x(t), y1: top, y2: bottom, class: t === 0 ? 'zero' : 'gridline' }, g);
      const tx = el('text', { x: x(t), y: bottom + 16, 'text-anchor': 'middle' }, g);
      tx.textContent = lab;
    }
    if (brk !== null) {
      el('rect', { x: brk - 5, y: top, width: 10, height: bottom - top, class: 'brk-band' }, svg);
      for (const dx of [-3, 3]) el('line', { x1: brk + dx - 3, x2: brk + dx + 3, y1: bottom + 5, y2: bottom - 5, class: 'brk' }, svg);
    }
    const zt = el('text', { x: labW, y: bottom + 34, class: 'axis-title' }, svg);
    zt.textContent = mode === ROBOT ? 'Time after the tree\'s service call (first 300 ms stretched)' : 'Seconds from the torpedo\'s release';
    const lastNum = {};
    const badges = [];
    mode.steps.forEach((s, i) => {
      const color = css(laneOf(s)[2]);
      const y = laneY[s.lane] + 20, h = 14;
      const grp = el('g', { class: `step${i === sel ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Step ${i + 1}: ${s.title}` }, svg);
      const hitR = el('rect', { x: x(s.a) - 6, y: laneY[s.lane], width: Math.max(12, x(s.b) - x(s.a) + 12), height: laneH, class: 'hit' }, grp);
      hitR.style.fill = 'transparent';
      const dia = (t, c, k = 0) => el('path', { d: `M${x(t)},${y - 1 - k} l6,${h / 2 + 1 + k} l-6,${h / 2 + 1 + k} l-6,${-(h / 2 + 1 + k)}z`, fill: c, class: 'bar' }, grp);
      if (s.ticks) {
        for (const t of s.ticks) el('rect', { x: x(t) - 2, y, width: 4, height: h, rx: 1, fill: color, class: 'bar' }, grp);
      } else if (s.point) {
        dia(s.a, color);
        if (s.b !== s.a) {
          el('line', { x1: x(s.a), x2: x(s.b), y1: y + h / 2, y2: y + h / 2, stroke: color, 'stroke-width': 2, 'stroke-dasharray': '3 3', class: 'bar' }, grp);
          dia(s.b, color);
        }
      } else {
        el('rect', { x: x(s.a), y, width: Math.max(4, x(s.b) - x(s.a)), height: h, rx: 3, fill: color, class: 'bar' }, grp);
        if (s.point2 !== undefined) dia(s.point2, css('--ink'), 2);
      }
      let nx = Math.max(labW + 11, Math.min(x(s.a), w - padR - 11));
      if (lastNum[s.lane] !== undefined && nx < lastNum[s.lane] + 24) nx = lastNum[s.lane] + 24;
      lastNum[s.lane] = nx;
      badges.push([i, nx, laneY[s.lane] + 9]);
      grp.addEventListener('click', () => select(i));
      grp.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i); } });
    });
    for (const [i, nx, cy] of badges) {
      const b = el('g', { class: `num${i === sel ? ' on' : ''}` }, svg);
      el('rect', { x: nx - 16, y: cy - 16, width: 32, height: 32, class: 'hit' }, b).style.fill = 'transparent';
      el('circle', { cx: nx, cy, r: 9 }, b);
      const t = el('text', { x: nx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, b);
      t.textContent = i + 1;
      b.addEventListener('click', () => select(i));
    }
    card.innerHTML = cardHTML(mode.steps[sel], true);
    box.after(card);
  }

  function draw() {
    box.innerHTML = '';
    const w = box.clientWidth || 600;
    root.classList.toggle('list', w < 640);
    if (w < 640) drawList(); else drawGantt(w);
  }
  function select(i) {
    sel = Math.max(0, Math.min(mode.steps.length - 1, i));
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
// Nereus's timed claw (mechanisms.cpp): each jaw moves at jaw speed toward fully open or closed until the timer ends.
function claw(fig) {
  const p = data.nereus.mechanisms.claw.parameters;
  const minGap = p.min_gap_m * 1000, maxGap = p.max_gap_m * 1000, speed = p.jaw_speed_m_s * 1000; // mm, mm/s per jaw
  const travel = (maxGap - minGap) / 2;
  const OBJ = 60; // an example object, mm wide
  const box = fig.querySelector('#claw-svg'), note = fig.querySelector('#claw-note'), bar = fig.querySelector('#claw-bar');
  const stepsEl = fig.querySelector('#claw-steps');
  const S = { q: 0, dir: 0, remain: null, total: 1, cmd: null, obj: 'table', objY: 0, last: 0 };
  const SEQ = [[2, 'Open 2.0 s'], [-2, 'Close 2.0 s'], [0.3, 'Drop 0.3 s'], [-2, 'Close 2.0 s']];
  stepsEl.innerHTML = SEQ.map(([, l]) => `<li>${l}</li>`).join('');

  const W = 360, H = 250, cx = 180;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'claw-svg', role: 'img', 'aria-label': 'Claw seen from the bow: two racks on a pinion, each moving one jaw' }, box);
  const teeth = (x0, x1, y, dir) => { let d = `M${x0},${y}`; for (let x = x0; x + 8 <= x1; x += 8) d += ` l2,${dir * 5} l4,0 l2,${-dir * 5}`; return d; };
  // The two racks sit at different depths (one behind the other), so the back one is drawn first and paler.
  const rackBot = el('g', { class: 'back' }, svg);
  el('rect', { x: -110, y: 76, width: 150, height: 11, rx: 2, class: 'claw-rack' }, rackBot);
  el('path', { d: `${teeth(-110, 40, 76, -1)}`, class: 'claw-teeth' }, rackBot);
  el('rect', { x: 38, y: 76, width: 10, height: 26, rx: 2, class: 'claw-rack' }, rackBot);
  const rackTop = el('g', {}, svg);
  el('rect', { x: -40, y: 30, width: 150, height: 11, rx: 2, class: 'claw-rack' }, rackTop);
  el('path', { d: `${teeth(-40, 110, 41, 1)}`, class: 'claw-teeth' }, rackTop);
  el('rect', { x: -48, y: 30, width: 10, height: 72, rx: 2, class: 'claw-rack' }, rackTop);
  const pinion = el('g', {}, svg);
  let gear = '';
  for (let k = 0; k < 10; k++) {
    const a0 = (k / 10) * 2 * Math.PI, a1 = a0 + 0.2, a2 = a0 + 0.38, a3 = a0 + 0.58;
    const P = (a, r) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
    gear += `${k ? 'L' : 'M'}${P(a0, 13)} L${P(a1, 18.5)} L${P(a2, 18.5)} L${P(a3, 13)} `;
  }
  el('path', { d: `${gear}Z`, class: 'claw-pinion' }, pinion);
  el('line', { x1: 0, y1: 0, x2: 10, y2: 0, class: 'claw-spoke' }, pinion);
  el('circle', { r: 3, class: 'claw-hub' }, pinion);
  const jawL = el('path', { class: 'claw-jaw' }, svg);
  const jawR = el('path', { class: 'claw-jaw' }, svg);
  el('line', { x1: 20, x2: W - 20, y1: 238, y2: 238, class: 'claw-table' }, svg);
  const obj = el('g', { class: 'claw-obj' }, svg);
  el('rect', { x: cx - OBJ / 2, y: 0, width: OBJ, height: 48, rx: 6 }, obj);
  const objText = el('text', { x: cx, y: 29, 'text-anchor': 'middle' }, obj);
  objText.textContent = `${OBJ} mm`;
  const readout = document.createElement('div');
  readout.className = 'claw-readout';
  box.prepend(readout);
  // jaw: gripping face at x = edge, from y 100 down to 186; outer side slants in.
  const jaw = (edge, s) => `M${edge},100 L${edge},186 L${edge + s * 12},186 L${edge + s * 50},100 Z`;

  function draw() {
    const gap = minGap + 2 * S.q;
    const xL = cx - gap / 2, xR = cx + gap / 2;
    jawL.setAttribute('d', jaw(xL, -1));
    jawR.setAttribute('d', jaw(xR, 1));
    rackTop.setAttribute('transform', `translate(${xL},0)`);
    rackBot.setAttribute('transform', `translate(${xR},0)`);
    pinion.setAttribute('transform', `translate(${cx},58.5) rotate(${(-(S.q / 16) * 180) / Math.PI})`);
    const y = S.obj === 'table' ? 189 : S.obj === 'gone' ? 400 : S.obj === 'falling' ? 132 + S.objY : 132;
    obj.setAttribute('transform', `translate(0,${y})`);
    obj.classList.toggle('held', S.obj === 'held');
    obj.style.opacity = S.obj === 'falling' ? Math.max(0, 1 - S.objY / 90) : S.obj === 'gone' ? 0 : 1;
    readout.innerHTML = `Gap <b>${gap.toFixed(gap < 10 ? 1 : 0)} mm</b>`;
    bar.style.width = S.remain !== null ? `${(100 * (1 - S.remain / S.total)).toFixed(1)}%` : '0%';
    bar.parentElement.parentElement.classList.toggle('on', S.remain !== null);
    const state = S.dir === 0 ? (S.q <= 0.01 ? 'closed' : S.q >= travel - 0.01 ? 'fully open' : 'stopped') : S.dir > 0 ? 'opening' : (S.obj === 'held' ? 'closing, stalled on the object' : 'closing');
    note.innerHTML = S.cmd === null
      ? `Starts closed (gap ${minGap} mm), as in Nereus, above an object ${OBJ} mm wide. Full open takes ${(travel / speed).toFixed(1)} s.`
      : S.cmd === '0.0'
        ? `<b>claw_move_s 0</b>: Nereus stops at once. On the robot's branch firmware 0 is a divide by zero (<a href="#claw-zero">see the bench section</a>).`
        : `<b>claw_move_s ${S.cmd}</b>: ${state}${S.remain !== null ? `, ${(S.remain / 1000).toFixed(1)} s left on the timer` : ''}.`;
  }
  let raf = 0, done = null;
  function run() {
    cancelAnimationFrame(raf);
    S.last = performance.now();
    const step = (t) => {
      const dt = Math.min(100, t - S.last); S.last = t;
      if (S.remain !== null) { S.remain -= dt; if (S.remain <= 0) { S.dir = 0; S.remain = null; } }
      if (S.dir !== 0) {
        let q = S.q + (S.dir * speed * dt) / 1000;
        q = Math.max(0, Math.min(travel, q));
        const g = minGap + 2 * q;
        if (S.obj === 'between' && S.dir < 0 && g <= OBJ) { q = (OBJ - minGap) / 2; S.obj = 'held'; }
        if (S.obj === 'held' && S.dir < 0) q = (OBJ - minGap) / 2;
        if (S.obj === 'held' && S.dir > 0 && g > OBJ + 4) { S.obj = 'falling'; S.objY = 0; }
        S.q = q;
      }
      if (S.obj === 'falling') { S.objY += dt * 0.25; if (S.objY > 90) S.obj = 'gone'; }
      draw();
      if (S.dir !== 0 || S.remain !== null || S.obj === 'falling') raf = requestAnimationFrame(step);
      else if (done) { const f = done; done = null; f(); }
    };
    raf = requestAnimationFrame(step);
  }
  function command(s) {
    S.cmd = s.toFixed(1);
    if (s === 0) { S.dir = 0; S.remain = null; }
    else { S.dir = s > 0 ? 1 : -1; S.remain = S.total = Math.abs(s) * 1000; }
    if (reduced && S.dir !== 0) {
      const d = Math.min(S.dir > 0 ? travel - S.q : S.q, (speed * S.remain) / 1000);
      S.q += S.dir * d;
      if (S.obj === 'between' && S.dir < 0 && minGap + 2 * S.q <= OBJ) { S.q = (OBJ - minGap) / 2; S.obj = 'held'; }
      else if (S.obj === 'held' && S.dir > 0) S.obj = 'gone';
      S.dir = 0; S.remain = null; draw();
      if (done) { const f = done; done = null; f(); }
    } else run();
    draw();
  }
  let token = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
  const exec = (s) => new Promise((r) => { done = r; command(s); });
  const mark = (k) => [...stepsEl.children].forEach((li, j) => { li.classList.toggle('on', j === k); li.classList.toggle('done', j < k); });
  async function sequence() {
    const my = ++token;
    if (S.obj === 'gone' || S.obj === 'falling') S.obj = 'table';
    for (let k = 0; k < SEQ.length; k++) {
      if (my !== token) return;
      mark(k);
      if (k === 1) { S.obj = minGap + 2 * S.q > OBJ ? 'between' : 'table'; draw(); await wait(500); if (my !== token) return; }
      await exec(SEQ[k][0]);
      if (my !== token) return;
      await wait(500);
    }
    if (my !== token) return;
    mark(SEQ.length);
    await wait(1200);
    if (my !== token) return;
    if (S.obj === 'gone') { S.obj = 'table'; draw(); }
  }
  fig.querySelector('#claw-seq').addEventListener('click', () => sequence());
  fig.querySelector('#claw-ctl').addEventListener('click', (e) => {
    const b = e.target.closest('[data-s]');
    if (!b) return;
    token++; done = null; mark(-1);
    if (S.obj === 'gone') S.obj = 'table';
    if (S.obj === 'table' && Number(b.dataset.s) < 0 && minGap + 2 * S.q > OBJ) S.obj = 'between';
    command(Number(b.dataset.s));
  });
  draw();
}

// ------------------------------------------------------------------------------------------------ viewer panel
// The Actuators panel from talos_uwrt_panels.yaml, redrawn, as it behaves on the robot (POAC master) or in Nereus.
function viewerPanel(root) {
  const cmds = data.viewer_commands;
  const mock = root.querySelector('#vp-mock'), note = root.querySelector('#vp-note');
  const S = { world: 'robot', armed: false, sel: null, torp: 2, mark: 2 };
  const robot = () => S.world === 'robot';
  const claw0 = 'no POAC build listens to <code>command/actuator/claw</code>, so nothing happens';
  const what = {
    arm: () => `Publishes <code>command/actuator/arm</code> = ${S.armed ? 'false: torque off' : 'true: arms, unless the robot is killed'}.`,
    torpedo: () => 'Publishes <code>command/actuator/torpedo</code>: fires the next torpedo if armed, not killed and idle.',
    dropper: () => (robot()
      ? 'Publishes <code>command/actuator/dropper</code>. The POAC checks only the count, so the button being grey is the only guard.'
      : 'Publishes <code>command/actuator/dropper</code>. Nereus also checks arming and kill.'),
    open_claw: () => (robot() ? `Publishes <code>command/actuator/claw</code> = true, but ${claw0}.` : 'Publishes <code>command/actuator/claw</code> = true: the claw opens fully.'),
    close_claw: () => (robot() ? `Publishes <code>command/actuator/claw</code> = false, but ${claw0}.` : 'Publishes <code>command/actuator/claw</code> = false: the claw closes fully.'),
    stop_claw: () => (robot()
      ? 'Publishes <code>claw_move_s</code> = 0. On the branch firmware that is an integer divide by zero: <a href="#claw-zero">don\'t press it on the robot</a>.'
      : 'Publishes <code>claw_move_s</code> = 0: the claw stops at once.'),
    reload: () => (robot()
      ? 'Publishes <code>command/actuator/notify_reload</code>. The counts go back to 2 and the launcher stays <em>armed</em>, despite the label.'
      : 'Publishes <code>command/actuator/notify_reload</code>. Nereus refills both payloads and disarms.'),
  };
  const odd = new Set(['dropper', 'open_claw', 'close_claw', 'stop_claw', 'reload']);
  const idle = () => (robot()
    ? `${S.armed ? 'Armed: every button works.' : 'Disarmed: only Arm and Reload work; the rest are grey.'} The red <b>Claw Not connected</b> is normal on Talos: the POAC never reports a claw. Tap a button.`
    : `${S.armed ? 'Armed: every button works.' : 'Disarmed: only Arm and Reload work; the rest are grey.'} In Nereus the claw reports its state, so it shows as connected. Tap a button.`);
  function draw() {
    const conn = robot()
      ? '<span class="bad">Claw <b>Not connected</b><i aria-label="differs from Nereus">≠</i></span><span>Torpedo <b>Connected</b></span>'
      : '<span>Claw <b>Connected</b></span><span>Torpedo <b>Connected</b></span>';
    mock.innerHTML = `<div class="vp-head">Actuators ${S.armed ? 'armed' : 'disarmed'}</div>
      <div class="vp-conn">${conn}</div>
      ${cmds.map((c) => {
    const off = c.requires_armed && !S.armed;
    const label = c.toggle_armed && S.armed ? c.armed_label : c.label;
    const mark = odd.has(c.id);
    return `<button type="button" class="vp-btn${off ? ' off' : ''}${S.sel === c.id ? ' sel' : ''}" data-id="${c.id}"${off ? ' aria-disabled="true"' : ''}>${esc(label)}${mark ? '<i aria-label="behaves differently on the robot">≠</i>' : ''}</button>`;
  }).join('')}
      <div class="vp-counts"><b>Status</b><span>Markers remaining: ${S.mark}</span><span>Torpedoes remaining: ${S.torp}</span></div>`;
    if (S.sel === null) note.innerHTML = idle();
    else {
      const c = cmds.find((x) => x.id === S.sel);
      const off = c.requires_armed && !S.armed;
      note.innerHTML = `<b>${esc(c.toggle_armed && S.armed ? c.armed_label : c.label)}.</b> ${off ? 'Grey until the status says armed. ' : ''}${what[c.id]()}`;
    }
    for (const b of root.querySelectorAll('#vp-state button')) b.setAttribute('aria-pressed', String((b.dataset.a === '1') === S.armed));
    for (const b of root.querySelectorAll('#vp-world button')) b.setAttribute('aria-pressed', String(b.dataset.w === S.world));
  }
  mock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    const id = b.dataset.id;
    const off = b.classList.contains('off');
    S.sel = id;
    if (!off) {
      if (id === 'torpedo' && S.torp > 0) S.torp--;
      else if (id === 'dropper' && S.mark > 0) S.mark--;
      else if (id === 'reload') { S.torp = 2; S.mark = 2; if (!robot()) S.armed = false; }
    }
    draw();
    if (!off && id === 'arm') { S.armed = !S.armed; S.sel = null; draw(); note.innerHTML = `<b>${S.armed ? 'Arm actuators' : 'Disarm'}.</b> ${S.armed ? 'Armed: the fire buttons work now.' : 'Disarmed: the fire and claw buttons are grey again.'} Both the robot and Nereus refuse to arm while killed.`; }
    else if (!off && id === 'reload') note.innerHTML += robot() ? ` The header still says <b>Actuators ${S.armed ? 'armed' : 'disarmed'}</b>.` : ' The header now says <b>Actuators disarmed</b>.';
  });
  for (const b of root.querySelectorAll('#vp-state button')) b.addEventListener('click', () => { S.armed = b.dataset.a === '1'; S.sel = null; draw(); });
  for (const b of root.querySelectorAll('#vp-world button')) b.addEventListener('click', () => { S.world = b.dataset.w; S.sel = null; draw(); });
  draw();
}
