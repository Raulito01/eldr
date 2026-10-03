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
import { compose, curve, glassOrb, loop, oneShot, ramp, SOFT_LIFE } from '../presetKit.js';

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
/** Goo pool: lime bands, no white (D-110). */
const GOO_POOL = ramp([
  [0, '#eaff8a'],
  [0.35, '#c6f03a'],
  [0.7, '#8fd12a'],
  [1, '#5a9a18'],
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

// ── Fluid kit (D-101): water that has weight, keeps its volume and pinches into drops ─────────
/** Ripple rings that slow as they spread and break into dashes. @param {ReturnType<typeof compose>} c @param {string} label @param {Record<string, any>} o */
const rings = (c, label, o) => {
  const { x = 0, y = 0, ...params } = o;
  return c.add('ripple', label, {
    transform: { x, y },
    params: {
      'ripple.flatten': 0.28,
      'ripple.ease': 0.85,
      'ripple.dashes': 0.85,
      'ripple.dashCount': 16,
      'ripple.thickness': 0.07,
      'style.ramp': WATER_CEL,
      // rings stay light; they break into dashes instead of darkening away
      'style.rampOverLife': curve([
        [0, 0],
        [1, 0.15],
      ]),
      'single.opacityOverLife': FLAT,
      ...params,
    },
  });
};
/** A burst of water drops (stretched by speed, round at the top of their arc). @param {ReturnType<typeof compose>} c @param {string} label @param {Record<string, any>} o */
const dropBurst = (c, label, o) => {
  const { x = 0, y = 0, ...params } = o;
  return c.add('dropBurst', label, { transform: { x, y }, params });
};
/**
 * A liquid jet (D-105): a Liquid stream — melted blobs of water that rise, stretch, pinch into
 * drops and fall away. `jet.*` keys are read as the matching `stream.*` (height, radius, push,
 * apex, lean); other `stream.*` keys pass straight through.
 * @param {ReturnType<typeof compose>} c @param {string} label @param {Record<string, any>} o
 */
const jet = (c, label, o) => {
  const { x = 0, y = 0, ...rest } = o;
  const keep = new Set(['height', 'radius', 'push', 'apex', 'lean']);
  /** @type {Record<string, any>} */
  const params = {};
  for (const [k, v] of Object.entries(rest)) {
    if (k.startsWith('jet.')) {
      const n = k.slice(4);
      if (keep.has(n)) params[`stream.${n}`] = v;
    } else params[k] = v;
  }
  return c.add('liquidStream', label, { transform: { x, y }, params });
};

/**
 * Water Splash (D-101b, after the Z_B reference and the milk-crown splash): the crown — a cup of
 * water with a bright lip — shoots up around the impact, its petals rising one after another,
 * round drops forming at their tips and flying off; it hangs, then collapses faster and faster
 * while the impact ring rushes out; a rebound jet rises from the crater, lumpy, tears into drops
 * of mixed sizes and falls back; hand-drawn rings slow down and break into tapered pieces.
 * One-shot.
 */
function waterSplash() {
  const c = compose({ timing: oneShot(44) });
  const g = 150; // water surface
  rings(c, 'Impact ring', {
    y: g,
    'single.start': 0.12,
    'single.end': 0.8,
    'ripple.radius': 200,
    'ripple.count': 1,
    'ripple.thickness': 0.2,
    'ripple.start': 0.3,
    'ripple.ease': 0.95,
  });
  rings(c, 'Ripples', { y: g, 'single.start': 0.2, 'ripple.radius': 270, 'ripple.count': 3 });
  rings(c, 'Second ripples', {
    y: g,
    'single.start': 0.7,
    'ripple.radius': 120,
    'ripple.count': 2,
  });
  c.add('crown', 'Crown', {
    transform: { y: g },
    params: {
      'single.end': 0.55,
      'crown.radius': 62,
      'crown.height': 150,
      'crown.flare': 0.6,
      'crown.petals': 13,
      'crown.spike': 0.2,
      'crown.rise': 0.3,
      'crown.hang': 0.15,
      'crown.fall': 0.5,
      'style.ramp': WATER_CEL,
    },
  });
  jet(c, 'Rebound jet', {
    y: g,
    'single.start': 0.42,
    'stream.height': 190,
    'stream.radius': 12,
    'stream.push': 0.3,
    'stream.apex': 0.34,
    'stream.taper': 0.9,
    'stream.breakup': 0.7,
    'stream.lumps': 6,
    'stream.spread': 0.4,
  });
  dropBurst(c, 'Crown spray', {
    y: g,
    'burst.start': 0.04,
    'burst.window': 0.08,
    'burst.count': 22,
    'burst.direction': 0,
    'burst.cone': 90,
    'burst.speed': 1500,
    'burst.speedVariance': 0.5,
    'burst.drag': 0.6,
    'burst.gravity': 6500,
    'burst.life': 0.5,
    'burst.lifeVariance': 0.3,
    'burst.spawnRadius': 60,
    'burst.sizeVariance': 0.6,
    'drop.size': 6,
  });
  return c.done();
}

/**
 * Geyser (D-101b, the waterfall references turned upside down): a streaked column of water
 * shoots up with soft wavy sides and a round lumpy top that keeps spraying drops which rain back
 * down; the foot boils — petals re-forming every couple of frames — with mist; lumpy side jets
 * arc outward and tear into drops; at the end the source stops: the column lets go of the base
 * and travels on up, and its last water rains down (D-103: never pulled back into the ground);
 * hand-drawn rings spread. One-shot.
 */
function geyser() {
  const c = compose({ timing: oneShot(56) });
  const g = 210;
  const H = 380;
  rings(c, 'Base ripples', { y: g, 'ripple.radius': 260, 'ripple.count': 4 });
  // cel mist (D-100): puffs pushed out by the eruption, rising, eaten by holes
  c.add('celSmokeEmitter', 'Mist', {
    transform: { y: g },
    params: {
      'emit.shape': 'line',
      'emit.width': 160,
      'emit.rate': 8,
      'emit.stop': 1.6,
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
  });
  for (const [x, lean, h, r, st] of /** @type {const} */ ([
    [-30, -0.45, 200, 14, 0.04],
    [30, 0.4, 230, 15, 0.09],
  ])) {
    jet(c, x < 0 ? 'Side jet left' : 'Side jet right', {
      x,
      y: g,
      'single.start': st,
      'single.end': st + 0.75,
      'stream.height': h,
      'stream.radius': r * 0.75,
      'stream.lean': lean,
      'stream.push': 0.32,
      'stream.apex': 0.34,
      'stream.taper': 0.8,
      'stream.breakup': 0.7,
      'stream.lumps': 6,
      'stream.spread': 0.3,
    });
  }
  const footBack = c.add('crown', 'Boiling foot (back)', {
    transform: { y: g },
    params: {
      'crown.mode': 'boil',
      'crown.part': 'back',
      'single.end': 0.95,
      'crown.radius': 74,
      'crown.height': 80,
      'crown.petals': 14,
      'crown.spike': 0.35,
      // settles back into the pool once the source stops
      'crown.strength': curve([
        [0, 1],
        [0.6, 1],
        [0.9, 0],
        [1, 0],
      ]),
      'crown.frontTone': 0.12,
      'crown.flatten': 0.34,
      'crown.boilRate': 10,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('waterColumn', 'Column', {
    transform: { y: g },
    params: {
      'col.flow': 'up',
      'col.length': H,
      'col.width': 34,
      'col.taper': 0.25,
      'col.speed': 3,
      'col.streaks': 7,
      'col.spikes': 0.7,
      'col.ragged': 0.45,
      // D-104: an animated water surface running up the column
      'surf.on': true,
      'surf.map': 'flow',
      'surf.flowAngle': -90,
      'surf.flowSpeed': 700,
      'surf.flowStretch': 4,
      'surf.scale': 30,
      'surf.mix': 80,
      'col.reach': curve([
        [0, 0],
        [0.1, 1],
        [1, 1],
      ]),
      // D-103: the source stops and the column leaves the base, travelling on upward; it never
      // drops back into the water
      'col.release': curve([
        [0, 0],
        [0.56, 0],
        [0.64, 0.25],
        [0.76, 1],
        [1, 1],
      ]),
      'style.ramp': WATER_CEL,
    },
  });
  c.add('dropEmitter', 'Top spray', {
    transform: { y: g - H },
    params: {
      'emit.start': 0.4,
      'emit.stop': 1.8,
      'emit.rate': 45,
      'emit.cone': 130,
      'emit.speed': 420,
      'emit.speedVariance': 0.5,
      'emit.gravity': 2600,
      'emit.life': 0.9,
      'emit.size': 1,
      'emit.sizeVariance': 0.6,
      'drop.size': 8,
      'style.ramp': WATER_CEL,
    },
  });
  // the last of the column breaks up at the top and rains down, outward
  dropBurst(c, 'Top rain', {
    y: g - H,
    'burst.start': 0.66,
    'burst.window': 0.12,
    'burst.count': 26,
    'burst.direction': 0,
    'burst.cone': 150,
    'burst.speed': 520,
    'burst.speedVariance': 0.6,
    'burst.drag': 0.3,
    'burst.gravity': 2600,
    'burst.life': 0.34,
    'burst.lifeVariance': 0.3,
    'burst.spawnRadius': 30,
    'burst.sizeVariance': 0.6,
    'drop.size': 9,
    'style.ramp': WATER_CEL,
  });
  const footFront = c.add('crown', 'Boiling foot (front)', {
    transform: { y: g },
    params: {
      'crown.mode': 'boil',
      'crown.part': 'front',
      'single.end': 0.95,
      'crown.radius': 74,
      'crown.height': 80,
      'crown.petals': 14,
      'crown.spike': 0.35,
      // settles back into the pool once the source stops
      'crown.strength': curve([
        [0, 1],
        [0.6, 1],
        [0.9, 0],
        [1, 0],
      ]),
      'crown.frontTone': 0.12,
      'crown.flatten': 0.34,
      'crown.boilRate': 10,
      'style.ramp': WATER_CEL,
    },
  });
  // both halves of the foot share one shape (same randomness)
  c.set(footFront, { seedKey: footBack });
  return c.done();
}

/**
 * Ripple Pond (D-109): calm cel pool water (fractal noise in a pond shape, gently morphing)
 * with a caustic web, organic rings spreading from a few spots (slowing, breaking into
 * round-ended pieces) and glints. Seamless loop.
 */
function ripplePond() {
  const c = compose({ timing: loop(48) });
  c.add('fractalNoise', 'Pond', {
    transform: { scaleY: 38 },
    params: {
      'fn.wrap': 'sphere',
      'fn.width': 460,
      'fn.tilt': 0,
      'fn.type': 'liquid',
      'fn.scale': 180,
      'fn.complexity': 2,
      'fn.contrast': 65,
      'fn.bands': 4,
      'fn.evoSpeed': 1.5,
      'fn.ramp': ramp([
        [0, '#cdf6ff'],
        [0.35, '#7fd3ff'],
        [0.7, '#3a93e6'],
        [1, '#1d4fa8'],
      ]),
    },
  });
  c.add('fractalNoise', 'Caustics', {
    blend: 'add',
    transform: { scaleY: 38 },
    params: {
      'fn.wrap': 'sphere',
      'fn.width': 460,
      'fn.tilt': 0,
      'fn.type': 'cells',
      'fn.scale': 60,
      'fn.complexity': 1,
      'fn.contrast': 300,
      'fn.brightness': -70,
      'fn.quality': 'best', // thin lines: every pixel
      'fn.bands': 2,
      'fn.evoSpeed': 1.5,
      'fn.alpha': 'luma',
      'fn.ramp': ramp([
        [0, '#ffffff'],
        [1, '#d8fbff'],
      ]),
    },
  });
  for (const [label, x, y, R, n, cyc] of /** @type {const} */ ([
    ['Ripples', -40, 0, 210, 3, 2],
    ['Small ripples', 110, 25, 100, 3, 3],
    ['Far ripples', -130, -30, 80, 2, 2],
  ])) {
    rings(c, label, {
      x,
      y,
      'ripple.mode': 'repeat',
      'ripple.radius': R,
      'ripple.count': n,
      'ripple.cycles': cyc,
      'ripple.flatten': 0.38,
      'ripple.thickness': 0.07,
      'ripple.dashes': 0.6,
      'ripple.dashCount': 9,
      'style.ramp': ramp([
        [0, '#ffffff'],
        [1, '#bdeeff'],
      ]),
    });
  }
  c.add('sparkleEmitter', 'Glints', {
    blend: 'add',
    params: {
      'emit.shape': 'box',
      'emit.width': 400,
      'emit.height': 120,
      'emit.rate': 8,
      'emit.speed': 0,
      'emit.life': 0.6,
      'emit.size': 0.5,
      'emit.prewarm': true,
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
  const lvl = { 'fn.wrap': 'sphere', 'fn.width': R * 2, 'fn.level': 62, 'fn.slosh': 0.5 };
  glassOrb(c, R, GLASS_WATER, (add) => [
    // D-109: water filling the ball to a sloshing line, churning (sphere-wrapped fractal),
    // with a caustic web, bubbles rising and popping at the surface
    add('fractalNoise', 'Water', {
      params: {
        ...lvl,
        'fn.type': 'liquid',
        'fn.scale': 95,
        'fn.complexity': 2.5,
        'fn.contrast': 80,
        'fn.bands': 3,
        'fn.twirl': 60,
        'fn.spin': 0.5,
        'fn.evoSpeed': 2.75,
        'fn.ramp': WATER_CEL,
      },
    }),
    add('fractalNoise', 'Caustics', {
      blend: 'add',
      params: {
        ...lvl,
        'fn.type': 'cells',
        'fn.scale': 36,
        'fn.complexity': 1,
        'fn.contrast': 300,
        'fn.brightness': -80,
        'fn.bands': 2,
        'fn.spin': 0.5,
        'fn.evoSpeed': 2.75,
        'fn.alpha': 'luma',
        'fn.ramp': ramp([
          [0, '#ffffff'],
          [1, '#bff3ff'],
        ]),
      },
    }),
    add('bubbleEmitter', 'Bubbles', {
      transform: { y: 70 },
      params: {
        'emit.shape': 'box',
        'emit.width': 150,
        'emit.height': 30,
        'emit.rate': 7,
        'emit.speed': 10,
        'emit.gravity': -150,
        'emit.turbulence': 20,
        'emit.life': 1.1,
        'emit.lifeVariance': 0.1,
        'emit.prewarm': true,
        'emit.opacityOverLife': FLAT,
        'bubble.radius': 7,
        'bubble.pop': 0.15,
        'bubble.jiggle': 0.5,
        'style.ramp': WATER_CEL,
      },
    }),
  ]);
  return c.done();
}

/**
 * Wave Slash (D-108): a thick sheet of water sweeps through on an arc — fast, easing out — its
 * thin tail following; foam streaks run along it; the tail flings drops outward; at the end the
 * gathered water bursts into drops that fly on. A thinner second wave trails it. One-shot.
 */
function waveSlash() {
  const c = compose({ timing: oneShot(30) });
  const foam = {
    'surf.on': true,
    'surf.map': 'flat',
    'surf.type': 'ridges',
    'surf.scale': 40,
    'surf.stretchW': 300,
    'surf.complexity': 2,
    'surf.contrast': 220,
    'surf.brightness': -60,
    'surf.bands': 2,
    'surf.evoSpeed': 3,
    'surf.alpha': 'luma',
    'surf.mix': 90,
  };
  c.add('liquidRibbon', 'Trailing wave', {
    transform: { x: -20, y: 30, rotation: -24 },
    params: {
      'single.start': 0.08,
      'ribbon.path': 'slash',
      'ribbon.size': 300,
      'ribbon.width': 12,
      'ribbon.tail': 0.05,
      'ribbon.reach': 0.7,
      'ribbon.travel': 0.4,
      'ribbon.ease': 0.75,
      'ribbon.drops': 8,
      'ribbon.burst': 6,
      'ribbon.fling': 0.9,
      'ribbon.gravity': 1600,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('liquidRibbon', 'Wave', {
    transform: { rotation: -24 },
    params: {
      'ribbon.path': 'slash',
      'ribbon.size': 340,
      'ribbon.width': 30,
      'ribbon.tail': 0.04,
      'ribbon.reach': 0.85,
      'ribbon.travel': 0.38,
      'ribbon.ease': 0.75,
      'ribbon.wobble': 0.45,
      'ribbon.drops': 18,
      'ribbon.burst': 12,
      'ribbon.fling': 1,
      'ribbon.gravity': 1600,
      'style.ramp': WATER_CEL,
      ...foam,
    },
  });
  c.add('sparkleBurst', 'Foam glints', {
    blend: 'add',
    params: {
      'burst.start': 0.1,
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

/**
 * Liquid Ribbon (D-108, after Raul's liquid "2" reference): a tube of water writes a "2" — the
 * round head runs ahead, the tail follows, drops fling off; at the end it gathers and bursts.
 * A thin swash curls after it. Switch the path to your own pen path to make any shape. One-shot.
 */
function liquidRibbon() {
  const c = compose({ timing: oneShot(40) });
  c.add('liquidRibbon', 'Swash', {
    transform: { x: 40, y: 10, rotation: 15 },
    params: {
      'single.start': 0.12,
      'ribbon.path': 'spiral',
      'ribbon.size': 260,
      'ribbon.width': 8,
      'ribbon.tail': 0.05,
      'ribbon.reach': 0.6,
      'ribbon.travel': 0.45,
      'ribbon.drops': 6,
      'ribbon.burst': 5,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('liquidRibbon', 'Ribbon', {
    params: {
      'ribbon.path': 'two',
      'ribbon.size': 300,
      'ribbon.width': 20,
      'ribbon.reach': 0.6,
      'ribbon.travel': 0.5,
      'ribbon.drops': 12,
      'ribbon.burst': 9,
      'style.ramp': WATER_CEL,
    },
  });
  return c.done();
}

/**
 * Bubbling Brew (D-110, rebuilt like the other liquids): a lime goo pool in a dark rim — the goo
 * slowly churns and swirls in flat cel bands; bubbles swell up in place, jiggle and pop into
 * round droplets with a small ring; thick, sticky goo leaps up in short melted jets that stretch
 * long before they pinch, fall back as round blobs and splat in; flicked drops; thin green fumes.
 * Seamless loop.
 */
function bubblingBrew() {
  const c = compose({ timing: loop(48) });
  const g = 110; // the goo surface
  const W = 320; // pool width
  const flat = { scaleY: 36 };
  c.add('celSmokeEmitter', 'Fumes', {
    transform: { y: g - 20 },
    params: {
      'emit.shape': 'line',
      'emit.width': 200,
      'emit.rate': 3.5,
      'emit.cone': 30,
      'emit.speed': 40,
      'emit.gravity': -70,
      'emit.drag': 0.8,
      'emit.wind': 18,
      'emit.windSpeed': 0.5,
      'emit.life': 1.8,
      'emit.prewarm': true,
      'emit.scaleOverLife': curve([
        [0, 0.4],
        [0.4, 0.9],
        [1, 1.2],
      ]),
      'cs.size': 22,
      'cs.lumps': 4,
      'cs.shade': 0.3,
      'cs.holeCount': 6,
      'cs.holeStart': 0.2,
      'style.ramp': rampPreset('smokeToxic'),
    },
  });
  c.add('fractalNoise', 'Rim', {
    transform: { y: g + 6, ...flat },
    params: {
      'fn.wrap': 'sphere',
      'fn.width': W + 26,
      'fn.tilt': 0,
      'fn.contrast': 0,
      'fn.ramp': ramp([
        [0, '#1d3a08'],
        [1, '#1d3a08'],
      ]),
    },
  });
  c.add('fractalNoise', 'Goo', {
    transform: { y: g, ...flat },
    params: {
      'fn.wrap': 'sphere',
      'fn.width': W,
      'fn.tilt': 0,
      'fn.type': 'liquid',
      'fn.scale': 150,
      'fn.complexity': 1.5,
      'fn.contrast': 70,
      'fn.bands': 3,
      'fn.twirl': 140,
      'fn.spin': 0.5,
      'fn.evoSpeed': 1.5,
      'fn.ramp': GOO_POOL,
    },
  });
  c.add('rippleEmitter', 'Pop rings', {
    transform: { y: g },
    params: {
      'emit.width': W * 0.7,
      'emit.rate': 3,
      'emit.life': 0.6,
      'emit.prewarm': true,
      'ripple.radius': 34,
      'ripple.thickness': 0.2,
      'ripple.flatten': 0.36,
      'ripple.dashes': 0.6,
      'ripple.dashCount': 6,
      'style.ramp': GOO,
    },
  });
  // thick, sticky goo leaping up: short melted jets, staggered across the loop
  for (const [label, x, start, h, r, lean] of /** @type {const} */ ([
    ['Leap 1', -60, 0.02, 150, 13, -0.08],
    ['Leap 2', 70, 0.34, 120, 11, 0.1],
    ['Leap 3', -5, 0.62, 170, 14, 0.03],
  ])) {
    jet(c, label, {
      x,
      y: g,
      'single.start': start,
      'single.end': Math.min(1, start + 0.38),
      'stream.height': h,
      'stream.radius': r,
      'stream.push': 0.22,
      'stream.apex': 0.4,
      'stream.taper': 0.8,
      'stream.breakup': 0.6,
      'stream.stick': 0.6,
      'stream.lumps': 4,
      'stream.spread': 0.2,
      'stream.lean': lean,
      'stream.merge': 0.55,
      'style.ramp': GOO,
    });
  }
  c.add('bubbleEmitter', 'Bubbles', {
    transform: { y: g - 4 },
    params: {
      'emit.shape': 'box',
      'emit.width': W * 0.75,
      'emit.height': 34,
      'emit.rate': 5,
      'emit.speed': 0,
      'emit.gravity': 0,
      'emit.life': 0.9,
      'emit.lifeVariance': 0.3,
      'emit.prewarm': true,
      'emit.sizeVariance': 0.5,
      // swell up in place, then pop
      'emit.scaleOverLife': curve([
        [0, 0.15],
        [0.7, 1],
        [1, 1.1],
      ]),
      'emit.opacityOverLife': FLAT,
      'bubble.radius': 20,
      'bubble.fill': 0.75,
      'bubble.rim': 0.18,
      'style.rampOverLife': curve([
        [0, 0.22],
        [1, 0.22],
      ]),
      'bubble.jiggle': 0.7,
      'bubble.pop': 0.22,
      'style.ramp': GOO,
      'outline.mode': 'off',
    },
  });
  c.add('dropEmitter', 'Flicked drops', {
    transform: { y: g - 6 },
    params: {
      'emit.shape': 'line',
      'emit.width': W * 0.6,
      'emit.rate': 7,
      'emit.cone': 70,
      'emit.speed': 300,
      'emit.speedVariance': 0.5,
      'emit.gravity': 1400,
      'emit.life': 0.45,
      'emit.prewarm': true,
      'drop.size': 5,
      'style.ramp': GOO,
    },
  });
  return c.done();
}

// ── Particle presets ────────────────────────────────────────────────────────────────────────

/**
 * Rain (D-101): long streaks (drops stretched by their speed) falling at an angle; where they
 * hit, tiny crowns of drops jump up and fall back and small rings spread. Seamless loop.
 */
function rain() {
  const c = compose({ timing: loop(24) });
  const g = 220;
  c.add('rippleEmitter', 'Rings', {
    transform: { y: g },
    params: {
      'emit.width': 620,
      'emit.rate': 26,
      'emit.life': 0.5,
      'ripple.radius': 28,
      'ripple.thickness': 0.22,
      'ripple.dashes': 0.6,
      'ripple.dashCount': 8,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('dropEmitter', 'Rain', {
    transform: { y: -300, rotation: 15 },
    params: {
      'emit.shape': 'line',
      'emit.width': 760,
      'emit.rate': 70,
      'emit.direction': 180,
      'emit.cone': 2,
      'emit.speed': 1300,
      'emit.speedVariance': 0.15,
      'emit.gravity': 0,
      'emit.drag': 0,
      'emit.life': 0.5,
      'emit.lifeVariance': 0.1,
      'emit.scaleOverLife': FLAT,
      'drop.size': 2.6,
      'drop.stretch': 3,
      'drop.tail': 1.4,
      'drop.highlight': 0.2,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('dropEmitter', 'Splashes', {
    transform: { y: g },
    params: {
      'emit.shape': 'line',
      'emit.width': 620,
      'emit.rate': 60,
      'emit.cone': 70,
      'emit.speed': 300,
      'emit.speedVariance': 0.5,
      'emit.gravity': 2600,
      'emit.life': 0.24,
      'emit.lifeVariance': 0.3,
      'drop.size': 2.2,
      'drop.highlight': 0.3,
      'style.ramp': WATER_CEL,
    },
  });
  return c.done();
}

/** Rising Bubbles: wobbling bubbles drifting up. Loops. */
function risingBubbles() {
  // D-109: bubbles squash and stretch as they wobble up, then pop into droplets (no fade)
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
      'emit.opacityOverLife': FLAT,
      'bubble.pop': 0.12,
      'bubble.jiggle': 0.5,
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
      'emit.opacityOverLife': FLAT,
      'bubble.pop': 0.12,
      'bubble.jiggle': 0.6,
      'style.ramp': WATER_CEL,
    },
  });
  return c.done();
}

/**
 * Spray Fountain (D-101): drops leave the nozzle fast and stretched, round off at the top of
 * their arc, stretch again as they fall; a thick core near the nozzle; foam and rings at the
 * base. Seamless loop.
 */
function sprayFountain() {
  const c = compose({ timing: loop(24) });
  const g = 200;
  c.add('rippleEmitter', 'Rings', {
    transform: { y: g },
    params: {
      'emit.width': 140,
      'emit.rate': 6,
      'emit.life': 0.9,
      'ripple.radius': 90,
      'ripple.thickness': 0.12,
      'ripple.dashes': 0.8,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('dropEmitter', 'Spray', {
    transform: { y: g },
    params: {
      'emit.rate': 70,
      'emit.cone': 22,
      'emit.speed': 1050,
      'emit.speedVariance': 0.3,
      'emit.gravity': 2400,
      'emit.drag': 0.2,
      'emit.life': 1.1,
      'emit.size': 1,
      'emit.sizeVariance': 0.5,
      'drop.size': 9,
      'drop.stretch': 1.3,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('dropEmitter', 'Core', {
    transform: { y: g },
    params: {
      'emit.rate': 90,
      'emit.cone': 6,
      'emit.speed': 1150,
      'emit.speedVariance': 0.15,
      'emit.gravity': 2400,
      'emit.life': 0.32,
      'emit.scaleOverLife': curve([
        [0, 1.2],
        [1, 0.5],
      ]),
      'drop.size': 13,
      'drop.stretch': 1.6,
      'drop.tail': 1,
      'style.ramp': WATER_CEL,
    },
  });
  // cel foam (D-100): small white puffs that stay low and are eaten quickly
  c.add('celSmokeEmitter', 'Foam', {
    transform: { y: g },
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
/** Foam: white → pale cyan → light blue (the churning foot of a waterfall). */
const FOAM_CEL = ramp([
  [0, '#ffffff'],
  [0.3, '#d9f8ff'],
  [0.6, '#8fdcff'],
  [1, '#3f9fe6'],
]);

/**
 * Waterfall Impact (D-106, after Raul's two waterfall references): a streaked column falls into
 * a churning foam mound — a boiling ring of round petals around a dome of foam cells that
 * re-forms every second frame (drawn on twos, like hand animation); swirling ring pieces, little
 * bubble rings, drops thrown out on arcs and low mist banks. Seamless loop.
 */
function waterfallImpact() {
  const c = compose({ timing: { ...loop(48), holdMode: 'twos' } });
  const g = 170; // the water surface
  const foot = (/** @type {'back' | 'front'} */ part) => ({
    transform: { y: g },
    params: {
      'crown.mode': 'boil',
      'crown.part': part,
      'crown.radius': 92,
      'crown.height': 105,
      'crown.petals': 12,
      'crown.spike': 0.1,
      'crown.flatten': 0.42,
      'crown.boilRate': 10,
      'crown.flare': -0.45,
      'crown.bulge': 0.6,
      'crown.backTone': 0.35,
      'crown.frontTone': 0.08,
      'crown.streaks': 0.3,
      'style.ramp': FOAM_CEL,
      // foam cells churning inside the mound: white with pale-blue cel patches
      'surf.on': true,
      'surf.map': 'flat',
      'surf.type': 'cells',
      'surf.scale': 26,
      'surf.complexity': 1.5,
      'surf.warp': 1.5,
      'surf.contrast': 150,
      'surf.brightness': 5,
      'surf.bands': 3,
      'surf.evoSpeed': 5.5,
      'surf.alpha': 'solid',
      'surf.mix': 85,
      'surf.ramp': ramp([
        [0, '#ffffff'],
        [0.5, '#c9f1ff'],
        [1, '#7fcfff'],
      ]),
    },
  });
  rings(c, 'Swirl rings', {
    y: g,
    'ripple.mode': 'repeat',
    'ripple.radius': 190,
    'ripple.count': 3,
    'ripple.cycles': 2,
    'ripple.flatten': 0.32,
    'ripple.start': 0.45,
    'ripple.thickness': 0.09,
    'ripple.dashes': 0.6,
    'ripple.dashCount': 7,
  });
  c.add('celSmokeEmitter', 'Mist', {
    transform: { y: g + 6 },
    params: {
      'emit.shape': 'line',
      'emit.width': 200,
      'emit.rate': 3,
      'emit.cone': 140,
      'emit.speed': 110,
      'emit.gravity': -30,
      'emit.drag': 1.6,
      'emit.wind': 15,
      'emit.windSpeed': 0.5,
      'emit.life': 1.8,
      'emit.prewarm': true,
      'emit.scaleOverLife': curve([
        [0, 0.6],
        [0.35, 1.05],
        [1, 1.4],
      ]),
      'cs.form': 'bank',
      'cs.size': 15,
      'cs.lumps': 5,
      'cs.length': 80,
      'cs.shade': 0.3,
      'cs.droplets': 2,
      'cs.holeCount': 8,
      'cs.holeStart': 0.3,
      'cs.bodyTone': 0.3,
      'cs.shadeTone': 0.7,
      'style.ramp': MIST,
    },
  });
  const back = c.add('crown', 'Foam (back)', foot('back'));
  c.add('waterColumn', 'Fall', {
    transform: { y: g },
    params: {
      'col.flow': 'down',
      'col.length': 460,
      'col.width': 44,
      'col.taper': -0.15,
      'col.speed': 3,
      'col.streaks': 9,
      'col.ragged': 0.4,
      'col.spikes': 0.3,
      'style.ramp': WATER_CEL,
      'glow.amount': 0.35,
      'surf.on': true,
      'surf.map': 'flow',
      'surf.flowAngle': 90,
      'surf.flowSpeed': 900,
      'surf.flowStretch': 5,
      'surf.scale': 26,
      'surf.mix': 75,
    },
  });
  const front = c.add('crown', 'Foam (front)', foot('front'));
  c.set(front, { seedKey: back });
  c.add('dropEmitter', 'Thrown drops', {
    transform: { y: g - 20 },
    params: {
      'emit.shape': 'line',
      'emit.width': 150,
      'emit.rate': 22,
      'emit.cone': 110,
      'emit.speed': 380,
      'emit.speedVariance': 0.5,
      'emit.gravity': 1800,
      'emit.life': 0.6,
      'emit.size': 1,
      'emit.sizeVariance': 0.6,
      'emit.prewarm': true,
      'drop.size': 6,
      'style.ramp': WATER_CEL,
    },
  });
  c.add('bubbleEmitter', 'Bubble rings', {
    transform: { y: g - 10 },
    params: {
      'emit.shape': 'box',
      'emit.width': 260,
      'emit.height': 50,
      'emit.rate': 6,
      'emit.speed': 25,
      'emit.gravity': -60,
      'emit.life': 0.9,
      'emit.prewarm': true,
      'emit.opacityOverLife': SOFT_LIFE,
      'style.ramp': FOAM_CEL,
      'outline.mode': 'off',
    },
  });
  return c.done();
}

function waterfallMist() {
  const c = compose({ timing: { ...loop(48), holdMode: 'twos' } });
  // D-106: a thin streaked pour with a running water surface (was a stream of droplets)
  const g = 190;
  c.add('waterColumn', 'Pour', {
    transform: { y: g },
    params: {
      'col.flow': 'down',
      'col.length': 470,
      'col.width': 20,
      'col.taper': -0.3,
      'col.speed': 3,
      'col.streaks': 5,
      'col.ragged': 0.5,
      'col.spikes': 0.3,
      'style.ramp': WATER_CEL,
      'surf.on': true,
      'surf.map': 'flow',
      'surf.flowAngle': 90,
      'surf.flowSpeed': 800,
      'surf.flowStretch': 5,
      'surf.scale': 18,
      'surf.mix': 70,
    },
  });
  c.add('crown', 'Foam', {
    transform: { y: g },
    params: {
      'crown.mode': 'boil',
      'crown.radius': 46,
      'crown.height': 34,
      'crown.petals': 9,
      'crown.spike': 0.1,
      'crown.flatten': 0.42,
      'crown.boilRate': 9,
      'crown.flare': -0.4,
      'crown.bulge': 0.6,
      'crown.backTone': 0.35,
      'crown.frontTone': 0.08,
      'crown.streaks': 0.2,
      'style.ramp': ramp([
        [0, '#ffffff'],
        [0.3, '#d9f8ff'],
        [0.6, '#8fdcff'],
        [1, '#3f9fe6'],
      ]),
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

/**
 * Drop Impact (D-101, after Raul's splash reference): a drop falls stretched, hits; a crown of
 * droplets jumps out, the impact ring flashes out and breaks up, a little rebound jet rises,
 * pinches one drop that falls back and makes a smaller ring; rings slow and break into dashes.
 * One-shot.
 */
function dropImpact() {
  const c = compose({ timing: oneShot(44) });
  const g = 150;
  const hit = 0.18;
  // falls faster and faster (gravity), stretched by its speed
  dropBurst(c, 'Falling drop', {
    y: -210,
    'burst.count': 1,
    'burst.direction': 180,
    'burst.cone': 0,
    'burst.speed': 1000,
    'burst.speedVariance': 0,
    'burst.drag': 0,
    'burst.gravity': 8000,
    'burst.life': hit,
    'burst.lifeVariance': 0,
    'burst.sizeVariance': 0,
    'burst.scaleOverLife': FLAT,
    'drop.size': 13,
    'drop.stretch': 0.8,
  });
  rings(c, 'Impact ring', {
    y: g,
    'single.start': hit,
    'single.end': 0.75,
    'ripple.radius': 170,
    'ripple.count': 1,
    'ripple.thickness': 0.26,
    'ripple.start': 0.15,
    'ripple.ease': 0.95,
  });
  rings(c, 'Ripples', {
    y: g,
    'single.start': hit + 0.04,
    'ripple.radius': 260,
    'ripple.count': 3,
  });
  rings(c, 'Second ripples', {
    y: g,
    'single.start': 0.62,
    'ripple.radius': 110,
    'ripple.count': 2,
  });
  jet(c, 'Rebound jet', {
    y: g,
    'single.start': hit + 0.08,
    'single.end': 0.75,
    'stream.height': 150,
    'stream.radius': 8,
    'stream.push': 0.3,
    'stream.apex': 0.34,
    'stream.taper': 0.9,
    'stream.breakup': 0.7,
    'stream.lumps': 6,
    'stream.spread': 0.4,
  });
  dropBurst(c, 'Crown', {
    y: g,
    'burst.start': hit,
    'burst.count': 14,
    'burst.direction': 0,
    'burst.cone': 120,
    'burst.speed': 1300,
    'burst.speedVariance': 0.4,
    'burst.drag': 0.8,
    'burst.gravity': 7000,
    'burst.life': 0.32,
    'burst.lifeVariance': 0.3,
    'burst.spawnRadius': 14,
    'drop.size': 6.5,
  });
  return c.done();
}

/**
 * Jet Breakup (D-101b, after Raul's rising-column reference): a short push throws a lumpy,
 * wavy clump of water up; it thins as it climbs, tears at uneven places one after another
 * into drops of very different sizes plus tiny satellites; the head bursts into a little fan;
 * the drops scatter like a cloud, hang, fall and shrink to dots. One-shot.
 */
function jetBreakup() {
  const c = compose({ timing: oneShot(36) });
  const g = 220;
  rings(c, 'Base ring', { y: g, 'ripple.radius': 170, 'ripple.count': 2 });
  jet(c, 'Jet', {
    y: g,
    'stream.height': 320,
    'stream.radius': 15,
    'stream.push': 0.3,
    'stream.apex': 0.34,
    'stream.taper': 0.9,
    'stream.breakup': 0.7,
    'stream.lumps': 8,
    'stream.spread': 0.4,
  });
  dropBurst(c, 'Base spray', {
    y: g,
    'burst.count': 10,
    'burst.direction': 0,
    'burst.cone': 120,
    'burst.speed': 900,
    'burst.gravity': 6000,
    'burst.life': 0.3,
    'drop.size': 4,
  });
  return c.done();
}

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const WATER_PRESETS = Object.freeze([
  {
    id: 'waterSplash',
    name: 'Water Splash',
    blurb:
      'A crown of drops thrown up, a rebound jet that pinches into drops, rings, foam. One-shot.',
    build: waterSplash,
  },
  {
    id: 'dropImpact',
    name: 'Drop Impact',
    blurb:
      'A drop falls and hits: crown, ring, a rebound jet that pinches a drop, rings. One-shot.',
    build: dropImpact,
  },
  {
    id: 'jetBreakup',
    name: 'Jet Breakup',
    blurb: 'A column shoots up, thins, pinches into drops that round up and fall back. One-shot.',
    build: jetBreakup,
  },
  {
    id: 'geyser',
    name: 'Geyser',
    blurb:
      'A thick jet erupts, thins and breaks into drops that rain back; side jets, mist. One-shot.',
    build: geyser,
  },
  {
    id: 'waterfallImpact',
    name: 'Waterfall Impact',
    blurb:
      'A streaked column falls into a churning foam mound (on twos), swirling rings, thrown drops, mist. Seamless loop.',
    build: waterfallImpact,
  },
  {
    id: 'liquidRibbon',
    name: 'Liquid Ribbon',
    blurb:
      'A tube of water writes a “2”: round head ahead, tail following, drops flung, a burst at the end. Use your own pen path for any shape. One-shot.',
    build: liquidRibbon,
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
    blurb:
      'A lime goo pool: churning surface, bubbles that swell and pop, sticky goo leaping up and pinching into blobs, fumes. Seamless loop.',
    build: bubblingBrew,
  },
]);

/** @type {ReadonlyArray<import('../particles/presets.js').ParticlePreset>} */
export const WATER_PARTICLE_PRESETS = Object.freeze([
  {
    id: 'rain',
    name: 'Rain',
    blurb: 'Speed-stretched streaks, tiny crowns and rings where they land. Seamless loop.',
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
