import { describe, expect, it } from 'vitest';
import { createShortcuts, formatCombo, matchCombo, parseCombo } from '../../src/ui/shortcuts.js';

const ev = (o) => ({
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  code: '',
  key: '',
  ...o,
});

describe('shortcut list (3.7d)', () => {
  it('codes match physical keys with exact modifiers; characters ignore ⇧', () => {
    const k = parseCombo('mod+shift+KeyK');
    expect(matchCombo(ev({ metaKey: true, shiftKey: true, code: 'KeyK', key: 'K' }), k)).toBe(true);
    expect(matchCombo(ev({ ctrlKey: true, shiftKey: true, code: 'KeyK' }), k)).toBe(true);
    expect(matchCombo(ev({ metaKey: true, code: 'KeyK' }), k)).toBe(false);
    expect(matchCombo(ev({ shiftKey: true, key: '?', code: 'Minus' }), parseCombo('?'))).toBe(true);
    expect(
      matchCombo(ev({ altKey: true, code: 'BracketLeft' }), parseCombo('alt+BracketLeft')),
    ).toBe(true);
    expect(matchCombo(ev({ code: 'BracketLeft' }), parseCombo('alt+BracketLeft'))).toBe(false);
    expect(parseCombo('+')).toEqual({ mod: false, shift: false, alt: false, key: '+' });
  });

  it('formats for Mac and others', () => {
    expect(formatCombo('mod+shift+KeyK', true)).toBe('⌘⇧K');
    expect(formatCombo('alt+BracketRight', false)).toBe('Alt+]');
    expect(formatCombo('shift+PageDown', true)).toBe('⇧PgDn');
  });

  it('handles keys, skips text fields, lets "not handled" through', () => {
    const log = [];
    const s = createShortcuts([
      { id: 'a', group: 'g', label: 'A', keys: ['KeyA'], run: () => log.push('a') },
      { id: 'c', group: 'g', label: 'copy', keys: ['mod+KeyC'], run: () => false },
    ]);
    let prevented = 0;
    const e = (o, target = null) => ({ ...ev(o), target, preventDefault: () => prevented++ });
    expect(s.handle(e({ code: 'KeyA' }))).toBe(true);
    expect(s.handle(e({ code: 'KeyA' }, { closest: () => ({}) }))).toBe(false);
    expect(s.handle(e({ metaKey: true, code: 'KeyC' }))).toBe(false);
    expect(log).toEqual(['a']);
    expect(prevented).toBe(1);
  });
});
