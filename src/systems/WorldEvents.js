import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';
import { PETAL_COLORS } from '../entities/Tree.js';

// 世界事件（✨魔法面板触发）：🌸花瓣雨 / 🌠流星雨 / 🌌极光 / 🌋火山派对。
// 结构仿 Weather.js：同时只有一个活动事件（8-20s），重复触发则重启。
// 与常驻的 Weather 不同，这里的几何体/材质都是事件期间临时创建的，
// 统一在事件结束（cleanup）时释放。
const tmpColor = new THREE.Color();
// 流星许愿：每颗流星挂一个透明大碰撞球，让小朋友更容易点中（模块级共享，不随事件释放）
const METEOR_HIT_GEO = new THREE.SphereGeometry(1.7, 6, 6);
const METEOR_HIT_MAT = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

export class WorldEvents {
  constructor({ scene, terrain, sky, particles, stage, ensureNight, placeEntity }) {
    this.scene = scene;
    this.terrain = terrain;
    this.sky = sky;
    this.particles = particles;
    this.stage = stage;
    this.ensureNight = ensureNight;
    this.placeEntity = placeEntity;
    this.current = null; // { id, t, dur, cleanup, ...事件私有状态 }
    this.time = 0;
    this.audio = null;
    this._shake = new THREE.Vector3(); // 上一帧加到相机上的抖动偏移
  }

  get active() {
    return !!this.current;
  }

  trigger(id, audio) {
    this._end(false); // 重复触发 → 重启
    this.audio = audio || null;
    if (id === 'flowerRain') this._startFlowerRain();
    else if (id === 'meteor') this._startMeteor();
    else if (id === 'aurora') this._startAurora();
    else if (id === 'volcano') this._startVolcano();
  }

  reset() {
    this._end(false);
  }

  update(dt) {
    this.time += dt;
    const cur = this.current;
    if (!cur) return;
    cur.t += dt;
    if (cur.id === 'flowerRain') this._updateFlowerRain(cur, dt);
    else if (cur.id === 'meteor') this._updateMeteor(cur);
    else if (cur.id === 'aurora') this._updateAurora(cur, dt);
    else if (cur.id === 'volcano') this._updateVolcano(cur, dt);
    if (cur.t >= cur.dur) this._end(true);
  }

  // 冒烟测试用：按固定步长快进事件内部时间（同步执行，不依赖真实帧）
  _debugFastForward(seconds) {
    const step = 1 / 30;
    for (let t = 0; t < seconds && this.current; t += step) this.update(step);
  }

  _end(finished) {
    if (!this.current) return;
    const cur = this.current;
    this.current = null; // 先置空，cleanup 里再触发 trigger 也安全
    cur.cleanup(finished);
  }

  // ---------------- 🌸 花瓣雨：200 片慢落 + 正弦摇摆，结束补种 6 朵真花 ----------------
  _startFlowerRain() {
    const count = 200;
    const span = WORLD_SIZE * 0.8;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * span;
      pos[i * 3 + 1] = 4 + Math.random() * 26;
      pos[i * 3 + 2] = (Math.random() - 0.5) * span;
      vel[i] = 2 + Math.random() * 2; // 2-4 u/s 慢落
      tmpColor.set(PETAL_COLORS[(Math.random() * PETAL_COLORS.length) | 0]);
      col[i * 3] = tmpColor.r;
      col[i * 3 + 1] = tmpColor.g;
      col[i * 3 + 2] = tmpColor.b;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.32, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.audio?.startMusicBox();
    this.current = {
      id: 'flowerRain', t: 0, dur: 12, count, span, geo, mat, points, vel,
      cleanup: (finished) => {
        this.scene.remove(points);
        geo.dispose();
        mat.dispose();
        this.audio?.stopMusicBox();
        if (finished) this._plantFlowers(6); // 走 placeEntity，LIMITS 自动保护
      },
    };
  }

  _updateFlowerRain(cur, dt) {
    const p = cur.geo.attributes.position;
    for (let i = 0; i < cur.count; i++) {
      let y = p.getY(i) - cur.vel[i] * dt;
      if (y < SEA_LEVEL - 1) {
        y = 24 + Math.random() * 6;
        p.setX(i, (Math.random() - 0.5) * cur.span);
        p.setZ(i, (Math.random() - 0.5) * cur.span);
      }
      p.setX(i, p.getX(i) + Math.sin(this.time * 2 + i) * 1.4 * dt); // 每片正弦摇摆
      p.setY(i, y);
    }
    p.needsUpdate = true;
    const left = cur.dur - cur.t;
    cur.mat.opacity = 0.95 * Math.min(1, left / 1.5); // 最后 1.5s 淡出
  }

  _plantFlowers(n) {
    for (let k = 0; k < n; k++) {
      for (let tries = 0; tries < 12; tries++) {
        const x = (Math.random() - 0.5) * WORLD_SIZE * 0.7;
        const z = (Math.random() - 0.5) * WORLD_SIZE * 0.7;
        if (this.terrain.getHeightAt(x, z) > SEA_LEVEL + 0.2) {
          this.placeEntity({ x, z }, 'flower');
          break;
        }
      }
    }
  }

  // ---------------- 🌠 流星雨：10s 内 10 颗，落地前消失（无撞击无恐惧） ----------------
  _startMeteor() {
    this.ensureNight?.();
    const group = new THREE.Group();
    this.scene.add(group);
    const headGeo = new THREE.IcosahedronGeometry(0.55, 0);
    const meteors = [];
    for (let i = 0; i < 10; i++) {
      // 仿 Sky.js 星星布点：随机方向推到 ~150 半径壳层、偏上半球
      const dir = new THREE.Vector3().randomDirection();
      dir.y = Math.abs(dir.y) * 0.5 + 0.5;
      dir.normalize();
      const a = Math.random() * Math.PI * 2;
      const m = {
        start: dir.multiplyScalar(150),
        vel: new THREE.Vector3(Math.cos(a) * 26, -30 - Math.random() * 8, Math.sin(a) * 26),
        delay: i * 0.85 + Math.random() * 0.3,
        dur: 1.6,
        obj: new THREE.Group(),
        mats: [],
        played: false,
      };
      m.dirN = m.vel.clone().normalize();
      for (let k = 0; k <= 4; k++) { // 头 + 4 节渐隐尾迹
        const mat = new THREE.MeshBasicMaterial({
          color: k === 0 ? '#fff6c8' : '#ffe9a0', fog: false, transparent: true,
        });
        mat.userData = { base: k === 0 ? 1 : 0.55 - k * 0.11 };
        const node = new THREE.Mesh(headGeo, mat);
        node.scale.setScalar(1 - k * 0.17);
        node.position.copy(m.dirN).multiplyScalar(-k * 1.1);
        m.obj.add(node);
        m.mats.push(mat);
      }
      // 透明大碰撞球 + wrapper：供输入射线把流星当作可点目标
      const collider = new THREE.Mesh(METEOR_HIT_GEO, METEOR_HIT_MAT);
      collider.userData.entity = { isMeteor: true, meteor: m };
      m.obj.add(collider);
      m.collider = collider;
      m.obj.visible = false;
      group.add(m.obj);
      meteors.push(m);
    }
    this.current = {
      id: 'meteor', t: 0, dur: 10, group, meteors,
      cleanup: () => {
        this.scene.remove(group);
        headGeo.dispose();
        for (const m of meteors) for (const mat of m.mats) mat.dispose();
      },
    };
  }

  _updateMeteor(cur) {
    for (const m of cur.meteors) {
      const local = cur.t - m.delay;
      if (local < 0 || local > m.dur) {
        m.obj.visible = false;
        continue;
      }
      if (!m.played) {
        m.played = true;
        this.audio?.playMeteorWhistle();
      }
      m.obj.position.copy(m.start).addScaledVector(m.vel, local);
      // 落地前消失：高度低于 30 直接淡掉
      const altFade = Math.max(0, Math.min(1, (m.obj.position.y - 30) / 12));
      const fade = Math.min(1, local * 4) * Math.min(1, (m.dur - local) * 2.5) * altFade;
      m.obj.visible = fade > 0.01;
      for (const mat of m.mats) mat.opacity = mat.userData.base * fade;
    }
  }

  // ---------------- 🌌 极光：北天色带（绿→紫渐变 + 顶点波动），18s 淡入淡出 ----------------
  _startAurora() {
    this.ensureNight?.();
    const uniforms = {
      uTime: { value: 0 },
      uAlpha: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      uniforms,
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.x += sin(uTime * 0.7 + position.x * 0.18) * 2.0;
          p.y += sin(uTime * 0.9 + position.x * 0.3) * 1.2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform float uAlpha;
        varying vec2 vUv;
        void main() {
          vec3 green = vec3(0.35, 0.95, 0.6);
          vec3 purple = vec3(0.65, 0.4, 0.95);
          vec3 c = mix(green, purple, vUv.y);
          float edge = sin(vUv.y * 3.14159); // 上下边缘透明
          gl_FragColor = vec4(c, uAlpha * edge * 0.75);
        }`,
    });
    const geo = new THREE.PlaneGeometry(80, 14, 60, 1);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 52, -110); // 北天
    this.scene.add(mesh);
    this.audio?.startAuroraPad();
    this.current = {
      id: 'aurora', t: 0, dur: 18, geo, mat, mesh, uniforms,
      cleanup: () => {
        this.scene.remove(mesh);
        geo.dispose();
        mat.dispose();
        this.audio?.stopAuroraPad();
      },
    };
  }

  _updateAurora(cur, dt) {
    cur.uniforms.uTime.value += dt;
    const fadeIn = Math.min(1, cur.t / 3);
    const fadeOut = Math.min(1, (cur.dur - cur.t) / 3);
    cur.uniforms.uAlpha.value = Math.min(fadeIn, fadeOut);
  }

  // ---------------- 🌋 火山派对：鼓出锥峰 + 火花喷泉 + 烟团 + 轻微相机抖动 ----------------
  _startVolcano() {
    // 扫描地形顶点找最高点
    const pos = this.terrain.pos;
    let best = 0;
    let bestY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y > bestY) {
        bestY = y;
        best = i;
      }
    }
    const peak = { x: pos.getX(best), z: pos.getZ(best) };
    // 3 个灰色烟团（云朵审美：压扁的 icosahedron，放大渐隐）
    const smokeGeo = new THREE.IcosahedronGeometry(1, 1);
    const smokes = [];
    for (let i = 0; i < 3; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: '#a39bb0', transparent: true, opacity: 0, flatShading: true, roughness: 1,
      });
      const mesh = new THREE.Mesh(smokeGeo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      smokes.push({ mesh, mat, delay: 2.2 + i * 1.7, off: (Math.random() - 0.5) * 1.6 });
    }
    this.audio?.startRumble();
    this.current = {
      id: 'volcano', t: 0, dur: 10, peak, smokeGeo, smokes, sculpted: 0, nextBurst: 2,
      cleanup: () => {
        // 先撤掉上一帧的相机抖动偏移，避免残留位移
        this.stage.camera.position.sub(this._shake);
        this._shake.set(0, 0, 0);
        for (const s of smokes) {
          this.scene.remove(s.mesh);
          s.mat.dispose();
        }
        smokeGeo.dispose();
        this.audio?.stopRumble();
      },
    };
  }

  _updateVolcano(cur, dt) {
    // 前 2s：用现有雕刻笔刷分 8 次鼓出锥峰
    while (cur.sculpted < 8 && cur.t > cur.sculpted * 0.25) {
      this.terrain.sculpt(cur.peak, 1);
      cur.sculpted++;
    }
    const topY = this.terrain.getHeightAt(cur.peak.x, cur.peak.z);
    // 2s 后开始喷泉：每 0.3s 一股橙红火花（卡通定调，不落到任何实体上）
    if (cur.t >= cur.nextBurst && cur.t < cur.dur - 0.5) {
      cur.nextBurst += 0.3;
      this.particles.burst({ x: cur.peak.x, y: topY + 0.6, z: cur.peak.z }, {
        count: 12, colors: ['#ff8a3d', '#ff5e3a', '#ffd166'], speed: 3.4, gravity: 5, life: 0.9, size: 0.22,
      });
      if (Math.random() < 0.35) this.audio?.playVolcanoPop();
    }
    // 烟团：延迟出现，上升 + 放大 + 渐隐
    for (const s of cur.smokes) {
      const local = cur.t - s.delay;
      if (local < 0) continue;
      const k = Math.min(1, local / 4.5);
      s.mesh.visible = k < 1;
      s.mesh.position.set(cur.peak.x + s.off, topY + 1.5 + local * 1.4, cur.peak.z + s.off * 0.7);
      s.mesh.scale.set(0.5 + k * 2.4, (0.5 + k * 2.4) * 0.65, 0.5 + k * 2.4);
      s.mat.opacity = 0.8 * (1 - k);
    }
    // 轻微相机抖动：先移除上帧偏移再加新偏移，不和 OrbitControls 阻尼打架
    const cam = this.stage.camera;
    cam.position.sub(this._shake);
    const amp = 0.16 * Math.min(1, cur.t / 2) * Math.max(0, Math.min(1, (cur.dur - cur.t) / 2));
    this._shake.set(
      (Math.random() - 0.5) * amp,
      (Math.random() - 0.5) * amp * 0.6,
      (Math.random() - 0.5) * amp
    );
    cam.position.add(this._shake);
  }
}
