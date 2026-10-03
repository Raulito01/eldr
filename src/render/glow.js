// @ts-check
/**
 * Glow (step 3.4a): soft additive light around a layer, the "bloom" that carries most of the
 * energy in Raul's reference effects. Any layer can glow; it is drawn AFTER the layer itself,
 * with additive blending, so it brightens whatever is underneath (like light, not paint).
 *
 * Two blurs are summed: a wide soft one (`glow.radius`) and a tight bright "core" halo
 * (a quarter of the radius, weighted by `glow.core`).
 *
 * Blur uses Canvas `ctx.filter = 'blur()'` where the browser supports it, and otherwise a
 * downscale/upscale blur that works everywhere (e.g. older Safari). Both are deterministic
 * within one runtime, which is ELDR's guarantee (D-016).
 */

import { parseHex } from '../core/color.js';
import { lightToAlpha } from './lightAlpha.js';

/** Core halo radius as a fraction of the main glow radius. */
const CORE_RADIUS_RATIO = 0.25;
/** Below this blur radius (output px) a blur pass is skipped: it would be invisible. */
const MIN_BLUR_PX = 0.5;
/** Fallback blur: each downscale step halves the size; stop once a step covers this radius. */
const FALLBACK_PX_PER_HALVING = 2;

/** Glow parameters (ids `glow.*`). Off by default. Defaults are provisional [Raul]. */
export const GLOW_PARAMS = [
  {
    id: 'glow.amount',
    label: 'Glow',
    group: 'Glow',
    type: 'float',
    min: 0,
    max: 4,
    step: 0.01,
    default: 0,
    tooltip: '0 = off. Soft light around the layer, added on top (brightens what is below)',
  },
  {
    id: 'glow.radius',
    label: 'Glow radius',
    group: 'Glow',
    type: 'float',
    min: 1,
    max: 256,
    step: 1,
    default: 24,
    unit: 'px',
    tooltip: 'How far the glow spreads',
  },
  {
    id: 'glow.core',
    label: 'Core halo',
    group: 'Glow',
    type: 'float',
    min: 0,
    max: 2,
    step: 0.01,
    default: 0.5,
    tooltip: 'Extra tight, bright halo hugging the shape',
  },
  {
    id: 'glow.tint',
    label: 'Glow colour',
    group: 'Glow',
    type: 'color',
    default: '#ffffff00',
    tooltip: 'Colour of the glow. Its alpha = how much it replaces the layer’s own colours',
  },
];

/**
 * @typedef {object} GlowSpec
 * @property {number} amount  > 0
 * @property {number} radius  effect px
 * @property {number} core
 * @property {{ r: number, g: number, b: number, a: number }} tint  a = tint strength 0–1
 */

/** @param {string} hex */
function tintOf(hex) {
  const [r, g, b, a] = parseHex(hex);
  return { r, g, b, a: a / 255 };
}

/**
 * Glow settings from layer params, or null when the layer doesn't glow.
 * @param {Record<string, any>} params
 * @returns {GlowSpec | null}
 */
export function readGlow(params) {
  const amount = params['glow.amount'] ?? 0;
  if (!(amount > 0)) return null;
  return {
    amount,
    radius: params['glow.radius'] ?? 24,
    core: params['glow.core'] ?? 0,
    tint: tintOf(params['glow.tint'] ?? '#ffffff00'),
  };
}

/**
 * Does this context support `ctx.filter` blur?
 * @param {CanvasRenderingContext2D} ctx
 */
export function supportsFilterBlur(ctx) {
  if (!('filter' in ctx)) return false;
  const before = ctx.filter;
  ctx.filter = 'blur(1px)';
  const ok = ctx.filter === 'blur(1px)';
  ctx.filter = before;
  return ok;
}

/**
 * Glow pass bound to a backend (owns its scratch surfaces, reused between frames).
 * @param {import('./canvas2d/backend.js').Backend} backend
 * @param {{ forceFallback?: boolean }} [options]  forceFallback: test the downscale blur path
 */
export function createGlowPass(backend, options = {}) {
  /** @type {import('./canvas2d/backend.js').Surface | null} */
  let blur = null;
  /** @type {import('./canvas2d/backend.js').Surface[]} */
  const steps = [];
  /** @type {boolean | null} */
  let useFilter = null;

  /** @param {number} w @param {number} h */
  function blurSurface(w, h) {
    if (!blur) blur = backend.createSurface(w, h);
    else backend.resize(blur, w, h);
    if (useFilter === null) useFilter = !options.forceFallback && supportsFilterBlur(blur.ctx);
    return blur;
  }

  /**
   * Blur `src` into `dst` (cleared first) with roughly Gaussian radius `r` output px.
   * @param {import('./canvas2d/backend.js').Surface} dst @param {any} src @param {number} r
   */
  function blurInto(dst, src, r) {
    const c = dst.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;
    c.clearRect(0, 0, dst.width, dst.height);
    if (useFilter) {
      c.filter = `blur(${r}px)`;
      c.drawImage(src, 0, 0);
      c.filter = 'none';
    } else {
      // Halve repeatedly (each halving ≈ a small blur), then scale back up with smoothing.
      let level = src;
      let w = dst.width;
      let h = dst.height;
      const halvings = Math.max(
        1,
        Math.round(Math.log2(Math.max(1, r / FALLBACK_PX_PER_HALVING))) + 1,
      );
      for (let i = 0; i < halvings && w > 2 && h > 2; i++) {
        w = Math.max(1, Math.ceil(w / 2));
        h = Math.max(1, Math.ceil(h / 2));
        if (!steps[i]) steps[i] = backend.createSurface(w, h);
        else backend.resize(steps[i], w, h);
        const s = steps[i].ctx;
        s.save();
        s.setTransform(1, 0, 0, 1, 0, 0);
        s.clearRect(0, 0, w, h);
        s.imageSmoothingEnabled = true;
        s.imageSmoothingQuality = 'high';
        s.drawImage(level, 0, 0, w, h);
        s.restore();
        level = steps[i].canvas;
      }
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(level, 0, 0, dst.width, dst.height);
    }
    c.restore();
  }

  /**
   * Add a layer's glow onto the output.
   * @param {CanvasRenderingContext2D} octx  output (identity transform expected)
   * @param {any} layerCanvas  the finished layer pixels
   * @param {GlowSpec} g
   * @param {{ scale: number, width: number, height: number, opacity?: number, unmult?: boolean }} info
   *   unmult (D-096): the glow gets alpha from its brightness (no dark halo with alpha)
   */
  function apply(octx, layerCanvas, g, info) {
    const surf = blurSurface(info.width, info.height);
    const opacity = info.opacity ?? 1;
    const passes = [
      { r: g.radius * info.scale, weight: 1 },
      { r: g.radius * info.scale * CORE_RADIUS_RATIO, weight: g.core },
    ];
    for (const pass of passes) {
      if (pass.weight <= 0 || pass.r < MIN_BLUR_PX) continue;
      blurInto(surf, layerCanvas, pass.r);
      if (g.tint.a > 0) {
        const c = surf.ctx;
        c.save();
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalCompositeOperation = 'source-atop';
        c.globalAlpha = g.tint.a;
        c.fillStyle = `rgb(${g.tint.r},${g.tint.g},${g.tint.b})`;
        c.fillRect(0, 0, surf.width, surf.height);
        c.restore();
      }
      if (info.unmult) lightToAlpha(surf.ctx, surf.width, surf.height);
      // Additive. Strength above 1 = the glow drawn several times (whole + remainder).
      let strength = g.amount * pass.weight * opacity;
      octx.save();
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.globalCompositeOperation = 'lighter';
      while (strength > 0) {
        octx.globalAlpha = Math.min(1, strength);
        octx.drawImage(surf.canvas, 0, 0);
        strength -= 1;
      }
      octx.restore();
    }
  }

  // blurInto / blurSurface are reused by masks (feather, 3.6d)
  return { apply, usesFilter: () => useFilter, blurInto, blurSurface };
}
