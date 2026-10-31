import { setup } from '../layout.js';
import { el } from '../viz/chart.js';
import { NetMap } from '../viz/computers-netmap.js';
import '../css/chapter.css';
import '../css/computers.css';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = {
  core: 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/',
  perc: 'https://github.com/osu-uwrt/riptide_perception/blob/mapping-estimator/',
};
const a = (href, text) => `<a href="${href}">${text}</a>`;
const c = (t) => `<code>${t}</code>`;
// Public images: set from JS with BASE_URL (a root-absolute src in the HTML gets the base prefixed twice by the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the network map
function networkMap() {
  const N = (id, label, sub, html, extra = {}) => ({ id, label, sub, html, ...extra });
  const nodes = [
    N('cams', '2 × ZED X Mini', 'GMSL2', `<b>Forward and down stereo cameras</b>, 1920×1200 at 15 fps, on a GMSL2 capture card in the Orin. Only the Orin ever sees raw frames. <a href="cameras.html">The cameras</a>.`),
    N('imu', 'IMU + FOG', 'serial', `<b>VN-100 IMU and fibre-optic gyro</b>, on serial ports ${c('ttyTHS1')} and ${c('ttyTHS2')}. The gyro's RS-422 line goes through a team-made board in the Orin's M.2 slot. <a href="sensors.html">Navigation sensors</a>.`),
    N('boards', 'Boards', 'can0', `<b>POAC, two ESC boards, camera cage breakout, LED and IVC boards.</b> Each has an RP2040 and talks only CAN, on the internal bus. The MPC sends thruster speeds back the same way. <a href="#can">CAN</a>.`),
    N('batt', 'Batteries', 'can1 · off', `<b>Two smart battery housings</b> on the external bus, ${c('can1')}. The bus is up, but the agent that would bring it into ROS is switched off, so battery data doesn't reach ROS today. <a href="#can">CAN</a>.`),
    N('dvl', 'Nortek DVL', 'Ethernet', `<b>Nortek DVL1000</b> (${c('uwrt-dvl')}, 192.168.1.212). Its driver on the Orin reads it over TCP through the switch. Its own web page holds its settings.`),
    N('switch', 'Switch', '5-port', `<b>A 5-port Ethernet switch in the camera cage</b> (TRENDnet TEG-S50g in the CAD). The Orin, the DVL and the tether meet here.`),
    N('orin', 'Jetson AGX Orin', 'orin2', `<b>Talos's only computer</b> (${c('orin2')}, 192.168.1.24, user ${c('ros')}). Runs every robot node, the Zenoh router (TCP port 7447) and the launcher page (port 8080). <a href="#orin">More below</a>.`, { bold: true, ts: true }),
    N('router', 'Team router', '192.168.1.1', `<b>The team router</b>, gateway of the robot LAN. Laptops and the lab's shared megacomputer (192.168.1.64) plug in here. Its upstream side goes to the opbox. <a href="#lan">The LAN</a>.`),
    N('optop', 'op-top', 'operator', `<b>The team laptop.</b> Runs the Nereus viewer, the simulator and the pre-test checks, and deploys code to the Orin. <a href="#optop">More below</a>.`, { ts: true }),
    N('yours', 'Your laptop', 'Zenoh client', `<b>Any Ubuntu 22.04 + ROS 2 Humble machine</b>, on the LAN or anywhere through Tailscale. It connects to the Orin; the robot never connects to it. <a href="#join">How to join</a>.`, { ts: true }),
    N('opbox', 'opbox (Pi)', '192.168.5.69', `<b>A Raspberry Pi in the operator box.</b> Shares its campus Wi-Fi connection with the whole LAN, and serves the team clock. <a href="#opbox">More below</a>.`, { ts: true }),
    N('wifi', 'Campus Wi-Fi', 'internet', `<b>Campus Wi-Fi</b>, the only way out: apt, pip, GitHub, Tailscale and internet time all go this way.`),
  ];
  // flows: filter id -> direction of travel (1 from→to, -1 to→from, 0 both ways). `only`: drawn only in its filters.
  const E = (from, to, label, flows, extra = {}) => ({ from, to, label, flows, ...extra });
  const edges = [
    E('cams', 'orin', 'GMSL2', { sensors: 1 }),
    E('imu', 'orin', 'serial', { sensors: 1 }),
    E('boards', 'orin', 'can0', { sensors: 0, ros: 0 }),
    E('batt', 'orin', 'can1', {}, { style: 'off' }),
    E('dvl', 'switch', 'Ethernet', { sensors: 1 }),
    E('switch', 'orin', '', { sensors: 1, ros: 0, time: 1, internet: 0, remote: 1 }),
    E('switch', 'router', 'tether', { ros: 0, time: -1, internet: 0, remote: -1 }, { width: 3 }),
    E('router', 'optop', '', { ros: 0, time: 1, internet: 0 }, { plan: ['time'] }),
    E('router', 'yours', '', { ros: 0, internet: 0 }),
    E('router', 'opbox', '', { time: -1, internet: 0, remote: -1 }),
    E('opbox', 'wifi', '', { time: -1, internet: 0, remote: -1 }),
    E('yours', 'wifi', 'from anywhere', { remote: 1 }, { only: true }),
    E('yours', 'orin', 'Tailscale tunnel', { remote: 0 }, { only: true, style: 'tunnel' }),
  ];
  const FILTERS = [
    { id: 'all', label: 'Everything', color: null, text: 'Every cable. Inside the hull everything meets at the Orin, on the surface at the team router, and the tether is the only link between the two.' },
    { id: 'ros', label: 'ROS 2', color: 'var(--state)', text: `<b>ROS 2 over Zenoh.</b> Each laptop holds one connection to the router on the Orin (TCP port 7447). The boards' topics come in through the micro-ROS agent on ${c('can0')}.` },
    { id: 'sensors', label: 'Sensors', color: 'var(--s7)', text: `<b>What the Orin reads itself:</b> cameras, IMU and gyro, the DVL, and the boards on ${c('can0')} (the MPC writes thruster speeds back there). The batteries' bus isn't brought into ROS today.` },
    { id: 'time', label: 'Time', color: 'var(--prediction)', text: `<b>Time.</b> The opbox serves time on the LAN; op-top is meant to follow it (dashed; check with ${c('chronyc sources')}). The Orin still asks the internet itself, over the same cables; switching it to the opbox is planned (<a href="#time">Time</a>).` },
    { id: 'internet', label: 'Internet', color: 'var(--s4)', text: "<b>Internet.</b> Traffic leaves through the router to the opbox, which shares its campus Wi-Fi connection (NAT). That's how the Orin and laptops reach apt and GitHub." },
    { id: 'remote', label: 'Remote', color: 'var(--s5)', text: '<b>Tailscale, from anywhere.</b> The dashed tunnel is how it looks to you. The coloured path is where the packets really go: Wi-Fi, opbox, router, tether. SSH and ROS both ride it.' },
  ];
  const layouts = {
    narrow: {
      W: 360, H: 556, fs: [14.5, 13.5],
      bands: [
        { label: 'Inside Talos', points: [[6, 6], [354, 6], [354, 262], [6, 262]] },
        { label: 'On the surface', points: [[6, 300], [354, 300], [354, 550], [6, 550]] },
      ],
      pos: {
        cams: [88, 62], imu: [276, 62],
        boards: [48, 148], orin: [182, 148, { label: 'Orin' , sub: 'orin2' }], batt: [302, 148],
        dvl: [70, 232], switch: [202, 232],
        router: [202, 340],
        optop: [70, 428], yours: [282, 428],
        opbox: [70, 512], wifi: [282, 512],
      },
      labels: { 'switch>router': [212, 290, 'start'], 'yours>orin': [334, 288, 'end', 'Tailscale'], 'yours>wifi': [274, 474, 'end'] },
      // the tunnel runs below the Batteries box and above the Switch, into the Orin's lower-right corner
      paths: { 'yours>orin': 'M330,404 C350,330 348,216 312,196 Q296,186 214,177' },
    },
    wide: {
      W: 940, H: 330, fs: [13.5, 12.5],
      bands: [
        { label: 'Inside Talos', points: [[8, 8], [450, 8], [450, 322], [8, 322]] },
        { label: 'On the surface', points: [[500, 8], [932, 8], [932, 322], [500, 322]] },
      ],
      pos: {
        cams: [120, 66], imu: [330, 66],
        boards: [62, 166], orin: [205, 166], batt: [398, 166, { sub: 'can1 · off' }],
        dvl: [100, 268], switch: [300, 268],
        router: [580, 268],
        optop: [660, 166, { sub: 'operator laptop' }], yours: [852, 166, { sub: 'Zenoh client' }],
        opbox: [730, 268], wifi: [868, 268],
      },
      labels: { 'switch>router': [442, 258, 'middle'], 'yours>orin': [560, 102, 'middle'], 'yours>wifi': [852, 222, 'end'] },
      paths: { 'yours>orin': 'M852,141 C846,112 800,110 740,110 L400,110 C320,110 282,122 266,141' },
    },
  };
  new NetMap({
    host: document.getElementById('net-graph'), read: document.getElementById('net-read'), seg: document.getElementById('net-filter'),
    nodes, edges, filters: FILTERS, layouts, reduced,
  });
}

// ---------------------------------------------------------------- CAN clients
async function canTable() {
  const host = document.getElementById('can-table');
  const d = await (await fetch(BASE + 'data/computers/can_ids.json')).json();
  const NAMES = {
    'internal:power_board': ['POAC board', 'power, kill switch, actuators'],
    'internal:esc_board0': ['ESC board 0', 'thrusters 0–3'],
    'internal:esc_board1': ['ESC board 1', 'thrusters 4–7'],
    'internal:camera_cage_bb': ['Camera cage breakout', 'depth sensor'],
    'internal:led_board': ['LED board', 'status lights'],
    'internal:ivc_board': ['IVC board', 'acoustic link between vehicles'],
    'external:smart_batery_port': ['Battery, port', 'charge, voltage and current; not in ROS today (agent off)'],
    'external:smart_batery_stbd': ['Battery, starboard', 'charge, voltage and current; not in ROS today (agent off)'],
  };
  const off = new Set(['internal:actuator_board', 'internal:sbc_board', 'external:downwards_camera']); // retired, firmware stub, not Talos
  const rate = (b) => `${b.rate / 1e6 >= 1 ? b.rate / 1e6 + ' Mbit/s' : b.rate / 1e3 + ' kbit/s'}${b.fd ? `, CAN FD data ${b.fd_rate / 1e6} Mbit/s` : ''}`;
  let html = '<table class="params can-ids"><thead><tr><th>ID</th><th>Board</th><th>What it does</th></tr></thead><tbody>';
  for (const bus of ['internal', 'external']) {
    const b = d.buses[bus];
    html += `<tr class="group"><td colspan="3">${bus === 'internal' ? 'Internal bus' : 'External bus'} · ${c(bus === 'internal' ? 'can0' : 'can1')} · ${rate(b)}</td></tr>`;
    for (const cl of d.clients.filter((x) => x.bus === bus)) {
      const k = `${bus}:${cl.name}`;
      if (off.has(k)) continue;
      const [name, what] = NAMES[k] || [cl.name, ''];
      html += `<tr><td>${b.id}.${cl.id}</td><td>${name}</td><td>${what}</td></tr>`;
    }
  }
  host.innerHTML = html + '</tbody></table>';
}

// ---------------------------------------------------------------- a frame's trip
function frameTrip() {
  const host = document.getElementById('trip');
  const detail = document.getElementById('trip-detail');
  const count = document.getElementById('trip-count');
  const RAW = 1920 * 1200 * 4, JPG = 537346, FPS = 15, LINK = 125e6;
  // view: what the right-hand panel shows. 'photo', or the stream comparison with these rows lit.
  const S = (where, title, size, view, html) => ({ where, title, size, view, html });
  const stages = [
    S('Camera', 'Captured', null, 'photo', `The forward ZED X Mini grabs a stereo pair at 1920×1200, 15 times a second (${a(GH.core + 'cfg/ffc_config.yaml#L12-L13', 'ffc_config.yaml')}). This is its left image.`),
    S('Cable', 'To the Orin', null, ['raw'], 'A GMSL2 cable, one per camera, carries the pixels to the capture card on the Orin. This cable is not the network: raw pixels never leave the hull.'),
    S('Orin', 'Rectified', RAW, ['raw', 'link'], `The ZED driver removes the lens distortion and publishes ${c('rgb/image_rect_color')} as raw pixels, 4 bytes each: 1920 × 1200 × 4 = <b>9.2 MB</b> a frame. Fifteen a second is more than a gigabit link carries.`),
    S('Orin', 'JPEG', JPG, ['raw', 'jpg'], `The same frame is also published as a JPEG on ${c('…/image_rect_color/compressed')}: <b>537 kB</b>, 17 times smaller.`),
    S('Orin', 'Detector', JPG, ['jpg'], `The YOLO detector runs on the Orin, as a separate program, so it reads the compressed topic too (${a(GH.perc + 'tensor_detector/src/yolo_orientation.py#L303', 'yolo_orientation.py')}). Out come detections and its own annotated JPEG.`),
    S('Orin', 'Router copies', JPG, ['jpg2', 'link'], `The Zenoh router sends one copy to every laptop subscribed to the topic. Two laptops watching the same camera means two copies on the tether.`),
    S('Tether', 'Tether', JPG, ['jpg', 'link'], 'Through the switch, along the tether and across the LAN. One camera as JPEG uses about 6% of a gigabit link; raw, it wouldn\'t fit at all.'),
    S('op-top', 'On screen', JPG, 'photo', 'The Nereus viewer on op-top decodes the JPEG and draws it. This is the frame.'),
  ];
  const ROWS = [
    { id: 'raw', label: 'Raw stream (inside the Orin)', v: RAW * FPS, cls: 'raw' },
    { id: 'link', label: 'Gigabit Ethernet, the most it carries', v: LINK, cls: 'link' },
    { id: 'jpg', label: 'JPEG stream, one laptop', v: JPG * FPS, cls: 'jpg' },
  ];
  const MAX = RAW * FPS * 1.04;
  const mbs = (v) => `${v / 1e6 >= 20 ? Math.round(v / 1e6) : (v / 1e6).toFixed(1)} MB/s`;
  let i = 0, timer = null;
  const cards = stages.map((s, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'trip-stage';
    b.innerHTML = `<span class="ts-n">${k + 1}</span><span class="ts-where">${s.where}</span><span class="ts-title">${s.title}</span>
      <span class="ts-size">${s.size ? (s.size / 1e6).toFixed(s.size > 1e6 ? 1 : 2) + ' MB' : 'raw pixels'}</span>`;
    b.addEventListener('click', () => { stop(); go(k); });
    host.appendChild(b);
    return b;
  });
  detail.innerHTML = `<div class="td-text"></div><div class="td-side">
    <figure class="td-img"><img src="${BASE}img/computers/ffc-frame.webp" width="960" height="600" alt="A real forward-camera frame from Talos on the bench: the team's lab, with a workbench, shelves, toolboxes and RoboSub banners on the wall." loading="lazy"><figcaption>What the forward camera saw: a real frame from the bench (shown downscaled)</figcaption></figure>
    <div class="td-cmp" role="img" aria-label="One camera's stream: raw 138 MB/s, gigabit Ethernet 125 MB/s, JPEG 8 MB/s">
      <p class="cmp-head">One camera, 15 frames a second</p>
      ${ROWS.map((r) => `<div class="cmp-row ${r.cls}" data-row="${r.id}"><span class="cmp-l">${r.label}</span><span class="cmp-track"><i style="width:${(r.v / MAX) * 100}%"></i>${r.id === 'jpg' ? `<i class="second" style="width:${(r.v / MAX) * 100}%"></i>` : ''}</span><span class="cmp-v">${mbs(r.v)}</span></div>`).join('')}
    </div></div>`;
  const txt = detail.querySelector('.td-text'), img = detail.querySelector('.td-img'), cmp = detail.querySelector('.td-cmp');
  const rowEls = [...cmp.querySelectorAll('.cmp-row')];
  const jpgV = cmp.querySelector('.cmp-row.jpg .cmp-v'), jpgL = cmp.querySelector('.cmp-row.jpg .cmp-l');
  function go(k) {
    i = (k + stages.length) % stages.length;
    cards.forEach((b, j) => { b.classList.toggle('on', j === i); b.classList.toggle('past', j < i); b.setAttribute('aria-current', j === i ? 'step' : 'false'); });
    const s = stages[i];
    txt.innerHTML = `<p class="td-head">${i + 1}. ${s.title} <span>· ${s.where}</span></p><p>${s.html}</p>`;
    const photo = s.view === 'photo';
    img.hidden = !photo;
    cmp.hidden = photo;
    if (!photo) {
      const two = s.view.includes('jpg2');
      rowEls.forEach((r) => r.classList.toggle('lit', s.view.includes(r.dataset.row) || (two && r.dataset.row === 'jpg')));
      cmp.classList.toggle('two', two);
      jpgV.textContent = two ? `${mbs(JPG * FPS * 2)}` : mbs(JPG * FPS);
      jpgL.textContent = two ? 'JPEG stream, ×2 for two laptops' : 'JPEG stream, one laptop';
    }
    count.textContent = `Stage ${i + 1} of ${stages.length}`;
  }
  const play = document.getElementById('trip-play');
  function stop() { clearInterval(timer); timer = null; play.textContent = 'Play'; }
  play.addEventListener('click', () => {
    if (timer) return stop();
    play.textContent = 'Pause';
    if (i === stages.length - 1) go(0);
    timer = setInterval(() => { if (i === stages.length - 1) return stop(); go(i + 1); }, 3200);
  });
  document.getElementById('trip-prev').addEventListener('click', () => { stop(); go(i - 1); });
  document.getElementById('trip-next').addEventListener('click', () => { stop(); go(i + 1); });
  go(0);
}

// ---------------------------------------------------------------- clock offset
function clockDemo() {
  const host = document.getElementById('clk-svg');
  const off = document.getElementById('clk-off'), lat = document.getElementById('clk-lat');
  const offO = document.getElementById('clk-off-o'), latO = document.getElementById('clk-lat-o');
  const verdict = document.getElementById('clk-verdict');
  const H = 232, R = 14;
  let W = 620, L = 22, T0 = -1.9, T1 = 1.9;
  const svg = el('svg', { class: 'chart clk', role: 'img', 'aria-label': 'Two clocks, the Orin and the laptop, with a message sent and received' }, host);
  const x = (t) => L + ((t - T0) / (T1 - T0)) * (W - L - R);
  const yO = 62, yL = 150;
  const g = el('g', {}, svg);
  new ResizeObserver(() => draw()).observe(host);
  const ms = (v) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v * 1000))} ms`;
  const txt = (attrs, s) => { const t = el('text', attrs, g); t.textContent = s; return t; };
  // A bracket from x1 to x2 at height y, its ends turned toward the axis (dir -1: up, 1: down).
  function bracket(x1, x2, y, dir, cls) {
    const [lo, hi] = x1 < x2 ? [x1, x2] : [x2, x1];
    el('path', { d: `M${lo},${y + 5 * dir}V${y}H${hi}V${y + 5 * dir}`, class: 'clk-br ' + cls }, g);
    return [lo, hi];
  }
  function draw() {
    // Phones get a narrower drawing (so the text stays readable) and a shorter time span.
    const phone = host.clientWidth > 0 && host.clientWidth < 480;
    [W, T0, T1] = phone ? [350, -1.6, 1.6] : [620, -1.9, 1.9];
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.toggle('phone', phone);
    const o = +off.value / 1000, d = +lat.value / 1000;
    const r = Math.abs(Math.round(o * 1000));
    offO.textContent = r === 0 ? 'in step' : `${r} ms ${o > 0 ? 'ahead' : 'behind'}`;
    latO.textContent = ms(d);
    g.replaceChildren();
    const ticks = (y, shift, avoid, keepZero) => {
      // a clock reading v sits at true time v - shift
      const step = phone ? 1 : 0.5;
      const vs = [];
      for (let v = Math.ceil((T0 + shift) / step) * step; v <= T1 + shift + 1e-9; v += step) if (x(v - shift) >= L - 0.5 && x(v - shift) <= W - R + 0.5) vs.push(v);
      const unit = vs.filter((v) => Math.abs(v) > 1e-9).pop(); // the rightmost non-zero label carries the unit
      for (const v of vs) {
        const tx = x(v - shift), zero = Math.abs(v) < 1e-9;
        el('line', { x1: tx, x2: tx, y1: y - 5, y2: y + 5, class: 'clk-tick' + (zero ? ' zero' : '') }, g);
        if (avoid.some((ax) => Math.abs(tx - ax) < (phone ? 26 : 22)) && !(zero && keepZero)) continue;
        txt({ x: tx, y: y + 21, class: 'clk-tl' + (zero && keepZero ? ' zero' : '') }, `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}${v === unit ? ' s' : ''}`);
      }
    };
    // Orin axis: names sit above the left end of each axis
    el('line', { x1: L, x2: W - R, y1: yO, y2: yO, class: 'clk-axis' }, g);
    txt({ x: L, y: yO - 30, class: 'clk-name' }, 'Orin clock');
    ticks(yO, 0, [x(0)], false); // the stamp label names the Orin's 0
    el('line', { x1: L, x2: W - R, y1: yL, y2: yL, class: 'clk-axis' }, g);
    txt({ x: L, y: yL - 30, class: 'clk-name' }, 'laptop clock');
    // the laptop's own zero: where the laptop reads 0 (true time -o)
    const z = x(-o);
    el('line', { x1: z, x2: z, y1: yL - 9, y2: yL + 9, class: 'clk-zero' }, g);
    ticks(yL, o, [x(d)], true);
    // message: stamped when the Orin reads 0, arrives d later (true time); the laptop then reads d + o
    el('line', { x1: x(0), y1: yO, x2: x(d), y2: yL, class: 'clk-msg' }, g);
    el('circle', { cx: x(0), cy: yO, r: 5.5, class: 'clk-send' }, g);
    el('circle', { cx: x(d), cy: yL, r: 5.5, class: 'clk-recv' }, g);
    txt({ x: x(0), y: yO - 12, class: 'clk-lab' }, 'stamped 0');
    const age = d + o;
    // real delay: just above the laptop axis, its label to the right of the message line
    // too narrow to read as a bracket (short delays): the label alone, beside the arrival dot
    const dh = x(d) - x(0) >= 14 ? bracket(x(0), x(d), yL - 16, 1, 'del')[1] : Math.max(x(0), x(d));
    txt({ x: dh + 8, y: yL - 12, class: 'clk-lab del start' }, `delay ${ms(d)}`);
    // apparent age: below the laptop's tick labels, from where the laptop reads 0 to the arrival
    const [lo, hi] = bracket(z, x(d), yL + 36, -1, 'age');
    txt({ x: Math.min(W - R - 80, Math.max(L + 80, (lo + hi) / 2)), y: yL + 56, class: 'clk-lab age' }, `apparent age ${ms(age)}`);
    const items = [age < 0
      ? `The message looks <b>${ms(-age)} from the future</b>, though it took ${ms(d)} to arrive.`
      : `The message looks <b>${ms(age)} old</b>, though it took ${ms(d)} to arrive.`];
    if (Math.abs(age) > 0.5) items.push('<span class="bad">The viewer\'s plots show "clock offset".</span>');
    if (Math.abs(o) > 0.05) items.push(`<span class="warn">The <a href="pool-test.html#pretest">pre-test checks</a> warn (offset over 50 ms).</span>`);
    else items.push('<span class="ok">Within the pre-test checks\' 50 ms.</span>');
    verdict.innerHTML = items.join(' ');
  }
  off.addEventListener('input', draw);
  lat.addEventListener('input', draw);
  draw();
}

networkMap();
canTable();
frameTrip();
clockDemo();
