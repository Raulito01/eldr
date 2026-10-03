import { describe, expect, it } from 'vitest';
import { matchesQuery } from '../../src/ui/editor/sideNav.js';

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
