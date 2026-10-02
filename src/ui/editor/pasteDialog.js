// @ts-check
/**
 * Paste Settings dialog (D-074): tick the groups to paste (all ticked by default), then paste
 * onto the selected layers. Big pen-friendly targets, like the export dialog.
 */

import { h } from '../dom.js';

/**
 * @param {{ from: string, to: string, groups: { group: string, ids: string[] }[] }} o
 * @param {(groups: string[]) => void} onPaste
 */
export function openPasteDialog(o, onPaste) {
  const boxes = o.groups.map((g) => {
    const box = /** @type {HTMLInputElement} */ (h('input', { type: 'checkbox', checked: true }));
    box.dataset.group = g.group;
    return { g, box };
  });
  const setAll = (/** @type {boolean} */ on) => {
    for (const b of boxes) b.box.checked = on;
  };
  const cancel = h('button', { type: 'button' }, ['Cancel']);
  const ok = h('button', { type: 'button', class: 'xp-go' }, ['Paste']);
  const dialog = h('dialog', { class: 'xp paste' }, [
    h('h2', {}, ['Paste settings']),
    h('p', { class: 'xp-note' }, [
      `From “${o.from}” onto ${o.to}. Only settings both layers have.`,
    ]),
    h('div', { class: 'paste-all' }, [
      h('button', { type: 'button', onclick: () => setAll(true) }, ['All']),
      h('button', { type: 'button', onclick: () => setAll(false) }, ['None']),
    ]),
    h(
      'div',
      { class: 'paste-groups' },
      boxes.map(({ g, box }) =>
        h('label', { class: 'xp-check' }, [
          box,
          h('span', {}, [g.group]),
          h('span', { class: 'xp-unit' }, [g.group === 'Blend & opacity' ? '' : `${g.ids.length}`]),
        ]),
      ),
    ),
    h('div', { class: 'xp-buttons' }, [cancel, ok]),
  ]);
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  ok.addEventListener('click', () => {
    const groups = boxes.filter((b) => b.box.checked).map((b) => b.g.group);
    close();
    if (groups.length) onPaste(groups);
  });
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') ok.click();
  });
  document.body.append(dialog);
  /** @type {HTMLDialogElement} */ (dialog).showModal();
  return { element: dialog, close };
}
