import { describe, expect, it } from 'vitest';
import {
  defineSchema,
  generateParamDocs,
  getDefaults,
  normalizeColor,
  parseParams,
  randomizeParams,
  sanitizeParams,
  sanitizeValue,
  serializeParams,
} from '../../src/schema/index.js';
import { demoSchema } from '../../test-pages/inspector-schema.js';

const byId = (id) => demoSchema.find((d) => d.id === id);

describe('sanitizeValue', () => {
  it('float: clamps, snaps to step without float noise, rejects non-numbers', () => {
    const size = byId('demo.size');
    expect(sanitizeValue(size, 5)).toBe(2);
    expect(sanitizeValue(size, 0.30000000000000004)).toBe(0.3);
    expect(sanitizeValue(size, 1.234)).toBe(1.23);
    expect(sanitizeValue(size, Number.NaN)).toBe(1);
    expect(sanitizeValue(size, '1.5')).toBe(1);
  });

  it('int: rounds and clamps', () => {
    const count = byId('demo.count');
    expect(sanitizeValue(count, 3.6)).toBe(4);
    expect(sanitizeValue(count, 99)).toBe(24);
    expect(sanitizeValue(count, -4)).toBe(1);
  });

  it('bool / enum / seed', () => {
    expect(sanitizeValue(byId('demo.outline'), 'true')).toBe(true); // default
    expect(sanitizeValue(byId('demo.outline'), false)).toBe(false);
    expect(sanitizeValue(byId('demo.shape'), 'star')).toBe('star');
    expect(sanitizeValue(byId('demo.shape'), 'hexagon')).toBe('circle');
    expect(sanitizeValue(byId('demo.seed'), -1)).toBe(4294967295);
    expect(sanitizeValue(byId('demo.seed'), 1.5)).toBe(482913);
  });

  it('colour normalization', () => {
    expect(normalizeColor('#FFF')).toBe('#ffffff');
    expect(normalizeColor('#ff000080')).toBe('#ff000080');
    expect(normalizeColor('#ff0000ff')).toBe('#ff0000');
    expect(normalizeColor('#f008')).toBe('#ff000088');
    expect(normalizeColor('red')).toBeNull();
    expect(sanitizeValue(byId('demo.color'), 'nope')).toBe('#ff8a3d');
  });

  it('ramp: sorts stops, clamps positions, drops bad stops, falls back when too short', () => {
    const ramp = byId('demo.ramp');
    expect(
      sanitizeValue(ramp, [
        { pos: 1.5, color: '#000' },
        { pos: 'x', color: '#fff' },
        { pos: -1, color: '#FFF' },
      ]),
    ).toEqual([
      { pos: 0, color: '#ffffff' },
      { pos: 1, color: '#000000' },
    ]);
    expect(sanitizeValue(ramp, [{ pos: 0, color: '#fff' }])).toEqual(ramp.default);
  });

  it('curve: sorts, clamps y, pins ends to x = 0 and x = 1', () => {
    const curve = byId('demo.scaleOverLife');
    expect(
      sanitizeValue(curve, [
        { x: 0.9, y: 2 },
        { x: 0.1, y: -1 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]);
  });
});

describe('sanitizeParams', () => {
  it('fills missing values, fixes bad ones, drops unknown keys, and reports all of it', () => {
    const { values, warnings } = sanitizeParams(demoSchema, {
      'demo.size': 9,
      'demo.bogus': 1,
    });
    expect(values['demo.size']).toBe(2);
    expect(values['demo.count']).toBe(8);
    expect('demo.bogus' in values).toBe(false);
    expect(warnings.some((w) => w.startsWith('demo.size'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('demo.bogus'))).toBe(true);
  });

  it('valid input produces no warnings', () => {
    expect(sanitizeParams(demoSchema, getDefaults(demoSchema)).warnings).toEqual([]);
  });

  it('every default is already valid (default within range, sanitize is a no-op)', () => {
    for (const def of demoSchema) expect(sanitizeValue(def, def.default)).toEqual(def.default);
  });
});

describe('serialize / parse', () => {
  it('save → load → save is identical', () => {
    const values = randomizeParams(demoSchema, getDefaults(demoSchema), 77);
    const first = JSON.stringify(serializeParams(demoSchema, values));
    const { values: loaded, warnings } = parseParams(demoSchema, first);
    expect(warnings).toEqual([]);
    expect(JSON.stringify(serializeParams(demoSchema, loaded))).toBe(first);
  });

  it('keeps schema key order', () => {
    const out = serializeParams(demoSchema, getDefaults(demoSchema));
    expect(Object.keys(out)).toEqual(demoSchema.map((d) => d.id));
  });

  it('survives garbage input', () => {
    expect(parseParams(demoSchema, '{not json').warnings[0]).toMatch(/Could not read JSON/);
    expect(parseParams(demoSchema, '[1,2]').warnings[0]).toMatch(/Expected a JSON object/);
    expect(parseParams(demoSchema, 'null').values['demo.count']).toBe(8);
  });
});

describe('randomizeParams', () => {
  const defaults = getDefaults(demoSchema);

  it('is deterministic per variant seed and differs between seeds', () => {
    expect(randomizeParams(demoSchema, defaults, 5)).toEqual(
      randomizeParams(demoSchema, defaults, 5),
    );
    expect(randomizeParams(demoSchema, defaults, 5)).not.toEqual(
      randomizeParams(demoSchema, defaults, 6),
    );
  });

  it('stays inside every randomize range, and the result is valid', () => {
    for (let seed = 0; seed < 300; seed++) {
      const v = randomizeParams(demoSchema, defaults, seed);
      expect(v['demo.size']).toBeGreaterThanOrEqual(0.8);
      expect(v['demo.size']).toBeLessThanOrEqual(1.3);
      expect(v['demo.count']).toBeGreaterThanOrEqual(5);
      expect(v['demo.count']).toBeLessThanOrEqual(14);
      expect(sanitizeParams(demoSchema, v).warnings).toEqual([]);
    }
  });

  it('leaves non-randomizable and locked parameters alone', () => {
    const v = randomizeParams(demoSchema, defaults, 3, { locked: ['demo.size'] });
    expect(v['demo.size']).toBe(defaults['demo.size']);
    expect(v['demo.color']).toBe(defaults['demo.color']);
    expect(v['demo.ramp']).toEqual(defaults['demo.ramp']);
  });

  it('adding a parameter does not change the others (per-parameter sub-seeds)', () => {
    const extended = defineSchema([
      ...demoSchema,
      {
        id: 'demo.extra',
        label: 'Extra',
        type: 'float',
        min: 0,
        max: 1,
        default: 0.5,
        randomize: { min: 0, max: 1 },
      },
    ]);
    const before = randomizeParams(demoSchema, defaults, 11);
    const after = randomizeParams(extended, { ...defaults, 'demo.extra': 0.5 }, 11);
    for (const def of demoSchema) expect(after[def.id]).toEqual(before[def.id]);
  });

  it('does not modify its input', () => {
    const copy = structuredClone(defaults);
    randomizeParams(demoSchema, defaults, 1);
    expect(defaults).toEqual(copy);
  });
});

describe('generateParamDocs', () => {
  it('produces a grouped Markdown table for every parameter', () => {
    const md = generateParamDocs(demoSchema, 'Demo');
    expect(md).toMatch(/^# Demo/);
    for (const group of ['## Shape', '## Style', '## Motion', '## Variation']) {
      expect(md).toContain(group);
    }
    for (const def of demoSchema) expect(md).toContain(`\`${def.id}\``);
    expect(md).toContain('0.8–1.3');
  });
});
