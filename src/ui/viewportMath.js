// @ts-check
/**
 * Pure viewport geometry: where the frame sits on screen for a given zoom and pan.
 * All values are in CSS pixels; zoom is screen px per frame px.
 *
 * @typedef {object} ViewState
 * @property {number} frameW  frame width in px
 * @property {number} frameH  frame height in px
 * @property {number} viewW   viewport width in CSS px
 * @property {number} viewH   viewport height in CSS px
 * @property {number} zoom
 * @property {number} panX    offset of the frame centre from the viewport centre, CSS px
 * @property {number} panY
 */

export const ZOOM_MIN = 0.125;
export const ZOOM_MAX = 32;

/** Zoom presets used by the dropdown and by step-zooming (wheel, keys). */
export const ZOOM_STEPS = Object.freeze([
  0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32,
]);

/** @param {number} z */
export const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * Largest zoom at which the whole frame fits with a margin around it.
 * @param {number} frameW @param {number} frameH @param {number} viewW @param {number} viewH
 * @param {number} [margin=24] CSS px kept free on each side
 */
export function fitZoom(frameW, frameH, viewW, viewH, margin = 24) {
  const z = Math.min((viewW - 2 * margin) / frameW, (viewH - 2 * margin) / frameH);
  return clampZoom(z > 0 ? z : ZOOM_MIN);
}

/**
 * Screen rectangle of the frame.
 * @param {ViewState} v
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function frameRect(v) {
  const w = v.frameW * v.zoom;
  const h = v.frameH * v.zoom;
  return { x: v.viewW / 2 - w / 2 + v.panX, y: v.viewH / 2 - h / 2 + v.panY, w, h };
}

/**
 * Change zoom while keeping the frame point under (sx, sy) fixed on screen.
 * @param {ViewState} v
 * @param {number} sx @param {number} sy screen point (CSS px within the viewport)
 * @param {number} newZoom
 * @returns {ViewState}
 */
export function zoomAt(v, sx, sy, newZoom) {
  const zoom = clampZoom(newZoom);
  const r = frameRect(v);
  const fx = (sx - r.x) / v.zoom; // frame coordinates under the cursor
  const fy = (sy - r.y) / v.zoom;
  return {
    ...v,
    zoom,
    panX: sx - fx * zoom - v.viewW / 2 + (v.frameW * zoom) / 2,
    panY: sy - fy * zoom - v.viewH / 2 + (v.frameH * zoom) / 2,
  };
}

/**
 * Next zoom preset above (dir > 0) or below (dir < 0) the current zoom.
 * @param {number} zoom @param {number} dir
 */
export function stepZoom(zoom, dir) {
  if (dir > 0) return ZOOM_STEPS.find((s) => s > zoom + 1e-9) ?? ZOOM_MAX;
  return [...ZOOM_STEPS].reverse().find((s) => s < zoom - 1e-9) ?? ZOOM_MIN;
}
