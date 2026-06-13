import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { easeOutBack } from '../utils.js';
import { SEA_LEVEL } from '../constants.js';

// 程序化场景静态物件：灌木/仙人掌/石头/蘑菇/芦苇/枯木/水晶/草丛。
// 和 Tree.js 一样：把零件颜色烘焙成顶点色后 merge 成单个共享几何，单 Mesh + 共享材质，
// 实例差异 = 随机 rotation.y + scale；每种预建 3 个归档增加变化。零外部素材，低多边形。

const sceneryMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });

const ROCK = ['#8d8f93', '#9b9488', '#7d8a86', '#a3a09a'];
const BUSH = ['#6fbf63', '#5aa856', '#7fcf6f', '#86d96a'];
const CACTUS = ['#4fa86a', '#3f9a5c', '#5cb877'];
const MUSH_CAP = ['#e0584f', '#d96f3a', '#e07aa0'];
const MUSH_STEM = '#f3ead0';
const REEDS = ['#86a85a', '#9cbf63', '#7a9a52'];
const REED_TIP = '#cdb86a';
const LOG_BARK = '#7a5535';
const LOG_CUT = '#b88a52';
const CRYSTAL = ['#9a7fe0', '#7ad7ff', '#c8a4ff'];
const GRASS = ['#7fc96a', '#6bbf5c', '#9ad97f'];

const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const translate = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const place = (x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z),
  new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry),
  new THREE.Vector3(sx, sy, sz)
);
const tilt = (x, y, z, axis, ang) => new THREE.Matrix4().compose(
  new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(axis, ang), new THREE.Vector3(1, 1, 1)
);
const ZAXIS = new THREE.Vector3(0, 0, 1);

function bake(geo, color, matrix) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (matrix) g.applyMatrix4(matrix);
  const c = new THREE.Color(color);
  const count = g.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

function mergeParts(parts) {
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  merged.userData.shared = true;
  return merged;
}

function partRock() {
  const parts = [];
  const r = 0.4 + Math.random() * 0.3;
  parts.push(bake(new THREE.IcosahedronGeometry(r, 0), pick(ROCK), place(0, r * 0.55, 0, 1, 0.7, 1.1)));
  const n = 1 + ((Math.random() * 2) | 0); // 旁边一两颗小石子
  for (let i = 0; i < n; i++) {
    const rr = 0.12 + Math.random() * 0.16;
    const a = Math.random() * Math.PI * 2, d = r + 0.1 + Math.random() * 0.25;
    parts.push(bake(new THREE.IcosahedronGeometry(rr, 0), pick(ROCK), translate(Math.cos(a) * d, rr * 0.6, Math.sin(a) * d)));
  }
  return parts;
}

function partBush() {
  const parts = [];
  const blobs = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < blobs; i++) {
    const r = 0.3 + Math.random() * 0.25;
    parts.push(bake(new THREE.IcosahedronGeometry(r, 0), pick(BUSH), translate((Math.random() - 0.5) * 0.5, r * 0.7, (Math.random() - 0.5) * 0.5)));
  }
  return parts;
}

function partCactus() {
  const parts = [];
  const c = pick(CACTUS);
  const h = 0.9 + Math.random() * 0.6;
  parts.push(bake(new THREE.CylinderGeometry(0.17, 0.21, h, 7), c, translate(0, h / 2, 0)));
  parts.push(bake(new THREE.SphereGeometry(0.18, 7, 6), c, translate(0, h, 0)));
  const arms = 1 + ((Math.random() * 2) | 0);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const ah = 0.4 + Math.random() * 0.25, ay = h * (0.4 + Math.random() * 0.15), ax = side * 0.28;
    parts.push(bake(new THREE.SphereGeometry(0.12, 6, 5), c, translate(ax * 0.6, ay, 0)));
    parts.push(bake(new THREE.CylinderGeometry(0.1, 0.11, ah, 6), c, translate(ax, ay + ah / 2, 0)));
    parts.push(bake(new THREE.SphereGeometry(0.12, 6, 5), c, translate(ax, ay + ah, 0)));
  }
  return parts;
}

function partMushroom() {
  const parts = [];
  const h = 0.22 + Math.random() * 0.18;
  parts.push(bake(new THREE.CylinderGeometry(0.07, 0.09, h, 6), MUSH_STEM, translate(0, h / 2, 0)));
  const cap = 0.22 + Math.random() * 0.12;
  parts.push(bake(new THREE.SphereGeometry(cap, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), pick(MUSH_CAP), translate(0, h, 0)));
  return parts;
}

function partReeds() {
  const parts = [];
  const n = 4 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const bh = 0.5 + Math.random() * 0.5;
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.18, lean = (Math.random() - 0.5) * 0.3;
    parts.push(bake(new THREE.CylinderGeometry(0.02, 0.035, bh, 4), pick(REEDS), tilt(Math.cos(a) * d, bh / 2, Math.sin(a) * d, ZAXIS, lean)));
    parts.push(bake(new THREE.ConeGeometry(0.05, 0.16, 5), REED_TIP, translate(Math.cos(a) * d, bh + 0.05, Math.sin(a) * d)));
  }
  return parts;
}

function partLog() {
  const parts = [];
  const len = 0.7 + Math.random() * 0.5;
  const lay = tilt(0, 0.18, 0, ZAXIS, Math.PI / 2); // 圆柱横躺（轴转到 X 向）
  parts.push(bake(new THREE.CylinderGeometry(0.18, 0.2, len, 8), LOG_BARK, lay));
  for (const s of [-1, 1]) {
    parts.push(bake(new THREE.CylinderGeometry(0.185, 0.185, 0.02, 8), LOG_CUT, tilt(s * len / 2, 0.18, 0, ZAXIS, Math.PI / 2)));
  }
  return parts;
}

function partCrystal() {
  const parts = [];
  const n = 2 + ((Math.random() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const ch = 0.4 + Math.random() * 0.4;
    const a = Math.random() * Math.PI * 2, d = i === 0 ? 0 : 0.12 + Math.random() * 0.1, lean = (Math.random() - 0.5) * 0.3;
    const axis = new THREE.Vector3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57));
    parts.push(bake(new THREE.ConeGeometry(0.12, ch, 5), pick(CRYSTAL), tilt(Math.cos(a) * d, ch / 2, Math.sin(a) * d, axis, lean)));
  }
  return parts;
}

function partGrass() {
  const parts = [];
  const n = 5 + ((Math.random() * 4) | 0);
  for (let i = 0; i < n; i++) {
    const bh = 0.25 + Math.random() * 0.25;
    const a = Math.random() * Math.PI * 2, d = Math.random() * 0.14, lean = (Math.random() - 0.5) * 0.5;
    parts.push(bake(new THREE.ConeGeometry(0.03, bh, 4), pick(GRASS), tilt(Math.cos(a) * d, bh / 2, Math.sin(a) * d, ZAXIS, lean)));
  }
  return parts;
}

const BUILDERS = {
  rock: partRock, bush: partBush, cactus: partCactus, mushroom: partMushroom,
  reeds: partReeds, log: partLog, crystal: partCrystal, grass: partGrass,
};
export const SCENERY_KINDS = Object.keys(BUILDERS);

// 每种预建 3 个归档（共享几何），createScenery 随机选档
const GEOS = {};
for (const k of SCENERY_KINDS) GEOS[k] = Array.from({ length: 3 }, () => mergeParts(BUILDERS[k]()));

// 「从地里冒出来」的生长动画包装（精简自 Tree.js 的 grow，无 bloom）
function grow(object3d, base) {
  object3d.scale.setScalar(0.001);
  let t = 0, currentScale = 0.001;
  const dur = 0.5;
  const wrapper = {
    object3d,
    kind: 'scenery',
    alive: true,
    consumed: false,
    update(dt) {
      if (t >= dur) return;
      t = Math.min(dur, t + dt);
      currentScale = Math.max(0.001, easeOutBack(t / dur)) * base;
      object3d.scale.setScalar(currentScale);
    },
    consume(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      let elapsed = 0;
      const startScale = currentScale;
      wrapper.update = (dt) => {
        elapsed += dt;
        const p = Math.min(1, elapsed / 0.35);
        object3d.scale.setScalar(startScale * (1 - p));
        object3d.rotation.y += dt * 5;
        if (p === 1) removeEntity(wrapper);
      };
      return true;
    },
  };
  return wrapper;
}

export function createScenery(kind) {
  const k = GEOS[kind] ? kind : 'rock';
  const mesh = new THREE.Mesh(pick(GEOS[k]), sceneryMat);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  mesh.castShadow = true;
  const wrapper = grow(mesh, 0.8 + Math.random() * 0.5);
  wrapper.prop = k; // 存档用：记住具体是哪种景物
  return wrapper;
}

// 按地形选一种合适的景物：水边→芦苇/草丛，高处干燥→仙人掌/石/水晶，平地→混合
export function pickScenery(groundY) {
  const r = Math.random();
  if (groundY < SEA_LEVEL + 0.7) return r < 0.7 ? 'reeds' : 'grass';
  if (groundY > 4.2) return r < 0.45 ? 'cactus' : r < 0.8 ? 'rock' : 'crystal';
  if (r < 0.26) return 'rock';
  if (r < 0.48) return 'bush';
  if (r < 0.64) return 'grass';
  if (r < 0.78) return 'mushroom';
  if (r < 0.9) return 'log';
  return 'crystal';
}
