import { describe, expect, it } from 'vitest';
import { readRippleParams, rippleProgress } from '../../src/shapes/ripple.js';
import { jetShape, readDrop, readJet } from '../../src/shapes/water.js';

const jp = (o = {}) =>
  readJet(Object.fromEntries(Object.entries(o).map(([k, v]) => [`jet.${k}`, v])));

describe('water (D-101)', () => {
  it('the jet rises to its height, then hangs and falls (ballistic)', () => {
    const p = jp({ height: 300, apex: 0.35 });
    const top = (age) =>
      Math.min(
        ...jetShape(p, 1, age)
          .pieces.flat()
          .map((c) => c.y),
      );
    const t1 = top(0.1);
    const t25 = top(0.25);
    const t3 = top(0.35);
    expect(-t3).toBeGreaterThan(280);
    expect(-t3).toBeLessThan(330);
    // fast out, hanging near the top: the first 0.1 climbs far more than the last 0.1
    expect(-t1).toBeGreaterThan(3 * (t25 - t3));
  });

  it('the column necks and pinches into several drops; no drop balloons', () => {
    const p = jp({ height: 300, radius: 20, breakStart: 0.2, breakTime: 0.3 });
    expect(jetShape(p, 2, 0.15).pieces.length).toBe(1);
    const late = jetShape(p, 2, 0.6).pieces;
    expect(late.length).toBeGreaterThan(2);
    for (const pc of late) for (const c of pc) expect(c.r).toBeLessThanOrEqual(20 * 1.35 + 1e-9);
  });

  it('the jet is pure: same seed and age → same shape', () => {
    const p = jp();
    expect(jetShape(p, 5, 0.42)).toEqual(jetShape(p, 5, 0.42));
  });

  it('drop defaults and ripple rings that slow down', () => {
    expect(readDrop({}).stretch).toBe(1);
    const rp = readRippleParams({
      'ripple.mode': 'burst',
      'ripple.count': 1,
      'ripple.cycles': 1,
      'ripple.radius': 100,
      'ripple.ease': 1,
    });
    expect(rp.ease).toBe(1);
    expect(rippleProgress(rp, 0.5)[0]).toBeCloseTo(0.5, 6);
  });
});
