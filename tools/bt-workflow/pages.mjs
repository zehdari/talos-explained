import { chromium } from 'playwright';
const [url, prefix, w = 1400, h = 1600, start = 0] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const H = await page.evaluate(() => document.documentElement.scrollHeight);
let i = 0;
for (let y = +start; y < H; y += +h, i++) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${prefix}_${String(i).padStart(2, '0')}.png` });
}
console.log('height', H, 'shots', i, errs.join('\n') || 'no errors');
await browser.close();
