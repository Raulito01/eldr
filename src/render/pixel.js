// @ts-check
/**
 * Pixel Mode (C1, D-085; brief §5): turns any finished frame into clean pixel art. A
 * post-process on the composited frame, so every effect supports it:
 *   1. area-average down to the target grid (premultiplied colour, separate alpha);
 *   2. alpha cutoff → every pixel fully solid or fully transparent;
 *   3. colours snapped to a palette (auto from the effect's ramps, a built-in one, or an
 *      imported Lospec .hex), optionally with ordered (Bayer) dithering;
 *   4. cleanup (stray single pixels removed);
 *   5. a 1-px outer or inner outline.
 * The palette is fixed per effect (never adapted per frame), so colours never flicker. Pure and
 * deterministic: plain RGBA arrays in, plain RGBA arrays out.
 */

import { parseHex, toHex } from '../core/color.js';
import { framePixels, textureFrames } from './textures.js';

const G = 'Pixel Mode';

/** Built-in palettes (exact colours). */
export const PIXEL_PALETTES = Object.freeze({
  pico8: {
    label: 'PICO-8 (16)',
    colors: [
      '#000000',
      '#1d2b53',
      '#7e2553',
      '#008751',
      '#ab5236',
      '#5f574f',
      '#c2c3c7',
      '#fff1e8',
      '#ff004d',
      '#ffa300',
      '#ffec27',
      '#00e436',
      '#29adff',
      '#83769c',
      '#ff77a8',
      '#ffccaa',
    ],
  },
  sweetie16: {
    label: 'Sweetie 16',
    colors: [
      '#1a1c2c',
      '#5d275d',
      '#b13e53',
      '#ef7d57',
      '#ffcd75',
      '#a7f070',
      '#38b764',
      '#257179',
      '#29366f',
      '#3b5dc9',
      '#41a6f6',
      '#73eff7',
      '#f4f4f4',
      '#94b0c2',
      '#566c86',
      '#333c57',
    ],
  },
  gameboy: {
    label: 'Game Boy (4)',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  },
});

/** Pixel Mode settings (ids `pixel.*`, part of the effect's globals: saved with the file). */
export const PIXEL_PARAMS = [
  {
    id: 'pixel.enabled',
    label: 'Pixel Mode',
    group: G,
    type: 'bool',
    default: false,
    tooltip: 'Turn the effect into pixel art (preview and every export)',
  },
  {
    id: 'pixel.size',
    label: 'Pixels across',
    group: G,
    type: 'int',
    min: 8,
    max: 512,
    default: 64,
    unit: 'px',
    tooltip: 'Width of the pixel-art frame (the height follows the frame shape)',
  },
  {
    id: 'pixel.alphaCutoff',
    label: 'Alpha cutoff',
    group: G,
    type: 'float',
    min: 0.02,
    max: 0.98,
    step: 0.01,
    default: 0.4,
    tooltip: 'Coverage needed for a pixel to be solid. Lower = fuller shapes, glows count more',
  },
  {
    id: 'pixel.palette',
    label: 'Palette',
    group: G,
    type: 'enum',
    default: 'auto',
    options: [
      { value: 'auto', label: 'Auto (from the effect’s ramps)' },
      ...Object.entries(PIXEL_PALETTES).map(([value, p]) => ({ value, label: p.label })),
      { value: 'custom', label: 'Imported (.hex)' },
      { value: 'none', label: 'Keep colours (no palette)' },
    ],
  },
  {
    id: 'pixel.colors',
    label: 'Auto colours',
    group: G,
    type: 'int',
    min: 2,
    max: 32,
    default: 8,
    tooltip: 'How many colours the Auto palette picks from the effect’s ramps',
  },
  {
    id: 'pixel.dither',
    label: 'Dither',
    group: G,
    type: 'enum',
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'bayer2', label: 'Bayer 2×2' },
      { value: 'bayer4', label: 'Bayer 4×4' },
    ],
  },
  {
    id: 'pixel.ditherStrength',
    label: 'Dither strength',
    group: G,
    type: 'float',
    min: 0,
    max: 1,
    step: 0.01,
    default: 0.5,
  },
  {
    id: 'pixel.outline',
    label: 'Outline',
    group: G,
    type: 'enum',
    default: 'none',
    options: [
      { value: 'none', label: 'None' },
      { value: 'outer', label: 'Outer (1 px around)' },
      { value: 'inner', label: 'Inner (1 px edge)' },
    ],
  },
  {
    id: 'pixel.outlineColor',
    label: 'Outline colour',
    group: G,
    type: 'color',
    default: '#00000000',
    tooltip: 'Transparent = the darkest palette colour',
  },
  {
    id: 'pixel.cleanup',
    label: 'Remove stray pixels',
    group: G,
    type: 'bool',
    default: true,
    tooltip: 'Single solid pixels with no solid neighbour disappear',
  },
  {
    id: 'pixel.snap',
    label: 'Snap to pixel grid',
    group: G,
    type: 'bool',
    default: true,
    tooltip:
      'Layers and particles sit on whole art pixels, so slow movement steps cleanly instead of shimmering',
  },
  {
    id: 'pixel.snapParticles',
    label: 'Snap particles too',
    group: G,
    type: 'bool',
    default: false,
    tooltip:
      'Also put every particle on whole pixels. Good for slow, steady particles; jittery ones (flames) flicker more',
  },
  {
    id: 'pixel.customPalette',
    label: 'Imported palette',
    group: G,
    type: 'ramp',
    default: [
      { pos: 0, color: '#000000' },
      { pos: 1, color: '#ffffff' },
    ],
    hidden: true,
  },
];

/** @param {Record<string, any>} g globals */
export const readPixel = (g) => ({
  enabled: g['pixel.enabled'] === true,
  size: g['pixel.size'] ?? 64,
  alphaCutoff: g['pixel.alphaCutoff'] ?? 0.4,
  palette: g['pixel.palette'] ?? 'auto',
  colors: g['pixel.colors'] ?? 8,
  dither: g['pixel.dither'] ?? 'none',
  ditherStrength: g['pixel.ditherStrength'] ?? 0.5,
  outline: g['pixel.outline'] ?? 'none',
  outlineColor: g['pixel.outlineColor'] ?? '#00000000',
  cleanup: g['pixel.cleanup'] ?? true,
  snap: g['pixel.snap'] ?? true,
  snapParticles: g['pixel.snapParticles'] ?? false,
  customPalette: /** @type {{ pos: number, color: string }[]} */ (g['pixel.customPalette'] ?? []),
});

/** @typedef {ReturnType<typeof readPixel>} PixelSettings */
/** @typedef {{ width: number, height: number, data: Uint8ClampedArray }} Pixels */

/** Target grid for a frame. @param {number} w @param {number} h @param {number} size */
export const pixelGrid = (w, h, size) => ({
  width: Math.max(1, Math.round(size)),
  height: Math.max(1, Math.round((size * h) / w)),
});

/**
 * Lospec `.hex` file (one RRGGBB per line) → '#rrggbb' list. Other lines are ignored.
 * @param {string} text
 */
export function parseHexPalette(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*#?([0-9a-f]{6})\s*$/i.exec(line);
    if (m) out.push(`#${m[1].toLowerCase()}`);
  }
  return out;
}

/** Palette colours as stops (stored in `pixel.customPalette`). @param {string[]} colors */
export const paletteToStops = (colors) =>
  colors.map((color, i) => ({ pos: colors.length > 1 ? i / (colors.length - 1) : 0, color }));

/**
 * Median cut: `n` colours representing `samples` (deterministic).
 * @param {number[][]} samples rgb 0–255 @param {number} n
 * @returns {number[][]}
 */
export function medianCut(samples, n) {
  if (!samples.length) return [[0, 0, 0]];
  /** @type {number[][][]} */
  const boxes = [samples];
  while (boxes.length < n) {
    // split the box with the widest channel range
    let best = -1;
    let bestRange = 0;
    let bestCh = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255;
        let hi = 0;
        for (const c of b) {
          if (c[ch] < lo) lo = c[ch];
          if (c[ch] > hi) hi = c[ch];
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          best = i;
          bestCh = ch;
        }
      }
    });
    if (best < 0 || bestRange === 0) break;
    const b = [...boxes[best]].sort((p, q) => p[bestCh] - q[bestCh] || p[0] - q[0] || p[1] - q[1]);
    const mid = Math.floor(b.length / 2);
    boxes.splice(best, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => {
    const s = [0, 0, 0];
    for (const c of b) for (let ch = 0; ch < 3; ch++) s[ch] += c[ch];
    return s.map((v) => Math.round(v / b.length));
  });
}

/**
 * Auto palette from colour ramps: each ramp sampled along its length, median-cut to `n`.
 * The lightest and darkest samples are always kept (white cores, dark outlines).
 * @param {{ pos: number, color: string }[][]} ramps @param {number} n
 * @param {number[][]} [extra]  more colour samples (e.g. from imported images, D-089)
 * @returns {string[]}
 */
export function autoPalette(ramps, n, extra = []) {
  /** @type {number[][]} */
  const samples = [...extra];
  for (const r of ramps) {
    if (!Array.isArray(r) || !r.length) continue;
    const stops = [...r]
      .sort((a, b) => a.pos - b.pos)
      .map((s) => ({ pos: s.pos, c: parseHex(s.color) }));
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      let k = 0;
      while (k < stops.length - 1 && stops[k + 1].pos < t) k++;
      const a = stops[k];
      const b = stops[Math.min(stops.length - 1, k + 1)];
      const u = b.pos > a.pos ? Math.min(1, Math.max(0, (t - a.pos) / (b.pos - a.pos))) : 0;
      samples.push([0, 1, 2].map((ch) => a.c[ch] + (b.c[ch] - a.c[ch]) * u));
    }
  }
  if (!samples.length) return ['#000000', '#ffffff'];
  const lum = (/** @type {number[]} */ c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  let light = samples[0];
  let dark = samples[0];
  for (const c of samples) {
    if (lum(c) > lum(light)) light = c;
    if (lum(c) < lum(dark)) dark = c;
  }
  const picked = n > 2 ? medianCut(samples, n - 2) : [];
  const all = [light, dark, ...picked].map((c) => toHex([c[0], c[1], c[2], 255]));
  return [...new Set(all)];
}

/** Every colour ramp used by a document's layers (and precomps). @param {{ layers: any[], comps?: Record<string, any> }} doc */
export function rampsOf(doc) {
  const out = [];
  const visit = (/** @type {any[]} */ layers) => {
    for (const l of layers) {
      if (l.enabled === false) continue;
      // an Image layer in its original colours doesn't show its ramp
      if (l.type === 'image' && (l.params?.['image.color'] ?? 'original') === 'original') continue;
      for (const id of ['style.ramp', 'gmap.ramp'])
        if (Array.isArray(l.params?.[id])) out.push(l.params[id]);
    }
  };
  visit(doc.layers);
  for (const c of Object.values(doc.comps ?? {})) visit(c.layers ?? []);
  return out;
}

/**
 * The palette a document's pixel settings use (null = keep colours).
 * @param {PixelSettings} p @param {{ layers: any[], comps?: Record<string, any> }} doc
 * @returns {string[] | null}
 */
export function paletteFor(p, doc) {
  if (p.palette === 'none') return null;
  if (p.palette === 'custom') return p.customPalette.map((s) => s.color);
  const builtIn = /** @type {any} */ (PIXEL_PALETTES)[p.palette];
  if (builtIn) return [...builtIn.colors];
  // Image layers in Original colours bring their own colours (hand-drawn art keeps its look)
  return autoPalette(rampsOf(doc), p.colors, imageSamples(doc));
}

/**
 * Colour samples of the images that Image layers show in their original colours (up to 8
 * drawings each, ~3000 samples per image, solid pixels only). Images not decoded yet give none.
 * @param {{ layers: any[], comps?: Record<string, any> }} doc @returns {number[][]}
 */
export function imageSamples(doc) {
  /** @type {number[][]} */
  const out = [];
  const layers = [doc.layers, ...Object.values(doc.comps ?? {}).map((c) => c.layers ?? [])].flat();
  for (const l of layers) {
    if (l.type !== 'image' || !l.texture || l.enabled === false) continue;
    if ((l.params?.['image.color'] ?? 'original') !== 'original') continue;
    const frames = textureFrames(l.texture);
    if (!frames?.length) continue;
    const step = Math.max(1, Math.floor(frames.length / 8));
    for (let f = 0; f < frames.length; f += step) {
      const d = framePixels(frames[f]);
      const every = Math.max(1, Math.floor(d.length / 4 / 3000));
      for (let i = 0; i < d.length; i += 4 * every)
        if (d[i + 3] > 128) out.push([d[i], d[i + 1], d[i + 2]]);
    }
  }
  return out;
}

const BAYER2 = [0, 2, 3, 1];
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/**
 * Area-average resample of premultiplied channels (separable, exact fractional coverage).
 * @param {Uint8ClampedArray} src @param {number} sw @param {number} sh @param {number} tw @param {number} th
 * @returns {Float32Array} tw*th*4 (premultiplied r, g, b, alpha 0–1)
 */
function downsample(src, sw, sh, tw, th) {
  // weights of source columns / rows for each target column / row
  const spans = (/** @type {number} */ s, /** @type {number} */ t) => {
    const k = s / t;
    /** @type {{ i: number, w: number }[][]} */
    const out = [];
    for (let j = 0; j < t; j++) {
      const a = j * k;
      const b = (j + 1) * k;
      const list = [];
      for (let i = Math.floor(a); i < Math.min(s, Math.ceil(b)); i++) {
        const w = Math.min(b, i + 1) - Math.max(a, i);
        if (w > 0) list.push({ i, w: w / k });
      }
      out.push(list);
    }
    return out;
  };
  const cx = spans(sw, tw);
  const cy = spans(sh, th);
  const mid = new Float32Array(tw * sh * 4);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < tw; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const { i, w } of cx[x]) {
        const p = (y * sw + i) * 4;
        const al = src[p + 3] / 255;
        r += src[p] * al * w;
        g += src[p + 1] * al * w;
        b += src[p + 2] * al * w;
        a += al * w;
      }
      const q = (y * tw + x) * 4;
      mid[q] = r;
      mid[q + 1] = g;
      mid[q + 2] = b;
      mid[q + 3] = a;
    }
  }
  const out = new Float32Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const q = (y * tw + x) * 4;
      for (const { i, w } of cy[y]) {
        const p = (i * tw + x) * 4;
        out[q] += mid[p] * w;
        out[q + 1] += mid[p + 1] * w;
        out[q + 2] += mid[p + 2] * w;
        out[q + 3] += mid[p + 3] * w;
      }
    }
  }
  return out;
}

/**
 * Pixel-art version of one frame.
 * @param {Pixels} src  straight-alpha RGBA (any size)
 * @param {PixelSettings} p
 * @param {string[] | null} palette  null = keep colours
 * @returns {Pixels} at the target grid size
 */
export function pixelate(src, p, palette) {
  const { width: tw, height: th } = pixelGrid(src.width, src.height, p.size);
  const avg = downsample(src.data, src.width, src.height, tw, th);
  const out = new Uint8ClampedArray(tw * th * 4);
  const pal = palette?.map((c) => parseHex(c)) ?? null;
  const labs = pal?.map((c) => oklab(c[0], c[1], c[2])) ?? null;
  /** @type {Map<number, number>} */
  const nearestCache = new Map();
  const nearest = (/** @type {number} */ r, /** @type {number} */ g, /** @type {number} */ b) => {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2);
    const hit = nearestCache.get(key);
    if (hit !== undefined) return hit;
    let best = 0;
    let bestD = Infinity;
    const pl = /** @type {number[][]} */ (pal);
    const [L, A, B] = oklab(r, g, b);
    for (let i = 0; i < pl.length; i++) {
      // Oklab: perceptual distance, so a light green maps to green, not to a light grey
      const q = /** @type {number[]} */ (labs)[i];
      const d = (L - q[0]) ** 2 + (A - q[1]) ** 2 + (B - q[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    nearestCache.set(key, best);
    return best;
  };
  const matrix = p.dither === 'bayer2' ? BAYER2 : p.dither === 'bayer4' ? BAYER4 : null;
  const n = p.dither === 'bayer2' ? 2 : 4;
  const spread = 96 * p.ditherStrength;
  const solid = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = y * tw + x;
      const q = i * 4;
      const a = avg[q + 3];
      if (!(a >= p.alphaCutoff) || a <= 1e-6) continue;
      let r = avg[q] / a;
      let g = avg[q + 1] / a;
      let b = avg[q + 2] / a;
      if (matrix && pal) {
        const t = ((matrix[(y % n) * n + (x % n)] + 0.5) / (n * n) - 0.5) * spread;
        r += t;
        g += t;
        b += t;
      }
      r = Math.max(0, Math.min(255, Math.round(r)));
      g = Math.max(0, Math.min(255, Math.round(g)));
      b = Math.max(0, Math.min(255, Math.round(b)));
      if (pal) {
        const c = pal[nearest(r, g, b)];
        r = c[0];
        g = c[1];
        b = c[2];
      }
      out[q] = r;
      out[q + 1] = g;
      out[q + 2] = b;
      out[q + 3] = 255;
      solid[i] = 1;
    }
  }
  const at = (/** @type {number} */ x, /** @type {number} */ y) =>
    x >= 0 && y >= 0 && x < tw && y < th ? solid[y * tw + x] : 0;
  if (p.cleanup) {
    const drop = [];
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        if (!solid[y * tw + x]) continue;
        let nb = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) nb++;
        if (!nb) drop.push(y * tw + x);
      }
    for (const i of drop) {
      solid[i] = 0;
      out[i * 4 + 3] = 0;
    }
  }
  if (p.outline !== 'none') {
    const oc = parseHex(p.outlineColor);
    let col = oc;
    if (oc[3] === 0) {
      // the darkest palette colour (or near black when colours are kept)
      const lum = (/** @type {number[]} */ c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      col = pal ? pal.reduce((m, c) => (lum(c) < lum(m) ? c : m), pal[0]) : [20, 14, 24, 255];
    }
    const edge4 = (/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ v) =>
      at(x - 1, y) === v || at(x + 1, y) === v || at(x, y - 1) === v || at(x, y + 1) === v;
    const mark = [];
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const s = solid[y * tw + x];
        if (p.outline === 'outer' ? !s && edge4(x, y, 1) : s && edge4(x, y, 0))
          mark.push(y * tw + x);
      }
    for (const i of mark) {
      out[i * 4] = col[0];
      out[i * 4 + 1] = col[1];
      out[i * 4 + 2] = col[2];
      out[i * 4 + 3] = 255;
    }
  }
  return { width: tw, height: th, data: out };
}

/**
 * Nearest-neighbour integer upscale (exports at 2× / 3× / 4×).
 * @param {Pixels} p @param {number} k
 * @returns {Pixels}
 */
export function upscaleNearest(p, k) {
  const s = Math.max(1, Math.round(k));
  if (s === 1) return p;
  const w = p.width * s;
  const h = p.height * s;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < w; x++) {
      const si = (sy * p.width + Math.floor(x / s)) * 4;
      const di = (y * w + x) * 4;
      out[di] = p.data[si];
      out[di + 1] = p.data[si + 1];
      out[di + 2] = p.data[si + 2];
      out[di + 3] = p.data[si + 3];
    }
  }
  return { width: w, height: h, data: out };
}

/**
 * Output px per art pixel for a render of `renderWidth` px (Pixel Mode snapping, C2), or 0 when
 * snapping is off. @param {PixelSettings} p @param {number} renderWidth
 */
export const snapQuantum = (p, renderWidth) =>
  p.enabled && p.snap ? renderWidth / pixelGrid(renderWidth, 1, p.size).width : 0;

/**
 * Shimmer check (C2, D-086): pixels that flicker — different from the previous frame while the
 * previous and next frames agree (A → B → A). Those are the pixels that buzz in an otherwise
 * still area. All three frames must have the same size.
 * @param {Pixels} prev @param {Pixels} cur @param {Pixels} next
 * @returns {{ mask: Uint8Array, count: number }}
 */
export function shimmerMap(prev, cur, next) {
  const n = cur.width * cur.height;
  const mask = new Uint8Array(n);
  let count = 0;
  const same = (
    /** @type {Uint8ClampedArray} */ a,
    /** @type {Uint8ClampedArray} */ b,
    /** @type {number} */ q,
  ) => a[q] === b[q] && a[q + 1] === b[q + 1] && a[q + 2] === b[q + 2] && a[q + 3] === b[q + 3];
  for (let i = 0; i < n; i++) {
    const q = i * 4;
    if (!same(prev.data, cur.data, q) && same(prev.data, next.data, q)) {
      mask[i] = 1;
      count++;
    }
  }
  return { mask, count };
}

/**
 * Renderer settings for Pixel Mode snapping at a render width (spread into renderFrame settings).
 * @param {PixelSettings} p @param {number} renderWidth
 */
export const snapSettings = (p, renderWidth) => {
  const q = snapQuantum(p, renderWidth);
  return q ? { pixelSnap: q, pixelSnapParticles: p.snapParticles } : {};
};

/** sRGB 0–255 → Oklab [L, a, b] (Björn Ottosson). @param {number} r @param {number} g @param {number} b */
export function oklab(r, g, b) {
  const lin = (/** @type {number} */ v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r);
  const G = lin(g);
  const B = lin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
