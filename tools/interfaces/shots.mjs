// Interaction checks and screenshots for interfaces.html.
// Usage: node tools/interfaces/shots.mjs [width] [height] [outdir]
import { launch, newPage } from '../browser.mjs';

const [w = 1400, h = 900, out = '/tmp/ifx'] = process.argv.slice(2);
const URL = 'http://127.0.0.1:5300/talos-explained/interfaces.html';
const browser = await launch();
const page = await newPage(browser, { width: +w, height: +h });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
const shot = async (name) => { await page.waitForTimeout(400); await page.screenshot({ path: `${out}-${name}.png` }); console.log(`${out}-${name}.png`); };
const top = async (sel, dy = 0) => { await page.evaluate(([s, d]) => { const e = document.querySelector(s); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - d); }, [sel, dy]); };

await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('.ifx-row');
console.log('rows', await page.locator('.ifx-row').count(), 'count:', await page.textContent('#ifx-count'));
await top('#ifx-fig', 10);
await shot('list');

// search
await page.fill('#ifx-q', 'kill');
await page.waitForTimeout(300);
console.log('search kill:', await page.textContent('#ifx-count'));
await top('#ifx-fig', 10);
await shot('search');

// open a row
await page.fill('#ifx-q', 'odometry/filtered');
await page.waitForTimeout(300);
await page.locator('details.ifx-row:not([hidden]) > summary').first().click();
await top('#ifx-fig', 10);
await shot('open');

// filters
await page.fill('#ifx-q', '');
await page.click('#ifx-where button[data-v="robot"]');
await page.click('#ifx-kind button[data-v="topic"]');
await page.waitForTimeout(300);
console.log('robot-only topics:', await page.textContent('#ifx-count'));
await top('#ifx-fig', 10);
await shot('filter');

// deep links
for (const hash of ['topic-state/kill', 'node-mpc_controller', 'frame-gate_frame', 'topic-tf_static', 'topic-mapping/gate', 'action-follow_path', 'service-mapping_target', 'topic-autonomy/bag_trigger']) {
  await page.evaluate((hh) => { location.hash = hh; }, hash);
  await page.waitForTimeout(500);
  const open = await page.evaluate(() => [...document.querySelectorAll('details.ifx-row[open]')].map((d) => d.id).slice(-1)[0]);
  const vis = await page.evaluate(() => { const d = [...document.querySelectorAll('details.ifx-row[open]')].pop(); const r = d.getBoundingClientRect(); return Math.round(r.top); });
  console.log('hash', hash, '-> open', open, 'top', vis);
}
await page.evaluate(() => { location.hash = 'node-mpc_controller'; });
await page.waitForTimeout(600);
await shot('node');
await page.evaluate(() => { location.hash = 'topic-state/kill'; });
await page.waitForTimeout(600);
await shot('kill');
await page.evaluate(() => { location.hash = 'frame-gate_frame'; });
await page.waitForTimeout(600);
await shot('frame');

await top('#swap-fig', 10);
await shot('swap');
await top('#config-fig', 10);
await shot('config');
await top('#names', 10);
await shot('names');
console.log(errors.slice(0, 10).join('\n') || 'no console errors');
await browser.close();
