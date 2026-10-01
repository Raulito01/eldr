// @ts-check
/**
 * Transform section of the layer inspector (3.6b): Parent, Position, Scale (linked or not),
 * Rotation, Anchor point. Built per selected layer, because the Parent menu lists that layer's
 * possible parents (never itself or its children).
 */

import { IDENTITY_TRANSFORM } from '../../core/transform2d.js';
import { parentCandidates } from '../../effects/layerStack.js';
import { defineSchema } from '../../schema/schema.js';

const NONE = '';

/**
 * @param {{ layers: import('../../effects/explosion/explosion.js').EditorLayer[] }} state
 * @param {string} id
 */
export function transformSchema(state, id) {
  const px = (
    /** @type {string} */ key,
    /** @type {string} */ label,
    /** @type {string} */ tip,
  ) => ({
    id: `transform.${key}`,
    label,
    group: 'Transform',
    type: 'float',
    min: -4096,
    max: 4096,
    step: 1,
    default: 0,
    unit: 'px',
    tooltip: tip,
  });
  const pct = (/** @type {string} */ key, /** @type {string} */ label) => ({
    id: `transform.${key}`,
    label,
    group: 'Transform',
    type: 'float',
    min: -1000,
    max: 1000,
    step: 1,
    default: 100,
    unit: '%',
    tooltip: 'Negative = mirrored',
  });
  return defineSchema([
    {
      id: 'transform.parent',
      label: 'Parent',
      group: 'Transform',
      type: 'enum',
      options: [
        { value: NONE, label: 'None' },
        ...parentCandidates(state, id)
          .reverse()
          .map((l) => ({ value: l.id, label: l.label })),
      ],
      default: NONE,
      tooltip: 'Follow another layer (stays in place when you pick it)',
    },
    px('x', 'Position X', 'Where the anchor point sits'),
    px('y', 'Position Y', 'Where the anchor point sits'),
    {
      id: 'transform.linked',
      label: 'Uniform scale',
      group: 'Transform',
      type: 'bool',
      default: true,
      tooltip: 'Scale X and Y together',
    },
    pct('scaleX', 'Scale X'),
    pct('scaleY', 'Scale Y'),
    {
      id: 'transform.rotation',
      label: 'Rotation',
      group: 'Transform',
      type: 'float',
      min: -3600,
      max: 3600,
      step: 0.5,
      default: 0,
      unit: '°',
      tooltip: 'Clockwise, around the anchor point',
    },
    px('anchorX', 'Anchor X', 'Point the layer rotates and scales around (in the layer)'),
    px('anchorY', 'Anchor Y', 'Point the layer rotates and scales around (in the layer)'),
  ]);
}

/**
 * Inspector values for a layer.
 * @param {import('../../effects/explosion/explosion.js').EditorLayer} l @param {boolean} linked
 */
export function transformValues(l, linked) {
  const t = { ...IDENTITY_TRANSFORM, ...l.transform };
  const r = (/** @type {number} */ v) => Math.round(v * 100) / 100;
  return {
    'transform.parent': l.parent ?? NONE,
    'transform.x': r(t.x),
    'transform.y': r(t.y),
    'transform.linked': linked,
    'transform.scaleX': r(t.scaleX),
    'transform.scaleY': r(t.scaleY),
    'transform.rotation': r(t.rotation),
    'transform.anchorX': r(t.anchorX),
    'transform.anchorY': r(t.anchorY),
  };
}

/**
 * A transform field change → new transform (Parent and Uniform are handled by the caller).
 * Linked scale keeps the X : Y ratio.
 * @param {import('../../core/transform2d.js').LayerTransform} t
 * @param {string} id @param {number} value @param {boolean} linked
 * @returns {import('../../core/transform2d.js').LayerTransform}
 */
export function transformPatch(t, id, value, linked) {
  const key = id.replace('transform.', '');
  if (linked && (key === 'scaleX' || key === 'scaleY')) {
    const other = key === 'scaleX' ? 'scaleY' : 'scaleX';
    const ratio = t[key] !== 0 ? t[other] / t[key] : 1;
    return { ...t, [key]: value, [other]: value * ratio };
  }
  return { ...t, [key]: value };
}
