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

### D-027 · UI rule: clear of the edges, easy to reach and see `[Raul]` — 2026-10-01
Every control stays inside its panel and clear of the window edges, and is easy to see and grab. Applies to all UI from now on:
- Panels and toolbars have ≥ 14 px inner side padding; scrolling panels reserve their scrollbar (`scrollbar-gutter: stable`).
- Grid/flex columns that hold controls use `minmax(0, 1fr)` / `min-width: 0`, so wide controls shrink or wrap instead of pushing past the edge. Control rows wrap when space runs out.
- Wide editors (ramp, curve) get a full-width row below their label.
- Handles and points are large, and clicking *near* one grabs it (nearest within ~10–14 px).
- Page layout never assumes a fixed header height (body is a flex column; content fills the rest).
- Regression tests guard the key rules (tests/unit/widgetLayout.test.js).

### D-028 · Pen tablet support (Wacom etc.) `[Raul]` — 2026-10-01
All custom interactions go through `src/ui/pointer.js` (pointer events: mouse, trackpad, touch and pen alike):
- A press becomes a drag only after moving past a threshold (mouse 2 px, pen 5 px, touch 8 px), so pen-tip jitter never nudges a point.
- Own double-tap detection (450 ms; mouse 6 px, pen 14 px, touch 20 px) replaces the browser's strict double-click.
- Only the primary button (pen tip / left button) presses or drags; the pen side button (sent as right-click) **removes** curve points and ramp stops, and never opens the browser menu on editors.
- Grabbed points/stops keep their offset from the pointer, so they don't jump to the pen tip.
- Pen hover highlights the point a press would grab.
Rule going forward: no new raw `dblclick`/mouse-only handlers in the UI; use `attachPointer`.
- **No native `<input type="range">`:** on macOS a Wacom pen can tap but not drag them. ELDR's own slider (`src/ui/widgets/slider.js`) is used everywhere: press anywhere and drag (pointer captured, keeps tracking outside the slider), Shift-drag = 10× finer, arrow keys step (Shift ×10), tall 24 px hit area.

### D-029 · Cel bands follow the silhouette — 2026-10-01
- `style.bands`: 0 = smooth gradient (2.1 behaviour), 1–6 = hard bands. Band i (outermost first) is the element outline scaled to 1 − i/N, painted flat in the ramp colour at a position between edge (outer band) and core (inner band). So bands keep travelling along the ramp over life.
- Bands are nested copies of the element's own outline, not circles, so inner shapes echo the drawn silhouette. Each inner band edge gets seeded radial noise (`style.bandNoise`, ≤ 45% of one band's thickness so bands never swallow each other), evolving with time so edges boil on holds.
- `style.snapColors`: each band takes the nearest exact ramp stop colour (strict toon palette; neighbouring bands may merge when they snap to the same stop). Helps Pixel Mode later.
- Shape-agnostic: any shape that provides an outline point array gets bands via `paintStyled()`.

### D-030 · Toon shading by offset fills — 2026-10-01 (clipping part superseded by D-032)
- Light direction is set in the world (0° = from above, clockwise) and converted into each element's local space, so rotating an element doesn't rotate its lighting.
- Shadow: clip to the silhouette, paint the element shifted further along its ramp (`shade.shadow` = ramp shift), then paint the lit OUTER shape translated toward the light by `shadowOffset × radius`. The uncovered crescent on the far side is the shadow. **Only the rim moves:** inner cel bands and the gradient centre stay in place (fix after Raul's review: shifting the whole lit stack slid the core off-centre and cut it at the silhouette edge).
- Highlight: a smaller copy of the outline (`highlightSize`), translated toward the light (`highlightOffset × radius`), flat-filled with the ramp colour at core − `highlight`. Clipped to the silhouette.
- Shadow and highlight colours come from the ramp (not separate colour pickers), so they stay in palette. A custom shadow tint can be added later if needed.

### D-031 · Outline by exact distance transform — 2026-10-01
- Per-layer post-process (new optional `LayerType.postProcess` hook, run on the layer's own surface before blending): threshold the alpha at half the layer's strongest alpha, run an exact Euclidean distance transform (Felzenszwalb–Huttenlocher, two separable passes) that also records the nearest filled pixel.
- Outer: transparent pixels within `px` get the outline (anti-aliased over 1 px by distance); existing edge pixels are drawn over it. Inner: filled pixels within `px` of the edge are recoloured. Both: both.
- Colour: "darken fill" = nearest filled pixel's colour × (1 − darken), so the outline follows bands and shading; or one custom colour.
- Strength = strongest alpha in the touched pixel's 3×3 neighbourhood, so anti-aliased edges don't make it see-through, while faded layers get equally faded outlines (no pop-off).
- Thickness is in effect pixels × render scale. Work is limited to the visible pixels' bounding box + outline width.
- **Alternative rejected:** stamping offset copies (approximate, gaps at large widths, no nearest-colour).

### D-032 · Nothing is masked by the silhouette `[Raul]` — 2026-10-01
Overrides the brief's "clipped to the element" (§3.3) and the clipping in D-030. No shading or style element is clipped to an element's silhouette:
- Shadow = a darker copy of the shape (ramp shifted by `shade.shadow`), drawn **behind** the element and offset **away** from the light by `shadowOffset × radius`. It shows as a dark rim on the shadow side, extending beyond the edge.
- The element itself is always drawn whole on top: core and bands are never moved or cut.
- Highlight = smaller, hotter copy drawn on top, offset toward the light, not clipped.
- Applies to future shapes and styles too: no silhouette masks unless Raul asks for one.

### D-033 · Explosion shapes — 2026-10-01
- **Multi-part shapes:** a styled instance can have `parts` (each `{x, y, outline, r}`) instead of one outline. Each cel band is painted for all parts as one path (union), and inner bands shrink the whole union toward the centre (part positions included), so a puff gets one nested core instead of a core per bump (first render looked like polka dots). Highlights are per part.
- **Puff:** golden-angle spiral of blob bumps around a biggest central bump; outer bumps smaller; bump edges use blob noise + wobble.
- **Streak:** polygon spindle along +x with a round head and a power-curve tail (`taper` moves the widest point forward and sharpens the tail). Elements will rotate it to their velocity in 3.2.
- **Ring:** own painter. Centreline radius pushed by seeded noise, thickness × "thickness over life" curve, broken arcs with pointed ends, closed ring as two opposite-winding contours (a hole, no seam). Cel bands run across the thickness (hot centreline). Shadow behind, offset away from the light (D-032). No highlight on rings.
- **Debris:** irregular polygon (seeded corner angles/radii), hard corners, spin over life; light stays world-fixed through the spin.
- Shared path helpers in `src/shapes/trace.js` (smooth vs hard-cornered).

### D-034 · Burst motion is closed-form, in effect-duration units — 2026-10-01
- Linear drag k with constant acceleration a (gravity down − buoyancy up): v(τ) = v0·e^(−kτ) + a(1−e^(−kτ))/k, x(τ) = v0(1−e^(−kτ))/k + a(τ − (1−e^(−kτ))/k)/k; ballistic formulas when k ≈ 0. Any frame is computed directly. No step simulation or cache needed (brief §2.2 satisfied without the cached-integration fallback).
- τ is normalized effect time since spawn; speeds are px per effect duration, accelerations px per effect². Changing fps or frame count retimes the effect without changing distances (animator-friendly).
- Every element draws all its random numbers in a fixed order from `subSeed(layerSeed, 'particle', i)`: raising the count never changes existing elements (tested).
- 0° = up, clockwise (same convention as the light). Align-to-velocity rotates +x (the streak head) along the current velocity; streaks shrink with speed via `streak.stretch`.
- Elements are pluggable per layer type (`single` | `burst`); layer types are element × shape with per-type default overrides (e.g. sparks align to motion).

### D-035 · Defaults: ones, 100% zoom, 512 frame; ramp presets `[Raul]` — 2026-10-01
- The preview starts on **ones** and the viewport at **100% zoom** (Fit stays available via the zoom menu / double-click). `createViewport` takes `zoom` (number or 'fit'), default 1.
- The playground renders a **512×512** frame by default (choice 256/384/512/768), so bursts aren't cut off at the edges. Final per-effect canvas sizes are set with the presets / export (auto-crop to union bounds comes in Phase 4).
- The ramp editor has a **preset menu** (Fire, Smoke, Sparks, Debris; placeholder colours) that replaces the whole ramp in one click — e.g. grey smoke on a puff burst.

### D-036 · Wider slider ranges `[Raul]` — 2026-10-01
All slider maxima doubled (negative minima too, e.g. Rotation ±720°, X/Y ±512 px), 39 parameters. Defaults and variant ranges unchanged. Not widened, because their range is already complete: effect-time positions (life start/end, spawn start/window, life: 1 = end of effect), percentages where 1 = 100% (all variances, irregularity, taper, stretch, darken, core→edge, shadow depth, highlight), full circles (direction, cone, random rotation, light). Rule for new parameters: generous ranges by default.

### D-037 · Explosion family structure — 2026-10-01
- An effect family = global schema + default layer stack + a pure `build(state) → { effect, scale }`. The editable state (`{ family, globals, timing, layers[{id,label,type,enabled,blend,params}] }`) is what will be saved in project files (8.2).
- Timing is anchored on the impact: anticipation = [0, impact]; flash = exactly `flashFrames` frames from the first frame at/after the impact; all other layers' start (and single elements' end) are delays after the impact. Moving the impact moves the whole explosion.
- Global size multiplies into the render scale, so it scales shapes, distances and outline widths together.
- Layer stack bottom → top: smoke, shockwave, fireball, debris, sparks, anticipation glow (add), impact flash. Smear (brief "optional") arrives with the smear shape in 7.1.
- Layer list (basic: visibility, blend, select) in `src/ui/layerList.js`; reorder/duplicate/rename in 8.4.

### D-038 · Explosion presets are deltas — 2026-10-01
- A preset (`src/effects/explosion/presets.js`) stores only what it CHANGES on top of the base stack: globals, timing, and per-layer params / blend / on-off. Loading = `createExplosionFromPreset(id)` (deep copy; the preset table is never mutated). Small, readable, and a base-stack fix reaches every preset.
- 4 presets: Cartoon Pop, Anime Blast, Small Hit, Big Boom. Names and values are a first pass to be directed by Raul `[Raul]`.
- All presets stay on ones (D-035); holds per preset (e.g. Cartoon Pop on twos) only if Raul wants it.

### D-039 · Style target: Raul's references, procedurally `[Raul]` — 2026-10-01
- Goal: get as close as possible to Raul's reference effects (Ivan Boyko–style hand-drawn 2D VFX: fire loop, dome explosion, energy orb, slash, lightning, potion magic) **with procedural elements only**.
- What defines that look (from frame-by-frame study): few big clean shapes with S-curves and hooked tips; pieces tearing off and curling away; inner swirl shapes instead of concentric bands; strong additive glow; erosion/dissolve into curls or shards; 4-point twinkle sparkles; inverted hit frames; mostly on ones at ~25–33 fps.
- Plan change: step 3.4 is split. Build the missing blocks first, easiest first — 3.4a glow + sparkles, 3.4b field layer (swirling banded noise-field fire), 3.4c dissolve, 3.4d hook/crescent shape + orbit motion — then 3.4e retune the presets toward the references. Then 3.5 export and the validation checkpoint.
- Speed: preview may get slower meanwhile; WebGL acceleration comes after the look is right (end of Phase 3 or 10.1).
- The reference GIFs are someone else's work: studied, not stored in the repo.

### D-040 · Glow — 2026-10-01
- Any layer can glow (`glow.*`, off by default). The renderer draws it right after the layer, with additive blending (light, not paint), scaled by the layer's opacity.
- Two blurs summed: wide (`glow.radius`) + tight core halo (¼ radius, `glow.core`). Tint colour's alpha = how much it replaces the layer's own colours.
- Blur = Canvas `ctx.filter` where supported; otherwise a downscale/upscale blur (e.g. older Safari). Deterministic within one runtime (D-016).

### D-041 · Field layers (per-pixel noise-field shapes) — 2026-10-01
- A second way to draw shapes, next to outlines: a FIELD evaluated per pixel. Body (flame teardrop or ball) + two-level domain-warped noise (curls, S-curves, hooks) − erosion noise (pieces tearing off) + swirl noise (inner shapes) → heat → hard colour bands from the layer's ramp. Outline and glow reuse the existing post-passes.
- Speed: the field is evaluated on a 2-px grid and interpolated; thresholds are applied per pixel, so silhouette and band edges stay sharp and 1-px anti-aliased. Only the field's bounding box is touched. ~60 ms/frame for one field at 512² in Node: fine for now, WebGL later (D-039).
- Anti-aliasing only in grid cells that actually contain an edge (the field can drop off steeply; gradient-only AA painted phantom lines — regression test in field.test.js).
- Time: noise scrolls upward with effect time × Rise speed. Seamless loops (4D noise on a circle) come with the Fire & Smoke loops in Phase 6.

### D-042 · Field time in seconds; flow-shape controls; longer timelines `[Raul]` — 2026-10-01
- Bug [Raul]: a 200-frame preview "played super slow". Two causes: the frame count was silently capped at 128, and field fire flowed per EFFECT (rise speed spread over the whole effect, so more frames = slow motion). Fixed: cap raised to 600 frames (25 s at 24 fps); field flow is now per SECOND, so a longer timeline only shows more of the same fire. Regression tests in timeline.test.js and field.test.js.
- Burst/single motion stays in effect-duration units (D-037): for one-shots, frame count IS the effect's duration.
- Art direction [Raul]: new "Flow shape" controls on field fire, applied before the noise: S-bend (amount, waves, travel), Lean, Curl (vortex: strength ±, position, size). Combined, they give the hooked S-flame of the references.

### D-043 · Dissolve — 2026-10-01
- Any layer can break apart over EFFECT time (`dissolve.*`, off by default): Curls (warped noise ridges → thin swirling filaments, the dome burn-down), Shards (Voronoi cells shrinking from their edges + per-cell chance → angular pieces, the slash breakup), Holes (soft blotches).
- Runs as a layer post-process on the finished pixels, BEFORE the outline (the outline traces the pieces). Each pixel's survival value v stays while v > amount(t); edges are 1-px anti-aliased from v's gradient; the burn edge is a band of fixed pixel width along every dissolving edge, coloured, never changing coverage.
- Layer-level, not per instance: a burst dissolves as a whole. Per-instance dissolve can come later if needed.
- Post-processes now receive t, seconds, the layer's sub-seed and the pivot.

### D-044 · Crescent shape + orbit element — 2026-10-01
- **Crescent = a strip:** a centreline arc (curling toward the arc centre near the head when hooked) with a half-width profile that is zero at both tips. Head / tail balance moves the widest point; tip sharpness is the profile's exponent. Cel bands run across the thickness like the ring's (D-033); "Hot edge" slides the inner bands toward the outer or inner edge (the energy-orb swooshes have a hot leading edge). Shadow behind, no clipping (D-032); no highlight (as rings).
- **Anchors:** a single crescent is centred on its arc's circle (a slash curving around the pivot); bursts and orbit "stickers" put the arc's midpoint on the element with the head along +x, so align-to-motion flies it head-first.
- **Reveal over life** draws the swoosh on from the tail; the shape is fitted to the revealed part (tips stay sharp), and it is thinner until half of it is revealed, so a just-starting slash isn't a fat petal.
- **Orbit motion is closed-form**: angle = start + spin × seconds. Spin is per SECOND, like field flow (D-042). 0° = up, clockwise (D-034). Per-element sub-seeds (`subSeed(seed, 'orbit', i)`), fixed draw order.
- **Perspective:** in-plane circle → y squashed by cos(tilt) → rotated by the plane angle. The bottom of the ellipse is the near side; depth = −cos(angle)·sin(tilt). Depth scales size, fades opacity and shifts the ramp (darker far side, via `shiftStyle`). Instances are drawn far → near.
- **Front / behind `[Raul approved the plan]`:** a layer can't be both below and above another layer, so an orbit layer shows All / Back half / Front half; "orbit (back) → core → orbit (front)" with the same seed wraps it around the core. Halves are complementary (back = depth < 0, front = depth ≥ 0). Follow-path crescents span both halves, so they are cut exactly at the depth crossing (bisection) instead of being filtered as a whole. No renderer change needed.
- **Follow path:** crescent orbits can bend each swoosh along the tilted orbit (radius = orbit radius, width scaled per point by depth); otherwise they ride the orbit as stickers aligned to the path.
- Speed: ~2 ms/frame at 512² for 3 orbit crescents without glow; glow adds ~8 ms (as on other layers).

### D-045 · Explosion retune toward the references — 2026-10-01
- The explosion stack gains 3 OPTIONAL layers, off in the base and switched on by presets (`LayerSpec.enabled = false`): Fire core (field-fire ball, above the fireball), Curl wisps (hooked crescent burst), Twinkles (sparkle burst, below the anticipation/flash). All are anchored to the impact like every other after-impact layer (D-037). Stack bottom → top: smoke, shockwave, fireball, core, wisps, debris, sparks, twinkles, anticipation, flash.
- Presets (still deltas, D-038) now run at 30 fps on ones (references: ~25–33 fps, mostly ones), and hot layers glow (glow per preset; the base-stack glow pick stays open).
- Burn-away instead of fade: fireball/smoke opacity holds at 1 and a dissolve removes them (`burnAway(from, to)` in presets.js: curve in EFFECT time, always ending at x = 1 because the schema requires curves to span 0–1).
- All values are a FIRST PASS for Raul to direct `[Raul]`.
- Second pass (v0.0.22), Raul: "closer to the reference". Dome direction for Anime Blast / Big Boom / Small Hit: yellow-orange-red blob ramp (violet ramps dropped), white specular dots (highlight = full hot shift, small), dissolve burn edge in white so the burn-down reads as white curls, sparks after the burn-down, round flash with glow. Blue rim = custom outline on the core (Anime Blast, Small Hit); left off Big Boom, where its dissolve pieces turned the rim into blue squiggles. Cartoon Pop stays the simple ink option.
- Third pass (v0.0.23), from Raul's re-attached reference GIFs studied frame by frame (notes in the project doc `claude/eldr-style-references.md`): Anime Blast = white field ball (blue-tinted glow = the halo) + 6 big puff blobs flung up/out + curl dissolve with a wide gold burn edge (the lattice) + gold hook wisps + embers + long thin twinkles; ring, smoke and debris off. The Fire core layer moved below the fireball in the base stack (the mass is behind the blobs). Gaps not buildable yet: blobs tied to one rising mass, drawn S-curve filaments, multi-dot speculars.
- Approved `[Raul]`: "not far from the references, good enough for now". Direction: ELDR's job is to give Raul procedural controls he can push with his own VFX expertise, not to match references exactly by itself. So saving his tuning (presets/projects) matters more than further auto-tuning.
- **Speed (known issue):** with field core + glow + dissolve, Anime Blast and Big Boom render at ~110–130 ms/frame at 512² (Node and Chromium), ~8 fps preview. Below the 30 fps budget (brief §8.4). Accepted for now per D-039: WebGL acceleration after the look is approved; a lower preview resolution during playback is the cheap stopgap if needed sooner.

### D-046 · Export: GIF + sprite sheet — 2026-10-01
- One render pass feeds every output (`src/export/run.js`): drawings rendered once each on a TRANSPARENT background (holds share a drawing), then trimmed and/or composited onto a background colour. Export pixels = preview pixels (tested).
- **Trim** = union of all non-transparent pixels over all frames + 2 px, so it never cuts a visible pixel (tested). Faint glow counts as visible, so glowing effects trim little.
- **Sprite sheet:** grid of unique drawings + JSON in the common "JSON Hash" layout (frames{name: frame, rotated, trimmed, spriteSourceSize, sourceSize, duration} + meta). Every playback frame has an entry; held frames point at the same cell.
- **GIF:** `gifenc` (MIT, ~10 kB, no dependencies) — the only new runtime dependency. Holds merged into one GIF frame; delays in whole centiseconds computed as round(end) − round(start), so total length never drifts. GIF has 1-bit alpha: on a transparent background soft glow gets hard edges; the panel warns and suggests a background colour (the PNG sheet keeps full alpha).
- Export runs in the page with progress and yields between frames; playback stops while exporting.

### D-047 · Save / load + My presets, pulled forward from 8.2 `[Raul]` — 2026-10-01
- Why now: Raul tunes the presets with his own expertise (after 3.4e) and was losing his changes on reload.
- File `.eldr.json` = { format 'eldr-vfx', version 1, app, appVersion, family 'explosion', name, seed, globals, timing, layers[{id, label, type, enabled, blend, params}] }. Params saved in schema order.
- Loading starts from the current base stack, matches layers by id, and validates every value: missing values take the base stack's value, out-of-range values are fixed, unknown layers and type mismatches are skipped; all reported as warnings. Wrong format / family → readable error, nothing changes.
- **My presets** = saved-effect objects in browser storage (`localStorage`, one key). Guarded: if storage is blocked or full, the editor still works and says to use "Save file…". Browser storage is per browser and can be cleared, so files are the safe copy.
- Layer add / remove / reorder stays in 8.4 unless Raul asks for it sooner.

### D-048 · Towards a general composition editor; step 3.6 split `[Raul]` — 2026-10-01
- Raul: "I can't make them better without control over layer order and adding/removing layers — like After Effects without the right tools." He asked for solo, opacity, more blend modes, parenting, keyframes in the timeline, track mattes, masks and precomps.
- Decision (approved): the explosion editor becomes a general ELDR composition editor step by step; effect families (explosion, later slash, magic…) become templates; procedural controls stay. Pulled forward from Phase 8 as step 3.6:
  3.6a layer panel (add / remove / duplicate / reorder / rename, solo, opacity, all blend modes, undo/redo) → 3.6b transform + parenting (+ impact as a comp marker, size as a null/parent scale) → 3.6c keyframes + layer in/out bars → 3.6d track mattes + masks (pen-drawn paths) → 3.6e precomps.
- The validation checkpoint moves after 3.6. WebGL speed-up becomes more important (mattes and precomps add passes).

### D-049 · Layer panel, layer fields, undo, file v2 (3.6a) — 2026-10-01
- **Editor layer** = { id, label, type, enabled, solo, opacity, blend, anchor, seedKey, params }. `makeLayer()` fills defaults.
- **Anchor** ("Timed from") is now per layer instead of looked up by id: afterImpact (life windows and burst start count from the impact), anticipation ([0, impact]), flash (exact flash frames), free (raw effect time). Works for single, burst and orbit life keys.
- **seedKey**: the renderer derives a layer's sub-seed from `seedKey ?? id`. Duplicates keep the seedKey (identical copy, e.g. orbit back/front pair); Reseed appends #n.
- **Solo**: if any visible layer is soloed, only soloed visible layers render (as in After Effects).
- **Blend modes**: the full Canvas 2D set (17), labelled like After Effects. Over a transparent backdrop all modes act like normal.
- Layer ops are pure functions (`src/effects/layerStack.js`) returning new states; **undo/redo** keeps whole states (`src/ui/history.js`), edits with the same key within 800 ms merge into one step (slider drags). Loading a preset or file clears the history.
- **File format v2**: the whole layer list is saved (bottom → top) with the new fields. v1 files (0.0.24) load: anchors come from the base stack by id. Unknown layer types are skipped, unknown blend modes become normal, duplicate ids are made unique; all reported.
- Pen (D-028): every action has a button; drag uses pointer capture; toolbar targets 32 px.

### D-050 · Animation length in seconds, independent of frames and fps `[Raul]` — 2026-10-01
- Bug [Raul]: "if I make the timeline 200 frames everything slows down — it's not supposed to work like that for animation." Cause: one-shot effect time was t = frame / (frameCount − 1), so every layer's life, speed and the impact were stretched over the frames. D-042 had fixed only field fire.
- Fix: `timing.duration` = animation length in seconds; one-shots use t = seconds / duration (t > 1 = animation over). frameCount and fps only change how much time is shown and how finely it is sampled — like an After Effects comp. Loops are unchanged (a loop's cycle is the comp).
- Every editor timing has a duration: base explosion 23/24 s, presets their authored frames / fps, playground 23/24 s, files saved before this get (frameCount − 1) / fps so they keep their look. Without duration (legacy) the old stretch behaviour remains.
- Flash frames and phase markers use the frame step from the duration (`tPerFrame`, `frameAtTime`). Timeline shows an "anim … s" field to change the speed on purpose.
- Regression tests (animationLength.test.js) fail without the fix (verified).

### D-051 · Export: PNG sequence, MP4, matte, sizes up to 2K `[Raul]` — 2026-10-01
- Raul: drop ProRes; add MP4 and, if possible, a matte render; more resolutions up to 2K.
- **PNG sequence**: every playback frame as `name_####.png` (≥ 4 digits), held frames reuse the encoded drawing, packed in one `name_png.zip` (stored, no recompression) with **fflate** (MIT, ~8 kB gz, no dependencies) because browsers ask permission per downloaded file.
- **MP4**: WebCodecs via **mediabunny** (MPL-2.0, used unmodified, maintained successor of mp4-muxer, which is deprecated). Lazy-loaded only when exporting MP4 (~47 kB gz). Codec: first encodable of H.264 (avc) → HEVC → VP9 → AV1; non-H.264 shows a warning (QuickTime / After Effects may not open it). Open-source Chromium (our test browser) has no H.264, so the H.264 path is verified on Raul's Mac; the VP9 path is verified here with ffprobe. Every playback frame is written; sizes padded to even (H.264).
- **Matte**: alpha → opaque grey (white = visible), for MP4 (`name_matte.mp4`) and the PNG sequence (`name_matte_####.png`). MP4 colour is composited on the chosen background, black when "transparent".
- **Frame sizes**: 256–2048 square, 1280×720, 1920×1080, 2048×1080, Custom (16–4096 per side); export scale 0.5 / 1 / 2 / 4. Large sizes warn about render time (~1 s/frame with field fire at 2K until WebGL).

### D-052 · Video formats keep the full frame `[Raul]` — 2026-10-01
- Bug [Raul]: with the frame set to Full HD, the export came out square, not 16:9. Cause: "Trim empty space" (on by default) cropped every format to the effect's bounds.
- Fix: trimming applies only to sprite formats (GIF, sprite sheet), where tight cells save memory. PNG sequence and MP4 always use the full frame (with export scale), like an After Effects render. Regression test (export.test.js) fails without the fix (verified).

### D-053 · Layer transform, parenting, Null, viewport handles (3.6b) — 2026-10-01
- **Transform** per layer (After Effects order): local = T(position) · R(rotation) · S(scale %) · T(−anchor); world = parentWorld · local (`src/core/transform2d.js`, matrices in Canvas order [a b c d e f], effect px, clockwise degrees). `buildExplosion` passes the world matrix as `layer.matrix`; the renderer applies it after pivot × render scale, before the layer draws. Post-passes (dissolve, outline, glow) still work on the finished pixels: outlines and glow keep their pixel widths; dissolve noise is in screen space (the pattern doesn't travel with a moved layer — fine for now).
- It sits ON TOP of each layer type's own placement params (single.x/y/rotation/scale, orbit centre), which are renamed "Element placement" / "Orbit centre" in the inspector.
- **Parenting**: `setParent` keeps the layer in place (new local = inverse(parentWorld) · world, decomposed with the anchor kept; skew from non-uniform parent scale + rotation is dropped, as in After Effects). Loops are refused (`wouldCycle`) and never offered in the Parent menu; a cyclic or missing parent in a file is unparented with a warning; the renderer ignores broken chains. Deleting a parent hands its children to the grand-parent, in place. Duplicates keep the parent. Parent opacity does NOT propagate (After Effects behaviour).
- **Null** layer type: empty schema, renders nothing.
- **Handles** (`src/ui/editor/gizmo.js`): screen-size box around the anchor (scaled with the layer, clamped), round rotate handle above it, corner scale handles, anchor crosshair. Hit radius 13 px (pen, D-028). All drag maths in effect px: move keeps the anchor under the pointer (through the parent), rotate = angle around the anchor (Shift 15°), scale along the layer's own axes (uniform if linked or Shift), ⌥ anchor = x' = x + R·S·(a' − a) so content doesn't move. Each drag = one undo step.
- The viewport got a generic overlay + interaction hook (tried before panning) and a "Handles" toggle.
- **File format 3**: + transform, parent. v1/v2 open with identity transforms.
- Editor code moved from test-pages into `src/ui/editor/` (explosionEditor.js, gizmo.js, transformPanel.js); the page is a thin entry.

### D-054 · Keyframes + layer timeline (3.6c) `[Raul: every slider keyframable]` — 2026-10-01
- **Model**: `layer.keys = { paramId: [{ t, v, ease }] }`, t in LAYER seconds; `layer.time = { offset, stretch, in, out }` (comp seconds; out null = until the end). Layer time = (comp − offset) / stretch, so sliding / stretching a layer carries its keys (After Effects). Animatable ids: every layer-type param, `transform.*`, `layer.opacity` (percent). Seeds aren't offered.
- **Interpolation** (`src/core/keyframes.js`): segment uses its LEFT key's ease — linear, ease (cubic-bezier 0.33 0 0.67 1 ≈ Easy Ease), hold. float/int/colour blend; ramp/curve blend when point counts match, else switch at the next key; bool/enum hold. Clamped before the first / after the last key.
- **Editing rules** (`src/effects/animEdit.js`): stopwatch on → one key at now with the current value; edit with keys → set key at now; stopwatch off → drop keys, keep the value at now; ◆ toggles a key at now; removing the last key turns the stopwatch off. Keys are placed on FRAMES (frame / fps), not on held drawings.
- **Rendering**: `buildExplosion` returns `effect.at(time)` only when something is animated (no cost otherwise); the renderer resolves the effect per frame (pure, random-access, determinism test passes with animation). Per-layer time: hidden outside [in, out); the layer's procedural time t is computed from its own seconds (`tAtSeconds`).
- **Layer timeline** (`src/ui/editor/layerTimeline.js`): canvas rows + DOM names; bar drag modes slide / trim in / trim out / ⌥ stretch (around the layer start), snapped to frames; keys drag with frame snapping; key bar with Linear / Ease / Hold / Delete; ruler scrub; draggable impact marker (impact = normalized × animation length). Each drag is one undo step.
- Globals (Size, Impact, Flash frames, Anticipation) are not keyframable: Impact / Flash define the timing structure; animate overall size with a Null's scale.
- **File format 4**: + keys, time; validated (unknown params skipped, values sanitized, bad stretch reset).

### D-055 · Roadmap additions `[Raul]` — 2026-10-02
- Raul (before 3.6d): add keyframe navigation (buttons + shortcuts like After Effects), more colour ramp presets (water, ice, magic…), centre-layer button + shortcut, own canvas resolution input, and more animation presets / families: lightning, magic, water, particles. "Add this to the list and we make them in steps."
- Proposed order in PROGRESS.md: 3.7 editor quick wins → 3.8 ramp library → 3.6d mattes + masks → 3.6e precomps → families Particles → Lightning → Magic → Water. Lightning and Water move up from the brief's "later families". Order waits for Raul's 🚦.

### D-056 · Editor quick wins (3.7) — 2026-10-02
- **J / K + ◀◆ ◆▶**: previous / next frame that has a key on ANY layer (like After Effects with every layer visible), keys converted to comp frames through each layer's time. Ignored while typing.
- **Centre layer**: anchor → frame centre through the parent's inverse (`centreLayer`). **Centre anchor**: anchor → the layer's own origin (where procedural content is centred), keeping the layer in place (`centreAnchor`, x' = x + R·S·(0 − a)). Both go through `applyValues`, so animated Position / Anchor get keys.
- **Shortcuts**: ⇧C / ⇧⌥C, plus ⌘/Ctrl + Home and ⌘⌥/Ctrl+Alt + Home (After Effects). The proposed ⌘⇧H / ⌘⌥H were dropped: ⌘⌥H is macOS "Hide others" and ⌘⇧H is the browser's Home page. Mac laptops type Home as fn + ←.
- **W × H fields** next to the Frame menu (16–4096); the frame size is saved in files / My presets as `canvas` (optional field, file format 4 unchanged).

### D-057 · After Effects animation toolkit, before 3.8 `[Raul]` — 2026-10-02
- Raul: "I'm missing a lot of features when animating": select several layers and change keys / timing on all of them, select several keyframes and move them, navigation shortcuts, change keyframe interpolation curves like After Effects, edit several layers at once — "basically the same features After Effects has for animating keyframes; we are already close".
- Inserted as 3.7b (multi-select + multi-edit), 3.7c (graph editor + AE interpolation), 3.7d (AE shortcuts + timeline zoom) before 3.8. Plan approved 2026-10-02.

### D-058 · Multi-select + multi-edit (3.7b) — 2026-10-02
- **Layer selection = { active, ids }.** Click = only this layer; ⌘/Ctrl-click = add / remove; ⇧-click = range from the active layer, in display order (top first). Same in the layer panel and the timeline names / bars. The ACTIVE layer drives the inspector, handles and stopwatch state (as in After Effects); `src/ui/editor/selection.js`.
- **Inspector edits go to every selected layer that has the parameter** (`applyValuesMany`); keys where that layer's param is animated. Transform edits send only the touched field (uniform scale: X and Y), so each layer keeps its other values. Stopwatch / ◆ follow the active layer (on → on for all, key here → remove on all). Values that differ show "—" after the label; the control shows the active layer's value.
- **Layer ops on the selection:** eye, solo, ▲▼ (moves the block, stops at the ends), ⧉ / ⌘D (copies become the selection), 🗑 / ⌫ (when no keys are selected), Parent menu, blend / Timed from. Rename stays single.
- **Keys** (`src/effects/keyEdit.js`, pure): refs are { layerId, paramId, t (layer s) }. Move / scale work in COMP time, snap to frames, and convert back into each layer's own time (slid / stretched layers move correctly). Selected keys are lifted first, so they can pass each other; a key landing on an unselected key replaces it. Drags re-apply to the state at drag start (no drift, one undo step). ⌥-drag on the first / last selected key scales the group's timing around the other end.
- **Copy / paste (⌘C / ⌘V):** keys from one layer paste onto every selected layer that has the param; keys from several layers go back to those same layers. Pasted at the playhead, then selected.
- Deleting a param's last key keeps its value as the fixed value (stopwatch off).
- Shortcuts this step: ⌘A all layers, ⌘⌥A all keys of the selected layers, ⌘D, ⌫, Esc (clear key selection). The full AE set comes in 3.7d.

### D-059 · After Effects interpolation + Graph Editor (3.7c) — 2026-10-02
- **Model = After Effects temporal interpolation.** Each key has an OUT side (`ease`: linear / bezier / hold, plus the older 'ease') and an IN side (`in`: linear or bezier). A bezier side is { speed, influence }: speed in value units per second of LAYER time, influence 0.1–100 % of the segment (AE's Keyframe Velocity). A segment is a cubic bezier in (time, value), solved for time (Newton + bisection). Speeds may overshoot; float / int results are clamped to the param's hard min / max, transforms are unbounded.
- **Older keys keep their exact curve:** 'ease' = cubic-bezier(0.33, 0, 0.67, 1) on both ends (influence 33 %, speed 0); a key without `in` follows its left neighbour's ease. Before any interpolation edit the param's keys are *materialized* (explicit handles, same curve), so editing one key never reshapes a neighbouring segment.
- **Colours, ramps, curves** follow the same curve as 0–1 progress (clamped, no overshoot); bool / enum / seed hold. The Graph Editor and speeds in the Velocity dialog are for numeric params; F9 & co. work on every type.
- **Commands (buttons + shortcuts):** Easy Ease F9, Ease In ⇧F9, Ease Out ⌘⇧F9, Linear, Toggle Hold ⌘⌥H, Keyframe Velocity… ⌘⇧K (values from the first selected key, applied to all; "Continuous" links the speeds), Graph Editor ⇧F3 / 📈.
- **Graph Editor** = value graph in the layer timeline's track (same time axis): one coloured curve per animated numeric param of the selected layers (click a name to hide it), keys as squares, handles on selected keys. Drag a key = time (snapped) + value (⇧ = one axis); drag a handle = influence + speed; a continuous key (both sides bezier, same speed — e.g. after F9) moves both handles, ⌥ breaks them; drag empty space = box select. The value scale freezes during a drag. Speed graph: not now (value graph covers shaping; can add later).
- **Key icons** like AE: each half shows its side — diamond = linear, round = bezier, square = hold.
- Files: `in` / `out` saved on keys (optional fields, file format stays 4; bad handles are dropped on load). Copy / paste carries the handles.

### D-060 · After Effects shortcuts + timeline zoom (3.7d) — 2026-10-02
- **One shortcut list** (`src/ui/editor/editorShortcuts.js`, engine `src/ui/shortcuts.js`) drives the keys AND the ⌨ Shortcuts sheet (? key / top-bar button), where every row is a button that does the action — so a pen can reach everything (D-028). The editor's old scattered key handlers, the playback bar's own keys and the layer timeline's ⌫ / Esc now all go through it (one place, no double handling). Keys do nothing while typing in a field or while a dialog is open.
- Combos: physical keys by `KeyboardEvent.code` (letters, F-keys, brackets, arrows…), symbols (? = + - ;) by the typed character, ignoring ⇧ — so they work on a Danish keyboard too; [ / ] are the physical Å / ¨ keys there (noted in the sheet).
- **Set** (AE names): Space; ← → / PgUp PgDn / ⌘← ⌘→ frame step, ⇧ = 10 frames (no wrap); Home / End; J / K; I / O (layer in / out frame); [ / ] slide the layer so its in / out point is at the playhead, ⌥[ / ⌥] trim (the out point keeps the current frame visible); U animated lanes on / off; P S R T A reveal Position / Scale / Rotation / Opacity / Anchor lanes (even without keys), ⇧ adds; ⌘A, ⌘⌥A, ⌘D, ⌫, Esc, ⌘C / ⌘V, F9 family, ⌘⌥H, ⌘⇧K, ⇧F3; = / + and − zoom, ; zoom to frames ↔ whole comp; ⌘Z / ⇧⌘Z / ⌘Y; ⇧C / ⌘Home centre.
- **Pan Behind (Y)** [Raul, 0.0.35]: a viewport toolbar toggle; while on, a drag inside the handle box (not only the centre) moves the anchor point, the layer stays put — = ⌥-drag without a key.
- **Timeline zoom:** view = { start, span } of comp seconds; − / slider / + / Fit and a scroll slider in the timeline bar, ⌘ / Ctrl + scroll zooms around the pointer, sideways / ⇧ scroll pans. Max zoom ≈ 6 frames across. The view follows the playhead when it leaves. Bars, lanes, ruler and the Graph Editor share the mapping; a 10 px inset at both ends keeps keys on the first / last frame whole. Ruler scrubbing now snaps to the nearest frame.

### D-061 · Colour ramp library (3.8) — 2026-10-02
- **54 ramps in 15 families**: Fire (6), Smoke & dust (6), Sparks & debris (4), Water (4), Ice (3), Lightning (3), Magic · arcane / holy / shadow / nature (3 each), Poison (3), Lava (2), Plasma (3), Blood (3), Gold & treasure (5). `src/render/rampPresets.js`, each { label, group, stops }; old ids (fire, smoke, sparks, debris) unchanged, so presets / files keep working.
- **Look rule** (stylized cel VFX): near-white core on the left, saturated body, a dark but still COLOURED end on the right (not grey), so cel bands separate cleanly on light and dark backgrounds. Colours are a starting point for Raul to tune [Raul].
- **Ramp editor menu** groups presets by family and adds **↔ Reverse this ramp**.
- **🎨 Ramps contact sheet** (layer header): every ramp previewed ON the active layer — three moments of its life (found by scanning where the layer actually draws), cropped to its shape, gradient underneath. Click applies to every selected layer with a ramp (one undo step each; a key if the ramp is animated); the sheet stays open to compare. Static snapshot: `docs/images/ramp-library-3.8.png` (Big Boom fireball).

### D-062 · Field fire: adaptive supersampling under strong swirl `[Raul]` — 2026-10-02
- Raul: strong Swirl / Curl made the layer look pixelated (dotted thin rings, ladder stripes across bands). Cause: the field is sampled on a 2-px grid and interpolated; a strongly twisted field changes faster than that, so thin features alias.
- Fix: one extra sample at each cell centre (cells far outside are skipped); where it disagrees with the interpolation, or the ramp crosses bands inside the cell, those pixels are evaluated from the field itself — 4 rotated-grid samples, 9 when they disagree — and averaged (coverage + colour). Error vs a 4× reference on a strong-curl test: 4.5 → 1.8 (test `fieldAliasing`). Cost lands only where detail is: presets +~4 %, an extreme-curl frame ~2.5×.
- Zooming the viewport past 100 % still shows exact pixels on purpose (what the export contains).

### D-063 · Adjustment layers: Gradient Map (3.8b) `[Raul]` — 2026-10-02
- Raul: "add adjustment layers so I can add colour ramps to all the layers, like a gradient map in Photoshop". New layer type **Gradient Map** (＋ Add layer). Renderer: a layer type may have `adjust(ctx, params, info)` instead of drawing — it changes the composite of everything BELOW it, in place, and must keep alpha. Layers above are untouched, so stack order chooses what is recoloured (like an After Effects adjustment layer).
- Params (`gmap.*`, all keyframable): Ramp, Mix %, Black / White point (input levels), Bands (posterize into cel steps, 0 = smooth), Dark → left. Default direction: BRIGHT → the ramp's LEFT end, because ELDR ramps are hot / bright on the left — every library ramp works as-is; "Dark → left" = Photoshop's way. Luminance Rec. 709 through a 1024-step LUT.
- Opacity × Mix fade it; the layer's blend mode is applied per pixel with W3C formulas (`src/render/blendMath.js`, all 17 modes, checked against Canvas) so alpha never changes.
- No transform / handles (inspector shows a note instead of Transform; Centre hidden). The 🎨 Ramps sheet works on it too, previewing on the whole comp; picking a ramp with mixed selected layers sets each one's own ramp.
- Cost: one pass over the frame, ~8 ms at 512², ~55 ms at 1080p fully covered (WebGL later). More adjustments (Hue / Saturation, Levels, Tint, Glow) can follow the same hook; with 3.6d mattes they can be limited to an area.

### D-064 · Track mattes + masks (3.6d) — 2026-10-02
- **Track matte** per layer (Layer section): any other drawing layer as source, mode Alpha / Alpha inverted / Luma / Luma inverted (AE names). The source renders for the matte even when hidden (its masks, effects and glow included, × its opacity); picking a source hides it, as in After Effects. The layer AND its glow are cut by the matte, then composited with its blend / opacity. Deleting the source clears the matte; files pointing at a missing source are fixed with a warning. No matte chains (a matte's own matte is ignored).
- **Masks** per layer (Masks panel under Transform): Ellipse / Rectangle, Add / Subtract / Intersect (top to bottom; a first Subtract starts from "all visible"), Inverted, on / off, and keyframable Position, Size, Rotation, Feather, Expansion, Opacity (`mask.<id>.<field>` — keys, Graph Editor, copy / paste work as for any param; M / ⇧M reveal their lanes). Masks live in layer space (they move with the layer) and cut the layer BEFORE dissolve / outline / glow, as AE masks come before effects. Feather = blur of the mask (glow's blur, so the Safari fallback works).
- **Viewport:** the active layer's masks are outlined (dashed); "✥ Edit" targets one — drag inside to move, a corner to resize with the opposite corner fixed (⇧ keeps proportions). While a mask is targeted the layer handles step aside; clicking elsewhere returns to them.
- **Adjustment layers** honour masks and mattes: the adjusted copy is mixed in only where they show.
- Layer panel tags: ◐ matte / ◐ luma, ⬓ matte src, ▭ masks. Files: `masks` and `matte` are optional layer fields (format 4).
- **Pen tool** [Raul, 0.0.40] (✒ Pen in the viewport toolbar, or G): click = corner point, click-drag = smooth point with mirrored handles, click the first point / Enter = close → a `path` mask on the selected layer (then the pen turns off and the new mask is targeted). ⌫ removes the last point, Esc cancels. Path vertices + handles are stored in units of the mask box (−0.5…0.5), so Position / Size / Rotation / corner-resize keep working on drawn masks. Editing (✥ Edit): drag a vertex, drag a handle (mirrored; ⌥ breaks), double-click a vertex = corner ↔ smooth. **Mask Path** is keyframable (◷ Path / ◆ on the mask card); paths blend when the vertex counts match, otherwise they switch at the key (AE needs the same vertex count too). Expansion on a path = stroke grow / erase shrink. Not yet: adding points into an existing path, open paths.
- The notice bar now floats over the editor (it used to push the viewport down, which moved the canvas under the pen).

### D-065 · Precomps (3.6e) — 2026-10-02
- **Model:** the document keeps precomps in `comps` { id, name, layers }; a layer of type `precomp` shows one by `comp` id. Its layers' time is the precomp layer's own time, so sliding / trimming / stretching the precomp layer retimes the whole group; its transform, opacity, blend, masks and track matte apply to the group as one layer. Several precomp layers may show the same precomp (⌘D on a precomp layer = another instance; edits inside change all of them).
- **Render:** the renderer composites a precomp's layers recursively into the precomp layer's surface (`children`, or `childrenAt(seconds)` when they are animated), with the precomp's transform multiplied onto theirs — vector-sharp, no resampling ("collapsed transformations"). Scratch / mask surfaces are kept per nesting depth; nesting stops at 8 and on loops (a precomp that would contain itself renders empty; files with loops / missing precomps are fixed with a warning).
- **Editor:** ▣ in the layer panel or ⌘⇧C = Precompose the selected layers (name prompt); the precomp layer replaces them where the topmost was; parents / mattes that would cross the boundary are released (layers keep their place). ⤵ on a precomp row or Tab opens it; the breadcrumb in the viewport toolbar (◉ Main › ▣ Name) or ⇧Tab goes back. While a precomp is open, every panel, the timeline and the viewer work on its layers; edits are written back into the document (one undo history). Export always renders the main comp. Precomps share the main comp's fps / frame count.
- Messages now float at the bottom of the screen and fade out after 8 s.

### D-118 · Your own families and .eldrpack packs `[Raul]` — 2026-10-03
- Raul: a way to make his own family packs under My presets.
- A **family** is a group of My presets (the "Family/Name" keys of D-098), in the browser or the presets folder alike.
- **Save as my preset…** is now a dialog: Family (pick one or type a new one) + Name (replaces the old prompt; confirms before replacing).
- **Families…** (top bar) opens the manager: each family with its presets — open one, **Move to…** another family / No family / a new one, ✕ delete; per family **Rename** (names kept, clashes numbered), **Delete** (with its presets), **⬇ Export pack**; and **⬆ Import pack…**.
- A **pack** is ONE `.eldrpack` file (`src/project/familyPack.js`): a zip with `manifest.json` (format `eldr-pack` v1, family, preset list), every preset as its normal `.eldr.json`, and a 160 px preview PNG per preset (frame at 40 %). Import adds the presets to the pack's family, numbering names that are already taken; bad files give a message, never a crash.
- Fix on the way: Enter in a dialog no longer re-presses the button that opened it.

### D-117 · Keep several variations `[Raul]` — 2026-10-03
- Raul: in the Variations window there is often more than one he wants, but he can only pick one.
- Each variation tile has a big ☆ (pen-sized, top right). ★ keeps it in a **Kept** tray under the grid; kept ones stay while ↻ More makes new ones, and between opens (in the editor's variant prefs). Tap a tray thumbnail to use it, ✕ to let it go, Clear to empty the tray. Tapping a tile still uses it, as before.
- **Save N kept…** → Family + Name → saves all of them to My presets as "Family/Name v1, v2, …" (next free numbers, never overwriting), in the browser or the presets folder; the family shows as a group in the My presets menu. The tray empties after a successful save. Existing families are suggested.
- Families are the groups of My presets ("Group/Name" keys, D-098); C (next) adds the save dialog, a Families manager and `.eldrpack` packs.

### D-116 · Panel folds no longer fight playback `[Raul]` — 2026-10-03
- Raul: with One open on, while the timeline plays, the group he taps does not open, then it gets inconsistent, and sometimes he can't scroll to the other groups.
- Cause: during playback the inspector updates its values every frame; the side nav treated every panel change as a rebuild and re-applied the remembered folds — closing the group just opened before the browser delivered its (async) toggle event, which was then swallowed as "ours".
- Fix: groups are opened / closed by the nav only when the search changes or for groups that just appeared; the observer ignores value updates (only rows / groups added or removed count); our own toggles are remembered with the state set and expire, so a coalesced event never swallows the user's next tap.
- Verified in the browser while playing: every tap opens the group (One open), and the panel scrolls to the bottom.

### D-115 · Vortex & Dark Magic family `[Raul]` — 2026-10-03
- Raul: a missing family, vortex / dark magic, after three references (a ground portal with god rays, light ribbons spiralling around a dark orb, a black hole with bright arms and a smoky rim).
- New **Vortex** layer (`src/shapes/vortex.js`, `vortex.*`): spiral arms as tapered cel-banded strips with a hot edge, from an inner to an outer radius. **Flat** (Tilt lays it down like the orbit plane) or **Sphere** (arms wrap a ball pole to pole; Side draws the near / far half so a core sits between). Break-up noise pinches the arms into streaks and flows along them (negative = sucked in); Reveal grows arms from the rim inward; spin rounded to whole turns per loop, noise cross-faded (D-071).
- New **Light rays** layer (`src/shapes/rays.js`, `rays.*`): soft tapered beams from a base ellipse; fan from parallel to radial; per-beam length / width / flicker; nested soft + bright quads with a fade to the tip, added together.
- Emitters gain **Pull to centre** (`emit.pull`, radius × e^(−pull·age)), **Swirl around** (`emit.swirl`, turns/s, speeding up as the radius shrinks: θ = ω(e^(2·pull·age) − 1)/(2·pull)) and **Swirl tilt** (`emit.swirlTilt`). Closed form, so every frame still renders on its own; velocity (align to motion) is taken numerically.
- Presets, group **Vortex & Dark Magic**: Ground Portal, Dark Vortex Orb, Black Hole, Curse Swirl, Dark Implosion; **Particles · Dark Magic**: Soul Drain, Void Motes (`src/effects/darkmagic/presets.js`). Loop rings hold their thickness (the ring default thins over life, which popped at the seam).
- Next (approved order): B keep several variations, C your own families + `.eldrpack` packs.

### D-114 · Explosion family redo: Raul's Anime Blast, new Small Hit and Big Boom `[Raul]` — 2026-10-03
- Raul: Cartoon Pop is maybe OK, the others are not; he made the Anime Blast himself; remove its unused layers.
- **Anime Blast** = Raul's file ("fire magic 01", v0.0.86) shipped as-is in `src/effects/explosion/animeBlastFile.js`, loaded through `parseExplosion`, minus the four switched-off layers (Smoke, Fireball, Curl wisps, Twinkles). Its 70 frames are kept; the animation length is 0.96 s, so frames past ~29 are empty (Raul's call to trim).
- **Small Hit** (20 frames) and **Big Boom** (66 frames) rebuilt in Anime Blast's language — add-blended glowing cores on a keyed parent null (swell, settle, turn), rings thick → thin, cel shading, holes eating the smoke — in `src/effects/explosion/boomPresets.js`: the base stack edited layer by layer, keeping only the layers used (no switched-off layers).
  - Small Hit: pinch, star flash (4-point sparkle on the flash frame), 7 crescent slashes thrown out, thick → thin ring, sparks, a small cel puff with holes.
  - Big Boom: suck-in ring + gathering glow, 2-frame flash, cel fireball whose banded ramp cools into smoke and breaks into holes, shockwave, flat ground-dust ring, debris on gravity arcs, long sparks, rising cel smoke, embers.
- Explosion presets may now `build()` a whole state instead of a delta (Cartoon Pop stays a delta). `snapParams` exported from presetKit.
- Fix: the renderer reads Light → alpha from the effect, not from its keyed snapshot (an animated effect ignored a changed Light → alpha).

### D-113 · No more sticky sliders or trapped keyboard `[Raul]` — 2026-10-03
- Raul: sliders and buttons feel sticky; after choosing a preset the menu keeps the keyboard, so Space (play) re-opens the preset menu (the same for every button) — he had to click the canvas to get out.
- Causes: (1) a drag only ended on pointerup; when the release was missed (pen lifts, releases outside the window) the slider / handle kept following the hovering pointer; (2) menus, buttons and switches kept focus after a mouse / pen click, and the shortcut handler treated ANY focused input or menu as typing, so Space went to the control (opening the menu, pressing the button again).
- Fixes: drags end as soon as a move arrives with no button down, and on lostpointercapture — in the shared pointer helper (viewport handles, curve / ramp editors, …), the slider, timeline scrubbing and panel dividers. Only text fields (text, number, search, textarea) count as typing; when a shortcut runs while a menu / button has focus, the shortcut wins and the control lets go. A focus guard (`src/ui/focusGuard.js`) gives the keyboard back after a menu choice, a mouse / pen click on a button, switch or group title, and a slider drag (keyboard users keep focus). Tests: missed release on the slider, typing detection, Space on a focused menu plays and frees it, a menu choice frees the keyboard. Browser-checked: after picking a preset or clicking Twos, Space toggles playback.

### D-112 · Right-panel navigation: find a setting, fold, jump bar `[Raul]` — 2026-10-03
- Raul: navigating the right panel means too much scrolling to find a slider; asked for a suggestion (he uses Video Copilot's FX Console in AE). Proposed 1 folding · 2 find a setting · 3 command palette · 4 jump bar · 5 pins / changed-only; Raul chose 1 + 2 + 4 first.
- `src/ui/editor/sideNav.js` (works on whatever the panel shows — every inspector group is a `details.insp-group` — and keeps up as the panel is rebuilt, via a MutationObserver): a sticky bar at the top of the panel with **Find a setting** (/ focuses it, Esc clears; every typed word must appear in a row's label, tooltip or group; only matching rows stay, their groups open without changing what you keep open), **⊟ Fold all / ⊞ Unfold all**, **☰ One open** (accordion: opening a group closes the others; Alt+click a group title does it once), and a **jump bar** of chips (one per visible group; tap = open it and scroll it under the bar, with a short flash).
- Which groups are open is remembered by group name (localStorage), so a group you never use stays folded on every layer. The accordion choice is remembered too. Pen-sized buttons and chips.
- New shortcut / (Find a setting) in the cheat sheet. Browser-tested on Waterfall Impact's Fall layer (fold all, search "speed" → 5 rows, jump to Surface Noise).

### D-111 · Ellipses, rectangles and closed shapes as motion paths `[Raul]` — 2026-10-03
- Raul: add ellipses and squares to the path feature, so paths can also be closed shapes without masking the object. Plan approved ("go").
- Masks get **Path only (doesn't cut)** (`pathOnly`) for closed shapes; open pen paths always are path-only (`isPathOnly` in masks.js). The mask pass skips them. Saved in files; older files open unchanged.
- Ellipses and rectangles are paths too (`shapeVertices` in followPath.js): an ellipse as four smooth bezier points, a rectangle as four sharp corners, both from the top, clockwise; moved / scaled / rotated like the mask.
- Users: Follow Path lists pen paths (as before) plus ellipses / rectangles on Path layers or set to Path only (closed: Loop wraps around and around); particles "Along path", Liquid ribbon "My path" and bolts use the layer's motion path (`motionPath`: first enabled open pen path or Path-only shape).
- Editor: the Path only switch (the cutting controls hide when it is on), Path layers offer ＋ Ellipse / ＋ Rectangle next to ✒ Draw path, motion paths are drawn orange and finely dotted in the viewport. Browser-tested: a ribbon running round a Path-only ellipse. Tests: ellipse length and closure, rectangle corners, motion-path pick, Follow Path list, Path-only never cuts (and is saved).

### D-110 · Bubbling Brew rebuilt like the other liquids `[Raul]` — 2026-10-03
- Raul: the brew needs a redo like all the other liquids. Plan approved ("go ahead").
- Pool: an oval of lime goo (sphere-wrapped fractal squashed flat, liquid type, slow churn + twirl and spin, three flat bands, no white) in a dark rim. Bubbles swell up in place (scale grows), jiggle and pop (no outline, no fade); pop rings (ripple particles); three sticky goo leaps (Liquid stream: short push, high stretch, lumps) staggered across the loop — they rise, pinch into round blobs and fall back in; flicked drops; thin toxic-green cel fumes. The old blob/goo-adjustment setup is gone. ~30 ms per 512² frame.

### D-109 · Water stage 2, step 3: water orb, pond, bubbles `[Raul]` — 2026-10-03
- Raul approved step 3 ("approved").
- Fractal Noise sphere: **Water level** (fill the ball only up to a line) and **Slosh** (the line rocks and waves; one rock per loop in loops), with a bright water line (meniscus).
- Bubbles: **Jiggle** (squash and stretch as they rise, area kept, each on its own rhythm) and **Pop** (the last part of the life: the skin snaps open into round droplets that fly out and fall, the torn skin pulls back into short round-ended arcs) — instead of fading out.
- Presets: **Water Orb** (water to 62 % with a sloshing line, calmer churn, caustics, bubbles rising and popping at the surface); **Ripple Pond** (an oval pond of cel water — sphere-wrapped fractal squashed flat — with a caustic web at full quality, three groups of organic rings, glints); **Bubbling Brew** and **Rising Bubbles** bubbles jiggle and pop (no fade).
- Water stage 2 is complete. Ripple Pond renders ~120 ms per 512² frame here (thin caustic lines need every pixel).

### D-108 · Water stage 2, step 2: Liquid ribbon, Wave Slash `[Raul]` — 2026-10-03
- Raul approved step 2 ("approved Next step").
- New layer **Liquid ribbon** (`src/shapes/liquidRibbon.js`, `ribbon.*`), after the liquid "2" reference: a tube of water along a path — built-in Slash arc, Number 2, S-wave, Spiral, or **My pen path** (the layer's open pen path). The head runs the path over the travel time (eased: fast start, slowing); the tail follows (up to Length of the path behind) and catches up when the head slows; thickness tapers head → tail with lumps that run along; volume kept (a shorter ribbon is fatter, ending as a round blob); the tail flings drops outward that fall; at the end the blob splits into drops that fly on along its direction (the first ones nearly the blob's size — it splits, it does not pop). Never back along the path.
- The melt + cel shading of the Liquid stream moved to a shared `src/shapes/meltedWater.js` (`paintMeltedWater`, shading controls per prefix); stream output unchanged.
- The planned separate "Water sheet" layer is the ribbon on the Slash path with a big thickness — one layer instead of two.
- Presets: **Wave Slash** rebuilt (thick slash ribbon with running foam streaks as Surface noise, a thinner trailing wave, flung drops, end burst, glints) and new **Liquid Ribbon** (a "2" plus a thin swash). Tests: purity, follows a custom path, head runs forward, end burst flies away from the end.
- Known: the editor's 404 in the console is the missing favicon.ico (harmless).

### D-107 · Fractal speeds you can control in loops `[Raul]` — 2026-10-03
- Raul: with Seamless loop on, Evolution speed and other animations get very accelerated and are hard to control; 1 is already too fast. Plan approved ("go ahead").
- Cause: loops forced evolution and spin to whole turns per loop, at least one (a 2 s loop could not go slower than 0.5 turn/s), and one turn was a big morph.
- Evolution now moves through two extra noise dimensions at Speed × 0.8 noise units per second. In a loop its path is a closed circle whose size comes from the speed (slow = small circle): it comes back exactly, stays crisp and runs at the asked speed, nothing rounded. Cells' feature points follow the same evolution point. Manual Evolution: 360° = 1.2 noise units. Spin: whole turns per loop only when that is close to the asked speed (≥ ¾ turn per loop); slower spins cross-fade end into start at the asked speed. Noise stats re-calibrated for the new slice. Presets re-tuned to look as before (2.75 / 5.5 in their 2 s / 1 s loops; spins 0.5 / 1); Energy Clouds no longer scrolls (scrolling cross-fades soften sharp patterns mid-loop). Surface noise default speed 1.5. Tests: a slow evolution changes as fast in a loop as in a one-shot and still closes; double speed ≈ double change.

### D-106 · Water stage 2, step 1: waterfalls; orbs on fractal noise `[Raul]` — 2026-10-03
- Raul: "next stage" (water stage 2, plan approved: step 1 waterfalls first) — plus: change the old orbs to use fractal noise instead of the laggy swirl (field fire) layer.
- Fractal Noise layer: **Shape** Flat / **Sphere** (the pattern wrapped on a ball of Width, with **Spin** and **Tilt**; round anti-aliased edge), **Twirl** (a vortex twist, strongest in the middle), Spin also turns flat patterns (whole turns per loop).
- Orbs: Energy, Fire, Nebula, Electric and Water Orb now use sphere-wrapped fractal noise (Water Orb adds a caustic web). Render time per 512² frame here: Energy 377 → 84 ms, Fire 314 → 95, Nebula 289 → 112, Electric 145 → 64, Water 371 → 72.
- Splash crown: **Bulge** (the wall bows out — a mound of foam, drawn as strips of the surface of revolution) and negative **Flare** (the top closes in).
- New **Waterfall Impact** (after Raul's two waterfall references; loop, on twos): streaked falling column with a running water surface and glow, a boiling foam mound (crown back + front, bulging, with churning foam cells as Surface noise), swirling ring pieces, thrown drops, bubble rings, low mist. **Waterfall Mist** rebuilt: a thin streaked pour (was a stream of droplets), a small foam mound, mist banks leading.

### D-105 · Liquid stream: jets made of melted blobs `[Raul]` — 2026-10-03
- Raul on v0.0.77: almost there, but the jets make little sense — tweaking a slider never gives the same result again, the split-up is a jittery mess with no consistency, not close to water; asked whether a particle approach (like AE particles + choker) would be better. Plan approved ("go for a b c").
- Cause: the old jet was one procedural shape whose random cut placement was re-dealt whenever a slider changed the cut count, and pieces snapped into shape when a cut tore.
- New layer **Liquid stream** (`src/shapes/liquidStream.js`, `stream.*`): blobs leave the base over the push time, each on its own ballistic arc (later water slower, so the stream stretches; the tail still leaves the surface). Speed, drift and size come from smooth noise along the stream (neighbours behave alike → lumps). Pinch points are placed along the stream by noise at a spacing set by **Lumps** (not by the blob count); each neck deepens smoothly and closes exactly when it tears; freed pieces pull together (short ones into round drops) and drift apart sideways; water coming down into the surface goes in. Everything is melted into one body (blur + threshold) and cel-shaded as a whole (body, shade away from the light, lit rim, highlights). Controls: Height, Thickness, Push time, Rise time, Blobs, Break-up, Lumps, Stickiness, Stretch, Spread, Lean, Wind, Wobble, Melt, Shrink at the end + shading.
- Presets: Jet Breakup, Drop Impact and Water Splash rebound jets and the Geyser side jets now use it. The old Liquid jet layer stays for saved files ("old" in its label). Tests: purity, rise + pinch into several drops, changing the blob count barely changes the shape, leaning streams always move outward.

### D-104 · Fractal Noise layer + Surface noise on every layer `[Raul]` — 2026-10-03
- Raul: fractal noise was forgotten — for animated backgrounds, wrapping orb surfaces, water surface animation (e.g. a flat jet stream with an animated water surface on top) and many other effects; he will do a lot of the heavy lifting with it.
- `src/render/fractalNoise.js`. **Fractal Noise** layer (AE-style): Noise type Basic / Turbulent / Ridges / Liquid (domain-warped) / Cells (Worley borders: caustic web, wobbled by Liquid warp); Contrast, Brightness, Invert, Complexity, Sub influence / scaling / rotation, Scale, Stretch, Rotation, Offset, Flow X/Y (px/s), Evolution (°, keyframable) + Evolution speed, Bands (flat cel steps, optional soft edge), Colour ramp, Alpha (solid or bright = opaque), Quality; Fill the frame or a rectangle. The pattern lives in the layer's space. Every type is calibrated to the same centre and spread, so Contrast / Brightness mean the same for all and settings change gradually.
- Seamless loops: evolution travels round a circle in the 3rd/4th noise dimensions (whole turns per loop) — crisp, no cross-fade; only scrolling (Flow) cross-fades end into start. Speed: computed on a coarse grid (Quality: draft 8 px / normal 4 px / best 1 px) and smoothly scaled up before contrast and bands, so cel edges stay crisp (backgrounds 30–95 ms per 512² frame here).
- **Surface noise** group on every sprite layer (post-process after goo): paints the fractal inside the layer's own shapes with a blend mode and mix. Mapping: Flat, Flow (stretched along a direction and running with it — streams, columns) or Sphere (wrapped on a ball with spin and tilt — orbs). The renderer now passes the layer matrix to post-processes.
- New **Backgrounds** preset group: Caustic Pool, Water Surface, Energy Clouds, Lava Flow (seamless loops). The Geyser column gets a flowing water surface.

### D-103 · Water never pulls back into its source; round edges, no spikes `[Raul]` — 2026-10-03
- Raul on v0.0.76: better but still off — the water gets "sucked in" again, the edges are spikes, and the Geyser's side jets going backwards look like the animation is reversed ("water does not behave like that at all"). No more GIF previews: a thumbnail only. Plan approved ("go").
- Causes: (1) the jet's last water left at 8 % speed and fell back down its own path while still attached, so the column shrank into the base; (2) a lean was an offset by height, so falling drops slid back toward the centre along the same curve; the wavy centre line also depended on height; (3) the Geyser column's Reach went back to 0 (shortening into the ground); (4) pointed petals, a spiky column tip, `sin 13θ` ragged edges, pointed ring-piece tapers, needle-like fast drops.
- Rule: water that has left never goes back into its source as a connected body; it lets go and keeps moving, breaks up, falls on arcs and disappears into the surface where it lands.
- Liquid jet: the slowest water still leaves at 40 % speed; when the push ends the base pinches off (the bottom end rounds and lifts free); a lean is a sideways speed (leaning jets keep curving outward while falling); the wave lives in the material; freed pieces drift clearly to one side (outward for leaning jets), only short pieces round up; the head drop pops on upward when it tears; free water that comes down into the surface shrinks into it.
- Water column: new **Let go over life** (`col.release`) — the base end leaves and travels along the flow; streaks keep their spacing; round lumpy ends (**Lumpy end** replaces Spiky end) and soft slow edge waves. Splash crown: domed, round-topped petals with round bulbs, smooth wall/petal union, soft rim; the crater gets shallower instead of shrinking inward; new **Strength over life** (`crown.strength`) so a boiling foot settles into the pool; boil mode fills the pool inside the ring. Ripple pieces end in round caps; soft edge wobble. Drops: speed stretch capped (×1.6) and a round tail end.
- Presets: Geyser (column lets go and travels up, top rain, foot settles, side jets arc outward and live their whole arc), Water Splash (rounder petals), Drop Impact (pieces spread). Previews are one still thumbnail (no GIFs).

### D-102 · Water stage 1, second pass: organic rings, lumpy jets, splash crown, water column `[Raul]` — 2026-10-03
- Raul on v0.0.75: jet, Water Splash and Geyser still far from the references; the rings are perfect, evenly cut shapes — he asked specifically for organic, fluid behaviour.
- Re-studied the references close up. Rings are brush strokes: wobbly radius, thicker at the front, uneven width, ragged edge, cut at uneven places into pieces that taper and shrink at their own speed; in the waterfall they are partial swirling arcs. The rising column is a lumpy, wavy clump; it tears at uneven places into very different drop sizes plus tiny satellites, the head bursts into a fan, the pieces scatter like a cloud, hang, fall and shrink to dots; drops are two-tone (inner shadow) with white highlights. A splash has a crown (cup of water, bright lip) that rises, hangs, collapses into the ring. Waterfalls / geysers: streaked columns with torn edges and a spiky, boiling foot.
- Ripples: **Organic** (default 0.7) — the above; 0 = old geometric rings. Liquid jet: **Wobble**, **Satellite drops**, **Shrink at the end**; uneven cuts with their own tear moments, per-piece kicks, head spray, inner shadow. New **Splash crown** layer (`src/shapes/waterSheet.js`, `crown.*`): Splash mode (staggered petals, round drops forming at the tips that fly off — the milk crown; never a frozen hold: it keeps creeping up and fluttering, then collapses faster and faster; the crater closes) and Boil mode (petals re-form on their own cycles, seamless); **Draw: whole / back / front** to wrap it around a stream (two layers sharing one seed). New **Water column** layer (`col.*`): streaks racing along it (whole cycles per loop), torn edges, spiky end, Reach over life.
- Presets: Water Splash (crown + tip drops + spray + rebound jet + organic rings), Geyser (streaked column, top spray, split boiling foot, side jets, mist), Jet Breakup (short push, lumpy clump, scatter), Drop Impact (calmer rebound jet). Spray Fountain / Rain unchanged apart from the organic rings.

### D-101 · Multi-layer canvas drag + Water rebuilt, stage 1 `[Raul]` — 2026-10-03
- Bug (Raul): with several layers selected, dragging on the canvas moved only the top one. Now Move moves every selected layer by the same amount; Rotate / Scale turn and scale each around its own anchor (same angle / factor); a layer whose parent is also selected rides with the parent; anchor drags stay single; one drag = one undo step. Browser-tested (two layers, both move 80, 20).
- Water: "looks nothing like water" — study the references (cartoon drop impact Z_B, liquid "2" motion graphics, a jet breaking into drops, two waterfall impacts, a caustic orb) like the smoke, with extra care for timing and fluid behaviour. Plan approved in two stages ("go" for stage 1).
- Fluid rules taken from the references: weight (arcs; fast up, hang at the top, fast down), volume kept (stretch thins, thin water necks and pinches into drops), round ends (surface tension), drops stretched by speed and round at the apex, splashes = crown up then collapse, rings slow down and break into dashes instead of fading, cel shading with the highlight on the lit side.
- New `src/shapes/water.js`: **Water drop** (`drop.*`: stretch by speed ratio with volume kept, teardrop tail, shade + highlight in the drop's own frame) as layer / **Particles · Water drops** / **Burst · Water drops**; **Liquid jet** (`jet.*`): material leaves the base over the push time with decaying speed under gravity (front reaches Height at Rise time), thinning from spacing, a round head, a varicose wave whose necks pinch one after another into drops that round up (capped size), scatter and fall back; clipped at the water surface. Ripples gain **Slow down** (ease-out spread), **Break into dashes** and **Dashes**; new **Particles · Ripples** (`rippleEmitter`). Burst gravity / speed and emitter gravity limits raised for water.
- Presets: new **Drop Impact**, **Jet Breakup**; rebuilt **Water Splash**, **Geyser**, **Spray Fountain**, **Rain**. Stage 2 (waterfall column + splash crown, water sheet, liquid ribbon, caustics orb; Waterfall Impact, Waterfall Mist, Wave Slash, Liquid Ribbon, Water Orb, Ripple Pond, Bubbling Brew, Rising Bubbles) waits for Raul's look sign-off. Water GIFs live on a separate preview page (the Cel previews page is near its size limit).

### D-100 · Cel smoke everywhere (consistency) `[Raul]` — 2026-10-03
- Raul: "I like consistency" — replace the last old (insect-like) smoke with cel smoke. Plan approved ("go").
- New layer **Burst · Cel smoke puffs** (`celSmokeBurst`): a one-shot burst of cel puffs (push, drag, buoyancy, hole-field dissolve).
- Replaced: the explosions' base **Smoke** layer (`puffBurst` → `celSmokeBurst`, grey tones like before; Cartoon Pop keeps its ink outline, Big Boom heavy smoke); **Fire Breath** smoke (dark SOOT cel puffs); **Particles · Smoke Column** (cel puffs, buoyant + shared wind); **Geyser** and **Waterfall Mist** mist (MIST ramp, banks at the waterfall base); **Spray Fountain** foam. Fire smoke **wisps** keep their shape but rise buoyantly with the shared wind. The Fireball layer stays `puffBurst` (it is fire). Old layer types remain for saved files.
- Fixes found on the way: (1) scratch canvases (cel flame / cel smoke) are now sized in 64-px buckets that depend only on the requested size — a bigger leftover canvas sampled differently at the copy edges, making a frame depend on render order (caught by the determinism test on Cartoon Pop). (2) Light → alpha got cheap: a glow's two passes are summed and converted once, and only the area that has pixels is read (found with a ¼-size probe) — Cel Wildfire 118 → 72 ms at 512² (63 ms without it), Cel Fire Wall 42 → 24 ms.

### D-099 · Cel flame bites enter from below the flame `[Raul]` — 2026-10-03
- Raul: the cel flame bites pop up suddenly at the bottom; they should spawn under the flame. Plan approved ("go").
- Cause: each bite started its trip at 12 % of the height, already on the edge — a full-size cut appeared in one frame (measured: up to 46 % of a bite's area changed in one step).
- Fix (`celFlameShape`): each bite starts clear below the base (1.3 × its size under it) and rises along the side; around the round bottom it rides at the flame's full width, so it slides in as a thin sliver that grows as the body widens, then goes up the side and out past the tip as before. Whole cycles per loop (seamless); the core's scaled bites follow. New test: the share of each bite inside the flame never jumps more than 20 % between steps over a loop (old code fails it). The bites cover a longer path in the same cycle, so they move a little faster.

### D-098 · Presets folder on disk `[Raul]` — 2026-10-03
- Raul asked where presets are saved (answer: browser localStorage — clearable, per browser/address, ~5 MB) and chose a folder on disk ("2 sounds good, 3 [desktop app] will come automatically"); plan approved.
- `src/project/presetFolder.js` (File System Access API, Chrome / Edge): **📁 Presets folder…** in the top bar; pick a folder once (handle remembered in IndexedDB). One preset = one `Name.eldr.json` (same format as Save file…, images inside); subfolders (up to 3 deep) are groups in the My presets menu and in Pack's sources; type `Group/Name` when saving to use a subfolder. Reads come from a cache filled by scans (on connect, Rescan, and whenever the window gets focus — files added in Finder appear by themselves); writes go to disk first. Broken / non-effect / hidden files are skipped; names are made file-safe.
- Browsers ask again for permission each session: the button becomes **📁 Reconnect "…"** (one click). Folder gone → "Folder missing — choose again", falling back to the browser presets. Connected button opens Rescan / Change folder… / Stop using the folder (files stay on disk). On first connect ELDR offers to copy the browser presets into the folder (existing names kept; browser copies stay).
- Safari / Firefox: the button is disabled with an explanation; My presets stay in the browser. Tested with a fake folder (unit) and in Chromium with the browser's private file system standing in for the picked folder (save to subfolder, migration, reload, menu groups). The desktop app will reuse this with its own default folder.

### D-097 · ELDR starts in the editor `[Raul]` — 2026-10-03
- Raul: "make the app start in the tool, I am tired of starting here" (the old scaffold landing page with test-page links).
- `index.html` is now the editor (same markup as the old `test-pages/explosion.html`, script `/test-pages/explosion-page.js`). The old landing page moved to `dev.html` (test-page links; "💥 Editor" points to `/`). `test-pages/explosion.html` redirects to `/`, so old bookmarks keep working. Browser storage is per origin, so My presets and view settings are unchanged. Build entries: main (editor) + dev.

### D-096 · Light → alpha: no dark halo on transparent exports `[Raul]` — 2026-10-03
- Raul: exports with alpha get a "drop shadow" around the effects (he fixes it in AE with Unmult), but other places should not have to rely on blend modes, which lose colour nuance. Plan approved ("go ahead").
- Cause: glows and Add layers are light, but over transparency they were stored as dim, desaturated paint at partial alpha (the blurred glow carries the layer's alpha, including its dark parts) → over anything brighter than the glow they darken it.
- Fix (`src/render/lightAlpha.js`): an Unmult for LIGHT ONLY, while rendering. Before an Add-blend layer is composited, and before each glow pass is added, every pixel gets alpha = its brightest premultiplied channel and its colour brightened to match. The premultiplied colour is unchanged, so over solid paint light adds exactly as before and over black the result is identical (tested, all presets 100 % brightness); over transparency dim light becomes nearly transparent instead of a dark smudge. Painted (Normal) layers are never touched: all smoke / paint-only presets render byte-identical.
- Measured over white on every preset (soft areas): darkening down 10–50 % (e.g. Dancing Flame Pink 146 → 76, Fire Rain 653 → 381, Thunder Impact 731 → 534), the brown rim and dark specks gone. Cost: one read/write of the layer pixels per Add layer and glow pass (≈ +5–15 ms per frame at 256²; preview cache absorbs it).
- Effect setting **Export look → Glow on alpha**: Clean (Unmult light, default for every effect, also in the preview so it matches the export) / As before (`light.alpha`, saved with the file; effects built outside the editor default to the old behaviour). Track-matte sources keep their old alpha.
- Not done yet (optional, Raul's call): a premultiplied-alpha export for engines that support it (needs ELDR's own PNG writer — the browser drops colour where alpha is 0).

### D-095 · Irregular dissolve edges + Cel Wildfire without the old smoke `[Raul]` — 2026-10-03
- Raul on v0.0.68: "a good start for an animator to build from"; all our dissolve effects need irregular shapes too, like the wobble / noise we use on layer edges. Plan approved ("Go!"), plus: remove the old (insect-like) smoke from Cel Wildfire.
- **Layer Dissolve** (all 10 shapes, Dissolve and Reveal): **Edge noise**, **Noise detail** (× piece size), **Edge wobble** (`dissolve.edgeNoise / edgeDetail / edgeWobble`). The pattern lookup is bent by smooth noise before it is cut (domain warp), so every shape gets organic edges the same way; the wobble moves the sample around a circle in noise space, so loops stay seamless (tested). Default 0 = identical to before (tested). Cost ≈ +50 % for the dissolve pass (29 → 43 ms on a 400² layer). Pixels / sand get faint seams with high noise — keep them low for crisp pixel art.
- **Cel smoke**: holes and bites are irregular shapes whose edges boil (**Hole shape**, **Hole wobble**, default 0.35 / 0.8); optional noisy outline on the smoke itself (**Edge noise**, **Edge wobble**, default 0; the field-dissolve presets use 0.07). Each shape has three waves with per-shape phases (hashed from a stable id), turning at whole multiples of one loop-safe rate. Droplets stay round.
- **Cel Wildfire**: the old puff-particle smoke is removed. (Old `puffEmitter` smoke/mist still exists in Fire Smoke Column-type presets, Particles · Smoke Column and Water mist/foam — to revisit if Raul wants.)

### D-094 · The smoke dissolve: eaten by a field of holes `[Raul]` — 2026-10-03
- Raul on v0.0.67: Poof, Toxic Cloud, Mushroom Puff and Blown Puff still "way off" — they behave like bubbles; the dissolve comes too late, the bites are too small, they shrink in a weird way; study the references again.
- Re-studied the four reference GIFs frame by frame: the cloud forms in 1–3 frames (no bubbles popping in one by one), then from very early MANY holes of mixed size open all over it, grow and merge into a web of thin strands and crescents, which break into crumbs. The cloud keeps its size and slowly spreads — it is eaten, it never shrinks; the holes have a dark rim on one side (depth).
- Cel smoke now dissolves with a **hole field** (puff / bank / mushroom): **Holes** (count), **Hole size**, **Holes start**, **Hole shading** (dark inner rim). Holes are scattered over the cloud (weighted toward big lumps but thin parts too; some land on the edge = big bites), each opens on its own clock staggered along **Breaks up from** / **Overlap**, opens quickly to a visible size and keeps widening, attached to the spreading smoke. Lumps no longer shrink on their own clocks (that looked wrong): **Shrink over life** now only finishes the last crumbs, all together (default from 0.86). Lumps pop in with an ease-out without overshoot. Columns keep per-lump holes (their height is their age).
- Presets retuned with the field: Poof, Toxic Cloud, Mushroom Puff (+ ground puff), Blown Puff, Dust Impact, Rising Puffs, Fog Bank.

### D-093 · Organic smoke timing (smoke animation principles) `[Raul]` — 2026-10-03
- Raul on v0.0.66: much better, but Poof, Toxic Cloud, Mushroom Puff, Blown Puff, Dust Impact and Rising Puffs feel mechanical — linear motion, clear stages (scale up, then everything dissolves at once); the dissolve must be part of one organic process; Rising Puffs "move like insects flying up". Asked to research smoke animation principles; plan approved ("yeah").
- Principles applied (Gilland, *Elemental Magic*; classic effects animation): fast in, long ease out (energy only gets lost); overlapping action (every lump has its own life, staggered, so something always grows while something else breaks); thin before breaking (holes at different times and speeds, edge bites, droplets); internal roll; rising smoke is buoyant (push → deceleration → slow rise and widening, one shared wind, no per-puff wandering).
- Cel smoke (`src/shapes/celSmoke.js`): per-lump clocks. New settings: **Breaks up from** (edges / bottom / top / left / right / random; edges = core born first, goes last), **Overlap** (stagger), **Pop-in time** (ease-out with a small overshoot), **Build-up** (births spread in the order), **Keep growing** (ease-out expansion), **Roll** + **Roll speed** (lumps roll outward over the top; slows as energy is lost; loops keep whole turns), **Edge bites**. Two holes per lump (capped so a lump never becomes a lone donut; the core always gets one); droplets pinch off breaking outer lumps and fly out decelerating. The mushroom stem rises with an ease-out. The single layer's whole-life scale is now flat (growth is per lump).
- Emitter: **Wind sway** + **Wind speed** (`emit.wind`, `emit.windSpeed`): one slow wind shared by all particles, older particles sway more with a phase lag along the stream (an S-bend); whole sways per loop. Cel smoke puffs default to buoyant motion (push 150, drag 1.6, buoyancy −70, wind 30).
- Presets retuned: Poof (34 f; flash overlaps the burst), Toxic Cloud (44 f; rolls in from the left, breaks from the old end), Mushroom Puff (44 f; breaks from the bottom, cap rolls), Blown Puff (36 f; strong ease-out keys, back breaks first), Dust Impact (34 f; rolls out from the impact, breaks from the centre), Rising Puffs (buoyant + wind, no turbulence); Fog Bank and Smoke Trail use wind instead of wandering.

### D-092 · Smoke reworked as cel smoke `[Raul]` — 2026-10-03
- Raul: the Smoke presets "don't really look like smoke", the smoke particles look bad next to the rest; adapt the cel-flame method; four references studied (pink cartoon poof, grey-lavender cel smoke column, green toxic cloud, pixel-art puffs / mushroom / blown puff / ground dust).
- New layer **Cel smoke** (`src/shapes/celSmoke.js`, type `celSmoke`) + **Particles · Cel smoke puffs** (`celSmokeEmitter`): smoke as a union of round lumps in flat cel tones, drawn on a private scratch canvas — the silhouette in the shade tone, the body tone shifted toward the light on top (a dark crescent stays on each lump's shadow side), optional highlight blobs, then round **holes** grow inside the lumps (staggered; a third never get one), lumps **shrink**, **droplets** pinch off and shrink away. It dissipates without fading, like the references.
- Forms: **Puff** (round cluster, drifts apart), **Column** (lumps rise up a curving spine, growing; each lump's own height drives holes/shrink; lumps swell in at the base and shrink away at the top so the loop never pops), **Bank** (long low cloud, two rows), **Mushroom** (thin stem + a blooming cap). Settings `cs.*`: Lump size, Lumps, Spread, Height/length, Rise speed, Sway, Lean, Boil, Drift apart, Shade, Light from, Highlights, Body / Shade / Highlight colour (ramp positions), Holes over life, Shrink over life, Droplets. Rates move in whole cycles per loop (seamless; loop seam tests pass).
- **Smoke** presets replaced: Poof, Smoke Column, Toxic Cloud (outline + highlights), Steam Vent, Chimney Smoke, Mushroom Puff, Blown Puff, Dust Impact (ground streaks + mirrored low banks). **Particles · Smoke**: Smoke Trail, Fog Bank, Rising Puffs. The old smoke layer types stay, so saved files still load.

### D-091 · More Cel Fire presets `[Raul]` — 2026-10-03
- Raul ("these look awesome"): more presets with the bitten-teardrop principle — flamethrower, wildfire and a few more; a starting point for his own animated ones.
- Cel flame gains **Angle** (`celflame.angle`): turns the flame; with particles aligned to their motion, 90 = the tip points where they fly (jets, bursts), −90 = it trails behind.
- New: **Cel Wildfire** (tall back flames + a dense particle front + dark cel smoke + embers), **Cel Fireball** (hot core, flames streaming back; stays in place), **Cel Fire Pillar** (one huge flame with flames rising through it), **Cel Fire Burst** (one-shot: flames blast out from a flash); particles: **Cel Flamethrower** (jet pointing where it flies, swelling as it slows), **Cel Meteor** (one-shot diagonal pass, flames trailing), **Cel Burning Ground** (low flames along the ground).
- Cel flame particles keep their colour over life (ramp position 0 → 0.2) instead of running to the ramp's dark end, which turned them grey (also the layer default and Cel Fire Trail).

### D-090 · Cel Fire family: the "bitten teardrop" flame `[Raul]` — 2026-10-03
- Raul shared an After Effects cartoon-fire reference (TikTok) and asked to add this way of making flames as a NEW family, keeping the existing Fire presets.
- The trick: a teardrop body; circles rise along its sides and are cut out of it (inverted matte), so the edge keeps changing and the tip breaks into tongues; the shape wobbles; a smaller copy inside is the hot core; soft glow.
- New layer **Cel flame (bitten teardrop)** (`src/shapes/celFlame.js`, type `celFlame`) + **Particles · Cel flames** (`celFlameEmitter`). Settings: Height, Width, Tip sharpness, Lean; Bites (count), Bite size, Bite depth (0 grazes, 1 splits the tip), Bite rise speed; Wobble + speed; Hot core (size, drop); Body / Core colour (ramp positions); **Show bites** (draws the cutting circles in blue, like the reference). Bites and wobble move in whole cycles per loop (seamless; tested). Drawn on a private scratch canvas (body − bites, core − scaled bites kept inside the body via source-atop) and placed with the current transform, so overlapping particles never cut each other. Fast: ~10 ms / frame for one flame at 512².
- **Cel Fire** presets: Cel Flame (the reference), Cel Candle, Cel Torch, Cel Campfire (4 flames out of step), Cel Spirit Flame (blue), Cel Magic Flame (purple). **Particles · Cel Fire**: Cel Fire Wall, Cel Fire Trail. Rendered every frame — use Twos in the timeline for the choppier anime feel.

### D-089 · Image / Sequence layer (hand-drawn animation in, pixel art out) `[Raul]` — 2026-10-03
- Raul: "add a layer that only is used to import a png or sequence and it has all the features the other layers have … if I have hand-drawn animations I want to add or turn into pixel art"; plan approved.
- New layer type **`image`** ("Image / Sequence", first in ＋ Add layer): a single element (`shapeLayer('single', IMAGE_PARAMS, drawImageLayer)`) so it gets everything the other layers have — transform + keyframes, parenting, masks, track mattes, blend, opacity, Glow, Outline, Dissolve (incl. Reveal), Goo, Gradient Map, Variants, Pixel Mode, export / packs. Whole-life by default (flat scale / opacity curves, anchor Free).
- Its settings (`image.*`): **Size** Native (1 image px = 1 px) or Custom (longest side); **Playback** Loop / Play once (hold last) / Ping-pong / Stretch over the layer's time; **Sequence fps**; **Hold each drawing** (1 = ones, 2 = twos, …); **Start at drawing**; **Colour** Original / Tint by the ramp / Brightness → ramp. `imageFrame()` is pure and tested. Variants never change its fps / holds / start / size.
- Import: choosing Image / Sequence opens the file picker right away (select every numbered PNG = one sequence, natural name order); images up to 2048 px and 600 drawings (the particle texture limit stays 512 / 300). If the frame or length differs, one question: "Match the effect to the animation: frame W × H and length N frames?" (one frame per drawing). The panel also has **⤢ Frame = image size**.
- Pixel Mode for drawings: the **Auto palette now samples the colours of Image layers** shown in their original colours (their unused ramp is left out), and colours are matched in **Oklab** (perceptual) instead of a weighted RGB distance — a light green now maps to green, not to a light grey.

### D-088 · Dissolve: 7 more shapes + Reveal `[Raul]` — 2026-10-03
- Raul: "the dissolve effect should have more shapes to dissolve into and it should be reversible so it can be used as a reveal effect too"; plan approved.
- New modes: **Pixels** (square blocks, random order), **Dots** (halftone: each cell keeps a shrinking disc), **Lines** (stripes thin out; Angle), **Wipe** (an edge sweeps across the shape; Angle, Edge roughness), **Radial out / Radial in** (a hole grows from the shape's centre / it closes in from its edges; Edge roughness), **Sand** (fine grain crumbling region by region). Wipe / Radial are normalized to what the layer draws now (its bounding box), so they cross exactly the shape.
- **Direction: Dissolve / Reveal.** Reveal = the same pattern backwards: amount = 1 − curve, so the curve reads "how much is shown" and the layer assembles itself (shards fly together, a wipe uncovers it); the burn edge works on the revealing edge. Tested: reveal at x % shown is pixel-identical to dissolve at (100 − x) % gone.
- New params `dissolve.direction`, `dissolve.angle`, `dissolve.roughness` (older files load with Dissolve / 0° / 0.25).

### D-087 · Export pipeline D1: engine-ready files + Pack export `[Raul]` — 2026-10-03
- Raul asked how professionals deliver VFX packs; researched (itch.io / Unity Asset Store packs: grid PNG sheets, PNG sequences, GIF/MP4 previews, README + licence; better packs add JSON with timing / loop / pivots and a trimmed packed edition with padding + extrusion; engine-native files are the premium extra). Raul: engines Godot, Unity, GameMaker, Phaser/Pixi **+ Unreal, Construct, GDevelop**; single-effect export stays the default, **Pack** is a separate button.
- `src/export/engines.js` (pure): grid sheet of unique drawings with **padding + extruded edges** (+ optional power-of-two), **strip** of every playback frame (`<name>_stripN.png`: GameMaker auto-slices it, Construct "Import sprite strip" N × 1), **PNG sequence** (`frames/`, GDevelop has no sheet import), **JSON Hash atlas** (TexturePacker layout + `pivot` / `anchor` in the UNTRIMMED frame + Pixi `animations` + an `eldr` block with plain arrays for importers), **Godot 4** SpriteFrames `.tres` (hold runs → frame durations; texture path relative to the .tres) + AnimatedSprite2D `.tscn` (autoplay, pivot at the node origin via offset), **Unreal Paper2D** `.paper2dsprites` (one sprite per drawing, pivots), **Unity** editor script (Tools ▸ ELDR ▸ Import Selected JSON: slices with pivot, creates the AnimationClip with fps + loop), **Phaser 3 / PixiJS** snippet, README (effects table + per-engine steps, wide-strip warning > 8192 px), LICENSE placeholder.
- `src/export/pack.js`: several effects → one ZIP `<Pack>/<effect>/…` + README + LICENSE + labelled `preview.png` contact sheet (+ Unity/Editor script). Each drawing PNG-encoded once. Same render path as single export (pixel-identical, Pixel Mode post included).
- UI: Export dialog gains **Engine-ready files (.zip)** + Pivot. New **Pack…** dialog: effects (this one, My presets, every built-in preset, grouped, "All" per group), variations per effect (Subtle / Wild, using the Variants settings), engines, pivot (centre / bottom centre), padding, power-of-two, additive versions on black, preview GIFs; remembered in this browser.
- Verified here: **Godot 4.3** (headless) loads the `.tscn`/`.tres` (frames, speed, loop, durations, regions, offset); **Phaser 3** and **PixiJS 8** load the atlas in Chromium (48 frames, pivot / anchor correct — first pass had the pivot relative to the trimmed frame, which Phaser read wrongly: fixed to the TexturePacker convention). **Not verifiable here: Unity, Unreal, GameMaker, Construct, GDevelop** — built to their documented formats; to be checked in D2.

### D-086 · Pixel Mode, step C2: stability `[Raul]` — 2026-10-03
- Brief §5.2; Raul approved C2 (snap to the pixel grid + shimmer check).
- **Snap to pixel grid** (`pixel.snap`, on by default): each layer's position is rounded to whole art pixels before drawing (renderer `pixelSnap` = output px per art pixel; grid origin = the frame's top-left, the same grid the downsample uses). Measured: a slowly moving ball made **11 different silhouettes** over its move without snapping, **1** with it. World-space particles undo the layer's snap shift (`snapShift`), so they stay exactly where they were born.
- **Snap particles too** (`pixel.snapParticles`, OFF by default): every element rounded to whole pixels. Measured with the shimmer metric below on Torch / Spirit Flame / Fog Bank / Toxic Cloud at 48 px it made flicker WORSE (+5…60 %): jittery particles hop back and forth across a pixel boundary. Kept as an option for slow, steady particles. Brief said snapping on by default — kept for layers, not for particles, because of this measurement.
- **Shimmer check** (viewport toggle, shown in Pixel Mode): pixels that flicker A → B → A between the drawings before and after (loops wrap; holds respected) in magenta, the rest dimmed; the stats show "shimmer N px". `shimmerMap()` in `src/render/pixel.js`.
- Finding: in organic effects (flames, smoke) most shimmer comes from the shapes' own jitter crossing the alpha cutoff / colour thresholds, not from sub-pixel motion. A possible next step (not built, needs Raul's go): an optional de-flicker filter.

### D-085 · Pixel Mode, step C1 `[Raul]` — 2026-10-02
- Brief §5; plan approved by Raul (C1 now, C2 stability next).
- A post-process on the finished frame (`src/render/pixel.js`), so every effect and preset supports it: area-average down to the target grid (premultiplied colour, separate alpha; exact fractional coverage) → alpha cutoff (only fully solid / fully transparent pixels) → colours snapped to a palette (redmean distance) with optional Bayer 2×2 / 4×4 ordered dithering → stray single pixels removed → 1-px outer or inner outline (colour, or transparent = darkest palette colour).
- Palettes: **Auto** (median cut of the effect's ramps to N colours, lightest + darkest always kept), built-in PICO-8, Sweetie 16, Game Boy, **Imported** Lospec `.hex`, or Keep colours. The palette is fixed per effect (never per frame), so colours don't flicker.
- Settings are `pixel.*` globals: saved with the effect (presets, files, packs reproduce exactly; older files load with Pixel Mode off). The imported palette is stored as a hidden stops list.
- UI: **Pixel ▦** in the top bar (⌥P; P / ⇧P already show Position lanes), a Pixel Mode section in the right panel + palette swatches and **Import .hex…**. The viewport shows the art at its native size with hard pixels at every zoom and a **Pixel grid** toggle (visible once cells are ≥ 5 px). The RAM preview caches the small pixel frames. The Variants grid shows pixel versions.
- Export: with Pixel Mode on, frames render full size, then become pixel art at the native size × a whole-number upscale (export scale 1× / 2× / 3× / 4×, nearest neighbour).
- Note: soft additive glows (e.g. Campfire's ground glow) become solid shapes above the alpha cutoff — raise the cutoff or turn that layer off for pixel versions.

### D-084 · Wild variants + colour variation `[Raul]` — 2026-10-02
- Raul: Variants are "definitely a keeper" for packs; he wanted a more extreme version to explore very different variations, and more colour change — wild can use different ramps.
- **Mode: Subtle / Wild** in the Variants panel. **Wild** (slider = Wildness 0–100 %, default 60 %): each number × between ⅓ and 3 at full wildness (log-uniform, snapped to range / steps); effects that are off (turbulence, spin, flicker, colour variance, trail copies, wobble) may switch on; every distinct ramp is swapped for a random ramp from the library — layers sharing a ramp keep sharing (a flame body and its core change together); 🔒 a layer to keep its colours. Switching to Wild turns Colour on.
- **Subtle + Colour on:** all ramps get one shared hue (±20°) / lightness (±8 %) shift per variation — sister colours that keep the effect's colour relations.
- Still never varied in either mode: timing, positions, directions, Max particles, keyframed settings, locked layers.

### D-083 · Variants panel `[Raul]` — 2026-10-02
- Brief §7.2 / promise 3 ("give me 6 variations of this effect in the same style"); plan approved by Raul.
- **Variants ▦** (top bar, shortcut V): a 3 × 3 grid — the current effect (top left, dashed) and 8 variations, all playing. Click one to use it (one undo step); ↻ More (R) = 8 new ones; Close / Esc changes nothing.
- How a variation is made (`src/effects/variants.js`, `makeVariant`): every layer gets a **new seed key** (layers sharing a key keep sharing; repeated variations replace the suffix, never pile up) — new randomness, same settings. **Variation** slider 0–50 %: number settings are nudged AROUND their current values (value × (1 ± amount), snapped to steps / range), never to absolute random ranges, so the preset's look survives. Never varied: timing (start / stop / pre-warm / pulse), positions, directions, Max particles, anything keyframed, locked layers. **Vary** chips: Shape / Motion / Colour (Colour off by default); per-layer 🔒. Precomp layers are varied too. Deterministic per variant seed.
- Why seed keys rather than the global seed: a variation is then part of the document — it undoes with ⌘Z, saves in files and respects per-layer locks.
- Thumbnails: 168 px, at most 24 frames per tile (frames on twos for long effects), rendered in ~14 ms slices — a poster frame for every tile first, then the rest — while the RAM-preview fill waits. Heavy presets take ~10 s to fill all 9.

### D-082 · Each fire preset has its own look; only the Dancing Flames sway `[Raul]` — 2026-10-02
- Raul: the presets should be variations that look like their names, not the same flame everywhere; the sway keyframes are only for the Dancing Flame.
- Only Dancing Flame / Dancing Flame (pink) keep the sway keys. The rest have **no keys**: their motion comes from loop-safe settings (turbulence, cone, drag, life variance, flicker).
- `flameRig()` gained options: choke (higher = the tip breaks off into wisps), life variance (uneven tongues), scale over life, drag (a fast jet slows and rolls), start, and `core: false`.
- Looks: **Spirit Flame** tall, thin, cold blue, tip breaking into floating wisps; **Campfire** crossed logs, three uneven tongues, crackling ember pops, a soft ground glow, a smoke wisp; **Torch** a handle with one tall narrow flame leaning in a draft, sparks, smoke; **Fireball** a blazing ball with flames streaming back, standing still so the game moves it (the path version is Burning Trail); **Burning Ground** a row of uneven flames on a scorched patch; **Fire Breath** a fast blast that slows and swells into a rolling cone, then smoke and a sputter (timed by emitter start / stop); **Flamethrower** a narrow jet bursting into rolling flame, with a nozzle flare.

### D-081 · Fire & Smoke family, built on Raul's Dancing Flame `[Raul]` — 2026-10-02
- Raul made a **Dancing Flame** preset ("it works great with the goo effect and particles") and asked to use it as the reference for flames.
- His recipe, decoded and kept as `flameRig()` (`src/effects/fire/presets.js`): a sparkle emitter in **world space** (rate 226, rising with negative gravity −215, scale-over-life up then shrinking, opacity soft-in/soft-out, ramp over life) with **Goo** 7.5 / choke 0.21 / keep shapes off, so the particles fuse into one flame body; plus a **copy in Add** (smaller, longer-lived, turbulent) as the hot core. Swaying the emitter left / right makes the gooey body bend and whip, because the particles stay where they were born. In loops the sway keys land exactly on the loop (0, ½, 1), so it is seamless.
- **Fire presets:** Dancing Flame (fire colours), Dancing Flame (Raul, pink — his original), Spirit Flame (blue), Campfire, Torch, Fireball (flies an oval path), Burning Ground, Fire Breath (one-shot). **Particles · Fire:** Flamethrower, Burning Trail (follows a drawn curve), Fire Rain (gooey drops: each drop's trail copies merge into a teardrop).
- **Smoke presets** (anime cel shading, 3 bands, hard highlight): Poof, Steam Vent, Toxic Cloud, Dust Impact, Billowing Smoke. **Particles · Smoke:** Chimney Drift, Smoke Trail, Fog Bank.
- New layer types **Smoke wisp** and **Particles · Wisps** (`src/shapes/wisp.js`): a thin tapering ribbon swaying in an S that travels up it (steam, incense, smoke trails); the sway loops seamlessly.
- Flames set Max particles to 1500: dense flames outgrew the default cap (600), and as the cap keeps only the newest particles, the flame was cut off (Fire Rain showed only its top).
- Presets are snapped to each setting's steps and ranges when built (`snapParams` in the preset kit), so a preset equals its saved file (no warnings when it round-trips).

### D-080 · Resizable panels (dividers) `[Raul]` — 2026-10-02
- Raul: "the interface is not reactive … I want to scale the timeline taller or smaller to see more of the canvas, and the others to the sides" (like After Effects). Dockable panels: later (Raul agreed; worth doing once there are more panels).
- Three dividers: between Layers and the canvas, between the canvas and the right panel, and above the timeline (the layer timeline grows / shrinks; the canvas takes the rest and keeps its Fit / zoom). Drag to resize, **double-click to reset**; a wide grab area for the pen; minimum sizes (canvas ≥ 440 × 200 px) so nothing disappears; a smaller window makes the panels give way. Sizes are remembered with the view settings (D-079). Layout = CSS grid with `--left-w`, `--right-w`, `--ltl-h`; `src/ui/splitters.js`.

### D-079 · View settings are remembered `[Raul]` — 2026-10-02
- Raul: the Half resolution should persist; "everything gets reset when changing presets".
- The viewport's preview resolution, background (incl. custom colour) and overlay toggles (Handles, Bounds, Pivot, Stats) are saved in this browser (`localStorage` key `eldr.viewPrefs`, wrapped in try/catch) and restored on load; preset changes never touch them. They are per-viewer view settings, not part of the effect or its file.

### D-078 · Goo: shapes melt together (metaballs) `[Raul]` — 2026-10-02
- Raul showed his After Effects goo setup (adjustment layer: Fast Box Blur "Goo amount" 14 × 3 iterations → Matte Choker → Glow) and asked for it for viscous water / particles.
- **Goo** (`src/render/goo.js`): blur colour + alpha (three box passes of the Goo amount, like Fast Box Blur with 3 iterations), then threshold the alpha with a soft edge (Choke, Edge softness) — close shapes fuse with a smooth bridge, far ones stay apart. **Keep shape details** (on by default) draws the original shapes on top so cel bands and highlights stay crisp inside the merged outline. Only the area around what is drawn is processed.
- Two ways to use it: the **Goo** group on every sprite layer (an emitter's own particles fuse into liquid), and a **Goo adjustment layer** (＋ Add layer → Goo) that melts everything below it — Raul's AE workflow. Bubbling Brew now uses one.

### D-077 · Real-time preview: RAM-preview cache + preview resolution `[Raul]` — 2026-10-02
- Raul: "the playback lags too much … I often have to export to see it in real time".
- **Cache (like After Effects' RAM preview):** every rendered frame is kept for the exact state, seed, frame size and resolution it came from; playback shows cached frames instantly. While the editor is idle (not playing, not dragging) the missing frames render in the background in small slices, with a second renderer so the frame on screen is never overwritten. The timeline shows a **green bar** under cached frames; any edit starts over. Frames on twos / threes share one drawing. Memory cap ~700 MB. Water Orb (≈ 450 ms / frame) plays at 25 fps once cached.
- **Resolution** menu in the viewport toolbar (Full / Half / Quarter, as in AE): 4× / 16× fewer pixels for faster first renders; exports are always full resolution. The stats show "cached" / "½ res".
- WebGL rendering stays on the roadmap for faster uncached renders.

### D-076 · Water family (anime cel) `[Raul]` — 2026-10-02
- Raul approved the Water plan, chose **anime cel**, and sent references (a bubbling lime-goo cauldron; a stylized spell-book shelf with a water bolt). Liquids follow them: flat light body, a light band along the top, darker organic POCKETS inside (not concentric rings), hard white highlights (an edge streak + dots), a dark ink outline.
- **Building blocks** (`src/shapes/liquid.js`, `src/shapes/ripple.js`): **Liquid** (water / goo mass: size, height / width, stands on its centre or its base so columns grow from the ground, loop-safe boiling edge, drippy **crown** spikes for erupting splashes, pockets, top light, highlights, stretch with speed) as a single layer, a **Liquid burst** (splash drops) and **Particles · Droplets**; **Particles · Bubbles** (hollow cel bubbles, rim, fill 0 = soap → 1 = goo, wobble); **Ripples** (flattened rings: Burst for an impact, Repeat that loops seamlessly). All sprite liquids take PNG textures (D-074). Water ramp `WATER_CEL`.
- **Presets** — Water: Water Splash, Geyser, Ripple Pond (loop), Water Orb (loop, glass orb), Wave Slash, Bubbling Brew (loop, after the cauldron reference); Particles · Water: Rain, Rising Bubbles, Spray Fountain, Waterfall Mist (all loops). Splash / Geyser / Brew sit on a Surface / Ground null to drag them as one. Loops pass the seam test.
- First-pass looks awaiting Raul's direction. 15–60 ms / frame at 512² (Water Orb ≈ 460 ms: masked loop-blended field, like the other orbs).

### D-075 · Two preset menus; wrapping layer buttons `[Raul]` — 2026-10-02
- Raul: the copy / paste buttons were off the edge of the browser; "split the presets into one dropdown for the default presets and one for user presets".
- The layer header actions wrap inside the side panel (checked at 1024 / 1280 / 1440 px wide: no horizontal overflow).
- **Presets** (built-in: Base + Explosions / Lightning / Magic / Particles groups) and **My presets** (saved in this browser) are separate menus; the menu not in use shows a placeholder; Save as my preset selects the new one in My presets; Delete is enabled only for a My preset.

### D-074 · Textures on every sprite layer + copy / paste layer settings `[Raul]` — 2026-10-02
- Raul: "add the PNG / PNG sequence option for all the sprites on the normal presets and the particle presets, and an option to copy settings from one emitter (or particle settings) to another".
- **Texture override:** every sprite layer (singles, bursts, orbits, emitters of every shape — blob, puff, streak, ring, debris, sparkle, crescent, dot) has the Texture panel; importing an image / PNG sequence draws it INSTEAD of the shape, keeping all motion, size, spin, life curves, glow, outline (on the alpha), dissolve and blend. Same playback (loop / once / over life / random) and colour modes (original / tint / brightness → ramp) as Texture particles; non-particles play sequences from the effect's start. The Texture controls appear in the inspector only once a texture is in use. Not for fire fields, bolts and orbs (not sprites). Implemented once in `shapeLayer()` (`src/render/textureSprite.js`); the build injects `tex.asset` for any layer with a texture; files accept `texture` on every texturable type.
- **Copy / Paste settings** (layer header 📋 Copy / 📥 Paste…, ⌘⌥C / ⌘⌥V): copy the active layer; paste onto the selected layer(s) through a dialog with a tick box per settings group (Emitter, Particle motion, Particle life, Trails, Shape, Texture, Colour, Shading, Outline, Dissolve, Glow, Burst, Orbit, Life… + Blend & opacity), only groups both sides share. Values replace the target's; animated settings bring their keyframes; random seeds never travel; the Texture group carries the texture link. One undo step. `src/effects/settingsClipboard.js`.

### D-073 · Orb layer: cel glass spheres `[Raul]` — 2026-10-02
- Raul (reference sheet of glowing crystal-ball orbs): "make the orbs actually look like orbs".
- **Orb layer** (`orb`, ＋ Add layer → Orb (glass sphere); `src/shapes/orb.js`): a cel-shaded glass ball in two parts so contents sit INSIDE it — **Back**: banded tinted glass body (dark centre → lighter edge, fresnel) + a soft floor glow; **Front**: rim light (thin ring + a thicker refracted crescent at the bottom) + specular highlights (an edge crescent toward the light, a round glint, a faint opposite glint). Controls: Part, Radius, Glass tint, Glass bands, Rim, Highlights, Light from, Floor glow; colours from the ramp (0 = brightest … 1 = glass).
- **Recipe** (`glassOrb()` in the preset kit): Back orb, then the contents each with a round mask "Inside the orb", then the Front orb (Screen). Everything stays editable — swap the contents, resize the mask, change the glass ramp.
- **Presets:** Electric Orb (plasma ball: tendril bolts from a white core to the glass), Energy Orb (violet vortex: curling field + flat spiral swooshes), new **Fire Orb** (churning flame + gold crackle in ember glass) and **Nebula Orb** (nebula haze, star dust, twinkles in night-sky glass). All seamless loops.
- Cost: 180–400 ms / frame at 512² (masked loop-blended fields) — slow previews until the WebGL pass.

### D-072 · Lightning targets + draggable tip `[Raul]` — 2026-10-02
- Raul: "it could make more sense if the lightning arcs end on targets — when dragged, the lightning ends follow interactively".
- **Tip handle:** a selected Lightning bolt shows a ◆ handle at its tip (dashed line from its origin). Drag it: the bolt re-aims live; End X / Y take the value (keys where animated). The start is the layer itself (move / parent it as usual).
- **Ends on** (Layer section, bolt layers): pick any layer of the comp as the target — the tip ends on its anchor point every frame, so moving, parenting or animating the target (or a Follow Path on it) drags the bolt; dragging the ◆ then moves the target. "＋ New null at the tip" makes a target null there and links it. Switching target keeps the tip where it is. Deleting the target falls back to the bolt's own End X / Y.
- Pure + per-frame in the build (`src/effects/boltTarget.js`: `aimedParams` after parents / Follow Path); files keep `target` (dropped with a warning if missing).
- Presets: **Chain Arc** now spans two draggable nulls (Point A carries the arcs and one contact, Point B the other contact and is the arcs' target); **Lightning Strike** ends on a **Ground** null that also carries the ring, sparks, smoke and flash.

### D-071 · Seamless-loop tools `[Raul]` — 2026-10-02
- Raul: "is there an option for making loops … I'm going to use this for many loops for animated backgrounds."
- **One-shot / ∞ Seamless loop** are now buttons in the timeline (were a dropdown); the ⟲ preview-repeat button is labelled as playback-only. **⟲ Seam** (loops only) plays the last frames into the first, to check the seam by eye.
- **Everything that evolves with time now loops** in a looping effect (`src/core/loopContext.js`; the renderer sets the loop period per frame): time-boiling noise (blob / puff / ring / crescent edges, cel band edges) and the fire/plasma field are cross-faded between "now" and "one loop ago" (variance-preserving), so frame N−1 flows into frame 0; orbit spin and pulse speeds round to whole cycles per loop (never to a stop). Emitters (D-067) and bolt re-strikes (D-070) already round their schedules. Cost: fields compute twice in loops (Electric/Energy Orb ≈ 2× slower).
- **Loop keys** (Layer section): Off / Cycle / Ping-pong — after the last key the layer's keys repeat, like After Effects loopOut(). Key one cycle (last key = first value) and pick Cycle; also drives emitter trails and Follow Path.
- Test: every looping preset's seam (last → first) is no bigger than its largest frame-to-frame step.

### D-070 · Lightning + Magic families: Bolt layer and presets `[Raul]` — 2026-10-02
- Raul: "add the presets for lightning and magic, for both normal presets and particle presets".
- **Bolt layer** (`bolt`, ＋ Add layer → Lightning bolt; `src/shapes/bolt.js`): jagged (midpoint displacement) branching bolt from the layer origin to End X/Y — or along the layer's own open pen path — drawn as crisp cel bands (halo + hot core) that taper to the tip; Bolts + Spread fan several (360° = radial discharge); **Re-strikes / s** gives a new shape several times a second (loops: whole number per loop), Flicker dims some strikes, Reveal over life grows it in. **Particles · Crackles** (`boltEmitter`): tiny bolts as particles.
- **Presets** (Preset menu, new groups): Lightning — Lightning Strike, Chain Arc (loop), Electric Orb (loop), Thunder Impact; Magic — Arcane Burst, Healing Aura (loop), Energy Orb (loop), Holy Smite; Particles · Lightning — Static Crackle, Electric Sparks, Charged Ring (loops); Particles · Magic — Fairy Trail (null on a drawn path), Healing Rise, Arcane Vortex (loops). Built with the shared preset kit (`src/effects/presetKit.js`, `composedPresets.js`); every layer stays editable. Explosion presets group renamed "Explosions".
- First-pass looks awaiting Raul's direction. Render 30–110 ms/frame at 512² (the plasma-field orbs are the slow ones).

### D-069 · Particle presets (4.Pc) `[Raul]` — 2026-10-02
- Five presets in a new **Particles** group of the Preset menu, each a whole composition built with the normal editing operations (so every emitter, path, null and key is editable): **Embers** (loop: glowing specks + a few streaks rising from a line, flicker, turbulence), **Magic Dust** (loop: motes + twinkling sparkles swirling in a circle, cyan → violet), **Spark Fountain** (one-shot 36 f: a gush of sparks with trails arcing under gravity, a start burst, hot drops), **Smoke Column** (loop: cel-banded puffs rising, swelling, spinning), **Comet** (one-shot 40 f: a null rides a drawn arc via Follow Path with eased progress keys, dragging trail dust + sparks in world space; a local-space head).
- Built in `src/effects/particles/presets.js` (`build()` per preset); `createExplosionFromPreset` / `explosionPreset` look there too. Globals: size 1, impact 0, no flash; layers timed "free".
- Values are a first pass, awaiting Raul's look direction and sign-off. Render time 30–50 ms / frame at 512².

### D-068 · Texture particles: your own image / PNG sequence (4.Pb2) `[Raul]` — 2026-10-02
- Raul: "add a texture for the particles … import PNG sequences as animated particle textures, like Particular does."
- New layer **Particles · Texture** (`textureEmitter`): the full emitter (D-067) drawing an imported image per particle. **Texture panel:** 🖼 Import image / PNG sequence… (pick one file, or every frame at once — sorted by file name in natural order, f2 before f10), Replace, ✕ Remove, and "Use another texture…" to reuse one already in the project. Without a texture it draws a soft round sprite.
- **Sequence playback** per particle: Loop at fps (+ Random start frame), Play once and hold, Stretch over the particle's life, Random still frame. **Colour:** Original, Tint by the ramp over life (multiply), Brightness → ramp (a per-sprite gradient map; Spread and Bands apply). **Texture size** (longest side) and **Texture angle**. Glow, outline, dissolve, blend modes and everything from the emitter work; cel-shading controls are left out (they don't apply to images).
- **Storage:** imported frames are scaled to ≤ 512 px and kept as PNG data URLs in the document's `assets` (by id); layers point at one with `texture`. Files save only the textures some layer uses; loading accepts PNG / JPEG / WebP data URLs only, and drops a texture link with a warning if its asset is missing. File format stays v4 (optional fields). Large sequences can be too big for "My presets" browser storage — the message then points to Save file.
- **Rendering:** decoded frames live in a registry (`src/render/textures.js`); the editor decodes assets once and redraws; recoloured frames are cached per frame × 32 colour steps. Limits: 300 frames per sequence.
- Also fixed: the first pulse of a pulsed emitter could be dropped (jitter could put it before Start).

### D-067 · Particle emitter (4.Pb) `[Raul]` — 2026-10-02
- **Emitter layers** (＋ Add layer → Particles group): Dots (new soft dot shape), Sparks, Sparkles, Smoke puffs, Blobs, Debris, Swooshes — every existing shape as a particle, all with the usual look / glow / outline / ramp controls.
- **Spawn:** Rate (per second) or **Pulses** (N particles every X s), Start / Stop, **Pre-warm** (frame 0 already full), **Max particles** cap (newest kept; trail copies don't count). Shapes: point, line, circle, ring, box, **along path** (the emitter layer's own first OPEN pen path).
- **World space by default:** each particle is born where the emitter WAS at its birth and then flies on its own, so an emitter parented to an animated null or riding Follow Path leaves a trail. **Move with emitter** (`emit.local`) keeps everything in the layer's space instead. **Inherit velocity %** adds the emitter's own speed at birth.
- **Motion / life:** direction (0 = up) + cone, outward, speed ± variance, drag, gravity (negative = rises), turbulence (noise), align to velocity, random rotation, spin; life ± variance, size ± variance, scale / opacity over life curves, flicker, colour variance (ramp shift). **Trails:** copies behind each particle (count, spacing, fade, shrink).
- **Loops:** with a looping comp the schedule is rounded to a whole number of particles per loop and particle ids wrap, so the last frame flows into the first (tested: render at t = period equals t = 0). Pure random access stays: every particle is computed from (seed, id) in a fixed draw order.
- **How:** the build gives emitter layers `matrixAt(seconds)` — the layer's world matrix at any moment (keys, parents and Follow Path resolved), sampled on a 1/240 s grid and blended, cached per layer list. The element layer undoes the layer's current transform for world-space particles. Viewport: the active emitter's spawn shape (dotted) and direction arrow.
- Defaults are provisional; look tuning and presets are 4.Pc.

### D-066 · Follow Path, Path layer, open pen paths (4.Pa) `[Raul]` — 2026-10-02
- Raul: emitters must work as children of an animated null, and "now that we have a pen tool, add follow path so I can animate a layer — and particle emitters — along a drawn path". Particles plan updated (4.Pa follow path → 4.Pb emitter → 4.Pc presets).
- **Open pen paths:** Enter finishes an OPEN path (2+ points); clicking the first point still closes it. Open paths (`closed: false`) never cut a layer — they are motion paths (as in AE).
- **Path layer** (`guide`, ＋ Add layer → Path): holds pen paths, never rendered; its panel is "Paths" with ✒ Draw path; its paths move with its transform / parent. Not offered as a matte source.
- **Follow Path** on any layer (Transform → Follow path): Path (any pen path on another layer of the comp, Path layers listed first), **Progress %** and **Offset %** (keyframable — lanes, Graph Editor, F9 work), **Auto-orient**, **Even speed** (arc length; off = equal time per segment), **Loop**. The follower's anchor sits on the path; position (and rotation with auto-orient) is computed in its parent's space, so parented followers and moving path layers work; chains resolve parents-first. `applyFollow()` runs before the world matrices in the renderer build AND the editor handles, so what you see is what renders. With Follow on, Position is driven by the path (Anchor / Scale / Rotation still add).
- Viewport: the active layer's motion path is drawn dashed with a dot at its current place. Layer panel tag ➰ path.
- Files: `follow` (layer) and `closed` (mask) optional fields; a follow pointing at a missing path is removed with a warning.

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
| gifenc | runtime | animated GIF export (D-046); small, fast, no dependencies | MIT |
| fflate | runtime | zip for PNG-sequence export (D-051); tiny, no dependencies | MIT |
| mediabunny | runtime | MP4 muxing + WebCodecs encoding (D-051); lazy-loaded | MPL-2.0 |
