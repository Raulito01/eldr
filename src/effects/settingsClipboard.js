// @ts-check
/**
 * Copy / paste layer settings (D-074), like After Effects' copy-paste of properties: copy a
 * layer's settings, then paste chosen groups (Emitter, Particle motion, Style, Glow, Texture…)
 * onto one or many layers — even of another type: only the settings both layers have go across
 * (an emitter of sparks gives its spawning, motion and look to an emitter of dots; the shape
 * stays). Keyframes travel with their settings. Random seeds are never pasted.
 */

import { LAYER_TYPES } from './layerTypes.js';

/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */

/**
 * @typedef {object} SettingsClip
 * @property {string} type
 * @property {string} label
 * @property {Record<string, any>} params
 * @property {Record<string, any[]>} keys   keys of those params
 * @property {string} blend
 * @property {number} opacity
 * @property {string} [texture]
 */

/** Pseudo-group for blend mode + opacity. */
export const LOOK_GROUP = 'Blend & opacity';

/** @param {string} type */
const schemaOf = (type) => /** @type {any[]} */ (LAYER_TYPES[type]?.schema ?? []);

/** Copy a layer's settings. @param {EditorLayer} l @returns {SettingsClip} */
export function copyLayerSettings(l) {
  const ids = new Set([...schemaOf(l.type).map((d) => d.id), 'layer.opacity']);
  /** @type {Record<string, any[]>} */
  const keys = {};
  for (const [id, k] of Object.entries(l.keys ?? {})) if (ids.has(id) && k?.length) keys[id] = k;
  return structuredClone({
    type: l.type,
    label: l.label,
    params: l.params,
    keys,
    blend: l.blend,
    opacity: l.opacity,
    ...(l.texture ? { texture: l.texture } : {}),
  });
}

/**
 * Groups that can be pasted onto layers of the given types (shared params only), in the copied
 * layer's order, with how many settings each carries.
 * @param {SettingsClip} clip @param {string[]} targetTypes
 * @returns {{ group: string, ids: string[] }[]}
 */
export function pasteGroups(clip, targetTypes) {
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const d of schemaOf(clip.type)) {
    if (d.type === 'seed') continue;
    if (!targetTypes.some((t) => schemaOf(t).some((x) => x.id === d.id && x.type === d.type)))
      continue;
    const g = d.group ?? 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)?.push(d.id);
  }
  return [
    ...[...groups].map(([group, ids]) => ({ group, ids })),
    { group: LOOK_GROUP, ids: ['layer.blend', 'layer.opacity'] },
  ];
}

/**
 * Paste the chosen groups onto layers. Values replace the target's; animated settings bring
 * their keys (and a static setting removes the target's keys for it).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {string[]} ids target layers @param {SettingsClip} clip
 * @param {string[]} groups names from pasteGroups
 * @returns {S}
 */
export function pasteLayerSettings(state, ids, clip, groups) {
  const chosen = new Set(groups);
  const all = pasteGroups(clip, [clip.type, ...state.layers.map((l) => l.type)]);
  const paramIds = new Set(
    all.filter((g) => chosen.has(g.group) && g.group !== LOOK_GROUP).flatMap((g) => g.ids),
  );
  const look = chosen.has(LOOK_GROUP);
  const texture = chosen.has('Texture');
  return {
    ...state,
    layers: state.layers.map((l) => {
      if (!ids.includes(l.id)) return l;
      const schema = schemaOf(l.type);
      const params = { ...l.params };
      const keys = { ...(l.keys ?? {}) };
      for (const id of paramIds) {
        const d = schema.find((x) => x.id === id);
        if (!d || !(id in clip.params)) continue;
        params[id] = structuredClone(clip.params[id]);
        if (clip.keys[id]?.length) keys[id] = structuredClone(clip.keys[id]);
        else delete keys[id];
      }
      /** @type {EditorLayer} */
      let out = { ...l, params, keys };
      if (look) {
        out = { ...out, blend: /** @type {any} */ (clip.blend), opacity: clip.opacity };
        for (const id of ['layer.opacity']) {
          if (clip.keys[id]?.length) keys[id] = structuredClone(clip.keys[id]);
          else delete keys[id];
        }
      }
      if (texture && schema.some((d) => d.id === 'tex.size')) {
        if (clip.texture) out = { ...out, texture: clip.texture };
        else {
          const { texture: _t, ...rest } = out;
          out = rest;
        }
      }
      return out;
    }),
  };
}
