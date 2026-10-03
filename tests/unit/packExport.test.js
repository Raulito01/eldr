import { createCanvas } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import {
  atlasJson,
  ENGINES,
  effectFiles,
  framePivot,
  godotScene,
  godotSpriteFrames,
  gridSheet,
  paper2dSprites,
  runsOf,
  stripImage,
} from '../../src/export/engines.js';
import { prepareSequence, renderSequence } from '../../src/export/frames.js';
import { buildPack, uniqueStems } from '../../src/export/pack.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
const encodePng = async (p) => {
  const c = createCanvas(p.width, p.height);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(p.width, p.height);
  img.data.set(p.data);
  ctx.putImageData(img, 0, 0);
  return new Uint8Array(c.toBuffer('image/png'));
};
const sourceOf = (id) => {
  const s = createExplosionFromPreset(id);
  const { effect, scale } = buildExplosion(s);
  return { effect, seed: 3, width: 128, height: 128, scale: scale / 4 };
};
/** A tiny hand-made sequence: 3 drawings, 5 frames (a hold), 2× 3 px, trimmed from 10×10. */
const fake = () => {
  const d = (v) => ({ width: 2, height: 3, data: new Uint8ClampedArray(24).fill(v) });
  return {
    drawings: [d(10), d(20), d(30)],
    frames: [0, 1, 1, 2, 0],
    fps: 12,
    loop: true,
    rect: { x: 4, y: 5, w: 2, h: 3 },
    sourceSize: { w: 10, h: 10 },
  };
};

describe('engine files (D1, D-087)', () => {
  it('grid sheet: padding, extruded edges, power of two', () => {
    const seq = fake();
    const s = gridSheet(seq, { padding: 2, extrude: 1, pot: true, columns: 3 });
    expect(s.image.width).toBe(16); // 3×2 + 4×2 = 14 → 16
    expect(s.image.height).toBe(8); // 3 + 2×2 = 7 → 8
    expect(s.cells[1]).toEqual({ x: 6, y: 2, w: 2, h: 3 });
    // extruded column left of cell 1 repeats its edge
    const at = (x, y) => s.image.data[(y * s.image.width + x) * 4];
    expect(at(5, 2)).toBe(20);
    expect(at(4, 2)).toBe(10); // cell 0's right edge, extruded
    expect(at(1, 2)).toBe(10); // left extrusion of cell 0
    expect(at(0, 2)).toBe(0); // outer padding beyond the extrusion stays clear
  });

  it('strip: every playback frame in a row (holds repeated)', () => {
    const st = stripImage(fake());
    expect(st.width).toBe(10);
    expect(st.data[(0 * 10 + 4) * 4]).toBe(20);
    expect(st.data[(0 * 10 + 2) * 4]).toBe(20);
    expect(st.data[(0 * 10 + 6) * 4]).toBe(30);
    expect(st.data[(0 * 10 + 8) * 4]).toBe(10);
  });

  it('atlas JSON: one frame per playback frame, pivot in the trimmed frame, Pixi animations, eldr block', () => {
    const seq = fake();
    const sheet = gridSheet(seq, {});
    const j = atlasJson(seq, sheet, { stem: 'fx', pivot: { x: 0.5, y: 0.6 } });
    expect(Object.keys(j.frames)).toEqual(['fx_000', 'fx_001', 'fx_002', 'fx_003', 'fx_004']);
    expect(j.frames.fx_002.frame).toEqual(j.frames.fx_001.frame);
    // atlas pivot: TexturePacker convention, untrimmed frame (Phaser / Pixi read it so)
    expect(j.frames.fx_000.pivot).toEqual({ x: 0.5, y: 0.6 });
    expect(j.frames.fx_000.anchor).toEqual({ x: 0.5, y: 0.6 });
    // eldr block: inside the trimmed cell — (5-4)/2, (6-5)/3
    expect(j.meta.eldr.pivot).toEqual({ x: 0.5, y: 0.3333 });
    expect(j.animations.fx).toHaveLength(5);
    expect(j.meta.eldr.sequence).toEqual([0, 1, 1, 2, 0]);
    expect(framePivot(seq, { x: 0.5, y: 1 }).py).toBe(5);
  });

  it('Godot: SpriteFrames with hold durations and a scene with the pivot at the origin', () => {
    const seq = fake();
    const sheet = gridSheet(seq, {});
    expect(runsOf(seq.frames)).toEqual([
      { drawing: 0, count: 1 },
      { drawing: 1, count: 2 },
      { drawing: 2, count: 1 },
      { drawing: 0, count: 1 },
    ]);
    const tres = godotSpriteFrames(seq, sheet, { stem: 'fx' });
    expect(tres).toMatch(/^\[gd_resource type="SpriteFrames" load_steps=5 format=3\]/);
    expect(tres).toContain('path="fx.png"');
    expect(tres).toContain('"duration": 2.0');
    expect(tres).toContain('"loop": true');
    expect(tres).toContain('"speed": 12.0');
    expect((tres.match(/AtlasTexture_\d+"\]/g) ?? []).length).toBe(3);
    const tscn = godotScene(seq, { stem: 'fx', pivot: { x: 0.5, y: 0.8 } });
    expect(tscn).toContain('type="AnimatedSprite2D"');
    expect(tscn).toContain('autoplay = "fx"');
    expect(tscn).toContain('offset = Vector2(0, -1.5)'); // pivot y 8 → 3 in trimmed; centre 1.5
  });

  it('Unreal: one sprite per unique drawing with pivots', () => {
    const seq = fake();
    const p = paper2dSprites(seq, gridSheet(seq, {}), { stem: 'fx' });
    expect(Object.keys(p.frames)).toHaveLength(3);
    expect(p.meta.image).toBe('fx.png');
    expect(p.frames.fx_000.pivot).toBeTruthy();
  });

  it('which files each engine adds', () => {
    const seq = fake();
    const all = effectFiles(seq, { stem: 'fx', engines: ENGINES.map((e) => e.id) });
    expect(Object.keys(all.png)).toEqual(
      expect.arrayContaining([
        'fx.png',
        'fx_strip5.png',
        'frames/fx_0000.png',
        'frames/fx_0004.png',
      ]),
    );
    expect(Object.keys(all.text)).toEqual(
      expect.arrayContaining([
        'fx.json',
        'fx.tres',
        'fx.tscn',
        'fx.paper2dsprites',
        'fx_phaser_pixi.js',
      ]),
    );
    const none = effectFiles(seq, { stem: 'fx', engines: [] });
    expect(Object.keys(none.png)).toEqual(['fx.png']);
    expect(Object.keys(none.text)).toEqual(['fx.json']);
  });

  it('unique stems', () => {
    expect(uniqueStems(['Fire', 'Fire', 'Smoke puff', 'Fire'])).toEqual([
      'Fire',
      'Fire_2',
      'Smoke_puff',
      'Fire_3',
    ]);
  });
});

describe('pack export (D1, D-087)', () => {
  it('builds a pack zip laid out like a professional VFX pack', async () => {
    const out = await buildPack(
      r,
      [
        { name: 'Torch', source: sourceOf('torch') },
        { name: 'Poof', source: sourceOf('poof') },
      ],
      {
        name: 'Fire Pack',
        engines: ENGINES.map((e) => e.id),
        onBlack: true,
      },
      { encodePng, makeCanvas: (w, h) => createCanvas(w, h) },
    );
    expect(out.name).toBe('Fire_Pack.zip');
    const files = unzipSync(out.bytes);
    const names = Object.keys(files);
    for (const p of [
      'Fire_Pack/README.md',
      'Fire_Pack/LICENSE.txt',
      'Fire_Pack/preview.png',
      'Fire_Pack/Unity/Editor/EldrSpriteImporter.cs',
      'Fire_Pack/Torch/Torch.png',
      'Fire_Pack/Torch/Torch.json',
      'Fire_Pack/Torch/Torch.gif',
      'Fire_Pack/Torch/Torch.tres',
      'Fire_Pack/Torch/Torch.tscn',
      'Fire_Pack/Torch/Torch.paper2dsprites',
      'Fire_Pack/Torch/Torch_additive.png',
      'Fire_Pack/Poof/Poof.json',
    ])
      expect(names).toContain(p);
    expect(names.some((n) => /Fire_Pack\/Torch\/Torch_strip\d+\.png/.test(n))).toBe(true);
    expect(names.filter((n) => n.startsWith('Fire_Pack/Poof/frames/')).length).toBe(34);
    const readme = new TextDecoder().decode(files['Fire_Pack/README.md']);
    expect(readme).toContain('| Torch |');
    expect(readme).toContain('### Godot 4');
    expect(readme).toContain('### GDevelop');
    const json = JSON.parse(new TextDecoder().decode(files['Fire_Pack/Torch/Torch.json']));
    expect(json.meta.loop).toBe(true);
    expect(json.meta.eldr.cells.length).toBeGreaterThan(0);
  });

  it('pack frames are the same pixels as a single export', async () => {
    const src = sourceOf('torch');
    const seq = prepareSequence(await renderSequence(r, src), { trim: true, background: null });
    const out = await buildPack(
      r,
      [{ name: 'Torch', source: src }],
      { name: 'P', engines: ['gdevelop'], gif: false },
      { encodePng },
    );
    const files = unzipSync(out.bytes);
    expect(files['P/Torch/frames/Torch_0000.png']).toEqual(
      await encodePng(seq.drawings[seq.frames[0]]),
    );
  });
});
