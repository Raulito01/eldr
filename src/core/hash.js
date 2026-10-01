// @ts-check
/**
 * Integer hashing for seeds. Uses only 32-bit integer math (Math.imul, xor, shifts),
 * so results are bit-identical in every JS engine.
 *
 * The key function is `subSeed(seed, elementId, index)`: every element/particle derives
 * its own seed from the effect seed, so adding or removing one element never changes
 * the randomness of any other.
 */

/**
 * FNV-1a hash of a string (UTF-16 code units) → unsigned 32-bit integer.
 * @param {string} str
 * @returns {number}
 */
export function hashString(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * MurmurHash3 finalizer: scrambles all 32 bits so nearby inputs give unrelated outputs.
 * @param {number} h 32-bit integer
 * @returns {number} unsigned 32-bit integer
 */
export function mix32(h) {
  let x = h | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Hash any number of parts (integers or strings) into one unsigned 32-bit integer.
 * Order matters: hash32(1, 2) !== hash32(2, 1).
 * @param {...(number|string)} parts integers (any sign) or strings
 * @returns {number}
 */
export function hash32(...parts) {
  let h = 0x9e3779b9;
  for (const part of parts) {
    let v;
    if (typeof part === 'string') {
      v = hashString(part);
    } else if (Number.isInteger(part)) {
      v = part >>> 0;
    } else {
      throw new TypeError(`hash32: expected an integer or string, got ${part}`);
    }
    h = mix32((h ^ v) + 0x6d2b79f5);
  }
  return h;
}

/**
 * Derive an independent seed for one element of an effect.
 * @param {number} seed the effect seed (integer)
 * @param {string} elementId stable id, e.g. 'fireball' or 'sparks'
 * @param {number} [index=0] particle/instance index within the element
 * @returns {number} unsigned 32-bit seed
 */
export function subSeed(seed, elementId, index = 0) {
  return hash32(seed, elementId, index);
}
