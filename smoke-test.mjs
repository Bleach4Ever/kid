// 冒烟测试：用 Playwright 加载页面、点“开始”，检查没有报错、3D 真的渲染出来了。
import { chromium } from 'playwright';

const URL = process.env.URL || 'http://localhost:4173';

const consoleErrors = [];
const pageErrors = [];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });

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
const tools = [
  'mountain', 'ocean', 'tree', 'flower', 'triceratops',
  'brachiosaurus', 'stegosaurus', 'trex', 'raptor', 'oviraptor', 'pterosaur',
];
for (const t of tools.slice(2)) {
  await page.locator('#toolbar .tool-btn').nth(tools.indexOf(t)).click({ force: true });
  await page.mouse.click(520, 380);
  await page.waitForTimeout(80);
}
// 顶部：昼夜、下雨、彩虹
for (let i = 0; i < 3; i++) {
  await page.locator('#top-bar .tool-btn').nth(i).click({ force: true });
  await page.waitForTimeout(150);
}
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

await browser.close();

console.log('canvas:', `${Math.round(canvasBox.width)}x${Math.round(canvasBox.height)}`);
console.log('splashHidden:', splashHidden);
console.log('bottom tools:', toolCount, ' top buttons:', topCount);
console.log('render triangles:', renderStats.triangles, ' draw calls:', renderStats.calls);
console.log('entities placed:', entityCount);
console.log('herbivore feeding:', herbivoreBefore, '->', herbivoreAfter);
console.log('dinosaur state:', dinosaurState);
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
console.log('\n✅ SMOKE TEST PASSED');
