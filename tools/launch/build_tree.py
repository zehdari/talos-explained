#!/usr/bin/env python3
"""Expand Talos's launch files into a JSON tree for the "Launching the stack" chapter.

What it does, for every Talos launch YAML in riptide_launch/remote_launch/launches/ and for Nereus sim.launch.py:
it runs each launch file through the real ROS 2 launch API (IncludeLaunchDescription, GroupAction, OpaqueFunction,
conditions, PushRosNamespace all behave exactly as under `ros2 launch`), but it never executes a process: when the
walk reaches a Node, ComposableNodeContainer or ExecuteProcess it records it instead of starting it.

The launch files are read from the release workspace sources (~/osu-uwrt/release/src, on the branches the site
follows), not from install/, through a throwaway ament prefix whose share/<package> folders link to the sources.

Run (ROS 2 Humble and the release workspace sourced; nothing heavy):
    source /opt/ros/humble/setup.bash; source ~/osu-uwrt/release/install/setup.bash
    python3 tools/launch/build_tree.py            # writes public/data/launch/launch_tree.json

Things that only exist on the robot are simulated, and each is listed in the JSON's "assumptions":
  * /home/ros/colcon_deploy exists (control_system.launch.py checks it to decide it is on the Orin);
  * the DVL host name resolves (nortek_dvl's dvl.launch.py looks it up at launch time);
  * zed_wrapper is the zed-ros2-wrapper source in release/src (it is not built on a laptop without the ZED SDK).
"""
import json
import os
import re
import socket
import sys
import tempfile
import traceback
import xml.etree.ElementTree as ET
from pathlib import Path

import yaml

HOME = Path.home()
RELEASE = HOME / "osu-uwrt/release"
SRC = RELEASE / "src"
NEREUS = RELEASE / "nereus"
LAUNCHES = SRC / "riptide_launch/remote_launch/launches"
OUT = Path(__file__).resolve().parents[2] / "public/data/launch/launch_tree.json"

# Repo folder in release/src -> (GitHub repo, branch the site links)
REPOS = {
    "riptide_core": ("osu-uwrt/riptide_core", "followpath-speed"),
    "riptide_control": ("osu-uwrt/riptide_control", "mpc"),
    "riptide_perception": ("osu-uwrt/riptide_perception", "mapping-estimator"),
    "riptide_autonomy": ("osu-uwrt/riptide_autonomy", "autonomy-mapping"),
    "riptide_launch": ("osu-uwrt/riptide_launch", "newsim"),
    "riptide_gui": ("osu-uwrt/riptide_gui", "newsim"),
    "riptide_simulator": ("osu-uwrt/riptide_simulator", "newsim"),
    "nortek_dvl": ("osu-uwrt/nortek_dvl", "DvlWaterTrackFallback"),
    "zed-ros2-wrapper": ("stereolabs/zed-ros2-wrapper", "master"),
}

ASSUMPTIONS = []

# One line per program: what it is for. Written from the source of each node (file named in "src").
# group: hardware | navigation | control | perception | autonomy | diagnostics | sim | operator | legacy
ROLES = {
    "micro_ros_agent/micro_ros_agent": ("hardware", "micro-ROS agent on the CAN bus (can0): turns the firmware boards' CAN traffic into ROS topics and services. Without it no board talks to ROS: no kill switch state, no depth, no thruster telemetry.", None),
    "nortek_dvl/dvl": ("hardware", "Nortek DVL driver: connects to the DVL over Ethernet (host uwrt-dvl, port 9004) and publishes dvl_twist (velocity over the floor) and dvl/status.", "nortek_dvl/nortek_dvl/launch/dvl.launch.py"),
    "riptide_hardware2/fake_dvl.py": ("hardware", "Stand-in for the DVL on the bench: publishes a zero velocity with 5 mm/s of noise on dvl_twist every 0.125 s (8 Hz), so the EKF still has a velocity input out of the water.", "riptide_core/riptide_hardware/riptide_hardware2/fake_dvl.py"),
    "riptide_imu/imu": ("hardware", "VectorNav IMU driver (node riptide_imu): serial port from imu_port, publishes vectornav/imu plus magnetometer and pressure.", "riptide_core/riptide_imu/src/main.cpp"),
    "riptide_gyro/gyro_driver": ("hardware", "Fibre-optic gyro (FOG) driver on gyro_port: publishes gyro/raw, gyro/status and gyro/twist (yaw rate for the EKF).", "riptide_core/riptide_gyro/src/riptide_gyro/driver.cpp"),
    "rclcpp_components/component_container@tag_container": ("perception", "Container process for the AprilTag detector (the tag sits on the pool wall; mapping uses it to place the map).", None),
    "apriltag_ros/AprilTagNode": ("perception", "Detects 36h11 AprilTags (0.508 m) in the front camera's compressed images.", None),
    "tf2_ros/static_transform_publisher@surface_frame_node": ("perception", "Static transform tag36h11:0 -> estimated_origin_frame (0.4572 m from the tag, rotated), the frame the Mapping panel's tag calibration uses.", None),
    "riptide_acoustics/run_acoustics": ("hardware", "Acoustics: pinger direction finding from the hydrophone board's data. Nereus does not simulate acoustics.", None),
    "riptide_hardware2/simple_actuator_interface.py": ("hardware", "Turns the one-shot topics command/simple_torpedo_fire and command/simple_dropper_fire into the arm and fire service calls.", "riptide_core/riptide_hardware/riptide_hardware2/simple_actuator_interface.py"),
    "riptide_hardware2/imu_power_cycle.py": ("hardware", "Power-cycles the IMU through an Orin GPIO pin (pin 22 in imu_pwr_cycle.yaml) for 10 s when command/electrical asks for CYCLE_IMU.", "riptide_core/riptide_hardware/riptide_hardware2/imu_power_cycle.py"),
    "riptide_hardware2/pinger_broker": ("hardware", "Re-publishes the selected pinger frequency to ivc/pinger/set_freq_khz once a second.", "riptide_core/riptide_hardware/src/pinger_broker.cpp"),
    "tf2_ros/static_transform_publisher@odom_to_world_broadcaster": ("navigation", "Static identity transform world -> odom (the comment in the file: \"until we get SLAM\").", None),
    "riptide_hardware2/depth_converter.py": ("navigation", "Turns the pressure sensor's state/depth/raw into depth/pose for the EKF.", "riptide_core/riptide_hardware/riptide_hardware2/depth_converter.py"),
    "robot_localization/ekf_node": ("navigation", "The EKF (robot_localization, talos_ekf.yaml, 30 Hz): fuses vectornav/imu, dvl_twist, gyro/twist and depth/pose into odometry/filtered and odom -> talos/base_link.", None),
    "robot_state_publisher/robot_state_publisher@robot_state_publisher": ("navigation", "Builds Talos's URDF from riptide_descriptions2 robots/talos.xacro and publishes every fixed sensor and thruster frame on /tf_static.", None),
    "joint_state_publisher/joint_state_publisher": ("navigation", "Joint states for the URDF (read from /tmp/model.urdf, which navigation.launch.py writes).", None),
    "robot_state_publisher/robot_state_publisher@zed_state_publisher": ("navigation", "The ZED X Mini's own frames (from zed_wrapper's URDF) under this camera's name.", None),
    "riptide_controllers2/controller_overseer.py": ("control", "Controller supervisor: publishes controller/motion_enabled and the feed-forward body force, warns when thruster telemetry stops.", "riptide_control/riptide_controllers/src/riptide_controllers/controller_overseer.py"),
    "riptide_controllers2/calibrate_drag.py": ("control", "Drag calibration action server (used by the older controllers' tuning).", None),
    "riptide_mpc/mpc_controller": ("control", "The MPC: pose and velocity goals in, eight thruster forces out every 50 ms. On the robot it also sends the RPM commands to the ESC boards over CAN itself.", None),
    "complete_controller/complete_controller": ("legacy", "The older controller, started when active_control_model is anything but mpc. Its package is not in the release workspace.", None),
    "rclcpp_components/component_container@zed_container": ("perception", "One process holding both ZED X Mini cameras (two stereolabs::ZedCamera components, ffc and dfc), so images can pass between them without copies.", None),
    "zed_components/stereolabs::ZedCamera": ("perception", "ZED SDK camera node: 1920x1200 (HD1200) at 15 fps, NEURAL_PLUS depth to 4 m. Settings in ffc_config.yaml / dfc_config.yaml.", "riptide_core/riptide_hardware/cfg/ffc_config.yaml"),
    "riptide_hardware2/picture_taker.py": ("perception", "Saves front-camera stereo frames to /home/ros/cal_images when its capture_image service is called (calibration pictures).", "riptide_core/riptide_hardware/riptide_hardware2/picture_taker.py"),
    "tensor_detector/yolo_orientation.py": ("perception", "The YOLO detector on the active camera (ffc or dfc): detections with 3D poses from the depth image, plus an annotated image stream.", None),
    "riptide_mapping2/mapping.py": ("perception", "Mapping: fuses detections into one pose estimate per course object and publishes them as TF frames.", None),
    "chameleon_tf/chameleon_tf": ("perception", "Publishes world -> map; the AprilTag calibration moves it (x, y and yaw unlocked; z, roll and pitch locked).", None),
    "riptide_autonomy2/doTask": ("autonomy", "Behaviour-tree executor (node autonomy): runs a tree when asked through its action; the viewer's Autonomy panel starts trees here.", None),
    "riptide_hardware2/actuator_service_translator.py": ("autonomy", "Serves the actuator services the trees call (torpedo, dropper, arm, notify_reload) by publishing the matching command topics.", "riptide_core/riptide_hardware/riptide_hardware2/actuator_service_translator.py"),
    "riptide_hardware2/electrical_monitor.py": ("diagnostics", "Diagnostics monitor (electrical). The team no longer uses the diagnostics.", None),
    "riptide_hardware2/firmware_monitor.py": ("diagnostics", "Diagnostics monitor (firmware status). The team no longer uses the diagnostics.", None),
    "riptide_hardware2/voltage_monitor.py": ("diagnostics", "Diagnostics monitor (voltages). The team no longer uses the diagnostics.", None),
    "riptide_hardware2/computer_monitor.py": ("diagnostics", "Diagnostics monitor (Orin CPU, memory). The team no longer uses the diagnostics.", None),
    "diagnostic_aggregator/aggregator_node": ("diagnostics", "Collects the monitors' diagnostics into one tree. Not used any more.", None),
    "c_simulator/task_simulator.py": ("legacy", "Task scoring for the old simulator (riptide_simulator), replaced by Nereus.", None),
    "riptide_controllers2/thruster_wrench_publisher.py": ("legacy", "Publishes the thrusters' combined wrench as markers for RViz (old RViz setup).", None),
    "riptide_rviz/MarkerPublisher.py": ("legacy", "Robot and course markers for RViz. The team no longer uses RViz: the Nereus viewer replaced it.", None),
    "rviz2/rviz2": ("legacy", "RViz, the old operator GUI, replaced by the Nereus viewer.", None),
    "c_simulator/physics_simulator": ("legacy", "The old simulator (riptide_simulator), replaced by Nereus.", None),
    "process@simulator": ("sim", "sim_supervisor.py, which runs nereus-sim on the resolved scenario and restarts it in another pool when the viewer asks. nereus-sim stands in for the boards, sensors and cameras.", "nereus/integrations/uwrt/launch/sim_supervisor.py"),
    "process@pool_viewer": ("operator", "nereus-viewer, the operator UI. Closing it ends the whole launch unless close_with_viewer:=false.", None),
}


def github(path):
    """GitHub blob URL for a file in release/src or nereus, else None."""
    p = Path(os.path.realpath(path))
    try:
        rel = p.relative_to(NEREUS)
        return f"https://github.com/osu-uwrt/nereus/blob/main/{rel}"
    except ValueError:
        pass
    try:
        rel = p.relative_to(SRC)
    except ValueError:
        return None
    repo = rel.parts[0]
    if repo not in REPOS:
        return None
    name, branch = REPOS[repo]
    return f"https://github.com/{name}/blob/{branch}/{Path(*rel.parts[1:])}"


def short(path):
    p = Path(os.path.realpath(str(path)))
    for base, label in ((SRC, ""), (NEREUS, "nereus/")):
        try:
            return label + str(p.relative_to(base))
        except ValueError:
            pass
    return str(path)


def make_prefix():
    """A throwaway ament prefix: share/<package> -> the package's source folder, for every package in release/src."""
    prefix = Path(tempfile.mkdtemp(prefix="talos-launch-tree-"))
    index = prefix / "share/ament_index/resource_index/packages"
    index.mkdir(parents=True)
    found = {}
    for xml in SRC.rglob("package.xml"):
        if any(part in ("build", "install", "log", ".git") for part in xml.parts):
            continue
        try:
            name = ET.parse(xml).getroot().findtext("name").strip()
        except Exception:
            continue
        found.setdefault(name, xml.parent)
    for name, folder in found.items():
        (prefix / "share" / name).symlink_to(folder)
        (index / name).write_text("")
    os.environ["AMENT_PREFIX_PATH"] = f"{prefix}:{os.environ.get('AMENT_PREFIX_PATH', '')}"
    if "zed_wrapper" in found:
        ASSUMPTIONS.append("zed_wrapper is read from the zed-ros2-wrapper sources in release/src (a laptop without the "
                           "ZED SDK does not build it; the Orin does).")
    return prefix, found


# ---------------------------------------------------------------- robot-only environment
_real_exists = os.path.exists
ON_ORIN = {"value": True}


def fake_exists(p):
    if str(p) == "/home/ros/colcon_deploy":
        return ON_ORIN["value"]
    return _real_exists(p)


os.path.exists = fake_exists
socket.gethostbyname = lambda host: "0.0.0.0"   # dvl.launch.py resolves the DVL's host name at launch time

# ---------------------------------------------------------------- the walk
from launch import LaunchContext, LaunchDescription  # noqa: E402
from launch.actions import ExecuteProcess, IncludeLaunchDescription, OpaqueFunction, Shutdown  # noqa: E402
from launch.launch_description_sources import AnyLaunchDescriptionSource  # noqa: E402
from launch.utilities import normalize_to_list_of_substitutions, perform_substitutions  # noqa: E402
from launch_ros.actions import ComposableNodeContainer, LoadComposableNodes, Node  # noqa: E402


def subs(ctx, value):
    if value is None or isinstance(value, bool):
        return value
    try:
        return perform_substitutions(ctx, normalize_to_list_of_substitutions(value))
    except Exception:
        return str(value)


def find_line(path, *needles):
    try:
        lines = Path(path).read_text().splitlines()
    except Exception:
        return None
    for needle in needles:
        if not needle:
            continue
        pat = re.compile(r"""['"]""" + re.escape(needle) + r"""['"]""")
        for i, line in enumerate(lines, 1):
            if pat.search(line) and not line.strip().startswith("#"):
                return i
    for needle in needles:   # e.g. share("riptide_bringup2") + "/launch/bringup.launch.py"
        if not needle:
            continue
        for i, line in enumerate(lines, 1):
            if needle in line and not line.strip().startswith("#"):
                return i
    return None


def params_of(node, ctx):
    """Parameter files and inline parameters, as given to the node."""
    out = []
    for entry in node._Node__expanded_parameter_arguments or []:
        path, is_file = entry
        if is_file and not str(path).startswith(tempfile.gettempdir() + "/launch_params_"):
            out.append({"file": short(path), "url": github(path)})
        else:
            try:
                data = yaml.load(Path(path).read_text(), Loader=yaml.FullLoader)   # launch_ros writes tuples
                values = next(iter(data.values()))["ros__parameters"]
                for k, v in values.items():
                    if isinstance(v, tuple):
                        v = list(v)
                    if k == "robot_description":
                        v = f"<URDF, {len(str(v)):,} characters>"
                    out.append({"name": k, "value": v})
            except Exception:
                out.append({"file": str(path)})
    return out


def record_node(node, ctx, file, kind="node"):
    node._perform_substitutions(ctx)
    exe = node.node_executable
    pkg = node.node_package
    rec = {
        "kind": kind,
        "package": pkg,
        "executable": exe,
        "name": node.node_name.lstrip("/") if not node.node_name.startswith("/<") else None,
        "fqn": node.node_name,
        "namespace": node.expanded_node_namespace,
        "file": short(file),
        "line": find_line(file, exe),
        "params": params_of(node, ctx),
        "args": [subs(ctx, a) for a in (node._Node__arguments or [])],
        "respawn": subs(ctx, node._ExecuteLocal__respawn) in ("True", "true", True),
    }
    prefix = subs(ctx, node.process_description.prefix)
    if prefix:
        rec["prefix"] = prefix
    if node.node_name.startswith("/<"):
        rec["fqn"] = (rec["namespace"].rstrip("/") + "/" + exe) if rec["namespace"] else "/" + exe
        rec["name"] = None
    return rec


def walk(entities, ctx, file, out, depth=0):
    for e in entities:
        try:
            walk_one(e, ctx, file, out, depth)
        except Exception as ex:   # record it and carry on, so scoped groups still pop their configurations
            out.append({"kind": "error", "file": short(file), "entity": type(e).__name__,
                        "error": f"{type(ex).__name__}: {ex}"})


def walk_one(e, ctx, file, out, depth):
    cond = getattr(e, "condition", None)
    skipped = cond is not None and not cond.evaluate(ctx)
    if isinstance(e, IncludeLaunchDescription):
        src = e.launch_description_source
        path = subs(ctx, src._LaunchDescriptionSource__location)
        rec = {"kind": "include", "file": short(path), "url": github(path), "line": None,
               "args": [], "children": []}
        for k, v in e.launch_arguments:
            rec["args"].append(f"{subs(ctx, k)}:={subs(ctx, v)}")
        rec["line"] = find_line(file, Path(path).name) if file else None
        rec["from"] = short(file) if file else None
        if skipped:
            rec["skipped"] = True
            out.append(rec)
            return
        out.append(rec)
        try:
            sub = e.visit(ctx) or []
            walk(sub, ctx, path, rec["children"], depth + 1)
        except Exception as ex:
            rec["error"] = f"{type(ex).__name__}: {ex}"
        return
    if isinstance(e, ComposableNodeContainer):
        rec = record_node(e, ctx, file, "container")
        rec["children"] = []
        for d in e._ComposableNodeContainer__composable_node_descriptions or []:
            rec["children"].append({
                "kind": "component",
                "package": subs(ctx, d.package),
                "plugin": subs(ctx, d.node_plugin),
                "name": subs(ctx, d.node_name),
                "namespace": subs(ctx, d.node_namespace) if d.node_namespace else "",
                "line": find_line(file, subs(ctx, d.node_plugin)),
                "file": short(file),
            })
        if skipped:
            rec["skipped"] = True
        out.append(rec)
        return
    if isinstance(e, Node):
        if skipped:
            rec = {"kind": "node", "package": e.node_package, "executable": e.node_executable, "skipped": True,
                   "file": short(file), "line": find_line(file, e.node_executable)}
            try:
                rec["name"] = subs(ctx, e._Node__node_name)
            except Exception:
                pass
            out.append(rec)
            return
        out.append(record_node(e, ctx, file))
        return
    if isinstance(e, LoadComposableNodes):
        out.append({"kind": "load", "file": short(file)})
        return
    if isinstance(e, ExecuteProcess):
        cmd = [subs(ctx, c) for c in e.cmd]
        name = subs(ctx, e.name) if e.name else Path(cmd[0]).name
        rec = {"kind": "process", "name": name, "cmd": cmd, "file": short(file), "line": find_line(file, name)}
        if skipped:
            rec["skipped"] = True
        out.append(rec)
        return
    if skipped:
        return
    if isinstance(e, Shutdown):
        return
    try:
        sub = e.visit(ctx)
    except Exception as ex:
        out.append({"kind": "error", "file": short(file), "error": f"{type(ex).__name__}: {ex}",
                    "trace": traceback.format_exc().splitlines()[-3:]})
        return
    if sub:
        walk(sub, ctx, file, out, depth)


def expand(path, args):
    """The tree `ros2 launch <path> <args>` would start."""
    ctx = LaunchContext()
    for a in args:
        k, v = a.split(":=", 1)
        ctx.launch_configurations[k] = v
    import io, contextlib
    printed = io.StringIO()
    out = []
    with contextlib.redirect_stdout(printed):
        src = AnyLaunchDescriptionSource(str(path))
        ld = src.get_launch_description(ctx)
        walk([ld], ctx, str(path), out)
    return out, [l for l in printed.getvalue().splitlines() if l.strip()]


def launch_path(package, file, found):
    return found[package] / "launch" / file if package in found else None


def count(nodes):
    n = 0
    for r in nodes:
        if r.get("skipped"):
            continue
        if r["kind"] in ("node", "process"):
            n += 1
        if r["kind"] == "container":
            n += 1
        n += count(r.get("children", [])) if r["kind"] == "include" else 0
    return n


def role_key(r):
    if r["kind"] == "component":
        return f'{r["package"]}/{r["plugin"]}'
    if r["kind"] == "process":
        return f'process@{r["name"]}'
    base = f'{r.get("package")}/{r.get("executable")}'
    tail = (r.get("fqn") or r.get("name") or "").rstrip("/").split("/")[-1]
    return f"{base}@{tail}" if f"{base}@{tail}" in ROLES else base


def finish(tree, prefix, sim_out, roles=True):
    """Attach roles and links; replace machine-specific paths with readable ones."""
    def clean(v):
        if isinstance(v, str):
            v = v.replace(f"{prefix}/share/", "share/").replace(sim_out, "<output>")
            v = v.replace(str(NEREUS), "nereus").replace(str(HOME), "~")
            return v
        if isinstance(v, list):
            return [clean(x) for x in v]
        if isinstance(v, dict):
            return {k: clean(x) for k, x in v.items()}
        return v

    def visit(nodes):
        for r in nodes:
            if r["kind"] in ("node", "container", "component", "process"):
                key = role_key(r)
                if key in ROLES:
                    r["group"], r["role"], src = ROLES[key]
                    if src:
                        r["src"] = github(SRC / src) if not src.startswith("nereus/") else github(NEREUS / src[7:])
                else:
                    print("no role for", key)
            if r.get("file") and r["kind"] != "include":
                full = SRC / r["file"] if not r["file"].startswith("nereus/") else NEREUS / r["file"][7:]
                url = github(full)
                if url:
                    r["url"] = url + (f'#L{r["line"]}' if r.get("line") else "")
            visit(r.get("children", []))
    if roles:
        visit(tree)
    return clean(tree)


def main():
    before = set(Path(tempfile.gettempdir()).glob("launch_params_*"))
    prefix, found = make_prefix()
    result = {"generated_by": "tools/launch/build_tree.py", "yamls": [], "assumptions": ASSUMPTIONS}
    ASSUMPTIONS.append("The Talos YAMLs are expanded as on the Orin: /home/ros/colcon_deploy exists, so "
                       "control_system.launch.py takes its on-Orin branch.")
    ASSUMPTIONS.append("The DVL's host name (uwrt-dvl) is not looked up; on the robot dvl.launch.py resolves it when the "
                       "launch starts and exits if it can't.")
    for yfile in sorted(LAUNCHES.glob("*.yaml")):
        if not yfile.name.startswith("talos"):
            continue
        doc = yaml.safe_load(yfile.read_text())
        raw = yfile.read_text()
        entry_lines = [i for i, l in enumerate(raw.splitlines(), 1) if re.match(r"\s*package:", l)]
        commented = [m.group(1) for m in re.finditer(r"#\s*file:\s*\"?([\w.]+)\"?", raw)]
        y = {"file": yfile.name, "url": github(yfile), "entries": [], "commented_out": sorted(set(commented))}
        for i, ent in enumerate(doc["launches"]):
            pkg, file = ent["package"], ent["file"]
            topics = [ent["topics"][k:k + 3] for k in range(0, len(ent["topics"]), 3)]
            path = launch_path(pkg, file, found)
            rec = {"package": pkg, "file": file, "args": ent["args"],
                   "topics": [{"name": t[0], "type": t[1], "sensor_qos": t[2] == "1"} for t in topics],
                   "yaml_line": entry_lines[i] if i < len(entry_lines) else None}
            if path is None or not path.exists():
                rec["missing"] = True
                rec["children"] = []
            else:
                rec["url"] = github(path)
                rec["path"] = short(path)
                ON_ORIN["value"] = True
                try:
                    rec["children"], rec["printed"] = expand(path, ent["args"])
                except Exception as ex:
                    rec["error"] = f"{type(ex).__name__}: {ex}"
                    rec["children"] = []
            rec["process_count"] = count(rec["children"])
            rec["children"] = finish(rec["children"], prefix, "\0")
            if "printed" in rec:
                rec["printed"] = finish(rec["printed"], prefix, "\0", roles=False)
            y["entries"].append(rec)
        result["yamls"].append(y)
        print(f"{yfile.name}: {len(y['entries'])} entries, {sum(e['process_count'] for e in y['entries'])} processes")

    # Nereus on a laptop: the documented full-stack command.
    ON_ORIN["value"] = False
    sim_out = f"{tempfile.mkdtemp(prefix='nereus-tree-')}/sim"
    sim_args = ["active_control_model:=mpc", "mpc_model:=sim", f"output:={sim_out}"]
    sim_path = NEREUS / "integrations/uwrt/launch/sim.launch.py"
    children, printed = expand(sim_path, sim_args)
    result["sim"] = {"file": "sim.launch.py", "url": github(sim_path), "path": short(sim_path),
                     "args": sim_args[:2], "children": finish(children, prefix, sim_out),
                     "printed": finish(printed, prefix, sim_out, roles=False),
                     "process_count": count(children)}
    print(f"sim.launch.py: {count(children)} processes")
    # launch_ros writes inline parameters to /tmp/launch_params_*; remove the ones this run made.
    for f in set(Path(tempfile.gettempdir()).glob("launch_params_*")) - before:
        f.unlink(missing_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(result, separators=(",", ":"), default=str))
    print("wrote", OUT)


if __name__ == "__main__":
    main()
