import { describe, expect, it } from 'vitest';
import { setLoopPeriod } from '../../src/core/loopContext.js';
import { celSmokeShape, readCelSmoke } from '../../src/shapes/celSmoke.js';

const p = (o = {}) =>
  readCelSmoke(Object.fromEntries(Object.entries(o).map(([k, v]) => [`cs.${k}`, v])));

describe('cel smoke (D-092)', () => {
  it('builds every form with the requested lumps', () => {
    for (const form of ['puff', 'column', 'bank', 'mushroom']) {
      const s = celSmokeShape(p({ form, lumps: 6 }), 3, 0.4, 0.5);
      expect(s.lumps.length).toBeGreaterThanOrEqual(form === 'bank' ? 6 : 4);
      for (const l of s.lumps) expect(Number.isFinite(l.x + l.y + l.r)).toBe(true);
    }
  });

  it('droplets only appear once it breaks up', () => {
    expect(celSmokeShape(p({ droplets: 8 }), 1, 0, 0.1).drops.length).toBe(0);
    expect(celSmokeShape(p({ droplets: 8 }), 1, 0, 0.7).drops.length).toBeGreaterThan(0);
  });

  it('column loops seamlessly and lumps vanish at both ends', () => {
    setLoopPeriod(2);
    try {
      const a = celSmokeShape(p({ form: 'column', rise: 0.8, boil: 0.6 }), 7, 0, 0);
      const b = celSmokeShape(p({ form: 'column', rise: 0.8, boil: 0.6 }), 7, 2, 0);
      a.lumps.forEach((l, i) => {
        expect(b.lumps[i].x).toBeCloseTo(l.x, 6);
        expect(b.lumps[i].r).toBeCloseTo(l.r, 6);
      });
      for (const l of a.lumps) if (l.age < 0.005 || l.age > 0.995) expect(l.r).toBeLessThan(1);
    } finally {
      setLoopPeriod(0);
    }
  });
});
