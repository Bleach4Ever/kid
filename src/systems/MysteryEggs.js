// 神秘蛋调度 + 抽取（含保底）：
// 开局 2-3 分钟出第一颗，之后每 4-6 分钟一颗，同时最多 1 颗（🍀 幸运符间隔 -25%）。
// 抽取：稀有度 rare 10% / uncommon 30% / common 60%，层内未孵化物种权重 ×3；
// 保底：连续 3 次没开出新内容必出新的（优先未孵化物种，否则未收集变体）。
// 没有倒计时、没有签到：蛋只是某个时刻悄悄出现的环境惊喜。
import { SPECIES } from '../entities/Dinosaur.js';
import { rollVariant, VARIANTS } from '../entities/Variants.js';
import { profile } from './Profile.js';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';

const RARITY_WEIGHTS = [['rare', 0.1], ['uncommon', 0.3], ['common', 0.6]];
const PITY_LIMIT = 3;

export class MysteryEggs {
  constructor({ terrain, spawnEgg }) {
    this.terrain = terrain;
    this.spawnEgg = spawnEgg; // (point) => 蛋实体（由 main 负责入世界）
    this.current = null;
    this.timer = 120 + Math.random() * 60;
  }

  _interval() {
    const lucky = profile.get('unlocks', []).includes('charm.lucky');
    return (240 + Math.random() * 120) * (lucky ? 0.75 : 1);
  }

  update(dt) {
    if (this.current?.alive) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this._interval();
    this.current = this.spawnEgg(this._point());
  }

  _point() {
    const bound = WORLD_SIZE * 0.46 * 0.7;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * bound;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (this.terrain.getHeightAt(x, z) > SEA_LEVEL + 0.3) return { x, z };
    }
    return { x: 0, z: 0 };
  }

  // 开蛋时调用：决定孵出什么，并推进保底计数
  roll() {
    const pedia = profile.get('pedia', {});
    const lucky = profile.get('unlocks', []).includes('charm.lucky');
    const mystery = profile.get('mystery', { opened: 0, pity: 0 });
    const hatched = (s) => !!pedia[s]?.hatched;
    const hasVariant = (s, v) => !!pedia[s]?.variants?.[v];

    let species = this._pickSpecies(pedia);
    let variant = rollVariant({ mystery: true, lucky });

    let isNew = !hatched(species) || (variant && !hasVariant(species, variant));
    if (!isNew && mystery.pity + 1 >= PITY_LIMIT) {
      // 保底：优先未孵化物种；全孵化了就补一个没收集过的变体
      const unhatched = Object.keys(SPECIES).filter((s) => !hatched(s));
      if (unhatched.length) {
        species = unhatched[(Math.random() * unhatched.length) | 0];
      } else {
        const missing = [];
        for (const s in SPECIES) {
          for (const v in VARIANTS) {
            if (!hasVariant(s, v)) missing.push([s, v]);
          }
        }
        if (missing.length) [species, variant] = missing[(Math.random() * missing.length) | 0];
      }
      isNew = true;
    }
    mystery.opened++;
    mystery.pity = isNew ? 0 : mystery.pity + 1;
    profile.set('mystery', mystery);
    return { species, variant };
  }

  _pickSpecies(pedia) {
    let r = Math.random();
    let tier = 'common';
    for (const [name, p] of RARITY_WEIGHTS) {
      if (r < p) {
        tier = name;
        break;
      }
      r -= p;
    }
    const pool = Object.keys(SPECIES).filter((s) => SPECIES[s].rarity === tier);
    const weighted = pool.flatMap((s) => (pedia[s]?.hatched ? [s] : [s, s, s]));
    return weighted[(Math.random() * weighted.length) | 0];
  }

  // ---------- 调试/冒烟测试入口 ----------
  _debugSpawn() {
    if (!this.current?.alive) {
      this.timer = this._interval();
      this.current = this.spawnEgg(this._point());
    }
    return this.current;
  }
}
