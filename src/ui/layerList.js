// @ts-check
/**
 * Layer list: shows an effect's layers top → bottom (like a paint program), with a visibility
 * toggle, blend mode and selection. Reordering / duplicating / renaming come in step 8.4.
 */

import { BLEND_MODE_NAMES } from '../render/compositor.js';
import { h } from './dom.js';

/**
 * @typedef {{ id: string, label: string, enabled: boolean, blend: string }} ListLayer
 */

/**
 * @param {HTMLElement} container
 * @param {{
 *   layers: ListLayer[],
 *   selected: string,
 *   onSelect: (id: string) => void,
 *   onToggle: (id: string, enabled: boolean) => void,
 *   onBlend: (id: string, blend: string) => void,
 * }} o
 */
export function createLayerList(container, o) {
  let layers = o.layers;
  let selected = o.selected;
  const list = h('div', { class: 'll' });
  container.replaceChildren(h('div', { class: 'll-title' }, ['Layers']), list);

  function render() {
    // Top of the stack first, as artists expect.
    list.replaceChildren(
      ...[...layers].reverse().map((l) => {
        const toggle = h('input', { type: 'checkbox', checked: l.enabled, title: 'Show / hide' });
        toggle.addEventListener('click', (e) => e.stopPropagation());
        toggle.addEventListener('change', () => o.onToggle(l.id, toggle.checked));
        const blend = h(
          'select',
          { class: 'll-blend', title: 'Blend mode' },
          BLEND_MODE_NAMES.map((b) => h('option', { value: b }, [b])),
        );
        blend.value = l.blend;
        blend.addEventListener('click', (e) => e.stopPropagation());
        blend.addEventListener('change', () => o.onBlend(l.id, blend.value));
        const row = h(
          'div',
          {
            class: `ll-row${l.id === selected ? ' selected' : ''}${l.enabled ? '' : ' hidden'}`,
            onclick: () => o.onSelect(l.id),
          },
          [toggle, h('span', { class: 'll-name' }, [l.label]), blend],
        );
        row.dataset.id = l.id;
        return row;
      }),
    );
  }

  render();
  return {
    /** @param {ListLayer[]} next @param {string} [sel] */
    update(next, sel) {
      layers = next;
      if (sel !== undefined) selected = sel;
      render();
    },
  };
}
