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
          params: { ...blobDefaults, 'single.x': 30, 'fill.color': '#3d9bff' },
        },
      ],
    },
    seed: 3,
  },
];
