// 性能分级：高/低两档 + 自动检测 + 运行时动态降级（只降不升）。
// 档位数据驱动 Scene（像素比/阴影）、Weather（雨粒子数）和 main（恐龙硬上限）。
import { profile } from './Profile.js';
import { DINO_CAP } from '../constants.js';

export const TIERS = {
  high: { pixelRatioCap: 2, shadows: true, shadowMapSize: 2048, rainCount: 700, dinoCap: DINO_CAP },
  low: { pixelRatioCap: 1, shadows: false, shadowMapSize: 1024, rainCount: 250, dinoCap: 60 },
};

// 弱设备启发式：核少，或高分屏移动端（像素太多画不动）
export function detectTier() {
  const cores = navigator.hardwareConcurrency || 8;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  if (cores <= 4 || (mobile && window.devicePixelRatio >= 2.5)) return 'low';
  return 'high';
}

export function resolveTier(profileQuality) {
  return TIERS[profileQuality] ? profileQuality : detectTier();
}

export class Quality {
  constructor({ stage, weather, onChange = null }) {
    this.stage = stage;
    this.weather = weather;
    this.onChange = onChange;
    this.tierName = null;
    this.dinoCap = DINO_CAP;
    // 玩家在设置里手动选的恐龙上限（null = 跟随画质档）；优先于档位 cap
    this.userCap = Number.isFinite(profile.get('dinoCap', null)) ? profile.get('dinoCap', null) : null;
    this._tierCap = DINO_CAP;
    // 动态降级状态：dt 滚动均值 + 持续超阈时长；本会话只降一次
    this._avgDt = 1 / 60;
    this._slowFor = 0;
    this._downgraded = false;
    this.preference = profile.get('quality', 'auto');
    if (this.preference !== 'auto' && !TIERS[this.preference]) this.preference = 'auto';
    this.applyTier(resolveTier(this.preference));
  }

  // 设置面板入口：'auto' | 'high' | 'low'，写 profile 并立即生效
  setPreference(pref) {
    this.preference = pref === 'auto' || TIERS[pref] ? pref : 'auto';
    profile.set('quality', this.preference);
    this.applyTier(resolveTier(this.preference));
  }

  // 设置面板入口：手动设恐龙上限（覆盖档位 cap）。传 null 恢复跟随档位。
  setDinoCap(n) {
    this.userCap = Number.isFinite(n) ? n : null;
    profile.set('dinoCap', this.userCap);
    this.dinoCap = this.userCap ?? this._tierCap;
    this.onChange?.(this.tierName, TIERS[this.tierName]);
  }

  applyTier(name) {
    const tierName = TIERS[name] ? name : 'high';
    const tier = TIERS[tierName];
    this.tierName = tierName;
    this._tierCap = tier.dinoCap;
    this.dinoCap = this.userCap ?? this._tierCap; // 手动上限优先，否则跟随档位
    this.stage.applyQuality(tier);
    this.weather.setRainCount(tier.rainCount);
    this.onChange?.(tierName, tier);
  }

  // 主循环每帧调用：auto 档在 high 上持续卡顿（均值 > 40ms 达 5s）→ 静默降到 low
  noteFrame(dt) {
    if (this._downgraded || this.preference !== 'auto' || this.tierName !== 'high') return;
    this._avgDt += (dt - this._avgDt) * 0.05;
    if (this._avgDt > 0.04) {
      this._slowFor += dt;
      if (this._slowFor >= 5) {
        this._downgraded = true;
        this.applyTier('low');
      }
    } else {
      this._slowFor = 0;
    }
  }
}
