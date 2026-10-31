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

// ---------- 1. The loop, step by step ----------
const STEPS = [
  {
    title: 'Edit the tree',
    lead: 'Open the tree file you will actually run, in a text editor or the team\'s Groot fork.',
    cmd: 'cd ~/osu-uwrt/release/src/riptide_autonomy\n$EDITOR trees/MyTree.xml     # or groot\ngit diff trees/',
    where: 'Your machine',
    time: 'Minutes',
    skip: 'Never.',
    watch: 'Groot loads workspace.xml\'s subtrees over the Comp Mpc files\' own.',
    link: '#editing',
  },
  {
    title: 'Write a node',
    optional: true,
    lead: 'Only when no combination of existing nodes can do it. The assistant writes the header and a test stub.',
    cmd: 'ros2 run riptide_autonomy2 btassistant.py create condition DeeperThan --no-rebuild',
    where: 'Your machine',
    time: 'An hour or more',
    skip: 'If you only changed XML.',
    watch: 'Create subscribers and clients in <code>rosInit()</code>, not the constructor.',
    link: '#node',
  },
  {
    title: 'Build',
    optional: true,
    lead: 'Reconfigure so CMake regenerates the registration files, then compile. Tests only build with the flag.',
    cmd: 'cd ~/osu-uwrt/release\ncolcon build --packages-select riptide_autonomy2 --cmake-clean-cache \\\n  --cmake-args -DAUTONOMY_BUILD_TESTS=ON\nsource install/setup.bash',
    where: 'Your machine',
    time: 'About 3.5 min with tests (measured here)',
    skip: 'If you only changed XML: doTask reads the tree from src/ on every run.',
    watch: 'Without <code>--cmake-clean-cache</code> a new header is not registered.',
    link: '#example',
  },
  {
    title: 'Unit test the node',
    optional: true,
    lead: 'GTest cases tick the node alone, with fake topics and services.',
    cmd: "GTEST_FILTER='*DeeperThan*' ros2 run riptide_autonomy2 test_nodes",
    where: 'Your machine',
    time: 'Seconds for one node; about 95 s for all',
    skip: 'If you didn\'t touch C++.',
    watch: 'The <code>GTEST_FILTER</code> variable, not <code>--gtest_filter</code>.',
    link: '#tests',
  },
  {
    title: 'Check the XML',
    lead: 'Does every tree still build, and do the XML and the C++ agree?',
    cmd: "GTEST_FILTER='*all_trees_load*' ros2 run riptide_autonomy2 test_nodes\ncd ~/osu-uwrt/release/src/riptide_autonomy\nros2 run riptide_autonomy2 checkBT $PWD/trees/MyTree.xml",
    where: 'Your machine',
    time: 'Seconds',
    skip: 'Never; it\'s the cheapest check there is.',
    watch: 'Commit first: <code>checkBT</code> saves the files it checks.',
    link: '#checkbt',
  },
  {
    title: 'Fly it in Nereus',
    lead: 'The real stack against the simulator. Start Talos near the task with a scenario, and record a bag.',
    cmd: 'ros2 run rmw_zenoh_cpp rmw_zenohd\nros2 launch nereus sim.launch.py active_control_model:=mpc mpc_model:=sim \\\n  scenario:=<your scenario folder>\n# viewer: Enable, Autonomy > pick the tree > Start',
    where: 'Your machine',
    time: 'Minutes per run',
    skip: 'Never before a pool test.',
    watch: 'A tree that does nothing is usually waiting in <code>WaitForKillSwitch</code>.',
    link: '#nereus',
  },
  {
    title: 'Pool',
    lead: 'Commit, deploy the same files to the robot and run the same tree from the viewer.',
    cmd: '# commit and deploy (Pool test day); then in the viewer:\n# Enable, Autonomy > pick the tree > Start',
    where: 'Robot (Orin), from the viewer',
    time: 'The rest of the day',
    skip: 'No.',
    watch: 'A FAILURE ends as action SUCCEEDED: read <code>returncode</code>.',
    link: 'pool-test.html',
  },
];

{
  const host = document.getElementById('loop-panel');
  const list = h('ol', { class: 'loop-steps', 'aria-label': 'Steps' });
  const card = h('div', { class: 'loop-card', 'aria-live': 'polite' });
  const nav = h('div', { class: 'loop-nav' });
  const prev = h('button', { class: 'btn', type: 'button' }, '← Back');
  const next = h('button', { class: 'btn primary', type: 'button' }, 'Next →');
  const pos = h('span');
  nav.append(prev, pos, next);
  let at = 0;
  const buttons = STEPS.map((s, i) => {
    const b = h('button', { type: 'button', class: s.optional ? 'optional' : '' }, `<span class="n">${i + 1}</span>${s.title}`);
    b.addEventListener('click', () => show(i));
    list.appendChild(h('li')).appendChild(b);
    return b;
  });
  function show(i) {
    at = i;
    const s = STEPS[i];
    buttons.forEach((b, k) => (k === i ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
    card.innerHTML = `<h3>${i + 1}. ${s.title}${s.optional ? ' <small style="font-weight:450;color:var(--muted);font-size:.8rem">(new node only)</small>' : ''}</h3>
      <p class="lead">${s.lead}</p>
      <pre><code>${esc(s.cmd)}</code></pre>
      <dl><dt>Where</dt><dd>${s.where}</dd><dt>Time</dt><dd>${s.time}</dd><dt>Skip it</dt><dd>${s.skip}</dd>
      <dt>Watch out</dt><dd>${s.watch} <a href="${s.link}">${s.link.startsWith('#') ? 'More below' : 'Pool test day'}</a></dd></dl>`;
    prev.disabled = i === 0;
    next.disabled = i === STEPS.length - 1;
    pos.textContent = `${i + 1} of ${STEPS.length}`;
  }
  prev.addEventListener('click', () => show(Math.max(0, at - 1)));
  next.addEventListener('click', () => show(Math.min(STEPS.length - 1, at + 1)));
  host.append(list, card, nav);
  show(0);
}

// ---------- 2. Each tree file against workspace.xml ----------
fetch(BASE + 'data/bt-workflow/autonomy.json')
  .then((r) => r.json())
  .then((d) => {
    const ws = d.workspace;
    const nModels = ws.models.Action + ws.models.Condition + ws.models.Decorator;
    const missing = d.nodes.filter((n) => !n.in_workspace).map((n) => `<code>${n.name}</code>`);
    document.getElementById('ws-facts').innerHTML =
      `The workspace holds ${ws.subtrees} subtrees and ${nModels} node models, but not ${missing.length} of the newest nodes (${missing.join(', ')})`;
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
  // By default only the files written for today's controller (Mpc), the identification tree and the test-tree example.
  const CURRENT = [REF, 'RescueCompMpcTree.xml', 'PreQualMpcTree.xml', 'PreQualMpcSpinTree.xml', 'IdentificationTree.xml', 'TestTorpedoTree.xml'];
  const head = h('div', { class: 'drift-head' });
  head.appendChild(h('div', { class: 'legend' },
    '<span><i class="seg-same"></i>same as workspace</span><span><i class="seg-behind"></i>differs: file is behind</span><span><i class="seg-diff"></i>differs: other</span><span><i class="seg-only"></i>only in this file</span><span class="nums">number: differ (+ only here)</span>'));
  const seg = h('span', { class: 'seg', role: 'group', 'aria-label': 'Which files' });
  let showAll = false;
  for (const [all, label] of [[false, 'Mpc, test, ident'], [true, `All ${d.files.length}`]]) {
    const b = h('button', { type: 'button', 'aria-pressed': String(all === showAll) }, label);
    b.addEventListener('click', () => {
      showAll = all;
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    });
    seg.appendChild(b);
  }
  head.appendChild(seg);
  const rows = h('div', { class: 'drift-rows', role: 'list' });
  host.append(head, rows);
  const total = (f) => f.same + f.differs.length + f.only.length;
  const max = Math.max(...d.files.map(total));
  let selected = REF;
  const describe = (f) => {
    const list = (a) => a.map((x) => `<code>${esc(x)}</code>`).join(', ');
    const other = f.differs.filter((x) => !f.behind.includes(x));
    let s = `${f.kb} kB · main tree <code>${esc(f.main)}</code> · ${total(f)} subtrees.<br>`;
    if (!f.differs.length) s += 'Every shared subtree matches the workspace.';
    else if (f.file === REF) s += `The file the others are compared with. Differs from the workspace: ${list(f.differs)}.`;
    else {
      if (f.behind.length) s += `Behind (the workspace has the newer ${esc(REF.replace('.xml', ''))} copy): ${list(f.behind)}. `;
      if (other.length) s += `Differs some other way: ${list(other)}.`;
    }
    if (f.only.length) s += ` Only here: ${list(f.only)}.`;
    return s;
  };
  function render() {
    const files = d.files.filter((f) => showAll || CURRENT.includes(f.file))
      .sort((a, b) => (b.differs.length + b.only.length) - (a.differs.length + a.only.length) || a.file.localeCompare(b.file));
    if (!files.some((f) => f.file === selected)) selected = files[0].file;
    rows.innerHTML = '';
    const pct = (n) => `${(100 * n) / max}%`;
    for (const f of files) {
      const other = f.differs.length - f.behind.length;
      const row = h('div', { class: 'drift-row' + (f.file === selected ? ' on' : ''), role: 'listitem', tabindex: 0, 'aria-expanded': String(f.file === selected),
        'aria-label': `${f.file}: ${f.same} same, ${f.behind.length} behind the workspace, ${other} differ otherwise, ${f.only.length} only in this file` });
      row.innerHTML = `<span class="name">${esc(f.file.replace(/\.xml$/, ''))}</span>
        <span class="bar"><span class="track"><span class="seg-same" style="width:${pct(f.same)}"></span><span class="seg-behind" style="width:${pct(f.behind.length)}"></span><span class="seg-diff" style="width:${pct(other)}"></span><span class="seg-only" style="width:${pct(f.only.length)}"></span></span><b>${f.differs.length}${f.only.length ? ` +${f.only.length}` : ''}</b></span>`;
      const pick = (key) => {
        selected = selected === f.file ? '' : f.file;
        render();
        if (key) [...rows.querySelectorAll('.drift-row')].find((r) => r.title === f.file)?.focus();
      };
      row.title = f.file;
      row.addEventListener('click', () => pick(false));
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(true); } });
      rows.appendChild(row);
      if (f.file === selected) rows.appendChild(h('div', { class: 'drift-note', role: 'listitem' }, describe(f)));
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
      presets: ['{ceiling}', '-0.5', '', '{celing}', 'ceiling', '-0.5m', '{ceiling|'],
      start: '{ceiling}',
    },
    out: {
      label: 'Leaf output',
      line: (v) => `&lt;<span class="k">Action</span> ID="GetOdometry" op="" or="" oy="" x="" y="" z="<span class="val">${esc(v)}</span>"/&gt;`,
      presets: ['start_z', '{start_z}', ''],
      start: 'start_z',
    },
    sub: {
      label: 'SubTree port',
      line: (v) => `&lt;<span class="k">SubTree</span> ID="Dive" __shared_blackboard="false" depth="<span class="val">${esc(v)}</span>"/&gt;\n<span class="c">&lt;!-- inside Dive, nodes read {depth} --&gt;</span>`,
      presets: ['depth', '-1', '{depth}', '-0.56', 'label', ''],
      start: 'depth',
    },
  };
  const BB = [
    { key: 'depth', value: '-0.56', on: true },
    { key: 'ceiling', value: '-0.5', on: true },
    { key: '-1', value: '-1', on: false },
    { key: 'label', value: 'torpedo', on: true },
    // Every empty output port writes to the entry named "". GetOdometry's outputs are written x, y, z, or, op, oy,
    // so with op="" or="" oy="" the last write there is the yaw.
    { key: '', value: '0.42', on: true, text: '<Action ID="GetOdometry" … op="" or="" oy=""/>  writes "" = 0.42 (its yaw, oy)' },
  ];
  let ctx = 'in', value = CTX.in.start;

  const left = h('div'), right = h('div');
  host.appendChild(h('div', { class: 'pp' })).append(left, right);
  const seg = h('span', { class: 'seg', role: 'group', 'aria-label': 'Where the port is' });
  for (const k of Object.keys(CTX)) {
    const b = h('button', { type: 'button', 'aria-pressed': String(k === ctx) }, CTX[k].label);
    b.addEventListener('click', () => { ctx = k; value = CTX[k].start; seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); build(); });
    seg.appendChild(b);
  }
  const xml = h('div', { class: 'xml', 'aria-label': 'The XML line' });
  const valueLabel = h('label', { class: 'value' }, 'Value');
  const input = h('input', { type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', 'aria-label': 'Port value' });
  valueLabel.appendChild(input);
  const presets = h('div', { class: 'presets', role: 'group', 'aria-label': 'Preset values' });
  const bbList = h('ul', { class: 'bb' });
  left.append(h('h4', {}, 'The port'), seg, xml, valueLabel, presets, h('h4', {}, 'Set earlier in this tree'), bbList);
  const verdict = h('div', { class: 'verdict', 'aria-live': 'polite' });
  const trace = h('ol', { class: 'trace' });
  right.append(h('h4', {}, 'What happens'), verdict, trace);

  input.addEventListener('input', () => { value = input.value; update(); });
  for (const e of BB) {
    const li = h('li');
    const lab = h('label');
    const cb = h('input', { type: 'checkbox' });
    cb.checked = e.on;
    cb.addEventListener('change', () => { e.on = cb.checked; lab.classList.toggle('off', !e.on); update(); });
    lab.append(cb, document.createTextNode(e.text || `<SetBlackboard output_key="${e.key}" value="${e.value}"/>`));
    lab.classList.toggle('off', !e.on);
    li.appendChild(lab);
    bbList.appendChild(li);
  }

  function build() {
    presets.innerHTML = '';
    for (const p of CTX[ctx].presets) {
      const b = h('button', { type: 'button' }, p === '' ? '""' : esc(p));
      b.addEventListener('click', () => { value = p; input.value = p; update(); });
      presets.appendChild(b);
    }
    input.value = value;
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

  // Reading a string as the double a node asked for. Returns [verdict class, headline, trace lines].
  function convert(str, steps, who) {
    if (str === '') {
      steps.push(`The value is empty, so <code>tryGetInput</code> treats the port as unset and returns the default, ${who.def}.`);
      if (who.required) steps.push(`<code>tryGetRequiredInput</code> logs: ${c(`Node ${who.node} does not have a value for required port with name ${who.port}!`)}`);
      return ['default', `Default: ${who.def}`];
    }
    const n = stod(str);
    if (!n.ok) {
      steps.push(`<code>convertFromString&lt;double&gt;</code> calls <code>std::stod(${esc(JSON.stringify(str))})</code>, which throws <code>invalid_argument</code>.`);
      steps.push('Nothing catches it in the node. doTask aborts the whole tree: action ABORTED, controller DISABLED, LEDs flash red.');
      return ['abort', 'The tree aborts on this tick'];
    }
    if (n.rest) {
      steps.push(`<code>std::stod</code> reads the number at the front and ignores ${c(n.rest)}. No warning.`);
      return ['ok', `${n.v} (silently)`];
    }
    steps.push(`<code>std::stod</code> gives ${n.v}.`);
    return ['ok', String(n.v)];
  }

  function update() {
    [...presets.children].forEach((b) => b.setAttribute('aria-pressed', String((b.textContent === '""' ? '' : b.textContent) === value)));
    xml.innerHTML = CTX[ctx].line(value).replace(/\n/g, '<br>');
    const steps = [];
    let cls = 'ok', head = '', tag = 'The node gets';
    if (ctx === 'in') {
      const who = { node: 'DeeperThan', port: 'z', def: '0.0', required: true };
      if (value !== '' && isPtr(value)) {
        const k = strip(value);
        steps.push(`${c(value)} is a blackboard pointer: read the entry ${c(k)} of this tree's blackboard.`);
        const e = entry(k);
        if (e) {
          steps.push(`${c(k)} was set to ${c(e.value)} by a <code>SetBlackboard</code> above.`);
          [cls, head] = convert(e.value, steps, who);
        } else {
          steps.push(`No <code>SetBlackboard</code> or output wrote ${c(k)}. The entry exists (made when the tree was built) but is empty, so <code>getInput</code> fails.`);
          steps.push(`<code>tryGetRequiredInput</code> returns the default, ${who.def}, and logs a warning.`);
          cls = 'default'; head = `Default: ${who.def}`;
        }
      } else {
        if (value.includes('{') || value.includes('}')) steps.push(`${c(value)} is not a well-formed <code>{key}</code>, so it's a literal string. <code>checkBT</code> reports unbalanced braces.`);
        else if (value !== '') steps.push(`No braces: ${c(value)} is the literal value.`);
        [cls, head] = convert(value, steps, who);
      }
    } else if (ctx === 'out') {
      tag = 'GetOdometry writes';
      if (value === '') {
        steps.push('An empty output still writes: <code>setOutput</code> stores z in the blackboard entry <em>named</em> <code>""</code>. So do the other empty ports on this line (<code>op</code>, <code>or</code>, <code>oy</code>); the last write wins.');
        steps.push('No leaf can read it (<code>{}</code> is not a pointer). A SubTree port left empty can: it links to exactly this entry. Try "SubTree port" with <code>""</code>.');
        cls = 'default'; head = 'The entry named "" (not dropped)';
      } else {
        const k = isPtr(value) ? strip(value) : value;
        steps.push(isPtr(value) ? `Braces are stripped on outputs: ${c(value)} means the entry ${c(k)}.` : `Outputs take the entry name without braces: ${c(k)}.`);
        steps.push(`When odometry arrives, <code>postOutput</code> writes Talos's z (say ${c('-1.02')}) as a string into ${c(k)}.`);
        steps.push(`Later nodes read it with ${c(`{${k}}`)}; a SubTree passes it on as ${c(k)}.`);
        head = `${k} = -1.02`;
      }
    } else {
      tag = 'Inside Dive, {depth} is';
      const who = { node: 'inside Dive', port: 'depth', def: 'each node\'s own default', required: false };
      if (value === '') {
        steps.push('Empty is not "unset" here. The SubTree maps <code>depth</code> to the parent\'s entry <em>named</em> <code>""</code>, and every empty output port in the parent writes there.');
        const e = entry('');
        if (e) {
          steps.push(`The last one was <code>GetOdometry</code>'s <code>oy=""</code>: the entry holds ${c(e.value)}, Talos's yaw.`);
          convert(e.value, steps, { ...who, def: '0' });
          steps.push('Nodes inside read the yaw as <code>{depth}</code>. No warning: <code>checkBT</code> skips empty values.');
          cls = 'wrong'; head = `${e.value}: another node's value`;
        } else {
          steps.push('Nothing has written the entry named <code>""</code> yet, so it is empty and nodes inside fall back to their defaults. The first empty output port earlier in the tree changes that: switch the GetOdometry line back on.');
          cls = 'default'; head = 'Empty: defaults inside (for now)';
        }
      } else {
        steps.push(`SubTree ports are entry <em>names</em> in the parent (BT.CPP v3, isolated blackboard). Nothing is stripped or parsed: look up the parent's entry called ${c(value)}.`);
        const e = entry(value);
        if (e) {
          steps.push(`It exists: ${c(value)} = ${c(e.value)}. The subtree reads and writes that same entry.`);
          [cls, head] = convert(e.value, steps, { ...who, def: '0' });
          if (cls === 'abort') steps[steps.length - 1] = 'A node inside that reads it as a number throws, and doTask aborts the tree.';
        } else {
          if (isPtr(value)) steps.push(`Braces are <em>not</em> stripped here: this looks for an entry literally named ${c(value)}, which can't exist. <code>checkBT</code> warns "may not exist".`);
          else if (stod(value).ok && !stod(value).rest) steps.push(`A number is a name too. Without ${c(`<SetBlackboard output_key="${value}" value="${value}"/>`)} there is no such entry, and <code>checkBT</code> skips numbers, so it won't warn.`);
          else steps.push(`No <code>SetBlackboard</code> or output in the parent wrote ${c(value)}.`);
          steps.push('The entry is created empty, so every node inside that reads <code>{depth}</code> falls back to its default (with a warning from required ports).');
          cls = 'default'; head = 'Empty: defaults inside';
        }
      }
    }
    verdict.className = 'verdict' + (cls === 'ok' ? '' : ' ' + cls);
    verdict.innerHTML = `<span class="tag">${cls === 'abort' ? 'Crash' : cls === 'wrong' ? 'Silently wrong' : tag}</span><strong>${esc(head)}</strong>`;
    trace.innerHTML = steps.map((s) => `<li>${s}</li>`).join('');
  }
  build();
}

// ---------- 4. From a header to a running node ----------
{
  const host = document.getElementById('pipeline');
  const noteEl = document.getElementById('pipeline-note');
  const link = (p, t) => `<a href="${RA}${p}">${t}</a>`;
  const nodes = [
    { id: 'hdr', x: 140, y: 50, label: 'DeeperThan.btcondition.hpp', sub: 'include/riptide_autonomy/bt_conditions', bold: true,
      info: `<b>The node.</b> The whole class lives in the header. Its file name is the node's ID. ${link('include/riptide_autonomy/bt_conditions/SeenRecently.btcondition.hpp', 'Example: SeenRecently')}.` },
    { id: 'gen', x: 450, y: 50, label: 'btassistant.py generate_registrators', sub: 'runs at CMake configure',
      info: `<b>Run by CMakeLists.txt</b> (${link('CMakeLists.txt#L60', 'line 60')}) with <code>execute_process</code>, so only when CMake configures. It globs the headers and <code>*.simple.cpp</code> files. colcon configures only when there is no cache or the CMake arguments changed: use <code>--cmake-clean-cache</code>.` },
    { id: 'reg', x: 760, y: 50, label: 'registerConditions.cpp', sub: 'build/…/autonomy_generator',
      info: '<b>Generated code:</b> an <code>#include</code> per header and <code>factory.registerNodeType&lt;DeeperThan&gt;("DeeperThan");</code> inside <code>BT_REGISTER_NODES</code>. One file each for actions, conditions and decorators.' },
    { id: 'lib', x: 760, y: 160, label: 'libautonomy_conditions.so', sub: 'install/…/lib',
      info: '<b>A plugin library</b> per node kind: <code>libautonomy_actions.so</code>, <code>_conditions</code>, <code>_decorators</code>, plus <code>libautonomy_utils.so</code> with the helpers.' },
    { id: 'fac', x: 450, y: 160, label: 'registerPluginsForFactory', sub: 'doTask, test_nodes, checkBT',
      info: `<b>Loads the three plugins</b> from the installed package (${link('src/riptide_autonomy/util.cpp#L18', 'util.cpp')}). doTask, the tests and checkBT all use it, so they all see the same nodes.` },
    { id: 'xml', x: 140, y: 160, label: 'Tree XML', sub: '<Condition ID="DeeperThan">',
      info: '<b>The tree file</b>, read when the goal arrives. The ID must match a registered node or a subtree in the same file.' },
    { id: 'load', x: 140, y: 270, label: 'createTreeFromFile', sub: 'IDs and port names checked',
      info: '<b>Builds the tree.</b> An unknown ID fails with <code>Node not recognized</code>; an unknown port name with <code>Possible typo?</code>. Either aborts the run before the first tick.' },
    { id: 'init', x: 450, y: 270, label: 'initRosForTree', sub: 'rosInit() on every node',
      info: '<b>Gives every node the ROS node</b> and calls its <code>rosInit()</code>. Before this, <code>rosNode()</code> is null: never touch ROS in the constructor.' },
    { id: 'tick', x: 760, y: 270, label: 'tickRoot() every 30 ms', sub: 'tick() / onStart() / onRunning()',
      info: '<b>The loop.</b> Ticks the root until it returns SUCCESS or FAILURE, or the goal is cancelled. A condition is ticked again on every pass of a reactive parent.' },
  ];
  const edges = [
    { from: 'hdr', to: 'gen', label: 'globbed' },
    { from: 'gen', to: 'reg', label: 'writes' },
    { from: 'reg', to: 'lib', label: 'compiled' },
    { from: 'lib', to: 'fac', label: 'dlopen' },
    { from: 'fac', to: 'load' },
    { from: 'xml', to: 'load' },
    { from: 'load', to: 'init' },
    { from: 'init', to: 'tick' },
  ];
  const nx = 165;
  new Graph(host, {
    width: 920, height: 320, nodes, edges,
    narrow: {
      below: 640, width: 330, height: 664,
      nodes: {
        hdr: { x: nx, y: 34 }, gen: { x: nx, y: 108 }, reg: { x: nx, y: 182 }, lib: { x: nx, y: 256 },
        fac: { x: nx, y: 330 }, xml: { x: 98, y: 416 }, load: { x: nx, y: 490 }, init: { x: nx, y: 562 }, tick: { x: nx, y: 634 },
      },
      edges: {
        'fac>load': { via: [318, 412] },
        'hdr>gen': { label: '' }, 'gen>reg': { label: '' }, 'reg>lib': { label: '' }, 'lib>fac': { label: '' },
      },
    },
    info: (n) => { noteEl.innerHTML = n ? n.info : 'Tap or hover a box.'; },
  });
}

// ---------- 5. Common mistakes ----------
{
  const host = document.getElementById('mistakes-panel');
  const L = (p, t) => `<a href="${RA}${p}">${t}</a>`;
  const M = [
    ['Build', 'New node: <code>Node not recognized: MyNode</code>, or its new test never runs',
      'Registration files and the test list are generated when CMake configures, and colcon doesn\'t configure again once a build folder exists. Tests also need <code>-DAUTONOMY_BUILD_TESTS=ON</code>.',
      '<code>colcon build --packages-select riptide_autonomy2 --cmake-clean-cache</code> (with the flag), or <code>btassistant.py reconfigure_autonomy</code>.'],
    ['Build', 'Compile error in <code>registerActions.cpp</code> about an unknown type',
      'The header\'s file name and class name differ: registration uses the file name.',
      'Make file, class and XML ID the same word.'],
    ['Build', 'doTask segfaults as the tree starts, and stays down',
      'A subscription or client was created in the constructor, where <code>rosNode()</code> is still null. doTask is launched with <code>respawn=False</code>.',
      'Create ROS objects in <code>rosInit()</code>, then relaunch.'],
    ['XML', '<code>Possible typo? In the XML, you tried to remap port "depth" in node [DeeperThan / DeeperThan]…</code>',
      'The XML names a port the node doesn\'t declare. The run aborts before the first tick.',
      'Fix the attribute name, or add the port to <code>providedPorts()</code>.', true],
    ['XML', '<code>The node &lt;ForceSuccess&gt; must have exactly 1 child</code>',
      `A decorator got a second child. In <code>ActuatorTrees.xml</code> (${L('trees/ActuatorTrees.xml#L68', 'L68')}) and <code>SurfaceTree.xml</code> an older checkBT's "make one?" fix put a <code>SetBlackboard</code> next to a SubTree inside <code>ForceSuccess</code>.`,
      'Move the <code>SetBlackboard</code> above the decorator, or wrap the children in a <code>Sequence</code>.', true],
    ['XML', 'A number passed to a SubTree has no effect',
      'SubTree ports name parent entries. <code>z="-1"</code> looks for an entry called "-1".',
      'Add <code>&lt;SetBlackboard output_key="-1" value="-1"/&gt;</code> above it.'],
    ['XML', '<code>{depth}</code> on a SubTree port gives defaults inside',
      'Braces aren\'t stripped on SubTree ports in BT.CPP v3.',
      'Write <code>depth="depth"</code>.'],
    ['XML', 'Nodes inside a subtree get a stray value instead of their default',
      'An empty SubTree port (<code>target_3=""</code>) links to the parent\'s entry named <code>""</code>, which every empty output port (Groot leaves many) writes to. checkBT skips empty values.',
      'Give the port a named entry that holds what you mean, set by a <code>SetBlackboard</code> above it.'],
    ['XML', 'The tree aborts mid-run; the log ends with <code>stod</code>',
      'A port holds text where a number is read: a typo like <code>{key|</code>, or a missing brace.',
      'Run <code>checkBT</code>: it reports unbalanced braces. <code>DemoTableTree.xml</code> has one today.'],
    ['XML', 'The Rescue mission still does the old thing',
      'Each file has its own subtree copies; <code>RescueCompMpcTree.xml</code> wasn\'t updated.',
      'Copy the changed subtree into every file that uses it.'],
    ['XML', 'After saving from Groot, or <code>checkBT --apply-workspace</code>, recent subtree changes are gone',
      'Both replace same-ID subtrees in the file with <code>workspace.xml</code>\'s copies.',
      '<code>git checkout -- trees/</code>. Edit the Comp Mpc files as text until the workspace is up to date.'],
    ['XML', '<code>checkBT</code> dies with a segmentation fault',
      'A tree file without a <code>&lt;TreeNodesModel&gt;</code>.',
      'Add one (Groot always writes it).', true],
    ['Running', 'Goal rejected: <code>…because the file does not exist</code>',
      'The goal needs the file\'s full path, not its name.',
      'Use the absolute path, or start it from the viewer.', true],
    ['Running', 'The tree runs but Talos never moves',
      'It\'s waiting in <code>WaitForKillSwitch</code> for <code>state/kill</code> to be false.',
      'Enable the robot (viewer Enable in the sim). The execution stack shows where it waits.'],
    ['Running', 'A condition fails on the very first tick',
      'Its subscription was made when the tree was built, milliseconds earlier; no message has arrived yet.',
      'Put something that waits before it, such as <code>GetOdometry</code>.', true],
    ['Running', 'A second goal flashes the LEDs red and stops the controller',
      `doTask accepts it (its "already running" check never fires, because the worker thread is detached: ${L('src/riptide_autonomy/DoTask.cpp#L157', 'DoTask.cpp L157, L184')}). The second run fails with <code>Only one instance of PublisherZMQ shall be created</code> and publishes <code>DISABLED</code> to the controller, while the first tree keeps ticking.`,
      'One tree at a time: Stop the first. The viewer greys Start while a tree runs.', true],
    ['Running', 'My edit made no difference',
      'You edited <code>install/riptide_autonomy2/share/…/trees</code>, or ran the installed copy. A build overwrites it.',
      'Edit <code>src/riptide_autonomy/trees/</code>; the viewer lists those.'],
    ['Tests', 'Every test fails with <code>failed to initialize rcl: argv[i] argument is null</code>',
      '<code>--gtest_filter</code> on the command line: the fixture saves the argument count before GTest removes its flags (BtTest.cpp L5-18).',
      "<code>GTEST_FILTER='*Name*' ros2 run riptide_autonomy2 test_nodes</code>", true],
    ['Tests', 'A test never receives what it published',
      'Published before discovery finished, or on the wrong topic: the test node lives in <code>/bt_testing</code>.',
      '<code>spinForTime(0.3s)</code> after creating the publisher; use the node\'s relative topic constant.'],
    ['Tests', '<code>test_all_trees_load</code> passes but ignores your new tree',
      'It reads the installed trees.',
      'Build, then run it.'],
  ];
  const cats = ['All', 'Build', 'XML', 'Running', 'Tests'];
  const seg = h('span', { class: 'seg mk-filter', role: 'group', 'aria-label': 'Filter mistakes' });
  const list = h('ul', { class: 'mk-list' });
  host.append(seg, list);
  for (const cat of cats) {
    const n = cat === 'All' ? M.length : M.filter((m) => m[0] === cat).length;
    const b = h('button', { type: 'button', 'aria-pressed': String(cat === 'All') }, `${cat} <span style="opacity:.6">${n}</span>`);
    b.addEventListener('click', () => {
      seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      list.querySelectorAll('li').forEach((li) => { li.hidden = cat !== 'All' && li.dataset.cat !== cat; });
    });
    seg.appendChild(b);
  }
  for (const [cat, sym, cause, fix, seen] of M) {
    const li = h('li');
    li.dataset.cat = cat;
    li.innerHTML = `<details><summary><span class="cat">${cat}</span><span class="sym">${sym}</span></summary>
      <div class="body"><p><b>Why.</b> ${cause}</p><p><b>Fix.</b> ${fix}${seen ? ' <span class="verified">seen while writing this page</span>' : ''}</p></div></details>`;
    list.appendChild(li);
  }
}
