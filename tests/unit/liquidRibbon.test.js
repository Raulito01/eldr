import { describe, expect, it } from 'vitest';
import { builtInPath, readRibbon, ribbonShape } from '../../src/shapes/liquidRibbon.js';

const rp = (o = {}) =>
  readRibbon(Object.fromEntries(Object.entries(o).map(([k, v]) => [`ribbon.${k}`, v])));

describe('liquid ribbon (D-108)', () => {
  it('is pure', () => {
    expect(ribbonShape(rp(), 3, 0.3)).toEqual(ribbonShape(rp(), 3, 0.3));
  });

  it('follows a custom (pen) path: a straight line stays on the line', () => {
    const line = (u) => ({ x: -200 + 400 * u, y: 0, angle: 0 });
    const s = ribbonShape(rp({ drops: 0, burst: 0 }), 1, 0.3, line);
    expect(s.blobs.length).toBeGreaterThan(5);
    for (const b of s.blobs) expect(Math.abs(b.y)).toBeLessThan(1e-6);
    // the head runs forward over time
    const front = (a) =>
      Math.max(...ribbonShape(rp({ drops: 0, burst: 0 }), 1, a, line).blobs.map((b) => b.x));
    expect(front(0.2)).toBeLessThan(front(0.35));
  });

  it('the end burst flies on, away from the end (never back along the path)', () => {
    const p = rp({ drops: 0, burst: 8, gravity: 0 });
    const end = builtInPath(p.path, p.size).at(-1);
    const spread = (a) => {
      const bs = ribbonShape(p, 2, a).blobs;
      return bs.reduce((s, b) => s + Math.hypot(b.x - end[0], b.y - end[1]), 0) / bs.length;
    };
    expect(spread(0.9)).toBeGreaterThan(spread(0.85));
    expect(spread(0.95)).toBeGreaterThan(spread(0.9));
  });

  it('built-in paths exist', () => {
    for (const k of ['slash', 'two', 'wave', 'spiral'])
      expect(builtInPath(k, 300).length).toBeGreaterThan(20);
  });
});
