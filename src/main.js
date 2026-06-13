import './style.css';
import * as THREE from 'three';
import { Stage } from './world/Scene.js';
import { Terrain } from './world/Terrain.js';
import { Water } from './world/Water.js';
import { Sky } from './world/Sky.js';
import { Tools } from './systems/Tools.js';
import { Input } from './systems/Input.js';
import { Weather } from './systems/Weather.js';
import { WorldEvents } from './systems/WorldEvents.js';
import { Audio } from './systems/Audio.js';
import { Bus } from './systems/Bus.js';
import { Particles } from './systems/Particles.js';
import { Quality } from './systems/Quality.js';
import { Toolbar } from './ui/Toolbar.js';
import { Pedia } from './ui/Pedia.js';
import { Settings } from './ui/Settings.js';
import { Tutorial } from './ui/Tutorial.js';
import { HungerBubble } from './ui/HungerBubble.js';
import { Quests } from './systems/Quests.js';
import { encodeHeightsI16, decodeHeightsI16 } from './systems/Storage.js';
import { loadSave, clearSave, serializeWorld, hasSave } from './systems/SaveGame.js';
import { initLang, t, setLang, getLang, onLangChange, applyDom } from './i18n.js';
import { profile } from './systems/Profile.js';
import { Unlocks } from './systems/Unlocks.js';
import { createTree, createFlower } from './entities/Tree.js';
import { createDinosaur, SPECIES } from './entities/Dinosaur.js';
import { createEgg, createNest as createNestEntity, createPoop, createMysteryEgg } from './entities/Ecosystem.js';
import { rollVariant, VARIANTS } from './entities/Variants.js';
import { MysteryEggs } from './systems/MysteryEggs.js';
import { SeaLife } from './systems/SeaLife.js';
import { SEA_BUILDERS, SEABED_KINDS, deepWaterTarget } from './entities/SeaCreatures.js';
import { TimeOfDay } from './systems/TimeOfDay.js';
import { Clock } from './ui/Clock.js';
import { LIMITS, SEA_LEVEL, WORLD_SIZE } from './constants.js';
import { clamp } from './utils.js';

// ---------------- 语言（先于一切 UI） ----------------
initLang();
applyDom(document.body);

// ---------------- 健壮性：WebGL 检测 + 全局错误边界 ----------------
function webglSupported() {
  try {
    const probe = document.createElement('canvas');
    return !!(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!webglSupported()) {
  document.getElementById('webgl-fallback').classList.add('visible');
  document.getElementById('splash').classList.add('hidden');
  // 模块顶层不能 return：用 throw 中止后续装配（错误边界尚未注册，不会叠加哎呀层）
  throw new Error('WebGL not supported');
}

// 仅首次触发：先抢救存档，再显示大「哎呀！」。报错即存档 → 重载即恢复，对孩子近乎无感
let fatalShown = false;
function showFatalError() {
  if (fatalShown) return;
  fatalShown = true;
  try {
    saveWorld(); // 函数声明提升，这里可以安全引用
  } catch { /* 存档失败也要把提示画出来 */ }
  document.getElementById('error-overlay').classList.add('visible');
}
window.addEventListener('error', showFatalError);
// 被拒绝的 Promise 大多无害（如 iOS 上 AudioContext.resume()）：抢救存档 + 记日志，但不吓孩子
window.addEventListener('unhandledrejection', (e) => {
  e.preventDefault();
  try {
    saveWorld();
  } catch { /* 存档失败也不升级为致命提示 */ }
  console.warn('Unhandled promise rejection:', e.reason);
});

// ---------------- 装配世界 ----------------
const canvas = document.getElementById('scene');
const stage = new Stage(canvas);

// 上下文丢失：先存档再暂停主循环（rAF 保持，恢复后无缝继续）
let paused = false;
const contextOverlay = document.getElementById('context-overlay');
stage.onContextLost = () => {
  saveWorld();
  paused = true;
  contextOverlay.classList.add('visible');
};
stage.onContextRestored = () => {
  contextOverlay.classList.remove('visible');
  paused = false;
};

const terrain = new Terrain();
stage.scene.add(terrain.mesh);
const water = new Water();
stage.scene.add(water.mesh);
const sky = new Sky(stage.scene, { sun: stage.sun, hemi: stage.hemi, ambient: stage.ambient });
const audio = new Audio();
const tools = new Tools();
const bus = new Bus();
// 连续昼夜时钟（唯一时间真相源）：Sky/Weather/Clock 都从它读取
const timeOfDay = new TimeOfDay(bus);
// 天气已全自动：构造时注入 sky（压暗）/audio（雷声）/bus（闪电）
const weather = new Weather(stage.scene, terrain, { sky, audio, bus });
// 性能分级：按 profile（auto/high/low）立即应用像素比/阴影/雨量/恐龙上限。
// onChange 构造后再挂：构造期间 quality 还在 TDZ，updatePopulationStatus 不能引用它
const quality = new Quality({ stage, weather });
quality.onChange = () => updatePopulationStatus(); // 上限随档位变化 → 刷新计数标签
const particles = new Particles(stage.scene);
// ensureNight / placeEntity 都是函数声明（提升），这里先引用没问题
const worldEvents = new WorldEvents({
  scene: stage.scene, terrain, sky, particles, stage, ensureNight, placeEntity,
});

// ---------------- 实体管理（树/花/恐龙） ----------------
const entities = [];
const counts = {};
const pendingRemovals = new Set();
const populationStatus = document.getElementById('population-status');
let currentPreset = 'park';

const PRESET_ENTITIES = {
  // 园区：散布在缓坡草地，避开 (18,-14) 的池塘
  park: [
    ['tree', -28, -14], ['tree', -22, -6], ['tree', -30, 6], ['tree', -14, 16],
    ['tree', 24, 14], ['tree', 30, 6], ['tree', 6, -26], ['tree', -6, 26],
    ['flower', -14, 6], ['flower', -8, 10], ['flower', -3, 4], ['flower', 4, 10],
    ['flower', 10, 16], ['flower', -18, -2], ['triceratops', -12, -4],
    ['stegosaurus', -4, -14], ['brachiosaurus', 0, 16], ['oviraptor', 14, 18],
    ['pterosaur', 0, 0],
  ],
  // 峡谷：树/恐龙放两侧台地，避开中间蜿蜒河谷（x≈sin(z*0.07)*10）
  canyon: [
    ['tree', -30, 12], ['tree', -26, 20], ['tree', 30, -14], ['tree', 27, -22],
    ['flower', -24, 4], ['flower', 24, 8], ['flower', -26, -6], ['flower', 26, 18],
    ['triceratops', -26, 0], ['raptor', 26, -4], ['oviraptor', -24, 14],
    ['pterosaur', 0, 0],
  ],
  // 群岛：实体落在四座岛中心附近的陆地上
  islands: [
    ['tree', -26, -10], ['tree', -18, -4], ['flower', -22, 2], ['flower', -28, -14],
    ['triceratops', -23, -8], ['brachiosaurus', -16, 0],
    ['tree', 18, 14], ['tree', 24, 18], ['flower', 16, 8], ['stegosaurus', 20, 14],
    ['tree', 26, -24], ['raptor', 24, -22], ['flower', -17, 31],
    ['pterosaur', 0, 0],
  ],
  blank: [],
};

function disposeObj(obj) {
  // 只回收每个实例独有的几何体；材质和归档共享几何（树/花）不能 dispose
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
  });
}

function destroyEntity(entity) {
  const idx = entities.indexOf(entity);
  if (idx < 0) return;
  entity.alive = false;
  stage.scene.remove(entity.object3d);
  disposeObj(entity.object3d);
  entities.splice(idx, 1);
  counts[entity.kind] = Math.max(0, (counts[entity.kind] || 0) - 1);
  updatePopulationStatus();
}

function requestRemove(entity) {
  if (!entity.alive) return;
  entity.alive = false;
  pendingRemovals.add(entity);
}

function flushRemovals() {
  for (const entity of pendingRemovals) destroyEntity(entity);
  pendingRemovals.clear();
}

function addEntity(wrapper, pos) {
  wrapper.object3d.userData.entity = wrapper; // 抚摸射线命中后反查 wrapper
  wrapper.object3d.position.copy(pos);
  stage.scene.add(wrapper.object3d);
  entities.push(wrapper);
  counts[wrapper.kind] = (counts[wrapper.kind] || 0) + 1;
  updatePopulationStatus();
  // 超过上限：删掉最早的同类，保持流畅
  const limit = LIMITS[wrapper.kind];
  if (Number.isFinite(limit) && counts[wrapper.kind] > limit) {
    const idx = entities.findIndex((e) => e.kind === wrapper.kind);
    if (idx >= 0) {
      const old = entities[idx];
      destroyEntity(old);
    }
  }
}

function aliveDinoCount() {
  return entities.reduce((sum, entity) => sum + (entity.isDinosaur && entity.alive ? 1 : 0), 0);
}

function updatePopulationStatus() {
  if (!populationStatus) return;
  const total = aliveDinoCount();
  const max = quality.dinoCap;
  populationStatus.textContent = t('population.count', { n: total, max });
  populationStatus.classList.toggle('warning', total >= max * 0.8 && total < max);
  populationStatus.classList.toggle('danger', total >= max);
}

// 到达硬上限被拒：计数标签抖一抖（重置动画的标准 reflow 技巧）
populationStatus?.addEventListener('animationend', () => populationStatus.classList.remove('shake'));
function shakePopulationStatus() {
  if (!populationStatus) return;
  populationStatus.classList.remove('shake');
  void populationStatus.offsetWidth;
  populationStatus.classList.add('shake');
}

function placeEntity(point, kind) {
  if (kind === 'tree' || kind === 'flower') {
    const groundY = terrain.getHeightAt(point.x, point.z);
    const y = Math.max(SEA_LEVEL - 0.1, groundY);
    const w = kind === 'tree' ? createTree() : createFlower();
    addEntity(w, new THREE.Vector3(point.x, y, point.z));
    kind === 'tree' ? audio.playPlop() : audio.playSparkle();
    particles.burst({ x: point.x, y: y + 0.5, z: point.z }, {
      count: 10, colors: ['#8fdf7a', '#bce98c', '#6fc96b'], speed: 1.6, gravity: 4, life: 0.7, size: 0.16,
    });
  } else {
    // 硬上限：活恐龙到顶 → 轻 squeak + 计数标签抖动，拒绝放置
    if (aliveDinoCount() >= quality.dinoCap) {
      audio.playSqueak();
      shakePopulationStatus();
      return;
    }
    const w = createDinosaur(kind);
    addEntity(w, new THREE.Vector3(point.x, SEA_LEVEL, point.z));
    audio.playCry(kind);
    particles.burst({ x: point.x, y: SEA_LEVEL + 0.8, z: point.z }, {
      count: 14, colors: ['#ffd980', '#ffb45e', '#fff1b0'], speed: 2, gravity: 4, life: 0.8, size: 0.18,
    });
  }
  bus.emit('place', { kind });
}

function placePresetEntity(kind, x, z) {
  const y = Math.max(SEA_LEVEL - 0.1, terrain.getHeightAt(x, z));
  const wrapper = kind === 'tree'
    ? createTree()
    : kind === 'flower'
      ? createFlower()
      : createDinosaur(kind);
  addEntity(wrapper, new THREE.Vector3(x, y, z));
}

function groundPosition(x, z) {
  return new THREE.Vector3(x, Math.max(SEA_LEVEL, terrain.getHeightAt(x, z)), z);
}

const NEST_BOUND = WORLD_SIZE * 0.46; // 与恐龙活动范围一致，巢不放在地图边缘外
function isNestLand(x, z) {
  return terrain.getHeightAt(x, z) > SEA_LEVEL + 0.1;
}

// 巢必须筑在陆地上（绝不在水里）：偏好点 → 逐步扩大半径随机找陆地 → 兜底全图粗扫最近陆地
function createNest(species, preferred) {
  let x = preferred.x;
  let z = preferred.z;
  let found = isNestLand(x, z);
  for (let i = 0; !found && i < 24; i++) {
    const radius = 3 + i * 1.5;
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    const cx = clamp(preferred.x + Math.cos(a) * r, -NEST_BOUND, NEST_BOUND);
    const cz = clamp(preferred.z + Math.sin(a) * r, -NEST_BOUND, NEST_BOUND);
    if (isNestLand(cx, cz)) {
      x = cx;
      z = cz;
      found = true;
    }
  }
  if (!found) {
    // 兜底：整图粗扫，挑离偏好点最近的一块陆地
    let bestD = Infinity;
    for (let gx = -NEST_BOUND; gx <= NEST_BOUND; gx += 4) {
      for (let gz = -NEST_BOUND; gz <= NEST_BOUND; gz += 4) {
        if (!isNestLand(gx, gz)) continue;
        const d = (gx - preferred.x) ** 2 + (gz - preferred.z) ** 2;
        if (d < bestD) { bestD = d; x = gx; z = gz; }
      }
    }
  }
  const nest = createNestEntity(species);
  addEntity(nest, groundPosition(x, z));
  return nest;
}

function layEgg(parent, nest) {
  if (!nest?.alive || nest.egg) return null;
  const target = groundPosition(nest.object3d.position.x, nest.object3d.position.z);
  const behind = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(parent.object3d.quaternion)
    .multiplyScalar(Math.max(0.5, parent.size * 0.55));
  const start = parent.object3d.position.clone().add(behind);
  start.y += parent.flying ? 0 : Math.max(0.8, parent.size * 0.65);
  // 变体在产蛋时就掷出：蛋壳上的闪斑提前预告（🍀 幸运符让概率翻倍）
  const variant = rollVariant({ lucky: profile.get('unlocks', []).includes('charm.lucky') });
  const egg = createEgg(parent.species, nest, target, variant);
  addEntity(egg, start);
  nest.egg = egg;
  audio.playPlop();
  return egg;
}

function hatchEgg(egg) {
  if (!egg.alive || egg.consumed) return;
  const position = groundPosition(egg.object3d.position.x, egg.object3d.position.z);
  if (egg.nest?.egg === egg) egg.nest.egg = null;
  requestRemove(egg);
  // 硬上限：到顶时蛋安静移除、不出生（不放音效不撒彩纸）
  if (aliveDinoCount() >= quality.dinoCap) return;
  const baby = createDinosaur(egg.species, null, { variant: egg.variant });
  addEntity(baby, position);
  audio.playHatch();
  // 彩纸庆祝 + 新生儿开心一跳；变体多一段变体色的二段环形慢粒子
  particles.burst({ x: position.x, y: position.y + 0.8, z: position.z }, {
    count: 24, colors: ['#ff7d7d', '#ffd166', '#6ec6ff', '#9ef0a0', '#f7a8ff'],
    speed: 2.6, gravity: 4.5, life: 1, size: 0.18,
  });
  if (egg.variant) {
    const v = VARIANTS[egg.variant];
    setTimeout(() => particles.burst({ x: position.x, y: position.y + 1.2, z: position.z }, {
      count: 16, colors: [v.body, v.accent, '#ffffff'],
      speed: 1.2, gravity: -0.6, life: 1.4, size: 0.16,
    }), 350);
  }
  baby.startEmote?.('hatch', ctx);
  bus.emit('hatch', { species: egg.species, variant: egg.variant || null });
}

// 神秘蛋开启：抽物种+变体（含保底）→ 大爆发庆祝 → 孵出宝宝（发现新物种 = 解锁）
function openMysteryEgg(egg) {
  if (!egg.alive) return;
  const { species, variant } = mysteryEggs.roll();
  const position = groundPosition(egg.object3d.position.x, egg.object3d.position.z);
  egg.alive = false;
  requestRemove(egg);
  audio.playHatch();
  particles.burst({ x: position.x, y: position.y + 1, z: position.z }, {
    count: 40, colors: ['#b9a4ff', '#ffd96b', '#fff2c0', '#ff9ec4', '#8be0ff'],
    speed: 3, gravity: 4, life: 1.1, size: 0.2,
  });
  // 硬上限：蛋照样开、烟花照样放，只是不出生（与 hatchEgg 同策略）
  if (aliveDinoCount() >= quality.dinoCap) return;
  const baby = createDinosaur(species, null, { variant });
  addEntity(baby, position);
  const isShiny = SPECIES[species].rarity === 'rare' || variant === 'sparkle';
  if (isShiny) {
    audio.playMagicChord();
    setTimeout(() => particles.burst({ x: position.x, y: position.y + 1.4, z: position.z }, {
      count: 18, colors: ['#ffd96b', '#fff2c0', '#ffffff'],
      speed: 1.1, gravity: -0.5, life: 1.5, size: 0.16,
    }), 400);
  } else {
    audio.playFanfare();
  }
  baby.startEmote?.('hatch', ctx);
  bus.emit('hatch', { species, variant: variant || null, mystery: true });
}

const mysteryEggs = new MysteryEggs({
  terrain,
  spawnEgg: (point) => {
    const egg = createMysteryEgg(openMysteryEgg);
    addEntity(egg, groundPosition(point.x, point.z));
    audio.playSparkle();
    return egg;
  },
});

// 海洋生物：在深水里建一只并入世界（无深水返回 null），数量由 SeaLife 调度器维持
function spawnSeaCreature(kind) {
  const point = deepWaterTarget(terrain);
  const builder = SEA_BUILDERS[kind];
  if (!point || !builder) return null;
  const wrapper = builder();
  const y = SEABED_KINDS.has(kind)
    ? terrain.getHeightAt(point.x, point.z) + 0.05
    : SEA_LEVEL - 0.45;
  addEntity(wrapper, new THREE.Vector3(point.x, y, point.z));
  return wrapper;
}
const seaLife = new SeaLife({ terrain, quality, spawnCreature: spawnSeaCreature });

function spawnPoop(dinosaur) {
  const direction = new THREE.Vector3(0, 0, -1)
    .applyQuaternion(dinosaur.object3d.quaternion)
    .multiplyScalar(Math.max(0.7, dinosaur.size * 0.8));
  const x = dinosaur.object3d.position.x + direction.x;
  const z = dinosaur.object3d.position.z + direction.z;
  addEntity(createPoop(), groundPosition(x, z));
}

function clearEntities() {
  for (const entity of [...entities]) destroyEntity(entity);
  pendingRemovals.clear();
  for (const kind in counts) counts[kind] = 0;
}

function applyWorldPreset(preset) {
  currentPreset = PRESET_ENTITIES[preset] ? preset : 'park';
  clearEntities();
  terrain.generate(currentPreset);
  seaLife?.setPreset(); // 重新探测深水，海洋生物随新地形重新生成
  for (const [kind, x, z] of PRESET_ENTITIES[currentPreset]) {
    placePresetEntity(kind, x, z);
  }
}

// ---------------- 存档（continue 上次的世界） ----------------
let gameStarted = false;

function snapshotWorld() {
  const r = (v) => Math.round(v * 100) / 100;
  const saved = [];
  for (const e of entities) {
    if (!e.alive || e.consumed) continue;
    if (e.isSeaLife) continue; // 环境海洋生物不入档：下次进入世界自动重新生成
    const { x, z } = e.object3d.position;
    if (e.kind === 'tree' || e.kind === 'flower') {
      saved.push({ k: e.kind, x: r(x), z: r(z) });
    } else if (e.isNest) {
      saved.push({ k: 'nest', s: e.species, x: r(x), z: r(z) });
    } else if (e.isDinosaur && e.getSaveState) {
      saved.push(e.getSaveState());
    }
    // 刻意不存：蛋（20-30s 即孵化）和粑粑
  }
  return {
    preset: currentPreset,
    skyIndex: timeOfDay.phaseIndex, // 旧字段保留：向后兼容只读旧档时的映射
    timeOfDay: timeOfDay.serialize(),
    heights: terrain.exportHeights(),
    entities: saved,
  };
}

function saveWorld() {
  if (!gameStarted) return; // 还在开始页：不能覆盖旧档
  serializeWorld(snapshotWorld());
}

function restoreWorld(save) {
  currentPreset = PRESET_ENTITIES[save.preset] ? save.preset : 'park';
  clearEntities();
  terrain.generate(currentPreset); // 兜底：高度数据异常时仍是完整预设地形
  if (save.heights) terrain.applyHeights(save.heights);
  // 时间：新档有 timeOfDay；旧档只有 skyIndex(0白天/1黄昏/2夜晚) → 映射到合理时刻
  if (Number.isFinite(save.timeOfDay)) timeOfDay.restore(save.timeOfDay);
  else timeOfDay.restore(({ 0: 8, 1: 18, 2: 22 })[save.skyIndex] ?? 8);
  sky.snapTo(timeOfDay.hour); // 读档直达，不从白天淡入
  seaLife.setPreset();
  let restoredDinos = aliveDinoCount(); // clearEntities 后应为 0，仍以实际计数为准
  for (const rec of save.entities) {
    if (rec.k === 'tree' || rec.k === 'flower') {
      placePresetEntity(rec.k, rec.x, rec.z);
    } else if (rec.k === 'nest' && SPECIES[rec.s]) {
      createNest(rec.s, { x: rec.x, z: rec.z });
    } else if (rec.k === 'dino' && SPECIES[rec.s]) {
      // 旧档可能超过当前档位的硬上限（如换到 low 档）：只恢复前 N 只
      if (restoredDinos >= quality.dinoCap) continue;
      restoredDinos++;
      addEntity(createDinosaur(rec.s, rec), groundPosition(rec.x, rec.z));
    }
  }
}

// 自动保存：定时 + 切后台 + 关页（pagehide 兼容 iOS Safari，两个都注册）
setInterval(saveWorld, 20000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') saveWorld();
});
window.addEventListener('pagehide', saveWorld);

const hungerBubble = new HungerBubble(); // 点恐龙 → 头顶冒出肚子条（饥饿度）

let lastSculptEmit = -Infinity;
const actions = {
  sculpt: (point, dir) => {
    terrain.sculpt(point, dir);
    audio.playDig(dir);
    if (ctx.time - lastSculptEmit >= 1) { // 持续雕刻每帧触发，事件节流到 ~1 次/秒
      lastSculptEmit = ctx.time;
      bus.emit('sculpt', { dir });
    }
  },
  place: placeEntity,
  pet: (entity) => {
    entity.pet?.(ctx);
    if (entity.isDinosaur && entity.getHunger)
      hungerBubble.show(entity, (e) => e.feed?.(ctx)); // 头顶泡泡，饿了可手动喂
  },
};

// ---------------- 输入 ----------------
const input = new Input({
  dom: stage.renderer.domElement,
  camera: stage.camera,
  controls: stage.controls,
  terrain,
  water,
  tools,
  actions,
  // pointerdown 时构建一次可点目标列表；空中翼龙不可摸，落地夜栖（perched）的可摸醒；
  // 神秘蛋（点一下 = 开启）与海洋生物（点一下 = 可爱反应）也算可点目标
  getPetTargets: () => entities
    .filter((e) => ((e.isDinosaur && (!e.flying || e.perched)) || e.isMysteryEgg || e.isSeaLife) && e.alive && !e.consumed)
    .map((e) => e.object3d),
});

// ---------------- 顶部动作 ----------------
// 相位（白天/黄昏/夜晚）随连续时间在边界处由 TimeOfDay 广播 'skyphase'；
// 这里统一更新 ctx.skyPhase（恐龙睡觉读它）与 BGM 情绪。
bus.on('skyphase', ({ phase }) => {
  ctx.skyPhase = phase;
  audio.setMood(phase);
});

// 世界事件需要夜空时（流星雨/极光）：直接把时间跳到夜里并直达夜空
function ensureNight() {
  if (timeOfDay.getPhase() !== 'night') {
    timeOfDay.setHour(21.5); // 触发 'skyphase' → ctx.skyPhase 同步为 night
    sky.snapTo(timeOfDay.hour);
  }
}

const EVENT_IDS = new Set(['flowerRain', 'meteor', 'aurora', 'volcano']);

// 昼夜切换的 0.4s 全屏暖橙/深蓝闪光（纯装饰，pointer-events:none）
const skyFlash = document.createElement('div');
skyFlash.id = 'sky-flash';
document.body.appendChild(skyFlash);
skyFlash.addEventListener('animationend', () => skyFlash.classList.remove('flash', 'lightning'));

function flashSky(phase) {
  skyFlash.classList.remove('flash', 'lightning');
  skyFlash.classList.toggle('cool', phase === 'night');
  void skyFlash.offsetWidth; // 重启动画
  skyFlash.classList.add('flash');
}

// 雷暴闪电：极短的白色全屏脉冲（装饰、pointer-events:none，不吓人）
bus.on('lightning', () => {
  skyFlash.classList.remove('flash', 'cool');
  skyFlash.classList.add('lightning');
  void skyFlash.offsetWidth;
  skyFlash.classList.add('flash');
});

function onAction(id) {
  if (id === 'daynight') {
    timeOfDay.fastForward(3.5); // 快进时间 +3.5 小时（跨相位时自动广播 'skyphase'）
    flashSky(timeOfDay.getPhase());
    audio.playWhoosh();
  } else if (id === 'rainbow') {
    weather.showRainbow(audio);
  } else if (id === 'whistle') {
    // 吹哨召唤：地面恐龙聚向当前镜头中心，最多的那种叫一声应答
    audio.playWhistle();
    const counts = {};
    for (const e of entities) {
      if (e.isDinosaur && e.alive && !e.consumed && !e.flying && !e.swimming) {
        counts[e.species] = (counts[e.species] || 0) + 1;
      }
    }
    let top = null, max = 0;
    for (const sp in counts) if (counts[sp] > max) { max = counts[sp]; top = sp; }
    if (top) audio.playCry(top);
    const tgt = stage.controls.target;
    ctx.gatherTo = { x: tgt.x, z: tgt.z };
    ctx.gatherUntil = ctx.time + 8;
    bus.emit('whistle', { species: top, count: max });
  } else if (EVENT_IDS.has(id)) {
    worldEvents.trigger(id, audio);
  } else if (id === 'pedia') {
    pedia.toggle();
  } else if (id === 'settings') {
    settings.toggle();
  }
  bus.emit('action', { id });
}

function resetWorld() {
  applyWorldPreset(currentPreset);
  weather.reset(audio);
  worldEvents.reset();
  timeOfDay.restore(8); // 回到早上 8 点（当前非白天则自动广播 'skyphase'）
  sky.snapTo(8);
  saveWorld(); // 重置完成立即覆盖存档
}

const toolbar = new Toolbar({ tools, audio, onAction, onReset: resetWorld });
const pedia = new Pedia({ bus, audio, toolbar });
const settings = new Settings({ audio, quality });
const quests = new Quests({ bus, audio });
const unlocksSys = new Unlocks({ bus, audio });
const tutorial = new Tutorial({ bus, audio, particles, toolbar });
// 解锁（星星里程碑/物种里程碑）→ 魔法面板 + 恐龙抽屉即时刷新
bus.on('unlock', () => {
  toolbar.refreshMagic();
  toolbar.refreshDinos();
});

// ---------------- 开始（解锁声音） ----------------
const splash = document.getElementById('splash');
for (const card of document.querySelectorAll('.preset-card')) {
  card.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.preset-card')) {
      other.classList.toggle('selected', other === card);
    }
    applyWorldPreset(card.dataset.preset);
  });
}
applyWorldPreset(currentPreset);

document.getElementById('lang-btn').addEventListener('click', () => {
  setLang(getLang() === 'zh' ? 'en' : 'zh');
});
onLangChange(() => {
  applyDom(document.body);
  updatePopulationStatus();
});

document.getElementById('start-btn').addEventListener('click', () => {
  clearSave(); // 选预设新开 = 放弃旧档
  applyWorldPreset(currentPreset);
  gameStarted = true;
  saveWorld();
  audio.unlock();
  splash.classList.add('hidden');
  tutorial.maybeStart();
});

// 有存档 → 显示「继续上次的世界」
const continueBtn = document.getElementById('continue-btn');
if (hasSave()) continueBtn.classList.remove('hidden');
continueBtn.addEventListener('click', () => {
  const save = loadSave();
  if (save) restoreWorld(save);
  gameStarted = true;
  audio.unlock();
  splash.classList.add('hidden');
  tutorial.maybeStart();
});

// ---------------- 主循环 ----------------
const ctx = {
  terrain,
  seaLevel: SEA_LEVEL,
  entities,
  audio,
  bus,
  particles,
  skyPhase: 'day',
  hour: 8, // 当前小时，每帧从 timeOfDay 同步（天气调度读它判断清晨/夜晚）
  removeEntity: requestRemove,
  createNest,
  layEgg,
  hatchEgg,
  spawnPoop,
  time: 0,
  gatherTo: null,   // 吹哨集合点 {x,z}（瞬时；恐龙在 gatherUntil 前聚向它）
  gatherUntil: 0,   // 集合截止的 ctx.time
};
const clock = new Clock(timeOfDay); // 左下角卡通时钟（表盘 + 数字）
const frameClock = new THREE.Clock();

// 生态保障：翼龙变多且有深水时，自动游来一只沧龙当天敌（翼龙唯一的天敌）。
// 节流到 ~3s 一次；沧龙的 breach 会捕食低空俯冲的翼龙，配合翼龙繁殖软上限抑制无限增长。
const PTEROSAUR_PRESSURE = 4; // 翼龙达到此数量才召唤天敌
const MOSA_CAP = 1; // 同时最多自动生成的沧龙数
let predatorTimer = 4;
function maintainPredators(dt) {
  predatorTimer -= dt;
  if (predatorTimer > 0) return;
  predatorTimer = 3;
  let pteros = 0;
  let mosas = 0;
  for (const e of entities) {
    if (!e.alive || e.consumed) continue;
    if (e.species === 'pterosaur') pteros++;
    else if (e.species === 'mosasaurus') mosas++;
  }
  if (pteros < PTEROSAUR_PRESSURE || mosas >= MOSA_CAP) return;
  if (aliveDinoCount() >= quality.dinoCap) return;
  const point = deepWaterTarget(terrain);
  if (!point) return; // 没深水：没法游进来
  const w = createDinosaur('mosasaurus');
  addEntity(w, new THREE.Vector3(point.x, SEA_LEVEL, point.z));
  audio.playSplash();
  particles.burst({ x: point.x, y: SEA_LEVEL + 0.2, z: point.z }, {
    count: 16, colors: ['#bfeaff', '#ffffff', '#9fd8f5'], speed: 2.6, gravity: 9, life: 0.6, size: 0.16,
  });
  bus.emit('place', { kind: 'mosasaurus' }); // 标记图鉴「👀 见过沧龙」
}

function loop() {
  // 上下文丢失期间跳过整帧（含渲染），rAF 不断 → restored 后下一帧自动继续
  if (!paused) {
    const dt = Math.min(frameClock.getDelta(), 0.05);
    ctx.time += dt;
    if (gameStarted) timeOfDay.advance(dt); // 开始页期间时间冻结在 8:00
    ctx.hour = timeOfDay.hour;
    input.update();
    water.update(ctx.time);
    sky.update(dt, timeOfDay.hour);
    weather.update(dt, ctx);
    clock.update();
    worldEvents.update(dt);
    if (gameStarted) mysteryEggs.update(dt); // 开始页期间不投放神秘蛋
    if (gameStarted) seaLife.update(dt); // 开始页期间不刷海洋生物
    if (gameStarted) maintainPredators(dt); // 翼龙多了就召唤沧龙天敌
    particles.update(dt);
    for (const e of entities) e.update(dt, ctx);
    flushRemovals();
    hungerBubble.update(stage.camera, stage.renderer.domElement); // 头顶肚子条贴住被点恐龙
    quality.noteFrame(dt); // auto 档持续卡顿 → 静默降级
    stage.updateCamera(dt); // 键盘/边缘平移 + 旋转，须在 render() 里的 controls.update() 之前
    stage.render();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// 调试/测试句柄（无害，方便冒烟测试核对渲染与实体数量）
window.__world = {
  stage,
  terrain,
  entities,
  counts,
  removeEntity: requestRemove,
  createNest,
  layEgg,
  hatchEgg,
  i18n: { t, setLang, getLang },
  codec: { encodeHeightsI16, decodeHeightsI16 },
  saveWorld,
  restoreWorld,
  hasSave,
  bus,
  audio,
  quality,
  settings,
  placeEntity,
  pedia,
  quests,
  tutorial,
  sky,
  weather,
  worldEvents,
  profile,
  unlocksSys,
  mysteryEggs,
  seaLife,
  timeOfDay,
  clock,
  variants: { roll: rollVariant, VARIANTS },
  seaLevel: SEA_LEVEL,
  lastPet: 0, // 调试计数：冒烟测试验证“点恐龙=抚摸”
};
bus.on('pet', () => { window.__world.lastPet++; });

// ---------------- 装配完成：启用开始按钮（开始页本身就是加载屏） ----------------
const startBtn = document.getElementById('start-btn');
startBtn.dataset.i18n = 'splash.start';
startBtn.textContent = t('splash.start');
startBtn.disabled = false;

// ---------------- PWA：手动注册 Service Worker（injectRegister: false） ----------------
// itch.io 沙盒 iframe 里注册可能直接抛 SecurityError，必须静默失败；
// 只在生产构建注册，避免 dev 下 404 噪音
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const registerSW = () => {
    try {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {});
    } catch { /* 沙盒环境：静默放弃离线能力 */ }
  };
  if (document.readyState === 'complete') registerSW();
  else window.addEventListener('load', registerSW);
}
