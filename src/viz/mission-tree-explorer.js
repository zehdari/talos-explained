// An explorer for a BehaviorTree.CPP XML file parsed by tools/mission-tree/build_tree.py: collapsible, subtrees opened
// inline, searchable, with a detail panel per node. A run (tools/mission-tree/tree_run.py) can be laid over it: which
// node was running at time t, and when each node ran at all.
//
// A node is addressed by its path: child indices from the main tree's root, joined with '.'. A SubTree node's only
// child is its subtree's root. The view folds a SubTree and its root into one row.

const XML_URL = 'https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/';

// Built into BehaviorTree.CPP 3, not Talos's own nodes.
const BUILTIN = {
  Sequence: ['seq', 'ctl', 'Runs its children in order. Fails at the first child that fails; succeeds when all have succeeded.'],
  ReactiveSequence: ['react', 'ctl', 'A Sequence that re-checks its earlier children on every tick and halts the running child the moment one of them fails. Here: "move until the object is seen".'],
  Fallback: ['fallbk', 'ctl', 'Tries its children in order until one succeeds; fails only if every child fails.'],
  IfThenElse: ['if', 'ctl', 'Ticks the first child; if it succeeds runs the second, otherwise the third.'],
  Switch2: ['switch', 'ctl', 'Runs the child whose case_N matches variable; the last child is the default.'],
  Repeat: ['repeat', 'dec', 'Runs its child num_cycles times, stopping early if it fails.'],
  RetryUntilSuccessful: ['retry', 'dec', 'Re-runs its child after a failure, up to num_attempts times (−1: forever).'],
  ForceSuccess: ['force ✓', 'dec', 'Runs its child and reports SUCCESS whatever happened. Every task is wrapped in one, so a failure moves the mission on.'],
  ForceFailure: ['force ✗', 'dec', 'Runs its child and reports FAILURE whatever happened.'],
  Inverter: ['not', 'dec', 'Swaps its child\'s SUCCESS and FAILURE.'],
  Delay: ['delay', 'dec', 'Waits delay_msec, then runs its child.'],
  AlwaysSuccess: ['ok', 'act', 'Does nothing and succeeds.'],
  AlwaysFailure: ['fail', 'act', 'Does nothing and fails. First in a Sequence, it switches the rest of that Sequence off.'],
  SetBlackboard: ['set', 'bb', 'Writes value under output_key on this (sub)tree\'s blackboard.'],
};
// Talos's nodes whose headers carry no doc comment: one line each, from the code.
const DOCS = {
  Info: 'Logs message at INFO, with {key} filled in from the blackboard.',
  Error: 'Logs message at ERROR, with {key} filled in from the blackboard.',
  Wait: 'Waits seconds.',
  SetStatus: 'Sets the LED pattern (waiting, starting, searching, aligning, performing…).',
  SetMappingTarget: 'Calls mapping\'s mapping_target service: which objects mapping may update (a comma list), and whether the map is locked. Fails if it doesn\'t answer within time_limit_secs.',
  getCovariance: 'Waits up to 5 s for the next mapping/<Target> message and outputs its error (the combined position and angle variance).',
  CallTriggerService: 'Calls a Trigger service. Fails if it doesn\'t answer in time or answers success = false (the message is logged).',
  CallSetBoolService: 'Calls a SetBool service with data. Fails if it doesn\'t answer in time or answers success = false.',
  CallSetStringService: 'Calls a SetString service with data. Fails if it doesn\'t answer in time or answers success = false.',
  CallStartBinaryClassifierService: 'Starts mapping\'s binary classifier: detections of class_name are split into object1_name and object2_name.',
  ComputeFrameAlignment: 'Where base_link has to be so that link_frame sits at (x, y, z, roll, pitch, yaw) in reference_frame. Outputs that pose in world.',
  TransformPose: 'Transforms a pose from from_frame into to_frame with TF.',
  GetOdometry: 'Reads Talos\'s current pose from odometry.',
  AddWaypoint: 'Appends one waypoint to a FollowPath path string (path in, out out).',
  AddArc: 'Appends an arc (or a spiral, if end_radius differs) to a FollowPath path string, optionally panning the heading.',
  Math: 'out = a operator b.',
  Format: 'Fills {key}s in format from the blackboard and writes the string to out.',
  CalculateDistance: 'Distance between two points.',
  HeadingToPoint: 'Heading from the current point to a target point.',
  CheckBlackboardExists: 'Succeeds if input is not empty.',
  PublishToController: 'Publishes a setpoint on controller/linear (or controller/angular with isOrientation): mode 3 is position, 0 disables the controller.',
  PublishFloat32: 'Publishes one Float32 on topic. Here: the claw, in seconds to run it (+ opens, − closes).',
  PublishInt8: 'Publishes one Int8 on topic.',
  GetBoolTopic: 'Waits up to 3 s for one Bool on topic and writes it to value.',
  GetTwistTopic: 'Waits for one Twist on topic. Here: controller/scale/trust, the MPC\'s "settled" measure per axis.',
  GetActuatorStatus: 'Reads the actuator board\'s state: busy, torpedoes and droppers left, error states.',
  CompareNums: 'Compares a and b with <, > or ==. An empty port reads as 0.',
  IsTrue: 'Succeeds if value is true.',
  ApproxEqualToAngle: 'Succeeds if angles a and b are within range of each other.',
  ApproxEqualTo: 'Succeeds if a and b are within range of each other.',
  CenterDetection: 'Chases the latest detection with the forward camera: moves square on to the object at the range it was seen from, yawing to keep it centred.',
  LatestDetection: 'Outputs where the detector last saw object_name (in frame), if it was within max_age_secs.',
  ContinuousSpin: 'Spins num_cycles full turns, counting the real rotation from odometry.',
  RetryUntilSuccessfulOrTimeout: 'Re-ticks its child until it succeeds, or fails once num_seconds have passed. An empty num_seconds counts as 0: it fails at once.',
  SetControllerSafeMode: 'Sets the old controller\'s stunt safe-mode parameter. Under the MPC it fails after timeout_secs.',
  TriggerControllerStunt: 'Starts a stunt in the old controller.',
  PublishEKFPose: 'Resets the EKF\'s pose (used after the old flip).',
  GetImuOrientation: 'Reads the IMU\'s orientation.',
  WaitForDetection: 'Waits until object_name is detected.',
  GetMappingState: 'Reads mapping\'s current target and lock.',
  GetFloat64Topic: 'Waits for one Float64 on topic.',
};
const SHORT = { Action: ['act', 'act'], Condition: ['cond', 'cnd'], Decorator: ['retry', 'dec'] };

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmtT = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const fmtS = (s) => (s < 60 ? `${s.toFixed(1)} s` : fmtT(s));

export class TreeExplorer {
  constructor({ tree, run, treeEl, crumbsEl, detailEl, searchEl, catalogue = 'bt-nodes.html', builtins = 'bt.html' }) {
    Object.assign(this, { tree, run, treeEl, crumbsEl, detailEl, searchEl, catalogue, builtins });
    this.ST = tree.subtrees;
    this.root = this.ST[tree.main];
    this.open = new Set(['']);     // rows the reader opened
    this.auto = new Set();          // rows opened to follow the run
    this.focus = '';                // the row the view starts from
    this.sel = null;
    this.query = '';
    this.runPath = new Set();
    this.leaf = null;
    this.t = 0;
    this.follow = true;
    this.cache = new Map();
    this.buildIndex();

    treeEl.addEventListener('click', (e) => {
      const row = e.target.closest('.mt-row');
      if (!row) return;
      const p = row.dataset.p;
      if (e.target.closest('.mt-caret')) { this.toggle(p); return; }
      this.select(p);
    });
    treeEl.addEventListener('keydown', (e) => {
      const row = e.target.closest('.mt-row');
      if (!row) return;
      const p = row.dataset.p;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.select(p); }
      else if (e.key === 'ArrowRight' && this.hasKids(p) && !this.isOpen(p)) { e.preventDefault(); this.toggle(p); }
      else if (e.key === 'ArrowLeft' && this.isOpen(p)) { e.preventDefault(); this.toggle(p); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const next = e.key === 'ArrowDown' ? row.nextElementSibling : row.previousElementSibling;
        if (next && next.classList.contains('mt-row')) next.focus();
      }
    });
    detailEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]');
      if (b) { this.reveal(b.dataset.p); this.select(b.dataset.p, true); }
    });
    crumbsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-p]');
      if (b) { this.focus = b.dataset.p; this.render(); }
    });
    let qt = 0;
    searchEl.addEventListener('input', () => {
      clearTimeout(qt);
      qt = setTimeout(() => { this.query = searchEl.value.trim().toLowerCase(); this.render(); this.treeEl.scrollTop = 0; }, 120);
    });
  }

  // ---------- the tree ----------
  def(p) {
    if (this.cache.has(p)) return this.cache.get(p);
    let n = this.root;
    if (p !== '') for (const i of p.split('.')) n = this.kids(n)[+i];
    this.cache.set(p, n);
    return n;
  }
  kids(n) { return n.k === 'SubTree' ? (this.ST[n.id] ? [this.ST[n.id]] : []) : n.c || []; }
  child(p, i) { return p === '' ? String(i) : `${p}.${i}`; }
  // The rows under a row: a SubTree row shows its root's children.
  rowKids(p) {
    const n = this.def(p);
    if (n.k === 'SubTree') {
      const r = this.ST[n.id];
      if (!r) return [];
      const rp = this.child(p, 0);
      return (r.c || []).map((_, i) => this.child(rp, i));
    }
    return (n.c || []).map((_, i) => this.child(p, i));
  }
  hasKids(p) { return this.rowKids(p).length > 0; }
  // The row a node is shown in (a subtree's root folds into its SubTree row).
  rowOf(p) {
    if (p === '') return p;
    const i = p.lastIndexOf('.');
    if (i > 0 && p.endsWith('.0') && this.def(p.slice(0, i)).k === 'SubTree') return p.slice(0, i);
    return p;
  }
  // The rows above a row, nearest last.
  rowAncestors(p) {
    const out = [];
    const parts = p === '' ? [] : p.split('.');
    for (let k = 0; k < parts.length; k++) {
      const a = parts.slice(0, k).join('.');
      const r = this.rowOf(a);
      if (out[out.length - 1] !== r && r !== p) out.push(r);
    }
    return out;
  }
  isOpen(p) { return this.query ? true : this.open.has(p) || this.auto.has(p); }
  toggle(p) {
    if (this.isOpen(p)) { this.open.delete(p); this.auto.delete(p); } else this.open.add(p);
    this.render();
  }
  collapse() { this.open = new Set(['']); this.auto.clear(); this.focus = ''; this.render(); }
  reveal(p) {
    const r = this.rowOf(p);
    for (const a of this.rowAncestors(r)) this.open.add(a);
    if (!r.startsWith(this.focus)) this.focus = '';
  }

  // Search text of every row, once: names, ids, attribute values.
  buildIndex() {
    this.index = [];
    const walk = (p, depth) => {
      if (depth > 60) return;
      const n = this.def(p);
      const text = [n.n, n.id, n.k, ...Object.entries(n.a || {}).flatMap(([k, v]) => [k, v])].filter(Boolean).join(' ').toLowerCase();
      this.index.push([p, text]);
      for (const c of this.rowKids(p)) walk(c, depth + 1);
    };
    walk('', 0);
  }

  // ---------- labels ----------
  kind(n) {
    if (n.k === 'SubTree') return ['sub', 'sub'];
    if (n.k === 'Decorator' && n.id) return ['until', 'dec'];
    if (BUILTIN[n.k]) return BUILTIN[n.k];
    return SHORT[n.k] || [n.k.toLowerCase(), 'ctl'];
  }
  title(n) { return n.k === 'SubTree' ? n.id : n.id || n.k; }
  label(n) {
    const a = n.a || {};
    const v = (k) => (a[k] !== undefined && a[k] !== '' ? a[k] : null);
    const c = (s) => `<code>${esc(s)}</code>`;
    let name = esc(this.title(n)), arg = '';
    switch (n.id || n.k) {
      case 'SetBlackboard': name = esc(a.output_key); arg = `= ${c(a.value)}`; break;
      case 'Info': case 'Error': arg = `“${esc(a.message)}”`; break;
      case 'Wait': arg = `${esc(a.seconds)} s`; break;
      case 'SetStatus': arg = esc(a.status); break;
      case 'SetMappingTarget': arg = `${v('target_object') ? c(a.target_object) : 'no target'}${a.lock_map === '1' ? ', lock' : ''}`; break;
      case 'FollowPath': arg = v('timeout') ? `≤ ${esc(a.timeout)} s` : ''; break;
      case 'AddWaypoint': arg = v('frame') ? `in ${c(a.frame)} (${esc(a.x)}, ${esc(a.y)}, ${esc(a.z)})` : `(${esc(a.x)}, ${esc(a.y)}, ${esc(a.z)})`; break;
      case 'AddArc': arg = `${c(a.frame || 'world')} r ${esc(a.radius)}${v('end_radius') ? `→${esc(a.end_radius)}` : ''}, sweep ${esc(a.sweep)}`; break;
      case 'ComputeFrameAlignment': arg = `${c(a.link_frame)} in ${c(a.reference_frame)} at (${esc(a.x)}, ${esc(a.y)}, ${esc(a.z)})`; break;
      case 'TransformPose': arg = `${c(a.from_frame)} → ${c(a.to_frame)}`; break;
      case 'Math': arg = `${esc(a.out)} = ${esc(a.a)} ${esc(a.operator)} ${esc(a.b)}`; break;
      case 'Format': arg = `${esc(a.out)} = “${esc(a.format)}”`; break;
      case 'CompareNums': arg = `${esc(a.a)} ${esc(a.test)} ${esc(a.b)}`; break;
      case 'MapConverged': arg = `${c(a.object)} < ${esc(a.target_cov)}`; break;
      case 'SeenRecently': arg = `${c(a.object_name)} in ${esc(a.max_age_secs)} s`; break;
      case 'IsTrue': arg = esc(a.value); break;
      case 'getCovariance': arg = c(a.Target); break;
      case 'CallTriggerService': case 'CallSetBoolService': case 'CallSetStringService': case 'CallStartBinaryClassifierService':
        arg = c(a.srv_name) + (v('data') ? ` = ${c(a.data)}` : '') + (v('class_name') ? ` on ${c(a.class_name)}` : ''); break;
      case 'PublishFloat32': case 'PublishInt8': arg = `${c(a.topic)} = ${esc(a.data)}`; break;
      case 'PublishToController': arg = `${a.isOrientation === '1' ? 'angular' : 'linear'}, mode ${esc(a.mode)}`; break;
      case 'GetBoolTopic': case 'GetTwistTopic': arg = c(a.topic); break;
      case 'CenterDetection': case 'LatestDetection': arg = c(a.object_name); break;
      case 'ContinuousSpin': arg = `${esc(a.num_cycles)} turns`; break;
      case 'Repeat': arg = `× ${esc(a.num_cycles)}`; break;
      case 'RetryUntilSuccessful': arg = `up to ${esc(a.num_attempts)} tries`; break;
      case 'RetryUntilSuccessfulOrTimeout': name = 'RetryUntil…OrTimeout'; arg = `≤ ${esc(a.num_seconds)} s`; break;
      case 'Delay': arg = `${esc(a.delay_msec)} ms`; break;
      case 'SubTree': arg = ''; break;
      default: break;
    }
    const cmt = n.n && n.k !== 'SubTree' ? ` <span class="mt-cmt">${esc(n.n)}</span>` : '';
    const sub = n.k === 'SubTree' && this.ST[n.id] && this.ST[n.id].n ? ` <span class="mt-cmt">${esc(this.ST[n.id].n)}</span>` : '';
    return `<span class="mt-name">${name}</span>${arg ? ` <span class="mt-arg">${arg}</span>` : ''}${cmt}${sub}`;
  }
  model(n) { return n.id ? this.tree.models[n.id] : null; }

  // ---------- the run ----------
  setTime(t) {
    this.t = t;
    const r = this.run;
    if (!r) return;
    const s = r.steps[Math.min(r.steps.length - 1, Math.max(0, Math.floor(t / r.dt)))];
    const leaf = s >= 0 ? r.paths[s] : null;
    if (leaf === this.leafPath) return false;
    this.leafPath = leaf;
    this.runPath = new Set();
    if (leaf !== null) {
      const parts = leaf === '' ? [] : leaf.split('.');
      for (let k = 0; k <= parts.length; k++) this.runPath.add(this.rowOf(parts.slice(0, k).join('.')));
      this.leaf = this.rowOf(leaf);
    } else this.leaf = null;
    if (this.follow && !this.query && this.leaf !== null) {
      const want = new Set(this.rowAncestors(this.leaf));
      this.auto = want;
      if (!this.leaf.startsWith(this.focus)) this.focus = '';
    }
    return true;
  }
  spans(p) { return (this.run && this.run.spans[p]) || null; }
  runningLabel() {
    if (this.leaf === null) return '–';
    const rows = [...this.rowAncestors(this.leaf), this.leaf].map((p) => this.def(p));
    const subs = rows.filter((n) => n.k === 'SubTree').map((n) => n.id);
    const leaf = rows[rows.length - 1];
    const names = subs.slice(-3);
    if (leaf.k !== 'SubTree') names.push(leaf.id || leaf.k);
    return names.join(' › ');
  }

  // ---------- drawing ----------
  render() {
    const rows = [];
    const focus = this.focus;
    let shown = 0;
    const LIMIT = 600;
    let visible = null;
    if (this.query.length >= 2) {
      visible = new Set();
      this.hits = new Set();
      for (const [p, text] of this.index) {
        if (!text.includes(this.query)) continue;
        if (this.hits.size >= 400) break;
        this.hits.add(p);
        visible.add(p);
        for (const a of this.rowAncestors(p)) visible.add(a);
      }
    } else this.hits = null;
    const walk = (p, d) => {
      if (shown >= LIMIT) return;
      if (visible && !visible.has(p)) return;
      const n = this.def(p);
      // runs of SetBlackboard siblings fold into one row
      rows.push(this.row(p, n, d));
      shown++;
      if (!this.hasKids(p) || !this.isOpen(p)) return;
      const kids = this.rowKids(p);
      for (let i = 0; i < kids.length; i++) {
        const kn = this.def(kids[i]);
        if (kn.k === 'SetBlackboard' && !visible) {
          let j = i;
          while (j + 1 < kids.length && this.def(kids[j + 1]).k === 'SetBlackboard') j++;
          if (j > i) { rows.push(this.bbRow(kids.slice(i, j + 1), d + 1)); shown++; i = j; continue; }
        }
        walk(kids[i], d + 1);
      }
    };
    walk(focus, 0);
    let html = rows.join('');
    if (shown >= LIMIT) html += `<div class="mt-more">First ${LIMIT} rows shown. Search, or open fewer nodes.</div>`;
    if (this.hits && !this.hits.size) html = `<div class="mt-more">Nothing matches “${esc(this.query)}”.</div>`;
    this.treeEl.innerHTML = html;
    // where the view starts
    if (focus === '') this.crumbsEl.innerHTML = this.hits ? `${this.hits.size >= 400 ? '400+' : this.hits.size} matching nodes, every place they run` : 'The main tree. Tap ▸ to open a node.';
    else {
      const anc = this.rowAncestors(focus).filter((p) => p === '' || this.def(p).k === 'SubTree');
      this.crumbsEl.innerHTML = 'Showing ' + [...anc, focus].map((p) => `<button class="btn-link" data-p="${p}">${esc(p === '' ? 'main tree' : this.title(this.def(p)))}</button>`).join(' › ');
    }
  }
  row(p, n, d) {
    const [badge, cls] = this.kind(n);
    const kids = this.hasKids(p);
    const open = kids && this.isOpen(p);
    const sp = this.run ? this.spans(p) : null;
    const st = [];
    if (this.run && !sp) st.push('never');
    if (this.runPath.has(p)) st.push('run');
    if (this.leaf === p) st.push('leaf');
    if (this.sel === p) st.push('sel');
    if (this.hits && this.hits.has(p)) st.push('hit');
    const wrap = kids && !open && cls === 'dec' && !n.n ? this.wraps(p) : '';
    return `<div class="mt-row ${st.join(' ')}" data-p="${p}" style="--d:${d}" role="treeitem" tabindex="0"${kids ? ` aria-expanded="${open}"` : ''}>`
      + `<button class="mt-caret${kids ? '' : ' none'}" type="button" tabindex="-1" aria-label="${open ? 'Close' : 'Open'}" aria-expanded="${open}"></button>`
      + `<span class="mt-badge k-${cls}">${badge}</span><span class="mt-label">${this.label(n)}${wrap}</span></div>`;
  }
  // What a closed, unnamed decorator wraps, so a row of ForceSuccess reads "ForceSuccess › GateTreeMpc": follows
  // further unnamed one-child decorators (at most two) down to the first node that says what it is.
  wraps(p) {
    const chain = [];
    let ks = this.rowKids(p);
    for (let hop = 0; hop < 3 && ks.length === 1; hop++) {
      const c = this.def(ks[0]);
      if (c.k === 'SubTree') { chain.push(`<b>${esc(c.id)}</b>`); break; }
      const [, cls] = this.kind(c);
      if (cls === 'dec' && !c.n && hop < 2) { chain.push(esc(this.title(c))); ks = this.rowKids(ks[0]); continue; }
      chain.push(`${esc(this.title(c))}${c.n ? ` <b>${esc(c.n)}</b>` : ''}`);
      break;
    }
    return chain.length ? ` <span class="mt-wrap">› ${chain.join(' › ')}</span>` : '';
  }
  bbRow(ps, d) {
    const items = ps.map((p) => this.def(p).a || {});
    const text = items.map((a) => `${esc(a.output_key)}=${esc(a.value)}`).join(' · ');
    const st = this.sel === ps[0] ? ' sel' : '';
    const never = this.run && !ps.some((p) => this.spans(p)) ? ' never' : '';
    return `<div class="mt-row${st}${never}" data-p="${ps[0]}" data-bb="${ps.length}" style="--d:${d}" role="treeitem" tabindex="0">`
      + `<button class="mt-caret none" type="button" tabindex="-1" aria-hidden="true"></button>`
      + `<span class="mt-badge k-bb">set ×${ps.length}</span><span class="mt-label mt-arg">${text}</span></div>`;
  }
  scrollToLeaf() {
    if (this.leaf === null) return;
    const el = this.treeEl.querySelector(`.mt-row[data-p="${this.leaf}"]`);
    if (!el) return;
    const top = el.offsetTop, h = this.treeEl.clientHeight;
    if (top < this.treeEl.scrollTop + 20 || top > this.treeEl.scrollTop + h - 40) this.treeEl.scrollTop = Math.max(0, top - h * 0.35);
  }
  scrollToRow(p) {
    const el = this.treeEl.querySelector(`.mt-row[data-p="${p}"]`);
    if (el) this.treeEl.scrollTop = Math.max(0, el.offsetTop - this.treeEl.clientHeight * 0.25);
  }

  // ---------- details ----------
  select(p, scroll = false) {
    this.sel = p;
    this.render();
    if (scroll) this.scrollToRow(p);
    this.detail();
  }
  // The node with this ID or name. A subtree used in several places (the torpedo and table trees sit in both branches
  // of the pinger's IfThenElse) matches more than once: prefer the one running at time t, then one that ran at all.
  find(nameOrId, t = null) {
    const all = this.index.map(([p]) => p).filter((p) => { const n = this.def(p); return n.id === nameOrId || n.n === nameOrId; });
    if (!all.length) return null;
    if (this.run) {
      const at = t === null ? null : all.find((p) => (this.spans(p) || []).some(([a, b]) => t >= a - 0.5 && t <= b + 0.5));
      return at || all.find((p) => this.spans(p)) || all[0];
    }
    return all[0];
  }
  detail() {
    const p = this.sel;
    if (p === null) {
      this.detailEl.innerHTML = '<p class="mt-hint">Tap a row to see what the node does, its ports, its line in the XML and when it ran.</p>';
      return;
    }
    const row = this.treeEl.querySelector(`.mt-row[data-p="${p}"]`);
    const bb = row && row.dataset.bb ? +row.dataset.bb : 0;
    const n = this.def(p);
    const XML = XML_URL + this.tree.file;
    const anc = this.rowAncestors(p).filter((a) => a !== '' && (this.def(a).k === 'SubTree' || this.def(a).n));
    const path = anc.length ? `<div class="path">${anc.slice(-4).map((a) => `<button data-p="${a}">${esc(this.def(a).k === 'SubTree' ? this.def(a).id : this.def(a).n)}</button>`).join(' › ')}</div>` : '';
    let html = path;
    if (bb) {
      // a folded run of SetBlackboard nodes
      const parts = p.split('.');
      const first = +parts.pop(), base = parts.join('.');
      const items = [];
      for (let i = first; i < first + bb; i++) items.push(this.def(base === '' ? String(i) : `${base}.${i}`));
      html += `<h4><span class="mt-badge k-bb">set</span> ${bb} blackboard values</h4>`
        + `<p>${BUILTIN.SetBlackboard[2]} Keys that are just numbers (<code>0</code>, <code>1</code>, <code>3.1415</code>) exist so that a SubTree attribute, which names a key, can pass that number.</p>`
        + `<table><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>${items.map((m) => `<tr><td><code>${esc(m.a.output_key)}</code>${m.n ? `<small>${esc(m.n)}</small>` : ''}</td><td><code>${esc(m.a.value)}</code></td></tr>`).join('')}</tbody></table>`
        + `<div class="links"><a href="${XML}#L${items[0].l}">XML lines ${items[0].l}–${items[items.length - 1].l}</a></div>`;
      this.detailEl.innerHTML = html;
      return;
    }
    const [badge, cls] = this.kind(n);
    const m = this.model(n);
    const builtin = BUILTIN[n.k] || (n.k === 'SubTree' ? 1 : 0);
    let doc = '';
    if (n.k === 'SubTree') {
      const r = this.ST[n.id];
      doc = `Runs the subtree <code>${esc(n.id)}</code>${r && r.l0 ? ` (defined at line ${r.l0})` : ''}${n.a && n.a.__shared_blackboard === 'false' ? ' with its own blackboard. Each attribute below maps one of its ports to a key of the caller: a key name, not a value.' : '.'}`;
    } else doc = esc((m && m.doc) || DOCS[n.id] || (BUILTIN[n.k] && BUILTIN[n.k][2]) || '');
    html += `<h4><span class="mt-badge k-${cls}">${badge}</span> ${esc(this.title(n))}</h4>`;
    if (n.n) html += `<p><i>${esc(n.n)}</i></p>`;
    if (doc) html += `<p>${doc}</p>`;
    // ports
    const attrs = Object.entries(n.a || {}).filter(([k]) => k !== '__shared_blackboard');
    const desc = Object.fromEntries(((m && m.ports) || []).map((q) => [q.name, q]));
    const set = attrs.filter(([, val]) => val !== '');
    const empty = attrs.length - set.length;
    if (set.length) {
      html += `<table><thead><tr><th>${n.k === 'SubTree' ? 'Port' : 'Port'}</th><th>${n.k === 'SubTree' ? 'Caller\'s key' : 'Value'}</th></tr></thead><tbody>`
        + set.map(([k, val]) => {
          const q = desc[k];
          const d = q ? `${q.dir === 'output' ? 'out' : ''}${q.dir === 'output' && q.desc ? ': ' : ''}${esc(q.desc)}` : '';
          return `<tr><td><code>${esc(k)}</code>${d ? `<small>${d}</small>` : ''}</td><td><code>${esc(val)}</code></td></tr>`;
        }).join('') + '</tbody></table>';
    }
    if (empty) html += `<p class="mt-hint">${empty} empty port${empty > 1 ? 's' : ''} hidden (Groot saves every port; empty means the default).</p>`;
    // the run
    if (this.run) {
      const sp = this.spans(p);
      if (!sp) html += '<p class="when">Not seen running in this Nereus run (a node that finishes within one tick can be missed).</p>';
      else {
        const now = sp.some(([a, b]) => this.t >= a && this.t <= b);
        const total = sp.reduce((s, [a, b]) => s + (b - a), 0);
        const list = sp.slice(0, 4).map(([a, b]) => (b - a < 0.15 ? fmtT(a) : `${fmtT(a)}–${fmtT(b)}`)).join(', ');
        html += `<p class="when${now ? ' now' : ''}">${now ? 'Running now. ' : ''}Ran ${sp.length > 1 ? `${sp.length} times, ` : ''}at ${list}${sp.length > 4 ? ', …' : ''}${total >= 1 ? ` (${fmtS(total)} in all)` : ''}.</p>`;
      }
    }
    const links = [`<a href="${XML}#L${n.l}">XML line ${n.l}</a>`];
    if (m) {
      const src = m.src.includes('#') ? m.src : m.src;
      links.push(`<a href="${XML_URL}${src}">C++ source</a>`);
      links.push(`<a href="${this.catalogue}#node-${encodeURIComponent(n.id)}">In the node catalogue</a>`);
    } else if (builtin) links.push(`<a href="${this.builtins}">Behaviour trees</a>`);
    if (this.hasKids(p)) links.push(`<button class="btn-link" data-root="${p}">Show only this</button>`);
    html += `<div class="links">${links.join('')}</div>`;
    this.detailEl.innerHTML = html;
    const only = this.detailEl.querySelector('[data-root]');
    if (only) only.onclick = () => { this.focus = only.dataset.root; this.open.add(this.focus); this.render(); };
  }
}

export { fmtT };
