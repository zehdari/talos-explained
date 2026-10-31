// Screenshots of this chapter's figures for checking: node tools/code-map/shots.mjs [width] [height] [outdir]
// Scrolls to each element, optionally clicks first, and saves the viewport-sized region around it.
import { chromium } from 'playwright';
const [W = 1400, H = 900, OUT = '/tmp/cm'] = process.argv.slice(2);
const BASE = process.env.BASE || 'http://127.0.0.1:5300/talos-explained/';
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await browser.newPage({ viewport: { width: +W, height: +H }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(BASE + 'code-map.html', { waitUntil: 'load' });
await p.waitForTimeout(2500);
const shots = [
  ['graph', '#stack-graph', null],
  ['graph-tap', '#stack-graph', async () => { await p.locator('#stack-graph .node').nth(2).dispatchEvent('pointerdown', { pointerType: 'touch' }); }],
  ['explorer', '#explorer-fig', null],
  ['explorer-pkg', '#explorer-fig', async () => { await p.locator('.cm-pkg', { hasText: 'riptide_mpc' }).first().click(); }],
  ['explorer-hw', '#explorer-fig', async () => { await p.locator('.cm-pkg', { hasText: 'riptide_hardware' }).first().click(); await p.locator('#cm-detail').evaluate((e) => e.scrollIntoView({ block: 'start' })); }],
  ['explorer-repo', '#explorer-fig', async () => {
    await p.locator('.cm-group-label button', { hasText: 'Firmware' }).first().click();
    await p.locator('.cm-repo-head', { hasText: 'titan_firmware' }).first().click();
    await p.locator('.cm-repo-head', { hasText: 'titan_firmware' }).first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  }],
  ['explorer-legacy', '#explorer-fig', async () => { await p.locator('#cm-status button[data-s="old"]').click(); }],
  ['explorer-search', '#explorer-fig', async () => { await p.locator('#cm-status button[data-s="all"]').click(); await p.locator('#cm-q').fill('ekf'); }],
  ['tree', 'figure:has(.cm-tree)', null],
  ['pins', '#cm-pins', null],
  ['history', '#cm-history', async () => { await p.locator('#cm-hist-read [data-d="-1"]').click(); }],
  ['start', '.cm-start', null],
  ['legacy', '#legacy', null],
];
for (const [name, sel, act] of shots) {
  const el = p.locator(sel).first();
  await el.evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await p.evaluate(() => window.scrollBy(0, -40));
  if (act) await act();
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/${W}_${name}.png` });
}
console.log(errs.join('\n') || 'no console errors');
await browser.close();
