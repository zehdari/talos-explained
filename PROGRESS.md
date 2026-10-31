# talos-explained build progress (for the agent; resumes after a usage-limit pause)

Goal: one site "How Talos works" combining ~/riptide-perception-explained (perception/) and ~/riptide-mpc-explained (control/)
with new chapters for everything else (vehicle hardware, electrical, boards, firmware, sensors, ROS 2, setup, autonomy,
launch, Nereus sim + viewer, pool tests, debugging, appendices). Site map: src/site.js. Template: docs/chapter-template.*.
Dev server: systemd unit talos-dev (vite, port 5300, base /talos-explained/). Watchdog: unit talos-watchdog.
Deploy target: github.com/zehdari/talos-explained (GitHub Pages), same as the two sister sites.

## Status
- [x] Scaffold: merged parts, unified rail (collapsible parts), placeholders for every new chapter (2026-10-30)
- [ ] Workflow 1: media (Nereus, CAD, boards) + chapter writers + per-chapter review/fix
- [ ] Overview, interfaces appendix, glossary
- [ ] Global review panel + fixes
- [ ] Build, commit, push, Pages
