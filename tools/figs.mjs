// Usage: node tools/figs.mjs <page.html> <selector>...   env W, H (viewport, default 1400x900), WAIT (ms), OUT (dir, default /tmp)
// Scrolls each selector into view (lazy figures need it) and screenshots that element. Uses the shared dev server (:5300).
import { launch, newPage, shootElement } from './browser.mjs';
const [page, ...sels] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:5300/talos-explained/';
const OUT = process.env.OUT || '/tmp';
const browser = await launch();
const p = await newPage(browser, { width: +(process.env.W || 1400), height: +(process.env.H || 900) });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(BASE + page, { waitUntil: 'load' });
await p.waitForTimeout(1500);
let i = 0;
for (const s of sels) {
  const out = `${OUT}/fig_${page.replace(/\W+/g, '_')}_${i++}.png`;
  try { await shootElement(p, s, out, +(process.env.WAIT || 2000)); console.log(out); } catch (e) { console.log(`FAILED ${s}: ${e.message.split('\n')[0]}`); }
}
console.log(errs.join('\n') || 'no console errors');
await browser.close();
