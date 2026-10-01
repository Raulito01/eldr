// @ts-check
/**
 * Registry of layer types available to effects. Each entry is element + shape + style.
 * Colour comes from the shared style system (src/render/style.js).
 */

import { createElementLayerType } from '../elements/elementLayer.js';
import { readSingleParams, SINGLE_PARAMS, singleInstances } from '../elements/single.js';
import { readStyle, STYLE_PARAMS, styleFill } from '../render/style.js';
import { defineSchema } from '../schema/schema.js';
import { BLOB_PARAMS, blobPoints, readBlobParams, traceSmoothClosed } from '../shapes/blob.js';

/** Single blob: one noise-edged circle animated by scale/opacity curves. */
export const blobLayer = createElementLayerType({
  schema: defineSchema([...BLOB_PARAMS, ...STYLE_PARAMS, ...SINGLE_PARAMS]),
  instances: (params, frame) => singleInstances(readSingleParams(params), frame.t, frame.seed),
  drawInstance(ctx, params, inst, frame) {
    const shape = readBlobParams(params);
    const pts = blobPoints(shape, inst.seed, frame.t);
    // Edge colour is reached at the blob's nominal outline (noise pushes parts beyond it).
    ctx.fillStyle = styleFill(ctx, readStyle(params), inst.age, shape.radius);
    ctx.beginPath();
    traceSmoothClosed(ctx, pts);
    ctx.fill();
  },
});

/** All effect layer types, by name. */
export const LAYER_TYPES = Object.freeze({
  blob: blobLayer,
});
