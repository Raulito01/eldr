// @ts-check
/**
 * Layer selection like After Effects (3.7b): click = only this layer, ⌘/Ctrl-click = add /
 * remove, ⇧-click = range from the active layer (in the order the list shows).
 * The ACTIVE layer is the one the inspector and handles show.
 */

/**
 * @param {{ active: string, ids: string[] }} sel current selection
 * @param {string} id clicked layer
 * @param {{ meta?: boolean, shift?: boolean }} mods
 * @param {string[]} order layer ids as displayed (top first)
 * @returns {{ active: string, ids: string[] }}
 */
export function clickSelect(sel, id, mods, order) {
  if (mods.shift && sel.active && order.includes(sel.active)) {
    const a = order.indexOf(sel.active);
    const b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    return { active: id, ids: [...new Set([...(mods.meta ? sel.ids : []), ...range])] };
  }
  if (mods.meta) {
    if (sel.ids.includes(id)) {
      const ids = sel.ids.filter((x) => x !== id);
      return { active: id === sel.active ? (ids[ids.length - 1] ?? '') : sel.active, ids };
    }
    return { active: id, ids: [...sel.ids, id] };
  }
  return { active: id, ids: [id] };
}

/** Drop ids that no longer exist; keep an active layer. @param {{ active: string, ids: string[] }} sel @param {string[]} existing */
export function cleanSelection(sel, existing) {
  const ids = sel.ids.filter((x) => existing.includes(x));
  const active = existing.includes(sel.active)
    ? sel.active
    : (ids[ids.length - 1] ?? existing[existing.length - 1] ?? '');
  return { active, ids: active && !ids.includes(active) ? [...ids, active] : ids };
}
