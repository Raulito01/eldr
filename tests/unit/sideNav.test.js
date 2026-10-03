// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createSideNav, matchesQuery } from '../../src/ui/editor/sideNav.js';

describe('find a setting (D-112)', () => {
  it('matches label, tooltip or group; every word must match; case-insensitive', () => {
    expect(matchesQuery('speed', 'Evolution speed', '', 'Fractal noise')).toBe(true);
    expect(
      matchesQuery('drops', 'End burst', 'Drops the last blob bursts into', 'Liquid ribbon'),
    ).toBe(true);
    expect(matchesQuery('ribbon thick', 'Thickness', '', 'Liquid ribbon')).toBe(true);
    expect(matchesQuery('ribbon glow', 'Thickness', '', 'Liquid ribbon')).toBe(false);
    expect(matchesQuery('  ', 'Anything', '', 'G')).toBe(true);
    expect(matchesQuery('SPIN', 'Spin', '', '')).toBe(true);
  });
});

describe('panel refreshes never undo your folds (D-116)', () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 20)));
  it('a group you open stays open while the panel updates (playback), One open on', async () => {
    localStorage.clear();
    localStorage.setItem('eldr.panel.accordion', 'true');
    const side = document.createElement('aside');
    for (const name of ['Colour', 'Glow', 'Transform']) {
      const d = document.createElement('details');
      d.className = 'insp-group';
      d.innerHTML = `<summary>${name}</summary><div class="insp-row"><span class="insp-label">${name} a</span><b>1</b></div>`;
      side.append(d);
    }
    document.body.append(side);
    const nav = createSideNav(side);
    const [colour, glow] = /** @type {HTMLDetailsElement[]} */ ([
      ...side.querySelectorAll('details'),
    ]);
    colour.open = true;
    colour.dispatchEvent(new Event('toggle'));
    await frame();
    // the user opens Glow, and the panel refreshes (every playback frame) before the browser
    // delivers Glow's toggle event
    glow.open = true;
    for (const b of side.querySelectorAll('b')) b.textContent = String(Math.random());
    nav.refresh();
    await frame();
    expect(glow.open).toBe(true);
    expect(colour.open).toBe(false);
  });
});
