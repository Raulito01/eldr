// @ts-check
/**
 * Variant randomization ("give me 6 variations in the same style").
 *
 * Each parameter draws from its own generator seeded by subSeed(variantSeed, paramId), so:
 * - the same variant seed always produces the same variant, and
 * - adding or locking one parameter never changes the random values of the others.
 *
 * Randomize ranges are ABSOLUTE values inside the parameter's min/max (e.g. size 0.8–1.3).
 */

import { subSeed } from '../core/hash.js';
import { createRng } from '../core/prng.js';
import { SEED_MAX } from './schema.js';
import { sanitizeValue } from './validators.js';

/** @typedef {import('./schema.js').ParamDef} ParamDef */

/**
 * Produce a variant of `values`. Parameters without a `randomize` rule, or listed in `locked`,
 * keep their current value.
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {Record<string, any>} values current (valid) values
 * @param {number} variantSeed integer
 * @param {{ locked?: Iterable<string> }} [options]
 * @returns {Record<string, any>} new values object (input is not modified)
 */
export function randomizeParams(schema, values, variantSeed, options = {}) {
  const locked = new Set(options.locked ?? []);
  /** @type {Record<string, any>} */
  const out = {};
  for (const def of schema) {
    const current = values[def.id] ?? def.default;
    if (def.randomize === undefined || locked.has(def.id)) {
      out[def.id] = structuredClone(current);
      continue;
    }
    const rng = createRng(subSeed(variantSeed, def.id));
    const r = def.randomize;
    let next;
    switch (def.type) {
      case 'float':
        next = rng.range(r.min, r.max);
        break;
      case 'int':
        next = rng.int(Math.ceil(r.min), Math.floor(r.max));
        break;
      case 'bool':
        next = rng.chance(r.chance);
        break;
      case 'enum': {
        const pool = r === true ? (def.options ?? []).map((o) => o.value) : r.options;
        next = rng.pick(pool);
        break;
      }
      case 'seed':
        next = Math.floor(rng.next() * (SEED_MAX + 1));
        break;
      default:
        next = current;
    }
    out[def.id] = sanitizeValue(def, next);
  }
  return out;
}
