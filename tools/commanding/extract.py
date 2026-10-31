#!/usr/bin/env python3
"""Pulls everything the Commanding chapter shows from the team's real code into one JSON file.

    python3 tools/commanding/extract.py   ->  public/data/commanding/commanding.json

Every value is read from the branch the site links to (git show <ref>:<path>), not from the working tree,
and every value carries the GitHub URL (with line) it came from:
  - the message and action definitions (riptide_core followpath-speed)
  - the kill-switch constants: slot ids, the update timeout, how often the POAC board reports state/kill,
    the ESC board's command timeout, power-on delay and disabled flags (titan_firmware master)
  - controller_overseer's motion_enabled rules (riptide_control mpc)
  - the Nereus viewer's slot and heartbeat (nereus main)
  - the MPC node's timing and path-finish parameters and the force-to-RPM coefficients (riptide_control mpc)
  - the CAN ids of the two ESC boards, computed from titan_canmore's bit layout
"""
import json
import re
import subprocess
from datetime import date
from pathlib import Path

import yaml

HOME = Path.home()
REL = HOME / "osu-uwrt/release"
REPOS = {
    # key: (local checkout, git ref to read, GitHub repo, branch name in links)
    "control": (REL / "src/riptide_control", "HEAD", "riptide_control", "mpc"),
    "core": (REL / "src/riptide_core", "HEAD", "riptide_core", "followpath-speed"),
    "autonomy": (REL / "src/riptide_autonomy", "HEAD", "riptide_autonomy", "autonomy-mapping"),
    "gui": (REL / "src/riptide_gui", "HEAD", "riptide_gui", "newsim"),
    "launch": (REL / "src/riptide_launch", "HEAD", "riptide_launch", "newsim"),
    "nereus": (REL / "nereus", "HEAD", "nereus", "main"),
    "fw": (HOME / "osu-uwrt/development/titan_firmware", "origin/master", "titan_firmware", "master"),
    # titan_firmware's submodule, at the commit master pins
    "canmore": (HOME / "osu-uwrt/development/titan_firmware/lib/titan_canmore", "f6273e2c25f0202788be01e41338a6bbd6320006",
                "titan_canmore", "f6273e2c25f0202788be01e41338a6bbd6320006"),
}
OUT = Path(__file__).resolve().parents[2] / "public/data/commanding/commanding.json"


def show(repo, path):
    local, ref, _, _ = REPOS[repo]
    return subprocess.run(["git", "-C", str(local), "show", f"{ref}:{path}"], check=True,
                          capture_output=True, text=True).stdout


def line_of(text, pattern):
    for i, line in enumerate(text.splitlines(), 1):
        if re.search(pattern, line):
            return i
    raise KeyError(pattern)


def url(repo, path, line=None):
    _, _, name, branch = REPOS[repo]
    return f"https://github.com/osu-uwrt/{name}/blob/{branch}/{path}" + (f"#L{line}" if line else "")


def define(repo, path, name):
    """Integer value of `#define NAME value` and its link."""
    text = show(repo, path)
    m = re.search(rf"^\s*#define\s+{name}\s+(-?\d+)", text, re.M)
    if not m:
        raise KeyError(f"{name} in {path}")
    return {"value": int(m.group(1)), "url": url(repo, path, line_of(text, rf"#define\s+{name}\b"))}


def py_const(repo, path, name):
    text = show(repo, path)
    m = re.search(rf"^{name}\s*=\s*([\d.]+)", text, re.M)
    return {"value": float(m.group(1)), "url": url(repo, path, line_of(text, rf"^{name}\s*="))}


def msg(repo, path):
    text = show(repo, path)
    return {"text": text.rstrip() + "\n", "url": url(repo, path), "path": path}


def main():
    out = {"generated": date.today().isoformat()}

    # ---------- messages ----------
    m = "riptide_msgs/"
    out["msgs"] = {
        "ControllerCommand": msg("core", m + "msg/ControllerCommand.msg"),
        "FollowPath": msg("core", m + "action/FollowPath.action"),
        "PathSegment": msg("core", m + "msg/PathSegment.msg"),
        "KillSwitchReport": msg("core", m + "msg/KillSwitchReport.msg"),
        "DshotCommand": msg("core", m + "msg/DshotCommand.msg"),
    }

    # ---------- kill switch slots (KillSwitchReport constants) ----------
    ksr = out["msgs"]["KillSwitchReport"]["text"]
    slots = []
    for mm in re.finditer(r"^# (.+)\n(?:#.*\n)*uint8 (KILL_SWITCH_\w+)=(\d+)", ksr, re.M):
        slots.append({"id": int(mm.group(3)), "const": mm.group(2), "comment": mm.group(1).strip()})
    n_slots = int(re.search(r"NUM_KILL_SWITCHES=(\d+)", ksr).group(1))
    out["slots"] = {"count": n_slots, "list": sorted(slots, key=lambda s: s["id"])}

    # ---------- firmware ----------
    safety_h = "lib/titan_safety/include/titan/safety.h"
    poac_main, poac_ros, poac_safety = ("talos/PoacBoard/src/main.c", "talos/PoacBoard/src/ros.c",
                                        "talos/PoacBoard/src/safety_interface.c")
    esc_dshot, esc_core1_h, esc_core1, esc_main, esc_ros = ("talos/ESCBoard/include/dshot.h", "talos/ESCBoard/include/core1.h",
                                                           "talos/ESCBoard/src/core1.c", "talos/ESCBoard/src/main.c",
                                                           "talos/ESCBoard/src/ros.c")
    kill_c = "lib/titan_safety/src/kill_switch.c"
    kc = show("fw", kill_c)
    pr = show("fw", poac_ros)
    ps = show("fw", poac_safety)
    pm = show("fw", poac_main)
    c1 = show("fw", esc_core1)
    er = show("fw", esc_ros)
    flags_h = show("fw", esc_core1_h)
    flags = [{"bit": int(b), "name": n} for n, b in re.findall(r"#define CORE1_DISABLED_(\w+) (\d+)", flags_h)]
    out["firmware"] = {
        "switch_timeout_ms": define("fw", safety_h, "SAFETY_KILL_SWITCH_TIMEOUT_MS"),
        "poac_kill_publish_ms": define("fw", poac_main, "KILLSWITCH_PUBLISH_TIME_MS"),
        "esc_rpm_timeout_ms": define("fw", esc_dshot, "DSHOT_MIN_UPDATE_RATE_MS"),
        "esc_rpm_penalty_ms": define("fw", esc_dshot, "DSHOT_UPDATE_DISABLE_TIME_MS"),
        "esc_poweron_delay_ms": define("fw", esc_dshot, "ESC_POWERUP_DELAY_MS"),
        "esc_power_threshold_mv": define("fw", esc_dshot, "ESC_POWER_THRESHOLD_MV"),
        "dshot_rate_khz": define("fw", esc_dshot, "DSHOT_RATE"),
        "esc_telemetry_ms": define("fw", esc_main, "TELEM_PUBLISH_RATE_MS"),
        # A board decides the micro-ROS agent is gone after more than this many failed heartbeats in a row
        "ros_heartbeat_ms": define("fw", poac_main, "HEARTBEAT_TIME_MS"),
        "ros_max_missed_heartbeats": define("fw", poac_ros, "MAX_MISSSED_HEARTBEATS"),
        "esc_flags": flags,
        "links": {
            "refresh": url("fw", kill_c, line_of(kc, r"void safety_internal_kill_refresh_switches")),
            "no_switch": url("fw", kill_c, line_of(kc, r"If no kill switches are enabled")),
            "start_killed": url("fw", kill_c, line_of(kc, r"last_state_asserting_kill = true;\s*// Start")),
            "software_kill_cb": url("fw", poac_ros, line_of(pr, r"static void software_kill_subscription_callback")),
            "lock_check": url("fw", poac_ros, line_of(pr, r"Invalid frame ID to unlock")),
            "physical": url("fw", poac_safety, line_of(ps, r"static inline void safety_interface_refresh_physical_kill_switch")),
            "soft_pin": url("fw", poac_safety, line_of(ps, r"Initialize Physical Kill Override Pin")),
            "publish_kill": url("fw", poac_ros, line_of(pr, r"rcl_ret_t ros_publish_killswitch")),
            "poac_loop": url("fw", poac_main, line_of(pm, r"Lost connection to ROS")),
            "esc_kill_sub": url("fw", esc_ros, line_of(er, r"static void killswitch_subscription_callback")),
            "esc_flags": url("fw", esc_core1, line_of(c1, r"Phase 2: Check Kill Conditions")),
            "esc_can_cb": url("fw", esc_main, line_of(show("fw", esc_main), r"static void thruster_cmd_callback")),
            "kill_c": url("fw", kill_c),
        },
    }

    # ---------- CAN ids of the ESC boards (titan_canmore standard-id layout) ----------
    proto = show("canmore", "canmore/include/canmore/protocol.h")
    ids = show("canmore", "canmore/include/canmore/client_ids.h")
    L = {k: int(v) for k, v in re.findall(r"#define CANMORE_(NOC|DIRECTION|TYPE|CLIENT_ID)_LENGTH (\d+)", proto)}
    noc_off = 0
    dir_off = noc_off + L["NOC"]
    type_off = dir_off + L["DIRECTION"]
    client_off = type_off + L["TYPE"]
    esc = {k: int(v) for k, v in re.findall(r"#define CANMORE_CLIENT_ID_(ESC_BOARD\d|POWER_BOARD) (\d+)", ids)}
    sender = show("control", "riptide_controllers/models/complete_system/send_thruster_cmd_canbus.c")
    chan = int(re.search(r"#define CANMORE_TITAN_CHAN_THRUSTER_CMDS (\d+)", sender).group(1))
    util = int(re.search(r"#define CANMORE_TYPE_UTIL (\d+)", sender).group(1))
    a2c = int(re.search(r"#define CANMORE_DIRECTION_AGENT_TO_CLIENT (\d+)", sender).group(1))

    def can_id(client):
        return (client << client_off) | (util << type_off) | (a2c << dir_off) | (chan << noc_off)

    robot_h = show("fw", "lib/titan_boards/include/robots/talos.h")
    out["can"] = {
        "esc0": {"client": esc["ESC_BOARD0"], "id": can_id(esc["ESC_BOARD0"])},
        "esc1": {"client": esc["ESC_BOARD1"], "id": can_id(esc["ESC_BOARD1"])},
        "poac_client": esc["POWER_BOARD"],
        "layout": {"noc": [noc_off, L["NOC"]], "direction": [dir_off, L["DIRECTION"]], "type": [type_off, L["TYPE"]],
                   "client": [client_off, L["CLIENT_ID"]]},
        "rate": int(re.search(r"#define INTERNAL_CAN_RATE (\d+)", robot_h).group(1)),
        "fd_rate": int(re.search(r"#define INTERNAL_CAN_FD_RATE (\d+)", robot_h).group(1)),
        "sender_url": url("control", "riptide_controllers/models/complete_system/send_thruster_cmd_canbus.c",
                          line_of(sender, r"^int send_thruster_cmd_canbus")),
        "client_ids_url": url("canmore", "canmore/include/canmore/client_ids.h",
                              line_of(ids, r"CANMORE_CLIENT_ID_ESC_BOARD0")),
    }

    # ---------- controller_overseer (still launched with the MPC) ----------
    ov = "riptide_controllers/src/riptide_controllers/controller_overseer.py"
    ovt = show("control", ov)
    out["overseer"] = {
        "stop_tolerance": py_const("control", ov, "ESC_POWER_STOP_TOLERANCE"),
        "power_timeout_s": py_const("control", ov, "ESC_POWER_TIMEOUT"),
        "links": {
            "telemetry_cb": url("control", ov, line_of(ovt, r"def thrusterTelemetryCB")),
            "set_teleop": url("control", ov, line_of(ovt, r"def setTeleop")),
            "ff": url("control", ov, line_of(ovt, r"def doUpdate")),
            "file": url("control", ov),
        },
    }

    # ---------- the Nereus viewer's switch ----------
    panels = "content/viewer/talos_uwrt_panels.yaml"
    pt = show("nereus", panels)
    motion = yaml.safe_load(pt)["providers"]["motion"]["options"]
    rt = "integrations/ros2/viewer/panels/ros_runtime.cpp"
    rtt = show("nereus", rt)
    um = "integrations/ros2/viewer/panels/uwrt_motion.cpp"
    umt = show("nereus", um)
    hb = float(re.search(r'config\["heartbeat_period"\]\.as<double>\(([\d.]+)\)', rtt).group(1))
    out["viewer"] = {
        "slot": motion["kill_switch_id"],
        "kill_topic": motion["kill_topic"],
        "linear_topic": motion["linear_topic"],
        "angular_topic": motion["angular_topic"],
        "mode_service": motion["mode_service"],
        "heartbeat_s": hb,
        "ui_timeout_s": float(re.search(r'uiTimeout\(cfg\["ui_timeout"\]\.as<double>\(([\d.]+)\)', rtt).group(1)),
        "links": {
            "config": url("nereus", panels, line_of(pt, r"kill_switch_id")),
            "report": url("nereus", um, line_of(umt, r"void report\(\) override")),
            "competing": url("nereus", um, line_of(umt, r"Any other sender on our switch ID")),
            "enable": url("nereus", rt, line_of(rtt, r"^void RosMotion::enable")),
            "release": url("nereus", rt, line_of(rtt, r"^void RosMotion::releaseLocked")),
            "tick": url("nereus", rt, line_of(rtt, r"^void RosMotion::tick")),
            "send": url("nereus", um, line_of(umt, r"void send\(const Pose")),
        },
    }

    # ---------- the MPC node ----------
    node = "riptide_mpc/src/mpc_controller_node.cpp"
    nt = show("control", node)
    cfg_path = "riptide_mpc/config/mpc.yaml"
    cfg = yaml.safe_load(show("control", cfg_path))["/**/mpc_controller"]["ros__parameters"]
    cfgt = show("control", cfg_path)
    out["mpc"] = {
        "control_period_s": cfg["control_period"],
        "odom_timeout_s": cfg["odom_timeout"],
        "respect_motion_enabled": cfg["respect_motion_enabled"],
        "success_trust": cfg["path"]["success_trust"],
        "progress_timeout_s": cfg["path"]["progress_timeout"],
        "linear_speed": cfg["motion"]["linear_speed"],
        "finish": {k: float(v) for k, v in re.findall(r'finish_(position|angle|speed|rate)_ = declare_parameter\("path\.finish_\w+", ([\d.]+)\)', nt)},
        "links": {
            "header": url("control", node, 1),
            "subs": url("control", node, line_of(nt, r'"controller/linear", 10')),
            "kill_sub": url("control", node, line_of(nt, r'kill_sub_ = create_subscription')),
            "action": url("control", node, line_of(nt, r'path_server_ = rclcpp_action::create_server')),
            "start_path": url("control", node, line_of(nt, r"void startPath\(")),
            "update_path": url("control", node, line_of(nt, r"void updatePath\(")),
            "linear_cmd": url("control", node, line_of(nt, r"void linearCommand\(")),
            "tick": url("control", node, line_of(nt, r"^    void tick\(\)")),
            "gate": url("control", node, line_of(nt, r"if \(killed_ \|\| \(respect_motion_enabled_")),
            "send_rpm": url("control", node, line_of(nt, r"void sendRpm\(")),
            "hw_output": url("control", node, line_of(nt, r"void configureHardwareOutput\(")),
            "destructor": url("control", node, line_of(nt, r"~MpcControllerNode\(\)")),
            "config": url("control", cfg_path, line_of(cfgt, r"^\s*path:")),
            "table_mode": url("control", cfg_path, line_of(cfgt, r"^\s*table_mode:")),
            "rpm_offset": url("control", cfg_path, line_of(cfgt, r"^\s*hardware\.rpm_offset:")),
            "modes": url("control", "riptide_mpc/src/mpc.cpp",
                         line_of(show("control", "riptide_mpc/src/mpc.cpp"), r"reference\.linear_mode == Mode::DISABLED \|\|")),
        },
    }

    # ---------- force -> RPM (the MPC model file's propeller law) ----------
    model_path = "riptide_mpc/config/models/talos.yaml"
    model_text = show("control", model_path)
    model = yaml.safe_load(model_text)
    hw = model["hardware"]
    out["hardware"] = {
        "kt_forward": hw["thrust_coefficient_forward"],
        "kt_reverse": hw["thrust_coefficient_reverse"],
        "diameter": hw["propeller_diameter"],
        "rho": model["water_density"],
        "total_thrust_limit": hw["total_thrust_limit"],
        "url": url("control", model_path, line_of(model_text, r"^hardware:")),
        "inverse_url": url("control", "riptide_mpc/src/fossen_model.cpp",
                           line_of(show("control", "riptide_mpc/src/fossen_model.cpp"), r"double HardwareConfig::forceToRpm")),
    }

    # ---------- thruster names in controller order ----------
    veh_path = "riptide_descriptions/config/talos.yaml"
    veh_text = show("core", veh_path)
    veh = yaml.safe_load(veh_text)
    out["thrusters"] = {"names": [t["name"] for t in veh["thrusters"]],
                        "url": url("core", veh_path, line_of(veh_text, r'name: "VUS"'))}

    # ---------- the launch switch between controllers ----------
    cs = "riptide_controllers/launch/control_system.launch.py"
    cst = show("control", cs)
    out["launch"] = {
        "default_model": re.search(r'name="active_control_model", default_value="(\w+)"', cst).group(1),
        "url": url("control", cs, line_of(cst, r'def launch_active_control')),
        "mpc_yaml": url("launch", "remote_launch/launches/talos_launch_mpc.yaml"),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1))
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
    print("slots:", [(s["id"], s["const"]) for s in out["slots"]["list"]])
    print("ESC CAN ids:", hex(out["can"]["esc0"]["id"]), hex(out["can"]["esc1"]["id"]))
    print("flags:", flags)


if __name__ == "__main__":
    main()
