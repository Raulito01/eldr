// @ts-check
/**
 * Keyframes (step 3.6c, D-054). Any parameter can be animated: a sorted list of keys
 * { t: seconds (layer time), v: value, ease } replaces its fixed value.
 *
 * After Effects interpolation (3.7c, D-059). Each key has an OUT side (its `ease`) and an IN
 * side (`in`); the segment A → B is a cubic bezier in (time, value) built from A's out handle and
 * B's in handle. A handle is { speed, influence }: speed in value units per second (layer
 * time), influence = how far the handle reaches into the segment, 0.1–100 % (After Effects'
 * Keyframe Velocity). Speeds can overshoot (the value goes past the next key).
 *
 * `ease` (A's out side):
 * - 'linear' — straight towards B · 'hold' — A's value until B
 * - 'bezier' — uses `out` (default Easy Ease: speed 0, influence 33.33 %)
 * - 'ease'   — older files / quick keys: Easy Ease on both ends of the segment (the
 *   cubic-bezier 0.33, 0, 0.67, 1 of 0.0.30–0.0.32) unless B has its own `in`
 * `in` (B's in side): { type: 'linear' } or { type: 'bezier', speed, influence }; when missing it
 * follows A's ease ('ease' → eased, otherwise linear).
 *
 * By parameter type: float / int blend in value space (clamped to the param's min / max);
 * colour / ramp / curve follow the same curve as 0–1 progress (ramps and curves blend when their
 * point counts match, otherwise they switch at B); bool / enum / seed always hold.
 * Before the first key → first value; after the last → last value.
 */

import { parseHex, toHex } from './color.js';

/** @typedef {'linear' | 'ease' | 'hold' | 'bezier'} KeyEase */
/** @typedef {{ speed: number, influence: number }} KeyHandle  influence in % (0.1–100) */
/** @typedef {{ type: 'linear' } | { type: 'bezier', speed: number, influence: number }} KeyIn */
/** @typedef {{ t: number, v: any, ease: KeyEase, in?: KeyIn, out?: KeyHandle }} Keyframe */
/** @typedef {Record<string, Keyframe[]>} KeyMap  param id → keys */

export const KEY_EASES = Object.freeze(
  /** @type {KeyEase[]} */ (['linear', 'ease', 'hold', 'bezier']),
);

/** Keys closer than this (seconds) are the same key. */
export const KEY_EPSILON = 1e-4;

/** After Effects' Easy Ease handle (F9). */
export const EASY_EASE = Object.freeze({ speed: 0, influence: 33.33 });
/** The 0.0.30 'ease' curve, cubic-bezier(0.33, 0, 0.67, 1): kept exactly for older files. */
const LEGACY_EASE = Object.freeze({ speed: 0, influence: 33 });
export const MIN_INFLUENCE = 0.1;
export const MAX_INFLUENCE = 100;
const clampInfluence = (/** @type {number} */ x) =>
  Math.min(MAX_INFLUENCE, Math.max(MIN_INFLUENCE, Number.isFinite(x) ? x : 33.33));

/**
 * The handles of the segment a → b; null = linear on that side.
 * @param {Keyframe} a @param {Keyframe} b
 * @returns {{ out: KeyHandle | null, in: KeyHandle | null }}
 */
export function segmentHandles(a, b) {
  const out = a.ease === 'ease' ? LEGACY_EASE : a.ease === 'bezier' ? (a.out ?? EASY_EASE) : null;
  /** @type {KeyHandle | null} */
  let inn = null;
  if (b.in) {
    if (b.in.type === 'bezier')
      inn = { speed: b.in.speed ?? 0, influence: b.in.influence ?? 33.33 };
  } else if (a.ease === 'ease') inn = LEGACY_EASE;
  return { out, in: inn };
}

/**
 * Bezier control points of the segment a → b with values va → vb (numbers; layer seconds).
 * A linear side uses the chord's speed at 1/3 influence.
 * @param {Keyframe} a @param {Keyframe} b @param {number} va @param {number} vb
 * @returns {[number, number][]}
 */
export function segmentBezier(a, b, va, vb) {
  const dt = b.t - a.t;
  const chord = dt > 0 ? (vb - va) / dt : 0;
  const h = segmentHandles(a, b);
  const io = h.out ? clampInfluence(h.out.influence) / 100 : 1 / 3;
  const so = h.out ? h.out.speed : chord;
  const ii = h.in ? clampInfluence(h.in.influence) / 100 : 1 / 3;
  const si = h.in ? h.in.speed : chord;
  return [
    [a.t, va],
    [a.t + io * dt, va + so * io * dt],
    [b.t - ii * dt, vb - si * ii * dt],
    [b.t, vb],
  ];
}

/** 1D cubic bezier. @param {number} s @param {number} p0 @param {number} p1 @param {number} p2 @param {number} p3 */
export const bez = (s, p0, p1, p2, p3) => {
  const m = 1 - s;
  return m * m * m * p0 + 3 * m * m * s * p1 + 3 * m * s * s * p2 + s * s * s * p3;
};

/** Bezier parameter s where x(s) = x (x monotonic between p0 and p3). */
function solveX(/** @type {number} */ x, /** @type {number[]} */ px) {
  const [p0, p1, p2, p3] = px;
  let lo = 0;
  let hi = 1;
  let s = (x - p0) / (p3 - p0 || 1);
  for (let i = 0; i < 8; i++) {
    const err = bez(s, p0, p1, p2, p3) - x;
    if (Math.abs(err) < 1e-9) return s;
    if (err > 0) hi = Math.min(hi, s);
    else lo = Math.max(lo, s);
    const m = 1 - s;
    const d = 3 * m * m * (p1 - p0) + 6 * m * s * (p2 - p1) + 3 * s * s * (p3 - p2);
    const next = Math.abs(d) > 1e-12 ? s - err / d : (lo + hi) / 2;
    s = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (bez(mid, p0, p1, p2, p3) < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Value of the segment's curve at time t (numbers).
 * @param {[number, number][]} cp control points from segmentBezier @param {number} t
 */
export function bezierAt(cp, t) {
  const s = solveX(
    t,
    cp.map((p) => p[0]),
  );
  return bez(s, cp[0][1], cp[1][1], cp[2][1], cp[3][1]);
}

const isNumberType = (/** @type {string} */ type) => type === 'float' || type === 'int';

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
    case 'path':
      // mask paths (3.6d): vertices and their bezier handles, when the vertex counts match
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return null;
      return a.map((p, i) => {
        const q = b[i];
        return {
          x: lerp(p.x, q.x, u),
          y: lerp(p.y, q.y, u),
          ix: lerp(p.ix, q.ix, u),
          iy: lerp(p.iy, q.iy, u),
          ox: lerp(p.ox, q.ox, u),
          oy: lerp(p.oy, q.oy, u),
        };
      });
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
  if (b.t - a.t <= 0) return b.v;
  /** @type {any} */
  const d = def;
  if (isNumberType(def.type)) {
    let v = bezierAt(segmentBezier(a, b, Number(a.v), Number(b.v)), t);
    if (Number.isFinite(d.min)) v = Math.max(d.min, v);
    if (Number.isFinite(d.max)) v = Math.min(d.max, v);
    return def.type === 'int' ? Math.round(v) : v;
  }
  // Colours, ramps, curves: the same curve as progress 0 → 1 (clamped: no overshoot).
  const u = Math.min(1, Math.max(0, bezierAt(segmentBezier(a, b, 0, 1), t)));
  const v = blend(def, a.v, b.v, u);
  return v === null ? a.v : v; // can't blend: switch at B (t < b.t here)
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
  // Replacing a key keeps its interpolation (handles); a new key gets Easy Ease.
  /** @type {Keyframe} */
  const key =
    i >= 0
      ? { ...keys[i], t, v: structuredClone(v), ease: ease ?? keys[i].ease }
      : { t, v: structuredClone(v), ease: ease ?? 'ease' };
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
  return [...removeKey(removeKey(keys, from), to), { ...k, t: to }].sort((a, b) => a.t - b.t);
}

/** Change the ease of the key at t. @param {Keyframe[] | undefined} keys @param {number} t @param {KeyEase} ease */
export const setKeyEase = (keys = [], t, ease) =>
  keys.map((k) => (Math.abs(k.t - t) < KEY_EPSILON ? { ...k, ease } : k));
