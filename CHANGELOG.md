# CHANGELOG

User-facing changes per version.

## 0.0.8 — 2026-10-01
- Colour ramps: elements take their colour from a ramp (with transparency support) instead of a flat colour.
- Ramp over life: elements travel along the ramp as they age (start hot, cool down).
- Core → edge: the centre sits earlier on the ramp than the edge, for hot cores.
- Ramp editor: drag stops, click to edit colour/position, double-click the bar to add, ✕ to remove.

## 0.0.7 — 2026-10-01
- First real shape: the blob — a noise-edged, optionally lobed circle whose edge can boil over time.
- Single element: life window, position, rotation, scale, and scale/opacity curves over its life.
- Curve editor: drag points, double-click to add or remove.
- Blob playground (`/test-pages/blob.html`): viewport + timeline + inspector together, with seed and Variant buttons.
- Determinism check page (`/test-pages/determinism.html`).

## 0.0.6 — 2026-10-01
- Holds: animate on ones, twos or threes — frames inside a hold show the exact same drawing.
- Timeline: play/pause, step (← →), first frame, loop preview, Space to play; click or drag to scrub.
- Frame cells grouped by hold; anticipation / action / decay bands with an impact marker.
- Controls for fps (12/15/24/30/60), frame count and one-shot vs loop.
- New test page: `/test-pages/timeline.html`.

## 0.0.5 — 2026-10-01
- Viewport: checker / dark / light / custom backgrounds, zoom (Fit and 12.5–3200%, pinch or ⌘-scroll around the cursor), pan by scrolling or dragging, double-click to fit.
- Zoomed in, frames show exact sprite pixels; sharp on Retina screens.
- Overlays: frame bounds, pivot marker, stats (render time, fps, zoom, frame size).
- New test page: `/test-pages/viewport.html`.

## 0.0.4 — 2026-10-01
- Renderer: any frame of an effect can be drawn on its own, always identically for the same seed.
- Layers stack with blend modes normal / add / screen and per-layer opacity.
- Backgrounds sit behind the finished effect, so the preview matches how the sprite will look in a game engine.
- New test page: `/test-pages/renderer.html`.

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
