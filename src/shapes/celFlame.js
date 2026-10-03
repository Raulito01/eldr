// @ts-check
/**
 * Cel flame — "bitten teardrop" (D-090, after Raul's reference of the classic After Effects
 * cartoon-fire trick): a teardrop body; circles rise along its sides and are CUT OUT of it, so
 * the edge keeps changing and the tip breaks into separate tongues; the shape wobbles; a smaller
 * copy inside is the hot core. Flat cel colours from the layer's ramp. Everything moves with
 * whole cycles per loop (loopRate), so loops are seamless.
 *
 * Drawn on a private scratch canvas (body − bites, then the core on top, kept inside the body),
 * which is then placed with the current transform: overlapping particles never cut each other.
 */

import { toCss } from '../core/color.js';
import { loopRate } from '../core/loopContext.js';
import { createRng } from '../core/prng.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition, readStyle } from '../render/style.js';

const G = 'Cel flame';
const TAU = Math.PI * 2;

/** Cel flame parameters (ids `celflame.*`). Defaults follow Raul's reference [Raul]. */
export const CEL_FLAME_PARAMS = [
  {
    id: 'celflame.height',
    label: 'Height',
    group: G,
    type: 'float',
    min: 8,
    max: 1024,
    step: 1,
    default: 220,
    unit: 'px',
  },
  {
    id: 'celflame.width',
    label: 'Width',
    group: G,
    type: 'float',
    min: 4,
    max: 512,
    step: 1,
    default: 96,
    unit: 'px',
  },
  {
    id: 'celflame.tip',
    label: 'Tip sharpness',
    group: G,
    type: 'float',
    min: 0.4,
    max: 3,
    step: 0.05,
    default: 1.35,
    tooltip: 'Higher = a thinner, sharper tip',
  },
  {
    id: 'celflame.lean',
    label: 'Lean',
    group: G,
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'Bends the tip to one side',
  },
  {
    id: 'celflame.angle',
    label: 'Angle',
    group: G,
    type: 'float',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    unit: '°',
    tooltip:
      'Turns the flame. Particles aligned to their motion: 90 = tip points where they fly (jets, bursts), −90 = tip trails behind (meteors)',
  },
  {
    id: 'celflame.bites',
    label: 'Bites',
    group: G,
    type: 'int',
    min: 0,
    max: 12,
    default: 4,
    tooltip: 'Circles rising along the sides that cut into the flame',
  },
  {
    id: 'celflame.biteSize',
    label: 'Bite size',
    group: G,
    type: 'float',
    min: 0.05,
    max: 1,
    step: 0.01,
    default: 0.24,
    tooltip: '× width',
  },
  {
    id: 'celflame.biteDepth',
    label: 'Bite depth',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.45,
    tooltip: '0 = grazes the edge, 1 = cuts deep (splits the tip into tongues)',
  },
  {
    id: 'celflame.biteSpeed',
    label: 'Bite rise speed',
    group: G,
    type: 'float',
    min: 0,
    max: 6,
    step: 0.05,
    default: 1.2,
    unit: '/s',
    tooltip: 'How often a bite travels from the base to the tip (loops: rounded to whole cycles)',
  },
  {
    id: 'celflame.wobble',
    label: 'Wobble',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.14,
    tooltip: 'Wavy side-to-side motion (× width), stronger toward the tip',
  },
  {
    id: 'celflame.wobbleSpeed',
    label: 'Wobble speed',
    group: G,
    type: 'float',
    min: 0,
    max: 6,
    step: 0.05,
    default: 1,
    unit: '/s',
  },
  {
    id: 'celflame.core',
    label: 'Hot core',
    group: G,
    type: 'bool',
    default: true,
    tooltip: 'A smaller copy inside in the hot colour',
  },
  {
    id: 'celflame.coreSize',
    label: 'Core size',
    group: G,
    type: 'float',
    min: 0.1,
    max: 0.95,
    step: 0.01,
    default: 0.5,
  },
  {
    id: 'celflame.coreDrop',
    label: 'Core drop',
    group: G,
    type: 'float',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.08,
    tooltip: 'Moves the core toward the base',
  },
  {
    id: 'celflame.bodyTone',
    label: 'Body colour',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.42,
    tooltip: 'Position on the ramp (0 = hot end)',
  },
  {
    id: 'celflame.coreTone',
    label: 'Core colour',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.15,
    tooltip: 'Position on the ramp',
  },
  {
    id: 'celflame.showBites',
    label: 'Show bites',
    group: G,
    type: 'bool',
    default: false,
    tooltip: 'Draw the cutting circles in blue (to see how it works)',
  },
];

/** @param {Record<string, any>} v */
export const readCelFlame = (v) => ({
  height: v['celflame.height'] ?? 220,
  width: v['celflame.width'] ?? 96,
  tip: v['celflame.tip'] ?? 1.35,
  lean: v['celflame.lean'] ?? 0,
  angle: v['celflame.angle'] ?? 0,
  bites: v['celflame.bites'] ?? 4,
  biteSize: v['celflame.biteSize'] ?? 0.24,
  biteDepth: v['celflame.biteDepth'] ?? 0.45,
  biteSpeed: v['celflame.biteSpeed'] ?? 1.2,
  wobble: v['celflame.wobble'] ?? 0.14,
  wobbleSpeed: v['celflame.wobbleSpeed'] ?? 1,
  core: v['celflame.core'] ?? true,
  coreSize: v['celflame.coreSize'] ?? 0.5,
  coreDrop: v['celflame.coreDrop'] ?? 0.08,
  bodyTone: v['celflame.bodyTone'] ?? 0.42,
  coreTone: v['celflame.coreTone'] ?? 0.15,
  showBites: v['celflame.showBites'] ?? false,
});

/** @typedef {ReturnType<typeof readCelFlame>} CelFlame */

/**
 * The flame's geometry at a moment: outline (base at 0, 0, rising to −height) and the bite
 * circles. Pure; exported for tests.
 * @param {CelFlame} p @param {number} seed @param {number} seconds
 */
export function celFlameShape(p, seed, seconds) {
  const rng = createRng(seed);
  const H = p.height;
  const R = p.width / 2;
  const ph = [rng.next(), rng.next(), rng.next()];
  const w = loopRate(p.wobbleSpeed) * seconds;
  /** half width at height v (0 = base, 1 = tip) */
  const half = (/** @type {number} */ v) => {
    const y = v * H;
    if (y <= R) return Math.sqrt(Math.max(0, R * R - (y - R) ** 2));
    const u = Math.min(1, (y - R) / Math.max(1e-6, H - R));
    return R * (1 - u) ** p.tip * (1 + 0.08 * Math.sin(TAU * (2 * v - w - ph[2])));
  };
  /** centre-line x at height v: lean + wobble (stronger toward the tip) */
  const mid = (/** @type {number} */ v) =>
    p.lean * p.width * v * v +
    p.wobble *
      p.width *
      v ** 1.2 *
      (0.6 * Math.sin(TAU * (1.3 * v - w - ph[0])) +
        0.4 * Math.sin(TAU * (2.7 * v - 2 * w - ph[1])));
  const N = 40;
  /** @type {number[]} */
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const v = i / N;
    pts.push(mid(v) + half(v), -v * H);
  }
  for (let i = N; i >= 0; i--) {
    const v = i / N;
    pts.push(mid(v) - half(v), -v * H);
  }
  // bites: lanes alternate sides; each travels from BELOW the base (fully outside the body, so
  // it never pops in, D-099) up along the side and out past the tip — whole cycles per loop.
  // Around the round bottom the bite keeps to the flame's full width, so it slides in as a thin
  // sliver that grows as the body widens.
  const rate = loopRate(p.biteSpeed);
  /** @type {{ x: number, y: number, r: number }[]} */
  const bites = [];
  const V_END = 1.17;
  for (let i = 0; i < p.bites; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const phase = (i + rng.next() * 0.6) / Math.max(1, p.bites);
    const size = p.biteSize * p.width * (0.8 + 0.4 * rng.next());
    const v0 = -(1.3 * size) / Math.max(1, H); // start: the circle is clear below the base
    const f = (((phase + rate * seconds) % 1) + 1) % 1;
    const v = v0 + (V_END - v0) * f;
    const r = size * (0.75 + 0.35 * Math.min(1, Math.max(0, v)));
    const vv = Math.min(1, Math.max(0, v));
    // below the widest point of the round bottom, ride at the full width (outside the bowl)
    const edge = vv * H < R ? Math.max(half(vv), half(R / H + 1e-6)) : half(vv);
    const x = mid(vv) + side * (edge + r - 2 * r * p.biteDepth);
    bites.push({ x, y: -v * H, r });
  }
  return { outline: pts, bites, half, mid };
}

/** @type {Map<string, any>} reused scratch canvases (by size) */
const scratchCache = new Map();
/** A scratch canvas (browser: OffscreenCanvas; Node: the same canvas class as the layer). @param {any} ctx @param {number} w @param {number} h @param {string} slot */
/** Scratch canvases kept (size buckets × slots). */
const SCRATCH_MAX = 24;
export function scratch(ctx, w, h, slot) {
  const key = `${slot}`;
  // The canvas size depends only on the size asked for (rounded up to 64 px buckets), never on
  // what was drawn before: a bigger leftover canvas samples differently at the edges of the
  // copied area, which made frames depend on render order (D-100). Buckets keep reuse cheap.
  const W = Math.ceil(w / 64) * 64;
  const H = Math.ceil(h / 64) * 64;
  const bucket = `${key}:${W}x${H}`;
  let c = scratchCache.get(bucket);
  if (c)
    scratchCache.delete(bucket); // most recently used goes last
  else
    c =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(W, H)
        : new /** @type {any} */ (ctx.canvas.constructor)(W, H);
  scratchCache.set(bucket, c);
  if (scratchCache.size > SCRATCH_MAX) scratchCache.delete(scratchCache.keys().next().value);
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.globalCompositeOperation = 'source-over';
  x.clearRect(0, 0, c.width, c.height);
  return { c, x };
}

/** @param {CanvasRenderingContext2D} x @param {number[]} pts */
function tracePoly(x, pts) {
  x.beginPath();
  x.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
  x.closePath();
}

/**
 * Draw one cel flame around its base at (0, 0) with the current transform.
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, ageS?: number, seed?: number }} inst
 * @param {{ seconds?: number }} frame
 */
export function drawCelFlame(ctx, params, inst, frame) {
  const p = readCelFlame(params);
  const style = readStyle(params);
  if (p.angle) ctx.rotate((p.angle * Math.PI) / 180);
  const seconds = inst.ageS ?? frame.seconds ?? 0;
  const shape = celFlameShape(p, inst.seed ?? 0, seconds);
  // device px per local unit (the scratch matches the screen resolution)
  const m = ctx.getTransform();
  const k = Math.min(4, Math.max(0.05, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))));
  const pad = p.width * (0.6 + p.wobble + Math.abs(p.lean)) + 4;
  const x0 = -pad;
  const y0 = -p.height * 1.08 - 4;
  const bw = pad * 2;
  const bh = p.height * 1.08 + 8;
  const W = Math.max(1, Math.min(2048, Math.ceil(bw * k)));
  const H = Math.max(1, Math.min(2048, Math.ceil(bh * k)));
  const sx = W / bw;
  const sy = H / bh;
  const base = corePosition(style, inst.age ?? 0);
  const body = sampleRamp(style.ramp, Math.min(1, base + p.bodyTone));
  const hot = sampleRamp(style.ramp, Math.min(1, base + p.coreTone));

  const { c, x } = scratch(ctx, W, H, 'body');
  x.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
  x.fillStyle = toCss(body);
  tracePoly(x, shape.outline);
  x.fill();
  // the bites cut the body
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  for (const b of shape.bites) {
    x.moveTo(b.x + b.r, b.y);
    x.arc(b.x, b.y, b.r, 0, TAU);
  }
  x.fill();
  if (p.core) {
    // the core: the same flame, smaller and lower, with its own (scaled) bites; kept inside
    const cs = p.coreSize;
    const drop = p.coreDrop * p.height;
    const core = scratch(ctx, W, H, 'core');
    core.x.setTransform(sx * cs, 0, 0, sy * cs, -x0 * sx, -y0 * sy + drop * sy);
    core.x.fillStyle = toCss(hot);
    tracePoly(core.x, shape.outline);
    core.x.fill();
    core.x.globalCompositeOperation = 'destination-out';
    core.x.beginPath();
    for (const b of shape.bites) {
      core.x.moveTo(b.x + b.r, b.y);
      core.x.arc(b.x, b.y, b.r, 0, TAU);
    }
    core.x.fill();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-atop';
    x.drawImage(core.c, 0, 0, W, H, 0, 0, W, H);
  }
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(c, 0, 0, W, H, x0, y0, bw, bh);
  if (p.showBites) {
    ctx.save();
    ctx.fillStyle = 'rgba(30,150,255,0.85)';
    ctx.beginPath();
    for (const b of shape.bites) {
      ctx.moveTo(b.x + b.r, b.y);
      ctx.arc(b.x, b.y, b.r, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }
}
