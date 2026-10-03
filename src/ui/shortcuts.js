// @ts-check
/**
 * Keyboard shortcuts (3.7d, D-060): one list drives the key handling AND the cheat sheet, so
 * every shortcut is also a button (pen-friendly, D-028).
 *
 * A combo is a string like 'mod+shift+KeyK' — modifiers (mod = ⌘ on Mac / Ctrl elsewhere,
 * shift, alt) and one key. A key written as a KeyboardEvent.code ('KeyK', 'F9', 'BracketLeft',
 * 'PageUp'…) matches the physical key; anything else ('?', '=', '-', ';') matches the typed
 * character, ignoring ⇧ (so '?' works on any layout).
 */

const CODE_RE =
  /^(Key[A-Z]|Digit\d|F\d{1,2}|Arrow\w+|Page(Up|Down)|Home|End|Bracket(Left|Right)|Space|Backspace|Delete|Escape|Enter|Tab)$/;

/**
 * @typedef {{ mod: boolean, shift: boolean, alt: boolean, code?: string, key?: string }} Combo
 */

/** @param {string} str @returns {Combo} */
export function parseCombo(str) {
  const parts = str.split('+');
  // a trailing '+' key: 'mod++' → ['mod', '', ''] ; handle literal '+'
  const last = str.endsWith('++') || str === '+' ? '+' : /** @type {string} */ (parts.pop());
  const mods = new Set(str.endsWith('++') ? parts.slice(0, -2) : parts);
  /** @type {Combo} */
  const c = { mod: mods.has('mod'), shift: mods.has('shift'), alt: mods.has('alt') };
  if (CODE_RE.test(last)) c.code = last;
  else c.key = last;
  return c;
}

/**
 * Does the event match the combo?
 * @param {{ metaKey: boolean, ctrlKey: boolean, shiftKey: boolean, altKey: boolean, code: string, key: string }} e
 * @param {Combo} c
 */
export function matchCombo(e, c) {
  if ((e.metaKey || e.ctrlKey) !== c.mod || e.altKey !== c.alt) return false;
  if (c.code) return e.code === c.code && e.shiftKey === c.shift;
  return e.key === c.key; // typed character: ⇧ is part of typing it
}

const NAMES = /** @type {Record<string, string>} */ ({
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  BracketLeft: '[',
  BracketRight: ']',
  Space: 'Space',
  Backspace: '⌫',
  Delete: 'Del',
  Escape: 'Esc',
});

/** Display text for a combo. @param {string} str @param {boolean} mac */
export function formatCombo(str, mac) {
  const c = parseCombo(str);
  const key = c.code ? (NAMES[c.code] ?? c.code.replace(/^(Key|Digit)/, '')) : (c.key ?? '');
  const m = mac
    ? [c.mod ? '⌘' : '', c.alt ? '⌥' : '', c.shift ? '⇧' : '']
    : [c.mod ? 'Ctrl+' : '', c.alt ? 'Alt+' : '', c.shift ? 'Shift+' : ''];
  return m.join('') + key;
}

/**
 * @typedef {object} Shortcut
 * @property {string} id
 * @property {string} group   cheat-sheet section
 * @property {string} label   what it does
 * @property {string[]} keys  combos (alternatives)
 * @property {(e?: KeyboardEvent) => boolean | void} run  return false = not handled (let the
 *   key through, e.g. ⌘C with nothing to copy)
 * @property {boolean} [whileTyping]  also fires when a text field has focus
 */

/** Input types you type into (shortcuts stay out of the way there). */
const TEXT_INPUTS = new Set(['text', 'search', 'number', 'email', 'url', 'password', 'tel', '']);
/**
 * Is the user typing into this element? Only text fields and editable text count (D-113):
 * a focused menu, button, checkbox or slider must not swallow the editor's shortcuts.
 * @param {HTMLElement | null} t
 */
export function isTyping(t) {
  if (!t) return false;
  if (t.closest?.('textarea, [contenteditable="true"]')) return true;
  const input = /** @type {HTMLInputElement | null} */ (t.closest?.('input') ?? null);
  return !!input && TEXT_INPUTS.has(input.type);
}
/** A clickable control that keeps focus after use (menu, button, checkbox, slider). @param {HTMLElement} t */
const isControl = (t) =>
  !!t.closest?.('select, button, input, [role="slider"], summary, [tabindex]');

/**
 * @param {Shortcut[]} list
 * @returns {{ list: Shortcut[], handle: (e: KeyboardEvent) => boolean, find: (e: KeyboardEvent) => Shortcut | undefined }}
 */
export function createShortcuts(list) {
  const parsed = list.map((s) => ({ s, combos: s.keys.map(parseCombo) }));
  const find = (/** @type {KeyboardEvent} */ e) =>
    parsed.find(({ combos }) => combos.some((c) => matchCombo(e, c)))?.s;
  return {
    list,
    find,
    handle(e) {
      const target = /** @type {HTMLElement | null} */ (e.target);
      const typing = isTyping(target);
      const s = find(e);
      if (!s || (typing && !s.whileTyping)) return false;
      if (s.run(e) === false) return false;
      e.preventDefault();
      // D-113: a menu or button that still had focus must not also react (Space would open the
      // preset menu or press the button again): let go of it
      if (!typing && target && target !== document.body && isControl(target)) target.blur();
      return true;
    },
  };
}
