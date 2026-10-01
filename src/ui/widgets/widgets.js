// @ts-check
/**
 * Inspector widgets, one per parameter type. Each `create…` function returns
 * `{ el, set(value) }`: `el` is the control's DOM, `set` updates it from outside
 * (undo, randomize, load). User edits are reported through `emit(rawValue)`; the inspector
 * validates them, so widgets stay dumb.
 *
 * Ramps and curves have their own editors (rampEditor.js, curveEditor.js).
 */

import { h } from '../dom.js';
import { createCurveEditor } from './curveEditor.js';
import { createRampEditor } from './rampEditor.js';
import { createSlider } from './slider.js';

/** @typedef {import('../../schema/schema.js').ParamDef} ParamDef */
/** @typedef {{ el: HTMLElement, set: (value: any) => void }} Widget */
/** @typedef {(value: any) => void} Emit */

export { h };

/** float / int: slider + number box + unit. @param {ParamDef} def @param {any} value @param {Emit} emit */
export function createNumberWidget(def, value, emit) {
  const slider = createSlider({
    min: /** @type {number} */ (def.min),
    max: /** @type {number} */ (def.max),
    step: def.step,
    value,
    label: def.label,
    onInput: emit,
  });
  const box = h('input', { type: 'number', class: 'w-number', min: def.min, max: def.max, step: def.step });
  box.addEventListener('change', () => emit(Number(box.value)));
  const el = h('div', { class: 'w-number-row' }, [slider.el, box]);
  if (def.unit) el.append(h('span', { class: 'w-unit' }, [def.unit]));
  const set = (/** @type {number} */ v) => {
    slider.set(v);
    if (document.activeElement !== box) box.value = String(v);
  };
  set(value);
  return { el, set };
}

/** bool: toggle switch. @param {ParamDef} _def @param {any} value @param {Emit} emit */
export function createToggleWidget(_def, value, emit) {
  const input = h('input', { type: 'checkbox', class: 'w-toggle' });
  input.addEventListener('change', () => emit(input.checked));
  const set = (/** @type {boolean} */ v) => {
    input.checked = v;
  };
  set(value);
  return { el: input, set };
}

/** enum: dropdown. @param {ParamDef} def @param {any} value @param {Emit} emit */
export function createSelectWidget(def, value, emit) {
  const select = h(
    'select',
    { class: 'w-select' },
    (def.options ?? []).map((o) => h('option', { value: o.value }, [o.label])),
  );
  select.addEventListener('change', () => emit(select.value));
  const set = (/** @type {string} */ v) => {
    select.value = v;
  };
  set(value);
  return { el: select, set };
}

/** color: native picker + hex text (hex also accepts alpha, e.g. #ff000080). @param {ParamDef} _def @param {any} value @param {Emit} emit */
export function createColorWidget(_def, value, emit) {
  let current = value;
  const picker = h('input', { type: 'color', class: 'w-color' });
  const hex = h('input', { type: 'text', class: 'w-hex', spellcheck: false, maxLength: 9 });
  // The native picker has no alpha: keep the current alpha when picking a colour.
  picker.addEventListener('input', () => emit(picker.value + current.slice(7)));
  hex.addEventListener('change', () => emit(hex.value));
  const set = (/** @type {string} */ v) => {
    current = v;
    picker.value = v.slice(0, 7);
    if (document.activeElement !== hex) hex.value = v;
  };
  set(value);
  return { el: h('div', { class: 'w-color-row' }, [picker, hex]), set };
}

/** seed: number + dice. @param {ParamDef} _def @param {any} value @param {Emit} emit */
export function createSeedWidget(_def, value, emit) {
  const box = h('input', { type: 'number', class: 'w-number w-seed', min: 0, step: 1 });
  // UI input only: picking a new seed is user intent, not render-path randomness.
  const dice = h('button', { type: 'button', class: 'w-dice', title: 'New random seed' }, ['🎲']);
  box.addEventListener('change', () => emit(Math.trunc(Number(box.value))));
  dice.addEventListener('click', () => emit(crypto.getRandomValues(new Uint32Array(1))[0]));
  const set = (/** @type {number} */ v) => {
    if (document.activeElement !== box) box.value = String(v);
  };
  set(value);
  return { el: h('div', { class: 'w-seed-row' }, [box, dice]), set };
}

/** Widget factory by parameter type. @type {Record<string, (def: ParamDef, value: any, emit: Emit) => Widget>} */
export const WIDGETS = {
  float: createNumberWidget,
  int: createNumberWidget,
  bool: createToggleWidget,
  enum: createSelectWidget,
  color: createColorWidget,
  seed: createSeedWidget,
  ramp: (def, value, emit) => createRampEditor(def, value, emit),
  curve: (def, value, emit) => createCurveEditor(def, value, emit),
};
