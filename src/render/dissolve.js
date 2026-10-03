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
import { loopRate } from '../core/loopContext.js';
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
      { value: 'pixels', label: 'Pixels (square blocks)' },
      { value: 'dots', label: 'Dots (halftone, shrinking dots)' },
      { value: 'lines', label: 'Lines (stripes thin out)' },
      { value: 'wipe', label: 'Wipe (an edge sweeps across)' },
      { value: 'radialOut', label: 'Radial out (a hole grows from the centre)' },
      { value: 'radialIn', label: 'Radial in (closes in from the edges)' },
      { value: 'sand', label: 'Sand (crumbles into fine grain)' },
    ],
    default: 'off',
    tooltip: 'How the layer breaks apart over time',
  },
  {
    id: 'dissolve.direction',
    label: 'Direction',
    group: 'Dissolve',
    type: 'enum',
    options: [
      { value: 'dissolve', label: 'Dissolve (breaks apart)' },
      { value: 'reveal', label: 'Reveal (builds up, reversed)' },
    ],
    default: 'dissolve',
    tooltip: 'Reveal plays the same pattern backwards: the layer assembles itself',
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
    tooltip:
      'How much is gone across the effect (0 = whole, 1 = gone). In Reveal: how much is shown',
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
    tooltip: 'Size of the curls / shards / holes / blocks / dots / stripes',
  },
  {
    id: 'dissolve.angle',
    label: 'Angle',
    group: 'Dissolve',
    type: 'float',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: 'Wipe and Lines: direction (0 = left to right)',
  },
  {
    id: 'dissolve.roughness',
    label: 'Edge roughness',
    group: 'Dissolve',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.25,
    tooltip: 'Wipe, Radial and Lines: 0 = a clean edge, higher = ragged',
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
  // Irregular edges (D-095): the pattern is bent by smooth noise before it is cut, so every
  // shape gets organic, hand-drawn edges (and Reveal plays the same edges backwards).
  {
    id: 'dissolve.edgeNoise',
    label: 'Edge noise',
    group: 'Dissolve',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'Bends the dissolve edges in and out (0 = clean geometric edges)',
  },
  {
    id: 'dissolve.edgeDetail',
    label: 'Noise detail',
    group: 'Dissolve',
    type: 'float',
    min: 0.1,
    max: 4,
    step: 0.05,
    default: 1,
    tooltip: 'Size of the bulges (× piece size): big = lumpy wobbles, small = ragged',
  },
  {
    id: 'dissolve.edgeWobble',
    label: 'Edge wobble',
    group: 'Dissolve',
    type: 'float',
    min: 0,
    max: 4,
    step: 0.05,
    default: 0.5,
    unit: '/s',
    tooltip: 'How much the edges boil over time (0 = frozen; loops: whole cycles)',
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
 * @param {string} mode  curls · shards · holes · pixels · dots · sand
 * @param {import('../core/noise.js').Noise} N
 * @param {number} x pattern coordinates (1 unit = one piece)
 * @param {number} y
 * @param {number} z time coordinate
 * @param {number} seed
 */
export function survival(mode, N, x, y, z, seed) {
  if (mode === 'pixels') return cellRand(Math.floor(x), Math.floor(y), seed, 4);
  if (mode === 'dots') {
    // halftone: each cell keeps a disc whose radius shrinks with the amount
    const fx = x - Math.floor(x) - 0.5;
    const fy = y - Math.floor(y) - 0.5;
    return 1 - Math.min(1, Math.hypot(fx, fy) / Math.SQRT1_2);
  }
  if (mode === 'sand') {
    // fine grain, crumbling region by region
    const g = cellRand(Math.floor(x * 8), Math.floor(y * 8), seed, 5);
    return (N.noise3D(x * 0.6, y * 0.6, z) * 0.5 + 0.5) * 0.55 + g * 0.45;
  }
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
  const curve = Math.min(1, Math.max(0, evalCurve(params['dissolve.amount'], info.t ?? 0)));
  // Reveal (D-088): the same pattern backwards — the curve says how much is SHOWN
  const amount = params['dissolve.direction'] === 'reveal' ? 1 - curve : curve;
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
  const field = FIELD_MODES.has(mode) ? fieldFor(mode, params, box, N) : null;
  const piece = Math.max(1, (params['dissolve.size'] ?? 40) * info.scale);
  const z = (info.seconds ?? 0) * (params['dissolve.flow'] ?? 0);
  const ox = (info.pivot?.x ?? 0.5) * info.width;
  const oy = (info.pivot?.y ?? 0.5) * info.height;

  // Irregular edges: bend the lookup position with smooth noise. The wobble moves the sample
  // around a circle in noise space, so it comes back exactly (seamless loops).
  const warpAmt = (params['dissolve.edgeNoise'] ?? 0) * piece * 0.6;
  const warpSize = Math.max(1, piece * (params['dissolve.edgeDetail'] ?? 1));
  const wob = 2 * Math.PI * loopRate(params['dissolve.edgeWobble'] ?? 0.5) * (info.seconds ?? 0);
  const wcx = Math.cos(wob) * 1.3;
  const wcy = Math.sin(wob) * 1.3;

  // Survival values for the box plus a 1-px border (for the gradient).
  const W = bw + 2;
  const H = bh + 2;
  const v = new Float32Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      let px = box.x0 + i - 1;
      let py = box.y0 + j - 1;
      if (warpAmt > 0) {
        const nx = px / warpSize + wcx;
        const ny = py / warpSize + wcy;
        const qx = px;
        px += N.noise3D(nx, ny, 17.3) * warpAmt;
        py += N.noise3D(qx / warpSize - wcy, ny + 31.7, 41.9) * warpAmt;
      }
      v[j * W + i] = field
        ? field(px, py, piece, z)
        : survival(mode, N, (px - ox) / piece, (py - oy) / piece, z, seed);
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

/** Modes defined across the whole layer surface (not per piece): wipe, radial, lines. */
const FIELD_MODES = new Set(['wipe', 'radialOut', 'radialIn', 'lines']);

/**
 * Survival for the whole-shape modes, in output px, normalized over what the layer draws now
 * (its bounding box): the wipe crosses exactly the shape, the circle starts at its centre.
 * @param {string} mode @param {Record<string, any>} params
 * @param {{ x0: number, y0: number, x1: number, y1: number }} box
 * @param {import('../core/noise.js').Noise} N
 * @returns {(px: number, py: number, piece: number, z: number) => number}
 */
function fieldFor(mode, params, box, N) {
  const rough = params['dissolve.roughness'] ?? 0.25;
  const a = ((params['dissolve.angle'] ?? 0) * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const X = box.x0;
  const Y = box.y0;
  const W = box.x1 - box.x0;
  const H = box.y1 - box.y0;
  const jag = (
    /** @type {number} */ px,
    /** @type {number} */ py,
    /** @type {number} */ piece,
    /** @type {number} */ z,
  ) => (rough > 0 ? N.noise3D(px / piece, py / piece, z) * rough * 0.5 : 0);
  if (mode === 'lines') {
    return (px, py, piece, z) => {
      const u = (px * ca + py * sa) / piece + jag(px, py, piece * 2, z) * 0.6;
      return 1 - Math.abs(u - Math.floor(u) - 0.5) * 2;
    };
  }
  if (mode === 'wipe') {
    // projections of the corners: the sweep covers the whole surface exactly
    const us = [0, W * ca, H * sa, W * ca + H * sa];
    const lo = Math.min(...us);
    const span = Math.max(...us) - lo || 1;
    // the first side to go is the one the angle points from; leave room for the ragged edge
    return (px, py, piece, z) => {
      const u = ((px - X) * ca + (py - Y) * sa - lo) / span;
      return (u + jag(px, py, piece, z) + rough * 0.5) / (1 + rough);
    };
  }
  const cx = X + W / 2;
  const cy = Y + H / 2;
  const far = Math.hypot(W / 2, H / 2) || 1;
  return (px, py, piece, z) => {
    const r = Math.hypot(px - cx, py - cy) / far;
    const v = (r + jag(px, py, piece, z) + rough * 0.5) / (1 + rough);
    return mode === 'radialOut' ? v : 1 - v;
  };
}
