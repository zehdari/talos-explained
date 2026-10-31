// Taps through this chapter's figures (W=390 phone by default, W=1400 desktop) on the dev server :5301, screenshots each
// state into /tmp/btw/s and prints where the port playground's answer lands after each chip tap.
import { chromium } from 'playwright';
// The same Vite HMR stub as tools/browser.mjs: CSS still applies, a file edited mid-run doesn't reload the page.
const HMR_STUB = `
const sheets = new Map();
export function updateStyle(id, content) {
  let s = sheets.get(id);
  if (!s) { s = document.createElement('style'); s.setAttribute('type', 'text/css'); s.setAttribute('data-vite-dev-id', id); document.head.appendChild(s); sheets.set(id, s); }
  s.textContent = content;
}
export function removeStyle(id) { const s = sheets.get(id); if (s) { s.remove(); sheets.delete(id); } }
export function createHotContext() { return { data: {}, accept() {}, acceptExports() {}, dispose() {}, prune() {}, invalidate() {}, decline() {}, on() {}, off() {}, send() {} }; }
export function injectQuery(u) { return u; }
export class ErrorOverlay {}
`;
const OUT = process.env.OUT || '/tmp/btw/s';
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: W < 800, isMobile: W < 800, deviceScaleFactor: 1 });
const p = await ctx.newPage();
await p.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:5301/talos-explained/bt-workflow.html', { waitUntil: 'networkidle' });
await p.waitForTimeout(800);
console.log('height', await p.evaluate(() => document.documentElement.scrollHeight));
const tag = W < 800 ? 'm' : 'd';
const vp = async (name) => { await p.waitForTimeout(700); await p.screenshot({ path: `${OUT}/${tag}_${name}.png` }); };
const tapAt = async (loc, y = 430) => {
  await loc.evaluate((e, y) => window.scrollTo(0, e.getBoundingClientRect().top + scrollY - y), y);
  await p.waitForTimeout(300);
  if (W < 800) await loc.tap(); else await loc.click();
};
const steps = (process.env.STEPS || 'pp,loop,pipe').split(',');
if (steps.includes('pp')) {
  const chips = p.locator('.pp .chip');
  for (let i = 0; i < 6; i++) {
    await tapAt(chips.nth(i), i < 3 ? 380 : 500);
    await vp(`pp${i}`);
    const m = await p.evaluate(() => { const v = document.querySelector('.pp .verdict').getBoundingClientRect(); const c = document.querySelector('.pp .chip[aria-pressed=true]').getBoundingClientRect(); return { chipTop: Math.round(c.top), verdictBottom: Math.round(v.bottom), ih: innerHeight }; });
    console.log('pp', i, JSON.stringify(m));
  }
  await p.locator('.pp .pp-ctx').first()[W < 800 ? 'tap' : 'click']();
  await vp('pp_ctx');
}
if (steps.includes('loop')) {
  for (const i of [4, 6]) { await tapAt(p.locator('.loop-head').nth(i), 640); await vp(`loop${i + 1}`); }
}
if (steps.includes('pipe')) {
  if (W < 800) { for (const i of [5, 8]) { await tapAt(p.locator('.pipe-steps button').nth(i), 650); await vp(`pipe${i + 1}`); } }
  else { await p.locator('#pipeline').evaluate((e) => e.scrollIntoView({ block: 'center' })); await vp('pipe_default'); await p.locator('#pipeline .node').nth(4).click(); await vp('pipe_fac'); }
}
if (steps.includes('ex')) {
  const heads = p.locator('.ex-acc .loop-head');
  await heads.first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  await p.evaluate(() => scrollBy(0, -80));
  await vp('ex_default');
  for (const i of [1, 4, 5]) { await tapAt(heads.nth(i), 300); await vp(`ex${i + 1}`); }
}
if (steps.includes('tabs')) {
  const b = p.locator('.code-tabs .seg button');
  for (const i of [1, 2]) { await tapAt(b.nth(i), 200); await vp(`tab${i + 1}`); }
}
if (steps.includes('misc')) {
  await tapAt(p.locator('.shots-seg button').first(), 300); await vp('shots_ready');
  await tapAt(p.locator('#drift .drift-row button').nth(2), 400); await vp('drift_row3');
  await tapAt(p.locator('.mk-filter button', { hasText: 'Run' }), 200);
  await tapAt(p.locator('.mk-list li:not([hidden]) summary').nth(4), 500); await vp('mistake');
}
console.log(errs.join('\n') || 'no errors');
await browser.close();
