import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/boards.css';

setup();
const BASE = import.meta.env.BASE_URL;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const code = (t) => `<code>${esc(t)}</code>`;
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Public images: the src is set here from BASE_URL (a root-absolute src in the HTML gets the base prefixed twice by the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });

// "For board designers" is collapsed: a link to it, or to anything inside it, opens it.
{
  const deep = document.getElementById('design');
  const openFor = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const el = id && document.getElementById(id);
    if (el && deep.contains(el) && !deep.open) { deep.open = true; el.scrollIntoView(); }
  };
  addEventListener('hashchange', openFor);
  openFor();
}

// ---------------------------------------------------------------------------------------------- lightbox
// A schematic opens at 1:1 pixels, scrolled to the part its button names (data-at = fraction x,y of the sheet).
// "Fit" shows the whole sheet; the dialog then shrinks to the sheet's height so a wide sheet isn't a strip in a tall box.
{
  const dlg = document.getElementById('bx-lightbox');
  const box = dlg.querySelector('.bx-lb-scroll');
  const zoom = dlg.querySelector('.bx-zoom-toggle');
  const close = () => dlg.close();
  const setZoom = (on, fx = 0.5, fy = 0.5) => {
    const img = box.querySelector('img');
    if (!img) return;
    dlg.classList.toggle('zoomed', on);
    // Zoomed, the sheet is 1800 px wide: a short sheet gets a dialog only as tall as it is.
    dlg.style.setProperty('--ih', `${Math.round(1800 * img.naturalHeight / img.naturalWidth) + 16}px`);
    zoom.setAttribute('aria-pressed', String(on));
    zoom.textContent = on ? 'Fit' : 'Zoom';
    if (on) box.scrollTo(fx * img.offsetWidth - box.clientWidth / 2, fy * img.offsetHeight - box.clientHeight / 2);
    else box.scrollTo(0, 0);
  };
  dlg.querySelector('.bx-close').addEventListener('click', close);
  dlg.addEventListener('close', () => document.body.classList.remove('bx-lb-open'));
  zoom.addEventListener('click', () => setZoom(!dlg.classList.contains('zoomed')));
  box.addEventListener('click', (e) => {
    if (e.target.tagName !== 'IMG') return;
    const r = e.target.getBoundingClientRect();
    setZoom(!dlg.classList.contains('zoomed'), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.querySelectorAll('.bx-zoom').forEach((b) => b.addEventListener('click', () => {
    const [fx, fy] = (b.dataset.at || '0.5,0.5').split(',').map(Number);
    box.innerHTML = `<img src="${BASE + b.dataset.full}" alt="${esc(b.getAttribute('aria-label') || '')}">`;
    document.body.classList.add('bx-lb-open');
    dlg.showModal();
    const img = box.querySelector('img');
    const go = () => setZoom(true, fx, fy);
    if (img.complete) go(); else img.addEventListener('load', go, { once: true });
  }));
}

// ---------------------------------------------------------------------------------------------- shared data
const sysData = fetch(BASE + 'data/boards/system.json').then((r) => r.json());
let explorer = null;

// A board's ROS topics, each with the Orin-side code that uses it: → who reads a published topic, ← who sends a
// subscribed one. `extra` adds topics from a firmware branch that isn't on master.
function topicBlock(ros, users, extra) {
  if (!ros) return '';
  const who = (name, dir) => {
    const u = (users[name] || []).filter((x) => (dir === 'from' ? x.dir !== 'reads' : x.dir !== 'sends'));
    return u.map((x) => `<span class="sys-u">${dir === 'from' ? '←' : '→'} <a href="${x.href}" title="${esc(x.file)}">${esc(x.label || x.file)}</a>${x.what ? `: ${esc(x.what)}` : ''}</span>`).join('');
  };
  const col = (head, list, dir) => `<div><b>${head}</b>${list.length ? `<ul>${list.map((n) => `<li>${code(n)}${who(n, dir)}</li>`).join('')}</ul>` : '<p class="sys-none">nothing</p>'}</div>`;
  let h = `<div class="sys-topics">${col('Publishes <span class="sys-k">→ read on the Orin by</span>', ros.publishes, 'to')}${col('Subscribes <span class="sys-k">← sent by</span>', ros.subscribes, 'from')}</div>`;
  if (extra) h += `<p class="sys-extra">${extra.note}</p><div class="sys-topics">${col('Publishes', extra.publishes, 'to')}${col('Subscribes', extra.subscribes, 'from')}</div>`;
  return h;
}

// ---------------------------------------------------------------------------------------------- the bus, as a list
// The internal CAN chain in cable order (2026 TDR, Fig. 15), one card per board, joined by one blue line. The external
// bus is a dashed line from the camera cage breakout to the Orin HAT, with the battery housings branching off it.
// Devices are text inside the card that drives them, never boxes of their own. A tap opens a card in place.
sysData.then(buildSpine);

function buildSpine(sys) {
  const list = document.getElementById('sp');
  const B = sys.boards;
  const fw = (id) => (B[id]?.firmware ? `<a href="${B[id].firmware.url}">${code(B[id].firmware.project)}</a>` : '');
  // Each card: name, job and CAN chip; opened, one line of its own plus links. The sections below hold the details.
  const R = [
    { sec: 'Board stack · port hull' },
    { id: 'led', sys: 'led', ex: 'led', sect: 'led-ivc', name: 'LED board', can: 'CAN 6', end: true, rail: 'int-start',
      job: 'Drives the status light',
      more: 'First board on the chain, so its terminator should be on.' },
    { id: 'ivc', sys: 'ivc', ex: 'ivc', sect: 'led-ivc', name: 'IVC board', can: 'CAN 8', rail: 'int',
      job: 'Talks to Triton, hears the pinger' },
    { id: 'esc1', sys: 'esc', ex: 'esc', sect: 'esc', name: 'ESC board 1', can: 'CAN 3', rail: 'int',
      job: 'Spins thrusters 4–7',
      more: 'Solder jumper <code>SB1</code> bridged.' },
    { id: 'esc0', sys: 'esc', ex: 'esc', sect: 'esc', name: 'ESC board 0', can: 'CAN 2', rail: 'int',
      job: 'Spins thrusters 0–3',
      more: 'Solder jumper <code>SB1</code> open.' },
    { id: 'poac', sys: 'poac', ex: 'poac', sect: 'poac', name: 'POAC', can: 'CAN 1', rail: 'int',
      job: 'Power rails and the kill switch' },
    { sec: 'Camera cage · starboard hull', rail: 'int', note: 'one cable from the POAC' },
    { id: 'ccbb', sys: 'ccbb', ex: 'ccbb', sect: 'ccbb', name: 'Camera cage breakout', can: 'CAN 4', rail: 'int ext-start', both: true,
      job: 'Orin and DVL power, depth sensor',
      more: 'Its <code>EXT. CAN</code> jacks start the external bus.' },
    { id: 'hat', ex: 'agx_breakout', sect: 'orin-side', name: 'Orin HAT', can: 'no ID', end: true, rail: 'int-end ext link-down', both: true,
      job: 'Puts the Orin on both buses',
      more: 'No microcontroller. Last board on the internal chain, so its <code>can0</code> terminator should be on.' },
    { id: 'orin', name: 'Jetson AGX Orin', can: 'can0 · can1', rail: 'link-up ext', orin: true,
      job: 'Runs <code>copro_agent</code> and the MPC',
      more: 'Not a board the team makes: the robot\'s computer. <a href="computers.html#can">Computers and networks</a> covers its side of CAN.' },
    { sec: 'Outside the hulls', rail: 'ext', note: 'on the external bus, 250 kbit/s' },
    { id: 'batt', sys: 'sbh_mcu', ex: 'sbh_mcu', sect: 'batteries', name: 'Battery housings ×2', can: 'external', branch: true, rail: 'ext-end',
      job: 'Report each pack\'s charge',
      more: 'Their topics don\'t reach ROS at the moment: the Orin\'s agent for this bus is switched off.' },
  ];

  list.innerHTML = R.map((r, i) => {
    if (r.sec) return `<li class="sp-sec ${r.rail || ''}"><span>${r.sec}</span>${r.note ? `<small>${r.note}</small>` : ''}</li>`;
    const chip = `<span class="sp-id${r.can === 'external' ? ' ext' : ''}${r.orin || r.can === 'no ID' ? ' none' : ''}">${r.can}</span>`;
    return `<li class="sp-row ${r.rail}${r.branch ? ' branch' : ''}" data-i="${i}"><i class="sp-dot" aria-hidden="true"></i>${r.both ? '<i class="sp-dot sp-dot2" aria-hidden="true"></i>' : ''}` +
      `<button class="sp-card" aria-expanded="false" aria-controls="sp-more-${r.id}"><span class="sp-l1"><span class="sp-name">${r.name}</span>${chip}${r.end ? '<span class="sp-end">bus end</span>' : ''}</span>` +
      `<span class="sp-job">${r.job}</span><i class="sp-chev" aria-hidden="true"></i></button>` +
      `<div class="sp-more" id="sp-more-${r.id}" hidden></div></li>`;
  }).join('');

  const detail = (r) => {
    const ros = r.sys && B[r.sys]?.ros;
    const n = ros ? ros.publishes.length + ros.subscribes.length : 0;
    const x = r.sys && B[r.sys]?.branchRos;
    const extra = x && { ...x, note: `On the unmerged <code>${esc(x.branch)}</code> branch (<a href="${x.url}">${code(x.project)}</a>), the pinger listener adds:` };
    return (r.more ? `<p>${r.more}</p>` : '') +
      (r.sys ? `<p><b>Firmware:</b> ${fw(r.sys)}</p>` : '') +
      `<p class="sp-links">${r.sect ? `<a class="sp-ex" href="#${r.sect}">Read about it ↓</a>` : ''}${r.ex ? `<button class="sp-ex" data-board="${r.ex}">See the board ↓</button>` : ''}</p>` +
      (ros ? `<details class="sp-topics"><summary>Its ROS topics (${n}${x ? ` + ${x.publishes.length + x.subscribes.length} on a branch` : ''})</summary>${topicBlock(ros, sys.users, extra)}</details>` : '');
  };

  const open = (li, on) => {
    const btn = li.querySelector('.sp-card');
    const more = li.querySelector('.sp-more');
    btn.setAttribute('aria-expanded', String(on));
    li.classList.toggle('open', on);
    if (on && !more.innerHTML) more.innerHTML = detail(R[+li.dataset.i]);
    more.hidden = !on;
  };
  list.addEventListener('click', (e) => {
    const ex = e.target.closest('button.sp-ex');
    if (ex) {
      explorer?.select(ex.dataset.board);
      document.getElementById('explorer-fig').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    const btn = e.target.closest('.sp-card');
    if (!btn) return;
    const li = btn.closest('li');
    const was = li.classList.contains('open');
    // Keep the tapped card where it is on screen while another card above it closes.
    const top0 = btn.getBoundingClientRect().top;
    list.querySelectorAll('li.open').forEach((x) => open(x, false));
    if (!was) open(li, true);
    const dy = btn.getBoundingClientRect().top - top0;
    if (dy) scrollBy(0, dy);
    const r = btn.getBoundingClientRect();
    if (r.top < 0 || r.top > innerHeight * 0.75) btn.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  });
}

// ---------------------------------------------------------------------------------------------- board explorer
// Plain-words roles for the parts lists: what the part does first, the part number second.
const PLAIN = {
  poac: {
    PS1: 'Makes the 15 V rail', PS2: 'Makes the 5 V rail', U2: 'Makes 12 V for the servo', U3: 'Makes 3.3 V for the RP2040',
    'U4, U6': 'Join the two batteries onto V+, one way only', U5: 'Feeds the regulators from V+ (diode)',
    'Q2-Q4': 'The kill switch: connect thruster power', 'U10-U12': 'Switch the kill FETs on and off',
    U13: 'Lets the RP2040 break the kill signal (software kill)', U7: 'Measures four rail voltages',
    U1: 'Temperature and humidity sensor', U8: 'Converts the servo data line between 3.3 V and 5 V', 'Q5/Q6': 'Switches the fan',
  },
  esc: {
    'M1-M4': 'The four ESCs: they spin the thrusters', 'F1-F4': 'One 15 A fuse per ESC', F5: '60 A fuse for the whole board',
    'Q1, Q2': 'Block power connected backwards', U1: 'Makes 3.3 V', 'R3/R4': 'Let the RP2040 measure the thruster supply',
  },
  ccbb: {
    Q6: 'Switches the Orin\'s 15 V', Q1: 'Switches the Peltier cooler', Q4: 'Switches the fans', Q3: 'Blocks 15 V connected backwards',
    U1: 'Makes 3.3 V', U2: 'Temperature and humidity sensor',
  },
  led: { 'U1, U2': 'LED drivers, two colours each', 'L1-L4': 'Inductors for the LED drivers', U3: 'Makes 3.3 V' },
  ivc: {
    U6: 'Makes ±24 V for the power amplifier', U2: 'Power amplifier: drives the transducer', U9: 'Signal amplifier before the power amp',
    U1: 'Smooths the outgoing tone (filter)', U8: 'Makes ±5 V for the receive side', 'U13-U16': 'Amplify and filter the hydrophone signal',
    'U11, U12': 'Pick the RP2040 tone or Bluetooth audio to send', U17: 'Bluetooth audio module', U7: 'Makes 3.3 V',
  },
  sbh_mcu: {
    U1: 'Makes 5 V from the pack', U2: 'Makes 3.3 V', 'Q1-Q4': 'Keep the board on after the button is let go',
    S1: 'Power button, worked by a magnet through the housing', DS1: 'Small status display', U3: 'Temperature and humidity sensor',
  },
  sbh_bms: { U2: 'Battery manager: watches and balances the cells', 'Q1, Q2': 'Cut the pack off on a fault', F1: '45 A protector', U1: 'Wakes the battery manager' },
  agx_breakout: { 'U1, U2': 'CAN transceivers for can1 and can0', U3: 'Serial (RS-232) for the IMU' },
  agx_m2: { U2: 'Serial (RS-422) for the gyro', U3: 'Boosts 3.3 V to 8 V', U4: 'Makes the gyro\'s 5 V', U1: 'Makes 1.8 V for the serial chip' },
};
const PURPOSE = {
  poac: 'Joins the two batteries, makes the 15 V, 5 V and 12 V rails, cuts thruster power on a kill and drives the torpedo/marker servo.',
  esc: 'Carries four ESCs, each spinning one thruster. Two identical boards drive all eight.',
  ccbb: 'The camera cage\'s power and I/O hub: switches the Orin\'s power, powers the DVL, reads the depth sensor and passes both CAN buses to the Orin.',
  led: 'Drives the status light (the LED module) with two LED driver chips.',
  ivc: 'Acoustic modem: drives the transducer and listens on the hydrophone, for messages with Triton (and, in branch firmware, the pinger).',
  sbh_mcu: 'Reads the battery manager, shows the pack\'s state on a small display and reports it over the external CAN bus.',
  sbh_bms: 'Watches and balances the five cells and cuts the pack off on a fault.',
  agx_breakout: 'Turns the Orin\'s two CAN controllers into bus signals (can0, can1) and gives the IMU a serial port.',
  agx_m2: 'Gives the Orin a serial port and 5 V for the fibre-optic gyro.',
};
const GROUP = { hull: 'In the hulls', battery: 'In each battery housing', orin: 'On the Orin' };
// One name per board, the same as in the prose and the board list; the badge says where the board sits.
const NAME = { poac: 'POAC', ccbb: 'Camera cage breakout', sbh_mcu: 'Battery MCU board', sbh_bms: 'Battery BMS board', agx_breakout: 'Orin HAT (Jetson AGX breakout)', agx_m2: 'FOG board (M.2 card)' };
const BADGE = { poac: 'Board stack · port', esc: 'Board stack · port', led: 'Board stack · port', ivc: 'Board stack · port', ccbb: 'Camera cage · starboard', sbh_mcu: 'Battery housing', sbh_bms: 'Battery housing' };
// The Power tab in plain words (from each board's netlist).
const POWER = {
  poac: { inputs: ['Port battery (J3) and starboard battery (J4)'], makes: ['V+: the two batteries joined, the fuller one supplying', 'Thruster power (MOTOR_PWR): V+ after the kill switch', '15 V, 12 V, 5 V and 3.3 V'], feeds: ['ESC boards: thruster power', 'Board stack link: V+, 15 V, 5 V', 'Camera cage: 15 V, 5 V', 'Servo on the lid: 12 V', 'Fan: 5 V'] },
  esc: { inputs: ['Thruster power from the POAC (J1/J2)', '5 V from the stack link (J6)'], makes: ['3.3 V for the RP2040'], feeds: ['The four ESCs: a 60 A fuse for the board, then a 15 A fuse each'] },
  ccbb: { inputs: ['15 V and 5 V from the POAC (J6)'], makes: ['3.3 V for the RP2040'], feeds: ['Orin: 15 V, switched', 'DVL: 15 V over its Ethernet cable', 'Peltier cooler: 15 V, switched', 'Fans: 5 V, switched', 'Network switch, depth sensor, RGB strip: 5 V', 'External CAN jacks: 15 V'] },
  led: { inputs: ['V+ and 5 V from the stack link'], makes: ['3.3 V for the RP2040'], feeds: ['LED module: V+ through the two drivers'] },
  ivc: { inputs: ['V+ and 5 V from the stack link'], makes: ['±24 V for the power amplifier', '±5 V, isolated, for the hydrophone side', '3.3 V for the RP2040'], feeds: ['Transducer', 'Hydrophone amplifiers'] },
  sbh_mcu: { inputs: ['The pack, through a switch that the magnet button or the RP2040 can hold on'], makes: ['5 V and 3.3 V'], feeds: ['RP2040, display, temperature sensor'] },
  sbh_bms: { inputs: ['The five cells'], makes: ['Pack output: cells, then a 45 A protector, then two FETs the battery manager opens on a fault'], feeds: ['The robot (pack + and −)', 'The MCU board'] },
  agx_breakout: { inputs: ['5 V and 3.3 V from the Orin\'s 40-pin header'], makes: [], feeds: ['IMU: 5 V straight from the header', 'CAN transceivers: 3.3 V'] },
  agx_m2: { inputs: ['3.3 V from the M.2 slot'], makes: ['8 V, then 5 V from it; 1.8 V for the serial chip'], feeds: ['Gyro: 5 V', 'Serial chip'] },
};
const CONN_NOTE = { 'poac:J1': ' (from the kill switch, the handle on the port bow window)' };
const CAN_NOTE = { agx_breakout: 'No CAN ID: it is the Orin\'s way onto both buses', sbh_bms: 'No CAN ID: passes the external bus on to the MCU board' };
// Ring names in plain words.
const tagText = (t) => t.replace('Vreg Schottky', 'Regulator feed diode').replace(/ideal-diode OR/, 'battery switch').replace(/\bLDO\b/, 'regulator');

Promise.all([fetch(BASE + 'data/boards/explorer.json').then((r) => r.json()), sysData]).then(([d]) => { explorer = buildExplorer(d); });

function buildExplorer(data) {
  const boards = data.boards.filter((b) => b.group !== 'retired' && b.id !== 'led_module'); // the LED module has no parts with 3D models: nothing to show
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]));
  const pick = document.getElementById('bx-pick');
  const stageWrap = document.querySelector('#bx .bx-stage-wrap');
  const stage = document.getElementById('bx-stage');
  const note = document.getElementById('bx-note');
  const info = document.getElementById('bx-info');
  const sideSeg = document.getElementById('bx-side');
  const names = document.getElementById('bx-names');
  const st = { id: 'poac', side: 'top', sel: null, tab: 'parts', names: false };

  // Board picker: one row of chips (it scrolls sideways on a phone), with group labels where there is room.
  let html = '', group = '';
  for (const b of boards) {
    if (b.group !== group) {
      group = b.group;
      html += `${html ? '</div>' : ''}<div class="bx-group"><span class="bx-glabel">${esc(GROUP[b.group] || b.groupLabel)}</span>`;
    }
    html += `<button class="bx-chip" data-id="${b.id}" aria-pressed="false">${esc(b.short)}</button>`;
  }
  pick.innerHTML = html + '</div>';
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('.bx-chip');
    if (b) select(b.dataset.id);
  });
  sideSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.side === st.side) return;
    st.side = b.dataset.side;
    st.sel = null;
    drawStage();
  });
  names.addEventListener('click', () => {
    st.names = !st.names;
    names.setAttribute('aria-pressed', String(st.names));
    stage.classList.toggle('names', st.names);
    layoutTags();
    showSpot(st.sel);
  });

  // The list under the picture decides which rings show: parts, or connectors on the Connectors tab.
  const listItems = (b) => (st.tab === 'conn' ? b.connectors : b.parts);
  const ringRefs = (b, side) => new Set(listItems(b).filter((p) => p.spot === side && p.spotRef).map((p) => p.spotRef));
  const land = (b) => b.landscape && stageWrap.clientWidth >= 520;
  const view = () => {
    const b = byId[st.id];
    const key = st.side + (land(b) ? 'L' : '');
    const refs = ringRefs(b, st.side);
    return { b, img: b.images[key] || b.images[st.side], spots: (b.spots[key] || []).filter((s) => refs.has(s.ref)) };
  };

  let sized = 0;
  function size() {
    const { img } = view();
    const ar = img.w / img.h;
    const maxH = Math.min(520, Math.max(300, innerHeight * 0.62));
    const w = Math.min(stageWrap.clientWidth, maxH * ar);
    stage.style.width = `${Math.round(w)}px`;
    stage.style.height = `${Math.round(w / ar)}px`;
    // Ring sizes are fractions of the board's longer side, at least finger-sized, at most a fifth of the shorter
    // side. Then neighbours that would overlap shrink to the gap between them (never below 24 px).
    const longPx = Math.max(w, w / ar), shortPx = Math.min(w, w / ar);
    const capPx = Math.min(0.2 * shortPx, w < 520 ? 56 : 110);
    const els = [...stage.querySelectorAll('.bx-spot')];
    const pts = els.map((s) => ({ x: (parseFloat(s.style.left) / 100) * w, y: (parseFloat(s.style.top) / 100) * (w / ar), d: Math.max(28, Math.min(2 * +s.dataset.r * longPx, capPx)) }));
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const a = pts[i], c = pts[j];
      const dist = Math.hypot(a.x - c.x, a.y - c.y);
      if (dist < (a.d + c.d) / 2 + 2) {
        const room = Math.max(24, dist - 2);
        if (a.d > c.d) a.d = Math.max(room * 2 - c.d, Math.min(a.d, room)); else c.d = Math.max(room * 2 - a.d, Math.min(c.d, room));
        if (dist < (a.d + c.d) / 2 + 2) { a.d = Math.min(a.d, room); c.d = Math.min(c.d, room); }
      }
    }
    els.forEach((s, i) => { s.style.width = s.style.height = `${pts[i].d.toFixed(1)}px`; });
    sized = stageWrap.clientWidth;
    layoutTags();
  }

  // Name tags: slide each one back inside the picture. With "Show names" on, place them one by one (the selected
  // ring first, then bigger parts): below the ring, above it, or over its middle, whichever overlaps no name already
  // placed (and, on a narrow picture, no other ring). A name with no free place is hidden; tapping its ring shows it.
  let hiddenTags = 0;
  function layoutTags() {
    const tags = [...stage.querySelectorAll('.bx-tag')];
    hiddenTags = 0;
    if (!tags.length) return;
    stage.classList.add('measuring');
    const box = stage.getBoundingClientRect();
    const els = tags.map((t) => t.parentElement);
    const setPos = (el, pos) => { el.classList.toggle('tag-up', pos === 'up'); el.classList.toggle('tag-mid', pos === 'mid'); };
    const measure = (t) => {
      t.style.marginLeft = '';
      const r = t.getBoundingClientRect();
      const dx = Math.max(box.left + 2 - r.left, 0) + Math.min(box.right - 2 - r.right, 0);
      if (dx) t.style.marginLeft = `${dx.toFixed(1)}px`;
      return { l: r.left + dx, r: r.right + dx, t: r.top, b: r.bottom };
    };
    els.forEach((el) => { el.classList.remove('tag-hide'); setPos(el, el.dataset.pos0); });
    if (!st.names) { tags.forEach(measure); stage.classList.remove('measuring'); return; }
    const isOn = (i) => els[i].classList.contains('on');
    const order = tags.map((t, i) => i).sort((a, b) => (isOn(b) - isOn(a)) || (+els[b].dataset.r - +els[a].dataset.r));
    const rings = box.width < 520 ? els.map((el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, el }; }) : [];
    const hit = (a, q, m) => a.l < q.r + m && a.r > q.l - m && a.t < q.b + 1 && a.b > q.t - 1;
    const placed = [];
    for (const i of order) {
      const el = els[i];
      const pos0 = el.dataset.pos0;
      let got = null;
      for (const pos of [pos0, pos0 === 'up' ? '' : 'up', 'mid']) {
        setPos(el, pos);
        const a = measure(tags[i]);
        if (!placed.some((q) => hit(a, q, 3)) && !rings.some((q) => q.el !== el && hit(a, q, 0))) { got = a; break; }
      }
      if (got) placed.push(got);
      else if (isOn(i)) { setPos(el, pos0); placed.push(measure(tags[i])); }
      else { setPos(el, pos0); el.classList.add('tag-hide'); hiddenTags++; }
    }
    stage.classList.remove('measuring');
  }
  let lastLand = null;
  new ResizeObserver(() => {
    if (stageWrap.clientWidth === sized) return;
    if (land(byId[st.id]) !== lastLand) drawStage();
    else size();
  }).observe(stageWrap);

  function drawStage() {
    const b = byId[st.id];
    // Only offer the other side when it has rings for this list.
    const sides = ['top', 'bottom'].filter((s) => ringRefs(b, s).size);
    if (sides.length && !sides.includes(st.side)) st.side = sides[0];
    sideSeg.hidden = sides.length < 2;
    const { img, spots } = view();
    lastLand = land(b);
    sideSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.side === st.side)));
    stage.innerHTML = `<img src="${BASE + img.src}" alt="${esc(`${b.name}, ${st.side} side, 3D render`)}" draggable="false">` +
      spots.map((s, i) => `<button class="bx-spot" data-i="${i}" data-r="${s.r}" style="left:${(s.x * 100).toFixed(2)}%;top:${(s.y * 100).toFixed(2)}%" aria-label="${esc(`${s.ref}: ${tagText(s.label)}`)}"><span class="bx-tag">${esc(tagText(s.label))}</span></button>`).join('');
    stage.classList.toggle('names', st.names);
    // Tags near the right or bottom edge open the other way so they stay inside the picture.
    stage.querySelectorAll('.bx-spot').forEach((el, i) => {
      el.classList.toggle('tag-left', spots[i].x > 0.72);
      el.dataset.pos0 = spots[i].y > 0.86 ? 'up' : '';
    });
    size();
    showSpot(st.sel);
  }

  stage.addEventListener('pointerover', (e) => {
    const s = e.target.closest('.bx-spot');
    if (s && e.pointerType === 'mouse') showSpot(+s.dataset.i, true);
  });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') showSpot(st.sel); });
  stage.addEventListener('click', (e) => {
    const s = e.target.closest('.bx-spot');
    if (!s) { st.sel = null; showSpot(null); return; }
    const i = +s.dataset.i;
    st.sel = st.sel === i ? null : i;
    showSpot(st.sel);
  });
  stage.addEventListener('focusin', (e) => {
    const s = e.target.closest('.bx-spot');
    if (s && s.matches(':focus-visible')) { st.sel = +s.dataset.i; showSpot(st.sel); }
  });

  // What a ring is: the matching list row's plain role, with the part number underneath.
  const plainFor = (b, ref) => {
    const p = listItems(b).find((x) => x.spotRef === ref);
    if (!p) return null;
    return st.tab === 'conn' ? { head: p.label || p.ref, sub: `${p.ref} · ${p.type}: ${p.carries}` } : { head: PLAIN[b.id]?.[p.ref] || cap(p.role), sub: `${p.ref} · ${p.part}` };
  };
  function showSpot(i, hover = false) {
    const { b, spots } = view();
    stage.querySelectorAll('.bx-spot').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
    if (st.names && !hover) layoutTags();
    if (i === null || i === undefined || !spots[i]) {
      const n = spots.length;
      const what = st.tab === 'conn' ? 'connector' : 'part';
      note.innerHTML = n ? `<b>${n} ${what}${n === 1 ? '' : 's'} marked.</b> Tap a ring, or a row in the list.${st.names && hiddenTags ? ` ${hiddenTags} ${hiddenTags === 1 ? 'name is' : 'names are'} hidden where they would overlap.` : ''}`
        : `No ${what}s are marked on this board.`;
      info.querySelectorAll('.bx-row').forEach((r) => r.classList.remove('on'));
      return;
    }
    const s = spots[i];
    const p = plainFor(b, s.ref);
    note.innerHTML = p ? `<b>${esc(p.head)}</b><br>${esc(p.sub)}` : `<b>${esc(s.label)}</b><br>${esc(s.ref)} · ${esc(s.part)}`;
    if (!hover) {
      if (!st.all && !info.querySelector(`.bx-row[data-ref="${CSS.escape(s.ref)}"]`) && info.querySelector('.bx-all')) { st.all = true; drawList(); return; }
      info.querySelectorAll('.bx-row').forEach((r) => r.classList.toggle('on', r.dataset.ref === s.ref));
    }
  }

  const fmt = (v) => (Math.round(v * 10) / 10).toString();
  function drawInfo() {
    const b = byId[st.id];
    const can = !b.can ? CAN_NOTE[b.id] || 'Not on CAN'
      : Array.isArray(b.can.client_id) ? `CAN ID ${b.can.client_id.join(' and ')} (internal bus)`
        : typeof b.can.client_id === 'string' ? 'External bus; its CAN ID is the housing\'s serial number'
          : `CAN ID ${b.can.client_id} (${b.can.bus} bus)`;
    const fw = b.firmware ? `firmware <a href="${b.firmware.url}">${code(b.firmware.project)}</a>` : 'no microcontroller';
    const rev = b.revision || {};
    const design = [rev.project && `<a href="${rev.project}">Altium project</a>`, !rev.project && rev.design && `<a href="${rev.design}">PCB file</a>`, rev.schematic_pdf && `<a href="${rev.schematic_pdf}">schematic PDF</a>`].filter(Boolean).join(' · ');
    const size = b.size ? `${fmt(b.size[0])} × ${fmt(b.size[1])} mm` : '';
    const more = [
      b.why && `<dt>Why</dt><dd>${esc(b.why)}${b.whySource ? ` (<a href="${b.whySource}">source</a>)` : ''}</dd>`,
      design && `<dt>Design</dt><dd>${design}</dd>`,
      rev.notes && `<dt>Revision</dt><dd>${esc(rev.notes)}</dd>`,
    ].filter(Boolean).join('');
    const hasPower = !!POWER[b.id];
    if (st.tab === 'power' && !hasPower) st.tab = 'parts';
    info.innerHTML = `
      <div class="bx-head"><h3>${esc(NAME[b.id] || b.name)}</h3><span class="bx-badge">${esc(BADGE[b.id] || GROUP[b.group] || b.groupLabel)}${b.count > 1 ? ` · ×${b.count}` : ''}</span></div>
      <p class="bx-purpose">${esc(PURPOSE[b.id] || b.purpose)}</p>
      <p class="bx-sum">${can} · ${fw}<br>${esc(b.where)}${size ? ` · ${size}` : ''}</p>
      ${more ? `<details class="bx-moreinfo"><summary>Design files and revision</summary><dl class="spec bx-spec">${more}</dl></details>` : ''}
      <div class="seg bx-tabs" role="group" aria-label="List">
        <button data-tab="parts" aria-pressed="${st.tab === 'parts'}">Parts <span class="bx-n">${b.parts.length}</span></button><button data-tab="conn" aria-pressed="${st.tab === 'conn'}">Connectors <span class="bx-n">${b.connectors.length}</span></button>${hasPower ? `<button data-tab="power" aria-pressed="${st.tab === 'power'}">Power</button>` : ''}
      </div>
      <div class="bx-list" id="bx-list"></div>`;
    info.querySelector('.bx-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t || t.dataset.tab === st.tab) return;
      const ringsBefore = st.tab === 'conn';
      st.tab = t.dataset.tab;
      info.querySelectorAll('.bx-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
      if (ringsBefore !== (st.tab === 'conn')) { st.sel = null; drawStage(); }
      drawList();
    });
    drawList();
  }

  const row = (ref, side, head, sub) => {
    const live = !!(ref && side);
    return `<li><button class="bx-row${live ? '' : ' flat'}" ${live ? `data-ref="${esc(ref)}" data-side="${side}"` : 'disabled'}><i class="bx-dot" aria-hidden="true"></i><span class="bx-r1">${head}</span><span class="bx-r2">${sub}</span></button></li>`;
  };
  // On a phone the list sits under the picture: show the first rows, the rest on request.
  const narrowList = matchMedia('(max-width: 900px)');
  const SHORT = 4;
  const clip = (rows) => (narrowList.matches && !st.all && rows.length > SHORT + 1 ? rows.slice(0, SHORT) : rows);
  const moreBtn = (n) => (narrowList.matches && !st.all && n > SHORT + 1 ? `<button class="bx-chip bx-all">Show all ${n}</button>` : '');
  function drawList() {
    const b = byId[st.id];
    const list = document.getElementById('bx-list');
    if (st.tab === 'parts') {
      list.innerHTML = b.parts.length
        ? `<ul>${clip(b.parts).map((p) => row(p.spotRef, p.spot, esc(PLAIN[b.id]?.[p.ref] || cap(p.role)), `<b>${esc(p.ref)}</b> ${esc(p.part)}`)).join('')}</ul>${moreBtn(b.parts.length)}${b.mcu && b.mcu.startsWith('RP2040') ? '<p class="bx-more">Plus the shared RP2040 + CAN block (<a href="#rp2040">below</a>).</p>' : ''}`
        : '<p class="bx-more">No key parts listed.</p>';
    } else if (st.tab === 'conn') {
      list.innerHTML = b.connectors.length
        ? `<ul>${clip(b.connectors).map((c) => row(c.spotRef, c.spot, `${c.label ? `<span class="silk">${esc(c.label)}</span>` : esc(c.type)}`, `<b>${esc(c.ref)}</b> ${esc(c.carries)}${esc(CONN_NOTE[`${b.id}:${c.ref}`] || '')}`)).join('')}</ul>${moreBtn(b.connectors.length)}`
        : '<p class="bx-more">No connectors listed.</p>';
    } else {
      const pw = POWER[b.id];
      const col = (head, items) => (items && items.length ? `<div class="bx-pw"><b>${head}</b><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '');
      list.innerHTML = col('Takes in', pw.inputs) + col('Makes', pw.makes) + col('Feeds', pw.feeds) +
        '<p class="bx-more"><a href="electrical.html">Power and wiring</a> follows the whole power tree.</p>';
    }
    showSpot(st.sel);
  }

  info.addEventListener('click', (e) => {
    if (e.target.closest('.bx-all')) { st.all = true; drawList(); return; }
    const r = e.target.closest('.bx-row');
    if (!r || r.disabled) return;
    if (r.dataset.side !== st.side) st.side = r.dataset.side;
    st.sel = null;
    drawStage();
    const { spots } = view();
    const i = spots.findIndex((s) => s.ref === r.dataset.ref);
    st.sel = i < 0 ? null : i;
    showSpot(st.sel);
    // On a phone the picture is above the list: bring it back into view.
    const box = stage.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight) stage.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  });

  function select(id) {
    if (!byId[id]) return;
    st.id = id;
    st.sel = null;
    st.all = false;
    st.side = 'top';
    // A board that is mostly plugs (the camera cage breakout) opens on its connectors.
    const b = byId[id], n = (l) => l.filter((x) => x.spotRef).length;
    st.tab = n(b.connectors) > 2 * Math.max(1, n(b.parts)) ? 'conn' : 'parts';
    pick.querySelectorAll('.bx-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
    pick.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    drawInfo();
    drawStage();
  }
  select('poac');
  return { select };
}

// ---------------------------------------------------------------------------------------------- status LED
// lib/driver_led/led.c: enabled (blue) > ROS connected (green) > CAN online (yellow) > CAN started (red) > off.
// A fault alternates the colour with red every 500 ms.
{
  const sw = document.getElementById('led-sw');
  const dot = document.getElementById('led-dot');
  const out = document.getElementById('led-note');
  const faultBtn = document.getElementById('led-fault');
  const C = { dark: '#9fb1b7', red: '#e34948', yellow: '#f0b400', green: '#1baf7a', blue: '#2f6fe0' };
  const L = [
    ['dark', 'Off', 'no CAN', '<b>Off: CAN never started.</b> No power, no firmware, or the CAN controller failed to start.'],
    ['red', 'Red', 'no bus', '<b>Red: no CAN bus.</b> The board started CAN but can\'t reach the bus. Check its cable and the termination at the two ends of the chain.'],
    ['yellow', 'Yellow', 'no ROS', '<b>Yellow: CAN up, no ROS.</b> The board hears the bus but the micro-ROS agent hasn\'t connected. Check that <code>copro_agent</code> is running on the Orin.'],
    ['green', 'Green', 'on ROS', '<b>Green: connected, robot killed.</b> The agent sees the board and its topics are live.'],
    ['blue', 'Blue', 'enabled', '<b>Blue: enabled.</b> The board has the POAC\'s kill state and the robot is enabled; on an ESC board, thrusters may spin.'],
  ];
  const st = { col: 'green', fault: false };
  let timer = 0;
  sw.innerHTML = L.map(([k, name, short]) => `<button data-k="${k}" aria-pressed="false"><i style="--c:${C[k]}"></i><b>${name}</b><span>${short}</span></button>`).join('');
  const update = () => {
    const [k, , , text] = L.find((x) => x[0] === st.col);
    sw.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
    faultBtn.setAttribute('aria-pressed', String(st.fault));
    faultBtn.textContent = st.fault ? 'Fault raised' : 'Add a fault';
    clearInterval(timer);
    dot.classList.remove('flash');
    dot.classList.toggle('dark', k === 'dark');
    dot.style.setProperty('--c', C[k]);
    let extra = '';
    if (st.fault) {
      if (k === 'red') extra = ' <b>A fault on a red board doesn\'t show:</b> red alternates with red. Read the fault bits in <code>state/firmware</code>.';
      else {
        extra = ' <b>Alternating with red: a fault.</b> Its name is in the board\'s <code>state/firmware</code> fault bits.';
        let on = false;
        const tick = () => { on = !on; dot.style.setProperty('--c', on ? C.red : C[k]); dot.classList.toggle('dark', !on && k === 'dark'); };
        if (!reduced) timer = setInterval(tick, 500); else dot.classList.add('flash');
        tick();
      }
    }
    out.innerHTML = text + extra;
  };
  sw.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { st.col = b.dataset.k; update(); } });
  faultBtn.addEventListener('click', () => { st.fault = !st.fault; update(); });
  update();
}

// ---------------------------------------------------------------------------------------------- kill circuit
// Drawn at the panel's own width (1 SVG unit = 1 CSS px), so text renders at its stated size on a phone.
{
  const host = document.getElementById('kill-svg');
  const out = document.getElementById('kill-note');
  const res = document.getElementById('kill-result');
  const ctl = document.getElementById('kill-controls');
  const st = { sw: 'in', soft: 'none', mcu: 'run' };
  const ok = 'var(--prediction)', bad = 'var(--s8)', mute = 'var(--muted)';

  const compute = () => {
    const inserted = st.sw === 'in';
    const alive = st.mcu === 'run';
    const run = alive && inserted && st.soft === 'none'; // SOFTWARE_KILL = run only if every kill slot is happy, the switch's slot 0 included
    const enLow = run && inserted; // MOTOR_EN is the switch line through the DG448, or pulled up to V+ when it's open
    return { inserted, alive, run, dgClosed: run, enLow, fetOn: enLow };
  };

  function draw() {
    const W = Math.max(280, Math.round(host.clientWidth));
    const wide = W >= 640;
    const s = compute();
    const parts = [];
    const block = (b, title, state, good) => {
      const [x, y, w, h] = b;
      const col = good ? ok : bad;
      parts.push(`<g class="kb"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" style="stroke:${col}"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2 - 3}" class="kt">${title}</text>` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 14}" class="ks" style="fill:${col}">${state}</text></g>`);
    };
    const line = (pts, col, wd, dash) => parts.push(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="kw" style="stroke:${col};stroke-width:${wd}${dash ? ';stroke-dasharray:4 4' : ''}"/>`);
    const label = (x, y, t, anchor = 'start', cls = 'kl') => parts.push(`<text x="${x}" y="${y}" class="${cls}" style="text-anchor:${anchor}">${t}</text>`);
    const arrow = (x, y, col) => parts.push(`<path d="M${x},${y} l8,-5 v10 z" style="fill:${col}"/>`);
    const powerCol = s.fetOn ? 'var(--accent)' : mute;
    const B = (k) => g[k];
    let g, H;
    if (wide) {
      // One row: switch → DG448 → gate drivers → FETs → ESC boards; the RP2040 below the DG448.
      const bw = Math.min(140, (W - 4 * 80) / 5), bh = 52, y0 = 40, gap = (W - 5 * bw) / 4;
      const xs = [0, 1, 2, 3, 4].map((i) => i * (bw + gap));
      g = { ks: [xs[0], y0, bw, bh], dg: [xs[1], y0, bw, bh], gd: [xs[2], y0, bw, bh], fet: [xs[3], y0, bw, bh], esc: [xs[4], y0, bw, bh], rp: [xs[1], y0 + bh + 60, bw, bh] };
      H = y0 + 2 * bh + 70;
      const y = y0 + bh / 2;
      const seg = (a, b2, col, wd) => line([[B(a)[0] + bw, y], [B(b2)[0], y]], col, wd);
      seg('ks', 'dg', s.inserted ? ok : bad, 2.5);
      seg('dg', 'gd', s.enLow ? ok : bad, 2.5);
      seg('gd', 'fet', s.enLow ? ok : bad, 2.5);
      seg('fet', 'esc', powerCol, s.fetOn ? 7 : 2.5);
      label(B('fet')[0] + bw + gap / 2, y + 24, 'MOTOR_PWR', 'middle');
      line([[B('fet')[0] + bw / 2, 8], [B('fet')[0] + bw / 2, y0]], 'var(--ink-2)', 3);
      label(B('fet')[0] + bw / 2 + 8, 18, 'V+ (battery)');
      // The RP2040 reads the switch, and drives the DG448.
      const tx = B('ks')[0] + bw + gap / 2;
      line([[tx, y], [tx, B('rp')[1] + bh / 2], [B('rp')[0], B('rp')[1] + bh / 2]], s.alive ? 'var(--ink-2)' : mute, 1.4, true);
      label(tx - 6, B('rp')[1] + bh / 2 - 8, 'reads it', 'end');
      const sx = B('dg')[0] + bw / 2;
      line([[sx, B('rp')[1]], [sx, y0 + bh + 9]], s.run ? ok : bad, 2.5);
      parts.push(`<path d="M${sx},${y0 + bh + 1} l-5,9 h10 z" style="fill:${s.run ? ok : bad}"/>`);
      label(sx + 8, y0 + bh + 34, `SOFTWARE_KILL: ${s.run ? 'run' : 'kill'}`);
      label(B('rp')[0] + bw + 14, B('rp')[1] + bh / 2 + 5, `publishes state/kill: ${s.alive ? (s.run ? 'false' : 'true') : 'nothing'}`, 'start', 'kl kv');
    } else {
      // A column for the power path, the RP2040 to the right of the DG448 with its SOFTWARE_KILL arrow pointing in.
      const bw = Math.min(150, Math.round(W * 0.44)), bh = 44, gap = 26, y0 = 6;
      const rw = Math.min(130, W - bw - 62);
      const ys = [0, 1, 2, 3, 4].map((i) => y0 + i * (bh + gap));
      g = { ks: [0, ys[0], bw, bh], dg: [0, ys[1], bw, bh], gd: [0, ys[2], bw, bh], fet: [0, ys[3], bw, bh], esc: [0, ys[4], bw, bh], rp: [W - rw, ys[1], rw, bh] };
      H = ys[4] + bh + 6;
      const x = bw / 2;
      const seg = (a, b2, col, wd) => line([[x, B(a)[1] + bh], [x, B(b2)[1]]], col, wd);
      seg('ks', 'dg', s.inserted ? ok : bad, 2.5);
      seg('dg', 'gd', s.enLow ? ok : bad, 2.5);
      seg('gd', 'fet', s.enLow ? ok : bad, 2.5);
      seg('fet', 'esc', powerCol, s.fetOn ? 7 : 2.5);
      label(x + 10, B('fet')[1] + bh + gap / 2 + 5, 'MOTOR_PWR');
      // V+ comes in from the right.
      const vy = B('fet')[1] + bh / 2;
      line([[W - 2, vy], [bw, vy]], 'var(--ink-2)', 3);
      label(W - 2, vy - 8, 'V+ (battery)', 'end');
      // Reads the switch: from the switch block over to the RP2040.
      const rcx = B('rp')[0] + rw / 2, ky = B('ks')[1] + bh / 2;
      line([[bw, ky], [rcx, ky], [rcx, B('rp')[1]]], s.alive ? 'var(--ink-2)' : mute, 1.4, true);
      label(bw + 8, ky - 7, 'RP2040 reads it');
      // SOFTWARE_KILL: RP2040 → DG448.
      const dy = B('dg')[1] + bh / 2;
      line([[B('rp')[0], dy], [bw + 9, dy]], s.run ? ok : bad, 2.5);
      arrow(bw + 1, dy, s.run ? ok : bad);
      label(bw + 10, B('dg')[1] + bh + 17, `SOFTWARE_KILL: ${s.run ? 'run' : 'kill'}`);
    }
    block(g.ks, 'Kill switch', s.inserted ? 'inserted' : 'pulled', s.inserted);
    block(g.dg, 'DG448', s.dgClosed ? 'closed' : 'open', s.dgClosed);
    block(g.gd, 'Gate drivers', s.enLow ? 'FETs on' : 'FETs off', s.enLow);
    block(g.fet, 'P-FETs', s.fetOn ? 'on' : 'off', s.fetOn);
    block(g.esc, 'ESC boards', s.fetOn ? 'powered' : 'no power', s.fetOn);
    block(g.rp, 'RP2040', s.alive ? (s.run ? 'run' : 'kill') : 'in reset', s.alive && s.run);
    host.innerHTML = `<svg class="kill-svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Kill circuit: ${s.fetOn ? 'thrusters powered' : 'no thruster power'}">${parts.join('')}</svg>`;

    res.className = `kill-result ${s.fetOn ? 'on' : 'off'}`;
    res.textContent = s.fetOn ? 'Thrusters powered' : 'No thruster power';
    let why;
    if (s.fetOn) why = 'Both paths are closed. The ESC boards see <code>MOTOR_PWR</code>, wait 5 s, then follow the RPM commands.';
    else if (!s.alive) why = 'With the RP2040 not running, resistors hold <code>SOFTWARE_KILL</code> at kill: the DG448 stays open and the FETs off, whatever the switch does.';
    else if (!s.inserted) why = 'The switch line goes high, which turns the FETs off; the RP2040 also sees the switch and opens the DG448.';
    else why = 'The switch is in, but a kill slot is asserted, so the RP2040 opens the DG448 and the FETs turn off.';
    out.innerHTML = why;
    ctl.querySelector('[data-k="soft"]').classList.toggle('off', !s.alive);
  }
  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const grp = b.closest('[data-k]');
    st[grp.dataset.k] = b.dataset.v;
    grp.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  let lastW = 0;
  new ResizeObserver(() => { const w = Math.round(host.clientWidth); if (w !== lastW) { lastW = w; draw(); } }).observe(host);
  draw();
}
