import * as THREE from 'three';
import { clamp, easeOutBack, TAU } from '../utils.js';
import { SEA_LEVEL } from '../constants.js';

// 水里的小鱼：翼龙俯冲捕食的猎物、沧龙的口粮，也给水面增添生机。
// 纯程序化（零素材）、共享几何/材质、环境性质（不进存档，由 FishSchool 自动补充）。

// 粉彩配色
const FISH_COLORS = [
  { body: '#ff9e6b', fin: '#ffd0a8' },
  { body: '#6fc3e8', fin: '#bfeaff' },
  { body: '#ff9ec4', fin: '#ffd3e6' },
  { body: '#ffd66b', fin: '#fff0b8' },
  { body: '#8fd9a0', fin: '#cdf0d3' },
];
const bodyMats = FISH_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c.body, flatShading: true, roughness: 0.7 })
);
const finMats = FISH_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c.fin, flatShading: true, roughness: 0.7 })
);
const fishEyeMat = new THREE.MeshStandardMaterial({ color: '#2c2230', roughness: 0.6 });

// 共享几何（标记 shared，避免实例回收时被 dispose——与 Tree 一致）
const shared = (geo) => {
  geo.userData.shared = true;
  return geo;
};
const bodyGeo = shared(new THREE.IcosahedronGeometry(0.17, 1));
const tailGeo = shared(new THREE.ConeGeometry(0.14, 0.26, 4));
const dorsalGeo = shared(new THREE.ConeGeometry(0.08, 0.16, 3));
const eyeGeo = shared(new THREE.SphereGeometry(0.03, 6, 6));

export function createFish() {
  const ci = (Math.random() * FISH_COLORS.length) | 0;
  const bodyMat = bodyMats[ci];
  const finMat = finMats[ci];

  const group = new THREE.Group();

  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.scale.set(0.75, 0.85, 1.7); // 窄、略高、修长 → 鱼形
  // 不投阴影：鱼很小且贴水面，阴影是噪点，也省去软件渲染下的阴影开销
  group.add(body);

  // 尾鳍：用一个枢轴 group 摆动，锥尖朝后压扁成扇形
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0, -0.26);
  const tailFin = new THREE.Mesh(tailGeo, finMat);
  tailFin.rotation.x = Math.PI / 2;
  tailFin.position.set(0, 0, -0.13);
  tailFin.scale.set(1.1, 1, 0.5);
  tailPivot.add(tailFin);
  group.add(tailPivot);

  const dorsal = new THREE.Mesh(dorsalGeo, finMat);
  dorsal.position.set(0, 0.14, -0.02);
  dorsal.scale.set(0.7, 1, 1.4);
  group.add(dorsal);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, fishEyeMat);
    eye.position.set(side * 0.085, 0.04, 0.17);
    group.add(eye);
  }

  const baseScale = 1.05 + Math.random() * 0.5;
  const speed = 1.1 + Math.random() * 0.8;
  const wanderR = 4 + Math.random() * 3;
  let age = 0;
  let swimTime = Math.random() * TAU;
  let home = null;
  let target = null;

  function pickTarget(terrain) {
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * TAU;
      const r = Math.sqrt(Math.random()) * wanderR;
      const x = home.x + Math.cos(a) * r;
      const z = home.z + Math.sin(a) * r;
      if (terrain.getHeightAt(x, z) < SEA_LEVEL - 0.5) return { x, z };
    }
    return { x: home.x, z: home.z }; // 附近没深水：游回家点
  }

  const wrapper = {
    object3d: group,
    kind: 'fish',
    isFish: true,
    alive: true,
    consumed: false,
    size: 0.2,
    update(dt, ctx) {
      age += dt;
      swimTime += dt * speed * 4;
      const p = group.position;
      if (!home) home = { x: p.x, z: p.z };
      if (!target) target = pickTarget(ctx.terrain);

      const intro = Math.min(1, age / 0.5);
      group.scale.setScalar(Math.max(0.001, easeOutBack(intro) * baseScale));

      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 0.4 || ctx.terrain.getHeightAt(target.x, target.z) >= SEA_LEVEL - 0.4) {
        target = pickTarget(ctx.terrain); // 到达或目标变浅 → 重选水中目标
      } else {
        p.x += (dx / dist) * speed * dt;
        p.z += (dz / dist) * speed * dt;
        // 平滑转向（取最短角差）
        const heading = Math.atan2(dx, dz);
        let diff = heading - group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        group.rotation.y += diff * Math.min(1, dt * 4);
      }

      // 贴着水面游：脊背与背鳍露出水面（可见），下半身在半透明水里泛蓝；绝不钻到水底地形以下
      const ground = ctx.terrain.getHeightAt(p.x, p.z);
      p.y = Math.max(ground + 0.1, SEA_LEVEL - 0.02 + Math.sin(swimTime * 0.5) * 0.05);
      // 摆尾 + 身体轻摇
      tailPivot.rotation.y = Math.sin(swimTime * 1.4) * 0.5;
      group.rotation.z = Math.sin(swimTime) * 0.12;
    },
    consume(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      let elapsed = 0;
      wrapper.update = (dt) => {
        elapsed += dt;
        const t = clamp(elapsed / 0.3, 0, 1);
        group.scale.setScalar((1 - t) * baseScale);
        group.rotation.y += dt * 9;
        if (t === 1) removeEntity(wrapper);
      };
      return true;
    },
  };
  return wrapper;
}
