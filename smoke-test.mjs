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
// 树/花走底栏；恐龙在 🦕 抽屉里：初始 7 个物种走 UI（每次选完抽屉自动收起，要重开）
for (const t of ['tree', 'flower']) {
  await page.locator(`#toolbar .tool-btn[data-tool="${t}"]`).click({ force: true });
  await page.mouse.click(520, 380);
  await page.waitForTimeout(80);
}
// 抽屉初始状态：27 个按钮，3 个起步可选（三角龙/霸王龙/翼龙），24 个锁定（22 里程碑带提示 + 2 神秘蛋隐藏）
await page.locator('#toolbar .tool-btn[data-tool="dinos"]').click({ force: true });
await page.waitForTimeout(350);
const dinoBarState = await page.evaluate(() => {
  const bar = document.getElementById('dino-bar');
  const btns = [...bar.querySelectorAll('.tool-btn')];
  return {
    open: bar.classList.contains('open'),
    total: btns.length,
    locked: btns.filter((b) => b.classList.contains('locked')).length,
    hidden: btns.filter((b) => b.classList.contains('hidden-tool')).length,
    hints: btns.filter((b) => b.querySelector('.lock-hint')).length,
    unlockedIds: btns.filter((b) => !b.classList.contains('locked')).map((b) => b.dataset.tool),
  };
});
for (const t of dinoBarState.unlockedIds) {
  await page.locator('#toolbar .tool-btn[data-tool="dinos"]').click({ force: true });
  await page.waitForTimeout(150);
  await page.locator(`#dino-bar .tool-btn[data-tool="${t}"]`).click({ force: true });
  await page.mouse.click(520, 380);
  await page.evaluate(() => {
    const w = window.__world;
    const last = w.entities[w.entities.length - 1];
    if (last?.isDinosaur && !last.flying && !last.swimming) last.object3d.position.x -= 9;
  });
  await page.waitForTimeout(80);
}
// 锁定物种绕过 UI 直接放置（引擎层不设限，UI 层才是闸门）
await page.evaluate(() => {
  const w = window.__world;
  const locked = ['stegosaurus', 'brachiosaurus', 'raptor', 'oviraptor',
    'ankylosaurus', 'parasaurolophus', 'pachycephalosaurus', 'dilophosaurus',
    'diplodocus', 'spinosaurus', 'therizinosaurus', 'mosasaurus',
    'carnotaurus', 'gallimimus', 'styracosaurus', 'compsognathus',
    'kentrosaurus', 'iguanodon', 'baryonyx', 'protoceratops',
    'pteranodon', 'plesiosaurus', 'amargasaurus', 'pachyrhinosaurus'];
  locked.forEach((s, i) => {
    w.placeEntity({ x: 5, z: 5 }, s);
    const last = w.entities[w.entities.length - 1];
    if (last?.isDinosaur && !last.flying && !last.swimming) {
      last.object3d.position.set(-14 + (i % 4) * 2, 0, -10 + Math.floor(i / 4) * 2);
    }
  });
});
// 点一个锁定按钮：不选中、只抖动
await page.locator('#toolbar .tool-btn[data-tool="dinos"]').click({ force: true });
await page.waitForTimeout(350);
await page.locator('#dino-bar .tool-btn[data-tool="spinosaurus"]').click({ force: true });
const lockedClick = await page.evaluate(() => {
  const b = document.querySelector('#dino-bar .tool-btn[data-tool="spinosaurus"]');
  return { denied: b.classList.contains('deny'), selected: b.classList.contains('selected') };
});
await page.locator('#toolbar .tool-btn[data-tool="dinos"]').click({ force: true }); // 收起抽屉
await page.waitForTimeout(200);
// 冻结生态：15 只挤在角落会互吃；之后的进食测试再精确解锁个别恐龙
await page.evaluate(() => {
  for (const e of window.__world.entities) {
    if (e.isDinosaur) {
      e.hungerTimer = 999;
      e.target = null;
    }
  }
});
// 顶部：⏩ 快进时间，再点 ✨ 打开魔法面板（已去掉手动下雨按钮）
await page.locator('#top-bar .tool-btn').nth(0).click({ force: true }); // ⏩ 快进时间
await page.waitForTimeout(150);
await page.locator('#top-bar .tool-btn').nth(1).click({ force: true }); // ✨ 打开魔法面板
await page.waitForTimeout(150);
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
await page.locator('#top-bar .tool-btn').nth(1).click({ force: true }); // ✨ 收起魔法面板
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
    species: [...new Set(w.entities.filter((e) => e.isDinosaur).map((e) => e.species))],
    pterosaurAlive: w.entities.some((e) => e.species === 'pterosaur' && e.alive),
    raptorAlive: w.entities.some((e) => e.species === 'raptor' && e.alive),
  };
});

// 沧龙：游泳模式 → 放进深水后身体贴着海面沉浮（不会飞上天/站在山上）
const mosasaurState = await page.evaluate(async () => {
  const w = window.__world;
  const mosa = w.entities.find((e) => e.species === 'mosasaurus');
  if (!mosa) return { exists: false };
  let wx = null;
  let wz = null;
  for (let x = -40; x <= 40 && wx === null; x += 2) {
    for (let z = -40; z <= 40; z += 2) {
      if (w.terrain.getHeightAt(x, z) < w.seaLevel - 0.8) { wx = x; wz = z; break; }
    }
  }
  if (wx === null) return { exists: true, water: false };
  mosa.object3d.position.set(wx, 5, wz);
  await new Promise((r) => setTimeout(r, 400));
  return {
    exists: true,
    water: true,
    alive: mosa.alive,
    swimming: mosa.swimming,
    nearSurface: Math.abs(mosa.object3d.position.y - w.seaLevel) < 0.9,
  };
});

await page.screenshot({ path: 'smoke.png' });

// 相机平移：WASD/方向键 + 鼠标边缘自动移动；Q/E 旋转（鼠标拖拽/触摸不受影响）
// 轮询直到效果超过阈值（软件渲染帧率低，避免固定等待的脆弱性）
const readX = () => page.evaluate(() => window.__world.stage.controls.target.x);
const readAz = () => page.evaluate(() => window.__world.stage.controls.getAzimuthalAngle());
async function holdUntil(down, up, read, threshold, timeout = 5000) {
  const before = await read();
  await down();
  const t0 = Date.now();
  let delta = 0;
  while (Date.now() - t0 < timeout) {
    await page.waitForTimeout(120);
    delta = Math.abs((await read()) - before);
    if (delta > threshold) break;
  }
  await up();
  await page.waitForTimeout(60);
  return delta;
}
const keyboardCam = {
  wasdPan: await holdUntil(() => page.keyboard.down('KeyD'), () => page.keyboard.up('KeyD'), readX, 0.5),
  edgePan: await holdUntil(() => page.mouse.move(996, 350), () => page.mouse.move(500, 380), readX, 0.5),
  rot: await holdUntil(() => page.keyboard.down('KeyQ'), () => page.keyboard.up('KeyQ'), readAz, 0.05),
};
console.log('camera move:', {
  wasdPan: keyboardCam.wasdPan.toFixed(2),
  edgePan: keyboardCam.edgePan.toFixed(2),
  rot: keyboardCam.rot.toFixed(3),
});

// 陆生龙不进水：放进岸边浅水会自己爬回陆地（翼龙/沧龙不受影响）
const landEscape = await page.evaluate(() => {
  const w = window.__world;
  let wx = null;
  let wz = null;
  outer:
  for (let x = -40; x <= 40; x += 2) {
    for (let z = -40; z <= 40; z += 2) {
      if (w.terrain.getHeightAt(x, z) >= w.seaLevel) continue;
      for (const [ox, oz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) {
        if (w.terrain.getHeightAt(x + ox, z + oz) > w.seaLevel + 0.3) { wx = x; wz = z; break outer; }
      }
    }
  }
  if (wx === null) return { found: false };
  w.placeEntity({ x: wx, z: wz }, 'triceratops');
  const dino = [...w.entities].reverse().find((e) => e.isDinosaur && e.species === 'triceratops' && !e.swimming);
  dino.object3d.position.set(wx, w.seaLevel, wz);
  window.__escapeId = w.entities.indexOf(dino);
  return { found: true, startUnderwater: w.terrain.getHeightAt(wx, wz) < w.seaLevel };
});
const landEscapeAfter = await page.evaluate(async () => {
  const w = window.__world;
  const dino = w.entities[window.__escapeId];
  if (!dino) return { gone: true };
  const p = dino.object3d.position;
  // 轮询等它爬上岸（爬行是游戏时间；软件渲染帧率低，用真实时间轮询而非固定等待）
  const t0 = performance.now();
  while (performance.now() - t0 < 8000 && w.terrain.getHeightAt(p.x, p.z) < w.seaLevel) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const onLand = w.terrain.getHeightAt(p.x, p.z) >= w.seaLevel;
  const swimming = !!dino.swimming;
  w.removeEntity(dino); // 清理：不影响后续上限计数
  return { onLand, swimming };
});
console.log('land dino escape:', landEscape, '->', landEscapeAfter);

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
  // 新物种也参与存档往返（甲龙走陆地分支、沧龙走游泳分支）
  w.placeEntity({ x: 6, z: -6 }, 'ankylosaurus');
  w.placeEntity({ x: -6, z: 6 }, 'mosasaurus');
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
// 切到夜晚：直接把时间设到夜里（daynight 现在是「快进时间」，不再 3 态循环）
await page.evaluate(() => {
  window.__world.timeOfDay.restore(22);
  window.__world.sky.snapTo(22);
});
await page.waitForTimeout(150);
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
  hungerBubble: !!document.querySelector('.hunger-bubble.show'), // 点恐龙 → 头顶肚子条冒出
  bubblePips: document.querySelectorAll('.hunger-bubble .pip').length,
}));

// ---------------- 翼龙夜栖 + 沧龙天敌（仍在夜晚）----------------
// 放几只翼龙：夜里它们飞向高山/就近降落睡觉（perched）；翼龙变多 + 有深水 → 自动游来沧龙天敌
const roostPredator = await page.evaluate(async () => {
  const w = window.__world;
  const deep = (() => {
    for (let x = -40; x <= 40; x += 2) {
      for (let z = -40; z <= 40; z += 2) {
        if (w.terrain.getHeightAt(x, z) < w.seaLevel - 0.8) return true;
      }
    }
    return false;
  })();
  for (let i = 0; i < 5; i++) w.placeEntity({ x: -8 + i * 3, z: 8 }, 'pterosaur');
  const deadline = Date.now() + 14000;
  let perched = false;
  let mosa = false;
  while (Date.now() < deadline && !(perched && mosa)) {
    await new Promise((r) => setTimeout(r, 150));
    perched = w.entities.some((e) => e.species === 'pterosaur' && e.alive && e.perched);
    mosa = w.entities.some((e) => e.species === 'mosasaurus' && e.alive);
  }
  return { deep, perched, mosa };
});

// ---------------- 阶段 4：恐龙图鉴 ----------------
// 清空图鉴 → 解锁迅猛龙 → 只放一只 → 验证 seen 解锁、红点、吐司、模态、跨 reload/重置持久
await page.evaluate(() => {
  const p = JSON.parse(localStorage.getItem('dino-world:profile'));
  p.pedia = {};
  localStorage.setItem('dino-world:profile', JSON.stringify(p));
});
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(400);
// 迅猛龙现在靠「喂食×3」里程碑解锁：连发 3 次 feed → 应自动解锁（验证新 fed 计数器 + 里程碑端到端）
await page.evaluate(() => {
  for (let i = 0; i < 3; i++) window.__world.bus.emit('feed', { species: 'triceratops' });
});
await page.waitForTimeout(150);
const raptorUnlockedByFeed = await page.evaluate(() =>
  JSON.parse(localStorage.getItem('dino-world:profile')).unlocks.includes('dino.raptor'));
// 预设恐龙挪去角落，确保点击落在地形上
await page.evaluate(() => {
  for (const e of window.__world.entities) {
    if (e.isDinosaur && !e.flying) {
      e.object3d.position.set(-14 + Math.random() * 4, 0, -10 + Math.random() * 4);
    }
  }
});
await page.locator('#toolbar .tool-btn[data-tool="dinos"]').click({ force: true }); // 打开 🦕 抽屉
await page.waitForTimeout(350);
await page.locator('#dino-bar .tool-btn[data-tool="raptor"]').click({ force: true }); // 迅猛龙
await page.mouse.click(520, 380);
await page.waitForTimeout(250);
const pediaUnlock = await page.evaluate(() => ({
  raptorSeen: !!JSON.parse(localStorage.getItem('dino-world:profile')).pedia?.raptor?.seen,
  toastShown: !!document.querySelector('.pedia-toast'),
  badgeOn: document.querySelectorAll('#top-bar .tool-btn')[2].classList.contains('has-badge'),
}));

// 打开 📖：7 张卡片、未解锁卡有剪影 class、红点清除
await page.locator('#top-bar .tool-btn').nth(2).click({ force: true });
await page.waitForTimeout(250);
const pediaModal = await page.evaluate(() => {
  const modal = document.getElementById('pedia-modal');
  return {
    visible: !modal.classList.contains('hidden'),
    cards: modal.querySelectorAll('.pedia-card').length,
    locked: modal.querySelectorAll('.pedia-card.locked').length,
    badgeCleared: !document.querySelectorAll('#top-bar .tool-btn')[2].classList.contains('has-badge'),
    // 收集钩子 UI：稀有度边框 / 三档进度芯片 + 总进度条 / 锁定提示角标 / 变体色点（只有 raptor seen → 4 点）
    rare: modal.querySelectorAll('.pedia-card.rarity-rare').length,
    uncommon: modal.querySelectorAll('.pedia-card.rarity-uncommon').length,
    meterChips: modal.querySelectorAll('.pedia-tier-chip').length,
    progressBar: !!modal.querySelector('.pedia-progress i'),
    hints: modal.querySelectorAll('.pedia-hint').length,
    mysteryCards: modal.querySelectorAll('.pedia-card.mystery').length,
    swatchDots: modal.querySelectorAll('.v-dot').length,
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
await page.locator('#toolbar .tool-btn[data-tool="tree"]').click({ force: true }); // 种树
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

// 新任务模板：开神秘蛋（badge ✨ + mystery 孵化事件完成）
const mysteryQuest = await page.evaluate(() => {
  const w = window.__world;
  const q = w.quests._debugSet('mysteryOpen');
  const badge = !!q.el.querySelector('.q-badge');
  w.bus.emit('hatch', { species: 'trex', mystery: true });
  return { done: q.done, badge };
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
// 25 星 → 🍀 幸运符（变体概率翻倍 + 神秘蛋更勤），不出现在魔法面板
const luckyState = await page.evaluate(() => {
  const w = window.__world;
  const cur = JSON.parse(localStorage.getItem('dino-world:profile')).stars;
  if (cur < 25) w.quests._debugAddStars(25 - cur);
  return { unlocks: JSON.parse(localStorage.getItem('dino-world:profile')).unlocks };
});

// 打开 ✨ → 魔法面板滑出，6 个按钮（🌈🎶🌸🌠🌌🌋）全部可见
await page.locator('#top-bar .tool-btn').nth(1).click({ force: true });
await page.waitForTimeout(350);
const magicPanel = await page.evaluate(() => {
  const bar = document.getElementById('magic-bar');
  return {
    open: bar.classList.contains('open'),
    visibleBtns: [...bar.querySelectorAll('.tool-btn')].filter((b) => !b.classList.contains('locked')).length,
  };
});

// 🌸 花瓣雨：按钮触发 → active；快进结束 → 自动补种，花数增加（nth(2)：🌈🎶 之后）
const flowerBefore = await page.evaluate(() => window.__world.counts.flower || 0);
await page.locator('#magic-bar .tool-btn').nth(2).click({ force: true });
await page.waitForTimeout(200);
const flowerRainActive = await page.evaluate(() => window.__world.worldEvents.active);
const flowerRainEnd = await page.evaluate(() => {
  const w = window.__world;
  w.worldEvents._debugFastForward(13);
  return { active: w.worldEvents.active, flowers: w.counts.flower || 0 };
});

// 🌠 流星雨：白天触发 → 自动切到夜晚（timeOfDay 相位 === 2/night）；快进后结束
const meteorState = await page.evaluate(() => {
  const w = window.__world;
  const skyIdxBefore = w.timeOfDay.phaseIndex;
  w.worldEvents.trigger('meteor');
  const res = { skyIdxBefore, skyIdx: w.timeOfDay.phaseIndex, active: w.worldEvents.active };
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

// ---------------- 物种解锁里程碑 ----------------
// 合成 bus 事件：养大 3 只食草龙 → 甲龙解锁（toast + unlocks + 抽屉刷新）；计数器跨 reload 持久
const unlockBefore = await page.evaluate(() => {
  const w = window.__world;
  const btn = document.querySelector('#dino-bar .tool-btn[data-tool="ankylosaurus"]');
  const wasLocked = btn.classList.contains('locked');
  for (let i = 0; i < 3; i++) w.bus.emit('raised', { species: 'triceratops' });
  const p = JSON.parse(localStorage.getItem('dino-world:profile'));
  return {
    wasLocked,
    nowLocked: btn.classList.contains('locked'),
    unlocks: p.unlocks,
    raisedHerb: p.counters.raisedHerb,
  };
});
await page.reload({ waitUntil: 'networkidle' });
const unlockAfterReload = await page.evaluate(() => ({
  raisedHerb: window.__world.profile.get('counters').raisedHerb,
  ankylosaurusUnlocked: !document.querySelector('#dino-bar .tool-btn[data-tool="ankylosaurus"]').classList.contains('locked'),
  mosasaurusHidden: document.querySelector('#dino-bar .tool-btn[data-tool="mosasaurus"]').classList.contains('hidden-tool'),
}));

// ---------------- 变体（闪光恐龙）----------------
// 读档 vr 恢复 → 产蛋（强制掷出 sparkle）→ 蛋带变体 → 孵出 sparkle 宝宝 → 图鉴盖 🎨 戳
await page.locator('#start-btn').click();
await page.waitForTimeout(400);
const variantState = await page.evaluate(() => {
  const w = window.__world;
  w.restoreWorld({
    preset: 'park',
    skyIndex: 0,
    entities: [{ k: 'dino', s: 'trex', x: 0, z: 0, age: 60, egg: 999, hunger: 999, vr: 'sparkle' }],
  });
  const parent = w.entities.find((e) => e.species === 'trex');
  const restored = { variant: parent.variant, savedVr: parent.getSaveState().vr };
  const nest = w.createNest('trex', { x: 2, z: 2 });
  const orig = Math.random;
  Math.random = () => 0.001; // rollVariant 必出 sparkle
  const egg = w.layEgg(parent, nest);
  Math.random = orig;
  w.hatchEgg(egg);
  const baby = w.entities[w.entities.length - 1];
  return {
    restored,
    eggVariant: egg.variant,
    babyVariant: baby.variant,
    babySavedVr: baby.getSaveState().vr,
    pediaVariantStamp: !!w.profile.get('pedia').trex?.variants?.sparkle,
  };
});

// ---------------- 神秘蛋 + 保底 ----------------
// 投放 → 点击开启 → 0.5s 裂壳 → 孵出 1 只恐龙 + mystery.opened 推进
const mysteryOpen = await page.evaluate(async () => {
  const w = window.__world;
  const egg = w.mysteryEggs._debugSpawn();
  const spawned = !!egg?.isMysteryEgg && egg.alive;
  const openedBefore = w.profile.get('mystery').opened;
  const dinosBefore = w.entities.filter((e) => e.isDinosaur && e.alive).length;
  egg.pet();
  // 裂壳靠每帧累计 dt（开启需 ~0.5s 游戏时间）；用轮询等开启，避免依赖固定帧率
  const deadline = Date.now() + 6000;
  while (egg.alive && Date.now() < deadline) await new Promise((r) => setTimeout(r, 80));
  await new Promise((r) => setTimeout(r, 250)); // 再等一拍让宝宝孵出
  return {
    spawned,
    eggGone: !egg.alive,
    opened: w.profile.get('mystery').opened - openedBefore,
    dinoDelta: w.entities.filter((e) => e.isDinosaur && e.alive).length - dinosBefore,
  };
});

// 保底确定性：只留镰刀龙未孵化、全部变体已收集、pity=2 → 下一抽必出镰刀龙且 pity 归零
const pityState = await page.evaluate(() => {
  const w = window.__world;
  const ids = [...document.querySelectorAll('#dino-bar .tool-btn')].map((b) => b.dataset.tool);
  const pedia = {};
  for (const s of ids) {
    pedia[s] = {
      seen: true, hatched: s !== 'therizinosaurus', raised: false,
      variants: { twilight: true, sunny: true, berry: true, sparkle: true },
    };
  }
  w.profile.set('pedia', pedia);
  w.profile.set('mystery', { opened: 5, pity: 2 });
  const r = w.mysteryEggs.roll();
  const m = w.profile.get('mystery');
  return { species: r.species, opened: m.opened, pity: m.pity };
});

// ---------------- Profile v1 → v2 迁移 ----------------
// 写入带图鉴印章的 v1 档案 → 加载后 counters 慷慨回填（老玩家进度不清零）
await page.evaluate(() => {
  localStorage.setItem('dino-world:profile', JSON.stringify({
    v: 1,
    stars: 4,
    pedia: {
      triceratops: { seen: true, hatched: true, raised: true },
      trex: { seen: true, hatched: true, raised: true },
      raptor: { seen: true, hatched: false, raised: false },
    },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
const migrated = await page.evaluate(() => {
  const w = window.__world;
  return {
    v: w.profile.get('v'),
    ...w.profile.get('counters'),
    pity: w.profile.get('mystery').pity,
    stars: w.profile.get('stars'),
  };
});

// ---------------- 阶段 7：无文字引导 + 按钮类别 ----------------
// 清 localStorage = 新玩家 → 开始 1s 后 #tutorial 出现，第一步光环在造山按钮
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(1400);
const tutStart = await page.evaluate(() => ({
  layerVisible: !!document.getElementById('tutorial'),
  handShown: !!document.querySelector('#tutorial .tut-hand svg, #tutorial .tut-hand'),
  closeBtn: !!document.querySelector('#tutorial .tut-close'),
  mountainGlow: document.querySelector('#toolbar .tool-btn').classList.contains('tut-glow'),
  dataCats: [...document.querySelectorAll('#toolbar .tool-btn')].map((b) => b.dataset.cat),
}));
// 模拟按住拖动造山 → 第一步完成，光环移到种树按钮
await page.mouse.move(500, 380);
await page.mouse.down();
await page.mouse.move(500, 352, { steps: 6 });
await page.waitForTimeout(250);
await page.mouse.up();
await page.waitForTimeout(300);
const tutStep2 = await page.evaluate(() => {
  const btns = document.querySelectorAll('#toolbar .tool-btn');
  return {
    mountainGlow: btns[0].classList.contains('tut-glow'),
    treeGlow: btns[2].classList.contains('tut-glow'),
  };
});
// 后两步直接触发 bus 事件 → 引导收尾：层消失 + profile.tutorial.done
await page.evaluate(() => {
  window.__world.bus.emit('place', { kind: 'tree' });
  window.__world.bus.emit('place', { kind: 'trex' });
});
await page.waitForTimeout(800);
const tutDone = await page.evaluate(() => ({
  layerGone: !document.getElementById('tutorial'),
  profileDone: JSON.parse(localStorage.getItem('dino-world:profile')).tutorial?.done === true,
}));
// reload 后引导不再出现
await page.reload({ waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(1500);
const tutNoRepeat = await page.evaluate(() => !document.getElementById('tutorial'));

// ---------------- 阶段 8：设置面板 + 音量 + 性能分级 ----------------
// ⚙️ 打开设置（top-bar 第 4 个按钮）：2 个滑条 + 2 组选项按钮
await page.locator('#top-bar .tool-btn').nth(3).click({ force: true });
await page.waitForTimeout(250);
const settingsOpen = await page.evaluate(() => ({
  visible: !document.getElementById('settings-modal').classList.contains('hidden'),
  sliders: document.querySelectorAll('#settings-modal input[type="range"]').length,
  optGroups: document.querySelectorAll('#settings-modal .settings-opts').length,
}));

// 两个滑条拉到 0 → unlock 后的 gain 节点应为 0，且写入 profile
const volumeState = await page.evaluate(() => {
  for (const s of document.querySelectorAll('#settings-modal input[type="range"]')) {
    s.value = '0';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const w = window.__world;
  const p = JSON.parse(localStorage.getItem('dino-world:profile'));
  return {
    music: w.audio.musicGain.gain.value,
    sfx: w.audio.sfxGain.gain.value,
    profileMusic: p.musicVol,
    profileSfx: p.sfxVol,
  };
});

// 点「低」画质 → profile.quality='low'，阴影关、像素比 ≤1、雨 drawRange 250、恐龙上限 60
await page.locator('#settings-modal .settings-opts').first().locator('.settings-opt').nth(2).click();
await page.waitForTimeout(200);
const lowQuality = await page.evaluate(() => {
  const w = window.__world;
  return {
    profileQuality: JSON.parse(localStorage.getItem('dino-world:profile')).quality,
    tier: w.quality.tierName,
    shadows: w.stage.renderer.shadowMap.enabled,
    pixelRatio: w.stage.renderer.getPixelRatio(),
    rainDrawRange: w.weather.rainGeo.drawRange.count,
    dinoCap: w.quality.dinoCap,
  };
});
await page.locator('#settings-modal .pedia-close').click();
await page.waitForTimeout(150);
const settingsClosed = await page.evaluate(() =>
  document.getElementById('settings-modal').classList.contains('hidden'));

// 树共享几何：放 10 棵树 → geometry.userData.shared，draw calls 增量宽松 ≤ 12
// 先清掉环境海洋生物并暂停其调度，避免它们的 draw call 污染本次“只测树”的增量
await page.evaluate(() => {
  const w = window.__world;
  for (const e of w.entities) if (e.isSeaLife) w.removeEntity(e);
  if (w.seaLife) w.seaLife.scanTimer = 1e9;
});
await page.waitForTimeout(150); // 让移除生效并渲染一帧
const callsBefore = await page.evaluate(() => window.__world.stage.renderer.info.render.calls);
const treeShared = await page.evaluate(() => {
  const w = window.__world;
  for (let i = 0; i < 10; i++) w.placeEntity({ x: -18 + i * 4, z: 6 }, 'tree');
  const lastTwo = w.entities.slice(-2);
  return lastTwo.every((e) => e.object3d.geometry?.userData.shared === true);
});
await page.waitForTimeout(400);
const callsAfter = await page.evaluate(() => window.__world.stage.renderer.info.render.calls);

// 压测：放恐龙到 cap（low 档 60）→ 第 cap+1 只被拒、实体计数不变、标签抖动
const capTest = await page.evaluate(() => {
  const w = window.__world;
  const alive = () => w.entities.filter((e) => e.isDinosaur && e.alive).length;
  const cap = w.quality.dinoCap;
  let guard = 300;
  while (alive() < cap && guard-- > 0) {
    w.placeEntity({ x: (Math.random() - 0.5) * 30, z: (Math.random() - 0.5) * 30 }, 'triceratops');
  }
  const atCap = alive();
  const entitiesBefore = w.entities.length;
  w.placeEntity({ x: 0, z: 0 }, 'triceratops');
  return {
    cap,
    atCap,
    afterAlive: alive(),
    entitiesUnchanged: w.entities.length === entitiesBefore,
    shake: document.getElementById('population-status').classList.contains('shake'),
    statusText: document.getElementById('population-status').textContent,
  };
});

// 超上限存档恢复：旧档恐龙数 > 当前 dinoCap → 只恢复前 N 只
const capRestore = await page.evaluate(() => {
  const w = window.__world;
  const cap = w.quality.dinoCap;
  const recs = [];
  for (let i = 0; i < cap + 10; i++) {
    recs.push({ k: 'dino', s: 'triceratops', x: (i % 12) * 2 - 11, z: Math.floor(i / 12) * 2 - 11 });
  }
  w.restoreWorld({ preset: 'park', skyIndex: 0, entities: recs });
  return { cap, alive: w.entities.filter((e) => e.isDinosaur && e.alive).length };
});

// 同物种不互吃（不吃自己的孩子）：成年霸王龙 + 霸王龙宝宝 + 迅猛龙宝宝叠在一起
// → 只吃异物种的迅猛龙宝宝，同物种的霸王龙宝宝安然无恙
const noCannibalism = await page.evaluate(async () => {
  const w = window.__world;
  w.restoreWorld({ preset: 'park', skyIndex: 0, entities: [
    { k: 'dino', s: 'trex', x: 0, z: 0, age: 80, egg: 999, hunger: 0 },
    { k: 'dino', s: 'trex', x: 0.3, z: 0, age: 0, egg: 999, hunger: 999 },
    { k: 'dino', s: 'raptor', x: -0.3, z: 0, age: 0, egg: 999, hunger: 999 },
  ] });
  const dinos = w.entities.filter((e) => e.isDinosaur);
  const adult = dinos[0];
  for (const e of dinos) if (e !== adult) e.object3d.position.copy(adult.object3d.position);
  adult.hungerTimer = 0;
  await new Promise((r) => setTimeout(r, 1600));
  return {
    babyTrexAlive: w.entities.some((e) => e.species === 'trex' && e.alive && e.size < 0.9),
    raptorAlive: w.entities.some((e) => e.species === 'raptor' && e.alive),
  };
});

// 巢不筑在水里：用一个水里的偏好点建巢 → 巢最终落在陆地上
const nestLand = await page.evaluate(() => {
  const w = window.__world;
  let wx = null;
  let wz = null;
  for (let x = -40; x <= 40 && wx === null; x += 2) {
    for (let z = -40; z <= 40; z += 2) {
      if (w.terrain.getHeightAt(x, z) < w.seaLevel - 0.8) { wx = x; wz = z; break; }
    }
  }
  if (wx === null) return { found: false };
  const nest = w.createNest('trex', { x: wx, z: wz });
  const p = nest.object3d.position;
  return {
    found: true,
    waterPreferred: w.terrain.getHeightAt(wx, wz) < w.seaLevel,
    nestOnLand: w.terrain.getHeightAt(p.x, p.z) > w.seaLevel,
  };
});

// ---------------- 阶段 9：健壮性 + PWA（刻意制造错误的段落必须放在最后） ----------------
// 此前的完整流程必须零报错；从这里开始的错误是测试自己制造的
const cleanConsoleErrors = consoleErrors.length;
const cleanPageErrors = pageErrors.length;

// 开始按钮：原始 HTML 里静态 disabled +「载入中…」，JS 装配完毕后启用
const startBtnBoundary = await page.evaluate(async () => {
  const raw = await (await fetch(location.href)).text();
  return {
    staticDisabled: /<button id="start-btn"[^>]*\sdisabled[\s>]/.test(raw),
    staticLoading: raw.includes('载入中'),
    enabledNow: !document.getElementById('start-btn').disabled,
  };
});

// PWA：manifest 可访问且字段正确；preview(localhost) 下 SW 注册成功
const pwaState = await page.evaluate(async () => {
  const res = { manifestOk: false, swRegistered: false };
  try {
    const link = document.querySelector('link[rel="manifest"]');
    const m = await (await fetch(link.href)).json();
    res.manifestOk = m.short_name === '恐龙岛 Dino' && m.display === 'fullscreen' && m.icons.length === 3;
  } catch { /* res.manifestOk 保持 false */ }
  try {
    for (let i = 0; i < 20 && !res.swRegistered; i++) {
      res.swRegistered = !!(await navigator.serviceWorker.getRegistration());
      if (!res.swRegistered) await new Promise((r) => setTimeout(r, 250));
    }
  } catch { /* res.swRegistered 保持 false */ }
  return res;
});

// WebGL 上下文丢失 → 「正在恢复…」遮罩 + 主循环暂停；恢复 → 遮罩消失 + 继续渲染
const ctxExtOk = await page.evaluate(() => {
  const w = window.__world;
  w.__loseCtx = w.stage.renderer.getContext().getExtension('WEBGL_lose_context');
  if (!w.__loseCtx) return false;
  localStorage.removeItem('dino-world:save'); // 清掉存档：证明是 lost 回调救回来的
  w.__loseCtx.loseContext();
  return true;
});
await page.waitForTimeout(600);
const ctxLostState = await page.evaluate(() => ({
  overlayVisible: document.getElementById('context-overlay').classList.contains('visible'),
  hasSave: !!localStorage.getItem('dino-world:save'),
}));
await page.evaluate(() => window.__world.__loseCtx.restoreContext());
await page.waitForTimeout(1500);
const ctxRestoredState = await page.evaluate(() => ({
  overlayHidden: !document.getElementById('context-overlay').classList.contains('visible'),
  triangles: window.__world.stage.renderer.info.render.triangles,
}));

// 错误边界：未捕获异常 → 先抢救存档，再显示大「哎呀！」（页面状态从此变脏）
const boundaryErrorsBefore = pageErrors.length;
await page.evaluate(() => {
  localStorage.removeItem('dino-world:save'); // 清掉存档：证明是错误边界救回来的
  setTimeout(() => { throw new Error('test-boundary'); }, 0);
});
await page.waitForTimeout(600);
const boundaryState = await page.evaluate(() => ({
  overlayVisible: document.getElementById('error-overlay').classList.contains('visible'),
  savedByBoundary: !!localStorage.getItem('dino-world:save'),
}));

await browser.close();

console.log('canvas:', `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`);
console.log('splashHidden:', splashHidden);
console.log('bottom tools:', toolCount, ' top buttons:', topCount);
console.log('render triangles:', renderStats.triangles, ' draw calls:', renderStats.calls);
console.log('entities placed:', entityCount);
console.log('herbivore feeding:', herbivoreBefore, '->', herbivoreAfter);
console.log('dinosaur state:', dinosaurState);
console.log('mosasaurus swim:', mosasaurState);
console.log('dino drawer:', dinoBarState);
console.log('locked click denied:', lockedClick);
console.log('species unlock milestone:', unlockBefore, '-> after reload:', unlockAfterReload);
console.log('profile v1->v2 migration:', migrated);
console.log('variant chain:', variantState);
console.log('mystery egg open:', mysteryOpen);
console.log('mystery pity:', pityState);
console.log('i18n switch:', i18nState, ' after reload:', i18nAfterReload);
console.log('heights codec roundtrip ok:', codecOk);
console.log('save before:', beforeSave, ' continue visible:', continueVisible);
console.log('after restore:', afterRestore);
console.log('corrupt save state:', corruptState);
console.log('night sleep:', sleepState);
console.log('pet click:', petTarget.lastPetBefore, '->', petResult);
console.log('pterosaur roost + mosasaurus predator:', roostPredator);
console.log('no cannibalism (same-species safe):', noCannibalism);
console.log('nest on land (not in water):', nestLand);
console.log('pedia unlock:', pediaUnlock);
console.log('pedia modal:', pediaModal);
console.log('pedia close + place:', beforePlaceCount, '->', afterPlaceCount);
console.log('pedia persists reload/reset:', pediaAfterReload, pediaAfterReset);
console.log('quests init:', questInit);
console.log('quest tree x5 done:', questDone);
console.log('star milestone:', milestone);
console.log('mystery quest:', mysteryQuest, ' lucky charm:', luckyState.unlocks.includes('charm.lucky'));
console.log('magic first open:', magicFirstOpen, ' rainbow via panel:', rainbowShown);
console.log('magic setup unlocks:', magicSetup.unlocks);
console.log('magic panel:', magicPanel);
console.log('flower rain:', { activeOnClick: flowerRainActive, flowerBefore }, '->', flowerRainEnd);
console.log('meteor shower:', meteorState);
console.log('aurora:', auroraState);
console.log('volcano:', volcanoState);
console.log('final triangles:', finalTriangles);
console.log('tutorial start:', tutStart);
console.log('tutorial after sculpt:', tutStep2);
console.log('tutorial done:', tutDone, ' no repeat after reload:', tutNoRepeat);
console.log('settings open:', settingsOpen, ' closed again:', settingsClosed);
console.log('volume sliders -> 0:', volumeState);
console.log('quality low:', lowQuality);
console.log('tree shared geometry:', treeShared, ' draw calls:', callsBefore, '->', callsAfter);
console.log('dino cap stress:', capTest);
console.log('cap-aware restore:', capRestore);
console.log('start button boundary:', startBtnBoundary);
console.log('pwa:', pwaState);
console.log('context loss:', { ctxExtOk, ...ctxLostState }, '-> restore:', ctxRestoredState);
console.log('error boundary:', boundaryState);
console.log('console errors:', consoleErrors.length, consoleErrors.slice(0, 8));
console.log('page errors:', pageErrors.length, pageErrors.slice(0, 8));

// 阶段 9 之前的完整流程必须零报错
if (cleanPageErrors || cleanConsoleErrors) {
  console.error('\n❌ SMOKE TEST FAILED (errors before the deliberate-error section)');
  process.exit(1);
}
// 阶段 9 段落的预期噪音：上下文丢失的 CONTEXT_LOST 提示 + 我们自己抛的 test-boundary
const unexpectedConsole = consoleErrors.filter((t) => !/context.?lost|test-boundary/i.test(t));
const unexpectedPage = pageErrors.filter((t) => !/test-boundary/.test(t));
if (unexpectedConsole.length || unexpectedPage.length) {
  console.error('\n❌ unexpected errors during the phase-9 section', { unexpectedConsole, unexpectedPage });
  process.exit(1);
}
if (pageErrors.length - boundaryErrorsBefore !== 1) {
  console.error('\n❌ deliberate throw should surface exactly one pageerror');
  process.exit(1);
}
if (!startBtnBoundary.staticDisabled || !startBtnBoundary.staticLoading || !startBtnBoundary.enabledNow) {
  console.error('\n❌ start button should be statically disabled (载入中…) and enabled by JS');
  process.exit(1);
}
if (!pwaState.manifestOk || !pwaState.swRegistered) {
  console.error('\n❌ PWA manifest/service worker not working on preview');
  process.exit(1);
}
if (!ctxExtOk || !ctxLostState.overlayVisible || !ctxLostState.hasSave) {
  console.error('\n❌ context loss did not save + show the restoring overlay');
  process.exit(1);
}
if (!ctxRestoredState.overlayHidden || ctxRestoredState.triangles < 1000) {
  console.error('\n❌ context restore did not hide overlay / resume rendering');
  process.exit(1);
}
if (!boundaryState.overlayVisible || !boundaryState.savedByBoundary) {
  console.error('\n❌ error boundary did not save the world + show the oops overlay');
  process.exit(1);
}
if (renderStats.triangles < 1000) {
  console.error('\n❌ canvas looks blank (almost no triangles rendered)');
  process.exit(1);
}
if (entityCount < 17 || dinosaurState.species.length < 14) {
  console.error('\n❌ dinosaurs were not placed (15 species expected)');
  process.exit(1);
}
if (!splashHidden || toolCount !== 9 || topCount !== 6) {
  console.error('\n❌ UI not wired correctly');
  process.exit(1);
}
if (!dinoBarState.open || dinoBarState.total !== 27 || dinoBarState.locked !== 24 ||
    dinoBarState.hidden !== 2 || dinoBarState.hints !== 22 || dinoBarState.unlockedIds.length !== 3) {
  console.error('\n❌ dino drawer initial lock state wrong', dinoBarState);
  process.exit(1);
}
if (!lockedClick.denied || lockedClick.selected) {
  console.error('\n❌ locked species button should deny, not select', lockedClick);
  process.exit(1);
}
if (!unlockBefore.wasLocked || unlockBefore.nowLocked ||
    !unlockBefore.unlocks.includes('dino.ankylosaurus') || unlockBefore.raisedHerb < 3) {
  console.error('\n❌ raisedHerb milestone did not unlock ankylosaurus', unlockBefore);
  process.exit(1);
}
if (unlockAfterReload.raisedHerb < 3 || !unlockAfterReload.ankylosaurusUnlocked || !unlockAfterReload.mosasaurusHidden) {
  console.error('\n❌ unlock/counters did not persist across reload', unlockAfterReload);
  process.exit(1);
}
if (!mosasaurState.exists || !mosasaurState.water || !mosasaurState.swimming || !mosasaurState.nearSurface) {
  console.error('\n❌ mosasaurus swimming behavior wrong', mosasaurState);
  process.exit(1);
}
if (migrated.v !== 2 || migrated.hatched !== 2 || migrated.raisedHerb !== 1 || migrated.raisedCarn !== 1 || migrated.stars !== 4) {
  console.error('\n❌ profile v1 → v2 migration backfill wrong', migrated);
  process.exit(1);
}
if (variantState.restored.variant !== 'sparkle' || variantState.restored.savedVr !== 'sparkle' ||
    variantState.eggVariant !== 'sparkle' || variantState.babyVariant !== 'sparkle' ||
    variantState.babySavedVr !== 'sparkle' || !variantState.pediaVariantStamp) {
  console.error('\n❌ variant roll/save/hatch/pedia chain broken', variantState);
  process.exit(1);
}
if (!mysteryOpen.spawned || !mysteryOpen.eggGone || mysteryOpen.opened !== 1 || mysteryOpen.dinoDelta !== 1) {
  console.error('\n❌ mystery egg spawn/open/hatch failed', mysteryOpen);
  process.exit(1);
}
if (pityState.species !== 'therizinosaurus' || pityState.pity !== 0 || pityState.opened !== 6) {
  console.error('\n❌ mystery pity guarantee failed', pityState);
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
if (!petResult.hungerBubble || petResult.bubblePips !== 5) {
  console.error('\n❌ clicking a dinosaur did not show the head-top hunger bubble', petResult);
  process.exit(1);
}
if (!roostPredator.perched) {
  console.error('\n❌ pterosaurs did not roost (land to sleep) at night', roostPredator);
  process.exit(1);
}
if (roostPredator.deep && !roostPredator.mosa) {
  console.error('\n❌ mosasaurus predator did not auto-spawn when pterosaurs grew numerous', roostPredator);
  process.exit(1);
}
if (!noCannibalism.babyTrexAlive || noCannibalism.raptorAlive) {
  console.error('\n❌ carnivore ate its own species (or spared the cross-species prey)', noCannibalism);
  process.exit(1);
}
if (!nestLand.found || !nestLand.waterPreferred || !nestLand.nestOnLand) {
  console.error('\n❌ nest was built in water instead of on land', nestLand);
  process.exit(1);
}
if (!raptorUnlockedByFeed) {
  console.error('\n❌ feeding milestone (fed×3) did not unlock raptor');
  process.exit(1);
}
if (!pediaUnlock.raptorSeen || !pediaUnlock.toastShown || !pediaUnlock.badgeOn) {
  console.error('\n❌ pedia unlock (seen/toast/badge) failed');
  process.exit(1);
}
if (!pediaModal.visible || pediaModal.cards !== 27 || pediaModal.locked !== 26 || !pediaModal.badgeCleared) {
  console.error('\n❌ pedia modal cards/silhouettes/badge state wrong');
  process.exit(1);
}
if (pediaModal.rare !== 3 || pediaModal.uncommon !== 21 || pediaModal.meterChips !== 3 ||
    !pediaModal.progressBar || pediaModal.hints !== 23 || pediaModal.mysteryCards !== 2 ||
    pediaModal.swatchDots !== 4) {
  console.error('\n❌ pedia collection UI (rarity/meter/hints/swatches) wrong', pediaModal);
  process.exit(1);
}
if (!mysteryQuest.done || !mysteryQuest.badge) {
  console.error('\n❌ mysteryOpen quest template did not complete', mysteryQuest);
  process.exit(1);
}
if (!luckyState.unlocks.includes('charm.lucky')) {
  console.error('\n❌ 25-star lucky charm milestone missing', luckyState);
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
if (!magicFirstOpen.open || magicFirstOpen.visibleBtns !== 2 || !rainbowShown) {
  console.error('\n❌ magic panel should start with only 🌈 visible, and panel rainbow click must work');
  process.exit(1);
}
const EVENT_UNLOCKS = ['event.flowerRain', 'event.meteor', 'event.aurora', 'event.volcano'];
if (!EVENT_UNLOCKS.every((id) => magicSetup.unlocks.includes(id))) {
  console.error('\n❌ 20 stars did not unlock all event.* ids');
  process.exit(1);
}
if (!magicPanel.open || magicPanel.visibleBtns !== 6) {
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
const EXPECTED_CATS = ['earth', 'earth', 'plant', 'plant', 'plant', 'special', 'special', 'special', 'herb'];
if (JSON.stringify(tutStart.dataCats) !== JSON.stringify(EXPECTED_CATS)) {
  console.error('\n❌ toolbar data-cat attributes wrong');
  process.exit(1);
}
if (!tutStart.layerVisible || !tutStart.handShown || !tutStart.closeBtn || !tutStart.mountainGlow) {
  console.error('\n❌ tutorial did not start with halo on the mountain button');
  process.exit(1);
}
if (tutStep2.mountainGlow || !tutStep2.treeGlow) {
  console.error('\n❌ tutorial did not advance to the tree step after sculpting');
  process.exit(1);
}
if (!tutDone.layerGone || !tutDone.profileDone) {
  console.error('\n❌ tutorial did not finish / persist tutorial.done');
  process.exit(1);
}
if (!tutNoRepeat) {
  console.error('\n❌ tutorial reappeared after being completed');
  process.exit(1);
}
if (!settingsOpen.visible || settingsOpen.sliders !== 2 || settingsOpen.optGroups !== 3 || !settingsClosed) {
  console.error('\n❌ settings modal did not open/close with sliders and option rows');
  process.exit(1);
}
if (volumeState.music !== 0 || volumeState.sfx !== 0 || volumeState.profileMusic !== 0 || volumeState.profileSfx !== 0) {
  console.error('\n❌ volume sliders at 0 did not zero the gain nodes / persist to profile');
  process.exit(1);
}
if (
  lowQuality.profileQuality !== 'low' || lowQuality.tier !== 'low' || lowQuality.shadows ||
  lowQuality.pixelRatio > 1 || lowQuality.rainDrawRange !== 250 || lowQuality.dinoCap !== 60
) {
  console.error('\n❌ low quality tier did not apply (shadows/pixel ratio/rain/cap)');
  process.exit(1);
}
if (!treeShared || callsAfter - callsBefore > 12) {
  console.error('\n❌ trees are not using shared archetype geometry / draw calls grew too much');
  process.exit(1);
}
if (
  capTest.atCap !== capTest.cap || capTest.afterAlive !== capTest.cap ||
  !capTest.entitiesUnchanged || !capTest.shake || !capTest.statusText.includes('60 / 60')
) {
  console.error('\n❌ dino hard cap did not reject placement at the limit');
  process.exit(1);
}
if (capRestore.alive > capRestore.cap) {
  console.error('\n❌ restoreWorld exceeded the dino hard cap', capRestore);
  process.exit(1);
}
if (keyboardCam.wasdPan < 0.5 || keyboardCam.edgePan < 0.5 || keyboardCam.rot < 0.05) {
  console.error('\n❌ camera move broken (WASD pan / mouse-edge scroll / Q rotate)', keyboardCam);
  process.exit(1);
}
if (!landEscape.found || !landEscape.startUnderwater || !landEscapeAfter.onLand || landEscapeAfter.swimming) {
  console.error('\n❌ land dinosaur did not climb out of the water', { landEscape, landEscapeAfter });
  process.exit(1);
}
console.log('\n✅ SMOKE TEST PASSED');
