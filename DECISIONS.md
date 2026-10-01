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

### D-015 · Schema conventions — 2026-10-01
- `defineSchema()` throws on any invalid definition (listing all problems), so a broken schema fails at load time and in tests, never silently in the UI.
- Values are always cleaned by `sanitizeValue()` (clamp, snap to step without float noise, normalize colours to lowercase hex, sort ramp stops, pin curve ends to x = 0/1). It never throws; bad values fall back to the default and are reported as warnings.
- Randomize ranges are **absolute** values inside min/max (brief example: size 0.8–1.3). Supported for float, int, bool (`{chance}`), enum (`true` or `{options}`), seed. Colour/ramp/curve randomization is deferred.
- Variants use `subSeed(variantSeed, paramId)` per parameter (same principle as D-011): adding or locking one parameter never changes the others.
- Saved parameter objects list every parameter in schema order (stable files, clean diffs).

### D-016 · Inspector widgets in one module for now — 2026-10-01
All widgets live in `src/ui/widgets/widgets.js` (~190 lines). They'll be split per file when the ramp editor (2.1) and curve editor arrive. Ramp and curve are read-only previews until then.

### D-017 · happy-dom for UI tests — 2026-10-01
Simulated browser DOM for Vitest (opt-in per test file with `// @vitest-environment happy-dom`). Lets UI behaviour be tested automatically, including from Claude's workspace where a real browser can't be downloaded. Dev-only.
- **Alternative:** jsdom — heavier and slower; same purpose.

### D-018 · @napi-rs/canvas for pixel tests in Node — 2026-10-01
Real Canvas 2D (Skia, the same engine Chrome uses) in Node, installed from npm. Renderer, determinism and (later) golden-image tests run with `npm test` on any machine, including Claude's workspace, where a browser can't be downloaded. Dev-only; the app itself uses the browser's canvas.
- **Alternatives:** `canvas` (node-canvas, Cairo — different rasterizer from Chrome, needs native build tools); Playwright headless Chromium (blocked in Claude's workspace; may still be added on Raul's Mac in 1.4).
- Amends D-006: the pinned test environment for pixel tests is Node + @napi-rs/canvas.

### D-019 · Renderer architecture — 2026-10-01
- `renderFrame(effect, seed, frameIndex, settings)` clears and redraws everything; layers get `subSeed(seed, layer.id)`; time comes only from `frameTime(timing, frame)`.
- Each layer draws into its own transparent scratch surface (one reused surface), then is composited onto the output with its blend mode (normal = source-over, add = lighter, screen) and opacity. Every layer render is wrapped in save/restore, so no canvas state can leak between layers (tested).
- Layer code works in effect pixels with the origin at the pivot; `settings.scale` multiplies for 2× export / Pixel Mode hi-res.
- **Blend modes apply between layers inside the effect, never against the background.** The background (viewport swatch or solid export background) is placed behind the finished effect, because that's how a game engine shows the exported sprite. Found while reviewing the first render: with the background inside the blend, add/screen layers vanished on white.
- Layer types are a registry passed to `createRenderer`; debug types (`debugFill`, `debugCircle`) are for tests and test pages only.

### D-020 · Viewport behaviour — 2026-10-01
- The viewport only displays frames (`present(surface)`); it never renders effects. Drawing lives in `viewportPaint.js` (pure, pixel-tested in Node), DOM + input in `viewport.js`, geometry in `viewportMath.js`.
- Background fills the whole viewport and sits behind the effect (D-019). Checker cells stay a fixed screen size at every zoom.
- Zoom ≥ 100% shows exact pixels (no smoothing, frame snapped to device pixels); below 100% is smoothed.
- Input: trackpad pinch or ⌘/Ctrl + scroll = zoom around the cursor; plain scroll or drag = pan; double-click = fit. Chosen for a MacBook trackpad workflow. Provisional: a mouse user may prefer wheel = zoom. Revisit with the UI pass.

### D-021 · Holds, phases and playback — 2026-10-01
- Holds: frame k shows the drawing of `floor(k / hold) × hold`. Layers receive only that drawing's frame/time, so frames inside a hold are pixel-identical (tested). On a one-shot the last drawing is the start of the last hold group, so t = 1 is reached only on ones; accepted, that's what holds mean.
- If the frame count isn't divisible by the hold, the last group is shorter. Allowed; may warn later.
- Phases are two normalized markers on the timing: `impact` and `decay` (defaults 0.2 / 0.6, placeholders until effects set their own). Anticipation = [0, impact), action = [impact, decay), decay = [decay, 1].
- Preview playback derives the frame from elapsed time (exact speed even with dropped frames). The "loop preview" toggle only affects one-shot previews; loop effects always repeat. Keyboard: Space, ←/→, Home (full shortcut set in 8.3).

### D-022 · Curves: monotone cubic interpolation — 2026-10-01
Animation curves pass through their points and are smooth, but never overshoot between two points (Fritsch–Carlson). A flat hold stays flat and a fade never dips below 0 — what a motion designer expects from a graph editor. Bezier handles can come later if needed.
- **Alternatives:** linear (mechanical, visible corners), Catmull-Rom (overshoots).

### D-023 · Layers are element + shape (+ style) — 2026-10-01
`createElementLayerType({ schema, instances, drawInstance })`: the element decides which instances exist this frame and their transform/opacity; the shape draws one instance at the origin. `single` + `blob` is the first; `burst` + `puff/streak/…` reuse the same factory. Layer types live in `src/effects/layerTypes.js`; each piece exports its own `*_PARAMS` schema entries (ids namespaced `blob.*`, `single.*`, `fill.*`), composed per layer type. A flat `fill.color` stands in until the style system (Phase 2).

### D-024 · Blob geometry — 2026-10-01
64 outline points from a cached unit-circle table, radius pushed by seeded 3D simplex noise (third axis = wobble × t) plus optional cosine lobes, clamped to ≥ 10% of the radius; drawn as a smooth closed quadratic path through midpoints. Reference coordinates are pinned in tests (D-013).

### D-025 · Determinism check — 2026-10-01
`checkDeterminism()` renders all frames in order, then in a seeded-scrambled order with a fresh renderer, comparing FNV-1a pixel hashes. Runs over every effect in `test-pages/fixtures/test-effects.js` in `npm test` (Node) and on `determinism.html` (browser). A test proves it catches hidden state.

### D-026 · Colour ramps and element style — 2026-10-01
- Ramps mix in sRGB (like Photoshop/AE gradients) and support alpha, so a ramp can fade into transparent smoke.
- Instead of an abstract "heat", the style exposes **ramp position**: 0 = left end (hot/start), 1 = right end (cool/end). Two controls drive it: *Ramp over life* (curve: position vs. the element's age) and *Core → edge* (how much further along the ramp the edge is than the core). Covers "heat by lifetime and/or radius" (brief §3.3).
- Core → edge is drawn as a canvas radial gradient with a stop at every ramp stop inside the range, so it matches the ramp exactly. The edge colour is reached at the shape's nominal radius. Smooth for now; cel banding (2.2) turns it into hard bands.
- Style params (`style.*`) live in `src/render/style.js` and are shared by every shape; the blob's flat `fill.color` is gone.
- `h()` moved to `src/ui/dom.js` to avoid an import cycle between widgets and the ramp editor.

### D-008 · Plan order unchanged — 2026-10-01
Phases run in the brief's order. The validation checkpoint stays after Phase 3.

### D-009 · Code hosting & git `[Raul]` — 2026-10-01
Private GitHub repo `Raulito01/eldr`, branch `main`. Claude commits and pushes each step. Phase ends are recorded as commit hashes in PROGRESS.md (Claude's git connection can push branches but not tags; Raul can add tags locally if wanted). Raul runs `git pull` + `npm run dev` in VS Code.
- **Why:** cheapest in tokens, survives chat handovers, independent of Raul's Mac being online.
- **Alternative:** linked local folder via the Claude desktop app.

---

## Dependencies
| Package | Kind | Why | License |
|---|---|---|---|
| vite | dev | dev server + bundler (D-002) | MIT |
| vitest | dev | test runner (D-003) | MIT |
| @biomejs/biome | dev | lint + format (D-004) | MIT / Apache-2.0 |
| happy-dom | dev | simulated DOM for UI tests (D-017) | MIT |
| @napi-rs/canvas | dev | real Canvas 2D in Node for pixel tests (D-018) | MIT |
