// @ts-check
/**
 * Field shape (step 3.4b, D-041): fire and fireballs drawn from a swirling noise FIELD instead
 * of an outline. The field is a body (flame teardrop or ball) pushed around by two levels of
 * domain-warped noise (→ S-curves, curls, hooks), eaten away by erosion noise (→ pieces tearing
 * off), with its own swirl noise for the inner shapes. Its "heat" is cut into hard colour bands
 * from the layer's ramp — the look of Raul's references (D-039), procedurally.
 *
 * Rendering is per pixel. To stay fast, the field is evaluated on a coarse grid (every
 * GRID_PX output pixels) and interpolated; band and silhouette edges are still sharp and
 * anti-aliased, because the threshold is applied per pixel to the interpolated field.
 */

import { evalCurve } from '../core/curve.js';
import { hash32 } from '../core/hash.js';
import { createNoise } from '../core/noise.js';
import { nearestStopColor } from '../render/celshade.js';
import { sampleRamp } from '../render/ramp.js';

/** Field evaluated every N output pixels, then interpolated (speed vs. detail). */
const GRID_PX = 2;
/** Second noise octave: relative frequency and weight (first octave = the rest). */
const OCTAVE2_FREQ = 1.9;
const OCTAVE2_WEIGHT = 0.15;
/** How far the warped noise samples are pushed by the first warp level. */
const WARP_FEED = 1.6;
/** Field value → heat gain (higher = more of the body is hot). */
const HEAT_GAIN = 1.4;
/** Heat added everywhere, so edges near the base stay red-orange; only the top cools to dark. */
const HEAT_BIAS = 0.2;
/** S-bend travel: flame heights the bend moves per unit of flow time (at travel 1). */
const BEND_TRAVEL_RATE = 0.25;
/** Field values below this count as outside: removes hair-thin slivers the eye reads as lines. */
const MIN_FIELD = 0.03;
/** Body extent beyond its nominal size, so warped/torn pieces aren't cut off (× size). */
const MARGIN = 0.9;
/** Flame: how round the bottom is (fraction of height) and how fast it narrows upward. */
const FLAME_BASE = 0.3;
const FLAME_NARROW = 0.55;
/** Noise objects per seed (pure cache: same seed → same noise). */
const NOISE_CACHE_MAX = 64;
const noiseCache = new Map();

/** Field parameters (ids `field.*`). Defaults are a first pass [Raul]. */
export const FIELD_PARAMS = [
  {
    id: 'field.form',
    label: 'Form',
    group: 'Shape',
    type: 'enum',
    options: [
      { value: 'flame', label: 'Flame (rises from its base)' },
      { value: 'ball', label: 'Ball (fireball)' },
    ],
    default: 'flame',
    tooltip: 'Flame grows up from the pivot · Ball is centred on it',
  },
  {
    id: 'field.width',
    label: 'Width',
    group: 'Shape',
    type: 'float',
    min: 4,
    max: 1024,
    step: 1,
    default: 110,
    unit: 'px',
    randomize: { min: 90, max: 130 },
    tooltip: 'Half-width of the body (ball: its radius)',
  },
  {
    id: 'field.height',
    label: 'Height',
    group: 'Shape',
    type: 'float',
    min: 4,
    max: 1024,
    step: 1,
    default: 300,
    unit: 'px',
    randomize: { min: 250, max: 340 },
    tooltip: 'Flame height (ignored by Ball)',
  },
  {
    id: 'field.warp',
    label: 'Swirl',
    group: 'Motion',
    type: 'float',
    min: 0,
    max: 3,
    step: 0.01,
    default: 0.6,
    randomize: { min: 0.4, max: 0.85 },
    tooltip: 'How much the shape curls and bends (S-curves, hooks)',
  },
  {
    id: 'field.scale',
    label: 'Swirl size',
    group: 'Motion',
    type: 'float',
    min: 0.2,
    max: 6,
    step: 0.01,
    default: 0.9,
    tooltip: 'Smaller = bigger, calmer curls · larger = more, smaller curls',
  },
  {
    id: 'field.speed',
    label: 'Rise speed',
    group: 'Motion',
    type: 'float',
    min: 0,
    max: 16,
    step: 0.05,
    default: 2,
    tooltip: 'How fast the fire flows upward (per second — a longer timeline does not slow it)',
  },
  {
    id: 'field.bend',
    label: 'S-bend',
    group: 'Flow shape',
    type: 'float',
    min: 0,
    max: 2,
    step: 0.01,
    default: 0,
    tooltip: 'Bends the whole flame into S-curves (0 = straight)',
  },
  {
    id: 'field.bendWaves',
    label: 'S-bend waves',
    group: 'Flow shape',
    type: 'float',
    min: 0.25,
    max: 4,
    step: 0.05,
    default: 1,
    tooltip: 'How many bends along the height (0.5 = one C-curve, 1 = an S)',
  },
  {
    id: 'field.bendTravel',
    label: 'S-bend travel',
    group: 'Flow shape',
    type: 'float',
    min: -4,
    max: 4,
    step: 0.05,
    default: 1,
    tooltip: 'How fast the bends travel up the flame (0 = frozen, negative = down)',
  },
  {
    id: 'field.lean',
    label: 'Lean',
    group: 'Flow shape',
    type: 'float',
    min: -2,
    max: 2,
    step: 0.01,
    default: 0,
    tooltip: 'Tips the flame sideways, more toward the top (wind)',
  },
  {
    id: 'field.curl',
    label: 'Curl',
    group: 'Flow shape',
    type: 'float',
    min: -8,
    max: 8,
    step: 0.05,
    default: 0,
    tooltip: 'Twists the shape into a hook around one point. Sign = direction',
  },
  {
    id: 'field.curlHeight',
    label: 'Curl position',
    group: 'Flow shape',
    type: 'float',
    min: -0.5,
    max: 1.5,
    step: 0.01,
    default: 0.85,
    tooltip: 'Where the curl sits: 0 = base, 1 = tip (ball: 0 = centre)',
  },
  {
    id: 'field.curlSize',
    label: 'Curl size',
    group: 'Flow shape',
    type: 'float',
    min: 0.05,
    max: 2,
    step: 0.01,
    default: 0.45,
    tooltip: 'Radius of the curl, relative to the flame width/height',
  },
  {
    id: 'field.erode',
    label: 'Tear-off',
    group: 'Breakup',
    type: 'float',
    min: 0,
    max: 3,
    step: 0.01,
    default: 1,
    randomize: { min: 0.8, max: 1.3 },
    tooltip: 'How much the edges are eaten away into separate pieces',
  },
  {
    id: 'field.erodeOverLife',
    label: 'Tear-off over life',
    group: 'Breakup',
    type: 'curve',
    yMin: 0,
    yMax: 4,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Multiplies Tear-off across the life (rise to 3–4 to burn the shape away)',
  },
  {
    id: 'field.swirl',
    label: 'Inner swirls',
    group: 'Colour bands',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    tooltip: 'Swirly inner shapes in the colour bands (0 = bands follow the outline)',
  },
  {
    id: 'field.cool',
    label: 'Cooling',
    group: 'Colour bands',
    type: 'float',
    min: 0,
    max: 3,
    step: 0.01,
    default: 0.8,
    tooltip: 'How quickly it darkens away from the hot core',
  },
];

/** @param {Record<string, any>} v */
export const readFieldParams = (v) => ({
  form: v['field.form'] ?? 'flame',
  width: v['field.width'],
  height: v['field.height'],
  warp: v['field.warp'],
  scale: v['field.scale'],
  speed: v['field.speed'],
  bend: v['field.bend'] ?? 0,
  bendWaves: v['field.bendWaves'] ?? 1,
  bendTravel: v['field.bendTravel'] ?? 1,
  lean: v['field.lean'] ?? 0,
  curl: v['field.curl'] ?? 0,
  curlHeight: v['field.curlHeight'] ?? 0.85,
  curlSize: v['field.curlSize'] ?? 0.45,
  erode: v['field.erode'],
  erodeOverLife: v['field.erodeOverLife'],
  swirl: v['field.swirl'],
  cool: v['field.cool'],
});

/** @param {number} seed */
function noisesFor(seed) {
  let n = noiseCache.get(seed);
  if (!n) {
    n = [createNoise(hash32(seed, 1)), createNoise(hash32(seed, 2))];
    if (noiseCache.size >= NOISE_CACHE_MAX) noiseCache.delete(noiseCache.keys().next().value);
    noiseCache.set(seed, n);
  }
  return n;
}

/**
 * Local extent of the field around its pivot, effect px: [minX, minY, maxX, maxY].
 * @param {ReturnType<typeof readFieldParams>} p
 */
export function fieldBounds(p) {
  const m = 1 + MARGIN * Math.min(1, p.warp);
  if (p.form === 'ball')
    return [-p.width * m * 1.2, -p.width * m * 1.2, p.width * m * 1.2, p.width * m * 1.2];
  return [
    -p.width * m * 1.3,
    -p.height * (1 + MARGIN * 0.3),
    p.width * m * 1.3,
    p.height * FLAME_BASE * 1.2,
  ];
}

/**
 * The field at one local point. f > 0 is inside; heat 0 (cold edge) … 1 (white core).
 * @param {ReturnType<typeof readFieldParams>} p
 * @param {[import('../core/noise.js').Noise, import('../core/noise.js').Noise]} noises
 * @param {number} x local effect px (y down, pivot at 0)
 * @param {number} y
 * @param {number} T flow time (seconds × rise speed)
 * @param {number} erosion erode × erode-over-life now
 * @returns {{ f: number, heat: number }}
 */
export function fieldAt(p, noises, x, y, T, erosion) {
  const [A, B] = noises;
  const s = p.scale;
  const n = (
    /** @type {any} */ N,
    /** @type {number} */ a,
    /** @type {number} */ b,
    /** @type {number} */ c,
  ) =>
    N.noise3D(a, b, c) * (1 - OCTAVE2_WEIGHT) +
    N.noise3D(a * OCTAVE2_FREQ, b * OCTAVE2_FREQ, c * 1.3) * OCTAVE2_WEIGHT;

  const ball = p.form === 'ball';
  // Normalised coordinates: u across, v up (flame: 0 at base → 1 at the tip; ball: centred).
  let u0 = x / p.width;
  let v = ball ? -y / p.width : -y / p.height;

  // Art-directed flow shape (before the noise): S-bend + lean bend the flame, curl twists it.
  if (!ball) {
    const hb = Math.max(0, v);
    const wave = 2 * Math.PI * p.bendWaves * (hb - T * p.bendTravel * BEND_TRAVEL_RATE);
    u0 -= p.bend * hb * Math.sin(wave) + p.lean * hb * hb;
  }
  if (p.curl !== 0) {
    // Vortex: rotation strongest at the centre, fading out over curlSize (Gaussian).
    const cy = p.curlHeight;
    const dx = u0;
    const dy = v - cy;
    const a = p.curl * Math.exp(-(dx * dx + dy * dy) / (p.curlSize * p.curlSize));
    const c = Math.cos(a);
    const sn = Math.sin(a);
    u0 = dx * c - dy * sn;
    v = cy + dx * sn + dy * c;
  }
  // "Height" drives how much warp/erosion/cooling applies: up the flame, or out from the ball.
  const h = ball ? Math.hypot(u0, v) : Math.max(0, v);

  const k = p.warp * (ball ? 0.2 + 0.5 * h : 0.25 + h);
  const sx = u0 * s;
  const sy = v * s - T;
  const ax = n(A, sx, sy, T * 0.45);
  const ay = n(B, sx + 3, sy, T * 0.45);
  const bx = n(A, sx + ax * WARP_FEED + 7, sy + ay * WARP_FEED - T * 0.33, T * 0.55);
  const by = n(B, sx + ax * WARP_FEED + 11, sy + ay * WARP_FEED - T * 0.33, T * 0.55);
  const wu = u0 + bx * k;
  const wv = v + by * k * 0.6;

  let body;
  if (ball) {
    body = 1 - Math.hypot(wu, wv);
  } else {
    const r = 0.85 * Math.max(0, 1 - wv * 0.95) ** FLAME_NARROW + 0.02;
    const dy = v < FLAME_BASE ? (FLAME_BASE - v) * 1.4 : 0;
    body = 1 - Math.hypot(wu / r, dy / 0.7);
  }
  const e = n(A, wu * 1.6 * s + 20, wv * 1.6 * s - T * 1.2, T * 0.7) * 0.5 + 0.5;
  const f = body - e * erosion * (ball ? 0.25 + h : h ** 1.2);
  const sw = B.noise3D(wu * 1.3 * s + 40, wv * 1.3 * s - T * 1.1, T) * p.swirl;
  const heat = HEAT_BIAS + f * HEAT_GAIN + sw - h * p.cool;
  return { f, heat };
}

/**
 * Ramp position for a heat value: hot (1) → ramp start, cold (≤0) → ramp end, shifted along the
 * ramp by `shift` (ramp over life).
 * @param {number} heat @param {number} shift
 */
export const heatToRampPos = (heat, shift) =>
  Math.min(1, Math.max(0, (1 - Math.min(1, Math.max(0, heat))) * (1 - shift) + shift));

/**
 * Paint one field instance into ctx (current transform = the instance's), per pixel.
 * Composites over what is already there (source-over), honouring ctx.globalAlpha.
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReturnType<typeof readFieldParams>} p
 * @param {{ ramp: any[], bands: number, snap: boolean, shift: number }} look
 * @param {{ seed: number, age: number, seconds: number }} inst  seconds: time since effect start
 */
export function paintField(ctx, p, look, inst) {
  const m = ctx.getTransform();
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  // Device-space box of the field.
  const [x0, y0, x1, y1] = fieldBounds(p);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lx, ly] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ]) {
    const dx = m.a * lx + m.c * ly + m.e;
    const dy = m.b * lx + m.d * ly + m.f;
    minX = Math.min(minX, dx);
    minY = Math.min(minY, dy);
    maxX = Math.max(maxX, dx);
    maxY = Math.max(maxY, dy);
  }
  const bx = Math.max(0, Math.floor(minX));
  const by = Math.max(0, Math.floor(minY));
  const bw = Math.min(W, Math.ceil(maxX)) - bx;
  const bh = Math.min(H, Math.ceil(maxY)) - by;
  if (bw <= 0 || bh <= 0) return;

  const inv = m.inverse();
  const noises = noisesFor(inst.seed);
  const T = inst.seconds * p.speed;
  const erosion = p.erode * evalCurve(p.erodeOverLife, inst.age);

  // Coarse grid of (f, ramp position).
  const gw = Math.ceil(bw / GRID_PX) + 2;
  const gh = Math.ceil(bh / GRID_PX) + 2;
  const gf = new Float32Array(gw * gh);
  const gp = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const dx = bx + i * GRID_PX;
      const dy = by + j * GRID_PX;
      const lx = inv.a * dx + inv.c * dy + inv.e;
      const ly = inv.b * dx + inv.d * dy + inv.f;
      const { f, heat } = fieldAt(p, noises, lx, ly, T, erosion);
      gf[j * gw + i] = f;
      gp[j * gw + i] = heatToRampPos(heat, look.shift);
    }
  }

  const bands = look.bands;
  /** Colour at a ramp position, quantised into bands (0 = smooth). @param {number} pos */
  const colourAt = (pos) => {
    if (bands <= 0) return sampleRamp(look.ramp, pos);
    const q = Math.min(bands - 1, Math.floor(pos * bands));
    const c = (q + 0.5) / bands;
    return look.snap ? nearestStopColor(look.ramp, c) : sampleRamp(look.ramp, c);
  };
  // Band colours are few: precompute them.
  const bandColours =
    bands > 0 ? Array.from({ length: bands }, (_, q) => colourAt((q + 0.5) / bands)) : [];

  // Cells where the 2-px grid can't follow the field (strong swirl / curl twist it faster than
  // the grid): compare the field at the cell centre with what bilinear interpolation guesses.
  // Those cells are supersampled per pixel instead (fix for "pixelated" swirls, 3.8).
  const cw = gw - 1;
  const ch = gh - 1;
  const complex = new Uint8Array(cw * ch);
  const bandsN = Math.max(1, look.bands);
  for (let j = 0; j < ch; j++) {
    for (let i = 0; i < cw; i++) {
      const k = j * gw + i;
      const f00 = gf[k];
      const f10 = gf[k + 1];
      const f01 = gf[k + gw];
      const f11 = gf[k + gw + 1];
      if (Math.max(f00, f10, f01, f11) < MIN_FIELD - 0.2) continue; // far outside
      const dx = bx + (i + 0.5) * GRID_PX;
      const dy = by + (j + 0.5) * GRID_PX;
      const lx = inv.a * dx + inv.c * dy + inv.e;
      const ly = inv.b * dx + inv.d * dy + inv.f;
      const c = fieldAt(p, noises, lx, ly, T, erosion);
      const fBil = (f00 + f10 + f01 + f11) / 4;
      const pBil = (gp[k] + gp[k + 1] + gp[k + gw] + gp[k + gw + 1]) / 4;
      const pc = heatToRampPos(c.heat, look.shift);
      // field error in "pixels of edge travel", ramp error in bands
      const fRange =
        Math.max(Math.abs(f10 - f00), Math.abs(f01 - f00), Math.abs(f11 - f00)) || 1e-6;
      const edgeNear =
        Math.min(Math.abs(c.f - MIN_FIELD), Math.abs(fBil - MIN_FIELD)) < fRange * 1.5;
      const fBad = edgeNear && Math.abs(c.f - fBil) > fRange * 0.25;
      const pBad = Math.abs(pc - pBil) * bandsN > 0.2;
      const pSpan =
        (Math.max(gp[k], gp[k + 1], gp[k + gw], gp[k + gw + 1]) -
          Math.min(gp[k], gp[k + 1], gp[k + gw], gp[k + gw + 1])) *
        bandsN;
      if (fBad || pBad || pSpan > 1.5) complex[j * cw + i] = 1;
    }
  }
  /** Band (or smooth) colour for a ramp position, no edge blending (used when supersampling). @param {number} pos */
  const plainColour = (pos) =>
    bands > 0 ? bandColours[Math.min(bands - 1, Math.floor(pos * bands))] : colourAt(pos);
  // 2×2 rotated-grid offsets, then 5 more when the first four disagree (9 total).
  const SS1 = [
    [-0.375, -0.125],
    [0.125, -0.375],
    [0.375, 0.125],
    [-0.125, 0.375],
  ];
  const SS2 = [
    [0, 0],
    [-0.3, 0.3],
    [0.3, -0.3],
    [-0.3, -0.3],
    [0.3, 0.3],
  ];

  const img = ctx.getImageData(bx, by, bw, bh);
  const d = img.data;
  const alpha = ctx.globalAlpha;
  /** Accumulate one supersample; returns the sample's band id (−1 = outside). */
  let accR = 0;
  let accG = 0;
  let accB = 0;
  let accA = 0;
  const sample = (/** @type {number} */ dx, /** @type {number} */ dy) => {
    const lx = inv.a * dx + inv.c * dy + inv.e;
    const ly = inv.b * dx + inv.d * dy + inv.f;
    const r = fieldAt(p, noises, lx, ly, T, erosion);
    if (r.f <= MIN_FIELD) return -1;
    const pos = heatToRampPos(r.heat, look.shift);
    const c = plainColour(pos);
    const w = c[3] / 255;
    accR += c[0] * w;
    accG += c[1] * w;
    accB += c[2] * w;
    accA += w;
    return bands > 0 ? Math.min(bands - 1, Math.floor(pos * bands)) : Math.round(pos * 64);
  };
  for (let py = 0; py < bh; py++) {
    const gy = py / GRID_PX;
    const j = Math.floor(gy);
    const ty = gy - j;
    for (let px = 0; px < bw; px++) {
      const gx = px / GRID_PX;
      const i = Math.floor(gx);
      const tx = gx - i;
      if (complex[j * cw + i]) {
        // Supersample this pixel from the field itself.
        accR = 0;
        accG = 0;
        accB = 0;
        accA = 0;
        const cx = bx + px + 0.5;
        const cy = by + py + 0.5;
        let first = -2;
        let mixed = false;
        for (const [ox, oy] of SS1) {
          const id = sample(cx + ox, cy + oy);
          if (first === -2) first = id;
          else if (id !== first) mixed = true;
        }
        let n = SS1.length;
        if (mixed) {
          for (const [ox, oy] of SS2) sample(cx + ox, cy + oy);
          n += SS2.length;
        }
        if (accA <= 0) continue;
        const srcA = (accA / n) * alpha;
        const o = (py * bw + px) * 4;
        const da = d[o + 3] / 255;
        const oa = srcA + da * (1 - srcA);
        const kd = (da * (1 - srcA)) / oa;
        const ks = srcA / oa;
        d[o] = (accR / accA) * ks + d[o] * kd;
        d[o + 1] = (accG / accA) * ks + d[o + 1] * kd;
        d[o + 2] = (accB / accA) * ks + d[o + 2] * kd;
        d[o + 3] = oa * 255;
        continue;
      }
      const k00 = j * gw + i;
      const k10 = k00 + 1;
      const k01 = k00 + gw;
      const k11 = k01 + 1;
      const f00 = gf[k00];
      const f10 = gf[k10];
      const f01 = gf[k01];
      const f11 = gf[k11];
      // No edge in this cell when every corner is outside (the field can drop off steeply, so
      // the gradient-based anti-aliasing alone would paint phantom edges there).
      if (Math.max(f00, f10, f01, f11) <= MIN_FIELD) continue;
      const fTop = f00 + (f10 - f00) * tx;
      const fBot = f01 + (f11 - f01) * tx;
      const f = fTop + (fBot - fTop) * ty - MIN_FIELD;
      // Field change per output pixel (for 1-px anti-aliasing of the silhouette).
      const dfx = (f10 - f00 + f11 - f01) / (2 * GRID_PX);
      const dfy = (f01 - f00 + f11 - f10) / (2 * GRID_PX);
      const fw = Math.hypot(dfx, dfy) || 1e-6;
      const cover = Math.min(1, Math.max(0, f / fw + 0.5));
      if (cover <= 0) continue;

      const p00 = gp[k00];
      const p10 = gp[k10];
      const p01 = gp[k01];
      const p11 = gp[k11];
      const pTop = p00 + (p10 - p00) * tx;
      const pBot = p01 + (p11 - p01) * tx;
      const pos = pTop + (pBot - pTop) * ty;

      let r;
      let g;
      let b;
      let a;
      if (bands > 0) {
        // Hard band with a 1-px anti-aliased edge toward the nearest neighbouring band.
        const scaled = pos * bands;
        const q = Math.min(bands - 1, Math.floor(scaled));
        const c = bandColours[q];
        const frac = scaled - q;
        const dpx = (p10 - p00 + p11 - p01) / (2 * GRID_PX);
        const dpy = (p01 - p00 + p11 - p10) / (2 * GRID_PX);
        const pw = Math.hypot(dpx, dpy) * bands || 1e-6;
        const toLow = frac / pw; // px to the edge with band q − 1
        const toHigh = (1 - frac) / pw; // px to the edge with band q + 1
        let mixWith = -1;
        let w = 0;
        if (toLow < 0.5 && q > 0) {
          mixWith = q - 1;
          w = 0.5 - toLow;
        } else if (toHigh < 0.5 && q < bands - 1) {
          mixWith = q + 1;
          w = 0.5 - toHigh;
        }
        if (mixWith >= 0) {
          const o = bandColours[mixWith];
          r = c[0] + (o[0] - c[0]) * w;
          g = c[1] + (o[1] - c[1]) * w;
          b = c[2] + (o[2] - c[2]) * w;
          a = c[3] + (o[3] - c[3]) * w;
        } else {
          [r, g, b, a] = c;
        }
      } else {
        [r, g, b, a] = colourAt(pos);
      }

      // Source-over onto the existing pixel (straight alpha).
      const sa = (a / 255) * cover * alpha;
      if (sa <= 0) continue;
      const o = (py * bw + px) * 4;
      const da = d[o + 3] / 255;
      const oa = sa + da * (1 - sa);
      const kd = (da * (1 - sa)) / oa;
      const ks = sa / oa;
      d[o] = r * ks + d[o] * kd;
      d[o + 1] = g * ks + d[o + 1] * kd;
      d[o + 2] = b * ks + d[o + 2] * kd;
      d[o + 3] = oa * 255;
    }
  }
  ctx.putImageData(img, bx, by);
}
