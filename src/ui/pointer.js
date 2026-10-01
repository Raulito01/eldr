// @ts-check
/**
 * Pointer input that works well with mouse, trackpad, touch AND pen tablets (Wacom etc.).
 *
 * Pen problems this solves:
 * - Pen tips jitter: a tap would become a tiny drag. → Drags start only after moving past a
 *   threshold (bigger for pens).
 * - Native double-click needs two taps very close together, which is hard with a pen.
 *   → Our own double-tap with pen-friendly distance/time tolerance.
 * - Pen side buttons usually send a right-click. → `attachSecondaryClick` handles it
 *   (contextmenu), so it can be used for "remove" instead of opening the browser menu.
 * Only the primary button (pen tip / left mouse) starts drags; the eraser and side buttons don't.
 */

/** Movement (px) before a press becomes a drag, per pointer type. */
export const DRAG_THRESHOLD = Object.freeze({ mouse: 2, pen: 5, touch: 8 });
/** Max distance (px) and time (ms) between two taps of a double-tap. */
export const DOUBLE_TAP = Object.freeze({ ms: 450, dist: { mouse: 6, pen: 14, touch: 20 } });

/** @param {string} type */
export const dragThreshold = (type) =>
  DRAG_THRESHOLD[/** @type {'mouse'|'pen'|'touch'} */ (type)] ?? 2;

/**
 * Has the pointer moved far enough from where it went down to count as a drag?
 * @param {{x: number, y: number}} start @param {{x: number, y: number}} now @param {string} pointerType
 */
export function passedThreshold(start, now, pointerType) {
  const t = dragThreshold(pointerType);
  return (now.x - start.x) ** 2 + (now.y - start.y) ** 2 >= t * t;
}

/**
 * Is this tap the second half of a double-tap?
 * @param {{x: number, y: number, time: number, type: string} | null} prev previous tap
 * @param {{x: number, y: number, time: number, type: string}} tap
 */
export function isDoubleTap(prev, tap) {
  if (!prev || prev.type !== tap.type) return false;
  const dist = DOUBLE_TAP.dist[/** @type {'mouse'|'pen'|'touch'} */ (tap.type)] ?? 6;
  return (
    tap.time - prev.time <= DOUBLE_TAP.ms &&
    (tap.x - prev.x) ** 2 + (tap.y - prev.y) ** 2 <= dist * dist
  );
}

/**
 * @typedef {object} DragHandlers
 * @property {(e: PointerEvent) => boolean} [down]  return false to ignore this press
 * @property {(e: PointerEvent) => void} [start]  movement passed the threshold: drag begins
 * @property {(e: PointerEvent) => void} [move]   called for every move once dragging
 * @property {(e: PointerEvent, dragged: boolean) => void} [up]  press ended (dragged = it was a drag)
 * @property {(e: PointerEvent, isDouble: boolean) => void} [tap] press ended without dragging
 */

/**
 * Attach press / drag / tap / double-tap handling to an element.
 * @param {HTMLElement | SVGElement} el
 * @param {DragHandlers} h
 * @returns {() => void} detach
 */
export function attachPointer(el, h) {
  /** @type {{ id: number, x: number, y: number, type: string } | null} */
  let press = null;
  let dragging = false;
  /** @type {{x: number, y: number, time: number, type: string} | null} */
  let lastTap = null;

  const onDown = (/** @type {PointerEvent} */ e) => {
    if (e.button !== 0) return; // pen tip / left button only
    if (h.down && h.down(e) === false) return;
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, type: e.pointerType || 'mouse' };
    dragging = false;
    el.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  };
  const onMove = (/** @type {PointerEvent} */ e) => {
    if (!press || e.pointerId !== press.id) return;
    if (!dragging) {
      if (!passedThreshold(press, { x: e.clientX, y: e.clientY }, press.type)) return;
      dragging = true;
      h.start?.(e);
    }
    h.move?.(e);
  };
  const onUp = (/** @type {PointerEvent} */ e) => {
    if (!press || e.pointerId !== press.id) return;
    const wasDrag = dragging;
    const type = press.type;
    press = null;
    dragging = false;
    h.up?.(e, wasDrag);
    if (wasDrag) {
      lastTap = null;
      return;
    }
    const tap = { x: e.clientX, y: e.clientY, time: e.timeStamp, type };
    const isDouble = isDoubleTap(lastTap, tap);
    lastTap = isDouble ? null : tap;
    h.tap?.(e, isDouble);
  };
  const onCancel = (/** @type {PointerEvent} */ e) => {
    if (!press || e.pointerId !== press.id) return;
    const wasDrag = dragging;
    press = null;
    dragging = false;
    h.up?.(e, wasDrag);
  };

  el.addEventListener('pointerdown', /** @type {EventListener} */ (onDown));
  el.addEventListener('pointermove', /** @type {EventListener} */ (onMove));
  el.addEventListener('pointerup', /** @type {EventListener} */ (onUp));
  el.addEventListener('pointercancel', /** @type {EventListener} */ (onCancel));
  return () => {
    el.removeEventListener('pointerdown', /** @type {EventListener} */ (onDown));
    el.removeEventListener('pointermove', /** @type {EventListener} */ (onMove));
    el.removeEventListener('pointerup', /** @type {EventListener} */ (onUp));
    el.removeEventListener('pointercancel', /** @type {EventListener} */ (onCancel));
  };
}

/**
 * Right-click / pen side button. Suppresses the browser menu on this element.
 * @param {HTMLElement | SVGElement} el
 * @param {(e: MouseEvent) => void} handler
 */
export function attachSecondaryClick(el, handler) {
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    handler(/** @type {MouseEvent} */ (e));
  });
}
