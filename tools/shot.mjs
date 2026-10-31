// Usage: node tools/shot.mjs <full url> <out.png> [width] [height] [waitMs] [full|tiles]
// (shared dev server: http://127.0.0.1:5300/talos-explained/<page>). 'full' is one full-page image; Chromium repeats
// content on pages taller than about 16,000 px, so 'tiles' (or 'full' on such a page) writes out-01.png, out-02.png, ...
// one viewport each, scrolled with JS so lazy figures load. For single figures prefer tools/figs.mjs.
import { launch, newPage } from './browser.mjs';
const [url, out, w = 1400, h = 900, wait = 4000, full = ''] = process.argv.slice(2);
const browser = await launch();
const page = await newPage(browser, { width: +w, height: +h });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(+wait);
const height = await page.evaluate(() => document.documentElement.scrollHeight);
if (full === 'tiles' || (full === 'full' && height > 15000)) {
  const n = Math.ceil(height / +h);
  for (let i = 0; i < n; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), i * +h);
    await page.waitForTimeout(600);
    const path = out.replace(/\.png$/, '') + `-${String(i + 1).padStart(2, '0')}.png`;
    await page.screenshot({ path });
    console.log(path);
  }
} else {
  await page.screenshot({ path: out, fullPage: full === 'full' });
}
console.log(errors.slice(0, 10).join('\n') || 'no console errors');
await browser.close();
