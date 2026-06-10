// 一次性脚本：把 public/icon.svg 渲染成 PWA 用的 PNG 图标（产物提交进仓库）。
//   node scripts/make-icons.mjs
// 生成：icon-192.png / icon-512.png / icon-512-maskable.png
// maskable 版本按规范把图案缩到 80% 安全区，四周用天空色填充。
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const pub = (name) => fileURLToPath(new URL(`../public/${name}`, import.meta.url));
const svg = await readFile(pub('icon.svg'));

// density 拉高让 256 视box 的 SVG 光栅化到 512+ 再缩放，边缘干净
const render = (size) => sharp(svg, { density: 72 * (size / 256) * 2 }).resize(size, size).png();

await render(192).toFile(pub('icon-192.png'));
await render(512).toFile(pub('icon-512.png'));

// maskable：80% 安全区 = 512 * 0.8 ≈ 410，居中合成到纯色底上
const inner = await render(410).toBuffer();
await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#cdeffb' },
})
  .composite([{ input: inner, left: 51, top: 51 }])
  .png()
  .toFile(pub('icon-512-maskable.png'));

console.log('icons written: icon-192.png / icon-512.png / icon-512-maskable.png');
