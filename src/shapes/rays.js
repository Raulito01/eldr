// @ts-check
/**
 * Light rays (D-115): a fan of soft, tapered beams rising from a base ellipse (portal god rays,
 * holy light, summoning circles). Each beam has its own length, width and flicker; beams are
 * drawn as a few nested tapered quads that fade toward the tip, added on top of each other.
 * Loops: the flicker cross-fades (D-071).
 */

import { toCss } from '../core/color.js';
import { loopedNoise } from '../core/loopContext.js';
import { createNoise } from '../core/noise.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition } from '../render/style.js';

const G = 'Rays';
const DEG = Math.PI / 180;

/**
 * @param {string} key @param {string} label @param {number} min @param {number} max
 * @param {number} step @param {number} def @param {string} tooltip @param {string} [unit]
 */
const num = (key, label, min, max, step, def, tooltip, unit) => ({
  id: `rays.${key}`,
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

/** Light-ray parameters (ids `rays.*`). Defaults are a first pass [Raul]. */
export const RAYS_PARAMS = [
  {
    id: 'rays.count',
    label: 'Rays',
    group: G,
    type: 'int',
    min: 1,
    max: 96,
    step: 1,
    default: 18,
    tooltip: 'How many beams',
  },
  num('length', 'Length', 4, 1024, 1, 240, 'Beam length', 'px'),
  num('lengthVariance', 'Length variance', 0, 1, 0.01, 0.5, 'Some beams shorter than others'),
  num('width', 'Width', 1, 256, 0.5, 22, 'Beam width at its base', 'px'),
  num('widthVariance', 'Width variance', 0, 1, 0.01, 0.5, 'Some beams thinner than others'),
  num(
    'tip',
    'Tip width',
    0,
    3,
    0.01,
    0.5,
    'Width at the tip, as a share of the base (above 1: beams flare out)',
  ),
  num('direction', 'Direction', -180, 180, 1, 0, '0 = straight up', '°'),
  num('spread', 'Spread', 0, 360, 1, 110, 'Angle of the whole fan', '°'),
  num(
    'fan',
    'Fan out',
    0,
    1,
    0.01,
    0.6,
    '0: beams parallel … 1: each beam points away from the centre',
  ),
  num('baseWidth', 'Base width', 0, 1024, 1, 120, 'Width of the ellipse the beams start on', 'px'),
  num(
    'baseHeight',
    'Base height',
    0,
    1024,
    1,
    30,
    'Height of the ellipse the beams start on',
    'px',
  ),
  num('fade', 'Fade to tip', 0, 1, 0.01, 0.85, 'How much the beams fade toward their tips'),
  num('softness', 'Soft edges', 0, 1, 0.01, 0.6, 'A bright thin core inside a soft wide beam'),
  num('flicker', 'Flicker', 0, 1, 0.01, 0.5, 'Beams brighten, dim and change length'),
  num('flickerSpeed', 'Flicker speed', 0, 12, 0.05, 2, 'How fast they flicker (loops cross-fade)'),
  num('brightness', 'Brightness', 0, 2, 0.01, 0.8, 'Overall strength of the beams'),
];

/** @param {Record<string, any>} v */
export const readRaysParams = (v) => ({
  count: Math.max(1, Math.round(v['rays.count'] ?? 18)),
  length: v['rays.length'] ?? 240,
  lengthVariance: v['rays.lengthVariance'] ?? 0.5,
  width: v['rays.width'] ?? 22,
  widthVariance: v['rays.widthVariance'] ?? 0.5,
  tip: v['rays.tip'] ?? 0.5,
  direction: v['rays.direction'] ?? 0,
  spread: v['rays.spread'] ?? 110,
  fan: v['rays.fan'] ?? 0.6,
  baseWidth: v['rays.baseWidth'] ?? 120,
  baseHeight: v['rays.baseHeight'] ?? 30,
  fade: v['rays.fade'] ?? 0.85,
  softness: v['rays.softness'] ?? 0.6,
  flicker: v['rays.flicker'] ?? 0.5,
  flickerSpeed: v['rays.flickerSpeed'] ?? 2,
  brightness: v['rays.brightness'] ?? 0.8,
});

/** @param {number} seed @param {number} i */
const rand = (seed, i) => {
  let x = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/**
 * The beams at this moment: base point, direction, length, widths, strength.
 * @param {ReturnType<typeof readRaysParams>} p @param {number} seed @param {number} t
 */
export function rayBeams(p, seed, t) {
  const noise = p.flicker > 0 ? createNoise(seed | 0) : null;
  const out = [];
  for (let i = 0; i < p.count; i++) {
    // evenly over the fan, jittered: u −0.5 … 0.5 across the spread
    const u = p.count === 1 ? 0 : (i + 0.3 + 0.4 * rand(seed, i * 5)) / p.count - 0.5;
    const along = (p.direction - 90) * DEG + u * p.spread * DEG * p.fan;
    // the base point: spread across the base ellipse's near rim (left to right)
    const bx = u * p.baseWidth;
    const by = (-p.baseHeight / 2) * Math.sqrt(Math.max(0, 1 - 4 * u * u));
    const fl = noise
      ? loopedNoise((z) => noise.noise2D(i * 7.31, z), p.flickerSpeed, t) * p.flicker
      : 0;
    const len = p.length * (1 - p.lengthVariance * rand(seed, i * 5 + 1)) * (1 + 0.35 * fl);
    const w = p.width * (1 - p.widthVariance * rand(seed, i * 5 + 2));
    const strength = Math.max(0, Math.min(1.5, 1 + fl)) * (0.6 + 0.4 * rand(seed, i * 5 + 3));
    out.push({
      x: bx,
      y: by,
      angle: along,
      length: Math.max(0, len),
      width: w,
      strength,
      shade: rand(seed, i * 5 + 4),
    });
  }
  return out;
}

/**
 * Paint the beams (each a tapered quad with a gradient to the tip; softness adds a wide faint
 * beam around a bright thin one). Beams add up where they overlap.
 * @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof readRaysParams>} p
 * @param {import('../render/style.js').Style} style
 * @param {{ age: number, seed: number, t: number }} inst
 */
export function paintRays(ctx, p, style, inst) {
  const core = corePosition(style, inst.age);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const layers =
    p.softness > 0
      ? [
          [1, 0.35 + 0.65 * (1 - p.softness)],
          [0.35, 1],
        ]
      : [[1, 1]];
  for (const b of rayBeams(p, inst.seed, inst.t)) {
    if (b.length < 1) continue;
    const pos = Math.min(1, core + style.spread * b.shade);
    const [r, g, bl, a] = sampleRamp(style.ramp, pos);
    const dx = Math.cos(b.angle);
    const dy = Math.sin(b.angle);
    const ex = b.x + dx * b.length;
    const ey = b.y + dy * b.length;
    for (const [wk, ak] of layers) {
      const hw = (b.width * wk) / 2;
      const tw = hw * p.tip;
      const alpha = Math.min(1, p.brightness * b.strength * ak) * ((a ?? 255) / 255);
      if (alpha <= 0.002) continue;
      const grad = ctx.createLinearGradient(b.x, b.y, ex, ey);
      grad.addColorStop(0, toCss([r, g, bl, alpha * 255]));
      grad.addColorStop(1, toCss([r, g, bl, alpha * 255 * (1 - p.fade)]));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(b.x - dy * hw, b.y + dx * hw);
      ctx.lineTo(ex - dy * tw, ey + dx * tw);
      ctx.lineTo(ex + dy * tw, ey - dx * tw);
      ctx.lineTo(b.x + dy * hw, b.y - dx * hw);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
