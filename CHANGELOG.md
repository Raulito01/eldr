# CHANGELOG

User-facing changes per version.

## 0.0.13 — 2026-10-01
- Burst motion: many elements flying out with direction and cone, speed, drag, gravity and buoyancy, life, size variance, spin, or aligned to their motion.
- Sparks stretch with speed and shrink as they slow down.
- New layer types: Puff burst, Streak burst (sparks), Debris burst, Blob burst.
- Ramp preset menu in the ramp editor: Fire, Smoke, Sparks, Debris.
- Playground: frame size choice (default 512×512); previews now start on ones at 100% zoom.

## 0.0.12 — 2026-10-01
- New shapes: Puff (cartoon smoke/fire ball), Streak (spark), Ring (shockwave, closed or broken into arcs), Debris (spinning chunk). All support ramps, cel bands, shading and outline.
- Layer playground (`/test-pages/playground.html`): choose any shape from a dropdown and edit it live.

## 0.0.11 — 2026-10-01
- Outline: outer, inner, or both; thickness in px; colour = the fill darkened (follows bands and shading) or a custom colour.
- Outlines are perfectly round at any thickness, anti-aliased, and fade with the layer.
- Changed: nothing is masked by the element's silhouette any more. The shadow is now a darker copy behind the element, sticking out on the side away from the light; the element itself is always drawn whole; the highlight sits freely on top.

## 0.0.10 — 2026-10-01
- Toon shading: shadow crescent on the side away from the light, optional highlight on the lit side, both inside the element's silhouette.
- Light direction is fixed in the world, so rotated elements are still lit from the same side.
- New Shading group: Light from, Shadow depth, Shadow offset, Highlight, Highlight size, Highlight offset.

## 0.0.9 — 2026-10-01
- Cel bands: the toon look. 1–6 hard colour bands that follow the element's shape (0 = smooth gradient).
- Band edge noise: hand-drawn wobble on inner band edges, boiling with the animation.
- Snap to ramp stops: bands use exact ramp colours for a strict toon palette.

## 0.0.8 — 2026-10-01
- Colour ramps: elements take their colour from a ramp (with transparency support) instead of a flat colour.
- Ramp over life: elements travel along the ramp as they age (start hot, cool down).
- Core → edge: the centre sits earlier on the ramp than the edge, for hot cores.
- Ramp editor: drag stops, click to edit colour/position, double-click the bar to add, ✕ to remove.
- Fixed: curve points were drawn partly outside the curve box, and ramp/curve handles were small and hard to grab. Editors now have padding and bigger handles, and clicking near a point or stop grabs it.
- Pen tablets (Wacom etc.): taps no longer nudge points, double-tap is pen-friendly, the pen's side button (right-click) removes curve points and ramp stops, and grabbed points no longer jump to the pen tip. Applies to curve and ramp editors, viewport and timeline.
- Fixed: sliders couldn't be dragged with a Wacom pen (only tapped). All sliders are now ELDR's own: press anywhere and drag, Shift-drag for 10× finer control, arrow keys to step.
- Fixed: inspector controls could spill past the right edge of the window. Ramp and curve editors now get a full-width row; all panels keep controls clear of the edges.

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
