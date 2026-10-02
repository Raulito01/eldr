// @ts-check
/**
 * Mask fields as animatable params (3.6d): id `mask.<maskId>.<field>` for the numeric fields
 * (position, size, rotation, feather, expansion, opacity). Keys work like any other param.
 */

import { MASK_LABELS, MASK_NUMBERS } from '../render/masks.js';

const RANGES = /** @type {Record<string, { min?: number, max?: number }>} */ ({
  w: { min: 0 },
  h: { min: 0 },
  feather: { min: 0 },
  opacity: { min: 0, max: 100 },
});

/** @param {string} maskId @param {string} field */
export const maskParamId = (maskId, field) => `mask.${maskId}.${field}`;

/** `mask.<id>.<field>` → parts, or null. @param {string} id */
export function parseMaskParam(id) {
  if (!id.startsWith('mask.')) return null;
  const rest = id.slice(5);
  const dot = rest.lastIndexOf('.');
  if (dot <= 0) return null;
  const field = rest.slice(dot + 1);
  if (!MASK_NUMBERS.includes(field)) return null;
  return { maskId: rest.slice(0, dot), field };
}

/** Schema-like def of a mask param (type + range). @param {string} id */
export function maskParamDef(id) {
  const p = parseMaskParam(id);
  if (!p) return null;
  return { id, type: 'float', ...(RANGES[p.field] ?? {}) };
}

/** Defs for every mask field of a layer. @param {{ masks?: { id: string }[] }} l */
export const maskDefsOf = (l) =>
  (l.masks ?? []).flatMap((m) =>
    MASK_NUMBERS.map((f) => /** @type {any} */ (maskParamDef(maskParamId(m.id, f)))),
  );

/** Label for a mask param, e.g. "Mask 1 · Feather". @param {{ masks?: { id: string, name: string }[] }} l @param {string} id */
export function maskParamLabel(l, id) {
  const p = parseMaskParam(id);
  if (!p) return id;
  const m = l.masks?.find((x) => x.id === p.maskId);
  return `${m?.name ?? 'Mask'} · ${/** @type {any} */ (MASK_LABELS)[p.field]}`;
}
