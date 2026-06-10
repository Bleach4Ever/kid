// 颜色/花纹变体（“闪光恐龙”）：纯配色数据零资产，只从蛋里孵出（工具栏放置恒为普通色）。
// sparkle 额外带自发光与金色粒子涓流。变体不影响任何玩法数值，只是收集与炫耀。
export const VARIANTS = {
  twilight: { body: '#8f7bd8', accent: '#ffd9f0' },
  sunny: { body: '#ffc24d', accent: '#fff3bf' },
  berry: { body: '#f178a8', accent: '#ffe1ee' },
  sparkle: { body: '#eef6ff', accent: '#ffd96b', emissive: '#fff2c0', flair: true },
};

const COLOR_KEYS = ['twilight', 'sunny', 'berry'];

// 概率：普通蛋 8% 换色 / 1% sparkle；神秘蛋 24% / 6%；🍀 幸运符（25 星）全部翻倍
export function rollVariant({ mystery = false, lucky = false } = {}) {
  const mult = lucky ? 2 : 1;
  const sparkleP = (mystery ? 0.06 : 0.01) * mult;
  const colorP = (mystery ? 0.24 : 0.08) * mult;
  const r = Math.random();
  if (r < sparkleP) return 'sparkle';
  if (r < sparkleP + colorP) return COLOR_KEYS[(Math.random() * COLOR_KEYS.length) | 0];
  return null;
}
