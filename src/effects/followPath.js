// @ts-check
/**
 * Follow Path (4.Pa, D-066): a layer rides along a pen path, like After Effects' motion paths.
 *
 * The path is a pen mask (`shape: 'path'`, open or closed) on any layer — usually a Path layer,
 * which only holds paths — or (D-111) an ellipse / rectangle on a Path layer or set to "Path
 * only". The follower's ANCHOR is placed on the path at `progress` (0–100 %,
 * keyframable) plus `offset`; Auto-orient adds the path's direction to its rotation. "Even
 * speed" moves at a constant speed along the curve (arc length); off = equal time per segment.
 * Pure: layers in, layers out (positions resolved), so rendering stays random-access.
 */

import { apply as applyMat, invert, worldMatrices } from '../core/transform2d.js';
import { isPathOnly } from '../render/masks.js';

/** @typedef {import('./explosion/explosion.js').EditorLayer} EditorLayer */
/** @typedef {import('../render/masks.js').Mask} Mask */
/**
 * @typedef {object} Follow
 * @property {string} layer   id of the layer that holds the path
 * @property {string} mask    id of the pen mask on it
 * @property {number} progress 0–100 % along the path (keyframable: `follow.progress`)
 * @property {number} offset   −100…100 % added to progress (keyframable: `follow.offset`)
 * @property {boolean} orient  auto-orient along the path
 * @property {boolean} even    constant speed along the curve
 * @property {boolean} loop    wrap past the ends (closed paths: around and around)
 */

/** Defaults for a new follow. @param {string} layer @param {string} mask @returns {Follow} */
export const makeFollow = (layer, mask) => ({
  layer,
  mask,
  progress: 0,
  offset: 0,
  orient: true,
  even: true,
  loop: false,
});

const STEPS = 24;

/** Bezier circle handle length (fraction of the radius). */
const KAPPA = 0.5523;
/**
 * The vertices of any shape as a closed pen path in the mask's unit box (D-111): ellipses as four
 * smooth points, rectangles as four sharp corners, both starting at the top and going clockwise.
 * @param {Mask} m
 * @returns {import('../render/masks.js').PathVertex[]}
 */
export function shapeVertices(m) {
  if (m.shape === 'path') return m.path ?? [];
  if (m.shape === 'rect') {
    return [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([x, y]) => ({ x, y, ix: 0, iy: 0, ox: 0, oy: 0 }));
  }
  const k = KAPPA * 0.5;
  return [
    { x: 0, y: -0.5, ix: -k, iy: 0, ox: k, oy: 0 },
    { x: 0.5, y: 0, ix: 0, iy: -k, ox: 0, oy: k },
    { x: 0, y: 0.5, ix: k, iy: 0, ox: -k, oy: 0 },
    { x: -0.5, y: 0, ix: 0, iy: k, ox: 0, oy: -k },
  ];
}

/** Can this shape be used as a motion path? (a pen path with points, or an ellipse / rect) @param {Mask} m */
export const isPathShape = (m) =>
  m.shape === 'ellipse' || m.shape === 'rect' || (m.path?.length ?? 0) >= 2;

/**
 * The layer's own motion path for "along path" uses (emitters, bolts, ribbons): the first
 * enabled shape that is a path — an open pen path or a shape set to "Path only" (D-111).
 * @param {Mask[] | undefined} masks
 * @returns {Mask | null}
 */
export const motionPath = (masks) =>
  masks?.find((m) => m.enabled !== false && isPathOnly(m) && isPathShape(m)) ?? null;
/** @type {WeakMap<object, { pts: [number, number][], len: number[], seg: number[] }>} */
const cache = new WeakMap();

const cubic = (
  /** @type {number} */ a,
  /** @type {number} */ b,
  /** @type {number} */ c,
  /** @type {number} */ d,
  /** @type {number} */ t,
) => {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
};

/**
 * A pen path flattened into a polyline in the mask's LAYER space, with cumulative lengths and
 * the segment index of every point. Cached per mask object (masks are replaced on edit).
 * @param {Mask} m
 */
export function flattenPath(m) {
  const hit = cache.get(m);
  if (hit) return hit;
  const a = (m.rotation * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  const P = (/** @type {number} */ u, /** @type {number} */ v) => {
    const x = u * m.w;
    const y = v * m.h;
    return /** @type {[number, number]} */ ([m.x + x * cs - y * sn, m.y + x * sn + y * cs]);
  };
  const path = shapeVertices(m);
  const closed = m.shape !== 'path' || m.closed !== false;
  const segs = closed ? path.length : path.length - 1;
  /** @type {[number, number][]} */
  const pts = [];
  /** @type {number[]} */
  const seg = [];
  for (let i = 0; i < segs; i++) {
    const p = path[i];
    const q = path[(i + 1) % path.length];
    for (let k = 0; k < STEPS; k++) {
      const t = k / STEPS;
      pts.push(
        P(cubic(p.x, p.x + p.ox, q.x + q.ix, q.x, t), cubic(p.y, p.y + p.oy, q.y + q.iy, q.y, t)),
      );
      seg.push(i + t);
    }
  }
  if (path.length) {
    const last = closed ? path[0] : path[path.length - 1];
    pts.push(P(last.x, last.y));
    seg.push(segs);
  }
  /** @type {number[]} */
  const len = [0];
  for (let i = 1; i < pts.length; i++) {
    len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  }
  const out = { pts, len, seg };
  cache.set(m, out);
  return out;
}

/**
 * Point and direction (radians) at fraction u (0–1) of the path, in the mask's layer space.
 * @param {Mask} m @param {number} u @param {{ even?: boolean }} [o]
 * @returns {{ x: number, y: number, angle: number } | null}
 */
export function pointOnPath(m, u, o = {}) {
  const f = flattenPath(m);
  const n = f.pts.length;
  if (n < 2) return null;
  const total = f.len[n - 1];
  let i = 0;
  let w = 0;
  if (o.even !== false && total > 0) {
    const d = Math.min(1, Math.max(0, u)) * total;
    while (i < n - 2 && f.len[i + 1] < d) i++;
    const span = f.len[i + 1] - f.len[i];
    w = span > 0 ? (d - f.len[i]) / span : 0;
  } else {
    const s = Math.min(1, Math.max(0, u)) * f.seg[n - 1];
    while (i < n - 2 && f.seg[i + 1] < s) i++;
    const span = f.seg[i + 1] - f.seg[i];
    w = span > 0 ? (s - f.seg[i]) / span : 0;
  }
  const [x0, y0] = f.pts[i];
  const [x1, y1] = f.pts[i + 1];
  return { x: x0 + (x1 - x0) * w, y: y0 + (y1 - y0) * w, angle: Math.atan2(y1 - y0, x1 - x0) };
}

/** Wrap or clamp a fraction. @param {number} u @param {boolean} loop */
const wrap = (u, loop) => (loop ? u - Math.floor(u) : Math.min(1, Math.max(0, u)));

/**
 * Pen masks that can be followed: every layer's `path` masks (Path layers first).
 * @param {EditorLayer[]} layers @param {string} [exceptId] the follower itself
 */
export function pathSources(layers, exceptId) {
  /** @type {{ layer: EditorLayer, mask: Mask }[]} */
  const out = [];
  for (const l of [...layers].sort(
    (a, b) => Number(b.type === 'guide') - Number(a.type === 'guide'),
  )) {
    if (l.id === exceptId) continue;
    for (const m of l.masks ?? []) {
      // pen paths (as before), and ellipses / rectangles on Path layers or set to Path only
      const ok =
        m.shape === 'path'
          ? (m.path?.length ?? 0) >= 2
          : isPathShape(m) && (l.type === 'guide' || isPathOnly(m));
      if (ok) out.push({ layer: l, mask: m });
    }
  }
  return out;
}

/**
 * Layers with Follow Path resolved: each follower's position (and rotation with auto-orient)
 * set from its path, in its parent's space. Layers without follow are returned unchanged.
 * @param {EditorLayer[]} layers @returns {EditorLayer[]}
 */
export function applyFollow(layers) {
  if (!layers.some((l) => l.follow)) return layers;
  let out = layers;
  // Followers placed one by one, parents first, so chains (a null on a path carrying another
  // follower) resolve in order.
  const depth = (/** @type {EditorLayer} */ l) => {
    let d = 0;
    let p = l.parent;
    const seen = new Set();
    while (p && !seen.has(p) && d < 64) {
      seen.add(p);
      d++;
      p = layers.find((x) => x.id === p)?.parent ?? null;
    }
    return d;
  };
  const followers = layers.filter((l) => l.follow).sort((a, b) => depth(a) - depth(b));
  for (const f of followers) {
    const fo = /** @type {Follow} */ (f.follow);
    const src = out.find((l) => l.id === fo.layer);
    const m = src?.masks?.find((x) => x.id === fo.mask);
    if (!src || !m || !isPathShape(m) || src.id === f.id) continue;
    const u = wrap((fo.progress + fo.offset) / 100, fo.loop);
    const p = pointOnPath(m, u, { even: fo.even });
    if (!p) continue;
    const worlds = worldMatrices(out);
    const W = worlds.get(src.id) ?? [1, 0, 0, 1, 0, 0];
    // path point and direction in world (effect) space
    const [wx, wy] = applyMat(W, p.x, p.y);
    const [wx2, wy2] = applyMat(W, p.x + Math.cos(p.angle), p.y + Math.sin(p.angle));
    // … then into the follower's parent space
    const parentW = f.parent ? (worlds.get(f.parent) ?? [1, 0, 0, 1, 0, 0]) : [1, 0, 0, 1, 0, 0];
    const inv = invert(/** @type {any} */ (parentW));
    const [lx, ly] = applyMat(inv, wx, wy);
    const [lx2, ly2] = applyMat(inv, wx2, wy2);
    const angle = (Math.atan2(ly2 - ly, lx2 - lx) * 180) / Math.PI;
    const cur = /** @type {EditorLayer} */ (out.find((l) => l.id === f.id));
    const transform = {
      ...cur.transform,
      x: lx,
      y: ly,
      ...(fo.orient ? { rotation: cur.transform.rotation + angle } : {}),
    };
    out = out.map((l) => (l.id === f.id ? { ...l, transform } : l));
  }
  return out;
}

/** World matrices with Follow Path applied. @param {EditorLayer[]} layers */
export const followedWorlds = (layers) => worldMatrices(applyFollow(layers));
