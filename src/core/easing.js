// @ts-check
/**
 * Easing functions for animation curves. Every easing maps normalized time t (0–1) to progress,
 * with f(0) = 0 and f(1) = 1. "Back" and "elastic" overshoot outside 0–1 on purpose
 * (anticipation and overshoot).
 *
 * Naming: in* = slow start, out* = slow end, inOut* = slow both ends.
 */

const C1 = 1.70158; // standard "back" overshoot amount (~10%)
const C2 = C1 * 1.525;
const C3 = C1 + 1;
const HALF_PI = Math.PI / 2;
const ELASTIC_C4 = (2 * Math.PI) / 3;

/** @typedef {(t: number) => number} EasingFn */

/** @param {number} t */
function outBounce(t) {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) {
    const u = t - 1.5 / d1;
    return n1 * u * u + 0.75;
  }
  if (t < 2.5 / d1) {
    const u = t - 2.25 / d1;
    return n1 * u * u + 0.9375;
  }
  const u = t - 2.625 / d1;
  return n1 * u * u + 0.984375;
}

/** All named easings. @type {Readonly<Record<string, EasingFn>>} */
export const EASINGS = Object.freeze({
  linear: (t) => t,

  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),

  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),

  inQuart: (t) => t ** 4,
  outQuart: (t) => 1 - (1 - t) ** 4,
  inOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),

  inQuint: (t) => t ** 5,
  outQuint: (t) => 1 - (1 - t) ** 5,
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),

  inSine: (t) => 1 - Math.cos(t * HALF_PI),
  outSine: (t) => Math.sin(t * HALF_PI),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,

  inExpo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  outExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? 2 ** (20 * t - 10) / 2 : (2 - 2 ** (-20 * t + 10)) / 2,

  inCirc: (t) => 1 - Math.sqrt(1 - t * t),
  outCirc: (t) => Math.sqrt(1 - (t - 1) * (t - 1)),
  inOutCirc: (t) =>
    t < 0.5 ? (1 - Math.sqrt(1 - (2 * t) ** 2)) / 2 : (Math.sqrt(1 - (-2 * t + 2) ** 2) + 1) / 2,

  // Back: pulls back before moving (anticipation) or overshoots then settles.
  inBack: (t) => C3 * t * t * t - C1 * t * t,
  outBack: (t) => 1 + C3 * (t - 1) ** 3 + C1 * (t - 1) ** 2,
  inOutBack: (t) =>
    t < 0.5
      ? ((2 * t) ** 2 * ((C2 + 1) * 2 * t - C2)) / 2
      : ((2 * t - 2) ** 2 * ((C2 + 1) * (t * 2 - 2) + C2) + 2) / 2,

  outElastic: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ELASTIC_C4) + 1,
  outBounce,
});

/** Names of all easings, in display order. */
export const EASING_NAMES = Object.freeze(Object.keys(EASINGS));

/**
 * Look up an easing by name. Throws on unknown names so typos fail loudly.
 * @param {string} name
 * @returns {EasingFn}
 */
export function getEasing(name) {
  const fn = EASINGS[name];
  if (!fn) throw new Error(`Unknown easing "${name}"`);
  return fn;
}

/**
 * CSS-style cubic-bezier easing with control points (x1, y1) and (x2, y2).
 * x1 and x2 are clamped to 0–1 so the curve is a function of time; y may overshoot.
 * Used later by the curve editor widget.
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @returns {EasingFn}
 */
export function cubicBezier(x1, y1, x2, y2) {
  const cx1 = Math.min(1, Math.max(0, x1));
  const cx2 = Math.min(1, Math.max(0, x2));

  // Polynomial coefficients for x(s) and y(s), s = curve parameter 0–1.
  const ax = 1 + 3 * cx1 - 3 * cx2;
  const bx = 3 * cx2 - 6 * cx1;
  const cx = 3 * cx1;
  const ay = 1 + 3 * y1 - 3 * y2;
  const by = 3 * y2 - 6 * y1;
  const cy = 3 * y1;

  /** @param {number} s */
  const sampleX = (s) => ((ax * s + bx) * s + cx) * s;
  /** @param {number} s */
  const sampleY = (s) => ((ay * s + by) * s + cy) * s;
  /** @param {number} s */
  const slopeX = (s) => (3 * ax * s + 2 * bx) * s + cx;

  /** Find the curve parameter s where x(s) = x. @param {number} x */
  function solveS(x) {
    // Newton–Raphson first (fast), then bisection as a guaranteed fallback.
    let s = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - x;
      if (Math.abs(err) < 1e-7) return s;
      const d = slopeX(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = x;
    for (let i = 0; i < 40; i++) {
      const v = sampleX(s);
      if (Math.abs(v - x) < 1e-7) return s;
      if (v < x) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  }

  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    return sampleY(solveS(t));
  };
}
