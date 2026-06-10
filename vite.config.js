import { defineConfig } from 'vite';

// 用相对路径，方便把 dist/ 直接拖到任何静态服务器或本地打开
export default defineConfig({
  base: './',
  server: { open: true },
});
