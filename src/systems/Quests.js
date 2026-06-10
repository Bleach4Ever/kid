// 温和任务 + 星星：会话开始随机抽 3 个图标小任务（无倒计时、无失败、不阻塞），
// 全部通过 Bus 监听既有事件推进；完成得 ⭐ 并滚动补抽。进行中任务刻意不持久化
// （会话很短，重抽更简单）；stars/unlocks 走 profile 跨会话持久。
// 星星里程碑自动解锁惊喜（无商店）：本阶段只写 unlocks + 吐司，egg.golden 立即生效。
import { SPECIES } from '../entities/Dinosaur.js';
import { setFancyEggs } from '../entities/Ecosystem.js';
import { profile } from './Profile.js';
import { showToast } from '../ui/Toast.js';
import { t, onLangChange } from '../i18n.js';

// 任务模板：icon 为 emoji；species:true 的模板抽到时随机挑一个物种、芯片用物种 SVG
const TEMPLATES = [
  { id: 'tree', icon: '🌳', count: 5, match: (type, p) => type === 'place' && p.kind === 'tree' },
  { id: 'flower', icon: '🌼', count: 6, match: (type, p) => type === 'place' && p.kind === 'flower' },
  {
    id: 'placeSpecies', species: true, count: () => 1 + ((Math.random() * 2) | 0),
    match: (type, p, q) => type === 'place' && p.kind === q.species,
  },
  { id: 'hatchAny', icon: '🐣', count: 1, match: (type) => type === 'hatch' },
  {
    id: 'hatchSpecies', species: true, badge: '🐣', count: 1,
    match: (type, p, q) => type === 'hatch' && p.species === q.species,
  },
  { id: 'mountain', icon: '⛰️', count: 3, match: (type, p) => type === 'sculpt' && p.dir > 0 },
  { id: 'rain', icon: '🌧️', count: 1, match: (type, p) => type === 'action' && p.id === 'rain' },
  { id: 'pet', icon: '💗', count: 3, match: (type) => type === 'pet' },
  { id: 'eat', icon: '😋', count: 2, match: (type) => type === 'eat' },
];

// 星星里程碑 → 解锁 id（event.* 的按钮/玩法在阶段 6 读取 unlocks 实现）
const MILESTONES = [
  { stars: 3, id: 'egg.golden', icon: '🥚' },
  { stars: 6, id: 'event.flowerRain', icon: '🌸' },
  { stars: 10, id: 'event.meteor', icon: '🌠' },
  { stars: 15, id: 'event.aurora', icon: '🌌' },
  { stars: 20, id: 'event.volcano', icon: '🌋' },
];

const ACTIVE_COUNT = 3;
const CELEBRATE_MS = 4000;

export class Quests {
  constructor({ bus, audio }) {
    this.audio = audio;
    this.active = [];
    this.panel = document.getElementById('quest-panel');
    this.starChip = document.getElementById('star-chip');
    this._renderStars(profile.get('stars', 0));
    this._applyUnlocks(profile.get('unlocks', []));
    this._applyTitles();
    onLangChange(() => this._applyTitles());
    for (const type of ['place', 'hatch', 'sculpt', 'eat', 'pet', 'action']) {
      bus.on(type, (payload) => this._onEvent(type, payload));
    }
    while (this.active.length < ACTIVE_COUNT) this._draw();
  }

  // 补抽一个与当前活跃任务模板不重复的任务
  _draw() {
    const used = new Set(this.active.map((q) => q.tplId));
    const pool = TEMPLATES.filter((tpl) => !used.has(tpl.id));
    return this._start(pool[(Math.random() * pool.length) | 0]);
  }

  _start(tpl, forcedSpecies) {
    const ids = Object.keys(SPECIES);
    const quest = {
      tplId: tpl.id,
      species: tpl.species ? forcedSpecies || ids[(Math.random() * ids.length) | 0] : null,
      count: typeof tpl.count === 'function' ? tpl.count() : tpl.count,
      n: 0,
      done: false,
      match: tpl.match,
    };
    quest.el = this._chip(tpl, quest);
    this.panel.appendChild(quest.el);
    this.active.push(quest);
    return quest;
  }

  // 不识字芯片：[图标] + 进度点（emoji 或物种 SVG，与图鉴一致）
  _chip(tpl, quest) {
    const chip = document.createElement('div');
    chip.className = 'quest-chip';
    const fig = document.createElement('span');
    fig.className = 'q-icon';
    if (quest.species) {
      const img = document.createElement('img');
      img.src = `./icons/${quest.species}.svg`;
      img.alt = t(`tool.${quest.species}`);
      fig.appendChild(img);
      if (tpl.badge) {
        const badge = document.createElement('i');
        badge.className = 'q-badge';
        badge.textContent = tpl.badge;
        fig.appendChild(badge);
      }
    } else {
      fig.textContent = tpl.icon;
    }
    chip.appendChild(fig);
    const dots = document.createElement('span');
    dots.className = 'q-dots';
    quest.dots = [];
    for (let i = 0; i < quest.count; i++) {
      quest.dots.push(dots.appendChild(document.createElement('i')));
    }
    chip.appendChild(dots);
    return chip;
  }

  _onEvent(type, payload) {
    for (const quest of [...this.active]) {
      if (quest.done || !quest.match(type, payload || {}, quest)) continue;
      quest.n++;
      quest.dots[quest.n - 1]?.classList.add('on'); // .on 自带 scale 弹跳动画
      if (quest.n >= quest.count) this._complete(quest);
    }
  }

  // 庆祝 4s（芯片翻成 ⭐、星星飞向计数芯片、号角）后移除并补抽，滚动保持 3 个
  _complete(quest) {
    quest.done = true;
    quest.el.classList.add('done');
    quest.el.querySelector('.q-icon').textContent = '⭐';
    this.audio.playFanfare();
    this._flyStar(quest.el);
    this._gainStar();
    setTimeout(() => {
      quest.el.remove();
      const i = this.active.indexOf(quest);
      if (i >= 0) {
        this.active.splice(i, 1);
        this._draw();
      }
    }, CELEBRATE_MS);
  }

  // 轻量飞星：克隆一个 ⭐ 用 CSS transition 从芯片飞到右上角计数芯片
  _flyStar(chipEl) {
    const from = chipEl.getBoundingClientRect();
    const to = this.starChip.getBoundingClientRect();
    const star = document.createElement('span');
    star.className = 'star-fly';
    star.textContent = '⭐';
    star.style.left = `${from.left + from.width / 2}px`;
    star.style.top = `${from.top + from.height / 2}px`;
    document.body.appendChild(star);
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    // 两帧后再设位移，确保初始位置先被布局，transition 才会播放
    requestAnimationFrame(() => requestAnimationFrame(() => {
      star.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`;
    }));
    setTimeout(() => {
      star.remove();
      this.starChip.classList.remove('pop');
      void this.starChip.offsetWidth; // 重启动画
      this.starChip.classList.add('pop');
    }, 850);
  }

  _gainStar() {
    const stars = profile.get('stars', 0) + 1;
    profile.set('stars', stars);
    this._renderStars(stars);
    this._checkMilestones(stars);
  }

  _renderStars(stars) {
    if (this.starChip) this.starChip.textContent = `⭐ ${stars}`;
  }

  _checkMilestones(stars) {
    const unlocks = profile.get('unlocks', []);
    let changed = false;
    for (const m of MILESTONES) {
      if (stars < m.stars || unlocks.includes(m.id)) continue;
      unlocks.push(m.id);
      changed = true;
      showToast([
        { text: '⭐', cls: 'stamp' },
        { text: m.icon, cls: 'stamp' },
        { text: '✨', cls: 'spark' },
      ]);
      this.audio.playUnlock();
    }
    if (changed) {
      profile.set('unlocks', unlocks);
      this._applyUnlocks(unlocks);
    }
  }

  // 解锁立即生效的部分：egg.golden → 25% 的新蛋用华丽配色
  _applyUnlocks(unlocks) {
    setFancyEggs(unlocks.includes('egg.golden'));
  }

  _applyTitles() {
    if (this.panel) this.panel.title = t('quest.title');
    if (this.starChip) this.starChip.title = t('quest.stars');
  }

  // ---------- 调试/冒烟测试入口 ----------
  // 把第 0 个任务强制换成指定模板（可附带物种参数），返回新任务对象
  _debugSet(tplId, species) {
    const tpl = TEMPLATES.find((x) => x.id === tplId);
    if (!tpl) return null;
    const old = this.active.shift();
    if (old) old.el.remove();
    const quest = this._start(tpl, species);
    this.active.pop();
    this.active.unshift(quest);
    this.panel.prepend(quest.el);
    return quest;
  }

  _debugAddStars(n) {
    for (let i = 0; i < n; i++) this._gainStar();
  }
}
