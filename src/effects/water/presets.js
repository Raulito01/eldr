// @ts-check
/**
 * Water presets (D-076), anime cel, after Raul's references (a bubbling goo cauldron, a blue
 * water bolt on a shelf): Water Splash, Geyser, Ripple Pond, Water Orb, Wave Slash, Bubbling Brew
 * (layer presets) and Rain, Rising Bubbles, Spray Fountain, Waterfall Mist (particle presets).
 * Whole, editable compositions built from the Liquid / Bubble / Ripple layers and the shared kit.
 *
 * Values are a FIRST PASS for Raul to direct [Raul].
 */

import { rampPreset } from '../../render/rampPresets.js';
import { WATER_CEL } from '../layerTypes.js';
import { compose, curve, glassOrb, loop, oneShot, ramp, SHRINK, SOFT_LIFE } from '../presetKit.js';

const FLAT = curve([
  [0, 1],
  [1, 1],
]);
/** Lime goo (the cauldron). */
/** Cel mist: white with a cool blue shade (D-100). */
const MIST = ramp([
  [0, '#ffffff'],
  [0.35, '#e6f3fb'],
  [0.65, '#a9c7dc'],
  [1, '#6b8ea8'],
]);
const GOO = ramp([
  [0, '#ffffff'],
  [0.2, '#f4ff9a'],
  [0.45, '#c6f03a'],
  [0.7, '#6fb81e'],
  [1, '#2f5a12'],
]);
/** Water-blue glass for the orb. */
const GLASS_WATER = ramp([
  [0, '#ffffff'],
  [0.2, '#c9f3ff'],
  [0.45, '#59c3ff'],
  [0.7, '#1f6fe0'],
  [1, '#0b2a6e'],
]);
/** Ink for water outlines. */
const INK = { 'outline.color': '#0b1f5c' };

/** Water Splash: a crowned column bursts from the surface, drops fly, ripples and foam spread. */
function waterSplash() {
  const c = compose({
    timing: oneShot(28),
    globals: { 'explosion.impact': 0.06, 'explosion.flashFrames': 0 },
  });
  const surface = c.add('null', 'Surface', { transform: { y: 140 } });
  const ids = [
    c.add('ripple', 'Ripples', {
      anchor: 'afterImpact',
      params: {
        'ripple.radius': 230,
        'ripple.count': 3,
        'ripple.flatten': 0.28,
        'style.ramp': WATER_CEL,
      },
    }),
    c.add('puffBurst', 'Foam', {
      anchor: 'afterImpact',
      params: {
        'burst.count': 10,
        'burst.direction': 0,
        'burst.cone': 170,
        'burst.speed': 260,
        'burst.drag': 4,
        'burst.life': 0.55,
        'puff.radius': 18,
        'style.ramp': rampPreset('foam'),
        'style.bands': 2,
      },
    }),
    c.add('liquid', 'Splash column', {
      anchor: 'afterImpact',
      params: {
        ...INK,
        'liquid.radius': 50,
        'liquid.aspect': 1.6,
        'liquid.base': 'bottom',
        'liquid.crown': 1,
        'liquid.crownSpikes': 9,
        'liquid.boil': 6,
        'single.end': 0.7,
        'single.scaleOverLife': curve([
          [0, 0.15],
          [0.18, 1.1],
          [0.45, 0.95],
          [1, 0],
        ]),
        'single.opacityOverLife': FLAT,
      },
    }),
    c.add('liquidBurst', 'Drops', {
      anchor: 'afterImpact',
      params: {
        ...INK,
        'burst.count': 22,
        'burst.direction': 0,
        'burst.cone': 120,
        'burst.speed': 640,
        'burst.gravity': 1600,
        'burst.life': 0.8,
        'liquid.radius': 10,
      },
    }),
  ];
  for (const id of ids) c.parent(id, surface, { local: true });
  return c.done();
}

/** Geyser: a tall water column erupts, drops rain back down, mist rolls. */
function geyser() {
  const c = compose({ timing: oneShot(40) });
  const ground = c.add('null', 'Ground', { transform: { y: 200 } });
  const ids = [
    c.add('ripple', 'Base ripples', {
      params: { 'ripple.radius': 200, 'ripple.flatten': 0.25, 'style.ramp': WATER_CEL },
    }),
    // cel mist (D-100): puffs pushed out by the eruption, rising, eaten by holes
    c.add('celSmokeEmitter', 'Mist', {
      params: {
        'emit.shape': 'line',
        'emit.width': 160,
        'emit.rate': 8,
        'emit.stop': 1.1,
        'emit.cone': 60,
        'emit.speed': 200,
        'emit.gravity': -60,
        'emit.drag': 2,
        'emit.wind': 15,
        'emit.life': 1.3,
        'emit.scaleOverLife': curve([
          [0, 0.5],
          [0.35, 1],
          [1, 1.4],
        ]),
        'cs.size': 24,
        'cs.lumps': 5,
        'cs.shade': 0.3,
        'cs.droplets': 2,
        'cs.holeCount': 7,
        'cs.holeStart': 0.25,
        'cs.bodyTone': 0.3,
        'cs.shadeTone': 0.7,
        'style.ramp': MIST,
      },
    }),
    c.add('liquid', 'Column', {
      params: {
        ...INK,
        'liquid.radius': 46,
        'liquid.aspect': 3.5,
        'liquid.base': 'bottom',
        'liquid.crown': 1.2,
        'liquid.crownSpikes': 7,
        'liquid.boil': 8,
        'single.end': 0.75,
        'single.scaleOverLife': curve([
          [0, 0],
          [0.15, 1],
          [0.6, 0.9],
          [1, 0],
        ]),
        'single.opacityOverLife': FLAT,
      },
    }),
    c.add('liquidEmitter', 'Falling drops', {
      transform: { y: -280 },
      params: {
        ...INK,
        'emit.start': 0.2,
        'emit.stop': 1.1,
        'emit.rate': 40,
        'emit.cone': 140,
        'emit.speed': 260,
        'emit.gravity': 1300,
        'emit.life': 0.9,
        'liquid.radius': 8,
      },
    }),
  ];
  for (const id of ids) c.parent(id, ground, { local: true });
  return c.done();
}

/** Ripple Pond: rings spreading on calm water with glints. Seamless loop (backgrounds). */
function ripplePond() {
  const c = compose({ timing: loop(48) });
  c.add('ripple', 'Ripples', {
    params: {
      'ripple.mode': 'repeat',
      'ripple.radius': 230,
      'ripple.count': 4,
      'ripple.cycles': 2,
      'ripple.flatten': 0.3,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('ripple', 'Small ripples', {
    transform: { x: 120, y: 60 },
    params: {
      'ripple.mode': 'repeat',
      'ripple.radius': 110,
      'ripple.count': 3,
      'ripple.cycles': 3,
      'ripple.flatten': 0.3,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('sparkleEmitter', 'Glints', {
    blend: 'add',
    params: {
      'emit.shape': 'box',
      'emit.width': 420,
      'emit.height': 120,
      'emit.rate': 8,
      'emit.speed': 0,
      'emit.life': 0.6,
      'emit.size': 0.5,
      'emit.scaleOverLife': curve([
        [0, 0],
        [0.5, 1],
        [1, 0],
      ]),
      'style.ramp': WATER_CEL,
      'glow.amount': 0.6,
    },
  });
  return c.done();
}

/** Water Orb: a swirling water vortex with bubbles inside a glass ball. Loops. */
function waterOrb() {
  const c = compose({ timing: loop(48) });
  const R = 130;
  glassOrb(c, R, GLASS_WATER, (add) => [
    add('fieldFire', 'Vortex', {
      params: {
        'field.form': 'ball',
        'field.width': 220,
        'field.height': 220,
        'field.speed': 1,
        'field.swirl': 1,
        'field.curl': 4,
        'field.curlHeight': 0,
        'style.ramp': WATER_CEL,
        'style.bands': 4,
        'single.opacityOverLife': curve([
          [0, 0.85],
          [1, 0.85],
        ]),
      },
    }),
    add('bubbleEmitter', 'Bubbles', {
      params: {
        'emit.shape': 'box',
        'emit.width': 180,
        'emit.height': 60,
        'emit.rate': 10,
        'emit.speed': 20,
        'emit.gravity': -90,
        'emit.life': 1.6,
        'emit.opacityOverLife': SOFT_LIFE,
        'style.ramp': WATER_CEL,
      },
    }),
  ]);
  return c.done();
}

/** Wave Slash: a water crescent slices across, shedding drops and foam. One-shot. */
function waveSlash() {
  const c = compose({ timing: oneShot(22) });
  c.add('crescent', 'Wave', {
    params: {
      ...INK,
      'outline.mode': 'outer',
      'outline.px': 2,
      'outline.colorMode': 'custom',
      'crescent.radius': 170,
      'crescent.sweep': 150,
      'crescent.thickness': 40,
      'crescent.hotEdge': 0.6,
      'crescent.reveal': curve([
        [0, 0.1],
        [0.3, 1],
        [1, 1],
      ]),
      'single.rotation': -30,
      'single.scaleOverLife': curve([
        [0, 0.8],
        [0.3, 1],
        [1, 1.1],
      ]),
      'single.opacityOverLife': curve([
        [0, 1],
        [0.6, 1],
        [1, 0],
      ]),
      'style.ramp': WATER_CEL,
      'style.bands': 3,
    },
  });
  c.add('liquidBurst', 'Shed drops', {
    params: {
      ...INK,
      'burst.count': 20,
      'burst.spawnRadius': 150,
      'burst.direction': 60,
      'burst.cone': 120,
      'burst.speed': 420,
      'burst.gravity': 1200,
      'burst.window': 0.3,
      'burst.life': 0.7,
      'liquid.radius': 8,
    },
  });
  c.add('sparkleBurst', 'Foam glints', {
    blend: 'add',
    params: {
      'burst.count': 10,
      'burst.spawnRadius': 160,
      'burst.speed': 60,
      'burst.life': 0.5,
      'sparkle.size': 14,
      'style.ramp': WATER_CEL,
    },
  });
  return c.done();
}

/** Bubbling Brew: a goo surface boils, blobs pop up and splash back (Raul's cauldron). Loops. */
function bubblingBrew() {
  const c = compose({ timing: loop(48) });
  const surface = c.add('null', 'Surface', { transform: { y: 120 } });
  const goo = { 'style.ramp': GOO, 'outline.color': '#1d3a08' };
  const ids = [
    c.add('liquidEmitter', 'Splashes', {
      params: {
        ...goo,
        'emit.shape': 'line',
        'emit.width': 280,
        'emit.rate': 14,
        'emit.cone': 50,
        'emit.speed': 220,
        'emit.gravity': 1100,
        'emit.life': 0.45,
        'liquid.radius': 5,
      },
    }),
    c.add('liquid', 'Goo surface', {
      params: {
        ...goo,
        'liquid.radius': 170,
        'liquid.aspect': 0.3,
        'liquid.boil': 6,
        'liquid.noise': 0.1,
        'liquid.pockets': 4,
        'single.opacityOverLife': FLAT,
        'single.scaleOverLife': FLAT,
      },
    }),
    c.add('bubbleEmitter', 'Popping bubbles', {
      transform: { y: -10 },
      params: {
        ...goo,
        'emit.shape': 'line',
        'emit.width': 260,
        'emit.rate': 6,
        'emit.speed': 10,
        'emit.gravity': -30,
        'emit.life': 0.7,
        'emit.scaleOverLife': curve([
          [0, 0.2],
          [0.8, 1.1],
          [1, 1.3],
        ]),
        'emit.opacityOverLife': curve([
          [0, 1],
          [0.85, 1],
          [1, 0],
        ]),
        'bubble.fill': 0.9,
      },
    }),
    c.add('liquidEmitter', 'Leaping blobs', {
      params: {
        ...goo,
        'emit.shape': 'line',
        'emit.width': 200,
        'emit.rate': 3,
        'emit.cone': 20,
        'emit.speed': 480,
        'emit.speedVariance': 0.3,
        'emit.gravity': 1000,
        'emit.alignToVelocity': false,
        'emit.life': 0.85,
        'emit.lifeVariance': 0,
        'liquid.radius': 26,
        'liquid.stretch': 0.3,
        'emit.scaleOverLife': FLAT,
        'emit.opacityOverLife': FLAT,
      },
    }),
  ];
  for (const id of ids) c.parent(id, surface, { local: true });
  // Goo (D-078): blobs and splashes melt into the surface and each other, like thick brew
  c.add('goo', 'Goo (melt together)', { params: { 'goo.amount': 8, 'goo.threshold': 0.35 } });
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/** Rain: angled streaking drops and tiny splashes on the ground. Loops. */
function rain() {
  const c = compose({ timing: loop(24) });
  c.add('liquidEmitter', 'Rain', {
    transform: { y: -300, rotation: 15 },
    params: {
      'emit.shape': 'line',
      'emit.width': 760,
      'emit.rate': 70,
      'emit.direction': 180,
      'emit.cone': 2,
      'emit.speed': 1100,
      'emit.speedVariance': 0.15,
      'emit.gravity': 0,
      'emit.drag': 0,
      'emit.life': 0.55,
      'emit.lifeVariance': 0.1,
      'emit.scaleOverLife': FLAT,
      'emit.opacityOverLife': FLAT,
      'liquid.radius': 4,
      'liquid.stretch': 2,
      'liquid.pockets': 0,
      'outline.mode': 'off',
      'style.ramp': WATER_CEL,
    },
  });
  c.add('liquidEmitter', 'Splashes', {
    transform: { y: 220 },
    params: {
      'emit.shape': 'line',
      'emit.width': 600,
      'emit.rate': 40,
      'emit.cone': 80,
      'emit.speed': 160,
      'emit.gravity': 900,
      'emit.life': 0.25,
      'liquid.radius': 4,
      'liquid.pockets': 0,
      'outline.mode': 'off',
      'style.ramp': WATER_CEL,
    },
  });
  return c.done();
}

/** Rising Bubbles: wobbling bubbles drifting up. Loops. */
function risingBubbles() {
  const c = compose({ timing: loop(48) });
  c.add('bubbleEmitter', 'Bubbles', {
    transform: { y: 220 },
    params: {
      'emit.shape': 'line',
      'emit.width': 360,
      'emit.rate': 9,
      'emit.speed': 30,
      'emit.gravity': -110,
      'emit.turbulence': 30,
      'emit.life': 3,
      'emit.sizeVariance': 0.6,
      'emit.size': 1.5,
      'emit.opacityOverLife': SOFT_LIFE,
      'emit.scaleOverLife': curve([
        [0, 0.5],
        [1, 1.2],
      ]),
      'style.ramp': WATER_CEL,
    },
  });
  c.add('bubbleEmitter', 'Small bubbles', {
    transform: { y: 220 },
    params: {
      'emit.shape': 'line',
      'emit.width': 300,
      'emit.rate': 16,
      'emit.speed': 50,
      'emit.gravity': -160,
      'emit.turbulence': 40,
      'emit.life': 2.2,
      'emit.size': 0.6,
      'emit.opacityOverLife': SOFT_LIFE,
      'style.ramp': WATER_CEL,
    },
  });
  return c.done();
}

/** Spray Fountain: drops shooting up and arcing back down. Loops. */
function sprayFountain() {
  const c = compose({ timing: loop(24) });
  c.add('liquidEmitter', 'Spray', {
    transform: { y: 200 },
    params: {
      ...INK,
      'emit.rate': 60,
      'emit.cone': 22,
      'emit.speed': 950,
      'emit.speedVariance': 0.3,
      'emit.gravity': 1300,
      'emit.drag': 0.2,
      'emit.life': 1,
      'emit.scaleOverLife': SHRINK,
      'liquid.radius': 9,
      'style.ramp': WATER_CEL,
    },
  });
  // cel foam (D-100): small white puffs that stay low and are eaten quickly
  c.add('celSmokeEmitter', 'Foam', {
    transform: { y: 200 },
    params: {
      'emit.rate': 8,
      'emit.cone': 90,
      'emit.speed': 90,
      'emit.drag': 3,
      'emit.gravity': -15,
      'emit.life': 0.8,
      'emit.scaleOverLife': curve([
        [0, 0.6],
        [0.3, 1],
        [1, 1.2],
      ]),
      'cs.size': 16,
      'cs.lumps': 4,
      'cs.shade': 0.25,
      'cs.droplets': 2,
      'cs.holeCount': 5,
      'cs.holeStart': 0.15,
      'style.ramp': rampPreset('foam'),
    },
  });
  return c.done();
}

/** Waterfall Mist: a sheet of water pouring down into rolling mist. Loops. */
function waterfallMist() {
  const c = compose({ timing: loop(48) });
  c.add('liquidEmitter', 'Pour', {
    transform: { y: -250 },
    params: {
      'emit.shape': 'line',
      'emit.width': 220,
      'emit.rate': 60,
      'emit.direction': 180,
      'emit.cone': 4,
      'emit.speed': 150,
      'emit.gravity': 900,
      'emit.life': 0.9,
      'emit.scaleOverLife': FLAT,
      'liquid.radius': 6,
      'liquid.stretch': 1.5,
      'liquid.pockets': 0,
      'outline.mode': 'off',
      'style.ramp': WATER_CEL,
    },
  });
  // cel mist (D-100): low banks rolling out from the impact, drifting up, eaten by holes
  c.add('celSmokeEmitter', 'Mist', {
    transform: { y: 190 },
    params: {
      'emit.shape': 'line',
      'emit.width': 200,
      'emit.rate': 5,
      'emit.cone': 120,
      'emit.speed': 130,
      'emit.gravity': -35,
      'emit.drag': 1.6,
      'emit.wind': 20,
      'emit.windSpeed': 0.5,
      'emit.life': 1.9,
      'emit.prewarm': true,
      'emit.scaleOverLife': curve([
        [0, 0.6],
        [0.35, 1.05],
        [1, 1.5],
      ]),
      'cs.form': 'bank',
      'cs.size': 22,
      'cs.lumps': 5,
      'cs.length': 90,
      'cs.shade': 0.3,
      'cs.droplets': 2,
      'cs.holeCount': 8,
      'cs.holeStart': 0.3,
      'cs.bodyTone': 0.3,
      'cs.shadeTone': 0.7,
      'style.ramp': MIST,
    },
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const WATER_PRESETS = Object.freeze([
  {
    id: 'waterSplash',
    name: 'Water Splash',
    blurb: 'A crowned column bursts from the surface; drops, ripples and foam. One-shot.',
    build: waterSplash,
  },
  {
    id: 'geyser',
    name: 'Geyser',
    blurb: 'A tall water column erupts, drops rain back, mist rolls. One-shot.',
    build: geyser,
  },
  {
    id: 'ripplePond',
    name: 'Ripple Pond',
    blurb: 'Rings spreading on calm water with glints. Seamless loop.',
    build: ripplePond,
  },
  {
    id: 'waterOrb',
    name: 'Water Orb',
    blurb: 'A swirling water vortex with bubbles inside a glass ball. Seamless loop.',
    build: waterOrb,
  },
  {
    id: 'waveSlash',
    name: 'Wave Slash',
    blurb: 'A water crescent slices across, shedding drops and foam. One-shot.',
    build: waveSlash,
  },
  {
    id: 'bubblingBrew',
    name: 'Bubbling Brew',
    blurb: 'Goo boils, bubbles pop and blobs leap and splash back. Seamless loop.',
    build: bubblingBrew,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const WATER_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'rain',
    name: 'Rain',
    blurb: 'Angled streaking drops and tiny splashes on the ground. Seamless loop.',
    build: rain,
  },
  {
    id: 'risingBubbles',
    name: 'Rising Bubbles',
    blurb: 'Wobbling bubbles drifting up. Seamless loop.',
    build: risingBubbles,
  },
  {
    id: 'sprayFountain',
    name: 'Spray Fountain',
    blurb: 'Drops shooting up and arcing back down, with foam. Seamless loop.',
    build: sprayFountain,
  },
  {
    id: 'waterfallMist',
    name: 'Waterfall Mist',
    blurb: 'A sheet of water pouring down into rolling mist. Seamless loop.',
    build: waterfallMist,
  },
]);
