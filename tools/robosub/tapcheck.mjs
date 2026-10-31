// node tools/robosub/tapcheck.mjs OUTDIR [W] [H]  — taps every step of the course figure, the locator, and other controls.
import { launch } from '../browser.mjs';
import fs from 'node:fs';
const OUT = process.argv[2] || '/tmp/rsfix/tap';
const W = +(process.argv[3] || 390), H = +(process.argv[4] || 844);
fs.mkdirSync(OUT, { recursive: true });
const src = fs.readFileSync(new URL('../browser.mjs', import.meta.url), 'utf8');
const STUB = src.match(/const HMR_STUB = `([\s\S]*?)`;/)[1];
const BASE = 'http://127.0.0.1:5301/talos-explained/';
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: W < 800, isMobile: W < 800 });
const page = await ctx.newPage();
await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }));
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(BASE + 'robosub.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const tap = async (sel) => { const l = page.locator(sel).first(); if (W < 800) await l.tap(); else await l.click(); };
const shotCol = async (name) => {
  const col = page.locator('.rs-map-col');
  await col.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(1100);
  const b = await col.boundingBox();
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: Math.max(0, b.y - 4), width: W, height: Math.min(H, b.height + 8) } });
};
const steps = await page.locator('#task-chips button').count();
for (let i = 0; i < steps; i++) {
  await tap(`#task-chips button >> nth=${i}`);
  await page.waitForTimeout(600);
  await shotCol(`step${i}`);
  // a step with views (Octagon, Bins): tap each of the others too
  const nv = await page.locator('#course-views:not([hidden]) .seg button').count();
  for (let j = 1; j < nv; j++) {
    await tap(`#course-views .seg button >> nth=${j}`);
    await page.waitForTimeout(600);
    await shotCol(`step${i}v${j}`);
  }
  if (process.env.CARD) {
    const c = page.locator('#task-card');
    await c.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.waitForTimeout(300);
    await c.screenshot({ path: `${OUT}/card${i}.png` });
  }
}
// whole course
await tap('#course-loc');
await page.waitForTimeout(700);
await shotCol('whole');
// tap a task on the whole map (the slalom), then back to close-up
const svg = page.locator('#course-map svg');
const vb = await svg.evaluate((s) => s.getAttribute('viewBox'));
console.log('whole viewBox', vb);
await tap('#course-loc');
await page.waitForTimeout(700);
// next / prev
await tap('#task-chips button >> nth=0');
for (let i = 0; i < 3; i++) { await tap('#step-next'); await page.waitForTimeout(500); }
await shotCol('after3next');
// tap the map itself (focus ring check): tap the centre of the map
const mb = await svg.boundingBox();
if (W < 800) await page.touchscreen.tap(mb.x + mb.width * 0.3, mb.y + mb.height * 0.5); else await page.mouse.click(mb.x + mb.width * 0.3, mb.y + mb.height * 0.5);
await page.waitForTimeout(700);
await shotCol('maptap');
// font sizes in the map
const fs2 = await page.evaluate(() => [...document.querySelectorAll('#course-map text')].filter((t) => t.style.display !== 'none').map((t) => [t.textContent, Math.round(t.getBoundingClientRect().height * 10) / 10, Math.round(parseFloat(getComputedStyle(t).fontSize) * 100) / 100]));
console.log('map texts', JSON.stringify(fs2));
console.log(errs.join('\n') || 'no console errors');
await browser.close();
