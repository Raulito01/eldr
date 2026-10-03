// @ts-check
/**
 * `emitter` element (4.Pb, D-067; brief §3.6 emitterLoop): continuous spawning, in SECONDS.
 *
 * Still random-access (brief §2.2): particle k is born at a fixed time b_k (rate, or pulses),
 * its randomness comes from subSeed(layer, k), and its state at any moment is closed-form
 * (motion1D with drag + gravity, noise-based turbulence). A frame only looks at the particles
 * that can be alive then.
 *
 * - Particles are born where the emitter is AT THEIR BIRTH (`frame.matrixAt`) and then fly on
 *   their own in the comp — animate the emitter (or its null / Follow Path) and they trail
 *   behind. "Move with emitter" keeps them in the emitter's space instead.
 * - Loops: the schedule repeats every comp length (rate rounded to whole particles per loop,
 *   identities wrap), and the emitter's own animation is sampled modulo the loop, so the last
 *   frame flows into the first. Pre-warm: one-shots start as if the emitter had been running.
 * - Trails: copies of each particle at slightly earlier ages, fading / shrinking.
 */

import { evalCurve } from '../core/curve.js';
import { subSeed } from '../core/hash.js';
import { createNoise } from '../core/noise.js';
import { createRng } from '../core/prng.js';
import { pointOnPath } from '../effects/followPath.js';
import { motion1D } from './burst.js';

const G = 'Emitter';
const M = 'Particle motion';
const L = 'Particle life';
const T = 'Trails';

/** Emitter parameters (ids `emit.*`, `trail.*`). */
export const EMITTER_PARAMS = [
  {
    id: 'emit.rate',
    label: 'Rate',
    group: G,
    type: 'float',
    min: 0,
    max: 400,
    step: 0.5,
    default: 24,
    unit: '/s',
    tooltip: 'Particles per second (with Pulse: ignored)',
  },
  {
    id: 'emit.pulseEvery',
    label: 'Pulse every',
    group: G,
    type: 'float',
    min: 0,
    max: 5,
    step: 0.01,
    default: 0,
    unit: 's',
    tooltip: '0 = continuous. Otherwise puffs of "Pulse count" particles at this interval.',
  },
  {
    id: 'emit.pulseCount',
    label: 'Pulse count',
    group: G,
    type: 'int',
    min: 1,
    max: 200,
    default: 12,
  },
  {
    id: 'emit.start',
    label: 'Start',
    group: G,
    type: 'float',
    min: 0,
    max: 20,
    step: 0.01,
    default: 0,
    unit: 's',
    tooltip: 'When emission starts (layer time; ignored by loops)',
  },
  {
    id: 'emit.stop',
    label: 'Stop',
    group: G,
    type: 'float',
    min: 0,
    max: 20,
    step: 0.01,
    default: 20,
    unit: 's',
    tooltip: 'When emission stops — particles already out live on (ignored by loops)',
  },
  {
    id: 'emit.prewarm',
    label: 'Pre-warm',
    group: G,
    type: 'bool',
    default: false,
    tooltip: 'Start as if the emitter had already been running (frame 0 is already full)',
  },
  {
    id: 'emit.shape',
    label: 'Emitter shape',
    group: G,
    type: 'enum',
    options: [
      { value: 'point', label: 'Point' },
      { value: 'line', label: 'Line' },
      { value: 'circle', label: 'Circle (filled)' },
      { value: 'ring', label: 'Ring (edge)' },
      { value: 'box', label: 'Box' },
      { value: 'path', label: 'Along path (this layer’s open pen path or Path-only shape)' },
    ],
    default: 'point',
  },
  {
    id: 'emit.width',
    label: 'Width',
    group: G,
    type: 'float',
    min: 0,
    max: 2000,
    step: 1,
    default: 120,
    unit: 'px',
    tooltip: 'Line length · circle / ring diameter · box width',
  },
  {
    id: 'emit.height',
    label: 'Height',
    group: G,
    type: 'float',
    min: 0,
    max: 2000,
    step: 1,
    default: 60,
    unit: 'px',
    tooltip: 'Box height',
  },
  {
    id: 'emit.maxParticles',
    label: 'Max particles',
    group: G,
    type: 'int',
    min: 1,
    max: 3000,
    default: 600,
    tooltip: 'Safety cap (the newest are kept)',
  },
  {
    id: 'emit.direction',
    label: 'Direction',
    group: M,
    type: 'float',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: '0 = up (turns with the emitter)',
  },
  {
    id: 'emit.cone',
    label: 'Spread',
    group: M,
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 40,
    unit: '°',
  },
  {
    id: 'emit.outward',
    label: 'Outward',
    group: M,
    type: 'bool',
    default: false,
    tooltip: 'Fly away from the emitter centre (circle / ring) or off the path, plus Direction',
  },
  {
    id: 'emit.speed',
    label: 'Speed',
    group: M,
    type: 'float',
    min: 0,
    max: 3000,
    step: 1,
    default: 160,
    unit: 'px/s',
  },
  {
    id: 'emit.speedVariance',
    label: 'Speed variance',
    group: M,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.4,
  },
  {
    id: 'emit.inherit',
    label: 'Inherit velocity',
    group: M,
    type: 'float',
    min: 0,
    max: 200,
    step: 1,
    default: 0,
    unit: '%',
    tooltip: 'Particles keep this much of the emitter’s own speed (a fast swing throws them)',
  },
  {
    id: 'emit.local',
    label: 'Move with emitter',
    group: M,
    type: 'bool',
    default: false,
    tooltip:
      'Off: particles are left behind where they were born (trails). On: they move with the emitter (auras).',
  },
  {
    id: 'emit.drag',
    label: 'Drag',
    group: M,
    type: 'float',
    min: 0,
    max: 20,
    step: 0.05,
    default: 0.6,
    tooltip: 'Slows particles down (per second)',
  },
  {
    id: 'emit.gravity',
    label: 'Gravity',
    group: M,
    type: 'float',
    min: -3000,
    max: 8000,
    step: 5,
    default: 0,
    unit: 'px/s²',
    tooltip: 'Down (+) or up (−, buoyancy: smoke, embers)',
  },
  {
    id: 'emit.turbulence',
    label: 'Turbulence',
    group: M,
    type: 'float',
    min: 0,
    max: 400,
    step: 1,
    default: 0,
    unit: 'px',
    tooltip: 'Random wandering (embers, dust)',
  },
  {
    id: 'emit.turbSpeed',
    label: 'Turbulence speed',
    group: M,
    type: 'float',
    min: 0.05,
    max: 10,
    step: 0.05,
    default: 1.2,
    tooltip: 'How quickly the wandering changes direction',
  },
  {
    id: 'emit.wind',
    label: 'Wind sway',
    group: M,
    type: 'float',
    min: 0,
    max: 400,
    step: 1,
    default: 0,
    unit: 'px',
    tooltip:
      'One slow wind shared by all particles: older ones sway more, the stream bends like an S (smoke)',
  },
  {
    id: 'emit.windSpeed',
    label: 'Wind speed',
    group: M,
    type: 'float',
    min: 0.05,
    max: 4,
    step: 0.05,
    default: 0.4,
    unit: '/s',
    tooltip: 'Wind sways per second (loops: whole sways per loop)',
  },
  {
    id: 'emit.alignToVelocity',
    label: 'Align to motion',
    group: M,
    type: 'bool',
    default: false,
  },
  {
    id: 'emit.randomRotation',
    label: 'Random rotation',
    group: M,
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 0,
    unit: '°',
  },
  {
    id: 'emit.spin',
    label: 'Spin',
    group: M,
    type: 'float',
    min: 0,
    max: 1440,
    step: 1,
    default: 0,
    unit: '°/s',
  },
  {
    id: 'emit.life',
    label: 'Life',
    group: L,
    type: 'float',
    min: 0.05,
    max: 10,
    step: 0.01,
    default: 1.2,
    unit: 's',
  },
  {
    id: 'emit.lifeVariance',
    label: 'Life variance',
    group: L,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.4,
  },
  {
    id: 'emit.size',
    label: 'Size',
    group: L,
    type: 'float',
    min: 0.02,
    max: 6,
    step: 0.01,
    default: 1,
  },
  {
    id: 'emit.sizeVariance',
    label: 'Size variance',
    group: L,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.4,
  },
  {
    id: 'emit.scaleOverLife',
    label: 'Size over life',
    group: L,
    type: 'curve',
    yMin: 0,
    yMax: 2,
    default: [
      { x: 0, y: 0.6 },
      { x: 0.2, y: 1 },
      { x: 1, y: 0.2 },
    ],
  },
  {
    id: 'emit.opacityOverLife',
    label: 'Opacity over life',
    group: L,
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 0.7, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  {
    id: 'emit.flicker',
    label: 'Flicker',
    group: L,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'Random twinkle of each particle’s opacity',
  },
  {
    id: 'emit.colorVariance',
    label: 'Colour variance',
    group: L,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.15,
    tooltip: 'Each particle starts somewhere else along the ramp',
  },
  {
    id: 'trail.count',
    label: 'Trail copies',
    group: T,
    type: 'int',
    min: 0,
    max: 16,
    default: 0,
    tooltip: 'Fading copies behind each particle (0 = off)',
  },
  {
    id: 'trail.spacing',
    label: 'Trail spacing',
    group: T,
    type: 'float',
    min: 0.005,
    max: 0.25,
    step: 0.005,
    default: 0.03,
    unit: 's',
  },
  {
    id: 'trail.fade',
    label: 'Trail fade',
    group: T,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.75,
  },
  {
    id: 'trail.shrink',
    label: 'Trail shrink',
    group: T,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.4,
  },
];

/** @param {Record<string, any>} v */
export const readEmitterParams = (v) => ({
  rate: v['emit.rate'],
  pulseEvery: v['emit.pulseEvery'],
  pulseCount: v['emit.pulseCount'],
  start: v['emit.start'],
  stop: v['emit.stop'],
  prewarm: v['emit.prewarm'],
  shape: v['emit.shape'],
  width: v['emit.width'],
  height: v['emit.height'],
  max: v['emit.maxParticles'],
  direction: v['emit.direction'],
  cone: v['emit.cone'],
  outward: v['emit.outward'],
  speed: v['emit.speed'],
  speedVariance: v['emit.speedVariance'],
  inherit: v['emit.inherit'] / 100,
  local: v['emit.local'],
  drag: v['emit.drag'],
  gravity: v['emit.gravity'],
  turbulence: v['emit.turbulence'],
  turbSpeed: v['emit.turbSpeed'],
  wind: v['emit.wind'] ?? 0,
  windSpeed: v['emit.windSpeed'] ?? 0.4,
  alignToVelocity: v['emit.alignToVelocity'],
  randomRotation: v['emit.randomRotation'],
  spin: v['emit.spin'],
  life: v['emit.life'],
  lifeVariance: v['emit.lifeVariance'],
  size: v['emit.size'],
  sizeVariance: v['emit.sizeVariance'],
  scaleOverLife: v['emit.scaleOverLife'],
  opacityOverLife: v['emit.opacityOverLife'],
  flicker: v['emit.flicker'],
  colorVariance: v['emit.colorVariance'],
  trailCount: v['trail.count'],
  trailSpacing: v['trail.spacing'],
  trailFade: v['trail.fade'],
  trailShrink: v['trail.shrink'],
});

/** @typedef {ReturnType<typeof readEmitterParams>} EmitterParams */
/** @typedef {[number, number, number, number, number, number]} Mat */
const ID = /** @type {Mat} */ ([1, 0, 0, 1, 0, 0]);

/** Noise per layer seed (small cache: building one shuffles a table). */
const noises = new Map();
/** @param {number} seed */
function noiseFor(seed) {
  let n = noises.get(seed);
  if (!n) {
    n = createNoise(seed);
    noises.set(seed, n);
    if (noises.size > 64) noises.delete(noises.keys().next().value);
  }
  return n;
}

/**
 * A spawn point (emitter LOCAL px) and an outward direction (radians, 0 = right), or null.
 * @param {EmitterParams} p @param {ReturnType<typeof createRng>} rng
 * @param {import('../render/masks.js').Mask | null} path
 */
function spawnPoint(p, rng, path) {
  const u = rng.next();
  const v = rng.next();
  switch (p.shape) {
    case 'line':
      return { x: (u - 0.5) * p.width, y: 0, out: -Math.PI / 2 };
    case 'circle': {
      const a = v * Math.PI * 2;
      const r = (Math.sqrt(u) * p.width) / 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r, out: a };
    }
    case 'ring': {
      const a = v * Math.PI * 2;
      return { x: (Math.cos(a) * p.width) / 2, y: (Math.sin(a) * p.width) / 2, out: a };
    }
    case 'box':
      return { x: (u - 0.5) * p.width, y: (v - 0.5) * p.height, out: -Math.PI / 2 };
    case 'path': {
      const q = path ? pointOnPath(path, u) : null;
      // outward = the path's normal (to the left of its direction)
      return q ? { x: q.x, y: q.y, out: q.angle - Math.PI / 2 } : { x: 0, y: 0, out: -Math.PI / 2 };
    }
    default:
      return { x: 0, y: 0, out: -Math.PI / 2 };
  }
}

/**
 * Birth time of particle k (seconds), with the rate / pulse schedule.
 * @param {EmitterParams} p @param {number} k @param {number} rate particles / s (loop-adjusted)
 * @param {number} jitter 0–1
 */
function birthOf(p, k, rate, jitter) {
  if (p.pulseEvery > 0) return p.start + Math.floor(k / p.pulseCount) * p.pulseEvery;
  return p.start + (k + jitter) / rate;
}

/**
 * Particles alive at layer time `seconds`.
 * @param {EmitterParams} p
 * @param {{ seconds: number, seed: number, timing: import('../core/timing.js').Timing,
 *   matrix?: number[], matrixAt?: (seconds: number) => number[], path?: import('../render/masks.js').Mask | null }} f
 * @returns {any[] & { worldSpace?: boolean }}
 */
export function emitterInstances(p, f) {
  /** @type {any[] & { worldSpace?: boolean }} */
  const out = [];
  const loop = !!f.timing.loop;
  const period = f.timing.frameCount / f.timing.fps;
  const pulses = p.pulseEvery > 0;
  // particles per second, and (loops) how many per loop so the schedule repeats exactly
  let rate = pulses ? p.pulseCount / p.pulseEvery : p.rate;
  if (rate <= 0) return out;
  let perLoop = 0;
  if (loop && !pulses) {
    perLoop = Math.max(1, Math.round(rate * period));
    rate = perLoop / period;
  } else if (loop && pulses) {
    perLoop = Math.max(1, Math.round(period / p.pulseEvery)) * p.pulseCount;
  }
  const T = f.seconds;
  const maxLife = p.life;
  // shared wind (loops: whole sways per loop period, so the loop stays seamless)
  const windRate = loop ? Math.max(1, Math.round(p.windSpeed * period)) / period : p.windSpeed;
  // index range that can be alive now
  const first = pulses
    ? Math.floor(((T - maxLife - p.start) / p.pulseEvery) * p.pulseCount) - p.pulseCount
    : Math.floor((T - maxLife - p.start) * rate) - 1;
  const last = pulses
    ? (Math.floor((T - p.start) / p.pulseEvery) + 1) * p.pulseCount - 1
    : Math.floor((T - p.start) * rate) + 1;
  const space = p.local || !f.matrixAt ? 'local' : 'world';
  if (space === 'world') out.worldSpace = true;
  const noise = noiseFor(f.seed);
  const deg = Math.PI / 180;
  const h = 1 / 120;
  /** emitter matrix at birth (world mode), wrapped into the loop */
  const matAt = (/** @type {number} */ b) => {
    if (!f.matrixAt) return ID;
    const s = loop ? b - Math.floor(b / period) * period : Math.max(0, b);
    return /** @type {Mat} */ (f.matrixAt(s));
  };

  let count = 0; // particles (trail copies don't count against the cap)
  for (let k = last; k >= first && count < p.max; k--) {
    const id = loop ? ((k % perLoop) + perLoop) % perLoop : k;
    const seed = subSeed(f.seed, 'emit', id);
    const rng = createRng(seed);
    // fixed draw order: every particle is stable whatever happens around it
    const jitter = rng.next();
    const life = Math.max(0.02, p.life * (1 - p.lifeVariance * rng.next()));
    const spread = (rng.next() - 0.5) * p.cone * deg;
    const speed = p.speed * (1 - p.speedVariance * rng.next());
    const size = p.size * (1 - p.sizeVariance * rng.next());
    const rot0 = (rng.next() - 0.5) * p.randomRotation * deg;
    const spinDir = rng.sign();
    const rampShift = (rng.next() - 0.5) * p.colorVariance;
    const flickPhase = rng.next() * 100;
    const sp = spawnPoint(p, rng, f.path ?? null);

    let b = birthOf(p, k, rate, pulses ? 0 : jitter);
    if (pulses) b += jitter * 0.02; // a pulse is not a single instant (never before its time)
    // non-loops: emit only between start and stop (pre-warm also before start)
    if (!loop) {
      if (b > p.stop) continue;
      if (b < p.start && !p.prewarm) continue;
    }
    const age = T - b;
    if (age < 0 || age > life) continue;
    count++;

    // direction (emitter local, 0 = up) → velocity
    let dirA = (p.direction - 90) * deg + spread;
    if (p.outward) dirA += sp.out + Math.PI / 2;
    let v0x = Math.cos(dirA) * speed;
    let v0y = Math.sin(dirA) * speed;
    let x0 = sp.x;
    let y0 = sp.y;
    let sizeK = 1;
    if (space === 'world') {
      const m = matAt(b);
      // place + aim with the emitter at birth (rotation from its matrix; size from its scale)
      const lx = sp.x;
      const ly = sp.y;
      x0 = m[0] * lx + m[2] * ly + m[4];
      y0 = m[1] * lx + m[3] * ly + m[5];
      const rot = Math.atan2(m[1], m[0]);
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      const vx = v0x * c - v0y * s;
      const vy = v0x * s + v0y * c;
      v0x = vx;
      v0y = vy;
      sizeK = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
      if (p.inherit > 0) {
        const a = matAt(b - h);
        const z = matAt(b + h);
        v0x += (((z[0] - a[0]) * lx + (z[2] - a[2]) * ly + (z[4] - a[4])) / (2 * h)) * p.inherit;
        v0y += (((z[1] - a[1]) * lx + (z[3] - a[3]) * ly + (z[5] - a[5])) / (2 * h)) * p.inherit;
      }
    }
    const v0 = Math.hypot(v0x, v0y);

    /** the particle at age a (seconds) */
    const at = (/** @type {number} */ a) => {
      const mx = motion1D(v0x, 0, p.drag, a);
      const my = motion1D(v0y, p.gravity, p.drag, a);
      let x = x0 + mx.x;
      let y = y0 + my.x;
      if (p.turbulence > 0) {
        const tt = a * p.turbSpeed;
        x += p.turbulence * (noise.noise2D(tt, id * 1.37) - noise.noise2D(0, id * 1.37));
        y += p.turbulence * (noise.noise2D(tt + 31.7, id * 1.37) - noise.noise2D(31.7, id * 1.37));
      }
      if (p.wind > 0) {
        // the wind pushes older smoke further; the phase lags with age → an S-shaped stream
        x +=
          p.wind *
          (1 - Math.exp(-a / 0.9)) *
          Math.sin(2 * Math.PI * (windRate * (b + a) - 0.3 * a));
      }
      return { x, y, vx: mx.v, vy: my.v };
    };

    /** push one drawn copy (trail index i: 0 = the particle itself) */
    const push = (/** @type {number} */ a, /** @type {number} */ i) => {
      if (a < 0) return;
      const u = a / life;
      const st = at(a);
      let opacity = Math.min(1, Math.max(0, evalCurve(p.opacityOverLife, u)));
      if (p.flicker > 0) {
        const n = noise.noise2D(a * 9 + flickPhase, id * 0.71) * 0.5 + 0.5;
        opacity *= 1 - p.flicker * n;
      }
      let scale = size * sizeK * evalCurve(p.scaleOverLife, u);
      if (i > 0) {
        const k2 = i / (p.trailCount + 1);
        opacity *= 1 - p.trailFade * k2;
        scale *= 1 - p.trailShrink * k2;
      }
      if (scale <= 0 || opacity <= 0.002) return;
      const vLen = Math.hypot(st.vx, st.vy);
      const rotation = p.alignToVelocity
        ? vLen > 1e-9
          ? Math.atan2(st.vy, st.vx)
          : Math.atan2(v0y, v0x)
        : rot0 + spinDir * p.spin * deg * a;
      out.push({
        x: st.x,
        y: st.y,
        rotation,
        scale,
        opacity,
        age: u,
        ageS: a,
        seed,
        vx: st.vx,
        vy: st.vy,
        speedRatio: v0 > 0 ? vLen / v0 : 1,
        rampShift,
      });
    };
    // trails first (drawn under the particle)
    for (let i = p.trailCount; i >= 1; i--) push(age - i * p.trailSpacing, i);
    push(age, 0);
  }
  // built newest-first (so the cap keeps the newest); draw oldest first, newest on top
  out.reverse();
  return out;
}
