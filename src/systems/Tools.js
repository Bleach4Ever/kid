// 工具定义与当前选中状态
import { SPECIES } from '../entities/Dinosaur.js';

// 可选中的“神力”（底部工具栏）；label 是 i18n key，渲染时用 t() 解析；
// cat = 视觉类别（按钮 data-cat 着色 + 类别间隙）：earth/plant/herb/carn/special
export const BASE_TOOLS = [
  { id: 'mountain', icon: '⛰️', label: 'tool.mountain', type: 'sculpt', dir: 1, cat: 'earth' },
  { id: 'ocean', icon: '🌊', label: 'tool.ocean', type: 'sculpt', dir: -1, cat: 'earth' },
  { id: 'tree', icon: '🌳', label: 'tool.tree', type: 'place', kind: 'tree', cat: 'plant' },
  { id: 'flower', icon: '🌷', label: 'tool.flower', type: 'place', kind: 'flower', cat: 'plant' },
];

// 恐龙按钮直接由物种表生成：加物种零工具栏代码；按类别排序保持分组紧凑
const DIET_CAT = { herbivore: 'herb', carnivore: 'carn' };
const CAT_ORDER = { herb: 0, carn: 1, special: 2 };
export const DINO_TOOLS = Object.keys(SPECIES)
  .map((id) => ({
    id,
    icon: `./icons/${id}.svg`,
    label: `tool.${id}`,
    type: 'place',
    kind: id,
    cat: DIET_CAT[SPECIES[id].diet] || 'special',
  }))
  .sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat]);

export const TOOLS = [...BASE_TOOLS, ...DINO_TOOLS];

// 点一下立刻触发的动作（顶部按钮）；✨ 是魔法面板的开关
// 天气已全自动，去掉手动「下雨」按钮；昼夜按钮改为「快进时间」（时间本身自动推进）。
export const ACTIONS = [
  { id: 'daynight', icon: '⏩', label: 'action.daynight' },
  { id: 'magic', icon: '✨', label: 'action.magic' },
  { id: 'pedia', icon: '📖', label: 'action.pedia' },
  { id: 'settings', icon: '⚙️', label: 'action.settings' },
];

// ✨ 魔法面板（第二行）：unlock 对应 profile.unlocks 里的 id，未解锁直接隐藏；
// 🌈 彩虹无 unlock 字段 = 始终可用
export const MAGIC_ACTIONS = [
  { id: 'rainbow', icon: '🌈', label: 'action.rainbow' },
  { id: 'flowerRain', icon: '🌸', label: 'action.flowerRain', unlock: 'event.flowerRain' },
  { id: 'meteor', icon: '🌠', label: 'action.meteor', unlock: 'event.meteor' },
  { id: 'aurora', icon: '🌌', label: 'action.aurora', unlock: 'event.aurora' },
  { id: 'volcano', icon: '🌋', label: 'action.volcano', unlock: 'event.volcano' },
];

export class Tools {
  constructor() {
    this.byId = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
    this.currentId = 'mountain';
  }
  select(id) {
    if (this.byId[id]) this.currentId = id;
  }
  get current() {
    return this.byId[this.currentId];
  }
}
