import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';
import { clamp, easeOutBack, lerp, TAU } from '../utils.js';
import { VARIANTS } from './Variants.js';

const BOUND = WORLD_SIZE * 0.46;
const eyeMat = new THREE.MeshStandardMaterial({ color: '#30283a', roughness: 0.7 });
const toothMat = new THREE.MeshStandardMaterial({ color: '#fff8df', flatShading: true });
const catchFishMat = new THREE.MeshStandardMaterial({ color: '#ff9e6b', flatShading: true, roughness: 0.7 });
const zzzMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false });
const HEART_COLORS = ['#ff6f9c', '#ff9ec4', '#ffd3e2'];

// rarity：common 初始可用 / uncommon 里程碑解锁 / rare 里程碑或仅神秘蛋；
// 只影响获取渠道与视觉炫耀，不影响任何玩法数值（无竞争设计）
const SPECIES = {
  triceratops: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.45,
    body: '#78c96b', accent: '#d8ef9c', rarity: 'common',
  },
  brachiosaurus: {
    diet: 'herbivore', baseSize: 1.3, speed: 1.05,
    body: '#67b9a6', accent: '#a9e0cc', rarity: 'common',
  },
  stegosaurus: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.25,
    body: '#e4ad59', accent: '#ffdf7e', rarity: 'common',
  },
  trex: {
    diet: 'carnivore', baseSize: 1.2, speed: 1.65,
    body: '#d96b5f', accent: '#ffb07d', rarity: 'common',
  },
  raptor: {
    diet: 'carnivore', baseSize: 0.72, speed: 2.35,
    body: '#9a79d1', accent: '#d2b8ff', rarity: 'common',
  },
  oviraptor: {
    diet: 'egg', baseSize: 0.76, speed: 2.1,
    body: '#e58d45', accent: '#ffe080', rarity: 'common',
  },
  pterosaur: {
    diet: 'none', baseSize: 0.9, speed: 0.65,
    body: '#5ea5d8', accent: '#a8dcf5', flying: true, rarity: 'common',
  },
  ankylosaurus: {
    diet: 'herbivore', baseSize: 1.0, speed: 0.95,
    body: '#8aa45e', accent: '#e0cf8a', rarity: 'uncommon',
  },
  parasaurolophus: {
    diet: 'herbivore', baseSize: 0.95, speed: 1.55,
    body: '#5fb8c9', accent: '#ffd9a0', rarity: 'uncommon',
  },
  pachycephalosaurus: {
    diet: 'herbivore', baseSize: 0.85, speed: 1.8,
    body: '#c98ab0', accent: '#ffe2f0', rarity: 'uncommon',
  },
  dilophosaurus: {
    diet: 'carnivore', baseSize: 0.8, speed: 2.0,
    body: '#6fae6a', accent: '#ff9a62', rarity: 'uncommon',
  },
  diplodocus: {
    diet: 'herbivore', baseSize: 1.25, speed: 1.0,
    body: '#7f9bd1', accent: '#c5daf5', rarity: 'uncommon',
  },
  spinosaurus: {
    diet: 'carnivore', baseSize: 1.25, speed: 1.4,
    body: '#4f8fb8', accent: '#ffcf70', rarity: 'rare',
  },
  therizinosaurus: {
    diet: 'herbivore', baseSize: 1.0, speed: 1.3,
    body: '#9db86a', accent: '#fff3c9', rarity: 'rare',
  },
  mosasaurus: {
    diet: 'none', baseSize: 1.3, speed: 0.85,
    body: '#4d7fd1', accent: '#aee3f5', swimming: true, rarity: 'rare',
  },
};

function material(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.82 });
}

function mesh(geometry, mat, parent, position, scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addEyes(parent, y, z, spread = 0.2, radius = 0.065) {
  for (const side of [-1, 1]) {
    mesh(new THREE.SphereGeometry(radius, 7, 7), eyeMat, parent, [side * spread, y, z]);
  }
}

function addLegs(group, mat, positions, height = 0.7, radius = 0.12) {
  for (const [x, z] of positions) {
    mesh(
      new THREE.CylinderGeometry(radius * 0.8, radius, height, 6),
      mat,
      group,
      [x, height / 2, z]
    );
  }
}

function addTail(group, mat, position, length = 1.25, radius = 0.28) {
  const tail = mesh(new THREE.ConeGeometry(radius, length, 7), mat, group, position);
  tail.rotation.x = -Math.PI / 2;
  return tail;
}

function buildTriceratops(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.7, 1), bodyMat, g, [0, 0.9, 0], [1, 0.72, 1.35]);
  const head = mesh(new THREE.IcosahedronGeometry(0.48, 1), bodyMat, g, [0, 0.92, 0.88], [1, 0.85, 1.05]);
  mesh(new THREE.ConeGeometry(0.66, 0.35, 8), accentMat, g, [0, 1.15, 0.62], [1, 1, 0.7]).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.075, 0.55, 7), toothMat, g, [side * 0.25, 1.15, 1.25]);
    horn.rotation.x = Math.PI / 2;
  }
  const noseHorn = mesh(new THREE.ConeGeometry(0.065, 0.38, 7), toothMat, g, [0, 0.96, 1.38]);
  noseHorn.rotation.x = Math.PI / 2;
  addEyes(head, 0.13, 0.4, 0.22);
  addLegs(g, bodyMat, [[-0.42, -0.48], [0.42, -0.48], [-0.42, 0.5], [0.42, 0.5]]);
  addTail(g, bodyMat, [0, 0.86, -1.2], 1.15, 0.25);
  return { group: g, stepParts: [] };
}

function buildBrachiosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.72, 1), bodyMat, g, [0, 1.1, -0.2], [1, 0.78, 1.45]);
  const neck = mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.35, 7), bodyMat, g, [0, 2.15, 0.55]);
  neck.rotation.x = -0.24;
  const head = mesh(new THREE.IcosahedronGeometry(0.34, 1), accentMat, g, [0, 3.32, 0.84], [0.9, 0.7, 1.15]);
  addEyes(head, 0.08, 0.28, 0.18, 0.055);
  addLegs(g, bodyMat, [[-0.42, -0.62], [0.42, -0.62], [-0.42, 0.42], [0.42, 0.42]], 1.05, 0.15);
  addTail(g, bodyMat, [0, 1.15, -1.55], 1.7, 0.3);
  return { group: g, stepParts: [] };
}

function buildStegosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.72, 1), bodyMat, g, [0, 0.9, -0.05], [1, 0.72, 1.5]);
  const head = mesh(new THREE.IcosahedronGeometry(0.32, 1), bodyMat, g, [0, 0.73, 1.12], [0.9, 0.78, 1.2]);
  addEyes(head, 0.1, 0.29, 0.16, 0.05);
  for (let i = 0; i < 6; i++) {
    const z = -0.85 + i * 0.34;
    const plate = mesh(new THREE.ConeGeometry(0.24, 0.62, 4), accentMat, g, [0, 1.5, z]);
    plate.rotation.y = Math.PI / 4;
  }
  addLegs(g, bodyMat, [[-0.42, -0.52], [0.42, -0.52], [-0.42, 0.55], [0.42, 0.55]], 0.65);
  addTail(g, bodyMat, [0, 0.92, -1.35], 1.35, 0.26);
  return { group: g, stepParts: [] };
}

function buildPredator(bodyMat, accentMat, small) {
  const g = new THREE.Group();
  const bodyY = small ? 0.8 : 1.05;
  mesh(new THREE.IcosahedronGeometry(0.62, 1), bodyMat, g, [0, bodyY, 0], [0.9, 0.72, 1.45]);
  const head = mesh(
    new THREE.IcosahedronGeometry(small ? 0.34 : 0.48, 1),
    bodyMat,
    g,
    [0, bodyY + 0.28, 0.92],
    [1, 0.76, 1.28]
  );
  const jaw = mesh(new THREE.BoxGeometry(small ? 0.42 : 0.58, 0.18, 0.55), accentMat, g, [0, bodyY + 0.12, 1.2]);
  jaw.rotation.x = 0.08;
  addEyes(head, 0.14, small ? 0.28 : 0.4, small ? 0.18 : 0.24);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = mesh(
      new THREE.CylinderGeometry(0.1, 0.14, small ? 0.75 : 0.95, 6),
      bodyMat,
      g,
      [side * 0.34, (small ? 0.75 : 0.95) / 2, -0.1]
    );
    legs.push(leg);
    const arm = mesh(new THREE.CylinderGeometry(0.045, 0.06, small ? 0.38 : 0.3, 5), bodyMat, g, [side * 0.38, bodyY + 0.05, 0.52]);
    arm.rotation.z = side * 0.55;
  }
  addTail(g, bodyMat, [0, bodyY, -1.25], small ? 1.45 : 1.8, small ? 0.22 : 0.3);
  return { group: g, stepParts: legs };
}

function buildPterosaur(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.38, 1), bodyMat, g, [0, 0, 0], [0.9, 0.65, 1.3]);
  const head = mesh(new THREE.IcosahedronGeometry(0.25, 1), bodyMat, g, [0, 0.08, 0.58], [0.85, 0.7, 1.1]);
  const beak = mesh(new THREE.ConeGeometry(0.1, 0.62, 6), accentMat, g, [0, 0.02, 0.98]);
  beak.rotation.x = Math.PI / 2;
  const crest = mesh(new THREE.ConeGeometry(0.16, 0.48, 5), accentMat, g, [0, 0.25, 0.42]);
  crest.rotation.x = -0.55;
  addEyes(head, 0.1, 0.2, 0.14, 0.045);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.ConeGeometry(0.95, 1.7, 3), accentMat, g, [side * 0.75, 0, -0.08]);
    wing.rotation.z = side * Math.PI / 2;
    wing.rotation.y = side * 0.25;
    wings.push(wing);
  }
  addTail(g, bodyMat, [0, 0, -0.76], 0.75, 0.12);
  // 嘴里叼的小鱼：俯冲叼起后、上升途中才显示
  const caught = mesh(new THREE.IcosahedronGeometry(0.12, 1), catchFishMat, g, [0, -0.12, 1.12], [0.7, 0.7, 1.5]);
  caught.visible = false;
  return { group: g, wings, catch: caught, stepParts: [] };
}

function buildOviraptor(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, true);
  const g = model.group;
  const crest = mesh(new THREE.ConeGeometry(0.18, 0.5, 5), accentMat, g, [0, 1.24, 0.86]);
  crest.rotation.x = -0.35;
  const beak = mesh(new THREE.ConeGeometry(0.13, 0.4, 6), accentMat, g, [0, 0.93, 1.38]);
  beak.rotation.x = Math.PI / 2;
  return model;
}

// 甲龙：扁宽身体 + 两排背甲锥刺 + 球形尾锤
function buildAnkylosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.74, 1), bodyMat, g, [0, 0.78, 0], [1.25, 0.6, 1.5]);
  const head = mesh(new THREE.IcosahedronGeometry(0.3, 1), bodyMat, g, [0, 0.7, 1.18], [1, 0.78, 1.1]);
  addEyes(head, 0.1, 0.26, 0.16, 0.05);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const spike = mesh(new THREE.ConeGeometry(0.13, 0.32, 5), accentMat, g, [side * 0.4, 1.12, -0.72 + i * 0.48]);
      spike.rotation.z = side * -0.5;
    }
  }
  addTail(g, bodyMat, [0, 0.72, -1.25], 1.0, 0.18);
  mesh(new THREE.IcosahedronGeometry(0.24, 1), accentMat, g, [0, 0.72, -1.85]);
  addLegs(g, bodyMat, [[-0.52, -0.52], [0.52, -0.52], [-0.52, 0.55], [0.52, 0.55]], 0.5, 0.13);
  return { group: g, stepParts: [] };
}

// 副栉龙：双足身板 + 向后掠的圆柱头冠 + 扁嘴
function buildParasaurolophus(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, true);
  const g = model.group;
  const crest = mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.85, 6), accentMat, g, [0, 1.32, 0.68]);
  crest.rotation.x = -0.95;
  const snout = mesh(new THREE.BoxGeometry(0.3, 0.14, 0.36), accentMat, g, [0, 1.0, 1.32]);
  snout.rotation.x = 0.06;
  return model;
}

// 肿头龙：双足 + 大圆顶头 + 围着后脑的一圈小锥
function buildPachycephalosaurus(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, true);
  const g = model.group;
  mesh(new THREE.SphereGeometry(0.3, 8, 6), accentMat, g, [0, 1.32, 0.82], [1, 0.85, 1]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU;
    const spike = mesh(
      new THREE.ConeGeometry(0.05, 0.16, 5), accentMat, g,
      [Math.cos(a) * 0.28, 1.3, 0.82 + Math.sin(a) * 0.28]
    );
    spike.rotation.x = Math.sin(a) * 1.1;
    spike.rotation.z = -Math.cos(a) * 1.1;
  }
  return model;
}

// 双冠龙：小型猎手 + 头顶两片立起的半圆冠
function buildDilophosaurus(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, true);
  const g = model.group;
  for (const side of [-1, 1]) {
    const crest = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 8), accentMat, g, [side * 0.09, 1.34, 0.92]);
    crest.rotation.z = Math.PI / 2;
    crest.scale.set(1, 1, 1.35);
  }
  return model;
}

// 梁龙：近水平前伸的长颈（区别腕龙的竖颈）+ 两段鞭状长尾
function buildDiplodocus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.68, 1), bodyMat, g, [0, 1.0, -0.1], [1, 0.72, 1.5]);
  const neck = mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.9, 7), bodyMat, g, [0, 1.32, 1.05]);
  neck.rotation.x = Math.PI / 2 - 0.35;
  const head = mesh(new THREE.IcosahedronGeometry(0.24, 1), accentMat, g, [0, 1.64, 1.95], [0.85, 0.7, 1.2]);
  addEyes(head, 0.07, 0.2, 0.13, 0.045);
  addLegs(g, bodyMat, [[-0.4, -0.6], [0.4, -0.6], [-0.4, 0.45], [0.4, 0.45]], 0.85, 0.13);
  addTail(g, bodyMat, [0, 1.0, -1.5], 1.5, 0.24);
  addTail(g, bodyMat, [0, 1.0, -2.6], 1.2, 0.09);
  return { group: g, stepParts: [] };
}

// 棘龙：大型猎手 + 5 片扁锥背帆 + 鳄鱼长吻
function buildSpinosaurus(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, false);
  const g = model.group;
  for (let i = 0; i < 5; i++) {
    const h = 0.5 + Math.sin((i / 4) * Math.PI) * 0.38;
    mesh(new THREE.ConeGeometry(0.17, h, 4), accentMat, g, [0, 1.42 + h * 0.32, -0.78 + i * 0.36], [0.4, 1, 1]);
  }
  const snout = mesh(new THREE.BoxGeometry(0.28, 0.18, 0.66), bodyMat, g, [0, 1.34, 1.5]);
  snout.rotation.x = 0.05;
  return model;
}

// 镰刀龙：圆滚滚的浅色绒毛肚 + 每只手臂 3 根下垂长爪
function buildTherizinosaurus(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, true);
  const g = model.group;
  mesh(new THREE.IcosahedronGeometry(0.42, 1), accentMat, g, [0, 0.78, 0.3], [0.85, 0.72, 0.9]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const claw = mesh(new THREE.ConeGeometry(0.035, 0.42, 5), toothMat, g, [side * (0.32 + i * 0.08), 0.62, 0.68]);
      claw.rotation.x = Math.PI;
    }
  }
  return model;
}

// 沧龙：鱼雷形身体 + 四鳍 + 竖立尾鳍，swimming 运动模式（不长腿）
function buildMosasaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.62, 1), bodyMat, g, [0, 0.55, 0], [0.85, 0.7, 1.9]);
  const head = mesh(new THREE.IcosahedronGeometry(0.34, 1), bodyMat, g, [0, 0.6, 1.2], [0.8, 0.65, 1.3]);
  const jaw = mesh(new THREE.BoxGeometry(0.34, 0.14, 0.5), accentMat, g, [0, 0.45, 1.42]);
  jaw.rotation.x = 0.06;
  addEyes(head, 0.12, 0.3, 0.18, 0.05);
  const flippers = [];
  for (const side of [-1, 1]) {
    for (const z of [0.55, -0.45]) {
      const flipper = mesh(new THREE.ConeGeometry(0.16, 0.55, 4), accentMat, g, [side * 0.52, 0.4, z]);
      flipper.rotation.z = side * (Math.PI / 2 + 0.35);
      flippers.push(flipper);
    }
  }
  addTail(g, bodyMat, [0, 0.55, -1.35], 1.1, 0.22);
  const fluke = mesh(new THREE.ConeGeometry(0.34, 0.55, 3), accentMat, g, [0, 0.74, -1.92], [0.3, 1, 1]);
  fluke.rotation.x = -0.5;
  return { group: g, flippers, stepParts: [] };
}

function addAlertMarker(group) {
  const marker = new THREE.Group();
  const yellow = new THREE.MeshBasicMaterial({ color: '#ffe34f', depthTest: false });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.13), yellow);
  bar.position.y = 0.25;
  marker.add(bar);
  const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), yellow);
  dot.position.y = -0.13;
  marker.add(dot);
  marker.position.set(0, 3.1, 0);
  marker.visible = false;
  marker.renderOrder = 20;
  group.add(marker);
  return marker;
}

// 睡觉时 3 个小白球循环飘升的 💤 标记
function addSleepMarker(group) {
  const marker = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07 + i * 0.02, 1), zzzMat);
    marker.add(ball);
  }
  marker.position.set(0.35, 2.3, 0.5);
  marker.visible = false;
  marker.renderOrder = 20;
  group.add(marker);
  return marker;
}

function buildModel(species, config, variant) {
  // 变体只换配色（sparkle 额外自发光），几何完全复用
  const v = variant ? VARIANTS[variant] : null;
  const bodyMat = material(v ? v.body : config.body);
  const accentMat = material(v ? v.accent : config.accent);
  if (v?.emissive) {
    bodyMat.emissive = new THREE.Color(v.emissive);
    bodyMat.emissiveIntensity = 0.35;
    accentMat.emissive = new THREE.Color(v.emissive);
    accentMat.emissiveIntensity = 0.25;
  }
  if (species === 'triceratops') return buildTriceratops(bodyMat, accentMat);
  if (species === 'brachiosaurus') return buildBrachiosaurus(bodyMat, accentMat);
  if (species === 'stegosaurus') return buildStegosaurus(bodyMat, accentMat);
  if (species === 'trex') return buildPredator(bodyMat, accentMat, false);
  if (species === 'raptor') return buildPredator(bodyMat, accentMat, true);
  if (species === 'oviraptor') return buildOviraptor(bodyMat, accentMat);
  if (species === 'ankylosaurus') return buildAnkylosaurus(bodyMat, accentMat);
  if (species === 'parasaurolophus') return buildParasaurolophus(bodyMat, accentMat);
  if (species === 'pachycephalosaurus') return buildPachycephalosaurus(bodyMat, accentMat);
  if (species === 'dilophosaurus') return buildDilophosaurus(bodyMat, accentMat);
  if (species === 'diplodocus') return buildDiplodocus(bodyMat, accentMat);
  if (species === 'spinosaurus') return buildSpinosaurus(bodyMat, accentMat);
  if (species === 'therizinosaurus') return buildTherizinosaurus(bodyMat, accentMat);
  if (species === 'mosasaurus') return buildMosasaurus(bodyMat, accentMat);
  return buildPterosaur(bodyMat, accentMat);
}

function diskTarget(radius = BOUND) {
  const angle = Math.random() * TAU;
  const distance = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
}

function nearestFood(self, entities) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (entity === self || !entity.alive || entity.consumed) continue;
    if (self.diet === 'herbivore' && entity.kind !== 'tree' && entity.kind !== 'flower') continue;
    if (self.diet === 'carnivore') {
      // 飞行/游泳的恐龙不在地面猎手的菜单上
      if (!entity.isDinosaur || entity.flying || entity.swimming || entity.size >= self.size * 0.8) continue;
    }
    if (self.diet === 'egg' && !entity.isEgg) continue;
    if (self.diet === 'none') continue;
    const distance = self.object3d.position.distanceToSquared(entity.object3d.position);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

// 离某点最近的活鱼（翼龙/沧龙捕食用）
function nearestFishTo(pos, entities, maxDist) {
  let best = null;
  let bestDistance = maxDist * maxDist;
  for (const entity of entities) {
    if (!entity.isFish || !entity.alive || entity.consumed) continue;
    const distance = pos.distanceToSquared(entity.object3d.position);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestNest(self, entities) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (
      !entity.isNest ||
      !entity.alive ||
      entity.species !== self.species ||
      entity.egg ||
      (entity.occupiedBy && entity.occupiedBy !== self)
    ) continue;
    const distance = self.object3d.position.distanceToSquared(entity.object3d.position);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

export function createDinosaur(species, saved = null, opts = {}) {
  const config = SPECIES[species] || SPECIES.triceratops;
  // 变体：新孵化走 opts.variant，读档走 saved.vr（旧档无此字段 → 普通色）
  const variant = opts.variant || saved?.vr || null;
  const variantCfg = variant ? VARIANTS[variant] : null;
  const model = buildModel(species, config, variant);
  const group = model.group;
  const alertMarker = addAlertMarker(group);
  const sleepMarker = addSleepMarker(group);
  const wrapper = {
    object3d: group,
    kind: species,
    species,
    diet: config.diet,
    isDinosaur: true,
    flying: Boolean(config.flying),
    swimming: Boolean(config.swimming),
    variant,
    alive: true,
    consumed: false,
    size: config.baseSize * 0.65,
    hungerTimer: config.diet === 'none'
      ? Infinity
      : Number.isFinite(saved?.hunger) ? saved.hunger : 3 + Math.random() * 5,
    target: null,
    // 必须恢复 eggTimer，否则读档后全体恐龙同时产蛋
    eggTimer: Number.isFinite(saved?.egg) ? saved.egg : 35 + Math.random() * 25,
    mealsEaten: 0,
    lifeState: 'wandering',
    nestTarget: null,
    diving: false, // 翼龙正在低空俯冲捕鱼（供沧龙判定是否跃出捕食）
  };

  let age = Number.isFinite(saved?.age) ? saved.age : 0;
  let foodGrowth = Number.isFinite(saved?.fg) ? saved.fg : 0;
  // 读档恢复的成年恐龙直接以接近全尺寸出现，不从零长大
  let visualScale = saved ? config.baseSize * growthFactor() * 0.9 : 0.001;
  let wanderTarget = diskTarget();
  let retargetTimer = 0;
  let walkTime = Math.random() * TAU;
  let flightAngle = Math.random() * TAU;
  let layingTime = 0;
  const flightRadius = 8 + Math.random() * 13;
  const flightHeight = 6 + Math.random() * 5;
  // 翼龙捕鱼状态机：soaring 盘旋 / diving 俯冲扎水 / rising 叼鱼爬升
  let flyState = 'soaring';
  let huntCooldown = 2 + Math.random() * 4; // 开局较快就去捕一次鱼，让玩家尽早看到
  let diveT = 0;
  let diveDur = 1;
  let caughtFish = false;
  let preyFish = null;
  const diveFrom = new THREE.Vector3();
  const diveTo = new THREE.Vector3();
  // 沧龙跃出捕食状态：扑咬正在低空俯冲的翼龙 + 顺便吃鱼
  let breaching = false;
  let breachT = 0;
  let breachDur = 1.3;
  let breachHeight = 4;
  let breachCaught = false;
  let breachPrey = null;
  let breachCooldown = 5 + Math.random() * 4;
  let fishEatCooldown = Math.random() * 3;
  const breachFrom = new THREE.Vector3();
  const breachApex = new THREE.Vector3();
  let wakeTimer = 0; // 被摸醒后多久内不再入睡
  let sparkleTimer = 1 + Math.random() * 2; // sparkle 变体的金色粒子涓流节拍
  let callTimer = 10 + Math.random() * 15;
  let nodTime = 0;
  let emoteTime = -1;
  let raisedEmitted = age >= 60; // 读档的成年龙不再重复发 raised

  function growthFactor() {
    return Math.max(0.65, lerp(0.65, 1, Math.min(1, age / 60)) + foodGrowth);
  }

  // 在 (cx,cz) 周围找一块陆地（高于海平面）。最多采样 8 次；周围全是水就退回中心点，绝不返回水点。
  function landSpotNear(terrain, cx, cz, radius) {
    for (let i = 0; i < 8; i++) {
      const offset = diskTarget(radius);
      const x = clamp(cx + offset.x, -BOUND, BOUND);
      const z = clamp(cz + offset.z, -BOUND, BOUND);
      if (terrain.getHeightAt(x, z) > SEA_LEVEL + 0.15) return { x, z };
    }
    return { x: cx, z: cz };
  }

  function chooseLandTarget(ctx) {
    // 结伴：35% 概率去同物种伙伴附近 → 自然成群
    if (Math.random() < 0.35) {
      const friends = ctx.entities.filter((e) =>
        e !== wrapper && e.isDinosaur && e.alive && !e.consumed && !e.flying && e.species === species
      );
      if (friends.length) {
        const buddy = friends[(Math.random() * friends.length) | 0];
        const offset = diskTarget(3);
        const x = clamp(buddy.object3d.position.x + offset.x, -BOUND, BOUND);
        const z = clamp(buddy.object3d.position.z + offset.z, -BOUND, BOUND);
        if (ctx.terrain.getHeightAt(x, z) > SEA_LEVEL + 0.15) return { x, z };
      }
    }
    for (let i = 0; i < 8; i++) {
      const candidate = diskTarget();
      if (ctx.terrain.getHeightAt(candidate.x, candidate.z) > SEA_LEVEL + 0.15) return candidate;
    }
    return { x: group.position.x, z: group.position.z }; // 全是水 → 原地不动，绝不走进水里
  }

  // 沧龙的游走目标：优先找深水点；整张图没水就退化为陆地慢速漫步（无害）
  function chooseWaterTarget(ctx) {
    for (let i = 0; i < 8; i++) {
      const candidate = diskTarget(BOUND * 0.7);
      if (ctx.terrain.getHeightAt(candidate.x, candidate.z) < SEA_LEVEL - 0.6) return candidate;
    }
    return null;
  }

  function moveToward(target, dt, terrain, speedMultiplier = 1, allowWater = false) {
    const p = group.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const distance = Math.hypot(dx, dz);
    wrapper._waterBlocked = false;
    if (distance > 0.05) {
      const vx = dx / distance;
      const vz = dz / distance;
      const nx = p.x + vx * config.speed * speedMultiplier * dt;
      const nz = p.z + vz * config.speed * speedMultiplier * dt;
      // 陆生龙不踏入水里：下一步若落进水面就停在岸边并标记，由调用方转身重选目标
      if (!allowWater && terrain.getHeightAt(nx, nz) < SEA_LEVEL + 0.15) {
        wrapper._waterBlocked = true;
        group.rotation.y = Math.atan2(vx, vz); // 仍朝向目标，避免原地抖动
      } else {
        p.x = nx;
        p.z = nz;
        group.rotation.y = Math.atan2(vx, vz);
        walkTime += dt * config.speed * 5;
        for (let i = 0; i < model.stepParts.length; i++) {
          model.stepParts[i].rotation.x = Math.sin(walkTime + i * Math.PI) * 0.28;
        }
      }
    }
    p.y = Math.max(SEA_LEVEL, terrain.getHeightAt(p.x, p.z));
    return distance;
  }

  // 被放进水里 / 被挖塌淹没的陆生龙：梯度上升爬回最近陆地。
  // 朝向保持约 0.5s（_escapeTimer 冷却）再重采，避免平底水域里方向抖动。
  function escapeWater(dt, ctx) {
    const p = group.position;
    wrapper._escapeTimer = (wrapper._escapeTimer || 0) - dt;
    if (!wrapper._escapeDir || wrapper._escapeTimer <= 0) {
      let best = null;
      let bestH = -Infinity;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const sx = p.x + Math.cos(a) * 1.2;
        const sz = p.z + Math.sin(a) * 1.2;
        const h = ctx.terrain.getHeightAt(sx, sz);
        if (h > bestH) { bestH = h; best = { x: sx, z: sz }; }
      }
      wrapper._escapeDir = best;
      wrapper._escapeTimer = 0.5;
    }
    moveToward(wrapper._escapeDir, dt, ctx.terrain, 1.8, true); // allowWater + 加速：扑腾着尽快爬回岸
  }

  function releaseNest() {
    if (wrapper.nestTarget?.occupiedBy === wrapper) wrapper.nestTarget.occupiedBy = null;
    wrapper.nestTarget = null;
  }

  function acquireNest(ctx) {
    let nest = nearestNest(wrapper, ctx.entities);
    if (!nest) {
      // 陆生龙的巢必须建在陆地上；翼龙/沧龙保留近水的偏好点（createNest 仍会就近找陆地）
      let spot;
      if (wrapper.flying || wrapper.swimming) {
        const offset = diskTarget(5);
        spot = {
          x: clamp(group.position.x + offset.x, -BOUND, BOUND),
          z: clamp(group.position.z + offset.z, -BOUND, BOUND),
        };
      } else {
        spot = landSpotNear(ctx.terrain, group.position.x, group.position.z, 5);
      }
      nest = ctx.createNest(wrapper.species, spot);
      wrapper.lifeState = 'building-nest';
    } else {
      wrapper.lifeState = 'seeking-nest';
    }
    nest.occupiedBy = wrapper;
    wrapper.nestTarget = nest;
  }

  function finishLaying(ctx) {
    ctx.layEgg(wrapper, wrapper.nestTarget);
    releaseNest();
    wrapper.eggTimer = 45 + Math.random() * 30;
    wrapper.lifeState = 'wandering';
    layingTime = 0;
  }

  function updateReproduction(dt, ctx) {
    if (age < 20 || wrapper.eggTimer > 0) return false;
    if (
      wrapper.nestTarget &&
      (!wrapper.nestTarget.alive || wrapper.nestTarget.egg)
    ) {
      releaseNest();
    }
    if (!wrapper.nestTarget) acquireNest(ctx);
    const nest = wrapper.nestTarget;
    if (!nest) return false;

    if (wrapper.flying || wrapper.swimming) {
      wrapper.lifeState = 'seeking-nest';
      const p = group.position;
      // 翼龙飞到巢上空投蛋；沧龙游到巢边水面（近岸贴地），把蛋抛进巢里
      const targetY = wrapper.flying
        ? ctx.terrain.getHeightAt(nest.object3d.position.x, nest.object3d.position.z) + 5
        : Math.max(ctx.terrain.getHeightAt(p.x, p.z), SEA_LEVEL - 0.22);
      const dx = nest.object3d.position.x - p.x;
      const dz = nest.object3d.position.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.08) {
        const speed = config.speed * (wrapper.flying ? 5 : 2.5);
        p.x += (dx / distance) * speed * dt;
        p.z += (dz / distance) * speed * dt;
        p.y += (targetY - p.y) * Math.min(1, dt * 2);
        group.rotation.y = Math.atan2(dx, dz);
      }
      if (distance < (wrapper.swimming ? 2.2 : 1.2)) {
        wrapper.lifeState = 'laying';
        layingTime += dt;
        if (layingTime >= 0.6) finishLaying(ctx);
      }
      return true;
    }

    const distance = moveToward(nest.object3d.position, dt, ctx.terrain, 1.15);
    wrapper.lifeState = distance > Math.max(0.75, wrapper.size * 0.55)
      ? 'seeking-nest'
      : 'laying';
    if (wrapper.lifeState === 'laying') {
      layingTime += dt;
      const squat = 1 - Math.sin(Math.min(1, layingTime / 2) * Math.PI) * 0.12;
      group.scale.set(visualScale, visualScale * squat, visualScale);
      if (layingTime >= 2) finishLaying(ctx);
    }
    return true;
  }

  // 开心 emote：0.9s 抛物线跳 + 落地压缩拉伸 + 爱心粒子
  wrapper.startEmote = (type, ctx) => {
    if (emoteTime >= 0 || !wrapper.alive || wrapper.consumed || wrapper.flying) return;
    emoteTime = 0;
    if (ctx?.particles) {
      const p = group.position;
      ctx.particles.burst({ x: p.x, y: p.y + wrapper.size * 1.2, z: p.z }, {
        count: 8, colors: HEART_COLORS, speed: 1.1, gravity: -1.4, life: 0.9, size: 0.2,
      });
    }
  };

  // 抚摸：永远开心（4 岁直觉），睡着的会被摸醒
  wrapper.pet = (ctx) => {
    if (!wrapper.alive || wrapper.consumed) return;
    if (wrapper.lifeState === 'sleeping') {
      wrapper.lifeState = 'wandering';
      wakeTimer = 20;
    }
    wrapper.startEmote('pet', ctx);
    ctx.audio.playCry(species);
    ctx.bus.emit('pet', { species });
  };

  wrapper.update = (dt, ctx) => {
    if (!wrapper.alive) return;
    age += dt;
    if (!raisedEmitted && age >= 60) {
      raisedEmitted = true;
      ctx.bus.emit('raised', { species });
    }
    wrapper.eggTimer = Math.max(0, wrapper.eggTimer - dt);
    const desiredScale = config.baseSize * growthFactor();
    wrapper.size = desiredScale;
    const intro = age < 0.45 ? Math.max(0.001, easeOutBack(age / 0.45)) : 1;
    visualScale += (desiredScale * intro - visualScale) * Math.min(1, dt * 5);
    group.scale.setScalar(visualScale);
    sleepMarker.visible = false;

    // sparkle 变体：每 2.5-4s 滴落 3 颗金色微粒（走共享粒子池，开销可忽略）
    if (variantCfg?.flair && ctx.particles) {
      sparkleTimer -= dt;
      if (sparkleTimer <= 0) {
        sparkleTimer = 2.5 + Math.random() * 1.5;
        const p = group.position;
        ctx.particles.burst({ x: p.x, y: p.y + wrapper.size, z: p.z }, {
          count: 3, colors: ['#ffd96b', '#fff2c0', '#ffe9a8'],
          speed: 0.5, gravity: -0.8, life: 1.1, size: 0.12,
        });
      }
    }

    if (emoteTime >= 0) {
      emoteTime += dt;
      const t = Math.min(1, emoteTime / 0.9);
      const hop = Math.sin(t * Math.PI);
      const p = group.position;
      p.y = Math.max(ctx.seaLevel, ctx.terrain.getHeightAt(p.x, p.z)) + hop * wrapper.size * 0.55;
      // 起跳拉伸、落地压扁
      const squash = t > 0.82 ? 1 - Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.2 : 1 + hop * 0.12;
      const wide = 1 + (1 - squash) * 0.6;
      group.scale.set(visualScale * wide, visualScale * squash, visualScale * wide);
      if (t >= 1) emoteTime = -1;
      return;
    }

    // 陆生龙身处水中（被放进海里 / 地形被挖塌淹没）→ 优先爬回陆地，期间不觅食/不产蛋
    if (
      !wrapper.flying && !wrapper.swimming &&
      ctx.terrain.getHeightAt(group.position.x, group.position.z) < SEA_LEVEL + 0.15
    ) {
      wrapper.lifeState = 'escaping-water';
      escapeWater(dt, ctx);
      return;
    }

    if (updateReproduction(dt, ctx)) {
      alertMarker.visible = false;
      return;
    }

    // 闲时叫声 + 点头
    callTimer -= dt;
    if (callTimer <= 0) {
      callTimer = 10 + Math.random() * 15;
      if (wrapper.lifeState !== 'sleeping') {
        ctx.audio.playCry(species);
        nodTime = 0.6;
      }
    }
    if (nodTime > 0) {
      nodTime = Math.max(0, nodTime - dt);
      group.rotation.x = -Math.sin((1 - nodTime / 0.6) * Math.PI) * 0.16;
    }

    if (wrapper.flying) {
      const p = group.position;
      const flap = Math.sin(ctx.time * 8) * 0.65;

      // ---- 盘旋：偶尔锁定水里的鱼，切入俯冲 ----
      if (flyState === 'soaring') {
        wrapper.diving = false;
        flightAngle += dt * config.speed;
        const x = Math.cos(flightAngle) * flightRadius;
        const z = Math.sin(flightAngle) * flightRadius;
        const ground = Math.max(SEA_LEVEL, ctx.terrain.getHeightAt(x, z));
        p.set(x, ground + flightHeight + Math.sin(flightAngle * 2) * 0.7, z);
        group.rotation.set(0, flightAngle + Math.PI / 2, 0);
        model.wings[0].rotation.x = flap;
        model.wings[1].rotation.x = flap;
        huntCooldown -= dt;
        if (huntCooldown <= 0) {
          const fish = nearestFishTo(p, ctx.entities, WORLD_SIZE);
          if (fish) {
            preyFish = fish;
            diveFrom.copy(p);
            diveTo.set(fish.object3d.position.x, SEA_LEVEL + 0.12, fish.object3d.position.z);
            diveDur = clamp(diveFrom.distanceTo(diveTo) / 16, 0.7, 2.4);
            diveT = 0;
            caughtFish = false;
            flyState = 'diving';
            wrapper.lifeState = 'fishing';
          } else {
            huntCooldown = 3 + Math.random() * 4; // 没鱼可捕：稍后再试
          }
        }
        return;
      }

      // ---- 俯冲：沿弧线扎向鱼的水面位置（越冲越快），收翅压低机头 ----
      if (flyState === 'diving') {
        wrapper.diving = true;
        diveT = Math.min(1, diveT + dt / diveDur);
        const alive = preyFish && preyFish.alive && !preyFish.consumed;
        diveTo.set(
          alive ? preyFish.object3d.position.x : diveTo.x,
          SEA_LEVEL + 0.12,
          alive ? preyFish.object3d.position.z : diveTo.z
        );
        p.lerpVectors(diveFrom, diveTo, diveT * diveT); // easeIn
        group.rotation.y = Math.atan2(diveTo.x - diveFrom.x, diveTo.z - diveFrom.z);
        group.rotation.x = 0.55 * diveT; // 机头下压
        group.rotation.z = Math.sin(ctx.time * 6) * 0.05;
        model.wings[0].rotation.x = -0.6; // 收翅俯冲
        model.wings[1].rotation.x = -0.6;
        if (diveT >= 1) {
          if (alive && preyFish.object3d.position.distanceToSquared(p) < 4) {
            preyFish.consume(ctx.removeEntity);
            caughtFish = true;
            ctx.bus.emit('eat', { species, diet: 'fish' });
            ctx.audio.playCry(species);
          }
          ctx.audio.playSplash();
          ctx.particles.burst({ x: p.x, y: SEA_LEVEL + 0.1, z: p.z }, {
            count: 12, colors: ['#bfeaff', '#ffffff', '#9fd8f5'], speed: 2.4, gravity: 9, life: 0.5, size: 0.14,
          });
          model.catch.visible = caughtFish;
          // 上升目标：盘旋角度推进后的高空位置
          flightAngle += 0.6;
          const rx = Math.cos(flightAngle) * flightRadius;
          const rz = Math.sin(flightAngle) * flightRadius;
          const rground = Math.max(SEA_LEVEL, ctx.terrain.getHeightAt(rx, rz));
          diveFrom.copy(p);
          diveTo.set(rx, rground + flightHeight, rz);
          diveDur = clamp(diveFrom.distanceTo(diveTo) / 14, 0.7, 2.4);
          diveT = 0;
          flyState = 'rising';
        }
        return;
      }

      // ---- 爬升：叼着鱼抬头扑翼回到盘旋高度 ----
      wrapper.diving = false;
      diveT = Math.min(1, diveT + dt / diveDur);
      const e = 1 - (1 - diveT) * (1 - diveT); // easeOut
      p.lerpVectors(diveFrom, diveTo, e);
      group.rotation.y = Math.atan2(diveTo.x - p.x, diveTo.z - p.z);
      group.rotation.x = -0.3 * (1 - diveT); // 抬头
      group.rotation.z = 0;
      model.wings[0].rotation.x = flap * 1.2; // 用力扑翼
      model.wings[1].rotation.x = flap * 1.2;
      if (diveT >= 1) {
        flyState = 'soaring';
        huntCooldown = 6 + Math.random() * 6;
        model.catch.visible = false;
        caughtFish = false;
        preyFish = null;
        group.rotation.x = 0;
        wrapper.lifeState = 'wandering';
      }
      return;
    }

    if (wrapper.swimming) {
      const p = group.position;

      // ---- 跃出水面捕食正在低空俯冲的翼龙（翼龙唯一的天敌） ----
      if (breaching) {
        breachT = Math.min(1, breachT + dt / breachDur);
        // 追踪猎物的水平位置（还活着的话）→ 冲着翼龙脚下顶上去
        if (breachPrey && breachPrey.alive && !breachPrey.consumed) {
          breachApex.x = breachPrey.object3d.position.x;
          breachApex.z = breachPrey.object3d.position.z;
        }
        const arc = Math.sin(breachT * Math.PI); // 0→1→0 抛物线
        const hz = Math.min(1, breachT / 0.5); // 上升段冲到猎物正下方
        p.x = lerp(breachFrom.x, breachApex.x, hz);
        p.z = lerp(breachFrom.z, breachApex.z, hz);
        p.y = SEA_LEVEL - 0.2 + arc * breachHeight;
        group.rotation.y = Math.atan2(breachApex.x - breachFrom.x, breachApex.z - breachFrom.z);
        group.rotation.x = (breachT - 0.5) * 2.4; // 上升昂首冲天 → 顶点 → 下落扎回水里
        group.rotation.z = 0;
        for (let i = 0; i < model.flippers.length; i++) model.flippers[i].rotation.x = 0.4;
        // 扑咬命中：破水而出后，叼住进入打击范围的任意低空翼龙（不限于触发者）→ poof；爬得够快的逃脱
        if (!breachCaught && p.y > SEA_LEVEL + 0.6) {
          for (const e of ctx.entities) {
            if (!e.flying || !e.alive || e.consumed) continue;
            const ep = e.object3d.position;
            if (Math.hypot(ep.x - p.x, ep.z - p.z) < 3.2 && Math.abs(p.y - ep.y) < 2.6) {
              e.consume(ctx.removeEntity, true); // force：叼住飞行的翼龙
              breachCaught = true;
              ctx.audio.playBreach();
              ctx.particles.burst({ x: p.x, y: SEA_LEVEL + 0.4, z: p.z }, {
                count: 18, colors: ['#bfeaff', '#ffffff', '#9fd8f5'], speed: 3.2, gravity: 9, life: 0.6, size: 0.16,
              });
              break;
            }
          }
        }
        if (breachT >= 1) {
          breaching = false;
          breachPrey = null;
          ctx.audio.playSplash();
          ctx.particles.burst({ x: p.x, y: SEA_LEVEL + 0.1, z: p.z }, {
            count: 12, colors: ['#bfeaff', '#ffffff'], speed: 2, gravity: 9, life: 0.5, size: 0.14,
          });
        }
        return;
      }

      breachCooldown -= dt;
      fishEatCooldown -= dt;

      // 触发跃出：附近有低空俯冲的翼龙 + 冷却就绪 → 高概率扑出
      if (breachCooldown <= 0) {
        for (const e of ctx.entities) {
          if (!e.flying || !e.diving || !e.alive || e.consumed) continue;
          const ep = e.object3d.position;
          if (ep.y > SEA_LEVEL + 4) continue; // 还不够低
          if (Math.hypot(ep.x - p.x, ep.z - p.z) > 9) continue; // 太远
          breachCooldown = 7 + Math.random() * 4;
          if (Math.random() < 0.75) {
            breaching = true;
            breachCaught = false;
            breachPrey = e;
            breachFrom.copy(p);
            breachApex.set(ep.x, 0, ep.z);
            breachHeight = clamp(ep.y - SEA_LEVEL + 2.5, 4.5, 7); // 高高跃起、清晰破水
            breachDur = 1.1;
            breachT = 0;
            ctx.audio.playSplash();
          }
          break;
        }
        if (breaching) return;
      }

      // ---- 顺便吃鱼：冷却就绪时朝最近的鱼游过去，靠近即吞 ----
      let swimTarget = wanderTarget;
      if (fishEatCooldown <= 0) {
        const fish = nearestFishTo(p, ctx.entities, 12);
        if (fish) {
          swimTarget = fish.object3d.position;
          if (fish.object3d.position.distanceToSquared(p) < 3.2) {
            fish.consume(ctx.removeEntity);
            fishEatCooldown = 3 + Math.random() * 3;
            ctx.audio.playEat();
            ctx.particles.burst({ x: p.x, y: SEA_LEVEL + 0.05, z: p.z }, {
              count: 8, colors: ['#bfeaff', '#ffffff'], speed: 1.6, gravity: 9, life: 0.4, size: 0.12,
            });
          }
        }
      }

      // ---- 常规游动：朝水中目标（或锁定的鱼）巡游，水面沉浮 + 鳍摆动 ----
      if (Math.hypot(wanderTarget.x - p.x, wanderTarget.z - p.z) < 1) {
        wanderTarget = chooseWaterTarget(ctx) || chooseLandTarget(ctx);
      }
      const dx = swimTarget.x - p.x;
      const dz = swimTarget.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.05) {
        p.x += (dx / distance) * config.speed * dt;
        p.z += (dz / distance) * config.speed * dt;
        group.rotation.y = Math.atan2(dx, dz);
      }
      const ground = ctx.terrain.getHeightAt(p.x, p.z);
      p.y = Math.max(ground, SEA_LEVEL - 0.22 + Math.sin(ctx.time * 1.6) * 0.16);
      group.rotation.x = 0; // 跃出后复位
      for (let i = 0; i < model.flippers.length; i++) {
        model.flippers[i].rotation.x = Math.sin(ctx.time * 3 + i) * 0.45;
      }
      group.rotation.z = Math.sin(ctx.time * 1.2) * 0.06;
      return;
    }

    // 睡觉：夜晚无目标就地入睡，呼吸起伏 + 💤；白天或被摸醒后恢复
    wakeTimer = Math.max(0, wakeTimer - dt);
    if (wrapper.lifeState === 'sleeping' && ctx.skyPhase !== 'night') {
      wrapper.lifeState = 'wandering';
    } else if (
      wrapper.lifeState !== 'sleeping' &&
      ctx.skyPhase === 'night' && !wrapper.target && wrapper.eggTimer > 5 && wakeTimer === 0
    ) {
      wrapper.lifeState = 'sleeping';
      nodTime = 0; // 入睡打断点头：复位角度，避免歪着头睡一整晚
      group.rotation.x = 0;
    }
    if (wrapper.lifeState === 'sleeping') {
      alertMarker.visible = false;
      sleepMarker.visible = true;
      group.scale.y = visualScale * (1 + Math.sin(ctx.time * 1.6) * 0.03);
      for (let i = 0; i < 3; i++) {
        const k = (ctx.time * 0.4 + i / 3) % 1;
        sleepMarker.children[i].position.set(Math.sin(k * TAU) * 0.14, k * 1.1, 0);
        sleepMarker.children[i].scale.setScalar(0.5 + k);
      }
      return;
    }

    wrapper.hungerTimer = Math.max(0, wrapper.hungerTimer - dt);
    retargetTimer -= dt;
    if (wrapper.target && (!wrapper.target.alive || wrapper.target.consumed)) wrapper.target = null;
    if (wrapper.hungerTimer === 0 && !wrapper.target && retargetTimer <= 0) {
      wrapper.target = nearestFood(wrapper, ctx.entities);
      retargetTimer = 0.7;
    }
    alertMarker.visible = wrapper.diet === 'carnivore' && Boolean(wrapper.target);

    if (wrapper.target) {
      wrapper.lifeState = 'foraging';
      const chaseSpeed = wrapper.diet === 'carnivore' ? 1.7 : 1.25;
      const distance = moveToward(wrapper.target.object3d.position, dt, ctx.terrain, chaseSpeed);
      if (wrapper._waterBlocked) {
        // 食物在水对岸够不着：放弃目标回到漫游，别一直磨蹭岸边
        wrapper.target = null;
        alertMarker.visible = false;
        wrapper.lifeState = 'wandering';
        return;
      }
      const eatDistance = Math.max(0.8, wrapper.size * 0.75);
      if (distance <= eatDistance && wrapper.target.consume?.(ctx.removeEntity)) {
        const foodPos = wrapper.target.object3d.position;
        ctx.particles.burst({ x: foodPos.x, y: foodPos.y + 0.6, z: foodPos.z }, {
          count: 10,
          colors: wrapper.diet === 'herbivore'
            ? ['#79c96d', '#a4e08a', '#5ca85b']
            : ['#e3a266', '#c98052', '#f2c98c'],
          speed: 1.6, gravity: 5, life: 0.6, size: 0.14,
        });
        foodGrowth += 0.05;
        wrapper.mealsEaten++;
        wrapper.hungerTimer = 12 + Math.random() * 8;
        wrapper.target = null;
        alertMarker.visible = false;
        ctx.spawnPoop(wrapper);
        ctx.audio.playEat();
        ctx.bus.emit('eat', { species, diet: wrapper.diet });
        wrapper.startEmote('eat', ctx);
      }
      return;
    }

    wrapper.lifeState = 'wandering';
    if (
      wrapper._waterBlocked ||
      Math.hypot(wanderTarget.x - group.position.x, wanderTarget.z - group.position.z) < 0.8
    ) {
      wanderTarget = chooseLandTarget(ctx); // 到达或被水挡住 → 转身往内陆重选
    }
    moveToward(wanderTarget, dt, ctx.terrain);
  };

  wrapper.getSaveState = () => {
    const r = (v) => Math.round(v * 100) / 100;
    const state = {
      k: 'dino',
      s: species,
      x: r(group.position.x),
      z: r(group.position.z),
      age: r(age),
      fg: r(foodGrowth),
      egg: r(wrapper.eggTimer),
    };
    // Infinity（翼龙）无法过 JSON，省略后读档时按物种重新取默认值
    if (Number.isFinite(wrapper.hungerTimer)) state.hunger = r(wrapper.hungerTimer);
    if (variant) state.vr = variant;
    return state;
  };

  // force=true：沧龙跃出捕食时可叼住飞行的翼龙（地面猎手仍不吃飞行/游泳龙）
  wrapper.consume = (removeEntity, force = false) => {
    if (!wrapper.alive || wrapper.consumed) return false;
    if (!force && (wrapper.flying || wrapper.swimming)) return false;
    wrapper.consumed = true;
    let elapsed = 0;
    const startScale = visualScale;
    wrapper.update = (dt) => {
      elapsed += dt;
      const t = clamp(elapsed / 0.4, 0, 1);
      group.scale.setScalar(startScale * (1 - t));
      group.rotation.y += dt * 5;
      if (t === 1) removeEntity(wrapper);
    };
    return true;
  };

  return wrapper;
}

export { SPECIES };
