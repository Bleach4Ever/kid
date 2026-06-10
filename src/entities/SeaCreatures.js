import * as THREE from 'three';
import { SEA_LEVEL, WORLD_SIZE } from '../constants.js';
import { clamp } from '../utils.js';

// 程序化海洋生物：鱼群 / 水母 / 海龟 / 海底螃蟹 / 海星。
// 全部低多边形、零外部素材，仅作环境点缀；点一下（pet）有可爱反应，不进图鉴、不入存档。
// 小工具就地复制自 Dinosaur.js 的写法（不 import、不改原文件，规避与其它 session 的冲突）。
const BOUND = WORLD_SIZE * 0.46;
const eyeMat = new THREE.MeshStandardMaterial({ color: '#2a2a3a', flatShading: true, roughness: 0.5 });

const FISH_BODY = ['#ff8a5b', '#ffd166', '#5ad1c9', '#7aa6ff', '#ff9ec4', '#ffa64d'];
const FISH_FIN = ['#ffd9b0', '#fff0b0', '#bdf3ee', '#cfe0ff', '#ffd0e6', '#ffe0b0'];
const JELLY = ['#ff9ec4', '#b9a4ff', '#8be0ff', '#ffd1ec'];
const STAR = ['#ff8fb5', '#ffd166', '#ff9e6b', '#c9a4ff'];

export const SEABED_KINDS = new Set(['crab', 'starfish']);

const pick = (arr) => arr[(Math.random() * arr.length) | 0];

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7, ...opts });
}

function mesh(geometry, material, parent, position, scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = false; // 水下生物不投影，省阴影开销
  parent.add(m);
  return m;
}

function addEyes(parent, y, z, spread, r = 0.05) {
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(r, 6, 6), eyeMat, parent, [s * spread, y, z]);
  }
}

// 深水采样：返回一个海床低于 SEA_LEVEL-0.6 的点；采不到返回 null。
// 默认搜全图（出生点用，深水常在小岛外圈）；游走时传入较小 radius 留在本地海域，避免横穿小岛搁浅。
export function deepWaterTarget(terrain, near = null, radius = BOUND) {
  for (let i = 0; i < 10; i++) {
    let x;
    let z;
    if (near) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * radius;
      x = clamp(near.x + Math.cos(a) * r, -BOUND, BOUND);
      z = clamp(near.z + Math.sin(a) * r, -BOUND, BOUND);
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (terrain.getHeightAt(x, z) < SEA_LEVEL - 0.6) return { x, z };
  }
  return null;
}

function moveTowardXZ(group, target, speed, dt) {
  const dx = target.x - group.position.x;
  const dz = target.z - group.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.05) {
    group.position.x += (dx / d) * speed * dt;
    group.position.z += (dz / d) * speed * dt;
    group.rotation.y = Math.atan2(dx, dz);
  }
  return d;
}

// 点击反应的缩放弹跳系数（同时递减点击冷却）
function reactFactor(w, dt) {
  if (w._petCD > 0) w._petCD -= dt;
  if (w._reactT >= 0) {
    w._reactT += dt;
    if (w._reactT > 0.7) {
      w._reactT = -1;
      return 1;
    }
    return 1 + Math.sin(w._reactT * 22) * 0.16 * Math.max(0, 1 - w._reactT * 1.4);
  }
  return 1;
}

// 搁浅（地形被堆高到接近水面）→ 缩成 0 优雅消失再移除。返回 true 表示正在消失
function fadeStep(w, dt, ctx) {
  if (w._fade < 0) return false;
  w._fade += dt;
  w.object3d.scale.setScalar(Math.max(0, 1 - w._fade / 0.4));
  if (w._fade >= 0.4) ctx.removeEntity(w);
  return true;
}

function baseWrapper(group, kind, update) {
  return {
    object3d: group,
    kind,
    isSeaLife: true,
    alive: true,
    consumed: false,
    _petCD: 0,
    _reactT: -1,
    _fade: -1,
    seed: Math.random() * Math.PI * 2,
    target: null,
    update,
    pet(ctx) {
      if (!this.alive || this._petCD > 0 || this._fade >= 0) return;
      this._petCD = 0.6;
      this._reactT = 0;
      const p = group.position;
      ctx.particles.burst({ x: p.x, y: p.y + 0.4, z: p.z }, {
        count: 8, colors: ['#bfeaff', '#eafaff', '#9fd8f5'], speed: 0.5, gravity: -1.2, life: 1.1, size: 0.13,
      });
      ctx.audio.playBlub();
    },
    // 被翼龙俯冲 / 沧龙跃捕叼走：触发缩没动画（复用搁浅淡出），fadeStep 到时移除
    consume() {
      if (!this.alive || this.consumed) return false;
      this.consumed = true;
      if (this._fade < 0) this._fade = 0;
      return true;
    },
  };
}

// ---------------- 🐟 鱼群：一个 Group 装 6-10 条小鱼，共享游动目标 ----------------
export function createFishSchool(terrain) {
  const group = new THREE.Group();
  const bodyMat = mat(pick(FISH_BODY), { roughness: 0.45, metalness: 0.15 });
  const finMat = mat(pick(FISH_FIN), { roughness: 0.5 });
  const n = 4 + ((Math.random() * 3) | 0); // 每群 4-6 条，别太密
  const fish = [];
  for (let i = 0; i < n; i++) {
    const f = new THREE.Group();
    mesh(new THREE.IcosahedronGeometry(0.18, 0), bodyMat, f, [0, 0, 0], [0.7, 0.9, 1.7]);
    const tail = mesh(new THREE.ConeGeometry(0.12, 0.22, 4), finMat, f, [0, 0, -0.34]);
    tail.rotation.x = -Math.PI / 2;
    mesh(new THREE.ConeGeometry(0.08, 0.18, 4), finMat, f, [0, 0.16, 0], [1, 1, 0.5]); // 背鳍
    addEyes(f, 0.05, 0.2, 0.09, 0.03);
    f.position.set((Math.random() - 0.5) * 1.7, (Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 1.7);
    f.userData = { tail, phase: Math.random() * Math.PI * 2, slot: f.position.clone() };
    group.add(f);
    fish.push(f);
  }
  const speed = 1.6 + Math.random() * 0.8;

  const w = baseWrapper(group, 'fish', function (dt, ctx) {
    if (fadeStep(w, dt, ctx)) return;
    if (!w.target || Math.hypot(w.target.x - group.position.x, w.target.z - group.position.z) < 1.5) {
      w.target = deepWaterTarget(ctx.terrain, group.position, BOUND * 0.45) || w.target;
    }
    if (w.target) moveTowardXZ(group, w.target, speed, dt);
    const seabed = ctx.terrain.getHeightAt(group.position.x, group.position.z);
    if (seabed > SEA_LEVEL - 0.4 && w._fade < 0) w._fade = 0;
    group.position.y = clamp(SEA_LEVEL - 0.55 + Math.sin(ctx.time * 1.2 + w.seed) * 0.12, seabed + 0.3, SEA_LEVEL - 0.35);
    for (const f of fish) {
      f.userData.tail.rotation.y = Math.sin(ctx.time * 8 + f.userData.phase) * 0.5;
      f.position.y = f.userData.slot.y + Math.sin(ctx.time * 1.6 + f.userData.phase) * 0.06;
    }
    group.scale.setScalar(reactFactor(w, dt));
  });
  return w;
}

// ---------------- 🪼 水母：半球伞 + 触手，垂直慢浮 + 伞脉冲 ----------------
export function createJellyfish() {
  const group = new THREE.Group();
  const col = pick(JELLY);
  const bellMat = mat(col, { transparent: true, opacity: 0.6, emissive: new THREE.Color(col), emissiveIntensity: 0.3, roughness: 0.4 });
  const bell = mesh(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bellMat, group, [0, 0, 0]);
  const tentMat = mat(col, { transparent: true, opacity: 0.5 });
  const tents = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tnt = mesh(new THREE.ConeGeometry(0.045, 0.55, 4), tentMat, group, [Math.cos(a) * 0.24, -0.28, Math.sin(a) * 0.24]);
    tnt.rotation.x = Math.PI;
    tents.push(tnt);
  }
  const speed = 0.5 + Math.random() * 0.3;

  const w = baseWrapper(group, 'jelly', function (dt, ctx) {
    if (fadeStep(w, dt, ctx)) return;
    if (!w.target || Math.hypot(w.target.x - group.position.x, w.target.z - group.position.z) < 1) {
      w.target = deepWaterTarget(ctx.terrain, group.position, BOUND * 0.45) || w.target;
    }
    if (w.target) moveTowardXZ(group, w.target, speed, dt);
    const seabed = ctx.terrain.getHeightAt(group.position.x, group.position.z);
    if (seabed > SEA_LEVEL - 0.4 && w._fade < 0) w._fade = 0;
    group.position.y = clamp(SEA_LEVEL - 0.7 + Math.sin(ctx.time * 0.8 + w.seed) * 0.3, seabed + 0.3, SEA_LEVEL - 0.35);
    const react = reactFactor(w, dt);
    const pulse = 1 + Math.sin(ctx.time * 1.6 + w.seed) * 0.08;
    bell.scale.set(pulse * react, (2 - pulse) * react, pulse * react);
    for (let i = 0; i < tents.length; i++) {
      tents[i].rotation.x = Math.PI + Math.sin(ctx.time * 1.2 + i) * 0.22;
    }
  });
  return w;
}

// ---------------- 🐢 海龟：扁壳 + 头 + 4 鳍，缓慢滑行 ----------------
export function createTurtle() {
  const group = new THREE.Group();
  const shellMat = mat('#4f9a63', { roughness: 0.6 });
  const skinMat = mat('#cfe8a0', { roughness: 0.7 });
  mesh(new THREE.IcosahedronGeometry(0.5, 1), shellMat, group, [0, 0, 0], [1.1, 0.5, 1.3]);
  const head = mesh(new THREE.SphereGeometry(0.18, 8, 8), skinMat, group, [0, 0.02, 0.62]);
  addEyes(head, 0.05, 0.13, 0.09, 0.035);
  const flippers = [];
  for (const side of [-1, 1]) {
    for (const z of [0.32, -0.34]) {
      const fl = mesh(new THREE.ConeGeometry(0.12, 0.42, 4), skinMat, group, [side * 0.42, -0.02, z]);
      fl.rotation.z = side * (Math.PI / 2 + 0.3);
      flippers.push(fl);
    }
  }
  const speed = 0.85 + Math.random() * 0.3;

  const w = baseWrapper(group, 'turtle', function (dt, ctx) {
    if (fadeStep(w, dt, ctx)) return;
    if (!w.target || Math.hypot(w.target.x - group.position.x, w.target.z - group.position.z) < 1.5) {
      w.target = deepWaterTarget(ctx.terrain, group.position, BOUND * 0.45) || w.target;
    }
    if (w.target) moveTowardXZ(group, w.target, speed, dt);
    const seabed = ctx.terrain.getHeightAt(group.position.x, group.position.z);
    if (seabed > SEA_LEVEL - 0.4 && w._fade < 0) w._fade = 0;
    group.position.y = clamp(SEA_LEVEL - 0.6 + Math.sin(ctx.time * 1 + w.seed) * 0.12, seabed + 0.35, SEA_LEVEL - 0.35);
    group.rotation.z = Math.sin(ctx.time * 0.9 + w.seed) * 0.06;
    for (let i = 0; i < flippers.length; i++) {
      flippers[i].rotation.x = Math.sin(ctx.time * 2 + i) * 0.4;
    }
    group.scale.setScalar(reactFactor(w, dt));
  });
  return w;
}

// ---------------- 🦀 螃蟹：贴海底横爬，偶尔挥钳 ----------------
export function createCrab() {
  const group = new THREE.Group();
  const shellMat = mat('#ff6b5e', { roughness: 0.6 });
  mesh(new THREE.IcosahedronGeometry(0.28, 0), shellMat, group, [0, 0.16, 0], [1.4, 0.7, 1]);
  for (const side of [-1, 1]) {
    const stalk = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 4), shellMat, group, [side * 0.1, 0.34, 0.16]);
    addEyes(stalk, 0.09, 0, 0, 0.045);
  }
  const claws = [];
  for (const side of [-1, 1]) {
    const claw = mesh(new THREE.IcosahedronGeometry(0.12, 0), shellMat, group, [side * 0.4, 0.16, 0.18]);
    claws.push({ claw, side });
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 4), shellMat, group, [side * 0.34, 0.06, -0.14 + i * 0.14]).rotation.z = side * 0.9;
    }
  }
  const speed = 0.6 + Math.random() * 0.3;

  const w = baseWrapper(group, 'crab', function (dt, ctx) {
    if (fadeStep(w, dt, ctx)) return;
    if (!w.target || Math.hypot(w.target.x - group.position.x, w.target.z - group.position.z) < 0.8) {
      w.target = deepWaterTarget(ctx.terrain, group.position, BOUND * 0.25) || w.target;
    }
    if (w.target) moveTowardXZ(group, w.target, speed, dt);
    const seabed = ctx.terrain.getHeightAt(group.position.x, group.position.z);
    if (seabed > SEA_LEVEL - 0.4 && w._fade < 0) w._fade = 0;
    group.position.y = seabed + 0.05;
    const snap = Math.max(0, Math.sin(ctx.time * 3 + w.seed)) * 0.4;
    for (const c of claws) c.claw.rotation.z = c.side * snap;
    group.scale.setScalar(reactFactor(w, dt));
  });
  return w;
}

// ---------------- ⭐ 海星：贴海底近静止，点击转一圈 ----------------
export function createStarfish() {
  const group = new THREE.Group();
  const col = pick(STAR);
  const starMat = mat(col, { roughness: 0.7 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const arm = mesh(new THREE.ConeGeometry(0.12, 0.42, 4), starMat, group, [Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2]);
    arm.rotation.x = Math.PI / 2;
    arm.rotation.y = -a;
  }
  mesh(new THREE.SphereGeometry(0.14, 8, 6), starMat, group, [0, 0.06, 0], [1, 0.5, 1]);

  const w = baseWrapper(group, 'starfish', function (dt, ctx) {
    if (fadeStep(w, dt, ctx)) return;
    const seabed = ctx.terrain.getHeightAt(group.position.x, group.position.z);
    if (seabed > SEA_LEVEL - 0.4 && w._fade < 0) w._fade = 0;
    group.position.y = seabed + 0.04;
    if (w._reactT >= 0) group.rotation.y += dt * 6; // 点击 → 慢慢转一圈
    const react = reactFactor(w, dt);
    const breathe = 1 + Math.sin(ctx.time * 1.5 + w.seed) * 0.04;
    group.scale.setScalar(react * breathe);
  });
  return w;
}

export const SEA_BUILDERS = {
  fish: createFishSchool,
  jelly: createJellyfish,
  turtle: createTurtle,
  crab: createCrab,
  starfish: createStarfish,
};
