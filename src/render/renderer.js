// @ts-check
/**
 * The renderer: `renderFrame(effect, seed, frameIndex, settings)` draws ONE frame from scratch.
 *
 * Rules (brief §2.2):
 * - No hidden state: every call clears and redraws everything. Frame 37 never needs 0–36.
 * - Each layer gets its own sub-seed: subSeed(seed, layer.id).
 * - Each layer draws into its own transparent surface; the compositor then stacks it onto the
 *   output with the layer's blend mode and opacity. (Separate surfaces are also what outline
 *   and cel shading will need in Phase 2.)
 *
 * Coordinate system for layer code: origin at the pivot, x → right, y → down, units are
 * "effect pixels". `settings.scale` multiplies everything (2× export, Pixel Mode hi-res render).
 */

import { subSeed } from '../core/hash.js';
import { frameTime } from '../core/timing.js';
import { compositeLayer } from './compositor.js';

/**
 * @typedef {object} Layer
 * @property {string} id        stable id, also used for the layer's sub-seed
 * @property {string} type      key into the renderer's layer-type registry
 * @property {boolean} [enabled=true]
 * @property {import('./compositor.js').BlendMode} [blend='normal']
 * @property {number} [opacity=1]  0–1
 * @property {Record<string, any>} [params]
 */

/**
 * @typedef {object} Effect
 * @property {string} id
 * @property {import('../core/timing.js').Timing} timing
 * @property {Layer[]} layers   drawn bottom → top
 */

/**
 * @typedef {object} RenderSettings
 * @property {number} width   output width in px
 * @property {number} height  output height in px
 * @property {number} [scale=1]  effect pixels → output pixels
 * @property {{x: number, y: number}} [pivot={x:0.5,y:0.5}]  normalized position of the origin
 * @property {string|null} [background=null]  CSS colour placed behind the finished effect, or null
 *   for transparent
 */

/**
 * @typedef {object} LayerFrame  what a layer's render function receives about "now"
 * @property {number} frame    frame index of the drawing (start of its hold group)
 * @property {number} t        normalized effect time 0–1
 * @property {number} seconds
 * @property {number} seed     this layer's own sub-seed
 * @property {import('../core/timing.js').Timing} timing
 */

/**
 * @typedef {object} LayerType
 * @property {(ctx: CanvasRenderingContext2D, params: Record<string, any>, frame: LayerFrame) => void} render
 *   Draw the layer. Must be pure: use only params + frame, never Math.random or clocks.
 * @property {(ctx: CanvasRenderingContext2D, params: Record<string, any>, info: { scale: number, width: number, height: number }) => void} [postProcess]
 *   Optional pass over the layer's finished pixels (identity transform), before compositing.
 */

/**
 * @param {{ backend: import('./canvas2d/backend.js').Backend, layerTypes: Record<string, LayerType> }} options
 */
export function createRenderer({ backend, layerTypes }) {
  /** @type {import('./canvas2d/backend.js').Surface | null} */
  let output = null;
  /** @type {import('./canvas2d/backend.js').Surface | null} */
  let scratch = null;

  /** @param {number} w @param {number} h */
  function surfaces(w, h) {
    if (!output || !scratch) {
      output = backend.createSurface(w, h);
      scratch = backend.createSurface(w, h);
    } else {
      backend.resize(output, w, h);
      backend.resize(scratch, w, h);
    }
    return { out: output, layer: scratch };
  }

  /**
   * Render one frame. Returns the renderer's output surface; it is reused by the next call,
   * so copy it (drawImage / getImageData) if you need to keep it.
   * @param {Effect} effect
   * @param {number} seed integer
   * @param {number} frameIndex
   * @param {RenderSettings} settings
   * @returns {import('./canvas2d/backend.js').Surface}
   */
  function renderFrame(effect, seed, frameIndex, settings) {
    const { width, height } = settings;
    if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) {
      throw new Error(`render size must be positive integers (got ${width}×${height})`);
    }
    const scale = settings.scale ?? 1;
    const pivot = settings.pivot ?? { x: 0.5, y: 0.5 };
    const time = frameTime(effect.timing, frameIndex);
    const { out, layer } = surfaces(width, height);

    const octx = out.ctx;
    octx.save();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = 'source-over';
    octx.globalAlpha = 1;
    octx.clearRect(0, 0, width, height);
    octx.restore();

    for (const l of effect.layers) {
      if (l.enabled === false) continue;
      const type = layerTypes[l.type];
      if (!type) throw new Error(`Unknown layer type "${l.type}" (layer "${l.id}")`);

      const lctx = layer.ctx;
      lctx.save();
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, width, height);
      lctx.setTransform(scale, 0, 0, scale, pivot.x * width, pivot.y * height);
      // Layers see only the held drawing's time, so every frame inside a hold is identical.
      type.render(lctx, l.params ?? {}, {
        frame: time.drawFrame,
        t: time.t,
        seconds: time.seconds,
        seed: subSeed(seed, l.id),
        timing: effect.timing,
      });
      lctx.restore();
      // Optional per-layer post-process on the finished layer pixels (e.g. outline).
      type.postProcess?.(lctx, l.params ?? {}, { scale, width, height });

      compositeLayer(octx, layer.canvas, l.blend ?? 'normal', l.opacity ?? 1);
    }

    // The background goes BEHIND the finished effect, never into the layer blending: the
    // exported sprite is transparent, and a game engine draws it over its own background.
    // So add/screen layers look on a white background exactly as they will in-game.
    if (settings.background) {
      octx.save();
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalCompositeOperation = 'destination-over';
      octx.fillStyle = settings.background;
      octx.fillRect(0, 0, width, height);
      octx.restore();
    }
    return out;
  }

  /**
   * Render one frame and return a copy of its pixels (straight, non-premultiplied RGBA).
   * @param {Effect} effect @param {number} seed @param {number} frameIndex @param {RenderSettings} settings
   * @returns {ImageData}
   */
  function renderFrameImageData(effect, seed, frameIndex, settings) {
    const out = renderFrame(effect, seed, frameIndex, settings);
    return out.ctx.getImageData(0, 0, out.width, out.height);
  }

  return { renderFrame, renderFrameImageData };
}
