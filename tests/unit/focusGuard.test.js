// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { installFocusGuard } from '../../src/ui/focusGuard.js';
import { createShortcuts, isTyping } from '../../src/ui/shortcuts.js';

describe('keyboard is never trapped by a menu or button (D-113)', () => {
  it('only text fields count as typing', () => {
    const mk = (html) => {
      const d = document.createElement('div');
      d.innerHTML = html;
      return d.firstElementChild;
    };
    expect(isTyping(mk('<select><option>a</option></select>'))).toBe(false);
    expect(isTyping(mk('<button>b</button>'))).toBe(false);
    expect(isTyping(mk('<input type="checkbox">'))).toBe(false);
    expect(isTyping(mk('<input type="text">'))).toBe(true);
    expect(isTyping(mk('<input type="number">'))).toBe(true);
    expect(isTyping(mk('<input type="search">'))).toBe(true);
    expect(isTyping(mk('<textarea></textarea>'))).toBe(true);
  });

  it('Space plays even when the preset menu still has focus, and the menu lets go', () => {
    let played = 0;
    const sc = createShortcuts([
      { id: 'play', group: 'T', label: 'Play', keys: ['Space'], run: () => played++ },
    ]);
    const sel = document.createElement('select');
    sel.innerHTML = '<option>a</option>';
    document.body.append(sel);
    sel.focus();
    const e = new KeyboardEvent('keydown', {
      key: ' ',
      code: 'Space',
      bubbles: true,
      cancelable: true,
    });
    sel.addEventListener('keydown', (k) => sc.handle(k));
    sel.dispatchEvent(e);
    expect(played).toBe(1);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).not.toBe(sel);
  });

  it('a menu choice gives the keyboard back to the editor', async () => {
    installFocusGuard(document);
    const sel = document.createElement('select');
    sel.innerHTML = '<option>a</option><option>b</option>';
    document.body.append(sel);
    sel.focus();
    sel.value = 'b';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 5));
    expect(document.activeElement).not.toBe(sel);
  });
});
