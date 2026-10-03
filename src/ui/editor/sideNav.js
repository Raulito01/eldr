// @ts-check
/**
 * Right-panel navigation (D-112): find a setting, fold groups, jump bar.
 *
 * Works on whatever the panel shows (every inspector group is a `details.insp-group`), so it
 * keeps working as the panel is rebuilt for another layer:
 * - **Find a setting** (/ to focus, Esc to clear): only rows whose label, tooltip or group
 *   match stay visible; groups with matches open (without changing what you keep open).
 * - **Fold all / Unfold all**, and **Accordion** (opening a group closes the others; Alt+click a
 *   group title does it once). Which groups you keep open is remembered (by group name).
 * - **Jump bar**: a chip per group in the panel; tap one to open it and scroll it to the top.
 * Pen-friendly: big targets, nothing needs hover.
 */

import { h } from '../dom.js';

const STORE = 'eldr.panel.folds';
const ACCORDION = 'eldr.panel.accordion';

/** @param {string} key @param {any} fallback */
const load = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
/** @param {string} key @param {any} v */
const save = (key, v) => {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    // storage unavailable: folds simply aren't remembered
  }
};

/**
 * Does a row match the search? Every word must appear in its label, tooltip or group.
 * @param {string} query @param {string} label @param {string} tip @param {string} group
 */
export function matchesQuery(query, label, tip, group) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${label} ${tip} ${group}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/**
 * @param {HTMLElement} side  the scrolling right panel
 * @returns {{ focusSearch: () => void, refresh: () => void }}
 */
export function createSideNav(side) {
  /** @type {Record<string, boolean>} group name → open */
  const folds = load(STORE, {});
  let accordion = !!load(ACCORDION, false);
  let query = '';
  /**
   * Groups we opened / closed ourselves → the state we set and when: their (async) toggle
   * events are not the user's. Entries expire, so a coalesced event never swallows a later
   * click (D-116).
   */
  const mine = new Map();
  /** The search the groups were last opened / closed for (null: never). */
  let shownQuery = /** @type {string | null} */ (null);

  const search = /** @type {HTMLInputElement} */ (
    h('input', {
      type: 'search',
      class: 'nav-search',
      placeholder: 'Find a setting  /',
      title: 'Type part of a setting’s name (or its tooltip). / jumps here, Esc clears.',
      'aria-label': 'Find a setting',
    })
  );
  const btn = (
    /** @type {string} */ label,
    /** @type {string} */ title,
    /** @type {() => void} */ fn,
  ) => h('button', { type: 'button', class: 'nav-btn', title, onclick: fn }, [label]);
  const accBtn = btn(
    '☰ One open',
    'Accordion: opening a group closes the others (Alt+click a group title does it once)',
    () => {
      accordion = !accordion;
      save(ACCORDION, accordion);
      accBtn.classList.toggle('on', accordion);
      if (accordion) {
        const open = groups().find((d) => d.open);
        if (open) only(open);
      }
    },
  );
  accBtn.classList.toggle('on', accordion);
  const chips = h('div', {
    class: 'nav-chips',
    role: 'navigation',
    'aria-label': 'Jump to a group',
  });
  const bar = h('div', { class: 'side-nav' }, [
    h('div', { class: 'nav-row' }, [
      search,
      btn('⊟', 'Fold all groups', () => setAll(false)),
      btn('⊞', 'Unfold all groups', () => setAll(true)),
      accBtn,
    ]),
    chips,
  ]);
  side.prepend(bar);

  /** All inspector groups in the panel (in order). */
  const groups = () =>
    /** @type {HTMLDetailsElement[]} */ ([...side.querySelectorAll('details.insp-group')]);
  const titleOf = (/** @type {HTMLDetailsElement} */ d) =>
    d.querySelector(':scope > summary')?.textContent?.trim() ?? '';

  /** @param {HTMLDetailsElement} d @param {boolean} open @param {boolean} remember */
  const setOpen = (d, open, remember) => {
    if (remember) folds[titleOf(d)] = open;
    if (d.open === open) return;
    mine.set(d, { open, at: performance.now() });
    d.open = open;
  };
  const persist = () => save(STORE, folds);
  /** @param {boolean} open */
  function setAll(open) {
    for (const d of groups()) setOpen(d, open, true);
    persist();
  }
  /** Open one group, close the rest. @param {HTMLDetailsElement} keep */
  function only(keep) {
    for (const d of groups()) setOpen(d, d === keep, true);
    persist();
  }

  // the user opening / closing a group: remember it (and the accordion rule)
  side.addEventListener(
    'toggle',
    (e) => {
      const d = /** @type {HTMLDetailsElement} */ (e.target);
      if (!d.matches?.('details.insp-group')) return;
      const m = mine.get(d);
      mine.delete(d);
      if ((m && m.open === d.open && performance.now() - m.at < 400) || query) return;
      folds[titleOf(d)] = d.open;
      if (d.open && accordion) only(d);
      else persist();
    },
    true,
  );
  // Alt+click a group title: open just that one
  side.addEventListener('click', (e) => {
    const s = /** @type {HTMLElement} */ (e.target).closest?.('summary');
    const d = /** @type {HTMLDetailsElement | null} */ (s?.parentElement ?? null);
    if (!s || !d?.matches('details.insp-group') || !e.altKey) return;
    e.preventDefault();
    only(d);
  });

  /** New groups: their remembered state (and the current search). */
  function applyState() {
    const fresh = new Set();
    for (const d of groups()) {
      if (d.dataset.navSeen) continue;
      d.dataset.navSeen = '1';
      fresh.add(d);
      const t = titleOf(d);
      if (t in folds) setOpen(d, folds[t], false);
    }
    applySearch(fresh);
    buildChips();
  }

  /**
   * Show the search: matching rows only. Groups are opened / closed only when the search itself
   * changes — never on a plain panel refresh (values update every frame while playing, D-116),
   * so a group you just opened stays open.
   */
  function applySearch(fresh = new Set()) {
    const q = query.trim();
    const changed = q !== shownQuery;
    shownQuery = q;
    side.classList.toggle('nav-searching', !!q);
    for (const d of groups()) {
      const group = titleOf(d);
      let hits = 0;
      for (const row of /** @type {HTMLElement[]} */ ([...d.querySelectorAll('.insp-row')])) {
        const label = row.querySelector('.insp-label')?.textContent ?? '';
        const ok = !q || matchesQuery(q, label, row.dataset.tip ?? '', group);
        row.classList.toggle('nav-hidden', !ok);
        if (ok) hits++;
      }
      d.classList.toggle('nav-hidden', !!q && hits === 0);
      if (!changed && !fresh.has(d)) continue;
      if (q && hits) setOpen(d, true, false);
      else if (!q && group in folds) setOpen(d, folds[group], false);
    }
  }

  function buildChips() {
    const list = groups().filter((d) => !d.classList.contains('nav-hidden'));
    const sig = list.map(titleOf).join('|');
    if (chips.dataset.sig === sig) return;
    chips.dataset.sig = sig;
    chips.replaceChildren(
      ...list.map((d) =>
        h(
          'button',
          {
            type: 'button',
            class: 'nav-chip',
            title: `Open “${titleOf(d)}” and scroll to it`,
            onclick: () => {
              if (accordion) only(d);
              else {
                setOpen(d, true, true);
                persist();
              }
              const top =
                side.scrollTop +
                d.getBoundingClientRect().top -
                side.getBoundingClientRect().top -
                bar.offsetHeight -
                2;
              side.scrollTo({ top, behavior: 'smooth' });
              d.classList.remove('nav-flash');
              void d.offsetWidth; // restart the flash
              d.classList.add('nav-flash');
            },
          },
          [titleOf(d).toLowerCase()],
        ),
      ),
    );
  }

  search.addEventListener('input', () => {
    query = search.value;
    applySearch();
    buildChips();
    if (query) side.scrollTo({ top: 0 });
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      search.value = '';
      query = '';
      applySearch();
      buildChips();
      search.blur();
    }
    e.stopPropagation(); // typing here never triggers editor shortcuts
  });

  // the panel is rebuilt as you select layers: keep up (batched per frame)
  let queued = false;
  /** Only structure changes matter (rows / groups added or removed), not value updates. */
  const structural = (/** @type {MutationRecord[]} */ list) =>
    list.some((r) =>
      [...r.addedNodes, ...r.removedNodes].some(
        (n) =>
          n instanceof HTMLElement &&
          (n.matches('details.insp-group, .insp-row') ||
            !!n.querySelector('details.insp-group, .insp-row')),
      ),
    );
  new MutationObserver((list) => {
    if (queued || !structural(list)) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyState();
    });
  }).observe(side, { childList: true, subtree: true });
  applyState();

  return {
    focusSearch() {
      search.focus();
      search.select();
    },
    refresh: applyState,
  };
}
