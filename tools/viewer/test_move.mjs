// Checks src/viz/viewer-move.js against the cases of nereus integrations/ros2/viewer/tests/host_pose_command.cpp.
//   node tools/viewer/test_move.mjs
import { parseMove, describe, stepped } from '../../src/viz/viewer-move.js';

let fails = 0;
const ok = (c, msg) => { if (!c) { fails++; console.log('FAIL', msg); } };
const near = (a, b, msg) => ok(a.every((v, i) => Math.abs(v - b[i]) < 1e-4), `${msg}: ${a} vs ${b}`);
const north = () => ({ p: [1, 2, -1], d: [0, 0, 90] });

ok(!parseMove('', north()).isMove, 'empty');
ok(!parseMove('theme', north()).isMove, 'theme');
ok(!parseMove('xyz', north()).isMove, 'xyz');
const un = parseMove('forward', north());
ok(un.isMove && !un.command && un.error.includes('forward 0.5'), 'unfinished');
const w = parseMove('left panels', north());
ok(w.isMove && !w.command, 'left panels');

const fw = parseMove('forward 0.5', north());
near(fw.command.target.p, [1, 2.5, -1], 'forward');
ok(fw.command.summary === 'forward 0.5 m', 'forward summary ' + fw.command.summary);
near(parseMove('right 1m', north()).command.target.p, [2, 2, -1], 'right');
near(parseMove('down 0.25', north()).command.target.p, [1, 2, -1.25], 'down');
const ch = parseMove('turn 90, forward 1', north());
near(ch.command.target.p, [0, 2, -1], 'chained');
ok(Math.abs(ch.command.target.d[2] - 180) < 1e-3, 'chained yaw');
ok(ch.command.summary === 'turn 90°, forward 1 m', 'chained summary ' + ch.command.summary);

ok(Math.abs(parseMove('turn right 100', north()).command.target.d[2] + 10) < 1e-3, 'turn right 100');
ok(Math.abs(parseMove('turn 270deg', north()).command.target.d[2]) < 1e-3, 'turn 270');

const dz = parseMove('z -1.5 yaw 180', north());
near(dz.command.target.p, [1, 2, -1.5], 'z');
ok(Math.abs(dz.command.target.d[2] - 180) < 1e-3, 'yaw 180');
const go = parseMove('go 3 4 -2 -90', north());
near(go.command.target.p, [3, 4, -2], 'go');
ok(Math.abs(go.command.target.d[2] + 90) < 1e-3, 'go yaw');
near(parseMove('goto 3 4 -2 5 -5 45', north()).command.target.d, [5, -5, 45], 'goto full');
ok(!parseMove('go 3 4', north()).command, 'go 2 numbers');
ok(!parseMove('go 1 2 3 4 5', north()).command, 'go 5 numbers');

const lv = parseMove('level', { p: [1, 2, -1], d: [12, -7, 30] });
near(lv.command.target.d, [0, 0, 30], 'level');

ok(describe(north()) === 'x 1.00  y 2.00  z -1.00  yaw 90°', 'describe ' + describe(north()));
ok(describe({ p: [1, 2, -1], d: [10, 0, 90] }) === 'x 1.00  y 2.00  z -1.00  roll 10°  pitch 0°  yaw 90°', 'describe tilted');

near(stepped(north(), 0.25, 0, 0, 0).p, [1, 2.25, -1], 'step');
const st = stepped(north(), 0, 0.25, 0.1, -15);
near(st.p, [0.75, 2, -0.9], 'strafe');
ok(Math.abs(st.d[2] - 75) < 1e-3, 'strafe yaw');

console.log(fails ? `${fails} failed` : 'all pose_command cases pass');
process.exit(fails ? 1 : 0);
