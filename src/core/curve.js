// @ts-check
/**
 * Curve evaluation for animation curves (scale over life, opacity over life, …).
 *
 * Curves are lists of points {x, y} with x in 0–1 (sorted, first x = 0, last x = 1 — the
 * schema validator guarantees this). Between points we use monotone cubic interpolation
 * (Fritsch–Carlson): smooth like a hand-drawn graph-editor curve, but it never overshoots
 * between two points, so a flat section stays flat and a fade never dips below 0.
 */

/** @typedef {{ x: number, y: number }} CurvePoint */

/**
 * Tangents for monotone cubic interpolation.
 * @param {ReadonlyArray<CurvePoint>} pts
 * @returns {number[]}
 */
function monotoneTangents(pts) {
  const n = pts.length;
  const d = []; // secant slopes
  for (let i = 0; i < n - 1; i++) {
    const dx = pts[i + 1].x - pts[i].x;
    d.push(dx > 0 ? (pts[i + 1].y - pts[i].y) / dx : 0);
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  }
  // Fritsch–Carlson limiter: keep each segment monotone.
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  return m;
}

/** Cache tangents per curve array (curves are replaced, never mutated, so identity is safe). */
const tangentCache = new WeakMap();

/**
 * Value of a curve at x (clamped to 0–1).
 * @param {ReadonlyArray<CurvePoint>} pts at least 2 points, sorted by x
 * @param {number} x
 */
export function evalCurve(pts, x) {
  const n = pts.length;
  if (n === 0) return 0;
  if (n === 1 || x <= pts[0].x) return pts[0].y;
  if (x >= pts[n - 1].x) return pts[n - 1].y;

  let i = 0;
  while (i < n - 2 && x > pts[i + 1].x) i++;
  const p0 = pts[i];
  const p1 = pts[i + 1];
  const h = p1.x - p0.x;
  if (h <= 0) return p1.y;

  let m = tangentCache.get(pts);
  if (!m) {
    m = monotoneTangents(pts);
    tangentCache.set(pts, m);
  }
  const t = (x - p0.x) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * t3 - 3 * t2 + 1) * p0.y +
    (t3 - 2 * t2 + t) * h * m[i] +
    (-2 * t3 + 3 * t2) * p1.y +
    (t3 - t2) * h * m[i + 1]
  );
}
