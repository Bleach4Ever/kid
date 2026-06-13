import * as THREE from 'three';
import { SEA_LEVEL } from '../constants.js';

// 零食球玩具：放下一颗会顺坡滚的小零食球，恐龙跑来分着啃几口（喂养→长大的自动版）。
// 几何/材质模块级共享（culling 不 dispose）。糖珠贴在球体上随滚动一起转。
const BASE_R = 0.42;
const ballGeo = new THREE.IcosahedronGeometry(BASE_R, 1);
ballGeo.userData.shared = true;
const ballMat = new THREE.MeshStandardMaterial({
  color: '#f6a35c', roughness: 0.62, metalness: 0, flatShading: true,
});
const dotGeo = new THREE.IcosahedronGeometry(BASE_R * 0.2, 0);
dotGeo.userData.shared = true;
const dotMat = new THREE.MeshStandardMaterial({ color: '#fff3d6', roughness: 0.5, flatShading: true });
// 固定的几颗糖珠位置（所有零食球长得一样，省去逐实例随机）
const DOTS = [[0.62, 0.5, 0.3], [-0.42, 0.7, -0.24], [0.2, -0.52, 0.62], [-0.56, -0.28, 0.42], [0.36, 0.18, -0.72]];

export function createTreatBall(kick) {
  const group = new THREE.Group();
  const ball = new THREE.Mesh(ballGeo, ballMat);
  group.add(ball);
  for (const [x, y, z] of DOTS) {
    const d = new THREE.Mesh(dotGeo, dotMat);
    d.position.set(x * BASE_R, y * BASE_R, z * BASE_R);
    ball.add(d); // 挂在 ball 上 → 随滚动旋转
  }
  let vx = 0, vz = 0, life = 0, food = 1;
  const MAX_LIFE = 26; // 没吃完也会自然消失，避免堆积
  const rollAxis = new THREE.Vector3();

  const wrapper = {
    object3d: group,
    kind: 'treat',
    isTreat: true,
    alive: true,
    consumed: false,
    kick(dx, dz) { vx = dx; vz = dz; },
    // 恐龙啃一口：减少食量，啃光就自爆（带 ctx 走味道烟花）
    nibble(amount, ctx) {
      if (!wrapper.alive || wrapper.consumed) return false;
      food -= amount;
      if (food <= 0.04) wrapper._eat(ctx);
      return true;
    },
    update(dt, ctx) {
      if (wrapper.consumed) return;
      life += dt;
      const p = group.position;
      const terr = ctx.terrain;
      // 顺坡滚：采样地形梯度，往下坡方向加速
      const eps = 0.6;
      const hX = terr.getHeightAt(p.x + eps, p.z) - terr.getHeightAt(p.x - eps, p.z);
      const hZ = terr.getHeightAt(p.x, p.z + eps) - terr.getHeightAt(p.x, p.z - eps);
      vx += (-hX / (2 * eps)) * 9 * dt;
      vz += (-hZ / (2 * eps)) * 9 * dt;
      const fr = Math.max(0, 1 - 1.6 * dt); // 摩擦
      vx *= fr; vz *= fr;
      const sp = Math.hypot(vx, vz);
      if (sp > 5) { vx = (vx / sp) * 5; vz = (vz / sp) * 5; } // 限速
      let nx = p.x + vx * dt, nz = p.z + vz * dt;
      if (terr.getHeightAt(nx, nz) < SEA_LEVEL + 0.05) { vx = 0; vz = 0; nx = p.x; nz = p.z; } // 不滚进海里
      const scale = 0.55 + 0.45 * Math.max(0, food); // 越吃越小
      const r = BASE_R * scale;
      const moved = Math.hypot(nx - p.x, nz - p.z);
      p.x = nx; p.z = nz;
      p.y = Math.max(SEA_LEVEL, terr.getHeightAt(p.x, p.z)) + r;
      group.scale.setScalar(scale);
      // 滚动旋转：绕垂直于速度的水平轴转（弧长 / 半径）
      if (moved > 1e-4 && r > 1e-3) {
        rollAxis.set(vz, 0, -vx).normalize();
        group.rotateOnWorldAxis(rollAxis, moved / r);
      }
      if (life >= MAX_LIFE) wrapper._eat(ctx);
    },
    // 啃光/超时：撒一圈香喷喷的碎屑就消失
    _eat(ctx) {
      if (!wrapper.alive || wrapper.consumed) return;
      wrapper.consumed = true;
      const p = group.position;
      ctx.particles?.burst({ x: p.x, y: p.y + 0.2, z: p.z }, {
        count: 12, colors: ['#ffd98a', '#f6a35c', '#fff3d6', '#ffcf6e'],
        speed: 1.6, gravity: 5, life: 0.6, size: 0.14,
      });
      ctx.audio?.playSparkle?.();
      ctx.removeEntity(wrapper);
    },
    // 统一 consume 接口（无 ctx：安静移除）
    consume(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      removeEntity(wrapper);
      return true;
    },
  };
  if (kick) wrapper.kick(kick.x, kick.z);
  return wrapper;
}
