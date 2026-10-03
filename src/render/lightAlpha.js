// @ts-check
/**
 * Light → alpha (D-096): an "Unmult" for LIGHT ONLY.
 *
 * Glows and Add-blend layers are light: they add brightness. Saved in a PNG with alpha, their
 * soft pixels become dim, desaturated paint at partial alpha — over anything brighter than
 * the glow they darken it (the "drop shadow" halo Raul saw; AE fixes it with Unmult).
 *
 * Before light is added, each of its pixels gets alpha = its brightest premultiplied channel
 * and its colour is brightened to match. The PREMULTIPLIED colour is unchanged, so:
 *   • over solid paint the light still adds exactly as before (alpha clamps at 1);
 *   • over transparency it becomes a clean, saturated glow whose dim parts are nearly
 *     transparent — no dark halo on light or dark backgrounds, with plain Normal blending.
 * Painted layers are never touched: dark outlines, smoke and cel shades keep their alpha.
 */

/** Light alpha modes: 'unmult' (default for effects) or 'additive' (as before 0.0.70). */
export const LIGHT_ALPHA_PARAMS = [
  {
    id: 'light.alpha',
    label: 'Glow on alpha',
    group: 'Export look',
    type: 'enum',
    options: [
      { value: 'unmult', label: 'Clean (Unmult light)' },
      { value: 'additive', label: 'As before' },
    ],
    default: 'unmult',
    tooltip:
      'How glows and Add layers are saved with alpha. Clean: light gets alpha from its brightness (like AE Unmult, only on light) — looks right over any background with Normal blending',
  },
];

/**
 * Convert a surface's pixels to "light alpha" in place (see above). Pixels with no light
 * become fully transparent. Only the box that holds pixels is read and written.
 * @param {CanvasRenderingContext2D} ctx  identity transform expected
 * @param {number} width @param {number} height
 */
export function lightToAlpha(ctx, width, height) {
  if (width <= 0 || height <= 0) return;
  const img = ctx.getImageData(0, 0, width, height);
  const d = img.data;
  let changed = false;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a === 0) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    // brightest straight channel × alpha = brightest premultiplied channel (0–255)
    const m = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (m === 255) continue; // already as bright as it can be: alpha stays
    changed = true;
    if (m === 0) {
      d[i + 3] = 0;
      continue;
    }
    const na = (a * m) / 255;
    const k = 255 / m; // colour × k keeps colour × alpha (premultiplied) the same
    d[i] = r * k;
    d[i + 1] = g * k;
    d[i + 2] = b * k;
    d[i + 3] = Math.round(na);
  }
  if (changed) ctx.putImageData(img, 0, 0);
}
