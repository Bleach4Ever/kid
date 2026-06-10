import * as THREE from 'three';

// 把鼠标/手指操作翻译成“神力”。
// 关键点：用 window 上的捕获阶段监听，在 OrbitControls 之前决定要不要禁用相机旋转：
//   命中小岛/海面 + 当前是创造工具 → 工具接管这次拖拽（不转视角）
//   点到天空 → 交给 OrbitControls 转视角
export class Input {
  constructor({ dom, camera, controls, terrain, water, tools, actions, getPetTargets }) {
    this.dom = dom;
    this.camera = camera;
    this.controls = controls;
    this.terrain = terrain;
    this.water = water;
    this.tools = tools;
    this.actions = actions;
    this.getPetTargets = getPetTargets || null;

    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.targets = [terrain.mesh, water.mesh];

    this.interacting = false;
    this.activeTool = null;
    this.lastClient = { x: 0, y: 0 };
    this.lastPlace = new THREE.Vector3(1e9, 0, 1e9);

    window.addEventListener('pointerdown', (e) => this._down(e), true);
    window.addEventListener('pointermove', (e) => this._move(e));
    window.addEventListener('pointerup', () => this._up());
    window.addEventListener('pointercancel', () => this._up());
  }

  _setRay(cx, cy) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  _raycast(cx, cy) {
    this._setRay(cx, cy);
    const hits = this.ray.intersectObjects(this.targets, false);
    return hits.length ? hits[0] : null;
  }

  // 命中可抚摸的目标时返回其 wrapper；被地形/海面挡住（目标更远）则不算
  _petHit(cx, cy) {
    if (!this.getPetTargets) return null;
    const targets = this.getPetTargets();
    if (!targets.length) return null;
    this._setRay(cx, cy);
    const hits = this.ray.intersectObjects(targets, true);
    if (!hits.length) return null;
    let obj = hits[0].object;
    while (obj && !obj.userData.entity) obj = obj.parent;
    const entity = obj ? obj.userData.entity : null;
    if (!entity) return null;
    // 遮挡判定：半透明海面不该挡住水里的海洋生物（隔水也能点鱼），故海洋生物只用地形当遮挡
    const occluders = entity.isSeaLife ? [this.terrain.mesh] : this.targets;
    const ground = this.ray.intersectObjects(occluders, false);
    if (ground.length && ground[0].distance < hits[0].distance) return null;
    return entity;
  }

  _down(e) {
    if (e.target !== this.dom) return; // 点的是 UI 按钮，放行
    // 点到恐龙永远是抚摸，无视当前工具
    const petTarget = this._petHit(e.clientX, e.clientY);
    if (petTarget) {
      this.actions.pet(petTarget);
      this.controls.enabled = false;
      this.interacting = true;
      this.activeTool = { type: 'pet' };
      return;
    }
    const tool = this.tools.current;
    if (!tool) return;
    const hit = this._raycast(e.clientX, e.clientY);
    if (!hit) {
      this.interacting = false; // 点到天空 → 转视角
      return;
    }
    this.controls.enabled = false;
    this.interacting = true;
    this.activeTool = tool;
    this.lastClient.x = e.clientX;
    this.lastClient.y = e.clientY;
    if (tool.type === 'place') {
      this.actions.place(hit.point, tool.kind);
      this.lastPlace.copy(hit.point);
    }
  }

  _move(e) {
    if (!this.interacting) return;
    this.lastClient.x = e.clientX;
    this.lastClient.y = e.clientY;
    if (this.activeTool.type === 'place') {
      // 拖动可以“撒”出一排
      const hit = this._raycast(e.clientX, e.clientY);
      if (hit && hit.point.distanceTo(this.lastPlace) > 1.6) {
        this.actions.place(hit.point, this.activeTool.kind);
        this.lastPlace.copy(hit.point);
      }
    }
  }

  _up() {
    if (!this.interacting) return;
    this.interacting = false;
    this.activeTool = null;
    this.controls.enabled = true;
  }

  // 每帧：sculpt 工具按住不放时持续雕刻
  update() {
    if (this.interacting && this.activeTool && this.activeTool.type === 'sculpt') {
      const hit = this._raycast(this.lastClient.x, this.lastClient.y);
      if (hit) this.actions.sculpt(hit.point, this.activeTool.dir);
    }
  }
}
