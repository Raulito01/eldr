// @ts-check
/**
 * `single` element: one instance with a life window inside the effect and transform/opacity
 * curves over that life (brief §3.6).
 */

import { evalCurve } from '../core/curve.js';

/**
 * @typedef {object} Instance  one thing to draw this frame
 * @property {number} x         effect px
 * @property {number} y         effect px
 * @property {number} rotation  radians
 * @property {number} scale
 * @property {number} opacity   0–1
 * @property {number} age       normalized life 0–1
 * @property {number} seed      instance seed (shape randomness)
 */

/**
 * @typedef {object} SingleParams
 * @property {number} start  life start, normalized effect time
 * @property {number} end    life end, normalized effect time
 * @property {number} x
 * @property {number} y
 * @property {number} rotation degrees
 * @property {number} scale
 * @property {import('../core/curve.js').CurvePoint[]} scaleOverLife
 * @property {import('../core/curve.js').CurvePoint[]} opacityOverLife
 */

/**
 * Instances alive at time t: zero (outside the life window) or one.
 * @param {SingleParams} p
 * @param {number} t normalized effect time
 * @param {number} seed layer seed
 * @returns {Instance[]}
 */
export function singleInstances(p, t, seed) {
  const start = Math.min(p.start, p.end);
  const end = Math.max(p.start, p.end);
  if (t < start || t > end) return [];
  const age = end > start ? (t - start) / (end - start) : 0;
  const scale = p.scale * evalCurve(p.scaleOverLife, age);
  const opacity = Math.min(1, Math.max(0, evalCurve(p.opacityOverLife, age)));
  if (scale <= 0 || opacity <= 0) return [];
  return [
    {
      x: p.x,
      y: p.y,
      rotation: (p.rotation * Math.PI) / 180,
      scale,
      opacity,
      age,
      seed,
    },
  ];
}

/** Single-element parameters (schema entries, ids `single.*`). Curve defaults are provisional [Raul]. */
export const SINGLE_PARAMS = [
  {
    id: 'single.start',
    label: 'Life start',
    group: 'Life',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'When the element appears (0 = effect start, 1 = end)',
  },
  {
    id: 'single.end',
    label: 'Life end',
    group: 'Life',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    tooltip: 'When the element is gone',
  },
  {
    id: 'single.scaleOverLife',
    label: 'Scale over life',
    group: 'Life',
    type: 'curve',
    yMin: 0,
    yMax: 2,
    default: [
      { x: 0, y: 0 },
      { x: 0.25, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: "Scale across the element's life (drag points; double-click to add/remove)",
  },
  {
    id: 'single.opacityOverLife',
    label: 'Opacity over life',
    group: 'Life',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 0.7, y: 1 },
      { x: 1, y: 0 },
    ],
    tooltip: "Opacity across the element's life",
  },
  {
    id: 'single.x',
    label: 'X',
    group: 'Transform',
    type: 'float',
    min: -256,
    max: 256,
    step: 1,
    default: 0,
    unit: 'px',
  },
  {
    id: 'single.y',
    label: 'Y',
    group: 'Transform',
    type: 'float',
    min: -256,
    max: 256,
    step: 1,
    default: 0,
    unit: 'px',
  },
  {
    id: 'single.rotation',
    label: 'Rotation',
    group: 'Transform',
    type: 'float',
    min: -360,
    max: 360,
    step: 1,
    default: 0,
    unit: '°',
  },
  {
    id: 'single.scale',
    label: 'Scale',
    group: 'Transform',
    type: 'float',
    min: 0,
    max: 4,
    step: 0.01,
    default: 1,
    unit: 'x',
  },
];

/**
 * Read single-element parameters from a layer's params object.
 * @param {Record<string, any>} v
 * @returns {SingleParams}
 */
export const readSingleParams = (v) => ({
  start: v['single.start'],
  end: v['single.end'],
  x: v['single.x'],
  y: v['single.y'],
  rotation: v['single.rotation'],
  scale: v['single.scale'],
  scaleOverLife: v['single.scaleOverLife'],
  opacityOverLife: v['single.opacityOverLife'],
});
