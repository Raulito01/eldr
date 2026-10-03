// @ts-check
/**
 * Explosion presets (brief §4.1, step 3.4). A preset is a small set of CHANGES on top of the
 * base explosion (`createExplosion()`): globals, timing, and per-layer params / blend / on-off.
 * Keeping presets as deltas makes each one readable and easy to retune with Raul.
 *
 * Names and every value here are a FIRST PASS for Raul to direct [Raul].
 */

import { parseExplosion } from '../../project/explosionFile.js';
import { composedPreset } from '../composedPresets.js';
import { ANIME_BLAST_FILE } from './animeBlastFile.js';
import { buildBigBoom, buildSmallHit } from './boomPresets.js';
import { createExplosion } from './explosion.js';

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
 * @property {() => import('./explosion.js').ExplosionState} [build]  builds the whole
 *   composition instead (D-114): Raul's authored file, or a stack edited layer by layer
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
      'Raul’s magic blast: a green swirling core spins and swells on a parent, crescents orbit it, thick-to-thin rings, debris and sparks.',
    build: () => /** @type {any} */ (parseExplosion(ANIME_BLAST_FILE).state),
  },
  {
    id: 'smallHit',
    name: 'Small Hit',
    blurb:
      'A snappy 20-frame hit: a quick pinch, a star flash, crescent slashes burst out, a thick-to-thin ring, sparks and a little cel puff that breaks into holes.',
    build: buildSmallHit,
  },
  {
    id: 'bigBoom',
    name: 'Big Boom',
    blurb:
      'Heavy and slow: the air is sucked in, a flash, a cel fireball that cools into rising smoke and breaks into holes, shockwave and ground dust, debris arcs, long sparks, embers.',
    build: buildBigBoom,
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
  if (p.build) return p.build();
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
