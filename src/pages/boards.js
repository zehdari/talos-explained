import { setup } from '../layout.js';
import { Graph } from '../viz/graph.js';
import '../css/chapter.css';
import '../css/boards.css';

setup();
const BASE = import.meta.env.BASE_URL;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]);
const code = (t) => `<code>${esc(t)}</code>`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Public images: the src is set here from BASE_URL (a root-absolute src in the HTML gets the base prefixed twice by the dev server).
document.querySelectorAll('img[data-src]').forEach((im) => { im.src = BASE + im.dataset.src; });

// ---------------------------------------------------------------------------------------------- lightbox
// Schematic crops are 1.5-2k px wide with small text: a tap opens the whole sheet fitted to the screen,
// and the Zoom button (or a tap on the sheet) switches to 1:1 pixels in a scroll box.
{
  const dlg = document.getElementById('bx-lightbox');
  const box = dlg.querySelector('.bx-lb-scroll');
  const zoom = dlg.querySelector('.bx-zoom-toggle');
  const close = () => dlg.close();
  const setZoom = (on, at) => {
    const img = box.querySelector('img');
    if (!img) return;
    // Keep the tapped point under the finger when zooming in.
    const r = img.getBoundingClientRect();
    const fx = at ? (at.clientX - r.left) / r.width : 0.5, fy = at ? (at.clientY - r.top) / r.height : 0.5;
    dlg.classList.toggle('zoomed', on);
    zoom.setAttribute('aria-pressed', String(on));
    zoom.textContent = on ? 'Fit' : 'Zoom';
    if (on) box.scrollTo(fx * img.offsetWidth - box.clientWidth / 2, fy * img.offsetHeight - box.clientHeight / 2);
    else box.scrollTo(0, 0);
  };
  dlg.querySelector('.bx-close').addEventListener('click', close);
  zoom.addEventListener('click', () => setZoom(!dlg.classList.contains('zoomed')));
  box.addEventListener('click', (e) => { if (e.target.tagName === 'IMG') setZoom(!dlg.classList.contains('zoomed'), e); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
  document.querySelectorAll('.bx-zoom').forEach((b) => b.addEventListener('click', () => {
    const src = BASE + b.dataset.full;
    const alt = b.querySelector('img')?.alt || '';
    box.innerHTML = `<img src="${src}" alt="${esc(alt)}">`;
    dlg.classList.remove('zoomed');
    zoom.setAttribute('aria-pressed', 'false');
    zoom.textContent = 'Zoom';
    dlg.showModal();
    box.scrollTo(0, 0);
  }));
}

// ---------------------------------------------------------------------------------------------- board explorer
const sysData = fetch(BASE + 'data/boards/system.json').then((r) => r.json());
const explorerReady = Promise.all([fetch(BASE + 'data/boards/explorer.json').then((r) => r.json()), sysData]).then(([d, s]) => buildExplorer(d, s));

// A board's topics, each with the Orin-side code that uses it (shared by the explorer and the system diagram).
// Published topics show who reads them on the Orin (→); subscribed topics show who sends them (←). `extra` adds
// topics from a firmware branch that isn't on master, with its own heading.
function topicBlock(ros, users, cls, extra) {
  if (!ros) return '';
  const who = (name, dir) => {
    const u = (users[name] || []).filter((x) => (dir === 'from' ? x.dir !== 'reads' : x.dir !== 'sends'));
    if (!u.length) return '';
    return ` <span class="sys-u">${dir === 'from' ? '←' : '→'} ${u.map((x) => `<a href="${x.href}" title="${esc(x.what)}">${esc(x.label || x.file)}</a>`).join(', ')}</span>`;
  };
  const col = (head, list, dir) => `<div><b>${head}</b>${list.length ? `<ul>${list.map((n) => `<li>${code(n)}${who(n, dir)}</li>`).join('')}</ul>` : '<p class="sys-none">nothing</p>'}</div>`;
  let h = `<div class="sys-topics ${cls || ''}">${col('Publishes <span class="sys-k">→ read on the Orin by</span>', ros.publishes, 'to')}${col('Subscribes <span class="sys-k">← sent by</span>', ros.subscribes, 'from')}</div>`;
  if (extra) h += `<p class="sys-extra">${extra.note}</p><div class="sys-topics ${cls || ''}">${col('Publishes', extra.publishes, 'to')}${col('Subscribes', extra.subscribes, 'from')}</div>`;
  return h;
}

// The IVC's pinger topics come from a firmware branch, not master: shown under their own note.
const branchExtra = (sys, id) => {
  const x = sys.boards[id]?.branchRos;
  return x && { ...x, note: `Also, in the <a href="${x.url}">${code(x.project)}</a> firmware on the unmerged <code>${esc(x.branch)}</code> branch (the pinger listener; which build is flashed isn't recorded):` };
};

function buildExplorer(data, sys) {
  const users = sys.users;
  const boards = data.boards;
  const byId = Object.fromEntries(boards.map((b) => [b.id, b]));
  const pick = document.getElementById('bx-pick');
  const stageWrap = document.querySelector('#bx .bx-stage-wrap');
  const stage = document.getElementById('bx-stage');
  const note = document.getElementById('bx-note');
  const info = document.getElementById('bx-info');
  const sideSeg = document.getElementById('bx-side');
  const names = document.getElementById('bx-names');
  const st = { id: 'poac', side: 'top', sel: null, tab: 'parts' };

  // Board picker, grouped.
  let html = '', group = '';
  for (const b of boards) {
    if (b.group !== group) {
      group = b.group;
      html += `${html ? '</div>' : ''}<div class="bx-group"><span class="bx-glabel">${esc(b.groupLabel)}</span>`;
    }
    html += `<button class="bx-chip" data-id="${b.id}" aria-pressed="false">${esc(b.short)}</button>`;
  }
  pick.innerHTML = html + '</div>';
  pick.addEventListener('click', (e) => {
    const b = e.target.closest('.bx-chip');
    if (b) select(b.dataset.id);
  });
  sideSeg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.dataset.side === st.side) return;
    st.side = b.dataset.side;
    st.sel = null;
    drawStage();
  });
  names.addEventListener('change', () => { stage.classList.toggle('names', names.checked); layoutTags(); showSpot(st.sel); });

  // Tall boards use the rotated copy when there is room for it, so they fill the width instead of the height.
  const view = () => {
    const b = byId[st.id];
    const land = b.landscape && stageWrap.clientWidth >= 520;
    const key = st.side + (land ? 'L' : '');
    return { b, img: b.images[key] || b.images[st.side], spots: b.spots[key] || [] };
  };

  let sized = 0;
  function size() {
    const { img } = view();
    const ar = img.w / img.h;
    const maxH = Math.min(500, Math.max(300, innerHeight * 0.68));
    const w = Math.min(stageWrap.clientWidth, maxH * ar);
    stage.style.width = `${Math.round(w)}px`;
    stage.style.height = `${Math.round(w / ar)}px`;
    // Ring sizes are fractions of the longer side, with a finger-sized minimum. Long parts (a reed switch, a 40-pin
    // header) and tall, narrow boards would get rings that cover the board: cap the diameter at a fifth of the
    // shorter side and at 56 px on a phone.
    const longPx = Math.max(w, w / ar), shortPx = Math.min(w, w / ar);
    const cap = Math.min(0.2 * shortPx, w < 520 ? 56 : 110);
    stage.querySelectorAll('.bx-spot').forEach((s) => {
      const d = Math.max(26, Math.min(2 * +s.dataset.r * longPx, cap));
      s.style.width = s.style.height = `${d.toFixed(1)}px`;
    });
    sized = stageWrap.clientWidth;
    layoutTags();
  }

  // Name tags: slide each one back inside the picture, and with "Show names" on, hide the ones that would
  // overlap a name already placed (bigger parts first). A hidden name still shows when its ring is tapped.
  let hiddenTags = 0;
  function layoutTags() {
    const tags = [...stage.querySelectorAll('.bx-tag')];
    if (!tags.length) { hiddenTags = 0; return; }
    stage.classList.add('measuring');
    tags.forEach((t) => { t.style.marginLeft = ''; t.parentElement.classList.remove('tag-hide'); });
    const box = stage.getBoundingClientRect();
    const rects = tags.map((t) => {
      const r = t.getBoundingClientRect();
      const dx = Math.max(box.left + 2 - r.left, 0) + Math.min(box.right - 2 - r.right, 0);
      if (dx) t.style.marginLeft = `${dx.toFixed(1)}px`;
      return { l: r.left + dx, r: r.right + dx, t: r.top, b: r.bottom };
    });
    hiddenTags = 0;
    if (names.checked) {
      const order = tags.map((t, i) => i).sort((a, b) => +tags[b].parentElement.dataset.r - +tags[a].parentElement.dataset.r);
      const placed = [];
      for (const i of order) {
        const a = rects[i];
        if (placed.some((q) => a.l < q.r + 3 && a.r > q.l - 3 && a.t < q.b + 1 && a.b > q.t - 1)) {
          tags[i].parentElement.classList.add('tag-hide');
          hiddenTags++;
        } else placed.push(a);
      }
    }
    stage.classList.remove('measuring');
  }
  let lastLand = null;
  new ResizeObserver(() => {
    if (stageWrap.clientWidth === sized) return;
    const land = byId[st.id].landscape && stageWrap.clientWidth >= 520;
    if (land !== lastLand) drawStage();
    else size();
  }).observe(stageWrap);
  addEventListener('resize', () => size());

  function drawStage() {
    const { b, img, spots } = view();
    lastLand = b.landscape && stageWrap.clientWidth >= 520;
    sideSeg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.side === st.side)));
    stage.innerHTML = `<img src="${BASE + img.src}" alt="${esc(`${b.name}, ${st.side} side, 3D render`)}" draggable="false">` +
      spots.map((s, i) => `<button class="bx-spot" data-i="${i}" data-r="${s.r}" style="left:${(s.x * 100).toFixed(2)}%;top:${(s.y * 100).toFixed(2)}%" aria-label="${esc(`${s.ref}: ${s.label}`)}"><span class="bx-tag">${esc(s.label)}</span></button>`).join('');
    stage.classList.toggle('names', names.checked);
    // Tags near the right or bottom edge open the other way so they stay inside the picture.
    stage.querySelectorAll('.bx-spot').forEach((el, i) => {
      el.classList.toggle('tag-left', spots[i].x > 0.72);
      el.classList.toggle('tag-up', spots[i].y > 0.86);
    });
    size();
    showSpot(st.sel);
  }

  stage.addEventListener('pointerover', (e) => {
    const s = e.target.closest('.bx-spot');
    if (s && e.pointerType === 'mouse') showSpot(+s.dataset.i, true);
  });
  stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') showSpot(st.sel); });
  stage.addEventListener('click', (e) => {
    const s = e.target.closest('.bx-spot');
    if (!s) { st.sel = null; showSpot(null); return; }
    const i = +s.dataset.i;
    st.sel = st.sel === i ? null : i;
    showSpot(st.sel);
  });
  stage.addEventListener('focusin', (e) => {
    const s = e.target.closest('.bx-spot');
    if (s && s.matches(':focus-visible')) { st.sel = +s.dataset.i; showSpot(st.sel); }
  });

  function showSpot(i, hover = false) {
    const { b, spots } = view();
    stage.querySelectorAll('.bx-spot').forEach((el) => el.classList.toggle('on', +el.dataset.i === i));
    if (i === null || i === undefined || !spots[i]) {
      const n = spots.length;
      note.innerHTML = n
        ? `${n} ${n === 1 ? 'part' : 'parts'} marked on this side. Tap a ring, or a row with a dot in the lists.${names.checked && hiddenTags ? ` ${hiddenTags} ${hiddenTags === 1 ? 'name is' : 'names are'} hidden where they would overlap; tap a ring to see it.` : ''}`
        : b.id === 'led_module'
          ? 'The four LEDs have no 3D model, so they render as bare pads. The thermistor is the small part beside them.'
          : `No parts are marked on this side${b.group === 'retired' ? ' of a retired board' : ''}.`;
      info.querySelectorAll('.bx-row').forEach((r) => r.classList.remove('on'));
      return;
    }
    const s = spots[i];
    note.innerHTML = `<b>${esc(s.ref)} · ${esc(s.label)}</b><br>${esc(s.part)}${s.desc ? `. ${esc(cap(s.desc))}` : ''}`;
    if (!hover) info.querySelectorAll('.bx-row').forEach((r) => r.classList.toggle('on', r.dataset.ref === s.ref));
  }
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  function drawInfo() {
    const b = byId[st.id];
    const CAN_NOTE = {
      agx_breakout: "None itself: it is the Orin's way onto both buses",
      sbh_bms: 'Passes the external bus from the housing connector to the MCU board',
      mk2_power: 'Internal bus, client 1 (now the POAC\'s)',
      mk2_actuator: 'Internal bus, client 5 (unused on Talos)',
    };
    const can = !b.can ? CAN_NOTE[b.id] || 'Not on CAN'
      : Array.isArray(b.can.client_id) ? `${cap(b.can.bus)} bus, clients ${b.can.client_id.join(' and ')}`
        : typeof b.can.client_id === 'string' ? `${cap(b.can.bus)} bus; the client ID is the housing's serial number`
          : `${cap(b.can.bus)} bus, client ${b.can.client_id}`;
    const fw = b.firmware ? `<a href="${b.firmware.url}">${code(b.firmware.project)}</a>` : 'None (no microcontroller)';
    const rev = b.revision || {};
    const design = [rev.project && `<a href="${rev.project}">Altium project</a>`, !rev.project && rev.design && `<a href="${rev.design}">PCB file</a>`, rev.schematic_pdf && `<a href="${rev.schematic_pdf}">schematic PDF</a>`].filter(Boolean).join(' · ');
    const size = b.size ? `${fmt(b.size[0])} × ${fmt(b.size[1])} mm` : '';
    const mcu = b.mcu ? b.mcu.replace(' (shared RP2040 + CAN block)', ', in the shared RP2040 + CAN block') : 'None';
    const counts = { parts: b.parts.length, conn: b.connectors.length };
    info.innerHTML = `
      <div class="bx-head"><h3>${esc(b.name)}</h3><span class="bx-badge${b.group === 'retired' ? ' old' : ''}">${esc(b.status)}${b.count > 1 ? ` · ×${b.count}` : ''}</span></div>
      <p class="bx-purpose">${esc(b.purpose)}</p>
      ${b.why ? `<p class="bx-why"><b>Why:</b> ${esc(b.why)}${b.whySource ? ` (<a href="${b.whySource}">source</a>)` : ''}</p>` : ''}
      <dl class="spec bx-spec">
        <dt>Where</dt><dd>${esc(b.where)}</dd>
        ${size ? `<dt>Size</dt><dd>${size}</dd>` : ''}
        <dt>Brain</dt><dd>${esc(mcu)}</dd>
        <dt>CAN</dt><dd>${can}</dd>
        <dt>Firmware</dt><dd>${fw}</dd>
        ${design ? `<dt>Design</dt><dd>${design}</dd>` : ''}
        ${rev.notes ? `<dt>Revision</dt><dd>${esc(rev.notes)}</dd>` : ''}
      </dl>
      <div class="seg bx-tabs" role="group" aria-label="List">
        <button data-tab="parts" aria-pressed="${st.tab === 'parts'}">Parts${counts.parts ? ` <span class="bx-n">${counts.parts}</span>` : ''}</button><button data-tab="conn" aria-pressed="${st.tab === 'conn'}" aria-label="Connectors"><span class="bx-long">Connectors</span><span class="bx-short" aria-hidden="true">Conn.</span>${counts.conn ? ` <span class="bx-n">${counts.conn}</span>` : ''}</button>${b.power ? `<button data-tab="power" aria-pressed="${st.tab === 'power'}">Power</button>` : ''}<button data-tab="fw" aria-pressed="${st.tab === 'fw'}">Firmware</button>
      </div>
      <div class="bx-list" id="bx-list"></div>`;
    info.querySelector('.bx-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      st.tab = t.dataset.tab;
      info.querySelectorAll('.bx-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
      drawList();
    });
    drawList();
  }
  const fmt = (v) => (Math.round(v * 10) / 10).toString();

  const row = (ref, side, head, sub) => {
    const live = !!(ref && side);
    return `<li><button class="bx-row${live ? '' : ' flat'}" ${live ? `data-ref="${esc(ref)}" data-side="${side}"` : 'disabled'}><i class="bx-dot" aria-hidden="true"></i><span class="bx-r1">${head}</span><span class="bx-r2">${sub}</span></button></li>`;
  };
  function drawList() {
    const b = byId[st.id];
    const list = document.getElementById('bx-list');
    if (st.tab === 'power' && !b.power) st.tab = 'parts';
    info.querySelectorAll('.bx-tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.tab === st.tab)));
    if (st.tab === 'parts') {
      const mcuRows = b.mcu && b.mcu.startsWith('RP2040') ? `<p class="bx-more">Plus the shared RP2040 + CAN block (U1R, U1C, U2C …), described <a href="#rp2040">below</a>.</p>` : '';
      list.innerHTML = b.parts.length
        ? `<ul>${b.parts.map((p) => row(p.spotRef, p.spot, `<b>${esc(p.ref)}</b> ${esc(p.part)}`, esc(cap(p.role)))).join('')}</ul>${mcuRows}`
        : `<p class="bx-more">${b.group === 'retired' ? 'Retired; its parts are not listed here. The design is still in the repo.' : 'No key parts listed.'}</p>`;
      if (b.battery) {
        const bt = b.battery;
        list.innerHTML += `<p class="bx-more">Gas-gauge config: ${bt.cells_in_series} cells in series; cell protection below ${bt.cell_protection_mV.under_voltage / 1000} V and above ${bt.cell_protection_mV.over_voltage / 1000} V; discharge over-current tiers ${bt.discharge_overcurrent_mA.OCD1 / 1000} A and ${bt.discharge_overcurrent_mA.OCD2 / 1000} A (<a href="${bt.protection_source}">config</a>).</p>`;
      }
    } else if (st.tab === 'conn') {
      list.innerHTML = b.connectors.length
        ? `<ul>${b.connectors.map((c) => row(c.spotRef, c.spot, `<b>${esc(c.ref)}</b> ${c.label ? `<span class="silk">${esc(c.label)}</span>` : ''}`, `${esc(c.type)}: ${esc(c.carries)}`)).join('')}</ul>`
        : '<p class="bx-more">No connectors listed.</p>';
    } else if (st.tab === 'power') {
      const pw = b.power;
      const col = (head, items) => items && items.length ? `<div class="bx-pw"><b>${head}</b><ul>${items.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : '';
      list.innerHTML = col('Takes in', pw.inputs) + col('Makes', pw.makes) + col('Feeds', pw.feeds) +
        `<p class="bx-more">Read from the board's netlist. <a href="electrical.html">Power and wiring</a> follows the whole tree.</p>`;
    } else {
      const facts = b.firmwareFacts || [];
      const ros = b.ros;
      let h = '';
      if (!b.firmware) {
        h += `<p class="bx-more">${b.id === 'sbh_bms' ? 'No microcontroller: the battery MCU board reads its BQ40Z80 over SMBus.' : b.id === 'led_module' ? 'No microcontroller: the LED board drives it.' : b.group === 'orin' ? 'No microcontroller: the Orin drives it directly.' : 'No firmware listed.'}</p>`;
      } else {
        h += `<p class="bx-more">${code(b.firmware.project)}, built for board ${code(b.firmware.pico_board)}. <a href="firmware.html">Firmware on the boards</a> explains the code.</p>`;
      }
      if (facts.length) h += `<ul class="bx-facts">${facts.map((f) => `<li>${esc(f.text)} <a class="bx-src" href="${f.source}">source</a></li>`).join('')}</ul>`;
      if (ros) h += topicBlock(ros, users, 'bx-topics', branchExtra(sys, b.id));
      list.innerHTML = h;
    }
    showSpot(st.sel);
  }

  info.addEventListener('click', (e) => {
    const r = e.target.closest('.bx-row');
    if (!r || r.disabled) return;
    if (r.dataset.side !== st.side) st.side = r.dataset.side;
    const { spots } = view();
    st.sel = spots.findIndex((s) => s.ref === r.dataset.ref);
    if (st.sel < 0) st.sel = null;
    drawStage();
    // On a phone the picture is above the list: bring it back into view.
    const box = stage.getBoundingClientRect();
    if (box.top < 0 || box.bottom > innerHeight) stage.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  });

  function select(id) {
    st.id = id;
    st.sel = null;
    st.side = 'top';
    pick.querySelectorAll('.bx-chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.id === id)));
    drawInfo();
    drawStage();
  }
  select('poac');
  return { select };
}

// The history figure's renders open their board in the explorer.
document.querySelectorAll('.bx-open').forEach((b) => b.addEventListener('click', () => {
  explorerReady.then((ex) => {
    ex.select(b.dataset.board);
    document.getElementById('explorer-fig').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  });
}));

// ---------------------------------------------------------------------------------------------- system diagram
sysData.then(buildSystem);

function buildSystem(sys) {
  const host = document.getElementById('sys-graph');
  const note = document.getElementById('sys-note');
  const seg = document.getElementById('sys-filter');
  const hint = 'Tap or hover a board or a device.';
  const B = sys.boards;
  const users = sys.users;

  const topicList = (id) => topicBlock(B[id]?.ros, users);
  const fwLink = (id) => B[id]?.firmware ? `<a href="${B[id].firmware.url}">${code(B[id].firmware.project)}</a>` : '';

  const N = (id, x, y, label, sub, html, extra = {}) => ({ id, x, y, label, sub, html, ...extra });
  const dev = { fill: 'var(--paper-2)' };
  const nodes = [
    N('led', 300, 62, 'LED board', 'CAN 6', () => `<b>LED board</b>: internal CAN client 6, firmware ${fwLink('led')}. Drives the RGBW light module. At the end of the internal bus.${topicList('led')}`),
    N('ivc', 300, 142, 'IVC board', 'CAN 8', () => `<b>IVC board</b>: internal CAN client 8, firmware ${fwLink('ivc')}. Acoustic modem to Triton, and Talos's ear for the competition pinger: drives the transducer, listens on the hydrophone. <a href="#led-ivc">More below</a>.${topicBlock(B.ivc?.ros, users, '', branchExtra(sys, 'ivc'))}`),
    N('esc1', 300, 222, 'ESC board 1', 'CAN 3', () => `<b>ESC board 1</b> (jumper SB1 bridged): internal CAN client 3, thrusters 4–7, firmware ${fwLink('esc')}. Takes raw RPM frames from <code>mpc_controller</code>.${topicList('esc')}`),
    N('esc0', 300, 302, 'ESC board 0', 'CAN 2', () => `<b>ESC board 0</b> (jumper SB1 open): internal CAN client 2, thrusters 0–3, firmware ${fwLink('esc')}. Takes raw RPM frames from <code>mpc_controller</code>.${topicList('esc')}`),
    N('poac', 300, 392, 'POAC', 'CAN 1 · power + kill', () => `<b>POAC</b>: internal CAN client 1, firmware ${fwLink('poac')}. Batteries in, 15 V / 5 V / 12 V out, kill switch, servo.${topicList('poac')}`, { bold: true }),
    N('ledmod', 92, 62, 'LED module', 'RGBW + NTC', () => '<b>LED module</b>: aluminium-core board with four RGBW LEDs and a 22 kΩ thermistor, on the LED board\'s J1. The TDR calls it the "LED Aluminum Board".', dev),
    N('acou', 92, 142, 'Transducer', '+ hydrophone', () => '<b>Transducer and hydrophone</b>: the transducer is the team\'s own design; the hydrophone is an Aquarian Audio H1C (TDR). Both on the IVC board\'s J1.', dev),
    N('thr58', 92, 222, 'Thrusters 4–7', 'T200', () => '<b>Thrusters 4–7</b>: Blue Robotics T200s on ESC board 1\'s 12-pin Thruster SubConn, three motor phases each. The silkscreen calls them ESC 5–8. <a href="thrusters-hw.html">Thrusters and ESCs</a>.', dev),
    N('thr14', 92, 302, 'Thrusters 0–3', 'T200', () => '<b>Thrusters 0–3</b>: on ESC board 0 (silkscreen ESC 1–4). The firmware, the MPC and <code>state/thrusters/*</code> count from 0.', dev),
    N('kill', 92, 372, 'Kill switch', '', () => '<b>Physical kill switch</b>: on the POAC\'s J1. While it is pulled the POAC\'s FETs cut thruster power, whatever the software does. See <a href="#kill">the kill circuit</a>.', dev),
    N('servo', 92, 440, 'Servo', 'torpedo / marker', () => '<b>Hiwonder bus servo</b> (HTD-45-H in the TDR): 12 V and a half-duplex serial line on the POAC\'s <code>LID_CONN</code>. <a href="actuators.html">Torpedoes, dropper and claw</a>.', dev),
    N('ccbb', 560, 392, 'Camera cage BB', 'CAN 4', () => `<b>Camera cage breakout</b>: internal CAN client 4, firmware ${fwLink('ccbb')}. Switches the Orin's 15 V, powers the DVL through its Ethernet cable, reads the depth sensor, passes both CAN buses to the Orin HAT.${topicList('ccbb')}`, { bold: true }),
    N('hat', 560, 262, 'Orin HAT', 'can0 + can1 · RS-232', () => '<b>Orin HAT</b> (Jetson AGX breakout): two CAN transceivers on the Orin\'s 40-pin header, <code>can0</code> (internal bus) and <code>can1</code> (external bus), each with a termination switch, plus RS-232 for the IMU. No microcontroller.'),
    N('imu', 560, 160, 'VN-100 IMU', 'RS-232', () => '<b>VectorNav VN-100</b>: on the Orin HAT\'s RS-232 port, opened as <code>/dev/ttyTHS1</code>. <a href="sensors.html">Navigation sensors</a>.', dev),
    N('orin', 790, 262, 'Jetson AGX Orin', 'copro_agent · mpc', () => `<b>Jetson AGX Orin</b>: the robot's computer. <code>copro_agent</code> (<code>micro_ros_agent can -D can0 -v4 -m rmw</code>) bridges every internal board into ROS; <code>mpc_controller</code> writes the raw thruster frames on <code>can0</code> itself. The agent for <code>can1</code> is commented out. <a href="computers.html">Computers and networks</a>.`, { bold: true }),
    N('fogb', 790, 160, 'FOG board', 'M.2 · RS-422', () => '<b>FOG board</b>: M.2 E-key card with an RS-422 transceiver and a 5 V supply for the gyro, opened as <code>/dev/ttyTHS2</code>. No microcontroller.'),
    N('fog', 790, 62, 'Fibre-optic gyro', 'Fizoptika VG103S', () => '<b>Fibre-optic gyro</b>: Fizoptika VG103S (TDR), on the FOG board. <a href="sensors.html">Navigation sensors</a>.', dev),
    N('dvl', 790, 392, 'DVL', 'Nortek DVL1000', () => '<b>Nortek DVL1000</b>: gets 15 V on spare pins of its Ethernet cable from the camera cage breakout (jack J14). Its data goes over Ethernet through the network switch to the Orin.', dev),
    N('depth', 680, 470, 'Depth sensor', 'Bar02, I²C', () => '<b>Depth sensor</b>: MS5837-02BA (Blue Robotics Bar02) on the CCBB\'s JST GH J15. The CCBB publishes <code>state/depth/raw</code>; <a href="https://github.com/osu-uwrt/riptide_core/blob/followpath-speed/riptide_hardware/riptide_hardware2/depth_converter.py"><code>depth_converter.py</code></a> turns it into <code>depth/pose</code> for the EKF.', dev),
    N('batt', 360, 528, 'Battery housings ×2', 'external CAN', () => `<b>Smart battery housings</b>, port and starboard: each a BMS board and an MCU board around a 5S LiPo pack, firmware ${fwLink('sbh_mcu')}. Power goes to the POAC's J3 and J4. Their CAN is the external bus (250 kbit/s); the camera cage breakout's <code>EXT. CAN</code> jacks carry it, but the harness from the housings isn't in the designs. The Orin's agent for this bus is switched off for now (riptide_core <a href="https://github.com/osu-uwrt/riptide_core/commit/720bdd9cadf0dd77ea728ffb7961af641935ee8c">720bdd9</a>), so these topics don't reach ROS at the moment.${topicList('sbh_mcu')}`),
  ];
  // kind: can (internal/external bus), data (other signals), power, drive (a load's one cable: shown in every view,
  // coloured as data or as power to match the view)
  const E = (from, to, kind, label, extra = {}) => ({ from, to, kind, label, ...extra });
  // Hand-routed power buses (Graph draws only straight or curved edges): a path from the two nodes' boxes.
  const busWide = (n, e) => { const a = n(e.from), b = n(e.to); return `M360,${a.y - a.h / 2 - 2} V${b.y} H${b.x + b.w / 2 + 2}`; };
  const bus = (n, e) => { const a = n(e.from), b = n(e.to); return `M${a.x + a.w / 2 + 2},${a.y} H378 V${b.y} H${b.x + b.w / 2 + 2}`; };
  const edges = [
    E('led', 'ivc', 'can'), E('ivc', 'esc1', 'can'), E('esc1', 'esc0', 'can'), E('esc0', 'poac', 'can'),
    E('poac', 'ccbb', 'can', 'internal CAN'), E('ccbb', 'hat', 'can', 'both buses'), E('hat', 'orin', 'can', 'can0 / can1'),
    E('batt', 'ccbb', 'can', 'external CAN', { dash: true }),
    E('led', 'ledmod', 'drive', 'LED drive'), E('acou', 'ivc', 'drive'), E('esc1', 'thr58', 'drive', 'phases'), E('esc0', 'thr14', 'drive', 'phases'),
    E('kill', 'poac', 'drive'), E('poac', 'servo', 'data', 'serial'), E('imu', 'hat', 'data'), E('fog', 'fogb', 'data'), E('fogb', 'orin', 'data', 'M.2'),
    E('depth', 'ccbb', 'data', 'I²C'), E('dvl', 'orin', 'data', 'Ethernet', { bend: -40 }),
    E('batt', 'poac', 'power', 'battery', { bend: 0 }),
    // POAC to the boards above it: one bus line up the right of the board column, a short tap into each board.
    E('poac', 'esc0', 'power', 'MOTOR_PWR', { route: busWide, lx: 352, ly: 352, anchor: 'end' }), E('poac', 'esc1', 'power', '', { route: busWide }),
    E('poac', 'ivc', 'power', 'V+, 5 V', { route: busWide, lx: 352, ly: 188, anchor: 'end' }), E('poac', 'led', 'power', '', { route: busWide }),
    E('ccbb', 'poac', 'power', '15 V, 5 V', { bend: 28 }), E('servo', 'poac', 'power', '12 V', { bend: 22 }),
    E('ccbb', 'orin', 'power', '15 V switched', { bend: 34 }), E('ccbb', 'dvl', 'power', '15 V'), E('ccbb', 'depth', 'power', '', { bend: 22 }),
    E('fogb', 'fog', 'power', '5 V', { bend: 26 }), E('hat', 'imu', 'power', '5 V', { bend: 26 }),
  ];
  const colour = { can: 'var(--state)', data: 'var(--ink-2)', power: 'var(--s8)', drive: 'var(--ink-2)' };
  const width = { can: 2.6, data: 1.4, power: 2, drive: 1.8 };
  for (const e of edges) { e.color = colour[e.kind]; e.width = width[e.kind]; e.arrow = false; }

  const bands = [
    { label: 'BOARD STACK · PORT HULL', points: [[20, 26], [372, 26], [372, 470], [20, 470]] },
    { label: 'CAMERA CAGE · STARBOARD HULL', points: [[470, 26], [890, 26], [890, 500], [470, 500]] },
    { label: 'BATTERY HOUSINGS', points: [[150, 504], [460, 504], [460, 552], [150, 552]], lx: 158, ly: 532 },
  ];
  // Phone layout: one column per hull, stacked.
  const narrow = {
    below: 620, width: 400, height: 1010,
    bands: [
      { label: 'BOARD STACK · PORT HULL', points: [[8, 22], [392, 22], [392, 480], [8, 480]] },
      { label: 'BATTERY HOUSINGS', points: [[8, 494], [212, 494], [212, 574], [8, 574]], lx: 14, ly: 508 },
      { label: 'CAMERA CAGE · STARBOARD HULL', points: [[8, 586], [392, 586], [392, 1002], [8, 1002]] },
    ],
    nodes: {
      led: { x: 290, y: 66 }, ivc: { x: 290, y: 146 }, esc1: { x: 290, y: 226 }, esc0: { x: 290, y: 306 }, poac: { x: 290, y: 400 },
      ledmod: { x: 88, y: 66 }, acou: { x: 88, y: 146 }, thr58: { x: 88, y: 226 }, thr14: { x: 88, y: 306 }, kill: { x: 88, y: 386 }, servo: { x: 88, y: 450 },
      batt: { x: 106, y: 548 },
      ccbb: { x: 290, y: 650 }, depth: { x: 88, y: 650 }, dvl: { x: 88, y: 740 }, hat: { x: 290, y: 760 }, imu: { x: 290, y: 860 },
      orin: { x: 88, y: 860 }, fogb: { x: 88, y: 950 }, fog: { x: 270, y: 955 },
    },
    edges: {
      'poac>ccbb': { bend: 0, lx: 300, ly: 600, anchor: 'start' }, 'batt>ccbb': { via: [262, 552], label: '' }, 'batt>poac': { bend: 0 },
      'hat>orin': { lx: 190, ly: 820 }, 'ccbb>hat': { lx: 300, ly: 710, anchor: 'start' },
      // Power from the POAC to the boards above it runs up one bus line right of the board column, with a short tap
      // into each board, so the feeds don't pile up behind the boxes.
      'poac>esc0': { route: bus, label: '' }, 'poac>esc1': { route: bus }, 'poac>ivc': { route: bus, label: '' }, 'poac>led': { route: bus },
      'ccbb>poac': { bend: 26, label: '' }, 'servo>poac': { bend: -18, label: '' }, 'ccbb>dvl': { label: '' },
      // The Orin's 15 V goes down the gap between the DVL and the Orin HAT, not across the DVL.
      'ccbb>orin': { route: (n, e) => { const a = n(e.from), b = n(e.to); return `M${a.x - a.w / 2 - 2},${a.y + 8} H200 V${b.y} H${b.x + b.w / 2 + 2}`; }, label: '15 V', lx: 195, ly: 716, anchor: 'end' },
      'dvl>orin': { bend: 30, label: '' }, 'depth>ccbb': { label: '' }, 'ccbb>depth': { bend: 18 },
      'fogb>orin': { label: '' }, 'fogb>fog': { bend: 18 }, 'hat>imu': { bend: 22 }, 'fog>fogb': {},
      'esc1>thr58': { label: '' }, 'esc0>thr14': { label: '' }, 'led>ledmod': { label: '' },
    },
  };

  let filter = 'data';
  const apply = (g) => {
    g.edges.forEach((e) => {
      if (e.route && !e.routed) { e.path.setAttribute('d', e.route((id) => g.nodes.get(id), e)); e.routed = true; }
      const show = filter === 'all' || e.kind === 'drive' || (filter === 'data' ? e.kind !== 'power' : e.kind === 'power');
      e.path.style.display = show ? '' : 'none';
      if (e.kind === 'drive') e.path.style.stroke = filter === 'power' ? colour.power : colour.data;
      if (e.label) e.label.style.display = show ? '' : 'none';
    });
  };
  let graph;
  graph = new Graph(host, {
    width: 900, height: 556, nodes, edges, bands, narrow, arrows: false,
    info: (n) => {
      note.innerHTML = n ? (typeof n.html === 'function' ? n.html() : n.html) : hint;
      if (graph) apply(graph);
    },
  });
  apply(graph);
  note.innerHTML = hint;
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    filter = b.dataset.k;
    seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    apply(graph);
  });
}

// ---------------------------------------------------------------------------------------------- status LED
{
  const dot = document.getElementById('led-dot');
  const out = document.getElementById('led-note');
  const box = document.getElementById('led-checks');
  const C = { blue: '#2f6fe0', green: '#1baf7a', yellow: '#f0b400', red: '#e34948', dark: '#9fb1b7' };
  let timer = 0;
  // Each box needs the one above it (no ROS without CAN, no enable without ROS): ticking one ticks those above,
  // unticking one unticks those below.
  const order = ['power', 'can', 'ros', 'enabled'];
  const inputs = Object.fromEntries([...box.querySelectorAll('input')].map((i) => [i.dataset.k, i]));
  box.addEventListener('change', (e) => {
    const k = e.target.dataset.k, i = order.indexOf(k);
    if (i < 0) return;
    order.forEach((o, j) => {
      if (e.target.checked && j < i) inputs[o].checked = true;
      if (!e.target.checked && j > i) inputs[o].checked = false;
    });
  });
  const update = () => {
    const v = Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.checked]));
    // lib/driver_led/led.c: kill switch (enabled) blue > ROS connected green > CAN online yellow > network enabled red > off.
    const [col, text] = !v.power ? ['dark', '<b>Dark: CAN never started.</b> No power, no firmware, or the CAN controller failed to start; the firmware leaves the LED off.']
      : v.enabled ? ['blue', '<b>Blue: enabled.</b> The board has its kill state from the POAC and the robot is enabled; on an ESC board, thrusters may spin.']
        : v.ros ? ['green', '<b>Green: connected.</b> The micro-ROS agent on the Orin sees the board; its topics are live. The robot is killed.']
          : v.can ? ['yellow', '<b>Yellow: CAN up, no ROS.</b> The board hears the bus but the agent hasn\'t connected. Check that <code>copro_agent</code> is running on the Orin.']
            : ['red', '<b>Red: no CAN.</b> The board started its CAN controller but can\'t reach the bus. Check its cable and the termination at the two ends of the chain.'];
    clearInterval(timer);
    dot.style.setProperty('--c', C[col]);
    dot.classList.remove('flash');
    dot.classList.toggle('dark', col === 'dark');
    if (v.fault && col !== 'dark') {
      let red = false;
      const tick = () => { red = !red; dot.style.setProperty('--c', red ? C.red : C[col]); };
      if (!reduced) timer = setInterval(tick, 500); else dot.classList.add('flash');
      tick();
    }
    out.innerHTML = text + (v.fault && col !== 'dark' ? ' <b>Alternating with red: a fault.</b> Its name is in the board\'s <code>state/firmware</code> fault bits.' : '');
  };
  box.addEventListener('change', update);
  update();
}

// ---------------------------------------------------------------------------------------------- kill circuit
{
  const host = document.getElementById('kill-svg');
  const out = document.getElementById('kill-note');
  const ctl = document.getElementById('kill-controls');
  const st = { sw: 'in', soft: 'none', mcu: 'run' };
  const NS = 'http://www.w3.org/2000/svg';

  // Block positions per layout: [x, y, w, h].
  const L = {
    wide: {
      W: 900, H: 282,
      ks: [8, 46, 104, 72], dg: [202, 46, 104, 72], gd: [396, 46, 104, 72], fet: [590, 46, 104, 72], esc: [784, 46, 104, 72], rp: [190, 192, 128, 64],
    },
    narrow: {
      W: 360, H: 676,
      ks: [20, 20, 170, 64], dg: [20, 158, 170, 64], gd: [20, 296, 170, 64], fet: [20, 434, 170, 64], esc: [20, 572, 170, 64], rp: [214, 158, 136, 64],
    },
  };
  const ok = 'var(--prediction)', bad = 'var(--s8)', mute = 'var(--muted)';

  const compute = () => {
    const inserted = st.sw === 'in';
    const alive = st.mcu === 'run';
    const run = alive && inserted && st.soft === 'none'; // SOFTWARE_KILL = RUN only if every kill slot is happy, the switch slot included
    const dgClosed = run;
    const enLow = dgClosed && inserted; // MOTOR_EN is the switch line through the DG448, or pulled up to V+ when it's open
    return { inserted, alive, run, dgClosed, enLow, fetOn: enLow };
  };

  function draw() {
    const narrow = host.clientWidth < 560;
    const g = narrow ? L.narrow : L.wide;
    const s = compute();
    const c = (b) => [b[0] + b[2] / 2, b[1] + b[3] / 2];
    const parts = [];
    const block = (b, title, sub, good, tag) => {
      const [x, y, w, h] = b;
      const col = good === null ? mute : good ? ok : bad;
      parts.push(`<g class="kb"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" style="stroke:${col}"/>` +
        `<text x="${x + w / 2}" y="${y + h / 2 - 9}" class="kt">${title}</text>` +
        `<text x="${x + w / 2}" y="${y + h / 2 + 13}" class="ks" style="fill:${col}">${sub}</text>` +
        (tag ? `<text x="${narrow ? x + 4 : x + w / 2}" y="${y + h + 15}" class="kx"${narrow ? ' style="text-anchor:start"' : ''}>${tag}</text>` : '') + '</g>');
    };
    // A wire with an optional two-line label [name, level] at lp.
    const wire = (pts, col, wd, label, lp, anchor = 'middle') => {
      parts.push(`<polyline points="${pts.map((p) => p.join(',')).join(' ')}" class="kw" style="stroke:${col};stroke-width:${wd}"/>`);
      if (!label) return;
      const [l1, l2] = label;
      parts.push(`<text x="${lp[0]}" y="${lp[1]}" class="kl" style="text-anchor:${anchor}">${l1}</text>`);
      if (l2) parts.push(`<text x="${lp[0]}" y="${lp[1] + 14}" class="kl kv" style="text-anchor:${anchor}">${l2}</text>`);
    };
    const [ks, dg, gd, fet, escB, rp] = [g.ks, g.dg, g.gd, g.fet, g.esc, g.rp];
    const swLevel = s.inserted ? '0 V' : 'high (V+)';
    const enLevel = s.enLow ? '0 V' : 'high (V+)';
    const powerCol = s.fetOn ? 'var(--accent)' : mute;
    const kill = `state/kill: ${s.alive ? (s.run ? 'false' : 'true') : 'silent'}`;
    if (!narrow) {
      const y = c(dg)[1];
      const mid = (a, b2) => (a[0] + a[2] + b2[0]) / 2;
      wire([[ks[0] + ks[2], y], [dg[0], y]], s.inserted ? ok : bad, 2, ['KILL_SWITCH', swLevel], [mid(ks, dg), y - 22]);
      wire([[dg[0] + dg[2], y], [gd[0], y]], s.enLow ? ok : bad, 2, ['MOTOR_EN', enLevel], [mid(dg, gd), y - 22]);
      wire([[gd[0] + gd[2], y], [fet[0], y]], s.enLow ? ok : bad, 2, ['gates', s.enLow ? '0 V' : 'at V+'], [mid(gd, fet), y - 22]);
      wire([[fet[0] + fet[2], y], [escB[0], y]], powerCol, s.fetOn ? 6 : 2, ['MOTOR_PWR', s.fetOn ? '= V+' : '0 V'], [mid(fet, escB), y - 22]);
      parts.push(`<polyline points="${c(fet)[0]},12 ${c(fet)[0]},${fet[1]}" class="kw" style="stroke:var(--accent);stroke-width:3"/><text x="${c(fet)[0] + 8}" y="22" class="kl" style="text-anchor:start">V+ (battery bus)</text>`);
      const tapX = ks[0] + ks[2] + 30;
      wire([[tapX, y], [tapX, rp[1] + 22], [rp[0], rp[1] + 22]], s.alive ? 'var(--ink-2)' : mute, 1.3, ['reads it', '(GPIO1)'], [tapX - 8, rp[1] + 4], 'end');
      wire([[c(dg)[0] + 30, rp[1]], [c(dg)[0] + 30, dg[1] + dg[3]]], s.run ? ok : bad, 2, ['SOFTWARE_KILL', s.run ? 'run' : 'kill'], [c(dg)[0] + 39, dg[1] + dg[3] + 34], 'start');
      parts.push(`<text x="${rp[0] + rp[2] + 14}" y="${rp[1] + 26}" class="kl" style="text-anchor:start">← command/software_kill (over CAN)</text>`);
      parts.push(`<text x="${rp[0] + rp[2] + 14}" y="${rp[1] + 46}" class="kl" style="text-anchor:start">→ ${kill}</text>`);
    } else {
      const x = c(ks)[0];
      wire([[x, ks[1] + ks[3]], [x, dg[1]]], s.inserted ? ok : bad, 2, ['KILL_SWITCH', swLevel], [x + 9, ks[1] + ks[3] + 38], 'start');
      wire([[x, dg[1] + dg[3]], [x, gd[1]]], s.enLow ? ok : bad, 2, ['MOTOR_EN', enLevel], [x + 9, dg[1] + dg[3] + 38], 'start');
      wire([[x, gd[1] + gd[3]], [x, fet[1]]], s.enLow ? ok : bad, 2, ['gates', s.enLow ? '0 V' : 'at V+'], [x + 9, gd[1] + gd[3] + 38], 'start');
      wire([[x, fet[1] + fet[3]], [x, escB[1]]], powerCol, s.fetOn ? 6 : 2, ['MOTOR_PWR', s.fetOn ? '= V+' : '0 V'], [x + 11, fet[1] + fet[3] + 38], 'start');
      parts.push(`<polyline points="${fet[0] + fet[2] + 56},${c(fet)[1]} ${fet[0] + fet[2]},${c(fet)[1]}" class="kw" style="stroke:var(--accent);stroke-width:3"/><text x="${fet[0] + fet[2] + 62}" y="${c(fet)[1] + 4}" class="kl" style="text-anchor:start">V+</text>`);
      const tapY = ks[1] + ks[3] + 12;
      wire([[x, tapY], [c(rp)[0], tapY], [c(rp)[0], rp[1]]], s.alive ? 'var(--ink-2)' : mute, 1.3, ['reads it (GPIO1)'], [c(rp)[0] + 6, tapY - 6], 'middle');
      wire([[rp[0], c(rp)[1]], [dg[0] + dg[2], c(dg)[1]]], s.run ? ok : bad, 2, null, null);
      parts.push(`<text x="${c(rp)[0]}" y="${rp[1] + rp[3] + 18}" class="kl">SOFTWARE_KILL: ${s.run ? 'run' : 'kill'}</text>`);
      parts.push(`<text x="${c(rp)[0]}" y="${rp[1] + rp[3] + 40}" class="kl kv">← command/software_kill</text>`);
      parts.push(`<text x="${c(rp)[0]}" y="${rp[1] + rp[3] + 58}" class="kl kv">→ ${kill}</text>`);
    }
    block(ks, 'Kill switch', s.inserted ? 'inserted' : 'pulled', s.inserted, 'POAC J1');
    block(dg, 'DG448', s.dgClosed ? 'closed' : 'open', s.dgClosed, 'U13');
    block(gd, 'Gate drivers', s.enLow ? 'output low' : 'output high', s.enLow, 'TC4432 ×3');
    block(fet, 'P-FETs', s.fetOn ? 'on' : 'off', s.fetOn, 'SiR167DP ×3');
    block(escB, 'ESC boards', s.fetOn ? 'powered' : 'no power', s.fetOn, 'via J7/J8');
    block(rp, 'RP2040', s.alive ? 'running' : 'in reset', s.alive ? s.run : false, null);
    host.innerHTML = `<svg class="kill-svg${narrow ? ' narrow' : ''}" viewBox="0 0 ${g.W} ${g.H}" role="img" aria-label="Kill switch circuit state">${parts.join('')}</svg>`;

    // What it means.
    let why;
    if (s.fetOn) why = '<b>Thrusters have power.</b> The ESC boards see <code>MOTOR_PWR</code> rise, hold their motors off for 5 s (<a href="https://github.com/osu-uwrt/titan_firmware/blob/master/talos/ESCBoard/include/dshot.h#L29"><code>ESC_POWERUP_DELAY_MS</code></a>), then follow the RPM commands.';
    else if (!s.alive) why = `<b>No thruster power.</b> With the RP2040 not running, a 10 kΩ resistor pulls <code>SOFTWARE_KILL</code> low, so the normally-open DG448 stays open and a 47 kΩ pull-up holds <code>MOTOR_EN</code> at V+. The FETs stay off even ${s.inserted ? 'with the kill switch inserted' : 'before you look at the switch'}.`;
    else if (!s.inserted) why = '<b>No thruster power, twice over.</b> With the switch out, a 100 kΩ pull-up takes its line to V+. That turns the gate drivers\' output high and the P-FETs off. The RP2040 also reads the switch and opens the DG448.';
    else why = '<b>No thruster power.</b> The kill switch is in, but the RP2040 holds <code>SOFTWARE_KILL</code> in the kill state, the DG448 opens, and the 47 kΩ pull-up turns the FETs off.';
    out.innerHTML = why;
    ctl.querySelector('[data-k="soft"]').classList.toggle('off', !s.alive);
  }
  ctl.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const grp = b.closest('[data-k]');
    st[grp.dataset.k] = b.dataset.v;
    grp.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    draw();
  });
  let lastW = 0;
  new ResizeObserver(() => { const w = host.clientWidth; if ((w < 560) !== (lastW < 560) || !lastW) draw(); lastW = w; }).observe(host);
  draw();
}
