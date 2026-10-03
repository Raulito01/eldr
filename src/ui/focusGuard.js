// @ts-check
/**
 * Focus guard (D-113): after you use a menu, button, checkbox or slider with the mouse or pen,
 * the keyboard goes back to the editor. Otherwise the control keeps focus and Space (play)
 * re-opens the preset menu or presses the button again, and arrow keys change the menu
 * instead of the frame. Text fields keep focus (you are typing there).
 */

import { isTyping } from './shortcuts.js';

/** @param {Document} doc */
export function installFocusGuard(doc = document) {
  const release = (/** @type {EventTarget | null} */ t) => {
    const el = /** @type {HTMLElement | null} */ (t);
    if (!el || isTyping(el)) return;
    // after the control's own handlers ran (and a menu has closed)
    setTimeout(() => {
      if (doc.activeElement === el) el.blur();
    }, 0);
  };
  // a menu choice made
  doc.addEventListener(
    'change',
    (e) => {
      const t = /** @type {HTMLElement} */ (e.target);
      if (t.matches?.('select, input[type="checkbox"], input[type="radio"], input[type="range"]'))
        release(t);
    },
    true,
  );
  // a button / switch / slider / group title pressed with the mouse or pen (keyboard users
  // keep focus: e.detail is 0 for keyboard clicks)
  doc.addEventListener(
    'click',
    (e) => {
      if (e.detail === 0) return;
      const t = /** @type {HTMLElement} */ (e.target).closest?.(
        'button, summary, input[type="checkbox"], input[type="radio"], label',
      );
      if (t) release(t);
    },
    true,
  );
  doc.addEventListener(
    'pointerup',
    (e) => {
      const t = /** @type {HTMLElement} */ (e.target).closest?.('[role="slider"]');
      if (t) release(t);
    },
    true,
  );
  // a menu opened and closed again without a change: let go when the pointer leaves it
  doc.addEventListener(
    'pointerdown',
    (e) => {
      const a = /** @type {HTMLElement | null} */ (doc.activeElement);
      const t = /** @type {HTMLElement} */ (e.target);
      if (a && a !== doc.body && a.tagName === 'SELECT' && !a.contains(t)) a.blur();
    },
    true,
  );
}
