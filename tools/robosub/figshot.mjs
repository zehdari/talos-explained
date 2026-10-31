// Usage: node tools/robosub/figshot.mjs <selector> <out.png> [width] [height] [clickSelector]
// Screenshots one element of robosub.html (scrolled into view with JS) on the shared dev server.
import { chromium } from 'playwright';
const [sel, out, w = 1400, hgt = 900, click] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const p = await browser.newPage({ viewport: { width: +w, height: +hgt } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:5300/talos-explained/robosub.html', { waitUntil: 'networkidle' });
if (click) { await p.evaluate((c) => document.querySelector(c).click(), click); }
await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'start' }), sel);
await p.waitForTimeout(1200);
const b = await p.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; }, sel);
await p.screenshot({ path: out, clip: b, fullPage: true });
console.log(out, errs.length ? errs.join(' | ') : 'no errors');
await browser.close();
