// 全局常量：所有模块共享，避免数值不一致

export const WORLD_SIZE = 120; // 地形在 X/Z 方向的总跨度（-60 ~ 60）
export const TERRAIN_SEGMENTS = 180; // 更大地图下保持足够的雕刻精度（dx≈0.667）
export const SEA_LEVEL = 0; // 海平面高度
export const MAX_HEIGHT = 9; // 山的最大高度
export const MIN_HEIGHT = -5; // 海底最低高度

// 活恐龙硬上限（高画质档；低画质档 60，经 Quality 生效）：到顶后放置/孵化被拒
export const DINO_CAP = 100;

// 只限制可大量刷出的装饰实体。蛋和巢穴不设硬上限。
// 海洋生物（环境点缀）也设硬上限，数量由 SeaLife 调度器按画质档位维持。
export const LIMITS = {
  tree: 120,
  flower: 160,
  bubble: 24,
  poop: 80,
  fish: 6,
  jelly: 6,
  turtle: 2,
  crab: 6,
  starfish: 8,
};
