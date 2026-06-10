// 全部声音都用 Web Audio API 实时合成，没有任何外部音频文件。
// AudioContext 必须在用户手势后创建（浏览器自动播放策略），由 splash 的“开始”按钮触发 unlock()。

const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25]; // C 大调五声音阶

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._lastDig = 0;
    this._lastCry = 0;
    this.rainNode = null;
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

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.5;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
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
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }
  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
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
      this.nextNote += 0.5;
      this.step++;
    }
  }

  _melodyNote(time, step) {
    // 随机游走的旋律
    if (Math.random() < 0.78) {
      this.mi += [-2, -1, -1, 1, 1, 2][(Math.random() * 6) | 0];
      this.mi = Math.max(0, Math.min(PENTA.length - 1, this.mi));
      this._tone(PENTA[this.mi], 0.45, {
        type: 'triangle', peak: 0.1, when: time - this.ctx.currentTime,
        dest: this.musicGain, echo: true,
      });
    }
    // 每 8 拍来一个柔和的低音和弦垫底
    if (step % 8 === 0) {
      const root = PENTA[0] / 2;
      this._tone(root, 1.8, { type: 'sine', peak: 0.09, when: time - this.ctx.currentTime, dest: this.musicGain });
      this._tone(root * 1.5, 1.8, { type: 'sine', peak: 0.06, when: time - this.ctx.currentTime, dest: this.musicGain });
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

  playDinosaur() {
    if (!this._cryOk()) return;
    this._tone(180, 0.22, { type: 'triangle', peak: 0.13, slideTo: 115 });
  }

  playEat() {
    if (!this._cryOk()) return;
    this._tone(360, 0.08, { type: 'triangle', peak: 0.1, slideTo: 240 });
    this._tone(460, 0.1, { type: 'sine', peak: 0.08, when: 0.09, slideTo: 320 });
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
    g.connect(this.master);
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

  click() {
    this._tone(880, 0.05, { type: 'square', peak: 0.05 });
  }
}
