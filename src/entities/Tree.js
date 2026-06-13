import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { easeOutBack } from '../utils.js';

// ---- 归档共享几何（省性能）----
// 模块加载时预建 8 个树归档 + 6 个花归档：每个归档把干/叶（或茎/瓣/芯）的颜色
// 烘焙成顶点色后 merge 成单个 BufferGeometry，createTree/createFlower 随机选档，
// 单 Mesh 共享几何 + 共享材质（实例差异 = 随机 rotation.y + scale）。
// geometry.userData.shared = true：main.js disposeObj 会跳过这些几何的 dispose。

const TRUNK_COLOR = '#a6713f';
const LEAF_COLORS = ['#86d96a', '#6fc95a', '#9ae07f', '#57bf78', '#b6e86a'];
// 花瓣色板：WorldEvents 的 🌸 花瓣雨复用同一组颜色
export const PETAL_COLORS = ['#ff8fb1', '#ffd45e', '#b58cff', '#ff7a7a', '#7ad7ff', '#ff9f5e'];
const CENTER_COLOR = '#ffe27a';
const STEM_COLOR = '#5fb85f';

const treeMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.95,
});
const flowerMat = new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.75,
});

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// 把一个零件几何变换到位 + 颜色烘焙为顶点色（merge 需要全部非索引、属性一致）
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

const translate = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);

function buildTreeArchetype() {
  const parts = [];
  const h = 1.1 + Math.random() * 0.9;
  parts.push(bake(new THREE.CylinderGeometry(0.13, 0.2, h, 6), TRUNK_COLOR, translate(0, h / 2, 0)));
  const leaf = pick(LEAF_COLORS);
  if (Math.random() < 0.5) {
    // 圆圆的阔叶树：1~2 个球冠
    const blobs = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < blobs; i++) {
      const r = 0.9 + Math.random() * 0.5;
      parts.push(bake(
        new THREE.IcosahedronGeometry(r, 1), leaf,
        translate((Math.random() - 0.5) * 0.5, h + 0.4 + i * 0.7, (Math.random() - 0.5) * 0.5)
      ));
    }
  } else {
    // 尖尖的松树：2~3 层圆锥
    const layers = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < layers; i++) {
      parts.push(bake(
        new THREE.ConeGeometry(1.1 - i * 0.28, 1.1, 7), leaf,
        translate(0, h + 0.2 + i * 0.7, 0)
      ));
    }
  }
  return mergeParts(parts);
}

function buildFlowerArchetype(idx) {
  const parts = [];
  const h = 0.5 + Math.random() * 0.5;
  parts.push(bake(new THREE.CylinderGeometry(0.04, 0.05, h, 5), STEM_COLOR, translate(0, h / 2, 0)));
  // 花头整体一个固定俯仰角（原来的随机 rotation.x 烘焙进归档）
  const head = translate(0, h, 0).multiply(new THREE.Matrix4().makeRotationX((Math.random() - 0.5) * 0.5));
  const petalColor = PETAL_COLORS[idx % PETAL_COLORS.length]; // 逐档轮换 → 色板全覆盖
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.5, 1)
    );
    parts.push(bake(new THREE.IcosahedronGeometry(0.16, 0), petalColor, head.clone().multiply(m)));
  }
  parts.push(bake(new THREE.IcosahedronGeometry(0.12, 0), CENTER_COLOR, head.clone()));
  return mergeParts(parts);
}

const TREE_GEOS = Array.from({ length: 8 }, buildTreeArchetype);
const FLOWER_GEOS = Array.from({ length: 6 }, (_, i) => buildFlowerArchetype(i));

// 给任何 object3d 加一个“从地里蹦出来”的生长动画包装。
// bloomAmp>0（花）：长好后据 ctx.bloom 缓动开合（仅缩放，不碰共享材质，保持合批省 draw call）。
function grow(object3d, kind, base = 1, bloomAmp = 0) {
  object3d.scale.setScalar(0.001);
  let t = 0;
  const dur = 0.55;
  let currentScale = 0.001;
  let bloomCur = bloomAmp ? 1 : 0; // 开局晴天，花就是开的
  const wrapper = {
    object3d,
    kind,
    alive: true,
    consumed: false,
    update(dt, ctx) {
      if (t < dur) {
        t = Math.min(dur, t + dt);
        currentScale = Math.max(0.001, easeOutBack(t / dur)) * base;
        object3d.scale.setScalar(currentScale);
        return;
      }
      if (bloomAmp) {
        bloomCur += ((ctx?.bloom ?? 1) - bloomCur) * Math.min(1, dt * 0.5);
        object3d.scale.setScalar(base * (1 + bloomCur * bloomAmp));
      }
    },
    consume(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      let elapsed = 0;
      const startScale = currentScale;
      wrapper.update = (dt) => {
        elapsed += dt;
        const progress = Math.min(1, elapsed / 0.4);
        object3d.scale.setScalar(startScale * (1 - progress));
        object3d.rotation.y += dt * 5;
        if (progress === 1) removeEntity(wrapper);
      };
      return true;
    },
  };
  return wrapper;
}

export function createTree() {
  const mesh = new THREE.Mesh(pick(TREE_GEOS), treeMat);
  mesh.castShadow = true;
  mesh.rotation.y = Math.random() * Math.PI * 2;
  return grow(mesh, 'tree', 0.85 + Math.random() * 0.4);
}

export function createFlower() {
  const mesh = new THREE.Mesh(pick(FLOWER_GEOS), flowerMat);
  mesh.rotation.y = Math.random() * Math.PI * 2;
  return grow(mesh, 'flower', 0.9 + Math.random() * 0.5, 0.28); // 好天气里开放（缩放 +28%）
}
