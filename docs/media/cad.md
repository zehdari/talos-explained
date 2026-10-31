# Talos CAD media library

For the mechanical, thrusters and actuators chapters. Everything here comes from the team's SolidWorks CAD
**"Talos 7-11-26"** (`~/Downloads/Talos 7-11-26.zip`, 390 files, top assembly `Talos.SLDASM`, saved
2026-07-11). It was opened in SolidWorks 2025 (Windows VM) from a working copy (`C:\talos\explainer_cad`, with its
external references repointed to that folder). The originals were not changed, nothing was saved, and the
user's other CAD was not touched. Captured on 2026-10-30 and 2026-10-31.

Facts are split into **measured from CAD** (read from the model by the SolidWorks API) and **inferred** (a
reading that the CAD does not state outright; hedge these on the site). The CAD is a design model from July
2026. It is not a survey of the robot as it is today (see "Caveats").

- Images: `public/media/cad/*.webp`. In HTML use `/talos-explained/media/cad/<file>`; in JS use
  `import.meta.env.BASE_URL + 'media/cad/<file>'`.
- Data: `public/data/cad/assembly.json` (tree, masses, boxes, thrusters) and `public/data/cad/glb.json`
  (index of the 3D model's nodes).
- 3D model: `public/models/talos-cad.glb` (see section 3).
- Tools: `tools/cad/` (section 5).

## Frames and names

**CAD frame** (`Talos.SLDASM`): **+X = port, +Y = up, +Z = bow (forward)**, millimetres. Up and bow are
plain from the model (claw and cameras at +Z, DVL at the bottom). Port = +X follows from that (right-handed frame)
and matches `talos.yaml`, whose camera positions line up with the CAD only this way round. The origin
is the CAD origin, which sits near the middle of the vehicle. It is *not* the riptide `base_link`.

Robot (REP-103 body) axes from CAD axes: robot x (forward) = CAD +Z, robot y (left/port) = CAD +X, robot z
(up) = CAD +Y. To get `base_link` coordinates as used in
[`talos.yaml`](https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_descriptions/config/talos.yaml),
convert to robot axes, then add about (x -0.14 m, y +0.035 m, z 0). This is inferred from the camera and thruster
positions (section 4, Inferred). The CAD frame and `base_link` are not the same.

Component names used below are the CAD's own names. The CAD calls the two upper side modules "Dorito"
(`Dorito-2` on port, `MirroredDorito-3` on starboard) and the two lower ones "Taco" (`Mirrored_Taco-5` on port,
`Taco-2` on starboard). Measured: the Dorito modules sit at CAD Y > 0 (upper) and the Taco modules at Y < 0
(lower).

## 1. Images (`public/media/cad/`)

All are webp, 1600 px wide (a few tall ones are narrower), white background, cropped to the model with a 3%
margin, 5-200 KB each. They are SolidWorks shaded views (no edge lines) captured at 4756x2644 and
scaled down. Orthographic views. "port"/"stbd" in a name = seen from that side; "iso" = from above, port side,
bow; "iso_stbd" = from above, starboard side, bow; "rear" = from above, starboard side, stern; "below" = from
below, port side, bow; "front"/"back"/"top"/"bottom" = straight on (top and bottom with the bow up).

### Whole vehicle

| File | Shows |
|---|---|
| talos-iso.webp | Talos from above, front-left (port side, bow). The default hero picture. |
| talos-iso-rear.webp | From above, rear-right (starboard, stern): lids, SubConn cover, battery connectors. |
| talos-iso-below.webp | From below, front-left: claw, DVL, down camera, launcher, acoustics. |
| talos-front.webp | Straight from the bow: the two viewports (forward ZED X Mini on starboard, 90 mm fan on port), the 4 outer T200s at the corners, claw and DVL below. |
| talos-back.webp | Straight from the stern. |
| talos-side-port.webp / talos-side-starboard.webp | From the port / starboard side (bow to the left / right). The triangular "Dorito" (top) and "Taco" (bottom) modules are face-on. |
| talos-top.webp | From above, bow up. |
| talos-bottom.webp | From below, bow up. |
| talos-hull-hidden-iso.webp | Same view as talos-iso with the hull tubes, end rings and viewports hidden: the two electronics cages inside. Stands in for an exploded view (none is saved in the CAD). |
| talos-hull-hidden-top.webp | Top view, hull hidden. |

### Subassemblies on their own (`sub-*`)

Each shows only that group, at its own scale, in the vehicle's orientation (same view names as above).

| File | Shows |
|---|---|
| sub-frame-iso / -front / -port / -top | The bare frame: four corner modules, Holy L Bars, battery rails, tension cables and turnbuckles. Thrusters, guards, thruster cables and foam hidden. |
| sub-frame-with-thrusters-iso / -front | The frame with the 8 T200s and their guards (foam hidden). The front view shows the 4 outer (fore-aft) T200s at the corners and the 4 inner ones at 45°. |
| sub-thruster-module-upper-iso / -port / -front | One upper "Dorito" module (`Dorito-2`, port): C-channel triangle, handles, one outer and one inner T200 with guards. |
| sub-thruster-module-lower-iso_stbd / -stbd / -front | One lower "Taco" module (`Taco-2`, starboard). |
| sub-main-housing-iso / -rear / -front / -top | The whole `Talos Main Housing`: two hull tubes, end rings, viewports, lids, latches, buoyancy bottles, cages inside. |
| sub-housing-internals-iso / -top / -front | Both cages with the hull, lids and buoyancy hidden. Starboard: Orin cage with the forward ZED X Mini. Port: board stack with the 90 mm fan. |
| sub-computer-cage-starboard-iso / -iso_stbd / -stbd | The starboard `Cage Assembly`: Jetson AGX Orin dev kit, GMSL2 capture card, forward ZED X Mini, VN-100, 40 mm fan, red ring cage. |
| sub-electronics-cage-port-iso / -port | The port `ECageClean`: stacked boards (green) on standoffs behind the 90 mm fan plate. |
| sub-buoyancy-iso | `Buoyancy Assembly`: the two Nalgene bottles in their holders and the centre foam block. |
| sub-lids-connectors-back / -rear | The stern: port lid with the SubConn cover over its connectors (left in the back view), starboard lid with penetrators (right). |
| sub-battery-pods-iso | Both smart battery housings. |
| sub-battery-pod-iso / -rear | One battery housing: LCD window end and connector end. |
| sub-dvl-below / -port | DVL1000 on its two brackets, with its cable. |
| sub-down-camera-below / -stbd | Down-facing ZED X Mini in its printed mount. |
| sub-torpedo-marker-launcher-iso / -port / -below | V8 launcher: two torpedoes pointing forward, two marker droppers with springs pointing down, servo and gear train, mount. |
| sub-claw-iso / -port / -front | The claw: mount arm, servo, rack-and-pinion gripper. |
| sub-magnet-poker-iso / -port | The magnet poker rod with the magnet and zip ties. |
| sub-acoustics-below / -iso | Hydrophone pod on its mount. |
| sub-transducer-iso | The separate `Transducer` part. |
| sub-kill-switch-iso | The kill switch handle. |

### Highlighted in context (`ctx-*`)

The whole vehicle in flat light grey with one group in safety orange (`#d9480f`, the site's `--accent`). Good
for "where is it on the robot" figures. A few parts ignore the grey override and keep their CAD colour (the red rings of
the port `Cage Assembly 4`, the down camera), probably because their colours are stored per face. In the
conversion to webp, saturated pure-red pixels were turned grey (`bmp2webp.py --grey-red`) so only the orange
group stands out. The IMU pictures skip this step because they show the VN-100 in its own red. There is no
in-context picture of the down camera: it stayed grey and hidden under the hull in every attempt. Use
`sub-down-camera-*` and `talos-bottom` / `talos-iso-below` instead. Views as above; the in-hull ones zoom to the main housing and hide the hull
tubes, rings, viewports, lids and bottles.

| File | Orange |
|---|---|
| ctx-thrusters-iso / -front / -port | All 8 T200 thrusters. |
| ctx-frame-iso | The four corner modules, Holy L Bars and battery rails. |
| ctx-main-housing-iso | The whole main housing. |
| ctx-battery-pods-iso | Both battery housings. |
| ctx-dvl-below | The DVL. |
| ctx-torpedo-marker-launcher-iso / -below | The torpedo + marker launcher. |
| ctx-claw-iso | The claw. |
| ctx-magnet-poker-iso | The magnet poker. |
| ctx-acoustics-below | Hydrophone pod, its mount and the transducer. |
| ctx-kill-switch-iso | The kill switch. |
| ctx-buoyancy-iso | Nalgene bottles, centre foam and the module foam blocks. |
| ctx-depth-sensor-rear / -zoom | The Bar30 depth sensor in the starboard lid (small in the full view; -zoom is closer). |
| ctx-lids-connectors-rear | The two stern lids and the SubConn cover. |
| ctx-forward-camera-iso / -front | Forward ZED X Mini (housing only, hull hidden; from starboard). |
| ctx-imu-iso / -stbd | VectorNav VN-100 in its own CAD colour (red), everything else grey, zoomed to the starboard cage (hull, lids and the port cage hidden). |
| ctx-computer-iso | Jetson AGX Orin dev kit + GMSL2 capture card (housing only, from starboard). |
| ctx-electronics-cage-iso | Port board stack `ECageClean` (housing only, from port). |

### Systems map (`talos-systems-*`)

The whole vehicle with each system in one of the site's data colours. The legend is in
`public/data/cad/systems_groups.json`:

| Colour | Group |
|---|---|
| `#7d8f99` grey (not a site variable) | Frame (modules, bars, rails, tension cables) |
| `#2a78d6` blue (`--state`) | Main housing |
| `#e87ba4` pink (`--s5`) | Buoyancy (foam, bottles) |
| `#d9480f` orange (`--accent`) | Thrusters |
| `#eda100` amber (`--s4`) | Batteries |
| `#1baf7a` green (`--prediction`) | Sensors outside the hull (DVL, down camera, hydrophones, depth sensor) |
| `#6250d6` violet (`--s7`) | Actuators (launcher, claw, magnet poker) |
| `#e34948` red (`--s8`) | Kill switch, SubConn cover |

Files: talos-systems-iso, -front, -port, -top, -below. Groups are painted in the order of the table, later ones
on top, so the thrusters and foam inside the frame modules and the depth sensor inside a lid get their own colour.
All modelled cables count as frame (grey). Everything else (fasteners and the like) is painted light grey
first.

## 2. Data (`public/data/cad/`)

**assembly.json** (about 290 KB), built by `tools/cad/build_assembly_json.py` from the SolidWorks tree dump:

- `frame`: axis conventions (CAD and robot).
- `total`: CAD mass and centre of mass, boxes (`bbox_visible`, `bbox_visible_without_claw_magnet`,
  `bbox_frame`, and SolidWorks' own `GetBox`, which also counts hidden geometry), component counts, the
  suppressed top-level components.
- `subsystems`: the mass of each top-level group with the component names in it (table in section 4).
- `thrusters`: the 8 T200 parts with module, inner/outer, origin and axis in CAD mm and in robot axes, CAD mass.
- `mass_by_material_kg`.
- `nodes`: the full assembly tree, 641 rows. Instances of the same file and configuration under one parent are
  merged into one row with `count` and `instances`. Each row has `id` (SolidWorks component path), `name`,
  `parent` (id of the parent row, absent at the top), `file`, `kind` (part/assembly), `count`, `mass_kg`,
  `material` (if the part has one), `size_mm` (component box, CAD axes), and `suppressed` / `hidden` flags.

**systems_groups.json**: colour and name patterns of the systems map pictures.

**glb.json**: the nodes of the 3D model with their labels, triangle counts and tight bounding boxes (section 3).

## 3. 3D model (`public/models/talos-cad.glb`)

2.7 MB binary glTF, 233k triangles, 22 nodes, made from SolidWorks STL exports of the visible model (coarse
quality), decimated with fast-simplification. Load it with three's `GLTFLoader`; no Draco or meshopt
compression, so no decoder is needed.

- **Frame:** the Talos.SLDASM assembly frame in metres, which is already glTF's Y-up: +X = port, +Y = up,
  +Z = bow. The origin is the CAD origin, not `base_link` (see "Frames and names"). The existing Nereus mesh
  `public/models/talos.glb` used by `src/viz/scene.js` is a different model in a different frame; don't mix the
  two without converting.
- **Positions only.** There are no normals: compute them (the site already uses `toCreasedNormals` in
  `scene.js`). Every mesh has one material with a flat colour from the site palette, `doubleSided: true`.
- **Nodes** (name = what to look up in `glb.json` for the label, colour, triangle count and tight box):

| Node | Contents | Colour |
|---|---|---|
| `frame` | Corner modules without thrusters/guards/foam, Holy L Bars, battery rails, tension cables, turnbuckles | `#7d8f99` |
| `thruster_guards` | The 8 white thruster guards (`Thruster Protector`) | `#b8c0c7` |
| `thruster <CAD part name>` (8 nodes) | One T200 each, e.g. `thruster T200 Thruster-1` (port upper outer). Match to `assembly.json` → `thrusters[].part` | `#d9480f` |
| `foam` | Module foam blocks, Nalgene bottles, centre foam | `#e87ba4` |
| `hull` | Both hull tubes, end rings, viewports, lids, latches, seals (connectors are in `subconns`). Opaque: make it transparent to see inside | `#2a78d6` |
| `electronics` | Both cages with everything in them (Orin, boards, forward camera, IMU, fans) | `#008300` |
| `batteries` | Both battery housings | `#eda100` |
| `dvl`, `down_camera`, `acoustics` | Sensors outside the hull | `#1baf7a` |
| `launcher`, `claw`, `magnet_poker` | Actuators | `#6250d6` |
| `kill_switch` | The kill switch only (handle on the port bow window) | `#e34948` |
| `cables` | Modelled thruster, battery and DVL cables | `#8fb3bf` |
| `subconns` | Every SubConn connector (MCBH/MCIL/MCDC/HPBH/HPIL/DBH/DIL: lids, battery pods, hydrophone pod, DVL) and the SubConn cover on the port lid; split out of the other groups by `tools/cad/split_subconns.py` | `#0f2633` |

Decimation: board-level pieces smaller than 4 mm (resistors, pins) were dropped before decimating.
Round edges are faceted at close range. Not exported: the
top-level duplicate foam blocks, the hidden ZED 2i and bulkhead plate, and the `DVL Sensor Cone`.

## 3b. Hero model (`public/models/talos-hero.glb`)

The front page's 3D Talos (`index.html` hero, `src/viz/talos-hero.js`, tree and cards in
`public/data/index/hero.json`). Much finer than `talos-cad.glb`, with one node per part and the CAD's own colours.
`talos-cad.glb` stays as it was for the mechanical chapter.

- **Made from** SolidWorks' own display tessellation, read face by face through the API (`tools/cad/tess.cs`), so
  every face keeps its appearance colour (face > feature > body > component > part, the order SolidWorks uses).
  Exported: every leaf component visible in the team's saved display state and at least 2 mm across
  (`make_tess_args.py`, 1,162 components, 11.6 M raw triangles; the job takes about 75 minutes because every face is a separate API call). Not exported: the hidden ZED 2i and bulkhead
  plate, the DVL beam cone, the duplicate top-level foam blocks and sub-2 mm board parts (resistors, pins).
- **Built by** `tools/cad/build_hero.py` (memory-capped, `~/tools/cadvenv`): node per part (`hero_nodes.py`), triangle
  budget shared out by size and detail (fasteners and the Orin's inner chips get less, parts under budget keep their
  tessellation), quadric decimation per part and colour, creased normals (32°), vertex colours (sRGB converted to
  linear) with one material per node and finish (metal, plastic, rubber; clear parts get their own `BLEND` material
  with `extras.kind = 'glass'`). Then `gltfpack -cc -kn -ke` (meshopt compression, quantised; three's
  `MeshoptDecoder` loads it).
- **Size:** 1,138,740 triangles in 94 part nodes under 17 system nodes, 7 materials (vertex colours), 7.8 MB after gltfpack (66 MB before). Budget `HERO_TRIS=1000000`, `gltfpack -vp 13`.
- **Frame:** the same as `talos-cad.glb` (assembly frame in metres, +X port, +Y up, +Z bow).
- **Run order** (SolidWorks running in the VM with `Talos.SLDASM` open, as in section 5):
  `python3 tools/cad/make_tess_args.py > /tmp/args.txt; scp /tmp/args.txt winvm:C:/talos/jobs/args.txt;
  swjob tools/cad/tess.cs 7000` (writes `C:\talos\explainer_cad\_tess\tess.bin`, 420 MB, plus `colors.txt` and
  `tess_log.txt`; fetch them with sftp), then
  `systemd-run --user --scope -q -p MemoryMax=6G -p MemorySwapMax=0 ~/tools/cadvenv/bin/python -I
  tools/cad/build_hero.py /tmp/raw.glb /tmp/nodes.json <tess dir>...` (about 80 s) and
  `npx gltfpack -i /tmp/raw.glb -o public/models/talos-hero.glb -cc -kn -ke -vp 13`. `tessread.py` reads `tess.bin`.
  The four module foam blocks were exported in a second, small run (`_tess2`); `make_tess_args.py` now includes them.
- **The hero's tree** (`public/data/index/hero.json`): `systems` (the chips, in order), `items` (id → name, `nodes`
  or `children`, `open` = a container you can go into, `shell` = nodes ghosted when it is open, `context` = nodes
  kept faintly around it when it is open (everything else is hidden then), `anchorNode` = where its dot sits, `card`
  = what, does, facts, links with their section names). A GLB node can sit in more than one item (the forward camera
  is in the camera cage and in Cameras); a tap at the top level picks the smallest system that holds the node.
- **Nodes** are grouped under one glTF node per system. Node names (ids in `hero.json`):

| System node | Part nodes |
|---|---|
| `thrusters` | `thr_vup`, `thr_vus`, `thr_vlp`, `thr_vls` (outer), `thr_hup`, `thr_hus`, `thr_hlp`, `thr_hls` (inner): talos.yaml names (Dorito-2 = upper port, MirroredDorito-3 = upper starboard, Taco-2 = lower starboard, Mirrored_Taco-5 = lower port) |
| `frame` | `frame_mod_pu/su/pl/sl` (corner modules without thrusters, foam, guards, cables), `frame_guards`, `frame_bars` (Holy L Bars), `frame_rails`, `frame_tension` (cables, turnbuckles) |
| `hull` | `hull_tubes`, `hull_windows`, `hull_window_rings`, `hull_rings` (end rings, tension rods, housing connections), `hull_lid_port`, `hull_lid_stbd`, `hull_latches`, `hull_seals`, `depth_sensor` (BAR30 part, a Bar02 on the robot) |
| `camera_cage` | `cc_orin`, `cc_orin_panel`, `cc_ffc`, `cc_vn100`, `cc_gmsl2`, `cc_cagebb`, `cc_switch`, `cc_switch_mount` (TEG-S50g, TEG-Space), `cc_fan`, `cc_keystone`, `cc_bulkhead` (Bulkhead_Mounting_Assembly, Connector_Head_Rail), `cc_frame` |
| `ecage` | `ec_full1`, `ec_full2`, `ec_full3`, `ec_ledctl1`, `ec_ledctl2`, `ec_ledal1`, `ec_ledal2`, `ec_fan`, `ec_kill_sensor`, `ec_aux_sensor`, `ec_joiner`, `ec_frame` (ECageClean braces and standoffs plus `Cage Assembly 4`) |
| `batteries` | `bat_<port/stbd>_pack`, `_bms`, `_lcd`, `_window`, `_prv`, `_shell` |
| `subconns` | `subconn_port_lid`, `subconn_stbd_lid`, `subconn_bat_port`, `subconn_bat_stbd`, `subconn_hydrophone`, `subconn_dvl`, `subconn_cover` |
| others | `kill_switch`, `dvl_body`, `dvl_mount`, `dfc`, `dfc_mount`, `hydro_h1c`, `hydro_preamp`, `hydro_pod`, `hydro_mount`, `transducer`, `launcher_body`, `launcher_torpedoes`, `launcher_servo`, `launcher_mount`, `claw`, `magnet_poker`, `buoy_*`, `cables_*` |

**Which board is which.** The CAD's board stack (`ECageClean`) is blank 1 mm plates, so the labels come from the
board library and the team's reports, not from the CAD:

| CAD part | Label on the site | How | Confidence |
|---|---|---|---|
| `Full Board-3` (bottom, Y -39) | POAC | only the POAC and the two ESC boards are 177.8 × 127 mm; the 2023 photo and the 2024 and 2026 reports all put the POAC at the bottom | medium |
| `Full Board-1`, `-2` (Y +2, -15) | ESC board (upper / lower) | the other two full-size boards; which ESC is which can't be told | medium |
| `LED Control-1` (top layer, bow half) | LED board | 73.7 × 127 mm outline | high |
| `LED AL-1` (top layer, stern half) | LED module (aluminium-core RGBW board) | 104.2 × 127 mm outline | high |
| `LED Control-2` (second layer) | IVC board (probably) | the IVC board has the LED control board's outline; the 2026 diagram puts it under the LED board | low |
| `LED AL-2` (second layer) | Unidentified plate | Talos has one LED module; probably a copy left in the CAD | low |
| `FanPlate/KillSwitch-1`, `-2` | kill switch / AUX switch sensor mounts | the 2024 report's render: kill sensor on top of the fan block, AUX at the bottom | medium-high / medium |
| `CameraCageBB` | camera cage breakout board (CCBB) | name and 50.8 × 136.6 mm outline | high |
| `TEG-S50g` (+ `TEG-Space`) | network switch | the chapters put a 5 V switch in the camera cage; TEG-S50g looks like a TRENDnet model number, which no source confirms, so the site doesn't name it | high (switch) |
| `Bulkhead_Mounting_Assembly` | Connector head | probably the spring-loaded connector the team describes | low-medium |
| `Keystone_Cover`, `O-1` | (part of the cage / stack frame) | unknown | low |

## 4. Mechanical facts

### Measured from CAD

All numbers are from `Talos.SLDASM`, configuration `Default`, with the team's saved suppression and
visibility. Sizes are in CAD axes: X = width (port-starboard), Y = height, Z = length (fore-aft).

**Overall size** (tight, measured on the exported meshes of the visible model, `glb.json`):

| What | Width X | Height Y | Length Z |
|---|---|---|---|
| Everything visible, incl. claw and magnet poker | 925 mm | 720 mm | 711 mm |
| Without the claw and magnet poker | 925 mm | 639 mm | 582 mm |
| Bare frame (modules without thrusters/guards/foam, bars, rails, cables) | 805 mm | 555 mm | 346 mm |
| Main housing (both tubes, rings, lids and connectors) | 532 mm | 261 mm | 403 mm |
| One T200 model (outer ones / inner ones, as oriented) | 96 x 96 x 113 mm / 100 x 99 x 97 mm | | |

The widest and highest parts are the outer thruster guards (X ±462 mm, Y +303 mm). The lowest point is the
claw (Y -416 mm). Talos is wider than it is long because the four thruster modules stick out
at the sides. SolidWorks' own per-component boxes (in `assembly.json` → `total`) are looser: 976 x 792 x 739 mm
for everything visible.

**Mass** (SolidWorks mass properties, `assembly.json` → `total`, `subsystems`):

| Group (top-level components) | CAD mass |
|---|---|
| Whole assembly, every resolved component | 36.30 kg |
| Main housing (`Talos Main Housing`: 2 hull tubes, lids, viewports, both electronics cages, buoyancy bottles) | 17.84 kg |
| Four corner modules (`Dorito`/`Taco` x2 each, incl. 8 T200s, guards, handles, foam) | 7.04 kg |
| Two battery housings (`Smart Battery Housing Assembly` x2, 2.26 kg each) | 4.52 kg |
| DVL assembly | 1.68 kg |
| Torpedo + marker launcher (`Torpedoes + Markers V8`, servo housing, holder, mount) | 1.11 kg |
| Claw (`EMERGENCYCLAWASSEMBLY`) | 0.94 kg |
| Duplicate foam blocks (`Dorito Foam-1`, `-3` at the top level, see caveats) | 0.86 kg |
| Modelled cables | 0.58 kg |
| Holy L Bars, battery rails, tension cables, turnbuckles | 0.51 kg |
| Kill switch + SubConn cover | 0.46 kg |
| Acoustics (hydrophone pod, mount, transducer) | 0.38 kg |
| Magnet poker | 0.24 kg |
| Down camera + mount | 0.15 kg |

- Centre of mass of the whole assembly (CAD frame): X +7.3, Y -28.0, Z -10.7 mm, i.e. 28 mm below the CAD
  origin.
- Two resolved parts are hidden in the saved display state: an old ZED 2i camera (0.24 kg) and a bulkhead
  mounting plate (0.28 kg). Without them and the duplicate foam the visible model is about 34.9 kg. For
  comparison, `talos.yaml` says `mass: 32.444 # measured dry, as deployed for the 2026-10-03 pool tests (CAD:
  34.708)` and gives the measured wet weigh-in as 34.084 kg
  ([talos.yaml L7-13](https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_descriptions/config/talos.yaml#L7-L13)).
  Use the scale numbers on the site, not the CAD mass.
- 2,250 components resolved, 2,167 of them parts. Five top-level components are suppressed (an old heading
  indicator, a transducer clamp, an old foam assembly, `BoardCageAssem`, and a second `Camera Cage`).

**Materials named in the CAD** (mass per material, `assembly.json` → `mass_by_material_kg`): 6061 aluminium
(hull end rings, lids, DVL body, battery housings; 13.4 kg as "6061 Alloy" + "6061-T6"), brass (the connector
models, 4.0 kg), ABS (printed parts and thruster bodies, 2.4 kg), rubber (handles, boots, gaskets, 1.6 kg),
polycarbonate "PC High Viscosity" (hull tubes and viewports, 0.93 kg), 5052-H32 aluminium (frame plates, 0.90 kg),
PET (claw mount, magnet poker, 0.69 kg), 18-8 stainless "1.4310" (fasteners), 6063-O aluminium (C-channels),
ferritic stainless (hull tension rods), PBT (launcher body and torpedoes), NBR (lid O-rings), acrylic (battery LCD
windows, hydrophone pod lid). 10.4 kg of parts have **no material** and use SolidWorks' default 1000 kg/m³,
among them all the foam and every vendor model.

**Hull (main housing)**, measured:
- Two parallel tubes side by side, port (CAD X > 0) and starboard (X < 0), each running fore-aft.
- Each tube is a polycarbonate cylinder (`PolycarbonateChannels`, 146 mm long) between two 6061 rings
  (`MainHousingFore` at the bow end, `MainHousingAft` at the stern end), squeezed by 8 stainless
  `TensionRods` (121 mm, 4 per tube).
- Bow ends: flat 3 mm polycarbonate `PolycarbonateViewport` windows (about 202 mm across) held by
  aluminium `LidEyeGlass` rings on the outside. Stern ends: removable `Port_Lid` and `Starboard_Lid_23` lids with the bulkhead connectors,
  held by four McMaster 6200A31 adjustable-grip draw latches (`LidGrip` x4).
- Seals: X-profile lid O-rings (McMaster 90025K739, NBR, 4 of them), square-profile O-rings between the tube and
  the rings (4061T287, 4 of them), and two `LidGasket`s.
- `Housing Connection Fore` / `Aft` (6061) sit between the two tubes, at the bow and stern rings.

**Inside the hull**, measured:
- Starboard tube: `Cage Assembly` (red ring cage) with `NVidia Real` (the Jetson AGX Orin dev kit model,
  `00_top_lvl_p3737`), a `GMSL2_capture_card`, the forward camera `ZEDX_Mini` looking out of the starboard
  viewport, the IMU `vn100_rugged`, a 40 mm fan and a `Bulkhead_Mounting_Assembly`.
- Port tube: `ECageClean` (stacked boards on standoffs behind a `FanPlate` with a 90 mm fan) inside
  `Cage Assembly 4`.
- Depth sensor: `BAR30-SENSOR-ASSEMBLY-R1` sits in the starboard lid.

**Buoyancy**, measured: `Buoyancy Assembly` on top of the hull holds two `Nalgene Water Bottle`s in printed
holders (the clear tubes with black rings in the pictures) and a `Center Foam` block between the hull tubes.
Each corner module also carries a `Dorito Foam` block.

**Frame**, measured:
- Four corner modules: two upper (`Dorito`) and two lower (`Taco`), mirrored port/starboard. Each is built from
  6063-O C-channels (`Dorito C Channel`), 5052-H32 plates (tips, `Thruster Protector`, `Hull Connector`),
  printed spacers and 18-8 fasteners, and carries two T200s, a foam block, TPU handles and stainless
  `Crane Hook`s (AISI 304).
- Two `Holy L Bar` cross members (432 mm) and four battery mounting rails join the modules.
- Stainless tension cables (`Side Cable` x4, `Top Cable` x2, `Bottom Cable` x2) with three 316 stainless
  turnbuckles (McMaster 30315T611) brace the frame.

**Thrusters**, measured (`assembly.json` → `thrusters`; position = part origin, axis = the part's local +Z,
which is the duct axis):
- 8 parts named `T200 Thruster` (Blue Robotics T200 models), two per corner module.
- All 8 sit at the same fore-aft station (CAD Z = +3 mm).
- 4 outer thrusters at the corners, X = ±406 mm, Y = ±244 mm, axis along Z: they push fore-aft.
- 4 inner thrusters at X = ±298 mm, Y = ±137 mm, axis at 45° in the X-Y plane (`[0, ±0.707, ±0.707]` in robot
  axes): they push up/down and sideways together.
- CAD part masses are 0.293 kg (non-mirrored) and 0.195-0.199 kg (mirrored copies), so the mirrored parts have
  different geometry or material settings. Don't quote either as the T200's mass.

**Battery housings**, measured: two `Smart Battery Housing Assembly`s on the battery rails at the port and
starboard sides (about 82 x 150 x 380 mm each). Each holds a `Battery` block, a `BMS_Board` and an `LCD_Board`
behind an acrylic `LCD Window`, a `PRV-M10` part (probably a pressure relief valve), a rubber bumper and boots, and a
6061-T6 base and lid sealed by an O-ring.

**Sensors and actuators outside the hull**, measured:
- DVL: `DVL Assembly` with `DVL 1000-300m Part Model` (Nortek DVL1000, 300 m model) on two 5052-H32 `DVL
  support` brackets, under the middle of the vehicle. A transparent `DVL Sensor Cone` (material "Air") shows the
  beams. It is hidden in every picture.
- Down camera: a second `ZEDX_Mini` in a printed `DFC Mount` under the starboard hull tube.
- Acoustics: `Acoustics Pods` (one pod with an `H1C Hydrophone`, `Pod_Housing_V4`, acrylic `Pod_Lid`) on an
  `Acoustic_Mount` low at the stern on the starboard side, plus a separate `Transducer` part low at the stern
  on the port side.
- Torpedo + marker launcher: `Torpedoes + Markers V8` with an `SER-20XX Servo`, left/right helix gears (ABS PC),
  four springs (McMaster 9435K123), a pushing arm, PBT body and covers, torpedoes (`Sinky Torp`), and a servo
  housing and holder. This is the team's V8 launcher. The newer V10/V11 launcher redesign is not in this CAD.
- Claw: `EMERGENCYCLAWASSEMBLY` with an `SER-20XX` servo driving a pinion (`Claw Pinion Gear 2`) on two gear
  racks (McMaster 2662N57, 20° pressure angle), two `Gripper_V6` jaws, a 6061 box channel and a PET
  `Claw to Talos Mount`. It hangs below the bow (the lowest point of the model, Y = -416 mm).
- Magnet poker: a PET `Magnet poker` rod with an alloy-steel magnet held by two zip ties, pointing forward.
- Kill switch: `Kill Switch` (printed ABS `Kill Switch Knuckles` handle with snap fits) in front of the port
  tube's bow window, on its upper half.
- `Subconn Cover` (snap-fit cover) over the connectors at the stern.

### Inferred

- **Thruster roles.** In `talos.yaml` the outer four are `VUS`, `VUP`, `VLS`, `VLP` and the inner four `HUS`,
  `HUP`, `HLS`, `HLP` (the letters are direction Heave/Vector, then Upper/Lower, then Port/Starboard,
  [L392-L438](https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_descriptions/config/talos.yaml#L392-L438)).
  riptide_mpc treats each pose's local +x as the thrust direction
  ([fossen_model.cpp](https://github.com/osu-uwrt/riptide_control/blob/mpc/riptide_mpc/src/fossen_model.cpp)).
  Worked through, the "V" thrusters point fore-aft and the "H" thrusters point at 45° between up and sideways.
  That matches the CAD axes above (as lines; the CAD can't show which way each propeller pushes).
- **CAD to config offset.** `base_link` coordinates are about CAD coordinates (converted to robot axes) plus
  (x -0.14 m, y +0.035 m, z 0). Checks: the forward ZED X Mini centre, CAD (X -123, Y 7, Z 111) mm, becomes
  (-0.026, -0.088, 0.007) m against `ffc` pose (-0.030, -0.0888, 0.0069) in `talos.yaml`. The down ZED X Mini,
  CAD (-126, -80, -1), becomes (-0.138, -0.091, -0.080) against `dfc` (-0.1437, -0.0915, -0.0818). The yaml's
  comments say both camera positions were taken from this CAD
  ([L369-L389](https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_descriptions/config/talos.yaml#L369-L389)).
  The thruster positions agree within about 3-5 mm in y, so they were probably measured separately.
- **Connector part numbers.** `mcbh*`, `hpbh4f`, `mcil*`, `dbh8f` and `hpil4m` look like SubConn connector part
  numbers (Micro Circular, High Power and Low Profile bulkheads and inline plugs). The CAD models them as solid
  brass, so they make the CAD mass too high.
- **The CAD mass is high.** The foam (about 3.8 kg) uses 1000 kg/m³ (real foam is far lighter), the connectors
  are solid brass, and the vendor models (Orin 0.17 kg, VN-100 3 g, battery 0.44 kg) have arbitrary densities.
  Use it only for rough "what is heavy" comparisons.
- **Why the layout looks like this** (a design reading, not stated anywhere): each tube has its own stern lid,
  so the computer side (starboard) and the board stack (port) can probably be opened one at a time. The thrusters
  sit 0.3-0.4 m out from the centre line, which gives them long lever arms for roll and yaw.

### Caveats

- The CAD is from July 2026. Later changes on the robot are not in it. For example, the `talos.yaml` comment on
  the down camera says "the CAD has it rolled 180 deg, bottom outboard" compared with the robot, and the
  torpedo pose is marked "as deployed 2026-10-03".
- `Dorito Foam-1` and `Dorito Foam-3` also exist at the top level, overlapping the foam inside the modules. They
  are left out of the 3D model.
- Cables are only partly modelled (eight thruster cables, battery and DVL cables). There is no tether or
  separate penetrator plate in this CAD. The lids carry the bulkhead connectors.
- No exploded views are saved in the assembly, so the "hull hidden" pictures stand in for an exploded view.

## 5. How it was made (`tools/cad/`)

Run order, from Cam-PC (SolidWorks must already be running in the VM; the jobs go through the solidworks-cad
skill's `swjob`, which compiles a C# file against the SolidWorks API and runs it in the VM's console session):

1. Unzip `Talos 7-11-26.zip` into `C:\talos\explainer_cad` (a copy). `fix_refs.cs` repoints the assemblies'
   references to that folder (the team's Pack and Go stored `CopyDesignTemp` paths). `unsuppress.cs` resolves the
   top-level components in memory. Nothing is saved.
2. `dump_tree.cs` writes every component's name, file, configuration, suppression, visibility, transform,
   box, material and mass to `tree_Talos.jsonl` (kept here). `build_assembly_json.py` turns it into
   `assembly.json`.
3. `make_args.py tree_Talos.jsonl iso|fix|ctx|sys` writes command lists for `shots.cs`, the screenshot driver
   (show/hide by name pattern, flat colours, view direction + zoom box, `SaveBMP` at 4756x2644).
   `fetch_shots.sh PATTERN` copies the BMPs back and `bmp2webp.py` crops, pads, scales and saves webp
   (`--drop-small` removes stray detached screws). `sheet.py` makes contact sheets for checking.
4. `make_stl_args.py` writes the STL export commands (one binary STL per group, coarse quality, assembly frame)
   and `glb_groups.json`. `build_glb.py` (run with `~/tools/cadvenv` under a 6 GB memory cap) decimates them and
   writes `talos-cad.glb` and `glb.json`.
5. `swmesh.py` reads a part's stored display mesh straight from an .SLDPRT without SolidWorks (from
   `~/hullplanner/tools/import_sw.py`). It was tried for the GLB, but 261 of the 493 part files used in the visible
   model gave no mesh: 192 are not separate files in the zip (virtual parts and imported STEP parts kept inside
   assemblies) and 69 (mostly mirrored parts) store no display mesh. So the SolidWorks STL export was used.

Lessons for next time:
- Turning off the FeatureManager tree and graphics updates makes appearance changes on ~2,000 parts fast, but
  visibility changes made that way don't show up in the screenshot. `shots.cs` now freezes only for paint
  commands (`freeze|none` is the default).
- `vis|saved` restores the visibility saved at the first run (`C:\talos\explainer_cad\_out\saved_vis.txt`).
- The viewport background is set to plain white for the captures (`prefs|white`) and put back afterwards
  (`prefs|restore`); it was restored at the end of the last run.
- Left in the VM: the raw 4756x2644 BMPs (`C:\talos\explainer_cad\_shots`, 3.4 GB) and the full-resolution
  STLs (`C:\talos\explainer_cad\_stl`, 400 MB), in case a picture needs re-cropping. Delete them when no longer
  needed. `Talos.SLDASM` is still open in SolidWorks with unsaved display changes; it is the working copy, so close
  it without saving.
- Fetching STLs: `fetch_stl.sh` (tar + sftp, because Windows OpenSSH scp fails on paths with spaces).
