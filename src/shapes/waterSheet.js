// @ts-check
/**
 * Water sheets (D-101b), after Raul's references:
 * - Splash crown (`crown.*`): the cup-shaped wall of water thrown up around an impact (the
 *   Z_B splash) or boiling at the foot of a waterfall. Seen in perspective: a darker back wall,
 *   a dark crater, a lighter front wall with a white lip and streaks; the rim is ragged and
 *   rises into uneven spiky petals. Splash mode: shoots up (fast, easing out), hangs, then
 *   collapses faster and faster while the rim spreads. Boil mode: petals keep re-forming, each
 *   on its own cycle (seamless loops) — the waterfall impacts.
 * - Water column (`col.*`): a stream (waterfall, geyser) made of light and dark streaks racing
 *   along it, torn ragged edges and a spiky end; its reach can grow and collapse over the life.
 */

import { toCss } from '../core/color.js';
import { evalCurve } from '../core/curve.js';
import { hash32 } from '../core/hash.js';
import { loopPeriod, loopRate } from '../core/loopContext.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition, readStyle } from '../render/style.js';

const TAU = Math.PI * 2;
const clamp01 = (/** @type {number} */ t) => Math.min(1, Math.max(0, t));
/** deterministic 0–1 @param {number} seed @param {number} a @param {number} [b] */
const rnd = (seed, a, b = 0) => hash32(seed, a, b, 77) / 4294967296;

/** @param {string} group @param {string} prefix */
const num =
  (group, prefix) =>
  (
    /** @type {string} */ id,
    /** @type {string} */ label,
    /** @type {number} */ min,
    /** @type {number} */ max,
    /** @type {number} */ step,
    /** @type {number} */ def,
    tooltip = '',
    unit = '',
  ) => ({
    id: `${prefix}.${id}`,
    label,
    group,
    type: 'float',
    min,
    max,
    step,
    default: def,
    ...(unit ? { unit } : {}),
    ...(tooltip ? { tooltip } : {}),
  });

// ── Splash crown ─────────────────────────────────────────────────────────────────────────────

const CG = 'Splash crown';
const cn = num(CG, 'crown');
/** Splash crown parameters (ids `crown.*`). */
export const CROWN_PARAMS = [
  {
    id: 'crown.mode',
    label: 'Mode',
    group: CG,
    type: 'enum',
    options: [
      { value: 'splash', label: 'Splash (rises, hangs, collapses)' },
      { value: 'boil', label: 'Boil (keeps re-forming — waterfall foot, loops)' },
    ],
    default: 'splash',
  },
  {
    id: 'crown.part',
    label: 'Draw',
    group: CG,
    type: 'enum',
    options: [
      { value: 'all', label: 'Whole crown' },
      { value: 'back', label: 'Back wall only (put it behind a stream)' },
      { value: 'front', label: 'Front wall only (put it in front of a stream)' },
    ],
    default: 'all',
    tooltip: 'Split the crown around a waterfall or geyser: two layers with the same seed',
  },
  cn('radius', 'Radius', 4, 600, 1, 70, 'Half width of the crown at the water', 'px'),
  cn('height', 'Height', 2, 800, 1, 110, 'How high the wall and petals go', 'px'),
  cn('flare', 'Flare', 0, 2, 0.01, 0.55, 'How much the rim opens outward'),
  cn('flatten', 'Perspective', 0.05, 1, 0.01, 0.32, 'Height of the base ellipse (1 = from above)'),
  { id: 'crown.petals', label: 'Petals', group: CG, type: 'int', min: 3, max: 40, default: 11 },
  cn('spike', 'Spikiness', 0, 1, 0.01, 0.65, 'Tall pointed petals vs. a smooth wall'),
  cn('ragged', 'Ragged rim', 0, 1, 0.01, 0.5, 'Torn, uneven edge'),
  cn('rise', 'Rise time', 0.02, 0.8, 0.01, 0.16, 'Splash: up to full height (× life)'),
  cn('hang', 'Hang', 0, 0.6, 0.01, 0.08, 'Splash: holds at the top'),
  cn('fall', 'Collapse time', 0.02, 0.9, 0.01, 0.3, 'Splash: falls back, faster and faster'),
  cn(
    'boilRate',
    'Boil speed',
    0.1,
    20,
    0.1,
    5,
    'Boil: petal re-forms per second (loops: whole cycles)',
    '/s',
  ),
  cn('streaks', 'Streaks', 0, 1, 0.01, 0.6, 'White streaks running up the front wall'),
  cn('backTone', 'Back wall colour', 0, 1, 0.01, 0.55, 'Position on the ramp'),
  cn('frontTone', 'Front wall colour', 0, 1, 0.01, 0.25, 'Position on the ramp'),
  cn('lipTone', 'Lip colour', 0, 1, 0.01, 0, 'Position on the ramp'),
  cn('craterTone', 'Crater colour', 0, 1, 0.01, 0.85, 'Position on the ramp'),
];
/** @param {Record<string, any>} v */
export const readCrown = (v) => ({
  mode: v['crown.mode'] ?? 'splash',
  part: v['crown.part'] ?? 'all',
  radius: v['crown.radius'] ?? 70,
  height: v['crown.height'] ?? 110,
  flare: v['crown.flare'] ?? 0.55,
  flatten: v['crown.flatten'] ?? 0.32,
  petals: v['crown.petals'] ?? 11,
  spike: v['crown.spike'] ?? 0.65,
  ragged: v['crown.ragged'] ?? 0.5,
  rise: v['crown.rise'] ?? 0.16,
  hang: v['crown.hang'] ?? 0.08,
  fall: v['crown.fall'] ?? 0.3,
  boilRate: v['crown.boilRate'] ?? 5,
  streaks: v['crown.streaks'] ?? 0.6,
  backTone: v['crown.backTone'] ?? 0.55,
  frontTone: v['crown.frontTone'] ?? 0.25,
  lipTone: v['crown.lipTone'] ?? 0,
  craterTone: v['crown.craterTone'] ?? 0.85,
});

/**
 * Crown geometry at a moment. Pure; exported for tests.
 * @param {ReturnType<typeof readCrown>} p @param {number} seed @param {number} age 0–1
 * @param {number} seconds
 * @returns {{ H: number, Rt: number, Rb: number, top: (th: number) => number, tips: { th: number, x: number, y: number, r: number }[] }}
 *   H: wall height now, Rt / Rb: rim / base radius, top(θ): rim height at angle θ
 */
export function crownShape(p, seed, age, seconds) {
  const n = Math.max(3, Math.round(p.petals));
  let H = p.height;
  let open = 1;
  /** per-petal height scale now (boil: each on its own cycle) */
  let petalH = (/** @type {number} */ i) => 0.55 + 0.45 * rnd(seed, i);
  let petalPhase = (/** @type {number} */ i) => rnd(seed, i, 1);
  if (p.mode === 'splash') {
    const u = age;
    const up = clamp01(u / p.rise);
    const down = clamp01((u - p.rise - p.hang) / p.fall);
    // fast up to most of the height, keeps creeping up while it hangs, then falls faster and
    // faster — never a frozen hold
    const hang = clamp01((u - p.rise) / Math.max(0.01, p.hang + p.fall * 0.3));
    H =
      p.height *
      (0.86 * (1 - (1 - up) ** 3) + 0.14 * Math.sin((hang * Math.PI) / 2)) *
      (1 - down * down);
    open = Math.min(1, u / Math.max(0.01, p.rise + p.hang + p.fall));
  } else {
    // boil: each petal swells and drops on its own cycle; a new random shape every cycle
    const period = loopPeriod();
    const rate = loopRate((p.boilRate / Math.max(1, n)) * 3);
    const perLoop = period > 0 ? Math.max(1, Math.round(rate * period)) : 0;
    petalH = (i) => {
      const f = rate * seconds + rnd(seed, i, 2);
      const cyc = Math.floor(f);
      const k = perLoop ? ((cyc % perLoop) + perLoop) % perLoop : cyc;
      const ph = f - cyc;
      return (0.35 + 0.65 * rnd(seed, i, 10 + k)) * Math.sin(Math.PI * ph) ** 0.7;
    };
    petalPhase = (i) => {
      const f = rate * seconds + rnd(seed, i, 2);
      const cyc = Math.floor(f);
      const k = perLoop ? ((cyc % perLoop) + perLoop) % perLoop : cyc;
      return rnd(seed, i, 100 + k);
    };
    open = 0.5;
  }
  const Rb = p.radius * (p.mode === 'splash' ? 1 + 0.35 * open : 1);
  const Rt = Rb * (1 + p.flare * (p.mode === 'splash' ? 0.4 + 0.6 * open : 0.6));
  // splash: petals rise one after another (staggered), each to its own height
  const stagger = (/** @type {number} */ i) =>
    p.mode === 'splash'
      ? clamp01((age - rnd(seed, i, 4) * p.rise * 0.6) / Math.max(0.01, p.rise)) ** 0.6
      : 1;
  // splash petals keep moving: each grows a little longer and thinner, fluttering
  const flutter = (/** @type {number} */ i) =>
    p.mode === 'splash'
      ? 1 +
        0.12 * Math.sin(TAU * (age * 3.2 + rnd(seed, i, 7))) +
        0.25 * clamp01(age / (p.rise + p.hang + 0.01))
      : 1;
  const petals = Array.from({ length: n }, (_, i) => ({
    th: ((i + 0.5 + (petalPhase(i) - 0.5) * 0.6) / n) * TAU,
    w:
      ((0.45 + 0.5 * rnd(seed, i, 3)) * (TAU / n)) /
      (p.mode === 'splash' ? 0.8 + 0.4 * flutter(i) : 1),
    h: petalH(i) * stagger(i) * flutter(i),
  }));
  const rag = [3, 7, 13].map((k, j) => ({ k, ph: rnd(seed, 50 + j) * TAU }));
  const top = (/** @type {number} */ th) => {
    let pk = 0;
    for (const q of petals) {
      let d = Math.abs(th - q.th) % TAU;
      if (d > Math.PI) d = TAU - d;
      const v = Math.max(0, 1 - d / q.w);
      pk = Math.max(pk, q.h * v ** (1 + 2 * p.spike));
    }
    const wall = 1 - p.spike * 0.6;
    let h = Math.max(wall * 0.6, pk) * H;
    h *= 1 + (p.ragged * 0.18 * rag.reduce((s, q) => s + Math.sin(q.k * th + q.ph), 0)) / 3;
    return Math.max(0, h);
  };
  /**
   * Splash: each tall petal grows a round drop at its tip (the milk-crown look); it pinches
   * off near the top of the rise, flies on and falls. θ, x, y, r (relative to the crown).
   * @type {{ th: number, x: number, y: number, r: number }[]}
   */
  const tips = [];
  if (p.mode === 'splash') {
    for (let i = 0; i < n; i++) {
      const q = petals[i];
      if (petalH(i) < 0.62) continue;
      const tDet = p.rise * (0.8 + 0.5 * rnd(seed, i, 5));
      const r0 = p.radius * (0.05 + 0.05 * rnd(seed, i, 6)) * (1 + p.spike);
      const atTip = (/** @type {number} */ u) => {
        const up = clamp01(u / p.rise);
        const Hh = p.height * (1 - (1 - up) ** 3);
        const op = Math.min(1, u / Math.max(0.01, p.rise + p.hang + p.fall));
        const rb = p.radius * (1 + 0.35 * op);
        const rt = rb * (1 + p.flare * (0.4 + 0.6 * op));
        return [Math.cos(q.th) * rt, Math.sin(q.th) * rt * p.flatten - Hh * q.h];
      };
      if (age <= tDet) {
        const [x, y] = atTip(age);
        tips.push({ th: q.th, x, y, r: r0 * clamp01(age / (p.rise * 0.5)) });
      } else {
        const [x0, y0] = atTip(tDet);
        const dt = age - tDet;
        const v = (p.height * 1.4) / Math.max(0.05, p.rise);
        const g = (2 * v) / Math.max(0.05, p.hang + p.fall * 0.6);
        tips.push({
          th: q.th,
          x: x0 * (1 + dt * 1.2 * p.flare),
          y: y0 - v * dt + 0.5 * g * dt * dt,
          r: r0 * (1 - 0.6 * clamp01(dt / 0.4)),
        });
      }
    }
  }
  return { H, Rt, Rb, top, tips };
}

/**
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, ageS?: number, seed?: number }} inst @param {{ seconds?: number }} frame
 */
export function drawCrown(ctx, params, inst, frame) {
  const p = readCrown(params);
  const style = readStyle(params);
  const age = inst.age ?? 0;
  const seconds = inst.ageS ?? frame.seconds ?? 0;
  const seed = inst.seed ?? 0;
  const base = corePosition(style, age);
  const tone = (/** @type {number} */ t) => toCss(sampleRamp(style.ramp, Math.min(1, base + t)));
  const { H, Rt, Rb, top, tips } = crownShape(p, seed, age, seconds);
  const drawTips = (/** @type {boolean} */ front) => {
    for (const t of tips) {
      if (Math.sin(t.th) >= 0 !== front || t.r < 0.4) continue;
      ctx.fillStyle = tone(front ? p.frontTone : p.backTone);
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = tone(p.lipTone);
      ctx.beginPath();
      ctx.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.32, 0, TAU);
      ctx.fill();
    }
  };
  if (H < 0.5) {
    drawTips(false);
    drawTips(true);
    return;
  }
  const f = p.flatten;
  const N = 96;
  const B = (/** @type {number} */ th) => [Math.cos(th) * Rb, Math.sin(th) * Rb * f];
  const T = (/** @type {number} */ th) => [Math.cos(th) * Rt, Math.sin(th) * Rt * f - top(th)];
  const wall = (/** @type {number} */ a, /** @type {number} */ b) => {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const [x, y] = B(a + ((b - a) * i) / N);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const [x, y] = T(a + ((b - a) * i) / N);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  const back = p.part !== 'front';
  const front = p.part !== 'back';
  // back wall (far side, sin < 0), then the crater, then the front wall
  if (back) {
    drawTips(false);
    ctx.fillStyle = tone(p.backTone);
    wall(Math.PI, TAU);
    ctx.fill();
  }
  // the crater closes as the wall falls back
  const cr = clamp01(H / (p.height * 0.45));
  if (cr > 0.02 && p.mode === 'splash' && back) {
    ctx.fillStyle = tone(p.craterTone);
    ctx.beginPath();
    ctx.ellipse(0, 0, Rb * 0.96 * (0.4 + 0.6 * cr), Rb * f * 0.96 * cr, 0, 0, TAU);
    ctx.fill();
  }
  if (!front) {
    // the back rim's light edge still belongs to the back part
    ctx.strokeStyle = tone(p.lipTone * 0.5 + p.frontTone * 0.5);
    ctx.lineWidth = Math.max(0.8, H * 0.025);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const [x, y] = T(Math.PI + (Math.PI * i) / N);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    return;
  }
  ctx.fillStyle = tone(p.frontTone);
  wall(0, Math.PI);
  ctx.fill();
  // cel band: the lower part of the front wall is a shade darker
  ctx.save();
  wall(0, Math.PI);
  ctx.clip();
  ctx.fillStyle = tone((p.frontTone + p.backTone) / 2);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (Math.PI * i) / N;
    const [bx, by] = B(th);
    const [tx, ty] = T(th);
    const k = 0.42 + 0.08 * Math.sin(7 * th + seed);
    if (i === 0) ctx.moveTo(bx + (tx - bx) * k, by + (ty - by) * k);
    else ctx.lineTo(bx + (tx - bx) * k, by + (ty - by) * k);
  }
  ctx.lineTo(Rb * -1.2, Rb * f * 1.5);
  ctx.lineTo(Rb * 1.2, Rb * f * 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // white lip along the front rim, thicker at the front
  ctx.fillStyle = tone(p.lipTone);
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const [x, y] = T((Math.PI * i) / N);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let i = N; i >= 0; i--) {
    const th = (Math.PI * i) / N;
    const [x, y] = T(th);
    ctx.lineTo(x, y + Math.max(1, H * 0.09) * (0.4 + 0.6 * Math.sin(th)));
  }
  ctx.closePath();
  ctx.fill();
  // a thin light edge on the back rim too
  if (back) {
    ctx.strokeStyle = tone(p.lipTone * 0.5 + p.frontTone * 0.5);
    ctx.lineWidth = Math.max(0.8, H * 0.025);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const [x, y] = T(Math.PI + (Math.PI * i) / N);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // streaks running up the front wall
  if (p.streaks > 0) {
    const n = Math.round(4 + 10 * p.streaks);
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const th = 0.15 + rnd(seed, 200 + i) * (Math.PI - 0.3);
      const [bx, by] = B(th);
      const [tx, ty] = T(th);
      const a = 0.25 + 0.3 * rnd(seed, 300 + i);
      const b = a + 0.25 + 0.35 * rnd(seed, 400 + i);
      ctx.strokeStyle = tone(p.lipTone);
      ctx.lineWidth = Math.max(0.6, H * 0.018 * (0.6 + rnd(seed, 500 + i)));
      ctx.beginPath();
      ctx.moveTo(bx + (tx - bx) * a, by + (ty - by) * a);
      ctx.lineTo(bx + (tx - bx) * b, by + (ty - by) * b);
      ctx.stroke();
    }
  }
  drawTips(true);
}

// ── Water column ─────────────────────────────────────────────────────────────────────────────

const WG = 'Water column';
const wn = num(WG, 'col');
/** Water column parameters (ids `col.*`). */
export const COLUMN_PARAMS = [
  wn('length', 'Length', 10, 1600, 1, 400, 'How far the stream reaches', 'px'),
  wn('width', 'Width', 2, 400, 1, 46, 'Half width at its base', 'px'),
  wn('taper', 'Taper', -1, 1, 0.01, 0.15, 'Narrower toward the end (negative: wider)'),
  {
    id: 'col.flow',
    label: 'Flows',
    group: WG,
    type: 'enum',
    options: [
      { value: 'up', label: 'Up (geyser, fountain)' },
      { value: 'down', label: 'Down (waterfall)' },
    ],
    default: 'down',
  },
  wn(
    'speed',
    'Streak speed',
    0,
    12,
    0.05,
    2.5,
    'Streak cycles per second (loops: whole cycles)',
    '/s',
  ),
  { id: 'col.streaks', label: 'Streaks', group: WG, type: 'int', min: 0, max: 24, default: 8 },
  wn('ragged', 'Torn edges', 0, 1, 0.01, 0.5, 'Ragged, flickering sides'),
  wn('spikes', 'Spiky end', 0, 1, 0.01, 0.6, 'The leading end tears into points'),
  {
    id: 'col.reach',
    label: 'Reach over life',
    group: WG,
    type: 'curve',
    yMin: 0,
    yMax: 1,
    default: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
    tooltip: 'How much of the length is there (geyser: grows, then falls back)',
  },
  wn('bodyTone', 'Body colour', 0, 1, 0.01, 0.3, 'Position on the ramp'),
  wn('lightTone', 'Light streaks', 0, 1, 0.01, 0, 'Position on the ramp'),
  wn('darkTone', 'Dark streaks', 0, 1, 0.01, 0.6, 'Position on the ramp'),
];
/** @param {Record<string, any>} v */
export const readColumn = (v) => ({
  length: v['col.length'] ?? 400,
  width: v['col.width'] ?? 46,
  taper: v['col.taper'] ?? 0.15,
  flow: v['col.flow'] ?? 'down',
  speed: v['col.speed'] ?? 2.5,
  streaks: v['col.streaks'] ?? 8,
  ragged: v['col.ragged'] ?? 0.5,
  spikes: v['col.spikes'] ?? 0.6,
  reach: v['col.reach'],
  bodyTone: v['col.bodyTone'] ?? 0.3,
  lightTone: v['col.lightTone'] ?? 0,
  darkTone: v['col.darkTone'] ?? 0.6,
});

/**
 * Draw the column from its base at the origin, along −y (it is rotated by the layer).
 * Flow 'down' means the water travels from the far end toward the origin… we keep one model:
 * the column always starts at the origin and reaches `length` toward −y; streaks move away
 * from the origin for 'up' and toward it for 'down'.
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, ageS?: number, seed?: number }} inst @param {{ seconds?: number }} frame
 */
export function drawColumn(ctx, params, inst, frame) {
  const p = readColumn(params);
  const style = readStyle(params);
  const age = inst.age ?? 0;
  const seconds = inst.ageS ?? frame.seconds ?? 0;
  const seed = inst.seed ?? 0;
  const reach = clamp01(p.reach ? evalCurve(p.reach, age) : 1);
  const L = p.length * reach;
  if (L < 1) return;
  const base = corePosition(style, age);
  const tone = (/** @type {number} */ t) => toCss(sampleRamp(style.ramp, Math.min(1, base + t)));
  const cyc = loopRate(p.speed) * seconds; // streak cycles so far (whole per loop)
  const dir = p.flow === 'up' ? 1 : -1;
  const half = (/** @type {number} */ v) => p.width * (1 - p.taper * v);
  // ragged sides: noise that flows with the water
  const edge = (/** @type {number} */ v, /** @type {number} */ side) => {
    const s = v * 6 - dir * cyc * 2;
    return (
      p.ragged *
      p.width *
      0.22 *
      (Math.sin(TAU * (s * 0.9 + rnd(seed, side))) * 0.6 +
        Math.sin(TAU * (s * 2.3 + rnd(seed, side, 1))) * 0.4)
    );
  };
  const M = 60;
  /** @type {[number, number][]} */
  const left = [];
  /** @type {[number, number][]} */
  const right = [];
  for (let i = 0; i <= M; i++) {
    const v = i / M;
    const y = -v * L;
    left.push([-half(v) - edge(v, 0), y]);
    right.push([half(v) + edge(v, 1), y]);
  }
  // spiky leading end
  const tipN = 5;
  /** @type {[number, number][]} */
  const tip = [];
  for (let k = 0; k <= tipN; k++) {
    const x = right[M][0] + ((left[M][0] - right[M][0]) * k) / tipN;
    const spike =
      k % 2 === 1 ? p.spikes * p.width * (0.5 + 0.8 * rnd(seed, 600 + k, Math.floor(cyc * 2))) : 0;
    tip.push([x, -L - spike]);
  }
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of right) ctx.lineTo(x, y);
    for (const [x, y] of tip) ctx.lineTo(x, y);
    for (let i = left.length - 1; i >= 0; i--) ctx.lineTo(left[i][0], left[i][1]);
    ctx.closePath();
  };
  ctx.save();
  body();
  ctx.fillStyle = tone(p.bodyTone);
  ctx.fill();
  ctx.clip();
  // streaks: dashes of light / dark racing along the column, seamless (whole cycles)
  const n = Math.round(p.streaks);
  for (let b = 0; b < n; b++) {
    const light = b % 3 !== 2;
    const lane = (b + 0.5) / n - 0.5 + ((rnd(seed, 700 + b) - 0.5) * 0.4) / Math.max(1, n);
    const wv = (0.25 + 0.5 * rnd(seed, 800 + b)) * (1.6 / Math.max(1, n));
    const P = 0.35 + 0.4 * rnd(seed, 900 + b); // dash spacing (× length)
    const speedK = 0.8 + 0.6 * rnd(seed, 950 + b);
    ctx.fillStyle = tone(light ? p.lightTone : p.darkTone);
    const turns = dir * cyc * Math.max(1, Math.round(speedK * 2));
    const shift = (((turns % 1) + 1) % 1) * P;
    for (let k = -2; k < 1 / P + 2; k++) {
      const v0 = (k + rnd(seed, b, k & 7) * 0.4) * P + shift;
      const v1 = v0 + P * (0.35 + 0.45 * rnd(seed, b + 50, k & 7));
      if (v1 < 0 || v0 > 1.1) continue;
      ctx.beginPath();
      const S = 8;
      for (let s = 0; s <= S; s++) {
        const v = v0 + ((v1 - v0) * s) / S;
        const taper = Math.sin((Math.PI * s) / S);
        const x = lane * 2 * half(clamp01(v)) - wv * half(clamp01(v)) * taper;
        if (s === 0) ctx.moveTo(x, -v * L);
        else ctx.lineTo(x, -v * L);
      }
      for (let s = S; s >= 0; s--) {
        const v = v0 + ((v1 - v0) * s) / S;
        const taper = Math.sin((Math.PI * s) / S);
        ctx.lineTo(lane * 2 * half(clamp01(v)) + wv * half(clamp01(v)) * taper, -v * L);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}
