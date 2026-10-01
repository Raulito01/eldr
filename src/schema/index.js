// @ts-check
// ELDR schema system: declare parameters once, derive UI, validation, save/load, variants, docs.
export { generateParamDocs } from './docs.js';
export { randomizeParams } from './randomize.js';
export { defineSchema, getDefaults, PARAM_TYPES, SEED_MAX } from './schema.js';
export { parseParams, serializeParams } from './serialize.js';
export {
  normalizeColor,
  sanitizeCurve,
  sanitizeParams,
  sanitizeRamp,
  sanitizeValue,
} from './validators.js';
