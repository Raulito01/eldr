// @ts-check
/**
 * Save/load of parameter values. Saving writes every parameter in schema order (stable files,
 * clean diffs). Loading always goes through validation, so broken or old files still open.
 */

import { sanitizeParams } from './validators.js';

/** @typedef {import('./schema.js').ParamDef} ParamDef */

/**
 * Values → plain JSON-ready object, keys in schema order.
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {Record<string, any>} values
 * @returns {Record<string, any>}
 */
export function serializeParams(schema, values) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const def of schema) out[def.id] = structuredClone(values[def.id] ?? def.default);
  return out;
}

/**
 * Parsed JSON (object or string) → valid values plus a list of what had to be fixed.
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {string | Record<string, any>} data
 * @returns {{ values: Record<string, any>, warnings: string[] }}
 */
export function parseParams(schema, data) {
  let obj = data;
  if (typeof data === 'string') {
    try {
      obj = JSON.parse(data);
    } catch (err) {
      return {
        ...sanitizeParams(schema, {}),
        warnings: [`Could not read JSON: ${/** @type {Error} */ (err).message}`],
      };
    }
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ...sanitizeParams(schema, {}), warnings: ['Expected a JSON object of parameters'] };
  }
  return sanitizeParams(schema, /** @type {Record<string, any>} */ (obj));
}
