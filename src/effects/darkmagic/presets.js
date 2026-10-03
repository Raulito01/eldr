// @ts-check
/**
 * Vortex & Dark Magic presets (D-115): Ground Portal, Dark Vortex Orb, Black Hole, Curse Swirl,
 * Dark Implosion (layer presets) and Soul Drain, Void Motes (particle presets). Built on the
 * Vortex and Light-rays layers and the emitter's pull / swirl forces, after Raul's three
 * references (a ground portal with god rays, ribbons wrapping a dark orb, a black hole).
 *
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { compose, curve, loop, oneShot, ramp, SOFT_LIFE } from '../presetKit.js';

const FLAT = curve([
  [0, 1],
  [1, 1],
]);
/** Portal light: white-hot, pink, magenta, violet, deep indigo. */
const PORTAL = ramp([
  [0, '#ffffff'],
  [0.18, '#ffd0fb'],
  [0.4, '#ff5ce6'],
  [0.65, '#b02ad8'],
  [0.85, '#4a1a9a'],
  [1, '#16083a'],
]);
/** The light column: cyan-white into indigo. */
const COLUMN = ramp([
  [0, '#e8fbff'],
  [0.3, '#8fd8ff'],
  [0.6, '#5a4dff'],
  [1, '#1a0a5a'],
]);
/** Dark-magic violet. */
const VIOLET = ramp([
  [0, '#ffffff'],
  [0.2, '#f1c6ff'],
  [0.45, '#c46bff'],
  [0.72, '#7a2fd6'],
  [1, '#2a0f4a'],
]);
/** Void body: almost black with a violet sheen. */
const VOID = ramp([
  [0, '#5a2a8a'],
  [0.35, '#2e1450'],
  [0.7, '#140a24'],
  [1, '#06030c'],
]);
/** Dark cel smoke. */
const DARK_SMOKE = ramp([
  [0, '#6a5a86'],
  [0.4, '#3e3056'],
  [0.75, '#221a34'],
  [1, '#120d1c'],
]);
/** Gold glitter. */
const GLITTER = ramp([
  [0, '#ffffff'],
  [0.4, '#ffe9a8'],
  [1, '#ffb347'],
]);
/** Curse: sickly green into violet. */
const CURSE = ramp([
  [0, '#f4ffd6'],
  [0.25, '#a8ff5c'],
  [0.5, '#3fbf6a'],
  [0.75, '#6a2fa8'],
  [1, '#1e0b33'],
]);
/** Souls: pale cyan. */
const SOUL = ramp([
  [0, '#ffffff'],
  [0.3, '#c8fff6'],
  [0.6, '#5ae0ff'],
  [1, '#3a3aa8'],
]);
const FADE_IN_OUT = curve([
  [0, 0],
  [0.2, 1],
  [0.75, 1],
  [1, 0],
]);

/** Ground Portal: a swirling galaxy disc on the ground, a glowing rim, god rays, rising motes. */
function groundPortal() {
  const c = compose({ timing: loop(48) });
  const R = 150;
  const TILT = 72;
  const squash = Math.cos((TILT * Math.PI) / 180) * 100;
  const y = 140;
  c.add('rays', 'Fan rays', {
    blend: 'add',
    transform: { y },
    params: {
      'rays.count': 26,
      'rays.length': 230,
      'rays.width': 30,
      'rays.tip': 1.6,
      'rays.spread': 150,
      'rays.fan': 0.75,
      'rays.baseWidth': R * 2.1,
      'rays.baseHeight': (R * 2 * squash) / 100,
      'rays.fade': 1,
      'rays.softness': 0.75,
      'rays.brightness': 0.32,
      'rays.flicker': 0.6,
      'style.ramp': PORTAL,
      'style.spread': 0.5,
    },
  });
  c.add('rays', 'Light column', {
    blend: 'add',
    transform: { y },
    params: {
      'rays.count': 12,
      'rays.length': 330,
      'rays.lengthVariance': 0.3,
      'rays.width': 46,
      'rays.tip': 1.2,
      'rays.spread': 30,
      'rays.fan': 0,
      'rays.baseWidth': R * 1.2,
      'rays.baseHeight': 10,
      'rays.fade': 1,
      'rays.softness': 0.85,
      'rays.brightness': 0.28,
      'rays.flicker': 0.4,
      'rays.flickerSpeed': 1.5,
      'style.ramp': COLUMN,
      'style.spread': 0.6,
    },
  });
  const disc = c.add('fractalNoise', 'Portal swirl', {
    blend: 'add',
    transform: { y, scaleY: squash },
    params: {
      'fn.type': 'liquid',
      'fn.width': R * 2,
      'fn.height': R * 2,
      'fn.scale': 70,
      'fn.twirl': 540,
      'fn.contrast': 140,
      'fn.brightness': -20,
      'fn.rotation': 0,
      'fn.evoSpeed': 2.75,
      'fn.bands': 4,
      'fn.bandSoft': 0.3,
      'fn.alpha': 'luma',
      'fn.ramp': PORTAL,
    },
  });
  c.circleMask(disc, R * 0.98, 12);
  c.add('vortex', 'Swirl arms', {
    blend: 'add',
    transform: { y },
    params: {
      'vortex.radius': R,
      'vortex.arms': 4,
      'vortex.twist': 1.2,
      'vortex.width': 22,
      'vortex.inner': 0.08,
      'vortex.tilt': TILT,
      'vortex.speed': 0.5,
      'vortex.breakup': 0.35,
      'style.ramp': PORTAL,
      'glow.amount': 1,
      'glow.radius': 18,
    },
  });
  c.add('ring', 'Glowing rim', {
    blend: 'add',
    transform: { y, scaleY: squash },
    params: {
      'ring.radius': R,
      'ring.thickness': 0.09,
      'ring.distortion': 0.04,
      'ring.thicknessOverLife': FLAT,
      'style.ramp': PORTAL,
      'style.bands': 2,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 1.6,
      'glow.radius': 36,
    },
  });
  c.add('dotEmitter', 'Rising motes', {
    blend: 'add',
    transform: { y },
    params: {
      'emit.shape': 'box',
      'emit.width': R * 1.6,
      'emit.height': 30,
      'emit.rate': 16,
      'emit.direction': 0,
      'emit.cone': 20,
      'emit.speed': 70,
      'emit.speedVariance': 0.6,
      'emit.drag': 0.3,
      'emit.turbulence': 10,
      'emit.life': 1.8,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.flicker': 0.5,
      'dot.radius': 2.5,
      'style.ramp': PORTAL,
      'glow.amount': 1,
    },
  });
  return c.done();
}

/** Dark Vortex Orb: light ribbons spiralling around a dark ball, dark smoke, a glitter ring. */
function darkVortexOrb() {
  const c = compose({ timing: loop(48) });
  const R = 110;
  c.add('celSmokeEmitter', 'Dark smoke', {
    params: {
      'emit.shape': 'ring',
      'emit.width': R * 2.2,
      'emit.rate': 10,
      'emit.speed': 30,
      'emit.outward': true,
      'emit.swirl': 0.1,
      'emit.life': 1.6,
      'cs.size': 34,
      'cs.lumps': 5,
      'cs.holeCount': 8,
      'cs.holeStart': 0.3,
      'style.ramp': DARK_SMOKE,
    },
  });
  c.add('vortex', 'Glitter swirl', {
    blend: 'add',
    transform: { y: R * 0.75 },
    params: {
      'vortex.radius': R * 1.6,
      'vortex.inner': 0.45,
      'vortex.arms': 6,
      'vortex.twist': 0.5,
      'vortex.width': 6,
      'vortex.tilt': 76,
      'vortex.speed': 0.5,
      'vortex.breakup': 0.55,
      'vortex.breakupSize': 6,
      'style.ramp': GLITTER,
      'glow.amount': 1.2,
      'glow.radius': 10,
    },
  });
  c.add('vortex', 'Ribbons (far side)', {
    blend: 'add',
    params: {
      'vortex.form': 'sphere',
      'vortex.side': 'back',
      'vortex.radius': R,
      'vortex.arms': 4,
      'vortex.twist': 1.4,
      'vortex.width': 16,
      'vortex.inner': 0.1,
      'vortex.tilt': 18,
      'vortex.speed': 0.5,
      'vortex.breakup': 0.15,
      'vortex.depthShade': 0.6,
      'style.ramp': VIOLET,
      'glow.amount': 0.6,
    },
  });
  const ball = c.add('fractalNoise', 'Dark ball', {
    params: {
      'fn.wrap': 'sphere',
      'fn.width': R * 2,
      'fn.height': R * 2,
      'fn.type': 'turbulent',
      'fn.scale': 80,
      'fn.contrast': 120,
      'fn.brightness': -10,
      'fn.spin': 0.5,
      'fn.evoSpeed': 2.75,
      'fn.bands': 3,
      'fn.ramp': VOID,
    },
  });
  c.circleMask(ball, R * 0.92, 2);
  c.add('vortex', 'Ribbons (near side)', {
    blend: 'add',
    params: {
      'vortex.form': 'sphere',
      'vortex.side': 'front',
      'vortex.radius': R,
      'vortex.arms': 4,
      'vortex.twist': 1.4,
      'vortex.width': 16,
      'vortex.inner': 0.1,
      'vortex.tilt': 18,
      'vortex.speed': 0.5,
      'vortex.breakup': 0.15,
      'style.ramp': VIOLET,
      'glow.amount': 1.2,
      'glow.radius': 24,
    },
  });
  c.add('sparkleEmitter', 'Twinkles', {
    blend: 'add',
    params: {
      'emit.shape': 'circle',
      'emit.width': R * 2.4,
      'emit.rate': 8,
      'emit.speed': 0,
      'emit.life': 0.6,
      'emit.size': 0.5,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.5, 1],
        [1, 0],
      ]),
      'style.ramp': VIOLET,
      'glow.amount': 1,
    },
  });
  return c.done();
}

/** Black Hole: a dark disc, two bright arms, a smoky rim with violet wisps, debris pulled in. */
function blackHole() {
  const c = compose({ timing: loop(48) });
  const R = 120;
  c.add('celSmokeEmitter', 'Smoky rim', {
    params: {
      'emit.shape': 'ring',
      'emit.width': R * 2.3,
      'emit.rate': 14,
      'emit.speed': 0,
      'emit.pull': 0.35,
      'emit.swirl': 0.18,
      'emit.life': 1.4,
      'cs.size': 30,
      'cs.lumps': 5,
      'cs.holeCount': 10,
      'cs.holeStart': 0.25,
      'style.ramp': DARK_SMOKE,
    },
  });
  c.add('wispEmitter', 'Violet wisps', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': R * 2.1,
      'emit.rate': 12,
      'emit.speed': 30,
      'emit.outward': true,
      'emit.swirl': 0.2,
      'emit.life': 0.9,
      'emit.alignToVelocity': true,
      'emit.opacityOverLife': FADE_IN_OUT,
      'wisp.length': 50,
      'wisp.width': 9,
      'style.ramp': VIOLET,
      'glow.amount': 1,
      'glow.radius': 12,
    },
  });
  c.add('blob', 'Event horizon', {
    params: {
      'blob.radius': R,
      'blob.noise': 0.04,
      'style.ramp': VOID,
      'style.bands': 2,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 0,
    },
  });
  const inner = c.add('fractalNoise', 'Inner swirl', {
    blend: 'add',
    params: {
      'fn.type': 'liquid',
      'fn.width': R * 2,
      'fn.height': R * 2,
      'fn.scale': 60,
      'fn.twirl': 720,
      'fn.contrast': 160,
      'fn.brightness': -85,
      'fn.evoSpeed': 2.75,
      'fn.bands': 3,
      'fn.alpha': 'luma',
      'fn.ramp': VIOLET,
    },
  });
  c.circleMask(inner, R * 0.9, 16);
  c.add('vortex', 'Bright arms', {
    blend: 'add',
    params: {
      'vortex.radius': R * 0.85,
      'vortex.inner': 0.25,
      'vortex.arms': 2,
      'vortex.twist': 0.55,
      'vortex.width': 26,
      'vortex.balance': 0.4,
      'vortex.speed': -0.5,
      'vortex.breakup': 0.2,
      'vortex.flow': -1.5,
      'style.ramp': VIOLET,
      'glow.amount': 1.4,
      'glow.radius': 22,
    },
  });
  c.add('ring', 'Rim light', {
    blend: 'add',
    params: {
      'ring.radius': R,
      'ring.thickness': 0.05,
      'ring.distortion': 0.05,
      'ring.thicknessOverLife': FLAT,
      'style.ramp': VIOLET,
      'style.bands': 2,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
      'glow.amount': 1.2,
      'glow.radius': 20,
    },
  });
  c.add('debrisEmitter', 'Debris pulled in', {
    params: {
      'emit.shape': 'ring',
      'emit.width': R * 3.4,
      'emit.rate': 6,
      'emit.speed': 0,
      'emit.pull': 1.4,
      'emit.swirl': 0.15,
      'emit.life': 1.6,
      'emit.spin': 200,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.15, 1],
        [0.8, 0.8],
        [1, 0],
      ]),
      'debris.size': 5,
      'outline.mode': 'outer',
      'outline.px': 1.5,
    },
  });
  return c.done();
}

/** Curse Swirl: a small sickly swirl hanging over a target, dark wisps rising, motes sucked in. */
function curseSwirl() {
  const c = compose({ timing: loop(32) });
  const y = -60;
  c.add('wispEmitter', 'Dark wisps', {
    transform: { y: y + 10 },
    params: {
      'emit.shape': 'circle',
      'emit.width': 90,
      'emit.rate': 8,
      'emit.direction': 0,
      'emit.cone': 40,
      'emit.speed': 50,
      'emit.life': 1.1,
      'emit.opacityOverLife': FADE_IN_OUT,
      'wisp.length': 60,
      'wisp.width': 10,
      'style.ramp': DARK_SMOKE,
    },
  });
  c.add('vortex', 'Curse swirl', {
    blend: 'add',
    transform: { y },
    params: {
      'vortex.radius': 110,
      'vortex.arms': 3,
      'vortex.twist': 1.3,
      'vortex.width': 18,
      'vortex.tilt': 68,
      'vortex.speed': 0.75,
      'vortex.breakup': 0.3,
      'style.ramp': CURSE,
      'glow.amount': 1.2,
      'glow.radius': 18,
    },
  });
  c.add('dotEmitter', 'Motes sucked in', {
    blend: 'add',
    transform: { y },
    params: {
      'emit.shape': 'ring',
      'emit.width': 280,
      'emit.rate': 26,
      'emit.speed': 0,
      'emit.pull': 2,
      'emit.swirl': 0.35,
      'emit.swirlTilt': 68,
      'emit.life': 0.9,
      'emit.opacityOverLife': FADE_IN_OUT,
      'dot.radius': 2.5,
      'trail.count': 3,
      'style.ramp': CURSE,
      'glow.amount': 1,
    },
  });
  return c.done();
}

/** Dark Implosion: everything is sucked into a dark point, then it pops in a violet blast. */
function darkImplosion() {
  const c = compose({
    timing: oneShot(36),
    globals: {
      'explosion.impact': 0.45,
      'explosion.flashFrames': 1,
      'explosion.anticipation': true,
    },
  });
  c.add('celSmokeBurst', 'Dark smoke', {
    anchor: 'afterImpact',
    params: {
      'burst.count': 8,
      'burst.speed': 260,
      'burst.drag': 4,
      'burst.life': 0.9,
      'cs.size': 34,
      'cs.holeCount': 10,
      'cs.holeStart': 0.15,
      'style.ramp': DARK_SMOKE,
    },
  });
  c.add('vortex', 'Inward swirl', {
    blend: 'add',
    anchor: 'anticipation',
    params: {
      'vortex.radius': 170,
      'vortex.arms': 5,
      'vortex.twist': 1.2,
      'vortex.width': 16,
      'vortex.speed': -1,
      'vortex.flow': -3,
      'vortex.breakup': 0.35,
      'single.scaleOverLife': curve([
        [0, 1.2],
        [1, 0.1],
      ]),
      'single.opacityOverLife': curve([
        [0, 0],
        [0.3, 1],
        [1, 1],
      ]),
      'style.ramp': VIOLET,
      'glow.amount': 1,
    },
  });
  c.add('dotEmitter', 'Sucked-in motes', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 380,
      'emit.rate': 50,
      'emit.speed': 0,
      'emit.pull': 3,
      'emit.swirl': 0.3,
      'emit.life': 0.6,
      'emit.start': 0,
      'emit.stop': 0.42,
      'emit.opacityOverLife': FADE_IN_OUT,
      'dot.radius': 2.5,
      'trail.count': 3,
      'style.ramp': VIOLET,
      'glow.amount': 1,
    },
  });
  c.add('blob', 'Dark core', {
    anchor: 'anticipation',
    params: {
      'blob.radius': 60,
      'style.ramp': VOID,
      'shade.shadow': 0,
      'glow.amount': 1,
      'glow.tint': '#8a3affc0',
      'single.scaleOverLife': curve([
        [0, 1.4],
        [1, 0.2],
      ]),
      'single.opacityOverLife': FLAT,
    },
  });
  c.add('ring', 'Blast ring', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'ring.radius': 190,
      'ring.thickness': 0.3,
      'ring.thicknessOverLife': curve([
        [0, 0],
        [0.15, 1],
        [0.55, 0.22],
        [1, 0.08],
      ]),
      'ring.distortion': 0,
      'single.end': 0.45,
      'style.ramp': VIOLET,
      'style.bands': 2,
      'glow.amount': 1,
    },
  });
  c.add('crescentBurst', 'Dark slashes', {
    anchor: 'afterImpact',
    blend: 'add',
    params: {
      'burst.count': 7,
      'burst.speed': 900,
      'burst.drag': 6,
      'burst.life': 0.5,
      'burst.alignToVelocity': true,
      'burst.randomRotation': 0,
      'crescent.radius': 70,
      'crescent.thickness': 18,
      'crescent.sharpness': 0.85,
      'style.ramp': VIOLET,
      'glow.amount': 1,
    },
  });
  c.add('blob', 'Flash', {
    anchor: 'flash',
    blend: 'add',
    params: {
      'blob.radius': 150,
      'style.ramp': VIOLET,
      'style.bands': 1,
      'style.spread': 0,
      'shade.shadow': 0,
      'single.scaleOverLife': FLAT,
      'single.opacityOverLife': FLAT,
    },
  });
  return c.done();
}

/** Soul Drain: pale souls spiralling into the centre with trails. */
function soulDrain() {
  const c = compose({ timing: loop(48) });
  c.add('dotEmitter', 'Souls', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 420,
      'emit.rate': 18,
      'emit.speed': 0,
      'emit.pull': 1.3,
      'emit.swirl': 0.3,
      'emit.life': 1.6,
      'emit.opacityOverLife': FADE_IN_OUT,
      'emit.scaleOverLife': curve([
        [0, 0.6],
        [0.6, 1],
        [1, 0.3],
      ]),
      'dot.radius': 5,
      'trail.count': 6,
      'trail.spacing': 0.035,
      'style.ramp': SOUL,
      'glow.amount': 1.2,
      'glow.radius': 14,
    },
  });
  c.add('sparkleEmitter', 'Glints', {
    blend: 'add',
    params: {
      'emit.shape': 'ring',
      'emit.width': 300,
      'emit.rate': 10,
      'emit.speed': 0,
      'emit.pull': 1.5,
      'emit.swirl': 0.3,
      'emit.life': 0.8,
      'emit.size': 0.5,
      'style.ramp': SOUL,
      'glow.amount': 1,
    },
  });
  return c.done();
}

/** Void Motes: violet motes drifting on a slow tilted swirl, flickering. */
function voidMotes() {
  const c = compose({ timing: loop(48) });
  c.add('dotEmitter', 'Void motes', {
    blend: 'add',
    params: {
      'emit.shape': 'circle',
      'emit.width': 320,
      'emit.rate': 40,
      'emit.speed': 10,
      'emit.swirl': 0.15,
      'emit.swirlTilt': 60,
      'emit.turbulence': 12,
      'emit.life': 2,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.flicker': 0.6,
      'emit.colorVariance': 0.5,
      'dot.radius': 4.5,
      'style.ramp': VIOLET,
      'glow.amount': 1.4,
      'glow.radius': 12,
    },
  });
  c.add('wispEmitter', 'Dark wisps', {
    params: {
      'emit.shape': 'circle',
      'emit.width': 280,
      'emit.rate': 4,
      'emit.direction': 0,
      'emit.cone': 60,
      'emit.speed': 30,
      'emit.life': 1.6,
      'emit.opacityOverLife': FADE_IN_OUT,
      'wisp.length': 70,
      'wisp.width': 8,
      'style.ramp': DARK_SMOKE,
    },
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const DARK_MAGIC_PRESETS = Object.freeze([
  {
    id: 'groundPortal',
    name: 'Ground Portal',
    blurb:
      'A swirling galaxy disc on the ground, a glowing rim, god rays and rising motes. Seamless loop.',
    build: groundPortal,
  },
  {
    id: 'darkVortexOrb',
    name: 'Dark Vortex Orb',
    blurb:
      'Light ribbons spiralling around a dark ball, dark smoke and a glitter swirl below. Seamless loop.',
    build: darkVortexOrb,
  },
  {
    id: 'blackHole',
    name: 'Black Hole',
    blurb:
      'A dark disc with two bright arms, a smoky rim with violet wisps, debris pulled in. Seamless loop.',
    build: blackHole,
  },
  {
    id: 'curseSwirl',
    name: 'Curse Swirl',
    blurb: 'A small sickly swirl over a target, dark wisps rising, motes sucked in. Seamless loop.',
    build: curseSwirl,
  },
  {
    id: 'darkImplosion',
    name: 'Dark Implosion',
    blurb: 'Everything is sucked into a dark point, then it pops in a violet blast. One-shot.',
    build: darkImplosion,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const DARK_MAGIC_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'soulDrain',
    name: 'Soul Drain',
    blurb: 'Pale souls spiral into the centre with trails. Seamless loop.',
    build: soulDrain,
  },
  {
    id: 'voidMotes',
    name: 'Void Motes',
    blurb: 'Violet motes drifting on a slow tilted swirl, with dark wisps. Seamless loop.',
    build: voidMotes,
  },
]);
