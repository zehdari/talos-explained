// Phone check for this chapter: every .table-scroll must fit (no sideways scroll), and the TF tree's height.
import { launch, newPage } from '../browser.mjs';
const browser = await launch();
const p = await newPage(browser, { width: 390, height: 844 });
await p.goto('http://127.0.0.1:5300/talos-explained/localization.html', { waitUntil: 'load' });
await p.waitForTimeout(2000);
console.log(await p.evaluate(() => ({
  tables: [...document.querySelectorAll('.table-scroll')].map((t) => `${t.closest('[id]')?.id || ''}:${t.scrollWidth}/${t.clientWidth}`),
  tree: Math.round(document.getElementById('tfx-tree').getBoundingClientRect().height),
  fig: Math.round(document.getElementById('tf-fig').getBoundingClientRect().height),
  imgs: [...document.querySelectorAll('#shots-fig img')].map((i) => `${i.currentSrc.split('/').slice(-2).join('/')} ${i.naturalWidth}`),
})));
await browser.close();
