// @ts-check
/**
 * Layer panel (step 3.6a, pulled forward from 8.4 [Raul]): the stack top-first, like After
 * Effects. Per row: drag handle, visibility, solo, name (double-click to rename), blend tag.
 * Toolbar: add (any layer type), duplicate, delete, move up/down, rename.
 *
 * Pen-friendly (D-028): every action has a button (drag is optional), targets ≥ 28 px, drags use
 * pointer events with capture so a pen stroke can't lose the row.
 */

import { BLEND_MODE_LABELS } from '../render/compositor.js';
import { h } from './dom.js';

/**
 * @typedef {{ id: string, label: string, enabled: boolean, solo?: boolean, blend: string, badge?: string, openable?: boolean }} ListLayer
 *   badge: short extra info (track matte, masks) shown with the blend tag
 */

/**
 * @typedef {object} LayerListOptions
 * @property {ListLayer[]} layers  bottom → top (stack order)
 * @property {string} selected  the active layer
 * @property {string[]} [selection]  every selected layer (3.7b); default [selected]
 * @property {Record<string, string>} [types]  layer type → label, for the Add menu
 * @property {(id: string, mods: { meta?: boolean, shift?: boolean }) => void} onSelect
 *   ⌘ / Ctrl-click and ⇧-click pass their modifiers (multi-select, 3.7b)
 * @property {(id: string, enabled: boolean) => void} onToggle
 * @property {(id: string, solo: boolean) => void} [onSolo]
 * @property {(id: string, label: string) => void} [onRename]
 * @property {(id: string, to: number) => void} [onMove]  to = new stack index (0 = bottom)
 * @property {(type: string) => void} [onAdd]
 * @property {(id: string) => void} [onDuplicate]
 * @property {(id: string) => void} [onDelete]
 * @property {(id: string) => void} [onOpen]  open a precomp layer (3.6e)
 * @property {() => void} [onPrecompose]  selected layers → a precomp (3.6e)
 */

/**
 * Stack index for dropping a dragged row into display gap `gap` (0 = above the top row).
 * Display shows the stack reversed; the dragged row is not counted in `gap`.
 * @param {number} count total layers @param {number} gap
 */
export const dropIndex = (count, gap) => count - 1 - gap;

/**
 * @param {HTMLElement} container
 * @param {LayerListOptions} o
 */
export function createLayerList(container, o) {
  let layers = o.layers;
  let selected = o.selected;
  let selection = o.selection ?? [o.selected];
  /** id of the row being renamed */
  let renaming = '';

  const tbtn = (
    /** @type {string} */ label,
    /** @type {string} */ title,
    /** @type {() => void} */ fn,
  ) => h('button', { type: 'button', class: 'll-tool', title, onclick: fn }, [label]);

  const add = h('select', { class: 'll-add', title: 'Add a layer above the selected one' }, [
    h('option', { value: '' }, ['＋ Add layer…']),
    ...Object.entries(o.types ?? {}).map(([type, label]) => h('option', { value: type }, [label])),
  ]);
  add.addEventListener('change', () => {
    if (add.value) o.onAdd?.(add.value);
    add.value = '';
  });
  const pos = () => layers.findIndex((l) => l.id === selected);
  const toolbar = h('div', { class: 'll-toolbar' }, [
    add,
    h('div', { class: 'll-tools' }, [
      tbtn('▲', 'Move up', () => pos() >= 0 && o.onMove?.(selected, pos() + 1)),
      tbtn('▼', 'Move down', () => pos() >= 0 && o.onMove?.(selected, pos() - 1)),
      tbtn('⧉', 'Duplicate', () => selected && o.onDuplicate?.(selected)),
      tbtn('✎', 'Rename', () => {
        renaming = selected;
        render();
      }),
      tbtn('🗑', 'Delete', () => selected && o.onDelete?.(selected)),
      ...(o.onPrecompose
        ? [tbtn('▣', 'Precompose selected layers (⌘⇧C)', () => o.onPrecompose?.())]
        : []),
    ]),
  ]);
  const list = h('div', { class: 'll' });
  const showTools = !!(o.onAdd || o.onMove || o.onDelete);
  container.replaceChildren(
    h('div', { class: 'll-title' }, ['Layers']),
    ...(showTools ? [toolbar] : []),
    list,
  );

  /** @param {ListLayer} l */
  function nameCell(l) {
    if (renaming !== l.id) {
      const span = h('span', { class: 'll-name', title: 'Double-click to rename' }, [l.label]);
      span.addEventListener('dblclick', (e) => {
        if (!o.onRename) return;
        e.stopPropagation();
        renaming = l.id;
        render();
      });
      return span;
    }
    const input = h('input', { type: 'text', class: 'll-rename', value: l.label });
    let done = false;
    const finish = (/** @type {boolean} */ keep) => {
      if (done) return;
      done = true;
      renaming = '';
      const v = input.value.trim();
      if (keep && v && v !== l.label) o.onRename?.(l.id, v);
      else render();
    };
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') finish(true);
      if (e.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
    queueMicrotask(() => {
      input.focus();
      input.select();
    });
    return input;
  }

  /** Drag a row by its handle; drop between rows. @param {PointerEvent} e @param {string} id */
  function startDrag(e, id) {
    if (!o.onMove) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = /** @type {HTMLElement} */ (e.currentTarget);
    handle.setPointerCapture?.(e.pointerId);
    const rows = [...list.querySelectorAll('.ll-row')].filter(
      (r) => /** @type {HTMLElement} */ (r).dataset.id !== id,
    );
    const marker = h('div', { class: 'll-drop' });
    let gap = -1;
    const move = (/** @type {PointerEvent} */ ev) => {
      gap = rows.filter((r) => {
        const b = r.getBoundingClientRect();
        return b.top + b.height / 2 < ev.clientY;
      }).length;
      const ref = rows[gap];
      if (ref) list.insertBefore(marker, ref);
      else list.append(marker);
    };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      marker.remove();
      if (gap >= 0) o.onMove?.(id, dropIndex(layers.length, gap));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    move(e);
  }

  function render() {
    // Top of the stack first, as artists expect.
    list.replaceChildren(
      ...[...layers].reverse().map((l) => {
        const toggle = h('input', { type: 'checkbox', checked: l.enabled, title: 'Show / hide' });
        toggle.addEventListener('click', (e) => e.stopPropagation());
        toggle.addEventListener('change', () => o.onToggle(l.id, toggle.checked));
        const cells = [];
        if (o.onMove) {
          const grip = h('span', { class: 'll-grip', title: 'Drag to reorder' }, ['⠿']);
          grip.addEventListener('pointerdown', (e) => startDrag(e, l.id));
          cells.push(grip);
        }
        cells.push(toggle);
        if (o.onSolo) {
          const solo = h(
            'button',
            { type: 'button', class: `ll-solo${l.solo ? ' on' : ''}`, title: 'Solo' },
            ['S'],
          );
          solo.addEventListener('click', (e) => {
            e.stopPropagation();
            o.onSolo?.(l.id, !l.solo);
          });
          cells.push(solo);
        }
        if (l.openable && o.onOpen) {
          // precomp: ⤵ opens it (After Effects: double-click)
          const open = h(
            'button',
            { type: 'button', class: 'll-open', title: 'Open this precomp (Tab)' },
            ['⤵'],
          );
          open.addEventListener('click', (e) => {
            e.stopPropagation();
            o.onOpen?.(l.id);
          });
          cells.push(h('span', { class: 'll-namewrap' }, [nameCell(l), open]));
        } else cells.push(nameCell(l));
        const blendLabel = /** @type {Record<string, string>} */ (BLEND_MODE_LABELS)[l.blend];
        cells.push(
          h('span', { class: 'll-tag', title: 'Blend mode · track matte · masks' }, [
            [l.blend === 'normal' ? '' : (blendLabel ?? l.blend), l.badge ?? '']
              .filter(Boolean)
              .join(' · '),
          ]),
        );
        const row = h(
          'div',
          {
            class: `ll-row${l.id === selected ? ' selected' : ''}${selection.includes(l.id) ? ' in-selection' : ''}${l.enabled ? '' : ' hidden'}`,
            onclick: (/** @type {MouseEvent} */ e) =>
              o.onSelect(l.id, { meta: e.metaKey || e.ctrlKey, shift: e.shiftKey }),
          },
          cells,
        );
        row.dataset.id = l.id;
        return row;
      }),
    );
  }

  render();
  return {
    /** @param {ListLayer[]} next @param {string} [sel] active layer @param {string[]} [ids] selection */
    update(next, sel, ids) {
      layers = next;
      if (sel !== undefined) selected = sel;
      selection = ids ?? (sel !== undefined ? [selected] : selection);
      render();
    },
  };
}
