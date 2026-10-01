// @ts-check
/** Debris: small irregular polygon chunks with hard corners. */

import { createRng } from '../core/prng.js';

/** Debris parameters (ids `debris.*`). Defaults are provisional [Raul]. */
export const DEBRIS_PARAMS = [
  {
    id: 'debris.size',
    label: 'Size',
    group: 'Shape',
    type: 'float',
    min: 1,
    max: 128,
    step: 0.5,
    default: 12,
    unit: 'px',
    randomize: { min: 7, max: 18 },
    tooltip: 'Radius of a chunk',
  },
  {
    id: 'debris.vertices',
    label: 'Corners',
    group: 'Shape',
    type: 'int',
    min: 3,
    max: 18,
    default: 5,
    randomize: { min: 3, max: 7 },
    tooltip: 'Number of corners',
  },
  {
    id: 'debris.irregularity',
    label: 'Irregularity',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    randomize: { min: 0.3, max: 0.8 },
    tooltip: '0 = regular polygon · 1 = jagged chunk',
  },
  {
    id: 'debris.spin',
    label: 'Spin',
    group: 'Shape',
    type: 'float',
    min: -2880,
    max: 2880,
    step: 5,
    default: 360,
    unit: '°',
    randomize: { min: -720, max: 720 },
    tooltip: 'Rotation over the chunk’s life',
  },
];

/** @param {Record<string, any>} v */
export const readDebrisParams = (v) => ({
  size: v['debris.size'],
  vertices: v['debris.vertices'],
  irregularity: v['debris.irregularity'],
  spin: v['debris.spin'],
});

/**
 * Corners of one chunk around (0, 0); the seed makes every chunk different.
 * @param {{ size: number, vertices: number, irregularity: number }} p @param {number} seed
 * @returns {Float64Array}
 */
export function debrisPoints(p, seed) {
  const rng = createRng(seed);
  const n = p.vertices;
  const step = (Math.PI * 2) / n;
  const turn = rng.range(0, Math.PI * 2);
  const out = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = turn + i * step + rng.range(-0.45, 0.45) * step * p.irregularity;
    const r = p.size * (1 - p.irregularity * 0.55 * rng.next());
    out[i * 2] = Math.cos(a) * r;
    out[i * 2 + 1] = Math.sin(a) * r;
  }
  return out;
}
