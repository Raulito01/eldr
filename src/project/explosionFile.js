// @ts-check
/**
 * Save / load an explosion (pulled forward from 8.2 at Raul's request, step 3.5; D-047).
 *
 * File = JSON, `.eldr.json`:
 *   { format: 'eldr-vfx', version: 2, app, appVersion, family: 'explosion', name, seed,
 *     globals, timing, layers: [{ id, label, type, enabled, solo, opacity, blend, anchor,
 *     seedKey, params }] }   (layers bottom → top)
 * Saving writes every parameter in schema order (stable, diff-friendly).
 *
 * Version 2 (3.6a): the file holds the WHOLE layer stack (added, removed, reordered, renamed
 * layers). Version 1 files (3.5) had the fixed base stack; they load the same way, and layers
 * without an anchor get the base stack's anchor for their id.
 *
 * Every value goes through validation, so files from older or newer versions still open:
 * missing values get defaults (the base stack's value for a base layer id, else the type's
 * default), broken ones are fixed, layers of unknown types are skipped, and anything that had
 * to change is reported as a warning.
 */

import { assertTiming } from '../core/timing.js';
import {
  ANCHORS,
  BASE_ANCHOR_OF,
  createExplosion,
  EXPLOSION_SCHEMA,
  makeLayer,
} from '../effects/explosion/explosion.js';
import { LAYER_TYPES } from '../effects/layerTypes.js';
import { BLEND_MODES } from '../render/compositor.js';
import { getDefaults } from '../schema/index.js';
import { parseParams, serializeParams } from '../schema/serialize.js';
import { APP_NAME, APP_VERSION, FILE_FORMAT, FILE_FORMAT_VERSION } from '../version.js';

/** File extension for saved effects. */
export const EFFECT_FILE_EXT = '.eldr.json';

const BLENDS = new Set(Object.keys(BLEND_MODES));
const ANCHOR_SET = new Set(/** @type {readonly string[]} */ (ANCHORS));

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
      solo: l.solo,
      opacity: l.opacity,
      blend: l.blend,
      anchor: l.anchor,
      seedKey: l.seedKey,
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

  const baseById = new Map(base.layers.map((l) => [l.id, l]));
  /** @type {import('../effects/explosion/explosion.js').EditorLayer[]} */
  const layers = [];
  const usedIds = new Set();
  for (const s of Array.isArray(obj.layers) ? obj.layers : []) {
    if (!isObject(s)) continue;
    if (!(typeof s.type === 'string' && s.type in LAYER_TYPES)) {
      warnings.push(`Layer "${s.label ?? s.id}": unknown type "${s.type}", skipped`);
      continue;
    }
    const type = /** @type {keyof typeof LAYER_TYPES} */ (s.type);
    let id = typeof s.id === 'string' && s.id ? s.id : type;
    for (let i = 2; usedIds.has(id); i++) id = `${s.id || type}-${i}`;
    usedIds.add(id);
    const fromBase = baseById.get(id);
    const defaults =
      fromBase?.type === type ? fromBase.params : getDefaults(LAYER_TYPES[type].schema);
    const p = parseParams(LAYER_TYPES[type].schema, {
      ...defaults,
      ...(isObject(s.params) ? s.params : {}),
    });
    warnings.push(...p.warnings.map((w) => `${id}: ${w}`));
    if (s.blend !== undefined && !BLENDS.has(s.blend)) {
      warnings.push(`${id}: unknown blend mode "${s.blend}", normal used`);
    }
    layers.push(
      makeLayer({
        id,
        type,
        label: typeof s.label === 'string' && s.label ? s.label : (fromBase?.label ?? id),
        enabled: typeof s.enabled === 'boolean' ? s.enabled : true,
        solo: s.solo === true,
        opacity: Number.isFinite(s.opacity) ? Math.min(1, Math.max(0, s.opacity)) : 1,
        blend: BLENDS.has(s.blend) ? s.blend : 'normal',
        anchor: ANCHOR_SET.has(s.anchor)
          ? s.anchor
          : /** @type {any} */ (BASE_ANCHOR_OF[id] ?? 'afterImpact'),
        seedKey: typeof s.seedKey === 'string' && s.seedKey ? s.seedKey : id,
        params: p.values,
      }),
    );
  }

  return {
    state: { ...base, globals: g.values, timing, layers },
    seed: Number.isFinite(obj.seed) ? Math.trunc(obj.seed) >>> 0 : undefined,
    name: typeof obj.name === 'string' ? obj.name : '',
    warnings,
  };
}
