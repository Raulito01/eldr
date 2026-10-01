import { describe, expect, it } from 'vitest';
import { dragBar, secondsToX, snapToFrame, xToSeconds } from '../../src/ui/editor/layerTimeline.js';

const T = { offset: 0, stretch: 1, in: 0, out: null };

describe('layer timeline maths (3.6c)', () => {
  it('seconds ↔ x and frame snapping', () => {
    expect(secondsToX(0.5, 2, 400)).toBe(100);
    expect(xToSeconds(100, 2, 400)).toBe(0.5);
    expect(snapToFrame(0.51, 30)).toBeCloseTo(15 / 30, 12);
  });

  it('slide moves offset, in and out together (in never below 0)', () => {
    expect(dragBar({ ...T, out: 1 }, 'slide', 0.2, 2, 30)).toEqual({
      offset: 0.2,
      stretch: 1,
      in: 0.2,
      out: 1.2,
    });
    expect(dragBar(T, 'slide', -0.3, 2, 30)).toMatchObject({ offset: -0.3, in: 0, out: null });
  });

  it('trim in / out keeps at least one frame; trimming out to the end means "until the end"', () => {
    expect(dragBar(T, 'in', 0.5, 2, 30).in).toBe(0.5);
    expect(dragBar({ ...T, out: 1 }, 'in', 5, 2, 30).in).toBeCloseTo(1 - 1 / 30, 12);
    expect(dragBar(T, 'out', -0.5, 2, 30).out).toBe(1.5);
    expect(dragBar({ ...T, in: 1 }, 'out', -5, 2, 30).out).toBeCloseTo(1 + 1 / 30, 12);
    expect(dragBar(T, 'out', 1, 2, 30).out).toBeNull();
  });

  it('stretch scales time around the layer start', () => {
    const s = dragBar({ ...T, out: 1 }, 'stretch', 1, 4, 30);
    expect(s.stretch).toBeCloseTo(2, 12);
    expect(s.out).toBeCloseTo(2, 12);
    const open = dragBar(T, 'stretch', -1, 2, 30); // no out: uses the comp end
    expect(open.stretch).toBeCloseTo(0.5, 12);
    expect(open.out).toBeNull();
  });
});
