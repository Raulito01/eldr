import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CURVE_EDITOR_HEIGHT } from '../../src/ui/widgets/curveEditor.js';

const css = readFileSync(new URL('../../src/ui/inspector.css', import.meta.url), 'utf8');

describe('widget layout (regression: curve points drawn outside a squeezed box)', () => {
  it('the curve editor CSS height matches its drawing height', () => {
    const rule = css.match(/\.w-curve-edit\s*\{[^}]*\}/)?.[0] ?? '';
    expect(rule).toContain(`height: ${CURVE_EDITOR_HEIGHT}px`);
  });

  it('no other rule forces a different height on curve editors', () => {
    expect(css).not.toMatch(/\.w-curve\s*\{[^}]*height/);
  });
});

describe('inspector stays inside its panel (regression: controls past the right edge)', () => {
  it('the control column can shrink (minmax(0, 1fr)), never forcing overflow', () => {
    const row = css.match(/\.insp-row\s*\{[^}]*\}/)?.[0] ?? '';
    expect(row).toContain('minmax(0, 1fr)');
  });

  it('pages do not assume a fixed top-bar height', () => {
    const shell = readFileSync(new URL('../../src/ui/shell.css', import.meta.url), 'utf8');
    expect(shell).not.toContain('calc(100% - 42px)');
  });
});
