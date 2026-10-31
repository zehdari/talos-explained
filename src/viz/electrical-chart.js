// The shared LineChart with its tooltip kept inside the chart: on a phone the shared one can run off either edge.
import { LineChart } from './chart.js';

export class ClampedChart extends LineChart {
  hover(e) {
    super.hover(e);
    if (this.tip.hidden) return;
    const wr = this.wrap.getBoundingClientRect();
    const W = wr.width;
    this.tip.style.whiteSpace = 'normal';
    this.tip.style.maxWidth = `${Math.max(140, W - 8)}px`;
    this.tip.style.transform = 'translateY(-50%)';
    const tw = this.tip.offsetWidth;
    const px = e.clientX - wr.left;
    let left = px + 12;
    if (left + tw > W) left = px - 12 - tw; // flip to the left of the finger
    left = Math.max(0, Math.min(left, W - tw));
    this.tip.style.left = `${left}px`;
    // and vertically inside the chart
    const th = this.tip.offsetHeight, H = wr.height;
    const top = Math.max(th / 2, Math.min(e.clientY - wr.top, H - th / 2));
    this.tip.style.top = `${top}px`;
  }
}
