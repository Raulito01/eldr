// @ts-check
/**
 * Variants (D-083): "give me variations of this effect in the same style" (brief §7.2).
 *
 * A variant of a document is made by
 *  1. new randomness: every layer gets a new seed key (layers that SHARE a key — identical
 *     duplicates — keep sharing one), so particles spawn elsewhere, shapes get new outlines;
 *  2. optionally a nudge of the number settings AROUND their current values (amount 0–0.5:
 *     value × (1 ± amount)), snapped to each setting's steps and range — the preset's look
 *     survives, it never jumps to random ranges.
 * Never varied: colours when Colour is locked, timing (start / stop / pre-warm), positions,
 * directions, safety caps, anything with keyframes, and locked layers. Deterministic: the same
 * variant seed gives the same variant.
 */

import { hash32, subSeed } from '../core/hash.js';
import { createRng } from '../core/prng.js';
import { sanitizeValue } from '../schema/validators.js';
import { LAYER_TYPES } from './layerTypes.js';

/** Settings that are never varied (timing, placement, orientation, caps). */
const NEVER = new Set([
  'emit.start',
  'emit.stop',
  'emit.prewarm',
  'emit.maxParticles',
  'emit.direction',
  'emit.pulseEvery',
  'single.start',
  'single.end',
  'single.x',
  'single.y',
  'single.rotation',
  'single.scale',
  'follow.progress',
]);

const COLOUR_PREFIXES = ['style.', 'glow.', 'shade.', 'tex.', 'gmap.'];
const MOTION_PREFIXES = ['emit.', 'burst.', 'orbit.', 'trail.'];
const MOTION_WORDS = /speed|wobble|sway|spin|turb|drift|restrike|flicker|waves/i;

/**
 * Which category a setting belongs to (what the Shape / Motion / Colour locks hold).
 * @param {string} id @returns {'colour' | 'motion' | 'shape'}
 */
export function variantCategory(id) {
  if (id === 'emit.colorVariance' || COLOUR_PREFIXES.some((p) => id.startsWith(p))) return 'colour';
  if (MOTION_PREFIXES.some((p) => id.startsWith(p)) || MOTION_WORDS.test(id)) return 'motion';
  return 'shape';
}

/**
 * @typedef {object} VariantOptions
 * @property {number} [amount]  0 = new randomness only; 0.2 = numbers within ±20 %
 * @property {{ shape?: boolean, motion?: boolean, colour?: boolean }} [lock]  categories kept
 * @property {Iterable<string>} [lockedLayers]  layer ids kept exactly as they are
 */

/**
 * @template {{ layers: any[], comps?: Record<string, any> }} D
 * @param {D} doc @param {number} variantSeed @param {VariantOptions} [o] @returns {D}
 */
export function makeVariant(doc, variantSeed, o = {}) {
  const amount = Math.max(0, Math.min(0.5, o.amount ?? 0));
  const lock = o.lock ?? {};
  const locked = new Set(o.lockedLayers ?? []);
  const tag = (hash32(variantSeed, 0x5eed) >>> 0).toString(36);
  /** old seed key → new (layers sharing a key keep sharing) */
  const keys = new Map();
  const newKey = (/** @type {string} */ k) => {
    if (!keys.has(k)) keys.set(k, `${k.replace(/~[0-9a-z]+$/, '')}~${tag}`);
    return keys.get(k);
  };
  /** @param {any} l */
  const vary = (l) => {
    if (locked.has(l.id)) return l;
    const out = { ...l, seedKey: newKey(l.seedKey ?? l.id) };
    if (!(amount > 0)) return out;
    const schema = /** @type {any[]} */ (/** @type {any} */ (LAYER_TYPES)[l.type]?.schema ?? []);
    const params = { ...l.params };
    for (const d of schema) {
      if ((d.type !== 'float' && d.type !== 'int') || NEVER.has(d.id)) continue;
      if (!(d.id in params) || l.keys?.[d.id]?.length) continue;
      if (lock[variantCategory(d.id)]) continue;
      const v = params[d.id];
      if (typeof v !== 'number' || v === 0) continue;
      const rng = createRng(subSeed(variantSeed, `${l.id}|${d.id}`));
      const next = sanitizeValue(d, v * (1 + amount * (rng.next() * 2 - 1)));
      if (typeof next === 'number') params[d.id] = next;
    }
    out.params = params;
    return out;
  };
  /** @type {any} */
  const next = { ...doc, layers: doc.layers.map(vary) };
  if (doc.comps) {
    next.comps = Object.fromEntries(
      Object.entries(doc.comps).map(([id, c]) => [id, { ...c, layers: c.layers.map(vary) }]),
    );
  }
  return next;
}
