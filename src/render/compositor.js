// @ts-check
/**
 * Compositor: stacks rendered layers onto the output with a blend mode and opacity.
 *
 * Blend modes (brief §3.3, extended in 3.6a [Raul]): the After Effects set that Canvas 2D
 * supports natively. `add` = Canvas 'lighter' (colours summed: glows, fire cores, sparks).
 * Over a TRANSPARENT backdrop every mode behaves like normal (as in After Effects), so blends
 * show where layers overlap.
 */

/**
 * @typedef {'normal' | 'add' | 'screen' | 'multiply' | 'overlay' | 'darken' | 'lighten'
 *   | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light' | 'difference' | 'exclusion'
 *   | 'hue' | 'saturation' | 'color' | 'luminosity'} BlendMode
 */

/** @type {Readonly<Record<BlendMode, GlobalCompositeOperation>>} */
export const BLEND_MODES = Object.freeze({
  normal: 'source-over',
  add: 'lighter',
  screen: 'screen',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  multiply: 'multiply',
  darken: 'darken',
  'color-burn': 'color-burn',
  overlay: 'overlay',
  'soft-light': 'soft-light',
  'hard-light': 'hard-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
});

/** Display names, grouped like After Effects' menu. */
export const BLEND_MODE_LABELS = Object.freeze(
  /** @type {Record<BlendMode, string>} */ ({
    normal: 'Normal',
    add: 'Add',
    screen: 'Screen',
    lighten: 'Lighten',
    'color-dodge': 'Colour Dodge',
    multiply: 'Multiply',
    darken: 'Darken',
    'color-burn': 'Colour Burn',
    overlay: 'Overlay',
    'soft-light': 'Soft Light',
    'hard-light': 'Hard Light',
    difference: 'Difference',
    exclusion: 'Exclusion',
    hue: 'Hue',
    saturation: 'Saturation',
    color: 'Colour',
    luminosity: 'Luminosity',
  }),
);

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
