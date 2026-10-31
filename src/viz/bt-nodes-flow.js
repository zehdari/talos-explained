// A step-by-step flow drawn in HTML, so its text stays at full size on a phone: numbered steps down the left, each
// joined to the next by a labelled arrow, with side branches (a card or a small pill) on the right of a step.
// Tapping a step or a branch opens its text right under that row; one is open at a time, and the first step starts
// open. Used by the tree-nodes chapter for "one stateful action's life" and "one goal through doTask".
//
// flow(host, { steps, open, label })
//   steps: [{ id, n, title, sub, info, next, side: [{ id, kind: 'card' | 'pill', title, sub, edge, dir: 'out' | 'in',
//            tone: 'bad' | '', info, to }] }]
//   next:  the label of the arrow down to the following step ('' for a plain arrow, null for none).
//   side item: a card has its own `info`; a pill has its own `id` and `info`, or opens the step or card named by `to`.
const esc = (s) => String(s ?? '');

export function flow(host, { steps, open, label = '' }) {
  const ol = document.createElement('ol');
  ol.className = 'flow';
  if (label) ol.setAttribute('aria-label', label);
  const info = new Map(); // id -> { html, row, title }
  const order = steps.map((s) => s.id);
  const titleOf = new Map();

  steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'flow-row' + (s.next !== null && s.next !== undefined ? ' has-next' : '');
    li.dataset.id = s.id;
    const side = (s.side || []).map((x) => {
      if (x.kind === 'pill') {
        // a pill with its own text opens that; otherwise it opens the step or card named by `to`
        if (x.info) info.set(x.id, { html: x.info, row: li, title: x.title });
        return `<button type="button" class="flow-pill${x.tone ? ' ' + x.tone : ''}" data-open="${x.info ? x.id : x.to}" aria-expanded="false">${esc(x.title)}</button>`;
      }
      info.set(x.id, { html: x.info, row: li, title: x.title });
      titleOf.set(x.id, x.title);
      return `<div class="flow-branch ${x.dir || 'out'}${x.tone ? ' ' + x.tone : ''}">
          ${x.edge ? `<span class="flow-elabel" aria-hidden="true">${esc(x.edge)}</span>` : ''}<span class="flow-edge" aria-hidden="true"></span>
          <button type="button" class="flow-card side" data-open="${x.id}" aria-expanded="false">
            <span class="ft">${esc(x.title)}</span>${x.sub ? `<span class="fs">${esc(x.sub)}</span>` : ''}</button></div>`;
    }).join('');
    li.innerHTML = `<div class="flow-main">
        <button type="button" class="flow-card" data-open="${s.id}" aria-expanded="false">
          <span class="fn">${s.n ?? i + 1}</span><span class="ftxt"><span class="ft">${esc(s.title)}</span>${s.sub ? `<span class="fs">${esc(s.sub)}</span>` : ''}</span></button>
      </div><div class="flow-side">${side}</div>`;
    info.set(s.id, { html: s.info, row: li, title: s.title });
    titleOf.set(s.id, s.title);
    ol.appendChild(li);
    if (s.next !== null && s.next !== undefined) {
      const link = document.createElement('li');
      link.className = 'flow-link' + (s.nextTone ? ' ' + s.nextTone : '');
      link.setAttribute('aria-hidden', 'true');
      link.innerHTML = `<span class="arr"></span><span class="lbl">${esc(s.next)}</span>`;
      ol.appendChild(link);
    }
  });

  const note = document.createElement('li');
  note.className = 'flow-info';
  note.setAttribute('aria-live', 'polite');
  let current = null;

  function show(id, focus, at) {
    current = id;
    ol.querySelectorAll('[data-open]').forEach((b) => {
      const on = b.dataset.open === id && (!at || b.closest('.flow-row') === at || !b.classList.contains('flow-pill'));
      b.setAttribute('aria-expanded', String(on));
      b.classList.toggle('on', on);
    });
    if (!id) { note.remove(); return; }
    const it = info.get(id);
    const k = order.indexOf(id);
    const nextId = k >= 0 ? order[k + 1] : null;
    note.innerHTML = `<div>${it.html}</div>${nextId ? `<button type="button" class="flow-next" data-go="${nextId}">Next: ${esc(titleOf.get(nextId))} <span aria-hidden="true">›</span></button>` : ''}`;
    (at || it.row).after(note);
    const go = note.querySelector('.flow-next');
    if (go) go.onclick = () => show(go.dataset.go, true);
    if (focus) {
      const r = (at || it.row).getBoundingClientRect();
      if (r.top < 60 || r.top > innerHeight * 0.6) window.scrollBy({ top: r.top - 90, behavior: 'smooth' });
    }
  }
  ol.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (!b) return;
    // a pill opens its target's text under the pill's own row, where the reader is
    const at = b.classList.contains('flow-pill') ? b.closest('.flow-row') : null;
    show(b.dataset.open === current && (!at || note.previousElementSibling === at) ? null : b.dataset.open, false, at);
  });
  host.appendChild(ol);
  show(open ?? steps[0].id);
  return { show };
}
