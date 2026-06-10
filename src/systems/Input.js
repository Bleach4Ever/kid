import * as THREE from 'three';

// 把鼠标/手指操作翻译成“神力”。
// 关键点：用 window 上的捕获阶段监听，在 OrbitControls 之前决定要不要禁用相机旋转：
//   命中小岛/海面 + 当前是创造工具 → 工具接管这次拖拽（不转视角）
//   点到天空 → 交给 OrbitControls 转视角
export class Input {
  constructor({ dom, camera, controls, terrain, water, tools, actions }) {
    this.dom = dom;
    this.camera = camera;
    this.controls = controls;
    this.terrain = terrain;
    this.water = water;
    this.tools = tools;
    this.actions = actions;

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

  _raycast(cx, cy) {
    const rect = this.dom.getBoundingClientRect();
    this.ndc.x = ((cx - rect.left) / rect.width) * 2 - 1;
    this.ndc.y = -((cy - rect.top) / rect.height) * 2 + 1;
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.targets, false);
    return hits.length ? hits[0] : null;
  }

  _down(e) {
    if (e.target !== this.dom) return; // 点的是 UI 按钮，放行
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
