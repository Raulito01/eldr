// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createSlider, FINE_FACTOR, valueAtX } from '../../src/ui/widgets/slider.js';

describe('valueAtX', () => {
  it('maps position to value and clamps', () => {
    expect(valueAtX(50, 200, 0, 1)).toBe(0.25);
    expect(valueAtX(-10, 200, 0, 1)).toBe(0);
    expect(valueAtX(500, 200, 0, 10)).toBe(10);
    expect(valueAtX(10, 0, 3, 9)).toBe(3);
  });
});

describe('createSlider (regression: native sliders could not be dragged with a pen)', () => {
  /** Slider with a fake 200 px wide rail at x = 100. */
  function setup(value = 0.5) {
    const got = [];
    let slider;
    slider = createSlider({
      min: 0,
      max: 1,
      step: 0.01,
      value,
      onInput: (v) => {
        got.push(v);
        slider.set(v);
      },
    });
    document.body.replaceChildren(slider.el);
    const rail = slider.el.querySelector('.w-slider-rail');
    rail.getBoundingClientRect = () => ({
      left: 100,
      width: 200,
      top: 0,
      height: 4,
      right: 300,
      bottom: 4,
    });
    slider.el.setPointerCapture = () => {};
    const pen = (type, x, extra = {}) =>
      slider.el.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          pointerId: 7,
          pointerType: 'pen',
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          bubbles: true,
          ...extra,
        }),
      );
    return { slider, got, pen };
  }

  it('pen press jumps to the position and dragging follows the pen', () => {
    const { got, pen } = setup();
    pen('pointerdown', 150);
    pen('pointermove', 250);
    pen('pointermove', 400); // beyond the end → clamped
    pen('pointerup', 400);
    expect(got).toEqual([0.25, 0.75, 1]);
  });

  it('a missed release never leaves the slider stuck to the pointer (D-113)', () => {
    const { got, pen } = setup();
    pen('pointerdown', 150);
    pen('pointermove', 200, { buttons: 0 }); // the pen is already up (release was missed)
    pen('pointermove', 280, { buttons: 0 }); // hovering: must not drag
    expect(got).toEqual([0.25]);
  });

  it('Shift-drag is 10× finer and relative (no jump)', () => {
    const { got, pen } = setup(0.5);
    pen('pointerdown', 150, { shiftKey: true });
    pen('pointermove', 250, { shiftKey: true }); // +100 px of 200 px = +0.5 × fine factor
    expect(got.length).toBe(1);
    expect(got[0]).toBeCloseTo(0.5 + 0.5 * FINE_FACTOR, 12);
  });

  it('side button does not change the value; arrows step it', () => {
    const { slider, got, pen } = setup(0.5);
    pen('pointerdown', 150, { button: 2 });
    expect(got).toEqual([]);
    slider.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    slider.el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }),
    );
    expect(got[0]).toBeCloseTo(0.51, 12);
    expect(got[1]).toBeCloseTo(0.41, 12);
  });
});
