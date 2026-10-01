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

/** Dissolve curve in EFFECT time (D-043): intact until `from`, fully gone at `to`. */
const burnAway = (/** @type {number} */ from, /** @type {number} */ to = 1) => {
  /** @type {[number, number][]} */
  const pts = [
    [0, 0],
    [from, 0],
    [to, 1],
  ];
  if (to < 1) pts.push([1, 1]);
  return curve(pts);
};

/** Dome-explosion core: white-hot centre, gold, then orange (reference 3). */
const DOME_CORE = ramp([
  [0, '#ffffff'],
  [0.18, '#fffbe6'],
  [0.38, '#ffe066'],
  [0.6, '#ff9a2e'],
  [0.82, '#e5482a'],
  [1, '#7a1f3d'],
]);

/** Dome-explosion blobs: hot yellow-white, orange, red — no violet (reference 3). */
const DOME_BLOBS = ramp([
  [0, '#ffffff'],
  [0.15, '#fff2a6'],
  [0.35, '#ffb53d'],
  [0.6, '#ff6a24'],
  [0.85, '#d9302a'],
  [1, '#8a1f2a'],
]);

/** Ink colour for the cartoon outlines. */
const INK = '#2a1a22';

/** @type {ReadonlyArray<ExplosionPreset>} */
export const EXPLOSION_PRESETS = Object.freeze([
  {
    id: 'cartoonPop',
    name: 'Cartoon Pop',
    blurb:
      'Round, chunky, bouncy. Bold ink outlines, flat snapped colours, pops and breaks into holes.',
    globals: { 'explosion.impact': 0.1, 'explosion.flashFrames': 2 },
    timing: { frameCount: 24, fps: 30 },
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
          'outline.color': INK,
          // Overshoot then settle: the "pop".
          'burst.scaleOverLife': curve([
            [0, 0.3],
            [0.12, 1.3],
            [0.3, 1],
            [1, 0.55],
          ]),
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          // Breaks into round holes instead of fading (cartoon puff break-up).
          'dissolve.mode': 'holes',
          'dissolve.amount': burnAway(0.4, 0.75),
          'dissolve.size': 46,
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
          'outline.color': INK,
          'burst.count': 7,
          'burst.life': 0.8,
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          'dissolve.mode': 'holes',
          'dissolve.amount': burnAway(0.55, 1),
          'dissolve.size': 40,
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
          'outline.color': INK,
        },
      },
      twinkles: {
        enabled: true,
        params: {
          'sparkle.size': 22,
          'burst.count': 6,
          'burst.start': 0.15,
          'glow.amount': 0,
          'outline.mode': 'outer',
          'outline.px': 3,
          'outline.colorMode': 'custom',
          'outline.color': INK,
        },
      },
    },
  },
  {
    id: 'animeBlast',
    name: 'Anime Blast',
    blurb:
      'The dome explosion: white core with a blue rim, glowing orange blobs with specular dots, burns down into white curls, then sparks and twinkles.',
    globals: { 'explosion.impact': 0.1, 'explosion.flashFrames': 2, 'explosion.size': 1.1 },
    timing: { frameCount: 42, fps: 30 },
    layers: {
      // The dome has no grey smoke or rocks: few big clean shapes.
      smoke: { enabled: false },
      debris: { enabled: false },
      fireball: {
        params: {
          'style.ramp': DOME_BLOBS,
          'style.bands': 3,
          'style.bandNoise': 0.15,
          'style.snapColors': true,
          'style.spread': 0.45,
          'style.rampOverLife': curve([
            [0, 0.05],
            [0.5, 0.25],
            [1, 0.6],
          ]),
          'puff.radius': 105,
          'puff.count': 4,
          'puff.noise': 0.05,
          'burst.count': 6,
          'burst.speed': 230,
          'burst.drag': 4.5,
          'burst.buoyancy': 60,
          'burst.life': 0.72,
          'burst.scaleOverLife': curve([
            [0, 0.35],
            [0.15, 1.15],
            [0.5, 1],
            [1, 0.75],
          ]),
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          // White specular dots on every blob.
          'shade.shadow': 0.2,
          'shade.highlight': 1,
          'shade.highlightSize': 0.16,
          'shade.highlightOffset': 0.5,
          'glow.amount': 1,
          'glow.radius': 44,
          // Burns down into thin WHITE curls.
          'dissolve.mode': 'curls',
          'dissolve.amount': burnAway(0.32, 0.82),
          'dissolve.size': 70,
          'dissolve.flow': 1,
          'dissolve.edgePx': 5,
          'dissolve.edgeColor': '#ffffff',
        },
      },
      core: {
        enabled: true,
        params: {
          'style.ramp': DOME_CORE,
          'style.bands': 4,
          'field.width': 100,
          'field.swirl': 0.6,
          'single.end': 0.45,
          // White core with a blue rim.
          'outline.mode': 'outer',
          'outline.px': 5,
          'outline.colorMode': 'custom',
          'outline.color': '#7cc8ff',
          'dissolve.mode': 'curls',
          'dissolve.amount': burnAway(0.28, 0.55),
          'dissolve.size': 60,
          'dissolve.edgePx': 3,
          'dissolve.edgeColor': '#ffffff',
          'glow.amount': 1.6,
          'glow.radius': 80,
        },
      },
      wisps: {
        enabled: true,
        params: {
          'style.ramp': DOME_BLOBS,
          'burst.count': 8,
          'burst.start': 0.14,
          'burst.speed': 480,
          'burst.spawnRadius': 70,
          'crescent.radius': 54,
          'crescent.thickness': 16,
          'burst.life': 0.38,
          'glow.amount': 0.9,
        },
      },
      shockwave: {
        params: {
          'style.ramp': ramp([
            [0, '#ffffff'],
            [0.5, '#bfe6ff'],
            [1, '#6fb2ff'],
          ]),
          'ring.radius': 170,
          'ring.thickness': 0.1,
          'ring.breaks': 4,
          'ring.gap': 0.45,
          'single.end': 0.22,
          'glow.amount': 0.9,
          'glow.radius': 20,
        },
      },
      // Sparks come AFTER the burn-down, bright and glowing.
      sparks: {
        params: {
          'style.ramp': ramp([
            [0, '#ffffff'],
            [0.4, '#fff1a8'],
            [1, '#ff9a3d'],
          ]),
          'style.rampOverLife': curve([
            [0, 0],
            [1, 0.6],
          ]),
          'burst.start': 0.3,
          'burst.window': 0.2,
          'burst.spawnRadius': 70,
          'burst.count': 18,
          'burst.speed': 520,
          'burst.gravity': 120,
          'streak.length': 46,
          'streak.thickness': 4,
          'burst.life': 0.3,
          'glow.amount': 1,
          'glow.radius': 12,
        },
      },
      twinkles: {
        enabled: true,
        params: {
          'burst.count': 16,
          'burst.start': 0.3,
          'burst.window': 0.55,
          'sparkle.size': 22,
          'glow.amount': 1.4,
        },
      },
      // A round dome flash with a big glow (no star).
      flash: {
        params: {
          'blob.radius': 140,
          'blob.noise': 0.04,
          'glow.amount': 1.5,
          'glow.radius': 70,
        },
      },
    },
  },
  {
    id: 'smallHit',
    name: 'Small Hit',
    blurb:
      'A short impact for hits and bullets. No wind-up, no smoke; hot core, needle sparks, shards.',
    globals: {
      'explosion.size': 0.55,
      'explosion.impact': 0,
      'explosion.flashFrames': 1,
      'explosion.anticipation': false,
    },
    timing: { frameCount: 15, fps: 30 },
    layers: {
      smoke: { enabled: false },
      debris: { enabled: false },
      fireball: {
        params: {
          'burst.count': 5,
          'burst.life': 0.75,
          'burst.speed': 200,
          'puff.radius': 85,
          'style.rampOverLife': SLOW_COOL,
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          'glow.amount': 0.7,
          'glow.radius': 30,
          'style.ramp': DOME_BLOBS,
          'shade.highlight': 1,
          'shade.highlightSize': 0.18,
          'dissolve.mode': 'shards',
          'dissolve.amount': burnAway(0.3, 0.8),
          'dissolve.size': 50,
          'dissolve.edgePx': 3,
          'dissolve.edgeColor': '#ffffff',
        },
      },
      core: {
        enabled: true,
        params: {
          'style.ramp': DOME_CORE,
          'field.width': 70,
          'single.end': 0.55,
          'outline.mode': 'outer',
          'outline.px': 4,
          'outline.colorMode': 'custom',
          'outline.color': '#7cc8ff',
          'glow.amount': 1.2,
          'glow.radius': 50,
        },
      },
      shockwave: { params: { 'single.end': 0.55 } },
      sparks: {
        params: {
          'burst.count': 10,
          'burst.life': 0.6,
          'streak.length': 60,
          'streak.thickness': 6,
          'glow.amount': 0.8,
          'glow.radius': 12,
        },
      },
      twinkles: {
        enabled: true,
        params: {
          'burst.count': 4,
          'burst.start': 0.2,
          'burst.spawnRadius': 110,
          'burst.life': 0.3,
        },
      },
    },
  },
  {
    id: 'bigBoom',
    name: 'Big Boom',
    blurb:
      'Heavy and slow. Long charge, huge swirling core, lots of debris, smoke that breaks apart.',
    globals: {
      'explosion.size': 1.25,
      'explosion.impact': 0.18,
      'explosion.flashFrames': 3,
    },
    timing: { frameCount: 48, fps: 30 },
    layers: {
      fireball: {
        params: {
          'burst.count': 13,
          'burst.speed': 200,
          'burst.buoyancy': 220,
          'burst.life': 0.6,
          'puff.radius': 95,
          'style.rampOverLife': SLOW_COOL,
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          'style.ramp': DOME_BLOBS,
          'shade.highlight': 1,
          'shade.highlightSize': 0.16,
          'shade.highlightOffset': 0.5,
          'glow.amount': 0.8,
          'glow.radius': 48,
          'dissolve.mode': 'curls',
          'dissolve.amount': burnAway(0.45, 0.85),
          'dissolve.size': 80,
          'dissolve.edgePx': 5,
          'dissolve.edgeColor': '#ffffff',
        },
      },
      core: {
        enabled: true,
        params: {
          'style.ramp': DOME_CORE,
          'field.width': 120,
          'single.end': 0.5,
          'dissolve.mode': 'curls',
          'dissolve.amount': burnAway(0.4, 0.68),
          'dissolve.size': 70,
          'glow.amount': 1,
          'glow.radius': 70,
        },
      },
      wisps: {
        enabled: true,
        params: { 'burst.count': 10, 'crescent.radius': 46, 'burst.life': 0.5 },
      },
      smoke: {
        params: {
          'burst.count': 16,
          'burst.buoyancy': 380,
          'burst.life': 0.78,
          'burst.spawnRadius': 30,
          'puff.radius': 60,
          'style.ramp': rampPreset('smoke'),
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          'dissolve.mode': 'holes',
          'dissolve.amount': burnAway(0.6, 1),
          'dissolve.size': 60,
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
