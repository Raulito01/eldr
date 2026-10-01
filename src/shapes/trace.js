// @ts-check
/** Path helpers shared by shapes. Outlines are flat [x0, y0, x1, y1, …] arrays. */

/**
 * Smooth closed path through outline points (quadratic curves through the midpoints, so there
 * are no corners) — blobs, puffs, streaks.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float64Array} pts
 */
export function traceSmoothClosed(ctx, pts) {
  const n = pts.length / 2;
  const mx = (/** @type {number} */ i, /** @type {number} */ j) => (pts[i * 2] + pts[j * 2]) / 2;
  const my = (/** @type {number} */ i, /** @type {number} */ j) =>
    (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2;
  ctx.moveTo(mx(n - 1, 0), my(n - 1, 0));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], mx(i, j), my(i, j));
  }
  ctx.closePath();
}

/**
 * Closed polygon with hard corners — debris, ring segments.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Float64Array} pts
 */
export function tracePolygon(ctx, pts) {
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
}
