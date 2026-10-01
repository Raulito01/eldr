import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/prng.js';
import { applyOutline, distanceTransform } from '../../src/render/outline.js';

describe('distanceTransform', () => {
  it('matches brute force on random masks (distances and nearest pixel distance)', () => {
    const rng = createRng(5);
    for (let trial = 0; trial < 6; trial++) {
      const w = 17;
      const h = 13;
      const mask = new Uint8Array(w * h).map(() => (rng.chance(0.08) ? 1 : 0));
      mask[rng.int(0, w * h - 1)] = 1;
      const { dist2, nearest } = distanceTransform(mask, w, h);
      for (let p = 0; p < w * h; p++) {
        let best = Infinity;
        for (let q = 0; q < w * h; q++) {
          if (!mask[q]) continue;
          const dx = (p % w) - (q % w);
          const dy = Math.floor(p / w) - Math.floor(q / w);
          best = Math.min(best, dx * dx + dy * dy);
        }
        expect(dist2[p]).toBe(best);
        const q = nearest[p];
        expect(mask[q]).toBe(1);
        const dx = (p % w) - (q % w);
        const dy = Math.floor(p / w) - Math.floor(q / w);
        expect(dx * dx + dy * dy).toBe(best);
      }
    }
  });

  it('empty mask → no nearest pixel', () => {
    const { nearest } = distanceTransform(new Uint8Array(9), 3, 3);
    expect([...nearest]).toEqual(new Array(9).fill(-1));
  });
});

/** 21×21 image with an opaque 7×7 square in the middle of colour (200, 100, 50). */
function square(alpha = 255) {
  const w = 21;
  const data = new Uint8ClampedArray(w * w * 4);
  for (let y = 7; y < 14; y++) {
    for (let x = 7; x < 14; x++) data.set([200, 100, 50, alpha], (y * w + x) * 4);
  }
  return { data, width: w, height: w };
}
const at = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

describe('applyOutline', () => {
  const base = { px: 2, colorMode: 'custom', darken: 0.5, color: [0, 0, 255] };

  it('outer: a solid ring of the given thickness outside the fill, fill untouched', () => {
    const img = square();
    applyOutline(img, { ...base, mode: 'outer' });
    expect(at(img, 6, 10)).toEqual([0, 0, 255, 255]); // 1 px out
    expect(at(img, 5, 10)).toEqual([0, 0, 255, 255]); // 2 px out
    expect(at(img, 3, 10)[3]).toBe(0); // 4 px out: nothing
    expect(at(img, 10, 10)).toEqual([200, 100, 50, 255]);
  });

  it('inner: recolours the fill edge, never grows the shape', () => {
    const img = square();
    applyOutline(img, { ...base, mode: 'inner' });
    expect(at(img, 7, 10)).toEqual([0, 0, 255, 255]); // edge pixel
    expect(at(img, 10, 10)).toEqual([200, 100, 50, 255]); // centre untouched
    expect(at(img, 6, 10)[3]).toBe(0); // outside still empty
  });

  it('darken mode takes the touched colour, darkened', () => {
    const img = square();
    applyOutline(img, { ...base, colorMode: 'darken', darken: 0.5, mode: 'outer' });
    expect(at(img, 6, 10)).toEqual([100, 50, 25, 255]);
  });

  it('a faded layer keeps a faded outline (no pop-off)', () => {
    const img = square(80);
    applyOutline(img, { ...base, mode: 'outer' });
    expect(at(img, 6, 10)).toEqual([0, 0, 255, 80]);
  });

  it('thickness 0 or an empty image changes nothing', () => {
    const img = square();
    const before = img.data.slice();
    applyOutline(img, { ...base, px: 0, mode: 'both' });
    expect(img.data).toEqual(before);
    const empty = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
    applyOutline(empty, { ...base, mode: 'both' });
    expect([...empty.data]).toEqual(new Array(16).fill(0));
  });
});

describe('outline as a layer post-process (real pixels)', async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const { LAYER_TYPES } = await import('../../src/effects/layerTypes.js');
  const { createCanvas2DBackend } = await import('../../src/render/canvas2d/backend.js');
  const { createRenderer } = await import('../../src/render/renderer.js');
  const { getDefaults } = await import('../../src/schema/index.js');
  const r = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: LAYER_TYPES,
  });
  const base = getDefaults(LAYER_TYPES.blob.schema);
  const render = (over, scale = 1) =>
    r.renderFrameImageData(
      {
        id: 'o',
        timing: { frameCount: 1, fps: 24, loop: false },
        layers: [
          {
            id: 'o',
            type: 'blob',
            params: {
              ...base,
              'blob.radius': 30,
              'blob.noise': 0,
              'single.scaleOverLife': [
                { x: 0, y: 1 },
                { x: 1, y: 1 },
              ],
              'shade.shadow': 0,
              'outline.colorMode': 'custom',
              'outline.color': '#00ff00',
              ...over,
            },
          },
        ],
      },
      1,
      0,
      { width: 128 * scale, height: 128 * scale, scale },
    );
  const px = (img, x, y) => [
    ...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4),
  ];

  it('off by default: nothing outside the shape', () => {
    expect(px(render({}), 64 + 32, 64)[3]).toBe(0);
  });

  it('outer outline appears just outside the shape', () => {
    expect(px(render({ 'outline.mode': 'outer', 'outline.px': 4 }), 64 + 32, 64)).toEqual([
      0, 255, 0, 255,
    ]);
  });

  it('thickness scales with the render scale (2× export keeps proportions)', () => {
    const img = render({ 'outline.mode': 'outer', 'outline.px': 4 }, 2);
    expect(px(img, 128 + 64, 128)).toEqual([0, 255, 0, 255]); // 4 px × 2 = 8 device px wide
    expect(px(img, 128 + 72, 128)[3]).toBe(0);
  });
});

describe('alphaBounds', async () => {
  const { alphaBounds } = await import('../../src/render/outline.js');
  it('finds the visible area (exclusive max) or null', () => {
    const img = square();
    expect(alphaBounds(img)).toEqual({ x0: 7, y0: 7, x1: 14, y1: 14 });
    expect(alphaBounds({ data: new Uint8ClampedArray(16), width: 2, height: 2 })).toBeNull();
  });
});
