// Renderer tests on REAL pixels, using @napi-rs/canvas (Skia) as the Canvas 2D implementation.
import { createHash } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { BLEND_MODE_LABELS, BLEND_MODES } from '../../src/render/compositor.js';
import {
  createCanvas2DBackend,
  createRenderer,
  DEBUG_LAYER_TYPES,
} from '../../src/render/index.js';

const backend = createCanvas2DBackend((w, h) => createCanvas(w, h));
const newRenderer = (extraTypes = {}) =>
  createRenderer({ backend, layerTypes: { ...DEBUG_LAYER_TYPES, ...extraTypes } });

const SIZE = { width: 64, height: 64 };
const hashPixels = (img) => createHash('sha1').update(img.data).digest('hex');
const pixel = (img, x, y) => [
  ...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
];

/** Three moving, overlapping circles with different blend modes and seeded jitter. */
const demoEffect = {
  id: 'demo',
  timing: { frameCount: 24, fps: 24, loop: false },
  layers: [
    {
      id: 'red',
      type: 'debugCircle',
      blend: 'normal',
      params: {
        color: '#ff3030',
        radius: 14,
        from: { x: -20, y: 0 },
        to: { x: 20, y: 0 },
        jitter: 3,
      },
    },
    {
      id: 'green',
      type: 'debugCircle',
      blend: 'add',
      opacity: 0.8,
      params: {
        color: '#30ff30',
        radius: 12,
        from: { x: 0, y: -20 },
        to: { x: 0, y: 20 },
        easing: 'outBack',
        jitter: 3,
      },
    },
    {
      id: 'blue',
      type: 'debugCircle',
      blend: 'screen',
      params: {
        color: '#3030ff',
        radius: 10,
        from: { x: 20, y: 20 },
        to: { x: -20, y: -20 },
        jitter: 3,
      },
    },
  ],
};

describe('renderFrame — determinism', () => {
  it('same effect + seed + frame → identical pixels', () => {
    const r = newRenderer();
    const a = hashPixels(r.renderFrameImageData(demoEffect, 42, 9, SIZE));
    const b = hashPixels(r.renderFrameImageData(demoEffect, 42, 9, SIZE));
    expect(a).toBe(b);
  });

  it('any frame renders the same alone, in order, in reverse, or in a fresh renderer', () => {
    const r = newRenderer();
    const forward = Array.from({ length: 24 }, (_, f) =>
      hashPixels(r.renderFrameImageData(demoEffect, 7, f, SIZE)),
    );
    const backward = [];
    for (let f = 23; f >= 0; f--)
      backward[f] = hashPixels(r.renderFrameImageData(demoEffect, 7, f, SIZE));
    expect(backward).toEqual(forward);
    expect(hashPixels(newRenderer().renderFrameImageData(demoEffect, 7, 17, SIZE))).toBe(
      forward[17],
    );
    expect(new Set(forward).size).toBeGreaterThan(20); // it actually animates
  });

  it('different seeds give different frames; layer sub-seeds are independent', () => {
    const r = newRenderer();
    const s1 = hashPixels(r.renderFrameImageData(demoEffect, 1, 5, SIZE));
    const s2 = hashPixels(r.renderFrameImageData(demoEffect, 2, 5, SIZE));
    expect(s1).not.toBe(s2);

    // Removing the blue layer must not move the red one (red drawn alone either way).
    const redOnly = (layers) => ({ ...demoEffect, layers: layers.filter((l) => l.id === 'red') });
    const withAll = hashPixels(r.renderFrameImageData(redOnly(demoEffect.layers), 3, 5, SIZE));
    const reordered = hashPixels(
      r.renderFrameImageData(redOnly([...demoEffect.layers].reverse()), 3, 5, SIZE),
    );
    expect(withAll).toBe(reordered);
  });
});

describe('renderFrame — holds', () => {
  it('frames inside a hold are pixel-identical; a new hold changes the drawing', () => {
    const r = newRenderer();
    const twos = { ...demoEffect, timing: { ...demoEffect.timing, holdMode: 'twos' } };
    const f = (i) => hashPixels(r.renderFrameImageData(twos, 7, i, SIZE));
    expect(f(5)).toBe(f(4));
    expect(f(6)).not.toBe(f(5));
    const threes = { ...demoEffect, timing: { ...demoEffect.timing, holdMode: 'threes' } };
    const g = (i) => hashPixels(r.renderFrameImageData(threes, 7, i, SIZE));
    expect(g(7)).toBe(g(6));
    expect(g(8)).toBe(g(6));
    expect(g(9)).not.toBe(g(8));
  });
});

describe('renderFrame — compositing', () => {
  const fills = (...layers) => ({
    id: 'fills',
    timing: { frameCount: 1, fps: 24, loop: false },
    layers: layers.map((l, i) => ({ id: `l${i}`, type: 'debugFill', ...l })),
  });
  const centre = (effect, settings = {}) =>
    pixel(newRenderer().renderFrameImageData(effect, 0, 0, { ...SIZE, ...settings }), 32, 32);

  it('normal blend: top layer covers the bottom one', () => {
    expect(
      centre(fills({ params: { color: '#102030' } }, { params: { color: '#405060' } })),
    ).toEqual([0x40, 0x50, 0x60, 255]);
  });

  it('add blend sums colours (and clips at 255)', () => {
    const px = centre(
      fills({ params: { color: '#646464' } }, { blend: 'add', params: { color: '#643200' } }),
    );
    expect(px).toEqual([200, 150, 100, 255]);
    expect(
      centre(
        fills({ params: { color: '#c8c8c8' } }, { blend: 'add', params: { color: '#c8c8c8' } }),
      ),
    ).toEqual([255, 255, 255, 255]);
  });

  it('screen blend: 1 − (1 − a)(1 − b)', () => {
    const [r] = centre(
      fills({ params: { color: '#808080' } }, { blend: 'screen', params: { color: '#808080' } }),
    );
    const a = 128 / 255;
    expect(Math.abs(r - 255 * (1 - (1 - a) * (1 - a)))).toBeLessThanOrEqual(1);
  });

  it('opacity and disabled layers', () => {
    const [r] = centre(
      fills({ params: { color: '#000000' } }, { opacity: 0.5, params: { color: '#ffffff' } }),
    );
    expect(Math.abs(r - 128)).toBeLessThanOrEqual(1);
    expect(
      centre(
        fills({ params: { color: '#112233' } }, { enabled: false, params: { color: '#ffffff' } }),
      ),
    ).toEqual([0x11, 0x22, 0x33, 255]);
  });

  it('transparent by default, or a solid background colour', () => {
    expect(centre(fills())).toEqual([0, 0, 0, 0]);
    expect(centre(fills(), { background: '#0a0b0c' })).toEqual([10, 11, 12, 255]);
  });

  it('background sits behind the finished effect (add layers stay visible on white)', () => {
    // On a transparent output an "add" layer keeps its own colour; the white background is
    // then placed behind it, as a game engine would draw the exported sprite.
    expect(
      centre(fills({ blend: 'add', params: { color: '#ff0000' } }), { background: '#ffffff' }),
    ).toEqual([255, 0, 0, 255]);
  });

  it('nothing a layer leaves behind (alpha, styles, transform) leaks into the next layer', () => {
    const messy = {
      render(ctx) {
        ctx.globalAlpha = 0.1;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.translate(1000, 1000);
        ctx.fillStyle = '#ff0000';
      },
    };
    const effect = {
      id: 'leak',
      timing: { frameCount: 1, fps: 24, loop: false },
      layers: [
        { id: 'a', type: 'messy' },
        {
          id: 'b',
          type: 'debugCircle',
          params: { color: '#00ff00', radius: 5, from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
        },
      ],
    };
    const img = newRenderer({ messy }).renderFrameImageData(effect, 0, 0, SIZE);
    expect(pixel(img, 32, 32)).toEqual([0, 255, 0, 255]);
  });
});

describe('renderFrame — coordinates, scale and errors', () => {
  const dot = (x, y, radius = 4) => ({
    id: 'dot',
    timing: { frameCount: 1, fps: 24, loop: false },
    layers: [
      {
        id: 'd',
        type: 'debugCircle',
        params: { color: '#ffffff', radius, from: { x, y }, to: { x, y } },
      },
    ],
  });

  it('origin sits at the pivot (default centre, or custom)', () => {
    const r = newRenderer();
    expect(pixel(r.renderFrameImageData(dot(0, 0), 0, 0, SIZE), 32, 32)[3]).toBe(255);
    const bottom = r.renderFrameImageData(dot(0, -2), 0, 0, { ...SIZE, pivot: { x: 0.5, y: 1 } });
    expect(pixel(bottom, 32, 61)[3]).toBe(255);
    expect(pixel(bottom, 32, 32)[3]).toBe(0);
  });

  it('scale multiplies effect pixels', () => {
    const r = newRenderer();
    const at1 = r.renderFrameImageData(dot(0, 0, 8), 0, 0, SIZE);
    const at2 = r.renderFrameImageData(dot(0, 0, 8), 0, 0, { ...SIZE, scale: 2 });
    expect(pixel(at1, 32 + 12, 32)[3]).toBe(0); // outside radius 8
    expect(pixel(at2, 32 + 12, 32)[3]).toBe(255); // inside radius 16
  });

  it('can change output size between calls', () => {
    const r = newRenderer();
    expect(r.renderFrameImageData(dot(0, 0), 0, 0, SIZE).width).toBe(64);
    const big = r.renderFrameImageData(dot(0, 0), 0, 0, { width: 128, height: 32 });
    expect([big.width, big.height]).toEqual([128, 32]);
    expect(pixel(big, 64, 16)[3]).toBe(255);
  });

  it('reports unknown layer types, blend modes and bad sizes clearly', () => {
    const r = newRenderer();
    const bad = (layer) => ({ ...dot(0, 0), layers: [{ ...dot(0, 0).layers[0], ...layer }] });
    expect(() => r.renderFrame(bad({ type: 'nope' }), 0, 0, SIZE)).toThrow(
      /Unknown layer type "nope"/,
    );
    expect(() => r.renderFrame(bad({ blend: 'dissolve' }), 0, 0, SIZE)).toThrow(
      /Unknown blend mode/,
    );
    expect(() => r.renderFrame(dot(0, 0), 0, 0, { width: 0, height: 10 })).toThrow(/render size/);
  });
});

describe('style: ramp colouring on real pixels', async () => {
  const { LAYER_TYPES } = await import('../../src/effects/layerTypes.js');
  const { getDefaults } = await import('../../src/schema/index.js');
  const base = getDefaults(LAYER_TYPES.blob.schema);
  const r = createRenderer({ backend, layerTypes: LAYER_TYPES });
  const blob = (over) => ({
    id: 'b',
    timing: { frameCount: 3, fps: 24, loop: false },
    layers: [
      {
        id: 'b',
        type: 'blob',
        params: {
          ...base,
          'blob.noise': 0,
          'blob.radius': 20,
          'single.scaleOverLife': [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
          'single.opacityOverLife': [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
          ],
          'shade.shadow': 0, // these tests are about the ramp only
          'style.ramp': [
            { pos: 0, color: '#ffffff' },
            { pos: 0.5, color: '#ff0000' },
            { pos: 1, color: '#0000ff' },
          ],
          ...over,
        },
      },
    ],
  });

  it('flat colour follows ramp over life (start = left end, end = right end)', () => {
    const flat = blob({ 'style.spread': 0 });
    expect(pixel(r.renderFrameImageData(flat, 1, 0, SIZE), 32, 32)).toEqual([255, 255, 255, 255]);
    expect(pixel(r.renderFrameImageData(flat, 1, 1, SIZE), 32, 32)).toEqual([255, 0, 0, 255]);
    expect(pixel(r.renderFrameImageData(flat, 1, 2, SIZE), 32, 32)).toEqual([0, 0, 255, 255]);
  });

  it('core is earlier on the ramp than the edge', () => {
    const img = r.renderFrameImageData(blob({ 'style.spread': 0.5 }), 1, 0, SIZE);
    // The centre pixel is ~0.7 px from the exact centre, so it's already a touch along the ramp.
    const [cr, cg, cb] = pixel(img, 32, 32);
    expect(cr).toBe(255);
    expect(Math.min(cg, cb)).toBeGreaterThan(235);
    const [red, green] = pixel(img, 32 + 17, 32); // near the edge → close to red
    expect(red).toBe(255);
    expect(green).toBeLessThan(60);
  });
});

describe('blend modes and layer seeds (3.6a)', () => {
  const W = { width: 8, height: 8 };
  const rect = (color) => ({
    render(ctx) {
      ctx.fillStyle = color;
      ctx.fillRect(-4, -4, 8, 8);
    },
  });
  const r2 = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: { grey: rect('#808080'), red: rect('#ff0000') },
  });
  const px = (blend) => {
    const out = r2.renderFrame(
      {
        id: 'b',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: [
          { id: 'a', type: 'grey' },
          { id: 'b', type: 'red', blend },
        ],
      },
      0,
      0,
      W,
    );
    return [...out.ctx.getImageData(4, 4, 1, 1).data];
  };

  it('every listed blend mode renders, with the expected maths for the common ones', () => {
    for (const mode of Object.keys(BLEND_MODES)) expect(() => px(mode)).not.toThrow();
    expect(px('normal').slice(0, 3)).toEqual([255, 0, 0]);
    const m = px('multiply');
    expect(m[0]).toBeCloseTo(128, -1); // 1 × 0.5
    expect(m[1]).toBe(0);
    const d = px('difference');
    expect(d[0]).toBeCloseTo(127, -1); // |1 − 0.5|
    expect(d[1]).toBeCloseTo(128, -1); // |0 − 0.5|
    expect(px('add')[0]).toBe(255);
  });

  it('every blend mode has a display label', () => {
    expect(Object.keys(BLEND_MODE_LABELS).sort()).toEqual(Object.keys(BLEND_MODES).sort());
  });
});
