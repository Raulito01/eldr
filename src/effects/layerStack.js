// @ts-check
/**
 * Layer stack operations (step 3.6a, pulled forward from 8.4 [Raul]). Pure: every function
 * takes a state and returns a NEW state (the input is never mutated), so undo/redo can simply
 * keep old states.
 *
 * Stack order: `state.layers[0]` is the BOTTOM layer; the layer panel shows it top-first.
 */

import { transformForParent, wouldCycle } from '../core/transform2d.js';
import { getDefaults } from '../schema/index.js';
import { makeLayer } from './explosion/explosion.js';
import { LAYER_TYPE_LABELS, LAYER_TYPES } from './layerTypes.js';

/** @param {{ layers: { id: string }[] }} state @param {string} id */
export const indexOf = (state, id) => state.layers.findIndex((l) => l.id === id);

/**
 * A layer id not used in the stack yet: base, base-2, base-3, …
 * @param {{ layers: { id: string }[] }} state @param {string} base
 */
export function uniqueId(state, base) {
  const used = new Set(state.layers.map((l) => l.id));
  const stem = base.replace(/-\d+$/, '') || 'layer';
  if (!used.has(stem)) return stem;
  for (let i = 2; ; i++) if (!used.has(`${stem}-${i}`)) return `${stem}-${i}`;
}

/** A label not used yet: "Fire core", "Fire core 2", … @param {{ layers: { label: string }[] }} state @param {string} base */
export function uniqueLabel(state, base) {
  const used = new Set(state.layers.map((l) => l.label));
  if (!used.has(base)) return base;
  for (let i = 2; ; i++) if (!used.has(`${base} ${i}`)) return `${base} ${i}`;
}

/** Short display name of a layer type ("Field fire (…)" → "Field fire"). @param {string} type */
export const typeName = (type) =>
  /** @type {Record<string, string>} */ (LAYER_TYPE_LABELS[type] ?? type).replace(/\s*\(.*\)$/, '');

/**
 * Add a new layer of `type` with its defaults, directly ABOVE `aboveId` (or on top).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {keyof typeof LAYER_TYPES} type @param {string} [aboveId]
 * @returns {{ state: S, id: string }}
 */
export function addLayer(state, type, aboveId) {
  if (!(type in LAYER_TYPES)) throw new Error(`Unknown layer type "${type}"`);
  const id = uniqueId(state, type);
  const layer = makeLayer({
    id,
    type,
    label: uniqueLabel(state, typeName(type)),
    params: getDefaults(LAYER_TYPES[type].schema),
  });
  const at = aboveId === undefined ? state.layers.length : indexOf(state, aboveId) + 1;
  const layers = [...state.layers];
  layers.splice(at < 1 ? layers.length : at, 0, layer);
  return { state: { ...state, layers }, id };
}

/**
 * Remove a layer. Its children keep their place on screen and move up to its parent
 * (as in After Effects). Unknown id → unchanged.
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @returns {S}
 */
export function removeLayer(state, id) {
  const gone = state.layers.find((l) => l.id === id);
  if (!gone) return state;
  let next = state;
  for (const child of state.layers.filter((l) => l.parent === id)) {
    next = setParent(next, child.id, gone.parent ?? null);
  }
  return { ...next, layers: next.layers.filter((l) => l.id !== id) };
}

/**
 * Layers that may become the parent of `id` (not itself, not one of its descendants).
 * @param {{ layers: import('./explosion/explosion.js').EditorLayer[] }} state @param {string} id
 */
export const parentCandidates = (state, id) =>
  state.layers.filter((l) => l.id !== id && !wouldCycle(state.layers, id, l.id));

/**
 * Parent a layer (or unparent with null), keeping it exactly where it is on screen.
 * A parent that would create a loop is refused (state unchanged).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @param {string | null} parent @returns {S}
 */
export function setParent(state, id, parent) {
  const l = state.layers.find((x) => x.id === id);
  if (!l || (l.parent ?? null) === (parent ?? null)) return state;
  if (
    parent &&
    (!state.layers.some((x) => x.id === parent) || wouldCycle(state.layers, id, parent))
  ) {
    return state;
  }
  const transform = transformForParent(state.layers, id, parent);
  return updateLayer(state, id, { parent: parent ?? null, transform });
}

/**
 * Duplicate a layer directly above itself: same settings and the SAME randomness (seedKey), so
 * the copy is identical until changed or reseeded (e.g. orbit back + front halves).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @returns {{ state: S, id: string }}
 */
export function duplicateLayer(state, id) {
  const i = indexOf(state, id);
  if (i < 0) return { state, id };
  const src = state.layers[i];
  const copy = {
    ...structuredClone(src),
    id: uniqueId(state, src.id),
    label: uniqueLabel(state, `${src.label} copy`),
    solo: false,
  };
  const layers = [...state.layers];
  layers.splice(i + 1, 0, copy);
  return { state: { ...state, layers }, id: copy.id };
}

/**
 * Move a layer to stack index `to` (0 = bottom), clamped.
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @param {number} to @returns {S}
 */
export function moveLayer(state, id, to) {
  const i = indexOf(state, id);
  if (i < 0) return state;
  const layers = [...state.layers];
  const [l] = layers.splice(i, 1);
  layers.splice(Math.max(0, Math.min(layers.length, Math.round(to))), 0, l);
  return { ...state, layers };
}

/**
 * Move a layer up (+1, toward the top) or down (−1) one step.
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @param {number} by @returns {S}
 */
export const nudgeLayer = (state, id, by) => moveLayer(state, id, indexOf(state, id) + by);

/**
 * Change layer fields (label, enabled, solo, opacity, blend, anchor, seedKey, params…).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id
 * @param {Partial<import('./explosion/explosion.js').EditorLayer>} patch @returns {S}
 */
export function updateLayer(state, id, patch) {
  return { ...state, layers: state.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) };
}

/**
 * Give a layer new randomness (a fresh seedKey derived from its id and a counter).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @returns {S}
 */
export function reseedLayer(state, id) {
  const l = state.layers[indexOf(state, id)];
  if (!l) return state;
  const m = /#(\d+)$/.exec(l.seedKey);
  const n = m ? Number(m[1]) + 1 : 2;
  return updateLayer(state, id, { seedKey: `${l.seedKey.replace(/#\d+$/, '')}#${n}` });
}
