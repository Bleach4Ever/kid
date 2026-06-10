# Repository Guidelines

## Project Structure & Module Organization

This repository is a browser-based Three.js game built with Vite. Application code lives in `src/`:

- `main.js` assembles the world, owns the single animation loop, registers error boundaries, and exposes the `window.__world` test handle.
- `world/` contains scene, terrain, water, and sky rendering, including WebGL context-loss recovery.
- `entities/` defines edible plants, seven dinosaur species, nests, eggs, and poop — all models are procedural.
- `systems/` handles input, tools, weather, manual world events (volcano, meteors, aurora), synthesized audio, particles, quests, quality tiers, save games, player profile, and the `Bus` event bus.
- `ui/` contains the toolbar, dino pedia (sticker book), settings panel, wordless tutorial, and toasts; `style.css` contains all interface styling.
- `i18n.js` provides bilingual (zh/en) strings; `initLang()` runs before any UI is built.
- `constants.js` and `utils.js` hold shared configuration and helpers.

`index.html` is the entry page. Browser checks live at the repository root in `smoke-test.mjs` and `visual-check.mjs`. Asset pipelines live in `scripts/` (`make-icons.mjs`, `subset-font.mjs`). Generated output belongs in `dist/`; do not edit it directly.

Key coupling rules:

- Gameplay communicates with pedia, quests, tutorial, and BGM mood only through `systems/Bus.js` events. Prefer `bus.emit` over letting UI reference entity logic directly.
- `systems/SaveGame.js` persists the world to localStorage (terrain heights compressed via `Storage.js` i16 codec). Error boundaries save before showing any overlay, so a reload restores the world. Keep saves backward compatible when changing entity or terrain structures.
- The game targets 5-year-olds: no failure states, scores, or timers; minimal text (the tutorial is wordless); new UI strings must go through `t()` / `data-i18n` in both languages.
- No external assets: audio is synthesized with Web Audio, models are procedural, fonts are subsetted. Do not add external audio/model files.
- The PWA service worker is registered manually, only in production builds, and must fail silently (itch.io's sandboxed iframe throws SecurityError).

## Build, Test, and Development Commands

- `npm install`: install locked dependencies from `package-lock.json`.
- `npm run dev`: start the Vite development server and open the app.
- `npm run build`: create a production bundle in `dist/`.
- `npm run preview`: serve the production bundle, normally at `http://localhost:4173`.
- `npm run build:itch`: build and zip `dist/` into `my-little-world-itch.zip` for itch.io.
- `node smoke-test.mjs`: run the Playwright interaction and WebGL smoke test against the preview server.
- `node visual-check.mjs`: generate `preview-day.png` for manual visual review.

Run `npm run build && npm run preview` before browser checks. Set `URL=http://host:port` when testing a different server.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, semicolons, and single quotes in JavaScript. Keep classes and exported constructors in `PascalCase` (`Terrain`, `Toolbar`), functions and variables in `camelCase`, and constants in `UPPER_SNAKE_CASE`. Match the existing feature-oriented module boundaries instead of expanding `main.js`. Code comments are written in Chinese; use concise comments for non-obvious rendering, disposal, or interaction logic. No formatter or linter is configured, so preserve the surrounding style.

## Testing Guidelines

Playwright provides end-to-end coverage; there is no unit-test framework or coverage threshold. Update `smoke-test.mjs` when changing startup, toolbar controls, dinosaur feeding, entity placement, save/restore, i18n persistence, or rendering contracts such as `window.__world`. Tests must fail on console errors, page errors, blank rendering, or broken controls. Generated screenshots are intentionally ignored by Git.

## Commit & Pull Request Guidelines

Use short, imperative commit subjects, optionally scoped, for example `fix(input): preserve orbit controls on touch`. Keep commits focused. Pull requests should explain behavior changes, list verification commands, link relevant issues, and include before/after screenshots for visible UI, terrain, lighting, or animation changes.
