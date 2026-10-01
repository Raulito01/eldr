# PROGRESS

## Current position
- **Phase 3 — Explosion (validation milestone)**
- **Style target set [Raul] (D-039):** match Raul's reference effects procedurally. Step 3.4 split into building blocks, easiest first.
- **Step 3.4c — Dissolve:** approved
- **Next: STEP 3.4d — hook/crescent shape + orbit motion** (not started), then 3.4d hook/crescent shape + orbit motion → 3.4e retune presets → 3.5 export → VALIDATION CHECKPOINT
- Phase 0 closed 2026-10-01

## Completed steps
| Step | Name | Date | Notes |
|---|---|---|---|
| 0.1 | Project scaffold | 2026-10-01 | Vite + Vitest + Biome, folder structure, docs files. Approved. |
| 0.2 | Core utilities | 2026-10-01 | sfc32 PRNG, hashing/subSeed, simplex 2D/3D/4D, easings + cubicBezier, math. 61 tests. Test page `test-pages/core.html`; fps selector added after review. Approved. |
| 0.3 | Schema system | 2026-10-01 | 8 param types, defineSchema validation, sanitize, randomize (per-param sub-seeds, locks), save/load, docs generator, auto-built inspector + widgets. 101 tests. Test page `test-pages/inspector.html`. Approved. |
| 1.1 | Renderer + compositor | 2026-10-01 | renderFrame (pure, random-access), per-layer surfaces, normal/add/screen + opacity, pivot + scale, background behind effect, timing.js. Pixel tests via @napi-rs/canvas. 120 tests. Test page `test-pages/renderer.html`. Approved. |
| 1.2 | Viewport | 2026-10-01 | Backgrounds (checker/dark/light/custom), zoom Fit + 12.5–3200% (pinch / ⌘-scroll around cursor), pan, double-click fit, crisp pixels when zoomed in, bounds/pivot/stats overlays, Retina-sharp. Paint split out and pixel-tested in Node. 131 tests. Test page `test-pages/viewport.html`. Approved. |
| 1.3 | Timeline | 2026-10-01 | Holds ones/twos/threes (layers get the held frame → identical pixels inside a hold), phases (impact/decay markers), time-based playback, transport + ←/→/Space/Home, scrubber grouped by holds, phase bands, fps/frame count/one-shot-loop controls. 150 tests. Test page `test-pages/timeline.html`. Approved. |
| 1.4 | First shape: blob | 2026-10-01 | Monotone-cubic curves, blob shape (noise edge, lobes, wobble), `single` element (life window, transform, scale/opacity curves), element+shape layer factory, layer-type registry, curve editor widget, determinism checker (Node test + browser page), blob playground. ~0.6 ms/frame at 256². 174 tests. Approved. |
| 2.1 | Colour ramps + editor + heat mapping | 2026-10-01 | color.js (hex ↔ RGBA, alpha), ramp sampling, style params (ramp, ramp over life, core→edge spread) via exact radial gradients, ramp editor widget (drag/add/remove/edit stops), `dom.js` split out. 185 tests. Default fire ramp: 3 options rendered for Raul. Fix after review: curve box was squeezed by a stale CSS rule (points drawn outside it) + bigger, padded, grab-nearest handles in both editors; inspector no longer spills past the right edge (UI edge rule D-027); pen-tablet-friendly input for editors/viewport/timeline (D-028); own slider replaces native range (pen couldn't drag it). 202 tests. Approved (fire ramp pick still open; A placeholder). |
| 2.2 | Cel banding | 2026-10-01 | celshade.js: N hard bands as nested copies of the element outline, per-band seeded edge wobble (boils with time), optional snap to ramp stop colours; `paintStyled` used by blob. 210 tests. 3 band looks rendered for Raul. Approved (look pick open; placeholder kept). |
| 2.3 | Toon shading | 2026-10-01 | shading.js params (light direction, shadow depth/offset, highlight amount/size/offset), world-fixed light vector, shadow = darker fill + lit fill shifted toward light, highlight = smaller hotter copy, all clipped to silhouette; works with bands and smooth. 217 tests. 3 shading looks rendered. Approved (look pick open). |
| 2.4 | Outline | 2026-10-01 | outline.js: exact Euclidean distance transform with nearest-pixel tracking; outer/inner/both, thickness in effect px (× render scale), darken-fill or custom colour, AA by distance, fades with the layer; runs as a layer post-process limited to the shape's bounds (~3 ms/layer at 256²). Changed after review [Raul]: nothing masked by the silhouette — shadow is a darker copy behind the element, offset away from the light; highlight unclipped on top (D-032). 231 tests. 3 outline looks rendered. Approved. |
| 3.1 | Explosion shapes | 2026-10-01 | puff (bump cluster, one nested banded union), streak (spindle, tapered tail, polygon), ring (annulus/arcs with pointed ends, noise distortion, thickness over life, own painter: bands across thickness), debris (irregular polygon, spin over life); style painter handles multi-part shapes; shared trace helpers; layer playground with shape selector. 247 tests. Approved. |
| 3.2 | Burst motion | 2026-10-01 | burst.js: closed-form linear-drag + gravity/buoyancy motion (any frame directly), per-element sub-seeds, spawn start/window/radius, direction + cone, speed/life/size variance, random rotation, spin, align-to-velocity, scale/opacity over life; streak stretch with speed; pluggable elements; burst layers for blob/puff/streak/debris. After review [Raul]: ramp preset menu (smoke etc.), 512 frame default + size choice, start on ones at 100% zoom (D-035); slider ranges doubled (D-036). 267 tests. Approved. |
| 3.3 | Explosion layer stack | 2026-10-01 | effects/explosion: globals (size, impact time, flash frames, anticipation), 7-layer stack (smoke, shockwave, fireball, debris, sparks, anticipation glow, impact flash), impact-anchored build (moving the impact moves everything; flash = exact N frames), explosion editor page with layer list. ~25 ms/frame avg at 512² in Node. 275 tests. Approved. |
| 3.4 | Presets (in progress) | 2026-10-01 | presets.js: presets as deltas on the base stack (D-038); Cartoon Pop, Anime Blast, Small Hit, Big Boom first pass; preset picker in the explosion editor. 281 tests. Paused: building blocks first (D-039). |
| 3.4a | Glow + sparkles | 2026-10-01 | glow.js: any layer glows (additive, wide + core halo, tint; ctx.filter blur with downscale fallback) wired into the renderer (D-040); sparkle shape (concave 4+-point star, long/short spikes); sparkle + sparkle-burst (twinkles) layer types. 290 tests. 3 glow looks rendered. Approved (glow look pick open). |
| 3.4b | Field layer | 2026-10-01 | field.js: per-pixel noise-field fire (flame / ball forms; swirl, swirl size, rise speed, tear-off + over life, inner swirls, cooling) with hard anti-aliased colour bands from the ramp; 2-px grid + interpolation; `fieldFire` layer type with outline + glow (D-041). Fixed phantom-line bug (regression test). ~60 ms/frame at 512². After review [Raul]: flow-shape controls (S-bend, lean, curl), flow per second + frame cap 128 → 600 (D-042). 299 tests. Approved. |
| 3.4c | Dissolve | 2026-10-01 | dissolve.js: curls / shards / holes over effect time, AA edges, burn edge (px width + colour); post-process chain dissolve → outline; post-processes get t, seconds, seed, pivot (D-043). 305 tests. Approved. |

## Phase milestones
| Phase | Closed | Commit |
|---|---|---|
| 0 — Setup & foundations | 2026-10-01 | `53cfe16` |
| 1 — Renderer, timeline, viewport | 2026-10-01 | `a763e3e` |
| 2 — Style system | 2026-10-01 | `97f3675` |

## Open decisions
- **Default fire ramp [Raul]:** A Classic cartoon / B Anime hot (violet shadows) / C Warm muted — see eldr-2.1-ramp-options.png. A is the placeholder until picked.
- **Default outline look [Raul]:** A thin darkened outer / B bold cartoon ink / C inner + outer — see eldr-2.4-outline-options.png. Current default: off.
- **Default shading look [Raul]:** A Subtle shadow rim (current) / B Shadow rim + highlight / C Strong — see eldr-2.4-unmasked-shading.png (replaces the 2.3 sheet).
- **Default cel-band look [Raul]:** A Clean cel (3 bands, crisp) / B Toon palette (4 bands, light wobble, snapped) / C Loose hand-drawn (3 bands, strong wobble) — see eldr-2.2-band-options.png. Current default: 3 bands, wobble 0.25, no snap (between A and C).
- Creative defaults to set when convenient [Raul]: blob default colour/size/noise, default scale & opacity curves, default phase markers (0.2 / 0.6). All are placeholders.

- **Default glow look for the explosion [Raul]:** A subtle / B strong / C wide & dreamy — see eldr-3.4a-glow-sparkles.png. Explosion layers have no glow until picked.

## Known bugs
- None.

## Notes for upcoming steps
- **1.4 (browser tests):** pixel tests now run in Node via `@napi-rs/canvas` (D-018), so determinism and golden tests work in Claude's workspace too. Still to decide in 1.4: whether to also run them in a real browser (Playwright) on Raul's Mac.

## Ideas / later
- From the references (D-039), not yet planned in a step: inverted hit frames (black shapes on white for 1–2 frames), horizontal lens streak, thin lightning crackle tendrils, white specular dots on fire blobs, colour pulse over a loop, ground-bounce embers. Most belong to Magic (Phase 7) or lightning/slash families.
- Later effect families: lightning, slash/sword smear, water splash, portal, aura (loop), muzzle flash, projectile trails, coin pickup sparkle.
- Viewport: background swatch colours and the scroll-to-pan vs scroll-to-zoom choice are provisional; revisit with Raul's UI style pass. Onion skin arrives with the timeline; pixel grid with Pixel Mode.
- Cel bands: bands are concentric copies of the outline; an offset/asymmetric core (light-facing) comes with toon shading in 2.3. Band edge noise frequency is fixed (1.8) — could become a parameter if needed.
- Performance: full default explosion ~25 ms/frame average, ~47 ms worst frame at 512² (Node). OK for preview now; caching puff geometry and per-layer bounds are the first optimisations (10.1, or earlier if the preview stutters).
- Performance: a frame with a puff burst (8 puffs × bumps, styled) is ~5–9 ms at 256² in Node; explosion stacks will need watching (10.1). Puff geometry could be cached per (params, seed, t).
- Performance: outline costs ~3 ms per outlined layer at 256², ~7–9 ms at 512² (bounds-limited distance transform in JS). Revisit in 10.1 (e.g. one combined pass, worker, or WebGL) if multi-layer effects get slow.
- Outline strength is per layer (alpha-based); per-instance opacity differences inside one layer (bursts) may need per-instance handling later.
- Golden-image tests (brief §8.1) start with the first presets in Phase 3; determinism check already covers every layer type.
- Timeline: onion skin (prev/next frame ghosts) — listed in brief §7.2; add when real shapes exist (1.4+) so it can be judged on effect art.
- Inspector: per-parameter lock icons for variants (API already supports `locked`; UI in 8.1).
- Stretch: auto-generated Godot `SpriteFrames.tres` and Unity import script (Phase 9.3).
