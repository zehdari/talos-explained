// Usage: node tools/shot.mjs <full url> <out.png> [width] [height] [waitMs] [full]
// (shared dev server: http://127.0.0.1:5300/talos-explained/<page>). For very long pages prefer tools/figs.mjs per figure.
import { launch, newPage } from './browser.mjs';
const [url, out, w = 1400, h = 900, wait = 4000, full = ''] = process.argv.slice(2);
const browser = await launch();
const page = await newPage(browser, { width: +w, height: +h });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
await page.screenshot({ path: out, fullPage: full === 'full' });
console.log(errors.slice(0, 10).join('\n') || 'no console errors');
await browser.close();
