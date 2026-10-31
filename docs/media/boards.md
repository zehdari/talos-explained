# Boards media and fact library

For the electrical, boards, firmware, thrusters and actuators chapters. Everything here was built on
2026-10-30 from local repos and the team's GitHub, and re-checked on 2026-10-31 (source heads unchanged;
power fields, battery pack facts and the RS26 TDR cross-check in section 8 added). Facts are split into **confirmed** (seen in a
schematic, PCB netlist, firmware or config) and **inferred** (a reasonable reading that nothing in the
sources states outright). Use inferred facts only with a hedge ("probably", "the design suggests").

Source snapshots:

| Repo | Commit | Notes |
|---|---|---|
| osu-uwrt/electric_boogaloo (Altium) | `bf41bfe` master, 2026-10-04 | cloned to /tmp/gh, not kept in this repo |
| osu-uwrt/titan_firmware | master `058df2a` (local checkout `39c07af`, branch fix/depth-timestamps) | ~/osu-uwrt/development/titan_firmware |
| osu-uwrt/titan_canmore | `f6273e2` (submodule of titan_firmware) | |
| osu-uwrt/riptide_core | followpath-speed `720bdd9` | ~/osu-uwrt/release/src/riptide_core |
| ~/pretest_checks (local only) | `2fcc9c6` | robots/talos/robot.yaml lists the boards it expects |
| electric_boogaloo releases | `Tempest_mk_2` (2023-01), `talos_boards` (2024-02), `ssfb_boards` (2025-07) | exported schematic PDFs used for the schematic crops |

Link bases used below: TF = `https://github.com/osu-uwrt/titan_firmware/blob/master/`,
EB = `https://github.com/osu-uwrt/electric_boogaloo/blob/master/`,
RC = `https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/`.

---

## 1. Files

All images are webp. Board renders have a transparent background, so they sit on the paper colour.
Reference them as `/talos-explained/media/boards/<file>` in HTML or
`import.meta.env.BASE_URL + 'media/boards/<file>'` in JS.

### Board renders (KiCad 9 3D, orthographic, from the Altium PCBs)

| File | Size | KB | What |
|---|---|---|---|
| poac-top.webp / poac-bottom.webp | 1400x1003 | 126 / 56 | POAC (power + actuator) board |
| esc-top.webp / esc-bottom.webp | 1400x1003 | 117 / 63 | ESC board (two of these in Talos) |
| ccbb-top.webp / ccbb-bottom.webp | 564x1400 | 92 / 53 | Camera cage breakout board (tall) |
| ccbb-top-landscape.webp / ccbb-bottom-landscape.webp | 1400x564 | 91 / 54 | same, rotated 90 deg counter-clockwise |
| led-top.webp / led-bottom.webp (+ -landscape) | 841x1400 | 71 / 32 | LED board (Year One design) |
| led_module-top.webp / led_module-bottom.webp | 1166x1400 | 34 / 9 | Aluminium RGBW LED module (LED 3D models missing, pads only) |
| ivc-top.webp / ivc-bottom.webp (+ -landscape) | 843x1400 | 129 / 83 | IVC (acoustic inter-vehicle comms) board |
| sbh_mcu-top.webp / sbh_mcu-bottom.webp | 1400x1400 | 126 / 73 | Smart battery housing MCU board |
| sbh_bms-top.webp / sbh_bms-bottom.webp | 959x380 | 23 / 28 | Smart battery housing BMS board (most parts on the bottom) |
| agx_breakout-top.webp / -bottom | 1400x921 | 85 / 22 | Jetson AGX 40-pin breakout (CAN + RS-232) |
| agx_m2-top.webp / -bottom | 1032x1400 | 66 / 29 | Jetson M.2 RS-422 card (gyro) |
| mk2_power-top.webp / -bottom | 1400x1003 | 111 / 58 | Retired Mark 2 power board (history) |
| mk2_actuator-top.webp / -bottom | 1400x1010 | 116 / 37 | Retired Mark 2 actuator board (history) |

### Schematic excerpts (cropped from the team's exported PDFs)

| File | Size | KB | From |
|---|---|---|---|
| poac-sch-kill-switch.webp | 1800x632 | 39 | Combined_Power_Actuator.PDF p7 (release talos_boards) |
| poac-sch-battery-or.webp | 1470x630 | 26 | same PDF p5, "Port Battery Balancer" |
| poac-sch-regulators.webp | 1466x1250 | 38 | same PDF p5, 15 V and 5 V regulators |
| poac-sch-power-page.webp | 1800x1166 | 87 | same PDF p5, whole power sheet |
| esc-sch-blocks.webp | 1800x987 | 108 | MK2_ESC_Board.pdf p2 (release Tempest_mk_2), block-level sheet |
| esc-sch-reverse-protection.webp | 840x682 | 18 | same page, reverse-voltage protection block |
| rp2040-can-block.webp | 1800x966 | 71 | MK2_Camera_Cage_Breakout_Board.pdf p3, the shared RP2040 + CAN sheet |
| ivc-sch-top.webp | 1800x1173 | 115 | IVC.pdf p3 (release ssfb_boards), top-level blocks |
| ivc-sch-transmit.webp | 1800x1173 | 100 | IVC.pdf p4, transmit chain |

The schematics keep Altium's cream sheet colour. Text is small at phone width; put them in a figure
that opens full size on tap.

### Data

| File | What |
|---|---|
| public/data/boards/boards.json | One entry per board: name, status (on-talos / orin-side / retired), purpose, MCU, key ICs (ref, part, role), connectors (ref, type, silk label, what it carries), power in/out, firmware project + facts with links, ROS topics, CAN bus + client ID, revision/commit notes, size in mm, media paths. Also `can_buses`, `client_ids` and `mcu_block` (the shared RP2040 + CAN sheet). |
| public/data/boards/power.json | Power tree: `nodes` (battery, distribution, rail, switch, board, load; each with detail + confidence) and `edges` (from, to, net name, via connector). Plus `measurements`: what each field of state/electrical really measures and the expected range. |
| public/data/boards/hotspots.json | Tap targets on the renders: for each board and side, key parts as {ref, label, value, x, y, r} where x, y are fractions of the image and r a fraction of the longer side. `landscape` gives the same for the rotated copies. Checked by overlay on poac and ccbb (centres land on the parts). |

### Tools (tools/boards/)

| File | Does |
|---|---|
| boards_list.tsv | Which Altium PcbDoc is rendered for each board id, and the title/revision used for unresolved silk strings |
| convert_pcb.py | Altium .PcbDoc -> .kicad_pcb with KiCad 9's importer (pcbnew Python), plus a JSON summary (size, origin, every footprint's position, pads and nets) |
| convert_all.sh | Runs convert_pcb.py for every board (6 GB memory cap) |
| render_all.sh | kicad-cli pcb render top/bottom (quality high, transparent), drops the soft shadow by thresholding alpha, trims, resizes to 1400 px, writes webp; then the landscape copies |
| schematic_crops.tsv / schematic_crops.sh | Crops block-level excerpts from the release PDFs (pdftoppm at 220 dpi) |
| schdoc_parts.py | Lists components and net/port names from Altium .SchDoc files (olefile). Used to build the key-IC lists |
| firmware_topics.py | Lists the ROS topics each Talos firmware creates |
| hotspots.py | Registers the renders against the KiCad coordinates and writes hotspots.json |
| build_data.py | Writes boards.json and power.json (curated facts live in this file, with links) |

Regenerate: clone electric_boogaloo to /tmp/gh, download the release PDFs to /tmp/gh/eb_pdfs, then
`convert_all.sh`, `render_all.sh`, `schematic_crops.sh`,
`python3 firmware_topics.py ~/osu-uwrt/development/titan_firmware > /tmp/boards_work/topics.json`,
`python3 hotspots.py`, `python3 build_data.py`. KiCad 9 comes from the kicad-9.0-releases PPA (installed
on Cam-PC for this). A full render pass takes about 20 minutes.

### Rendering caveats

- The renders show the **current repo design** (electric_boogaloo master). Several boards were edited
  after the boards in Talos were built, so the physical boards may differ: POAC (2026-02-18, separate
  12 V servo output), ESC (Oct-Dec 2025, "ESC Voltage protector"), SBH BMS (2026-02-15, current-sense
  fix), AGX breakout (2026-09-24, IMU power switch removed).
- KiCad's importer drops Altium internal plane layers, so the converted files report 2 copper layers
  for some 4-layer boards. Do not quote layer counts from these files.
- Arial on the silk was replaced by Liberation Sans. Silk fields `'.ProjectTitle'` / `'.BoardRevision'`
  were filled from the Altium project parameters (ESC MK II v1.1, Camera Cage BB MK II v1.1, IVC Board
  v1.0, SBH MCU/BMS v1.1, Jetson AGX Breakout v1.0, Power MK II v1.1, Actuator MK II v1.1). Where the
  project only had the template placeholder ("Sample Template Project": POAC, LED board, M.2 card) the
  field was removed rather than printing the placeholder.
- A few parts have no 3D model (the LED module's OSRAM LEDs, some passives). They show as bare pads.
- The POAC silk reads "P RT BATTERY" next to J3. That is how the text is stored in the Altium PcbDoc
  (Texts6 stream), not a conversion fault; do not "correct" it in a caption, just call the connector
  J3 "PORT BATTERY" as the schematic does.
- The PCB footprint comment on SBH MCU J1 / BMS J10 says "Mini-Fit Jr R/A", but the schematic part is a
  Molex Milli-Grid 2.00 mm 8-pin (right angle on the MCU, vertical on the BMS). The schematic is used here.

---

## 2. Which boards are in Talos today

Confirmed by three independent lists that agree: the Talos firmware projects in
[titan_firmware/talos](https://github.com/osu-uwrt/titan_firmware/tree/master/talos), the CAN client IDs in
[client_ids.h](https://github.com/osu-uwrt/titan_canmore/blob/f6273e2c25f0202788be01e41338a6bbd6320006/canmore/include/canmore/client_ids.h),
and the boards `~/pretest_checks/robots/talos/robot.yaml` expects on `state/firmware`
(bus, client id, board_name).

| Board | Count | Firmware project | PICO_BOARD | CAN bus / client ID | Altium design rendered |
|---|---|---|---|---|---|
| POAC (power + actuator) | 1 | talos/PoacBoard | talos/poac_board | internal / 1 | TalosBoards/Year One/PoActuator/Combined_Power_Actuator/PoactuatorPCB4.PcbDoc |
| ESC board | 2 | talos/ESCBoard | mk2/esc_board | internal / 2 and 3 | TempestBoards/MK2/ESC/ESC.PcbDoc_Large.PcbDoc |
| Camera cage breakout (CCBB) | 1 | talos/CameraCageBB | mk2/camera_cage_bb | internal / 4 | TempestBoards/MK2/CameraCageBB/CameraCageBB.PcbDoc |
| LED board | 1 | talos/LEDBoard | talos/led_board | internal / 6 | TalosBoards/Year One/LED_Board/LED_Control.PcbDoc |
| IVC board | 1 | talos/IVCBoard | talos/ivc_board | internal / 8 | TalosBoards/Year Two/IVC/IvcBoard.PcbDoc |
| Smart battery housing MCU | 2 | talos/SmartBattery | mk2/sbh_mcu | external / housing serial no. | TempestBoards/MK2/SBH_MCU/SBH_MCU.PcbDoc |
| Smart battery housing BMS | 2 | (no MCU; read by the SBH MCU) | | | TempestBoards/MK2/SBH_BMS/SBM_BMS.PcbDoc |

Orin-side boards (no MCU, **inferred** to be fitted): Jetson AGX breakout (CAN transceivers for can0/can1
+ RS-232 for the IMU) and the Jetson M.2 RS-422 card (fibre-optic gyro). Basis: the team website lists a
"CAN breakout board" and an "RS 422 breakout board (Fiber Optic Gyro interface)" on the Orin
([uwrt.org legacy-site.md](https://github.com/osu-uwrt/uwrt.org/blob/main/docs/content/legacy-site.md));
these are the only designs that match, and a 2024 commit calls the M.2 card the "FOG board".

Retired on Talos: Mark 2 power board and Mark 2 actuator board. Their firmware (talos/PowerBoard,
talos/Actuator) is still in the repo. The POAC reuses the power board's CAN ID 1, and the team website
says the combined board "combines the responsibilities of the Mark 2 Power and Actuator boards".

Not on the robot / not current: SBH_Charger (a charger), External_Camera_HAT (2023-24 Pi-5 camera hat;
the old "downwards facing camera" on external CAN ID 6), Year Two LED_Board (5-driver redesign, not
supported by the current led_board pin map), Acoustics/FPGA acoustics boards, ConnectTech_Breakout.
Their status was not checked further.

How the LED board version was decided (confirmed): `led_board.h` defines LEDC_DIN1/2, LEDC_NCS1/2,
CONN_CHK_PIN and TEMP_SENSE_PIN. The Year One schematic (LED_Board_control.SchDoc) has exactly two
L99LD20 drivers with nets DIN_1/2, CSN1/2, Conn CHK and Temp_Sense. The Year Two design has five drivers
(CSN[4..0]) and a CD74HC4051 mux.

---

## 3. Shared pieces (all RP2040 boards)

Confirmed:

- Every board with an MCU uses the same Altium device sheet `Device_Sheets/RP2040_with_CAN.SchDot`:
  RP2040, W25Q128JVSIQ 16 MB flash, 12 MHz crystal, Tag-Connect TC2030 SWD, BOOT/RESET buttons, RGB
  status LED (EAST1616RGBB4), MCP2517FD CAN FD controller on SPI, TJA1442AT transceiver, and a
  CAS-220TA slide switch for split termination (2 x 60.4 ohm). Source: schdoc_parts.py on the .SchDot.
- Pin map shared by all boards: SPI0 for the CAN controller (nCS 17, SCK 18, MOSI 19, MISO 20), clock out
  21, interrupt 22, status LED 13/14/15 (red = fault), debug UART TX 16.
  TF `lib/titan_boards/include/boards/mk2/blocks/rp2040_can_block.h`.
- The RP2040 generates a 4 MHz clock from its 48 MHz USB clock for the MCP2517FD, which multiplies it
  by 10 to 40 MHz; SPI at 20 MHz. TF `lib/driver_canbus/src/can_mcp251XFD.c#L54-L62`, `#L252-L261`.
- Firmware builds assume 2 MB flash by default (`PICO_FLASH_SIZE_BYTES`) even though the part is 16 MB.
  TF `lib/titan_boards/include/boards/mk2/blocks/rp2040_uwrt_block.h`.
- CAN buses (TF `lib/titan_boards/include/robots/talos.h#L16-L25`): internal = CAN FD, 1 Mbit/s nominal,
  5 Mbit/s data, bus ID 1; external = classic CAN 250 kbit/s, bus ID 2.
- On the Orin the boards are reached through `micro_ros_agent can -D can0 -m rmw`, started by
  riptide_hardware2 `hardware.launch.py` via `copro_agent.launch.py`. The can1 (external bus) agent entry is
  commented out. RC `riptide_hardware/launch/copro_agent.launch.py`.
- Why one MCU per board: the DeviceList comments tell how Mark 1's shared I2C kept failing (a 3 ft I2C
  run to the depth sensor) and that this convinced the team to put an RP2040 on every board and use CAN.
  TF `tools/DeviceList.jsonc` (comment on "Team raspberry pi pico (5th one in the order box)").
- Board connectors: Molex Mini-Fit Jr for power + CAN between boards, Redcube M4 85 A press-fit terminals
  for high current, Anderson PP45 for the batteries, JST XH/GH for small signals, micro-USB on every MCU.

CAN client IDs (confirmed, client_ids.h): internal 1 POWER_BOARD (used by POAC), 2 ESC_BOARD0,
3 ESC_BOARD1, 4 CAMERA_CAGE_BB, 5 ACTUATOR_BOARD (retired), 6 LED_BOARD, 7 SBC_BOARD (header only, no
Talos firmware), 8 IVC_BOARD; external 1 SMART_BATERY_PORT, 2 SMART_BATERY_STBD, 6 DOWNWARDS_CAMERA.

---

## 4. Board by board

### POAC board (power + actuator)

Confirmed (schematic sheets Poactuator_*.SchDoc, PCB netlist, firmware talos/PoacBoard):

- Size 177.8 x 127 mm (7 x 5 in), same outline as the ESC and old power/actuator boards.
- Battery inputs: J3 "PORT BATTERY" and J4 "STBD BATTERY", Anderson PP45. Each goes through an LTC4412
  ideal-diode controller + 2 x SiR167DP P-FETs onto V+ (the schematic calls these "Port/Starboard
  Battery Balancer"; electrically it is an ideal-diode OR, so the higher battery supplies the bus).
  The LTC4412 STAT outputs go to GPIO 10/11 and are reported as `port_powering`/`stbd_powering`;
  `state/batteries_balanced` is true when both are supplying.
- V+ -> MBRB2545CT Schottky -> Vreg -> two TDK-Lambda i6A4W020A033V-001-R modules (library description:
  non-isolated PoL, 9-53 V in, 3.3-15 V out, 20 A): PS1 makes 15 V (trim R12 1.24 k), PS2 makes 5 V
  (trim R13 8.56 k).
- 15 V -> MIC29300-12 LDO -> 12 V, which goes only to LID_CONN1 (GND, 12V, ACT_PWM_5V, ACT_CHECK_5V)
  for the servo. 5 V -> LM1117-3.3 -> 3V3 for the RP2040 block.
- Kill switch: V+ -> 3 x SiR167DP (P-ch 30 V 60 A) in parallel -> MOTOR_PWR -> J7/J8 "ESC PWR" (Redcube),
  gate drivers 3 x TC4432. The KILL_SWITCH line from J1 is filtered (1 k + 10 uF), pulled up to V+, read
  by the RP2040 through an NMOS (PHYS_KILLSWITCH, GPIO1), and also passes through a DG448 analog switch
  controlled by SOFTWARE_KILL (GPIO2) before it becomes MOTOR_EN. So the robot only gets thruster power if
  the physical switch is in AND the RP2040 allows it. Firmware comment: "This allows the microcontroller
  to override the kill switch signal to kill the vehicle ... kill power to the ESCs even if the kill
  switch is inserted". GPIO2 starts in the kill state before safety is initialised.
  TF `talos/PoacBoard/src/safety_interface.c`.
- MCP3428 16-bit ADC (I2C 0x68) channels, from the netlist: ch1 3V3_MEAS, ch2 Vreg_MEAS, ch3 15V_MEAS,
  ch4 5V_MEAS. Firmware maps them to `three_volt_voltage` (10k/10k divider), `balanced_voltage`,
  `twelve_volt_voltage` and `five_volt_voltage` (10k/1k). So **`twelve_volt_voltage` is the 15 V rail**;
  that is why the diagnostics expect 14.7-16.0 V for it. `port_voltage`/`stbd_voltage` are always 0.
  TF `talos/PoacBoard/src/ros.c#L133-L157`, RC `riptide_hardware/cfg/diagnostic_thresholds.yaml`.
- SHT41 temperature/humidity -> `state/temp/poacboard`, `state/humidity/poacboard`.
- Fan: 5 V switched by FDD4141 + PMV13XN (FAN_SWITCH, GPIO28), tach on GPIO29, J11. Turned on at boot;
  `command/electrical` ENABLE_FANS/DISABLE_FANS.
- Servo: one Hiwonder bus servo, half-duplex UART at 115200 baud from a PIO state machine on GPIO27,
  level shifted 3.3 <-> 5 V by a TXB0102. Indexes 2 torpedoes (240 and 200 deg) and 2 markers
  (0 and 50 deg). Firing is refused when killed, not armed, empty or already moving.
  TF `talos/PoacBoard/src/actuators/ros_torp.c`, `.../hiwonder_driver.h`.
- Connectors: J5 "STACK LINK" (CANL, GND, V+, CANH, 5V, 15V), J6 "CAMERA CAGE" (CANL, 3 x GND, CANH, 5V,
  2 x 15V), J1 (GND, GND, KILL_SWITCH, AUX_SWITCH), J9/J10 "ESC GND".
- Timers: heartbeat 100 ms, firmware status 1 s, state/kill every 150 ms (and on change),
  state/electrical 1 s, aux switch 1 s, actuator status 500 ms. TF `talos/PoacBoard/src/main.c`.
- Topics (firmware_topics.py): publishes heartbeat, state/firmware, state/kill, state/physkill_notify,
  state/electrical, state/aux, state/batteries_balanced, state/temp/poacboard, state/humidity/poacboard,
  state/actuator/{busy,status,dynamixel,cmd_feedback,cmd_status}; subscribes command/software_kill,
  command/electrical, command/actuator/{torpedo,dropper,arm,notify_reload,torpedo_marker/go_home,torpedo_marker/set_home}.
- Team website: "two TDK-Lambda Voltage Regulators, capable of providing up to 250W of power"
  (uwrt.org legacy-site.md). Quote it as the team's claim.

Inferred / open:

- Which revision is physically in Talos: the rendered PCB4 includes the 2026-02-18 "separate output for
  servo 12V" change; unconfirmed that the built board has it.
- The battery cables run from the housings' subconns to J3/J4: the harness is not in the designs.

### ESC board (x2)

Confirmed (ESC.SchDoc, netlist, silk, firmware talos/ESCBoard):

- Four APD 80F3[X] ESCs (schematic description: "15-35V 80A"). Each ESC has its own 15 A fast fuse
  (Bel 0685H9150); the board input has a 60 A Eaton 1245HC60 fuse after two SiR167DP P-FETs used as
  reverse-voltage protection (schematic block "Reverse Voltage Protection").
- Power in on Redcube terminals "ESC V+" / "ESC GND"; motor phases out on one 12-pin Mini-Fit
  "Thruster SubConn" (3 phases x 4). J6 "ESC Stack Link": GND, CANL x2, 5V, CANH x2. J7-J10
  "FLASH CONN" (5V, RX, TX, GND) per ESC for the APD configurator. J12 breakout of all DShot/telemetry lines.
- Board ID: solder jumper SB1, silk "Unpopulated: ID 0 (Thrusters 1-4), Populated: ID 1 (Thrusters 5-8)".
  Firmware reads it on GPIO29 and picks CAN client 2 or 3. TF `talos/ESCBoard/src/main.c#L47`.
- VCC_MEAS divider 10k/1k into the ADC; ESCs count as powered above 9 V. TF `talos/ESCBoard/include/dshot.h#L35-L39`.
- DShot600 bidirectional (PIO0) + ESC UART telemetry (PIO1); 7 pole pairs; thrusters held off 5 s after
  ESC power appears; stop if no command for 500 ms, then stay off 1 s. TF `talos/ESCBoard/include/dshot.h`.
- disabled_flags: SAFETY_KILLED, ESC_BOARD_OFF, ESC_POWERON_DELAY, TGT_RPM_STALE, TGT_RPM_STALE_PENALTY,
  CONTROLLER_UNCONFIGURED. TF `talos/ESCBoard/include/core1.h`.
- The APD 80F3 firmware had no 3D (reversible) DShot; the team patched it in by reverse engineering
  (Ghidra). The patched binary is not public. Settings file: `Talos_Config.cfg`.
  TF `talos/ESCBoard/esc_firmware_patching/README.md`.
- Topics: publishes state/firmware, state/fw_heartbeat, state/thrusters/{rpm,cmd,telemetry};
  subscribes command/thruster_rpm, state/kill.
- Project: "ESC MK II", rev 1.1, design review 01/08/2023, lead Robert Pafford (Tempest Mark 2, reused on Talos).

Inferred / open: ESC logic 5 V comes over the ESC stack link (J6 pinout differs from the POAC stack
link, so the cable/source is not shown in the designs). Thruster model is not in these sources.

### Camera cage breakout board (CCBB)

Confirmed (CameraCageBB.SchDoc, netlist, silk, firmware talos/CameraCageBB):

- 50.8 x 136.6 mm. Gets 15 V + 5 V + internal CAN from the POAC on J6 (8-pin Mini-Fit, silk "CAM CAGE").
  SiR167DP reverse-polarity protection on the 15 V input.
- Switched outputs: Orin power J17 "ORIN" (15 V via FDD4141, ORIN_SW GPIO6, turned on at boot); Peltier
  J3 "PELTIER" (15 V via FDD4141, PELT_SW GPIO5); fans J2/J4/J7/J8 "FAN 1-4" (5 V via TSM500P02, FAN_SW
  GPIO0, tach inputs GPIO2/3/4, turned on at boot).
- DVL Ethernet: J14 (silk "DVL SUBCONN") carries the Ethernet pairs plus 15 V/GND on pins 7-8; J13
  (silk "DVL | SWITCH") passes the pairs on without power. Schematic label "Ethernet Power Injection.
  Route all signals with 100ohms differential". J16 "SWITCH": 5 V for the network switch.
- Depth sensor: J15 JST GH 4-pin (5V, SCL, SDA, GND) and J18 "Depth Backup". Firmware reads an
  MS5837-02BA at 200 kHz I2C and publishes `state/depth/raw` in frame `talos/pressure_link` and
  `state/depth/temp`. (The team website lists a Blue Robotics Bar02, which uses the MS5837-02BA.)
- J10 "ORIN CAN" (5-pin XH): external CAN H/L, GND, internal CAN H/L. J1/J5 "EXT. CAN": external CAN + 15 V.
- J9 "LED STRIP": RGB status strip on GPIO9, driven from PIO0; set by `command/led` with the CCB target bit;
  flashes on kill-switch changes (`state/physkill_notify`).
- J11 "EXTRA POWER": 3V3, 5V, 15V, GND. SHT41 on board.
- `state/leak` publisher is created but the periodic publish is commented out; the team no longer uses
  the leak sensor.
- Project "Camera Cage BB MK II", rev 1.1, design review 1/10/2023; last commit 2024-11-10 "Added connectors and LDOs".

Inferred / open: whether a Peltier and four fans are fitted today; what is plugged into EXT. CAN.

### LED board and LED module

Confirmed: two ST L99LD20 SPI buck LED drivers (2 channels each: Red, Green, Blue, White), 220 uH
inductors, powered from V+; logic from 5 V. J1 (Samtec LS2 10-pin) to the LED module: 4 anodes, GND,
Temp_Sense, Conn CHK. J2 stack link (CANL, GND, V+, CANH, 5V). Firmware subscribes `command/led`,
`state/kill`, `state/physkill_notify` (flash red on kill-switch removal, blue on insertion) and
`state/depth/raw` (brightness scales with depth). Modes: solid, slow flash, fast flash, breath, singleton
flash. TF `talos/LEDBoard/src/ros.c`.

LED module (aluminium PCB, "LED Aluminum", lead Sam Tomlinson): 4 x OSRAM LE RTDUW S2WM RGBW LEDs and a
22 k NTC (NTCS0603E3223FMT). Inferred to be the module the LED board drives (pin names match).

### IVC board

Confirmed (IVC schematics, netlist, firmware talos/IVCBoard):

- Transmit: RP2040 tone (Rp2040Sig, GPIO7) or Bluetooth audio, selected by MAX4520 switches
  (OutputSelect, GPIO3) -> OPA1664 low-pass -> OPA604 -> OPA548 power op-amp -> J1 TransducerOut.
  Power amp rails +/-24 V from a TRACO THN 15-2425N isolated converter on V+ (1.5 A fuse F1).
- Receive: J1 HydrophoneIn -> OPA228 + 3 x OPA2889 filter/amp chain -> ADC (GPIO26). +/-5 V from an
  AM1DS-0505DH30 isolated converter. J5 backup hydrophone (+5, -5, signal, GND).
- Microchip BM83 Bluetooth 5.0 audio module (many no-fit jumpers around it). Team website: "a Bluetooth
  module to play music on the transducer".
- Protocol: two tones, 17 kHz and 19 kHz, 50 ms per symbol, 8 data bits + 4-bit CRC per packet; receive
  with an FFT. TF `talos/IVCBoard/src/ivc.c#L17-L26`. Topics: publishes ivc/rx, ivc/debug_rx_mag;
  subscribes ivc/tx, ivc/debug_tx_frequency, state/kill.
- Schematic note: "Populate SB5 0 ohm for Lil' Boat, DNP for Talos". Firmware chooses its Talos
  thresholds when GPIO6 reads low.
- Project "IVC Board" rev 1.0, lead John Ulm; designed Mar-Apr 2025.

Not confirmed: pinger localisation on this board (the website says IVC merges the old acoustics board's
pinger detection; the firmware read here only does the modem).

### Smart battery housings (MCU + BMS, x2)

Confirmed:

- BMS board: TI BQ40Z80 gas gauge/protector, 2 x PSMN4R4-80BS N-FETs (80 V 100 A), Littelfuse
  ITV9550L2045MR 45 A self-control protector, balance connector (6-pin XH = 5 cells), 2 thermistor
  inputs, Redcube terminals for the pack. Diagnostics use 45 A as `battery_current.fuse`.
- Cells: 5 in series (`NumCellSeries=5` in the chemistry-identification config; firmware reads cell 1-5
  voltages). Gas-gauge config: cell under-voltage 3000 mV, over-voltage 4200 mV, discharge over-current
  11.25 A / 20 A tiers. TF `talos/SmartBattery/bq40z80_files/`. The same file lists 2000 mAh design
  capacity, which may be a test value: **do not quote it as Talos's pack capacity**.
- Design pack (team's BMS notes, TF `talos/SmartBattery/bq40z80_files/BQ40Z80 Configuration.txt#L1-L4`):
  "Designed for MaxAmps 8000 mAh 5S2P 18.5V LiPo battery pack", chemistry ID 1356, charge to 4.15 V per
  cell, discharge no lower than 3.2 V per cell. So about 16-20.75 V per pack in use, 8 Ah x 18.5 V = 148 Wh
  (the electrical chapter quotes 148 Wh from this). The .gg.csv protection thresholds above (CUV 3000 mV,
  COV 4200 mV) are the hard limits behind those working limits. The notes also record that a permanent-fail
  fuse event happened at RoboSub 2024 ("IT DID AT RS24").
- RS26 TDR: Talos and Triton "use the same custom external battery pack, allowing batteries and charging
  equipment to be shared between vehicles".
- Power inside the housing (netlists): BMS J2 Pack_in+ (cells) -> F1 45 A protector -> Q1/Q2 back-to-back
  N-FETs (BQ40Z80 high-side drive) -> J3 Pack+; J5 Pack-, J4 BAT-. The MCU board gets VBAT on J1 pin 8,
  switched by a DMP3056L P-FET soft latch (Q1) to VCC -> TS30041 5 V (1 A, 40 V max in) -> XC9236 3.3 V
  (600 mA). BMS J1 pin 3 is Pack+ through a 5 A fuse (F3).
- MCU board: RP2040 block, TS30041 5 V buck, XC9236 3.3 V buck, 128x32 OLED, SHT41, reed switch
  (magnet power button) and a soft power latch (PWR_CTRL) so the MCU can switch itself off when the pack
  is idle and the display is off. SMBus to the BQ40Z80 is done in PIO because the pins are swapped
  relative to the hardware I2C mux.
- CAN: external bus. The client ID is the housing serial number stored in flash at 0x101FF000 (must match
  the BQ40Z80's serial; DeviceList has housings #1-#5), **not** the PORT/STBD constants; port vs
  starboard is reported in `BatteryStatus.detect` from a side-detect pin. TF `talos/SmartBattery/src/main.c#L200`.
- The leak-triggered emergency power cut in the firmware is commented out.
- Projects "Smart Battery Housing | MCU/BMS", rev 1.1, lead Robert Pafford (Jan 2023).

Open: `pretest_checks` expects housings at external IDs 1 and 2, which only holds if housings #1 and #2
are fitted. riptide_core 720bdd9 (2026-10-27) says "turn off external uros agent until poac/batteries
happy", so the battery telemetry on the external bus is not reaching ROS at the moment.

### Jetson AGX breakout (inferred fitted)

Two TJA1442 CAN transceivers (can0, can1, each with a termination switch), SN65C3221 RS-232 for the IMU
(`/dev/ttyTHS0` in RC `riptide_hardware/launch/imu.launch.py`), on the Orin 40-pin header. Power
(netlist): J2 pin 1 is +5 taken straight from the header's 5 V pins; transceivers run on 3v3. Silk
"REV 1.1.1". 2026-09-24: IMU power-switch NMOS removed so J2 pin 1 is always 5 V
(`imu_pwr_cycle.yaml` still exists in riptide_hardware).

### Jetson M.2 RS-422 card (inferred fitted)

E-key M.2 card: SP335E transceiver in RS-422, LM27313 boost to 8 V and LP38693 LDO to 5 V for the gyro,
TLV70018 1.8 V. Power chain (netlist): M.2 3V3 -> LM27313 boost -> 8V -> LP38693-5.0 -> 5V on J1 pin 1
(the gyro); the SP335E runs on 3V3 + 1V8. Gyro config uses `/dev/ttyTHS2` (RC `riptide_gyro/config/gyro_config.yaml`).

---

## 5. Power tree (power.json)

Confirmed path, as far as the designs show:

```
port battery (5S, BMS + 45 A protector) --J3--\
                                               > ideal-diode OR (LTC4412 x2) -> V+ bus
stbd battery (5S, BMS + 45 A protector) --J4--/
V+ -> kill switch (3 P-FETs, needs physical switch AND RP2040) -> MOTOR_PWR -> ESC board 0, ESC board 1
      (each: reverse protection, 60 A fuse, 4 x 15 A fuse, 4 ESCs) -> 8 thrusters
V+ -> Schottky -> Vreg -> PS1 15 V (20 A module) -> 12 V LDO -> servo
                                                -> stack link, camera cage link
                       -> PS2 5 V (20 A module) -> 3.3 V LDO on every board, fans, stack link, camera cage
V+ -> stack link -> LED board (LED drivers), IVC (isolated +/-24 V for the transducer amp)
each housing: cells -> 45 A protector -> BQ40Z80 FETs -> Pack+ -> (housing cable, not in designs) -> POAC J3/J4
              cells -> BAT+ -> SBH MCU soft latch -> 5 V buck -> 3.3 V buck (RP2040, OLED)
Orin side:    40-pin header 5 V -> AGX breakout J2 -> IMU;  M.2 3.3 V -> 8 V boost -> 5 V LDO -> gyro
camera cage board: 15 V -> Orin (switched), DVL (Ethernet power injection), Peltier (switched),
                   external CAN connectors; 5 V -> network switch, fans, depth sensor, RGB strip
```

Diagnostics thresholds (RC `riptide_hardware/cfg/diagnostic_thresholds.yaml`): battery_volt warn 18.5 V,
thruster_cutoff 17 V; battery_current warn 35 A, fuse 45 A; 3V3 3.2-3.4; 5V 4.7-5.7; "twelve_volt"
(really 15 V) 14.7-16.0; balanced (Vreg) 18.5-21.5. Note the diagnostics node is no longer used, but
pretest_checks reuses these numbers.

Inferred: the 5 V for the ESC logic arrives over the ESC stack link from the POAC side (cable not in the designs).
Inferred: the battery housing cable from the BMS Redcube terminals to the POAC Andersons (not in the designs).
Inferred: the IMU and gyro branches (the two Orin-side boards are inferred to be fitted; their netlists are confirmed).

power.json (2026-10-31): 31 nodes, 36 edges. `bat_port -> or` and `bat_stbd -> or` are kept as direct edges
because tools/electrical/build_system.py asserts them; the BMS chain is in the battery node `detail`, and
`bat_* -> sbh_logic` edges add the housing's own MCU supply. New load nodes `imu` and `gyro` hang off `orin`.
boards.json `power` ({inputs, makes, feeds}) is now filled for sbh_mcu, sbh_bms, agx_breakout and agx_m2;
sbh_bms `battery` gains `design_pack`, `design_pack_note`, `design_pack_source`.

---

## 6. Background (team website, older docs)

From [uwrt.org legacy-site.md](https://github.com/osu-uwrt/uwrt.org/blob/main/docs/content/legacy-site.md)
(the archived old site text; treat as background):

- Mark 2 electronics: developed 2022-23 from Tempest's Mark 1 lessons; distributed architecture with an
  MCU on each board talking CAN; "The port side of the vehicle contains the four primary circuit boards,
  known as the Board Stack ... The starboard side ... contains the computational and sensor elements".
- Orin has "a CAN breakout board (electronics system communication), RS 422 breakout board (Fiber Optic
  Gyro interface) and GSML2 capture card (camera interface)".
- Talos sensors: VectorNav VN-100 IMU, Nortek DVL 1000-300m, Fizoptika fibre-optic gyro, Blue Robotics
  Bar02 depth sensor, ZED X / ZED X Mini cameras.
- Exported schematic PDFs: electric_boogaloo releases `Tempest_mk_2`, `talos_boards`, `ssfb_boards`.

---

## 7. Shared-file requests / notes for chapter authors

- No shared-file changes needed. The renders are big (1400 px); in a figure use `width: 100%` with a
  `max-height` (for example 70vh) and `object-fit: contain`, or use the `-landscape` copies for the tall
  boards.
- hotspots.json pairs with the renders for a tap-to-identify figure; positions were checked on POAC and
  CCBB overlays. Radius includes +1 mm so small chips stay tappable.

---

## 8. Cross-check with the RS26 TDR (2026) and firmware branches

Source: [RS26 TDR](https://robonation.org/app/uploads/sites/4/2026/07/RS26_TDR_TheOhioState_UWRT.pdf),
section "B. Talos Electrical" and "E. Triton Electrical" (text read with pdftotext). Where it disagrees with
the code, **the code wins** for what the site states, and the chapter can mention the difference.

Agrees with the designs/code (confirmed twice):
- "a dedicated RP2040 microcontroller on each circuit board, with boards exchanging ROS2 messages over a
  custom CAN bus protocol"; Triton reuses Talos's circuit designs and firmware.
- APD 80F3 ESCs (Triton boards are "approximately 36% smaller than their equivalent Talos counterparts").
- IVC: RP2040 drives the transducer with PWM for transmit (firmware uses a PWM slice) and samples the
  hydrophone with its own ADC; frequency-shift keying.

TDR only (not in code or designs; quote as the team's report):
- IVC hydrophone is an Aquarian Audio H1C.
- Talos and Triton share the same external battery pack and charging equipment.

Disagrees with the code:
- **IVC frequencies.** TDR: "transmit frequencies of 51, 52, and 53 kHz" with a synchronisation signal.
  Code: `FREQ_LOW_HZ 17000`, `FREQ_HIGH_HZ 19000`, 50 ms symbols, 8 data bits + 4-bit CRC
  (TF `talos/IVCBoard/src/ivc.c#L17-L26`), identical on master and every remote branch including
  `blake/ivc` (checked 2026-10-31). Use the code's numbers; say the report describes a different version.
- **Claw firmware.** TDR: servo firmware with multiple servos, multi-turn tracking past the 0-240 deg range,
  positions persisted across reboots, stall detection for the claw. On titan_firmware **master** the POAC
  drives one Hiwonder servo for torpedoes + markers. The claw topic names (`command/actuator/claw`,
  `.../claw/set_closed_pos`) are defined in `talos/PoacBoard/src/actuators/ros_torp.c#L38-L43` but never
  subscribed, and `claw_state` is always published as 0 (`#L377`). The claw work is on unmerged branches:
  `poac-multiple-servos` (8 ahead / 12 behind master; "Poac multiple servos" 2026-03-01 ... "Claw is ID 3"
  2026-06-28), `servo-continuous-persistence` (12 ahead, 2026-04-14) and `claw-improvements` (2 ahead;
  "Improved claw by adding voltage + wrap around" 2026-10-04, "fix arming issues" 2026-10-09). Which build
  is flashed on Talos today is **unconfirmed** (the Orin is offline; `state/firmware` would tell).
- `blake/ivc` (23 ahead, "ivc dac project" 2026-10-08) also adds `talos/LEDBoard2`, firmware for the
  Year Two 5-driver LED board. Not on master, so the Year One LED board remains the confirmed one.

