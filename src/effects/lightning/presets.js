// @ts-check
/**
 * Lightning presets (D-070): Lightning Strike, Chain Arc, Electric Orb, Thunder Impact (layer
 * presets) and Static Crackle, Electric Sparks, Charged Ring (particle presets). Each builds a
 * whole, editable composition from Bolt layers and the existing shapes / emitters.
 *
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { rampPreset } from '../../render/rampPresets.js';
import { compose, curve, loop, oneShot, ramp, SHRINK, SOFT_LIFE } from '../presetKit.js';

/** Electric blue: white core → ice → blue → deep violet. */
const VOLT = ramp([
  [0, '#ffffff'],
  [0.25, '#d8f6ff'],
  [0.5, '#7fd8ff'],
  [0.75, '#4a7dff'],
  [1, '#3a2a9a'],
]);
const FLAT = curve([
  [0, 1],
  [1, 1],
]);
/** White-blue impact flash. */
const FLASH = ramp([
  [0, '#ffffff'],
  [1, '#e3f6ff'],
]);

/** A full-strength flash blob (anchored to the impact). @param {number} r @param {number} [y] */
const flash = (r, y = 0) => ({
  anchor: 'flash',
  params: {
    'blob.radius': r,
    'blob.noise': 0.08,
    'single.y': y,
    'style.ramp': FLASH,
    'style.bands': 1,
    'style.spread': 0,
    'shade.shadow': 0,
    'outline.mode': 'off',
    'single.scaleOverLife': curve([
      [0, 1],
      [1, 1.2],
    ]),
    'single.opacityOverLife': FLAT,
  },
});

/** Lightning Strike: a bolt cracks down from the sky, flash, ground ring, sparks and smoke. */
function lightningStrike() {
  const c = compose({
    timing: oneShot(26),
    globals: { 'explosion.impact': 0.08, 'explosion.flashFrames': 2 },
  });
  const ground = 190;
  c.add('puffBurst', 'Smoke', {
    anchor: 'afterImpact',
    transform: { y: ground },
    params: {
      'burst.count': 9,
      'burst.speed': 120,
      'burst.direction': 0,
      'burst.cone': 140,
      'burst.buoyancy': 160,
      'burst.life': 0.85,
      'burst.spawnRadius': 20,
      'puff.radius': 26,
      'style.ramp': rampPreset('smokeDark'),
      'style.bands': 3,
    },
  });
  c.add('ring', 'Ground ring', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground, scaleY: 32 },
    params: {
      'ring.radius': 150,
      'ring.thickness': 0.18,
      'ring.breaks': 3,
      'single.end': 0.4,
      'style.ramp': VOLT,
      'glow.amount': 0.8,
      'glow.radius': 16,
    },
  });
  c.add('bolt', 'Strike', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'single.y': -290,
      'bolt.endX': 30,
      'bolt.endY': 480,
      'bolt.width': 7,
      'bolt.branches': 5,
      'bolt.branchLength': 0.3,
      'bolt.restrike': 14,
      'bolt.flicker': 0.25,
      'single.start': 0,
      'single.end': 0.45,
      'bolt.reveal': curve([
        [0, 0.15],
        [0.15, 1],
        [1, 1],
      ]),
      'style.ramp': VOLT,
    },
  });
  c.add('bolt', 'Afterglow bolt', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'single.y': -290,
      'bolt.endX': 10,
      'bolt.endY': 480,
      'bolt.width': 3,
      'bolt.halo': 2,
      'bolt.branches': 2,
      'bolt.restrike': 8,
      'bolt.flicker': 0.6,
      'single.start': 0.2,
      'single.end': 0.65,
      'style.ramp': VOLT,
      'style.rampOverLife': curve([
        [0, 0.1],
        [1, 0.7],
      ]),
    },
  });
  c.add('streakBurst', 'Sparks', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground },
    params: {
      'burst.count': 26,
      'burst.direction': 0,
      'burst.cone': 150,
      'burst.speed': 700,
      'burst.gravity': 1400,
      'burst.drag': 2,
      'burst.life': 0.5,
      'streak.length': 26,
      'streak.thickness': 3,
      'style.ramp': VOLT,
      'glow.amount': 0.7,
    },
  });
  c.add('blob', 'Impact flash', flash(150, ground));
  return c.done();
}

/** Chain Arc: a bolt crackling between two points, contact glows at both ends. Loops. */
function chainArc() {
  const c = compose({ timing: loop(24) });
  const glow = (/** @type {number} */ x) => ({
    blend: 'add',
    params: {
      'single.x': x,
      'blob.radius': 22,
      'blob.noise': 0.25,
      'blob.wobble': 6,
      'style.ramp': VOLT,
      'style.bands': 3,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 1,
      'glow.radius': 30,
    },
  });
  c.add('bolt', 'Arc', {
    blend: 'add',
    params: {
      'single.x': -200,
      'bolt.endX': 400,
      'bolt.endY': 0,
      'bolt.width': 5,
      'bolt.taper': 0.2,
      'bolt.jag': 0.16,
      'bolt.branches': 2,
      'bolt.restrike': 12,
      'bolt.flicker': 0.2,
      'single.opacityOverLife': FLAT,
      'style.ramp': VOLT,
    },
  });
  c.add('bolt', 'Second arc', {
    blend: 'add',
    params: {
      'single.x': -200,
      'bolt.endX': 400,
      'bolt.endY': 0,
      'bolt.width': 2,
      'bolt.halo': 2,
      'bolt.taper': 0.2,
      'bolt.branches': 1,
      'bolt.jag': 0.45,
      'bolt.restrike': 8,
      'bolt.flicker': 0.7,
      'single.opacityOverLife': FLAT,
      'style.ramp': VOLT,
    },
  });
  c.add('blob', 'Contact left', glow(-200));
  c.add('blob', 'Contact right', glow(200));
  return c.done();
}

/** Electric Orb: a plasma core with bolts lashing out all around. Loops. */
function electricOrb() {
  const c = compose({ timing: loop(24) });
  c.add('bolt', 'Discharge', {
    blend: 'add',
    params: {
      'bolt.count': 6,
      'bolt.spread': 360,
      'bolt.endY': 170,
      'bolt.lengthVariance': 0.5,
      'bolt.width': 3,
      'bolt.branches': 1,
      'bolt.restrike': 10,
      'bolt.flicker': 0.3,
      'single.opacityOverLife': FLAT,
      'style.ramp': VOLT,
    },
  });
  c.add('fieldFire', 'Plasma core', {
    blend: 'add',
    params: {
      'field.form': 'ball',
      'field.width': 120,
      'field.height': 120,
      'field.speed': 3,
      'style.ramp': VOLT,
      'style.bands': 4,
      'glow.amount': 0.9,
      'glow.radius': 30,
    },
  });
  c.add('orbitSparkle', 'Orbiting sparks', {
    blend: 'add',
    params: {
      'orbit.count': 5,
      'orbit.radius': 95,
      'orbit.speed': 1,
      'orbit.speedVariance': 0,
      'sparkle.size': 12,
      'style.ramp': VOLT,
      'glow.amount': 0.8,
    },
  });
  return c.done();
}

/** Thunder Impact: several bolts slam the ground, it cracks with crawling arcs, rocks fly. */
function thunderImpact() {
  const c = compose({
    timing: oneShot(32),
    globals: { 'explosion.impact': 0.06, 'explosion.flashFrames': 3 },
  });
  const ground = 150;
  c.add('puffBurst', 'Dust', {
    anchor: 'afterImpact',
    transform: { y: ground },
    params: {
      'burst.count': 12,
      'burst.speed': 220,
      'burst.direction': 0,
      'burst.cone': 170,
      'burst.buoyancy': 120,
      'burst.life': 0.9,
      'burst.spawnRadius': 40,
      'puff.radius': 34,
      'style.ramp': rampPreset('dust'),
      'style.bands': 3,
    },
  });
  c.add('bolt', 'Ground arcs', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground, scaleY: 30 },
    params: {
      'bolt.count': 7,
      'bolt.spread': 360,
      'bolt.endY': 230,
      'bolt.lengthVariance': 0.5,
      'bolt.width': 4,
      'bolt.branches': 2,
      'bolt.restrike': 12,
      'single.end': 0.55,
      'bolt.reveal': curve([
        [0, 0.1],
        [0.25, 1],
        [1, 1],
      ]),
      'style.ramp': VOLT,
    },
  });
  c.add('ring', 'Shockwave', {
    anchor: 'afterImpact',
    blend: 'add',
    transform: { y: ground, scaleY: 35 },
    params: {
      'ring.radius': 230,
      'ring.thickness': 0.12,
      'single.end': 0.45,
      'style.ramp': VOLT,
      'glow.amount': 0.6,
    },
  });
  c.add('bolt', 'Strikes', {
    anchor: 'afterImpact',
    params: {
      'single.y': ground,
      'bolt.endY': -480,
      'bolt.count': 3,
      'bolt.spread': 40,
      'bolt.lengthVariance': 0.1,
      'bolt.width': 6,
      'bolt.taper': 0.5,
      'bolt.branches': 3,
      'bolt.restrike': 16,
      'single.end': 0.4,
      'style.ramp': VOLT,
    },
    blend: 'add',
  });
  c.add('debrisBurst', 'Rocks', {
    anchor: 'afterImpact',
    transform: { y: ground },
    params: {
      'burst.count': 14,
      'burst.direction': 0,
      'burst.cone': 120,
      'burst.speed': 640,
      'burst.gravity': 1800,
      'burst.life': 0.8,
      'style.ramp': rampPreset('rock'),
    },
  });
  c.add('blob', 'Impact flash', flash(150, ground));
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Static Crackle: tiny bolts popping all over an area, with blue specks. Loops. */
function staticCrackle() {
  const c = compose({ timing: loop(48) });
  c.add('boltEmitter', 'Crackles', {
    blend: 'add',
    params: {
      'emit.shape': 'box',
      'emit.width': 320,
      'emit.height': 220,
      'emit.rate': 30,
      'emit.speed': 0,
      'emit.life': 0.22,
      'emit.lifeVariance': 0.4,
      'emit.size': 1.8,
      'emit.sizeVariance': 0.5,
      'emit.scaleOverLife': FLAT,
      'emit.opacityOverLife': curve([
        [0, 1],
        [0.6, 1],
        [1, 0],
      ]),
      'bolt.endY': 48,
      'bolt.width': 2.5,
      'bolt.restrike': 20,
      'style.ramp': VOLT,
    },
  });
  c.add('dotEmitter', 'Specks', {
    blend: 'add',
    params: {
      'emit.shape': 'box',
      'emit.width': 320,
      'emit.height': 220,
      'emit.rate': 40,
      'emit.cone': 360,
      'emit.speed': 60,
      'emit.turbulence': 60,
      'emit.turbSpeed': 4,
      'emit.life': 0.5,
      'emit.flicker': 0.8,
      'emit.scaleOverLife': SHRINK,
      'dot.radius': 3.5,
      'style.ramp': VOLT,
      'glow.amount': 0.8,
    },
  });
  return c.done();
}

/** Electric Sparks: jittery sparks spraying out of a point and fizzling. Loops. */
function electricSparks() {
  const c = compose({ timing: loop(24) });
  c.add('sparkEmitter', 'Sparks', {
    blend: 'add',
    params: {
      'emit.rate': 60,
      'emit.cone': 360,
      'emit.speed': 560,
      'emit.speedVariance': 0.6,
      'emit.drag': 3,
      'emit.turbulence': 70,
      'emit.turbSpeed': 6,
      'emit.life': 0.45,
      'emit.lifeVariance': 0.4,
      'emit.size': 1,
      'emit.flicker': 0.6,
      'emit.alignToVelocity': true,
      'emit.scaleOverLife': SHRINK,
      'style.ramp': VOLT,
      'glow.amount': 0.8,
    },
  });
  c.add('boltEmitter', 'Crackles', {
    blend: 'add',
    params: {
      'emit.rate': 10,
      'emit.speed': 0,
      'emit.life': 0.15,
      'bolt.endY': 110,
      'bolt.width': 3,
      'emit.scaleOverLife': FLAT,
      'style.ramp': VOLT,
    },
  });
  return c.done();
}

/** Charged Ring: crackles and motes all around a ring, lashing outward. Loops. */
function chargedRing() {
  const c = compose({ timing: loop(48) });
  c.add('boltEmitter', 'Ring crackles', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 260,
      'emit.outward': true,
      'emit.rate': 36,
      'emit.speed': 30,
      'emit.cone': 0,
      'emit.randomRotation': 0,
      'emit.alignToVelocity': true,
      'emit.life': 0.2,
      'emit.lifeVariance': 0.3,
      'emit.scaleOverLife': FLAT,
      'bolt.endX': 80,
      'bolt.endY': 0,
      'bolt.width': 3,
      'style.ramp': VOLT,
    },
  });
  c.add('dotEmitter', 'Motes', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 260,
      'emit.outward': true,
      'emit.direction': 90,
      'emit.rate': 40,
      'emit.cone': 20,
      'emit.speed': 80,
      'emit.drag': 0.5,
      'emit.life': 1.2,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SHRINK,
      'emit.flicker': 0.5,
      'dot.radius': 4,
      'style.ramp': VOLT,
      'glow.amount': 0.9,
    },
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const LIGHTNING_PRESETS = Object.freeze([
  {
    id: 'lightningStrike',
    name: 'Lightning Strike',
    blurb: 'A bolt cracks down from the sky: flash, ground ring, sparks, smoke. One-shot.',
    build: lightningStrike,
  },
  {
    id: 'chainArc',
    name: 'Chain Arc',
    blurb: 'A bolt crackling between two points, glowing contacts. Seamless loop.',
    build: chainArc,
  },
  {
    id: 'electricOrb',
    name: 'Electric Orb',
    blurb: 'A plasma core with bolts lashing out all around. Seamless loop.',
    build: electricOrb,
  },
  {
    id: 'thunderImpact',
    name: 'Thunder Impact',
    blurb: 'Bolts slam the ground, arcs crawl out, rocks fly. One-shot.',
    build: thunderImpact,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const LIGHTNING_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'staticCrackle',
    name: 'Static Crackle',
    blurb: 'Tiny bolts popping all over an area, with blue specks. Seamless loop.',
    build: staticCrackle,
  },
  {
    id: 'electricSparks',
    name: 'Electric Sparks',
    blurb: 'Jittery sparks spraying from a point and fizzling. Seamless loop.',
    build: electricSparks,
  },
  {
    id: 'chargedRing',
    name: 'Charged Ring',
    blurb: 'Crackles and motes lashing out all around a ring. Seamless loop.',
    build: chargedRing,
  },
]);
