import { setup, BASE } from '../layout.js';
import '../css/chapter.css';
import '../css/setup.css';
import { Graph } from '../viz/graph.js';

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
    t: 'Clone release, if you answered y', tags: ['ask', 'sudo', 'rc'], file: 'setup_scripts/release_install/setup_release.bash', l: 'L1-L30',
    cmd: 'git clone --recursive https://github.com/osu-uwrt/riptide_release.git ~/osu-uwrt/release\nsudo apt install -y python3-scantree\npip install fabric\ncd ~/osu-uwrt/riptide_setup && colcon build\necho "source ~/osu-uwrt/riptide_setup/install/setup.bash" >> ~/.bashrc',
    d: 'Building riptide_setup builds <a href="https://github.com/osu-uwrt/riptide_setup/tree/humble/colcon_riptide"><code>colcon_riptide</code></a>, which adds the <code>deploy</code> and <code>timesync</code> verbs to colcon. Release itself is cloned, not built.',
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
    const li = h('li', 'step');
    const det = h('details');
    det.innerHTML = `<summary><span class="n">${i + 1}</span><span class="t">${s.t}</span><span class="tags">${s.tags.map((t) => `<span class="tag ${t}">${TAGS[t]}</span>`).join('')}</span></summary>
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
  'src/riptide_core': 'hardware drivers, messages, robot description',
  'src/riptide_control': 'the MPC controller and older controllers',
  'src/riptide_perception': 'detector and mapping',
  'src/riptide_autonomy': 'behaviour trees',
  'src/riptide_launch': 'launch files and the robot\'s launch service',
  'src/riptide_gui': 'RViz-era GUI and meshes',
  'src/riptide_simulator': 'the old simulator, replaced by Nereus',
  'src/chameleon_tf': 'a TF publisher that can copy another transform',
  'src/nortek_dvl': 'DVL driver',
  'src/apriltag_msgs': 'AprilTag messages',
  'src/apriltag_ros': 'AprilTag detector',
  'src/opbox_software': 'the operator box (opbox) software',
  nereus: 'simulator and viewer (not colcon)',
};
dataWs.then((ws) => {
  const host = document.getElementById('submodules');
  const byRepo = {};
  ws.packages.forEach((p) => (byRepo[p.repo] ||= []).push(p));
  const list = h('div', 'subs');
  list.appendChild(h('div', 'sub-head', '<span>Submodule</span><span>Pin</span><span>.gitmodules</span><span>Current work</span>'));
  for (const s of ws.submodules) {
    const pk = byRepo[s.path] || [];
    const name = s.path.replace('src/', '');
    const site = SITE_BRANCH[s.path];
    const det = h('details', 'sub');
    det.innerHTML = `<summary><span class="name"><b>${name}</b><small>${ROLE[s.path] || ''}${pk.length ? ` · ${pk.length} package${pk.length > 1 ? 's' : ''}` : ''}</small></span>
      <span class="pin" data-l="pin"><code>${s.pinned}</code></span>
      <span class="trk" data-l=".gitmodules">${s.tracks ? `<code>${s.tracks}</code>` : '<span class="none">none</span>'}</span>
      <span class="site" data-l="current work">${site ? `<code>${site}</code>` : '<span class="none">the pin</span>'}</span></summary>
      <div class="body">${pk.length ? `<ul class="pkgs">${pk.map((p) => `<li><code>${p.name}</code> <span class="ty">${p.type.replace('ament_', '')}${p.deploy_ignore ? ' · DEPLOY_IGNORE' : ''}${p.at_pin ? '' : ' · <b class="nopin">not at the pin</b>'}</span><br><span class="desc">${/^TODO/.test(p.description) ? '<i>no description in package.xml</i>' : esc(p.description.length > 140 ? p.description.slice(0, 137) + '...' : p.description)}</span></li>`).join('')}</ul>` : '<p>No colcon packages: Nereus builds with its own <code>./build.sh</code> (below).</p>'}
      <p class="src"><a href="${s.url}">${s.url.replace('https://github.com/', 'github.com/')}</a>${s.pinned ? ` · <a href="${s.url}/commit/${s.pinned}">pinned commit</a>` : ''}</p></div>`;
    list.appendChild(det);
  }
  host.appendChild(list);
  const missing = ws.packages.filter((p) => !p.at_pin).map((p) => `<code>${p.name}</code>`);
  host.appendChild(h('div', 'graph-note', `On the current-work branches: ${ws.packages.length} packages in ${ws.submodules.length - 1} submodules under <code>src/</code>, plus Nereus. A fresh clone of release <code>master</code> (<code>${ws.release_head}</code>) gets the pins: ${ws.pin_count} packages${missing.length ? `, without ${missing.join(', ')}` : ''}.`));
});

// ---------------------------------------------------------------- colcon package selection
dataWs.then((ws) => {
  const pk = ws.packages, by = Object.fromEntries(pk.map((p) => [p.name, p]));
  const ctl = document.getElementById('sel-controls');
  let flag = 'up_to', name = 'riptide_mpc';
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
    b.onclick = () => { name = p.name; draw(); };
    grid.appendChild(b);
    return b;
  });
  const cmd = document.getElementById('sel-cmd'), note = document.getElementById('sel-note');
  function draw() {
    sel.value = name;
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === flag)));
    const p = by[name];
    const set = new Set(flag === 'select' ? [name] : flag === 'up_to' ? p.up_to : p.above);
    chips.forEach((c, i) => {
      c.classList.toggle('on', set.has(pk[i].name));
      c.classList.toggle('me', pk[i].name === name);
    });
    cmd.innerHTML = `<code>colcon build ${FLAGS[flag]} ${name}</code>`;
    const n = set.size, deps = p.deps.length ? `It depends on ${p.deps.map((d) => `<b>${d}</b>`).join(', ')} in this workspace.` : 'It depends on nothing else in this workspace.';
    const what = {
      select: `Builds only <b>${name}</b>. Its dependencies must already be built and in <code>install/</code>. ${deps}`,
      up_to: `Builds ${n} package${n > 1 ? 's' : ''}: <b>${name}</b> and everything it needs, dependencies first. ${deps}`,
      above: `Builds ${n} package${n > 1 ? 's' : ''}: <b>${name}</b> and everything that depends on it. Use this after changing a message or a shared library${n > 10 ? `: ${name} is near the bottom of the stack` : ''}.`,
    }[flag];
    note.innerHTML = what;
  }
  draw();
});

// ---------------------------------------------------------------- the overlay explorer
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
    { script: '~/rmw_zenoh_cpp/install/setup.bash', label: 'rmw_zenoh_cpp, built from source', packages: ['rmw_zenoh_cpp', 'zenoh_cpp_vendor'] },
    { script: '~/zed-sdk/zed_wrapper/install/setup.bash', label: 'ZED ROS 2 wrapper', packages: ['zed_wrapper'], approx: true },
    { script: '~/osu-uwrt/release/scripts/dds_scripts/config_rmw.bash', label: 'team middleware choice', packages: [], set: { RMW_IMPLEMENTATION: 'from ~/.uwrt/default_rmw' } },
    { script: '~/colcon_deploy/install/setup.bash', label: 'deployed release packages', packages: deployable },
    { script: '~/dependencies/micro-ros-agent/install/setup.bash', label: 'micro-ROS agent', packages: ['micro_ros_agent'] },
  ];
  const CHAINS = {
    laptop: { name: 'Your machine', layers: laptop, lookups: ['rclcpp', 'rmw_zenoh_cpp', 'riptide_msgs2', 'riptide_mpc', 'nereus', '(colcon deploy)'] },
    orin: { name: 'The Orin', layers: orin, lookups: ['rclcpp', 'rmw_zenoh_cpp', 'zed_wrapper', 'riptide_mpc', 'riptide_rviz', 'micro_ros_agent'] },
  };
  const WHY = {
    'ROS 2 Humble (apt)': 'ROS itself: rclcpp, rclpy, ros2 CLI, launch, tf2, plus what rosdep and apt added.',
    'riptide_setup (colcon deploy)': 'No ROS packages: only a Python path for the colcon_riptide extension, which adds colcon deploy and colcon timesync.',
    'release workspace': 'Talos\'s stack. One prefix per package: colcon\'s default isolated install.',
    'Nereus launch files': 'One package, nereus, registered by build.sh so that ros2 launch nereus works.',
    'ROS 2 Humble': 'ROS itself, as on your machine.',
    'rmw_zenoh_cpp, built from source': 'The Zenoh middleware, from its own workspace.',
    'ZED ROS 2 wrapper': 'Drives the two ZED X Mini cameras (needs the ZED SDK and CUDA).',
    'team middleware choice': 'Not a workspace: sets RMW_IMPLEMENTATION from the choice saved in ~/.uwrt/default_rmw.',
    'deployed release packages': 'What colcon deploy built in ~/colcon_deploy: release minus the DEPLOY_IGNORE packages.',
    'micro-ROS agent': 'Sourced last, so it overlays everything above.',
    'middleware choice': 'Not a workspace: the export at the end of ~/.bashrc. Without it ROS 2 uses FastDDS and can\'t see Talos\'s Zenoh nodes.',
  };
  let chain = 'laptop', depth = laptop.length, look = 'riptide_mpc';
  const host = document.getElementById('overlay');
  const ctl = document.getElementById('ov-controls');
  const seg = h('div', 'seg');
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Machine');
  for (const [k, c] of Object.entries(CHAINS)) {
    const b = h('button', '', c.name);
    b.type = 'button';
    b.dataset.k = k;
    b.onclick = () => { chain = k; depth = c.layers.length; if (!c.lookups.includes(look)) look = 'riptide_mpc'; draw(); };
    seg.appendChild(b);
  }
  const next = h('button', 'btn primary', 'Source next');
  next.type = 'button';
  next.onclick = () => { depth = Math.min(depth + 1, CHAINS[chain].layers.length); draw(); };
  const reset = h('button', 'btn', 'New terminal');
  reset.type = 'button';
  reset.onclick = () => { depth = 0; draw(); };
  ctl.append(seg, next, reset);

  const stack = h('ol', 'ov-stack');
  const shell = h('div', 'ov-shell');
  host.append(stack, shell);

  function resolve(layers, pkg) {
    // AMENT_PREFIX_PATH is searched first to last; the last-sourced layer is first.
    if (pkg === '(colcon deploy)') return layers.some((l) => /riptide_setup/.test(l.script)) ? layers.find((l) => /riptide_setup/.test(l.script)) : null;
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
    // the stack, last-sourced on top
    stack.innerHTML = '';
    [...layers].reverse().forEach((l, ri) => {
      const i = layers.length - 1 - ri, active = i < depth;
      const li = h('li');
      const b = h('button', `ov-layer${active ? ' on' : ''}${i === depth - 1 ? ' top' : ''}`);
      b.type = 'button';
      const count = l.packages.length;
      b.innerHTML = `<span class="i">${i + 1}</span><span class="what"><b>${l.label}</b><code>${l.script}</code><small>${WHY[l.label] || ''}</small></span><span class="cnt">${l.approx ? '<small>not counted</small>' : count ? `+${count}<small>${count === 1 ? 'package' : 'packages'}</small>` : '<small>no packages</small>'}</span>`;
      b.setAttribute('aria-pressed', String(active));
      b.onclick = () => { depth = depth === i + 1 ? i : i + 1; draw(); };
      li.appendChild(b);
      stack.appendChild(li);
    });
    // the shell panel
    const apl = [];
    on.forEach((l) => {
      if (l.added?.AMENT_PREFIX_PATH) apl.unshift(...l.added.AMENT_PREFIX_PATH);
      else if (chain === 'orin' && l.packages.length) {
        const dir = l.script.replace(/\/setup\.bash$/, '');
        if (/opt\/ros/.test(l.script)) apl.unshift(dir);
        else apl.unshift(...[...l.packages].reverse().map((p) => `${dir}/${p}`));
      }
    });
    const distro = on.length && (on[0].set?.ROS_DISTRO || 'humble');
    const rmw = on.find((l) => l.set?.RMW_IMPLEMENTATION);
    const rows = [];
    rows.push(`<div class="var"><span class="k">ROS_DISTRO</span><span class="v">${distro ? 'humble' : '<i>(not set)</i>'}</span></div>`);
    rows.push(`<div class="var"><span class="k">RMW_IMPLEMENTATION</span><span class="v">${rmw ? `rmw_zenoh_cpp${chain === 'orin' ? ' <small>(if Zenoh is the saved choice)</small>' : ''}` : '<i>(not set: the default, FastDDS)</i>'}</span></div>`);
    rows.push(`<div class="var"><span class="k">AMENT_PREFIX_PATH</span><span class="v">${apl.length ? `${apl.length} entr${apl.length === 1 ? 'y' : 'ies'}, searched in this order:<ol class="apl">${apl.slice(0, 4).map((p) => `<li><code>${p}</code></li>`).join('')}${apl.length > 4 ? `<li class="more">... ${apl.length - 4} more</li>` : ''}</ol>` : '<i>(empty)</i>'}</span></div>`);
    if (chain === 'laptop') {
      const tot = {};
      on.forEach((l) => Object.entries(l.added || {}).forEach(([k, v]) => { if (k !== 'AMENT_PREFIX_PATH') tot[k] = (tot[k] || 0) + v.length; }));
      const ks = ['PATH', 'PYTHONPATH', 'LD_LIBRARY_PATH', 'CMAKE_PREFIX_PATH'].filter((k) => tot[k]);
      rows.push(`<div class="var"><span class="k">also added</span><span class="v">${ks.length ? ks.map((k) => `<code>${k}</code> +${tot[k]}`).join(', ') : '<i>nothing yet</i>'}</span></div>`);
    }
    // lookup
    const hit = resolve(on, look);
    let out;
    if (look === '(colcon deploy)') {
      out = hit ? '<span class="ok">usage: colcon deploy [-h] [--username USERNAME] [--remote_dir REMOTE_DIR]<br>                     [--clean] [--no_build] [--archive] ...</span>'
        : '<span class="bad">colcon: error: argument verb_name: invalid choice: \'deploy\'</span>';
    } else out = hit ? `<span class="ok">${prefixOf(hit, look)}</span>` : '<span class="bad">Package not found</span>';
    const cmdline = look === '(colcon deploy)' ? 'colcon deploy --help' : `ros2 pkg prefix ${look}`;
    const shadow = look !== '(colcon deploy)' ? on.filter((l) => l.packages.includes(look)).length : 0;
    let why;
    if (hit) why = `Found in layer ${on.indexOf(hit) + 1}, <b>${hit.label}</b>${shadow > 1 ? `; ${shadow - 1} earlier layer${shadow > 2 ? 's' : ''} also ha${shadow > 2 ? 've' : 's'} it, but the later one is searched first` : ''}.`;
    else if (!depth) why = 'Nothing is sourced: a new terminal knows no ROS packages until ~/.bashrc or you source something.';
    else if (depth < layers.length) why = 'No sourced layer provides it yet. Source more.';
    else if (ws.packages.some((p) => p.name === look && p.deploy_ignore)) why = `None of the layers has it: ${look} has a DEPLOY_IGNORE file, so colcon deploy never sends it to the robot.`;
    else why = 'None of the layers has it.';
    shell.innerHTML = `<div class="sh-title">This terminal${depth ? '' : ': brand new'}</div>${rows.join('')}
      <div class="lookup"><div class="chips">${c.lookups.map((p) => `<button type="button" class="chip${p === look ? ' me on' : ''}" data-p="${p}">${p}</button>`).join('')}</div>
      <pre class="term"><code><span class="pr">$</span> ${cmdline}\n${out}</code></pre>
      <p class="why">${why}</p></div>`;
    shell.querySelectorAll('.chip').forEach((b) => (b.onclick = () => { look = b.dataset.p; draw(); }));
  }
  draw();
});

// ---------------------------------------------------------------- git flow graph
{
  const host = document.getElementById('git-graph');
  const note = h('div', 'graph-note');
  const N = [
    { id: 'branch', x: 110, y: 80, label: 'your branch', sub: 'in one repo', info: '<b>A branch per change</b>, in the submodule\'s repo: <code>git checkout -b my-change</code> from the branch the work is based on. Example: <code>mpc-map-frames</code> in riptide_control, <code>BinaryClassifier</code> in riptide_core.' },
    { id: 'pr', x: 310, y: 80, label: 'pull request', sub: 'review, merge', info: '<b>A pull request merges it.</b> riptide_control #33 merged <code>mpc-map-frames</code> into <code>mpc</code>; riptide_core #63 merged <code>BinaryClassifier</code> into <code>dev</code>.' },
    { id: 'int', x: 520, y: 80, label: 'dev · mpc · newsim', sub: 'integration branches', info: '<b>Where current work collects.</b> Some are long-running and far ahead of master: riptide_core\'s <code>followpath-speed</code> has an open PR into <code>newsim</code> (#65); riptide_autonomy\'s <code>autonomy-mapping</code> into <code>newsim_autonomy</code> (#34).' },
    { id: 'master', x: 760, y: 80, label: 'master', sub: 'pre-competition merge', info: '<b>dev merges into master before competition</b>: "Pre-comp dev merge", riptide_core #64 and riptide_perception #27; riptide_control #32.' },
    { id: 'bump', x: 700, y: 250, label: 'bump the pins', sub: '"Pre … test" commit', info: '<b>Release records exactly what goes in the water.</b> <code>git add src/&lt;repo&gt;</code> for each changed submodule, commit to master: "Pre RPAC test 10-12-26", "Pre Tirpak test 3". A pin can be any pushed commit, merged or not.' },
    { id: 'deploy', x: 500, y: 250, label: 'colcon deploy', sub: 'to the Orin', info: '<b>Sources to the robot, built there:</b> <code>colcon deploy orin2 --clean</code> from <code>~/osu-uwrt/release</code>. See below.' },
    { id: 'test', x: 300, y: 250, label: 'pool test', sub: 'checks, then water', info: '<b>The checks compare</b> release\'s pins, what\'s pushed, and what the Orin has. See <a href="pool-test.html">Pool test day</a>.' },
    { id: 'tag', x: 100, y: 250, label: 'commit + tag', sub: '"Post … test"', info: '<b>After the test:</b> commit the fixes made at the pool in their repos, bump the pins again ("Post sean test", "Post Tirpak test 3") and tag. Tags so far include <code>6-1-24-talos</code>, <code>robosub2024</code> and <code>robosub2026</code>.' },
  ];
  const E = [
    { from: 'branch', to: 'pr' }, { from: 'pr', to: 'int' }, { from: 'int', to: 'master', label: 'before comp' },
    { from: 'int', to: 'bump', dash: true, label: 'pin a pushed commit', lx: 622, ly: 170, anchor: 'start' },
    { from: 'bump', to: 'deploy' }, { from: 'deploy', to: 'test' }, { from: 'test', to: 'tag' },
    { from: 'tag', to: 'branch', dash: true, label: 'fixes from the pool', lx: 112, ly: 170, anchor: 'start' },
  ];
  const bands = [
    { label: 'EACH PACKAGE REPO', points: [[20, 30], [880, 30], [880, 128], [20, 128]] },
    { label: 'RIPTIDE_RELEASE', points: [[20, 200], [880, 200], [880, 298], [20, 298]], ly: 288 },
  ];
  // Phones: a loop. The package repo runs down the left, release runs up the right, and the
  // fixes from the pool cross back over the top, so no edge has to pass behind a box.
  const narrow = {
    below: 620, width: 360, height: 420,
    bands: [
      { label: 'EACH PACKAGE REPO', points: [[8, 52], [178, 52], [178, 410], [8, 410]], lx: 14, ly: 401 },
      { label: 'RIPTIDE_RELEASE', points: [[182, 52], [352, 52], [352, 410], [182, 410]], lx: 188, ly: 401 },
    ],
    nodes: {
      branch: { x: 93, y: 100 }, pr: { x: 93, y: 180 }, int: { x: 93, y: 260 }, master: { x: 93, y: 352 },
      tag: { x: 267, y: 100 }, test: { x: 267, y: 180 }, deploy: { x: 267, y: 260 }, bump: { x: 267, y: 352 },
    },
    edges: {
      'tag>branch': { via: [180, 10], lx: 180, ly: 26, anchor: 'middle' },
      'int>bump': { lx: 190, ly: 309, anchor: 'start' },
      'int>master': { lx: 87, ly: 312, anchor: 'end' },
    },
  };
  new Graph(host, {
    width: 900, height: 310, nodes: N, edges: E, bands, narrow,
    info: (n) => (note.innerHTML = n ? n.info : 'Tap or hover a step.'),
  }).highlight(null);
  host.appendChild(note);
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
    cmdEl.innerHTML = `<code>colcon deploy orin2${sel}${fl}</code>`;
    const S = [];
    S.push(['Check the robot answers', 'ping -c 1 orin2', 'Stops with "Failed to ping orin2" if it doesn\'t.']);
    S.push(['Make the remote workspace', 'ssh ros@orin2 mkdir -p ~/colcon_deploy', 'User <code>ros</code> unless you pass <code>--username</code>; folder <code>~/colcon_deploy</code> unless <code>--remote_dir</code>.']);
    if (st.clean) S.push(['Delete the robot\'s build', 'rm -rf ~/colcon_deploy/install ~/colcon_deploy/build ~/colcon_deploy/log', 'Sources in <code>~/colcon_deploy/src</code> stay, including packages sent by earlier deploys.']);
    const ex = by[send[send.length - 1]] || by[send[0]];
    S.push([`Copy ${send.length} package${send.length === 1 ? '' : 's'}`, `rsync -vrzc --delete --exclude=**/.git/ --exclude=**/.vscode/ \\\n  ${path(ex)} \\\n  ros@orin2:~/colcon_deploy/src`,
      `One rsync per package, each landing as <code>src/${ex.path.split('/').pop()}</code>: ${send.map((n) => `<code>${n}</code>`).join(', ')}.${skipped.length ? ` Not sent (DEPLOY_IGNORE): ${skipped.map((n) => `<code>${n}</code>`).join(', ')}.` : ''} <code>-c</code> compares checksums, <code>--delete</code> removes files you deleted inside a package.`]);
    if (st.no_build) S.push(['Stop', '', 'With <code>--no_build</code> it ends here: the sources are synced and the robot\'s last build is left as it was, so it still runs the old code.']);
    else {
      const what = st.clean ? '' : ` --packages-select ${send.length > 4 ? `${send.slice(0, 3).join(' ')} ... (${send.length})` : send.join(' ')}`;
      S.push(['Build on the robot', `# /tmp/deploy_build.bash, copied to the Orin and run there\nsource /opt/ros/humble/setup.bash\ncd ~/colcon_deploy\ncolcon build${what} --cmake-args -DBUILD_DEPLOY=ON`,
        st.clean ? 'After <code>--clean</code> it builds <em>every</em> package in <code>~/colcon_deploy/src</code>, so dependencies sent by earlier deploys are rebuilt too.' : 'Only the packages just sent are rebuilt; the rest keep their last build. Its output streams to your terminal.']);
      if (st.archive) {
        const d = new Date(), M = d.toLocaleString('en-US', { month: 'short' });
        const stamp = `${M}_${String(d.getDate()).padStart(2, '0')}_${d.getFullYear()}_HH_MM_SS`;
        S.push(['Archive and download', `tar cf - . | gzip > /tmp/orin2_colcon_deploy_${stamp}.tar.gz\nrsync ... ros@orin2:/tmp/orin2_colcon_deploy_${stamp}.tar.gz .`, 'The whole remote workspace (sources and build), saved into the folder you ran the deploy from: a snapshot of exactly what ran.']);
      }
    }
    stepsEl.innerHTML = S.map(([t, c, d]) => `<li><b>${t}</b>${c ? `<pre class="cmd"><code>${esc(c)}</code></pre>` : ''}<p>${d}</p></li>`).join('')
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
