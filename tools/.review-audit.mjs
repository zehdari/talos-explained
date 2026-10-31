import { launch, newPage } from '/home/cameron/talos-explained/tools/browser.mjs';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
const BASE = 'http://127.0.0.1:5300/talos-explained/';
let pages = process.argv.slice(2);
if (!pages.length) pages = [...readFileSync('/home/cameron/talos-explained/src/site.js', 'utf8').matchAll(/href: '([^']+)'/g)].map((m) => m[1]);
const W = +(process.env.W || 1400), H = +(process.env.H || 900);
const SHOTS = process.env.SHOTS !== '0';
const browser = await launch();
const p = await newPage(browser, { width: W, height: H });
let errs = [];
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 200)));
p.on('requestfailed', (r) => errs.push('REQFAIL ' + r.url()));
const report = {};
for (const pg of pages) {
  errs = [];
  const name = pg.replace(/\W+/g, '_');
  const dir = `/tmp/review/${W}/${name}`; mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  try { await p.goto(BASE + pg, { waitUntil: 'load' }); } catch (e) { console.log(pg, 'LOAD FAIL'); continue; }
  const tLoad = Date.now() - t0;
  await p.waitForTimeout(1500);
  if (SHOTS) await p.screenshot({ path: `${dir}/top.png` });
  const r = await p.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const out = {};
    out.kicker = q('.page-head .kicker')?.textContent.trim();
    out.h1 = q('h1')?.textContent.trim();
    out.lede = !!q('.page-head .lede');
    out.short = !!q('aside.short');
    out.shortLabel = q('aside.short .label')?.textContent.trim();
    out.title = document.title;
    out.next = q('nav.next')?.innerText.replace(/\n/g, ' / ');
    out.cur = q('.rail [aria-current="page"]')?.textContent;
    out.openParts = [...document.querySelectorAll('.rail details[open]')].map((d) => d.dataset.part);
    out.toc = document.querySelectorAll('.rail .toc li').length;
    out.h2 = [...document.querySelectorAll('main h2')].map((h) => (h.id ? '' : 'NOID:') + h.textContent.trim().slice(0, 40));
    const figs = [...document.querySelectorAll('main figure.fig')];
    out.figs = figs.length;
    out.figNoCap = figs.filter((f) => !f.querySelector(':scope > figcaption')).map((f) => f.querySelector('[id]')?.id || f.className);
    out.capNoBold = figs.filter((f) => { const c = f.querySelector(':scope > figcaption'); return c && !c.firstElementChild?.matches('b,strong'); }).map((f) => f.querySelector(':scope > figcaption').textContent.slice(0, 50));
    out.emptyPanels = [...document.querySelectorAll('main .panel')].filter((e) => { const b = e.getBoundingClientRect(); return b.height < 50 || !e.innerText.trim() && !e.querySelector('svg,canvas,img,video'); }).map((e) => (e.id || e.className) + ' h=' + Math.round(e.getBoundingClientRect().height));
    out.brokenImg = [...document.querySelectorAll('main img')].filter((i) => i.complete && i.naturalWidth === 0 && i.loading !== 'lazy').map((i) => i.getAttribute('src'));
    out.overflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    const mainB = q('main').getBoundingClientRect();
    out.wide = [...document.querySelectorAll('main *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width && b.right > mainB.right + 2 && !e.closest('.table-scroll,pre,[style*=overflow]'); }).slice(0, 5).map((e) => e.tagName + '.' + e.className + ' r=' + Math.round(e.getBoundingClientRect().right));
    // svg text overlaps
    const ov = [];
    document.querySelectorAll('main svg').forEach((svg) => {
      const ts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim() && getComputedStyle(t).opacity !== '0' && getComputedStyle(t).display !== 'none' && getComputedStyle(t).visibility !== 'hidden').map((t) => ({ t: t.textContent.trim(), b: t.getBoundingClientRect() })).filter((x) => x.b.width > 0);
      const sb = svg.getBoundingClientRect();
      for (let i = 0; i < ts.length; i++) {
        const a = ts[i].b;
        if (a.left < sb.left - 2 || a.right > sb.right + 2) ov.push(`CLIP "${ts[i].t}"`);
        for (let j = i + 1; j < ts.length; j++) {
          const b = ts[j].b;
          if (ts[i].t === ts[j].t && Math.abs(a.x - b.x) < 1) continue;
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left), iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix > 3 && iy > 3) ov.push(`"${ts[i].t}"x"${ts[j].t}"`);
        }
      }
    });
    out.svgOverlap = ov.slice(0, 12); out.svgOverlapN = ov.length;
    out.height = document.documentElement.scrollHeight;
    return out;
  });
  r.tLoad = tLoad; r.errs = [...new Set(errs)].slice(0, 6);
  if (SHOTS) {
    const n = await p.locator('main figure.fig').count();
    for (let i = 0; i < n; i++) {
      const el = p.locator('main figure.fig').nth(i);
      try {
        await el.evaluate((e) => e.scrollIntoView({ block: 'center' }));
        await p.waitForTimeout(900);
        const b = await el.boundingBox();
        if (!b) continue;
        if (b.height <= H) await p.screenshot({ path: `${dir}/fig${String(i).padStart(2, '0')}.png`, clip: { x: b.x, y: Math.max(0, b.y), width: b.width, height: Math.min(b.height, H) } });
        else await el.screenshot({ path: `${dir}/fig${String(i).padStart(2, '0')}.png`, timeout: 20000 }).catch(() => {});
      } catch (e) {}
    }
    // late errors after scroll
    r.errs = [...new Set(errs)].slice(0, 6);
  }
  report[pg] = r;
  console.log(pg, JSON.stringify(r));
}
writeFileSync(`/tmp/review/report_${W}.json`, JSON.stringify(report, null, 1));
await browser.close();
