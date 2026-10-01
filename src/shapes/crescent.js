// @ts-check
/**
 * Crescent: a tapered swoosh along a circular arc, sharp at both tips (energy-orb swooshes,
 * slash arcs, hooked flame tongues). Built as a STRIP: a centreline (arc, optionally curling
 * into a hook at the head) with a half-width profile. Cel bands run across the thickness like
 * the ring's, and can be pushed toward one edge ("hot edge").
 *
 * Geometry convention: the head is the end the crescent travels toward. Angles θ are standard
 * screen angles (0 = +x, increasing clockwise because y points down).
 * - anchor 'circle': the arc is centred on (0, 0) — a slash curving around the pivot.
 * - anchor 'arc':    the arc's midpoint sits at (0, 0) with the head toward +x — for bursts
 *   (align to motion points it head-first).
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { smoothstep } from '../core/math.js';
import { createNoise } from '../core/noise.js';
import { bandPositions, nearestStopColor } from '../render/celshade.js';
import { sampleRamp } from '../render/ramp.js';
import { lightVector } from '../render/shading.js';
import { corePosition } from '../render/style.js';

/** Samples along the full length. */
export const CRESCENT_SAMPLES = 72;
/** Fraction of the length (from the head) that curls when hooked. */
const HOOK_LENGTH = 0.4;
/** How far a full hook pulls the head toward the arc centre (fraction of the radius). */
const HOOK_DEPTH = 0.55;
/** Edge-wobble detail along the length. */
const WOBBLE_FREQUENCY = 3;
/** While drawing on, the swoosh reaches full thickness once this much of it is revealed. */
const REVEAL_FULL_WIDTH = 0.5;
/** Step for the numerical tangent (fraction of the length). */
const TANGENT_STEP = 1e-3;

/** Crescent parameters (ids `crescent.*`). Defaults are a first pass [Raul]. */
export const CRESCENT_PARAMS = [
  {
    id: 'crescent.radius',
    label: 'Radius',
    group: 'Shape',
    type: 'float',
    min: 4,
    max: 1024,
    step: 1,
    default: 90,
    unit: 'px',
    randomize: { min: 70, max: 110 },
    tooltip: 'Radius of the arc the crescent bends along (orbit "follow path": the orbit radius)',
  },
  {
    id: 'crescent.sweep',
    label: 'Sweep',
    group: 'Shape',
    type: 'float',
    min: 5,
    max: 360,
    step: 1,
    default: 140,
    unit: '°',
    randomize: { min: 110, max: 170 },
    tooltip: 'How far around the circle the crescent reaches',
  },
  {
    id: 'crescent.thickness',
    label: 'Thickness',
    group: 'Shape',
    type: 'float',
    min: 1,
    max: 256,
    step: 0.5,
    default: 28,
    unit: 'px',
    randomize: { min: 20, max: 36 },
    tooltip: 'Width at the widest point',
  },
  {
    id: 'crescent.thicknessOverLife',
    label: 'Thickness over life',
    group: 'Shape',
    type: 'curve',
    yMin: 0,
    yMax: 2,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Thin the swoosh out as it ages',
  },
  {
    id: 'crescent.balance',
    label: 'Head / tail',
    group: 'Shape',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0.4,
    randomize: { min: 0.2, max: 0.6 },
    tooltip: '0 = even lune · + = fat head, long thin tail (swoosh) · − = the other way round',
  },
  {
    id: 'crescent.sharpness',
    label: 'Tip sharpness',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
    tooltip: '0 = rounded ends · 1 = needle-sharp tips',
  },
  {
    id: 'crescent.hook',
    label: 'Hook',
    group: 'Shape',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    randomize: { min: 0, max: 0.4 },
    tooltip: 'Curl the head: + inward (toward the arc centre) · − outward',
  },
  {
    id: 'crescent.hotEdge',
    label: 'Hot edge',
    group: 'Shape',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'Where the hot inner bands sit: 0 = centreline · + = outer edge · − = inner edge',
  },
  {
    id: 'crescent.wobble',
    label: 'Edge wobble',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.1,
    randomize: { min: 0.05, max: 0.2 },
    tooltip: 'Hand-drawn unevenness of the width',
  },
  {
    id: 'crescent.wobbleSpeed',
    label: 'Wobble speed',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 32,
    step: 0.1,
    default: 2,
    tooltip: 'How fast the wobble boils over the effect',
  },
  {
    id: 'crescent.reverse',
    label: 'Reverse direction',
    group: 'Shape',
    type: 'bool',
    default: false,
    tooltip: 'Flip which way the head points (clockwise ↔ counter-clockwise)',
  },
  {
    id: 'crescent.reveal',
    label: 'Reveal over life',
    group: 'Shape',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Draw the swoosh on from tail to head (slash sweep): 0 = nothing, 1 = full sweep',
  },
];

/**
 * @typedef {object} CrescentParams
 * @property {number} radius @property {number} sweep degrees @property {number} thickness px
 * @property {import('../core/curve.js').CurvePoint[]} thicknessOverLife
 * @property {number} balance @property {number} sharpness @property {number} hook
 * @property {number} hotEdge @property {number} wobble @property {number} wobbleSpeed
 * @property {boolean} reverse
 * @property {import('../core/curve.js').CurvePoint[]} reveal
 */

/** @param {Record<string, any>} v @returns {CrescentParams} */
export const readCrescentParams = (v) => ({
  radius: v['crescent.radius'],
  sweep: v['crescent.sweep'],
  thickness: v['crescent.thickness'],
  thicknessOverLife: v['crescent.thicknessOverLife'],
  balance: v['crescent.balance'],
  sharpness: v['crescent.sharpness'],
  hook: v['crescent.hook'],
  hotEdge: v['crescent.hotEdge'],
  wobble: v['crescent.wobble'],
  wobbleSpeed: v['crescent.wobbleSpeed'],
  reverse: v['crescent.reverse'],
  reveal: v['crescent.reveal'],
});

/**
 * Width profile 0–1 along the length (0 = tail tip, 1 = head tip). Zero at both tips.
 * @param {number} u @param {number} balance −1–1 @param {number} sharpness 0–1
 */
export function crescentProfile(u, balance, sharpness) {
  if (u <= 0 || u >= 1) return 0;
  const peak = 0.5 + 0.4 * balance; // the fat end is where the peak sits
  const base = 0.35 + 1.4 * sharpness; // exponent: < 1 rounded, > 1 needle tips
  const tailPow = base * (1 + 1.5 * Math.max(0, balance));
  const headPow = base * (1 + 1.5 * Math.max(0, -balance));
  if (u < peak) return Math.sin((Math.PI / 2) * (u / peak)) ** tailPow;
  return Math.sin((Math.PI / 2) * ((1 - u) / (1 - peak))) ** headPow;
}

/**
 * @typedef {object} StripSample  a point on the centreline, in the crescent's own plane
 * @property {number} x @property {number} y   centreline point
 * @property {number} nx @property {number} ny  unit normal, pointing away from the arc centre
 * @property {number} hw  half-width (px)
 */

/**
 * @typedef {object} StripOptions
 * @property {number} seed
 * @property {number} t           effect time (wobble boil)
 * @property {number} age         instance life 0–1 (reveal, thickness over life)
 * @property {number} [mid=-π/2]  angle of the arc's middle (θ, radians); default: top
 * @property {number} [radius]    overrides p.radius (orbit "follow path")
 * @property {number} [dir]       +1 head clockwise, −1 counter-clockwise (before `reverse`)
 * @property {'circle'|'arc'} [anchor='circle']
 * @property {number} [widthScale=1]
 * @property {(x: number, y: number) => number} [widthAt]  extra per-point width factor (perspective)
 */

/**
 * The crescent as a sampler: v ∈ [0, 1] runs tail → head over the REVEALED part.
 * @param {CrescentParams} p @param {StripOptions} o
 * @returns {{ sample: (v: number) => StripSample, revealed: number } | null}  null when nothing shows
 */
export function crescentStrip(p, o) {
  const revealed = Math.min(1, Math.max(0, evalCurve(p.reveal, o.age)));
  const thick =
    (p.thickness / 2) *
    Math.max(0, evalCurve(p.thicknessOverLife, o.age)) *
    (o.widthScale ?? 1) *
    Math.min(1, revealed / REVEAL_FULL_WIDTH); // a just-starting swoosh is thin, not a petal
  if (revealed <= 1e-4 || thick <= 0) return null;
  const R = o.radius ?? p.radius;
  const mid = o.mid ?? -Math.PI / 2;
  const dir = (o.dir ?? 1) * (p.reverse ? -1 : 1);
  const sweep = (p.sweep * Math.PI) / 180;
  const tail = mid - (dir * sweep) / 2;
  const span = dir * sweep * revealed;
  const noise = p.wobble > 0 ? createNoise(o.seed) : null;
  const evolve = p.wobbleSpeed * o.t;
  const shiftX = o.anchor === 'arc' ? -Math.cos(mid) * R : 0;
  const shiftY = o.anchor === 'arc' ? -Math.sin(mid) * R : 0;

  /** Centreline point at v. @param {number} v */
  const centre = (v) => {
    const a = tail + span * v;
    const curl = smoothstep(1 - HOOK_LENGTH, 1, v) ** 2;
    const r = R * (1 - HOOK_DEPTH * p.hook * curl);
    return [Math.cos(a) * r + shiftX, Math.sin(a) * r + shiftY, a];
  };

  return {
    revealed,
    sample(v) {
      const [x, y, a] = centre(v);
      const [x0, y0] = centre(Math.max(0, v - TANGENT_STEP));
      const [x1, y1] = centre(Math.min(1, v + TANGENT_STEP));
      const tx = x1 - x0;
      const ty = y1 - y0;
      const tl = Math.hypot(tx, ty) || 1;
      let nx = -ty / tl;
      let ny = tx / tl;
      if (nx * Math.cos(a) + ny * Math.sin(a) < 0) {
        nx = -nx;
        ny = -ny;
      }
      let hw = thick * crescentProfile(v, p.balance, p.sharpness);
      if (noise) hw *= Math.max(0, 1 + p.wobble * noise.noise2D(v * WOBBLE_FREQUENCY, evolve));
      if (o.widthAt) hw *= Math.max(0, o.widthAt(x, y));
      return { x, y, nx, ny, hw };
    },
  };
}

/** Evenly spaced v values over [v0, v1] with at least 2 points. @param {number} v0 @param {number} v1 */
export function stripRange(v0, v1) {
  const n = Math.max(2, Math.ceil(CRESCENT_SAMPLES * Math.abs(v1 - v0)) + 1);
  return Array.from({ length: n }, (_, i) => v0 + ((v1 - v0) * i) / (n - 1));
}

/**
 * Outline polygon of one band of the strip: edges at centre + n·hw·(offset·(1−f) ± f).
 * @param {(v: number) => StripSample} sample @param {number[]} vs
 * @param {number} f band width fraction (1 = full) @param {number} offset hot edge −1–1
 * @param {(x: number, y: number) => [number, number]} [project]
 * @returns {Float64Array}
 */
export function stripOutline(sample, vs, f, offset, project) {
  const n = vs.length;
  const out = new Float64Array(n * 4);
  const c = offset * (1 - f);
  for (let i = 0; i < n; i++) {
    const s = sample(vs[i]);
    const a = s.hw * (c + f);
    const b = s.hw * (c - f);
    let p = [s.x + s.nx * a, s.y + s.ny * a];
    let q = [s.x + s.nx * b, s.y + s.ny * b];
    if (project) {
      p = project(p[0], p[1]);
      q = project(q[0], q[1]);
    }
    out[i * 2] = p[0];
    out[i * 2 + 1] = p[1];
    const j = 2 * n - 1 - i; // inner edge runs back from head to tail
    out[j * 2] = q[0];
    out[j * 2 + 1] = q[1];
  }
  return out;
}

/** @param {CanvasRenderingContext2D} ctx @param {Float64Array} pts */
function tracePoly(ctx, pts) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/**
 * Paint a styled crescent: optional shadow behind (offset away from the light, D-032), then cel
 * bands across the thickness (or one flat colour when bands = 0). Nothing is clipped.
 * @param {CanvasRenderingContext2D} ctx
 * @param {CrescentParams} p
 * @param {import('../render/style.js').Style} style
 * @param {import('../render/shading.js').Shade} shade
 * @param {{ age: number, seed: number, t: number, rotation: number }} inst
 * @param {Omit<StripOptions, 'seed'|'t'|'age'> & {
 *   ranges?: [number, number][],
 *   project?: (x: number, y: number) => [number, number],
 * }} [opts] ranges: which parts (v intervals) to draw — orbit front/back halves
 */
export function paintCrescent(ctx, p, style, shade, inst, opts = {}) {
  const strip = crescentStrip(p, { ...opts, seed: inst.seed, t: inst.t, age: inst.age });
  if (!strip) return;
  const ranges = (opts.ranges ?? [[0, 1]]).map(([a, b]) => stripRange(a, b));
  if (!ranges.length) return;
  const core = corePosition(style, inst.age);
  const color = (/** @type {number} */ pos) =>
    toCss(style.snapColors ? nearestStopColor(style.ramp, pos) : sampleRamp(style.ramp, pos));
  const fillBand = (/** @type {number} */ f, /** @type {number} */ offset) => {
    ctx.beginPath();
    for (const vs of ranges)
      tracePoly(ctx, stripOutline(strip.sample, vs, f, offset, opts.project));
    ctx.fill();
  };

  if (shade.shadow > 0 && shade.shadowOffset > 0) {
    const L = lightVector(shade.light, inst.rotation);
    const d = shade.shadowOffset * p.thickness;
    ctx.save();
    ctx.translate(-L.x * d, -L.y * d);
    ctx.fillStyle = color(Math.min(1, core + style.spread + shade.shadow));
    fillBand(1, 0);
    ctx.restore();
  }

  const positions =
    style.bands >= 1
      ? bandPositions(Math.max(1, style.bands), core, Math.min(1, core + style.spread))
      : [core];
  positions.forEach((pos, i) => {
    ctx.fillStyle = color(pos);
    fillBand(1 - i / positions.length, p.hotEdge);
  });
}
