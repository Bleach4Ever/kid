// 仅用于人工目检：白天状态下种点东西，截图看效果
import { chromium } from 'playwright';
const URL = process.env.URL || 'http://localhost:4173';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
await page.goto(URL, { waitUntil: 'networkidle' });
await page.locator('#start-btn').click();
await page.waitForTimeout(300);

const tools = [
  'mountain', 'ocean', 'tree', 'flower', 'triceratops',
  'brachiosaurus', 'stegosaurus', 'trex', 'raptor', 'oviraptor', 'pterosaur',
];
const tool = (id) => page.locator('#toolbar .tool-btn').nth(tools.indexOf(id)).click({ force: true });

// 堆一座山
await tool('mountain');
await page.mouse.move(560, 420); await page.mouse.down();
await page.waitForTimeout(700); await page.mouse.up();

// 种一片树和花
await tool('tree');
for (const [x,y] of [[460,440],[640,440],[500,470],[600,470]]) await page.mouse.click(x,y);
await tool('flower');
for (const [x,y] of [[520,500],[560,500],[600,500],[480,490],[640,490]]) await page.mouse.click(x,y);

// 放一组恐龙
for (const [kind, x, y] of [
  ['triceratops', 455, 445],
  ['brachiosaurus', 635, 440],
  ['stegosaurus', 500, 485],
  ['trex', 610, 475],
  ['raptor', 545, 510],
  ['oviraptor', 580, 510],
  ['pterosaur', 560, 300],
]) {
  await tool(kind);
  await page.mouse.click(x, y);
}
await page.waitForTimeout(1200);
await page.screenshot({ path: 'preview-day.png' });
await browser.close();
console.log('saved preview-day.png');
