// 全部声音都用 Web Audio API 实时合成，没有任何外部音频文件。
// AudioContext 必须在用户手势后创建（浏览器自动播放策略），由 splash 的“开始”按钮触发 unlock()。
import { profile } from './Profile.js';

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // C 大调五声音阶

// BGM 情绪：白天明快 → 黄昏放慢限低音区 → 夜晚摇篮曲（降八度 + sine + 深根音垫）
const MOODS = {
  day: { step: 0.5, maxIdx: PENTA.length - 1, mult: 1, type: 'triangle', peak: 0.1, prob: 0.78, pad: 0.5 },
  sunset: { step: 0.65, maxIdx: 4, mult: 1, type: 'triangle', peak: 0.07, prob: 0.68, pad: 0.5 },
  night: { step: 0.9, maxIdx: 4, mult: 0.5, type: 'sine', peak: 0.06, prob: 0.5, pad: 0.25 },
};

// 各物种叫声配方
const CRIES = {
  trex: (a) => a._tone(130, 0.45, { type: 'triangle', peak: 0.16, slideTo: 75 }),
  brachiosaurus: (a) => {
    a._tone(200, 0.28, { type: 'sine', peak: 0.13, slideTo: 330 });
    a._tone(330, 0.32, { type: 'sine', peak: 0.11, when: 0.3, slideTo: 260 });
  },
  triceratops: (a) => a._tone(240, 0.35, { type: 'square', peak: 0.07, slideTo: 180 }),
  stegosaurus: (a) => {
    a._tone(320, 0.18, { type: 'triangle', peak: 0.12, slideTo: 260 });
    a._tone(260, 0.22, { type: 'triangle', peak: 0.1, when: 0.2, slideTo: 290 });
  },
  raptor: (a) => {
    a._tone(700, 0.12, { type: 'sine', peak: 0.12, slideTo: 1100 });
    a._tone(700, 0.12, { type: 'sine', peak: 0.1, when: 0.16, slideTo: 1100 });
  },
  oviraptor: (a) => a._tone(600, 0.16, { type: 'sawtooth', peak: 0.05, slideTo: 900 }),
  pterosaur: (a) => a._tone(1100, 0.5, { type: 'sawtooth', peak: 0.04, slideTo: 1600, echo: true }),
  ankylosaurus: (a) => a._tone(150, 0.3, { type: 'square', peak: 0.07, slideTo: 105 }),
  parasaurolophus: (a) => a._tone(380, 0.42, { type: 'sawtooth', peak: 0.05, slideTo: 540, echo: true }),
  pachycephalosaurus: (a) => {
    a._tone(500, 0.1, { type: 'square', peak: 0.06, slideTo: 430 });
    a._tone(500, 0.1, { type: 'square', peak: 0.06, when: 0.14, slideTo: 430 });
  },
  dilophosaurus: (a) => {
    a._tone(900, 0.13, { type: 'sawtooth', peak: 0.05, slideTo: 1300 });
    a._tone(640, 0.12, { type: 'sawtooth', peak: 0.04, when: 0.18, slideTo: 500 });
  },
  diplodocus: (a) => a._tone(170, 0.5, { type: 'sine', peak: 0.13, slideTo: 135 }),
  spinosaurus: (a) => a._tone(110, 0.5, { type: 'sawtooth', peak: 0.08, slideTo: 70 }),
  therizinosaurus: (a) => {
    a._tone(420, 0.24, { type: 'triangle', peak: 0.1, slideTo: 360 });
    a._tone(360, 0.22, { type: 'triangle', peak: 0.09, when: 0.26, slideTo: 470 });
  },
  mosasaurus: (a) => a._tone(220, 0.5, { type: 'sine', peak: 0.12, slideTo: 90, echo: true }),
};

export class Audio {
  constructor() {
    this.ctx = null;
    // 启动即从 profile 恢复；gain 节点 unlock 后才存在，先存值、unlock 时应用
    this.muted = !!profile.get('muted', false);
    this.musicVol = clamp01(profile.get('musicVol', 0.5));
    this.sfxVol = clamp01(profile.get('sfxVol', 0.9));
    this._lastDig = 0;
    this._lastCry = 0;
    this._lastThunder = 0;
    this.rainNode = null;
    this.mood = MOODS.day;
    // 切后台暂停一切声音与调度，回来再恢复（避免堆积的 interval 重复调度）
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.visibilityState === 'hidden') {
        this.ctx.suspend();
        clearInterval(this._sched);
        this._sched = null;
      } else {
        this.ctx.resume();
        this._startBgm();
      }
    });
  }

  unlock() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    this.master.connect(this.ctx.destination);

    // 基准值 1 × 滑条值（默认 0.5/0.9 = 阶段 7 以前的固定音量）
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);

    // 轻柔回声，让声音更梦幻
    this.delay = this.ctx.createDelay();
    this.delay.delayTime.value = 0.26;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.22;
    this.delay.connect(fb);
    fb.connect(this.delay);
    this.delay.connect(this.master);

    this._startBgm();
  }

  setMuted(m) {
    this.muted = !!m;
    profile.set('muted', this.muted);
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.9;
  }
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  // 设置面板滑条（0~1）：实时缩放对应 gain 节点
  setMusicVolume(v) {
    this.musicVol = clamp01(v);
    if (this.musicGain) this.musicGain.gain.value = this.musicVol;
  }
  setSfxVolume(v) {
    this.sfxVol = clamp01(v);
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVol;
  }

  // ---------- 基础合成单元 ----------
  _tone(freq, dur, { type = 'sine', peak = 0.12, when = 0, slideTo = null, dest = null, echo = false } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc2.type = type;
    osc.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq, t);
    osc2.detune.value = 6; // 轻微失谐更温暖
    if (slideTo) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      osc2.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    osc2.connect(g);
    g.connect(dest || this.sfxGain);
    if (echo) g.connect(this.delay);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + dur + 0.05);
    osc2.stop(t + dur + 0.05);
  }

  _noiseBuffer() {
    if (this._nb) return this._nb;
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._nb = buf;
    return buf;
  }

  // ---------- 背景音乐：轻柔随机五声旋律 ----------
  _startBgm() {
    this.mi = 2;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.2;
    clearInterval(this._sched);
    this._sched = setInterval(() => this._schedule(), 30);
  }

  _schedule() {
    if (!this.ctx) return;
    while (this.nextNote < this.ctx.currentTime + 0.25) {
      this._melodyNote(this.nextNote, this.step);
      this.nextNote += this.mood.step;
      this.step++;
    }
  }

  setMood(phase) {
    this.mood = MOODS[phase] || MOODS.day;
  }

  _melodyNote(time, step) {
    const m = this.mood;
    // 随机游走的旋律
    if (Math.random() < m.prob) {
      this.mi += [-2, -1, -1, 1, 1, 2][(Math.random() * 6) | 0];
      this.mi = Math.max(0, Math.min(m.maxIdx, this.mi));
      this._tone(PENTA[this.mi] * m.mult, m.step * 0.9, {
        type: m.type, peak: m.peak, when: time - this.ctx.currentTime,
        dest: this.musicGain, echo: true,
      });
    }
    // 每 8 拍来一个柔和的低音和弦垫底
    if (step % 8 === 0) {
      const root = PENTA[0] * m.pad;
      const dur = m.step * 3.6;
      this._tone(root, dur, { type: 'sine', peak: 0.09, when: time - this.ctx.currentTime, dest: this.musicGain });
      this._tone(root * 1.5, dur, { type: 'sine', peak: 0.06, when: time - this.ctx.currentTime, dest: this.musicGain });
    }
  }

  // ---------- 各种音效 ----------
  playDig(dir) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastDig < 0.07) return; // 限速，避免连续雕刻刷爆
    this._lastDig = now;
    if (dir > 0) {
      this._tone(300, 0.14, { type: 'triangle', peak: 0.14, slideTo: 480 });
    } else {
      this._tone(220, 0.18, { type: 'sine', peak: 0.16, slideTo: 110 });
    }
  }

  playPlop() {
    this._tone(620, 0.16, { type: 'triangle', peak: 0.18, slideTo: 200, echo: true });
  }

  playSparkle() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      this._tone(f, 0.18, { type: 'sine', peak: 0.12, when: i * 0.06, echo: true })
    );
  }

  playChirp() {
    if (!this._cryOk()) return;
    this._tone(900, 0.1, { type: 'sine', peak: 0.12, slideTo: 1500 });
    this._tone(1200, 0.1, { type: 'sine', peak: 0.1, when: 0.12, slideTo: 1700 });
  }

  playSqueak() {
    if (!this._cryOk()) return;
    this._tone(700, 0.12, { type: 'triangle', peak: 0.12, slideTo: 1000 });
  }

  playSplash() {
    this._tone(180, 0.2, { type: 'sine', peak: 0.14, slideTo: 90 });
  }

  // 沧龙破水而出：带通扫频的“哗啦”白噪 + 低音“咚”
  playBreach() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(400, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.5);
    this._tone(150, 0.26, { type: 'sine', peak: 0.16, slideTo: 70 });
  }

  playDinosaur() {
    if (!this._cryOk()) return;
    this._tone(180, 0.22, { type: 'triangle', peak: 0.13, slideTo: 115 });
  }

  // 物种专属叫声（配方表驱动），未知物种回落到通用叫声
  playCry(species) {
    if (!this._cryOk()) return;
    const cry = CRIES[species];
    if (cry) cry(this);
    else this._tone(180, 0.22, { type: 'triangle', peak: 0.13, slideTo: 115 });
  }

  // 孵化：噪声“咔哒”破壳 + 上行三连音 + 高音铃
  playHatch() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    src.connect(hp);
    hp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.15);
    [392, 523.25, 659.25].forEach((f, i) =>
      this._tone(f, 0.22, { type: 'triangle', peak: 0.12, when: 0.1 + i * 0.09, echo: true })
    );
    this._tone(1318.5, 0.4, { type: 'sine', peak: 0.07, when: 0.38, echo: true });
  }

  playEat() {
    if (!this._cryOk()) return;
    this._tone(360, 0.08, { type: 'triangle', peak: 0.1, slideTo: 240 });
    this._tone(460, 0.1, { type: 'sine', peak: 0.08, when: 0.09, slideTo: 320 });
  }

  // 手动投喂专属「好吃!」：两声上行 + 高音铃，比自动进食的 playEat 更欢快、更有「我喂的」奖励感
  playTreat() {
    if (!this._cryOk()) return;
    this._tone(523.25, 0.1, { type: 'triangle', peak: 0.13, slideTo: 784 });
    this._tone(659.25, 0.12, { type: 'sine', peak: 0.11, when: 0.1, slideTo: 988, echo: true });
    this._tone(1046.5, 0.18, { type: 'sine', peak: 0.07, when: 0.2, echo: true });
  }

  _cryOk() {
    if (!this.ctx) return false;
    const now = this.ctx.currentTime;
    if (now - this._lastCry < 0.15) return false;
    this._lastCry = now;
    return true;
  }

  // 彩虹：闪亮上行琶音
  playMagic() {
    const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) =>
      this._tone(f, 0.3, { type: 'sine', peak: 0.11, when: i * 0.08, echo: true })
    );
  }

  // 图鉴解锁：较长的上行琶音，最后的高音 C 保持余韵
  // 稀有/闪光孵化：C-E-G 三和弦快速叠入 + 高音 sine 长闪烁
  playMagicChord() {
    [523.25, 659.25, 783.99].forEach((f, i) =>
      this._tone(f, 0.5, { type: 'triangle', peak: 0.09, when: i * 0.06, echo: true })
    );
    this._tone(1567.98, 1.4, { type: 'sine', peak: 0.06, when: 0.25, echo: true });
  }

  playUnlock() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      this._tone(f, 0.24, { type: 'triangle', peak: 0.11, when: i * 0.12, echo: true })
    );
    this._tone(1046.5, 1.0, { type: 'sine', peak: 0.1, when: notes.length * 0.12, echo: true });
  }

  // 任务完成号角：C-E-G-C 大调琶音（triangle）+ 低音 sine 根音垫底，约 0.8s
  playFanfare() {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) =>
      this._tone(f, 0.26, { type: 'triangle', peak: 0.13, when: i * 0.13, echo: true })
    );
    this._tone(261.63, 0.8, { type: 'sine', peak: 0.1, echo: true });
  }

  // 昼夜切换：柔和的“呼”一声
  playWhoosh() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2000, t + 0.5);
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.sfxGain);
    src.start(t);
    src.stop(t + 0.7);
  }

  // 下雨：循环柔和白噪
  startRain() {
    if (!this.ctx || this.rainNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.12, this.ctx.currentTime + 0.4);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start();
    this.rainNode = { src, g };
  }

  stopRain() {
    if (!this.rainNode) return;
    const { src, g } = this.rainNode;
    g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.4);
    src.stop(this.ctx.currentTime + 0.5);
    this.rainNode = null;
  }

  // 雷声：低频滤波噪声“轰”——软起音、无尖锐爆裂，温柔不吓 5 岁孩子；限流 ≥2s
  playThunder() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastThunder < 2) return;
    this._lastThunder = now;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(180, now);
    lp.frequency.exponentialRampToValueAtTime(70, now + 1.1);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.14, now + 0.18); // 软起音，不是尖锐的“咔”
    g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start(now);
    src.stop(now + 1.3);
    this._tone(55, 1.0, { type: 'sine', peak: 0.1 }); // 一记很低的正弦给“身体感”
  }

  // 点海洋生物：温柔的“咕噜”气泡音 + 一点高音亮片
  playBlub() {
    if (!this.ctx) return;
    this._tone(420, 0.12, { type: 'sine', peak: 0.1, slideTo: 640 });
    this._tone(880, 0.1, { type: 'sine', peak: 0.06, when: 0.06, slideTo: 1100, echo: true });
  }

  click() {
    this._tone(880, 0.05, { type: 'square', peak: 0.05 });
  }

  // ---------- 世界事件音效（阶段 6） ----------
  // 🌸 花瓣雨：音乐盒琶音（重复 4 音五声音阶图案、sine、高音区、重 echo）
  startMusicBox() {
    if (!this.ctx || this._musicBox) return;
    const pattern = [1046.5, 1318.5, 1567.98, 1760]; // C6 E6 G6 A6
    let i = 0;
    this._musicBox = setInterval(() => {
      if (this.ctx.state !== 'running') return; // 切后台时不堆积音符
      this._tone(pattern[i % pattern.length], 0.5, {
        type: 'sine', peak: 0.06, dest: this.musicGain, echo: true,
      });
      i++;
    }, 320);
  }

  stopMusicBox() {
    clearInterval(this._musicBox);
    this._musicBox = null;
  }

  // 🌠 每颗流星：柔和下行哨音 + 偶尔的高音闪烁
  playMeteorWhistle() {
    this._tone(1400, 0.8, { type: 'sine', peak: 0.05, slideTo: 500, echo: true });
    if (Math.random() < 0.4) {
      this._tone(1800, 0.14, { type: 'sine', peak: 0.04, when: 0.35, echo: true });
    }
  }

  // 🌌 极光：空灵 pad（双失谐 sine、很低 peak、echo），持续到 stop
  startAuroraPad() {
    if (!this.ctx || this.auroraNode) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 2.5);
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    o1.type = 'sine';
    o2.type = 'sine';
    o1.frequency.value = 130.81; // C3
    o2.frequency.value = 196.0; // G3
    o2.detune.value = 9;
    o1.connect(g);
    o2.connect(g);
    g.connect(this.musicGain);
    g.connect(this.delay);
    o1.start(t);
    o2.start(t);
    this.auroraNode = { o1, o2, g };
  }

  stopAuroraPad() {
    if (!this.auroraNode) return;
    const { o1, o2, g } = this.auroraNode;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.5);
    o1.stop(t + 1.6);
    o2.stop(t + 1.6);
    this.auroraNode = null;
  }

  // 打哈欠：长长的下行叹气
  playYawn() {
    if (!this._cryOk()) return;
    this._tone(300, 0.5, { type: 'sine', peak: 0.06, slideTo: 150 });
  }

  // 打嗝：短促一声「嗝」
  playHiccup() {
    if (!this.ctx) return;
    this._tone(680, 0.07, { type: 'square', peak: 0.09, slideTo: 520 });
  }

  // 受惊：一声短促上扬的「咦!」
  playStartle() {
    if (!this._cryOk()) return;
    this._tone(1300, 0.12, { type: 'sine', peak: 0.1, slideTo: 950 });
  }

  // 吹哨召唤：两声欢快上扬的哨音
  playWhistle() {
    if (!this.ctx) return;
    this._tone(660, 0.18, { type: 'sine', peak: 0.12, slideTo: 990 });
    this._tone(880, 0.22, { type: 'sine', peak: 0.1, when: 0.16, slideTo: 1180, echo: true });
  }

  // 叠叠睡鼾声：多堆共用一个柔和低频音垫 + 慢呼吸 LFO，按打鼾者 id 引用计数，全醒才停
  startSnore(id) {
    if (!this.ctx) return;
    this._snorers = this._snorers || new Set();
    this._snorers.add(id);
    if (this.snoreNode) return;
    const t = this.ctx.currentTime;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 1.2);
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    o1.type = 'sine'; o2.type = 'sine'; lfo.type = 'sine';
    o1.frequency.value = 70;   // 低沉的鼾
    o2.frequency.value = 105;
    o2.detune.value = -6;
    lfo.frequency.value = 0.45; // 慢呼吸起伏
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(g.gain);
    o1.connect(g); o2.connect(g);
    g.connect(this.sfxGain);
    o1.start(t); o2.start(t); lfo.start(t);
    this.snoreNode = { o1, o2, lfo, g };
  }

  stopSnore(id) {
    if (this._snorers) this._snorers.delete(id);
    if (!this.snoreNode || (this._snorers && this._snorers.size > 0)) return;
    const { o1, o2, lfo, g } = this.snoreNode;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.linearRampToValueAtTime(0.0001, t + 1.0);
    o1.stop(t + 1.1); o2.stop(t + 1.1); lfo.stop(t + 1.1);
    this.snoreNode = null;
  }

  // 🌋 火山：滤波噪声隆隆（循环到 stop）+ 打击式低音 pop
  startRumble() {
    if (!this.ctx || this.rumbleNode) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer();
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 170;
    const g = this.ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.linearRampToValueAtTime(0.18, this.ctx.currentTime + 0.8);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.sfxGain);
    src.start();
    this.rumbleNode = { src, g };
  }

  stopRumble() {
    if (!this.rumbleNode) return;
    const { src, g } = this.rumbleNode;
    g.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
    src.stop(this.ctx.currentTime + 0.7);
    this.rumbleNode = null;
  }

  playVolcanoPop() {
    this._tone(110, 0.25, { type: 'sine', peak: 0.16, slideTo: 55 });
  }
}
