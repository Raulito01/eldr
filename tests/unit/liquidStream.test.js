import { describe, expect, it } from 'vitest';
import { readStream, streamShape } from '../../src/shapes/liquidStream.js';

const sp = (o = {}) =>
  readStream(Object.fromEntries(Object.entries(o).map(([k, v]) => [`stream.${k}`, v])));
const top = (s) => Math.min(...s.blobs.map((b) => b.y - b.r));
const meanX = (s) => s.blobs.reduce((a, b) => a + b.x, 0) / s.blobs.length;
/** pieces = groups of blobs joined by necks */
const pieces = (s) => s.blobs.length - s.necks.length;

describe('liquid stream (D-105)', () => {
  it('is pure: same settings → same water', () => {
    expect(streamShape(sp(), 4, 0.4)).toEqual(streamShape(sp(), 4, 0.4));
  });

  it('rises to its height, then pinches into several drops; no drop balloons', () => {
    const p = sp({ height: 300, radius: 15 });
    expect(-top(streamShape(p, 2, 0.34))).toBeGreaterThan(250);
    expect(pieces(streamShape(p, 2, 0.15))).toBe(1);
    expect(pieces(streamShape(p, 2, 0.55))).toBeGreaterThan(2);
    for (const b of streamShape(p, 2, 0.5).blobs) expect(b.r).toBeLessThanOrEqual(15 * 1.5 + 1e-9);
  });

  it('consistent controls: changing the blob count barely changes the shape', () => {
    for (const a of [0.2, 0.4]) {
      const A = streamShape(sp({ count: 90 }), 3, a);
      const B = streamShape(sp({ count: 96 }), 3, a);
      expect(Math.abs(top(A) - top(B))).toBeLessThan(12);
      expect(Math.abs(meanX(A) - meanX(B))).toBeLessThan(6);
    }
  });

  it('a leaning stream keeps moving outward as it falls (never back)', () => {
    const p = sp({ lean: 0.5 });
    let prev = -Infinity;
    for (let a = 0.1; a < 0.62; a += 0.05) {
      const x = meanX(streamShape(p, 6, a));
      expect(x).toBeGreaterThan(prev);
      prev = x;
    }
  });
});
