import { describe, expect, it } from 'vitest';
import { hash32, hashString, mix32, subSeed } from '../../src/core/hash.js';

describe('hashing', () => {
  it('matches pinned reference values', () => {
    expect(hashString('fireball')).toBe(2210060728);
    expect(hash32(1, 2)).toBe(4035300771);
    expect(subSeed(482913, 'sparks', 3)).toBe(1199306628);
  });

  it('always returns unsigned 32-bit integers', () => {
    for (const v of [hash32(-5), hash32('x', -1, 2 ** 40), mix32(-123), hashString('')]) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(2 ** 32);
    }
  });

  it('is order-sensitive', () => {
    expect(hash32(1, 2)).not.toBe(hash32(2, 1));
  });

  it('rejects non-integer numbers so bugs fail loudly', () => {
    expect(() => hash32(0.5)).toThrow(TypeError);
    expect(() => hash32(Number.NaN)).toThrow(TypeError);
  });

  it('subSeed: different elements and indices get different seeds', () => {
    const seeds = new Set();
    for (const id of ['fireball', 'smoke', 'sparks', 'debris']) {
      for (let i = 0; i < 250; i++) seeds.add(subSeed(482913, id, i));
    }
    expect(seeds.size).toBe(1000);
  });

  it('subSeed: one element is unaffected by other elements existing', () => {
    // Pure function of (seed, id, index): nothing else can influence it.
    const before = subSeed(7, 'sparks', 4);
    subSeed(7, 'newLayer', 0);
    expect(subSeed(7, 'sparks', 4)).toBe(before);
  });
});
