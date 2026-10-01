import { describe, expect, it } from 'vitest';
import { frameTime } from '../../src/core/timing.js';

describe('frameTime', () => {
  const oneShot = { frameCount: 5, fps: 10, loop: false };
  const loop = { frameCount: 4, fps: 12, loop: true };

  it('one-shot spans t = 0 → 1 across all frames', () => {
    expect([0, 1, 2, 3, 4].map((f) => frameTime(oneShot, f).t)).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(frameTime(oneShot, 3).seconds).toBeCloseTo(0.3, 12);
  });

  it('one-shot clamps out-of-range frames', () => {
    expect(frameTime(oneShot, -3).frame).toBe(0);
    expect(frameTime(oneShot, 99).frame).toBe(4);
  });

  it('loop stops one step short of t = 1 and wraps (seamless)', () => {
    expect([0, 1, 2, 3].map((f) => frameTime(loop, f).t)).toEqual([0, 0.25, 0.5, 0.75]);
    expect(frameTime(loop, 4)).toEqual(frameTime(loop, 0));
    expect(frameTime(loop, -1)).toEqual(frameTime(loop, 3));
  });

  it('single-frame effects sit at t = 0', () => {
    expect(frameTime({ frameCount: 1, fps: 24, loop: false }, 0).t).toBe(0);
    expect(frameTime({ frameCount: 1, fps: 24, loop: true }, 5).t).toBe(0);
  });

  it('rejects invalid timing', () => {
    expect(() => frameTime({ frameCount: 0, fps: 24, loop: false }, 0)).toThrow(/frameCount/);
    expect(() => frameTime({ frameCount: 2.5, fps: 24, loop: false }, 0)).toThrow(/frameCount/);
    expect(() => frameTime({ frameCount: 8, fps: 0, loop: false }, 0)).toThrow(/fps/);
    expect(() => frameTime({ frameCount: 8, fps: 24 }, 0)).toThrow(/loop/);
  });
});
