import { setup } from '../layout.js';
import { el } from '../viz/chart.js';
import { flow } from '../viz/bt-nodes-flow.js';
import '../css/chapter.css';
import '../css/bt-nodes.css';

setup();
const BASE = import.meta.env.BASE_URL;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const fmtInt = (n) => n.toLocaleString('en-US');

// One colour per catalogue group, used by the catalogue and the time chart.
const GROUP_COLOR = {
  movement: 'var(--state)', perception: 'var(--prediction)', state: 'var(--s7)', ros: 'var(--reference)',
  utility: 'var(--s5)', math: 'var(--ink-2)', logging: 'var(--s6)',
};
const TAGS = [
  ['controller', 'the controller'], ['mapping', 'mapping'], ['detector', 'the detector'], ['tf', 'TF'], ['odometry', 'odometry'],
  ['actuators', 'the actuators'], ['leds', 'the LEDs'], ['service', 'any service'], ['topic', 'any topic'],
];
const KIND_LABEL = { stateful: 'stateful action', simple: 'simple action', condition: 'condition', decorator: 'decorator' };
const ROS_VERB = { pub: 'publishes', sub: 'subscribes to', client: 'calls service', action: 'sends goals to action', param: 'sets parameter' };
const WHEN = { load: 'made when the tree loads', start: 'made each time it starts', tick: 'made the first time it is ticked' };
const KIND_SHORT = { sub: 'sub', pub: 'pub', client: 'srv', action: 'action' };
const KIND_WORD = { sub: ['subscription', 'subscriptions'], pub: ['publisher', 'publishers'], client: ['service client', 'service clients'], action: ['action client', 'action clients'] };

// ---------- horizontal bars in HTML: name and value on one line, the bar under it (readable at any width) ----------
function hbars(host, rows, { max } = {}) {
  const top = max || Math.max(...rows.map((r) => r.value));
  host.insertAdjacentHTML('beforeend', `<ul class="hb">${rows.map((r) => `<li class="hb-row${r.muted ? ' muted' : ''}">
      <span class="hb-top"><span class="hb-name">${r.code === false ? esc(r.label) : `<code>${esc(r.label)}</code>`}</span><span class="hb-val">${r.text}</span></span>
      <span class="hb-track"><span style="width:${Math.max(0.6, (100 * r.value) / top).toFixed(2)}%;background:${r.color}"></span></span>
      ${r.note ? `<span class="hb-note">${r.note}</span>` : ''}</li>`).join('')}</ul>`);
}
const legend = (items) => `<div class="legend">${items.map(([c, t]) => `<span><i style="background:${c};height:9px;width:9px;border-radius:2px"></i>${t}</span>`).join('')}</div>`;

// ---------- a stateful action's life ----------
function lifeFlow() {
  flow(document.getElementById('life-graph'), {
    label: 'The life of one stateful action',
    steps: [
      { id: 'idle', title: 'IDLE', sub: 'not started yet', next: 'first tick',
        info: '<b>IDLE.</b> Before the node is first ticked, and again after it finishes or is halted. Its subscriptions from <code>rosInit</code> stay open the whole time.' },
      { id: 'start', title: 'onStart()', sub: 'read the ports, start the work', next: 'returns RUNNING',
        side: [{ kind: 'pill', id: 'atonce', title: 'or finishes at once → 4',
          info: '<b>Finishing at once.</b> <code>onStart</code> can return SUCCESS or FAILURE straight away and skip <code>onRunning</code>. <code>SetStatus</code>, <code>PublishToController</code> and <code>LatestDetection</code> do.' }],
        info: '<b>onStart.</b> Reads the ports and starts the work: sends a service request or an action goal, notes the start time. It returns RUNNING to carry on, or SUCCESS / FAILURE to finish at once.' },
      { id: 'run', title: 'onRunning()', sub: '↻ again every tick (30 ms) while RUNNING', next: 'returns SUCCESS / FAILURE',
        side: [{ kind: 'card', id: 'halt', title: 'onHalted()', sub: 'then back to 1', edge: 'parent halts it', dir: 'out',
          info: '<b>onHalted.</b> A parent stopped the node while it was RUNNING: a <code>ReactiveSequence</code> whose condition flipped, or a cancelled goal. <code>FollowPath</code> cancels its MPC goal here; <code>ContinuousSpin</code> and <code>CenterDetection</code> hold the current heading. The node is IDLE again afterwards.' }],
        info: '<b>onRunning.</b> Called on each later tick, every 30 ms, while the node is RUNNING. It only checks: has the reply come, has the timeout passed? It must return quickly, because the whole tree waits for it.' },
      { id: 'done', title: 'SUCCESS or FAILURE', sub: 'the parent gets the result', next: '↺ the parent resets it: back to 1', nextTone: 'loop',
        info: '<b>Done.</b> The result goes to the parent. The node keeps that status until its parent resets it to IDLE, so the next time it is ticked it starts again with <code>onStart</code>.' },
    ],
  });
}

// ---------- doTask ----------
function doTaskFlow() {
  const crash = { kind: 'pill', title: 'throws → 6′ crash', to: 'crash', tone: 'bad' };
  flow(document.getElementById('dotask-graph'), {
    label: 'One goal through doTask',
    steps: [
      { id: 'goal', title: 'ExecuteTree goal', sub: 'tree = the path of an XML file', next: '',
        info: '<b>The goal.</b> A client sends the full path of a tree file: the Autonomy panel of the Nereus viewer, or <code>ros2 action send_goal</code>.' },
      { id: 'accept', title: 'handleGoal', sub: 'does the file exist? if not, reject', next: 'accepted: runs on a new thread',
        info: '<b>Accept.</b> The goal is rejected if the file doesn\'t exist. Otherwise the run starts on a new thread, so the ROS executor stays free for callbacks. Send one goal at a time (<a href="#watch">why</a>).' },
      { id: 'build', title: 'Build the tree', sub: 'createTreeFromFile, then each rosInit', next: '', side: [crash],
        info: '<b>Build.</b> BT.CPP\'s factory parses the XML and makes every node, every subtree again wherever it is used. <code>initRosForTree</code> then runs each node\'s <code>rosInit</code>. A node type that isn\'t registered, or a port value that won\'t convert, throws here.' },
      { id: 'log', title: 'Start the loggers', sub: '.fbl file, tree_stack', next: '', side: [crash],
        info: '<b>Loggers.</b> Every status change goes to <code>~/btlogs/BTLog_&lt;date&gt;.fbl</code> and, as the stack of running nodes, to <code>autonomy/tree_stack</code>. A ZeroMQ publisher for live Groot is made too but left off (<code>enable_zmq</code> is false). Only one of each logger may exist at a time, so a second goal while a tree runs throws here.' },
      { id: 'tick', title: 'tickRoot()', sub: '↻ every 30 ms while the root is RUNNING', next: 'SUCCESS or FAILURE, or cancelled',
        side: [{ kind: 'card', id: 'cancel', title: 'Cancel', sub: 'Stop in the viewer: halts the tree', dir: 'in',
          info: '<b>Cancel.</b> <i>Stop</i> in the viewer, or <code>ros2 action</code>, halts the tree: every running node\'s <code>onHalted</code> runs. Then step 6, and the goal ends as cancelled with <code>returncode</code> 1. The kill switch does not do this (<a href="#watch">Things to watch</a>).' }, crash],
        info: '<b>The loop.</b> Tick the root, then sleep to keep a 30 ms period, for as long as the root returns RUNNING. Each tick runs the <code>onRunning</code> of every node that is still RUNNING.' },
      { id: 'end', title: 'Tree ends', sub: 'DISABLED, LEDs, result', next: null,
        side: [{ kind: 'card', id: 'crash', title: '6′ Crash', sub: 'instead of 6: abort, returncode −1', edge: 'instead, after any throw', dir: 'alt', tone: 'bad',
          info: '<b>A crash.</b> An exception while building the tree, starting the loggers or ticking ends the run: DISABLED to the controller, fast-flashing red LEDs (<code>panic</code>), and the goal is aborted with <code>returncode</code> −1 (see <a href="#dotask">run_tree</a>).' }],
        info: '<b>The end.</b> Publishes DISABLED on <code>controller/linear</code> and <code>controller/angular</code> (the MPC then commands zero thrust), sets the LEDs (breathing green after SUCCESS, breathing red otherwise) and finishes the goal: <i>succeeded</i> with <code>returncode</code> 2 (SUCCESS) or 3 (FAILURE), or cancelled with 1.' },
    ],
  });
}

// ---------- endpoints opened at load ----------
function loadChart(cat) {
  const host = document.getElementById('load-chart');
  const rows = [];
  for (const n of cat.nodes) {
    const k = n.use.instances;
    if (!k) continue;
    const per = {};
    n.ros.filter((r) => r.when === 'load' && KIND_WORD[r.kind]).forEach((r) => (per[r.kind] = (per[r.kind] || 0) + 1));
    const each = Object.entries(per);
    if (!each.length) continue;
    const total = each.reduce((a, [, c]) => a + c, 0) * k;
    const what = each.map(([kind, c]) => `${c} ${KIND_SHORT[kind]}`).join(' + ');
    rows.push({ label: n.id, value: total, text: `<small>${fmtInt(k)} × ${what} =</small> <b>${fmtInt(total)}</b>`, color: 'var(--ink-2)' });
  }
  rows.sort((a, b) => b.value - a.value);
  const o = cat.comp.openedAtLoad;
  host.innerHTML = `<div class="btn-note">In all: <b>${fmtInt(o.sub || 0)}</b> subscriptions (sub), <b>${fmtInt(o.pub || 0)}</b> publishers (pub), <b>${o.client || 0}</b> service clients (srv) and <b>${o.action || 0}</b> action clients. Each row: instances × endpoints each.</div>`;
  const big = rows.filter((r) => r.value >= 16), small = rows.filter((r) => r.value < 16);
  hbars(host, big);
  if (small.length) host.insertAdjacentHTML('beforeend', `<p class="hb-rest">And ${small.map((r) => `<code>${r.label}</code> ${r.value}`).join(', ')}.</p>`);
}

// ---------- one mission's time ----------
function timeChart(cat, mt) {
  const host = document.getElementById('time-chart');
  const total = mt.end - mt.start;
  const custom = mt.rows.filter((r) => r.custom);
  const big = custom.filter((r) => r.secs >= 3);
  const small = custom.filter((r) => r.secs < 3).reduce((a, r) => a + r.secs, 0);
  const builtin = mt.rows.filter((r) => !r.custom).reduce((a, r) => a + r.secs, 0);
  const pct = (s) => `${(100 * s / total).toFixed(s / total < 0.01 ? 1 : 0)} %`;
  const row = (label, secs, color, extra = {}) => ({ label, value: secs, color, text: `<b>${secs.toFixed(secs < 10 ? 1 : 0)} s</b><small>${pct(secs)}</small>`, ...extra });
  const rows = big.map((r) => row(r.id, r.secs, GROUP_COLOR[r.group]));
  rows.push(row(`${custom.length - big.length} other custom nodes`, small, 'var(--muted)', { code: false, muted: true }));
  rows.push(row('built-in nodes (Sequence, Delay, ...)', builtin, 'var(--rule)', { code: false, muted: true }));
  host.innerHTML = legend(cat.groups.filter((g) => big.some((r) => r.group === g.id)).map((g) => [GROUP_COLOR[g.id], g.label]));
  hbars(host, rows);
}

// ---------- the catalogue ----------
// A port's text often ends by repeating the default the row already shows: drop that ending.
const sameDefault = (t, d) => {
  t = t.trim(); d = String(d ?? '').trim();
  if (t === d) return true;
  const m = t.match(/^(-?[\d.]+)(?: seconds?)?$/);
  return !!m && d !== '' && parseFloat(m[1]) === parseFloat(d);
};
function dropDefault(desc, def) {
  if (!desc) return desc;
  let m = desc.match(/^(.*?)\s*\(default:? ([^()]*)\)\s*$/); // "… (default 60)"
  if (m && sameDefault(m[2], def)) return m[1];
  m = desc.match(/^(.*\()([^()]*?)[;,]\s*default:? ([^()]*)\)\s*$/); // "… (rad, default 0.25)"
  if (m && sameDefault(m[3], def)) return `${m[1]}${m[2]})`;
  m = desc.match(/^(.*?)[;,]\s*default:? ([^()]*)$/); // "…; default 0.2"
  if (m && sameDefault(m[2], def)) return m[1];
  return desc;
}
function catalogue(cat) {
  const host = document.getElementById('cat-panel');
  const groups = cat.groups;
  const nUsed = cat.nodes.filter((n) => n.use.instances).length;
  const state = { q: '', group: null, tag: '', comp: true, sel: null, filters: false, open: new Set(['movement']) };
  host.innerHTML = `
    <div class="cat-controls">
      <div class="cat-line">
        <input type="search" class="cat-search" placeholder="Search a node, port or topic" aria-label="Search the nodes">
        <button type="button" class="cat-filter-btn" aria-expanded="false">Filter<span class="cat-fcount"></span></button>
      </div>
      <span class="seg cat-scope" role="group" aria-label="Which nodes">
        <button type="button" data-comp="1" aria-pressed="true">In the competition tree · ${nUsed}</button><button type="button" data-comp="0" aria-pressed="false">All ${cat.nodes.length}</button>
      </span>
      <div class="cat-filters">
        <div class="chips cat-groups" role="group" aria-label="Group"></div>
        <label class="cat-tag">Talks to <select aria-label="Talks to"><option value="">anything</option>${TAGS.map(([id, l]) => `<option value="${id}">${l}</option>`).join('')}</select></label>
      </div>
    </div>
    <div class="cat-body">
      <div class="cat-list" role="list"></div>
      <div class="cat-detail" aria-live="polite"></div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const list = $('.cat-list'), detail = $('.cat-detail'), body = $('.cat-body');
  const gWrap = $('.cat-groups');
  const chip = (label, color, onClick) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.type = 'button';
    b.innerHTML = `${color ? `<i style="background:${color}"></i>` : ''}${label}`;
    b.setAttribute('aria-pressed', 'false');
    b.onclick = onClick;
    gWrap.appendChild(b);
    return b;
  };
  const gBtns = [chip('All groups', null, () => setGroup(null)), ...groups.map((g) => chip(g.label, GROUP_COLOR[g.id], () => setGroup(g.id)))];
  function setGroup(id) { state.group = id; render(); }
  $('.cat-search').addEventListener('input', (e) => { state.q = e.target.value.trim().toLowerCase(); render(); });
  $('.cat-tag select').addEventListener('change', (e) => { state.tag = e.target.value; render(); });
  host.querySelectorAll('[data-comp]').forEach((b) => (b.onclick = () => { state.comp = b.dataset.comp === '1'; render(); }));
  $('.cat-filter-btn').onclick = () => { state.filters = !state.filters; render(); };
  const clear = () => { state.q = ''; state.group = null; state.tag = ''; state.comp = false; $('.cat-search').value = ''; $('.cat-tag select').value = ''; render(); };

  const hay = (n) => [n.id, n.summary, ...n.ports.map((p) => p.name), ...n.ros.map((r) => r.name), ...Object.values(n.use.values).flat().map((v) => v[0])].join(' ').toLowerCase();
  const HAY = new Map(cat.nodes.map((n) => [n.id, hay(n)]));
  const wide = () => host.clientWidth >= 860;

  function rowHTML(n) {
    const k = n.use.instances, f = n.use.files.length;
    return `<button type="button" class="cat-row" data-id="${n.id}" aria-expanded="false" style="--g:${GROUP_COLOR[n.group]}">
      <span class="cat-name"><span class="cn"><i></i><code>${n.id}</code></span><span class="cat-kind">${n.kind}</span>${n.legacy ? '<em class="tag-legacy">legacy</em>' : ''}</span>
      <span class="cat-use" title="${k} instances in the competition tree; used by ${f} of the ${cat.source.treeFiles} tree files">${k ? `<b>×${fmtInt(k)}</b>` : '<b class="none">not used</b>'}<small>${f} file${f === 1 ? '' : 's'}</small></span>
      <span class="cat-sum">${esc(n.summary)}</span>
    </button>`;
  }

  function detailHTML(n) {
    const u = n.use;
    const ports = n.ports.map((p) => { const desc = p.dir === 'in' ? dropDefault(p.desc, p.default) : p.desc; return `<li><div class="pt-head"><code>${p.name}</code><span class="pt-dir ${p.dir}">${p.dir === 'in' ? 'in' : 'out'}</span><span class="pt-type">${esc(p.type.replace('std::string', 'string'))}</span>${p.dir === 'in' ? `<span class="pt-def">default <b>${esc(p.default ?? '–')}</b></span>${p.required ? '<span class="pt-req" title="Logs a warning if unset">warns if unset</span>' : ''}` : ''}</div>${desc ? `<div class="pt-desc">${esc(desc)}</div>` : ''}</li>`; }).join('');
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
        ${valHTML ? `<details class="cd-more"><summary>Values the tree gives it</summary><p class="small muted">Literal, or <span class="val rt">set while running</span>:</p><ul class="cd-vals">${valHTML}</ul></details>` : ''}`
        : `<p class="small">Not used.${u.files.length ? ` Used by ${u.files.length} other tree file${u.files.length > 1 ? 's' : ''}: ${u.files.slice(0, 5).map((f) => `<code>${f.replace('.xml', '')}</code>`).join(', ')}${u.files.length > 5 ? '…' : ''}.` : ' No tree file uses it.'}</p>`}
      ${groot}
      <p class="cd-links"><a href="${n.url}">${n.base === 'simple' ? 'Its function' : 'Its header'} on GitHub</a> · <a href="${n.portsUrl}">ports</a></p>
      <button type="button" class="cd-close">Close <code>${n.id}</code></button>`;
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
    detail.querySelector('.cd-close').onclick = () => {
      const row = list.querySelector(`.cat-row[data-id="${id}"]`);
      show(wide() ? id : null);
      if (row && !wide() && row.getBoundingClientRect().top < 0) row.scrollIntoView({ block: 'start' });
    };
    placeDetail();
    if (scroll && !wide()) {
      const row = list.querySelector(`.cat-row[data-id="${id}"]`);
      if (row) { const t = row.getBoundingClientRect().top; if (t < 50 || t > innerHeight * 0.5) window.scrollBy({ top: t - 70 }); }
    }
  }
  // Wide: list and detail side by side. Narrow: the list flows with the page and the detail opens under the tapped row.
  function placeDetail() {
    const row = state.sel && list.querySelector(`.cat-row[data-id="${state.sel}"]`);
    host.classList.toggle('narrow', !wide());
    if (wide()) {
      if (detail.parentElement !== body) body.appendChild(detail);
      detail.classList.remove('inline');
    } else if (row) {
      row.after(detail);
      detail.classList.add('inline');
    } else {
      body.appendChild(detail);
      detail.classList.add('inline');
    }
    detail.hidden = !wide() && !row;
  }

  function render() {
    gBtns.forEach((b, i) => b.setAttribute('aria-pressed', String((i === 0 && !state.group) || (i > 0 && groups[i - 1].id === state.group))));
    host.querySelectorAll('[data-comp]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.comp === '1') === state.comp)));
    const nf = (state.group ? 1 : 0) + (state.tag ? 1 : 0);
    $('.cat-fcount').textContent = nf ? ` · ${nf}` : '';
    $('.cat-filter-btn').setAttribute('aria-expanded', String(state.filters));
    host.classList.toggle('filters-open', state.filters);
    const shown = cat.nodes.filter((n) => (!state.group || n.group === state.group) && (!state.tag || (n.tags || []).includes(state.tag))
      && (!state.comp || n.use.instances) && (!state.q || HAY.get(n.id).includes(state.q)));
    let html = '';
    for (const g of groups) {
      const ns = shown.filter((n) => n.group === g.id);
      if (!ns.length) continue;
      // on a phone each group folds (only the first starts open); a search or filter opens every group it matches
      const open = wide() || state.q || state.group || state.tag || state.open.has(g.id);
      html += `<div class="cat-sec${open ? '' : ' shut'}"><button type="button" class="cat-group" data-g="${g.id}" aria-expanded="${open}" style="--g:${GROUP_COLOR[g.id]}"><span>${g.label}</span><b class="cat-count">${ns.length}</b><small>${g.blurb}</small></button>${open ? ns.map(rowHTML).join('') : ''}</div>`;
    }
    if (list.contains(detail)) body.appendChild(detail);
    list.innerHTML = html || '<div class="cd-empty"><p>No node matches.</p><button type="button" class="cd-clear">Clear search and filters</button></div>';
    list.querySelectorAll('.cat-group').forEach((b) => (b.onclick = () => {
      if (wide() || state.q || state.group || state.tag) return;
      const id = b.dataset.g;
      if (state.open.has(id)) state.open.delete(id); else state.open.add(id);
      render();
    }));
    const cl = list.querySelector('.cd-clear');
    if (cl) cl.onclick = clear;
    list.querySelectorAll('.cat-row').forEach((r) => (r.onclick = () => show(state.sel === r.dataset.id && !wide() ? null : r.dataset.id, true)));
    const keep = shown.some((n) => n.id === state.sel) ? state.sel : (wide() ? shown[0]?.id : null);
    show(keep);
  }
  let wasWide = null;
  new ResizeObserver(() => { const w = wide(); if (w !== wasWide) { const first = wasWide === null; wasWide = w; if (!first) render(); } }).observe(host);
  // deep link: #node-FollowPath
  const m = location.hash.match(/^#node-(\w+)/);
  render();
  if (m && cat.nodes.some((n) => n.id === m[1])) {
    const dn = cat.nodes.find((n) => n.id === m[1]);
    state.open.add(dn.group);
    if (!dn.use.instances) state.comp = false;
    render();
    show(m[1], true);
    host.scrollIntoView();
  } else if (wide()) show('FollowPath');
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
    out.push({ frame, x: v[0], y: v[1], z: v[2], yaw: v[v.length - 1], o, nums: nums.trim(), opts: opts.map((s) => s.trim()) });
  }
  return out;
}
// one waypoint as text, one option per line
const lineHTML = (p) => `${p.frame ? `<span class="pl-frame">${esc(p.frame)}:</span> ` : ''}<span class="pl-nums">${esc(p.nums)}</span>${p.opts.map((s) => `<span class="pl-opt">| ${esc(s)}</span>`).join('')}<span class="pl-end">;</span>`;

const FFC_HALF_FOV = Math.atan(960 / 1863.93); // the forward camera: 1920 px wide, fx 1864 px (Nereus's ffc calibration): ±27°

function pathBuilder() {
  const host = document.getElementById('path-builder');
  const st = { mode: 'sweep', dist: 2, sweep: 0.5, pan: 0.5, panStep: 0.25, step: 0.25, outer: 2 };
  host.innerHTML = `<div class="controls pb-controls">
      <span class="seg" role="group" aria-label="Path"><button type="button" data-mode="sweep" aria-pressed="true">Sweep</button><button type="button" data-mode="spiral" aria-pressed="false">Spiral</button></span>
      <button type="button" class="pb-play" aria-pressed="false"><span aria-hidden="true">▶</span> Fly it</button>
    </div>
    <div class="controls pb-sliders">
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
    <div class="pb-body">
      <div class="pb-fig"><div class="pb-svg"></div><p class="pb-key"></p></div>
      <div class="pb-text">
        <h4 class="pb-h">The nodes, in order</h4>
        <ol class="pb-steps"></ol>
        <h4 class="pb-h">Line <span class="pb-ln"></span> of the string</h4>
        <div class="pb-line"></div>
        <details class="pb-all"><summary>The whole string</summary><ol class="pb-lines"></ol></details>
      </div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  const svgHost = $('.pb-svg'), stepsBox = $('.pb-steps'), linesBox = $('.pb-lines'), lineBox = $('.pb-line'), playBtn = $('.pb-play');
  let sel = 1, geo = null, anim = null;
  host.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { stop(); st.mode = b.dataset.mode; sel = 1; draw(); }));
  host.querySelectorAll('[data-ps]').forEach((b) => (b.onclick = () => { stop(); st.panStep = +b.dataset.ps; draw(); }));
  host.querySelectorAll('input[data-k]').forEach((inp) => {
    inp.value = st[inp.dataset.k];
    inp.oninput = () => { stop(); st[inp.dataset.k] = +inp.value; draw(); };
  });
  playBtn.onclick = () => (anim ? stop() : play());

  // The nodes the tree chains, each with the lines of the string it adds.
  function build() {
    const steps = [];
    let path = '';
    const add = (s, call) => { const before = path ? parsePath(path).length : 0; path = s; steps.push({ ...call, from: before, to: parsePath(path).length - 1 }); };
    if (st.mode === 'sweep') {
      const f = 'torpedo_frame', common = { frame: f, look_frame: f, cx: 0, cy: 0, radius: st.dist, z: 0, approach: false, pan: st.pan, pan_step: st.panStep };
      add(addWaypoint({ frame: f, look_frame: f, x: st.dist, y: 0, z: 0 }), { node: 'AddWaypoint', name: 'in front, facing it', args: `x=${num(st.dist)}` });
      add(addArc({ ...common, path, start_angle: 0, sweep: st.sweep }), { node: 'AddArc', name: 'round it one way', args: `0 → +${num(st.sweep)} rad` });
      add(addArc({ ...common, path, start_angle: st.sweep, sweep: -2 * st.sweep }), { node: 'AddArc', name: 'across to the other side', args: `+${num(st.sweep)} → −${num(st.sweep)} rad` });
      add(addArc({ ...common, path, start_angle: -st.sweep, sweep: st.sweep }), { node: 'AddArc', name: 'back to the middle', args: `−${num(st.sweep)} → 0 rad` });
      return { path, steps, frame: f };
    }
    const f = 'bandage_frame', turns = (st.outer - st.step) / st.step;
    add(addArc({ frame: f, cx: 0, cy: 0, radius: st.step, end_radius: st.outer, start_angle: 0, sweep: turns * 6.283185, z: 0, yaw: 0, yaw_frame: 'world' }),
      { node: 'AddArc', name: 'spiral out, heading held', args: `${num(st.step)} → ${num(st.outer)} m, ${num(+turns.toFixed(2))} turns` });
    return { path, steps, frame: f };
  }

  function draw() {
    host.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
    host.querySelectorAll('[data-ps]').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.ps === st.panStep)));
    $('.pb-sweep').hidden = st.mode !== 'sweep';
    $('.pb-spiral').hidden = st.mode !== 'spiral';
    host.querySelectorAll('input[data-k]').forEach((inp) => (inp.nextElementSibling.textContent = `${(+inp.value).toFixed(2)}${['dist', 'step', 'outer'].includes(inp.dataset.k) ? ' m' : ' rad'}`));
    const { path, steps, frame } = build();
    const pts = parsePath(path);
    if (sel >= pts.length) sel = pts.length - 1;
    const passOf = pts.map((_, i) => steps.findIndex((s) => i >= s.from && i <= s.to));
    const badge = (i) => `<span class="pb-n${i === sel ? ' on' : ''}">${i + 1}</span>`;
    stepsBox.innerHTML = steps.map((s, k) => `<li><button type="button" data-line="${s.from}"${sel >= s.from && sel <= s.to ? ' class="on"' : ''}><code>${s.node}</code> <span class="pb-args">${esc(s.args)}</span><span class="pb-name">“${esc(s.name)}” · line${s.to > s.from ? `s ${s.from + 1}–${s.to + 1}` : ` ${s.from + 1}`}</span></button></li>`).join('')
      + `<li><span class="pb-final"><code>FollowPath</code> <span class="pb-args">flies lines 1–${pts.length}</span></span></li>`;
    stepsBox.querySelectorAll('[data-line]').forEach((b) => (b.onclick = () => { stop(); sel = +b.dataset.line; draw(); }));
    $('.pb-ln').textContent = `${sel + 1} of ${pts.length}`;
    lineBox.innerHTML = `<div class="pb-code">${lineHTML(pts[sel])}</div>`;
    linesBox.innerHTML = pts.map((p, i) => `<li data-i="${i}"${sel === i ? ' class="on"' : ''}>${lineHTML(p)}</li>`).join('');
    linesBox.querySelectorAll('li').forEach((li) => (li.onclick = () => { stop(); sel = +li.dataset.i; draw(); }));
    $('.pb-key').innerHTML = st.mode === 'sweep'
      ? `Numbers are the lines of the string; tap one. The middle pass is drawn just inside the other two so you can follow it: Talos flies all three on one circle, ${num(st.dist)} m from the board. <i>Fly it</i> shows the forward camera's view (±27°).`
      : 'The cross is the target\'s estimated position, where the spiral starts. One <code>AddArc</code> makes the whole spiral. Its heading is a fixed yaw in the world frame, not the target\'s (the corner arrow only stands for it), so the down camera sweeps the floor without turning.';

    // ----- geometry. A top view turned so the object's +x points up the screen. Sweep: the three passes run on one
    // circle; the middle pass is drawn DELTA px inside the other two so each can be followed. Every number badge sits
    // off its piece along the radius (outside for passes 1 and 3, inside for pass 2), joined to it by a short leader.
    // When the board is far, it is drawn closer, behind a break in its axis, so the path fills the sketch.
    const W = Math.round(Math.max(280, Math.min(560, svgHost.clientWidth || 520)));
    const sweep = st.mode === 'sweep';
    const BR = 13, LANE = 26, DELTA = 16, M = 14; // badge radius, badge offset from its piece, inner pass offset, edge (px)
    const inner = (i) => sweep && passOf[i] === 2;
    const radial = (q, d) => { const r = Math.hypot(q[0], q[1]) || 1; return [(q[0] * (r + d)) / r, (q[1] * (r + d)) / r]; };
    // the pieces at a scale s (px per m): samples in metres, the pass-to-pass connector, the badge position
    const layout = (s) => {
      const disp = pts.map((p, i) => (inner(i) ? radial([p.x, p.y], -DELTA / s) : [p.x, p.y]));
      return pts.map((p, i) => {
        const prev = disp[i - 1], here = disp[i];
        if (!prev) return { i, samples: [here], start: true, badge: sweep ? radial(here, LANE / s) : [here[0], here[1] - 20 / s] };
        let samples = [], conn = null;
        if (p.o.arc) {
          const [cx, cy, sw] = p.o.arc.split(',').map(Number);
          const a0 = Math.atan2(prev[1] - cy, prev[0] - cx), r1 = Math.hypot(here[0] - cx, here[1] - cy);
          let r0 = Math.hypot(prev[0] - cx, prev[1] - cy);
          if (sweep && Math.abs(r1 - r0) * s > 1) { conn = [prev, [cx + r1 * Math.cos(a0), cy + r1 * Math.sin(a0)]]; r0 = r1; }
          const n = Math.max(10, Math.ceil(Math.abs(sw) * 40));
          for (let k = 0; k <= n; k++) { const u = k / n; samples.push([cx + (r0 + (r1 - r0) * u) * Math.cos(a0 + sw * u), cy + (r0 + (r1 - r0) * u) * Math.sin(a0 + sw * u)]); }
        } else samples = [prev, here];
        const mid = samples.length > 2 ? samples[Math.floor(samples.length / 2)] : [(prev[0] + here[0]) / 2, (prev[1] + here[1]) / 2];
        const badge = sweep ? radial(mid, ((inner(i) ? -1 : 1) * LANE) / s) : radial(samples.at(-1), LANE / s);
        return { i, samples, conn, badge };
      });
    };
    const ext = (arr) => { const xs = arr.map((q) => q[0]), ys = arr.map((q) => q[1]); return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]; };
    // fit the path, its badges and (withBoard) the board and its label into W px across
    const fit = (withBoard) => {
      let s = 100, pcs, b, pb;
      for (let it = 0; it < 6; it++) {
        pcs = layout(s);
        const many = [];
        for (const q of pcs) {
          many.push(...q.samples);
          const [x, y] = q.badge, e = (BR + 2) / s;
          many.push([x - e, y - e], [x + e, y + e]);
        }
        pb = ext(many);
        if (withBoard) many.push([-26 / s, 0], [0, 30 / s], [0, -160 / s]); // the board and its label beside it
        b = ext(many);
        const [x0, x1, y0, y1] = b;
        s = Math.min((W - 2 * M - (sweep ? 12 : 0)) / Math.max(0.3, y1 - y0), sweep ? 1e9 : (W - 2 * M) / Math.max(0.3, x1 - x0), 320);
      }
      return { s, pcs, b, pb };
    };
    let F = fit(true), broken = false;
    if (sweep) {
      // the empty stretch between the path and the board, as a share of the sketch's height
      const gap = (F.pb[0] - 0) * F.s, h = (F.b[1] - F.b[0]) * F.s;
      if (gap > 0.4 * h) { F = fit(false); broken = true; }
    }
    const { s, pcs: pieces } = F, [x0, x1, y0, y1] = F.b;
    const BREAK = 58; // px from the path's lowest point to the drawn board
    const pathH = (x1 - x0) * s;
    const H = Math.round(pathH + 2 * M + (broken ? BREAK + 12 : 0));
    const ox = W / 2 + ((y0 + y1) / 2) * s, oy = M + x1 * s;
    const SX = (x, y) => ox - y * s, SY = (x, y) => oy - x * s;
    const dirS = (yaw, L) => [-L * Math.sin(yaw), -L * Math.cos(yaw)]; // a world heading as a screen vector
    // heading the piece asks for at a point: look_at plus yaw_offset, or a fixed yaw
    const headingAt = (i, m) => {
      const p = pts[i];
      if (p.o.heading === 'look_at') {
        const [lx, ly] = (p.o.look_at || '0,0,0').split(',').map(Number);
        return Math.atan2(ly - m[1], lx - m[0]) + (+p.o.yaw_offset || 0);
      }
      return p.yaw;
    };
    const P = (q) => [SX(q[0], q[1]), SY(q[0], q[1])];
    // fly along the connector too (it has no length on the real circle)
    for (const q of pieces) q.fly = q.conn ? [q.conn[0], ...q.samples] : q.samples;
    geo = { pieces, P, dirS, s, headingAt, sweep, H };

    svgHost.innerHTML = '';
    const svg = el('svg', { class: 'pb', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Top-down sketch of the path' }, svgHost);
    const defs = el('defs', {}, svg);
    for (const [id, c, w] of [['pb-arrow', 'var(--ink-2)', 5], ['pb-head', 'var(--state)', 5], ['pb-head-hot', 'var(--accent)', 5], ['pb-yawhead', 'var(--ink)', 4]]) {
      const mk = el('marker', { id, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: w, markerHeight: w, orient: 'auto' }, defs);
      el('path', { d: 'M0,0 L10,5 L0,10 z', fill: c }, mk);
    }
    // grid, 1 m, over the drawn-to-scale part only
    const gridBottom = broken ? Math.round(SY(x0, 0) + M) : H;
    const g = el('g', { class: 'pb-grid' }, svg);
    for (let v = Math.ceil(x0 - M / s); v <= x1 + M / s; v++) { const y = SY(v, 0); if (y <= gridBottom) el('line', { x1: 0, x2: W, y1: y, y2: y }, g); }
    for (let v = Math.ceil(y0 - (W / 2) / s); v <= y1 + (W / 2) / s; v++) el('line', { y1: 0, y2: gridBottom, x1: SX(0, v), x2: SX(0, v) }, g);
    geo.fovLayer = el('g', {}, svg);
    // the object
    const [bx0] = P([0, 0]);
    const by0 = broken ? Math.round(SY(x0, 0) + BREAK) : P([0, 0])[1];
    if (sweep) {
      el('rect', { x: bx0 - 18, y: by0 - 3.5, width: 36, height: 7, rx: 2, class: 'pb-obj' }, svg);
      el('text', { x: bx0 + 26, y: by0 + 4, class: 'pb-label' }, svg).textContent = 'board';
      el('text', { x: bx0 + 26, y: by0 + 19, class: 'pb-label small' }, svg).textContent = 'arrow: its +x, out front';
      const top = broken ? by0 - BREAK + 16 : by0 - Math.min(0.6 * s, 40);
      el('line', { x1: bx0, y1: by0 - 6, x2: bx0, y2: top, class: 'pb-axis', 'marker-end': 'url(#pb-arrow)' }, svg);
      if (broken) {
        // a break in the axis: the board is really st.dist m from the middle of the path
        const yb = by0 - BREAK / 2 + 2;
        el('rect', { x: bx0 - 9, y: yb - 5, width: 18, height: 10, fill: 'var(--paper)' }, svg);
        for (const dy of [-3, 3]) el('path', { d: `M${bx0 - 8},${yb + dy + 3} L${bx0 + 8},${yb + dy - 3}`, class: 'pb-break' }, svg);
        el('text', { x: bx0 + 14, y: yb + 4, class: 'pb-label small' }, svg).textContent = `${num(st.dist)} m (not to scale)`;
      }
    } else {
      el('path', { d: `M${bx0 - 6},${by0 - 6}L${bx0 + 6},${by0 + 6}M${bx0 - 6},${by0 + 6}L${bx0 + 6},${by0 - 6}`, class: 'pb-est' }, svg);
    }
    // pieces: the path, then leaders and badges on top
    const gPath = el('g', {}, svg), gLead = el('g', {}, svg), gYaw = el('g', {}, svg), gBadge = el('g', {}, svg);
    let lastBadge = null;
    pieces.forEach((q) => {
      const on = sel === q.i;
      let anchor;
      if (q.start) {
        anchor = P(q.samples[0]);
        el('circle', { cx: anchor[0], cy: anchor[1], r: 4.5, class: `pb-start${on ? ' on' : ''}`, 'data-i': q.i }, gPath);
      } else {
        if (q.conn) { const [a, b] = q.conn.map(P); el('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: 'pb-conn' }, gPath); }
        const d = q.samples.map((p, k) => { const [a, b] = P(p); return `${k ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`; }).join('');
        // an arrowhead where a pass ends (and on the selected piece); a small dot at every other waypoint
        const passEnd = passOf[q.i] !== passOf[q.i + 1];
        el('path', { d, class: `pb-path${on ? ' on' : ''}`, 'data-i': q.i, 'data-end': passEnd ? 1 : 0, ...(on || passEnd ? { 'marker-end': `url(#${on ? 'pb-head-hot' : 'pb-head'})` } : {}) }, gPath);
        if (!passEnd && !on) { const [ex, ey] = P(q.samples.at(-1)); el('circle', { cx: ex, cy: ey, r: 2.4, class: 'pb-wp' }, gPath); }
        anchor = P(q.samples.length > 2 ? q.samples[Math.floor(q.samples.length / 2)] : q.samples.at(-1));
      }
      const [bx, by] = P(q.badge);
      if (!on && lastBadge && Math.hypot(bx - lastBadge[0], by - lastBadge[1]) < 2 * BR + 3) return; // too short a piece for its own badge
      lastBadge = [bx, by];
      const dl = Math.hypot(bx - anchor[0], by - anchor[1]);
      if (dl > BR + 3) el('line', { x1: anchor[0], y1: anchor[1], x2: bx - ((bx - anchor[0]) * BR) / dl, y2: by - ((by - anchor[1]) * BR) / dl, class: `pb-lead${on ? ' on' : ''}`, 'data-i': q.i }, gLead);
      const b = el('g', { class: `pb-badge${on ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Line ${q.i + 1}`, 'data-i': q.i }, gBadge);
      el('circle', { cx: bx, cy: by, r: 22, class: 'pb-hit' }, b);
      el('circle', { cx: bx, cy: by, r: BR }, b);
      el('text', { x: bx, y: by + 0.5 }, b).textContent = String(q.i + 1);
      const pick = () => { stop(); sel = q.i; draw(); };
      b.addEventListener('click', pick);
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
    });
    // the selected piece's heading (sweep): ink arrows at two points along it, one if it is short
    const q = pieces[sel];
    if (sweep && q && !q.start) {
      const [ax, ay] = P(q.samples[0]), [bx, by] = P(q.samples.at(-1));
      // keep an arrow only if it stays clear of every badge (always keep the clearest one)
      const badges = [...gBadge.querySelectorAll('circle:not(.pb-hit)')].map((c) => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
      const segDist = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy))); return Math.hypot(a[0] + vx * t - p[0], a[1] + vy * t - p[1]); };
      const cand = (Math.hypot(bx - ax, by - ay) < 56 ? [0.5] : [0.15, 0.5, 0.85]).map((u) => {
        const m = q.samples[Math.round(u * (q.samples.length - 1))], [mx, my] = P(m), [dx, dy] = dirS(headingAt(q.i, m), 44);
        return { m, mx, my, dx, dy, clear: Math.min(...badges.map((c) => segDist(c, [mx, my], [mx + dx, my + dy]))) };
      });
      const ok = cand.filter((c) => c.clear > BR + 9); // the arrowhead reaches past the line
      const use = (ok.length ? ok : [cand.sort((a, b) => b.clear - a.clear)[0]]).slice(0, 2);
      for (const { mx, my, dx, dy } of use.length === 3 ? [use[0], use[2]] : use) {
        el('line', { x1: mx, y1: my, x2: mx + dx, y2: my + dy, class: 'pb-yaw-halo' }, gYaw);
        el('line', { x1: mx, y1: my, x2: mx + dx, y2: my + dy, class: 'pb-yaw', 'marker-end': 'url(#pb-yawhead)' }, gYaw);
        el('circle', { cx: mx, cy: my, r: 2.6, class: 'pb-yaw-dot' }, gYaw);
      }
    }
    // spiral: the heading is held in the world frame, so it is shown once, in a corner
    if (!sweep) {
      const cg = el('g', { class: 'pb-compass' }, svg);
      el('line', { x1: W - 16, y1: 44, x2: W - 16, y2: 12, class: 'pb-yaw', 'marker-end': 'url(#pb-yawhead)' }, cg);
      el('text', { x: W - 26, y: 22, class: 'pb-label small', 'text-anchor': 'end' }, cg).textContent = 'heading,';
      el('text', { x: W - 26, y: 36, class: 'pb-label small', 'text-anchor': 'end' }, cg).textContent = 'fixed in world';
    }
    geo.marker = el('g', { class: 'pb-marker', visibility: 'hidden' }, svg);
    if (sweep) geo.fov = el('path', { class: 'pb-fov' }, geo.fovLayer);
    geo.body = el('g', {}, geo.marker);
    el('rect', { x: -9, y: -6, width: 18, height: 12, rx: 3, class: 'pb-talos' }, geo.body);
    el('path', { d: 'M9,0 L20,0', class: 'pb-talos-head' }, geo.body);
    // scale bar, bottom right (the corner the path and the board leave free)
    const sc = el('g', { class: 'pb-scale' }, svg);
    const sl = s > W / 3 ? 0.5 : 1, sy = H - 22, sx = sweep ? 10 : W - 10 - sl * s;
    el('line', { x1: sx, x2: sx + sl * s, y1: sy, y2: sy }, sc);
    el('text', { x: sx + (sl * s) / 2, y: sy + 15, 'text-anchor': 'middle' }, sc).textContent = `${sl} m`;
  }

  // ----- fly it: a Talos marker along the drawn path, its heading blended in at the start of each piece
  function play() {
    if (!geo) return;
    playBtn.setAttribute('aria-pressed', 'true');
    playBtn.innerHTML = '<span aria-hidden="true">■</span> Stop';
    const segs = geo.pieces.filter((q) => !q.start && q.fly.length > 1).map((q) => {
      let len = 0;
      for (let k = 1; k < q.fly.length; k++) len += Math.hypot(q.fly[k][0] - q.fly[k - 1][0], q.fly[k][1] - q.fly[k - 1][1]);
      return { q, len, pts: q.fly };
    });
    const total = segs.reduce((a, x) => a + x.len, 0);
    if (!segs.length || !(total > 0)) { stop(); return; }
    const dur = Math.max(5, Math.min(12, total / 0.45)) * 1000;
    let yawPrev = geo.headingAt(0, geo.pieces[0].samples[0]);
    const startYaws = [];
    segs.forEach((x) => { startYaws.push(yawPrev); yawPrev = geo.headingAt(x.q.i, x.q.samples.at(-1)); });
    let t0 = null; // set from the first frame's own timestamp (a rAF time can be earlier than performance.now())
    geo.marker.setAttribute('visibility', 'visible');
    let shown = -1;
    const pts = parsePath(build().path);
    const frame = (now) => {
      if (!anim) return;
      let more = false;
      try {
        if (t0 === null) t0 = now;
        const elapsed = Math.max(0, now - t0);
        let d = Math.min(1, elapsed / dur) * total, k = 0;
        while (k < segs.length - 1 && d > segs[k].len) { d -= segs[k].len; k++; }
        const { q, len, pts: fp } = segs[k];
        const u = len ? Math.min(1, Math.max(0, d / len)) : 1;
        const f = u * (fp.length - 1), j = Math.max(0, Math.min(fp.length - 2, Math.floor(f))), r = f - j;
        const at = [fp[j][0] + (fp[j + 1][0] - fp[j][0]) * r, fp[j][1] + (fp[j + 1][1] - fp[j][1]) * r];
        const want = geo.headingAt(q.i, at), from = startYaws[k];
        const dw = Math.atan2(Math.sin(want - from), Math.cos(want - from));
        const bl = Math.min(1, u / 0.35), blend = bl * bl * (3 - 2 * bl);
        const yaw = want - dw * (1 - blend);
        const [x, y] = geo.P(at), [hx, hy] = geo.dirS(yaw, 1);
        geo.body.setAttribute('transform', `translate(${x.toFixed(1)},${y.toFixed(1)}) rotate(${((Math.atan2(hy, hx) * 180) / Math.PI).toFixed(1)})`);
        if (geo.fov) {
          const L = 2 * geo.H + 400;
          const [ax, ay] = geo.dirS(yaw + FFC_HALF_FOV, L), [bx, by] = geo.dirS(yaw - FFC_HALF_FOV, L);
          geo.fov.setAttribute('d', `M${x},${y} L${x + ax},${y + ay} L${x + bx},${y + by} Z`);
        }
        if (q.i !== shown) {
          shown = q.i;
          sel = q.i;
          for (const e of host.querySelectorAll('.pb-badge, .pb-path, .pb-lead, .pb-start')) e.classList.toggle('on', +e.dataset.i === q.i);
          for (const e of host.querySelectorAll('.pb-path')) {
            if (+e.dataset.i === q.i) e.setAttribute('marker-end', 'url(#pb-head-hot)');
            else if (e.dataset.end === '1') e.setAttribute('marker-end', 'url(#pb-head)');
            else e.removeAttribute('marker-end');
          }
          host.querySelectorAll('.pb-yaw, .pb-yaw-halo, .pb-yaw-dot').forEach((e) => { if (!e.closest('.pb-compass')) e.remove(); });
          $('.pb-ln').textContent = `${q.i + 1} of ${pts.length}`;
          lineBox.innerHTML = `<div class="pb-code">${lineHTML(pts[q.i])}</div>`;
          stepsBox.querySelectorAll('[data-line]').forEach((btn, n, all) => {
            const from = +btn.dataset.line, to = n + 1 < all.length ? +all[n + 1].dataset.line - 1 : Infinity;
            btn.classList.toggle('on', q.i >= from && q.i <= to);
          });
        }
        more = elapsed < dur + 600;
      } finally {
        if (!anim) return; // eslint-disable-line no-unsafe-finally
        if (more) anim = requestAnimationFrame(frame);
        else stop(true);
      }
    };
    anim = requestAnimationFrame(frame);
  }
  function stop(keep) {
    if (anim) cancelAnimationFrame(anim);
    anim = null;
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.innerHTML = '<span aria-hidden="true">▶</span> Fly it';
    if (geo?.marker && !keep) { geo.marker.setAttribute('visibility', 'hidden'); geo.fov?.removeAttribute('d'); }
    if (keep) draw();
  }
  draw();
  let lastW = 0;
  new ResizeObserver(() => { const w = svgHost.clientWidth; if (Math.abs(w - lastW) > 8) { lastW = w; stop(); draw(); } }).observe(svgHost);
}

// ---------- what the generic nodes call ----------
// Three groups matter most (one line each); the rest fold away. Each name is matched to who serves or publishes it.
const POAC = '<a href="boards.html">the POAC board</a>';
const CALL_GROUPS = [
  { id: 'act', main: true, title: 'Actuators', by: `<code>actuator_service_translator.py</code>, then ${POAC}`, re: /^command\/actuator\/(torpedo|dropper|notify_reload|arm)$/ },
  { id: 'det', main: true, title: 'The detector', by: '<code>yolo_orientation.py</code>: which camera, which targets', re: /^set_camera_is_dfc$|^set_table_pair_enabled$|^set_slalom_type$/ },
  { id: 'map', main: true, title: 'Mapping', by: '<code>mapping.py</code> (and <code>bin_geometry.py</code> for the bin fit)', re: /mapping\// },
  { id: 'claw', title: 'Claw', by: `Nereus's claw only (a timed move). No firmware listens to it: ${POAC} takes <code>command/actuator/claw</code>, so check before relying on it in the pool.`, re: /^command\/actuator\/claw_move_s$/ },
  { id: 'ac', title: 'Acoustics', by: '<code>riptide_acoustics</code>', re: /acoustics\// },
  { id: 'kill', title: 'Kill switch', by: `published by ${POAC} (by Nereus in sim)`, re: /^state\/kill$/ },
  { id: 'imu', title: 'IMU', by: '<code>riptide_imu</code>', re: /^vectornav\/imu$/ },
  { id: 'trust', title: 'MPC trust scale', by: 'published by the MPC', re: /^controller\/scale\/trust$/ },
  { id: 'stunt', title: 'Stunt state', by: 'no listener (the old controller\'s topic)', re: /^controller\/stunt_state$/ },
];
// break long names after / and _ only
const wb = (v) => esc(v).replace(/\//g, '/<wbr>');
function callsTable(cat) {
  const names = new Map(); // group id -> Map(name -> kind)
  for (const n of cat.nodes) {
    for (const port of ['srv_name', 'topic']) {
      for (const [v] of n.use.values[port] || []) {
        if (!v || v.startsWith('(') || v.startsWith('{')) continue;
        const g = CALL_GROUPS.find((x) => x.re.test(v));
        if (!g) { console.warn('calls: no group for', v); continue; }
        if (!names.has(g.id)) names.set(g.id, new Map());
        names.get(g.id).set(v, port === 'srv_name' ? 'service' : 'topic');
      }
    }
  }
  // a group's names by kind, each kind's names sharing their common prefix ("command/actuator/" + arm, torpedo, ...)
  const nameLine = (m) => {
    const kinds = [...new Set(m.values())].sort((a, b) => (a === 'service' ? -1 : 1));
    return kinds.map((kind) => {
      const vs = [...m.keys()].filter((v) => m.get(v) === kind).sort();
      let pre = '';
      if (vs.length > 1) {
        const cut = vs[0].lastIndexOf('/') + 1;
        if (cut && vs.every((v) => v.startsWith(vs[0].slice(0, cut)))) pre = vs[0].slice(0, cut);
      }
      return `<span class="cg-kind">${kind}${vs.length > 1 ? 's' : ''}</span>${pre ? `<code class="cg-pre">${wb(pre)}</code>` : ''}${vs.map((v) => `<code>${wb(v.slice(pre.length))}</code>`).join('<span class="cg-sep">, </span>')}`;
    }).join('<br>');
  };
  const item = (g) => `<li class="cg"><div class="cg-head"><b>${g.title}</b> <span>${g.by}</span></div><div class="cg-names">${nameLine(names.get(g.id))}</div></li>`;
  const main = CALL_GROUPS.filter((g) => g.main && names.has(g.id)), rest = CALL_GROUPS.filter((g) => !g.main && names.has(g.id));
  const nRest = rest.reduce((a, g) => a + names.get(g.id).size, 0);
  document.getElementById('calls-table').innerHTML = `<ul class="calls">${main.map(item).join('')}</ul>
    ${rest.length ? `<details class="calls-more"><summary>${nRest} more: ${rest.map((g) => g.title.toLowerCase()).join(', ')}</summary><ul class="calls">${rest.map(item).join('')}</ul></details>` : ''}`;
}

// ---------- LED status ----------
function ledTable(cat) {
  const used = Object.fromEntries((cat.nodes.find((n) => n.id === 'SetStatus').use.values.status || []).map(([v, c]) => [v, c]));
  // SetStatus.btaction.hpp (colours, modes) and the README's meanings
  const L = [
    ['waiting', [255, 0, 0], 'solid', 'Waiting for the kill switch'],
    ['starting', [0, 0, 255], 'slow', 'Kill switch in, starting'],
    ['moving', [0, 255, 0], 'solid', 'Moving to the next task'],
    ['searching', [255, 100, 0], 'solid', 'Searching for a task'],
    ['aligning', [255, 0, 255], 'slow', 'Lining up with a task'],
    ['performing', [0, 0, 255], 'fast', 'Doing a task'],
    ['success', [0, 255, 0], 'breath', 'Tree ended in SUCCESS'],
    ['failure', [255, 0, 0], 'breath', 'Tree failed or was stopped'],
    ['panic', [255, 0, 0], 'fast', 'Tree crashed'],
    ['undefined', [255, 255, 255], 'solid', 'Unknown status name'],
  ];
  const MODE = { solid: 'solid', slow: 'slow flash', fast: 'fast flash', breath: 'breathing' };
  const DOTASK = new Set(['success', 'failure', 'panic']);
  document.getElementById('led-table').innerHTML = `<ul class="leds">${L.map(([name, rgb, mode, meaning]) => `<li>
      <span class="led ${mode}" style="--led:rgb(${rgb.join(',')})" aria-hidden="true"></span>
      <span class="led-txt"><span class="led-top"><code>${name}</code><small>${MODE[mode]} · ${DOTASK.has(name) ? 'doTask' : used[name] ? `×${used[name]}` : 'unused'}</small></span><span class="led-mean">${meaning}</span></span></li>`).join('')}</ul>`;
}

// ---------- the frames ComputeFrameAlignment lines up, from the competition tree's values ----------
function linkList(cat) {
  const TOOL = { 'talos/dfc_base_link': 'the down camera', 'talos/claw_link': 'the claw', 'talos/ffc_base_link': 'the forward camera',
    'talos/magnet_link': 'the magnet', 'talos/droppers_link': 'the dropper', 'talos/torpedo_0_link': 'torpedo tube 0', 'talos/torpedo_1_link': 'torpedo tube 1' };
  const vals = (cat.nodes.find((n) => n.id === 'ComputeFrameAlignment')?.use.values.link_frame || []).map(([v]) => v).filter((v) => v && !v.startsWith('('));
  if (!vals.length) return;
  const names = [];
  for (const v of vals) {
    const t = TOOL[v];
    if (!t) names.push(`<code>${esc(v)}</code>`);
    else if (t.startsWith('torpedo')) { if (!names.includes('both torpedo tubes')) names.push(vals.filter((x) => TOOL[x]?.startsWith('torpedo')).length > 1 ? 'both torpedo tubes' : t); }
    else names.push(t);
  }
  document.getElementById('link-list').innerHTML = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
}

// ---------- the torpedo video: the running node, under the video, in step with it ----------
function videoLabels(data) {
  const v = document.getElementById('torpedo-video'), box = document.getElementById('torpedo-node');
  if (!v || !box) return;
  const L = data.labels;
  let cur = null;
  const set = () => {
    const t = v.currentTime;
    const l = L.find((x) => t >= x.t0 && t < x.t1) || (t >= L.at(-1).t1 ? L.at(-1) : L[0]);
    if (l === cur) return;
    cur = l;
    box.innerHTML = `<code>${esc(l.node)}</code><span>${esc(l.step)}</span>`;
  };
  let raf = null;
  const loop = () => { set(); raf = v.paused ? null : requestAnimationFrame(loop); };
  v.addEventListener('play', () => { if (!raf) raf = requestAnimationFrame(loop); });
  v.addEventListener('seeked', set);
  v.addEventListener('timeupdate', set);
  set();
}

// ---------- go ----------
lifeFlow();
doTaskFlow();
// set from here: Vite's dev server rewrites media URLs written in the HTML
for (const v of document.querySelectorAll('video[data-src]')) { v.poster = `${BASE}${v.dataset.src}.jpg`; v.src = `${BASE}${v.dataset.src}.mp4`; }
pathBuilder();
Promise.all([
  fetch(`${BASE}data/bt-nodes/catalogue.json`).then((r) => r.json()),
  fetch(`${BASE}data/bt-nodes/mission_time.json`).then((r) => r.json()),
  fetch(`${BASE}data/bt-nodes/torpedo_labels.json`).then((r) => r.json()),
]).then(([cat, mt, labels]) => {
  const total = mt.end - mt.start, share = (id) => Math.round((100 * (mt.rows.find((r) => r.id === id)?.secs || 0)) / total);
  const bind = {
    total: fmtInt(cat.comp.nodeInstances + cat.comp.subtreeInstances), custom: fmtInt(cat.comp.customInstances),
    files: String(cat.source.treeFiles), runlen: `${Math.round(total)} s`, used: String(cat.nodes.filter((n) => n.use.instances).length),
    fp: `${share('FollowPath')} %`, wait: `${share('Wait')} %`,
  };
  document.querySelectorAll('[data-bind]').forEach((e) => { if (bind[e.dataset.bind]) e.textContent = bind[e.dataset.bind]; });
  linkList(cat);
  loadChart(cat);
  catalogue(cat);
  callsTable(cat);
  ledTable(cat);
  timeChart(cat, mt);
  videoLabels(labels);
});
