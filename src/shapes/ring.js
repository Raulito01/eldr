// @ts-check
/**
 * Ring: a shockwave annulus, optionally broken into arcs (with pointed ends) and distorted by
 * noise. Its cel bands run ACROSS the ring's thickness (hot centreline, cooler edges), so the
 * ring has its own painter instead of the shrink-toward-centre bands other shapes use.
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { loopedNoise } from '../core/loopContext.js';
import { createNoise } from '../core/noise.js';
import { createRng } from '../core/prng.js';
import { bandPositions, nearestStopColor } from '../render/celshade.js';
import { sampleRamp } from '../render/ramp.js';
import { lightVector } from '../render/shading.js';
import { corePosition } from '../render/style.js';

/** Outline points per full turn. */
const POINTS_PER_TURN = 96;
/** Fraction of each arc's length over which its ends taper to a point. */
const END_TAPER = 0.12;
/** Noise detail around the ring. */
const DISTORT_FREQUENCY = 1.6;

/** Ring parameters (ids `ring.*`). Defaults are provisional [Raul]. */
export const RING_PARAMS = [
  {
    id: 'ring.radius',
    label: 'Radius',
    group: 'Shape',
    type: 'float',
    min: 4,
    max: 512,
    step: 1,
    default: 80,
    unit: 'px',
    randomize: { min: 60, max: 100 },
    tooltip: 'Radius of the ring centreline',
  },
  {
    id: 'ring.thickness',
    label: 'Thickness',
    group: 'Shape',
    type: 'float',
    min: 0.02,
    max: 2,
    step: 0.01,
    default: 0.2,
    randomize: { min: 0.12, max: 0.3 },
    tooltip: 'Ring width as a fraction of its radius',
  },
  {
    id: 'ring.thicknessOverLife',
    label: 'Thickness over life',
    group: 'Shape',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 0.2 },
    ],
    tooltip: 'The ring thins out as it expands',
  },
  {
    id: 'ring.breaks',
    label: 'Breaks',
    group: 'Shape',
    type: 'int',
    min: 0,
    max: 24,
    default: 0,
    randomize: { min: 0, max: 6 },
    tooltip: '0 = closed ring · N = broken into N arcs',
  },
  {
    id: 'ring.gap',
    label: 'Gap size',
    group: 'Shape',
    type: 'float',
    min: 0.05,
    max: 0.9,
    step: 0.01,
    default: 0.3,
    tooltip: 'Size of the gaps between arcs',
  },
  {
    id: 'ring.distortion',
    label: 'Distortion',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.06,
    randomize: { min: 0.02, max: 0.15 },
    tooltip: 'Noise pushing the ring in and out',
  },
  {
    id: 'ring.wobble',
    label: 'Wobble',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 16,
    step: 0.05,
    default: 1,
    tooltip: 'How much the distortion moves over time',
  },
];

/**
 * @typedef {object} RingParams
 * @property {number} radius @property {number} thickness
 * @property {import('../core/curve.js').CurvePoint[]} thicknessOverLife
 * @property {number} breaks @property {number} gap @property {number} distortion @property {number} wobble
 */

/** @param {Record<string, any>} v @returns {RingParams} */
export const readRingParams = (v) => ({
  radius: v['ring.radius'],
  thickness: v['ring.thickness'],
  thicknessOverLife: v['ring.thicknessOverLife'],
  breaks: v['ring.breaks'],
  gap: v['ring.gap'],
  distortion: v['ring.distortion'],
  wobble: v['ring.wobble'],
});

/**
 * Arcs of the ring as [start, end] angles in radians. A closed ring is one arc marked `full`.
 * @param {RingParams} p @param {number} seed
 * @returns {{ a0: number, a1: number, full: boolean }[]}
 */
export function ringArcs(p, seed) {
  if (p.breaks <= 0) return [{ a0: 0, a1: Math.PI * 2, full: true }];
  const rng = createRng(seed);
  const turn = rng.range(0, Math.PI * 2);
  const slot = (Math.PI * 2) / p.breaks;
  const arcs = [];
  for (let i = 0; i < p.breaks; i++) {
    const gap = slot * p.gap * rng.range(0.7, 1.3);
    const start = turn + i * slot + rng.range(-0.1, 0.1) * slot;
    arcs.push({ a0: start, a1: start + Math.max(slot * 0.1, slot - gap), full: false });
  }
  return arcs;
}

/**
 * Add the ring (or a thinner band of it) to the current path.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ a0: number, a1: number, full: boolean }[]} arcs
 * @param {(a: number) => number} centre radius of the centreline at angle a
 * @param {number} halfWidth half thickness, effect px
 */
function traceRing(ctx, arcs, centre, halfWidth) {
  for (const arc of arcs) {
    const span = arc.a1 - arc.a0;
    const n = Math.max(8, Math.ceil((POINTS_PER_TURN * span) / (Math.PI * 2)));
    /** Half width at sample i, tapering to a point at the ends of broken arcs. @param {number} i */
    const hw = (i) => {
      if (arc.full) return halfWidth;
      const u = i / n;
      const e = Math.min(u, 1 - u) / END_TAPER;
      return halfWidth * Math.min(1, Math.sqrt(Math.max(0, e)));
    };
    const pt = (/** @type {number} */ i, /** @type {number} */ side) => {
      const a = arc.a0 + (span * i) / n;
      const r = Math.max(0, centre(a) + side * hw(i));
      return [Math.cos(a) * r, Math.sin(a) * r];
    };
    if (arc.full) {
      // Two sub-paths with opposite winding: outer edge forward, inner edge backward → a hole.
      for (let i = 0; i < n; i++) {
        const [x, y] = pt(i, 1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      for (let i = n; i > 0; i--) {
        const [x, y] = pt(i, -1);
        if (i === n) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    } else {
      for (let i = 0; i <= n; i++) {
        const [x, y] = pt(i, 1);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = n; i >= 0; i--) {
        const [x, y] = pt(i, -1);
        ctx.lineTo(x, y);
      }
      ctx.closePath();
    }
  }
}

/**
 * Paint a styled ring: optional shadow behind (offset away from the light), then cel bands
 * across the thickness (or one flat colour when bands = 0). Nothing is clipped (D-032).
 * @param {CanvasRenderingContext2D} ctx
 * @param {RingParams} p
 * @param {import('../render/style.js').Style} style
 * @param {import('../render/shading.js').Shade} shade
 * @param {{ age: number, seed: number, t: number, rotation: number }} inst
 */
export function paintRing(ctx, p, style, shade, inst) {
  const noise = createNoise(inst.seed);
  const centre = (/** @type {number} */ a) =>
    p.radius *
    (1 +
      (p.distortion > 0
        ? p.distortion *
          loopedNoise(
            (z) =>
              noise.noise3D(Math.cos(a) * DISTORT_FREQUENCY, Math.sin(a) * DISTORT_FREQUENCY, z),
            p.wobble,
            inst.t,
          )
        : 0));
  const half = (p.radius * p.thickness * Math.max(0, evalCurve(p.thicknessOverLife, inst.age))) / 2;
  if (half <= 0) return;
  const arcs = ringArcs(p, inst.seed);
  const core = corePosition(style, inst.age);
  const color = (/** @type {number} */ pos) =>
    toCss(style.snapColors ? nearestStopColor(style.ramp, pos) : sampleRamp(style.ramp, pos));

  if (shade.shadow > 0 && shade.shadowOffset > 0) {
    const L = lightVector(shade.light, inst.rotation);
    const d = shade.shadowOffset * half * 2;
    const pos = Math.min(1, core + style.spread + shade.shadow);
    ctx.save();
    ctx.translate(-L.x * d, -L.y * d);
    ctx.fillStyle = color(pos);
    ctx.beginPath();
    traceRing(ctx, arcs, centre, half);
    ctx.fill();
    ctx.restore();
  }

  const bands = Math.max(1, style.bands);
  const positions =
    style.bands >= 1 ? bandPositions(bands, core, Math.min(1, core + style.spread)) : [core];
  positions.forEach((pos, i) => {
    ctx.fillStyle = color(pos);
    ctx.beginPath();
    traceRing(ctx, arcs, centre, half * (1 - i / positions.length));
    ctx.fill();
  });
}
