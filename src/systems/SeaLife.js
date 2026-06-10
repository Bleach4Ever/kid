// 海洋生物调度器（结构仿 MysteryEggs）：按画质档位维持海里的环境生物数量。
// 每 ~1.5s 维护一次种群，不是每帧扫描；没有深水的预设（如从零开始）不刷。
import { deepWaterTarget } from '../entities/SeaCreatures.js';

// 各画质档位的目标数量（按种类）。保持「一些」的轻松密度，别把小世界塞满。
const BUDGET = {
  high: { fish: 2, jelly: 2, turtle: 1, crab: 2, starfish: 2 },
  low: { fish: 1, jelly: 1, turtle: 1, crab: 1 },
};
const ONSET_DELAY = 6; // 进入世界 ~6s 后海洋生物才陆续“游进来”（温和登场，也让冒烟测试的开局交互无负担）

export class SeaLife {
  constructor({ terrain, quality, spawnCreature }) {
    this.terrain = terrain;
    this.quality = quality;
    this.spawnCreature = spawnCreature; // (kind) => 生物实体（由 main 负责算 y 并入世界），无深水返回 null
    this.creatures = [];
    this.scanTimer = ONSET_DELAY;
    this.hasDeepWater = this._sampleDeep();
  }

  // 切预设/读档后调用：清空记录并重新探测是否有深水
  setPreset() {
    this.creatures.length = 0;
    this.scanTimer = ONSET_DELAY;
    this.hasDeepWater = this._sampleDeep();
  }

  _sampleDeep() {
    return !!deepWaterTarget(this.terrain);
  }

  _budget() {
    return BUDGET[this.quality?.tierName === 'low' ? 'low' : 'high'];
  }

  update(dt) {
    this.scanTimer -= dt;
    if (this.scanTimer > 0) return;
    this.scanTimer = 1.5;
    this.hasDeepWater = this._sampleDeep(); // 挖出新海后会自动开始有生物
    if (!this.hasDeepWater) return;

    this.creatures = this.creatures.filter((c) => c.alive);
    const budget = this._budget();
    const have = {};
    for (const c of this.creatures) have[c.kind] = (have[c.kind] || 0) + 1;
    const needed = [];
    for (const kind in budget) {
      for (let k = have[kind] || 0; k < budget[kind]; k++) needed.push(kind);
    }
    if (!needed.length) return;
    // 每次扫描最多补 2 只，逐渐填满显得自然
    const toSpawn = Math.min(needed.length, 2);
    for (let i = 0; i < toSpawn; i++) {
      const kind = needed[(Math.random() * needed.length) | 0];
      const c = this.spawnCreature(kind);
      if (c) this.creatures.push(c);
    }
  }

  // 冒烟测试入口：立刻尝试生成一只（无深水返回 null）
  _debugSpawn(kind = 'fish') {
    const c = this.spawnCreature(kind);
    if (c) this.creatures.push(c);
    return c;
  }
}
