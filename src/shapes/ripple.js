// @ts-check
/**
 * Ripples (Water family, D-076): concentric rings spreading on a flattened water surface — the
 * splash rings in Raul's water-bolt reference. Each ring is a cel band (a light outer edge and a
 * mid inner edge) that widens and thins away as it spreads.
 * - Burst: the rings leave one after another over the layer's life (an impact).
 * - Repeat: rings keep coming, a whole number per effect — a seamless loop.
 */

import { toCss } from '../core/color.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition } from '../render/style.js';

const G = 'Ripples';
const smoothstep = (/** @type {number} */ t) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/** Ripple parameters (ids `ripple.*`). Defaults are provisional [Raul]. */
export const RIPPLE_PARAMS = [
  {
    id: 'ripple.mode',
    label: 'Rings',
    group: G,
    type: 'enum',
    options: [
      { value: 'burst', label: 'Burst (an impact, over the layer’s life)' },
      { value: 'repeat', label: 'Repeat (keep coming — loops seamlessly)' },
    ],
    default: 'burst',
  },
  {
    id: 'ripple.radius',
    label: 'Reach',
    group: G,
    type: 'float',
    min: 4,
    max: 1024,
    step: 1,
    default: 160,
    unit: 'px',
    tooltip: 'How far the rings spread',
  },
  {
    id: 'ripple.count',
    label: 'Rings',
    group: G,
    type: 'int',
    min: 1,
    max: 12,
    step: 1,
    default: 3,
  },
  {
    id: 'ripple.cycles',
    label: 'Waves per effect',
    group: G,
    type: 'int',
    min: 1,
    max: 16,
    step: 1,
    default: 1,
    tooltip: 'Repeat mode: how many times each ring travels out per effect / loop',
  },
  {
    id: 'ripple.flatten',
    label: 'Perspective',
    group: G,
    type: 'float',
    min: 0.05,
    max: 1,
    step: 0.01,
    default: 0.35,
    tooltip: 'Height of the rings relative to their width (1 = seen from above)',
  },
  {
    id: 'ripple.thickness',
    label: 'Thickness',
    group: G,
    type: 'float',
    min: 0.01,
    max: 0.5,
    step: 0.005,
    default: 0.1,
    tooltip: 'Ring width at the start (fraction of the reach)',
  },
  // D-101 (water references): rings slow down as they grow and break into dashes
  {
    id: 'ripple.dashes',
    label: 'Break into dashes',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'As a ring spreads it breaks into dashes, which shrink away (0 = whole rings)',
  },
  {
    id: 'ripple.dashCount',
    label: 'Dashes',
    group: G,
    type: 'int',
    min: 3,
    max: 48,
    step: 1,
    default: 14,
  },
  {
    id: 'ripple.ease',
    label: 'Slow down',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    tooltip: 'How much a ring slows as it spreads (0 = steady speed, 1 = fast out, long settle)',
  },
  {
    id: 'ripple.start',
    label: 'Start size',
    group: G,
    type: 'float',
    min: 0,
    max: 0.9,
    step: 0.01,
    default: 0.08,
  },
];

/** @param {Record<string, any>} v */
export const readRippleParams = (v) => ({
  mode: v['ripple.mode'],
  radius: v['ripple.radius'],
  count: v['ripple.count'],
  cycles: v['ripple.cycles'],
  flatten: v['ripple.flatten'],
  thickness: v['ripple.thickness'],
  start: v['ripple.start'],
  dashes: v['ripple.dashes'] ?? 0,
  dashCount: v['ripple.dashCount'] ?? 14,
  ease: v['ripple.ease'] ?? 0.5,
});

/**
 * Progress (0–1) of each ring, or null when it isn't out.
 * @param {ReturnType<typeof readRippleParams>} p @param {number} age 0–1
 */
export function rippleProgress(p, age) {
  const n = Math.max(1, Math.round(p.count));
  /** @type {(number | null)[]} */
  const out = [];
  for (let i = 0; i < n; i++) {
    if (p.mode === 'repeat') {
      const u = age * p.cycles + i / n;
      out.push(u - Math.floor(u));
    } else {
      // staggered: ring i leaves at i·gap, every ring takes (1 − (n−1)·gap) of the life
      const gap = n > 1 ? 0.45 / (n - 1) : 0;
      const u = (age - i * gap) / Math.max(0.05, 1 - (n - 1) * gap);
      out.push(u >= 0 && u <= 1 ? u : null);
    }
  }
  return out;
}

/**
 * @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof readRippleParams>} p
 * @param {import('../render/style.js').Style} style @param {{ age: number, seed?: number }} inst
 */
export function paintRipple(ctx, p, style, inst) {
  const core = corePosition(style, inst.age);
  const light = toCss(sampleRamp(style.ramp, Math.min(1, core + style.spread * 0.15)));
  const mid = toCss(sampleRamp(style.ramp, Math.min(1, core + style.spread * 0.6)));
  ctx.save();
  ctx.scale(1, p.flatten);
  let ring = -1;
  for (const u of rippleProgress(p, inst.age)) {
    ring++;
    if (u == null) continue;
    // spreading slows down: blend of the old √u and a strong ease-out (1 − (1 − u)³)
    const spread = (1 - p.ease) * Math.sqrt(u) + p.ease * (1 - (1 - u) ** 3);
    const r = p.radius * (p.start + (1 - p.start) * spread);
    const w = p.radius * p.thickness * (1 - u) ** 1.3;
    if (w < 0.3) continue;
    // dashes: the ring breaks up as it spreads; each dash shrinks on its own
    const brk = p.dashes * smoothstep((u - 0.2) / 0.6);
    const n = Math.max(3, Math.round(p.dashCount));
    /** @type {[number, number][]} */
    const spans = [];
    if (brk <= 0) spans.push([0, Math.PI * 2]);
    else {
      let h = ((inst.seed ?? 0) ^ (ring * 2654435761)) >>> 0;
      const rnd = () => {
        h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
        return h / 4294967296;
      };
      const off = rnd() * Math.PI * 2;
      for (let j = 0; j < n; j++) {
        const keep = 1 - brk * (0.45 + 0.55 * rnd());
        const c = off + ((j + 0.5) / n) * Math.PI * 2;
        const half = (Math.PI / n) * keep;
        if (half > 0.004) spans.push([c - half, c + half]);
      }
    }
    // outer light half, inner mid half (a cel band)
    for (const [color, a, b] of /** @type {const} */ ([
      [light, r, r - w * 0.5],
      [mid, r - w * 0.5, r - w],
    ])) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const [s0, s1] of spans) {
        ctx.moveTo(Math.cos(s0) * Math.max(0, a), Math.sin(s0) * Math.max(0, a));
        ctx.arc(0, 0, Math.max(0, a), s0, s1);
        ctx.arc(0, 0, Math.max(0, b), s1, s0, true);
        ctx.closePath();
      }
      ctx.fill();
    }
  }
  ctx.restore();
}
