// Export (step 3.5): frames, trim, sprite sheet, GIF.
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import {
  crop,
  encodeGif,
  flatten,
  gifDelays,
  mergeHolds,
  packSheet,
  prepareSequence,
  renderSequence,
  unionBounds,
} from '../../src/export/index.js';
import { fileStem, runExport } from '../../src/export/run.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { DEBUG_LAYER_TYPES } from '../../src/render/debugLayers.js';
import { createRenderer } from '../../src/render/renderer.js';
import { makeDebugEffect } from '../../test-pages/debug-effect.js';

const renderer = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: { ...DEBUG_LAYER_TYPES, ...LAYER_TYPES },
});

/** Tiny 4×3 drawing with one opaque pixel at (x, y). */
const dot = (x, y, w = 4, h = 3) => {
  const data = new Uint8ClampedArray(w * h * 4);
  data.set([255, 0, 0, 255], (y * w + x) * 4);
  return { width: w, height: h, data };
};

/** Read every Graphic Control Extension's delay (cs) from GIF bytes, plus the frame count. */
function gifInfo(bytes) {
  const delays = [];
  let frames = 0;
  for (let i = 0; i < bytes.length - 5; i++) {
    if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 4) {
      delays.push(bytes[i + 4] | (bytes[i + 5] << 8));
      frames++;
    }
  }
  const head = String.fromCharCode(...bytes.slice(0, 6));
  return {
    head,
    frames,
    delays,
    width: bytes[6] | (bytes[7] << 8),
    height: bytes[8] | (bytes[9] << 8),
  };
}

describe('render sequence', () => {
  const effect = {
    ...makeDebugEffect(),
    timing: { frameCount: 6, fps: 24, loop: false, holdMode: 'twos' },
  };

  it('renders each drawing once; holds point to the same drawing', async () => {
    let progress = 0;
    const seq = await renderSequence(
      renderer,
      { effect, seed: 1, width: 64, height: 64 },
      {
        onProgress: (done) => {
          progress = done;
        },
      },
    );
    expect(seq.frames).toEqual([0, 0, 1, 1, 2, 2]);
    expect(seq.drawings.length).toBe(3);
    expect(progress).toBe(3);
  });

  it('gives the same pixels as the preview render (and export scale doubles the size)', async () => {
    const seq = await renderSequence(renderer, { effect, seed: 9, width: 64, height: 64 });
    const preview = renderer.renderFrame(effect, 9, 2, { width: 64, height: 64, background: null });
    expect(Buffer.from(seq.drawings[1].data)).toEqual(
      Buffer.from(preview.ctx.getImageData(0, 0, 64, 64).data),
    );
    const big = await renderSequence(
      renderer,
      { effect, seed: 9, width: 64, height: 64 },
      { exportScale: 2 },
    );
    expect([big.drawings[0].width, big.drawings[0].height]).toEqual([128, 128]);
  });
});

describe('trim and background', () => {
  it('union bounds cover every visible pixel of every drawing, padded and clamped', () => {
    expect(unionBounds([dot(1, 1), dot(2, 2)], 0)).toEqual({ x: 1, y: 1, w: 2, h: 2 });
    expect(unionBounds([dot(1, 1)], 5)).toEqual({ x: 0, y: 0, w: 4, h: 3 });
    expect(unionBounds([{ width: 4, height: 3, data: new Uint8ClampedArray(48) }])).toEqual({
      x: 2,
      y: 1,
      w: 1,
      h: 1,
    });
  });

  it('trimming never loses a visible pixel (real explosion)', async () => {
    const { effect, scale } = buildExplosion(createExplosionFromPreset('smallHit'));
    const seq = await renderSequence(renderer, {
      effect,
      seed: 3,
      width: 96,
      height: 96,
      scale: scale * 0.2,
    });
    const prep = prepareSequence(seq, { trim: true });
    const sum = (d) => d.data.reduce((s, v, i) => (i % 4 === 3 ? s + v : s), 0);
    seq.drawings.forEach((d, i) => {
      expect(sum(prep.drawings[i])).toBe(sum(d));
    });
    expect(prep.rect.w).toBeLessThan(96);
  });

  it('crop copies the right pixels; flatten composites onto the colour, fully opaque', () => {
    const c = crop(dot(2, 1), { x: 2, y: 1, w: 1, h: 1 });
    expect([...c.data]).toEqual([255, 0, 0, 255]);
    const half = { width: 1, height: 1, data: new Uint8ClampedArray([255, 255, 255, 128]) };
    const f = flatten(half, '#000000');
    expect(f.data[3]).toBe(255);
    expect(f.data[0]).toBeCloseTo(128, -1);
    expect([...flatten(half, null).data]).toEqual([255, 255, 255, 128]);
  });
});

describe('sprite sheet', () => {
  const seq = {
    drawings: [dot(0, 0), dot(1, 1), dot(2, 2)],
    frames: [0, 0, 1, 2, 2],
    fps: 25,
    loop: false,
    rect: { x: 10, y: 20, w: 4, h: 3 },
    sourceSize: { w: 64, h: 64 },
  };

  it('packs unique drawings in a grid and lists every playback frame', () => {
    const { image, json, columns, rows } = packSheet(seq, { columns: 2, name: 'boom' });
    expect([columns, rows, image.width, image.height]).toEqual([2, 2, 8, 6]);
    const names = Object.keys(json.frames);
    expect(names).toEqual(['boom_000', 'boom_001', 'boom_002', 'boom_003', 'boom_004']);
    expect(json.frames.boom_000.frame).toEqual(json.frames.boom_001.frame); // a hold
    expect(json.frames.boom_002.frame).toEqual({ x: 4, y: 0, w: 4, h: 3 });
    expect(json.frames.boom_004.frame).toEqual({ x: 0, y: 3, w: 4, h: 3 });
    expect(json.frames.boom_000.duration).toBe(40);
    expect(json.frames.boom_000.trimmed).toBe(true);
    expect(json.frames.boom_000.spriteSourceSize).toEqual({ x: 10, y: 20, w: 4, h: 3 });
    expect(json.meta).toMatchObject({
      image: 'boom.png',
      size: { w: 8, h: 6 },
      fps: 25,
      frameCount: 5,
    });
    // the drawing really landed in its cell: drawing 1 has its dot at (1,1) → sheet (5,1)
    expect(image.data[(1 * 8 + 5) * 4 + 3]).toBe(255);
  });

  it('spacing adds gaps between cells', () => {
    const { image, json } = packSheet(seq, { columns: 3, spacing: 2 });
    expect(image.width).toBe(3 * 4 + 2 * 2);
    expect(json.frames.effect_002.frame.x).toBe(6); // drawing 1
    expect(json.frames.effect_003.frame.x).toBe(12); // drawing 2
  });
});

describe('GIF', () => {
  it('merges holds into one frame with a longer delay', () => {
    expect(mergeHolds([0, 0, 1, 2, 2, 2])).toEqual([
      { drawing: 0, start: 0, count: 2 },
      { drawing: 1, start: 2, count: 1 },
      { drawing: 2, start: 3, count: 3 },
    ]);
  });

  it('delays are whole centiseconds that never drift (30 fps → 3,3,4,…; total exact)', () => {
    const runs = Array.from({ length: 30 }, (_, i) => ({ start: i, count: 1 }));
    const d = gifDelays(runs, 30);
    expect(d.slice(0, 3)).toEqual([3, 4, 3]);
    expect(d.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('encodes a valid GIF: header, size, one frame per drawing run, delays from the timeline', () => {
    const seq = { drawings: [dot(0, 0), dot(3, 2)], frames: [0, 0, 1], fps: 20, loop: false };
    for (const transparent of [false, true]) {
      const info = gifInfo(encodeGif(seq, { transparent }));
      expect(info.head).toBe('GIF89a');
      expect([info.width, info.height]).toEqual([4, 3]);
      expect(info.frames).toBe(2);
      expect(info.delays).toEqual([10, 5]);
    }
  });
});

describe('run export', () => {
  const effect = { ...makeDebugEffect(), timing: { frameCount: 4, fps: 24, loop: false } };

  it('builds GIF + PNG pixels + JSON from one render, named after the effect', async () => {
    const { files, info } = await runExport(
      renderer,
      { effect, seed: 2, width: 64, height: 64 },
      { name: 'Big Boom!', background: '#202020' },
    );
    expect(files.map((f) => [f.name, f.type])).toEqual([
      ['Big_Boom.gif', 'image/gif'],
      ['Big_Boom.png', 'image/png'],
      ['Big_Boom.json', 'application/json'],
    ]);
    const json = JSON.parse(/** @type {string} */ (files[2].text));
    expect(Object.keys(json.frames).length).toBe(4);
    expect(json.meta.background).toBe('#202020');
    expect(info.frames).toBe(4);
    // flattened on the colour: every sheet pixel is opaque
    const px = /** @type {any} */ (files[1].pixels).data;
    for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(255);
  });

  it('format switches and safe file names', async () => {
    const only = await runExport(
      renderer,
      { effect, seed: 2, width: 32, height: 32 },
      { gif: false },
    );
    expect(only.files.map((f) => f.type)).toEqual(['image/png', 'application/json']);
    expect(fileStem('  my fx / v2 ')).toBe('my_fx_v2');
    expect(fileStem('')).toBe('effect');
  });
});
