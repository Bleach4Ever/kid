# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

「我的小世界」(My Little World) —— 给 5 岁小朋友玩的低多边形恐龙世界模拟器，基于 three.js + Vite，纯浏览器运行。核心设计约束：

- **5 岁友好**：没有失败/分数/倒计时，极少文字（教程是无字的），超大图标，温和反馈。
- **零外部素材**：所有音乐音效用 Web Audio 实时合成，模型全部程序化生成，字体经 `scripts/subset-font.mjs` 子集化。新功能不得引入外部音频/模型文件。
- 代码注释和 UI 文案以中文为主，支持中/英双语（`src/i18n.js`）。

## 常用命令

```bash
npm install            # 安装依赖
npm run dev            # Vite 开发服务器
npm run build          # 生产构建到 dist/
npm run preview        # 预览构建结果（默认 http://localhost:4173）
npm run build:itch     # 构建并打包 itch.io 用的 zip

# 测试（先 npm run build && npm run preview）
node smoke-test.mjs    # Playwright 冒烟测试：启动、工具栏、渲染、存档等端到端检查
node visual-check.mjs  # 生成 preview-day.png 供人工视觉检查
URL=http://host:port node smoke-test.mjs   # 测其他服务器
```

没有单元测试框架，也没有 lint/formatter——保持现有风格：ES modules、两空格缩进、分号、单引号；类用 `PascalCase`，函数/变量用 `camelCase`，常量用 `UPPER_SNAKE_CASE`。

## 架构

`src/main.js` 是装配中心：创建所有系统、拥有唯一的 `requestAnimationFrame` 主循环，并暴露 `window.__world` 测试句柄。模块间遵循功能边界，不要把逻辑堆进 main.js。

- `world/` — Scene（渲染器/相机/灯光/上下文丢失处理）、Terrain（高度网格 + 造山挖海笔刷 + 场景预设）、Water、Sky（昼夜过渡）。
- `entities/` — 程序化模型：Tree（树/花）、Dinosaur（15 种恐龙 + 稀有度 + 漫游/飞行/游泳/进食/产蛋/成长 AI）、Variants（闪光变体配色与概率）、Ecosystem（巢穴/蛋/神秘蛋/孵化/粪便）。
- `systems/` — Tools/Input（指针→射线→工具）、Unlocks（物种解锁里程碑）、MysteryEggs（神秘蛋调度+保底抽取）、Weather、WorldEvents（火山/流星雨等手动事件）、Audio（Web Audio 合成）、Particles、Quests、Quality、SaveGame/Storage、Profile、Bus。
- `ui/` — Toolbar、Pedia（图鉴）、Settings、Tutorial（无字教程）、Toast。

### 关键耦合机制

- **事件总线 `systems/Bus.js`**：图鉴解锁、任务进度、教程、BGM 情绪全部只通过 bus 事件与玩法耦合。给玩法加新事件时优先 `bus.emit`，不要让 UI 直接引用实体逻辑。
- **存档**：`SaveGame.js` 序列化世界到 localStorage，地形高度用 `Storage.js` 的 i16 编码压缩。错误边界（`window.onerror`、上下文丢失、unhandledrejection）都会先抢救存档再提示，重载即恢复。改动实体/地形结构时注意存档前后兼容。
- **性能分级 `Quality.js`**：auto 档检测到持续卡顿会静默降级。恐龙数量无硬上限，只在 UI 上提示（80 黄 / 100 红）。
- **i18n 先于一切 UI**：`initLang()` 在 main.js 最顶部执行；新增 UI 文案要走 `t()` / `data-i18n`，中英都要补。
- **PWA / itch.io**：Service Worker 手动注册且必须静默失败（itch 沙盒 iframe 会抛 SecurityError），只在生产构建注册。

### 测试契约

`smoke-test.mjs` 依赖 `window.__world`（stage、entities、counts、saveWorld、i18n 等句柄）。修改启动流程、工具栏、喂食、实体放置或该契约时必须同步更新冒烟测试；测试遇到 console error、page error、空白渲染必须失败。生成的截图（smoke.png、preview-*.png）已被 gitignore。

## 提交规范

短小、祈使句、可带 scope，例如 `fix(input): preserve orbit controls on touch`。可见的 UI/地形/光照/动画改动在 PR 里附前后截图。
