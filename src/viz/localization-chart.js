// The shared line chart (src/viz/chart.js) with two changes for the localization chapter, kept here so the shared
// file stays as it is:
//   - `readout(html | null)`: on a narrow chart (under 560 px) a tap writes the values into a line under the chart
//     instead of a floating box, which would cover the axis or run off the panel; on a wide chart the box is kept
//     inside the plot;
//   - `overlay(svg, map)`: draws extra marks (a lag bracket) after each redraw. Series may carry `short` names;
//   - `xStep`: x tick labels every xStep (the shared ticks give a narrow 32 s chart a single label).
import { LineChart, el } from './chart.js';

export class LocChart extends LineChart {
  draw() {
    super.draw();
    if (this.o.xStep && this.map && this.series.length) {
      const { sx, m, H, x0, x1 } = this.map, yT = H - m.b + 15, axis = this.svg.querySelector('g.axis');
      for (const t of [...axis.querySelectorAll('text')]) if (+t.getAttribute('y') === yT && t.getAttribute('text-anchor') === 'middle') t.remove();
      for (let v = Math.ceil(x0 / this.o.xStep - 1e-9) * this.o.xStep; v <= x1 + 1e-9; v += this.o.xStep) {
        el('text', { x: sx(v), y: yT, 'text-anchor': 'middle' }, axis).textContent = +v.toFixed(3);
      }
    }
    if (this.o.overlay && this.map && this.series.length) {
      const g = el('g', { 'pointer-events': 'none' });
      this.svg.insertBefore(g, this.cross); // under the crosshair and the tap target
      this.o.overlay(g, this.map);
    }
  }
  hover(e) {
    if (!this.map || !this.series.length) return;
    const r = this.svg.getBoundingClientRect();
    const scaleX = this.map.W / r.width;
    const px = (e.clientX - r.left) * scaleX;
    const { sx, sy, m, W, x0, x1 } = this.map;
    if (px < m.l || px > W - m.r) return this.unhover();
    const x = x0 + ((px - m.l) / (W - m.l - m.r)) * (x1 - x0);
    const rows = [], short = [];
    this.series.forEach((s, i) => {
      if (!s.values.length || s.noTip) { this.dots[i].setAttribute('visibility', 'hidden'); return; }
      let lo = 0, hi = s.values.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s.values[mid].x <= x) lo = mid; else hi = mid; }
      const p = Math.abs(s.values[hi].x - x) < Math.abs(s.values[lo].x - x) ? s.values[hi] : s.values[lo];
      this.dots[i].setAttribute('cx', sx(p.x));
      this.dots[i].setAttribute('cy', sy(p.y));
      this.dots[i].setAttribute('visibility', 'visible');
      const v = `<b>${p.y.toFixed(this.o.digits)}</b>`;
      rows.push(`<div><i style="background:${s.color}"></i>${s.name}: ${v}${this.o.unit ? ' ' + this.o.unit : ''}</div>`);
      short.push(`<span><i style="background:${s.color}"></i>${s.short || s.name} ${v}</span>`);
    });
    this.cross.setAttribute('x1', px);
    this.cross.setAttribute('x2', px);
    this.cross.setAttribute('visibility', 'visible');
    const t = `${this.o.xLabel ? this.o.xLabel.split(' ')[0] + ' ' : ''}${x.toFixed(this.o.xDigits)} s`;
    if (this.o.readout && r.width < 560) {
      this.tip.hidden = true;
      this.o.readout(`<span class="t">${t}</span>${short.join('')}${this.o.unit ? `<span class="u">${this.o.unit}</span>` : ''}`);
      return;
    }
    this.tip.innerHTML = `<div style="opacity:.75">${t}</div>${rows.join('')}`;
    this.tip.hidden = false;
    // Beside the finger, on whichever side has room, and never over the y axis.
    const at = px / scaleX, w = this.tip.offsetWidth, left0 = m.l / scaleX;
    let left = at + 12;
    if (left + w > r.width - 2) left = Math.max(left0 + 2, at - 12 - w);
    this.tip.style.left = `${left}px`;
    this.tip.style.transform = 'translate(0, -50%)';
    this.tip.style.top = `${(e.clientY - this.wrap.getBoundingClientRect().top)}px`;
  }
  unhover() {
    super.unhover();
    this.o.readout?.(null);
  }
}
