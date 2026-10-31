// The front page's hero poster: the 3D model as the page draws it, on a transparent background, shown while the
// model loads (or instead of it, without WebGL). Run from the repo root with the dev server up:
//   node tools/index/hero_poster.mjs [url]   → /tmp/hero-poster.png, then trim and encode (see make_images.sh)
import { launch, newPage } from '../browser.mjs';
const url = process.argv[2] || 'http://127.0.0.1:5300/talos-explained/';
const browser = await launch();
const page = await newPage(browser, { width: 820, height: 1000 });
// Render at 2x so the poster stays sharp on phones.
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 1000, deviceScaleFactor: 2, mobile: false });
await page.emulateMedia({ reducedMotion: 'reduce' }); // no auto-rotate: the home view
await page.goto(url, { waitUntil: 'load' });
await page.waitForSelector('#th-stage.ready', { timeout: 120000 });
await page.addStyleTag({ content: `
  html, body, main, .hero, .talos-hero { background: transparent !important; }
  .talos-hero .copy, .talos-hero .dock, .th-labels, .th-poster, .th-loading, .menu-btn, .rail { display: none !important; }
  .talos-hero .th-stage { height: 760px !important; }
  .talos-hero canvas { transition: none !important; }` });
await page.waitForTimeout(2500);
// Read the WebGL canvas itself (transparent where nothing is drawn), in a frame callback right after three renders.
const data = await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => res(document.getElementById('th-canvas').toDataURL('image/png')))));
const fs = await import('node:fs');
fs.writeFileSync('/tmp/hero-poster.png', Buffer.from(data.split(',')[1], 'base64'));
console.log('/tmp/hero-poster.png');
await browser.close();
