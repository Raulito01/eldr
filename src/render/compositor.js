// @ts-check
/**
 * Compositor: stacks rendered layers onto the output with a blend mode and opacity.
 *
 * Blend modes (brief §3.3):
 * - normal: regular "over"
 * - add:    colours are summed (Canvas 'lighter') — glows, fire cores, sparks
 * - screen: 1 − (1 − a)(1 − b) — brightens without blowing out as hard as add
 */

/** @typedef {'normal' | 'add' | 'screen'} BlendMode */

/** @type {Readonly<Record<BlendMode, GlobalCompositeOperation>>} */
export const BLEND_MODES = Object.freeze({
  normal: 'source-over',
  add: 'lighter',
  screen: 'screen',
});

/** Names of the supported blend modes. */
export const BLEND_MODE_NAMES = Object.freeze(
  /** @type {BlendMode[]} */ (Object.keys(BLEND_MODES)),
);

/**
 * Draw `src` onto `dst` with a blend mode and opacity. Leaves `dst`'s state unchanged.
 * @param {CanvasRenderingContext2D} dst destination context (identity transform expected)
 * @param {any} src source canvas, same size as the destination
 * @param {BlendMode} blend
 * @param {number} opacity 0–1
 */
export function compositeLayer(dst, src, blend, opacity) {
  const op = BLEND_MODES[blend];
  if (!op) throw new Error(`Unknown blend mode "${blend}"`);
  if (opacity <= 0) return;
  dst.save();
  dst.setTransform(1, 0, 0, 1, 0, 0);
  dst.globalCompositeOperation = op;
  dst.globalAlpha = Math.min(1, opacity);
  dst.drawImage(src, 0, 0);
  dst.restore();
}
