// Usage: node tools/overflow.mjs [page.html ...]   (default: every page in src/site.js)   env W (default 390)
// Per page: horizontal overflow, console errors, and broken media (img/video/source URLs that fail or come back as
// a text/HTML page, e.g. a doubled /talos-explained/ base). Uses the shared dev server (:5300); BASE=... for a build.
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
  try {
    await p.goto(BASE + pg, { waitUntil: 'load' });
  } catch (e) { console.log(`${pg}: LOAD FAILED ${e.message.split('\n')[0]}`); continue; }
  await p.waitForTimeout(1500);
  const r = await p.evaluate(async () => {
    const W = document.documentElement.clientWidth, out = [];
    for (const el of document.querySelectorAll('main *')) {
      const b = el.getBoundingClientRect();
      if (b.width && b.right > W + 1) {
        let a = el, scrolls = false;
        while (a) {
          const s = getComputedStyle(a);
          // a scroller, a clipping box, or an SVG clip-path (chart points outside a zoomed domain) contains it
          if (a !== el && ['auto', 'scroll', 'hidden', 'clip'].includes(s.overflowX) || (a !== el && s.overflow === 'hidden') || (a instanceof SVGElement && s.clipPath && s.clipPath !== 'none') || a.hasAttribute('clip-path')) { scrolls = true; break; }
          a = a.parentElement;
        }
        if (!scrolls) out.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.id ? '#' + el.id : ''} right=${Math.round(b.right)}`);
      }
    }
    const urls = new Set();
    document.querySelectorAll('img[src], video[src], video[poster], source[src], source[srcset], img[srcset]').forEach((el) => {
      for (const a of ['src', 'poster']) if (el.getAttribute(a)) urls.add(new URL(el.getAttribute(a), location.href).href);
      const ss = el.getAttribute('srcset');
      if (ss) ss.split(',').forEach((part) => { const u = part.trim().split(/\s+/)[0]; if (u) urls.add(new URL(u, location.href).href); });
    });
    const broken = [];
    await Promise.all([...urls].filter((u) => u.startsWith(location.origin)).map(async (u) => {
      try {
        const res = await fetch(u, { method: 'HEAD' });
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || /^text\//.test(ct)) broken.push(`${u.replace(location.origin, '')} (${res.status} ${ct.split(';')[0]})`);
      } catch (e) { broken.push(`${u} (${e.message})`); }
    }));
    return { page: document.documentElement.scrollWidth, W, out: [...new Set(out)].slice(0, 6), broken };
  });
  console.log(`${pg}: ${r.page > r.W ? 'OVERFLOW' : 'ok'} scrollWidth ${r.page}/${r.W} ${r.out.join(' | ')}${r.broken.length ? '\n   broken media: ' + r.broken.slice(0, 4).join(' || ') : ''}${errs.length ? '\n   errors: ' + errs.slice(0, 4).join(' || ') : ''}`);
}
await browser.close();
