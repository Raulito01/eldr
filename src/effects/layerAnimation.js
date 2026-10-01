// @ts-check
/**
 * Animation of editor layers (3.6c, D-054): keyframes + layer time (slide / trim / stretch).
 *
 * Keys live in LAYER time (seconds), like After Effects: sliding or stretching a layer moves
 * and stretches its keys with it. Layer time = (comp time − offset) / stretch.
 *
 * Animatable ids: every param of the layer type, `transform.*`, and `layer.opacity` (percent).
 */

import { resolveParams } from '../core/keyframes.js';
import { LAYER_TYPES } from './layerTypes.js';

/**
 * @typedef {object} LayerTime  where a layer sits on the comp timeline (seconds)
 * @property {number} offset   comp time of the layer's time 0 (slide)
 * @property {number} stretch  1 = normal, 2 = twice as slow (time stretch)
 * @property {number} in       comp time the layer appears
 * @property {number | null} out  comp time it disappears (null = until the end)
 */

/** @type {Readonly<LayerTime>} */
export const DEFAULT_LAYER_TIME = Object.freeze({ offset: 0, stretch: 1, in: 0, out: null });

/** Transform + opacity as animatable "params" (values as shown in the inspector). */
export const LAYER_ANIM_DEFS = Object.freeze([
  ...['x', 'y', 'anchorX', 'anchorY', 'scaleX', 'scaleY', 'rotation'].map((k) => ({
    id: `transform.${k}`,
    type: 'float',
  })),
  { id: 'layer.opacity', type: 'float' },
]);

/** Layer-local seconds for comp seconds. @param {LayerTime | undefined} lt @param {number} s */
export const layerSeconds = (lt, s) => {
  const t = lt ?? DEFAULT_LAYER_TIME;
  return (s - t.offset) / (t.stretch || 1);
};

/** Comp seconds for layer-local seconds. @param {LayerTime | undefined} lt @param {number} s */
export const compSeconds = (lt, s) => {
  const t = lt ?? DEFAULT_LAYER_TIME;
  return t.offset + s * (t.stretch || 1);
};

/** Does any layer have keys? @param {{ layers: { keys?: Record<string, any[]> }[] }} state */
export const isAnimated = (state) =>
  state.layers.some((l) => l.keys && Object.values(l.keys).some((k) => k?.length));

/**
 * A layer with every animated value resolved at comp time `s`.
 * @param {import('./explosion/explosion.js').EditorLayer} l @param {number} s comp seconds
 * @returns {import('./explosion/explosion.js').EditorLayer}
 */
export function layerAt(l, s) {
  const keys = l.keys;
  if (!keys || !Object.values(keys).some((k) => k?.length)) return l;
  const local = layerSeconds(l.time, s);
  const params = resolveParams(LAYER_TYPES[l.type].schema, l.params, keys, local);
  const flat = resolveParams(
    LAYER_ANIM_DEFS,
    {
      'transform.x': l.transform.x,
      'transform.y': l.transform.y,
      'transform.anchorX': l.transform.anchorX,
      'transform.anchorY': l.transform.anchorY,
      'transform.scaleX': l.transform.scaleX,
      'transform.scaleY': l.transform.scaleY,
      'transform.rotation': l.transform.rotation,
      'layer.opacity': l.opacity * 100,
    },
    keys,
    local,
  );
  return {
    ...l,
    params,
    opacity: Math.min(1, Math.max(0, flat['layer.opacity'] / 100)),
    transform: {
      x: flat['transform.x'],
      y: flat['transform.y'],
      anchorX: flat['transform.anchorX'],
      anchorY: flat['transform.anchorY'],
      scaleX: flat['transform.scaleX'],
      scaleY: flat['transform.scaleY'],
      rotation: flat['transform.rotation'],
    },
  };
}
