// 无文字新手引导：三步手势演示（造山 → 种树 → 放恐龙），纯 Bus 订阅，
// pointer-events:none 不挡任何操作；只在 profile.tutorial.done !== true 时运行。
import { profile } from '../systems/Profile.js';

const STEP_SKIP_MS = 60000; // 逃生舱：孩子在开心玩别的就别打扰，60s 自动进下一步

// 自制小手 SVG（内联，~0.5KB）；创建失败时退回 emoji 👆
const HAND_SVG = `<svg viewBox="0 0 64 64" width="64" height="64" xmlns="http://www.w3.org/2000/svg">
  <g stroke="#5a4a6a" stroke-width="2.5" stroke-linejoin="round">
    <path d="M27 10c0-3 5-3 5 0v17l3-7c1.4-2.8 5.6-1.4 5 2l-1 5 4-4c2.2-2.2 5.4.6 4 3l-3 6 4-2c2.8-1.2 4.8 2.4 2 4.6L38 44H27L17 32c-2.4-2.6 1-6 3.6-4L25 31z" fill="#ffe3c8"/>
    <path d="M26 44h13l1 9H25z" fill="#ffd1a6"/>
  </g>
</svg>`;

export class Tutorial {
  constructor({ bus, audio, particles, toolbar }) {
    this.bus = bus;
    this.audio = audio;
    this.particles = particles;
    this.toolbar = toolbar;
    this.stepIdx = -1;
    this.el = null;
    this._offs = [];
    this._skipTimer = 0;

    const dino = (kind) => kind && kind !== 'tree' && kind !== 'flower';
    this.steps = [
      { btn: 'mountain', gesture: 'drag', event: 'sculpt', match: () => true },
      { btn: 'tree', gesture: 'tap', event: 'place', match: (p) => p?.kind === 'tree' || p?.kind === 'flower' },
      { btn: 'triceratops', gesture: 'tap', event: 'place', match: (p) => dino(p?.kind) },
    ];
  }

  // 开始页消失后调用；未完成过才会在 1s 后启动
  maybeStart() {
    if (this.el || profile.get('tutorial', { done: false }).done === true) return;
    setTimeout(() => {
      if (!this.el && !profile.get('tutorial', { done: false }).done) this._begin();
    }, 1000);
  }

  _begin() {
    const el = document.createElement('div');
    el.id = 'tutorial';
    const hand = document.createElement('div');
    hand.className = 'tut-hand';
    hand.innerHTML = HAND_SVG;
    if (!hand.querySelector('svg')) hand.textContent = '👆'; // emoji fallback
    el.appendChild(hand);
    const close = document.createElement('button');
    close.className = 'tut-close';
    close.textContent = '✕';
    close.addEventListener('click', () => this._finish(false)); // 家长直接关闭
    el.appendChild(close);
    document.body.appendChild(el);
    this.el = el;
    this.hand = hand;

    this._offs.push(
      this.bus.on('sculpt', (p) => this._onEvent('sculpt', p)),
      this.bus.on('place', (p) => this._onEvent('place', p)),
    );
    this._show(0);
  }

  _btn(idx) {
    return this.toolbar.buttons[this.steps[idx].btn];
  }

  _show(idx) {
    this.stepIdx = idx;
    const step = this.steps[idx];
    this._btn(idx)?.classList.add('tut-glow');
    this.hand.className = 'tut-hand ' + (step.gesture === 'drag' ? 'tut-drag' : 'tut-tap');
    clearTimeout(this._skipTimer);
    this._skipTimer = setTimeout(() => this._advance(false), STEP_SKIP_MS);
  }

  _onEvent(type, payload) {
    const step = this.steps[this.stepIdx];
    if (!step || step.event !== type || !step.match(payload)) return;
    this._advance(true);
  }

  // celebrate=false 是 60s 自动跳过：安静换步，不打扰
  _advance(celebrate) {
    const btn = this._btn(this.stepIdx);
    btn?.classList.remove('tut-glow');
    if (celebrate && btn) {
      btn.classList.add('tut-burst'); // 光环爆裂
      setTimeout(() => btn.classList.remove('tut-burst'), 700);
      this.audio.playSparkle();
    }
    if (this.stepIdx + 1 < this.steps.length) this._show(this.stepIdx + 1);
    else this._finish(celebrate);
  }

  _finish(celebrate) {
    clearTimeout(this._skipTimer);
    for (const off of this._offs) off();
    this._offs = [];
    // 只摘光环；tut-burst 留给 _advance 的定时器收尾，最后一步的爆裂才放得完
    for (let i = 0; i < this.steps.length; i++) {
      this._btn(i)?.classList.remove('tut-glow');
    }
    if (celebrate) {
      // 屏幕中央（约世界原点上空）彩纸庆祝
      this.particles.burst({ x: 0, y: 5, z: 0 }, {
        count: 36, colors: ['#ff7d7d', '#ffd166', '#6ec6ff', '#9ef0a0', '#f7a8ff'],
        speed: 3, gravity: 4.5, life: 1.2, size: 0.2,
      });
      this.audio.playSparkle();
    }
    profile.set('tutorial', { done: true });
    this.stepIdx = -1;
    if (this.el) {
      const el = this.el;
      this.el = null;
      el.classList.add('out');
      setTimeout(() => el.remove(), 500);
    }
  }
}
