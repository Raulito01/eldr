// @ts-check
/**
 * Paints one viewport image: background, the frame at its zoom, and overlays.
 * Separate from viewport.js (which owns DOM + interaction) so it can be rendered and checked
 * in Node tests with a real canvas.
 */

import { frameRect } from './viewportMath.js';

const CHECKER_A = '#2b2c33';
const CHECKER_B = '#22232a';
const CHECKER_CELL = 8; // CSS px, fixed on screen regardless of zoom
const ACCENT = '#ff8a3d';

/**
 * @typedef {object} PaintOptions
 * @property {number} dpr                 device pixel ratio
 * @property {import('./viewportMath.js').ViewState} view
 * @property {{ canvas: any } | null} surface  rendered frame to show
 * @property {string | null} background   colour, or null for checker
 * @property {{x: number, y: number}} pivot normalized
 * @property {{ bounds: boolean, pivot: boolean, stats: boolean }} show
 * @property {string} statsText
 * @property {(w: number, h: number) => any} makeCanvas  creates a scratch canvas (checker tile)
 * @property {boolean} [crisp]  never smooth (Pixel Mode: hard pixels at every zoom)
 * @property {{ width: number, height: number } | null} [pixelGrid]  draw the pixel grid
 */

/** @type {WeakMap<CanvasRenderingContext2D, { dpr: number, pattern: CanvasPattern | null }>} */
const checkerCache = new WeakMap();

/** @param {CanvasRenderingContext2D} ctx @param {number} dpr @param {(w: number, h: number) => any} makeCanvas */
function checkerPattern(ctx, dpr, makeCanvas) {
  const cached = checkerCache.get(ctx);
  if (cached && cached.dpr === dpr) return cached.pattern;
  const size = Math.round(CHECKER_CELL * 2 * dpr);
  const tile = makeCanvas(size, size);
  const t = tile.getContext('2d');
  t.fillStyle = CHECKER_B;
  t.fillRect(0, 0, size, size);
  t.fillStyle = CHECKER_A;
  t.fillRect(0, 0, size / 2, size / 2);
  t.fillRect(size / 2, size / 2, size / 2, size / 2);
  const pattern = ctx.createPattern(tile, 'repeat');
  checkerCache.set(ctx, { dpr, pattern });
  return pattern;
}

/** Perceived brightness check, so overlays stay readable on light backgrounds. @param {string|null} color */
export function isLightColor(color) {
  if (!color) return false;
  const n = Number.parseInt(color.slice(1, 7), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 150;
}

/**
 * @param {CanvasRenderingContext2D} ctx  context of the viewport canvas (device-pixel sized)
 * @param {PaintOptions} o
 */
export function paintViewport(ctx, o) {
  const { dpr, view } = o;
  const pw = ctx.canvas.width;
  const ph = ctx.canvas.height;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle =
    o.background ?? /** @type {CanvasPattern} */ (checkerPattern(ctx, dpr, o.makeCanvas));
  ctx.fillRect(0, 0, pw, ph);

  // Snap the frame to whole device pixels so zoomed-in pixels stay square and sharp.
  const r = frameRect(view);
  const x = Math.round(r.x * dpr);
  const y = Math.round(r.y * dpr);
  const w = Math.round(r.w * dpr);
  const h = Math.round(r.h * dpr);

  if (o.surface) {
    ctx.imageSmoothingEnabled = !o.crisp && view.zoom < 1; // zoomed in: exact pixels; zoomed out: smooth
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(o.surface.canvas, x, y, w, h);
  }
  // Pixel Mode grid: thin lines between the art's pixels, once they are big enough to see
  const g = o.pixelGrid;
  if (g && w / g.width >= 5 * dpr) {
    ctx.save();
    ctx.strokeStyle = isLightColor(o.background) ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < g.width; i++) {
      const gx = Math.round(x + (i * w) / g.width) + 0.5;
      ctx.moveTo(gx, y);
      ctx.lineTo(gx, y + h);
    }
    for (let j = 1; j < g.height; j++) {
      const gy = Math.round(y + (j * h) / g.height) + 0.5;
      ctx.moveTo(x, gy);
      ctx.lineTo(x + w, gy);
    }
    ctx.stroke();
    ctx.restore();
  }

  const ink = isLightColor(o.background) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.45)';
  if (o.show.bounds) {
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
    ctx.restore();
  }
  if (o.show.pivot) {
    const px = Math.round(x + o.pivot.x * w) + 0.5;
    const py = Math.round(y + o.pivot.y * h) + 0.5;
    const arm = 9 * dpr;
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.round(dpr));
    ctx.strokeStyle = ACCENT;
    ctx.beginPath();
    ctx.moveTo(px - arm, py);
    ctx.lineTo(px + arm, py);
    ctx.moveTo(px, py - arm);
    ctx.lineTo(px, py + arm);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(px, py, 3.5 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (o.show.stats) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    const tw = ctx.measureText(o.statsText).width;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, 8, tw + 12, 20);
    ctx.fillStyle = '#e6e6ea';
    ctx.textBaseline = 'middle';
    ctx.fillText(o.statsText, 14, 18);
    ctx.restore();
  }
}
