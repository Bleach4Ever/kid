import * as THREE from 'three';
import { WORLD_SIZE, SEA_LEVEL } from '../constants.js';
import { clamp, easeOutBack, lerp, TAU } from '../utils.js';

const BOUND = WORLD_SIZE * 0.46;
const eyeMat = new THREE.MeshStandardMaterial({ color: '#30283a', roughness: 0.7 });
const toothMat = new THREE.MeshStandardMaterial({ color: '#fff8df', flatShading: true });

const SPECIES = {
  triceratops: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.45,
    body: '#78c96b', accent: '#d8ef9c',
  },
  brachiosaurus: {
    diet: 'herbivore', baseSize: 1.3, speed: 1.05,
    body: '#67b9a6', accent: '#a9e0cc',
  },
  stegosaurus: {
    diet: 'herbivore', baseSize: 1.05, speed: 1.25,
    body: '#e4ad59', accent: '#ffdf7e',
  },
  trex: {
    diet: 'carnivore', baseSize: 1.2, speed: 1.65,
    body: '#d96b5f', accent: '#ffb07d',
  },
  raptor: {
    diet: 'carnivore', baseSize: 0.72, speed: 2.35,
    body: '#9a79d1', accent: '#d2b8ff',
  },
  oviraptor: {
    diet: 'egg', baseSize: 0.76, speed: 2.1,
    body: '#e58d45', accent: '#ffe080',
  },
  pterosaur: {
    diet: 'none', baseSize: 0.9, speed: 0.65,
    body: '#5ea5d8', accent: '#a8dcf5', flying: true,
  },
};

function material(color) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.82 });
}

function mesh(geometry, mat, parent, position, scale = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(...position);
  m.scale.set(...scale);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function addEyes(parent, y, z, spread = 0.2, radius = 0.065) {
  for (const side of [-1, 1]) {
    mesh(new THREE.SphereGeometry(radius, 7, 7), eyeMat, parent, [side * spread, y, z]);
  }
}

function addLegs(group, mat, positions, height = 0.7, radius = 0.12) {
  for (const [x, z] of positions) {
    mesh(
      new THREE.CylinderGeometry(radius * 0.8, radius, height, 6),
      mat,
      group,
      [x, height / 2, z]
    );
  }
}

function addTail(group, mat, position, length = 1.25, radius = 0.28) {
  const tail = mesh(new THREE.ConeGeometry(radius, length, 7), mat, group, position);
  tail.rotation.x = -Math.PI / 2;
  return tail;
}

function buildTriceratops(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.7, 1), bodyMat, g, [0, 0.9, 0], [1, 0.72, 1.35]);
  const head = mesh(new THREE.IcosahedronGeometry(0.48, 1), bodyMat, g, [0, 0.92, 0.88], [1, 0.85, 1.05]);
  mesh(new THREE.ConeGeometry(0.66, 0.35, 8), accentMat, g, [0, 1.15, 0.62], [1, 1, 0.7]).rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(0.075, 0.55, 7), toothMat, g, [side * 0.25, 1.15, 1.25]);
    horn.rotation.x = Math.PI / 2;
  }
  const noseHorn = mesh(new THREE.ConeGeometry(0.065, 0.38, 7), toothMat, g, [0, 0.96, 1.38]);
  noseHorn.rotation.x = Math.PI / 2;
  addEyes(head, 0.13, 0.4, 0.22);
  addLegs(g, bodyMat, [[-0.42, -0.48], [0.42, -0.48], [-0.42, 0.5], [0.42, 0.5]]);
  addTail(g, bodyMat, [0, 0.86, -1.2], 1.15, 0.25);
  return { group: g, stepParts: [] };
}

function buildBrachiosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.72, 1), bodyMat, g, [0, 1.1, -0.2], [1, 0.78, 1.45]);
  const neck = mesh(new THREE.CylinderGeometry(0.24, 0.38, 2.35, 7), bodyMat, g, [0, 2.15, 0.55]);
  neck.rotation.x = -0.24;
  const head = mesh(new THREE.IcosahedronGeometry(0.34, 1), accentMat, g, [0, 3.32, 0.84], [0.9, 0.7, 1.15]);
  addEyes(head, 0.08, 0.28, 0.18, 0.055);
  addLegs(g, bodyMat, [[-0.42, -0.62], [0.42, -0.62], [-0.42, 0.42], [0.42, 0.42]], 1.05, 0.15);
  addTail(g, bodyMat, [0, 1.15, -1.55], 1.7, 0.3);
  return { group: g, stepParts: [] };
}

function buildStegosaurus(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.72, 1), bodyMat, g, [0, 0.9, -0.05], [1, 0.72, 1.5]);
  const head = mesh(new THREE.IcosahedronGeometry(0.32, 1), bodyMat, g, [0, 0.73, 1.12], [0.9, 0.78, 1.2]);
  addEyes(head, 0.1, 0.29, 0.16, 0.05);
  for (let i = 0; i < 6; i++) {
    const z = -0.85 + i * 0.34;
    const plate = mesh(new THREE.ConeGeometry(0.24, 0.62, 4), accentMat, g, [0, 1.5, z]);
    plate.rotation.y = Math.PI / 4;
  }
  addLegs(g, bodyMat, [[-0.42, -0.52], [0.42, -0.52], [-0.42, 0.55], [0.42, 0.55]], 0.65);
  addTail(g, bodyMat, [0, 0.92, -1.35], 1.35, 0.26);
  return { group: g, stepParts: [] };
}

function buildPredator(bodyMat, accentMat, small) {
  const g = new THREE.Group();
  const bodyY = small ? 0.8 : 1.05;
  mesh(new THREE.IcosahedronGeometry(0.62, 1), bodyMat, g, [0, bodyY, 0], [0.9, 0.72, 1.45]);
  const head = mesh(
    new THREE.IcosahedronGeometry(small ? 0.34 : 0.48, 1),
    bodyMat,
    g,
    [0, bodyY + 0.28, 0.92],
    [1, 0.76, 1.28]
  );
  const jaw = mesh(new THREE.BoxGeometry(small ? 0.42 : 0.58, 0.18, 0.55), accentMat, g, [0, bodyY + 0.12, 1.2]);
  jaw.rotation.x = 0.08;
  addEyes(head, 0.14, small ? 0.28 : 0.4, small ? 0.18 : 0.24);
  const legs = [];
  for (const side of [-1, 1]) {
    const leg = mesh(
      new THREE.CylinderGeometry(0.1, 0.14, small ? 0.75 : 0.95, 6),
      bodyMat,
      g,
      [side * 0.34, (small ? 0.75 : 0.95) / 2, -0.1]
    );
    legs.push(leg);
    const arm = mesh(new THREE.CylinderGeometry(0.045, 0.06, small ? 0.38 : 0.3, 5), bodyMat, g, [side * 0.38, bodyY + 0.05, 0.52]);
    arm.rotation.z = side * 0.55;
  }
  addTail(g, bodyMat, [0, bodyY, -1.25], small ? 1.45 : 1.8, small ? 0.22 : 0.3);
  return { group: g, stepParts: legs };
}

function buildPterosaur(bodyMat, accentMat) {
  const g = new THREE.Group();
  mesh(new THREE.IcosahedronGeometry(0.38, 1), bodyMat, g, [0, 0, 0], [0.9, 0.65, 1.3]);
  const head = mesh(new THREE.IcosahedronGeometry(0.25, 1), bodyMat, g, [0, 0.08, 0.58], [0.85, 0.7, 1.1]);
  const beak = mesh(new THREE.ConeGeometry(0.1, 0.62, 6), accentMat, g, [0, 0.02, 0.98]);
  beak.rotation.x = Math.PI / 2;
  const crest = mesh(new THREE.ConeGeometry(0.16, 0.48, 5), accentMat, g, [0, 0.25, 0.42]);
  crest.rotation.x = -0.55;
  addEyes(head, 0.1, 0.2, 0.14, 0.045);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.ConeGeometry(0.95, 1.7, 3), accentMat, g, [side * 0.75, 0, -0.08]);
    wing.rotation.z = side * Math.PI / 2;
    wing.rotation.y = side * 0.25;
    wings.push(wing);
  }
  addTail(g, bodyMat, [0, 0, -0.76], 0.75, 0.12);
  return { group: g, wings, stepParts: [] };
}

function buildOviraptor(bodyMat, accentMat) {
  const model = buildPredator(bodyMat, accentMat, true);
  const g = model.group;
  const crest = mesh(new THREE.ConeGeometry(0.18, 0.5, 5), accentMat, g, [0, 1.24, 0.86]);
  crest.rotation.x = -0.35;
  const beak = mesh(new THREE.ConeGeometry(0.13, 0.4, 6), accentMat, g, [0, 0.93, 1.38]);
  beak.rotation.x = Math.PI / 2;
  return model;
}

function addAlertMarker(group) {
  const marker = new THREE.Group();
  const yellow = new THREE.MeshBasicMaterial({ color: '#ffe34f', depthTest: false });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.52, 0.13), yellow);
  bar.position.y = 0.25;
  marker.add(bar);
  const dot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), yellow);
  dot.position.y = -0.13;
  marker.add(dot);
  marker.position.set(0, 3.1, 0);
  marker.visible = false;
  marker.renderOrder = 20;
  group.add(marker);
  return marker;
}

function buildModel(species, config) {
  const bodyMat = material(config.body);
  const accentMat = material(config.accent);
  if (species === 'triceratops') return buildTriceratops(bodyMat, accentMat);
  if (species === 'brachiosaurus') return buildBrachiosaurus(bodyMat, accentMat);
  if (species === 'stegosaurus') return buildStegosaurus(bodyMat, accentMat);
  if (species === 'trex') return buildPredator(bodyMat, accentMat, false);
  if (species === 'raptor') return buildPredator(bodyMat, accentMat, true);
  if (species === 'oviraptor') return buildOviraptor(bodyMat, accentMat);
  return buildPterosaur(bodyMat, accentMat);
}

function diskTarget(radius = BOUND) {
  const angle = Math.random() * TAU;
  const distance = Math.sqrt(Math.random()) * radius;
  return { x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
}

function nearestFood(self, entities) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (entity === self || !entity.alive || entity.consumed) continue;
    if (self.diet === 'herbivore' && entity.kind !== 'tree' && entity.kind !== 'flower') continue;
    if (self.diet === 'carnivore') {
      if (!entity.isDinosaur || entity.flying || entity.size >= self.size * 0.8) continue;
    }
    if (self.diet === 'egg' && !entity.isEgg) continue;
    if (self.diet === 'none') continue;
    const distance = self.object3d.position.distanceToSquared(entity.object3d.position);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

function nearestNest(self, entities) {
  let best = null;
  let bestDistance = Infinity;
  for (const entity of entities) {
    if (
      !entity.isNest ||
      !entity.alive ||
      entity.species !== self.species ||
      entity.egg ||
      (entity.occupiedBy && entity.occupiedBy !== self)
    ) continue;
    const distance = self.object3d.position.distanceToSquared(entity.object3d.position);
    if (distance < bestDistance) {
      best = entity;
      bestDistance = distance;
    }
  }
  return best;
}

export function createDinosaur(species, saved = null) {
  const config = SPECIES[species] || SPECIES.triceratops;
  const model = buildModel(species, config);
  const group = model.group;
  const alertMarker = addAlertMarker(group);
  const wrapper = {
    object3d: group,
    kind: species,
    species,
    diet: config.diet,
    isDinosaur: true,
    flying: Boolean(config.flying),
    alive: true,
    consumed: false,
    size: config.baseSize * 0.65,
    hungerTimer: config.diet === 'none'
      ? Infinity
      : Number.isFinite(saved?.hunger) ? saved.hunger : 3 + Math.random() * 5,
    target: null,
    // 必须恢复 eggTimer，否则读档后全体恐龙同时产蛋
    eggTimer: Number.isFinite(saved?.egg) ? saved.egg : 35 + Math.random() * 25,
    mealsEaten: 0,
    lifeState: 'wandering',
    nestTarget: null,
  };

  let age = Number.isFinite(saved?.age) ? saved.age : 0;
  let foodGrowth = Number.isFinite(saved?.fg) ? saved.fg : 0;
  // 读档恢复的成年恐龙直接以接近全尺寸出现，不从零长大
  let visualScale = saved ? config.baseSize * growthFactor() * 0.9 : 0.001;
  let wanderTarget = diskTarget();
  let retargetTimer = 0;
  let walkTime = Math.random() * TAU;
  let flightAngle = Math.random() * TAU;
  let layingTime = 0;
  const flightRadius = 8 + Math.random() * 13;
  const flightHeight = 6 + Math.random() * 5;

  function growthFactor() {
    return Math.max(0.65, lerp(0.65, 1, Math.min(1, age / 60)) + foodGrowth);
  }

  function chooseLandTarget(terrain) {
    for (let i = 0; i < 8; i++) {
      const candidate = diskTarget();
      if (terrain.getHeightAt(candidate.x, candidate.z) > SEA_LEVEL + 0.15) return candidate;
    }
    return diskTarget(BOUND * 0.75);
  }

  function moveToward(target, dt, terrain, speedMultiplier = 1) {
    const p = group.position;
    const dx = target.x - p.x;
    const dz = target.z - p.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 0.05) {
      const vx = dx / distance;
      const vz = dz / distance;
      p.x += vx * config.speed * speedMultiplier * dt;
      p.z += vz * config.speed * speedMultiplier * dt;
      group.rotation.y = Math.atan2(vx, vz);
      walkTime += dt * config.speed * 5;
      for (let i = 0; i < model.stepParts.length; i++) {
        model.stepParts[i].rotation.x = Math.sin(walkTime + i * Math.PI) * 0.28;
      }
    }
    p.y = Math.max(SEA_LEVEL, terrain.getHeightAt(p.x, p.z));
    return distance;
  }

  function releaseNest() {
    if (wrapper.nestTarget?.occupiedBy === wrapper) wrapper.nestTarget.occupiedBy = null;
    wrapper.nestTarget = null;
  }

  function acquireNest(ctx) {
    let nest = nearestNest(wrapper, ctx.entities);
    if (!nest) {
      const offset = diskTarget(5);
      const x = clamp(group.position.x + offset.x, -BOUND, BOUND);
      const z = clamp(group.position.z + offset.z, -BOUND, BOUND);
      nest = ctx.createNest(wrapper.species, { x, z });
      wrapper.lifeState = 'building-nest';
    } else {
      wrapper.lifeState = 'seeking-nest';
    }
    nest.occupiedBy = wrapper;
    wrapper.nestTarget = nest;
  }

  function finishLaying(ctx) {
    ctx.layEgg(wrapper, wrapper.nestTarget);
    releaseNest();
    wrapper.eggTimer = 45 + Math.random() * 30;
    wrapper.lifeState = 'wandering';
    layingTime = 0;
  }

  function updateReproduction(dt, ctx) {
    if (age < 20 || wrapper.eggTimer > 0) return false;
    if (
      wrapper.nestTarget &&
      (!wrapper.nestTarget.alive || wrapper.nestTarget.egg)
    ) {
      releaseNest();
    }
    if (!wrapper.nestTarget) acquireNest(ctx);
    const nest = wrapper.nestTarget;
    if (!nest) return false;

    if (wrapper.flying) {
      wrapper.lifeState = 'seeking-nest';
      const p = group.position;
      const targetY = ctx.terrain.getHeightAt(nest.object3d.position.x, nest.object3d.position.z) + 5;
      const dx = nest.object3d.position.x - p.x;
      const dz = nest.object3d.position.z - p.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.08) {
        const speed = config.speed * 5;
        p.x += (dx / distance) * speed * dt;
        p.z += (dz / distance) * speed * dt;
        p.y += (targetY - p.y) * Math.min(1, dt * 2);
        group.rotation.y = Math.atan2(dx, dz);
      }
      if (distance < 1.2) {
        wrapper.lifeState = 'laying';
        layingTime += dt;
        if (layingTime >= 0.6) finishLaying(ctx);
      }
      return true;
    }

    const distance = moveToward(nest.object3d.position, dt, ctx.terrain, 1.15);
    wrapper.lifeState = distance > Math.max(0.75, wrapper.size * 0.55)
      ? 'seeking-nest'
      : 'laying';
    if (wrapper.lifeState === 'laying') {
      layingTime += dt;
      const squat = 1 - Math.sin(Math.min(1, layingTime / 2) * Math.PI) * 0.12;
      group.scale.set(visualScale, visualScale * squat, visualScale);
      if (layingTime >= 2) finishLaying(ctx);
    }
    return true;
  }

  wrapper.update = (dt, ctx) => {
    if (!wrapper.alive) return;
    age += dt;
    wrapper.eggTimer = Math.max(0, wrapper.eggTimer - dt);
    const desiredScale = config.baseSize * growthFactor();
    wrapper.size = desiredScale;
    const intro = age < 0.45 ? Math.max(0.001, easeOutBack(age / 0.45)) : 1;
    visualScale += (desiredScale * intro - visualScale) * Math.min(1, dt * 5);
    group.scale.setScalar(visualScale);

    if (updateReproduction(dt, ctx)) {
      alertMarker.visible = false;
      return;
    }

    if (wrapper.flying) {
      flightAngle += dt * config.speed;
      const x = Math.cos(flightAngle) * flightRadius;
      const z = Math.sin(flightAngle) * flightRadius;
      const ground = Math.max(SEA_LEVEL, ctx.terrain.getHeightAt(x, z));
      group.position.set(x, ground + flightHeight + Math.sin(flightAngle * 2) * 0.7, z);
      group.rotation.y = flightAngle + Math.PI / 2;
      const flap = Math.sin(ctx.time * 8) * 0.65;
      model.wings[0].rotation.x = flap;
      model.wings[1].rotation.x = flap;
      return;
    }

    wrapper.hungerTimer = Math.max(0, wrapper.hungerTimer - dt);
    retargetTimer -= dt;
    if (wrapper.target && (!wrapper.target.alive || wrapper.target.consumed)) wrapper.target = null;
    if (wrapper.hungerTimer === 0 && !wrapper.target && retargetTimer <= 0) {
      wrapper.target = nearestFood(wrapper, ctx.entities);
      retargetTimer = 0.7;
    }
    alertMarker.visible = wrapper.diet === 'carnivore' && Boolean(wrapper.target);

    if (wrapper.target) {
      wrapper.lifeState = 'foraging';
      const chaseSpeed = wrapper.diet === 'carnivore' ? 1.7 : 1.25;
      const distance = moveToward(wrapper.target.object3d.position, dt, ctx.terrain, chaseSpeed);
      const eatDistance = Math.max(0.8, wrapper.size * 0.75);
      if (distance <= eatDistance && wrapper.target.consume?.(ctx.removeEntity)) {
        foodGrowth += 0.05;
        wrapper.mealsEaten++;
        wrapper.hungerTimer = 12 + Math.random() * 8;
        wrapper.target = null;
        alertMarker.visible = false;
        ctx.spawnPoop(wrapper);
        ctx.audio.playEat();
      }
      return;
    }

    wrapper.lifeState = 'wandering';
    if (Math.hypot(wanderTarget.x - group.position.x, wanderTarget.z - group.position.z) < 0.8) {
      wanderTarget = chooseLandTarget(ctx.terrain);
    }
    moveToward(wanderTarget, dt, ctx.terrain);
  };

  wrapper.getSaveState = () => {
    const r = (v) => Math.round(v * 100) / 100;
    const state = {
      k: 'dino',
      s: species,
      x: r(group.position.x),
      z: r(group.position.z),
      age: r(age),
      fg: r(foodGrowth),
      egg: r(wrapper.eggTimer),
    };
    // Infinity（翼龙）无法过 JSON，省略后读档时按物种重新取默认值
    if (Number.isFinite(wrapper.hungerTimer)) state.hunger = r(wrapper.hungerTimer);
    return state;
  };

  wrapper.consume = (removeEntity) => {
    if (!wrapper.alive || wrapper.consumed || wrapper.flying) return false;
    wrapper.consumed = true;
    let elapsed = 0;
    const startScale = visualScale;
    wrapper.update = (dt) => {
      elapsed += dt;
      const t = clamp(elapsed / 0.4, 0, 1);
      group.scale.setScalar(startScale * (1 - t));
      group.rotation.y += dt * 5;
      if (t === 1) removeEntity(wrapper);
    };
    return true;
  };

  return wrapper;
}

export { SPECIES };
