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
  dn('tail', 'Tail', 0, 2, 0.01, 0.6, 'Fast drops pull a pointed tail behind them'),
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
  const tip = cx - L;
  const c = 0.5523;
  x.moveTo(cx, dy - b);
  x.arc(cx, dy, b, -Math.PI / 2, Math.PI / 2);
  x.bezierCurveTo(cx - L * c, dy + b, tip, dy + b * c * (L <= b * 1.05 ? 1 : 0.35), tip, dy);
  x.bezierCurveTo(tip, dy - b * c * (L <= b * 1.05 ? 1 : 0.35), cx - L * c, dy - b, cx, dy - b);
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
  const e = 1 + p.stretch * Math.min(2.5, sr) * 0.9;
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
  ...readShading(v, 'jet'),
});

/**
 * The jet at life `age` (0–1): pieces of round blobs (circles), grouped by drop. Base at
 * (0, 0), up is −y. Pure; exported for tests.
 * @param {ReturnType<typeof readJet>} p @param {number} seed @param {number} age
 * @returns {{ pieces: { x: number, y: number, r: number }[][] }}
 */
export function jetShape(p, seed, age) {
  const rng = createRng(seed);
  const N = 140;
  const g = (2 * p.height) / (p.apex * p.apex); // front reaches `height` at `apex`
  const V0 = g * p.apex;
  const A = p.neck * smooth((age - p.breakStart) / Math.max(0.01, p.breakTime));
  // wave along the material: pinches every `wave` thicknesses of the stretched column
  const lam = Math.max(4, Math.round((N * p.radius * p.wave) / Math.max(1, p.height)));
  const phase = rng.next();
  const jitter = Array.from({ length: Math.ceil(N / lam) + 2 }, () => rng.next());
  /** @type {{ x: number, y: number, r: number, cut: boolean, seg: number }[]} */
  const el = [];
  for (let i = 0; i < N; i++) {
    const tau = (i / (N - 1)) * p.push; // when this bit of water left the base
    if (age < tau) break;
    const s = 1 - tau / p.push;
    const v = V0 * (0.08 + 0.92 * s ** 0.8);
    const dt = age - tau;
    const h = v * dt - 0.5 * g * dt * dt;
    if (h < -p.radius) continue; // back in the water
    el.push({ x: 0, y: -h, r: p.radius, cut: false, seg: 0 });
  }
  if (!el.length) return { pieces: [] };
  // stretched water is thinner (volume kept): spacing now vs at launch
  const s0 = (V0 * p.push) / (N - 1);
  for (let i = 0; i < el.length; i++) {
    const a = el[Math.max(0, i - 1)];
    const b = el[Math.min(el.length - 1, i + 1)];
    const gap = Math.max(1e-3, Math.abs(a.y - b.y) / (i > 0 && i < el.length - 1 ? 2 : 1));
    el[i].r = p.radius * Math.min(1.4, Math.max(0.5, Math.sqrt((s0 * 0.7) / gap)));
    // the front gathers water into a round head (surface tension)
    el[i].r *= 1 + 0.45 * Math.exp(-i / 5);
  }
  // varicose wave → necks → pinches (wavelengths vary a little: mixed drop sizes)
  for (let i = 0; i < el.length; i++) {
    const k = i / lam + phase;
    const w = Math.floor(k);
    const jw = jitter[w % jitter.length];
    const f = k - w + (jw - 0.5) * 0.25;
    const neck = 0.5 - 0.5 * Math.cos(TAU * f);
    // each wave grows at its own pace: necks pinch one after another, not all at once
    const own = clamp01(A * (0.75 + 0.5 * jw));
    const m = 1 - own * neck ** 2.2;
    el[i].r *= Math.max(0, m);
    el[i].cut = m < 0.12;
    el[i].seg = w;
  }
  // pieces between pinches
  /** @type {{ x: number, y: number, r: number }[][]} */
  const pieces = [];
  let cur = [];
  for (const e of el) {
    if (e.cut) {
      if (cur.length) pieces.push(cur);
      cur = [];
      continue;
    }
    cur.push(e);
  }
  if (cur.length) pieces.push(cur);
  const pinched = smooth((A / Math.max(1e-3, p.neck) - 0.75) / 0.25);
  const lean = p.lean * p.height;
  return {
    pieces: pieces.map((pc, j) => {
      // a pinched piece pulls into a round drop (surface tension) and drifts sideways
      let cy = 0;
      let area = 0;
      for (const e of pc) {
        cy += e.y * e.r * e.r;
        area += e.r * e.r;
      }
      cy /= area || 1;
      const isDrop = pieces.length > 1 && pinched > 0;
      const k = isDrop ? pinched * 0.65 : 0;
      const side = (createRng(seed + 101 * (j + 1)).next() - 0.5) * 2;
      const drift = isDrop ? side * p.scatter * pinched * clamp01((age - p.breakStart) * 2) : 0;
      return pc.map((e) => {
        const y = cy + (e.y - cy) * (1 - k);
        const hFrac = clamp01(-y / Math.max(1, p.height));
        return {
          x: lean * hFrac * hFrac + drift * hFrac,
          y,
          // never balloons: falling water stacks up, but a drop is at most this big
          r: Math.min(p.radius * 1.35, e.r * (1 + k * 0.35)),
        };
      });
    }),
  };
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
