import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/setup.css';

setup();
// Public images: the base path comes from Vite (an absolute src in the HTML gets the base added twice in dev).
document.querySelectorAll('img[data-src]').forEach((im) => (im.src = BASE + im.dataset.src));

const RS = 'https://github.com/osu-uwrt/riptide_setup/blob/humble/';
const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const h = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const getJSON = (name) => fetch(`${BASE}data/setup/${name}`).then((r) => r.json());
const dataWs = getJSON('workspace.json');
const dataEnv = getJSON('env_layers.json');

// Generated commands wrap only between words or after a slash, never inside a flag like --delete.
const fmt = (c) => c.split('\n').map((line) => line.split(/( +)/).map((tok) => (!tok || / /.test(tok) ? tok
  : tok.includes('/') ? esc(tok).replace(/\//g, '/<wbr>') : `<span class="nb">${esc(tok)}</span>`)).join('')).join('\n');

// ---------------------------------------------------------------- what setup.bash does
// Read from riptide_setup (branch humble); line ranges point at the commands shown.
const STEPS = [
  {
    t: 'Python tools and a system upgrade', tags: ['sudo', 'ask'], file: 'setup.bash', l: 'L3-L9',
    cmd: 'sudo apt-get install python3-pip --yes\npython3 -m pip install --upgrade pip\nsudo python3 -m pip install vcstool\nsudo apt update && sudo apt upgrade',
    d: '<code>vcstool</code> is the <code>vcs</code> command that clones many repos from one list. The upgrade has no <code>-y</code>, so it waits for you to confirm.',
  },
  {
    t: 'Check the Ubuntu version', tags: [], file: 'setup_scripts/update_system.bash', l: 'L3-L25',
    d: 'Stops if you ran it with sudo ("Please dont use sudo with this script"). Ubuntu 22.04 selects <code>ROS_DISTRO=humble</code>; any other version prints "Linux version not recognized" and exits.',
  },
  {
    t: 'Install ROS 2 Humble', tags: ['sudo', 'ask'], file: 'setup_scripts/install_ros.bash', l: 'L9-L42',
    cmd: '# adds the ROS apt key and packages.ros.org to the apt sources\n# ros-humble-ros-base instead if you type "base"\nsudo apt install ros-humble-desktop -y\nsudo apt install python3-rosdep python3-colcon-common-extensions python3-colcon-clean -y\nsudo rosdep init\nrosdep update',
    d: 'Everything lands in <code>/opt/ros/humble</code>. Skipped if that folder already exists.',
  },
  {
    t: 'Clone the development workspaces', tags: ['sudo'], file: 'setup_scripts/dev_install/install_dev.bash', l: 'L3-L22',
    cmd: 'mkdir -p ~/osu-uwrt/development && cd ~/osu-uwrt/development\nsudo rosdep init\nrosdep update\nvcs import < ~/osu-uwrt/riptide_setup/setup_scripts/dev_install/riptide.repos . --recursive\nvcs pull\ntouch titan_firmware/COLCON_IGNORE',
    d: '<a href="' + RS + 'setup_scripts/dev_install/riptide.repos"><code>riptide.repos</code></a> puts six riptide repos in <code>software/src</code>, five drivers in <code>dependencies/src</code> (nortek_dvl, micro_ros_setup, vectornav, zed_ros2_wrapper, chameleon_tf) and <code>titan_firmware</code>. If step 3 already ran <code>rosdep init</code>, it prints "default sources list file already exists" here and the script carries on. colcon has to skip the firmware: it is built with the Pico toolchain (<a href="firmware.html">Firmware on the boards</a>).',
  },
  {
    t: 'Skip GPU packages if there is no NVIDIA driver', tags: [], file: 'setup_scripts/dev_install/install_dev.bash', l: 'L28-L34',
    cmd: 'python3 package_disable.py zed\npython3 package_disable.py tensor_detector',
    d: 'Only when <code>nvidia-smi</code> isn\'t found. <a href="' + RS + 'setup_scripts/dev_install/package_disable.py"><code>package_disable.py</code></a> drops a <code>COLCON_IGNORE</code> into every package whose <code>colcon list</code> line contains the word.',
  },
  {
    t: 'Build the development workspaces', tags: ['sudo'], file: 'setup_scripts/dev_install/install_dev.bash', l: 'L36-L62',
    cmd: 'cd ~/osu-uwrt/development/dependencies\nrosdep install --from-paths src --ignore-src --rosdistro humble -y -r\ncolcon build\nsudo apt install -y cmake gcc-arm-none-eabi libnewlib-arm-none-eabi build-essential\ncd ~/osu-uwrt/development/software\nrosdep install --from-paths src --ignore-src --rosdistro humble -y -r\nsource ~/osu-uwrt/development/dependencies/install/setup.bash\ncolcon build',
    d: 'The ARM compiler is for the boards\' firmware. A failed build prints a warning, waits 10 s and carries on, so read the output.',
  },
  {
    t: 'Clone release', key: 'answer y', tags: ['ask', 'sudo', 'rc'], file: 'setup_scripts/release_install/setup_release.bash', l: 'L1-L30',
    cmd: 'git clone --recursive https://github.com/osu-uwrt/riptide_release.git ~/osu-uwrt/release\nsudo apt install -y python3-scantree\npip install fabric\ncd ~/osu-uwrt/riptide_setup && colcon build\necho "source ~/osu-uwrt/riptide_setup/install/setup.bash" >> ~/.bashrc',
    d: 'It asks "Install release setup? (default is no)": type <b>y</b>, or none of this happens. Building riptide_setup builds <a href="https://github.com/osu-uwrt/riptide_setup/tree/humble/colcon_riptide"><code>colcon_riptide</code></a>, which adds the <code>deploy</code> and <code>timesync</code> verbs to colcon. Release itself is cloned, not built.',
  },
  {
    t: 'Robot names in /etc/hosts', tags: ['sudo'], file: 'setup_scripts/hardware/setup_hosts.bash', l: 'L1-L15',
    cmd: '192.168.1.69    xavier\n192.168.1.23    orin\n192.168.1.212   uwrt-dvl',
    d: 'Each line is added only if no line in the file contains that name yet. These names predate the current setup: Talos\'s Orin is <code>orin2</code> now (see <a href="#deploy">colcon deploy</a>).',
  },
  {
    t: 'Permission to use the hardware', tags: ['sudo'], file: 'setup_scripts/hardware/add_rule.bash', l: 'L8-L22',
    cmd: 'groupadd uwrt\nadduser $SUDO_USER uwrt\nusermod -a -G video $SUDO_USER\nusermod -a -G dialout $SUDO_USER\ncp riptide.rules rp2040.rules /etc/udev/rules.d/',
    d: '<code>rp2040.rules</code> opens RP2040 boards to the <code>uwrt</code> group over USB (boot ROM, Picoprobe debugger, serial, and the UWRT boards\' micro-ROS ports), for working on the team\'s boards. <code>riptide.rules</code> covers older sensors: Lord Microstrain IMUs, a Ping sonar, PointGrey cameras, a VectorNav. Group changes apply at your next login.',
  },
  {
    t: '~/.bashrc, then reboot', tags: ['rc'], file: 'setup_scripts/setup_bashrc.bash', l: 'L7-L42',
    cmd: '# with ~/osu-uwrt/release present, appended to ~/.bashrc:\nif [ ! -f /tmp/source_this_boot ]; then\n    read -p "Setup bashrc for Release (R) or Development (D)? (default Development) " -r\n    ...\nfi\nif [ -f /tmp/source_release ]; then\n    source ~/osu-uwrt/release/install/setup.bash\nelse\n    source ~/osu-uwrt/development/dependencies/install/setup.bash\n    source ~/osu-uwrt/development/software/install/setup.bash\nfi',
    d: 'Without release, it appends three plain <code>source</code> lines instead (ROS, dependencies, software). The script ends with "Please reboot your computer for final changes to take effect".',
  },
];
const TAGS = { sudo: 'sudo', ask: 'asks', rc: 'bashrc' };
{
  const list = document.getElementById('setup-steps');
  STEPS.forEach((s, i) => {
    const li = h('li', `step${s.key ? ' key' : ''}`);
    const det = h('details');
    det.innerHTML = `<summary><span class="n">${i + 1}</span><span class="t">${s.t}</span><span class="tags">${s.tags.map((t) => `<span class="tag ${t}">${TAGS[t]}</span>`).join('')}</span>${s.key ? `<span class="answer">${s.key}</span>` : ''}</summary>
      <div class="body">${s.cmd ? `<pre class="cmd"><code>${esc(s.cmd)}</code></pre>` : ''}<p>${s.d}</p>
      <p class="src"><a href="${RS}${s.file}#${s.l}">${s.file.split('/').pop()}, lines ${s.l.replace(/L/g, '')}</a></p></div>`;
    li.appendChild(det);
    list.appendChild(li);
  });
  const btn = document.getElementById('steps-toggle');
  const all = () => [...list.querySelectorAll('details')];
  const sync = () => (btn.textContent = all().every((d) => d.open) ? 'Close all' : 'Open all');
  btn.onclick = () => { const open = !all().every((d) => d.open); all().forEach((d) => (d.open = open)); sync(); };
  list.addEventListener('toggle', sync, true);
}

// ---------------------------------------------------------------- submodules
// The branch each repo's current work is on: the branches this site links.
const SITE_BRANCH = {
  'src/riptide_core': 'followpath-speed', 'src/riptide_control': 'mpc', 'src/riptide_perception': 'mapping-estimator',
  'src/riptide_autonomy': 'autonomy-mapping', 'src/riptide_launch': 'newsim', 'src/riptide_gui': 'newsim',
  'src/riptide_simulator': 'newsim', 'src/nortek_dvl': 'DvlWaterTrackFallback', 'src/apriltag_ros': 'CompressedImages', nereus: 'main',
};
const ROLE = {
  'src/riptide_core': 'drivers, messages, robot description',
  'src/riptide_control': 'the MPC, older control tools',
  'src/riptide_perception': 'detector and mapping',
  'src/riptide_autonomy': 'behaviour trees',
  'src/riptide_launch': 'launch files, launch service',
  'src/riptide_gui': 'RViz GUI and 3D meshes',
  'src/riptide_simulator': 'the simulator before Nereus',
  'src/chameleon_tf': 'a TF publisher that can copy another',
  'src/nortek_dvl': 'DVL driver',
  'src/apriltag_msgs': 'AprilTag messages',
  'src/apriltag_ros': 'AprilTag detector',
  'src/opbox_software': 'operator box (opbox) software',
  nereus: 'simulator and viewer',
};
// package.xml descriptions that are empty ("TODO") or out of date, read from each package's code instead.
const DESC = {
  riptide_mpc: 'The model-predictive controller Talos runs (<a href="control/index.html">Control</a>).',
  riptide_acoustics: 'Compares the pinger\'s loudness between two sampling windows to tell which spot was closer.',
  riptide_gyro: 'Driver for the fibre-optic gyro (FOG), including its tare.',
  riptide_imu: 'Driver for the VectorNav IMU.',
  launch_msgs: 'Messages and services for the robot\'s launch service.',
  remote_launch: 'The robot\'s launch service: starts and stops launch files on request.',
  nortek_dvl_msgs: 'Messages for the DVL driver.',
  riptide_meshes: '3D meshes of the robots and the course props.',
  riptide_rviz: 'RViz plugins: the operator GUI before the Nereus viewer.',
  opbox_ros_client: 'Connects the opbox to ROS: its kill button and the robot\'s diagnostics.',
  riptide_controllers2: 'The Simulink model of the older complete_controller (the sim\'s default without <code>active_control_model:=mpc</code>), plus thruster calibration and controller-tuning tools.',
  riptide_hardware2: 'Launch files that start the real robot\'s hardware (board agent, DVL, IMU, cameras, EKF), and nodes that watch it: voltages, firmware, sensors.',
};
const GROUPS = [
  { t: 'Talos\'s stack', repos: ['src/riptide_core', 'src/riptide_control', 'src/riptide_perception', 'src/riptide_autonomy', 'src/riptide_launch', 'nereus'] },
  { t: 'Drivers and helpers', repos: ['src/nortek_dvl', 'src/apriltag_ros', 'src/apriltag_msgs', 'src/chameleon_tf', 'src/opbox_software'] },
  { t: 'Older tools, still built', repos: ['src/riptide_gui', 'src/riptide_simulator'], fold: 'The old simulator and RViz GUI. riptide_bringup2 still depends on them, so colcon builds them.' },
];
dataWs.then((ws) => {
  const host = document.getElementById('submodules');
  const byRepo = {}, bySub = Object.fromEntries(ws.submodules.map((s) => [s.path, s]));
  ws.packages.forEach((p) => (byRepo[p.repo] ||= []).push(p));
  const row = (s) => {
    const pk = byRepo[s.path] || [];
    const name = s.path.replace('src/', '');
    const site = SITE_BRANCH[s.path];
    const det = h('details', 'sub');
    const desc = (p) => DESC[p.name] || (/^TODO/.test(p.description) ? '' : esc(p.description.length > 140 ? p.description.slice(0, 137) + '...' : p.description));
    det.innerHTML = `<summary><span class="name"><b>${name}</b><small>${ROLE[s.path] || ''}${pk.length ? ` · ${pk.length} package${pk.length > 1 ? 's' : ''}` : ''}</small></span>
      <span class="pin"><code>${s.pinned}</code></span>
      <span class="site">${site ? `<code class="br">${site}</code>` : '<span class="none">at its pin</span>'}</span></summary>
      <div class="body"><p class="meta">Pinned at <a href="${s.url}/commit/${s.pinned}"><code>${s.pinned}</code></a> on release <code>master</code>. ${site ? `Current work: <a href="${s.url}/tree/${site}"><code>${site}</code></a>.` : 'The current work is the pin.'}</p>
      ${pk.length ? `<ul class="pkgs">${pk.map((p) => `<li><code>${p.name}</code>${p.deploy_ignore ? ' <span class="ty">DEPLOY_IGNORE</span>' : ''}${p.at_pin ? '' : ' <b class="nopin">not at the pin</b>'}${desc(p) ? `<span class="desc">${desc(p)}</span>` : ''}</li>`).join('')}</ul>` : '<p>No colcon packages: Nereus builds with its own <code>./build.sh</code> (<a href="#nereus">below</a>).</p>'}
      <p class="src"><a href="${s.url}">${s.url.replace('https://github.com/', 'github.com/')}</a></p></div>`;
    return det;
  };
  const list = h('div', 'subs');
  list.appendChild(h('div', 'sub-head', '<span>Repo</span><span>Pin</span><span>Current work</span>'));
  for (const g of GROUPS) {
    const rows = g.repos.map((r) => bySub[r]).filter(Boolean);
    if (g.fold) {
      const d = h('details', 'sub-fold');
      d.innerHTML = `<summary><span class="sub-group">${g.t}</span><span class="fold-n">${rows.length} repos</span></summary><p class="fold-note">${g.fold}</p>`;
      rows.forEach((s) => d.appendChild(row(s)));
      list.appendChild(d);
    } else {
      list.appendChild(h('div', 'sub-group', g.t));
      rows.forEach((s) => list.appendChild(row(s)));
    }
  }
  host.appendChild(list);
  const missing = ws.packages.filter((p) => !p.at_pin).map((p) => `<code>${p.name}</code>`);
  host.appendChild(h('div', 'graph-note', `${ws.packages.length} packages in ${ws.submodules.length - 1} submodules under <code>src/</code>, plus Nereus. A fresh clone of release <code>master</code> (<code>${ws.release_head}</code>) gets the pins: ${ws.pin_count} packages${missing.length ? `, without ${missing.join(', ')}` : ''}.`));
});

// ---------------------------------------------------------------- colcon package selection
dataWs.then((ws) => {
  const pk = ws.packages, by = Object.fromEntries(pk.map((p) => [p.name, p]));
  const ctl = document.getElementById('sel-controls');
  let flag = 'up_to', name = 'riptide_mpc', compact = true;
  const FLAGS = { select: '--packages-select', up_to: '--packages-up-to', above: '--packages-above' };
  const seg = h('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Selection flag');
  for (const [k, v] of Object.entries(FLAGS)) {
    const b = h('button', '', v.replace('--packages-', ''));
    b.type = 'button';
    b.dataset.k = k;
    b.onclick = () => { flag = k; draw(); };
    seg.appendChild(b);
  }
  const lab = h('label', '', 'package ');
  const sel = h('select', 'pick');
  const repos = [...new Set(pk.map((p) => p.repo))];
  sel.innerHTML = repos.map((r) => `<optgroup label="${r.replace('src/', '')}">${pk.filter((p) => p.repo === r).map((p) => `<option>${p.name}</option>`).join('')}</optgroup>`).join('');
  sel.onchange = () => { name = sel.value; draw(); };
  lab.appendChild(sel);
  ctl.append(seg, lab);
  const grid = document.getElementById('sel-grid');
  const chips = pk.map((p) => {
    const b = h('button', 'chip', `<span class="o">${p.order + 1}</span><span class="nm">${p.name.replace(/_/g, '_<wbr>')}</span>`);
    b.type = 'button';
    b.title = `Pick ${p.name}`;
    b.onclick = () => { name = p.name; draw(); };
    grid.appendChild(b);
    return b;
  });
  // Phones show only the packages that would be built; this toggles the rest.
  const more = h('button', 'btn sel-more');
  more.type = 'button';
  more.onclick = () => { compact = !compact; draw(); };
  grid.after(more);
  const cmd = document.getElementById('sel-cmd'), note = document.getElementById('sel-note');
  function draw() {
    sel.value = name;
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === flag)));
    const p = by[name];
    const set = new Set(flag === 'select' ? [name] : flag === 'up_to' ? p.up_to : p.above);
    chips.forEach((c, i) => {
      c.classList.toggle('on', set.has(pk[i].name));
      c.classList.toggle('me', pk[i].name === name);
      c.setAttribute('aria-pressed', String(pk[i].name === name));
    });
    grid.classList.toggle('compact', compact);
    more.textContent = compact ? `Show the ${pk.length - set.size} not built` : 'Hide the ones not built';
    cmd.innerHTML = `<code>${fmt(`colcon build ${FLAGS[flag]} ${name}`)}</code>`;
    const n = set.size, deps = p.deps.length ? `It depends on ${p.deps.map((d) => `<b>${d}</b>`).join(', ')}.` : 'It depends on nothing else in this workspace.';
    note.innerHTML = {
      select: `Builds <b>1</b> package, <b>${name}</b>. Its dependencies must already be built. ${deps}`,
      up_to: `Builds <b>${n}</b> package${n > 1 ? 's' : ''}: <b>${name}</b> and everything it needs, dependencies first. ${deps}`,
      above: n === 1
        ? `Builds <b>1</b> package: nothing depends on <b>${name}</b>, so only it is built. Compare riptide_msgs2, the messages: ${by.riptide_msgs2.above.length - 1} packages depend on it.<br><button type="button" class="btn try" data-p="riptide_msgs2">Try riptide_msgs2</button>`
        : `Builds <b>${n}</b> packages: <b>${name}</b> and everything that depends on it. Use this after changing a message or a shared library${n > 10 ? `: ${name} is near the bottom of the stack` : ''}.`,
    }[flag];
    note.querySelector('.try')?.addEventListener('click', (e) => { name = e.currentTarget.dataset.p; draw(); });
  }
  draw();
});

// ---------------------------------------------------------------- the overlay explorer
// Paths break only after a slash (or the = of an export), never mid-word.
const wb = (s) => esc(s).replace(/\//g, '/<wbr>').replace(/=/g, '=<wbr>');
Promise.all([dataEnv, dataWs]).then(([env, ws]) => {
  const rel = env.release;
  // The last line of the ~/.bashrc above: not a workspace, but it decides the middleware.
  const laptop = [...rel.steps, { script: 'export RMW_IMPLEMENTATION=rmw_zenoh_cpp', label: 'middleware choice', packages: [], set: { RMW_IMPLEMENTATION: 'rmw_zenoh_cpp' } }];
  const deployable = ws.packages.filter((p) => !p.deploy_ignore).map((p) => p.name);
  const ros = rel.steps[0];
  // The Orin's chain, from release's scripts/uwrt_config/source/client.bash (user ros). Not measured: package
  // lists are what each workspace holds (colcon_deploy = release minus DEPLOY_IGNORE).
  const orin = [
    { script: '/opt/ros/humble/setup.bash', label: 'ROS 2 Humble', packages: ros.packages.filter((p) => p !== 'rmw_zenoh_cpp' && p !== 'zenoh_cpp_vendor'), set: { ROS_DISTRO: 'humble' }, approx: true },
    { script: '~/rmw_zenoh_cpp/install/setup.bash', label: 'Zenoh, built from source', packages: ['rmw_zenoh_cpp', 'zenoh_cpp_vendor'] },
    { script: '~/zed-sdk/zed_wrapper/install/setup.bash', label: 'ZED ROS 2 wrapper', packages: ['zed_wrapper'], approx: true },
    { script: '~/osu-uwrt/release/scripts/dds_scripts/config_rmw.bash', label: 'team middleware choice', packages: [], set: { RMW_IMPLEMENTATION: 'from ~/.uwrt/default_rmw' } },
    { script: '~/colcon_deploy/install/setup.bash', label: 'deployed release', packages: deployable },
    { script: '~/dependencies/micro-ros-agent/install/setup.bash', label: 'micro-ROS agent', packages: ['micro_ros_agent'] },
  ];
  const CHAINS = {
    laptop: { name: 'Your machine', layers: laptop, lookups: ['riptide_mpc', 'rclcpp', 'rmw_zenoh_cpp', 'nereus', '(colcon deploy)'] },
    orin: { name: 'The Orin', layers: orin, lookups: ['riptide_mpc', 'rclcpp', 'zed_wrapper', 'riptide_rviz', 'micro_ros_agent'] },
  };
  const WHY = {
    'ROS 2 Humble (apt)': 'ROS itself: rclcpp, rclpy, the ros2 command, launch, tf2, plus what rosdep and apt added.',
    'riptide_setup (colcon deploy)': 'No ROS packages: only the Python path for the colcon deploy command.',
    'release workspace': 'Talos\'s stack, one folder per package.',
    'Nereus launch files': 'One package, nereus, so that ros2 launch nereus works.',
    'ROS 2 Humble': 'ROS itself, as on your machine.',
    'Zenoh, built from source': 'The Zenoh middleware, from its own workspace.',
    'ZED ROS 2 wrapper': 'Drives the two ZED X Mini cameras (needs the ZED SDK and CUDA).',
    'team middleware choice': 'Not a workspace: sets RMW_IMPLEMENTATION from the choice saved in ~/.uwrt/default_rmw.',
    'deployed release': 'What colcon deploy built in ~/colcon_deploy: release minus the DEPLOY_IGNORE packages.',
    'micro-ROS agent': 'The bridge to the boards\' micro-ROS firmware. Sourced last, so it overlays everything above.',
    'middleware choice': 'Not a workspace: the export at the end of ~/.bashrc. Without it, ROS 2 uses FastDDS and can\'t see Talos\'s Zenoh nodes.',
  };
  let chain = 'laptop', depth = 0, look = 'riptide_mpc';
  const host = document.getElementById('overlay');
  const ctl = document.getElementById('ov-controls');
  const seg = h('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Machine');
  for (const [k, c] of Object.entries(CHAINS)) {
    const b = h('button', '', c.name);
    b.type = 'button';
    b.dataset.k = k;
    b.onclick = () => { if (chain !== k) { chain = k; depth = c.layers.length; } if (!c.lookups.includes(look)) look = 'riptide_mpc'; draw(); };
    seg.appendChild(b);
  }
  const next = h('button', 'btn primary', 'Source next');
  next.type = 'button';
  next.onclick = () => { depth = Math.min(depth + 1, CHAINS[chain].layers.length); draw(); };
  const reset = h('button', 'btn', 'New terminal');
  reset.type = 'button';
  reset.onclick = () => { depth = 0; draw(); };
  ctl.append(seg, next, reset);

  const result = h('div', 'ov-result');
  result.setAttribute('aria-live', 'polite');
  const stack = h('ol', 'ov-stack');
  const vars = h('div', 'ov-vars');
  host.append(result, stack, vars);

  function resolve(layers, pkg) {
    // AMENT_PREFIX_PATH is searched first to last; the last-sourced layer is first.
    if (pkg === '(colcon deploy)') return layers.find((l) => /riptide_setup/.test(l.script)) || null;
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i].packages.includes(pkg)) return layers[i];
    return null;
  }
  function prefixOf(layer, pkg) {
    const dir = layer.script.replace(/\/setup\.bash$/, '');
    if (/release\/install|colcon_deploy\/install|zed_wrapper\/install|micro-ros-agent\/install|rmw_zenoh_cpp\/install/.test(layer.script)) return `${dir}/${pkg}`;
    return dir;
  }

  function draw() {
    const c = CHAINS[chain], layers = c.layers, on = layers.slice(0, depth);
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === chain)));
    next.disabled = depth >= layers.length;
    next.textContent = next.disabled ? 'All sourced' : `Source ${depth + 1} of ${layers.length}`;

    // the answer first: lookup chips, the terminal, and why
    const hit = resolve(on, look);
    const cmdline = look === '(colcon deploy)' ? 'colcon deploy --help' : `ros2 pkg prefix ${look}`;
    let out;
    if (look === '(colcon deploy)') {
      out = hit ? '<span class="ok">usage: colcon deploy [-h] [--username USERNAME] ...</span>'
        : '<span class="bad">colcon: error: argument verb_name: invalid choice: \'deploy\'</span>';
    } else if (!depth) out = '<span class="bad">ros2: command not found</span>';
    else out = hit ? `<span class="ok">${wb(prefixOf(hit, look))}</span>` : '<span class="bad">Package not found</span>';
    const shadow = look !== '(colcon deploy)' ? on.filter((l) => l.packages.includes(look)).length : 0;
    let why;
    if (hit) why = `Found in layer ${on.indexOf(hit) + 1}, <b>${hit.label}</b>${shadow > 1 ? `. ${shadow - 1} earlier layer${shadow > 2 ? 's' : ''} also ha${shadow > 2 ? 've' : 's'} it, but the last one sourced is searched first` : ''}.`;
    else if (!depth) why = look === '(colcon deploy)' ? 'colcon itself is installed system-wide, but nothing has added its deploy command yet.' : 'Nothing is sourced: not even the <code>ros2</code> command exists yet.';
    else if (depth < layers.length) why = 'ROS is there, but no layer sourced so far has this package. Source more.';
    else if (ws.packages.some((p) => p.name === look && p.deploy_ignore)) why = `No layer has it: ${look} has a DEPLOY_IGNORE file, so colcon deploy never sends it to the robot.`;
    else why = 'No layer has it.';
    result.innerHTML = `<div class="chips" role="group" aria-label="Look up a package"><span class="chips-k">Look up:</span>${c.lookups.map((p) => `<button type="button" class="chip${p === look ? ' me on' : ''}" aria-pressed="${p === look}" data-p="${p}">${p}</button>`).join('')}</div>
      <pre class="term"><code><span class="pr">$</span> ${cmdline}\n${out}</code></pre>
      <p class="why">${why}</p>`;
    result.querySelectorAll('.chip').forEach((b) => (b.onclick = () => { look = b.dataset.p; draw(); }));

    // the stack, last-sourced on top
    stack.innerHTML = '';
    [...layers].reverse().forEach((l, ri) => {
      const i = layers.length - 1 - ri, active = i < depth;
      const li = h('li');
      const b = h('button', `ov-layer${active ? ' on' : ''}${i === depth - 1 ? ' top' : ''}${i === depth ? ' upnext' : ''}`);
      b.type = 'button';
      const count = l.packages.length;
      b.innerHTML = `<span class="i">${i + 1}</span><span class="what"><b>${l.label}${i === depth ? ' <em>next</em>' : ''}</b><code>${wb(l.script)}</code><small>${WHY[l.label] || ''}</small></span><span class="cnt">${l.approx ? '<small>not counted</small>' : count ? `+${count}<small>${count === 1 ? 'package' : 'packages'}</small>` : '<small>no packages</small>'}</span>`;
      b.setAttribute('aria-pressed', String(active));
      b.setAttribute('aria-label', `${active ? 'Unsource' : 'Source up to'} layer ${i + 1}, ${l.label}`);
      b.onclick = () => { depth = depth === i + 1 ? i : i + 1; draw(); };
      li.appendChild(b);
      stack.appendChild(li);
    });

    // the environment
    const apl = [];
    on.forEach((l) => {
      if (l.added?.AMENT_PREFIX_PATH) apl.unshift(...l.added.AMENT_PREFIX_PATH);
      else if (chain === 'orin' && l.packages.length) {
        const dir = l.script.replace(/\/setup\.bash$/, '');
        if (/opt\/ros/.test(l.script)) apl.unshift(dir);
        else apl.unshift(...[...l.packages].reverse().map((p) => `${dir}/${p}`));
      }
    });
    const rmw = on.find((l) => l.set?.RMW_IMPLEMENTATION);
    const rows = [];
    rows.push(`<div class="var"><span class="k">ROS_DISTRO</span><span class="v">${depth ? 'humble' : '<i>not set</i>'}</span></div>`);
    rows.push(`<div class="var"><span class="k">RMW_IMPLEMENTATION</span><span class="v">${rmw ? `rmw_zenoh_cpp${chain === 'orin' ? ' <small>(if Zenoh is the saved choice)</small>' : ''}` : '<i>not set: the default, FastDDS</i>'}</span></div>`);
    const more = (k) => (apl.length > k ? `<li class="more m${k}">... ${apl.length - k} more</li>` : '');
    rows.push(`<div class="var"><span class="k">AMENT_PREFIX_PATH</span><span class="v">${apl.length ? `${apl.length} entr${apl.length === 1 ? 'y' : 'ies'}, searched in this order:<ol class="apl">${apl.slice(0, 4).map((p, j) => `<li${j >= 2 ? ' class="x"' : ''}><code>${wb(p)}</code></li>`).join('')}${more(2)}${more(4)}</ol>` : '<i>empty</i>'}</span></div>`);
    if (chain === 'laptop') {
      const tot = {};
      on.forEach((l) => Object.entries(l.added || {}).forEach(([k, v]) => { if (k !== 'AMENT_PREFIX_PATH') tot[k] = (tot[k] || 0) + v.length; }));
      const ks = ['PATH', 'PYTHONPATH', 'LD_LIBRARY_PATH', 'CMAKE_PREFIX_PATH'].filter((k) => tot[k]);
      rows.push(`<div class="var"><span class="k">also added</span><span class="v">${ks.length ? ks.map((k) => `<code>${k}</code>&nbsp;+${tot[k]}`).join(', ') : '<i>nothing yet</i>'}</span></div>`);
    }
    vars.innerHTML = `<div class="sh-title">This terminal's environment${depth ? '' : ': brand new'}</div>${rows.join('')}`;
  }
  draw();
});

// ---------------------------------------------------------------- how a change travels
{
  const host = document.getElementById('git-flow');
  const FLOW = [
    { t: 'Make a branch', s: 'one change, one branch', lane: 'its repo', info: '<b>A branch per change</b>, in the repo you are changing (inside <code>release/src</code>): <code>git checkout -b my-change</code> from the branch the work is based on. Examples: <code>mpc-map-frames</code> in riptide_control, <code>BinaryClassifier</code> in riptide_core.' },
    { t: 'Pull request', s: 'review, then merge', lane: 'its repo', info: '<b>A pull request merges it.</b> riptide_control #33 merged <code>mpc-map-frames</code> into <code>mpc</code>; riptide_core #63 merged <code>BinaryClassifier</code> into <code>dev</code>.' },
    { t: 'Integration branch', s: 'dev · mpc · newsim', lane: 'its repo', side: 'around competition: dev → master', info: '<b>Where current work collects.</b> Some branches run far ahead of master: riptide_core\'s <code>followpath-speed</code> has an open PR into <code>newsim</code> (#65). Around competition, <code>dev</code> is merged into <code>master</code>: the "Pre-comp dev merge" PRs (riptide_core #64, riptide_perception #27) were opened before RoboSub 2026 and merged after it.' },
    { t: 'Bump the pins', s: '"Pre RPAC test" commit', lane: 'release', info: '<b>Release records exactly what goes in the water.</b> <code>git add src/&lt;repo&gt;</code> for each changed submodule, then commit to master: "Pre RPAC test 10&#8209;12&#8209;26". A pin can be any pushed commit, merged or not. The commands are just below.' },
    { t: 'colcon deploy', s: 'build on the Orin', lane: 'robot', info: '<b>Sources go to the robot and are built there:</b> <code>colcon deploy orin2 --clean</code> from <code>~/osu-uwrt/release</code>. See <a href="#deploy">colcon deploy</a>.' },
    { t: 'Pool test', s: 'checks, then water', lane: 'robot', info: '<b>The checks compare</b> release\'s pins, what\'s pushed, and what the Orin has, before Talos goes in. See <a href="pool-test.html">Pool test day</a>.' },
    { t: 'Commit fixes, bump', s: '"Post … test" commit', lane: 'repo + release', info: '<b>After the test:</b> commit the fixes made at the pool in their repos, then bump the pins again ("Post sean test", 10 October 2026). Tags now mark competitions (<code>robosub2024</code>, <code>robosub2026</code>), not every test.' },
  ];
  let cur = 3;
  const ol = h('ol', 'gf');
  const items = FLOW.map((f, i) => {
    const li = h('li', 'gf-step');
    const b = h('button', '', `<span class="n">${i + 1}</span><span class="tx"><b>${f.t}</b><small>${f.s}</small></span>${f.side ? `<span class="side">${f.side}</span>` : ''}<span class="lane">${f.lane}</span>`);
    b.type = 'button';
    b.onclick = () => { cur = i; draw(); };
    const info = h('div', 'gf-info');
    li.append(b, info);
    ol.appendChild(li);
    return li;
  });
  const back = h('div', 'gf-back', '<span>Fixes and the next change start again at step 1</span>');
  const note = h('div', 'graph-note gf-note');
  note.setAttribute('aria-live', 'polite');
  host.append(ol, back, note);
  function draw() {
    items.forEach((li, i) => {
      li.classList.toggle('sel', i === cur);
      li.querySelector('button').setAttribute('aria-pressed', String(i === cur));
      li.querySelector('.gf-info').innerHTML = i === cur ? `<span class="k">Step ${i + 1}</span> ${FLOW[i].info}` : '';
    });
    note.innerHTML = `<span class="k">Step ${cur + 1}</span> ${FLOW[cur].info}`;
  }
  draw();
}

// ---------------------------------------------------------------- colcon deploy, step by step
dataWs.then((ws) => {
  const ctl = document.getElementById('dep-controls');
  const pk = ws.packages, by = Object.fromEntries(pk.map((p) => [p.name, p]));
  const st = { sel: 'select', pkg: 'riptide_mpc', clean: false, no_build: false, archive: false };
  const seg = h('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Packages');
  for (const [k, v] of [['all', 'all packages'], ['select', 'select'], ['up_to', 'up-to']]) {
    const b = h('button', '', v);
    b.type = 'button';
    b.dataset.k = k;
    b.onclick = () => { st.sel = k; draw(); };
    seg.appendChild(b);
  }
  const pick = h('select', 'pick');
  pick.setAttribute('aria-label', 'Package');
  pick.innerHTML = pk.filter((p) => !p.deploy_ignore).map((p) => `<option>${p.name}</option>`).join('');
  pick.onchange = () => { st.pkg = pick.value; draw(); };
  const flags = ['clean', 'no_build', 'archive'].map((f) => {
    const l = h('label', 'chk', `<input type="checkbox"> --${f}`);
    l.querySelector('input').onchange = (e) => { st[f] = e.target.checked; draw(); };
    return l;
  });
  ctl.append(seg, pick, ...flags);
  const cmdEl = document.getElementById('dep-cmd'), stepsEl = document.getElementById('dep-steps');
  const path = (p) => `~/osu-uwrt/release/${p.path}`;
  function draw() {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === st.sel)));
    pick.value = st.pkg;
    pick.disabled = st.sel === 'all';
    const chosen = st.sel === 'all' ? pk.map((p) => p.name) : st.sel === 'select' ? [st.pkg] : by[st.pkg].up_to;
    const send = chosen.filter((n) => !by[n].deploy_ignore), skipped = chosen.filter((n) => by[n].deploy_ignore);
    const sel = st.sel === 'all' ? '' : ` --packages-${st.sel === 'select' ? 'select' : 'up-to'} ${st.pkg}`;
    const fl = ['clean', 'no_build', 'archive'].filter((f) => st[f]).map((f) => ` --${f}`).join('');
    cmdEl.innerHTML = `<code>${fmt(`colcon deploy orin2${sel}${fl}`)}</code>`;
    const S = [];
    S.push(['Check the robot answers', 'ping -c 1 orin2', 'Stops with "Failed to ping orin2" if it doesn\'t.']);
    S.push(['Make the remote workspace', 'ssh ros@orin2 mkdir -p ~/colcon_deploy', 'User <code>ros</code> unless you pass <code>--username</code>; folder <code>~/colcon_deploy</code> unless <code>--remote_dir</code>.']);
    if (st.clean) S.push(['Delete the robot\'s build', 'rm -rf ~/colcon_deploy/install ~/colcon_deploy/build ~/colcon_deploy/log', 'Sources in <code>~/colcon_deploy/src</code> stay, including packages sent by earlier deploys.']);
    const ex = by[send[send.length - 1]] || by[send[0]];
    S.push([`Copy ${send.length} package${send.length === 1 ? '' : 's'}`, `rsync -vrzc --delete \\\n  --exclude=**/.git/ \\\n  --exclude=**/.vscode/ \\\n  ${path(ex)} \\\n  ros@orin2:~/colcon_deploy/src`,
      `One rsync per package, into <code>~/colcon_deploy/src/&lt;folder&gt;</code>. Sent: ${send.map((n) => `<code>${n}</code>`).join(', ')}.${skipped.length ? ` Not sent (DEPLOY_IGNORE): ${skipped.map((n) => `<code>${n}</code>`).join(', ')}.` : ''} <code>-c</code> compares checksums; <code>--delete</code> removes files you deleted inside a package.`]);
    if (st.no_build) S.push(['Stop', '', `With <code>--no_build</code> it ends here: the sources are synced and the robot's last build is left as it was, so it still runs the old code.${st.archive ? ' <b>--archive does nothing</b> with <code>--no_build</code>: deploy.py exits right after the sync.' : ''}`]);
    else {
      const what = st.clean ? '' : ` --packages-select ${send.length > 4 ? `${send.slice(0, 3).join(' ')} ... (${send.length})` : send.join(' ')}`;
      S.push(['Build on the robot', `# /tmp/deploy_build.bash, copied to the Orin and run there\nsource /opt/ros/humble/setup.bash\ncd ~/colcon_deploy\ncolcon build${what} \\\n  --cmake-args -DBUILD_DEPLOY=ON`,
        st.clean ? 'After <code>--clean</code> it builds <em>every</em> package in <code>~/colcon_deploy/src</code>, so dependencies sent by earlier deploys are rebuilt too.' : 'Only the packages just sent are rebuilt; the rest keep their last build. Its output streams to your terminal.']);
      if (st.archive) {
        const d = new Date(), M = d.toLocaleString('en-US', { month: 'short' });
        const stamp = `${M}_${String(d.getDate()).padStart(2, '0')}_${d.getFullYear()}_HH_MM_SS`;
        S.push(['Archive and download', `# on the Orin, in ~/colcon_deploy\ntar cf - . | gzip > /tmp/<archive>.tar.gz\n# then on your laptop\nrsync ... ros@orin2:/tmp/<archive>.tar.gz .`, `The whole remote workspace (sources and build), saved into the folder you ran the deploy from: a snapshot of exactly what ran. <code class="wr">&lt;archive&gt;</code> is the host, folder and time, like <code class="wr">${`orin2_colcon_deploy_${stamp}`.replace(/_/g, '_<wbr>')}</code>.`]);
      }
    }
    stepsEl.innerHTML = S.map(([t, c, d]) => `<li><b>${t}</b>${c ? `<pre class="cmd"><code>${fmt(c)}</code></pre>` : ''}<p>${d}</p></li>`).join('')
      + `<li class="src"><a href="${RS}colcon_riptide/colcon_riptide/verb/deploy.py#L75-L192">deploy.py</a> · <a href="${RS}colcon_riptide/colcon_riptide/package_augmentation/deploy_augmentation.py#L30-L31">DEPLOY_IGNORE</a></li>`;
  }
  draw();
});

// ---------------------------------------------------------------- checklist
{
  const KEY = 'talos-explained:setup-checklist';
  const G = [
    ['Your machine', [
      ['os', 'Ubuntu 22.04 installed and updated', 'lsb_release -sr        # prints 22.04', '#before'],
      ['gpu', 'NVIDIA driver installed, if you have an NVIDIA GPU', 'nvidia-smi', '#gpu'],
      ['gh', 'GitHub account; asked a lead for write access to osu-uwrt', '', '#before'],
      ['vpn', 'Asked a lead to add your laptop to the team network (Tailscale), only if you will join the robot remotely', '', 'computers.html#join'],
    ]],
    ['riptide_setup', [
      ['setup', 'Cloned riptide_setup and ran setup.bash, answering y for release', '~/osu-uwrt/riptide_setup/setup.bash', '#riptide-setup'],
      ['reboot', 'Rebooted, then answered R (and Enter) in the first terminal', 'groups                 # lists uwrt, video, dialout', '#riptide-setup'],
    ]],
    ['Build', [
      ['rossrc', 'Sourced ROS before building release, and added it above the Release/Development block in ~/.bashrc', 'source /opt/ros/humble/setup.bash', '#build'],
      ['deps', 'rosdep, GLFW, Zenoh and Ultralytics (with numpy below 2) installed for release', 'rosdep install --from-paths src --ignore-src -r -y', '#build'],
      ['colcon', 'colcon build finishes in ~/osu-uwrt/release', 'colcon build', '#build'],
      ['source', 'A new terminal finds the workspace', 'ros2 pkg prefix riptide_mpc', '#sourcing'],
      ['nereus', 'Nereus built with ./setup.sh and ./build.sh', '', '#nereus'],
    ]],
    ['Run', [
      ['sim', 'Zenoh router and sim.launch.py running; the viewer shows the course', 'ros2 launch nereus sim.launch.py active_control_model:=mpc mpc_model:=sim', '#nereus'],
      ['drive', 'Enabled Talos in the viewer and ran a tree', '', 'viewer.html'],
    ]],
    ['Your first change', [
      ['branch', 'Made a branch inside a submodule (not on a detached HEAD)', 'git status             # "On branch ..."', '#workspaces'],
      ['gitid', 'Set your git name and email, and logged in to GitHub from git', 'gh auth login', '#git'],
      ['bump', 'Know how to bump a pin in release', '', '#git'],
      ['onboard', 'Did the riptide_onboarding ROS 2 tutorials', '', 'https://github.com/osu-uwrt/riptide_onboarding'],
      ['deploy', 'Only when a lead asks: SSH key on the Orin and orin2 in /etc/hosts', '', '#deploy'],
    ]],
  ];
  let done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { done = {}; }
  const host = document.getElementById('first-day');
  const total = G.reduce((s, g) => s + g[1].length, 0);
  const bar = h('div', 'cl-bar', '<div class="cl-fill"></div><span class="cl-count"></span>');
  const clear = h('button', 'btn', 'Clear ticks');
  clear.type = 'button';
  const head = h('div', 'cl-head');
  head.append(bar, clear);
  host.appendChild(head);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch { /* private mode */ } };
  const count = () => {
    const n = Object.values(done).filter(Boolean).length;
    bar.querySelector('.cl-fill').style.width = `${(100 * n) / total}%`;
    bar.querySelector('.cl-count').textContent = n === total ? `All ${total} done` : `${n} of ${total} done`;
  };
  for (const [title, items] of G) {
    host.appendChild(h('div', 'cl-group', title));
    const ul = h('ul', 'cl');
    for (const [id, text, cmd, href] of items) {
      const li = h('li');
      const ext = /^https?:/.test(href);
      li.innerHTML = `<label><input type="checkbox" data-id="${id}"><span class="box" aria-hidden="true"></span><span class="txt">${esc(text)}${cmd ? `<code class="cl-cmd">${esc(cmd)}</code>` : ''}</span></label><a class="go" href="${href}" aria-label="Read about it">${ext ? 'repo' : 'how'}</a>`;
      const box = li.querySelector('input');
      box.checked = !!done[id];
      li.classList.toggle('done', box.checked);
      box.onchange = () => { done[id] = box.checked; li.classList.toggle('done', box.checked); save(); count(); };
      ul.appendChild(li);
    }
    host.appendChild(ul);
  }
  clear.onclick = () => {
    done = {};
    save();
    host.querySelectorAll('input[type=checkbox]').forEach((b) => { b.checked = false; b.closest('li').classList.remove('done'); });
    count();
  };
  count();
}
