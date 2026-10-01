// @ts-check
/**
 * Value validation: turns ANY incoming value (slider, loaded file, preset, old project) into a
 * valid one for its parameter. Never throws — bad values fall back to the default, and every
 * change is reported as a warning so loading can tell the user what was fixed.
 */

/** @typedef {import('./schema.js').ParamDef} ParamDef */

const isNum = (/** @type {any} */ v) => typeof v === 'number' && Number.isFinite(v);
const clampTo = (/** @type {number} */ v, /** @type {number} */ lo, /** @type {number} */ hi) =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Normalize a colour string to lowercase '#rrggbb' (or '#rrggbbaa' when not fully opaque).
 * Accepts #rgb, #rgba, #rrggbb, #rrggbbaa. Returns null if invalid.
 * @param {any} value
 * @returns {string|null}
 */
export function normalizeColor(value) {
  if (typeof value !== 'string') return null;
  let hex = value.trim().toLowerCase();
  if (!/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(hex)) return null;
  if (hex.length <= 5) {
    hex = `#${[...hex.slice(1)].map((c) => c + c).join('')}`;
  }
  if (hex.length === 9 && hex.endsWith('ff')) hex = hex.slice(0, 7);
  return hex;
}

/**
 * Clean a ramp: drop invalid stops, clamp positions to 0–1, sort by position.
 * @param {any} value
 * @returns {import('./schema.js').RampStop[]|null} null if fewer than 2 valid stops
 */
export function sanitizeRamp(value) {
  if (!Array.isArray(value)) return null;
  const stops = [];
  for (const stop of value) {
    const color = normalizeColor(stop?.color);
    if (!isNum(stop?.pos) || color === null) continue;
    stops.push({ pos: clampTo(stop.pos, 0, 1), color });
  }
  if (stops.length < 2) return null;
  return stops.sort((a, b) => a.pos - b.pos); // Array.sort is stable: equal positions keep order
}

/**
 * Clean a curve: drop invalid points, clamp x to 0–1 and y to [yMin, yMax], sort by x,
 * and pin the first/last point to x = 0 and x = 1 so the curve covers the whole lifetime.
 * @param {any} value @param {number} yMin @param {number} yMax
 * @returns {import('./schema.js').CurvePoint[]|null} null if fewer than 2 valid points
 */
export function sanitizeCurve(value, yMin, yMax) {
  if (!Array.isArray(value)) return null;
  const points = [];
  for (const p of value) {
    if (!isNum(p?.x) || !isNum(p?.y)) continue;
    points.push({ x: clampTo(p.x, 0, 1), y: clampTo(p.y, yMin, yMax) });
  }
  if (points.length < 2) return null;
  points.sort((a, b) => a.x - b.x);
  points[0].x = 0;
  points[points.length - 1].x = 1;
  return points;
}

/** Number of decimals in a step (0.01 → 2), used to remove float noise after snapping. */
function decimalsOf(/** @type {number} */ step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

/**
 * Snap v to the nearest step counted from min, without float noise (0.30000000000000004 → 0.3).
 * @param {number} v @param {number} min @param {number} step
 */
function snap(v, min, step) {
  const snapped = min + Math.round((v - min) / step) * step;
  const decimals = Math.min(10, Math.max(decimalsOf(step), decimalsOf(min)));
  return Number(snapped.toFixed(decimals));
}

/**
 * Return a valid value for this parameter. Invalid input → default (deep copy).
 * @param {ParamDef} def
 * @param {any} value
 * @returns {any}
 */
export function sanitizeValue(def, value) {
  const fallback = () => structuredClone(def.default);
  switch (def.type) {
    case 'float': {
      if (!isNum(value)) return fallback();
      const min = /** @type {number} */ (def.min);
      const max = /** @type {number} */ (def.max);
      return clampTo(
        snap(clampTo(value, min, max), min, /** @type {number} */ (def.step)),
        min,
        max,
      );
    }
    case 'int': {
      if (!isNum(value)) return fallback();
      const min = /** @type {number} */ (def.min);
      const max = /** @type {number} */ (def.max);
      const stepped = snap(Math.round(value), min, Math.max(1, Math.round(def.step ?? 1)));
      return clampTo(Math.round(stepped), min, max);
    }
    case 'bool':
      return typeof value === 'boolean' ? value : fallback();
    case 'enum':
      return def.options?.some((o) => o.value === value) ? value : fallback();
    case 'color':
      return normalizeColor(value) ?? fallback();
    case 'ramp':
      return sanitizeRamp(value) ?? fallback();
    case 'curve':
      return sanitizeCurve(value, def.yMin ?? 0, def.yMax ?? 1) ?? fallback();
    case 'seed':
      return Number.isInteger(value) ? value >>> 0 : fallback();
    default:
      return fallback();
  }
}

/**
 * Validate a whole parameter set against a schema.
 * Missing parameters get their default; unknown keys are dropped.
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {Record<string, any>} [params]
 * @returns {{ values: Record<string, any>, warnings: string[] }}
 */
export function sanitizeParams(schema, params = {}) {
  /** @type {Record<string, any>} */
  const values = {};
  const warnings = [];
  const known = new Set();
  for (const def of schema) {
    known.add(def.id);
    if (!(def.id in params)) {
      values[def.id] = structuredClone(def.default);
      continue;
    }
    const clean = sanitizeValue(def, params[def.id]);
    if (JSON.stringify(clean) !== JSON.stringify(params[def.id])) {
      warnings.push(
        `${def.id}: ${JSON.stringify(params[def.id])} → ${JSON.stringify(clean)} (fixed to a valid value)`,
      );
    }
    values[def.id] = clean;
  }
  for (const key of Object.keys(params)) {
    if (!known.has(key)) warnings.push(`${key}: unknown parameter (ignored)`);
  }
  return { values, warnings };
}
