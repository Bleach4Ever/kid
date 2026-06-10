import * as THREE from 'three';
import { clamp, easeOutBack } from '../utils.js';
import { VARIANTS } from './Variants.js';

export const EGG_STYLES = {
  triceratops: { shell: '#d8f0b3', spot: '#6da55b', pattern: 'horns' },
  brachiosaurus: { shell: '#bfe9df', spot: '#438f82', pattern: 'neck' },
  stegosaurus: { shell: '#ffe0a1', spot: '#d6823d', pattern: 'plates' },
  trex: { shell: '#ffc0aa', spot: '#b94b43', pattern: 'teeth' },
  raptor: { shell: '#dfcbff', spot: '#805bb8', pattern: 'claw' },
  oviraptor: { shell: '#ffe28b', spot: '#df7d37', pattern: 'crest' },
  pterosaur: { shell: '#bfe7ff', spot: '#4d91c0', pattern: 'wings' },
  ankylosaurus: { shell: '#e6e9c2', spot: '#7d9450', pattern: 'plates' },
  parasaurolophus: { shell: '#c9ecf2', spot: '#3f95a8', pattern: 'crest' },
  pachycephalosaurus: { shell: '#f5dcea', spot: '#a8628d', pattern: 'dome' },
  dilophosaurus: { shell: '#d2ecc8', spot: '#4f8c4a', pattern: 'horns' },
  diplodocus: { shell: '#dbe5f7', spot: '#5f7fb8', pattern: 'neck' },
  spinosaurus: { shell: '#cfe3f0', spot: '#3a76a0', pattern: 'plates' },
  therizinosaurus: { shell: '#eef2cf', spot: '#84994f', pattern: 'claw' },
  mosasaurus: { shell: '#c2e2f7', spot: '#3a66a8', pattern: 'wings' },
};
// 星星里程碑（egg.golden）解锁后的华丽蛋配色：金色 / 星斑 / 彩虹斑——纯颜色数据零资产
const FANCY_EGG_STYLES = [
  { shell: '#ffd96b', spots: ['#f5a623'] },
  { shell: '#fff8e1', spots: ['#ffd24a', '#b9a4ff', '#ffd24a', '#ff9ec4'] },
  { shell: '#fdf2ff', spots: ['#ff8fa3', '#ffd166', '#7fd6a4', '#7fb9ff'] },
];
let fancyEggsUnlocked = false;

// Quests 在 egg.golden 解锁后调用：之后 25% 的新蛋随机使用华丽配色
export function setFancyEggs(on) {
  fancyEggsUnlocked = !!on;
}

const nestBaseMat = new THREE.MeshStandardMaterial({
  color: '#a66b3e',
  flatShading: true,
  roughness: 1,
});
const poopMat = new THREE.MeshStandardMaterial({
  color: '#7a4d2b',
  flatShading: true,
  roughness: 1,
});

function makeMat(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.88 });
}

function addEggMark(group, style, mat) {
  if (style.pattern === 'horns' || style.pattern === 'teeth') {
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.28, 5), mat);
      mark.position.set(side * 0.14, 1.02, 0.16);
      mark.rotation.x = Math.PI;
      group.add(mark);
    }
  } else if (style.pattern === 'plates' || style.pattern === 'crest') {
    for (let i = 0; i < 3; i++) {
      const mark = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 4), mat);
      mark.position.set(0, 0.84 + i * 0.12, -0.22 + i * 0.2);
      group.add(mark);
    }
  } else if (style.pattern === 'wings') {
    for (const side of [-1, 1]) {
      const mark = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.38, 3), mat);
      mark.position.set(side * 0.28, 0.67, 0);
      mark.rotation.z = side * Math.PI / 2;
      group.add(mark);
    }
  } else {
    const mark = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.36, 3, 6), mat);
    mark.position.set(0, 0.76, 0.35);
    mark.rotation.x = -0.35;
    group.add(mark);
  }
}

export function createEgg(species, nest = null, dropTarget = null, variant = null) {
  const group = new THREE.Group();
  const style = EGG_STYLES[species] || EGG_STYLES.triceratops;
  const fancy = fancyEggsUnlocked && Math.random() < 0.25
    ? FANCY_EGG_STYLES[(Math.random() * FANCY_EGG_STYLES.length) | 0]
    : null;
  const shellMat = makeMat(fancy ? fancy.shell : style.shell);
  const spotMat = makeMat(fancy ? fancy.spots[0] : style.spot);
  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.48, 2),
    shellMat
  );
  shell.scale.set(0.82, 1.25, 0.82);
  shell.position.y = 0.55;
  shell.castShadow = true;
  group.add(shell);

  for (let i = 0; i < 4; i++) {
    // 彩虹/星斑配色：每颗斑点轮换颜色；普通蛋共用一种斑点材质
    const mat = fancy && fancy.spots.length > 1 ? makeMat(fancy.spots[i % fancy.spots.length]) : spotMat;
    const spot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), mat);
    const angle = (i / 4) * Math.PI * 2;
    spot.position.set(Math.cos(angle) * 0.39, 0.55 + (i % 2) * 0.18, Math.sin(angle) * 0.39);
    group.add(spot);
  }
  addEggMark(group, style, spotMat);

  // 变体蛋的预告：壳顶多一颗变体色的大闪斑（孩子会学会认出“特别的蛋”）
  if (variant && VARIANTS[variant]) {
    const shimmerMat = makeMat(VARIANTS[variant].body);
    if (VARIANTS[variant].emissive) {
      shimmerMat.emissive = new THREE.Color(VARIANTS[variant].emissive);
      shimmerMat.emissiveIntensity = 0.5;
    }
    const shimmer = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), shimmerMat);
    shimmer.position.set(0, 1.08, 0);
    group.add(shimmer);
  }

  const hatchTime = 20 + Math.random() * 10;
  let age = 0;
  let hatchTriggered = false;
  let dropStart = null;
  const wrapper = {
    object3d: group,
    kind: 'egg',
    species,
    nest,
    fancy: !!fancy, // 调试/测试可见：是否华丽配色
    variant, // 孵化时传给 createDinosaur
    isEgg: true,
    alive: true,
    consumed: false,
    update(dt, ctx) {
      age += dt;
      if (dropTarget && age <= 0.8) {
        if (!dropStart) dropStart = group.position.clone();
        const progress = Math.min(1, age / 0.8);
        const eased = 1 - Math.pow(1 - progress, 2);
        group.position.lerpVectors(dropStart, dropTarget, eased);
        group.rotation.x += dt * 5;
      } else if (dropTarget) {
        group.position.copy(dropTarget);
        group.rotation.x = 0;
      }
      const intro = Math.min(1, age / 0.45);
      group.scale.setScalar(Math.max(0.001, easeOutBack(intro)));
      if (age > hatchTime * 0.72) {
        const urgency = (age - hatchTime * 0.72) / (hatchTime * 0.28);
        group.rotation.z = Math.sin(age * (9 + urgency * 8)) * 0.08 * urgency;
      }
      if (age >= hatchTime && !hatchTriggered) {
        hatchTriggered = true;
        ctx.hatchEgg(wrapper);
      }
    },
    consume(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      if (wrapper.nest?.egg === wrapper) wrapper.nest.egg = null;
      let elapsed = 0;
      wrapper.update = (dt) => {
        elapsed += dt;
        const progress = clamp(elapsed / 0.35, 0, 1);
        group.scale.setScalar(1 - progress);
        group.rotation.y += dt * 7;
        if (progress === 1) removeEntity(wrapper);
      };
      return true;
    },
  };
  return wrapper;
}

export function createNest(species) {
  const group = new THREE.Group();
  const style = EGG_STYLES[species] || EGG_STYLES.triceratops;
  const accentMat = makeMat(style.spot);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.9, 5), nestBaseMat);
    stick.position.set(Math.cos(angle) * 0.65, 0.13, Math.sin(angle) * 0.65);
    stick.rotation.z = Math.PI / 2;
    stick.rotation.y = -angle;
    stick.castShadow = true;
    group.add(stick);
  }
  const marker = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.06, 5, 18), accentMat);
  marker.rotation.x = Math.PI / 2;
  marker.position.y = 0.1;
  group.add(marker);

  let age = 0;
  const wrapper = {
    object3d: group,
    kind: 'nest',
    species,
    isNest: true,
    alive: true,
    consumed: false,
    occupiedBy: null,
    egg: null,
    update(dt) {
      age += dt;
      const scale = Math.max(0.001, easeOutBack(Math.min(1, age / 0.55)));
      group.scale.setScalar(scale);
    },
  };
  return wrapper;
}

export function createPoop() {
  const group = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const piece = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.2 - i * 0.035, 1),
      poopMat
    );
    piece.position.set((Math.random() - 0.5) * 0.12, 0.14 + i * 0.22, (Math.random() - 0.5) * 0.12);
    piece.castShadow = true;
    group.add(piece);
  }

  let age = 0;
  const lifetime = 45;
  const wrapper = {
    object3d: group,
    kind: 'poop',
    alive: true,
    consumed: false,
    update(dt, ctx) {
      age += dt;
      const intro = Math.min(1, age / 0.3);
      const fade = age > lifetime - 3 ? Math.max(0, (lifetime - age) / 3) : 1;
      group.scale.setScalar(Math.max(0.001, easeOutBack(intro) * fade));
      if (age >= lifetime) ctx.removeEntity(wrapper);
    },
  };
  return wrapper;
}
