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
const SIDE_LABEL = { stack: 'robot + sim', robot: 'robot', board: 'firmware', laptop: 'laptop', tool: 'tool', sim: 'sim', off: 'not connected' };
const SIDE_LONG = {
  stack: 'On the Orin, and the same node in Nereus',
  robot: 'Only on Talos (the Orin)',
  board: 'Firmware on a circuit board (micro-ROS)',
  laptop: 'On the operator laptop, with Talos or Nereus',
  tool: 'Run by hand on Talos for a session',
  sim: 'Only in Nereus',
  off: 'Firmware on the battery housings. Their CAN agent (can1) is turned off, so it is not on ROS at the moment.',
};
const QOS_TIP = {
  reliable: 'reliable: lost messages are sent again',
  best_effort: 'best effort: lost messages are dropped (sensor data)',
  volatile: 'volatile: a late subscriber gets only new messages',
  transient_local: 'transient local (latched): a late subscriber gets the last message',
};
const nodeAvail = (side) => (side === 'sim' ? 'sim' : ['robot', 'board', 'tool', 'off'].includes(side) ? 'robot' : 'both');

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
  // In each group: the key rows in their curated order, then the rest by kind and name, then unused / debug rows.
  const tier = (r) => (r.key ? 0 : r.minor ? 2 : 1);
  rows.sort((a, b) => order[a.sub] - order[b.sub] || tier(a) - tier(b) || (a.key || 0) - (b.key || 0)
    || korder[a.kind] - korder[b.kind] || a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en', { numeric: true }));

  // id -> row, plus the course objects' own names
  const byId = new Map();
  for (const r of rows) {
    r.id = anchorName(r.kind, r.name);
    byId.set(r.id, r);
    for (const a of r.aliases || []) byId.set(anchorName(r.kind, a), r);
  }
  for (const r of rows) r.hay = haystack(r).toLowerCase();

  // ---------------------------------------------------------------- controls
  const fig = document.getElementById('ifx-fig');
  const panel = document.getElementById('ifx');
  const q = document.getElementById('ifx-q');
  const kindEl = document.getElementById('ifx-kind');
  const whereEl = document.getElementById('ifx-where');
  const subEl = document.getElementById('ifx-sub');
  const countEl = document.getElementById('ifx-count');
  const clearEl = document.getElementById('ifx-clear');
  const backEl = document.getElementById('ifx-back');
  const ftoggle = document.getElementById('ifx-ftoggle');
  const fsum = document.getElementById('ifx-fsum');
  const head = document.getElementById('ifx-head');
  const overview = document.getElementById('ifx-overview');
  const treeBox = document.getElementById('ifx-tree');
  const list = document.getElementById('ifx-list');
  const state = { kind: 'all', where: 'all', sub: 'all', q: '' };

  const seg = (el, opts, key) => {
    el.innerHTML = opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${state[key] === v}">${l}</button>`).join('');
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state[key] = b.dataset.v;
      sync();
      apply(true);
    });
  };
  seg(kindEl, KINDS, 'kind');
  seg(whereEl, WHERE, 'where');
  subEl.innerHTML += D.subsystems.map((s) => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
  subEl.addEventListener('change', () => { state.sub = subEl.value; apply(true); });
  let t = 0;
  q.addEventListener('input', () => {
    // A new search looks in every group, even if one was open.
    if (!state.q.trim() && q.value.trim() && state.sub !== 'all') { state.sub = 'all'; subEl.value = 'all'; }
    state.q = q.value;
    clearTimeout(t);
    t = setTimeout(() => apply(true), 90);
  });
  clearEl.addEventListener('click', () => { reset(); apply(true); });
  backEl.addEventListener('click', () => { state.sub = 'all'; sync(); apply(true); });
  ftoggle.addEventListener('click', () => {
    const open = ftoggle.getAttribute('aria-expanded') !== 'true';
    ftoggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('filters-open', open);
  });
  function sync() {
    for (const [el, key] of [[kindEl, 'kind'], [whereEl, 'where']])
      el.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state[key])));
    subEl.value = state.sub;
    q.value = state.q;
  }
  function reset() { Object.assign(state, { kind: 'all', where: 'all', sub: 'all', q: '' }); sync(); }

  // ---------------------------------------------------------------- overview: one card per subsystem
  const total = (s) => rows.filter((r) => r.sub === s).length;
  overview.innerHTML = D.subsystems.map((s) => {
    const keys = rows.filter((r) => r.sub === s.id && r.key);
    return `<div class="ifx-card">
      <button type="button" class="ifx-card-open" data-sub="${s.id}"><span class="ifx-card-h"><span class="ifx-card-t">${esc(s.label)}</span><span class="ifx-card-n">${total(s.id)} ›</span></span><span class="ifx-card-b">${esc(s.blurb)}</span></button>
      <div class="ifx-chips">${keys.map((r) => `<a class="ifx-chip" href="#${esc(r.id)}"><code>${brk(r.name)}</code></a>`).join('')}</div>
    </div>`;
  }).join('');
  overview.addEventListener('click', (e) => {
    const b = e.target.closest('.ifx-card-open');
    if (!b) return;
    state.sub = b.dataset.sub;
    sync();
    apply(true);
  });

  // ---------------------------------------------------------------- the frame tree (shown with the Frames filter)
  treeBox.innerHTML = frameTree(rows.filter((r) => r.kind === 'frame'));

  // ---------------------------------------------------------------- the list
  const expanded = new Set(); // groups showing every ordinary row
  const minorOpen = new Set(); // groups showing their unused / debug rows
  const groups = new Map();
  const groupRows = new Map();
  const more = new Map();
  const minorBtn = new Map();
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
    const mk = (cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.dataset.sub = s;
      b.hidden = true;
      return b;
    };
    const b = mk('ifx-more');
    const m = mk('ifx-more minor');
    lst[lst.length - 1].el.after(b, m);
    more.set(s, b);
    minorBtn.set(s, m);
  }
  list.appendChild(frag);
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button.ifx-more');
    if (!b) return;
    (b.classList.contains('minor') ? minorOpen : expanded).add(b.dataset.sub);
    if (b.dataset.alsoMinor) minorOpen.add(b.dataset.sub);
    apply();
  });
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

  const queryWords = () => state.q.trim().toLowerCase().split(/\s+/).filter(Boolean).map((w) => w.replace(/^\/talos\//, ''));
  const anyFilter = () => state.kind !== 'all' || state.where !== 'all' || state.sub !== 'all' || queryWords().length > 0;
  const matches = (r, words = queryWords()) => (state.kind === 'all' || r.kind === state.kind)
    && (state.where === 'all' || r.avail === state.where)
    && (state.sub === 'all' || r.sub === state.sub)
    && words.every((w) => r.hay.includes(w));

  // Without a search, a group shows its key rows (at least three rows when "all subsystems" is chosen, every
  // ordinary row when one subsystem is chosen); the rest sit behind "Show n more" and "n unused or debug".
  const CAP = 3;
  function apply(fromControl = false) {
    const words = queryWords();
    const filtered = anyFilter();
    const searching = words.length > 0;
    overview.hidden = filtered;
    list.hidden = !filtered;
    head.hidden = !filtered;
    treeBox.hidden = !(state.kind === 'frame' && !searching && state.where === 'all' && state.sub === 'all');
    const fr = state.kind === 'frame';
    ['Name', 'Type', 'Publishers → subscribers', 'Rate', 'Where'].forEach((l, i) => {
      head.children[i].textContent = fr ? ['Frame', 'Parent', 'Sent by', 'Rate', 'Where'][i] : l;
    });
    let n = 0;
    const seen = new Set();
    for (const [s, lst] of groupRows) {
      let shown = 0;
      let hidMore = 0;
      let hidMinor = 0;
      for (const r of lst) {
        let vis = matches(r, words);
        if (vis) { n++; seen.add(s); }
        if (vis && !searching && !r.el.open) {
          if (r.minor && !minorOpen.has(s)) { vis = false; hidMinor++; }
          else if (!r.minor && state.sub === 'all' && !expanded.has(s) && !r.key && shown >= CAP) { vis = false; hidMore++; }
        }
        if (vis) shown++;
        r.el.hidden = !vis;
      }
      const b = more.get(s);
      b.hidden = hidMore === 0;
      if (!b.hidden) b.textContent = `Show ${hidMore} more in ${subLabel[s]}`;
      const m = minorBtn.get(s);
      m.hidden = hidMinor === 0 || hidMore > 0;
      if (!m.hidden) m.textContent = `Show ${hidMinor} unused or debug ${hidMinor === 1 ? 'entry' : 'entries'}`;
      if (hidMore > 0 && hidMinor > 0) b.textContent = `Show ${hidMore + hidMinor} more in ${subLabel[s]}`;
      if (hidMore > 0 && hidMinor > 0) b.dataset.alsoMinor = '1'; else delete b.dataset.alsoMinor;
    }
    for (const [s, h] of groups) h.hidden = !seen.has(s) || state.sub !== 'all';
    if (!filtered) countEl.innerHTML = `${rows.length} entries in ${D.subsystems.length} groups. Open a group or search.`;
    else if (state.sub === 'all') countEl.textContent = `${n} of ${rows.length} match`;
    else if (searching) countEl.innerHTML = `${n} match in <b>${esc(subLabel[state.sub])}</b>`;
    else countEl.innerHTML = `<b>${esc(subLabel[state.sub])}</b>: ${n} ${n === 1 ? 'entry' : 'entries'}`;
    clearEl.hidden = !filtered;
    backEl.hidden = state.sub === 'all';
    backEl.textContent = searching ? 'Search all groups' : '‹ All groups';
    list.classList.toggle('empty', filtered && n === 0);
    list.dataset.empty = state.sub !== 'all' && searching
      ? `Nothing in ${subLabel[state.sub]} matches. Try "Search all groups".`
      : 'Nothing matches. Try one word, or clear the filters.';
    // the phone's Filters button says what is set
    const bits = [];
    if (state.kind !== 'all') bits.push(KINDS.find((k) => k[0] === state.kind)[1]);
    if (state.where !== 'all') bits.push(AVAIL_LABEL[state.where]);
    if (state.sub !== 'all') bits.push(subLabel[state.sub]);
    fsum.textContent = bits.length ? bits.join(' · ') : 'none';
    ftoggle.classList.toggle('set', bits.length > 0);
    // a search or filter changed while reading further down: bring the bar and the first results back into view
    if (fromControl && fig.getBoundingClientRect().top < 0) fig.scrollIntoView({ block: 'start' });
  }
  apply();

  // Phones: mark the panel while its search box is pinned to the top, so CSS can fill the band above it.
  const searchBox = q.closest('.ifx-search');
  let ticking = false;
  const pinCheck = () => {
    ticking = false;
    const top = fig.getBoundingClientRect().top;
    panel.classList.toggle('pinned', top < 0 && panel.getBoundingClientRect().bottom > searchBox.offsetHeight * 2);
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(pinCheck); } }, { passive: true });

  // ---------------------------------------------------------------- deep links
  // Open a row. Keep the current filters if they show it; otherwise show the row's group.
  function reveal(r, flash = true) {
    if (!anyFilter() || !matches(r)) { reset(); state.sub = r.sub; sync(); }
    expanded.add(r.sub);
    if (r.minor) minorOpen.add(r.sub);
    r.el.open = true;
    apply();
    requestAnimationFrame(() => {
      r.el.scrollIntoView({ block: 'start' });
      if (!flash) return;
      r.el.classList.remove('flash');
      void r.el.offsetWidth;
      r.el.classList.add('flash');
    });
  }
  function openHash() {
    const r = byId.get(decodeURIComponent(location.hash.slice(1)));
    if (r) reveal(r);
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
    fig.scrollIntoView({ block: 'start' });
  }
  document.querySelectorAll('.ifx-jump').forEach((b) => b.addEventListener('click', () => showOnly({ kind: b.dataset.kind })));

  swapCards(D, nodes, showOnly);
  configTable(D);

  // ---------------------------------------------------------------- pieces
  function haystack(r) {
    const parts = [r.name, r.kind, r.note, r.role, r.package, r.parent, r.fq];
    if (r.kind !== 'node' && r.kind !== 'frame') parts.push(NS + r.name);
    for (const ty of r.types || []) parts.push(ty);
    for (const e of [...(r.pubs || []), ...(r.subs || [])]) parts.push(e.n, nodes[e.n]?.fq);
    for (const o of r.objects || []) parts.push(o);
    return parts.filter(Boolean).join(' ');
  }

  // A node name in a row's summary: greyed with "(off)" when it isn't connected.
  function endName(e) {
    const off = nodes[e.n]?.side === 'off';
    return `<span${off ? ' class="ifx-off"' : ''}>${esc(e.n)}${off ? ' (off)' : ''}${e.c > 1 ? `<small>×${e.c}</small>` : ''}</span>`;
  }

  function endsShort(r) {
    if (r.kind === 'node') {
      const tch = r.touch || [];
      const p = tch.filter((x) => x[2] === 'pubs').length;
      const s = tch.filter((x) => x[2] === 'subs').length;
      return `<span class="ifx-ends"><span>${p} out · ${s} in</span></span>`;
    }
    const fmt = (lst, none) => {
      const a = (lst || []).map(endName);
      return a.length === 0 ? `<em>${none}</em>` : a.length <= 2 ? a.join(', ') : `${a.slice(0, 2).join(', ')} <small>+${a.length - 2}</small>`;
    };
    if (r.kind === 'frame') {
      const by = [...new Set(r.pubs.map((e) => e.n))];
      return `<span class="ifx-ends"><span><i class="ifx-lbl">sent by</i> ${by.map(esc).join(', ')}</span></span>`;
    }
    return `<span class="ifx-ends"><span>${fmt(r.pubs, 'no publisher')}</span><i>→</i><span>${fmt(r.subs, r.kind === 'topic' ? 'no subscriber' : 'no caller seen')}</span></span>`;
  }

  function rateShort(r) {
    if (r.kind === 'frame') {
      if (r.static) return '<span class="ifx-rate"><span>static</span></span>';
      return r.sim_hz ? `<span class="ifx-rate"><span><i>Nereus</i> ${hz(r.sim_hz)} Hz</span></span>` : '<span class="ifx-rate"><span>on change</span></span>';
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
    d.className = `ifx-row k-${r.kind}${r.minor ? ' is-minor' : ''}`;
    d.id = r.id;
    let typ;
    if (r.kind === 'node') typ = esc(r.package.replace(/:.*/, ''));
    else if (r.kind === 'frame') {
      typ = r.alt
        ? r.alt.map((x) => `<span class="ifx-parent"><i class="ifx-lbl">parent ${x.avail === 'robot' ? 'on Talos' : 'in Nereus'}</i> <code>${brk(x.parent)}</code></span>`).join('')
        : `<span class="ifx-parent"><i class="ifx-lbl">parent</i> <code>${brk(r.parent)}</code></span>`;
    } else typ = (r.types || []).map((x) => esc(shortType(x)).replace(/([a-z])([A-Z])/g, '$1<wbr>$2')).join(', ');
    const flags = [];
    if (r.nopub && r.kind === 'topic') flags.push('<span class="ifx-flag">no publisher</span>');
    if (r.nolisten) flags.push('<span class="ifx-flag">no listener on Talos</span>');
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
    const code = e.code ? ` <a class="ifx-code" href="${e.code}" target="_blank" rel="noopener">source ↗</a>` : '';
    const cnt = e.c > 1 ? ` <small class="ifx-x">×${e.c}</small>` : '';
    const tree = e.tree ? '<small class="ifx-tree-end">in the tree file, not seen in the capture</small>' : '';
    return `<li${n.side === 'off' ? ' class="ifx-off"' : ''}><a href="#${anchorName('node', n.id)}"><code>${esc(n.id)}</code></a>${cnt}${side}${code}${tree}</li>`;
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

  // One QoS: a line. Several: one line per publisher, saying where it runs.
  function qosLines(r) {
    const qs = r.qos || [];
    if (qs.length < 2) return qs.map(qosHtml).join('');
    const where = (e) => ({ sim: 'Nereus', board: 'Talos', robot: 'Talos', tool: 'Talos' }[nodes[e.n]?.side] || 'Talos and Nereus');
    const by = r.pubs.filter((e) => e.q);
    const both = by.some((e) => nodes[e.n]?.side === 'sim') && by.some((e) => nodes[e.n]?.side !== 'sim');
    return by.map((e) => `<div><code>${esc(e.n)}</code> <small>(${where(e)})</small>: ${qosHtml(e.q)}</div>`).join('')
      + (both ? '<div><small>Each publisher sets its own; the Talos and Nereus ones never run together.</small></div>' : '');
  }

  function qosHtml(x) {
    return x.split('/').map((p) => `<code title="${esc(QOS_TIP[p] || p)}">${esc(p.replace('_', ' '))}</code>`).join(' + ');
  }

  function detail(r) {
    if (r.kind === 'node') return nodeDetail(r);
    const out = [];
    if (r.note) out.push(`<p class="ifx-note">${esc(r.note)}${r.more ? ` <a href="${r.more[1]}">${esc(r.more[0])}</a>` : ''}</p>`);
    if (r.kind === 'frame') {
      const par = (x) => `<code>${esc(x.parent)}</code>${x.static ? ' (static, on <code>/tf_static</code>)' : ' (on <code>/tf</code>)'}`;
      if (r.alt) out.push(line('Parent', r.alt.map((x) => `<div><b>${x.avail === 'robot' ? 'On Talos' : 'In Nereus'}</b> ${par(x)}, from <a href="#node-${esc(x.pubs[0].n)}"><code>${esc(x.pubs[0].n)}</code></a></div>`).join('')));
      else out.push(line('Parent', par(r)));
      if (r.xyz) out.push(line('Sample', `<span class="ifx-num">xyz ${r.xyz.map((v) => v.toFixed(3)).join(', ')} m · quat ${r.quat.map((v) => v.toFixed(3)).join(', ')}</span> <small>(Nereus)</small>`));
      out.push(line('Sent by', `<ul class="ifx-nodes">${r.pubs.map((e) => nodeRef(e)).join('')}</ul>`));
      if (r.objects) out.push(line(`${r.objects.length} frames`, `<div class="ifx-objs">${r.objects.map((o) => `<code>${esc(o)}</code>`).join('')}</div>`));
      if (r.tree) out.push(line('Parents', `<div class="ifx-objs">${r.tree.filter((p) => !['map', 'offset'].includes(p[0])).map((p) => `<code>${esc(p[0].replace('_frame', ''))} → ${esc(p[1].replace('_frame', ''))}</code>`).join('')}</div>`));
    } else {
      out.push(line('Full name', `<code>${esc(fullName(r))}</code>`));
      out.push(line('Type', (r.types || []).map((ty) => { const u = typeUrl(ty); return u ? `<a href="${u}" target="_blank" rel="noopener"><code>${brk(ty)}</code></a>` : `<code>${brk(ty)}</code>`; }).join('<br>')));
      const pl = { topic: ['Published by', 'Subscribed by'], service: ['Served by', 'Called by'], action: ['Served by', 'Sent goals by'] }[r.kind];
      out.push(line(pl[0], r.pubs.length ? `<ul class="ifx-nodes">${r.pubs.map((e) => nodeRef(e)).join('')}</ul>` : '<em>Nothing in the current stack</em>'));
      out.push(line(pl[1], r.subs.length ? `<ul class="ifx-nodes">${r.subs.map((e) => nodeRef(e)).join('')}</ul>` : `<em>${r.kind === 'topic' ? 'Nothing subscribes' : 'No caller in the capture'}</em>`));
      if (r.objects) out.push(line(`${r.objects.length} objects`, `<div class="ifx-objs">${r.objects.map((o) => `<code>${esc(o)}</code>`).join('')}</div>`));
      if (r.kind === 'topic') out.push(line('Rate', rateLong(r)));
      if (r.qos?.length || r.latched) out.push(line('<a href="glossary.html#term-qos">QoS</a>', `${qosLines(r)}${r.latched ? ' · latched: late subscribers get the last message' : ''}`));
      if (r.bytes) out.push(line('Size', `${r.bytes >= 1e6 ? (r.bytes / 1e6).toFixed(1) + ' MB' : r.bytes >= 1e3 ? (r.bytes / 1e3).toFixed(1) + ' kB' : r.bytes + ' bytes'} per message <small>(Nereus)</small>`));
    }
    out.push(line('Explained in', chapters(r)));
    const cmd = tryCmd(r);
    out.push(`<div class="ifx-foot">${cmd ? `<code class="ifx-cmd">${esc(cmd)}</code>` : ''}<span class="ifx-btns">${r.src ? `<a class="ifx-src" href="${r.src}" target="_blank" rel="noopener">Source on GitHub ↗</a>` : ''}<button type="button" class="ifx-copy" data-id="${esc(r.id)}">Copy link</button></span></div>`);
    return out.join('');
  }

  function rateLong(r) {
    const out = [];
    if (r.robot_hz) {
      const how = r.robot_hz.how === 'pool bag' ? 'measured in the 26 Oct 2026 pool bag' : `set in code: ${esc(r.robot_hz.how)}`;
      out.push(`<div><b>Talos</b> ${hz(r.robot_hz.hz)} Hz, ${r.robot_hz.url ? `<a href="${r.robot_hz.url}" target="_blank" rel="noopener">${how}</a>` : how}</div>`);
    } else if (r.avail !== 'sim') out.push('<div><b>Talos</b> <em>not measured</em></div>');
    if (r.sim_hz) {
      const v = r.sim_hz.filter((x) => x != null);
      const same = v.length < 2 || hz(v[0]) === hz(v[1]);
      if (r.sim_hz_range) out.push(`<div><b>Nereus</b> ${hz(r.sim_hz[0])} to ${hz(r.sim_hz[1])} Hz across the objects (holding still before the tree run)</div>`);
      else if (Math.max(...v) === 0) out.push('<div><b>Nereus</b> idle: nothing was sent while it was measured</div>');
      else if (same) out.push(`<div><b>Nereus</b> ${hz(v[0])} Hz${v.length > 1 ? ' (before and after the tree run)' : ''}</div>`);
      else out.push(`<div><b>Nereus</b> ${v[0] === 0 ? 'idle' : `${hz(v[0])} Hz`} before the tree run, ${v[1] === 0 ? 'idle' : `${hz(v[1])} Hz`} after</div>`);
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
    for (const c of n.config || []) files.push(`<li><a href="${c.url}" target="_blank" rel="noopener"><code>${brk(c.path)}</code></a></li>`);
    if (n.source) files.push(`<li>Code: <a href="${n.source}" target="_blank" rel="noopener"><code>${brk(n.source.split('/').slice(7).join('/'))}</code></a></li>`);
    out.push(line('Files', `<ul class="ifx-files">${files.join('')}</ul>`));
    const touch = n.touch || [];
    const groupsT = [['pubs', 'topic', 'Publishes'], ['subs', 'topic', 'Subscribes'], ['pubs', 'service', 'Serves'], ['subs', 'service', 'Calls'],
      ['pubs', 'action', 'Action server'], ['subs', 'action', 'Action client'], ['pubs', 'frame', 'TF frames']];
    for (const [role, kind, label] of groupsT) {
      const l = touch.filter((x) => x[0] === kind && x[2] === role);
      if (!l.length) continue;
      out.push(line(label, `<div class="ifx-objs">${l.map((x) => `<a class="ifx-chip" href="#${anchorName(kind, x[1])}"><code>${brk(x[1])}</code></a>`).join('')}</div>`));
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

// The TF tree as an outline, in three parts: the robot, the course, and the frames only Nereus and the viewer send.
// One line per branch, a frame's leaf children as a row of chips, single-child chains on one line. Talos's parents
// where the two differ; "talos/" is left off.
function frameTree(frames) {
  const parentOf = (f) => (f.name === '<object>_frame' ? 'map' : f.alt ? (f.alt.find((a) => a.avail === 'robot') || f.alt[0]).parent : f.parent);
  const byName = new Map(frames.map((f) => [f.name, f]));
  const kids = new Map();
  for (const f of frames) {
    if (f.name === 'tag36h11:0') continue; // shown on its own line with the course
    const p = parentOf(f);
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(f.name);
  }
  const cmp = (a, b) => a.localeCompare(b, 'en', { numeric: true });
  // minor (unused) frames go last in a row of chips
  for (const l of kids.values()) l.sort((a, b) => (byName.get(a)?.minor ? 1 : 0) - (byName.get(b)?.minor ? 1 : 0) || cmp(a, b));
  const short = (n) => n.replace(/^talos\//, '');
  const chip = (n) => {
    const f = byName.get(n);
    if (!f) return `<code class="ifx-root">${brk(short(n))}</code>`;
    return `<a class="ifx-chip${f.minor ? ' is-minor' : ''}" href="#${esc(anchorName('frame', n))}"${f.minor ? ' title="Unused"' : ''}><code>${brk(short(n))}</code></a>`;
  };
  const sizeOf = (n) => (kids.get(n) || []).reduce((s, c) => s + 1 + sizeOf(c), 0);
  function render(n) {
    const chain = [n];
    let cur = n;
    while ((kids.get(cur) || []).length === 1 && (kids.get(kids.get(cur)[0]) || []).length) { cur = kids.get(cur)[0]; chain.push(cur); }
    const ch = kids.get(cur) || [];
    const leaves = ch.filter((c) => !kids.has(c));
    const branches = ch.filter((c) => kids.has(c));
    const lineHtml = chain.map(chip).join('<i>›</i>');
    const leavesHtml = leaves.length ? `<div class="ifx-leaves">${leaves.map((c) => (c === '<object>_frame' ? `<span class="ifx-via">offset ›</span>${chip(c)}` : chip(c))).join('')}</div>` : '';
    const sub = branches.length ? `<ul>${branches.map(render).join('')}</ul>` : '';
    // Deep camera branches start folded so the outline stays short.
    if (/^talos\/(ffc|dfc)_base_link$/.test(n)) {
      return `<li><span class="ifx-line">${lineHtml}</span><details class="ifx-fold"><summary>${sizeOf(cur)} lens frames below</summary>${leavesHtml}${sub}</details></li>`;
    }
    return `<li><span class="ifx-line">${lineHtml}</span>${leavesHtml}${sub}</li>`;
  }
  const under = (root, branch) => `<li><span class="ifx-line">${chip(root)}</span><ul>${branch}</ul></li>`;
  const part = (title, body) => `<div class="ifx-tpart"><p class="ifx-ttl">${title}</p><ul class="ifx-outline">${body}</ul></div>`;
  const tagLine = ['talos/ffc_left_camera_optical_frame', 'tag36h11:0', 'estimated_origin_frame'].filter((n) => byName.has(n));
  return `<details class="ifx-treebox" open><summary>The frame tree</summary>
    <p class="ifx-treecap">Tap a frame to open its row; <code>talos/</code> is left off. The EKF moves <code>odom › base_link</code>, mapping moves the course frames, and everything under <code>origin</code> is fixed to the hull. Grey frames are unused.</p>
    ${part('The robot', under('world', render('odom')))}
    ${part('The course', under('world', render('map'))
      + `<li><span class="ifx-tnote">AprilTag calibration, while the forward camera sees the tag:</span><span class="ifx-line">${tagLine.map(chip).join('<i>›</i>')}</span></li>`)}
    ${part('Only in Nereus, and the viewer', under('world', render('simulator/talos/base_link')) + render(byName.has('ghost/base_link') ? "the viewer's fixed frame" : ''))}
  </details>`;
}

function fmtVal(v) {
  if (Array.isArray(v)) {
    const s = JSON.stringify(v);
    return s.length > 160 ? s.slice(0, 157) + '…]' : s;
  }
  if (typeof v === 'string' && v.length > 160) return v.slice(0, 157) + '…';
  return typeof v === 'string' ? v : JSON.stringify(v);
}

// Names whose sender or receiver differs between Talos and Nereus, grouped by what does the job on Talos.
function swapCards(D, nodes, showOnly) {
  const box = document.getElementById('swap');
  const side = (e) => nodes[e.n]?.side;
  const real = (lst) => lst.filter((e) => ['robot', 'board', 'tool'].includes(side(e)) && e.n !== 'pool_identify');
  const sim = (lst) => lst.filter((e) => side(e) === 'sim');
  const PASSIVE = new Set(['odometry/filtered', '/tf', '/tf_static', '/clock', '/parameter_events', '/rosout']);
  const swaps = [];
  for (const it of D.items) {
    if (it.kind !== 'topic' && it.kind !== 'service') continue;
    if (it.avail !== 'both' || PASSIVE.has(it.name)) continue;
    if (it.kind === 'service') { if (sim(it.pubs).length) swaps.push({ it, card: 'srv' }); continue; }
    const rp = real(it.pubs), sp = sim(it.pubs), rs = real(it.subs), ss = sim(it.subs);
    if (sp.length) {
      const tal = new Set(it.pubs.filter((e) => side(e) !== 'sim').map((e) => e.n));
      const card = [...tal].some((n) => /zed_node$/.test(n)) ? 'zed' : tal.has('poac_board') ? 'poac' : tal.has('esc_board') ? 'esc'
        : [...tal].some((n) => ['dvl', 'riptide_gyro', 'riptide_imu', 'depth_converter'].includes(n)) ? 'sensors' : 'other';
      swaps.push({ it, card, dir: 'out', rp });
    } else if (ss.length) {
      const card = it.name === 'thruster_forces' ? 'esc' : rs.some((e) => e.n === 'poac_board') ? 'poac' : rs.length ? 'other' : 'none';
      swaps.push({ it, card, dir: 'in', rs });
    }
  }
  const link = (n) => `<a class="sw-node" href="#node-${esc(n)}"><code>${esc(n)}</code></a>`;
  const chip = (it, label) => `<a class="ifx-chip" href="#${esc(anchorName(it.kind, it.name))}"><code>${brk(label || it.name)}</code></a>`;
  const names = (card, dir) => swaps.filter((s) => s.card === card && (!dir || s.dir === dir)).map((s) => s.it);
  // names sharing a prefix (command/actuator/…) are written as the prefix once, then a chip per ending
  const chips = (lst) => {
    const pre = (n) => (n.includes('/') ? n.slice(0, n.lastIndexOf('/') + 1) : '');
    const by = new Map();
    for (const it of lst) { const k = pre(it.name); if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
    const out = [];
    const single = [];
    for (const [k, l] of by) {
      if (k && l.length > 1) out.push(`<div class="ifx-chips sw-pre"><code class="sw-pfx">${esc(k)}</code>${l.map((it) => chip(it, it.name.slice(k.length))).join('')}</div>`);
      else single.push(...l);
    }
    if (single.length) out.unshift(`<div class="ifx-chips">${single.map((it) => chip(it)).join('')}</div>`);
    return out.join('');
  };
  const zed = names('zed');
  // one line per stream, with a chip for each camera
  const suffixes = [...new Set(zed.map((it) => it.name.replace(/^(ffc|dfc)\/zed_node\//, '')))].sort();
  const zedChips = `<div class="sw-sub"><span class="sw-dir"><code>ffc/zed_node/…</code> and <code>dfc/zed_node/…</code></span><ul class="sw-zed">${suffixes.map((sfx) => `<li><code>${brk(sfx)}</code><span>${['ffc', 'dfc'].map((c) => {
    const it = zed.find((x) => x.name === `${c}/zed_node/${sfx}`);
    return it ? chip(it, c) : '';
  }).join('')}</span></li>`).join('')}</ul></div>`;
  const nereus = link('physics_simulator');
  const cards = [
    { id: 'sensors', title: 'Sensor drivers', talos: `the drivers ${link('dvl')}, ${link('riptide_gyro')} and ${link('riptide_imu')}, and ${link('depth_converter')}, which turns the camera cage board's raw depth into <code>depth/pose</code>`,
      body: `<div class="sw-sub">${chips(names('sensors'))}</div>`, note: 'depth_converter runs in Nereus too, but gets no raw depth there.' },
    { id: 'zed', title: 'ZED cameras', talos: `${link('ffc_zed_node')} and ${link('dfc_zed_node')}`, nereus: `${nereus}, which renders the images`, body: zedChips },
    { id: 'esc', title: 'Thrust and the ESC boards', talos: `${link('mpc_controller')} sends RPM to ${link('esc_board')} over CAN, not as a topic`,
      nereus: `${nereus} applies <code>thruster_forces</code> and sends the telemetry`,
      body: `<div class="sw-sub"><span class="sw-dir">sends</span>${chips(names('esc', 'out'))}</div><div class="sw-sub"><span class="sw-dir">receives</span>${chips(names('esc', 'in'))}</div>`,
      note: 'On Talos nothing in the normal stack subscribes to thruster_forces.' },
    { id: 'poac', title: 'POAC board', talos: `${link('poac_board')} firmware, over CAN`,
      body: `<div class="sw-sub"><span class="sw-dir">sends</span>${chips(names('poac', 'out'))}</div><div class="sw-sub"><span class="sw-dir">receives</span>${chips(names('poac', 'in'))}</div>`,
      note: 'The battery housings\' firmware also subscribes to the kill topics, but its CAN agent is off.' },
    { id: 'none', title: 'Nothing on Talos', talos: 'no listener: the claw code is on the <code>poac-multiple-servos</code> firmware branch, not master', nereus: `${nereus} moves the claw`,
      body: `<div class="sw-sub">${chips(names('none'))}</div>` },
    { id: 'srv', title: 'Two servers in Nereus', talos: `${link('ActuatorTranslator')} serves them and forwards each call to the POAC as a topic`,
      nereus: `${link('ActuatorTranslator')} and ${nereus} both serve them`, body: `<div class="sw-sub"><span class="sw-dir">services</span>${chips(names('srv'))}</div>`,
      note: 'One call still fires one torpedo (tested in Nereus, 31 Oct 2026). The call reaches both servers. The simulator fires and answers at once; the translator\'s copy arrives during the 0.5 s pause that torpedoes and droppers share, so the simulator refuses it. The caller keeps the first answer, the simulator\'s.' },
  ];
  const other = swaps.filter((s) => s.card === 'other');
  if (other.length) cards.push({ id: 'other', title: 'Other', talos: 'see each row', body: chips(other.map((s) => s.it)) });
  const nAvail = (w) => D.items.filter((i) => i.avail === w).length + D.nodes.filter((n) => nodeAvail(n.side) === w).length;
  box.innerHTML = `<div class="sw-grid">${cards.filter((c) => c.body.includes('ifx-chip')).map((c) => `<article class="sw-card">
      <h3 class="sw-t">${c.title}</h3>
      <p class="sw-end"><b>On Talos</b> ${c.talos}</p><p class="sw-end"><b>In Nereus</b> ${c.nereus || nereus}</p>
      ${c.body}
      ${c.note ? `<p class="sw-note">${c.note}</p>` : ''}
    </article>`).join('')}</div>
  <p class="ifx-swap-more">Plus <button type="button" class="ifx-link" data-where="robot">${nAvail('robot')} entries that exist only on Talos</button> and <button type="button" class="ifx-link" data-where="sim">${nAvail('sim')} only in Nereus</button>.</p>`;
  box.querySelectorAll('button.ifx-link[data-where]').forEach((b) => b.addEventListener('click', () => showOnly({ where: b.dataset.where })));
}

function configTable(D) {
  const box = document.getElementById('config-table');
  const SIDE = { stack: 'Orin + Nereus', robot: 'Orin', board: 'board', laptop: 'laptop', tool: 'Orin, by hand', sim: 'Nereus', off: 'off' };
  const KEY = ['mpc_controller', 'robot_state_publisher', 'ekf_localization_node', 'yolo_orientation', 'riptide_mapping2', 'autonomy', 'ffc_zed_node', 'dfc_zed_node', 'riptide_gyro', 'riptide_imu'];
  const all = D.nodes.filter((n) => n.config?.length || n.params);
  const rank = (n) => (KEY.includes(n.id) ? KEY.indexOf(n.id) : 100);
  all.sort((a, b) => rank(a) - rank(b));
  const nKey = all.filter((n) => KEY.includes(n.id)).length;
  const row = (n, i) => `<tr${i >= nKey ? ' class="cf-more" hidden' : ''}><td><a href="#node-${esc(n.id)}"><code>${esc(n.id)}</code></a>${n.id === 'mpc_controller' ? '<sup class="cf-fn">*</sup>' : ''}${n.status ? ` <span class="ifx-flag">${esc(n.status)}</span>` : ''}</td><td>${SIDE[n.side]}</td><td>${(n.config || []).map((c) =>
    `<a href="${c.url}" target="_blank" rel="noopener"><code>${brk(c.path)}</code></a>`).join('<br>') || '<em>set in the launch file</em>'}</td></tr>`;
  box.innerHTML = `<table class="params ifx-config"><thead><tr><th>Node</th><th>Runs</th><th>Config files</th></tr></thead><tbody>${all.map(row).join('')}</tbody></table>
    <p class="cf-foot"><button type="button" class="ifx-link" id="cf-all" aria-expanded="false">Show all ${all.length} nodes</button> <span><sup>*</sup> In the Nereus capture it ran with the simulator's own model; see below.</span></p>`;
  const b = box.querySelector('#cf-all');
  b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    box.querySelectorAll('tr.cf-more').forEach((tr) => { tr.hidden = !open; });
    b.setAttribute('aria-expanded', String(open));
    b.textContent = open ? `Show the ${nKey} main nodes` : `Show all ${all.length} nodes`;
  });
}
