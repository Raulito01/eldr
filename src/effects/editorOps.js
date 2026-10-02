// @ts-check
/**
 * Small editor operations (3.7, D-056): keyframe navigation and centring layers. Pure.
 */

import {
  apply,
  applyVector,
  identity,
  invert,
  localMatrix,
  worldMatrices,
} from '../core/transform2d.js';
import { applyValues } from './animEdit.js';
import { compSeconds, layerAt } from './layerAnimation.js';

/**
 * Every frame that has a key, on any layer (sorted, unique) — what J / K jump between.
 * @param {{ layers: import('./explosion/explosion.js').EditorLayer[] }} state
 * @param {number} fps @param {number} frameCount
 * @param {string} [onlyLayer] limit to one layer
 */
export function keyFrames(state, fps, frameCount, onlyLayer) {
  const frames = new Set();
  for (const l of state.layers) {
    if (onlyLayer && l.id !== onlyLayer) continue;
    for (const keys of Object.values(l.keys ?? {})) {
      for (const k of keys ?? []) {
        const f = Math.round(compSeconds(l.time, k.t) * fps);
        if (f >= 0 && f < frameCount) frames.add(f);
      }
    }
  }
  return [...frames].sort((a, b) => a - b);
}

/**
 * The previous (dir −1) or next (+1) key frame from `frame`, or null when there is none.
 * @param {number[]} frames sorted @param {number} frame @param {-1 | 1} dir
 */
export function jumpKey(frames, frame, dir) {
  if (dir > 0) return frames.find((f) => f > frame) ?? null;
  for (let i = frames.length - 1; i >= 0; i--) if (frames[i] < frame) return frames[i];
  return null;
}

/**
 * Move a layer so its anchor sits in the centre of the frame (through its parent), at comp
 * time s. Animated transforms get a key (After Effects: Ctrl/⌘ + Home).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @param {number} s comp seconds
 * @returns {S}
 */
export function centreLayer(state, id, s) {
  const layers = state.layers.map((l) => layerAt(l, s));
  const l = layers.find((x) => x.id === id);
  if (!l) return state;
  const worlds = worldMatrices(layers);
  const parentWorld = (l.parent && worlds.get(l.parent)) || identity();
  const [x, y] = apply(invert(parentWorld), 0, 0);
  return applyValues(state, id, { 'transform.x': x, 'transform.y': y }, s);
}

/**
 * Put a layer's anchor point on its own origin (the centre of its procedural content) without
 * moving it on screen (After Effects: Ctrl/⌘ + ⌥ + Home).
 * @template {{ layers: import('./explosion/explosion.js').EditorLayer[] }} S
 * @param {S} state @param {string} id @param {number} s comp seconds
 * @returns {S}
 */
export function centreAnchor(state, id, s) {
  const l = layerAt(/** @type {any} */ (state.layers.find((x) => x.id === id)), s);
  if (!l) return state;
  const t = l.transform;
  // x' = x + R·S·(a' − a) with a' = (0, 0)
  const [dx, dy] = applyVector(localMatrix(t), -t.anchorX, -t.anchorY);
  return applyValues(
    state,
    id,
    {
      'transform.anchorX': 0,
      'transform.anchorY': 0,
      'transform.x': t.x + dx,
      'transform.y': t.y + dy,
    },
    s,
  );
}
