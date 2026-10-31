import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/firmware.css';
import { LineChart } from '../viz/firmware-chart.js';

setup();

const BASE = import.meta.env.BASE_URL;
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Line breaks after / and _ only, so long topic and fault names never split mid-word on a phone.
const brk = (s) => esc(s).replace(/([/_])/g, '$1<wbr>');
const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
const TF = 'https://github.com/osu-uwrt/titan_firmware/blob/master/';
const narrowScreen = () => matchMedia('(max-width: 640px)').matches;
// After a tap on a phone, bring the response into view without jumping if it is already visible.
const reveal = (node) => { if (narrowScreen()) node.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };

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

const SHORT = { poac: 'POAC', esc: 'ESC', ccbb: 'Camera cage', led: 'LED', ivc: 'IVC', sbh: 'Battery' };
const LED = { RED: '#e34948', YEL: '#eda100', GRN: '#1baf7a', BLU: '#2a78d6', WHT: '#ffffff', CYA: '#2bc4c9', OFF: '#0f2633' };
const dot = (c, title = '') => `<i class="sw" style="--c:${c}"${title ? ` title="${title}"` : ''}></i>`;

Promise.all([
  fetch(BASE + 'data/firmware/firmware.json').then((r) => r.json()),
  fetch(BASE + 'data/firmware/pool_esc.json').then((r) => r.json()),
  fetch(BASE + 'data/firmware/esc_spots.json').then((r) => r.json()),
]).then(([fw, pool, spots]) => {
  escBoard(spots);
  libs(fw);
  life(fw);
  timerList(fw);
  canExplorer(fw, pool);
  killFlow();
  poolChart(pool);
  decoder(fw);
});

// ===================================================================== the ESC board, part by part
function escBoard(data) {
  const a = (path, text) => `<a href="${TF}${path}">${text}</a>`;
  // Parts in numbered order. zoom: drawn on the close-up of the microcontroller corner, else on the whole board.
  // at: the part the marker points to; b: where its numbered badge sits, as fractions of that picture,
  // offset from the part so the part itself stays visible (a leader line joins the two).
  const PARTS = [
    { at: 'U1R', b: [0.27, 0.53], zoom: true, t: 'RP2040 microcontroller', body: `Two Cortex-M0+ cores. Core 0 runs the main loop; core 1 runs the thruster loop. Its <a href="glossary.html#term-pio">PIO</a> blocks make the DShot signals and read the ESCs' telemetry lines (${a('talos/ESCBoard/include/dshot.h#L53-L56', 'dshot.h')}).` },
    { at: 'U2R', b: [0.88, 0.66], zoom: true, t: 'Flash, 16 MB', body: `Holds the bootloader (first 16 kB) and the application after it. Builds assume 2 MB (${a('lib/titan_boards/include/boards/mk2/blocks/rp2040_uwrt_block.h#L23', 'rp2040_uwrt_block.h')}), so most of the chip goes unused.` },
    { at: 'Y1R', b: [0.5, 0.29], zoom: true, t: '12 MHz crystal', body: `The RP2040's clock. The CAN chip gets its own: the RP2040 divides its 48 MHz USB clock to 4 MHz on GPIO 21, and the CAN chip multiplies that to 40 MHz (${a('lib/driver_canbus/src/can_mcp251XFD.c#L53-L54', 'can_mcp251XFD.c')}).` },
    { at: 'U1C', b: [0.12, 0.43], zoom: true, t: 'MCP2517FD CAN controller', body: 'On SPI 0 (GPIO 17–20) at 20 MHz, interrupt on GPIO 22, driven by <code>driver_canbus</code>. It can do CAN FD; Talos runs it as classic CAN.' },
    { at: 'U2C', b: [0.12, 0.25], zoom: true, t: 'CAN transceiver', body: 'Turns the controller\'s logic levels into the two-wire bus. No firmware of its own.' },
    { at: 'SW1C', b: [0.2, 0.05], zoom: true, t: 'Termination switch', body: 'Puts the 120 Ω terminator across the bus. The firmware reads its position and reports it in every CAN heartbeat. Only the two boards at the ends of the bus should have it on.' },
    { at: 'D1C', b: [0.9, 0.42], zoom: true, t: 'Status LED', body: 'RGB, on GPIO 13–15. Its colour is the board\'s state: the <a href="#loop">life cycle</a> below has every colour.' },
    { at: 'J1R', b: [0.4, 0.16], zoom: true, t: 'Tag-Connect debug pad', body: 'SWD for flashing and GDB, plus the debug UART (GPIO 16, 115200 baud), through a Picoprobe: a Pico flashed as a debug probe. It can also power the board, but only when nothing else is plugged in (<a href="https://github.com/osu-uwrt/titan_firmware/blob/master/docs/02_Testing_Firmware.md#connection-setup-1">testing docs</a>).' },
    { at: 'SW1R', b: [0.92, 0.1], zoom: true, t: 'RESET button', body: 'Restarts the RP2040, into the bootloader\'s boot delay like any reset.' },
    { at: 'SW2R', b: [0.92, 0.25], zoom: true, t: 'BOOT button', body: 'Held during a reset, it starts the RP2040\'s built-in USB loader instead (an <code>RPI-RP2</code> drive). Some Mark 2 boards have damaged BOOT buttons.' },
    { at: 'J11', b: [0.14, 0.9], zoom: true, t: 'USB', body: 'On this board, only for the RP2040\'s built-in USB loader: the ESC firmware has no USB console.' },
    { at: 'SB1', b: [0.12, 0.61], zoom: true, t: 'Board ID jumper', body: `Read on GPIO 29 at boot. Open: board 0, CAN client 2, thrusters 0–3. Bridged: board 1, client 3, thrusters 4–7. The silkscreen counts from 1 (ESC 1/5 … 4/8); software counts from 0 (${a('talos/ESCBoard/src/main.c#L36-L49', 'main.c')}).` },
    { at: 'J12', b: [0.84, 0.88], zoom: true, t: 'Signal breakout', body: 'The DShot and telemetry line of every ESC on one header, for a scope or logic analyser.' },
    { at: 'M1', b: [0.327, 0.4], t: 'APD 80F3 ESCs (four)', body: 'One per thruster; "ESC 1/5" is slot 1 on board 0 and slot 5 on board 1. Each gets DShot600 on its signal pin and answers on the same wire with its RPM. A second, one-way line sends temperature, voltage and current. The ESCs run APD\'s firmware, patched by the team so they reverse in DShot mode.' },
    { at: 'J7', b: [0.37, 0.84], t: 'FLASH CONN headers (one per ESC)', body: `Not for the RP2040: the ESCs' own firmware and settings are loaded through these with APD's tools (${a('talos/ESCBoard/esc_firmware_patching/README.md', 'README')}).` },
    { at: 'J6', b: [0.355, 0.075], t: 'Stack link', body: 'CAN high and low, 5 V and ground: the board\'s bus and its logic power.' },
    { at: 'R3', b: [0.1, 0.9], t: 'Supply sense', body: `R3 and R4 divide the thruster supply by 11 into the ADC on GPIO 28, so the firmware sees when a kill has cut thruster power (under 9 V; ${a('talos/ESCBoard/include/dshot.h#L28-L39', 'dshot.h')}) and waits for the ESCs to start once it returns (<a href="#poweron">below</a>).` },
  ];
  PARTS.forEach((p, i) => { p.n = i + 1; });
  const S = data.spots;
  const img = BASE + data.image;
  const [IW, IH] = data.image_px;
  const Z = { x0: 0.005, x1: 0.17, y0: 0.215, y1: 0.735 }; // the close-up window, as fractions of the image
  const zw = Z.x1 - Z.x0, zh = Z.y1 - Z.y0;
  const pct = (v) => (v * 100).toFixed(3) + '%';
  const where = (p) => { const s = S[p.at]; return p.zoom ? [(s.x - Z.x0) / zw, (s.y - Z.y0) / zh] : [s.x, s.y]; };
  const layer = (parts) => `<svg class="escx-lead" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${parts.map((p) => {
    const [x, y] = where(p);
    return `<line data-n="${p.n}" x1="${x * 100}" y1="${y * 100}" x2="${p.b[0] * 100}" y2="${p.b[1] * 100}" vector-effect="non-scaling-stroke"/>`;
  }).join('')}</svg>` + parts.map((p) => {
    const [x, y] = where(p);
    return `<span class="escx-dot" data-n="${p.n}" style="left:${pct(x)};top:${pct(y)}"></span><button type="button" class="escx-m" data-n="${p.n}" style="left:${pct(p.b[0])};top:${pct(p.b[1])}" aria-label="${p.n}: ${esc(p.t)}">${p.n}</button>`;
  }).join('');
  $('#escx-whole').innerHTML = `<div class="escx-pic" style="aspect-ratio:${IW}/${IH}"><img src="${img}" width="${IW}" height="${IH}" alt="Render of the ESC MK II board: the microcontroller corner on the left, four APD ESC modules across the middle, the thruster connector on the right and the power terminals along the bottom." loading="lazy">
    <span class="escx-box" style="left:${pct(Z.x0)};top:${pct(Z.y0)};width:${pct(zw)};height:${pct(zh)}"></span>${layer(PARTS.filter((p) => !p.zoom))}</div>`;
  $('#escx-zoom').innerHTML = `<div class="escx-pic zoomed" style="aspect-ratio:${(zw * IW).toFixed(1)}/${(zh * IH).toFixed(1)}">
    <img src="${img}" alt="Close-up of the microcontroller corner of the ESC board." loading="lazy" style="width:${pct(1 / zw)};left:${pct(-Z.x0 / zw)};top:${pct(-Z.y0 / zh)}">${layer(PARTS.filter((p) => p.zoom))}</div>`;
  const step = $('#escx-step');
  step.innerHTML = `<button type="button" class="btn" data-d="-1" aria-label="Previous part">‹</button><span id="escx-count"></span><button type="button" class="btn" data-d="1" aria-label="Next part">›</button>`;
  const note = $('#escx-note');
  const fig = $('#escx');
  let cur = 1;
  const pick = (n) => {
    cur = n;
    const p = PARTS[n - 1];
    fig.querySelectorAll('[data-n]').forEach((b) => b.classList.toggle('on', +b.dataset.n === n));
    $('#escx-count').textContent = `${n} / ${PARTS.length}`;
    note.innerHTML = `<b>${p.n} · ${esc(p.t)}</b> <span class="ref">${p.zoom ? 'in the close-up' : 'on the whole board'}</span><br>${p.body}`;
  };
  step.addEventListener('click', (e) => {
    const b = e.target.closest('[data-d]');
    if (b) pick(((cur - 1 + +b.dataset.d + PARTS.length) % PARTS.length) + 1);
  });
  fig.addEventListener('click', (e) => {
    const b = e.target.closest('.escx-m');
    if (b) { pick(+b.dataset.n); reveal(note); }
  });
  fig.addEventListener('mouseover', (e) => {
    const b = e.target.closest('.escx-m');
    if (b && matchMedia('(hover: hover)').matches) pick(+b.dataset.n);
  });
  pick(1);
}

// ===================================================================== libraries
function libs(fw) {
  const host = $('#libs');
  const all = fw.projects.map((p) => p.id);
  const used = fw.libs.filter((l) => l.used_by.length);
  const common = used.filter((l) => all.every((id) => l.used_by.includes(id))).sort((a, b) => a.name.localeCompare(b.name));
  const some = used.filter((l) => !common.includes(l)).sort((a, b) => b.used_by.length - a.used_by.length || a.name.localeCompare(b.name));
  const unused = fw.libs.filter((l) => !l.used_by.length).map((l) => l.name);
  host.innerHTML = `<div class="lib-h">In every board <small>tap one</small></div>
    <div class="lib-common" role="group" aria-label="Libraries in every board">${common.map((l, i) => `<button type="button" data-i="${i}" aria-pressed="false">${esc(l.name)}</button>`).join('')}</div>
    <div class="lib-desc" id="lib-desc" aria-live="polite"></div>
    <div class="lib-h">Only in some boards</div>
    <ul class="lib-some">${some.map((l) => `<li><span class="ln"><a href="${l.url}">${esc(l.name)}</a></span><span class="ld">${esc(l.desc)}</span><span class="lb">${l.used_by.map((id) => `<span>${esc(SHORT[id] === 'Battery' ? 'Battery housing' : SHORT[id])}</span>`).join('')}</span></li>`).join('')}</ul>
    ${(() => { const only = fw.projects.filter((p) => !some.some((l) => l.used_by.includes(p.id))); return only.length ? `<p class="lib-only">${only.map((p) => esc(p.name)).join(', ')}: only the ${common.length} above.</p>` : ''; })()}
    <p class="lib-unused">In the repository, used by no Talos board: ${unused.map((n) => `<code>${esc(n)}</code>`).join(', ')}.</p>`;
  const desc = $('#lib-desc');
  const show = (i) => {
    host.querySelectorAll('.lib-common button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.i === i)));
    const l = common[i];
    desc.innerHTML = `<a href="${l.url}"><code>${esc(l.name)}</code></a> ${esc(l.desc)}`;
  };
  host.querySelector('.lib-common').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(+b.dataset.i); });
  show(common.findIndex((l) => l.name === 'titan_safety'));
}

// ===================================================================== life cycle
function life(fw) {
  const s = fw.safety, bl = fw.bootloader;
  const S = [
    { id: 'power', led: [LED.OFF], t: 'Power on or reset', sub: 'LED off', exits: [{ to: 'delay' }],
      body: ['The RP2040\'s boot ROM starts the titan bootloader in the first 16 kB of flash.', 'Every reset comes here: power-up, a crash, a reflash, or <code>reboot</code> from <code>canmore_cli</code>.'] },
    { id: 'delay', led: [LED.WHT], t: 'Boot delay', sub: `${bl.boot_delay_ms} ms, in the bootloader`, exits: [{ to: 'start', when: 'if the CRC is ok' }, { to: 'blmode', when: 'on a request or a bad CRC' }],
      body: ['Starts the CAN chip and sends a heartbeat saying "boot delay", so tools can see it.', `Listens ${bl.boot_delay_ms} ms for a bootloader request on channel 14. <code>upload_tool -w</code> sends one to rescue a board whose application crashes at once.`, 'Then checks the CRC-32 of the application\'s first flash page and jumps to it.'] },
    { id: 'blmode', side: true, led: [LED.CYA], t: 'Bootloader mode', sub: 'taking a new image', exits: [{ to: 'power', when: `when done, or after ${bl.bootloader_timeout_sec} s idle`, reset: true }],
      body: ['Takes a new image over CAN channel 14: write a buffer, write it to flash, verify.', 'The LED is cyan, blinking blue.', `Reboots when the upload finishes, or after ${bl.bootloader_timeout_sec} s with no traffic, so a board can't get stuck here.`] },
    { id: 'start', led: [LED.RED], t: 'Start-up', sub: `watchdog ${s.watchdog_setup_ms / 1000} s`, exits: [{ to: 'wait' }],
      body: ['<code>safety_setup()</code> first: the watchdog, the last reset cause, and <code>WATCHDOG_RESET</code> if that was a crash.', 'The POAC board sets its soft-kill pin to "kill" before anything else.', 'Drivers, then the CAN chip. If the CAN chip won\'t start, the board resets and tries again.'] },
    { id: 'wait', led: [LED.YEL], t: 'Waiting for the agent', sub: 'ping every 1 s, killed', exits: [{ to: 'run', when: 'when the agent answers' }],
      body: ['Pings the micro-ROS agent once a second.', 'Sends a CAN heartbeat every 500 ms.', 'Still killed. The LED is yellow once another node acknowledges its frames, red if none does.'] },
    { id: 'run', led: [LED.GRN, LED.BLU], t: 'Connected', sub: `watchdog ${s.watchdog_active_ms} ms`, exits: [{ to: 'lost', when: 'if 8 heartbeats in a row fail (about 0.8 s)' }],
      body: [`Creates its node, publishers and subscribers, then <code>safety_init()</code>: watchdog down to ${s.watchdog_active_ms} ms, kill switches live.`, 'Publishes a heartbeat topic every 100 ms and <code>state/firmware</code> every second.', 'LED green while killed, blue while enabled.'] },
    { id: 'lost', side: true, led: [LED.YEL], t: 'Lost the agent', sub: 'killed, node torn down', exits: [{ to: 'wait', when: 'to ping again' }],
      body: ['Eight heartbeat publishes in a row (one every 100 ms) failed: the agent is gone or the bus is broken.', `Tears down the node and kills the board; the watchdog relaxes to ${s.watchdog_setup_ms / 1000} s.`, 'Nothing needs a reboot.'] },
    { id: 'crash', side: true, led: [LED.RED], ring: true, t: 'Crash', sub: 'from any state; logged, then reset', exits: [{ to: 'power', reset: true }],
      body: [`A watchdog timeout (a loop pass over ${s.watchdog_active_ms} ms, or ${s.watchdog_setup_ms / 1000} s before connecting), a panic, a hard fault, a failed assert, or core 1 missing its ${s.core1_checkin_ms} ms check-in.`, `The reason, uptime and fault bits go into the crash log (${s.crash_log_entries} entries).`, 'The board restarts from the bootloader and comes back killed, its LED flashing red because <code>WATCHDOG_RESET</code> is raised.'] },
  ];
  const by = Object.fromEntries(S.map((x) => [x.id, x]));
  const host = $('#life');
  host.innerHTML = `<ol class="lc">${S.map((x) => `<li class="lc-row${x.side ? ' side' : ''}" data-id="${x.id}">
      <button type="button" class="lc-head" aria-expanded="false"><span class="lc-led${x.ring ? ' ring' : ''}">${x.led.map((c) => dot(c)).join('')}</span><span class="lc-t">${esc(x.t)}</span>${x.sub ? `<span class="lc-sub">${esc(x.sub)}</span>` : ''}</button>
      <div class="lc-exits">${x.exits.map((e) => `<span>${e.reset ? '<b class="lc-reset">reset ↺</b> ' : ''}→ <button type="button" class="lc-go" data-go="${e.to}">${esc(by[e.to].t)}</button>${e.when ? ` ${esc(e.when)}` : ''}</span>`).join('')}</div>
      <ul class="lc-body" hidden>${x.body.map((b) => `<li>${b}</li>`).join('')}</ul></li>`).join('')}</ol>`;
  const open = (id, scroll) => {
    host.querySelectorAll('.lc-row').forEach((r) => {
      const on = r.dataset.id === id;
      r.classList.toggle('open', on);
      r.querySelector('.lc-head').setAttribute('aria-expanded', String(on));
      r.querySelector('.lc-body').hidden = !on;
      if (on && scroll) reveal(r);
    });
  };
  host.addEventListener('click', (e) => {
    const go = e.target.closest('.lc-go');
    if (go) return open(go.dataset.go, true);
    const h = e.target.closest('.lc-head');
    if (h) {
      const r = h.closest('.lc-row');
      open(r.classList.contains('open') ? null : r.dataset.id, false);
    }
  });
  open('run');
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
    SERVO_UPDATE_CMD_STATUS_PERIOD_MS: ['Actuator command feedback', '', 'ros'],
    TELEM_PUBLISH_RATE_MS: ['<code>state/thrusters/telemetry</code>', '', 'ros'],
    WATER_TEMP_PUBLISH_INTERVAL_MS: ['<code>state/depth/temp</code>', 'while depth readings are valid', 'ros'],
    LEAK_PUBLISH_INTERVAL_MS: ['<code>state/leak</code>', 'the publish is commented out', 'ros', true],
    BATTERY_STATUS_TIME_MS: ['<code>state/battery</code>', '', 'ros'],
    PWRCYCL_CHECK_INTERVAL_MS: ['Power-cycle check', 'defined, not used', 'bg', true],
  };
  const EXTRA = {
    esc: [['Thruster loop on core 1', 'at most this often; 2376 Hz in the pool', 'bg', fw.esc.dshot_min_frame_time_us / 1000]],
    ccbb: [['Depth reading', '<code>state/depth/raw</code>', 'ros', fw.depth.polling_ms]],
  };
  // What a board does with each subscription, where the name doesn't say (read from each board's ros.c on master).
  const SUBNOTE = {
    'state/kill': 'its kill slot: true, or 500 ms of silence, kills the board',
    'poac:command/software_kill': 'the three software kill slots',
    'sbh:state/leak': 'its leak shutdown is commented out',
    'state/physkill_notify': 'flashes when the kill switch moves',
    'command/thruster_rpm': 'eight RPMs, four per board; the MPC uses raw CAN instead',
    'poac:command/electrical': 'acts on ENABLE_FANS, DISABLE_FANS',
    'ccbb:command/electrical': 'acts on CYCLE_COMPUTER, fans, LEDs, CLEAR_DEPTH',
    'sbh:command/electrical': 'acts on CYCLE_ROBOT, KILL_ROBOT_POWER',
    'led:state/depth/raw': 'full brightness only underwater',
  };
  const GROUPS = [
    { t: 'Many times a second', max: 150 },
    { t: 'A few times a second', max: 500 },
    { t: 'Once a second', max: Infinity },
  ];
  const host = $('#timer-list');
  const fmt = (ms) => (ms < 1 ? (ms * 1000).toFixed(0) + ' µs' : ms >= 1000 ? ms / 1000 + ' s' : ms + ' ms');
  // Tasks every board runs, said once above the board's own list.
  const COMMON = ['UROS_CONNECT_PING_TIME_MS', 'HEARTBEAT_TIME_MS', 'FIRMWARE_STATUS_TIME_MS', 'LED_UPTIME_INTERVAL_MS'];
  const draw = (id) => {
    const p = fw.projects.find((q) => q.id === id);
    const rows = p.timers.filter((t) => !COMMON.includes(t.name)).map((t) => {
      const [what, sub, kind, off] = NAME[t.name] || [t.name, '', 'ros'];
      return { what, sub, kind, ms: t.ms, off: off || !t.used };
    }).filter((r) => !r.off); // dead code (defined but unused, or its publish commented out) stays out
    for (const [what, sub, kind, ms] of EXTRA[id] || []) rows.push({ what, sub, kind, ms });
    rows.sort((a, b) => a.ms - b.ms);
    let lo = 0;
    const groups = GROUPS.map((g) => { const r = rows.filter((x) => x.ms > lo && x.ms <= g.max); lo = g.max; return { ...g, rows: r }; }).filter((g) => g.rows.length);
    const note = (t) => SUBNOTE[id + ':' + t.topic] || SUBNOTE[t.topic];
    host.innerHTML = `<p class="tm-key">Besides what every board does (the <a href="#loop">life cycle</a> above). <span class="tm-ros">ROS</span> runs only while the agent is connected; the rest always runs.</p>
      ${id === 'sbh' ? '<p class="tm-off">No agent on <code>can1</code> since 27 Oct 2026 (<a href="https://github.com/osu-uwrt/riptide_core/commit/720bdd9">720bdd9</a>), so for now the housings\' ROS tasks don\'t run.</p>' : ''}
      ${groups.length ? '' : '<p class="tm-none">Nothing else on a timer: this board acts on what it hears.</p>'}${groups.map((g) => `<div class="tm-g">${g.t}</div>${g.rows.map((r) => `<div class="tm-row${r.off ? ' unused' : ''}">
        <span class="what">${r.kind === 'ros' ? '<span class="tm-ros">ROS</span>' : ''}${r.what}${r.sub ? `<small>${r.sub}</small>` : ''}</span>
        <span class="every">${fmt(r.ms)}</span></div>`).join('')}`).join('')}
      <details class="fw-more tm-subs"><summary>Listens to: ${p.subscribes.length} topics</summary><ul>${p.subscribes.map((t) => `<li><code>${brk(t.topic)}</code>${note(t) ? ` <span>${note(t)}</span>` : ''}</li>`).join('')}</ul></details>`;
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
  const list = [f('client', 'Client ID', top, top - 4), f('type', 'Type', top - 5, top - 5), f('dir', 'Direction', top - 6, top - 6), f('noc', 'NOC (number or channel)', top - 7, top - 10)];
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
  host.innerHTML = `<div class="seg cx-mode" role="group" aria-label="Frame kind" id="cx-mode"></div>
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
    { id: 'hb', label: 'Heartbeat' }, { id: 'thr', label: 'Thrusters' }, { id: 'msg', label: 'ROS message' },
    { id: 'bl', label: 'Bootloader' }, { id: 'raw', label: 'Decode a frame' },
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
        <label><input type="checkbox" data-k="bug"${st.bug ? ' checked' : ''}> what firmware before the 10 Oct 2026 fix heard</label>`;
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
      return { pairs: true, html: `${cl === 2 || cl === 3 ? '' : '<span class="cx-err">Only clients 2 and 3 (the ESC boards) take thruster frames.</span><br>'}Four RPM targets, two bytes each, high byte first (signed 16-bit). The board keeps them for 500 ms.<table>${rows.join('')}</table>` };
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
    frameHost.hidden = false;
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
    const labs = fl.map((f) => `<span class="f" data-f="${f.key}" style="grid-column:${nbits - f.hi} / span ${f.hi - f.lo + 1};--fs:var(${FCOL[f.key]})">${f.hi - f.lo >= 3 ? esc(f.key === 'noc' ? 'NOC' : f.name) : ''}</span>`).join('');
    const bin = (f) => f.value.toString(2).padStart(f.hi - f.lo + 1, '0');
    const pm = payloadMeaning(fr);
    const bytes = fr.data.map((v, i) => `<span class="${pm.pairs ? 'pair' + (i >> 1) % 2 : ''}">${hex(v, 2)}</span>`).join('');
    const us = frameBits(fr.ext, fr.data.length);
    frameHost.innerHTML = `<div class="cx-fhead"><b>${fr.ext ? hex(fr.id, 8) : hex(fr.id, 3)}</b><span>${fr.ext ? 'extended, 29-bit ID' : 'standard, 11-bit ID'}</span><span>${fr.data.length} data byte${fr.data.length === 1 ? '' : 's'}</span><span>≥ ${us} µs of the bus</span>${caption ? `<span>${caption}</span>` : ''}</div>
      <div class="cx-bits" style="${cols}" aria-hidden="true">${cells}${nums}${labs}</div>
      <ul class="cx-fields">${fl.map((f) => `<li data-f="${f.key}" style="--fs:var(${FCOL[f.key]})"><span class="fn"><i></i>${esc(f.name)}</span><span class="fb">${f.hi === f.lo ? 'bit ' + f.hi : `bits ${f.hi}–${f.lo}`}</span><code class="fv">${bin(f)}</code><span class="fm">${esc(f.meaning)}</span></li>`).join('')}</ul>
      <div class="cx-data"><h4>Data</h4><div class="cx-bytes">${bytes || '<span>none</span>'}</div><div class="cx-meaning">${pm.html}</div></div>`;
    const hot = (k) => frameHost.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('hot', x.dataset.f === k));
    frameHost.querySelectorAll('[data-f]').forEach((x) => {
      x.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hot(x.dataset.f); });
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
      sum.innerHTML = `What <code>send_thruster_cmd_canbus</code> writes for board ${st.tBoard} every 50 ms. Defaults: the MPC's command at t = ${st.tTime.toFixed(2)} s of the pool window below (2026-10-24). Change any value. Firmware before 10 Oct 2026 (<a href="https://github.com/osu-uwrt/titan_firmware/commit/3135fe2">3135fe2</a>) read each value's high byte twice: tick the box to see what it heard.`;
      drawFrame({ id: stdId(cl, 1, 1, 0), ext: false, data });
    } else if (m === 'msg') {
      // a stand-in payload: deterministic bytes, not a real XRCE packet
      let x = 0x2545f491;
      const payload = Array.from({ length: st.mLen }, () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) & 0xff; });
      const frames = encodeMsg(st.mClient, st.mDir, payload);
      const bits = frames.reduce((s, f) => s + frameBits(f.ext, f.data.length), 0);
      sum.innerHTML = `<b>${frames.length}</b> frame${frames.length > 1 ? 's' : ''} for <b>${st.mLen}</b> bytes (example bytes standing in for a micro-ROS packet): <b>${bits} µs</b> of the bus at 1 Mbit/s, of which ${(100 * st.mLen * 8 / bits).toFixed(0)} % is payload. Tap a frame.`;
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
      if (r.err) { sum.innerHTML = `<span class="cx-err">${esc(r.err)}</span>`; frameHost.innerHTML = ''; frameHost.hidden = true; return; }
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

// ===================================================================== kill: inputs, decision, relay
function killFlow() {
  const INFO = {
    sw: '<b>Kill switch.</b> The magnetic handle on the port bow window. Its line goes to the POAC board twice: to GPIO 1 as slot 0 (read on an interrupt and every tick), and through an analog switch straight to the thruster power MOSFETs. Pull it and thruster power goes, whatever the software says (<a href="boards.html#kill">the circuit</a>).',
    soft: '<b>Software kill, slots 1–3.</b> Reports on <code>command/software_kill</code>, carried over Zenoh to <code>copro_agent</code> on the Orin and from there over CAN to the POAC board. Slot 1 (<code>KILL_SWITCH_RQT_CONTROLLER</code>, a legacy name) is the Nereus viewer\'s Enable button: it sends every 50 ms and latches. Slot 2 is a topside kill box, not in regular use; slot 3 is the command line and scripts. Details: <a href="commanding.html#kill">Commanding Talos</a>.',
    poac: '<b>POAC board: the only board that decides.</b> Killed if no slot has reported yet, if any slot asserts kill, or if a slot that must repeat has gone quiet for 500 ms. It drives the soft-kill pin, and publishes the result on <code>state/kill</code> every 150 ms and at once on a change.',
    pwr: '<b>Thruster power</b> (<code>MOTOR_PWR</code>). Three P-channel MOSFETs, on only while the switch is in <em>and</em> the POAC board\'s soft-kill pin says run. Everything else (Orin, sensors, boards) stays on.',
    agent: '<b><code>copro_agent</code> on the Orin.</b> Every micro-ROS topic on the internal bus goes through it, <code>state/kill</code> included. If it dies, the followers hear nothing and kill themselves 500 ms later; the POAC board loses its agent too and kills itself.',
    esc: '<b>ESC boards.</b> One kill slot, fed by <code>state/kill</code>. Killed: zero throttle and <code>SAFETY_KILLED</code>. Their power is cut too, so they wait for the ESCs to restart before the first thrust (<a href="#poweron">the power-on delay</a>).',
    ccbb: '<b>Camera cage board.</b> One slot fed by <code>state/kill</code>. A kill only changes its status LED; depth keeps publishing.',
    led: '<b>LED board.</b> One slot fed by <code>state/kill</code>. It also flashes the lights when the kill switch moves (<code>state/physkill_notify</code>).',
    ivc: '<b>IVC board.</b> One slot fed by <code>state/kill</code>; a kill only changes its status LED.',
    sbh: '<b>Battery housings</b>, on the external bus. Their firmware listens to <code>state/kill</code>, but the <code>can1</code> agent has been commented out since 27 Oct 2026 (<a href="https://github.com/osu-uwrt/riptide_core/commit/720bdd9">720bdd9</a>), so nothing reaches them.',
  };
  const box = (k, t, sub, cls = '') => `<button type="button" class="kf-box ${cls}" data-k="${k}"><b>${t}</b>${sub ? `<small>${sub}</small>` : ''}</button>`;
  const link = (area, kind, html) => `<div class="kf-l ${kind}" style="grid-area:${area}"><i aria-hidden="true"></i><span>${html}</span></div>`;
  const head = (area, n, t, cls = '') => `<h4 class="${cls}" style="grid-area:${area}"><span>${n}</span>${t}</h4>`;
  const host = $('#killflow');
  // One grid, two templates (firmware.css): five columns on wide screens, a single column that splits in two
  // for stage 3 on phones. Every arrow sits in the same grid row as the box it leaves and the box it reaches.
  host.innerHTML = `<div class="kf">
    ${head('h1', '1', 'Inputs')}${head('h2', '2', 'Decide')}
    ${head('h3', '3', 'Cut power, relay', 'wide')}${head('h3a', '3a', 'Cut power', 'narrow')}${head('h3b', '3b', 'Relay', 'narrow')}
    <div class="kf-hw" aria-hidden="true"><i class="a"></i><i class="b"><span>switch line, in hardware: no software in the way</span></i><i class="c"></i></div>
    <div class="kf-hwn" aria-hidden="true"><span>switch line, in hardware</span></div>
    <div style="grid-area:sw">${box('sw', 'Kill switch', 'handle on the port bow window')}</div>
    <div style="grid-area:soft">${box('soft', '<code>command/<wbr>software_kill</code>', 'slot 1 Nereus viewer · slot 2 topside · slot 3 debug')}</div>
    ${link('lsw', 'wire', 'switch line → slot 0')}
    ${link('lsoft', 'topic', '<code>software_kill</code> via the Orin → slots 1–3')}
    <div style="grid-area:poac" class="kf-poac">${box('poac', 'POAC board', '4 slots, one rule', 'main')}</div>
    ${link('lpwr', 'wire', 'soft-kill pin')}
    ${link('lkill', 'topic', '<code>state/kill</code> every 150 ms')}
    <div style="grid-area:pwr">${box('pwr', 'Thruster power', '<code>MOTOR_PWR</code> to both ESC boards')}</div>
    <div style="grid-area:agent">${box('agent', 'Orin: <code>copro_agent</code>', 'micro-ROS agent on <code>can0</code>')}</div>
    ${link('lfol', 'topic', '<code>state/kill</code> to each follower')}
    <div class="kf-follow" style="grid-area:fol">
      ${box('esc', 'ESC boards ×2')}${box('ccbb', 'Camera cage')}${box('led', 'LED board')}${box('ivc', 'IVC board')}
      ${box('sbh', 'Battery housings', 'no <code>can1</code> agent since 720bdd9', 'off')}
    </div>
  </div>
  <div class="graph-note kf-note" id="kill-note" aria-live="polite"></div>`;
  const note = $('#kill-note');
  const pick = (k, scroll) => {
    host.querySelectorAll('.kf-box').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    note.innerHTML = INFO[k];
    if (scroll) reveal(note);
  };
  host.addEventListener('click', (e) => { const b = e.target.closest('.kf-box'); if (b) pick(b.dataset.k, true); });
  pick('poac');
}

// ===================================================================== pool telemetry
function poolChart(pool) {
  const INVERTED = [0, 3, 4, 7]; // core1_init: mask 0b1001 on both boards
  let th = 0, raw = false;
  const read = $('#pool-read');
  const idle = 'Tap the chart to read a moment.';
  // The target is on CAN at 20 Hz, the ESC's reply only at 2 Hz: say when the ESC sample was taken.
  const fmt = (x, picks) => {
    const [tg, es] = picks;
    const r = (v) => Math.round(v).toLocaleString('en-US').replace('-', '−');
    return `<span class="rx">t = ${x.toFixed(1)} s</span>${tg ? `<span><i style="background:${tg.s.color}"></i>target <b>${r(tg.p.y)}</b></span>` : ''}${es ? `<span><i style="background:${es.s.color}"></i>ESC <b>${r(es.p.y)}</b> <span class="rx">(sample at ${es.p.x.toFixed(1)} s)</span></span>` : ''}`;
  };
  const rpm = new LineChart($('#pool-rpm'), { height: 230, xLabel: 'time (s)', yLabel: 'RPM', digits: 0, xDigits: 1, readout: read, readoutIdle: idle, readoutFormat: fmt, xStep: (W) => (W < 560 ? 20 : 10) });
  read.textContent = idle;
  const draw = () => {
    const b = th >> 2, s = th & 3;
    const flip = !raw && INVERTED.includes(th) ? -1 : 1;
    const target = pool.req.map((r) => ({ x: r[0], y: r[1 + th] }));
    const tel = pool.tel.filter((x) => x.b === b);
    rpm.set([
      // a thinner, lighter target line on a phone, where a noisy thruster's 20 Hz targets otherwise blur into a band
      { name: 'target on CAN', color: 'var(--reference)', values: target, width: narrowScreen() ? 1 : 1.6, opacity: narrowScreen() ? 0.8 : 1 },
      { name: `ESC reported${flip < 0 ? ' (sign flipped)' : ''}`, color: 'var(--state)', values: tel.map((x) => ({ x: x.t, y: flip * x.esc[s][0] })), points: true, r: 3, opacity: 0.9 },
    ], { yZero: true });
    read.textContent = idle;
    const temps = tel.map((x) => x.esc[s][2]);
    const st = pool.stats;
    $('#pool-stats').innerHTML = `<li><b>${THRUSTERS[th]}</b> is thruster ${th}: ESC board ${b}, slot ${s}${INVERTED.includes(th) ? ', a reversed motor' : ''}. ESC temperature ${Math.min(...temps)}–${Math.max(...temps)} °C.</li>
      <li>The core 1 loop ran at <b>${st.loop_hz_median} Hz</b> all run.</li>
      <li><code>disabled_flags</code> stayed <b>${st.flags_seen.join(', ')}</b>: nothing held the thrusters at zero.</li>`;
  };
  seg($('#pool-pick'), THRUSTERS.map((n, i) => ({ id: String(i), label: n })), '0', (id) => { th = +id; draw(); });
  $('#pool-raw').addEventListener('change', (e) => { raw = e.target.checked; draw(); });
  draw();
}

// ===================================================================== status decoder
function decoder(fw) {
  const host = $('#decoder');
  const FIELDS = {
    faults: { label: 'faults', what: 'One bit per fault raised since boot. Any set bit flashes the LED red.', ex: '0x1', exNote: 'the board came back from a crash' },
    flags: { label: 'disabled_flags (telemetry)', what: 'Why core 1 is holding all four thrusters at zero. 0 means it is free to spin them.', ex: '0x3', exNote: 'a killed ESC board, its power cut' },
    enabled: { label: 'kill_switches_enabled', what: 'Slots that have reported at least once since the board booted. Slot 0 always has.', ex: '0x3', exNote: 'the switch and the Nereus viewer have reported' },
    asserting: { label: 'kill_switches_asserting_kill', what: 'Slots whose last report says kill. Any one kills the robot.', ex: '0x1', exNote: 'the kill switch is out' },
    needs: { label: 'kill_switches_needs_update', what: 'Slots whose report must repeat within 500 ms. The switch refreshes its own every tick; the viewer\'s latches.', ex: '0x1', exNote: 'only the switch slot must repeat' },
    timed: { label: 'kill_switches_timed_out', what: 'Needs-update slots that have gone quiet for over 500 ms. Any one kills the robot.', ex: '0x0', exNote: 'nothing has timed out' },
  };
  host.innerHTML = `<div class="dec"><div class="row"><label>Board <select id="dec-board">${fw.projects.map((p) => `<option value="${p.id}"${p.id === 'esc' ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
    <label>Field <select id="dec-field"></select></label></div>
    <p class="dec-what" id="dec-what"></p>
    <div class="row"><label><span id="dec-label"></span> = <input id="dec-val" type="text" value="" spellcheck="false" autocomplete="off"></label></div>
    <div class="verdict" id="dec-verdict"></div>
    <ol class="dec-bits" id="dec-table"></ol></div>`;
  const SLOTS = [
    { bit: 0, name: 'KILL_SWITCH_PHYSICAL', desc: 'The kill switch: asserting kill while it is out' },
    { bit: 1, name: 'KILL_SWITCH_RQT_CONTROLLER', desc: 'Slot 1: the Nereus viewer' },
    { bit: 2, name: 'KILL_SWITCH_TOPSIDE_BUTTON', desc: 'Slot 2: a topside kill box' },
    { bit: 3, name: 'KILL_SWITCH_DEBUG', desc: 'Slot 3: the command line and scripts' },
  ];
  const FLAGDESC = {
    SAFETY_KILLED: 'The board is killed', ESC_BOARD_OFF: 'ESC supply under 9 V: thruster power is cut', ESC_POWERON_DELAY: 'Under 5 s since ESC power returned',
    TGT_RPM_STALE: 'No RPM target for 500 ms', TGT_RPM_STALE_PENALTY: '1 s lockout after targets went stale mid-spin', CONTROLLER_UNCONFIGURED: 'A tuning value was never set',
  };
  let board = 'esc', field = 'flags';
  const fieldsFor = (id) => ['faults', ...(id === 'esc' ? ['flags'] : []), ...(id === 'poac' ? ['enabled', 'asserting', 'needs', 'timed'] : [])];
  const sel = $('#dec-field'), val = $('#dec-val');
  const setField = () => {
    const fs = fieldsFor(board);
    if (!fs.includes(field)) field = fs[0];
    sel.innerHTML = fs.map((f) => `<option value="${f}"${f === field ? ' selected' : ''}>${esc(FIELDS[f].label)}</option>`).join('');
    val.value = FIELDS[field].ex;
  };
  const draw = () => {
    const p = fw.projects.find((q) => q.id === board);
    const txt = val.value.trim();
    const v = /^0x[0-9a-f]+$/i.test(txt) ? parseInt(txt, 16) : /^\d+$/.test(txt) ? parseInt(txt, 10) : NaN;
    $('#dec-label').textContent = FIELDS[field].label.split(' ')[0];
    $('#dec-what').textContent = FIELDS[field].what;
    let rows;
    if (field === 'faults') rows = p.faults.map((f) => ({ bit: f.bit, name: f.name, desc: f.desc + (f.raised ? '' : ' Never raised in this board\'s code.'), quiet: !f.raised }));
    else if (field === 'flags') rows = fw.esc.disabled_flags.map((f) => ({ bit: f.bit, name: f.name, desc: FLAGDESC[f.name] || '' }));
    else rows = SLOTS.map((r) => ({ ...r }));
    const ver = $('#dec-verdict');
    if (Number.isNaN(v) || v < 0 || v > 0xffffffff) {
      ver.className = 'verdict bad';
      ver.textContent = 'Type a whole number, like 3 or 0x3.';
      rows.forEach((r) => (r.on = false));
    } else {
      const set = rows.filter((r) => Math.floor(v / 2 ** r.bit) % 2 === 1);
      const unknown = [];
      for (let b = 0; b < 32; b++) if (Math.floor(v / 2 ** b) % 2 === 1 && !rows.find((r) => r.bit === b)) unknown.push(b);
      rows.forEach((r) => (r.on = set.includes(r)));
      ver.className = 'verdict' + (set.length ? ' bad' : '');
      const list = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1] : String(a[0]));
      const ex = txt.toLowerCase() === FIELDS[field].ex ? ` <span class="unk">(The example: ${FIELDS[field].exNote}.)</span>` : '';
      ver.innerHTML = (set.length ? `Set: ${set.map((r) => `<code>${brk(r.name)}</code>`).join(', ')}.` : 'Nothing set.') +
        (unknown.length ? ` <span class="unk">${unknown.length > 1 ? 'Bits' : 'Bit'} ${list(unknown)} ${unknown.length > 1 ? 'aren\'t' : 'isn\'t'} defined here.</span>` : '') + ex;
    }
    $('#dec-table').innerHTML = rows.map((r) => `<li class="${r.on ? 'on' : ''}${r.quiet ? ' quiet' : ''}"><span class="bit">${r.bit}</span><span class="nm">${brk(r.name)}</span><span class="ds">${esc(r.desc)}</span></li>`).join('');
  };
  $('#dec-board').addEventListener('change', (e) => { board = e.target.value; setField(); draw(); });
  sel.addEventListener('change', () => { field = sel.value; val.value = FIELDS[field].ex; draw(); });
  val.addEventListener('input', draw);
  setField();
  draw();
}
