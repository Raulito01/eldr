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
    id: 'ripple.organic',
    label: 'Organic',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.7,
    tooltip:
      'Hand-drawn rings: wobbly radius, thicker at the front, uneven width, ragged edge, pieces that taper (0 = perfect geometric rings)',
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
  organic: v['ripple.organic'] ?? 0.7,
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
  const TAU = Math.PI * 2;
  const o = p.organic;
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
    let h = ((inst.seed ?? 0) ^ Math.imul(ring + 1, 2654435761)) >>> 0;
    const rnd = () => {
      h = (Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
      return h / 4294967296;
    };
    // organic (D-101b, after the references): a brush stroke, not a geometric ring — the
    // radius wobbles, the band is thicker at the front, its width varies along the ring, the
    // outer edge is ragged; the waves drift slowly as the ring spreads
    const harm = [2, 3, 5, 7].map((k) => ({
      k,
      a: 0.5 + rnd(),
      ph: rnd() * TAU,
      sp: (rnd() - 0.5) * 2,
    }));
    const wave = (/** @type {number} */ th, /** @type {number} */ sel) => {
      let v = 0;
      for (const q of harm)
        if ((q.k + sel) % 2 === 0 || sel === 2) v += q.a * Math.sin(q.k * th + q.ph + q.sp * u * 3);
      return v / harm.length;
    };
    const cxo = o * r * 0.05 * (rnd() - 0.5);
    const radius = (/** @type {number} */ th) => r * (1 + o * 0.07 * wave(th, 0));
    const width = (/** @type {number} */ th) =>
      Math.max(
        0,
        w *
          (1 +
            o * (0.45 * Math.sin(th) - 0.1) + // front (bottom, nearer) thicker than the back
            o * 0.7 * wave(th + 1.3, 1)),
      );
    // pieces: cut at uneven places; as the ring spreads each piece shrinks from both ends at
    // its own speed (tapered, like a brush lifting), short pieces vanish first
    const brk = p.dashes * smoothstep((u - 0.15) / 0.65);
    const n = Math.max(3, Math.round(p.dashCount));
    /** @type {{ a: number, b: number }[]} */
    const pieces = [];
    if (brk <= 0 && o <= 0) pieces.push({ a: 0, b: TAU });
    else if (brk <= 0) pieces.push({ a: rnd() * TAU, b: 0 });
    else {
      const cuts = Array.from({ length: n }, () => rnd()).sort((x, y) => x - y);
      const off = rnd() * TAU;
      for (let j = 0; j < n; j++) {
        const a0 = cuts[j];
        const b0 = j + 1 < n ? cuts[j + 1] : cuts[0] + 1;
        const c = (a0 + b0) / 2;
        const half = (b0 - a0) / 2;
        // shrink speed: some pieces go fast, some hold on
        const keep = 1 - brk * (0.35 + 0.9 * rnd()) * (1 + 0.6 * (1 - half * n));
        const hk = half * Math.max(0, keep) - 0.004;
        if (hk > 0.003) pieces.push({ a: off + (c - hk) * TAU, b: off + (c + hk) * TAU });
      }
    }
    if (pieces.length === 1 && pieces[0].b === 0) pieces[0].b = pieces[0].a + TAU;
    const whole = brk <= 0;
    for (const [color, f0, f1] of /** @type {const} */ ([
      [mid, 0, 1],
      [light, 0, 0.5],
    ])) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (const pc of pieces) {
        const span = pc.b - pc.a;
        const steps = Math.max(8, Math.ceil((span / TAU) * 140));
        // D-103: round ends (surface tension), not pointed tapers
        const taper = whole ? 0 : Math.min(span * 0.45, (w * 1.4) / Math.max(1, r));
        /** @type {[number, number][]} */
        const outer = [];
        /** @type {[number, number][]} */
        const inner = [];
        for (let k = 0; k <= steps; k++) {
          const th = pc.a + (span * k) / steps;
          const end = Math.min(th - pc.a, pc.b - th);
          const e = taper > 0 ? Math.min(1, end / taper) : 1;
          const tp = Math.sqrt(Math.max(0, e * (2 - e))); // a round cap
          const ww = width(th) * tp;
          // soft, slow wobble on the edge (no jagged teeth)
          const rr = radius(th) + o * ww * 0.12 * Math.sin(4 * th + harm[0].ph + u * 2);
          // the cap is centred on the band, so each end is a round blob
          const cc = rr - width(th) * 0.5;
          const ro = cc + ww * (0.5 - f0);
          const ri = cc + ww * (0.5 - f1);
          outer.push([cxo + Math.cos(th) * ro, Math.sin(th) * ro]);
          inner.push([cxo + Math.cos(th) * ri, Math.sin(th) * ri]);
        }
        ctx.moveTo(outer[0][0], outer[0][1]);
        for (const [x, y] of outer) ctx.lineTo(x, y);
        for (let k = inner.length - 1; k >= 0; k--) ctx.lineTo(inner[k][0], inner[k][1]);
        ctx.closePath();
      }
      ctx.fill(whole ? 'evenodd' : 'nonzero');
    }
  }
  ctx.restore();
}
