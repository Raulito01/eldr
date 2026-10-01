import { describe, expect, it } from 'vitest';
import {
  applyValues,
  isAnimatedParam,
  keyHere,
  toggleKey,
  toggleStopwatch,
  valueNow,
} from '../../src/effects/animEdit.js';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { updateLayer } from '../../src/effects/layerStack.js';

const core = (s) => s.layers.find((l) => l.id === 'core');

describe('editing animated values (After Effects rules)', () => {
  it('stopwatch on → one key with the current value; edits then set keys; values interpolate', () => {
    let s = createExplosion();
    s = toggleStopwatch(s, 'core', 'glow.radius', 0);
    expect(core(s).keys['glow.radius']).toEqual([
      { t: 0, v: core(s).params['glow.radius'], ease: 'ease' },
    ]);
    s = applyValues(s, 'core', { 'glow.radius': 10 }, 0);
    s = applyValues(s, 'core', { 'glow.radius': 50 }, 1);
    expect(core(s).keys['glow.radius'].map((k) => [k.t, k.v])).toEqual([
      [0, 10],
      [1, 50],
    ]);
    expect(valueNow(core(s), 'glow.radius', 0.5)).toBeCloseTo(30, 6);
  });

  it('works for transform and opacity (percent) too; fixed values change directly', () => {
    let s = createExplosion();
    s = applyValues(s, 'core', { 'transform.x': 12, 'layer.opacity': 50 }, 0.3);
    expect(core(s).transform.x).toBe(12);
    expect(core(s).opacity).toBe(0.5);
    s = toggleStopwatch(s, 'core', 'layer.opacity', 0);
    s = applyValues(s, 'core', { 'layer.opacity': 0 }, 1);
    expect(valueNow(core(s), 'layer.opacity', 0.5)).toBeCloseTo(25, 6);
  });

  it('stopwatch off keeps the value at the current time and drops the keys', () => {
    let s = toggleStopwatch(createExplosion(), 'core', 'transform.rotation', 0);
    s = applyValues(s, 'core', { 'transform.rotation': 90 }, 1);
    s = toggleStopwatch(s, 'core', 'transform.rotation', 1);
    expect(isAnimatedParam(core(s), 'transform.rotation')).toBe(false);
    expect(core(s).transform.rotation).toBe(90);
  });

  it('◆ adds / removes a key here; removing the last key turns the stopwatch off', () => {
    let s = toggleStopwatch(createExplosion(), 'core', 'transform.y', 0);
    s = toggleKey(s, 'core', 'transform.y', 0.5);
    expect(keyHere(core(s), 'transform.y', 0.5)).toBe(true);
    s = toggleKey(s, 'core', 'transform.y', 0.5);
    expect(keyHere(core(s), 'transform.y', 0.5)).toBe(false);
    s = toggleKey(s, 'core', 'transform.y', 0);
    expect(isAnimatedParam(core(s), 'transform.y')).toBe(false);
  });

  it('keys are placed in layer time (slid layers)', () => {
    let s = updateLayer(createExplosion(), 'core', {
      time: { offset: 1, stretch: 2, in: 0, out: null },
    });
    s = toggleStopwatch(s, 'core', 'transform.x', 2);
    expect(core(s).keys['transform.x'][0].t).toBe(0.5);
    expect(keyHere(core(s), 'transform.x', 2)).toBe(true);
  });
});
