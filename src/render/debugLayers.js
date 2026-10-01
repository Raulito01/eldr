// @ts-check
/**
 * Debug layer types for test pages and renderer tests. NOT effect content — real layers
 * (blob, puff, streak…) arrive from step 1.4 on, with their parameters in schemas.
 */

import { getEasing } from '../core/easing.js';
import { createRng } from '../core/prng.js';

/** @type {Record<string, import('./renderer.js').LayerType>} */
export const DEBUG_LAYER_TYPES = {
  /** Solid fill over the whole surface. params: { color } */
  debugFill: {
    render(ctx, params) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = params.color;
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    },
  },

  /**
   * Circle travelling from `from` to `to` over the effect's life.
   * params: { color, radius (effect px), from: {x,y}, to: {x,y}, easing (name), jitter (px) }
   * `jitter` adds a seeded per-layer offset, to make seed changes visible.
   */
  debugCircle: {
    render(ctx, params, frame) {
      const k = getEasing(params.easing ?? 'linear')(frame.t);
      const rng = createRng(frame.seed);
      const jitter = params.jitter ?? 0;
      const x = params.from.x + (params.to.x - params.from.x) * k + rng.range(-jitter, jitter);
      const y = params.from.y + (params.to.y - params.from.y) * k + rng.range(-jitter, jitter);
      ctx.fillStyle = params.color;
      ctx.beginPath();
      ctx.arc(x, y, params.radius, 0, Math.PI * 2);
      ctx.fill();
    },
  },
};
