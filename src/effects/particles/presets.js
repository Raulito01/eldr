// @ts-check
/**
 * Particle presets (4.Pc, D-069): whole compositions built from emitter layers (and, for the
 * Comet, a Path layer + a null riding it). Unlike the explosion presets (deltas on the base
 * stack) each one builds its own layer list, using the same editing operations as the editor,
 * so everything stays editable: open the preset and every emitter, path and key is there.
 *
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { setKey } from '../../core/keyframes.js';
import { rampPreset } from '../../render/rampPresets.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp, SHRINK, SOFT_LIFE } from '../presetKit.js';

/** Hot embers: white core → gold → orange → deep red. */
const EMBERS = ramp([
  [0, '#fffbe6'],
  [0.25, '#ffd45a'],
  [0.55, '#ff8a2a'],
  [0.8, '#e0401f'],
  [1, '#7a1f2a'],
]);
/** Magic dust: white → cyan → violet. */
const DUST = ramp([
  [0, '#ffffff'],
  [0.3, '#bff6ff'],
  [0.6, '#6fd3ff'],
  [0.85, '#9a6bff'],
  [1, '#5a2fc0'],
]);
/** Comet: white head → ice blue → violet tail. */
const COMET = ramp([
  [0, '#ffffff'],
  [0.25, '#d6f4ff'],
  [0.5, '#7fd0ff'],
  [0.8, '#6a7bff'],
  [1, '#4a2a9a'],
]);

/** Embers: glowing specks drifting up and flickering, with a few streaking sparks. Loops. */
function embers() {
  const c = compose({ timing: loop(48) });
  c.add('dotEmitter', 'Embers', {
    blend: 'add',
    transform: { y: 210 },
    params: {
      'emit.shape': 'line',
      'emit.width': 380,
      'emit.rate': 40,
      'emit.cone': 30,
      'emit.speed': 110,
      'emit.speedVariance': 0.6,
      'emit.drag': 0.2,
      'emit.gravity': -90,
      'emit.turbulence': 34,
      'emit.turbSpeed': 0.9,
      'emit.life': 3,
      'emit.lifeVariance': 0.35,
      'emit.size': 1,
      'emit.sizeVariance': 0.6,
      'emit.scaleOverLife': SHRINK,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.flicker': 0.55,
      'emit.colorVariance': 0.35,
      'dot.radius': 5,
      'style.ramp': EMBERS,
      'style.rampOverLife': curve([
        [0, 0.05],
        [1, 0.85],
      ]),
      'glow.amount': 1.1,
      'glow.radius': 12,
    },
  });
  c.add('sparkEmitter', 'Ember streaks', {
    blend: 'add',
    transform: { y: 210 },
    params: {
      'emit.shape': 'line',
      'emit.width': 320,
      'emit.rate': 7,
      'emit.cone': 24,
      'emit.speed': 190,
      'emit.speedVariance': 0.4,
      'emit.drag': 0.5,
      'emit.gravity': -50,
      'emit.turbulence': 20,
      'emit.life': 1.3,
      'emit.lifeVariance': 0.3,
      'emit.size': 0.7,
      'emit.scaleOverLife': SHRINK,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.flicker': 0.3,
      'emit.alignToVelocity': true,
      'style.ramp': EMBERS,
      'glow.amount': 0.7,
      'glow.radius': 10,
    },
  });
  return c.done();
}

/** Magic Dust: twinkling sparkles and soft motes swirling in a cloud. Loops. */
function magicDust() {
  const c = compose({ timing: loop(48) });
  c.add('dotEmitter', 'Motes', {
    blend: 'add',
    params: {
      'emit.shape': 'circle',
      'emit.width': 300,
      'emit.rate': 40,
      'emit.cone': 360,
      'emit.speed': 18,
      'emit.speedVariance': 0.8,
      'emit.drag': 0.3,
      'emit.gravity': -20,
      'emit.turbulence': 40,
      'emit.turbSpeed': 0.6,
      'emit.life': 2,
      'emit.lifeVariance': 0.4,
      'emit.sizeVariance': 0.7,
      'emit.scaleOverLife': curve([
        [0, 0.3],
        [0.3, 1],
        [1, 0.2],
      ]),
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.flicker': 0.4,
      'emit.colorVariance': 0.5,
      'dot.radius': 4.5,
      'style.ramp': DUST,
      'glow.amount': 1,
      'glow.radius': 18,
    },
  });
  c.add('sparkleEmitter', 'Twinkles', {
    blend: 'add',
    params: {
      'emit.shape': 'circle',
      'emit.width': 280,
      'emit.rate': 14,
      'emit.cone': 360,
      'emit.speed': 10,
      'emit.gravity': -10,
      'emit.turbulence': 20,
      'emit.life': 1.1,
      'emit.lifeVariance': 0.4,
      'emit.size': 1,
      'emit.sizeVariance': 0.5,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.25, 1],
        [0.5, 0.45],
        [0.7, 0.9],
        [1, 0],
      ]),
      'emit.opacityOverLife': curve([
        [0, 1],
        [1, 1],
      ]),
      'emit.flicker': 0.2,
      'emit.spin': 90,
      'emit.randomRotation': 45,
      'emit.colorVariance': 0.3,
      'style.ramp': DUST,
      'glow.amount': 1.2,
      'glow.radius': 16,
    },
  });
  return c.done();
}

/** Spark Fountain: a gush of sparks shot up that arc and fall, with a burst at the start. */
function sparkFountain() {
  const c = compose({ timing: oneShot(36) });
  const common = {
    'emit.alignToVelocity': true,
    'emit.drag': 0.25,
    'emit.gravity': 950,
    'emit.scaleOverLife': SHRINK,
    'emit.opacityOverLife': curve([
      [0, 1],
      [0.7, 1],
      [1, 0],
    ]),
    'emit.colorVariance': 0.3,
    'style.ramp': rampPreset('sparks'),
    'glow.amount': 0.8,
    'glow.radius': 12,
  };
  c.add('sparkEmitter', 'Fountain', {
    blend: 'add',
    transform: { y: 170 },
    params: {
      ...common,
      'emit.rate': 130,
      'emit.stop': 0.75,
      'emit.cone': 28,
      'emit.speed': 680,
      'emit.speedVariance': 0.35,
      'emit.life': 0.9,
      'emit.lifeVariance': 0.35,
      'emit.size': 0.8,
      'emit.sizeVariance': 0.5,
      'trail.count': 2,
      'trail.spacing': 0.025,
    },
  });
  c.add('sparkEmitter', 'Burst', {
    blend: 'add',
    transform: { y: 170 },
    params: {
      ...common,
      'emit.pulseEvery': 5,
      'emit.stop': 0.1,
      'emit.pulseCount': 36,
      'emit.cone': 110,
      'emit.speed': 620,
      'emit.speedVariance': 0.5,
      'emit.life': 0.6,
      'emit.lifeVariance': 0.4,
      'emit.size': 0.8,
    },
  });
  c.add('dotEmitter', 'Hot drops', {
    blend: 'add',
    transform: { y: 170 },
    params: {
      ...common,
      'emit.alignToVelocity': false,
      'emit.rate': 30,
      'emit.stop': 0.7,
      'emit.cone': 34,
      'emit.speed': 470,
      'emit.speedVariance': 0.4,
      'emit.life': 1,
      'emit.lifeVariance': 0.3,
      'dot.radius': 3,
      'emit.sizeVariance': 0.5,
    },
  });
  return c.done();
}

/**
 * Smoke Column: cel smoke puffs (D-100) — each gets a push that dies out, rises buoyantly and
 * widens, one shared wind bends the stream, holes eat the puffs as they climb. Loops.
 */
function smokeColumn() {
  const c = compose({ timing: loop(48) });
  c.add('celSmokeEmitter', 'Smoke', {
    transform: { y: 220 },
    params: {
      'emit.shape': 'line',
      'emit.width': 50,
      'emit.rate': 5,
      'emit.cone': 10,
      'emit.speed': 170,
      'emit.speedVariance': 0.25,
      'emit.drag': 1.5,
      'emit.gravity': -120,
      'emit.turbulence': 0,
      'emit.wind': 35,
      'emit.windSpeed': 0.5,
      'emit.life': 3.2,
      'emit.lifeVariance': 0.15,
      'emit.prewarm': true,
      'emit.size': 1,
      'emit.sizeVariance': 0.25,
      'emit.scaleOverLife': curve([
        [0, 0.7],
        [0.4, 1.1],
        [1, 1.7],
      ]),
      'cs.size': 32,
      'cs.lumps': 6,
      'cs.shade': 0.4,
      'cs.order': 'bottom',
      'cs.holeCount': 8,
      'cs.holeStart': 0.45,
      'cs.bodyTone': 0.35,
      'cs.shadeTone': 0.7,
      'cs.edgeNoise': 0.06,
      'style.ramp': rampPreset('smoke'),
    },
  });
  return c.done();
}

/** Comet: a null rides a drawn arc and drags a dust and spark trail behind it. */
function comet() {
  const c = compose({ timing: oneShot(40) });
  const path = c.add('guide', 'Comet path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 600,
    h: 420,
    closed: false,
    path: [
      { x: -0.5, y: 0.45, ix: 0, iy: 0, ox: 0.18, oy: -0.35 },
      { x: 0.05, y: -0.1, ix: -0.22, iy: 0.12, ox: 0.22, oy: -0.12 },
      { x: 0.55, y: -0.5, ix: -0.15, iy: 0.3, ox: 0, oy: 0 },
    ],
  });
  const head = c.add('null', 'Comet');
  c.set(head, {
    follow: { ...makeFollow(path, m), orient: true },
    keys: {
      'follow.progress': setKey(setKey([], 0, 0, 'ease'), 1.2, 100, 'ease'),
    },
  });
  const trail = {
    'emit.cone': 360,
    'emit.opacityOverLife': curve([
      [0, 1],
      [0.6, 0.8],
      [1, 0],
    ]),
    'emit.scaleOverLife': SHRINK,
    'emit.stop': 1.2,
    'style.ramp': COMET,
    'glow.amount': 0.9,
    'glow.radius': 14,
  };
  const dust = c.add('dotEmitter', 'Trail dust', {
    blend: 'add',
    params: {
      ...trail,
      'emit.rate': 160,
      'emit.speed': 30,
      'emit.speedVariance': 0.8,
      'emit.drag': 1.5,
      'emit.turbulence': 12,
      'emit.life': 0.9,
      'emit.lifeVariance': 0.5,
      'emit.colorVariance': 0.3,
      'dot.radius': 6,
      'emit.sizeVariance': 0.6,
      'style.rampOverLife': curve([
        [0, 0.15],
        [1, 1],
      ]),
    },
  });
  const sparks = c.add('sparkEmitter', 'Trail sparks', {
    blend: 'add',
    params: {
      ...trail,
      'emit.rate': 70,
      'emit.speed': 90,
      'emit.speedVariance': 0.6,
      'emit.drag': 1,
      'emit.life': 0.45,
      'emit.lifeVariance': 0.4,
      'emit.size': 0.7,
      'emit.alignToVelocity': true,
    },
  });
  const core = c.add('dotEmitter', 'Head', {
    blend: 'add',
    params: {
      'emit.local': true,
      'emit.stop': 1.2,
      'emit.rate': 60,
      'emit.speed': 0,
      'emit.cone': 0,
      'emit.life': 0.12,
      'emit.lifeVariance': 0,
      'emit.size': 1,
      'emit.sizeVariance': 0,
      'emit.scaleOverLife': curve([
        [0, 1],
        [1, 1],
      ]),
      'emit.opacityOverLife': curve([
        [0, 1],
        [1, 1],
      ]),
      'emit.colorVariance': 0,
      'dot.radius': 11,
      'style.ramp': COMET,
      'glow.amount': 1.2,
      'glow.radius': 26,
    },
  });
  for (const id of [dust, sparks, core]) c.parent(id, head);
  return c.done();
}

/**
 * @typedef {object} ParticlePreset
 * @property {string} id
 * @property {string} name
 * @property {string} blurb
 * @property {() => import('../explosion/explosion.js').ExplosionState} build
 */

/** @type {ReadonlyArray<ParticlePreset>} */
export const PARTICLE_PRESETS = Object.freeze([
  {
    id: 'embers',
    name: 'Embers',
    blurb: 'Glowing specks drifting up and flickering, a few streaks. Seamless loop.',
    build: embers,
  },
  {
    id: 'magicDust',
    name: 'Magic Dust',
    blurb: 'Twinkling sparkles and soft motes swirling in a cloud. Seamless loop.',
    build: magicDust,
  },
  {
    id: 'sparkFountain',
    name: 'Spark Fountain',
    blurb: 'A gush of sparks shot up that arc and fall, with a burst at the start. One-shot.',
    build: sparkFountain,
  },
  {
    id: 'smokeColumn',
    name: 'Smoke Column',
    blurb: 'Cel-shaded puffs rising, swelling and drifting. Seamless loop.',
    build: smokeColumn,
  },
  {
    id: 'comet',
    name: 'Comet',
    blurb: 'A null rides a drawn arc and drags a dust and spark trail. Edit the path to re-aim it.',
    build: comet,
  },
]);

/** @param {string} id */
export const particlePreset = (id) => PARTICLE_PRESETS.find((p) => p.id === id);
