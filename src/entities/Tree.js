import * as THREE from 'three';
import { easeOutBack } from '../utils.js';

// ---- 共享材质（控制数量，省性能）----
const trunkMat = new THREE.MeshStandardMaterial({
  color: '#a6713f', flatShading: true, roughness: 1,
});
const leafMats = ['#86d96a', '#6fc95a', '#9ae07f', '#57bf78', '#b6e86a'].map(
  (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 })
);
const petalColors = ['#ff8fb1', '#ffd45e', '#b58cff', '#ff7a7a', '#7ad7ff', '#ff9f5e'];
const petalMats = petalColors.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.7 })
);
const centerMat = new THREE.MeshStandardMaterial({ color: '#ffe27a', flatShading: true });
const stemMat = new THREE.MeshStandardMaterial({ color: '#5fb85f', flatShading: true });

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

// 给任何 group 加一个“从地里蹦出来”的生长动画包装
function grow(group, kind, base = 1) {
  group.scale.setScalar(0.001);
  let t = 0;
  const dur = 0.55;
  let currentScale = 0.001;
  const wrapper = {
    object3d: group,
    kind,
    alive: true,
    consumed: false,
    update(dt) {
      if (t >= dur) return;
      t = Math.min(dur, t + dt);
      currentScale = Math.max(0.001, easeOutBack(t / dur)) * base;
      group.scale.setScalar(currentScale);
    },
    consume(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      let elapsed = 0;
      const startScale = currentScale;
      wrapper.update = (dt) => {
        elapsed += dt;
        const progress = Math.min(1, elapsed / 0.4);
        group.scale.setScalar(startScale * (1 - progress));
        group.rotation.y += dt * 5;
        if (progress === 1) removeEntity(wrapper);
      };
      return true;
    },
  };
  return wrapper;
}

export function createTree() {
  const g = new THREE.Group();
  const h = 1.1 + Math.random() * 0.9;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, h, 6), trunkMat);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  g.add(trunk);

  const mat = pick(leafMats);
  if (Math.random() < 0.5) {
    // 圆圆的阔叶树：1~2 个球冠
    const blobs = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < blobs; i++) {
      const r = 0.9 + Math.random() * 0.5;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      m.position.set((Math.random() - 0.5) * 0.5, h + 0.4 + i * 0.7, (Math.random() - 0.5) * 0.5);
      m.castShadow = true;
      g.add(m);
    }
  } else {
    // 尖尖的松树：2~3 层圆锥
    const layers = 2 + ((Math.random() * 2) | 0);
    for (let i = 0; i < layers; i++) {
      const r = 1.1 - i * 0.28;
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, 1.1, 7), mat);
      m.position.y = h + 0.2 + i * 0.7;
      m.castShadow = true;
      g.add(m);
    }
  }
  g.rotation.y = Math.random() * Math.PI * 2;
  return grow(g, 'tree', 0.85 + Math.random() * 0.4);
}

export function createFlower() {
  const g = new THREE.Group();
  const h = 0.5 + Math.random() * 0.5;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, h, 5), stemMat);
  stem.position.y = h / 2;
  g.add(stem);

  const head = new THREE.Group();
  head.position.y = h;
  const pm = pick(petalMats);
  const petals = 5;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    const petal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), pm);
    petal.position.set(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18);
    petal.scale.y = 0.5;
    head.add(petal);
  }
  const center = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), centerMat);
  head.add(center);
  head.rotation.x = (Math.random() - 0.5) * 0.5;
  g.add(head);

  return grow(g, 'flower', 0.9 + Math.random() * 0.5);
}
