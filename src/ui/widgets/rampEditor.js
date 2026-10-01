// @ts-check
/**
 * Ramp editor widget: gradient bar with draggable stop handles. Click a handle to select it and
 * edit its colour/position below; drag to move it; double-click the bar to add a stop; ✕ removes
 * the selected stop (at least 2 remain).
 */

import { h } from '../dom.js';
import { addStop, MIN_STOPS, moveStop, removeStop, setStopColor } from './rampOps.js';

/**
 * @param {import('../../schema/schema.js').ParamDef} _def
 * @param {{pos:number,color:string}[]} value
 * @param {(value: any) => void} emit
 */
export function createRampEditor(_def, value, emit) {
  let stops = value;
  let selected = 0;
  let dragging = false;

  const bar = h('div', { class: 'w-ramp', title: 'Double-click to add a stop' });
  const handles = h('div', { class: 'w-ramp-handles' });
  const picker = h('input', { type: 'color', class: 'w-color' });
  const hex = h('input', { type: 'text', class: 'w-hex', spellcheck: false, maxLength: 9 });
  const pos = h('input', {
    type: 'number',
    class: 'w-number w-ramp-pos',
    min: 0,
    max: 100,
    step: 0.1,
    title: 'Position %',
  });
  const del = h('button', { type: 'button', class: 'w-dice', title: 'Remove stop' }, ['✕']);
  const row = h('div', { class: 'w-color-row' }, [
    picker,
    hex,
    pos,
    h('span', { class: 'w-unit' }, ['%']),
    del,
  ]);
  const el = h('div', { class: 'w-rampedit' }, [bar, handles, row]);

  /** @param {{ stops: any[], index: number }} r */
  function apply(r) {
    stops = r.stops;
    selected = r.index;
    render();
    emit(stops);
  }

  function render() {
    const parts = stops.map((s) => `${s.color} ${(s.pos * 100).toFixed(2)}%`);
    bar.style.background = `linear-gradient(to right, ${parts.join(', ')}), conic-gradient(#555 25%, #333 0 50%, #555 0 75%, #333 0) 0 0 / 8px 8px`;
    handles.replaceChildren(
      ...stops.map((s, i) => {
        const handle = h('div', {
          class: `w-ramp-handle${i === selected ? ' selected' : ''}`,
          style: `left:${s.pos * 100}%`,
          title: `${s.color} at ${(s.pos * 100).toFixed(1)}%`,
        });
        handle.append(h('span', { class: 'w-ramp-chip', style: `background:${s.color}` }));
        handle.dataset.i = String(i);
        return handle;
      }),
    );
    const s = stops[selected];
    picker.value = s.color.slice(0, 7);
    if (document.activeElement !== hex) hex.value = s.color;
    if (document.activeElement !== pos) pos.value = (s.pos * 100).toFixed(1);
    del.disabled = stops.length <= MIN_STOPS;
  }

  const posFromEvent = (/** @type {MouseEvent} */ e) => {
    const r = bar.getBoundingClientRect();
    return r.width > 0 ? (e.clientX - r.left) / r.width : 0;
  };

  handles.addEventListener('pointerdown', (e) => {
    const target = /** @type {HTMLElement} */ (e.target)?.closest?.('.w-ramp-handle');
    if (!target) return;
    selected = Number(/** @type {HTMLElement} */ (target).dataset.i);
    dragging = true;
    handles.setPointerCapture(e.pointerId);
    render();
  });
  handles.addEventListener('pointermove', (e) => {
    if (dragging) apply(moveStop(stops, selected, posFromEvent(e)));
  });
  const end = () => {
    dragging = false;
  };
  handles.addEventListener('pointerup', end);
  handles.addEventListener('pointercancel', end);
  bar.addEventListener('dblclick', (e) => apply(addStop(stops, posFromEvent(e))));
  picker.addEventListener('input', () =>
    apply(setStopColor(stops, selected, picker.value + stops[selected].color.slice(7))),
  );
  hex.addEventListener('change', () => apply(setStopColor(stops, selected, hex.value)));
  pos.addEventListener('change', () => apply(moveStop(stops, selected, Number(pos.value) / 100)));
  del.addEventListener('click', () => apply(removeStop(stops, selected)));

  render();
  return {
    el,
    set(/** @type {{pos:number,color:string}[]} */ v) {
      if (dragging) return;
      stops = v;
      selected = Math.min(selected, stops.length - 1);
      render();
    },
  };
}
