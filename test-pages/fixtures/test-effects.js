// @ts-check
// Effects used by the determinism check (unit tests + determinism.html). Grows with every
// new layer type and, from Phase 3, every preset.
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { DEBUG_LAYER_TYPES } from '../../src/render/debugLayers.js';
import { getDefaults, randomizeParams } from '../../src/schema/index.js';
import { makeDebugEffect } from '../debug-effect.js';

export const ALL_LAYER_TYPES = { ...DEBUG_LAYER_TYPES, ...LAYER_TYPES };

/** @param {Record<string, any>} params @param {Partial<import('../../src/core/timing.js').Timing>} [timing] */
const blobEffect = (params, timing = {}) => ({
  id: 'blob',
  timing: { frameCount: 24, fps: 24, loop: false, ...timing },
  layers: [{ id: 'blob', type: 'blob', params }],
});

const blobDefaults = getDefaults(LAYER_TYPES.blob.schema);

/** One-layer effect of any shape type with its defaults. @param {string} type @param {Record<string, any>} [over] */
const shapeEffect = (type, over = {}) => ({
  id: type,
  timing: { frameCount: 16, fps: 24, loop: false },
  layers: [
    {
      id: type,
      type,
      params: { ...getDefaults(LAYER_TYPES[type].schema), 'shade.highlight': 0.2, ...over },
    },
  ],
});

/** @type {{ name: string, effect: import('../../src/render/renderer.js').Effect, seed: number }[]} */
export const TEST_EFFECTS = [
  { name: 'Debug circles', effect: makeDebugEffect(), seed: 482913 },
  { name: 'Blob (defaults)', effect: blobEffect(blobDefaults), seed: 482913 },
  { name: 'Blob on twos', effect: blobEffect(blobDefaults, { holdMode: 'twos' }), seed: 7 },
  {
    name: 'Blob variant A',
    effect: blobEffect(randomizeParams(LAYER_TYPES.blob.schema, blobDefaults, 1)),
    seed: 101,
  },
  {
    name: 'Blob variant B (lobed, wobbly)',
    effect: blobEffect({
      ...blobDefaults,
      'blob.lobes': 5,
      'blob.lobeDepth': 0.25,
      'blob.wobble': 4,
    }),
    seed: 202,
  },
  {
    name: 'Blob, 5 snapped bands, noisy band edges',
    effect: blobEffect({
      ...blobDefaults,
      'style.bands': 5,
      'style.bandNoise': 0.8,
      'style.snapColors': true,
      'style.spread': 0.6,
    }),
    seed: 303,
  },
  {
    name: 'Blob, shading + highlight, rotated',
    effect: blobEffect({
      ...blobDefaults,
      'shade.shadow': 0.4,
      'shade.shadowOffset': 0.3,
      'shade.highlight': 0.3,
      'single.rotation': 40,
    }),
    seed: 404,
  },
  {
    name: 'Blob, outer + inner outline',
    effect: blobEffect({ ...blobDefaults, 'outline.mode': 'both', 'outline.px': 3 }),
    seed: 505,
  },
  { name: 'Puff (defaults + highlight)', effect: shapeEffect('puff'), seed: 11 },
  { name: 'Streak, rotated', effect: shapeEffect('streak', { 'single.rotation': 30 }), seed: 12 },
  { name: 'Ring, closed', effect: shapeEffect('ring'), seed: 13 },
  {
    name: 'Ring, 5 arcs, outlined',
    effect: shapeEffect('ring', { 'ring.breaks': 5, 'outline.mode': 'outer' }),
    seed: 14,
  },
  { name: 'Debris, spinning', effect: shapeEffect('debris', { 'debris.size': 30 }), seed: 15 },
  {
    name: 'Two blobs, add blend',
    effect: {
      id: 'two',
      timing: { frameCount: 16, fps: 24, loop: false },
      layers: [
        { id: 'a', type: 'blob', params: { ...blobDefaults, 'single.x': -30 } },
        {
          id: 'b',
          type: 'blob',
          blend: 'add',
          params: {
            ...blobDefaults,
            'single.x': 30,
            'style.ramp': [
              { pos: 0, color: '#e6f4ff' },
              { pos: 1, color: '#1f5fbf' },
            ],
          },
        },
      ],
    },
    seed: 3,
  },
];
