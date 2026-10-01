// @ts-check
/**
 * Colour ramps: ordered colour stops that a value ("ramp position", 0–1) maps onto
 * (brief §3.3). Smooth sampling here; hard cel bands are added in step 2.2.
 */

import { mixRgba, parseHex } from '../core/color.js';

/** @typedef {{ pos: number, color: string }} RampStop */

/** Parsed-stop cache: ramps are replaced on edit, never mutated, so identity is safe. */
const parsed = new WeakMap();

/** @param {ReadonlyArray<RampStop>} stops */
function parsedStops(stops) {
  let p = parsed.get(stops);
  if (!p) {
    p = stops.map((s) => ({ pos: s.pos, rgba: parseHex(s.color) }));
    parsed.set(stops, p);
  }
  return p;
}

/**
 * Colour of a ramp at position `pos` (clamped to the first/last stop).
 * @param {ReadonlyArray<RampStop>} stops sorted by pos (the schema validator guarantees this)
 * @param {number} pos 0–1
 * @returns {import('../core/color.js').RGBA}
 */
export function sampleRamp(stops, pos) {
  const p = parsedStops(stops);
  if (pos <= p[0].pos) return [...p[0].rgba];
  const last = p[p.length - 1];
  if (pos >= last.pos) return [...last.rgba];
  let i = 0;
  while (i < p.length - 2 && pos > p[i + 1].pos) i++;
  const a = p[i];
  const b = p[i + 1];
  const span = b.pos - a.pos;
  return mixRgba(a.rgba, b.rgba, span > 0 ? (pos - a.pos) / span : 1);
}

/**
 * Positions where a ramp segment of [from, to] needs a gradient stop: both ends plus every ramp
 * stop strictly inside. Used to build canvas gradients that match the ramp exactly.
 * @param {ReadonlyArray<RampStop>} stops @param {number} from @param {number} to
 * @returns {number[]} ramp positions, ascending
 */
export function rampBreakpoints(stops, from, to) {
  const inside = stops.map((s) => s.pos).filter((p) => p > from && p < to);
  return [from, ...inside, to];
}
