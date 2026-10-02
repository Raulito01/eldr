// @ts-check
/**
 * Preset kit (D-069, D-070): helpers to BUILD a preset as a whole composition with the normal
 * editing operations (layers, masks, parents, keys), so every preset opens fully editable.
 * Used by the particle, lightning and magic presets.
 */

import { createExplosion } from './explosion/explosion.js';
import { addLayer, addMask, setParent, updateLayer } from './layerStack.js';

/** @typedef {import('./explosion/explosion.js').ExplosionState} State */

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
    /**
     * A round mask (keeps a layer inside an orb). @param {string} id @param {number} r radius px
     * @param {number} [feather]
     */
    circleMask(id, r, feather = 1.5) {
      s = addMask(s, id, 'ellipse', {
        x: 0,
        y: 0,
        w: r * 2,
        h: r * 2,
        feather,
        name: 'Inside the orb',
      }).state;
    },
    /** @param {string} id @param {any} mask @returns {string} mask id */
    mask(id, mask) {
      const r = addMask(s, id, 'path', mask);
      s = r.state;
      return r.maskId;
    },
    /**
     * Parent a layer. Default: it stays where it is on screen (as in the editor); `local`: its
     * transform is kept as-is and read in the parent's space (it moves onto the parent).
     * @param {string} id @param {string} parent @param {{ local?: boolean }} [o]
     */
    parent(id, parent, o = {}) {
      s = o.local ? updateLayer(s, id, { parent }) : setParent(s, id, parent);
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

/**
 * A glass orb with contents inside: Back glass, the contents (each masked to the sphere), Front
 * glass on top (D-073). Returns the ids of the contents.
 * @param {ReturnType<typeof compose>} c @param {number} R radius
 * @param {any[]} glass ramp @param {(add: typeof c.add) => string[]} contents
 * @param {Record<string, any>} [orb] orb param overrides
 */
export function glassOrb(c, R, glass, contents, orb = {}) {
  const part = (/** @type {string} */ which) => ({
    params: { 'orb.part': which, 'orb.radius': R, 'style.ramp': glass, ...orb },
  });
  c.add('orb', 'Glass (back)', part('back'));
  const inside = contents(c.add);
  for (const id of inside) c.circleMask(id, R * 0.97);
  c.add('orb', 'Glass (front)', { blend: 'screen', ...part('front') });
  return inside;
}
