// 跨世界重置的持久档案（语言/音量/星星/图鉴解锁等）
import { storage } from './Storage.js';

const KEY = 'dino-world:profile';

const DEFAULTS = {
  v: 1,
  lang: null,
  muted: false,
  musicVol: 0.5,
  sfxVol: 0.9,
  quality: 'auto',
  stars: 0,
  unlocks: [],
  pedia: {},
  tutorial: { done: false },
};

function load() {
  let saved = {};
  try {
    saved = JSON.parse(storage.get(KEY)) || {};
  } catch (_) { /* 损坏数据：用默认值 */ }
  // 展开 saved 在后：保留未知字段，向前兼容新版本写入的档案
  return { ...DEFAULTS, ...saved };
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
