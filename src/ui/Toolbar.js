import { TOOLS, ACTIONS } from '../systems/Tools.js';

function makeBtn(icon, label, small) {
  const b = document.createElement('button');
  b.className = 'tool-btn' + (small ? ' top-btn' : '');
  const i = document.createElement('span');
  i.className = 'icon';
  if (icon.endsWith?.('.svg')) {
    const img = document.createElement('img');
    img.src = icon;
    img.alt = label;
    img.className = 'dinosaur-icon';
    i.appendChild(img);
  } else {
    i.textContent = icon;
  }
  b.appendChild(i);
  if (label) {
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    b.appendChild(l);
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
    }

    const top = document.getElementById('top-bar');
    for (const a of ACTIONS) {
      const b = makeBtn(a.icon, '', true);
      b.title = a.label;
      b.addEventListener('click', () => {
        audio.click();
        onAction(a.id);
      });
      top.appendChild(b);
    }

    this.soundBtn = makeBtn('🔊', '', true);
    this.soundBtn.title = '声音开关';
    this.soundBtn.addEventListener('click', () => {
      const muted = audio.toggleMute();
      this.soundBtn._icon.textContent = muted ? '🔇' : '🔊';
    });
    top.appendChild(this.soundBtn);

    const resetBtn = makeBtn('🔄', '', true);
    resetBtn.title = '重新开始';
    resetBtn.addEventListener('click', () => {
      audio.click();
      onReset();
    });
    top.appendChild(resetBtn);

    this._highlight();
  }

  _highlight() {
    for (const id in this.buttons) {
      this.buttons[id].classList.toggle('selected', id === this.tools.currentId);
    }
  }
}
