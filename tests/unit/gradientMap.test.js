import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { blendRgb } from '../../src/render/blendMath.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { BLEND_MODES } from '../../src/render/compositor.js';
import {
  applyGradientMap,
  GRADIENT_MAP_PARAMS,
  gradientLut,
  readGradientMap,
} from '../../src/render/gradientMap.js';
import { createRenderer } from '../../src/render/renderer.js';
import { getDefaults } from '../../src/schema/schema.js';

const BW = [
  { pos: 0, color: '#ff0000' },
  { pos: 1, color: '#0000ff' },
];
const params = (o = {}) => ({ ...getDefaults(GRADIENT_MAP_PARAMS), 'gmap.ramp': BW, ...o });

/** 3-pixel canvas: white, black, half-transparent grey. */
function strip() {
  const c = createCanvas(3, 1);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(3, 1);
  img.data.set([255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 128]);
  ctx.putImageData(img, 0, 0);
  return ctx;
}
const px = (ctx) => [...ctx.getImageData(0, 0, 3, 1).data];

describe('Gradient Map adjustment (3.8b)', () => {
  it('bright → ramp left, dark → ramp right; alpha unchanged', () => {
    const ctx = strip();
    applyGradientMap(ctx, params(), { width: 3, height: 1, blend: 'normal', opacity: 1 });
    const d = px(ctx);
    expect(d.slice(0, 4)).toEqual([255, 0, 0, 255]);
    expect(d.slice(4, 8)).toEqual([0, 0, 255, 255]);
    expect(d[11]).toBe(128);
  });

  it('dark → left flips it; mix and opacity fade it; levels and bands', () => {
    let ctx = strip();
    applyGradientMap(ctx, params({ 'gmap.darkLeft': true }), {
      width: 3,
      height: 1,
      blend: 'normal',
      opacity: 1,
    });
    expect(px(ctx).slice(0, 3)).toEqual([0, 0, 255]);
    ctx = strip();
    applyGradientMap(ctx, params({ 'gmap.mix': 50 }), {
      width: 3,
      height: 1,
      blend: 'normal',
      opacity: 1,
    });
    expect(px(ctx).slice(0, 3)).toEqual([255, 128, 128]);
    ctx = strip();
    applyGradientMap(ctx, params(), { width: 3, height: 1, blend: 'normal', opacity: 0 });
    expect(px(ctx).slice(0, 3)).toEqual([255, 255, 255]);
    // white point 50 %: mid grey already maps to the bright end
    const lut = gradientLut(readGradientMap(params({ 'gmap.white': 50 })));
    expect([...lut.slice(600 * 4, 600 * 4 + 3)]).toEqual([255, 0, 0]);
    // 2 bands: only the two end colours
    const b2 = gradientLut(readGradientMap(params({ 'gmap.bands': 2 })));
    const colours = new Set();
    for (let i = 0; i < 1024; i++) colours.add(b2.slice(i * 4, i * 4 + 3).join());
    expect(colours.size).toBe(2);
  });

  it('blend maths match Canvas for opaque pixels (every mode)', () => {
    const base = [0.8, 0.3, 0.55];
    const src = [0.2, 0.7, 0.45];
    for (const [mode, op] of Object.entries(BLEND_MODES)) {
      const c = createCanvas(1, 1);
      const ctx = c.getContext('2d');
      ctx.fillStyle = `rgb(${base.map((v) => v * 255).join(',')})`;
      ctx.fillRect(0, 0, 1, 1);
      ctx.globalCompositeOperation = op;
      ctx.fillStyle = `rgb(${src.map((v) => v * 255).join(',')})`;
      ctx.fillRect(0, 0, 1, 1);
      const want = [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
      const got = blendRgb(mode, base, src).map((v) => v * 255);
      for (const [i, v] of got.entries()) {
        expect(Math.abs(v - want[i]), `${mode}[${i}]`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('in a stack it changes only the layers below it', () => {
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: LAYER_TYPES,
    });
    const blob = (id, x) => ({
      id,
      type: 'blob',
      params: {
        ...getDefaults(LAYER_TYPES.blob.schema),
        'blob.radius': 8,
        'single.scaleOverLife': [
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ],
      },
      matrix: [1, 0, 0, 1, x, 0],
    });
    const effect = (layers) => ({
      id: 'x',
      timing: { frameCount: 5, fps: 30, loop: false, holdMode: 'ones' },
      layers,
    });
    const gmap = {
      id: 'g',
      type: 'gradientMap',
      params: params({
        'gmap.ramp': [
          { pos: 0, color: '#00ff00' },
          { pos: 1, color: '#00ff00' },
        ],
      }),
    };
    const settings = { width: 64, height: 32 };
    const plain = r.renderFrameImageData(
      effect([blob('a', -16), blob('b', 16)]),
      1,
      0,
      settings,
    ).data;
    const mapped = r.renderFrameImageData(
      effect([blob('a', -16), gmap, blob('b', 16)]),
      1,
      0,
      settings,
    ).data;
    const at = (d, x, y) => [...d.slice((y * 64 + x) * 4, (y * 64 + x) * 4 + 4)];
    expect(at(plain, 16, 16)[3]).toBeGreaterThan(200);
    expect(at(mapped, 16, 16).slice(0, 3)).toEqual([0, 255, 0]); // left blob: below → green
    expect(at(mapped, 48, 16)).toEqual(at(plain, 48, 16)); // right blob: above → unchanged
    expect(at(mapped, 16, 16)[3]).toBe(at(plain, 16, 16)[3]); // alpha kept
  });
});
