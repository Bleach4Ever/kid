// 工具定义与当前选中状态

// 可选中的“神力”（底部工具栏）；label 是 i18n key，渲染时用 t() 解析
export const TOOLS = [
  { id: 'mountain', icon: '⛰️', label: 'tool.mountain', type: 'sculpt', dir: 1 },
  { id: 'ocean', icon: '🌊', label: 'tool.ocean', type: 'sculpt', dir: -1 },
  { id: 'tree', icon: '🌳', label: 'tool.tree', type: 'place', kind: 'tree' },
  { id: 'flower', icon: '🌷', label: 'tool.flower', type: 'place', kind: 'flower' },
  { id: 'triceratops', icon: './icons/triceratops.svg', label: 'tool.triceratops', type: 'place', kind: 'triceratops' },
  { id: 'brachiosaurus', icon: './icons/brachiosaurus.svg', label: 'tool.brachiosaurus', type: 'place', kind: 'brachiosaurus' },
  { id: 'stegosaurus', icon: './icons/stegosaurus.svg', label: 'tool.stegosaurus', type: 'place', kind: 'stegosaurus' },
  { id: 'trex', icon: './icons/trex.svg', label: 'tool.trex', type: 'place', kind: 'trex' },
  { id: 'raptor', icon: './icons/raptor.svg', label: 'tool.raptor', type: 'place', kind: 'raptor' },
  { id: 'oviraptor', icon: './icons/oviraptor.svg', label: 'tool.oviraptor', type: 'place', kind: 'oviraptor' },
  { id: 'pterosaur', icon: './icons/pterosaur.svg', label: 'tool.pterosaur', type: 'place', kind: 'pterosaur' },
];

// 点一下立刻触发的动作（顶部按钮）；✨ 是魔法面板的开关
export const ACTIONS = [
  { id: 'daynight', icon: '🌗', label: 'action.daynight' },
  { id: 'rain', icon: '🌧️', label: 'action.rain' },
  { id: 'magic', icon: '✨', label: 'action.magic' },
  { id: 'pedia', icon: '📖', label: 'action.pedia' },
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
