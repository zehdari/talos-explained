// A story told as a short chain of boxes, one step at a time, plus an "Every box" view that lists each box's links.
// Each step: { nodes: [id | [id, id]], hops: [{ k, s, back, cold }], text }. hops[i] joins nodes[i] and nodes[i + 1];
// an array of ids is a stack of boxes that one arrow fans out to. A cold hop is part of the chain but not of this step.
// HTML, not SVG: the chain runs down the page on a phone and across on a wide screen (container query in commanding.css).

const box = (n, hot) => `<div class="ch-node${hot ? ' hot' : ''}"><b>${n.label}</b><span class="ch-sub">${n.sub}</span><span class="ch-where">${n.where}</span></div>`;

export class FlowSteps {
  constructor(host, { nodes, edges, stories, segmented }) {
    this.host = host;
    this.nodes = nodes;
    this.edges = edges;
    this.stories = stories;
    host.innerHTML = `
      <div class="ch-nav">
        <button type="button" class="btn" data-go="-1">‹ Back</button>
        <span class="ch-count" aria-live="polite"></span>
        <button type="button" class="btn primary" data-go="1">Next ›</button>
      </div>
      <div class="ch-stage"></div>
      <p class="ch-text" aria-live="polite"></p>
      <div class="eb" hidden>
        <div class="eb-pick" role="group" aria-label="Box"></div>
        <div class="eb-card"></div>
      </div>`;
    this.$ = (s) => host.querySelector(s);
    host.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => this.go(+b.dataset.go); });
    const bar = host.parentElement.querySelector('#flow-stories');
    this.bar = segmented(bar, [...stories.map((s) => [s.id, s.name]), ['all', 'Every box']], stories[0].id, (id) => this.pick(id), 'Story');
    // Every box: one chip per box, its links listed under it.
    const pick = this.$('.eb-pick');
    pick.innerHTML = Object.entries(nodes).map(([id, n]) => `<button type="button" data-id="${id}" aria-pressed="false">${n.label}</button>`).join('');
    pick.querySelectorAll('button').forEach((b) => { b.onclick = () => this.showBox(b.dataset.id); });
    this.pick(stories[0].id);
  }

  pick(id) {
    const all = id === 'all';
    this.$('.eb').hidden = !all;
    for (const s of ['.ch-nav', '.ch-stage', '.ch-text']) this.$(s).hidden = all;
    if (all) { this.showBox(this.boxId || 'mpc'); return; }
    this.story = this.stories.find((s) => s.id === id);
    this.i = 0;
    this.draw();
  }

  go(d) {
    const n = this.story.steps.length;
    if (d > 0 && this.i === n - 1) {
      // Past the last step: on to the next story.
      const k = this.stories.indexOf(this.story);
      const next = this.stories[(k + 1) % this.stories.length];
      this.bar.set(next.id);
      this.pick(next.id);
      return;
    }
    this.i = Math.max(0, Math.min(n - 1, this.i + d));
    this.draw();
  }

  draw() {
    const step = this.story.steps[this.i], n = this.story.steps.length;
    const hotNodes = new Set();
    step.hops.forEach((h, i) => {
      if (h.cold) return;
      for (const x of [step.nodes[i], step.nodes[i + 1]]) [].concat(x).forEach((id) => hotNodes.add(id));
    });
    const node = (x) => (Array.isArray(x)
      ? `<div class="ch-group">${x.map((id) => box(this.nodes[id], hotNodes.has(id))).join('')}</div>`
      : box(this.nodes[x], hotNodes.has(x)));
    let html = '';
    step.nodes.forEach((x, i) => {
      html += node(x);
      const h = step.hops[i];
      if (h) html += `<div class="ch-hop${h.cold ? ' cold' : ' hot'}${h.back ? ' back' : ''}"><span class="ch-k">${h.k}</span><span class="ch-line" aria-hidden="true"></span><span class="ch-s">${h.s}</span></div>`;
    });
    this.$('.ch-stage').innerHTML = `<div class="ch">${html}</div>`;
    this.$('.ch-text').innerHTML = step.text;
    this.$('.ch-count').textContent = `Step ${this.i + 1} of ${n}`;
    this.$('[data-go="-1"]').disabled = this.i === 0;
    this.$('[data-go="1"]').textContent = this.i === n - 1 ? 'Next story ›' : 'Next ›';
  }

  showBox(id) {
    this.boxId = id;
    const n = this.nodes[id];
    this.$('.eb-pick').querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === id)));
    const list = (arr, dir) => arr.map(([from, to, meta]) => {
      const other = this.nodes[dir === 'in' ? from : to];
      return `<li><span class="eb-dir">${dir === 'in' ? '← from' : '→ to'}</span> <b>${other.label}</b><span class="eb-meta">${meta}</span></li>`;
    }).join('');
    const ins = this.edges.filter((e) => e[1] === id), outs = this.edges.filter((e) => e[0] === id);
    this.$('.eb-card').innerHTML = `
      <div class="eb-head"><b>${n.label}</b> <span class="ch-sub">${n.sub}</span><span class="ch-where">${n.where}</span></div>
      <p>${n.info} <a href="${n.link}">${n.link.startsWith('http') ? 'Code' : 'More'}</a>.</p>
      <ul class="eb-links">${list(ins, 'in')}${list(outs, 'out')}</ul>`;
  }
}
