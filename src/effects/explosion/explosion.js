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

import { tPerFrame } from '../../core/timing.js';
import { IDENTITY_TRANSFORM, worldMatrices } from '../../core/transform2d.js';
import { rampPreset } from '../../render/rampPresets.js';
import { MAX_PRECOMP_DEPTH } from '../../render/renderer.js';
import { getDefaults } from '../../schema/index.js';
import { defineSchema } from '../../schema/schema.js';
import { applyFollow } from '../followPath.js';
import { DEFAULT_LAYER_TIME, isAnimated, layerAt } from '../layerAnimation.js';
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
 * @property {import('../../render/compositor.js').BlendMode} blend
 * @property {'anticipation'|'flash'|'afterImpact'} timing  how the layer is anchored
 * @property {Record<string, any>} overrides  defaults on top of the layer type's defaults
 * @property {boolean} [enabled=true]  optional layers start off in the base stack; presets turn them on
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
    // Swirling banded fire core (field ball), BEHIND the fireball blobs like the dome reference (3.4e).
    id: 'core',
    label: 'Fire core',
    type: 'fieldFire',
    blend: 'normal',
    timing: 'afterImpact',
    enabled: false,
    overrides: {
      'field.form': 'ball',
      'field.width': 80,
      'field.swirl': 0.5,
      'field.speed': 3,
      'field.erodeOverLife': curve([
        [0, 0.6],
        [0.5, 1],
        [1, 2.2],
      ]),
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.45],
      ]),
      'single.start': 0,
      'single.end': 0.5,
      'single.scaleOverLife': curve([
        [0, 0.35],
        [0.15, 1.1],
        [0.4, 1],
        [1, 0.8],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [0.85, 1],
        [1, 0],
      ]),
      'glow.amount': 1,
      'glow.radius': 40,
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
    // Hooked crescent wisps tearing off the fireball and curling away (references 2 and 3).
    id: 'wisps',
    label: 'Curl wisps',
    type: 'crescentBurst',
    blend: 'normal',
    timing: 'afterImpact',
    enabled: false,
    overrides: {
      'style.ramp': ramp([
        [0, '#ffffff'],
        [0.3, '#fff3a0'],
        [0.6, '#ff8a2a'],
        [1, '#a8231e'],
      ]),
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.7],
      ]),
      'style.bands': 3,
      'crescent.radius': 34,
      'crescent.sweep': 120,
      'crescent.thickness': 12,
      'crescent.hook': 0.7,
      'crescent.balance': 0.5,
      'crescent.hotEdge': 0.4,
      'crescent.wobble': 0.2,
      'crescent.thicknessOverLife': curve([
        [0, 1],
        [0.6, 0.7],
        [1, 0.1],
      ]),
      'burst.count': 7,
      'burst.start': 0.08,
      'burst.window': 0.15,
      'burst.spawnRadius': 40,
      'burst.speed': 260,
      'burst.drag': 3,
      'burst.buoyancy': 160,
      'burst.life': 0.4,
      'burst.spin': 120,
      'burst.alignToVelocity': false,
      'burst.randomRotation': 360,
      'burst.scaleOverLife': curve([
        [0, 0.4],
        [0.3, 1],
        [1, 0.7],
      ]),
      'glow.amount': 0.6,
      'glow.radius': 16,
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
    // 4-point twinkles popping around the blast as it burns down.
    id: 'twinkles',
    label: 'Twinkles',
    type: 'sparkleBurst',
    blend: 'normal',
    timing: 'afterImpact',
    enabled: false,
    overrides: {
      'sparkle.size': 18,
      'burst.count': 10,
      'burst.start': 0.12,
      'burst.window': 0.5,
      'burst.spawnRadius': 150,
      'burst.life': 0.18,
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
    timing: { frameCount: 24, fps: 24, loop: false, holdMode: 'ones', duration: 23 / 24 },
    layers: EXPLOSION_LAYERS.map((spec) =>
      makeLayer({
        id: spec.id,
        label: spec.label,
        type: spec.type,
        enabled: spec.enabled ?? true,
        blend: spec.blend,
        anchor: spec.timing,
        params: {
          ...getDefaults(LAYER_TYPES[spec.type].schema),
          ...structuredClone(spec.overrides),
        },
      }),
    ),
  };
}

/** How a layer's start/end are timed (3.6a: per layer, chosen in the inspector). */
export const ANCHORS = Object.freeze(
  /** @type {const} */ (['afterImpact', 'anticipation', 'flash', 'free']),
);
/** @typedef {typeof ANCHORS[number]} Anchor */

/**
 * @typedef {object} EditorLayer  one layer as edited and saved
 * @property {string} id         unique in the stack
 * @property {string} label
 * @property {keyof typeof LAYER_TYPES} type
 * @property {boolean} enabled   visibility (eye)
 * @property {boolean} solo
 * @property {number} opacity    0–1
 * @property {import('../../render/compositor.js').BlendMode} blend
 * @property {Anchor} anchor     how its life is timed
 * @property {string} seedKey    randomness key: duplicates keep it (identical copy); Reseed changes it
 * @property {import('../../core/transform2d.js').LayerTransform} transform  layer transform (3.6b)
 * @property {string | null} parent  id of the parent layer, or null
 * @property {import('../../core/keyframes.js').KeyMap} keys  animated params (3.6c), layer time
 * @property {import('../layerAnimation.js').LayerTime} time  slide / trim / stretch (3.6c)
 * @property {Record<string, any>} params
 * @property {import('../../render/masks.js').Mask[]} masks  shapes that cut the layer (3.6d)
 * @property {{ source: string, mode: string } | null} matte  track matte (3.6d)
 * @property {string} [comp]  precomp layers (type 'precomp', 3.6e): id of the precomp shown
 * @property {import('../followPath.js').Follow} [follow]  Follow Path (4.Pa)
 */

/**
 * A layer with every field filled (defaults for anything missing).
 * @param {Partial<EditorLayer> & { id: string, type: keyof typeof LAYER_TYPES }} l
 * @returns {EditorLayer}
 */
export function makeLayer(l) {
  return {
    id: l.id,
    label: l.label ?? l.id,
    type: l.type,
    enabled: l.enabled ?? true,
    solo: l.solo ?? false,
    opacity: l.opacity ?? 1,
    blend: l.blend ?? 'normal',
    anchor: l.anchor ?? 'afterImpact',
    seedKey: l.seedKey ?? l.id,
    transform: { ...IDENTITY_TRANSFORM, ...l.transform },
    parent: l.parent ?? null,
    keys: l.keys ?? {},
    time: { ...DEFAULT_LAYER_TIME, ...l.time },
    params: l.params ?? getDefaults(LAYER_TYPES[l.type].schema),
    masks: l.masks ?? [],
    matte: l.matte ?? null,
    ...(l.comp ? { comp: l.comp } : {}),
    ...(l.follow ? { follow: l.follow } : {}),
  };
}

/**
 * @typedef {object} ExplosionState
 * @property {'explosion'} family
 * @property {Record<string, any>} globals
 * @property {import('../../core/timing.js').Timing} timing
 * @property {EditorLayer[]} layers  bottom → top
 * @property {Record<string, Precomp>} [comps]  precomps (3.6e), by id
 */

/**
 * @typedef {object} Precomp  a group of layers used as one layer (After Effects precomp)
 * @property {string} id
 * @property {string} name
 * @property {EditorLayer[]} layers  bottom → top; their time is the precomp layer's time
 */

/** Default anchor of the base-stack layers, by id (used to migrate files saved before 3.6a). */
export const BASE_ANCHOR_OF = Object.freeze(
  Object.fromEntries(EXPLOSION_LAYERS.map((l) => [l.id, l.timing])),
);

/** @param {number[] | undefined} m */
const isIdentity = (m) =>
  !m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0);

/** @param {import('../layerAnimation.js').LayerTime | undefined} t */
const isDefaultTime = (t) =>
  !t || (t.offset === 0 && t.stretch === 1 && t.in <= 0 && (t.out === null || t.out === undefined));

/**
 * Turn an editable explosion into a renderable Effect: apply each layer's timing anchor
 * (impact, anticipation, flash or free), flash length, the anticipation toggle, solo, opacity
 * and blend. Pure: same state → same effect.
 * @param {ExplosionState} state
 * @returns {{ effect: import('../../render/renderer.js').Effect, scale: number }}
 *   scale = global size, to multiply into the render settings
 */
export function buildExplosion(state) {
  const built = buildStatic(state);
  if (!isAnimated(state)) return built;
  // Keyframes (3.6c): the renderer asks for the effect as it is at each moment.
  return {
    ...built,
    effect: {
      ...built.effect,
      at: (time) =>
        buildStatic({ ...state, layers: state.layers.map((l) => layerAt(l, time.seconds)) }).effect,
    },
  };
}

/**
 * Build without keyframes (values as they are in `state`).
 * @param {ExplosionState} state
 * @returns {{ effect: import('../../render/renderer.js').Effect, scale: number }}
 */
function buildStatic(state) {
  const g = state.globals;
  const impact = g['explosion.impact'];
  // Normalized time of one frame (from the animation length, not the frame count: D-050).
  const frameT = tPerFrame(state.timing);
  const after = (/** @type {number} */ v) => Math.min(1, impact + v);
  // Flash: exactly `frames` frames, from the first frame at or after the impact.
  const frames = g['explosion.flashFrames'];
  const flashEnd = Math.min(1, (Math.ceil(impact / frameT - 1e-9) + frames - 0.5) * frameT);

  /**
   * Editor layers → renderer layers (one comp or precomp). Precomp layers get their
   * precomp's layers as children (3.6e); nesting stops at a loop or past MAX_PRECOMP_DEPTH.
   * @param {EditorLayer[]} list @param {string[]} chain precomp ids being built (loop guard)
   * @returns {import('../../render/renderer.js').Layer[]}
   */
  const buildLayers = (list, chain) => {
    const anySolo = list.some((l) => l.enabled && l.solo);
    // Layer transforms with parenting resolved (3.6b). Identity matrices are left out.
    const worlds = worldMatrices(applyFollow(list)); // Follow Path (4.Pa) moves followers first
    return list.map((l) => {
      const params = { ...l.params };
      const anchor = l.anchor ?? BASE_ANCHOR_OF[l.id] ?? 'afterImpact';
      let enabled = l.enabled && (!anySolo || !!l.solo);
      /** Life window keys: single elements and orbits. */
      const windows = [
        ['single.start', 'single.end'],
        ['orbit.start', 'orbit.end'],
      ].filter(([k]) => k in params);
      if (anchor === 'anticipation') {
        for (const [s, e] of windows) {
          params[s] = 0;
          params[e] = impact;
        }
        if ('burst.start' in params) params['burst.start'] *= impact;
        enabled = enabled && g['explosion.anticipation'] && impact > 0;
      } else if (anchor === 'flash') {
        for (const [s, e] of windows) {
          params[s] = impact;
          params[e] = flashEnd;
        }
        if ('burst.start' in params) params['burst.start'] = impact;
        enabled = enabled && frames > 0;
      } else if (anchor === 'afterImpact') {
        for (const [s, e] of windows) {
          params[s] = after(params[s]);
          params[e] = after(params[e]);
        }
        if ('burst.start' in params) params['burst.start'] = after(params['burst.start']);
      }
      /** @type {import('../../render/renderer.js').Layer} */
      const out = {
        id: l.id,
        seedKey: l.seedKey ?? l.id,
        type: l.type,
        enabled,
        blend: l.blend,
        opacity: l.opacity ?? 1,
        matrix: isIdentity(worlds.get(l.id)) ? undefined : worlds.get(l.id),
        time: isDefaultTime(l.time) ? undefined : l.time,
        params,
        ...(l.masks?.length ? { masks: l.masks } : {}),
        ...(l.matte ? { matte: l.matte } : {}),
      };
      const comp = l.type === 'precomp' && l.comp ? state.comps?.[l.comp] : undefined;
      if (l.type === 'precomp') {
        if (!comp || chain.includes(comp.id) || chain.length >= MAX_PRECOMP_DEPTH) {
          out.children = [];
        } else {
          const next = [...chain, comp.id];
          out.children = buildLayers(comp.layers, next);
          if (isAnimated({ layers: comp.layers })) {
            // its keys resolve at the precomp's own time
            out.childrenAt = (seconds) =>
              buildLayers(
                comp.layers.map((c) => layerAt(c, seconds)),
                next,
              );
          }
        }
      }
      return out;
    });
  };
  const layers = buildLayers(state.layers, []);

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
