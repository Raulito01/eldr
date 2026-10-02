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
