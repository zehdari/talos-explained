// Steps the bt.html simulator and lists status chips whose text is clipped. Usage: node tools/bt/chipcheck.mjs [widths...]
import { launch, newPage } from '../browser.mjs';
const b = await launch();
for (const w of (process.argv.slice(2).length ? process.argv.slice(2) : [320, 390, 1400]).map(Number)) {
  const p = await newPage(b, { width: w, height: 800 });
  await p.goto('http://127.0.0.1:5300/talos-explained/bt.html', { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    await p.click('#bt-sim [data-a="step"]'); await p.waitForTimeout(80);
    if (i === 3) await p.click('#bt-sim [data-w="seen"]');
    for (const t of await p.$$eval('.bt-row .chip', (els) => els.filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent))) seen.add(t);
  }
  const all = await p.$$eval('.bt-row .chip', (els) => [...new Set(els.map((e) => e.textContent))]);
  console.log(w, 'states:', all.join(','), 'clipped:', [...seen].join(',') || 'none', 'scrollWidth', await p.evaluate(() => document.documentElement.scrollWidth));
  await p.close();
}
await b.close();
