// @ts-check
/**
 * Liquid (Water family, D-076): anime-cel water / goo — after Raul's references (a bubbling goo
 * cauldron, a blue water bolt splashing on a shelf). A liquid mass is drawn in flat tones:
 *   light body → a mid tone everywhere except a light band along the top → darker organic
 *   POCKETS inside (not concentric rings) → hard white highlights (an edge streak + dots).
 * Its edge boils with noise (loop-safe), can grow a drippy CROWN on top (erupting columns), can
 * stand on its base (columns grow from the ground) and stretch along its motion (flying drops).
 * Also: Bubble (hollow cel bubble) and the shared tone helpers.
 */

import { toCss } from '../core/color.js';
import { loopedNoise } from '../core/loopContext.js';
import { createNoise } from '../core/noise.js';
import { createRng } from '../core/prng.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition } from '../render/style.js';
import { blobPoints } from './blob.js';
import { traceSmoothClosed } from './trace.js';

const G = 'Liquid';
const POINTS = 72;

/** Liquid parameters (ids `liquid.*`). Defaults are provisional [Raul]. */
export const LIQUID_PARAMS = [
  {
    id: 'liquid.radius',
    label: 'Size',
    group: G,
    type: 'float',
    min: 1,
    max: 512,
    step: 0.5,
    default: 40,
    unit: 'px',
  },
  {
    id: 'liquid.aspect',
    label: 'Height / width',
    group: G,
    type: 'float',
    min: 0.1,
    max: 6,
    step: 0.01,
    default: 1,
    tooltip: 'Tall = a column, flat = a puddle',
  },
  {
    id: 'liquid.base',
    label: 'Stands on',
    group: G,
    type: 'enum',
    options: [
      { value: 'centre', label: 'Its centre (blobs, drops)' },
      { value: 'bottom', label: 'Its base (columns grow from the ground)' },
    ],
    default: 'centre',
  },
  {
    id: 'liquid.noise',
    label: 'Wobble',
    group: G,
    type: 'float',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.12,
  },
  {
    id: 'liquid.boil',
    label: 'Boil speed',
    group: G,
    type: 'float',
    min: 0,
    max: 16,
    step: 0.1,
    default: 3,
    tooltip: 'How fast the edge wobbles (per effect / loop)',
  },
  {
    id: 'liquid.crown',
    label: 'Crown',
    group: G,
    type: 'float',
    min: 0,
    max: 1.5,
    step: 0.01,
    default: 0,
    tooltip: 'Drippy spikes on top (an erupting splash column)',
  },
  {
    id: 'liquid.crownSpikes',
    label: 'Crown spikes',
    group: G,
    type: 'int',
    min: 2,
    max: 24,
    step: 1,
    default: 7,
  },
  {
    id: 'liquid.pockets',
    label: 'Dark pockets',
    group: G,
    type: 'int',
    min: 0,
    max: 8,
    step: 1,
    default: 3,
  },
  {
    id: 'liquid.pocketSize',
    label: 'Pocket size',
    group: G,
    type: 'float',
    min: 0.05,
    max: 0.8,
    step: 0.01,
    default: 0.3,
  },
  {
    id: 'liquid.topLight',
    label: 'Top light band',
    group: G,
    type: 'float',
    min: 0,
    max: 0.6,
    step: 0.01,
    default: 0.22,
    tooltip: 'Thickness of the light band along the top (fraction of the size)',
  },
  {
    id: 'liquid.shine',
    label: 'Highlights',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.9,
  },
  {
    id: 'liquid.stretch',
    label: 'Stretch with speed',
    group: G,
    type: 'float',
    min: 0,
    max: 3,
    step: 0.01,
    default: 0,
    tooltip: 'Flying drops stretch along their motion (needs Align to velocity)',
  },
];

/** @param {Record<string, any>} v */
export const readLiquidParams = (v) => ({
  radius: v['liquid.radius'],
  aspect: v['liquid.aspect'],
  base: v['liquid.base'],
  noise: v['liquid.noise'],
  boil: v['liquid.boil'],
  crown: v['liquid.crown'],
  crownSpikes: v['liquid.crownSpikes'],
  pockets: v['liquid.pockets'],
  pocketSize: v['liquid.pocketSize'],
  topLight: v['liquid.topLight'],
  shine: v['liquid.shine'],
  stretch: v['liquid.stretch'],
});
/** @typedef {ReturnType<typeof readLiquidParams>} LiquidParams */

/**
 * Outline of a liquid mass (flat [x, y, …]); y up is negative. `bottom` puts the base at y = 0.
 * @param {LiquidParams} p @param {number} seed @param {number} t effect / loop time 0–1
 */
export function liquidOutline(p, seed, t) {
  const noise = createNoise(seed);
  const rng = createRng(seed);
  const phase = rng.range(0, Math.PI * 2);
  const rx = p.radius;
  const ry = p.radius * p.aspect;
  const lift = p.base === 'bottom' ? -ry : 0;
  const out = new Float64Array(POINTS * 2);
  for (let i = 0; i < POINTS; i++) {
    const a = (i / POINTS) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    let r = 1;
    if (p.noise > 0)
      r += p.noise * loopedNoise((z) => noise.noise3D(c * 1.6, s * 1.6, z), p.boil, t);
    let up = 0;
    if (p.crown > 0 && s < 0) {
      // spikes on the upper half, sharp tips (cosine to a power), tallest at the top
      const k = 0.5 + 0.5 * Math.cos(p.crownSpikes * a + phase);
      up = p.crown * k ** 3 * -s;
    }
    out[i * 2] = c * rx * r;
    out[i * 2 + 1] = s * ry * r - up * ry * 0.6 + lift;
  }
  return out;
}

/** Ramp colour. @param {any[]} ramp @param {number} pos */
const tone = (ramp, pos) => toCss(sampleRamp(ramp, Math.min(1, Math.max(0, pos))));

/**
 * Paint a liquid mass around (0, 0) in cel tones.
 * @param {CanvasRenderingContext2D} ctx @param {LiquidParams} p
 * @param {import('../render/style.js').Style} style
 * @param {{ age: number, seed: number, t: number, speedRatio?: number }} inst
 */
export function paintLiquid(ctx, p, style, inst) {
  const core = corePosition(style, inst.age);
  const spread = Math.max(0.05, style.spread);
  const outline = liquidOutline(p, inst.seed, inst.t);
  const R = p.radius;
  ctx.save();
  if (p.stretch > 0) {
    const e = 1 + p.stretch * Math.min(2, inst.speedRatio ?? 0);
    ctx.scale(e, 1 / Math.sqrt(e));
  }
  const body = () => {
    ctx.beginPath();
    traceSmoothClosed(ctx, outline);
  };
  // 1. light body
  ctx.fillStyle = tone(style.ramp, core + spread * 0.25);
  body();
  ctx.fill();
  ctx.save();
  body();
  ctx.clip();
  // 2. mid tone everywhere except a light band along the top
  ctx.fillStyle = tone(style.ramp, core + spread * 0.55);
  ctx.save();
  ctx.translate(R * 0.04, R * p.topLight * Math.max(1, p.aspect * 0.6));
  body();
  ctx.fill();
  ctx.restore();
  // 3. darker organic pockets inside (lower part), boiling slowly
  if (p.pockets > 0) {
    const rng = createRng(inst.seed ^ 0x5bd1e995);
    ctx.fillStyle = tone(style.ramp, core + spread);
    const ry = R * p.aspect;
    const cy = p.base === 'bottom' ? -ry : 0;
    for (let k = 0; k < p.pockets; k++) {
      const px = (rng.next() - 0.5) * R * 1.1;
      const py = cy + (rng.next() * 0.9 - 0.15) * ry;
      const pr = R * p.pocketSize * (0.55 + rng.next() * 0.6);
      const pts = blobPoints(
        { radius: pr, noise: 0.35, frequency: 1.8, lobes: 0, lobeDepth: 0, wobble: p.boil * 0.6 },
        (inst.seed + k * 7919) | 0,
        inst.t,
      );
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(1, 1 + 0.6 * (p.aspect > 1.4 ? 1 : 0));
      ctx.beginPath();
      traceSmoothClosed(ctx, pts);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.restore();
  // 4. hard white highlights: a streak along the upper-left edge + dots
  if (p.shine > 0) {
    const hi = tone(style.ramp, Math.max(0, core - 0.2));
    ctx.strokeStyle = hi;
    ctx.fillStyle = hi;
    ctx.globalAlpha *= p.shine;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, R * 0.09);
    ctx.beginPath();
    const n = POINTS;
    const from = Math.round(n * 0.56);
    const to = Math.round(n * 0.7);
    for (let i = from; i <= to; i++) {
      const x = outline[i * 2] * 0.8;
      const y = outline[i * 2 + 1] * 0.8 + (p.base === 'bottom' ? -R * p.aspect * 0.2 : 0);
      if (i === from) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const rng = createRng(inst.seed ^ 0x27d4eb2d);
    const dots = 1 + Math.round(rng.next() * 2);
    for (let k = 0; k < dots; k++) {
      const i = Math.round(n * (0.72 + rng.next() * 0.12));
      ctx.beginPath();
      ctx.arc(
        outline[i * 2] * 0.78,
        outline[i * 2 + 1] * 0.78,
        Math.max(0.8, R * (0.05 + rng.next() * 0.04)),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

// ── Bubble ────────────────────────────────────────────────────────────────────────────────

/** Bubble parameters (ids `bubble.*`). */
export const BUBBLE_PARAMS = [
  {
    id: 'bubble.radius',
    label: 'Radius',
    group: 'Bubble',
    type: 'float',
    min: 1,
    max: 256,
    step: 0.5,
    default: 12,
    unit: 'px',
  },
  {
    id: 'bubble.rim',
    label: 'Rim',
    group: 'Bubble',
    type: 'float',
    min: 0.02,
    max: 0.5,
    step: 0.01,
    default: 0.14,
    tooltip: 'Rim thickness (fraction of the radius)',
  },
  {
    id: 'bubble.fill',
    label: 'Fill',
    group: 'Bubble',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.25,
    tooltip: 'How tinted the inside is (0 = clear)',
  },
  {
    id: 'bubble.wobble',
    label: 'Wobble',
    group: 'Bubble',
    type: 'float',
    min: 0,
    max: 0.4,
    step: 0.01,
    default: 0.08,
  },
];

/** @param {Record<string, any>} v */
export const readBubbleParams = (v) => ({
  radius: v['bubble.radius'],
  rim: v['bubble.rim'],
  fill: v['bubble.fill'],
  wobble: v['bubble.wobble'],
});

/**
 * A hollow cel bubble: tinted inside, a light rim, a white crescent + glint.
 * @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof readBubbleParams>} p
 * @param {import('../render/style.js').Style} style
 * @param {{ age: number, seed: number, t: number }} inst
 */
export function paintBubble(ctx, p, style, inst) {
  const core = corePosition(style, inst.age);
  const R = p.radius;
  const pts = blobPoints(
    { radius: R, noise: p.wobble, frequency: 1.2, lobes: 0, lobeDepth: 0, wobble: 6 },
    inst.seed,
    inst.t,
  );
  ctx.save();
  if (p.fill > 0) {
    ctx.globalAlpha *= p.fill;
    ctx.fillStyle = tone(style.ramp, core + style.spread * 0.5);
    ctx.beginPath();
    traceSmoothClosed(ctx, pts);
    ctx.fill();
    ctx.globalAlpha /= p.fill;
  }
  // rim (outer outline minus a scaled copy)
  ctx.fillStyle = tone(style.ramp, core + style.spread * 0.2);
  ctx.beginPath();
  traceSmoothClosed(ctx, pts);
  const k = 1 - p.rim;
  const inner = pts.map((v) => v * k);
  traceSmoothClosed(ctx, inner);
  ctx.fill('evenodd');
  // highlight
  ctx.fillStyle = tone(style.ramp, Math.max(0, core - 0.2));
  ctx.beginPath();
  ctx.arc(-R * 0.38, -R * 0.38, R * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineCap = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = Math.max(0.8, R * 0.1);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.68, Math.PI * 0.95, Math.PI * 1.25);
  ctx.stroke();
  ctx.restore();
}
