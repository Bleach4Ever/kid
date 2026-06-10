import { TOOLS, ACTIONS } from '../systems/Tools.js';
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
    this._allBtns = [];

    const bottom = document.getElementById('toolbar');
    for (const t of TOOLS) {
      const b = makeBtn(t.icon, t.label, false);
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
        onAction(a.id);
      });
      top.appendChild(b);
      this._allBtns.push(b);
    }

    this.soundBtn = makeBtn('🔊', '', true);
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
