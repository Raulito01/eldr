// @ts-check
/**
 * Puff: a cartoon smoke/fire ball — a cluster of overlapping blobs around a big central one.
 * Returned as parts, so cel bands, shadow and highlight follow every bump.
 */

import { subSeed } from '../core/hash.js';
import { createRng } from '../core/prng.js';
import { blobPoints } from './blob.js';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Size of each bump relative to the puff radius (the central one is the biggest). */
const BUMP_SIZE = 0.62;
/** Noise detail on each bump's edge. */
const BUMP_FREQUENCY = 1.2;

/** Puff parameters (ids `puff.*`). Defaults are provisional [Raul]. */
export const PUFF_PARAMS = [
  {
    id: 'puff.radius',
    label: 'Radius',
    group: 'Shape',
    type: 'float',
    min: 4,
    max: 256,
    step: 1,
    default: 60,
    unit: 'px',
    randomize: { min: 45, max: 80 },
    tooltip: 'Overall size of the puff',
  },
  {
    id: 'puff.count',
    label: 'Bumps',
    group: 'Shape',
    type: 'int',
    min: 1,
    max: 16,
    default: 7,
    randomize: { min: 5, max: 10 },
    tooltip: 'How many blobs make up the puff',
  },
  {
    id: 'puff.spread',
    label: 'Spread',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.55,
    randomize: { min: 0.4, max: 0.7 },
    tooltip: 'How far the bumps sit from the centre',
  },
  {
    id: 'puff.sizeVariance',
    label: 'Size variance',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    randomize: { min: 0.2, max: 0.5 },
    tooltip: 'Random size difference between bumps',
  },
  {
    id: 'puff.noise',
    label: 'Edge noise',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 0.5,
    step: 0.01,
    default: 0.08,
    tooltip: 'Wobble on each bump’s edge',
  },
  {
    id: 'puff.wobble',
    label: 'Wobble',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 8,
    step: 0.05,
    default: 1,
    tooltip: 'How much the bump edges boil over time',
  },
];

/**
 * @typedef {object} PuffParams
 * @property {number} radius @property {number} count @property {number} spread
 * @property {number} sizeVariance @property {number} noise @property {number} wobble
 */

/** @param {Record<string, any>} v @returns {PuffParams} */
export const readPuffParams = (v) => ({
  radius: v['puff.radius'],
  count: v['puff.count'],
  spread: v['puff.spread'],
  sizeVariance: v['puff.sizeVariance'],
  noise: v['puff.noise'],
  wobble: v['puff.wobble'],
});

/**
 * The bumps of a puff: centres, radii and outlines.
 * @param {PuffParams} p @param {number} seed @param {number} t effect time
 * @returns {import('../render/celshade.js').ShapePart[]}
 */
export function puffParts(p, seed, t) {
  const rng = createRng(seed);
  const turn = rng.range(0, Math.PI * 2);
  const parts = [];
  for (let i = 0; i < p.count; i++) {
    let x = 0;
    let y = 0;
    let r = p.radius * BUMP_SIZE;
    if (i > 0) {
      // Spiral (golden angle) placement keeps bumps evenly spread; jitter keeps it organic.
      const a = turn + i * GOLDEN_ANGLE + rng.range(-0.35, 0.35);
      const dist =
        p.spread * p.radius * Math.sqrt(i / Math.max(1, p.count - 1)) * rng.range(0.8, 1.05);
      x = Math.cos(a) * dist;
      y = Math.sin(a) * dist;
      // Outer bumps are smaller, plus random variance.
      r *= (1 - p.sizeVariance * rng.next()) * (1 - 0.3 * (dist / Math.max(1, p.radius)));
    } else {
      rng.next(); // keep the sequence aligned for every bump
    }
    const outline = blobPoints(
      {
        radius: r,
        noise: p.noise,
        frequency: BUMP_FREQUENCY,
        lobes: 0,
        lobeDepth: 0,
        wobble: p.wobble,
      },
      subSeed(seed, 'bump', i),
      t,
    );
    parts.push({ x, y, r, outline });
  }
  // Draw the central bump last so it sits on top of the band unions' seams.
  return parts.reverse();
}
