import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/firmware.css';
import { Graph } from '../viz/graph.js';
import { LineChart } from '../viz/chart.js';

setup();

const BASE = import.meta.env.BASE_URL;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');

// Segmented buttons: items [{id, label}], calls onPick(id); returns a setter.
function seg(host, items, current, onPick) {
  host.innerHTML = items.map((it) => `<button type="button" data-id="${it.id}" aria-pressed="${it.id === current}">${esc(it.label)}</button>`).join('');
  const set = (id) => host.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
  host.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    set(b.dataset.id);
    onPick(b.dataset.id);
  });
  return set;
}

// Public assets get the base in JS: Vite's dev server prefixes the base a second time on absolute paths in HTML.
document.querySelectorAll('[data-asset]').forEach((e) => e.setAttribute(e.tagName === 'A' ? 'href' : 'src', BASE + e.dataset.asset));

const SHORT = { poac: 'POAC', esc: 'ESC', ccbb: 'Camera cage', led: 'LED', ivc: 'IVC', sbh: 'Battery' };

Promise.all([
  fetch(BASE + 'data/firmware/firmware.json').then((r) => r.json()),
  fetch(BASE + 'data/firmware/pool_esc.json').then((r) => r.json()),
]).then(([fw, pool]) => {
  libList(fw);
  lifeGraph(fw);
  timerList(fw);
  canExplorer(fw, pool);
  killGraph();
  poolChart(pool);
  decoder(fw);
});

// ===================================================================== libraries
function libList(fw) {
  const host = $('#lib-list');
  const projects = fw.projects;
  const KIND = { titan: 'titan', driver: 'driver', ros: 'micro-ROS', sdk: 'SDK' };
  const order = { sdk: 0, ros: 1, titan: 2, driver: 3 };
  const libs = fw.libs.filter((l) => l.used_by.length).sort((a, b) => order[a.kind] - order[b.kind] || b.used_by.length - a.used_by.length || a.name.localeCompare(b.name));
  const unused = fw.libs.filter((l) => !l.used_by.length).map((l) => l.name);
  let pick = 'all';
  const draw = () => {
    host.innerHTML = `<div class="lib-head"><span>library</span><span class="hd">what it does</span><span class="lu" aria-label="used by">${projects.map((p) => `<span title="${esc(p.name)}">${esc(SHORT[p.id][0])}</span>`).join('')}</span></div>` +
      libs.map((l) => `<div class="lib-row${pick !== 'all' && !l.used_by.includes(pick) ? ' off' : ''}">
        <span class="ln"><a href="${l.url}">${esc(l.name)}</a></span>
        <span class="ld"><span class="kind">${KIND[l.kind] || ''}</span>${esc(l.desc)}</span>
        <span class="lu">${projects.map((p) => `<i class="${l.used_by.includes(p.id) ? 'on' : ''}" title="${esc(p.name)}"></i>`).join('')}</span>
      </div>`).join('') +
      `<p class="src" style="margin:.6rem 0 0">Not used by any Talos board: ${unused.map((n) => `<code>${esc(n)}</code>`).join(', ')}.</p>`;
  };
  seg($('#lib-pick'), [{ id: 'all', label: 'All' }, ...projects.map((p) => ({ id: p.id, label: SHORT[p.id] }))], pick, (id) => { pick = id; draw(); });
  draw();
}

// ===================================================================== life cycle
function lifeGraph(fw) {
  const s = fw.safety, bl = fw.bootloader;
  const sw = (c) => `<i class="sw" style="--c:${c}"></i>`;
  const RED = '#e34948', YEL = '#eda100', GRN = '#1baf7a', BLU = '#2a78d6', WHT = '#ffffff', CYA = '#2bc4c9';
  const INFO = {
    power: { led: '#0f2633', t: 'Power on or reset', body: '<ul><li>The RP2040\'s boot ROM starts the titan bootloader in the first 16 kB of flash.</li><li>Every reset comes here: power-up, a crash, a reflash, or <code>reboot</code> from <code>canmore_cli</code>.</li></ul>' },
    delay: { led: WHT, t: 'Boot delay (bootloader)', body: `<ul><li>Starts the CAN chip and sends one heartbeat in "boot delay" mode, so tools can see it.</li><li>Listens ${bl.boot_delay_ms} ms for the bootloader request on channel 14 (<code>B0 07 10 AD</code>). <code>upload_tool -w</code> sends it to rescue a board whose application crashes at once.</li><li>Then checks the CRC-32 in the application's first flash page and jumps to it.</li><li>Its own watchdog: ${bl.watchdog_timeout_ms / 1000} s.</li></ul>` },
    blmode: { led: CYA, t: 'Bootloader mode', body: `<ul><li>Takes a new image over the register interface on channel 14: write a buffer, write it to flash, verify.</li><li>Heartbeats say "bootloader mode" every 500 ms; the LED is cyan, blinking blue.</li><li>Reboots when the upload finishes, or after ${bl.bootloader_timeout_sec} s with no traffic, so a board can't get stuck here.</li></ul>` },
    start: { led: RED, t: 'Start-up', body: `<ul><li><code>safety_setup()</code> first: watchdog at ${s.watchdog_setup_ms / 1000} s, prints the last reset cause, and raises <code>WATCHDOG_RESET</code> if that was a crash.</li><li>The POAC board sets its soft-kill pin to "kill" here, before anything else.</li><li>Drivers, then the CAN chip. If the CAN chip won't start, the firmware panics and resets to try again.</li><li>The board is killed: no kill slot has reported yet.</li></ul>` },
    wait: { led: YEL, t: 'Waiting for the agent', body: '<ul><li>Pings the micro-ROS agent once a second.</li><li>Sends a CAN heartbeat every 500 ms, with its mode, fault state and termination switch.</li><li>Still killed. The LED is yellow once another node acknowledges its frames, red if none does.</li></ul>' },
    run: { led: BLU, t: 'Connected', body: `<ul><li>Creates its node, publishers and subscribers, then <code>safety_init()</code>: watchdog down to ${s.watchdog_active_ms} ms, kill switches live.</li><li>Each loop: background tasks, executor, ROS tasks, <code>safety_tick()</code>.</li><li>Publishes a heartbeat topic every 100 ms and <code>state/firmware</code> every second.</li><li>LED green while killed, blue while enabled.</li></ul>` },
    lost: { led: YEL, t: 'Lost the agent', body: `<ul><li>More than 7 heartbeat publishes in a row failed (they go out every 100 ms): the agent is gone or the bus is broken.</li><li>Tears down the node, then <code>safety_deinit()</code>, which kills the board and relaxes the watchdog to ${s.watchdog_setup_ms / 1000} s.</li><li>Back to pinging. Nothing needs a reboot.</li></ul>` },
    crash: { led: RED, t: 'Crash', body: `<ul><li>A watchdog timeout (a pass took over ${s.watchdog_active_ms} ms), a panic, a hard fault, a failed assert, or core 1 missing its ${s.core1_checkin_ms} ms check-in.</li><li>The reason, uptime and fault bits go into the crash log (${s.crash_log_entries} entries) before the reset.</li><li>The board restarts from the bootloader and comes back killed.</li></ul>` },
  };
  const nodes = [
    { id: 'power', x: 70, y: 55, label: 'Power on', sub: 'or reset' },
    { id: 'delay', x: 235, y: 55, label: 'Boot delay', sub: `${bl.boot_delay_ms} ms, bootloader` },
    { id: 'start', x: 445, y: 55, label: 'Start-up', sub: `watchdog ${s.watchdog_setup_ms / 1000} s` },
    { id: 'wait', x: 655, y: 55, label: 'Waiting for agent', sub: 'ping every 1 s' },
    { id: 'run', x: 845, y: 150, label: 'Connected', sub: `watchdog ${s.watchdog_active_ms} ms` },
    { id: 'blmode', x: 235, y: 168, label: 'Bootloader mode', sub: 'taking an image' },
    { id: 'crash', x: 445, y: 250, label: 'Crash', sub: 'logged, then reset' },
    { id: 'lost', x: 655, y: 250, label: 'Lost agent', sub: 'killed, node torn down' },
  ];
  const edges = [
    { from: 'power', to: 'delay' },
    { from: 'delay', to: 'start', label: 'CRC ok', lx: 352, ly: 47 },
    { from: 'delay', to: 'blmode', label: 'request or bad CRC', lx: 227, ly: 116, anchor: 'end' },
    { from: 'blmode', to: 'power', label: 'done, or 30 s idle', bend: -30, lx: 122, ly: 152, anchor: 'end' },
    { from: 'start', to: 'wait' },
    { from: 'wait', to: 'run', label: 'agent answers', bend: -30, lx: 790, ly: 82, anchor: 'start' },
    { from: 'run', to: 'lost', label: '7 heartbeats fail', bend: -30, lx: 790, ly: 238, anchor: 'start' },
    { from: 'lost', to: 'wait', label: 'ping again', lx: 663, ly: 120, anchor: 'start' },
    { from: 'run', to: 'crash', dash: true, bend: 30, label: 'hang or fault', lx: 742, ly: 152 },
    { from: 'crash', to: 'delay', dash: true, via: [330, 165], label: 'reset', lx: 345, ly: 226 },
  ];
  const narrow = {
    below: 560, width: 360, height: 470,
    nodes: {
      power: { x: 95, y: 35 }, delay: { x: 95, y: 120 }, blmode: { x: 265, y: 120 }, start: { x: 95, y: 210 },
      wait: { x: 95, y: 300 }, lost: { x: 265, y: 300 }, run: { x: 95, y: 400 }, crash: { x: 265, y: 430 },
    },
    edges: {
      'delay>start': { label: 'CRC ok', lx: 103, ly: 168, anchor: 'start' },
      'delay>blmode': { label: '' },
      'blmode>power': { label: '', bend: 30 },
      'wait>run': { label: 'agent', bend: 0, lx: 103, ly: 352, anchor: 'start' },
      'run>lost': { label: '', bend: 0 },
      'lost>wait': { label: '' },
      'run>crash': { label: '', bend: 0 },
      'crash>delay': { label: '', opacity: 0, arrow: false },
    },
  };
  const note = $('#life-note');
  const g = new Graph($('#life-graph'), {
    width: 920, height: 300, nodes, edges, narrow,
    info: (n) => {
      if (!n) { note.innerHTML = 'Tap or hover a state to see what the board does there.'; return; }
      const i = INFO[n.id];
      note.innerHTML = `<b>${sw(i.led)}${esc(i.t)}</b>${i.body}`;
    },
  });
  g.highlight(null);
}

// ===================================================================== timers
function timerList(fw) {
  const NAME = {
    UROS_CONNECT_PING_TIME_MS: ['Ping the agent', 'only while disconnected', 'bg'],
    HEARTBEAT_TIME_MS: ['Heartbeat topic', 'a missed publish counts towards "lost"', 'ros'],
    FIRMWARE_STATUS_TIME_MS: ['<code>state/firmware</code>', '', 'ros'],
    LED_UPTIME_INTERVAL_MS: ['Status LED refresh', '', 'bg'],
    KILLSWITCH_PUBLISH_TIME_MS: ['<code>state/kill</code>', 'and at once on a change', 'ros'],
    ELECTRICAL_READINGS_INTERVAL: ['<code>state/electrical</code>, <code>batteries_balanced</code>', '', 'ros'],
    AUXSWITCH_INTERVAL: ['<code>state/aux</code>', 'the auxiliary switch', 'ros'],
    ACTUATOR_STATUS_TIME_MS: ['<code>state/actuator/status</code>', '', 'ros'],
    SERVO_TRANSMIT_PERIOD_MS: ['Servo bus scheduler', 'a timer interrupt, not the loop', 'bg'],
    SERVO_PING_PERIOD_MS: ['Ping the servo', '', 'bg'],
    SERVO_UPDATE_CMD_STATUS_PERIOD_MS: ['Actuator command feedback', 'not critical: a miss is no fault', 'ros'],
    TELEM_PUBLISH_RATE_MS: ['<code>state/thrusters/telemetry</code>', '', 'ros'],
    WATER_TEMP_PUBLISH_INTERVAL_MS: ['<code>state/depth/temp</code>', 'while depth readings are valid', 'ros'],
    LEAK_PUBLISH_INTERVAL_MS: ['<code>state/leak</code>', 'the publish is commented out', 'ros', true],
    BATTERY_STATUS_TIME_MS: ['<code>state/battery</code>', '', 'ros'],
    PWRCYCL_CHECK_INTERVAL_MS: ['Power-cycle check', 'defined, not used', 'bg', true],
  };
  const EXTRA = {
    all: [['CAN heartbeat frame', 'channel 15, from the CAN driver', 'bg', fw.canmore.heartbeat_interval_ms]],
    esc: [['Thruster loop on core 1', 'never faster than this; 2376 Hz measured', 'bg', fw.esc.dshot_min_frame_time_us / 1000]],
    ccbb: [['Depth sensor poll', '<code>state/depth/raw</code> on each new reading', 'bg', fw.depth.polling_ms]],
  };
  const host = $('#timer-list');
  const draw = (id) => {
    const p = fw.projects.find((q) => q.id === id);
    const rows = p.timers.map((t) => {
      const [what, sub, kind, off] = NAME[t.name] || [t.name, '', 'ros'];
      return { what, sub, kind, ms: t.ms, off: off || !t.used };
    });
    for (const [what, sub, kind, ms] of [...EXTRA.all, ...(EXTRA[id] || [])]) rows.push({ what, sub, kind, ms });
    rows.sort((a, b) => a.ms - b.ms);
    const lg = (ms) => Math.max(0.04, Math.min(1, (Math.log10(1000 / ms) + 0.2) / 3.6)); // 0.6 Hz .. 2.5 kHz on a log scale
    host.innerHTML = `<div class="tm">${rows.map((r) => `<div class="tm-row ${r.kind}${r.off ? ' unused' : ''}">
      <span class="what">${r.what}${r.sub ? `<small>${r.sub}</small>` : ''}</span>
      <span class="every">${r.ms < 1 ? (r.ms * 1000).toFixed(0) + ' µs' : r.ms >= 1000 ? r.ms / 1000 + ' s' : r.ms + ' ms'}</span>
      <span class="bar"><i style="width:${(lg(r.ms) * 100).toFixed(1)}%"></i></span></div>`).join('')}</div>
      <div class="tm-legend"><span><i style="background:var(--state)"></i>ROS task (only while connected)</span><span><i style="background:var(--muted)"></i>background, always</span><span>bar length: rate, log scale</span></div>`;
  };
  seg($('#timer-pick'), fw.projects.map((p) => ({ id: p.id, label: SHORT[p.id] })), 'poac', draw);
  draw('poac');
}

// ===================================================================== CANmore
const CLIENTS = { 1: 'POAC board', 2: 'ESC board 0', 3: 'ESC board 1', 4: 'Camera cage board', 5: 'Actuator board (retired)', 6: 'LED board', 7: 'SBC board (not on Talos)', 8: 'IVC board' };
const CHANNELS = { 0: 'thruster commands', 12: 'camera feed', 13: 'remote terminal', 14: 'control interface', 15: 'heartbeat' };
const MODES = { 0: 'no control interface', 1: 'normal', 2: 'bootloader', 3: 'Linux', 5: 'boot delay' };
const THRUSTERS = ['VUS', 'VUP', 'HUS', 'HUP', 'HLS', 'HLP', 'VLS', 'VLP'];
const FCOL = { client: '--state', type: '--s4', dir: '--s5', noc: '--prediction', single: '--s8', subtype: '--s6', len: '--s7', crc: '--s7', extra: '--s7' };

// CRC-18, polynomial 0x23979, initial value 0x3FFFF, no final XOR (titan_canmore msg_encoding.c)
const CRC18 = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 10;
    for (let k = 0; k < 8; k++) c = c & 0x20000 ? ((c << 1) ^ 0x23979) & 0x3ffff : (c << 1) & 0x3ffff;
    t[i] = c;
  }
  return t;
})();
function crc18(bytes) {
  let c = 0x3ffff;
  for (const b of bytes) c = ((c << 8) ^ CRC18[((c >>> 10) ^ b) & 0xff]) & 0x3ffff;
  return c;
}
const stdId = (cl, t, d, noc) => ((cl & 31) << 6) | ((t & 1) << 5) | ((d & 1) << 4) | (noc & 15);
const extId = (cl, t, d, noc, extra) => (((cl & 31) << 24) | ((t & 1) << 23) | ((d & 1) << 22) | ((noc & 15) << 18) | (extra & 0x3ffff)) >>> 0;
const frameBits = (ext, n) => (ext ? 67 : 47) + 8 * n; // classic CAN, before stuff bits

// Port of canmore_msg_encode_next with classic 8-byte frames.
function encodeMsg(client, dir, payload, subtype = 0) {
  const out = [];
  const L = payload.length;
  let pos = 0, seq = 0;
  while (pos < L) {
    const n = Math.min(8, L - pos);
    const data = payload.slice(pos, pos + n);
    pos += n;
    let id, ext;
    if (seq === 0) { ext = true; id = extId(client, 0, dir, 0, ((pos === L ? 1 : 0) << 17) | ((subtype & 63) << 11) | (L & 0x7ff)); }
    else if (pos === L) { ext = true; id = extId(client, 0, dir, seq, crc18(payload)); }
    else { ext = false; id = stdId(client, 0, dir, seq); }
    out.push({ id, ext, data });
    seq = seq >= 15 ? 1 : seq + 1;
  }
  return out;
}

function fieldsOf(id, ext) {
  const f = (key, name, hi, lo) => ({ key, name, hi, lo, value: Math.floor(id / 2 ** lo) % 2 ** (hi - lo + 1) });
  const top = ext ? 28 : 10;
  const list = [f('client', 'Client ID', top, top - 4), f('type', 'Type', top - 5, top - 5), f('dir', 'Direction', top - 6, top - 6), f('noc', 'NOC', top - 7, top - 10)];
  if (ext) {
    const t = list[1].value, noc = list[3].value;
    if (t === 0 && noc === 0) list.push(f('single', 'Single', 17, 17), f('subtype', 'Subtype', 16, 11), f('len', 'Length', 10, 0));
    else if (t === 0) list.push(f('crc', 'CRC-18', 17, 0));
    else list.push(f('extra', 'Extra', 17, 0));
  }
  const t = list[1].value;
  for (const x of list) {
    x.meaning = {
      client: () => (x.value ? `${x.value}: ${CLIENTS[x.value] || 'unassigned'} (internal bus numbering)` : '0: reserved'),
      type: () => (x.value ? '1: utility frame, a single frame on a channel' : '0: message frame, part of a ROS message'),
      dir: () => (x.value ? '1: Orin (agent) to board' : '0: board to Orin (agent)'),
      noc: () => (t ? `channel ${x.value}: ${CHANNELS[x.value] || 'unassigned'}` : x.value ? `sequence number ${x.value}` : 'sequence 0: the first frame of a message'),
      single: () => (x.value ? '1: the whole message fits in this frame' : '0: more frames follow'),
      subtype: () => `${x.value}${x.value === 0 ? ': XRCE-DDS (micro-ROS)' : ''}`,
      len: () => `${x.value} bytes in the whole message`,
      crc: () => `0x${hex(x.value, 5)}: CRC-18 of the whole message; this is the last frame`,
      extra: () => `0x${hex(x.value, 5)}: free for the channel's protocol`,
    }[x.key]();
  }
  return list;
}

function canExplorer(fw, pool) {
  const host = $('#canx');
  host.innerHTML = `<div class="seg" role="group" aria-label="Frame kind" id="cx-mode"></div>
    <div class="cx-controls" id="cx-controls"></div>
    <div class="cx-summary" id="cx-summary"></div>
    <div class="cx-frames" id="cx-list" hidden></div>
    <div class="cx-frame" id="cx-frame"></div>`;
  // a real command from the pool run: the busiest moment of the window
  let best = pool.req[0];
  for (const r of pool.req) if (r.slice(1).reduce((s, v) => s + Math.abs(v), 0) > best.slice(1).reduce((s, v) => s + Math.abs(v), 0)) best = r;
  const st = {
    mode: 'hb', hbClient: 1, hbMode: 1, hbErr: false, hbTerm: 'on', hbCnt: 2,
    tBoard: 0, rpm: best.slice(1).map((v) => Math.round(v)), tTime: best[0], bug: false,
    mClient: 4, mDir: 0, mLen: 40, sel: 0,
    blClient: 1, raw: '',
  };
  st.raw = 'can0  0B0   [8]  ' + st.rpm.slice(0, 4).map((v) => { const u = v & 0xffff; return hex(u >> 8, 2) + ' ' + hex(u & 0xff, 2); }).join(' ');
  const CLIENT_OPTS = [1, 2, 3, 4, 6, 8];
  const opt = (v, cur, label) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
  const ctl = $('#cx-controls'), sum = $('#cx-summary'), list = $('#cx-list'), frameHost = $('#cx-frame');

  const MODES_UI = [
    { id: 'hb', label: 'Heartbeat' }, { id: 'thr', label: 'Thruster command' }, { id: 'msg', label: 'ROS message' },
    { id: 'bl', label: 'Bootloader request' }, { id: 'raw', label: 'Decode a frame' },
  ];
  seg($('#cx-mode'), MODES_UI, st.mode, (id) => { st.mode = id; st.sel = 0; controls(); render(); });

  function controls() {
    const m = st.mode;
    if (m === 'hb') {
      ctl.innerHTML = `<label>Board <select data-k="hbClient">${CLIENT_OPTS.map((c) => opt(c, st.hbClient, `${c} · ${CLIENTS[c]}`)).join('')}</select></label>
        <label>Mode <select data-k="hbMode">${[1, 5, 2].map((v) => opt(v, st.hbMode, MODES[v])).join('')}</select></label>
        <label>Termination <select data-k="hbTerm">${opt('on', st.hbTerm, 'switch on')}${opt('off', st.hbTerm, 'switch off')}${opt('na', st.hbTerm, 'not readable')}</select></label>
        <label>Counter <select data-k="hbCnt">${[0, 1, 2, 3].map((v) => opt(v, st.hbCnt, v)).join('')}</select></label>
        <label><input type="checkbox" data-k="hbErr"${st.hbErr ? ' checked' : ''}> a fault is set</label>`;
    } else if (m === 'thr') {
      const b = st.tBoard;
      ctl.innerHTML = `<span class="seg" role="group" aria-label="ESC board" id="cx-tb"></span>
        <div class="full"><div class="rpm4">${[0, 1, 2, 3].map((i) => `<label>${THRUSTERS[b * 4 + i]} (thruster ${b * 4 + i})<input type="number" min="-32768" max="32767" step="1" data-i="${i}" value="${st.rpm[b * 4 + i]}"></label>`).join('')}</div></div>
        <label><input type="checkbox" data-k="bug"${st.bug ? ' checked' : ''}> what firmware before 4 Oct 2026 heard</label>`;
      seg($('#cx-tb', ctl), [{ id: '0', label: 'ESC board 0' }, { id: '1', label: 'ESC board 1' }], String(b), (id) => { st.tBoard = +id; controls(); render(); });
    } else if (m === 'msg') {
      ctl.innerHTML = `<label>Board <select data-k="mClient">${CLIENT_OPTS.map((c) => opt(c, st.mClient, `${c} · ${CLIENTS[c]}`)).join('')}</select></label>
        <label>Direction <select data-k="mDir">${opt(0, st.mDir, 'board → Orin')}${opt(1, st.mDir, 'Orin → board')}</select></label>
        <label>Message length <input type="range" min="1" max="160" step="1" data-k="mLen" value="${st.mLen}"><output>${st.mLen} B</output></label>`;
    } else if (m === 'bl') {
      ctl.innerHTML = `<label>Board <select data-k="blClient">${CLIENT_OPTS.map((c) => opt(c, st.blClient, `${c} · ${CLIENTS[c]}`)).join('')}</select></label>`;
    } else {
      ctl.innerHTML = `<div class="full"><input type="text" spellcheck="false" autocomplete="off" aria-label="A candump line" data-k="raw" value="${esc(st.raw)}"></div>
        <div class="full"><span class="src">Try:</span>${['can0  06F   [1]  4A', '0F0#FE0C00D8FF4C01D0', 'can0  04000028   [8]  3A AB AC 26 AF 23 1A 71', 'can0  07E   [4]  B0 07 10 AD'].map((x) => `<button type="button" class="btn" data-ex="${esc(x)}" style="font-family:var(--mono);font-size:.74rem;padding:.2rem .5rem">${esc(x)}</button>`).join('')}</div>`;
    }
  }
  ctl.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.i !== undefined) {
      const v = Math.max(-32768, Math.min(32767, Math.round(+t.value || 0)));
      st.rpm[st.tBoard * 4 + +t.dataset.i] = v;
    } else if (t.dataset.k) {
      const k = t.dataset.k;
      st[k] = t.type === 'checkbox' ? t.checked : k === 'raw' || k === 'hbTerm' ? t.value : +t.value;
      if (k === 'mLen') t.nextElementSibling.textContent = `${t.value} B`;
      if (k === 'mLen' || k === 'mClient' || k === 'mDir') st.sel = 0;
    }
    render();
  });
  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    st.raw = b.dataset.ex;
    ctl.querySelector('input[data-k="raw"]').value = st.raw;
    render();
  });

  function payloadMeaning(fr) {
    const fl = fieldsOf(fr.id, fr.ext);
    const get = (k) => fl.find((x) => x.key === k)?.value;
    const t = get('type'), d = get('dir'), noc = get('noc'), cl = get('client');
    const by = fr.data;
    if (t === 1 && noc === 15 && d === 0 && by.length === 1) {
      const v = by[0];
      const tv = (v >> 6) & 1, te = (v >> 7) & 1;
      return { pairs: false, html: `<b>Heartbeat byte 0x${hex(v, 2)}</b> = <code>${v.toString(2).padStart(8, '0')}</code><table>
        <tr><td>bit 7 T</td><td>${te}</td><td>termination switch ${tv ? (te ? 'on' : 'off') : '(ignore: V is 0)'}</td></tr>
        <tr><td>bit 6 V</td><td>${tv}</td><td>termination state ${tv ? 'valid' : 'not readable'}</td></tr>
        <tr><td>bits 5–3 M</td><td>${(v >> 3) & 7}</td><td>mode: ${MODES[(v >> 3) & 7] || 'reserved'}</td></tr>
        <tr><td>bit 2 E</td><td>${(v >> 2) & 1}</td><td>${(v >> 2) & 1 ? 'a fault is set' : 'no faults'}</td></tr>
        <tr><td>bits 1–0</td><td>${v & 3}</td><td>counter, +1 per heartbeat, to spot lost frames</td></tr></table>` };
    }
    if (t === 1 && noc === 0 && d === 1) {
      if (by.length !== 8) return { html: `<span class="cx-err">The ESC board drops thruster frames that aren't exactly 8 bytes.</span>` };
      const base = cl === 3 ? 4 : 0;
      const rows = [0, 1, 2, 3].map((i) => {
        const raw = (by[2 * i] << 8) | by[2 * i + 1];
        const v = raw >= 0x8000 ? raw - 0x10000 : raw;
        const old = ((by[2 * i] << 8) | by[2 * i]);
        const ov = old >= 0x8000 ? old - 0x10000 : old;
        return `<tr><td>${THRUSTERS[base + i]} (${base + i})</td><td><code>${hex(by[2 * i], 2)} ${hex(by[2 * i + 1], 2)}</code></td><td><b>${v}</b> RPM</td>${st.bug || st.mode === 'raw' ? `<td class="${ov !== v ? 'bug' : ''}">old firmware: ${ov}</td>` : ''}</tr>`;
      });
      return { pairs: true, html: `${cl === 2 || cl === 3 ? '' : '<span class="cx-err">Only clients 2 and 3 (the ESC boards) take thruster frames.</span><br>'}Four big-endian <code>int16</code> RPM targets. The board stores them with a 500 ms expiry.<table>${rows.join('')}</table>` };
    }
    if (t === 1 && noc === 14) {
      const magic = by.length === 4 && by[0] === 0xb0 && by[1] === 0x07 && by[2] === 0x10 && by[3] === 0xad;
      if (magic && d === 1) return { html: '<b>Bootloader request</b> (<code>B0 07 10 AD</code>). Only acted on while the board\'s heartbeat says "boot delay", in the 500 ms after power-up. A running board is sent to its bootloader with a register write on the same channel instead.' };
      return { html: `Control interface: one ${d ? 'request' : 'reply'} of the register-mapped protocol (32-bit registers addressed by page and offset) used by <code>canmore_cli</code>, <code>upload_tool</code> and the bootloader.` };
    }
    if (t === 1) return { html: `Utility channel ${noc}: ${CHANNELS[noc] || 'not assigned'}.` };
    if (t === 0) {
      if (fr.ext && noc === 0) return { html: `The first frame of a ${get('len')}-byte ${get('subtype') === 0 ? 'XRCE-DDS' : ''} message${get('single') ? ', complete in this one frame' : ''}. Its data bytes are the start of the message.` };
      if (fr.ext) return { html: 'The last frame of a message. The receiver checks the CRC-18 in the ID against the whole reassembled message; on a mismatch the message is dropped.' };
      return { html: `Frame ${noc} of a message: the next ${by.length} bytes. A frame out of sequence drops the whole message.` };
    }
    return { html: '' };
  }

  function drawFrame(fr, caption) {
    const fl = fieldsOf(fr.id, fr.ext);
    const nbits = fr.ext ? 29 : 11;
    const bits = [];
    for (let b = nbits - 1; b >= 0; b--) bits.push(Math.floor(fr.id / 2 ** b) % 2);
    const fieldAt = (b) => fl.find((x) => b <= x.hi && b >= x.lo);
    const cols = `grid-template-columns:repeat(${nbits},minmax(0,1fr))`;
    const cells = bits.map((v, i) => {
      const b = nbits - 1 - i, f = fieldAt(b);
      return `<span class="b" data-f="${f.key}" style="--fc:color-mix(in srgb, var(${FCOL[f.key]}) 26%, var(--paper-2))">${v}</span>`;
    }).join('');
    const nums = bits.map((_, i) => { const b = nbits - 1 - i; return `<span class="n">${b % 4 === 0 || b === nbits - 1 ? b : ''}</span>`; }).join('');
    const labs = fl.map((f) => `<span class="f" data-f="${f.key}" style="grid-column:${nbits - f.hi} / span ${f.hi - f.lo + 1};--fs:var(${FCOL[f.key]})">${f.hi - f.lo >= 2 ? esc(f.name) : f.hi === f.lo ? f.name[0] : esc(f.name)}</span>`).join('');
    const pm = payloadMeaning(fr);
    const bytes = fr.data.map((v, i) => `<span class="${pm.pairs ? 'pair' + (i >> 1) % 2 : ''}">${hex(v, 2)}</span>`).join('');
    const us = frameBits(fr.ext, fr.data.length);
    frameHost.innerHTML = `<div class="cx-fhead"><b>${fr.ext ? hex(fr.id, 8) : hex(fr.id, 3)}</b><span>${fr.ext ? 'extended, 29-bit ID' : 'standard, 11-bit ID'}</span><span>${fr.data.length} data byte${fr.data.length === 1 ? '' : 's'}</span><span>≥ ${us} bits, ${us} µs at 1 Mbit/s</span>${caption ? `<span>${caption}</span>` : ''}</div>
      <div class="cx-bits" style="${cols}">${cells}${nums}${labs}</div>
      <table class="cx-fields">${fl.map((f) => `<tr data-f="${f.key}" style="--fs:var(${FCOL[f.key]})"><td><i></i>${esc(f.name)}</td><td class="v">${f.hi === f.lo ? 'bit ' + f.hi : `bits ${f.hi}–${f.lo}`}</td><td>${esc(f.meaning)}</td></tr>`).join('')}</table>
      <div class="cx-data"><h4>Data</h4><div class="cx-bytes">${bytes || '<span>none</span>'}</div><div class="cx-meaning">${pm.html}</div></div>`;
    const hot = (k) => frameHost.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('hot', x.dataset.f === k));
    frameHost.querySelectorAll('[data-f]').forEach((x) => {
      x.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hot(x.dataset.f); });
      x.addEventListener('pointerdown', () => hot(x.dataset.f));
    });
  }
  frameHost.addEventListener('pointerleave', (e) => {
    if (e.pointerType === 'mouse') frameHost.querySelectorAll('.hot').forEach((x) => x.classList.remove('hot'));
  });

  function parseRaw(s) {
    s = s.trim();
    let m = s.match(/([0-9A-Fa-f]{1,8})#([0-9A-Fa-f.]*)/);
    let idStr, data;
    if (m) { idStr = m[1]; data = (m[2].replace(/\./g, '').match(/../g) || []).map((x) => parseInt(x, 16)); }
    else {
      const toks = s.split(/\s+/).filter((x) => !/^\(.*\)$/.test(x) && !/^(v?can|any|vcan|slcan)\d*$/i.test(x));
      if (!toks.length) return { err: 'Paste a frame, like the examples.' };
      idStr = toks[0].replace(/^0x/i, '');
      const rest = toks.slice(1).filter((x) => !/^\[\d+\]$/.test(x));
      data = rest.filter((x) => /^[0-9A-Fa-f]{2}$/.test(x)).map((x) => parseInt(x, 16));
    }
    if (!/^[0-9A-Fa-f]{1,8}$/.test(idStr)) return { err: `"${idStr}" isn't a CAN ID in hex.` };
    const id = parseInt(idStr, 16);
    const ext = idStr.length > 3 || id > 0x7ff;
    if (id > 0x1fffffff) return { err: 'A CAN ID has at most 29 bits.' };
    if (data.length > 8) return { err: 'More than 8 data bytes: Talos only uses classic CAN frames.' };
    return { id, ext, data };
  }

  function render() {
    list.hidden = true;
    sum.innerHTML = '';
    const m = st.mode;
    if (m === 'hb') {
      const byte = (st.hbCnt & 3) | ((st.hbErr ? 1 : 0) << 2) | ((st.hbMode & 7) << 3) | ((st.hbTerm === 'na' ? 0 : 1) << 6) | ((st.hbTerm === 'on' ? 1 : 0) << 7);
      sum.innerHTML = `Every board sends one of these every ${fw.canmore.heartbeat_interval_ms} ms: a utility frame on channel 15 with one byte. <code>canmore_cli</code> and <code>upload_tool</code> find boards by listening for them.`;
      drawFrame({ id: stdId(st.hbClient, 1, 0, 15), ext: false, data: [byte] });
    } else if (m === 'thr') {
      const cl = 2 + st.tBoard;
      const data = [];
      for (let i = 0; i < 4; i++) { const v = st.rpm[st.tBoard * 4 + i] & 0xffff; data.push(v >> 8, v & 0xff); }
      sum.innerHTML = `What <code>send_thruster_cmd_canbus</code> writes for board ${st.tBoard} every 50 ms. Defaults: the MPC's command at t = ${st.tTime.toFixed(2)} s of the pool window below (2026-10-24). Change any value.`;
      drawFrame({ id: stdId(cl, 1, 1, 0), ext: false, data });
    } else if (m === 'msg') {
      // a stand-in payload: deterministic bytes, not a real XRCE packet
      let x = 0x2545f491;
      const payload = Array.from({ length: st.mLen }, () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) & 0xff; });
      const frames = encodeMsg(st.mClient, st.mDir, payload);
      const bits = frames.reduce((s, f) => s + frameBits(f.ext, f.data.length), 0);
      sum.innerHTML = `<b>${frames.length}</b> frame${frames.length > 1 ? 's' : ''} for <b>${st.mLen}</b> bytes (example bytes, standing in for an XRCE-DDS packet): at least <b>${bits}</b> bits, <b>${bits} µs</b> of the bus at 1 Mbit/s, of which ${(100 * st.mLen * 8 / bits).toFixed(0)} % is payload. CRC-18 of the message: <b>0x${hex(crc18(payload), 5)}</b>. Tap a frame.`;
      if (st.sel >= frames.length) st.sel = 0;
      list.hidden = frames.length < 2;
      list.innerHTML = frames.map((f, i) => {
        const fl = fieldsOf(f.id, f.ext), noc = fl.find((q) => q.key === 'noc').value;
        return `<button type="button" data-i="${i}" aria-pressed="${i === st.sel}"><span>${noc}</span><span class="id">${f.ext ? hex(f.id, 8) : hex(f.id, 3)}</span><span class="dat">${f.data.map((b) => hex(b, 2)).join(' ')}</span></button>`;
      }).join('');
      drawFrame(frames[st.sel], frames.length > 1 ? (st.sel === 0 ? 'first frame' : st.sel === frames.length - 1 ? 'last frame' : `frame ${st.sel + 1} of ${frames.length}`) : 'single frame');
    } else if (m === 'bl') {
      sum.innerHTML = 'Sent by <code>upload_tool -w</code> to catch a board in the 500 ms after power-up, before its application starts. Useful when the application crashes too fast to be told to reboot.';
      drawFrame({ id: stdId(st.blClient, 1, 1, 14), ext: false, data: [0xb0, 0x07, 0x10, 0xad] });
    } else {
      const r = parseRaw(st.raw);
      if (r.err) { sum.innerHTML = `<span class="cx-err">${esc(r.err)}</span>`; frameHost.innerHTML = ''; return; }
      sum.innerHTML = 'Formats: <code>candump</code>\'s default output, or <code>ID#DATA</code> as in <code>candump -l</code> and <code>cansend</code>. Client names assume the internal bus.';
      drawFrame(r);
    }
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    st.sel = +b.dataset.i;
    render();
  });
  controls();
  render();
}

// ===================================================================== kill fan-out
function killGraph() {
  const INFO = {
    sw: '<b>Physical kill switch</b> on the hull. Its line goes to the POAC board twice: to GPIO 1 (slot 0, read on an interrupt and every tick), and through an analog switch to the power stage. Pull it and thruster power goes, whatever the software says.',
    viewer: '<b>Slot 1, the Nereus viewer.</b> Reports on <code>command/software_kill</code> every 50 ms. Named <code>KILL_SWITCH_RQT_CONTROLLER</code> after the old RViz panel.',
    top: '<b>Slot 2, a topside kill button</b> (<code>riptide_kill_switch</code>). Not in regular use.',
    dbg: '<b>Slot 3, debug</b>: the command line and scripts, like the pre-test checks\' bench hold.',
    poac: '<b>POAC board.</b> Four slots and the kill rule. Publishes the result on <code>state/kill</code> every 150 ms and at once on a change, and drives its soft-kill pin. Its fault and slot bits are in <code>state/firmware</code>.',
    pwr: '<b>Thruster power</b> (<code>MOTOR_EN</code> → <code>MOTOR_PWR</code>). Three P-channel MOSFETs, on only while the switch is in <em>and</em> the soft-kill pin says run.',
    escs: '<b>ESC boards.</b> Kill slot 0 is <code>state/kill</code>, needs update. Killed: throttle zero and <code>SAFETY_KILLED</code>. Power cut: <code>ESC_BOARD_OFF</code>, then <code>ESC_POWERON_DELAY</code> for 5 s once it returns.',
    ccbb: '<b>Camera cage board.</b> One slot fed by <code>state/kill</code>. A kill only changes its status LED; depth keeps publishing.',
    led: '<b>LED board.</b> One slot fed by <code>state/kill</code>. Also listens to <code>state/physkill_notify</code> and flashes the lights when the switch moves.',
    ivc: '<b>IVC board.</b> One slot fed by <code>state/kill</code>; a kill only changes its status LED.',
    sbh: '<b>Battery housings</b>, on the external bus. Their firmware subscribes to <code>state/kill</code> too, but the external-bus agent is commented out in <code>copro_agent.launch.py</code>.',
  };
  const nodes = [
    { id: 'sw', x: 95, y: 45, label: 'Kill switch', sub: 'on the hull' },
    { id: 'viewer', x: 95, y: 120, label: 'Slot 1: viewer' },
    { id: 'top', x: 95, y: 185, label: 'Slot 2: topside' },
    { id: 'dbg', x: 95, y: 250, label: 'Slot 3: debug' },
    { id: 'poac', x: 345, y: 150, label: 'POAC board', sub: '4 slots, the rule', bold: true },
    { id: 'pwr', x: 345, y: 45, label: 'Thruster power', sub: 'MOTOR_PWR' },
    { id: 'escs', x: 630, y: 45, label: 'ESC boards ×2', sub: 'zero throttle' },
    { id: 'ccbb', x: 630, y: 125, label: 'Camera cage' },
    { id: 'led', x: 630, y: 185, label: 'LED board' },
    { id: 'ivc', x: 630, y: 245, label: 'IVC board' },
    { id: 'sbh', x: 490, y: 262, label: 'Battery housings', sub: 'external bus' },
  ];
  const edges = [
    { from: 'sw', to: 'pwr', label: 'switch line' },
    { from: 'sw', to: 'poac', label: 'slot 0', bend: 18 },
    { from: 'viewer', to: 'poac', dash: true },
    { from: 'top', to: 'poac', dash: true },
    { from: 'dbg', to: 'poac', dash: true, label: 'command/software_kill', lx: 232, ly: 250, anchor: 'start' },
    { from: 'poac', to: 'pwr', label: 'soft-kill pin' },
    { from: 'pwr', to: 'escs', label: 'power' },
    { from: 'poac', to: 'escs', dash: true, label: 'state/kill', lx: 470, ly: 92 },
    { from: 'poac', to: 'ccbb', dash: true },
    { from: 'poac', to: 'led', dash: true },
    { from: 'poac', to: 'ivc', dash: true },
    { from: 'poac', to: 'sbh', dash: true, opacity: 0.4 },
  ];
  const narrow = {
    below: 560, width: 360, height: 480,
    nodes: {
      sw: { x: 85, y: 35 }, pwr: { x: 270, y: 35 }, viewer: { x: 288, y: 108 }, top: { x: 288, y: 163 }, dbg: { x: 288, y: 218 },
      poac: { x: 105, y: 163 }, escs: { x: 85, y: 285 }, ccbb: { x: 275, y: 290 }, led: { x: 275, y: 345 }, ivc: { x: 275, y: 400 },
      sbh: { x: 150, y: 448 },
    },
    edges: {
      'sw>pwr': { label: '' }, 'sw>poac': { label: '', bend: 0 }, 'dbg>poac': { label: '' }, 'poac>pwr': { label: '' },
      'pwr>escs': { label: '', bend: 0, via: [195, 125] }, 'poac>escs': { label: '' }, 'poac>sbh': { via: [190, 340] },
    },
  };
  const note = $('#kill-note');
  const g = new Graph($('#kill-graph'), {
    width: 920, height: 290, nodes, edges, narrow,
    info: (n) => { note.innerHTML = n ? INFO[n.id] : 'Tap or hover a box. Dashed lines are ROS topics carried over CAN; solid lines are wires.'; },
  });
  g.highlight(null);
}

// ===================================================================== pool telemetry
function poolChart(pool) {
  const INVERTED = [0, 3, 4, 7]; // core1_init: mask 0b1001 on both boards
  let th = 0, raw = false;
  const rpm = new LineChart($('#pool-rpm'), { height: 230, xLabel: 'time (s)', yLabel: 'RPM', digits: 0, xDigits: 1 });
  const cur = new LineChart($('#pool-cur'), { height: 120, xLabel: 'time (s)', yLabel: 'ESC current (A)', digits: 2, xDigits: 1, legend: false });
  const draw = () => {
    const b = th >> 2, s = th & 3;
    const flip = !raw && INVERTED.includes(th) ? -1 : 1;
    const target = pool.req.map((r) => ({ x: r[0], y: r[1 + th] }));
    const tel = pool.tel.filter((x) => x.b === b);
    const rep = tel.map((x) => ({ x: x.t, y: flip * x.esc[s][0] }));
    rpm.set([
      { name: 'target sent on CAN', color: 'var(--reference)', values: target, width: 1.6 },
      { name: `reported by the ESC${flip < 0 ? ' (sign flipped)' : ''}`, color: 'var(--state)', values: rep, points: true, r: 3, opacity: 0.9 },
    ], { yZero: true });
    cur.set([{ name: 'current', color: 'var(--s7)', values: tel.map((x) => ({ x: x.t, y: x.esc[s][1] })), width: 1.6 }], { yDomain: [0, Math.max(1, ...tel.map((x) => x.esc[s][1])) * 1.15] });
    const temps = tel.map((x) => x.esc[s][2]);
    $('#pool-stats').innerHTML = `<span>Thruster <b>${THRUSTERS[th]}</b>: ESC board ${b}, slot ${s}${INVERTED.includes(th) ? ', reversed' : ''}</span><span>ESC temperature <b>${Math.min(...temps)}–${Math.max(...temps)} °C</b></span>` +
      `<span>Whole run: core 1 loop <b>${pool.stats.loop_hz_median} Hz</b>, telemetry every <b>${pool.stats.tel_period_s} s</b>, <code>state/kill</code> every <b>${pool.stats.kill_period_ms_median} ms</b>, ESC supply <b>${pool.stats.vcc_range[0]}–${pool.stats.vcc_range[1]} V</b>, <code>disabled_flags</code> <b>${pool.stats.flags_seen.join(', ')}</b> throughout</span>`;
  };
  seg($('#pool-pick'), THRUSTERS.map((n, i) => ({ id: String(i), label: n })), '0', (id) => { th = +id; draw(); });
  $('#pool-raw').addEventListener('change', (e) => { raw = e.target.checked; draw(); });
  draw();
}

// ===================================================================== status decoder
function decoder(fw) {
  const host = $('#decoder');
  host.innerHTML = `<div class="dec"><div class="row"><label>Board <select id="dec-board">${fw.projects.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label></div>
    <div class="row"><span class="seg" role="group" aria-label="Field" id="dec-field"></span></div>
    <div class="row"><label><span id="dec-label">faults</span> = <input id="dec-val" type="text" inputmode="text" value="0x14" spellcheck="false" autocomplete="off"></label></div>
    <div class="verdict" id="dec-verdict"></div>
    <table id="dec-table"></table></div>`;
  const SLOTS = [
    { bit: 0, name: 'KILL_SWITCH_PHYSICAL', desc: 'The switch on the hull (set in asserting = switch out)' },
    { bit: 1, name: 'KILL_SWITCH_RQT_CONTROLLER', desc: 'Slot 1: the Nereus viewer' },
    { bit: 2, name: 'KILL_SWITCH_TOPSIDE_BUTTON', desc: 'Slot 2: a topside kill button' },
    { bit: 3, name: 'KILL_SWITCH_DEBUG', desc: 'Slot 3: command line and scripts' },
  ];
  const FLAGDESC = {
    SAFETY_KILLED: 'The board is killed', ESC_BOARD_OFF: 'ESC supply under 9 V', ESC_POWERON_DELAY: 'Under 5 s since ESC power returned',
    TGT_RPM_STALE: 'No RPM target for 500 ms', TGT_RPM_STALE_PENALTY: '1 s lockout after targets went stale mid-spin', CONTROLLER_UNCONFIGURED: 'A tuning value was never set',
  };
  let board = 'poac', field = 'faults';
  const fieldsFor = (id) => [
    { id: 'faults', label: 'faults' },
    ...(id === 'esc' ? [{ id: 'flags', label: 'disabled_flags' }] : []),
    ...(id === 'poac' ? [{ id: 'kill', label: 'kill_switches_*' }] : []),
  ];
  const setField = () => {
    const fs = fieldsFor(board);
    if (!fs.find((f) => f.id === field)) field = 'faults';
    seg($('#dec-field'), fs, field, (id) => { field = id; draw(); });
  };
  const draw = () => {
    const p = fw.projects.find((q) => q.id === board);
    const txt = $('#dec-val').value.trim();
    const v = /^0x[0-9a-f]+$/i.test(txt) ? parseInt(txt, 16) : /^\d+$/.test(txt) ? parseInt(txt, 10) : NaN;
    $('#dec-label').textContent = field === 'faults' ? 'faults' : field === 'flags' ? 'disabled_flags' : 'kill_switches_…';
    let rows;
    if (field === 'faults') rows = p.faults.map((f) => ({ bit: f.bit, name: f.name, desc: f.desc + (f.raised ? '' : ' Never raised in this board\'s code.'), quiet: !f.raised }));
    else if (field === 'flags') rows = fw.esc.disabled_flags.map((f) => ({ bit: f.bit, name: f.name, desc: FLAGDESC[f.name] || '' }));
    else rows = SLOTS;
    const ver = $('#dec-verdict');
    if (Number.isNaN(v) || v < 0 || v > 0xffffffff) {
      ver.className = 'verdict bad';
      ver.textContent = 'Type a whole number, like 20 or 0x14.';
      rows.forEach((r) => (r.on = false));
    } else {
      const set = rows.filter((r) => Math.floor(v / 2 ** r.bit) % 2 === 1);
      const unknown = [];
      for (let b = 0; b < 32; b++) if (Math.floor(v / 2 ** b) % 2 === 1 && !rows.find((r) => r.bit === b)) unknown.push(b);
      rows.forEach((r) => (r.on = set.includes(r)));
      ver.className = 'verdict' + (set.length || unknown.length ? ' bad' : '');
      ver.innerHTML = (set.length ? `Set: ${set.map((r) => `<code>${esc(r.name)}</code>`).join(', ')}.` : 'Nothing set.') +
        (unknown.length ? ` Bits ${unknown.join(', ')} aren't defined for this board.` : '') +
        (field === 'kill' && v ? ' Read it against the field it came from: enabled, asserting kill, needs update or timed out.' : '');
    }
    $('#dec-table').innerHTML = rows.map((r) => `<tr class="${r.on ? 'on' : ''}${r.quiet ? ' quiet' : ''}"><td class="bit">${r.bit}</td><td class="nm">${esc(r.name)}</td><td>${esc(r.desc)}</td></tr>`).join('');
  };
  $('#dec-board').addEventListener('change', (e) => { board = e.target.value; setField(); draw(); });
  $('#dec-val').addEventListener('input', draw);
  setField();
  draw();
}
