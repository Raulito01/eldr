// @ts-check
/**
 * Fire presets (D-081), built on Raul's "Dancing Flame" recipe (his preset, 2026-10-02): a dense
 * stream of rising sparkle particles whose per-layer GOO (7.5, choke 0.21, no details) melts them
 * into one flame body with licking tongues; in the Dancing Flames the emitter sways with eased keys,
 * and because the particles stay where they were born, the body bends and whips like a real flame
 * (the other presets have no keys: turbulence, cone and drag give each its own look); a smaller
 * additive copy without goo makes the hot core. `flameRig()` builds that recipe so every fire
 * preset shares it.
 *
 * Layer presets: Dancing Flame (Raul's, pink), Dancing Flame (fire), Campfire, Torch, Fireball,
 * Burning Ground, Fire Breath. Particle presets: Flamethrower, Burning Trail, Fire Rain.
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { setKey } from '../../core/keyframes.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp, SHRINK, SOFT_LIFE } from '../presetKit.js';

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
const FLAT = curve([
  [0, 1],
  [1, 1],
]);
/** Wood: light grain → bark → charcoal. */
const WOOD = ramp([
  [0, '#b07a4a'],
  [0.5, '#6b3f22'],
  [1, '#2a170d'],
]);
/** Warm light on the ground under a fire. */
const EMBER_GLOW = ramp([
  [0, '#ffcf6b'],
  [0.5, '#ff7a2a'],
  [1, '#5a1a0a'],
]);
/** Scorched ground: glowing cracks → char. */
const SCORCH = ramp([
  [0, '#5a2210'],
  [0.5, '#2a1410'],
  [1, '#120b0a'],
]);
/** Thin grey smoke. */
const SMOKE = ramp([
  [0, '#d8d4d0'],
  [0.5, '#8a8480'],
  [1, '#3a3634'],
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
 * @property {number} [start]  start emitting (s)
 * @property {number} [choke]  goo choke (Raul: 0.21; higher = the tips break off into wisps)
 * @property {number} [lifeVariance]  (Raul: 0.4; higher = tongues of uneven height)
 * @property {any[]} [scaleOverLife]  particle size over life
 * @property {number} [drag]  (Raul: 0.2; high = a fast jet slows and rolls)
 * @property {boolean} [core=true]  the additive hot core
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
    'emit.drag': o.drag ?? 0.2,
    'emit.gravity': (o.gravity ?? -215) * k,
    'emit.spin': 60,
    'emit.life': o.life ?? 1.2,
    'emit.lifeVariance': o.lifeVariance ?? 0.4,
    'emit.scaleOverLife':
      o.scaleOverLife ??
      curve([
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
    ...(o.start !== undefined ? { 'emit.start': o.start } : {}),
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
      'goo.threshold': o.choke ?? 0.21,
      'goo.softness': 0.02,
      'goo.keepShapes': false,
    },
  });
  if (o.core === false) return [body];
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
    // (only the Dancing Flames sway with keys; the others move by turbulence alone)
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

/** A flat glow / patch on the ground (a blob squashed flat). */
const groundPatch = (
  /** @type {ReturnType<typeof compose>} */ c,
  /** @type {string} */ label,
  /** @type {{ x?: number, y: number, r: number, flat?: number, ramp: any[], blend?: any, glow?: number, opacity?: number, noise?: number }} */ p,
) =>
  c.add('blob', label, {
    ...(p.blend ? { blend: p.blend } : {}),
    transform: { x: p.x ?? 0, y: p.y, scaleX: 100, scaleY: (p.flat ?? 0.25) * 100 },
    params: {
      'blob.radius': p.r,
      'blob.noise': p.noise ?? 0.2,
      'blob.wobble': 0,
      'style.ramp': p.ramp,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': curve([
        [0, p.opacity ?? 1],
        [1, p.opacity ?? 1],
      ]),
      'glow.amount': p.glow ?? 0,
      'glow.radius': 40,
    },
  });

/** A wooden stick / log (a thick streak). */
const log = (
  /** @type {ReturnType<typeof compose>} */ c,
  /** @type {string} */ label,
  /** @type {{ x: number, y: number, rotation: number, length: number, thickness: number }} */ p,
) =>
  c.add('streak', label, {
    transform: { x: p.x, y: p.y, rotation: p.rotation },
    params: {
      'streak.length': p.length,
      'streak.thickness': p.thickness,
      'streak.taper': 0,
      'style.ramp': WOOD,
      'style.bands': 3,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
    },
  });

/** A thin smoke wisp rising off a fire. */
const smokeWisp = (
  /** @type {ReturnType<typeof compose>} */ c,
  /** @type {{ x?: number, y: number, width?: number, rate?: number, length?: number }} */ p,
) =>
  c.add('wispEmitter', 'Smoke wisps', {
    transform: { x: p.x ?? 0, y: p.y },
    params: {
      'emit.shape': 'line',
      'emit.width': p.width ?? 30,
      'emit.rate': p.rate ?? 2,
      'emit.speed': 50,
      'emit.gravity': -40,
      'emit.life': 2,
      'emit.opacityOverLife': curve([
        [0, 0],
        [0.2, 0.45],
        [0.6, 0.35],
        [1, 0],
      ]),
      'wisp.length': p.length ?? 120,
      'wisp.width': 8,
      'style.ramp': SMOKE,
    },
  });

/**
 * Campfire: crossed logs; a wide bed of short, uneven tongues licking up (no keys — the tongues
 * move by turbulence); embers crackling out in little pops; a warm glow on the ground; a thin
 * smoke wisp above. Loops.
 */
function campfire() {
  const c = compose({ timing: loop(48) });
  groundPatch(c, 'Ground glow', {
    y: 196,
    r: 150,
    flat: 0.2,
    ramp: EMBER_GLOW,
    blend: 'add',
    glow: 0.6,
    opacity: 0.35,
    noise: 0,
  });
  log(c, 'Log', { x: -10, y: 190, rotation: 14, length: 190, thickness: 22 });
  log(c, 'Log', { x: 10, y: 192, rotation: -16, length: 180, thickness: 20 });
  // three tongues of different heights, no keys: turbulence makes them lick and flicker
  const tongue = (/** @type {string} */ label, /** @type {number} */ x, /** @type {number} */ k) =>
    flameRig(c, {
      label,
      x,
      y: 182,
      size: k,
      rate: 200,
      speed: 170,
      gravity: -330,
      cone: 12,
      life: 1,
      lifeVariance: 0.55,
      turbulence: 28,
      scaleOverLife: curve([
        [0, 0],
        [0.2, 1],
        [1, 0.05],
      ]),
    });
  tongue('Left tongue', -38, 0.75);
  tongue('Right tongue', 40, 0.8);
  tongue('Centre tongue', 0, 1.05);
  c.add('dotEmitter', 'Crackling embers', {
    blend: 'add',
    transform: { y: 170 },
    params: {
      'emit.shape': 'line',
      'emit.width': 90,
      'emit.rate': 6,
      'emit.pulseEvery': 0.5,
      'emit.pulseCount': 5,
      'emit.cone': 40,
      'emit.speed': 220,
      'emit.speedVariance': 0.7,
      'emit.gravity': -60,
      'emit.turbulence': 40,
      'emit.life': 1.5,
      'emit.flicker': 0.6,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 3,
      'style.ramp': FIRE,
      'glow.amount': 0.9,
    },
  });
  smokeWisp(c, { y: 40, width: 40, rate: 2 });
  return c.done();
}

/** Torch: a wooden handle; one tall, narrow, fast flame leaning in a draft; sparks; smoke. Loops. */
function torch() {
  const c = compose({ timing: loop(48) });
  log(c, 'Handle', { x: 0, y: 230, rotation: 90, length: 170, thickness: 18 });
  groundPatch(c, 'Torch head', { y: 150, r: 20, flat: 0.8, ramp: WOOD });
  flameRig(c, {
    label: 'Torch flame',
    y: 140,
    size: 1.05,
    rate: 210,
    direction: 6,
    cone: 4,
    speed: 240,
    gravity: -340,
    life: 0.85,
    lifeVariance: 0.3,
    turbulence: 16,
    scaleOverLife: curve([
      [0, 0],
      [0.15, 1],
      [1, 0.1],
    ]),
  });
  c.add('sparkEmitter', 'Sparks', {
    blend: 'add',
    transform: { y: 120 },
    params: {
      'emit.rate': 8,
      'emit.direction': 8,
      'emit.cone': 30,
      'emit.speed': 260,
      'emit.speedVariance': 0.6,
      'emit.gravity': -40,
      'emit.turbulence': 30,
      'emit.life': 0.9,
      'emit.flicker': 0.6,
      'style.ramp': FIRE,
    },
  });
  smokeWisp(c, { x: 10, y: -30, width: 16, rate: 1.5, length: 140 });
  return c.done();
}

/**
 * Fireball: a round blazing ball with its flames streaming back, as if it flies to the right.
 * It stays put (no keys): a game moves the projectile itself. Loops.
 */
function fireball() {
  const c = compose({ timing: loop(48) });
  flameRig(c, {
    label: 'Fireball',
    x: 90,
    y: 0,
    shape: 'circle',
    width: 70,
    direction: -90,
    cone: 14,
    speed: 540,
    gravity: -60,
    rate: 400,
    size: 1.1,
    life: 0.8,
    turbulence: 25,
    scaleOverLife: curve([
      [0, 0.6],
      [0.15, 1],
      [1, 0.15],
    ]),
  });
  c.add('blob', 'Hot core', {
    blend: 'add',
    transform: { x: 90, y: 0 },
    params: {
      'blob.radius': 30,
      'blob.noise': 0.15,
      'blob.wobble': 8,
      'style.ramp': FIRE,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 1.2,
      'glow.radius': 40,
    },
  });
  return c.done();
}

/** Burning Ground: a dark scorched patch with low, uneven flames licking all along it. Loops. */
function burningGround() {
  const c = compose({ timing: loop(48) });
  groundPatch(c, 'Scorch', { y: 196, r: 230, flat: 0.16, ramp: SCORCH });
  // a row of uneven tongues (different sizes and turbulence), no keys
  const row = [
    [-150, 0.8],
    [-75, 1],
    [0, 0.85],
    [75, 1.05],
    [150, 0.8],
  ];
  row.forEach(([x, k], i) =>
    flameRig(c, {
      label: `Ground flame ${i + 1}`,
      x,
      y: 195,
      shape: 'line',
      width: 40,
      size: k,
      rate: 260,
      speed: 170,
      gravity: -340,
      cone: 8,
      life: 0.9,
      lifeVariance: 0.55,
      turbulence: 22 + i * 4,
      scaleOverLife: curve([
        [0, 0],
        [0.2, 1],
        [1, 0.05],
      ]),
    }),
  );
  embers(c, { y: 180, width: 380, rate: 14 });
  return c.done();
}

/**
 * Fire Breath: a tight, fast blast from the mouth that slows and swells into a wide, rolling cone
 * (white-hot at the mouth, red at the edges); smoke puffs at the end; a short sputter. One-shot,
 * timed by the emitters' start / stop (no keys).
 */
function fireBreath() {
  const c = compose({ timing: oneShot(44) });
  const mouth = { x: -210, y: 0 };
  // smoke under the flames (drawn first)
  c.add('puffEmitter', 'Smoke', {
    transform: { x: mouth.x + 60, y: mouth.y },
    params: {
      'emit.start': 0.6,
      'emit.stop': 1.3,
      'emit.rate': 12,
      'emit.direction': 90,
      'emit.cone': 20,
      'emit.speed': 520,
      'emit.drag': 2.4,
      'emit.gravity': -80,
      'emit.turbulence': 30,
      'emit.life': 1.1,
      'emit.opacityOverLife': curve([
        [0, 0],
        [0.4, 0.5],
        [1, 0],
      ]),
      'emit.scaleOverLife': curve([
        [0, 0.4],
        [1, 1.4],
      ]),
      'puff.radius': 34,
      'style.ramp': SMOKE,
    },
  });
  flameRig(c, {
    label: 'Breath',
    ...mouth,
    direction: 90,
    cone: 12,
    speed: 700,
    drag: 2.2,
    gravity: -90,
    rate: 400,
    life: 0.8,
    size: 1.1,
    turbulence: 30,
    stop: 0.95,
    scaleOverLife: curve([
      [0, 0.3],
      [0.3, 1],
      [1, 1.7],
    ]),
  });
  flameRig(c, {
    label: 'Sputter',
    ...mouth,
    direction: 90,
    cone: 30,
    speed: 160,
    gravity: -200,
    rate: 120,
    life: 0.5,
    size: 0.6,
    start: 0.95,
    stop: 1.35,
    core: false,
  });
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Flamethrower: a narrow pressurised jet that slows at its end and bursts into rolling flame. Loops. */
function flamethrower() {
  const c = compose({ timing: loop(24) });
  flameRig(c, {
    label: 'Jet',
    x: -230,
    y: 40,
    direction: 82,
    cone: 4,
    speed: 760,
    drag: 1.8,
    gravity: -160,
    rate: 400,
    life: 0.75,
    turbulence: 30,
    scaleOverLife: curve([
      [0, 0.25],
      [0.35, 0.9],
      [1, 1.8],
    ]),
  });
  c.add('blob', 'Nozzle flare', {
    blend: 'add',
    transform: { x: -230, y: 40 },
    params: {
      'blob.radius': 16,
      'blob.noise': 0.3,
      'blob.wobble': 14,
      'style.ramp': FIRE,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 1.4,
      'glow.radius': 30,
    },
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

/**
 * Spirit Flame: tall, thin, upright and calm, cold blue; a higher choke lets the tip break off into
 * floating wisps that drift up and fade; no hot sparks. Loops.
 */
function spiritFlame() {
  const c = compose({ timing: loop(48) });
  flameRig(c, {
    label: 'Spirit flame',
    ramp: SPIRIT,
    y: 170,
    size: 1.35,
    rate: 170,
    cone: 5,
    speed: 110,
    gravity: -240,
    life: 1.7,
    lifeVariance: 0.5,
    turbulence: 34,
    goo: 9,
    choke: 0.34,
    scaleOverLife: curve([
      [0, 0],
      [0.15, 1],
      [0.6, 0.7],
      [1, 0.3],
    ]),
  });
  c.add('dotEmitter', 'Wisps', {
    blend: 'add',
    transform: { y: 60 },
    params: {
      'emit.shape': 'line',
      'emit.width': 50,
      'emit.rate': 5,
      'emit.cone': 20,
      'emit.speed': 50,
      'emit.gravity': -50,
      'emit.turbulence': 50,
      'emit.turbSpeed': 0.4,
      'emit.life': 2.2,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 9,
      'style.ramp': SPIRIT,
      'glow.amount': 1.2,
    },
  });
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
    blurb: 'Tall, thin and calm, cold blue; its tip breaks off into floating wisps. Seamless loop.',
    build: spiritFlame,
  },
  {
    id: 'campfire',
    name: 'Campfire',
    blurb:
      'Crossed logs, a bed of short uneven tongues, crackling embers, a ground glow and a smoke wisp. Seamless loop.',
    build: campfire,
  },
  {
    id: 'torch',
    name: 'Torch',
    blurb:
      'A handle with one tall, narrow flame leaning in a draft, sparks and smoke. Seamless loop.',
    build: torch,
  },
  {
    id: 'fireball',
    name: 'Fireball',
    blurb:
      'A blazing ball with its flames streaming back as if flying; stays in place so the game moves it. Seamless loop.',
    build: fireball,
  },
  {
    id: 'burningGround',
    name: 'Burning Ground',
    blurb: 'Low, uneven flames licking along a dark scorched patch. Seamless loop.',
    build: burningGround,
  },
  {
    id: 'fireBreath',
    name: 'Fire Breath',
    blurb: 'A tight blast that swells into a rolling cone, then smoke and a sputter. One-shot.',
    build: fireBreath,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const FIRE_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'flamethrower',
    name: 'Flamethrower',
    blurb: 'A narrow pressurised jet bursting into rolling flame at its end. Seamless loop.',
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
