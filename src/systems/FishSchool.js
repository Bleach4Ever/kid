import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';

// 环境鱼群：水里自动维持一小群，被翼龙/沧龙吃掉后慢慢补充。
// 纯环境装饰（不进存档），是翼龙俯冲捕食、沧龙口粮的对象。
export class FishSchool {
  constructor({ terrain, spawnFish, countFish, target = 10 }) {
    this.terrain = terrain;
    this.spawnFish = spawnFish; // ({x,z}) => 入世界的鱼实体
    this.countFish = countFish; // () => 当前活鱼数
    this.target = target;
    this.timer = 1;
  }

  update(dt) {
    if (this.countFish() >= this.target) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1.2 + Math.random() * 1.8;
    const p = this._waterPoint();
    if (!p) return;
    // 成群：在该点撒一小簇（只在仍是水的偏移处生成）
    const n = 2 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n && this.countFish() < this.target; i++) {
      const x = p.x + (Math.random() - 0.5) * 3.5;
      const z = p.z + (Math.random() - 0.5) * 3.5;
      if (this.terrain.getHeightAt(x, z) < SEA_LEVEL - 0.5) this.spawnFish({ x, z });
    }
  }

  // 随机找一处够深的水
  _waterPoint() {
    const bound = WORLD_SIZE * 0.5;
    for (let i = 0; i < 24; i++) {
      const x = (Math.random() - 0.5) * 2 * bound;
      const z = (Math.random() - 0.5) * 2 * bound;
      if (this.terrain.getHeightAt(x, z) < SEA_LEVEL - 0.8) return { x, z };
    }
    return null;
  }

  // 冒烟测试入口：立即补满鱼群
  _debugFill() {
    for (let guard = 0; guard < 60 && this.countFish() < this.target; guard++) {
      const p = this._waterPoint();
      if (p) this.spawnFish(p);
      else break;
    }
    return this.countFish();
  }
}
