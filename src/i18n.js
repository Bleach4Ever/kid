// 双语（中/英）扁平 key 字典 + 运行时切换
import { profile } from './systems/Profile.js';

const DICTS = {
  zh: {
    'title': '我的小世界',
    'splash.title': '我的小世界',
    'splash.subtitle': '选择一个世界，然后继续自由创造',
    'splash.start': '开 始 玩 ▶',
    'splash.continue': '继续上次的世界 ▶',
    'preset.park.name': '恐龙乐园',
    'preset.park.desc': '树林、花田和食草龙',
    'preset.canyon.name': '高山峡谷',
    'preset.canyon.desc': '高山环绕的开阔谷地',
    'preset.islands.name': '群岛世界',
    'preset.islands.desc': '几座小岛组成的家园',
    'preset.blank.name': '从零开始',
    'preset.blank.desc': '宽阔空岛，全部自己创造',
    'tool.mountain': '造山',
    'tool.ocean': '挖海',
    'tool.tree': '种树',
    'tool.flower': '种花',
    'tool.triceratops': '三角龙',
    'tool.brachiosaurus': '腕龙',
    'tool.stegosaurus': '剑龙',
    'tool.trex': '霸王龙',
    'tool.raptor': '迅猛龙',
    'tool.oviraptor': '窃蛋龙',
    'tool.pterosaur': '翼龙',
    'action.daynight': '白天黑夜',
    'action.rain': '下雨',
    'action.rainbow': '彩虹',
    'action.pedia': '恐龙图鉴',
    'pedia.title': '恐龙图鉴',
    'pedia.close': '关闭',
    'pedia.seen': '已发现',
    'pedia.hatched': '已孵化',
    'pedia.raised': '已养大',
    'top.sound': '声音开关',
    'top.reset': '重新开始',
    'population.count': '🦕 恐龙 {n} / {max}',
  },
  en: {
    'title': 'My Little World',
    'splash.title': 'My Little World',
    'splash.subtitle': 'Pick a world, then build anything you like',
    'splash.start': "Let's Play ▶",
    'splash.continue': 'Continue Last World ▶',
    'preset.park.name': 'Dino Park',
    'preset.park.desc': 'Trees, flowers and friendly dinos',
    'preset.canyon.name': 'Big Canyon',
    'preset.canyon.desc': 'A wide valley with tall mountains',
    'preset.islands.name': 'Island World',
    'preset.islands.desc': 'A home made of little islands',
    'preset.blank.name': 'Start Fresh',
    'preset.blank.desc': 'A big empty island, all yours',
    'tool.mountain': 'Mountain',
    'tool.ocean': 'Ocean',
    'tool.tree': 'Tree',
    'tool.flower': 'Flower',
    'tool.triceratops': 'Triceratops',
    'tool.brachiosaurus': 'Brachiosaurus',
    'tool.stegosaurus': 'Stegosaurus',
    'tool.trex': 'T-Rex',
    'tool.raptor': 'Raptor',
    'tool.oviraptor': 'Oviraptor',
    'tool.pterosaur': 'Pterosaur',
    'action.daynight': 'Day & Night',
    'action.rain': 'Rain',
    'action.rainbow': 'Rainbow',
    'action.pedia': 'Dino Book',
    'pedia.title': 'Dino Book',
    'pedia.close': 'Close',
    'pedia.seen': 'Seen',
    'pedia.hatched': 'Hatched',
    'pedia.raised': 'Raised',
    'top.sound': 'Sound On/Off',
    'top.reset': 'Start Over',
    'population.count': '🦕 Dinos {n} / {max}',
  },
};

let lang = 'zh';
const listeners = new Set();

function applyMeta() {
  document.title = t('title');
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

export function initLang() {
  const saved = profile.get('lang', null);
  if (saved && DICTS[saved]) {
    lang = saved;
  } else {
    // 自动检测：zh 前缀 → 中文，否则英文
    lang = (navigator.language || 'zh').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  applyMeta();
}

export function getLang() {
  return lang;
}

export function t(key, params) {
  let s = DICTS[lang][key] ?? DICTS.zh[key] ?? key;
  if (params) {
    for (const k in params) s = s.replace(`{${k}}`, params[k]);
  }
  return s;
}

export function setLang(next) {
  if (!DICTS[next] || next === lang) return;
  lang = next;
  profile.set('lang', next);
  applyMeta();
  for (const cb of listeners) cb(lang);
}

export function onLangChange(cb) {
  listeners.add(cb);
}

// 把 [data-i18n="key"] 元素的 textContent 替换为当前语言文案
export function applyDom(root) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    el.textContent = t(el.dataset.i18n);
  }
}
