# PROGRESS

## Current position
- **Phase 1 — Renderer, timeline, viewport**
- **Step 1.1 — Renderer + compositor:** done, awaiting Raul's 🚦 approval
- Next: 1.2 — Viewport (backgrounds, zoom, bounds + pivot overlay, ms/frame debug overlay)
- Phase 0 closed 2026-10-01

## Completed steps
| Step | Name | Date | Notes |
|---|---|---|---|
| 0.1 | Project scaffold | 2026-10-01 | Vite + Vitest + Biome, folder structure, docs files. Approved. |
| 0.2 | Core utilities | 2026-10-01 | sfc32 PRNG, hashing/subSeed, simplex 2D/3D/4D, easings + cubicBezier, math. 61 tests. Test page `test-pages/core.html`; fps selector added after review. Approved. |
| 0.3 | Schema system | 2026-10-01 | 8 param types, defineSchema validation, sanitize, randomize (per-param sub-seeds, locks), save/load, docs generator, auto-built inspector + widgets. 101 tests. Test page `test-pages/inspector.html`. Approved. |
| 1.1 | Renderer + compositor | 2026-10-01 | renderFrame (pure, random-access), per-layer surfaces, normal/add/screen + opacity, pivot + scale, background behind effect, timing.js. Pixel tests via @napi-rs/canvas. 120 tests. Test page `test-pages/renderer.html`. Pending approval. |

## Phase milestones
| Phase | Closed | Commit |
|---|---|---|
| 0 — Setup & foundations | 2026-10-01 | `53cfe16` |

## Open decisions
- None.

## Known bugs
- None.

## Notes for upcoming steps
- **1.4 (browser tests):** pixel tests now run in Node via `@napi-rs/canvas` (D-018), so determinism and golden tests work in Claude's workspace too. Still to decide in 1.4: whether to also run them in a real browser (Playwright) on Raul's Mac.

## Ideas / later
- Later effect families: lightning, slash/sword smear, water splash, portal, aura (loop), muzzle flash, projectile trails, coin pickup sparkle.
- Inspector: per-parameter lock icons for variants (API already supports `locked`; UI in 8.1).
- Stretch: auto-generated Godot `SpriteFrames.tres` and Unity import script (Phase 9.3).
