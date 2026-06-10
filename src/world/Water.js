import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';

// 几条方向/频率不同的波叠加（Gerstner-lite），让海浪更自然；仍保持低多边形卡通感。
// dx/dz 单位方向，freq 空间频率，amp 振幅，speed 时间相位速度，steep 横向挤压(crest)。
const WAVES = [
  { dx: 0.92, dz: 0.39, freq: 0.16, amp: 0.16, speed: 1.05, steep: 0.5 },
  { dx: -0.45, dz: 0.89, freq: 0.24, amp: 0.1, speed: 0.85, steep: 0.4 },
  { dx: 0.3, dz: -0.95, freq: 0.38, amp: 0.05, speed: 1.35, steep: 0.3 },
];

// 半透明海面：盖住低于海平面的地形，叠加多向波浪 + 解析法线产生流动的高光
export class Water {
  constructor() {
    const size = WORLD_SIZE * 2.2; // 比小岛大很多，一直铺到海平线
    const geo = new THREE.PlaneGeometry(size, size, 40, 40);
    geo.rotateX(-Math.PI / 2);
    this.geometry = geo;
    this.pos = geo.attributes.position;
    this.norm = geo.attributes.normal;
    this.base = Float32Array.from(this.pos.array); // 记录原始坐标做波动

    const mat = new THREE.MeshStandardMaterial({
      color: '#5fb8e8',
      transparent: true,
      opacity: 0.82,
      roughness: 0.12,
      metalness: 0.1,
      flatShading: false, // 用解析法线做平滑高光（不是 computeVertexNormals）
      emissive: new THREE.Color('#cdeffb'),
      emissiveIntensity: 0.05, // 廉价 fresnel 感：掠射角微微染上天空色
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
  }

  update(t) {
    const p = this.pos;
    const n = this.norm;
    const base = this.base;
    for (let i = 0; i < p.count; i++) {
      const bx = base[i * 3];
      const bz = base[i * 3 + 2];
      let dx = 0;
      let dy = 0;
      let dz = 0;
      let dHdx = 0;
      let dHdz = 0;
      for (let w = 0; w < WAVES.length; w++) {
        const wave = WAVES[w];
        const phase = (wave.dx * bx + wave.dz * bz) * wave.freq + t * wave.speed;
        const s = Math.sin(phase);
        const c = Math.cos(phase);
        dy += wave.amp * s;
        dx += wave.steep * wave.amp * wave.dx * c; // Gerstner 横向位移
        dz += wave.steep * wave.amp * wave.dz * c;
        dHdx += wave.amp * wave.freq * wave.dx * c; // 高度场斜率 → 解析法线
        dHdz += wave.amp * wave.freq * wave.dz * c;
      }
      p.setXYZ(i, bx + dx, dy, bz + dz);
      const inv = 1 / Math.sqrt(dHdx * dHdx + 1 + dHdz * dHdz);
      n.setXYZ(i, -dHdx * inv, inv, -dHdz * inv);
    }
    p.needsUpdate = true;
    n.needsUpdate = true;
  }
}
