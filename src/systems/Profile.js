// 跨世界重置的持久档案（语言/音量/星星/图鉴解锁等）
import { storage } from './Storage.js';

const KEY = 'dino-world:profile';

const DEFAULTS = {
  v: 2,
  lang: null,
  muted: false,
  musicVol: 0.5,
  sfxVol: 0.9,
  quality: 'auto',
  stars: 0,
  unlocks: [],
  pedia: {},
  tutorial: { done: false },
  // v2：物种解锁里程碑的持久计数器 + 神秘蛋保底状态
  counters: { raisedHerb: 0, raisedCarn: 0, hatched: 0, pet: 0 },
  mystery: { opened: 0, pity: 0 },
};

// v1 档案只可能有这 5 个物种的 raised 印章（其余两种不参与按食性计数）
const V1_DIETS = {
  triceratops: 'herb', brachiosaurus: 'herb', stegosaurus: 'herb',
  trex: 'carn', raptor: 'carn',
};

function load() {
  let saved = {};
  try {
    saved = JSON.parse(storage.get(KEY)) || {};
  } catch (_) { /* 损坏数据：用默认值 */ }
  // 展开 saved 在后：保留未知字段，向前兼容新版本写入的档案
  const data = { ...DEFAULTS, ...saved };
  // 嵌套对象浅合并会整体覆盖：单独补齐缺失键
  data.counters = { ...DEFAULTS.counters, ...(saved.counters || {}) };
  data.mystery = { ...DEFAULTS.mystery, ...(saved.mystery || {}) };
  // v1 → v2：从图鉴印章慷慨回填计数器，老玩家的进度不清零
  if ((saved.v || 1) < 2) {
    for (const id in data.pedia) {
      const rec = data.pedia[id];
      if (!rec) continue;
      if (rec.hatched) data.counters.hatched++;
      if (rec.raised && V1_DIETS[id] === 'herb') data.counters.raisedHerb++;
      if (rec.raised && V1_DIETS[id] === 'carn') data.counters.raisedCarn++;
    }
    data.v = 2;
  }
  return data;
}

const data = load();

function save() {
  storage.set(KEY, JSON.stringify(data));
}

export const profile = {
  get(key, fallback) {
    return data[key] !== undefined ? data[key] : fallback;
  },
  set(key, value) {
    data[key] = value;
    save();
  },
};
