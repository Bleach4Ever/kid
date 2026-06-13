// 【混合模型试点】把指定物种的「视觉」换成 Quaternius CC0 glTF 模型（平面着色 + 调色贴合画风），
// 但保留程序化恐龙的整套 AI / 包装（成长 / 喂养 / 表情 / 漫步 / 变体）。
// 模型作为 group 的子节点，随 group 的位移 / 旋转 / 成长缩放一起变换；骨骼 Idle/Walk 按水平移动速度切换。
// 模型来源：Quaternius Animated Dinosaurs（CC0 公共领域，无需署名）· https://poly.pizza
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { VARIANTS } from './Variants.js';

// 物种 → glb 路径（Quaternius Animated Dinosaurs，6 种，CC0）。要再扩就在这里加映射。
// 长颈龙：包里是 Apatosaurus，归到我们的 brachiosaurus。
const MODEL_URLS = {
  trex: './models/trex.glb',
  raptor: './models/raptor.glb',
  triceratops: './models/triceratops.glb',
  parasaurolophus: './models/parasaurolophus.glb',
  stegosaurus: './models/stegosaurus.glb',
  brachiosaurus: './models/brachiosaurus.glb',
};
const triCount = (g) => (g?.index ? g.index.count : g?.attributes?.position?.count || 0) / 3;
const FACE_OFFSET = Math.PI; // 让 glTF 朝向与程序化(+Z 向前)对齐

const loaders = {};
function loadGltf(url) {
  if (!loaders[url]) loaders[url] = new GLTFLoader().loadAsync(url);
  return loaders[url];
}
const clipBySuffix = (clips, s) => clips.find((c) => c.name.endsWith(s)) || null;

export function hasHybridModel(species) { return !!MODEL_URLS[species]; }

// 返回控制器 { update(dt) } 或 null（该物种没有模型）。须在 createDinosaur 里、加 marker 之前调用，
// 这样 group 此刻只含程序化身体，便于测量自然尺寸并在加载完成后隐藏它。
export function attachHybridModel(group, species, config, variant) {
  const url = MODEL_URLS[species];
  if (!url) return null;

  const procedural = [...group.children]; // 程序化身体；加载完成后整组隐藏
  // 程序化模型在 scale=1 时的自然高度（成长缩放以它为基准，glTF 按它等高）
  const procBox = new THREE.Box3().setFromObject(group);
  const procH = (procBox.max.y - procBox.min.y) || config.baseSize * 1.5;

  const inner = new THREE.Group(); // 朝向偏置容器
  inner.rotation.y = FACE_OFFSET;
  group.add(inner);

  let mixer = null, idle = null, walk = null, current = null;
  let ready = false;
  let lastX = group.position.x, lastZ = group.position.z;

  function play(a) {
    if (!a || a === current) return;
    a.reset().fadeIn(0.3).play();
    if (current) current.fadeOut(0.3);
    current = a;
  }

  loadGltf(url).then((gltf) => {
    const scene = cloneSkinned(gltf.scene); // 支持多实例共享几何
    scene.updateMatrixWorld(true);
    // 蒙皮 geometry 的 bind-pose 包围盒不可靠（≈0）→ 用骨骼世界坐标估算尺寸
    let sk = null;
    scene.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o; });
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    if (sk?.skeleton?.bones?.length) for (const b of sk.skeleton.bones) box.expandByPoint(b.getWorldPosition(v));
    else box.setFromObject(scene);
    const h = (box.max.y - box.min.y) || 1;
    const s = procH / h;
    scene.scale.setScalar(s);
    scene.position.y = -box.min.y * s; // 脚底（最低骨骼）对齐 group 原点

    // 平面着色 + 调色：各模型材质命名不统一，改用三角面数启发——最大块=主体、次大=辅色，
    // 其余（眼/牙/舌等小块）保留模型原色。逐实例克隆材质，调色/变体互不影响。
    const vc = variant ? VARIANTS[variant] : null;
    const bodyCol = new THREE.Color(vc?.body || config.body);
    const accentCol = new THREE.Color(vc?.accent || config.accent);
    const meshes = [];
    scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.sort((a, b) => triCount(b.geometry) - triCount(a.geometry));
    meshes.forEach((o, i) => {
      o.castShadow = true;
      if (o.geometry) o.geometry.userData.shared = true; // 几何与缓存共享，disposeObj 跳过
      const m = o.material.clone();
      m.flatShading = true;
      if (i === 0) m.color.copy(bodyCol);
      else if (i === 1) m.color.copy(accentCol);
      if (vc?.emissive) { m.emissive = new THREE.Color(vc.emissive); m.emissiveIntensity = 0.3; }
      m.needsUpdate = true;
      o.material = m;
    });

    inner.add(scene);
    mixer = new THREE.AnimationMixer(scene);
    idle = mixer.clipAction(clipBySuffix(gltf.animations, 'Idle'));
    walk = mixer.clipAction(clipBySuffix(gltf.animations, 'Walk'));
    play(idle);
    for (const o of procedural) o.visible = false; // 换上 glTF，藏起程序化身体
    ready = true;
  }).catch((e) => console.warn('[HybridModel] load failed, keep procedural:', e));

  return {
    // 每帧调用（须在 wrapper.update 的早退之前），驱动骨骼动画 + 按移动切 Idle/Walk
    update(dt) {
      if (!ready) return;
      mixer.update(dt);
      const dx = group.position.x - lastX, dz = group.position.z - lastZ;
      lastX = group.position.x; lastZ = group.position.z;
      const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      play(speed > 0.25 ? walk : idle);
    },
  };
}
