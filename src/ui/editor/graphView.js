// @ts-check
/**
 * Graph Editor (3.7c, D-059): the value graph of animated numeric parameters, drawn in the
 * layer timeline's track (same time axis as the bars). Like After Effects' value graph:
 * curves per parameter, keys as squares, bezier handles on selected keys.
 *
 * This module is geometry + drawing + hit testing; the timeline owns the interaction.
 */

import { valueAt } from '../../core/keyframes.js';
import { defOf, handlePoints, isNumericParam } from '../../effects/keyInterp.js';
import { compSeconds, layerSeconds } from '../../effects/layerAnimation.js';

/** @typedef {import('../../effects/keyEdit.js').KeyRef} KeyRef */
/** @typedef {import('../../effects/explosion/explosion.js').EditorLayer} EditorLayer */

/** Curve colours (one per shown parameter, in order). */
export const CURVE_COLORS = [
  '#ff6b6b',
  '#4ecdc4',
  '#ffd166',
  '#a29bfe',
  '#7bd389',
  '#ff9f43',
  '#54a0ff',
  '#f78fb3',
];
/** Pixel radius for grabbing keys and handles (pen-friendly). */
export const GRAPH_HIT = 9;
/** Empty space kept above and below the curves, px. */
export const GRAPH_PAD = 18;

/**
 * @typedef {object} GraphCurve
 * @property {string} id  layerId|paramId
 * @property {EditorLayer} layer
 * @property {string} paramId
 * @property {string} label
 * @property {string} color
 * @property {import('../../core/keyframes.js').Keyframe[]} keys
 */

/**
 * Numeric animated params of the selected layers (top of the stack first), minus hidden ones.
 * @param {EditorLayer[]} layers @param {string[]} selection
 * @param {(layerId: string, paramId: string) => string} paramLabel
 * @returns {GraphCurve[]} every candidate; `hidden` is applied by the caller
 */
export function graphCurves(layers, selection, paramLabel) {
  /** @type {GraphCurve[]} */
  const out = [];
  for (const l of [...layers].reverse()) {
    if (!selection.includes(l.id)) continue;
    for (const [pid, keys] of Object.entries(l.keys ?? {})) {
      if (!keys?.length || !isNumericParam(l, pid)) continue;
      out.push({
        id: `${l.id}|${pid}`,
        layer: l,
        paramId: pid,
        label: `${l.label} · ${paramLabel(l.id, pid)}`,
        color: CURVE_COLORS[out.length % CURVE_COLORS.length],
        keys,
      });
    }
  }
  return out;
}

/**
 * Value range shown (keys, handles and the sampled curve), never empty.
 * @param {GraphCurve[]} curves @param {number} end comp seconds @param {number} samples
 */
export function graphRange(curves, end, samples = 120) {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  const add = (/** @type {number} */ v) => {
    if (!Number.isFinite(v)) return;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  };
  for (const c of curves) {
    const def = defOf(c.layer, c.paramId);
    for (let i = 0; i <= samples; i++) {
      add(valueAt(def, c.keys, layerSeconds(c.layer.time, (i / samples) * end)));
    }
    c.keys.forEach((k, i) => {
      add(Number(k.v));
      const hp = handlePoints(c.keys, i);
      if (hp.in) add(hp.in[1]);
      if (hp.out) add(hp.out[1]);
    });
  }
  if (!Number.isFinite(lo)) return { min: 0, max: 1 };
  if (hi - lo < 1e-6) return { min: lo - 1, max: hi + 1 };
  return { min: lo, max: hi };
}

/**
 * Value ↔ y on the graph area.
 * @param {{ min: number, max: number }} range @param {number} top @param {number} bottom
 */
export function valueAxis(range, top, bottom) {
  const t = top + GRAPH_PAD;
  const b = bottom - GRAPH_PAD;
  const k = (b - t) / (range.max - range.min);
  return {
    y: (/** @type {number} */ v) => b - (v - range.min) * k,
    v: (/** @type {number} */ y) => range.min + (b - y) / k,
  };
}

/** "Nice" grid step for a value span. @param {number} span @param {number} lines */
export function niceStep(span, lines = 5) {
  const raw = span / Math.max(1, lines);
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}

/**
 * @typedef {object} GraphGeom
 * @property {number} w
 * @property {number} top
 * @property {number} bottom
 * @property {(comp: number) => number} X  comp seconds → x
 * @property {(x: number) => number} S     x → comp seconds
 * @property {(v: number) => number} Y
 * @property {(y: number) => number} V
 */

/**
 * Screen positions of keys and (for selected keys) their handles.
 * @param {GraphGeom} g @param {GraphCurve[]} curves @param {KeyRef[]} selected
 */
export function graphPoints(g, curves, selected) {
  const isSel = (/** @type {string} */ l, /** @type {string} */ p, /** @type {number} */ t) =>
    selected.some((r) => r.layerId === l && r.paramId === p && Math.abs(r.t - t) < 1e-4);
  /** @type {{ ref: KeyRef, x: number, y: number, sel: boolean, curve: GraphCurve,
   *   handles: { which: 'in'|'out', x: number, y: number }[] }[]} */
  const out = [];
  for (const c of curves) {
    c.keys.forEach((k, i) => {
      const ref = { layerId: c.layer.id, paramId: c.paramId, t: k.t };
      const sel = isSel(ref.layerId, ref.paramId, k.t);
      /** @type {{ which: 'in'|'out', x: number, y: number }[]} */
      const handles = [];
      if (sel) {
        const hp = handlePoints(c.keys, i);
        for (const which of /** @type {const} */ (['in', 'out'])) {
          const p = hp[which];
          if (p) handles.push({ which, x: g.X(compSeconds(c.layer.time, p[0])), y: g.Y(p[1]) });
        }
      }
      out.push({
        ref,
        x: g.X(compSeconds(c.layer.time, k.t)),
        y: g.Y(Number(k.v)),
        sel,
        curve: c,
        handles,
      });
    });
  }
  return out;
}

/**
 * What is under (x, y): a handle of a selected key first, then a key.
 * @param {ReturnType<typeof graphPoints>} pts @param {number} x @param {number} y
 * @returns {null | { kind: 'key', ref: KeyRef } | { kind: 'handle', ref: KeyRef, which: 'in'|'out' }}
 */
export function graphHit(pts, x, y) {
  const near = (/** @type {number} */ px, /** @type {number} */ py) =>
    Math.hypot(px - x, py - y) <= GRAPH_HIT;
  for (const p of pts) {
    for (const hd of p.handles) {
      if (near(hd.x, hd.y)) return { kind: 'handle', ref: p.ref, which: hd.which };
    }
  }
  let best = null;
  let bestD = GRAPH_HIT;
  for (const p of pts) {
    const dd = Math.hypot(p.x - x, p.y - y);
    if (dd <= bestD) {
      best = p;
      bestD = dd;
    }
  }
  return best ? { kind: 'key', ref: best.ref } : null;
}

/**
 * Draw the graph area: grid + value labels, curves, keys, handles.
 * @param {CanvasRenderingContext2D} ctx @param {GraphGeom} g @param {GraphCurve[]} curves
 * @param {ReturnType<typeof graphPoints>} pts @param {{ min: number, max: number }} range
 */
export function drawGraph(ctx, g, curves, pts, range) {
  ctx.fillStyle = '#18191e';
  ctx.fillRect(0, g.top, g.w, g.bottom - g.top);
  // grid
  const step = niceStep(range.max - range.min);
  ctx.font = '10px system-ui, sans-serif';
  ctx.lineWidth = 1;
  for (let v = Math.ceil(range.min / step) * step; v <= range.max + 1e-9; v += step) {
    const y = Math.round(g.Y(v)) + 0.5;
    ctx.strokeStyle = Math.abs(v) < step / 1000 ? '#3f414b' : '#26272e';
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(g.w, y);
    ctx.stroke();
    ctx.fillStyle = '#6f717c';
    ctx.fillText(String(Math.round(v * 1000) / 1000), 4, y - 3);
  }
  if (!curves.length) {
    ctx.fillStyle = '#8b8d97';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(
      'Select a layer with animated values (stopwatch ◷ on) to see its curves.',
      16,
      (g.top + g.bottom) / 2,
    );
    return;
  }
  // curves (sampled per pixel; keys are in layer time)
  for (const c of curves) {
    const def = defOf(c.layer, c.paramId);
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= g.w; x += 1) {
      const v = valueAt(def, c.keys, layerSeconds(c.layer.time, g.S(x)));
      const y = g.Y(v);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // handles, then keys
  for (const p of pts) {
    for (const hd of p.handles) {
      ctx.strokeStyle = '#d7d8de';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(hd.x, hd.y);
      ctx.stroke();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.arc(hd.x, hd.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const p of pts) {
    const r = p.sel ? 5 : 4;
    ctx.fillStyle = p.sel ? '#ffd166' : '#1b1c21';
    ctx.strokeStyle = p.sel ? '#ffffff' : p.curve.color;
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
    ctx.strokeRect(p.x - r + 0.5, p.y - r + 0.5, r * 2 - 1, r * 2 - 1);
    ctx.lineWidth = 1;
  }
}
