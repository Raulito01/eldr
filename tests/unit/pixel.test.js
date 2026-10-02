import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { renderSequence } from '../../src/export/frames.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import {
  autoPalette,
  medianCut,
  PIXEL_PALETTES,
  paletteFor,
  parseHexPalette,
  pixelate,
  pixelGrid,
  readPixel,
  upscaleNearest,
} from '../../src/render/pixel.js';
import { createRenderer } from '../../src/render/renderer.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});

/** A frame of the campfire preset at 256². */
function frameOf(id = 'campfire', f = 20) {
  const s = createExplosionFromPreset(id);
  const { effect, scale } = buildExplosion(s);
  const img = r.renderFrameImageData(effect, 7, f, { width: 256, height: 256, scale: scale / 2 });
  return { s, pixels: { width: 256, height: 256, data: new Uint8ClampedArray(img.data) } };
}
const settings = (patch = {}) => ({ ...readPixel({ 'pixel.enabled': true }), ...patch });
const hex = (d, i) =>
  `#${[d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

describe('Pixel Mode (C1, D-085)', () => {
  it('target grid follows the frame shape', () => {
    expect(pixelGrid(512, 512, 64)).toEqual({ width: 64, height: 64 });
    expect(pixelGrid(1920, 1080, 96)).toEqual({ width: 96, height: 54 });
  });

  it('no semi-transparent pixels; every colour in the palette; deterministic', () => {
    const { s, pixels } = frameOf();
    const p = settings({ size: 48 });
    const pal = paletteFor(p, s);
    const out = pixelate(pixels, p, pal);
    expect(out.width).toBe(48);
    const set = new Set(pal);
    let solid = 0;
    for (let i = 0; i < out.data.length; i += 4) {
      const a = out.data[i + 3];
      expect(a === 0 || a === 255).toBe(true);
      if (a) {
        solid++;
        expect(set.has(hex(out.data, i))).toBe(true);
      }
    }
    expect(solid).toBeGreaterThan(50);
    expect(pixelate(pixels, p, pal).data).toEqual(out.data);
  });

  it('built-in, imported and kept-colour palettes', () => {
    const { s, pixels } = frameOf();
    const pico = paletteFor(settings({ palette: 'pico8' }), s);
    expect(pico).toEqual(PIXEL_PALETTES.pico8.colors);
    const out = pixelate(pixels, settings({ palette: 'pico8' }), pico);
    for (let i = 0; i < out.data.length; i += 4)
      if (out.data[i + 3]) expect(pico).toContain(hex(out.data, i));
    expect(parseHexPalette('ff0000\r\n00FF00\n# comment\nzz\n0000ff\n')).toEqual([
      '#ff0000',
      '#00ff00',
      '#0000ff',
    ]);
    expect(paletteFor(settings({ palette: 'none' }), s)).toBeNull();
  });

  it('auto palette: n colours from the ramps, lightest and darkest kept', () => {
    const ramps = [
      [
        { pos: 0, color: '#ffffff' },
        { pos: 1, color: '#200000' },
      ],
    ];
    const pal = autoPalette(ramps, 6);
    expect(pal.length).toBeLessThanOrEqual(6);
    expect(pal).toContain('#ffffff');
    expect(pal).toContain('#200000');
    expect(medianCut([[0, 0, 0]], 4)).toEqual([[0, 0, 0]]);
  });

  it('alpha cutoff: lower = fuller shapes', () => {
    const { s, pixels } = frameOf();
    const count = (cut) => {
      const out = pixelate(pixels, settings({ alphaCutoff: cut, palette: 'none' }), null);
      let n = 0;
      for (let i = 3; i < out.data.length; i += 4) if (out.data[i]) n++;
      return n;
    };
    expect(count(0.1)).toBeGreaterThan(count(0.8));
    expect(s).toBeTruthy();
  });

  it('outer outline grows the silhouette by 1 px in the darkest colour; inner keeps it', () => {
    // a solid square in the middle of a 32² frame
    const data = new Uint8ClampedArray(32 * 32 * 4);
    for (let y = 8; y < 24; y++)
      for (let x = 8; x < 24; x++) data.set([250, 120, 30, 255], (y * 32 + x) * 4);
    const src = { width: 32, height: 32, data };
    const pal = ['#000000', '#ff8020', '#ffffff'];
    const solid = (o) => {
      let n = 0;
      for (let i = 3; i < o.data.length; i += 4) if (o.data[i]) n++;
      return n;
    };
    const plain = pixelate(src, settings({ size: 32 }), pal);
    const outer = pixelate(src, settings({ size: 32, outline: 'outer' }), pal);
    const inner = pixelate(src, settings({ size: 32, outline: 'inner' }), pal);
    expect(solid(plain)).toBe(256);
    expect(solid(outer)).toBe(256 + 64);
    expect(solid(inner)).toBe(256);
    expect(hex(outer.data, (7 * 32 + 10) * 4)).toBe('#000000');
    expect(hex(inner.data, (8 * 32 + 10) * 4)).toBe('#000000');
  });

  it('cleanup removes lonely pixels; dithering mixes palette colours in gradients', () => {
    const data = new Uint8ClampedArray(16 * 16 * 4);
    data.set([255, 255, 255, 255], (5 * 16 + 5) * 4);
    const src = { width: 16, height: 16, data };
    const pal = ['#000000', '#ffffff'];
    const lonely = (cleanup) =>
      pixelate(src, settings({ size: 16, cleanup }), pal).data[(5 * 16 + 5) * 4 + 3];
    expect(lonely(false)).toBe(255);
    expect(lonely(true)).toBe(0);
    // a flat mid-grey: without dither all one colour; Bayer 4×4 gives both
    const grey = new Uint8ClampedArray(16 * 16 * 4).fill(255);
    for (let i = 0; i < grey.length; i += 4) grey.set([128, 128, 128], i);
    const colours = (dither) => {
      const o = pixelate({ width: 16, height: 16, data: grey }, settings({ size: 16, dither, ditherStrength: 1 }), pal);
      const set = new Set();
      for (let i = 0; i < o.data.length; i += 4) set.add(hex(o.data, i));
      return set.size;
    };
    expect(colours('none')).toBe(1);
    expect(colours('bayer4')).toBe(2);
  });

  it('upscale is nearest neighbour (hard pixels)', () => {
    const p = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]) };
    const u = upscaleNearest(p, 3);
    expect(u.width).toBe(6);
    expect(hex(u.data, 2 * 4)).toBe('#ff0000');
    expect(hex(u.data, 3 * 4)).toBe('#0000ff');
  });

  it('export: frames come out at the native pixel size × the integer upscale', async () => {
    const s = createExplosionFromPreset('torch');
    const { effect, scale } = buildExplosion(s);
    const p = settings({ size: 40 });
    const pal = paletteFor(p, s);
    const seq = await renderSequence(
      r,
      {
        effect,
        seed: 1,
        width: 256,
        height: 256,
        scale: scale / 2,
        post: (px, k) => upscaleNearest(pixelate(px, p, pal), Math.round(k)),
      },
      { exportScale: 2 },
    );
    expect(seq.drawings[0].width).toBe(80);
    expect(seq.drawings[0].height).toBe(80);
  });

  it('settings save with the effect and load back', () => {
    const s = createExplosionFromPreset('campfire');
    const on = {
      ...s,
      globals: {
        ...s.globals,
        'pixel.enabled': true,
        'pixel.size': 48,
        'pixel.palette': 'custom',
        'pixel.customPalette': [
          { pos: 0, color: '#112233' },
          { pos: 1, color: '#ddeeff' },
        ],
      },
    };
    const back = parseExplosion(serializeExplosion(on, { seed: 1, name: 'px' }));
    expect(back.warnings ?? []).toEqual([]);
    const g = back.state.globals;
    expect(g['pixel.enabled']).toBe(true);
    expect(g['pixel.size']).toBe(48);
    expect(g['pixel.customPalette'][0].color).toBe('#112233');
  });
});
