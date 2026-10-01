// @ts-check
/**
 * Explosion effect family (brief §4.1): global controls + the default layer stack, and
 * `buildExplosion()` which turns an editable explosion into a renderable Effect.
 *
 * Timing is anchored on the IMPACT: the anticipation glow fills [0, impact]; for every other
 * layer, its start (and a single element's end) count FROM the impact. Moving the impact moves
 * the whole explosion with it.
 *
 * Layer defaults are a first pass, to be tuned into presets with Raul (step 3.4) [Raul].
 */

import { rampPreset } from '../../render/rampPresets.js';
import { getDefaults } from '../../schema/index.js';
import { defineSchema } from '../../schema/schema.js';
import { LAYER_TYPES } from '../layerTypes.js';

/** Global explosion controls (ids `explosion.*`). */
export const EXPLOSION_SCHEMA = defineSchema([
  {
    id: 'explosion.size',
    label: 'Size',
    group: 'Explosion',
    type: 'float',
    min: 0.1,
    max: 8,
    step: 0.01,
    default: 1,
    unit: 'x',
    randomize: { min: 0.85, max: 1.2 },
    tooltip: 'Scales the whole explosion (shapes, distances, outlines)',
  },
  {
    id: 'explosion.impact',
    label: 'Impact time',
    group: 'Explosion',
    type: 'float',
    min: 0,
    max: 0.8,
    step: 0.01,
    default: 0.15,
    tooltip: 'When the hit lands (fraction of the effect). Anticipation fills the time before it.',
  },
  {
    id: 'explosion.flashFrames',
    label: 'Flash frames',
    group: 'Explosion',
    type: 'int',
    min: 0,
    max: 8,
    default: 2,
    tooltip: 'Full-bright impact frames (0 = no flash)',
  },
  {
    id: 'explosion.anticipation',
    label: 'Anticipation',
    group: 'Explosion',
    type: 'bool',
    default: true,
    tooltip: 'Charge-up glow before the impact',
  },
]);

const ramp = (/** @type {[number, string][]} */ stops) =>
  stops.map(([pos, color]) => ({ pos, color }));
const curve = (/** @type {[number, number][]} */ pts) => pts.map(([x, y]) => ({ x, y }));

/**
 * @typedef {object} LayerSpec
 * @property {string} id
 * @property {string} label
 * @property {keyof typeof LAYER_TYPES} type
 * @property {'normal'|'add'|'screen'} blend
 * @property {'anticipation'|'flash'|'afterImpact'} timing  how the layer is anchored
 * @property {Record<string, any>} overrides  defaults on top of the layer type's defaults
 */

/** Default layer stack, bottom → top. @type {LayerSpec[]} */
export const EXPLOSION_LAYERS = [
  {
    id: 'smoke',
    label: 'Smoke',
    type: 'puffBurst',
    blend: 'normal',
    timing: 'afterImpact',
    overrides: {
      'style.ramp': rampPreset('smoke'),
      'style.rampOverLife': curve([
        [0, 0.1],
        [1, 0.85],
      ]),
      'puff.radius': 52,
      'puff.count': 6,
      'burst.count': 9,
      'burst.start': 0.06,
      'burst.speed': 150,
      'burst.drag': 3,
      'burst.buoyancy': 260,
      'burst.life': 0.8,
      'burst.spawnRadius': 16,
      'burst.scaleOverLife': curve([
        [0, 0.3],
        [0.3, 1],
        [1, 1.15],
      ]),
      'burst.opacityOverLife': curve([
        [0, 0.95],
        [0.6, 0.9],
        [1, 0],
      ]),
      'shade.shadow': 0.3,
    },
  },
  {
    id: 'shockwave',
    label: 'Shockwave',
    type: 'ring',
    blend: 'normal',
    timing: 'afterImpact',
    overrides: {
      'style.ramp': ramp([
        [0, '#ffffff'],
        [0.5, '#ffe28a'],
        [1, '#ff9a3d'],
      ]),
      'style.bands': 2,
      'shade.shadow': 0,
      'ring.radius': 120,
      'ring.thickness': 0.2,
      'single.start': 0,
      'single.end': 0.4,
      'single.scaleOverLife': curve([
        [0, 0.15],
        [0.35, 0.85],
        [1, 1.25],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [0.6, 0.9],
        [1, 0],
      ]),
    },
  },
  {
    id: 'fireball',
    label: 'Fireball',
    type: 'puffBurst',
    blend: 'normal',
    timing: 'afterImpact',
    overrides: {
      'puff.radius': 70,
      'puff.count': 6,
      'puff.spread': 0.5,
      'burst.count': 8,
      'burst.start': 0,
      'burst.speed': 170,
      'burst.drag': 4,
      'burst.buoyancy': 120,
      'burst.spawnRadius': 12,
      'burst.life': 0.62,
      'burst.sizeVariance': 0.35,
      'burst.scaleOverLife': curve([
        [0, 0.4],
        [0.15, 1.15],
        [0.5, 1],
        [1, 0.45],
      ]),
      'burst.opacityOverLife': curve([
        [0, 1],
        [0.75, 1],
        [1, 0],
      ]),
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.95],
      ]),
      'style.spread': 0.35,
    },
  },
  {
    id: 'debris',
    label: 'Debris',
    type: 'debrisBurst',
    blend: 'normal',
    timing: 'afterImpact',
    overrides: {
      'style.ramp': rampPreset('debris'),
      'debris.size': 6,
      'burst.count': 10,
      'burst.speed': 380,
      'burst.gravity': 700,
      'burst.drag': 1.2,
      'burst.life': 0.8,
      'outline.mode': 'outer',
      'outline.px': 1.5,
    },
  },
  {
    id: 'sparks',
    label: 'Sparks',
    type: 'streakBurst',
    blend: 'normal',
    timing: 'afterImpact',
    overrides: {
      'style.ramp': rampPreset('sparks'),
      'style.bands': 2,
      'shade.shadow': 0,
      'streak.length': 40,
      'streak.thickness': 5,
      'burst.count': 18,
      'burst.speed': 520,
      'burst.drag': 3.5,
      'burst.gravity': 200,
      'burst.life': 0.45,
    },
  },
  {
    id: 'anticipation',
    label: 'Anticipation glow',
    type: 'blob',
    blend: 'add',
    timing: 'anticipation',
    overrides: {
      'blob.radius': 46,
      'blob.noise': 0.05,
      'style.ramp': ramp([
        [0, '#ffffff'],
        [0.5, '#ffe28a'],
        [1, '#ff9a3d'],
      ]),
      'style.rampOverLife': curve([
        [0, 0.8],
        [1, 0],
      ]),
      'style.bands': 2,
      'shade.shadow': 0,
      // Charge up, then contract right before the hit.
      'single.scaleOverLife': curve([
        [0, 0.2],
        [0.7, 1],
        [1, 0.35],
      ]),
      'single.opacityOverLife': curve([
        [0, 0],
        [0.3, 0.8],
        [1, 1],
      ]),
    },
  },
  {
    id: 'flash',
    label: 'Impact flash',
    type: 'blob',
    blend: 'normal',
    timing: 'flash',
    overrides: {
      'blob.radius': 130,
      'blob.noise': 0.06,
      'style.ramp': ramp([
        [0, '#ffffff'],
        [1, '#fff7d6'],
      ]),
      'style.bands': 1,
      'style.spread': 0,
      'shade.shadow': 0,
      'single.scaleOverLife': curve([
        [0, 1],
        [1, 1.15],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [1, 1],
      ]),
    },
  },
];

/**
 * A fresh, editable explosion with default globals and layers.
 * @returns {ExplosionState}
 */
export function createExplosion() {
  return {
    family: 'explosion',
    globals: getDefaults(EXPLOSION_SCHEMA),
    timing: { frameCount: 24, fps: 24, loop: false, holdMode: 'ones' },
    layers: EXPLOSION_LAYERS.map((spec) => ({
      id: spec.id,
      label: spec.label,
      type: spec.type,
      enabled: true,
      blend: spec.blend,
      params: { ...getDefaults(LAYER_TYPES[spec.type].schema), ...structuredClone(spec.overrides) },
    })),
  };
}

/**
 * @typedef {object} ExplosionState
 * @property {'explosion'} family
 * @property {Record<string, any>} globals
 * @property {import('../../core/timing.js').Timing} timing
 * @property {{ id: string, label: string, type: keyof typeof LAYER_TYPES, enabled: boolean,
 *   blend: 'normal'|'add'|'screen', params: Record<string, any> }[]} layers
 */

/** Layer timing anchor by id (from the default stack). */
const TIMING_OF = Object.fromEntries(EXPLOSION_LAYERS.map((l) => [l.id, l.timing]));

/**
 * Turn an editable explosion into a renderable Effect: apply impact anchoring, flash length
 * and the anticipation toggle. Pure: same state → same effect.
 * @param {ExplosionState} state
 * @returns {{ effect: import('../../render/renderer.js').Effect, scale: number }}
 *   scale = global size, to multiply into the render settings
 */
export function buildExplosion(state) {
  const g = state.globals;
  const impact = g['explosion.impact'];
  const n = state.timing.frameCount;
  // Normalized time of one frame for one-shots (frame k sits at t = k / (n − 1)).
  const frameT = n > 1 ? 1 / (n - 1) : 1;
  const after = (/** @type {number} */ v) => Math.min(1, impact + v);

  const layers = state.layers.map((l) => {
    const params = { ...l.params };
    const timing = TIMING_OF[l.id] ?? 'afterImpact';
    let enabled = l.enabled;
    if (timing === 'anticipation') {
      params['single.start'] = 0;
      params['single.end'] = impact;
      enabled = enabled && g['explosion.anticipation'] && impact > 0;
    } else if (timing === 'flash') {
      const frames = g['explosion.flashFrames'];
      // Covers exactly `frames` frames, starting at the first frame at or after the impact.
      const first = Math.ceil(impact / frameT - 1e-9);
      params['single.start'] = impact;
      params['single.end'] = Math.min(1, (first + frames - 0.5) * frameT);
      enabled = enabled && frames > 0;
    } else {
      if ('burst.start' in params) params['burst.start'] = after(params['burst.start']);
      if ('single.start' in params) {
        params['single.start'] = after(params['single.start']);
        params['single.end'] = after(params['single.end']);
      }
    }
    return { id: l.id, type: l.type, enabled, blend: l.blend, params };
  });

  return {
    effect: {
      id: 'explosion',
      timing: {
        ...state.timing,
        phases: { impact, decay: Math.max(impact, Math.min(1, impact + 0.45)) },
      },
      layers,
    },
    scale: g['explosion.size'],
  };
}
