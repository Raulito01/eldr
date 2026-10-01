// @ts-check
/**
 * Blob shape: a circle whose edge is pushed in and out by seeded noise and optional lobes.
 * Pure geometry (points) + a drawing helper. Resolution-independent: drawn as a smooth path.
 */

import { createNoise } from '../core/noise.js';
import { createRng } from '../core/prng.js';

/** Edge resolution: points around the outline. */
const SEGMENTS = 64;
/** The edge can't be pulled in further than this fraction of the radius. */
const MIN_RADIUS_FRACTION = 0.1;
/** Unit circle, computed once (same values every call → identical geometry every frame). */
const COS = Float64Array.from({ length: SEGMENTS }, (_, i) =>
  Math.cos((i / SEGMENTS) * Math.PI * 2),
);
const SIN = Float64Array.from({ length: SEGMENTS }, (_, i) =>
  Math.sin((i / SEGMENTS) * Math.PI * 2),
);

/**
 * @typedef {object} BlobParams
 * @property {number} radius     effect px
 * @property {number} noise      edge displacement, fraction of radius (0–1)
 * @property {number} frequency  noise features around the edge (higher = more, smaller bumps)
 * @property {number} lobes      number of regular bulges (0 = none)
 * @property {number} lobeDepth  bulge size, fraction of radius
 * @property {number} wobble     how far the noise travels over the effect's life (0 = frozen)
 */

/**
 * Outline points of a blob, as a flat [x0, y0, x1, y1, …] array around (0, 0).
 * @param {BlobParams} p
 * @param {number} seed integer — fixes this blob's noise and lobe orientation
 * @param {number} t normalized effect time 0–1 (only used when wobble > 0)
 * @returns {Float64Array}
 */
export function blobPoints(p, seed, t) {
  const noise = createNoise(seed);
  const lobePhase = createRng(seed).range(0, Math.PI * 2);
  const evolve = p.wobble * t;
  const out = new Float64Array(SEGMENTS * 2);
  for (let i = 0; i < SEGMENTS; i++) {
    const a = (i / SEGMENTS) * Math.PI * 2;
    const ca = COS[i];
    const sa = SIN[i];
    let r = 1;
    if (p.noise > 0) r += p.noise * noise.noise3D(ca * p.frequency, sa * p.frequency, evolve);
    if (p.lobes > 0 && p.lobeDepth > 0) r += p.lobeDepth * Math.cos(p.lobes * a + lobePhase);
    r = Math.max(MIN_RADIUS_FRACTION, r) * p.radius;
    out[i * 2] = ca * r;
    out[i * 2 + 1] = sa * r;
  }
  return out;
}

/** Blob parameters (schema entries, ids `blob.*`). Defaults are provisional [Raul]. */
export const BLOB_PARAMS = [
  {
    id: 'blob.radius',
    label: 'Radius',
    group: 'Shape',
    type: 'float',
    min: 2,
    max: 256,
    step: 1,
    default: 60,
    unit: 'px',
    randomize: { min: 40, max: 90 },
    tooltip: 'Base size of the blob',
  },
  {
    id: 'blob.noise',
    label: 'Edge noise',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.15,
    randomize: { min: 0.05, max: 0.35 },
    tooltip: 'How far the edge is pushed in and out',
  },
  {
    id: 'blob.frequency',
    label: 'Noise detail',
    group: 'Shape',
    type: 'float',
    min: 0.2,
    max: 6,
    step: 0.05,
    default: 1.5,
    randomize: { min: 0.8, max: 3 },
    tooltip: 'Higher = more, smaller bumps',
  },
  {
    id: 'blob.lobes',
    label: 'Lobes',
    group: 'Shape',
    type: 'int',
    min: 0,
    max: 12,
    default: 0,
    randomize: { min: 0, max: 6 },
    tooltip: 'Number of regular bulges (0 = none)',
  },
  {
    id: 'blob.lobeDepth',
    label: 'Lobe depth',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.1,
    tooltip: 'Size of the bulges',
  },
  {
    id: 'blob.wobble',
    label: 'Wobble',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 8,
    step: 0.05,
    default: 1,
    randomize: { min: 0, max: 3 },
    tooltip: "How much the edge boils over the effect's life (0 = frozen)",
  },
];

/**
 * Read blob parameters from a layer's params object.
 * @param {Record<string, any>} v
 * @returns {BlobParams}
 */
export const readBlobParams = (v) => ({
  radius: v['blob.radius'],
  noise: v['blob.noise'],
  frequency: v['blob.frequency'],
  lobes: v['blob.lobes'],
  lobeDepth: v['blob.lobeDepth'],
  wobble: v['blob.wobble'],
});

/**
 * Add a smooth closed path through outline points to the context (quadratic curves through
 * the midpoints, so there are no corners).
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float64Array} pts flat [x, y, …]
 */
export function traceSmoothClosed(ctx, pts) {
  const n = pts.length / 2;
  const mid = (/** @type {number} */ i, /** @type {number} */ j) => [
    (pts[i * 2] + pts[j * 2]) / 2,
    (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2,
  ];
  const [sx, sy] = mid(n - 1, 0);
  ctx.moveTo(sx, sy);
  for (let i = 0; i < n; i++) {
    const [mx, my] = mid(i, (i + 1) % n);
    ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx, my);
  }
  ctx.closePath();
}
