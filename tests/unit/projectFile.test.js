// Save / load of explosions and "My presets" (step 3.5, D-047).
import { describe, expect, it } from 'vitest';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { createUserPresets, parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { FILE_FORMAT } from '../../src/version.js';

describe('explosion file', () => {
  it('round-trips a tuned preset exactly (state + seed + name)', () => {
    const s = createExplosionFromPreset('animeBlast');
    s.globals['explosion.impact'] = 0.3;
    s.timing = { ...s.timing, frameCount: 50, holdMode: 'twos' };
    s.layers[2].enabled = false;
    s.layers[3].blend = 'add';
    s.layers[3].params['glow.radius'] = 77;
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1234, name: 'Mine' })));
    expect(file.format).toBe(FILE_FORMAT);
    const r = parseExplosion(JSON.stringify(file));
    expect(r.error).toBeUndefined();
    expect(r.warnings).toEqual([]);
    expect(r.state).toEqual(s);
    expect([r.seed, r.name]).toEqual([1234, 'Mine']);
  });

  it('rejects non-ELDR files and other effect families with a readable error', () => {
    expect(parseExplosion('not json').error).toMatch(/Not a valid file/);
    expect(parseExplosion({ hello: 1 }).error).toBe('Not an ELDR effect file');
    expect(parseExplosion({ format: FILE_FORMAT, family: 'slash' }).error).toMatch(/slash/);
  });

  it('opens damaged / older files: fixes bad values, fills missing ones, reports what changed', () => {
    const file = serializeExplosion(createExplosion(), { seed: 5 });
    file.globals['explosion.impact'] = 99; // out of range
    delete file.layers[0].params['burst.count']; // missing → default, no warning
    file.layers[1].blend = 'multiply'; // unknown blend → kept
    file.layers.push({ id: 'portal', type: 'blob', params: {} }); // unknown layer
    file.timing.fps = -3; // invalid
    const r = parseExplosion(file);
    const base = createExplosion();
    expect(r.state?.globals['explosion.impact']).toBe(0.8);
    expect(r.state?.layers[0].params['burst.count']).toBe(base.layers[0].params['burst.count']);
    expect(r.state?.layers[1].blend).toBe(base.layers[1].blend);
    expect(r.state?.timing).toEqual(base.timing);
    expect(r.warnings.join('\n')).toMatch(/globals: explosion.impact/);
    expect(r.warnings.join('\n')).toMatch(/Unknown layer "portal"/);
    expect(r.warnings.join('\n')).toMatch(/timing/);
  });

  it('a layer saved with a different type keeps the defaults (no crash)', () => {
    const file = serializeExplosion(createExplosion(), { seed: 5 });
    file.layers[0].type = 'ring';
    const r = parseExplosion(file);
    expect(r.state?.layers[0]).toEqual(createExplosion().layers[0]);
    expect(r.warnings[0]).toMatch(/doesn't match/);
  });
});

describe('my presets', () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  };

  it('saves, lists (sorted), loads and removes', () => {
    const p = createUserPresets(memory());
    const file = serializeExplosion(createExplosion(), { seed: 1, name: 'b' });
    expect(p.save('b', file)).toBe(true);
    expect(p.save('A', file)).toBe(true);
    expect(p.names()).toEqual(['A', 'b']);
    expect(parseExplosion(p.get('b')).state).toEqual(createExplosion());
    p.remove('A');
    expect(p.names()).toEqual(['b']);
    expect(p.get('A')).toBeNull();
  });

  it('works (empty, never throws) when storage is missing, broken or full', () => {
    expect(createUserPresets(null).names()).toEqual([]);
    expect(createUserPresets(null).save('x', {})).toBe(false);
    const broken = {
      getItem: () => '{not json',
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const p = createUserPresets(broken);
    expect(p.names()).toEqual([]);
    expect(p.save('x', {})).toBe(false);
  });
});
