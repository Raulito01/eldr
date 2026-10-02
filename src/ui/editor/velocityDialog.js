// @ts-check
/**
 * Keyframe Velocity dialog (3.7c, D-059), like After Effects (⌘⇧K): incoming and outgoing
 * speed (units per second) and influence (%) for the selected keys. Reuses the export
 * dialog's look (big pen-friendly fields, D-028).
 */

import { h } from '../dom.js';

/**
 * @typedef {object} VelocityValues
 * @property {{ speed: number, influence: number } | null} in   null = no incoming segment
 * @property {{ speed: number, influence: number } | null} out  null = no outgoing segment / hold
 * @property {string} units  e.g. "px / s"
 * @property {string} title  what is being edited
 */

/**
 * Open the dialog; `onApply` gets only the sides that exist.
 * @param {VelocityValues} v
 * @param {(r: { in?: { speed: number, influence: number }, out?: { speed: number, influence: number } }) => void} onApply
 */
export function openVelocityDialog(v, onApply) {
  const round = (/** @type {number} */ x) => Math.round(x * 1000) / 1000;
  const num = (/** @type {number} */ value, /** @type {object} */ attrs = {}) =>
    h('input', { type: 'number', step: 'any', value: String(round(value)), ...attrs });
  const inSpeed = num(v.in?.speed ?? 0);
  const inInf = num(v.in?.influence ?? 33.33, { min: '0.1', max: '100' });
  const outSpeed = num(v.out?.speed ?? 0);
  const outInf = num(v.out?.influence ?? 33.33, { min: '0.1', max: '100' });
  const continuous = h('input', { type: 'checkbox' });
  continuous.checked = !!v.in && !!v.out && Math.abs(v.in.speed - v.out.speed) < 1e-6;
  const row = (
    /** @type {string} */ label,
    /** @type {HTMLElement} */ input,
    /** @type {string} */ unit,
  ) =>
    h('label', { class: 'xp-row' }, [
      h('span', {}, [label]),
      h('span', { class: 'xp-inline' }, [input, h('span', { class: 'xp-unit' }, [unit])]),
    ]);
  const group = (
    /** @type {string} */ title,
    /** @type {HTMLElement[]} */ kids,
    /** @type {boolean} */ on,
  ) =>
    h('fieldset', { class: `vel-group${on ? '' : ' off'}`, disabled: !on }, [
      h('legend', {}, [title]),
      ...kids,
    ]);
  const cancel = h('button', { type: 'button' }, ['Cancel']);
  const ok = h('button', { type: 'button', class: 'xp-go' }, ['OK']);
  const dialog = h('dialog', { class: 'xp vel' }, [
    h('h2', {}, ['Keyframe Velocity']),
    h('p', { class: 'xp-note' }, [v.title]),
    group(
      'Incoming velocity',
      [row('Speed', inSpeed, v.units), row('Influence', inInf, '%')],
      !!v.in,
    ),
    group(
      'Outgoing velocity',
      [row('Speed', outSpeed, v.units), row('Influence', outInf, '%')],
      !!v.out,
    ),
    h('label', { class: 'xp-check', title: 'Incoming and outgoing speed stay the same' }, [
      continuous,
      h('span', {}, ['Continuous']),
    ]),
    h('div', { class: 'xp-buttons' }, [cancel, ok]),
  ]);
  // Continuous: typing one speed copies it to the other side (as in After Effects).
  inSpeed.addEventListener('input', () => {
    if (continuous.checked && v.out) outSpeed.value = inSpeed.value;
  });
  outSpeed.addEventListener('input', () => {
    if (continuous.checked && v.in) inSpeed.value = outSpeed.value;
  });
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const read = (/** @type {HTMLInputElement} */ el, /** @type {number} */ fallback) => {
    const n = Number(el.value);
    return Number.isFinite(n) ? n : fallback;
  };
  cancel.addEventListener('click', close);
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  ok.addEventListener('click', () => {
    /** @type {{ in?: { speed: number, influence: number }, out?: { speed: number, influence: number } }} */
    const r = {};
    if (v.in) r.in = { speed: read(inSpeed, 0), influence: read(inInf, 33.33) };
    if (v.out) r.out = { speed: read(outSpeed, 0), influence: read(outInf, 33.33) };
    close();
    onApply(r);
  });
  dialog.addEventListener('keydown', (e) => {
    e.stopPropagation(); // editor shortcuts stay quiet while typing here
    if (e.key === 'Enter') ok.click();
  });
  document.body.append(dialog);
  dialog.showModal();
  /** @type {HTMLInputElement} */ (v.in ? inSpeed : outSpeed).select();
  return { element: dialog, close };
}
