import { describe, expect, it } from 'vitest';
import { makeMask } from '../../src/render/masks.js';
import {
  dragMask,
  insideMask,
  maskOutline,
  maskSchema,
  maskValues,
  parseMaskFix,
} from '../../src/ui/editor/maskPanel.js';

describe('mask editing helpers (3.6d)', () => {
  const m = makeMask('m1', { x: 10, y: 0, w: 100, h: 40, rotation: 90 });
  it('schema / values / ids', () => {
    const s = maskSchema(m);
    expect(s.map((d) => d.id)).toContain('mask.m1.feather');
    expect(maskValues(m)['maskfix.m1.mode']).toBe('add');
    expect(parseMaskFix('maskfix.m1.inverted')).toEqual({ maskId: 'm1', field: 'inverted' });
    expect(parseMaskFix('mask.m1.x')).toBeNull();
  });
  it('outline and inside respect rotation', () => {
    expect(maskOutline(makeMask('a', { shape: 'rect' })).length).toBe(4);
    expect(insideMask(m, 10, 45)).toBe(true); // rotated 90°: the long side is vertical
    expect(insideMask(m, 55, 0)).toBe(false);
  });
  it('move (⇧ = one axis) and corner resize keeps the opposite corner', () => {
    expect(dragMask(m, [0, 0], [5, 3], { kind: 'move' })).toEqual({ x: 15, y: 3, w: 100, h: 40 });
    expect(dragMask(m, [0, 0], [5, 3], { kind: 'move' }, { shift: true }).y).toBe(0);
    const flat = makeMask('b', { x: 0, y: 0, w: 100, h: 40 });
    // drag the bottom-right corner (50, 20) to (70, 30): top-left (-50, -20) stays
    const r = dragMask(flat, [50, 20], [70, 30], { kind: 'corner', corner: 2 });
    expect(r).toEqual({ x: 10, y: 5, w: 120, h: 50 });
  });
});

describe('pen paths (3.6d)', async () => {
  const mp = await import('../../src/ui/editor/maskPanel.js');
  it('points → normalized path in a box; outline and inside; vertex / handle edits', () => {
    const r = mp.pathFromPoints([
      { x: 0, y: 0, ox: 0, oy: 0 },
      { x: 100, y: 0, ox: 0, oy: 0 },
      { x: 100, y: 50, ox: 0, oy: 0 },
      { x: 0, y: 50, ox: 0, oy: 0 },
    ]);
    expect([r.x, r.y, r.w, r.h]).toEqual([50, 25, 100, 50]);
    const m = makeMask('p', { shape: 'path', ...r });
    expect(mp.vertexAt(m, 2)).toEqual([100, 50]);
    expect(insideMask(m, 50, 25)).toBe(true);
    expect(insideMask(m, 150, 25)).toBe(false);
    expect(maskOutline(m).length).toBe(48);
    const moved = { ...m, path: mp.moveVertex(m, 2, [120, 70]) };
    expect(mp.vertexAt(moved, 2)).toEqual([120, 70]);
    const h = { ...m, path: mp.moveHandle(m, 1, 'out', [110, 10]) };
    expect(mp.handleAt(h, 1, 'out')).toEqual([110, 10]);
    expect(mp.handleAt(h, 1, 'in')).toEqual([90, -10]); // mirrored
    const broken = { ...m, path: mp.moveHandle(m, 1, 'out', [110, 10], true) };
    expect(mp.handleAt(broken, 1, 'in')).toEqual([100, 0]);
    const smooth = mp.toggleSmooth(m, 0);
    expect(smooth[0].ox).not.toBe(0);
    expect(mp.toggleSmooth({ ...m, path: smooth }, 0)[0].ox).toBe(0);
  });
});
