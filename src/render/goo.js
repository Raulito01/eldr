// @ts-check
/**
 * Goo (D-078): shapes that come close MELT TOGETHER, like metaballs — Raul's After Effects
 * recipe (Fast Box Blur "Goo amount" → Matte Choker) as one pass:
 *   1. blur the layer (premultiplied colour + alpha) — nearby shapes' halos overlap;
 *   2. threshold the blurred alpha with a soft edge — the overlap becomes one crisp silhouette
 *      with a smooth bridge between the shapes;
 *   3. colour = the blurred colour; optionally the original shapes are kept on top, so their cel
 *      bands and highlights stay sharp inside the merged outline.
 * Used per layer (the Goo group on every sprite layer: an emitter's particles fuse into liquid)
 * and as an adjustment layer (everything below it merges). Pure pixel math, deterministic.
 */

const G = 'Goo';

/** Goo parameters (ids `goo.*`). Amount 0 = off. */
export const GOO_PARAMS = [
  {
    id: 'goo.amount',
    label: 'Goo amount',
    group: G,
    type: 'float',
    min: 0,
    max: 64,
    step: 0.5,
    default: 0,
    unit: 'px',
    tooltip:
      'How far shapes reach out to melt together (0 = off). Like Fast Box Blur before a Matte Choker in After Effects.',
  },
  {
    id: 'goo.threshold',
    label: 'Choke',
    group: G,
    type: 'float',
    min: 0.05,
    max: 0.95,
    step: 0.01,
    default: 0.3,
    tooltip: 'Higher = thinner, more separate blobs; lower = fatter, more merged',
  },
  {
    id: 'goo.softness',
    label: 'Edge softness',
    group: G,
    type: 'float',
    min: 0,
    max: 0.3,
    step: 0.005,
    default: 0.04,
  },
  {
    id: 'goo.keepShapes',
    label: 'Keep shape details',
    group: G,
    type: 'bool',
    default: true,
    tooltip: 'Draw the original shapes on top so their bands and highlights stay crisp',
  },
];

/** @param {Record<string, any>} v */
export const readGoo = (v) => ({
  amount: v['goo.amount'] ?? 0,
  threshold: v['goo.threshold'] ?? 0.3,
  softness: v['goo.softness'] ?? 0.04,
  keepShapes: v['goo.keepShapes'] ?? true,
});

/**
 * In-place box blur of one channel (running sums), horizontal then vertical.
 * @param {Float32Array} a @param {Float32Array} tmp @param {number} w @param {number} h
 * @param {number} r radius px
 */
export function boxBlur(a, tmp, w, h, r) {
  if (r < 1) return;
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += a[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = sum * k;
      sum += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      a[y * w + x] = sum * k;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
}

/**
 * Apply goo to straight-alpha RGBA pixels (in place).
 * @param {Uint8ClampedArray} d @param {number} w @param {number} h
 * @param {ReturnType<typeof readGoo>} g @param {number} amountPx blur radius in OUTPUT px
 */
export function gooPixels(d, w, h, g, amountPx) {
  const n = w * h;
  const R = new Float32Array(n);
  const Gc = new Float32Array(n);
  const B = new Float32Array(n);
  const A = new Float32Array(n);
  let any = false;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = d[p + 3] / 255;
    if (a > 0) any = true;
    R[i] = d[p] * a;
    Gc[i] = d[p + 1] * a;
    B[i] = d[p + 2] * a;
    A[i] = a;
  }
  if (!any) return;
  // three box passes of this radius ≈ a Gaussian — like Fast Box Blur, Iterations 3, in AE
  const r = Math.max(1, Math.round(amountPx));
  const tmp = new Float32Array(n);
  for (let it = 0; it < 3; it++) for (const ch of [R, Gc, B, A]) boxBlur(ch, tmp, w, h, r);
  const lo = g.threshold - g.softness;
  const hi = g.threshold + g.softness;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = A[i];
    let out = 0;
    if (hi <= lo) out = a >= g.threshold ? 1 : 0;
    else if (a > lo) {
      const t = Math.min(1, (a - lo) / (hi - lo));
      out = t * t * (3 - 2 * t);
    }
    const oa = d[p + 3] / 255;
    if (out <= 0) {
      if (!(g.keepShapes && oa > 0)) d[p + 3] = 0; // kept shapes always stay
      continue;
    }
    const inv = a > 1e-6 ? 1 / a : 0;
    let r8 = R[i] * inv;
    let g8 = Gc[i] * inv;
    let b8 = B[i] * inv;
    let alpha = out;
    if (g.keepShapes && oa > 0) {
      // the crisp original over the merged body
      r8 = d[p] * oa + r8 * (1 - oa);
      g8 = d[p + 1] * oa + g8 * (1 - oa);
      b8 = d[p + 2] * oa + b8 * (1 - oa);
      alpha = Math.max(out, oa);
    }
    d[p] = r8;
    d[p + 1] = g8;
    d[p + 2] = b8;
    d[p + 3] = alpha * 255;
  }
}

/**
 * Goo over a whole surface (identity transform), radius in effect px × `scale`.
 * @param {CanvasRenderingContext2D} ctx @param {Record<string, any>} params
 * @param {{ width: number, height: number, scale?: number }} info
 */
export function applyGoo(ctx, params, info) {
  const g = readGoo(params);
  if (!(g.amount > 0)) return;
  const reach = g.amount * (info.scale ?? 1);
  const W = info.width;
  const H = info.height;
  // only the area around what is drawn (+ the reach): much faster for small effects
  const full = ctx.getImageData(0, 0, W, H).data;
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    for (let x = 0; x < W; x++) {
      if (full[row + x * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return;
  const pad = Math.ceil(reach * 3) + 2;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(W - 1, x1 + pad);
  y1 = Math.min(H - 1, y1 + pad);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const img = ctx.getImageData(x0, y0, w, h);
  gooPixels(img.data, w, h, g, reach);
  ctx.putImageData(img, x0, y0);
}
