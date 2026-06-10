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
    'action.magic': '魔法',
    'action.flowerRain': '花瓣雨',
    'action.meteor': '流星雨',
    'action.aurora': '极光',
    'action.volcano': '火山派对',
    'action.pedia': '恐龙图鉴',
    'action.settings': '设置',
    'settings.title': '设置',
    'settings.music': '音乐',
    'settings.sfx': '音效',
    'settings.quality': '画质',
    'settings.quality.auto': '自动',
    'settings.quality.high': '高',
    'settings.quality.low': '低',
    'settings.lang': '语言',
    'settings.close': '关闭',
    'pedia.title': '恐龙图鉴',
    'pedia.close': '关闭',
    'pedia.seen': '已发现',
    'pedia.hatched': '已孵化',
    'pedia.raised': '已养大',
    'top.sound': '声音开关',
    'top.reset': '重新开始',
    'population.count': '🦕 恐龙 {n} / {max}',
    'quest.title': '小任务',
    'quest.stars': '我的星星',
    'splash.loading': '载入中…',
    'fallback.title': '打不开 3D 小世界',
    'fallback.body': '这台设备暂时不支持 3D。请换一个新一点的浏览器（比如 Chrome）再来玩吧！',
    'error.title': '哎呀！',
    'error.body': '小世界遇到了一点小麻烦。别担心，你的世界已经保存好啦！',
    'error.reload': '重新开始 ▶',
    'context.restoring': '正在恢复…',
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
    'action.magic': 'Magic',
    'action.flowerRain': 'Flower Rain',
    'action.meteor': 'Meteor Shower',
    'action.aurora': 'Aurora',
    'action.volcano': 'Volcano Party',
    'action.pedia': 'Dino Book',
    'action.settings': 'Settings',
    'settings.title': 'Settings',
    'settings.music': 'Music',
    'settings.sfx': 'Sounds',
    'settings.quality': 'Graphics',
    'settings.quality.auto': 'Auto',
    'settings.quality.high': 'High',
    'settings.quality.low': 'Low',
    'settings.lang': 'Language',
    'settings.close': 'Close',
    'pedia.title': 'Dino Book',
    'pedia.close': 'Close',
    'pedia.seen': 'Seen',
    'pedia.hatched': 'Hatched',
    'pedia.raised': 'Raised',
    'top.sound': 'Sound On/Off',
    'top.reset': 'Start Over',
    'population.count': '🦕 Dinos {n} / {max}',
    'quest.title': 'Little Quests',
    'quest.stars': 'My Stars',
    'splash.loading': 'Loading…',
    'fallback.title': "Can't open the 3D world",
    'fallback.body': 'This device does not support 3D yet. Please try a newer browser like Chrome!',
    'error.title': 'Oops!',
    'error.body': "We hit a tiny bump. Don't worry — your world is safely saved!",
    'error.reload': 'Start Again ▶',
    'context.restoring': 'Coming back…',
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
