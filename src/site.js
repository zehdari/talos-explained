// The whole site in reading order. hrefs are relative to the site root. Chapter numbers restart in each part;
// a part's own overview page (perception/, control/) is its chapter 0.
export const PARTS = [
  {
    id: 'start',
    title: 'Start here',
    chapters: [
      { href: 'index.html', title: 'How Talos works', n: '' },
      { href: 'robosub.html', title: 'RoboSub and the course' },
      { href: 'ros2.html', title: 'ROS 2, the Talos way' },
      { href: 'code-map.html', title: 'A map of the code' },
      { href: 'setup.html', title: 'Setting up your machine' },
    ],
  },
  {
    id: 'vehicle',
    title: 'The vehicle',
    chapters: [
      { href: 'mechanical.html', title: 'Hull, frame and layout' },
      { href: 'electrical.html', title: 'Power and wiring' },
      { href: 'boards.html', title: 'The circuit boards' },
      { href: 'firmware.html', title: 'Firmware on the boards' },
      { href: 'thrusters-hw.html', title: 'Thrusters and ESCs' },
      { href: 'actuators.html', title: 'Torpedoes, dropper and claw' },
      { href: 'sensors.html', title: 'Navigation sensors' },
      { href: 'cameras.html', title: 'The cameras' },
      { href: 'localization.html', title: 'Where am I? State estimation' },
      { href: 'computers.html', title: 'Computers and networks' },
    ],
  },
  {
    id: 'perception',
    title: 'Perception',
    tag: 'How Talos sees',
    chapters: [
      { href: 'perception/index.html', title: 'Overview', n: '0' },
      { href: 'perception/calibration.html', title: 'Cameras and calibration', group: 'Vision' },
      { href: 'perception/training.html', title: 'Training the detector' },
      { href: 'perception/detector.html', title: 'The detector, frame by frame' },
      { href: 'perception/pose.html', title: 'From a mask to a pose' },
      { href: 'perception/composites.html', title: 'Props made of several pieces' },
      { href: 'perception/noise.html', title: 'How far to trust a detection', group: 'Mapping' },
      { href: 'perception/tracking.html', title: 'Tracking one object' },
      { href: 'perception/map.html', title: 'The course map' },
      { href: 'perception/frames.html', title: 'Frames, targets and the mission tree' },
      { href: 'perception/mission.html', title: 'One mission in Nereus' },
      { href: 'perception/workflow.html', title: 'Working on it yourself', group: 'Your turn' },
      { href: 'perception/math.html', title: 'The math in one place', n: 'A', appendix: true },
    ],
  },
  {
    id: 'control',
    title: 'Control',
    tag: 'How Talos flies',
    chapters: [
      { href: 'control/index.html', title: 'Overview', n: '0' },
      { href: 'control/model.html', title: 'The Fossen model' },
      { href: 'control/thrusters.html', title: 'Thrusters and allocation' },
      { href: 'control/matters.html', title: 'Which numbers matter' },
      { href: 'control/reference.html', title: 'Where to go: profiles and paths' },
      { href: 'control/mpc.html', title: 'The optimal control problem' },
      { href: 'control/solver.html', title: 'Solving it every 50 ms' },
      { href: 'control/estimation.html', title: 'Feedback and model error' },
      { href: 'control/identify.html', title: 'System identification' },
      { href: 'control/build.html', title: 'Build your own' },
      { href: 'commanding.html', title: 'Commanding Talos: goals, teleop, kill' },
      { href: 'control/math.html', title: 'The math in one place', n: 'A', appendix: true },
    ],
  },
  {
    id: 'autonomy',
    title: 'Autonomy',
    chapters: [
      { href: 'bt.html', title: 'Behaviour trees' },
      { href: 'bt-nodes.html', title: "Talos's tree nodes" },
      { href: 'mission-tree.html', title: 'The competition mission' },
      { href: 'bt-workflow.html', title: 'Writing and testing trees' },
    ],
  },
  {
    id: 'ops',
    title: 'Running Talos',
    chapters: [
      { href: 'launch.html', title: 'Launching the stack' },
      { href: 'nereus.html', title: 'Nereus, the simulator' },
      { href: 'viewer.html', title: 'The Nereus viewer' },
      { href: 'pool-test.html', title: 'Pool test day' },
      { href: 'debugging.html', title: 'Debugging, bags and data' },
    ],
  },
  {
    id: 'appendix',
    title: 'Appendices',
    chapters: [
      { href: 'interfaces.html', title: 'Topics, services and frames', n: 'A' },
      { href: 'glossary.html', title: 'Glossary', n: 'B' },
    ],
  },
];

// Number the chapters within each part (unless a number is given).
for (const p of PARTS) {
  let k = 1;
  for (const c of p.chapters) {
    c.part = p;
    if (c.n === undefined) c.n = String(k++);
  }
}

export const ALL = PARTS.flatMap((p) => p.chapters);
