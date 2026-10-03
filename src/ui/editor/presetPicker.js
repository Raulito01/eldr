// @ts-check
/**
 * Paste dialog for copied layers (D-119). (Picking a preset to bring in as a precomp is done in
 * the Preset Browser, D-120.)
 */

import { h } from '../dom.js';

/**
 * Paste copied layers (D-119): as layers, or as one precomp (optionally keeping their own
 * timing and size, from the creation they were copied in).
 * @param {{ count: number, onChoose: (mode: 'layers' | 'precomp', keepOwn: boolean) => void,
 *   onClose?: () => void }} o
 */
export function openPasteLayersDialog(o) {
  const keep = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true }));
  const n = `${o.count} layer${o.count === 1 ? '' : 's'}`;
  const pick = (/** @type {'layers' | 'precomp'} */ mode) => {
    o.onChoose(mode, keep.checked);
    dialog.close();
  };
  const asLayers = h(
    'button',
    { type: 'button', class: 'fam-btn pp-choice', onclick: () => pick('layers') },
    [
      h('b', {}, ['As layers']),
      h('span', {}, ['They drop in one by one and follow this effect’s timing.']),
    ],
  );
  const asPre = h(
    'button',
    { type: 'button', class: 'fam-btn pp-choice', onclick: () => pick('precomp') },
    [
      h('b', {}, ['As one precomp']),
      h('span', {}, ['Grouped as ONE layer to move, scale and retime.']),
    ],
  );
  const cancel = h('button', { type: 'button' }, ['Cancel']);
  const dialog = /** @type {HTMLDialogElement} */ (
    h('dialog', { class: 'xp pp-paste' }, [
      h('h2', {}, [`Paste ${n}`]),
      h('div', { class: 'pp-choices' }, [asLayers, asPre]),
      h(
        'label',
        {
          class: 'pp-keep',
          title:
            'For the precomp: it plays at the speed and length of the creation it was copied from, with its wind-up, flash and size.',
        },
        [keep, ' Precomp keeps their own timing and size'],
      ),
      h('div', { class: 'xp-buttons' }, [cancel]),
    ])
  );
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => {
    dialog.remove();
    o.onClose?.();
  });
  cancel.addEventListener('click', () => dialog.close());
  document.body.append(dialog);
  dialog.showModal();
  return dialog;
}
