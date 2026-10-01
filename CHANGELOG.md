# CHANGELOG

User-facing changes per version.

## 0.0.24 — 2026-10-01
- **Export** (explosion editor and playground → "Export…"): animated **GIF** and/or **sprite sheet** (PNG + JSON frame list readable by Phaser, Pixi, Godot importers, TexturePacker/Aseprite-style tools). Options: file name, 1× or 2× size, transparent or colour background, trim empty space, sheet columns. Holds are stored once (GIF: one longer frame; sheet: one cell shared by the held frames). Shows progress.
- **Save your work** in the explosion editor:
  - "Save as my preset…" adds the current explosion to a **My presets** group in the preset menu (kept in this browser); "Delete" removes it.
  - "Save file…" downloads it as a `.eldr.json` file; "Open file…" loads one back. Files from other versions open safely; anything that had to be fixed is listed.
- Anime Blast made a little smaller (size 1.15, twinkles closer) so it fits the 512 frame instead of being cut at the top.

## 0.0.23 — 2026-10-01
- **Anime Blast rebuilt from a frame-by-frame study of the dome reference:** a flat white mass with a blue halo swells and rises, hot blobs are flung up and out and shrink to beads, the mass burns into a gold lattice of curls, short gold hooks drift up, long thin twinkles throughout. No ring, smoke or rocks.
- Explosion stack: the Fire core now sits BEHIND the fireball blobs (as in the reference).

## 0.0.22 — 2026-10-01
- Presets, second pass toward the dome-explosion reference:
  - Anime Blast: few big glowing blobs in yellow-orange-red (no more pink/violet), white specular dots, a white core with a blue rim, round dome flash (no star), burns down into thin WHITE curls, then bright sparks and twinkles; no grey smoke or rocks.
  - Big Boom: same blob colours, specular dots and white curls, plus wisps and twinkles; keeps its smoke and debris.
  - Small Hit: same colours and specular dots; breaks into shards with white edges; blue-rimmed core.
  - Cartoon Pop unchanged.

## 0.0.21 — 2026-10-01
- Explosion: 3 new optional layers — **Fire core** (swirling banded fireball core), **Curl wisps** (hooked crescents tearing off and curling away) and **Twinkles**. Off in the base stack; presets switch them on.
- All 4 presets retuned toward the reference look (first pass): 30 fps on ones, glow on the hot layers, and the fireball and smoke now **burn away** (curls, shards or holes) instead of fading.
  - Cartoon Pop: breaks up into round holes, ink-outlined twinkles.
  - Anime Blast: the dome explosion — white-hot swirling core, strong glow, curls with a hot edge, wisps, twinkles.
  - Small Hit: hot core, glowing needle sparks, breaks into shards.
  - Big Boom: huge swirling core, curls, wisps, smoke that breaks apart.

## 0.0.20 — 2026-10-01
- New shape: **Crescent** — a tapered swoosh along an arc with sharp tips. Controls: Radius, Sweep, Thickness (+ over life), Head / tail (fat head with a long thin tail), Tip sharpness, Hook (curl the head in or out), Hot edge (push the hot colour bands to one edge), Edge wobble, Reverse direction, and **Reveal over life** (draw the swoosh on from tail to head, for slashes).
- New motion: **Orbit** — elements circling a centre, with Count, Radius, Spin speed (turns per second), Spread, Spacing jitter, Radius pulse, and **perspective**: Tilt, Plane angle, Depth size / fade / darken (the far side is smaller, fainter and darker).
- Orbits can pass **behind and in front** of another layer: set Show to "Back half" on one orbit layer and "Front half" on a copy with the same seed, and put the core between them.
- Crescent orbits can **follow the path**: each swoosh bends along the tilted orbit.
- New layer types: Crescent, Crescent burst, Orbit crescents, Orbit sparkles.

## 0.0.19 — 2026-10-01
- Dissolve on every layer: break apart over time into **Curls** (thin swirling filaments), **Shards** (sharp angular pieces) or **Holes**. Controls: Dissolve over time (curve), Piece size, Boil, Burn edge (width + colour). The outline traces the pieces.

## 0.0.18 — 2026-10-01
- Field fire: new **Flow shape** controls to art-direct the curves — S-bend (amount, waves, travel), Lean, and Curl (twist into a hook: strength and direction, position, size).
- Fixed: long previews played in slow motion. Field fire now flows per second, so a longer timeline just shows more of it.
- Fixed: frame count was silently capped at 128; now up to 600 frames.

## 0.0.17 — 2026-10-01
- New layer type: Field fire — swirling, banded toon fire drawn from a noise field. Two forms: Flame (rises from its base) and Ball (fireball).
- Controls: Swirl, Swirl size, Rise speed, Tear-off (+ over life, to burn a shape away), Inner swirls, Cooling; colour bands from the ramp; works with outline and glow.

## 0.0.16 — 2026-10-01
- Glow on every layer: soft additive light with a wide halo and a tight core halo, glow radius, and optional glow colour.
- New shape: Sparkle — a twinkle star with concave sides, 3–12 spikes, thinness and long/short spikes.
- New layer types: Sparkle, Sparkle burst (twinkles popping up around the effect).

## 0.0.15 — 2026-10-01
- 4 explosion presets (first pass): Cartoon Pop, Anime Blast, Small Hit, Big Boom.
- Preset picker in the explosion editor; Reset reloads the chosen preset.

## 0.0.14 — 2026-10-01
- 💥 The Explosion: anticipation glow, impact flash, fireball, shockwave, sparks, debris and smoke, all timed around the impact.
- Global controls: Size, Impact time (moves the whole explosion), Flash frames, Anticipation on/off.
- Explosion editor (`/test-pages/explosion.html`): layer list with show/hide and blend modes; click a layer to edit it.

## 0.0.13 — 2026-10-01
- Burst motion: many elements flying out with direction and cone, speed, drag, gravity and buoyancy, life, size variance, spin, or aligned to their motion.
- Sparks stretch with speed and shrink as they slow down.
- New layer types: Puff burst, Streak burst (sparks), Debris burst, Blob burst.
- Ramp preset menu in the ramp editor: Fire, Smoke, Sparks, Debris.
- Playground: frame size choice (default 512×512); previews now start on ones at 100% zoom.
- Slider ranges doubled for 39 parameters (sizes, counts, speeds, forces, spin, outline thickness, …).

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
