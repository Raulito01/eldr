// @ts-check
/**
 * Every preset that BUILDS its own composition (D-069, D-070), grouped for the Preset menu:
 * Lightning, Magic, and the particle presets (basic, lightning, magic). The explosion presets
 * (deltas on the base stack) stay in explosion/presets.js.
 */

import { LIGHTNING_PARTICLE_PRESETS, LIGHTNING_PRESETS } from './lightning/presets.js';
import { MAGIC_PARTICLE_PRESETS, MAGIC_PRESETS } from './magic/presets.js';
import { PARTICLE_PRESETS } from './particles/presets.js';

/** Menu groups, in order. */
export const COMPOSED_PRESET_GROUPS = Object.freeze([
  { label: 'Lightning', presets: LIGHTNING_PRESETS },
  { label: 'Magic', presets: MAGIC_PRESETS },
  { label: 'Particles', presets: PARTICLE_PRESETS },
  { label: 'Particles · Lightning', presets: LIGHTNING_PARTICLE_PRESETS },
  { label: 'Particles · Magic', presets: MAGIC_PARTICLE_PRESETS },
]);

/** Every composed preset. */
export const COMPOSED_PRESETS = Object.freeze(COMPOSED_PRESET_GROUPS.flatMap((g) => g.presets));

/** @param {string} id */
export const composedPreset = (id) => COMPOSED_PRESETS.find((p) => p.id === id);
