import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#cdeffb');
    this.scene.fog = new THREE.Fog('#cdeffb', 55, 130);

    this.camera = new THREE.PerspectiveCamera(
      48,
      window.innerWidth / window.innerHeight,
      0.1,
      400
    );
    this.camera.position.set(0, 34, 58);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 14;
    this.controls.maxDistance = 125;
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
    this.sun.position.set(24, 34, 16);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    const s = this.sun.shadow.camera;
    s.left = -58;
    s.right = 58;
    s.top = 58;
    s.bottom = -58;
    s.near = 1;
    s.far = 140;
    s.updateProjectionMatrix();
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    window.addEventListener('resize', () => this.resize());
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
