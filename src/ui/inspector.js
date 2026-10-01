// @ts-check
/**
 * Auto-generated inspector: builds grouped, collapsible controls for every parameter in a
 * schema. Every edit is validated (sanitizeValue) before it reaches `onChange`, so the app
 * only ever sees valid values. A ↺ button appears next to anything changed from its default.
 */

import { sanitizeValue } from '../schema/validators.js';
import { h, WIDGETS } from './widgets/widgets.js';

/** @typedef {import('../schema/schema.js').ParamDef} ParamDef */

/** Parameter types whose editor gets a full-width row below its label. */
const WIDE_TYPES = new Set(['ramp', 'curve']);

/**
 * @param {HTMLElement} container element to render into (its content is replaced)
 * @param {ReadonlyArray<ParamDef>} schema
 * @param {Record<string, any>} values current values (valid)
 * @param {{ onChange: (id: string, value: any) => void }} options
 * @returns {{ setValues: (values: Record<string, any>) => void }}
 */
export function buildInspector(container, schema, values, { onChange }) {
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
    const row = h('div', { class: `insp-row${wide ? ' wide' : ''}`, title: def.tooltip ?? '' }, [
      h('span', { class: 'insp-label' }, [def.label]),
      h('div', { class: 'insp-control' }, [widget.el]),
      reset,
    ]);
    row.classList.toggle('changed', !isDefault(def, values[def.id]));
    const entry = { widget, row, def };
    rows.set(def.id, entry);
    body.append(row);
  }

  container.replaceChildren(root);

  return {
    /** Update every control from new values (after randomize, load, undo…). */
    setValues(next) {
      for (const [id, { widget, row, def }] of rows) {
        widget.set(next[id]);
        row.classList.toggle('changed', !isDefault(def, next[id]));
      }
    },
  };
}
