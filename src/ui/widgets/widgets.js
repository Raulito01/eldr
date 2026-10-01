// @ts-check
/**
 * Inspector widgets, one per parameter type. Each `create…` function returns
 * `{ el, set(value) }`: `el` is the control's DOM, `set` updates it from outside
 * (undo, randomize, load). User edits are reported through `emit(rawValue)`; the inspector
 * validates them, so widgets stay dumb.
 *
 * Ramp and curve are read-only previews in step 0.3; their editors come in 2.1 / later.
 */

/** @typedef {import('../../schema/schema.js').ParamDef} ParamDef */
/** @typedef {{ el: HTMLElement, set: (value: any) => void }} Widget */
/** @typedef {(value: any) => void} Emit */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag @param {Record<string, any>} [props] @param {(Node|string)[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'class') el.className = value;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key in el) /** @type {any} */ (el)[key] = value;
    else el.setAttribute(key, value);
  }
  el.append(...children);
  return el;
}

/** float / int: slider + number box + unit. @param {ParamDef} def @param {any} value @param {Emit} emit */
export function createNumberWidget(def, value, emit) {
  const common = { min: def.min, max: def.max, step: def.step };
  const range = h('input', { ...common, type: 'range', class: 'w-range' });
  const box = h('input', { ...common, type: 'number', class: 'w-number' });
  range.addEventListener('input', () => emit(Number(range.value)));
  box.addEventListener('change', () => emit(Number(box.value)));
  const el = h('div', { class: 'w-number-row' }, [range, box]);
  if (def.unit) el.append(h('span', { class: 'w-unit' }, [def.unit]));
  const set = (/** @type {number} */ v) => {
    range.value = String(v);
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

/** ramp: read-only gradient strip with stop markers. @param {ParamDef} _def @param {any} value */
export function createRampPreview(_def, value) {
  const strip = h('div', { class: 'w-ramp' });
  const set = (/** @type {{pos:number,color:string}[]} */ stops) => {
    const parts = stops.map((s) => `${s.color} ${(s.pos * 100).toFixed(1)}%`);
    strip.style.background = `linear-gradient(to right, ${parts.join(', ')})`;
    strip.replaceChildren(
      ...stops.map((s) => h('span', { class: 'w-ramp-stop', style: `left:${s.pos * 100}%` })),
    );
  };
  set(value);
  return { el: strip, set };
}

/** curve: read-only mini graph. @param {ParamDef} def @param {any} value */
export function createCurvePreview(def, value) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 40');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.classList.add('w-curve');
  const line = document.createElementNS(NS, 'polyline');
  svg.append(line);
  const yMin = def.yMin ?? 0;
  const yMax = def.yMax ?? 1;
  const set = (/** @type {{x:number,y:number}[]} */ points) => {
    const pts = points.map((p) => `${p.x * 100},${36 - ((p.y - yMin) / (yMax - yMin)) * 32}`);
    line.setAttribute('points', pts.join(' '));
  };
  set(value);
  return { el: /** @type {any} */ (svg), set };
}

/** Widget factory by parameter type. @type {Record<string, (def: ParamDef, value: any, emit: Emit) => Widget>} */
export const WIDGETS = {
  float: createNumberWidget,
  int: createNumberWidget,
  bool: createToggleWidget,
  enum: createSelectWidget,
  color: createColorWidget,
  seed: createSeedWidget,
  ramp: createRampPreview,
  curve: createCurvePreview,
};
