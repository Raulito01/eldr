// @ts-check
/**
 * Streak: a spark spindle along +x (the direction of motion): round-ish head in front,
 * tapering tail behind. Elements rotate it to their velocity.
 */

/** Points per side of the outline. */
const SIDE_POINTS = 20;

/** Streak parameters (ids `streak.*`). Defaults are provisional [Raul]. */
export const STREAK_PARAMS = [
  {
    id: 'streak.length',
    label: 'Length',
    group: 'Shape',
    type: 'float',
    min: 2,
    max: 256,
    step: 1,
    default: 70,
    unit: 'px',
    randomize: { min: 40, max: 110 },
    tooltip: 'Head-to-tail length (later driven by speed)',
  },
  {
    id: 'streak.thickness',
    label: 'Thickness',
    group: 'Shape',
    type: 'float',
    min: 1,
    max: 64,
    step: 0.5,
    default: 10,
    unit: 'px',
    randomize: { min: 6, max: 16 },
    tooltip: 'Width at the widest point',
  },
  {
    id: 'streak.taper',
    label: 'Taper',
    group: 'Shape',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.7,
    randomize: { min: 0.5, max: 0.9 },
    tooltip: '0 = even spindle · 1 = round head with a long, sharp tail',
  },
];

/** @param {Record<string, any>} v */
export const readStreakParams = (v) => ({
  length: v['streak.length'],
  thickness: v['streak.thickness'],
  taper: v['streak.taper'],
});

/**
 * Outline of a streak, widest point at the origin, head toward +x.
 * @param {{ length: number, thickness: number, taper: number }} p
 * @returns {Float64Array}
 */
export function streakPoints(p) {
  const peak = 0.5 + 0.4 * p.taper; // where the widest point sits along the length (0 = tail)
  const tailPower = 0.6 + 1.4 * p.taper; // higher = sharper tail
  const half = p.thickness / 2;
  /** Half-width at u ∈ [0, 1] (0 = tail tip, 1 = head tip). @param {number} u */
  const width = (u) => {
    if (u <= peak) return half * (u / peak) ** tailPower;
    const k = (u - peak) / (1 - peak);
    return half * Math.sqrt(Math.max(0, 1 - k * k)); // round head
  };
  const out = new Float64Array(SIDE_POINTS * 4);
  for (let i = 0; i < SIDE_POINTS; i++) {
    const u = i / (SIDE_POINTS - 1);
    const x = (u - peak) * p.length;
    out[i * 2] = x;
    out[i * 2 + 1] = -width(u);
    const j = SIDE_POINTS * 2 - 1 - i; // bottom side runs back from head to tail
    out[j * 2] = x;
    out[j * 2 + 1] = width(u);
  }
  return out;
}
