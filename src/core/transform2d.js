// @ts-check
/**
 * 2D affine transforms for layer transforms and parenting (step 3.6b, D-053).
 *
 * A matrix is [a, b, c, d, e, f], the same layout as Canvas `setTransform(a, b, c, d, e, f)`:
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 * Coordinates are effect pixels around the pivot (y down, angles clockwise in degrees, like the
 * rest of ELDR and After Effects).
 *
 * Layer transform (After Effects order): local = T(position) · R(rotation) · S(scale) · T(−anchor),
 * world = parentWorld · local.
 */

/** @typedef {[number, number, number, number, number, number]} Mat */

/**
 * @typedef {object} LayerTransform
 * @property {number} x        position, effect px
 * @property {number} y
 * @property {number} anchorX  anchor point in the layer's own space, effect px
 * @property {number} anchorY
 * @property {number} scaleX   percent (100 = unchanged; negative = mirrored)
 * @property {number} scaleY
 * @property {number} rotation degrees, clockwise
 */

/** @type {Readonly<LayerTransform>} */
export const IDENTITY_TRANSFORM = Object.freeze({
  x: 0,
  y: 0,
  anchorX: 0,
  anchorY: 0,
  scaleX: 100,
  scaleY: 100,
  rotation: 0,
});

/** @returns {Mat} */
export const identity = () => [1, 0, 0, 1, 0, 0];

/** m · n (apply n first, then m). @param {Mat} m @param {Mat} n @returns {Mat} */
export function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

/** Inverse (degenerate matrices → identity, so a 0 % scale can't crash anything). @param {Mat} m @returns {Mat} */
export function invert(m) {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return identity();
  const [a, b, c, d, e, f] = m;
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

/** Apply to a point. @param {Mat} m @param {number} x @param {number} y @returns {[number, number]} */
export const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Apply to a direction (no translation). @param {Mat} m @param {number} x @param {number} y @returns {[number, number]} */
export const applyVector = (m, x, y) => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];

/**
 * Local matrix of a layer transform.
 * @param {Partial<LayerTransform>} [t] @returns {Mat}
 */
export function localMatrix(t = {}) {
  const tr = { ...IDENTITY_TRANSFORM, ...t };
  const r = (tr.rotation * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const sx = tr.scaleX / 100;
  const sy = tr.scaleY / 100;
  // T(p) · R · S · T(−a)
  const a = cos * sx;
  const b = sin * sx;
  const c = -sin * sy || 0; // no −0 (keeps matrices comparable)
  const d = cos * sy;
  return [
    a,
    b,
    c,
    d,
    tr.x - (a * tr.anchorX + c * tr.anchorY),
    tr.y - (b * tr.anchorX + d * tr.anchorY),
  ];
}

/**
 * Transform that produces `m` with the given anchor (inverse of localMatrix). Rotation and scale
 * are read from the matrix; a skew (non-uniform parent scale + rotation) can't be represented
 * and is dropped, as in After Effects.
 * @param {Mat} m @param {number} anchorX @param {number} anchorY
 * @returns {LayerTransform}
 */
export function decompose(m, anchorX, anchorY) {
  const [a, b, c, d] = m;
  const scaleX = Math.hypot(a, b);
  const det = a * d - b * c;
  const rotation = (Math.atan2(b, a) * 180) / Math.PI;
  const scaleY = scaleX > 1e-12 ? det / scaleX : Math.hypot(c, d);
  const [x, y] = apply(m, anchorX, anchorY);
  return { x, y, anchorX, anchorY, scaleX: scaleX * 100, scaleY: scaleY * 100, rotation };
}

/**
 * @typedef {{ id: string, parent?: string | null, transform?: Partial<LayerTransform> }} TransformNode
 */

/**
 * World matrix of every layer (parent chains resolved; a broken or cyclic parent is ignored).
 * @param {ReadonlyArray<TransformNode>} layers
 * @returns {Map<string, Mat>}
 */
export function worldMatrices(layers) {
  const byId = new Map(layers.map((l) => [l.id, l]));
  /** @type {Map<string, Mat>} */
  const out = new Map();
  /** @param {string} id @param {Set<string>} visiting @returns {Mat} */
  const world = (id, visiting) => {
    const done = out.get(id);
    if (done) return done;
    const l = /** @type {TransformNode} */ (byId.get(id));
    const local = localMatrix(l.transform);
    const p = l.parent;
    let m = local;
    if (p && byId.has(p) && !visiting.has(p)) {
      visiting.add(id);
      m = multiply(world(p, visiting), local);
      visiting.delete(id);
    }
    out.set(id, m);
    return m;
  };
  for (const l of layers) world(l.id, new Set([l.id]));
  return out;
}

/**
 * Would making `parentId` the parent of `id` create a loop (or parent a layer to itself)?
 * @param {ReadonlyArray<TransformNode>} layers @param {string} id @param {string | null} parentId
 */
export function wouldCycle(layers, id, parentId) {
  if (!parentId) return false;
  const byId = new Map(layers.map((l) => [l.id, l]));
  const seen = new Set();
  for (let p = /** @type {string | null | undefined} */ (parentId); p; p = byId.get(p)?.parent) {
    if (p === id) return true;
    if (seen.has(p)) return true; // already broken chain
    seen.add(p);
  }
  return false;
}

/**
 * The transform a layer needs under a NEW parent to stay exactly where it is on screen.
 * @param {ReadonlyArray<TransformNode>} layers
 * @param {string} id @param {string | null} newParent
 * @returns {LayerTransform}
 */
export function transformForParent(layers, id, newParent) {
  const worlds = worldMatrices(layers);
  const self = /** @type {TransformNode} */ (layers.find((l) => l.id === id));
  const t = { ...IDENTITY_TRANSFORM, ...self.transform };
  const current = /** @type {Mat} */ (worlds.get(id));
  const parentWorld = newParent ? (worlds.get(newParent) ?? identity()) : identity();
  return decompose(multiply(invert(parentWorld), current), t.anchorX, t.anchorY);
}
