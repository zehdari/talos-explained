// The Nereus viewer's typed moves (Ctrl+P "forward 0.5", "turn right 45", "go 2 1 -1.5 90"), ported line for line
// from nereus integrations/ros2/viewer/src/pose_command.cpp. tools/viewer/test_move.mjs checks it against the
// cases in the viewer's own test (tests/host_pose_command.cpp).
// A target is { p: [x, y, z] (m, map frame), d: [roll, pitch, yaw] (degrees) }.

const f32 = Math.fround;

// Wrap to (-180, 180], as wrapDegrees (C fmod keeps the sign of the dividend, like JS %).
export function wrapDegrees(deg) {
  deg = deg % 360;
  if (deg <= -180) deg += 360;
  else if (deg > 180) deg -= 360;
  return deg;
}

// A number with an optional unit after it ("0.5m", "30deg", "30°"), as strtof + the unit check.
function number(word) {
  const m = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(word);
  if (!m) return null;
  const v = Number(m[0]);
  if (!Number.isFinite(v)) return null;
  const unit = word.slice(m[0].length);
  return unit === '' || unit === 'm' || unit === 'deg' || unit === '°' ? v : null;
}

// %g as printf prints it for the read-back (enough for typed numbers).
const g = (v) => String(Number(f32(v).toPrecision(6)));
const fixed = (v, n) => (Math.abs(v) < 0.5 * 10 ** -n ? 0 : v).toFixed(n);

export function stepped(from, forward, left, up, turn) {
  const yaw = (from.d[2] * Math.PI) / 180;
  return {
    p: [from.p[0] + forward * Math.cos(yaw) - left * Math.sin(yaw), from.p[1] + forward * Math.sin(yaw) + left * Math.cos(yaw), from.p[2] + up],
    d: [from.d[0], from.d[1], wrapDegrees(from.d[2] + turn)],
  };
}

export function describe(t) {
  let s = `x ${fixed(t.p[0], 2)}  y ${fixed(t.p[1], 2)}  z ${fixed(t.p[2], 2)}`;
  if (Math.abs(t.d[0]) >= 0.05 || Math.abs(t.d[1]) >= 0.05) s += `  roll ${fixed(t.d[0], 0)}°  pitch ${fixed(t.d[1], 0)}°`;
  return s + `  yaw ${fixed(wrapDegrees(t.d[2]), 0)}°`;
}

const ALONG = new Set(['forward', 'fwd', 'ahead', 'back', 'backward', 'backwards', 'left', 'right', 'up', 'down']);
const ABS = new Set(['x', 'y', 'z', 'roll', 'pitch', 'yaw', 'heading']);
const isMoveWord = (w) => ALONG.has(w) || ABS.has(w) || w === 'turn' || w === 'go' || w === 'goto' || w === 'level';

// Returns { isMove, command: { target, summary, steps } | null, error }. `steps` (not in the C++) lists the target
// after each move word, for drawing the moves one by one.
export function parseMove(text, from) {
  const words = text.replace(/,/g, ' ').toLowerCase().split(/\s+/).filter(Boolean);
  const parsed = { isMove: false, command: null, error: '' };
  if (!words.length || !isMoveWord(words[0])) return parsed;
  parsed.isMove = true;

  let target = { p: [...from.p], d: [...from.d] };
  const said = [], steps = [];
  let i = 0;
  const next = () => {
    if (i < words.length) {
      const v = number(words[i]);
      if (v !== null) { i++; return v; }
    }
    return null;
  };
  while (i < words.length) {
    const word = words[i++];
    let value;
    if (!isMoveWord(word)) {
      parsed.error = `"${word}" is not a move: forward / back / left / right / up / down, turn, x / y / z, roll / pitch / yaw, go, level`;
      return parsed;
    }
    if (ALONG.has(word)) {
      if ((value = next()) === null) { parsed.error = `${word} needs a distance in meters, e.g. ${word} 0.5`; return parsed; }
      const backward = word === 'back' || word === 'backward' || word === 'backwards';
      const forward = word === 'forward' || word === 'fwd' || word === 'ahead' ? value : backward ? -value : 0;
      const left = word === 'left' ? value : word === 'right' ? -value : 0;
      const up = word === 'up' ? value : word === 'down' ? -value : 0;
      target = stepped(target, forward, left, up, 0);
      said.push((backward ? 'back' : word === 'fwd' || word === 'ahead' ? 'forward' : word) + ` ${g(value)} m`);
    } else if (word === 'turn') {
      let sign = 1;
      if (i < words.length && (words[i] === 'left' || words[i] === 'right')) sign = words[i++] === 'right' ? -1 : 1;
      if ((value = next()) === null) { parsed.error = 'turn needs degrees (left positive), e.g. turn 30 or turn right 45'; return parsed; }
      target = stepped(target, 0, 0, 0, sign * value);
      said.push(`turn ${g(sign * value)}°`);
    } else if (ABS.has(word)) {
      const angle = word === 'roll' || word === 'pitch' || word === 'yaw' || word === 'heading';
      if ((value = next()) === null) {
        parsed.error = word + (angle ? ' needs degrees, e.g. ' : ' needs meters, e.g. ') + word + (angle ? ' 90' : word === 'z' ? ' -1.5' : ' 2');
        return parsed;
      }
      target = { p: [...target.p], d: [...target.d] };
      if (word === 'x' || word === 'y' || word === 'z') target.p['xyz'.indexOf(word)] = value;
      else if (word === 'roll') target.d[0] = value;
      else if (word === 'pitch') target.d[1] = value;
      else target.d[2] = wrapDegrees(value);
      said.push((word === 'heading' ? 'yaw' : word) + (angle ? ` ${g(value)}°` : ` ${g(value)} m`));
    } else if (word === 'go' || word === 'goto') {
      const v = [];
      let n;
      while (v.length < 6 && (n = next()) !== null) v.push(n);
      if (v.length !== 3 && v.length !== 4 && v.length !== 6) { parsed.error = 'go needs x y z, then yaw or roll pitch yaw: e.g. go 2 1 -1.5 90'; return parsed; }
      target = { p: [v[0], v[1], v[2]], d: [...target.d] };
      if (v.length === 4) target.d[2] = wrapDegrees(v[3]);
      if (v.length === 6) target.d = [v[3], v[4], wrapDegrees(v[5])];
      said.push('go to ' + describe(target));
    } else {
      target = { p: [...target.p], d: [0, 0, target.d[2]] };
      said.push('level');
    }
    steps.push({ target, said: said[said.length - 1] });
  }
  parsed.command = { target, summary: said.join(', '), steps };
  return parsed;
}
