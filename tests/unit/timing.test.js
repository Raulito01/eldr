import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PHASES,
  frameAtTime,
  frameTime,
  phaseAt,
  phasesOf,
} from '../../src/core/timing.js';

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

describe('holds (ones / twos / threes)', () => {
  const base = { frameCount: 12, fps: 24, loop: false };

  it('twos: frames share the drawing of the first frame in their pair', () => {
    const t = { ...base, holdMode: 'twos' };
    expect([0, 1, 2, 3, 10, 11].map((f) => frameTime(t, f).drawFrame)).toEqual([
      0, 0, 2, 2, 10, 10,
    ]);
    expect(frameTime(t, 1).t).toBe(frameTime(t, 0).t);
    expect(frameTime(t, 3).frame).toBe(3); // playback position is kept
  });

  it('threes and ones', () => {
    const threes = { ...base, holdMode: 'threes' };
    expect([0, 2, 3, 5, 6, 11].map((f) => frameTime(threes, f).drawFrame)).toEqual([
      0, 0, 3, 3, 6, 9,
    ]);
    expect(frameTime({ ...base, holdMode: 'ones' }, 5).drawFrame).toBe(5);
    expect(frameTime(base, 5).drawFrame).toBe(5); // default = ones
  });

  it('loops with holds still wrap seamlessly', () => {
    const t = { frameCount: 8, fps: 12, loop: true, holdMode: 'twos' };
    expect(frameTime(t, 9)).toEqual(frameTime(t, 1));
    expect(frameTime(t, 7).t).toBe(6 / 8);
  });

  it('rejects unknown hold modes', () => {
    expect(() => frameTime({ ...base, holdMode: 'fours' }, 0)).toThrow(/holdMode/);
  });
});

describe('phases', () => {
  it('uses defaults and classifies time', () => {
    const t = { frameCount: 24, fps: 24, loop: false, phases: { impact: 0.25, decay: 0.75 } };
    expect(phaseAt(t, 0.1)).toBe('anticipation');
    expect(phaseAt(t, 0.25)).toBe('action');
    expect(phaseAt(t, 0.8)).toBe('decay');
    expect(phasesOf({ frameCount: 2, fps: 24, loop: false })).toEqual(DEFAULT_PHASES);
  });

  it('frameAtTime places markers on frames', () => {
    expect(frameAtTime({ frameCount: 21, fps: 24, loop: false }, 0.5)).toBe(10);
    expect(frameAtTime({ frameCount: 20, fps: 24, loop: true }, 0.5)).toBe(10);
    expect(frameAtTime({ frameCount: 20, fps: 24, loop: false }, 1)).toBe(19);
  });

  it('rejects impact after decay', () => {
    expect(() =>
      frameTime({ frameCount: 4, fps: 24, loop: false, phases: { impact: 0.8, decay: 0.2 } }, 0),
    ).toThrow(/phases/);
  });
});
