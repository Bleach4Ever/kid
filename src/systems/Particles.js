import * as THREE from 'three';
import { TAU } from '../utils.js';

// 单个池化 THREE.Points 承担全部粒子效果（放置烟雾/进食碎屑/孵化彩纸/抚摸爱心…），
// 一次 draw call，零运行时分配。
const MAX = 512;
const tmpColor = new THREE.Color();

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.cursor = 0;
    this.alive = 0;
    this.pos.fill(-999); // 死粒子藏到地下

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float a = 1.0 - smoothstep(0.3, 0.5, length(gl_PointCoord - 0.5));
          if (a < 0.02) discard;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(position, { count = 14, colors = ['#ffffff'], speed = 2.2, gravity = 5, life = 0.8, size = 0.16 } = {}) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      if (this.life[i] <= 0) this.alive++;
      const angle = Math.random() * TAU;
      const radial = Math.random() * speed;
      this.pos[i * 3] = position.x + (Math.random() - 0.5) * 0.3;
      this.pos[i * 3 + 1] = position.y + (Math.random() - 0.5) * 0.3;
      this.pos[i * 3 + 2] = position.z + (Math.random() - 0.5) * 0.3;
      this.vel[i * 3] = Math.cos(angle) * radial;
      this.vel[i * 3 + 1] = (0.6 + Math.random() * 0.9) * speed;
      this.vel[i * 3 + 2] = Math.sin(angle) * radial;
      tmpColor.set(colors[(Math.random() * colors.length) | 0]);
      this.col[i * 3] = tmpColor.r;
      this.col[i * 3 + 1] = tmpColor.g;
      this.col[i * 3 + 2] = tmpColor.b;
      this.life[i] = this.maxLife[i] = life * (0.6 + Math.random() * 0.7);
      this.grav[i] = gravity;
      this.baseSize[i] = size * (0.7 + Math.random() * 0.6);
      this.size[i] = this.baseSize[i];
    }
  }

  update(dt) {
    if (!this.alive) return;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.alive--;
        this.size[i] = 0;
        this.pos[i * 3 + 1] = -999;
        continue;
      }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      // 末段缩小淡出
      this.size[i] = this.baseSize[i] * Math.min(1, (this.life[i] / this.maxLife[i]) * 2.5);
    }
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.color.needsUpdate = true;
    attrs.size.needsUpdate = true;
  }
}
