// @ts-check
/**
 * Water building blocks (D-101), after Raul's water references (a cartoon drop-impact with a
 * collapsing lip and a Worthington jet, liquid "2" motion graphics, a jet breaking into drops,
 * waterfall impacts, a caustic orb). The fluid rules they follow:
 *   • water has weight: everything follows arcs; fast going up, hangs at the top, falls fast;
 *   • volume is kept: stretching makes it thinner; thin water necks and pinches into drops;
 *   • surface tension: ends are always round, pinched pieces pull into round drops;
 *   • drops are stretched by their speed and round at the top of their arc;
 *   • cel shading: a body tone, a darker shade on the side away from the light, a white
 *     highlight on the lit side.
 *
 * - Water drop (`drop.*`): one drop, stretched along its motion by its speed (particles
 *   aligned to their motion), teardrop tail when fast, round when slow.
 * - Liquid jet (`jet.*`): a column shot up from its base; the material keeps its launch speed
 *   under gravity, so the column stretches and thins; a varicose wave grows on it until it
 *   pinches into drops of mixed sizes that round up, scatter a little and fall back.
 */

import { toCss } from '../core/color.js';
import { createRng } from '../core/prng.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition, readStyle } from '../render/style.js';
import { scratch } from './celFlame.js';

const TAU = Math.PI * 2;
const clamp01 = (/** @type {number} */ t) => Math.min(1, Math.max(0, t));
const smooth = (/** @type {number} */ t) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

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

/** Shading settings shared by drops and jets (ids under the given prefix). @param {string} g @param {string} pre */
const shadingParams = (g, pre) => {
  const n = num(g, pre);
  return [
    n('shade', 'Shade', 0, 1, 0.01, 0.4, 'Darker side away from the light'),
    n('highlight', 'Highlight', 0, 1, 0.01, 0.8, 'White highlight on the lit side'),
    n('light', 'Light from', 0, 360, 1, 315, '0 = right, 270 = above, 315 = top-right', '°'),
    n('bodyTone', 'Body colour', 0, 1, 0.01, 0.3, 'Position on the ramp'),
    n('shadeTone', 'Shade colour', 0, 1, 0.01, 0.55, 'Position on the ramp'),
    n('highlightTone', 'Highlight colour', 0, 1, 0.01, 0, 'Position on the ramp'),
  ];
};
/** @param {Record<string, any>} v @param {string} pre */
const readShading = (v, pre) => ({
  shade: v[`${pre}.shade`] ?? 0.4,
  highlight: v[`${pre}.highlight`] ?? 0.8,
  light: ((v[`${pre}.light`] ?? 315) * Math.PI) / 180,
  bodyTone: v[`${pre}.bodyTone`] ?? 0.3,
  shadeTone: v[`${pre}.shadeTone`] ?? 0.55,
  highlightTone: v[`${pre}.highlightTone`] ?? 0,
});

// ── Water drop ───────────────────────────────────────────────────────────────────────────────

const DG = 'Water drop';
const dn = num(DG, 'drop');
/** Water drop parameters (ids `drop.*`). */
export const DROP_PARAMS = [
  dn('size', 'Size', 1, 200, 0.5, 10, 'Radius of a round drop', 'px'),
  dn(
    'stretch',
    'Speed stretch',
    0,
    3,
    0.01,
    1,
    'How much speed stretches the drop (0 = always round)',
  ),
  dn('tail', 'Tail', 0, 2, 0.01, 0.6, 'Fast drops pull a tail behind them (with a round end)'),
  ...shadingParams(DG, 'drop'),
];
/** @param {Record<string, any>} v */
export const readDrop = (v) => ({
  size: v['drop.size'] ?? 10,
  stretch: v['drop.stretch'] ?? 1,
  tail: v['drop.tail'] ?? 0.6,
  ...readShading(v, 'drop'),
});

/**
 * Drop outline: round head toward +x (the direction of motion), tail toward −x. Volume is
 * kept: longer = thinner. `e` = stretch factor (1 = round).
 * @param {CanvasRenderingContext2D} x @param {number} r @param {number} e @param {number} tail
 * @param {number} [dx] @param {number} [dy] @param {number} [k] scale
 */
export function dropPath(x, r, e, tail, dx = 0, dy = 0, k = 1) {
  const a = r * e * k; // half length
  const b = (r / Math.sqrt(e)) * k; // half width
  const cx = a - b + dx;
  const L = b + (a - b) * 1.6 + tail * (e - 1) * r * k; // head centre → tail tip
  const c = 0.5523;
  // D-103: the tail ends in a small round end (surface tension), never a point
  const rt = b * 0.28;
  const tip = cx - L + rt;
  if (L <= b * 1.05) {
    x.moveTo(cx, dy - b);
    x.arc(cx, dy, b, -Math.PI / 2, Math.PI * 1.5);
    return;
  }
  x.moveTo(cx, dy - b);
  x.arc(cx, dy, b, -Math.PI / 2, Math.PI / 2);
  x.bezierCurveTo(cx - (cx - tip) * c, dy + b, tip + rt * 0.5, dy + rt, tip, dy + rt);
  x.arc(tip, dy, rt, Math.PI / 2, Math.PI * 1.5);
  x.bezierCurveTo(tip + rt * 0.5, dy - rt, cx - (cx - tip) * c, dy - b, cx, dy - b);
  x.closePath();
}

/**
 * Draw one drop (aligned so +x is its motion when particles align to velocity).
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, rotation?: number, speedRatio?: number }} inst
 */
export function drawDrop(ctx, params, inst) {
  const p = readDrop(params);
  const style = readStyle(params);
  const base = corePosition(style, inst.age ?? 0);
  const tone = (/** @type {number} */ t) => toCss(sampleRamp(style.ramp, Math.min(1, base + t)));
  const sr = Math.max(0, inst.speedRatio ?? 0);
  // D-103: stretched by speed, but a drop stays a drop (never a needle)
  const e = 1 + p.stretch * Math.min(1.4, sr) * 0.5;
  const r = p.size;
  // light in the drop's own (rotated) frame
  const la = p.light - (inst.rotation ?? 0);
  const lx = Math.cos(la);
  const ly = Math.sin(la);
  const b = r / Math.sqrt(e);
  ctx.beginPath();
  dropPath(ctx, r, e, p.tail);
  ctx.fillStyle = tone(p.shade > 0 ? p.shadeTone : p.bodyTone);
  ctx.fill();
  if (p.shade > 0) {
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    dropPath(ctx, r, e, p.tail, lx * b * p.shade * 0.7, ly * b * p.shade * 0.7, 1 - p.shade * 0.15);
    ctx.fillStyle = tone(p.bodyTone);
    ctx.fill();
    ctx.restore();
  }
  if (p.highlight > 0) {
    const cx = r * e - b;
    const hr = b * (0.18 + 0.22 * p.highlight);
    ctx.fillStyle = tone(p.highlightTone);
    ctx.beginPath();
    ctx.ellipse(
      cx + lx * b * 0.45,
      ly * b * 0.45,
      hr * 1.25,
      hr * 0.8,
      Math.atan2(ly, lx) + Math.PI / 2,
      0,
      TAU,
    );
    ctx.fill();
    if (b > 4) {
      ctx.beginPath();
      ctx.arc(cx + lx * b * 0.1 - ly * b * 0.45, ly * b * 0.1 + lx * b * 0.45, hr * 0.35, 0, TAU);
      ctx.fill();
    }
  }
}

// ── Liquid jet ───────────────────────────────────────────────────────────────────────────────

const JG = 'Liquid jet';
const jn = num(JG, 'jet');
/** Liquid jet parameters (ids `jet.*`). */
export const JET_PARAMS = [
  jn('height', 'Height', 10, 1200, 1, 300, 'How high the front of the jet goes', 'px'),
  jn('radius', 'Thickness', 1, 200, 0.5, 22, 'Radius at the base', 'px'),
  jn(
    'push',
    'Push time',
    0.02,
    0.9,
    0.01,
    0.3,
    'How long the base keeps pushing water up (× life)',
  ),
  jn(
    'apex',
    'Rise time',
    0.05,
    0.9,
    0.01,
    0.35,
    'When the front reaches the top (× life): it then hangs and falls',
  ),
  jn(
    'neck',
    'Necking',
    0,
    1,
    0.01,
    0.9,
    'How deep the waves on the column cut in (1 = pinches into drops)',
  ),
  jn(
    'wave',
    'Drop length',
    1,
    12,
    0.1,
    4.2,
    'Distance between pinches (× thickness): bigger = bigger drops',
  ),
  jn('breakStart', 'Break-up starts', 0, 1, 0.01, 0.2, 'When the waves start growing (× life)'),
  jn('breakTime', 'Break-up time', 0.02, 1, 0.01, 0.3, 'How long until it pinches'),
  jn('scatter', 'Scatter', 0, 400, 1, 60, 'Sideways spread of the pinched drops', 'px'),
  jn('lean', 'Lean', -1, 1, 0.01, 0, 'Tilts the jet'),
  jn('wobble', 'Wobble', 0, 1, 0.01, 0.6, 'Wavy, lumpy, uneven water (0 = a smooth straight tube)'),
  jn('satellites', 'Satellite drops', 0, 1, 0.01, 0.7, 'Tiny drops left where the water pinches'),
  jn(
    'shrink',
    'Shrink at the end',
    0,
    1,
    0.01,
    0.8,
    'Drops get smaller as they finish (like the reference)',
  ),
  ...shadingParams(JG, 'jet'),
];
/** @param {Record<string, any>} v */
export const readJet = (v) => ({
  height: v['jet.height'] ?? 300,
  radius: v['jet.radius'] ?? 22,
  push: v['jet.push'] ?? 0.3,
  apex: v['jet.apex'] ?? 0.35,
  neck: v['jet.neck'] ?? 0.9,
  wave: v['jet.wave'] ?? 4.2,
  breakStart: v['jet.breakStart'] ?? 0.2,
  breakTime: v['jet.breakTime'] ?? 0.3,
  scatter: v['jet.scatter'] ?? 60,
  lean: v['jet.lean'] ?? 0,
  wobble: v['jet.wobble'] ?? 0.6,
  satellites: v['jet.satellites'] ?? 0.7,
  shrink: v['jet.shrink'] ?? 0.8,
  ...readShading(v, 'jet'),
});

/**
 * The jet at life `age` (0–1): pieces of round blobs (circles), one array per piece of water.
 * Base at (0, 0), up is −y. Pure; exported for tests.
 *
 * D-101b (after the reference close up): the column is not a tube — it is lumpy and wavy;
 * pinches sit at uneven places and happen one after another; each freed piece gets its own
 * kick (they scatter like a cloud), rounds up, and leaves tiny satellite drops where it tore
 * off; at the end the drops shrink to dots.
 * @param {ReturnType<typeof readJet>} p @param {number} seed @param {number} age
 * @returns {{ pieces: { x: number, y: number, r: number }[][] }}
 */
export function jetShape(p, seed, age) {
  const rng = createRng(seed);
  const N = 140;
  const g = (2 * p.height) / (p.apex * p.apex); // front reaches `height` at `apex`
  const V0 = g * p.apex;
  const W = p.wobble;
  // the column's own irregularity: smooth noise along the material (3 harmonics)
  const hw = [1, 2.3, 4.1].map(() => ({ a: rng.next(), ph: rng.next() * TAU }));
  const lumpy = (/** @type {number} */ u) =>
    hw.reduce((v, q, k) => v + (q.a - 0.3) * Math.sin(TAU * u * (1.7 + 2.3 * k) + q.ph), 0) / 2;
  const wx = [rng.next() * TAU, rng.next() * TAU];
  // cuts along the material: uneven spacing, each pinches at its own moment
  const lamI = Math.max(5, (N * p.radius * p.wave) / Math.max(1, p.height * 1.6));
  /** @type {{ i: number, t: number, kx: number, ky: number }[]} */
  const cuts = [];
  for (let i = lamI * (0.4 + 0.5 * rng.next()); i < N - 2; i += lamI * (0.55 + 1.1 * rng.next())) {
    cuts.push({
      i,
      t: p.breakStart + p.breakTime * (0.35 + 0.65 * rng.next()),
      kx: rng.next() - 0.5,
      ky: rng.next() - 0.5,
    });
  }
  // D-103: water that left never comes back along its own path. Every bit of material keeps
  // its own launch velocity (a lean is a sideways speed, so leaning jets keep curving outward
  // as they fall); the slowest water still leaves the surface fast, and when the push ends the
  // base pinches off, so the column lifts free instead of sinking back into the water.
  const vxLean = p.lean * V0 * 0.5;
  /** material elements now */
  /** @type {{ i: number, x: number, y: number, r: number }[]} */
  const el = [];
  for (let i = 0; i < N; i++) {
    const tau = (i / (N - 1)) * p.push;
    if (age < tau) break;
    const s = 1 - tau / p.push;
    const v = V0 * (0.4 + 0.6 * s ** 0.8);
    const dt = age - tau;
    const h = v * dt - 0.5 * g * dt * dt;
    const u = i / N;
    // wavy centre line: the wave is in the material (grows with its age, never undone)
    const grow = 0.3 + Math.min(1, dt / Math.max(0.05, p.apex));
    const x =
      W *
        p.radius *
        (1.4 * Math.sin(TAU * u * 1.6 + wx[0] + age * 0.7) +
          0.6 * Math.sin(TAU * u * 3.7 + wx[1])) *
        grow +
      vxLean * dt;
    el.push({ i, x, y: -h, r: p.radius });
  }
  if (!el.length) return { pieces: [] };
  // stretched water is thinner (volume kept) + lumpy; the front gathers into a head
  const s0 = (V0 * p.push) / (N - 1);
  for (let k = 0; k < el.length; k++) {
    const a = el[Math.max(0, k - 1)];
    const b = el[Math.min(el.length - 1, k + 1)];
    const gap = Math.max(
      1e-3,
      Math.hypot(a.y - b.y, a.x - b.x) / (k > 0 && k < el.length - 1 ? 2 : 1),
    );
    let r = p.radius * Math.min(1.4, Math.max(0.5, Math.sqrt((s0 * 0.7) / gap)));
    r *= 1 + 0.45 * Math.exp(-k / 5);
    r *= 1 + W * 0.45 * lumpy(el[k].i / N);
    el[k].r = r;
  }
  // the base lets go when the push ends: its end rounds up like the head
  const release = p.push;
  const released = age >= release;
  if (released) {
    const k0 = el.length - 1;
    const rel = smooth((age - release) / 0.08);
    for (let k = Math.max(0, k0 - 4); k <= k0; k++)
      el[k].r *= 1 + 0.35 * rel * Math.exp(-(k0 - k) / 2);
  }
  // necks deepen toward each cut's moment, then tear
  const neckW = lamI * 0.32;
  for (const e of el) {
    let m = 1;
    for (const c of cuts) {
      const d = Math.abs(e.i - c.i) / neckW;
      if (d > 1) continue;
      const grow = smooth((age - (c.t - p.breakTime * 0.6)) / (p.breakTime * 0.6)) * p.neck;
      m = Math.min(m, 1 - grow * (1 - d * d) ** 1.5);
    }
    e.r *= Math.max(0, m);
  }
  const torn = cuts.filter((c) => p.neck > 0.85 && age >= c.t);
  // split into pieces at torn cuts
  /** @type {{ els: typeof el, from: number, to: number }[]} */
  const parts = [];
  let cur = [];
  let lo = -1;
  const isTorn = (/** @type {number} */ i) =>
    torn.find((c) => Math.abs(i - c.i) < 0.5 + neckW * 0.25);
  for (const e of el) {
    const t = isTorn(e.i);
    if (t) {
      if (cur.length) parts.push({ els: cur, from: lo, to: t.i });
      cur = [];
      lo = t.i;
      continue;
    }
    if (e.r > 0.3) cur.push(e);
  }
  if (cur.length) parts.push({ els: cur, from: lo, to: N + 1 });
  const end = 1 - p.shrink * 0.9 * smooth((age - 0.72) / 0.28);
  // sideways kicks push leaning water further out, never back across its own path
  const side = Math.abs(p.lean) > 0.05 ? Math.sign(p.lean) : 0;
  /** @type {{ x: number, y: number, r: number }[][]} */
  const pieces = [];
  for (const part of parts) {
    // a piece is free once both of its ends have let go (the head end is always free; the
    // base end lets go when the push ends)
    const cA = torn.find((c) => c.i === part.from);
    const cB = torn.find((c) => c.i === part.to);
    const atBase = part.to === N + 1;
    const tA = part.from < 0 ? -Infinity : (cA?.t ?? Infinity);
    const tB = atBase ? (released ? release : Infinity) : (cB?.t ?? Infinity);
    const free = Math.max(tA, tB);
    const isFree = Number.isFinite(free) && age >= free;
    const dtf = isFree ? age - free : 0;
    const kr = createRng(seed * 31 + Math.round((part.from + 7) * 13));
    const k1 = kr.next();
    // every freed piece drifts clearly to one side, so falling water never retraces the column
    const kx = side
      ? side * (0.15 + 0.85 * k1) * p.scatter * 4
      : Math.sign(k1 - 0.5) * (0.35 + 0.65 * Math.abs(2 * k1 - 1)) * p.scatter * 3.5;
    // the head drop pops off upward when it pinches (the classic jet: the top drop flies on)
    const pop = part.from < 0 && !atBase ? -V0 * 0.18 : 0;
    const ky = (kr.next() - 0.5) * p.scatter * 3 + pop;
    let cy = 0;
    let cx = 0;
    let area = 0;
    let len = 0;
    for (let k = 0; k < part.els.length; k++) {
      const e = part.els[k];
      cy += e.y * e.r * e.r;
      cx += e.x * e.r * e.r;
      area += e.r * e.r;
      if (k) len += Math.hypot(e.x - part.els[k - 1].x, e.y - part.els[k - 1].y);
    }
    cy /= area || 1;
    cx /= area || 1;
    // short pieces pull into round drops; long ones stay long and keep flying (they would
    // look sucked in if they shrank toward their middle)
    const short = Math.min(1, (p.radius * 5) / Math.max(1, len));
    const round = isFree ? smooth(dtf / 0.12) * 0.7 * short : 0;
    pieces.push(
      part.els.map((e) => {
        const y = cy + (e.y - cy) * (1 - round) + ky * dtf;
        const xx = cx + (e.x - cx) * (1 - round * 0.6) + kx * dtf;
        let r = Math.min(p.radius * 1.35, e.r * (1 + round * 0.35)) * end;
        // free water that comes down into the surface goes in there (no climbing back out)
        if (isFree && y > 0) r *= clamp01(1 - y / Math.max(1, r * 1.2));
        return { x: xx, y, r };
      }),
    );
  }
  // the head bursts into a little fan of spray when the first tear frees it (the reference)
  const head = el[0]?.i === 0 ? el[0] : null;
  const first = torn.reduce((m, c) => (c.i < m.i ? c : m), torn[0] ?? { i: Infinity, t: 0 });
  if (head && torn.length && p.satellites > 0) {
    const dt = age - first.t;
    const n = Math.round(3 + 4 * p.satellites);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (rng.next() - 0.5) * Math.PI * 1.3;
      const sp = p.scatter * (4 + 6 * rng.next());
      const r = p.radius * (0.14 + 0.24 * rng.next()) * end;
      const y = head.y + Math.sin(a) * sp * dt + 0.5 * g * 0.35 * dt * dt;
      pieces.push([
        {
          x: head.x + Math.cos(a) * sp * dt + vxLean * dt,
          y,
          r: y > 0 ? r * clamp01(1 - y / Math.max(1, r * 1.2)) : r,
        },
      ]);
    }
  }
  // satellites: tiny drops left where the water tore, flicked a little sideways
  if (p.satellites > 0) {
    for (const c of torn) {
      if (rng.next() > p.satellites) continue;
      const near = el.reduce((b, e) => (Math.abs(e.i - c.i) < Math.abs(b.i - c.i) ? e : b), el[0]);
      if (!near) continue;
      const dt = age - c.t;
      const r = p.radius * (0.16 + 0.14 * rng.next()) * end;
      const fl = side ? side * Math.abs(c.ky) : c.ky;
      const y = near.y + c.kx * 30 * dt;
      pieces.push([
        {
          x: near.x + fl * p.scatter * 6 * dt,
          y,
          r: y > 0 ? r * clamp01(1 - y / Math.max(1, r * 1.2)) : r,
        },
      ]);
    }
  }
  return { pieces };
}

/**
 * Draw the jet (base at the origin, going up).
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, seed?: number }} inst
 */
export function drawJet(ctx, params, inst) {
  const p = readJet(params);
  const style = readStyle(params);
  const age = inst.age ?? 0;
  const { pieces } = jetShape(p, inst.seed ?? 0, age);
  if (!pieces.length) return;
  // fill the gaps between samples so the column reads as one smooth body
  /** @type {{ x: number, y: number, r: number }[][]} */
  const blobs = pieces.map((pc) => {
    const out = [];
    for (let i = 0; i < pc.length; i++) {
      out.push(pc[i]);
      const n = pc[i + 1];
      if (!n) continue;
      const d = Math.hypot(n.x - pc[i].x, n.y - pc[i].y);
      const steps = Math.min(12, Math.floor(d / Math.max(0.5, Math.min(pc[i].r, n.r) * 0.5)));
      for (let s = 1; s <= steps; s++) {
        const t = s / (steps + 1);
        out.push({
          x: pc[i].x + (n.x - pc[i].x) * t,
          y: pc[i].y + (n.y - pc[i].y) * t,
          r: pc[i].r + (n.r - pc[i].r) * t,
        });
      }
    }
    return out;
  });
  const all = blobs.flat().filter((c) => c.r > 0.4);
  if (!all.length) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of all) {
    x0 = Math.min(x0, c.x - c.r);
    y0 = Math.min(y0, c.y - c.r);
    x1 = Math.max(x1, c.x + c.r);
    y1 = Math.max(y1, c.y + c.r);
  }
  x0 -= 4;
  y0 -= 4;
  const bw = x1 - x0 + 8;
  const bh = y1 - y0 + 8;
  const m = ctx.getTransform();
  const kk = Math.min(4, Math.max(0.05, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))));
  const W = Math.max(1, Math.min(2048, Math.ceil(bw * kk)));
  const H = Math.max(1, Math.min(2048, Math.ceil(bh * kk)));
  const base = corePosition(style, age);
  const tone = (/** @type {number} */ t) => toCss(sampleRamp(style.ramp, Math.min(1, base + t)));
  const lx = Math.cos(p.light);
  const ly = Math.sin(p.light);
  const { c, x } = scratch(ctx, W, H, 'jet');
  x.setTransform(W / bw, 0, 0, H / bh, -x0 * (W / bw), -y0 * (H / bh));
  // the base is the water surface: the jet comes out of it and drops fall back into it
  x.save();
  x.beginPath();
  x.rect(x0 - 10, y0 - 10, bw + 20, Math.max(0, -y0 + p.radius * 0.15) + 10);
  x.clip();
  const circles = (
    /** @type {{ x: number, y: number, r: number }[]} */ list,
    dx = 0,
    dy = 0,
    kr = 1,
  ) => {
    x.beginPath();
    for (const q of list) {
      const r = q.r * kr;
      if (r <= 0.2) continue;
      x.moveTo(q.x + dx * q.r + r, q.y + dy * q.r);
      x.arc(q.x + dx * q.r, q.y + dy * q.r, r, 0, TAU);
    }
    x.fill();
  };
  x.fillStyle = tone(p.shade > 0 ? p.shadeTone : p.bodyTone);
  circles(all);
  if (p.shade > 0) {
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tone(p.bodyTone);
    circles(all, lx * p.shade * 0.55, ly * p.shade * 0.55, 1 - p.shade * 0.12);
    // an inner shadow pool on the far side of each drop (the reference's two-tone drops)
    x.fillStyle = tone(p.shadeTone);
    circles(all, -lx * 0.28, -ly * 0.28, 0.42 * p.shade + 0.12);
    x.fillStyle = tone(p.bodyTone);
    circles(all, -lx * 0.05, -ly * 0.05, 0.3 * p.shade + 0.05);
  }
  if (p.highlight > 0) {
    // a highlight on each drop / bulge, plus a thin lit streak along the column
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = tone(p.highlightTone);
    x.beginPath();
    for (const b of blobs) {
      let big = b[0];
      for (const q of b) if (q.r > big.r) big = q;
      if (!big || big.r < 1.5) continue;
      const hr = big.r * (0.16 + 0.2 * p.highlight);
      const hx = big.x + lx * big.r * 0.5;
      const hy = big.y + ly * big.r * 0.5;
      x.moveTo(hx + hr, hy);
      x.ellipse(hx, hy, hr, hr * 1.5, Math.atan2(ly, lx), 0, TAU);
    }
    x.fill();
    if (p.highlight > 0.3) {
      x.beginPath();
      for (const q of all) {
        const r = Math.max(0.6, q.r * 0.09 * p.highlight);
        x.moveTo(q.x + lx * q.r * 0.62 + r, q.y + ly * q.r * 0.3);
        x.arc(q.x + lx * q.r * 0.62, q.y + ly * q.r * 0.3, r, 0, TAU);
      }
      x.fill();
    }
  }
  x.restore();
  x.globalCompositeOperation = 'source-over';
  ctx.drawImage(c, 0, 0, W, H, x0, y0, bw, bh);
}
