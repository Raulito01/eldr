import { describe, expect, it } from 'vitest';
import {
  clampZoom,
  fitZoom,
  frameRect,
  stepZoom,
  ZOOM_MAX,
  ZOOM_MIN,
  zoomAt,
} from '../../src/ui/viewportMath.js';

const view = (over = {}) => ({
  frameW: 256,
  frameH: 256,
  viewW: 800,
  viewH: 600,
  zoom: 1,
  panX: 0,
  panY: 0,
  ...over,
});

describe('viewport math', () => {
  it('fitZoom fits the limiting side with a margin', () => {
    expect(fitZoom(256, 256, 800, 600, 24)).toBeCloseTo((600 - 48) / 256, 12);
    expect(fitZoom(1000, 100, 800, 600, 0)).toBeCloseTo(0.8, 12);
    expect(fitZoom(10, 10, 10000, 10000)).toBe(ZOOM_MAX);
    expect(fitZoom(256, 256, 10, 10)).toBe(ZOOM_MIN);
  });

  it('frameRect centres the frame and applies pan', () => {
    expect(frameRect(view())).toEqual({ x: 272, y: 172, w: 256, h: 256 });
    expect(frameRect(view({ zoom: 2, panX: 10, panY: -5 }))).toEqual({
      x: 154,
      y: 39,
      w: 512,
      h: 512,
    });
  });

  it('zoomAt keeps the point under the cursor in place', () => {
    const before = view({ panX: 30, panY: -12 });
    const sx = 350;
    const sy = 260;
    const r0 = frameRect(before);
    const fx = (sx - r0.x) / before.zoom;
    const fy = (sy - r0.y) / before.zoom;
    const after = zoomAt(before, sx, sy, 3);
    const r1 = frameRect(after);
    expect(r1.x + fx * after.zoom).toBeCloseTo(sx, 9);
    expect(r1.y + fy * after.zoom).toBeCloseTo(sy, 9);
    expect(after.zoom).toBe(3);
  });

  it('zoomAt clamps the zoom', () => {
    expect(zoomAt(view(), 0, 0, 1000).zoom).toBe(ZOOM_MAX);
    expect(clampZoom(0.0001)).toBe(ZOOM_MIN);
  });

  it('stepZoom moves between presets, also from in-between values', () => {
    expect(stepZoom(1, 1)).toBe(1.5);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(2.2, 1)).toBe(3);
    expect(stepZoom(2.2, -1)).toBe(2);
    expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
  });
});
