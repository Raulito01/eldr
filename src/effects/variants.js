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
 * WILD mode (D-084) explores much further: numbers × ⅓…3 (by Wildness), effects that are off
 * (turbulence, spin, flicker, trails…) may switch on, and every distinct colour ramp is swapped
 * for a random one from the ramp library (layers sharing a ramp keep sharing). In Subtle mode
 * with Colour on, all ramps get a small shared hue / brightness shift (sister colours).
 * Never varied: colours when Colour is locked, timing (start / stop / pre-warm), positions,
 * directions, safety caps, anything with keyframes, and locked layers. Deterministic: the same
 * variant seed gives the same variant.
 */

import { parseHex, toHex } from '../core/color.js';
import { hash32, subSeed } from '../core/hash.js';
import { createRng } from '../core/prng.js';
import { RAMP_PRESETS } from '../render/rampPresets.js';
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

/** Settings that are often 0 (off) and that Wild may switch on. */
const SPICE = new Set([
  'emit.turbulence',
  'emit.spin',
  'emit.flicker',
  'emit.colorVariance',
  'trail.count',
  'blob.wobble',
  'puff.wobble',
]);

/** rgb 0–255 → hsl (h 0–360, s / l 0–1). @param {number[]} c */
function toHsl([r, g, b]) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, l];
}
/** @param {number} h @param {number} s @param {number} l @returns {number[]} rgb 0–255 */
function fromHsl(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

/**
 * Shift a ramp's hue (degrees) and lightness (± fraction). Exported for tests.
 * @param {{ pos: number, color: string }[]} stops @param {number} dh @param {number} dl
 */
export function shiftRamp(stops, dh, dl) {
  return stops.map((st) => {
    const c = parseHex(st.color);
    const [hh, ss, ll] = toHsl(c);
    const rgb = fromHsl(
      (((hh + dh) % 360) + 360) % 360,
      ss,
      Math.max(0, Math.min(1, ll * (1 + dl))),
    );
    return { ...st, color: toHex([rgb[0], rgb[1], rgb[2], c[3]]) };
  });
}

const LIBRARY = Object.keys(RAMP_PRESETS);

/**
 * @typedef {object} VariantOptions
 * @property {'subtle' | 'wild'} [mode]  subtle (default) or wild
 * @property {number} [wildness]  wild mode: 0–1 (how far it goes)
 * @property {number} [amount]  0 = new randomness only; 0.2 = numbers within ±20 %
 * @property {{ shape?: boolean, motion?: boolean, colour?: boolean }} [lock]  categories kept
 * @property {Iterable<string>} [lockedLayers]  layer ids kept exactly as they are
 */

/**
 * @template {{ layers: any[], comps?: Record<string, any> }} D
 * @param {D} doc @param {number} variantSeed @param {VariantOptions} [o] @returns {D}
 */
export function makeVariant(doc, variantSeed, o = {}) {
  const wild = o.mode === 'wild';
  const wildness = Math.max(0, Math.min(1, o.wildness ?? 0.6));
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
  // colour: one shared hue / lightness shift (subtle) or a library ramp per distinct ramp (wild)
  const crng = createRng(hash32(variantSeed, 0xc010));
  const dh = (crng.next() * 2 - 1) * 20;
  const dl = (crng.next() * 2 - 1) * 0.08;
  /** @type {Map<string, any>} */
  const ramps = new Map();
  const recolour = (/** @type {any} */ stops) => {
    if (!Array.isArray(stops)) return stops;
    const k = JSON.stringify(stops);
    if (!ramps.has(k)) {
      if (wild) {
        const pick = LIBRARY[createRng(hash32(variantSeed, k)).int(0, LIBRARY.length - 1)];
        ramps.set(
          k,
          RAMP_PRESETS[pick].stops.map((st) => ({ ...st })),
        );
      } else ramps.set(k, shiftRamp(stops, dh, dl));
    }
    return structuredClone(ramps.get(k));
  };
  /** @param {any} l */
  const vary = (l) => {
    if (locked.has(l.id)) return l;
    const out = { ...l, seedKey: newKey(l.seedKey ?? l.id) };
    if (!wild && !(amount > 0) && lock.colour) return out;
    const schema = /** @type {any[]} */ (/** @type {any} */ (LAYER_TYPES)[l.type]?.schema ?? []);
    const params = { ...l.params };
    for (const d of schema) {
      if (!(d.id in params) || l.keys?.[d.id]?.length) continue;
      if (d.type === 'ramp') {
        if (!lock.colour) params[d.id] = recolour(params[d.id]);
        continue;
      }
      if ((d.type !== 'float' && d.type !== 'int') || NEVER.has(d.id)) continue;
      if (lock[variantCategory(d.id)]) continue;
      const v = params[d.id];
      if (typeof v !== 'number') continue;
      const rng = createRng(subSeed(variantSeed, `${l.id}|${d.id}`));
      let next;
      if (wild) {
        if (v === 0) {
          // an effect that is off may switch on
          if (!SPICE.has(d.id) || !(rng.next() < 0.35 * wildness)) continue;
          next = d.min + (d.max - d.min) * (0.04 + 0.16 * rng.next());
        } else next = v * Math.exp((rng.next() * 2 - 1) * Math.log(3) * wildness);
      } else {
        if (v === 0 || !(amount > 0)) continue;
        next = v * (1 + amount * (rng.next() * 2 - 1));
      }
      const snapped = sanitizeValue(d, next);
      if (typeof snapped === 'number') params[d.id] = snapped;
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
