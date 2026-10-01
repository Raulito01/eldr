// @ts-check
/**
 * Frame ↔ time mapping. Pure: depends only on the timing settings and the frame index.
 *
 * One-shot: frame 0 → t = 0, last frame → t = 1 (the effect's full life is shown).
 * Loop:     frame 0 → t = 0, and t = 1 would be frame 0 again, so the last frame stops one
 *           step short (t = (n-1)/n). That is what makes the wrap-around seamless.
 *
 * Holds (ones/twos/threes) are added in step 1.3.
 */

/**
 * @typedef {object} Timing
 * @property {number} frameCount total frames (integer ≥ 1)
 * @property {number} fps frames per second (> 0)
 * @property {boolean} loop true = seamless loop, false = one-shot
 */

/**
 * @typedef {object} FrameTime
 * @property {number} frame   frame index actually used (wrapped for loops, clamped for one-shots)
 * @property {number} t       normalized effect time, 0–1
 * @property {number} seconds time since the effect started, in seconds
 */

/**
 * Check timing settings; throws a readable error if invalid.
 * @param {Timing} timing
 */
export function assertTiming(timing) {
  const { frameCount, fps, loop } = timing ?? /** @type {any} */ ({});
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error(`timing.frameCount must be an integer ≥ 1 (got ${frameCount})`);
  }
  if (!(typeof fps === 'number' && fps > 0)) throw new Error(`timing.fps must be > 0 (got ${fps})`);
  if (typeof loop !== 'boolean') throw new Error('timing.loop must be true or false');
}

/**
 * Map a frame index to effect time.
 * @param {Timing} timing
 * @param {number} frameIndex integer (out-of-range values wrap for loops, clamp for one-shots)
 * @returns {FrameTime}
 */
export function frameTime(timing, frameIndex) {
  assertTiming(timing);
  const n = timing.frameCount;
  const i = Math.trunc(frameIndex);
  let frame;
  let t;
  if (timing.loop) {
    frame = ((i % n) + n) % n;
    t = frame / n;
  } else {
    frame = i < 0 ? 0 : i > n - 1 ? n - 1 : i;
    t = n > 1 ? frame / (n - 1) : 0;
  }
  return { frame, t, seconds: frame / timing.fps };
}
