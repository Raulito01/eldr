# CHANGELOG

User-facing changes per version.

## 0.0.64 — 2026-10-03
- **New family: Cel Fire** — the classic cartoon "bitten teardrop" flame (circles rising along a teardrop cut into it, a wavy wobble, a yellow core inside). Presets: Cel Flame, Cel Candle, Cel Torch, Cel Campfire, Cel Spirit Flame, Cel Magic Flame; Particles · Cel Fire: Cel Fire Wall, Cel Fire Trail. All loop seamlessly. Your Fire presets stay as they are.
- New layers **Cel flame** and **Particles · Cel flames**, with **Show bites** to see the cutting circles while you tweak.

## 0.0.63 — 2026-10-03
- **Image / Sequence layer** (＋ Add layer, first in the list): import a PNG or a whole hand-drawn PNG sequence as a layer with everything the other layers have — move / scale / rotate and keyframes, masks, mattes, blend modes, Glow, Outline, Dissolve and Reveal, Goo, Variants, Pixel Mode and export. Size Native or Custom; playback Loop / Once / Ping-pong / Stretch; fps; **Hold each drawing** (on twos, threes…); Start at drawing; colours Original, Tint or mapped to a ramp. After importing, ELDR offers to match the frame size and length to your animation.
- **Pixel Mode** picks colours from your imported drawings for the Auto palette, and matches colours more naturally (greens stay green with PICO-8 and other palettes).

## 0.0.62 — 2026-10-03
- **Dissolve** has 7 new shapes: **Pixels**, **Dots** (halftone), **Lines**, **Wipe**, **Radial out**, **Radial in** and **Sand**, with **Angle** and **Edge roughness** for the wipes, lines and circles.
- **Reveal:** set Direction to Reveal and any dissolve plays backwards — the layer builds itself up (great for appear / spawn effects).

## 0.0.61 — 2026-10-03
- **Pack…** (top bar): build a whole VFX pack in one ZIP — pick effects (this one, your presets, any built-in preset) and how many variations of each, choose engines, pivot, padding, power-of-two sheets and additive versions. Inside: a folder per effect, a README with import steps for every engine, a licence to fill in and a preview sheet.
- **Engine-ready files** for Godot 4 (SpriteFrames + a ready scene), Unity (import script: sprites + animation clip), Unreal Paper2D (.paper2dsprites), GameMaker (_stripN strip), Phaser / Pixi (atlas + code), Construct 3 (strip) and GDevelop (PNG frames). Also in the normal Export dialog as **Engine-ready files (.zip)**.
- Sprite sheets now get padding and extruded edges in packs (no bleeding between frames).

## 0.0.60 — 2026-10-03
- **Pixel Mode stability:** **Snap to pixel grid** (on) keeps moving layers on whole pixels, so shapes no longer wobble as they move; **Snap particles too** (off) for slow, steady particles. New **Shimmer check** view (canvas toolbar, in Pixel Mode): flickering pixels light up magenta, with a count in the stats.

## 0.0.59 — 2026-10-02
- **Pixel Mode** (Pixel ▦ in the top bar, or ⌥P): any effect as clean pixel art. Pixels across (8–512), Alpha cutoff (no soft pixels), Palette (Auto from the effect's colours, PICO-8, Sweetie 16, Game Boy, or **Import .hex** from Lospec), Dither (Bayer 2×2 / 4×4), Outline (outer / inner, 1 px) and Remove stray pixels. Hard pixels in the viewport with a Pixel grid toggle; the Variants grid shows pixel versions too.
- Exports in Pixel Mode come out at the native pixel size, optionally 2× / 3× / 4× with hard pixels. The settings save with the effect.

## 0.0.58 — 2026-10-02
- **Wild variants:** a Subtle / Wild switch in Variants. Wild explores very different takes — sizes, speeds and amounts ×⅓ to ×3 (Wildness slider), effects that were off can switch on, and new colour ramps from the library (layers sharing colours change together; 🔒 a layer to keep its colours).
- **Subtle colour:** with Colour on, variations get sister colours (a small shared hue / brightness shift).

## 0.0.57 — 2026-10-02
- **Variants ▦** (top bar, or press **V**): a grid of 8 variations of your effect next to the current one, all playing. Click one to use it (⌘Z undoes), **↻ More** for 8 new ones. **Variation** slider: 0 = new randomness only (same settings), up to ±50 % = settings nudged around yours. **Vary** Shape / Motion / Colour, and 🔒 any layer to keep it exactly as it is. Keyframed settings, timing and positions never change.

## 0.0.56 — 2026-10-02
- **Each fire preset now looks like its name** instead of the same flame everywhere: Spirit Flame (tall, calm, blue, its tip breaking into wisps), Campfire (logs, uneven tongues, crackling embers, ground glow, smoke), Torch (handle, tall leaning flame, sparks, smoke), Fireball (flames streaming back; stays in place for the game to move), Burning Ground (a row of uneven flames on scorched ground), Fire Breath (a blast swelling into a rolling cone, then smoke and a sputter), Flamethrower (a narrow jet bursting into rolling flame).
- Only the two Dancing Flames have sway keyframes now; the others move by turbulence alone (no keys to manage).

## 0.0.55 — 2026-10-02
- **Fire & Smoke family**, built on your **Dancing Flame** recipe (gooey sparkle body + additive core, swaying so the flame whips). **Fire:** Dancing Flame ∞, Dancing Flame (your pink original) ∞, Spirit Flame ∞, Campfire ∞, Torch ∞, Fireball ∞, Burning Ground ∞, Fire Breath. **Particles · Fire:** Flamethrower ∞, Burning Trail, Fire Rain ∞.
- **Smoke** (anime cel): Poof, Steam Vent ∞, Toxic Cloud ∞, Dust Impact, Billowing Smoke ∞. **Particles · Smoke:** Chimney Drift ∞, Smoke Trail, Fog Bank ∞.
- New layers: **Smoke wisp** and **Particles · Wisps** (thin swaying ribbons for steam, incense, smoke trails).

## 0.0.54 — 2026-10-02
- **Resizable panels**, like After Effects: drag the bar above the timeline to make it taller or shorter, and the bars beside the canvas to resize the Layers panel and the right-hand panel. Double-click a bar to reset it. Your sizes are remembered.

## 0.0.53 — 2026-10-02
- Your view settings stay put: preview resolution (Full / Half / Quarter), background colour and the Handles / Bounds / Pivot / Stats toggles are remembered across presets and page reloads.

## 0.0.52 — 2026-10-02
- **Smooth real-time playback (RAM preview):** ELDR now keeps every frame it renders and fills in the rest in the background while you're not editing — a **green bar** under the timeline shows what's ready. Cached frames play in real time, however heavy the effect (the orbs now play at full speed). Any edit refreshes it automatically.
- **Preview resolution** (viewport toolbar: Full / Half / Quarter, as in After Effects) for faster previews while you work; exports are always full resolution.
- **Goo — shapes melt together** (your After Effects goo recipe): a **Goo** section on every sprite layer makes its particles fuse into liquid, and a **Goo adjustment layer** (＋ Add layer → Goo) melts everything below it. Goo amount (how far they reach), Choke, Edge softness, and Keep shape details (keeps the cel highlights crisp). Bubbling Brew uses it.

## 0.0.51 — 2026-10-02
- **Water family** (anime cel, after your cauldron and spell-book references): new **Liquid** layer (water or goo mass with dark pockets, a light top band and hard highlights; it can stand on the ground and grow a drippy splash crown), **Liquid burst** (splash drops), **Particles → Droplets**, **Particles → Bubbles** and **Ripples** (an impact splash or a seamless repeating pond).
- **Water presets:** Water Splash, Geyser, Ripple Pond ∞, Water Orb ∞, Wave Slash, Bubbling Brew ∞ (the goo cauldron); **Particles · Water:** Rain ∞, Rising Bubbles ∞, Spray Fountain ∞, Waterfall Mist ∞.

## 0.0.50 — 2026-10-02
- The layer buttons (Centre, Anchor, Ramps, Reseed, **Copy**, **Paste…**) now wrap onto a second row instead of running off the edge of the window.
- Presets are split into two menus: **Presets** (the built-in ones) and **My presets** (the ones you saved). Choosing from one resets the other; Delete works on My presets.

## 0.0.49 — 2026-10-02
- **Your PNG / PNG sequence on any sprite:** every sprite layer (bursts, singles, orbits and all particle emitters) now has a **Texture** panel. Import an image or a sequence and it's drawn instead of the shape — the motion, size, spin, fade, glow and blend stay. Works in every preset.
- **Copy / Paste settings:** **📋 Copy** a layer's settings, select one or more layers, then **📥 Paste…** and tick which groups to paste (Emitter, Motion, Life, Trails, Colour, Glow, Texture, Blend…). Also ⌘⌥C / ⌘⌥V (Ctrl+Alt+C / V). Emitter to emitter works across particle shapes; keyframes come along.

## 0.0.48 — 2026-10-02
- **Orbs now look like orbs:** a new **Orb (glass sphere)** layer draws a cel-shaded glass ball — tinted banded glass, a bright rim (brighter at the bottom), glossy highlights and a glow on the ground. Use a Back and a Front orb with your effect between them (masked to the ball) and it sits inside the glass.
- **Electric Orb** is now a plasma ball, **Energy Orb** a violet vortex in glass, and there are two new loops: **Fire Orb** and **Nebula Orb**.

## 0.0.47 — 2026-10-02
- **Lightning targets:** a selected Lightning bolt shows a **◆ handle at its tip** — drag it and the bolt follows live. **Ends on** (Layer section) makes the bolt end on another layer (e.g. a null): move or animate it and the lightning follows; **＋ New null at the tip** creates one for you.
- **Chain Arc** now arcs between two nulls (Point A / Point B) you can drag or animate; **Lightning Strike** ends on a **Ground** null that carries the ring, sparks and smoke.

## 0.0.46 — 2026-10-02
- **Lightning bolt layer** (＋ Add layer → Lightning bolt): a jagged, branching bolt that re-strikes several times a second. Set where it ends, or draw an open path with the pen on the layer and the bolt follows it. Several bolts can fan out (360° = an electric discharge). **Particles → Crackles** emits tiny bolts.
- **New presets** in the Preset menu: **Lightning** (Lightning Strike, Chain Arc, Electric Orb, Thunder Impact), **Magic** (Arcane Burst, Healing Aura, Energy Orb, Holy Smite), **Particles · Lightning** (Static Crackle, Electric Sparks, Charged Ring) and **Particles · Magic** (Fairy Trail, Healing Rise, Arcane Vortex).
- **Seamless loops for backgrounds:** **▸ One-shot / ∞ Seamless loop** buttons under the viewport. In a loop, boiling edges, fire / plasma, orbits, particles and bolts all come back to their start, so the last frame flows into the first. **⟲ Seam** plays across the loop point so you can check it.
- **Loop keys** (Layer section): Cycle or Ping-pong repeats a layer's keyframes after the last one (like After Effects loopOut).

## 0.0.45 — 2026-10-02
- **Particle presets** (Preset menu → Particles): **Embers**, **Magic Dust**, **Spark Fountain**, **Smoke Column** and **Comet**. Embers, Magic Dust and Smoke Column loop seamlessly.
- Every preset is made of normal layers, so you can open and change anything — e.g. drag the Comet's path points to re-aim it, or ease its Progress keys.

## 0.0.44 — 2026-10-02
- **Texture particles** (＋ Add layer → Particles → Texture): use your own image as the particle — or a **PNG sequence** for animated particles, like Particular. In the Texture panel press 🖼 Import and pick one image, or select all frames of a sequence at once (they play in file-name order).
- Sequence: Loop at fps (with random start frame), Play once, Stretch over the particle's life, or a Random still frame per particle.
- Colour: keep the original colours, Tint by the ramp over life, or map brightness through the ramp. Texture size and angle.
- Textures are saved inside your project file. "Use another texture…" reuses one you already imported.
- Fixed: a pulsed emitter could skip its very first pulse.

## 0.0.43 — 2026-10-02
- **Particle emitters** (＋ Add layer → Particles): Dots, Sparks, Sparkles, Smoke puffs, Blobs, Debris, Swooshes. Rate or Pulses, Start / Stop, Pre-warm, Max particles; emit from a point, line, circle, ring, box or **along a path** you draw with the pen on the emitter layer.
- Particles are born where the emitter is at that moment, so an emitter on an animated null or on **Follow Path** leaves a trail. **Move with emitter** makes them travel with it instead; **Inherit velocity** throws them along with the emitter's motion.
- Motion: direction + cone, speed, drag, gravity (negative = rise), turbulence, spin, align to velocity. Life: lifetime, size, scale / opacity over life, flicker, colour variance. **Trails** behind each particle.
- With **Loop** on, emitters loop seamlessly.
- The selected emitter shows its spawn shape and direction in the viewport.

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
