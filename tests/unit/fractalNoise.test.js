import { describe, expect, it } from 'vitest';
import { setLoopPeriod } from '../../src/core/loopContext.js';
import { noiseGrid, readNoise, toneOf } from '../../src/render/fractalNoise.js';

const cfg = (o = {}) =>
  readNoise(Object.fromEntries(Object.entries(o).map(([k, v]) => [`fn.${k}`, v])), 'fn');
const box = { x: 0, y: 0, w: 120, h: 120 };
const flat = (x, y) => [x, y, 0];
const grid = (c, s = 0.4, seed = 3) => noiseGrid(c, seed, s, box, flat).grid;
const meanAbsDiff = (a, b) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;

describe('fractal noise (D-104)', () => {
  it('is deterministic', () => {
    expect(grid(cfg({ type: 'liquid' }))).toEqual(grid(cfg({ type: 'liquid' })));
  });

  it('every type comes out centred with the same spread', () => {
    for (const type of ['basic', 'turbulent', 'ridges', 'liquid', 'cells']) {
      const g = noiseGrid(
        cfg({ type, scale: 20 }),
        5,
        0,
        { x: 0, y: 0, w: 400, h: 400 },
        flat,
      ).grid;
      const m = g.reduce((s, v) => s + v, 0) / g.length;
      const sd = Math.sqrt(g.reduce((s, v) => s + (v - m) ** 2, 0) / g.length);
      expect(Math.abs(m)).toBeLessThan(0.15);
      expect(sd).toBeGreaterThan(0.33);
      expect(sd).toBeLessThan(0.52);
    }
  });

  it('small slider changes give small changes (consistent controls)', () => {
    const a = grid(cfg({ scale: 120 }));
    const d1 = meanAbsDiff(a, grid(cfg({ scale: 121 })));
    expect(d1).toBeLessThan(0.08);
    expect(d1).toBeLessThan(meanAbsDiff(a, grid(cfg({ scale: 130 }))));
    expect(meanAbsDiff(a, grid(cfg({ complexity: 5.1 })))).toBeLessThan(0.03);
    // and a different seed is really different
    expect(meanAbsDiff(a, grid(cfg(), 0.4, 4))).toBeGreaterThan(0.2);
  });

  it('loops seamlessly: evolution comes back exactly, scrolling cross-fades', () => {
    setLoopPeriod(2);
    try {
      for (const o of [{ evoSpeed: 0.7 }, { evoSpeed: 0.5, flowX: 90 }, { type: 'cells' }]) {
        const c = cfg(o);
        const a = grid(c, 0);
        const b = grid(c, 2);
        expect(meanAbsDiff(a, b)).toBeLessThan(1e-6);
        // and it does move
        expect(meanAbsDiff(a, grid(c, 0.5))).toBeGreaterThan(0.05);
      }
    } finally {
      setLoopPeriod(0);
    }
  });

  it('bands cut into flat steps', () => {
    const tone = toneOf(cfg({ bands: 4 }));
    const seen = new Set();
    for (let v = -1; v <= 1; v += 0.01) seen.add(tone(v).toFixed(4));
    expect(seen.size).toBe(4);
  });
});

describe('fractal noise speed in loops (D-107)', () => {
  const cfg2 = (o = {}) =>
    readNoise(Object.fromEntries(Object.entries(o).map(([k, v]) => [`fn.${k}`, v])), 'fn');
  const box = { x: 0, y: 0, w: 120, h: 120 };
  const flat = (x, y) => [x, y, 0];
  const g = (c, s) => noiseGrid(c, 3, s, box, flat).grid;
  const diff = (a, b) => a.reduce((t, v, i) => t + Math.abs(v - b[i]), 0) / a.length;

  it('a slow evolution is as slow in a loop as in a one-shot (no rounding up)', () => {
    for (const evoSpeed of [0.1, 0.5, 2]) {
      const c = cfg2({ evoSpeed });
      const one = diff(g(c, 0.5), g(c, 0.6));
      setLoopPeriod(2);
      try {
        const lp = diff(g(c, 0.5), g(c, 0.6));
        expect(lp / one).toBeGreaterThan(0.6);
        expect(lp / one).toBeLessThan(1.6);
        // and still comes back exactly
        expect(diff(g(c, 0), g(c, 2))).toBeLessThan(1e-6);
      } finally {
        setLoopPeriod(0);
      }
    }
  });

  it('speed follows the slider: twice the speed, about twice the change', () => {
    const d = (v) => diff(g(cfg2({ evoSpeed: v }), 1), g(cfg2({ evoSpeed: v }), 1.05));
    expect(d(0.2) / d(0.1)).toBeGreaterThan(1.6);
    expect(d(0.2) / d(0.1)).toBeLessThan(2.4);
  });
});
