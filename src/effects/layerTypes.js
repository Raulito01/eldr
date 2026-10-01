// @ts-check
/**
 * Registry of layer types available to effects. Each entry is element + shape + style
 * (shared style/shading/outline from src/render).
 */

import { BURST_PARAMS, burstInstances, readBurstParams } from '../elements/burst.js';
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
import {
  readStreakParams,
  STREAK_PARAMS,
  streakPoints,
  stretchedLength,
} from '../shapes/streak.js';
import { tracePolygon, traceSmoothClosed } from '../shapes/trace.js';

/** Elements: how many instances exist this frame, where, how big, how old. */
const ELEMENTS = {
  single: {
    params: SINGLE_PARAMS,
    /** @type {(params: Record<string, any>, frame: import('../render/renderer.js').LayerFrame) => any[]} */
    instances: (params, frame) => singleInstances(readSingleParams(params), frame.t, frame.seed),
  },
  burst: {
    params: BURST_PARAMS,
    /** @type {(params: Record<string, any>, frame: import('../render/renderer.js').LayerFrame) => any[]} */
    instances: (params, frame) => burstInstances(readBurstParams(params), frame.t, frame.seed),
  },
};

/**
 * A layer type = element (motion) + shape params + shared style, shading, outline.
 * @param {keyof typeof ELEMENTS} element
 * @param {any[]} shapeParams
 * @param {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} drawInstance
 * @param {Record<string, any>} [defaults] overrides for element/shape defaults (e.g. sparks align)
 */
function shapeLayer(element, shapeParams, drawInstance, defaults = {}) {
  const all = [
    ...shapeParams,
    ...STYLE_PARAMS,
    ...SHADE_PARAMS,
    ...OUTLINE_PARAMS,
    ...ELEMENTS[element].params,
  ];
  return createElementLayerType({
    schema: defineSchema(
      all.map((d) => (d.id in defaults ? { ...d, default: defaults[d.id] } : d)),
    ),
    instances: ELEMENTS[element].instances,
    drawInstance,
    postProcess: outlineLayer,
  });
}

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawBlob = (ctx, params, inst, frame) => {
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
};

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawPuff = (ctx, params, inst, frame) => {
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
};

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawStreak = (ctx, params, inst, frame) => {
  const shape = readStreakParams(params);
  const length = stretchedLength(
    shape.length,
    shape.stretch,
    /** @type {any} */ (inst).speedRatio ?? 1,
  );
  if (length <= 0.5) return;
  paintStyled(
    ctx,
    readStyle(params),
    {
      outline: streakPoints({ ...shape, length }),
      radius: shape.thickness / 2,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    tracePolygon,
    readShade(params),
  );
};

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawRing = (ctx, params, inst, frame) => {
  paintRing(ctx, readRingParams(params), readStyle(params), readShade(params), {
    age: inst.age,
    seed: inst.seed,
    t: frame.t,
    rotation: inst.rotation,
  });
};

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawDebris = (ctx, params, inst, frame) => {
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
};

// Single elements (one shape with life curves)
export const blobLayer = shapeLayer('single', BLOB_PARAMS, drawBlob);
export const puffLayer = shapeLayer('single', PUFF_PARAMS, drawPuff);
export const streakLayer = shapeLayer('single', STREAK_PARAMS, drawStreak);
export const ringLayer = shapeLayer('single', RING_PARAMS, drawRing);
export const debrisLayer = shapeLayer('single', DEBRIS_PARAMS, drawDebris);

// Bursts (many shapes flying out). Per-layer default overrides make each start sensible.
export const blobBurstLayer = shapeLayer('burst', BLOB_PARAMS, drawBlob, { 'blob.radius': 22 });
export const puffBurstLayer = shapeLayer('burst', PUFF_PARAMS, drawPuff, {
  'puff.radius': 30,
  'puff.count': 5,
  'burst.count': 8,
  'burst.speed': 140,
});
export const streakBurstLayer = shapeLayer('burst', STREAK_PARAMS, drawStreak, {
  'burst.alignToVelocity': true,
  'burst.count': 16,
  'burst.speed': 420,
  'streak.length': 36,
  'streak.thickness': 6,
});
export const debrisBurstLayer = shapeLayer('burst', DEBRIS_PARAMS, drawDebris, {
  'debris.size': 7,
  'burst.gravity': 500,
  'burst.drag': 1.5,
  'burst.speed': 320,
});

/** All effect layer types, by name. */
export const LAYER_TYPES = Object.freeze({
  blob: blobLayer,
  puff: puffLayer,
  streak: streakLayer,
  ring: ringLayer,
  debris: debrisLayer,
  blobBurst: blobBurstLayer,
  puffBurst: puffBurstLayer,
  streakBurst: streakBurstLayer,
  debrisBurst: debrisBurstLayer,
});

/** Display names for layer types (UI). */
export const LAYER_TYPE_LABELS = Object.freeze({
  blob: 'Blob',
  puff: 'Puff (smoke / fire ball)',
  streak: 'Streak (spark)',
  ring: 'Ring (shockwave)',
  debris: 'Debris (chunk)',
  puffBurst: 'Puff burst (fireball / smoke)',
  streakBurst: 'Streak burst (sparks)',
  debrisBurst: 'Debris burst',
  blobBurst: 'Blob burst',
});
