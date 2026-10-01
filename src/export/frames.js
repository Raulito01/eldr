// @ts-check
/**
 * Export step 1 (brief §5): render the whole effect into pixel buffers.
 *
 * - Every playback frame maps to a DRAWING (holds: frames inside one hold share a drawing,
 *   frameTime().drawFrame). Each drawing is rendered once.
 * - Frames are rendered on a TRANSPARENT background, so trimming can find the effect's pixels;
 *   a background colour is composited afterwards (`flatten`).
 * - Pure in its output: the same effect, seed and settings give the same pixels as the preview.
 */

import { parseHex } from '../core/color.js';
import { frameTime } from '../core/timing.js';

/**
 * @typedef {object} Pixels  raw RGBA, not premultiplied (like ImageData)
 * @property {number} width @property {number} height @property {Uint8ClampedArray} data
 */

/**
 * @typedef {object} RenderedSequence
 * @property {Pixels[]} drawings      unique drawings, in order of first appearance
 * @property {number[]} frames        playback frame i shows drawings[frames[i]]
 * @property {number} fps
 * @property {boolean} loop
 */

/**
 * @typedef {object} ExportSource  what to render (same inputs the preview uses)
 * @property {import('../render/renderer.js').Effect} effect
 * @property {number} seed
 * @property {number} width      frame size in px BEFORE the export scale
 * @property {number} height
 * @property {number} [scale=1]  effect scale (e.g. explosion global size)
 * @property {{x: number, y: number}} [pivot]
 */

/** Let the browser breathe between frames so the UI can show progress. */
const nextTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Render every drawing of the effect, transparent background.
 * @param {ReturnType<typeof import('../render/renderer.js').createRenderer>} renderer
 * @param {ExportSource} src
 * @param {{ exportScale?: number, onProgress?: (done: number, total: number) => void, yieldToUi?: boolean }} [opts]
 * @returns {Promise<RenderedSequence>}
 */
export async function renderSequence(renderer, src, opts = {}) {
  const k = opts.exportScale ?? 1;
  const timing = src.effect.timing;
  const n = timing.frameCount;
  /** @type {Map<number, number>} drawFrame → drawing index */
  const byDraw = new Map();
  /** @type {Pixels[]} */
  const drawings = [];
  const frames = [];
  const drawFrames = [];
  for (let i = 0; i < n; i++) drawFrames.push(frameTime(timing, i).drawFrame);
  const total = new Set(drawFrames).size;
  for (const d of drawFrames) {
    if (!byDraw.has(d)) {
      const surface = renderer.renderFrame(src.effect, src.seed, d, {
        width: Math.round(src.width * k),
        height: Math.round(src.height * k),
        scale: (src.scale ?? 1) * k,
        pivot: src.pivot,
        background: null,
      });
      const img = surface.ctx.getImageData(0, 0, surface.width, surface.height);
      // Copy: the renderer reuses its surfaces between frames.
      drawings.push({
        width: img.width,
        height: img.height,
        data: new Uint8ClampedArray(img.data),
      });
      byDraw.set(d, drawings.length - 1);
      opts.onProgress?.(drawings.length, total);
      if (opts.yieldToUi) await nextTick();
    }
    frames.push(/** @type {number} */ (byDraw.get(d)));
  }
  return { drawings, frames, fps: timing.fps, loop: timing.loop };
}

/**
 * @typedef {object} Rect @property {number} x @property {number} y @property {number} w @property {number} h
 */

/**
 * Smallest rectangle holding every non-transparent pixel of every drawing, grown by `pad`
 * and clamped to the frame. Empty effect → a 1×1 rect at the centre.
 * @param {Pixels[]} drawings @param {number} [pad=2]
 * @returns {Rect}
 */
export function unionBounds(drawings, pad = 2) {
  const { width, height } = drawings[0];
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (const d of drawings) {
    const a = d.data;
    for (let y = 0; y < height; y++) {
      const row = y * width * 4;
      for (let x = 0; x < width; x++) {
        if (a[row + x * 4 + 3] !== 0) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
  }
  if (x1 < 0) return { x: width >> 1, y: height >> 1, w: 1, h: 1 };
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Copy a rectangle out of a drawing. @param {Pixels} p @param {Rect} r @returns {Pixels} */
export function crop(p, r) {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) {
    const from = ((r.y + y) * p.width + r.x) * 4;
    out.set(p.data.subarray(from, from + r.w * 4), y * r.w * 4);
  }
  return { width: r.w, height: r.h, data: out };
}

/**
 * Composite onto a solid background colour (result fully opaque). null → unchanged copy.
 * @param {Pixels} p @param {string | null} background CSS hex colour
 * @returns {Pixels}
 */
export function flatten(p, background) {
  const out = new Uint8ClampedArray(p.data);
  if (!background) return { width: p.width, height: p.height, data: out };
  const [br, bg, bb] = parseHex(background);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] / 255;
    out[i] = out[i] * a + br * (1 - a);
    out[i + 1] = out[i + 1] * a + bg * (1 - a);
    out[i + 2] = out[i + 2] * a + bb * (1 - a);
    out[i + 3] = 255;
  }
  return { width: p.width, height: p.height, data: out };
}

/**
 * Trim (optional) and background (optional) applied to every drawing of a sequence.
 * @param {RenderedSequence} seq
 * @param {{ trim?: boolean, background?: string | null, pad?: number }} o
 * @returns {RenderedSequence & { rect: Rect, sourceSize: { w: number, h: number } }}
 */
export function prepareSequence(seq, o) {
  const { width, height } = seq.drawings[0];
  const rect = o.trim ? unionBounds(seq.drawings, o.pad ?? 2) : { x: 0, y: 0, w: width, h: height };
  return {
    ...seq,
    rect,
    sourceSize: { w: width, h: height },
    drawings: seq.drawings.map((d) => flatten(crop(d, rect), o.background ?? null)),
  };
}

/**
 * Alpha as an opaque black-and-white image (white = fully visible): the matte for formats
 * without transparency (MP4). Use it in After Effects as a Luma Matte.
 * @param {Pixels} p @returns {Pixels}
 */
export function matteOf(p) {
  const out = new Uint8ClampedArray(p.data.length);
  for (let i = 0; i < out.length; i += 4) {
    const a = p.data[i + 3];
    out[i] = a;
    out[i + 1] = a;
    out[i + 2] = a;
    out[i + 3] = 255;
  }
  return { width: p.width, height: p.height, data: out };
}

/**
 * Grow to even width/height (H.264 needs even sizes), adding transparent pixels right/bottom.
 * @param {Pixels} p @returns {Pixels}
 */
export function padEven(p) {
  const w = p.width + (p.width % 2);
  const h = p.height + (p.height % 2);
  if (w === p.width && h === p.height) return p;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < p.height; y++) {
    out.set(p.data.subarray(y * p.width * 4, (y + 1) * p.width * 4), y * w * 4);
  }
  return { width: w, height: h, data: out };
}
