// @ts-check
/**
 * Undo / redo (step 3.6a). Keeps whole editor states (they are small and immutable: every edit
 * makes a new state), so undo is exact.
 *
 * Call `record(stateBeforeTheEdit, key)` BEFORE applying an edit. Edits with the same key
 * close together in time (a slider drag, typing a number) collapse into ONE undo step: only
 * the state before the first of them is kept.
 */

/**
 * @template S
 * @param {{ limit?: number, mergeMs?: number, now?: () => number }} [o]
 */
export function createHistory(o = {}) {
  const limit = o.limit ?? 200;
  const mergeMs = o.mergeMs ?? 800;
  const now = o.now ?? (() => performance.now());
  /** @type {S[]} */
  let past = [];
  /** @type {S[]} */
  let future = [];
  let lastKey = '';
  let lastTime = -Infinity;

  return {
    /**
     * Remember the state before an edit.
     * @param {S} before @param {string} [key] same key within `mergeMs` = same undo step
     */
    record(before, key = '') {
      const t = now();
      const merge = key !== '' && key === lastKey && t - lastTime <= mergeMs;
      lastKey = key;
      lastTime = t;
      future = [];
      if (merge) return;
      past.push(before);
      if (past.length > limit) past = past.slice(past.length - limit);
    },
    /** @param {S} current @returns {S | undefined} the state to show, or undefined if nothing to undo */
    undo(current) {
      const prev = past.pop();
      if (prev === undefined) return undefined;
      future.push(current);
      lastKey = '';
      return prev;
    },
    /** @param {S} current @returns {S | undefined} */
    redo(current) {
      const next = future.pop();
      if (next === undefined) return undefined;
      past.push(current);
      lastKey = '';
      return next;
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    /** Forget everything (e.g. after loading a preset or a file). */
    clear() {
      past = [];
      future = [];
      lastKey = '';
    },
  };
}
