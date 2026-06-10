// 世界存档（key dino-world:save）：序列化、校验、读写。
// 版本不匹配 / 数据损坏 = 静默当作没有存档，回到正常开始页。
import { storage, encodeHeightsI16, decodeHeightsI16 } from './Storage.js';
import { TERRAIN_SEGMENTS } from '../constants.js';

const KEY = 'dino-world:save';
const VERSION = 1;
const ENCODING = 'i16cm-b64';
const VERTEX_COUNT = (TERRAIN_SEGMENTS + 1) * (TERRAIN_SEGMENTS + 1);

function isValidEntity(rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (!Number.isFinite(rec.x) || !Number.isFinite(rec.z)) return false;
  if (rec.k === 'tree' || rec.k === 'flower') return true;
  if (rec.k === 'nest' || rec.k === 'dino') return typeof rec.s === 'string';
  return false;
}

// 读档：校验通过返回 save（额外带解码好的 heights Float32Array），否则 null
export function loadSave() {
  try {
    const raw = storage.get(KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (!save || save.v !== VERSION) return null;
    const terrain = save.terrain;
    if (!terrain || terrain.enc !== ENCODING || terrain.seg !== TERRAIN_SEGMENTS) return null;
    if (typeof terrain.data !== 'string' || !Array.isArray(save.entities)) return null;
    const heights = decodeHeightsI16(terrain.data);
    if (heights.length !== VERTEX_COUNT) return null;
    save.heights = heights;
    save.entities = save.entities.filter(isValidEntity);
    return save;
  } catch (_) {
    return null; // 损坏数据：静默丢弃
  }
}

export function hasSave() {
  return loadSave() !== null;
}

export function clearSave() {
  storage.remove(KEY);
}

// snapshot: { preset, skyIndex, timeOfDay, heights: Float32Array, entities: [...] }
// timeOfDay 为可选附加字段（连续小时）：不升 VERSION，旧档无此字段时由 main 按 skyIndex 映射
export function serializeWorld(snapshot) {
  try {
    const save = {
      v: VERSION,
      savedAt: Date.now(),
      preset: snapshot.preset,
      skyIndex: snapshot.skyIndex,
      timeOfDay: snapshot.timeOfDay,
      terrain: {
        seg: TERRAIN_SEGMENTS,
        enc: ENCODING,
        data: encodeHeightsI16(snapshot.heights),
      },
      entities: snapshot.entities,
    };
    storage.set(KEY, JSON.stringify(save));
    return save;
  } catch (_) {
    return null; // 存档失败不致命：下个周期再试
  }
}
