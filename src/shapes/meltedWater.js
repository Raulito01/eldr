// @ts-check
/**
 * Melted water (D-105, shared since D-108): circles and necks drawn as one white mask, melted
 * into a single rounded body (blur + threshold, the goo trick) and cel-shaded as a whole —
 * body colour, a shade on the side away from the light, a thin lit rim, highlight ovals.
 * Used by the Liquid stream and the Liquid ribbon.
 */

import { toCss } from '../core/color.js';
import { boxBlur } from '../render/goo.js';
import { sampleRamp } from '../render/ramp.js';
import { corePosition } from '../render/style.js';
import { scratch } from './celFlame.js';

const TAU = Math.PI * 2;
const clamp01 = (/** @type {number} */ t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/** Shading controls shared by melted-water layers (ids `${prefix}.*`). @param {string} g @param {string} prefix */
export function waterShadingParams(g, prefix) {
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
    id: `${prefix}.${id}`,
    label,
    group: g,
    type: 'float',
    min,
    max,
    step,
    default: def,
    ...(unit ? { unit } : {}),
    ...(tooltip ? { tooltip } : {}),
  });
  return [
    n('merge', 'Melt', 0, 1.5, 0.01, 0.4, 'How much the blobs melt into one body (× thickness)'),
    n('shade', 'Shade', 0, 1, 0.01, 0.5, 'Darker side away from the light'),
    n('rim', 'Lit rim', 0, 1, 0.01, 0.5, 'Thin bright edge on the lit side'),
    n('highlight', 'Highlight', 0, 1, 0.01, 0.7, 'White highlight blobs on the lit side'),
    n('light', 'Light from', 0, 360, 1, 315, '0 = right, 270 = above, 315 = top-right', '°'),
    n('bodyTone', 'Body colour', 0, 1, 0.01, 0.3, 'Position on the ramp'),
    n('shadeTone', 'Shade colour', 0, 1, 0.01, 0.6, 'Position on the ramp'),
    n('rimTone', 'Rim colour', 0, 1, 0.01, 0.1, 'Position on the ramp'),
    n('highlightTone', 'Highlight colour', 0, 1, 0.01, 0, 'Position on the ramp'),
  ];
}

/** @param {Record<string, any>} v @param {string} prefix */
export const readWaterShading = (v, prefix) => ({
  merge: v[`${prefix}.merge`] ?? 0.4,
  shade: v[`${prefix}.shade`] ?? 0.5,
  rim: v[`${prefix}.rim`] ?? 0.5,
  highlight: v[`${prefix}.highlight`] ?? 0.7,
  light: ((v[`${prefix}.light`] ?? 315) * Math.PI) / 180,
  bodyTone: v[`${prefix}.bodyTone`] ?? 0.3,
  shadeTone: v[`${prefix}.shadeTone`] ?? 0.6,
  rimTone: v[`${prefix}.rimTone`] ?? 0.1,
  highlightTone: v[`${prefix}.highlightTone`] ?? 0,
});

/**
 * @typedef {object} MeltedWater
 * @property {{ x: number, y: number, r: number }[]} blobs
 * @property {{ ax: number, ay: number, bx: number, by: number, w: number }[]} [necks]
 * @property {{ x: number, y: number, r: number }[]} [highlights]  where highlight ovals go
 * @property {number} radius   typical thickness (sets shade / rim widths and the melt)
 * @property {number} [clipBottom]  drop everything below this y (a water surface)
 * @property {string} slot     scratch canvas slot
 */

/**
 * Paint melted, cel-shaded water in the current (layer) space.
 * @param {CanvasRenderingContext2D} ctx @param {MeltedWater} w
 * @param {ReturnType<typeof readWaterShading>} sh @param {import('../render/style.js').Style} style
 * @param {number} age
 */
export function paintMeltedWater(ctx, w, sh, style, age) {
  const { blobs } = w;
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
  const pad = w.radius * (sh.merge * 2 + 1) + 4;
  x0 -= pad;
  y0 -= pad;
  x1 += pad;
  y1 += pad;
  if (w.clipBottom !== undefined) y1 = Math.min(y1, w.clipBottom);
  if (y1 <= y0 || x1 <= x0) return;
  const bw = x1 - x0;
  const bh = y1 - y0;
  const m = ctx.getTransform();
  const kk = Math.min(4, Math.max(0.05, Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))));
  const W = Math.max(1, Math.min(2048, Math.ceil(bw * kk)));
  const H = Math.max(1, Math.min(2048, Math.ceil(bh * kk)));
  const sx = W / bw;
  const sy = H / bh;
  // 1) the blobs and necks as a white mask
  const { c, x } = scratch(ctx, W, H, w.slot);
  x.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
  x.fillStyle = '#fff';
  x.beginPath();
  for (const b of blobs) {
    x.moveTo(b.x + b.r, b.y);
    x.arc(b.x, b.y, b.r, 0, TAU);
  }
  x.fill();
  if (w.necks?.length) {
    x.lineCap = 'round';
    x.strokeStyle = '#fff';
    for (const nk of w.necks) {
      x.lineWidth = nk.w * 2;
      x.beginPath();
      x.moveTo(nk.ax, nk.ay);
      x.lineTo(nk.bx, nk.by);
      x.stroke();
    }
  }
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  const n = W * H;
  // 2) melt into one body: blur + threshold (rounded, merged — the goo trick)
  const A = new Float32Array(n);
  for (let i = 0; i < n; i++) A[i] = d[i * 4 + 3] / 255;
  const rr = Math.round(w.radius * sh.merge * 0.5 * Math.min(sx, sy));
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
  const body = col(sh.bodyTone);
  const shadeC = col(sh.shadeTone);
  const rimC = col(sh.rimTone);
  const hiC = col(sh.highlightTone);
  const lx = Math.cos(sh.light);
  const ly = Math.sin(sh.light);
  const k = Math.min(sx, sy);
  const dS = Math.max(1, w.radius * (0.25 + 0.6 * sh.shade) * k);
  const dR = Math.max(1, w.radius * 0.12 * sh.rim * k);
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
      if (sh.shade > 0 && !inside(xx - lx * dS, yy - ly * dS)) c0 = shadeC;
      if (sh.rim > 0 && !inside(xx + lx * dR, yy + ly * dR)) c0 = rimC;
      d[q] = c0[0];
      d[q + 1] = c0[1];
      d[q + 2] = c0[2];
      d[q + 3] = a * c0[3];
    }
  }
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.putImageData(img, 0, 0);
  // 4) highlights: soft ovals on the lit side
  if (sh.highlight > 0 && w.highlights?.length) {
    x.setTransform(sx, 0, 0, sy, -x0 * sx, -y0 * sy);
    x.globalCompositeOperation = 'source-atop';
    x.fillStyle = toCss(hiC);
    x.beginPath();
    for (const b of w.highlights) {
      if (b.r < 2) continue;
      const hr = b.r * (0.12 + 0.18 * sh.highlight);
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
