// @ts-check
/**
 * Seamless-loop helpers (D-071). In a LOOPING effect, anything that evolves with time must come
 * back to where it started at the end of the loop, or the loop pops at the seam.
 *
 * - Noise that "boils" with time (blob / ring / crescent edges, cel band edges, fire fields)
 *   is cross-faded between "now" and "one loop ago", so the last frame flows into the first.
 * - Spins and pulses (orbits) are rounded to whole turns per loop.
 * - Emitters and bolts round their own schedules (D-067, D-070).
 *
 * The renderer sets the loop period once per frame (`setLoopPeriod`); shapes ask `loopPeriod()`.
 * Rendering is synchronous, so a module-level value is safe.
 */

/** Loop length in seconds, or 0 for one-shots. */
let period = 0;

/** @param {number} seconds 0 = not looping */
export const setLoopPeriod = (seconds) => {
  period = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
};
/** Loop length in seconds of the effect being drawn (0 = one-shot). */
export const loopPeriod = () => period;

/**
 * Noise that evolves with normalized loop time `t` (0–1) at `rate` per loop and still loops:
 * a variance-preserving cross-fade of `sample(z)` and `sample(z − rate)`.
 * One-shots: just `sample(rate · t)`.
 * @param {(z: number) => number} sample noise at evolve coordinate z
 * @param {number} rate evolve units per t = 1 @param {number} t
 */
export function loopedNoise(sample, rate, t) {
  const z = rate * t;
  if (!period || rate === 0) return sample(z);
  const w = t - Math.floor(t);
  const a = sample(z);
  const b = sample(z - rate);
  return ((1 - w) * a + w * b) / Math.sqrt((1 - w) * (1 - w) + w * w);
}

/**
 * A rate (turns or cycles per second) rounded so it repeats a whole number of times per loop
 * (never rounded to a stop: at least one cycle per loop). One-shots: unchanged.
 * @param {number} perSecond
 */
export function loopRate(perSecond) {
  if (!period || perSecond === 0) return perSecond;
  const n = Math.max(1, Math.round(Math.abs(perSecond) * period));
  return (Math.sign(perSecond) * n) / period;
}
