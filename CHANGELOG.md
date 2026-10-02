# CHANGELOG

User-facing changes per version.

## 0.0.42 — 2026-10-02
- **Follow Path**: any layer (nulls, precomps, and soon particle emitters) can ride along a path you draw. Transform → Follow path: pick the Path, then keyframe **Progress** (0–100 %) — ease it with F9 or the Graph Editor. **Auto-orient** turns the layer with the curve, **Offset** shifts it along, **Even speed** keeps a constant speed, **Loop** goes around again. The path shows dashed in the viewport.
- **Path layer** (＋ Add layer → Path): a layer just for motion paths — never rendered. Its panel has ✒ Draw path.
- **Open paths**: with the pen, **Enter** now finishes an open path (a motion path); clicking the first point still closes it into a mask.

## 0.0.41 — 2026-10-02
- **Precomps** (as in After Effects): select layers and press **▣** in the layer panel (or **⌘⇧C**) to precompose them into one layer. Move, scale, fade, mask, matte or retime the precomp layer and the whole group follows.
- **⤵** on a precomp layer (or **Tab**) opens it to edit its layers; the breadcrumb at the top of the viewport (◉ Main › ▣ Name, or **⇧Tab**) takes you back. ⌘D on a precomp layer makes another instance — edits inside show in all of them. Precomps can be nested.
- Export always renders the main comp. Files and My presets keep precomps.
- Messages now appear at the bottom of the screen and fade out.

## 0.0.40 — 2026-10-02
- **Pen tool** (✒ Pen in the viewport toolbar, or **G**, as in After Effects): draw your own mask on the selected layer — click for corners, click-drag for curves, click the first point (or Enter) to close. ⌫ removes the last point, Esc cancels.
- Drawn masks: drag a point or a handle to reshape (⌥ breaks the handle pair), double-click a point to switch corner ↔ smooth. **◷ Path** on the mask card animates the shape (Mask Path keys, as in AE). Position, Size, Rotation, Feather, Expansion and the modes work as for the other masks.
- Messages now float over the editor instead of pushing the viewport down.

## 0.0.39 — 2026-10-02
- **Track mattes** (Layer section → Track matte): show a layer only where another layer is — Alpha, Alpha inverted, Luma, Luma inverted, like After Effects. The matte layer is hidden automatically (turn its eye back on if you want to see it).
- **Masks** (new Masks panel): ＋ Ellipse / ＋ Rectangle, Add / Subtract / Intersect, Inverted, Feather, Expansion, Opacity — Position, Size, Rotation, Feather, Expansion and Opacity are keyframable. **✥ Edit** shows handles in the viewport: drag inside to move, a corner to resize (⇧ keeps proportions). **M** shows mask lanes in the timeline.
- Gradient Map adjustment layers can be limited with a mask or matte too.
- Layer panel tags show ◐ matte, ⬓ matte source and ▭ masks.

## 0.0.38 — 2026-10-02
- **Gradient Map adjustment layer** (＋ Add layer → Gradient Map): recolours every layer BELOW it by brightness, through a colour ramp — like Photoshop's gradient map on an After Effects adjustment layer. Move it up or down the stack to choose what it affects.
- Controls (all keyframable): Ramp (works with 🎨 Ramps and the whole library), Mix, Black / White point, Bands (posterize into cel steps), Dark → left (Photoshop direction). Opacity and every blend mode work; transparency is never changed.

## 0.0.37 — 2026-10-02
- Fixed: strong **Swirl** / **Curl** on field fire layers made them look pixelated (dotted thin rings, stripes across colour bands). Those areas are now anti-aliased from the real shape; normal layers render as before at about the same speed.

## 0.0.36 — 2026-10-02
- **Colour ramp library**: 54 ready-made ramps in 15 families — fire (incl. blue, fel green, purple), smoke & dust, sparks & debris, water, ice, lightning, magic (arcane, holy, shadow, nature), poison, lava, plasma, blood, gold & gems.
- **🎨 Ramps** (next to Reseed): a contact sheet showing every ramp ON your selected layer — early, middle and late in its life. Click one to apply it to all selected layers (⌘Z undoes); the sheet stays open so you can compare.
- The ramp editor's preset menu is grouped by family and has **↔ Reverse this ramp**.

## 0.0.35 — 2026-10-02
- **✥ Pan Behind** tool (viewport toolbar, or **Y**, as in After Effects): while it's on, dragging inside the selected layer's box moves only the anchor point — the layer stays where it is. Same as ⌥-drag, without holding a key (pen-friendly).

## 0.0.34 — 2026-10-02
- **After Effects shortcuts**: Space play / pause · ← → or PgUp / PgDn one frame (⇧ = 10) · Home / End · J / K keys · **I / O** go to the layer's in / out point · **[ / ]** move the selected layers so they start / end at the playhead · **⌥[ / ⌥]** trim them there · **U** show / hide animated properties · **P S R T A** show Position, Scale, Rotation, Opacity, Anchor (⇧ adds) · ⌘D duplicate · ⌫ delete · F9 family, ⌘⇧K, ⇧F3…
- **⌨ Shortcuts** button (or **?**): every shortcut in one sheet — click a row to do it, no keyboard needed.
- **Timeline zoom**: − / + buttons, a zoom slider, Fit, and a slider to scroll; or = / − keys, ; to jump between frame-level and the whole comp, ⌘ / Ctrl + scroll to zoom where the pointer is. The view follows the playhead.
- Keys on the first and last frame are no longer cut in half; clicking the ruler snaps to the nearest frame.

## 0.0.33 — 2026-10-02
- **Keyframe interpolation like After Effects**: every key has its own in and out side. **Easy Ease** (F9), **Ease In** (⇧F9), **Ease Out** (⌘⇧F9), **Linear** and **Hold** (⌘⌥H) — buttons in the timeline bar, acting on all selected keys.
- **Keyframe Velocity…** (⌘⇧K): type the exact incoming / outgoing speed (px / s, % / s, ° / s…) and influence (%), with "Continuous" to keep both speeds equal. High speeds overshoot past the next key, for snappy pops.
- **Graph Editor** (📈 Graph, or ⇧F3): the value curves of the selected layers' animated numbers. Drag a key to change its time and value (⇧ = one direction only), drag a yellow handle to shape the curve — eased keys move both handles together, ⌥ breaks them apart. Drag empty space to select several keys. Click a curve's name to hide it.
- Key icons show the interpolation: diamond = linear, round = eased, square = hold.
- Older files and presets play exactly as before. Handles are saved in files and My presets, and copy / paste keeps them.

## 0.0.32 — 2026-10-02
- **Select several layers**: ⌘/Ctrl-click adds or removes a layer, ⇧-click selects a range — in the layer panel and in the timeline. ⌘A selects every layer. The inspector shows the active layer; "2 layers · … active" in its title.
- **Edit several layers at once**: any slider, colour, menu or Transform value you change goes to every selected layer that has it (keys where it is animated). Values that differ show "—". Stopwatch and ◆ work on all selected layers.
- Eye, solo, ▲▼, duplicate (⌘D) and delete (🗑 or ⌫) act on the whole selection. Dragging a selected layer's bar slides / trims all selected bars.
- **Select several keys**: ⇧ / ⌘-click keys, drag a box on empty lane space, or ⌘⌥A for all keys of the selected layers. Drag to move them together (snaps to frames); ⌥-drag the first or last selected key to stretch / squash their timing. Linear / Ease / Hold / Delete apply to all selected keys.
- **Copy / paste keys**: ⌘C, move the playhead, ⌘V. Keys from one layer paste onto every selected layer; keys from several layers go back to their own layers.
- Fixed: opening a file didn't apply its saved frame size.

## 0.0.31 — 2026-10-02
- **Jump to keyframe**: ◀◆ / ◆▶ buttons in the layer timeline and **J / K** (as in After Effects) — previous / next frame with a key on any layer.
- **Centre layer**: ⊕ Centre button (or **⇧C**, or **⌘/Ctrl + Home** as in After Effects) moves the selected layer's anchor to the middle of the frame — also when it has a parent. **⌖ Anchor** (or **⇧⌥C**, **⌘⌥/Ctrl+Alt + Home**) puts the anchor on the layer's own centre without moving it. Both set keys when Position / Anchor are animated.
- **Canvas size fields**: type the frame width and height directly next to the Frame menu (any size 16–4096).
- The frame size is saved in files and My presets.

## 0.0.30 — 2026-10-01
- **Keyframes on every control**: each row in the inspector has a stopwatch ◷ — sliders, colours, curves, ramps, menus, toggles, Transform and Opacity. With the stopwatch on, changing a value sets a key at the current frame; ◆ adds or removes a key there; stopwatch off keeps the current value. Numbers and colours ease between keys; curves and ramps blend when their point counts match; toggles and menus switch at the key.
- **Layer timeline** under the viewport: one row per layer with its bar — drag the middle to **slide**, an end to **trim** in / out, ⌥ + right end to **stretch** time. The selected layer shows one lane per animated parameter: drag keys to move them (snaps to frames), click a key and choose **Linear / Ease / Hold** or **Delete key** (or ⌫).
- Ruler: click / drag to scrub; the red **impact marker** can be dragged.
- Viewport handles and undo work with animated layers (dragging sets keys where the stopwatch is on).
- Files and My presets save keys and layer timing (file format 4); older files open.

## 0.0.29 — 2026-10-01
- **Layer transform** on every layer (inspector → Transform): Position, Scale X / Y (Uniform scale on by default), Rotation, Anchor point. It is applied on top of the layer's own motion.
- **Parenting**: a Parent menu per layer. Children follow their parent's position, rotation and scale; picking (or removing) a parent keeps the layer where it is; loops are not offered. Deleting a parent keeps its children in place.
- **Null layer** (＋ Add layer → Null): invisible, only a transform — for rigging several layers together.
- **Viewport handles** for the selected layer: drag inside the box to move, the round handle to rotate (Shift = 15° steps), a corner to scale (Shift = uniform), ⌥-drag the centre to move the anchor point only. "Handles" toggle in the viewport toolbar. Each drag is one undo step.
- Files and My presets save transforms and parents (file format 3); older files still open.
- The layers' own placement controls are now labelled "Element placement" / "Orbit centre", to tell them apart from the layer Transform.

## 0.0.28 — 2026-10-01
- Fixed: a 1920×1080 frame exported as a near-square MP4 / PNG sequence. PNG sequence and MP4 now always keep the full frame you set; "Trim empty space" only crops the GIF and sprite sheet. The dialog shows both sizes after exporting.

## 0.0.27 — 2026-10-01
- Export: new formats — **PNG sequence** (numbered frames with full transparency, in one .zip) and **MP4** video (H.264 in Chrome / Safari).
- Export: **Matte** option — the alpha as black-and-white frames (`name_matte_0000.png` in the zip) and/or a second video (`name_matte.mp4`). In After Effects use it as a Luma Matte, since MP4 has no transparency.
- Export: tick several formats at once; export scale 0.5×, 1×, 2× or 4× with the final size shown.
- Frame sizes up to **2K**: 1024, 1536, 2048 square, 1280×720, 1920×1080, 2048×1080, and **Custom…** (any width × height up to 4096).
- ProRes dropped at Raul's request.

## 0.0.26 — 2026-10-01
- Fixed: making the timeline longer (e.g. 200 frames) slowed the whole effect down. Now it works like an After Effects comp: more frames = more time after the animation, a different fps = finer or coarser sampling; the animation keeps its speed.
- Timeline: new **anim … s** field (one-shots) — the animation's length in seconds. Change it to make the effect faster or slower on purpose.
- Saved files and presets keep their look (their length is taken from their frames).

## 0.0.25 — 2026-10-01
- **Layer panel** in the explosion editor:
  - **＋ Add layer…**: any layer type (field fire, crescents, orbits, sparkles, puffs, rings…), added above the selected layer.
  - **Reorder**: drag the ⠿ handle, or ▲ / ▼.
  - **Duplicate** (⧉): an identical copy (same randomness) directly above; **🎲 Reseed** gives one layer new randomness.
  - **Rename**: double-click the name, or ✎.
  - **Delete** (🗑), **Solo** (S), visibility checkbox.
- **Layer settings** at the top of the inspector: **Blend mode** (17 modes: Normal, Add, Screen, Lighten, Colour Dodge, Multiply, Darken, Colour Burn, Overlay, Soft/Hard Light, Difference, Exclusion, Hue, Saturation, Colour, Luminosity), **Opacity**, and **Timed from** (after impact, anticipation, flash frames, or free).
- **Undo / Redo** (buttons, ⌘Z / ⇧⌘Z): every edit, including layer changes; one slider drag = one undo step.
- Saved files and My presets now keep your whole layer stack. Files from 0.0.24 still open.

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
