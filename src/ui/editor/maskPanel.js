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
  };
  for (const f of MASK_NUMBERS) v[`mask.${m.id}.${f}`] = /** @type {any} */ (m)[f];
  return v;
}

/** `maskfix.<id>.<field>` → parts, or null. @param {string} id */
export function parseMaskFix(id) {
  const m = /^maskfix\.(.+)\.(shape|mode|inverted)$/.exec(id);
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
  if (m.shape === 'rect')
    return CORNERS.map(([sx, sy]) => maskToLayer(m, (sx * m.w) / 2, (sy * m.h) / 2));
  return Array.from({ length: n }, (_, i) => {
    const t = (i / n) * Math.PI * 2;
    return maskToLayer(m, (Math.cos(t) * m.w) / 2, (Math.sin(t) * m.h) / 2);
  });
}

/** Is a layer point inside the mask's box? @param {Mask} m @param {number} x @param {number} y */
export function insideMask(m, x, y) {
  const [u, v] = layerToMask(m, x, y);
  return Math.abs(u) <= m.w / 2 && Math.abs(v) <= m.h / 2;
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
