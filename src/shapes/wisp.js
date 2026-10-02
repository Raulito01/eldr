// @ts-check
/**
 * Smoke wisp (Fire & Smoke family, D-081): a thin ribbon of smoke / steam rising from its base,
 * swaying in an S that travels up the ribbon, tapering at both ends — for steam, incense, a
 * snuffed candle, ghostly trails. An outline for the shared cel painter; time-based sway loops
 * seamlessly (whole cycles per loop).
 */

import { loopRate } from '../core/loopContext.js';
import { createRng } from '../core/prng.js';

const G = 'Shape';
const N = 28;

/** Wisp parameters (ids `wisp.*`). Defaults are provisional [Raul]. */
export const WISP_PARAMS = [
  {
    id: 'wisp.length',
    label: 'Length',
    group: G,
    type: 'float',
    min: 4,
    max: 1024,
    step: 1,
    default: 160,
    unit: 'px',
  },
  {
    id: 'wisp.width',
    label: 'Width',
    group: G,
    type: 'float',
    min: 1,
    max: 256,
    step: 0.5,
    default: 16,
    unit: 'px',
  },
  {
    id: 'wisp.sway',
    label: 'Sway',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.25,
    tooltip: 'Side-to-side swing (× length), growing toward the top',
  },
  {
    id: 'wisp.waves',
    label: 'Waves',
    group: G,
    type: 'float',
    min: 0.25,
    max: 6,
    step: 0.05,
    default: 1.5,
    tooltip: 'S-bends along the ribbon',
  },
  {
    id: 'wisp.speed',
    label: 'Sway speed',
    group: G,
    type: 'float',
    min: 0,
    max: 8,
    step: 0.05,
    default: 1,
    tooltip: 'Waves travelling up per second (loops: rounded to whole cycles)',
  },
  {
    id: 'wisp.lean',
    label: 'Lean',
    group: G,
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0.1,
    tooltip: 'Drift to one side toward the top (wind)',
  },
  {
    id: 'wisp.taper',
    label: 'Taper',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
    tooltip: 'Thinner at the top',
  },
];

/** @param {Record<string, any>} v */
export const readWispParams = (v) => ({
  length: v['wisp.length'],
  width: v['wisp.width'],
  sway: v['wisp.sway'],
  waves: v['wisp.waves'],
  speed: v['wisp.speed'],
  lean: v['wisp.lean'],
  taper: v['wisp.taper'],
});

/**
 * Ribbon outline around its base at (0, 0), rising up (−y). Flat [x0, y0, …].
 * @param {ReturnType<typeof readWispParams>} p @param {number} seed @param {number} seconds
 */
export function wispPoints(p, seed, seconds) {
  const rng = createRng(seed);
  const phase0 = rng.next();
  const dir = rng.sign();
  const ph = 2 * Math.PI * (phase0 + loopRate(p.speed) * seconds);
  /** @type {[number, number, number][]} centre x, y, half width */
  const c = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const y = -u * p.length;
    const x =
      dir * p.sway * p.length * u * Math.sin(2 * Math.PI * p.waves * u - ph) +
      p.lean * p.length * u * u * 0.5;
    const w =
      (p.width / 2) * Math.sin(Math.PI * Math.min(1, u * 1.15 + 0.02)) ** 0.6 * (1 - p.taper * u);
    c.push([x, y, Math.max(0.3, w)]);
  }
  /** @type {number[]} */
  const left = [];
  /** @type {number[]} */
  const right = [];
  for (let i = 0; i <= N; i++) {
    const a = c[Math.max(0, i - 1)];
    const b = c[Math.min(N, i + 1)];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    const [x, y, w] = c[i];
    left.push(x + nx * w, y + ny * w);
    right.push(x - nx * w, y - ny * w);
  }
  const out = [...left];
  for (let i = N; i >= 0; i--) out.push(right[i * 2], right[i * 2 + 1]);
  return Float64Array.from(out);
}
