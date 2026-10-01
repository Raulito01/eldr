// Transform handles (3.6b): hit testing and drag maths at different zooms.
import { describe, expect, it } from 'vitest';
import { apply, worldMatrices } from '../../src/core/transform2d.js';
import { makeLayer } from '../../src/effects/explosion/explosion.js';
import { dragTo, gizmoGeometry, hitTest, startDrag } from '../../src/ui/editor/gizmo.js';

/** effect px → screen px: frame 512 at zoom z, pivot centre, render scale s, frame at (ox, oy). */
const mapFor = (z = 1, s = 1, ox = 100, oy = 50) => ({
  toScreen: (ex, ey) => [ox + (256 + ex * s) * z, oy + (256 + ey * s) * z],
  toEffect: (sx, sy) => [((sx - ox) / z - 256) / s, ((sy - oy) / z - 256) / s],
});
const L = (id, transform = {}, parent = null) => makeLayer({ id, type: 'blob', transform, parent });

describe('gizmo', () => {
  it('geometry follows the layer: anchor on screen, rotate handle "above" the layer', () => {
    const layers = [L('a', { x: 20, y: 10, rotation: 90 })];
    for (const z of [0.5, 1, 3]) {
      const map = mapFor(z, 1.5);
      const g = gizmoGeometry(layers, 'a', map);
      const [sx, sy] = map.toScreen(20, 10);
      expect(g.anchor[0]).toBeCloseTo(sx, 9);
      expect(g.anchor[1]).toBeCloseTo(sy, 9);
      // rotated 90° clockwise: the layer's "up" (−y) points to screen +x
      expect(g.rotate[0]).toBeGreaterThan(g.anchor[0]);
      expect(g.rotate[1]).toBeCloseTo(g.anchor[1], 9);
    }
  });

  it('hit test: rotate, corners, anchor (⌥ = anchor), inside = move, outside = nothing', () => {
    const g = gizmoGeometry([L('a')], 'a', mapFor());
    expect(hitTest(g, ...g.rotate)).toBe('rotate');
    expect(hitTest(g, ...g.corners[2])).toBe('scale');
    expect(hitTest(g, ...g.anchor)).toBe('move');
    expect(hitTest(g, ...g.anchor, { alt: true })).toBe('anchor');
    expect(hitTest(g, g.anchor[0] + 20, g.anchor[1] + 5)).toBe('move');
    expect(hitTest(g, g.anchor[0] + 300, g.anchor[1])).toBeNull();
  });

  it('move: the anchor follows the pointer exactly, also under a rotated, scaled parent', () => {
    const layers = [
      L('p', { x: 30, rotation: 40, scaleX: 200, scaleY: 200 }),
      L('c', { x: 5 }, 'p'),
    ];
    const map = mapFor(2, 1.3);
    const d = startDrag(layers, 'c', 'move', [0, 0]);
    const t = dragTo(d, [12, -7]);
    const moved = layers.map((l) => (l.id === 'c' ? { ...l, transform: t } : l));
    const w = worldMatrices(moved).get('c');
    const [x, y] = apply(w, 0, 0);
    expect(x).toBeCloseTo(d.anchorWorld[0] + 12, 9);
    expect(y).toBeCloseTo(d.anchorWorld[1] - 7, 9);
    expect(map).toBeTruthy();
  });

  it('rotate: angle around the anchor, Shift snaps to 15°', () => {
    const d = startDrag([L('a', { rotation: 10 })], 'a', 'rotate', [10, 0]);
    expect(dragTo(d, [0, 10]).rotation).toBeCloseTo(100, 9);
    expect(dragTo(d, [10, 3], { shift: true }).rotation % 15).toBeCloseTo(0, 9);
  });

  it('scale: per axis along the layer, uniform when linked or Shift', () => {
    const d = startDrag([L('a', { rotation: 90 })], 'a', 'scale', [-10, 10]); // corner: local (10, 10)
    const t = dragTo(d, [5, 20]);
    expect(t.scaleX).toBeCloseTo(200, 9);
    expect(t.scaleY).toBeCloseTo(-50, 9); // pointer crossed to the other side of the y axis
    const u = dragTo(d, [-30, 30], { linked: true });
    expect([u.scaleX, u.scaleY].map(Math.round)).toEqual([300, 300]);
  });

  it('anchor (⌥): the anchor moves to the pointer and the layer content stays put', () => {
    const layers = [L('a', { x: 40, y: 0, rotation: 30, scaleX: 150, scaleY: 150 })];
    const before = worldMatrices(layers).get('a');
    const d = startDrag(layers, 'a', 'anchor', [40, 0]);
    const t = dragTo(d, [55, 12]);
    const after = worldMatrices([{ ...layers[0], transform: t }]).get('a');
    for (const [x, y] of [
      [0, 0],
      [7, -3],
    ]) {
      const p = apply(before, x, y);
      const q = apply(after, x, y);
      expect(q[0]).toBeCloseTo(p[0], 9);
      expect(q[1]).toBeCloseTo(p[1], 9);
    }
    const [ax, ay] = apply(after, t.anchorX, t.anchorY);
    expect(ax).toBeCloseTo(55, 9);
    expect(ay).toBeCloseTo(12, 9);
  });
});
