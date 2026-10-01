// @ts-check
// ELDR core: deterministic, pure building blocks (no DOM, no Math.random, no clocks).
export { cubicBezier, EASING_NAMES, EASINGS, getEasing } from './easing.js';
export { hash32, hashString, mix32, subSeed } from './hash.js';
export {
  approxEqual,
  clamp,
  clamp01,
  degToRad,
  fract,
  invLerp,
  lerp,
  mod,
  radToDeg,
  remap,
  smootherstep,
  smoothstep,
  TAU,
  wrap,
} from './math.js';
export { createNoise } from './noise.js';
export { createRng } from './prng.js';
export {
  assertTiming,
  DEFAULT_PHASES,
  frameAtTime,
  frameTime,
  HOLD_FRAMES,
  HOLD_MODES,
  holdFrames,
  PHASE_NAMES,
  phaseAt,
  phasesOf,
} from './timing.js';
