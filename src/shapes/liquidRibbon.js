// @ts-check
/**
 * Liquid ribbon (D-108), after Raul's liquid "2" reference: a thick tube of water that travels
 * along a path — a round head running ahead, the body tapering to a thin tail that follows.
 * When the tail catches up, the water gathers into a round blob at the end and bursts into drops
 * that fly on (it never goes back along its path). On the way the tail sheds drops that are
 * flung outward and fall. Melted and cel-shaded as one body (shared with the Liquid stream).
 *
 * Paths: built-in shapes (a slash arc, a "2", an S-wave, a spiral) or the layer's own open pen
 * path — draw the motion yourself.
 */

import { createNoise } from '../core/noise.js';
import { motionPath, pointOnPath } from '../effects/followPath.js';
import { readStyle } from '../render/style.js';
import { paintMeltedWater, readWaterShading, waterShadingParams } from './meltedWater.js';

const TAU = Math.PI * 2;
const clamp01 = (/** @type {number} */ t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (/** @type {number} */ t) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

const G = 'Liquid ribbon';
const n = (
  /** @type {string} */ id,
  /** @type {string} */ label,
  /** @type {number} */ min,
  /** @type {number} */ max,
  /** @type {number} */ step,
  /** @type {number} */ def,
  tooltip = '',
  unit = '',
) => ({
  id: `ribbon.${id}`,
  label,
  group: G,
  type: 'float',
  min,
  max,
  step,
  default: def,
  ...(unit ? { unit } : {}),
  ...(tooltip ? { tooltip } : {}),
});

/** Liquid ribbon parameters (ids `ribbon.*`). */
export const RIBBON_PARAMS = [
  {
    id: 'ribbon.path',
    label: 'Path',
    group: G,
    type: 'enum',
    options: [
      { value: 'slash', label: 'Slash (a sweeping arc)' },
      { value: 'two', label: 'Number 2 (the liquid “2”)' },
      { value: 'wave', label: 'S-wave' },
      { value: 'spiral', label: 'Spiral (curls in)' },
      { value: 'pen', label: 'My path (this layer’s open pen path or Path-only shape)' },
    ],
    default: 'slash',
    tooltip:
      'Draw an open path with the Pen on this layer — or add an ellipse / rectangle / closed shape and set it to Path only — and pick “My path”',
  },
  n('size', 'Path size', 10, 2000, 1, 300, 'Size of the built-in path', 'px'),
  n('width', 'Thickness', 1, 300, 0.5, 20, 'Radius at the head', 'px'),
  n('tail', 'Tail', 0, 1, 0.01, 0.15, 'Thickness of the tail end (× head)'),
  n('reach', 'Length', 0.05, 1, 0.01, 0.55, 'How much of the path the ribbon covers at most'),
  n('travel', 'Travel time', 0.05, 1, 0.01, 0.5, 'Time for the head to run the path (× life)'),
  n('ease', 'Ease', 0, 1, 0.01, 0.6, 'Fast start, slowing at the end (0 = even speed)'),
  n('wobble', 'Wobble', 0, 1, 0.01, 0.35, 'Lumpy, uneven thickness that runs along'),
  {
    id: 'ribbon.drops',
    label: 'Shed drops',
    group: G,
    type: 'int',
    min: 0,
    max: 60,
    default: 10,
    tooltip: 'Drops flung off the tail on the way',
  },
  {
    id: 'ribbon.burst',
    label: 'End burst',
    group: G,
    type: 'int',
    min: 0,
    max: 40,
    default: 9,
    tooltip: 'Drops the last blob bursts into at the end',
  },
  n('fling', 'Fling', 0, 2, 0.01, 0.6, 'How fast drops fly off'),
  n('gravity', 'Gravity', -4000, 8000, 10, 1400, 'Pull on the drops', 'px/s²'),
  n('shrink', 'Drops shrink', 0, 1, 0.01, 0.7, 'Drops get smaller as they fly'),
  ...waterShadingParams(G, 'ribbon'),
];

/** @param {Record<string, any>} v */
export const readRibbon = (v) => ({
  path: v['ribbon.path'] ?? 'slash',
  size: v['ribbon.size'] ?? 300,
  width: v['ribbon.width'] ?? 20,
  tail: v['ribbon.tail'] ?? 0.15,
  reach: v['ribbon.reach'] ?? 0.55,
  travel: v['ribbon.travel'] ?? 0.5,
  ease: v['ribbon.ease'] ?? 0.6,
  wobble: v['ribbon.wobble'] ?? 0.35,
  drops: Math.round(v['ribbon.drops'] ?? 10),
  burst: Math.round(v['ribbon.burst'] ?? 9),
  fling: v['ribbon.fling'] ?? 0.6,
  gravity: v['ribbon.gravity'] ?? 1400,
  shrink: v['ribbon.shrink'] ?? 0.7,
});

/**
 * Built-in paths as polylines (layer space, centred on the origin).
 * @param {string} kind @param {number} S size
 * @returns {[number, number][]}
 */
export function builtInPath(kind, S) {
  /** @type {[number, number][]} */
  const pts = [];
  const N = 96;
  const h = S / 2;
  if (kind === 'two') {
    // the top bowl of a "2" (from the left, over the top, down to the right), the diagonal
    // down to the bottom left, then the base out to the right
    for (let i = 0; i <= 40; i++) {
      const a = Math.PI * 1.05 + (Math.PI * 1.1 * i) / 40;
      pts.push([Math.cos(a) * h * 0.55, -h * 0.45 + Math.sin(a) * h * 0.45]);
    }
    const [ex, ey] = pts[pts.length - 1];
    for (let i = 1; i <= 30; i++) {
      const t = i / 30;
      pts.push([ex + (-h * 0.55 - ex) * t, ey + (h * 0.55 - ey) * t * (0.9 + 0.1 * t)]);
    }
    for (let i = 1; i <= 26; i++) pts.push([-h * 0.55 + (h * 1.15 * i) / 26, h * 0.55]);
    return pts;
  }
  if (kind === 'wave') {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push([-h + S * t, Math.sin(t * TAU) * h * 0.38]);
    }
    return pts;
  }
  if (kind === 'spiral') {
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = -Math.PI / 2 + t * TAU * 1.6;
      const r = h * (1 - 0.8 * t);
      pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return pts;
  }
  // slash: a wide arc sweeping from upper left, down and around to the right
  for (let i = 0; i <= N; i++) {
    const a = Math.PI * 1.15 - (Math.PI * 1.3 * i) / N;
    pts.push([Math.cos(a) * h, -Math.sin(a) * h * 0.55 + h * 0.15]);
  }
  return pts;
}

/**
 * Arc-length sampler of a polyline: u (0–1) → point and direction.
 * @param {[number, number][]} pts
 */
function sampler(pts) {
  const len = [0];
  for (let i = 1; i < pts.length; i++) {
    len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const total = len[len.length - 1] || 1;
  return {
    total,
    /** @param {number} u */
    at(u) {
      const d = clamp01(u) * total;
      let lo = 0;
      let hi = len.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (len[mid] < d) lo = mid;
        else hi = mid;
      }
      const span = len[hi] - len[lo] || 1;
      const w = (d - len[lo]) / span;
      const [x0, y0] = pts[lo];
      const [x1, y1] = pts[hi];
      return { x: x0 + (x1 - x0) * w, y: y0 + (y1 - y0) * w, angle: Math.atan2(y1 - y0, x1 - x0) };
    },
  };
}

/**
 * The ribbon at life `age` (0–1): blobs along its spine + flying drops. Pure.
 * @param {ReturnType<typeof readRibbon>} p @param {number} seed @param {number} age
 * @param {{ x: number, y: number, angle: number } | null | ((u: number) => { x: number, y: number, angle: number } | null)} [pathAt]
 *   a custom path (u → point), else the built-in one
 * @param {number} [lifeSeconds]
 */
export function ribbonShape(p, seed, age, pathAt, lifeSeconds = 1) {
  const built = sampler(builtInPath(p.path, p.size));
  const custom = typeof pathAt === 'function' ? pathAt : null;
  const at = (/** @type {number} */ u) => (custom ? custom(u) : null) ?? built.at(u);
  // path length (custom paths: measured)
  let total = built.total;
  if (custom) {
    total = 0;
    let prev = at(0);
    for (let i = 1; i <= 64; i++) {
      const q = at(i / 64);
      total += Math.hypot(q.x - prev.x, q.y - prev.y);
      prev = q;
    }
  }
  const nz = createNoise(seed >>> 0);
  // the head runs the path over the travel time (eased); the tail follows the head along the
  // path by up to `reach`, and catches up as the head slows at the end
  const e = p.ease;
  const run = (/** @type {number} */ t) => {
    const u = clamp01(t);
    return (1 - e) * u + e * (1 - (1 - u) ** 2.4);
  };
  const T = p.travel;
  const head = run(age / T);
  const lag = T * 0.6;
  const tailRaw = run((age - lag) / T);
  const tail = Math.max(tailRaw, head - p.reach);
  const gathered = clamp01((age - T) / (lag * 0.9)); // after the head arrives: catching up
  const endT = T + lag; // the tail reaches the end: the blob bursts
  const g = p.gravity * lifeSeconds * lifeSeconds; // px/s² → px per life²
  const speed = (total / T) * (0.4 + 0.6 * (1 - e * 0.6)); // px per life, about the head's
  /** @type {{ x: number, y: number, r: number }[]} */
  const blobs = [];
  /** @type {{ x: number, y: number, r: number }[]} */
  const highlights = [];
  // 1) the body (until the burst)
  if (age < endT && head > 0) {
    const L = Math.max(1e-4, head - tail);
    // volume kept: as the ribbon shortens, it gets fatter (up to a round blob)
    const fat = Math.min(1.8, Math.sqrt(p.reach / Math.max(L, p.reach * 0.25)));
    const W = p.width * (0.85 + 0.15 * fat) * (1 + 0.6 * gathered);
    const step = Math.max(0.6, W * 0.35) / total;
    const count = Math.min(400, Math.ceil(L / step) + 1);
    for (let k = 0; k < count; k++) {
      const s = count > 1 ? k / (count - 1) : 1; // 0 tail → 1 head
      const u = tail + L * s;
      const q = at(u);
      // thin tail growing to the head; lumps that run along the ribbon with the water
      const prof = p.tail + (1 - p.tail) * s ** 0.6;
      const lump = 1 + p.wobble * 0.35 * nz.noise2D(u * 9 - age * 3, 1.7);
      blobs.push({ x: q.x, y: q.y, r: W * prof * lump });
    }
    const hq = at(head);
    highlights.push({ x: hq.x, y: hq.y, r: W });
    const mq = at(tail + L * 0.6);
    highlights.push({ x: mq.x, y: mq.y, r: W * 0.8 });
  }
  // 2) drops shed from the tail on the way, flung outward and falling
  for (let i = 0; i < p.drops; i++) {
    const h = (Math.imul(seed + 7, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0;
    const r1 = (h & 1023) / 1024;
    const r2 = ((h >>> 10) & 1023) / 1024;
    const r3 = ((h >>> 20) & 1023) / 1024;
    const tb = lag * 0.6 + (T + lag * 0.3 - lag * 0.6) * ((i + r1 * 0.8) / Math.max(1, p.drops));
    if (age < tb) continue;
    const ub = Math.max(run((tb - lag) / T), run(tb / T) - p.reach);
    const q = at(ub);
    const dt = age - tb;
    // flung along the path (forward) and out to one side
    const side = r2 < 0.5 ? -1 : 1;
    const v = speed * p.fling * (0.25 + 0.35 * r3);
    const vx = Math.cos(q.angle) * v * 0.6 - Math.sin(q.angle) * v * side * 0.8;
    const vy = Math.sin(q.angle) * v * 0.6 + Math.cos(q.angle) * v * side * 0.8;
    const r = p.width * (0.2 + 0.25 * r1) * (1 - p.shrink * smooth(dt / 0.45));
    if (r < 0.4) continue;
    blobs.push({ x: q.x + vx * dt, y: q.y + vy * dt + 0.5 * g * dt * dt, r });
  }
  // 3) the end: the gathered blob bursts into drops that fly on (never back along the path)
  if (age >= endT * 0.97 && p.burst > 0) {
    const q = at(1);
    const dt = Math.max(0, age - endT * 0.97);
    for (let i = 0; i < p.burst; i++) {
      const h = (Math.imul(seed + 13, 2246822519) ^ Math.imul(i + 3, 668265263)) >>> 0;
      const r1 = (h & 1023) / 1024;
      const r2 = ((h >>> 10) & 1023) / 1024;
      const a = q.angle + (r1 - 0.5) * Math.PI * 1.2;
      const v = speed * p.fling * (i < 2 ? 0.2 + 0.15 * i : 0.35 + 0.55 * r2);
      // the first drops are nearly the blob's size (it splits, it does not pop)
      const big = i < 2 ? 1.25 - 0.35 * i : 0.4 + 0.45 * r2;
      const r = p.width * big * (1 - p.shrink * smooth((dt - 0.05) / 0.45));
      if (r < 0.4) continue;
      const b = {
        x: q.x + Math.cos(a) * v * dt,
        y: q.y + Math.sin(a) * v * dt + 0.5 * g * dt * dt,
        r,
      };
      blobs.push(b);
      if (i < 3) highlights.push(b);
    }
  }
  return { blobs, highlights };
}

/**
 * Draw the ribbon.
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, seed?: number }} inst
 * @param {{ timing?: { fps?: number, frameCount?: number }, masks?: any[] }} [frame]
 */
export function drawRibbon(ctx, params, inst, frame) {
  const p = readRibbon(params);
  const style = readStyle(params);
  const age = inst.age ?? 0;
  const fps = frame?.timing?.fps ?? 24;
  const span = Math.max(0.01, (params['single.end'] ?? 1) - (params['single.start'] ?? 0));
  const lifeS = span * ((frame?.timing?.frameCount ?? 24) / fps);
  const pen = p.path === 'pen' ? motionPath(frame?.masks) : null;
  const pathAt = pen ? (/** @type {number} */ u) => pointOnPath(pen, u) : undefined;
  const { blobs, highlights } = ribbonShape(p, inst.seed ?? 0, age, pathAt, lifeS);
  if (!blobs.length) return;
  paintMeltedWater(
    ctx,
    { blobs, highlights, radius: p.width, slot: 'ribbon' },
    readWaterShading(params, 'ribbon'),
    style,
    age,
  );
}
