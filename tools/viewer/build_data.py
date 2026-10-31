#!/usr/bin/env python3
"""Data for viewer.html (the Nereus viewer chapter).

    python3 tools/viewer/build_data.py

Writes public/data/viewer/:
  wiring.json   every ROS interface the viewer uses, grouped by the panel or overlay that uses it, with its
                direction, type, the nodes on the other side (from the captured graph) and the rate measured in sim.
                Sources: nereus content/viewer/talos_uwrt_panels.yaml + talos_uwrt_host.yaml (names), and
                public/data/rosgraph/{rosgraph,topics}.json (captured 2026-10-30 from the full stack in Nereus).
  priormap.json every object in the prior map (name, parent, x, y, z, yaw relative to the parent), for #mapping.
  course.json   the top-level props of riptide_mapping's prior map (map frame), for the typed-move sandbox.
"""
import json
import math
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[1]
NEREUS = Path.home() / "osu-uwrt/release/nereus"
MAPPING = Path.home() / "osu-uwrt/release/src/riptide_perception/riptide_mapping/config/config.yaml"
OUT = SITE / "public/data/viewer"
NS = "/talos/"

panels = yaml.safe_load((NEREUS / "content/viewer/talos_uwrt_panels.yaml").read_text())
host = yaml.safe_load((NEREUS / "content/viewer/talos_uwrt_host.yaml").read_text())
graph = json.loads((SITE / "public/data/rosgraph/rosgraph.json").read_text())
topics = {t["topic"]: t for t in json.loads((SITE / "public/data/rosgraph/topics.json").read_text())["topics"]}
nodes = graph["nodes"]
VIEWER = {"/nereus_viewer", "/nereus_viewer_timing", "/talos/viewer_panels", "/talos/viewer_plots"}
P = {k: v["options"] for k, v in panels["providers"].items()}


def full(name):
    return name if name.startswith("/") else NS + name


# Who answers on the real robot, for interfaces the simulator stands in for in sim (checked in each repo).
ROBOT = {
    # titan_firmware paths are on origin/master (checked 2026-10-31).
    "state/kill": "POAC board firmware (talos/PoacBoard/src/ros.c)",
    "command/software_kill": "POAC board firmware (talos/PoacBoard/src/ros.c)",
    "state/actuator/status": "POAC board firmware (talos/PoacBoard/src/actuators/ros_torp.c)",
    "command/actuator/arm": "POAC board firmware (talos/PoacBoard/src/actuators/ros_torp.c); refused while killed",
    "command/actuator/torpedo": "POAC board firmware (talos/PoacBoard/src/actuators/ros_torp.c)",
    "command/actuator/dropper": "POAC board firmware (talos/PoacBoard/src/actuators/ros_torp.c)",
    "command/actuator/claw": "Nothing: no POAC build subscribes to it, so Open / Close claw only act in sim",
    "command/actuator/notify_reload": "POAC board firmware (talos/PoacBoard/src/actuators/ros_torp.c): torpedo and dropper counts back to 2",
    "command/actuator/claw_move_s": "POAC firmware on the unmerged poac-multiple-servos branch only (not master). There 0 is an integer divide by zero: don't press Stop claw on the robot",
    "command/electrical": "POAC board firmware (talos/PoacBoard/src/ros.c) and other boards",
    "command/led": "LED firmware (talos/CameraCageBB/src/ros.c, talos/LEDBoard/src/ros.c)",
    "state/battery": "SmartBattery firmware (talos/SmartBattery/src/ros.c)",
    "gyro/status": "FOG driver (riptide_gyro driver.cpp)",
    "dvl/bottom_lock": "DVL driver (nortek_dvl dvl_driver.cpp)",
    "dvl_twist": "DVL driver (nortek_dvl dvl_driver.cpp)",
    "ffc/zed_node/rgb/image_rect_color/compressed": "ZED driver (zed-ros2-wrapper)",
    "dfc/zed_node/rgb/image_rect_color/compressed": "ZED driver (zed-ros2-wrapper)",
    "ffc/zed_node/depth/depth_registered": "ZED driver (zed-ros2-wrapper)",
    "dfc/zed_node/depth/depth_registered": "ZED driver (zed-ros2-wrapper)",
    "ffc/zed_node/point_cloud/cloud_registered": "ZED driver (zed-ros2-wrapper)",
    "dfc/zed_node/point_cloud/cloud_registered": "ZED driver (zed-ros2-wrapper)",
    "ffc/zed_node/start_svo_rec": "ZED driver (zed-ros2-wrapper)",
    "ffc/zed_node/stop_svo_rec": "ZED driver (zed-ros2-wrapper)",
    "dfc/zed_node/start_svo_rec": "ZED driver (zed-ros2-wrapper)",
    "dfc/zed_node/stop_svo_rec": "ZED driver (zed-ros2-wrapper)",
    "capture_image": "picture_taker.py (riptide_hardware2)",
    "gyro/tare": "FOG driver (riptide_gyro)",
    "vectornav/mag_cal": "VectorNav IMU driver",
    "vectornav/config": "VectorNav IMU driver",
}


def peers(name, kind, direction):
    """Nodes on the other side of an interface in the captured graph, minus the viewer's own."""
    out = set()
    for n in nodes:
        if n["node"] in VIEWER:
            continue
        if kind == "topic":
            keys = ["subscribers"] if direction == "out" else ["publishers"]
        elif kind == "service":
            keys = ["services"]
        else:
            keys = ["action_servers"]
        if any(i["name"] == name for k in keys for i in n.get(k, [])):
            out.add(n["node"])
    # tf2's hidden listener nodes and the launch process are plumbing, not peers a reader can look up.
    return sorted(n for n in out if "transform_listener_impl" not in n and not n.startswith("/launch_ros"))


def iface(rel, kind, direction, note="", when="", robot=None, peers_note=""):
    name = full(rel)
    t = topics.get(name, {})
    typ = t.get("type", "")
    if not typ:  # services, actions and topics not captured: take the type from the viewer nodes' own lists
        for n in nodes:
            for k in ("publishers", "subscribers", "clients", "action_clients"):
                for i in n.get(k, []):
                    if i["name"] == name:
                        typ = i["type"]
    p = peers(name, kind, direction)
    rate = t.get("rate_hz_pass2") or t.get("rate_hz")
    sim_only = bool(t.get("sim_only")) or any(x in ("/talos/physics_simulator", "/sim_supervisor") for x in p)
    return {
        "name": name, "kind": kind, "dir": direction, "type": typ, "peers": p,
        "rate": round(rate, 1) if rate else None, "sim_hz": t.get("sim_configured_hz"),
        "sim_only": sim_only, "robot": ROBOT.get(rel.lstrip("/"), "") if robot is None else robot, "note": note, "when": when,
        # Shown instead of the peer list where the captured subscribers would mislead (e.g. every /tf listener).
        "peers_note": peers_note,
    }


mo, au, ma, ac, te, re, el, run, sim = (P[k] for k in ("motion", "mission", "mapping", "actuators", "telemetry",
                                                       "recording", "electrical", "run", "simulation"))
tp = host["topics"]
groups = [
    {"id": "enable", "title": "Enable / KILL", "node": "/talos/viewer_panels", "items": [
        iface(mo["kill_topic"], "topic", "out", f"KillSwitchReport on slot {mo['kill_switch_id']} every 50 ms"),
        iface(mo["kill_topic"], "topic", "in", "Watches for anyone else on slot 1 (a competing operator)",
              robot="Any other sender on slot 1, such as a second viewer. There should be none"),
        iface(mo["kill_state_topic"], "topic", "in", "\"Robot: killed / enabled\" under the button"),
    ]},
    {"id": "motion", "title": "Motion and the pose gizmo", "node": "/talos/viewer_panels", "items": [
        iface(mo["mode_service"], "service", "out", "Asked before Position / Feedforward control starts"),
        iface(mo["linear_topic"], "topic", "out", "Position half of each command: typed in map, sent in world (= odom), the MPC's frame"),
        iface(mo["angular_topic"], "topic", "out", "Orientation half of each command"),
        iface(mo["linear_topic"], "topic", "in", "Also listens, so the gizmo follows a tree's setpoints"),
        iface("/tf", "topic", "out", f"Broadcasts the command as the frame {mo['setpoint_frame']}",
              peers_note=f"Every /tf listener gets it; {mo['setpoint_frame']} is there for anyone who wants the commanded "
                         "pose. Nothing in the stack uses it", robot=""),
        iface("/tf", "topic", "in", f"Actual pose: map → {mo['base_frame'].replace('{namespace}', 'talos')}, and {mo['command_frame']} → map to convert commands"),
    ]},
    {"id": "autonomy", "title": "Autonomy", "node": "/talos/viewer_panels", "items": [
        iface(au["list_service"], "service", "out", "Fills the tree picker"),
        iface(au["action"], "action", "out", "Start sends a goal; Stop cancels it"),
        iface(au["stack_topic"], "topic", "in", "The execution stack shown under the picker"),
    ]},
    {"id": "mapping", "title": "Mapping", "node": "/talos/viewer_panels", "items": [
        iface(ma["calibration_action"], "action", "out", "Tag calibration: averages samples of world → tag"),
        iface(ma["target_service"], "service", "out", "Set mapping target / Lock map"),
        iface(ma["reset_service"], "service", "out", "Reset mapping"),
        iface(ma["status_topic"], "topic", "in", "Current target and lock"),
    ]},
    {"id": "actuators", "title": "Actuators", "node": "/talos/viewer_panels", "items": [
        *[iface(c["topic"], "topic", "out", c["label"] + (" (needs Arm)" if c.get("requires_armed") else ""))
          for c in ac["commands"] if c["id"] not in ("close_claw",)],
        iface(ac["status_topic"], "topic", "in", "Armed state, connections, rounds left"),
    ]},
    {"id": "chips", "title": "Command bar chips", "node": "/talos/viewer_panels", "items": [
        iface(r["topic"], "topic", "in", r["label"] + (f": warn {r['warn_c']} °C, error {r['error_c']} °C" if "warn_c" in r
                                                       else f": warn below {r['warn_pct']} %, error below {r['error_pct']} %" if "warn_pct" in r
                                                       else ": bottom lock"))
        for r in te["readings"] if r["id"] != "stbd"
    ] + [iface(te["readings"][1]["twist_topic"], "topic", "in", "DVL: the simulator's DVL has no lock topic, so a bottom-track velocity counts")]},
    {"id": "electrical", "title": "Electrical", "node": "/talos/viewer_panels", "items": [
        iface(el["command_topic"], "topic", "out", f"{len(el['commands'])} power buttons (cycle computer, kill robot power, fans, ...)"),
        iface(el["leds"]["topic"], "topic", "out", "LED colour, brightness and mode"),
        iface(el["tare_action"], "action", "out", "Tare gyro"),
        iface(el["imu"]["mag_cal_action"], "action", "out", "IMU magnetometer calibration"),
        iface(el["imu"]["config_service"], "service", "out", "Read / write IMU registers"),
        # Acoustics: Talos carries no pinger. These choose which pinger frequency the IVC board listens for through
        # the hydrophone; IVC messages go out through the transducer.
        iface(el["pinger"]["enable_topic"], "topic", "out",
              f"Acoustics on / off (listening for the pinger through the hydrophone), re-sent every {el['pinger']['heartbeat_s']} s",
              robot="IVC board firmware (talos/IVCBoard2/src/ros.c, on the blake/ivc branch)"),
        iface(el["pinger"]["frequency_topic"], "topic", "out",
              "Pinger frequency to listen for: " + ", ".join(map(str, el["pinger"]["frequencies_khz"])) + " kHz",
              robot="pinger_broker (riptide_hardware), which passes it on to the IVC board as ivc/pinger/set_freq_khz"),
        iface(el["pinger"]["selected_topic"], "topic", "in", "The frequency the IVC board is listening for now",
              robot="IVC board firmware (talos/IVCBoard2/src/ros.c, on the blake/ivc branch)"),
        iface(el["pinger"]["amplitude_topic"], "topic", "in", "How loud the pinger is at that frequency",
              robot="IVC board firmware (talos/IVCBoard2/src/ros.c, on the blake/ivc branch)"),
        iface(el["ivc"]["tx_topic"], "topic", "out", "IVC: one byte out through the transducer",
              robot="IVC board firmware (talos/IVCBoard/src/ros.c)"),
        iface(el["ivc"]["tx_topic"], "topic", "in", "IVC log: every byte sent, the viewer's own included",
              robot="Whoever sends on ivc/tx"),
        iface(el["ivc"]["rx_topic"], "topic", "in", "IVC log: bytes received (from Triton, the team's second vehicle)",
              robot="IVC board firmware (talos/IVCBoard/src/ros.c)"),
        iface(el["ivc"]["confirm_topic"], "topic", "in", "IVC log: the board confirms a byte went out",
              robot="Nothing on master publishes it (only riptide_hardware2's fake_ivc.py)"),
    ]},
    {"id": "recording", "title": "Recording", "node": "/talos/viewer_panels", "items": [
        *[iface(c[k], "service", "out", f"{c['label']} SVO {k.split('_')[0]}") for c in re["cameras"] for k in ("start_service", "stop_service")],
        iface(re["capture_service"], "service", "out", "Capture image: saves the newest front-camera frame on the robot"),
    ]},
    {"id": "scene", "title": "Pool view and overlays", "node": "/nereus_viewer", "items": [
        iface(host["scenario_topic"], "topic", "in", "The scene: robot, pool, course (sim). On the robot the viewer loads it itself"),
        iface("/tf", "topic", "in", "Robot pose and every frame (TF toggle)"),
        iface(tp["mpc_path"], "topic", "in", "MPC path toggle: the predicted path", ""),
        iface(tp["planned_path"], "topic", "in", "MPC path toggle: a whole follow_path plan"),
        iface(tp["thruster_forces"], "topic", "in", "Thrust toggle: red arrows, 0.05 m per newton", "only while Thrust is on"),
        iface(tp["detections"], "topic", "in", "Detector markers (Vision panel)"),
        iface("mapping/torpedo", "topic", "in", "Covariance toggle: one mapping/<object> topic per prop", "only while Covariance is on"),
        *[iface(c["topic"], "topic", "in", f"Point cloud: {c['title']}", "only while ticked in Vision") for c in host["point_clouds"]],
        iface("simulator/actual_thruster_forces", "topic", "in", "Spins the drawn propellers"),
        iface("command/led", "topic", "in", "Colours the drawn LED bars",
              robot="Published by the trees and mapping, as in sim; the LED firmware (CameraCageBB, LEDBoard) listens"),
        iface(tp["claw_joints"], "topic", "in", "Claw jaw positions"),
        iface(tp["task_objects"], "topic", "in", "Loose props (table items, magnets)"),
        iface(tp["projectiles"], "topic", "in", "Torpedoes and markers in flight"),
    ]},
    {"id": "cameras", "title": "Camera cards", "node": "/nereus_viewer", "items": [
        iface("ffc/zed_node/rgb/image_rect_color/compressed", "topic", "in", "Forward camera, ROS source"),
        iface("dfc/zed_node/rgb/image_rect_color/compressed", "topic", "in", "Downward camera, ROS source"),
        iface("ffc/zed_node/depth/depth_registered", "topic", "in", "Depth view", "only while Depth is chosen"),
    ]},
    {"id": "scorecard", "title": "Scorecard (sim only)", "node": "/talos/viewer_panels", "items": [
        iface(run["command_topic"], "topic", "out", "Start run / Stop run / options"),
        iface(run["reset_topic"], "topic", "out", "Reset run & tasks"),
        iface(run["score_topic"], "topic", "in", "Clock, points and status lines"),
        iface(run["task_score_topic"], "topic", "in", "Per-task status"),
        iface(run["events_topic"], "topic", "in", "Recent events (torpedo hit, dropper, magnet, ...)"),
    ]},
    {"id": "simulation", "title": "Simulation window (sim only)", "node": "/talos/viewer_panels", "items": [
        iface(f"{sim['node']}/set_parameters", "service", "out", f"Speed: sets {sim['parameter']} (up to {sim['max_rate']}x)"),
        iface(sim["sync_service"], "service", "out", "Sync sim: moves the simulated robot to the EKF estimate"),
        iface(sim["reset_service"], "service", "out", "Reset sim: back to the start pose"),
    ]},
]

# Drop rows with no type (not in the capture and not a viewer interface): none expected, but say so if it happens.
for g in groups:
    for i in g["items"]:
        if not i["type"]:
            print("no type for", i["name"])

wiring = {
    "source": "Interface names from nereus content/viewer/talos_uwrt_panels.yaml and talos_uwrt_host.yaml; peers and "
              "rates from the ROS graph captured in Nereus on 2026-10-30 (public/data/rosgraph). Rates are what a "
              "loaded desktop delivered in sim, not robot specs.",
    "groups": groups,
}

# ---- the prior map's top-level props, for the typed-move sandbox ----
cfg = yaml.safe_load(MAPPING.read_text())
init = None
for key, v in cfg.items():
    d = (v or {}).get("ros__parameters", {})
    if "init_data" in d:
        init = d["init_data"]
        break
course = []
for name, o in init.items():
    # Only the props a reader can find in the screenshots; the table and the prequal entries are left out.
    if o.get("parent", "map") not in ("map", "", None) or name not in ("gate", "slalom_parent", "torpedo", "bin", "pre_torpedo_pose", "pre_bin_pose", "pre_return_home"):
        continue
    pose = o.get("pose", {})
    x, y, z, yaw = (float(pose.get(k, 0)) for k in ("x", "y", "z", "yaw"))
    course.append({"name": name, "x": round(x, 3), "y": round(y, 3), "z": round(z, 3), "yaw": round(yaw, 2)})
# The table from the simulator's course: the prior map's table entry is set for an RPAC dive-well test (riptide_perception
# 2f3da82 "RPAC table"), so it isn't where the RoboSub course has it. Marked "sim" so the map draws it apart.
SCENARIO = yaml.safe_load((NEREUS / "content/packs/scenarios/talos_uwrt/scenario.yaml").read_text())
for t in SCENARIO["task_placements"]:
    if t["task"] == "table":
        x, y, z = t["position_m"]
        course.append({"name": "table", "x": round(x, 3), "y": round(y, 3), "z": round(z, 3), "yaw": round(t["yaw_deg"], 2), "sim": True})

# ---- the whole prior map, for the table in #mapping ----
prior = []
for name, o in init.items():
    pose = o.get("pose", {})
    parent = (o.get("parent") or "map")
    if parent.endswith("_frame"):
        parent = parent[: -len("_frame")]
    prior.append({"name": name, "parent": parent,
                  **{k: round(float(pose.get(k, 0)), 2) for k in ("x", "y", "z", "yaw")}})

OUT.mkdir(parents=True, exist_ok=True)
(OUT / "priormap.json").write_text(json.dumps({"source": str(MAPPING.relative_to(Path.home() / "osu-uwrt/release/src")), "objects": prior}, indent=1))
(OUT / "wiring.json").write_text(json.dumps(wiring, indent=1))
(OUT / "course.json").write_text(json.dumps({"source": str(MAPPING.relative_to(Path.home() / "osu-uwrt/release/src")), "props": course}, indent=1))
print(sum(len(g["items"]) for g in groups), "interfaces;", len(course), "map props")
