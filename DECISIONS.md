# DECISIONS

Every significant technical or creative decision: what, why, alternatives. Creative decisions are tagged `[Raul]`.

---

### D-001 · Name: ELDR `[Raul]` — 2026-10-01
Working name for the tool. Package name `eldr`. Project file format id `eldr-vfx` (replaces the brief's placeholder `stylized-vfx`).

### D-002 · Build tooling: Vite — 2026-10-01
- **Why:** fast dev server with hot reload, resolves npm packages (needed for fflate/gifenc later), simple production build, works with Electron later.
- **Alternatives:** zero-build (native ES modules + import maps) — rejected because bare npm imports and multi-page builds get awkward; VS Code Live Server — can't resolve npm packages.

### D-003 · Tests: Vitest — 2026-10-01
- **Why:** shares Vite's config and module resolution, fast, familiar API.
- **Alternative:** `node --test` — fine for pure logic but would need separate config for anything touching Vite.

### D-004 · Lint + format: Biome — 2026-10-01
- **Why:** one dev dependency does both linting and formatting, very fast.
- **Alternative:** ESLint + Prettier — two tools, more config, more dependencies.
- Style: 2-space indent, single quotes, semicolons, 100-char lines. Markdown is not formatted.

### D-005 · Types: JSDoc + `// @ts-check`, no TypeScript — 2026-10-01
- **Why:** the brief requires vanilla JS. `jsconfig.json` + JSDoc gives VS Code type checking and autocomplete with zero build step for types.
- **Alternative:** TypeScript — adds a compile step and departs from the vanilla-JS stack.

### D-006 · What "deterministic" means — 2026-10-01
- **Rule:** same params + same seed → **pixel-identical output within one runtime** (same browser engine on the same machine). Determinism tests require exact hash equality.
- **Why:** Canvas 2D anti-aliasing and some `Math` functions can differ slightly across browsers/GPUs, so cross-browser bit-identity cannot be guaranteed.
- **Consequences:**
  - Golden-image tests use a small per-pixel diff tolerance.
  - Goldens and determinism tests run in one pinned environment: headless Chromium via Playwright (added in step 1.4).
  - All logic before rasterization (PRNG, noise, motion, geometry) is pure JS and must be bit-exact everywhere — covered by unit tests in Node.

### D-007 · Folder structure — 2026-10-01
Follows brief §2.4, with two additions: `/docs` (engine import guides, parameter reference) and `src/version.js` (single source for app name, app version and file-format version).

### D-010 · PRNG: sfc32, seeded via hashing — 2026-10-01
- **Why:** passes PractRand, 128-bit state, pure 32-bit integer math → bit-identical everywhere. Seeds expand through `hash32` + 12 warm-up rounds so neighbouring seeds (1, 2, 3…) give unrelated sequences.
- **Alternative:** mulberry32 — simpler but only 32-bit state and weaker statistics.
- `gaussian()` uses Irwin–Hall (sum of 4 uniforms) instead of Box–Muller to avoid `Math.log`/`Math.cos`, which aren't guaranteed bit-identical across engines.

### D-011 · Sub-seeds: `subSeed(seed, elementId, index) = hash32(seed, elementId, index)` — 2026-10-01
Each element/particle gets its seed from a pure hash, never from a shared generator's position. Adding, removing or reordering layers never changes another layer's randomness. Hashing is FNV-1a for strings + MurmurHash3 finalizer for mixing.

### D-012 · Noise: own seeded simplex 2D/3D/4D (Gustavson reference) — 2026-10-01
- **Why:** no dependency, seeded permutation from our PRNG, uses only basic arithmetic → bit-identical across engines. 4D is needed for seamless loops (brief §3.5).
- **Alternative:** `simplex-noise` npm package (MIT) — fine, but it's ~200 lines we fully control this way.
- Output measured within ±0.998 (2D), ±0.976 (3D), ±0.974 (4D).

### D-013 · Pinned reference values in tests — 2026-10-01
PRNG, hash and noise tests pin exact output values. If one ever changes, every effect and saved project would look different, so those tests must only be updated deliberately (with Raul's OK).

### D-014 · Transcendental Math functions — 2026-10-01
Easings that use `Math.sin/cos/pow` (sine, expo, elastic) are exact within one runtime (D-006) but may differ in the last bits across engines. Accepted: the difference is ~1e-16, invisible, and golden tests use a tolerance.

### D-008 · Plan order unchanged — 2026-10-01
Phases run in the brief's order. The validation checkpoint stays after Phase 3.

### D-009 · Code hosting & git `[Raul]` — 2026-10-01
Private GitHub repo `Raulito01/eldr`, branch `main`. Claude commits and pushes each step and tags each phase. Raul runs `git pull` + `npm run dev` in VS Code.
- **Why:** cheapest in tokens, survives chat handovers, independent of Raul's Mac being online.
- **Alternative:** linked local folder via the Claude desktop app.

---

## Dependencies
| Package | Kind | Why | License |
|---|---|---|---|
| vite | dev | dev server + bundler (D-002) | MIT |
| vitest | dev | test runner (D-003) | MIT |
| @biomejs/biome | dev | lint + format (D-004) | MIT / Apache-2.0 |
