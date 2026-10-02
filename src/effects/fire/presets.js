// @ts-check
/**
 * Fire presets (D-081), built on Raul's "Dancing Flame" recipe (his preset, 2026-10-02): a dense
 * stream of rising sparkle particles whose per-layer GOO (7.5, choke 0.21, no details) melts them
 * into one flame body with licking tongues; the emitter sways with eased keys, and because the
 * particles stay where they were born, the body bends and whips like a real flame; a smaller
 * additive copy without goo makes the hot core. `flameRig()` builds that recipe so every fire
 * preset shares it.
 *
 * Layer presets: Dancing Flame (Raul's, pink), Dancing Flame (fire), Campfire, Torch, Fireball,
 * Burning Ground, Fire Breath. Particle presets: Flamethrower, Burning Trail, Fire Rain.
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { setKey } from '../../core/keyframes.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp, SHRINK } from '../presetKit.js';

/** Raul's pink. */
const PINK = ramp([
  [0, '#ffffff'],
  [0.25, '#ffd6f4'],
  [0.5, '#ff7ad9'],
  [0.75, '#d43aa8'],
  [1, '#5e1a5a'],
]);
/** Cel fire: white core → yellow → orange → red → ember. */
export const FIRE = ramp([
  [0, '#ffffff'],
  [0.25, '#fff3b0'],
  [0.5, '#ffb23d'],
  [0.75, '#ff5a1f'],
  [1, '#8a1a1a'],
]);
/** Blue spirit fire (variant). */
const SPIRIT = ramp([
  [0, '#ffffff'],
  [0.25, '#d6fbff'],
  [0.5, '#5fd6ff'],
  [0.75, '#2f6dff'],
  [1, '#1a1a6e'],
]);

/**
 * @typedef {object} FlameRigOptions
 * @property {string} [label]
 * @property {number} [x] @property {number} [y]   emitter position (the flame's base)
 * @property {number} [sway]  px left / right the base swings (0 = still)
 * @property {number} [swayPeriod]  seconds for one swing back and forth (loops: the loop length)
 * @property {number} [size=1]  overall flame size
 * @property {number} [rate]  particles / s (Raul: 226)
 * @property {number} [speed]  rise speed (Raul: 158)
 * @property {number} [gravity]  (Raul: −215, negative = rises)
 * @property {number} [direction]  0 = up
 * @property {number} [cone]
 * @property {string} [shape]  emitter shape ('point', 'line', 'circle' …)
 * @property {number} [width]  emitter width (line / circle)
 * @property {number} [life]
 * @property {number} [turbulence]
 * @property {any[]} [ramp]
 * @property {number} [goo]  goo amount (Raul: 7.5)
 * @property {number} [stop]  stop emitting (s)
 * @property {Record<string, any>} [extra]  more params for both layers
 */

/**
 * Raul's Dancing Flame recipe: a gooey flame body + an additive hot core, optionally swaying.
 * @param {ReturnType<typeof compose>} c @param {FlameRigOptions} o @returns {string[]} [body, core]
 */
export function flameRig(c, o = {}) {
  const k = o.size ?? 1;
  const base = {
    'sparkle.size': 18,
    'style.ramp': o.ramp ?? FIRE,
    'style.rampOverLife': curve([
      [0, 0],
      [1, 1],
    ]),
    'style.spread': 0.6,
    'style.bands': 2,
    'style.bandNoise': 0.25,
    'glow.amount': 1.34,
    'glow.radius': 17,
    'emit.rate': o.rate ?? 226,
    'emit.shape': o.shape ?? 'point',
    'emit.width': o.width ?? 200,
    'emit.direction': o.direction ?? 0,
    'emit.cone': o.cone ?? 10,
    'emit.speed': (o.speed ?? 158) * k,
    'emit.speedVariance': 0.96,
    'emit.drag': 0.2,
    'emit.gravity': (o.gravity ?? -215) * k,
    'emit.spin': 60,
    'emit.life': o.life ?? 1.2,
    'emit.lifeVariance': 0.4,
    'emit.scaleOverLife': curve([
      [0, 0],
      [0.2, 1],
      [1, 0.2],
    ]),
    'emit.opacityOverLife': curve([
      [0, 0],
      [0.12, 1],
      [0.65, 1],
      [1, 0],
    ]),
    'emit.flicker': 0.5,
    'emit.colorVariance': 0.15,
    // dense flames outgrow the default safety cap (the cap keeps only the newest: a cut-off flame)
    'emit.maxParticles': 1500,
    ...(o.stop !== undefined ? { 'emit.stop': o.stop } : {}),
    ...o.extra,
  };
  const t = { x: o.x ?? 0, y: o.y ?? 0, scaleX: 84 * k, scaleY: 84 * k };
  const body = c.add('sparkleEmitter', `${o.label ?? 'Flame'}`, {
    transform: t,
    params: {
      ...base,
      'emit.size': 1.3,
      'emit.sizeVariance': 0.4,
      'emit.turbulence': o.turbulence ?? 0,
      'goo.amount': o.goo ?? 7.5,
      'goo.threshold': 0.21,
      'goo.softness': 0.02,
      'goo.keepShapes': false,
    },
  });
  const core = c.add('sparkleEmitter', `${o.label ?? 'Flame'} core`, {
    blend: 'add',
    transform: t,
    params: {
      ...base,
      'emit.size': 0.58,
      'emit.sizeVariance': 0.4,
      'emit.life': (o.life ?? 1.2) * 1.12,
      'emit.turbulence': 15,
    },
  });
  if (o.sway) {
    // swing out and back, landing exactly on the loop length so the loop is seamless
    const P = o.swayPeriod ?? 2;
    const x0 = (o.x ?? 0) + o.sway;
    const x1 = (o.x ?? 0) - o.sway;
    const keys = setKey(setKey(setKey([], 0, x0, 'ease'), P / 2, x1, 'ease'), P, x0, 'ease');
    for (const id of [body, core]) c.set(id, { keys: { 'transform.x': keys } });
  }
  return [body, core];
}

/** Embers rising from a fire (dots, flickering). */
const embers = (
  /** @type {ReturnType<typeof compose>} */ c,
  /** @type {Record<string, any>} */ p = {},
) =>
  c.add('dotEmitter', 'Embers', {
    blend: 'add',
    transform: { y: p.y ?? 160 },
    params: {
      'emit.shape': 'line',
      'emit.width': p.width ?? 120,
      'emit.rate': p.rate ?? 10,
      'emit.cone': 30,
      'emit.speed': 120,
      'emit.speedVariance': 0.6,
      'emit.gravity': -120,
      'emit.turbulence': 40,
      'emit.life': 1.6,
      'emit.flicker': 0.6,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 3,
      'style.ramp': p.ramp ?? FIRE,
      'glow.amount': 0.9,
    },
  });

// ── Layer presets ───────────────────────────────────────────────────────────────────────────

/** Raul's Dancing Flame, exactly (pink). Loops. */
function dancingFlamePink() {
  const c = compose({ timing: loop(48) });
  flameRig(c, { label: 'Dancing flame', ramp: PINK, x: 47, y: 101, sway: 124, swayPeriod: 2 });
  return c.done();
}

/** Dancing Flame in fire colours. Loops. */
function dancingFlame() {
  const c = compose({ timing: loop(48) });
  flameRig(c, { label: 'Dancing flame', x: 0, y: 140, sway: 90, swayPeriod: 2 });
  embers(c, { y: 140, width: 60, rate: 6 });
  return c.done();
}

/** Campfire: three flames swaying out of step, embers drifting up. Loops. */
function campfire() {
  const c = compose({ timing: loop(48) });
  flameRig(c, { label: 'Left flame', x: -50, y: 170, size: 0.8, sway: 18, life: 1 });
  flameRig(c, { label: 'Right flame', x: 50, y: 170, size: 0.85, sway: -22, life: 1 });
  flameRig(c, { label: 'Centre flame', x: 0, y: 175, size: 1.15, sway: 26, life: 1.2 });
  embers(c, { y: 160, width: 140, rate: 12 });
  return c.done();
}

/** Torch: a tall, narrow flame flickering on a point. Loops. */
function torch() {
  const c = compose({ timing: loop(48) });
  flameRig(c, {
    label: 'Torch flame',
    y: 150,
    size: 0.9,
    sway: 10,
    rate: 180,
    cone: 6,
    speed: 190,
    gravity: -260,
    turbulence: 10,
  });
  embers(c, { y: 130, width: 30, rate: 5 });
  return c.done();
}

/** Fireball: a ball of fire circling on a path, its flame tail whipping behind. Loops. */
function fireball() {
  const c = compose({ timing: loop(48) });
  const path = c.add('guide', 'Fireball path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 300,
    h: 180,
    path: [
      { x: 0, y: -0.5, ix: -0.28, iy: 0, ox: 0.28, oy: 0 },
      { x: 0.5, y: 0, ix: 0, iy: -0.28, ox: 0, oy: 0.28 },
      { x: 0, y: 0.5, ix: 0.28, iy: 0, ox: -0.28, oy: 0 },
      { x: -0.5, y: 0, ix: 0, iy: 0.28, ox: 0, oy: -0.28 },
    ],
  });
  const ball = c.add('null', 'Fireball');
  c.set(ball, {
    follow: { ...makeFollow(path, m), orient: false, loop: true },
    keys: { 'follow.progress': setKey(setKey([], 0, 0, 'linear'), 2, 100, 'linear') },
  });
  const ids = flameRig(c, {
    label: 'Fireball',
    shape: 'circle',
    width: 40,
    cone: 360,
    speed: 60,
    gravity: -120,
    life: 0.7,
    rate: 260,
  });
  for (const id of ids) c.parent(id, ball, { local: true });
  return c.done();
}

/** Burning Ground: a wall of licking flames along a line. Loops. */
function burningGround() {
  const c = compose({ timing: loop(48) });
  flameRig(c, {
    label: 'Fire line',
    y: 170,
    shape: 'line',
    width: 380,
    rate: 420,
    size: 0.85,
    turbulence: 20,
    sway: 12,
  });
  embers(c, { y: 160, width: 360, rate: 16 });
  return c.done();
}

/** Fire Breath: a cone of fire blasting sideways, then sputtering out. One-shot. */
function fireBreath() {
  const c = compose({ timing: oneShot(40) });
  flameRig(c, {
    label: 'Breath',
    x: -200,
    y: 0,
    direction: 90,
    cone: 22,
    speed: 520,
    gravity: -80,
    rate: 360,
    life: 0.9,
    size: 1.25,
    stop: 1.1,
  });
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Flamethrower: a continuous jet of gooey flame. Loops. */
function flamethrower() {
  const c = compose({ timing: loop(24) });
  flameRig(c, {
    label: 'Jet',
    x: -220,
    y: 40,
    direction: 80,
    cone: 14,
    speed: 640,
    gravity: -120,
    rate: 320,
    life: 0.7,
    turbulence: 25,
  });
  return c.done();
}

/** Burning Trail: a null flies along a drawn curve, leaving a ribbon of fire. One-shot. */
function burningTrail() {
  const c = compose({ timing: oneShot(48) });
  const path = c.add('guide', 'Trail path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 440,
    h: 280,
    closed: false,
    path: [
      { x: -0.5, y: 0.3, ix: 0, iy: 0, ox: 0.2, oy: -0.5 },
      { x: 0, y: 0, ix: -0.2, iy: 0.4, ox: 0.2, oy: -0.4 },
      { x: 0.5, y: -0.3, ix: -0.2, iy: 0.5, ox: 0, oy: 0 },
    ],
  });
  const head = c.add('null', 'Fire head');
  c.set(head, {
    follow: { ...makeFollow(path, m), orient: false },
    keys: { 'follow.progress': setKey(setKey([], 0, 0, 'ease'), 1.4, 100, 'ease') },
  });
  const ids = flameRig(c, {
    label: 'Trail fire',
    shape: 'circle',
    width: 30,
    cone: 360,
    speed: 50,
    gravity: -150,
    life: 0.9,
    stop: 1.4,
  });
  for (const id of ids) c.parent(id, head, { local: true });
  return c.done();
}

/** Fire Rain: blobs of fire falling at an angle, each dragging a gooey flame streak. Loops. */
function fireRain() {
  const c = compose({ timing: loop(24) });
  flameRig(c, {
    label: 'Falling fire',
    x: 60,
    y: -300,
    shape: 'line',
    width: 560,
    direction: 160,
    cone: 3,
    speed: 380,
    gravity: 420,
    rate: 26,
    life: 1.3,
    goo: 6,
    extra: {
      'emit.drag': 0,
      'emit.lifeVariance': 0.15,
      'sparkle.size': 26,
      // each drop drags a gooey tail behind it (trail copies merged by the goo)
      'trail.count': 10,
      'trail.spacing': 0.015,
      'trail.fade': 0.5,
      'trail.shrink': 0.7,
      'emit.scaleOverLife': curve([
        [0, 1],
        [1, 0.6],
      ]),
      'emit.opacityOverLife': curve([
        [0, 1],
        [0.8, 1],
        [1, 0],
      ]),
    },
  });
  return c.done();
}

/** Blue spirit flame (variant of the dancing flame). Loops. */
function spiritFlame() {
  const c = compose({ timing: loop(48) });
  flameRig(c, { label: 'Spirit flame', ramp: SPIRIT, y: 140, sway: 40, turbulence: 20 });
  embers(c, { y: 140, width: 60, rate: 6, ramp: SPIRIT });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const FIRE_PRESETS = Object.freeze([
  {
    id: 'dancingFlame',
    name: 'Dancing Flame',
    blurb: 'Raul’s recipe in fire colours: a gooey flame body whipping as it sways. Seamless loop.',
    build: dancingFlame,
  },
  {
    id: 'dancingFlamePink',
    name: 'Dancing Flame (Raul, pink)',
    blurb: 'Raul’s original Dancing Flame. Seamless loop (sway lands exactly on the loop).',
    build: dancingFlamePink,
  },
  {
    id: 'spiritFlame',
    name: 'Spirit Flame',
    blurb: 'A blue ghostly flame swaying gently. Seamless loop.',
    build: spiritFlame,
  },
  {
    id: 'campfire',
    name: 'Campfire',
    blurb: 'Three flames swaying out of step, embers drifting up. Seamless loop.',
    build: campfire,
  },
  {
    id: 'torch',
    name: 'Torch',
    blurb: 'A tall, narrow flame flickering on a point. Seamless loop.',
    build: torch,
  },
  {
    id: 'fireball',
    name: 'Fireball',
    blurb: 'A ball of fire circling on a path, its tail whipping behind. Seamless loop.',
    build: fireball,
  },
  {
    id: 'burningGround',
    name: 'Burning Ground',
    blurb: 'A wall of licking flames along a line. Seamless loop.',
    build: burningGround,
  },
  {
    id: 'fireBreath',
    name: 'Fire Breath',
    blurb: 'A cone of fire blasting sideways, then sputtering out. One-shot.',
    build: fireBreath,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const FIRE_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'flamethrower',
    name: 'Flamethrower',
    blurb: 'A continuous jet of gooey flame. Seamless loop.',
    build: flamethrower,
  },
  {
    id: 'burningTrail',
    name: 'Burning Trail',
    blurb: 'A fire head flies along a drawn curve, leaving a ribbon of fire. One-shot.',
    build: burningTrail,
  },
  {
    id: 'fireRain',
    name: 'Fire Rain',
    blurb: 'Fire falling at an angle in gooey streaks. Seamless loop.',
    build: fireRain,
  },
]);
