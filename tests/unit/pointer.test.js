import { describe, expect, it } from 'vitest';
import { DOUBLE_TAP, isDoubleTap, passedThreshold } from '../../src/ui/pointer.js';

describe('pen-friendly pointer helpers', () => {
  it('pen jitter below the threshold is not a drag; mouse is more sensitive', () => {
    const start = { x: 100, y: 100 };
    expect(passedThreshold(start, { x: 103, y: 102 }, 'pen')).toBe(false);
    expect(passedThreshold(start, { x: 104, y: 104 }, 'pen')).toBe(true);
    expect(passedThreshold(start, { x: 102, y: 100 }, 'mouse')).toBe(true);
  });

  it('double-tap tolerates pen wobble but not slow or distant taps', () => {
    const a = { x: 50, y: 50, time: 1000, type: 'pen' };
    expect(isDoubleTap(a, { x: 59, y: 57, time: 1300, type: 'pen' })).toBe(true);
    expect(isDoubleTap(a, { x: 50, y: 50, time: 1000 + DOUBLE_TAP.ms + 1, type: 'pen' })).toBe(
      false,
    );
    expect(isDoubleTap(a, { x: 80, y: 50, time: 1100, type: 'pen' })).toBe(false);
    // The same wobble with a mouse is two separate clicks.
    expect(isDoubleTap({ ...a, type: 'mouse' }, { x: 59, y: 57, time: 1300, type: 'mouse' })).toBe(
      false,
    );
    expect(isDoubleTap(null, a)).toBe(false);
  });
});

describe('attachPointer with simulated pen events', async () => {
  const { Window } = await import('happy-dom');
  const { attachPointer } = await import('../../src/ui/pointer.js');
  const win = new Window();
  const ev = (type, x, y, extra = {}) =>
    new win.PointerEvent(type, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: 'pen',
      button: 0,
      buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1, // tip down while pressed
      bubbles: true,
      ...extra,
    });

  function setup() {
    const el = win.document.createElement('div');
    win.document.body.appendChild(el);
    const log = [];
    attachPointer(el, {
      start: () => log.push('start'),
      move: () => log.push('move'),
      tap: (_e, isDouble) => log.push(isDouble ? 'double' : 'tap'),
    });
    const press = (x, y, moves = []) => {
      el.dispatchEvent(ev('pointerdown', x, y));
      for (const [mx, my] of moves) el.dispatchEvent(ev('pointermove', mx, my));
      el.dispatchEvent(ev('pointerup', moves.at(-1)?.[0] ?? x, moves.at(-1)?.[1] ?? y));
    };
    return { el, log, press };
  }

  it('a jittery pen tap stays a tap (no drag, no move)', () => {
    const { log, press } = setup();
    press(100, 100, [
      [101, 102],
      [102, 101],
    ]);
    expect(log).toEqual(['tap']);
  });

  it('two wobbly pen taps make a double-tap', () => {
    const { log, press } = setup();
    press(100, 100);
    press(108, 106);
    expect(log).toEqual(['tap', 'double']);
  });

  it('moving past the threshold is a drag, not a tap', () => {
    const { log, press } = setup();
    press(100, 100, [
      [103, 103],
      [110, 100],
      [120, 100],
    ]);
    expect(log).toEqual(['start', 'move', 'move']);
  });

  it('pen side / eraser buttons do not start a press', () => {
    const { el, log } = setup();
    el.dispatchEvent(ev('pointerdown', 100, 100, { button: 2 }));
    el.dispatchEvent(ev('pointermove', 150, 100));
    el.dispatchEvent(ev('pointerup', 150, 100));
    expect(log).toEqual([]);
  });
});
