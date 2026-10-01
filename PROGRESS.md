# PROGRESS

## Current position
- **Phase 0 — Setup & foundations**
- **Step 0.2 — Core utilities:** done, awaiting Raul's 🚦 approval
- Next: 0.3 — Schema system (parameter types, validation, defaults, randomize) + auto-generated inspector demo page

## Completed steps
| Step | Name | Date | Notes |
|---|---|---|---|
| 0.1 | Project scaffold | 2026-10-01 | Vite + Vitest + Biome, folder structure, docs files. Approved. |
| 0.2 | Core utilities | 2026-10-01 | sfc32 PRNG, hashing/subSeed, simplex 2D/3D/4D, easings + cubicBezier, math. 61 tests. Test page `test-pages/core.html`. Pending approval. |

## Open decisions
- None.

## Known bugs
- None.

## Notes for upcoming steps
- **1.4 (browser tests):** Claude's cloud workspace can't download Playwright's Chromium (host blocked). Options: run Playwright determinism/golden tests on Raul's Mac (`npx playwright install chromium` works there), and/or use `@napi-rs/canvas` (installs from npm) so Claude can render and check frames in Node. Decide in 1.4.

## Ideas / later
- Later effect families: lightning, slash/sword smear, water splash, portal, aura (loop), muzzle flash, projectile trails, coin pickup sparkle.
- Stretch: auto-generated Godot `SpriteFrames.tres` and Unity import script (Phase 9.3).
