import { TOOLS, ACTIONS, MAGIC_ACTIONS } from '../systems/Tools.js';
import { profile } from '../systems/Profile.js';
import { t, onLangChange } from '../i18n.js';

function makeBtn(icon, labelKey, small) {
  const b = document.createElement('button');
  b.className = 'tool-btn' + (small ? ' top-btn' : '');
  const i = document.createElement('span');
  i.className = 'icon';
  if (icon.endsWith?.('.svg')) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = labelKey ? t(labelKey) : '';
    img.className = 'dinosaur-icon';
    i.appendChild(img);
  } else {
    i.textContent = icon;
  }
  b.appendChild(i);
  if (labelKey) {
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = t(labelKey);
    b.appendChild(l);
    b._label = l;
    b._labelKey = labelKey;
  }
  b._icon = i;
  return b;
}

// 底部创造工具 + 顶部动作/声音/重置按钮
export class Toolbar {
  constructor({ tools, audio, onAction, onReset }) {
    this.tools = tools;
    this.audio = audio;
    this.buttons = {};
    this.actionBtns = {};
    this._allBtns = [];

    const bottom = document.getElementById('toolbar');
    for (const t of TOOLS) {
      const b = makeBtn(t.icon, t.label, false);
      b.dataset.tool = t.id; // 测试与样式都用 id 定位，不依赖按钮顺序
      if (t.cat) b.dataset.cat = t.cat; // CSS 按类别着色 + 类别间隙
      b.addEventListener('click', () => {
        audio.click();
        tools.select(t.id);
        this._highlight();
      });
      bottom.appendChild(b);
      this.buttons[t.id] = b;
      this._allBtns.push(b);
    }

    const top = document.getElementById('top-bar');
    for (const a of ACTIONS) {
      const b = makeBtn(a.icon, '', true);
      b._titleKey = a.label;
      b.title = t(a.label);
      b.addEventListener('click', () => {
        audio.click();
        if (a.id === 'magic') this.toggleMagic(); // ✨ 是面板开关，开/关都走这里
        onAction(a.id);
      });
      top.appendChild(b);
      this.actionBtns[a.id] = b;
      this._allBtns.push(b);
    }

    // ✨ 魔法面板（第二行）：按钮一次性全部创建，未解锁的用 .locked 直接隐藏
    this.magicBar = document.getElementById('magic-bar');
    this.magicBtns = [];
    for (const a of MAGIC_ACTIONS) {
      const b = makeBtn(a.icon, '', true);
      b._titleKey = a.label;
      b.title = t(a.label);
      b._unlock = a.unlock || null;
      b.addEventListener('click', () => {
        audio.click();
        onAction(a.id);
      });
      this.magicBar.appendChild(b);
      this.magicBtns.push(b);
      this._allBtns.push(b);
    }
    this.refreshMagic();

    // 初始图标反映 profile 恢复的静音状态
    this.soundBtn = makeBtn(audio.muted ? '🔇' : '🔊', '', true);
    this.soundBtn._titleKey = 'top.sound';
    this.soundBtn.title = t('top.sound');
    this.soundBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      this.soundBtn._icon.textContent = muted ? '🔇' : '🔊';
    });
    top.appendChild(this.soundBtn);
    this._allBtns.push(this.soundBtn);

    const resetBtn = makeBtn('🔄', '', true);
    resetBtn._titleKey = 'top.reset';
    resetBtn.title = t('top.reset');
    resetBtn.addEventListener('click', () => {
      audio.click();
      onReset();
    });
    top.appendChild(resetBtn);
    this._allBtns.push(resetBtn);

    onLangChange(() => this.refreshLabels());
    this._highlight();
  }

  // 顶部动作按钮的“未读”脉冲红点（如图鉴有新解锁）
  setBadge(id, on) {
    this.actionBtns[id]?.classList.toggle('has-badge', !!on);
  }

  toggleMagic() {
    this.magicBar.classList.toggle('open');
  }

  // 解锁变化时刷新可见按钮（面板开着也即时生效）
  refreshMagic() {
    const unlocks = profile.get('unlocks', []);
    for (const b of this.magicBtns) {
      b.classList.toggle('locked', !!b._unlock && !unlocks.includes(b._unlock));
    }
  }

  refreshLabels() {
    for (const b of this._allBtns) {
      if (b._labelKey) b._label.textContent = t(b._labelKey);
      if (b._titleKey) b.title = t(b._titleKey);
    }
  }

  _highlight() {
    for (const id in this.buttons) {
      this.buttons[id].classList.toggle('selected', id === this.tools.currentId);
    }
  }
}
