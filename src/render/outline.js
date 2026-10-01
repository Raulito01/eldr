// @ts-check
/**
 * Outlines (brief §3.3) made by dilating/eroding a layer's alpha with an exact Euclidean
 * distance transform (Felzenszwalb & Huttenlocher, two separable passes). Exact distances give
 * round, even outlines at any thickness, anti-aliased by distance; the transform also tracks
 * the NEAREST filled pixel, so "darken" outlines take the colour they touch.
 *
 * Works on straight (non-premultiplied) RGBA pixel data, as returned by getImageData.
 */

const INF = 1e20;

/**
 * How much of a pixel the outline covers. Distances run between pixel CENTRES, and the shape's
 * edge lies half a pixel outside the last filled centre, so a pixel at centre distance d is
 * (d − 0.5) px from the edge: fully covered while that is ≤ px − 0.5, anti-aliased over 1 px.
 * @param {number} px thickness @param {number} d2 squared centre distance
 */
const coverage = (px, d2) => Math.min(1, Math.max(0, px + 1 - Math.sqrt(d2)));

/**
 * 1D squared-distance transform with nearest-source tracking.
 * @param {Float64Array} f input costs (0 = feature, INF = none)
 * @param {number} n
 * @param {Float64Array} d output squared distances
 * @param {Int32Array} idx output: index of the nearest feature
 * @param {Int32Array} v scratch (n)
 * @param {Float64Array} z scratch (n + 1)
 */
function edt1d(f, n, d, idx, v, z) {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
    idx[q] = v[k];
  }
}

/**
 * Squared distance from every pixel to the nearest feature pixel, and which pixel that is.
 * @param {Uint8Array} mask 1 = feature, 0 = not (length width × height)
 * @param {number} width @param {number} height
 * @returns {{ dist2: Float64Array, nearest: Int32Array }} nearest = pixel index (-1 if none)
 */
export function distanceTransform(mask, width, height) {
  const size = width * height;
  const colD = new Float64Array(size);
  const colIdx = new Int32Array(size);
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const idx = new Int32Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);

  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = mask[y * width + x] ? 0 : INF;
    edt1d(f, height, d, idx, v, z);
    for (let y = 0; y < height; y++) {
      colD[y * width + x] = d[y];
      colIdx[y * width + x] = idx[y];
    }
  }

  const dist2 = new Float64Array(size);
  const nearest = new Int32Array(size);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = colD[row + x];
    edt1d(f, width, d, idx, v, z);
    for (let x = 0; x < width; x++) {
      dist2[row + x] = d[x];
      const nx = idx[x];
      nearest[row + x] = d[x] >= INF / 2 ? -1 : colIdx[row + nx] * width + nx;
    }
  }
  return { dist2, nearest };
}

/**
 * @typedef {object} OutlineOptions
 * @property {'outer' | 'inner' | 'both'} mode
 * @property {number} px          thickness in device pixels
 * @property {'darken' | 'custom'} colorMode
 * @property {number} darken      0–1, how much darker than the touched fill ("darken" mode)
 * @property {[number, number, number]} color  RGB for "custom" mode
 */

/**
 * Add an outline to straight-alpha RGBA pixels, in place.
 * A pixel counts as "filled" when its alpha is at least half of the layer's strongest alpha,
 * so a faded layer still gets its outline (faded the same amount) instead of losing it.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img
 * @param {OutlineOptions} o
 */
export function applyOutline(img, o) {
  const { data, width, height } = img;
  const size = width * height;
  if (o.px <= 0) return;
  let maxA = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > maxA) maxA = data[i];
  if (maxA === 0) return;
  const threshold = Math.max(8, maxA / 2);
  const keep = 1 - o.darken;

  const filled = new Uint8Array(size);
  for (let p = 0; p < size; p++) filled[p] = data[p * 4 + 3] >= threshold ? 1 : 0;

  /** Outline RGB for a source pixel p. @param {number} p */
  const lineRgb = (p) =>
    o.colorMode === 'custom'
      ? o.color
      : [data[p * 4] * keep, data[p * 4 + 1] * keep, data[p * 4 + 2] * keep];

  // Inner first (it only changes colours of filled pixels, never alpha).
  if (o.mode === 'inner' || o.mode === 'both') {
    const empty = new Uint8Array(size);
    for (let p = 0; p < size; p++) empty[p] = filled[p] ? 0 : 1;
    const { dist2 } = distanceTransform(empty, width, height);
    for (let p = 0; p < size; p++) {
      if (!filled[p]) continue;
      const cover = coverage(o.px, dist2[p]);
      if (cover <= 0) continue;
      const [r, g, b] = lineRgb(p);
      const i = p * 4;
      data[i] += (r - data[i]) * cover;
      data[i + 1] += (g - data[i + 1]) * cover;
      data[i + 2] += (b - data[i + 2]) * cover;
    }
  }

  if (o.mode === 'outer' || o.mode === 'both') {
    const { dist2, nearest } = distanceTransform(filled, width, height);
    // Colours/alphas must come from the image BEFORE outer pixels are written.
    const src = data.slice();
    /**
     * Outline strength at feature pixel q: the strongest alpha in its 3×3 neighbourhood, so an
     * anti-aliased edge pixel doesn't make the outline see-through, while a faded layer still
     * gives a faded outline.
     * @param {number} q
     */
    const refAlpha = (q) => {
      const qx = q % width;
      const qy = (q - qx) / width;
      let a = 0;
      for (let y = Math.max(0, qy - 1); y <= Math.min(height - 1, qy + 1); y++) {
        for (let x = Math.max(0, qx - 1); x <= Math.min(width - 1, qx + 1); x++) {
          const v = src[(y * width + x) * 4 + 3];
          if (v > a) a = v;
        }
      }
      return a;
    };
    for (let p = 0; p < size; p++) {
      if (filled[p]) continue;
      const q = nearest[p];
      if (q < 0) continue;
      const cover = coverage(o.px, dist2[p]);
      if (cover <= 0) continue;
      const lineA = (cover * refAlpha(q)) / 255;
      const rgb =
        o.colorMode === 'custom'
          ? o.color
          : [src[q * 4] * keep, src[q * 4 + 1] * keep, src[q * 4 + 2] * keep];
      // Existing (anti-aliased edge) pixel drawn OVER the outline.
      const i = p * 4;
      const a = data[i + 3] / 255;
      const outA = a + lineA * (1 - a);
      if (outA <= 0) continue;
      for (let c = 0; c < 3; c++) {
        data[i + c] = (data[i + c] * a + rgb[c] * lineA * (1 - a)) / outA;
      }
      data[i + 3] = outA * 255;
    }
  }
}

/** Outline parameters (ids `outline.*`). Defaults are provisional [Raul]. */
export const OUTLINE_PARAMS = [
  {
    id: 'outline.mode',
    label: 'Outline',
    group: 'Outline',
    type: 'enum',
    options: [
      { value: 'off', label: 'Off' },
      { value: 'outer', label: 'Outer' },
      { value: 'inner', label: 'Inner' },
      { value: 'both', label: 'Inner + outer' },
    ],
    default: 'off',
    tooltip: 'Outer grows the shape outward; inner draws inside its edge',
  },
  {
    id: 'outline.px',
    label: 'Thickness',
    group: 'Outline',
    type: 'float',
    min: 0.5,
    max: 32,
    step: 0.5,
    default: 2,
    unit: 'px',
    tooltip: 'In effect pixels (scales with export size and Pixel Mode)',
  },
  {
    id: 'outline.colorMode',
    label: 'Colour',
    group: 'Outline',
    type: 'enum',
    options: [
      { value: 'darken', label: 'Darken fill' },
      { value: 'custom', label: 'Custom colour' },
    ],
    default: 'darken',
    tooltip: 'Darken fill: each outline pixel is the colour it touches, darker',
  },
  {
    id: 'outline.darken',
    label: 'Darken',
    group: 'Outline',
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.6,
    tooltip: 'How much darker than the fill (Darken fill mode)',
  },
  {
    id: 'outline.color',
    label: 'Custom colour',
    group: 'Outline',
    type: 'color',
    default: '#1a0e12',
    tooltip: 'Used in Custom colour mode',
  },
];

/**
 * Layer post-process: outline the layer's own surface (before it is blended into the effect).
 * @param {CanvasRenderingContext2D} ctx layer surface, identity transform
 * @param {Record<string, any>} params
 * @param {{ scale: number, width: number, height: number }} info
 */
export function outlineLayer(ctx, params, info) {
  const mode = params['outline.mode'];
  if (!mode || mode === 'off') return;
  const px = (params['outline.px'] ?? 2) * info.scale;
  // Only process the area that matters: the layer's visible pixels plus the outline width.
  const box = alphaBounds(ctx.getImageData(0, 0, info.width, info.height));
  if (!box) return;
  const pad = Math.ceil(px) + 2;
  const x0 = Math.max(0, box.x0 - pad);
  const y0 = Math.max(0, box.y0 - pad);
  const x1 = Math.min(info.width, box.x1 + pad);
  const y1 = Math.min(info.height, box.y1 + pad);
  const img = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  const n = Number.parseInt(String(params['outline.color'] ?? '#000000').slice(1, 7), 16);
  applyOutline(img, {
    mode,
    px,
    colorMode: params['outline.colorMode'] ?? 'darken',
    darken: params['outline.darken'] ?? 0.6,
    color: [(n >> 16) & 255, (n >> 8) & 255, n & 255],
  });
  ctx.putImageData(img, x0, y0);
}

/**
 * Bounding box of all pixels with any alpha, or null if the image is empty.
 * @param {{ data: Uint8ClampedArray, width: number, height: number }} img
 * @returns {{ x0: number, y0: number, x1: number, y1: number } | null} x1/y1 exclusive
 */
export function alphaBounds(img) {
  const { data, width, height } = img;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}
