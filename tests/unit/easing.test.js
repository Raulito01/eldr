import { describe, expect, it } from 'vitest';
import { cubicBezier, EASING_NAMES, EASINGS, getEasing } from '../../src/core/easing.js';

describe('easings', () => {
  it.each(EASING_NAMES)('%s maps 0 → 0 and 1 → 1', (name) => {
    const fn = EASINGS[name];
    expect(fn(0)).toBeCloseTo(0, 6);
    expect(fn(1)).toBeCloseTo(1, 6);
  });

  it('non-overshooting easings are monotonic and stay in 0–1', () => {
    const overshooting = new Set(['inBack', 'outBack', 'inOutBack', 'outElastic']);
    for (const name of EASING_NAMES) {
      if (overshooting.has(name) || name === 'outBounce') continue;
      const fn = EASINGS[name];
      let prev = fn(0);
      for (let i = 1; i <= 200; i++) {
        const v = fn(i / 200);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
        expect(v).toBeGreaterThanOrEqual(-1e-12);
        expect(v).toBeLessThanOrEqual(1 + 1e-12);
        prev = v;
      }
    }
  });

  it('inBack dips below 0 (anticipation) and outBack overshoots above 1', () => {
    expect(EASINGS.inBack(0.2)).toBeLessThan(0);
    expect(EASINGS.outBack(0.8)).toBeGreaterThan(1);
  });

  it('inOut easings pass through the midpoint', () => {
    for (const name of EASING_NAMES.filter((n) => n.startsWith('inOut'))) {
      expect(EASINGS[name](0.5)).toBeCloseTo(0.5, 6);
    }
  });

  it('getEasing throws on unknown names', () => {
    expect(getEasing('outQuad')).toBe(EASINGS.outQuad);
    expect(() => getEasing('outQaud')).toThrow(/Unknown easing/);
  });
});

describe('cubicBezier', () => {
  it('(0,0,1,1) is linear', () => {
    const fn = cubicBezier(0, 0, 1, 1);
    for (let i = 0; i <= 10; i++) expect(fn(i / 10)).toBeCloseTo(i / 10, 5);
  });

  it('CSS "ease" matches known values', () => {
    const ease = cubicBezier(0.25, 0.1, 0.25, 1);
    expect(ease(0.5)).toBeCloseTo(0.8024, 3);
    expect(ease(0.25)).toBeCloseTo(0.4085, 3); // verified by brute-force sampling
  });

  it('clamps outside 0–1 and allows y overshoot', () => {
    const fn = cubicBezier(0.3, -0.5, 0.7, 1.5);
    expect(fn(-1)).toBe(0);
    expect(fn(2)).toBe(1);
    const values = Array.from({ length: 101 }, (_, i) => fn(i / 100));
    expect(Math.min(...values)).toBeLessThan(0);
    expect(Math.max(...values)).toBeGreaterThan(1);
  });
});
