import { describe, expect, it } from 'vitest';
import { sparklePoints } from '../../src/shapes/sparkle.js';

const P = { size: 20, points: 4, thinness: 0.8, ratio: 0.5 };
const pts = (p) => {
  const a = sparklePoints(p);
  const out = [];
  for (let i = 0; i < a.length; i += 2) out.push([a[i], a[i + 1]]);
  return out;
};
const close = (a, b) => expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(1e-9);

describe('sparkle shape', () => {
  it('first spike points up; spikes alternate long / short', () => {
    const p = pts(P);
    expect(p.length).toBe(4 * 10);
    close(p[0], [0, -20]); // up, long
    close(p[10], [10, 0]); // right, short (ratio 0.5)
    close(p[20], [0, 20]); // down, long
    close(p[30], [-10, 0]); // left, short
  });

  it('sides are concave: edge midpoints are pulled in toward the centre', () => {
    const p = pts(P);
    const mid = p[5]; // halfway between the up and right tips
    expect(Math.hypot(mid[0], mid[1])).toBeLessThan(Math.hypot(5, -10)); // inside the straight edge
    const fat = pts({ ...P, thinness: 0 })[5];
    expect(Math.hypot(fat[0], fat[1])).toBeGreaterThan(Math.hypot(mid[0], mid[1]));
  });

  it('odd spike counts keep all spikes the same length', () => {
    const p = pts({ ...P, points: 5 });
    const tips = [0, 10, 20, 30, 40].map((i) => Math.hypot(p[i][0], p[i][1]));
    for (const t of tips) expect(t).toBeCloseTo(20, 9);
  });
});
