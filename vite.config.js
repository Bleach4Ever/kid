import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// 用相对路径，方便把 dist/ 直接拖到任何静态服务器或本地打开（itch.io zip 同理）
export default defineConfig({
  base: './',
  server: { open: true },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false, // main.js 里手动注册并 try/catch（itch.io 沙盒 iframe 会抛错）
      manifest: {
        name: '我的小世界 · My Little World',
        short_name: '恐龙岛 Dino',
        description: '给小朋友玩的低多边形恐龙沙盒',
        lang: 'zh-CN',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'landscape',
        background_color: '#cdeffb',
        theme_color: '#bfe3ff',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // three.js 主包可能超过默认 2MB 预缓存上限，放宽到 4MB 保证离线可玩
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
