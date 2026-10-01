// @ts-check
/**
 * Small math helpers used across ELDR. All functions are pure.
 * Conventions: "normalized" means 0–1, angles are radians unless the name says degrees.
 */

/** Full circle in radians (2π). */
export const TAU = Math.PI * 2;

/**
 * Clamp a value to [min, max].
 * @param {number} v @param {number} min @param {number} max
 */
export const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);

/** Clamp a value to [0, 1]. @param {number} v */
export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * Linear interpolation from a to b. t = 0 → a, t = 1 → b (not clamped).
 * @param {number} a @param {number} b @param {number} t normalized
 */
export const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Inverse of lerp: where v sits between a and b (not clamped). Returns 0 when a === b.
 * @param {number} a @param {number} b @param {number} v
 */
export const invLerp = (a, b, v) => (a === b ? 0 : (v - a) / (b - a));

/**
 * Map v from range [inMin, inMax] to [outMin, outMax] (not clamped).
 * @param {number} v @param {number} inMin @param {number} inMax @param {number} outMin @param {number} outMax
 */
export const remap = (v, inMin, inMax, outMin, outMax) =>
  lerp(outMin, outMax, invLerp(inMin, inMax, v));

/**
 * Hermite smoothstep: 0 below edge0, 1 above edge1, smooth S-curve between.
 * @param {number} edge0 @param {number} edge1 @param {number} v
 */
export const smoothstep = (edge0, edge1, v) => {
  const t = clamp01(invLerp(edge0, edge1, v));
  return t * t * (3 - 2 * t);
};

/**
 * Ken Perlin's smootherstep (zero first and second derivatives at the edges).
 * @param {number} edge0 @param {number} edge1 @param {number} v
 */
export const smootherstep = (edge0, edge1, v) => {
  const t = clamp01(invLerp(edge0, edge1, v));
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Fractional part, always in [0, 1) — also for negative numbers. @param {number} v */
export const fract = (v) => v - Math.floor(v);

/**
 * Modulo that is always non-negative for positive n (unlike JS `%`).
 * @param {number} v @param {number} n
 */
export const mod = (v, n) => ((v % n) + n) % n;

/**
 * Wrap v into [min, max).
 * @param {number} v @param {number} min @param {number} max
 */
export const wrap = (v, min, max) => min + mod(v - min, max - min);

/** @param {number} deg */
export const degToRad = (deg) => (deg * Math.PI) / 180;

/** @param {number} rad */
export const radToDeg = (rad) => (rad * 180) / Math.PI;

/**
 * True if a and b differ by at most epsilon.
 * @param {number} a @param {number} b @param {number} [epsilon=1e-9]
 */
export const approxEqual = (a, b, epsilon = 1e-9) => Math.abs(a - b) <= epsilon;
