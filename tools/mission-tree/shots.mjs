// Usage: node tools/mission-tree/shots.mjs <width> <height> <out-prefix>: clicks through the mission-tree explorer and
// screenshots it (jump to the torpedo, select the running node, search), the search figure and the flow graph.
import { chromium } from 'playwright';
const [w, h, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const p = await browser.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:5300/talos-explained/mission-tree.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
// jump to torpedo via the section link
await p.click('a.mt-jump[data-seg="Torpedo"]');
await p.waitForTimeout(1200);
await p.locator('.mt-row.leaf').first().click();
await p.waitForTimeout(400);
await p.locator('#explorer-fig').screenshot({ path: out + '_a.png' });
await p.fill('#mt-q', 'set_camera_is_dfc');
await p.waitForTimeout(600);
await p.locator('#explorer-fig').screenshot({ path: out + '_b.png' });
await p.locator('#srch-fig').scrollIntoViewIfNeeded();
await p.locator('#srch-fig').screenshot({ path: out + '_c.png' });
await p.click('#srch-pick button[data-s="spiral"]');
await p.locator('#srch-fig').screenshot({ path: out + '_d.png' });
await p.locator('#flow-graph').scrollIntoViewIfNeeded();
await p.locator('#flow-graph').screenshot({ path: out + '_e.png' });
console.log(errs.join('\n') || 'no errors');
await browser.close();
