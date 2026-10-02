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
import { frameTime, tAtSeconds } from '../core/timing.js';
import { compositeLayer } from './compositor.js';
import { createGlowPass } from './glow.js';
import { createMaskPass } from './masks.js';

/**
 * @typedef {object} Layer
 * @property {string} id        stable id
 * @property {string} [seedKey]  key for the layer's sub-seed (default: id). Duplicated layers keep
 *   their seedKey, so the copy is identical until reseeded.
 * @property {string} type      key into the renderer's layer-type registry
 * @property {boolean} [enabled=true]
 * @property {import('./compositor.js').BlendMode} [blend='normal']
 * @property {number} [opacity=1]  0–1
 * @property {Record<string, any>} [params]
 * @property {{ offset: number, stretch: number, in: number, out: number | null }} [time]
 *   where the layer sits on the timeline (3.6c, seconds): it is visible from `in` to `out`, and
 *   its own time is (comp seconds − offset) / stretch.
 * @property {import('./masks.js').Mask[]} [masks]  shapes that cut the layer (3.6d), layer space
 * @property {{ source: string, mode: string } | null} [matte]  track matte (3.6d): another
 *   layer's alpha / luma decides where this one shows. The source renders even when hidden.
 * @property {[number, number, number, number, number, number]} [matrix]  layer transform in
 *   effect px (3.6b: position / rotation / scale / anchor with parents resolved), applied before
 *   the layer draws. Post-passes (dissolve, outline, glow) work on the finished pixels.
 */

/**
 * @typedef {object} Effect
 * @property {string} id
 * @property {import('../core/timing.js').Timing} timing
 * @property {Layer[]} layers   drawn bottom → top
 * @property {(time: import('../core/timing.js').FrameTime) => Effect} [at]  animated effects
 *   (keyframes, 3.6c): the effect as it is at this moment. Must be pure.
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
 * @property {(ctx: CanvasRenderingContext2D, params: Record<string, any>, info: AdjustInfo) => void} [adjust]
 *   Adjustment layer (3.8b): instead of drawing, change the composite of everything below it
 *   in place (identity transform). It handles its own blend mode and opacity and must keep alpha.
 *   Draw the layer. Must be pure: use only params + frame, never Math.random or clocks.
 * @property {(ctx: CanvasRenderingContext2D, params: Record<string, any>, info: PostInfo) => void} [postProcess]
 *   Optional pass over the layer's finished pixels (identity transform), before compositing.
 * @property {(params: Record<string, any>) => import('./glow.js').GlowSpec | null} [glow]
 *   Optional: how this layer glows (additive light drawn after the layer), or null for none.
 */

/**
 * @typedef {object} AdjustInfo  what an adjustment layer receives
 * @property {number} width
 * @property {number} height
 * @property {string} blend
 * @property {number} opacity
 * @property {number} t
 * @property {number} seconds
 */

/**
 * @typedef {object} PostInfo  what a layer post-process receives
 * @property {number} scale
 * @property {number} width
 * @property {number} height
 * @property {number} t        normalized effect time (of the held drawing)
 * @property {number} seconds
 * @property {number} seed     the layer's sub-seed
 * @property {{x: number, y: number}} pivot  normalized
 */

/**
 * dst = mix(dst, src, mask alpha), keeping dst's alpha (adjustment layers limited by a mask).
 * @param {CanvasRenderingContext2D} dst @param {CanvasRenderingContext2D} src
 * @param {CanvasRenderingContext2D} mask @param {number} w @param {number} h
 */
function mixByMask(dst, src, mask, w, h) {
  const a = dst.getImageData(0, 0, w, h);
  const b = src.getImageData(0, 0, w, h).data;
  const m = mask.getImageData(0, 0, w, h).data;
  const d = a.data;
  for (let o = 0; o < d.length; o += 4) {
    const k = m[o + 3] / 255;
    if (k <= 0 || d[o + 3] === 0) continue;
    d[o] += (b[o] - d[o]) * k;
    d[o + 1] += (b[o + 1] - d[o + 1]) * k;
    d[o + 2] += (b[o + 2] - d[o + 2]) * k;
  }
  dst.putImageData(a, 0, 0);
}

/**
 * @param {{ backend: import('./canvas2d/backend.js').Backend, layerTypes: Record<string, LayerType> }} options
 */
export function createRenderer({ backend, layerTypes }) {
  const glowPass = createGlowPass(backend);
  const maskPass = createMaskPass(backend, createGlowPass(backend));
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

    // Animated effects resolve their keyframes for this moment first (pure, 3.6c).
    const now = effect.at ? effect.at(time) : effect;
    const byId = new Map(now.layers.map((l) => [l.id, l]));

    /** Layer time now, or null when the layer is outside its in / out points. @param {Layer} l */
    const layerTime = (l) => {
      if (!l.time) return time;
      const eps = 1e-6;
      if (time.seconds < l.time.in - eps) return null;
      if (l.time.out !== null && time.seconds >= l.time.out - eps) return null;
      const seconds = (time.seconds - l.time.offset) / (l.time.stretch || 1);
      return { ...time, seconds, t: tAtSeconds(effect.timing, seconds) };
    };
    /** Layer px → output px. @param {Layer} l */
    const baseMatrix = (l) => {
      const m = l.matrix ?? [1, 0, 0, 1, 0, 0];
      return [
        scale * m[0],
        scale * m[1],
        scale * m[2],
        scale * m[3],
        scale * m[4] + pivot.x * width,
        scale * m[5] + pivot.y * height,
      ];
    };
    /** The combined mask of a layer, or null. @param {Layer} l */
    const maskOf = (l) =>
      l.masks?.length
        ? maskPass.build(l.masks, { width, height, scale, base: baseMatrix(l) })
        : null;

    /**
     * Draw one layer (render, masks, post-process) into `surf`. Returns false when the layer
     * is not on screen now.
     * @param {Layer} l @param {import('./canvas2d/backend.js').Surface} surf
     */
    const drawLayer = (l, surf) => {
      const lctx = surf.ctx;
      lctx.save();
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.clearRect(0, 0, width, height);
      lctx.restore();
      const lt = layerTime(l);
      if (!lt) return false;
      const type = layerTypes[l.type];
      if (!type) throw new Error(`Unknown layer type "${l.type}" (layer "${l.id}")`);
      lctx.save();
      lctx.setTransform(scale, 0, 0, scale, pivot.x * width, pivot.y * height);
      if (l.matrix) lctx.transform(...l.matrix);
      // Layers see only the held drawing's time, so every frame inside a hold is identical.
      const layerSeed = subSeed(seed, l.seedKey ?? l.id);
      type.render(lctx, l.params ?? {}, {
        frame: time.drawFrame,
        t: lt.t,
        seconds: lt.seconds,
        seed: layerSeed,
        timing: effect.timing,
      });
      lctx.restore();
      // Masks cut the layer before its effects (as in After Effects).
      const mask = maskOf(l);
      if (mask) maskPass.cut(lctx, mask.canvas);
      // Optional per-layer post-process on the finished layer pixels (e.g. dissolve, outline).
      type.postProcess?.(lctx, l.params ?? {}, {
        scale,
        width,
        height,
        t: lt.t,
        seconds: lt.seconds,
        seed: layerSeed,
        pivot,
      });
      return true;
    };

    /**
     * Track matte of a layer as a mask surface, or null for none.
     * @param {Layer} l
     */
    const matteOf = (l) => {
      if (!l.matte) return null;
      const src = byId.get(l.matte.source);
      const surf = maskPass.surface('matte', width, height);
      if (!src || src.id === l.id || !drawLayer(src, surf)) {
        // nothing to use: an empty matte (inverted modes then show everything)
        const c = surf.ctx;
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, width, height);
        c.restore();
      } else {
        const g = layerTypes[src.type]?.glow?.(src.params ?? {});
        if (g) glowPass.apply(surf.ctx, surf.canvas, g, { scale, width, height, opacity: 1 });
      }
      maskPass.matteToMask(surf, l.matte.mode, src?.opacity ?? 1);
      return surf;
    };

    for (const l of now.layers) {
      if (l.enabled === false) continue;
      const type = layerTypes[l.type];
      if (!type) throw new Error(`Unknown layer type "${l.type}" (layer "${l.id}")`);
      const lt = layerTime(l);
      if (!lt) continue;
      if (type.adjust) {
        const adjInfo = {
          width,
          height,
          blend: l.blend ?? 'normal',
          opacity: l.opacity ?? 1,
          t: lt.t,
          seconds: lt.seconds,
        };
        const limit = l.matte || l.masks?.length;
        if (!limit) {
          // Adjustment layer: recolour what is below, in place.
          octx.save();
          octx.setTransform(1, 0, 0, 1, 0, 0);
          type.adjust(octx, l.params ?? {}, adjInfo);
          octx.restore();
          continue;
        }
        // Limited by a matte / masks: adjust a copy, then mix it in where the mask shows.
        const iso = maskPass.surface('iso', width, height);
        iso.ctx.save();
        iso.ctx.setTransform(1, 0, 0, 1, 0, 0);
        iso.ctx.globalCompositeOperation = 'copy';
        iso.ctx.drawImage(out.canvas, 0, 0);
        iso.ctx.restore();
        type.adjust(iso.ctx, l.params ?? {}, adjInfo);
        const area = maskPass.surface('area', width, height);
        area.ctx.save();
        area.ctx.setTransform(1, 0, 0, 1, 0, 0);
        area.ctx.globalCompositeOperation = 'copy';
        area.ctx.fillStyle = '#ffffff';
        area.ctx.fillRect(0, 0, width, height);
        area.ctx.restore();
        const lm = maskOf(l);
        if (lm) maskPass.cut(area.ctx, lm.canvas);
        const mm = matteOf(l);
        if (mm) maskPass.cut(area.ctx, mm.canvas);
        mixByMask(octx, iso.ctx, area.ctx, width, height);
        continue;
      }

      if (!drawLayer(l, layer)) continue;
      const glow = type.glow?.(l.params ?? {});
      const matte = matteOf(l);
      if (!matte) {
        compositeLayer(octx, layer.canvas, l.blend ?? 'normal', l.opacity ?? 1);
        // Optional glow: additive light from the finished layer, on top of it.
        if (glow)
          glowPass.apply(octx, layer.canvas, glow, {
            scale,
            width,
            height,
            opacity: l.opacity ?? 1,
          });
        continue;
      }
      // Track matte: the layer AND its glow are cut by the matte, then composited.
      const iso = maskPass.surface('iso', width, height);
      iso.ctx.save();
      iso.ctx.setTransform(1, 0, 0, 1, 0, 0);
      iso.ctx.globalCompositeOperation = 'copy';
      iso.ctx.drawImage(layer.canvas, 0, 0);
      iso.ctx.restore();
      if (glow) glowPass.apply(iso.ctx, layer.canvas, glow, { scale, width, height, opacity: 1 });
      maskPass.cut(iso.ctx, matte.canvas);
      compositeLayer(octx, iso.canvas, l.blend ?? 'normal', l.opacity ?? 1);
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
