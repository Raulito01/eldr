import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { makeVariant, shiftRamp, variantCategory } from '../../src/effects/variants.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { RAMP_PRESETS } from '../../src/render/rampPresets.js';

const flame = () => createExplosionFromPreset('campfire');
const byLabel = (s, label) => s.layers.find((l) => l.label === label);

describe('variants (D-083)', () => {
  it('seed only: new randomness, settings untouched', () => {
    const s = flame();
    const v = makeVariant(s, 7, { lock: { colour: true } });
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

  it('subtle colour: one shared hue shift, sister colours (D-084)', () => {
    const s = flame();
    const v = makeVariant(s, 13, { lock: {} });
    const ramps = (d) => d.layers.map((l) => JSON.stringify(l.params['style.ramp'] ?? null));
    expect(ramps(v)).not.toEqual(ramps(s));
    // layers that shared a ramp still share one
    const a = s.layers.findIndex((l) => l.label === 'Centre tongue');
    const b = s.layers.findIndex((l) => l.label === 'Centre tongue core');
    expect(v.layers[a].params['style.ramp']).toEqual(v.layers[b].params['style.ramp']);
    expect(shiftRamp([{ pos: 0, color: '#ff0000' }], 120, 0)[0].color).toBe('#00ff00');
  });

  it('wild: library ramps, far-reaching numbers, effects can switch on, deterministic (D-084)', () => {
    const s = flame();
    const lib = new Set(Object.values(RAMP_PRESETS).map((r) => JSON.stringify(r.stops)));
    let far = 0;
    let switchedOn = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const v = makeVariant(s, seed, { mode: 'wild', wildness: 1 });
      expect(v).toEqual(makeVariant(s, seed, { mode: 'wild', wildness: 1 }));
      v.layers.forEach((l, i) => {
        const r = l.params['style.ramp'];
        if (r) expect(lib.has(JSON.stringify(r))).toBe(true);
        for (const d of LAYER_TYPES[l.type].schema) {
          if (d.type !== 'float' && d.type !== 'int') continue;
          const a = s.layers[i].params[d.id];
          const b = l.params[d.id];
          expect(b).toBeGreaterThanOrEqual(d.min);
          expect(b).toBeLessThanOrEqual(d.max);
          if (a > 0 && (b / a > 1.6 || b / a < 0.6)) far++;
          if (a === 0 && b !== 0) switchedOn++;
        }
      });
      // timing / direction never change, even in wild
      const body = v.layers.find((l) => l.type === 'sparkleEmitter');
      const orig = s.layers.find((l) => l.id === body.id);
      expect(body.params['emit.direction']).toBe(orig.params['emit.direction']);
      expect(body.params['emit.start']).toBe(orig.params['emit.start']);
    }
    expect(far).toBeGreaterThan(50);
    expect(switchedOn).toBeGreaterThan(0);
  });
});
