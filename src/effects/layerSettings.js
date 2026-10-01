// @ts-check
/**
 * Layer-level settings shown at the top of the selected layer's inspector (3.6a): blend mode,
 * opacity, and how the layer is timed. They map to EditorLayer fields, not to the layer type's
 * own params, so they exist for every layer type.
 */

import { BLEND_MODE_LABELS } from '../render/compositor.js';
import { defineSchema } from '../schema/schema.js';

/** Labels for the timing anchors. */
export const ANCHOR_LABELS = Object.freeze({
  afterImpact: 'After impact (life counts from the hit)',
  anticipation: 'Anticipation (before the hit)',
  flash: 'Flash frames (at the hit)',
  free: 'Free (whole effect, ignores the impact)',
});

export const LAYER_SETTINGS_SCHEMA = defineSchema([
  {
    id: 'layer.blend',
    label: 'Blend mode',
    group: 'Layer',
    type: 'enum',
    options: Object.entries(BLEND_MODE_LABELS).map(([value, label]) => ({ value, label })),
    default: 'normal',
    tooltip: 'How this layer mixes with the layers below it',
  },
  {
    id: 'layer.opacity',
    label: 'Opacity',
    group: 'Layer',
    type: 'float',
    min: 0,
    max: 100,
    step: 1,
    default: 100,
    unit: '%',
    tooltip: 'Opacity of the whole layer (glow included)',
  },
  {
    id: 'layer.anchor',
    label: 'Timed from',
    group: 'Layer',
    type: 'enum',
    options: Object.entries(ANCHOR_LABELS).map(([value, label]) => ({ value, label })),
    default: 'afterImpact',
    tooltip: "What the layer's life start / end count from",
  },
]);

/** Settings values of a layer. @param {import('./explosion/explosion.js').EditorLayer} l */
export const layerSettingsValues = (l) => ({
  'layer.blend': l.blend,
  'layer.opacity': Math.round(l.opacity * 1000) / 10,
  'layer.anchor': l.anchor,
});

/**
 * A settings change → EditorLayer patch.
 * @param {string} id @param {any} value
 * @returns {Partial<import('./explosion/explosion.js').EditorLayer>}
 */
export function layerSettingsPatch(id, value) {
  if (id === 'layer.blend') return { blend: value };
  if (id === 'layer.opacity') return { opacity: Math.min(1, Math.max(0, value / 100)) };
  if (id === 'layer.anchor') return { anchor: value };
  return {};
}
