import { describe, expect, it } from 'vitest';
import { cubicBezier } from '../../src/core/easing.js';
import { EASY_EASE, segmentBezier, setKey, valueAt } from '../../src/core/keyframes.js';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { copyKeys, pasteKeys } from '../../src/effects/keyEdit.js';
import {
  applyInterp,
  dragHandle,
  handlePoints,
  isContinuous,
  keySides,
  keyVelocity,
  materialize,
  offsetKeyValues,
  setVelocity,
} from '../../src/effects/keyInterp.js';
import { updateLayer } from '../../src/effects/layerStack.js';

const F = { id: 'f', type: 'float' };
const L = (s, id) => s.layers.find((l) => l.id === id);
const two = (ease = 'linear') => [
  { t: 0, v: 0, ease },
  { t: 1, v: 100, ease },
];

describe('After Effects interpolation (3.7c)', () => {
  it('older "ease" keys keep exactly the 0.0.30 curve; linear stays a straight line', () => {
    const old = cubicBezier(0.33, 0, 0.67, 1);
    for (const t of [0.1, 0.25, 0.5, 0.8]) {
      expect(valueAt(F, two('ease'), t)).toBeCloseTo(old(t) * 100, 4);
      expect(valueAt(F, two('linear'), t)).toBeCloseTo(t * 100, 6);
    }
  });

  it('speed and influence: an outgoing speed makes the value overshoot; min / max still clamp', () => {
    const keys = [
      { t: 0, v: 0, ease: 'bezier', out: { speed: 600, influence: 60 } },
      { t: 1, v: 100, ease: 'linear', in: { type: 'bezier', speed: 0, influence: 33.33 } },
    ];
    const peak = Math.max(...[0.3, 0.4, 0.5, 0.6, 0.7].map((t) => valueAt(F, keys, t)));
    expect(peak).toBeGreaterThan(100);
    expect(valueAt({ ...F, min: 0, max: 100 }, keys, 0.6)).toBeLessThanOrEqual(100);
    expect(valueAt(F, keys, 1)).toBe(100);
  });

  it('materialize keeps the curve and makes every handle explicit', () => {
    const keys = [
      { t: 0, v: 0, ease: 'ease' },
      { t: 0.5, v: 40, ease: 'linear' },
      { t: 1, v: 100, ease: 'ease' },
    ];
    const m = materialize(keys);
    expect(m[0].ease).toBe('bezier');
    expect(m[1].in.type).toBe('bezier');
    expect(m[2].in.type).toBe('linear');
    for (const t of [0.1, 0.3, 0.6, 0.9])
      expect(valueAt(F, m, t)).toBeCloseTo(valueAt(F, keys, t), 9);
  });

  it('F9 / ⇧F9 / ⌘⇧F9 / linear / hold on selected keys', () => {
    let s = updateLayer(createExplosion(), 'core', {
      keys: { 'transform.x': [0, 0.5, 1].reduce((k, t, i) => setKey(k, t, i * 50, 'linear'), []) },
    });
    const ref = { layerId: 'core', paramId: 'transform.x', t: 0.5 };
    s = applyInterp(s, [ref], 'easy');
    let k = L(s, 'core').keys['transform.x'];
    expect(k[1]).toMatchObject({
      ease: 'bezier',
      out: EASY_EASE,
      in: { type: 'bezier', speed: 0 },
    });
    expect(keySides(k, 1)).toEqual({ in: 'bezier', out: 'bezier' });
    expect(keySides(k, 0)).toEqual({ in: 'linear', out: 'linear' });
    s = applyInterp(s, [ref], 'linear');
    k = L(s, 'core').keys['transform.x'];
    expect(valueAt(F, k, 0.75)).toBeCloseTo(75, 6);
    s = applyInterp(s, [ref], 'easeIn');
    k = L(s, 'core').keys['transform.x'];
    expect(keySides(k, 1)).toEqual({ in: 'bezier', out: 'linear' });
    s = applyInterp(s, [ref], 'toggleHold');
    expect(L(s, 'core').keys['transform.x'][1].ease).toBe('hold');
    s = applyInterp(s, [ref], 'toggleHold');
    expect(L(s, 'core').keys['transform.x'][1].ease).toBe('linear');
  });

  it('Keyframe Velocity: read back what was set; linear sides report the chord speed', () => {
    const keys = two('linear');
    expect(keyVelocity(keys, 0, true).out.speed).toBeCloseTo(100, 6);
    expect(keyVelocity(keys, 0, true).out.linear).toBe(true);
    expect(keyVelocity(keys, 0, true).in).toBeNull();
    let s = updateLayer(createExplosion(), 'core', { keys: { 'transform.y': keys } });
    s = setVelocity(s, [{ layerId: 'core', paramId: 'transform.y', t: 1 }], {
      in: { speed: -50, influence: 75 },
    });
    const v = keyVelocity(L(s, 'core').keys['transform.y'], 1, true);
    expect(v.in.speed).toBeCloseTo(-50, 6);
    expect(v.in.influence).toBeCloseTo(75, 6);
    expect(v.out).toBeNull();
  });

  it('graph: dragging a handle sets influence + speed; continuous keys move both sides; ⌥ breaks', () => {
    const keys = materialize([
      { t: 0, v: 0, ease: 'ease' },
      { t: 1, v: 50, ease: 'ease' },
      { t: 2, v: 0, ease: 'ease' },
    ]);
    expect(isContinuous(keys[1])).toBe(true);
    expect(handlePoints(keys, 1).out[0]).toBeCloseTo(1.33, 6);
    const d = dragHandle(keys, 1, 'out', 1.5, 75); // half way, slope 50 / s
    expect(d[1].out.influence).toBeCloseTo(50, 6);
    expect(d[1].out.speed).toBeCloseTo(50, 6);
    expect(d[1].in.speed).toBeCloseTo(50, 6);
    const b = dragHandle(keys, 1, 'out', 1.5, 75, { broken: true });
    expect(b[1].in.speed).toBe(0);
  });

  it('graph: move key values; copy / paste carries the handles', () => {
    let s = updateLayer(createExplosion(), 'core', {
      keys: { 'transform.x': materialize(two('ease')) },
    });
    const ref = { layerId: 'core', paramId: 'transform.x', t: 1 };
    s = offsetKeyValues(s, [ref], -30);
    expect(L(s, 'core').keys['transform.x'][1].v).toBe(70);
    s = setVelocity(s, [ref], { in: { speed: 10, influence: 80 } });
    const clip = copyKeys(s, [ref]);
    const r = pasteKeys(s, clip, ['smoke'], 0.5, 10, () => true);
    expect(L(r.state, 'smoke').keys['transform.x'][0].in).toEqual({
      type: 'bezier',
      speed: 10,
      influence: 80,
    });
    expect(segmentBezier(two()[0], two()[1], 0, 100)[1][1]).toBeCloseTo(100 / 3, 6);
  });
});
