import { describe, expect, it } from 'vitest';
import {
  RAMP_GROUPS,
  RAMP_PRESETS,
  rampsInGroup,
  reverseRamp,
} from '../../src/render/rampPresets.js';
import { sanitizeValue } from '../../src/schema/validators.js';

const def = { type: 'ramp', default: [] };

describe('colour ramp library (3.8)', () => {
  it('every preset is a valid ramp in a known family; the old ids still exist', () => {
    for (const [key, p] of Object.entries(RAMP_PRESETS)) {
      expect(RAMP_GROUPS, key).toContain(p.group);
      expect(
        sanitizeValue(
          def,
          p.stops.map((s) => ({ ...s })),
        ),
        key,
      ).toEqual(p.stops);
      expect(p.stops[0].pos).toBe(0);
      expect(p.stops.at(-1).pos).toBe(1);
    }
    for (const id of ['fire', 'smoke', 'sparks', 'debris']) expect(RAMP_PRESETS[id]).toBeDefined();
    for (const g of RAMP_GROUPS) expect(rampsInGroup(g).length, g).toBeGreaterThanOrEqual(2);
    expect(Object.keys(RAMP_PRESETS).length).toBeGreaterThanOrEqual(45);
  });

  it('reverse flips the ramp', () => {
    const r = reverseRamp(RAMP_PRESETS.sparks.stops);
    expect(r.map((s) => s.color)).toEqual(['#c7281e', '#ff8a2a', '#ffe066', '#ffffff']);
    expect(r.map((s) => s.pos)).toEqual([0, 0.3, 0.65, 1]);
  });
});
