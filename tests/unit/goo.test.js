import { describe, expect, it } from 'vitest';
import { gooPixels, readGoo } from '../../src/render/goo.js';

/** two opaque squares with a gap between them, on a w×h transparent image */
function twoSquares(w, h, gap) {
  const d = new Uint8ClampedArray(w * h * 4);
  const put = (x0, x1) => {
    for (let y = 20; y < 40; y++)
      for (let x = x0; x < x1; x++) {
        const p = (y * w + x) * 4;
        d[p] = 255;
        d[p + 3] = 255;
      }
  };
  put(10, 30);
  put(30 + gap, 50 + gap);
  return d;
}
const alphaAt = (d, w, x, y) => d[(y * w + x) * 4 + 3];

describe('goo (D-078)', () => {
  it('melts close shapes into one (a bridge across the gap), leaves far ones apart', () => {
    const w = 120;
    const h = 60;
    const g = readGoo({ 'goo.amount': 6 });
    const near = twoSquares(w, h, 6);
    gooPixels(near, w, h, g, 6);
    expect(alphaAt(near, w, 33, 30)).toBeGreaterThan(200); // the gap filled
    const far = twoSquares(w, h, 50);
    gooPixels(far, w, h, g, 6);
    expect(alphaAt(far, w, 55, 30)).toBe(0); // still apart
  });

  it('keeps the original shapes on top; off = the smooth silhouette only; amount 0 = untouched', () => {
    const w = 120;
    const h = 60;
    const d = twoSquares(w, h, 6);
    gooPixels(d, w, h, readGoo({ 'goo.amount': 6 }), 6);
    expect(alphaAt(d, w, 11, 21)).toBe(255); // corner kept
    const soft = twoSquares(w, h, 6);
    gooPixels(soft, w, h, readGoo({ 'goo.amount': 6, 'goo.keepShapes': false }), 6);
    expect(alphaAt(soft, w, 10, 20)).toBeLessThan(255); // corner rounded off
    expect(readGoo({}).amount).toBe(0);
  });
});
