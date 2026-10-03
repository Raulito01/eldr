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
]);
