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

/**
 * After Effects [ and ] (3.7d): slide a layer so its IN point starts at `now`, or its OUT point
 * ends right after the frame at `now` (the layer still shows on that frame).
 * @param {import('./layerAnimation.js').LayerTime} t @param {'in'|'out'} edge
 * @param {number} now comp seconds (on a frame) @param {number} end comp length @param {number} fps
 * @returns {import('./layerAnimation.js').LayerTime}
 */
export function alignLayerTime(t, edge, now, end, fps) {
  const out0 = t.out ?? end;
  const ds = edge === 'in' ? now - t.in : now + 1 / fps - out0;
  const out = t.out === null && edge === 'in' ? null : out0 + ds;
  return {
    ...t,
    offset: t.offset + ds,
    in: Math.max(0, t.in + ds),
    out: out !== null && out >= end - 1e-9 ? null : out,
  };
}

/**
 * After Effects ⌥[ and ⌥] (3.7d): trim the IN point to `now`, or the OUT point to just after
 * the frame at `now`. A layer always keeps at least one frame.
 * @param {import('./layerAnimation.js').LayerTime} t @param {'in'|'out'} edge
 * @param {number} now @param {number} end @param {number} fps
 * @returns {import('./layerAnimation.js').LayerTime}
 */
export function trimLayerTime(t, edge, now, end, fps) {
  const frame = 1 / fps;
  const out0 = t.out ?? end;
  if (edge === 'in') return { ...t, in: Math.max(0, Math.min(now, out0 - frame)) };
  const out = Math.max(t.in + frame, now + frame);
  return { ...t, out: out >= end - 1e-9 ? null : out };
}

/**
 * First and last frame a layer shows (I / O go there).
 * @param {import('./layerAnimation.js').LayerTime} t @param {number} fps @param {number} frameCount
 */
export function layerFrames(t, fps, frameCount) {
  const first = Math.max(0, Math.min(frameCount - 1, Math.round(t.in * fps)));
  const out = t.out ?? frameCount / fps;
  const last = Math.max(first, Math.min(frameCount - 1, Math.round(out * fps) - 1));
  return { first, last };
}
