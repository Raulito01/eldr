// @ts-check
/**
 * Cel banding (brief §3.3): instead of a smooth core→edge gradient, the element is painted as
 * N hard-edged bands. Bands are nested copies of the element's own outline (not circles), each
 * with its own seeded edge wobble, so they read as hand-drawn toon shading.
 *
 * Works on any shape that can provide an outline as a flat [x, y, …] point array around (0, 0).
 */

import { parseHex } from '../core/color.js';
import { subSeed } from '../core/hash.js';
import { createNoise } from '../core/noise.js';
import { sampleRamp } from './ramp.js';

/** Edge-noise detail around each band outline (features per full turn, roughly). */
const BAND_NOISE_FREQUENCY = 1.8;

/**
 * Ramp positions of each band, outermost first: band 0 sits at the edge position, the last band
 * at the core position.
 * @param {number} bands ≥ 1 @param {number} core ramp position of the core @param {number} edge
 * @returns {number[]}
 */
export function bandPositions(bands, core, edge) {
  if (bands <= 1) return [core];
  return Array.from({ length: bands }, (_, i) => edge + (core - edge) * (i / (bands - 1)));
}

/**
 * Size of each band's outline relative to the full outline, outermost first (1, …, 1/N).
 * @param {number} bands ≥ 1
 */
export function bandScales(bands) {
  return Array.from({ length: bands }, (_, i) => 1 - i / bands);
}

/**
 * Colour of the ramp stop nearest to `pos` (for the strict-palette "snap" option).
 * @param {ReadonlyArray<{pos: number, color: string}>} ramp @param {number} pos
 */
export function nearestStopColor(ramp, pos) {
  let best = ramp[0];
  for (const s of ramp) if (Math.abs(s.pos - pos) < Math.abs(best.pos - pos)) best = s;
  return parseHex(best.color);
}

/**
 * Outline of one inner band: the full outline scaled down, with optional radial edge wobble.
 * @param {Float64Array} outline flat [x, y, …] around (0, 0)
 * @param {number} scale band size relative to the outline
 * @param {number} wobble edge noise amount (0–1), relative to one band's thickness
 * @param {number} seed band seed
 * @param {number} t effect time (lets band edges boil along with the shape)
 * @param {number} bands total band count (band thickness = 1 / bands)
 * @returns {Float64Array}
 */
export function bandOutline(outline, scale, wobble, seed, t, bands) {
  const n = outline.length / 2;
  const out = new Float64Array(outline.length);
  const noise = wobble > 0 ? createNoise(seed) : null;
  const thickness = 1 / bands;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let s = scale;
    if (noise) {
      const w = noise.noise3D(
        Math.cos(a) * BAND_NOISE_FREQUENCY,
        Math.sin(a) * BAND_NOISE_FREQUENCY,
        t * 2,
      );
      // At most ~45% of a band's thickness, so bands wobble but never swallow each other.
      s = Math.max(0.02, scale + w * wobble * thickness * 0.45);
    }
    out[i * 2] = outline[i * 2] * s;
    out[i * 2 + 1] = outline[i * 2 + 1] * s;
  }
  return out;
}

/**
 * @typedef {object} BandOptions
 * @property {number} bands      ≥ 1
 * @property {number} core       ramp position of the core
 * @property {number} edge       ramp position of the edge
 * @property {number} edgeNoise  0–1
 * @property {boolean} snap      use exact ramp stop colours
 * @property {number} seed       instance seed
 * @property {number} t          effect time
 * @property {number} [from=0]   first band to paint (0 = outermost)
 * @property {number} [to]       last band to paint, inclusive (default: innermost)
 */

/**
 * @typedef {{ x: number, y: number, outline: Float64Array, r?: number }} ShapePart
 *   one closed outline around its own centre (x, y); multi-part shapes (puffs) have several
 */

/**
 * Paint shape parts as hard cel bands, outermost first. Each band is painted for ALL parts as
 * one path, so overlapping parts (a puff's bumps) merge into one banded union, and inner bands
 * are the whole union shrunk toward the centre.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReadonlyArray<{pos: number, color: string}>} ramp
 * @param {ReadonlyArray<ShapePart>} parts
 * @param {BandOptions} o
 * @param {(ctx: CanvasRenderingContext2D, pts: Float64Array) => void} trace adds one outline path
 * @param {(rgba: ArrayLike<number>) => string} toCss
 */
export function paintBands(ctx, ramp, parts, o, trace, toCss) {
  const positions = bandPositions(o.bands, o.core, o.edge);
  const scales = bandScales(o.bands);
  const first = o.from ?? 0;
  const last = o.to ?? positions.length - 1;
  positions.forEach((pos, i) => {
    if (i < first || i > last) return;
    const rgba = o.snap ? nearestStopColor(ramp, pos) : sampleRamp(ramp, pos);
    ctx.fillStyle = toCss(rgba);
    ctx.beginPath();
    parts.forEach((part, k) => {
      // Part 0 keeps the original band seeds, so single-outline shapes look as before.
      const seed = subSeed(o.seed, 'band', k === 0 ? i : i + 1000 * k);
      const pts =
        i === 0
          ? part.outline
          : bandOutline(part.outline, scales[i], o.edgeNoise, seed, o.t, o.bands);
      // Inner bands shrink the WHOLE shape toward its centre (positions too), so a multi-part
      // shape gets one nested core, not a separate core per part.
      ctx.save();
      ctx.translate(part.x * scales[i], part.y * scales[i]);
      trace(ctx, pts);
      ctx.restore();
    });
    ctx.fill();
  });
}
