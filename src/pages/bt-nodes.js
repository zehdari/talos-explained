import { setup } from '../layout.js';
import { Graph } from '../viz/graph.js';
import { barChart, el } from '../viz/chart.js';
import '../css/chapter.css';
import '../css/bt-nodes.css';

setup();
const BASE = import.meta.env.BASE_URL;
const GH = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const fmtInt = (n) => n.toLocaleString('en-US');

const GROUP_COLOR = {
  movement: 'var(--state)', perception: 'var(--prediction)', state: 'var(--s7)', ros: 'var(--reference)',
  utility: 'var(--s4)', math: 'var(--s6)', logging: 'var(--s5)',
};
const TAGS = [
  ['controller', 'Controller'], ['mapping', 'Mapping'], ['detector', 'Detector'], ['tf', 'TF'], ['odometry', 'Odometry'],
  ['actuators', 'Actuators'], ['leds', 'LEDs'], ['service', 'Any service'], ['topic', 'Any topic'],
];
const KIND_LABEL = { stateful: 'stateful action', simple: 'simple action', condition: 'condition', decorator: 'decorator' };
const ROS_VERB = { pub: 'publishes', sub: 'subscribes to', client: 'calls service', action: 'sends goals to action', param: 'sets parameter' };
const WHEN = { load: 'made when the tree loads', start: 'made each time it starts', tick: 'made the first time it is ticked' };

// Bars at the container's own width (so the text stays readable on a phone), redrawn when the width changes.
function fitBars(host, rows, opts = {}) {
  let last = 0;
  const draw = () => {
    const w = Math.round(host.clientWidth);
    if (!w || Math.abs(w - last) < 4) return;
    last = w;
    const narrow = w < 520;
    const labelW = Math.min(opts.labelW || 210, Math.round(w * (narrow ? 0.5 : 0.36)));
    const cut = (s) => {
      const max = Math.floor(labelW / 6.6);
      if (s.length <= max) return s;
      // keep whole CamelCase words from both ends: RetryUntil…OrTimeout
      const words = s.match(/[A-Z]?[a-z0-9]+|[A-Z]+(?![a-z])/g) || [s];
      let head = '', tail = '', i = 0, j = words.length - 1;
      while (i <= j) {
        if (head.length + tail.length + words[i].length + 1 <= max) head += words[i++];
        else break;
        if (i <= j && head.length + tail.length + words[j].length + 1 <= max) tail = words[j--] + tail;
      }
      return head && tail ? head + '…' + tail : s.slice(0, max - 1) + '…';
    };
    // minSeg: draw every non-zero segment at least this many pixels wide, so a short bar still shows its colours
    const valueW = opts.valueW || 58;
    let drawn = rows;
    if (opts.minSeg) {
      const most = Math.max(...rows.map((r) => r.segments.reduce((a, g) => a + g.value, 0)));
      const least = (opts.minSeg * most) / (w - labelW - valueW);
      drawn = rows.map((r) => ({ ...r, total: r.total ?? r.segments.reduce((a, g) => a + g.value, 0),
        segments: r.segments.map((g) => (g.value > 0 && g.value < least ? { ...g, value: least, shown: g.value } : g)) }));
    }
    barChart(host, drawn.map((r) => ({ ...r, label: cut(r.label) })), { ...opts, width: w, labelW, valueW, rowH: 25 });
  };
  new ResizeObserver(draw).observe(host);
  draw();
}

function legend(items) {
  return `<div class="legend">${items.map(([c, t]) => `<span><i style="background:${c};height:9px;width:9px;border-radius:2px"></i>${t}</span>`).join('')}</div>`;
}

// ---------- a stateful action's life ----------
function lifeGraph() {
  const host = document.getElementById('life-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const hint = 'Tap a step.';
  const N = (id, x, y, label, info, sub) => ({ id, x, y, label, sub, info });
  const nodes = [
    N('idle', 75, 45, 'IDLE', '<b>IDLE.</b> Before the node is first ticked, and again after it finishes or is halted. Its subscriptions from <code>rosInit</code> stay open the whole time.'),
    N('start', 270, 45, 'onStart()', '<b>onStart.</b> Reads the ports and starts the work: sends a service request or an action goal, notes the start time. Returns RUNNING to carry on, or SUCCESS / FAILURE to finish at once (<code>SetStatus</code>, <code>PublishToController</code> and <code>LatestDetection</code> do).', 'first tick'),
    N('run', 270, 160, 'onRunning()', '<b>onRunning.</b> Called on each later tick, every 30 ms, while the node is RUNNING. It only checks: has the reply come, has the timeout passed? It must return quickly.', 'every later tick'),
    N('done', 465, 160, 'SUCCESS / FAILURE', '<b>Done.</b> The result goes to the parent. The node keeps that status until its parent resets it to IDLE, so the next tick starts it again with <code>onStart</code>.'),
    N('halt', 75, 160, 'onHalted()', '<b>onHalted.</b> A parent stopped it while RUNNING: a ReactiveSequence whose condition flipped, or a cancelled goal. <code>FollowPath</code> cancels its MPC goal here; <code>ContinuousSpin</code> and <code>CenterDetection</code> hold the current heading.', 'parent halts it'),
  ];
  const edges = [
    { from: 'idle', to: 'start' }, { from: 'start', to: 'run', label: 'RUNNING', lx: 262, ly: 106, anchor: 'end' },
    { from: 'run', to: 'done' }, { from: 'start', to: 'done' }, { from: 'run', to: 'halt', label: 'halted' }, { from: 'halt', to: 'idle' },
  ];
  const narrow = {
    below: 470, width: 360, height: 300,
    nodes: { idle: { x: 70, y: 40 }, start: { x: 240, y: 40 }, run: { x: 240, y: 150 }, done: { x: 240, y: 260 }, halt: { x: 70, y: 150 } },
    edges: { 'start>done': { via: [345, 150] }, 'start>run': { lx: 250, ly: 98 } },
  };
  new Graph(host, { width: 540, height: 200, nodes, edges, narrow, info: (n) => { note.innerHTML = n ? n.info : hint; } });
  host.appendChild(note);
  note.textContent = hint;
}

// ---------- endpoints opened at load ----------
function loadChart(cat) {
  const host = document.getElementById('load-chart');
  const KINDS = [['sub', 'var(--state)', 'subscriptions'], ['pub', 'var(--reference)', 'publishers'], ['client', 'var(--prediction)', 'service clients'], ['action', 'var(--s7)', 'action clients']];
  const rows = [];
  for (const n of cat.nodes) {
    const k = n.use.instances;
    if (!k) continue;
    const per = { sub: 0, pub: 0, client: 0, action: 0 };
    n.ros.filter((r) => r.when === 'load' && per[r.kind] !== undefined).forEach((r) => per[r.kind]++);
    const total = Object.values(per).reduce((a, b) => a + b, 0) * k;
    if (!total) continue;
    rows.push({ label: n.id, total, segments: KINDS.map(([kind, color, name]) => ({ value: per[kind] * k, color, name: `${n.id}: ${name} (${k} × ${per[kind]})` })) });
  }
  rows.sort((a, b) => b.total - a.total);
  const o = cat.comp.openedAtLoad;
  const box = document.createElement('div');
  host.innerHTML = `${legend(KINDS.map(([, c, t]) => [c, t]))}<div class="btn-note">In all: <b>${fmtInt(o.sub || 0)}</b> subscriptions, <b>${fmtInt(o.pub || 0)}</b> publishers, <b>${o.client || 0}</b> service clients, <b>${o.action || 0}</b> action clients.</div>`;
  host.appendChild(box);
  fitBars(box, rows, { digits: 0, labelW: 190, minSeg: 5 });
}

// ---------- registration ----------
function regGraph() {
  const host = document.getElementById('reg-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const hint = 'Tap a step.';
  const build = { stroke: 'var(--accent)' };
  const N = (id, x, y, label, sub, info, extra = {}) => ({ id, x, y, label, sub, info, ...extra });
  const nodes = [
    N('hdr', 95, 45, 'FollowPath.btaction.hpp', 'one header per node', '<b>The header.</b> The class, its <code>providedPorts()</code>, <code>rosInit</code> and the tick functions, all in one file under <code>include/riptide_autonomy/bt_actions/</code>. The file name, up to its first dot, must match the class.', build),
    N('gen', 290, 45, 'generate_registrators', 'CMake configure', '<b>The generator.</b> CMake runs <code>btassistant.py generate_registrators</code> while configuring. It globs the three header folders and the <code>*.simple.cpp</code> files and fills a template. A header added later is only picked up when CMake configures again.', build),
    N('cpp', 480, 45, 'registerActions.cpp', 'generated', '<b>The generated source.</b> One <code>factory.registerNodeType&lt;X&gt;("X")</code> per header, and <code>bulkRegisterSimpleActions(factory)</code> for the simple actions, inside <code>BT_REGISTER_NODES</code>. Conditions and decorators get their own files.', build),
    N('so', 670, 45, 'libautonomy_actions.so', 'colcon build', '<b>The plugin.</b> Each generated file compiles into a shared library with the node classes and <code>autonomy_utils</code>. It is installed to <code>install/riptide_autonomy2/lib</code>.', build),
    N('fac', 670, 150, "doTask's factory", 'at start-up', '<b>The factory.</b> When <code>doTask</code> starts, <code>registerPluginsForFactory</code> loads the three plugins from the package\'s lib folder, then any listed in the <code>ext_plugin_list</code> parameter.'),
    N('xml', 290, 150, 'Tree XML', 'read per goal', '<b>The tree.</b> <code>&lt;Action ID="FollowPath" … /&gt;</code> refers to the node by its registered name. The file is read when a goal arrives, so editing it needs no rebuild.'),
    N('inst', 480, 150, 'Node instances', 'createTreeFromFile', '<b>The instances.</b> The factory builds one object per node in the XML, every subtree again wherever it is used: 11,993 for the competition tree.'),
    N('ros', 480, 235, 'rosInit()', 'initRosForTree', '<b>rosInit.</b> <code>initRosForTree</code> hands each node the ROS node and calls its <code>rosInit</code>, where it makes the publishers, subscriptions and clients it needs for the whole run. Before this, a node that touched ROS would crash.'),
  ];
  const edges = [
    { from: 'hdr', to: 'gen' }, { from: 'gen', to: 'cpp' }, { from: 'cpp', to: 'so' }, { from: 'so', to: 'fac' },
    { from: 'fac', to: 'inst' }, { from: 'xml', to: 'inst' }, { from: 'inst', to: 'ros' },
  ];
  const narrow = {
    below: 640, width: 380, height: 470,
    nodes: { hdr: { x: 110, y: 30 }, gen: { x: 110, y: 95 }, cpp: { x: 110, y: 160 }, so: { x: 110, y: 225 }, fac: { x: 110, y: 300 }, xml: { x: 285, y: 300 }, inst: { x: 200, y: 375 }, ros: { x: 200, y: 440 } },
  };
  new Graph(host, { width: 800, height: 270, nodes, edges, narrow, info: (n) => { note.innerHTML = n ? n.info : hint; } });
  host.appendChild(note);
  note.textContent = hint;
}

// ---------- the catalogue ----------
function catalogue(cat) {
  const host = document.getElementById('cat-panel');
  const groups = cat.groups;
  const maxInst = Math.max(...cat.nodes.map((n) => n.use.instances));
  const state = { q: '', group: null, tag: null, comp: false, sel: null };
  host.innerHTML = `
    <div class="cat-controls">
      <input type="search" class="cat-search" placeholder="Search a node, port or topic" aria-label="Search the nodes">
      <div class="chips cat-groups" role="group" aria-label="Group"></div>
      <div class="chips cat-tags" role="group" aria-label="Talks to"><span class="chips-label">Talks to</span></div>
      <label class="cat-comp"><input type="checkbox"> Only nodes the competition tree uses</label>
    </div>
    <div class="cat-body">
      <div class="cat-list" role="list"></div>
      <div class="cat-detail" aria-live="polite"></div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const list = $('.cat-list'), detail = $('.cat-detail');
  const gWrap = $('.cat-groups'), tWrap = $('.cat-tags');
  const chip = (wrap, label, color, onClick) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.innerHTML = `${color ? `<i style="background:${color}"></i>` : ''}${label}`;
    b.setAttribute('aria-pressed', 'false');
    b.onclick = onClick;
    wrap.appendChild(b);
    return b;
  };
  const gBtns = [chip(gWrap, 'All', null, () => setGroup(null)), ...groups.map((g) => chip(gWrap, g.label, GROUP_COLOR[g.id], () => setGroup(g.id)))];
  const tBtns = TAGS.map(([id, label]) => chip(tWrap, label, null, () => { state.tag = state.tag === id ? null : id; render(); }));
  function setGroup(id) { state.group = id; render(); }
  $('.cat-search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
  $('.cat-comp input').addEventListener('change', (e) => { state.comp = e.target.checked; render(); });

  const hay = (n) => [n.id, n.summary, ...n.ports.map((p) => p.name), ...n.ros.map((r) => r.name), ...Object.values(n.use.values).flat().map((v) => v[0])].join(' ').toLowerCase();
  const HAY = new Map(cat.nodes.map((n) => [n.id, hay(n)]));
  const wide = () => host.clientWidth >= 860;

  function rowHTML(n) {
    const k = n.use.instances;
    const w = k ? Math.max(4, (Math.log10(k + 1) / Math.log10(maxInst + 1)) * 100) : 0;
    return `<button type="button" class="cat-row" data-id="${n.id}" aria-expanded="false" style="--g:${GROUP_COLOR[n.group]}">
      <span class="cat-name"><span class="cn"><i></i><code>${n.id}</code></span><span class="cat-kind">${n.kind}</span>${n.legacy ? '<em class="tag-legacy">legacy</em>' : ''}</span>
      <span class="cat-use" title="${k} instances in the competition tree; used by ${n.use.files.length} tree files"><span class="cat-bar"><span style="width:${w}%"></span></span><b>${k ? fmtInt(k) : '–'}</b><small>${n.use.files.length} files</small></span>
      <span class="cat-sum">${esc(n.summary)}</span>
    </button>`;
  }

  function detailHTML(n) {
    const u = n.use;
    const ports = n.ports.map((p) => `<li><div class="pt-head"><code>${p.name}</code><span class="pt-dir ${p.dir}">${p.dir === 'in' ? 'in' : 'out'}</span><span class="pt-type">${esc(p.type.replace('std::string', 'string'))}</span>${p.dir === 'in' ? `<span class="pt-def">default <b>${esc(p.default ?? '–')}</b></span>${p.required ? '<span class="pt-req" title="Logs a warning if unset">warns if unset</span>' : ''}` : ''}</div>${p.desc ? `<div class="pt-desc">${esc(p.desc)}</div>` : ''}</li>`).join('');
    const ros = n.ros.map((r) => `<li>${ROS_VERB[r.kind]} <code>${esc(r.name)}</code> <span class="muted">(${esc(r.type)}; ${WHEN[r.when] || ''})</span></li>`).join('')
      + (n.tf ? '<li>looks up transforms in TF</li>' : '');
    const vals = Object.entries(u.values).filter(([, vs]) => vs.some(([v]) => v !== '' && v !== '(set while running)'));
    const valHTML = vals.map(([port, vs]) => `<li><code>${port}</code> ${vs.filter(([v]) => v !== '').map(([v, c]) => `<span class="val${v === '(set while running)' ? ' rt' : ''}" title="${c} instance${c > 1 ? 's' : ''}">${esc(v.length > 70 ? v.slice(0, 68) + '…' : v)}</span>`).join(' ')}</li>`).join('');
    const subs = u.subtrees.slice(0, 8).map(([s, c]) => `<code>${s}</code>${c > 1 ? ` ×${c}` : ''}`).join(', ') + (u.subtrees.length > 8 ? `, and ${u.subtrees.length - 8} more` : '');
    const groot = n.groot.workspace ? '' : `<p class="muted small">Not yet declared in <code>trees/.groot/workspace.xml</code>; the tree files declare it.</p>`;
    const watch = (n.watch || []).map((w) => `<li>${w.replace('{n}', fmtInt(u.instances))}</li>`).join('');
    return `<div class="cd-head" style="--g:${GROUP_COLOR[n.group]}"><h3><code>${n.id}</code></h3>
        <div class="cd-meta"><i></i>${groups.find((g) => g.id === n.group).label} · ${KIND_LABEL[n.base]}${n.legacy ? ' · <em class="tag-legacy">legacy</em>' : ''}</div></div>
      <p class="cd-sum">${esc(n.summary)}</p>
      <ul class="cd-what">${(n.what || []).map((w) => `<li>${w}</li>`).join('')}</ul>
      ${watch ? `<div class="callout cd-watch"><span class="label">Watch</span><ul>${watch}</ul></div>` : ''}
      <h4>Ports</h4>${n.ports.length ? `<ul class="cd-ports">${ports}</ul>` : '<p class="muted small">None.</p>'}
      ${ros ? `<h4>ROS</h4><ul class="cd-ros">${ros}</ul>` : ''}
      <h4>In the competition tree</h4>
      ${u.instances ? `<p class="small"><b>${fmtInt(u.instances)}</b> instance${u.instances > 1 ? 's' : ''} from ${u.places} place${u.places > 1 ? 's' : ''} in ${u.subtrees.length} subtree${u.subtrees.length > 1 ? 's' : ''}: ${subs}.</p>
        ${valHTML ? `<p class="small muted">Values it is given (literal, or <span class="val rt">set while running</span>):</p><ul class="cd-vals">${valHTML}</ul>` : ''}`
        : `<p class="small">Not used.${u.files.length ? ` Used by ${u.files.length} other tree file${u.files.length > 1 ? 's' : ''}: ${u.files.slice(0, 5).map((f) => `<code>${f.replace('.xml', '')}</code>`).join(', ')}${u.files.length > 5 ? '…' : ''}.` : ' No tree file uses it.'}</p>`}
      ${groot}
      <p class="cd-links"><a href="${n.url}">${n.base === 'simple' ? 'Its function' : 'Its header'} on GitHub</a> · <a href="${n.portsUrl}">ports</a></p>`;
  }

  function show(id, scroll) {
    state.sel = id;
    list.querySelectorAll('.cat-row').forEach((r) => {
      const on = r.dataset.id === id;
      r.classList.toggle('on', on);
      r.setAttribute('aria-expanded', String(on));
    });
    const n = cat.nodes.find((x) => x.id === id);
    if (!n) { detail.innerHTML = '<p class="muted small cd-empty">Tap a node to see its ports, defaults and ROS interfaces.</p>'; placeDetail(); return; }
    detail.innerHTML = detailHTML(n);
    placeDetail();
    if (scroll && !wide()) {
      const row = list.querySelector(`.cat-row[data-id="${id}"]`);
      if (row) {
        // the group's header sticks to the top of the list: keep the row below it
        const g = row.parentElement.querySelector('.cat-group');
        list.scrollTop += row.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop - (g ? g.offsetHeight : 0);
      }
    }
  }
  // Wide: list and detail side by side. Narrow: the detail opens under the tapped row.
  function placeDetail() {
    const row = state.sel && list.querySelector(`.cat-row[data-id="${state.sel}"]`);
    if (wide()) {
      if (detail.parentElement !== $('.cat-body')) $('.cat-body').appendChild(detail);
      detail.classList.remove('inline');
    } else if (row) {
      row.after(detail);
      detail.classList.add('inline');
    } else {
      $('.cat-body').appendChild(detail);
      detail.classList.add('inline');
    }
    host.classList.toggle('narrow', !wide());
  }

  function render() {
    gBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 && !state.group) || (i > 0 && groups[i - 1].id === state.group))));
    tBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(TAGS[i][0] === state.tag)));
    const shown = cat.nodes.filter((n) => (!state.group || n.group === state.group) && (!state.tag || (n.tags || []).includes(state.tag))
      && (!state.comp || n.use.instances) && (!state.q || HAY.get(n.id).includes(state.q)));
    let html = '';
    for (const g of groups) {
      const ns = shown.filter((n) => n.group === g.id);
      if (!ns.length) continue;
      // one section per group, so each sticky header only sticks within its own group
      html += `<div class="cat-sec"><div class="cat-group" style="--g:${GROUP_COLOR[g.id]}"><span>${g.label}</span><small>${g.blurb}</small></div>${ns.map(rowHTML).join('')}</div>`;
    }
    if (list.contains(detail)) $('.cat-body').appendChild(detail);
    list.innerHTML = html || '<p class="muted small cd-empty">No node matches.</p>';
    list.querySelectorAll('.cat-row').forEach((r) => (r.onclick = () => show(state.sel === r.dataset.id && !wide() ? null : r.dataset.id, true)));
    const keep = shown.some((n) => n.id === state.sel) ? state.sel : (wide() ? shown[0]?.id : null);
    show(keep);
  }
  let wasWide = null;
  new ResizeObserver(() => { const w = wide(); if (w !== wasWide) { wasWide = w; if (w && !state.sel) render(); else placeDetail(); } }).observe(host);
  // deep link: #node-FollowPath
  const m = location.hash.match(/^#node-(\w+)/);
  render();
  if (m && cat.nodes.some((n) => n.id === m[1])) { show(m[1], true); host.scrollIntoView(); }
  else if (wide()) show('FollowPath');
}

// ---------- AddWaypoint / AddArc, ported from SimpleActions.simple.cpp ----------
// C++ ostream with setprecision(10): up to 10 significant digits, trailing zeros dropped, %g-style exponents.
function num(v) {
  if (Object.is(v, -0)) return '-0';
  if (v === 0) return '0';
  const p = Number(v.toPrecision(10));
  const e = Math.floor(Math.log10(Math.abs(p)));
  if (e < -4 || e >= 10) return p.toExponential(9).replace(/\.?0+e/, 'e').replace(/e([+-])(\d)$/, 'e$10$2');
  return String(p);
}
const opt = (v, d) => (v === undefined || v === '' ? d : v);

function beginWaypoint(p) {
  const path = p.path || '';
  let out = path;
  if (path && !path.endsWith(';')) out += ';';
  if (path) out += ' ';
  if (p.frame) out += `${p.frame}: `;
  return out;
}
function appendHeading(p, look, extraYawOffset = 0, spinScale = 1) {
  const lookFrame = p.look_frame || '';
  const heading = opt(p.heading, lookFrame ? 'look_at' : 'waypoint');
  let s = '';
  if (heading !== 'waypoint') s += ` | heading=${heading}`;
  if (heading === 'look_at') {
    const at = lookFrame ? [0, 0, 0] : look;
    s += ` | look_at=${num(opt(p.look_x, at[0]))},${num(opt(p.look_y, at[1]))},${num(opt(p.look_z, at[2]))}`;
    if (lookFrame) s += ` | look_frame=${lookFrame}`;
  }
  const yawOffset = opt(p.yaw_offset, 0) + extraYawOffset, spin = opt(p.spin, 0) * spinScale;
  if (yawOffset !== 0) s += ` | yaw_offset=${num(yawOffset)}`;
  if (spin !== 0) s += ` | spin=${num(spin)}`;
  if (opt(p.spin_rate, 0) !== 0) s += ` | spin_rate=${num(p.spin_rate)}`;
  if (p.yaw_frame) s += ` | yaw_frame=${p.yaw_frame}`;
  return s;
}
function addWaypoint(p) {
  const roll = opt(p.roll, 0), pitch = opt(p.pitch, 0);
  let w = beginWaypoint(p) + `${num(p.x)},${num(p.y)},${num(p.z)},`;
  if (roll !== 0 || pitch !== 0) w += `${num(roll)},${num(pitch)},`;
  return w + num(opt(p.yaw, 0)) + appendHeading(p, [0, 0, 0]) + ';';
}
function addArc(p) {
  const { cx, cy, radius, z } = p, start = p.start_angle, sweep = p.sweep;
  const endRadius = opt(p.end_radius, radius), yaw = opt(p.yaw, 0), approach = p.approach !== false;
  const look = [cx, cy, z], pan = opt(p.pan, 0), panStep = opt(p.pan_step, 0.25);
  const pieces = pan !== 0 ? 2 * Math.max(1, Math.ceil(Math.abs(sweep) / (2 * panStep) - 1e-9)) : 1;
  let a = beginWaypoint(p);
  if (approach) {
    a += `${num(cx + radius * Math.cos(start))},${num(cy + radius * Math.sin(start))},${num(z)},${num(yaw)}` + appendHeading(p, look) + '; ';
    if (p.frame) a += `${p.frame}: `;
  }
  for (let k = 0; k < pieces; k++) {
    if (k > 0) a += ' ' + (p.frame ? `${p.frame}: ` : '');
    const f = (k + 1) / pieces, angle = start + sweep * f, r = radius + (endRadius - radius) * f;
    a += `${num(cx + r * Math.cos(angle))},${num(cy + r * Math.sin(angle))},${num(z)},${num(yaw)} | arc=${num(cx)},${num(cy)},${num(sweep / pieces)}`;
    a += appendHeading(p, look, pan === 0 ? 0 : (k % 2 === 0 ? pan : -pan), 1 / pieces) + ';';
  }
  return a;
}
// FollowPath's reading of the string (frame prefix, numbers, "| key=value" options)
function parsePath(text) {
  const out = [];
  for (let item of text.split(';')) {
    if (!item.trim()) continue;
    let frame = '';
    const colon = item.indexOf(':');
    if (colon >= 0) { frame = item.slice(0, colon).trim(); item = item.slice(colon + 1); }
    const [nums, ...opts] = item.split('|');
    const v = nums.split(',').filter((s) => s.trim()).map(Number);
    const o = {};
    for (const s of opts) { const [k, val] = s.split('='); o[k.trim()] = (val || '').trim(); }
    out.push({ frame, x: v[0], y: v[1], z: v[2], yaw: v[v.length - 1], o, text: (frame ? `${frame}: ` : '') + item.trim() + ';' });
  }
  return out;
}

function pathBuilder() {
  const host = document.getElementById('path-builder');
  const st = { mode: 'sweep', dist: 2, sweep: 0.5, pan: 0.5, panStep: 0.25, step: 0.25, outer: 2 };
  host.innerHTML = `<div class="controls pb-controls">
      <span class="seg" role="group" aria-label="Path"><button type="button" data-mode="sweep" aria-pressed="true">Sweep</button><button type="button" data-mode="spiral" aria-pressed="false">Spiral</button></span>
      <span class="pb-sweep">
        <label>distance <input type="range" min="1" max="3" step="0.1" data-k="dist"><output></output></label>
        <label>sweep <input type="range" min="0.2" max="1.2" step="0.05" data-k="sweep"><output></output></label>
        <label>pan <input type="range" min="0" max="0.8" step="0.05" data-k="pan"><output></output></label>
        <label>pan_step <span class="seg"><button type="button" data-ps="0.25">0.25</button><button type="button" data-ps="0.5">0.5</button></span></label>
      </span>
      <span class="pb-spiral" hidden>
        <label>spacing <input type="range" min="0.15" max="0.5" step="0.05" data-k="step"><output></output></label>
        <label>out to <input type="range" min="1" max="3" step="0.25" data-k="outer"><output></output></label>
      </span>
    </div>
    <div class="pb-body"><div class="pb-svg"></div><div class="pb-text"><div class="pb-nodes"></div><ol class="pb-lines"></ol></div></div>`;
  const svgHost = host.querySelector('.pb-svg'), lines = host.querySelector('.pb-lines'), nodesBox = host.querySelector('.pb-nodes');
  let sel = null;
  host.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; sel = null; draw(); }));
  host.querySelectorAll('[data-ps]').forEach((b) => (b.onclick = () => { st.panStep = +b.dataset.ps; draw(); }));
  host.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.value = st[inp.dataset.k];
    inp.oninput = () => { st[inp.dataset.k] = +inp.value; draw(); };
  });

  function build() {
    if (st.mode === 'sweep') {
      const f = 'torpedo_frame', common = { frame: f, look_frame: f, cx: 0, cy: 0, radius: st.dist, z: 0, approach: false, pan: st.pan, pan_step: st.panStep };
      let path = addWaypoint({ frame: f, look_frame: f, x: st.dist, y: 0, z: 0 });
      const calls = [`AddWaypoint frame=${f} look_frame=${f} x=${num(st.dist)}`];
      path = addArc({ ...common, path, start_angle: 0, sweep: st.sweep });
      calls.push(`AddArc start_angle=0 sweep=${num(st.sweep)}`);
      path = addArc({ ...common, path, start_angle: st.sweep, sweep: -2 * st.sweep });
      calls.push(`AddArc start_angle=${num(st.sweep)} sweep=${num(-2 * st.sweep)}`);
      path = addArc({ ...common, path, start_angle: -st.sweep, sweep: st.sweep });
      calls.push(`AddArc start_angle=${num(-st.sweep)} sweep=${num(st.sweep)}`);
      return { path, calls, frame: f };
    }
    const f = 'bandage_frame', turns = (st.outer - st.step) / st.step;
    const path = addArc({ frame: f, cx: 0, cy: 0, radius: st.step, end_radius: st.outer, start_angle: 0, sweep: turns * 6.283185, z: 0, yaw: 0, yaw_frame: 'world' });
    return { path, calls: [`AddArc radius=${num(st.step)} end_radius=${num(st.outer)} sweep=${num(turns * 6.283185)} (${num(+turns.toFixed(3))} turns) yaw_frame=world`], frame: f };
  }

  function draw() {
    host.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    host.querySelectorAll('[data-ps]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ps === st.panStep)));
    host.querySelector('.pb-sweep').hidden = st.mode !== 'sweep';
    host.querySelector('.pb-spiral').hidden = st.mode !== 'spiral';
    host.querySelectorAll('input[data-k]').forEach((inp) => (inp.nextElementSibling.textContent = `${(+inp.value).toFixed(2)}${inp.dataset.k === 'dist' || inp.dataset.k === 'step' || inp.dataset.k === 'outer' ? ' m' : ' rad'}`));
    const { path, calls, frame } = build();
    const pts = parsePath(path);
    nodesBox.innerHTML = `<div class="small muted">Nodes: ${calls.map((c) => `<code>${esc(c)}</code>`).join(' → ')} → <code>FollowPath</code></div>`;
    lines.innerHTML = pts.map((p, i) => `<li data-i="${i}"${sel === i ? ' class="on"' : ''}>${esc(p.text)}</li>`).join('');
    lines.querySelectorAll('li').forEach((li) => (li.onclick = () => { sel = sel === +li.dataset.i ? null : +li.dataset.i; draw(); }));

    // geometry: sample each piece from the previous point, as the MPC would read it
    const pieces = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], prev = pts[i - 1];
      const samples = [];
      if (!prev) { samples.push([p.x, p.y]); pieces.push({ i, samples, start: true }); continue; }
      if (p.o.arc) {
        const [cx, cy, sw] = p.o.arc.split(',').map(Number);
        const a0 = Math.atan2(prev.y - cy, prev.x - cx), r0 = Math.hypot(prev.x - cx, prev.y - cy), r1 = Math.hypot(p.x - cx, p.y - cy);
        const n = Math.max(8, Math.ceil(Math.abs(sw) * 12));
        for (let k = 0; k <= n; k++) { const u = k / n; samples.push([cx + (r0 + (r1 - r0) * u) * Math.cos(a0 + sw * u), cy + (r0 + (r1 - r0) * u) * Math.sin(a0 + sw * u)]); }
      } else samples.push([prev.x, prev.y], [p.x, p.y]);
      pieces.push({ i, samples });
    }
    const all = pieces.flatMap((q) => q.samples).concat([[0, 0]]);
    const xs = all.map((q) => q[0]), ys = all.map((q) => q[1]);
    const pad = 0.55;
    let x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    const W = Math.round(Math.min(560, Math.max(300, svgHost.clientWidth || 520))), H = Math.round(W * 0.66), s = Math.min(W / (x1 - x0), H / (y1 - y0));
    const ox = (W - (x1 - x0) * s) / 2, oy = (H - (y1 - y0) * s) / 2;
    const X = (x) => ox + (x - x0) * s, Y = (y) => H - oy - (y - y0) * s; // y up on the screen: counterclockwise as seen from above
    svgHost.innerHTML = '';
    const svg = el('svg', { class: 'chart pb', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Top-down sketch of the path' }, svgHost);
    // grid (1 m)
    const g = el('g', { class: 'pb-grid' }, svg);
    for (let x = Math.ceil(x0); x <= x1; x++) el('line', { x1: X(x), x2: X(x), y1: 0, y2: H }, g);
    for (let y = Math.ceil(y0); y <= y1; y++) el('line', { y1: Y(y), y2: Y(y), x1: 0, x2: W }, g);
    // the object's frame
    el('rect', { x: X(0) - 9, y: Y(0) - 9, width: 18, height: 18, rx: 3, class: 'pb-obj' }, svg);
    el('line', { x1: X(0), y1: Y(0), x2: X(0.75), y2: Y(0), class: 'pb-axis', 'marker-end': 'url(#pb-arrow)' }, svg);
    const defs = el('defs', {}, svg);
    for (const [id, c] of [['pb-arrow', 'var(--ink-2)'], ['pb-head', 'var(--ink)'], ['pb-head-hot', 'var(--accent)']]) {
      const mk = el('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, defs);
      el('path', { d: 'M0,1 L9,5 L0,9 z', fill: c }, mk);
    }
    const key = el('g', { class: 'pb-key' }, svg);
    el('rect', { x: 12, y: 12, width: 12, height: 12, rx: 2, class: 'pb-obj' }, key);
    el('text', { x: 31, y: 22, class: 'pb-label' }, key).textContent = `${frame}; arrow: its +x, the front`;
    // pieces
    pieces.forEach((q) => {
      const on = sel === q.i;
      if (q.start) {
        const c = el('circle', { cx: X(q.samples[0][0]), cy: Y(q.samples[0][1]), r: on ? 7 : 5.5, class: `pb-start${on ? ' on' : ''}` }, svg);
        c.addEventListener('pointerdown', () => { sel = sel === q.i ? null : q.i; draw(); });
        return;
      }
      const d = q.samples.map((p, k) => `${k ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
      el('path', { d, class: `pb-path${on ? ' on' : ''}` }, svg);
      const hit = el('path', { d, class: 'pb-hit' }, svg);
      hit.addEventListener('pointerdown', () => { sel = sel === q.i ? null : q.i; draw(); });
      // heading the piece asks for, at a few points along it
      const p = pts[q.i];
      const marks = st.mode === 'spiral' ? [0.15, 0.35, 0.55, 0.75, 0.95].map((u) => q.samples[Math.round(u * (q.samples.length - 1))]) : [q.samples[Math.floor(q.samples.length / 2)]];
      for (const m of marks) {
        let yaw = p.yaw;
        if (p.o.heading === 'look_at') {
          const [lx, ly] = (p.o.look_at || '0,0,0').split(',').map(Number);
          yaw = Math.atan2(ly - m[1], lx - m[0]) + (+p.o.yaw_offset || 0);
        }
        const L = 0.42;
        el('line', { x1: X(m[0]), y1: Y(m[1]), x2: X(m[0] + L * Math.cos(yaw)), y2: Y(m[1] + L * Math.sin(yaw)), class: `pb-yaw${on ? ' on' : ''}`, 'marker-end': `url(#${on ? 'pb-head-hot' : 'pb-head'})` }, svg);
      }
    });
    const scale = el('g', { class: 'pb-scale' }, svg);
    el('line', { x1: 14, x2: 14 + s, y1: H - 14, y2: H - 14 }, scale);
    el('text', { x: 14 + s / 2, y: H - 20, 'text-anchor': 'middle' }, scale).textContent = '1 m';
  }
  draw();
  let lastW = 0;
  new ResizeObserver(() => { const w = svgHost.clientWidth; if (Math.abs(w - lastW) > 8) { lastW = w; draw(); } }).observe(svgHost);
}

// ---------- what the generic nodes call ----------
const SERVED = [
  [/^command\/actuator\/(torpedo|dropper|notify_reload|arm)$/, '<code>actuator_service_translator.py</code>, then the actuator board'],
  [/^command\/actuator\/claw_move_s$/, 'Nereus\'s claw (a timed move). No firmware in <code>titan_firmware</code> listens to it; the robot\'s actuator board takes <code>command/actuator/claw</code>. Check before relying on it in the pool.'],
  [/^set_camera_is_dfc$|^set_table_pair_enabled$|^set_slalom_type$/, 'the detector (<code>yolo_orientation.py</code>)'],
  [/mapping\/fit_bin_geometry$/, 'mapping (<code>bin_geometry.py</code>)'],
  [/mapping\//, 'mapping (<code>mapping.py</code>)'],
  [/acoustics\//, '<code>riptide_acoustics</code>'],
  [/^state\/kill$/, 'the power and actuator board (Nereus in sim)'],
  [/^vectornav\/imu$/, '<code>riptide_imu</code>'],
  [/^controller\/scale\/trust$/, 'the MPC'],
  [/^controller\/stunt_state$/, 'nothing: the old controller'],
];
function callsTable(cat) {
  const rows = new Map();
  for (const n of cat.nodes) {
    for (const port of ['srv_name', 'topic']) {
      for (const [v] of n.use.values[port] || []) {
        if (!v || v.startsWith('(') || v.startsWith('{')) continue;
        const by = (SERVED.find(([re]) => re.test(v)) || [0, '?'])[1];
        const r = rows.get(by) || { by, names: new Map(), nodes: new Set() };
        r.names.set(v, port === 'srv_name' ? 'service' : 'topic');
        r.nodes.add(n.id);
        rows.set(by, r);
      }
    }
  }
  const order = SERVED.map(([, by]) => by);
  const list = [...rows.values()].sort((a, b) => order.indexOf(a.by) - order.indexOf(b.by));
  document.getElementById('calls-table').innerHTML = `<table class="params bt-calls"><thead><tr><th>Name</th><th>Answered by</th></tr></thead><tbody>
    ${list.map((r) => `<tr><td>${[...r.names].sort().map(([v, kind]) => `<code>${esc(v)}</code> <small>${kind}</small>`).join('<br>')}</td><td>${r.by}<small>via ${[...r.nodes].map((x) => `<code>${x}</code>`).join(', ')}</small></td></tr>`).join('')}</tbody></table>`;
}

// ---------- LED status ----------
function ledTable(cat) {
  const used = Object.fromEntries((cat.nodes.find((n) => n.id === 'SetStatus').use.values.status || []).map(([v, c]) => [v, c]));
  // SetStatus.btaction.hpp (colours, modes) and the README's meanings
  const L = [
    ['waiting', [255, 0, 0], 'solid', 'Waiting for the kill switch'],
    ['starting', [0, 0, 255], 'slow', 'Kill switch in, starting the run'],
    ['moving', [0, 255, 0], 'solid', 'Moving to the next task'],
    ['searching', [255, 100, 0], 'solid', 'Searching for the next task'],
    ['aligning', [255, 0, 255], 'slow', 'Lining up with a task'],
    ['performing', [0, 0, 255], 'fast', 'Doing a task'],
    ['success', [0, 255, 0], 'breath', 'Tree ended in SUCCESS'],
    ['failure', [255, 0, 0], 'breath', 'Tree ended in FAILURE'],
    ['panic', [255, 0, 0], 'fast', 'Tree crashed'],
    ['undefined', [255, 255, 255], 'solid', 'Unknown status name'],
  ];
  const MODE = { solid: 'solid', slow: 'slow flash', fast: 'fast flash', breath: 'breathing' };
  const by = { success: 'doTask, when a tree succeeds', failure: 'doTask, when a tree fails', panic: 'doTask, when a tree crashes' };
  document.getElementById('led-table').innerHTML = `<table class="params bt-leds"><thead><tr><th>Status</th><th>Light</th><th>Meaning</th><th>Set by</th></tr></thead><tbody>
    ${L.map(([name, rgb, mode, meaning]) => `<tr><td><code>${name}</code></td><td><span class="led ${mode}" style="--led:rgb(${rgb.join(',')})"></span>${MODE[mode]}</td><td>${meaning}</td><td>${used[name] ? `${used[name]} instance${used[name] > 1 ? 's' : ''}` : (by[name] || '–')}</td></tr>`).join('')}</tbody></table>`;
}

// ---------- one mission's time ----------
function timeChart(cat, mt) {
  const host = document.getElementById('time-chart');
  const custom = mt.rows.filter((r) => r.custom && r.secs >= 0.5);
  const other = mt.rows.filter((r) => !r.custom).reduce((a, r) => a + r.secs, 0);
  const total = mt.end - mt.start;
  const rows = custom.map((r) => ({ label: r.id, segments: [{ value: r.secs, color: GROUP_COLOR[r.group], name: `${r.id}: ${(100 * r.secs / total).toFixed(1)} % of the run, ${r.starts} times on top` }] }));
  rows.push({ label: 'built-in nodes', segments: [{ value: other, color: 'var(--muted)', name: 'Built-in control nodes on top (Sequence, Delay, ...)' }] });
  host.innerHTML = legend(cat.groups.filter((g) => custom.some((r) => r.group === g.id)).map((g) => [GROUP_COLOR[g.id], g.label]));
  const box = document.createElement('div');
  host.appendChild(box);
  fitBars(box, rows, { digits: 0, unit: 's', labelW: 210 });
}

// ---------- doTask ----------
function doTaskGraph() {
  const host = document.getElementById('dotask-graph');
  const note = document.createElement('div');
  note.className = 'graph-note';
  const hint = 'Tap a step.';
  const N = (id, x, y, label, sub, info, extra = {}) => ({ id, x, y, label, sub, info, ...extra });
  const nodes = [
    N('goal', 80, 50, 'ExecuteTree goal', 'tree = path of an XML', '<b>The goal.</b> A client sends the full path of a tree file: the Nereus viewer\'s Autonomy panel, or <code>ros2 action send_goal</code>.'),
    N('accept', 250, 50, 'handleGoal', 'file exists?', '<b>Accept.</b> The goal is rejected if the file doesn\'t exist. Otherwise the run starts on a new thread, so the ROS executor stays free for callbacks.'),
    N('build', 430, 50, 'Build the tree', 'createTreeFromFile, rosInit', '<b>Build.</b> The factory parses the XML and makes every node, every subtree again where it is used. <code>initRosForTree</code> then runs each node\'s <code>rosInit</code>.'),
    N('log', 620, 50, 'Start the loggers', '.fbl, tree_stack, ZMQ', '<b>Loggers.</b> Every status change goes to <code>~/btlogs/BTLog_&lt;date&gt;.fbl</code> and, as the stack of running nodes, to <code>autonomy/tree_stack</code>. A ZeroMQ publisher for live Groot is made too but left disabled (<code>enable_zmq</code> is false). BT.CPP allows only one per process, so a second goal while a tree runs throws here.'),
    N('tick', 620, 160, 'tickRoot()', 'every 30 ms', '<b>The loop.</b> Tick the root, then sleep to keep a 30 ms period, for as long as the root returns RUNNING. A cancel request halts the tree: every running node\'s <code>onHalted</code>.', { stroke: 'var(--accent)' }),
    N('end', 340, 160, 'Tree ends', 'DISABLED, LEDs, result', '<b>The end.</b> Publishes DISABLED on <code>controller/linear</code> and <code>controller/angular</code> (the MPC then commands zero thrust), sets the LEDs (breathing green after SUCCESS, red otherwise) and finishes the goal: succeeded with <code>returncode</code> 2 or 3, or canceled with <code>returncode</code> 1.'),
    N('cancel', 820, 160, 'Cancel', 'Stop in the viewer', '<b>Cancel.</b> Stopping the goal from the viewer, or <code>ros2 action</code>. Pulling the kill switch does not cancel it.'),
    N('crash', 110, 160, 'Exception', 'red fast flash, abort', '<b>A crash.</b> Any exception while building or ticking (a node type that isn\'t registered, a port value that won\'t convert) ends the run: DISABLED to the controller, fast-flashing red LEDs, goal aborted with <code>returncode</code> −1 (4294967295 as a <code>uint32</code>).'),
  ];
  const edges = [
    { from: 'goal', to: 'accept' }, { from: 'accept', to: 'build' }, { from: 'build', to: 'log' }, { from: 'log', to: 'tick' },
    { from: 'tick', to: 'end', label: 'SUCCESS / FAILURE' }, { from: 'cancel', to: 'tick', dash: true }, { from: 'build', to: 'crash', dash: true, label: 'throws' },
  ];
  const narrow = {
    below: 640, width: 380, height: 470,
    nodes: { goal: { x: 125, y: 30 }, accept: { x: 125, y: 95 }, build: { x: 125, y: 165 }, log: { x: 125, y: 240 }, tick: { x: 125, y: 320 }, end: { x: 125, y: 435 }, cancel: { x: 300, y: 320 }, crash: { x: 300, y: 95 } },
    edges: { 'tick>end': { lx: 133, ly: 382, anchor: 'start' }, 'build>crash': { lx: 234, ly: 150, anchor: 'start' } },
  };
  new Graph(host, { width: 900, height: 215, nodes, edges, narrow, info: (n) => { note.innerHTML = n ? n.info : hint; } });
  host.appendChild(note);
  note.textContent = hint;
}

// ---------- go ----------
lifeGraph();
regGraph();
doTaskGraph();
pathBuilder();
Promise.all([
  fetch(`${BASE}data/bt-nodes/catalogue.json`).then((r) => r.json()),
  fetch(`${BASE}data/bt-nodes/mission_time.json`).then((r) => r.json()),
]).then(([cat, mt]) => {
  const bind = {
    total: fmtInt(cat.comp.nodeInstances + cat.comp.subtreeInstances), custom: fmtInt(cat.comp.customInstances),
    files: String(cat.source.treeFiles), runlen: `${Math.round(mt.end - mt.start)} s`,
  };
  document.querySelectorAll('[data-bind]').forEach((e) => { if (bind[e.dataset.bind]) e.textContent = bind[e.dataset.bind]; });
  loadChart(cat);
  catalogue(cat);
  callsTable(cat);
  ledTable(cat);
  timeChart(cat, mt);
});
