// Drives the glossary's interactives and screenshots each state. Usage: node tools/glossary/check.mjs [outDir]
// Set BASE to the dev server. Checks: search, part filter, empty state, A-Z jump, deep link, cross-link
// into a filtered-out entry, the phone A-Z drop-down and the toolbar making room for the "Chapters" button.
import { launch, newPage } from '../browser.mjs';
const BASE = process.env.BASE || 'http://127.0.0.1:5301/talos-explained/';
const OUT = process.argv[2] || '/tmp/gl';
const browser = await launch();
const errs = [];
const log = (...a) => console.log(...a);

async function open(w, h, hash = '') {
  const p = await newPage(browser, { width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await p.goto(BASE + 'glossary.html' + hash, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  return p;
}
const visible = (p) => p.evaluate(() => [...document.querySelectorAll('.gl-entry')].filter((e) => !e.hidden).map((e) => e.id));

// Desktop
{
  const p = await open(1400, 900);
  await p.fill('#gl-q', 'kill');
  await p.waitForTimeout(400);
  const v = await visible(p);
  log('search "kill":', v.length, v.slice(0, 12).join(' '), '| count:', await p.textContent('#gl-count'), '| url:', await p.evaluate(() => location.search));
  await p.screenshot({ path: `${OUT}/d_search.png` });
  await p.fill('#gl-q', 'zzzqqq');
  await p.waitForTimeout(400);
  log('empty shown:', await p.isVisible('#gl-empty'));
  await p.evaluate(() => document.getElementById('gl-empty').scrollIntoView({ block: 'center' }));
  await p.screenshot({ path: `${OUT}/d_empty.png` });
  await p.click('#gl-clear');
  await p.selectOption('#gl-part', 'control');
  await p.waitForTimeout(300);
  log('part control:', (await visible(p)).length);
  // cross-link to a term hidden by the filter (MPC entry links to riptide_mpc, same part; use Fossen -> nereus? pick Path -> follow_path)
  await p.selectOption('#gl-part', 'perception');
  await p.waitForTimeout(300);
  const x = await p.evaluate(() => { const a = [...document.querySelectorAll('.gl-entry:not([hidden]) a.gl-x')].find((a) => document.querySelector(a.getAttribute('href')).hidden); return a && a.getAttribute('href'); });
  if (x) {
    await p.click(`.gl-entry:not([hidden]) a.gl-x[href="${x}"]`);
    await p.waitForTimeout(500);
    log('cross-link', x, 'visible after click:', await p.isVisible(x), '| filter reset:', (await p.inputValue('#gl-part')) === '', '| top:', Math.round(await p.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, x)), 'bar:', await p.evaluate(() => document.getElementById('gl-tools').offsetHeight));
    await p.screenshot({ path: `${OUT}/d_xlink.png` });
  } else log('no hidden cross-link target found');
  await p.click('.gl-az a:text-is("R")');
  await p.waitForTimeout(400);
  log('A-Z R top:', Math.round(await p.evaluate(() => document.getElementById('letter-r').getBoundingClientRect().top)));
  await p.screenshot({ path: `${OUT}/d_letter.png` });
  await p.close();
}
// Deep link, desktop
{
  const p = await open(1400, 900, '#term-needs-update');
  await p.waitForTimeout(600);
  log('deep link top:', Math.round(await p.evaluate(() => document.getElementById('term-needs-update').getBoundingClientRect().top)));
  await p.screenshot({ path: `${OUT}/d_deep.png` });
  await p.close();
}
// Phone
{
  const p = await open(390, 844);
  await p.evaluate(() => window.scrollTo(0, document.getElementById('letter-c').getBoundingClientRect().top + scrollY - 200));
  await p.waitForTimeout(500);
  await p.mouse.wheel(0, -120); // scrolling up brings the Chapters button back
  await p.waitForTimeout(600);
  log('phone stuck/room:', await p.evaluate(() => document.getElementById('gl-tools').className));
  await p.screenshot({ path: `${OUT}/p_stuck.png` });
  await p.click('#gl-az-btn');
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${OUT}/p_az.png` });
  await p.click('.gl-az a:text-is("M")');
  await p.waitForTimeout(500);
  log('phone M top:', Math.round(await p.evaluate(() => document.getElementById('letter-m').getBoundingClientRect().top)), 'az open:', await p.evaluate(() => document.getElementById('gl-az').classList.contains('open')));
  await p.screenshot({ path: `${OUT}/p_letter.png` });
  await p.fill('#gl-q', 'dfc');
  await p.waitForTimeout(500);
  log('phone search dfc:', (await visible(p)).join(' '), '| first:', await p.evaluate(() => [...document.querySelectorAll('.gl-entry')].filter((e) => !e.hidden).sort((a, b) => (+a.style.order || 0) - (+b.style.order || 0))[0]?.id), '| toolbar top:', Math.round(await p.evaluate(() => document.getElementById('gl-tools').getBoundingClientRect().top)));
  await p.screenshot({ path: `${OUT}/p_search.png` });
  await p.fill('#gl-q', '');
  await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.selectOption('#gl-part', 'sensing');
  await p.waitForTimeout(400);
  log('phone part sensing:', (await visible(p)).length, '| toolbar top:', Math.round(await p.evaluate(() => document.getElementById('gl-tools').getBoundingClientRect().top)));
  await p.screenshot({ path: `${OUT}/p_filter.png` });
  await p.click('#gl-part-x');
  await p.waitForTimeout(300);
  log('phone part cleared:', (await visible(p)).length);
  await p.close();
}
log(errs.join('\n') || 'no console errors');
await browser.close();
