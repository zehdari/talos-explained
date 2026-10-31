import { setup } from '../layout.js';
import { Graph } from '../viz/graph.js';
import { el } from '../viz/chart.js';
import '../css/chapter.css';
import '../css/computers.css';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = {
  launch: 'https://github.com/osu-uwrt/riptide_launch/blob/newsim/remote_launch/',
  rel: 'https://github.com/osu-uwrt/riptide_release/blob/master/scripts/',
  core: 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/',
  ctrl: 'https://github.com/osu-uwrt/riptide_control/blob/mpc/',
  perc: 'https://github.com/osu-uwrt/riptide_perception/blob/mapping-estimator/',
  nereus: 'https://github.com/osu-uwrt/nereus/blob/main/',
  opbox: 'https://github.com/osu-uwrt/opbox_software/blob/dev/',
};
const TDR24 = 'https://bpb-us-e1.wpmucdn.com/org.osu.edu/dist/1/19/files/2024/06/TDR_THEOhioStateUniversity_RS2024.pdf';
const a = (href, text) => `<a href="${href}">${text}</a>`;
const c = (t) => `<code>${t}</code>`;
// Public images: set from JS with BASE_URL (a root-absolute src in the HTML gets the base prefixed twice by the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------- the network map
function networkMap() {
  const host = document.getElementById('net-graph');
  const note = document.getElementById('net-note');
  const flowNote = document.getElementById('net-flow');
  const seg = document.getElementById('net-filter');
  const hint = 'Tap a machine for what it runs and where it lives.';

  const N = (id, x, y, label, sub, html, extra = {}) => ({ id, x, y, label, sub, html, ...extra });
  const nodes = [
    N('cams', 95, 60, '2 × ZED X Mini', 'GMSL2 cameras',
      `<b>Forward (ffc) and down (dfc) stereo cameras.</b> ZED X Mini, 1920×1200 at 15 fps (${a(GH.core + 'cfg/ffc_config.yaml', 'ffc_config.yaml')}), on a GMSL2 capture card in the Orin. Only the Orin sees raw frames. <a href="cameras.html">The cameras</a>.`),
    N('serial', 95, 145, 'IMU + FOG', 'serial ports',
      `<b>VectorNav VN-100 IMU and fibre-optic gyro.</b> Serial lines straight into the Orin: ${c('/dev/ttyTHS1')} and ${c('/dev/ttyTHS2')}. The gyro speaks RS-422, through a team-made board in the Orin's M.2 slot. <a href="sensors.html">Navigation sensors</a>.`),
    N('boards', 95, 230, 'Circuit boards', 'RP2040s, can0',
      `<b>POAC (power + actuators), two ESC boards, camera cage breakout, LED and IVC boards</b> (and an SBC board, if one is fitted). Each runs micro-ROS firmware on an RP2040 and talks only CAN, on the internal bus the Orin reaches as ${c('can0')}. <a href="boards.html">The circuit boards</a>.`),
    N('batt', 95, 315, 'Battery housings', 'external CAN',
      `<b>Two smart battery housings</b> (port and starboard) on the external bus, ${c('can1')} at 250 kbit/s. Bench tests run on a power supply instead. <a href="electrical.html">Power and wiring</a>.`),
    N('dvl', 95, 400, 'Nortek DVL1000', '192.168.1.212',
      `<b>The DVL</b>, hostname ${c('uwrt-dvl')}. The driver connects to it over TCP, through the switch. Its web page shows its settings, and the settings stored on the DVL are the ones that count.`),
    N('switch', 320, 385, 'Network switch', 'camera cage',
      `<b>A small Ethernet switch in the camera cage</b> (${a(TDR24, '2024 TDR')}, Fig. 18). The Orin's one Ethernet port, the DVL and the tether all meet here, so the DVL is on the same LAN as everything else.`),
    N('orin', 320, 215, 'Jetson AGX Orin', 'orin2 · 192.168.1.24',
      `<b>Talos's only computer.</b> Runs every robot node from ${c('~/colcon_deploy')}, started by the ${c('ros_launcher')} service, which also hosts the Zenoh router (TCP 7447) and the launcher page (port 8080). User ${c('ros')}. <a href="#orin">More below</a>.`,
      { bold: true }),
    N('router', 600, 230, 'Team router', '192.168.1.1',
      `<b>The team router</b>, gateway of the robot LAN (192.168.1.0/24). The tether and laptops join the LAN through it. Its other side, 192.168.5.0/24, goes to the opbox for internet. Which router is used at the pool, and where op-top plugs in there, is unconfirmed.`),
    N('optop', 830, 230, 'op-top', 'operator laptop',
      `<b>The team laptop.</b> Nereus viewer (enable, kill, drive, trees, bags), the simulator, the release workspace you deploy from, and the pre-test checks. A Zenoh client of the Orin. Its keyboard backlight shows whether ${c('orin2')} answers pings. <a href="#optop">More below</a>.`),
    N('yours', 690, 145, 'Your laptop', 'Zenoh client',
      `<b>Any Ubuntu 22.04 + ROS 2 Humble machine.</b> On the LAN, or anywhere through Tailscale. It opens one client connection to the Orin's router, and the robot never connects back. <a href="#join">How to join</a>.`),
    N('opbox', 600, 370, 'opbox (Raspberry Pi)', '192.168.5.69',
      `<b>The operator box's Raspberry Pi.</b> NATs the robot LAN out over campus Wi-Fi, and runs chrony as the team clock (battery-backed RTC). Its kill button is not wired into Talos's kill in the current code. <a href="#opbox">More below</a>.`),
    N('wifi', 830, 370, 'Campus Wi-Fi', 'internet',
      `<b>The way out.</b> The opbox's ${c('wlan0')} joins it, giving every LAN machine apt, pip and GitHub, and giving the opbox's chrony real time to serve.`),
    N('tailnet', 790, 40, 'Tailscale', 'remote access',
      `<b>The team's tailnet</b>, an encrypted overlay network. The Orin, op-top and the opbox are on it, so members can reach the robot from anywhere they're allowed to. <b>It is a tunnel over the internet path, not a radio:</b> the Orin's Tailscale traffic still runs through the tether, the router, the opbox and campus Wi-Fi. It only reaches Talos while the tether is in and the opbox has internet. The robot is reached, it doesn't dial out. The team doesn't publish its addresses or names.`),
  ];
  // kinds: which filters an edge belongs to; dir per kind: 1 from→to, -1 to→from, 0 both ways
  const E = (from, to, label, flows, extra = {}) => ({ from, to, label, flows, ...extra });
  const edges = [
    E('cams', 'orin', 'GMSL2', { sensors: 1 }),
    E('serial', 'orin', 'serial', { sensors: 1 }),
    E('boards', 'orin', 'can0', { sensors: 0, ros: 0 }),
    E('batt', 'orin', 'can1', { sensors: 1 }),
    E('dvl', 'switch', 'Ethernet', { sensors: 1 }),
    E('switch', 'orin', 'eth0', { sensors: 1, ros: 0, time: 1, internet: 0, ssh: 1 }),
    E('switch', 'router', 'tether', { ros: 0, time: -1, internet: 0, ssh: -1 }, { width: 2.4 }),
    E('router', 'optop', '', { ros: 0, time: 1, internet: 0, ssh: -1 }),
    E('router', 'yours', '', { ros: 0, internet: 0, ssh: -1 }),
    E('router', 'opbox', '', { time: -1, internet: 0 }),
    E('opbox', 'wifi', 'Wi-Fi', { time: -1, internet: 0 }),
    E('yours', 'tailnet', '', { ros: 0, ssh: 1 }, { dash: true }),
    E('optop', 'tailnet', '', { ros: 0, ssh: 1 }, { dash: true }),
    E('tailnet', 'orin', '', { ros: 0, ssh: 1 }, { dash: true, via: [470, 20] }),
  ];
  const narrow = {
    below: 620,
    width: 390,
    height: 800,
    bands: [
      { label: 'Inside Talos', points: [[6, 8], [384, 8], [384, 432], [6, 432]] },
      { label: 'On the surface', points: [[6, 478], [384, 478], [384, 794], [6, 794]] },
    ],
    nodes: {
      cams: { x: 100, y: 62, sub: 'GMSL2' }, serial: { x: 290, y: 62, sub: 'serial' },
      boards: { x: 55, y: 215, label: 'Boards', sub: 'can0' }, orin: { x: 207, y: 215, sub: 'orin2' },
      batt: { x: 337, y: 215, label: 'Batteries', sub: 'can1' }, dvl: { x: 90, y: 365, label: 'Nortek DVL' },
      switch: { x: 245, y: 365, label: 'Switch' },
      router: { x: 195, y: 535 }, optop: { x: 85, y: 640 }, yours: { x: 305, y: 640 },
      opbox: { x: 140, y: 748, label: 'opbox (Pi)' }, wifi: { x: 305, y: 748 }, tailnet: { x: 328, y: 455 },
    },
    edges: {
      'cams>orin': { label: '' }, 'serial>orin': { label: '' }, 'batt>orin': { label: '' },
      'boards>orin': { label: '' }, 'dvl>switch': { label: '' }, 'switch>orin': { label: '' },
      'switch>router': { label: 'tether', lx: 237, ly: 420, anchor: 'start' },
      'optop>tailnet': { via: [60, 455] },
      'opbox>wifi': { label: '' },
      'tailnet>orin': { via: [345, 300] },
    },
  };
  const graph = new Graph(host, {
    width: 940, height: 440, nodes, edges, arrows: false, narrow,
    bands: [
      { label: 'Inside Talos', points: [[8, 8], [425, 8], [425, 432], [8, 432]] },
      { label: 'On the surface', points: [[488, 88], [932, 88], [932, 432], [488, 432]] },
    ],
    info: (n) => { note.innerHTML = n ? n.html : hint; },
  });
  note.textContent = hint;

  const FILTERS = [
    { id: 'all', label: 'Everything', color: null, text: 'Every link. Cables inside the hull are in the Inside Talos box, the robot LAN in the On the surface box. Dashed lines are Tailscale tunnels, which ride the same cables.' },
    { id: 'ros', label: 'ROS 2', color: 'var(--state)', text: `<b>ROS 2 over Zenoh.</b> Every laptop holds one TCP connection to the router on the Orin (port 7447), on the LAN or through a Tailscale tunnel (which still runs over the tether). The boards' topics enter through the micro-ROS agent on ${c('can0')}.` },
    { id: 'sensors', label: 'Sensors & CAN', color: 'var(--s7)', text: `<b>Everything the Orin reads directly.</b> Cameras on GMSL2, IMU and gyro on serial, the DVL on Ethernet, the boards on ${c('can0')} (and back: the MPC writes thruster RPMs there), batteries on ${c('can1')}.` },
    { id: 'time', label: 'Time', color: 'var(--prediction)', text: '<b>chrony.</b> The opbox takes time from the internet pool when it can, else from its battery-backed clock, and serves it. Talos is set to follow only the opbox, op-top to prefer it (check with <code>chronyc sources</code>).' },
    { id: 'internet', label: 'Internet', color: 'var(--s4)', text: "<b>The passthrough.</b> LAN traffic leaves through the router to the opbox, which NATs it out over campus Wi-Fi. That's how the Orin and laptops reach apt and GitHub." },
    { id: 'ssh', label: 'SSH', color: 'var(--ink)', text: `<b>SSH, key login only.</b> From a laptop to ${c('ros@orin2')}: logs, ${c('colcon deploy')}, the viewer's bag recorder. Always laptop to robot, never the other way.` },
  ];
  let current = 'all', svg = null, dots = [], t0 = performance.now();
  const buttons = FILTERS.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f.label;
    b.setAttribute('aria-pressed', f.id === current);
    b.addEventListener('click', () => { current = f.id; apply(); });
    seg.appendChild(b);
    return b;
  });
  function apply() {
    const f = FILTERS.find((x) => x.id === current);
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', FILTERS[i].id === current));
    flowNote.innerHTML = f.text;
    svg = graph.svg;
    svg.style.setProperty('--flow', f.color || 'var(--accent)');
    graph.gPulses.replaceChildren();
    dots = [];
    for (const e of graph.edges) {
      const dir = f.id === 'all' ? undefined : e.flows[f.id];
      const on = dir !== undefined;
      e.path.classList.toggle('flow-on', on);
      e.path.classList.toggle('flow-off', f.id !== 'all' && !on);
      if (e.label) e.label.classList.toggle('flow-off', f.id !== 'all' && !on);
      if (!on || reduced) continue;
      const len = e.path.getTotalLength();
      const make = (rev, phase) => dots.push({ e, rev, phase, len, dot: el('circle', { class: 'pulse flow-dot', r: 3.4 }, graph.gPulses) });
      if (dir >= 0) make(false, 0);
      if (dir <= 0) make(true, dir === 0 ? 0.5 : 0);
    }
  }
  apply();
  let visible = true;
  new IntersectionObserver(([en]) => (visible = en.isIntersecting)).observe(host);
  const loop = (now) => {
    if (graph.svg !== svg) apply(); // the narrow/wide layout was rebuilt
    if (visible && dots.length) {
      const u = ((now - t0) / 2200) % 1;
      for (const d of dots) {
        let s = (u + d.phase) % 1;
        if (d.rev) s = 1 - s;
        const p = d.e.path.getPointAtLength(s * d.len);
        d.dot.setAttribute('cx', p.x);
        d.dot.setAttribute('cy', p.y);
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- the launcher's lists
async function launchExplorer() {
  const pick = document.getElementById('launch-pick');
  const list = document.getElementById('launch-list');
  const desc = document.getElementById('launch-desc');
  const data = await (await fetch(BASE + 'data/computers/launches.json')).json();
  const FILES = [
    { file: 'talos_launch_mpc.yaml', label: 'In the water', text: 'The whole robot: sensors, both navigation entries, the MPC, cameras, detector, mapping, autonomy.' },
    { file: 'talos_launch_bench_mpc.yaml', label: 'Bench', text: `The same list with ${c('hardware_fake_dvl.launch.py')}, which swaps the DVL driver for ${c('fake_dvl.py')}: on a table the DVL has no bottom to see, so the fake publishes zero velocity with a little noise.` },
    { file: 'talos_launch_sim_hil_mpc.yaml', label: 'Sim HIL', text: 'Hardware in the loop: the Orin runs navigation, the MPC, the detector, mapping and autonomy, and a simulator supplies the sensors and cameras. No hardware or ZED entries.' },
  ];
  const NOTES = {
    'riptide_hardware2/hardware.launch.py': `Sensor drivers (DVL, IMU, gyro), the micro-ROS agent on ${c('can0')}, AprilTag, acoustics, actuators and IMU power-cycling.`,
    'riptide_hardware2/hardware_fake_dvl.launch.py': `${c('hardware.launch.py')} with the DVL driver replaced by ${a(GH.core + 'riptide_hardware2/fake_dvl.py', c('fake_dvl.py'))}. It publishes a DVL twist of zero plus 0.005 m/s noise and a DVL status, 8 times a second, so the EKF and the MPC still get a velocity on the bench.`,
    'riptide_hardware2/navigation.launch.py': 'The EKF (robot_localization) and the robot description: odometry/filtered and TF. The cameras need this one running.',
    'riptide_navigation/navigation.launch.py': `Started with ${c('mode:=replacement')}. Its package isn't in the release workspace or any team repo we found; the commit that added it is titled "Add simulink nav to launches". The cameras need riptide_hardware2's navigation entry, not this one.`,
    'riptide_controllers2/control_system.launch.py': `The controller, here the MPC (${c('active_control_model:=mpc')}). <b class="warn">On an enabled robot this spins the thrusters.</b>`,
    'riptide_hardware2/zed.launch.py': 'Both ZED cameras as components in one container, plus a picture taker.',
    'tensor_detector/tensorrt.launch.py': 'The YOLO detector (yolo_orientation) on the GPU.',
    'riptide_mapping2/mapping.launch.py': 'The course map. Nothing to wait for: it publishes when there are detections.',
    'riptide_autonomy2/autonomy.launch.py': 'The behaviour-tree executor. Trees are started from the viewer.',
    'riptide_hardware2/diagnostics.launch.py': 'The old diagnostics node. Still in the list, no longer used.',
  };
  let cur = FILES[0].file;
  const btns = FILES.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = f.label;
    b.addEventListener('click', () => { cur = f.file; render(); });
    pick.appendChild(b);
    return b;
  });
  function render() {
    btns.forEach((b, i) => b.setAttribute('aria-pressed', FILES[i].file === cur));
    const meta = FILES.find((f) => f.file === cur);
    const file = data.files.find((f) => f.file === cur);
    desc.innerHTML = `<a href="https://github.com/osu-uwrt/riptide_launch/blob/newsim/remote_launch/launches/${cur}"><code>${cur}</code></a>: ${meta.text}`;
    list.replaceChildren();
    for (const e of file.entries) {
      const li = document.createElement('li');
      const d = document.createElement('details');
      const key = `${e.package}/${e.file}`;
      const n = e.topics.length;
      const danger = e.package === 'riptide_controllers2';
      d.innerHTML = `<summary${danger ? ' class="danger"' : ''}><span class="lf-name">${e.file.replace('.launch.py', '')}</span><span class="lf-pkg">${e.package}</span><span class="lf-wait">${n ? `waits for ${n} topic${n > 1 ? 's' : ''}` : 'running at once'}</span></summary>
        <div class="lf-body">
          <p>${NOTES[key] || ''}</p>
          ${e.args.length ? `<p class="lf-args">${e.args.map((x) => `<code>${x}</code>`).join(' ')}</p>` : ''}
          ${n ? `<ul class="lf-topics">${e.topics.map((t) => `<li><code>${t.name}</code> <span>${t.type.replace('/msg/', '/')}</span></li>`).join('')}</ul>` : '<p class="lf-none">No topics listed: the entry counts as running as soon as it starts.</p>'}
        </div>`;
      li.appendChild(d);
      list.appendChild(li);
    }
  }
  render();
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
    'internal:actuator_board': ['Actuator board', 'older robots; Talos uses the POAC'],
    'internal:led_board': ['LED board', 'status lights'],
    'internal:sbc_board': ['SBC board', 'Talos firmware exists; whether one is fitted is unconfirmed'],
    'internal:ivc_board': ['IVC board', 'inter-vehicle acoustic link'],
    'external:smart_batery_port': ['Battery housing, port', ''],
    'external:smart_batery_stbd': ['Battery housing, starboard', ''],
    'external:downwards_camera': ['Downwards camera', 'not on Talos'],
  };
  const off = new Set(['internal:actuator_board', 'external:downwards_camera']);
  const rate = (b) => `${b.rate / 1e6 >= 1 ? b.rate / 1e6 + ' Mbit/s' : b.rate / 1e3 + ' kbit/s'}${b.fd ? `, CAN FD data ${b.fd_rate / 1e6} Mbit/s` : ''}`;
  let html = '<table class="params can-ids"><thead><tr><th>ID</th><th>Board</th><th>What it does</th></tr></thead><tbody>';
  for (const bus of ['internal', 'external']) {
    const b = d.buses[bus];
    html += `<tr class="group"><td colspan="3">${bus === 'internal' ? 'Internal bus' : 'External bus'} · ${c(bus === 'internal' ? 'can0' : 'can1')} · ${rate(b)}</td></tr>`;
    for (const cl of d.clients.filter((x) => x.bus === bus)) {
      const k = `${bus}:${cl.name}`;
      const [name, what] = NAMES[k] || [cl.name, ''];
      html += `<tr${off.has(k) ? ' class="off"' : ''}><td>${b.id}.${cl.id}</td><td>${name}</td><td>${what}</td></tr>`;
    }
  }
  host.innerHTML = html + '</tbody></table>';
}

// ---------------------------------------------------------------- a frame's trip
function frameTrip() {
  const host = document.getElementById('trip');
  const detail = document.getElementById('trip-detail');
  const count = document.getElementById('trip-count');
  const RAW = 1920 * 1200 * 4, JPG = 537346;
  const S = (where, title, size, html) => ({ where, title, size, html });
  const stages = [
    S('Camera', 'Captured', null, `The forward ZED X Mini grabs a stereo pair at 1920×1200, 15 times a second (${a(GH.core + 'cfg/ffc_config.yaml#L12-L13', c('grab_resolution: HD1200, grab_frame_rate: 15'))}).`),
    S('Cable', 'Down the GMSL2 link', null, 'A GMSL2 serial cable carries the pixels to the capture card on the Orin. Raw pixels never leave the hull.'),
    S('Orin', 'Rectified', RAW, `The ZED wrapper (one ${c('ZedCamera')} component per camera, in ${c('zed_container')}) undistorts the left image and publishes ${c('rgb/image_rect_color')} as raw BGRA: 1920 × 1200 × 4 bytes = <b>9.2 MB</b>.`),
    S('Orin', 'Compressed', JPG, `${c('image_transport')}'s compressed plugin publishes the same frame as a JPEG on ${c('…/rgb/image_rect_color/compressed')}. This frame is <b>537,346 bytes</b>, 17 times smaller.`),
    S('Orin', 'Detector reads it', JPG, `The detector is a separate process, so it subscribes to the compressed topic too (${a(GH.perc + 'tensor_detector/src/yolo_orientation.py#L303', 'yolo_orientation.py')}), decodes it and runs YOLO on the GPU. Out come detections and its own annotated JPEG, ${c('yolo_orientation/annotated/compressed')}.`),
    S('Orin', 'Router copies it', JPG, `${c('rmw_zenohd')} sends one copy to every client session subscribed to the topic. Two laptops watching the same camera means two copies on the tether.`),
    S('Tether', 'Over TCP', JPG, 'Through the switch, along the tether and across the LAN to the laptop. At 15 fps one camera is about 8 MB/s (64 Mbit/s). Raw, the same stream would be 138 MB/s, more than a gigabit Ethernet link carries.'),
    S('op-top', 'On screen', JPG, `The Nereus viewer subscribes with ${c('KeepLast(1)')}, reliable (${a(GH.nereus + 'integrations/ros2/viewer/src/ros_side.cpp#L335-L353', 'ros_side.cpp')}), updates its frame-rate readout and passes the JPEG to a worker thread. The worker decodes it at a reduced scale, as small as the camera card allows. This is the frame.`),
  ];
  let i = 0, timer = null;
  const cards = stages.map((s, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'trip-stage';
    const w = s.size ? Math.max(2, (s.size / RAW) * 100) : 0;
    b.innerHTML = `<span class="ts-n">${k + 1}</span><span class="ts-where">${s.where}</span><span class="ts-title">${s.title}</span>
      <span class="ts-bar" aria-hidden="true"><span style="width:${w}%"></span></span><span class="ts-size">${s.size ? (s.size / 1e6).toFixed(s.size > 1e6 ? 1 : 2) + ' MB' : 'stereo pixels'}</span>`;
    b.addEventListener('click', () => { stop(); go(k); });
    host.appendChild(b);
    return b;
  });
  detail.innerHTML = `<div class="td-text"></div><figure class="td-img"><img src="${BASE}img/computers/ffc-frame.webp" width="960" height="600" alt="A real forward-camera frame from Talos on the bench: the team's lab, with a workbench, shelves, toolboxes and RoboSub banners on the wall." loading="lazy"><figcaption></figcaption></figure>`;
  const txt = detail.querySelector('.td-text'), cap = detail.querySelector('figcaption');
  function go(k) {
    i = (k + stages.length) % stages.length;
    cards.forEach((b, j) => { b.classList.toggle('on', j === i); b.classList.toggle('past', j < i); b.setAttribute('aria-current', j === i ? 'step' : 'false'); });
    const s = stages[i];
    txt.innerHTML = `<p class="td-head">${i + 1}. ${s.title} <span>· ${s.where}</span></p><p>${s.html}</p>`;
    cap.textContent = i < 2 ? 'What the forward camera saw: a real frame from the bench' : i === 2 ? 'As raw BGRA pixels: 9.2 MB' : 'As the JPEG on the topic: 537 kB (shown downscaled)';
    count.textContent = `Stage ${i + 1} of ${stages.length}`;
  }
  const play = document.getElementById('trip-play');
  function stop() { clearInterval(timer); timer = null; play.textContent = 'Play'; }
  play.addEventListener('click', () => {
    if (timer) return stop();
    play.textContent = 'Pause';
    if (i === stages.length - 1) go(0);
    timer = setInterval(() => { if (i === stages.length - 1) return stop(); go(i + 1); }, 2600);
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
  const H = 196, R = 16;
  let W = 620, L = 92, T0 = -1.9, T1 = 1.9;
  const svg = el('svg', { class: 'chart clk', role: 'img', 'aria-label': 'Two clocks, the Orin and the laptop, with a message sent and received' }, host);
  const x = (t) => L + ((t - T0) / (T1 - T0)) * (W - L - R);
  const yO = 46, yL = 142;
  const g = el('g', {}, svg);
  new ResizeObserver(() => draw()).observe(host);
  function draw() {
    // Phones get a smaller drawing (so the text stays readable) and a shorter time span.
    const phone = host.clientWidth > 0 && host.clientWidth < 480;
    [W, L, T0, T1] = phone ? [380, 80, -1.6, 1.6] : [620, 92, -1.9, 1.9];
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.classList.toggle('phone', phone);
    const o = +off.value / 1000, d = +lat.value / 1000;
    offO.textContent = `${o > 0 ? '+' : o < 0 ? '−' : ''}${Math.abs(o * 1000).toFixed(0)} ms`;
    latO.textContent = `${(d * 1000).toFixed(0)} ms`;
    g.replaceChildren();
    // dot: where the message's dot sits on this axis (its tick label would hide under the dot and the message line)
    const axis = (y, label, shift, cls, dot) => {
      el('line', { x1: L, x2: W - R, y1: y, y2: y, class: 'clk-axis' }, g);
      const t = el('text', { x: 4, y: y + 4, class: 'clk-name' }, g); t.textContent = label;
      // a clock reading v sits at true time v - shift
      for (let v = Math.ceil((T0 + shift) * 2) / 2; v <= T1 + shift + 1e-9; v += 0.5) {
        const tx = x(v - shift);
        if (tx < L - 0.5 || tx > W - R + 0.5) continue;
        el('line', { x1: tx, x2: tx, y1: y - 5, y2: y + 5, class: 'clk-tick' + (Math.abs(v) < 1e-9 ? ' zero' : '') }, g);
        if (Math.abs(tx - dot) < (phone ? 22 : 18)) continue;
        const lt = el('text', { x: tx, y: y + 20, class: 'clk-tl ' + cls }, g);
        lt.textContent = `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
      }
    };
    axis(yO, 'Orin clock', 0, 'o', x(0));
    axis(yL, 'laptop clock', o, 'l', x(d));
    // message: stamped at true 0 (Orin reads 0), arrives at true d (laptop reads d + o)
    el('line', { x1: x(0), y1: yO, x2: x(d), y2: yL, class: 'clk-msg' }, g);
    el('circle', { cx: x(0), cy: yO, r: 5, class: 'clk-send' }, g);
    el('circle', { cx: x(d), cy: yL, r: 5, class: 'clk-recv' }, g);
    const s1 = el('text', { x: x(0), y: yO - 12, class: 'clk-lab' }, g); s1.textContent = 'stamped 0.000';
    const age = d + o;
    const s2 = el('text', { x: x(d), y: yL + 38, class: 'clk-lab' }, g);
    s2.textContent = `arrives, laptop reads ${age >= 0 ? '+' : '−'}${Math.abs(age).toFixed(3)}`;
    const items = [];
    items.push(`Apparent age <b>${(age * 1000).toFixed(0)} ms</b> (real delay ${(d * 1000).toFixed(0)} ms).`);
    if (age < 0) items.push('<span class="bad">The message looks like it comes from the future.</span>');
    if (Math.abs(age) > 0.5) items.push('<span class="bad">The viewer\'s plots show "clock offset" (they test the whole gap, delay included).</span>');
    if (Math.abs(o) > 0.05) items.push('<span class="warn">The pre-test check B1 warns (over 50 ms).</span>');
    if (Math.abs(o) > 1) items.push('chrony on op-top would step its clock (more than 1 s off).');
    if (Math.abs(o) <= 0.05) items.push('<span class="ok">Within the pre-test check\'s 50 ms.</span>');
    verdict.innerHTML = items.join(' ');
  }
  off.addEventListener('input', draw);
  lat.addEventListener('input', draw);
  draw();
}

networkMap();
launchExplorer();
canTable();
frameTrip();
clockDemo();
