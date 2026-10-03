// @ts-check
/**
 * Cel smoke (D-092), after Raul's four references (a pink cartoon poof, a grey cel smoke
 * column, a green toxic cloud, pixel-art puffs): smoke as a UNION OF ROUND LUMPS in flat cel
 * tones —
 *   • body: the lumps merged into one bumpy silhouette;
 *   • shade: the same lumps in a darker tone, then a lighter copy shifted toward the light on
 *     top, so a dark crescent stays on every lump's shadow side (also between lumps);
 *   • highlight blobs: smaller, lighter circles toward the light (the green cloud);
 *   • dissipation without fading: round HOLES grow inside every lump, lumps shrink and break
 *     apart, droplets pinch off and shrink to nothing.
 * Forms: puff (round cluster), column (lumps rise up a curving spine, growing — seamless loop),
 * bank (a long low cloud), mushroom (a rising stem with a cap). Like the cel flame, it is drawn
 * on a private scratch canvas and placed with the current transform.
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { loopRate } from '../core/loopContext.js';
import { createRng } from '../core/prng.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition, readStyle } from '../render/style.js';
import { scratch } from './celFlame.js';

const G = 'Cel smoke';
const TAU = Math.PI * 2;
const smooth = (/** @type {number} */ t) => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

const num = (
  /** @type {string} */ id,
  /** @type {string} */ label,
  /** @type {number} */ min,
  /** @type {number} */ max,
  /** @type {number} */ step,
  /** @type {number} */ def,
  /** @type {string} */ tooltip = '',
  /** @type {string} */ unit = '',
) => ({
  id: `cs.${id}`,
  label,
  group: G,
  type: 'float',
  min,
  max,
  step,
  default: def,
  ...(unit ? { unit } : {}),
  ...(tooltip ? { tooltip } : {}),
});

/** Cel smoke parameters (ids `cs.*`). Defaults follow Raul's references [Raul]. */
export const CEL_SMOKE_PARAMS = [
  {
    id: 'cs.form',
    label: 'Form',
    group: G,
    type: 'enum',
    options: [
      { value: 'puff', label: 'Puff (round cluster)' },
      { value: 'column', label: 'Column (rising, loops)' },
      { value: 'bank', label: 'Bank (long, low cloud)' },
      { value: 'mushroom', label: 'Mushroom (stem + cap)' },
    ],
    default: 'puff',
  },
  num('size', 'Lump size', 4, 400, 1, 60, 'Radius of the biggest lumps', 'px'),
  { id: 'cs.lumps', label: 'Lumps', group: G, type: 'int', min: 1, max: 24, default: 7 },
  num('spread', 'Spread', 0, 2, 0.01, 0.7, 'How far the lumps sit from each other (× size)'),
  num('length', 'Height / length', 10, 1200, 1, 340, 'Column / mushroom height, bank length', 'px'),
  num(
    'rise',
    'Rise speed',
    0,
    4,
    0.05,
    0.6,
    'Column: lumps travelling up per second (loops: whole cycles)',
    '/s',
  ),
  num('sway', 'Sway', 0, 1, 0.01, 0.18, 'Column: S-curve of the spine (× height)'),
  num('lean', 'Lean', -1, 1, 0.01, 0, 'Bends the column / stem toward one side'),
  num('boil', 'Boil', 0, 4, 0.05, 0.6, 'Lumps swelling and settling (per second)', '/s'),
  num('drift', 'Drift apart', 0, 1, 0.01, 0.2, 'Puff / bank: lumps drift apart over the life'),
  num('shade', 'Shade', 0, 1, 0.01, 0.35, 'Size of the dark crescent on each lump (0 = flat)'),
  num(
    'light',
    'Light from',
    0,
    360,
    1,
    315,
    'Direction the light comes from: 0 = right, 270 = above, 315 = top-right, 225 = top-left',
    '°',
  ),
  num(
    'highlight',
    'Highlights',
    0,
    1,
    0.01,
    0,
    'Light blobs on the lit side (the toxic-cloud look)',
  ),
  num('bodyTone', 'Body colour', 0, 1, 0.01, 0.2, 'Position on the ramp'),
  num('shadeTone', 'Shade colour', 0, 1, 0.01, 0.62, 'Position on the ramp'),
  num('highlightTone', 'Highlight colour', 0, 1, 0.01, 0, 'Position on the ramp'),
  {
    id: 'cs.holes',
    label: 'Holes over life',
    group: G,
    type: 'curve',
    yMin: 0,
    yMax: 1.5,
    default: [
      { x: 0, y: 0 },
      { x: 0.45, y: 0 },
      { x: 1, y: 1.2 },
    ],
    tooltip: 'Round holes growing inside every lump (× lump size). Column: over the height',
  },
  {
    id: 'cs.shrink',
    label: 'Shrink over life',
    group: G,
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 0 },
      { x: 0.55, y: 0 },
      { x: 1, y: 0.75 },
    ],
    tooltip: 'Lumps getting smaller as they break apart (0 = full size)',
  },
  {
    id: 'cs.droplets',
    label: 'Droplets',
    group: G,
    type: 'int',
    min: 0,
    max: 16,
    default: 5,
    tooltip: 'Small round bits pinching off as it breaks up',
  },
];

/** @param {Record<string, any>} v */
export const readCelSmoke = (v) => ({
  form: v['cs.form'] ?? 'puff',
  size: v['cs.size'] ?? 60,
  lumps: v['cs.lumps'] ?? 7,
  spread: v['cs.spread'] ?? 0.7,
  length: v['cs.length'] ?? 340,
  rise: v['cs.rise'] ?? 0.6,
  sway: v['cs.sway'] ?? 0.18,
  lean: v['cs.lean'] ?? 0,
  boil: v['cs.boil'] ?? 0.6,
  drift: v['cs.drift'] ?? 0.2,
  shade: v['cs.shade'] ?? 0.35,
  light: v['cs.light'] ?? 315,
  highlight: v['cs.highlight'] ?? 0,
  bodyTone: v['cs.bodyTone'] ?? 0.2,
  shadeTone: v['cs.shadeTone'] ?? 0.62,
  highlightTone: v['cs.highlightTone'] ?? 0,
  holes: v['cs.holes'],
  shrink: v['cs.shrink'],
  droplets: v['cs.droplets'] ?? 5,
});

/** @typedef {ReturnType<typeof readCelSmoke>} CelSmoke */
/** @typedef {{ x: number, y: number, r: number, age: number, hx: number, hy: number, hs: number, delay: number }} Lump */

/**
 * The smoke's lumps and droplets at a moment. `age` 0–1 is the layer's / particle's life
 * (columns use each lump's height instead). Pure; exported for tests.
 * @param {CelSmoke} p @param {number} seed @param {number} seconds @param {number} age
 * @returns {{ lumps: Lump[], drops: { x: number, y: number, r: number }[] }}
 */
export function celSmokeShape(p, seed, seconds, age) {
  const rng = createRng(seed);
  const S = p.size;
  const boil = loopRate(p.boil) * seconds;
  /** @type {Lump[]} */
  const lumps = [];
  const add = (
    /** @type {number} */ x,
    /** @type {number} */ y,
    /** @type {number} */ r,
    /** @type {number} */ a,
  ) => {
    const ph = rng.next();
    const k = 1 + 0.07 * Math.sin(TAU * (boil + ph));
    // where this lump's hole opens (inside it, toward a random side)
    const ha = rng.next() * TAU;
    const hd = 0.15 + 0.35 * rng.next();
    // about a third of the lumps never get a hole (they break up by shrinking)
    const hs = rng.next() < 0.35 ? 0 : 0.7 + 0.6 * rng.next();
    const hd0 = rng.next() * 0.22; // holes open one after another, not all at once
    lumps.push({
      x,
      y,
      r: r * k,
      age: a,
      hx: Math.cos(ha) * hd,
      hy: Math.sin(ha) * hd,
      hs,
      delay: hd0,
    });
  };
  /** a curving spine from the base (0, 0) up to −h */
  const spine = (/** @type {number} */ v, /** @type {number} */ h, /** @type {number} */ ph) =>
    p.sway * h * v * Math.sin(TAU * (1.2 * v - loopRate(p.rise * 0.5) * seconds - ph)) +
    p.lean * h * v * v;
  const column = (
    /** @type {number} */ h,
    /** @type {number} */ n,
    /** @type {number} */ width,
    /** @type {boolean} */ ownAge,
  ) => {
    const ph = rng.next();
    const rate = loopRate(p.rise);
    for (let i = 0; i < n; i++) {
      const phase = (i + rng.next() * 0.5) / n;
      const v = (((phase + rate * seconds) % 1) + 1) % 1;
      const side = (rng.next() - 0.5) * width;
      // lumps swell in at the base and shrink away at the top, so none pops in or out
      const env = smooth(v / 0.1) * (1 - smooth((v - 0.82) / 0.18));
      const r = S * (0.25 + 0.85 * v ** 0.8) * (0.8 + 0.4 * rng.next()) * env;
      add(spine(v, h, ph) + side * r, -v * h, r, ownAge ? v : age);
    }
  };
  const cluster = (
    /** @type {number} */ cx,
    /** @type {number} */ cy,
    /** @type {number} */ n,
    /** @type {number} */ scale,
  ) => {
    add(cx, cy, S * scale, age);
    for (let i = 1; i < n; i++) {
      const a = (TAU * i) / Math.max(1, n - 1) + (rng.next() - 0.5) * 0.9;
      const d = S * scale * p.spread * (0.6 + 0.5 * rng.next()) * (1 + p.drift * age);
      add(
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.8,
        S * scale * (0.45 + 0.4 * rng.next()),
        age,
      );
    }
  };
  if (p.form === 'column') column(p.length, p.lumps, p.spread, true);
  else if (p.form === 'bank') {
    const n = Math.max(2, p.lumps);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = (t - 0.5) * p.length * (1 + p.drift * age * 0.5);
      const y = -t * p.length * 0.18 + (rng.next() - 0.5) * S * 0.7;
      add(x, y, S * (0.3 + 0.8 * t) * (0.6 + 0.55 * rng.next()), age);
      // a second, higher row over the fuller part
      if (t > 0.4 && rng.next() < 0.7)
        add(
          x + (rng.next() - 0.5) * S * 0.6,
          y - S * (0.5 + 0.4 * t),
          S * (0.25 + 0.6 * t) * (0.6 + 0.5 * rng.next()),
          age,
        );
    }
  } else if (p.form === 'mushroom') {
    const grow = Math.min(1, age * 2.5);
    column(p.length * grow, Math.max(4, Math.ceil(p.length / (S * 0.45))), 0.2, false);
    // the stem lumps stay thin
    for (const l of lumps) l.r *= 0.55;
    cluster(
      spine(1, p.length * grow, 0) * 0,
      -p.length * grow,
      Math.max(3, p.lumps),
      0.6 + 0.6 * grow,
    );
  } else cluster(0, 0, p.lumps, 1);

  /** droplets: pinch off the outside once it breaks up, fly out, shrink away */
  const drops = [];
  if (p.droplets > 0 && p.form !== 'column') {
    let bx = 0;
    let by = 0;
    for (const l of lumps) {
      bx += l.x / lumps.length;
      by += l.y / lumps.length;
    }
    const reach = Math.max(...lumps.map((l) => Math.hypot(l.x - bx, l.y - by) + l.r));
    for (let i = 0; i < p.droplets; i++) {
      const a = rng.next() * TAU;
      const t0 = 0.3 + 0.3 * rng.next();
      const u = (age - t0) / (1 - t0);
      if (u <= 0 || u >= 1) continue;
      const d = reach * (0.8 + 0.5 * u);
      drops.push({
        x: bx + Math.cos(a) * d,
        y: by + Math.sin(a) * d - u * S * 0.6,
        r: S * (0.1 + 0.1 * rng.next()) * (1 - u),
      });
    }
  }
  return { lumps, drops };
}

/**
 * Draw one cel smoke around its origin with the current transform.
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, ageS?: number, seed?: number }} inst
 * @param {{ seconds?: number }} frame
 */
export function drawCelSmoke(ctx, params, inst, frame) {
  const p = readCelSmoke(params);
  const style = readStyle(params);
  const age = inst.age ?? 0;
  const seconds = inst.ageS ?? frame.seconds ?? 0;
  const { lumps, drops } = celSmokeShape(p, inst.seed ?? 0, seconds, age);
  // each lump's current radius and hole
  const live = lumps
    .map((l) => {
      const shrink = Math.min(1, Math.max(0, p.shrink ? evalCurve(p.shrink, l.age) : 0));
      const hole = Math.max(0, p.holes ? evalCurve(p.holes, Math.max(0, l.age - l.delay)) : 0);
      const r = l.r * (1 - shrink);
      return { ...l, r, hole: hole * l.r * l.hs };
    })
    .filter((l) => l.r > 0.3);
  if (!live.length && !drops.length) return;
  const all = [...live, ...drops];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const l of all) {
    x0 = Math.min(x0, l.x - l.r);
    y0 = Math.min(y0, l.y - l.r);
    x1 = Math.max(x1, l.x + l.r);
    y1 = Math.max(y1, l.y + l.r);
  }
  x0 -= 4;
  y0 -= 4;
  const bw = x1 - x0 + 8;
  const bh = y1 - y0 + 8;
  const m = ctx.getTransform();
  const k = Math.min(4, Math.max(0.05, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))));
  const W = Math.max(1, Math.min(2048, Math.ceil(bw * k)));
  const H = Math.max(1, Math.min(2048, Math.ceil(bh * k)));
  const base = corePosition(style, age);
  const tone = (/** @type {number} */ t) => toCss(sampleRamp(style.ramp, Math.min(1, base + t)));
  const la = (p.light * Math.PI) / 180;
  const lx = Math.cos(la);
  const ly = Math.sin(la);

  const { c, x } = scratch(ctx, W, H, 'smoke');
  x.setTransform(W / bw, 0, 0, H / bh, -x0 * (W / bw), -y0 * (H / bh));
  const circles = (
    /** @type {{ x: number, y: number, r: number }[]} */ list,
    dx = 0,
    dy = 0,
    kr = 1,
  ) => {
    x.beginPath();
    for (const l of list) {
      const r = l.r * kr;
      if (r <= 0) continue;
      const cx = l.x + dx * l.r;
      const cy = l.y + dy * l.r;
      x.moveTo(cx + r, cy);
      x.arc(cx, cy, r, 0, TAU);
    }
    x.fill();
  };
  // 1) the whole silhouette in the shade tone, 2) the body tone shifted toward the light on
  // top (kept inside): a dark crescent stays on each lump's shadow side
  x.fillStyle = tone(p.shade > 0 ? p.shadeTone : p.bodyTone);
  circles(all);
  if (p.shade > 0) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tone(p.bodyTone);
    circles(all, lx * p.shade * 0.8, ly * p.shade * 0.8, 1 - p.shade * 0.2);
  }
  if (p.highlight > 0) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tone(p.highlightTone);
    circles(live, lx * 0.5, ly * 0.5, 0.3 + 0.4 * p.highlight);
  }
  // 3) holes grow inside the lumps: the smoke breaks apart without fading
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  for (const l of live) {
    if (l.hole < l.r * 0.16) continue;
    const hx = l.x + l.hx * l.r;
    const hy = l.y + l.hy * l.r;
    x.moveTo(hx + l.hole, hy);
    x.arc(hx, hy, l.hole, 0, TAU);
  }
  x.fill();
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(c, 0, 0, W, H, x0, y0, bw, bh);
}
