import { describe, expect, it } from 'vitest';
import { blobLayer } from '../../src/effects/layerTypes.js';
import { singleInstances } from '../../src/elements/single.js';
import { getDefaults } from '../../src/schema/index.js';
import { blobPoints, readBlobParams } from '../../src/shapes/blob.js';

const defaults = getDefaults(blobLayer.schema);
const shape = readBlobParams(defaults);

describe('blobPoints', () => {
  it('is deterministic and pinned (changing these changes every blob!)', () => {
    const a = blobPoints(shape, 482913, 0.5);
    expect(blobPoints(shape, 482913, 0.5)).toEqual(a);
    expect(a.length).toBe(128);
    // Point 0 (angle 0) and point 32 (angle π) for the default blob, seed 482913, t = 0.5.
    expect(a[0]).toBeCloseTo(62.8878, 10);
    expect(a[1]).toBe(0);
    expect(a[64]).toBeCloseTo(-63.39941111111112, 10);
    expect(a[65]).toBeCloseTo(0, 10);
  });

  it('noise 0 and no lobes = a perfect circle of the radius', () => {
    const pts = blobPoints({ ...shape, noise: 0, lobes: 0, radius: 50 }, 1, 0);
    for (let i = 0; i < pts.length; i += 2)
      expect(Math.hypot(pts[i], pts[i + 1])).toBeCloseTo(50, 9);
  });

  it('seed changes the outline; wobble 0 freezes it over time', () => {
    expect(blobPoints(shape, 1, 0)).not.toEqual(blobPoints(shape, 2, 0));
    const frozen = { ...shape, wobble: 0 };
    expect(blobPoints(frozen, 1, 0)).toEqual(blobPoints(frozen, 1, 0.9));
    expect(blobPoints(shape, 1, 0)).not.toEqual(blobPoints(shape, 1, 0.9));
  });

  it('the edge never collapses below 10% of the radius', () => {
    const wild = { ...shape, noise: 1, lobes: 6, lobeDepth: 0.6, radius: 100 };
    for (let seed = 0; seed < 20; seed++) {
      const pts = blobPoints(wild, seed, 0.3);
      for (let i = 0; i < pts.length; i += 2) {
        expect(Math.hypot(pts[i], pts[i + 1])).toBeGreaterThanOrEqual(10 - 1e-9);
      }
    }
  });
});

describe('singleInstances', () => {
  const p = {
    start: 0.2,
    end: 0.6,
    x: 5,
    y: -3,
    rotation: 90,
    scale: 2,
    scaleOverLife: [
      { x: 0, y: 0.5 },
      { x: 1, y: 1 },
    ],
    opacityOverLife: [
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ],
  };

  it('exists only inside its life window', () => {
    expect(singleInstances(p, 0.1, 1)).toEqual([]);
    expect(singleInstances(p, 0.7, 1)).toEqual([]);
    expect(singleInstances(p, 0.2, 1)).toHaveLength(1);
  });

  it('maps effect time to life age and applies curves', () => {
    const [inst] = singleInstances(p, 0.4, 9);
    expect(inst.age).toBeCloseTo(0.5, 12);
    expect(inst.scale).toBeCloseTo(2 * 0.75, 12);
    expect(inst.rotation).toBeCloseTo(Math.PI / 2, 12);
    expect([inst.x, inst.y, inst.seed]).toEqual([5, -3, 9]);
  });

  it('skips invisible instances (scale or opacity 0)', () => {
    expect(
      singleInstances(
        {
          ...p,
          scaleOverLife: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
          ],
        },
        0.4,
        1,
      ),
    ).toEqual([]);
  });
});
