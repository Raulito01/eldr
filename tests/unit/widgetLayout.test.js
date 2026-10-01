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
