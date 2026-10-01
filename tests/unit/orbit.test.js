import { describe, expect, it } from 'vitest';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import {
  inHalf,
  orbitHalfRanges,
  orbitInstances,
  orbitPlane,
  readOrbitParams,
} from '../../src/elements/orbit.js';
import { getDefaults } from '../../src/schema/schema.js';

const base = (over = {}) => ({
  ...readOrbitParams(getDefaults(LAYER_TYPES.orbitSparkle.schema)),
  radiusVariance: 0,
  sizeVariance: 0,
  jitter: 0,
  ...over,
});

describe('orbit plane', () => {
  it('tilt squashes y by cos(tilt); the bottom is the near side', () => {
    const pl = orbitPlane(base({ tilt: 60, planeAngle: 0 }));
    const [x, y] = pl.project(10, 100);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(50, 9);
    expect(pl.depth(100, 100)).toBeCloseTo(Math.sin(Math.PI / 3), 9);
    expect(pl.depth(-100, 100)).toBeLessThan(0);
  });

  it('plane angle rotates the projected ellipse', () => {
    const [x, y] = orbitPlane(base({ tilt: 0, planeAngle: 90 })).project(100, 0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(100, 9);
  });
});

describe('orbit instances', () => {
  it('one full turn later every element is back where it started', () => {
    const p = base({ speed: 0.5 });
    const a = orbitInstances(p, 0.5, 0.3, 9);
    const b = orbitInstances(p, 0.5, 2.3, 9); // 2 s × 0.5 turns/s = 1 turn
    expect(b.length).toBe(a.length);
    a.forEach((m, i) => {
      expect(b[i].x).toBeCloseTo(m.x, 6);
      expect(b[i].y).toBeCloseTo(m.y, 6);
    });
  });

  it('flat orbit: evenly spread around the radius; start angle 0 = top', () => {
    const p = base({ tilt: 0, planeAngle: 0, count: 4, speed: 0, radius: 100 });
    const pts = orbitInstances(p, 0.5, 0, 1).map((m) => [Math.round(m.x) + 0, Math.round(m.y) + 0]);
    expect(pts).toEqual(
      expect.arrayContaining([
        [0, -100],
        [100, 0],
        [0, 100],
        [-100, 0],
      ]),
    );
  });

  it('front and back halves are complementary and sorted far → near', () => {
    const p = base({ count: 9, speed: 0.37 });
    const all = orbitInstances(p, 0.4, 1.1, 5);
    const back = orbitInstances({ ...p, show: 'back' }, 0.4, 1.1, 5);
    const front = orbitInstances({ ...p, show: 'front' }, 0.4, 1.1, 5);
    expect(back.length + front.length).toBe(all.length);
    expect(back.every((m) => m.depth < 0)).toBe(true);
    expect(front.every((m) => m.depth >= 0)).toBe(true);
    for (let i = 1; i < all.length; i++)
      expect(all[i].depth).toBeGreaterThanOrEqual(all[i - 1].depth);
  });

  it('near side is bigger, more opaque and less ramp-shifted than the far side', () => {
    const p = base({ count: 2, speed: 0, startAngle: 0, tilt: 70 }); // top (far) and bottom (near)
    const [far, near] = orbitInstances(p, 0.5, 0, 3);
    expect(far.depth).toBeLessThan(near.depth);
    expect(near.scale).toBeGreaterThan(far.scale);
    expect(near.opacity).toBeGreaterThan(far.opacity);
    expect(near.rampShift).toBeLessThan(far.rampShift);
  });

  it('raising the count never moves existing elements (per-element sub-seeds)', () => {
    const p = base({ jitter: 0.6, radiusVariance: 0.4, spread: 120 });
    // spacing depends on the count, but each element's own random radius never changes
    const r3 = orbitInstances({ ...p, count: 3 }, 0.5, 0, 4).map((m) => m.orbitRadius);
    const r5 = orbitInstances({ ...p, count: 5 }, 0.5, 0, 4).map((m) => m.orbitRadius);
    for (const r of r3) expect(r5.some((q) => Math.abs(q - r) < 1e-9)).toBe(true);
  });

  it('respects the life window', () => {
    const p = base({ start: 0.2, end: 0.6 });
    expect(orbitInstances(p, 0.1, 0, 1)).toEqual([]);
    expect(orbitInstances(p, 0.7, 0, 1)).toEqual([]);
    expect(orbitInstances(p, 0.4, 0, 1).length).toBe(p.count);
  });

  it('follow path: instances sit at the centre and are never filtered by depth', () => {
    const p = base({ followPath: true, show: 'front', count: 6, x: 12, y: -4 });
    const out = orbitInstances(p, 0.5, 0.2, 2);
    expect(out.length).toBe(6);
    for (const m of out) expect([m.x, m.y, m.scale]).toEqual([12, -4, 1]);
  });
});

describe('orbit half ranges', () => {
  const depth = (v) => Math.sin(2 * Math.PI * v); // + on (0, .5), − on (.5, 1)

  it('front and back ranges cover [0, 1] exactly, cut at the depth crossing', () => {
    const front = orbitHalfRanges(depth, 'front');
    const back = orbitHalfRanges(depth, 'back');
    expect(front.length).toBe(1);
    expect(front[0][0]).toBe(0);
    expect(front[0][1]).toBeCloseTo(0.5, 6);
    expect(back[0][0]).toBeCloseTo(0.5, 6);
    expect(back[0][1]).toBe(1);
    const total = [...front, ...back].reduce((s, [a, b]) => s + (b - a), 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('"all" is the whole strip; inHalf matches the instance filter', () => {
    expect(orbitHalfRanges(depth, 'all')).toEqual([[0, 1]]);
    expect(inHalf('front', 0)).toBe(true);
    expect(inHalf('back', 0)).toBe(false);
  });
});
