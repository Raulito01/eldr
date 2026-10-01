// @ts-check
/**
 * Dissolve (step 3.4c, D-043): a layer breaks apart over time instead of fading — into curly
 * filaments (the dome burn-down in Raul's references), angular shards (the slash breakup) or
 * soft holes. Runs on the finished layer pixels, before the outline, so the outline traces the
 * pieces.
 *
 * Every pixel gets a "survival" value v (0–1) from a seeded pattern; it stays while
 * v > amount(t). Edges are 1-px anti-aliased using the pattern's gradient, and an optional
 * burn edge colours a band of fixed pixel width along every dissolving edge.
 */

import { parseHex } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { hash32 } from '../core/hash.js';
import { createNoise } from '../core/noise.js';
import { alphaBounds } from './outline.js';

/** Curls: how strongly the ridge pattern is warped (more = curlier). */
const CURL_WARP = 0.9;
/** Shards: share of a cell's survival decided by its random value (rest = distance to edge). */
const SHARD_RANDOM = 0.35;
/** Noise objects per seed (pure cache). */
const NOISE_CACHE_MAX = 32;
const noiseCache = new Map();

/** Dissolve parameters (ids `dissolve.*`). Off by default. Defaults are a first pass [Raul]. */
export const DISSOLVE_PARAMS = [
  {
    id: 'dissolve.mode',
    label: 'Dissolve',
    group: 'Dissolve',
    type: 'enum',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'curls', label: 'Curls (burns into thin swirls)' },
      { value: 'shards', label: 'Shards (breaks into sharp pieces)' },
      { value: 'holes', label: 'Holes (soft, blotchy)' },
    ],
    default: 'off',
    tooltip: 'How the layer breaks apart over time',
  },
  {
    id: 'dissolve.amount',
    label: 'Dissolve over time',
    group: 'Dissolve',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0 },
      { x: 1, y: 1 },
    ],
    tooltip: 'How much is gone across the effect (0 = whole, 1 = gone)',
  },
  {
    id: 'dissolve.size',
    label: 'Piece size',
    group: 'Dissolve',
    type: 'float',
    min: 2,
    max: 512,
    step: 1,
    default: 40,
    unit: 'px',
    tooltip: 'Size of the curls / shards / holes',
  },
  {
    id: 'dissolve.flow',
    label: 'Boil',
    group: 'Dissolve',
    type: 'float',
    min: 0,
    max: 8,
    step: 0.05,
    default: 0.5,
    tooltip: 'How fast the pattern changes while it dissolves (per second)',
  },
  {
    id: 'dissolve.edgePx',
    label: 'Burn edge',
    group: 'Dissolve',
    type: 'float',
    min: 0,
    max: 64,
    step: 0.5,
    default: 0,
    unit: 'px',
    tooltip: 'Coloured rim along dissolving edges (0 = none)',
  },
  {
    id: 'dissolve.edgeColor',
    label: 'Burn edge colour',
    group: 'Dissolve',
    type: 'color',
    default: '#fff4c2',
    tooltip: 'Colour of the burn edge (alpha = strength)',
  },
];

/** @param {number} seed */
function noiseFor(seed) {
  let n = noiseCache.get(seed);
  if (!n) {
    n = createNoise(hash32(seed, 0xd15));
    if (noiseCache.size >= NOISE_CACHE_MAX) noiseCache.delete(noiseCache.keys().next().value);
    noiseCache.set(seed, n);
  }
  return n;
}

/** Deterministic 0–1 from two ints and a seed. @param {number} i @param {number} j @param {number} seed @param {number} k */
const cellRand = (i, j, seed, k) => hash32(seed, i, j, k) / 4294967296;

/**
 * Survival value of one point, 0–1 (higher = stays longer).
 * @param {'curls'|'shards'|'holes'} mode
 * @param {import('../core/noise.js').Noise} N
 * @param {number} x pattern coordinates (1 unit = one piece)
 * @param {number} y
 * @param {number} z time coordinate
 * @param {number} seed
 */
export function survival(mode, N, x, y, z, seed) {
  if (mode === 'holes') {
    const n = N.noise3D(x, y, z) * 0.7 + N.noise3D(x * 2.1, y * 2.1, z) * 0.3;
    return n * 0.5 + 0.5;
  }
  if (mode === 'curls') {
    // Warped ridges: 1 on the ridge lines → only thin, curly filaments survive at the end.
    const wx = x + N.noise3D(x * 0.5 + 5, y * 0.5, z) * CURL_WARP;
    const wy = y + N.noise3D(x * 0.5, y * 0.5 + 9, z) * CURL_WARP;
    return 1 - Math.abs(N.noise3D(wx, wy, z));
  }
  // Shards: Voronoi cells; survival = distance to the cell's edge (F2 − F1) + per-cell chance.
  // Shrinking toward the cell centre keeps straight, angular edges.
  const ci = Math.floor(x);
  const cj = Math.floor(y);
  let f1 = Infinity;
  let f2 = Infinity;
  let best = 0;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const px = i + cellRand(i, j, seed, 1);
      const py = j + cellRand(i, j, seed, 2);
      const d = Math.hypot(x - px, y - py);
      if (d < f1) {
        f2 = f1;
        f1 = d;
        best = cellRand(i, j, seed, 3);
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  const edge = Math.min(1, (f2 - f1) * 1.6);
  return edge * (1 - SHARD_RANDOM) + best * SHARD_RANDOM;
}

/**
 * Layer post-process: dissolve the layer's pixels in place.
 * @param {CanvasRenderingContext2D} ctx  layer surface (identity transform)
 * @param {Record<string, any>} params
 * @param {{ scale: number, width: number, height: number, t?: number, seconds?: number, seed?: number, pivot?: { x: number, y: number } }} info
 */
export function dissolveLayer(ctx, params, info) {
  const mode = params['dissolve.mode'];
  if (!mode || mode === 'off') return;
  const amount = Math.min(1, Math.max(0, evalCurve(params['dissolve.amount'], info.t ?? 0)));
  if (amount <= 0) return;
  const box = alphaBounds(ctx.getImageData(0, 0, info.width, info.height));
  if (!box) return;
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const img = ctx.getImageData(box.x0, box.y0, bw, bh);
  const d = img.data;
  if (amount >= 1) {
    for (let i = 3; i < d.length; i += 4) d[i] = 0;
    ctx.putImageData(img, box.x0, box.y0);
    return;
  }

  const seed = info.seed ?? 0;
  const N = noiseFor(seed);
  const piece = Math.max(1, (params['dissolve.size'] ?? 40) * info.scale);
  const z = (info.seconds ?? 0) * (params['dissolve.flow'] ?? 0);
  const ox = (info.pivot?.x ?? 0.5) * info.width;
  const oy = (info.pivot?.y ?? 0.5) * info.height;

  // Survival values for the box plus a 1-px border (for the gradient).
  const W = bw + 2;
  const H = bh + 2;
  const v = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const px = box.x0 + i - 1;
      const py = box.y0 + j - 1;
      v[j * W + i] = survival(mode, N, (px - ox) / piece, (py - oy) / piece, z, seed);
    }
  }

  const edgePx = (params['dissolve.edgePx'] ?? 0) * info.scale;
  const [er, eg, eb, ea] = parseHex(params['dissolve.edgeColor'] ?? '#ffffff');
  const edgeStrength = ea / 255;
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const o = (j * bw + i) * 4;
      if (d[o + 3] === 0) continue;
      const k = (j + 1) * W + (i + 1);
      const gx = (v[k + 1] - v[k - 1]) / 2;
      const gy = (v[k + W] - v[k - W]) / 2;
      const g = Math.hypot(gx, gy) || 1e-6;
      const distPx = (v[k] - amount) / g; // signed px from the dissolve edge (+ = kept side)
      const cover = Math.min(1, Math.max(0, distPx + 0.5));
      if (cover <= 0) {
        d[o + 3] = 0;
        continue;
      }
      if (edgePx > 0 && edgeStrength > 0 && distPx < edgePx) {
        const w = edgeStrength * Math.min(1, edgePx - distPx);
        d[o] += (er - d[o]) * w;
        d[o + 1] += (eg - d[o + 1]) * w;
        d[o + 2] += (eb - d[o + 2]) * w;
      }
      d[o + 3] *= cover;
    }
  }
  ctx.putImageData(img, box.x0, box.y0);
}
