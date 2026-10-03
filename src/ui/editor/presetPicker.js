// @ts-check
/**
 * Pick a preset to bring in as a precomp (D-119): every built-in family and your own families,
 * with a filter box. Big pen-friendly buttons; "Keep its own timing and size" on by default.
 */

import { h } from '../dom.js';

/**
 * @typedef {object} PickerGroup
 * @property {string} label
 * @property {{ id: string, name: string, blurb?: string }[]} presets
 */

/**
 * @param {{ groups: PickerGroup[], onPick: (id: string, name: string, keepOwn: boolean) => void,
 *   onClose?: () => void }} o
 */
export function openPresetPicker(o) {
  const filter = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'search',
      class: 'fam-input pp-filter',
      placeholder: 'Find a preset…',
      'aria-label': 'Find a preset',
    })
  );
  const keep = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true }));
  const list = h('div', { class: 'pp-list' }, []);
  const close = h('button', { type: 'button' }, ['Cancel']);
  const dialog = /** @type {HTMLDialogElement} */ (
    h('dialog', { class: 'xp pp' }, [
      h('h2', {}, ['Add a preset as a precomp']),
      h('p', { class: 'hint' }, [
        'The whole preset becomes ONE layer (open it to edit inside). Its precomps and textures come along.',
      ]),
      h('div', { class: 'pp-top' }, [
        filter,
        h(
          'label',
          {
            class: 'pp-keep',
            title:
              'On: it plays at its own speed and length (loops keep looping), with its own wind-up, flash and size — exactly as it looks on its own. Off: it follows this effect’s timing and size.',
          },
          [keep, ' Keep its own timing and size'],
        ),
      ]),
      list,
      h('div', { class: 'xp-buttons' }, [close]),
    ])
  );
  const draw = () => {
    const q = filter.value.trim().toLowerCase();
    list.replaceChildren(
      ...o.groups
        .map((g) => {
          const ps = g.presets.filter(
            (p) => !q || `${g.label} ${p.name} ${p.blurb ?? ''}`.toLowerCase().includes(q),
          );
          if (!ps.length) return null;
          return h('section', { class: 'pp-group' }, [
            h('div', { class: 'vx-label' }, [g.label]),
            h(
              'div',
              { class: 'pp-grid' },
              ps.map((p) =>
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'fam-preset pp-item',
                    title: p.blurb ?? p.name,
                    onclick: () => {
                      o.onPick(p.id, p.name, keep.checked);
                      dialog.close();
                    },
                  },
                  [p.name],
                ),
              ),
            ),
          ]);
        })
        .filter((x) => x !== null),
    );
  };
  filter.addEventListener('input', draw);
  dialog.addEventListener('keydown', (e) => e.stopPropagation());
  dialog.addEventListener('close', () => {
    dialog.remove();
    o.onClose?.();
  });
  close.addEventListener('click', () => dialog.close());
  draw();
  document.body.append(dialog);
  dialog.showModal();
  filter.focus();
  return dialog;
}

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
