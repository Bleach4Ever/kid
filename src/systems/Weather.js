import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';

const RAIN_COLORS = ['#ff8f8f', '#ffc36b', '#ffe87a', '#9be3a4', '#86ccf5', '#9aa6f7', '#c4a9f7'];

export class Weather {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.raining = false;

    // ---- 雨滴（粒子） ----
    this.maxCount = 700;
    this.count = this.maxCount;
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(this.maxCount * 3);
    this.vel = new Float32Array(this.maxCount);
    const span = WORLD_SIZE * 0.7;
    for (let i = 0; i < this.maxCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * span;
      pos[i * 3 + 1] = Math.random() * 30;
      pos[i * 3 + 2] = (Math.random() - 0.5) * span;
      this.vel[i] = 14 + Math.random() * 10;
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainGeo = g;
    const mat = new THREE.PointsMaterial({
      color: '#cdeeff', size: 0.22, transparent: true, opacity: 0.75,
      depthWrite: false, fog: true,
    });
    this.rain = new THREE.Points(g, mat);
    this.rain.visible = false;
    scene.add(this.rain);

    // ---- 彩虹（7 条同心半环） ----
    this.rainbow = new THREE.Group();
    RAIN_COLORS.forEach((c, i) => {
      const r = 19 - i * 0.55;
      const geo = new THREE.TorusGeometry(r, 0.32, 8, 90, Math.PI);
      const m = new THREE.MeshBasicMaterial({
        color: c, transparent: true, opacity: 0, fog: false, side: THREE.DoubleSide,
      });
      this.rainbow.add(new THREE.Mesh(geo, m));
    });
    this.rainbow.position.set(0, 0.2, -8);
    this.rainbow.rotation.y = 0.15;
    scene.add(this.rainbow);
    this.rainbowT = 0; // >0 表示正在显示
  }

  // 性能分级：不重建几何，只缩小绘制范围 + 更新循环上界
  setRainCount(n) {
    this.count = Math.max(0, Math.min(this.maxCount, n | 0));
    this.rainGeo.setDrawRange(0, this.count);
  }

  toggleRain(audio) {
    this.raining = !this.raining;
    this.rain.visible = this.raining;
    if (this.raining) audio?.startRain();
    else audio?.stopRain();
    return this.raining;
  }

  showRainbow(audio) {
    this.rainbowT = 9; // 显示 9 秒
    audio?.playMagic();
  }

  reset(audio) {
    if (this.raining) this.toggleRain(audio);
    this.rainbowT = 0;
  }

  update(dt) {
    if (this.raining) {
      const p = this.rainGeo.attributes.position;
      const span = WORLD_SIZE * 0.7;
      for (let i = 0; i < this.count; i++) {
        let y = p.getY(i) - this.vel[i] * dt;
        if (y < SEA_LEVEL - 1) {
          y = 26 + Math.random() * 6;
          p.setX(i, (Math.random() - 0.5) * span);
          p.setZ(i, (Math.random() - 0.5) * span);
        }
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }

    // 彩虹淡入淡出
    let targetOp = 0;
    if (this.rainbowT > 0) {
      this.rainbowT -= dt;
      targetOp = this.rainbowT > 1 ? 0.85 : this.rainbowT * 0.85; // 最后 1 秒淡出
    }
    for (const mesh of this.rainbow.children) {
      const o = mesh.material.opacity;
      mesh.material.opacity = o + (targetOp - o) * Math.min(1, dt * 4);
    }
    this.rainbow.visible = this.rainbow.children[0].material.opacity > 0.01;
  }
}
