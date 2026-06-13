import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';
import { clamp, easeOutBack, lerp, TAU } from '../utils.js';
import { VARIANTS } from './Variants.js';
import { attachHybridModel } from './HybridModel.js'; // 【试点】T-Rex 用 CC0 glTF 模型替换视觉

const BOUND = WORLD_SIZE * 0.46;
const MOUNTAIN_H = SEA_LEVEL + 3; // 翼龙夜栖偏好的「高山」高度门槛（约 3.6）
const PTEROSAUR_SOFT_CAP = 6; // 翼龙繁殖软上限：同物种到此数量就不再产蛋（生态保障）
const SATIATION_MAX = 48; // 饱腹满格对应的 hungerTimer 上限（用于换算头顶肚子条的 0~1 饱度）
// 成长：宝宝 → 巨兽（戏剧性反差，喂食为主驱动；上界收口避免无限长大）
const BABY_SCALE = 0.45;   // 出生尺寸（占成年比例）
const MAX_GROWTH = 2.2;    // 成长上限（相对成年）
const GROW_SECONDS = 90;   // 仅靠年龄长到成年所需秒数（更长一点，肉眼可见）
const FEED_GROWTH = 0.12;  // 手动喂一口的成长量（主推手）
const EAT_GROWTH = 0.05;   // 自动觅食一餐的成长量（次要）
const WEAN_AGE = 60;       // 宝宝跟随领队成群的年龄上限，之后断奶独立漫游
const eyeMat = new THREE.MeshStandardMaterial({ color: '#30283a', roughness: 0.7 });
const eyeShineMat = new THREE.MeshBasicMaterial({ color: '#ffffff' }); // 眼睛高光小点，整体更萌
const toothMat = new THREE.MeshStandardMaterial({ color: '#fff8df', flatShading: true });
const catchFishMat = new THREE.MeshStandardMaterial({ color: '#ff9e6b', flatShading: true, roughness: 0.7 });
const zzzMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthTest: false });
const HEART_COLORS = ['#ff6f9c', '#ff9ec4', '#ffd3e2'];
// 泥点（洗澡玩法）：共享小球几何/材质，恐龙偶尔沾上、用泡泡洗掉
const mudGeo = new THREE.IcosahedronGeometry(0.13, 0);
mudGeo.userData.shared = true;
const mudMat = new THREE.MeshStandardMaterial({ color: '#7a5535', roughness: 0.95, flatShading: true });
const MUD_SPOTS = [[0.26, 0.34, 0.2], [-0.3, 0.3, -0.12], [0.12, 0.26, -0.32], [-0.16, 0.46, 0.24], [0.3, 0.5, -0.18]];

// rarity：common 初始可用 / uncommon 里程碑解锁 / rare 里程碑或仅神秘蛋；
// 只影响获取渠道与视觉炫耀，不影响任何玩法数值（无竞争设计）
const SPECIES = {
  triceratops: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.45,
    body: '#78c96b', accent: '#d8ef9c', rarity: 'common',
  },
  brachiosaurus: {
    diet: 'herbivore', baseSize: 1.3, speed: 1.05,
    body: '#67b9a6', accent: '#a9e0cc', rarity: 'uncommon',
  },
  stegosaurus: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.25,
    body: '#e4ad59', accent: '#ffdf7e', rarity: 'uncommon',
  },
  trex: {
    diet: 'carnivore', baseSize: 1.2, speed: 1.65,
    body: '#d96b5f', accent: '#ffb07d', rarity: 'common',
  },
  raptor: {
    diet: 'carnivore', baseSize: 0.72, speed: 2.35,
    body: '#9a79d1', accent: '#d2b8ff', rarity: 'uncommon',
  },
  oviraptor: {
    diet: 'egg', baseSize: 0.76, speed: 2.1,
    body: '#e58d45', accent: '#ffe080', rarity: 'uncommon',
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
  // —— 新增程序化物种（无外部模型，沿用 builder 体系，风格统一）——
  carnotaurus: {
    diet: 'carnivore', baseSize: 1.1, speed: 1.95,
    body: '#e07a4f', accent: '#ffd0a0', rarity: 'uncommon',
  },
  gallimimus: {
    diet: 'herbivore', baseSize: 0.85, speed: 2.25,
    body: '#d9b25e', accent: '#fff0c0', rarity: 'uncommon',
  },
  styracosaurus: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.3,
    body: '#cf8a5e', accent: '#ffd9a8', rarity: 'uncommon',
  },
  compsognathus: {
    diet: 'carnivore', baseSize: 0.55, speed: 2.6,
    body: '#8fce6f', accent: '#ffe27a', rarity: 'uncommon',
  },
  kentrosaurus: {
    diet: 'herbivore', baseSize: 0.95, speed: 1.2,
    body: '#a0884e', accent: '#e8d39a', rarity: 'uncommon',
  },
  iguanodon: {
    diet: 'herbivore', baseSize: 1.1, speed: 1.35,
    body: '#8bbf8a', accent: '#d6efc0', rarity: 'uncommon',
  },
  baryonyx: {
    diet: 'carnivore', baseSize: 1.05, speed: 1.7,
    body: '#5f93b0', accent: '#bfe0ef', rarity: 'uncommon',
  },
  protoceratops: {
    diet: 'herbivore', baseSize: 0.7, speed: 1.4,
    body: '#cbb07a', accent: '#f0e0b0', rarity: 'uncommon',
  },
  pteranodon: {
    diet: 'none', baseSize: 1.0, speed: 0.6,
    body: '#c98a5a', accent: '#ffe0b0', flying: true, rarity: 'uncommon',
  },
  plesiosaurus: {
    diet: 'none', baseSize: 1.1, speed: 0.85,
    body: '#5aa9a0', accent: '#bfeee8', swimming: true, rarity: 'uncommon',
  },
  amargasaurus: {
    diet: 'herbivore', baseSize: 1.2, speed: 1.0,
    body: '#9d7fc4', accent: '#e0d0f0', rarity: 'uncommon',
  },
  pachyrhinosaurus: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.25,
    body: '#b58b6a', accent: '#ecd6bc', rarity: 'uncommon',
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
    // 高光小点：偏前上外侧，给眼神一点灵动
    mesh(new THREE.SphereGeometry(radius * 0.4, 5, 4), eyeShineMat, parent,
      [side * spread + radius * 0.32, y + radius * 0.35, z + radius * 0.55]);
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
    // 髋关节圆润收口：腿顶一颗小球，所有四足龙瞬间更精致
    mesh(new THREE.SphereGeometry(radius * 1.15, 6, 5), mat, group, [x, height, z]);
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
  // 喙：深色尖钩嘴
  const beak = mesh(new THREE.ConeGeometry(0.13, 0.28, 6), eyeMat, g, [0, 0.82, 1.46]);
  beak.rotation.x = Math.PI / 2;
  // 颈盾边缘扇贝：5 颗小锥沿盾顶弧线，颈盾更有「招牌」轮廓
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.7;
    const bump = mesh(new THREE.ConeGeometry(0.08, 0.2, 5), accentMat, g, [Math.sin(a) * 0.66, 1.15 + Math.cos(a) * 0.16, 0.46]);
    bump.rotation.z = -a;
    bump.rotation.x = Math.PI / 2;
  }
  addEyes(head, 0.13, 0.4, 0.22);
  addLegs(g, bodyMat, [[-0.42, -0.48], [0.42, -0.48], [-0.42, 0.5], [0.42, 0.5]]);
  addTail(g, bodyMat, [0, 0.86, -1.2], 1.15, 0.25);
  return { group: g, stepParts: [] };
}

// 似鸡龙：细长身 + 长脖 + 小头小喙 + 大长腿，鸵鸟一样的飞毛腿
function buildGallimimus(bodyMat, accentMat) {
  const g = new THREE.Group();
  const bodyY = 1.0;
  mesh(new THREE.IcosahedronGeometry(0.42, 1), bodyMat, g, [0, bodyY, 0], [0.85, 0.82, 1.5]);
  const neck = mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.72, 6), bodyMat, g, [0, bodyY + 0.42, 0.4]);
  neck.rotation.x = 0.55;
  const head = mesh(new THREE.IcosahedronGeometry(0.2, 1), bodyMat, g, [0, bodyY + 0.82, 0.66], [1, 0.9, 1.3]);
  const beak = mesh(new THREE.ConeGeometry(0.07, 0.22, 6), accentMat, g, [0, bodyY + 0.79, 0.9]);
  beak.rotation.x = Math.PI / 2;
  addEyes(head, 0.05, 0.16, 0.12, 0.05);
  const legs = [];
  for (const side of [-1, 1]) {
    const legH = 1.05;
    const leg = mesh(new THREE.CylinderGeometry(0.06, 0.09, legH, 6), bodyMat, g, [side * 0.18, legH / 2, -0.05]);
    legs.push(leg);
    mesh(new THREE.SphereGeometry(0.09, 6, 5), bodyMat, g, [side * 0.18, legH, -0.05]);
    for (const tz of [0.05, 0.16]) {
      const toe = mesh(new THREE.ConeGeometry(0.035, 0.12, 4), accentMat, leg, [0, -legH / 2 + 0.02, tz]);
      toe.rotation.x = Math.PI / 2;
    }
    const arm = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.34, 5), bodyMat, g, [side * 0.3, bodyY + 0.05, 0.38]);
    arm.rotation.z = side * 0.6;
  }
  addTail(g, bodyMat, [0, bodyY, -0.95], 1.45, 0.17);
  return { group: g, stepParts: legs };
}

// 戟龙：颈盾边缘一圈放射状长戟刺 + 大鼻角，三角龙家族里最「刺」的招牌轮廓
function buildStyracosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.68, 1), bodyMat, g, [0, 0.88, 0], [1, 0.72, 1.3]);
  const head = mesh(new THREE.IcosahedronGeometry(0.46, 1), bodyMat, g, [0, 0.9, 0.85], [1, 0.85, 1.05]);
  mesh(new THREE.ConeGeometry(0.6, 0.3, 8), accentMat, g, [0, 1.12, 0.58], [1, 1, 0.62]).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) { // 招牌长戟刺
    const a = (i / 5 - 0.5) * 2.0;
    const spike = mesh(new THREE.ConeGeometry(0.07, 0.62, 6), toothMat, g, [Math.sin(a) * 0.6, 1.12 + Math.cos(a) * 0.2, 0.5]);
    spike.rotation.z = -a;
    spike.rotation.x = -0.35;
  }
  const noseHorn = mesh(new THREE.ConeGeometry(0.1, 0.62, 7), toothMat, g, [0, 1.0, 1.3]);
  noseHorn.rotation.x = Math.PI / 2 - 0.5;
  const beak = mesh(new THREE.ConeGeometry(0.12, 0.26, 6), eyeMat, g, [0, 0.8, 1.4]);
  beak.rotation.x = Math.PI / 2;
  addEyes(head, 0.12, 0.4, 0.22);
  addLegs(g, bodyMat, [[-0.4, -0.46], [0.4, -0.46], [-0.4, 0.48], [0.4, 0.48]]);
  addTail(g, bodyMat, [0, 0.84, -1.15], 1.1, 0.24);
  return { group: g, stepParts: [] };
}

// 钉状龙：剑龙近亲，背上成对尖刺（越往尾越长）+ 招牌大肩刺
function buildKentrosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.66, 1), bodyMat, g, [0, 0.85, -0.05], [1, 0.7, 1.5]);
  const head = mesh(new THREE.IcosahedronGeometry(0.3, 1), bodyMat, g, [0, 0.68, 1.08], [0.9, 0.78, 1.2]);
  addEyes(head, 0.1, 0.27, 0.15, 0.05);
  for (let i = 0; i < 6; i++) {
    const z = -0.85 + i * 0.34;
    const h = 0.35 + (i / 5) * 0.4; // 越往尾越长
    for (const side of [-1, 1]) {
      const spike = mesh(new THREE.ConeGeometry(0.08, h, 5), toothMat, g, [side * 0.12, 1.22 + h * 0.3, z]);
      spike.rotation.z = side * 0.35;
    }
  }
  for (const side of [-1, 1]) { // 大肩刺
    const sh = mesh(new THREE.ConeGeometry(0.1, 0.7, 6), toothMat, g, [side * 0.5, 1.0, 0.1]);
    sh.rotation.z = side * (Math.PI / 2.2);
  }
  addLegs(g, bodyMat, [[-0.4, -0.5], [0.4, -0.5], [-0.4, 0.5], [0.4, 0.5]], 0.6);
  addTail(g, bodyMat, [0, 0.88, -1.3], 1.3, 0.22);
  return { group: g, stepParts: [] };
}

// 禽龙：壮实的半直立食草龙，小头喙嘴 + 招牌拇指尖刺
function buildIguanodon(bodyMat, accentMat) {
  const g = new THREE.Group();
  const bodyY = 1.0;
  mesh(new THREE.IcosahedronGeometry(0.58, 1), bodyMat, g, [0, bodyY, 0], [0.95, 0.95, 1.4]);
  const neck = mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.6, 6), bodyMat, g, [0, bodyY + 0.5, 0.4]);
  neck.rotation.x = 0.5;
  const head = mesh(new THREE.IcosahedronGeometry(0.26, 1), bodyMat, g, [0, bodyY + 0.85, 0.62], [1, 0.85, 1.2]);
  const beak = mesh(new THREE.ConeGeometry(0.12, 0.24, 6), accentMat, g, [0, bodyY + 0.78, 0.86]);
  beak.rotation.x = Math.PI / 2;
  addEyes(head, 0.08, 0.2, 0.16, 0.055);
  const legs = [];
  for (const side of [-1, 1]) {
    const legH = 0.95;
    const leg = mesh(new THREE.CylinderGeometry(0.13, 0.17, legH, 6), bodyMat, g, [side * 0.3, legH / 2, -0.15]);
    legs.push(leg);
    mesh(new THREE.SphereGeometry(0.16, 6, 5), bodyMat, g, [side * 0.3, legH, -0.15]);
    for (const tz of [0.06, 0.2]) {
      const toe = mesh(new THREE.ConeGeometry(0.06, 0.16, 4), accentMat, leg, [0, -legH / 2 + 0.02, tz]);
      toe.rotation.x = Math.PI / 2;
    }
    const arm = mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.4, 5), bodyMat, g, [side * 0.34, bodyY + 0.02, 0.42]);
    arm.rotation.z = side * 0.5;
    const thumb = mesh(new THREE.ConeGeometry(0.04, 0.18, 4), toothMat, g, [side * 0.46, bodyY - 0.12, 0.5]);
    thumb.rotation.x = -0.4;
  }
  addTail(g, bodyMat, [0, bodyY, -1.0], 1.5, 0.26);
  return { group: g, stepParts: legs };
}

// 原角龙：迷你无角的角龙，小颈盾 + 鹦鹉喙，憨憨的
function buildProtoceratops(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.5, 1), bodyMat, g, [0, 0.62, 0], [1, 0.78, 1.35]);
  const head = mesh(new THREE.IcosahedronGeometry(0.34, 1), bodyMat, g, [0, 0.66, 0.66], [1, 0.9, 1.1]);
  mesh(new THREE.ConeGeometry(0.42, 0.22, 8), accentMat, g, [0, 0.86, 0.45], [1, 1, 0.55]).rotation.x = Math.PI / 2;
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 1.5;
    const bump = mesh(new THREE.ConeGeometry(0.05, 0.13, 5), accentMat, g, [Math.sin(a) * 0.42, 0.86 + Math.cos(a) * 0.12, 0.36]);
    bump.rotation.z = -a;
    bump.rotation.x = Math.PI / 2;
  }
  const beak = mesh(new THREE.ConeGeometry(0.11, 0.22, 6), eyeMat, g, [0, 0.56, 1.0]);
  beak.rotation.x = Math.PI / 2;
  addEyes(head, 0.08, 0.32, 0.18, 0.055);
  addLegs(g, bodyMat, [[-0.3, -0.34], [0.3, -0.34], [-0.3, 0.36], [0.3, 0.36]], 0.5, 0.1);
  addTail(g, bodyMat, [0, 0.6, -0.9], 0.85, 0.2);
  return { group: g, stepParts: [] };
}

// 无齿翼龙：更大翼展 + 招牌后掠大头冠 + 长喙。复用翼龙飞行 AI（须返回 wings/catch）
function buildPteranodon(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.36, 1), bodyMat, g, [0, 0, 0], [0.85, 0.6, 1.25]);
  const head = mesh(new THREE.IcosahedronGeometry(0.22, 1), bodyMat, g, [0, 0.1, 0.55], [0.8, 0.7, 1.1]);
  const beak = mesh(new THREE.ConeGeometry(0.09, 0.82, 6), accentMat, g, [0, 0.04, 1.12]);
  beak.rotation.x = Math.PI / 2;
  const crest = mesh(new THREE.ConeGeometry(0.13, 0.72, 4), accentMat, g, [0, 0.32, 0.2]); // 后掠大冠
  crest.rotation.x = 1.95;
  addEyes(head, 0.09, 0.18, 0.13, 0.045);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.ConeGeometry(1.15, 2.1, 3), accentMat, g, [side * 0.9, 0, -0.05]);
    wing.rotation.z = side * Math.PI / 2;
    wing.rotation.y = side * 0.22;
    wings.push(wing);
  }
  addTail(g, bodyMat, [0, 0, -0.68], 0.5, 0.1);
  const caught = mesh(new THREE.IcosahedronGeometry(0.12, 1), catchFishMat, g, [0, -0.12, 1.2], [0.7, 0.7, 1.5]);
  caught.visible = false;
  return { group: g, wings, catch: caught, stepParts: [] };
}

// 蛇颈龙：招牌长脖 + 小头 + 四鳍 + 短尾。复用沧龙游泳 AI（须返回 flippers）
function buildPlesiosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.6, 1), bodyMat, g, [0, 0.55, 0], [0.95, 0.78, 1.4]);
  const neck = mesh(new THREE.CylinderGeometry(0.14, 0.22, 1.5, 7), bodyMat, g, [0, 0.95, 0.9]);
  neck.rotation.x = -0.7;
  const head = mesh(new THREE.IcosahedronGeometry(0.2, 1), bodyMat, g, [0, 1.45, 1.55], [0.9, 0.8, 1.2]);
  const snout = mesh(new THREE.ConeGeometry(0.1, 0.3, 6), accentMat, g, [0, 1.42, 1.78]);
  snout.rotation.x = Math.PI / 2;
  addEyes(head, 0.06, 0.16, 0.12, 0.045);
  const flippers = [];
  for (const side of [-1, 1]) {
    for (const z of [0.5, -0.4]) {
      const flipper = mesh(new THREE.ConeGeometry(0.15, 0.62, 4), accentMat, g, [side * 0.5, 0.42, z]);
      flipper.rotation.z = side * (Math.PI / 2 + 0.3);
      flippers.push(flipper);
    }
  }
  addTail(g, bodyMat, [0, 0.55, -1.1], 0.95, 0.18);
  return { group: g, flippers, stepParts: [] };
}

// 阿马加龙：脖背一排朝后的高神经棘，长颈龙里最「带刺」的剪影
function buildAmargasaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.62, 1), bodyMat, g, [0, 1.0, -0.1], [1, 0.78, 1.5]);
  const neck = mesh(new THREE.CylinderGeometry(0.16, 0.3, 1.7, 7), bodyMat, g, [0, 1.5, 0.65]);
  neck.rotation.x = -0.62;
  const head = mesh(new THREE.IcosahedronGeometry(0.24, 1), bodyMat, g, [0, 2.05, 1.3], [0.9, 0.75, 1.2]);
  addEyes(head, 0.06, 0.2, 0.13, 0.05);
  for (let i = 0; i < 7; i++) { // 一排高神经棘，沿脖背朝后斜立
    const t = i / 6;
    const ny = lerp(1.55, 1.95, t), nz = lerp(1.05, -0.2, t);
    const h = 0.55 - t * 0.25;
    for (const side of [-1, 1]) {
      const spine = mesh(new THREE.ConeGeometry(0.05, h, 5), accentMat, g, [side * 0.1, ny + h * 0.35, nz]);
      spine.rotation.x = -0.9;
    }
  }
  addLegs(g, bodyMat, [[-0.4, -0.55], [0.4, -0.55], [-0.4, 0.42], [0.4, 0.42]], 0.95, 0.14);
  addTail(g, bodyMat, [0, 1.0, -1.5], 1.8, 0.24);
  return { group: g, stepParts: [] };
}

// 厚鼻龙：角龙家族，鼻上一块厚实圆鼻瘤（不是角）+ 颈盾两个朝前小钩
function buildPachyrhinosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.7, 1), bodyMat, g, [0, 0.9, 0], [1, 0.72, 1.35]);
  const head = mesh(new THREE.IcosahedronGeometry(0.48, 1), bodyMat, g, [0, 0.92, 0.88], [1, 0.85, 1.05]);
  mesh(new THREE.ConeGeometry(0.66, 0.35, 8), accentMat, g, [0, 1.15, 0.62], [1, 1, 0.7]).rotation.x = Math.PI / 2;
  mesh(new THREE.IcosahedronGeometry(0.22, 1), accentMat, g, [0, 1.02, 1.28], [1.1, 0.7, 0.95]); // 鼻瘤 boss
  for (const side of [-1, 1]) { // 颈盾朝前小钩
    const hook = mesh(new THREE.ConeGeometry(0.07, 0.3, 6), toothMat, g, [side * 0.3, 1.32, 0.5]);
    hook.rotation.x = 0.6;
    hook.rotation.z = side * 0.2;
  }
  const beak = mesh(new THREE.ConeGeometry(0.13, 0.28, 6), eyeMat, g, [0, 0.82, 1.46]);
  beak.rotation.x = Math.PI / 2;
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
  // 背板：左右错位 + 中背更大，比单排同尺寸更立体好看
  for (let i = 0; i < 7; i++) {
    const z = -0.9 + i * 0.32;
    const t = Math.sin((i / 6) * Math.PI);
    const h = 0.4 + t * 0.45;
    const r = 0.17 + t * 0.13;
    const plate = mesh(new THREE.ConeGeometry(r, h, 4), accentMat, g, [(i % 2 ? 0.1 : -0.1), 1.4 + h * 0.2, z]);
    plate.rotation.y = Math.PI / 4;
  }
  addLegs(g, bodyMat, [[-0.42, -0.52], [0.42, -0.52], [-0.42, 0.55], [0.42, 0.55]], 0.65);
  addTail(g, bodyMat, [0, 0.92, -1.35], 1.35, 0.26);
  // 尾刺 thagomizer：尾端 4 根朝后上的钉，剑龙的招牌武器
  for (const [sx, rz] of [[-0.16, -0.5], [0.16, 0.5], [-0.06, -0.18], [0.06, 0.18]]) {
    const spike = mesh(new THREE.ConeGeometry(0.06, 0.5, 5), toothMat, g, [sx, 1.0, -1.98]);
    spike.rotation.x = -Math.PI / 2.4;
    spike.rotation.z = rz;
  }
  return { group: g, stepParts: [] };
}

function buildPredator(bodyMat, accentMat, small, opts = {}) {
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
  if (opts.longSnout) { // 重爪龙的鳄鱼长吻：往前接一段窄长口鼻
    mesh(new THREE.BoxGeometry(0.26, 0.2, 0.6), bodyMat, g, [0, bodyY + 0.24, 1.55]);
    mesh(new THREE.BoxGeometry(0.22, 0.12, 0.52), accentMat, g, [0, bodyY + 0.12, 1.6]);
  }
  addEyes(head, 0.14, small ? 0.28 : 0.4, small ? 0.18 : 0.24);
  // 凶猛猎手专属（仅食肉龙）：上颌白牙 + 眉脊，让霸王龙/迅猛龙更有气势
  if (opts.fangs) {
    const n = small ? 3 : 4;
    for (let i = 0; i < n; i++) {
      const tx = (i / (n - 1) - 0.5) * (small ? 0.32 : 0.46);
      const tooth = mesh(new THREE.ConeGeometry(0.035, 0.13, 4), toothMat, g, [tx, bodyY + 0.02, small ? 1.18 : 1.32]);
      tooth.rotation.x = Math.PI; // 朝下
    }
    for (const side of [-1, 1]) {
      const brow = mesh(new THREE.ConeGeometry(0.07, 0.16, 4), bodyMat, head,
        [side * (small ? 0.22 : 0.3), 0.24, small ? 0.2 : 0.28]);
      brow.rotation.x = -0.6;
    }
  }
  if (opts.horns) { // 食肉牛龙的标志性牛角：眼上方两根外撇的角
    for (const side of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.06, 0.36, 6), toothMat, head, [side * 0.26, 0.3, 0.12]);
      horn.rotation.z = side * -0.5;
      horn.rotation.x = -0.2;
    }
  }
  const legs = [];
  for (const side of [-1, 1]) {
    const legH = small ? 0.75 : 0.95;
    const leg = mesh(new THREE.CylinderGeometry(0.1, 0.14, legH, 6), bodyMat, g, [side * 0.34, legH / 2, -0.1]);
    legs.push(leg);
    mesh(new THREE.SphereGeometry(0.13, 6, 5), bodyMat, g, [side * 0.34, legH, -0.1]); // 髋关节圆润收口
    // 三趾脚爪（挂在腿上，随行走摆动）
    for (const tz of [0.06, 0.18]) {
      const toe = mesh(new THREE.ConeGeometry(0.05, 0.16, 4), toothMat, leg, [0, -legH / 2 + 0.02, tz]);
      toe.rotation.x = Math.PI / 2;
    }
    if (opts.sickle) { // 迅猛龙标志性镰刀趾爪
      const sickle = mesh(new THREE.ConeGeometry(0.045, 0.26, 5), toothMat, leg, [0, -legH / 2 + 0.14, 0.16]);
      sickle.rotation.x = -0.9;
    }
    const arm = mesh(new THREE.CylinderGeometry(0.045, 0.06, small ? 0.38 : 0.3, 5), bodyMat, g, [side * 0.38, bodyY + 0.05, 0.52]);
    arm.rotation.z = side * 0.55;
    if (opts.fangs) { // 小手爪（重爪龙的拇指巨爪加大）
      const cs = opts.bigClaw ? 2.1 : 1;
      const claw = mesh(new THREE.ConeGeometry(0.03 * cs, 0.12 * cs, 4), toothMat, g, [side * 0.46, bodyY - 0.08, 0.62]);
      claw.rotation.x = Math.PI / 2;
    }
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
  const model = buildPredator(bodyMat, accentMat, true, { fangs: true });
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
  const model = buildPredator(bodyMat, accentMat, false, { fangs: true });
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
  if (species === 'trex') return buildPredator(bodyMat, accentMat, false, { fangs: true });
  if (species === 'raptor') return buildPredator(bodyMat, accentMat, true, { fangs: true, sickle: true });
  if (species === 'oviraptor') return buildOviraptor(bodyMat, accentMat);
  if (species === 'ankylosaurus') return buildAnkylosaurus(bodyMat, accentMat);
  if (species === 'parasaurolophus') return buildParasaurolophus(bodyMat, accentMat);
  if (species === 'pachycephalosaurus') return buildPachycephalosaurus(bodyMat, accentMat);
  if (species === 'dilophosaurus') return buildDilophosaurus(bodyMat, accentMat);
  if (species === 'diplodocus') return buildDiplodocus(bodyMat, accentMat);
  if (species === 'spinosaurus') return buildSpinosaurus(bodyMat, accentMat);
  if (species === 'therizinosaurus') return buildTherizinosaurus(bodyMat, accentMat);
  if (species === 'mosasaurus') return buildMosasaurus(bodyMat, accentMat);
  if (species === 'carnotaurus') return buildPredator(bodyMat, accentMat, false, { fangs: true, horns: true });
  if (species === 'compsognathus') return buildPredator(bodyMat, accentMat, true);
  if (species === 'gallimimus') return buildGallimimus(bodyMat, accentMat);
  if (species === 'styracosaurus') return buildStyracosaurus(bodyMat, accentMat);
  if (species === 'kentrosaurus') return buildKentrosaurus(bodyMat, accentMat);
  if (species === 'iguanodon') return buildIguanodon(bodyMat, accentMat);
  if (species === 'baryonyx') return buildPredator(bodyMat, accentMat, false, { fangs: true, longSnout: true, bigClaw: true });
  if (species === 'protoceratops') return buildProtoceratops(bodyMat, accentMat);
  if (species === 'pteranodon') return buildPteranodon(bodyMat, accentMat);
  if (species === 'plesiosaurus') return buildPlesiosaurus(bodyMat, accentMat);
  if (species === 'amargasaurus') return buildAmargasaurus(bodyMat, accentMat);
  if (species === 'pachyrhinosaurus') return buildPachyrhinosaurus(bodyMat, accentMat);
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
      // 飞行/游泳的恐龙不在地面猎手的菜单上；同物种不互吃（别吃自己的孩子/同类）
      if (!entity.isDinosaur || entity.flying || entity.swimming || entity.size >= self.size * 0.8) continue;
      if (entity.species === self.species) continue;
    }
    // 食蛋龙不吃自己物种的蛋（别吃自己的孩子）
    if (self.diet === 'egg' && (!entity.isEgg || entity.species === self.species)) continue;
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
    if (entity.kind !== 'fish' || !entity.alive || entity.consumed) continue; // 主干海洋生物的鱼群
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
  // 【混合模型试点】指定物种（当前仅 T-Rex）在 marker 之前换成 glTF 模型，保留全部程序化 AI
  const hybrid = attachHybridModel(group, species, config, variant);
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
    size: config.baseSize * BABY_SCALE,
    hungerTimer: config.diet === 'none'
      ? Infinity
      : Number.isFinite(saved?.hunger) ? saved.hunger : 10 + Math.random() * 10,
    target: null,
    // 必须恢复 eggTimer，否则读档后全体恐龙同时产蛋
    eggTimer: Number.isFinite(saved?.egg) ? saved.egg : 35 + Math.random() * 25,
    mealsEaten: 0,
    lifeState: 'wandering',
    nestTarget: null,
    diving: false, // 翼龙正在低空俯冲捕鱼（供沧龙判定是否跃出捕食）
    perched: false, // 翼龙夜里落地栖息中（落地可被点击抚摸）
  };

  let age = Number.isFinite(saved?.age) ? saved.age : 0;
  let foodGrowth = Number.isFinite(saved?.fg) ? saved.fg : 0;
  // 读档恢复的成年恐龙直接以接近全尺寸出现，不从零长大
  let visualScale = saved ? config.baseSize * growthFactor() * 0.9 : 0.001;
  let wanderTarget = diskTarget();
  let retargetTimer = 0;
  let walkTime = Math.random() * TAU;
  const breathePhase = Math.random() * TAU; // 呼吸微动相位，避免全体同步起伏
  let flightAngle = Math.random() * TAU;
  let layingTime = 0;
  const flightRadius = 8 + Math.random() * 13;
  const flightHeight = 6 + Math.random() * 5;
  // 翼龙捕鱼状态机：soaring 盘旋 / diving 俯冲扎水 / rising 叼鱼爬升 / toRoost 飞向夜栖点 / roosting 落地睡觉
  let flyState = 'soaring';
  let roostTarget = null; // 夜栖目标（高山或就近陆地），入夜时锁定一次
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
  let emoteKind = null;                     // 当前 emote 类型（控制小跳高度等）
  let hiccupTimer = 25 + Math.random() * 55; // 偶发打嗝（漫步时的小俏皮）
  let startleCool = Math.random() * 2;       // 食草龙受惊冷却，避免一群龙抖个不停
  let spinT = -1;                            // 挠痒到位的开心大转圈计时（-1=没在转）
  let treatCool = 0;                         // 啃零食球的间隔冷却（避免每帧狂啃）
  let gazeWonderTimer = 0;                    // 极光仰望时的惊叹小粒子节拍
  let nuzzleCool = 1 + Math.random() * 5;     // 宝宝蹭领队的间隔
  let muddyTimer = 50 + Math.random() * 40;   // 沾泥/干掉的计时（洗澡玩法）
  let mudGroup = null;                       // 泥点容器（懒建）
  let raisedEmitted = age >= 60; // 读档的成年龙不再重复发 raised

  function growthFactor() {
    // 年龄把宝宝带到成年(1.0)；喂食/进食的 foodGrowth 再往上推，上界收口到 MAX_GROWTH
    const ageF = lerp(BABY_SCALE, 1, Math.min(1, age / GROW_SECONDS));
    return Math.min(MAX_GROWTH, ageF + foodGrowth);
  }
  // 成长阶段：0 幼年 / 1 成年(≥1.0×) / 2 巨型(≥1.6×)。按初始体型起算，避免出生/读档瞬间误触发「砰」
  let growthStage = growthFactor() >= 1.6 ? 2 : growthFactor() >= 1 ? 1 : 0;

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
    // 跟随领队：宝宝优先紧跟缓存的同物种成年「领队」，于是一家子排成跟随队列一起走
    if (age < WEAN_AGE && wrapper._leader && wrapper._leader.alive && !wrapper._leader.consumed) {
      const lp = wrapper._leader.object3d.position;
      const off = diskTarget(2.2);
      const x = clamp(lp.x + off.x, -BOUND, BOUND);
      const z = clamp(lp.z + off.z, -BOUND, BOUND);
      if (ctx.terrain.getHeightAt(x, z) > SEA_LEVEL + 0.15) return { x, z };
    }
    if (wrapper._leader && (!wrapper._leader.alive || wrapper._leader.consumed)) wrapper._leader = null;
    if (age >= WEAN_AGE) wrapper._leader = null; // 断奶后独立
    // 结伴：35% 概率去同物种伙伴附近 → 自然成群；宝宝遇到成年同类就认作领队
    if (Math.random() < 0.35) {
      const friends = ctx.entities.filter((e) =>
        e !== wrapper && e.isDinosaur && e.alive && !e.consumed && !e.flying && e.species === species
      );
      if (friends.length) {
        const buddy = friends[(Math.random() * friends.length) | 0];
        if (age < WEAN_AGE && !wrapper._leader && buddy.size >= config.baseSize * 0.95) wrapper._leader = buddy;
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

  // 翼龙夜栖点：全图采样找最高处，够「高山」就栖在山顶；否则退回就近随机陆地降落
  function findRoost(ctx) {
    let best = null;
    let bestH = -Infinity;
    for (let i = 0; i < 24; i++) {
      const c = diskTarget(BOUND);
      const h = ctx.terrain.getHeightAt(c.x, c.z);
      if (h > bestH) { bestH = h; best = c; }
    }
    if (best && bestH >= MOUNTAIN_H) return best;
    return chooseLandTarget(ctx); // 没高山：就近找块陆地降落
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
    // 夜里翼龙要去高山睡觉，让位给夜栖（由飞行分支接管）
    if (wrapper.flying && ctx.skyPhase === 'night') return false;
    // 翼龙繁殖软上限：同物种已经够多就别再产蛋（天敌太少时兜底，避免无限增长）
    if (wrapper.flying) {
      let kin = 0;
      for (const e of ctx.entities) {
        if (e.isDinosaur && e.alive && !e.consumed && e.species === species) kin++;
      }
      if (kin >= PTEROSAUR_SOFT_CAP) {
        wrapper.eggTimer = 20 + Math.random() * 10; // 稍后再试
        return false;
      }
    }
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

  // emote：地面龙小跳/性格反应；飞行龙只迸发粒子（不与飞行高度打架）。可重复触发——连点也始终有反馈。
  // 类型：eat/pet 开心小跳；hiccup 打嗝小跳；yawn 打哈欠（叹气+犯困粒子）；startled 受惊（低头一缩）。
  const EMOTE_PALETTE = {
    eat: ['#ffd27f', '#ffb35c', '#9be08a'],
    pet: HEART_COLORS,
    hiccup: ['#ffe9a8', '#fff2c0'],
    yawn: ['#cfe8ff', '#ffffff', '#e8f4ff'],
    startled: ['#ffffff', '#ffd9d9'],
    tickle: ['#fff0a8', '#ffd3e2', '#c8ffd8'],
  };
  const HOP_EMOTES = new Set(['eat', 'pet', 'hiccup', 'tickle']);
  wrapper.startEmote = (type, ctx) => {
    if (!wrapper.alive || wrapper.consumed) return;
    emoteKind = type;
    if (!wrapper.flying && HOP_EMOTES.has(type)) emoteTime = 0; // 仅这几种做小跳
    if (hybrid && HOP_EMOTES.has(type)) hybrid.react('Jump');  // 模型物种：开心地骨骼跳一下
    if (type === 'yawn') ctx?.audio?.playYawn?.();
    else if (type === 'hiccup') ctx?.audio?.playHiccup?.();
    else if (type === 'startled') { ctx?.audio?.playStartle?.(); nodTime = 0.3; } // 受惊：快速低头一缩
    if (ctx?.particles) {
      const p = group.position;
      const colors = EMOTE_PALETTE[type] || HEART_COLORS;
      const count = type === 'eat' ? 14 : type === 'startled' ? 8 : type === 'yawn' ? 5 : type === 'hiccup' ? 4 : 10;
      ctx.particles.burst({ x: p.x, y: p.y + wrapper.size * 1.2, z: p.z }, {
        count, colors,
        speed: type === 'startled' ? 1.8 : 1.3,
        gravity: type === 'yawn' ? -0.5 : -1.4,
        life: type === 'yawn' ? 1.2 : 0.95, size: 0.22,
      });
    }
  };

  // 抚摸：永远开心（4 岁直觉），睡着的会被摸醒
  wrapper.pet = (ctx) => {
    if (!wrapper.alive || wrapper.consumed) return;
    if (wrapper.flying && wrapper.perched) {
      // 摸醒夜栖的翼龙 → 立刻起飞回到盘旋
      flyState = 'soaring';
      wrapper.perched = false;
      wrapper.lifeState = 'wandering';
      roostTarget = null;
      wakeTimer = 20;
    } else if (wrapper.lifeState === 'sleeping') {
      wrapper.lifeState = 'wandering';
      wakeTimer = 20;
      if (wrapper._snoring) { ctx.audio?.stopSnore?.(wrapper.object3d.id); wrapper._snoring = false; }
    }
    wrapper.startEmote('pet', ctx);
    ctx.audio.playCry(species);
    ctx.bus.emit('pet', { species });
  };

  // 合唱呼应：被点的恐龙叫完，附近同伴依次「应和」——叫一声 + 点头 + 头顶冒小音符
  wrapper.sing = (ctx) => {
    if (!wrapper.alive || wrapper.consumed || wrapper.flying) return;
    if (wrapper.lifeState === 'sleeping') return;
    ctx.audio?.playCry?.(species);
    nodTime = 0.5; // 轻轻点个头
    if (ctx?.particles) {
      const p = group.position;
      ctx.particles.burst({ x: p.x, y: p.y + wrapper.size * 1.35, z: p.z }, {
        count: 4, colors: ['#8be0ff', '#c8b6ff', '#ffffff'], speed: 0.9, gravity: -1.1, life: 1.0, size: 0.18,
      });
    }
  };

  // 洗澡玩法：沾泥/洗净。泥点是 group 的子节点，随体型一起缩放。
  function setMuddy(on) {
    if (on === wrapper.muddy) return;
    wrapper.muddy = on;
    if (on) {
      if (!mudGroup) {
        mudGroup = new THREE.Group();
        for (const [x, y, z] of MUD_SPOTS) {
          const m = new THREE.Mesh(mudGeo, mudMat);
          m.position.set(x, y, z);
          m.scale.setScalar(0.6 + Math.random() * 0.5);
          mudGroup.add(m);
        }
        group.add(mudGroup);
      }
      mudGroup.visible = true;
    } else if (mudGroup) {
      mudGroup.visible = false;
    }
  }
  wrapper.setMuddy = setMuddy; // 调试/测试句柄：强制沾泥/洗净

  // 挠痒：每点一下咯咯笑+扭一下；连挠 4 下笑到打转 + 五彩花瓣喷发（2.5s 不挠就忘掉进度）
  wrapper.tickle = (ctx) => {
    if (!wrapper.alive || wrapper.consumed) return;
    if (wrapper.lifeState === 'sleeping') {
      wrapper.lifeState = 'wandering';
      wakeTimer = 20;
      if (wrapper._snoring) { ctx.audio?.stopSnore?.(wrapper.object3d.id); wrapper._snoring = false; }
    }
    wrapper._tickleCount = (wrapper._tickleCount || 0) + 1;
    wrapper._tickleDecay = 2.5;
    if (wrapper._tickleCount >= 4) {
      wrapper._tickleCount = 0;
      ctx.audio?.playGiggle?.(true);
      if (!wrapper.flying) { emoteTime = -1; spinT = 0; } // 开心大转圈
      const p = group.position;
      ctx.particles.burst({ x: p.x, y: p.y + wrapper.size * 1.3, z: p.z }, {
        count: 26, colors: ['#ff8fb1', '#ffd45e', '#b58cff', '#7ad7ff', '#ff9f5e', '#ffffff'],
        speed: 2.4, gravity: -1.0, life: 1.2, size: 0.22,
      });
    } else {
      wrapper.startEmote('tickle', ctx);
      ctx.audio?.playGiggle?.(false);
    }
  };

  // 手动喂食：玩家点击泡泡上的 🍖 按钮触发。喂食 = 喂饱 + 长大（核心奖励回路）。
  wrapper.feed = (ctx) => {
    if (!wrapper.alive || wrapper.consumed || config.diet === 'none') return;
    wrapper.hungerTimer = SATIATION_MAX; // 一口喂饱，泡泡立刻满格 😊
    wrapper.mealsEaten++;
    foodGrowth += FEED_GROWTH;           // 喂养即成长（戏剧性变大的主推手）
    if (wrapper.lifeState === 'sleeping') {
      wrapper.lifeState = 'wandering';
      wakeTimer = 20;
      if (wrapper._snoring) { ctx.audio?.stopSnore?.(wrapper.object3d.id); wrapper._snoring = false; }
    }
    wrapper.target = null;               // 修：觅食目标字段是 target（原 foodTarget 为空操作）
    wrapper.startEmote('eat', ctx);
    ctx.audio.playTreat();               // 专属「好吃!」音效，区别于自动进食
    ctx.particles.burst(group.position, {
      count: 22, colors: ['#ff6f9c', '#ff9ec4', '#ffd3e2', '#fff2c0'],
      gravity: -1.6, life: 1.1, speed: 2.3, size: 0.22,
    });
    ctx.bus.emit('feed', { species });
  };

  wrapper.update = (dt, ctx) => {
    if (!wrapper.alive) return;
    age += dt;
    if (hybrid) hybrid.update(dt, wrapper.lifeState); // 骨骼动画每帧推进（须在各种早退之前）
    // 挠痒进度衰减：2.5s 不挠就忘掉连击数
    if (wrapper._tickleDecay > 0) {
      wrapper._tickleDecay -= dt;
      if (wrapper._tickleDecay <= 0) wrapper._tickleCount = 0;
    }
    if (!raisedEmitted && age >= 60) {
      raisedEmitted = true;
      ctx.bus.emit('raised', { species });
    }
    wrapper.eggTimer = Math.max(0, wrapper.eggTimer - dt);
    const desiredScale = config.baseSize * growthFactor();
    wrapper.size = desiredScale;
    // 成长「砰」：跨过成年(1.0×)/巨型(1.6×)阈值时金光 + 音效，让「长大」看得见
    const gStage = desiredScale >= config.baseSize * 1.6 ? 2 : desiredScale >= config.baseSize ? 1 : 0;
    if (gStage > growthStage) {
      growthStage = gStage;
      if (age > 0.6 && ctx.particles) {
        const gp = group.position;
        ctx.particles.burst({ x: gp.x, y: gp.y + wrapper.size, z: gp.z }, {
          count: 16, colors: ['#ffe08a', '#fff6cf', '#ffd34d'], speed: 1.8, gravity: -1.0, life: 1.0, size: 0.26,
        });
        ctx.audio?.playSparkle?.();
      }
    }
    const intro = age < 0.45 ? Math.max(0.001, easeOutBack(age / 0.45)) : 1;
    visualScale += (desiredScale * intro - visualScale) * Math.min(1, dt * 5);
    // 呼吸微动：轻微的整体起伏，让所有恐龙都「活」起来（emote/被吃时各自的分支会覆盖）
    const breathe = 1 + Math.sin((age + breathePhase) * 2.2) * 0.02;
    group.scale.setScalar(visualScale * breathe);
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
      const hopScale = emoteKind === 'hiccup' ? 0.22 : 0.55; // 打嗝是小跳一下
      p.y = Math.max(ctx.seaLevel, ctx.terrain.getHeightAt(p.x, p.z)) + hop * wrapper.size * hopScale;
      // 起跳拉伸、落地压扁
      const squash = t > 0.82 ? 1 - Math.sin(((t - 0.82) / 0.18) * Math.PI) * 0.2 : 1 + hop * 0.12;
      const wide = 1 + (1 - squash) * 0.6;
      group.scale.set(visualScale * wide, visualScale * squash, visualScale * wide);
      if (t >= 1) emoteTime = -1;
      return;
    }

    // 挠痒到位：开心地原地快转一圈 + 小跳，0.8s 渐停
    if (spinT >= 0) {
      spinT += dt;
      const t = Math.min(1, spinT / 0.8);
      group.rotation.y += dt * 16 * (1 - t * 0.7);
      const hop = Math.sin(t * Math.PI);
      const p = group.position;
      p.y = Math.max(ctx.seaLevel, ctx.terrain.getHeightAt(p.x, p.z)) + hop * wrapper.size * 0.5;
      group.scale.setScalar(visualScale * (1 + hop * 0.14));
      if (t >= 1) spinT = -1;
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
    hiccupTimer -= dt;

    // 洗澡玩法：陆地恐龙偶尔沾上泥点（~50-90s 一轮），洗净或自然干掉后再循环；泡泡棒可提前洗净
    if (!wrapper.flying && !wrapper.swimming) {
      muddyTimer -= dt;
      if (muddyTimer <= 0) {
        if (wrapper.muddy) { setMuddy(false); muddyTimer = 45 + Math.random() * 55; }
        else { setMuddy(true); muddyTimer = 50 + Math.random() * 40; }
      }
    }

    // 极光仰望：极光降临时，地面恐龙停下脚步、坐低一点、缓缓抬头望天（情感「啊~」时刻）
    if (
      ctx.auroraUntil && ctx.time < ctx.auroraUntil &&
      !wrapper.flying && !wrapper.swimming &&
      wrapper.lifeState !== 'sleeping' && wrapper.lifeState !== 'laying'
    ) {
      wrapper.lifeState = 'gazing';
      wrapper.target = null;
      alertMarker.visible = false;
      group.rotation.x += (-0.24 - group.rotation.x) * Math.min(1, dt * 3); // 缓缓抬头
      group.scale.set(visualScale * breathe, visualScale * breathe * 0.93, visualScale * breathe); // 坐低一点
      gazeWonderTimer -= dt;
      if (gazeWonderTimer <= 0 && ctx.particles) {
        gazeWonderTimer = 1.4 + Math.random() * 1.6;
        const p = group.position;
        ctx.particles.burst({ x: p.x, y: p.y + wrapper.size * 1.6, z: p.z }, {
          count: 2, colors: ['#b9a4ff', '#8be0ff', '#fff2c0'], speed: 0.4, gravity: -0.4, life: 1.5, size: 0.13,
        });
      }
      return;
    }
    // 仰望结束后让抬起的头缓缓回正
    if (nodTime <= 0 && group.rotation.x !== 0) {
      group.rotation.x += (0 - group.rotation.x) * Math.min(1, dt * 4);
      if (Math.abs(group.rotation.x) < 0.002) group.rotation.x = 0;
    }

    // 集合：白天吹哨 → 同物种地面龙聚向哨声点（优先于觅食/漫步；睡觉/飞行/游泳不响应）
    if (
      ctx.gatherUntil && ctx.time < ctx.gatherUntil && ctx.gatherTo &&
      !wrapper.flying && !wrapper.swimming && wrapper.lifeState !== 'sleeping'
    ) {
      wrapper.lifeState = 'gathering';
      wrapper.target = null;
      alertMarker.visible = false;
      moveToward(ctx.gatherTo, dt, ctx.terrain, 1.35);
      return;
    }

    // 受惊：食草龙发现附近有正在捕猎的食肉龙 → 低头一缩（无伤，纯表情，教孩子读情绪）
    startleCool -= dt;
    if (
      startleCool <= 0 && config.diet === 'herbivore' &&
      !wrapper.flying && !wrapper.swimming && emoteTime < 0 && wrapper.lifeState !== 'sleeping'
    ) {
      startleCool = 1.2 + Math.random();
      for (const other of ctx.entities) {
        if (other === wrapper || !other.isDinosaur || !other.alive || other.consumed) continue;
        if (other.diet !== 'carnivore' || !other.target) continue;
        const dx = other.object3d.position.x - group.position.x;
        const dz = other.object3d.position.z - group.position.z;
        if (dx * dx + dz * dz < 100) { wrapper.startEmote('startled', ctx); break; }
      }
    }

    // 追泡泡：附近有低空泡泡就跑去顶破（玩耍，优先于觅食/漫步；飞行/游泳/睡觉不参与）
    if (
      ctx.bubbleUntil && ctx.time < ctx.bubbleUntil &&
      !wrapper.flying && !wrapper.swimming && wrapper.lifeState !== 'sleeping'
    ) {
      let bub = null, bd = 36; // 6u 内
      for (const e of ctx.entities) {
        if (!e.isBubble || !e.alive || e.consumed) continue;
        if (e.object3d.position.y - group.position.y > wrapper.size * 2.6) continue; // 太高够不着，随它飘走
        const dx = e.object3d.position.x - group.position.x;
        const dz = e.object3d.position.z - group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bd) { bd = d2; bub = e; }
      }
      if (bub) {
        wrapper.lifeState = 'playing';
        wrapper.target = null;
        alertMarker.visible = false;
        const d = moveToward({ x: bub.object3d.position.x, z: bub.object3d.position.z }, dt, ctx.terrain, 1.5);
        if (d <= Math.max(0.8, wrapper.size * 0.85) && bub.consume(ctx.removeEntity)) {
          wrapper.startEmote('pet', ctx); // 顶破了开心一下
          // 泡泡顺手把身上的泥点洗干净 → 闪亮 + 肥皂泡
          if (wrapper.muddy) {
            setMuddy(false);
            muddyTimer = 50 + Math.random() * 50;
            ctx.audio?.playSparkle?.();
            const p = group.position;
            ctx.particles.burst({ x: p.x, y: p.y + wrapper.size, z: p.z }, {
              count: 12, colors: ['#ffffff', '#cdeeff', '#bdf0ff', '#fff2c0'],
              speed: 1.4, gravity: -0.6, life: 1.0, size: 0.16,
            });
          }
        }
        return;
      }
    }

    // 追零食球：附近有滚动的零食球就跑去啃几口（玩耍＋进食，喂养回路的自动版；飞行/游泳/睡觉不参与）
    if (treatCool > 0) treatCool -= dt;
    if (
      ctx.treatUntil && ctx.time < ctx.treatUntil &&
      !wrapper.flying && !wrapper.swimming && wrapper.lifeState !== 'sleeping'
    ) {
      let ball = null, td = 100; // 10u 内找最近的零食球
      for (const e of ctx.entities) {
        if (!e.isTreat || !e.alive || e.consumed) continue;
        const dx = e.object3d.position.x - group.position.x;
        const dz = e.object3d.position.z - group.position.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < td) { td = d2; ball = e; }
      }
      if (ball) {
        wrapper.lifeState = 'playing';
        wrapper.target = null;
        alertMarker.visible = false;
        const d = moveToward({ x: ball.object3d.position.x, z: ball.object3d.position.z }, dt, ctx.terrain, 1.5);
        if (d <= Math.max(0.9, wrapper.size * 0.8) && treatCool <= 0 && ball.nibble(0.34, ctx)) {
          treatCool = 0.5;
          wrapper.hungerTimer = Math.min(SATIATION_MAX, wrapper.hungerTimer + 16); // 啃一口补点饱
          foodGrowth += 0.04;                                                       // 也长一点点
          wrapper.startEmote('eat', ctx);
          ctx.audio?.playCrunch?.();
          const bp = ball.object3d.position;
          ctx.particles.burst({ x: bp.x, y: bp.y + 0.2, z: bp.z }, {
            count: 6, colors: ['#ffd98a', '#f6a35c', '#fff3d6'], speed: 1.4, gravity: 5, life: 0.5, size: 0.13,
          });
        }
        return;
      }
    }

    if (wrapper.flying) {
      const p = group.position;
      const flap = Math.sin(ctx.time * 8) * 0.65;

      // ---- 夜栖：天亮起飞复位 / 入夜从盘旋切入飞向夜栖点 ----
      if ((flyState === 'toRoost' || flyState === 'roosting') && ctx.skyPhase !== 'night') {
        flyState = 'soaring';
        wrapper.perched = false;
        wrapper.lifeState = 'wandering';
        roostTarget = null;
      } else if (flyState === 'soaring' && ctx.skyPhase === 'night') {
        roostTarget = roostTarget || findRoost(ctx);
        flyState = 'toRoost';
      }

      // ---- 飞向夜栖点：水平靠拢 + 缓降贴地，收翅准备落地 ----
      if (flyState === 'toRoost') {
        const ground = Math.max(SEA_LEVEL, ctx.terrain.getHeightAt(roostTarget.x, roostTarget.z));
        const landY = ground + wrapper.size * 0.4;
        const dx = roostTarget.x - p.x;
        const dz = roostTarget.z - p.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.05) {
          const speed = config.speed * 6;
          p.x += (dx / dist) * speed * dt;
          p.z += (dz / dist) * speed * dt;
          group.rotation.y = Math.atan2(dx, dz);
        }
        p.y += (landY - p.y) * Math.min(1, dt * 2.5);
        group.rotation.x = 0;
        model.wings[0].rotation.x = -0.3;
        model.wings[1].rotation.x = -0.3;
        if (dist < 0.4 && Math.abs(p.y - landY) < 0.25) {
          p.set(roostTarget.x, landY, roostTarget.z);
          flyState = 'roosting';
          wrapper.lifeState = 'sleeping';
          wrapper.perched = true;
          nodTime = 0;
          group.rotation.x = 0;
        }
        return;
      }

      // ---- 落地睡觉：折翅贴地，呼吸起伏 + 💤（落地的翼龙可被点击抚摸唤醒）----
      if (flyState === 'roosting') {
        const ground = Math.max(SEA_LEVEL, ctx.terrain.getHeightAt(p.x, p.z));
        p.y = ground + wrapper.size * 0.4;
        model.wings[0].rotation.x = -0.9;
        model.wings[1].rotation.x = -0.9;
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
      if (wrapper._snoring) { ctx.audio?.stopSnore?.(wrapper.object3d.id); wrapper._snoring = false; }
    } else if (
      wrapper.lifeState !== 'sleeping' &&
      ctx.skyPhase === 'night' && !wrapper.target && wrapper.eggTimer > 5 && wakeTimer === 0
    ) {
      wrapper.startEmote('yawn', ctx); // 入睡前打个大哈欠
      wrapper.lifeState = 'sleeping';
      nodTime = 0; // 入睡打断点头：复位角度，避免歪着头睡一整晚
      group.rotation.x = 0;
    }
    if (wrapper.lifeState === 'sleeping') {
      alertMarker.visible = false;
      sleepMarker.visible = true;
      // 叠叠睡：夜里同物种就近挨成一小堆（确定性领队=范围内最小 id，避免抖动）
      let leader = wrapper, idx = 0, pileSize = 1;
      for (const e of ctx.entities) {
        if (e === wrapper || !e.isDinosaur || !e.alive || e.consumed) continue;
        if (e.flying || e.swimming || e.species !== species || e.lifeState !== 'sleeping') continue;
        const ex = e.object3d.position.x - group.position.x;
        const ez = e.object3d.position.z - group.position.z;
        if (ex * ex + ez * ez > 9) continue; // 3u 内才算同一堆
        pileSize++;
        if (e.object3d.id < leader.object3d.id) leader = e;
        if (e.object3d.id < wrapper.object3d.id) idx++;
      }
      if (leader !== wrapper) {
        // 朝领队轻轻靠拢到一臂之距 + 按层序微微叠高，蜷成软软一小堆
        const lp = leader.object3d.position;
        const dxl = lp.x - group.position.x, dzl = lp.z - group.position.z;
        const dl = Math.hypot(dxl, dzl);
        const minGap = wrapper.size * 0.7;
        if (dl > minGap) {
          const pull = Math.min(1, dt * 0.8) * (dl - minGap) / dl;
          group.position.x += dxl * pull;
          group.position.z += dzl * pull;
        }
        const baseY = Math.max(ctx.seaLevel, ctx.terrain.getHeightAt(group.position.x, group.position.z));
        const targetY = baseY + Math.min(idx, 3) * wrapper.size * 0.3;
        group.position.y += (targetY - group.position.y) * Math.min(1, dt * 2);
      }
      // 领队打鼾（仅成堆时）；非领队/单独睡则确保不响
      const amLeader = pileSize > 1 && leader === wrapper;
      if (amLeader && !wrapper._snoring) { ctx.audio?.startSnore?.(wrapper.object3d.id); wrapper._snoring = true; }
      else if (!amLeader && wrapper._snoring) { ctx.audio?.stopSnore?.(wrapper.object3d.id); wrapper._snoring = false; }
      sleepMarker.scale.setScalar(Math.min(1.5, 1 + (pileSize - 1) * 0.18)); // 堆越大 💤 越大
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
        foodGrowth += EAT_GROWTH;
        wrapper.mealsEaten++;
        wrapper.hungerTimer = 34 + Math.random() * 14; // 吃饱后更久才再觅食，别一直在吃
        wrapper.target = null;
        alertMarker.visible = false;
        ctx.spawnPoop(wrapper);
        ctx.audio.playEat();
        ctx.bus.emit('eat', { species, diet: wrapper.diet });
        wrapper.startEmote('eat', ctx);
        if (hybrid && wrapper.diet === 'carnivore') hybrid.react('Attack'); // 模型食肉龙：捕食咬一口
      }
      return;
    }

    wrapper.lifeState = 'wandering';
    // 偶发打嗝：安静漫步时冷不丁「嗝」一下小跳，纯俏皮
    if (hiccupTimer <= 0 && emoteTime < 0) {
      hiccupTimer = 25 + Math.random() * 55;
      wrapper.startEmote('hiccup', ctx);
    }
    // 跟随领队：宝宝就近认一只成年同类当领队，落后了就一路小跑追上去 → 肉眼可见的跟随队列
    if (age < WEAN_AGE) {
      if (wrapper._leader && (!wrapper._leader.alive || wrapper._leader.consumed)) wrapper._leader = null;
      wrapper._leaderScan = (wrapper._leaderScan || 0) - dt;
      if (!wrapper._leader && wrapper._leaderScan <= 0) {
        wrapper._leaderScan = 1.5;
        let best = null, bd = 144; // 12u 内找最近的成年同类
        for (const e of ctx.entities) {
          if (e === wrapper || !e.isDinosaur || !e.alive || e.consumed || e.flying || e.swimming) continue;
          if (e.species !== species || e.size < config.baseSize * 0.95) continue;
          const dx = e.object3d.position.x - group.position.x;
          const dz = e.object3d.position.z - group.position.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bd) { bd = d2; best = e; }
        }
        wrapper._leader = best;
      }
      nuzzleCool -= dt;
      if (wrapper._leader) {
        const lp = wrapper._leader.object3d.position;
        const ld = Math.hypot(lp.x - group.position.x, lp.z - group.position.z);
        if (ld > 3.5) {
          wanderTarget = { x: lp.x, z: lp.z }; // 落后了 → 直接追领队
        } else if (ld < 1.8 && nuzzleCool <= 0) {
          // 挨着领队了：蹭一下冒爱心，领队放慢脚步等等它（亲子萌时刻）
          nuzzleCool = 6 + Math.random() * 4;
          wrapper.startEmote('pet', ctx);
          wrapper._leader._waitTimer = 1.4;
        }
      }
    } else {
      wrapper._leader = null; // 断奶后独立
    }
    if (wrapper._waitTimer > 0) {
      wrapper._waitTimer -= dt; // 停下等等跟在身后的宝宝，原地踏步（呼吸/点头照常）
      return;
    }
    if (
      wrapper._waterBlocked ||
      Math.hypot(wanderTarget.x - group.position.x, wanderTarget.z - group.position.z) < 0.8
    ) {
      wanderTarget = chooseLandTarget(ctx); // 到达或被水挡住 → 转身往内陆重选
    }
    moveToward(wanderTarget, dt, ctx.terrain);
  };

  // 头顶肚子条读取：dietNone（翼龙/沧龙吃鱼，总是满足）；否则 hungerTimer 换算 0~1 饱度
  wrapper.getHunger = () => ({
    dietNone: config.diet === 'none',
    fullness: config.diet === 'none' ? 1 : clamp(wrapper.hungerTimer / SATIATION_MAX, 0, 1),
  });

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
