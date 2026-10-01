import { describe, expect, it } from 'vitest';
import {
  apply,
  decompose,
  invert,
  localMatrix,
  multiply,
  transformForParent,
  worldMatrices,
  wouldCycle,
} from '../../src/core/transform2d.js';

const close = (p, q, digits = 9) => {
  expect(p[0]).toBeCloseTo(q[0], digits);
  expect(p[1]).toBeCloseTo(q[1], digits);
};

describe('layer transform maths', () => {
  it('position moves, rotation turns clockwise around the anchor, scale is in percent', () => {
    close(apply(localMatrix({ x: 10, y: 5 }), 1, 1), [11, 6]);
    // 90° clockwise (y down): +x → +y
    close(apply(localMatrix({ rotation: 90 }), 10, 0), [0, 10]);
    close(apply(localMatrix({ scaleX: 200, scaleY: 50 }), 10, 10), [20, 5]);
    // anchor: the anchor point lands on the position, and rotation/scale happen around it
    const m = localMatrix({ x: 100, y: 0, anchorX: 10, anchorY: 0, rotation: 90, scaleX: 200 });
    close(apply(m, 10, 0), [100, 0]);
    close(apply(m, 11, 0), [100, 2]);
  });

  it('invert and decompose undo localMatrix', () => {
    const t = { x: 12, y: -40, anchorX: 5, anchorY: 7, scaleX: 150, scaleY: -80, rotation: 33 };
    const m = localMatrix(t);
    close(apply(multiply(invert(m), m), 3, 4), [3, 4]);
    const back = decompose(m, 5, 7);
    for (const k of Object.keys(t)) expect(back[k]).toBeCloseTo(t[k], 9);
  });

  it('parent chains: a child follows its parent (and grand-parent)', () => {
    const layers = [
      { id: 'root', transform: { x: 100, rotation: 90 } },
      { id: 'mid', parent: 'root', transform: { x: 10 } },
      { id: 'leaf', parent: 'mid', transform: { scaleX: 50 } },
    ];
    const w = worldMatrices(layers);
    close(apply(w.get('mid'), 0, 0), [100, 10]); // root turned +x into +y
    close(apply(w.get('leaf'), 4, 0), [100, 12]);
  });

  it('loops are refused and never hang the renderer', () => {
    const layers = [
      { id: 'a', parent: 'b' },
      { id: 'b', parent: null },
      { id: 'c', parent: 'a' },
    ];
    expect(wouldCycle(layers, 'b', 'c')).toBe(true); // c → a → b
    expect(wouldCycle(layers, 'b', 'b')).toBe(true);
    expect(wouldCycle(layers, 'c', 'b')).toBe(false);
    const broken = [
      { id: 'a', parent: 'b', transform: { x: 1 } },
      { id: 'b', parent: 'a', transform: { x: 2 } },
    ];
    expect(worldMatrices(broken).size).toBe(2);
  });

  it('re-parenting keeps the layer exactly where it is on screen', () => {
    const layers = [
      { id: 'null', transform: { x: 50, y: 20, rotation: 30, scaleX: 200, scaleY: 200 } },
      {
        id: 'fx',
        transform: { x: -10, y: 40, anchorX: 3, anchorY: 4, rotation: 10, scaleX: 80, scaleY: 80 },
      },
    ];
    const before = worldMatrices(layers).get('fx');
    const t = transformForParent(layers, 'fx', 'null');
    const after = worldMatrices([layers[0], { id: 'fx', parent: 'null', transform: t }]).get('fx');
    for (const [x, y] of [
      [0, 0],
      [10, -5],
    ])
      close(apply(after, x, y), apply(before, x, y));
    expect([t.anchorX, t.anchorY]).toEqual([3, 4]);
    // and back to no parent
    const t2 = transformForParent(
      [layers[0], { id: 'fx', parent: 'null', transform: t }],
      'fx',
      null,
    );
    expect(t2.x).toBeCloseTo(-10, 9);
    expect(t2.rotation).toBeCloseTo(10, 9);
  });
});
