import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/interfaces.css';

setup();

const BASE = import.meta.env.BASE_URL;
const NS = '/talos/';
const MSG_REPO = 'https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_msgs/';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const KINDS = [['all', 'All'], ['topic', 'Topics'], ['service', 'Services'], ['action', 'Actions'], ['frame', 'Frames'], ['node', 'Nodes']];
const WHERE = [['all', 'Anywhere'], ['both', 'Robot + sim'], ['robot', 'Robot only'], ['sim', 'Sim only']];
const AVAIL_LABEL = { both: 'Robot + sim', robot: 'Robot only', sim: 'Sim only' };
const SIDE_LABEL = { stack: 'robot + sim', robot: 'robot', board: 'firmware', laptop: 'laptop', tool: 'tool', sim: 'sim' };
const SIDE_LONG = {
  stack: 'On the Orin, and the same node in Nereus',
  robot: 'Only on Talos (the Orin)',
  board: 'Firmware on a circuit board (micro-ROS)',
  laptop: 'On the operator laptop, with Talos or Nereus',
  tool: 'Run by hand on Talos for a session',
  sim: 'Only in Nereus',
};
const nodeAvail = (side) => (side === 'sim' ? 'sim' : side === 'robot' || side === 'board' || side === 'tool' ? 'robot' : 'both');

// The page's own address for a row: names without /talos/ and without a leading '/'.
const anchorName = (kind, name) => {
  let n = name;
  if (n === '/<hostname>/autonomy/bag_trigger') n = 'autonomy/bag_trigger';
  return `${kind}-${n.replace(/^\//, '')}`;
};
const fullName = (it) => (it.kind === 'frame' || it.kind === 'node' || it.name.startsWith('/') ? it.name : NS + it.name);
// Let long names break after '/' and '_' rather than mid-word.
const brk = (s) => esc(s).replace(/([/_])/g, '$1<wbr>');
const shortType = (t) => (t ? t.split('/').pop() : '');
const typeUrl = (t) => {
  const [pkg, sub, name] = t.split('/');
  if (pkg === 'riptide_msgs2') return `${MSG_REPO}${sub}/${name}.${sub}`;
  if (pkg === 'nortek_dvl_msgs') return `https://github.com/osu-uwrt/nortek_dvl/tree/DvlWaterTrackFallback/nortek_dvl_msgs/${sub}`;
  if (['std_msgs', 'geometry_msgs', 'sensor_msgs', 'nav_msgs', 'diagnostic_msgs', 'visualization_msgs', 'std_srvs'].includes(pkg))
    return `https://github.com/ros2/common_interfaces/blob/humble/${pkg}/${sub}/${name}.${sub}`;
  if (['rcl_interfaces', 'rosgraph_msgs'].includes(pkg)) return `https://github.com/ros2/rcl_interfaces/blob/humble/${pkg}/${sub}/${name}.${sub}`;
  if (pkg === 'tf2_msgs') return `https://github.com/ros2/geometry2/blob/humble/tf2_msgs/${sub}/${name}.${sub}`;
  return null;
};
const hz = (v) => (v == null ? '' : v >= 100 ? Math.round(v) : v >= 10 ? v.toFixed(1).replace(/\.0$/, '') : v.toFixed(2).replace(/0$/, '').replace(/\.0$/, ''));

fetch(BASE + 'data/interfaces/interfaces.json').then((r) => r.json()).then(build);

function build(D) {
  const nodes = Object.fromEntries(D.nodes.map((n) => [n.id, n]));
  const subLabel = Object.fromEntries(D.subsystems.map((s) => [s.id, s.label]));
  const rows = [
    ...D.items,
    ...D.nodes.map((n) => ({ ...n, kind: 'node', name: n.id, avail: nodeAvail(n.side), node: n })),
  ];
  const order = Object.fromEntries(D.subsystems.map((s, i) => [s.id, i]));
  const korder = { topic: 0, service: 1, action: 2, frame: 3, node: 4 };
  rows.sort((a, b) => order[a.sub] - order[b.sub] || korder[a.kind] - korder[b.kind] || a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

  // id -> row, plus the course objects' own names
  const byId = new Map();
  for (const r of rows) {
    r.id = anchorName(r.kind, r.name);
    byId.set(r.id, r);
    for (const a of r.aliases || []) byId.set(anchorName(r.kind, a), r);
  }
  for (const r of rows) r.hay = haystack(r).toLowerCase();

  // ---------------------------------------------------------------- controls
  const q = document.getElementById('ifx-q');
  const kindEl = document.getElementById('ifx-kind');
  const whereEl = document.getElementById('ifx-where');
  const subEl = document.getElementById('ifx-sub');
  const countEl = document.getElementById('ifx-count');
  const clearEl = document.getElementById('ifx-clear');
  const list = document.getElementById('ifx-list');
  const state = { kind: 'all', where: 'all', sub: 'all', q: '' };

  const seg = (el, opts, key) => {
    el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${state[key] === v}">${l}</button>`).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state[key] = b.dataset.v;
      sync();
      apply();
    });
  };
  seg(kindEl, KINDS, 'kind');
  seg(whereEl, WHERE, 'where');
  subEl.innerHTML += D.subsystems.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  subEl.addEventListener('change', () => { state.sub = subEl.value; apply(); });
  let t = 0;
  q.addEventListener('input', () => { state.q = q.value; clearTimeout(t); t = setTimeout(apply, 90); });
  clearEl.addEventListener('click', () => { reset(); apply(); q.focus(); });
  function sync() {
    for (const [el, key] of [[kindEl, 'kind'], [whereEl, 'where']])
      el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state[key])));
    subEl.value = state.sub;
    q.value = state.q;
  }
  function reset() { Object.assign(state, { kind: 'all', where: 'all', sub: 'all', q: '' }); sync(); }

  // ---------------------------------------------------------------- the list
  // On a phone with nothing typed or filtered, each group shows its first few rows and a button for the rest,
  // so the figures after the reference aren't buried under 300 cards. Any search or filter shows every match.
  const PREVIEW = 4;
  const compactMq = matchMedia('(max-width: 700px)');
  const expanded = new Set();
  const groups = new Map();
  const groupRows = new Map();
  const more = new Map();
  const frag = document.createDocumentFragment();
  for (const r of rows) {
    if (!groups.has(r.sub)) {
      const h = document.createElement('div');
      h.className = 'ifx-group';
      h.textContent = subLabel[r.sub];
      groups.set(r.sub, h);
      groupRows.set(r.sub, []);
      frag.appendChild(h);
    }
    r.el = rowEl(r);
    groupRows.get(r.sub).push(r);
    frag.appendChild(r.el);
  }
  for (const [s, lst] of groupRows) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ifx-more';
    b.dataset.sub = s;
    b.hidden = true;
    lst[lst.length - 1].el.after(b);
    more.set(s, b);
  }
  list.appendChild(frag);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button.ifx-more');
    if (!b) return;
    expanded.add(b.dataset.sub);
    apply();
  });
  compactMq.addEventListener('change', () => apply());
  list.addEventListener('toggle', (e) => {
    const d = e.target;
    if (d.matches?.('details.ifx-row') && d.open && !d.dataset.done) {
      d.querySelector('.ifx-detail').innerHTML = detail(byId.get(d.id));
      d.dataset.done = '1';
    }
  }, true);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button.ifx-copy');
    if (!b) return;
    const url = location.href.split('#')[0] + '#' + b.dataset.id;
    (navigator.clipboard?.writeText(url) ?? Promise.reject()).then(
      () => { b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500); },
      () => { history.replaceState(null, '', '#' + b.dataset.id); });
  });

  function apply() {
    const words = state.q.trim().toLowerCase().replace(/^\/talos\//, '').split(/\s+/).filter(Boolean)
      .map((w) => w.replace(/^\/talos\//, ''));
    let n = 0;
    const seen = new Set();
    const filtered = state.kind !== 'all' || state.where !== 'all' || state.sub !== 'all' || words.length;
    const compact = !filtered && compactMq.matches;
    for (const [s, lst] of groupRows) {
      let k = 0;
      for (const r of lst) {
        const ok = (state.kind === 'all' || r.kind === state.kind)
          && (state.where === 'all' || r.avail === state.where)
          && (state.sub === 'all' || r.sub === state.sub)
          && words.every((w) => r.hay.includes(w));
        if (ok) { n++; k++; seen.add(s); }
        r.el.hidden = !ok || (compact && !expanded.has(s) && k > PREVIEW && !r.el.open);
      }
      const rest = lst.filter((r) => r.el.hidden).length;
      const b = more.get(s);
      b.hidden = !compact || expanded.has(s) || rest === 0;
      if (!b.hidden) b.textContent = `Show all ${lst.length} in ${subLabel[s]}`;
    }
    for (const [s, h] of groups) h.hidden = !seen.has(s);
    countEl.textContent = filtered ? `${n} of ${rows.length} shown` : `${rows.length} entries`;
    clearEl.hidden = !filtered;
    list.classList.toggle('empty', n === 0);
  }
  apply();

  // ---------------------------------------------------------------- deep links
  function openHash() {
    const id = decodeURIComponent(location.hash.slice(1));
    const r = byId.get(id);
    if (!r) return;
    reset();
    expanded.add(r.sub);
    apply();
    r.el.open = true;
    requestAnimationFrame(() => {
      r.el.scrollIntoView({ block: 'start' });
      r.el.classList.remove('flash');
      void r.el.offsetWidth;
      r.el.classList.add('flash');
    });
  }
  addEventListener('hashchange', openHash);
  openHash();

  // Same-page links to the hash already in the address bar fire no hashchange: open the row anyway.
  document.querySelector('main').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const id = decodeURIComponent(a.getAttribute('href').slice(1));
    if (id !== decodeURIComponent(location.hash.slice(1)) || !byId.has(id)) return;
    e.preventDefault();
    openHash();
  });

  // Reset every filter, then set some, and scroll to the reference.
  function showOnly(f) {
    reset();
    Object.assign(state, f);
    sync();
    apply();
    document.getElementById('ifx-fig').scrollIntoView({ block: 'start' });
  }
  document.querySelectorAll('.ifx-jump').forEach((b) => b.addEventListener('click', () => showOnly({ kind: b.dataset.kind })));

  swapTable(D, nodes, showOnly);
  configTable(D);

  // ---------------------------------------------------------------- pieces
  function haystack(r) {
    const parts = [r.name, r.kind, r.note, r.role, r.package, r.parent, r.fq];
    if (r.kind !== 'node' && r.kind !== 'frame') parts.push(NS + r.name);
    for (const t of r.types || []) parts.push(t);
    for (const e of [...(r.pubs || []), ...(r.subs || [])]) parts.push(e.n, nodes[e.n]?.fq);
    for (const o of r.objects || []) parts.push(o);
    return parts.filter(Boolean).join(' ');
  }

  function endsShort(r) {
    if (r.kind === 'node') {
      const t = r.touch || [];
      const p = t.filter((x) => x[2] === 'pubs').length;
      const s = t.filter((x) => x[2] === 'subs').length;
      return `<span class="ifx-ends"><span>${p} out</span><i>·</i><span>${s} in</span></span>`;
    }
    const names = (lst) => (lst || []).map((e) => `${esc(e.n)}${e.c > 1 ? `<small>×${e.c}</small>` : ''}`);
    const pubs = names(r.pubs);
    const subs = names(r.subs);
    const fmt = (a, none) => (a.length === 0 ? `<em>${none}</em>` : a.length <= 2 ? a.join(', ') : `${a.slice(0, 2).join(', ')} <small>+${a.length - 2}</small>`);
    if (r.kind === 'frame') return `<span class="ifx-ends"><span>${fmt(pubs, '')}</span></span>`;
    return `<span class="ifx-ends"><span>${fmt(pubs, 'no publisher')}</span><i>→</i><span>${fmt(subs, r.kind === 'topic' ? 'no subscriber' : 'no caller seen')}</span></span>`;
  }

  function rateShort(r) {
    if (r.kind === 'frame') {
      if (r.static) return '<span class="ifx-rate"><b>static</b></span>';
      return r.sim_hz ? `<span class="ifx-rate"><span><i>Nereus</i> ${hz(r.sim_hz)} Hz</span></span>` : '<span class="ifx-rate"><span><i>on change</i></span></span>';
    }
    if (r.kind !== 'topic') return '<span class="ifx-rate"></span>';
    const out = [];
    if (r.robot_hz) out.push(`<span><i>Talos</i> ${hz(r.robot_hz.hz)} Hz</span>`);
    if (r.sim_hz) {
      const m = Math.max(...r.sim_hz.filter((x) => x != null));
      const v = r.sim_hz_range ? `${Math.round(r.sim_hz[0])}–${Math.round(r.sim_hz[1])} Hz` : m === 0 ? 'idle' : `${hz(m)} Hz`;
      out.push(`<span${m === 0 ? ' title="Nothing was sent during either 3 s measurement"' : ''}><i>Nereus</i> ${v}</span>`);
    }
    return `<span class="ifx-rate">${out.join('')}</span>`;
  }

  function rowEl(r) {
    const d = document.createElement('details');
    d.className = `ifx-row k-${r.kind}`;
    d.id = r.id;
    const isNode = r.kind === 'node';
    const typ = isNode ? esc(r.package.replace(/:.*/, '')) : r.kind === 'frame'
      ? (r.alt ? r.alt.map((x) => `<span class="ifx-parent">${brk(x.parent)} → <i>${x.avail === 'robot' ? 'Talos' : 'Nereus'}</i></span>`).join('')
        : `<span class="ifx-parent">${brk(r.parent)} →</span>`)
      : (r.types || []).map((x) => esc(shortType(x)).replace(/([a-z])([A-Z])/g, '$1<wbr>$2')).join(', ');
    const flags = [];
    if (r.nopub && r.kind === 'topic') flags.push('<span class="ifx-flag">no publisher</span>');
    if (r.status) flags.push(`<span class="ifx-flag">${esc(r.status)}</span>`);
    if (r.latched) flags.push('<span class="ifx-flag soft">latched</span>');
    d.innerHTML = `<summary>
      <span class="ifx-name"><span class="ifx-k k-${r.kind}">${r.kind}</span><span class="ifx-nm"><code>${brk(r.name)}</code>${flags.join('')}</span></span>
      <span class="ifx-type">${typ}</span>
      ${endsShort(r)}
      <span class="ifx-rw">${rateShort(r)}<span class="ifx-where w-${r.avail}">${AVAIL_LABEL[r.avail]}</span></span>
    </summary><div class="ifx-detail"></div>`;
    return d;
  }

  function nodeRef(e, withSide = true) {
    const n = nodes[e.n];
    if (!n) return esc(e.n);
    const side = withSide ? `<span class="ifx-side s-${n.side}">${SIDE_LABEL[n.side]}</span>` : '';
    const code = e.code ? ` <a class="ifx-code" href="${e.code}" target="_blank" rel="noopener">code</a>` : '';
    const cnt = e.c > 1 ? ` <small class="ifx-x">×${e.c}</small>` : '';
    return `<li><a href="#${anchorName('node', n.id)}"><code>${esc(n.id)}</code></a>${cnt}${side}${code}</li>`;
  }

  function line(label, html) {
    return html ? `<div class="ifx-dl"><span>${label}</span><div>${html}</div></div>` : '';
  }

  function chapters(r) {
    if (!r.ch?.length) return '';
    return `<ul class="ifx-ch">${r.ch.map((c, i) => `<li${i ? '' : ' class="main"'}><a href="${c.href}">${esc(c.page)}${c.sec ? `<span>: ${esc(c.sec)}</span>` : ''}</a></li>`).join('')}</ul>`;
  }

  function tryCmd(r) {
    const n = fullName(r);
    if (r.kind === 'topic') {
      if (r.name.includes('<')) return `ros2 topic list | grep ${n.replace('<object>', '')}`;
      return `ros2 topic ${r.types?.[0]?.includes('Image') || r.types?.[0]?.includes('PointCloud') ? 'hz' : 'echo --once'} ${n}`;
    }
    if (r.kind === 'service') return `ros2 service type ${n}`;
    if (r.kind === 'action') return `ros2 action info ${n}`;
    if (r.kind === 'frame') return r.name.includes('<') || r.parent.includes(' ') ? 'ros2 run tf2_tools view_frames' : `ros2 run tf2_ros tf2_echo ${r.parent} ${r.name}`;
    if (r.kind === 'node') return r.fq.includes(',') ? null : `ros2 node info ${r.fq}`;
    return null;
  }

  function detail(r) {
    if (r.kind === 'node') return nodeDetail(r);
    const out = [];
    if (r.note) out.push(`<p class="ifx-note">${esc(r.note)}</p>`);
    if (r.kind === 'frame') {
      const par = (x) => `<code>${esc(x.parent)}</code>${x.static ? ' (static, on <code>/tf_static</code>)' : ' (on <code>/tf</code>)'}`;
      if (r.alt) out.push(line('Parent', r.alt.map((x) => `<div><b>${x.avail === 'robot' ? 'Talos' : 'Nereus'}</b> ${par(x)}, from <a href="#node-${esc(x.pubs[0].n)}"><code>${esc(x.pubs[0].n)}</code></a></div>`).join('')));
      else out.push(line('Parent', par(r)));
      if (r.xyz) out.push(line('Sample', `<span class="ifx-num">xyz ${r.xyz.map((v) => v.toFixed(3)).join(', ')} m · quat ${r.quat.map((v) => v.toFixed(3)).join(', ')}</span> <small>(Nereus)</small>`));
      out.push(line('Published by', `<ul class="ifx-nodes">${r.pubs.map((e) => nodeRef(e)).join('')}</ul>`));
      if (r.objects) out.push(line(`${r.objects.length} frames`, `<div class="ifx-objs">${r.objects.map((o) => `<code>${esc(o)}</code>`).join('')}</div>`));
      if (r.tree) out.push(line('Parents', `<div class="ifx-objs">${r.tree.filter((p) => !['map', 'offset'].includes(p[0])).map((p) => `<code>${esc(p[0].replace('_frame', ''))} → ${esc(p[1].replace('_frame', ''))}</code>`).join('')}</div>`));
    } else {
      out.push(line('Full name', `<code>${esc(fullName(r))}</code>`));
      out.push(line('Type', (r.types || []).map((t) => { const u = typeUrl(t); return u ? `<a href="${u}" target="_blank" rel="noopener"><code>${esc(t)}</code></a>` : `<code>${esc(t)}</code>`; }).join('<br>')));
      const pl = { topic: ['Published by', 'Subscribed by'], service: ['Served by', 'Called by'], action: ['Served by', 'Sent goals by'] }[r.kind];
      out.push(line(pl[0], r.pubs.length ? `<ul class="ifx-nodes">${r.pubs.map((e) => nodeRef(e)).join('')}</ul>` : '<em>Nothing in the current stack</em>'));
      out.push(line(pl[1], r.subs.length ? `<ul class="ifx-nodes">${r.subs.map((e) => nodeRef(e)).join('')}</ul>` : `<em>${r.kind === 'topic' ? 'Nothing subscribes' : 'No caller in the capture'}</em>`));
      if (r.objects) out.push(line(`${r.objects.length} objects`, `<div class="ifx-objs">${r.objects.map((o) => `<code>${esc(o)}</code>`).join('')}</div>`));
      if (r.kind === 'topic') out.push(line('Rate', rateLong(r)));
      if (r.qos?.length || r.latched) out.push(line('QoS', `${(r.qos || []).map((x) => `<code>${esc(x)}</code>`).join(' ')}${r.latched ? ' · latched: late subscribers get the last message' : ''}`));
      if (r.bytes) out.push(line('Size', `${r.bytes >= 1e6 ? (r.bytes / 1e6).toFixed(1) + ' MB' : r.bytes >= 1e3 ? (r.bytes / 1e3).toFixed(1) + ' kB' : r.bytes + ' bytes'} per message <small>(Nereus)</small>`));
    }
    out.push(line('Explained in', chapters(r)));
    const cmd = tryCmd(r);
    out.push(`<div class="ifx-foot">${cmd ? `<code class="ifx-cmd">${esc(cmd)}</code>` : ''}<span class="ifx-btns">${r.src ? `<a class="ifx-src" href="${r.src}" target="_blank" rel="noopener">Source on GitHub</a>` : ''}<button type="button" class="ifx-copy" data-id="${esc(r.id)}">Copy link</button></span></div>`);
    return out.join('');
  }

  function rateLong(r) {
    const out = [];
    if (r.robot_hz) {
      const how = r.robot_hz.how === 'pool bag' ? 'measured in the 26 Oct 2026 pool bag' : `set in code: ${esc(r.robot_hz.how)}`;
      out.push(`<div><b>Talos</b> ${hz(r.robot_hz.hz)} Hz, ${r.robot_hz.url ? `<a href="${r.robot_hz.url}" target="_blank" rel="noopener">${how}</a>` : how}</div>`);
    } else if (r.avail !== 'sim') out.push('<div><b>Talos</b> <em>not measured</em></div>');
    if (r.sim_hz) {
      if (r.sim_hz_range) out.push(`<div><b>Nereus</b> ${hz(r.sim_hz[0])} to ${hz(r.sim_hz[1])} Hz across the objects (holding still before the tree run)</div>`);
      else out.push(`<div><b>Nereus</b> ${r.sim_hz.map((v) => (v == null ? '–' : hz(v))).join(' and ')} Hz, measured before and after the tree run</div>`);
    }
    if (r.sim_cfg_hz != null) out.push(`<div><b>Bridge</b> ${r.sim_cfg_hz === 0 ? 'sent on events' : `${hz(r.sim_cfg_hz)} Hz`}, as configured in Nereus's bridge.yaml</div>`);
    return out.join('');
  }

  function nodeDetail(r) {
    const n = r.node;
    const out = [];
    out.push(`<p class="ifx-note">${esc(n.role)}</p>`);
    out.push(line('Full name', `<code>${esc(n.fq)}</code>`));
    out.push(line('Package', `<code>${esc(n.package)}</code>`));
    out.push(line('Runs', esc(SIDE_LONG[n.side])));
    const files = [];
    if (n.launch) files.push(`<li>Launched by <a href="${n.launch}" target="_blank" rel="noopener"><code>${esc(n.launch.split('/').pop())}</code></a></li>`);
    for (const c of n.config || []) files.push(`<li><a href="${c.url}" target="_blank" rel="noopener"><code>${esc(c.path)}</code></a></li>`);
    if (n.source) files.push(`<li>Code: <a href="${n.source}" target="_blank" rel="noopener"><code>${esc(n.source.split('/').slice(7).join('/'))}</code></a></li>`);
    out.push(line('Files', `<ul class="ifx-files">${files.join('')}</ul>`));
    const touch = n.touch || [];
    const groupsT = [['pubs', 'topic', 'Publishes'], ['subs', 'topic', 'Subscribes'], ['pubs', 'service', 'Serves'], ['subs', 'service', 'Calls'],
      ['pubs', 'action', 'Action server'], ['subs', 'action', 'Action client'], ['pubs', 'frame', 'TF frames']];
    for (const [role, kind, label] of groupsT) {
      const l = touch.filter((x) => x[0] === kind && x[2] === role);
      if (!l.length) continue;
      out.push(line(label, `<div class="ifx-objs">${l.map((x) => `<a href="#${anchorName(kind, x[1])}"><code>${esc(x[1])}</code></a>`).join('')}</div>`));
    }
    if (n.param_clients) out.push(line('Also', `Reads and sets the parameters of ${n.param_clients.map((p) => `<a href="#node-${esc(p)}"><code>${esc(p)}</code></a>`).join(', ')} through its parameter services.`));
    if (n.params) {
      const keys = Object.keys(n.params);
      out.push(line('Parameters', `<details class="ifx-params"><summary>All ${keys.length}, as loaded in the Nereus run</summary><table class="params wrap-first"><tbody>${keys.map((k) => `<tr><td><code>${esc(k)}</code></td><td><code>${esc(fmtVal(n.params[k]))}</code></td></tr>`).join('')}</tbody></table></details>`));
    }
    if (n.ch) out.push(line('Explained in', `<ul class="ifx-ch"><li class="main"><a href="${n.ch.href}">${esc(n.ch.page)}${n.ch.sec ? `<span>: ${esc(n.ch.sec)}</span>` : ''}</a></li></ul>`));
    const cmd = tryCmd(r);
    out.push(`<div class="ifx-foot">${cmd ? `<code class="ifx-cmd">${esc(cmd)}</code>` : ''}<span class="ifx-btns"><button type="button" class="ifx-copy" data-id="${esc(r.id)}">Copy link</button></span></div>`);
    return out.join('');
  }
}

function fmtVal(v) {
  if (Array.isArray(v)) {
    const s = JSON.stringify(v);
    return s.length > 160 ? s.slice(0, 157) + '…]' : s;
  }
  if (typeof v === 'string' && v.length > 160) return v.slice(0, 157) + '…';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// Names whose sender or receiver differs between Talos and Nereus.
function swapTable(D, nodes, showOnly) {
  const box = document.getElementById('swap');
  const real = (lst) => lst.filter((e) => ['robot', 'board', 'tool'].includes(nodes[e.n]?.side) && e.n !== 'pool_identify');
  const sim = (lst) => lst.filter((e) => nodes[e.n]?.side === 'sim');
  const fmt = (lst, none) => (lst.length ? lst.map((e) => `<code>${esc(e.n)}</code>`).join(', ') : `<em>${none}</em>`);
  const PASSIVE = new Set(['odometry/filtered', '/tf', '/tf_static', '/clock', '/parameter_events', '/rosout']);
  const rows = [];
  for (const it of D.items) {
    if (it.kind !== 'topic' && it.kind !== 'service') continue;
    if (it.avail !== 'both' || PASSIVE.has(it.name)) continue;
    const rp = real(it.pubs), sp = sim(it.pubs), rs = real(it.subs), ss = sim(it.subs);
    if (it.kind === 'service') {
      if (sp.length) rows.push({ it, dir: 'srv', talos: fmt(it.pubs.filter((e) => nodes[e.n]?.side !== 'sim')), nereus: fmt(it.pubs) });
    } else if (rp.length && sp.length) rows.push({ it, dir: 'pub', talos: fmt(rp), nereus: fmt(sp) });
    else if (sp.length) {
      let talos = fmt(it.pubs.filter((e) => nodes[e.n]?.side !== 'sim'));
      if (it.name === 'depth/pose') talos += '<br><small>Orin software, from the board\'s state/depth/raw. It runs in Nereus too, but gets no raw depth there.</small>';
      rows.push({ it, dir: 'pub', talos, nereus: fmt(sp) });
    }
    else if (ss.length) rows.push({ it, dir: 'sub', talos: fmt(rs, it.name === 'thruster_forces' ? 'nothing: the MPC sends RPM over CAN' : 'nothing'), nereus: fmt(ss) });
  }
  const cams = rows.filter((r) => /^(ffc|dfc)\/zed_node\//.test(r.it.name));
  if (cams.length) {
    const i = rows.indexOf(cams[0]);
    const kinds = [...new Set(cams.map((r) => r.it.name.replace(/^(ffc|dfc)\/zed_node\//, '')))];
    rows.splice(i, 0, { dir: 'pub', html: `<tr><td><button type="button" class="ifx-link ifx-q" data-q="zed_node"><code>ffc/zed_node/…</code>, <code>dfc/zed_node/…</code></button><br><small>${kinds.map(esc).join(', ')}</small></td><td><code>ffc_zed_node</code>, <code>dfc_zed_node</code></td><td><code>physics_simulator</code></td></tr>` });
    for (const c of cams) rows.splice(rows.indexOf(c), 1);
  }
  const sect = (dir, title) => {
    const l = rows.filter((r) => r.dir === dir);
    if (!l.length) return '';
    return `<tr class="group"><td colspan="3">${title}</td></tr>` + l.map(({ it, talos, nereus, html }) => html ||
      `<tr><td><a href="#${anchorName(it.kind, it.name)}"><code>${brk(it.name)}</code></a></td><td>${talos}</td><td>${nereus}</td></tr>`).join('');
  };
  const nAvail = (w) => D.items.filter((i) => i.avail === w).length + D.nodes.filter((n) => nodeAvail(n.side) === w).length;
  const simOnly = nAvail('sim');
  const robotOnly = nAvail('robot');
  box.innerHTML = `<table class="params ifx-swap"><thead><tr><th>Name</th><th>On Talos</th><th>In Nereus</th></tr></thead><tbody>
    ${sect('pub', 'Sent by drivers and boards on Talos, by the simulator in Nereus')}
    ${sect('sub', 'Received by boards on Talos, by the simulator in Nereus')}
    ${sect('srv', 'Served by both in Nereus')}
  </tbody></table>
  <p class="ifx-swap-more">Plus <button type="button" class="ifx-link" data-where="robot">${robotOnly} entries that exist only on Talos</button> and <button type="button" class="ifx-link" data-where="sim">${simOnly} only in Nereus</button> (topics, services, actions, frames and nodes).</p>`;
  box.querySelectorAll('button.ifx-q').forEach((b) => b.addEventListener('click', () => showOnly({ q: b.dataset.q })));
  box.querySelectorAll('button.ifx-link[data-where]').forEach((b) => b.addEventListener('click', () => showOnly({ where: b.dataset.where })));
}

function configTable(D) {
  const box = document.getElementById('config-table');
  const SIDE = { stack: 'Orin + Nereus', robot: 'Orin', board: 'board', laptop: 'laptop', tool: 'Orin, by hand', sim: 'Nereus' };
  const rows = D.nodes.filter((n) => n.config?.length || n.params);
  box.innerHTML = `<table class="params ifx-config"><thead><tr><th>Node</th><th>Runs</th><th>Config files</th></tr></thead><tbody>${rows.map((n) =>
    `<tr><td><a href="#node-${esc(n.id)}"><code>${esc(n.id)}</code></a>${n.params ? ' <span class="ifx-flag soft">dump</span>' : ''}</td><td>${SIDE[n.side]}</td><td>${(n.config || []).map((c) =>
      `<a href="${c.url}" target="_blank" rel="noopener"><code>${esc(c.path)}</code></a>`).join('<br>') || '<em>set in the launch file</em>'}</td></tr>`).join('')}</tbody></table>`;
}
