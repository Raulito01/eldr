// @ts-check
/**
 * Ramp library contact sheet (3.8, D-061): every ramp preset by family, each previewed ON the
 * active layer at three moments of its life (rendered small), with its gradient underneath. Click a
 * tile to apply it to the selected layers (undoable); the dialog stays open so you can compare.
 */

import { RAMP_GROUPS, rampsInGroup } from '../../render/rampPresets.js';
import { h } from '../dom.js';

/**
 * @typedef {object} RampPickerOptions
 * @property {string} title  e.g. "Fire core (+2 layers)"
 * @property {number} thumbW
 * @property {number} thumbH
 * @property {(stops: ReadonlyArray<{ pos: number, color: string }>, canvas: HTMLCanvasElement) => void} thumb
 *   draw a preview of the active layer with these stops
 * @property {(key: string) => void} onPick
 * @property {string} [currentKey]  preset that matches the active layer's ramp (highlighted)
 */

/** CSS gradient of stops. @param {ReadonlyArray<{ pos: number, color: string }>} stops */
export const gradientCss = (stops) =>
  `linear-gradient(to right, ${stops.map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`).join(', ')})`;

/** @param {RampPickerOptions} o */
export function openRampPicker(o) {
  /** @type {{ canvas: HTMLCanvasElement, stops: any }[]} */
  const queue = [];
  let current = o.currentKey ?? '';
  /** @type {Map<string, HTMLElement>} */
  const tiles = new Map();
  const mark = () => {
    for (const [k, t] of tiles) t.classList.toggle('current', k === current);
  };
  const groups = RAMP_GROUPS.map((g) =>
    h('section', { class: 'rp-group' }, [
      h('h3', {}, [g]),
      h(
        'div',
        { class: 'rp-tiles' },
        rampsInGroup(g).map((p) => {
          const canvas = /** @type {HTMLCanvasElement} */ (
            h('canvas', { class: 'rp-thumb', width: o.thumbW, height: o.thumbH })
          );
          queue.push({ canvas, stops: p.stops });
          const tile = h(
            'button',
            {
              type: 'button',
              class: 'rp-tile',
              'data-key': p.key,
              title: `Apply "${p.label}" to the selected layers`,
              onclick: () => {
                current = p.key;
                mark();
                o.onPick(p.key);
              },
            },
            [
              canvas,
              h('span', { class: 'rp-bar', style: `background:${gradientCss(p.stops)}` }),
              h('span', { class: 'rp-label' }, [p.label]),
            ],
          );
          tiles.set(p.key, tile);
          return tile;
        }),
      ),
    ]),
  );
  let open = true;
  const close = () => {
    open = false;
    dialog.close();
    dialog.remove();
  };
  const dialog = h('dialog', { class: 'xp ramps' }, [
    h('div', { class: 'sheet-head' }, [
      h('h2', {}, ['Colour ramps']),
      h('button', { type: 'button', class: 'sheet-close', title: 'Close (Esc)', onclick: close }, [
        '✕',
      ]),
    ]),
    h('p', { class: 'xp-note rp-note' }, [
      `Previewed on ${o.title}: early, middle and late in its life. Click to apply — undo with ⌘Z. Left = hot / start, right = cool / end. Fine-tune in the ramp editor (it also has ↔ Reverse).`,
    ]),
    h('div', { class: 'rp-groups' }, groups),
  ]);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  mark();
  // Render the previews a few at a time so the dialog opens instantly.
  const pump = () => {
    if (!open) return;
    const t0 = performance.now();
    while (queue.length && performance.now() - t0 < 24) {
      const job = /** @type {{ canvas: HTMLCanvasElement, stops: any }} */ (queue.shift());
      o.thumb(job.stops, job.canvas);
    }
    if (queue.length) requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  return { element: dialog, close };
}
