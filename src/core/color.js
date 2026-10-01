// @ts-check
/**
 * Colour helpers. Colours are stored as hex strings ('#rrggbb' or '#rrggbbaa', as normalized by
 * the schema) and worked on as RGBA arrays: [r, g, b] 0–255, a 0–255.
 *
 * Mixing happens in sRGB, like Photoshop/After Effects gradients — what an artist expects
 * when placing ramp stops.
 */

/** @typedef {[number, number, number, number]} RGBA */

/**
 * '#rgb' | '#rgba' | '#rrggbb' | '#rrggbbaa' → [r, g, b, a]. Invalid input → opaque magenta,
 * so mistakes are visible instead of silently black.
 * @param {string} hex
 * @returns {RGBA}
 */
export function parseHex(hex) {
  let h = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) return [255, 0, 255, 255];
  const n = (/** @type {number} */ i) => Number.parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

/**
 * [r, g, b, a] → '#rrggbb' (or '#rrggbbaa' when not opaque). Values are rounded and clamped.
 * @param {ArrayLike<number>} c
 */
export function toHex(c) {
  const b = (/** @type {number} */ v) =>
    Math.min(255, Math.max(0, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  const a = c[3] ?? 255;
  return `#${b(c[0])}${b(c[1])}${b(c[2])}${Math.round(a) >= 255 ? '' : b(a)}`;
}

/**
 * CSS rgba() string for canvas fill styles.
 * @param {ArrayLike<number>} c
 */
export const toCss = (c) =>
  `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${Math.round(c[3] ?? 255) / 255})`;

/**
 * Linear mix of two colours (sRGB, alpha included).
 * @param {RGBA} a @param {RGBA} b @param {number} t 0–1
 * @returns {RGBA}
 */
export const mixRgba = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];
