import { describe, expect, it } from 'vitest';
import { playbackFrame } from '../../src/ui/playback.js';

const timing = { frameCount: 10, fps: 20 }; // 50 ms per frame

describe('playbackFrame', () => {
  it('advances by elapsed time from the start frame', () => {
    expect(playbackFrame(0, timing, 3, true)).toEqual({ frame: 3, ended: false });
    expect(playbackFrame(49, timing, 3, true)).toEqual({ frame: 3, ended: false });
    expect(playbackFrame(50, timing, 3, true)).toEqual({ frame: 4, ended: false });
  });

  it('wraps when repeating', () => {
    expect(playbackFrame(50 * 9, timing, 3, true).frame).toBe(2);
  });

  it('stops on the last frame when not repeating', () => {
    expect(playbackFrame(50 * 5, timing, 3, false)).toEqual({ frame: 8, ended: false });
    expect(playbackFrame(50 * 6, timing, 3, false)).toEqual({ frame: 9, ended: true });
    expect(playbackFrame(99999, timing, 3, false)).toEqual({ frame: 9, ended: true });
  });

  it('ignores negative elapsed time', () => {
    expect(playbackFrame(-100, timing, 2, true).frame).toBe(2);
  });
});
