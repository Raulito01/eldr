import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { createPreviewCache } from '../../src/ui/editor/previewCache.js';

const setup = () => {
  const calls = [];
  let shown = new Set();
  const surface = { canvas: createCanvas(8, 8), width: 8, height: 8 };
  const cache = createPreviewCache({
    render: (f) => {
      calls.push(f);
      return surface;
    },
    onChange: (s) => {
      shown = s;
    },
    makeCanvas: (w, h) => createCanvas(w, h),
  });
  return { cache, calls, shown: () => shown };
};

describe('preview cache / RAM preview (D-077)', () => {
  it('renders a frame once; frames on the same drawing share it; a new key starts over', () => {
    const { cache, calls, shown } = setup();
    cache.setKey('a', [0, 0, 2, 2]); // on twos
    expect(cache.frame(1).cached).toBe(false);
    expect(cache.frame(0).cached).toBe(true);
    expect(calls).toEqual([1]);
    expect([...shown()].sort()).toEqual([0, 1]);
    cache.setKey('b', [0, 0, 2, 2]);
    expect(cache.frame(0).cached).toBe(false);
  });

  it('fills the missing frames in the background, and pauses while busy', async () => {
    const { cache, shown } = setup();
    cache.setKey('k', [0, 1, 2, 3, 4]);
    let busy = true;
    cache.fill({ delay: 0, busy: () => busy });
    await new Promise((r) => setTimeout(r, 30));
    expect(shown().size).toBe(0);
    busy = false;
    await new Promise((r) => setTimeout(r, 400));
    expect(shown().size).toBe(5);
    expect(cache.stats().cached).toBe(5);
  });
});
