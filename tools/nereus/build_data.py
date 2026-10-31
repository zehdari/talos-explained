#!/usr/bin/env python3
"""Data for the "Nereus, the simulator" chapter, from the real Nereus packs and tools.

Run with the Nereus virtualenv (it has ruamel.yaml and Pillow):

    ~/osu-uwrt/release/nereus/.venv/bin/python tools/nereus/build_data.py

Reads (all local, read-only):
    ~/osu-uwrt/release/nereus/content/packs/...    the packs (only files tracked on main)
    resolved scenarios written by `python -m nereus.packs resolve` (run here into a temp folder)
    public/data/rosgraph/topics.json                measured topic rates from the media run
    ~/datasets/robosub2026_{ffc,dfc}                the synthetic YOLO datasets (a few samples)

Writes public/data/nereus/{packs,course,bridge,tests,samples}.json and public/img/nereus/sample-*.webp.
"""

from __future__ import annotations

import glob
import json
import math
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image
from ruamel.yaml import YAML

HOME = Path.home()
NEREUS = HOME / "osu-uwrt/release/nereus"
SITE = Path(__file__).resolve().parents[2]
OUT = SITE / "public/data/nereus"
IMG = SITE / "public/img/nereus"
GH = "https://github.com/osu-uwrt/nereus/blob/main/"
yaml = YAML()


def tracked() -> set[str]:
    out = subprocess.run(["git", "-C", str(NEREUS), "ls-files", "content/packs"], capture_output=True, text=True, check=True)
    return set(out.stdout.split())


def load(rel: str):
    with open(NEREUS / rel) as f:
        return yaml.load(f)


def lines_of(rel: str) -> list[str]:
    return (NEREUS / rel).read_text().splitlines()


# ---------------------------------------------------------------------------------------------- packs
# What each top-level key means, per pack kind (written from the guides in nereus/docs/guides).
KEYS = {
    "scenario": {
        "robot": "Which robot pack. A folder path relative to this file; absolute paths are rejected.",
        "pool": "Which pool pack (relative folder).",
        "tasks": "Which course (task set) pack (relative folder).",
        "bridge": "Which ROS bridge pack. Only the ROS simulator needs it.",
        "equipment": "Team gear placed at the pool: here the AprilTag calibration board.",
        "seed": "All sensor noise is reproducible from this number.",
        "timestep_s": "The physics step. 0.002 s = 500 steps per simulated second.",
        "sensor_noise": "Turn every sensor's noise on or off at once.",
        "world_frame": "The frame placements are written in: the robot's map frame.",
        "pool_placement": "Where the pool's corner sits in the world, and its heading.",
        "world_placement": "Places the world itself, relative to something else (here the AprilTag), so the pool becomes the root.",
        "equipment_placements": "Where each equipment item goes, measured from the pool, a task, or the world.",
        "task_placements": "One pose per task: where each prop's own frame sits in the world (x, y, z, yaw).",
        "task_frames": "Where the table's loose objects start, in the table's frame.",
        "contacts": "How the robot collides with the pool and course: box contacts, bounce and friction.",
        "initial": "The robot's start pose and velocity (of its centre of mass).",
        "run": "Whether scoring starts by itself, and the run options (role, coin flips, pinger).",
    },
    "robot": {
        "assets": "Every mesh file the pack uses.",
        "body": "The physics: mass, inertia, added mass, damping and buoyancy of the 6-DOF Fossen model.",
        "reference_frame": "The frame reported as \"the robot's pose\" to tasks, TF and placement.",
        "frames": "The rigid frame tree, measured from the camera-cage screw (origin). Names the centre of mass.",
        "visuals": "Meshes the viewer and the simulated cameras draw on the robot.",
        "collision_boxes": "Boxes that hit the pool walls and the course.",
        "thrusters": "The eight thrusters in actuator order, each with its delay, lag, slew and force limits.",
        "safety": "Kill and arming behaviour: start killed, zero thrust while killed, disarm on kill.",
        "sensors": "IMU, FOG, DVL, depth and both stereo cameras: rate, mount and noise.",
        "mechanisms": "Torpedo launcher, dropper, claw and magnet, with their physical parameters.",
        "scoring_envelope": "The points tasks test for \"went through the gate\" or \"surfaced\".",
    },
    "pool": {
        "assets": "Meshes for pool fittings (stairs, grates, ladders).",
        "type": "The pool model: a rectangular pool.",
        "parameters": "Size, depth (or a sloped floor profile), water density, surface pressure, current.",
        "collision_boxes": "Walls (and floor) the robot collides with, in the pool's own frame.",
        "markings": "Painted lane lines and wall targets. Data, not code: the cameras and course map draw them.",
        "water_optics": "Water colour, absorption and scattering the simulated cameras see.",
        "lighting": "Indoor or outdoor light, sun direction, glare.",
        "fixtures": "Raised or recessed fittings: stairs, grates, vents.",
    },
    "tasks": {
        "assets": "Every mesh and texture the task files use.",
        "tasks": "The task files in this course.",
        "requires": "Mechanisms a robot must have for each task (checked when a scenario is resolved).",
        "run_options": "Choices made before a run: role, coin flips, pinger, the bins' vinyl classes.",
        "scoring_rules": "Which compiled C++ rules class scores the run, and all its point values.",
        "score_rows": "The rows of the scorecard, in order.",
        "outcome_counters": "Counters shown per task: success, wrong target, blocked, miss.",
        "run_messages": "Operator messages at start and stop.",
        "ui": "How the viewer shows the run: labels, status fields, focus list.",
    },
    "task": {
        "assets": "Meshes this task uses.",
        "frames": "Named points on the prop (what mapping estimates, where the tree aims).",
        "props": "Physical things: static structures and loose objects the claw can pick up.",
        "regions": "Judged volumes: a gate opening, torpedo holes, a bin, a magnet target.",
        "events": "What the runtime reports: passes, hits, drops, contacts.",
        "scoring": "Per-task scoring hooks (the RoboSub rules do the scoring).",
    },
    "parts": {
        "tasks": "The task pack these parts belong to.",
        "textures": "Pixel maps that name each piece of the printed artwork (fire, blood, rings).",
        "visuals": "Whole meshes or materials named as parts (slalom poles, magnet covers).",
    },
    "bridge": {
        "requires_robot": "Refuses to run with any other robot pack.",
        "namespace": "Prefix for every relative topic and service: /talos.",
        "node_name": "The ROS node the simulator appears as.",
        "frame_names": "Simulator frame name to ROS frame name.",
        "clock": "/clock: 500 Hz, starting at the wall-clock time, never rewinding.",
        "thrusters": "Maps the controller's 8-float force array onto the robot pack's thrusters.",
        "tf": "Which TF frames the simulator publishes, which it only reads, and which it must never publish.",
        "kill": "Which streams carry the kill command and the kill state.",
        "reset": "Service names for the three kinds of reset.",
        "placement": "Services that move the simulated robot, and how the EKF is told about it.",
        "streams": "One entry per topic: direction, ROS type, simulator endpoint, rate and field mapping.",
        "services": "ROS services the simulator offers: reset, place, arm, fire, claw.",
        "converters": "Custom message converters (none needed for Talos).",
    },
    "equipment": {
        "assets": "Meshes for the team's gear.",
        "items": "Each item: its mesh and named frames (the tag's frame on the board).",
    },
    "labels": {
        "guide": "The human labelling guide this pack encodes.",
        "tasks_pack": "Part names are checked against this course's parts.yaml.",
        "models": "Each deployed YOLO model: camera, class list in class-id order, range limit.",
        "tasks": "Per task: which course parts become which class.",
        "export": "Minimum instance size and what to do with objects seen in pieces.",
    },
    "dataset": {
        "labels": "Which label pack to use.",
        "model": "Which model (camera + classes) the images are for.",
        "scenarios": "Courses the samples are drawn from, in turn.",
        "seed": "Makes the whole dataset reproducible.",
        "image": "Resolution, crop and JPEG quality.",
        "robot_visuals": "Draw Talos's own parts (claw, hull) when they are in view.",
        "split": "Train / validation / test fractions.",
        "tasks": "Per task: how many images and how to place the camera (sampler).",
        "background": "Images with nothing labelled in them.",
        "randomize": "Water, lighting and image effects, varied per image, grouped in named looks.",
    },
}
SKIP = {"kind", "id", "description"}


def count(v) -> str:
    if isinstance(v, list):
        return f"{len(v)} item{'s' if len(v) != 1 else ''}"
    if isinstance(v, dict):
        keys = list(v.keys())
        return ", ".join(map(str, keys[:5])) + (f" … ({len(keys)} keys)" if len(keys) > 5 else "")
    return str(v)


def summary(kind: str, key: str, v, data) -> str:
    """A one-line value summary for a top-level key."""
    try:
        if kind == "robot" and key == "body":
            p = v["parameters"]
            return f"{p['mass_kg']} kg, {p['displaced_volume_m3'] * 1000:.2f} L displaced, quadratic damping on 6 axes"
        if kind == "robot" and key == "thrusters":
            p = v[0]["parameters"]
            return f"{len(v)} × {v[0]['type']}: delay {p['delay_s']} s, rise {p['rise_time_s']} s, fall {p['fall_time_s']} s, ±{p['forward_limit_n']:g} N"
        if kind == "robot" and key == "sensors":
            return ", ".join(f"{s['id']} {s['rate_hz']:g} Hz" for s in v)
        if kind == "robot" and key == "mechanisms":
            return ", ".join(f"{m['id']} ({m['type']})" for m in v)
        if kind == "robot" and key == "frames":
            return f"{len(v['transforms'])} frames from {v['root']}; body = {v.get('body', v['root'])}"
        if kind == "scenario" and key == "task_placements":
            return ", ".join(t["task"] for t in v)
        if kind == "scenario" and key in ("pool_placement", "world_placement"):
            return json.dumps({k: list(map(float, x)) if isinstance(x, list) else x for k, x in v.items()}).replace('"', "")
        if kind == "pool" and key == "parameters":
            d = f"{v['depth_m']:.2f} m deep" + (" (sloped floor)" if "floor_profile" in v else "")
            return f"{v['length_m']:g} × {v['width_m']:g} m, {d}"
        if kind == "bridge" and key == "streams":
            pub = sum(1 for s in v if s["direction"] == "publish")
            return f"{pub} published, {len(v) - pub} subscribed"
        if kind == "bridge" and key == "services":
            return f"{len(v)} services"
        if kind == "bridge" and key == "tf":
            return f"{len(v.get('publish', []))} moving, {len(v.get('static', []))} static, {len(v.get('lookup', []))} read only"
        if kind == "tasks" and key == "tasks":
            return ", ".join(x.replace(".yaml", "") for x in v)
        if kind == "tasks" and key == "scoring_rules":
            return f"rules class '{v[0]['name']}', {len(v[0]['parameters'].get('points', {}))} point values"
        if kind == "labels" and key == "models":
            return "; ".join(f"{k}: {len(m['classes'])} classes, {m['max_range_m']:g} m" for k, m in v.items())
        if kind == "dataset" and key == "tasks":
            return ", ".join(f"{k} {t['count']}" for k, t in v.items())
        if kind == "dataset" and key == "randomize" and "environments" in v:
            return "looks: " + ", ".join(e["id"] for e in v["environments"]["list"])
    except (KeyError, TypeError, IndexError):
        pass
    return count(v)


PACK_FILES = [
    # (group, label, path)
    ("Scenario", "talos_uwrt (RoboSub pool)", "content/packs/scenarios/talos_uwrt/scenario.yaml"),
    ("Scenario", "talos_uwrt_rpac (RPAC dive well)", "content/packs/scenarios/talos_uwrt_rpac/scenario.yaml"),
    ("Robot", "talos", "content/packs/robots/talos/robot.yaml"),
    ("Pool", "robosub_2026", "content/packs/pools/robosub_2026/pool.yaml"),
    ("Pool", "rpac_divewell", "content/packs/pools/rpac_divewell/pool.yaml"),
    ("Course", "tasks.yaml", "content/packs/tasks/robosub_2026/tasks.yaml"),
    ("Course", "gate", "content/packs/tasks/robosub_2026/gate.yaml"),
    ("Course", "slalom", "content/packs/tasks/robosub_2026/slalom.yaml"),
    ("Course", "torpedo", "content/packs/tasks/robosub_2026/torpedo.yaml"),
    ("Course", "bins", "content/packs/tasks/robosub_2026/bins.yaml"),
    ("Course", "table", "content/packs/tasks/robosub_2026/table.yaml"),
    ("Course", "surface", "content/packs/tasks/robosub_2026/surface.yaml"),
    ("Course", "parts.yaml", "content/packs/tasks/robosub_2026/parts.yaml"),
    ("Bridge", "uwrt_talos", "content/packs/bridges/uwrt_talos/bridge.yaml"),
    ("Equipment", "uwrt", "content/packs/equipment/uwrt/equipment.yaml"),
    ("Labels", "uwrt", "content/packs/labels/uwrt/labels.yaml"),
    ("Dataset", "uwrt_ffc_2026", "content/packs/datasets/uwrt_ffc_2026/dataset.yaml"),
    ("Dataset", "uwrt_dfc_2026", "content/packs/datasets/uwrt_dfc_2026/dataset.yaml"),
]


def committed_text(rel: str) -> str:
    """The file as committed on main (some packs have local, uncommitted edits)."""
    return subprocess.run(["git", "-C", str(NEREUS), "show", f"HEAD:{rel}"], capture_output=True, text=True, check=True).stdout


def build_packs(files: set[str]) -> list[dict]:
    out = []
    for group, label, rel in PACK_FILES:
        assert rel in files, rel
        text = committed_text(rel)
        data = yaml.load(text)
        lines = text.splitlines()
        kind = data.get("kind")
        tops = list(data.keys())
        starts = [data.lc.key(k)[0] for k in tops]
        keys = []
        for i, k in enumerate(tops):
            if k in SKIP:
                continue
            a = starts[i]
            b = starts[i + 1] if i + 1 < len(tops) else len(lines)
            # pull leading comment lines that belong to the next key back off this block
            while b - 1 > a and (lines[b - 1].startswith("#") or not lines[b - 1].strip()):
                b -= 1
            # include comment lines right above the key
            a0 = a
            while a0 - 1 >= 0 and lines[a0 - 1].startswith("#") and (a0 - 1 > (starts[i - 1] if i else -1)):
                a0 -= 1
            body = lines[a0:b]
            more = 0
            if len(body) > 28:
                more = len(body) - 26
                body = body[:26]
            keys.append({
                "key": k, "line": a + 1, "end": b,
                "what": KEYS.get(kind, {}).get(k, ""),
                "summary": summary(kind, k, data[k], data),
                "yaml": "\n".join(body), "more": more,
            })
        out.append({
            "group": group, "label": label, "path": rel, "url": GH + rel, "kind": kind,
            "id": data.get("id"), "description": data.get("description", ""), "lines": len(lines), "keys": keys,
        })
    return out


# ---------------------------------------------------------------------------------------------- course
def yaw_rot(x, y, yaw_deg):
    c, s = math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg))
    return c * x - s * y, s * x + c * y


def quat_yaw(q):
    w, x, y, z = q
    return math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)))


def resolve(name: str, tmp: Path) -> dict:
    out = tmp / f"{name}.json"
    subprocess.run([str(NEREUS / ".venv/bin/python"), "-m", "nereus.packs", "resolve",
                    f"content/packs/scenarios/{name}", "-o", str(out)], cwd=NEREUS, check=True, capture_output=True)
    return json.loads(out.read_text())


def lane_lines(pool):
    p, m = pool["parameters"], pool.get("markings") or {}
    L, W = p["length_m"], p["width_m"]
    g = m.get("lane_grid") or {}
    inset = g.get("inset_m", 0)
    lines = []
    for axis, fam in (("x", g.get("along_x")), ("y", g.get("along_y"))):
        if not fam:
            continue
        n, s = fam["count"], fam["spacing_m"]
        extent = W if axis == "x" else L  # lines parallel to x are spread across the width
        first = fam.get("first_m", (extent - (n - 1) * s) / 2)
        for i in range(n):
            c = first + i * s
            if axis == "x":
                lines.append([[inset, c], [L - inset, c]])
            else:
                lines.append([[c, inset], [c, W - inset]])
    for ln in m.get("lines", []) or []:
        lines.append([ln["from"], ln["to"]])
    return lines


def course(res: dict, key: str, label: str) -> dict:
    sc, pool = res["scenario"], res["pool"]
    p = pool["parameters"]
    pp = sc["pool_placement"]
    ox, oy, yaw = pp["position_m"][0], pp["position_m"][1], pp["yaw_deg"]

    def to_world(x, y):
        dx, dy = yaw_rot(x, y, yaw)
        return [round(ox + dx, 3), round(oy + dy, 3)]

    L, W = p["length_m"], p["width_m"]
    outline = [to_world(*c) for c in ((0, 0), (L, 0), (L, W), (0, W))]
    lanes = [[to_world(*a), to_world(*b)] for a, b in lane_lines(pool)]
    defs = {t["id"]: t for t in res["task_definitions"]}
    tasks = []
    for tp in sc["task_placements"]:
        x, y, z = tp["position_m"]
        frames = []
        for f in defs[tp["task"]].get("frames", []):
            fx, fy = yaw_rot(f["position_m"][0], f["position_m"][1], tp["yaw_deg"])
            frames.append({"id": f["id"], "xy": [round(x + fx, 3), round(y + fy, 3)]})
        tasks.append({"task": tp["task"], "xy": [round(x, 3), round(y, 3)], "z": round(z, 3), "yaw": round(tp["yaw_deg"], 2), "frames": frames})
    eq = [{"id": e["id"], "xy": [round(v, 3) for v in e["position_m"][:2]], "z": e["position_m"][2]} for e in res["equipment"]["placed"]]
    init = sc["initial"]["position_m"]
    profile = p.get("floor_profile")
    return {
        "key": key, "label": label, "id": sc["id"], "pool": pool["id"], "pool_description": pool.get("description", ""),
        "length": L, "width": W, "depth": p["depth_m"], "sloped": bool(profile),
        "outline": outline, "lanes": lanes, "tasks": tasks, "equipment": eq,
        "start": [init[0], init[1], init[2]], "pool_placement": pp, "world_placement": sc.get("world_placement"),
    }


# ---------------------------------------------------------------------------------------------- bridge
def eol_comment(m, key):
    try:
        tok = m.ca.items.get(key)
        if tok and tok[2]:
            return tok[2].value.strip().lstrip("#").strip()
    except AttributeError:
        pass
    return ""


def build_bridge(files: set[str]) -> dict:
    rel = "content/packs/bridges/uwrt_talos/bridge.yaml"
    text = committed_text(rel)
    b = yaml.load(text)
    ns = b["namespace"]
    rates = {t["topic"]: t for t in json.loads((SITE / "public/data/rosgraph/topics.json").read_text())["topics"]}

    def absolute(name):
        return name if name.startswith("/") else f"{ns}/{name}"

    streams = []
    for s in b["streams"]:
        topic = absolute(s["topic"])
        r = rates.get(topic, {})
        fields = {}
        for k, v in (s.get("fields") or {}).items():
            if "from" in v:
                fields[k] = ("from " + str(v["from"])) + (" (mapped)" if "enum_map" in v else "")
            elif "constant" in v:
                fields[k] = f"constant {v['constant']}"
        native = s["native"]
        if native.startswith("sensor:"):
            cat = "camera" if any(c in native for c in ("ffc", "dfc")) else "sensor"
        elif native.startswith("command:") or native.startswith("estimate:"):
            cat = "command"
        else:
            cat = "state"
        streams.append({
            "id": s["id"], "dir": s["direction"], "topic": topic, "type": s["message_type"], "native": native,
            "rate": s["rate_hz"], "frame": s.get("frame_id", ""), "fields": fields,
            "accept_if": [dict(x) for x in s.get("accept_if", [])] or None,
            "image": dict(s["image"]) if "image" in s else None,
            "point_cloud": dict(s["point_cloud"]) if "point_cloud" in s else None,
            "format": s.get("format"),
            "note": eol_comment(s, "topic") or eol_comment(s, "native") or eol_comment(s, "rate_hz") or eol_comment(s, "accept_if"),
            "line": s.lc.line + 1, "cat": cat,
            "measured": r.get("rate_hz_pass2"), "measured1": r.get("rate_hz"), "bytes": r.get("mean_bytes"),
            "subs": [x for x in r.get("subscribers", []) if "physics_simulator" not in x],
            "pubs": [x for x in r.get("publishers", []) if "physics_simulator" not in x],
        })
    services = [{"id": s["id"], "service": absolute(s["service"]), "type": s["service_type"], "action": s["action"],
                 "note": eol_comment(s, "action") or eol_comment(s, "service"), "line": s.lc.line + 1} for s in b["services"]]
    tf = {
        "publish": [dict(x) for x in b["tf"]["publish"]],
        "static": [{"parent": x["parent"], "child": x["child"], "truth": bool(x.get("truth"))} for x in b["tf"]["static"]],
        "lookup": [dict(x) for x in b["tf"]["lookup"]],
        "never_publish": list(b["tf"]["never_publish"]),
    }
    clock = {k: (dict(v) if hasattr(v, "items") else v) for k, v in b["clock"].items()}
    return {"url": GH + rel, "namespace": ns, "node": b["node_name"], "clock": clock, "thrusters": list(b["thrusters"]["order"]),
            "streams": streams, "services": services, "tf": tf}


# ---------------------------------------------------------------------------------------------- tests
SUITES = [
    ("libraries/simulation", "Simulation", "Marine dynamics, thruster delay and lag, RK4 plant, box contacts, sloped floors, payloads. Includes contact and dynamics checks against recordings from the old simulator."),
    ("libraries/sensors", "Sensors", "IMU, attitude, FOG, DVL, depth and pressure models: noise, bias, random walk, mounting offsets, scheduling."),
    ("libraries/session", "Session", "The whole tick: mechanisms, payloads, Bullet prop worlds, task observers and the RoboSub 2026 rules. TalosReference replays the old simulator's Talos trajectories."),
    ("libraries/cameras", "Cameras", "Intrinsics, projection and the stereo depth-noise model."),
    ("libraries/session_cameras", "Session cameras", "Scheduled on-demand capture, queues and seeds, on the GPU path."),
    ("libraries/rendering", "Rendering", "Offscreen EGL rendering, pool scene, assets, rendered images."),
    ("libraries/pack_scene", "Pack scene", "Building the drawable scene from packs: lane lines, fixtures, sloped floors."),
    ("libraries/datasets", "Datasets", "Samplers, the renderer's acceptance checks and output files for synthetic datasets."),
    ("libraries/spatial", "Spatial", "Poses and frame maths."),
    ("integrations/ros2/bridge", "ROS bridge", "Field mapping, QoS, kill and arming services, cameras, records. real_pack_test drives the real Talos packs."),
    ("integrations/ros2/viewer", "Viewer", "Panels, the prior map editor, camera cards, input and themes."),
]


def build_tests() -> dict:
    rows = []
    for d, name, what in SUITES:
        n = 0
        for f in glob.glob(str(NEREUS / d / "**/*.cpp"), recursive=True):
            if "/tests/" in f:
                n += len(re.findall(r"^\s*TEST(?:_F|_P)?\(", Path(f).read_text(), re.M))
        rows.append({"dir": d, "name": name, "what": what, "tests": n, "lang": "C++ (GoogleTest)", "url": f"https://github.com/osu-uwrt/nereus/tree/main/{d}"})
    n = 0
    for f in glob.glob(str(NEREUS / "tests/python/*.py")):
        n += len(re.findall(r"^\s*def test_", Path(f).read_text(), re.M))
    rows.append({"dir": "tests/python", "name": "Packs and datasets (Python)", "what": "Pack schemas and validation errors, resolving, set-course edits, dataset planning and export.", "tests": n, "lang": "Python (pytest)", "url": "https://github.com/osu-uwrt/nereus/tree/main/tests/python"})
    return {"rows": rows}


# ---------------------------------------------------------------------------------------------- samples
SAMPLES = [
    ("ffc", "torpedo_005159"), ("ffc", "gate_001234"), ("ffc", "slalom_003156"), ("ffc", "surface_006437"),
    ("ffc", "bins_008312"), ("dfc", "table_006422"), ("dfc", "bins_001313"), ("ffc", "background_009640"),
]


def build_samples() -> dict:
    out = []
    names = {}
    for cam, name in SAMPLES:
        root = HOME / f"datasets/robosub2026_{cam}"
        if cam not in names:
            m = re.search(r"names:\s*(\[.*\])", (root / "yolo-seg/data.yaml").read_text())
            names[cam] = json.loads(m.group(1))
        rec = json.loads((root / f"render/records/{name}.json").read_text())
        label = next(iter(glob.glob(str(root / f"yolo-seg/labels/*/{name}.txt"))), None)
        split = Path(label).parent.name if label else None
        polys = []
        if label:
            for line in Path(label).read_text().splitlines():
                v = line.split()
                if not v:
                    continue
                pts = [round(float(x), 4) for x in v[1:]]
                polys.append({"cls": names[cam][int(v[0])], "pts": pts})
        img = Image.open(root / f"render/images/{name}.jpg").convert("RGB")
        w, h = img.size
        img = img.resize((960, round(960 * h / w)), Image.LANCZOS)
        dest = IMG / f"sample-{cam}-{name}.webp"
        img.save(dest, "WEBP", quality=78, method=6)
        out.append({"cam": cam, "name": name, "task": rec["task"], "environment": rec["environment"],
                    "scenario": rec["scenario"], "split": split, "img": f"img/nereus/{dest.name}",
                    "w": img.size[0], "h": img.size[1], "polys": polys,
                    "instances": len(rec["instances"])})
    counts = {}
    for cam in ("ffc", "dfc"):
        root = HOME / f"datasets/robosub2026_{cam}"
        counts[cam] = {s: len(glob.glob(str(root / f"yolo-seg/images/{s}/*"))) for s in ("train", "val")}
        per = {}
        for f in glob.glob(str(root / "render/images/*.jpg")):
            t = Path(f).stem.rsplit("_", 1)[0]
            per[t] = per.get(t, 0) + 1
        counts[cam]["per_task"] = dict(sorted(per.items()))
        counts[cam]["classes"] = names.get(cam)
    return {"samples": out, "counts": counts}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    IMG.mkdir(parents=True, exist_ok=True)
    files = tracked()
    (OUT / "packs.json").write_text(json.dumps(build_packs(files), separators=(",", ":")))
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        a = course(resolve("talos_uwrt", tmp), "robosub", "RoboSub pool")
        b = course(resolve("talos_uwrt_rpac", tmp), "rpac", "RPAC dive well")
    (OUT / "course.json").write_text(json.dumps({"scenarios": [a, b]}, separators=(",", ":")))
    (OUT / "bridge.json").write_text(json.dumps(build_bridge(files), separators=(",", ":")))
    (OUT / "tests.json").write_text(json.dumps(build_tests(), separators=(",", ":")))
    (OUT / "samples.json").write_text(json.dumps(build_samples(), separators=(",", ":")))
    for f in sorted(OUT.glob("*.json")):
        print(f.name, f.stat().st_size)


if __name__ == "__main__":
    main()
