// @ts-check
/**
 * Smoke presets (D-081), cartoon cel smoke: puffs with a light top band and a dark underside
 * (cel shading), swelling as they rise and breaking into holes; thin wisps for steam.
 * Layer presets: Poof, Steam Vent, Toxic Cloud, Dust Impact, Billowing Smoke.
 * Particle presets: Chimney Drift, Smoke Trail, Fog Bank.
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { setKey } from '../../core/keyframes.js';
import { rampPreset } from '../../render/rampPresets.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp, SOFT_LIFE } from '../presetKit.js';

/** Cartoon smoke: white top → cool greys. */
const SMOKE_CEL = ramp([
  [0, '#ffffff'],
  [0.3, '#e4e6ee'],
  [0.6, '#b3b7c7'],
  [0.85, '#7a7f93'],
  [1, '#4a4e60'],
]);
/** Cel shading for smoke: a light top, a dark underside. */
const CEL_SMOKE = {
  'shade.light': 315,
  'shade.highlight': 0.35,
  'shade.highlightSize': 0.4,
  'shade.shadow': 0.45,
  'shade.shadowOffset': 0.2,
  'style.bands': 3,
};
/** Grow as it rises. */
const SWELL = curve([
  [0, 0.3],
  [0.4, 1],
  [1, 1.5],
]);

/** Poof: a cartoon "disappear" cloud bursting out, swirls, then breaking into holes. One-shot. */
function poof() {
  const c = compose({ timing: oneShot(24) });
  c.add('puffBurst', 'Poof cloud', {
    params: {
      ...CEL_SMOKE,
      'burst.count': 9,
      'burst.speed': 160,
      'burst.drag': 6,
      'burst.spawnRadius': 20,
      'burst.life': 0.95,
      'burst.scaleOverLife': curve([
        [0, 0.3],
        [0.15, 1.15],
        [1, 1.3],
      ]),
      'burst.opacityOverLife': curve([
        [0, 1],
        [1, 1],
      ]),
      'puff.radius': 34,
      'style.ramp': SMOKE_CEL,
      'dissolve.mode': 'holes',
      'dissolve.amount': curve([
        [0, 0],
        [0.45, 0],
        [0.95, 1],
        [1, 1],
      ]),
      'dissolve.size': 30,
    },
  });
  c.add('crescentBurst', 'Swirls', {
    params: {
      'burst.count': 6,
      'burst.speed': 260,
      'burst.life': 0.45,
      'crescent.radius': 30,
      'crescent.thickness': 6,
      'style.ramp': SMOKE_CEL,
      'outline.mode': 'off',
    },
  });
  c.add('sparkleBurst', 'Stars', {
    params: {
      'burst.count': 5,
      'burst.speed': 300,
      'burst.spawnRadius': 40,
      'burst.life': 0.5,
      'sparkle.size': 14,
      'style.ramp': rampPreset('holyWhite'),
    },
  });
  return c.done();
}

/** Steam Vent: wisps and soft puffs rising from a crack. Loops. */
function steamVent() {
  const c = compose({ timing: loop(48) });
  c.add('puffEmitter', 'Steam', {
    transform: { y: 190 },
    params: {
      ...CEL_SMOKE,
      'shade.shadow': 0.2,
      'emit.shape': 'line',
      'emit.width': 90,
      'emit.rate': 9,
      'emit.cone': 16,
      'emit.speed': 120,
      'emit.gravity': -60,
      'emit.drag': 0.5,
      'emit.turbulence': 30,
      'emit.life': 2.2,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SWELL,
      'puff.radius': 44,
      'style.ramp': rampPreset('steam'),
    },
  });
  c.add('wispEmitter', 'Wisps', {
    transform: { y: 190 },
    params: {
      'emit.shape': 'line',
      'emit.width': 50,
      'emit.rate': 3,
      'emit.speed': 60,
      'emit.gravity': -50,
      'emit.life': 1.8,
      'emit.opacityOverLife': SOFT_LIFE,
      'wisp.length': 160,
      'wisp.width': 14,
      'style.ramp': rampPreset('steam'),
    },
  });
  return c.done();
}

/** Toxic Cloud: green fumes churning low, bubbles popping. Loops. */
function toxicCloud() {
  const c = compose({ timing: loop(48) });
  c.add('puffEmitter', 'Fumes', {
    transform: { y: 60 },
    params: {
      ...CEL_SMOKE,
      'emit.shape': 'circle',
      'emit.width': 260,
      'emit.rate': 7,
      'emit.cone': 360,
      'emit.speed': 30,
      'emit.gravity': -20,
      'emit.turbulence': 40,
      'emit.life': 2.6,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SWELL,
      'puff.radius': 34,
      'style.ramp': rampPreset('smokeToxic'),
      'goo.amount': 6,
      'goo.keepShapes': true,
    },
  });
  c.add('bubbleEmitter', 'Bubbles', {
    transform: { y: 80 },
    params: {
      'emit.shape': 'circle',
      'emit.width': 220,
      'emit.rate': 8,
      'emit.speed': 20,
      'emit.gravity': -40,
      'emit.life': 0.9,
      'emit.scaleOverLife': curve([
        [0, 0.2],
        [0.85, 1],
        [1, 1.3],
      ]),
      'emit.opacityOverLife': curve([
        [0, 1],
        [0.85, 1],
        [1, 0],
      ]),
      'bubble.fill': 0.6,
      'style.ramp': rampPreset('poison'),
    },
  });
  return c.done();
}

/** Dust Impact: something hits the ground — dust rolls out low, pebbles fly. One-shot. */
function dustImpact() {
  const c = compose({
    timing: oneShot(30),
    globals: { 'explosion.impact': 0.05, 'explosion.flashFrames': 0 },
  });
  const ground = c.add('null', 'Ground', { transform: { y: 170 } });
  const ids = [
    c.add('puffBurst', 'Dust', {
      anchor: 'afterImpact',
      transform: { scaleY: 55 },
      params: {
        ...CEL_SMOKE,
        'burst.count': 14,
        'burst.direction': 0,
        'burst.cone': 180,
        'burst.speed': 420,
        'burst.drag': 5,
        'burst.buoyancy': 60,
        'burst.life': 0.95,
        'burst.scaleOverLife': SWELL,
        'puff.radius': 30,
        'style.ramp': rampPreset('dust'),
        'dissolve.mode': 'holes',
        'dissolve.amount': curve([
          [0, 0],
          [0.5, 0],
          [1, 1],
        ]),
      },
    }),
    c.add('debrisBurst', 'Pebbles', {
      anchor: 'afterImpact',
      params: {
        'burst.count': 12,
        'burst.direction': 0,
        'burst.cone': 120,
        'burst.speed': 520,
        'burst.gravity': 1600,
        'burst.life': 0.7,
        'style.ramp': rampPreset('rock'),
      },
    }),
    c.add('ring', 'Shock', {
      anchor: 'afterImpact',
      transform: { scaleY: 30 },
      params: {
        'ring.radius': 160,
        'ring.thickness': 0.1,
        'single.end': 0.35,
        'style.ramp': rampPreset('dust'),
      },
    }),
  ];
  for (const id of ids) c.parent(id, ground, { local: true });
  return c.done();
}

/** Billowing Smoke: a thick cel smoke column — puffs merge (goo) and swell as they rise. Loops. */
function billowingSmoke() {
  const c = compose({ timing: loop(48) });
  c.add('puffEmitter', 'Billows', {
    transform: { y: 200 },
    params: {
      ...CEL_SMOKE,
      'emit.shape': 'line',
      'emit.width': 60,
      'emit.rate': 8,
      'emit.cone': 14,
      'emit.speed': 70,
      'emit.gravity': -70,
      'emit.drag': 0.3,
      'emit.turbulence': 40,
      'emit.turbSpeed': 0.5,
      'emit.life': 3,
      'emit.randomRotation': 360,
      'emit.spin': 20,
      'emit.opacityOverLife': curve([
        [0, 0],
        [0.1, 1],
        [0.7, 1],
        [1, 0],
      ]),
      'emit.scaleOverLife': curve([
        [0, 0.35],
        [0.5, 1.15],
        [1, 1.7],
      ]),
      'puff.radius': 30,
      'style.ramp': SMOKE_CEL,
      'goo.amount': 5,
      'goo.keepShapes': true,
    },
  });
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Chimney Drift: dark smoke rising and drifting off with the wind. Loops. */
function chimneyDrift() {
  const c = compose({ timing: loop(48) });
  c.add('puffEmitter', 'Smoke', {
    transform: { x: -160, y: 180 },
    params: {
      ...CEL_SMOKE,
      'emit.rate': 8,
      'emit.direction': 20,
      'emit.cone': 12,
      'emit.speed': 110,
      'emit.gravity': -30,
      'emit.turbulence': 30,
      'emit.life': 3.2,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SWELL,
      'puff.radius': 56,
      'style.ramp': SMOKE_CEL,
      'goo.amount': 4,
      'goo.keepShapes': true,
    },
  });
  return c.done();
}

/** Smoke Trail: a null flies along a drawn curve leaving a puffy smoke trail. One-shot. */
function smokeTrail() {
  const c = compose({ timing: oneShot(48) });
  const path = c.add('guide', 'Trail path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 460,
    h: 260,
    closed: false,
    path: [
      { x: -0.5, y: 0.4, ix: 0, iy: 0, ox: 0.3, oy: -0.3 },
      { x: 0.1, y: -0.1, ix: -0.2, iy: 0.3, ox: 0.2, oy: -0.3 },
      { x: 0.5, y: -0.45, ix: -0.2, iy: 0.1, ox: 0, oy: 0 },
    ],
  });
  const head = c.add('null', 'Smoke head');
  c.set(head, {
    follow: { ...makeFollow(path, m), orient: false },
    keys: { 'follow.progress': setKey(setKey([], 0, 0, 'ease'), 1.3, 100, 'ease') },
  });
  const trail = c.add('puffEmitter', 'Trail smoke', {
    params: {
      ...CEL_SMOKE,
      'emit.rate': 30,
      'emit.stop': 1.3,
      'emit.cone': 360,
      'emit.speed': 20,
      'emit.gravity': -20,
      'emit.turbulence': 20,
      'emit.life': 1.4,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': SWELL,
      'puff.radius': 14,
      'style.ramp': SMOKE_CEL,
    },
  });
  c.parent(trail, head, { local: true });
  return c.done();
}

/** Fog Bank: big soft cloud puffs drifting slowly across (backgrounds). Loops. */
function fogBank() {
  const c = compose({ timing: loop(48) });
  c.add('puffEmitter', 'Fog', {
    transform: { x: -320, y: 120 },
    params: {
      ...CEL_SMOKE,
      'shade.shadow': 0.2,
      'emit.shape': 'box',
      'emit.width': 60,
      'emit.height': 160,
      'emit.prewarm': true,
      'emit.rate': 4,
      'emit.direction': 90,
      'emit.cone': 6,
      'emit.speed': 160,
      'emit.drag': 0,
      'emit.gravity': 0,
      'emit.turbulence': 20,
      'emit.turbSpeed': 0.3,
      'emit.life': 4,
      'emit.lifeVariance': 0,
      'emit.opacityOverLife': curve([
        [0, 0],
        [0.2, 0.7],
        [0.8, 0.7],
        [1, 0],
      ]),
      'emit.scaleOverLife': curve([
        [0, 0.9],
        [1, 1.2],
      ]),
      'puff.radius': 48,
      'style.ramp': rampPreset('steam'),
    },
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const SMOKE_PRESETS = Object.freeze([
  {
    id: 'poof',
    name: 'Poof',
    blurb: 'A cartoon "disappear" cloud: bursts out, swirls, breaks into holes. One-shot.',
    build: poof,
  },
  {
    id: 'steamVent',
    name: 'Steam Vent',
    blurb: 'Wisps and soft puffs rising from a crack. Seamless loop.',
    build: steamVent,
  },
  {
    id: 'toxicCloud',
    name: 'Toxic Cloud',
    blurb: 'Green fumes churning low, bubbles popping. Seamless loop.',
    build: toxicCloud,
  },
  {
    id: 'dustImpact',
    name: 'Dust Impact',
    blurb: 'Dust rolls out low along the ground, pebbles fly. One-shot.',
    build: dustImpact,
  },
  {
    id: 'billowingSmoke',
    name: 'Billowing Smoke',
    blurb: 'A thick cel smoke column; puffs merge and swell as they rise. Seamless loop.',
    build: billowingSmoke,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const SMOKE_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'chimneyDrift',
    name: 'Chimney Drift',
    blurb: 'Dark smoke rising and drifting off with the wind. Seamless loop.',
    build: chimneyDrift,
  },
  {
    id: 'smokeTrail',
    name: 'Smoke Trail',
    blurb: 'A smoke head flies along a drawn curve leaving a puffy trail. One-shot.',
    build: smokeTrail,
  },
  {
    id: 'fogBank',
    name: 'Fog Bank',
    blurb: 'Big soft cloud puffs drifting slowly across (backgrounds). Seamless loop.',
    build: fogBank,
  },
]);
