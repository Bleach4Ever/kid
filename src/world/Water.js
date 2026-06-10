import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';

// 半透明海面：盖住低于海平面的地形，并轻轻波动闪光
export class Water {
  constructor() {
    const size = WORLD_SIZE * 2.2; // 比小岛大很多，一直铺到海平线
    const geo = new THREE.PlaneGeometry(size, size, 40, 40);
    geo.rotateX(-Math.PI / 2);
    this.geometry = geo;
    this.pos = geo.attributes.position;
    this.base = Float32Array.from(this.pos.array); // 记录原始坐标做波动

    const mat = new THREE.MeshStandardMaterial({
      color: '#6fc3ee',
      transparent: true,
      opacity: 0.8,
      roughness: 0.15,
      metalness: 0.1,
      flatShading: true,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = SEA_LEVEL;
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'water';
  }

  update(t) {
    const p = this.pos;
    for (let i = 0; i < p.count; i++) {
      const x = this.base[i * 3];
      const z = this.base[i * 3 + 2];
      const y =
        Math.sin(x * 0.18 + t * 1.1) * 0.16 +
        Math.cos(z * 0.22 + t * 0.9) * 0.14;
      p.setY(i, y);
    }
    p.needsUpdate = true;
    // 波动较小，不必每帧重算法线，保持柔和的卡通水面即可
  }
}
