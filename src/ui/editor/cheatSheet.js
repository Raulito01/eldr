// @ts-check
/**
 * Shortcut sheet (? key, 3.7d): every shortcut by group. Each row is a button that does the
 * action, so a pen user can reach all of them without a keyboard (D-028).
 */

import { h } from '../dom.js';
import { formatCombo } from '../shortcuts.js';

/** Is this a Mac (⌘ vs Ctrl in labels)? */
export const isMac = () =>
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/**
 * @param {import('../shortcuts.js').Shortcut[]} list
 * @param {{ mac?: boolean }} [o]
 */
export function openCheatSheet(list, o = {}) {
  const mac = o.mac ?? isMac();
  const groups = [...new Set(list.map((s) => s.group))];
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const dialog = h('dialog', { class: 'xp sheet' }, [
    h('div', { class: 'sheet-head' }, [
      h('h2', {}, ['Shortcuts']),
      h('button', { type: 'button', class: 'sheet-close', title: 'Close (Esc)', onclick: close }, [
        '✕',
      ]),
    ]),
    h('p', { class: 'xp-note' }, [
      'Like After Effects. Click a row to do it now. On a Danish keyboard [ and ] are the Å and ¨ keys.',
    ]),
    h(
      'div',
      { class: 'sheet-groups' },
      groups.map((g) =>
        h('section', { class: 'sheet-group' }, [
          h('h3', {}, [g]),
          ...list
            .filter((s) => s.group === g)
            .map((s) =>
              h(
                'button',
                {
                  type: 'button',
                  class: 'sheet-row',
                  'data-id': s.id,
                  onclick: () => {
                    if (s.id !== 'help') close();
                    s.run();
                  },
                },
                [
                  h('span', { class: 'sheet-label' }, [s.label]),
                  h(
                    'span',
                    { class: 'sheet-keys' },
                    s.keys.map((k) => h('kbd', {}, [formatCombo(k, mac)])),
                  ),
                ],
              ),
            ),
        ]),
      ),
    ),
  ]);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  document.body.append(dialog);
  dialog.showModal();
  return { element: dialog, close };
}
