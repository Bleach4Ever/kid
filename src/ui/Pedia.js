// 恐龙图鉴：全屏“贴纸书”模态 + 解锁印章（👀发现 / 🐣孵化 / ⭐养大） + 顶部吐司。
// 解锁状态存 profile（跨世界重置持久）；卡片 DOM 每次打开时按当前语言重建，
// 未解锁卡片复用工具栏 SVG 图标做剪影（CSS filter），零新资产。
import { SPECIES } from '../entities/Dinosaur.js';
import { EGG_STYLES } from '../entities/Ecosystem.js';
import { profile } from '../systems/Profile.js';
import { showToast } from './Toast.js';
import { t } from '../i18n.js';

const DIET_ICONS = { herbivore: '🌿', carnivore: '🍖', egg: '🥚', none: '🪽' };
const STAMPS = [
  { key: 'seen', icon: '👀', label: 'pedia.seen' },
  { key: 'hatched', icon: '🐣', label: 'pedia.hatched' },
  { key: 'raised', icon: '⭐', label: 'pedia.raised' },
];

// baseSize（0.72~1.3）映射为 1-5 个脚印点：不识字也能比大小
function sizeDots(baseSize) {
  return Math.max(1, Math.min(5, Math.round(((baseSize - 0.72) / 0.58) * 4) + 1));
}

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export class Pedia {
  constructor({ bus, audio, toolbar }) {
    this.audio = audio;
    this.toolbar = toolbar;
    this.root = document.getElementById('pedia-modal');
    // 点遮罩空白处关闭（不挡住后面的世界继续运行）
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
    bus.on('place', ({ kind }) => this._unlock(kind, 'seen'));
    bus.on('hatch', ({ species }) => {
      this._unlock(species, 'seen');
      this._unlock(species, 'hatched');
    });
    bus.on('raised', ({ species }) => this._unlock(species, 'raised'));
  }

  // false → true 时持久化 + 红点 + 吐司 + 解锁音
  _unlock(species, stamp) {
    if (!SPECIES[species]) return; // place 事件也会带树/花
    const pedia = profile.get('pedia', {});
    const rec = pedia[species] || (pedia[species] = { seen: false, hatched: false, raised: false });
    if (rec[stamp]) return;
    rec[stamp] = true;
    profile.set('pedia', pedia);
    this.toolbar.setBadge('pedia', true);
    this._toast(species, stamp);
    this.audio.playUnlock();
  }

  toggle() {
    this.root.classList.contains('hidden') ? this.open() : this.close();
  }

  open() {
    this.toolbar.setBadge('pedia', false);
    this._build();
    this.root.classList.remove('hidden');
  }

  close() {
    this.root.classList.add('hidden');
  }

  _build() {
    this.root.innerHTML = '';
    const panel = el('div', 'pedia-panel', this.root);
    const head = el('div', 'pedia-head', panel);
    el('span', 'pedia-title', head).textContent = `📖 ${t('pedia.title')}`;
    const closeBtn = el('button', 'pedia-close', head);
    closeBtn.textContent = '✖';
    closeBtn.title = t('pedia.close');
    closeBtn.addEventListener('click', () => {
      this.audio.click();
      this.close();
    });
    const grid = el('div', 'pedia-grid', panel);
    const pedia = profile.get('pedia', {});
    for (const id in SPECIES) grid.appendChild(this._card(id, pedia[id] || {}));
  }

  _card(id, rec) {
    const card = el('div', 'pedia-card' + (rec.seen ? '' : ' locked'));
    const figure = el('div', 'pedia-figure', card);
    const img = el('img', '', figure);
    img.src = `./icons/${id}.svg`;
    img.alt = rec.seen ? t(`tool.${id}`) : '';
    if (!rec.seen) el('span', 'pedia-question', figure).textContent = '?';
    el('div', 'pedia-name', card).textContent = rec.seen ? t(`tool.${id}`) : '？？？';
    if (rec.seen) {
      const facts = el('div', 'pedia-facts', card);
      el('span', 'pedia-diet', facts).textContent = DIET_ICONS[SPECIES[id].diet] || '🪽';
      const paws = el('span', 'pedia-paws', facts);
      const dots = sizeDots(SPECIES[id].baseSize);
      for (let i = 0; i < 5; i++) el('i', i < dots ? '' : 'off', paws).textContent = '🐾';
      const egg = el('span', 'pedia-egg', facts);
      egg.style.background = EGG_STYLES[id].shell;
      el('i', '', egg).style.background = EGG_STYLES[id].spot;
    }
    const stamps = el('div', 'pedia-stamps', card);
    for (const s of STAMPS) {
      const stamp = el('span', 'pedia-stamp' + (rec[s.key] ? ' on' : ''), stamps);
      stamp.textContent = s.icon;
      stamp.title = t(s.label);
    }
    return card;
  }

  // 顶部滑入吐司：物种图标 + 印章图标 + 闪光（通用 Toast 模块承担动画与销毁）
  _toast(species, stamp) {
    showToast([
      { img: `./icons/${species}.svg`, alt: t(`tool.${species}`) },
      { text: STAMPS.find((s) => s.key === stamp).icon, cls: 'stamp' },
      { text: '✨', cls: 'spark' },
    ]);
  }
}
