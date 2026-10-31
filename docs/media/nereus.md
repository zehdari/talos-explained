# Nereus media library

Everything here was captured on 2026-10-30 from one machine (Cam-PC) running the full Talos stack in the
Nereus simulator. Simulation only. Nothing on the robot was touched.

- Images and videos: `public/media/nereus/`. In HTML use `/talos-explained/media/nereus/<file>`; in JS use
  `import.meta.env.BASE_URL + 'media/nereus/<file>'`.
- Data: `public/data/rosgraph/`.
- The scripts that made all of it: `tools/nereus-media/`.

## How it was run

```sh
ros2 run rmw_zenoh_cpp rmw_zenohd        # a router was already running on this machine; it was reused
export RMW_IMPLEMENTATION=rmw_zenoh_cpp ROS_DOMAIN_ID=61 DISPLAY=:0 XDG_CONFIG_HOME=/tmp/nmedia/cfg
ros2 launch nereus sim.launch.py active_control_model:=mpc mpc_model:=sim close_with_viewer:=false
```

(`tools/nereus-media/env.sh` and `launch_sim.sh`.) Here is why each setting was used:

- `ROS_DOMAIN_ID=61` kept this run apart from other jobs on the machine.
- `XDG_CONFIG_HOME` gave the viewer a fresh config, so every screenshot shows the default layout and theme. The
  user's own saved layout was not touched.
- `close_with_viewer:=false` let the viewer be restarted without stopping the stack. The only other difference
  from the documented command is `output:=`.
- Pool: the default `robosub` (scenario pack `content/packs/scenarios/talos_uwrt`, "Talos · RoboSub 2026").
- The viewer window was 1600x1000 on the desktop's real GPU. The default "Heat sheet" theme is used except in
  one screenshot.
- Recordings were made with `ffmpeg -f x11grab` of the window area. Screenshots use the same method (one frame).
- The machine was heavily loaded the whole time: a Windows VM, another agent compiling, and GPU jobs. Because of
  this the simulator ran at about 0.95x real time (sim time / wall time measured over the tree run). It also
  logged `falling behind wall time` and `MPC solve ... exceeds the control period` (50 ms). Do not quote these
  numbers as robot performance.

The autonomy run: in the viewer, Enable → Autonomy panel → `RepairCompMpcTree.xml` → Start. The camera was put
behind Talos with Ctrl+P "Turn with the vehicle". That toggle is a local, uncommitted Nereus viewer change. It is
in the built binary but not on `main`, so don't tell readers it exists until it is pushed.

The tree ran to `Tree ended with status SUCCESS`. Its order was: kill switch wait → dive → gate → slalom →
random pinger (skipped: Nereus does not simulate acoustics) → torpedo → table (claw) → bins (droppers, magnets) →
return through the gate → KillController.

## Videos (H.264, 1280 px wide, no audio, `+faststart`)

| File | Shows | Notes |
| --- | --- | --- |
| `tree-run-behind.mp4` (+ `.jpg` poster) | 42 s, the viewer at **6x**: Talos running RepairCompMpcTree from the kill-switch release through gate, slalom, the pinger step, torpedo (it hits the large fire hole) and the start of the table task (pill picked up and dropped on the helmet). The camera follows behind Talos. MPC path and thrust arrows are on, and the camera cards show the ROS images. | A burned-in label names the current task. 4.6 MB. Cut from the 14.5 min raw recording `/tmp/nmedia/rec/tree.mkv`, which also holds the rest of the table, the bins, the magnets and the return home if a longer cut is wanted (see "Timings" below). |
| `viewer-tour.mp4` (+ `.jpg`) | 55 s UI tour, 1.4x, with the mouse visible and a caption for each step. Steps: pool view and panels → Ctrl+P typed move (`turn left 45 forward 2`) → thrust arrows and MPC path → camera card switches (RGB/Depth, Truth/ROS) → **Main view** (look through the forward camera) → Vision: YOLO point cloud → TF frames → Layouts (wide view, camera wall, standard) → run scorecard → prior map editor (Edit map). | 3.2 MB. Scripted with `tools/nereus-media/viewer_tour.sh`. The depth card shows black here (see "Gotchas"). |
| `cameras-yolo.mp4` (+ `.jpg`) | 53 s at **10x** sim time, the whole tree run. The left side (large) is the detector's annotated stream `/talos/yolo_orientation/annotated/compressed`: boxes, class and score, switching between ffc and dfc as the tree asks. The right side shows the raw forward (ffc) and down (dfc) camera images and the current task. | 6.8 MB. Built from a rosbag by `tools/nereus-media/camera_video.py`. The annotated stream has a zero header stamp, so its frames are placed by receipt time, mapped to sim time through the ffc images. Expect up to about 0.1 s misalignment with the raw images. |

## Screenshots: whole window (1600x1000 webp)

| File | Shows |
| --- | --- |
| `viewer-overview.webp` | Standard layout, robot enabled, holding in front of the torpedo board. The front camera card shows the board. The Vision panel is open. Thrust arrows are on. The best "this is the viewer" picture. |
| `viewer-startup-killed.webp` | The viewer right after launch: green **Enable**, "Robot: killed", the Motion table showing the pose with `--` for the commanded values, and a top-down view of Talos at the start pose by the AprilTag board. |
| `viewer-tree-running.webp` | The tree driving: the Motion panel says "Autonomy owns motion" (manual control locked), the Autonomy panel shows Running with the execution stack, the actuators are armed, and the front camera card is close on the torpedo board. |
| `viewer-table-task.webp` | Talos over the table during the claw task. The pose gizmo is visible, and the down camera card shows a table item (plug). The run clock is running. |
| `viewer-mpc-path-thrust.webp` | Talos travelling (from `go 15.5 2.8 -1.4 0` typed in Ctrl+P) with **MPC path** and **Thrust** on. The Motion table shows a large commanded-vs-actual error while it moves. |
| `viewer-pose-gizmo.webp` | The pose gizmo (arrows to move, rings to turn) close up, with the gate behind. |
| `viewer-point-clouds.webp` | YOLO detections point cloud and front camera point cloud drawn in the pool view (Vision panel ticks visible), in front of the torpedo board. |
| `viewer-point-clouds-close.webp` | The same, closer: the front camera's depth cloud as a white sheet on the torpedo board. |
| `viewer-yolo-point-cloud.webp` | Only the YOLO detections cloud: coloured points on the detected torpedo-board symbols. |
| `viewer-tf-axes.webp` | **TF** toggle on: frame axes drawn at Talos and the course. |
| `viewer-tf-frames.webp` | The TF frames window (frame tree: `tag36h11:0`, `world` → `map`, `odom` → `talos/base_link`, `simulator/talos/base_link`; axis length; show/hide per frame) over the pool view with axes drawn. |
| `viewer-display-window.webp` | The Display window: water, walls, floor, tiles, AprilTag board, Course source (Auto / Mapping ghost / meshes), Localization estimate (robot ghost, control gizmo and follow source), lighting. |
| `viewer-scorecard.webp` | RoboSub 2026 scorecard window after the run: coin-flip role, Start/Stop/Reset, status lines, score adjustment, task status JSON, magnet targets GREEN, and recent events (dropper/magnet). **Reads 0.0 points**: see the notes on scoring. |
| `viewer-prior-map-editor.webp` | Edit map (Ctrl+M): the "EDITING PRIOR MAP · config.yaml · simulator paused" bar, the Map objects table (44 objects from riptide_mapping2 with x/y/z/yaw relative to their parents), the 2D chart of the pool with the props, and the Inspector (map origin on the AprilTag). |
| `viewer-layout-wide.webp` | Layout → Wide view: cameras and course map in a strip under the pool view. |
| `viewer-layout-camera-wall.webp` | Layout → Camera wall: large camera feeds. |
| `viewer-theme-timing-board.webp` | The night theme "Timing board" (dark), for contrast with the default. The site's theme is light, so use this one only if a chapter talks about themes. |

## Screenshots: crops of panels and parts

| File | Size | Shows |
| --- | --- | --- |
| `viewer-command-bar-killed.webp` | 1600x87 | Command bar while killed: green Enable, "Robot: killed", FOG/DVL/CPU/PORT/STBD chips, run clock and points, Edit map, `PHYSICS CONNECTED`. |
| `viewer-command-bar-enabled.webp` | 1600x87 | The same while enabled: red KILL, "Robot: enabled". |
| `panel-motion-position.webp` | 400x520 | Motion panel in Position control: map-frame table (Actual / Commanded / Error / Target for X, Y, Z, roll, pitch, yaw), Current / Command / Dive in place, Pose gizmo, Zero roll & pitch, Drive with keys. |
| `panel-motion-autonomy-owns.webp` | 400x520 | Motion panel while a tree runs: "Autonomy owns motion", inputs greyed out. |
| `panel-autonomy-tree-list.webp` | 400x913 | Autonomy tree picker open: every tree in `riptide_autonomy/trees` (ActuatorTrees … test_comp_tree). |
| `panel-mapping.webp` | 400x580 | Mapping panel: Tag calibration (parent `world`, tag frame `estimated_origin_frame`, samples, Calibrate), Mapping target (Automatic, Lock map, Set mapping target, Reset mapping). |
| `panel-vision.webp` | 400x420 | Vision panel: Show detections, Placement, Keep detections, point-cloud ticks (YOLO / front / down) and the legend (solid = sim truth, cyan = estimate, dashed = approximate). |
| `viewer-camera-cards.webp` | 432x640 | Both camera cards (ZED X Mini, 1920x1200, live rate) with RGB/Depth, Truth/ROS, Main view; the ffc card shows the torpedo board. |
| `panel-course-map.webp` | 432x590 | Course map: top-down pool with task footprints, Talos marker and its track. |
| `panel-recording.webp` | 432x590 | Recording: SVO path on the robot, Add date and time, Start/Stop FFC and DFC (service unavailable in sim), Capture image. |
| `panel-bagging.webp` | 432x590 | Bagging: Robot / This computer, ssh `ros@orin2` (shows "Can't reach": the robot is offline), folder, name, All / Selected topics. |
| `panel-electrical.webp` | 432x590 | Electrical: Power buttons (red ones confirm: Cycle computer, Cycle robot, Kill robot power), IMU mag cal / registers, FOG. All unavailable in sim. |
| `panel-actuators.webp` | 432x590 | Actuators, disarmed: Claw/Torpedo Connected, Arm, Fire torpedo, Drop marker, Open/Close/Stop claw, Reload, markers and torpedoes remaining. |
| `panel-actuators-armed.webp` | 432x273 | Actuators armed during the tree (Disarm, Fire torpedo enabled). |
| `panel-scorecard.webp` | 730x900 | The scorecard window alone. |
| `viewer-simulation-window.webp` | 346x268 | Simulation window: speed (>0 to 10x), Apply / Pause / 1x, Sync sim, Reset sim. |
| `viewer-scene-settings.webp` | 620x250 | Scene settings → Water appearance: caustics, surface, shadows, lighting preset, sun azimuth/elevation ("Observer settings only: the bridge renders the robot cameras from the pool pack"). |
| `viewer-help-shortcuts.webp` | 612x890 | F1 Controls & shortcuts: pool view mouse, typed moves, Drive with keys, Run tree, "Enable / KILL never from the keyboard", Ctrl+P/F/M/S, F12, layouts. |
| `viewer-search-command.webp` | 520x75 | The Ctrl+P box with `go 15.5 2.8 -1.4 0` typed. |
| `viewer-layout-menu.webp` | 320x360 | Layout menu: Standard / Wide view / Camera wall (Ctrl+Shift+1/2/3), saved layouts, Lock layout, Maximize pool view. |

## Simulator camera stills (YOLO annotated stream, 1280x800 webp)

These are from `/talos/yolo_orientation/annotated/compressed` during the tree run. The renderer is Nereus; the
boxes, classes and scores come from the real detector (`tensor_detector` `yolo_orientation.py`, TensorRT engines
`rs26_ffc_finals` / `dfc_rs_26`).

| File | Shows |
| --- | --- |
| `yolo-ffc-slalom.webp` | Forward camera: slalom poles boxed as `slalom`. |
| `yolo-ffc-torpedo.webp` | Forward camera close on the torpedo board: `fire 0.97`, `fire_engine 0.97`, two `circle` 0.96/0.97, `blood 0.96`. |
| `yolo-dfc-table.webp` | Down camera over the table: `plug 0.92`, `nut_and_bolt 0.91`, `helmet 0.98`. |
| `yolo-dfc-table-items.webp` | Down camera, the other end of the table: `warning 0.94`, `pill 0.86`, `nut_and_bolt 0.87`, `plug 0.88` (a bandage-like item unboxed). |
| `yolo-dfc-bin.webp` | Down camera over the bins: the vinyl in one bin boxed `fire 0.97`. |
| `yolo-ffc-magnet.webp` | Forward camera at the bins: a magnet on the bar boxed `magnet 0.90`. |

## Data (`public/data/rosgraph/`)

| File | Contents |
| --- | --- |
| `rosgraph.json` | All 28 nodes, captured during the tree run, each with publishers, subscribers, services, clients, action servers and action clients, with types. The six standard parameter services, `/rosout` and `/parameter_events` are dropped, and so are this capture's own tools (`media_*`, `rosbag2_recorder`). Every node also has `group` (simulator / operator / control / navigation / perception / autonomy / acoustics / internal), `runs` (sim only / robot / operator laptop), `package`, `launch` (a GitHub link to the launch file that starts it, checked to exist on the branch) and a one-line `role`. |
| `topics.json` | All 143 topics: type, publishers, subscribers, publisher QoS, `latched`, `sim_only` (published only by the simulator), and `mean_bytes`. Two measured rates: `rate_hz` was taken before the tree run and `rate_hz_pass2` after it, each topic alone for 3 s. `sim_configured_hz` is the rate in Nereus `bridge.yaml`. |
| `tf.json` | The TF tree: 89 parent→child edges, each static or not, with its rate and a sample transform, listened to for 15 s. The roots are `world` and `tag36h11:0`. |
| `params_mpc.json`, `params_mapping.json`, `params_detector.json`, `params_ekf.json`, `params_autonomy.json`, `params_controller_overseer.json`, `params_apriltag.json` | `ros2 param dump` of each node as it ran in sim. Note that `use_sim_time` is true for most nodes and false for the detector. In `params_mpc.json` the vehicle and hydrodynamics paths point at the generated sim plant (`/tmp/...sim.mpc/`), because this run used `mpc_model:=sim`. |
| `launch_log.txt` | The first 200 lines of the sim launch's terminal output (home directory shortened to `~`). |
| `tree_run.json` | The tree-run timeline in sim seconds: top-level task changes, every simulator task event (torpedo hit `fire_large`; claw moved pill→helmet, nut_and_bolt→warning, plug→warning; droppers into `bin_vinyl2`, `bin_vinyl3`; magnets on `magnet_target1`/`2`) and the last scorecard JSON. |

## Facts verified in this run (useful for chapter text)

**How Nereus is built** (README, `docs/viewer.md`, launch files)

- There are three parts: `nereus-sim` (the simulator), `nereus-viewer` (the pool viewer and operator UI) and
  packs (YAML in `content/packs/`: robot, pool, tasks, bridge, equipment, scenario).
- The simulator, the robot stack and the viewer share no code, only ROS 2 topics.
- `sim.launch.py` resolves the scenario pack into one `resolved.json`. It then starts the simulator under
  `sim_supervisor.py` (which can restart it in another pool), the UWRT stack (riptide_bringup2 `bringup.launch.py`
  with `hardware:=none`, plus the AprilTag detector) and the viewer.
- With `mpc_model:=sim`, `mpc_sim_model.py` writes the MPC's vehicle, hydrodynamics and `mpc.yaml` from this
  run's plant.
- On the real robot, `robot.launch.py` runs the viewer alone. It loads the scenario itself and draws Talos at the
  EKF estimate.
- The simulator plays the part of the hardware. It publishes `vectornav/imu` (configured 400 Hz, measured ~400),
  `gyro/twist` (FOG, 500 Hz), `dvl_twist` (8 Hz), `depth/pose` (20 Hz) and both ZED X Mini cameras (1920x1200,
  15 Hz RGB). It also publishes `state/kill`, actuator state, thruster telemetry, `simulator/ground_truth`
  (100 Hz) and the scoring topics, and it subscribes to `thruster_forces` and the actuator commands.
- All of that wiring is in `content/packs/bridges/uwrt_talos/bridge.yaml`. Sensor noise and rates come from
  `content/packs/robots/talos/robot.yaml`, and its comments cite "2026-10-03 pool bags".
- The simulator's truth pose is a separate TF branch, `world → simulator/talos/base_link`, so truth and the EKF's
  `odom → talos/base_link` can be drawn side by side.
- The MPC log in sim says "Hardware output disabled (the model has no hardware section); publishing
  thruster_forces only". It also logs "MPC ready: 8 thrusters, 0.050 s x 30 stages, actuator delay 0.030 s" and
  "State feedback: sensors (IMU, FOG, DVL, depth; EKF anchors x/y + heading)".
- Detector: `ffc_threshold` 0.65, `dfc_threshold` 0.8. The models are `rs26_ffc_finals.pt` and `dfc_rs_26.pt`,
  run as TensorRT `.engine` files. `set_camera_is_dfc` switches the active camera.
- Measured on this loaded machine:
  - `odometry/filtered` 30 Hz;
  - `odom → talos/base_link` TF about 20 Hz;
  - mapping's object frames about 7.5 Hz;
  - `thruster_forces` about 20 Hz (matches the 0.05 s control period);
  - `detected_objects` 9 to 11 Hz.

**How the viewer works** (seen in use)

- The command bar has Enable/KILL, the robot state, the FOG/DVL/CPU/battery chips (grey in sim, except DVL
  "Lock"), the run clock and points, Edit map, and the pose-source pill (`PHYSICS CONNECTED` in sim).
- Enable latches. While a tree runs, the Motion panel says "Autonomy owns motion" and manual control is locked.
- The help window says "Enable / KILL never from the keyboard". The viewer is the software-kill operator (kill
  slot 1, per the user's notes in memory).
- Ctrl+P takes typed moves (`forward 2`, `turn left 45`, `go x y z yaw`) and runs trees.
- Each camera card switches between **Truth** (the viewer renders the scene at the true camera pose) and **ROS**
  (the images the stack actually receives). The screenshots use ROS.
- Edit map edits riptide_mapping's `config.yaml`. In this run it loaded 44 objects from `/talos/riptide_mapping2`
  and paused the simulator.
- The scorecard's "Start run" resets the props. This appears as a `tasks reset` event at 127.8 s in
  `tree_run.json`; that reset was caused by this capture, not by the tree.

**DoTask monitor port** (worth a line in a debugging chapter)

- `doTask` always builds a Groot `PublisherZMQ`, even with `enable_zmq: false`. See
  [DoTask.cpp line 214](https://github.com/osu-uwrt/riptide_autonomy/blob/autonomy-mapping/src/riptide_autonomy/DoTask.cpp#L214).
- So a second doTask on the same computer, even in another ROS domain, fails every tree with "Error occurred
  while ticking tree. Aborting tree! Error: Address already in use" (ports 1666/1667).
- After that failure, the same process fails again with "Only one instance of PublisherZMQ shall be created".
  The fix is to restart doTask.
- This happened here because another job on the machine had its own doTask running.

**Nodes per side** (from `rosgraph.json`)

- Sim only: `physics_simulator`, `sim_supervisor`.
- Operator laptop, in sim and on the robot: `nereus_viewer`, `viewer_panels`, `viewer_plots`.
- Everything else is the robot stack, launched as on the robot except for the hardware drivers.
- `/Cam_PC/autonomy/bag_trigger` is named after the host computer, by DoTask.

## Gotchas and things I could not show

- **Depth card**: the camera card's Depth view rendered all black in this setup, in both Truth and ROS. The depth
  topics were publishing (measured 3 to 12 Hz, 9.2 MB frames). I did not investigate the cause, and there is no
  depth screenshot.
- **Covariance ellipsoids**: these are on in some shots, but at pool scale they are too small to see. There is
  no covariance screenshot.
- **Score 0.0**: the scorecard said "Breach outside octagon; scoring ended" from before the tree started, and the
  run was started by hand after the gate, so the points stay at 0. Use the task events instead.
- **Raw material is kept** in `/tmp/nmedia/` (large; delete when the chapters are done):
  - `rec/tree.mkv`: the full tree run, 1600x1000;
  - `rec/tour.mkv`;
  - `rec/treebag`: a 1.5 GB bag with both cameras, the YOLO stream, detections, odometry, truth, clock and tree
    stack;
  - `rec/tree_log.jsonl`;
  - `shots/*.png`: every full-resolution screenshot, including unused ones;
  - `run1/sim/`: Nereus run records, including `summary.json`.

### Timings in the raw tree recording (`/tmp/nmedia/rec/tree.mkv`, seconds from its start)

| Seconds | Step |
| --- | --- |
| 33.7 | Waiting for the kill switch |
| 45.6 | Run starts |
| 47.0 | Dive |
| 49.1 | Gate |
| 74.0 | Slalom |
| 110.1 | Pinger |
| 146.3 | Torpedo |
| 176.1 | Torpedo fired |
| 183.9 | Table begins |
| 271 to 376 | Three claw moves |
| 445.5 | Bins |
| 457 / 477 | Droppers |
| 504 / 541 | Magnets |
| 551.1 | Return home |
| 610.0 | KillController |

## Scripts (`tools/nereus-media/`)

| Script | What it does |
| --- | --- |
| `env.sh`, `launch_sim.sh` | Environment and launch as used. |
| `viewer_ui.sh` | xdotool helpers. Screenshots use `ffmpeg x11grab`, not ImageMagick `import`: `import -window` grabs the X server and froze the desktop once. |
| `viewer_tour.sh` | The scripted tour. |
| `dump_graph.py` | rclpy graph APIs → `rosgraph_raw.json` / `topics_graph.json`. |
| `measure_rates.py` | One topic at a time. |
| `build_rosgraph.py` | Adds the groups, launch links, bridge rates and both passes → `rosgraph.json`, `topics.json`. |
| `dump_tf.py` | Writes `tf.json`. |
| `tree_logger.py` | Logs the execution stack, task events and score with wall and sim time. |
| `camera_video.py` | Bag → `cameras-yolo.mp4`. |
| `towebp.py` | Crop, resize and convert to webp under 290 KB. |
