// A small BehaviorTree.CPP v3 interpreter for the Behaviour trees chapter. It builds a tree from the JSON that
// tools/bt/extract.py writes (one XML element per node) and ticks it with the same rules as the C++ library:
// sequence_node.cpp, fallback_node.cpp, reactive_sequence.cpp, if_then_else_node.cpp, inverter_node.cpp,
// force_success/failure_node.h and StatefulActionNode, plus riptide_autonomy's RetryUntilSuccessfulOrTimeout.
// Leaves that touch ROS are stand-ins driven by a `world` object the page controls.

export const IDLE = 'IDLE', RUNNING = 'RUNNING', SUCCESS = 'SUCCESS', FAILURE = 'FAILURE';
export const TICK = 0.03; // doTask: rclcpp::Rate loop_rate(30ms)

const isRef = (v) => typeof v === 'string' && v.length > 2 && v[0] === '{' && v[v.length - 1] === '}';
const fmtNum = (x) => (Number.isInteger(x) ? String(x) : String(+x.toFixed(6)));

class Node {
  constructor(spec, sim, parent) {
    this.spec = spec;
    this.sim = sim;
    this.parent = parent;
    this.status = IDLE;
    this.id = sim.nodes.length;
    sim.nodes.push(this);
    this.children = (spec.children || []).map((c) => build(c, sim, this));
  }
  get kind() { return this.spec.id || this.spec.tag; }
  attr(k) { return this.spec.attrs?.[k]; }
  // BT::getInput: "{key}" reads the blackboard, anything else is a literal.
  input(k, def) {
    const v = this.attr(k);
    if (v === undefined || v === '') return def;
    if (isRef(v)) {
      const got = this.sim.bb.get(v.slice(1, -1));
      return got === undefined ? def : got;
    }
    return v;
  }
  num(k, def) { const v = this.input(k); return v === undefined ? def : +v; }
  // setOutput accepts "{key}" or a bare key
  output(k, value) {
    let key = this.attr(k);
    if (!key) return;
    if (isRef(key)) key = key.slice(1, -1);
    this.sim.write(key, value, this);
  }
  // riptide_autonomy's formatStringWithBlackboard: {key} inside a longer string
  format(str) { return (str || '').replace(/\{([^}]*)\}/g, (m, k) => (this.sim.bb.has(k) ? this.sim.bb.get(k) : m)); }
  executeTick() {
    const s = this.sim;
    const visit = { order: ++s.visitCount };
    s.visits.set(this.id, visit);
    const r = this.tick();
    visit.result = r;
    this.setStatus(r);
    return r;
  }
  setStatus(st) {
    if (st !== this.status) this.sim.changed.add(this.id);
    this.status = st;
  }
  resetStatus() { this.setStatus(IDLE); }
  halt() {}
  haltChild(c) {
    if (c.status === RUNNING) { c.halt(); this.sim.halted.add(c.id); }
    c.resetStatus();
  }
  resetChildren() { this.children.forEach((c) => this.haltChild(c)); }
  log(msg, cls) { this.sim.log(msg, cls, this); }
}

// ---------- control nodes ----------
class Sequence extends Node {
  constructor(...a) { super(...a); this.idx = 0; }
  tick() {
    this.setStatus(RUNNING);
    while (this.idx < this.children.length) {
      const st = this.children[this.idx].executeTick();
      if (st === RUNNING) return RUNNING;
      if (st === FAILURE) { this.resetChildren(); this.idx = 0; return FAILURE; }
      this.idx++;
    }
    this.resetChildren(); this.idx = 0;
    return SUCCESS;
  }
  halt() { this.idx = 0; this.resetChildren(); }
}
class Fallback extends Node {
  constructor(...a) { super(...a); this.idx = 0; }
  tick() {
    this.setStatus(RUNNING);
    while (this.idx < this.children.length) {
      const st = this.children[this.idx].executeTick();
      if (st === RUNNING) return RUNNING;
      if (st === SUCCESS) { this.resetChildren(); this.idx = 0; return SUCCESS; }
      this.idx++;
    }
    this.resetChildren(); this.idx = 0;
    return FAILURE;
  }
  halt() { this.idx = 0; this.resetChildren(); }
}
class ReactiveSequence extends Node {
  tick() {
    let ok = 0;
    this.setStatus(RUNNING);
    for (let i = 0; i < this.children.length; i++) {
      const st = this.children[i].executeTick();
      if (st === RUNNING) {
        this.children.forEach((c, j) => { if (j !== i) this.haltChild(c); });
        return RUNNING;
      }
      if (st === FAILURE) { this.resetChildren(); return FAILURE; }
      ok++;
    }
    if (ok === this.children.length) { this.resetChildren(); return SUCCESS; }
    return RUNNING;
  }
  halt() { this.resetChildren(); }
}
class IfThenElse extends Node {
  constructor(...a) { super(...a); this.idx = 0; }
  tick() {
    this.setStatus(RUNNING);
    if (this.idx === 0) {
      const c = this.children[0].executeTick();
      if (c === RUNNING) return RUNNING;
      if (c === SUCCESS) this.idx = 1;
      else if (this.children.length === 3) this.idx = 2;
      else return c;
    }
    const st = this.children[this.idx].executeTick();
    if (st === RUNNING) return RUNNING;
    this.resetChildren(); this.idx = 0;
    return st;
  }
  halt() { this.idx = 0; this.resetChildren(); }
}

// ---------- decorators ----------
class Decorator extends Node {
  get child() { return this.children[0]; }
  resetChild() { this.haltChild(this.child); }
  halt() { this.resetChild(); }
}
class Inverter extends Decorator {
  tick() {
    this.setStatus(RUNNING);
    const st = this.child.executeTick();
    if (st === RUNNING) return RUNNING;
    this.resetChild();
    return st === SUCCESS ? FAILURE : SUCCESS;
  }
}
class ForceResult extends Decorator {
  constructor(spec, sim, parent, result) { super(spec, sim, parent); this.result = result; }
  tick() {
    this.setStatus(RUNNING);
    const st = this.child.executeTick();
    if (st === RUNNING) return RUNNING;
    this.resetChild();
    return this.result;
  }
}
// riptide_autonomy/include/riptide_autonomy/bt_decorators/RetryUntilSuccessfulOrTimeout.btdecorator.hpp
class RetryOrTimeout extends Decorator {
  tick() {
    if (this.status === IDLE) { this.start = this.sim.t; this.duration = this.num('num_seconds', 0); }
    const elapsed = this.sim.t - this.start;
    if (elapsed < this.duration) {
      const st = this.child.executeTick();
      if (st === SUCCESS) return SUCCESS;
      if (st === FAILURE) this.retries = (this.retries || 0) + 1;
      return RUNNING;
    }
    this.log(`timed out after ${fmtNum(this.duration)} s`, 'bad');
    return FAILURE; // note: a RUNNING child is left as it is, not halted
  }
  detail() {
    if (this.status !== RUNNING) return '';
    return `${(this.sim.t - this.start).toFixed(2)} of ${fmtNum(this.duration)} s`;
  }
}

// ---------- leaves ----------
class Leaf extends Node {}
class Sync extends Leaf {
  tick() { return this.run(); }
}
class SetBlackboard extends Sync {
  run() {
    const v = this.attr('value');
    const val = isRef(v) ? this.sim.bb.get(v.slice(1, -1)) : v;
    this.sim.write(this.attr('output_key'), val, this);
    return SUCCESS;
  }
}
class AlwaysSuccess extends Sync { run() { return SUCCESS; } }
class Info extends Sync { run() { this.log(this.format(this.input('message', '')), this.kind === 'Error' ? 'bad' : ''); return SUCCESS; } }
class Format extends Sync { run() { this.output('out', this.format(this.input('format', ''))); return SUCCESS; } }
class MathNode extends Sync {
  run() {
    const a = this.num('a', 0), b = this.num('b', 0), op = this.input('operator', '+');
    const r = op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? a / b : 0;
    this.output('out', fmtNum(r));
    return SUCCESS;
  }
}
class CompareNums extends Sync {
  run() {
    const a = this.num('a', 0), b = this.num('b', 0), t = this.input('test', '');
    const ok = t === '>' ? a > b : t === '<' ? a < b : t === '==' ? a === b : false;
    return ok ? SUCCESS : FAILURE;
  }
  detail() { return `${this.input('a', '?')} ${this.input('test', '')} ${this.input('b', '?')}`; }
}
// Path building (AddWaypoint / AddArc write a waypoint string; here a readable summary of it).
class AddWaypoint extends Sync {
  run() {
    const prev = this.input('path', '');
    const leg = `waypoint ${this.input('x', '0')} m in front of ${this.input('frame', 'world')}`;
    this.output('out', prev ? `${prev}; ${leg}` : leg);
    return SUCCESS;
  }
}
class AddArc extends Sync {
  run() {
    const prev = this.input('path', '');
    const leg = `arc ${fmtNum(+this.input('sweep', 0))} rad at ${this.input('radius', '?')} m`;
    this.output('out', prev ? `${prev}; ${leg}` : leg);
    return SUCCESS;
  }
}
// Conditions read the world the page controls.
class SeenRecently extends Sync {
  run() {
    const age = this.sim.t - this.sim.world.lastSeen;
    return age >= 0 && age <= this.num('max_age_secs', 0.5) ? SUCCESS : FAILURE;
  }
  detail() {
    const age = this.sim.t - this.sim.world.lastSeen;
    return `last seen ${isFinite(age) ? age.toFixed(2) + ' s ago' : 'never'}; max ${this.input('max_age_secs')} s`;
  }
}
class MapConverged extends Sync { run() { return this.sim.world.converged ? SUCCESS : FAILURE; } }

// BT::StatefulActionNode: onStart on the first tick, onRunning while RUNNING, onHalted when halted.
class Stateful extends Leaf {
  tick() {
    if (this.status === IDLE) { this.t0 = this.sim.t; return this.onStart(); }
    if (this.status === RUNNING) return this.onRunning();
    return this.status;
  }
  halt() { if (this.status === RUNNING) this.onHalted(); }
  onHalted() {}
  get elapsed() { return this.sim.t - this.t0; }
}
class SetStatus extends Stateful {
  onStart() { this.log(`LEDs: ${this.input('status')} (${LED[this.input('status')] || '?'})`); return SUCCESS; }
}
const LED = { waiting: 'solid red', starting: 'slow blink blue', moving: 'solid green', searching: 'solid orange', aligning: 'slow blink purple', performing: 'fast blink blue' };
class SetMappingTarget extends Stateful {
  onStart() { this.phase = 'request sent'; this.log(`mapping_target: target ${this.input('target_object') || '(none)'}, lock_map ${this.input('lock_map')}`, 'ros'); return RUNNING; }
  onRunning() { this.phase = ''; return SUCCESS; } // the reply comes back on the next tick
  detail() { return this.status === RUNNING ? 'waiting for the service reply' : ''; }
}
class GetCovariance extends Stateful {
  onStart() { return RUNNING; } // subscribes to mapping/<Target>, waits for one message (5 s limit)
  onRunning() {
    const v = this.sim.world.converged ? this.sim.world.covLow : this.sim.world.covHigh;
    this.output('Covariance', String(v));
    return SUCCESS;
  }
  detail() { return this.status === RUNNING ? 'waiting for mapping/torpedo' : ''; }
}
class Wait extends Stateful {
  onStart() { this.goal = this.num('seconds', 0); return RUNNING; }
  onRunning() { return this.elapsed >= this.goal ? SUCCESS : RUNNING; }
  detail() { return this.status === RUNNING ? `${this.elapsed.toFixed(2)} of ${fmtNum(this.goal)} s` : ''; }
}
// FollowPath.btaction.hpp: parse in onStart, then send the goal, wait for acceptance and the result in onRunning.
class FollowPath extends Stateful {
  onStart() {
    this.timeout = this.num('timeout', 60);
    this.step = 0;
    this.phase = 'onStart: waypoints parsed';
    this.sim.world.pathDone = false;
    return RUNNING;
  }
  onRunning() {
    const w = this.sim.world;
    if (this.elapsed > this.timeout) { this.cancel('timed out'); return FAILURE; }
    if (this.step === 0) { this.step = 1; this.phase = 'goal sent to follow_path'; this.log('follow_path: goal sent', 'ros'); return RUNNING; }
    if (this.step === 1) { this.step = 2; this.phase = 'goal accepted, Talos is flying the path'; this.log('follow_path: goal accepted', 'ros'); w.flying = this; return RUNNING; }
    if (w.pathDone) { this.step = 3; this.phase = ''; w.flying = null; w.pathDone = false; this.log('follow_path: SUCCEEDED', 'ros'); return SUCCESS; }
    return RUNNING;
  }
  onHalted() { this.cancel('halted'); }
  cancel(why) {
    if (this.step >= 1) this.log(`follow_path: goal cancelled (${why})`, 'bad');
    if (this.sim.world.flying === this) this.sim.world.flying = null;
    this.phase = '';
  }
  detail() { return this.status === RUNNING ? `${this.phase}; ${this.elapsed.toFixed(2)} of ${fmtNum(this.timeout)} s` : ''; }
}
// CenterDetection: SUCCESS once square on to the detection, FAILURE if lost (no detection for max_age_secs, default
// 1.5 s) or after timeout_secs.
class CenterDetection extends Stateful {
  onStart() { this.timeout = this.num('timeout_secs', 8); this.sim.world.centred = false; this.sim.world.centring = this; this.log('chasing the detection', 'ros'); return RUNNING; }
  onRunning() {
    const w = this.sim.world;
    if (this.sim.t - w.lastSeen > this.num('max_age_secs', 1.5)) { this.end(); this.log('CenterDetection: lost it', 'bad'); return FAILURE; }
    if (this.elapsed > this.timeout) { this.end(); this.log('CenterDetection: timed out', 'bad'); return FAILURE; }
    if (w.centred) { this.end(); return SUCCESS; }
    return RUNNING;
  }
  onHalted() { this.end(); }
  end() { if (this.sim.world.centring === this) this.sim.world.centring = null; this.sim.world.centred = false; }
  detail() { return this.status === RUNNING ? `${this.elapsed.toFixed(2)} of ${fmtNum(this.timeout)} s` : ''; }
}

const BUILD = {
  Sequence, Fallback, ReactiveSequence, IfThenElse, Inverter, SetBlackboard, AlwaysSuccess,
  ForceSuccess: (s, sim, p) => new ForceResult(s, sim, p, SUCCESS),
  ForceFailure: (s, sim, p) => new ForceResult(s, sim, p, FAILURE),
  RetryUntilSuccessfulOrTimeout: RetryOrTimeout,
  Info, Error: Info, Format, Math: MathNode, CompareNums, AddWaypoint, AddArc, SeenRecently, MapConverged,
  SetStatus, SetMappingTarget, getCovariance: GetCovariance, Wait, FollowPath, CenterDetection,
};
function build(spec, sim, parent) {
  let key = spec.id || spec.tag;
  if (spec.tag === 'ReactiveSequence' && sim.opts.plainSequence) key = 'Sequence';
  const C = BUILD[key];
  if (!C) throw new Error('bt-engine: no model for ' + key);
  return C.prototype instanceof Node ? new C(spec, sim, parent) : C(spec, sim, parent);
}

export class Sim {
  // spec: the root element; inputs: the subtree's remapped ports and their values in the caller.
  constructor(spec, inputs, opts = {}) {
    this.opts = opts;
    this.nodes = [];
    this.bb = new Map();
    this.bbInfo = new Map();
    for (const [k, v] of Object.entries(inputs)) { this.bb.set(k, v); this.bbInfo.set(k, { remapped: true }); }
    this.world = { lastSeen: -Infinity, converged: false, pathDone: false, centred: false, flying: null, centring: null, covLow: 0.001, covHigh: 0.01, seen: false };
    this.t = 0;
    this.tickNo = 0;
    this.result = null;
    this.events = [];
    this.root = build(spec, this, null);
    this.visits = new Map();
    this.halted = new Set();
    this.changed = new Set();
    this.written = new Set();
  }
  write(key, value, node) {
    if (this.bb.get(key) !== value) this.written.add(key);
    this.bb.set(key, value);
    if (!this.bbInfo.has(key)) this.bbInfo.set(key, {});
  }
  log(msg, cls = '', node) { this.events.push({ tick: this.tickNo, t: this.t, msg, cls, node: node?.id }); if (this.events.length > 400) this.events.shift(); }
  tick() {
    if (this.result) return this.result;
    this.tickNo++;
    this.t = +(this.tickNo * TICK).toFixed(4);
    if (this.world.seen) this.world.lastSeen = this.t; // detections keep arriving while it is in view
    this.visits = new Map();
    this.visitCount = 0;
    this.halted = new Set();
    this.changed = new Set();
    this.written = new Set();
    const st = this.root.executeTick();
    if (st !== RUNNING) {
      this.result = st;
      this.log(`SearchMpc returned ${st}`, st === SUCCESS ? 'good' : 'bad');
    }
    return st;
  }
  // Tick until something visible changes (a status, a blackboard key, a log line), or `maxSecs` pass.
  untilChange(maxSecs = 10) {
    const n0 = this.events.length;
    const sig = () => this.nodes.map((n) => n.status[0]).join('');
    const start = this.t;
    let before = sig();
    for (;;) {
      this.tick();
      const after = sig();
      if (this.result || after !== before || this.written.size || this.events.length !== n0 || this.halted.size) return true;
      if (this.t - start >= maxSecs) return false;
      before = after;
    }
  }
  // Nodes left RUNNING under a parent that has finished: nobody will tick or halt them again.
  orphans() {
    const out = new Set();
    for (const n of this.nodes) {
      if (n.status !== RUNNING || !n.parent) continue;
      if (n.parent.status !== RUNNING) out.add(n.id);
    }
    return out;
  }
}
