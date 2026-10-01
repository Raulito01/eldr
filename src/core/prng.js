// @ts-check
/**
 * Seeded pseudo-random number generator (sfc32 — "Small Fast Counting", by Chris Doty-Humphrey).
 * Passes PractRand, 128-bit state, uses only 32-bit integer math → bit-identical in every JS engine.
 *
 * This is the ONLY source of randomness allowed in the render path. Never use Math.random().
 */

import { hash32 } from './hash.js';

/**
 * Raw sfc32 generator.
 * @param {number} a @param {number} b @param {number} c @param {number} d 32-bit state words
 * @returns {() => number} returns floats in [0, 1)
 */
function sfc32(a, b, c, d) {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/**
 * @typedef {object} Rng
 * @property {() => number} next float in [0, 1)
 * @property {(min: number, max: number) => number} range float in [min, max)
 * @property {(min: number, max: number) => number} int integer in [min, max] (inclusive)
 * @property {(p: number) => boolean} chance true with probability p (0–1)
 * @property {() => number} sign -1 or 1
 * @property {<T>(items: T[]) => T} pick one random item
 * @property {(mean?: number, spread?: number) => number} gaussian bell-curve value
 *   (approximation from 4 uniforms; stays within mean ± 2·spread·√3)
 */

/**
 * Create a seeded random generator. The same seed always gives the same sequence.
 * @param {number} seed integer (any sign)
 * @returns {Rng}
 */
export function createRng(seed) {
  // Expand the seed into 4 well-mixed state words, then warm up.
  const next = sfc32(hash32(seed, 1), hash32(seed, 2), hash32(seed, 3), hash32(seed, 4));
  for (let i = 0; i < 12; i++) next();

  return {
    next,
    range: (min, max) => min + (max - min) * next(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    sign: () => (next() < 0.5 ? -1 : 1),
    pick: (items) => items[Math.floor(next() * items.length)],
    // Irwin–Hall: sum of 4 uniforms is close to a normal distribution and avoids
    // Math.log/Math.cos, which are not guaranteed bit-identical across engines.
    // Variance of the sum is 4/12, so scale by √3 to get standard deviation ≈ spread.
    gaussian: (mean = 0, spread = 1) => {
      const sum = next() + next() + next() + next() - 2;
      return mean + sum * spread * Math.sqrt(3);
    },
  };
}
