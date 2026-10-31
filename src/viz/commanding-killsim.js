// A step-by-step model of Talos's enable/kill chain, ported from the code:
//   POAC board   titan_safety kill_switch.c + PoacBoard ros.c / safety_interface.c / main.c
//   ESC boards   ESCBoard ros.c (state/kill as a needs_update slot) + core1.c (disabled flags)
//   overseer     controller_overseer.py thrusterTelemetryCB / escPowerTimeout (controller/motion_enabled)
//   viewer       nereus uwrt_motion.cpp + ros_runtime.cpp (slot 1 heartbeat, Enable / KILL, competing operator)
//   MPC          mpc_controller_node.cpp tick() gate (state/kill, motion_enabled, DISABLED reference)
// Constants (`K`) come from public/data/commanding/commanding.json, written by tools/commanding/extract.py.
// Simplifications: both ESC boards behave as one; messages arrive at once; odometry is always fresh; a board's
// failed heartbeats are counted as if each publish failed at once, so it drops its session (more than 7 failures,
// 100 ms apart) about 0.8 s after the agent dies.

const DT = 0.01; // s per step
const HIST = 20; // s of strips

export function makeConstants(data) {
  const f = data.firmware;
  return {
    switchTimeout: f.switch_timeout_ms.value / 1000,
    poacPublish: f.poac_kill_publish_ms.value / 1000,
    escRpmTimeout: f.esc_rpm_timeout_ms.value / 1000,
    escPenalty: f.esc_rpm_penalty_ms.value / 1000,
    escPoweron: f.esc_poweron_delay_ms.value / 1000,
    escTelem: f.esc_telemetry_ms.value / 1000,
    sessionLoss: (f.ros_heartbeat_ms.value * (f.ros_max_missed_heartbeats.value + 1)) / 1000,
    flags: f.esc_flags,
    stopTolerance: data.overseer.stop_tolerance.value,
    overseerTimeout: data.overseer.power_timeout_s.value,
    viewerSlot: data.viewer.slot,
    viewerBeat: data.viewer.heartbeat_s,
    mpcPeriod: data.mpc.control_period_s,
    slots: data.slots.list,
  };
}

export class KillSim {
  constructor(K) {
    this.K = K;
    this.reset();
  }

  reset({ switchIn = true, viewerOpen = true, link = true, control = true } = {}) {
    const K = this.K;
    this.t = 0;
    this.log = [];
    this.hist = [];
    this.pid = 4100;
    this.inputs = { switchIn, link, control };
    this.linkDownAt = link ? null : -1e9;
    this.viewer = { open: false, enabled: false, sender: '', competitorAt: -1e9, nextBeat: 0, session: false };
    if (viewerOpen) this.openViewer(true);
    this.laptop = { slot: 3, needsUpdate: true, repeat: null, nextSend: 0, sender: 'laptop-cli' };
    this.poac = {
      initialized: link,
      asserting: true, // kill_switch.c: last_state_asserting_kill starts true
      slots: K.slots.map((s) => ({ id: s.id, enabled: false, asserting: false, needsUpdate: false, timeoutAt: 0, lock: '', lastFrom: '' })),
      nextPublish: K.poacPublish,
      changed: true,
      stateKill: null, // last published value
    };
    this.esc = {
      slot: { enabled: false, asserting: false, timeoutAt: 0 },
      session: link,
      wasOff: true,
      poweronUntil: 0,
      rpmExpireAt: -1,
      penaltyUntil: -1,
      flags: 0,
      thrustersOn: false,
      nextTelem: K.escTelem,
    };
    this.overseer = { stops: 0, lastTelem: 0, motionEnabled: false, nextTimeout: K.overseerTimeout };
    this.mpc = { killed: false, motionEnabled: true, mode: 'DISABLED', nextTick: 0, commanding: false };
  }

  note(msg, kind = '') {
    this.log.unshift({ t: this.t, msg, kind });
    if (this.log.length > 7) this.log.length = 7;
  }

  // ---------- the network: a KillSwitchReport on command/software_kill ----------
  publishKill(slot, sender, asserting, needsUpdate) {
    const msg = { slot, sender, asserting, needsUpdate };
    // Everyone subscribed hears it: the POAC board acts on it, and the viewer watches for competing operators on
    // its slot (its reaction, a kill of its own, comes after).
    if (this.inputs.link) this.poacReceives(msg);
    this.viewerHears(msg);
  }

  // PoacBoard ros.c software_kill_subscription_callback
  poacReceives(msg) {
    const p = this.poac;
    if (msg.slot >= this.K.slots.length || msg.slot === 0) {
      this.note(`POAC rejected a report on slot ${msg.slot}: not a software slot`, 'bad');
      return;
    }
    const s = p.slots[msg.slot];
    if (s.enabled && s.asserting && !msg.asserting && s.lock !== msg.sender) {
      this.note(`POAC rejected "${msg.sender}" clearing slot ${msg.slot}: locked by "${s.lock}"`, 'bad');
      return;
    }
    if (msg.asserting) s.lock = msg.sender;
    s.asserting = msg.asserting;
    s.needsUpdate = msg.needsUpdate;
    s.timeoutAt = this.t + this.K.switchTimeout;
    s.enabled = true;
    s.lastFrom = msg.sender;
    if (p.initialized && msg.asserting) this.poacKill();
  }

  poacKill() {
    const p = this.poac;
    if (!p.asserting) p.changed = true;
    p.asserting = true;
  }

  // ---------- the viewer (uwrt_motion.cpp / ros_runtime.cpp) ----------
  openViewer(silent) {
    const v = this.viewer;
    v.open = true;
    v.enabled = false;
    v.session = false;
    v.sender = `viewer_optop_${++this.pid}_1`;
    v.nextBeat = this.t;
    if (!silent) this.note('Viewer opened: its slot-1 heartbeat asserts kill');
  }

  closeViewer() {
    const v = this.viewer;
    if (!v.open) return;
    v.open = false;
    this.note(v.enabled ? 'Viewer closed while enabled: slot 1 stays latched clear' : 'Viewer closed');
    v.enabled = false;
  }

  viewerHears(msg) {
    const v = this.viewer;
    if (!v.open || msg.slot !== this.K.viewerSlot || msg.sender === v.sender) return;
    v.competitorAt = this.t;
    if (v.enabled) {
      this.note('Viewer: "Another operator owns the enable switch". It drops its enable', 'bad');
      this.viewerKill(true);
    }
  }

  viewerReport() {
    const v = this.viewer;
    this.publishKill(this.K.viewerSlot, v.sender, !v.enabled, false);
  }

  viewerKill(fromCompetitor) {
    const v = this.viewer;
    v.session = true;
    v.enabled = false;
    this.viewerReport();
    this.sendCommand('DISABLED');
    if (!fromCompetitor) this.note('Viewer KILL: slot 1 asserts, DISABLED sent');
  }

  viewerEnable() {
    const v = this.viewer;
    if (!v.open) return false;
    if (this.t - v.competitorAt < 1) {
      this.note('Viewer refused Enable: another operator is on slot 1', 'bad');
      return false;
    }
    // killLocked first: a clean, disabled controller, then the switch on
    v.session = true;
    v.enabled = false;
    this.viewerReport();
    this.sendCommand('DISABLED');
    v.enabled = true;
    this.viewerReport();
    this.note('Viewer Enable: slot 1 clear (latched, needs_update false)');
    return true;
  }

  viewerCommand() {
    if (!this.viewer.open || !this.viewer.enabled) return false;
    this.sendCommand('POSITION');
    this.note('Viewer Command: POSITION on both halves (hold here)');
    return true;
  }

  sendCommand(mode) {
    if (this.inputs.control) this.mpc.mode = mode;
  }

  // ---------- the laptop on any slot ----------
  laptopSend(slot, asserting, needsUpdate, repeat) {
    const l = this.laptop;
    l.slot = slot;
    l.needsUpdate = needsUpdate;
    l.repeat = repeat ? { asserting } : null;
    this.note(`Laptop: slot ${slot} ${asserting ? 'kill' : 'clear'}${needsUpdate ? ', needs_update' : ', latched'}${repeat ? ', 20 Hz' : ', once'}`);
    this.publishKill(slot, l.sender, asserting, needsUpdate);
  }

  laptopStop() {
    if (this.laptop.repeat) this.note(`Laptop stopped publishing on slot ${this.laptop.slot}`);
    this.laptop.repeat = null;
  }

  // ---------- inputs ----------
  setSwitch(inside) {
    if (this.inputs.switchIn === inside) return;
    this.inputs.switchIn = inside;
    this.note(inside ? 'Kill switch inserted' : 'Kill switch pulled');
    this.physicalUpdate(); // GPIO interrupt: at once
  }

  setLink(up) {
    if (this.inputs.link === up) return;
    this.inputs.link = up;
    this.linkDownAt = up ? null : this.t;
    this.note(up ? 'micro-ROS agent back: boards reconnect' : 'micro-ROS agent down: nothing reaches the boards over ROS', up ? '' : 'bad');
  }

  setControl(on) {
    if (this.inputs.control === on) return;
    this.inputs.control = on;
    if (on) {
      this.mpc = { killed: false, motionEnabled: true, mode: 'DISABLED', nextTick: this.t, commanding: false };
      this.overseer = { stops: 0, lastTelem: this.t, motionEnabled: false, nextTimeout: this.t + this.K.overseerTimeout };
      this.note('control_system started (MPC + overseer)');
    } else this.note('control_system stopped: no more CAN frames');
  }

  // safety_interface.c: slot 0 from the GPIO, needs_update true, every loop and on every edge
  physicalUpdate() {
    const s = this.poac.slots[0];
    const asserting = !this.inputs.switchIn;
    s.enabled = true;
    s.asserting = asserting;
    s.needsUpdate = true;
    s.timeoutAt = this.t + this.K.switchTimeout;
    s.lastFrom = 'GPIO';
    if (this.poac.initialized && asserting) this.poacKill();
  }

  // ---------- one step ----------
  step() {
    const K = this.K, t = (this.t += DT);
    const p = this.poac, e = this.esc, o = this.overseer, m = this.mpc, v = this.viewer, l = this.laptop;

    // publishers
    if (v.open && t >= v.nextBeat) { v.nextBeat = t + K.viewerBeat; this.viewerReport(); }
    if (l.repeat && t >= l.nextSend) { l.nextSend = t + 0.05; this.publishKill(l.slot, l.sender, l.repeat.asserting, l.needsUpdate); }

    // Each board's micro-ROS session: kept while the agent is up, lost after its heartbeats fail for sessionLoss.
    const session = this.inputs.link || t - this.linkDownAt < K.sessionLoss;

    // POAC main loop: ROS link, safety_tick (refresh, then the physical switch)
    if (!session) {
      if (p.initialized) { p.initialized = false; this.poacKill(); this.note('POAC: lost its ROS session, safety_deinit kills', 'bad'); }
    } else if (this.inputs.link && !p.initialized) {
      p.initialized = true;
      p.nextPublish = t + K.poacPublish;
      this.note('POAC reconnected: safety_init, slots kept');
    }
    if (p.initialized) {
      let asserting = false, enabled = 0;
      for (const s of p.slots) {
        if (!s.enabled) continue;
        enabled++;
        if (s.asserting || (s.needsUpdate && t >= s.timeoutAt)) { asserting = true; break; }
      }
      if (enabled === 0) asserting = true;
      if (asserting !== p.asserting) {
        p.asserting = asserting;
        p.changed = true;
        this.note(asserting ? `POAC: killed (${this.poacReason()})` : 'POAC: enabled, ESC power on', asserting ? 'bad' : 'good');
      }
    }
    this.physicalUpdate();
    if (p.initialized && this.inputs.link && (t >= p.nextPublish || p.changed)) {
      if (t >= p.nextPublish) p.nextPublish += K.poacPublish;
      p.changed = false;
      p.stateKill = p.asserting;
      // state/kill subscribers: ESC boards (needs_update slot), MPC, viewer
      e.slot = { enabled: true, asserting: p.asserting, timeoutAt: t + K.switchTimeout };
      if (this.inputs.control) {
        if (p.asserting && !m.killed) m.commanding = false;
        m.killed = p.asserting;
      }
    }

    // ESC boards: power, own kill slot, RPM targets (core1.c phase 2)
    const powered = this.inputs.switchIn && !p.asserting;
    if (e.session && !session) this.note('ESC boards: lost their ROS session, safety_deinit', 'bad');
    if (!e.session && this.inputs.link) this.note('ESC boards: reconnected, waiting for state/kill');
    if (e.slot.enabled && !e.slot.asserting && t >= e.slot.timeoutAt && !e.slotTimedOut) this.note(`ESC boards: no state/kill for ${K.switchTimeout * 1000} ms, killed`, 'bad');
    e.slotTimedOut = e.slot.enabled && t >= e.slot.timeoutAt;
    e.session = this.inputs.link || (e.session && session);
    const escKilled = !e.session || !e.slot.enabled || e.slot.asserting || t >= e.slot.timeoutAt;
    let flags = 0;
    if (escKilled) flags |= 1 << 0;
    if (!powered) { flags |= 1 << 1; e.poweronUntil = t + K.escPoweron; }
    else if (t < e.poweronUntil) flags |= 1 << 2;
    if (t >= e.rpmExpireAt) {
      flags |= 1 << 3;
      if (e.thrustersOn) e.penaltyUntil = t + K.escPenalty;
    }
    if (t < e.penaltyUntil) flags |= 1 << 4;
    e.flags = flags;
    e.thrustersOn = flags === 0 && m.commanding && this.inputs.control;

    // ESC telemetry -> overseer (through the agent)
    if (t >= e.nextTelem) {
      e.nextTelem += K.escTelem;
      if (this.inputs.link && this.inputs.control) {
        o.stops = flags ? o.stops + 1 : 0;
        o.lastTelem = t;
        o.nextTimeout = t + K.overseerTimeout;
        const en = o.stops <= K.stopTolerance;
        if (en !== o.motionEnabled) this.note(`Overseer: motion_enabled ${en}`, en ? 'good' : '');
        o.motionEnabled = en;
        m.motionEnabled = en;
      }
    }
    if (this.inputs.control && t >= o.nextTimeout) {
      o.nextTimeout = t + K.overseerTimeout;
      if (o.motionEnabled) this.note('Overseer: no ESC telemetry for 2 s, motion_enabled false');
      o.motionEnabled = false;
      m.motionEnabled = false;
    }

    // MPC tick: zero unless not killed, motion enabled and a reference to fly
    if (this.inputs.control && t >= m.nextTick) {
      m.nextTick = t + K.mpcPeriod;
      m.commanding = !m.killed && m.motionEnabled && m.mode === 'POSITION';
      e.rpmExpireAt = t + K.escRpmTimeout; // two CAN frames, zeros or not
    }

    // history for the strips
    if (!this.hist.length || t - this.hist[this.hist.length - 1].t >= 0.05 - 1e-9) {
      this.hist.push({
        t,
        sw: this.inputs.switchIn,
        poac: !p.asserting,
        kill: this.inputs.link && p.stateKill === false,
        esc: flags === 0,
        motion: this.inputs.control && o.motionEnabled,
        thrust: e.thrustersOn,
      });
      while (this.hist.length && this.hist[0].t < t - HIST) this.hist.shift();
    }
  }

  advance(seconds) {
    const n = Math.round(seconds / DT);
    for (let i = 0; i < n; i++) this.step();
  }

  poacReason() {
    const p = this.poac, t = this.t;
    if (!p.initialized) return 'no micro-ROS link';
    const names = ['physical switch', 'slot 1', 'slot 2', 'slot 3'];
    let enabled = 0;
    for (const s of p.slots) {
      if (!s.enabled) continue;
      enabled++;
      if (s.asserting) return s.id === 0 ? 'physical switch out' : `${names[s.id]} asserting (${s.lock})`;
      if (s.needsUpdate && t >= s.timeoutAt) return `${names[s.id]} timed out`;
    }
    return enabled ? '' : 'no slot enabled';
  }

  // The first thing standing between the MPC and a turning propeller.
  verdict() {
    const p = this.poac, e = this.esc, o = this.overseer, m = this.mpc, K = this.K;
    if (e.thrustersOn) return { ok: true, text: 'Thrusters running: the MPC is holding position' };
    if (!this.inputs.switchIn) return { ok: false, text: 'Stopped: the physical switch is out' };
    if (p.asserting) return { ok: false, text: `Stopped: POAC board killed, ${this.poacReason()}` };
    if (e.flags & (1 << 0)) return { ok: false, text: 'Stopped: ESC boards killed (state/kill silent or true)' };
    if (e.flags & (1 << 2)) return { ok: false, text: `Stopped: ESCs starting up, ${Math.max(0, e.poweronUntil - this.t).toFixed(1)} s of power-on delay left` };
    if (!this.inputs.control) return { ok: false, text: 'Stopped: control_system is not running, no RPM targets' };
    if (e.flags & ((1 << 3) | (1 << 4))) return { ok: false, text: 'Stopped: RPM targets stale' };
    if (!o.motionEnabled) return { ok: false, text: 'Stopped: overseer has motion_enabled false' };
    if (m.mode !== 'POSITION') return { ok: false, idle: true, text: `Enabled, but the MPC has no reference (DISABLED): ${this.viewer.open ? 'send a command' : 'nothing has sent a command'}` };
    if (m.killed) return { ok: false, text: 'Stopped: the MPC still reads state/kill true' };
    return { ok: false, text: 'Waiting for the next tick' };
  }
}

export const HISTORY_SECONDS = HIST;
