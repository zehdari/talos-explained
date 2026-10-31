# How Talos works

An interactive explainer for **Talos**, the Ohio State Underwater Robotics Team's RoboSub AUV, end to end: the hull and
mechanisms, power and wiring, the circuit boards and their firmware, sensors and cameras, state estimation, computers and
networks, ROS 2, perception, control, autonomy, launching, the Nereus simulator and viewer, pool tests and debugging.
Written for new team members. Live at **https://zehdari.github.io/talos-explained/**.

## Parts

- **Start here:** the overview, RoboSub and the course, ROS 2 the Talos way, a map of the code, setting up your machine.
- **The vehicle:** hull and frame, power and wiring, circuit boards, firmware, thrusters and ESCs, torpedoes/dropper/claw,
  navigation sensors, cameras, state estimation, computers and networks.
- **Perception** ("How Talos sees") and **Control** ("How Talos flies"): the two earlier explainer sites, merged in as
  parts (`perception/`, `control/`), plus *Commanding Talos* for goals, teleop and the kill system.
- **Autonomy:** behaviour trees, Talos's tree nodes, the competition mission, writing and testing trees.
- **Running Talos:** launching the stack, Nereus, the Nereus viewer, pool test day, debugging and bags.
- **Appendices:** every topic, service and frame; a glossary.

## How it's built

A Vite multi-page site. `src/site.js` is the site map; `src/layout.js` builds the chapter rail and next/previous links.
Each chapter is `<name>.html` + `src/pages/<name>.js` (+ `src/css/<name>.css`); its data comes from the real code and
configs through scripts in `tools/<name>/` that write `public/data/<name>/`.

Media was captured from the real sources: `docs/media/nereus.md` (a full `RepairCompMpcTree` run of Talos's stack in
[Nereus](https://github.com/osu-uwrt/nereus): viewer screenshots and video, the live ROS graph, TF tree and topic rates),
`docs/media/cad.md` (SolidWorks renders and a decimated 3D model of the Talos assembly) and `docs/media/boards.md`
(KiCad renders of the [electric_boogaloo](https://github.com/osu-uwrt/electric_boogaloo) boards and the facts behind
the electrical chapters). The Perception and Control parts keep their JavaScript ports of `riptide_perception` and
`riptide_mpc`, tested against the real code (`tests/`).

```sh
npm ci
npm run dev        # http://localhost:5173/talos-explained/
npm test
npm run build      # static site in dist/
node tools/overflow.mjs [page.html ...]   # phone overflow + console errors (against a dev server on :5300)
```

Pushes to `main` deploy to GitHub Pages via `.github/workflows/pages.yml`.
