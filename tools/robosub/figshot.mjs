// Usage: node tools/robosub/figshot.mjs <selector> <out.png> [width] [height] [chipText]
// Screenshots one element of robosub.html on the shared dev server, optionally after tapping a task chip.
import { launch, newPage } from '../browser.mjs';
const [sel, out, w = 1400, hgt = 900, chip] = process.argv.slice(2);
const browser = await launch();
const p = await newPage(browser, { width: +w, height: +hgt });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:5300/talos-explained/robosub.html', { waitUntil: 'load' });
await p.waitForTimeout(1200);
if (chip) await p.evaluate((c) => [...document.querySelectorAll('#task-chips button')].find((b) => b.textContent === c)?.click(), chip);
await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), sel);
await p.waitForTimeout(1200);
const b = await p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }, sel);
await p.screenshot({ path: out, clip: b, fullPage: true });
console.log(out, errs.length ? errs.join(' | ') : 'no errors');
await browser.close();
