# Repository Guidelines

## Project Structure & Module Organization

This repository is a browser-based Three.js game built with Vite. Application code lives in `src/`:

- `main.js` assembles the world and owns the animation loop.
- `world/` contains scene, terrain, water, and sky rendering.
- `entities/` defines edible plants, seven dinosaur species, eggs, and poop.
- `systems/` handles input, tools, weather, and synthesized audio.
- `ui/` contains toolbar behavior; `style.css` contains all interface styling.
- `constants.js` and `utils.js` hold shared configuration and helpers.

`index.html` is the entry page. Browser checks live at the repository root in `smoke-test.mjs` and `visual-check.mjs`. Generated output belongs in `dist/`; do not edit it directly.

## Build, Test, and Development Commands

- `npm install`: install locked dependencies from `package-lock.json`.
- `npm run dev`: start the Vite development server and open the app.
- `npm run build`: create a production bundle in `dist/`.
- `npm run preview`: serve the production bundle, normally at `http://localhost:4173`.
- `node smoke-test.mjs`: run the Playwright interaction and WebGL smoke test against the preview server.
- `node visual-check.mjs`: generate `preview-day.png` for manual visual review.

Run `npm run build && npm run preview` before browser checks. Set `URL=http://host:port` when testing a different server.

## Coding Style & Naming Conventions

Use ES modules, two-space indentation, semicolons, and single quotes in JavaScript. Keep classes and exported constructors in `PascalCase` (`Terrain`, `Toolbar`), functions and variables in `camelCase`, and constants in `UPPER_SNAKE_CASE`. Match the existing feature-oriented module boundaries instead of expanding `main.js`. Use concise comments for non-obvious rendering, disposal, or interaction logic. No formatter or linter is configured, so preserve the surrounding style.

## Testing Guidelines

Playwright provides end-to-end coverage; there is no unit-test framework or coverage threshold. Update `smoke-test.mjs` when changing startup, toolbar controls, dinosaur feeding, entity placement, or rendering contracts such as `window.__world`. Tests must fail on console errors, page errors, blank rendering, or broken controls. Generated screenshots are intentionally ignored by Git.

## Commit & Pull Request Guidelines

Git history is unavailable in this checkout. Use short, imperative commit subjects, optionally scoped, for example `fix(input): preserve orbit controls on touch`. Keep commits focused. Pull requests should explain behavior changes, list verification commands, link relevant issues, and include before/after screenshots for visible UI, terrain, lighting, or animation changes.
