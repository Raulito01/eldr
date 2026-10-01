import { describe, expect, it } from 'vitest';
import { evalCurve } from '../../src/core/curve.js';

const pts = (...xy) => xy.map(([x, y]) => ({ x, y }));

describe('evalCurve', () => {
  it('passes exactly through its points and clamps outside 0–1', () => {
    const c = pts([0, 0], [0.25, 1], [1, 0.5]);
    expect(evalCurve(c, 0)).toBe(0);
    expect(evalCurve(c, 0.25)).toBeCloseTo(1, 12);
    expect(evalCurve(c, 1)).toBe(0.5);
    expect(evalCurve(c, -1)).toBe(0);
    expect(evalCurve(c, 2)).toBe(0.5);
  });

  it('two points = straight line', () => {
    const c = pts([0, 0.2], [1, 0.8]);
    for (let i = 0; i <= 10; i++) expect(evalCurve(c, i / 10)).toBeCloseTo(0.2 + 0.06 * i, 12);
  });

  it('never overshoots between points (flat stays flat, fades stay ≥ 0)', () => {
    const c = pts([0, 1], [0.7, 1], [1, 0]);
    for (let i = 0; i <= 100; i++) {
      const v = evalCurve(c, i / 100);
      expect(v).toBeLessThanOrEqual(1 + 1e-12);
      expect(v).toBeGreaterThanOrEqual(-1e-12);
      if (i <= 70) expect(v).toBeCloseTo(1, 12);
    }
  });

  it('is smooth through a peak (no sharp corner)', () => {
    const c = pts([0, 0], [0.5, 1], [1, 0]);
    const slopeLeft = (evalCurve(c, 0.5) - evalCurve(c, 0.499)) / 0.001;
    expect(Math.abs(slopeLeft)).toBeLessThan(0.05);
  });

  it('monotone input → monotone output', () => {
    const c = pts([0, 0], [0.1, 0.9], [0.2, 0.95], [1, 1]);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const v = evalCurve(c, i / 200);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = v;
    }
  });
});
