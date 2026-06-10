// 全局常量：所有模块共享，避免数值不一致

export const WORLD_SIZE = 84; // 地形在 X/Z 方向的总跨度（-42 ~ 42）
export const TERRAIN_SEGMENTS = 120; // 地图扩大后保持足够的雕刻精度
export const SEA_LEVEL = 0; // 海平面高度
export const MAX_HEIGHT = 9; // 山的最大高度
export const MIN_HEIGHT = -5; // 海底最低高度

// 活恐龙硬上限（高画质档；低画质档 60，经 Quality 生效）：到顶后放置/孵化被拒
export const DINO_CAP = 100;

// 只限制可大量刷出的装饰实体。蛋和巢穴不设硬上限。
export const LIMITS = {
  tree: 120,
  flower: 160,
  poop: 80,
};
