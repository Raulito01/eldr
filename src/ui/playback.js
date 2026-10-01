// @ts-check
/**
 * Preview playback. The frame to show is computed from elapsed time (not by counting ticks),
 * so playback speed stays exact even if the browser drops animation frames.
 */

/**
 * Pure: which frame should be on screen `elapsedMs` after playback started at `startFrame`.
 * @param {number} elapsedMs
 * @param {{ frameCount: number, fps: number }} timing
 * @param {number} startFrame
 * @param {boolean} repeat true = wrap around, false = stop on the last frame
 * @returns {{ frame: number, ended: boolean }}
 */
export function playbackFrame(elapsedMs, timing, startFrame, repeat) {
  const advanced = Math.floor((Math.max(0, elapsedMs) / 1000) * timing.fps);
  const raw = startFrame + advanced;
  const n = timing.frameCount;
  if (repeat) return { frame: raw % n, ended: false };
  return raw >= n - 1 ? { frame: n - 1, ended: true } : { frame: raw, ended: false };
}

/**
 * Playback controller driven by requestAnimationFrame.
 * @param {{
 *   getTiming: () => { frameCount: number, fps: number },
 *   getFrame: () => number,
 *   setFrame: (frame: number) => void,
 *   repeat: () => boolean,
 *   onStateChange?: (playing: boolean) => void,
 * }} options
 */
export function createPlayback(options) {
  let playing = false;
  let startTime = 0;
  let startFrame = 0;
  let rafId = 0;

  function tick(/** @type {number} */ now) {
    if (!playing) return;
    const { frame, ended } = playbackFrame(
      now - startTime,
      options.getTiming(),
      startFrame,
      options.repeat(),
    );
    if (frame !== options.getFrame()) options.setFrame(frame);
    if (ended) {
      stop();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function play() {
    if (playing) return;
    const n = options.getTiming().frameCount;
    // Pressing play on the last frame of a non-repeating preview starts again from 0.
    startFrame = !options.repeat() && options.getFrame() >= n - 1 ? 0 : options.getFrame();
    if (startFrame !== options.getFrame()) options.setFrame(startFrame);
    startTime = performance.now();
    playing = true;
    options.onStateChange?.(true);
    rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    cancelAnimationFrame(rafId);
    options.onStateChange?.(false);
  }

  return {
    play,
    stop,
    toggle: () => (playing ? stop() : play()),
    isPlaying: () => playing,
    /** Call after fps or frame count change, or a manual frame change while playing. */
    resync() {
      if (!playing) return;
      startFrame = options.getFrame();
      startTime = performance.now();
    },
  };
}
