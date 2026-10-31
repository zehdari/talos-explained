import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/code-map.css';
import { Graph } from '../viz/graph.js';
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
  document.getElementById('cm-legend').innerHTML = [...Object.keys(LANG_COLOR).filter((l) => used.has(l)), 'other']
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
      sec.innerHTML = `<h3 class="cm-group-label"><button type="button" aria-expanded="${!!open}">${esc(g.label)}<small>${repos.length} repo${repos.length > 1 ? 's' : ''}</small></button></h3>`;
      sec.querySelector('h3 button').onclick = () => { if (open) st.open.delete(g.id); else st.open.add(g.id); render(); };
      if (!open) {
        const peek = document.createElement('button');
        peek.type = 'button';
        peek.className = 'cm-peek';
        peek.innerHTML = repos.map((r) => `<code>${brk(r.name)}</code>`).join(' ');
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
        const pk = r.packages.filter((p) => pkgOk(r, p)).map((p) => {
          const on = st.sel?.repo === r.id && st.sel?.pkg === p.id;
          const hit = st.q && (p.id.toLowerCase().includes(st.q) || text(p).includes(st.q));
          return `<button type="button" class="cm-pkg${on ? ' on' : ''}${p.status === 'legacy' || p.status === 'other' ? ' old' : ''}${p.status === 'new' ? ' new' : ''}${hit ? ' hit' : ''}" data-pkg="${esc(p.id)}" aria-pressed="${on}">${brk(p.id)}${p.status === 'new' ? '<small>new</small>' : ''}</button>`;
        }).join('');
        card.innerHTML = `<button type="button" class="cm-repo-head" aria-pressed="${st.sel?.repo === r.id && !st.sel?.pkg}">
            <span class="cm-name">${brk(r.name)}</span>${branch}${tag}<span class="cm-size">${sizeText(r)}</span>
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
    const card = st.sel && list.querySelector(`.cm-repo[data-repo="${CSS.escape(st.sel.repo)}"]`);
    if (narrow.matches && card) card.after(detail);
    else if (narrow.matches) list.prepend(detail);
    else if (detail.parentElement !== body) body.appendChild(detail);
    detail.classList.toggle('inline', narrow.matches && !!card);
    detail.hidden = narrow.matches && !card;
  }
  narrow.addEventListener('change', placeDetail);

  function overview() {
    const inUse = data.repos.filter((r) => r.status === 'talos');
    const pk = inUse.flatMap((r) => r.packages.filter((p) => p.ros && p.status === 'talos'));
    const lines = inUse.reduce((a, r) => a + (r.code || 0), 0);
    // The team's own ROS code on the robot: the five riptide_* repos (their legacy and undeployed packages left out).
    const own = ['riptide_core', 'riptide_control', 'riptide_perception', 'riptide_autonomy', 'riptide_launch']
      .flatMap((id) => REPO[id].packages.filter((p) => p.status === 'talos')).reduce((a, p) => a + (p.code || 0), 0);
    const k = (n) => `${fmtN(Math.round(n / 1000))}k`;
    return `<p class="cm-hint">Tap a repo or a package.</p>
      <dl class="cm-stats">
        <div><dt>Repos Talos runs or is built from</dt><dd>${inUse.length}</dd></div>
        <div><dt>ROS packages among them</dt><dd>${pk.length}</dd></div>
        <div><dt>Lines of code, all of them (incl. Nereus, firmware, third-party drivers)</dt><dd>${k(lines)}</dd></div>
        <div><dt>In the five <code>riptide_*</code> ROS repos the robot runs</dt><dd>${k(own)}</dd></div>
      </dl>
      <p class="cm-small">Counted from the checkouts on ${esc(data.generated)}; release commit ${esc(data.releaseCommit)} (${esc(data.releaseCommitDate)}). Lines are non-blank lines of tracked source files, comments included; vendored code left out.</p>`;
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
    if (follow && narrow.matches) detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  render();
  showDetail();
  return { select, scroll: () => document.getElementById('explorer-fig').scrollIntoView({ behavior: 'smooth', block: 'start' }) };
})();

// ---------------------------------------------------------------- the stack in layers
{
  const N = (id, label, sub, x, y, ref, nx, ny) => ({ id, label, sub, x, y, ref, nx, ny });
  const nodes = [
    N('viewer', 'nereus-viewer', 'nereus', 300, 57, ['nereus', 'integrations/ros2'], 275, 57),
    N('launcher', 'remote_launch', 'riptide_launch', 640, 57, ['riptide_launch', 'remote_launch'], 95, 57),
    N('mpc', 'riptide_mpc', 'riptide_control', 250, 153, ['riptide_control', 'riptide_mpc'], 90, 153),
    N('bt', 'riptide_autonomy2', 'riptide_autonomy', 640, 153, ['riptide_autonomy', 'riptide_autonomy'], 268, 153),
    N('map', 'riptide_mapping2', 'riptide_perception', 640, 249, ['riptide_perception', 'riptide_mapping'], 268, 249),
    N('ekf', 'EKF (robot_localization)', 'riptide_hardware2', 380, 345, ['riptide_core', 'riptide_hardware'], 125, 345),
    N('det', 'tensor_detector', 'riptide_perception', 780, 345, ['riptide_perception', 'tensor_detector'], 270, 345),
    N('agent', 'micro_ros_agent', 'micro-ros-agent', 110, 441, ['micro-ros-agent', null], 75, 497),
    N('imu', 'riptide_imu', 'riptide_core', 260, 441, ['riptide_core', 'riptide_imu'], 105, 437),
    N('gyro', 'riptide_gyro', 'riptide_core', 405, 441, ['riptide_core', 'riptide_gyro'], 200, 437),
    N('dvl', 'nortek_dvl', 'nortek_dvl', 550, 441, ['nortek_dvl', 'nortek_dvl'], 293, 437),
    N('zed', 'zed_wrapper', 'zed-ros2-wrapper', 760, 441, ['zed-ros2-wrapper', null], 300, 497),
    N('fw', 'titan_firmware', 'RP2040 boards', 300, 537, ['titan_firmware', null], 190, 597),
  ];
  const edges = [
    { from: 'fw', to: 'agent', label: 'CAN', bend: 22 },
    { from: 'agent', to: 'fw', bend: 22 },
    { from: 'agent', to: 'ekf', label: 'depth' },
    { from: 'imu', to: 'ekf' }, { from: 'gyro', to: 'ekf' }, { from: 'dvl', to: 'ekf' },
    { from: 'zed', to: 'det', label: 'images' },
    { from: 'det', to: 'map', label: 'detections' },
    { from: 'ekf', to: 'map', label: 'odometry' },
    { from: 'map', to: 'bt', label: 'prop frames (TF)' },
    { from: 'bt', to: 'mpc', label: 'goals' },
    { from: 'ekf', to: 'mpc', label: 'odometry' },
    { from: 'mpc', to: 'agent', label: 'thrust', bend: 40 },
    { from: 'viewer', to: 'bt', dash: true, label: 'run a tree' },
    { from: 'viewer', to: 'mpc', dash: true },
  ];
  const band = (label, top, h, w) => ({ label, points: [[10, top], [w - 10, top], [w - 10, top + h], [10, top + h]], lx: 18, ly: top + 13 });
  const W = 900, NW = 380;
  const bands = [['OPERATOR', 14], ['AUTONOMY AND CONTROL', 110], ['MAPPING', 206], ['ESTIMATION AND PERCEPTION', 302], ['DRIVERS', 398], ['FIRMWARE', 494]]
    .map(([l, t]) => band(l, t, 76, W));
  // Narrow: the MAPPING and DRIVERS labels move right, clear of the thrust and depth curves on the left.
  const nbands = [band('OPERATOR', 14, 76, NW), band('AUTONOMY AND CONTROL', 110, 76, NW), { ...band('MAPPING', 206, 76, NW), lx: 122 },
    band('ESTIMATION AND PERCEPTION', 302, 76, NW), { ...band('DRIVERS', 398, 136, NW), lx: 262 }, band('FIRMWARE', 554, 76, NW)];
  const narrowNodes = Object.fromEntries(nodes.map((n) => [n.id, { x: n.nx, y: n.ny }]));
  narrowNodes.ekf.label = 'EKF';
  const note = document.getElementById('stack-note');
  let last = null;
  const g = new Graph(document.getElementById('stack-graph'), {
    width: W, height: 590, nodes, edges, bands,
    narrow: {
      below: 640, width: NW, height: 650, bands: nbands, nodes: narrowNodes,
      edges: {
        'mpc>agent': { via: [-45, 330], lx: 42, ly: 296 }, 'fw>agent': { bend: 16 }, 'agent>fw': { bend: 16 },
        'ekf>mpc': { lx: 128, ly: 262 }, 'viewer>mpc': { via: [175, 135] }, 'agent>ekf': { via: [25, 380], lx: 40, ly: 392 },
        'zed>det': { via: [380, 420], lx: 366, ly: 398, anchor: 'end' },
      },
    },
    info: (n) => {
      if (!n || n.id === last) return; // keep the last note, so its links stay reachable
      last = n.id;
      const [rid, pid] = n.ref;
      const r = REPO[rid];
      const p = pid && findPkg(rid, pid);
      const o = p || r;
      const first = (o.desc || '').split(/(?<=\.)\s/)[0];
      const where = p ? `package <code>${brk(p.ros || p.id)}</code> in <code>${brk(r.name)}</code>` : `<code>${brk(r.name)}</code>`;
      const branch = r.branch ? ` (branch <code>${brk(r.branch)}</code>)` : '';
      const ch = chapterLinks((o.chapters || []).slice(0, 2));
      note.innerHTML = `<b>${esc(n.label)}</b>: ${where}${branch}. ${esc(first)} ${ch ? `More in ${ch}.` : ''} <button type="button" class="cm-ref cm-jump">Show in explorer</button>`;
      note.querySelector('.cm-jump').onclick = () => { explorer.select(rid, pid || null, true, true); explorer.scroll(); };
    },
  });
  g.pulse((e) => !e.dash, 2.4);
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

  function draw() {
    const w = host.clientWidth - parseFloat(getComputedStyle(host).paddingLeft) - parseFloat(getComputedStyle(host).paddingRight);
    if (w <= 0) return;
    lastW = host.clientWidth;
    const small = w < 520;
    const labelW = small ? 84 : 150, rowH = small ? 19 : 22, top = 22, bottom = 30;
    const H = top + repos.length * rowH + bottom;
    const colW = (w - labelW - 6) / history.length;
    const cx = (i) => labelW + 6 + (i + 0.5) * colW;
    host.innerHTML = '';
    svg = el('svg', { class: 'cm-hist', viewBox: `0 0 ${w} ${H}`, width: w, height: H, role: 'img', 'aria-label': 'Which submodule pins each release commit moved' }, host);
    // selected / hovered column
    const hl = el('rect', { class: 'cm-hl', x: 0, y: top - 4, width: colW, height: repos.length * rowH + 8, rx: 3 }, svg);
    const hv = el('rect', { class: 'cm-hv', x: 0, y: top - 4, width: colW, height: repos.length * rowH + 8, rx: 3 }, svg);
    repos.forEach((name, j) => {
      const y = top + j * rowH + rowH / 2;
      el('line', { class: 'cm-hgrid', x1: labelW + 6, x2: w, y1: y, y2: y }, svg);
      const t = el('text', { class: 'cm-hlabel', x: labelW, y: y + 4 }, svg);
      t.textContent = small ? name.replace(/^riptide_/, '') : name;
    });
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
    // event labels and the month axis
    const yAxis = top + repos.length * rowH + 16;
    // Month labels where a month starts, skipping crowded ones; the last month is always labelled.
    const gap = small ? 34 : 30;
    const ticks = [];
    history.forEach((c, i) => {
      const prev = history[i - 1];
      if (prev && prev.date.slice(0, 7) === c.date.slice(0, 7)) return;
      const [yy, mm] = c.date.split('-').map(Number);
      const tk = { x: cx(i) - colW / 2, label: mm === 1 || !prev ? `${MONTH[mm - 1]} ${String(yy).slice(2)}` : MONTH[mm - 1] };
      const lastTk = ticks[ticks.length - 1];
      if (!lastTk || tk.x - lastTk.x > gap) ticks.push(tk);
      else if (i === history.findIndex((h) => h.date.slice(0, 7) === history[history.length - 1].date.slice(0, 7)) && ticks.length > 1) ticks[ticks.length - 1] = tk;
    });
    ticks.forEach(({ x, label }) => {
      const t = el('text', { class: 'cm-haxis', x: Math.min(x, w - (small ? 22 : 26)), y: yAxis }, svg);
      t.textContent = label;
      el('line', { class: 'cm-htick', x1: x, x2: x, y1: yAxis - 12, y2: yAxis - 9 }, svg);
    });
    history.forEach((c, i) => {
      if (/^RoboSub 20\d\d$/.test(c.msg)) {
        const t = el('text', { class: 'cm-hevent', x: cx(i), y: 12 }, svg);
        t.textContent = c.msg.replace('RoboSub ', small ? 'RS ' : 'RoboSub ');
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
      ? c.moved.map((m) => `<span><code>${brk(m.repo)}</code> ${m.added ? 'added' : m.commits != null ? `+${m.commits}` : 'moved'}</span>`).join('')
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
