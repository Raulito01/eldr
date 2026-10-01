# PROGRESS

## Current position
- **Phase 1 — Renderer, timeline, viewport**
- **Step 1.1 — Renderer + compositor:** in progress
- Phase 0 closed 2026-10-01 (git tag `phase-0`)

## Completed steps
| Step | Name | Date | Notes |
|---|---|---|---|
| 0.1 | Project scaffold | 2026-10-01 | Vite + Vitest + Biome, folder structure, docs files. Approved. |
| 0.2 | Core utilities | 2026-10-01 | sfc32 PRNG, hashing/subSeed, simplex 2D/3D/4D, easings + cubicBezier, math. 61 tests. Test page `test-pages/core.html`; fps selector added after review. Approved. |
| 0.3 | Schema system | 2026-10-01 | 8 param types, defineSchema validation, sanitize, randomize (per-param sub-seeds, locks), save/load, docs generator, auto-built inspector + widgets. 101 tests. Test page `test-pages/inspector.html`. Approved. |

## Open decisions
- None.

## Known bugs
- None.

## Notes for upcoming steps
- **1.4 (browser tests):** Claude's cloud workspace can't download Playwright's Chromium (host blocked). Options: run Playwright determinism/golden tests on Raul's Mac (`npx playwright install chromium` works there), and/or use `@napi-rs/canvas` (installs from npm) so Claude can render and check frames in Node. Decide in 1.4.

## Ideas / later
- Later effect families: lightning, slash/sword smear, water splash, portal, aura (loop), muzzle flash, projectile trails, coin pickup sparkle.
- Inspector: per-parameter lock icons for variants (API already supports `locked`; UI in 8.1).
- Stretch: auto-generated Godot `SpriteFrames.tres` and Unity import script (Phase 9.3).
