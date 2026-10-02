import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import {
  allKeys,
  copyKeys,
  deleteKeys,
  hasRef,
  keySpan,
  moveKeys,
  pasteKeys,
  patchKeys,
  scaleKeys,
} from '../../src/effects/keyEdit.js';
import { updateLayer } from '../../src/effects/layerStack.js';

const FPS = 10;
const lin = (pairs) => pairs.reduce((k, [t, v]) => setKey(k, t, v, 'linear'), []);
const L = (s, id) => s.layers.find((l) => l.id === id);
const times = (s, id, pid) => L(s, id).keys[pid].map((k) => Math.round(k.t * FPS));

const base = () => {
  let s = updateLayer(createExplosion(), 'core', {
    keys: {
      'transform.x': lin([
        [0, 0],
        [0.5, 50],
        [1, 100],
      ]),
    },
  });
  s = updateLayer(s, 'fireball', {
    time: { offset: 0.2, stretch: 1, in: 0, out: null },
    keys: { 'glow.radius': lin([[0, 5]]) }, // comp 0.2
  });
  return s;
};

describe('multi-key editing (3.7b)', () => {
  it('moves keys on several layers together, snapped to frames, in each layer’s own time', () => {
    const refs = [
      { layerId: 'core', paramId: 'transform.x', t: 0.5 },
      { layerId: 'fireball', paramId: 'glow.radius', t: 0 },
    ];
    const r = moveKeys(base(), refs, 0.23, FPS); // → 0.2 s after snapping
    expect(times(r.state, 'core', 'transform.x')).toEqual([0, 7, 10]);
    expect(L(r.state, 'fireball').keys['glow.radius'][0].t).toBeCloseTo(0.2, 9); // comp 0.4
    expect(r.refs.length).toBe(2);
    expect(hasRef(r.refs, { layerId: 'core', paramId: 'transform.x', t: 0.7 })).toBe(true);
  });

  it('a moved key that lands on an unselected key replaces it; values travel with keys', () => {
    const r = moveKeys(base(), [{ layerId: 'core', paramId: 'transform.x', t: 0 }], 0.5, FPS);
    expect(L(r.state, 'core').keys['transform.x'].map((k) => [k.t, k.v])).toEqual([
      [0.5, 0],
      [1, 100],
    ]);
  });

  it('⌥-scale timing around the other end of the selection', () => {
    const s = base();
    const refs = allKeys(s, ['core']);
    expect(keySpan(s, refs)).toEqual({ first: 0, last: 1 });
    const r = scaleKeys(s, refs, 0, 0.5, FPS);
    expect(times(r.state, 'core', 'transform.x')).toEqual([0, 3, 5]); // 2.5 rounds to 3
  });

  it('delete: removing the last key keeps its value as a fixed value', () => {
    let s = deleteKeys(base(), [{ layerId: 'core', paramId: 'transform.x', t: 0.5 }]);
    expect(times(s, 'core', 'transform.x')).toEqual([0, 10]);
    s = deleteKeys(s, allKeys(s, ['core']));
    expect(L(s, 'core').keys['transform.x']).toBeUndefined();
    expect(L(s, 'core').transform.x).toBe(100);
  });

  it('patch (ease) on several keys', () => {
    const s = patchKeys(base(), allKeys(base(), ['core']), { ease: 'hold' });
    expect(L(s, 'core').keys['transform.x'].every((k) => k.ease === 'hold')).toBe(true);
  });

  it('copy / paste: one source layer → every selected target; several → the same layers', () => {
    const s = base();
    const clip = copyKeys(s, [
      { layerId: 'core', paramId: 'transform.x', t: 0.5 },
      { layerId: 'core', paramId: 'transform.x', t: 1 },
    ]);
    expect(clip.keys.map((k) => [k.dt, k.v])).toEqual([
      [0, 50],
      [0.5, 100],
    ]);
    const has = (l, pid) => pid.startsWith('transform.') || pid in l.params;
    const r = pasteKeys(s, clip, ['smoke', 'sparks'], 0.3, FPS, has);
    expect(times(r.state, 'smoke', 'transform.x')).toEqual([3, 8]);
    expect(times(r.state, 'sparks', 'transform.x')).toEqual([3, 8]);
    expect(r.refs.length).toBe(4);
    const multi = copyKeys(s, allKeys(s, ['core', 'fireball']));
    expect(multi.layers).toBe(2);
    const r2 = pasteKeys(s, multi, ['smoke'], 0.5, FPS, has);
    expect(L(r2.state, 'smoke').keys['transform.x']).toBeUndefined(); // went back to core / fireball
    expect(L(r2.state, 'fireball').keys['glow.radius'].length).toBe(2);
  });
});
