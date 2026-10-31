import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/code-map.css';
import { StackGraph } from '../viz/code-map-stack.js';
import { el } from '../viz/chart.js';
import { ALL } from '../site.js';

setup();

const BASE = import.meta.env.BASE_URL;
const CHAPTER = Object.fromEntries(ALL.map((c) => [c.href, c]));
const fmtN = (n) => n.toLocaleString('en-US');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
// Let long identifiers break after _ / - and . instead of overflowing a phone screen.
const brk = (s) => esc(s).replace(/([_/.-])/g, '$1<wbr>');

// Languages, coloured with the site's data slots; the rare ones share grey.
const LANG_COLOR = {
  'C++': 'var(--reference)', Python: 'var(--state)', C: 'var(--s4)', TypeScript: 'var(--s7)', JavaScript: 'var(--s5)',
  MATLAB: 'var(--s8)', Shell: 'var(--prediction)', Rust: 'var(--s6)',
};
const OTHER = 'var(--muted)';
const langColor = (l) => LANG_COLOR[l] || OTHER;
const STATUS = { talos: 'On Talos', new: 'Not deployed yet', tool: 'Tool', legacy: 'Legacy', other: 'Other robot' };

// A part's overview page is called "Overview" in the site map; name its part too.
const chTitle = (c) => (c.part.chapters[0] === c && c.n !== '' ? `${c.part.title}: ${c.title}` : c.title);
function chapterLinks(hrefs) {
  return (hrefs || []).filter((h) => CHAPTER[h]).map((h) => `<a href="${h}">${esc(chTitle(CHAPTER[h]))}</a>`).join(', ');
}

function langBar(lang, total, scale) {
  // scale: fraction of the track the bar fills (repo size / largest repo)
  const segs = Object.entries(lang || {});
  const inner = segs.map(([l, n]) => `<span style="flex:${n};background:${langColor(l)}" title="${esc(l)}: ${fmtN(n)}"></span>`).join('');
  return `<span class="cm-bar"><span class="cm-bar-fill" style="width:${Math.max(scale * 100, total ? 1.2 : 0).toFixed(2)}%">${inner}</span></span>`;
}

function langList(lang) {
  const segs = Object.entries(lang || {});
  const total = segs.reduce((a, [, n]) => a + n, 0);
  return segs.filter(([, n]) => n / total >= 0.01 || segs.length < 4)
    .map(([l, n]) => `<span><i style="background:${langColor(l)}"></i>${esc(l)} ${fmtN(n)}</span>`).join('');
}

// ---------------------------------------------------------------- data
const data = await fetch(BASE + 'data/code-map/code-map.json').then((r) => r.json());
const history = await fetch(BASE + 'data/code-map/release-history.json').then((r) => r.json());
const REPO = Object.fromEntries(data.repos.map((r) => [r.id, r]));
const findPkg = (rid, pid) => REPO[rid]?.packages.find((p) => p.id === pid);

// ---------------------------------------------------------------- explorer
const explorer = (() => {
  const st = { layer: 'all', show: 'use', q: '', sel: null, open: new Set(['release']) }; // sel: {repo, pkg?}
  const list = document.getElementById('cm-list');
  const detail = document.getElementById('cm-detail');
  const body = list.parentElement;
  const maxCode = Math.max(...data.repos.map((r) => r.code || 0));
  const narrow = matchMedia('(max-width: 820px)');

  // layer chips
  const chips = document.getElementById('cm-layers');
  const layerBtns = [['all', 'All layers'], ...data.layers.map((l) => [l.id, l.label])].map(([id, label]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-chip';
    b.textContent = label;
    b.dataset.layer = id;
    b.setAttribute('aria-pressed', String(id === st.layer));
    b.onclick = () => { st.layer = id; render(); };
    chips.appendChild(b);
    return b;
  });
  const statusBtns = [...document.querySelectorAll('#cm-status button')];
  statusBtns.forEach((b) => (b.onclick = () => { st.show = b.dataset.s; render(); }));
  const q = document.getElementById('cm-q');
  q.addEventListener('input', () => { st.q = q.value.trim().toLowerCase(); render(); });

  // legend
  const used = new Set();
  data.repos.forEach((r) => Object.keys(r.lang || {}).forEach((l) => used.add(LANG_COLOR[l] ? l : 'other')));
  document.getElementById('cm-legend').innerHTML = '<span class="cm-legend-t">Bars: lines of code by language</span>' + [...Object.keys(LANG_COLOR).filter((l) => used.has(l)), 'other']
    .map((l) => `<span><i style="background:${l === 'other' ? OTHER : LANG_COLOR[l]}"></i>${l === 'other' ? 'CMake, GLSL, HTML, Lua' : l}</span>`).join('');

  const showOk = (status) => st.show === 'all' || (st.show === 'use' ? status === 'talos' || status === 'new' || status === 'tool' : status === 'legacy' || status === 'other');
  const text = (o) => [o.id, o.name, o.ros, o.desc, o.note, o.extra, o.dir, ...(o.nodes || []), ...(o.tools || []), ...(o.launch || [])].join(' ').toLowerCase();
  // A search that names packages shows just those; one that only matches the repo's own text shows all its packages.
  const qOk = (r, p) => !st.q || text(p).includes(st.q) || (!r.packages.some((x) => text(x).includes(st.q)) && text(r).includes(st.q));
  const pkgOk = (r, p) => showOk(p.status) && (st.layer === 'all' || (p.layers || [p.layer]).includes(st.layer)) && qOk(r, p);
  const repoOk = (r) => {
    if (r.packages.length) return r.packages.some((p) => pkgOk(r, p));
    return showOk(r.status) && (st.layer === 'all' || r.layers.includes(st.layer)) && (!st.q || text(r).includes(st.q));
  };

  function sizeText(r) {
    if (r.altium) return `${r.altium['board projects'] || 0} board projects`;
    if (!r.code) return '';
    return `${fmtN(r.code)} lines`;
  }

  function render() {
    layerBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.layer === st.layer)));
    statusBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.s === st.show)));
    list.innerHTML = '';
    let shown = 0;
    for (const g of data.groups) {
      const repos = data.repos.filter((r) => r.group === g.id && repoOk(r));
      if (!repos.length) continue;
      const sec = document.createElement('section');
      sec.className = 'cm-group';
      // Groups other than the release workspace start folded; a filter, a search or a selection opens them.
      const open = st.layer !== 'all' || st.q || st.show !== 'use' || st.open.has(g.id) || repos.some((r) => r.id === st.sel?.repo);
      const [main, subl] = g.label.split(': ');
      sec.innerHTML = `<h3 class="cm-group-label"><button type="button" aria-expanded="${!!open}"><span class="cm-gl">${esc(main)}${subl ? `<span class="cm-gl-sub">${esc(subl)}</span>` : ''}</span><small>${repos.length} repo${repos.length > 1 ? 's' : ''}</small></button></h3>`;
      sec.querySelector('h3 button').onclick = () => { if (open) st.open.delete(g.id); else st.open.add(g.id); render(); };
      if (!open) {
        const peek = document.createElement('button');
        peek.type = 'button';
        peek.className = 'cm-peek';
        peek.innerHTML = repos.map((r) => `<code>${esc(r.name)}</code>`).join(' ');
        peek.onclick = () => { st.open.add(g.id); render(); };
        sec.appendChild(peek);
        list.appendChild(sec);
        shown += repos.length;
        continue;
      }
      for (const r of repos) {
        shown++;
        const card = document.createElement('div');
        card.className = 'cm-repo' + (st.sel?.repo === r.id ? ' on' : '') + (r.status === 'legacy' || r.status === 'other' ? ' old' : '');
        card.dataset.repo = r.id;
        const branch = r.branch ? `<span class="cm-branch">${brk(r.branch)}</span>` : '';
        const tag = r.status !== 'talos' ? `<span class="cm-tag cm-${r.status}">${STATUS[r.status]}</span>` : '';
        // Phones start with repo rows only; a repo's packages show once it's tapped (or a filter or search is on).
        const fold = narrow.matches && st.layer === 'all' && !st.q && st.sel?.repo !== r.id;
        const okPk = r.packages.filter((p) => pkgOk(r, p));
        const pk = fold ? '' : okPk.map((p) => {
          const on = st.sel?.repo === r.id && st.sel?.pkg === p.id;
          const hit = st.q && (p.id.toLowerCase().includes(st.q) || text(p).includes(st.q));
          return `<button type="button" class="cm-pkg${on ? ' on' : ''}${p.status === 'legacy' || p.status === 'other' ? ' old' : ''}${p.status === 'new' ? ' new' : ''}${hit ? ' hit' : ''}" data-pkg="${esc(p.id)}" aria-pressed="${on}">${brk(p.id)}${p.status === 'new' ? '<small>new</small>' : ''}</button>`;
        }).join('');
        card.innerHTML = `<button type="button" class="cm-repo-head" aria-pressed="${st.sel?.repo === r.id && !st.sel?.pkg}">
            <span class="cm-name">${brk(r.name)}</span>${branch}${tag}<span class="cm-size">${sizeText(r)}${fold && okPk.length ? `<span class="cm-npk"> · ${okPk.length} pkg${okPk.length > 1 ? 's' : ''}</span>` : ''}</span>
            ${r.code ? langBar(r.lang, r.code, r.code / maxCode) : ''}
          </button>${pk ? `<div class="cm-pkgs">${pk}</div>` : ''}`;
        card.querySelector('.cm-repo-head').onclick = () => select(r.id, null, true);
        card.querySelectorAll('.cm-pkg').forEach((b) => (b.onclick = () => select(r.id, b.dataset.pkg, true)));
        sec.appendChild(card);
      }
      list.appendChild(sec);
    }
    if (!shown) list.innerHTML = '<p class="cm-empty">Nothing matches. Try another layer, or "All".</p>';
    placeDetail();
  }

  function placeDetail() {
    // Wide: a sticky column beside the list. Narrow: right under the selected card.
    // A selected package that the search or filter hides counts as hidden, even if its repo is still listed.
    const selP = st.sel?.pkg && findPkg(st.sel.repo, st.sel.pkg);
    const hiddenPkg = !!selP && !pkgOk(REPO[st.sel.repo], selP);
    const card = st.sel && !hiddenPkg && list.querySelector(`.cm-repo[data-repo="${CSS.escape(st.sel.repo)}"]`);
    if (narrow.matches && card) card.after(detail);
    else if (narrow.matches) list.prepend(detail);
    else if (detail.parentElement !== body) body.appendChild(detail);
    detail.classList.toggle('inline', narrow.matches && !!card);
    // Nothing selected: the overview. A selection hidden by a filter shows nothing on a phone.
    detail.hidden = narrow.matches && !!st.sel && !card;
    if (!st.sel || detail.hidden) detail.classList.remove('inline');
    // Wide: the detail column shows the overview while the selection is hidden, and the selection again once it's back.
    const showOv = !narrow.matches && hiddenPkg;
    if (showOv !== detail.classList.contains('ov') && st.sel) { if (showOv) { detail.classList.add('ov'); detail.innerHTML = overview(); } else showDetail(); }
  }
  narrow.addEventListener('change', () => { render(); showDetail(); });

  function overview() {
    const inUse = data.repos.filter((r) => r.status === 'talos');
    const pk = inUse.flatMap((r) => r.packages.filter((p) => p.ros && p.status === 'talos'));
    const lines = inUse.reduce((a, r) => a + (r.code || 0), 0);
    // The team's own ROS code on the robot: the five riptide_* repos (their legacy and undeployed packages left out).
    const own = ['riptide_core', 'riptide_control', 'riptide_perception', 'riptide_autonomy', 'riptide_launch']
      .flatMap((id) => REPO[id].packages.filter((p) => p.status === 'talos')).reduce((a, p) => a + (p.code || 0), 0);
    const k = (n) => `${fmtN(Math.round(n / 1000))}k`;
    return `<dl class="cm-stats">
        <div><dd>${inUse.length}</dd><dt>repos Talos runs or is built from</dt></div>
        <div><dd>${pk.length}</dd><dt>ROS packages among them</dt></div>
        <div><dd>${k(lines)}</dd><dt>lines of code in all of them, Nereus and firmware included</dt></div>
        <div><dd>${k(own)}</dd><dt>of those in the five <code>riptide_*</code> repos</dt></div>
      </dl>
      <p class="cm-hint">Tap a repo or a package for what it does.</p>
      <p class="cm-small cm-counted">Counted from the checkouts on ${esc(data.generated)} (release commit ${esc(data.releaseCommit)}). Lines are non-blank lines of tracked source files, comments included; vendored code left out.</p>`;
  }

  // A package's text describes the branch tip; say so when the release pin is behind it.
  const aheadNote = (r, p) => (r.pin?.ahead && !p.untracked
    ? `<p class="cm-small">This describes the <code>${brk(r.branch)}</code> branch, ${r.pin.ahead} commit${r.pin.ahead > 1 ? 's' : ''} past the release pin <code>${esc(r.pin.sha)}</code>: some of it may be newer than what's pinned.</p>`
    : '');

  const pkgRef = ([rid, pid]) => {
    const p = findPkg(rid, pid);
    return `<button type="button" class="cm-ref" data-r="${esc(rid)}" data-p="${esc(pid)}">${brk(p?.ros || pid)}</button>`;
  };

  function showDetail() {
    const s = st.sel;
    detail.classList.toggle('ov', !s);
    if (!s) { detail.innerHTML = overview(); return; }
    const r = REPO[s.repo];
    const p = s.pkg ? findPkg(s.repo, s.pkg) : null;
    let h = '';
    if (p) {
      const flags = [];
      if (p.status !== 'talos') flags.push(`<span class="cm-tag cm-${p.status}">${STATUS[p.status]}</span>`);
      (p.ignored || []).forEach((f) => flags.push(`<span class="cm-tag cm-legacy">${f}</span>`));
      if (p.untracked && p.status !== 'new') flags.push('<span class="cm-tag cm-legacy">not committed yet</span>');
      const layer = (p.layers || [p.layer]).map((id) => data.layers.find((l) => l.id === id)?.label).filter(Boolean).join(', ');
      h += `<div class="cm-crumb"><button type="button" class="cm-ref" data-r="${esc(r.id)}">${brk(r.name)}</button> /</div>
        <h4 class="cm-title">${brk(p.id)}</h4>
        <p class="cm-meta">${p.ros ? `ROS package <code>${brk(p.ros)}</code> · ${esc(p.build)}${p.version ? ' · v' + esc(p.version) : ''}` : esc(layer)}${p.ros ? ' · ' + esc(layer) : ''} ${flags.join(' ')}</p>
        <p>${esc(p.desc)}</p>${p.note ? `<p class="cm-note">${esc(p.note)}</p>` : ''}${aheadNote(r, p)}`;
      if (p.code) h += `<div class="cm-langs">${langBar(p.lang, p.code, 1)}<div class="cm-langlist"><b>${fmtN(p.code)} lines</b>${langList(p.lang)}</div></div>`;
      if (p.interfaces) h += `<p class="cm-small">Interfaces: ${Object.entries(p.interfaces).map(([k, n]) => `${n} ${k}`).join(', ')}.</p>`;
      if (p.nodes?.length) h += `<p class="cm-sub">Nodes it installs</p><div class="cm-codes">${p.nodes.map((n) => `<code>${brk(n)}</code>`).join('')}</div>`;
      if (p.tools?.length) h += `<p class="cm-sub">Other programs it installs</p><div class="cm-codes">${p.tools.map((n) => `<code>${brk(n)}</code>`).join('')}</div>`;
      if (p.launch?.length) h += `<p class="cm-sub">Launch files</p><div class="cm-codes">${p.launch.map((n) => `<code>${brk(n)}</code>`).join('')}</div>`;
      if (p.deps?.length) h += `<p class="cm-sub">Depends on</p><div class="cm-codes">${p.deps.map(pkgRef).join('')}</div>`;
      if (p.upstream?.length) h += `<p class="cm-sub">Upstream packages</p><div class="cm-codes cm-up">${p.upstream.map((n) => `<code>${brk(n)}</code>`).join('')}</div><p class="cm-small">From <code>package.xml</code>: outside packages besides core ROS 2 (rclcpp, the common message types, tf2).</p>`;
      if (p.usedBy?.length) h += `<p class="cm-sub">Used by</p><div class="cm-codes">${p.usedBy.map(pkgRef).join('')}</div>`;
      const links = [];
      if (p.github) links.push(`<a href="${esc(p.github)}">Code on GitHub${r.branch && !p.submodule ? ` (${esc(r.branch)})` : ''}</a>`);
      if (p.chapters?.length) links.push(`Explained in ${chapterLinks(p.chapters)}`);
      if (links.length) h += `<p class="cm-links">${links.join('<br>')}</p>`;
    } else {
      const flags = r.status !== 'talos' ? `<span class="cm-tag cm-${r.status}">${STATUS[r.status]}</span>` : '';
      h += `<h4 class="cm-title">${brk(r.name)}</h4>
        <p class="cm-meta">${r.branch ? `branch <code>${brk(r.branch)}</code>` : 'local only'}${r.commitDate ? (r.ref ? ` · pinned commit dated ${esc(r.commitDate)}` : ` · last commit ${esc(r.commitDate)}`) : ''} ${flags}</p>
        <p>${esc(r.desc)}</p>${r.extra ? `<p class="cm-small">${esc(r.extra)}</p>` : ''}`;
      if (r.pin) {
        h += `<p class="cm-pin">riptide_release pins <code>${esc(r.pin.sha)}</code> (${esc(r.pin.date)})${r.pin.ahead ? `; the branch is <b>${r.pin.ahead} commit${r.pin.ahead > 1 ? 's' : ''} ahead</b>, so some of what's described here may be newer than the pin` : '; the branch is at the pin'}.</p>`;
      } else if (r.pinNote) h += `<p class="cm-pin">${esc(r.pinNote)}.</p>`;
      if (r.code) h += `<div class="cm-langs">${langBar(r.lang, r.code, 1)}<div class="cm-langlist"><b>${fmtN(r.code)} lines</b>${langList(r.lang)}</div></div>`;
      if (r.config > 2000) h += `<p class="cm-small">Plus ${fmtN(r.config)} lines of YAML/XML/messages.</p>`;
      if (r.altium) h += `<p class="cm-small">${Object.entries(r.altium).map(([k, n]) => `${n} ${k}`).join(' · ')}</p>`;
      if (r.packages.length) h += `<p class="cm-sub">${r.packages.some((p) => p.ros) ? 'Packages' : 'Parts'}</p><div class="cm-codes">${r.packages.map((p) => pkgRef([r.id, p.id])).join('')}</div>`;
      const links = [];
      if (r.github) links.push(`<a href="${esc(r.github)}">${esc(r.githubRepo)} on GitHub</a>${r.archived ? ' (archived)' : ''}`);
      if (r.chapters?.length) links.push(`Explained in ${chapterLinks(r.chapters)}`);
      if (links.length) h += `<p class="cm-links">${links.join('<br>')}</p>`;
    }
    detail.innerHTML = h;
    detail.querySelectorAll('.cm-ref').forEach((b) => (b.onclick = () => select(b.dataset.r, b.dataset.p || null, true, true)));
  }

  function select(repo, pkg, user, follow) {
    const same = st.sel && st.sel.repo === repo && (st.sel.pkg || null) === (pkg || null);
    st.sel = same && user && !follow ? null : { repo, pkg };
    // make sure the selection is visible under the current filters
    const r = REPO[repo];
    const p = pkg && findPkg(repo, pkg);
    if (st.sel && ((p && !pkgOk(r, p)) || (!p && !repoOk(r)))) { st.layer = 'all'; st.show = 'all'; st.q = ''; q.value = ''; }
    render();
    showDetail();
    if (follow && narrow.matches) {
      // Phones: bring the selected card (its inline detail follows it) to the top of the screen.
      const card = list.querySelector('.cm-repo.on');
      (card || detail).scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  render();
  showDetail();
  // Wide screens: the detail is a sticky column, so show the explorer from its top. Phones scroll to the card in select().
  return { select, scroll: () => { if (!narrow.matches) document.getElementById('explorer-fig').scrollIntoView({ behavior: 'smooth', block: 'start' }); } };
})();

// ---------------------------------------------------------------- the stack in layers
{
  // One box per program on the robot (and the two operator tools), labelled with the package that provides it.
  // `ref`: the explorer entries "Show in explorer" opens; `blurb`: what the box does, in one or two lines.
  const nodes = [
    { id: 'viewer', label: 'nereus-viewer', sub: 'nereus · on your laptop', kick: 'YOUR LAPTOP', side: true, x: 360, y: 57, ref: [['nereus', 'integrations/ros2']],
      blurb: 'The operator\'s GUI, on a laptop: shows the robot (or the sim), runs mission trees and can send the MPC goals directly.' },
    { id: 'launcher', label: 'remote_launch', sub: 'riptide_launch · on the Orin', kick: 'ON THE ORIN', side: true, x: 640, y: 57, ref: [['riptide_launch', 'remote_launch']],
      blurb: 'Runs on the Orin as <code>ros_launcher.service</code> and starts the launch entries the operator picks from <code>talos_launch_mpc.yaml</code>. Nothing else in this picture runs until it is started.', chapters: ['launch.html'] },
    { id: 'bt', label: 'riptide_autonomy2', sub: 'riptide_autonomy', kick: 'AUTONOMY', x: 360, y: 153, ref: [['riptide_autonomy', 'riptide_autonomy']],
      blurb: 'Runs the mission as a behaviour tree (at competition, <code>RepairCompMpcTree.xml</code>): it looks up where the props are and sends the MPC goals.' },
    { id: 'mpc', label: 'riptide_mpc', sub: 'riptide_control', kick: 'CONTROL', x: 640, y: 153, ref: [['riptide_control', 'riptide_mpc']],
      blurb: 'The controller. It plans thrust a few seconds ahead so Talos reaches the goal the tree sets, and sends RPM commands to the ESC boards. It keeps its own state estimate from the raw IMU, gyro, DVL and depth readings, anchored to the EKF.' },
    { id: 'map', label: 'riptide_mapping2', sub: 'riptide_perception', kick: 'MAPPING', x: 360, y: 249, ref: [['riptide_perception', 'riptide_mapping']],
      blurb: 'Turns many noisy detections into one position estimate per prop, and publishes each as a TF frame the mission can look up.' },
    { id: 'det', label: 'tensor_detector', sub: 'riptide_perception', kick: 'PERCEPTION', x: 360, y: 345, ref: [['riptide_perception', 'tensor_detector']],
      blurb: 'Runs YOLO on the Orin\'s GPU over one camera\'s images at a time (forward or down; the mission switches) and publishes 3D detections of the props.' },
    { id: 'ekf', label: 'EKF', sub: 'robot_localization', kick: 'ESTIMATION', x: 640, y: 345, ref: [['riptide_core', 'riptide_hardware']],
      blurb: 'Fuses IMU, gyro, DVL and depth into one pose and velocity estimate, <code>odometry/filtered</code>. It is robot_localization\'s EKF, an outside package, launched and configured by <code>riptide_hardware2</code> (<code>navigation.launch.py</code>, <code>talos_ekf.yaml</code>).' },
    { id: 'zed', label: 'zed_wrapper', sub: 'zed-ros2-wrapper', kick: 'DRIVER', x: 360, y: 441, ref: [['zed-ros2-wrapper', null]],
      blurb: 'Stereolabs\' ROS 2 driver for the two ZED X Mini cameras, forward and down: images, stereo depth and the cameras\' own IMU.' },
    { id: 'agent', label: 'micro_ros_agent', sub: 'micro-ros-agent', kick: 'CAN BRIDGE', x: 500, y: 441, ref: [['micro-ros-agent', null]],
      blurb: 'Carries the boards\' micro-ROS topics onto ROS 2 over CAN, both ways: depth, kill switch, power and actuators. Thruster RPMs don\'t pass through it.' },
    { id: 'sensors', label: 'IMU · gyro · DVL', sub: '3 driver packages', kick: 'DRIVERS', x: 660, y: 441, ref: [['riptide_core', 'riptide_imu'], ['riptide_core', 'riptide_gyro'], ['nortek_dvl', 'nortek_dvl']],
      blurb: 'Three drivers: <code>riptide_imu</code> (the VectorNav IMU), <code>riptide_gyro</code> (the fibre-optic gyro) and <code>nortek_dvl</code> (the Doppler velocity log: speed over the pool floor).', chapters: ['sensors.html'] },
    { id: 'fw', label: 'titan_firmware', sub: 'RP2040 boards', kick: 'FIRMWARE', x: 500, y: 537, ref: [['titan_firmware', null]],
      blurb: 'Firmware on the RP2040 boards in the hull: the two ESC boards spin the 8 thrusters; others read depth, power and the kill switch and fire the actuators.' },
  ];
  const edges = [
    { from: 'agent', to: 'fw', both: true, label: 'CAN', a: ['b'], b: ['t'], lx: 507, ly: 493, anchor: 'start' },
    { from: 'agent', to: 'ekf', label: 'depth', lx: 556, ly: 386, anchor: 'end' },
    { from: 'sensors', to: 'ekf', label: 'readings', a: ['t', 650], b: ['b', 650], lx: 657, ly: 397, anchor: 'start' },
    { from: 'zed', to: 'det', label: 'images', a: ['t'], b: ['b'], lx: 367, ly: 397, anchor: 'start' },
    { from: 'det', to: 'map', label: 'detections', a: ['t'], b: ['b'], lx: 367, ly: 301, anchor: 'start' },
    { from: 'ekf', to: 'map', label: 'odometry' },
    { from: 'ekf', to: 'mpc', label: 'odometry (anchor)', a: ['t'], b: ['b'], lx: 633, ly: 262, anchor: 'end' },
    { from: 'sensors', to: 'mpc', label: 'readings', a: ['r'], pts: [[740, 441], [740, 161]], b: ['r', 161], lx: 734, ly: 262, anchor: 'end' },
    { from: 'map', to: 'bt', label: 'prop frames (TF)', a: ['t'], b: ['b'], lx: 367, ly: 205, anchor: 'start' },
    { from: 'bt', to: 'mpc', label: 'goals', a: ['r'], b: ['l'] },
    { from: 'mpc', to: 'fw', label: 'thruster RPMs', a: ['r', 145], pts: [[790, 145], [790, 537]], b: ['r'], lx: 782, ly: 489, anchor: 'end' },
    { from: 'viewer', to: 'bt', label: 'run a tree', dash: true, a: ['b'], b: ['t'], lx: 367, ly: 109, anchor: 'start' },
  ];
  const band = (label, y, h = 84) => ({ label, y, h });
  const bands = [band('OPERATOR TOOLS', 15), band('AUTONOMY AND CONTROL', 111), band('MAPPING', 207), band('ESTIMATION AND PERCEPTION', 303), band('DRIVERS', 399), band('FIRMWARE', 495)];
  // Phone: two columns (x 84 and 232), rows 74 apart, the layer named inside each box. The thrust return runs down
  // the right edge (x 312) and the MPC's sensor feed just inside it (x 300), so no two edges cross.
  const L = 84, R = 232;
  const at = (x, y) => ({ x, y });
  const row = (y, h = 64, side) => ({ y: y - 32, h, side });
  const Y = { op: 40, ac: 114, map: 188, ep: 262, drv: 336, can: 410, fw: 490 };
  const mid = (a, b) => (Y[a] + Y[b]) / 2; // the middle of the gap between two rows
  const narrow = {
    below: 800, width: 320, height: 526,
    bands: [row(Y.op, 64, true), row(Y.ac), row(Y.map), row(Y.ep), row(Y.drv, Y.can - Y.drv + 64), row(Y.fw)],
    nodes: { viewer: { ...at(L, Y.op), sub: 'nereus' }, launcher: { ...at(R, Y.op), sub: 'riptide_launch' }, bt: at(L, Y.ac), mpc: at(R, Y.ac),
      map: at(L, Y.map), det: at(L, Y.ep), ekf: at(R, Y.ep), zed: at(L, Y.drv), sensors: at(R, Y.drv), agent: at(R, Y.can), fw: at(R, Y.fw) },
    edges: {
      'agent>fw': { lx: R + 8, ly: mid('can', 'fw') },
      'agent>ekf': { a: ['l'], pts: [[162, Y.can], [162, Y.ep]], b: ['l'], lx: 155, ly: Y.can + 4, anchor: 'end' },
      'sensors>ekf': { a: ['t'], b: ['b'], lx: R + 7, ly: mid('ep', 'drv'), anchor: 'start' },
      'sensors>mpc': { a: ['r'], pts: [[300, Y.drv], [300, Y.ac + 8]], b: ['r', Y.ac + 8], lx: 295, ly: Y.map + 12, anchor: 'end' },
      'zed>det': { lx: L + 7, ly: mid('ep', 'drv') }, 'det>map': { lx: L + 7, ly: mid('map', 'ep') }, 'map>bt': { lx: L + 7, ly: mid('ac', 'map') },
      'ekf>map': { a: ['t', 214], pts: [[214, Y.map]], b: ['r'], hideLabel: true, labelOf: 'ekf>mpc' },
      'ekf>mpc': { a: ['t', 214], b: ['b', 214], label: 'odometry', lx: 220, ly: mid('ac', 'map'), anchor: 'start' },
      'bt>mpc': { ly: Y.ac - 7 },
      'mpc>fw': { a: ['r', Y.ac - 8], pts: [[312, Y.ac - 8], [312, Y.fw]], label: 'thrust', lx: 308, ly: mid('drv', 'can'), anchor: 'end' },
      'viewer>bt': { lx: L + 7, ly: mid('op', 'ac') },
    },
  };

  // The loop, one hop at a time. The first step is shown before any tap.
  const STEPS = [
    { edges: ['sensors>ekf', 'agent>fw', 'agent>ekf'], title: 'Sensor readings → EKF',
      text: 'The IMU, gyro and DVL drivers publish their readings; depth comes from the camera-cage board over CAN, through the micro-ROS agent. The EKF fuses them into one pose and velocity, <code>odometry/filtered</code>.' },
    { edges: ['zed>det'], title: 'Images → detector',
      text: 'The ZED wrapper publishes both cameras\' images. <code>tensor_detector</code> runs YOLO on one of them (the mission picks forward or down) and publishes <code>detected_objects</code>.' },
    { edges: ['det>map', 'ekf>map'], title: 'Detections + pose → map',
      text: '<code>riptide_mapping2</code> places each detection in the pool using the EKF\'s pose and keeps one estimate per prop, published as a TF frame.' },
    { edges: ['map>bt'], title: 'Prop frames → mission tree',
      text: 'The behaviour tree looks up those frames to decide what to do next: drive to the gate, line up over the bins, and so on.' },
    { edges: ['bt>mpc', 'sensors>mpc', 'ekf>mpc'], title: 'Goals + readings → MPC',
      text: 'The tree sends poses and paths (<code>controller/linear</code>, <code>controller/angular</code>, the <code>follow_path</code> action) to <code>riptide_mpc</code>. For its own state the MPC reads the raw IMU, gyro and DVL (and depth, which comes through the agent), and uses the EKF\'s odometry only to anchor position and heading and to stand in for a sensor that goes quiet.' },
    { edges: ['mpc>fw'], title: 'Thrust → ESC boards',
      text: 'Each control tick the MPC turns thrust into eight RPMs and writes them straight to the two ESC boards as raw CAN frames, skipping ROS (<code>command/requested_rpm</code> is a copy for bags). The thrusters move Talos, the sensors see it, and the loop starts again.' },
  ];

  const note = document.getElementById('stack-note');
  const count = document.getElementById('stack-count');
  const prev = document.getElementById('stack-prev');
  const next = document.getElementById('stack-next');
  let step = 0;
  const N = Object.fromEntries(nodes.map((n) => [n.id, n]));
  let boxOn = false; // a tapped box is showing: Next goes back to the current step first
  function showStep() {
    boxOn = false;
    g.focus(STEPS[step].edges);
    count.textContent = `Step ${step + 1} of ${STEPS.length}`;
    prev.disabled = step === 0;
    next.disabled = step === STEPS.length - 1;
    next.textContent = 'Next ›';
    next.setAttribute('aria-label', 'Next step');
    note.innerHTML = `<b>${step + 1} · ${STEPS[step].title}.</b> ${STEPS[step].text}`;
  }
  function showNode(id) {
    const n = N[id];
    boxOn = true;
    count.innerHTML = `<b>${esc(n.label)}</b> selected`;
    prev.disabled = true;
    next.disabled = false;
    next.textContent = `Step ${step + 1} ›`;
    next.setAttribute('aria-label', `Back to step ${step + 1}`);
    const refs = n.ref.map(([rid, pid]) => {
      const r = REPO[rid];
      const p = pid && findPkg(rid, pid);
      return { rid, pid, r, name: p ? p.ros || p.id : r.name };
    });
    const where = refs.length > 1 ? '' : (() => {
      const { r, pid, name } = refs[0];
      const branch = r.branch ? `, branch <code>${brk(r.branch)}</code>` : '';
      return pid ? ` <span class="cm-where">(package <code>${brk(name)}</code> in <code>${brk(r.name)}</code>${branch})</span>` : ` <span class="cm-where">(<code>${brk(r.name)}</code>${branch})</span>`;
    })();
    const o = refs.length === 1 ? (refs[0].pid ? findPkg(refs[0].rid, refs[0].pid) : refs[0].r) : null;
    const ch = chapterLinks((n.chapters || o?.chapters || []).slice(0, 2));
    const jumps = refs.map(({ name }, i) => `<button type="button" class="cm-ref cm-jump" data-i="${i}">${refs.length > 1 ? esc(name) : 'Show in explorer'}</button>`).join('');
    note.innerHTML = `<b>${esc(n.label)}</b>${where}: ${n.blurb}${ch ? ` More in ${ch}.` : ''} <span class="cm-jumps">${refs.length > 1 ? 'In the explorer: ' : ''}${jumps}</span>`;
    note.querySelectorAll('.cm-jump').forEach((b) => (b.onclick = () => {
      const { rid, pid } = refs[+b.dataset.i];
      explorer.select(rid, pid || null, true, true);
      explorer.scroll();
    }));
  }
  const g = new StackGraph(document.getElementById('stack-graph'), {
    width: 820, height: 590, nodes, edges, bands, narrow,
    label: 'Talos\'s software by layer: data flows up from the boards to the mission tree and back down as thruster commands',
    onNode: (id, tap) => {
      if (!id) { showStep(); return; }
      showNode(id);
      // Phones: the note sits under the picture; bring it up so a tap near the top gets a visible answer.
      if (tap && innerWidth < 640) note.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
  });
  prev.onclick = () => { if (!boxOn) step = Math.max(0, step - 1); g.select(null); };
  next.onclick = () => { if (!boxOn) step = Math.min(STEPS.length - 1, step + 1); g.select(null); };
  showStep();
}

// ---------------------------------------------------------------- pins table
{
  const tb = document.querySelector('#cm-pins tbody');
  const rows = data.repos.filter((r) => r.pin || r.pinNote);
  rows.sort((a, b) => (a.status === 'legacy') - (b.status === 'legacy') || (b.pin?.ahead || 0) - (a.pin?.ahead || 0));
  tb.innerHTML = rows.map((r) => {
    const gh = r.githubRepo ? `https://github.com/${r.githubRepo}` : '';
    const pin = r.pin ? `<a href="${gh}/commit/${r.pin.sha}"><code>${r.pin.sha}</code></a> <span class="cm-date">${r.pin.date}</span>` : `<code>${esc((r.pinNote || '').split(' ').pop())}</code> <span class="cm-date">in <code>zed_wrapper.<wbr>repos</code></span>`;
    const ahead = r.pin ? (r.pin.ahead ? `<b>${r.pin.ahead}</b>` : '0') : '–';
    return `<tr${r.status === 'legacy' ? ' class="cm-oldrow"' : ''}><td><a href="${esc(r.github || gh)}"><code>${brk(r.name)}</code></a>${r.status === 'legacy' ? ' <small>legacy</small>' : ''}<span class="cm-br">${brk(r.branch)}</span></td><td>${pin}</td><td>${ahead}</td></tr>`;
  }).join('');
  const last = [...history].reverse().find((c) => /^pre /i.test(c.msg));
  document.getElementById('cm-pins-note').innerHTML = `Read from the release checkout on ${esc(data.generated)}: release commit <a href="https://github.com/osu-uwrt/riptide_release/commit/${esc(data.releaseCommit)}"><code>${esc(data.releaseCommit)}</code></a> (${esc(data.releaseCommitDate)})${last ? `; the last pool-test pin was "${esc(last.msg)}" on ${esc(last.date)}` : ''}.`;
}

// ---------------------------------------------------------------- release history matrix
{
  const host = document.getElementById('cm-history');
  const read = document.getElementById('cm-hist-read');
  const moves = {};
  history.forEach((c) => c.moved.forEach((m) => (moves[m.repo] = (moves[m.repo] || 0) + 1)));
  const repos = Object.keys(moves).sort((a, b) => moves[b] - moves[a] || a.localeCompare(b));
  let sel = history.length - 1, hover = null, svg = null, lastW = 0;
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const what = (m) => (m.added ? 'added' : m.commits ? `+${m.commits}` : 'moved back or sideways');
  const short = (n) => n.replace(/^riptide_/, '');
  let showAll = false;

  // Phones: a list of commits, newest first, grouped by month (a 37-column matrix can't be read or tapped at 390 px).
  function drawList() {
    host.classList.add('cm-hlist');
    read.hidden = true;
    const rows = [...history].reverse();
    const shown = showAll ? rows : rows.slice(0, 8);
    let month = '', h = '';
    for (const c of shown) {
      const [yy, mm] = c.date.split('-').map(Number);
      const mo = `${MONTH[mm - 1]} ${yy}`;
      if (mo !== month) { h += `${month ? '</ol>' : ''}<p class="cm-hl-month">${mo}</p><ol class="cm-hl-rows">`; month = mo; }
      const rs = /^RoboSub 20\d\d$/.test(c.msg);
      const chips = c.moved.length
        ? c.moved.map((m) => `<span class="cm-hchip${m.commits ? '' : ' ring'}">${esc(short(m.repo))} ${m.added ? 'added' : m.commits ? `<b>+${m.commits}</b>` : 'moved back'}</span>`).join('')
        : '<span class="cm-hnone">no pins moved</span>';
      h += `<li class="${rs ? 'rs' : ''}"><div class="cm-hl-top"><span class="cm-hl-date">${MONTH[mm - 1]} ${+c.date.slice(8)}</span>
        <span class="cm-hl-msg">${rs ? '<b>' : ''}${esc(c.msg)}${rs ? '</b>' : ''}</span>
        <a class="cm-hl-sha" href="https://github.com/osu-uwrt/riptide_release/commit/${esc(c.sha)}"><code>${esc(c.sha)}</code></a></div>
        <div class="cm-hl-chips">${chips}</div></li>`;
    }
    h += '</ol>';
    if (rows.length > 8) h += `<button type="button" class="btn cm-hl-more">${showAll ? 'Show the last 8' : `Show all ${rows.length}`}</button>`;
    host.innerHTML = `<p class="cm-hl-key">Newest first. <span class="cm-hchip">core <b>+11</b></span> = the pin moved 11 commits forward; <span class="cm-hchip ring">gui moved back</span> = moved to a commit that isn't ahead.</p>${h}`;
    const more = host.querySelector('.cm-hl-more');
    if (more) more.onclick = () => { showAll = !showAll; drawList(); if (!showAll) host.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
    svg = null;
  }

  function draw() {
    const w = host.clientWidth - parseFloat(getComputedStyle(host).paddingLeft) - parseFloat(getComputedStyle(host).paddingRight);
    if (w <= 0) return;
    lastW = host.clientWidth;
    if (w < 520) { drawList(); return; }
    host.classList.remove('cm-hlist');
    read.hidden = false;
    const labelW = 150, rowH = 22, top = 22, bottom = 34;
    const H = top + repos.length * rowH + bottom;
    const colW = (w - labelW - 6) / history.length;
    const cx = (i) => labelW + 6 + (i + 0.5) * colW;
    host.innerHTML = '<p class="cm-hl-key">A filled dot means the pin moved forward, bigger for more commits pulled in; a ring means the pin was added, or moved to a commit that isn\'t ahead. Tap a column, or use the arrows, to read the commit.</p>';
    svg = el('svg', { class: 'cm-hist', viewBox: `0 0 ${w} ${H}`, width: w, height: H, role: 'img', 'aria-label': 'Which submodule pins each release commit moved' }, host);
    // selected / hovered column
    const hl = el('rect', { class: 'cm-hl', x: 0, y: top - 4, width: colW, height: repos.length * rowH + 8, rx: 3 }, svg);
    const hv = el('rect', { class: 'cm-hv', x: 0, y: top - 4, width: colW, height: repos.length * rowH + 8, rx: 3 }, svg);
    repos.forEach((name, j) => {
      const y = top + j * rowH + rowH / 2;
      el('line', { class: 'cm-hgrid', x1: labelW + 6, x2: w, y1: y, y2: y }, svg);
      const t = el('text', { class: 'cm-hlabel', x: labelW, y: y + 4 }, svg);
      t.textContent = name;
    });
    // Columns are commits, evenly spaced: months are separators between them, not a time scale.
    const yAxis = top + repos.length * rowH + 14;
    let lastLabel = -1e9;
    history.forEach((c, i) => {
      const prev = history[i - 1];
      if (prev && prev.date.slice(0, 7) === c.date.slice(0, 7)) return;
      const x = cx(i) - colW / 2;
      if (prev) el('line', { class: 'cm-hsep', x1: x, x2: x, y1: top - 6, y2: yAxis - 9 }, svg);
      const [yy, mm] = c.date.split('-').map(Number);
      if (x - lastLabel < 30) return;
      lastLabel = x;
      const t = el('text', { class: 'cm-haxis', x: x + 3, y: yAxis }, svg);
      t.textContent = mm === 1 || !prev ? `${MONTH[mm - 1]} ${String(yy).slice(2)}` : MONTH[mm - 1];
    });
    const note = el('text', { class: 'cm-haxis cm-hnote', x: w, y: yAxis + 15 }, svg);
    note.textContent = 'one column per commit, evenly spaced (not to scale in time)';
    const maxC = Math.max(...history.flatMap((c) => c.moved.map((m) => m.commits || 0)));
    const rMax = Math.min(colW * 0.48, rowH * 0.42), rMin = Math.max(1.6, Math.min(2.6, colW * 0.22));
    history.forEach((c, i) => {
      c.moved.forEach((m) => {
        const j = repos.indexOf(m.repo);
        const y = top + j * rowH + rowH / 2;
        const r = m.commits ? rMin + (rMax - rMin) * Math.sqrt(m.commits / maxC) : rMin + 0.6;
        el('circle', { class: m.commits ? 'cm-dot' : 'cm-dot ring', cx: cx(i), cy: y, r }, svg);
      });
    });
    history.forEach((c, i) => {
      if (/^RoboSub 20\d\d$/.test(c.msg)) {
        const t = el('text', { class: 'cm-hevent', x: cx(i), y: 12 }, svg);
        t.textContent = c.msg;
      }
    });
    const place = (rect, i) => { rect.setAttribute('x', cx(i) - colW / 2); rect.style.display = i === null ? 'none' : ''; };
    place(hl, sel);
    hv.style.display = 'none';
    const pick = (e) => {
      const b = svg.getBoundingClientRect();
      const x = (e.clientX - b.left) * (w / b.width);
      return Math.max(0, Math.min(history.length - 1, Math.floor((x - labelW - 6) / colW)));
    };
    svg.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      hover = pick(e); place(hv, hover); showRead(hover);
    });
    svg.addEventListener('pointerleave', () => { hover = null; hv.style.display = 'none'; showRead(sel); });
    svg.addEventListener('pointerdown', (e) => { sel = pick(e); place(hl, sel); showRead(sel); });
    svg._place = () => place(hl, sel);
  }

  function showRead(i) {
    const c = history[i];
    const moved = c.moved.length
      ? c.moved.map((m) => `<span><code>${brk(m.repo)}</code> ${what(m)}</span>`).join('')
      : '<span>no submodule moved</span>';
    read.innerHTML = `<div class="cm-hist-nav"><button type="button" class="btn" data-d="-1" aria-label="Previous commit"${i === 0 ? ' disabled' : ''}>←</button>
      <button type="button" class="btn" data-d="1" aria-label="Next commit"${i === history.length - 1 ? ' disabled' : ''}>→</button></div>
      <div><b>${esc(c.date)}</b> · “${esc(c.msg)}” · <a href="https://github.com/osu-uwrt/riptide_release/commit/${esc(c.sha)}"><code>${esc(c.sha)}</code></a>
      <div class="cm-moved">${moved}</div></div>`;
    read.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
      sel = Math.max(0, Math.min(history.length - 1, sel + Number(b.dataset.d)));
      svg?._place(); showRead(sel);
    }));
  }
  const sum = document.getElementById('cm-hist-sum');
  if (sum) {
    const sub = data.repos.filter((r) => r.pin).map((r) => r.name);
    const never = sub.filter((n) => !moves[n]);
    const [a, b, c] = repos.slice(0, 3);
    const top = `<code>${a}</code>'s pin moved in ${moves[a]} of them, <code>${b}</code>'s in ${moves[b]} and <code>${c}</code>'s in ${moves[c]}`;
    const once = repos.filter((n) => moves[n] === 1).map((n) => `<code>${n}</code>`);
    const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
    sum.innerHTML = `Of these ${history.length} commits, ${top}. ${once.length ? `${list(once)} changed once; ` : ''}${list(never.map((n) => `<code>${n}</code>`))} not at all. The tags are on the <a href="https://github.com/osu-uwrt/riptide_release/tags">tags page</a>: <code>robosub2026</code> is the newest, and the dated pool-test tags stop in June 2024.`;
  }
  new ResizeObserver(() => { if (Math.abs(host.clientWidth - lastW) > 1) draw(); }).observe(host);
  draw();
  showRead(sel);
}
