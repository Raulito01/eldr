// @ts-check
/**
 * Keyframes (step 3.6c, D-054). Any parameter can be animated: a sorted list of keys
 * { t: seconds (layer time), v: value, ease } replaces its fixed value.
 *
 * Interpolation between key A and key B uses A's `ease`:
 * - 'linear' — straight line
 * - 'ease'   — After Effects' Easy Ease (cubic-bezier 0.33, 0, 0.67, 1)
 * - 'hold'   — A's value until B
 * By parameter type: float / int / colour blend; ramps and curves blend when their point
 * counts match (otherwise they switch at B, like hold); bool / enum / seed always hold.
 * Before the first key → first value; after the last → last value.
 */

import { parseHex, toHex } from './color.js';
import { cubicBezier } from './easing.js';

/** @typedef {'linear' | 'ease' | 'hold'} KeyEase */
/** @typedef {{ t: number, v: any, ease: KeyEase }} Keyframe */
/** @typedef {Record<string, Keyframe[]>} KeyMap  param id → keys */

export const KEY_EASES = Object.freeze(/** @type {KeyEase[]} */ (['linear', 'ease', 'hold']));

/** Keys closer than this (seconds) are the same key. */
export const KEY_EPSILON = 1e-4;

const easyEase = cubicBezier(0.33, 0, 0.67, 1);
const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ u) =>
  a + (b - a) * u;

/**
 * Blend two values of a parameter. Returns null when the type can't blend (caller holds).
 * @param {{ type: string }} def @param {any} a @param {any} b @param {number} u 0–1
 */
export function blend(def, a, b, u) {
  switch (def.type) {
    case 'float':
      return lerp(a, b, u);
    case 'int':
      return Math.round(lerp(a, b, u));
    case 'color': {
      const ca = parseHex(a);
      const cb = parseHex(b);
      return toHex(ca.map((v, i) => lerp(v, cb[i], u)));
    }
    case 'ramp':
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
      return a.map((s, i) => ({
        pos: lerp(s.pos, b[i].pos, u),
        color: toHex(parseHex(s.color).map((v, k) => lerp(v, parseHex(b[i].color)[k], u))),
      }));
    case 'curve':
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
      return a.map((p, i) => ({ x: lerp(p.x, b[i].x, u), y: lerp(p.y, b[i].y, u) }));
    default:
      return null; // bool, enum, seed: hold
  }
}

/**
 * Value of an animated parameter at time t.
 * @param {{ type: string }} def @param {Keyframe[]} keys sorted by t, non-empty
 * @param {number} t seconds
 */
export function valueAt(def, keys, t) {
  if (t <= keys[0].t) return keys[0].v;
  const last = keys[keys.length - 1];
  if (t >= last.t) return last.v;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  if (a.ease === 'hold') return a.v;
  const span = b.t - a.t;
  const raw = span > 0 ? (t - a.t) / span : 1;
  const u = a.ease === 'ease' ? easyEase(raw) : raw;
  const v = blend(def, a.v, b.v, u);
  return v === null ? (raw < 1 ? a.v : b.v) : v;
}

/**
 * Params with every animated value resolved at time t.
 * @param {ReadonlyArray<{ id: string, type: string }>} schema
 * @param {Record<string, any>} params @param {KeyMap | undefined} keys @param {number} t
 */
export function resolveParams(schema, params, keys, t) {
  if (!keys) return params;
  let out = params;
  for (const def of schema) {
    const k = keys[def.id];
    if (!k?.length) continue;
    if (out === params) out = { ...params };
    out[def.id] = valueAt(def, k, t);
  }
  return out;
}

/**
 * Add or replace the key at time t (sorted, immutable).
 * @param {Keyframe[] | undefined} keys @param {number} t @param {any} v @param {KeyEase} [ease]
 * @returns {Keyframe[]}
 */
export function setKey(keys = [], t, v, ease) {
  const i = keys.findIndex((k) => Math.abs(k.t - t) < KEY_EPSILON);
  const key = { t, v: structuredClone(v), ease: ease ?? (i >= 0 ? keys[i].ease : 'ease') };
  const out = i >= 0 ? keys.map((k, j) => (j === i ? key : k)) : [...keys, key];
  return out.sort((a, b) => a.t - b.t);
}

/** Remove the key at time t. @param {Keyframe[] | undefined} keys @param {number} t */
export const removeKey = (keys = [], t) => keys.filter((k) => Math.abs(k.t - t) >= KEY_EPSILON);

/** Is there a key at time t? @param {Keyframe[] | undefined} keys @param {number} t */
export const hasKeyAt = (keys = [], t) => keys.some((k) => Math.abs(k.t - t) < KEY_EPSILON);

/**
 * Move the key at `from` to `to` (a key already at `to` is replaced).
 * @param {Keyframe[] | undefined} keys @param {number} from @param {number} to
 */
export function moveKey(keys = [], from, to) {
  const k = keys.find((x) => Math.abs(x.t - from) < KEY_EPSILON);
  if (!k) return keys;
  return setKey(removeKey(keys, from), to, k.v, k.ease);
}

/** Change the ease of the key at t. @param {Keyframe[] | undefined} keys @param {number} t @param {KeyEase} ease */
export const setKeyEase = (keys = [], t, ease) =>
  keys.map((k) => (Math.abs(k.t - t) < KEY_EPSILON ? { ...k, ease } : k));
