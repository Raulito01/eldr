import { describe, expect, it } from 'vitest';
import {
  approxEqual,
  clamp,
  clamp01,
  degToRad,
  fract,
  invLerp,
  lerp,
  mod,
  radToDeg,
  remap,
  smootherstep,
  smoothstep,
  TAU,
  wrap,
} from '../../src/core/math.js';

describe('math helpers', () => {
  it('clamp / clamp01', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(-0.2)).toBe(0);
  });

  it('lerp / invLerp / remap', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(invLerp(10, 20, 12.5)).toBe(0.25);
    expect(invLerp(5, 5, 7)).toBe(0);
    expect(remap(5, 0, 10, 100, 200)).toBe(150);
  });

  it('smoothstep / smootherstep', () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBe(0.5);
    expect(smootherstep(0, 1, 0.5)).toBe(0.5);
  });

  it('fract / mod / wrap handle negatives', () => {
    expect(fract(2.25)).toBe(0.25);
    expect(fract(-0.25)).toBe(0.75);
    expect(mod(-1, 4)).toBe(3);
    expect(wrap(370, 0, 360)).toBe(10);
    expect(wrap(-10, 0, 360)).toBe(350);
  });

  it('angles', () => {
    expect(TAU).toBeCloseTo(2 * Math.PI, 15);
    expect(degToRad(180)).toBeCloseTo(Math.PI, 15);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90, 12);
    expect(approxEqual(0.1 + 0.2, 0.3)).toBe(true);
  });
});
