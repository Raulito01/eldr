// @ts-check
/**
 * Magic presets (D-070): Arcane Burst, Healing Aura, Energy Orb, Holy Smite (layer presets) and
 * Fairy Trail, Healing Rise, Arcane Vortex (particle presets). Whole, editable compositions
 * built from the existing shapes, orbits and emitters.
 *
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { setKey } from '../../core/keyframes.js';
import { rampPreset } from '../../render/rampPresets.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp, SHRINK, SOFT_LIFE } from '../presetKit.js';

const FLAT = curve([
  [0, 1],
  [1, 1],
]);
const ARCANE = rampPreset('arcane');
const HEAL = rampPreset('heal');
const HOLY = rampPreset('holy');
/** Fairy: white → pink → gold. */
const FAIRY = ramp([
  [0, '#ffffff'],
  [0.3, '#ffd6f2'],
  [0.6, '#ff8fd0'],
  [0.85, '#ffc861'],
  [1, '#c86a2a'],
]);

/** Arcane Burst: a charge-up, a flash, then a ring, swooshes and sparkles bursting out. */
function arcaneBurst() {
  const c = compose({
    timing: oneShot(28),
    globals: {
      'explosion.impact': 0.18,
      'explosion.flashFrames': 1,
      'explosion.anticipation': true,
    },
  });
  c.add('ring', 'Rune ring', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'ring.radius': 170,
      'ring.thickness': 0.1,
      'ring.breaks': 6,
      'ring.gap': 0.2,
      'single.end': 0.55,
      'style.ramp': ARCANE,
      'glow.amount': 0.8,
    },
  });
  c.add('crescentBurst', 'Swooshes', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'burst.count': 7,
      'burst.speed': 380,
      'burst.life': 0.55,
      'crescent.radius': 50,
      'crescent.thickness': 10,
      'style.ramp': ARCANE,
      'glow.amount': 0.6,
    },
  });
  c.add('sparkleBurst', 'Sparkles', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'burst.count': 22,
      'burst.speed': 520,
      'burst.speedVariance': 0.7,
      'burst.drag': 4,
      'burst.spawnRadius': 20,
      'burst.life': 0.7,
      'sparkle.size': 22,
      'style.ramp': ARCANE,
      'glow.amount': 0.9,
    },
  });
  c.add('blob', 'Charge', {
    anchor: 'anticipation',
    blend: 'add',
    params: {
      'blob.radius': 60,
      'blob.noise': 0.1,
      'style.ramp': ARCANE,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': curve([
        [0, 0.2],
        [0.75, 1],
        [1, 0.3],
      ]),
      'single.opacityOverLife': curve([
        [0, 0],
        [0.3, 1],
        [1, 1],
      ]),
      'glow.amount': 1,
      'glow.radius': 30,
    },
  });
  c.add('blob', 'Flash', {
    anchor: 'flash',
    params: {
      'blob.radius': 140,
      'style.ramp': ramp([
        [0, '#ffffff'],
        [1, '#f3e6ff'],
      ]),
      'style.bands': 1,
      'style.spread': 0,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
    },
  });
  return c.done();
}

/** Healing Aura: green crescents and sparkles orbiting a soft glow. Loops. */
function healingAura() {
  const c = compose({ timing: loop(48) });
  c.add('orbitCrescent', 'Back swooshes', {
    blend: 'add',
    params: {
      'orbit.show': 'back',
      'orbit.count': 3,
      'orbit.radius': 130,
      'orbit.speed': 0.5,
      'orbit.speedVariance': 0,
      'orbit.y': 40,
      'crescent.thickness': 12,
      'style.ramp': HEAL,
      'glow.amount': 0.6,
    },
  });
  c.add('blob', 'Glow', {
    blend: 'add',
    params: {
      'blob.radius': 55,
      'blob.noise': 0.2,
      'blob.wobble': 2,
      'style.ramp': HEAL,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': curve([
        [0, 0.35],
        [1, 0.35],
      ]),
      'glow.amount': 0.6,
      'glow.radius': 40,
    },
  });
  c.add('orbitSparkle', 'Sparkles', {
    blend: 'add',
    params: {
      'orbit.count': 8,
      'orbit.radius': 120,
      'orbit.speed': 0.5,
      'orbit.speedVariance': 0,
      'orbit.y': 0,
      'orbit.pulse': 0.5,
      'orbit.pulseSpeed': 2,
      'sparkle.size': 16,
      'style.ramp': HEAL,
      'glow.amount': 0.8,
    },
  });
  c.add('orbitCrescent', 'Front swooshes', {
    blend: 'add',
    params: {
      'orbit.show': 'front',
      'orbit.count': 3,
      'orbit.radius': 130,
      'orbit.speed': 0.5,
      'orbit.speedVariance': 0,
      'orbit.y': 40,
      'crescent.thickness': 12,
      'style.ramp': HEAL,
      'glow.amount': 0.6,
    },
  });
  return c.done();
}

/** Energy Orb: a swirling plasma ball wrapped in orbiting swooshes. Loops. */
function energyOrb() {
  const c = compose({ timing: loop(24) });
  c.add('fieldFire', 'Orb', {
    blend: 'add',
    params: {
      'field.form': 'ball',
      'field.width': 150,
      'field.height': 150,
      'field.speed': 2,
      'field.swirl': 0.7,
      'style.ramp': rampPreset('mana'),
      'style.bands': 4,
      'glow.amount': 0.55,
      'glow.radius': 30,
    },
  });
  c.add('orbitCrescent', 'Swooshes', {
    blend: 'add',
    params: {
      'orbit.count': 2,
      'orbit.radius': 115,
      'orbit.speed': 1,
      'orbit.speedVariance': 0,
      'orbit.tilt': 70,
      'crescent.sweep': 150,
      'crescent.thickness': 14,
      'style.ramp': rampPreset('mana'),
      'glow.amount': 0.7,
    },
  });
  c.add('orbitSparkle', 'Motes', {
    blend: 'add',
    params: {
      'orbit.count': 6,
      'orbit.radius': 140,
      'orbit.speed': -1,
      'orbit.speedVariance': 0,
      'orbit.tilt': 50,
      'orbit.planeAngle': 30,
      'sparkle.size': 10,
      'style.ramp': rampPreset('mana'),
      'glow.amount': 0.8,
    },
  });
  return c.done();
}

/** Holy Smite: a pillar of light slams down, a halo ring spreads, sparkles rise. */
function holySmite() {
  const c = compose({
    timing: oneShot(32),
    globals: { 'explosion.impact': 0.1, 'explosion.flashFrames': 2 },
  });
  const ground = 170;
  c.add('ring', 'Halo', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground, scaleY: 35 },
    params: {
      'ring.radius': 200,
      'ring.thickness': 0.14,
      'single.end': 0.6,
      'style.ramp': HOLY,
      'glow.amount': 0.7,
    },
  });
  c.add('blob', 'Pillar', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: -60, scaleX: 32, scaleY: 420 },
    params: {
      'blob.radius': 60,
      'blob.noise': 0.04,
      'style.ramp': HOLY,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.end': 0.5,
      'single.scaleOverLife': curve([
        [0, 0.4],
        [0.12, 1.2],
        [0.4, 1],
        [1, 0.2],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [0.6, 1],
        [1, 0],
      ]),
      'glow.amount': 1,
      'glow.radius': 40,
    },
  });
  c.add('sparkleBurst', 'Rising sparkles', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground },
    params: {
      'burst.count': 20,
      'burst.direction': 0,
      'burst.cone': 120,
      'burst.speed': 260,
      'burst.drag': 2,
      'burst.buoyancy': 300,
      'burst.spawnRadius': 60,
      'burst.window': 0.3,
      'burst.life': 0.6,
      'sparkle.size': 18,
      'style.ramp': HOLY,
      'glow.amount': 0.8,
    },
  });
  c.add('crescentBurst', 'Feathers', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground - 20 },
    params: {
      'burst.count': 6,
      'burst.direction': 0,
      'burst.cone': 160,
      'burst.speed': 300,
      'burst.life': 0.6,
      'crescent.radius': 40,
      'style.ramp': HOLY,
    },
  });
  c.add('blob', 'Flash', {
    anchor: 'flash',
    params: {
      'blob.radius': 130,
      'single.y': ground - 40,
      'style.ramp': ramp([
        [0, '#ffffff'],
        [1, '#fff6d6'],
      ]),
      'style.bands': 1,
      'style.spread': 0,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
    },
  });
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Fairy Trail: a twinkling fairy flits along a drawn S-curve leaving pink-gold sparkles. */
function fairyTrail() {
  const c = compose({ timing: oneShot(48) });
  const path = c.add('guide', 'Fairy path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 440,
    h: 360,
    closed: false,
    path: [
      { x: -0.5, y: 0.4, ix: 0, iy: 0, ox: 0.25, oy: 0.1 },
      { x: -0.05, y: 0.05, ix: -0.2, iy: 0.25, ox: 0.2, oy: -0.25 },
      { x: 0.45, y: -0.4, ix: -0.25, iy: -0.1, ox: 0, oy: 0 },
    ],
  });
  const fairy = c.add('null', 'Fairy');
  c.set(fairy, {
    follow: { ...makeFollow(path, m), orient: false },
    keys: { 'follow.progress': setKey(setKey([], 0, 0, 'ease'), 1.5, 100, 'ease') },
  });
  const trail = c.add('sparkleEmitter', 'Sparkle trail', {
    blend: 'add',
    params: {
      'emit.stop': 1.5,
      'emit.rate': 40,
      'emit.cone': 360,
      'emit.speed': 25,
      'emit.gravity': 40,
      'emit.drag': 1,
      'emit.life': 0.9,
      'emit.lifeVariance': 0.4,
      'emit.size': 0.9,
      'emit.sizeVariance': 0.5,
      'emit.scaleOverLife': curve([
        [0, 1],
        [0.3, 0.5],
        [0.5, 0.9],
        [1, 0],
      ]),
      'emit.spin': 120,
      'emit.colorVariance': 0.4,
      'style.ramp': FAIRY,
      'glow.amount': 0.9,
    },
  });
  const dust = c.add('dotEmitter', 'Dust', {
    blend: 'add',
    params: {
      'emit.stop': 1.5,
      'emit.rate': 90,
      'emit.cone': 360,
      'emit.speed': 20,
      'emit.gravity': 30,
      'emit.turbulence': 10,
      'emit.life': 0.7,
      'emit.lifeVariance': 0.5,
      'emit.flicker': 0.5,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 4,
      'style.ramp': FAIRY,
      'glow.amount': 0.9,
    },
  });
  const body = c.add('sparkleEmitter', 'Fairy glow', {
    blend: 'add',
    params: {
      'emit.local': true,
      'emit.stop': 1.5,
      'emit.rate': 40,
      'emit.speed': 0,
      'emit.cone': 0,
      'emit.life': 0.2,
      'emit.lifeVariance': 0,
      'emit.size': 1.3,
      'emit.sizeVariance': 0.2,
      'emit.randomRotation': 45,
      'emit.scaleOverLife': FLAT,
      'emit.opacityOverLife': FLAT,
      'style.ramp': FAIRY,
      'glow.amount': 1.2,
      'glow.radius': 22,
    },
  });
  for (const id of [trail, dust, body]) c.parent(id, fairy);
  return c.done();
}

/** Healing Rise: green sparkles and motes rising gently from the ground. Loops. */
function healingRise() {
  const c = compose({ timing: loop(48) });
  const base = {
    'emit.shape': 'box',
    'emit.width': 260,
    'emit.height': 30,
    'emit.cone': 10,
    'emit.drag': 0.2,
    'emit.gravity': -40,
    'emit.turbulence': 16,
    'emit.opacityOverLife': SOFT_LIFE,
    'style.ramp': HEAL,
  };
  c.add('dotEmitter', 'Motes', {
    blend: 'add',
    transform: { y: 150 },
    params: {
      ...base,
      'emit.rate': 30,
      'emit.speed': 80,
      'emit.speedVariance': 0.6,
      'emit.life': 2.2,
      'emit.flicker': 0.3,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 4,
      'glow.amount': 0.9,
    },
  });
  c.add('sparkleEmitter', 'Sparkles', {
    blend: 'add',
    transform: { y: 150 },
    params: {
      ...base,
      'emit.rate': 8,
      'emit.speed': 110,
      'emit.life': 1.8,
      'emit.size': 1.3,
      'emit.sizeVariance': 0.4,
      'emit.spin': 60,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.2, 1],
        [1, 0.2],
      ]),
      'glow.amount': 1,
    },
  });
  return c.done();
}

/** Arcane Vortex: motes and sparkles whirling around a ring, spiralling out. Loops. */
function arcaneVortex() {
  const c = compose({ timing: loop(48) });
  c.add('dotEmitter', 'Whirl', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 200,
      'emit.outward': true,
      'emit.direction': 90,
      'emit.cone': 15,
      'emit.rate': 70,
      'emit.speed': 150,
      'emit.speedVariance': 0.3,
      'emit.drag': 0.8,
      'emit.life': 1.4,
      'emit.lifeVariance': 0.3,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SHRINK,
      'emit.colorVariance': 0.4,
      'dot.radius': 3.5,
      'trail.count': 3,
      'trail.spacing': 0.03,
      'style.ramp': ARCANE,
      'glow.amount': 0.9,
    },
  });
  c.add('sparkleEmitter', 'Sparkles', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 140,
      'emit.outward': true,
      'emit.direction': 90,
      'emit.rate': 10,
      'emit.speed': 120,
      'emit.drag': 0.8,
      'emit.life': 1.2,
      'emit.size': 0.7,
      'emit.spin': 180,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SHRINK,
      'style.ramp': ARCANE,
      'glow.amount': 1,
    },
  });
  c.add('blob', 'Core', {
    blend: 'add',
    params: {
      'blob.radius': 34,
      'blob.noise': 0.2,
      'style.ramp': ARCANE,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 0.6,
      'glow.radius': 30,
    },
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const MAGIC_PRESETS = Object.freeze([
  {
    id: 'arcaneBurst',
    name: 'Arcane Burst',
    blurb: 'A charge-up, a flash, then a rune ring, swooshes and sparkles. One-shot.',
    build: arcaneBurst,
  },
  {
    id: 'healingAura',
    name: 'Healing Aura',
    blurb: 'Green swooshes and sparkles orbiting a soft glow. Seamless loop.',
    build: healingAura,
  },
  {
    id: 'energyOrb',
    name: 'Energy Orb',
    blurb: 'A swirling plasma ball wrapped in orbiting swooshes. Seamless loop.',
    build: energyOrb,
  },
  {
    id: 'holySmite',
    name: 'Holy Smite',
    blurb: 'A pillar of light slams down, a halo spreads, sparkles rise. One-shot.',
    build: holySmite,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const MAGIC_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'fairyTrail',
    name: 'Fairy Trail',
    blurb: 'A twinkling fairy flits along a drawn curve, leaving pink-gold sparkles. One-shot.',
    build: fairyTrail,
  },
  {
    id: 'healingRise',
    name: 'Healing Rise',
    blurb: 'Green sparkles and motes rising gently from the ground. Seamless loop.',
    build: healingRise,
  },
  {
    id: 'arcaneVortex',
    name: 'Arcane Vortex',
    blurb: 'Motes and sparkles whirling around a ring and spiralling out. Seamless loop.',
    build: arcaneVortex,
  },
]);
