# PROGRESS

## Current position
- **Phase 2 — Style system**
- **Step 2.1 — Colour ramps + ramp editor + heat mapping:** done, awaiting Raul's 🚦 approval + default fire ramp pick (A/B/C)
- Next: 2.2 — Cel banding (N hard bands, edge noise) — Raul picks the default look
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
| 2.1 | Colour ramps + editor + heat mapping | 2026-10-01 | color.js (hex ↔ RGBA, alpha), ramp sampling, style params (ramp, ramp over life, core→edge spread) via exact radial gradients, ramp editor widget (drag/add/remove/edit stops), `dom.js` split out. 185 tests. Default fire ramp: 3 options rendered for Raul. Fix after review: curve box was squeezed by a stale CSS rule (points drawn outside it) + bigger, padded, grab-nearest handles in both editors. 189 tests. Pending approval. |

## Phase milestones
| Phase | Closed | Commit |
|---|---|---|
| 0 — Setup & foundations | 2026-10-01 | `53cfe16` |
| 1 — Renderer, timeline, viewport | 2026-10-01 | `a763e3e` |

## Open decisions
- **Default fire ramp [Raul]:** A Classic cartoon / B Anime hot (violet shadows) / C Warm muted — see eldr-2.1-ramp-options.png. A is the placeholder until picked.
- Creative defaults to set when convenient [Raul]: blob default colour/size/noise, default scale & opacity curves, default phase markers (0.2 / 0.6). All are placeholders.

## Known bugs
- None.

## Notes for upcoming steps
- **1.4 (browser tests):** pixel tests now run in Node via `@napi-rs/canvas` (D-018), so determinism and golden tests work in Claude's workspace too. Still to decide in 1.4: whether to also run them in a real browser (Playwright) on Raul's Mac.

## Ideas / later
- Later effect families: lightning, slash/sword smear, water splash, portal, aura (loop), muzzle flash, projectile trails, coin pickup sparkle.
- Viewport: background swatch colours and the scroll-to-pan vs scroll-to-zoom choice are provisional; revisit with Raul's UI style pass. Onion skin arrives with the timeline; pixel grid with Pixel Mode.
- Golden-image tests (brief §8.1) start with the first presets in Phase 3; determinism check already covers every layer type.
- Timeline: onion skin (prev/next frame ghosts) — listed in brief §7.2; add when real shapes exist (1.4+) so it can be judged on effect art.
- Inspector: per-parameter lock icons for variants (API already supports `locked`; UI in 8.1).
- Stretch: auto-generated Godot `SpriteFrames.tres` and Unity import script (Phase 9.3).
