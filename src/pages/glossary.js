import { setup } from '../layout.js';
import { PARTS } from '../site.js';
import '../css/chapter.css';
import '../css/glossary.css';

setup();

// The entries are static HTML (built by tools/glossary/build.py), so deep links and find-in-page work without
// this script. Here: search (best match first, then name matches, then entries that only mention the words), a
// part filter, the A-Z jump bar, and keeping the sticky toolbar clear of the phone's floating "Chapters" button.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const tools = $('#gl-tools');
const anchor = $('#gl-anchor'); // where the toolbar sits before it sticks
const body = $('#gl-body');
const input = $('#gl-q');
const count = $('#gl-count');
const az = $('#gl-az');
const azBtn = $('#gl-az-btn');
const partSel = $('#gl-part');
const partX = $('#gl-part-x');
const empty = $('#gl-empty');
const more = $('#gl-more'); // "N more in other parts" while a part filter hides matches
const sub = $('#gl-sub');
const sections = $$('.gl-letter');
const entries = $$('.gl-entry').map((el) => {
  const name = $('.gl-name', el);
  const exp = $('.gl-exp', el);
  const def = $('dd > p:first-child', el);
  const aka = $('.gl-aka', el);
  // The names an entry answers to: its name, expansion and every "Also" name, for ranking a search.
  const own = [name.textContent, exp?.textContent].filter(Boolean);
  const raw = [...own, ...(aka ? aka.textContent.replace(/^Also:\s*/, '').split(', ') : [])].map((n) => n.trim());
  const names = raw.map((n) => n.toLowerCase());
  // Every name, also split at camelCase humps, so "report" finds KillSwitchReport only as a word of its own.
  const keys = `${names.join(' | ')} | ${raw.map((n) => n.replace(/([a-z0-9])([A-Z])/g, '$1 $2')).join(' | ').toLowerCase()}`;
  return {
    el,
    part: el.dataset.part,
    keys,
    names,
    nOwn: own.length,
    w: Number(el.dataset.w) || 0, // how many other entries link here: breaks ties in the ranking
    text: def.textContent.toLowerCase(),
    // Marked on a search: the name, expansion, definition and "Also" line (so an alias match shows why it is there).
    hl: [name, exp, def, aka].filter(Boolean).map((n) => ({ n, html: n.innerHTML })),
  };
});
const TOTAL = entries.length;

// The part filter's options come from the site map, so they always match the rail. Only parts with terms show.
const partCount = {};
for (const e of entries) partCount[e.part] = (partCount[e.part] || 0) + 1;
const PART_NAMES = {};
for (const p of PARTS) {
  if (!partCount[p.id]) continue;
  PART_NAMES[p.id] = p.title;
  const o = document.createElement('option');
  o.value = p.id;
  o.textContent = p.title;
  partSel.appendChild(o);
}

let part = '';
let query = '';
const isPhone = () => matchMedia('(max-width: 640px)').matches;

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
  // A letter means browsing: drop the search (keep the part), then jump.
  if (query.trim()) { input.value = ''; query = ''; apply({ keepScroll: true }); }
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

// Wrap each match of rx in <mark> inside the text nodes of an element (never inside tags). rx has the matched word
// as its last group, so a leading boundary character stays unmarked.
function highlight(node, rx) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) texts.push(walker.currentNode);
  for (const t of texts) {
    rx.lastIndex = 0;
    if (!rx.test(t.data)) continue;
    rx.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = rx.exec(t.data))) {
      const word = m[m.length - 1];
      const i = m.index + m[0].length - word.length;
      if (i > last) frag.appendChild(document.createTextNode(t.data.slice(last, i)));
      const mk = document.createElement('mark');
      mk.textContent = word;
      frag.appendChild(mk);
      last = i + word.length;
      if (!m[0].length) rx.lastIndex++;
    }
    if (last < t.data.length) frag.appendChild(document.createTextNode(t.data.slice(last)));
    t.replaceWith(frag);
  }
}

// How well an entry's names match the query, best first: its own name (or expansion) exactly, an "Also" name
// exactly, its name starting with the query, an "Also" name starting with it, a word in a name starting with the
// whole query, every query word starting a word in the names. 0: only the definition mentions it.
function rank(e, q, words, starts, phrase) {
  const own = e.names.slice(0, e.nOwn), aka = e.names.slice(e.nOwn);
  if (own.includes(q)) return 6;
  if (aka.includes(q)) return 5;
  if (own.some((n) => n.startsWith(q))) return 4;
  if (aka.some((n) => n.startsWith(q))) return 3;
  if (phrase.test(e.keys)) return 2;
  return starts.every((rx) => rx.test(e.keys)) ? 1 : 0;
}
let best = null; // the entry Enter goes to

// Ranked order while searching: better name match first, then the entry more others link to, then A to Z.
const byRank = (a, b) => b.r - a.r || b.w - a.w || a.i - b.i;
entries.forEach((e, i) => { e.i = i; });

function apply({ keepScroll = false } = {}) {
  const q = norm(query);
  const words = q.split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  // Every word has to start a word somewhere ("update" finds needs_update, "orin" the Orin but not "mirroring").
  const starts = words.map((w) => new RegExp(`(?:^|[^a-z0-9])${escapeRe(w)}`));
  const phrase = new RegExp(`(?:^|[^a-z0-9])${escapeRe(q)}`);
  const rxWords = searching ? new RegExp(`(?:^|[^a-z0-9])(${words.map(escapeRe).join('|')})`, 'gi') : null;
  let shown = 0, elsewhere = 0;
  const hits = [];
  best?.el.classList.remove('gl-best');
  best = null;
  for (const e of entries) {
    const match = starts.every((rx) => rx.test(e.keys) || rx.test(e.text));
    const ok = match && (!part || e.part === part);
    if (match && !ok) elsewhere++;
    e.el.hidden = !ok;
    e.el.classList.remove('gl-flash');
    for (const h of e.hl) h.n.innerHTML = h.html;
    e.el.style.order = '';
    if (!ok) continue;
    shown++;
    if (!searching) continue;
    e.hl.forEach((h) => highlight(h.n, rxWords));
    e.r = rank(e, q, words, starts, phrase);
    hits.push(e);
  }
  // While searching, the list is one ranked column: names that match (best first), then entries that only mention
  // the words. "Best match" (and Enter) goes to the top name only if it is a clear winner: the name or an "Also"
  // name is the query, or a name starts with it, and no other entry matches as well. Ties get no label.
  body.classList.toggle('searching', searching);
  if (searching) {
    const named = hits.filter((e) => e.r > 0).sort(byRank);
    const mentions = hits.filter((e) => e.r === 0);
    if (named[0] && named[0].r >= 3 && named[1]?.r !== named[0].r) best = named[0];
    named.forEach((e, i) => { e.el.style.order = i + 1; });
    sub.style.order = named.length + 1;
    mentions.forEach((e, i) => { e.el.style.order = named.length + 2 + i; });
    best?.el.classList.add('gl-best');
    sub.hidden = !(mentions.length && named.length);
    sub.textContent = `Mentioned in ${mentions.length} more ${mentions.length === 1 ? 'entry' : 'entries'}`;
  } else {
    sub.hidden = true;
  }
  // A part filter must not hide matches silently: say how many are in other parts, with a way to show them.
  more.hidden = !(part && searching && elsewhere);
  if (!more.hidden) {
    $('#gl-more-n').textContent = `${elsewhere} more ${elsewhere === 1 ? 'match' : 'matches'} in other parts`;
  }
  for (const s of sections) {
    const any = $$('.gl-entry', s).some((el) => !el.hidden);
    s.hidden = !any;
    // Letters follow the part filter, not the search: tapping one leaves the search for the A to Z list.
    const inPart = !part || $$('.gl-entry', s).some((el) => el.dataset.part === part);
    const a = letterLinks[s.dataset.letter];
    if (a) a.classList.toggle('off', !inPart);
    const railItem = railLinks[$('h2', s).id]?.parentElement;
    if (railItem) railItem.hidden = !any || searching;
  }
  railSpy();
  const filtered = searching || part;
  count.innerHTML = filtered ? `<b>${shown}</b> of ${TOTAL}` : `${TOTAL} terms`;
  empty.hidden = shown > 0;
  if (!shown) {
    $('#gl-empty-q').textContent = query.trim() ? `“${query.trim()}”` : 'this filter';
    $('#gl-empty-part').textContent = part ? ` in ${PART_NAMES[part]}` : '';
    $('#gl-empty-tip').hidden = !!(part && elsewhere);
    $('#gl-clear').textContent = part ? 'Clear search and filter' : 'Clear the search';
  }
  if (!keepScroll && filtered) revealResults();
  syncUrl();
}

// Put the toolbar at the top of the screen with the first result (or the empty box) right under it. On a phone it
// always moves there, so the results sit above the keyboard; on a wide screen only if the list has scrolled away.
function toolsHome() { return Math.round(anchor.getBoundingClientRect().top + window.scrollY); }
function revealResults() {
  const y = toolsHome();
  if (window.scrollY > y + 1 || (isPhone() && window.scrollY < y - 1)) window.scrollTo({ top: y });
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
// On a phone, focusing the search lifts the toolbar to the top before the keyboard opens.
input.addEventListener('focus', () => {
  if (isPhone() && window.scrollY < toolsHome() - 1) window.scrollTo({ top: toolsHome() });
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { input.value = ''; query = ''; apply({ keepScroll: true }); }
  if (e.key === 'Enter') {
    // Enter goes to the best match (it is listed first), or the first entry shown.
    clearTimeout(t);
    query = input.value;
    apply({ keepScroll: true });
    const go = best || entries.filter((x) => !x.el.hidden).sort((a, b) => (a.el.style.order || 0) - (b.el.style.order || 0))[0];
    if (go) { input.blur(); go.el.scrollIntoView({ block: 'start' }); flash(go.el); }
  }
});
addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
    e.preventDefault();
    input.focus();
  }
});

function setPart(p) {
  part = PART_NAMES[p] ? p : '';
  partSel.value = part;
  partX.hidden = !part;
  $('#gl-pick').classList.toggle('on', !!part);
}
partSel.addEventListener('change', () => { setPart(partSel.value); apply(); });
partX.addEventListener('click', () => { setPart(''); apply(); });
$('#gl-more-all').addEventListener('click', () => { setPart(''); apply(); });

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

// A link to another entry clears any search or filter (it would hide or reorder the list), then scrolls to it.
// The new history entry is pushed first, so Back returns to the search or filter as it was.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href^="#term-"]');
  if (!a) return;
  const el = document.getElementById(a.getAttribute('href').slice(1));
  if (!el) return;
  e.preventDefault();
  // Remember where the reader was, so Back returns to the same spot in the results.
  history.replaceState({ y: window.scrollY }, '', urlWith());
  history.pushState(null, '', urlWith(`#${el.id}`));
  if (el.hidden || query.trim()) clearAll();
  el.scrollIntoView({ block: 'start' });
  flash(el);
});
// Back and Forward: restore the search and filter that entry had.
addEventListener('popstate', (ev) => {
  readUrl();
  apply({ keepScroll: true });
  const y = ev.state?.y;
  if (typeof y === 'number') window.scrollTo({ top: y });
  else if (query.trim() || part) revealResults();
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
// On phones the floating "Chapters" button sits over the toolbar's top-left corner whenever it is showing: move the
// search box right by exactly the overlap.
const menuBtn = $('.menu-btn');
function makeRoom() {
  const tr = tools.getBoundingClientRect();
  const stuck = tr.top <= 1;
  tools.classList.toggle('stuck', stuck);
  let room = 0;
  if (stuck && menuBtn && getComputedStyle(menuBtn).display !== 'none' && !menuBtn.classList.contains('tucked')) {
    room = Math.max(0, Math.ceil(menuBtn.getBoundingClientRect().right + 8 - tr.left - parseFloat(getComputedStyle(tools).paddingLeft)));
  }
  tools.style.setProperty('--room', `${room}px`);
}
addEventListener('scroll', makeRoom, { passive: true });
addEventListener('resize', () => { setScrollPadding(); makeRoom(); });
if (menuBtn) new MutationObserver(makeRoom).observe(menuBtn, { attributes: true, attributeFilter: ['class'] });

// ---------------------------------------------------------------- start
function readUrl() {
  const p = new URLSearchParams(location.search);
  query = p.get('q') || '';
  input.value = query;
  setPart(p.get('part') || '');
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
