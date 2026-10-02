// @ts-check
/**
 * Blend modes as per-pixel maths (3.8b, D-063), matching the Canvas / W3C Compositing formulas
 * for the colour part. Used where a layer must blend WITHOUT changing alpha — adjustment layers
 * recolour what is below them, they never add coverage.
 *
 * Colours are 0–1 RGB; `b` = backdrop (below), `s` = source (the adjusted colour).
 */

/** @typedef {[number, number, number]} RGB */

const lum = (/** @type {RGB} */ c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

/** @param {RGB} c */
function clipColor(c) {
  const l = lum(c);
  const n = Math.min(c[0], c[1], c[2]);
  const x = Math.max(c[0], c[1], c[2]);
  /** @type {RGB} */
  let o = [c[0], c[1], c[2]];
  if (n < 0) o = /** @type {RGB} */ (o.map((v) => l + ((v - l) * l) / (l - n || 1e-9)));
  if (x > 1) o = /** @type {RGB} */ (o.map((v) => l + ((v - l) * (1 - l)) / (x - l || 1e-9)));
  return o;
}
/** @param {RGB} c @param {number} l */
const setLum = (c, l) => {
  const d = l - lum(c);
  return clipColor([c[0] + d, c[1] + d, c[2] + d]);
};
const sat = (/** @type {RGB} */ c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
/** @param {RGB} c @param {number} s */
function setSat(c, s) {
  const idx = [0, 1, 2].sort((a, b) => c[a] - c[b]);
  const [mn, md, mx] = idx;
  /** @type {RGB} */
  const o = [0, 0, 0];
  if (c[mx] > c[mn]) {
    o[md] = ((c[md] - c[mn]) * s) / (c[mx] - c[mn]);
    o[mx] = s;
  }
  return o;
}

/** Separable modes: channel formula. */
const SEP = /** @type {Record<string, (b: number, s: number) => number>} */ ({
  normal: (_b, s) => s,
  add: (b, s) => Math.min(1, b + s),
  multiply: (b, s) => b * s,
  screen: (b, s) => b + s - b * s,
  overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  darken: (b, s) => Math.min(b, s),
  lighten: (b, s) => Math.max(b, s),
  'color-dodge': (b, s) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  'color-burn': (b, s) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  'hard-light': (b, s) => (s <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
  'soft-light': (b, s) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
  difference: (b, s) => Math.abs(b - s),
  exclusion: (b, s) => b + s - 2 * b * s,
});

/**
 * Blend source over backdrop with a mode (colour only).
 * @param {string} mode one of BLEND_MODES' keys @param {RGB} b @param {RGB} s @returns {RGB}
 */
export function blendRgb(mode, b, s) {
  const f = SEP[mode];
  if (f) return [f(b[0], s[0]), f(b[1], s[1]), f(b[2], s[2])];
  switch (mode) {
    case 'hue':
      return setLum(setSat(s, sat(b)), lum(b));
    case 'saturation':
      return setLum(setSat(b, sat(s)), lum(b));
    case 'color':
      return setLum(s, lum(b));
    case 'luminosity':
      return setLum(b, lum(s));
    default:
      return s;
  }
}
