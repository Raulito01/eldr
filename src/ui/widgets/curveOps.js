// @ts-check
/**
 * Pure editing operations for curves (used by the curve editor widget). Every operation
 * returns a NEW array; endpoints stay at x = 0 and x = 1; y is clamped to [yMin, yMax].
 */

/** Smallest x gap kept between neighbouring points. */
export const MIN_GAP = 0.01;

/** @typedef {{ x: number, y: number }} Pt */

const clamp = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Move point i to (x, y). Endpoints keep their x; inner points stay between their neighbours.
 * @param {Pt[]} pts @param {number} i @param {number} x @param {number} y
 * @param {number} yMin @param {number} yMax
 * @returns {Pt[]}
 */
export function movePoint(pts, i, x, y, yMin, yMax) {
  const out = pts.map((p) => ({ ...p }));
  const last = out.length - 1;
  const nx =
    i === 0 ? 0 : i === last ? 1 : clamp(x, out[i - 1].x + MIN_GAP, out[i + 1].x - MIN_GAP);
  out[i] = { x: nx, y: clamp(y, yMin, yMax) };
  return out;
}

/**
 * Insert a point at (x, y) in x order. Ignored if too close to an existing point.
 * @param {Pt[]} pts @param {number} x @param {number} y @param {number} yMin @param {number} yMax
 * @returns {{ points: Pt[], index: number }} index of the new point, or -1 if not added
 */
export function addPoint(pts, x, y, yMin, yMax) {
  const cx = clamp(x, MIN_GAP, 1 - MIN_GAP);
  if (pts.some((p) => Math.abs(p.x - cx) < MIN_GAP)) return { points: pts, index: -1 };
  const index = pts.findIndex((p) => p.x > cx);
  const points = [...pts.slice(0, index), { x: cx, y: clamp(y, yMin, yMax) }, ...pts.slice(index)];
  return { points, index };
}

/**
 * Remove inner point i (endpoints can't be removed).
 * @param {Pt[]} pts @param {number} i
 * @returns {Pt[]}
 */
export function removePoint(pts, i) {
  if (i <= 0 || i >= pts.length - 1) return pts;
  return [...pts.slice(0, i), ...pts.slice(i + 1)];
}
