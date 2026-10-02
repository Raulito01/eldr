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
import { setLoopPeriod } from '../core/loopContext.js';
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
 * @property {Layer[]} [children]  precomp (3.6e): the precomp's layers, composited as this layer
 * @property {(seconds: number) => Layer[]} [childrenAt]  animated precomp: its layers at a
 *   moment of ITS time (the precomp layer's own time)
 * @property {(seconds: number) => number[]} [matrixAt]  emitters (4.Pb): the layer's transform
 *   at a moment of its comp's time
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
 * @property {number} [pixelSnap]  Pixel Mode (C2, D-086): output px per art pixel — layer and
 *   element positions snap to that grid, so slow movement steps whole pixels (no shimmer)
 * @property {boolean} [pixelSnapParticles]  also snap each particle / element (not only layers)
 */

/**
 * @typedef {object} LayerFrame  what a layer's render function receives about "now"
 * @property {number} frame    frame index of the drawing (start of its hold group)
 * @property {number} t        normalized effect time 0–1
 * @property {number} seconds
 * @property {number} seed     this layer's own sub-seed
 * @property {import('../core/timing.js').Timing} timing
 * @property {number[]} [matrix]  the layer's own transform now (4.Pb: world-space particles)
 * @property {(seconds: number) => number[]} [matrixAt]  the layer's transform at another moment
 *   of its own time (emitters: where each particle was born)
 * @property {import('./masks.js').Mask[]} [masks]  the layer's masks (emitters: "along path")
 * @property {number} [pixelSnap]  output px per art pixel (Pixel Mode): snap element positions
 * @property {number[]} [snapShift]  how far the layer was moved to snap it (output px): world-space
 *   particles undo it, so they stay exactly where they were born
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
 * @property {number} [scale]  effect px → output px (D-078: goo reach)
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

/** Precomps nested deeper than this render nothing (guards against loops). */
export const MAX_PRECOMP_DEPTH = 8;

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

  /** Layer scratch surfaces per precomp depth (3.6e). @type {import('./canvas2d/backend.js').Surface[]} */
  const scratches = [];
  /** @param {number} depth @param {number} w @param {number} h */
  function scratchAt(depth, w, h) {
    if (depth === 0) return /** @type {any} */ (scratch);
    if (!scratches[depth]) scratches[depth] = backend.createSurface(w, h);
    else backend.resize(scratches[depth], w, h);
    return scratches[depth];
  }

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
    // seamless loops (D-071): shapes make time-evolving noise, spins and pulses repeat
    setLoopPeriod(effect.timing.loop ? effect.timing.frameCount / effect.timing.fps : 0);
    const { out } = surfaces(width, height);
    const octx = out.ctx;

    /** a ∘ b (2D affine, [a b c d e f]). @param {number[]} a @param {number[]} b */
    const mul = (a, b) => [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];

    /**
     * Composite a list of layers (bottom → top) into `target` (cleared first). Precomp layers
     * (3.6e) recurse: their children are composited at the precomp's own layer time, with the
     * precomp's transform on top of theirs.
     * @param {Layer[]} layers
     * @param {import('../core/timing.js').FrameTime} time  time of THIS list (comp / precomp)
     * @param {import('./canvas2d/backend.js').Surface} target
     * @param {number[]} parentBase  effect px of this list → output px
     * @param {number} depth  0 = the main comp
     */
    function compose(layers, time, target, parentBase, depth) {
      const octx = target.ctx;
      octx.save();
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalCompositeOperation = 'source-over';
      octx.globalAlpha = 1;
      octx.clearRect(0, 0, width, height);
      octx.restore();
      if (depth > MAX_PRECOMP_DEPTH) return;
      const layer = scratchAt(depth, width, height);
      const S = (/** @type {string} */ k) => maskPass.surface(`${k}${depth}`, width, height);
      const byId = new Map(layers.map((l) => [l.id, l]));

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
      const baseMatrix = (l) => (l.matrix ? mul(parentBase, l.matrix) : parentBase);
      /** The combined mask of a layer, or null. @param {Layer} l */
      const maskOf = (l) =>
        l.masks?.length
          ? maskPass.build(l.masks, { width, height, scale, base: baseMatrix(l) })
          : null;

      /**
       * Draw one layer (render or precomp, masks, post-process) into `surf`. Returns false when
       * the layer is not on screen now.
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
        const layerSeed = subSeed(seed, l.seedKey ?? l.id);
        if (l.children) {
          // Precomp: its layers, at its own time, with its transform.
          const kids = l.childrenAt ? l.childrenAt(lt.seconds) : l.children;
          compose(kids, lt, surf, baseMatrix(l), depth + 1);
        } else {
          lctx.save();
          const b = baseMatrix(l);
          const q = settings.pixelSnap ?? 0;
          // Pixel Mode: the layer's position on whole art pixels
          const bx = q > 0 ? Math.round(b[4] / q) * q : b[4];
          const by = q > 0 ? Math.round(b[5] / q) * q : b[5];
          lctx.setTransform(b[0], b[1], b[2], b[3], bx, by);
          // Layers see only the held drawing's time, so every frame inside a hold is identical.
          const lm = l.matrixAt;
          type.render(lctx, l.params ?? {}, {
            frame: time.drawFrame,
            t: lt.t,
            seconds: lt.seconds,
            seed: layerSeed,
            timing: effect.timing,
            matrix: l.matrix ?? [1, 0, 0, 1, 0, 0],
            ...(lm
              ? {
                  // layer seconds → its comp's seconds
                  matrixAt: (/** @type {number} */ s) =>
                    lm(l.time ? l.time.offset + s * (l.time.stretch || 1) : s),
                }
              : {}),
            ...(l.masks ? { masks: l.masks } : {}),
            ...(q > 0 ? { snapShift: [bx - b[4], by - b[5]] } : {}),
            ...(q > 0 && settings.pixelSnapParticles ? { pixelSnap: q } : {}),
          });
          lctx.restore();
        }
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

      /** Track matte of a layer as a mask surface, or null for none. @param {Layer} l */
      const matteOf = (l) => {
        if (!l.matte) return null;
        const src = byId.get(l.matte.source);
        const surf = S('matte');
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

      for (const l of layers) {
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
            scale,
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
          const iso = S('iso');
          iso.ctx.save();
          iso.ctx.setTransform(1, 0, 0, 1, 0, 0);
          iso.ctx.globalCompositeOperation = 'copy';
          iso.ctx.drawImage(target.canvas, 0, 0);
          iso.ctx.restore();
          type.adjust(iso.ctx, l.params ?? {}, adjInfo);
          const area = S('area');
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
        const iso = S('iso');
        iso.ctx.save();
        iso.ctx.setTransform(1, 0, 0, 1, 0, 0);
        iso.ctx.globalCompositeOperation = 'copy';
        iso.ctx.drawImage(layer.canvas, 0, 0);
        iso.ctx.restore();
        if (glow) glowPass.apply(iso.ctx, layer.canvas, glow, { scale, width, height, opacity: 1 });
        maskPass.cut(iso.ctx, matte.canvas);
        compositeLayer(octx, iso.canvas, l.blend ?? 'normal', l.opacity ?? 1);
      }
    }

    // Animated effects resolve their keyframes for this moment first (pure, 3.6c).
    const now = effect.at ? effect.at(time) : effect;
    /** Output px of effect px at the root (scale + pivot). */
    const rootBase = [scale, 0, 0, scale, pivot.x * width, pivot.y * height];
    compose(now.layers, time, out, rootBase, 0);

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
