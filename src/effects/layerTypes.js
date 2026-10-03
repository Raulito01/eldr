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
import {
  applySurface,
  drawFractalLayer,
  FRACTAL_LAYER_PARAMS,
  SURFACE_PARAMS,
} from '../render/fractalNoise.js';
import { GLOW_PARAMS, readGlow } from '../render/glow.js';
import { applyGoo, GOO_PARAMS } from '../render/goo.js';
import { applyGradientMap, GRADIENT_MAP_PARAMS } from '../render/gradientMap.js';
import { OUTLINE_PARAMS, outlineLayer } from '../render/outline.js';
import { rampPreset } from '../render/rampPresets.js';
import { readShade, SHADE_PARAMS } from '../render/shading.js';
import { corePosition, paintStyled, readStyle, STYLE_PARAMS, shiftStyle } from '../render/style.js';
import {
  drawImageLayer,
  drawTexture,
  IMAGE_PARAMS,
  TEXTURE_PARAMS,
} from '../render/textureSprite.js';
import { defineSchema } from '../schema/schema.js';
import { BLOB_PARAMS, blobPoints, readBlobParams } from '../shapes/blob.js';
import { BOLT_PARAMS, paintBolt, readBoltParams } from '../shapes/bolt.js';
import { CEL_FLAME_PARAMS, drawCelFlame } from '../shapes/celFlame.js';
import { CEL_SMOKE_PARAMS, drawCelSmoke } from '../shapes/celSmoke.js';
import { CRESCENT_PARAMS, paintCrescent, readCrescentParams } from '../shapes/crescent.js';
import { DEBRIS_PARAMS, debrisPoints, readDebrisParams } from '../shapes/debris.js';
import { FIELD_PARAMS, paintField, readFieldParams } from '../shapes/field.js';
import {
  BUBBLE_PARAMS,
  LIQUID_PARAMS,
  paintBubble,
  paintLiquid,
  readBubbleParams,
  readLiquidParams,
} from '../shapes/liquid.js';
import { drawRibbon, RIBBON_PARAMS } from '../shapes/liquidRibbon.js';
import { drawStream, STREAM_PARAMS } from '../shapes/liquidStream.js';
import { ORB_PARAMS, paintOrb, readOrbParams } from '../shapes/orb.js';
import { PUFF_PARAMS, puffParts, readPuffParams } from '../shapes/puff.js';
import { paintRing, RING_PARAMS, readRingParams } from '../shapes/ring.js';
import { paintRipple, RIPPLE_PARAMS, readRippleParams } from '../shapes/ripple.js';
import { readSparkleParams, SPARKLE_PARAMS, sparklePoints } from '../shapes/sparkle.js';
import {
  readStreakParams,
  STREAK_PARAMS,
  streakPoints,
  stretchedLength,
} from '../shapes/streak.js';
import { tracePolygon, traceSmoothClosed } from '../shapes/trace.js';
import { DROP_PARAMS, drawDrop, drawJet, JET_PARAMS } from '../shapes/water.js';
import { COLUMN_PARAMS, CROWN_PARAMS, drawColumn, drawCrown } from '../shapes/waterSheet.js';
import { readWispParams, WISP_PARAMS, wispPoints } from '../shapes/wisp.js';
import { motionPath } from './followPath.js';

/**
 * Shared post-process: dissolve first, then outline (so the outline traces the pieces).
 * @type {import('../render/renderer.js').LayerType['postProcess']}
 */
const postProcess = (ctx, params, info) => {
  applyGoo(ctx, params, info); // shapes melt together first (D-078)
  applySurface(ctx, params, info); // animated fractal inside the shapes (D-104)
  dissolveLayer(ctx, params, info);
  outlineLayer(ctx, params, info);
};

/** Full size / full opacity over the whole life (layers that just stay). */
const WHOLE_LIFE = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];

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
        // "Along path": the emitter layer's own motion path (open pen path, or a shape set to
        // Path only — D-111)
        path: motionPath(frame.masks),
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
 * @param {{ noShade?: boolean, noTexture?: boolean }} [o] noShade: no cel shading controls
 *   (textures); noTexture: no image override (it IS a texture, or not a sprite: bolts, orbs)
 */
function shapeLayer(element, shapeParams, drawInstance, defaults = {}, o = {}) {
  // Any sprite can show an imported image / PNG sequence instead of its shape (D-074).
  const textured = !o.noTexture;
  const all = [
    ...shapeParams,
    ...(textured
      ? TEXTURE_PARAMS.map((d) => (d.id === 'tex.size' ? { ...d, default: 96 } : d))
      : []),
    ...STYLE_PARAMS,
    ...(o.noShade ? [] : SHADE_PARAMS),
    ...GOO_PARAMS,
    ...SURFACE_PARAMS,
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
    drawInstance: textured
      ? (ctx, params, inst, frame) =>
          params['tex.asset']
            ? drawTexture(ctx, params, inst, frame)
            : drawInstance(ctx, params, inst, frame)
      : drawInstance,
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
export const textureEmitterLayer = shapeLayer(
  'emitter',
  TEXTURE_PARAMS,
  drawTexture,
  { 'outline.mode': 'off', 'emit.randomRotation': 360 },
  { noShade: true, noTexture: true },
);

// ── Cel flame (D-090): the "bitten teardrop" cartoon fire ────────────────────────────────
const CEL_FLAME_LOOK = {
  'style.ramp': rampPreset('fire'),
  'outline.mode': 'off',
  'glow.amount': 0.4,
  'glow.radius': 20,
};
export const celFlameLayer = shapeLayer(
  'single',
  CEL_FLAME_PARAMS,
  drawCelFlame,
  {
    ...CEL_FLAME_LOOK,
    'single.scaleOverLife': WHOLE_LIFE,
    'single.opacityOverLife': WHOLE_LIFE,
    'style.rampOverLife': [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  },
  { noShade: true, noTexture: true },
);
export const celFlameEmitterLayer = shapeLayer(
  'emitter',
  CEL_FLAME_PARAMS,
  drawCelFlame,
  {
    ...CEL_FLAME_LOOK,
    'celflame.height': 70,
    'celflame.width': 34,
    'celflame.bites': 3,
    'emit.rate': 10,
    'emit.speed': 40,
    'emit.gravity': -60,
    'emit.life': 1.2,
    'style.rampOverLife': [
      { x: 0, y: 0 },
      { x: 1, y: 0.2 },
    ],
  },
  { noShade: true, noTexture: true },
);

// ── Cel smoke (D-092): round lumps in flat cel tones that break apart instead of fading ──
const CEL_SMOKE_LOOK = {
  'style.ramp': rampPreset('smoke'),
  'outline.mode': 'off',
  'style.rampOverLife': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
};
export const celSmokeLayer = shapeLayer(
  'single',
  CEL_SMOKE_PARAMS,
  drawCelSmoke,
  {
    ...CEL_SMOKE_LOOK,
    // each lump pops in and keeps growing on its own clock (D-093): the layer stays flat
    'single.scaleOverLife': WHOLE_LIFE,
    'single.opacityOverLife': WHOLE_LIFE,
  },
  { noShade: true, noTexture: true },
);
export const celSmokeEmitterLayer = shapeLayer(
  'emitter',
  CEL_SMOKE_PARAMS,
  drawCelSmoke,
  {
    ...CEL_SMOKE_LOOK,
    'cs.size': 26,
    'cs.lumps': 5,
    'cs.droplets': 2,
    // buoyant smoke (D-093): a push that dies out, then a slow rise; one shared wind
    'emit.rate': 4,
    'emit.speed': 150,
    'emit.drag': 1.6,
    'emit.gravity': -70,
    'emit.wind': 30,
    'emit.windSpeed': 0.4,
    'emit.life': 2,
    'emit.scaleOverLife': [
      { x: 0, y: 0.8 },
      { x: 0.4, y: 1.1 },
      { x: 1, y: 1.45 },
    ],
    'emit.opacityOverLife': WHOLE_LIFE,
  },
  { noShade: true, noTexture: true },
);

/** A one-shot burst of cel smoke puffs (D-100): explosions and impacts. */
export const celSmokeBurstLayer = shapeLayer(
  'burst',
  CEL_SMOKE_PARAMS,
  drawCelSmoke,
  {
    ...CEL_SMOKE_LOOK,
    'cs.size': 34,
    'cs.lumps': 5,
    'cs.droplets': 3,
    'cs.holeCount': 10,
    'cs.holeSize': 0.75,
    'cs.holeStart': 0.15,
    'burst.count': 8,
    'burst.speed': 320,
    'burst.speedVariance': 0.4,
    'burst.drag': 4,
    'burst.buoyancy': 60,
    'burst.life': 0.8,
    'burst.lifeVariance': 0.25,
    'burst.size': 1,
    'burst.sizeVariance': 0.35,
    'burst.randomRotation': 360,
    'burst.scaleOverLife': [
      { x: 0, y: 0.6 },
      { x: 0.3, y: 1 },
      { x: 1, y: 1.3 },
    ],
    'burst.opacityOverLife': WHOLE_LIFE,
  },
  { noShade: true, noTexture: true },
);

// ── Image / Sequence (D-089): your image or PNG sequence as a layer of its own ─────────────
const WHOLE = WHOLE_LIFE;
export const imageLayer = shapeLayer(
  'single',
  IMAGE_PARAMS,
  drawImageLayer,
  {
    'outline.mode': 'off',
    'single.scaleOverLife': WHOLE,
    'single.opacityOverLife': WHOLE,
    'style.rampOverLife': [
      { x: 0, y: 0.08 },
      { x: 1, y: 0.08 },
    ],
  },
  { noShade: true, noTexture: true },
);

// ── Lightning (D-070): bolts that re-strike ────────────────────────────────────────────────
const LIGHTNING_LOOK = {
  'style.ramp': rampPreset('electric'),
  'style.spread': 0.45,
  'outline.mode': 'off',
  'glow.amount': 0.9,
  'glow.radius': 18,
};
/** @param {boolean} followPath the layer's open pen path guides the bolt (not for particles) */
const drawBoltWith =
  (followPath) =>
  /** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
  (ctx, params, inst, frame) =>
    paintBolt(ctx, readBoltParams(params), instanceStyle(params, inst), {
      age: inst.age,
      seed: inst.seed,
      seconds: frame.seconds,
      timing: frame.timing,
      path: followPath ? motionPath(frame.masks) : null,
    });
export const boltLayer = shapeLayer(
  'single',
  BOLT_PARAMS,
  drawBoltWith(true),
  {
    ...LIGHTNING_LOOK,
    'single.scaleOverLife': [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    'single.opacityOverLife': [
      { x: 0, y: 1 },
      { x: 0.85, y: 1 },
      { x: 1, y: 0 },
    ],
  },
  { noShade: true, noTexture: true },
);
export const boltEmitterLayer = shapeLayer(
  'emitter',
  BOLT_PARAMS,
  drawBoltWith(false),
  {
    ...LIGHTNING_LOOK,
    'bolt.endY': 36,
    'bolt.width': 1.5,
    'bolt.branches': 1,
    'bolt.detail': 3,
    'bolt.restrike': 18,
    'emit.randomRotation': 360,
    'emit.speed': 40,
    'emit.life': 0.3,
  },
  { noShade: true, noTexture: true },
);

// ── Orb (D-073): a cel glass sphere (back + front parts) ───────────────────────────────────
export const orbLayer = shapeLayer(
  'single',
  ORB_PARAMS,
  (ctx, params, inst) => paintOrb(ctx, readOrbParams(params), instanceStyle(params, inst)),
  {
    'style.ramp': rampPreset('mana'),
    'outline.mode': 'off',
    'single.scaleOverLife': [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    'single.opacityOverLife': [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  },
  { noShade: true, noTexture: true },
);

// ── Water (D-076): anime-cel liquid, bubbles, ripples ───────────────────────────────────────
/** Cel water: white highlight → sky → blue → deep blue. */
export const WATER_CEL = [
  { pos: 0, color: '#ffffff' },
  { pos: 0.2, color: '#a8ecff' },
  { pos: 0.45, color: '#3fb4ff' },
  { pos: 0.7, color: '#1f6fe0' },
  { pos: 1, color: '#123c9a' },
];
const WATER_LOOK = {
  'style.ramp': WATER_CEL,
  'style.spread': 0.6,
  'outline.mode': 'outer',
  'outline.px': 2,
  'outline.colorMode': 'custom',
  'outline.color': '#0b1f5c',
};
const FLAT_LIFE = [
  { x: 0, y: 1 },
  { x: 1, y: 1 },
];
/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawLiquid = (ctx, params, inst, frame) =>
  paintLiquid(ctx, readLiquidParams(params), instanceStyle(params, inst), {
    age: inst.age,
    seed: inst.seed,
    t: frame.t,
    speedRatio: /** @type {any} */ (inst).speedRatio,
  });
/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawBubble = (ctx, params, inst, frame) =>
  paintBubble(ctx, readBubbleParams(params), instanceStyle(params, inst), {
    age: inst.age,
    seed: inst.seed,
    t: frame.t,
  });
export const liquidLayer = shapeLayer(
  'single',
  LIQUID_PARAMS,
  drawLiquid,
  { ...WATER_LOOK, 'single.scaleOverLife': FLAT_LIFE },
  { noShade: true },
);
export const liquidBurstLayer = shapeLayer(
  'burst',
  LIQUID_PARAMS,
  drawLiquid,
  {
    ...WATER_LOOK,
    'liquid.radius': 12,
    'liquid.pockets': 1,
    'liquid.stretch': 0.8,
    'burst.alignToVelocity': true,
    'burst.count': 18,
    'burst.speed': 520,
    'burst.gravity': 1400,
    'burst.drag': 1,
  },
  { noShade: true },
);
export const liquidEmitterLayer = shapeLayer(
  'emitter',
  LIQUID_PARAMS,
  drawLiquid,
  {
    ...WATER_LOOK,
    'liquid.radius': 7,
    'liquid.pockets': 1,
    'liquid.stretch': 0.8,
    'emit.alignToVelocity': true,
    'emit.gravity': 900,
    'emit.speed': 380,
    'emit.drag': 0.3,
  },
  { noShade: true },
);
export const bubbleEmitterLayer = shapeLayer(
  'emitter',
  BUBBLE_PARAMS,
  drawBubble,
  {
    ...WATER_LOOK,
    'outline.px': 1,
    'emit.gravity': -120,
    'emit.speed': 30,
    'emit.turbulence': 20,
    'emit.cone': 30,
  },
  { noShade: true },
);
export const rippleLayer = shapeLayer(
  'single',
  RIPPLE_PARAMS,
  (ctx, params, inst) =>
    paintRipple(ctx, readRippleParams(params), instanceStyle(params, inst), inst),
  {
    ...WATER_LOOK,
    'outline.mode': 'off',
    'single.scaleOverLife': FLAT_LIFE,
    'single.opacityOverLife': FLAT_LIFE,
  },
  { noShade: true, noTexture: true },
);
/** Ripples as particles (D-101): rain hitting a surface, many small impacts. */
export const rippleEmitterLayer = shapeLayer(
  'emitter',
  RIPPLE_PARAMS,
  (ctx, params, inst) =>
    paintRipple(ctx, readRippleParams(params), instanceStyle(params, inst), inst),
  {
    ...WATER_LOOK,
    'outline.mode': 'off',
    'ripple.radius': 30,
    'ripple.count': 1,
    'ripple.thickness': 0.2,
    'ripple.ease': 0.8,
    'ripple.flatten': 0.3,
    'emit.shape': 'line',
    'emit.width': 400,
    'emit.rate': 20,
    'emit.speed': 0,
    'emit.gravity': 0,
    'emit.life': 0.5,
    'emit.randomRotation': 0,
    'emit.scaleOverLife': FLAT_LIFE,
    'emit.opacityOverLife': FLAT_LIFE,
  },
  { noShade: true, noTexture: true },
);

// ── Smoke wisps (D-081): thin curling ribbons of smoke / steam ──────────────────────────────
const SMOKE_LOOK = {
  'style.ramp': rampPreset('smoke'),
  'style.bands': 3,
  'outline.mode': 'off',
  'shade.highlight': 0.3,
};
/** @type {import('../elements/elementLayer.js').ElementLayerSpec['drawInstance']} */
const drawWisp = (ctx, params, inst, frame) => {
  const p = readWispParams(params);
  paintStyled(
    ctx,
    instanceStyle(params, inst),
    {
      outline: wispPoints(p, inst.seed, frame.seconds),
      radius: Math.max(p.width, p.length / 4),
      age: inst.age,
      seed: inst.seed,
      t: frame.t,
      rotation: inst.rotation,
    },
    traceSmoothClosed,
    readShade(params),
  );
};
export const wispLayer = shapeLayer('single', WISP_PARAMS, drawWisp, {
  ...SMOKE_LOOK,
  'single.scaleOverLife': [
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ],
});
export const wispEmitterLayer = shapeLayer('emitter', WISP_PARAMS, drawWisp, {
  ...SMOKE_LOOK,
  'wisp.length': 90,
  'wisp.width': 10,
  'emit.rate': 4,
  'emit.speed': 30,
  'emit.gravity': -40,
  'emit.cone': 20,
  'emit.life': 2,
});

// ── Water drops and jets (D-101): fluid that keeps its volume, stretches with speed, pinches ──
/** Drops / jets: cel water, no outline by default (the references read without one). */
const DROP_LOOK = {
  'style.ramp': WATER_CEL,
  'outline.mode': 'off',
  'style.rampOverLife': [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ],
};
export const dropLayer = shapeLayer(
  'single',
  DROP_PARAMS,
  drawDrop,
  { ...DROP_LOOK, 'single.scaleOverLife': WHOLE_LIFE, 'single.opacityOverLife': WHOLE_LIFE },
  { noShade: true, noTexture: true },
);
export const dropEmitterLayer = shapeLayer(
  'emitter',
  DROP_PARAMS,
  drawDrop,
  {
    ...DROP_LOOK,
    'drop.size': 6,
    'emit.alignToVelocity': true,
    'emit.rate': 20,
    'emit.speed': 500,
    'emit.gravity': 1400,
    'emit.drag': 0.2,
    'emit.life': 1,
    'emit.scaleOverLife': [
      { x: 0, y: 1 },
      { x: 0.8, y: 0.9 },
      { x: 1, y: 0 },
    ],
    'emit.opacityOverLife': WHOLE_LIFE,
  },
  { noShade: true, noTexture: true },
);
export const dropBurstLayer = shapeLayer(
  'burst',
  DROP_PARAMS,
  drawDrop,
  {
    ...DROP_LOOK,
    'drop.size': 7,
    'burst.alignToVelocity': true,
    'burst.count': 16,
    'burst.speed': 700,
    'burst.speedVariance': 0.5,
    'burst.drag': 0.3,
    'burst.gravity': 1800,
    'burst.life': 0.8,
    'burst.scaleOverLife': [
      { x: 0, y: 1 },
      { x: 0.8, y: 0.85 },
      { x: 1, y: 0 },
    ],
    'burst.opacityOverLife': WHOLE_LIFE,
  },
  { noShade: true, noTexture: true },
);
export const crownLayer = shapeLayer(
  'single',
  CROWN_PARAMS,
  drawCrown,
  { ...DROP_LOOK, 'single.scaleOverLife': WHOLE_LIFE, 'single.opacityOverLife': WHOLE_LIFE },
  { noShade: true, noTexture: true },
);
export const waterColumnLayer = shapeLayer(
  'single',
  COLUMN_PARAMS,
  drawColumn,
  { ...DROP_LOOK, 'single.scaleOverLife': WHOLE_LIFE, 'single.opacityOverLife': WHOLE_LIFE },
  { noShade: true, noTexture: true },
);
export const liquidJetLayer = shapeLayer(
  'single',
  JET_PARAMS,
  drawJet,
  { ...DROP_LOOK, 'single.scaleOverLife': WHOLE_LIFE, 'single.opacityOverLife': WHOLE_LIFE },
  { noShade: true, noTexture: true },
);
/** Liquid stream (D-105): a jet made of melted blobs of water, cel-shaded as one body. */
export const liquidStreamLayer = shapeLayer(
  'single',
  STREAM_PARAMS,
  drawStream,
  { ...DROP_LOOK, 'single.scaleOverLife': WHOLE_LIFE, 'single.opacityOverLife': WHOLE_LIFE },
  { noShade: true, noTexture: true },
);
/** Liquid ribbon (D-108): a tube of water running along a path (built-in or your pen path). */
export const liquidRibbonLayer = shapeLayer(
  'single',
  RIBBON_PARAMS,
  drawRibbon,
  { ...DROP_LOOK, 'single.scaleOverLife': WHOLE_LIFE, 'single.opacityOverLife': WHOLE_LIFE },
  { noShade: true, noTexture: true },
);

/**
 * Fractal Noise (D-104): After Effects-style fractal noise — backgrounds, caustics, energy,
 * clouds, and a source for track mattes / dissolves. The pattern lives in the layer's space.
 * @type {import('../render/renderer.js').LayerType & { schema: any }}
 */
export const fractalNoiseLayer = {
  schema: defineSchema(FRACTAL_LAYER_PARAMS),
  render: (ctx, params, frame) => drawFractalLayer(ctx, params, frame),
};

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
 * Goo adjustment layer (D-078): everything BELOW it melts together where it comes close —
 * Raul's After Effects recipe (Fast Box Blur + Matte Choker) on one layer.
 * @type {import('../render/renderer.js').LayerType & { schema: any, adjustment: true }}
 */
export const gooAdjustLayer = {
  schema: defineSchema(GOO_PARAMS.map((d) => (d.id === 'goo.amount' ? { ...d, default: 14 } : d))),
  adjustment: true,
  render() {},
  adjust: (ctx, params, info) => applyGoo(ctx, params, info),
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
  goo: gooAdjustLayer,
  fractalNoise: fractalNoiseLayer,
  wisp: wispLayer,
  wispEmitter: wispEmitterLayer,
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
  image: imageLayer,
  celFlame: celFlameLayer,
  celFlameEmitter: celFlameEmitterLayer,
  celSmoke: celSmokeLayer,
  celSmokeEmitter: celSmokeEmitterLayer,
  celSmokeBurst: celSmokeBurstLayer,
  rippleEmitter: rippleEmitterLayer,
  drop: dropLayer,
  dropEmitter: dropEmitterLayer,
  dropBurst: dropBurstLayer,
  liquidJet: liquidJetLayer,
  liquidStream: liquidStreamLayer,
  liquidRibbon: liquidRibbonLayer,
  crown: crownLayer,
  waterColumn: waterColumnLayer,
  bolt: boltLayer,
  orb: orbLayer,
  liquid: liquidLayer,
  liquidBurst: liquidBurstLayer,
  liquidEmitter: liquidEmitterLayer,
  bubbleEmitter: bubbleEmitterLayer,
  ripple: rippleLayer,
  boltEmitter: boltEmitterLayer,
});

/** Layer types that are particle emitters (they get `matrixAt` from the build). */
export const isEmitterType = (/** @type {string} */ type) => type.endsWith('Emitter');

/** Display names for layer types (UI). */
export const LAYER_TYPE_LABELS = Object.freeze({
  image: 'Image / Sequence (your PNG or hand-drawn animation)',
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
  goo: 'Goo (adjustment: melts layers below together)',
  fractalNoise: 'Fractal Noise (backgrounds, caustics, energy, mattes)',
  wisp: 'Smoke wisp',
  celFlame: 'Cel flame (bitten teardrop)',
  celFlameEmitter: 'Particles · Cel flames',
  celSmoke: 'Cel smoke (puff / column / bank / mushroom)',
  celSmokeEmitter: 'Particles · Cel smoke puffs',
  celSmokeBurst: 'Burst · Cel smoke puffs (one-shot)',
  wispEmitter: 'Particles · Wisps (steam, smoke trails)',
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
  boltEmitter: 'Particles · Crackles (tiny bolts)',
  bolt: 'Lightning bolt',
  orb: 'Orb (glass sphere)',
  liquid: 'Liquid (water / goo mass)',
  liquidBurst: 'Liquid burst (splash drops)',
  liquidEmitter: 'Particles · Droplets',
  bubbleEmitter: 'Particles · Bubbles',
  ripple: 'Ripples (water rings)',
  rippleEmitter: 'Particles · Ripples (rain on water)',
  drop: 'Water drop',
  dropEmitter: 'Particles · Water drops',
  dropBurst: 'Burst · Water drops (splash)',
  liquidJet: 'Liquid jet (old: one shape — use Liquid stream)',
  liquidStream: 'Liquid stream (jet of melted water blobs: rises, pinches into drops)',
  liquidRibbon: 'Liquid ribbon (a tube of water along a path: slash, “2”, your pen path)',
  crown: 'Splash crown (water wall around an impact)',
  waterColumn: 'Water column (waterfall, geyser stream)',
});
