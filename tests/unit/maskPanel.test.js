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
