import * as THREE from 'three';
import { lerp } from '../utils.js';

// 白天 → 黄昏 → 夜晚 三种预设
const PRESETS = [
  {
    name: 'day',
    skyTop: '#5fb6f2', skyBottom: '#d4f1ff', fog: '#d4f1ff',
    sun: '#fff4d6', sunInt: 1.6,
    hemiSky: '#bfe3ff', hemiGround: '#9adf9a', hemiInt: 0.9, ambInt: 0.38,
    sunPos: [26, 36, 16], orb: '#fff2b0', orbGlow: 1.4, star: 0,
  },
  {
    name: 'sunset',
    skyTop: '#4a3f86', skyBottom: '#ffb279', fog: '#ffc89e',
    sun: '#ff8f4d', sunInt: 1.2,
    hemiSky: '#ffb27a', hemiGround: '#8a6f86', hemiInt: 0.7, ambInt: 0.34,
    sunPos: [34, 9, -8], orb: '#ff8a4a', orbGlow: 1.3, star: 0.25,
  },
  {
    name: 'night',
    skyTop: '#0a1130', skyBottom: '#243063', fog: '#1b2350',
    sun: '#aebfff', sunInt: 0.45,
    hemiSky: '#2a3870', hemiGround: '#1f2746', hemiInt: 0.55, ambInt: 0.28,
    sunPos: [-18, 26, -14], orb: '#eef2ff', orbGlow: 1.0, star: 1,
  },
];

export class Sky {
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights; // { sun, hemi, ambient }
    this.idx = 0;

    // ----- 渐变天空穹顶 -----
    const uniforms = {
      topColor: { value: new THREE.Color('#5fb6f2') },
      bottomColor: { value: new THREE.Color('#d4f1ff') },
      expo: { value: 0.8 },
    };
    const domeMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 topColor; uniform vec3 bottomColor; uniform float expo;
        varying vec3 vDir;
        void main() {
          float t = pow(clamp(vDir.y * 0.5 + 0.5, 0.0, 1.0), expo);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }`,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), domeMat);
    dome.renderOrder = -1;
    scene.add(dome);
    this.domeUniforms = uniforms;

    // ----- 太阳 / 月亮 -----
    const orbMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', fog: false });
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 1), orbMat);
    scene.add(this.orb);
    const haloMat = new THREE.MeshBasicMaterial({
      color: '#fff2b0', transparent: true, opacity: 0.28, fog: false,
    });
    this.halo = new THREE.Mesh(new THREE.IcosahedronGeometry(5.2, 1), haloMat);
    this.orb.add(this.halo);

    // ----- 星星 -----
    const starCount = 420;
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const v = new THREE.Vector3()
        .randomDirection()
        .multiplyScalar(180);
      v.y = Math.abs(v.y) * 0.9 + 10; // 大多在上半天空
      sp.set([v.x, v.y, v.z], i * 3);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.starMat = new THREE.PointsMaterial({
      color: '#ffffff', size: 1.3, sizeAttenuation: true,
      transparent: true, opacity: 0, fog: false, depthWrite: false,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    scene.add(this.stars);

    // ----- 云朵 -----
    this.clouds = [];
    const cloudMat = new THREE.MeshStandardMaterial({
      color: '#ffffff', flatShading: true, roughness: 1, metalness: 0,
    });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const puffs = 3 + ((Math.random() * 3) | 0);
      for (let j = 0; j < puffs; j++) {
        const r = 1.6 + Math.random() * 1.8;
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cloudMat);
        m.position.set((j - puffs / 2) * 1.7, Math.random() * 0.8, Math.random() * 1.2);
        m.scale.y = 0.6;
        g.add(m);
      }
      g.position.set(
        -82 + Math.random() * 164,
        24 + Math.random() * 12,
        -82 + Math.random() * 164
      );
      g.userData.speed = 0.6 + Math.random() * 0.8;
      this.scene.add(g);
      this.clouds.push(g);
    }

    // ----- 当前/目标数值 -----
    this.cur = this._toState(PRESETS[0]);
    this.tgt = this._toState(PRESETS[0]);
    this._apply(1); // 立即套用白天
  }

  _toState(p) {
    return {
      skyTop: new THREE.Color(p.skyTop),
      skyBottom: new THREE.Color(p.skyBottom),
      fog: new THREE.Color(p.fog),
      sun: new THREE.Color(p.sun),
      sunInt: p.sunInt,
      hemiSky: new THREE.Color(p.hemiSky),
      hemiGround: new THREE.Color(p.hemiGround),
      hemiInt: p.hemiInt,
      ambInt: p.ambInt,
      sunPos: new THREE.Vector3(...p.sunPos),
      orb: new THREE.Color(p.orb),
      orbGlow: p.orbGlow,
      star: p.star,
    };
  }

  // 切到下一个时间段
  cycle() {
    this.idx = (this.idx + 1) % PRESETS.length;
    Object.assign(this.tgt, this._toState(PRESETS[this.idx]));
    return PRESETS[this.idx].name;
  }

  reset() {
    this.idx = 0;
    Object.assign(this.tgt, this._toState(PRESETS[0]));
  }

  // 读档直达：cur 与 tgt 一起设置，避免夜晚存档恢复时从白天淡入
  setIndex(i) {
    const n = PRESETS.length;
    this.idx = (((i | 0) % n) + n) % n;
    Object.assign(this.tgt, this._toState(PRESETS[this.idx]));
    Object.assign(this.cur, this._toState(PRESETS[this.idx]));
    this._apply(1);
  }

  _apply(k) {
    const c = this.cur;
    const t = this.tgt;
    c.skyTop.lerp(t.skyTop, k);
    c.skyBottom.lerp(t.skyBottom, k);
    c.fog.lerp(t.fog, k);
    c.sun.lerp(t.sun, k);
    c.hemiSky.lerp(t.hemiSky, k);
    c.hemiGround.lerp(t.hemiGround, k);
    c.orb.lerp(t.orb, k);
    c.sunPos.lerp(t.sunPos, k);
    c.sunInt = lerp(c.sunInt, t.sunInt, k);
    c.hemiInt = lerp(c.hemiInt, t.hemiInt, k);
    c.ambInt = lerp(c.ambInt, t.ambInt, k);
    c.orbGlow = lerp(c.orbGlow, t.orbGlow, k);
    c.star = lerp(c.star, t.star, k);

    // 套用到场景
    this.domeUniforms.topColor.value.copy(c.skyTop);
    this.domeUniforms.bottomColor.value.copy(c.skyBottom);
    this.scene.background.copy(c.skyBottom);
    this.scene.fog.color.copy(c.fog);

    const { sun, hemi, ambient } = this.lights;
    sun.color.copy(c.sun);
    sun.intensity = c.sunInt;
    sun.position.copy(c.sunPos);
    hemi.color.copy(c.hemiSky);
    hemi.groundColor.copy(c.hemiGround);
    hemi.intensity = c.hemiInt;
    ambient.intensity = c.ambInt;

    this.orb.position.copy(c.sunPos).multiplyScalar(4.2);
    this.orb.material.color.copy(c.orb);
    this.halo.material.color.copy(c.orb);
    this.halo.material.opacity = 0.28 * c.orbGlow;
    this.starMat.opacity = c.star;
  }

  update(dt, t) {
    this._apply(1 - Math.exp(-dt * 2.2)); // 平滑过渡
    // 云朵缓慢飘动
    for (const g of this.clouds) {
      g.position.x += g.userData.speed * dt;
      if (g.position.x > 90) g.position.x = -90;
    }
  }
}
