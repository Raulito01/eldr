// @ts-check
/**
 * Orb (D-073): a cel-shaded glass sphere — the "crystal ball" that magic and lightning orbs sit
 * in. Two parts so contents can go INSIDE it:
 *  - back:  the tinted glass body (dark at the centre, lighter toward the edge: fresnel), banded,
 *           plus a soft reflection on the ground below;
 *  - front: the rim light (a thin ring, a brighter crescent at the bottom where light refracts)
 *           and the specular highlights (a crescent along the upper-left edge + a round dot).
 * Put the contents (plasma, bolts, swirls, sparkles) between a Back and a Front orb layer, with a
 * round mask, and it reads as a glass ball. Colours come from the ramp: 0 = brightest … 1 = glass.
 */

import { toCss } from '../core/color.js';
import { sampleRamp } from '../render/ramp.js';

const G = 'Orb';

/** Orb parameters (ids `orb.*`). Defaults are provisional [Raul]. */
export const ORB_PARAMS = [
  {
    id: 'orb.part',
    label: 'Part',
    group: G,
    type: 'enum',
    options: [
      { value: 'both', label: 'Whole orb' },
      { value: 'back', label: 'Back (glass body, under the contents)' },
      { value: 'front', label: 'Front (rim + highlights, over the contents)' },
    ],
    default: 'both',
    tooltip: 'Use a Back and a Front orb layer with the contents between them',
  },
  {
    id: 'orb.radius',
    label: 'Radius',
    group: G,
    type: 'float',
    min: 4,
    max: 512,
    step: 1,
    default: 120,
    unit: 'px',
  },
  {
    id: 'orb.glass',
    label: 'Glass tint',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
    tooltip: 'How strongly the glass body is tinted (0 = clear)',
  },
  {
    id: 'orb.bands',
    label: 'Glass bands',
    group: G,
    type: 'int',
    min: 1,
    max: 6,
    step: 1,
    default: 3,
    tooltip: 'Cel steps from the dark centre to the lighter edge',
  },
  {
    id: 'orb.rim',
    label: 'Rim',
    group: G,
    type: 'float',
    min: 0,
    max: 0.4,
    step: 0.005,
    default: 0.06,
    tooltip: 'Rim light thickness (fraction of the radius); the bottom crescent is twice as thick',
  },
  {
    id: 'orb.shine',
    label: 'Highlights',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.85,
  },
  {
    id: 'orb.highlightAngle',
    label: 'Light from',
    group: G,
    type: 'float',
    min: -180,
    max: 180,
    step: 1,
    default: -135,
    unit: '°',
    tooltip: 'Where the highlight sits (−135 = upper left)',
  },
  {
    id: 'orb.reflection',
    label: 'Floor glow',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
    tooltip: 'Soft glow on the ground below the orb (drawn with the back)',
  },
];

/** @param {Record<string, any>} v */
export const readOrbParams = (v) => ({
  part: v['orb.part'],
  radius: v['orb.radius'],
  glass: v['orb.glass'],
  bands: v['orb.bands'],
  rim: v['orb.rim'],
  shine: v['orb.shine'],
  highlightAngle: v['orb.highlightAngle'],
  reflection: v['orb.reflection'],
});
/** @typedef {ReturnType<typeof readOrbParams>} OrbParams */

/** Ramp colour with alpha. @param {any[]} ramp @param {number} pos @param {number} a 0–1 */
const col = (ramp, pos, a) => {
  const c = sampleRamp(ramp, Math.min(1, Math.max(0, pos)));
  return toCss([c[0], c[1], c[2], (c[3] ?? 255) * a]);
};

/**
 * Paint the orb around (0, 0).
 * @param {CanvasRenderingContext2D} ctx @param {OrbParams} p
 * @param {import('../render/style.js').Style} style @param {number} core ramp shift (0–1)
 */
export function paintOrb(ctx, p, style, core = 0) {
  const R = p.radius;
  const ramp = style.ramp;
  const back = p.part !== 'front';
  const front = p.part !== 'back';
  ctx.save();
  if (back) {
    // floor glow: a flat soft ellipse under the ball
    if (p.reflection > 0) {
      const gy = R * 1.08;
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, col(ramp, core + 0.35, p.reflection));
      g.addColorStop(1, col(ramp, core + 0.6, 0));
      ctx.save();
      ctx.translate(0, gy);
      ctx.scale(0.85, 0.14);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // glass body: banded, darkest in the middle, lighter toward the edge (fresnel)
    const n = Math.max(1, Math.round(p.bands));
    for (let i = 0; i < n; i++) {
      const k = i / n; // 0 = outer band
      const r = R * (1 - k * 0.42);
      ctx.fillStyle = col(ramp, core + 0.55 + k * 0.45, p.glass * (0.55 + 0.45 * (1 - k)));
      ctx.beginPath();
      ctx.arc(0, R * k * 0.06, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (front && p.rim > 0) {
    // rim: a thin ring all around + a thicker crescent at the bottom (refracted light)
    const t = R * p.rim;
    ctx.fillStyle = col(ramp, core + 0.35, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.arc(0, 0, R - t, 0, Math.PI * 2, true);
    ctx.fill();
    ctx.fillStyle = col(ramp, core + 0.15, 0.95);
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.arc(0, -t * 2, R - t * 0.5, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  }
  if (front && p.shine > 0) {
    const a = (p.highlightAngle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // crescent highlight hugging the edge toward the light
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = `rgba(255,255,255,${0.75 * p.shine})`;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.9, a - 0.75, a + 0.75);
    ctx.arc(-ux * R * 0.1, -uy * R * 0.1, R * 0.9, a + 0.62, a - 0.62, true);
    ctx.closePath();
    ctx.fill();
    // a small round glint inside the crescent, and a faint one opposite
    ctx.fillStyle = `rgba(255,255,255,${p.shine})`;
    ctx.beginPath();
    ctx.arc(ux * R * 0.55, uy * R * 0.55, R * 0.075, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.35 * p.shine})`;
    ctx.beginPath();
    ctx.ellipse(
      -ux * R * 0.62,
      -uy * R * 0.62,
      R * 0.12,
      R * 0.05,
      a + Math.PI / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
