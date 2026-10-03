// @ts-check
/**
 * Liquid stream (D-105): a jet built from many small blobs of water, like After Effects'
 * particles + a choker — instead of one procedural shape (Raul: the old jet broke up in a
 * jittery, inconsistent way and one slider change gave a totally different result).
 *
 * - Blobs leave the base over the push time; each follows its own arc under gravity (fast up,
 *   hangs, falls), so water can never run backwards along its path.
 * - The blobs' speed, sideways drift and size come from SMOOTH noise along the stream (not one
 *   random number per blob): neighbours behave alike, so the stream forms lumps and necks —
 *   faster water runs ahead and stretches the stream at some places first.
 * - Neighbouring blobs are joined by a neck that thins as they move apart and tears for good
 *   once they have been too far apart (it can never re-join): the pinching is gradual and
 *   happens one place after another.
 * - Everything is melted into one body (blur + threshold, the goo trick) and cel-shaded as a
 *   whole: body colour, a shade on the side away from the light, a thin lit rim and a highlight.
 * - Consistency: the noise is a function of the position along the stream, so changing a slider
 *   (even the blob count) changes the result gradually; the same settings always look the same.
 */

import { toCss } from '../core/color.js';
import { createNoise } from '../core/noise.js';
import { boxBlur } from '../render/goo.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition, readStyle } from '../render/style.js';
import { scratch } from './celFlame.js';

const TAU = Math.PI * 2;
const clamp01 = (/** @type {number} */ t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (/** @type {number} */ t) => {
  const u = clamp01(t);
  return u * u * (3 - 2 * u);
};

const G = 'Liquid stream';
const n = (
  /** @type {string} */ id,
  /** @type {string} */ label,
  /** @type {number} */ min,
  /** @type {number} */ max,
  /** @type {number} */ step,
  /** @type {number} */ def,
  tooltip = '',
  unit = '',
) => ({
  id: `stream.${id}`,
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

/** Liquid stream parameters (ids `stream.*`). */
export const STREAM_PARAMS = [
  n('height', 'Height', 10, 1500, 1, 300, 'How high the front of the water goes', 'px'),
  n('radius', 'Thickness', 1, 200, 0.5, 16, 'Radius of the stream at the base', 'px'),
  n('push', 'Push time', 0.02, 0.95, 0.01, 0.3, 'How long water keeps coming out (× life)'),
  n('apex', 'Rise time', 0.05, 0.95, 0.01, 0.35, 'When the front reaches the top (× life)'),
  {
    id: 'stream.count',
    label: 'Blobs',
    group: G,
    type: 'int',
    min: 4,
    max: 400,
    default: 90,
    tooltip: 'How many blobs of water make the stream (more = smoother, slower)',
  },
  n(
    'breakup',
    'Break-up',
    0,
    1,
    0.01,
    0.6,
    'How different the speeds along the stream are: more = it stretches and splits sooner',
  ),
  n('lumps', 'Lumps', 0.5, 16, 0.1, 7, 'How many lumps / drops along the stream'),
  n(
    'stick',
    'Stickiness',
    0,
    1,
    0.01,
    0.45,
    'How far the water stretches before it pinches into drops',
  ),
  n('taper', 'Stretch', 0, 1, 0.01, 0.5, 'Later water is slower: the stream stretches thinner'),
  n('spread', 'Spread', 0, 1, 0.01, 0.25, 'Sideways spread of the water'),
  n('lean', 'Lean', -1, 1, 0.01, 0, 'Shoots sideways (keeps curving out as it falls)'),
  n('wind', 'Wind', -2000, 2000, 1, 0, 'Pushes the falling water sideways', 'px/s²'),
  n('wobble', 'Wobble', 0, 1, 0.01, 0.3, 'A soft sideways wave along the stream'),
  n('merge', 'Melt', 0, 1.5, 0.01, 0.4, 'How much the blobs melt into one body (× thickness)'),
  n('shrink', 'Shrink at the end', 0, 1, 0.01, 0.7, 'Drops get smaller as the life ends'),
  n('shade', 'Shade', 0, 1, 0.01, 0.5, 'Darker side away from the light'),
  n('rim', 'Lit rim', 0, 1, 0.01, 0.5, 'Thin bright edge on the lit side'),
  n('highlight', 'Highlight', 0, 1, 0.01, 0.7, 'White highlight blobs on the lit side'),
  n('light', 'Light from', 0, 360, 1, 315, '0 = right, 270 = above, 315 = top-right', '°'),
  n('bodyTone', 'Body colour', 0, 1, 0.01, 0.3, 'Position on the ramp'),
  n('shadeTone', 'Shade colour', 0, 1, 0.01, 0.6, 'Position on the ramp'),
  n('rimTone', 'Rim colour', 0, 1, 0.01, 0.1, 'Position on the ramp'),
  n('highlightTone', 'Highlight colour', 0, 1, 0.01, 0, 'Position on the ramp'),
];

/** @param {Record<string, any>} v */
export const readStream = (v) => ({
  height: v['stream.height'] ?? 300,
  radius: v['stream.radius'] ?? 16,
  push: v['stream.push'] ?? 0.3,
  apex: v['stream.apex'] ?? 0.35,
  count: Math.max(4, Math.round(v['stream.count'] ?? 90)),
  breakup: v['stream.breakup'] ?? 0.6,
  lumps: v['stream.lumps'] ?? 7,
  stick: v['stream.stick'] ?? 0.45,
  taper: v['stream.taper'] ?? 0.5,
  spread: v['stream.spread'] ?? 0.25,
  lean: v['stream.lean'] ?? 0,
  wind: v['stream.wind'] ?? 0,
  wobble: v['stream.wobble'] ?? 0.3,
  merge: v['stream.merge'] ?? 0.4,
  shrink: v['stream.shrink'] ?? 0.7,
  shade: v['stream.shade'] ?? 0.5,
  rim: v['stream.rim'] ?? 0.5,
  highlight: v['stream.highlight'] ?? 0.7,
  light: ((v['stream.light'] ?? 315) * Math.PI) / 180,
  bodyTone: v['stream.bodyTone'] ?? 0.3,
  shadeTone: v['stream.shadeTone'] ?? 0.6,
  rimTone: v['stream.rimTone'] ?? 0.1,
  highlightTone: v['stream.highlightTone'] ?? 0,
});

/**
 * The stream at life `age` (0–1), in its own space (base at 0, 0; up = −y). Pure.
 * `lifeSeconds` is the life in seconds (for the wind, in px/s²). Returns the blobs (x, y, r)
 * and the necks joining neighbours of the same piece (ends a, b and radius w).
 * @param {ReturnType<typeof readStream>} p @param {number} seed @param {number} age
 * @param {number} [lifeSeconds]
 */
export function streamShape(p, seed, age, lifeSeconds = 1) {
  const N = p.count;
  const g = (2 * p.height) / (p.apex * p.apex); // the front reaches `height` at `apex`
  const V0 = g * p.apex;
  const nz = createNoise(seed >>> 0);
  // noise along the stream (u = 0 front … 1 tail): smooth, so neighbours behave alike
  const along = (/** @type {number} */ u, /** @type {number} */ ch) =>
    nz.noise2D(u * p.lumps, ch * 17.3 + 0.5);
  const wind = p.wind * lifeSeconds * lifeSeconds; // px/s² → px per life²
  const end = 1 - p.shrink * 0.9 * smooth((age - 0.72) / 0.28);
  // the launch of each blob (independent of time)
  const born = [];
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const tau = u * p.push;
    // later water leaves slower (the stream stretches); the tail still leaves the surface
    const lag = (tau / p.apex) * (0.8 + p.taper * 0.6);
    const v = V0 * Math.max(0.42, 1 - lag) * (1 - p.breakup * 0.22 * (0.5 + 0.5 * along(u, 0)));
    const vx = V0 * (p.lean * 0.5 + p.spread * 0.04 * along(u, 1));
    let r = p.radius * (1 - p.taper * 0.35 * u) * (1 + 0.15 * along(u * 2.3, 3));
    if (i < 3) r *= 1 + 0.25 * (1 - i / 3); // the front gathers into a round head
    born.push({ u, tau, v, vx, r, wob: p.wobble * p.radius * 1.2 * along(u * 1.7, 2) });
  }
  // where it pinches: cuts along the stream (spacing from Lumps, placed by noise — not by the
  // blob count, so changing the count does not move them); each pinches at its own moment
  const du = 1 / Math.max(0.5, p.lumps * 1.4);
  /** @type {{ u: number, t: number, kx: number }[]} */
  const cuts = [];
  for (let k = 0; (k + 0.5) * du < 1; k++) {
    const u = (k + 0.5 + 0.38 * along(k * 0.37 + 0.11, 6)) * du;
    if (u <= 0.02 || u >= 0.99) continue;
    const t =
      u * p.push +
      p.apex * (0.35 + 0.45 * (1 - p.breakup) + 0.45 * p.stick) * (1 + 0.3 * along(k * 0.71, 7));
    cuts.push({ u, t, kx: along(k * 0.53 + 0.2, 8) });
  }
  const release = p.push; // the base lets go when the push ends
  const neckT = Math.max(0.04, p.apex * 0.35); // how long a neck takes to pinch through
  const neckW = du * 0.32; // how far along the stream a neck reaches
  /** ballistic position of blob i at life `a` @param {number} i @param {number} a */
  const at = (i, a) => {
    const b = born[i];
    const dt = a - b.tau;
    return [
      b.vx * dt + 0.5 * wind * dt * dt + b.wob * clamp01(dt * 6),
      -(b.v * dt - 0.5 * g * dt * dt),
    ];
  };
  /** @type {{ x: number, y: number, r: number, i: number, u: number }[]} */
  const blobs = [];
  for (let i = 0; i < N; i++) {
    const b = born[i];
    if (age < b.tau) break;
    const [x, y] = at(i, age);
    // necks deepen toward each cut's moment and close completely when it tears
    let m = 1;
    for (const c of cuts) {
      const d = Math.abs(b.u - c.u) / neckW;
      if (d >= 1) continue;
      const depth = smooth((age - (c.t - neckT)) / neckT);
      m = Math.min(m, 1 - depth * (1 - d * d) ** 1.5);
    }
    blobs.push({ x, y, r: b.r * m, i, u: b.u });
  }
  if (!blobs.length) return { blobs: [], necks: [] };
  // pieces between torn cuts (and the base once it has let go)
  const torn = cuts.filter((c) => age >= c.t).map((c) => c.u);
  /** @type {{ list: typeof blobs, from: number, to: number }[]} */
  const parts = [];
  let cur = [];
  let from = -1;
  let ti = 0;
  for (const bl of blobs) {
    while (ti < torn.length && torn[ti] <= bl.u) {
      if (cur.length) parts.push({ list: cur, from, to: torn[ti] });
      cur = [];
      from = torn[ti];
      ti++;
    }
    cur.push(bl);
  }
  if (cur.length) parts.push({ list: cur, from, to: 2 });
  const tornT = (/** @type {number} */ u) => cuts.find((c) => c.u === u)?.t ?? -Infinity;
  /** @type {{ x: number, y: number, r: number, i: number }[]} */
  const out = [];
  /** @type {{ ax: number, ay: number, bx: number, by: number, w: number }[]} */
  const necks = [];
  for (const part of parts) {
    const atBase = part.to === 2;
    const tA = part.from < 0 ? -Infinity : tornT(part.from);
    const tB = atBase
      ? age >= release && born[N - 1].tau <= age
        ? release
        : Infinity
      : tornT(part.to);
    const free = Math.max(tA, tB);
    const isFree = Number.isFinite(free) && age >= free;
    const L = part.list;
    let len = 0;
    for (let k = 1; k < L.length; k++) len += Math.hypot(L[k].x - L[k - 1].x, L[k].y - L[k - 1].y);
    let cx = 0;
    let cy = 0;
    let w = 0;
    for (const q of L) {
      const ww = q.r * q.r + 1e-6;
      cx += q.x * ww;
      cy += q.y * ww;
      w += ww;
    }
    cx /= w;
    cy /= w;
    // surface tension: a freed piece pulls together (short ones into a round drop) and drifts
    // a little sideways, away from the others
    const dtf = isFree ? age - free : 0;
    const short = clamp01((p.radius * 8 - len) / (p.radius * 6));
    const pull = isFree ? smooth(dtf / 0.12) * (0.25 + 0.55 * short) : 0;
    const k0 = part.from < 0 ? 0 : (cuts.find((c) => c.u === part.from)?.kx ?? 0);
    const drift = p.spread * V0 * 0.6 * k0 * dtf;
    let prev = null;
    for (const q of L) {
      let r = q.r * (1 + pull * 0.3) * end;
      const x = cx + (q.x - cx) * (1 - pull) + drift;
      const y = cy + (q.y - cy) * (1 - pull);
      // water that comes down into the surface goes in (it never climbs back out)
      if (y > 0 && isFree) r *= clamp01(1 - y / Math.max(1, r * 1.5));
      const o = { x, y, r: Math.min(r, p.radius * 1.5), i: q.i };
      if (o.r >= 0.3) {
        out.push(o);
        if (prev)
          necks.push({ ax: prev.x, ay: prev.y, bx: o.x, by: o.y, w: Math.min(prev.r, o.r) });
        prev = o;
      } else prev = null;
    }
  }
  return { blobs: out, necks };
}

/**
 * Draw the stream (base at the origin, going up).
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ age?: number, seed?: number }} inst
 * @param {{ timing?: { fps?: number, frameCount?: number } }} [frame]
 */
export function drawStream(ctx, params, inst, frame) {
  const p = readStream(params);
  const style = readStyle(params);
  const age = inst.age ?? 0;
  const fps = frame?.timing?.fps ?? 24;
  const span = Math.max(0.01, (params['single.end'] ?? 1) - (params['single.start'] ?? 0));
  const lifeS = span * ((frame?.timing?.frameCount ?? 24) / fps);
  const { blobs, necks } = streamShape(p, inst.seed ?? 0, age, lifeS);
  if (!blobs.length) return;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of blobs) {
    x0 = Math.min(x0, b.x - b.r);
    y0 = Math.min(y0, b.y - b.r);
    x1 = Math.max(x1, b.x + b.r);
    y1 = Math.max(y1, b.y + b.r);
  }
  const pad = p.radius * (p.merge * 2 + 1) + 4;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 = Math.min(y1 + pad, p.radius * 0.2); // the water surface
  if (y1 <= y0) return;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const m = ctx.getTransform();
  const kk = Math.min(4, Math.max(0.05, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))));
  const W = Math.max(1, Math.min(2048, Math.ceil(bw * kk)));
  const H = Math.max(1, Math.min(2048, Math.ceil(bh * kk)));
  const sx = W / bw;
  const sy = H / bh;
  // 1) the blobs and necks as a white mask
  const { c, x } = scratch(ctx, W, H, 'stream');
  x.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
  x.fillStyle = '#fff';
  x.beginPath();
  for (const b of blobs) {
    x.moveTo(b.x + b.r, b.y);
    x.arc(b.x, b.y, b.r, 0, TAU);
  }
  x.fill();
  x.lineCap = 'round';
  x.strokeStyle = '#fff';
  for (const nk of necks) {
    x.lineWidth = nk.w * 2;
    x.beginPath();
    x.moveTo(nk.ax, nk.ay);
    x.lineTo(nk.bx, nk.by);
    x.stroke();
  }
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const n = W * H;
  // 2) melt into one body: blur + threshold (rounded, merged — the goo trick)
  const A = new Float32Array(n);
  for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3] / 255;
  const rr = Math.round(p.radius * p.merge * 0.5 * Math.min(sx, sy));
  if (rr >= 1) {
    const tmp = new Float32Array(n);
    for (let it = 0; it < 3; it++) boxBlur(A, tmp, W, H, rr);
  }
  const M = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = clamp01((A[i] - 0.42) / 0.16);
    M[i] = t * t * (3 - 2 * t);
  }
  // 3) cel shading on the whole body: what lies toward / away from the light
  const base = corePosition(style, age);
  const col = (/** @type {number} */ t) => sampleRamp(style.ramp, Math.min(1, base + t));
  const body = col(p.bodyTone);
  const shadeC = col(p.shadeTone);
  const rimC = col(p.rimTone);
  const hiC = col(p.highlightTone);
  const lx = Math.cos(p.light);
  const ly = Math.sin(p.light);
  const k = Math.min(sx, sy);
  const dS = Math.max(1, p.radius * (0.25 + 0.6 * p.shade) * k);
  const dR = Math.max(1, p.radius * 0.12 * p.rim * k);
  const inside = (/** @type {number} */ px, /** @type {number} */ py) => {
    const ix = Math.round(px);
    const iy = Math.round(py);
    if (ix < 0 || iy < 0 || ix >= W || iy >= H) return false;
    return M[iy * W + ix] > 0.5;
  };
  for (let yy = 0; yy < H; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const i = yy * W + xx;
      const a = M[i];
      const q = i * 4;
      if (a <= 0) {
        d[q + 3] = 0;
        continue;
      }
      let c0 = body;
      // shade: a step AWAY from the light leaves the body → near the dark edge;
      // lit rim: a small step TOWARD the light leaves it → on the lit edge
      if (p.shade > 0 && !inside(xx - lx * dS, yy - ly * dS)) c0 = shadeC;
      if (p.rim > 0 && !inside(xx + lx * dR, yy + ly * dR)) c0 = rimC;
      d[q] = c0[0];
      d[q + 1] = c0[1];
      d[q + 2] = c0[2];
      d[q + 3] = a * c0[3];
    }
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.putImageData(img, 0, 0);
  // 4) highlights: a soft oval on the lit side of each lump (the biggest blobs of each piece)
  if (p.highlight > 0) {
    x.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = toCss(hiC);
    x.beginPath();
    for (let j = 0; j < blobs.length; j++) {
      const b = blobs[j];
      // one highlight every few blobs (on the big ones): reads as lumps, not a dotted line
      if (b.i % Math.max(3, Math.round(p.count / (p.lumps * 1.4))) !== 0 || b.r < 2) continue;
      const hr = b.r * (0.12 + 0.18 * p.highlight);
      const hx = b.x + lx * b.r * 0.45;
      const hy = b.y + ly * b.r * 0.45;
      x.moveTo(hx + hr * 1.4, hy);
      x.ellipse(hx, hy, hr * 1.4, hr * 0.8, Math.atan2(ly, lx) + Math.PI / 2, 0, TAU);
    }
    x.fill();
    x.globalCompositeOperation = 'source-over';
  }
  ctx.drawImage(c, 0, 0, W, H, x0, y0, bw, bh);
}
