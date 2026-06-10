import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { WORLD_SIZE } from '../constants.js';

// 负责渲染器、相机、控制器、灯光与雾。Sky 会调整这里的灯光颜色/强度。
export class Stage {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    // WebGL 上下文丢失/恢复（main.js 设置回调：存档+暂停 / 恢复主循环）。
    // 必须 preventDefault()，否则浏览器认定页面不关心，restored 永远不会派发
    this.onContextLost = null;
    this.onContextRestored = null;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.onContextLost?.();
    });
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored?.());

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cdeffb');
    this.scene.fog = new THREE.Fog('#cdeffb', 80, 185); // 随地图放大：雾推远，远处地形仍柔和淡出

    this.camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      560
    );
    this.camera.position.set(0, 48, 82); // 拉远使更大的地图整体入镜

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 178; // 随地图放大：允许拉得更远
    this.controls.minPolarAngle = Math.PI * 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.49; // 不让相机钻到地面以下
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.8;
    // 一根手指/左键在空白处转视角；两根手指缩放+转
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_ROTATE,
    };
    this.controls.update();

    // ----- 灯光（Sky 模块会动态修改这些） -----
    this.hemi = new THREE.HemisphereLight('#bfe3ff', '#8fd39a', 0.85);
    this.scene.add(this.hemi);

    this.ambient = new THREE.AmbientLight('#ffffff', 0.35);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight('#fff6e0', 1.5);
    this.sun.position.set(34, 48, 22); // 随地图放大：抬高拉远，光线越过更宽更高的地形
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    const s = this.sun.shadow.camera;
    s.left = -82; // 阴影框覆盖更大的世界跨度（半边 60 + 斜射余量）
    s.right = 82;
    s.top = 82;
    s.bottom = -82;
    s.near = 1;
    s.far = 200;
    s.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    window.addEventListener('resize', () => this.resize());

    // ----- 键盘相机控制（桌面纯新增；鼠标/触摸完全不受影响） -----
    // 方向键 = 平移地图；Q/E = 旋转视角。状态按帧消费、dt 缩放。
    this._keys = {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      KeyQ: false,
      KeyE: false,
    };
    this._panBaseSpeed = 28; // 世界单位/秒（在参考距离处）
    this._panRefDistance = 58; // 初始相机距离的手感基准
    this._rotateSpeed = 1.4; // 弧度/秒
    // 复用临时向量，避免每帧分配（与 Input.js 缓存向量风格一致）
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._panVec = new THREE.Vector3();
    this._worldUp = new THREE.Vector3(0, 1, 0);

    window.addEventListener('keydown', (e) => this._onKeyDown(e));
    window.addEventListener('keyup', (e) => this._onKeyUp(e));
    window.addEventListener('blur', () => this._clearKeys());
  }

  _isEditableTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  }

  _onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return; // 放行系统/浏览器快捷键
    if (this._isEditableTarget(e.target)) return;
    if (!(e.code in this._keys)) return;
    this._keys[e.code] = true;
    e.preventDefault(); // 阻止方向键滚动页面
  }

  _onKeyUp(e) {
    if (!(e.code in this._keys)) return;
    this._keys[e.code] = false;
  }

  _clearKeys() {
    for (const k in this._keys) this._keys[k] = false;
  }

  // 每帧（在 render() 之前调用）：把按下的键转成相机平移/旋转。
  // 平移：同量平移 camera.position 与 controls.target，offset 不变，update() 下不变形；
  // 旋转：走 controls.rotateLeft，天然带阻尼。
  updateKeys(dt) {
    if (!this.controls.enabled) return; // 工具拖拽/抚摸期间不抢相机

    const k = this._keys;

    // ----- 旋转（Q/E） -----
    const rot = this._rotateSpeed * dt;
    if (k.KeyQ) this.controls.rotateLeft(rot);
    if (k.KeyE) this.controls.rotateLeft(-rot);

    // ----- 平移（方向键） -----
    let mf = 0; // forward 分量（上/下）
    let mr = 0; // right 分量（左/右）
    if (k.ArrowUp) mf += 1;
    if (k.ArrowDown) mf -= 1;
    if (k.ArrowRight) mr += 1;
    if (k.ArrowLeft) mr -= 1;
    if (mf === 0 && mr === 0) return;

    // 相机前向投影到地面（XZ）
    this._forward.subVectors(this.controls.target, this.camera.position);
    this._forward.y = 0;
    if (this._forward.lengthSq() < 1e-6) return; // 近乎正俯视的退化保护
    this._forward.normalize();
    // 屏幕右方向：forward × worldUp
    this._right.crossVectors(this._forward, this._worldUp).normalize();

    const distance = this.controls.getDistance();
    const speed = this._panBaseSpeed * (distance / this._panRefDistance) * dt;

    this._panVec.set(0, 0, 0);
    this._panVec.addScaledVector(this._forward, mf * speed);
    this._panVec.addScaledVector(this._right, mr * speed);

    // 同量平移 target 与 position（保持 offset/角度/缩放不变）
    this.controls.target.add(this._panVec);
    this.camera.position.add(this._panVec);

    // 把 target 夹在世界范围内，并用相同修正量回拉 position，保持相机刚性
    const half = WORLD_SIZE * 0.5;
    const cx = THREE.MathUtils.clamp(this.controls.target.x, -half, half);
    const cz = THREE.MathUtils.clamp(this.controls.target.z, -half, half);
    const dx = this.controls.target.x - cx;
    const dz = this.controls.target.z - cz;
    if (dx !== 0 || dz !== 0) {
      this.controls.target.x = cx;
      this.controls.target.z = cz;
      this.camera.position.x -= dx;
      this.camera.position.z -= dz;
    }
  }

  // 性能分级（Quality.js 调用）：像素比上限 / 阴影开关 / 阴影贴图分辨率
  applyQuality({ pixelRatioCap, shadows, shadowMapSize }) {
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap));
    this.renderer.shadowMap.enabled = shadows;
    if (this.sun.shadow.mapSize.x !== shadowMapSize) {
      this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    // three.js 陷阱：运行时切 shadowMap 后材质必须重编译，否则仍用旧 shader 程序
    this.scene.traverse((o) => o.material && (o.material.needsUpdate = true));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
