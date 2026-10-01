# CHANGELOG

User-facing changes per version.

## 0.0.3 — 2026-10-01
- Parameter schema system: declare a parameter once and get its control, validation, save/load, variant randomization and docs automatically.
- Auto-generated inspector: grouped, collapsible sliders, toggles, dropdowns, colour pickers (with alpha via hex), seed + dice, ramp and curve previews, per-parameter reset.
- New test page: `/test-pages/inspector.html` (live preview, variants, JSON save/load with "what was fixed" warnings, generated docs).

## 0.0.2 — 2026-10-01
- Core building blocks: seeded random numbers, seed hashing, simplex noise (2D/3D/4D), 27 easing curves + custom bezier curves, math helpers.
- New test page: `/test-pages/core.html` (noise with seamless 4D loop and fps selector, easing gallery, random histogram).

## 0.0.1 — 2026-10-01
- Project scaffold: ELDR opens in the browser with a placeholder viewport.
- Dev commands: `npm run dev`, `npm test`, `npm run lint`, `npm run format`, `npm run build`.
