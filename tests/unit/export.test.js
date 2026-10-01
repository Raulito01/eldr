// Export (step 3.5): frames, trim, sprite sheet, GIF.
import { createCanvas, ImageData, loadImage } from '@napi-rs/canvas';
import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import {
  crop,
  encodeGif,
  flatten,
  gifDelays,
  matteOf,
  mergeHolds,
  packSheet,
  padEven,
  prepareSequence,
  renderSequence,
  unionBounds,
} from '../../src/export/index.js';
import { fileStem, frameNumber, runExport } from '../../src/export/run.js';
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

describe('PNG sequence, MP4 and matte (3.5b)', () => {
  const effect = {
    ...makeDebugEffect(),
    timing: { frameCount: 5, fps: 25, loop: false, holdMode: 'twos' },
  };
  const encodePng = async (p) => {
    const c = createCanvas(p.width, p.height);
    c.getContext('2d').putImageData(
      new ImageData(new Uint8ClampedArray(p.data), p.width, p.height),
      0,
      0,
    );
    return new Uint8Array(c.toBuffer('image/png'));
  };

  it('matte = alpha as opaque grey; padEven grows odd sizes with transparent pixels', () => {
    const p = { width: 1, height: 1, data: new Uint8ClampedArray([255, 0, 0, 77]) };
    expect([...matteOf(p).data]).toEqual([77, 77, 77, 255]);
    const odd = padEven({ width: 3, height: 1, data: new Uint8ClampedArray(12).fill(200) });
    expect([odd.width, odd.height]).toEqual([4, 2]);
    expect(odd.data[3 * 4 + 3]).toBe(0);
    expect(odd.data[2 * 4]).toBe(200);
    expect(frameNumber(7, 42)).toBe('0007');
    expect(frameNumber(7, 12000)).toBe('00007');
  });

  it('zip holds every playback frame (holds reuse a drawing) plus matte frames, matching the preview', async () => {
    const { files } = await runExport(
      renderer,
      { effect, seed: 4, width: 48, height: 48 },
      { gif: false, sheet: false, pngSequence: true, matte: true, trim: false, name: 'fx' },
      { encodePng },
    );
    expect(files.map((f) => [f.name, f.type])).toEqual([['fx_png.zip', 'application/zip']]);
    const zip = unzipSync(files[0].bytes);
    expect(Object.keys(zip).sort()).toEqual([
      ...[0, 1, 2, 3, 4].map((i) => `fx_000${i}.png`),
      ...[0, 1, 2, 3, 4].map((i) => `fx_matte_000${i}.png`),
    ]);
    expect(Buffer.from(zip['fx_0000.png']).equals(Buffer.from(zip['fx_0001.png']))).toBe(true); // a hold
    // frame 2 decodes to exactly the preview pixels
    const img = await loadImage(Buffer.from(zip['fx_0002.png']));
    const c = createCanvas(48, 48);
    c.getContext('2d').drawImage(img, 0, 0);
    const preview = renderer.renderFrame(effect, 4, 2, { width: 48, height: 48, background: null });
    expect(Buffer.from(c.getContext('2d').getImageData(0, 0, 48, 48).data)).toEqual(
      Buffer.from(preview.ctx.getImageData(0, 0, 48, 48).data),
    );
  });

  it('MP4: every playback frame, even size, opaque on the background; matte video on request', async () => {
    const calls = [];
    const encodeMp4 = async (seq) => {
      calls.push(seq);
      return { bytes: new Uint8Array([1, 2, 3]), codec: 'avc' };
    };
    const { files, notes } = await runExport(
      renderer,
      { effect, seed: 4, width: 47, height: 47 },
      { gif: false, sheet: false, mp4: true, matte: true, trim: false, name: 'fx' },
      { encodeMp4 },
    );
    expect(files.map((f) => f.name)).toEqual(['fx.mp4', 'fx_matte.mp4']);
    expect(calls[0].frames).toEqual([0, 0, 1, 1, 2]);
    for (const seq of calls) {
      const d = seq.drawings[0];
      expect([d.width % 2, d.height % 2]).toEqual([0, 0]);
      for (let i = 3; i < d.data.length; i += 4) expect(d.data[i]).toBe(255);
    }
    expect(notes.join(' ')).toMatch(/no transparency/);
    const vp9 = await runExport(
      renderer,
      { effect, seed: 4, width: 32, height: 32 },
      { gif: false, sheet: false, mp4: true, background: '#202020' },
      { encodeMp4: async () => ({ bytes: new Uint8Array(1), codec: 'vp9' }) },
    );
    expect(vp9.notes.join(' ')).toMatch(/VP9/);
  });
});
