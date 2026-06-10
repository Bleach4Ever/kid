// 一次性脚本：把站酷快乐体（ZCOOL KuaiLe）子集化成 UI 实际用到的汉字，
// 输出 woff2 提交到 public/fonts/。改了中文文案后重跑一次即可：
//   node scripts/subset-font.mjs
// 源 TTF 不提交仓库：脚本会自动下载到 /tmp（Google Fonts 官方仓库，OFL 协议）。
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TTF_URL = 'https://github.com/google/fonts/raw/main/ofl/zcoolkuaile/ZCOOLKuaiLe-Regular.ttf';
const TTF_CACHE = '/tmp/ZCOOLKuaiLe-Regular.ttf';
const OUT = path.join(root, 'public/fonts/zcool-kuaile-subset.woff2');

// 扫描所有可能含中文 UI 文案的源文件
const SOURCES = [
  'index.html',
  'src/i18n.js',
  'src/main.js',
  'src/constants.js',
  ...['systems', 'ui', 'entities', 'world'].map((d) => `src/${d}`),
];

async function collectText() {
  const { readdir } = await import('node:fs/promises');
  let text = '';
  for (const src of SOURCES) {
    const abs = path.join(root, src);
    if (!existsSync(abs)) continue;
    const files = (await import('node:fs')).statSync(abs).isDirectory()
      ? (await readdir(abs)).map((f) => path.join(abs, f))
      : [abs];
    for (const f of files) {
      if (!/\.(js|html)$/.test(f)) continue;
      let s = await readFile(f, 'utf8');
      // 注释里的汉字不是 UI 文案，剔除后再收集（粗糙但对本仓库够用）
      if (f.endsWith('.js')) s = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      else s = s.replace(/<!--[\s\S]*?-->/g, '');
      text += s;
    }
  }
  return text;
}

const text = await collectText();
// CJK 统一汉字 + 中文标点；拉丁/数字交给 Baloo 2，不重复打包
const chars = new Set([...text].filter((ch) => /[　-〿一-鿿＀-￯]/.test(ch)));
const glyphs = [...chars].sort().join('');
console.log(`found ${chars.size} CJK glyphs:\n${glyphs}`);

if (!existsSync(TTF_CACHE)) {
  console.log('downloading source TTF ...');
  const res = await fetch(TTF_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`download failed: ${res.status}`);
  await writeFile(TTF_CACHE, Buffer.from(await res.arrayBuffer()));
}

const ttf = await readFile(TTF_CACHE);
const woff2 = await subsetFont(ttf, glyphs, { targetFormat: 'woff2' });
await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, woff2);
console.log(`wrote ${OUT} (${(woff2.length / 1024).toFixed(1)} KB)`);
