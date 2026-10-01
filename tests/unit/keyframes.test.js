import { describe, expect, it } from 'vitest';
import {
  blend,
  hasKeyAt,
  moveKey,
  removeKey,
  resolveParams,
  setKey,
  setKeyEase,
  valueAt,
} from '../../src/core/keyframes.js';

const F = { id: 'f', type: 'float' };

describe('keyframe interpolation', () => {
  const keys = (ease) => [
    { t: 0, v: 0, ease },
    { t: 1, v: 100, ease },
  ];

  it('linear, ease (slow in/out, same ends), hold; clamped outside the keys', () => {
    expect(valueAt(F, keys('linear'), 0.25)).toBeCloseTo(25, 9);
    const e = valueAt(F, keys('ease'), 0.25);
    expect(e).toBeLessThan(25);
    expect(valueAt(F, keys('ease'), 0.5)).toBeCloseTo(50, 6);
    expect(valueAt(F, keys('hold'), 0.99)).toBe(0);
    expect(valueAt(F, keys('linear'), -3)).toBe(0);
    expect(valueAt(F, keys('linear'), 7)).toBe(100);
  });

  it('three keys: each segment uses its left key', () => {
    const k = [
      { t: 0, v: 0, ease: 'linear' },
      { t: 1, v: 10, ease: 'hold' },
      { t: 2, v: 50, ease: 'linear' },
    ];
    expect(valueAt(F, k, 0.5)).toBeCloseTo(5, 9);
    expect(valueAt(F, k, 1.7)).toBe(10);
    expect(valueAt(F, k, 2)).toBe(50);
  });

  it('blends ints, colours, ramps and curves; holds bool / enum and mismatched point counts', () => {
    expect(blend({ type: 'int' }, 0, 3, 0.5)).toBe(2);
    expect(blend({ type: 'color' }, '#000000', '#ffffff', 0.5)).toMatch(/^#80/);
    const r = blend(
      { type: 'ramp' },
      [
        { pos: 0, color: '#000000' },
        { pos: 1, color: '#ff0000' },
      ],
      [
        { pos: 0, color: '#ffffff' },
        { pos: 0.5, color: '#ff0000' },
      ],
      0.5,
    );
    expect(r[1].pos).toBeCloseTo(0.75, 9);
    expect(blend({ type: 'curve' }, [{ x: 0, y: 0 }], [{ x: 0, y: 1 }], 0.25)[0].y).toBe(0.25);
    expect(blend({ type: 'curve' }, [{ x: 0, y: 0 }], [], 0.5)).toBeNull();
    expect(blend({ type: 'bool' }, false, true, 0.5)).toBeNull();
    const en = [
      { t: 0, v: 'a', ease: 'linear' },
      { t: 1, v: 'b', ease: 'linear' },
    ];
    expect(valueAt({ type: 'enum' }, en, 0.99)).toBe('a');
    expect(valueAt({ type: 'enum' }, en, 1)).toBe('b');
  });

  it('resolveParams only touches animated params and never mutates the input', () => {
    const params = { f: 1, g: 2 };
    const out = resolveParams([F, { id: 'g', type: 'float' }], params, { f: keys('linear') }, 0.5);
    expect(out).toEqual({ f: 50, g: 2 });
    expect(params.f).toBe(1);
    expect(resolveParams([F], params, undefined, 0)).toBe(params);
  });
});

describe('key editing', () => {
  it('set (replace at the same time, sorted), remove, move, ease, has', () => {
    let k = setKey(undefined, 1, 10);
    k = setKey(k, 0, 0, 'linear');
    k = setKey(k, 1, 20);
    expect(k.map((x) => [x.t, x.v, x.ease])).toEqual([
      [0, 0, 'linear'],
      [1, 20, 'ease'],
    ]);
    expect(hasKeyAt(k, 1.00001)).toBe(true);
    k = moveKey(k, 1, 0.5);
    expect(k.map((x) => x.t)).toEqual([0, 0.5]);
    k = setKeyEase(k, 0, 'hold');
    expect(k[0].ease).toBe('hold');
    expect(removeKey(k, 0).length).toBe(1);
    const ramp = [{ pos: 0, color: '#fff' }];
    const kr = setKey([], 0, ramp);
    ramp[0].pos = 9;
    expect(kr[0].v[0].pos).toBe(0); // stored as a copy
  });
});
