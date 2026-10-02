import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import {
  applyValuesMany,
  isAnimatedParam,
  keyHere,
  mixedParams,
  toggleKeyMany,
  toggleStopwatchMany,
} from '../../src/effects/animEdit.js';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { cleanSelection, clickSelect } from '../../src/ui/editor/selection.js';

const order = ['a', 'b', 'c', 'd'];

describe('layer selection (3.7b)', () => {
  it('click / ⌘-click / ⇧-click like After Effects', () => {
    let s = clickSelect({ active: '', ids: [] }, 'b', {}, order);
    expect(s).toEqual({ active: 'b', ids: ['b'] });
    s = clickSelect(s, 'd', { meta: true }, order);
    expect(s).toEqual({ active: 'd', ids: ['b', 'd'] });
    s = clickSelect(s, 'b', { meta: true }, order);
    expect(s).toEqual({ active: 'd', ids: ['d'] });
    s = clickSelect(s, 'a', { shift: true }, order);
    expect(s).toEqual({ active: 'a', ids: ['a', 'b', 'c', 'd'] });
    expect(cleanSelection({ active: 'x', ids: ['a', 'x'] }, ['a', 'b'])).toEqual({
      active: 'a',
      ids: ['a'],
    });
  });
});

describe('multi-layer editing (3.7b)', () => {
  const L = (s, id) => s.layers.find((l) => l.id === id);

  it('a value goes to every selected layer that has it', () => {
    const s = applyValuesMany(
      createExplosion(),
      ['core', 'smoke'],
      { 'transform.x': 40, 'glow.radius': 7, 'field.swirl': 0.9 },
      0,
    );
    expect(L(s, 'core').transform.x).toBe(40);
    expect(L(s, 'smoke').transform.x).toBe(40);
    expect(L(s, 'smoke').params['glow.radius']).toBe(7);
    expect(L(s, 'core').params['field.swirl']).toBe(0.9);
    expect('field.swirl' in L(s, 'smoke').params).toBe(false);
  });

  it('stopwatch and ◆ follow the active layer for the whole selection', () => {
    let s = toggleStopwatchMany(createExplosion(), 'core', ['core', 'smoke'], 'transform.y', 0);
    expect(
      isAnimatedParam(L(s, 'core'), 'transform.y') && isAnimatedParam(L(s, 'smoke'), 'transform.y'),
    ).toBe(true);
    s = toggleKeyMany(s, 'core', ['core', 'smoke'], 'transform.y', 0.5);
    expect(keyHere(L(s, 'smoke'), 'transform.y', 0.5)).toBe(true);
    s = toggleStopwatchMany(s, 'core', ['core', 'smoke'], 'transform.y', 0);
    expect(isAnimatedParam(L(s, 'smoke'), 'transform.y')).toBe(false);
  });

  it('mixed values are reported per param', () => {
    let s = applyValuesMany(createExplosion(), ['core'], { 'transform.x': 5 }, 0);
    s = {
      ...s,
      layers: s.layers.map((l) =>
        l.id === 'smoke' ? { ...l, keys: { 'transform.y': setKey([], 0, 0) } } : l,
      ),
    };
    const m = mixedParams(
      s.layers,
      ['core', 'smoke'],
      ['transform.x', 'transform.y', 'transform.rotation'],
      0,
    );
    expect([...m]).toEqual(['transform.x']);
  });
});
