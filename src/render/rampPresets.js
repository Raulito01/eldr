// @ts-check
/**
 * Ready-made ramps for the ramp editor's preset menu. Colours are placeholders until Raul sets
 * the real palette [Raul]. Fire = option A from step 2.1.
 */

import { DEFAULT_FIRE_RAMP } from './style.js';

/** @typedef {{ pos: number, color: string }} Stop */

/** @type {Readonly<Record<string, { label: string, stops: ReadonlyArray<Stop> }>>} */
export const RAMP_PRESETS = Object.freeze({
  fire: { label: 'Fire', stops: DEFAULT_FIRE_RAMP },
  smoke: {
    label: 'Smoke',
    stops: [
      { pos: 0, color: '#f2efe9' },
      { pos: 0.35, color: '#c4c2c8' },
      { pos: 0.7, color: '#8a8996' },
      { pos: 1, color: '#3c3a46' },
    ],
  },
  sparks: {
    label: 'Sparks',
    stops: [
      { pos: 0, color: '#ffffff' },
      { pos: 0.35, color: '#ffe066' },
      { pos: 0.7, color: '#ff8a2a' },
      { pos: 1, color: '#c7281e' },
    ],
  },
  debris: {
    label: 'Debris',
    stops: [
      { pos: 0, color: '#ffb35c' },
      { pos: 0.45, color: '#7a4a3a' },
      { pos: 1, color: '#2e2630' },
    ],
  },
});

/** Deep copy of a preset's stops (safe to put into params). @param {string} key */
export const rampPreset = (key) => RAMP_PRESETS[key].stops.map((s) => ({ ...s }));
