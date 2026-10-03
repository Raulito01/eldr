// @ts-check
/**
 * Vortex (D-115): spiral arms turning around a centre — the heart of portals, black holes and
 * dark orbs. Each arm is a tapered STRIP (like the crescent, with cel bands and a hot edge) along
 * a spiral from the inner radius out to the outer one.
 *
 * - **Flat**: the spiral lies in a plane; Tilt lays it down (a portal on the ground), the
 *   perspective squashes it like the orbit plane.
 * - **Sphere**: the arms wrap a ball from pole to pole (ribbons around a dark orb); Tilt leans
 *   the ball toward you.
 * - Side: draw the near half, the far half or both, so a core or glass can sit between them.
 * - Break-up: noise pinches the arms into streaks, and flows along them (inward or outward).
 * - Loops: the spin is rounded to whole turns per loop and the noise cross-fades (D-071).
 *
 * v runs along an arm: 0 = inner end, 1 = outer end.
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { loopedNoise, loopRate } from '../core/loopContext.js';
import { smoothstep } from '../core/math.js';
import { createNoise } from '../core/noise.js';
import { bandPositions, nearestStopColor } from '../render/celshade.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition } from '../render/style.js';
import { crescentProfile, stripOutline } from './crescent.js';

const G = 'Vortex';
const DEG = Math.PI / 180;
/** Samples along one arm. */
const SAMPLES = 120;
const STEP = 1e-3;

/**
 * @param {string} key @param {string} label @param {number} min @param {number} max
 * @param {number} step @param {number} def @param {string} tooltip @param {string} [unit]
 */
const num = (key, label, min, max, step, def, tooltip, unit) => ({
  id: `vortex.${key}`,
  label,
  group: G,
  type: 'float',
  min,
  max,
  step,
  default: def,
  ...(unit ? { unit } : {}),
  tooltip,
});

/** Vortex parameters (ids `vortex.*`). Defaults are a first pass [Raul]. */
export const VORTEX_PARAMS = [
  {
    id: 'vortex.form',
    label: 'Form',
    group: G,
    type: 'enum',
    options: [
      { value: 'flat', label: 'Flat (a spiral in a plane)' },
      { value: 'sphere', label: 'Sphere (ribbons around a ball)' },
    ],
    default: 'flat',
    tooltip: 'Flat: a whirlpool you can lay down with Tilt. Sphere: arms wrap a ball pole to pole',
  },
  {
    id: 'vortex.arms',
    label: 'Arms',
    group: G,
    type: 'int',
    min: 1,
    max: 16,
    step: 1,
    default: 3,
    tooltip: 'How many spiral arms (evenly spaced)',
  },
  num('radius', 'Radius', 4, 1024, 1, 120, 'Outer radius (sphere: the ball radius)', 'px'),
  num(
    'inner',
    'Inner radius',
    0,
    0.95,
    0.01,
    0.12,
    'Where the arms start, as a share of the radius (sphere: how close to the poles they reach)',
  ),
  num('twist', 'Twist', -4, 4, 0.05, 1.1, 'Turns each arm winds from its inner to its outer end'),
  num('width', 'Arm width', 1, 256, 0.5, 26, 'Thickest width of an arm', 'px'),
  num('balance', 'Fat end', -1, 1, 0.01, 0.2, '−1: thick at the centre … +1: thick at the rim'),
  num('sharpness', 'Tip sharpness', 0, 1, 0.01, 0.6, '0: rounded ends … 1: needle tips'),
  num(
    'hotEdge',
    'Hot edge',
    -1,
    1,
    0.01,
    0.5,
    'Pushes the bright bands to the leading (+) or trailing (−) edge',
  ),
  num(
    'speed',
    'Spin',
    -4,
    4,
    0.01,
    0.4,
    'Turns per second (negative: the other way). Loops round it to whole turns',
    'turns/s',
  ),
  num(
    'variance',
    'Arm variance',
    0,
    1,
    0.01,
    0.3,
    'Each arm a bit different: length, width, spacing',
  ),
  num(
    'breakup',
    'Break-up',
    0,
    1,
    0.01,
    0.25,
    'Noise pinches the arms into streaks (0: whole arms)',
  ),
  num('breakupSize', 'Break-up detail', 0.2, 12, 0.1, 3, 'How many pinches along an arm'),
  num(
    'flow',
    'Flow',
    -6,
    6,
    0.05,
    -1,
    'The break-up runs along the arms: negative sucks inward, positive spills out',
  ),
  {
    id: 'vortex.widthOverLife',
    label: 'Width over life',
    group: G,
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Arm width over the layer’s life (thick → thin, or growing in)',
  },
  {
    id: 'vortex.reveal',
    label: 'Reveal over life',
    group: G,
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'How much of each arm shows, from the outer end inward (0 = nothing, 1 = whole arm)',
  },
  num(
    'tilt',
    'Tilt',
    0,
    89,
    1,
    0,
    'Flat: lays the spiral down (portal on the ground). Sphere: leans the ball toward you',
    '°',
  ),
  num('planeAngle', 'Plane angle', -180, 180, 1, 0, 'Turns the tilted plane on screen', '°'),
  {
    id: 'vortex.side',
    label: 'Side',
    group: G,
    type: 'enum',
    options: [
      { value: 'both', label: 'Both' },
      { value: 'front', label: 'Near side only' },
      { value: 'back', label: 'Far side only' },
    ],
    default: 'both',
    tooltip: 'Draw only the near or far half (put a core or glass between two copies)',
  },
  num(
    'depthShade',
    'Far side darker',
    0,
    1,
    0.01,
    0.35,
    'Moves the far side along the colour ramp',
  ),
];

/** @param {Record<string, any>} v */
export const readVortexParams = (v) => ({
  form: /** @type {'flat'|'sphere'} */ (v['vortex.form'] ?? 'flat'),
  arms: Math.max(1, Math.round(v['vortex.arms'] ?? 3)),
  radius: v['vortex.radius'] ?? 120,
  inner: v['vortex.inner'] ?? 0.12,
  twist: v['vortex.twist'] ?? 1.1,
  width: v['vortex.width'] ?? 26,
  balance: v['vortex.balance'] ?? 0.2,
  sharpness: v['vortex.sharpness'] ?? 0.6,
  hotEdge: v['vortex.hotEdge'] ?? 0.5,
  speed: v['vortex.speed'] ?? 0.4,
  variance: v['vortex.variance'] ?? 0.3,
  breakup: v['vortex.breakup'] ?? 0.25,
  breakupSize: v['vortex.breakupSize'] ?? 3,
  flow: v['vortex.flow'] ?? -1,
  widthOverLife: v['vortex.widthOverLife'],
  reveal: v['vortex.reveal'],
  tilt: v['vortex.tilt'] ?? 0,
  planeAngle: v['vortex.planeAngle'] ?? 0,
  side: /** @type {'both'|'front'|'back'} */ (v['vortex.side'] ?? 'both'),
  depthShade: v['vortex.depthShade'] ?? 0.35,
});

/** @typedef {ReturnType<typeof readVortexParams>} VortexParams */

/** Small deterministic hash → 0–1. @param {number} seed @param {number} i */
const rand = (seed, i) => {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * One arm as a sampler of screen points (x, y), screen normal and half-width, plus depth.
 * @param {VortexParams} p @param {number} arm @param {{ seed: number, t: number, seconds: number, age: number }} o
 */
export function vortexArm(p, arm, o) {
  const reveal = Math.min(1, Math.max(0, evalCurve(p.reveal, o.age)));
  const life = Math.max(0, evalCurve(p.widthOverLife, o.age));
  if (reveal <= 1e-4 || life <= 0) return null;
  const vr = p.variance;
  const r0 = rand(o.seed, arm * 3);
  const r1 = rand(o.seed, arm * 3 + 1);
  const r2 = rand(o.seed, arm * 3 + 2);
  const len = 1 - vr * 0.45 * r0; // shorter arms start further out
  const thick = (p.width / 2) * life * (1 - vr * 0.5 * r1);
  const spin = loopRate(p.speed) * o.seconds * 2 * Math.PI;
  const phase =
    (arm / p.arms) * 2 * Math.PI + vr * (r2 - 0.5) * ((2 * Math.PI) / p.arms) * 0.8 + spin;
  const noise = p.breakup > 0 ? createNoise((o.seed + arm * 7919) | 0) : null;
  const cosT = Math.cos(p.tilt * DEG);
  const sinT = Math.sin(p.tilt * DEG);
  const cp = Math.cos(p.planeAngle * DEG);
  const sp = Math.sin(p.planeAngle * DEG);
  const R = p.radius;
  const vStart = 1 - reveal * len; // the arm shows from its outer end inward

  /** Screen point and depth (−1 far … +1 near) at v. @param {number} v @returns {[number, number, number]} */
  const at = (v) => {
    let x;
    let y;
    let depth;
    if (p.form === 'sphere') {
      const lat = (v - 0.5) * Math.PI * (1 - p.inner);
      const lon = phase + p.twist * 2 * Math.PI * v;
      const bx = R * Math.cos(lat) * Math.sin(lon);
      const by = R * Math.sin(lat);
      const bz = R * Math.cos(lat) * Math.cos(lon);
      x = bx;
      y = by * cosT - bz * sinT;
      depth = (by * sinT + bz * cosT) / R;
    } else {
      const r = R * (p.inner + (1 - p.inner) * v);
      const a = phase - p.twist * 2 * Math.PI * v;
      const px = r * Math.cos(a);
      const py = r * Math.sin(a);
      x = px;
      y = py * cosT;
      depth = (py / R) * sinT;
    }
    return [x * cp - y * sp, x * sp + y * cp, depth];
  };

  return {
    vStart,
    /** @param {number} v */
    depth: (v) => at(v)[2],
    /** @param {number} v @returns {import('./crescent.js').StripSample} */
    sample(v) {
      const [x, y, d] = at(v);
      const [x0, y0] = at(Math.max(0, v - STEP));
      const [x1, y1] = at(Math.min(1, v + STEP));
      const tx = x1 - x0;
      const ty = y1 - y0;
      const tl = Math.hypot(tx, ty) || 1;
      const u = (v - vStart) / Math.max(1e-6, 1 - vStart);
      let hw = thick * crescentProfile(u, p.balance, p.sharpness);
      // perspective: the far side and the ball's limb are thinner
      hw *= p.form === 'sphere' ? 0.6 + 0.4 * Math.max(0, d) : 1 - 0.25 * Math.max(0, -d);
      if (noise) {
        const n = loopedNoise((z) => noise.noise2D(v * p.breakupSize - z, arm * 13.7), p.flow, o.t);
        const cut = p.breakup * 1.4 - 0.7;
        hw *= smoothstep(cut - 0.18, cut + 0.18, n);
      }
      return { x, y, nx: -ty / tl, ny: tx / tl, hw };
    },
  };
}

/** v intervals (over [v0, 1]) on the near (depth ≥ 0) or far side. @param {(v: number) => number} depth @param {number} v0 @param {'front'|'back'} side @returns {[number, number][]} */
function sideRanges(depth, v0, side) {
  /** @type {[number, number][]} */
  const out = [];
  const n = SAMPLES;
  let start = -1;
  for (let i = 0; i <= n; i++) {
    const v = v0 + ((1 - v0) * i) / n;
    const ok = side === 'front' ? depth(v) >= 0 : depth(v) < 0;
    if (ok && start < 0) start = v;
    if ((!ok || i === n) && start >= 0) {
      out.push([start, ok ? v : v - (1 - v0) / n / 2]);
      start = -1;
    }
  }
  return out.filter(([a, b]) => b - a > 1e-4);
}

/** Evenly spaced v's over [a, b]. @param {number} a @param {number} b */
const range = (a, b) => {
  const n = Math.max(2, Math.ceil(SAMPLES * (b - a)) + 1);
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
};

/** @param {CanvasRenderingContext2D} ctx @param {Float64Array} pts */
function tracePoly(ctx, pts) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}

/**
 * Paint the vortex: far halves first (shifted along the ramp), then near halves, each with
 * cel bands across the arm width pushed toward the hot edge.
 * @param {CanvasRenderingContext2D} ctx @param {VortexParams} p
 * @param {import('../render/style.js').Style} style
 * @param {{ age: number, seed: number, t: number, seconds: number }} inst
 */
export function paintVortex(ctx, p, style, inst) {
  const arms = [];
  for (let i = 0; i < p.arms; i++) {
    const a = vortexArm(p, i, inst);
    if (a) arms.push(a);
  }
  if (!arms.length) return;
  const core = corePosition(style, inst.age);
  const color = (/** @type {number} */ pos) =>
    toCss(style.snapColors ? nearestStopColor(style.ramp, pos) : sampleRamp(style.ramp, pos));
  const flat = p.form === 'flat' && p.tilt === 0;
  /** @type {('back'|'front')[]} */
  const sides = flat ? ['front'] : p.side === 'both' ? ['back', 'front'] : [p.side];
  for (const side of sides) {
    const shift = side === 'back' ? p.depthShade * 0.5 : 0;
    const c0 = Math.min(1, core + shift);
    const positions =
      style.bands >= 1
        ? bandPositions(Math.max(1, style.bands), c0, Math.min(1, c0 + style.spread))
        : [c0];
    const parts = arms.map((a) => ({
      a,
      ranges: (flat ? [[a.vStart, 1]] : sideRanges(a.depth, a.vStart, side)).map(([x, y]) =>
        range(x, y),
      ),
    }));
    positions.forEach((pos, i) => {
      ctx.fillStyle = color(pos);
      ctx.beginPath();
      for (const { a, ranges } of parts)
        for (const vs of ranges)
          tracePoly(ctx, stripOutline(a.sample, vs, 1 - i / positions.length, p.hotEdge));
      ctx.fill();
    });
  }
}
