// @ts-check
/**
 * Registry of layer types available to effects. Each entry is element + shape + style.
 * Colour comes from the shared style system (src/render/style.js).
 */

import { createElementLayerType } from '../elements/elementLayer.js';
import { readSingleParams, SINGLE_PARAMS, singleInstances } from '../elements/single.js';
import { OUTLINE_PARAMS, outlineLayer } from '../render/outline.js';
import { readShade, SHADE_PARAMS } from '../render/shading.js';
import { paintStyled, readStyle, STYLE_PARAMS } from '../render/style.js';
import { defineSchema } from '../schema/schema.js';
import { BLOB_PARAMS, blobPoints, readBlobParams, traceSmoothClosed } from '../shapes/blob.js';

/** Single blob: one noise-edged circle animated by scale/opacity curves. */
export const blobLayer = createElementLayerType({
  schema: defineSchema([
    ...BLOB_PARAMS,
    ...STYLE_PARAMS,
    ...SHADE_PARAMS,
    ...OUTLINE_PARAMS,
    ...SINGLE_PARAMS,
  ]),
  postProcess: outlineLayer,
  instances: (params, frame) => singleInstances(readSingleParams(params), frame.t, frame.seed),
  drawInstance(ctx, params, inst, frame) {
    const shape = readBlobParams(params);
    const outline = blobPoints(shape, inst.seed, frame.t);
    paintStyled(
      ctx,
      readStyle(params),
      {
        outline,
        radius: shape.radius,
        age: inst.age,
        seed: inst.seed,
        t: frame.t,
        rotation: inst.rotation,
      },
      traceSmoothClosed,
      readShade(params),
    );
  },
});

/** All effect layer types, by name. */
export const LAYER_TYPES = Object.freeze({
  blob: blobLayer,
});
