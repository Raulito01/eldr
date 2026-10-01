// Layer stack operations + per-layer timing / solo / opacity in the build (step 3.6a).
import { describe, expect, it } from 'vitest';
import {
  buildExplosion,
  createExplosion,
  makeLayer,
} from '../../src/effects/explosion/explosion.js';
import {
  addLayer,
  duplicateLayer,
  moveLayer,
  nudgeLayer,
  removeLayer,
  reseedLayer,
  uniqueId,
  updateLayer,
} from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { sanitizeParams } from '../../src/schema/index.js';

const ids = (s) => s.layers.map((l) => l.id);
const layer = (s, id) => s.layers.find((l) => l.id === id);

describe('layer stack ops', () => {
  it('add puts a valid default layer directly above the selection (or on top)', () => {
    const s0 = createExplosion();
    const { state, id } = addLayer(s0, 'fieldFire', 'fireball');
    expect(id).toBe('fieldFire');
    expect(ids(state).indexOf(id)).toBe(ids(state).indexOf('fireball') + 1);
    const l = layer(state, id);
    expect(l).toMatchObject({
      label: 'Field fire',
      enabled: true,
      solo: false,
      opacity: 1,
      blend: 'normal',
      anchor: 'afterImpact',
    });
    expect(sanitizeParams(LAYER_TYPES.fieldFire.schema, l.params).warnings).toEqual([]);
    const top = addLayer(state, 'fieldFire');
    expect(top.id).toBe('fieldFire-2');
    expect(layer(top.state, top.id).label).toBe('Field fire 2');
    expect(ids(top.state).at(-1)).toBe('fieldFire-2');
    expect(s0.layers.length).toBe(createExplosion().layers.length); // input untouched
  });

  it('duplicate sits above the original, keeps settings AND randomness, gets a new id/label', () => {
    const s0 = updateLayer(createExplosion(), 'core', { solo: true, opacity: 0.4 });
    const { state, id } = duplicateLayer(s0, 'core');
    expect(id).toBe('core-2');
    expect(ids(state).indexOf(id)).toBe(ids(state).indexOf('core') + 1);
    const [a, b] = [layer(state, 'core'), layer(state, id)];
    expect(b.params).toEqual(a.params);
    expect(b.params).not.toBe(a.params); // deep copy
    expect(b.seedKey).toBe(a.seedKey);
    expect(b.label).toBe('Fire core copy');
    expect(b.solo).toBe(false);
    expect(b.opacity).toBe(0.4);
  });

  it('remove, move (clamped) and nudge', () => {
    const s0 = createExplosion();
    expect(ids(removeLayer(s0, 'smoke'))).not.toContain('smoke');
    expect(ids(moveLayer(s0, 'flash', 0))[0]).toBe('flash');
    expect(ids(moveLayer(s0, 'smoke', 99)).at(-1)).toBe('smoke');
    const up = nudgeLayer(s0, 'smoke', 1);
    expect(ids(up).slice(0, 2)).toEqual([ids(s0)[1], 'smoke']);
    expect(ids(nudgeLayer(s0, 'smoke', -1))).toEqual(ids(s0));
  });

  it('reseed changes only the randomness key, and changes it again each time', () => {
    const s1 = reseedLayer(createExplosion(), 'sparks');
    const s2 = reseedLayer(s1, 'sparks');
    expect(layer(s1, 'sparks').seedKey).toBe('sparks#2');
    expect(layer(s2, 'sparks').seedKey).toBe('sparks#3');
    expect(uniqueId({ layers: [{ id: 'a' }, { id: 'a-2' }] }, 'a-2')).toBe('a-3');
  });
});

describe('build: anchors, solo, opacity, seedKey', () => {
  const base = () => {
    const s = createExplosion();
    s.globals['explosion.impact'] = 0.2;
    return s;
  };
  const built = (s, id) => buildExplosion(s).effect.layers.find((l) => l.id === id);

  it('an added layer is timed after the impact by default; free ignores the impact', () => {
    const { state, id } = addLayer(base(), 'blob');
    expect(built(state, id).params['single.start']).toBeCloseTo(0.2, 12);
    const free = updateLayer(state, id, { anchor: 'free' });
    expect(built(free, id).params['single.start']).toBe(0);
  });

  it('anticipation / flash anchors work for any layer type (orbit + burst too)', () => {
    let { state, id } = addLayer(base(), 'orbitSparkle');
    state = updateLayer(state, id, { anchor: 'anticipation' });
    expect(built(state, id).params['orbit.end']).toBe(0.2);
    const b = addLayer(state, 'sparkleBurst');
    const f = updateLayer(b.state, b.id, { anchor: 'flash' });
    expect(built(f, b.id).params['burst.start']).toBe(0.2);
  });

  it('solo shows only soloed visible layers; opacity, blend and seedKey reach the renderer', () => {
    let s = updateLayer(base(), 'core', {
      enabled: true,
      solo: true,
      opacity: 0.5,
      blend: 'overlay',
    });
    const visible = buildExplosion(s)
      .effect.layers.filter((l) => l.enabled)
      .map((l) => l.id);
    expect(visible).toEqual(['core']);
    expect(built(s, 'core')).toMatchObject({ opacity: 0.5, blend: 'overlay', seedKey: 'core' });
    s = updateLayer(s, 'core', { enabled: false });
    expect(buildExplosion(s).effect.layers.filter((l) => l.enabled).length).toBeGreaterThan(3);
  });

  it('a duplicate renders identically to its original (same seedKey); reseed makes it differ', () => {
    const { state, id } = duplicateLayer(base(), 'fireball');
    expect(built(state, id).seedKey).toBe(built(state, 'fireball').seedKey);
    expect(built(reseedLayer(state, id), id).seedKey).not.toBe('fireball');
  });

  it('makeLayer fills every field', () => {
    expect(makeLayer({ id: 'x', type: 'blob' })).toMatchObject({
      label: 'x',
      seedKey: 'x',
      anchor: 'afterImpact',
      opacity: 1,
    });
  });
});
