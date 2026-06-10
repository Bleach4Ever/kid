// 连续昼夜时钟：一整天 ≈ 480 秒真实时间（8 分钟）。
// 这是时间的唯一真相源——Sky（光照/天空）、Weather（天气调度）、Clock（UI 时钟）都从这里读。
// 与旧的离散 sky.idx 解耦：相位（白天/黄昏/夜晚）只用于 BGM 情绪、恐龙睡觉、存档兼容。
const DAY_LENGTH = 480; // 一整天的真实秒数（产品锁定：自动·舒缓）
const PHASE_ORDER = ['day', 'sunset', 'night']; // 对齐旧 SKY_PHASES，phaseIndex 兼容旧 sky.idx

export class TimeOfDay {
  constructor(bus) {
    this.bus = bus;
    this.hour = 8; // 连续小时 [0,24)，开局早上 8 点
    this._phase = this.getPhase();
  }

  // 主循环每帧推进（仅在 gameStarted 时调用，开始页冻结在 8:00）
  advance(dt) {
    this.hour = (this.hour + (dt / DAY_LENGTH) * 24) % 24;
    this._syncPhase();
  }

  // 工具栏“快进时间”按钮：跳 +3.5 小时
  fastForward(hours = 3.5) {
    this.setHour(this.hour + hours);
  }

  // 设定到指定时刻（读档 / 重置 / 流星雨需要黑夜时用）
  setHour(hour) {
    this.hour = ((hour % 24) + 24) % 24;
    this._syncPhase();
  }

  restore(hour) {
    if (Number.isFinite(hour)) this.setHour(hour);
  }

  // 离散相位：夜(≥19 或 <5) / 黄昏(≥17) / 白天，供 BGM、睡觉、存档复用
  getPhase() {
    const h = this.hour;
    if (h >= 19 || h < 5) return 'night';
    if (h >= 17) return 'sunset';
    return 'day';
  }

  get phaseIndex() {
    return PHASE_ORDER.indexOf(this.getPhase());
  }

  serialize() {
    return Math.round(this.hour * 100) / 100;
  }

  // 仅在跨越相位边界时广播，避免每帧刷 BGM 情绪
  _syncPhase() {
    const p = this.getPhase();
    if (p !== this._phase) {
      this._phase = p;
      this.bus?.emit('skyphase', { phase: p });
    }
  }
}
