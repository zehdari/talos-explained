#!/usr/bin/env python3
"""Which launch entry needs which: the topics, services and actions that cross between Talos's launch entries.

Input: public/data/rosgraph/rosgraph.json (every node's interfaces, captured from the full stack running in Nereus,
see docs/media/nereus.md). Each node is assigned to the launch entry that starts it on the robot (talos_launch_mpc.yaml).
In Nereus the simulator stands in for hardware.launch.py and zed.launch.py, so its topics are credited to those two
entries: camera topics (ffc/, dfc/) to zed, simulator/* (scoring, truth) dropped, the rest to hardware.

Output: public/data/launch/deps.json  {entries: [...], links: [{from, to, items: [{kind, name, type}]}]}
Run: python3 tools/launch/build_deps.py   (no ROS needed)
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
GRAPH = ROOT / "public/data/rosgraph/rosgraph.json"
OUT = ROOT / "public/data/launch/deps.json"

# node (last part of its name) -> launch entry on the robot
ENTRY_OF = {
    "riptide_acoustics": "hardware", "apriltag_36h11": "hardware", "tag_container": "hardware",
    "surface_frame_node": "hardware",
    "odom_to_world_broadcaster": "navigation", "depth_converter": "navigation", "ekf_localization_node": "navigation",
    "robot_state_publisher": "navigation", "joint_state_publisher": "navigation",
    "controller_overseer": "control_system", "calibrate_drag": "control_system", "mpc_controller": "control_system",
    "yolo_orientation": "tensorrt",
    "riptide_mapping2": "mapping", "world_to_map": "mapping",
    "autonomy": "autonomy", "ActuatorTranslator": "autonomy",
    "nereus_viewer": "viewer", "nereus_viewer_timing": "viewer", "viewer_panels": "viewer", "viewer_plots": "viewer",
}
SIM_NODES = {"physics_simulator", "sim_supervisor"}
SKIP_TOPICS = {"/clock", "/tf", "/tf_static", "/rosout", "/parameter_events"}
SKIP_SUFFIX = ("/describe_parameters", "/get_parameter_types", "/get_parameters", "/list_parameters",
               "/set_parameters", "/set_parameters_atomically", "/get_type_description")
ORDER = ["hardware", "navigation", "zed", "tensorrt", "mapping", "autonomy", "control_system", "viewer"]


# Simulator interfaces with no robot counterpart: its services (reset, sync), the odometry it reads for its
# "sync sim to estimate" tool, and thruster_forces. On the robot nothing in hardware.launch.py (or any board firmware)
# subscribes to thruster_forces: the MPC sends RPM to the ESCs over CAN itself, which is not a ROS topic.
SIM_ONLY_USES = {"/talos/odometry/filtered", "/talos/thruster_forces"}


def entry_for(node, topic, kind="topic", using=False):
    tail = node.rstrip("/").split("/")[-1]
    if tail in SIM_NODES:
        if kind != "topic" or (using and topic in SIM_ONLY_USES):
            return None
        if "/simulator/" in topic or topic.startswith("/simulator"):
            return None
        return "zed" if ("/ffc/" in topic or "/dfc/" in topic) else "hardware"
    return ENTRY_OF.get(tail)


def short(name):
    return name[len("/talos/"):] if name.startswith("/talos/") else name


def main():
    g = json.loads(GRAPH.read_text())
    # interface name -> providers / users, with kinds: topic (pub -> sub), service (server -> client), action
    provide, use = {}, {}
    for n in g["nodes"]:
        for kind, prov, usr in (("topic", "publishers", "subscribers"), ("service", "services", "clients"),
                                ("action", "action_servers", "action_clients")):
            for x in n.get(prov, []):
                provide.setdefault((kind, x["name"], x["type"]), set()).add(n["node"])
            for x in n.get(usr, []):
                use.setdefault((kind, x["name"], x["type"]), set()).add(n["node"])
    links = {}
    for key, users in use.items():
        kind, name, typ = key
        if name in SKIP_TOPICS or name.endswith(SKIP_SUFFIX) or key not in provide:
            continue
        for p in provide[key]:
            a = entry_for(p, name, kind)
            for u in users:
                b = entry_for(u, name, kind, using=True)
                if not a or not b or a == b:
                    continue
                links.setdefault((a, b), set()).add((kind, short(name), typ))
    # The robot's depth path: the camera cage board publishes state/depth/raw (through micro-ROS, in hardware) and
    # navigation's depth_converter turns it into depth/pose. Nereus publishes depth/pose itself, so credit it back.
    for (a, b), items in list(links.items()):
        if a == "hardware" and ("topic", "depth/pose", "geometry_msgs/msg/PoseWithCovarianceStamped") in items:
            items.discard(("topic", "depth/pose", "geometry_msgs/msg/PoseWithCovarianceStamped"))
            if b == "navigation":
                items.add(("topic", "state/depth/raw", "riptide_msgs2/msg/Depth"))
    out = {
        "source": "public/data/rosgraph/rosgraph.json (Nereus full stack, " + g["captured"] + ")",
        "entries": ORDER,
        "links": [{"from": a, "to": b, "items": [{"kind": k, "name": n, "type": t} for k, n, t in sorted(items)]}
                  for (a, b), items in sorted(links.items(), key=lambda kv: (ORDER.index(kv[0][0]), ORDER.index(kv[0][1])))],
    }
    OUT.write_text(json.dumps(out, indent=1))
    for l in out["links"]:
        print(f'{l["from"]:>15} -> {l["to"]:<15} {len(l["items"]):>3}  ' + ", ".join(i["name"] for i in l["items"])[:150])


if __name__ == "__main__":
    main()
