// @ts-check
/**
 * Editing animated values, the After Effects way (3.6c, D-054). Pure: state in, new state out.
 *
 * - A param without keys is a fixed value: edits change it.
 * - Stopwatch ON: the param gets one key at the current time with its current value.
 * - Stopwatch OFF: all keys go; the param keeps the value it had at the current time.
 * - With keys: an edit sets (or replaces) the key at the current time.
 *
 * Ids: layer-type params, `transform.*` (x, y, anchorX, anchorY, scaleX, scaleY, rotation) and
 * `layer.opacity` (percent).
 */

import { hasKeyAt, removeKey, setKey } from '../core/keyframes.js';
import { layerAt, layerSeconds } from './layerAnimation.js';
import { updateLayer } from './layerStack.js';
import { parseMaskParam } from './maskParams.js';

/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */

const TRANSFORM_PREFIX = 'transform.';

/** Value of a param id on a layer (as the inspector shows it). @param {EditorLayer} l @param {string} id */
export function readValue(l, id) {
  if (id === 'layer.opacity') return Math.round(l.opacity * 1000) / 10;
  const mp = parseMaskParam(id);
  if (mp) return /** @type {any} */ (l.masks?.find((m) => m.id === mp.maskId))?.[mp.field];
  if (id.startsWith(TRANSFORM_PREFIX)) {
    return /** @type {any} */ (l.transform)[id.slice(TRANSFORM_PREFIX.length)];
  }
  return l.params[id];
}

/** The layer with a FIXED value set (no keys involved). @param {EditorLayer} l @param {string} id @param {any} v */
export function writeStatic(l, id, v) {
  if (id === 'layer.opacity') return { ...l, opacity: Math.min(1, Math.max(0, v / 100)) };
  const mp = parseMaskParam(id);
  if (mp) {
    return {
      ...l,
      masks: (l.masks ?? []).map((m) => (m.id === mp.maskId ? { ...m, [mp.field]: v } : m)),
    };
  }
  if (id.startsWith(TRANSFORM_PREFIX)) {
    return { ...l, transform: { ...l.transform, [id.slice(TRANSFORM_PREFIX.length)]: v } };
  }
  return { ...l, params: { ...l.params, [id]: v } };
}

/** Current value of a param at comp time s (animated or fixed). @param {EditorLayer} l @param {string} id @param {number} s */
export const valueNow = (l, id, s) => readValue(layerAt(l, s), id);

/** @param {EditorLayer} l @param {string} id */
export const isAnimatedParam = (l, id) => !!l.keys?.[id]?.length;

/** @param {EditorLayer} l @param {string} id @param {number} s comp seconds */
export const keyHere = (l, id, s) => hasKeyAt(l.keys?.[id], layerSeconds(l.time, s));

/**
 * Apply edits to a layer at comp time s: animated params get a key, the others change.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string} layerId @param {Record<string, any>} changes @param {number} s
 * @returns {S}
 */
export function applyValues(state, layerId, changes, s) {
  const l0 = state.layers.find((x) => x.id === layerId);
  if (!l0) return state;
  let l = l0;
  const local = layerSeconds(l.time, s);
  for (const [id, v] of Object.entries(changes)) {
    if (isAnimatedParam(l, id))
      l = { ...l, keys: { ...l.keys, [id]: setKey(l.keys[id], local, v) } };
    else l = writeStatic(l, id, v);
  }
  return updateLayer(state, layerId, l);
}

/**
 * Stopwatch on / off for a param.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string} layerId @param {string} id @param {number} s
 * @returns {S}
 */
export function toggleStopwatch(state, layerId, id, s) {
  const l = state.layers.find((x) => x.id === layerId);
  if (!l) return state;
  const now = valueNow(l, id, s);
  if (isAnimatedParam(l, id)) {
    const { [id]: _gone, ...keys } = l.keys;
    return updateLayer(state, layerId, { ...writeStatic(l, id, now), keys });
  }
  return updateLayer(state, layerId, {
    keys: { ...l.keys, [id]: setKey([], layerSeconds(l.time, s), now) },
  });
}

/**
 * The ◆ button: remove the key at time s, or add one with the current value.
 * Removing the last key turns the stopwatch off (keeping that value).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string} layerId @param {string} id @param {number} s
 * @returns {S}
 */
export function toggleKey(state, layerId, id, s) {
  const l = state.layers.find((x) => x.id === layerId);
  if (!l) return state;
  const local = layerSeconds(l.time, s);
  const now = valueNow(l, id, s);
  if (!keyHere(l, id, s)) {
    return updateLayer(state, layerId, {
      keys: { ...l.keys, [id]: setKey(l.keys?.[id], local, now) },
    });
  }
  const rest = removeKey(l.keys[id], local);
  if (rest.length) return updateLayer(state, layerId, { keys: { ...l.keys, [id]: rest } });
  const { [id]: _gone, ...keys } = l.keys;
  return updateLayer(state, layerId, { ...writeStatic(l, id, now), keys });
}

/**
 * Does a layer have this param id? (transform / opacity: every layer; others: its type's schema)
 * @param {EditorLayer} l @param {string} id
 */
export const layerHasParam = (l, id) => {
  if (id === 'layer.opacity' || id.startsWith(TRANSFORM_PREFIX) || id in (l.params ?? {}))
    return true;
  const mp = parseMaskParam(id);
  return !!mp && !!l.masks?.some((m) => m.id === mp.maskId);
};

/**
 * Multi-layer edit (3.7b): set the same values on every listed layer that has them.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string[]} ids @param {Record<string, any>} changes @param {number} s
 * @returns {S}
 */
export function applyValuesMany(state, ids, changes, s) {
  let out = state;
  for (const id of ids) {
    const l = out.layers.find((x) => x.id === id);
    if (!l) continue;
    const mine = Object.fromEntries(Object.entries(changes).filter(([k]) => layerHasParam(l, k)));
    if (Object.keys(mine).length) out = applyValues(out, id, mine, s);
  }
  return out;
}

/**
 * Stopwatch for several layers: follows the ACTIVE layer (on → all on, off → all off).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string} active @param {string[]} ids @param {string} param @param {number} s
 * @returns {S}
 */
export function toggleStopwatchMany(state, active, ids, param, s) {
  const a = state.layers.find((x) => x.id === active);
  if (!a) return state;
  const turnOn = !isAnimatedParam(a, param);
  let out = state;
  for (const id of ids) {
    const l = out.layers.find((x) => x.id === id);
    if (!l || !layerHasParam(l, param) || isAnimatedParam(l, param) === turnOn) continue;
    out = toggleStopwatch(out, id, param, s);
  }
  return out;
}

/**
 * ◆ for several layers: follows the ACTIVE layer (key here → remove on all, else add on all).
 * Only layers whose param is animated take part.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string} active @param {string[]} ids @param {string} param @param {number} s
 * @returns {S}
 */
export function toggleKeyMany(state, active, ids, param, s) {
  const a = state.layers.find((x) => x.id === active);
  if (!a) return state;
  const remove = keyHere(a, param, s);
  let out = state;
  for (const id of ids) {
    const l = out.layers.find((x) => x.id === id);
    if (!l || !isAnimatedParam(l, param) || keyHere(l, param, s) !== remove) continue;
    out = toggleKey(out, id, param, s);
  }
  return out;
}

/**
 * Param ids whose current values differ between the listed layers (shown as "mixed").
 * @param {EditorLayer[]} layers @param {string[]} ids @param {string[]} params @param {number} s
 */
export function mixedParams(layers, ids, params, s) {
  const sel = layers.filter((l) => ids.includes(l.id));
  const out = new Set();
  if (sel.length < 2) return out;
  for (const p of params) {
    const vals = sel
      .filter((l) => layerHasParam(l, p))
      .map((l) => JSON.stringify(valueNow(l, p, s)));
    if (new Set(vals).size > 1) out.add(p);
  }
  return out;
}
