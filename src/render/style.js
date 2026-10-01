// @ts-check
/**
 * Element style (brief §3.3), shared by every shape: colour comes from a ramp. Each instance
 * sits at a "ramp position" that moves with its age (ramp over life), and its core sits
 * earlier on the ramp (hotter) than its edge (core → edge spread).
 *
 * Cel bands (2.2): with `bands` ≥ 1 the element is painted as hard bands instead of a smooth
 * gradient. Grows in Phase 2: toon shading (2.3), outline (2.4).
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { paintBands } from './celshade.js';
import { rampBreakpoints, sampleRamp } from './ramp.js';

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
 * @returns {string | CanvasGradient}
 */
export function styleFill(ctx, s, age, radius) {
  const from = corePosition(s, age);
  const to = Math.min(1, from + s.spread);
  if (to - from <= 1e-6 || radius <= 0) return toCss(sampleRamp(s.ramp, from));
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  for (const p of rampBreakpoints(s.ramp, from, to)) {
    g.addColorStop((p - from) / (to - from), toCss(sampleRamp(s.ramp, p)));
  }
  return g;
}

/**
 * Paint one instance's outline with its style: hard cel bands, or a smooth core→edge gradient.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Style} s
 * @param {{ outline: Float64Array, radius: number, age: number, seed: number, t: number }} inst
 * @param {(ctx: CanvasRenderingContext2D, pts: Float64Array) => void} trace adds the outline path
 */
export function paintStyled(ctx, s, inst, trace) {
  if (s.bands >= 1) {
    const core = corePosition(s, inst.age);
    paintBands(
      ctx,
      s.ramp,
      inst.outline,
      {
        bands: s.bands,
        core,
        edge: Math.min(1, core + s.spread),
        edgeNoise: s.bandNoise,
        snap: s.snapColors,
        seed: inst.seed,
        t: inst.t,
      },
      trace,
      toCss,
    );
    return;
  }
  ctx.fillStyle = styleFill(ctx, s, inst.age, inst.radius);
  ctx.beginPath();
  trace(ctx, inst.outline);
  ctx.fill();
}
