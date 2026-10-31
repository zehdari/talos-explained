import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/bt-workflow.css';
import { Graph } from '../viz/graph.js';

setup();

const BASE = import.meta.env.BASE_URL;
const RA = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const h = (tag, attrs = {}, html = '') => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  if (html) e.innerHTML = html;
  return e;
};

// Open one row of an accordion while keeping the tapped row where it was on screen: a row closing above it would
// otherwise pull it up, out from under the finger.
function keepInPlace(el, change, now = () => el) {
  const before = el.getBoundingClientRect().top;
  change();
  const after = now().getBoundingClientRect().top;
  if (Math.abs(after - before) > 1) window.scrollBy(0, after - before);
}

// After a tap opens something, bring all of it on screen if it ended up below the fold, but never push `anchor`
// (the tapped row) above 64 px from the top, where the Chapters pill sits.
function reveal(target, anchor = target) {
  requestAnimationFrame(() => {
    const over = target.getBoundingClientRect().bottom - innerHeight + 16;
    if (over <= 0) return;
    const room = anchor.getBoundingClientRect().top - 64;
    const by = Math.min(over, room);
    if (by > 0) window.scrollBy({ top: by, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });
}

// Logs and long XML attributes wrap like a terminal does, each wrapped line hanging under its own start.
for (const pre of document.querySelectorAll('article pre.log, article pre.wrap')) {
  const code = pre.querySelector('code') || pre;
  const lines = code.innerHTML.split('\n');
  code.innerHTML = lines.map((l) => {
    const n = /^ */.exec(l.replace(/<[^>]+>/g, ''))[0].length;
    return `<span class="ln" style="--i:${n}ch">${l.replace(/^((?:<[^>]+>)*) +/, '$1') || ' '}</span>`;
  }).join('');
}

// Code blocks that scroll sideways get a fade at the right edge until they are scrolled to the end.
function markScrollers(root = document) {
  for (const pre of root.querySelectorAll('article pre')) {
    const set = () => {
      const more = pre.scrollWidth - pre.clientWidth > 4;
      pre.classList.toggle('scrolls', more && pre.scrollLeft + pre.clientWidth < pre.scrollWidth - 4);
    };
    if (!pre.dataset.fade) {
      pre.dataset.fade = '1';
      pre.addEventListener('scroll', set, { passive: true });
      new ResizeObserver(set).observe(pre);
    }
    set();
  }
}

// Commands and flags in running text never break at their own hyphens ("--cmake-|clean-cache").
for (const code of document.querySelectorAll('.prose p code, .prose li code, .prose td code, aside.short code, .callout code')) {
  const t = code.textContent;
  if (/(^|\s)-/.test(t) && t.length <= 40) code.classList.add('nowrap');
}

// Tables that become cards on a phone: each cell after the first carries its column's name.
for (const table of document.querySelectorAll('table.params.cards')) {
  const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim());
  if (heads.length < 3) continue;
  for (const tr of table.querySelectorAll('tbody tr')) [...tr.children].forEach((td, i) => { if (i > 0) td.dataset.label = heads[i]; });
}

// Code in pieces: one piece at a time behind a segmented control (all of them show without JavaScript).
for (const box of document.querySelectorAll('.code-tabs')) {
  const pres = [...box.querySelectorAll(':scope > pre')];
  const seg = h('span', { class: 'seg', role: 'group', 'aria-label': box.dataset.label || 'Pieces' });
  const show = (k) => {
    pres.forEach((pre, i) => { pre.hidden = i !== k; });
    seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
    markScrollers(box);
  };
  pres.forEach((pre, i) => {
    const b = h('button', { type: 'button' }, esc(pre.dataset.tab));
    b.addEventListener('click', () => show(i));
    seg.appendChild(b);
  });
  box.prepend(seg);
  show(0);
}

// The viewer's two shots: side by side on wide screens; on a phone one at a time, Running first (it shows more).
for (const grid of document.querySelectorAll('.media-grid.shots')) {
  const imgs = [...grid.querySelectorAll('img')];
  const seg = h('span', { class: 'seg shots-seg', role: 'group', 'aria-label': 'Which state' });
  const show = (k) => {
    imgs.forEach((im, i) => im.classList.toggle('off', i !== k));
    seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i === k)));
  };
  ['Ready', 'Running'].forEach((t, i) => {
    const b = h('button', { type: 'button' }, t);
    b.addEventListener('click', () => show(i));
    seg.appendChild(b);
  });
  grid.before(seg);
  show(1);
}

// The worked example: its six steps fold, like the loop above, so the page stays short on a phone. Step 1 starts
// open; any number can be open at once. A link to a step opens it.
{
  const heads = [...document.querySelectorAll('h3[id^="ex-"]')];
  if (heads.length) {
    const list = h('ol', { class: 'ex-acc' });
    heads[0].before(list);
    const steps = heads.map((h3, i) => {
      const body = h('div', { class: 'ex-body', id: `${h3.id}-body`, role: 'region', 'aria-labelledby': h3.id });
      let n = h3.nextSibling;
      while (n && !(n.nodeType === 1 && (n.matches('h3[id^="ex-"]') || n.matches('h2')))) { const next = n.nextSibling; body.appendChild(n); n = next; }
      const m = /^(\d+)\.\s*(.*)$/.exec(h3.textContent.trim());
      const btn = h('button', { type: 'button', class: 'loop-head', 'aria-expanded': 'false', 'aria-controls': body.id },
        `<span class="n">${m ? m[1] : i + 1}</span><span class="t">${esc(m ? m[2] : h3.textContent)}</span>`);
      h3.textContent = '';
      h3.appendChild(btn);
      const li = h('li');
      li.append(h3, body);
      list.appendChild(li);
      const set = (on) => { btn.setAttribute('aria-expanded', String(on)); body.hidden = !on; if (on) markScrollers(body); };
      btn.addEventListener('click', () => {
        const on = btn.getAttribute('aria-expanded') !== 'true';
        set(on);
        if (on) reveal(body, btn);
      });
      set(i === 0);
      return { h3, set };
    });
    const openFor = () => {
      const t = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
      const st = t && steps.find((x) => x.h3 === t || x.h3.parentElement.contains(t));
      if (st) { st.set(true); t.scrollIntoView(); }
    };
    addEventListener('hashchange', openFor);
    openFor();
  }
}

// ---------- 1. The loop, step by step ----------
const STEPS = [
  {
    title: 'Edit the tree',
    lead: 'Open the tree file you will actually run, in a text editor or Groot.',
    cmd: 'cd ~/osu-uwrt/release/src/riptide_autonomy\n$EDITOR trees/MyTree.xml\ngit diff trees/',
    where: 'Your laptop', time: 'Minutes',
    watch: 'Groot can overwrite the subtrees in <code>RepairCompMpcTree.xml</code> and <code>RescueCompMpcTree.xml</code>.',
    link: '#groot-trap',
  },
  {
    title: 'Write a node', optional: true,
    lead: 'Only when no combination of existing nodes can do it. The assistant writes the header and a test stub.',
    cmd: 'ros2 run riptide_autonomy2 btassistant.py \\\n  create condition DeeperThan --no-rebuild',
    where: 'Your laptop', time: 'An hour or more',
    watch: 'Create subscribers and clients in <code>rosInit()</code>, not the constructor.',
    link: '#node',
  },
  {
    title: 'Build', optional: true,
    lead: 'A clean configure, so the new node gets registered, then compile. Tests only build with the flag.',
    cmd: 'cd ~/osu-uwrt/release\ncolcon build \\\n  --packages-select riptide_autonomy2 \\\n  --cmake-clean-cache \\\n  --cmake-args -DAUTONOMY_BUILD_TESTS=ON\nsource install/setup.bash',
    where: 'Your laptop', time: 'About 3.5 min with tests',
    watch: 'Why the clean configure matters.',
    link: '#node',
  },
  {
    title: 'Unit test the node', optional: true,
    lead: 'Tests tick the node alone, with fake topics and services.',
    cmd: "GTEST_FILTER='*DeeperThan*' \\\n  ros2 run riptide_autonomy2 test_nodes",
    where: 'Your laptop', time: 'Seconds for one node; about 95 s for all',
    watch: 'Filter with the <code>GTEST_FILTER</code> variable, not <code>--gtest_filter</code>.',
    link: '#tests',
  },
  {
    title: 'Check the XML',
    lead: 'Does every tree still build, and do the XML and the C++ agree?',
    cmd: "GTEST_FILTER='*all_trees_load*' \\\n  ros2 run riptide_autonomy2 test_nodes\ncd ~/osu-uwrt/release/src/riptide_autonomy\nros2 run riptide_autonomy2 checkBT \\\n  $PWD/trees/MyTree.xml",
    where: 'Your laptop', time: 'Seconds',
    watch: 'Commit first: checkBT saves the files it checks.',
    link: '#checkbt',
  },
  {
    title: 'Fly it in Nereus',
    lead: 'The real stack against the simulator, with Talos starting next to the task. Record a bag.',
    cmd: '# terminal 1\nros2 run rmw_zenoh_cpp rmw_zenohd\n# terminal 2\nros2 launch nereus sim.launch.py \\\n  active_control_model:=mpc \\\n  mpc_model:=sim \\\n  scenario:=<your scenario folder>\n# viewer: Autonomy, pick a tree,\n#   Enable, Start',
    where: 'Your laptop', time: 'Minutes per run',
    watch: 'A tree that does nothing is usually waiting in <code>WaitForKillSwitch</code>.',
    link: '#nereus',
  },
  {
    title: 'Pool',
    lead: 'Commit, deploy the same files to the robot (<a href="pool-test.html">Pool test day</a>) and run the same tree from the viewer.',
    cmd: '# commit, then deploy\n# viewer: Autonomy, pick a tree,\n#   Enable, Start',
    where: 'Talos\'s Orin, from the viewer', time: 'The rest of the day',
    watch: 'A FAILURE ends as action SUCCEEDED: read <code>returncode</code>.',
    link: '#commit',
  },
];

{
  const host = document.getElementById('loop-panel');
  const list = h('ol', { class: 'loop-acc' });
  host.appendChild(list);
  const items = STEPS.map((s, i) => {
    const li = h('li', { class: s.optional ? 'optional' : '' });
    const head = h('button', { type: 'button', class: 'loop-head', 'aria-expanded': 'false', id: `loop-h${i}`, 'aria-controls': `loop-b${i}` },
      `<span class="n">${i + 1}</span><span class="t">${s.title}</span>${s.optional ? '<span class="tag">new node only</span>' : ''}`);
    const more = 'More below';
    const body = h('div', { class: 'loop-body', id: `loop-b${i}`, role: 'region', 'aria-labelledby': `loop-h${i}`, hidden: '' },
      `<p class="lead">${s.lead}</p><pre><code>${esc(s.cmd)}</code></pre>
       <p class="meta"><span><b>Where</b> ${s.where}</span><span><b>Time</b> ${s.time}</span></p>
       <p class="watch"><b>Watch out.</b> ${s.watch} <a href="${s.link}">${more}</a></p>`);
    li.append(head, body);
    list.appendChild(li);
    head.addEventListener('click', () => {
      const opening = head.getAttribute('aria-expanded') !== 'true';
      keepInPlace(head, () => open(opening ? i : -1));
      if (opening) reveal(body, head);
    });
    return { head, body };
  });
  function open(k) {
    items.forEach(({ head, body }, i) => {
      head.setAttribute('aria-expanded', String(i === k));
      body.hidden = i !== k;
    });
    markScrollers(host);
  }
  open(0);
}

// ---------- 2. Each tree file against workspace.xml ----------
fetch(BASE + 'data/bt-workflow/autonomy.json')
  .then((r) => r.json())
  .then((d) => {
    const ws = d.workspace;
    const nModels = ws.models.Action + ws.models.Condition + ws.models.Decorator;
    const missing = d.nodes.filter((n) => !n.in_workspace);
    const names = (a) => a.map((n) => `<code>${n.name}</code>`).join(', ');
    const hdr = missing.filter((n) => n.kind !== 'simple'), simple = missing.filter((n) => n.kind === 'simple');
    document.getElementById('ws-facts').innerHTML =
      `The workspace holds ${ws.subtrees} subtrees and ${nModels} node models, but not ${hdr.length} header nodes (${names(hdr)})` +
      (simple.length ? ` or the simple nodes ${simple.map((n) => `<code>${n.name}</code>`).join(' and ')}.` : '.');
    const nCases = d.tests.reduce((a, t) => a + t.cases, 0);
    document.getElementById('test-count').textContent = `${nCases} test cases in ${d.tests.length} files`;
    drift(d);
  })
  .catch(() => {
    document.getElementById('drift').textContent = 'Could not load the tree data.';
  });

function drift(d) {
  const host = document.getElementById('drift');
  const REF = d.source.reference;
  // By default only the files in use today: the two competition trees, the two PreQual trees for riptide_mpc and
  // the identification tree.
  const CURRENT = [REF, 'RescueCompMpcTree.xml', 'PreQualMpcTree.xml', 'PreQualMpcSpinTree.xml', 'IdentificationTree.xml'];
  const lead = h('p', { class: 'drift-lead' },
    `<b>The two Comp Mpc files have the newest subtrees.</b> Every other file, and <code>workspace.xml</code> itself, lags behind them.`);
  const head = h('div', { class: 'drift-head' });
  head.appendChild(h('div', { class: 'legend' },
    '<span><i class="seg-same"></i>same</span><span><i class="seg-behind"></i>workspace newer</span><span><i class="seg-diff"></i>differs</span><span><i class="seg-only"></i>only in this file</span>'));
  const seg = h('span', { class: 'seg', role: 'group', 'aria-label': 'Which files' });
  let showAll = false;
  for (const [all, label] of [[false, `In use (${CURRENT.length})`], [true, `All ${d.files.length} files`]]) {
    const b = h('button', { type: 'button', 'aria-pressed': String(all === showAll) }, label);
    b.addEventListener('click', () => {
      showAll = all;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
    seg.appendChild(b);
  }
  head.appendChild(seg);
  const rows = h('ol', { class: 'drift-rows' });
  host.append(lead, head, rows);
  const total = (f) => f.same + f.differs.length + f.only.length;
  const max = Math.max(...d.files.map(total));
  let selected = REF, namesOpen = false;
  const list = (a) => a.map((x) => `<code>${esc(x)}</code>`).join(', ');
  const counts = (f) => {
    const p = [];
    if (f.differs.length) p.push(`${f.differs.length} differ`);
    if (f.only.length) p.push(`${f.only.length} only here`);
    return p.join(' · ') || 'all same';
  };
  const summary = (f) => {
    const other = f.differs.length - f.behind.length;
    if (f.file === REF || f.file === 'RescueCompMpcTree.xml')
      return `The newest copy of everything. ${f.differs.length} subtrees differ from the workspace's (the workspace lags); ${f.only.length} Mpc subtrees exist only here and in its twin.`;
    if (!f.differs.length && !f.only.length) return `Every subtree matches the workspace.`;
    const p = [];
    if (f.behind.length) p.push(`${f.behind.length} subtrees are older than the workspace's copy`);
    if (other) p.push(`${other} differ some other way`);
    if (f.only.length) p.push(`${f.only.length} exist only here`);
    return p.join('; ') + '.';
  };
  const detail = (f) => {
    const other = f.differs.filter((x) => !f.behind.includes(x));
    let s = '';
    if (f.file === REF || f.file === 'RescueCompMpcTree.xml') s += `<p><b>Differ from the workspace:</b> ${list(f.differs)}.</p>`;
    else {
      if (f.behind.length) s += `<p><b>Older here:</b> ${list(f.behind)}.</p>`;
      if (other.length) s += `<p><b>Differ:</b> ${list(other)}.</p>`;
    }
    if (f.only.length) s += `<p><b>Only here:</b> ${list(f.only)}.</p>`;
    return s;
  };
  function render() {
    const files = d.files.filter((f) => showAll || CURRENT.includes(f.file))
      .sort((a, b) => (b.differs.length + b.only.length) - (a.differs.length + a.only.length) || a.file.localeCompare(b.file));
    rows.innerHTML = '';
    const pct = (n) => `${(100 * n) / max}%`;
    for (const f of files) {
      const other = f.differs.length - f.behind.length;
      const on = f.file === selected;
      const li = h('li', { class: 'drift-row' + (on ? ' on' : '') });
      const btn = h('button', { type: 'button', 'aria-expanded': String(on),
        'aria-label': `${f.file}: ${f.same} same, ${f.behind.length} older than the workspace, ${other} differ, ${f.only.length} only in this file` },
        `<span class="name">${esc(f.file.replace(/\.xml$/, ''))}</span><span class="cnt">${counts(f)}</span>
         <span class="track" aria-hidden="true"><span class="seg-same" style="width:${pct(f.same)}"></span><span class="seg-behind" style="width:${pct(f.behind.length)}"></span><span class="seg-diff" style="width:${pct(other)}"></span><span class="seg-only" style="width:${pct(f.only.length)}"></span></span>`);
      btn.dataset.file = f.file;
      const again = () => rows.querySelector(`button[data-file="${CSS.escape(f.file)}"]`);
      btn.addEventListener('click', () => {
        keepInPlace(btn, () => {
          if (selected === f.file) selected = '';
          else { selected = f.file; namesOpen = false; }
          render();
        }, again);
        again()?.focus({ preventScroll: true });
      });
      li.appendChild(btn);
      if (on) {
        const note = h('div', { class: 'drift-note' }, `<p>${summary(f)} </p>`);
        const names = h('div', { class: 'names', hidden: '' }, detail(f));
        if (f.differs.length || f.only.length) {
          const t = h('button', { type: 'button', class: 'linkish', 'aria-expanded': 'false' }, 'Show names');
          t.addEventListener('click', () => {
            namesOpen = !namesOpen;
            names.hidden = !namesOpen;
            t.textContent = namesOpen ? 'Hide names' : 'Show names';
            t.setAttribute('aria-expanded', String(namesOpen));
          });
          if (namesOpen) { names.hidden = false; t.textContent = 'Hide names'; t.setAttribute('aria-expanded', 'true'); }
          note.firstChild.appendChild(t);
        }
        note.appendChild(names);
        li.appendChild(note);
      }
      rows.appendChild(li);
    }
  }
  render();
}

// ---------- 3. Port playground ----------
// BehaviorTree.CPP 3.8.7 rules (TreeNode::isBlackboardPointer, getInput, SubTree remapping) plus Talos's tryGetInput.
{
  const host = document.getElementById('ports-play');
  const CTX = {
    in: {
      label: 'Leaf input',
      line: (v) => `&lt;<span class="k">Condition</span> ID="DeeperThan" z="<span class="val">${esc(v)}</span>"/&gt;`,
      start: '{ceiling}',
    },
    out: {
      label: 'Leaf output',
      line: (v) => `&lt;<span class="k">Action</span> ID="GetOdometry" z="<span class="val">${esc(v)}</span>"/&gt;`,
      start: 'start_z',
    },
    sub: {
      label: 'SubTree port',
      line: (v) => `&lt;<span class="k">SubTree</span> ID="Dive" depth="<span class="val">${esc(v)}</span>"/&gt;\n<span class="c">&lt;!-- nodes in Dive read {depth} --&gt;</span>`,
      start: 'depth',
    },
  };
  // The cases worth knowing, each one tap. The default is the trap the section is about.
  const CASES = [
    { group: 'Leaf input', ctx: 'in', value: '{ceiling}' },
    { group: 'Leaf input', ctx: 'in', value: '{celing}', hint: 'typo: uses default' },
    { group: 'Leaf input', ctx: 'in', value: '{ceiling|', hint: 'typo: tree aborts' },
    { group: 'SubTree port', ctx: 'sub', value: 'depth' },
    { group: 'SubTree port', ctx: 'sub', value: '' },
    { group: 'SubTree port', ctx: 'sub', value: '{depth}' },
  ];
  // What the parent tree wrote before this line. Every empty output port writes to the entry named "";
  // GetOdometry's outputs are written x, y, z, or, op, oy, so with all of them empty the last write is the yaw.
  const BB = [
    { key: 'ceiling', value: '-0.5', on: true, line: '&lt;SetBlackboard output_key="ceiling" value="-0.5"/&gt;' },
    { key: 'depth', value: '-0.56', on: true, line: '&lt;SetBlackboard output_key="depth" value="-0.56"/&gt;' },
    { key: '', value: '0.42', on: true, line: '&lt;Action ID="GetOdometry" x="" y="" z="" or="" op="" oy=""/&gt;' },
    { key: '-1', value: '-1', on: false, line: '&lt;SetBlackboard output_key="-1" value="-1"/&gt;' },
  ];
  let ctx = 'sub', value = '';

  const pp = h('div', { class: 'pp' });
  host.appendChild(pp);
  const cases = h('div', { class: 'pp-cases' });
  const groups = {};
  const chips = CASES.map((c) => {
    if (!groups[c.group]) {
      groups[c.group] = h('div', { class: 'pp-group', role: 'group', 'aria-label': c.group }, `<span class="glabel">${c.group}</span>`);
      cases.appendChild(groups[c.group]);
    }
    const attr = c.ctx === 'sub' ? 'depth' : 'z';
    const b = h('button', { type: 'button', class: 'chip' }, `<span>${attr}="${esc(c.value)}"</span>${c.hint ? `<span class="pp-hint">${c.hint}</span>` : ''}`);
    b.addEventListener('click', () => { ctx = c.ctx; value = c.value; sync(); reveal(verdict, b); });
    groups[c.group].appendChild(b);
    return { c, b };
  });
  // The port line is always shown; the parent tree's earlier lines fold away (folded by default on phones, where
  // they would push the answer off screen).
  const xml = h('div', { class: 'xml' });
  const ctxBtn = h('button', { type: 'button', class: 'pp-ctx', 'aria-expanded': 'false' });
  const ctxLines = h('div', { class: 'pp-ctx-lines', 'aria-label': 'Earlier lines of the parent tree' });
  const portLine = h('div', { class: 'pp-port', 'aria-label': 'The port' });
  xml.append(ctxBtn, ctxLines, portLine);
  let ctxOpen = !matchMedia('(max-width: 700px)').matches;
  ctxBtn.addEventListener('click', () => { ctxOpen = !ctxOpen; update(); });
  const result = h('div', { class: 'pp-result', 'aria-live': 'polite' });
  const verdict = h('div', { class: 'verdict' });
  const how = h('details', { class: 'pp-how' }, '<summary>Step by step, in BehaviorTree.CPP terms</summary>');
  const trace = h('ol', { class: 'trace' });
  how.appendChild(trace);
  result.append(verdict, how);

  // Advanced: any value, any port kind, and the earlier lines on or off.
  const adv = h('details', { class: 'pp-adv' }, '<summary>Try your own value</summary>');
  const seg = h('span', { class: 'seg', role: 'group', 'aria-label': 'Where the port is' });
  for (const k of Object.keys(CTX)) {
    const b = h('button', { type: 'button', 'data-k': k }, CTX[k].label);
    b.addEventListener('click', () => { ctx = k; value = CTX[k].start; sync(); });
    seg.appendChild(b);
  }
  const valueLabel = h('label', { class: 'value' }, 'Value');
  const input = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
  valueLabel.appendChild(input);
  input.addEventListener('input', () => { value = input.value; update(); });
  const bbList = h('ul', { class: 'bb', 'aria-label': 'Earlier lines of the parent tree' });
  for (const e of BB) {
    const lab = h('label');
    const cb = h('input', { type: 'checkbox' });
    cb.checked = e.on;
    cb.addEventListener('change', () => { e.on = cb.checked; update(); });
    lab.append(cb, h('span', {}, e.line));
    bbList.appendChild(h('li')).appendChild(lab);
  }
  adv.append(seg, valueLabel, h('p', { class: 'small' }, 'Earlier lines of the parent tree:'), bbList);
  pp.append(cases, xml, result, adv);

  function sync() {
    input.value = value;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.k === ctx)));
    update();
  }

  const isPtr = (s) => s.length >= 3 && s.endsWith('}') && (s[0] === '{' || (s.length >= 4 && s[0] === '$' && s[1] === '{'));
  const strip = (s) => (s[0] === '{' ? s.slice(1, -1) : s.slice(2, -1));
  // std::stod: leading whitespace, then the longest number prefix; throws if there is none.
  const stod = (s) => {
    const m = /^\s*[+-]?(?:\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?|inf(?:inity)?|nan)/i.exec(s);
    if (!m) return { ok: false };
    return { ok: true, v: parseFloat(m[0]), rest: s.slice(m[0].length) };
  };
  const entry = (k) => BB.find((e) => e.on && e.key === k);
  const c = (s) => `<code>${esc(s)}</code>`;

  // Reading a string as the double a node asked for: [class, headline, plain sentence], with API steps pushed on `steps`.
  function convert(str, steps, who) {
    if (str === '') {
      steps.push(`The value is empty, so <code>tryGetInput</code> treats the port as unset and returns the default, ${who.def}.`);
      if (who.required) steps.push(`<code>tryGetRequiredInput</code> logs: ${c(`Node ${who.node} does not have a value for required port with name ${who.port}!`)}`);
      return ['default', `Default: ${who.def}`, `Empty means "unset", so the node uses its default, ${who.def}, and logs a warning.`];
    }
    const n = stod(str);
    if (!n.ok) {
      steps.push(`<code>convertFromString&lt;double&gt;</code> calls <code>std::stod(${esc(JSON.stringify(str))})</code>, which throws <code>invalid_argument</code>.`);
      steps.push('Nothing in the node catches it. doTask aborts the whole tree: action ABORTED, controller DISABLED, LEDs flash red.');
      return ['abort', 'The tree aborts', `${c(str)} is not a number, so reading it throws and doTask aborts the whole tree.`];
    }
    if (n.rest) {
      steps.push(`<code>std::stod</code> reads the number at the front and ignores ${c(n.rest)}. No warning.`);
      return ['ok', `${n.v} (silently)`, `The number at the front is used and ${c(n.rest)} is dropped, without a warning.`];
    }
    steps.push(`<code>std::stod</code> gives ${n.v}.`);
    return ['ok', String(n.v), ''];
  }

  function update() {
    chips.forEach(({ c: k, b }) => b.setAttribute('aria-pressed', String(k.ctx === ctx && k.value === value)));
    const parent = BB.filter((e) => e.on).map((e) => `<span class="ctx">${e.line}</span>`);
    ctxBtn.setAttribute('aria-expanded', String(ctxOpen));
    ctxBtn.textContent = ctxOpen ? 'Hide the parent tree' : `Show the parent tree (${parent.length} line${parent.length === 1 ? '' : 's'} above)`;
    ctxLines.hidden = !ctxOpen || !parent.length;
    ctxLines.innerHTML = parent.join('\n');
    portLine.innerHTML = CTX[ctx].line(value);
    const steps = [];
    let cls = 'ok', head = '', plain = '', tag = 'The node gets';
    if (ctx === 'in') {
      const who = { node: 'DeeperThan', port: 'z', def: '0.0', required: true };
      if (value !== '' && isPtr(value)) {
        const k = strip(value);
        steps.push(`${c(value)} is a blackboard pointer: read the entry ${c(k)} of this tree's blackboard.`);
        const e = entry(k);
        if (e) {
          steps.push(`${c(k)} was set to ${c(e.value)} above.`);
          let p;
          [cls, head, p] = convert(e.value, steps, who);
          plain = p || `DeeperThan reads the entry ${c(k)}, set to ${c(e.value)} by the line above.`;
        } else {
          steps.push(`No <code>SetBlackboard</code> or output wrote ${c(k)}. The entry exists (made when the tree was built) but is empty, so <code>getInput</code> fails.`);
          steps.push(`<code>tryGetRequiredInput</code> returns the default, ${who.def}, and logs a warning.`);
          cls = 'wrong'; head = `Default: ${who.def}`;
          plain = `Nothing wrote ${c(k)}, so DeeperThan quietly uses its default, 0.0 (the surface). Only a warning in the log says so.`;
        }
      } else {
        if (value.includes('{') || value.includes('}')) steps.push(`${c(value)} is not a well-formed <code>{key}</code>, so it's a literal string. checkBT reports unbalanced braces.`);
        else if (value !== '') steps.push(`No braces: ${c(value)} is the literal value.`);
        let p;
        [cls, head, p] = convert(value, steps, who);
        plain = p || `No braces, so ${c(value)} is the value itself.`;
        if (cls === 'abort' && (value.includes('{') || value.includes('}'))) plain = `${c(value)} is not a well-formed <code>{key}</code>, so it is read as text. Text is not a number: doTask aborts the whole tree.`;
      }
    } else if (ctx === 'out') {
      tag = 'GetOdometry writes';
      if (value === '') {
        steps.push('<code>setOutput</code> stores z in the blackboard entry <em>named</em> <code>""</code>. So do the other empty ports; the last write wins.');
        steps.push('No leaf can read it (<code>{}</code> is not a pointer). A SubTree port left empty can: it links to exactly this entry.');
        cls = 'wrong'; head = 'The entry named ""';
        plain = 'An empty output is not dropped: it writes the entry named <code>""</code>, which an empty SubTree port later reads.';
      } else {
        const k = isPtr(value) ? strip(value) : value;
        steps.push(isPtr(value) ? `Braces are stripped on outputs: ${c(value)} means the entry ${c(k)}.` : `Outputs take the entry name without braces: ${c(k)}.`);
        steps.push(`When odometry arrives, <code>postOutput</code> writes Talos's z (say ${c('-1.02')}) as a string into ${c(k)}.`);
        head = `${k} = -1.02`;
        plain = `Talos's z goes into the entry ${c(k)}. Later nodes read it as ${c(`{${k}}`)}; a SubTree port passes it on as ${c(k)}.`;
      }
    } else {
      tag = 'Inside Dive, {depth} is';
      const who = { node: 'inside Dive', port: 'depth', def: 'each node\'s own default', required: false };
      if (value === '') {
        steps.push('The SubTree maps <code>depth</code> to the parent\'s entry <em>named</em> <code>""</code>. Empty is not "unset" here.');
        const e = entry('');
        if (e) {
          steps.push(`Every empty output port in the parent writes there. The last was <code>GetOdometry</code>'s <code>oy=""</code>, so the entry holds ${c(e.value)}.`);
          steps.push('checkBT skips empty values, so nothing warns.');
          cls = 'wrong'; head = `${e.value}: Talos's yaw`;
          plain = `Empty links to the parent's entry named <code>""</code>, which GetOdometry's empty yaw port wrote. Dive's depth becomes Talos's yaw, ${e.value}, and nothing warns you.`;
        } else {
          steps.push('Nothing has written the entry named <code>""</code> yet, so nodes inside fall back to their defaults. The first empty output port earlier in the tree changes that.');
          cls = 'default'; head = 'Defaults inside (for now)';
          plain = 'Nothing wrote the entry named <code>""</code> yet, so nodes inside use their defaults. The first empty output port earlier in the tree changes that.';
        }
      } else {
        steps.push(`SubTree ports are entry <em>names</em> in the parent (BehaviorTree.CPP v3, isolated blackboard: <code>__shared_blackboard="false"</code>). Nothing is stripped or parsed.`);
        const e = entry(value);
        if (e) {
          steps.push(`It exists: ${c(value)} = ${c(e.value)}. The subtree reads and writes that same entry.`);
          let p;
          [cls, head, p] = convert(e.value, steps, { ...who, def: '0' });
          plain = cls === 'abort' ? `${c(value)} holds text, so a node inside that reads it as a number throws and doTask aborts the tree.`
            : `Dive's ${c('{depth}')} is the parent's entry ${c(value)}: ${e.value}. This is the right way to pass a value in.`;
          if (p && cls !== 'abort') plain += ' ' + p;
        } else {
          if (isPtr(value)) steps.push(`Braces are <em>not</em> stripped here: this looks for an entry literally named ${c(value)}, which can't exist. checkBT warns "may not exist".`);
          else if (stod(value).ok && !stod(value).rest) steps.push(`A number is a name too. checkBT skips numbers, so it won't warn.`);
          else steps.push(`No <code>SetBlackboard</code> or output in the parent wrote ${c(value)}.`);
          steps.push('The entry is created empty, so every node inside that reads <code>{depth}</code> falls back to its default.');
          cls = 'wrong'; head = 'Defaults inside';
          plain = isPtr(value) ? `SubTree ports take a name <em>without</em> braces, so this looks for an entry called ${c(value)}. There is none, so nodes inside use their defaults.`
            : stod(value).ok && !stod(value).rest ? `A number here is an entry <em>name</em>. No entry is called ${c(value)} (switch on its SetBlackboard below), so nodes inside use their defaults.`
              : `No entry called ${c(value)} exists in the parent, so nodes inside use their defaults.`;
        }
      }
    }
    verdict.className = 'verdict ' + cls;
    verdict.innerHTML = `<span class="tag">${cls === 'abort' ? 'Crash' : cls === 'wrong' ? 'Silently wrong' : tag}</span><strong>${esc(head)}</strong>${plain ? `<p>${plain}</p>` : ''}`;
    trace.innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  }
  sync();
}

// ---------- 4. From a header to a running node ----------
// Three phases, as bands: what the build makes, what doTask loads once when it starts, what each goal does.
// Desktop: a graph with the bands; phones: the same nine boxes as a numbered list under the three phase headings.
{
  const panel = document.querySelector('.pipe-panel');
  const host = document.getElementById('pipeline');
  const noteEl = document.getElementById('pipeline-note');
  const stepsEl = document.getElementById('pipeline-steps');
  const link = (p, t) => `<a href="${RA}${p}">${t}</a>`;
  const PHASES = [
    { id: 'build', label: 'When you build', sub: 'registration is generated at CMake configure only' },
    { id: 'start', label: 'When doTask starts', sub: 'once: relaunch it after a rebuild' },
    { id: 'goal', label: 'When a goal arrives', sub: 'every run reads the XML fresh' },
  ];
  const nodes = [
    { id: 'hdr', phase: 'build', x: 150, y: 70, label: 'DeeperThan.btcondition.hpp', sub: 'include/riptide_autonomy/bt_conditions', bold: true, mine: true,
      info: `<b>The node.</b> The whole class lives in the header, and its file name is the node's ID. ${link('include/riptide_autonomy/bt_conditions/SeenRecently.btcondition.hpp', 'Example: SeenRecently')}.` },
    { id: 'gen', phase: 'build', x: 460, y: 70, label: 'btassistant.py generate_registrators', sub: 'at CMake configure only',
      info: `<b>Runs only when CMake configures</b> (${link('CMakeLists.txt#L60', 'CMakeLists.txt line 60')}). It lists the header files it finds, so a header added since the last configure stays out until the next one: build with <code>--cmake-clean-cache</code>.` },
    { id: 'reg', phase: 'build', x: 770, y: 70, label: 'registerConditions.cpp', sub: 'build/…/autonomy_generator',
      info: '<b>Generated code:</b> one line per header, <code>factory.<wbr>registerNodeType&lt;DeeperThan&gt;<wbr>("DeeperThan");</code>. One file each for actions, conditions and decorators.' },
    { id: 'lib', phase: 'build', x: 770, y: 150, label: 'libautonomy_conditions.so', sub: 'install/…/lib',
      info: '<b>A plugin library:</b> compiled code that programs load while they run. One per node kind (actions, conditions, decorators), plus <code>libautonomy_utils.so</code> with the helpers.' },
    { id: 'fac', phase: 'start', x: 460, y: 245, label: 'registerPluginsForFactory', sub: 'doTask, test_nodes, checkBT',
      info: `<b>Loads the three plugins</b> from the installed package (${link('src/riptide_autonomy/util.cpp#L18', 'util.cpp')}). doTask does it once, as it starts (${link('src/riptide_autonomy/DoTask.cpp#L129', 'DoTask.cpp L129')}), so after a rebuild relaunch doTask, or the sim. The tests and checkBT load them on every run.` },
    { id: 'xml', phase: 'goal', x: 150, y: 345, label: 'Tree XML', sub: '<Condition ID="DeeperThan">', mine: true,
      info: '<b>The tree file</b>, read when the goal arrives, so a tree edit needs no rebuild. Each ID must match a registered node or a subtree in the same file.' },
    { id: 'load', phase: 'goal', x: 460, y: 345, label: 'createTreeFromFile', sub: 'IDs and port names checked',
      info: '<b>Builds the tree</b> from the XML and the registered nodes. An unknown ID fails with <code>Node not recognized</code>, an unknown port name with <code>Possible typo?</code>. Either aborts the run before the first tick.' },
    { id: 'init', phase: 'goal', x: 680, y: 345, label: 'initRosForTree', sub: 'rosInit() on every node',
      info: '<b>Hands every node the ROS node</b> and calls its <code>rosInit()</code>. Before this, <code>rosNode()</code> is null: never touch ROS in the constructor.' },
    { id: 'tick', phase: 'goal', x: 860, y: 345, label: 'tickRoot()', sub: 'every 30 ms',
      info: '<b>The loop.</b> Ticks the root every 30 ms (your <code>tick()</code>, or <code>onStart()</code> then <code>onRunning()</code>) until it returns SUCCESS or FAILURE, or the goal is cancelled.' },
  ];
  const edges = [
    { from: 'hdr', to: 'gen', label: 'listed' },
    { from: 'gen', to: 'reg', label: 'writes' },
    { from: 'reg', to: 'lib', label: 'compiled', lx: 780, ly: 114, anchor: 'start' },
    { from: 'lib', to: 'fac', label: 'loaded', via: [770, 245], lx: 700, ly: 238 },
    { from: 'fac', to: 'load' },
    { from: 'xml', to: 'load' },
    { from: 'load', to: 'init' },
    { from: 'init', to: 'tick' },
  ];
  const band = (y0, y1) => [[12, y0], [948, y0], [948, y1], [12, y1]];
  const bands = [
    { label: 'WHEN YOU BUILD · REGISTRATION GENERATED AT CONFIGURE ONLY', points: band(14, 186), lx: 24, ly: 32 },
    { label: 'WHEN DOTASK STARTS · ONCE', points: band(202, 282), lx: 24, ly: 220 },
    { label: 'WHEN A GOAL ARRIVES · EVERY RUN', points: band(298, 392), lx: 24, ly: 316 },
  ];
  const DEFAULT = 'gen';
  const byId = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const g = new Graph(host, {
    width: 960, height: 400, nodes, edges, bands, label: 'From a header to a running node, in three phases',
    info: (n) => { noteEl.innerHTML = (n || byId[DEFAULT]).info; },
  });
  g.highlight(DEFAULT);

  // Phones: the same nine boxes as a numbered list under the three phase headings; tapping a row opens its note
  // right under it. Long names may break only after a slash, dot or underscore.
  const wb = (t) => esc(t).replace(/([/.])/g, '$1<wbr>');
  const rowsEls = [];
  let k = 0;
  for (const ph of PHASES) {
    const group = h('li', { class: `phase phase-${ph.id}` }, `<p class="ph"><b>${ph.label}</b> <span>${ph.sub}</span></p>`);
    const ol = h('ol', { class: 'ph-rows' });
    group.appendChild(ol);
    stepsEl.appendChild(group);
    for (const n of nodes.filter((x) => x.phase === ph.id)) {
      const i = rowsEls.length;
      const li = h('li', { class: n.mine ? 'mine' : '' });
      const b = h('button', { type: 'button', 'aria-expanded': 'false' },
        `<span class="n">${++k}</span><span class="t"><span class="l">${wb(n.label)}</span><span class="s">${wb(n.sub)}</span>${n.mine ? '<span class="tag">you write this</span>' : ''}</span>`);
      const info = h('div', { class: 'info', hidden: '' }, n.info);
      li.append(b, info);
      ol.appendChild(li);
      b.addEventListener('click', () => {
        const opening = b.getAttribute('aria-expanded') !== 'true';
        keepInPlace(b, () => openRow(opening ? i : -1));
        if (opening) reveal(info, b);
      });
      rowsEls.push({ b, info });
    }
  }
  function openRow(j) {
    rowsEls.forEach(({ b, info }, i) => { b.setAttribute('aria-expanded', String(i === j)); info.hidden = i !== j; });
  }
  openRow(nodes.findIndex((n) => n.id === DEFAULT));
  new ResizeObserver(() => panel.classList.toggle('narrow', panel.clientWidth < 720)).observe(panel);
}

// ---------- 5. Common mistakes ----------
{
  const host = document.getElementById('mistakes-panel');
  const L = (p, t) => `<a href="${RA}${p}">${t}</a>`;
  const M = [
    ['Build', 'New node: <code>Node not recognized: MyNode</code>, or its new test never runs',
      'The registration files and the test list are generated when CMake configures, and colcon doesn\'t configure again once a build folder exists (<a href="#node">Writing a node</a>). Tests also need <code class="nowrap">-DAUTONOMY_BUILD_TESTS=ON</code>.',
      'Build with <code>--cmake-clean-cache</code>, or run <code>btassistant.py reconfigure_autonomy</code>. Then relaunch doTask (or the sim): it loads the node libraries only when it starts.'],
    ['Build', 'Compile error in <code>registerActions.cpp</code> about an unknown type',
      'The header\'s file name and class name differ: registration uses the file name.',
      'Make file, class and XML ID the same word.'],
    ['Build', 'doTask crashes as the tree starts, and stays down',
      'A subscription or client was created in the constructor, where <code>rosNode()</code> is still null. doTask is launched with <code>respawn=False</code>.',
      'Create ROS objects in <code>rosInit()</code>, then relaunch.'],
    ['XML', '<code>Possible typo? In the XML, you tried to remap port "depth" in node [DeeperThan / DeeperThan]…</code>',
      'The XML names a port the node doesn\'t declare. The run aborts before the first tick.',
      'Fix the attribute name, or add the port to <code>providedPorts()</code>.'],
    ['XML', '<code>The node &lt;ForceSuccess&gt; must have exactly 1 child</code>',
      `A decorator got a second child. In <code>ActuatorTrees.xml</code> (${L('trees/ActuatorTrees.xml#L68', 'L68')}) and <code>SurfaceTree.xml</code>, an older checkBT's fix put a <code>SetBlackboard</code> next to a SubTree inside <code>ForceSuccess</code>.`,
      'Move the <code>SetBlackboard</code> above the decorator, or wrap the children in a <code>Sequence</code>.'],
    ['XML', 'A number passed to a SubTree has no effect',
      'SubTree ports name parent entries: <code>z="-1"</code> looks for an entry called "-1".',
      'Add <code>&lt;SetBlackboard output_key="-1" value="-1"/&gt;</code> above it.'],
    ['XML', '<code>{depth}</code> on a SubTree port gives defaults inside',
      'Braces aren\'t stripped on SubTree ports in v3 (<a href="#ports">Ports</a>).',
      'Write <code>depth="depth"</code>.'],
    ['XML', 'Nodes inside a subtree get a stray value instead of their default',
      'An empty SubTree port (<code>target_3=""</code>) reads the parent\'s entry named <code>""</code> (<a href="#ports">Ports</a>).',
      'Give the port a named entry that holds what you mean, set by a <code>SetBlackboard</code> above it.'],
    ['XML', 'The tree aborts mid-run; the log ends with <code>stod</code>',
      'A port holds text where a number is read: a typo like <code>{key|</code>, or a missing brace.',
      'Run checkBT: it reports unbalanced braces. <code>DemoTableTree.xml</code> has one today.'],
    ['XML', 'The Rescue mission still does the old thing',
      'Each file has its own subtree copies, and <code>RescueCompMpcTree.xml</code> wasn\'t updated.',
      'Copy the changed subtree into every file that uses it.'],
    ['XML', 'After a Groot save, or <code>checkBT --apply-workspace</code>, recent subtree changes are gone',
      'Both replace same-ID subtrees in the file with <code>workspace.xml</code>\'s older copies (<a href="#groot-trap">Editing a tree</a>).',
      '<code>git checkout -- trees/</code>, then make the change as text.'],
    ['XML', 'checkBT dies with a segmentation fault',
      'A tree file without a <code>&lt;TreeNodesModel&gt;</code>.',
      'Add one (Groot always writes it).'],
    ['Run', 'Goal rejected: <code>…because the file does not exist</code>',
      'The goal needs the file\'s full path, not its name.',
      'Use the absolute path, or start it from the viewer.'],
    ['Run', 'The tree runs but Talos never moves',
      'It\'s waiting in <code>WaitForKillSwitch</code> for <code>state/kill</code> to be false.',
      'Enable the robot (the viewer\'s Enable in the sim). The execution stack shows where it waits.'],
    ['Run', 'A condition fails on the very first tick',
      'Its subscription was made when the tree was built, milliseconds earlier; no message has arrived yet.',
      'Put something that waits before it, such as <code>GetOdometry</code>.'],
    ['Run', 'A second goal flashes the LEDs red and stops the controller',
      `doTask accepts it: its "already running" check never fires, because the worker thread is detached (${L('src/riptide_autonomy/DoTask.cpp#L157', 'DoTask.cpp L157, L184')}). The second run fails with <code>Only one instance of PublisherZMQ shall be created</code> and sends <code>DISABLED</code> to the controller, while the first tree keeps ticking.`,
      'One tree at a time: Stop the first. The viewer greys Start while a tree runs.'],
    ['Run', 'My edit made no difference',
      'You edited <code>install/<wbr>riptide_autonomy2/<wbr>share/…/trees</code>, or ran the installed copy. A build overwrites it.',
      'Edit <code>src/<wbr>riptide_autonomy/<wbr>trees/</code>; the viewer lists those.'],
    ['Tests', 'Every test fails with <code>failed to initialize rcl: argv[i] argument is null</code>',
      '<code>--gtest_filter</code> on the command line: the test fixture saves the argument count before GTest removes its flags (BtTest.cpp L5-18).',
      "<code>GTEST_FILTER='*Name*' ros2 run riptide_autonomy2 test_nodes</code>"],
    ['Tests', 'A test never receives what it published',
      'Published before discovery finished, or on the wrong topic: the test node lives in <code>/bt_testing</code>.',
      '<code>spinForTime(0.3s)</code> after creating the publisher; use the node\'s relative topic constant.'],
    ['Tests', '<code>test_all_trees_load</code> passes but ignores your new tree',
      'It reads the installed trees.',
      'Build, then run it.'],
  ];
  const cats = ['All', 'Build', 'XML', 'Run', 'Tests'];
  const seg = h('div', { class: 'mk-filter', role: 'group', 'aria-label': 'Filter mistakes' });
  const list = h('ul', { class: 'mk-list' });
  host.append(seg, list);
  for (const cat of cats) {
    const n = cat === 'All' ? M.length : M.filter((m) => m[0] === cat).length;
    const b = h('button', { type: 'button', 'aria-pressed': String(cat === 'All') }, `${cat}<span class="cnt">${n}</span>`);
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      list.querySelectorAll('li').forEach((li) => { li.hidden = cat !== 'All' && (li.dataset.cat !== cat || li.classList.contains('group')); });
    });
    seg.appendChild(b);
  }
  const NAMES = { Build: 'Building', XML: 'In the XML', Run: 'Running a tree', Tests: 'Unit tests' };
  let last = '';
  for (const [cat, sym, cause, fix] of M) {
    if (cat !== last) {
      last = cat;
      list.appendChild(h('li', { class: 'group', 'data-cat': cat }, NAMES[cat]));
    }
    const li = h('li');
    li.dataset.cat = cat;
    li.innerHTML = `<details><summary><span class="sym">${sym}</span></summary>
      <div class="body"><p><b>Why.</b> ${cause}</p><p><b>Fix.</b> ${fix}</p></div></details>`;
    list.appendChild(li);
  }
}

markScrollers();
