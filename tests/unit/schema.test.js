import { describe, expect, it } from 'vitest';
import { defineSchema, getDefaults, PARAM_TYPES } from '../../src/schema/index.js';
import { demoSchema } from '../../test-pages/inspector-schema.js';

const float = (over = {}) => ({
  id: 'x.size',
  label: 'Size',
  type: 'float',
  min: 0,
  max: 2,
  default: 1,
  ...over,
});

describe('defineSchema', () => {
  it('accepts a valid schema and fills in defaults (group, step, enum labels, curve y-range)', () => {
    const schema = defineSchema([
      float(),
      { id: 'x.count', label: 'Count', type: 'int', min: 1, max: 9, default: 3 },
      { id: 'x.mode', label: 'Mode', type: 'enum', options: ['a', 'b'], default: 'a' },
      {
        id: 'x.c',
        label: 'C',
        type: 'curve',
        default: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
    ]);
    expect(schema[0].group).toBe('General');
    expect(schema[0].step).toBeCloseTo(0.02);
    expect(schema[1].step).toBe(1);
    expect(schema[2].options).toEqual([
      { value: 'a', label: 'a' },
      { value: 'b', label: 'b' },
    ]);
    expect(schema[3].yMin).toBe(0);
    expect(schema[3].yMax).toBe(1);
    expect(Object.isFrozen(schema)).toBe(true);
    expect(Object.isFrozen(schema[0])).toBe(true);
  });

  it.each([
    ['bad id', float({ id: '1bad' })],
    ['unknown type', float({ type: 'vector' })],
    ['min >= max', float({ min: 2, max: 2 })],
    ['default outside range', float({ default: 5 })],
    ['randomize outside range', float({ randomize: { min: 0.5, max: 3 } })],
    ['randomize min > max', float({ randomize: { min: 1.5, max: 1 } })],
    ['non-integer int', { id: 'x.n', label: 'N', type: 'int', min: 0, max: 5, default: 1.5 }],
    ['bool default', { id: 'x.b', label: 'B', type: 'bool', default: 'yes' }],
    ['enum default', { id: 'x.e', label: 'E', type: 'enum', options: ['a'], default: 'z' }],
    ['color default', { id: 'x.c', label: 'C', type: 'color', default: 'orange' }],
    ['short ramp', { id: 'x.r', label: 'R', type: 'ramp', default: [{ pos: 0, color: '#fff' }] }],
    ['seed default', { id: 'x.s', label: 'S', type: 'seed', default: -1 }],
    [
      'randomize on color',
      { id: 'x.c', label: 'C', type: 'color', default: '#fff', randomize: true },
    ],
  ])('rejects %s', (_name, def) => {
    expect(() => defineSchema([def])).toThrow(/Invalid parameter schema/);
  });

  it('rejects duplicate ids and lists every problem at once', () => {
    let message = '';
    try {
      defineSchema([float(), float(), float({ id: 'x.other', default: 9 })]);
    } catch (err) {
      message = err.message;
    }
    expect(message).toMatch(/duplicate id/);
    expect(message).toMatch(/outside/);
  });

  it('getDefaults returns independent deep copies', () => {
    const a = getDefaults(demoSchema);
    const b = getDefaults(demoSchema);
    a['demo.ramp'][0].color = '#000000';
    expect(b['demo.ramp'][0].color).toBe('#ffffff');
  });
});

describe('demo schema (inspector test page)', () => {
  it('is valid and covers every parameter type', () => {
    const types = new Set(demoSchema.map((d) => d.type));
    for (const t of PARAM_TYPES) expect(types.has(t)).toBe(true);
  });
});
