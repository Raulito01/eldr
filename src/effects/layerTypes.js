// @ts-check
/**
 * Registry of layer types available to effects. Each entry is element + shape + style.
 * Phase 2 replaces the flat fill with the style system (ramps, cel bands, shading, outline).
 */

import { createElementLayerType } from '../elements/elementLayer.js';
import { readSingleParams, SINGLE_PARAMS, singleInstances } from '../elements/single.js';
import { defineSchema } from '../schema/schema.js';
import { BLOB_PARAMS, blobPoints, readBlobParams, traceSmoothClosed } from '../shapes/blob.js';

/** Flat fill until the style system arrives (Phase 2). Default colour is provisional [Raul]. */
const FILL_PARAMS = [
  { id: 'fill.color', label: 'Colour', group: 'Colour', type: 'color', default: '#ff8a3d' },
];

/** Single blob: one noise-edged circle animated by scale/opacity curves. */
export const blobLayer = createElementLayerType({
  schema: defineSchema([...BLOB_PARAMS, ...SINGLE_PARAMS, ...FILL_PARAMS]),
  instances: (params, frame) => singleInstances(readSingleParams(params), frame.t, frame.seed),
  drawInstance(ctx, params, inst, frame) {
    const pts = blobPoints(readBlobParams(params), inst.seed, frame.t);
    ctx.fillStyle = params['fill.color'];
    ctx.beginPath();
    traceSmoothClosed(ctx, pts);
    ctx.fill();
  },
});

/** All effect layer types, by name. */
export const LAYER_TYPES = Object.freeze({
  blob: blobLayer,
});
