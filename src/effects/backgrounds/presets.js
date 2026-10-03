// @ts-check
/**
 * Backgrounds (D-104): seamless loops built on the Fractal Noise layer — starting points to
 * restyle (every noise control is on the layer, named like After Effects' Fractal Noise).
 */

import { rampPreset } from '../../render/rampPresets.js';
import { compose, loop, ramp } from '../presetKit.js';

/** Pool water: deep blue → light cyan. */
const POOL = ramp([
  [0, '#e9fbff'],
  [0.3, '#8fe3ff'],
  [0.65, '#2f9be8'],
  [1, '#0d3f9a'],
]);
/** Light only (for caustic lines over the water). */
const LIGHT = ramp([
  [0, '#ffffff'],
  [1, '#bff3ff'],
]);

/** Caustic Pool: cel pool water with bright caustic lines dancing on top. */
function causticPool() {
  const c = compose({ timing: loop(48) });
  c.add('fractalNoise', 'Water', {
    params: {
      'fn.type': 'liquid',
      'fn.scale': 220,
      'fn.complexity': 3,
      'fn.contrast': 85,
      'fn.bands': 4,
      'fn.evoSpeed': 0.25,
      'fn.ramp': POOL,
    },
  });
  c.add('fractalNoise', 'Caustics', {
    blend: 'add',
    params: {
      'fn.type': 'cells',
      'fn.scale': 70,
      'fn.complexity': 1,
      'fn.contrast': 300,
      'fn.brightness': -72,
      'fn.bands': 2,
      'fn.evoSpeed': 0.5,
      'fn.alpha': 'luma',
      'fn.ramp': LIGHT,
    },
  });
  return c.done();
}

/** Water Surface: flowing liquid surface in flat cel bands (a river seen from above). */
function waterSurface() {
  const c = compose({ timing: loop(48) });
  c.add('fractalNoise', 'Surface', {
    params: {
      'fn.type': 'liquid',
      'fn.scale': 160,
      'fn.stretchW': 260,
      'fn.complexity': 4,
      'fn.contrast': 140,
      'fn.bands': 5,
      'fn.evoSpeed': 0.3,
      'fn.flowX': 120,
      'fn.warp': 1.4,
      'fn.ramp': rampPreset('water'),
    },
  });
  return c.done();
}

/** Energy Clouds: turbulent magic clouds, glowing bright folds (alpha from brightness). */
function energyClouds() {
  const c = compose({ timing: loop(48) });
  c.add('fractalNoise', 'Clouds', {
    blend: 'add',
    params: {
      'fn.type': 'turbulent',
      'fn.scale': 200,
      'fn.complexity': 6,
      'fn.contrast': 200,
      'fn.brightness': -35,
      'fn.bands': 4,
      'fn.bandSoft': 0.3,
      'fn.evoSpeed': 0.5,
      'fn.flowY': -30,
      'fn.alpha': 'luma',
      'fn.ramp': rampPreset('arcane'),
    },
  });
  return c.done();
}

/** Lava Flow: slow, dark cooled crust over bright flowing veins. */
function lavaFlow() {
  const c = compose({ timing: loop(48) });
  c.add('fractalNoise', 'Lava', {
    params: {
      'fn.type': 'ridges',
      'fn.scale': 180,
      'fn.complexity': 4,
      'fn.contrast': 230,
      'fn.brightness': -45,
      'fn.bands': 5,
      'fn.evoSpeed': 0.2,
      'fn.flowY': 30,
      'fn.ramp': rampPreset('fire'),
    },
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const BACKGROUND_PRESETS = Object.freeze([
  {
    id: 'causticPool',
    name: 'Caustic Pool',
    blurb: 'Cel pool water with caustic light lines dancing on it. Seamless loop.',
    build: causticPool,
  },
  {
    id: 'waterSurface',
    name: 'Water Surface',
    blurb: 'A flowing liquid surface in flat cel bands. Seamless loop.',
    build: waterSurface,
  },
  {
    id: 'energyClouds',
    name: 'Energy Clouds',
    blurb: 'Turbulent glowing magic clouds (light only: put them over anything). Seamless loop.',
    build: energyClouds,
  },
  {
    id: 'lavaFlow',
    name: 'Lava Flow',
    blurb: 'Bright lava veins under a dark crust, creeping slowly. Seamless loop.',
    build: lavaFlow,
  },
]);
