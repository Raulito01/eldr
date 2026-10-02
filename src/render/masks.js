// @ts-check
/**
 * Masks and track mattes (3.6d, D-064), as in After Effects.
 *
 * MASKS cut a layer with shapes drawn in the layer's own space (they move with it): ellipse or
 * rectangle with position, size, rotation, feather, expansion, opacity, inverted and a mode —
 * Add (union), Subtract, Intersect — combined top to bottom. If the first mask subtracts, the
 * layer starts fully visible.
 *
 * TRACK MATTES use another layer's pixels as this layer's visibility: Alpha, Alpha inverted,
 * Luma, Luma inverted. The matte layer is rendered for this, whether it is visible or not.
 */

/** @typedef {import('./canvas2d/backend.js').Surface} Surface */

/**
 * @typedef {object} Mask
 * @property {string} id
 * @property {string} name
 * @property {boolean} enabled
 * @property {'ellipse'|'rect'} shape
 * @property {'add'|'subtract'|'intersect'} mode
 * @property {boolean} inverted
 * @property {number} x  centre, layer px
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {number} rotation  degrees
 * @property {number} feather   px (soft edge width)
 * @property {number} expansion px (grow / shrink the shape)
 * @property {number} opacity   0–100
 */

/** Animatable mask fields (numbers). */
export const MASK_NUMBERS = Object.freeze([
  'x',
  'y',
  'w',
  'h',
  'rotation',
  'feather',
  'expansion',
  'opacity',
]);
export const MASK_LABELS = Object.freeze({
  x: 'Position X',
  y: 'Position Y',
  w: 'Width',
  h: 'Height',
  rotation: 'Rotation',
  feather: 'Feather',
  expansion: 'Expansion',
  opacity: 'Opacity',
});
export const MASK_MODES = Object.freeze(['add', 'subtract', 'intersect']);
export const MATTE_MODES = Object.freeze(['alpha', 'alphaInverted', 'luma', 'lumaInverted']);
export const MATTE_LABELS = Object.freeze({
  alpha: 'Alpha matte',
  alphaInverted: 'Alpha inverted matte',
  luma: 'Luma matte',
  lumaInverted: 'Luma inverted matte',
});

/**
 * A new mask with sensible defaults.
 * @param {string} id @param {Partial<Mask>} [o] @returns {Mask}
 */
export const makeMask = (id, o = {}) => ({
  id,
  name: o.name ?? `Mask ${id.replace(/\D/g, '') || 1}`,
  enabled: o.enabled ?? true,
  shape: o.shape ?? 'ellipse',
  mode: o.mode ?? 'add',
  inverted: o.inverted ?? false,
  x: o.x ?? 0,
  y: o.y ?? 0,
  w: o.w ?? 160,
  h: o.h ?? 160,
  rotation: o.rotation ?? 0,
  feather: o.feather ?? 0,
  expansion: o.expansion ?? 0,
  opacity: o.opacity ?? 100,
});

/**
 * Clear a surface, optionally filled white.
 * @param {Surface} s @param {boolean} fill
 */
function reset(s, fill) {
  const c = s.ctx;
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalCompositeOperation = 'source-over';
  c.globalAlpha = 1;
  c.filter = 'none';
  c.clearRect(0, 0, s.width, s.height);
  if (fill) {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, s.width, s.height);
  }
  c.restore();
}

/**
 * Masking pass bound to a backend (owns scratch surfaces).
 * @param {import('./canvas2d/backend.js').Backend} backend
 * @param {ReturnType<typeof import('./glow.js').createGlowPass>} blurPass  for feather
 */
export function createMaskPass(backend, blurPass) {
  /** @type {Record<string, Surface>} */
  const surf = {};
  /** @param {string} k @param {number} w @param {number} h */
  const get = (k, w, h) => {
    if (!surf[k]) surf[k] = backend.createSurface(w, h);
    else backend.resize(surf[k], w, h);
    return surf[k];
  };

  /**
   * Draw one mask shape (white) into `s` with the layer transform.
   * @param {Surface} s @param {Mask} m @param {DOMMatrix2DInit | number[]} base layer→output matrix
   */
  function drawShape(s, m, base) {
    const c = s.ctx;
    c.save();
    const b = /** @type {number[]} */ (base);
    c.setTransform(b[0], b[1], b[2], b[3], b[4], b[5]);
    c.translate(m.x, m.y);
    c.rotate((m.rotation * Math.PI) / 180);
    const hw = Math.max(0, m.w / 2 + m.expansion);
    const hh = Math.max(0, m.h / 2 + m.expansion);
    c.fillStyle = '#ffffff';
    c.beginPath();
    if (m.shape === 'rect') c.rect(-hw, -hh, hw * 2, hh * 2);
    else c.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  /**
   * The combined mask of a layer as a white-with-alpha surface (null = no enabled masks).
   * @param {Mask[]} masks
   * @param {{ width: number, height: number, scale: number, base: number[] }} info
   *   base = layer → output pixels matrix (scale, pivot and the layer's own transform)
   * @returns {Surface | null}
   */
  function build(masks, info) {
    const list = masks.filter((m) => m.enabled);
    if (!list.length) return null;
    const { width: W, height: H } = info;
    const out = get('mask', W, H);
    reset(out, list[0].mode !== 'add');
    const one = get('one', W, H);
    for (const m of list) {
      reset(one, false);
      drawShape(one, m, info.base);
      /** @type {any} */
      let src = one.canvas;
      const r = (m.feather * info.scale) / 2;
      if (r >= 0.5) {
        const blurred = get('feather', W, H);
        blurPass.blurSurface(W, H);
        blurPass.blurInto(blurred, one.canvas, r);
        src = blurred.canvas;
      }
      if (m.inverted) {
        const inv = get('inv', W, H);
        reset(inv, true);
        inv.ctx.save();
        inv.ctx.globalCompositeOperation = 'destination-out';
        inv.ctx.drawImage(src, 0, 0);
        inv.ctx.restore();
        src = inv.canvas;
      }
      const c = out.ctx;
      c.save();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = Math.min(1, Math.max(0, m.opacity / 100));
      c.globalCompositeOperation =
        m.mode === 'subtract'
          ? 'destination-out'
          : m.mode === 'intersect'
            ? 'destination-in'
            : 'source-over';
      if (m.mode === 'intersect') c.globalAlpha = 1;
      c.drawImage(src, 0, 0);
      c.restore();
    }
    return out;
  }

  /**
   * Turn a rendered matte layer into an alpha mask (in place: white, alpha = visibility).
   * @param {Surface} s @param {string} mode one of MATTE_MODES @param {number} opacity 0–1
   */
  function matteToMask(s, mode, opacity) {
    const img = s.ctx.getImageData(0, 0, s.width, s.height);
    const d = img.data;
    const luma = mode === 'luma' || mode === 'lumaInverted';
    const inv = mode === 'alphaInverted' || mode === 'lumaInverted';
    for (let o = 0; o < d.length; o += 4) {
      const a = (d[o + 3] / 255) * opacity;
      let v = luma ? ((0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255) * a : a;
      if (inv) v = 1 - v;
      d[o] = 255;
      d[o + 1] = 255;
      d[o + 2] = 255;
      d[o + 3] = Math.round(v * 255);
    }
    s.ctx.putImageData(img, 0, 0);
  }

  /**
   * Keep only what the mask shows: dst = dst × mask alpha.
   * @param {CanvasRenderingContext2D} dst @param {any} maskCanvas
   */
  function cut(dst, maskCanvas) {
    dst.save();
    dst.setTransform(1, 0, 0, 1, 0, 0);
    dst.globalAlpha = 1;
    dst.globalCompositeOperation = 'destination-in';
    dst.drawImage(maskCanvas, 0, 0);
    dst.restore();
  }

  return { build, matteToMask, cut, surface: get };
}
