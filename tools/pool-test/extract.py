#!/usr/bin/env python3
"""Data for pool-test.html, from the team's repos and the pre-test tool.

    python3 tools/pool-test/extract.py      # writes public/data/pool-test/pool-test.json

Reads (all local checkouts):
  ~/osu-uwrt/release                       git log + tags of riptide_release (the pool-test diary)
  .../riptide_core/riptide_descriptions/config/talos.yaml      thruster names and poses
  .../riptide_control/riptide_controllers/models/complete_system/send_thruster_cmd_canbus.c   the thruster test
  .../riptide_launch/remote_launch/launches/talos_launch_mpc.yaml   the launcher's pool list
  ~/pretest_checks                         check ids/titles (@check decorators) and robots/talos/robot.yaml
  ~/robot/mpc_ident/runs/talos_20261026_*  a tethered and an untethered identification session (report.yaml)
  tools/pool-test/checklist.yaml           the hand-written checklist (why + command per step)
"""
import json
import math
import re
import subprocess
from pathlib import Path

import yaml

HOME = Path.home()
REL = HOME / "osu-uwrt/release"
SRC = REL / "src"
PRE = HOME / "pretest_checks"
RUNS = HOME / "robot/mpc_ident/runs"
HERE = Path(__file__).resolve().parent
OUT = HERE.parents[1] / "public/data/pool-test/pool-test.json"
G = 9.80665


# ---------------------------------------------------------------- the release log
def kind(msg: str) -> str:
    m = msg.lower()
    if re.search(r"robosub|\brs ?\d\d\b|\brs\d\d", m):
        return "comp"
    if "lake" in m:
        return "lake"
    if re.search(r"\bpost\b|post[- ]", m) or m.startswith(("changes after", "working code from", "3 for 3")):
        return "post"
    if re.search(r"\bpre\b|pre[- ]|\bprep\b|before .*test|configure release for|ready for hil", m):
        return "pre"
    return "other"


def release_log():
    out = subprocess.run(["git", "-C", str(REL), "log", "--format=%h|%ad|%s", "--date=short", "origin/master"],
                         capture_output=True, text=True, check=True).stdout
    commits = []
    for line in out.strip().splitlines():
        h, d, s = line.split("|", 2)
        commits.append({"h": h, "d": d, "s": s, "k": kind(s)})
    tags = subprocess.run(["git", "-C", str(REL), "for-each-ref", "--format=%(refname:short)|%(creatordate:short)|%(objectname:short)",
                           "refs/tags"], capture_output=True, text=True, check=True).stdout
    tag_list = []
    for line in tags.strip().splitlines():
        name, d, h = line.split("|")
        tag_list.append({"name": name, "d": d, "h": h})
    tag_list.sort(key=lambda t: t["d"])
    return {"commits": commits[::-1], "tags": tag_list}


# ---------------------------------------------------------------- thrusters and the thruster test
def rpy_x(r, p, y):
    """Body x axis rotated by roll-pitch-yaw (ROS convention R = Rz(y) Ry(p) Rx(r))."""
    # R * [1,0,0] = first column of R
    return [math.cos(y) * math.cos(p), math.sin(y) * math.cos(p), -math.sin(p)]


def thrusters():
    cfg = yaml.safe_load((SRC / "riptide_core/riptide_descriptions/config/talos.yaml").read_text())
    out = []
    for i, t in enumerate(cfg["thrusters"]):
        x, y, z, r, p, yw = t["pose"]
        d = rpy_x(r, p, yw)
        out.append({"i": i, "name": t["name"], "pos": [x, y, z], "axis": [round(v, 3) for v in d]})
    return out


def thruster_test():
    c = (SRC / "riptide_control/riptide_controllers/models/complete_system/send_thruster_cmd_canbus.c").read_text()
    body = c[c.index("#ifdef ENABLE_THRUSTER_TEST"):]
    cmd = int(re.search(r"cmd\[i\] = (\d+);", body).group(1))
    loops = int(re.search(r"for \(int j = 0; j < (\d+); j\+\+\)", body).group(1))
    sleep_ms = int(re.search(r"usleep\((\d+) \* 1000\)", body).group(1))
    start = c[:c.index("#ifdef ENABLE_THRUSTER_TEST")].count("\n") + 1
    main_line = start + body[: body.index("int main(void)")].count("\n")
    return {
        "rpm": cmd,
        "window_s": loops * sleep_ms / 1000,
        "frame_ms": sleep_ms,
        "line": main_line,
        "lines": {
            "init": "Initializing CAN socket",
            "testing": re.search(r'printf\("(Testing Thruster )%d', body).group(1),
            "stop": re.search(r'const char msg\[\] = "([^"\\]+)', body).group(1).strip(),
        },
    }


# ---------------------------------------------------------------- launcher list for the pool
def launcher_entries():
    text = (SRC / "riptide_launch/remote_launch/launches/talos_launch_mpc.yaml").read_text()
    text = "\n".join(l for l in text.splitlines() if not l.strip().startswith("#"))
    entries = re.findall(r'package:\s*"([^"]+)",\s*file:\s*"?([\w.]+)"?', text)
    return [{"package": p, "file": f} for p, f in entries]


# ---------------------------------------------------------------- pretest_checks
def pretest():
    checks = []
    for f in sorted((PRE / "pretest_checks/stages").glob("*.py")):
        for m in re.finditer(r'@check\(STAGE, "(\w+)", "([^"]+)"', f.read_text()):
            checks.append({"stage": f.stem, "id": m.group(1), "title": m.group(2), "built": True})
    planned = (PRE / "pretest_checks/stages/planned.py").read_text()
    for stage, body in re.findall(r'"(\w+)": \[(.*?)\]', planned, re.S):
        for cid, title in re.findall(r'\("(\w+)", "([^"]+)"\)', body):
            checks.append({"stage": stage, "id": cid, "title": title, "built": False})
    prof = yaml.safe_load((PRE / "robots/talos/robot.yaml").read_text())
    return {
        "checks": checks,
        "rates": prof["rates"]["min_hz"],
        "drift": prof["drift"],
        "gyro_warn_deg_s": prof["gyro"]["warn_bias_deg_s"],
        "poweron_delay_s": prof["thrusters"]["poweron_delay_s"],
        "battery_min_v": prof["power"]["battery_min_v"],
        "dvl": {k: prof["dvl"]["expected"][k] for k in ("dvlSpeedOfSound", "dvlSalinity", "dvlCalculateSoundSpeed")},
    }


# ---------------------------------------------------------------- tethered vs untethered identification
def tether():
    out = {}
    for name, label in (("talos_20261026_202235", "tethered"), ("talos_20261026_204748", "untethered")):
        rep = yaml.safe_load((RUNS / name / "report.yaml").read_text())["statics"]
        model = yaml.safe_load((RUNS / name / "model_identified.yaml").read_text())
        m = model["mass"]
        out[label] = {
            "session": name,
            "net_buoyancy_N": round(rep["net_buoyancy_N"] - m * G, 2),
            "cob_x_mm": round(rep["cob_relative"][0] * 1000, 1),
            "cob_y_mm": round(rep["cob_relative"][1] * 1000, 1),
            "cob_z_mm": round(rep["cob_relative"][2] * 1000, 1),
            "res_force_N": round(rep["residual_force_rms_N"], 2),
            "res_torque_Nm": round(rep["residual_torque_rms_Nm"], 2),
            "mass": m,
        }
    return out


def main():
    data = {
        "generated": subprocess.run(["date", "+%Y-%m-%d"], capture_output=True, text=True).stdout.strip(),
        "release": release_log(),
        "thrusters": thrusters(),
        "thruster_test": thruster_test(),
        "launcher": launcher_entries(),
        "pretest": pretest(),
        "tether": tether(),
        "checklist": yaml.safe_load((HERE / "checklist.yaml").read_text()),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, indent=1))
    n = sum(len(p["steps"]) for p in data["checklist"])
    print(f"wrote {OUT}: {len(data['release']['commits'])} commits, {n} checklist steps")


if __name__ == "__main__":
    main()
