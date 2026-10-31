// Shared Chromium launcher for the check tools. Stubs Vite's HMR client so a page doesn't reload when another
// agent edits a file mid-check (CSS still applies through updateStyle).
import { chromium } from 'playwright';

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

export async function launch() {
  return chromium.launch({
    executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
    // NOGL=1: plain '--disable-gpu', faster to start on a loaded machine, but WebGL (three.js figures) won't render.
    args: process.env.NOGL ? ['--disable-gpu'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    timeout: 120000,
  });
}

export async function newPage(browser, viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(120000);
  await page.route('**/@vite/client', (r) => r.fulfill({ contentType: 'application/javascript', body: HMR_STUB }));
  return page;
}

// Element screenshot that doesn't wait for "stable" (animated figures never settle): scroll with JS, clip by rect.
export async function shootElement(page, selector, path, wait = 1500) {
  const el = page.locator(selector).first();
  await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(wait);
  const b = await el.boundingBox();
  if (!b) throw new Error('not visible: ' + selector);
  const vp = page.viewportSize();
  if (b.height <= vp.height) {
    await page.screenshot({ path, clip: { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(b.width, vp.width), height: b.height } });
  } else {
    await el.screenshot({ path, timeout: 30000 }).catch(async () => page.screenshot({ path }));
  }
}
