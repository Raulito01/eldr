// @ts-check
/**
 * Sparkle: a twinkle star with concave sides (the 4-point "glint" in Raul's references).
 * Spikes alternate long/short; the first spike points up.
 */

/** Outline points sampled along each concave edge between two spike tips. */
const EDGE_POINTS = 10;
/** Where the edge's control point sits at thinness 0 (fraction of the spike length). */
const FAT_CONTROL = 0.45;

/** Sparkle parameters (ids `sparkle.*`). Defaults are provisional [Raul]. */
export const SPARKLE_PARAMS = [
  {
    id: 'sparkle.size',
    label: 'Size',
    group: 'Shape',
    type: 'float',
    min: 1,
    max: 512,
    step: 0.5,
    default: 18,
    unit: 'px',
    randomize: { min: 10, max: 28 },
    tooltip: 'Length of the long spikes (centre to tip)',
  },
  {
    id: 'sparkle.points',
    label: 'Spikes',
    group: 'Shape',
    type: 'int',
    min: 3,
    max: 12,
    default: 4,
    tooltip: 'Number of spikes',
  },
  {
    id: 'sparkle.thinness',
    label: 'Thinness',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.8,
    randomize: { min: 0.65, max: 0.9 },
    tooltip: '0 = fat star · 1 = needle-thin spikes',
  },
  {
    id: 'sparkle.ratio',
    label: 'Short spikes',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
    randomize: { min: 0.4, max: 0.8 },
    tooltip: 'Length of every other spike (1 = all the same)',
  },
];

/** @param {Record<string, any>} v */
export const readSparkleParams = (v) => ({
  size: v['sparkle.size'],
  points: v['sparkle.points'],
  thinness: v['sparkle.thinness'],
  ratio: v['sparkle.ratio'],
});

/**
 * Outline of a sparkle centred on the origin.
 * @param {{ size: number, points: number, thinness: number, ratio: number }} p
 * @returns {Float64Array}
 */
export function sparklePoints(p) {
  const n = Math.max(3, Math.round(p.points));
  const control = p.size * FAT_CONTROL * (1 - p.thinness);
  const tips = [];
  for (let k = 0; k < n; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / n;
    const len = p.size * (k % 2 === 1 && n % 2 === 0 ? p.ratio : 1);
    tips.push({ a, x: Math.cos(a) * len, y: Math.sin(a) * len });
  }
  const out = new Float64Array(n * EDGE_POINTS * 2);
  let o = 0;
  for (let k = 0; k < n; k++) {
    const A = tips[k];
    const B = tips[(k + 1) % n];
    const mid = A.a + Math.PI / n;
    const cx = Math.cos(mid) * control;
    const cy = Math.sin(mid) * control;
    // Quadratic bezier tip → (pulled toward the centre) → next tip; the last point is the next
    // edge's first, so it's left out.
    for (let i = 0; i < EDGE_POINTS; i++) {
      const s = i / EDGE_POINTS;
      const u = 1 - s;
      out[o++] = u * u * A.x + 2 * u * s * cx + s * s * B.x;
      out[o++] = u * u * A.y + 2 * u * s * cy + s * s * B.y;
    }
  }
  return out;
}
