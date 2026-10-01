// @ts-check
/**
 * `burst` element (brief §3.6): N elements spawned around the start of the effect, flying out
 * with a direction/cone, speed, drag, gravity and buoyancy.
 *
 * Motion is CLOSED-FORM: with linear drag k and constant acceleration a,
 *   v(τ) = v0·e^(−kτ) + a·(1 − e^(−kτ))/k
 *   x(τ) = v0·(1 − e^(−kτ))/k + a·(τ − (1 − e^(−kτ))/k)/k
 * so any frame is computed directly from (params, seed, time) — no simulation history.
 *
 * Units are per EFFECT DURATION (τ = normalized effect time since spawn): speed in px per
 * effect, accelerations in px per effect². Changing fps or frame count retimes the effect
 * instead of changing how far things fly.
 */

import { evalCurve } from '../core/curve.js';
import { subSeed } from '../core/hash.js';
import { createRng } from '../core/prng.js';

/** Below this drag the exact formulas lose precision; use the no-drag limit instead. */
const TINY_DRAG = 1e-6;

/**
 * Position and velocity after τ, starting at the origin.
 * @param {number} v0 initial velocity component (px/effect)
 * @param {number} a constant acceleration component (px/effect²)
 * @param {number} k linear drag (1/effect)
 * @param {number} tau elapsed normalized time
 * @returns {{ x: number, v: number }}
 */
export function motion1D(v0, a, k, tau) {
  if (k < TINY_DRAG) return { x: v0 * tau + 0.5 * a * tau * tau, v: v0 + a * tau };
  const e = Math.exp(-k * tau);
  const f = (1 - e) / k;
  return { x: v0 * f + (a * (tau - f)) / k, v: v0 * e + a * f };
}

/** Burst parameters (ids `burst.*`). Defaults are provisional [Raul]. */
export const BURST_PARAMS = [
  {
    id: 'burst.count',
    label: 'Count',
    group: 'Burst',
    type: 'int',
    min: 1,
    max: 64,
    default: 12,
    randomize: { min: 8, max: 20 },
    tooltip: 'Number of elements',
  },
  {
    id: 'burst.start',
    label: 'Spawn start',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'When elements start appearing (effect time)',
  },
  {
    id: 'burst.window',
    label: 'Spawn window',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: '0 = all at once · larger = spawned over a longer time',
  },
  {
    id: 'burst.spawnRadius',
    label: 'Spawn radius',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 128,
    step: 1,
    default: 0,
    unit: 'px',
    tooltip: 'Elements start anywhere inside this circle',
  },
  {
    id: 'burst.direction',
    label: 'Direction',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: 'Main direction: 0° = up, 90° = right',
  },
  {
    id: 'burst.cone',
    label: 'Cone',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 360,
    unit: '°',
    tooltip: 'Spread around the direction (360° = all around)',
  },
  {
    id: 'burst.speed',
    label: 'Speed',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 1200,
    step: 5,
    default: 260,
    unit: 'px',
    randomize: { min: 180, max: 380 },
    tooltip: 'Distance per effect duration (before drag)',
  },
  {
    id: 'burst.speedVariance',
    label: 'Speed variance',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
    tooltip: 'Random slowdown per element',
  },
  {
    id: 'burst.drag',
    label: 'Drag',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 20,
    step: 0.1,
    default: 3,
    randomize: { min: 2, max: 5 },
    tooltip: 'Air resistance: high = fast burst that quickly slows',
  },
  {
    id: 'burst.gravity',
    label: 'Gravity',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 2000,
    step: 10,
    default: 0,
    unit: 'px',
    tooltip: 'Pulls elements down',
  },
  {
    id: 'burst.buoyancy',
    label: 'Buoyancy',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 2000,
    step: 10,
    default: 0,
    unit: 'px',
    tooltip: 'Pushes elements up (smoke rises)',
  },
  {
    id: 'burst.life',
    label: 'Life',
    group: 'Burst',
    type: 'float',
    min: 0.05,
    max: 1,
    step: 0.01,
    default: 0.8,
    tooltip: 'How long each element lives (fraction of the effect)',
  },
  {
    id: 'burst.lifeVariance',
    label: 'Life variance',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    tooltip: 'Random shortening of each life',
  },
  {
    id: 'burst.size',
    label: 'Size',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    unit: 'x',
    tooltip: 'Scale of each element',
  },
  {
    id: 'burst.sizeVariance',
    label: 'Size variance',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.4,
    tooltip: 'Random size difference',
  },
  {
    id: 'burst.alignToVelocity',
    label: 'Align to motion',
    group: 'Burst',
    type: 'bool',
    default: false,
    tooltip: 'Point each element where it flies (sparks)',
  },
  {
    id: 'burst.randomRotation',
    label: 'Random rotation',
    group: 'Burst',
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 360,
    unit: '°',
    tooltip: 'Random start angle range (ignored when aligned to motion)',
  },
  {
    id: 'burst.spin',
    label: 'Spin',
    group: 'Burst',
    type: 'float',
    min: -1440,
    max: 1440,
    step: 5,
    default: 0,
    unit: '°',
    tooltip: 'Rotation per effect duration, random direction per element',
  },
  {
    id: 'burst.scaleOverLife',
    label: 'Scale over life',
    group: 'Life',
    type: 'curve',
    yMin: 0,
    yMax: 2,
    default: [
      { x: 0, y: 0.3 },
      { x: 0.2, y: 1 },
      { x: 1, y: 0.6 },
    ],
    tooltip: 'Scale of each element across its own life',
  },
  {
    id: 'burst.opacityOverLife',
    label: 'Opacity over life',
    group: 'Life',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 0.75, y: 1 },
      { x: 1, y: 0 },
    ],
    tooltip: 'Opacity of each element across its own life',
  },
];

/** @param {Record<string, any>} v */
export const readBurstParams = (v) => ({
  count: v['burst.count'],
  start: v['burst.start'],
  window: v['burst.window'],
  spawnRadius: v['burst.spawnRadius'],
  direction: v['burst.direction'],
  cone: v['burst.cone'],
  speed: v['burst.speed'],
  speedVariance: v['burst.speedVariance'],
  drag: v['burst.drag'],
  gravity: v['burst.gravity'],
  buoyancy: v['burst.buoyancy'],
  life: v['burst.life'],
  lifeVariance: v['burst.lifeVariance'],
  size: v['burst.size'],
  sizeVariance: v['burst.sizeVariance'],
  alignToVelocity: v['burst.alignToVelocity'],
  randomRotation: v['burst.randomRotation'],
  spin: v['burst.spin'],
  scaleOverLife: v['burst.scaleOverLife'],
  opacityOverLife: v['burst.opacityOverLife'],
});

/** @typedef {ReturnType<typeof readBurstParams>} BurstParams */

/**
 * Instances alive at effect time t.
 * @param {BurstParams} p
 * @param {number} t normalized effect time
 * @param {number} layerSeed
 * @returns {(import('./single.js').Instance & { vx: number, vy: number, speedRatio: number })[]}
 */
export function burstInstances(p, t, layerSeed) {
  const out = [];
  const deg = Math.PI / 180;
  const ay = p.gravity - p.buoyancy; // screen y points down
  for (let i = 0; i < p.count; i++) {
    const seed = subSeed(layerSeed, 'particle', i);
    const rng = createRng(seed);
    // Draw every random number in a fixed order, so each element is stable whatever happens.
    const spawn = p.start + p.window * rng.next();
    const life = Math.max(0.01, p.life * (1 - p.lifeVariance * rng.next()));
    const angle = (p.direction + p.cone * (rng.next() - 0.5)) * deg;
    const speed = p.speed * (1 - p.speedVariance * rng.next());
    const sr = p.spawnRadius * Math.sqrt(rng.next());
    const sa = rng.range(0, Math.PI * 2);
    const size = p.size * (1 - p.sizeVariance * rng.next());
    const rot0 = (rng.next() - 0.5) * p.randomRotation * deg;
    const spinDir = rng.sign();

    const tau = t - spawn;
    if (tau < 0) continue;
    const age = tau / life;
    if (age > 1) continue;

    const v0x = Math.sin(angle) * speed;
    const v0y = -Math.cos(angle) * speed;
    const mx = motion1D(v0x, 0, p.drag, tau);
    const my = motion1D(v0y, ay, p.drag, tau);
    const scale = size * evalCurve(p.scaleOverLife, age);
    const opacity = Math.min(1, Math.max(0, evalCurve(p.opacityOverLife, age)));
    if (scale <= 0 || opacity <= 0) continue;

    const vLen = Math.hypot(mx.v, my.v);
    const rotation = p.alignToVelocity
      ? vLen > 1e-9
        ? Math.atan2(my.v, mx.v)
        : Math.atan2(v0y, v0x)
      : rot0 + spinDir * p.spin * deg * tau;

    out.push({
      x: Math.cos(sa) * sr + mx.x,
      y: Math.sin(sa) * sr + my.x,
      rotation,
      scale,
      opacity,
      age,
      seed,
      vx: mx.v,
      vy: my.v,
      speedRatio: speed > 0 ? vLen / speed : 1,
    });
  }
  return out;
}
