// @ts-check
/**
 * Fractal noise (D-104), like After Effects' Fractal Noise, for backgrounds, caustics, energy,
 * mattes — and (Part B) painted on top of other layers as an animated surface.
 *
 * - Fractal: several octaves of seeded simplex noise. Complexity = how many; each one is
 *   smaller (Sub scaling), weaker (Sub influence) and turned (Sub rotation).
 * - Types: Basic (soft clouds), Turbulent (soft creases), Ridges (sharp bright veins — caustics,
 *   lightning, cracks), Liquid (warped: the noise pushes itself around — swirly water / smoke).
 * - Animation: Evolution (the pattern morphs in place: degrees, or turns per second) and Flow
 *   (it scrolls, px per second). In loops evolution makes whole turns (one turn comes back
 *   exactly: crisp and seamless); scrolling cross-fades the end into the start (softer mid-loop
 *   for sharp patterns — prefer evolution there).
 * - Look: Contrast, Brightness, Invert, then Bands cuts it into flat cel steps (crisp edges,
 *   optional soft edge) and a ramp colours it (left = bright, like every ELDR ramp). Alpha:
 *   solid, or "bright = opaque" for overlays and mattes.
 * - Speed: the noise is computed on a coarse grid (Quality) and smoothly scaled up before
 *   contrast and bands, so edges stay crisp at a fraction of the cost.
 */

import { loopPeriod, loopRate } from '../core/loopContext.js';
import { createNoise } from '../core/noise.js';
import { blendRgb } from './blendMath.js';
import { sampleRamp } from './ramp.js';
import { rampPreset } from './rampPresets.js';

const TAU = Math.PI * 2;
const clamp01 = (/** @type {number} */ t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/**
 * The fractal controls, with ids under `prefix` (fn.* for the Fractal Noise layer, surf.* for
 * Surface noise on other layers).
 * @param {string} prefix @param {string} group
 * @param {Record<string, any>} [defaults] per-id default overrides (without the prefix)
 */
export function noiseParams(prefix, group, defaults = {}) {
  const d = (/** @type {string} */ id, /** @type {any} */ v) => (id in defaults ? defaults[id] : v);
  const f = (
    /** @type {string} */ id,
    /** @type {string} */ label,
    /** @type {number} */ min,
    /** @type {number} */ max,
    /** @type {number} */ step,
    /** @type {number} */ def,
    tooltip = '',
    unit = '',
  ) => ({
    id: `${prefix}.${id}`,
    label,
    group,
    type: 'float',
    min,
    max,
    step,
    default: d(id, def),
    ...(unit ? { unit } : {}),
    ...(tooltip ? { tooltip } : {}),
  });
  return [
    {
      id: `${prefix}.type`,
      label: 'Noise type',
      group,
      type: 'enum',
      options: [
        { value: 'basic', label: 'Basic (soft clouds)' },
        { value: 'turbulent', label: 'Turbulent (soft creases)' },
        { value: 'ridges', label: 'Ridges (sharp veins: caustics, cracks)' },
        { value: 'liquid', label: 'Liquid (swirly, pushes itself around)' },
        { value: 'cells', label: 'Cells (connected bright web: caustics, scales, cracks)' },
      ],
      default: d('type', 'basic'),
    },
    f('contrast', 'Contrast', 0, 600, 1, 100, 'Like AE: spreads the values apart', '%'),
    f('brightness', 'Brightness', -200, 200, 1, 0, '', '%'),
    { id: `${prefix}.invert`, label: 'Invert', group, type: 'bool', default: d('invert', false) },
    f('complexity', 'Complexity', 1, 10, 0.1, 5, 'How many layers of detail (octaves)'),
    f('subInfluence', 'Sub influence', 0, 100, 1, 60, 'How strong each finer layer is', '%'),
    f('subScaling', 'Sub scaling', 20, 90, 1, 50, 'How much smaller each finer layer is', '%'),
    f('subRotation', 'Sub rotation', -180, 180, 1, 30, 'Each finer layer is turned', '°'),
    f('scale', 'Scale', 2, 4000, 1, 120, 'Size of the biggest shapes', 'px'),
    f('stretchW', 'Stretch width', 10, 1000, 1, 100, '', '%'),
    f('stretchH', 'Stretch height', 10, 1000, 1, 100, '', '%'),
    f('rotation', 'Rotation', -360, 360, 1, 0, '', '°'),
    f(
      'offsetX',
      'Offset X',
      -5000,
      5000,
      1,
      0,
      'Moves the pattern (keyframe it, or use Flow)',
      'px',
    ),
    f('offsetY', 'Offset Y', -5000, 5000, 1, 0, '', 'px'),
    f('flowX', 'Flow X', -2000, 2000, 1, 0, 'Scrolls the pattern (seamless in loops)', 'px/s'),
    f('flowY', 'Flow Y', -2000, 2000, 1, 0, '', 'px/s'),
    f(
      'evolution',
      'Evolution',
      -36000,
      36000,
      1,
      0,
      'Morphs the pattern in place (keyframable, like AE)',
      '°',
    ),
    f(
      'evoSpeed',
      'Evolution speed',
      -10,
      10,
      0.01,
      0.5,
      'Turns per second (loops: whole turns)',
      '/s',
    ),
    f(
      'warp',
      'Liquid warp',
      0,
      4,
      0.01,
      1,
      'Liquid and Cells: how far the pattern is pushed around (wavy)',
    ),
    {
      id: `${prefix}.bands`,
      label: 'Bands',
      group,
      type: 'int',
      min: 0,
      max: 16,
      default: d('bands', 0),
      tooltip: 'Cut into flat cel steps (0 = smooth)',
    },
    f('bandSoft', 'Band edge softness', 0, 1, 0.01, 0, '0 = crisp cel edges'),
    {
      id: `${prefix}.ramp`,
      label: prefix === 'surf' ? 'Surface colours' : 'Colour ramp',
      group,
      type: 'ramp',
      default: (defaults.ramp ?? rampPreset('water')).map((/** @type {any} */ s) => ({ ...s })),
      tooltip: 'Left = bright values, right = dark',
    },
    {
      id: `${prefix}.alpha`,
      label: 'Alpha',
      group,
      type: 'enum',
      options: [
        { value: 'solid', label: 'Solid (ramp alpha)' },
        { value: 'luma', label: 'Bright = opaque (overlays, mattes, light)' },
      ],
      default: d('alpha', 'solid'),
    },
    {
      id: `${prefix}.quality`,
      label: 'Quality',
      group,
      type: 'enum',
      options: [
        { value: 'draft', label: 'Draft (fast)' },
        { value: 'normal', label: 'Normal' },
        { value: 'best', label: 'Best (every pixel)' },
      ],
      default: d('quality', 'normal'),
      tooltip: 'Noise is computed on a coarser grid and smoothly scaled up; band edges stay crisp',
    },
  ];
}

/**
 * @param {Record<string, any>} v @param {string} prefix
 */
export function readNoise(v, prefix) {
  const g = (/** @type {string} */ id, /** @type {any} */ def) => v[`${prefix}.${id}`] ?? def;
  return {
    type: g('type', 'basic'),
    contrast: g('contrast', 100) / 100,
    brightness: g('brightness', 0) / 100,
    invert: !!g('invert', false),
    complexity: Math.max(1, Math.min(10, g('complexity', 5))),
    subInfluence: g('subInfluence', 60) / 100,
    subScaling: Math.max(0.2, g('subScaling', 50) / 100),
    subRotation: (g('subRotation', 30) * Math.PI) / 180,
    scale: Math.max(1, g('scale', 120)),
    stretchW: Math.max(0.05, g('stretchW', 100) / 100),
    stretchH: Math.max(0.05, g('stretchH', 100) / 100),
    rotation: (g('rotation', 0) * Math.PI) / 180,
    offsetX: g('offsetX', 0),
    offsetY: g('offsetY', 0),
    flowX: g('flowX', 0),
    flowY: g('flowY', 0),
    evolution: g('evolution', 0) / 360,
    evoSpeed: g('evoSpeed', 0.5),
    warp: g('warp', 1),
    bands: Math.round(g('bands', 0)),
    bandSoft: g('bandSoft', 0),
    ramp: g('ramp', null) ?? rampPreset('water'),
    alpha: g('alpha', 'solid'),
    quality: g('quality', 'normal'),
  };
}

/** @typedef {ReturnType<typeof readNoise>} NoiseCfg */

/** Radius of the evolution circle (noise units): how much one turn morphs the pattern. */
const EVO_R = 0.7;

/**
 * Cellular (Worley) noise from the edge distance F2 − F1 (3D, or 2D for flat patterns): high
 * on the borders between cells, low inside; centred like the other types. The feature points wander on small loops as `w` (evolution, turns) grows, so the
 * web wobbles like caustics.
 * @param {number} x @param {number} y @param {number} z @param {number} w @param {number} seed
 */
function cellEdge(x, y, z, w, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let f1 = 9;
  let f2 = 9;
  const ph = w * TAU;
  // flat patterns (z = 0 everywhere) use 2D cells: an even web, and 3× faster
  const flat = z === 0;
  for (let dz = flat ? 0 : -1; dz <= (flat ? 0 : 1); dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        let h = Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663) ^ Math.imul(cz, 83492791) ^ seed;
        h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
        h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
        h ^= h >>> 16;
        const r1 = (h & 1023) / 1024;
        const r2 = ((h >>> 10) & 1023) / 1024;
        const r3 = ((h >>> 20) & 1023) / 1024;
        const px = cx + 0.5 + 0.35 * Math.sin(ph + r1 * TAU);
        const py = cy + 0.5 + 0.35 * Math.cos(ph * 1 + r2 * TAU);
        const pz = flat ? 0 : cz + 0.5 + 0.35 * Math.sin(ph + r3 * TAU + 1.7);
        const ddx = px - x;
        const ddy = py - y;
        const ddz = flat ? 0 : pz - z;
        const d = ddx * ddx + ddy * ddy + ddz * ddz;
        if (d < f1) {
          f2 = f1;
          f1 = d;
        } else if (d < f2) f2 = d;
      }
    }
  }
  // centred, same spread as the other types (measured): bright on the borders
  const e = Math.sqrt(f2) - Math.sqrt(f1);
  return flat ? (0.281 - e) / 0.203 : (0.179 - e) / 0.1435;
}

/** Noise generators by seed (the permutation table is cheap, but frames ask many times). */
const gens = new Map();
/** @param {number} seed */
function gen(seed) {
  let n = gens.get(seed);
  if (!n) {
    n = createNoise(seed);
    gens.set(seed, n);
    if (gens.size > 32) gens.delete(gens.keys().next().value);
  }
  return n;
}

/**
 * A fractal sampler for one moment: (x, y, z) in pattern px → value, about −1…1.
 * `w` is the evolution coordinate (turns), `ox, oy` the pattern offset (px).
 * @param {NoiseCfg} c @param {number} seed
 */
function sampler(c, seed) {
  const N = gen(seed >>> 0);
  const oct = Math.ceil(c.complexity);
  const lastW = c.complexity - (oct - 1);
  const cr = Math.cos(c.rotation);
  const sr = Math.sin(c.rotation);
  // per octave: frequency, amplitude, rotation (cos/sin), shift
  const O = [];
  let amp = 1;
  let freq = 1 / c.scale;
  let sum2 = 0;
  for (let i = 0; i < oct; i++) {
    const a = amp * (i === oct - 1 ? lastW : 1);
    O.push({
      f: freq,
      a,
      c: Math.cos(c.subRotation * i),
      s: Math.sin(c.subRotation * i),
      sh: i * 31.7,
    });
    sum2 += a * a;
    amp *= c.subInfluence;
    freq /= c.subScaling;
  }
  // every type and complexity comes out centred with the same spread (measured), so Contrast
  // and Brightness mean the same thing whatever the settings — and slider changes are gradual
  const norm = 1 / Math.sqrt(sum2 || 1);
  const gain =
    c.type === 'turbulent' ? 1.23 : c.type === 'ridges' ? 0.89 : c.type === 'cells' ? 0.45 : 1.6;
  const sd = seed >>> 0;
  /** @param {number} X @param {number} Y @param {number} Z @param {number} W */
  const fbm = (X, Y, Z, W) => {
    let v = 0;
    for (const o of O) {
      const x = (X * o.c - Y * o.s) * o.f + o.sh;
      const y = (X * o.s + Y * o.c) * o.f - o.sh;
      if (c.type === 'cells') {
        v += o.a * cellEdge(x, y, Z * o.f, W, sd);
        continue;
      }
      // evolution goes round a circle in the 3rd/4th dimensions: one turn comes back exactly
      // (seamless loops without any cross-fade, the pattern stays crisp)
      const ang = TAU * W + o.sh;
      const n = N.noise4D(x, y, Z * o.f + EVO_R * Math.cos(ang), EVO_R * Math.sin(ang));
      if (c.type === 'turbulent') v += o.a * (2 * Math.abs(n) - 0.425);
      else if (c.type === 'ridges') {
        const r = 1 - Math.abs(n);
        v += o.a * (2 * r * r - 1.308);
      } else v += o.a * n;
    }
    return v * norm * gain;
  };
  /**
   * @param {number} x @param {number} y @param {number} z pattern px (before scale)
   * @param {number} w evolution (turns) @param {number} ox @param {number} oy
   */
  return (x, y, z, w, ox, oy) => {
    const px = x - ox;
    const py = y - oy;
    // rotate + stretch the pattern
    let X = (px * cr + py * sr) / c.stretchW;
    let Y = (-px * sr + py * cr) / c.stretchH;
    if (c.type === 'liquid') {
      const k = c.warp * c.scale * 0.6;
      const qx = fbm(X + 5.2 * c.scale, Y + 1.3 * c.scale, z, w + 3.1);
      const qy = fbm(X - 1.7 * c.scale, Y + 9.2 * c.scale, z, w + 7.4);
      X += k * qx;
      Y += k * qy;
    } else if (c.type === 'cells' && c.warp > 0) {
      // cells bent by a soft noise: a wobbly caustic web instead of straight Voronoi lines
      const k = c.warp * c.scale * 0.18;
      const f = 1 / c.scale;
      const a = TAU * w;
      X += k * N.noise4D(X * f + 5.2, Y * f + 1.3, z * f + 0.4 * Math.cos(a), 0.4 * Math.sin(a));
      Y +=
        k *
        N.noise4D(X * f - 1.7, Y * f + 9.2, z * f + 0.4 * Math.cos(a + 2), 0.4 * Math.sin(a + 2));
    }
    return fbm(X, Y, z, w);
  };
}

/**
 * The moment(s) to sample: evolution and offset now, and in loops the same one loop earlier with
 * a cross-fade weight (the last frame flows into the first).
 * @param {NoiseCfg} c @param {number} seconds
 * @returns {{ w: number, ox: number, oy: number, k: number }[]}  k = weight
 */
export function noiseMoments(c, seconds) {
  const P = loopPeriod();
  const evo = loopRate(c.evoSpeed);
  const at = (/** @type {number} */ s) => ({
    w: c.evolution + evo * s,
    ox: c.offsetX + c.flowX * s,
    oy: c.offsetY + c.flowY * s,
  });
  // evolution is whole turns per loop (always seamless); only scrolling needs the cross-fade
  const scrolling = c.flowX !== 0 || c.flowY !== 0;
  if (!P || !scrolling) return [{ ...at(seconds), k: 1 }];
  const s = seconds - Math.floor(seconds / P) * P;
  const u = s / P;
  // variance-preserving cross-fade (no dip in contrast mid-loop)
  const n = Math.sqrt((1 - u) * (1 - u) + u * u);
  return [
    { ...at(s), k: (1 - u) / n },
    { ...at(s - P), k: u / n },
  ];
}

/** Grid cell size in output px for a quality. @param {string} q */
const cellOf = (q) => (q === 'best' ? 1 : q === 'draft' ? 8 : 4);

/**
 * Raw fractal values (≈ −1…1) for a box of output pixels, on a coarse grid. `map(px, py)` turns
 * an output pixel centre into pattern space [x, y, z], or null where there is no pattern.
 * @param {NoiseCfg} c @param {number} seed @param {number} seconds
 * @param {{ x: number, y: number, w: number, h: number }} box output px
 * @param {(px: number, py: number) => number[] | null} map
 * @returns {{ grid: Float32Array, gw: number, gh: number, cell: number }}
 */
export function noiseGrid(c, seed, seconds, box, map) {
  const cell = cellOf(c.quality);
  const gw = Math.floor((box.w - 1) / cell) + 2;
  const gh = Math.floor((box.h - 1) / cell) + 2;
  const grid = new Float32Array(gw * gh);
  const S = sampler(c, seed);
  const ms = noiseMoments(c, seconds);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const q = map(box.x + i * cell + 0.5, box.y + j * cell + 0.5);
      if (!q) {
        grid[j * gw + i] = Number.NaN;
        continue;
      }
      let v = 0;
      for (const m of ms) v += m.k * S(q[0], q[1], q[2], m.w, m.ox, m.oy);
      grid[j * gw + i] = v;
    }
  }
  return { grid, gw, gh, cell };
}

/**
 * Value → 0–1 after contrast, brightness, invert and bands.
 * @param {NoiseCfg} c
 */
export function toneOf(c) {
  const B = c.bands;
  const soft = Math.max(1e-4, c.bandSoft);
  return (/** @type {number} */ raw) => {
    let o = clamp01(raw * 0.5 * c.contrast + 0.5 + c.brightness);
    if (c.invert) o = 1 - o;
    if (B >= 2) {
      const f = o * B;
      let i = Math.floor(f);
      if (i >= B) i = B - 1;
      const fr = f - i;
      // crisp step, or a short smooth ramp just before each step when softened
      const t = c.bandSoft > 0 ? clamp01((fr - (1 - soft)) / soft) : 0;
      const e = t * t * (3 - 2 * t);
      o = Math.min(1, (i + (i < B - 1 ? e : 0)) / (B - 1));
    }
    return o;
  };
}

/** 256-entry colour table of a ramp (left = bright). @param {any} ramp */
function rampLut(ramp) {
  const L = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const c = sampleRamp(ramp, 1 - i / 255);
    L[i * 4] = c[0];
    L[i * 4 + 1] = c[1];
    L[i * 4 + 2] = c[2];
    L[i * 4 + 3] = c[3];
  }
  return L;
}

/**
 * Walk every output pixel of a box with its smooth (bilinear) raw value, or NaN outside.
 * @param {{ grid: Float32Array, gw: number, gh: number, cell: number }} G
 * @param {number} bw @param {number} bh
 * @param {(idx: number, raw: number) => void} fn  idx = pixel index in the box
 */
function eachPixel(G, bw, bh, fn) {
  const { grid, gw, cell } = G;
  for (let y = 0; y < bh; y++) {
    const gy = y / cell;
    const j = Math.floor(gy);
    const fy = gy - j;
    for (let x = 0; x < bw; x++) {
      const gx = x / cell;
      const i = Math.floor(gx);
      const fx = gx - i;
      const a = grid[j * gw + i];
      const b = grid[j * gw + i + 1];
      const c = grid[(j + 1) * gw + i];
      const d = grid[(j + 1) * gw + i + 1];
      let v;
      if (!(Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d))) {
        v = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
      } else {
        // at a pattern edge: nearest valid corner
        v = fx < 0.5 ? (fy < 0.5 ? a : c) : fy < 0.5 ? b : d;
        if (Number.isNaN(v)) v = [a, b, c, d].find((q) => !Number.isNaN(q)) ?? Number.NaN;
      }
      fn(y * bw + x, v);
    }
  }
}

/** Inverse of a 2D affine [a, b, c, d, e, f]. @param {number[]} m */
export function invert2D(m) {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [
    m[3] / det,
    -m[1] / det,
    -m[2] / det,
    m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det,
    (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

// ── Fractal Noise layer ──────────────────────────────────────────────────────────────────────

const LG = 'Fractal noise';
/** Fractal Noise layer parameters. */
export const FRACTAL_LAYER_PARAMS = [
  ...noiseParams('fn', LG),
  {
    id: 'fn.fill',
    label: 'Fill the frame',
    group: 'Fractal size',
    type: 'bool',
    default: true,
    tooltip: 'Cover the whole frame (backgrounds). Off: a rectangle of the size below',
  },
  {
    id: 'fn.width',
    label: 'Width',
    group: 'Fractal size',
    type: 'float',
    min: 1,
    max: 8000,
    step: 1,
    default: 400,
    unit: 'px',
  },
  {
    id: 'fn.height',
    label: 'Height',
    group: 'Fractal size',
    type: 'float',
    min: 1,
    max: 8000,
    step: 1,
    default: 400,
    unit: 'px',
  },
];

/**
 * Draw the Fractal Noise layer: the pattern lives in the layer's own space (it moves, turns and
 * scales with the layer), and fills the frame or a rectangle around the layer's origin.
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ seconds: number, seed: number }} frame
 */
export function drawFractalLayer(ctx, params, frame) {
  const c = readNoise(params, 'fn');
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const t = ctx.getTransform();
  const M = [t.a, t.b, t.c, t.d, t.e, t.f];
  const inv = invert2D(M);
  const fill = params['fn.fill'] ?? true;
  const hw = (params['fn.width'] ?? 400) / 2;
  const hh = (params['fn.height'] ?? 400) / 2;
  let box = { x: 0, y: 0, w: W, h: H };
  if (!fill) {
    const pts = [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ].map(([x, y]) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]);
    const x0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[0]))));
    const y0 = Math.max(0, Math.floor(Math.min(...pts.map((p) => p[1]))));
    const x1 = Math.min(W, Math.ceil(Math.max(...pts.map((p) => p[0]))));
    const y1 = Math.min(H, Math.ceil(Math.max(...pts.map((p) => p[1]))));
    if (x1 <= x0 || y1 <= y0) return;
    box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const toLayer = (/** @type {number} */ px, /** @type {number} */ py) => [
    inv[0] * px + inv[2] * py + inv[4],
    inv[1] * px + inv[3] * py + inv[5],
    0,
  ];
  const G = noiseGrid(c, frame.seed, frame.seconds, box, toLayer);
  const tone = toneOf(c);
  const L = rampLut(c.ramp);
  const img = ctx.createImageData(box.w, box.h);
  const d = img.data;
  const alpha = ctx.globalAlpha;
  eachPixel(G, box.w, box.h, (idx, raw) => {
    if (Number.isNaN(raw)) return;
    if (!fill) {
      const px = box.x + (idx % box.w) + 0.5;
      const py = box.y + Math.floor(idx / box.w) + 0.5;
      const lx = inv[0] * px + inv[2] * py + inv[4];
      const ly = inv[1] * px + inv[3] * py + inv[5];
      if (lx < -hw || lx > hw || ly < -hh || ly > hh) return;
    }
    const o = tone(raw);
    const li = Math.round(o * 255) * 4;
    const p = idx * 4;
    d[p] = L[li];
    d[p + 1] = L[li + 1];
    d[p + 2] = L[li + 2];
    d[p + 3] = L[li + 3] * (c.alpha === 'luma' ? o : 1) * alpha;
  });
  ctx.putImageData(img, box.x, box.y);
}

// ── Surface noise (Part B): fractal painted inside another layer's own shape ────────────────

const SG = 'Surface noise';
/** Surface noise parameters, added to every sprite layer. */
export const SURFACE_PARAMS = [
  {
    id: 'surf.on',
    label: 'Surface noise',
    group: SG,
    type: 'bool',
    default: false,
    tooltip:
      'Paint an animated fractal inside this layer’s shapes (water surface, orb clouds, energy)',
  },
  {
    id: 'surf.map',
    label: 'Mapping',
    group: SG,
    type: 'enum',
    options: [
      { value: 'flat', label: 'Flat (pattern in layer space)' },
      { value: 'flow', label: 'Flow (stretched along a direction, running with it)' },
      { value: 'sphere', label: 'Sphere (wrapped on a ball, spinning)' },
    ],
    default: 'flow',
  },
  {
    id: 'surf.blend',
    label: 'Blend',
    group: SG,
    type: 'enum',
    options: [
      { value: 'normal', label: 'Normal' },
      { value: 'add', label: 'Add' },
      { value: 'screen', label: 'Screen' },
      { value: 'multiply', label: 'Multiply' },
      { value: 'overlay', label: 'Overlay' },
      { value: 'soft-light', label: 'Soft light' },
    ],
    default: 'normal',
  },
  {
    id: 'surf.mix',
    label: 'Mix',
    group: SG,
    type: 'float',
    min: 0,
    max: 100,
    step: 1,
    default: 100,
    unit: '%',
  },
  {
    id: 'surf.flowAngle',
    label: 'Flow direction',
    group: SG,
    type: 'float',
    min: -360,
    max: 360,
    step: 1,
    default: -90,
    unit: '°',
    tooltip: 'Flow mapping: the direction the water runs (0 = right, −90 = up, 90 = down)',
  },
  {
    id: 'surf.flowSpeed',
    label: 'Flow speed',
    group: SG,
    type: 'float',
    min: -3000,
    max: 3000,
    step: 1,
    default: 260,
    unit: 'px/s',
    tooltip: 'Flow mapping: how fast the pattern runs along (seamless in loops)',
  },
  {
    id: 'surf.flowStretch',
    label: 'Flow stretch',
    group: SG,
    type: 'float',
    min: 1,
    max: 12,
    step: 0.1,
    default: 3,
    tooltip: 'Flow mapping: pattern pulled long along the flow (streaks)',
  },
  {
    id: 'surf.radius',
    label: 'Sphere radius',
    group: SG,
    type: 'float',
    min: 0,
    max: 2000,
    step: 1,
    default: 0,
    unit: 'px',
    tooltip: 'Sphere mapping: 0 = the orb’s radius (or 100 px)',
  },
  {
    id: 'surf.spin',
    label: 'Spin',
    group: SG,
    type: 'float',
    min: -5,
    max: 5,
    step: 0.01,
    default: 0.15,
    unit: '/s',
    tooltip: 'Sphere mapping: turns per second around its axis (loops: whole turns)',
  },
  {
    id: 'surf.tilt',
    label: 'Tilt',
    group: SG,
    type: 'float',
    min: -90,
    max: 90,
    step: 1,
    default: 20,
    unit: '°',
    tooltip: 'Sphere mapping: leans the spin axis toward you',
  },
  ...noiseParams('surf', SG, {
    contrast: 160,
    brightness: -25,
    bands: 3,
    scale: 60,
    complexity: 3,
    evoSpeed: 0.4,
    alpha: 'luma',
    ramp: rampPreset('foam'),
  }),
];

/**
 * Pattern-space mapping for Surface noise: output px → [x, y, z] pattern px, or null.
 * @param {Record<string, any>} params @param {number[]} matrix layer px → output px
 * @param {number} seconds
 */
export function surfaceMapping(params, matrix, seconds) {
  const inv = invert2D(matrix);
  const mode = params['surf.map'] ?? 'flow';
  const lay = (/** @type {number} */ px, /** @type {number} */ py) => [
    inv[0] * px + inv[2] * py + inv[4],
    inv[1] * px + inv[3] * py + inv[5],
  ];
  if (mode === 'flow') {
    const a = ((params['surf.flowAngle'] ?? -90) * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const k = Math.max(1, params['surf.flowStretch'] ?? 3);
    const sp = params['surf.flowSpeed'] ?? 260;
    return {
      // running along the flow = a scroll of the pattern's along-axis (Flow Y in pattern space),
      // which the fractal's own loop cross-fade keeps seamless
      flow: { x: 0, y: sp / k },
      map: (/** @type {number} */ px, /** @type {number} */ py) => {
        const [x, y] = lay(px, py);
        // u along the flow (shrunk by the stretch), v across
        const u = (x * ca + y * sa) / k;
        const v = -x * sa + y * ca;
        return [v, u, 0];
      },
    };
  }
  if (mode === 'sphere') {
    const R = Math.max(1, params['surf.radius'] || params['orb.radius'] || 100);
    const spin = loopRate(params['surf.spin'] ?? 0.15) * seconds * TAU;
    const tilt = ((params['surf.tilt'] ?? 20) * Math.PI) / 180;
    const cs = Math.cos(spin);
    const ss = Math.sin(spin);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    return {
      flow: null,
      map: (/** @type {number} */ px, /** @type {number} */ py) => {
        const [x, y] = lay(px, py);
        const d2 = x * x + y * y;
        if (d2 >= R * R) return null;
        const z = Math.sqrt(R * R - d2);
        // tilt (around x), then spin (around the tilted vertical axis)
        const y1 = y * ct - z * st;
        const z1 = y * st + z * ct;
        const X = x * cs + z1 * ss;
        const Z = -x * ss + z1 * cs;
        return [X, y1, Z];
      },
    };
  }
  return {
    flow: null,
    map: (/** @type {number} */ px, /** @type {number} */ py) => [...lay(px, py), 0],
  };
}

/**
 * Post-process: paint Surface noise over a finished layer's pixels (its alpha is kept).
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ width: number, height: number, seconds: number, seed: number, matrix?: number[] }} info
 */
export function applySurface(ctx, params, info) {
  if (!params['surf.on'] || !info.matrix) return;
  const mix = (params['surf.mix'] ?? 100) / 100;
  if (mix <= 0) return;
  const W = info.width;
  const H = info.height;
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  // the box that holds pixels
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y += 2) {
    for (let x = 0; x < W; x += 2) {
      if (d[(y * W + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return;
  x0 = Math.max(0, x0 - 2);
  y0 = Math.max(0, y0 - 2);
  x1 = Math.min(W - 1, x1 + 2);
  y1 = Math.min(H - 1, y1 + 2);
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const c = readNoise(params, 'surf');
  const m = surfaceMapping(params, info.matrix, info.seconds);
  if (m.flow) {
    c.flowX += m.flow.x;
    c.flowY += m.flow.y;
  }
  const G = noiseGrid(c, (info.seed ^ 0x5f3759df) >>> 0, info.seconds, box, m.map);
  const tone = toneOf(c);
  const L = rampLut(c.ramp);
  const mode = params['surf.blend'] ?? 'normal';
  /** @type {[number, number, number]} */
  const base = [0, 0, 0];
  /** @type {[number, number, number]} */
  const top = [0, 0, 0];
  eachPixel(G, box.w, box.h, (idx, raw) => {
    if (Number.isNaN(raw)) return;
    const p = ((box.y + Math.floor(idx / box.w)) * W + box.x + (idx % box.w)) * 4;
    if (d[p + 3] === 0) return;
    const o = tone(raw);
    const li = Math.round(o * 255) * 4;
    const a = (L[li + 3] / 255) * (c.alpha === 'luma' ? o : 1) * mix;
    if (a <= 0) return;
    base[0] = d[p] / 255;
    base[1] = d[p + 1] / 255;
    base[2] = d[p + 2] / 255;
    top[0] = L[li] / 255;
    top[1] = L[li + 1] / 255;
    top[2] = L[li + 2] / 255;
    const r = blendRgb(mode, base, top);
    d[p] = (base[0] + (r[0] - base[0]) * a) * 255;
    d[p + 1] = (base[1] + (r[1] - base[1]) * a) * 255;
    d[p + 2] = (base[2] + (r[2] - base[2]) * a) * 255;
  });
  ctx.putImageData(img, 0, 0);
}
