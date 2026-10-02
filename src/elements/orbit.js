// @ts-check
/**
 * `orbit` element: N instances circling a centre, optionally on a TILTED plane seen in
 * perspective (the circle becomes an ellipse; the near side is bigger/brighter, the far side
 * smaller/fainter/darker).
 *
 * Closed-form: the angle is start + spin × seconds, so any frame is computed directly.
 * Spin is per SECOND (like field flow, D-042): a longer timeline shows more turns.
 *
 * Front / behind: one layer can't be both behind and in front of another layer. Instead, an
 * orbit layer can show only its BACK half or FRONT half; stacking
 * "orbit (back) → core → orbit (front)" with the same seed wraps the orbit around the core.
 * The halves are complementary: back = depth < 0, front = depth ≥ 0.
 *
 * Plane convention: angle a (0° = up, clockwise, like burst directions) gives the in-plane
 * point (sin a, −cos a)·R. Tilt squashes y by cos(tilt); the bottom of the ellipse is the near
 * side (depth = −cos a · sin(tilt)). Then the whole plane is rotated by "Plane angle".
 */

import { evalCurve } from '../core/curve.js';
import { subSeed } from '../core/hash.js';
import { loopRate } from '../core/loopContext.js';
import { createRng } from '../core/prng.js';

const DEG = Math.PI / 180;

/** Orbit parameters (ids `orbit.*`). Defaults are a first pass [Raul]. */
export const ORBIT_PARAMS = [
  {
    id: 'orbit.count',
    label: 'Count',
    group: 'Orbit',
    type: 'int',
    min: 1,
    max: 64,
    default: 3,
    randomize: { min: 2, max: 5 },
    tooltip: 'Number of orbiting elements',
  },
  {
    id: 'orbit.radius',
    label: 'Radius',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 1024,
    step: 1,
    default: 110,
    unit: 'px',
    randomize: { min: 90, max: 130 },
    tooltip: 'Distance from the centre',
  },
  {
    id: 'orbit.radiusVariance',
    label: 'Radius variance',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.15,
    tooltip: 'Random radius difference per element',
  },
  {
    id: 'orbit.speed',
    label: 'Spin speed',
    group: 'Orbit',
    type: 'float',
    min: -8,
    max: 8,
    step: 0.01,
    default: 0.6,
    unit: 'turns/s',
    randomize: { min: 0.4, max: 0.9 },
    tooltip: 'Turns per second · + clockwise · − counter-clockwise',
  },
  {
    id: 'orbit.speedVariance',
    label: 'Speed variance',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'Random speed difference per element (they drift apart)',
  },
  {
    id: 'orbit.startAngle',
    label: 'Start angle',
    group: 'Orbit',
    type: 'float',
    min: -360,
    max: 360,
    step: 1,
    default: 0,
    unit: '°',
    tooltip: 'Where the first element starts (0° = top, clockwise)',
  },
  {
    id: 'orbit.spread',
    label: 'Spread',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 360,
    step: 1,
    default: 360,
    unit: '°',
    tooltip: '360° = evenly all around · smaller = bunched together',
  },
  {
    id: 'orbit.jitter',
    label: 'Spacing jitter',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.2,
    tooltip: 'Random unevenness of the spacing',
  },
  {
    id: 'orbit.tilt',
    label: 'Tilt',
    group: 'Perspective',
    type: 'float',
    min: 0,
    max: 89,
    step: 0.5,
    default: 65,
    unit: '°',
    tooltip: '0° = flat circle facing you · higher = seen from the side (thin ellipse)',
  },
  {
    id: 'orbit.planeAngle',
    label: 'Plane angle',
    group: 'Perspective',
    type: 'float',
    min: -360,
    max: 360,
    step: 1,
    default: -15,
    unit: '°',
    tooltip: 'Rotate the whole orbit (tilt the ellipse)',
  },
  {
    id: 'orbit.depthScale',
    label: 'Depth size',
    group: 'Perspective',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.35,
    tooltip: 'How much bigger the near side is than the far side',
  },
  {
    id: 'orbit.depthFade',
    label: 'Depth fade',
    group: 'Perspective',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.3,
    tooltip: 'How much fainter the far side is',
  },
  {
    id: 'orbit.depthShade',
    label: 'Depth darken',
    group: 'Perspective',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.2,
    tooltip: 'How much further along the ramp (cooler / darker) the far side is',
  },
  {
    id: 'orbit.show',
    label: 'Show',
    group: 'Perspective',
    type: 'enum',
    options: [
      { value: 'all', label: 'All' },
      { value: 'back', label: 'Back half (put below the core)' },
      { value: 'front', label: 'Front half (put above the core)' },
    ],
    default: 'all',
    tooltip: 'Split the orbit so it can pass behind and in front of another layer',
  },
  {
    id: 'orbit.pulse',
    label: 'Radius pulse',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'Radius breathing in and out',
  },
  {
    id: 'orbit.pulseSpeed',
    label: 'Pulse speed',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 16,
    step: 0.05,
    default: 1,
    unit: '/s',
    tooltip: 'Pulses per second (each element has its own phase)',
  },
  {
    id: 'orbit.alignToPath',
    label: 'Align to path',
    group: 'Orbit',
    type: 'bool',
    default: false,
    tooltip: 'Point each element along its direction of travel',
  },
  {
    id: 'orbit.size',
    label: 'Size',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 8,
    step: 0.01,
    default: 1,
    unit: 'x',
    tooltip: 'Scale of each element',
  },
  {
    id: 'orbit.sizeVariance',
    label: 'Size variance',
    group: 'Orbit',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.2,
    tooltip: 'Random size difference',
  },
  {
    id: 'orbit.x',
    label: 'Centre X',
    group: 'Orbit centre',
    type: 'float',
    min: -512,
    max: 512,
    step: 1,
    default: 0,
    unit: 'px',
  },
  {
    id: 'orbit.y',
    label: 'Centre Y',
    group: 'Orbit centre',
    type: 'float',
    min: -512,
    max: 512,
    step: 1,
    default: 0,
    unit: 'px',
  },
  {
    id: 'orbit.start',
    label: 'Life start',
    group: 'Life',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0,
    tooltip: 'When the orbit appears (effect time)',
  },
  {
    id: 'orbit.end',
    label: 'Life end',
    group: 'Life',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 1,
    tooltip: 'When the orbit is gone',
  },
  {
    id: 'orbit.scaleOverLife',
    label: 'Scale over life',
    group: 'Life',
    type: 'curve',
    yMin: 0,
    yMax: 2,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Scale across the orbit life',
  },
  {
    id: 'orbit.opacityOverLife',
    label: 'Opacity over life',
    group: 'Life',
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'Opacity across the orbit life',
  },
];

/** Extra param for crescent orbits: bend each swoosh along the (tilted) orbit itself. */
export const ORBIT_FOLLOW_PARAM = {
  id: 'orbit.followPath',
  label: 'Follow path',
  group: 'Orbit',
  type: 'bool',
  default: true,
  tooltip:
    'Bend each crescent along the orbit ellipse (uses the orbit radius, not the shape radius)',
};

/** @param {Record<string, any>} v */
export const readOrbitParams = (v) => ({
  count: v['orbit.count'],
  radius: v['orbit.radius'],
  radiusVariance: v['orbit.radiusVariance'],
  speed: v['orbit.speed'],
  speedVariance: v['orbit.speedVariance'] ?? 0,
  startAngle: v['orbit.startAngle'],
  spread: v['orbit.spread'],
  jitter: v['orbit.jitter'],
  tilt: v['orbit.tilt'],
  planeAngle: v['orbit.planeAngle'],
  depthScale: v['orbit.depthScale'],
  depthFade: v['orbit.depthFade'],
  depthShade: v['orbit.depthShade'],
  show: /** @type {'all'|'back'|'front'} */ (v['orbit.show'] ?? 'all'),
  pulse: v['orbit.pulse'] ?? 0,
  pulseSpeed: v['orbit.pulseSpeed'] ?? 1,
  alignToPath: v['orbit.alignToPath'] ?? false,
  size: v['orbit.size'],
  sizeVariance: v['orbit.sizeVariance'],
  x: v['orbit.x'] ?? 0,
  y: v['orbit.y'] ?? 0,
  start: v['orbit.start'],
  end: v['orbit.end'],
  scaleOverLife: v['orbit.scaleOverLife'],
  opacityOverLife: v['orbit.opacityOverLife'],
  followPath: v['orbit.followPath'] ?? false,
});

/** @typedef {ReturnType<typeof readOrbitParams>} OrbitParams */

/**
 * The orbit plane seen in perspective.
 * @param {OrbitParams} p
 */
export function orbitPlane(p) {
  const tilt = p.tilt * DEG;
  const plane = p.planeAngle * DEG;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);
  const cp = Math.cos(plane);
  const sp = Math.sin(plane);
  return {
    cosT,
    sinT,
    /** In-plane point → screen offset from the orbit centre. @param {number} x @param {number} y @returns {[number, number]} */
    project(x, y) {
      const yy = y * cosT;
      return [x * cp - yy * sp, x * sp + yy * cp];
    },
    /** Depth of an in-plane point at distance R: −1 far … +1 near. @param {number} y @param {number} R */
    depth: (y, R) => (R > 0 ? (y / R) * sinT : 0),
  };
}

/**
 * @typedef {import('./single.js').Instance & {
 *   depth: number, rampShift: number, orbitAngle: number, orbitRadius: number,
 *   speedSign: number, size: number, baseSize: number, followPath: boolean
 * }} OrbitInstance
 */

/**
 * Instances at this moment, sorted back to front (far side drawn first).
 * Follow-path crescents are NOT filtered by "show" here: they span both halves, so their
 * painter cuts them at the depth boundary instead (see `orbitHalfRanges`).
 * @param {OrbitParams} p
 * @param {number} t normalized effect time (life window)
 * @param {number} seconds time in seconds (spin, pulse)
 * @param {number} layerSeed
 * @returns {OrbitInstance[]}
 */
export function orbitInstances(p, t, seconds, layerSeed) {
  const start = Math.min(p.start, p.end);
  const end = Math.max(p.start, p.end);
  if (t < start || t > end) return [];
  const age = end > start ? (t - start) / (end - start) : 0;
  const lifeScale = evalCurve(p.scaleOverLife, age);
  const lifeOpacity = Math.min(1, Math.max(0, evalCurve(p.opacityOverLife, age)));
  if (lifeScale <= 0 || lifeOpacity <= 0) return [];
  const plane = orbitPlane(p);
  const full = p.spread >= 360;
  const step = full ? 360 / p.count : p.count > 1 ? p.spread / (p.count - 1) : 0;
  const spreadOffset = full ? 0 : -p.spread / 2;

  /** @type {OrbitInstance[]} */
  const out = [];
  for (let i = 0; i < p.count; i++) {
    const seed = subSeed(layerSeed, 'orbit', i);
    const rng = createRng(seed);
    // Fixed draw order: raising the count never changes existing elements.
    const jitter = (rng.next() - 0.5) * p.jitter * (step || 30);
    const radiusK = 1 - p.radiusVariance * rng.next();
    const sizeK = 1 - p.sizeVariance * rng.next();
    const speedK = 1 - p.speedVariance * rng.next();
    const pulsePhase = rng.next();

    // seamless loops: whole turns per loop (D-071)
    const speed = loopRate(p.speed * speedK);
    const aDeg = p.startAngle + spreadOffset + i * step + jitter + 360 * speed * seconds;
    const a = aDeg * DEG;
    const R =
      p.radius *
      radiusK *
      (1 + p.pulse * Math.sin(2 * Math.PI * (loopRate(p.pulseSpeed) * seconds + pulsePhase)));
    const px = Math.sin(a) * R;
    const py = -Math.cos(a) * R;
    const depth = plane.depth(py, R);
    if (!p.followPath && !inHalf(p.show, depth)) continue;
    const [sx, sy] = plane.project(px, py);
    const near = (1 - depth) / 2; // 0 near … 1 far
    const opacity = lifeOpacity * (1 - p.depthFade * near);
    const baseSize = p.size * sizeK * lifeScale;
    const size = baseSize * (1 + p.depthScale * depth);
    if (opacity <= 0 || size <= 0) continue;
    let rotation = 0;
    if (p.alignToPath) {
      // Screen direction of travel: derivative of the projected point along the orbit.
      const dir = speed >= 0 ? 1 : -1;
      const [tx, ty] = plane.project(Math.cos(a) * dir, Math.sin(a) * dir);
      rotation = Math.atan2(ty, tx);
    }
    out.push({
      x: p.followPath ? p.x : p.x + sx,
      y: p.followPath ? p.y : p.y + sy,
      rotation: p.followPath ? 0 : rotation,
      scale: p.followPath ? 1 : size,
      opacity,
      age,
      seed,
      depth,
      rampShift: p.depthShade * near,
      orbitAngle: a,
      orbitRadius: R,
      speedSign: speed >= 0 ? 1 : -1,
      size,
      baseSize,
      followPath: p.followPath,
    });
  }
  out.sort((m, n) => m.depth - n.depth);
  return out;
}

/** @param {'all'|'back'|'front'} show @param {number} depth */
export const inHalf = (show, depth) =>
  show === 'all' || (show === 'front' ? depth >= 0 : depth < 0);

/**
 * Split v ∈ [0, 1] into the intervals whose depth falls in the requested half, refining each
 * crossing by bisection. Front and back intervals together cover [0, 1] exactly.
 * @param {(v: number) => number} depthAt @param {'all'|'back'|'front'} show
 * @param {number} [samples=96]
 * @returns {[number, number][]}
 */
export function orbitHalfRanges(depthAt, show, samples = 96) {
  if (show === 'all') return [[0, 1]];
  const inside = (/** @type {number} */ v) => inHalf(show, depthAt(v));
  /** @param {number} a inside-state at a differs from b @param {number} b */
  const cross = (a, b) => {
    const ia = inside(a);
    for (let k = 0; k < 30; k++) {
      const m = (a + b) / 2;
      if (inside(m) === ia) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  /** @type {[number, number][]} */
  const out = [];
  let prev = 0;
  let prevIn = inside(0);
  let runStart = prevIn ? 0 : -1;
  for (let i = 1; i <= samples; i++) {
    const v = i / samples;
    const now = inside(v);
    if (now !== prevIn) {
      const c = cross(prev, v);
      if (now) runStart = c;
      else out.push([runStart, c]);
    }
    prev = v;
    prevIn = now;
  }
  if (prevIn) out.push([runStart, 1]);
  return out;
}
