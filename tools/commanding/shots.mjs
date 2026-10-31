// Screenshots of the Commanding chapter's figures (animated ones never settle, so this clips by rect instead of
// waiting for "stable" elements).  BASE=... node tools/commanding/shots.mjs [width] [height] [outdir] [selector ...]
import { launch, newPage } from '../browser.mjs';
const [w = 1400, h = 900, out = '/tmp/cmdshots', ...sels] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:5301/talos-explained/';
const SELS = sels.length ? sels : ['figure:has(#flow-body)', 'figure:has(#msg-tabs)', 'figure:has(#can-frames)', 'figure:has(#killsim)'];
const browser = await launch();
const p = await newPage(browser, { width: +w, height: +h });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(BASE + 'commanding.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
let i = 0;
for (const s of SELS) {
  await p.evaluate((s) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 20); }, s);
  await p.waitForTimeout(+(process.env.WAIT || 1500));
  const r = await p.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left, y: b.top + scrollY, width: b.width, height: b.height }; }, s);
  const file = `${out}/${w}_${i++}.png`;
  await p.screenshot({ path: file, clip: { x: Math.max(0, r.x), y: Math.max(0, r.y), width: Math.min(r.width, +w), height: Math.min(r.height, 3000) }, fullPage: true });
  console.log(file);
}
console.log(errs.length ? 'errors: ' + errs.join(' | ') : 'no errors');
await browser.close();
