// 【混合模型】把指定物种的「视觉」换成 Quaternius CC0 glTF 模型（平面着色 + 调色贴合画风），
// 但保留程序化恐龙的整套 AI / 包装（成长 / 喂养 / 表情 / 漫步 / 变体）。
// 模型作为 group 的子节点，随 group 的位移 / 旋转 / 成长缩放一起变换；
// 骨骼动画：Idle / Walk / Run 按状态+速度自动切换，Jump / Attack 由表情/捕食一次性触发。
// 模型来源：Quaternius Animated Dinosaurs（CC0 公共领域，无需署名）· https://poly.pizza
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { VARIANTS } from './Variants.js';

// 物种 → glb 路径（Quaternius Animated Dinosaurs，6 种，CC0）。长颈龙用包里的 Apatosaurus。
const MODEL_URLS = {
  trex: './models/trex.glb',
  raptor: './models/raptor.glb',
  triceratops: './models/triceratops.glb',
  parasaurolophus: './models/parasaurolophus.glb',
  stegosaurus: './models/stegosaurus.glb',
  brachiosaurus: './models/brachiosaurus.glb',
};
const FACE_OFFSET = 0; // glTF 朝向与程序化(+Z 向前)对齐（这些模型本身就是 +Z 朝前）
const RUN_LIFESTATES = new Set(['foraging', 'escaping-water']); // 这些状态用 Run
const IDLE_LIFESTATES = new Set(['sleeping', 'laying', 'gazing']); // 这些状态用 Idle
const triCount = (g) => (g?.index ? g.index.count : g?.attributes?.position?.count || 0) / 3;

const loaders = {};
function loadGltf(url) {
  if (!loaders[url]) loaders[url] = new GLTFLoader().loadAsync(url);
  return loaders[url];
}
const clipBySuffix = (clips, s) => clips.find((c) => c.name.endsWith(s)) || null;

export function hasHybridModel(species) { return !!MODEL_URLS[species]; }

// 返回控制器 { update(dt, lifeState), react(suffix) } 或 null。须在 createDinosaur 里、加 marker 之前调用。
export function attachHybridModel(group, species, config, variant) {
  const url = MODEL_URLS[species];
  if (!url) return null;

  const procedural = [...group.children]; // 程序化身体；加载完成后整组隐藏
  const procBox = new THREE.Box3().setFromObject(group); // scale=1 时的自然高度（成长缩放基准）
  const procH = (procBox.max.y - procBox.min.y) || config.baseSize * 1.5;

  const inner = new THREE.Group();
  inner.rotation.y = FACE_OFFSET;
  group.add(inner);

  let mixer = null, anims = null;
  let idle = null, walk = null, run = null, current = null;
  let ready = false, reacting = false, reactAction = null;
  let lastX = group.position.x, lastZ = group.position.z;

  function play(a) {
    if (!a || a === current) return;
    a.reset().fadeIn(0.25).play();
    if (current) current.fadeOut(0.25);
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

    // 平面着色 + 调色：各模型材质命名不一，用三角面数启发——最大块=主体、次大=辅色，
    // 其余（眼/牙/舌等小块）保留原色。逐实例克隆材质，调色/变体互不影响。
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
    anims = gltf.animations;
    mixer = new THREE.AnimationMixer(scene);
    idle = mixer.clipAction(clipBySuffix(anims, 'Idle'));
    walk = mixer.clipAction(clipBySuffix(anims, 'Walk'));
    run = mixer.clipAction(clipBySuffix(anims, 'Run')) || walk;
    // 一次性动作（Jump/Attack）播完回到移动循环
    mixer.addEventListener('finished', (e) => {
      if (e.action === reactAction) { reacting = false; current = null; }
    });
    play(idle);
    for (const o of procedural) o.visible = false; // 换上 glTF，藏起程序化身体
    ready = true;
  }).catch((e) => console.warn('[HybridModel] load failed, keep procedural:', e));

  return {
    // 每帧调用（须在 wrapper.update 的早退之前）：推进骨骼动画 + 按状态/速度切 Idle/Walk/Run
    update(dt, lifeState) {
      if (!ready) return;
      mixer.update(dt);
      const dx = group.position.x - lastX, dz = group.position.z - lastZ;
      lastX = group.position.x; lastZ = group.position.z;
      if (reacting) return; // 一次性动作播放中，不打断
      const speed = dt > 0 ? Math.hypot(dx, dz) / dt : 0;
      if (speed < 0.2 || IDLE_LIFESTATES.has(lifeState)) play(idle);
      else if (RUN_LIFESTATES.has(lifeState)) play(run);
      else play(walk);
    },
    // 一次性骨骼动作：Jump（开心）/ Attack（捕食），播完自动回到移动循环
    react(suffix) {
      if (!ready) return;
      const clip = clipBySuffix(anims, suffix);
      if (!clip) return;
      const a = mixer.clipAction(clip);
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.fadeIn(0.06).play();
      if (current && current !== a) current.fadeOut(0.1);
      reacting = true;
      reactAction = a;
    },
  };
}
