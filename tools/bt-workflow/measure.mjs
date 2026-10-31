// Page height, section heights and every visible code block's overflow at a phone width (W, default 390).
import { launch, newPage } from '../browser.mjs';
const W = +(process.env.W || 390);
const b = await launch();
const p = await newPage(b, { width: W, height: 844 });
await p.goto((process.env.BASE || 'http://127.0.0.1:5301/talos-explained/') + 'bt-workflow.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const r = await p.evaluate(() => {
  const out = { total: document.documentElement.scrollHeight, secs: [], pres: [] };
  const hs = [...document.querySelectorAll('article h2, article h3')];
  hs.forEach((h, i) => {
    const top = h.getBoundingClientRect().top + scrollY;
    const next = hs[i + 1] ? hs[i + 1].getBoundingClientRect().top + scrollY : document.querySelector('nav.next').getBoundingClientRect().top + scrollY;
    out.secs.push(`${h.tagName === 'H3' ? '  ' : ''}${h.id} ${Math.round(next - top)}`);
  });
  out.secs.unshift(`intro ${Math.round(hs[0].getBoundingClientRect().top + scrollY)}`);
  for (const pre of document.querySelectorAll('article pre')) {
    if (!pre.offsetParent) continue;
    const over = pre.scrollWidth - pre.clientWidth;
    if (over > 1) out.pres.push(`${over}px over: ${pre.textContent.slice(0, 50).replace(/\n/g, ' | ')}`);
  }
  return out;
});
console.log(r.total + '\n' + r.secs.join('\n') + '\n-- overflowing code:\n' + (r.pres.join('\n') || 'none'));
await b.close();
