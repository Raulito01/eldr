// @ts-check
/**
 * Registry of layer types available to effects. Each entry is element + shape + style
 * (shared style/shading/outline from src/render).
 */

import { createElementLayerType } from '../elements/elementLayer.js';
import { readSingleParams, SINGLE_PARAMS, singleInstances } from '../elements/single.js';
import { OUTLINE_PARAMS, outlineLayer } from '../render/outline.js';
import { readShade, SHADE_PARAMS } from '../render/shading.js';
import { paintStyled, readStyle, STYLE_PARAMS } from '../render/style.js';
import { defineSchema } from '../schema/schema.js';
import { BLOB_PARAMS, blobPoints, readBlobParams } from '../shapes/blob.js';
import { DEBRIS_PARAMS, debrisPoints, readDebrisParams } from '../shapes/debris.js';
import { PUFF_PARAMS, puffParts, readPuffParams } from '../shapes/puff.js';
import { paintRing, RING_PARAMS, readRingParams } from '../shapes/ring.js';
import { readStreakParams, STREAK_PARAMS, streakPoints } from '../shapes/streak.js';
import { tracePolygon, traceSmoothClosed } from '../shapes/trace.js';

/**
 * A single-element layer type for a shape: shape params + shared style, shading, outline, life.
 * @param {any[]} shapeParams
 * @param {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} drawInstance
 */
function singleShapeLayer(shapeParams, drawInstance) {
  return createElementLayerType({
    schema: defineSchema([
      ...shapeParams,
      ...STYLE_PARAMS,
      ...SHADE_PARAMS,
      ...OUTLINE_PARAMS,
      ...SINGLE_PARAMS,
    ]),
    instances: (params, frame) => singleInstances(readSingleParams(params), frame.t, frame.seed),
    drawInstance,
    postProcess: outlineLayer,
  });
}

/** Single blob: one noise-edged circle animated by scale/opacity curves. */
export const blobLayer = singleShapeLayer(BLOB_PARAMS, (ctx, params, inst, frame) => {
  const shape = readBlobParams(params);
  paintStyled(
    ctx,
    readStyle(params),
    {
      outline: blobPoints(shape, inst.seed, frame.t),
      radius: shape.radius,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    traceSmoothClosed,
    readShade(params),
  );
});

/** Puff: cartoon smoke/fire ball made of overlapping blobs. */
export const puffLayer = singleShapeLayer(PUFF_PARAMS, (ctx, params, inst, frame) => {
  const shape = readPuffParams(params);
  paintStyled(
    ctx,
    readStyle(params),
    {
      parts: puffParts(shape, inst.seed, frame.t),
      radius: shape.radius,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    traceSmoothClosed,
    readShade(params),
  );
});

/** Streak: spark spindle pointing along the element's rotation. */
export const streakLayer = singleShapeLayer(STREAK_PARAMS, (ctx, params, inst, frame) => {
  const shape = readStreakParams(params);
  paintStyled(
    ctx,
    readStyle(params),
    {
      outline: streakPoints(shape),
      radius: shape.thickness / 2,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    tracePolygon,
    readShade(params),
  );
});

/** Ring: shockwave annulus, optionally broken into arcs. */
export const ringLayer = singleShapeLayer(RING_PARAMS, (ctx, params, inst, frame) => {
  paintRing(ctx, readRingParams(params), readStyle(params), readShade(params), {
    age: inst.age,
    seed: inst.seed,
    t: frame.t,
    rotation: inst.rotation,
  });
});

/** Debris: irregular chunk spinning over its life. */
export const debrisLayer = singleShapeLayer(DEBRIS_PARAMS, (ctx, params, inst, frame) => {
  const shape = readDebrisParams(params);
  const spin = (shape.spin * Math.PI * inst.age) / 180;
  ctx.rotate(spin);
  paintStyled(
    ctx,
    readStyle(params),
    {
      outline: debrisPoints(shape, inst.seed),
      radius: shape.size,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation + spin,
    },
    tracePolygon,
    readShade(params),
  );
});

/** All effect layer types, by name. */
export const LAYER_TYPES = Object.freeze({
  blob: blobLayer,
  puff: puffLayer,
  streak: streakLayer,
  ring: ringLayer,
  debris: debrisLayer,
});

/** Display names for layer types (UI). */
export const LAYER_TYPE_LABELS = Object.freeze({
  blob: 'Blob',
  puff: 'Puff (smoke / fire ball)',
  streak: 'Streak (spark)',
  ring: 'Ring (shockwave)',
  debris: 'Debris (chunk)',
});
