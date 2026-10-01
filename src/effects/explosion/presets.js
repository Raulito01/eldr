// @ts-check
/**
 * Explosion presets (brief §4.1, step 3.4). A preset is a small set of CHANGES on top of the
 * base explosion (`createExplosion()`): globals, timing, and per-layer params / blend / on-off.
 * Keeping presets as deltas makes each one readable and easy to retune with Raul.
 *
 * Names and every value here are a FIRST PASS for Raul to direct [Raul].
 */

import { rampPreset } from '../../render/rampPresets.js';
import { createExplosion } from './explosion.js';

const ramp = (/** @type {[number, string][]} */ stops) =>
  stops.map(([pos, color]) => ({ pos, color }));
const curve = (/** @type {[number, number][]} */ pts) => pts.map(([x, y]) => ({ x, y }));

/** Anime-style hot ramp with violet shadows (option B from step 2.1). */
const ANIME_FIRE = ramp([
  [0, '#ffffff'],
  [0.1, '#fffbe0'],
  [0.22, '#ffe14d'],
  [0.4, '#ff9d2e'],
  [0.6, '#f2412c'],
  [0.8, '#8e1c3a'],
  [1, '#2e2340'],
]);

/** Cool violet-grey smoke to go with the anime fire. */
const ANIME_SMOKE = ramp([
  [0, '#f4eef6'],
  [0.35, '#bfb3cc'],
  [0.7, '#7a6a8e'],
  [1, '#2e2340'],
]);

/** Stays hot for the first half of its life, then cools: keeps the fireball bright longer. */
const SLOW_COOL = curve([
  [0, 0],
  [0.5, 0.3],
  [1, 0.9],
]);

/**
 * @typedef {object} LayerDelta
 * @property {boolean} [enabled]
 * @property {'normal'|'add'|'screen'} [blend]
 * @property {Record<string, any>} [params]
 */

/**
 * @typedef {object} ExplosionPreset
 * @property {string} id
 * @property {string} name
 * @property {string} blurb  one line: what it feels like
 * @property {Record<string, any>} [globals]
 * @property {Partial<import('../../core/timing.js').Timing>} [timing]
 * @property {Record<string, LayerDelta>} [layers]  keyed by layer id
 */

/** @type {ReadonlyArray<ExplosionPreset>} */
export const EXPLOSION_PRESETS = Object.freeze([
  {
    id: 'cartoonPop',
    name: 'Cartoon Pop',
    blurb: 'Round, chunky, bouncy. Bold ink outlines, flat snapped colours, quick pop.',
    globals: { 'explosion.impact': 0.12, 'explosion.flashFrames': 2 },
    timing: { frameCount: 20 },
    layers: {
      fireball: {
        params: {
          'puff.radius': 110,
          'puff.count': 5,
          'puff.noise': 0.04,
          'burst.count': 6,
          'burst.speed': 220,
          'style.rampOverLife': SLOW_COOL,
          'style.bands': 3,
          'style.bandNoise': 0.1,
          'style.snapColors': true,
          'outline.mode': 'outer',
          'outline.px': 4,
          'outline.colorMode': 'custom',
          'outline.color': '#2a1a22',
          // Overshoot then settle: the "pop".
          'burst.scaleOverLife': curve([
            [0, 0.3],
            [0.12, 1.3],
            [0.3, 1],
            [1, 0.4],
          ]),
        },
      },
      smoke: {
        params: {
          'puff.noise': 0.04,
          'style.bands': 3,
          'style.snapColors': true,
          'outline.mode': 'outer',
          'outline.px': 4,
          'outline.colorMode': 'custom',
          'outline.color': '#2a1a22',
          'burst.count': 7,
          'burst.life': 0.7,
        },
      },
      shockwave: { params: { 'ring.radius': 160, 'ring.thickness': 0.28, 'ring.distortion': 0 } },
      debris: {
        params: { 'burst.count': 6, 'debris.size': 9, 'outline.px': 3, 'burst.speed': 560 },
      },
      sparks: {
        params: {
          'burst.count': 8,
          'burst.speed': 700,
          'streak.thickness': 9,
          'streak.length': 34,
          'outline.mode': 'outer',
          'outline.px': 3,
          'outline.colorMode': 'custom',
          'outline.color': '#2a1a22',
        },
      },
    },
  },
  {
    id: 'animeBlast',
    name: 'Anime Blast',
    blurb: 'Sharp and dramatic. Hot whites, violet shadows, broken shockwave, fast needle sparks.',
    globals: { 'explosion.impact': 0.18, 'explosion.flashFrames': 3, 'explosion.size': 1.1 },
    timing: { frameCount: 30 },
    layers: {
      fireball: {
        params: {
          'style.ramp': ANIME_FIRE,
          'style.bands': 4,
          'style.bandNoise': 0.35,
          'style.snapColors': true,
          'puff.noise': 0.12,
          'puff.radius': 95,
          'burst.count': 10,
          'burst.speed': 280,
          'style.rampOverLife': SLOW_COOL,
          'shade.shadow': 0.6,
          'shade.highlight': 0.5,
        },
      },
      smoke: {
        params: {
          'style.ramp': ANIME_SMOKE,
          'style.bands': 3,
          'style.snapColors': true,
          'burst.life': 0.9,
          'burst.buoyancy': 200,
          'shade.shadow': 0.5,
        },
      },
      shockwave: {
        params: {
          'ring.radius': 190,
          'ring.thickness': 0.12,
          'ring.breaks': 5,
          'ring.gap': 0.35,
          'single.end': 0.3,
        },
      },
      sparks: {
        params: {
          'style.ramp': ANIME_FIRE,
          'burst.count': 28,
          'burst.speed': 820,
          'streak.length': 70,
          'streak.thickness': 3,
          'burst.life': 0.35,
        },
      },
      debris: { params: { 'style.ramp': ANIME_SMOKE, 'burst.speed': 480 } },
      flash: {
        params: {
          'blob.radius': 170,
          'blob.lobes': 8,
          'blob.lobeDepth': 0.35,
        },
      },
    },
  },
  {
    id: 'smallHit',
    name: 'Small Hit',
    blurb: 'A short impact for hits and bullets. No wind-up, no smoke, over in half a second.',
    globals: {
      'explosion.size': 0.55,
      'explosion.impact': 0,
      'explosion.flashFrames': 1,
      'explosion.anticipation': false,
    },
    timing: { frameCount: 12 },
    layers: {
      smoke: { enabled: false },
      debris: { enabled: false },
      fireball: {
        params: {
          'burst.count': 5,
          'burst.life': 0.7,
          'burst.speed': 200,
          'puff.radius': 85,
          'style.rampOverLife': SLOW_COOL,
        },
      },
      shockwave: { params: { 'single.end': 0.55 } },
      sparks: { params: { 'burst.count': 10, 'burst.life': 0.6 } },
    },
  },
  {
    id: 'bigBoom',
    name: 'Big Boom',
    blurb: 'Heavy and slow. Long charge, huge fireball, lots of debris, a rising smoke column.',
    globals: {
      'explosion.size': 1.25,
      'explosion.impact': 0.2,
      'explosion.flashFrames': 3,
    },
    timing: { frameCount: 40 },
    layers: {
      fireball: {
        params: {
          'burst.count': 13,
          'burst.speed': 200,
          'burst.buoyancy': 220,
          'burst.life': 0.55,
          'puff.radius': 95,
          'style.rampOverLife': SLOW_COOL,
        },
      },
      smoke: {
        params: {
          'burst.count': 16,
          'burst.buoyancy': 380,
          'burst.life': 0.78,
          'burst.spawnRadius': 30,
          'puff.radius': 60,
          'style.ramp': rampPreset('smoke'),
        },
      },
      shockwave: { params: { 'ring.radius': 150, 'single.end': 0.3 } },
      debris: {
        params: { 'burst.count': 22, 'burst.speed': 460, 'burst.life': 0.7 },
      },
      sparks: { params: { 'burst.count': 26, 'burst.life': 0.4 } },
    },
  },
]);

/** Preset by id. @param {string} id */
export const explosionPreset = (id) => EXPLOSION_PRESETS.find((p) => p.id === id);

/**
 * A fresh explosion with a preset applied on top of the base stack. Unknown id → the base.
 * Pure: the preset table is never mutated (values are deep-copied).
 * @param {string} id
 * @returns {import('./explosion.js').ExplosionState}
 */
export function createExplosionFromPreset(id) {
  const state = createExplosion();
  const p = explosionPreset(id);
  if (!p) return state;
  const copy = structuredClone(p);
  return {
    ...state,
    globals: { ...state.globals, ...copy.globals },
    timing: { ...state.timing, ...copy.timing },
    layers: state.layers.map((l) => {
      const d = copy.layers?.[l.id];
      if (!d) return l;
      return {
        ...l,
        enabled: d.enabled ?? l.enabled,
        blend: d.blend ?? l.blend,
        params: { ...l.params, ...d.params },
      };
    }),
  };
}
