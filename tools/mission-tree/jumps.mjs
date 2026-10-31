// Usage: node tools/mission-tree/jumps.mjs [width] [height]: clicks every "Open in the explorer" link on
// mission-tree.html and reports, for each, the selected row, whether it is open, and whether it is visible inside the
// tree box (scrolled into view). Also saves a screenshot of the explorer per jump to /tmp/mt-jump-<seg>.png.
import { chromium } from 'playwright';
const [w = 390, h = 844] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome' });
const p = await browser.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:5300/talos-explained/mission-tree.html', { waitUntil: 'load' });
await p.waitForTimeout(1500);
const links = await p.$$eval('a.mt-jump', (as) => as.map((a) => a.dataset.seg));
for (const seg of links) {
  await p.$eval(`a.mt-jump[data-seg="${seg}"]`, (a) => a.click()); // a real tap, not a coordinate click that can land on the tree mid-scroll
  await p.waitForTimeout(1300);
  const r = await p.evaluate(() => {
    const tree = document.getElementById('mt-tree');
    const sel = tree.querySelector('.mt-row.sel');
    if (!sel) return { sel: null };
    const tb = tree.getBoundingClientRect(), sb = sel.getBoundingClientRect();
    const leaf = tree.querySelector('.mt-row.leaf');
    return {
      sel: sel.querySelector('.mt-label').textContent.slice(0, 60), open: sel.getAttribute('aria-expanded'),
      inBox: sb.top >= tb.top - 1 && sb.bottom <= tb.bottom + 1,
      leafShown: !!leaf, task: document.getElementById('mt-task').textContent,
    };
  });
  console.log(seg.padEnd(12), JSON.stringify(r));
  await p.locator('#explorer-fig').screenshot({ path: `/tmp/mt-jump-${seg.replace(/\W+/g, '_')}.png` });
}
console.log(errs.join('\n') || 'no errors');
await browser.close();
