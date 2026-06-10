// 通用吐司：顶部滑入、可堆叠、2.5s 自动消失。
// 图鉴解锁与任务里程碑共用同一套 DOM/样式（#pedia-toasts / .pedia-toast）。
// parts: [{ img, alt } | { text, cls }]
export function showToast(parts) {
  const host = document.getElementById('pedia-toasts');
  if (!host) return;
  const toast = document.createElement('div');
  toast.className = 'pedia-toast';
  for (const part of parts) {
    if (part.img) {
      const img = document.createElement('img');
      img.src = part.img;
      img.alt = part.alt || '';
      toast.appendChild(img);
    } else {
      const span = document.createElement('span');
      if (part.cls) span.className = part.cls;
      span.textContent = part.text;
      toast.appendChild(span);
    }
  }
  host.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}
