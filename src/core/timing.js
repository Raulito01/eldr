// @ts-check
/**
 * Frame ↔ time mapping. Pure: depends only on the timing settings and the frame index.
 *
 * One-shot: frame 0 → t = 0, last frame → t = 1 (the effect's full life is shown).
 * Loop:     frame 0 → t = 0, and t = 1 would be frame 0 again, so the last frame stops one
 *           step short (t = (n-1)/n). That is what makes the wrap-around seamless.
 *
 * Holds (brief §3.2): "on twos" means a new drawing every 2 frames. Frame k shows the drawing
 * of frame floor(k / hold) × hold, so frames inside one hold are pixel-identical. This is what
 * gives the hand-animated feel.
 *
 * Phases (brief §3.2): anticipation → impact → action → decay, described by two points in
 * normalized time: `impact` (where anticipation ends and the hit happens) and `decay` (where
 * the tail begins).
 */

/** @typedef {'ones' | 'twos' | 'threes'} HoldMode */

/** Frames per drawing for each hold mode. */
export const HOLD_FRAMES = Object.freeze({ ones: 1, twos: 2, threes: 3 });
export const HOLD_MODES = Object.freeze(/** @type {HoldMode[]} */ (Object.keys(HOLD_FRAMES)));

/** Phase markers used when an effect doesn't set its own. */
export const DEFAULT_PHASES = Object.freeze({ impact: 0.2, decay: 0.6 });
export const PHASE_NAMES = Object.freeze(
  /** @type {const} */ (['anticipation', 'impact', 'action', 'decay']),
);

/**
 * @typedef {object} Timing
 * @property {number} frameCount total frames (integer ≥ 1)
 * @property {number} fps frames per second (> 0)
 * @property {boolean} loop true = seamless loop, false = one-shot
 * @property {HoldMode} [holdMode='ones']
 * @property {{ impact: number, decay: number }} [phases] normalized 0–1, impact ≤ decay
 */

/**
 * @typedef {object} FrameTime
 * @property {number} frame     playback frame (wrapped for loops, clamped for one-shots)
 * @property {number} drawFrame frame whose drawing is shown (start of its hold group)
 * @property {number} t         normalized effect time of the drawing, 0–1
 * @property {number} seconds   time of the drawing since the effect started, in seconds
 */

/**
 * Check timing settings; throws a readable error if invalid.
 * @param {Timing} timing
 */
export function assertTiming(timing) {
  const { frameCount, fps, loop, holdMode, phases } = timing ?? /** @type {any} */ ({});
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new Error(`timing.frameCount must be an integer ≥ 1 (got ${frameCount})`);
  }
  if (!(typeof fps === 'number' && fps > 0)) throw new Error(`timing.fps must be > 0 (got ${fps})`);
  if (typeof loop !== 'boolean') throw new Error('timing.loop must be true or false');
  if (holdMode !== undefined && !(holdMode in HOLD_FRAMES)) {
    throw new Error(`timing.holdMode must be ones, twos or threes (got ${holdMode})`);
  }
  if (phases !== undefined) {
    const { impact, decay } = phases;
    if (!(impact >= 0 && decay <= 1 && impact <= decay)) {
      throw new Error('timing.phases needs 0 ≤ impact ≤ decay ≤ 1');
    }
  }
}

/** Frames per drawing for a timing. @param {Timing} timing */
export const holdFrames = (timing) => HOLD_FRAMES[timing.holdMode ?? 'ones'];

/**
 * Map a frame index to effect time, applying holds.
 * @param {Timing} timing
 * @param {number} frameIndex integer (out-of-range values wrap for loops, clamp for one-shots)
 * @returns {FrameTime}
 */
export function frameTime(timing, frameIndex) {
  assertTiming(timing);
  const n = timing.frameCount;
  const i = Math.trunc(frameIndex);
  const frame = timing.loop ? ((i % n) + n) % n : i < 0 ? 0 : i > n - 1 ? n - 1 : i;
  const hold = holdFrames(timing);
  const drawFrame = Math.floor(frame / hold) * hold;
  let t;
  if (timing.loop) t = drawFrame / n;
  else t = n > 1 ? drawFrame / (n - 1) : 0;
  return { frame, drawFrame, t, seconds: drawFrame / timing.fps };
}

/**
 * Phase markers of a timing (effect's own or defaults).
 * @param {Timing} timing
 * @returns {{ impact: number, decay: number }}
 */
export const phasesOf = (timing) => timing.phases ?? DEFAULT_PHASES;

/**
 * Which phase normalized time t falls in.
 * @param {Timing} timing @param {number} t 0–1
 * @returns {'anticipation' | 'action' | 'decay'}
 */
export function phaseAt(timing, t) {
  const { impact, decay } = phasesOf(timing);
  if (t < impact) return 'anticipation';
  if (t < decay) return 'action';
  return 'decay';
}

/**
 * Frame index closest to normalized time t (used to place phase markers on the timeline).
 * @param {Timing} timing @param {number} t 0–1
 */
export function frameAtTime(timing, t) {
  const n = timing.frameCount;
  const raw = timing.loop ? t * n : t * (n - 1);
  return Math.min(n - 1, Math.max(0, Math.round(raw)));
}
