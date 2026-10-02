// @ts-check
/**
 * Registry of layer types available to effects. Each entry is element + shape + style
 * (shared style/shading/outline from src/render).
 */

import { evalCurve } from '../core/curve.js';
import { BURST_PARAMS, burstInstances, readBurstParams } from '../elements/burst.js';
import { createElementLayerType } from '../elements/elementLayer.js';
import { EMITTER_PARAMS, emitterInstances, readEmitterParams } from '../elements/emitter.js';
import {
  ORBIT_FOLLOW_PARAM,
  ORBIT_PARAMS,
  orbitHalfRanges,
  orbitInstances,
  orbitPlane,
  readOrbitParams,
} from '../elements/orbit.js';
import { readSingleParams, SINGLE_PARAMS, singleInstances } from '../elements/single.js';
import { DISSOLVE_PARAMS, dissolveLayer } from '../render/dissolve.js';
import { GLOW_PARAMS, readGlow } from '../render/glow.js';
import { applyGradientMap, GRADIENT_MAP_PARAMS } from '../render/gradientMap.js';
import { OUTLINE_PARAMS, outlineLayer } from '../render/outline.js';
import { sampleRamp } from '../render/ramp.js';
import { readShade, SHADE_PARAMS } from '../render/shading.js';
import { corePosition, paintStyled, readStyle, STYLE_PARAMS, shiftStyle } from '../render/style.js';
import { recoloured, sequenceFrame, textureFrames } from '../render/textures.js';
import { defineSchema } from '../schema/schema.js';
import { BLOB_PARAMS, blobPoints, readBlobParams } from '../shapes/blob.js';
import { CRESCENT_PARAMS, paintCrescent, readCrescentParams } from '../shapes/crescent.js';
import { DEBRIS_PARAMS, debrisPoints, readDebrisParams } from '../shapes/debris.js';
import { FIELD_PARAMS, paintField, readFieldParams } from '../shapes/field.js';
import { PUFF_PARAMS, puffParts, readPuffParams } from '../shapes/puff.js';
import { paintRing, RING_PARAMS, readRingParams } from '../shapes/ring.js';
import { readSparkleParams, SPARKLE_PARAMS, sparklePoints } from '../shapes/sparkle.js';
import {
  readStreakParams,
  STREAK_PARAMS,
  streakPoints,
  stretchedLength,
} from '../shapes/streak.js';
import { tracePolygon, traceSmoothClosed } from '../shapes/trace.js';

/**
 * Shared post-process: dissolve first, then outline (so the outline traces the pieces).
 * @type {import('../render/renderer.js').LayerType['postProcess']}
 */
const postProcess = (ctx, params, info) => {
  dissolveLayer(ctx, params, info);
  outlineLayer(ctx, params, info);
};

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
  emitter: {
    params: EMITTER_PARAMS,
    /** @type {(params: Record<string, any>, frame: import('../render/renderer.js').LayerFrame) => any[]} */
    instances: (params, frame) =>
      emitterInstances(readEmitterParams(params), {
        seconds: frame.seconds,
        seed: frame.seed,
        timing: frame.timing,
        matrix: frame.matrix,
        matrixAt: frame.matrixAt,
        // "Along path": the emitter layer's own first OPEN pen path
        path: frame.masks?.find((m) => m.shape === 'path' && m.closed === false) ?? null,
      }),
  },
  orbit: {
    params: ORBIT_PARAMS,
    /** @type {(params: Record<string, any>, frame: import('../render/renderer.js').LayerFrame) => any[]} */
    instances: (params, frame) =>
      orbitInstances(readOrbitParams(params), frame.t, frame.seconds, frame.seed),
  },
};

/**
 * Style of an instance: orbit instances on the far side sit further along the ramp.
 * @param {Record<string, any>} params @param {any} inst
 */
const instanceStyle = (params, inst) => shiftStyle(readStyle(params), inst.rampShift ?? 0);

/**
 * A layer type = element (motion) + shape params + shared style, shading, outline.
 * @param {keyof typeof ELEMENTS} element
 * @param {any[]} shapeParams
 * @param {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} drawInstance
 * @param {Record<string, any>} [defaults] overrides for element/shape defaults (e.g. sparks align)
 * @param {{ noShade?: boolean }} [o] noShade: no cel shading controls (textures)
 */
function shapeLayer(element, shapeParams, drawInstance, defaults = {}, o = {}) {
  const all = [
    ...shapeParams,
    ...STYLE_PARAMS,
    ...(o.noShade ? [] : SHADE_PARAMS),
    ...OUTLINE_PARAMS,
    ...DISSOLVE_PARAMS,
    ...GLOW_PARAMS,
    ...ELEMENTS[element].params,
  ];
  return createElementLayerType({
    schema: defineSchema(
      all.map((d) => (d.id in defaults ? { ...d, default: defaults[d.id] } : d)),
    ),
    instances: ELEMENTS[element].instances,
    drawInstance,
    postProcess,
    glow: readGlow,
  });
}

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawBlob = (ctx, params, inst, frame) => {
  const shape = readBlobParams(params);
  paintStyled(
    ctx,
    instanceStyle(params, inst),
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
    instanceStyle(params, inst),
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
    instanceStyle(params, inst),
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

/**
 * Crescent riding its element (single: arc around the element's position; burst / orbit
 * stickers: arc midpoint on the element, head pointing along +x).
 * @param {'circle'|'arc'} anchor
 * @returns {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']}
 */
const drawCrescent = (anchor) => (ctx, params, inst, frame) => {
  paintCrescent(
    ctx,
    readCrescentParams(params),
    instanceStyle(params, inst),
    readShade(params),
    { age: inst.age, seed: inst.seed, t: frame.t, rotation: inst.rotation },
    { anchor },
  );
};

/**
 * Orbit crescents: either stickers riding the orbit, or ("follow path") swooshes bent along the
 * tilted orbit itself, cut at the depth boundary for the front/back halves.
 * @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']}
 */
const drawOrbitCrescent = (ctx, params, i, frame) => {
  const inst = /** @type {import('../elements/orbit.js').OrbitInstance} */ (i);
  if (!inst.followPath) return drawCrescent('arc')(ctx, params, inst, frame);
  const o = readOrbitParams(params);
  const shape = readCrescentParams(params);
  const plane = orbitPlane(o);
  const R = inst.orbitRadius;
  const base = {
    mid: inst.orbitAngle - Math.PI / 2,
    radius: R,
    dir: inst.speedSign,
    anchor: /** @type {const} */ ('circle'),
    widthScale: inst.baseSize,
    widthAt: (/** @type {number} */ _x, /** @type {number} */ y) =>
      1 + o.depthScale * plane.depth(y, R),
    project: plane.project,
  };
  const inst2 = { age: inst.age, seed: inst.seed, t: frame.t, rotation: 0 };
  let ranges = /** @type {[number, number][]} */ ([[0, 1]]);
  if (o.show !== 'all') {
    // Depth along the centreline decides which half each part of the swoosh is in.
    const sweep = (shape.sweep * Math.PI) / 180;
    const dir = inst.speedSign * (shape.reverse ? -1 : 1);
    const tail = base.mid - (dir * sweep) / 2;
    const revealed = Math.min(1, Math.max(0, evalCurve(shape.reveal, inst.age)));
    ranges = orbitHalfRanges(
      (v) => plane.depth(Math.sin(tail + dir * sweep * revealed * v) * R, R),
      o.show,
    );
  }
  paintCrescent(ctx, shape, instanceStyle(params, inst), readShade(params), inst2, {
    ...base,
    ranges,
  });
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
    instanceStyle(params, inst),
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

/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawSparkle = (ctx, params, inst, frame) => {
  const shape = readSparkleParams(params);
  paintStyled(
    ctx,
    instanceStyle(params, inst),
    {
      outline: sparklePoints(shape),
      radius: shape.size,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    tracePolygon,
    readShade(params),
  );
};

/** Crescent swooshes: hot leading (outer) edge, sharp tips, no shadow. A first pass [Raul]. */
const CRESCENT_LOOK = {
  'style.ramp': [
    { pos: 0, color: '#ffffff' },
    { pos: 0.3, color: '#bfe9ff' },
    { pos: 0.65, color: '#4f8dff' },
    { pos: 1, color: '#2b2f8f' },
  ],
  'style.rampOverLife': [
    { x: 0, y: 0 },
    { x: 1, y: 0.2 },
  ],
  'style.spread': 0.6,
  'style.bands': 3,
  'shade.shadow': 0,
  'crescent.hotEdge': 0.5,
  'glow.amount': 0.6,
  'glow.radius': 14,
};

/** Sparkles start bright, unshaded and glowing (a light, not an object). */
const SPARKLE_LOOK = {
  'style.ramp': [
    { pos: 0, color: '#ffffff' },
    { pos: 0.5, color: '#fff1c4' },
    { pos: 1, color: '#ffb35c' },
  ],
  'style.bands': 2,
  'style.spread': 0.6,
  'shade.shadow': 0,
  'glow.amount': 1,
  'glow.radius': 10,
};

/** Style params that apply to field layers (no outline-based core→edge, shading or band wobble). */
const FIELD_STYLE_IDS = new Set([
  'style.ramp',
  'style.rampOverLife',
  'style.bands',
  'style.snapColors',
]);

/**
 * A field layer (step 3.4b): per-pixel noise-field shape + colour bands, outline, glow.
 * @param {Record<string, any>} defaults
 */
function fieldLayer(defaults) {
  const all = [
    ...FIELD_PARAMS,
    ...STYLE_PARAMS.filter((d) => FIELD_STYLE_IDS.has(d.id)),
    ...OUTLINE_PARAMS,
    ...DISSOLVE_PARAMS,
    ...GLOW_PARAMS,
    ...ELEMENTS.single.params,
  ];
  return createElementLayerType({
    schema: defineSchema(
      all.map((d) => (d.id in defaults ? { ...d, default: defaults[d.id] } : d)),
    ),
    instances: ELEMENTS.single.instances,
    drawInstance(ctx, params, inst, frame) {
      const s = readStyle(params);
      paintField(
        ctx,
        readFieldParams(params),
        { ramp: s.ramp, bands: s.bands, snap: s.snapColors, shift: corePosition(s, inst.age) },
        { seed: inst.seed, age: inst.age, seconds: frame.seconds },
      );
    },
    postProcess,
    glow: readGlow,
  });
}

/** Field flames hold their colour over the effect; a whole-effect life with no fade. */
const FIELD_DEFAULTS = {
  'style.bands': 5,
  'style.rampOverLife': [
    { x: 0, y: 0 },
    { x: 1, y: 0.15 },
  ],
  'single.scaleOverLife': [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
  'single.opacityOverLife': [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
};

/** Field fire (flame or fireball). */
export const fieldFireLayer = fieldLayer(FIELD_DEFAULTS);

// Single elements (one shape with life curves)
export const blobLayer = shapeLayer('single', BLOB_PARAMS, drawBlob);
export const puffLayer = shapeLayer('single', PUFF_PARAMS, drawPuff);
export const streakLayer = shapeLayer('single', STREAK_PARAMS, drawStreak);
export const ringLayer = shapeLayer('single', RING_PARAMS, drawRing);
export const debrisLayer = shapeLayer('single', DEBRIS_PARAMS, drawDebris);
export const sparkleLayer = shapeLayer('single', SPARKLE_PARAMS, drawSparkle, SPARKLE_LOOK);

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

/** Twinkles: sparkles popping up around the area, each growing in and shrinking out. */
export const sparkleBurstLayer = shapeLayer('burst', SPARKLE_PARAMS, drawSparkle, {
  ...SPARKLE_LOOK,
  'sparkle.size': 24,
  'burst.count': 16,
  'burst.window': 0.85,
  'burst.spawnRadius': 150,
  'burst.speed': 20,
  'burst.speedVariance': 1,
  'burst.life': 0.22,
  'burst.randomRotation': 0,
  'burst.scaleOverLife': [
    { x: 0, y: 0 },
    { x: 0.35, y: 1 },
    { x: 1, y: 0 },
  ],
  'burst.opacityOverLife': [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
});

// Crescents (swooshes, slash arcs)
export const crescentLayer = shapeLayer('single', CRESCENT_PARAMS, drawCrescent('circle'), {
  ...CRESCENT_LOOK,
  'single.scaleOverLife': [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
});
export const crescentBurstLayer = shapeLayer('burst', CRESCENT_PARAMS, drawCrescent('arc'), {
  ...CRESCENT_LOOK,
  'crescent.radius': 40,
  'crescent.sweep': 100,
  'crescent.thickness': 12,
  'burst.alignToVelocity': true,
  'burst.count': 8,
  'burst.speed': 260,
});

// Orbits (elements circling a centre, optionally in perspective)
export const orbitCrescentLayer = shapeLayer(
  'orbit',
  [...CRESCENT_PARAMS, ORBIT_FOLLOW_PARAM],
  drawOrbitCrescent,
  { ...CRESCENT_LOOK, 'crescent.sweep': 100, 'crescent.thickness': 18, 'orbit.alignToPath': true },
);
export const orbitSparkleLayer = shapeLayer('orbit', SPARKLE_PARAMS, drawSparkle, {
  ...SPARKLE_LOOK,
  'sparkle.size': 14,
  'orbit.count': 6,
});

/** Soft dot particle (4.Pb): a round cel-banded disc; with glow it reads as dust / fireflies. */
const DOT_PARAMS = [
  {
    id: 'dot.radius',
    label: 'Radius',
    group: 'Shape',
    type: 'float',
    min: 0.5,
    max: 200,
    step: 0.5,
    default: 6,
    unit: 'px',
  },
];
const DOT_CIRCLE = Array.from({ length: 40 }, (_, i) => {
  const a = (Math.floor(i / 2) / 20) * Math.PI * 2;
  return i % 2 ? Math.sin(a) : Math.cos(a);
});
/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawDot = (ctx, params, inst, frame) => {
  const r = params['dot.radius'];
  paintStyled(
    ctx,
    instanceStyle(params, inst),
    {
      outline: Float64Array.from(DOT_CIRCLE, (v) => v * r),
      radius: r,
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    traceSmoothClosed,
    readShade(params),
  );
};

/** Particle look defaults shared by the emitters. */
const EMBER_LOOK = {
  'style.ramp': [
    { pos: 0, color: '#ffffff' },
    { pos: 0.3, color: '#ffe066' },
    { pos: 0.65, color: '#ff8a2a' },
    { pos: 1, color: '#c7281e' },
  ],
  'outline.mode': 'off',
  'shade.shadow': 0,
  'shade.highlight': 0,
};

// ── Particle emitters (4.Pb): every shape as a particle ─────────────────────────────────────
export const dotEmitterLayer = shapeLayer('emitter', DOT_PARAMS, drawDot, {
  ...EMBER_LOOK,
  'glow.amount': 0.8,
});
export const sparkEmitterLayer = shapeLayer('emitter', STREAK_PARAMS, drawStreak, {
  ...EMBER_LOOK,
  'emit.alignToVelocity': true,
});
export const sparkleEmitterLayer = shapeLayer('emitter', SPARKLE_PARAMS, drawSparkle, {
  ...SPARKLE_LOOK,
  'emit.flicker': 0.5,
});
export const puffEmitterLayer = shapeLayer('emitter', PUFF_PARAMS, drawPuff, {
  'emit.rate': 8,
  'emit.gravity': -120,
  'emit.speed': 40,
});
export const blobEmitterLayer = shapeLayer('emitter', BLOB_PARAMS, drawBlob, {});
export const debrisEmitterLayer = shapeLayer('emitter', DEBRIS_PARAMS, drawDebris, {
  'emit.gravity': 600,
  'emit.spin': 360,
  'emit.randomRotation': 360,
});
export const crescentEmitterLayer = shapeLayer('emitter', CRESCENT_PARAMS, drawCrescent('arc'), {
  ...CRESCENT_LOOK,
  'emit.alignToVelocity': true,
});

// ── Texture particles (4.Pb2): your own image / PNG sequence ──────────────────────────────
const TEXTURE_PARAMS = [
  {
    id: 'tex.size',
    label: 'Texture size',
    group: 'Texture',
    type: 'float',
    min: 1,
    max: 1024,
    step: 1,
    default: 48,
    unit: 'px',
    tooltip: 'Longest side of the texture at particle size 1',
  },
  {
    id: 'tex.play',
    label: 'Sequence',
    group: 'Texture',
    type: 'enum',
    options: [
      { value: 'loop', label: 'Loop at fps' },
      { value: 'once', label: 'Play once, hold last frame' },
      { value: 'life', label: 'Stretch over the particle’s life' },
      { value: 'random', label: 'Random still frame' },
    ],
    default: 'loop',
    tooltip: 'How a PNG sequence plays on each particle (a single image ignores this)',
  },
  {
    id: 'tex.fps',
    label: 'Sequence fps',
    group: 'Texture',
    type: 'float',
    min: 1,
    max: 60,
    step: 1,
    default: 24,
  },
  {
    id: 'tex.randomStart',
    label: 'Random start frame',
    group: 'Texture',
    type: 'bool',
    default: true,
    tooltip: 'Each particle starts the loop at a different frame',
  },
  {
    id: 'tex.color',
    label: 'Colour',
    group: 'Texture',
    type: 'enum',
    options: [
      { value: 'original', label: 'Original colours' },
      { value: 'tint', label: 'Tint by the ramp (over life)' },
      { value: 'ramp', label: 'Brightness → ramp (gradient map)' },
    ],
    default: 'original',
  },
  {
    id: 'tex.angle',
    label: 'Texture angle',
    group: 'Texture',
    type: 'float',
    min: -180,
    max: 180,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: 'Turns the image on each particle (e.g. so a streak points along its motion)',
  },
];
/** @type {WeakMap<object, string>} */
const rampKeys = new WeakMap();
const rampKeyOf = (/** @type {any[]} */ ramp) => {
  let k = rampKeys.get(ramp);
  if (!k) {
    k = JSON.stringify(ramp);
    rampKeys.set(ramp, k);
  }
  return k;
};
/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawTexture = (ctx, params, inst) => {
  const style = instanceStyle(params, inst);
  const pos = corePosition(style, inst.age);
  const id = params['tex.asset'];
  const frames = id ? textureFrames(id) : null;
  if (!frames?.length) {
    // no texture (yet): a soft round sprite, so the layer shows something
    const r = params['tex.size'] / 2;
    const [cr, cg, cb] = sampleRamp(style.ramp, pos);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, `rgba(${cr},${cg},${cb},1)`);
    g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const index = sequenceFrame(
    params['tex.play'],
    frames.length,
    { ageS: inst.ageS ?? 0, age: inst.age ?? 0, seed: inst.seed ?? 0 },
    params['tex.fps'],
    params['tex.randomStart'],
  );
  const img = frames[index];
  const mode = params['tex.color'];
  const src =
    mode === 'tint' || mode === 'ramp'
      ? recoloured(
          id,
          index,
          img,
          mode,
          style.ramp,
          pos,
          style.spread,
          style.bands,
          rampKeyOf(style.ramp),
        )
      : img;
  const k = params['tex.size'] / Math.max(1, img.width, img.height);
  const w = img.width * k;
  const h = img.height * k;
  if (params['tex.angle']) ctx.rotate((params['tex.angle'] * Math.PI) / 180);
  ctx.drawImage(src, -w / 2, -h / 2, w, h);
};
export const textureEmitterLayer = shapeLayer(
  'emitter',
  TEXTURE_PARAMS,
  drawTexture,
  { 'outline.mode': 'off', 'emit.randomRotation': 360 },
  { noShade: true },
);

/**
 * Null (3.6b): an invisible layer that only carries a transform, for parenting / rigging.
 * @type {import('../render/renderer.js').LayerType & { schema: any }}
 */
export const nullLayer = { schema: defineSchema([]), render() {} };

/**
 * Gradient Map adjustment layer (3.8b): recolours everything below it by brightness.
 * @type {import('../render/renderer.js').LayerType & { schema: any, adjustment: true }}
 */
export const gradientMapLayer = {
  schema: GRADIENT_MAP_PARAMS,
  adjustment: true,
  render() {},
  adjust: (ctx, params, info) => applyGradientMap(ctx, params, info),
};

/**
 * Precomp (3.6e): a group of layers shown as one layer — its layers live in the state's `comps`
 * and are passed to the renderer as `children`. No params of its own.
 * @type {import('../render/renderer.js').LayerType & { schema: any, precomp: true }}
 */
export const precompLayer = { schema: defineSchema([]), precomp: true, render() {} };

/**
 * Path layer (4.Pa): holds pen paths (as masks) for Follow Path and "along path" emitters.
 * Never rendered.
 * @type {import('../render/renderer.js').LayerType & { schema: any, guide: true }}
 */
export const guideLayer = { schema: defineSchema([]), guide: true, render() {} };

/** Is this layer type an adjustment layer (no drawing, no handles)? @param {string} type */
export const isAdjustmentType = (type) => !!(/** @type {any} */ (LAYER_TYPES)[type]?.adjustment);

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
  sparkle: sparkleLayer,
  sparkleBurst: sparkleBurstLayer,
  fieldFire: fieldFireLayer,
  crescent: crescentLayer,
  crescentBurst: crescentBurstLayer,
  orbitCrescent: orbitCrescentLayer,
  orbitSparkle: orbitSparkleLayer,
  null: nullLayer,
  gradientMap: gradientMapLayer,
  precomp: precompLayer,
  guide: guideLayer,
  dotEmitter: dotEmitterLayer,
  sparkEmitter: sparkEmitterLayer,
  sparkleEmitter: sparkleEmitterLayer,
  puffEmitter: puffEmitterLayer,
  blobEmitter: blobEmitterLayer,
  debrisEmitter: debrisEmitterLayer,
  crescentEmitter: crescentEmitterLayer,
  textureEmitter: textureEmitterLayer,
});

/** Layer types that are particle emitters (they get `matrixAt` from the build). */
export const isEmitterType = (/** @type {string} */ type) => type.endsWith('Emitter');

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
  sparkle: 'Sparkle (twinkle star)',
  sparkleBurst: 'Sparkle burst (twinkles)',
  fieldFire: 'Field fire (swirling flame / fireball)',
  crescent: 'Crescent (swoosh / slash arc)',
  crescentBurst: 'Crescent burst',
  orbitCrescent: 'Orbit crescents (energy-orb swooshes)',
  orbitSparkle: 'Orbit sparkles',
  null: 'Null (transform only)',
  gradientMap: 'Gradient Map (adjustment: recolours layers below)',
  precomp: 'Precomp (group of layers)',
  guide: 'Path (motion paths, not rendered)',
  dotEmitter: 'Particles · Dots (dust, fireflies)',
  sparkEmitter: 'Particles · Sparks (streaks)',
  sparkleEmitter: 'Particles · Sparkles (twinkles)',
  puffEmitter: 'Particles · Smoke puffs',
  blobEmitter: 'Particles · Blobs',
  debrisEmitter: 'Particles · Debris',
  crescentEmitter: 'Particles · Swooshes',
  textureEmitter: 'Particles · Texture (your image / PNG sequence)',
});
