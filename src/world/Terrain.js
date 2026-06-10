import * as THREE from 'three';
import {
  WORLD_SIZE,
  TERRAIN_SEGMENTS,
  SEA_LEVEL,
  MAX_HEIGHT,
  MIN_HEIGHT,
} from '../constants.js';
import { clamp, smoothstep, valueNoise, lerp } from '../utils.js';

// 按高度分段的粉彩配色
const C_SAND_DEEP = new THREE.Color('#e9d7a8');
const C_SAND = new THREE.Color('#f6e7b8');
const C_GRASS = new THREE.Color('#a6e59a');
const C_GRASS_DARK = new THREE.Color('#7fce86');
const C_ROCK = new THREE.Color('#cdbfb0');
const C_SNOW = new THREE.Color('#fbfdff');

const _c = new THREE.Color();

function colorForHeight(h) {
  if (h < -0.4) return _c.copy(C_SAND_DEEP);
  if (h < 0.5) return _c.copy(C_SAND).lerp(C_SAND_DEEP, smoothstep(0.5, -0.4, h));
  if (h < 2.4) return _c.copy(C_GRASS).lerp(C_SAND, smoothstep(1.3, 0.5, h));
  if (h < 4.2) return _c.copy(C_GRASS_DARK).lerp(C_GRASS, smoothstep(3.2, 2.4, h));
  if (h < 6.0) return _c.copy(C_ROCK).lerp(C_GRASS_DARK, smoothstep(5.0, 4.2, h));
  return _c.copy(C_SNOW).lerp(C_ROCK, smoothstep(7.2, 6.0, h));
}

export class Terrain {
  constructor() {
    this.size = WORLD_SIZE;
    this.seg = TERRAIN_SEGMENTS;
    this.cols = this.seg + 1; // 每行顶点数
    this.dx = this.size / this.seg;

    const geo = new THREE.PlaneGeometry(this.size, this.size, this.seg, this.seg);
    geo.rotateX(-Math.PI / 2); // 铺到 XZ 平面，向上为 +Y
    geo.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3)
    );

    this.geometry = geo;
    this.pos = geo.attributes.position;
    this.col = geo.attributes.color;

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0.0,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.name = 'terrain';

    this.generate('park');
  }

  _heightForPreset(preset, x, z) {
    const half = this.size / 2;
    const d = Math.hypot(x, z) / half;
    const edge = 1 - smoothstep(0.68, 0.97, d);
    const noise = valueNoise(x * 0.1 + 50, z * 0.1 + 50) - 0.5;

    if (preset === 'blank') {
      return 1.15 * edge - 1.5 * (1 - edge);
    }

    if (preset === 'canyon') {
      const rim = smoothstep(0.36, 0.78, d) * edge * 5.8;
      const valley = (1 - smoothstep(0.05, 0.45, Math.abs(x) / half)) * 1.1;
      return clamp(0.9 + rim - valley + noise * 2.2 * edge - 2.2 * (1 - edge), MIN_HEIGHT, MAX_HEIGHT);
    }

    if (preset === 'islands') {
      const island = (cx, cz, radius, height) => {
        const localD = Math.hypot(x - cx, z - cz) / radius;
        return (1 - smoothstep(0.18, 1, localD)) * height;
      };
      const land =
        island(-16, -5, 20, 4.2) +
        island(14, 10, 17, 3.8) +
        island(18, -17, 12, 3.3) +
        island(-12, 22, 10, 2.8);
      return clamp(land - 1.65 + noise * 1.2 * smoothstep(0, 2.5, land), MIN_HEIGHT, MAX_HEIGHT);
    }

    const island = (1 - smoothstep(0.12, 0.94, d)) * 4.7 - 1.45;
    const valley = Math.exp(-(x * x) / 190) * 0.8;
    return clamp(island - valley + noise * 2.2 * edge, MIN_HEIGHT, MAX_HEIGHT);
  }

  generate(preset = this.preset || 'park') {
    this.preset = preset;
    for (let i = 0; i < this.pos.count; i++) {
      const x = this.pos.getX(i);
      const z = this.pos.getZ(i);
      this.pos.setY(i, this._heightForPreset(preset, x, z));
    }
    this.refresh();
  }

  refresh() {
    this.geometry.computeVertexNormals();
    this.recolor();
    this.pos.needsUpdate = true;
  }

  recolor() {
    for (let i = 0; i < this.pos.count; i++) {
      const c = colorForHeight(this.pos.getY(i));
      this.col.setXYZ(i, c.r, c.g, c.b);
    }
    this.col.needsUpdate = true;
  }

  // 笔刷雕刻：在 worldPoint 周围抬高(dir>0)或压低(dir<0)地形
  sculpt(worldPoint, dir, strength = 0.03, radius = 5) {
    const px = worldPoint.x;
    const pz = worldPoint.z;
    const r2 = radius * radius;
    let touched = false;
    for (let i = 0; i < this.pos.count; i++) {
      const x = this.pos.getX(i);
      const z = this.pos.getZ(i);
      const dxx = x - px;
      const dzz = z - pz;
      const dist2 = dxx * dxx + dzz * dzz;
      if (dist2 > r2) continue;
      const dist = Math.sqrt(dist2);
      // 余弦衰减 → 圆润的山丘
      const falloff = 0.5 + 0.5 * Math.cos((dist / radius) * Math.PI);
      const cur = this.pos.getY(i);
      const next = clamp(cur + dir * strength * falloff * radius, MIN_HEIGHT, MAX_HEIGHT);
      this.pos.setY(i, next);
      touched = true;
    }
    if (touched) this.refresh();
  }

  // 双线性采样地形高度（给恐龙贴地、给物体定位）
  getHeightAt(x, z) {
    const half = this.size / 2;
    const fx = clamp((x + half) / this.dx, 0, this.seg);
    const fz = clamp((z + half) / this.dx, 0, this.seg);
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const ix1 = Math.min(ix + 1, this.seg);
    const iz1 = Math.min(iz + 1, this.seg);
    const tx = fx - ix;
    const tz = fz - iz;
    const h00 = this.pos.getY(iz * this.cols + ix);
    const h10 = this.pos.getY(iz * this.cols + ix1);
    const h01 = this.pos.getY(iz1 * this.cols + ix);
    const h11 = this.pos.getY(iz1 * this.cols + ix1);
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  // 存档：导出/恢复整张高度图
  exportHeights() {
    const heights = new Float32Array(this.pos.count);
    for (let i = 0; i < this.pos.count; i++) heights[i] = this.pos.getY(i);
    return heights;
  }

  applyHeights(arr) {
    if (!arr || arr.length !== this.pos.count) return false;
    for (let i = 0; i < this.pos.count; i++) {
      this.pos.setY(i, clamp(arr[i], MIN_HEIGHT, MAX_HEIGHT));
    }
    this.refresh();
    return true;
  }

  isUnderWater(x, z) {
    return this.getHeightAt(x, z) < SEA_LEVEL - 0.15;
  }

  reset() {
    this.generate(this.preset);
  }
}
