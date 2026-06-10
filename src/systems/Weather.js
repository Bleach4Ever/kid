import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';

const RAIN_COLORS = ['#ff8f8f', '#ffc36b', '#ffe87a', '#9be3a4', '#86ccf5', '#9aa6f7', '#c4a9f7'];

// 全自动天气状态机：晴/多云/清晨薄雾/小雨/雷暴/雨后彩虹，丰富多变。
// 5 岁友好：雷暴短促（8-13s）、夜里不打雷、天空不全黑、之后偏向接彩虹/晴天。
// rainOp = 可见雨幕不透明度（0=不下雨）。雨粒子数量恒为画质档位上限（drawRange 由 setRainCount 决定），
// 强弱只用不透明度/可见性表现，从而不破坏 Quality 的 setRainCount 契约。
const STATES = {
  clear: { rainOp: 0, minDur: 26, maxDur: 60 },
  cloudy: { rainOp: 0, minDur: 18, maxDur: 40 },
  mist: { rainOp: 0, minDur: 16, maxDur: 28 },
  lightRain: { rainOp: 0.5, minDur: 16, maxDur: 32 },
  storm: { rainOp: 0.82, minDur: 8, maxDur: 13, darken: 0.45, lightning: true },
  rainbow: { rainOp: 0, minDur: 9, maxDur: 9, showbow: true },
};

// 加权转移：晴/多云为主，雷暴稀少且只从 cloudy/lightRain 进入；雷暴/小雨后强烈偏向彩虹。
const NEXT = {
  clear: [['clear', 2], ['cloudy', 3], ['mist', 1]],
  cloudy: [['clear', 3], ['lightRain', 2], ['storm', 1]],
  mist: [['clear', 2], ['cloudy', 1]],
  lightRain: [['rainbow', 3], ['cloudy', 2], ['storm', 1]],
  storm: [['rainbow', 3], ['lightRain', 1]],
  rainbow: [['clear', 1]],
};

export class Weather {
  constructor(scene, terrain, { sky = null, audio = null, bus = null } = {}) {
    this.scene = scene;
    this.terrain = terrain;
    this.sky = sky;
    this.audio = audio;
    this.bus = bus;

    // ---- 雨滴（粒子） ----
    this.maxCount = 700;
    this.count = this.maxCount;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(this.maxCount * 3);
    this.vel = new Float32Array(this.maxCount);
    const span = WORLD_SIZE * 0.7;
    for (let i = 0; i < this.maxCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * span;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * span;
      this.vel[i] = 14 + Math.random() * 10;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setDrawRange(0, this.count);
    this.rainGeo = g;
    this.rainMat = new THREE.PointsMaterial({
      color: '#cdeeff', size: 0.22, transparent: true, opacity: 0,
      depthWrite: false, fog: true,
    });
    this.rain = new THREE.Points(g, this.rainMat);
    this.rain.visible = false;
    scene.add(this.rain);

    // ---- 彩虹（7 条同心半环） ----
    this.rainbow = new THREE.Group();
    RAIN_COLORS.forEach((c, i) => {
      const r = 19 - i * 0.55;
      const geo = new THREE.TorusGeometry(r, 0.32, 8, 90, Math.PI);
      const m = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0, fog: false, side: THREE.DoubleSide,
      });
      this.rainbow.add(new THREE.Mesh(geo, m));
    });
    this.rainbow.position.set(0, 0.2, -8);
    this.rainbow.rotation.y = 0.15;
    scene.add(this.rainbow);
    this.rainbowT = 0; // >0 表示正在显示

    // ---- 状态机 ----
    this.state = 'clear';
    this.t = 0;
    this.dur = STATES.clear.minDur;
    this.rainOpacity = 0;
    this.rainOpacityTarget = 0;
    this.darken = 0;
    this.darkenTarget = 0;
    this._lightningT = 0; // 距下次闪电的倒计时
    this._thunderT = -1; // 闪电后延迟打雷的倒计时（-1 = 无）
  }

  // 性能分级：不重建几何，只缩小绘制范围 + 更新循环上界
  setRainCount(n) {
    this.count = Math.max(0, Math.min(this.maxCount, n | 0));
    this.rainGeo.setDrawRange(0, this.count);
  }

  // 手动彩虹（✨魔法面板的 🌈 惊喜，保留）
  showRainbow(audio) {
    this.rainbowT = 9;
    (audio || this.audio)?.playMagic();
  }

  reset(audio) {
    this._enter('clear');
    this.rainbowT = 0;
    this.rainOpacity = 0;
    this.rainOpacityTarget = 0;
    this.rain.visible = false;
    this.rainMat.opacity = 0;
    this.darken = 0;
    this.darkenTarget = 0;
    this.sky?.setWeatherDarken(0);
    (audio || this.audio)?.stopRain();
  }

  _enter(state) {
    const cfg = STATES[state] || STATES.clear;
    this.state = state;
    this.t = 0;
    this.dur = cfg.minDur + Math.random() * (cfg.maxDur - cfg.minDur);
    this.rainOpacityTarget = cfg.rainOp || 0;
    this.darkenTarget = cfg.darken || 0;
    if (cfg.rainOp > 0) this.audio?.startRain();
    else this.audio?.stopRain();
    if (cfg.showbow) this.rainbowT = Math.max(this.rainbowT, this.dur);
    if (cfg.lightning) this._lightningT = 0.8 + Math.random() * 1.4;
  }

  // 选下一个状态，套用守卫：雾只在清晨 5-8 点；夜里把雷暴降级成小雨
  _pickNext(ctx) {
    const phase = ctx?.skyPhase || 'day';
    const hour = ctx?.hour ?? 12;
    const opts = NEXT[this.state] || NEXT.clear;
    const pool = [];
    for (const [name, w] of opts) {
      let n = name;
      if (n === 'mist' && !(hour >= 5 && hour < 8)) continue;
      if (n === 'storm' && phase === 'night') n = 'lightRain';
      for (let i = 0; i < w; i++) pool.push(n);
    }
    if (!pool.length) return 'clear';
    return pool[(Math.random() * pool.length) | 0];
  }

  update(dt, ctx) {
    // 推进状态计时器
    this.t += dt;
    if (this.t >= this.dur) this._enter(this._pickNext(ctx));

    // 雨幕不透明度渐变（~1.6s），强弱用透明度表现而非改 drawRange
    this.rainOpacity += (this.rainOpacityTarget - this.rainOpacity) * Math.min(1, dt * 0.6);
    this.rain.visible = this.rainOpacity > 0.02;
    this.rainMat.opacity = this.rainOpacity;
    if (this.rain.visible) this._driveRain(dt);

    // 天空压暗渐变 → 交给 Sky
    this.darken += (this.darkenTarget - this.darken) * Math.min(1, dt * 0.8);
    this.sky?.setWeatherDarken(this.darken);

    // 雷暴：周期性闪电 + 延迟打雷
    if (this.state === 'storm') {
      this._lightningT -= dt;
      if (this._lightningT <= 0) {
        this._lightningT = 1.8 + Math.random() * 2.6;
        this.bus?.emit('lightning');
        this._thunderT = 0.3 + Math.random() * 0.9; // 闪后 0.3-1.2s 打雷（更像远处、不惊吓）
      }
    }
    if (this._thunderT > 0) {
      this._thunderT -= dt;
      if (this._thunderT <= 0) {
        this.audio?.playThunder();
        this._thunderT = -1;
      }
    }

    this._driveRainbow(dt);
  }

  _driveRain(dt) {
    const p = this.rainGeo.attributes.position;
    const span = WORLD_SIZE * 0.7;
    for (let i = 0; i < this.count; i++) {
      let y = p.getY(i) - this.vel[i] * dt;
      if (y < SEA_LEVEL - 1) {
        y = 26 + Math.random() * 6;
        p.setX(i, (Math.random() - 0.5) * span);
        p.setZ(i, (Math.random() - 0.5) * span);
      }
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }

  _driveRainbow(dt) {
    let targetOp = 0;
    if (this.rainbowT > 0) {
      this.rainbowT -= dt;
      targetOp = this.rainbowT > 1 ? 0.85 : this.rainbowT * 0.85; // 最后 1 秒淡出
    }
    for (const mesh of this.rainbow.children) {
      const o = mesh.material.opacity;
      mesh.material.opacity = o + (targetOp - o) * Math.min(1, dt * 4);
    }
    this.rainbow.visible = this.rainbow.children[0].material.opacity > 0.01;
  }
}
