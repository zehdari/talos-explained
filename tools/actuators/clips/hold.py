# hold.py X Y Z YAW TOTAL_S [t:action ...]  -- re-place Talos at 20 Hz; run actions (torpedo, dropper, claw:<s>, arm, unkill) at times
import sys, math, time, threading, rclpy
from rclpy.node import Node
from riptide_msgs2.msg import KillSwitchReport
from robot_localization.srv import SetPose
from std_srvs.srv import SetBool, Trigger
from std_msgs.msg import Float32
rclpy.init(); n = Node('actrec_hold')
x, y, z, yaw, total = map(float, sys.argv[1:6])
acts = []
for a in sys.argv[6:]:
    t, c = a.split(':', 1); acts.append([float(t), c])
place = n.create_client(SetPose, '/talos/set_sim_pose'); place.wait_for_service(timeout_sec=5)
armc = n.create_client(SetBool, '/talos/command/actuator/arm')
kp = n.create_publisher(KillSwitchReport, '/talos/command/software_kill', 10)
cp = n.create_publisher(Float32, '/talos/command/actuator/claw_move_s', 10)
trig = {k: n.create_client(Trigger, f'/talos/command/actuator/{k}') for k in ('torpedo', 'dropper', 'notify_reload')}
ex = threading.Thread(target=rclpy.spin, args=(n,), daemon=True); ex.start()
def req(px, py, pz, pyaw):
    r = SetPose.Request(); r.pose.header.frame_id = 'world'
    p = r.pose.pose.pose; p.position.x, p.position.y, p.position.z = px, py, pz
    h = math.radians(pyaw) / 2; p.orientation.w = math.cos(h); p.orientation.z = math.sin(h); return r
t0 = time.time()
hold_until = total
while True:
    t = time.time() - t0
    if t > total: break
    for a in acts:
        if a[0] is not None and t >= a[0]:
            c = a[1]; a[0] = None
            if c == 'unkill':
                m = KillSwitchReport(); m.kill_switch_id = 1; m.switch_asserting_kill = False; kp.publish(m)
            elif c == 'arm':
                r = SetBool.Request(); r.data = True; armc.call_async(r).add_done_callback(lambda f: print('arm', f.result().message, flush=True))
            elif c.startswith('claw'):
                cp.publish(Float32(data=float(c.split(':')[1]))); print('claw', c, flush=True)
            elif c.startswith('dz'):   # move the hold point down/up by dz over the rest: dz:<m>:<s>
                _, dz, dur = c.split(':'); globals()['ramp'] = (t, float(dz), float(dur), globals().get('zcur', z))
            elif c == 'release':
                hold_until = t
            else:
                trig[c].call_async(Trigger.Request()).add_done_callback(lambda f, c=c: print(c, f.result().success, f.result().message, flush=True))
    if t < hold_until:
        zz = z
        if 'ramp' in globals():
            rt, dz, dur, z0 = ramp; k = min(1, (t - rt) / dur); zz = z0 + dz * k
        globals()['zcur'] = zz
        place.call_async(req(x, y, zz, yaw))
    time.sleep(0.05)
time.sleep(0.3); n.destroy_node(); rclpy.shutdown()
