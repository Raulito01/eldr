// @ts-check
/**
 * Save / load an explosion (pulled forward from 8.2 at Raul's request, step 3.5; D-047).
 *
 * File = JSON, `.eldr.json`:
 *   { format: 'eldr-vfx', version: 1, app, appVersion, family: 'explosion', name, seed,
 *     globals, timing, layers: [{ id, label, type, enabled, blend, params }] }
 * Saving writes every parameter in schema order (stable, diff-friendly). Loading starts from the
 * current base stack, matches layers by id and sends every value through validation, so files
 * from older or newer versions still open: missing values get defaults, broken ones are fixed,
 * and anything that had to change is reported as a warning.
 */

import { assertTiming } from '../core/timing.js';
import { createExplosion, EXPLOSION_SCHEMA } from '../effects/explosion/explosion.js';
import { LAYER_TYPES } from '../effects/layerTypes.js';
import { parseParams, serializeParams } from '../schema/serialize.js';
import { APP_NAME, APP_VERSION, FILE_FORMAT, FILE_FORMAT_VERSION } from '../version.js';

/** File extension for saved effects. */
export const EFFECT_FILE_EXT = '.eldr.json';

const BLENDS = new Set(['normal', 'add', 'screen']);

/**
 * @param {import('../effects/explosion/explosion.js').ExplosionState} state
 * @param {{ seed: number, name?: string }} meta
 * @returns {Record<string, any>} JSON-ready object
 */
export function serializeExplosion(state, meta) {
  return {
    format: FILE_FORMAT,
    version: FILE_FORMAT_VERSION,
    app: APP_NAME,
    appVersion: APP_VERSION,
    family: 'explosion',
    name: meta.name ?? '',
    seed: meta.seed >>> 0,
    globals: serializeParams(EXPLOSION_SCHEMA, state.globals),
    timing: structuredClone(state.timing),
    layers: state.layers.map((l) => ({
      id: l.id,
      label: l.label,
      type: l.type,
      enabled: l.enabled,
      blend: l.blend,
      params: serializeParams(LAYER_TYPES[l.type].schema, l.params),
    })),
  };
}

/** @param {any} v */
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Parse a saved explosion (text or object). Never throws for bad content: returns `error` when
 * the file can't be used at all, otherwise a valid state plus warnings.
 * @param {string | Record<string, any>} data
 * @returns {{ state?: import('../effects/explosion/explosion.js').ExplosionState, seed?: number,
 *   name?: string, warnings: string[], error?: string }}
 */
export function parseExplosion(data) {
  /** @type {any} */
  let obj = data;
  if (typeof data === 'string') {
    try {
      obj = JSON.parse(data);
    } catch (err) {
      return { warnings: [], error: `Not a valid file (${/** @type {Error} */ (err).message})` };
    }
  }
  if (!isObject(obj) || obj.format !== FILE_FORMAT) {
    return { warnings: [], error: 'Not an ELDR effect file' };
  }
  if (obj.family !== 'explosion') {
    return { warnings: [], error: `This file is a "${obj.family}" effect, not an explosion` };
  }
  /** @type {string[]} */
  const warnings = [];
  if (typeof obj.version === 'number' && obj.version > FILE_FORMAT_VERSION) {
    warnings.push(`Saved by a newer ELDR (file format ${obj.version}); some settings may be lost`);
  }
  const base = createExplosion();

  const g = parseParams(EXPLOSION_SCHEMA, {
    ...base.globals,
    ...(isObject(obj.globals) ? obj.globals : {}),
  });
  warnings.push(...g.warnings.map((w) => `globals: ${w}`));

  let timing = base.timing;
  if (isObject(obj.timing)) {
    const t = { ...base.timing, ...obj.timing };
    try {
      assertTiming(t);
      timing = t;
    } catch (err) {
      warnings.push(`timing: ${/** @type {Error} */ (err).message} (default timing used)`);
    }
  }

  const saved = new Map(
    (Array.isArray(obj.layers) ? obj.layers : []).filter(isObject).map((l) => [l.id, l]),
  );
  for (const id of saved.keys()) {
    if (!base.layers.some((l) => l.id === id)) warnings.push(`Unknown layer "${id}" skipped`);
  }
  const layers = base.layers.map((l) => {
    const s = saved.get(l.id);
    if (!s) return l;
    if (s.type !== l.type) {
      warnings.push(`Layer "${l.id}": type "${s.type}" doesn't match "${l.type}"; defaults kept`);
      return l;
    }
    // Missing values fall back to the base stack's value for this layer (not the type default).
    const p = parseParams(LAYER_TYPES[l.type].schema, {
      ...l.params,
      ...(isObject(s.params) ? s.params : {}),
    });
    warnings.push(...p.warnings.map((w) => `${l.id}: ${w}`));
    return {
      ...l,
      label: typeof s.label === 'string' && s.label ? s.label : l.label,
      enabled: typeof s.enabled === 'boolean' ? s.enabled : l.enabled,
      blend: BLENDS.has(s.blend) ? s.blend : l.blend,
      params: p.values,
    };
  });

  return {
    state: { ...base, globals: g.values, timing, layers },
    seed: Number.isFinite(obj.seed) ? Math.trunc(obj.seed) >>> 0 : undefined,
    name: typeof obj.name === 'string' ? obj.name : '',
    warnings,
  };
}
