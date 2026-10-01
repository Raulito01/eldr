// @ts-check
/**
 * Determinism check (brief §8.1): render every frame of an effect twice — once in order with
 * one renderer, once in a scrambled order with a fresh renderer — and compare pixel hashes.
 * Any difference means hidden state or non-seeded randomness somewhere in the render path.
 * Used by the unit tests (Node) and test-pages/determinism.html (browser).
 */

import { hashBytes } from '../core/hash.js';
import { createRng } from '../core/prng.js';
import { createRenderer } from './renderer.js';

/**
 * @typedef {object} DeterminismResult
 * @property {boolean} ok
 * @property {number} frames
 * @property {number[]} mismatches   frame indices whose hashes differed
 * @property {string[]} hashes       per-frame hash from the in-order pass
 * @property {number} ms             total time for both passes
 */

/**
 * @param {{ backend: import('./canvas2d/backend.js').Backend, layerTypes: Record<string, import('./renderer.js').LayerType> }} deps
 * @param {import('./renderer.js').Effect} effect
 * @param {number} seed
 * @param {import('./renderer.js').RenderSettings} settings
 * @returns {DeterminismResult}
 */
export function checkDeterminism(deps, effect, seed, settings) {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const n = effect.timing.frameCount;
  const hashFrame = (/** @type {ReturnType<typeof createRenderer>} */ r, /** @type {number} */ f) =>
    hashBytes(r.renderFrameImageData(effect, seed, f, settings).data);

  const first = createRenderer(deps);
  const hashes = Array.from({ length: n }, (_, f) => hashFrame(first, f));

  // Scrambled order (seeded Fisher–Yates, so a failure is reproducible).
  const order = Array.from({ length: n }, (_, i) => i);
  const rng = createRng(n * 7919 + seed);
  for (let i = n - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const second = createRenderer(deps);
  const mismatches = [];
  for (const f of order) if (hashFrame(second, f) !== hashes[f]) mismatches.push(f);
  mismatches.sort((a, b) => a - b);

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return { ok: mismatches.length === 0, frames: n, mismatches, hashes, ms: end - start };
}
