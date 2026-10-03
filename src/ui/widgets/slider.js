// @ts-check
/**
 * ELDR slider: replaces the native <input type="range">, which often can't be DRAGGED with a pen
 * tablet (Wacom) on macOS — the press jumps the value but the drag never starts.
 *
 * - Press anywhere on the slider: the value jumps there and dragging starts immediately; the
 *   pointer is captured, so dragging keeps working outside the slider.
 * - Hold Shift while dragging: 10× finer, relative adjustment.
 * - Keyboard: ←/↓ and →/↑ step (Shift = ×10), Home/End = min/max.
 */

import { h } from '../dom.js';

/** Fine-adjust factor while Shift is held. */
export const FINE_FACTOR = 0.1;

/**
 * Value under a horizontal position on the track (clamped to min–max).
 * @param {number} x px from the track's left edge @param {number} width track width px
 * @param {number} min @param {number} max
 */
export function valueAtX(x, width, min, max) {
  if (width <= 0) return min;
  const t = Math.min(1, Math.max(0, x / width));
  return min + t * (max - min);
}

/**
 * @param {{ min: number, max: number, step?: number, value: number, label?: string,
 *           onInput: (value: number) => void }} o
 * @returns {{ el: HTMLElement, set: (value: number) => void }}
 */
export function createSlider(o) {
  const { min, max } = o;
  const step = o.step ?? (max - min) / 100;
  let value = o.value;

  const fill = h('div', { class: 'w-slider-fill' });
  const thumb = h('div', { class: 'w-slider-thumb' });
  const rail = h('div', { class: 'w-slider-rail' }, [fill]);
  const el = h('div', { class: 'w-slider', tabIndex: 0, role: 'slider' }, [rail, thumb]);
  el.setAttribute('aria-valuemin', String(min));
  el.setAttribute('aria-valuemax', String(max));
  if (o.label) el.setAttribute('aria-label', o.label);

  function paint() {
    const t = max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0;
    fill.style.width = `${t * 100}%`;
    thumb.style.left = `${t * 100}%`;
    el.setAttribute('aria-valuenow', String(value));
  }

  /** @type {{ id: number, startX: number, startValue: number } | null} */
  let drag = null;
  const xIn = (/** @type {PointerEvent} */ e) => e.clientX - rail.getBoundingClientRect().left;
  const width = () => rail.getBoundingClientRect().width;

  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return; // pen tip / left button only
    e.preventDefault();
    el.focus();
    el.setPointerCapture(e.pointerId);
    if (!e.shiftKey) o.onInput(valueAtX(xIn(e), width(), min, max));
    drag = { id: e.pointerId, startX: e.clientX, startValue: value };
    el.classList.add('active');
  });
  const end = (/** @type {PointerEvent} */ e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null;
    el.classList.remove('active');
  };
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    // D-113: no button down any more (a missed release): stop, never follow a hovering pointer
    if (e.buttons === 0) {
      end(e);
      return;
    }
    if (e.shiftKey) {
      // Fine mode: relative to where Shift-dragging started.
      const dv = ((e.clientX - drag.startX) / Math.max(1, width())) * (max - min) * FINE_FACTOR;
      o.onInput(Math.min(max, Math.max(min, drag.startValue + dv)));
    } else {
      o.onInput(valueAtX(xIn(e), width(), min, max));
      drag.startX = e.clientX;
      drag.startValue = value;
    }
  });
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('keydown', (e) => {
    const big = e.shiftKey ? 10 : 1;
    let next = null;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = value - step * big;
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step * big;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation(); // don't also step the timeline
    o.onInput(Math.min(max, Math.max(min, next)));
  });

  paint();
  return {
    el,
    set(v) {
      value = v;
      paint();
    },
  };
}
