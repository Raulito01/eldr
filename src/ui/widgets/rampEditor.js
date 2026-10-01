// @ts-check
/**
 * Ramp editor widget: gradient bar with draggable stop handles. Press on or near a stop (on the
 * bar or the handle row) to select it and edit its colour/position below; drag to move it;
 * double-click/tap the bar away from stops to add one; ✕, right-click or the pen side button
 * removes a stop (min 2). Pen-friendly via ../pointer.js.
 */

import { RAMP_PRESETS, rampPreset } from '../../render/rampPresets.js';
import { h } from '../dom.js';
import { attachPointer, attachSecondaryClick } from '../pointer.js';
import { nearestIndex } from './curveOps.js';
import { addStop, MIN_STOPS, moveStop, removeStop, setStopColor } from './rampOps.js';

const GRAB = 10; // px: how close (horizontally) a click must be to grab a stop

/**
 * @param {import('../../schema/schema.js').ParamDef} _def
 * @param {{pos:number,color:string}[]} value
 * @param {(value: any) => void} emit
 */
export function createRampEditor(_def, value, emit) {
  let stops = value;
  let selected = 0;
  let dragging = false;

  const bar = h('div', { class: 'w-ramp', title: 'Drag stops · double-click to add a stop' });
  const handles = h('div', { class: 'w-ramp-handles' });
  const track = h('div', { class: 'w-ramp-track' }, [bar, handles]);
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
  // Preset menu: replaces the whole ramp in one click.
  const presets = h(
    'select',
    { class: 'w-select w-ramp-presets', title: 'Apply a ready-made ramp' },
    [
      h('option', { value: '' }, ['Ramp preset…']),
      ...Object.entries(RAMP_PRESETS).map(([key, p]) => h('option', { value: key }, [p.label])),
    ],
  );
  presets.addEventListener('change', () => {
    if (!presets.value) return;
    apply({ stops: rampPreset(presets.value), index: 0 });
    presets.value = '';
  });
  const row = h('div', { class: 'w-color-row' }, [
    picker,
    hex,
    pos,
    h('span', { class: 'w-unit' }, ['%']),
    del,
  ]);
  const el = h('div', { class: 'w-rampedit' }, [presets, track, row]);

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

  /** Stop nearest to the pointer (horizontal distance only), or -1. @param {MouseEvent} e */
  const grab = (e) => {
    const r = bar.getBoundingClientRect();
    const xs = stops.map((s) => ({ x: s.pos * r.width, y: 0 }));
    return nearestIndex(xs, e.clientX - r.left, 0, GRAB);
  };

  let grabOffset = 0;
  let pressedStop = false;

  // The whole track (bar + handle row) is grabbable, so stops are easy to hit.
  attachPointer(track, {
    down(e) {
      const i = grab(e);
      pressedStop = i >= 0;
      if (pressedStop) {
        selected = i;
        grabOffset = stops[i].pos - posFromEvent(e);
        render();
      }
      return true; // presses on empty bar still count, for double-tap to add
    },
    start() {
      dragging = pressedStop; // only a press on a stop drags it
    },
    move(e) {
      if (dragging) apply(moveStop(stops, selected, posFromEvent(e) + grabOffset));
    },
    up() {
      dragging = false;
      pressedStop = false;
    },
    tap(e, isDouble) {
      if (isDouble && grab(e) < 0) apply(addStop(stops, posFromEvent(e)));
    },
  });

  // Right-click or pen side button on a stop removes it.
  attachSecondaryClick(track, (e) => {
    const i = grab(e);
    if (i >= 0) apply(removeStop(stops, i));
  });

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
