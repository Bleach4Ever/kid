// localStorage 安全封装：Safari 隐私模式 / 配额超限时静默降级为内存存储

const memory = new Map();

export const storage = {
  get(key) {
    try {
      const v = localStorage.getItem(key);
      if (v !== null) return v;
    } catch (_) { /* 降级 */ }
    return memory.has(key) ? memory.get(key) : null;
  },
  set(key, value) {
    memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch (_) { /* 降级：仅内存 */ }
  },
  remove(key) {
    memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch (_) { /* 降级 */ }
  },
};

// ---------------- 高度图编解码 ----------------
// Float32 高度（米）→ Int16 厘米精度（小端）→ base64。
// 必须分块：String.fromCharCode(...几万个参数) 会超出引擎参数上限爆栈。
const CHUNK = 0x2000;

export function encodeHeightsI16(heights) {
  const buf = new ArrayBuffer(heights.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < heights.length; i++) {
    const cm = Math.round(heights[i] * 100);
    view.setInt16(i * 2, Math.max(-32768, Math.min(32767, cm)), true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function decodeHeightsI16(base64) {
  const binary = atob(base64);
  const buf = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const view = new DataView(buf);
  const heights = new Float32Array(binary.length / 2);
  for (let i = 0; i < heights.length; i++) {
    heights[i] = view.getInt16(i * 2, true) / 100;
  }
  return heights;
}
