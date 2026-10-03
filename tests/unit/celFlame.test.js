import { describe, expect, it } from 'vitest';
import { setLoopPeriod } from '../../src/core/loopContext.js';
import { celFlameShape, readCelFlame } from '../../src/shapes/celFlame.js';

const p = (o = {}) => ({ ...readCelFlame({}), ...o });

describe('Cel flame — bitten teardrop (D-090)', () => {
  it('outline: base at 0, tip at −height, round bottom', () => {
    const s = celFlameShape(p({ wobble: 0, lean: 0 }), 1, 0);
    const ys = s.outline.filter((_, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeCloseTo(0, 5);
    expect(Math.min(...ys)).toBeCloseTo(-220, 5);
    expect(s.half(0.2)).toBeGreaterThan(s.half(0.8));
  });

  it('bites: one per lane, alternating sides, rising over time, whole cycles per loop', () => {
    const a = celFlameShape(p({ wobble: 0 }), 3, 0);
    expect(a.bites).toHaveLength(4);
    expect(Math.sign(a.bites[0].x)).not.toBe(Math.sign(a.bites[1].x));
    const later = celFlameShape(p({ wobble: 0 }), 3, 0.1);
    expect(later.bites[0].y).toBeLessThan(a.bites[0].y + 1e-9 + (a.bites[0].y > -30 ? 300 : 0));
    // loop of 2 s: the shape at 0 and at 2 s is identical
    setLoopPeriod(2);
    try {
      const s0 = celFlameShape(p({ biteSpeed: 1.3, wobbleSpeed: 0.7 }), 5, 0);
      const s2 = celFlameShape(p({ biteSpeed: 1.3, wobbleSpeed: 0.7 }), 5, 2);
      s0.outline.forEach((v, i) => expect(s2.outline[i]).toBeCloseTo(v, 6));
      s0.bites.forEach((b, i) => expect(s2.bites[i].y).toBeCloseTo(b.y, 6));
    } finally {
      setLoopPeriod(0);
    }
  });

  it('bite depth: 0 grazes outside the edge, 1 sits deep inside', () => {
    const at = (biteDepth) => celFlameShape(p({ wobble: 0, biteDepth }), 2, 0).bites[0];
    const shallow = at(0);
    const deep = at(1);
    expect(Math.abs(shallow.x)).toBeGreaterThan(Math.abs(deep.x));
  });
});
