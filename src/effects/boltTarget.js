// @ts-check
/**
 * Lightning targets (D-072): a bolt layer's tip can end ON another layer (usually a null) — the
 * bolt is re-aimed every frame, so dragging or animating the target drags the bolt's end with
 * it. Without a target the tip is the layer's own End X / End Y (dragged with the tip handle).
 *
 * Geometry: the bolt is drawn from the single element's position (single.x / y, rotated and
 * scaled by single.rotation / scale) in its layer space; the tip is (endX, endY) from there.
 */

import { apply as applyMat, invert } from '../core/transform2d.js';

/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */
const ID = [1, 0, 0, 1, 0, 0];

/** Can this layer take a target? @param {{ type: string }} l */
export const isBoltType = (l) => l.type === 'bolt';

/**
 * World (effect px) point a target layer stands for: its anchor point.
 * @param {EditorLayer} t @param {Map<string, number[]>} worlds
 */
export const targetPoint = (t, worlds) =>
  applyMat(/** @type {any} */ (worlds.get(t.id) ?? ID), t.transform.anchorX, t.transform.anchorY);

/**
 * The bolt's own (single) frame inside its layer: origin, rotation (rad), scale.
 * @param {Record<string, any>} p
 */
const boltFrame = (p) => ({
  x: p['single.x'] ?? 0,
  y: p['single.y'] ?? 0,
  rot: ((p['single.rotation'] ?? 0) * Math.PI) / 180,
  k: p['single.scale'] || 1,
});

/**
 * World point of the bolt's origin and tip (End X / End Y, no target).
 * @param {EditorLayer} l @param {Map<string, number[]>} worlds
 */
export function boltEnds(l, worlds) {
  const W = /** @type {any} */ (worlds.get(l.id) ?? ID);
  const f = boltFrame(l.params);
  const ex = l.params['bolt.endX'] * f.k;
  const ey = l.params['bolt.endY'] * f.k;
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  return {
    start: applyMat(W, f.x, f.y),
    end: applyMat(W, f.x + ex * c - ey * s, f.y + ex * s + ey * c),
  };
}

/**
 * End X / End Y that put the bolt's tip at a world point.
 * @param {EditorLayer} l @param {Map<string, number[]>} worlds @param {number} wx @param {number} wy
 * @returns {{ 'bolt.endX': number, 'bolt.endY': number }}
 */
export function endForWorld(l, worlds, wx, wy) {
  const inv = invert(/** @type {any} */ (worlds.get(l.id) ?? ID));
  const [lx, ly] = applyMat(inv, wx, wy);
  const f = boltFrame(l.params);
  const dx = (lx - f.x) / f.k;
  const dy = (ly - f.y) / f.k;
  const c = Math.cos(-f.rot);
  const s = Math.sin(-f.rot);
  return { 'bolt.endX': dx * c - dy * s, 'bolt.endY': dx * s + dy * c };
}

/**
 * Params of a bolt with a target: End X / Y aimed at the target's anchor point. Others, or a
 * missing target: the params unchanged.
 * @param {EditorLayer} l @param {EditorLayer[]} layers @param {Map<string, number[]>} worlds
 */
export function aimedParams(l, layers, worlds) {
  if (!isBoltType(l) || !l.target) return l.params;
  const t = layers.find((x) => x.id === l.target && x.id !== l.id);
  if (!t) return l.params;
  const [wx, wy] = targetPoint(t, worlds);
  return { ...l.params, ...endForWorld(l, worlds, wx, wy) };
}

/**
 * Layers a bolt can end on: every other layer of the comp.
 * @param {EditorLayer[]} layers @param {string} id
 */
export const targetCandidates = (layers, id) => layers.filter((l) => l.id !== id);
