// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clampSize, makeSplitter } from '../../src/ui/splitters.js';

const ev = (type, o) => {
  const e = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    ...o,
  });
  Object.defineProperty(e, 'pointerId', { value: 1 });
  return e;
};

describe('panel dividers (D-080)', () => {
  it('drags a panel bigger / smaller within its limits; double-click resets', () => {
    let size = 300;
    let saved = 0;
    const bar = document.createElement('div');
    bar.setPointerCapture = () => {};
    document.body.append(bar);
    makeSplitter(bar, {
      axis: 'y',
      sign: -1, // a bar above the timeline: dragging UP makes it taller
      get: () => size,
      set: (v) => {
        size = v;
      },
      limits: () => [48, 500],
      reset: () => {
        size = 220;
      },
      done: () => saved++,
    });
    bar.dispatchEvent(ev('pointerdown', { clientY: 400 }));
    bar.dispatchEvent(ev('pointermove', { clientY: 300 }));
    expect(size).toBe(400);
    bar.dispatchEvent(ev('pointermove', { clientY: -500 }));
    expect(size).toBe(500); // max
    bar.dispatchEvent(ev('pointermove', { clientY: 900 }));
    expect(size).toBe(48); // min
    bar.dispatchEvent(ev('pointerup', {}));
    expect(saved).toBe(1);
    bar.dispatchEvent(ev('dblclick', {}));
    expect(size).toBe(220);
    expect(clampSize(10, 160, 120)).toBe(160);
  });
});
