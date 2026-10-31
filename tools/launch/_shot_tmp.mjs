import { launch } from '../browser.mjs';
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:18080/', { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.selectOption('#launches', 'talos_launch_mpc.yaml');
await page.waitForTimeout(2500);
// open the details of the first two rows
const btns = await page.$$('[id$="-details-btn"]');
if (btns[0]) await btns[0].click();
await page.waitForTimeout(500);
await page.click('.termopen-btn').catch(() => {});
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/launchshot/page.png', fullPage: false });
console.log(await page.evaluate(() => document.body.innerText.slice(0, 1500)));
await browser.close();
