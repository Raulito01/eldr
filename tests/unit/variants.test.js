import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { makeVariant, variantCategory } from '../../src/effects/variants.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';

const flame = () => createExplosionFromPreset('campfire');
const byLabel = (s, label) => s.layers.find((l) => l.label === label);

describe('variants (D-083)', () => {
  it('seed only: new randomness, settings untouched', () => {
    const s = flame();
    const v = makeVariant(s, 7);
    expect(v.layers.length).toBe(s.layers.length);
    v.layers.forEach((l, i) => {
      expect(l.seedKey).not.toBe(s.layers[i].seedKey ?? s.layers[i].id);
      expect(l.params).toEqual(s.layers[i].params);
    });
  });

  it('is deterministic and differs per variant seed', () => {
    const s = flame();
    expect(makeVariant(s, 3, { amount: 0.3 })).toEqual(makeVariant(s, 3, { amount: 0.3 }));
    expect(makeVariant(s, 3).layers[0].seedKey).not.toBe(makeVariant(s, 4).layers[0].seedKey);
  });

  it('layers that share a seed key keep sharing it; re-varying does not pile up suffixes', () => {
    const s = flame();
    s.layers[1] = { ...s.layers[1], seedKey: s.layers[0].seedKey ?? s.layers[0].id };
    const v = makeVariant(makeVariant(s, 1), 2);
    expect(v.layers[1].seedKey).toBe(v.layers[0].seedKey);
    expect(v.layers[0].seedKey.split('~').length).toBe(2);
  });

  it('nudges numbers around their values, within range and steps', () => {
    const s = flame();
    const amount = 0.2;
    const v = makeVariant(s, 11, { amount });
    let changed = 0;
    v.layers.forEach((l, i) => {
      const schema = LAYER_TYPES[l.type].schema;
      for (const d of schema) {
        if (d.type !== 'float' && d.type !== 'int') continue;
        const a = s.layers[i].params[d.id];
        const b = l.params[d.id];
        if (a !== b) changed++;
        expect(b).toBeGreaterThanOrEqual(d.min);
        expect(b).toBeLessThanOrEqual(d.max);
        if (typeof a === 'number' && a !== 0 && d.step)
          expect(Math.abs(b - a)).toBeLessThanOrEqual(Math.abs(a) * amount + d.step + 1e-9);
      }
    });
    expect(changed).toBeGreaterThan(10);
  });

  it('never varies timing, directions, positions, keyed settings or locked layers', () => {
    const s = flame();
    const body = s.layers.find((l) => l.type === 'sparkleEmitter');
    body.keys = { 'emit.rate': setKey([], 0, 100, 'linear') };
    const locked = byLabel(s, 'Log');
    const v = makeVariant(s, 5, { amount: 0.5, lockedLayers: [locked.id] });
    const vb = v.layers.find((l) => l.id === body.id);
    expect(vb.params['emit.rate']).toBe(body.params['emit.rate']);
    expect(vb.params['emit.direction']).toBe(body.params['emit.direction']);
    expect(v.layers.find((l) => l.id === locked.id)).toBe(locked);
  });

  it('category locks keep colour / motion / shape', () => {
    expect(variantCategory('style.spread')).toBe('colour');
    expect(variantCategory('glow.amount')).toBe('colour');
    expect(variantCategory('emit.speed')).toBe('motion');
    expect(variantCategory('wisp.speed')).toBe('motion');
    expect(variantCategory('sparkle.size')).toBe('shape');
    const s = flame();
    const v = makeVariant(s, 9, { amount: 0.5, lock: { colour: true, motion: true } });
    v.layers.forEach((l, i) => {
      for (const [id, val] of Object.entries(l.params)) {
        if (variantCategory(id) !== 'shape') expect(val).toEqual(s.layers[i].params[id]);
      }
    });
  });

  it('varies precomp layers too, and a variant round-trips through a file', () => {
    const s = flame();
    const withComp = { ...s, comps: { c1: { id: 'c1', name: 'C', layers: [s.layers[0]] } } };
    const v = makeVariant(withComp, 3);
    expect(v.comps.c1.layers[0].seedKey).toBe(v.layers[0].seedKey);
    const w = makeVariant(s, 21, { amount: 0.3 });
    const back = parseExplosion(serializeExplosion(w, { seed: 1, name: 'v' }));
    expect(back.warnings ?? []).toEqual([]);
  });
});
