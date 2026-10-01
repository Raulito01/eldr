// @ts-check
/**
 * Pure ramp editing operations (used by the ramp editor widget). Every operation returns a NEW
 * sorted array plus the index of the stop the user is working on (it can move when sorting).
 */

import { toHex } from '../../core/color.js';
import { sampleRamp } from '../../render/ramp.js';

/** @typedef {{ pos: number, color: string }} Stop */
export const MIN_STOPS = 2;

const clamp01 = (/** @type {number} */ v) => (v < 0 ? 0 : v > 1 ? 1 : v);
/** Round positions to 0.1% so saved files stay tidy. @param {number} v */
const tidy = (v) => Math.round(clamp01(v) * 1000) / 1000;

/**
 * Sort stops by position and report where `moved` (an object from the array) ended up.
 * @param {Stop[]} stops @param {Stop} moved
 */
function sorted(stops, moved) {
  const out = [...stops].sort((a, b) => a.pos - b.pos);
  return { stops: out, index: out.indexOf(moved) };
}

/**
 * Move stop i to a new position.
 * @param {Stop[]} stops @param {number} i @param {number} pos 0–1
 */
export function moveStop(stops, i, pos) {
  const moved = { ...stops[i], pos: tidy(pos) };
  return sorted(
    stops.map((s, k) => (k === i ? moved : s)),
    moved,
  );
}

/**
 * Change the colour of stop i.
 * @param {Stop[]} stops @param {number} i @param {string} color
 */
export function setStopColor(stops, i, color) {
  return { stops: stops.map((s, k) => (k === i ? { ...s, color } : s)), index: i };
}

/**
 * Add a stop at `pos`, coloured with the ramp's current colour there (so nothing visibly changes
 * until the user edits it).
 * @param {Stop[]} stops @param {number} pos 0–1
 */
export function addStop(stops, pos) {
  const p = tidy(pos);
  const added = { pos: p, color: toHex(sampleRamp(stops, p)) };
  return sorted([...stops, added], added);
}

/**
 * Remove stop i (never below MIN_STOPS). The selection moves to a neighbour.
 * @param {Stop[]} stops @param {number} i
 */
export function removeStop(stops, i) {
  if (stops.length <= MIN_STOPS) return { stops, index: i };
  const out = stops.filter((_, k) => k !== i);
  return { stops: out, index: Math.min(i, out.length - 1) };
}
