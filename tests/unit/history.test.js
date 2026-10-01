import { describe, expect, it } from 'vitest';
import { createHistory } from '../../src/ui/history.js';

describe('undo / redo history', () => {
  it('undoes and redoes in order; a new edit clears redo', () => {
    const h = createHistory({ now: () => 0 });
    let s = 'a';
    const edit = (next, key) => {
      h.record(s, key);
      s = next;
    };
    edit('b');
    edit('c');
    s = h.undo(s);
    expect(s).toBe('b');
    s = h.undo(s);
    expect(s).toBe('a');
    expect(h.undo(s)).toBeUndefined();
    s = h.redo(s);
    expect(s).toBe('b');
    edit('x');
    expect(h.canRedo()).toBe(false);
    expect(h.undo(s)).toBe('b');
  });

  it('a slider drag (same key, close in time) is ONE undo step; a pause splits it', () => {
    let t = 0;
    const h = createHistory({ now: () => t, mergeMs: 800 });
    let s = 0;
    for (let i = 1; i <= 20; i++) {
      h.record(s, 'fireball:glow.radius');
      s = i;
      t += 30;
    }
    expect(h.undo(s)).toBe(0);
    const h2 = createHistory({ now: () => t, mergeMs: 800 });
    h2.record(0, 'k');
    t += 2000;
    h2.record(1, 'k');
    expect(h2.undo(2)).toBe(1);
    expect(h2.undo(1)).toBe(0);
  });

  it('different keys never merge; undo breaks a merge chain', () => {
    const h = createHistory({ now: () => 0 });
    h.record(0, 'a');
    h.record(1, 'b');
    expect(h.undo(2)).toBe(1);
    h.record(1, 'b'); // after an undo, the same key starts a new step
    expect(h.undo(5)).toBe(1);
  });

  it('keeps at most `limit` steps; clear forgets everything', () => {
    const h = createHistory({ now: () => 0, limit: 3 });
    for (let i = 0; i < 10; i++) h.record(i);
    expect([h.undo(10), h.undo(9), h.undo(8), h.undo(7)]).toEqual([9, 8, 7, undefined]);
    h.record(1);
    h.clear();
    expect(h.canUndo()).toBe(false);
  });
});
