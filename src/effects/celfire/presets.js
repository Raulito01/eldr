// @ts-check
/**
 * Cel Fire presets (D-090): a new family built on the "bitten teardrop" Cel flame layer (Raul's
 * After Effects reference: circles rising along a teardrop are cut out of it, the shape wobbles,
 * a smaller copy inside is the hot core). Flat anime-cel colours, seamless loops. The Fire
 * family (Raul's gooey Dancing Flame recipe) stays as it is; this is a second look.
 */

import { setKey } from '../../core/keyframes.js';
import { rampPreset } from '../../render/rampPresets.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp, SHRINK } from '../presetKit.js';

const WOOD = ramp([
  [0, '#b07a4a'],
  [0.5, '#6b3f22'],
  [1, '#2a170d'],
]);
const WAX = ramp([
  [0, '#fffaf0'],
  [0.5, '#f1e4c8'],
  [1, '#b9a587'],
]);
const FLAT = curve([
  [0, 1],
  [1, 1],
]);
/** Flame particles cool only a little over their life. */
const COOL_A_LITTLE = curve([
  [0, 0],
  [1, 0.2],
]);
/** A colour that stays put (ramp position 0). */
const HOLD_HOT = curve([
  [0, 0],
  [1, 0],
]);

/**
 * One cel flame layer. @param {ReturnType<typeof compose>} c @param {string} label
 * @param {{ x?: number, y?: number, ramp?: any[], seedKey?: string } & Record<string, any>} o
 */
function celFlame(c, label, o = {}) {
  const { x = 0, y = 150, ramp: r, seedKey, ...params } = o;
  const id = c.add('celFlame', label, {
    transform: { x, y },
    params: { ...(r ? { 'style.ramp': r } : {}), ...params },
  });
  if (seedKey) c.set(id, { seedKey });
  return id;
}

/** A stick / log (a thick streak). @param {ReturnType<typeof compose>} c */
function stick(c, label, /** @type {Record<string, number | any[]>} */ o) {
  return c.add('streak', label, {
    transform: {
      x: /** @type {number} */ (o.x),
      y: /** @type {number} */ (o.y),
      rotation: /** @type {number} */ (o.rotation),
    },
    params: {
      'streak.length': o.length,
      'streak.thickness': o.thickness,
      'streak.taper': 0,
      'style.ramp': o.ramp ?? WOOD,
      'style.bands': 3,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
    },
  });
}

/** Cel embers: small dots popping up. @param {ReturnType<typeof compose>} c */
const embers = (
  c,
  /** @type {number} */ y,
  /** @type {number} */ width,
  r = rampPreset('fireCartoon'),
) =>
  c.add('dotEmitter', 'Embers', {
    blend: 'add',
    transform: { y },
    params: {
      'emit.shape': 'line',
      'emit.width': width,
      'emit.rate': 5,
      'emit.cone': 24,
      'emit.speed': 130,
      'emit.speedVariance': 0.6,
      'emit.gravity': -80,
      'emit.turbulence': 30,
      'emit.life': 1.2,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 3.5,
      'style.ramp': r,
      'glow.amount': 0.6,
    },
  });

// ── Layer presets ───────────────────────────────────────────────────────────────────────────

/** The reference flame: orange body, yellow core, soft glow. Loops. */
function celFlamePreset() {
  const c = compose({ timing: loop(48) });
  celFlame(c, 'Cel flame', { y: 170 });
  return c.done();
}

/** A calm, tall candle flame on a wax candle. Loops. */
function celCandle() {
  const c = compose({ timing: loop(48) });
  stick(c, 'Candle', { x: 0, y: 225, rotation: 90, length: 150, thickness: 46, ramp: WAX });
  celFlame(c, 'Candle flame', {
    y: 148,
    'celflame.height': 120,
    'celflame.width': 40,
    'celflame.tip': 1.6,
    'celflame.bites': 3,
    'celflame.biteSize': 0.22,
    'celflame.biteDepth': 0.32,
    'celflame.biteSpeed': 0.75,
    'celflame.wobble': 0.08,
    'celflame.wobbleSpeed': 0.75,
    'celflame.coreSize': 0.55,
  });
  return c.done();
}

/** A torch: handle, a leaning flame, embers. Loops. */
function celTorch() {
  const c = compose({ timing: loop(48) });
  stick(c, 'Handle', { x: 0, y: 240, rotation: 90, length: 170, thickness: 20 });
  celFlame(c, 'Torch flame', {
    y: 160,
    'celflame.height': 210,
    'celflame.width': 74,
    'celflame.lean': 0.18,
    'celflame.bites': 5,
    'celflame.biteSpeed': 1.5,
    'celflame.wobble': 0.18,
  });
  embers(c, 140, 30);
  return c.done();
}

/** Campfire: crossed logs, four flames of different sizes out of step, embers. Loops. */
function celCampfire() {
  const c = compose({ timing: loop(48) });
  stick(c, 'Log', { x: -10, y: 205, rotation: 14, length: 200, thickness: 24 });
  stick(c, 'Log', { x: 10, y: 207, rotation: -16, length: 190, thickness: 22 });
  const flames = [
    { label: 'Back flame', x: -12, h: 200, w: 86, speed: 1.0, lean: -0.05 },
    { label: 'Left flame', x: -52, h: 130, w: 62, speed: 1.3, lean: -0.2 },
    { label: 'Right flame', x: 50, h: 145, w: 64, speed: 1.15, lean: 0.22 },
    { label: 'Front flame', x: 8, h: 160, w: 78, speed: 1.4, lean: 0.06 },
  ];
  for (const f of flames)
    celFlame(c, f.label, {
      x: f.x,
      y: 200,
      'celflame.height': f.h,
      'celflame.width': f.w,
      'celflame.biteSpeed': f.speed,
      'celflame.lean': f.lean,
    });
  embers(c, 170, 120);
  return c.done();
}

/** A blue spirit flame (cel). Loops. */
function celSpiritFlame() {
  const c = compose({ timing: loop(48) });
  celFlame(c, 'Spirit flame', {
    y: 170,
    ramp: rampPreset('fireBlue'),
    'celflame.tip': 1.8,
    'celflame.biteSpeed': 0.9,
    'celflame.wobble': 0.2,
    'celflame.wobbleSpeed': 0.7,
    'celflame.bodyTone': 0.45,
    'celflame.coreTone': 0.12,
  });
  return c.done();
}

/** A purple / magic cel flame. Loops. */
function celMagicFlame() {
  const c = compose({ timing: loop(48) });
  celFlame(c, 'Magic flame', {
    y: 170,
    ramp: rampPreset('firePurple'),
    'celflame.biteSpeed': 1.4,
    'celflame.bites': 6,
    'celflame.biteSize': 0.2,
    'celflame.bodyTone': 0.45,
    'celflame.coreTone': 0.12,
  });
  embers(c, 150, 60, rampPreset('firePurple'));
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** A wall of cel flames along a line. Loops. */
function celFireWall() {
  const c = compose({ timing: loop(48) });
  c.add('celFlameEmitter', 'Fire wall', {
    transform: { y: 200 },
    params: {
      'emit.shape': 'line',
      'emit.width': 380,
      'emit.rate': 14,
      'emit.cone': 6,
      'emit.speed': 20,
      'emit.gravity': -30,
      'emit.life': 1.4,
      'emit.lifeVariance': 0.3,
      'emit.size': 1.6,
      'emit.sizeVariance': 0.35,
      'emit.prewarm': true,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.25, 1],
        [0.75, 0.9],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.15],
      ]),
    },
  });
  embers(c, 180, 360);
  return c.done();
}

/** A cel fire trail: a flame head flies along a drawn curve, leaving little flames. One-shot. */
function celFireTrail() {
  const c = compose({ timing: oneShot(48) });
  const path = c.add('guide', 'Trail path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 440,
    h: 260,
    closed: false,
    path: [
      { x: -0.5, y: 0.35, ix: 0, iy: 0, ox: 0.2, oy: -0.5 },
      { x: 0, y: 0, ix: -0.2, iy: 0.4, ox: 0.2, oy: -0.4 },
      { x: 0.5, y: -0.3, ix: -0.2, iy: 0.5, ox: 0, oy: 0 },
    ],
  });
  const head = c.add('null', 'Fire head');
  c.set(head, {
    follow: { ...makeFollow(path, m), orient: false },
    keys: { 'follow.progress': setKey(setKey([], 0, 0, 'ease'), 1.4, 100, 'ease') },
  });
  const trail = c.add('celFlameEmitter', 'Trail flames', {
    params: {
      'style.rampOverLife': COOL_A_LITTLE,
      'emit.rate': 26,
      'emit.stop': 1.4,
      'emit.cone': 20,
      'emit.speed': 30,
      'emit.gravity': -60,
      'emit.life': 0.8,
      'emit.size': 1.1,
      'emit.sizeVariance': 0.3,
      'emit.scaleOverLife': curve([
        [0, 0.2],
        [0.2, 1],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
    },
  });
  c.parent(trail, head, { local: true });
  return c.done();
}

// ── More Cel Fire (Raul: flamethrower, wildfire and more) ───────────────────────────────

/** Cel smoke puffs (dark, cel shaded) rising behind a fire. @param {ReturnType<typeof compose>} c */
const celSmoke = (c, /** @type {{ y: number, width: number, rate?: number }} */ o) =>
  c.add('puffEmitter', 'Smoke', {
    transform: { y: o.y },
    params: {
      'emit.shape': 'line',
      'emit.width': o.width,
      'emit.rate': o.rate ?? 6,
      'emit.cone': 14,
      'emit.speed': 90,
      'emit.gravity': -50,
      'emit.drag': 0.3,
      'emit.turbulence': 35,
      'emit.life': 2.4,
      'emit.prewarm': true,
      'emit.opacityOverLife': curve([
        [0, 0],
        [0.15, 0.9],
        [0.7, 0.8],
        [1, 0],
      ]),
      'emit.scaleOverLife': curve([
        [0, 0.4],
        [0.5, 1.1],
        [1, 1.6],
      ]),
      'puff.radius': 40,
      'style.ramp': ramp([
        [0, '#8a7d86'],
        [0.5, '#4b434f'],
        [1, '#25212a'],
      ]),
      'style.bands': 3,
      'shade.shadow': 0.4,
      'shade.highlight': 0.25,
    },
  });

/** Cel flame particles. @param {Record<string, any>} o params on top of the defaults */
const flameParticles = (
  c,
  /** @type {string} */ label,
  /** @type {Record<string, any>} */ o,
  /** @type {Record<string, any>} */ t = {},
) =>
  c.add('celFlameEmitter', label, {
    transform: t,
    // cel flames keep their colours over life (the ramp's dark end would turn them grey)
    params: { 'style.rampOverLife': COOL_A_LITTLE, ...o },
  });

/** Flamethrower: a jet of cel flames pointing where they fly, growing as they slow. Loops. */
function celFlamethrower() {
  const c = compose({ timing: loop(24) });
  flameParticles(
    c,
    'Jet',
    {
      'emit.direction': 82,
      'emit.cone': 7,
      'emit.speed': 640,
      'emit.speedVariance': 0.2,
      'emit.drag': 1.7,
      'emit.gravity': -140,
      'emit.rate': 48,
      'emit.life': 0.75,
      'emit.lifeVariance': 0.2,
      'emit.alignToVelocity': true,
      'emit.size': 1,
      'emit.sizeVariance': 0.3,
      'emit.prewarm': true,
      'emit.scaleOverLife': curve([
        [0, 0.25],
        [0.35, 1],
        [0.8, 1.5],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.25],
      ]),
      'celflame.angle': 90,
      'celflame.height': 90,
      'celflame.width': 48,
      'celflame.bites': 3,
      'celflame.biteSpeed': 2.5,
    },
    { x: -230, y: 40 },
  );
  c.add('blob', 'Nozzle flare', {
    blend: 'add',
    transform: { x: -228, y: 40 },
    params: {
      'blob.radius': 18,
      'blob.noise': 0.3,
      'blob.wobble': 14,
      'style.ramp': rampPreset('fireCartoon'),
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 1.2,
      'glow.radius': 26,
    },
  });
  return c.done();
}

/** Wildfire: a wide front of cel flames — tall ones behind, a dense row in front, dark smoke and embers. Loops. */
function celWildfire() {
  const c = compose({ timing: loop(48) });
  celSmoke(c, { y: 60, width: 420, rate: 7 });
  const back = [
    [-170, 230, 0.9],
    [-60, 300, 1.15],
    [60, 260, 0.95],
    [170, 220, 1.3],
  ];
  back.forEach(([x, h, sp], i) => {
    celFlame(c, `Back flame ${i + 1}`, {
      x,
      y: 215,
      'celflame.height': h,
      'celflame.width': h * 0.42,
      'celflame.biteSpeed': sp,
      'celflame.lean': (i % 2 ? 1 : -1) * 0.12,
      'celflame.bodyTone': 0.55,
      'celflame.coreTone': 0.3,
    });
  });
  flameParticles(
    c,
    'Front flames',
    {
      'emit.shape': 'line',
      'emit.width': 460,
      'emit.rate': 22,
      'emit.cone': 6,
      'emit.speed': 20,
      'emit.gravity': -30,
      'emit.life': 1.3,
      'emit.lifeVariance': 0.3,
      'emit.size': 1.7,
      'emit.sizeVariance': 0.4,
      'emit.prewarm': true,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.25, 1],
        [0.75, 0.9],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
    },
    { y: 225 },
  );
  embers(c, 180, 440);
  return c.done();
}

/** Fireball: a round hot core with cel flames streaming back, as if it flies to the right. Stays in place. Loops. */
function celFireball() {
  const c = compose({ timing: loop(24) });
  flameParticles(
    c,
    'Tail flames',
    {
      'emit.shape': 'circle',
      'emit.width': 60,
      'emit.direction': -90,
      'emit.cone': 26,
      'emit.speed': 300,
      'emit.speedVariance': 0.3,
      'emit.gravity': -40,
      'emit.rate': 40,
      'emit.life': 0.55,
      'emit.alignToVelocity': true,
      'emit.prewarm': true,
      'emit.size': 1.2,
      'emit.sizeVariance': 0.3,
      'emit.scaleOverLife': curve([
        [0, 0.6],
        [0.25, 1],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
      'celflame.angle': 90,
      'celflame.height': 90,
      'celflame.width': 46,
      'celflame.bites': 3,
      'celflame.biteSpeed': 2,
    },
    { x: 80, y: 0 },
  );
  c.add('blob', 'Fireball core', {
    transform: { x: 80, y: 0 },
    params: {
      'blob.radius': 46,
      'blob.noise': 0.12,
      'blob.wobble': 6,
      'style.ramp': rampPreset('fireCartoon'),
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 0.8,
      'glow.radius': 30,
    },
  });
  return c.done();
}

/** Fire burst: cel flames blast out in every direction from a flash, then burn out. One-shot. */
function celFireBurst() {
  const c = compose({ timing: oneShot(30) });
  c.add('blob', 'Flash', {
    blend: 'add',
    params: {
      'blob.radius': 90,
      'blob.noise': 0.2,
      'style.ramp': rampPreset('fireCartoon'),
      'shade.shadow': 0,
      'single.end': 0.25,
      'single.scaleOverLife': curve([
        [0, 0.4],
        [0.3, 1.1],
        [1, 1.3],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [1, 0],
      ]),
      'glow.amount': 1,
      'glow.radius': 40,
    },
  });
  flameParticles(c, 'Burst flames', {
    'emit.shape': 'circle',
    'emit.width': 30,
    'emit.cone': 360,
    'emit.rate': 360,
    'emit.stop': 0.05,
    'emit.speed': 520,
    'emit.speedVariance': 0.35,
    'emit.drag': 3,
    'emit.gravity': -160,
    'emit.life': 0.8,
    'emit.lifeVariance': 0.3,
    'emit.alignToVelocity': true,
    'emit.size': 1.3,
    'emit.sizeVariance': 0.35,
    'emit.scaleOverLife': curve([
      [0, 0.3],
      [0.2, 1.2],
      [1, 0],
    ]),
    'emit.opacityOverLife': FLAT,
    'style.rampOverLife': curve([
      [0, 0],
      [1, 0.35],
    ]),
    'celflame.angle': 90,
    'celflame.height': 110,
    'celflame.width': 56,
    'celflame.biteSpeed': 2.5,
  });
  embers(c, 0, 60);
  return c.done();
}

/** Fire pillar: one huge cel flame with a column of flames rising through it. Loops. */
function celFirePillar() {
  const c = compose({ timing: loop(48) });
  celFlame(c, 'Pillar', {
    y: 235,
    'celflame.height': 440,
    'celflame.width': 150,
    'celflame.tip': 1.1,
    'celflame.bites': 7,
    'celflame.biteSize': 0.2,
    'celflame.biteSpeed': 1.5,
    'celflame.wobble': 0.1,
  });
  flameParticles(
    c,
    'Rising flames',
    {
      'emit.shape': 'line',
      'emit.width': 90,
      'emit.rate': 14,
      'emit.cone': 4,
      'emit.speed': 320,
      'emit.gravity': -120,
      'emit.life': 1.1,
      'emit.prewarm': true,
      'emit.size': 1,
      'emit.sizeVariance': 0.3,
      'emit.scaleOverLife': curve([
        [0, 0.4],
        [0.3, 1],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
      'celflame.coreTone': 0.05,
      'celflame.bodyTone': 0.25,
    },
    { y: 200 },
  );
  embers(c, 120, 120);
  return c.done();
}

/** Meteor: a fireball crosses the frame diagonally, its cel flames trailing behind. One-shot. */
function celMeteor() {
  const c = compose({ timing: oneShot(36) });
  const head = c.add('null', 'Meteor');
  c.set(head, {
    keys: {
      'transform.x': setKey(setKey([], 0, -320, 'linear'), 1.4, 320, 'linear'),
      'transform.y': setKey(setKey([], 0, -260, 'linear'), 1.4, 220, 'linear'),
    },
  });
  const trail = flameParticles(c, 'Trail flames', {
    'emit.shape': 'circle',
    'emit.width': 40,
    'emit.direction': -53,
    'emit.cone': 20,
    'emit.speed': 140,
    'emit.speedVariance': 0.4,
    'emit.gravity': -60,
    'emit.rate': 70,
    'emit.life': 0.6,
    'emit.alignToVelocity': true,
    'emit.size': 1.1,
    'emit.sizeVariance': 0.3,
    'emit.scaleOverLife': curve([
      [0, 0.8],
      [0.2, 1],
      [1, 0],
    ]),
    'emit.opacityOverLife': FLAT,
    'style.rampOverLife': curve([
      [0, 0],
      [1, 0.35],
    ]),
    'celflame.angle': 90,
    'celflame.height': 80,
    'celflame.width': 42,
    'celflame.bites': 3,
    'celflame.biteSpeed': 2.5,
  });
  c.parent(trail, head, { local: true });
  const core = c.add('blob', 'Meteor core', {
    params: {
      'style.rampOverLife': HOLD_HOT,
      'blob.radius': 34,
      'blob.noise': 0.15,
      'style.ramp': rampPreset('fireCartoon'),
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 0.9,
      'glow.radius': 30,
    },
  });
  c.parent(core, head, { local: true });
  return c.done();
}

/** Burning ground: low, short cel flames licking along the ground, embers. Loops. */
function celBurningGround() {
  const c = compose({ timing: loop(48) });
  flameParticles(
    c,
    'Ground flames',
    {
      'emit.shape': 'line',
      'emit.width': 440,
      'emit.rate': 30,
      'emit.cone': 4,
      'emit.speed': 8,
      'emit.gravity': -12,
      'emit.life': 1.1,
      'emit.lifeVariance': 0.35,
      'emit.prewarm': true,
      'emit.sizeVariance': 0.4,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.3, 1],
        [0.7, 0.9],
        [1, 0],
      ]),
      'emit.opacityOverLife': FLAT,
      'celflame.height': 95,
      'celflame.width': 46,
      'celflame.bites': 3,
      'emit.size': 1.25,
    },
    { y: 205 },
  );
  embers(c, 200, 420);
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const CEL_FIRE_PRESETS = Object.freeze([
  {
    id: 'celFlame',
    name: 'Cel Flame',
    blurb: 'The bitten-teardrop cartoon flame: orange body, yellow core, soft glow. Seamless loop.',
    build: celFlamePreset,
  },
  {
    id: 'celCandle',
    name: 'Cel Candle',
    blurb: 'A calm, tall candle flame on a wax candle. Seamless loop.',
    build: celCandle,
  },
  {
    id: 'celTorch',
    name: 'Cel Torch',
    blurb: 'A torch with a leaning cel flame and embers. Seamless loop.',
    build: celTorch,
  },
  {
    id: 'celCampfire',
    name: 'Cel Campfire',
    blurb: 'Crossed logs and four cel flames of different sizes, out of step. Seamless loop.',
    build: celCampfire,
  },
  {
    id: 'celSpiritFlame',
    name: 'Cel Spirit Flame',
    blurb: 'A blue ghostly cel flame. Seamless loop.',
    build: celSpiritFlame,
  },
  {
    id: 'celMagicFlame',
    name: 'Cel Magic Flame',
    blurb: 'A purple magic cel flame with sparks. Seamless loop.',
    build: celMagicFlame,
  },
  {
    id: 'celWildfire',
    name: 'Cel Wildfire',
    blurb:
      'A wide fire front: tall flames behind, a dense row in front, dark smoke and embers. Seamless loop.',
    build: celWildfire,
  },
  {
    id: 'celFireball',
    name: 'Cel Fireball',
    blurb:
      'A round hot core with cel flames streaming back; stays in place for the game to move. Seamless loop.',
    build: celFireball,
  },
  {
    id: 'celFirePillar',
    name: 'Cel Fire Pillar',
    blurb: 'One huge cel flame with flames rising through it. Seamless loop.',
    build: celFirePillar,
  },
  {
    id: 'celFireBurst',
    name: 'Cel Fire Burst',
    blurb: 'Cel flames blast out in every direction from a flash, then burn out. One-shot.',
    build: celFireBurst,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const CEL_FIRE_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'celFireWall',
    name: 'Cel Fire Wall',
    blurb: 'A row of cel flames along a line, with embers. Seamless loop.',
    build: celFireWall,
  },
  {
    id: 'celFireTrail',
    name: 'Cel Fire Trail',
    blurb: 'A flame head flies along a drawn curve, leaving little cel flames. One-shot.',
    build: celFireTrail,
  },
  {
    id: 'celFlamethrower',
    name: 'Cel Flamethrower',
    blurb: 'A jet of cel flames pointing where they fly, swelling as they slow. Seamless loop.',
    build: celFlamethrower,
  },
  {
    id: 'celMeteor',
    name: 'Cel Meteor',
    blurb: 'A fireball crosses the frame diagonally, cel flames trailing behind. One-shot.',
    build: celMeteor,
  },
  {
    id: 'celBurningGround',
    name: 'Cel Burning Ground',
    blurb: 'Low, short cel flames licking along the ground, with embers. Seamless loop.',
    build: celBurningGround,
  },
]);
