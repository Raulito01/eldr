// @ts-check
/**
 * Particle textures (4.Pb2, D-068): your own image or PNG sequence as a particle, like Trapcode
 * Particular's sprites.
 *
 * The document keeps each texture as an ASSET (`state.assets[id]`: name + PNG data URLs, one per
 * frame), so files and presets carry them. Rendering needs decoded images, synchronously — so the
 * editor decodes the assets once into this registry (`decodeAssets`) and the texture layer looks
 * them up by id while drawing. Recoloured versions (tint, ramp) are cached per frame and colour.
 */

import { sampleRamp } from './ramp.js';

/**
 * @typedef {object} TextureAsset
 * @property {string} id
 * @property {string} name     shown in the UI (the file name, or the sequence's common name)
 * @property {string[]} frames PNG data URLs, in playback order
 * @property {number} w        size of the frames (px)
 * @property {number} h
 */

/** @typedef {CanvasImageSource & { width: number, height: number }} Img */

/** Decoded frames by asset id. @type {Map<string, Img[]>} */
const decoded = new Map();
/** Decodes in flight. @type {Map<string, Promise<void>>} */
const pending = new Map();

/** @type {(w: number, h: number) => any} */
let makeCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** Canvas factory for recoloured frames (Node tests pass node-canvas). @param {(w: number, h: number) => any} f */
export const setTextureCanvasFactory = (f) => {
  makeCanvas = f;
};

/** Register decoded frames for an asset id (tests, or after decoding). @param {string} id @param {Img[]} frames */
export function setTextureFrames(id, frames) {
  decoded.set(id, frames);
  tinted.delete(id);
}

/** Decoded frames of an asset, or null while not loaded. @param {string} id */
export const textureFrames = (id) => decoded.get(id) ?? null;

/**
 * Decode every asset not decoded yet; resolves when all are ready. `onReady` is called once
 * something new became drawable (the editor redraws).
 * @param {Record<string, TextureAsset> | undefined} assets
 * @param {() => void} [onReady]
 */
export function decodeAssets(assets, onReady) {
  /** @type {Promise<void>[]} */
  const waits = [];
  for (const a of Object.values(assets ?? {})) {
    if (decoded.has(a.id)) continue;
    let p = pending.get(a.id);
    if (!p) {
      p = Promise.all(a.frames.map(decodeUrl))
        .then((imgs) => {
          setTextureFrames(a.id, imgs);
          onReady?.();
        })
        .catch(() => {})
        .finally(() => pending.delete(a.id));
      pending.set(a.id, p);
    }
    waits.push(p);
  }
  return Promise.all(waits).then(() => {});
}

/** @param {string} url @returns {Promise<Img>} */
async function decodeUrl(url) {
  if (typeof createImageBitmap === 'function' && typeof fetch === 'function') {
    const blob = await (await fetch(url)).blob();
    return createImageBitmap(blob);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ── Recolouring ────────────────────────────────────────────────────────────────────────────

/** Colour steps along the ramp that get their own cached copy (fine enough to look smooth). */
export const TINT_STEPS = 32;
/** @type {Map<string, Map<string, any>>} asset id → key → canvas */
const tinted = new Map();
const MAX_TINTED = 4000;
let tintedCount = 0;

/**
 * A frame recoloured: 'tint' multiplies it by one ramp colour (at ramp position `pos`), 'ramp'
 * maps its brightness through the ramp starting at `pos` (bright = pos, dark = further along by
 * `spread`). Alpha is kept. Cached; positions are rounded to TINT_STEPS.
 * @param {string} id asset id @param {number} index frame @param {Img} img
 * @param {'tint' | 'ramp'} mode
 * @param {ReadonlyArray<import('./ramp.js').RampStop>} ramp
 * @param {number} pos 0–1 @param {number} spread @param {number} bands 0 = smooth
 * @param {string} rampKey identity of the ramp (cache key)
 */
export function recoloured(id, index, img, mode, ramp, pos, spread, bands, rampKey) {
  const step = Math.round(Math.min(1, Math.max(0, pos)) * TINT_STEPS);
  const key = `${index}|${mode}|${step}|${spread}|${bands}|${rampKey}`;
  let byKey = tinted.get(id);
  if (!byKey) {
    byKey = new Map();
    tinted.set(id, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  if (tintedCount > MAX_TINTED) {
    tinted.clear();
    tintedCount = 0;
    byKey = new Map();
    tinted.set(id, byKey);
  }
  const w = Math.max(1, Math.round(img.width));
  const h = Math.max(1, Math.round(img.height));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  const p = step / TINT_STEPS;
  const data = ctx.getImageData(0, 0, w, h);
  const d = data.data;
  if (mode === 'tint') {
    const [r, g, b] = sampleRamp(ramp, p);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = (d[i] * r) / 255;
      d[i + 1] = (d[i + 1] * g) / 255;
      d[i + 2] = (d[i + 2] * b) / 255;
    }
  } else {
    // brightness → ramp (a small LUT)
    const lut = new Uint8ClampedArray(256 * 3);
    for (let l = 0; l < 256; l++) {
      let q = Math.min(1, Math.max(0, p + (1 - l / 255) * spread));
      if (bands > 0) q = bands === 1 ? q : Math.round(q * (bands - 1)) / (bands - 1);
      const [r, g, b] = sampleRamp(ramp, q);
      lut[l * 3] = r;
      lut[l * 3 + 1] = g;
      lut[l * 3 + 2] = b;
    }
    for (let i = 0; i < d.length; i += 4) {
      const l = Math.round(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]);
      d[i] = lut[l * 3];
      d[i + 1] = lut[l * 3 + 1];
      d[i + 2] = lut[l * 3 + 2];
    }
  }
  ctx.putImageData(data, 0, 0);
  byKey.set(key, c);
  tintedCount++;
  return c;
}

// ── Sequence playback ──────────────────────────────────────────────────────────────────────

/**
 * Which frame of a sequence a particle shows.
 * @param {'loop' | 'once' | 'life' | 'random'} play
 * @param {number} n frames
 * @param {{ ageS: number, age: number, seed: number }} inst age in seconds and 0–1
 * @param {number} fps @param {boolean} randomStart
 */
export function sequenceFrame(play, n, inst, fps, randomStart) {
  if (n <= 1) return 0;
  const r = ((Math.imul(inst.seed >>> 0, 2654435761) >>> 0) % 100003) / 100003;
  const start = randomStart ? Math.floor(r * n) : 0;
  switch (play) {
    case 'random':
      return Math.floor(r * n);
    case 'life':
      return Math.min(n - 1, Math.floor(Math.max(0, inst.age) * n));
    case 'once':
      return Math.min(n - 1, Math.floor(Math.max(0, inst.ageS) * fps));
    default:
      return (start + Math.floor(Math.max(0, inst.ageS) * fps)) % n;
  }
}

/** Common name of a sequence's files ("fire_0001.png", "fire_0002.png" → "fire"). @param {string[]} names */
export function sequenceName(names) {
  if (!names.length) return 'Texture';
  const base = names[0].replace(/\.[a-z0-9]+$/i, '');
  if (names.length === 1) return base;
  return base.replace(/[\s._-]*\d+$/, '') || base;
}

/** Natural order ("f2" before "f10"). @param {string} a @param {string} b */
export const naturalCompare = (a, b) =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
