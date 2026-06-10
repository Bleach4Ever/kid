import * as THREE from 'three';
import { lerp, TAU } from '../utils.js';

// 连续昼夜：按 TimeOfDay 的小时 [0,24) 在关键帧之间插值。
// 关键帧只描述颜色/强度/星星，太阳与月亮的位置由 _celestial(hour) 的弧线算出。
const KEYFRAMES = [
  {
    hour: 0, name: 'night',
    skyTop: '#0a1130', skyBottom: '#243063', fog: '#1b2350',
    sun: '#aebfff', sunInt: 0.45,
    hemiSky: '#2a3870', hemiGround: '#1f2746', hemiInt: 0.55, ambInt: 0.28,
    sunPos: [0, 1, 0], orb: '#eef2ff', orbGlow: 1.0, star: 1,
  },
  {
    hour: 5, name: 'predawn',
    skyTop: '#1b2350', skyBottom: '#6f6f9e', fog: '#4a4f7a',
    sun: '#b9c4ec', sunInt: 0.7,
    hemiSky: '#515f93', hemiGround: '#3a3f5e', hemiInt: 0.6, ambInt: 0.3,
    sunPos: [0, 1, 0], orb: '#d6dcff', orbGlow: 1.0, star: 0.6,
  },
  {
    hour: 7, name: 'sunrise',
    skyTop: '#6b6aae', skyBottom: '#ffc89e', fog: '#ffd2ad',
    sun: '#ffb777', sunInt: 1.25,
    hemiSky: '#ffc59a', hemiGround: '#9a9180', hemiInt: 0.82, ambInt: 0.36,
    sunPos: [0, 1, 0], orb: '#ffce8c', orbGlow: 1.3, star: 0.1,
  },
  {
    hour: 12, name: 'day',
    skyTop: '#5fb6f2', skyBottom: '#d4f1ff', fog: '#d4f1ff',
    sun: '#fff4d6', sunInt: 1.6,
    hemiSky: '#bfe3ff', hemiGround: '#9adf9a', hemiInt: 0.9, ambInt: 0.38,
    sunPos: [0, 1, 0], orb: '#fff2b0', orbGlow: 1.4, star: 0,
  },
  {
    hour: 17, name: 'golden',
    skyTop: '#5a93cf', skyBottom: '#ffe0a8', fog: '#ffe1b4',
    sun: '#ffce8a', sunInt: 1.42,
    hemiSky: '#ffd6a4', hemiGround: '#a6cf8c', hemiInt: 0.86, ambInt: 0.37,
    sunPos: [0, 1, 0], orb: '#ffd58a', orbGlow: 1.35, star: 0,
  },
  {
    hour: 19, name: 'sunset',
    skyTop: '#4a3f86', skyBottom: '#ffb279', fog: '#ffc89e',
    sun: '#ff8f4d', sunInt: 1.2,
    hemiSky: '#ffb27a', hemiGround: '#8a6f86', hemiInt: 0.7, ambInt: 0.34,
    sunPos: [0, 1, 0], orb: '#ff8a4a', orbGlow: 1.3, star: 0.25,
  },
  {
    hour: 21, name: 'night',
    skyTop: '#0a1130', skyBottom: '#243063', fog: '#1b2350',
    sun: '#aebfff', sunInt: 0.45,
    hemiSky: '#2a3870', hemiGround: '#1f2746', hemiInt: 0.55, ambInt: 0.28,
    sunPos: [0, 1, 0], orb: '#eef2ff', orbGlow: 1.0, star: 1,
  },
];

const STORM_GRAY = new THREE.Color('#5b6472'); // 雷暴压暗时天空/雾推向的灰

export class Sky {
  constructor(scene, lights) {
    this.scene = scene;
    this.lights = lights; // { sun, hemi, ambient }
    this.weatherDarken = 0; // 雷暴临时压暗系数 [0,1]，由 Weather 驱动

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
    this.kfStates = KEYFRAMES.map((k) => ({ hour: k.hour, s: this._toState(k) }));
    this._cel = new THREE.Vector3();
    this.cur = this._toState(KEYFRAMES[3]); // 以白天为基线
    this.tgt = this._toState(KEYFRAMES[3]);
    this.snapTo(8); // 开局早上 8 点
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

  // 太阳/月亮位置：随小时沿一条弧线划过天空（6 点东方升、12 点天顶、18 点西方落），
  // y 设下限保证夜里也有一轮低低的“月亮”可见、方向光仍从上方打来。
  _celestial(hour) {
    const a = ((hour - 6) / 24) * TAU;
    const sx = Math.cos(a) * 30;
    const sy = Math.sin(a) * 40;
    return this._cel.set(sx, Math.max(sy, 7), 14);
  }

  // 找夹住 hour 的两关键帧，把混合结果写入 this.tgt（颜色 lerp，标量 lerp）
  _targetForHour(hour) {
    const ks = this.kfStates;
    let ai = 0;
    for (let i = 0; i < ks.length; i++) {
      if (ks[i].hour <= hour) ai = i;
      else break;
    }
    const wrap = ai === ks.length - 1; // 21 点之后绕回 0 点（都是夜晚，等于保持夜晚）
    const a = ks[ai];
    const b = wrap ? ks[0] : ks[ai + 1];
    const bHour = wrap ? ks[0].hour + 24 : b.hour;
    const f = bHour === a.hour ? 0 : (hour - a.hour) / (bHour - a.hour);
    this._blend(a.s, b.s, f);
    this.tgt.sunPos.copy(this._celestial(hour));
  }

  _blend(sa, sb, f) {
    const t = this.tgt;
    t.skyTop.copy(sa.skyTop).lerp(sb.skyTop, f);
    t.skyBottom.copy(sa.skyBottom).lerp(sb.skyBottom, f);
    t.fog.copy(sa.fog).lerp(sb.fog, f);
    t.sun.copy(sa.sun).lerp(sb.sun, f);
    t.hemiSky.copy(sa.hemiSky).lerp(sb.hemiSky, f);
    t.hemiGround.copy(sa.hemiGround).lerp(sb.hemiGround, f);
    t.orb.copy(sa.orb).lerp(sb.orb, f);
    t.sunInt = lerp(sa.sunInt, sb.sunInt, f);
    t.hemiInt = lerp(sa.hemiInt, sb.hemiInt, f);
    t.ambInt = lerp(sa.ambInt, sb.ambInt, f);
    t.orbGlow = lerp(sa.orbGlow, sb.orbGlow, f);
    t.star = lerp(sa.star, sb.star, f);
  }

  // 读档/重置直达：cur 与 tgt 一起设到指定时刻，避免从白天淡入
  snapTo(hour) {
    this._targetForHour(hour);
    this._apply(1);
  }

  // 雷暴临时压暗（k∈[0,1]，0=无）：在每帧 _apply 末尾叠加，k→0 自动还原
  setWeatherDarken(k) {
    this.weatherDarken = Math.max(0, Math.min(1, k));
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

    // 雷暴压暗：在已应用的值上再叠一层（每帧重算，不累积）
    const d = this.weatherDarken;
    if (d > 0) {
      sun.intensity *= 1 - 0.55 * d;
      hemi.intensity *= 1 - 0.5 * d;
      ambient.intensity *= 1 - 0.45 * d;
      this.scene.fog.color.lerp(STORM_GRAY, 0.6 * d);
      this.scene.background.lerp(STORM_GRAY, 0.5 * d);
      this.domeUniforms.topColor.value.lerp(STORM_GRAY, 0.45 * d);
      this.domeUniforms.bottomColor.value.lerp(STORM_GRAY, 0.4 * d);
    }
  }

  update(dt, hour) {
    this._targetForHour(hour);
    this._apply(1 - Math.exp(-dt * 2.2)); // 平滑过渡
    // 云朵缓慢飘动
    for (const g of this.clouds) {
      g.position.x += g.userData.speed * dt;
      if (g.position.x > 90) g.position.x = -90;
    }
  }
}
