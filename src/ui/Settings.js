// 设置面板：⚙️ 顶栏按钮打开的模态，沿用图鉴的卡片风格。
// 🎵/🔔 音量滑条、✨ 画质三档、🌐 语言两档，全部即时生效并写 profile；
// 打开时按当前语言重建 DOM（和 Pedia 一样，省掉逐元素刷新）。
import { profile } from '../systems/Profile.js';
import { t, setLang, getLang } from '../i18n.js';

function el(tag, className, parent) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (parent) parent.appendChild(node);
  return node;
}

export class Settings {
  constructor({ audio, quality }) {
    this.audio = audio;
    this.quality = quality;
    this.root = document.getElementById('settings-modal');
    // 点遮罩空白处关闭
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close();
    });
  }

  toggle() {
    this.root.classList.contains('hidden') ? this.open() : this.close();
  }

  open() {
    this._build();
    this.root.classList.remove('hidden');
  }

  close() {
    this.root.classList.add('hidden');
  }

  _build() {
    this.root.innerHTML = '';
    const panel = el('div', 'pedia-panel settings-panel', this.root);
    const head = el('div', 'pedia-head', panel);
    el('span', 'pedia-title', head).textContent = `⚙️ ${t('settings.title')}`;
    const closeBtn = el('button', 'pedia-close', head);
    closeBtn.textContent = '✖';
    closeBtn.title = t('settings.close');
    closeBtn.addEventListener('click', () => {
      this.audio.click();
      this.close();
    });

    // 🎵 音乐滑条（即时生效，BGM 本身就是预览）
    this._slider(panel, '🎵', 'settings.music', this.audio.musicVol, (v) => {
      this.audio.setMusicVolume(v);
      profile.set('musicVol', this.audio.musicVol);
    });
    // 🔔 音效滑条：松手用现有放置音即时预览
    this._slider(panel, '🔔', 'settings.sfx', this.audio.sfxVol, (v) => {
      this.audio.setSfxVolume(v);
      profile.set('sfxVol', this.audio.sfxVol);
    }, () => this.audio.playPlop());

    // ✨ 画质：自动 / 高 / 低
    this._options(panel, '✨', 'settings.quality',
      [
        { id: 'auto', label: 'settings.quality.auto' },
        { id: 'high', label: 'settings.quality.high' },
        { id: 'low', label: 'settings.quality.low' },
      ],
      this.quality.preference,
      (id) => this.quality.setPreference(id) // 内部写 profile.quality
    );

    // 🌐 语言：中文 / English（文案固定双语显示，切换后整面板重建）
    this._options(panel, '🌐', 'settings.lang',
      [
        { id: 'zh', text: '中文' },
        { id: 'en', text: 'English' },
      ],
      getLang(),
      (id) => {
        setLang(id); // 内部写 profile.lang + 通知全局监听
        this._build();
      }
    );
  }

  _slider(panel, icon, labelKey, value, onInput, onRelease = null) {
    const row = el('div', 'settings-row', panel);
    el('span', 'settings-icon', row).textContent = icon;
    el('span', 'settings-label', row).textContent = t(labelKey);
    const slider = el('input', 'settings-slider', row);
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.value = String(Math.round(value * 100));
    slider.setAttribute('aria-label', t(labelKey));
    slider.addEventListener('input', () => onInput(slider.value / 100));
    if (onRelease) slider.addEventListener('change', onRelease);
  }

  _options(panel, icon, labelKey, options, selectedId, onPick) {
    const row = el('div', 'settings-row', panel);
    el('span', 'settings-icon', row).textContent = icon;
    el('span', 'settings-label', row).textContent = t(labelKey);
    const group = el('div', 'settings-opts', row);
    for (const opt of options) {
      const btn = el('button', 'settings-opt' + (opt.id === selectedId ? ' selected' : ''), group);
      btn.textContent = opt.text || t(opt.label);
      btn.addEventListener('click', () => {
        this.audio.click();
        onPick(opt.id);
        for (const b of group.children) b.classList.toggle('selected', b === btn);
      });
    }
  }
}
