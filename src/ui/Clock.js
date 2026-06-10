import { t, onLangChange } from '../i18n.js';

// 左下角的卡通时钟：圆表盘 + 12 个数字 + 时针/分针 + 大大的数字时间 + 太阳/月亮指示。
// 每帧从 TimeOfDay 读取当前小时，廉价地更新指针角度与数字，帮 5 岁孩子认识时间。
const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

export class Clock {
  constructor(timeOfDay) {
    this.tod = timeOfDay;
    this.root = document.getElementById('clock');
    this._lastText = '';
    if (!this.root) return;
    this._build();
    this.refreshLabel();
    onLangChange(() => this.refreshLabel());
    this.update();
  }

  _build() {
    const face = svg('svg', { class: 'clock-face', viewBox: '0 0 100 100' });
    face.appendChild(svg('circle', { class: 'clock-dial', cx: 50, cy: 50, r: 47 }));
    // 12 个钟点数字
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      const tx = svg('text', {
        class: 'clock-num',
        x: 50 + Math.sin(a) * 37,
        y: 50 - Math.cos(a) * 37,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
      });
      tx.textContent = String(n);
      face.appendChild(tx);
    }
    // 指针（时针短粗、分针细长）
    this.hourHand = svg('line', { class: 'clock-hour', x1: 50, y1: 50, x2: 50, y2: 28 });
    this.minHand = svg('line', { class: 'clock-min', x1: 50, y1: 50, x2: 50, y2: 16 });
    face.appendChild(this.hourHand);
    face.appendChild(this.minHand);
    face.appendChild(svg('circle', { class: 'clock-pin', cx: 50, cy: 50, r: 3 }));
    this.root.appendChild(face);

    // 数字时间 + 太阳/月亮
    const readout = document.createElement('div');
    readout.className = 'clock-readout';
    this.iconEl = document.createElement('span');
    this.iconEl.className = 'clock-icon';
    this.iconEl.textContent = '☀️';
    this.digitalEl = document.createElement('span');
    this.digitalEl.className = 'clock-digital';
    this.digitalEl.textContent = '08:00';
    readout.appendChild(this.iconEl);
    readout.appendChild(this.digitalEl);
    this.root.appendChild(readout);
  }

  refreshLabel() {
    this.root?.setAttribute('aria-label', t('clock.title'));
  }

  update() {
    if (!this.root) return;
    const h = this.tod.hour;
    // 时针：30°/小时（h 连续，已含分钟分量）；分针：360°/小时
    this.hourHand.setAttribute('transform', `rotate(${(h % 12) * 30} 50 50)`);
    this.minHand.setAttribute('transform', `rotate(${(h % 1) * 360} 50 50)`);
    const hh = Math.floor(h) % 24;
    const mm = Math.floor((h % 1) * 60);
    const text = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (text !== this._lastText) {
      this._lastText = text;
      this.digitalEl.textContent = text;
      const phase = this.tod.getPhase();
      this.iconEl.textContent = phase === 'night' ? '🌙' : phase === 'sunset' ? '🌇' : '☀️';
    }
  }
}
