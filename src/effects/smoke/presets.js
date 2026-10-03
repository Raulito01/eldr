// @ts-check
/**
 * Smoke presets, reworked on the CEL SMOKE principle (D-092, after Raul's references: a pink
 * cartoon poof, a grey cel smoke column, a green toxic cloud, pixel-art puffs): flat cel lumps
 * merged into one silhouette, a dark crescent on each lump's shadow side, and dissipation by
 * growing holes, breaking apart and droplets — never by fading out.
 *
 * Layer presets: Poof, Smoke Column, Toxic Cloud, Steam Vent, Chimney Smoke, Mushroom Puff,
 * Blown Puff, Dust Impact. Particle presets: Smoke Trail, Fog Bank, Rising Puffs.
 */

import { setKey } from '../../core/keyframes.js';
import { makeFollow } from '../followPath.js';
import { compose, curve, loop, oneShot, ramp } from '../presetKit.js';

/** Soft white-pink (the cartoon poof). */
const POOF = ramp([
  [0, '#fff3f1'],
  [0.4, '#f8dcd8'],
  [0.7, '#d9b2b5'],
  [1, '#8f6d7e'],
]);
/** Lavender grey (the cel smoke column). */
const LAVENDER = ramp([
  [0, '#d9dbee'],
  [0.35, '#b4b6d2'],
  [0.65, '#8486aa'],
  [1, '#4b4b68'],
]);
/** Toxic teal-green (the gas cloud). */
const TOXIC = ramp([
  [0, '#8ff5cf'],
  [0.35, '#4ad9a8'],
  [0.65, '#2f9f90'],
  [1, '#17545a'],
]);
/** Steam: almost white, cool shade. */
const STEAM = ramp([
  [0, '#ffffff'],
  [0.4, '#eef4fb'],
  [0.7, '#bccbdc'],
  [1, '#7a8ca3'],
]);
/** Chimney: dark warm grey. */
const SOOT = ramp([
  [0, '#a59ca4'],
  [0.35, '#7a717d'],
  [0.65, '#4f4856'],
  [1, '#2a2530'],
]);
/** Dust: sandy. */
const DUST = ramp([
  [0, '#f3e2c4'],
  [0.35, '#dcc29a'],
  [0.65, '#ad8e66'],
  [1, '#6b553d'],
]);

/** Darker dust for the ground streaks, so they read in front of the cloud. */
const DUST_DARK = ramp([
  [0, '#fff4dc'],
  [0.5, '#8c6f4c'],
  [1, '#4f3d2b'],
]);

const NONE = curve([
  [0, 0],
  [1, 0],
]);
const FLAT = curve([
  [0, 1],
  [1, 1],
]);

/**
 * One cel smoke layer. @param {ReturnType<typeof compose>} c @param {string} label
 * @param {{ x?: number, y?: number, blend?: any, transform?: Record<string, number> } & Record<string, any>} o
 */
function smoke(c, label, o) {
  const { x = 0, y = 0, blend, transform, ...rest } = o;
  // a looping column must not pop: the layer's whole-life scale stays flat
  const params = rest['cs.form'] === 'column' ? { 'single.scaleOverLife': FLAT, ...rest } : rest;
  return c.add('celSmoke', label, {
    ...(blend ? { blend } : {}),
    transform: { x, y, ...transform },
    params,
  });
}

// ── Layer presets ───────────────────────────────────────────────────────────────────────────

/** Poof: a spiky flash, a cloud pops out, holes open, it breaks into blobs and droplets. One-shot. */
function poof() {
  const c = compose({ timing: oneShot(28) });
  c.add('sparkle', 'Spark', {
    params: {
      'sparkle.size': 70,
      'sparkle.points': 9,
      'sparkle.thinness': 0.9,
      'style.ramp': POOF,
      'single.end': 0.12,
      'single.scaleOverLife': curve([
        [0, 0.3],
        [0.5, 1],
        [1, 1.15],
      ]),
      'single.opacityOverLife': FLAT,
    },
  });
  const cloud = {
    'style.ramp': POOF,
    'cs.form': 'puff',
    'cs.shade': 0.22,
    'cs.drift': 0.35,
    'cs.droplets': 9,
    'single.start': 0.1,
    'cs.holes': curve([
      [0, 0],
      [0.3, 0],
      [1, 1.3],
    ]),
    'cs.shrink': curve([
      [0, 0],
      [0.45, 0],
      [1, 0.95],
    ]),
  };
  smoke(c, 'Cloud', { ...cloud, x: 30, y: -20, 'cs.size': 72, 'cs.lumps': 8, 'cs.spread': 0.85 });
  smoke(c, 'Cloud tail', {
    ...cloud,
    x: -70,
    y: 30,
    'cs.size': 46,
    'cs.lumps': 6,
    'cs.droplets': 4,
  });
  return c.done();
}

/** Smoke Column: lumps rise up a curving spine, growing — the cel smoke column. Loops. */
function smokeColumn() {
  const c = compose({ timing: loop(48) });
  smoke(c, 'Smoke column', {
    y: 240,
    'style.ramp': LAVENDER,
    'cs.form': 'column',
    'cs.size': 70,
    'cs.lumps': 12,
    'cs.spread': 0.45,
    'cs.length': 400,
    'cs.rise': 0.75,
    'cs.sway': 0.2,
    'cs.shade': 0.42,
    'cs.light': 330,
    'cs.droplets': 0,
    'cs.holes': NONE,
    'cs.shrink': NONE,
  });
  return c.done();
}

/** Toxic Cloud: a long green cloud with light blobs and an outline; holes open and it falls apart. One-shot. */
function toxicCloud() {
  const c = compose({ timing: oneShot(36) });
  smoke(c, 'Toxic cloud', {
    y: 40,
    'style.ramp': TOXIC,
    'cs.form': 'bank',
    x: -20,
    'cs.size': 62,
    'cs.lumps': 10,
    'cs.length': 300,
    'cs.drift': 0.3,
    'cs.shade': 0.3,
    'cs.light': 300,
    'cs.highlight': 0.8,
    'cs.bodyTone': 0.42,
    'cs.shadeTone': 0.68,
    'cs.highlightTone': 0.12,
    'cs.droplets': 12,
    'outline.mode': 'outer',
    'outline.px': 3,
    'outline.darken': 0.55,
    'single.scaleOverLife': curve([
      [0, 0.25],
      [0.15, 1],
      [1, 1.12],
    ]),
    'cs.holes': curve([
      [0, 0],
      [0.35, 0],
      [1, 1.25],
    ]),
    'cs.shrink': curve([
      [0, 0],
      [0.5, 0],
      [1, 0.9],
    ]),
  });
  return c.done();
}

/** Steam Vent: two thin, fast white columns that break apart near the top. Loops. */
function steamVent() {
  const c = compose({ timing: loop(48) });
  const steam = {
    'style.ramp': STEAM,
    'cs.form': 'column',
    'cs.shade': 0.3,
    'cs.light': 320,
    'cs.droplets': 0,
    'cs.holes': curve([
      [0, 0],
      [0.55, 0],
      [1, 1.15],
    ]),
    'cs.shrink': curve([
      [0, 0],
      [0.6, 0],
      [1, 0.85],
    ]),
  };
  smoke(c, 'Steam', {
    ...steam,
    x: -18,
    y: 230,
    'cs.size': 40,
    'cs.lumps': 14,
    'cs.length': 380,
    'cs.rise': 1.5,
    'cs.sway': 0.12,
    'cs.spread': 0.5,
  });
  smoke(c, 'Steam 2', {
    ...steam,
    x: 22,
    y: 235,
    'cs.size': 30,
    'cs.lumps': 11,
    'cs.length': 300,
    'cs.rise': 1.25,
    'cs.sway': 0.16,
    'cs.spread': 0.4,
  });
  return c.done();
}

/** Chimney Smoke: dark smoke leaning in the wind, breaking up as it drifts away. Loops. */
function chimneyDrift() {
  const c = compose({ timing: loop(48) });
  smoke(c, 'Chimney smoke', {
    x: -150,
    y: 230,
    'style.ramp': SOOT,
    'cs.form': 'column',
    'cs.size': 62,
    'cs.lumps': 14,
    'cs.length': 460,
    'cs.rise': 0.6,
    'cs.sway': 0.1,
    'cs.lean': 0.75,
    'cs.spread': 0.5,
    'cs.shade': 0.4,
    'cs.light': 320,
    'cs.droplets': 0,
    'cs.holes': curve([
      [0, 0],
      [0.5, 0],
      [1, 1.2],
    ]),
    'cs.shrink': curve([
      [0, 0],
      [0.65, 0],
      [1, 0.8],
    ]),
  });
  return c.done();
}

/** Mushroom Puff: a stem shoots up, a cap blooms, then it all breaks apart. One-shot. */
function mushroomPuff() {
  const c = compose({ timing: oneShot(40) });
  smoke(c, 'Mushroom', {
    y: 170,
    'style.ramp': LAVENDER,
    'cs.form': 'mushroom',
    'cs.size': 62,
    'cs.lumps': 10,
    'cs.length': 290,
    'cs.rise': 1.4,
    'cs.sway': 0.06,
    'cs.shade': 0.35,
    'cs.droplets': 10,
    'single.scaleOverLife': FLAT,
    'cs.holes': curve([
      [0, 0],
      [0.5, 0],
      [1, 1.25],
    ]),
    'cs.shrink': curve([
      [0, 0],
      [0.6, 0],
      [1, 0.95],
    ]),
  });
  smoke(c, 'Ground puff', {
    y: 175,
    'style.ramp': LAVENDER,
    'cs.form': 'bank',
    'cs.size': 40,
    'cs.lumps': 6,
    'cs.length': 220,
    'cs.drift': 0.6,
    'cs.shade': 0.35,
    'cs.droplets': 4,
    transform: { scaleY: 55 },
    'single.end': 0.7,
  });
  return c.done();
}

/** Blown Puff: a puff blown out with a curling tail behind it, then it breaks up. One-shot. */
function blownPuff() {
  const c = compose({ timing: oneShot(32) });
  const head = c.add('null', 'Puff motion');
  c.set(head, {
    keys: {
      'transform.x': setKey(setKey([], 0, -80, 'easeOut'), 1.2, 60, 'easeOut'),
      'transform.y': setKey(setKey([], 0, 40, 'easeOut'), 1.2, -50, 'easeOut'),
    },
  });
  const puff = smoke(c, 'Puff', {
    'style.ramp': STEAM,
    'cs.form': 'puff',
    'cs.size': 78,
    'cs.lumps': 7,
    'cs.spread': 0.6,
    'cs.shade': 0.4,
    'cs.light': 330,
    'cs.droplets': 6,
  });
  c.parent(puff, head, { local: true });
  const tail = c.add('wisp', 'Tail', {
    transform: { x: -70, y: 50, rotation: -125 },
    params: {
      'wisp.length': 120,
      'wisp.width': 26,
      'wisp.sway': 0.3,
      'wisp.waves': 1.2,
      'style.ramp': STEAM,
      'style.bands': 3,
      'single.end': 0.55,
      'single.scaleOverLife': curve([
        [0, 1],
        [1, 0.2],
      ]),
      'single.opacityOverLife': FLAT,
    },
  });
  c.parent(tail, head, { local: true });
  return c.done();
}

/** Dust Impact: dust streaks slide along the ground both ways, low cel puffs roll out and break up. One-shot. */
function dustImpact() {
  const c = compose({ timing: oneShot(30) });
  const ground = 150;
  for (const side of [-1, 1]) {
    smoke(c, side < 0 ? 'Dust left' : 'Dust right', {
      x: side * 60,
      y: ground,
      transform: { scaleX: side * 100, scaleY: 70 },
      'style.ramp': DUST,
      'cs.form': 'bank',
      'cs.size': 48,
      'cs.lumps': 7,
      'cs.length': 220,
      'cs.drift': 0.8,
      'cs.shade': 0.35,
      'cs.droplets': 5,
      'single.scaleOverLife': curve([
        [0, 0.2],
        [0.2, 1],
        [1, 1.2],
      ]),
      'cs.holes': curve([
        [0, 0],
        [0.3, 0],
        [1, 1.2],
      ]),
      'cs.shrink': curve([
        [0, 0],
        [0.45, 0],
        [1, 0.95],
      ]),
    });
  }
  // the streaks slide out in front of the dust
  for (const side of [-1, 1]) {
    c.add('streakBurst', side < 0 ? 'Streaks left' : 'Streaks right', {
      transform: { y: ground + 6 },
      params: {
        'burst.count': 9,
        'burst.direction': side < 0 ? 278 : 82,
        'burst.cone': 10,
        'burst.speed': 1100,
        'burst.speedVariance': 0.45,
        'burst.drag': 3,
        'burst.life': 0.45,
        'burst.alignToVelocity': true,
        'burst.spawnRadius': 20,
        'streak.length': 90,
        'streak.thickness': 9,
        'style.ramp': DUST_DARK,
        'style.bands': 3,
      },
    });
  }
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Cel smoke puff particles. */
const puffs = (
  /** @type {ReturnType<typeof compose>} */ c,
  /** @type {string} */ label,
  /** @type {Record<string, any>} */ params,
  /** @type {Record<string, number>} */ transform = {},
) => c.add('celSmokeEmitter', label, { transform, params });

/** Smoke Trail: a smoke head flies along a drawn curve, leaving cel puffs that break apart. One-shot. */
function smokeTrail() {
  const c = compose({ timing: oneShot(48) });
  const path = c.add('guide', 'Trail path');
  const m = c.mask(path, {
    x: 0,
    y: 0,
    w: 380,
    h: 240,
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
  const trail = puffs(c, 'Trail puffs', {
    'style.ramp': LAVENDER,
    'emit.rate': 28,
    'emit.stop': 1.3,
    'emit.cone': 40,
    'emit.speed': 30,
    'emit.gravity': -30,
    'emit.life': 1.1,
    'emit.lifeVariance': 0.3,
    'emit.size': 1.1,
    'emit.sizeVariance': 0.35,
    'cs.size': 28,
    'cs.lumps': 4,
    'cs.droplets': 2,
    'cs.shade': 0.4,
  });
  c.parent(trail, head, { local: true });
  return c.done();
}

/** Fog Bank: big pale cel clouds drifting slowly across (backgrounds). Loops. */
function fogBank() {
  const c = compose({ timing: loop(96) });
  puffs(
    c,
    'Fog',
    {
      'style.ramp': STEAM,
      'emit.shape': 'box',
      'emit.width': 700,
      'emit.height': 200,
      'emit.rate': 4,
      'emit.direction': 90,
      'emit.cone': 6,
      'emit.speed': 40,
      'emit.gravity': 0,
      'emit.life': 4,
      'emit.prewarm': true,
      'emit.size': 1.4,
      'emit.sizeVariance': 0.35,
      'emit.scaleOverLife': curve([
        [0, 0.4],
        [0.25, 1],
        [1, 1.15],
      ]),
      'cs.size': 34,
      'cs.lumps': 6,
      'cs.spread': 0.9,
      'cs.shade': 0.25,
      'cs.droplets': 3,
      'cs.boil': 0.25,
      'cs.holes': curve([
        [0, 0],
        [0.6, 0],
        [1, 1.2],
      ]),
      'cs.shrink': curve([
        [0, 0],
        [0.7, 0],
        [1, 0.9],
      ]),
    },
    { x: -40, y: 60 },
  );
  return c.done();
}

/** Rising Puffs: separate cel puffs rising, swelling and breaking apart. Loops. */
function risingPuffs() {
  const c = compose({ timing: loop(48) });
  puffs(
    c,
    'Puffs',
    {
      'style.ramp': LAVENDER,
      'emit.shape': 'line',
      'emit.width': 50,
      'emit.rate': 2.5,
      'emit.cone': 14,
      'emit.speed': 170,
      'emit.gravity': -30,
      'emit.drag': 0.3,
      'emit.turbulence': 30,
      'emit.life': 2.2,
      'emit.prewarm': true,
      'emit.size': 1.2,
      'emit.sizeVariance': 0.3,
      'cs.size': 30,
      'cs.lumps': 5,
      'cs.shade': 0.4,
    },
    { y: 220 },
  );
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const SMOKE_PRESETS = Object.freeze([
  {
    id: 'poof',
    name: 'Poof',
    blurb:
      'A spiky flash, a cloud pops out, holes open and it breaks into blobs and droplets. One-shot.',
    build: poof,
  },
  {
    id: 'smokeColumnCel',
    name: 'Smoke Column',
    blurb: 'Cel lumps rising up a curving spine, growing as they go. Seamless loop.',
    build: smokeColumn,
  },
  {
    id: 'toxicCloud',
    name: 'Toxic Cloud',
    blurb:
      'A long green cloud with light blobs and an outline that falls apart through holes. One-shot.',
    build: toxicCloud,
  },
  {
    id: 'steamVent',
    name: 'Steam Vent',
    blurb: 'Two thin, fast white columns breaking apart near the top. Seamless loop.',
    build: steamVent,
  },
  {
    id: 'chimneyDrift',
    name: 'Chimney Smoke',
    blurb: 'Dark smoke leaning in the wind, breaking up as it drifts. Seamless loop.',
    build: chimneyDrift,
  },
  {
    id: 'mushroomPuff',
    name: 'Mushroom Puff',
    blurb: 'A stem shoots up, a cap blooms, then it all breaks apart. One-shot.',
    build: mushroomPuff,
  },
  {
    id: 'blownPuff',
    name: 'Blown Puff',
    blurb: 'A puff blown out with a curling tail, breaking up as it slows. One-shot.',
    build: blownPuff,
  },
  {
    id: 'dustImpact',
    name: 'Dust Impact',
    blurb: 'Dust streaks slide along the ground, low cel puffs roll out and break up. One-shot.',
    build: dustImpact,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const SMOKE_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'smokeTrail',
    name: 'Smoke Trail',
    blurb: 'A smoke head flies along a drawn curve, leaving cel puffs that break apart. One-shot.',
    build: smokeTrail,
  },
  {
    id: 'fogBank',
    name: 'Fog Bank',
    blurb: 'Big pale cel clouds drifting slowly across (backgrounds). Seamless loop.',
    build: fogBank,
  },
  {
    id: 'risingPuffs',
    name: 'Rising Puffs',
    blurb: 'Separate cel puffs rising, swelling and breaking apart. Seamless loop.',
    build: risingPuffs,
  },
]);
