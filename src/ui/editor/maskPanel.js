// @ts-check
/**
 * Masks in the editor (3.6d, D-064): inspector schema per mask, and the geometry for editing a
 * mask with handles in the viewport (move inside, resize from a corner — the opposite corner
 * stays put, ⇧ keeps the proportions). Pure helpers; the editor wires them up.
 */

import { MASK_LABELS, MASK_NUMBERS } from '../../render/masks.js';

/** @typedef {import('../../render/masks.js').Mask} Mask */

const UNITS = /** @type {Record<string, string>} */ ({
  x: 'px',
  y: 'px',
  w: 'px',
  h: 'px',
  rotation: '°',
  feather: 'px',
  expansion: 'px',
  opacity: '%',
});
const RANGES = /** @type {Record<string, [number, number]>} */ ({
  x: [-2000, 2000],
  y: [-2000, 2000],
  w: [0, 4000],
  h: [0, 4000],
  rotation: [-720, 720],
  feather: [0, 400],
  expansion: [-400, 400],
  opacity: [0, 100],
});

/**
 * Inspector schema for one mask: fixed choices (`maskfix.<id>.<field>`) and keyframable numbers
 * (`mask.<id>.<field>`).
 * @param {Mask} m
 */
export function maskSchema(m) {
  const group = m.name;
  return [
    {
      id: `maskfix.${m.id}.shape`,
      label: 'Shape',
      group,
      type: 'enum',
      options: [
        { value: 'ellipse', label: 'Ellipse' },
        { value: 'rect', label: 'Rectangle' },
        ...(m.path?.length ? [{ value: 'path', label: 'Pen path' }] : []),
      ],
      default: 'ellipse',
    },
    {
      id: `maskfix.${m.id}.mode`,
      label: 'Mode',
      group,
      type: 'enum',
      options: [
        { value: 'add', label: 'Add' },
        { value: 'subtract', label: 'Subtract' },
        { value: 'intersect', label: 'Intersect' },
      ],
      default: 'add',
      tooltip: 'Add = show inside · Subtract = cut out · Intersect = keep only the overlap',
    },
    {
      id: `maskfix.${m.id}.inverted`,
      label: 'Inverted',
      group,
      type: 'bool',
      default: false,
    },
    // D-111: closed shapes can be a motion path only (open pen paths always are)
    ...(m.closed === false
      ? []
      : [
          {
            id: `maskfix.${m.id}.pathOnly`,
            label: 'Path only (doesn’t cut)',
            group,
            type: 'bool',
            default: false,
            tooltip:
              'Use this shape only as a motion path (Follow Path, particles along path, ribbons, bolts) — it does not cut the layer',
          },
        ]),
    ...MASK_NUMBERS.map((f) => ({
      id: `mask.${m.id}.${f}`,
      label: /** @type {any} */ (MASK_LABELS)[f],
      group,
      type: 'float',
      min: RANGES[f][0],
      max: RANGES[f][1],
      step: f === 'opacity' ? 1 : 0.5,
      default: f === 'opacity' ? 100 : f === 'w' || f === 'h' ? 160 : 0,
      unit: UNITS[f],
    })),
  ];
}

/** Inspector values of a mask. @param {Mask} m */
export function maskValues(m) {
  /** @type {Record<string, any>} */
  const v = {
    [`maskfix.${m.id}.shape`]: m.shape,
    [`maskfix.${m.id}.mode`]: m.mode,
    [`maskfix.${m.id}.inverted`]: m.inverted,
    [`maskfix.${m.id}.pathOnly`]: m.pathOnly === true,
  };
  for (const f of MASK_NUMBERS) v[`mask.${m.id}.${f}`] = /** @type {any} */ (m)[f];
  return v;
}

/** `maskfix.<id>.<field>` → parts, or null. @param {string} id */
export function parseMaskFix(id) {
  const m = /^maskfix\.(.+)\.(shape|mode|inverted|pathOnly)$/.exec(id);
  return m ? { maskId: m[1], field: m[2] } : null;
}

/** Mask-frame point → layer point. @param {Mask} m @param {number} u @param {number} v */
export function maskToLayer(m, u, v) {
  const a = (m.rotation * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return /** @type {[number, number]} */ ([m.x + u * c - v * s, m.y + u * s + v * c]);
}
/** Layer point → mask frame. @param {Mask} m @param {number} x @param {number} y */
export function layerToMask(m, x, y) {
  const a = (-m.rotation * Math.PI) / 180;
  const dx = x - m.x;
  const dy = y - m.y;
  return /** @type {[number, number]} */ ([
    dx * Math.cos(a) - dy * Math.sin(a),
    dx * Math.sin(a) + dy * Math.cos(a),
  ]);
}

/** Corner signs, clockwise from top-left. */
export const CORNERS = /** @type {const} */ ([
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
]);

/** Outline of a mask in layer space (closed polyline). @param {Mask} m @param {number} [n] */
export function maskOutline(m, n = 48) {
  if (m.shape === 'path') return pathOutline(m);
  if (m.shape === 'rect')
    return CORNERS.map(([sx, sy]) => maskToLayer(m, (sx * m.w) / 2, (sy * m.h) / 2));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return maskToLayer(m, (Math.cos(t) * m.w) / 2, (Math.sin(t) * m.h) / 2);
  });
}

/** Is a layer point inside the mask's box? @param {Mask} m @param {number} x @param {number} y */
export function insideMask(m, x, y) {
  if (m.shape === 'path') return insidePolygon(pathOutline(m), x, y);
  const [u, v] = layerToMask(m, x, y);
  return Math.abs(u) <= m.w / 2 && Math.abs(v) <= m.h / 2;
}

// ── Pen-tool paths (3.6d) ───────────────────────────────────────────────────────────────────
/** @typedef {import('../../render/masks.js').PathVertex} PathVertex */

/** Mask units (−0.5 … 0.5 of the box) → layer px. @param {Mask} m @param {number} u @param {number} v */
export const unitToLayer = (m, u, v) => maskToLayer(m, u * m.w, v * m.h);
/** Layer px → mask units. @param {Mask} m @param {number} x @param {number} y */
export function layerToUnit(m, x, y) {
  const [a, b] = layerToMask(m, x, y);
  return /** @type {[number, number]} */ ([m.w ? a / m.w : 0, m.h ? b / m.h : 0]);
}

/** Point on a cubic bezier. */
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

/** Closed outline of a pen path in layer px (each segment flattened). @param {Mask} m @param {number} [steps] */
export function pathOutline(m, steps = 12) {
  const p = m.path ?? [];
  /** @type {[number, number][]} */
  const out = [];
  const open = m.closed === false;
  for (let i = 0; i < (open ? p.length - 1 : p.length); i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      out.push(
        unitToLayer(
          m,
          cubic(a.x, a.x + a.ox, b.x + b.ix, b.x, t),
          cubic(a.y, a.y + a.oy, b.y + b.iy, b.y, t),
        ),
      );
    }
  }
  if (open && p.length) out.push(unitToLayer(m, p[p.length - 1].x, p[p.length - 1].y));
  return out;
}

/** Even-odd point in polygon. @param {[number, number][]} poly @param {number} x @param {number} y */
export function insidePolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}

/**
 * A pen mask from points drawn in layer px. Each point: position and its OUT handle offset
 * (the in handle mirrors it, as when you click-drag with After Effects' pen).
 * @param {{ x: number, y: number, ox: number, oy: number }[]} pts
 * @returns {{ x: number, y: number, w: number, h: number, rotation: number, path: PathVertex[] }}
 */
export function pathFromPoints(pts) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return {
    x: cx,
    y: cy,
    w,
    h,
    rotation: 0,
    path: pts.map((p) => ({
      x: (p.x - cx) / w,
      y: (p.y - cy) / h,
      ix: -p.ox / w,
      iy: -p.oy / h,
      ox: p.ox / w,
      oy: p.oy / h,
    })),
  };
}

/** Vertex i in layer px. @param {Mask} m @param {number} i */
export const vertexAt = (m, i) => {
  const v = /** @type {PathVertex[]} */ (m.path)[i];
  return unitToLayer(m, v.x, v.y);
};
/** Handle of vertex i in layer px. @param {Mask} m @param {number} i @param {'in'|'out'} which */
export const handleAt = (m, i, which) => {
  const v = /** @type {PathVertex[]} */ (m.path)[i];
  return which === 'in'
    ? unitToLayer(m, v.x + v.ix, v.y + v.iy)
    : unitToLayer(m, v.x + v.ox, v.y + v.oy);
};

/** Move vertex i (with its handles) to a layer point. @param {Mask} m @param {number} i @param {[number, number]} p @returns {PathVertex[]} */
export function moveVertex(m, i, p) {
  const [u, v] = layerToUnit(m, p[0], p[1]);
  return (m.path ?? []).map((q, k) => (k === i ? { ...q, x: u, y: v } : q));
}

/**
 * Move a handle of vertex i to a layer point. The opposite handle mirrors it (smooth) unless
 * `broken` (⌥, as in After Effects).
 * @param {Mask} m @param {number} i @param {'in'|'out'} which @param {[number, number]} p
 * @param {boolean} [broken] @returns {PathVertex[]}
 */
export function moveHandle(m, i, which, p, broken = false) {
  const [u, v] = layerToUnit(m, p[0], p[1]);
  return (m.path ?? []).map((q, k) => {
    if (k !== i) return q;
    const dx = u - q.x;
    const dy = v - q.y;
    if (which === 'out') return { ...q, ox: dx, oy: dy, ...(broken ? {} : { ix: -dx, iy: -dy }) };
    return { ...q, ix: dx, iy: dy, ...(broken ? {} : { ox: -dx, oy: -dy }) };
  });
}

/**
 * Corner ↔ smooth (After Effects' Convert Vertex): a corner gets handles along its neighbours,
 * a smooth vertex loses them.
 * @param {Mask} m @param {number} i @returns {PathVertex[]}
 */
export function toggleSmooth(m, i) {
  const p = m.path ?? [];
  return p.map((q, k) => {
    if (k !== i) return q;
    if (q.ix || q.iy || q.ox || q.oy) return { ...q, ix: 0, iy: 0, ox: 0, oy: 0 };
    const a = p[(k - 1 + p.length) % p.length];
    const b = p[(k + 1) % p.length];
    const tx = (b.x - a.x) / 6;
    const ty = (b.y - a.y) / 6;
    return { ...q, ix: -tx, iy: -ty, ox: tx, oy: ty };
  });
}

/**
 * New position / size after dragging (layer space).
 * @param {Mask} m0 mask at drag start @param {[number, number]} p0 pointer at start (layer)
 * @param {[number, number]} p pointer now (layer)
 * @param {{ kind: 'move' } | { kind: 'corner', corner: number }} what
 * @param {{ shift?: boolean }} [mods]
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function dragMask(m0, p0, p, what, mods = {}) {
  if (what.kind === 'move') {
    let dx = p[0] - p0[0];
    let dy = p[1] - p0[1];
    if (mods.shift) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    return { x: m0.x + dx, y: m0.y + dy, w: m0.w, h: m0.h };
  }
  const [sx, sy] = CORNERS[what.corner];
  const o = [(-sx * m0.w) / 2, (-sy * m0.h) / 2]; // opposite corner, mask frame
  const q = layerToMask(m0, p[0], p[1]);
  let w = Math.abs(q[0] - o[0]);
  let h = Math.abs(q[1] - o[1]);
  if (mods.shift && m0.w > 0 && m0.h > 0) {
    const k = Math.max(w / m0.w, h / m0.h);
    w = m0.w * k;
    h = m0.h * k;
  }
  // new centre: halfway between the fixed corner and the dragged one (mask frame)
  const su = Math.sign(q[0] - o[0]) || sx; // dragging past the fixed corner flips the side
  const sv = Math.sign(q[1] - o[1]) || sy;
  const cu = o[0] + (su * w) / 2;
  const cv = o[1] + (sv * h) / 2;
  const [x, y] = maskToLayer(m0, cu, cv);
  return { x, y, w, h };
}
