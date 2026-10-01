# ELDR

Procedural generator for stylized, hand-animated-looking 2D game VFX — explosions, fire, smoke, magic and impacts — exported as engine-agnostic sprite sheets, PNG sequences and GIFs, with an optional Pixel Mode.

The full product brief lives in the claude.ai Project ("stylized-2d-vfx-tool-brief.md"). Development status is in [PROGRESS.md](PROGRESS.md), decisions in [DECISIONS.md](DECISIONS.md).

## Requirements

- Node.js 20 or newer (`node -v` to check)

## Setup

```bash
npm install
```

## Everyday commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the dev server and opens ELDR in your browser. Reloads on save. |
| `npm test` | Runs all automated tests once. |
| `npm run test:watch` | Re-runs tests whenever a file changes. |
| `npm run lint` | Checks code style and common mistakes. |
| `npm run format` | Auto-fixes formatting. |
| `npm run build` | Production build into `dist/`. |

Use `npm run dev` rather than VS Code's Live Server extension: Vite resolves npm packages and hot-reloads, which Live Server cannot.

## Folder map

```
src/core       PRNG, noise, math, easing, hashing, timing
src/schema     parameter schema system
src/render     renderer interface + Canvas 2D backend, compositor, outline, cel shading
src/shapes     procedural shape generators (blob, puff, streak, ring, …)
src/elements   element motion (single, burst, emitterLoop)
src/effects    effect families (explosion, fire, smoke, magic)
src/pixel      Pixel Mode post-process
src/export     sprite sheets, JSON, PNG sequence, GIF, ZIP
src/ui         app UI (inspector, viewport, timeline, …)
src/project    project files, migration, undo
tests/         unit, golden-image and export tests
test-pages/    gallery and determinism pages, engine import projects
docs/          documentation (engine import guides, parameter reference)
```
