// 物种解锁：玩法里程碑（确定性通道，孩子能看见明确目标）。
// 神秘蛋（惊喜通道）孵出未解锁物种时也走 unlock() —— 发现即拥有。
// 计数器持久化在 profile.counters，跨世界重置保留。
import { SPECIES } from '../entities/Dinosaur.js';
import { profile } from './Profile.js';
import { showToast } from '../ui/Toast.js';
import { t } from '../i18n.js';

// counter 对应 profile.counters 字段；hint 是锁定按钮上的无字提示角标。
// 排成「楼梯」：开局只有 三角龙/霸王龙/翼龙，其余靠玩法陆续解锁——
// 前 4 条极易达成（摸/孵/摆/喂），开局几分钟内逐个点亮，自带庆祝吐司。
export const SPECIES_MILESTONES = [
  { species: 'stegosaurus', counter: 'pet', need: 3, hint: '💗' },
  { species: 'oviraptor', counter: 'hatched', need: 2, hint: '🐣' },
  { species: 'brachiosaurus', counter: 'placed', need: 4, hint: '🦕' },
  { species: 'raptor', counter: 'fed', need: 3, hint: '🍖' }, // 顺带引导新的喂食玩法
  { species: 'ankylosaurus', counter: 'raisedHerb', need: 3, hint: '🌿' },
  { species: 'dilophosaurus', counter: 'raisedCarn', need: 2, hint: '🍖' },
  { species: 'parasaurolophus', counter: 'hatched', need: 5, hint: '🐣' },
  { species: 'pachycephalosaurus', counter: 'pet', need: 10, hint: '💗' },
  { species: 'diplodocus', counter: 'raisedHerb', need: 8, hint: '🌿' },
  { species: 'spinosaurus', counter: 'raisedCarn', need: 5, hint: '🍖' },
  // 新增物种：更深的里程碑，作为后期收集目标
  { species: 'styracosaurus', counter: 'placed', need: 10, hint: '🦕' },
  { species: 'compsognathus', counter: 'hatched', need: 8, hint: '🐣' },
  { species: 'carnotaurus', counter: 'raisedCarn', need: 8, hint: '🍖' },
  { species: 'gallimimus', counter: 'raisedHerb', need: 12, hint: '🌿' },
  // 第二批：更靠后的收集目标
  { species: 'protoceratops', counter: 'hatched', need: 12, hint: '🐣' },
  { species: 'kentrosaurus', counter: 'raisedHerb', need: 16, hint: '🌿' },
  { species: 'baryonyx', counter: 'raisedCarn', need: 12, hint: '🍖' },
  { species: 'iguanodon', counter: 'placed', need: 16, hint: '🦕' },
  // 第三批：天上 / 水里 + 更靠后的陆生收集
  { species: 'pachyrhinosaurus', counter: 'pet', need: 16, hint: '💗' },
  { species: 'pteranodon', counter: 'placed', need: 20, hint: '🦕' },
  { species: 'amargasaurus', counter: 'raisedHerb', need: 20, hint: '🌿' },
  { species: 'plesiosaurus', counter: 'hatched', need: 16, hint: '🐣' },
];

const HINTS = Object.fromEntries(SPECIES_MILESTONES.map((m) => [m.species, m.hint]));
export function lockHint(species) {
  return HINTS[species] || null;
}

// 非 common 且没有里程碑的物种 = 只能从神秘蛋里开出来（解锁前不出现在工具栏）
export const MYSTERY_ONLY = new Set(
  Object.keys(SPECIES).filter((id) =>
    SPECIES[id].rarity !== 'common' && !HINTS[id])
);

export function isSpeciesUnlocked(species) {
  const cfg = SPECIES[species];
  if (!cfg || cfg.rarity === 'common') return true;
  return profile.get('unlocks', []).includes(`dino.${species}`);
}

export class Unlocks {
  constructor({ bus, audio }) {
    this.bus = bus;
    this.audio = audio;
    bus.on('raised', ({ species }) => {
      const diet = SPECIES[species]?.diet;
      if (diet === 'herbivore') this._bump('raisedHerb');
      else if (diet === 'carnivore') this._bump('raisedCarn');
    });
    bus.on('hatch', ({ species }) => {
      this._bump('hatched');
      this.unlock(species); // 孵出即拥有
    });
    bus.on('pet', () => this._bump('pet'));
    bus.on('place', ({ kind }) => { if (SPECIES[kind]) this._bump('placed'); });
    bus.on('feed', () => this._bump('fed'));
  }

  _bump(key) {
    const counters = profile.get('counters', {});
    counters[key] = (counters[key] || 0) + 1;
    profile.set('counters', counters);
    for (const m of SPECIES_MILESTONES) {
      if ((counters[m.counter] || 0) >= m.need) this.unlock(m.species);
    }
  }

  // 幂等；解锁成功时吐司 + 音效 + unlock 总线事件（工具栏/图鉴刷新）
  unlock(species) {
    if (!SPECIES[species] || isSpeciesUnlocked(species)) return false;
    const unlocks = profile.get('unlocks', []);
    unlocks.push(`dino.${species}`);
    profile.set('unlocks', unlocks);
    showToast([
      { img: `./icons/${species}.svg`, alt: t(`tool.${species}`) },
      { text: '🔓', cls: 'stamp' },
      { text: '✨', cls: 'spark' },
    ]);
    this.audio.playUnlock();
    this.bus.emit('unlock', { species, unlocks });
    return true;
  }
}
