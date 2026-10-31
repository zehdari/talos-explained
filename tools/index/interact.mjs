// Front-page interaction screenshots: node tools/index/interact.mjs <w> <h> <out-prefix> (dev server on :5300).
import { launch, newPage } from '../browser.mjs';
const [w, h, out] = [+process.argv[2], +process.argv[3], process.argv[4]];
const b = await launch(); const p = await newPage(b, { width: w, height: h });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto('http://127.0.0.1:5300/talos-explained/', { waitUntil: 'load' }); await p.waitForTimeout(3000);
// pick hero chip
await p.click('.th-chip:nth-child(4)'); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}_hero.png` });
// stack: select mpc
const nodeSel = w < 700 ? '[data-id="mpc"]' : 'svg.graph .node:nth-of-type(5)';
await p.locator('.ix-stack').scrollIntoViewIfNeeded();
await p.click(nodeSel); await p.waitForTimeout(600);
await (await p.$('.ix-stack')).screenshot({ path: `${out}_stack.png` });
await p.click('#stack-mode button[data-v="sim"]'); await p.waitForTimeout(600);
await (await p.$('.ix-stack')).screenshot({ path: `${out}_sim.png` });
for (const i of [3, 7]) { await p.click(`#dx-steps [data-i="${i}"]`); await p.waitForTimeout(i === 3 ? 6000 : 1300); await (await p.$('.ix-decision')).screenshot({ path: `${out}_step${i}.png` }); }
console.log(errs.join('\n') || 'no errors'); await b.close();
