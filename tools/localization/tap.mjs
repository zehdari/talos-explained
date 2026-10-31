// Scripted taps for checking the localization figures: node tools/localization/tap.mjs '<json steps>'
// steps: [{tap: selector, nth?}, {shot: selector, out}, {wait: ms}, {eval: js}]  env BASE, W, H
import { launch, shootElement } from '../browser.mjs';
import { readFileSync } from 'node:fs';
const STUB = readFileSync(new URL('../browser.mjs', import.meta.url), 'utf8').match(/const HMR_STUB = `([\s\S]*?)`;/)[1];
const steps = JSON.parse(process.argv[2]);
const BASE = process.env.BASE || 'http://127.0.0.1:5301/talos-explained/';
const browser = await launch();
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: W < 800, isMobile: false });
const p = await ctx.newPage();
p.setDefaultTimeout(60000);
await p.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: STUB }));
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(BASE + 'localization.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
for (const s of steps) {
  if (s.tap) {
    const l = p.locator(s.tap).nth(s.nth || 0);
    await l.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    await p.waitForTimeout(300);
    const b = await l.boundingBox();
    const x = b.x + (s.dx ?? b.width / 2), y = b.y + (s.dy ?? b.height / 2);
    if (W < 800) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y);
    await p.waitForTimeout(s.after || 500);
  }
  if (s.wait) await p.waitForTimeout(s.wait);
  if (s.eval) console.log(JSON.stringify(await p.evaluate(s.eval)));
  if (s.shot) { await shootElement(p, s.shot, s.out, 600); console.log(s.out); }
  if (s.screen) { await p.screenshot({ path: s.screen }); console.log(s.screen); }
}
console.log(errs.join('\n') || 'no console errors');
await browser.close();
