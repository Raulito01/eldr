import { describe, expect, it } from 'vitest';
import { addPoint, MIN_GAP, movePoint, removePoint } from '../../src/ui/widgets/curveOps.js';

const pts = [
  { x: 0, y: 0 },
  { x: 0.5, y: 1 },
  { x: 1, y: 0.5 },
];

describe('curve editing', () => {
  it('endpoints keep their x; y is clamped', () => {
    expect(movePoint(pts, 0, 0.4, 3, 0, 2)[0]).toEqual({ x: 0, y: 2 });
    expect(movePoint(pts, 2, 0.1, -1, 0, 2)[2]).toEqual({ x: 1, y: 0 });
  });

  it('inner points stay between their neighbours', () => {
    expect(movePoint(pts, 1, 5, 0.5, 0, 1)[1].x).toBeCloseTo(1 - MIN_GAP, 12);
    expect(movePoint(pts, 1, -5, 0.5, 0, 1)[1].x).toBeCloseTo(MIN_GAP, 12);
  });

  it('never mutates the input', () => {
    const copy = structuredClone(pts);
    movePoint(pts, 1, 0.2, 0.2, 0, 1);
    addPoint(pts, 0.25, 0.5, 0, 1);
    removePoint(pts, 1);
    expect(pts).toEqual(copy);
  });

  it('adds points in x order, rejects ones too close to existing points', () => {
    const { points, index } = addPoint(pts, 0.25, 0.4, 0, 1);
    expect(index).toBe(1);
    expect(points.map((p) => p.x)).toEqual([0, 0.25, 0.5, 1]);
    expect(addPoint(pts, 0.502, 0.4, 0, 1).index).toBe(-1);
  });

  it('removes inner points only', () => {
    expect(removePoint(pts, 1)).toHaveLength(2);
    expect(removePoint(pts, 0)).toBe(pts);
    expect(removePoint(pts, 2)).toBe(pts);
  });
});
