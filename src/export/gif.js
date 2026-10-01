// @ts-check
/**
 * Animated GIF (brief §5), encoded with `gifenc` (MIT, no dependencies; D-046).
 *
 * - Frames inside one hold are merged into ONE GIF frame with a longer delay (smaller file,
 *   same timing).
 * - GIF delays are whole centiseconds. Each frame's delay is round(end) − round(start) on the
 *   exact timeline, so rounding never drifts: the total length is exact to 1/100 s.
 * - GIF has 1-bit transparency only. On a transparent background, pixels under 50 % alpha
 *   vanish and soft glow gets a hard edge. Export on a background colour for glowing effects.
 */

import * as gifencModule from 'gifenc';

// The browser build (ESM) has named exports; Node loads the CommonJS build, where they sit on
// `default`. Accept both.
const gifenc = /** @type {any} */ (
  'quantize' in gifencModule ? gifencModule : /** @type {any} */ (gifencModule).default
);
const { GIFEncoder, quantize, applyPalette } = gifenc;

/**
 * Runs of identical drawings → [{ drawing, frames }] (holds merged).
 * @param {number[]} frames @returns {{ drawing: number, start: number, count: number }[]}
 */
export function mergeHolds(frames) {
  const out = [];
  for (let i = 0; i < frames.length; i++) {
    const last = out[out.length - 1];
    if (last && last.drawing === frames[i]) last.count++;
    else out.push({ drawing: frames[i], start: i, count: 1 });
  }
  return out;
}

/**
 * Delays in centiseconds for runs of frames at `fps`, drift-free.
 * @param {{ start: number, count: number }[]} runs @param {number} fps
 */
export function gifDelays(runs, fps) {
  const cs = (/** @type {number} */ frame) => Math.round((frame * 100) / fps);
  return runs.map((r) => Math.max(1, cs(r.start + r.count) - cs(r.start)));
}

/**
 * @param {import('./frames.js').RenderedSequence} seq a prepared sequence (trimmed / flattened)
 * @param {{ transparent?: boolean, repeat?: number }} [o] transparent: keep alpha (1-bit);
 *   repeat: 0 = forever (default), -1 = play once
 * @returns {Uint8Array} GIF file bytes
 */
export function encodeGif(seq, o = {}) {
  const gif = GIFEncoder();
  const runs = mergeHolds(seq.frames);
  const delays = gifDelays(runs, seq.fps);
  runs.forEach((run, i) => {
    const d = seq.drawings[run.drawing];
    const rgba = d.data;
    if (o.transparent) {
      const palette = quantize(rgba, 256, { format: 'rgba4444', oneBitAlpha: true });
      const index = applyPalette(rgba, palette, 'rgba4444');
      let transparentIndex = palette.findIndex((c) => c[3] === 0);
      if (transparentIndex < 0) transparentIndex = 0;
      gif.writeFrame(index, d.width, d.height, {
        palette,
        transparent: transparentIndex >= 0 && palette.some((c) => c[3] === 0),
        transparentIndex,
        delay: delays[i] * 10,
        repeat: o.repeat ?? 0,
        dispose: 2,
      });
    } else {
      const palette = quantize(rgba, 256);
      gif.writeFrame(applyPalette(rgba, palette), d.width, d.height, {
        palette,
        delay: delays[i] * 10,
        repeat: o.repeat ?? 0,
      });
    }
  });
  gif.finish();
  return gif.bytes();
}
