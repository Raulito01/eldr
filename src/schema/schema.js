// @ts-check
/**
 * Parameter schema: every parameter in ELDR is declared ONCE here-style, and the inspector UI,
 * validation, defaults, save/load, variant randomization and docs are all derived from it.
 *
 * Supported types: float | int | bool | enum | color | ramp | curve | seed
 *
 * @typedef {{ pos: number, color: string }} RampStop   pos normalized 0–1, color '#rrggbb[aa]'
 * @typedef {{ x: number, y: number }} CurvePoint        x normalized 0–1, y within yMin–yMax
 * @typedef {{ value: string, label: string }} EnumOption
 *
 * @typedef {object} ParamDef
 * @property {string} id         unique, dotted, e.g. 'fireball.size'
 * @property {string} label      shown in the UI
 * @property {string} group      inspector section (default 'General')
 * @property {'float'|'int'|'bool'|'enum'|'color'|'ramp'|'curve'|'seed'} type
 * @property {any} default
 * @property {number} [min]      float/int
 * @property {number} [max]      float/int
 * @property {number} [step]     float/int (defaults: int 1, float (max-min)/100)
 * @property {EnumOption[]} [options] enum
 * @property {number} [yMin]     curve (default 0)
 * @property {number} [yMax]     curve (default 1)
 * @property {any} [randomize]   float/int {min,max} · bool {chance} · enum true|{options} · seed true
 * @property {string} [unit]     e.g. 'px', 'x', '°'
 * @property {string} [tooltip]
 */

import { normalizeColor, sanitizeCurve, sanitizeRamp } from './validators.js';

export const PARAM_TYPES = Object.freeze([
  'float',
  'int',
  'bool',
  'enum',
  'color',
  'ramp',
  'curve',
  'seed',
]);

/** Largest valid seed (unsigned 32-bit). */
export const SEED_MAX = 0xffffffff;

const ID_PATTERN = /^[a-zA-Z]\w*(\.[a-zA-Z]\w*)*$/;
const isNum = (/** @type {any} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * List the problems with one raw parameter definition (empty list = valid).
 * @param {any} def
 * @returns {string[]}
 */
function checkDef(def) {
  const errs = [];
  const where = `"${def?.id ?? '?'}"`;
  if (typeof def?.id !== 'string' || !ID_PATTERN.test(def.id)) errs.push(`${where}: invalid id`);
  if (typeof def?.label !== 'string' || !def.label) errs.push(`${where}: missing label`);
  if (!PARAM_TYPES.includes(def?.type)) return [...errs, `${where}: unknown type "${def?.type}"`];

  const r = def.randomize;
  switch (def.type) {
    case 'float':
    case 'int': {
      if (!isNum(def.min) || !isNum(def.max) || def.min >= def.max) {
        errs.push(`${where}: needs numeric min < max`);
        break;
      }
      if (def.type === 'int' && ![def.min, def.max, def.default].every(Number.isInteger)) {
        errs.push(`${where}: int min/max/default must be integers`);
      }
      if (!isNum(def.default) || def.default < def.min || def.default > def.max) {
        errs.push(`${where}: default ${def.default} outside ${def.min}–${def.max}`);
      }
      if (def.step !== undefined && !(isNum(def.step) && def.step > 0)) {
        errs.push(`${where}: step must be > 0`);
      }
      if (r !== undefined) {
        if (!isNum(r?.min) || !isNum(r?.max) || r.min > r.max) {
          errs.push(`${where}: randomize needs {min, max} with min ≤ max`);
        } else if (r.min < def.min || r.max > def.max) {
          errs.push(`${where}: randomize range ${r.min}–${r.max} outside ${def.min}–${def.max}`);
        }
      }
      break;
    }
    case 'bool':
      if (typeof def.default !== 'boolean') errs.push(`${where}: default must be true/false`);
      if (r !== undefined && !(isNum(r?.chance) && r.chance >= 0 && r.chance <= 1)) {
        errs.push(`${where}: randomize needs {chance} between 0 and 1`);
      }
      break;
    case 'enum': {
      if (!Array.isArray(def.options) || def.options.length === 0) {
        errs.push(`${where}: needs a non-empty options list`);
        break;
      }
      const values = def.options.map((/** @type {any} */ o) =>
        typeof o === 'string' ? o : o?.value,
      );
      if (!values.includes(def.default)) errs.push(`${where}: default not in options`);
      if (r !== undefined && r !== true) {
        const ok = Array.isArray(r?.options) && r.options.length > 0;
        if (!ok || !r.options.every((/** @type {any} */ v) => values.includes(v))) {
          errs.push(`${where}: randomize must be true or {options: [subset of options]}`);
        }
      }
      break;
    }
    case 'color':
      if (normalizeColor(def.default) === null) errs.push(`${where}: invalid default color`);
      break;
    case 'ramp':
      if (sanitizeRamp(def.default) === null) errs.push(`${where}: default ramp needs ≥ 2 stops`);
      break;
    case 'curve': {
      const yMin = def.yMin ?? 0;
      const yMax = def.yMax ?? 1;
      if (!(isNum(yMin) && isNum(yMax) && yMin < yMax)) errs.push(`${where}: needs yMin < yMax`);
      else if (sanitizeCurve(def.default, yMin, yMax) === null) {
        errs.push(`${where}: default curve needs ≥ 2 points`);
      }
      break;
    }
    case 'seed':
      if (!Number.isInteger(def.default) || def.default < 0 || def.default > SEED_MAX) {
        errs.push(`${where}: default seed must be an integer 0–${SEED_MAX}`);
      }
      if (r !== undefined && r !== true) errs.push(`${where}: randomize must be true`);
      break;
  }
  if (r !== undefined && ['color', 'ramp', 'curve'].includes(def.type)) {
    errs.push(`${where}: randomize is not supported for ${def.type} yet`);
  }
  return errs;
}

/**
 * Validate and freeze a list of parameter definitions. Throws one error listing every problem,
 * so a broken schema is caught the moment it is loaded (and by the schema tests).
 * @param {any[]} defs
 * @returns {ReadonlyArray<Readonly<ParamDef>>}
 */
export function defineSchema(defs) {
  const errors = [];
  const seen = new Set();
  for (const def of defs) {
    errors.push(...checkDef(def));
    if (seen.has(def?.id)) errors.push(`"${def.id}": duplicate id`);
    seen.add(def?.id);
  }
  if (errors.length) throw new Error(`Invalid parameter schema:\n- ${errors.join('\n- ')}`);

  return Object.freeze(
    defs.map((def) => {
      const out = { group: 'General', ...def };
      if (def.type === 'enum') {
        out.options = def.options.map((/** @type {any} */ o) =>
          Object.freeze(typeof o === 'string' ? { value: o, label: o } : { ...o }),
        );
      }
      if (def.type === 'int') out.step = def.step ?? 1;
      if (def.type === 'float') out.step = def.step ?? (def.max - def.min) / 100;
      if (def.type === 'curve') {
        out.yMin = def.yMin ?? 0;
        out.yMax = def.yMax ?? 1;
      }
      return Object.freeze(out);
    }),
  );
}

/**
 * Default value for every parameter (deep copies, safe to mutate).
 * @param {ReadonlyArray<ParamDef>} schema
 * @returns {Record<string, any>}
 */
export function getDefaults(schema) {
  /** @type {Record<string, any>} */
  const values = {};
  for (const def of schema) values[def.id] = structuredClone(def.default);
  return values;
}
