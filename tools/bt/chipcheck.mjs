// Steps the bt.html simulator (and turns Torpedo in view on after tick 4) and reports, per width: status chips whose
// text is clipped, row text under 11 px, and the page's scroll width.
// Usage: BASE=http://127.0.0.1:5301/talos-explained/ node tools/bt/chipcheck.mjs [widths...]
import { launch, newPage } from '../browser.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5301/talos-explained/';
const b = await launch();
for (const w of (process.argv.slice(2).length ? process.argv.slice(2) : [320, 390, 1400]).map(Number)) {
  const p = await newPage(b, { width: w, height: 800 });
  await p.goto(BASE + 'bt.html', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const clipped = new Set(), small = new Set();
  const click = (q) => p.evaluate((s) => document.querySelector(s).click(), q);
  for (let i = 0; i < 12; i++) {
    await click('#bt-sim [data-a="step"]'); await p.waitForTimeout(60);
    if (i === 3) await click('#bt-sim [data-w="seen"]');
    const r = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('#bt-sim .bt-row')];
      return {
        clipped: rows.flatMap((row) => [...row.querySelectorAll('.chip')].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent)),
        small: rows.flatMap((row) => [...row.querySelectorAll('.chip, .ord, .kind, .lbl, .det, .tag')].filter((e) => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 11).map((e) => e.className)),
      };
    });
    r.clipped.forEach((t) => clipped.add(t)); r.small.forEach((t) => small.add(t));
  }
  console.log(w, 'clipped chips:', [...clipped].join(',') || 'none', '| text under 11 px:', [...small].join(',') || 'none', '| scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  await p.close();
}
await b.close();
