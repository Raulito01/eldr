import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/core/prng.js';

describe('createRng', () => {
  it('is deterministic: same seed → same sequence', () => {
    const a = createRng(482913);
    const b = createRng(482913);
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it('matches pinned reference values (changing these changes every effect’s look!)', () => {
    const r = createRng(482913);
    expect([r.next(), r.next(), r.next()]).toEqual([
      0.8526674739550799, 0.5344482325017452, 0.9685961785726249,
    ]);
  });

  it('gives different sequences for different seeds (including neighbours)', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
    expect(createRng(0).next()).not.toBe(createRng(-1).next());
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const r = createRng(42);
    const buckets = new Array(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[Math.floor(v * 10)]++;
    }
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });

  it('int() is inclusive and hits both ends', () => {
    const r = createRng(3);
    const seen = new Set();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('range(), chance(), sign(), pick() behave', () => {
    const r = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const v = r.range(-3, 7);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(7);
      expect([-1, 1]).toContain(r.sign());
      expect(['a', 'b', 'c']).toContain(r.pick(['a', 'b', 'c']));
    }
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (r.chance(0.25)) hits++;
    expect(hits / 10_000).toBeCloseTo(0.25, 1);
    expect(r.chance(0)).toBe(false);
  });

  it('gaussian() centres on the mean with roughly the requested spread', () => {
    const r = createRng(11);
    const n = 50_000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      const v = r.gaussian(10, 2);
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sumSq / n - mean * mean);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeGreaterThan(1.9);
    expect(sd).toBeLessThan(2.1);
  });
});
