// 小工具函数集合

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const lerp = (a, b, t) => a + (b - a) * t;

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// 带回弹的缓动（用于物体“蹦”出来的生长动画）
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// 可重复随机数（mulberry32）：给同一个种子得到同一串随机
export function makeRng(seed = (Math.random() * 1e9) | 0) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 平滑的二维值噪声，用于让地形/海面更自然
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

export function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const tl = hash2(xi, yi);
  const tr = hash2(xi + 1, yi);
  const bl = hash2(xi, yi + 1);
  const br = hash2(xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return lerp(lerp(tl, tr, u), lerp(bl, br, u), v);
}

export const TAU = Math.PI * 2;
export const rand = (rng, a, b) => a + (b - a) * rng();
