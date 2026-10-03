// @ts-check
/**
 * Explosion presets (brief §4.1, step 3.4). A preset is a small set of CHANGES on top of the
 * base explosion (`createExplosion()`): globals, timing, and per-layer params / blend / on-off.
 * Keeping presets as deltas makes each one readable and easy to retune with Raul.
 *
 * Names and every value here are a FIRST PASS for Raul to direct [Raul].
 */

import { rampPreset } from '../../render/rampPresets.js';
import { composedPreset } from '../composedPresets.js';
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
 * @property {import('../../render/compositor.js').BlendMode} [blend]
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

/** The dome's white-hot mass: flat white with a cream inner band. */
const WHITE_HOT = ramp([
  [0, '#ffffff'],
  [0.5, '#fff6dc'],
  [1, '#ffe3a3'],
]);

/** Gold filaments and hooks (the dome's burn-down). */
const GOLD_CURLS = ramp([
  [0, '#ffffff'],
  [0.3, '#fff0a0'],
  [0.65, '#ffc23a'],
  [1, '#ff7a1f'],
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
          'outline.mode': 'outer',
          'outline.px': 4,
          'outline.colorMode': 'custom',
          'outline.color': INK,
          'cs.size': 48,
          'cs.shade': 0.3,
          'cs.holeCount': 10,
          'cs.holeStart': 0.25,
          'burst.count': 7,
          'burst.life': 0.8,
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
      'The dome explosion: a white-hot mass with a blue halo rises, hot blobs fly up, the mass burns into a gold lattice, then curls drift up among twinkles.',
    globals: { 'explosion.impact': 0.08, 'explosion.flashFrames': 1, 'explosion.size': 1.15 },
    timing: { frameCount: 42, fps: 30 },
    layers: {
      // Studied frame by frame (reference 3): rises UP like a mushroom, no ring, no rocks, no smoke.
      smoke: { enabled: false },
      debris: { enabled: false },
      shockwave: { enabled: false },
      core: {
        enabled: true,
        params: {
          // Flat white billowing mass with a blue halo (glow tinted blue, not an outline).
          'field.form': 'ball',
          'field.width': 125,
          'field.swirl': 0.35,
          'field.warp': 0.55,
          'field.scale': 0.6,
          'field.speed': 2.5,
          'style.ramp': WHITE_HOT,
          'style.bands': 2,
          'style.rampOverLife': curve([
            [0, 0],
            [1, 0.2],
          ]),
          'single.y': -10,
          'single.end': 0.75,
          'single.scaleOverLife': curve([
            [0, 0.25],
            [0.12, 1],
            [1, 1.15],
          ]),
          'single.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          'glow.amount': 0.9,
          'glow.radius': 50,
          'glow.tint': '#6d93ffb0',
          // The mass burns into a lattice of gold filaments around round holes.
          'dissolve.mode': 'curls',
          'dissolve.amount': burnAway(0.22, 0.75),
          'dissolve.size': 80,
          'dissolve.flow': 1,
          'dissolve.edgePx': 8,
          'dissolve.edgeColor': '#ffd24a',
        },
      },
      fireball: {
        params: {
          // A few hot blobs: yellow-white top-left band, red body, flung up and out, shrinking.
          'style.ramp': DOME_BLOBS,
          'style.bands': 3,
          'style.bandNoise': 0.1,
          'style.snapColors': true,
          'style.spread': 0.55,
          'style.rampOverLife': curve([
            [0, 0.1],
            [1, 0.45],
          ]),
          'puff.radius': 58,
          'puff.count': 3,
          'puff.noise': 0.05,
          'burst.count': 6,
          'burst.start': 0.02,
          'burst.direction': 0,
          'burst.cone': 220,
          'burst.speed': 820,
          'burst.speedVariance': 0.45,
          'burst.drag': 5,
          'burst.buoyancy': 160,
          'burst.spawnRadius': 40,
          'burst.life': 0.55,
          'burst.scaleOverLife': curve([
            [0, 0.5],
            [0.2, 1.15],
            [0.6, 0.8],
            [1, 0.1],
          ]),
          'burst.opacityOverLife': curve([
            [0, 1],
            [1, 1],
          ]),
          'shade.shadow': 0,
          'shade.highlight': 0.7,
          'shade.highlightSize': 0.55,
          'shade.highlightOffset': 0.3,
          'glow.amount': 1,
          'glow.radius': 30,
        },
      },
      // Short gold hooks drifting up as the lattice breaks (the end of the dome).
      wisps: {
        enabled: true,
        params: {
          'style.ramp': GOLD_CURLS,
          'style.bands': 2,
          'style.rampOverLife': curve([
            [0, 0],
            [1, 0.5],
          ]),
          'burst.count': 10,
          'burst.start': 0.4,
          'burst.window': 0.2,
          'burst.direction': 0,
          'burst.cone': 120,
          'burst.spawnRadius': 90,
          'burst.speed': 120,
          'burst.buoyancy': 200,
          'burst.life': 0.45,
          'crescent.radius': 26,
          'crescent.sweep': 130,
          'crescent.thickness': 9,
          'crescent.hook': 0.8,
          'glow.amount': 1,
          'glow.radius': 14,
        },
      },
      // Tiny embers rising, not radial streaks.
      sparks: {
        params: {
          'style.ramp': GOLD_CURLS,
          'burst.start': 0.05,
          'burst.window': 0.4,
          'burst.direction': 0,
          'burst.cone': 160,
          'burst.spawnRadius': 60,
          'burst.count': 14,
          'burst.speed': 260,
          'burst.gravity': 0,
          'burst.buoyancy': 120,
          'streak.length': 12,
          'streak.thickness': 3,
          'burst.life': 0.4,
          'glow.amount': 1,
          'glow.radius': 8,
        },
      },
      // Long, thin 4-point twinkles all through the effect.
      twinkles: {
        enabled: true,
        params: {
          'sparkle.size': 30,
          'sparkle.ratio': 0.3,
          'sparkle.thinness': 0.92,
          'burst.count': 22,
          'burst.start': 0,
          'burst.window': 0.9,
          'burst.spawnRadius': 180,
          'burst.life': 0.22,
          'glow.amount': 1.2,
        },
      },
      // Charge-up: a small red blob at the base.
      anticipation: {
        params: {
          'single.y': 60,
          'blob.radius': 30,
          'style.ramp': DOME_BLOBS,
        },
      },
      flash: {
        params: {
          'single.y': 20,
          'blob.radius': 100,
          'glow.amount': 1.5,
          'glow.radius': 45,
          'glow.tint': '#6d93ffb0',
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
          'burst.buoyancy': 300,
          'burst.life': 0.8,
          'burst.spawnRadius': 30,
          'burst.speed': 320,
          'cs.size': 56,
          'cs.lumps': 7,
          'cs.holeCount': 14,
          'cs.holeStart': 0.3,
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

/**
 * Give a timing the animation length its frames had when authored, unless it sets one.
 * @param {import('../../core/timing.js').Timing} t @param {object} [authored]
 */
function withDuration(t, authored) {
  if (authored && 'duration' in authored) return t;
  if (authored && ('frameCount' in authored || 'fps' in authored)) {
    return { ...t, duration: Math.max(1, t.frameCount - 1) / t.fps };
  }
  return t;
}

/** Preset by id (explosions, then the composed presets: name and blurb). @param {string} id */
export const explosionPreset = (id) =>
  EXPLOSION_PRESETS.find((p) => p.id === id) ?? composedPreset(id);

/**
 * A fresh explosion with a preset applied on top of the base stack. Unknown id → the base.
 * Pure: the preset table is never mutated (values are deep-copied).
 * @param {string} id
 * @returns {import('./explosion.js').ExplosionState}
 */
export function createExplosionFromPreset(id) {
  // Particle / lightning / magic presets build their own composition.
  const composed = composedPreset(id);
  if (composed) return composed.build();
  const state = createExplosion();
  const p = EXPLOSION_PRESETS.find((x) => x.id === id);
  if (!p) return state;
  const copy = structuredClone(p);
  return {
    ...state,
    globals: { ...state.globals, ...copy.globals },
    // A preset's animation length is its authored frames at its fps (D-050).
    timing: withDuration({ ...state.timing, ...copy.timing }, copy.timing),
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
