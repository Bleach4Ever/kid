import * as THREE from 'three';

// 泡泡棒玩具：点一下冒出几颗半透明泡泡，缓缓上升 + 左右飘 + 果冻晃；
// 恐龙跑来顶破或自己升到头自破。几何/材质模块级共享（culling 不 dispose）。
const bubbleGeo = new THREE.IcosahedronGeometry(0.26, 1);
bubbleGeo.userData.shared = true;
const bubbleMat = new THREE.MeshStandardMaterial({
  color: '#cdeeff', transparent: true, opacity: 0.45, roughness: 0.08, metalness: 0,
});

export function createBubble(onPop) {
  const mesh = new THREE.Mesh(bubbleGeo, bubbleMat);
  const phase = Math.random() * Math.PI * 2;
  const driftR = 0.35 + Math.random() * 0.4;
  const rise = 0.7 + Math.random() * 0.5;
  const maxLife = 3.2 + Math.random() * 0.8;
  let life = 0, bx = 0, by = 0, bz = 0, inited = false;

  const wrapper = {
    object3d: mesh,
    kind: 'bubble',
    isBubble: true,
    alive: true,
    consumed: false,
    update(dt, ctx) {
      if (!inited) { bx = mesh.position.x; by = mesh.position.y; bz = mesh.position.z; inited = true; }
      life += dt;
      mesh.position.set(
        bx + Math.sin(life * 1.8 + phase) * driftR,
        by + life * rise,
        bz + Math.cos(life * 1.5 + phase) * driftR
      );
      mesh.rotation.y += dt * 0.9;
      const w = 1 + Math.sin(life * 6 + phase) * 0.06; // 轻微果冻晃动
      mesh.scale.set(w, 1 / w, w);
      if (life >= maxLife) wrapper._pop(ctx.removeEntity);
    },
    _pop(removeEntity) {
      if (!wrapper.alive || wrapper.consumed) return false;
      wrapper.consumed = true;
      onPop?.(mesh.position);
      removeEntity(wrapper); // requestRemove 自己把 alive 置 false 并排队销毁
      return true;
    },
    // 恐龙顶破走这里（与树/花的 consume 接口一致）
    consume(removeEntity) {
      return wrapper._pop(removeEntity);
    },
  };
  return wrapper;
}
