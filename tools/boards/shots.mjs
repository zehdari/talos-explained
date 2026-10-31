// Interactive-state screenshots of boards.html for checking: explorer with names on (POAC, CCBB, FOG card),
// the tab bar, and the system diagram's Power view.
// Usage: node tools/boards/shots.mjs [width] [height]   (writes /tmp/bx_<w>_*.png; uses the shared dev server)
import { launch, newPage, shootElement } from '../browser.mjs';
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844);
const BASE = process.env.BASE || 'http://127.0.0.1:5300/talos-explained/';
const browser = await launch();
const p = await newPage(browser, { width: W, height: H });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(BASE + 'boards.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const out = (n) => `/tmp/bx_${W}_${n}.png`;
await p.evaluate(() => { const c = document.getElementById('bx-names'); c.checked = true; c.dispatchEvent(new Event('change')); });
await shootElement(p, '#bx .bx-view', out('poac-names'), 800);
for (const id of ['ccbb', 'agx_m2', 'led', 'sbh_bms']) {
  await p.evaluate((id) => document.querySelector(`.bx-chip[data-id="${id}"]`).click(), id);
  await shootElement(p, '#bx .bx-view', out(id + '-names'), 600);
}
await p.evaluate(() => { const c = document.getElementById('bx-names'); c.checked = false; c.dispatchEvent(new Event('change')); });
await p.evaluate(() => document.querySelector('.bx-chip[data-id="ccbb"]').click());
await shootElement(p, '#bx .bx-view', out('ccbb'), 600);
await shootElement(p, '#bx-info', out('info'), 400);
await p.evaluate(() => document.querySelector('.bx-tabs [data-tab="fw"]').click());
await shootElement(p, '#bx-info', out('fw'), 400);
for (const k of ['all', 'power', 'data']) {
  await p.evaluate((k) => document.querySelector(`#sys-filter [data-k="${k}"]`).click(), k);
  await shootElement(p, '#system-fig', out('sys-' + k), 600);
}
await p.evaluate(() => {
  const n = [...document.querySelectorAll('#sys-graph .node')].find((g) => /IVC/.test(g.textContent));
  n && n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
});
await shootElement(p, '#system-fig', out('sys-ivc'), 600);
console.log(errs.join('\n') || 'no console errors');
await browser.close();
