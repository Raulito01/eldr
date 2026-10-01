// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { bindFrameSize, FRAME_SIZES, parseFrameSize } from '../../src/ui/frameSize.js';

describe('frame sizes (3.5b)', () => {
  it('offers square sizes up to 2048 and wide HD / Full HD / 2K', () => {
    const keys = FRAME_SIZES.map((s) => `${s.w}x${s.h}`);
    expect(keys).toEqual(
      expect.arrayContaining(['2048x2048', '1280x720', '1920x1080', '1024x1024']),
    );
  });

  it('parses custom sizes, clamped', () => {
    expect(parseFrameSize('1600x900')).toEqual({ w: 1600, h: 900 });
    expect(parseFrameSize(' 1600 × 900 ')).toEqual({ w: 1600, h: 900 });
    expect(parseFrameSize('700')).toEqual({ w: 700, h: 700 });
    expect(parseFrameSize('99999x2')).toEqual({ w: 4096, h: 16 });
    expect(parseFrameSize('big')).toBeNull();
  });

  it('menu: picking a size reports it; Custom… asks; cancel keeps the old size', () => {
    const select = document.createElement('select');
    const got = [];
    bindFrameSize(select, { w: 512, h: 512 }, (s) => got.push(s));
    expect(select.value).toBe('512x512');
    select.value = '1920x1080';
    select.dispatchEvent(new Event('change'));
    globalThis.prompt = () => '1600x900';
    select.value = 'custom';
    select.dispatchEvent(new Event('change'));
    expect(select.value).toBe('1600x900');
    globalThis.prompt = () => null;
    select.value = 'custom';
    select.dispatchEvent(new Event('change'));
    expect(select.value).toBe('1600x900');
    expect(got).toEqual([
      { w: 1920, h: 1080 },
      { w: 1600, h: 900 },
    ]);
  });
});
