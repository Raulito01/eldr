// @ts-check
/**
 * Panel dividers (D-080), After Effects style: drag the bar between two panels to resize them;
 * double-click it to reset. Pen-friendly: a wide grab area, pointer capture while dragging.
 * The layout itself is CSS grid sized by custom properties; this only changes those numbers.
 */

/**
 * @typedef {object} SplitterOptions
 * @property {'x' | 'y'} axis  x = a vertical bar dragged sideways, y = a horizontal bar dragged up / down
 * @property {() => number} get  current size (px) of the panel this bar resizes
 * @property {(px: number) => void} set
 * @property {() => [number, number]} limits  [min, max] px right now
 * @property {number} sign  +1: dragging right / down GROWS the panel; −1: it shrinks it
 * @property {() => void} reset  double-click
 * @property {() => void} [done]  drag finished (save)
 */

/**
 * Turn an element into a divider.
 * @param {HTMLElement} bar @param {SplitterOptions} o
 */
export function makeSplitter(bar, o) {
  /** @type {{ id: number, start: number, size: number } | null} */
  let drag = null;
  const coord = (/** @type {PointerEvent} */ e) => (o.axis === 'x' ? e.clientX : e.clientY);
  const clamp = (/** @type {number} */ v) => {
    const [lo, hi] = o.limits();
    return Math.round(Math.min(Math.max(lo, hi), Math.max(lo, v)));
  };
  bar.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    drag = { id: e.pointerId, start: coord(e), size: o.get() };
    bar.setPointerCapture(e.pointerId);
    bar.classList.add('dragging');
    document.body.classList.add(o.axis === 'x' ? 'resizing-x' : 'resizing-y');
  });
  bar.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.buttons === 0) return end(e); // D-113: missed release
    o.set(clamp(drag.size + o.sign * (coord(e) - drag.start)));
  });
  const end = (/** @type {PointerEvent} */ e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    bar.classList.remove('dragging');
    document.body.classList.remove('resizing-x', 'resizing-y');
    o.done?.();
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('lostpointercapture', end);
  bar.addEventListener('pointercancel', end);
  bar.addEventListener('dblclick', () => {
    o.reset();
    o.done?.();
  });
}

/** Clamp a size into [min, max] (max wins if they cross). @param {number} v @param {number} min @param {number} max */
export const clampSize = (v, min, max) =>
  Math.round(Math.min(Math.max(min, max), Math.max(min, v)));
