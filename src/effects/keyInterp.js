// @ts-check
/**
 * Keyframe interpolation, the After Effects way (3.7c, D-059). Pure: state in, new state out.
 *
 * - Easy Ease (F9): both sides bezier, speed 0, influence 33.33 %.
 * - Easy Ease In (⇧F9): the IN side only · Easy Ease Out (⌘⇧F9): the OUT side only.
 * - Linear: both sides linear · Hold: the value holds until the next key (toggle).
 * - Keyframe Velocity: speed (units / s) and influence (%) per side.
 * - Graph Editor helpers: handle positions, dragging a handle (continuous keys move both
 *   sides' speed together; ⌥ breaks them), moving key values.
 *
 * Before changing a key, its parameter's keys are MATERIALIZED: every key gets an explicit `in`
 * and old 'ease' keys become 'bezier' with the same curve — so editing one key never changes the
 * shape of a neighbouring segment by accident.
 */

import {
  EASY_EASE,
  KEY_EPSILON,
  MAX_INFLUENCE,
  MIN_INFLUENCE,
  segmentBezier,
  segmentHandles,
} from '../core/keyframes.js';
import { LAYER_ANIM_DEFS } from './layerAnimation.js';
import { LAYER_TYPES } from './layerTypes.js';
import { maskParamDef } from './maskParams.js';

/** @typedef {import('../core/keyframes.js').Keyframe} Keyframe */
/** @typedef {import('./keyEdit.js').KeyRef} KeyRef */
/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */
/** @typedef {'linear' | 'easy' | 'easeIn' | 'easeOut' | 'hold' | 'toggleHold'} InterpKind */

const same = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) < KEY_EPSILON;
const clampInf = (/** @type {number} */ x) => Math.min(MAX_INFLUENCE, Math.max(MIN_INFLUENCE, x));

/** Schema def of a param on a layer (type, min, max…). @param {EditorLayer} l @param {string} id */
export function defOf(l, id) {
  const md = maskParamDef(id);
  if (md) return /** @type {any} */ (md);
  return /** @type {any} */ (
    [...LAYER_ANIM_DEFS, ...(LAYER_TYPES[l.type]?.schema ?? [])].find((d) => d.id === id)
  );
}

/** Can this param be shown on the value graph / given speeds? @param {EditorLayer} l @param {string} id */
export const isNumericParam = (l, id) => {
  const t = defOf(l, id)?.type;
  return t === 'float' || t === 'int';
};

/**
 * Every key with explicit handles; the curve is unchanged.
 * @param {Keyframe[]} keys @returns {Keyframe[]}
 */
export function materialize(keys) {
  return keys.map((k, i) => {
    /** @type {Keyframe} */
    let out = { ...k };
    if (i > 0 && !k.in) {
      const h = segmentHandles(keys[i - 1], k).in;
      out.in = h ? { type: 'bezier', speed: h.speed, influence: h.influence } : { type: 'linear' };
    }
    if (k.ease === 'ease') {
      const h = segmentHandles(k, { ...k, in: { type: 'linear' } }).out;
      out = { ...out, ease: 'bezier', out: h ? { ...h } : { ...EASY_EASE } };
    }
    return out;
  });
}

/** Change selected keys, materializing their params first. */
function editKeys(
  /** @type {{ layers: EditorLayer[] }} */ state,
  /** @type {KeyRef[]} */ refs,
  /** @type {(k: Keyframe, i: number, keys: Keyframe[], l: EditorLayer, pid: string) => Keyframe} */ fn,
) {
  const layers = state.layers.map((l) => {
    const mine = refs.filter((r) => r.layerId === l.id);
    if (!mine.length) return l;
    const keys = { ...l.keys };
    for (const pid of new Set(mine.map((r) => r.paramId))) {
      if (!keys[pid]?.length) continue;
      const list = materialize(keys[pid]);
      keys[pid] = list.map((k, i) =>
        mine.some((r) => r.paramId === pid && same(r.t, k.t)) ? fn(k, i, list, l, pid) : k,
      );
    }
    return { ...l, keys };
  });
  return { ...state, layers };
}

/**
 * Easy Ease / In / Out, Linear, Hold on selected keys.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @param {InterpKind} kind @returns {S}
 */
export function applyInterp(state, refs, kind) {
  const easyIn = /** @type {const} */ ({ type: 'bezier', ...EASY_EASE });
  const allHold =
    kind === 'toggleHold' &&
    refs.every(
      (r) =>
        state.layers.find((l) => l.id === r.layerId)?.keys?.[r.paramId]?.find((k) => same(k.t, r.t))
          ?.ease === 'hold',
    );
  return /** @type {S} */ (
    editKeys(state, refs, (k) => {
      switch (kind) {
        case 'linear': {
          const { out: _o, ...rest } = k;
          return { ...rest, ease: 'linear', in: { type: 'linear' } };
        }
        case 'easy':
          return { ...k, ease: 'bezier', out: { ...EASY_EASE }, in: { ...easyIn } };
        case 'easeIn':
          return { ...k, in: { ...easyIn } };
        case 'easeOut':
          return { ...k, ease: 'bezier', out: { ...EASY_EASE } };
        case 'hold':
          return { ...k, ease: 'hold' };
        case 'toggleHold':
          return allHold ? { ...k, ease: k.out ? 'bezier' : 'linear' } : { ...k, ease: 'hold' };
        default:
          return k;
      }
    })
  );
}

/**
 * Effective speed / influence of a key's sides (linear sides report the chord speed, 33.33 %).
 * `in` is null on the first key, `out` null on the last key or a hold key.
 * @param {Keyframe[]} keys @param {number} i @param {boolean} numeric
 */
export function keyVelocity(keys, i, numeric) {
  const val = (/** @type {Keyframe} */ k, /** @type {number} */ fallback) =>
    numeric ? Number(k.v) : fallback;
  /** @param {Keyframe} a @param {Keyframe} b @param {'out'|'in'} side */
  const side = (a, b, side) => {
    const cp = segmentBezier(a, b, val(a, 0), val(b, 1));
    const dt = b.t - a.t;
    if (side === 'out') {
      const dx = cp[1][0] - cp[0][0];
      return {
        speed: dx > 1e-12 ? (cp[1][1] - cp[0][1]) / dx : 0,
        influence: dt > 0 ? (dx / dt) * 100 : 33.33,
        linear: !segmentHandles(a, b).out,
      };
    }
    const dx = cp[3][0] - cp[2][0];
    return {
      speed: dx > 1e-12 ? (cp[3][1] - cp[2][1]) / dx : 0,
      influence: dt > 0 ? (dx / dt) * 100 : 33.33,
      linear: !segmentHandles(a, b).in,
    };
  };
  const k = keys[i];
  return {
    in: i > 0 && keys[i - 1].ease !== 'hold' ? side(keys[i - 1], k, 'in') : null,
    out: i < keys.length - 1 && k.ease !== 'hold' ? side(k, keys[i + 1], 'out') : null,
  };
}

/**
 * Keyframe Velocity dialog: set speed / influence (bezier) on the given sides of selected keys.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs
 * @param {{ in?: { speed: number, influence: number }, out?: { speed: number, influence: number } }} v
 * @returns {S}
 */
export function setVelocity(state, refs, v) {
  return /** @type {S} */ (
    editKeys(state, refs, (k) => {
      let out = k;
      if (v.in) {
        out = {
          ...out,
          in: { type: 'bezier', speed: v.in.speed, influence: clampInf(v.in.influence) },
        };
      }
      if (v.out && k.ease !== 'hold') {
        out = {
          ...out,
          ease: 'bezier',
          out: { speed: v.out.speed, influence: clampInf(v.out.influence) },
        };
      }
      return out;
    })
  );
}

/** Both sides bezier with the same speed (After Effects "continuous"). @param {Keyframe} k */
export const isContinuous = (k) =>
  k.ease === 'bezier' &&
  k.in?.type === 'bezier' &&
  !!k.out &&
  Math.abs(k.in.speed - k.out.speed) < 1e-6;

/**
 * Graph handle points of key i (layer seconds, values): where its in / out handles are drawn.
 * @param {Keyframe[]} keys @param {number} i
 * @returns {{ in: [number, number] | null, out: [number, number] | null }}
 */
export function handlePoints(keys, i) {
  const k = keys[i];
  const prev = keys[i - 1];
  const next = keys[i + 1];
  return {
    in:
      prev && prev.ease !== 'hold' ? segmentBezier(prev, k, Number(prev.v), Number(k.v))[2] : null,
    out: next && k.ease !== 'hold' ? segmentBezier(k, next, Number(k.v), Number(next.v))[1] : null,
  };
}

/**
 * Drag a handle on the value graph to (t, v) (layer seconds, value). The side becomes bezier:
 * influence from the horizontal reach, speed from the slope. A continuous key moves the other
 * side's speed too unless `broken` (⌥).
 * @param {Keyframe[]} keys materialized @param {number} i @param {'in'|'out'} which
 * @param {number} t @param {number} v @param {{ broken?: boolean }} [o]
 * @returns {Keyframe[]}
 */
export function dragHandle(keys, i, which, t, v, o = {}) {
  const k = keys[i];
  const other = which === 'out' ? keys[i - 1] : keys[i + 1];
  const neighbour = which === 'out' ? keys[i + 1] : keys[i - 1];
  if (!neighbour) return keys;
  const dt = Math.abs(neighbour.t - k.t);
  const reach = Math.max(dt * 0.001, which === 'out' ? t - k.t : k.t - t);
  const influence = clampInf((reach / dt) * 100);
  const speed = (which === 'out' ? v - Number(k.v) : Number(k.v) - v) / reach;
  const linked = !o.broken && isContinuous(k) && !!other;
  /** @type {Keyframe} */
  let nk = { ...k };
  if (which === 'out') nk = { ...nk, ease: 'bezier', out: { speed, influence } };
  else nk = { ...nk, in: { type: 'bezier', speed, influence } };
  if (linked) {
    if (which === 'out' && nk.in?.type === 'bezier') nk = { ...nk, in: { ...nk.in, speed } };
    if (which === 'in' && nk.out) nk = { ...nk, out: { ...nk.out, speed } };
  }
  return keys.map((x, j) => (j === i ? nk : x));
}

/**
 * State version of dragHandle (one key, one param).
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef} ref @param {'in'|'out'} which @param {number} t layer s
 * @param {number} v @param {{ broken?: boolean }} [o] @returns {S}
 */
export function dragKeyHandle(state, ref, which, t, v, o) {
  const layers = state.layers.map((l) => {
    if (l.id !== ref.layerId || !l.keys?.[ref.paramId]) return l;
    const list = materialize(l.keys[ref.paramId]);
    const i = list.findIndex((k) => same(k.t, ref.t));
    if (i < 0) return l;
    return { ...l, keys: { ...l.keys, [ref.paramId]: dragHandle(list, i, which, t, v, o) } };
  });
  return { ...state, layers };
}

/**
 * Move the VALUES of selected numeric keys by dv (Graph Editor vertical drag), clamped to the
 * param's range.
 * @template {{ layers: EditorLayer[] }} S
 * @param {S} state @param {KeyRef[]} refs @param {number} dv @returns {S}
 */
export function offsetKeyValues(state, refs, dv) {
  const layers = state.layers.map((l) => {
    const mine = refs.filter((r) => r.layerId === l.id && isNumericParam(l, r.paramId));
    if (!mine.length) return l;
    const keys = { ...l.keys };
    for (const pid of new Set(mine.map((r) => r.paramId))) {
      const def = defOf(l, pid);
      keys[pid] = (keys[pid] ?? []).map((k) => {
        if (!mine.some((r) => r.paramId === pid && same(r.t, k.t))) return k;
        let v = Number(k.v) + dv;
        if (Number.isFinite(def.min)) v = Math.max(def.min, v);
        if (Number.isFinite(def.max)) v = Math.min(def.max, v);
        return { ...k, v: def.type === 'int' ? Math.round(v) : v };
      });
    }
    return { ...l, keys };
  });
  return { ...state, layers };
}

/**
 * Interpolation of each side, for key icons: 'linear' | 'bezier' | 'hold' | null (no segment).
 * @param {Keyframe[]} keys @param {number} i
 */
export function keySides(keys, i) {
  const k = keys[i];
  const prev = keys[i - 1];
  const next = keys[i + 1];
  /** @type {'linear'|'bezier'|'hold'|null} */
  const inSide = !prev
    ? null
    : prev.ease === 'hold'
      ? 'hold'
      : segmentHandles(prev, k).in
        ? 'bezier'
        : 'linear';
  /** @type {'linear'|'bezier'|'hold'|null} */
  const outSide =
    k.ease === 'hold' ? 'hold' : !next ? null : segmentHandles(k, next).out ? 'bezier' : 'linear';
  // An end key shows its own setting on the open side, like After Effects.
  return {
    in: inSide ?? (k.in?.type === 'bezier' ? 'bezier' : k.in ? 'linear' : outSide),
    out: outSide ?? (k.ease === 'linear' ? 'linear' : 'bezier'),
  };
}
