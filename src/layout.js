import './style.css';
import './css/chapter.css';
import { PARTS, ALL } from './site.js';

export { PARTS, ALL };
export const BASE = import.meta.env.BASE_URL;
export const ORG = 'https://github.com/osu-uwrt';
export const NEREUS = 'https://github.com/osu-uwrt/nereus';

// This page's path relative to the site root, e.g. 'perception/map.html'.
export function herePath() {
  let p = location.pathname;
  if (p.startsWith(BASE)) p = p.slice(BASE.length);
  else p = p.replace(/^\//, '');
  if (p === '' || p.endsWith('/')) p += 'index.html';
  return p;
}
export const url = (href) => BASE + href;

// Equations: shared macros plus any a part adds.
let MACROS = {
  '\\R': '\\mathbb{R}',
};
export function addMacros(m) { MACROS = { ...MACROS, ...m }; }

// A quiet link under a section's first displayed equation, to the same block on the appendix page.
function appendixLinks(APPENDIX) {
  const here = location.pathname.split('/').pop() || 'index.html';
  const map = APPENDIX[here];
  if (!map) return;
  document.querySelectorAll('main h2[id]').forEach((h) => {
    const target = map[h.id];
    if (!target) return;
    for (let el = h.nextElementSibling; el && el.tagName !== 'H2'; el = el.nextElementSibling) {
      const eq = el.matches('.M') ? el : el.querySelector('.M');
      if (!eq) continue;
      const a = document.createElement('a');
      a.className = 'eqlink';
      a.href = `math.html#${target}`;
      a.textContent = 'All the math on one page →';
      eq.after(a);
      return;
    }
  });
}

// KaTeX (and its CSS and fonts) loads only on pages that have equations.
let katex = null;
let katexLoad = null;
function loadKatex() {
  katexLoad ||= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => { katex = m.default; });
  return katexLoad;
}

// Renders .m (inline) and .M (display) TeX under root. Returns a promise that settles once it is drawn.
function renderMath(root = document) {
  const els = [...root.querySelectorAll('.m, .M')].filter((el) => !el.dataset.done);
  if (!els.length) return Promise.resolve();
  if (!katex) return loadKatex().then(() => renderMath(root));
  els.forEach((el) => {
    if (el.dataset.done) return;
    const tex = el.textContent;
    const display = el.classList.contains('M');
    katex.render(tex, el, { displayMode: display, throwOnError: false, trust: true, macros: MACROS });
    el.dataset.done = '1';
    if (display) { el.dataset.tex = tex; fitMath(el); }
  });
  return Promise.resolve();
}

// Splits TeX at its top-level \qquad gaps (outside braces and environments).
function topLevelParts(tex) {
  const parts = [];
  let depth = 0, start = 0;
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (tex.startsWith('\\begin{', i)) depth++;
    else if (tex.startsWith('\\end{', i)) depth--;
    else if (depth === 0 && tex.startsWith('\\qquad', i) && !/[a-zA-Z]/.test(tex[i + 6] || '')) {
      parts.push(tex.slice(start, i));
      start = i + 6;
    }
  }
  parts.push(tex.slice(start));
  const out = parts.map((p) => p.trim().replace(/,$/, '').trim()).filter(Boolean);
  // A lone connective ("s.t.") belongs on the line it introduces.
  for (let i = out.length - 2; i >= 0; i--) if (/^\\text\{[^}]{1,6}\}$/.test(out[i])) out.splice(i, 2, `${out[i]}\\quad ${out[i + 1]}`);
  return out;
}

// A displayed equation too wide for the column (a phone) is stacked at its \qquad gaps,
// then, only if still too wide, scaled down a little. Wide screens keep the one-line form.
function fitMath(el) {
  const box = () => el.querySelector('.katex-display');
  const over = () => { const b = box(); return b && b.scrollWidth > b.clientWidth + 1; };
  el.style.fontSize = '';
  if (el.dataset.stacked) {
    katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false, trust: true, macros: MACROS });
    delete el.dataset.stacked;
  }
  if (!over()) return;
  const parts = topLevelParts(el.dataset.narrow || el.dataset.tex);
  const narrow = parts.length > 1 ? `\\begin{gathered}${parts.join(' \\\\[6pt] ')}\\end{gathered}` : el.dataset.narrow;
  if (narrow) {
    katex.render(narrow, el, { displayMode: true, throwOnError: false, trust: true, macros: MACROS });
    el.dataset.stacked = '1';
  }
  for (let i = 0, scale = 1; i < 4 && over(); i++) {
    const b = box();
    scale = Math.max(0.72, scale * (b.clientWidth / b.scrollWidth) - 0.01);
    el.style.fontSize = `${scale.toFixed(3)}em`;
  }
}

let fitWidth = 0;
function refitMath() {
  if (!katex) return;
  const w = document.documentElement.clientWidth;
  if (w === fitWidth) return;
  fitWidth = w;
  document.querySelectorAll('.M[data-tex]').forEach(fitMath);
}

// Wraps tables so a wide one scrolls inside the text column on phones.
export function wrapTables(root = document) {
  root.querySelectorAll('table.params').forEach((t) => {
    if (t.parentElement.classList.contains('table-scroll')) return;
    const w = document.createElement('div');
    w.className = 'table-scroll';
    t.replaceWith(w);
    w.appendChild(t);
    // Let long names break after _ and / rather than mid-word.
    t.querySelectorAll('code').forEach((c) => {
      if (!c.children.length) c.innerHTML = c.textContent.replace(/[&<>]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m]).replace(/([_/])/g, '$1<wbr>');
    });
  });
}


function buildRail() {
  const here = herePath();
  const current = ALL.find((c) => c.href === here);
  const rail = document.createElement('nav');
  rail.className = 'rail';
  rail.setAttribute('aria-label', 'Chapters');
  const chapterItem = (c) => {
    const on = c.href === here;
    const group = c.group ? `<li class="part" aria-hidden="true">${c.group}</li>` : '';
    return `${group}<li${c.appendix ? ' class="appendix"' : ''}><a href="${url(c.href)}" data-n="${c.n}"${on ? ' aria-current="page"' : ''}>${c.title}</a>${on ? '<ul class="toc"></ul>' : ''}</li>`;
  };
  rail.innerHTML = `
    <a class="brand" href="${url('index.html')}">How Talos works<small>The Ohio State AUV, explained end to end</small></a>
    <div class="parts">${PARTS.map((p) => {
      const open = current && current.part === p;
      return `<details class="rail-part" data-part="${p.id}"${open ? ' open' : ''}>
        <summary><span>${p.title}</span>${p.tag ? `<small>${p.tag}</small>` : ''}</summary>
        <ol>${p.chapters.map(chapterItem).join('')}</ol>
      </details>`;
    }).join('')}</div>
    <div class="foot">Code: <a href="https://github.com/osu-uwrt">github.com/osu-uwrt</a><br>Simulator: <a href="${NEREUS}">Nereus</a><br>Underwater Robotics Team, Ohio State</div>`;
  const toc = rail.querySelector('.toc');
  if (toc) {
    document.querySelectorAll('main h2[id]').forEach((h) => {
      const li = document.createElement('li');
      li.innerHTML = `<a href="#${h.id}">${h.dataset.short || h.textContent}</a>`;
      toc.appendChild(li);
    });
    const links = [...toc.querySelectorAll('a')];
    const heads = links.map((a) => document.getElementById(a.getAttribute('href').slice(1)));
    const spy = () => {
      let on = 0;
      heads.forEach((h, i) => { if (h.getBoundingClientRect().top < 140) on = i; });
      links.forEach((a, i) => a.classList.toggle('on', i === on && window.scrollY > 200));
      // keep the highlighted entry visible in a long rail (desktop only; on phones the rail is a closed drawer)
      const a = links[on];
      if (a && a.classList.contains('on') && !rail.classList.contains('open') && rail.scrollHeight > rail.clientHeight) {
        const r = a.getBoundingClientRect();
        if (r.bottom > innerHeight - 24 || r.top < 24) rail.scrollTop += r.top - innerHeight / 2;
      }
    };
    addEventListener('scroll', spy, { passive: true });
    spy();
  }
  const btn = document.createElement('button');
  btn.className = 'btn menu-btn';
  btn.textContent = 'Chapters';
  btn.setAttribute('aria-expanded', 'false');
  const close = () => {
    if (!rail.classList.contains('open')) return;
    rail.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  };
  btn.onclick = (e) => {
    e.stopPropagation();
    const open = rail.classList.toggle('open');
    btn.setAttribute('aria-expanded', String(open));
    if (open) rail.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'center' });
  };
  // The phone drawer closes on a tap outside it, on any link in it (a section link only scrolls the page behind),
  // and on Escape.
  document.addEventListener('click', (e) => { if (!rail.contains(e.target)) close(); });
  rail.addEventListener('click', (e) => { if (e.target.closest('a')) close(); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && rail.classList.contains('open')) { close(); btn.focus(); } });
  // On a phone the button floats over the page: it steps out of the way while reading down (so it doesn't sit on
  // figures and headings) and comes back on any scroll up, or near the top.
  let lastY = scrollY;
  addEventListener('scroll', () => {
    const y = scrollY;
    if (Math.abs(y - lastY) < 8) return;
    btn.classList.toggle('tucked', y > lastY && y > 120 && !rail.classList.contains('open'));
    lastY = y;
  }, { passive: true });
  // keep the current chapter in view in a long rail
  requestAnimationFrame(() => {
    const cur = rail.querySelector('[aria-current="page"]');
    if (cur && cur.getBoundingClientRect().bottom > innerHeight - 40) rail.scrollTop = cur.offsetTop - innerHeight / 3;
  });
  return { rail, btn };
}

// Acronyms and team names link to their glossary entry, once per page, the first time they appear in the prose.
// [glossary id, pattern, expansion, pages that explain the term themselves (no link there)].
const GLOSSARY = [
  ['poac', 'POAC', 'Power + actuator board', ['boards.html', 'electrical.html', 'actuators.html']],
  ['ccbb', 'CCBB', 'Camera cage breakout board', ['boards.html']],
  ['ivc-board', 'IVC', 'Inter-vehicle communication board', ['boards.html', 'sensors.html']],
  ['fog', 'FOG', 'Fibre-optic gyro', ['sensors.html']],
  ['dvl', 'DVL', 'Doppler velocity log', ['sensors.html']],
  ['ekf', 'EKF', 'Extended Kalman filter', ['localization.html']],
  ['mpc', 'N?MPC', 'Model predictive control', ['control/index.html', 'control/mpc.html']],
  ['esc', 'ESCs?', 'Electronic speed controller', ['thrusters-hw.html', 'boards.html']],
  ['dshot', 'DShot', '', ['thrusters-hw.html', 'firmware.html']],
  ['tf', 'TF', 'ROS coordinate frames', ['ros2.html', 'localization.html']],
  ['urdf', 'URDF', 'Unified Robot Description Format', ['localization.html', 'mechanical.html']],
  ['rpac', 'RPAC', '', ['pool-test.html', 'nereus.html']],
  ['hil', 'HIL', 'Hardware in the loop', ['launch.html']],
  ['tdr', 'TDRs?', 'Technical Design Report', ['robosub.html']],
  ['cob', 'COB', 'Centre of buoyancy', ['mechanical.html', 'control/identify.html']],
  ['com', 'COM', 'Centre of mass', ['mechanical.html', 'control/model.html']],
  ['can-fd', 'CAN[ \u00a0-]FD', '', ['firmware.html', 'boards.html', 'computers.html']],
  ['subconn', 'SubConns?', '', ['electrical.html', 'mechanical.html']],
  ['opbox', '[Oo]pbox', 'Operator box', ['computers.html']],
  ['op-top', 'op-top', 'Operator laptop', ['computers.html']],
  ['zenoh', 'Zenoh', '', ['computers.html', 'ros2.html']],
];
const NO_GLOSSARY = 'a, code, pre, kbd, svg, figure, h1, h2, h3, h4, button, label, .katex, .m, .M, .hero, .controls, .next, .rail, [data-no-gl]';
function glossaryLinks(main) {
  const here = herePath();
  if (here === 'glossary.html') return;
  const todo = GLOSSARY.filter((t) => !t[3].includes(here));
  if (!todo.length) return;
  const re = new RegExp(`(?<![\\w-])(?:${todo.map((t) => `(${t[1]})`).join('|')})(?![\\w-])`, 'g');
  const done = new Set();
  const texts = [];
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('p, li, dd') && !n.parentElement.closest(NO_GLOSSARY) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  while (walk.nextNode()) texts.push(walk.currentNode);
  for (const node of texts) {
    if (done.size === todo.length) break;
    let rest = node;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(rest.data))) {
      const i = m.slice(1).findIndex((g) => g !== undefined);
      const [id, , exp] = todo[i];
      if (done.has(id)) continue;
      done.add(id);
      const word = rest.splitText(m.index);
      rest = word.splitText(m[0].length);
      const a = document.createElement('a');
      a.className = 'gl';
      a.href = url(`glossary.html#term-${id}`);
      if (exp) a.title = exp;
      word.replaceWith(a);
      a.appendChild(word);
      re.lastIndex = 0;
    }
  }
}

// A kicker of the form 'Part · Chapter n' takes its number from src/site.js, so reordering chapters there renumbers it.
function numberKicker() {
  const k = document.querySelector('.page-head .kicker');
  const c = ALL.find((x) => x.href === herePath());
  if (!k || !c || !/^[^·]+ · (Chapter|Appendix) \w+$/.test(k.textContent.trim())) return;
  k.textContent = `${c.part.title} · ${c.appendix || /^[A-Z]$/.test(c.n) ? 'Appendix' : 'Chapter'} ${c.n}`;
}

// 'Perception: Overview' for a part's own overview page (chapter 0), else the chapter title.
export const label = (c) => (c.n === '0' ? `${c.part.title}: ${c.title}` : c.title);

function nextPrev() {
  const here = herePath();
  const i = ALL.findIndex((c) => c.href === here);
  const slot = document.querySelector('.next');
  if (!slot || i < 0) return;
  const prev = ALL[i - 1], next = ALL[i + 1];
  // a chapter in another part names that part, unless its label already does
  const tag = (c) => (c.part !== ALL[i].part && c.n !== '0' ? ` · ${c.part.title}` : '');
  slot.innerHTML = `${prev ? `<a href="${url(prev.href)}"><small>Previous${tag(prev)}</small><strong>${label(prev)}</strong></a>` : '<span></span>'}${next ? `<a href="${url(next.href)}" style="text-align:right"><small>Next${tag(next)}</small><strong>${label(next)}</strong></a>` : ''}`;
}


// opts.appendix: { 'page.html': { sectionId: 'appendixAnchor' } } for a part with its own math appendix.
export function setup(opts = {}) {
  if (opts.macros) addMacros(opts.macros);
  const main = document.querySelector('main');
  wrapTables();
  new MutationObserver(() => wrapTables()).observe(main, { childList: true, subtree: true });
  const shell = document.createElement('div');
  shell.className = 'shell';
  main.parentNode.insertBefore(shell, main);
  const { rail, btn } = buildRail();
  shell.appendChild(rail);
  shell.appendChild(main);
  document.body.appendChild(btn);
  numberKicker();
  glossaryLinks(main);
  fitWidth = document.documentElement.clientWidth;
  // widths change once KaTeX's fonts arrive
  renderMath().then(() => document.fonts?.ready).then(() => { fitWidth = 0; refitMath(); });
  let t = 0;
  addEventListener('resize', () => { clearTimeout(t); t = setTimeout(refitMath, 150); });
  if (opts.appendix) appendixLinks(opts.appendix);
  nextPrev();
}

export { renderMath };
