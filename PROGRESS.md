# talos-explained build progress (for the agent; resumes after a usage-limit pause)

Goal: one site "How Talos works" combining ~/riptide-perception-explained (perception/) and ~/riptide-mpc-explained (control/)
with new chapters for everything else (vehicle hardware, electrical, boards, firmware, sensors, ROS 2, setup, autonomy,
launch, Nereus sim + viewer, pool tests, debugging, appendices). Site map: src/site.js. Template: docs/chapter-template.*.
Dev server: systemd unit talos-dev (vite, port 5300, base /talos-explained/). Watchdog: unit talos-watchdog.
Deploy target: github.com/zehdari/talos-explained (GitHub Pages), same as the two sister sites.

## Status
- [x] Scaffold: merged parts, unified rail (collapsible parts), placeholders for every new chapter (2026-10-30)
- [ ] Workflow 1 (run wf_8a910184-ed8, script ~/.claude/projects/-home-cameron/fd0185d1-115f-4073-90f0-09354ea0e5c5/workflows/scripts/talos-explained-build-wf_8a910184-ed8.js): media (Nereus, CAD, boards) + 23 chapter writers + per-chapter review/fix. If cut off: Workflow({scriptPath, resumeFromRunId}) to reuse finished agents.
- [ ] Overview, interfaces appendix, glossary
- [ ] Global review panel + fixes
- [ ] Build, commit, push, Pages
