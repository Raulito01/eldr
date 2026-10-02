// @ts-check
/**
 * Preset kit (D-069, D-070): helpers to BUILD a preset as a whole composition with the normal
 * editing operations (layers, masks, parents, keys), so every preset opens fully editable.
 * Used by the particle, lightning and magic presets.
 */

import { createExplosion } from './explosion/explosion.js';
import { addLayer, addMask, setParent, updateLayer } from './layerStack.js';

/** @typedef {import('../explosion/explosion.js').ExplosionState} State */

export const ramp = (/** @type {[number, string][]} */ stops) =>
  stops.map(([pos, color]) => ({ pos, color }));
export const curve = (/** @type {[number, number][]} */ pts) => pts.map(([x, y]) => ({ x, y }));

/** Fade in fast, hold, fade out: particles that never pop on or off. */
export const SOFT_LIFE = curve([
  [0, 0],
  [0.12, 1],
  [0.65, 1],
  [1, 0],
]);
/** A colour held still (ramp position 0.08) — loops. */
export const HOLD_COLOR = curve([
  [0, 0.08],
  [1, 0.08],
]);
/** Born full size, shrink away. */
export const SHRINK = curve([
  [0, 1],
  [1, 0.15],
]);

/**
 * Small builder over the layer-stack operations.
 * @param {Partial<State>} [o] globals / timing overrides
 */
export function compose(o = {}) {
  const base = createExplosion();
  /** @type {State} */
  let s = {
    ...base,
    globals: { ...base.globals, 'explosion.impact': 0, 'explosion.flashFrames': 0, ...o.globals },
    timing: { ...base.timing, ...o.timing },
    layers: [],
  };
  return {
    /**
     * Add a layer on top. @param {string} type @param {string} label
     * @param {{ params?: Record<string, any>, blend?: any, transform?: Record<string, number>, anchor?: any, enabled?: boolean }} [p]
     */
    add(type, label, p = {}) {
      const r = addLayer(s, /** @type {any} */ (type));
      const l = /** @type {any} */ (r.state.layers.find((x) => x.id === r.id));
      s = updateLayer(r.state, r.id, {
        label,
        anchor: p.anchor ?? 'free',
        ...(p.enabled === false ? { enabled: false } : {}),
        ...(p.blend ? { blend: p.blend } : {}),
        transform: { ...l.transform, ...p.transform },
        params: {
          ...l.params,
          // In a loop a whole-loop layer must not drift along its ramp (the colour would jump
          // back at the seam): hold its colour unless the preset says otherwise.
          ...(s.timing.loop && !type.endsWith('Emitter') && 'style.rampOverLife' in l.params
            ? { 'style.rampOverLife': HOLD_COLOR }
            : {}),
          ...p.params,
        },
      });
      return r.id;
    },
    /** @param {string} id @param {Record<string, any>} patch */
    set(id, patch) {
      s = updateLayer(s, id, patch);
    },
    /** @param {string} id @param {any} mask @returns {string} mask id */
    mask(id, mask) {
      const r = addMask(s, id, 'path', mask);
      s = r.state;
      return r.maskId;
    },
    /** @param {string} id @param {string} parent */
    parent(id, parent) {
      s = setParent(s, id, parent);
    },
    done: () => s,
  };
}

/** A loop's timing (frames at fps; the loop period is frames / fps). */
export const loop = (/** @type {number} */ frameCount, fps = 24) => ({
  frameCount,
  fps,
  loop: true,
  holdMode: /** @type {const} */ ('ones'),
});
/** A one-shot's timing (animation length = its frames, D-050). */
export const oneShot = (/** @type {number} */ frameCount, fps = 24) => ({
  frameCount,
  fps,
  loop: false,
  holdMode: /** @type {const} */ ('ones'),
  duration: (frameCount - 1) / fps,
});
