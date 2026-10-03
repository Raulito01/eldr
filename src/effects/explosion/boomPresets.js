// @ts-check
/**
 * Small Hit and Big Boom (D-114), rebuilt in the language of Raul's Anime Blast: add-blended
 * glowing cores on a keyed parent (null), rings that go thick → thin, cel shading, holes that
 * eat the smoke. Built on the base explosion stack with the normal editing operations, so the
 * presets open fully editable and carry no switched-off layers.
 */

import { rampPreset } from '../../render/rampPresets.js';
import { addLayer, setParent, updateLayer } from '../layerStack.js';
import { snapParams } from '../presetKit.js';
import { createExplosion } from './explosion.js';

const ramp = (/** @type {[number, string][]} */ stops) =>
  stops.map(([pos, color]) => ({ pos, color }));
const curve = (/** @type {[number, number][]} */ pts) => pts.map(([x, y]) => ({ x, y }));
const ease = (/** @type {[number, number][]} */ pts) =>
  pts.map(([t, v]) => ({ t, v, ease: 'ease' }));

/** @typedef {import('./explosion.js').ExplosionState} State */
/** @typedef {import('./explosion.js').EditorLayer} EditorLayer */

/**
 * Edit the base explosion stack: keep only the layers a preset uses, change them, add more.
 * @param {{ globals: Record<string, any>, frames: number, fps: number, keep: string[] }} o
 */
function stack(o) {
  const base = createExplosion();
  /** @type {State} */
  let s = {
    ...base,
    globals: { ...base.globals, ...o.globals },
    timing: {
      ...base.timing,
      frameCount: o.frames,
      fps: o.fps,
      loop: false,
      duration: (o.frames - 1) / o.fps,
    },
    layers: base.layers.filter((l) => o.keep.includes(l.id)).map((l) => ({ ...l, enabled: true })),
  };
  const layer = (/** @type {string} */ id) =>
    /** @type {EditorLayer} */ (s.layers.find((l) => l.id === id));
  /**
   * @typedef {{ label?: string, blend?: any, anchor?: any, params?: Record<string, any>,
   *   transform?: Record<string, number>, keys?: Record<string, any[]> }} Patch
   */
  /** @param {string} id @param {Patch} p */
  const patch = (id, p) => {
    const l = layer(id);
    s = updateLayer(s, id, {
      ...(p.label ? { label: p.label } : {}),
      ...(p.blend ? { blend: p.blend } : {}),
      ...(p.anchor ? { anchor: p.anchor } : {}),
      ...(p.keys ? { keys: p.keys } : {}),
      transform: { ...l.transform, ...p.transform },
      params: snapParams(l.type, { ...l.params, ...p.params }),
    });
  };
  return {
    patch,
    /**
     * A new layer `id` directly above `above` (or on top). @param {string} type @param {string} id
     * @param {Patch & { above?: string }} p
     */
    add(type, id, p) {
      const r = addLayer(s, /** @type {any} */ (type), p.above);
      s = updateLayer(r.state, r.id, { id, seedKey: id, anchor: 'afterImpact' });
      patch(id, p);
    },
    /** Parent `id` to `parent`, keeping it where it is on screen. */
    parent: (/** @type {string} */ id, /** @type {string} */ parent) => {
      s = setParent(s, id, parent);
    },
    done: () => s,
  };
}

/** Hot hit colours: white, gold, orange, a red edge. */
const HOT = ramp([
  [0, '#ffffff'],
  [0.2, '#fff4b8'],
  [0.45, '#ffc53d'],
  [0.7, '#ff7a1f'],
  [1, '#c2281e'],
]);

/** The cel fireball: white-hot, yellow, orange, red, then it cools down to smoke. */
const FIRE_TO_SMOKE = ramp([
  [0, '#ffffff'],
  [0.12, '#fff1a1'],
  [0.26, '#ffb52e'],
  [0.4, '#ff6a1f'],
  [0.54, '#c4301f'],
  [0.68, '#6e2a2e'],
  [0.84, '#4a3a40'],
  [1, '#3a3236'],
]);

/** Warm cel smoke (dark body with a lit side). */
const WARM_SMOKE = ramp([
  [0, '#b8a6a0'],
  [0.35, '#7d6a68'],
  [0.7, '#4f4248'],
  [1, '#2e2830'],
]);

/** Ground dust. */
const DUST = ramp([
  [0, '#f2dcb6'],
  [0.4, '#c9a37a'],
  [0.75, '#8f6a50'],
  [1, '#5a4034'],
]);

/** Rings: thick right after they appear, then thin out (Raul's shockwaves). */
const THICK_THIN = curve([
  [0, 0],
  [0.15, 1],
  [0.55, 0.22],
  [1, 0.08],
]);

const HOLD = curve([
  [0, 1],
  [1, 1],
]);

/**
 * Small Hit: ~20 frames. Pinch (2 frames), a star flash, 4 crescent slashes thrown out, a
 * thick → thin ring, sparks, and a small cel puff that breaks into holes.
 * @returns {State}
 */
export function buildSmallHit() {
  const c = stack({
    globals: {
      'explosion.size': 1,
      'explosion.impact': 0.1,
      'explosion.flashFrames': 1,
      'explosion.anticipation': true,
    },
    frames: 20,
    fps: 30,
    keep: ['smoke', 'shockwave', 'core', 'wisps', 'sparks', 'anticipation', 'flash'],
  });
  c.patch('smoke', {
    label: 'Puff',
    params: {
      'style.ramp': WARM_SMOKE,
      'cs.size': 30,
      'cs.lumps': 5,
      'cs.droplets': 2,
      'cs.holeCount': 8,
      'cs.holeStart': 0.05,
      'cs.holeSize': 0.85,
      'burst.count': 5,
      'burst.start': 0.18,
      'burst.speed': 160,
      'burst.drag': 5,
      'burst.buoyancy': 160,
      'burst.spawnRadius': 20,
      'burst.life': 0.75,
    },
  });
  c.patch('shockwave', {
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'style.bands': 2,
      'ring.radius': 115,
      'ring.thickness': 0.4,
      'ring.thicknessOverLife': THICK_THIN,
      'ring.distortion': 0,
      'glow.amount': 0.8,
      'glow.radius': 16,
      'single.end': 0.5,
      'single.scaleOverLife': curve([
        [0, 0.2],
        [0.3, 0.9],
        [1, 1.2],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [0.7, 1],
        [1, 0],
      ]),
    },
  });
  c.patch('core', {
    label: 'Hot core',
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'style.bands': 3,
      'field.width': 72,
      'field.speed': 5,
      'field.swirl': 0.7,
      'glow.amount': 2.2,
      'glow.radius': 30,
      'single.end': 0.42,
      'single.scaleOverLife': curve([
        [0, 0.4],
        [0.15, 1.15],
        [0.5, 0.85],
        [1, 0.2],
      ]),
    },
  });
  c.patch('wisps', {
    label: 'Slashes',
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'style.bands': 2,
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.5],
      ]),
      'crescent.radius': 85,
      'crescent.sweep': 90,
      'crescent.thickness': 26,
      'crescent.thicknessOverLife': curve([
        [0, 0.3],
        [0.15, 1.6],
        [0.6, 0.35],
        [1, 0],
      ]),
      'crescent.hook': 0,
      'crescent.sharpness': 0.85,
      'crescent.hotEdge': 0.6,
      'crescent.wobble': 0.05,
      'glow.amount': 1,
      'glow.radius': 16,
      'burst.count': 7,
      'burst.start': 0,
      'burst.window': 0.04,
      'burst.spawnRadius': 14,
      'burst.speed': 1100,
      'burst.speedVariance': 0.15,
      'burst.drag': 7,
      'burst.buoyancy': 0,
      'burst.life': 0.5,
      'burst.lifeVariance': 0.15,
      'burst.alignToVelocity': true,
      'burst.randomRotation': 0,
      'burst.spin': 0,
      'burst.scaleOverLife': curve([
        [0, 0.6],
        [0.25, 1.1],
        [1, 0.9],
      ]),
    },
  });
  c.patch('sparks', {
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'streak.length': 42,
      'streak.thickness': 6,
      'streak.taper': 0.9,
      'glow.amount': 1,
      'glow.radius': 12,
      'burst.count': 14,
      'burst.speed': 760,
      'burst.drag': 4.5,
      'burst.gravity': 300,
      'burst.life': 0.45,
    },
  });
  // The pinch: a hot dot that shrinks into the centre just before the hit.
  c.patch('anticipation', {
    params: {
      'style.ramp': HOT,
      'blob.radius': 36,
      'glow.amount': 1.2,
      'glow.radius': 20,
      'single.scaleOverLife': curve([
        [0, 1.4],
        [1, 0.2],
      ]),
      'single.opacityOverLife': curve([
        [0, 0],
        [0.4, 1],
        [1, 1],
      ]),
    },
  });
  c.patch('flash', { params: { 'blob.radius': 70 } });
  // The star flash: a long thin 4-point star on the impact frame.
  c.add('sparkle', 'star', {
    label: 'Star flash',
    blend: 'add',
    anchor: 'flash',
    params: {
      'style.ramp': HOT,
      'sparkle.size': 150,
      'sparkle.ratio': 0.22,
      'sparkle.thinness': 0.9,
      'glow.amount': 1.5,
      'glow.radius': 30,
      'single.rotation': 12,
      'single.scaleOverLife': HOLD,
      'single.opacityOverLife': HOLD,
    },
  });
  // The core pops and turns on a parent, like the Anime Blast.
  c.add('null', 'hitParent', {
    label: 'Hit parent',
    above: 'core',
    keys: {
      'transform.scaleX': ease([
        [0.07, 60],
        [0.17, 120],
        [0.4, 90],
      ]),
      'transform.scaleY': ease([
        [0.07, 60],
        [0.17, 120],
        [0.4, 90],
      ]),
      'transform.rotation': ease([
        [0.07, 0],
        [0.4, 120],
      ]),
    },
  });
  c.parent('core', 'hitParent');
  return c.done();
}

/**
 * Big Boom: ~66 frames. The air is sucked in, a 2-frame flash, a cel fireball that cools into
 * smoke and breaks up into holes, a shockwave and a ground dust ring, debris on gravity arcs,
 * long sparks, a mushroom of cel smoke rising, and embers.
 * @returns {State}
 */
export function buildBigBoom() {
  const c = stack({
    globals: {
      'explosion.size': 1.1,
      'explosion.impact': 0.15,
      'explosion.flashFrames': 2,
      'explosion.anticipation': true,
    },
    frames: 66,
    fps: 30,
    keep: ['smoke', 'shockwave', 'core', 'fireball', 'debris', 'sparks', 'twinkles'].concat([
      'anticipation',
      'flash',
    ]),
  });
  // Billows rising behind the fire: the mushroom.
  c.patch('smoke', {
    label: 'Rising smoke',
    params: {
      'style.ramp': WARM_SMOKE,
      'cs.size': 54,
      'cs.lumps': 7,
      'cs.shade': 0.4,
      'cs.holeCount': 16,
      'cs.holeStart': 0.4,
      'cs.holeSize': 0.9,
      'cs.edgeNoise': 0.08,
      'burst.count': 11,
      'burst.start': 0.12,
      'burst.window': 0.12,
      'burst.direction': 0,
      'burst.cone': 70,
      'burst.speed': 260,
      'burst.drag': 2.5,
      'burst.buoyancy': 320,
      'burst.spawnRadius': 40,
      'burst.life': 0.85,
      'burst.scaleOverLife': curve([
        [0, 0.5],
        [0.3, 1],
        [1, 1.35],
      ]),
    },
  });
  // Ground dust: a flat ring rolling out along the floor.
  c.add('ring', 'dust', {
    label: 'Ground dust',
    above: 'smoke',
    transform: { y: 70, scaleY: 32 },
    params: {
      'style.ramp': DUST,
      'style.bands': 3,
      'style.snapColors': true,
      'ring.radius': 220,
      'ring.thickness': 0.45,
      'ring.thicknessOverLife': THICK_THIN,
      'ring.distortion': 0.08,
      'ring.wobble': 1.5,
      'dissolve.mode': 'holes',
      'dissolve.amount': curve([
        [0, 0],
        [0.25, 0],
        [0.8, 1],
        [1, 1],
      ]),
      'dissolve.size': 30,
      'dissolve.roughness': 0.5,
      'single.end': 0.6,
      'single.scaleOverLife': curve([
        [0, 0.15],
        [0.35, 0.85],
        [1, 1.2],
      ]),
      'single.opacityOverLife': HOLD,
    },
  });
  c.patch('fireball', {
    label: 'Cel fireball',
    params: {
      'style.ramp': FIRE_TO_SMOKE,
      'style.bands': 4,
      'style.bandNoise': 0.15,
      'style.snapColors': true,
      'style.spread': 0.3,
      'style.rampOverLife': curve([
        [0, 0],
        [0.3, 0.3],
        [0.7, 0.8],
        [1, 1],
      ]),
      'puff.radius': 82,
      'puff.count': 6,
      'puff.noise': 0.06,
      'burst.count': 10,
      'burst.speed': 240,
      'burst.drag': 3.5,
      'burst.buoyancy': 240,
      'burst.spawnRadius': 24,
      'burst.life': 0.88,
      'burst.scaleOverLife': curve([
        [0, 0.4],
        [0.12, 1.2],
        [0.5, 1.1],
        [1, 0.75],
      ]),
      'burst.opacityOverLife': HOLD,
      'dissolve.mode': 'holes',
      'dissolve.amount': curve([
        [0, 0],
        [0.5, 0],
        [1, 1],
      ]),
      'dissolve.size': 54,
      'dissolve.roughness': 0.45,
    },
  });
  c.patch('shockwave', {
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'style.bands': 2,
      'ring.radius': 200,
      'ring.thickness': 0.3,
      'ring.thicknessOverLife': THICK_THIN,
      'ring.distortion': 0,
      'glow.amount': 0.8,
      'glow.radius': 24,
      'single.end': 0.35,
      'single.scaleOverLife': curve([
        [0, 0.15],
        [0.35, 0.85],
        [1, 1.25],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [0.6, 1],
        [1, 0],
      ]),
    },
  });
  // The glowing heart of the blast, on a keyed parent (swells, settles, turns).
  c.patch('core', {
    label: 'Hot core',
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'style.bands': 3,
      'field.width': 120,
      'field.speed': 3.5,
      'field.swirl': 0.7,
      'glow.amount': 2.4,
      'glow.radius': 56,
      'single.end': 0.38,
    },
  });
  c.add('null', 'boomParent', {
    label: 'Boom parent',
    above: 'core',
    keys: {
      'transform.scaleX': ease([
        [0.32, 55],
        [0.6, 125],
        [0.95, 100],
      ]),
      'transform.scaleY': ease([
        [0.32, 55],
        [0.6, 125],
        [0.95, 100],
      ]),
      'transform.rotation': ease([
        [0.32, 0],
        [1.1, 200],
      ]),
    },
  });
  c.parent('core', 'boomParent');
  c.patch('debris', {
    params: {
      'style.ramp': rampPreset('debris'),
      'debris.size': 8,
      'outline.mode': 'outer',
      'outline.px': 2,
      'outline.colorMode': 'custom',
      'outline.color': '#2a1a22',
      'burst.count': 16,
      'burst.direction': 0,
      'burst.cone': 230,
      'burst.speed': 700,
      'burst.speedVariance': 0.6,
      'burst.drag': 0.5,
      'burst.gravity': 1500,
      'burst.life': 0.7,
    },
  });
  c.patch('sparks', {
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'streak.length': 80,
      'streak.thickness': 6,
      'streak.taper': 0.9,
      'glow.amount': 1,
      'glow.radius': 16,
      'burst.count': 24,
      'burst.speed': 1000,
      'burst.drag': 2.5,
      'burst.gravity': 600,
      'burst.life': 0.45,
    },
  });
  c.patch('twinkles', {
    label: 'Embers',
    blend: 'add',
    params: {
      'style.ramp': HOT,
      'sparkle.size': 9,
      'sparkle.ratio': 0.5,
      'glow.amount': 1.2,
      'glow.radius': 8,
      'burst.count': 18,
      'burst.start': 0.25,
      'burst.window': 0.45,
      'burst.spawnRadius': 120,
      'burst.speed': 60,
      'burst.buoyancy': 200,
      'burst.life': 0.3,
    },
  });
  // Wind-up: a glow gathers while a ring is sucked into the centre.
  c.patch('anticipation', {
    params: {
      'style.ramp': HOT,
      'blob.radius': 50,
      'glow.amount': 1.4,
      'glow.radius': 30,
      'single.scaleOverLife': curve([
        [0, 0.3],
        [0.75, 1],
        [1, 0.3],
      ]),
    },
  });
  c.add('ring', 'suckIn', {
    label: 'Suck-in ring',
    above: 'anticipation',
    blend: 'add',
    anchor: 'anticipation',
    params: {
      'style.ramp': HOT,
      'style.bands': 2,
      'ring.radius': 150,
      'ring.thickness': 0.14,
      'ring.thicknessOverLife': curve([
        [0, 0.2],
        [1, 1],
      ]),
      'ring.distortion': 0,
      'glow.amount': 0.8,
      'glow.radius': 14,
      'single.scaleOverLife': curve([
        [0, 1.3],
        [1, 0.1],
      ]),
      'single.opacityOverLife': curve([
        [0, 0],
        [0.3, 1],
        [1, 1],
      ]),
    },
  });
  c.patch('flash', { params: { 'blob.radius': 210 } });
  return c.done();
}
