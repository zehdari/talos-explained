// Visible words in a chapter's article (rendered, without code blocks and KaTeX's hidden MathML), to compare lengths.
import { launch, newPage } from '../browser.mjs';
const b = await launch();
const p = await newPage(b, { width: 1400, height: 900 });
for (const pg of process.argv.slice(2)) {
  await p.goto('http://127.0.0.1:5300/talos-explained/' + pg, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const n = await p.evaluate(() => {
    const a = document.querySelector('article').cloneNode(true);
    a.querySelectorAll('pre, .katex-mathml, svg, nav, .panel').forEach((e) => e.remove());
    return a.textContent.split(/\s+/).filter(Boolean).length;
  });
  console.log(pg, n);
}
await b.close();
