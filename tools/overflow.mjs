// Usage: node tools/overflow.mjs [page.html ...]   (default: every page in src/site.js)
// Reports horizontal overflow on a 390 px phone, plus console errors, per page. Uses the shared dev server (:5300).
import { launch, newPage } from './browser.mjs';
import { readFileSync } from 'node:fs';
const BASE = process.env.BASE || 'http://127.0.0.1:5300/talos-explained/';
let pages = process.argv.slice(2);
if (!pages.length) pages = [...readFileSync(new URL('../src/site.js', import.meta.url), 'utf8').matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
const browser = await launch();
const p = await newPage(browser, { width: +(process.env.W || 390), height: 844 });
let errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
for (const pg of pages) {
  errs = [];
  await p.goto(BASE + pg, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => {
    const W = document.documentElement.clientWidth, out = [];
    for (const el of document.querySelectorAll('main *')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > W + 1) {
        let a = el.parentElement, scrolls = false;
        while (a) { const s = getComputedStyle(a); if (['auto', 'scroll'].includes(s.overflowX) || s.overflow === 'hidden') { scrolls = true; break; } a = a.parentElement; }
        if (!scrolls) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.id ? '#' + el.id : ''} right=${Math.round(b.right)}`);
      }
    }
    return { page: document.documentElement.scrollWidth, W, out: [...new Set(out)].slice(0, 6) };
  });
  console.log(`${pg}: ${r.page > r.W ? 'OVERFLOW' : 'ok'} scrollWidth ${r.page}/${r.W} ${r.out.join(' | ')}${errs.length ? '\n   errors: ' + errs.slice(0, 4).join(' || ') : ''}`);
}
await browser.close();
