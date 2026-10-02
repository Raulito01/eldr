// @ts-check
/**
 * Auto-generated inspector: builds grouped, collapsible controls for every parameter in a
 * schema. Every edit is validated (sanitizeValue) before it reaches `onChange`, so the app
 * only ever sees valid values. A ↺ button appears next to anything changed from its default.
 */

import { sanitizeValue } from '../schema/validators.js';
import { h, WIDGETS } from './widgets/widgets.js';

/** @typedef {import('../schema/schema.js').ParamDef} ParamDef */

/**
 * @typedef {object} KeyHooks  keyframe buttons per row (3.6c)
 * @property {(id: string) => boolean} [canAnimate]  default: every param
 * @property {(id: string) => boolean} isAnimated  stopwatch on
 * @property {(id: string) => boolean} hasKey      a key at the current time
 * @property {(id: string) => void} onStopwatch
 * @property {(id: string) => void} onKey          add / remove the key at the current time
 */

/** Parameter types whose editor gets a full-width row below its label. */
const WIDE_TYPES = new Set(['ramp', 'curve']);

/**
 * @param {HTMLElement} container element to render into (its content is replaced)
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {Record<string, any>} values current values (valid)
 * @param {{ onChange: (id: string, value: any) => void, keys?: KeyHooks }} options
 *   keys (3.6c): show a stopwatch ◷ and key ◆ button on every row
 * @returns {{ setValues: (values: Record<string, any>) => void, refreshKeys: () => void,
 *   markMixed: (ids: Set<string>) => void }}
 */
export function buildInspector(container, schema, values, { onChange, keys }) {
  /** @type {Map<string, { widget: import('./widgets/widgets.js').Widget, row: HTMLElement, def: ParamDef }>} */
  const rows = new Map();
  /** @type {Map<string, HTMLElement>} */
  const groups = new Map();
  const root = h('div', { class: 'insp' });

  const isDefault = (/** @type {ParamDef} */ def, /** @type {any} */ v) =>
    JSON.stringify(v) === JSON.stringify(def.default);

  for (const def of schema) {
    let body = groups.get(def.group);
    if (!body) {
      body = h('div', { class: 'insp-group-body' });
      root.append(
        h('details', { class: 'insp-group', open: true }, [
          h('summary', { class: 'insp-group-title' }, [def.group]),
          body,
        ]),
      );
      groups.set(def.group, body);
    }

    const emit = (/** @type {any} */ raw) => {
      const clean = sanitizeValue(def, raw);
      entry.widget.set(clean); // reflect clamping/snapping immediately
      entry.row.classList.toggle('changed', !isDefault(def, clean));
      onChange(def.id, clean);
    };
    const reset = h(
      'button',
      {
        type: 'button',
        class: 'insp-reset',
        title: 'Reset to default',
        onclick: () => emit(structuredClone(def.default)),
      },
      ['↺'],
    );
    const widget = WIDGETS[def.type](def, values[def.id], emit);
    const wide = WIDE_TYPES.has(def.type);
    const keyable = !!keys && (keys.canAnimate?.(def.id) ?? true);
    /** @type {HTMLElement[]} */
    const cells = [];
    if (keys) {
      const watch = h(
        'button',
        { type: 'button', class: 'insp-watch', title: 'Animate (stopwatch)', disabled: !keyable },
        ['◷'],
      );
      const diamond = h(
        'button',
        { type: 'button', class: 'insp-key', title: 'Add / remove a key here', disabled: !keyable },
        ['◆'],
      );
      watch.addEventListener('click', () => keys.onStopwatch(def.id));
      diamond.addEventListener('click', () => keys.onKey(def.id));
      cells.push(h('span', { class: 'insp-keys' }, keyable ? [watch, diamond] : []));
    }
    cells.push(
      h('span', { class: 'insp-label' }, [def.label]),
      h('div', { class: 'insp-control' }, [widget.el]),
      reset,
    );
    const row = h(
      'div',
      {
        class: `insp-row${wide ? ' wide' : ''}${keys ? ' keyable' : ''}`,
        title: def.tooltip ?? '',
      },
      cells,
    );
    row.dataset.tip = def.tooltip ?? '';
    row.classList.toggle('changed', !isDefault(def, values[def.id]));
    const entry = { widget, row, def };
    rows.set(def.id, entry);
    body.append(row);
  }

  container.replaceChildren(root);

  const api = {
    /** Update every control from new values (after randomize, load, undo…). */
    setValues(next) {
      for (const [id, { widget, row, def }] of rows) {
        widget.set(next[id]);
        row.classList.toggle('changed', !isDefault(def, next[id]));
      }
    },
    /** Update the stopwatch / key buttons (after a key change or a new current time). */
    refreshKeys() {
      if (!keys) return;
      for (const [id, { row }] of rows) {
        const animated = keys.isAnimated(id);
        row.classList.toggle('animated', animated);
        row.classList.toggle('on-key', animated && keys.hasKey(id));
      }
    },
    /**
     * Mark params whose values differ across the selected layers (3.7b): the row shows "—"
     * and the control shows the active layer's value; an edit sets it on all of them.
     * @param {Set<string>} ids
     */
    markMixed(ids) {
      for (const [id, { row }] of rows) {
        row.classList.toggle('mixed', ids.has(id));
        row.title = ids.has(id)
          ? `Mixed: the selected layers have different values. ${row.dataset.tip ?? ''}`.trim()
          : (row.dataset.tip ?? '');
      }
    },
  };
  api.refreshKeys();
  return api;
}
