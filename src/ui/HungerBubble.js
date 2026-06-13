// 头顶小泡泡：点一下恐龙 → 头顶冒出表情 + 饥饿度，饿了还显示喂食按钮。
// 纯图标无文字（契合 5 岁/无字约束）：🍖 = 一格饱，○ = 空格；吃鱼的（翼龙/沧龙）显示一排 🐟。
// 走世界坐标→屏幕投影，每帧贴在被点恐龙的头顶，随相机移动。
import * as THREE from 'three';

const PIPS = 5;      // 肚子条格数
const HOLD_MS = 3000; // 显示时长

// 根据饱食度 + 状态选 emoji
function moodEmoji(entity, fullness, dietNone) {
  if (dietNone) return '🦕';
  if (entity.lifeState === 'sleeping') return '😴';
  if (fullness < 0.25) return '😢';
  if (fullness > 0.75) return '😊';
  return '🦕';
}

export class HungerBubble {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'hunger-bubble';
    document.body.appendChild(this.el);
    this.entity = null;
    this.hideAt = 0;
    this._onFeed = null;
    this._tmp = new THREE.Vector3();
  }

  // 点击某恐龙时调用：渲染当前状态并开始计时显示
  show(entity, onFeed) {
    if (!entity?.getHunger) return;
    this.entity = entity;
    this.hideAt = performance.now() + HOLD_MS;
    this._onFeed = onFeed || null;
    this._render(entity.getHunger());
    this.el.classList.add('show');
  }

  _render({ dietNone, fullness }) {
    const filled = Math.round(fullness * PIPS);
    const canFeed = !dietNone && fullness < 0.6 && this._onFeed;
    const mood = moodEmoji(this.entity, fullness, dietNone);

    // 表情行
    let html = `<span class="mood-emoji">${mood}</span>`;

    // 饥饿 pip 行
    html += '<span class="pips">';
    for (let i = 0; i < PIPS; i++) {
      if (dietNone) html += '<span class="pip fish">🐟</span>';
      else html += `<span class="pip">${i < filled ? '🍖' : '○'}</span>`;
    }
    html += '</span>';

    // 喂食按钮（饿了才显示）
    if (canFeed) {
      html += '<button class="feed-btn" aria-label="喂食">🍖</button>';
    }

    this.el.innerHTML = html;
    this.el.classList.toggle('hungry', !dietNone && fullness < 0.25);
    this.el.classList.toggle('sleepy', this.entity?.lifeState === 'sleeping');
    this.el.classList.toggle('happy', !dietNone && fullness > 0.75);

    // 喂食按钮绑定（每次重建 DOM 都要重绑）
    if (canFeed) {
      this.el.style.pointerEvents = 'auto';
      const btn = this.el.querySelector('.feed-btn');
      btn?.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (this._onFeed && this.entity) {
          this._onFeed(this.entity);
          // 立刻更新泡泡显示喂完状态
          this.hideAt = performance.now() + HOLD_MS;
          const hunger = this.entity.getHunger?.();
          if (hunger) this._render(hunger);
        }
      });
    } else {
      this.el.style.pointerEvents = 'none';
    }
  }

  hide() {
    this.entity = null;
    this._onFeed = null;
    this.el.classList.remove('show');
  }

  // 每帧调用：把头顶点投影到屏幕，贴住被点恐龙；恐龙消失或超时则隐藏
  update(camera, dom) {
    if (!this.entity) return;
    const e = this.entity;
    if (!e.alive || e.consumed || performance.now() > this.hideAt) {
      this.hide();
      return;
    }
    const size = e.size || 1;
    this._tmp.copy(e.object3d.position);
    this._tmp.y += size * 2 + 0.6;
    this._tmp.project(camera);
    if (this._tmp.z > 1) { // 在相机背后：隐藏
      this.el.classList.remove('show');
      return;
    }
    this.el.classList.add('show');
    const rect = dom.getBoundingClientRect();
    const x = rect.left + (this._tmp.x * 0.5 + 0.5) * rect.width;
    const y = rect.top + (-this._tmp.y * 0.5 + 0.5) * rect.height;
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }
}
