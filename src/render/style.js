// @ts-check
/**
 * Element style (brief §3.3), shared by every shape: colour comes from a ramp. Each instance
 * sits at a "ramp position" that moves with its age (ramp over life), and its core sits
 * earlier on the ramp (hotter) than its edge (core → edge spread).
 *
 * Cel bands (2.2): with `bands` ≥ 1 the element is painted as hard bands instead of a smooth
 * gradient. Toon shading (2.3): shadow crescent + highlight, see paintStyled(). Outline: 2.4.
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { paintBands } from './celshade.js';
import { rampBreakpoints, sampleRamp } from './ramp.js';
import { lightVector } from './shading.js';

/** Default fire ramp — placeholder until Raul picks one (see DECISIONS) [Raul]. */
export const DEFAULT_FIRE_RAMP = Object.freeze([
  { pos: 0, color: '#ffffff' },
  { pos: 0.12, color: '#fff3a0' },
  { pos: 0.3, color: '#ffc23d' },
  { pos: 0.5, color: '#ff6a1f' },
  { pos: 0.7, color: '#c7281e' },
  { pos: 0.85, color: '#5a1a1e' },
  { pos: 1, color: '#3b3540' },
]);

/** Style parameters (ids `style.*`). Defaults are provisional [Raul]. */
export const STYLE_PARAMS = [
  {
    id: 'style.ramp',
    label: 'Colour ramp',
    group: 'Colour',
    type: 'ramp',
    default: DEFAULT_FIRE_RAMP.map((s) => ({ ...s })),
    tooltip: 'Colours the element passes through. Left = hot/start, right = cool/end.',
  },
  {
    id: 'style.rampOverLife',
    label: 'Ramp over life',
    group: 'Colour',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Where on the ramp the element is as it ages (0 = left end, 1 = right end)',
  },
  {
    id: 'style.spread',
    label: 'Core → edge',
    group: 'Colour',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    randomize: { min: 0.1, max: 0.5 },
    tooltip: 'How much further along the ramp the edge is than the core (0 = one flat colour)',
  },
  {
    id: 'style.bands',
    label: 'Cel bands',
    group: 'Colour',
    type: 'int',
    min: 0,
    max: 6,
    default: 3,
    randomize: { min: 2, max: 4 },
    tooltip: '0 = smooth gradient · 1–6 = hard toon bands that follow the shape',
  },
  {
    id: 'style.bandNoise',
    label: 'Band edge noise',
    group: 'Colour',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.25,
    randomize: { min: 0, max: 0.6 },
    tooltip: 'Hand-drawn wobble on the inner band edges',
  },
  {
    id: 'style.snapColors',
    label: 'Snap to ramp stops',
    group: 'Colour',
    type: 'bool',
    default: false,
    tooltip: 'Each band uses the nearest exact ramp colour (strict toon palette)',
  },
];

/**
 * @typedef {object} Style
 * @property {import('./ramp.js').RampStop[]} ramp
 * @property {import('../core/curve.js').CurvePoint[]} rampOverLife
 * @property {number} spread
 * @property {number} bands      0 = smooth gradient
 * @property {number} bandNoise
 * @property {boolean} snapColors
 */

/** @param {Record<string, any>} v @returns {Style} */
export const readStyle = (v) => ({
  ramp: v['style.ramp'],
  rampOverLife: v['style.rampOverLife'],
  spread: v['style.spread'],
  bands: v['style.bands'] ?? 0,
  bandNoise: v['style.bandNoise'] ?? 0,
  snapColors: v['style.snapColors'] ?? false,
});

/** Ramp position of an instance's core at a given age (0–1). @param {Style} s @param {number} age */
export const corePosition = (s, age) => Math.min(1, Math.max(0, evalCurve(s.rampOverLife, age)));

/**
 * Canvas fill for one instance: a flat colour, or a radial gradient from core to edge that
 * follows the ramp exactly (gradient stops at every ramp stop in between).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Style} s
 * @param {number} age instance life 0–1
 * @param {number} radius distance from the centre where the edge colour is reached (effect px)
 * @param {number} [shift=0] ramp-position offset (shadow > 0, highlight < 0)
 * @returns {string | CanvasGradient}
 */
export function styleFill(ctx, s, age, radius, shift = 0) {
  const from = Math.min(1, Math.max(0, corePosition(s, age) + shift));
  const to = Math.min(1, from + s.spread);
  if (to - from <= 1e-6 || radius <= 0) return toCss(sampleRamp(s.ramp, from));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  for (const p of rampBreakpoints(s.ramp, from, to)) {
    g.addColorStop((p - from) / (to - from), toCss(sampleRamp(s.ramp, p)));
  }
  return g;
}

/**
 * @typedef {object} StyledInstance
 * @property {Float64Array} [outline] flat [x, y, …] around (0, 0) — single-outline shapes
 * @property {import('./celshade.js').ShapePart[]} [parts] multi-part shapes (used instead of outline)
 * @property {number} radius          nominal size, effect px (shading offsets are fractions of it)
 * @property {number} age             0–1
 * @property {number} seed
 * @property {number} t               effect time
 * @property {number} [rotation=0]    radians (so the light stays fixed in the world)
 */

/**
 * Fill an outline with the element style (bands or gradient), ramp positions shifted by `shift`.
 * @param {CanvasRenderingContext2D} ctx @param {Style} s @param {StyledInstance} inst
 * @param {(ctx: CanvasRenderingContext2D, pts: Float64Array) => void} trace @param {number} shift
 * @param {{ from?: number, to?: number }} [bandRange] which cel bands to paint (bands mode only)
 */
function paintFill(ctx, s, inst, trace, shift, bandRange = {}) {
  const parts = partsOf(inst);
  if (s.bands >= 1) {
    const core = Math.min(1, Math.max(0, corePosition(s, inst.age) + shift));
    paintBands(
      ctx,
      s.ramp,
      parts,
      {
        bands: s.bands,
        core,
        edge: Math.min(1, core + s.spread),
        edgeNoise: s.bandNoise,
        snap: s.snapColors,
        seed: inst.seed,
        t: inst.t,
        ...bandRange,
      },
      trace,
      toCss,
    );
    return;
  }
  ctx.fillStyle = styleFill(ctx, s, inst.age, inst.radius, shift);
  ctx.beginPath();
  tracePartsPath(ctx, parts, trace);
  ctx.fill();
}

/** @param {StyledInstance} inst @returns {import('./celshade.js').ShapePart[]} */
const partsOf = (inst) =>
  inst.parts ?? [{ x: 0, y: 0, outline: /** @type {Float64Array} */ (inst.outline) }];

/**
 * Add every part's outline to the current path (one union when filled).
 * @param {CanvasRenderingContext2D} ctx @param {import('./celshade.js').ShapePart[]} parts
 * @param {(ctx: CanvasRenderingContext2D, pts: Float64Array) => void} trace
 */
function tracePartsPath(ctx, parts, trace) {
  for (const part of parts) {
    ctx.save();
    ctx.translate(part.x, part.y);
    trace(ctx, part.outline);
    ctx.restore();
  }
}

/**
 * Paint one instance: fill (bands or gradient) plus toon shading. NOTHING is clipped to the
 * silhouette [Raul]:
 * - Shadow: a darker copy of the shape (further along the ramp), drawn BEHIND the element and
 *   offset AWAY from the light, so it shows as a dark rim on the shadow side, beyond the edge.
 * - Element: drawn whole on top.
 * - Highlight: a smaller, hotter copy drawn on top, offset toward the light.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Style} s
 * @param {StyledInstance} inst
 * @param {(ctx: CanvasRenderingContext2D, pts: Float64Array) => void} trace adds the outline path
 * @param {import('./shading.js').Shade} [shade] omit for no shading
 */
export function paintStyled(ctx, s, inst, trace, shade) {
  const hasShadow = !!shade && shade.shadow > 0 && shade.shadowOffset > 0;
  const hasHighlight = !!shade && shade.highlight > 0;
  const L = shade ? lightVector(shade.light, inst.rotation ?? 0) : { x: 0, y: 0 };

  if (hasShadow) {
    const sh = /** @type {import('./shading.js').Shade} */ (shade);
    const d = sh.shadowOffset * inst.radius;
    ctx.save();
    ctx.translate(-L.x * d, -L.y * d);
    // Only the outer band can show behind the element, so that's all we paint.
    paintFill(ctx, s, inst, trace, sh.shadow, { from: 0, to: 0 });
    ctx.restore();
  }

  paintFill(ctx, s, inst, trace, 0);

  if (hasHighlight) {
    // One highlight per part (each bump of a puff catches the light).
    const sh = /** @type {import('./shading.js').Shade} */ (shade);
    const rgba = sampleRamp(s.ramp, Math.max(0, corePosition(s, inst.age) - sh.highlight));
    ctx.fillStyle = toCss(rgba);
    ctx.beginPath();
    for (const part of partsOf(inst)) {
      const d = sh.highlightOffset * (part.r ?? inst.radius);
      ctx.save();
      ctx.translate(part.x + L.x * d, part.y + L.y * d);
      ctx.scale(sh.highlightSize, sh.highlightSize);
      trace(ctx, part.outline);
      ctx.restore();
    }
    ctx.fill();
  }
}
