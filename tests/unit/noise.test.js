import { describe, expect, it } from 'vitest';
import { TAU } from '../../src/core/math.js';
import { createNoise } from '../../src/core/noise.js';
import { createRng } from '../../src/core/prng.js';

const noise = createNoise(482913);

describe('createNoise', () => {
  it('matches pinned reference values', () => {
    expect(noise.noise2D(0.37, 1.21)).toBe(-0.5583845861691153);
    expect(noise.noise3D(0.37, 1.21, -2.5)).toBe(0.6199482842689836);
    expect(noise.noise4D(0.37, 1.21, -2.5, 0.8)).toBe(0.015687803659058305);
  });

  it('is deterministic per seed and differs between seeds', () => {
    const again = createNoise(482913);
    const other = createNoise(482914);
    expect(again.noise3D(1.3, 2.7, 0.4)).toBe(noise.noise3D(1.3, 2.7, 0.4));
    expect(other.noise3D(1.3, 2.7, 0.4)).not.toBe(noise.noise3D(1.3, 2.7, 0.4));
  });

  it('stays within [-1, 1] and uses most of that range', () => {
    const r = createRng(1);
    const min = [1, 1, 1];
    const max = [-1, -1, -1];
    for (let i = 0; i < 50_000; i++) {
      const [x, y, z, w] = [r.range(-40, 40), r.range(-40, 40), r.range(-40, 40), r.range(-40, 40)];
      const v = [noise.noise2D(x, y), noise.noise3D(x, y, z), noise.noise4D(x, y, z, w)];
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], v[k]);
        max[k] = Math.max(max[k], v[k]);
      }
    }
    for (let k = 0; k < 3; k++) {
      expect(min[k]).toBeGreaterThanOrEqual(-1);
      expect(max[k]).toBeLessThanOrEqual(1);
      expect(max[k] - min[k]).toBeGreaterThan(1.6);
    }
  });

  it('is smooth: tiny moves give tiny changes', () => {
    const r = createRng(2);
    for (let i = 0; i < 2000; i++) {
      const x = r.range(-20, 20);
      const y = r.range(-20, 20);
      const z = r.range(-20, 20);
      const w = r.range(-20, 20);
      const d = 1e-4;
      expect(Math.abs(noise.noise2D(x + d, y) - noise.noise2D(x, y))).toBeLessThan(0.01);
      expect(Math.abs(noise.noise3D(x, y, z + d) - noise.noise3D(x, y, z))).toBeLessThan(0.01);
      expect(Math.abs(noise.noise4D(x, y, z, w + d) - noise.noise4D(x, y, z, w))).toBeLessThan(
        0.01,
      );
    }
  });

  it('4D circle trick loops seamlessly (basis for looping effects)', () => {
    const r = 1.5;
    const sample = (/** @type {number} */ t) => {
      const a = TAU * t;
      return noise.noise4D(0.3, 0.7, Math.cos(a) * r, Math.sin(a) * r);
    };
    expect(sample(1)).toBeCloseTo(sample(0), 12);
  });
});
