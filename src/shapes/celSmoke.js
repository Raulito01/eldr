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
  // ── Organic timing (D-093): every lump lives its own life, overlapping the others ──
  {
    id: 'cs.order',
    label: 'Breaks up from',
    group: G,
    type: 'enum',
    options: [
      { value: 'edges', label: 'Edges first (core last)' },
      { value: 'bottom', label: 'Bottom first' },
      { value: 'top', label: 'Top first' },
      { value: 'left', label: 'Left first' },
      { value: 'right', label: 'Right first' },
      { value: 'random', label: 'Random' },
    ],
    default: 'edges',
    tooltip:
      'Where the break-up starts and travels from. Edges: the core is born first and goes last',
  },
  num(
    'stagger',
    'Overlap',
    0,
    0.9,
    0.01,
    0.45,
    'How spread out the lumps’ lives are: 0 = all together (mechanical), higher = one flowing process',
  ),
  num(
    'pop',
    'Pop-in time',
    0.02,
    1,
    0.01,
    0.16,
    'How long a lump takes to burst to full size (× life)',
  ),
  num(
    'build',
    'Build-up',
    0,
    0.8,
    0.01,
    0.1,
    'Lumps appear one after another over this part of the life (in the break-up order)',
  ),
  num('expand', 'Keep growing', 0, 2, 0.01, 0.3, 'Slow, easing-out growth after the pop'),
  num('roll', 'Roll', 0, 1, 0.01, 0.3, 'Lumps rolling over each other (outward over the top)'),
  num(
    'rollSpeed',
    'Roll speed',
    0,
    4,
    0.05,
    0.6,
    'Turns per second (slows down as it loses energy)',
    '/s',
  ),
  num('bite', 'Edge bites', 0, 1, 0.01, 0.35, 'The outside gets eaten away as it breaks up'),
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
  order: v['cs.order'] ?? 'edges',
  stagger: v['cs.stagger'] ?? 0.45,
  pop: v['cs.pop'] ?? 0.16,
  build: v['cs.build'] ?? 0.1,
  expand: v['cs.expand'] ?? 0.3,
  roll: v['cs.roll'] ?? 0.3,
  rollSpeed: v['cs.rollSpeed'] ?? 0.6,
  bite: v['cs.bite'] ?? 0.35,
});

/** @typedef {ReturnType<typeof readCelSmoke>} CelSmoke */
/** @typedef {{ hx: number, hy: number, hs: number, delay: number }} Hole */
/**
 * A lump: position, radius, its OWN decay age (drives holes / shrink), its holes, and the
 * outward direction its edge gets bitten from (bite 0 = interior lump, never bitten).
 * @typedef {{ x: number, y: number, r: number, age: number, holes: Hole[], nx: number, ny: number, bite: number }} Lump
 */

const easeOutQuad = (/** @type {number} */ t) => 1 - (1 - t) * (1 - t);
const easeOutCubic = (/** @type {number} */ t) => 1 - (1 - t) ** 3;
/** fast in with a small overshoot, settling at 1 (the "pop") */
const easeOutBack = (/** @type {number} */ t) => {
  const c = 1.2;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};
const clamp01 = (/** @type {number} */ t) => Math.min(1, Math.max(0, t));

/**
 * The smoke's lumps and droplets at a moment. `age` 0–1 is the layer's / particle's life
 * (columns use each lump's height instead).
 *
 * Organic timing (D-093, smoke animation principles): every lump lives its own life — born in
 * the build-up order, pops in fast with an ease-out, keeps growing slower and slower, rolls
 * over its neighbours, then thins out (holes, edge bites, shrinking, droplets) on its OWN
 * clock. The clocks are staggered along the break-up order, so something is always still
 * swelling while something else is already breaking — one process, not stages. Pure.
 * @param {CelSmoke} p @param {number} seed @param {number} seconds @param {number} age
 * @returns {{ lumps: Lump[], drops: { x: number, y: number, r: number }[] }}
 */
export function celSmokeShape(p, seed, seconds, age) {
  const rng = createRng(seed);
  const S = p.size;
  const boil = loopRate(p.boil) * seconds;
  /** layout: home positions before timing; g = group (roll centre) */
  /** @type {{ x: number, y: number, r: number, gx: number, gy: number, ownAge: number }[]} */
  const home = [];
  const put = (
    /** @type {number} */ x,
    /** @type {number} */ y,
    /** @type {number} */ r,
    /** @type {number} */ gx,
    /** @type {number} */ gy,
    ownAge = -1,
  ) => home.push({ x, y, r, gx, gy, ownAge });

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
      const x = spine(v, h, ph) + side * r;
      put(x, -v * h, r, spine(v, h, ph), -v * h, ownAge ? v : -1);
    }
  };
  const cluster = (
    /** @type {number} */ cx,
    /** @type {number} */ cy,
    /** @type {number} */ n,
    /** @type {number} */ scale,
  ) => {
    put(cx, cy, S * scale * 0.85, cx, cy); // a big core alone would read as a ball
    for (let i = 1; i < n; i++) {
      const a = (TAU * i) / Math.max(1, n - 1) + (rng.next() - 0.5) * 0.9;
      const d = S * scale * p.spread * (0.6 + 0.5 * rng.next());
      put(
        cx + Math.cos(a) * d,
        cy + Math.sin(a) * d * 0.8,
        S * scale * (0.45 + 0.4 * rng.next()),
        cx,
        cy,
      );
    }
  };
  if (p.form === 'column') column(p.length, p.lumps, p.spread, true);
  else if (p.form === 'bank') {
    const n = Math.max(2, p.lumps);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = (t - 0.5) * p.length;
      const y = -t * p.length * 0.18 + (rng.next() - 0.5) * S * 0.7;
      put(x, y, S * (0.3 + 0.8 * t) * (0.6 + 0.55 * rng.next()), x, y + S * 0.4);
      // a second, higher row over the fuller part
      if (t > 0.4 && rng.next() < 0.7)
        put(
          x + (rng.next() - 0.5) * S * 0.6,
          y - S * (0.5 + 0.4 * t),
          S * (0.25 + 0.6 * t) * (0.6 + 0.5 * rng.next()),
          x,
          y + S * 0.4,
        );
    }
  } else if (p.form === 'mushroom') {
    // the stem shoots up and decelerates (fast in, long ease out)
    const grow = easeOutCubic(clamp01(age / 0.5));
    column(p.length * grow, Math.max(4, Math.ceil(p.length / (S * 0.45))), 0.2, false);
    for (const l of home) l.r *= 0.55; // the stem lumps stay thin
    cluster(0, -p.length * grow, Math.max(3, p.lumps), 0.6 + 0.6 * grow);
  } else cluster(0, 0, p.lumps, 1);

  // ── break-up order: 0 = breaks first ──
  let cx = 0;
  let cy = 0;
  for (const h of home) {
    cx += h.x / home.length;
    cy += h.y / home.length;
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let maxD = 1e-6;
  for (const h of home) {
    x0 = Math.min(x0, h.x);
    x1 = Math.max(x1, h.x);
    y0 = Math.min(y0, h.y);
    y1 = Math.max(y1, h.y);
    maxD = Math.max(maxD, Math.hypot(h.x - cx, h.y - cy));
  }
  const nx = (/** @type {number} */ x) => (x1 > x0 ? (x - x0) / (x1 - x0) : 0.5);
  const ny = (/** @type {number} */ y) => (y1 > y0 ? (y - y0) / (y1 - y0) : 0.5);
  const isLoop = p.form === 'column';
  // roll: fast at first, slowing as the smoke loses energy (loops: steady, whole turns)
  const Tr = 1.1;
  const rollPhase = isLoop
    ? TAU * loopRate(p.rollSpeed) * seconds
    : TAU * p.rollSpeed * Tr * (1 - Math.exp(-seconds / Tr));
  const spreadOut = 1 + p.drift * easeOutQuad(clamp01(age));
  const grownMore = 1 + p.expand * easeOutQuad(clamp01(age));

  /** @type {Lump[]} */
  const lumps = [];
  for (const h of home) {
    const dist = Math.hypot(h.x - cx, h.y - cy) / maxD;
    const jit = (rng.next() - 0.5) * 0.3;
    const ord =
      p.order === 'bottom'
        ? 1 - ny(h.y)
        : p.order === 'top'
          ? ny(h.y)
          : p.order === 'left'
            ? nx(h.x)
            : p.order === 'right'
              ? 1 - nx(h.x)
              : p.order === 'random'
                ? rng.next()
                : 1 - dist;
    const order = clamp01(ord * 0.8 + 0.1 + jit);
    // born: core first for "edges", otherwise in the break-up order (oldest breaks first)
    const birth = (p.order === 'edges' ? clamp01(dist + jit * 0.5) : order) * p.build;
    const ph = rng.next();
    const k = 1 + 0.07 * Math.sin(TAU * (boil + ph));
    const holes = [0, 1].map((j) => {
      const ha = rng.next() * TAU;
      const hd = 0.2 + 0.45 * rng.next();
      // about a third of the lumps never get a first hole; the second one is rarer and later
      // the core always gets its first hole (it is the last to go and must break, not just shrink)
      const keep = rng.next() < (j === 0 ? (dist < 0.3 ? 2 : 0.65) : 0.4);
      return {
        hx: Math.cos(ha) * hd,
        hy: Math.sin(ha) * hd,
        hs: keep ? (j === 0 ? 0.7 + 0.6 * rng.next() : 0.4 + 0.4 * rng.next()) : 0,
        delay: (j === 0 ? 0 : 0.12) + rng.next() * 0.18,
      };
    });
    const rollR = p.roll * h.r * 0.35;
    const ga = Math.atan2(h.y - h.gy, h.x - h.gx);
    const sgn = h.x >= h.gx ? 1 : -1;
    const rr = rng.next();
    // loops keep whole turns (an offset per lump); one-shots vary the speed per lump
    const lumpRoll = isLoop ? rollPhase + rr * TAU : rollPhase * (0.75 + 0.5 * rr);
    const rx = rollR * (Math.cos(ga + sgn * lumpRoll) - Math.cos(ga));
    const ry = rollR * (Math.sin(ga + sgn * lumpRoll) - Math.sin(ga));
    const outward = Math.hypot(h.x - cx, h.y - cy) || 1;
    const edge = dist > 0.35 ? smooth((dist - 0.35) / 0.4) : 0;

    if (h.ownAge >= 0) {
      // column lumps: their height is their age (with a little overlap jitter)
      lumps.push({
        x: h.x + rx,
        y: h.y + ry,
        r: h.r * k,
        age: clamp01(h.ownAge + jit * p.stagger * 0.5),
        holes,
        nx: h.x >= h.gx ? 1 : -1,
        ny: 0,
        bite: h.ownAge > 0.45 ? 0.6 : 0,
      });
      continue;
    }
    if (age < birth) continue;
    const g = easeOutBack(clamp01((age - birth) / Math.max(0.01, p.pop)));
    // each lump runs the holes / shrink curves on its own, staggered clock
    const own = clamp01((age - order * p.stagger) / Math.max(0.05, 1 - p.stagger));
    const push = (0.45 + 0.55 * Math.min(1, g)) * spreadOut;
    lumps.push({
      x: cx + (h.x - cx) * push + rx,
      y: cy + (h.y - cy) * push + ry,
      r: h.r * g * grownMore * k,
      age: own,
      holes,
      nx: (h.x - cx) / outward,
      ny: (h.y - cy) / outward,
      bite: edge,
    });
  }

  /** droplets pinch off breaking lumps, fly out decelerating and shrink away */
  const drops = [];
  if (p.droplets > 0 && !isLoop && lumps.length) {
    const outer = lumps.filter((l) => l.bite > 0);
    const from = outer.length ? outer : lumps;
    for (let i = 0; i < p.droplets; i++) {
      const l = from[Math.floor(rng.next() * from.length)];
      const t0 = 0.3 + 0.3 * rng.next();
      const spin = (rng.next() - 0.5) * 1.2;
      const size = 0.08 + 0.1 * rng.next();
      const u = (l.age - t0) / (1 - t0);
      if (u <= 0 || u >= 1) continue;
      const a = Math.atan2(l.ny, l.nx) + spin;
      const d = l.r * (0.8 + 1.8 * easeOutCubic(u));
      drops.push({
        x: l.x + Math.cos(a) * d,
        y: l.y + Math.sin(a) * d - easeOutQuad(u) * S * 0.4,
        r: S * size * (1 - u) ** 0.7,
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
  // each lump's current radius, holes and edge bite — on its own clock
  const live = lumps
    .map((l) => {
      const shrink = Math.min(1, Math.max(0, p.shrink ? evalCurve(p.shrink, l.age) : 0));
      const r = l.r * (1 - shrink);
      const holes = l.holes.map((h) => ({
        x: l.x + h.hx * r,
        y: l.y + h.hy * r,
        // capped so a lump never becomes a lone donut: big holes break through the edge instead
        r: Math.min(
          0.62 * r + 0.25 * l.r,
          Math.max(0, p.holes ? evalCurve(p.holes, Math.max(0, l.age - h.delay)) : 0) * l.r * h.hs,
        ),
      }));
      const bite = l.bite * p.bite * smooth((l.age - 0.25) / 0.6);
      return { ...l, r, holes, biteR: bite * r * 0.95 };
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
  // 3) holes grow inside the lumps and bites eat the outside: it breaks apart without fading
  x.globalCompositeOperation = 'destination-out';
  x.beginPath();
  for (const l of live) {
    for (const h of l.holes) {
      if (h.r < l.r * 0.12) continue;
      x.moveTo(h.x + h.r, h.y);
      x.arc(h.x, h.y, h.r, 0, TAU);
    }
    if (l.biteR > l.r * 0.12) {
      const bx = l.x + l.nx * l.r * 1.05;
      const by = l.y + l.ny * l.r * 1.05;
      x.moveTo(bx + l.biteR, by);
      x.arc(bx, by, l.biteR, 0, TAU);
    }
  }
  x.fill();
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(c, 0, 0, W, H, x0, y0, bw, bh);
}
