// @ts-check
/**
 * Editing SEVERAL keyframes at once (3.7b, D-058). Pure: state in, new state out.
 *
 * A key is referred to by { layerId, paramId, t } (t = layer seconds). Moves and scaling work in
 * COMP time (what the timeline shows) and snap to frames; each key is converted back to its own
 * layer's time, so keys on slid / stretched layers move correctly.
 */

import { KEY_EPSILON, setKey } from '../core/keyframes.js';
import { compSeconds, layerSeconds } from './layerAnimation.js';

/** @typedef {{ layerId: string, paramId: string, t: number }} KeyRef */
/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */

const same = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < KEY_EPSILON;

/** Is this key in the list? @param {KeyRef[]} refs @param {KeyRef} k */
export const hasRef = (refs, k) =>
  refs.some((r) => r.layerId === k.layerId && r.paramId === k.paramId && same(r.t, k.t));

/** Keys of refs that exist, with their data. @param {{ layers: EditorLayer[] }} state @param {KeyRef[]} refs */
function resolve(state, refs) {
  const out = [];
  for (const r of refs) {
    const l = state.layers.find((x) => x.id === r.layerId);
    const k = l?.keys?.[r.paramId]?.find((x) => same(x.t, r.t));
    if (l && k) out.push({ ref: r, layer: l, key: k, comp: compSeconds(l.time, k.t) });
  }
  return out;
}

/**
 * Re-time selected keys with `toComp(compSeconds) → compSeconds` (snapped to frames).
 * Selected keys are lifted out first, so they can pass over each other; a key that lands on an
 * unselected key replaces it (as in After Effects).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @param {(comp: number) => number} toComp @param {number} fps
 * @returns {{ state: S, refs: KeyRef[] }}
 */
function retime(state, refs, toComp, fps) {
  const items = resolve(state, refs);
  if (!items.length) return { state, refs: [] };
  /** @type {Map<string, EditorLayer>} */
  const changed = new Map();
  const layerOf = (/** @type {string} */ id) =>
    changed.get(id) ?? /** @type {EditorLayer} */ (state.layers.find((x) => x.id === id));
  // 1. lift every selected key out
  for (const it of items) {
    const l = layerOf(it.layer.id);
    const keys = (l.keys[it.ref.paramId] ?? []).filter((k) => !same(k.t, it.key.t));
    changed.set(l.id, { ...l, keys: { ...l.keys, [it.ref.paramId]: keys } });
  }
  // 2. put them back at their new times
  /** @type {KeyRef[]} */
  const next = [];
  for (const it of items) {
    const l = layerOf(it.layer.id);
    const comp = Math.max(0, Math.round(toComp(it.comp) * fps) / fps);
    const t = layerSeconds(l.time, comp);
    const keys = setKey(l.keys[it.ref.paramId], t, it.key.v, it.key.ease);
    // keep the key's own curve handles (3.7c) if it has them
    const placed = keys.map((k) => (same(k.t, t) ? { ...it.key, t } : k));
    changed.set(l.id, { ...l, keys: { ...l.keys, [it.ref.paramId]: placed } });
    next.push({ layerId: l.id, paramId: it.ref.paramId, t });
  }
  return {
    state: { ...state, layers: state.layers.map((l) => changed.get(l.id) ?? l) },
    refs: next.filter(
      (r, i) =>
        !next
          .slice(0, i)
          .some((q) => q.layerId === r.layerId && q.paramId === r.paramId && same(q.t, r.t)),
    ),
  };
}

/**
 * Move selected keys by `dComp` seconds of comp time (snapped to frames).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @param {number} dComp @param {number} fps
 */
export const moveKeys = (state, refs, dComp, fps) => retime(state, refs, (c) => c + dComp, fps);

/**
 * Scale the timing of selected keys around `anchorComp` by factor k (⌥-drag of the first / last
 * selected key, as in After Effects).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @param {number} anchorComp @param {number} k @param {number} fps
 */
export const scaleKeys = (state, refs, anchorComp, k, fps) =>
  retime(state, refs, (c) => anchorComp + (c - anchorComp) * k, fps);

/** First / last comp time of the selection. @param {{ layers: EditorLayer[] }} state @param {KeyRef[]} refs */
export function keySpan(state, refs) {
  const comps = resolve(state, refs).map((x) => x.comp);
  return comps.length ? { first: Math.min(...comps), last: Math.max(...comps) } : null;
}

/**
 * Delete selected keys. A parameter that loses its last key keeps the value of its last key
 * as a fixed value (stopwatch off).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @returns {S}
 */
export function deleteKeys(state, refs) {
  const layers = state.layers.map((l) => {
    const mine = refs.filter((r) => r.layerId === l.id);
    if (!mine.length) return l;
    let out = { ...l, keys: { ...l.keys } };
    for (const pid of new Set(mine.map((r) => r.paramId))) {
      const before = out.keys[pid] ?? [];
      const rest = before.filter((k) => !mine.some((r) => r.paramId === pid && same(r.t, k.t)));
      if (rest.length) out.keys[pid] = rest;
      else {
        delete out.keys[pid];
        const last = before[before.length - 1];
        if (last) out = writeFixed(out, pid, last.v);
      }
    }
    return out;
  });
  return { ...state, layers };
}

/** @param {EditorLayer} l @param {string} id @param {any} v @returns {EditorLayer} */
function writeFixed(l, id, v) {
  if (id === 'layer.opacity') return { ...l, opacity: Math.min(1, Math.max(0, v / 100)) };
  if (id.startsWith('transform.'))
    return { ...l, transform: { ...l.transform, [id.slice(10)]: v } };
  return { ...l, params: { ...l.params, [id]: v } };
}

/**
 * Change selected keys (ease, curve handles…) with a patch.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @param {Record<string, any>} patch @returns {S}
 */
export function patchKeys(state, refs, patch) {
  const layers = state.layers.map((l) => {
    const mine = refs.filter((r) => r.layerId === l.id);
    if (!mine.length) return l;
    const keys = { ...l.keys };
    for (const pid of new Set(mine.map((r) => r.paramId))) {
      keys[pid] = (keys[pid] ?? []).map((k) =>
        mine.some((r) => r.paramId === pid && same(r.t, k.t)) ? { ...k, ...patch } : k,
      );
    }
    return { ...l, keys };
  });
  return { ...state, layers };
}

/**
 * @typedef {object} KeyClip  copied keys
 * @property {{ layerId: string, paramId: string, dt: number, v: any, ease: string, curve?: any }[]} keys
 *   dt = comp seconds after the earliest copied key
 * @property {number} layers  how many source layers
 */

/** Copy selected keys. @param {{ layers: EditorLayer[] }} state @param {KeyRef[]} refs @returns {KeyClip | null} */
export function copyKeys(state, refs) {
  const items = resolve(state, refs);
  if (!items.length) return null;
  const first = Math.min(...items.map((x) => x.comp));
  return {
    keys: items.map((x) => ({
      layerId: x.layer.id,
      paramId: x.ref.paramId,
      dt: x.comp - first,
      v: structuredClone(x.key.v),
      ease: x.key.ease,
      ...(x.key.curve ? { curve: structuredClone(x.key.curve) } : {}),
    })),
    layers: new Set(items.map((x) => x.layer.id)).size,
  };
}

/**
 * Paste keys at the playhead (comp seconds). Keys copied from ONE layer go onto every target
 * layer that has the parameter; keys from several layers go back onto those same layers.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyClip} clip @param {string[]} targets selected layer ids
 * @param {number} atComp @param {number} fps
 * @param {(layer: EditorLayer, paramId: string) => boolean} hasParam
 * @returns {{ state: S, refs: KeyRef[] }}
 */
export function pasteKeys(state, clip, targets, atComp, fps, hasParam) {
  /** @type {KeyRef[]} */
  const refs = [];
  const layers = state.layers.map((l) => {
    const entries =
      clip.layers === 1
        ? targets.includes(l.id)
          ? clip.keys
          : []
        : clip.keys.filter((k) => k.layerId === l.id);
    let out = l;
    for (const e of entries) {
      if (!hasParam(out, e.paramId)) continue;
      const comp = Math.round((atComp + e.dt) * fps) / fps;
      const t = layerSeconds(out.time, comp);
      const keys = setKey(out.keys?.[e.paramId], t, e.v, /** @type {any} */ (e.ease)).map((k) =>
        same(k.t, t) && e.curve ? { ...k, curve: structuredClone(e.curve) } : k,
      );
      out = { ...out, keys: { ...out.keys, [e.paramId]: keys } };
      refs.push({ layerId: l.id, paramId: e.paramId, t });
    }
    return out;
  });
  return { state: { ...state, layers }, refs };
}

/**
 * Every key of the given layers (for "select all keys").
 * @param {{ layers: EditorLayer[] }} state @param {string[]} layerIds @returns {KeyRef[]}
 */
export function allKeys(state, layerIds) {
  const out = [];
  for (const l of state.layers) {
    if (!layerIds.includes(l.id)) continue;
    for (const [pid, keys] of Object.entries(l.keys ?? {})) {
      for (const k of keys ?? []) out.push({ layerId: l.id, paramId: pid, t: k.t });
    }
  }
  return out;
}
