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
 * @property {'ellipse'|'rect'|'path'} shape
 * @property {PathVertex[]} [path]  pen-tool shape: vertices in the mask's box, −0.5…0.5
 * @property {boolean} [closed]  pen paths: false = open path (a motion path; never cuts the layer)
 * @property {boolean} [pathOnly]  D-111: a closed shape used only as a motion path (never cuts)
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

/**
 * A pen-tool vertex (3.6d): position and bezier handles (offsets from the vertex), all in units
 * of the mask's size (−0.5 … 0.5 across the box), so Position / Size / Rotation still work.
 * @typedef {{ x: number, y: number, ix: number, iy: number, ox: number, oy: number }} PathVertex
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
  ...(o.path ? { path: o.path.map((v) => ({ ...v })) } : {}),
  ...(o.closed === false ? { closed: false } : {}),
  ...(o.pathOnly === true ? { pathOnly: true } : {}),
});

/**
 * Is this shape only a motion path (it never cuts its layer)? Open pen paths always are;
 * closed shapes when set to "Path only" (D-111).
 * @param {Pick<Mask, 'closed' | 'pathOnly'>} m
 */
export const isPathOnly = (m) => m.closed === false || m.pathOnly === true;

/**
 * A valid pen path (≥ 3 vertices, finite numbers), or null.
 * @param {any} list @returns {PathVertex[] | null}
 */
export function cleanPath(list) {
  if (!Array.isArray(list) || list.length < 3) return null;
  const out = [];
  for (const v of list) {
    if (!v || typeof v !== 'object') return null;
    const n = (/** @type {any} */ x) => (Number.isFinite(x) ? x : 0);
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return null;
    out.push({ x: v.x, y: v.y, ix: n(v.ix), iy: n(v.iy), ox: n(v.ox), oy: n(v.oy) });
  }
  return out;
}

/**
 * Trace a mask's outline (layer space) into the current path of `c`.
 * @param {CanvasRenderingContext2D | Path2D} c @param {Mask} m
 */
export function traceMask(c, m) {
  const a = (m.rotation * Math.PI) / 180;
  const cs = Math.cos(a);
  const sn = Math.sin(a);
  /** mask units → layer px @param {number} u @param {number} v */
  const P = (u, v) => {
    const px = u * m.w;
    const py = v * m.h;
    return /** @type {[number, number]} */ ([m.x + px * cs - py * sn, m.y + px * sn + py * cs]);
  };
  if (m.shape === 'path') {
    const pts = m.path ?? [];
    if (pts.length < 2) return;
    c.moveTo(...P(pts[0].x, pts[0].y));
    const open = m.closed === false;
    for (let i = 1; i <= (open ? pts.length - 1 : pts.length); i++) {
      const p = pts[i - 1];
      const q = pts[i % pts.length];
      c.bezierCurveTo(...P(p.x + p.ox, p.y + p.oy), ...P(q.x + q.ix, q.y + q.iy), ...P(q.x, q.y));
    }
    if (!open) c.closePath();
    return;
  }
  const hw = m.w / 2;
  const hh = m.h / 2;
  if (m.shape === 'rect') {
    c.moveTo(...P(-0.5, -0.5));
    c.lineTo(...P(0.5, -0.5));
    c.lineTo(...P(0.5, 0.5));
    c.lineTo(...P(-0.5, 0.5));
    c.closePath();
    return;
  }
  c.ellipse(m.x, m.y, Math.max(0, hw), Math.max(0, hh), a, 0, Math.PI * 2);
}

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
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#ffffff';
    c.lineJoin = 'round';
    if (m.shape === 'path') {
      // Expansion on a free path: grow with a stroke, shrink by erasing one.
      c.beginPath();
      traceMask(c, m);
      c.fill();
      if (m.expansion !== 0) {
        c.lineWidth = Math.abs(m.expansion) * 2;
        if (m.expansion < 0) c.globalCompositeOperation = 'destination-out';
        c.stroke();
      }
    } else {
      const grown = {
        ...m,
        w: Math.max(0, m.w + 2 * m.expansion),
        h: Math.max(0, m.h + 2 * m.expansion),
      };
      c.beginPath();
      traceMask(c, grown);
      c.fill();
    }
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
    // open pen paths are motion paths: they never cut (as in After Effects)
    const list = masks.filter((m) => m.enabled && !isPathOnly(m));
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
