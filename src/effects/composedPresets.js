// @ts-check
/**
 * Every preset that BUILDS its own composition (D-069, D-070), grouped for the Preset menu:
 * Lightning, Magic, and the particle presets (basic, lightning, magic). The explosion presets
 * (deltas on the base stack) stay in explosion/presets.js.
 */

import { BACKGROUND_PRESETS } from './backgrounds/presets.js';
import { CEL_FIRE_PARTICLE_PRESETS, CEL_FIRE_PRESETS } from './celfire/presets.js';
import { DARK_MAGIC_PARTICLE_PRESETS, DARK_MAGIC_PRESETS } from './darkmagic/presets.js';
import { FIRE_PARTICLE_PRESETS, FIRE_PRESETS } from './fire/presets.js';
import { LIGHTNING_PARTICLE_PRESETS, LIGHTNING_PRESETS } from './lightning/presets.js';
import { MAGIC_PARTICLE_PRESETS, MAGIC_PRESETS } from './magic/presets.js';
import { PARTICLE_PRESETS } from './particles/presets.js';
import { SMOKE_PARTICLE_PRESETS, SMOKE_PRESETS } from './smoke/presets.js';
import { WATER_PARTICLE_PRESETS, WATER_PRESETS } from './water/presets.js';

/** Menu groups, in order. */
export const COMPOSED_PRESET_GROUPS = Object.freeze([
  { label: 'Fire', presets: FIRE_PRESETS },
  { label: 'Cel Fire', presets: CEL_FIRE_PRESETS },
  { label: 'Smoke', presets: SMOKE_PRESETS },
  { label: 'Lightning', presets: LIGHTNING_PRESETS },
  { label: 'Magic', presets: MAGIC_PRESETS },
  { label: 'Vortex & Dark Magic', presets: DARK_MAGIC_PRESETS },
  { label: 'Water', presets: WATER_PRESETS },
  { label: 'Backgrounds', presets: BACKGROUND_PRESETS },
  { label: 'Particles', presets: PARTICLE_PRESETS },
  { label: 'Particles · Fire', presets: FIRE_PARTICLE_PRESETS },
  { label: 'Particles · Cel Fire', presets: CEL_FIRE_PARTICLE_PRESETS },
  { label: 'Particles · Smoke', presets: SMOKE_PARTICLE_PRESETS },
  { label: 'Particles · Lightning', presets: LIGHTNING_PARTICLE_PRESETS },
  { label: 'Particles · Magic', presets: MAGIC_PARTICLE_PRESETS },
  { label: 'Particles · Dark Magic', presets: DARK_MAGIC_PARTICLE_PRESETS },
  { label: 'Particles · Water', presets: WATER_PARTICLE_PRESETS },
]);

/** Every composed preset. */
export const COMPOSED_PRESETS = Object.freeze(COMPOSED_PRESET_GROUPS.flatMap((g) => g.presets));

/** @param {string} id */
export const composedPreset = (id) => COMPOSED_PRESETS.find((p) => p.id === id);
