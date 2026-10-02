// @ts-check
/**
 * Bolt (Lightning family, D-070): a jagged, branching lightning bolt drawn as crisp cel bands —
 * a wide halo band and a hot core band, both tapering toward the tip — that RE-STRIKES (takes a
 * new random shape) several times a second, like hand-animated lightning.
 *
 * Geometry: from the layer origin to the end point (or along the layer's own open pen path),
 * offsets come from 1-D midpoint displacement, so the bolt is jagged at every scale. Several
 * bolts can fan out (Count + Spread: a radial discharge); branches split off the main stroke.
 * Pure + deterministic: shape = f(seed, strike index).
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { subSeed } from '../core/hash.js';
import { createRng } from '../core/prng.js';
import { pointOnPath } from '../effects/followPath.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition } from '../render/style.js';

const G = 'Bolt';

/** Bolt parameters (ids `bolt.*`). Defaults are provisional [Raul]. */
export const BOLT_PARAMS = [
  {
    id: 'bolt.endX',
    label: 'End X',
    group: G,
    type: 'float',
    min: -1024,
    max: 1024,
    step: 1,
    default: 0,
    unit: 'px',
    tooltip:
      'Where the bolt ends, from the layer’s origin (ignored when the layer has an open pen path: the bolt follows it)',
  },
  {
    id: 'bolt.endY',
    label: 'End Y',
    group: G,
    type: 'float',
    min: -1024,
    max: 1024,
    step: 1,
    default: 260,
    unit: 'px',
  },
  {
    id: 'bolt.count',
    label: 'Bolts',
    group: G,
    type: 'int',
    min: 1,
    max: 24,
    step: 1,
    default: 1,
    tooltip: 'Several bolts fanning out from the origin (see Spread)',
  },
  {
    id: 'bolt.spread',
    label: 'Spread',
    group: G,
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: 'Fan angle of several bolts (360 = all around: a radial discharge)',
  },
  {
    id: 'bolt.lengthVariance',
    label: 'Length variance',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
  },
  {
    id: 'bolt.jag',
    label: 'Jaggedness',
    group: G,
    type: 'float',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.32,
  },
  {
    id: 'bolt.detail',
    label: 'Detail',
    group: G,
    type: 'int',
    min: 1,
    max: 8,
    step: 1,
    default: 5,
    tooltip: 'Zig-zag levels (each doubles the kinks)',
  },
  {
    id: 'bolt.branches',
    label: 'Branches',
    group: G,
    type: 'int',
    min: 0,
    max: 16,
    step: 1,
    default: 3,
  },
  {
    id: 'bolt.branchLength',
    label: 'Branch length',
    group: G,
    type: 'float',
    min: 0.05,
    max: 1,
    step: 0.01,
    default: 0.35,
  },
  {
    id: 'bolt.branchAngle',
    label: 'Branch angle',
    group: G,
    type: 'float',
    min: 0,
    max: 90,
    step: 1,
    default: 35,
    unit: '°',
  },
  {
    id: 'bolt.width',
    label: 'Core width',
    group: G,
    type: 'float',
    min: 0.5,
    max: 64,
    step: 0.5,
    default: 5,
    unit: 'px',
  },
  {
    id: 'bolt.halo',
    label: 'Halo width',
    group: G,
    type: 'float',
    min: 0,
    max: 8,
    step: 0.1,
    default: 2.6,
    unit: '×',
    tooltip: 'Outer band, as a multiple of the core (0 = core only)',
  },
  {
    id: 'bolt.taper',
    label: 'Taper',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.7,
    tooltip: 'How much thinner the tip is than the root',
  },
  {
    id: 'bolt.restrike',
    label: 'Re-strikes / s',
    group: G,
    type: 'float',
    min: 0,
    max: 60,
    step: 0.5,
    default: 12,
    tooltip:
      'New bolt shape this many times a second (0 = one shape). Loops: rounded to a whole number per loop.',
  },
  {
    id: 'bolt.flicker',
    label: 'Flicker',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    tooltip: 'Some strikes are dimmer (or gone, at 1)',
  },
  {
    id: 'bolt.reveal',
    label: 'Reveal over life',
    group: G,
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'How much of the bolt is drawn, from root to tip, over its life (grow-in strikes)',
  },
];

/** @param {Record<string, any>} v */
export const readBoltParams = (v) => ({
  endX: v['bolt.endX'],
  endY: v['bolt.endY'],
  count: v['bolt.count'],
  spread: v['bolt.spread'],
  lengthVariance: v['bolt.lengthVariance'],
  jag: v['bolt.jag'],
  detail: v['bolt.detail'],
  branches: v['bolt.branches'],
  branchLength: v['bolt.branchLength'],
  branchAngle: v['bolt.branchAngle'],
  width: v['bolt.width'],
  halo: v['bolt.halo'],
  taper: v['bolt.taper'],
  restrike: v['bolt.restrike'],
  flicker: v['bolt.flicker'],
  reveal: v['bolt.reveal'],
});
/** @typedef {ReturnType<typeof readBoltParams>} BoltParams */

/**
 * Which strike is showing (a new shape per strike). Loops repeat a whole number per period.
 * @param {number} restrike per second @param {number} seconds
 * @param {{ loop?: boolean, frameCount: number, fps: number }} [timing]
 */
export function strikeIndex(restrike, seconds, timing) {
  if (restrike <= 0) return 0;
  if (timing?.loop) {
    const P = timing.frameCount / timing.fps;
    const n = Math.max(1, Math.round(restrike * P));
    const s = seconds - Math.floor(seconds / P) * P;
    return Math.min(n - 1, Math.floor((s / P) * n + 1e-9));
  }
  return Math.floor(seconds * restrike + 1e-9);
}

/**
 * 1-D midpoint displacement: `2^levels + 1` offsets (fractions of the length), 0 at both ends.
 * @param {ReturnType<typeof createRng>} rng @param {number} levels @param {number} jag
 */
function displacement(rng, levels, jag) {
  const n = 2 ** levels;
  const d = new Float64Array(n + 1);
  let step = n;
  let amp = jag;
  while (step > 1) {
    const half = step / 2;
    for (let i = half; i < n; i += step) {
      d[i] = (d[i - half] + d[i + half]) / 2 + (rng.next() - 0.5) * 2 * amp * (step / n);
    }
    step = half;
    amp *= 0.9;
  }
  return d;
}

/**
 * Polylines of one strike, in layer px: the main bolts first, then branches. Each point has a
 * width factor w (1 at the root → 1 − taper at the tip).
 * @param {BoltParams} p @param {number} seed
 * @param {import('../render/masks.js').Mask | null} [path] open pen path to follow
 * @returns {{ pts: { x: number, y: number, w: number }[], branch: boolean }[]}
 */
export function boltLines(p, seed, path = null) {
  const rng = createRng(seed);
  /** @type {{ pts: { x: number, y: number, w: number }[], branch: boolean }[]} */
  const out = [];
  const levels = Math.max(1, Math.min(8, Math.round(p.detail)));
  const len0 = Math.hypot(p.endX, p.endY);
  const dir0 = Math.atan2(p.endY, p.endX);
  const count = path ? 1 : Math.max(1, Math.round(p.count));
  for (let b = 0; b < count; b++) {
    const d = displacement(rng, levels, p.jag);
    const n = d.length - 1;
    /** @type {{ x: number, y: number, w: number }[]} */
    const pts = [];
    let L = len0;
    if (path) {
      // along the pen path: offsets along its normal
      const total = pathLength(path);
      L = total;
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        const q = pointOnPath(path, u);
        if (!q) break;
        const nx = -Math.sin(q.angle);
        const ny = Math.cos(q.angle);
        pts.push({ x: q.x + nx * d[i] * L, y: q.y + ny * d[i] * L, w: 1 - p.taper * u });
      }
    } else {
      const fan = count > 1 ? ((b + 0.5) / count - 0.5) * p.spread : 0;
      const a =
        dir0 +
        ((fan + (count > 1 ? (rng.next() - 0.5) * (p.spread / count) * 0.6 : 0)) * Math.PI) / 180;
      L = len0 * (1 - p.lengthVariance * rng.next() * (count > 1 ? 1 : 0));
      const ex = Math.cos(a) * L;
      const ey = Math.sin(a) * L;
      const nx = -Math.sin(a);
      const ny = Math.cos(a);
      for (let i = 0; i <= n; i++) {
        const u = i / n;
        pts.push({ x: ex * u + nx * d[i] * L, y: ey * u + ny * d[i] * L, w: 1 - p.taper * u });
      }
    }
    if (pts.length < 2) continue;
    out.push({ pts, branch: false });
    // branches split off this bolt
    for (let k = 0; k < Math.round(p.branches); k++) {
      const at = 0.15 + rng.next() * 0.65;
      const i0 = Math.min(pts.length - 2, Math.floor(at * (pts.length - 1)));
      const a0 = pts[i0];
      const a1 = pts[i0 + 1];
      const side = rng.sign();
      const ang =
        Math.atan2(a1.y - a0.y, a1.x - a0.x) +
        (side * p.branchAngle * (0.6 + rng.next() * 0.8) * Math.PI) / 180;
      const bl = L * p.branchLength * (0.5 + rng.next() * 0.5);
      const bd = displacement(rng, Math.max(1, levels - 1), p.jag * 1.2);
      const bn = bd.length - 1;
      const ex = Math.cos(ang) * bl;
      const ey = Math.sin(ang) * bl;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      /** @type {{ x: number, y: number, w: number }[]} */
      const bp = [];
      for (let i = 0; i <= bn; i++) {
        const u = i / bn;
        bp.push({
          x: a0.x + ex * u + nx * bd[i] * bl,
          y: a0.y + ey * u + ny * bd[i] * bl,
          w: a0.w * 0.6 * (1 - 0.8 * u),
        });
      }
      out.push({ pts: bp, branch: true });
    }
  }
  return out;
}

/** @param {import('../render/masks.js').Mask} m */
function pathLength(m) {
  let total = 0;
  let prev = pointOnPath(m, 0);
  for (let i = 1; i <= 32; i++) {
    const q = pointOnPath(m, i / 32);
    if (prev && q) total += Math.hypot(q.x - prev.x, q.y - prev.y);
    prev = q;
  }
  return total;
}

/**
 * Paint one bolt (all its strokes) around (0, 0) in cel bands: halo, then core.
 * @param {CanvasRenderingContext2D} ctx
 * @param {BoltParams} p
 * @param {import('../render/style.js').Style} style
 * @param {{ age: number, seed: number, seconds: number, timing?: any, path?: any }} o
 */
export function paintBolt(ctx, p, style, o) {
  const k = strikeIndex(p.restrike, o.seconds, o.timing);
  const seed = subSeed(o.seed, 'strike', k);
  const fr = createRng(subSeed(seed, 'flicker'));
  const dim = 1 - p.flicker * fr.next();
  if (dim <= 0.02) return;
  const reveal = Math.min(1, Math.max(0, evalCurve(p.reveal, o.age)));
  if (reveal <= 0) return;
  const lines = boltLines(p, seed, o.path);
  const core = corePosition(style, o.age);
  const coreCol = toCss(sampleRamp(style.ramp, core));
  const haloCol = toCss(sampleRamp(style.ramp, Math.min(1, core + style.spread)));
  ctx.save();
  ctx.globalAlpha *= dim;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const passes =
    p.halo > 0
      ? [
          [haloCol, p.width * p.halo],
          [coreCol, p.width],
        ]
      : [[coreCol, p.width]];
  for (const [color, width] of passes) {
    ctx.strokeStyle = /** @type {string} */ (color);
    for (const line of lines) {
      const pts = line.pts;
      const last = Math.max(1, Math.floor(reveal * (pts.length - 1)));
      for (let i = 0; i < last; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        ctx.lineWidth = Math.max(0.5, /** @type {number} */ (width) * (a.w + b.w) * 0.5);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}
