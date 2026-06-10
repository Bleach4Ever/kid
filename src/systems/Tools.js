// 工具定义与当前选中状态

// 可选中的“神力”（底部工具栏）
export const TOOLS = [
  { id: 'mountain', icon: '⛰️', label: '造山', type: 'sculpt', dir: 1 },
  { id: 'ocean', icon: '🌊', label: '挖海', type: 'sculpt', dir: -1 },
  { id: 'tree', icon: '🌳', label: '种树', type: 'place', kind: 'tree' },
  { id: 'flower', icon: '🌷', label: '种花', type: 'place', kind: 'flower' },
  { id: 'triceratops', icon: './icons/triceratops.svg', label: '三角龙', type: 'place', kind: 'triceratops' },
  { id: 'brachiosaurus', icon: './icons/brachiosaurus.svg', label: '腕龙', type: 'place', kind: 'brachiosaurus' },
  { id: 'stegosaurus', icon: './icons/stegosaurus.svg', label: '剑龙', type: 'place', kind: 'stegosaurus' },
  { id: 'trex', icon: './icons/trex.svg', label: '霸王龙', type: 'place', kind: 'trex' },
  { id: 'raptor', icon: './icons/raptor.svg', label: '迅猛龙', type: 'place', kind: 'raptor' },
  { id: 'oviraptor', icon: './icons/oviraptor.svg', label: '窃蛋龙', type: 'place', kind: 'oviraptor' },
  { id: 'pterosaur', icon: './icons/pterosaur.svg', label: '翼龙', type: 'place', kind: 'pterosaur' },
];

// 点一下立刻触发的动作（顶部按钮）
export const ACTIONS = [
  { id: 'daynight', icon: '🌗', label: '白天黑夜' },
  { id: 'rain', icon: '🌧️', label: '下雨' },
  { id: 'rainbow', icon: '🌈', label: '彩虹' },
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
