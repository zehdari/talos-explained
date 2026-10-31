// Lists visible text rendered under 11 px on this chapter (W, default 390), SVG text included, after opening every fold.
import { launch, newPage } from '../browser.mjs';
const W = +(process.env.W || 390);
const b = await launch();
const p = await newPage(b, { width: W, height: 844 });
await p.goto((process.env.BASE || 'http://127.0.0.1:5301/talos-explained/') + 'bt-workflow.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  document.querySelectorAll('details').forEach((d) => (d.open = true));
  const out = new Set();
  const walk = document.createTreeWalker(document.querySelector('article'), NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el.getClientRects().length) continue;
    let fs = parseFloat(getComputedStyle(el).fontSize);
    const svg = el.closest('svg');
    if (svg) { const ctm = el.getScreenCTM(); fs *= ctm ? ctm.a : 1; }
    if (fs < 10.95) out.add(`${fs.toFixed(1)}px ${el.tagName}.${el.className?.baseVal ?? el.className}: ${n.textContent.trim().slice(0, 40)}`);
  }
  return [...out];
});
console.log(r.join('\n') || 'no text under 11 px');
await b.close();
