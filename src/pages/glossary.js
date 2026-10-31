import { setup } from '../layout.js';
import '../css/chapter.css';
import '../css/glossary.css';

setup();

// The entries are static HTML (built by tools/glossary/build.py), so deep links and find-in-page work without
// this script. Here: search, a part filter, the A-Z jump bar, and keeping the sticky toolbar clear of the
// phone's floating "Chapters" button.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const tools = $('#gl-tools');
const input = $('#gl-q');
const count = $('#gl-count');
const az = $('#gl-az');
const azBtn = $('#gl-az-btn');
const empty = $('#gl-empty');
const sections = $$('.gl-letter');
const entries = $$('.gl-entry').map((el) => {
  const name = $('.gl-name', el);
  const exp = $('.gl-exp', el);
  const def = $('dd > p:first-child', el);
  const aka = $('.gl-aka', el);
  // The names an entry answers to: its name, expansion and every "Also" name, for ranking a search.
  const own = [name.textContent, exp?.textContent].filter(Boolean);
  const names = [...own, ...(aka ? aka.textContent.replace(/^Also:\s*/, '').split(', ') : [])].map((n) => n.toLowerCase().trim());
  return {
    el,
    part: el.dataset.part,
    keys: el.dataset.k,
    names,
    nOwn: own.length,
    name: name.textContent.toLowerCase(),
    text: def.textContent.toLowerCase(),
    hl: [name, exp, def].filter(Boolean).map((n) => ({ n, html: n.innerHTML })),
  };
});
const TOTAL = entries.length;
const PART_NAMES = Object.fromEntries($$('#gl-filter button').map((b) => [b.dataset.part, b.textContent]));

let part = '';
let query = '';

// ---------------------------------------------------------------- A-Z bar
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const letterLinks = {};
for (const L of LETTERS) {
  const sec = sections.find((s) => s.dataset.letter === L);
  const a = document.createElement('a');
  a.textContent = L;
  if (sec) {
    a.href = `#${$('h2', sec).id}`;
    letterLinks[L] = a;
  } else {
    a.setAttribute('aria-disabled', 'true');
    a.className = 'off';
  }
  az.appendChild(a);
}
az.addEventListener('click', (e) => {
  const a = e.target.closest('a');
  if (!a) return;
  e.preventDefault();
  if (a.classList.contains('off')) return;
  const h = document.getElementById(a.getAttribute('href').slice(1));
  setAzOpen(false);
  h.scrollIntoView({ block: 'start' });
  history.replaceState(null, '', urlWith(`#${h.id}`));
});

function setAzOpen(open) {
  az.classList.toggle('open', open);
  azBtn.setAttribute('aria-expanded', String(open));
}
azBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  setAzOpen(!az.classList.contains('open'));
});
document.addEventListener('click', (e) => {
  if (az.classList.contains('open') && !tools.contains(e.target)) setAzOpen(false);
});

// ---------------------------------------------------------------- the rail's contents
// The rail lists the letters (layout.js). Hidden letters are dropped from it, and its scroll-spy is redone over the
// visible ones only: a hidden section's heading has an empty rect at the top, which would otherwise win.
const railLinks = Object.fromEntries($$('.rail .toc a').map((a) => [a.getAttribute('href').slice(1), a])); // by heading id
const railList = Object.values(railLinks);
function railSpy() {
  if (!railList.length) return;
  let on = null;
  for (const a of railList) {
    const h = document.getElementById(a.getAttribute('href').slice(1));
    if (h && h.offsetParent !== null && h.getBoundingClientRect().top < 140) on = a;
  }
  for (const a of railList) a.classList.toggle('on', a === on && window.scrollY > 200);
}
addEventListener('scroll', railSpy, { passive: true });

// ---------------------------------------------------------------- search and filter
const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Wrap each query word in <mark> inside the text nodes of an element (never inside tags).
function highlight(node, words) {
  if (!words.length) return;
  const rx = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi');
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    if (!rx.test(t.data)) continue;
    rx.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    t.data.replace(rx, (m, _g, i) => {
      if (i > last) frag.appendChild(document.createTextNode(t.data.slice(last, i)));
      const mk = document.createElement('mark');
      mk.textContent = m;
      frag.appendChild(mk);
      last = i + m.length;
      return m;
    });
    if (last < t.data.length) frag.appendChild(document.createTextNode(t.data.slice(last)));
    t.replaceWith(frag);
  }
}

// How well an entry's names match the query, best first: its own name (or expansion) exactly, an "Also" name
// exactly, its name starting with the query, an "Also" name starting with it, any name containing it, every word
// somewhere in the names. 0: only the definition matches.
function rank(e, q, words) {
  const own = e.names.slice(0, e.nOwn), aka = e.names.slice(e.nOwn);
  if (own.includes(q)) return 6;
  if (aka.includes(q)) return 5;
  if (own.some((n) => n.startsWith(q))) return 4;
  if (aka.some((n) => n.startsWith(q))) return 3;
  if (e.names.some((n) => n.includes(q))) return 2;
  return words.every((w) => e.keys.includes(w)) ? 1 : 0;
}
let best = null; // the entry Enter goes to

function apply({ keepScroll = false } = {}) {
  const q = norm(query);
  const words = q.split(/\s+/).filter(Boolean);
  let shown = 0;
  let bestRank = -1;
  best?.el.classList.remove('gl-best');
  best = null;
  for (const e of entries) {
    const hay = `${e.keys} ${e.text}`;
    const ok = (!part || e.part === part) && words.every((w) => hay.includes(w));
    e.el.hidden = !ok;
    e.el.classList.remove('gl-flash');
    for (const h of e.hl) h.n.innerHTML = h.html;
    if (ok) {
      shown++;
      if (words.length) {
        e.hl.forEach((h) => highlight(h.n, words));
        const r = rank(e, q, words);
        if (r > bestRank) { bestRank = r; best = e; }
      }
    }
  }
  // Mark the best match when it is found by name and isn't simply the first entry shown.
  if (best && bestRank > 0 && best !== entries.find((x) => !x.el.hidden)) best.el.classList.add('gl-best');
  for (const s of sections) {
    const any = $$('.gl-entry', s).some((el) => !el.hidden);
    s.hidden = !any;
    const a = letterLinks[s.dataset.letter];
    if (a) a.classList.toggle('off', !any);
    const railItem = railLinks[$('h2', s).id]?.parentElement;
    if (railItem) railItem.hidden = !any;
  }
  railSpy();
  const filtered = words.length || part;
  count.innerHTML = filtered ? `<b>${shown}</b> of ${TOTAL}` : `${TOTAL} terms`;
  empty.hidden = shown > 0;
  if (!shown) {
    $('#gl-empty-q').textContent = query.trim() ? `“${query.trim()}”` : 'this filter';
    $('#gl-empty-part').textContent = part ? ` in ${PART_NAMES[part]}` : '';
  }
  // After a new search, bring the first match into view (only if the list start has scrolled away).
  if (!keepScroll && filtered) {
    const top = tools.getBoundingClientRect().top;
    if (top <= 1) {
      const y = window.scrollY + $('#gl-body').getBoundingClientRect().top - tools.offsetHeight - 8;
      window.scrollTo({ top: y });
    }
  }
  syncUrl();
}

function urlWith(hash) {
  const p = new URLSearchParams();
  if (query.trim()) p.set('q', query.trim());
  if (part) p.set('part', part);
  const qs = p.toString();
  return `${location.pathname}${qs ? `?${qs}` : ''}${hash ?? location.hash}`;
}
function syncUrl() { history.replaceState(null, '', urlWith()); }

let t = 0;
input.addEventListener('input', () => {
  query = input.value;
  clearTimeout(t);
  t = setTimeout(() => apply(), 90);
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { input.value = ''; query = ''; apply({ keepScroll: true }); }
  if (e.key === 'Enter') {
    // Enter goes to the best match: an exact name first, then a name starting with the query, and so on.
    clearTimeout(t);
    query = input.value;
    apply({ keepScroll: true });
    const go = best || entries.find((x) => !x.el.hidden);
    if (go) { input.blur(); go.el.scrollIntoView({ block: 'start' }); flash(go.el); }
  }
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    input.focus();
  }
});

const filterBtns = $$('#gl-filter button');
function setPart(p) {
  part = p;
  filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.part === p)));
}
filterBtns.forEach((b) => b.addEventListener('click', () => { setPart(b.dataset.part); apply({ keepScroll: true }); }));

function clearAll() {
  input.value = '';
  query = '';
  setPart('');
  apply({ keepScroll: true });
}
$('#gl-clear').addEventListener('click', () => { clearAll(); input.focus(); });

// ---------------------------------------------------------------- deep links
function flash(el) {
  el.classList.remove('gl-flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('gl-flash');
}

// A link to another entry clears any filter that hides it, then scrolls to it. The new history entry is pushed
// first, so Back returns to the search or filter as it was.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#term-"]');
  if (!a) return;
  const el = document.getElementById(a.getAttribute('href').slice(1));
  if (!el) return;
  e.preventDefault();
  history.pushState(null, '', urlWith(`#${el.id}`));
  if (el.hidden) clearAll();
  el.scrollIntoView({ block: 'start' });
  flash(el);
});
// Back and Forward: restore the search and filter that entry had.
addEventListener('popstate', () => {
  readUrl();
  apply({ keepScroll: true });
});
addEventListener('hashchange', () => {
  const el = document.getElementById(location.hash.slice(1));
  if (el && el.classList.contains('gl-entry')) {
    if (el.hidden) clearAll();
    el.scrollIntoView({ block: 'start' });
    flash(el);
  }
});

// ---------------------------------------------------------------- the sticky toolbar
// Jumps land below the toolbar, whatever its height.
function setScrollPadding() {
  document.documentElement.style.scrollPaddingTop = `${tools.offsetHeight + 14}px`;
}
// On phones the floating "Chapters" button sits over the toolbar's left end whenever it is showing.
const menuBtn = $('.menu-btn');
function makeRoom() {
  const stuck = tools.getBoundingClientRect().top <= 1;
  const btnShown = menuBtn && getComputedStyle(menuBtn).display !== 'none' && !menuBtn.classList.contains('tucked');
  tools.classList.toggle('stuck', stuck);
  tools.classList.toggle('room', stuck && btnShown);
}
addEventListener('scroll', makeRoom, { passive: true });
addEventListener('resize', () => { setScrollPadding(); makeRoom(); });
if (menuBtn) new MutationObserver(makeRoom).observe(menuBtn, { attributes: true, attributeFilter: ['class'] });

// ---------------------------------------------------------------- start
function readUrl() {
  const p = new URLSearchParams(location.search);
  query = p.get('q') || '';
  input.value = query;
  const startPart = p.get('part') || '';
  setPart(filterBtns.some((b) => b.dataset.part === startPart) ? startPart : '');
}
{
  readUrl();
  apply({ keepScroll: true });
  setScrollPadding();
  makeRoom();
  const target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) {
    if (target.hidden) clearAll();
    requestAnimationFrame(() => {
      target.scrollIntoView({ block: 'start' });
      if (target.classList.contains('gl-entry')) flash(target);
    });
  }
}
