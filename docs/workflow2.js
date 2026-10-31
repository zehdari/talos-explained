export const meta = {
  name: 'talos-explained-finish',
  description: 'Overview + appendices, integrate the Perception/Control parts, then a multi-lens site-wide review and fixes',
  phases: [
    { title: 'Final pages', detail: 'overview, interfaces appendix, glossary; integration pass' },
    { title: 'Panel', detail: 'site-wide reviewers, one lens each' },
    { title: 'Fix', detail: 'one fixer per file group' },
    { title: 'Verify', detail: 'build, links, phone overflow' },
  ],
}

const COMMON = `You are helping finish "How Talos works" (repo ~/talos-explained), an interactive explainer website for the Ohio State Underwater Robotics Team's (UWRT) competition AUV Talos, covering EVERYTHING: mechanical, electrical, boards, firmware, sensors, cameras, state estimation, computers/networks, ROS 2, setup, perception, control, autonomy, launching, the Nereus simulator and viewer, pool tests and debugging. Audience: NEW TEAM MEMBERS. The user wants it very polished and fully complete. They read on a phone.

THE SITE
- Vite multi-page static site, base /talos-explained/. Site map: src/site.js (parts and chapter titles/numbers). Shared shell: src/layout.js (rail, next/prev, KaTeX: .m inline, .M display), src/style.css (theme), src/css/chapter.css (aside.short, .callout, .callout.safety, pre.cmd[data-where], dl.spec, .fig .media, .media-grid, .graph-note, .chapter-list, .part-label, svg text.halo). Shared viz: src/viz/graph.js, src/viz/chart.js, src/viz/scene.js. Template: docs/chapter-template.html/.js.
- Parts: Start here (index.html overview, robosub, code-map, ros2, setup), The vehicle (mechanical, electrical, boards, firmware, thrusters-hw, actuators, sensors, cameras, localization, computers), Perception (perception/*.html, the pre-existing "How Talos sees" site, merged in), Control (control/*.html, the pre-existing "How Talos flies" site, plus root commanding.html), Autonomy (bt, bt-nodes, mission-tree, bt-workflow), Running Talos (launch, nereus, viewer, pool-test, debugging), Appendices (interfaces, glossary).
- Media libraries with manifests: docs/media/nereus.md (public/media/nereus, public/data/rosgraph: real ROS graph, topics with rates, TF tree, params, tree run), docs/media/cad.md (public/media/cad: SolidWorks renders; may be partial), docs/media/boards.md (public/media/boards, public/data/boards).
- Voice: plain, direct, concrete, short paragraphs, bullets/tables/figures over long prose; explain the why; real numbers with links to the exact file on GitHub at the branch in use (riptide_core@followpath-speed, riptide_control@mpc, riptide_perception@mapping-estimator, riptide_autonomy@autonomy-mapping, riptide_launch@newsim, riptide_gui@newsim, nereus@main, titan_firmware@master, riptide_release@master). No marketing tone, no emoji.
- Theming: keep the light paper/ink/safety-orange theme, fonts and CSS variables. No new palette, no dark pages.
- Phones: no sideways page scroll; interactives work by tap; figures have narrow layouts.
- Public asset paths: in HTML write src="/img/<chapter>/x.webp" or "/media/..." (root-absolute WITHOUT the base; Vite adds /talos-explained/ in dev and build). Writing "/talos-explained/img/..." in HTML is WRONG (double base in dev). In JS use import.meta.env.BASE_URL + 'img/...'.
- The team NO LONGER uses RViz: the Nereus viewer is the GUI for sim and the real robot. Controller is riptide_mpc. Leak sensor and diagnostics node are not used.
- Repos (local, up to date, the source of truth): ~/osu-uwrt/release (riptide_release + submodules in src/), ~/osu-uwrt/release/nereus, ~/osu-uwrt/development/titan_firmware, ~/osu-uwrt/riptide_setup, ~/pretest_checks, ~/robot. Other team repos: gh repo clone osu-uwrt/<name> /tmp/gh/<name>. User-confirmed facts: ~/.claude/projects/-home-cameron/memory/*.md (read MEMORY.md first, then the relevant ones). Facts there beat assumptions.
- Never SSH into or change the robot or team machines. No passwords, keys, Tailscale IPs or tailnet names on the site.
- Be accurate: every claim from code/config/memory/cited source; if unconfirmed, leave it out or say so.

TOOLS
- export PATH=$HOME/.nvm/versions/node/v24.22.0/bin:$PATH. Shared Vite dev server is running at http://127.0.0.1:5300/talos-explained/ (unit talos-dev); never start another.
- node tools/shot.mjs <url> <out.png> [w] [h] [waitMs] [full]; node tools/figs.mjs <page.html> <selector>... (env W/H/OUT; robust to animation); node tools/overflow.mjs [pages...] (phone overflow + console errors; W=1400 for desktop). Read the PNGs you take. Full-page shots of very long pages can repeat; prefer per-figure shots.
- Memory is tight: heavy Python under systemd-run --user --scope -p MemoryMax=6G. Close browsers; leave no processes running.
- Do NOT git commit/push. Other agents edit other files at the same time: only edit the files you are told you own.`

const FINAL_PAGES = [
  {
    name: 'index',
    scope: `The site's front page (index.html, src/pages/index.js, src/css/index.css): "How Talos works", the overview of the whole Talos system and the guide to the site. Must be the most polished page. Contents: (1) a striking hero in the house style (see perception/index.html and control/index.html heroes; e.g. the interactive 3D Talos from src/viz/scene.js / public/models/talos.glb with tappable subsystems that link to their chapters, or the real Nereus tree-run video public/media/nereus/tree-run-behind.mp4 with a live system readout - choose what is most compelling and works on phones); (2) "Talos in one minute": what it is, what it does at RoboSub, key specs (from the chapters/CAD/boards data); (3) an interactive whole-stack diagram: hardware -> firmware -> drivers -> state estimation -> perception -> mapping -> autonomy -> control -> thrusters, with tap details and links to every chapter (build it from public/data/rosgraph and the chapters); (4) "follow one decision": e.g. from a camera frame of the torpedo board to the torpedo firing, step by step across subsystems, each step linking to its chapter; (5) how to read this site + suggested reading paths for different new members (software, electrical, mechanical, autonomy, first pool test); (6) the full chapter list by part (.part-label + .chapter-list, generated from src/site.js or written out), including the Perception and Control parts. Read every chapter's lede/short version first so the overview is accurate and consistent.`,
  },
  {
    name: 'interfaces',
    scope: `Appendix A "Topics, services and frames" (interfaces.html, src/pages/interfaces.js, src/css/interfaces.css): a complete, searchable reference of Talos's ROS interfaces: every topic (name, type, publisher(s), subscriber(s), rate, QoS where known, real robot vs sim-only, and which chapter explains it), services, actions, TF frames, and the main parameters/config files per node. Build it from public/data/rosgraph/*.json (Nereus run) cross-checked and extended with the real robot's launch files/configs (riptide_launch remote_launch/launches/talos_launch_mpc.yaml etc.) and other chapters' data (public/data/commanding/commanding.json, sensors, etc.). Interactive: one search box + filters (subsystem, kind, robot/sim) over a fast table that stays readable on a phone (cards on narrow screens), deep links (#topic-<name>) other pages can use, each row linking to the explaining chapter and to the GitHub source.`,
  },
  {
    name: 'glossary',
    scope: `Appendix B "Glossary" (glossary.html, src/pages/glossary.js, src/css/glossary.css): every term, acronym and team-specific name a new member meets on this site (and in the code): e.g. AUV, DVL, FOG, IMU, EKF, TF, URDF, MPC, BT, tick, blackboard, POAC, ESC, CAN, CANmore, RP2040, micro-ROS, Zenoh, opbox, op-top, ffc/dfc, ZED, YOLO, ChArUco, Nereus, pack, HIL, colcon, overlay, kill slot, needs_update, RepairCompMpcTree, prequal, octagon, slalom... Gather them by reading all chapters (grep for <span class="term">, <code> names, acronyms) and the existing perception/control pages. Each entry: a one- or two-sentence plain definition, and links to the chapter section(s) that explain it (use real anchors that exist). Interactive: search + A-Z jump, entries with id="term-<slug>" for deep links, phone friendly.`,
  },
]

const INTEGRATE = `YOUR JOB: integration pass (you own: everything under perception/, control/, src/perception/, src/control/, the shared files src/layout.js, src/style.css, src/css/chapter.css, src/site.js, tools/*.mjs, and the img/src path fix described below in root chapter HTML files EXCEPT index.html, interfaces.html, glossary.html which other agents are writing now).
1. The Perception and Control parts were standalone sites; make them read as parts of one site without rewriting their content: fix texts that speak as a separate site (e.g. "companion site", "this site explains riptide_mpc" in a way that conflicts, footers), make cross-part links internal (they should already be relative), and add a FEW high-value links from those chapters to the new chapters where a reader would want them (e.g. perception/calibration.html -> cameras.html; perception/frames.html and perception/mission.html -> mission-tree.html and bt-nodes.html; control/thrusters.html -> thrusters-hw.html; control/estimation.html -> localization.html; control/identify.html -> pool-test.html; control/index.html -> commanding.html; perception/workflow.html -> nereus.html, viewer.html, debugging.html). Keep their kickers' part-local chapter numbers consistent with src/site.js. Mentions of RViz in those parts: rephrase as history or Nereus viewer where they describe current practice.
2. Fix public asset paths in ALL root chapter HTML files (not index/interfaces/glossary) and perception/control HTML: any src/poster/href/srcset attribute starting with "/talos-explained/" pointing at public assets (img/, media/, video/, data/, models/) must become root-absolute without the base ("/img/..."). Check with curl that the dev server now serves them (status 200 and image content type), and grep JS for hard-coded '/talos-explained/' strings that should use import.meta.env.BASE_URL.
3. Apply these shared-file requests from the chapter writers where sensible (decide; skip with a reason if not): SHARED_REQUESTS
4. Make sure every page in src/site.js exists and loads without console errors at 1400 and 390 widths (node tools/overflow.mjs; W=1400 node tools/overflow.mjs), and the rail/next-prev works across parts.
Return what you changed and anything left open.`

const PANEL = [
  { key: 'acc-start-autonomy-ops', prompt: `LENS: factual accuracy and completeness of the Start here, Autonomy and Running Talos parts plus commanding.html (index, robosub, code-map, ros2, setup, commanding, bt, bt-nodes, mission-tree, bt-workflow, launch, nereus, viewer, pool-test, debugging). Verify at least 60 specific claims (numbers, names, file links, behaviours, commands) against the real code/config/memory. Every wrong, outdated (e.g. RViz as current), or unsupported claim is a finding. Also flag important missing topics.` },
  { key: 'acc-vehicle', prompt: `LENS: factual accuracy and completeness of The vehicle part (mechanical, electrical, boards, firmware, thrusters-hw, actuators, sensors, cameras, localization, computers). Verify at least 60 specific claims against the CAD/boards/firmware/config sources and docs/media manifests. Wrong numbers, part names, protocols, safety statements are high severity. Also flag important missing topics.` },
  { key: 'ux-desktop', prompt: `LENS: interface and visual design on desktop (1400x900 and 1024x768). Visit EVERY page in src/site.js (including perception/ and control/). Screenshot the top and every figure (tools/figs.mjs). Check: consistency with the house style across all parts (headers, short-version asides, captions, figure panels, spacing, type), the rail (collapsible parts, current page, TOC), next/prev across parts, interactive figures actually work (click them with playwright), hover states, broken layouts, overlapping labels, empty panels, console errors, slow pages. Report concrete fixes.` },
  { key: 'ux-phone', prompt: `LENS: phone experience at 390x844 and 360x740. Visit EVERY page in src/site.js. Run node tools/overflow.mjs (390 and W=360). Screenshot each figure at phone width and use tap (page.tap) on interactives. Check: no sideways scrolling, readable labels (>= ~11 px), tap targets, figures that need a narrow layout, the Chapters button and rail drawer, long code blocks, tables, videos (playsinline, posters), heroes. Report concrete fixes.` },
  { key: 'media', prompt: `LENS: images, videos and 3D. Check every <img>, <video>, poster, canvas/3D scene and media gallery on every page: loads in the dev server (curl status + content type), sharp and readable at desktop and phone widths, well cropped, correct caption (does the caption describe what is actually shown?), meaningful alt text, file sizes (images < ~300 KB, videos < ~8 MB, total page weight reasonable), lazy loading below the fold, posters for videos, consistent framing/background across galleries, unused large files in public/ (list them), missing media where a chapter clearly needs a picture (e.g. a section describing hardware with no image though public/media has one). Report concrete fixes.` },
  { key: 'editorial', prompt: `LENS: editorial consistency across the whole site. Read every new chapter (and skim the Perception/Control parts). Check: consistent voice and terminology (same names for the same things: ffc/dfc, Nereus viewer, kill switch/slots, POAC, op-top, opbox...), contradictions between chapters (e.g. thruster count/names, kill semantics, launch service names, rates), duplicated explanations that should be one place + a link, missing cross-links where one chapter mentions something another explains, chapter numbering in kickers vs src/site.js, prose that is padded, repetitive or too thin (the user cut the Perception chapters by half for length; these chapters may be longer because they must cover everything, so cut repetition, filler and over-explaining, never coverage; prefer tables/bullets/collapsible detail for reference material), every chapter has aside.short and captions in the house style. Report concrete fixes with file and location.` },
  { key: 'newcomer', prompt: `LENS: a new team member reading the site start to finish (the target reader). Read every page in order. Where would you get lost (undefined jargon, missing prerequisite, a jump in difficulty)? What would you still not know how to do on your first day, first pool test, or when adding a feature (e.g. how to add a sensor, flash a board, add a BT node, run the sim, find a log)? What about Talos is not covered at all ("cover everything": e.g. buoyancy/trim, batteries and charging safety, the operator box, acoustics, LEDs, tether, team processes, competition rules that shape the software)? Report gaps as findings on the file where the material should go.` },
  { key: 'tech', prompt: `LENS: technical quality. Run npm test and npm run build (export PATH first) and report failures. Serve dist with npx vite preview --port 5310 --strictPort briefly (stop it afterwards) and crawl every page: broken internal links and anchors (href="x.html#id" where id doesn't exist), missing assets (404), console errors, JS errors on interaction; check page weight and JS bundle sizes (flag pages > 3 MB initial load), accessibility basics (headings order, alt text, button labels, aria on interactives, focus visible, colour contrast of small text), <title>/<meta description> on every page, external GitHub links (sample 60: check file paths exist locally in the right repo/branch with git ls-tree). Report concrete fixes.` },
]

const WRITE_SCHEMA = {
  type: 'object',
  properties: { files: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' }, unsure: { type: 'array', items: { type: 'string' } } },
  required: ['files', 'summary', 'unsure'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          file: { type: 'string', description: 'repo-relative path of the ONE file to change, e.g. sensors.html, src/pages/sensors.js, src/style.css, perception/map.html' },
          where: { type: 'string' },
          issue: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'file', 'where', 'issue', 'fix'],
      },
    },
  },
  required: ['verdict', 'findings'],
}

phase('Final pages')
const shared = (args && args.sharedRequests) || []
const integrate = agent(COMMON + '\n\n' + INTEGRATE.replace('SHARED_REQUESTS', '\n- ' + shared.join('\n- ')), { label: 'integrate', phase: 'Final pages' })
const finals = await pipeline(
  FINAL_PAGES,
  (p) => agent(COMMON + '\n\nYOUR JOB: write ' + p.name + '.html (a placeholder exists: replace it fully) and its own files (src/pages/' + p.name + '.js, src/css/' + p.name + '.css, tools/' + p.name + '/, public/data/' + p.name + '/, public/img/' + p.name + '/). Follow the page structure of the template and the existing chapters (page-head, aside.short where it fits, prose/figure blocks, h2 ids, nav.next).\nSCOPE: ' + p.scope + '\nResearch first, then write, build the interactives, and check with screenshots at desktop and phone widths and tools/overflow.mjs before finishing.', { label: 'write:' + p.name, phase: 'Final pages', schema: WRITE_SCHEMA }),
  (w, p) => agent(COMMON + '\n\nYOUR JOB: independently REVIEW ' + p.name + '.html and its files (do not edit). Scope it should meet: ' + p.scope + '\nWriter summary: ' + (w ? w.summary : '(writer failed)') + '\nCheck accuracy (verify 20+ claims and that every link/anchor exists), completeness, presentation at 1400 and 390 (screenshots of every figure; tap the interactives), phone overflow, console errors, consistency with the rest of the site. Use file = ' + p.name + '.html or its js/css file.', { label: 'review:' + p.name, phase: 'Final pages', schema: REVIEW_SCHEMA }),
  (r, p) => (!r || !r.findings.length ? r : agent(COMMON + '\n\nYOUR JOB: apply this review to ' + p.name + '.html and its own files. Verify each finding first; skip wrong ones with a reason. Re-check with screenshots and tools/overflow.mjs.\nREVIEW: ' + JSON.stringify(r.findings), { label: 'fix:' + p.name, phase: 'Final pages' })),
)
const integ = await integrate

phase('Panel')
const panel = await parallel(PANEL.map((l) => () => agent(COMMON + '\n\nYOUR JOB: site-wide REVIEW (do not edit files). ' + l.prompt + '\nEvery finding names exactly one file to change (the page html, its src/pages/*.js or src/css/*.css, or a shared file). Be specific and actionable; no vague advice. Severity high = wrong facts, broken page/figure/link, missing core topic, phone overflow.', { label: 'panel:' + l.key, phase: 'Panel', schema: REVIEW_SCHEMA })))

// Group findings by the page they belong to so one fixer owns each set of files.
const groups = {}
const SHARED = ['src/layout.js', 'src/style.css', 'src/css/chapter.css', 'src/site.js', 'src/viz/graph.js', 'src/viz/chart.js', 'src/viz/scene.js']
for (const [i, res] of panel.entries()) {
  if (!res) continue
  for (const f of res.findings) {
    let file = (f.file || '').replace(/^\.?\/?(home\/cameron\/)?talos-explained\//, '').replace(/^\//, '')
    let key
    if (SHARED.includes(file) || file.startsWith('tools/') || file === 'package.json' || file.startsWith('.github')) key = 'shared'
    else if (file.startsWith('perception/') || file.startsWith('src/perception/')) key = 'perception'
    else if (file.startsWith('control/') || file.startsWith('src/control/')) key = 'control'
    else {
      const m = file.match(/^(?:src\/pages\/|src\/css\/|tools\/|public\/(?:data|img)\/)?([a-z0-9-]+)(?:\.html|\.js|\.css|\/|$)/)
      key = m ? m[1] : 'shared'
    }
    ;(groups[key] = groups[key] || []).push({ lens: PANEL[i].key, ...f })
  }
}
const keys = Object.keys(groups)
log('panel findings: ' + keys.map((k) => k + '=' + groups[k].length).join(', '))

phase('Fix')
const fixes = await parallel(keys.map((k) => () => {
  const own = k === 'shared' ? 'the shared files (src/layout.js, src/style.css, src/css/chapter.css, src/site.js, src/viz/*, tools/*.mjs, package.json)'
    : k === 'perception' ? 'everything under perception/ and src/perception/'
    : k === 'control' ? 'everything under control/ and src/control/'
    : k + '.html and its own files (src/pages/' + k + '.js, src/css/' + k + '.css, tools/' + k + '/, public/data/' + k + '/, public/img/' + k + '/)'
  return agent(COMMON + '\n\nYOUR JOB: apply the site-wide review findings for ' + own + '. You own only those files. Verify each finding against the code/page first (reviewers can be wrong; skip with a reason). For "missing topic" findings, add the material concisely in the house style with sources. Re-check the page(s) with screenshots at 1400 and 390 and tools/overflow.mjs.\nFINDINGS:\n' + JSON.stringify(groups[k], null, 1) + '\nReturn: fixed, skipped (with reason), still open.', { label: 'fix:' + k, phase: 'Fix' }).then((r) => ({ key: k, n: groups[k].length, report: r }))
}))

phase('Verify')
const verify = await agent(COMMON + '\n\nYOUR JOB: final verification and repair of the whole site (you may edit any file to fix a concrete defect, minimally). Run npm test and npm run build; serve dist (npx vite preview --port 5311 --strictPort, stop it after) and crawl every page in src/site.js: no 404s, no broken internal links/anchors, no console errors, no phone overflow at 390 (adapt tools/overflow.mjs with BASE=http://127.0.0.1:5311/talos-explained/), every figure renders something. Fix what you find. Return a report of the final state and anything not fixed.', { label: 'verify', phase: 'Verify' })

return { finals, integrate: integ, panel: panel.map((p, i) => ({ lens: PANEL[i].key, verdict: p && p.verdict, n: p && p.findings.length })), fixes, verify }
