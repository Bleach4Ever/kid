// 冒烟测试：用 Playwright 加载页面、点“开始”，检查没有报错、3D 真的渲染出来了。
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173';

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
// 固定中文 locale：保证初始语言为 zh，切到 en 再 reload 才能真正验证持久化
const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, locale: 'zh-CN' });

page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => pageErrors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });

// 画布存在且有尺寸
const canvasBox = await page.locator('#scene').boundingBox();
if (!canvasBox || canvasBox.width < 100) throw new Error('canvas missing / too small');

// 点开始，解锁声音、隐藏 splash
await page.locator('#start-btn').click();
await page.waitForTimeout(400);
const splashHidden = await page.locator('#splash').evaluate((el) => el.classList.contains('hidden'));

// 工具栏按钮数量
const toolCount = await page.locator('#toolbar .tool-btn').count();
const topCount = await page.locator('#top-bar .tool-btn').count();

// 检查 WebGL 真的在画东西：读取渲染器的三角形/绘制统计
const renderStats = await page.evaluate(() => {
  const w = window.__world;
  const info = w.stage.renderer.info.render;
  return { triangles: info.triangles, calls: info.calls };
});

// 模拟在画布中央拖动造山，确认不崩
await page.mouse.move(500, 380);
await page.mouse.down();
await page.mouse.move(500, 360, { steps: 6 });
await page.waitForTimeout(300);
await page.mouse.up();

// 放置植物和全部恐龙（force 跳过被选中按钮的循环动画稳定性等待）
// 阶段 3 起“点到恐龙=抚摸”，先把预设恐龙挪去角落、每次放完恐龙也挪开，
// 保证后续点击落在地形上而不是变成抚摸
await page.evaluate(() => {
  for (const e of window.__world.entities) {
    if (e.isDinosaur && !e.flying) {
      e.object3d.position.set(-14 + Math.random() * 4, 0, -10 + Math.random() * 4);
    }
  }
});
const tools = [
  'mountain', 'ocean', 'tree', 'flower', 'triceratops',
  'brachiosaurus', 'stegosaurus', 'trex', 'raptor', 'oviraptor', 'pterosaur',
];
for (const t of tools.slice(2)) {
  await page.locator('#toolbar .tool-btn').nth(tools.indexOf(t)).click({ force: true });
  await page.mouse.click(520, 380);
  await page.evaluate(() => {
    const w = window.__world;
    const last = w.entities[w.entities.length - 1];
    if (last?.isDinosaur && !last.flying) last.object3d.position.x -= 9;
  });
  await page.waitForTimeout(80);
}
// 顶部：昼夜、下雨、✨（打开魔法面板）
for (let i = 0; i < 3; i++) {
  await page.locator('#top-bar .tool-btn').nth(i).click({ force: true });
  await page.waitForTimeout(150);
}
// 魔法面板里点 🌈 彩虹（始终解锁），再点 ✨ 收起
const magicFirstOpen = await page.evaluate(() => {
  const bar = document.getElementById('magic-bar');
  return {
    open: bar.classList.contains('open'),
    visibleBtns: [...bar.querySelectorAll('.tool-btn')].filter((b) => !b.classList.contains('locked')).length,
  };
});
await page.locator('#magic-bar .tool-btn').nth(0).click({ force: true });
await page.waitForTimeout(150);
const rainbowShown = await page.evaluate(() => window.__world.weather.rainbowT > 0);
await page.locator('#top-bar .tool-btn').nth(2).click({ force: true });
await page.waitForTimeout(600);

// 食草龙会吃掉附近植物、成长，并进入饱腹冷却
const herbivoreBefore = await page.evaluate(() => {
  const w = window.__world;
  const herbivore = w.entities.find((e) => e.species === 'triceratops');
  const plant = w.entities.find((e) => e.kind === 'tree');
  herbivore.object3d.position.copy(plant.object3d.position);
  herbivore.hungerTimer = 0;
  return { size: herbivore.size, plantCount: w.counts.tree };
});
await page.waitForTimeout(1300);
const herbivoreAfter = await page.evaluate(() => {
  const w = window.__world;
  const herbivore = w.entities.find((e) => e.species === 'triceratops');
  return { size: herbivore.size, hunger: herbivore.hungerTimer, plantCount: w.counts.tree };
});

// 霸王龙只捕食更小的地面恐龙；翼龙不会成为目标
await page.evaluate(() => {
  const w = window.__world;
  const trex = w.entities.find((e) => e.species === 'trex');
  const raptor = w.entities.find((e) => e.species === 'raptor');
  raptor.object3d.position.copy(trex.object3d.position);
  trex.hungerTimer = 0;
});
await page.waitForTimeout(1300);

const entityCount = await page.evaluate(() => window.__world.entities.length);
const dinosaurState = await page.evaluate(() => {
  const w = window.__world;
  return {
    species: w.entities.filter((e) => e.isDinosaur).map((e) => e.species),
    pterosaurAlive: w.entities.some((e) => e.species === 'pterosaur' && e.alive),
    raptorAlive: w.entities.some((e) => e.species === 'raptor' && e.alive),
  };
});

await page.screenshot({ path: 'smoke.png' });

// i18n：切到英文 → 工具栏标签/标题立即变化
const i18nState = await page.evaluate(() => {
  window.__world.i18n.setLang('en');
  return {
    firstLabel: document.querySelector('#toolbar .tool-btn .label').textContent,
    title: document.title,
    lang: window.__world.i18n.getLang(),
  };
});

// 高度图编解码：Float32 → Int16 厘米 → base64 往返（厘米精度内一致）
const codecOk = await page.evaluate(() => {
  const { encodeHeightsI16, decodeHeightsI16 } = window.__world.codec;
  const src = new Float32Array(29241);
  for (let i = 0; i < src.length; i++) src[i] = Math.sin(i * 0.37) * 20 - 5;
  const out = decodeHeightsI16(encodeHeightsI16(src));
  if (out.length !== src.length) return false;
  for (let i = 0; i < src.length; i++) {
    if (Math.abs(out[i] - src[i]) > 0.006) return false;
  }
  return true;
});

// reload 后语言持久（localStorage）
await page.reload({ waitUntil: 'networkidle' });
const i18nAfterReload = await page.evaluate(() => ({
  title: document.title,
  lang: window.__world.i18n.getLang(),
  splashTitle: document.querySelector('.splash-card h1').textContent,
}));

// ---------------- 存档：保存 → 刷新 → 继续上次的世界 ----------------
await page.locator('#start-btn').click();
await page.waitForTimeout(500);
const beforeSave = await page.evaluate(() => {
  const w = window.__world;
  for (let i = 0; i < 6; i++) w.terrain.sculpt({ x: 5, z: 5 }, 1);
  // 锁住饥饿计时，避免校验窗口内恐龙互吃导致物种集合抖动
  for (const e of w.entities) {
    if (e.isDinosaur) {
      e.hungerTimer = 999;
      e.target = null;
    }
  }
  w.saveWorld();
  return {
    height: w.terrain.getHeightAt(5, 5),
    species: [...new Set(w.entities.filter((e) => e.isDinosaur).map((e) => e.species))].sort(),
    hasSave: w.hasSave(),
  };
});
await page.reload({ waitUntil: 'networkidle' });
const continueVisible = await page.locator('#continue-btn').isVisible();
await page.locator('#continue-btn').click();
await page.waitForTimeout(300);
const afterRestore = await page.evaluate(() => {
  const w = window.__world;
  return {
    splashHidden: document.getElementById('splash').classList.contains('hidden'),
    height: w.terrain.getHeightAt(5, 5),
    species: [...new Set(w.entities.filter((e) => e.isDinosaur).map((e) => e.species))].sort(),
  };
});

// ---------------- 存档：脏数据 → 静默回到正常开始页 ----------------
await page.reload({ waitUntil: 'networkidle' }); // 回到未开始状态，后续 reload 不再自动存档
await page.evaluate(() => localStorage.setItem('dino-world:save', '{garbage'));
await page.reload({ waitUntil: 'networkidle' });
const corruptState = await page.evaluate(() => ({
  continueHidden: document.getElementById('continue-btn').classList.contains('hidden'),
  splashVisible: !document.getElementById('splash').classList.contains('hidden'),
  hasSave: window.__world.hasSave(),
}));

// ---------------- 阶段 3：夜晚睡觉 + 点击抚摸 ----------------
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(400);
// 切到夜晚（daynight ×2）
for (let i = 0; i < 2; i++) {
  await page.locator('#top-bar .tool-btn').nth(0).click({ force: true });
  await page.waitForTimeout(150);
}
// 锁定饥饿/产蛋计时，让所有地面恐龙安静入睡
await page.evaluate(() => {
  for (const e of window.__world.entities) {
    if (e.isDinosaur) {
      e.hungerTimer = 999;
      e.eggTimer = 999;
      e.target = null;
    }
  }
});
await page.waitForTimeout(700);
const sleepState = await page.evaluate(() => {
  const w = window.__world;
  const ground = w.entities.filter((e) => e.isDinosaur && e.alive && !e.flying);
  return {
    total: ground.length,
    sleeping: ground.filter((e) => e.lifeState === 'sleeping').length,
  };
});

// 把一只睡着的恐龙挪到岛中心，投影到屏幕坐标后点击 → 应记为抚摸
const petTarget = await page.evaluate(() => {
  const w = window.__world;
  const dino = w.entities.find((e) => e.isDinosaur && e.alive && !e.flying);
  dino.object3d.position.set(2, Math.max(0.1, w.terrain.getHeightAt(2, 2)), 2);
  w.__petDino = dino;
  const v = dino.object3d.position.clone();
  v.y += dino.size * 0.7;
  v.project(w.stage.camera);
  const rect = w.stage.renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (v.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-v.y * 0.5 + 0.5) * rect.height,
    lastPetBefore: w.lastPet,
  };
});
await page.waitForTimeout(300); // 等一帧渲染，让挪动后的 matrixWorld 生效再点击
await page.mouse.click(petTarget.x, petTarget.y);
await page.waitForTimeout(250);
const petResult = await page.evaluate(() => ({
  lastPet: window.__world.lastPet,
  petDinoAwake: window.__world.__petDino.lifeState !== 'sleeping',
}));

// ---------------- 阶段 4：恐龙图鉴 ----------------
// 清空图鉴 → 只放一只迅猛龙 → 验证 seen 解锁、红点、吐司、模态、跨 reload/重置持久
await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('dino-world:profile'));
  p.pedia = {};
  localStorage.setItem('dino-world:profile', JSON.stringify(p));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(400);
// 预设恐龙挪去角落，确保点击落在地形上
await page.evaluate(() => {
  for (const e of window.__world.entities) {
    if (e.isDinosaur && !e.flying) {
      e.object3d.position.set(-14 + Math.random() * 4, 0, -10 + Math.random() * 4);
    }
  }
});
await page.locator('#toolbar .tool-btn').nth(8).click({ force: true }); // 迅猛龙
await page.mouse.click(520, 380);
await page.waitForTimeout(250);
const pediaUnlock = await page.evaluate(() => ({
  raptorSeen: !!JSON.parse(localStorage.getItem('dino-world:profile')).pedia?.raptor?.seen,
  toastShown: !!document.querySelector('.pedia-toast'),
  badgeOn: document.querySelectorAll('#top-bar .tool-btn')[3].classList.contains('has-badge'),
}));

// 打开 📖：7 张卡片、未解锁卡有剪影 class、红点清除
await page.locator('#top-bar .tool-btn').nth(3).click({ force: true });
await page.waitForTimeout(250);
const pediaModal = await page.evaluate(() => {
  const modal = document.getElementById('pedia-modal');
  return {
    visible: !modal.classList.contains('hidden'),
    cards: modal.querySelectorAll('.pedia-card').length,
    locked: modal.querySelectorAll('.pedia-card.locked').length,
    badgeCleared: !document.querySelectorAll('#top-bar .tool-btn')[3].classList.contains('has-badge'),
  };
});

// 关闭模态 → 游戏继续：还能正常放置实体
await page.locator('.pedia-close').click();
await page.waitForTimeout(150);
const beforePlaceCount = await page.evaluate(() => {
  for (const e of window.__world.entities) {
    if (e.isDinosaur && !e.flying) {
      e.object3d.position.set(-14 + Math.random() * 4, 0, -10 + Math.random() * 4);
    }
  }
  return {
    modalHidden: document.getElementById('pedia-modal').classList.contains('hidden'),
    entities: window.__world.entities.length,
  };
});
await page.mouse.click(450, 380);
await page.waitForTimeout(200);
const afterPlaceCount = await page.evaluate(() => window.__world.entities.length);

// reload 后解锁持久
await page.reload({ waitUntil: 'networkidle' });
const pediaAfterReload = await page.evaluate(
  () => !!JSON.parse(localStorage.getItem('dino-world:profile')).pedia?.raptor?.seen
);

// 🔄 重置世界后解锁仍在（pedia 在 profile，不随世界存档清除）
await page.locator('#start-btn').click();
await page.waitForTimeout(300);
await page.locator('#top-bar .tool-btn').nth(5).click({ force: true }); // 🔄 重置
await page.waitForTimeout(300);
const pediaAfterReset = await page.evaluate(
  () => !!JSON.parse(localStorage.getItem('dino-world:profile')).pedia?.raptor?.seen
);

// ---------------- 阶段 5：温和任务 + 星星 + 解锁 ----------------
// 会话固定 3 个活跃任务；强制第 0 个换成「种树×5」，种 5 棵 → 完成 + 星数 +1 + 芯片更新
const questInit = await page.evaluate(() => {
  const w = window.__world;
  w.__testQuest = w.quests._debugSet('tree');
  // 锁住饥饿 + 挪去角落，确保点击落在地形上而非抚摸
  for (const e of w.entities) {
    if (e.isDinosaur) {
      e.hungerTimer = 999;
      e.target = null;
      if (!e.flying) e.object3d.position.set(-14 + Math.random() * 4, 0, -10 + Math.random() * 4);
    }
  }
  return {
    active: w.quests.active.length,
    chips: document.querySelectorAll('#quest-panel .quest-chip').length,
    starsBefore: JSON.parse(localStorage.getItem('dino-world:profile')).stars || 0,
  };
});
await page.locator('#toolbar .tool-btn').nth(2).click({ force: true }); // 种树
for (let i = 0; i < 5; i++) {
  await page.mouse.click(430 + i * 24, 380);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(300);
const questDone = await page.evaluate(() => {
  const w = window.__world;
  const stars = JSON.parse(localStorage.getItem('dino-world:profile')).stars;
  return {
    done: w.__testQuest.done,
    dotsOn: w.__testQuest.el.querySelectorAll('.q-dots i.on').length,
    flippedToStar: w.__testQuest.el.querySelector('.q-icon').textContent === '⭐',
    stars,
    chipText: document.getElementById('star-chip').textContent,
  };
});

// 强制星数到 3 → egg.golden 解锁写入 profile.unlocks
const milestone = await page.evaluate(() => {
  const w = window.__world;
  const cur = JSON.parse(localStorage.getItem('dino-world:profile')).stars;
  if (cur < 3) w.quests._debugAddStars(3 - cur);
  const p = JSON.parse(localStorage.getItem('dino-world:profile'));
  return { stars: p.stars, unlocks: p.unlocks };
});

// ---------------- 阶段 6：世界事件 + 魔法面板 ----------------
// 加星到 20 → 全部 event.* 解锁（同时验证 unlock 总线 → 魔法面板刷新）
const magicSetup = await page.evaluate(() => {
  const w = window.__world;
  const cur = JSON.parse(localStorage.getItem('dino-world:profile')).stars;
  if (cur < 20) w.quests._debugAddStars(20 - cur);
  return { unlocks: JSON.parse(localStorage.getItem('dino-world:profile')).unlocks };
});
// 打开 ✨ → 魔法面板滑出，5 个按钮（🌈🌸🌠🌌🌋）全部可见
await page.locator('#top-bar .tool-btn').nth(2).click({ force: true });
await page.waitForTimeout(350);
const magicPanel = await page.evaluate(() => {
  const bar = document.getElementById('magic-bar');
  return {
    open: bar.classList.contains('open'),
    visibleBtns: [...bar.querySelectorAll('.tool-btn')].filter((b) => !b.classList.contains('locked')).length,
  };
});

// 🌸 花瓣雨：按钮触发 → active；快进结束 → 自动补种，花数增加
const flowerBefore = await page.evaluate(() => window.__world.counts.flower || 0);
await page.locator('#magic-bar .tool-btn').nth(1).click({ force: true });
await page.waitForTimeout(200);
const flowerRainActive = await page.evaluate(() => window.__world.worldEvents.active);
const flowerRainEnd = await page.evaluate(() => {
  const w = window.__world;
  w.worldEvents._debugFastForward(13);
  return { active: w.worldEvents.active, flowers: w.counts.flower || 0 };
});

// 🌠 流星雨：白天触发 → 自动切到夜晚（sky.idx === 2）；快进后结束
const meteorState = await page.evaluate(() => {
  const w = window.__world;
  const skyIdxBefore = w.sky.idx;
  w.worldEvents.trigger('meteor');
  const res = { skyIdxBefore, skyIdx: w.sky.idx, active: w.worldEvents.active };
  w.worldEvents._debugFastForward(11);
  res.afterActive = w.worldEvents.active;
  return res;
});

// 🌌 极光：触发 → active；18s 快进后结束
const auroraState = await page.evaluate(() => {
  const w = window.__world;
  w.worldEvents.trigger('aurora');
  const active = w.worldEvents.active;
  w.worldEvents._debugFastForward(19);
  return { active, afterActive: w.worldEvents.active };
});

// 🌋 火山：触发 → 地形最高点升高；结束后相机抖动归零
const volcanoState = await page.evaluate(() => {
  const w = window.__world;
  const maxH = () => {
    const p = w.terrain.pos;
    let m = -Infinity;
    for (let i = 0; i < p.count; i++) m = Math.max(m, p.getY(i));
    return m;
  };
  const before = maxH();
  const camBefore = w.stage.camera.position.clone();
  w.worldEvents.trigger('volcano');
  const active = w.worldEvents.active;
  w.worldEvents._debugFastForward(11);
  return {
    active,
    afterActive: w.worldEvents.active,
    before,
    after: maxH(),
    camDrift: w.stage.camera.position.distanceTo(camBefore),
  };
});

// 事件结束后渲染仍正常
await page.waitForTimeout(400);
const finalTriangles = await page.evaluate(() => window.__world.stage.renderer.info.render.triangles);

await browser.close();

console.log('canvas:', `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`);
console.log('splashHidden:', splashHidden);
console.log('bottom tools:', toolCount, ' top buttons:', topCount);
console.log('render triangles:', renderStats.triangles, ' draw calls:', renderStats.calls);
console.log('entities placed:', entityCount);
console.log('herbivore feeding:', herbivoreBefore, '->', herbivoreAfter);
console.log('dinosaur state:', dinosaurState);
console.log('i18n switch:', i18nState, ' after reload:', i18nAfterReload);
console.log('heights codec roundtrip ok:', codecOk);
console.log('save before:', beforeSave, ' continue visible:', continueVisible);
console.log('after restore:', afterRestore);
console.log('corrupt save state:', corruptState);
console.log('night sleep:', sleepState);
console.log('pet click:', petTarget.lastPetBefore, '->', petResult);
console.log('pedia unlock:', pediaUnlock);
console.log('pedia modal:', pediaModal);
console.log('pedia close + place:', beforePlaceCount, '->', afterPlaceCount);
console.log('pedia persists reload/reset:', pediaAfterReload, pediaAfterReset);
console.log('quests init:', questInit);
console.log('quest tree x5 done:', questDone);
console.log('star milestone:', milestone);
console.log('magic first open:', magicFirstOpen, ' rainbow via panel:', rainbowShown);
console.log('magic setup unlocks:', magicSetup.unlocks);
console.log('magic panel:', magicPanel);
console.log('flower rain:', { activeOnClick: flowerRainActive, flowerBefore }, '->', flowerRainEnd);
console.log('meteor shower:', meteorState);
console.log('aurora:', auroraState);
console.log('volcano:', volcanoState);
console.log('final triangles:', finalTriangles);
console.log('console errors:', consoleErrors.length, consoleErrors.slice(0, 8));
console.log('page errors:', pageErrors.length, pageErrors.slice(0, 8));

if (pageErrors.length || consoleErrors.length) {
  console.error('\n❌ SMOKE TEST FAILED');
  process.exit(1);
}
if (renderStats.triangles < 1000) {
  console.error('\n❌ canvas looks blank (almost no triangles rendered)');
  process.exit(1);
}
if (entityCount < 6) {
  console.error('\n❌ dinosaurs were not placed');
  process.exit(1);
}
if (!splashHidden || toolCount !== 11) {
  console.error('\n❌ UI not wired correctly');
  process.exit(1);
}
if (
  herbivoreAfter.plantCount >= herbivoreBefore.plantCount ||
  herbivoreAfter.size <= herbivoreBefore.size ||
  herbivoreAfter.hunger <= 0
) {
  console.error('\n❌ herbivore feeding/growth failed');
  process.exit(1);
}
if (dinosaurState.raptorAlive || !dinosaurState.pterosaurAlive) {
  console.error('\n❌ carnivore size filtering failed');
  process.exit(1);
}
if (i18nState.firstLabel !== 'Mountain' || i18nState.title !== 'My Little World') {
  console.error('\n❌ i18n language switch failed');
  process.exit(1);
}
if (i18nAfterReload.lang !== 'en' || i18nAfterReload.title !== 'My Little World' || i18nAfterReload.splashTitle !== 'My Little World') {
  console.error('\n❌ i18n language did not persist across reload');
  process.exit(1);
}
if (!codecOk) {
  console.error('\n❌ heightmap Int16 codec roundtrip failed');
  process.exit(1);
}
if (!beforeSave.hasSave || !continueVisible || !afterRestore.splashHidden) {
  console.error('\n❌ save/continue flow failed');
  process.exit(1);
}
if (Math.abs(afterRestore.height - beforeSave.height) > 0.02) {
  console.error('\n❌ restored terrain height mismatch');
  process.exit(1);
}
if (JSON.stringify(afterRestore.species) !== JSON.stringify(beforeSave.species)) {
  console.error('\n❌ restored species set mismatch');
  process.exit(1);
}
if (!corruptState.continueHidden || !corruptState.splashVisible || corruptState.hasSave) {
  console.error('\n❌ corrupt save was not silently discarded');
  process.exit(1);
}
if (sleepState.sleeping === 0 || sleepState.total === 0) {
  console.error('\n❌ no grounded dinosaur fell asleep at night');
  process.exit(1);
}
if (petResult.lastPet <= petTarget.lastPetBefore) {
  console.error('\n❌ clicking a dinosaur did not register a pet');
  process.exit(1);
}
if (!pediaUnlock.raptorSeen || !pediaUnlock.toastShown || !pediaUnlock.badgeOn) {
  console.error('\n❌ pedia unlock (seen/toast/badge) failed');
  process.exit(1);
}
if (!pediaModal.visible || pediaModal.cards !== 7 || pediaModal.locked !== 6 || !pediaModal.badgeCleared) {
  console.error('\n❌ pedia modal cards/silhouettes/badge state wrong');
  process.exit(1);
}
if (!beforePlaceCount.modalHidden || afterPlaceCount <= beforePlaceCount.entities) {
  console.error('\n❌ game did not continue normally after closing pedia');
  process.exit(1);
}
if (!pediaAfterReload || !pediaAfterReset) {
  console.error('\n❌ pedia unlocks did not survive reload / world reset');
  process.exit(1);
}
if (questInit.active !== 3 || questInit.chips !== 3) {
  console.error('\n❌ quest panel should always hold 3 active quests');
  process.exit(1);
}
if (!questDone.done || questDone.dotsOn !== 5 || !questDone.flippedToStar) {
  console.error('\n❌ tree x5 quest did not progress/complete');
  process.exit(1);
}
// 期间可能有其它任务顺带完成，用 >= 判断；芯片文本必须和 profile 星数一致
if (questDone.stars < questInit.starsBefore + 1 || !questDone.chipText.includes(String(questDone.stars))) {
  console.error('\n❌ quest completion did not award star / update star chip');
  process.exit(1);
}
if (milestone.stars < 3 || !milestone.unlocks.includes('egg.golden')) {
  console.error('\n❌ 3-star milestone did not unlock egg.golden in profile.unlocks');
  process.exit(1);
}
if (!magicFirstOpen.open || magicFirstOpen.visibleBtns !== 1 || !rainbowShown) {
  console.error('\n❌ magic panel should start with only 🌈 visible, and panel rainbow click must work');
  process.exit(1);
}
const EVENT_UNLOCKS = ['event.flowerRain', 'event.meteor', 'event.aurora', 'event.volcano'];
if (!EVENT_UNLOCKS.every((id) => magicSetup.unlocks.includes(id))) {
  console.error('\n❌ 20 stars did not unlock all event.* ids');
  process.exit(1);
}
if (!magicPanel.open || magicPanel.visibleBtns !== 5) {
  console.error('\n❌ magic panel should show all 5 buttons after unlocking everything');
  process.exit(1);
}
if (!flowerRainActive || flowerRainEnd.active || flowerRainEnd.flowers <= flowerBefore) {
  console.error('\n❌ flower rain did not run / did not plant bonus flowers');
  process.exit(1);
}
if (meteorState.skyIdx !== 2 || !meteorState.active || meteorState.afterActive) {
  console.error('\n❌ meteor shower did not switch to night / did not run and end');
  process.exit(1);
}
if (!auroraState.active || auroraState.afterActive) {
  console.error('\n❌ aurora did not run / did not end');
  process.exit(1);
}
if (!volcanoState.active || volcanoState.afterActive || volcanoState.after <= volcanoState.before + 0.3) {
  console.error('\n❌ volcano did not raise the terrain peak');
  process.exit(1);
}
if (volcanoState.camDrift > 0.001) {
  console.error('\n❌ camera shake offset was not removed after volcano ended');
  process.exit(1);
}
if (finalTriangles < 1000) {
  console.error('\n❌ rendering broken after world events');
  process.exit(1);
}
console.log('\n✅ SMOKE TEST PASSED');
