// @ts-check
/**
 * Engine-ready files for one effect (D1, D-087): the deliverables a professional VFX pack
 * ships, so the effect drops into Godot, Unity, Unreal, GameMaker, Phaser / Pixi, Construct and
 * GDevelop with as few steps as possible. Pure: prepared frames in, file contents out (PNG
 * pixels are encoded by the caller).
 *
 *   <stem>.png            grid sprite sheet (unique drawings; padding + edge extrude; optional
 *                         power-of-two size)
 *   <stem>.json           JSON Hash atlas (TexturePacker layout: Phaser, Pixi, Aseprite readers)
 *                         + pivots + Pixi "animations" + an `eldr` block (cells, sequence, pivot)
 *                         read by the Unity importer script
 *   <stem>_strip<N>.png   every playback frame in one row (GameMaker auto-slices `_stripN`;
 *                         Construct "Import sprite strip" with N × 1)
 *   frames/<stem>_0000.png  PNG sequence (GDevelop, Unreal / anything else)
 *   <stem>.tres / .tscn   Godot 4 SpriteFrames + a ready AnimatedSprite2D scene
 *   <stem>.paper2dsprites Unreal Paper2D sprite-sheet data (import → sprites → Create Flipbook)
 *   <stem>.gif            preview
 */

import { APP_NAME, APP_VERSION } from '../version.js';

/** @typedef {import('./frames.js').Pixels} Pixels */
/** @typedef {import('./frames.js').RenderedSequence & { rect: import('./frames.js').Rect, sourceSize: { w: number, h: number } }} Prepared */

/** Engines a pack can target (ids → labels, in menu order). */
export const ENGINES = Object.freeze([
  { id: 'godot', label: 'Godot 4' },
  { id: 'unity', label: 'Unity' },
  { id: 'unreal', label: 'Unreal (Paper2D)' },
  { id: 'gamemaker', label: 'GameMaker' },
  { id: 'phaser', label: 'Phaser / Pixi' },
  { id: 'construct', label: 'Construct 3' },
  { id: 'gdevelop', label: 'GDevelop' },
]);

/** Pivot presets: normalized position in the FULL frame. */
export const PIVOTS = Object.freeze({
  center: { x: 0.5, y: 0.5, label: 'Centre' },
  bottom: { x: 0.5, y: 1, label: 'Bottom centre (ground effects, flames)' },
});

/**
 * @typedef {object} EngineOptions
 * @property {{ x: number, y: number }} [pivot]  normalized in the full frame (default centre)
 * @property {number} [padding=2]   transparent px between cells
 * @property {number} [extrude=1]   edge pixels repeated outward (no bleeding when filtered)
 * @property {boolean} [pot=false]  sheet size rounded up to powers of two
 * @property {number} [columns]     grid columns (default: as square as possible)
 */

const nextPot = (/** @type {number} */ n) => 2 ** Math.ceil(Math.log2(Math.max(1, n)));

/**
 * Grid sheet of the unique drawings with padding and extruded edges.
 * @param {Prepared} seq @param {EngineOptions} [o]
 * @returns {{ image: Pixels, cells: { x: number, y: number, w: number, h: number }[], columns: number, rows: number }}
 */
export function gridSheet(seq, o = {}) {
  const count = seq.drawings.length;
  const columns = Math.max(1, Math.min(count, o.columns ?? Math.ceil(Math.sqrt(count))));
  const rows = Math.ceil(count / columns);
  const pad = Math.max(0, o.padding ?? 2);
  const ex = Math.max(0, Math.min(o.extrude ?? 1, Math.floor(pad / 2) || 0));
  const cw = seq.drawings[0].width;
  const ch = seq.drawings[0].height;
  // a border of `pad` around and between cells; extrusion lives inside that border
  let width = columns * cw + (columns + 1) * pad;
  let height = rows * ch + (rows + 1) * pad;
  if (o.pot) {
    width = nextPot(width);
    height = nextPot(height);
  }
  const data = new Uint8ClampedArray(width * height * 4);
  const cells = seq.drawings.map((d, i) => {
    const x = pad + (i % columns) * (cw + pad);
    const y = pad + Math.floor(i / columns) * (ch + pad);
    for (let yy = -ex; yy < ch + ex; yy++) {
      const sy = Math.min(ch - 1, Math.max(0, yy));
      for (let xx = -ex; xx < cw + ex; xx++) {
        const sx = Math.min(cw - 1, Math.max(0, xx));
        const s = (sy * cw + sx) * 4;
        const t = ((y + yy) * width + x + xx) * 4;
        data[t] = d.data[s];
        data[t + 1] = d.data[s + 1];
        data[t + 2] = d.data[s + 2];
        data[t + 3] = d.data[s + 3];
      }
    }
    return { x, y, w: cw, h: ch };
  });
  return { image: { width, height, data }, cells, columns, rows };
}

/**
 * Every playback frame side by side (holds repeated, so frame-count based engines get the
 * timing right). @param {Prepared} seq @returns {Pixels}
 */
export function stripImage(seq) {
  const cw = seq.drawings[0].width;
  const ch = seq.drawings[0].height;
  const n = seq.frames.length;
  const width = cw * n;
  const data = new Uint8ClampedArray(width * ch * 4);
  seq.frames.forEach((drawing, i) => {
    const d = seq.drawings[drawing];
    for (let row = 0; row < ch; row++)
      data.set(d.data.subarray(row * cw * 4, (row + 1) * cw * 4), (row * width + i * cw) * 4);
  });
  return { width, height: ch, data };
}

/** Pivot inside the TRIMMED frame (normalized) and in px. @param {Prepared} seq @param {{x:number,y:number}} [pivot] */
export function framePivot(seq, pivot = PIVOTS.center) {
  const px = pivot.x * seq.sourceSize.w - seq.rect.x;
  const py = pivot.y * seq.sourceSize.h - seq.rect.y;
  return { px, py, x: px / seq.rect.w, y: py / seq.rect.h };
}

const pad3 = (/** @type {number} */ i) => String(i).padStart(3, '0');

/**
 * JSON Hash atlas for the grid sheet.
 * @param {Prepared} seq @param {ReturnType<typeof gridSheet>} sheet
 * @param {{ stem: string, pivot?: {x:number,y:number}, blend?: string }} o
 */
export function atlasJson(seq, sheet, o) {
  const pv = framePivot(seq, o.pivot);
  const src = o.pivot ?? PIVOTS.center;
  const ms = Math.round((1000 / seq.fps) * 1000) / 1000;
  const trimmed = seq.rect.w !== seq.sourceSize.w || seq.rect.h !== seq.sourceSize.h;
  /** @type {Record<string, any>} */
  const frames = {};
  const names = seq.frames.map((_, i) => `${o.stem}_${pad3(i)}`);
  seq.frames.forEach((drawing, i) => {
    frames[names[i]] = {
      frame: sheet.cells[drawing],
      rotated: false,
      trimmed,
      spriteSourceSize: { x: seq.rect.x, y: seq.rect.y, w: seq.rect.w, h: seq.rect.h },
      sourceSize: { ...seq.sourceSize },
      // TexturePacker convention: normalized in the UNTRIMMED frame (Phaser, Pixi, Paper2D)
      pivot: { x: round4(src.x), y: round4(src.y) },
      anchor: { x: round4(src.x), y: round4(src.y) },
      duration: ms,
    };
  });
  return {
    frames,
    animations: { [o.stem]: names }, // Pixi: sheet.animations[stem]
    meta: {
      app: APP_NAME,
      version: APP_VERSION,
      image: `${o.stem}.png`,
      format: 'RGBA8888',
      size: { w: sheet.image.width, h: sheet.image.height },
      scale: '1',
      fps: seq.fps,
      loop: seq.loop,
      frameCount: seq.frames.length,
      blend: o.blend ?? 'normal',
      // ELDR block: plain arrays, easy for any importer (Unity JsonUtility reads this)
      eldr: {
        cells: sheet.cells,
        sequence: [...seq.frames],
        // pivot inside the TRIMMED cell (what the Unity importer uses)
        pivot: { x: round4(pv.x), y: round4(pv.y) },
        frameWidth: seq.rect.w,
        frameHeight: seq.rect.h,
        fps: seq.fps,
        loop: seq.loop,
        name: o.stem,
      },
    },
  };
}
const round4 = (/** @type {number} */ v) => Math.round(v * 10000) / 10000;

/**
 * Hold runs: consecutive playback frames showing the same drawing → one entry with a duration.
 * @param {number[]} frames @returns {{ drawing: number, count: number }[]}
 */
export function runsOf(frames) {
  /** @type {{ drawing: number, count: number }[]} */
  const runs = [];
  for (const d of frames) {
    const last = runs.at(-1);
    if (last && last.drawing === d) last.count++;
    else runs.push({ drawing: d, count: 1 });
  }
  return runs;
}

/**
 * Godot 4 SpriteFrames resource (`.tres`). The texture path is relative to the .tres, so the
 * folder works wherever it is placed in a project.
 * @param {Prepared} seq @param {ReturnType<typeof gridSheet>} sheet @param {{ stem: string }} o
 */
export function godotSpriteFrames(seq, sheet, o) {
  const used = [...new Set(seq.frames)];
  const subs = used
    .map(
      (d) =>
        `[sub_resource type="AtlasTexture" id="AtlasTexture_${d}"]\natlas = ExtResource("1_tex")\nregion = Rect2(${sheet.cells[d].x}, ${sheet.cells[d].y}, ${sheet.cells[d].w}, ${sheet.cells[d].h})\n`,
    )
    .join('\n');
  const frames = runsOf(seq.frames)
    .map(
      (r) =>
        `{\n"duration": ${r.count.toFixed(1)},\n"texture": SubResource("AtlasTexture_${r.drawing}")\n}`,
    )
    .join(', ');
  return `[gd_resource type="SpriteFrames" load_steps=${used.length + 2} format=3]

[ext_resource type="Texture2D" path="${o.stem}.png" id="1_tex"]

${subs}
[resource]
animations = [{
"frames": [${frames}],
"loop": ${seq.loop},
"name": &"${o.stem}",
"speed": ${seq.fps.toFixed(1)}
}]
`;
}

/**
 * Godot 4 scene: an AnimatedSprite2D playing the effect, its pivot at the node origin.
 * @param {Prepared} seq @param {{ stem: string, pivot?: {x:number,y:number} }} o
 */
export function godotScene(seq, o) {
  const pv = framePivot(seq, o.pivot);
  const ox = Math.round((seq.rect.w / 2 - pv.px) * 100) / 100;
  const oy = Math.round((seq.rect.h / 2 - pv.py) * 100) / 100;
  return `[gd_scene load_steps=2 format=3]

[ext_resource type="SpriteFrames" path="${o.stem}.tres" id="1_frames"]

[node name="${o.stem}" type="AnimatedSprite2D"]
sprite_frames = ExtResource("1_frames")
animation = &"${o.stem}"
autoplay = "${o.stem}"
offset = Vector2(${ox}, ${oy})
`;
}

/**
 * Unreal Paper2D sprite-sheet data (`.paper2dsprites`, TexturePacker JSON Hash layout with
 * pivots). One entry per UNIQUE drawing (sprites); the flipbook is made from them in Unreal.
 * @param {Prepared} seq @param {ReturnType<typeof gridSheet>} sheet @param {{ stem: string, pivot?: {x:number,y:number} }} o
 */
export function paper2dSprites(seq, sheet, o) {
  const src = o.pivot ?? PIVOTS.center;
  const trimmed = seq.rect.w !== seq.sourceSize.w || seq.rect.h !== seq.sourceSize.h;
  /** @type {Record<string, any>} */
  const frames = {};
  [...new Set(seq.frames)].forEach((d, i) => {
    frames[`${o.stem}_${pad3(i)}`] = {
      frame: sheet.cells[d],
      rotated: false,
      trimmed,
      spriteSourceSize: { x: seq.rect.x, y: seq.rect.y, w: seq.rect.w, h: seq.rect.h },
      sourceSize: { ...seq.sourceSize },
      // TexturePacker convention: normalized in the UNTRIMMED frame (Phaser, Pixi, Paper2D)
      pivot: { x: round4(src.x), y: round4(src.y) },
    };
  });
  return {
    frames,
    meta: {
      app: `${APP_NAME} ${APP_VERSION} (TexturePacker JSON Hash layout)`,
      target: 'paper2d',
      image: `${o.stem}.png`,
      format: 'RGBA8888',
      size: { w: sheet.image.width, h: sheet.image.height },
      scale: '1',
    },
  };
}

/** The Unity editor importer (one per pack): menu Tools → ELDR → Import Selected JSON. */
export const UNITY_IMPORTER = `// ELDR sprite-sheet importer for Unity (2020.3+).
// Put this file in any folder named "Editor" in your project. Then select one or more ELDR
// .json files in the Project window and choose  Tools > ELDR > Import Selected JSON.
// It slices the sheet next to the JSON into sprites (with the pivot) and creates an
// AnimationClip (fps, loop) for a SpriteRenderer.
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class EldrSpriteImporter
{
    [System.Serializable] class Cell { public int x, y, w, h; }
    [System.Serializable] class Pivot { public float x, y; }
    [System.Serializable] class Eldr { public Cell[] cells; public int[] sequence; public Pivot pivot; public float fps; public bool loop; public string name; }
    [System.Serializable] class Meta { public string image; public Eldr eldr; }
    [System.Serializable] class Root { public Meta meta; }

    [MenuItem("Tools/ELDR/Import Selected JSON")]
    static void ImportSelected()
    {
        foreach (var obj in Selection.objects)
        {
            var jsonPath = AssetDatabase.GetAssetPath(obj);
            if (!jsonPath.EndsWith(".json")) continue;
            var root = JsonUtility.FromJson<Root>(File.ReadAllText(jsonPath));
            if (root?.meta?.eldr?.cells == null) { Debug.LogWarning("Not an ELDR sheet: " + jsonPath); continue; }
            Import(jsonPath, root.meta);
        }
    }

    static void Import(string jsonPath, Meta meta)
    {
        var e = meta.eldr;
        var texPath = Path.Combine(Path.GetDirectoryName(jsonPath), meta.image).Replace('\\\\', '/');
        var importer = AssetImporter.GetAtPath(texPath) as TextureImporter;
        if (importer == null) { Debug.LogError("Sheet not found: " + texPath); return; }
        var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(texPath);
        int texH = tex.height;

        importer.textureType = TextureImporterType.Sprite;
        importer.spriteImportMode = SpriteImportMode.Multiple;
        importer.mipmapEnabled = false;
        importer.alphaIsTransparency = true;
        var metas = new List<SpriteMetaData>();
        for (int i = 0; i < e.cells.Length; i++)
        {
            var c = e.cells[i];
            metas.Add(new SpriteMetaData {
                name = e.name + "_" + i.ToString("000"),
                rect = new Rect(c.x, texH - c.y - c.h, c.w, c.h),   // Unity: y up
                alignment = (int)SpriteAlignment.Custom,
                pivot = new Vector2(e.pivot.x, 1f - e.pivot.y),
            });
        }
#pragma warning disable 618
        importer.spritesheet = metas.ToArray();
#pragma warning restore 618
        importer.SaveAndReimport();

        var sprites = new Dictionary<string, Sprite>();
        foreach (var a in AssetDatabase.LoadAllAssetsAtPath(texPath))
            if (a is Sprite s) sprites[s.name] = s;

        var clip = new AnimationClip { frameRate = e.fps };
        var binding = EditorCurveBinding.PPtrCurve("", typeof(SpriteRenderer), "m_Sprite");
        var keys = new ObjectReferenceKeyframe[e.sequence.Length + 1];
        for (int i = 0; i < e.sequence.Length; i++)
            keys[i] = new ObjectReferenceKeyframe { time = i / e.fps, value = sprites[e.name + "_" + e.sequence[i].ToString("000")] };
        // hold the last drawing for its full frame
        keys[e.sequence.Length] = new ObjectReferenceKeyframe { time = e.sequence.Length / e.fps, value = keys[e.sequence.Length - 1].value };
        AnimationUtility.SetObjectReferenceCurve(clip, binding, keys);
        var settings = AnimationUtility.GetAnimationClipSettings(clip);
        settings.loopTime = e.loop;
        AnimationUtility.SetAnimationClipSettings(clip, settings);
        var clipPath = Path.ChangeExtension(jsonPath, ".anim");
        AssetDatabase.CreateAsset(clip, clipPath);
        AssetDatabase.SaveAssets();
        Debug.Log("ELDR: imported " + e.name + " (" + e.cells.Length + " sprites, clip " + clipPath + ")");
    }
}
`;

/** Phaser 3 + Pixi loading snippets for one effect. @param {Prepared} seq @param {{ stem: string }} o */
export function webSnippet(seq, o) {
  return `// Phaser 3
this.load.atlas('${o.stem}', '${o.stem}.png', '${o.stem}.json');            // in preload()
this.anims.create({
  key: '${o.stem}',
  frames: this.anims.generateFrameNames('${o.stem}', { prefix: '${o.stem}_', start: 0, end: ${seq.frames.length - 1}, zeroPad: 3 }),
  frameRate: ${seq.fps},
  repeat: ${seq.loop ? -1 : 0},
});
this.add.sprite(400, 300, '${o.stem}').play('${o.stem}');                   // in create()

// PixiJS v8
const sheet = await PIXI.Assets.load('${o.stem}.json');
const fx = new PIXI.AnimatedSprite(sheet.animations['${o.stem}']);
fx.animationSpeed = ${seq.fps} / 60; fx.loop = ${seq.loop}; fx.play(); app.stage.addChild(fx);
`;
}

/**
 * Everything for one effect, by path inside its folder. PNGs come back as pixels (`png`) for
 * the caller to encode; text files as strings.
 * @param {Prepared} seq  trimmed, unique drawings
 * @param {{ stem: string, engines: string[], blend?: string, gif?: Uint8Array } & EngineOptions} o
 * @returns {{ png: Record<string, Pixels>, text: Record<string, string>, info: Record<string, any> }}
 */
export function effectFiles(seq, o) {
  const has = (/** @type {string} */ id) => o.engines.includes(id);
  const sheet = gridSheet(seq, o);
  /** @type {Record<string, Pixels>} */
  const png = { [`${o.stem}.png`]: sheet.image };
  /** @type {Record<string, string>} */
  const text = {
    [`${o.stem}.json`]: `${JSON.stringify(atlasJson(seq, sheet, o), null, 2)}\n`,
  };
  const n = seq.frames.length;
  if (has('gamemaker') || has('construct')) png[`${o.stem}_strip${n}.png`] = stripImage(seq);
  if (has('gdevelop') || has('unreal'))
    seq.frames.forEach((d, i) => {
      png[`frames/${o.stem}_${String(i).padStart(4, '0')}.png`] = seq.drawings[d];
    });
  if (has('godot')) {
    text[`${o.stem}.tres`] = godotSpriteFrames(seq, sheet, o);
    text[`${o.stem}.tscn`] = godotScene(seq, o);
  }
  if (has('unreal'))
    text[`${o.stem}.paper2dsprites`] =
      `${JSON.stringify(paper2dSprites(seq, sheet, o), null, 2)}\n`;
  if (has('phaser')) text[`${o.stem}_phaser_pixi.js`] = webSnippet(seq, o);
  return {
    png,
    text,
    info: {
      name: o.stem,
      frames: n,
      drawings: seq.drawings.length,
      fps: seq.fps,
      loop: seq.loop,
      frameWidth: seq.rect.w,
      frameHeight: seq.rect.h,
      columns: sheet.columns,
      rows: sheet.rows,
      sheet: `${sheet.image.width}×${sheet.image.height}`,
      stripWidth: seq.rect.w * n,
      blend: o.blend ?? 'normal',
    },
  };
}

/**
 * Pack README (Markdown): what is inside, every effect's numbers, import steps per engine.
 * @param {{ name: string, effects: Record<string, any>[], engines: string[], pivotLabel: string, pixel?: boolean }} o
 */
export function packReadme(o) {
  const has = (/** @type {string} */ id) => o.engines.includes(id);
  const wide =
    has('gamemaker') || has('construct')
      ? o.effects.filter((e) => e.stripWidth > 8192).map((e) => e.name)
      : [];
  const rows = o.effects
    .map(
      (e) =>
        `| ${e.name} | ${e.frameWidth}×${e.frameHeight} | ${e.frames} | ${e.fps} | ${e.loop ? 'loop' : 'once'} | ${e.columns}×${e.rows} | ${e.blend} |`,
    )
    .join('\n');
  const steps = [];
  if (has('godot'))
    steps.push(`### Godot 4
1. Copy an effect's folder into your project.
2. Drag \`<name>.tscn\` into a scene: an AnimatedSprite2D that plays on its own. Or use \`<name>.tres\` (SpriteFrames) on your own AnimatedSprite2D.
3. One-shots: connect \`animation_finished\` to \`queue_free()\`.`);
  if (has('unity'))
    steps.push(`### Unity
1. Copy \`Unity/Editor/EldrSpriteImporter.cs\` into your project (any folder named \`Editor\`).
2. Copy an effect's \`<name>.png\` and \`<name>.json\` into Assets.
3. Select the \`.json\` and choose **Tools ▸ ELDR ▸ Import Selected JSON**: the sheet is sliced into sprites (with the pivot) and \`<name>.anim\` is created.
4. Add a SpriteRenderer + Animator (drag the clip onto the object).`);
  if (has('unreal'))
    steps.push(`### Unreal Engine (Paper2D)
1. Enable the Paper2D plugin. Drag \`<name>.paper2dsprites\` (and its \`<name>.png\`) into the Content Browser: Unreal creates the texture and one Sprite per drawing.
2. Select the sprites ▸ right-click ▸ **Create Flipbook**; set Frames Per Second to the fps below.
3. Alternative: import \`frames/\` (PNG sequence) and use **Sprite Actions ▸ Extract Sprites**.
4. Effects with glow look best with a Translucent / Additive material.`);
  if (has('gamemaker'))
    steps.push(`### GameMaker
1. Import \`<name>_strip<N>.png\` as a sprite (drag it in, or Sprite Editor ▸ Import): the \`_stripN\` name slices it into N frames automatically.
2. Set the sprite speed to the fps below (Frames per second).
3. Origin: Middle Centre or Bottom Centre to match the pivot (${o.pivotLabel}).`);
  if (has('phaser'))
    steps.push(`### Phaser 3 / PixiJS
Load \`<name>.png\` + \`<name>.json\` as an atlas. \`<name>_phaser_pixi.js\` has ready code for both (animation key, frame rate, repeat). The JSON is the TexturePacker "JSON Hash" layout with pivots and a Pixi \`animations\` list.`);
  if (has('construct'))
    steps.push(`### Construct 3
1. Make a Sprite, open the Animations editor, right-click the frames bar ▸ **Import sprite strip…**, pick \`<name>_strip<N>.png\` and enter **N cells across, 1 down** (N is in the file name).
2. Set the animation Speed to the fps below and Loop as listed.`);
  if (has('gdevelop'))
    steps.push(`### GDevelop
1. Add a Sprite object ▸ add an animation ▸ add images ▸ select every file in \`frames/\` (they are numbered in order).
2. Set "Time between frames" to 1 ÷ fps (24 fps → 0.042 s) and tick Loop for looping effects.`);
  return `# ${o.name}

Made with ${APP_NAME} ${APP_VERSION}. Transparent PNG (straight alpha). Pivot: ${o.pivotLabel}.${o.pixel ? ' Pixel art effects keep hard pixels: use nearest-neighbour / "Pixel" filtering in your engine.' : ''}

## Effects

| Effect | Frame (px) | Frames | FPS | Plays | Grid | Blend |
|---|---|---|---|---|---|---|
${rows}

Every effect folder has \`<name>.png\` (grid sprite sheet with padding and extruded edges), \`<name>.json\` (atlas: frame rectangles, pivot, fps, loop) and \`<name>.gif\` (preview)${has('gamemaker') || has('construct') ? ', `<name>_strip<N>.png` (one row of all N frames)' : ''}${has('gdevelop') || has('unreal') ? ', `frames/` (PNG sequence)' : ''}.

Blend "normal" = regular alpha blending (glows are baked in). Use additive blending only for files marked "additive".

## Import

${steps.join('\n\n')}
${wide.length ? `\n> Note: the strips of ${wide.join(', ')} are wider than 8192 px, more than some engines and GPUs accept as one image. Use the grid sheet or \`frames/\` for those.\n` : ''}

## Tips
- Sheets use padding and extruded edges, so filtering (smoothing) won't bleed between frames.
- Turn off mipmaps / compression for crisp effects; use point / nearest filtering for pixel art.
- Loops are seamless: the last frame flows into the first.

See LICENSE.txt for the terms.
`;
}

/** LICENSE placeholder for the pack author to complete. @param {string} packName */
export const licenseText = (packName) => `${packName}
Copyright (c) <YEAR> <YOUR NAME>

<Write your licence terms here, for example:>
You may use these effects in personal and commercial games and apps.
You may not resell or redistribute the effects themselves, alone or as part of another asset pack.
`;
