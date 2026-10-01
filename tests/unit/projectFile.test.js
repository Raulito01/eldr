// Save / load of explosions and "My presets" (step 3.5, D-047).
import { describe, expect, it } from 'vitest';
import { createExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import {
  addLayer,
  duplicateLayer,
  moveLayer,
  removeLayer,
  reseedLayer,
  updateLayer,
} from '../../src/effects/layerStack.js';
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
    file.layers[1].blend = 'dissolve'; // unknown blend → normal
    file.layers.push({ id: 'portal', type: 'portal', params: {} }); // unknown layer type
    file.timing.fps = -3; // invalid
    const r = parseExplosion(file);
    const base = createExplosion();
    expect(r.state?.globals['explosion.impact']).toBe(0.8);
    expect(r.state?.layers[0].params['burst.count']).toBe(base.layers[0].params['burst.count']);
    expect(r.state?.layers[1].blend).toBe('normal');
    expect(r.state?.layers.length).toBe(base.layers.length);
    expect(r.state?.timing).toEqual(base.timing);
    expect(r.warnings.join('\n')).toMatch(/globals: explosion.impact/);
    expect(r.warnings.join('\n')).toMatch(/unknown type "portal", skipped/);
    expect(r.warnings.join('\n')).toMatch(/unknown blend mode "dissolve"/);
    expect(r.warnings.join('\n')).toMatch(/timing/);
  });

  it('saves and reopens a CUSTOM stack: added, removed, reordered, renamed, solo, opacity, anchor, seed', () => {
    let s = createExplosionFromPreset('animeBlast');
    s = addLayer(s, 'orbitCrescent', 'core').state;
    s = removeLayer(s, 'smoke');
    s = moveLayer(s, 'flash', 0);
    s = duplicateLayer(s, 'core').state;
    s = updateLayer(s, 'core-2', {
      label: 'Core 2',
      solo: true,
      opacity: 0.35,
      blend: 'overlay',
      anchor: 'free',
    });
    s = reseedLayer(s, 'core-2');
    const r = parseExplosion(JSON.stringify(serializeExplosion(s, { seed: 9 })));
    expect(r.warnings).toEqual([]);
    expect(r.state).toEqual(s);
  });

  it('opens version-1 files (3.5): anchors come from the base stack', () => {
    const v1 = JSON.parse(JSON.stringify(serializeExplosion(createExplosion(), { seed: 1 })));
    v1.version = 1;
    for (const l of v1.layers) {
      delete l.anchor;
      delete l.solo;
      delete l.opacity;
      delete l.seedKey;
    }
    const r = parseExplosion(v1);
    expect(r.warnings).toEqual([]);
    expect(r.state).toEqual(createExplosion());
  });

  it('duplicate ids in a hand-edited file are made unique', () => {
    const file = serializeExplosion(createExplosion(), { seed: 1 });
    file.layers[1].id = file.layers[0].id;
    const ids = parseExplosion(file).state?.layers.map((l) => l.id) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
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

describe('file v3: transform + parent (3.6b)', () => {
  it('round-trips transforms and parents; broken parents and bad numbers are fixed and reported', () => {
    let s = addLayer(createExplosion(), 'null').state;
    s = updateLayer(s, 'null', {
      transform: { x: 12, y: -3, anchorX: 1, anchorY: 2, scaleX: 150, scaleY: 90, rotation: 33 },
    });
    s = updateLayer(s, 'core', { parent: 'null' });
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 2 })));
    expect(file.version).toBeGreaterThanOrEqual(3);
    expect(parseExplosion(file).state).toEqual(s);
    file.layers.find((l) => l.id === 'smoke').parent = 'ghost';
    file.layers.find((l) => l.id === 'null').parent = 'core'; // core → null → core
    file.layers.find((l) => l.id === 'fireball').transform = { x: 'left' };
    const r = parseExplosion(file);
    const w = r.warnings.join('\n');
    expect(w).toMatch(/smoke: parent "ghost" not found/);
    expect(w).toMatch(/would loop/);
    expect(w).toMatch(/fireball: transform.x/);
    expect(r.state.layers.find((l) => l.id === 'fireball').transform.x).toBe(0);
  });
});

describe('file v4: keyframes + layer time (3.6c)', () => {
  it('round-trips keys and layer time; bad keys are cleaned and reported', () => {
    const s = updateLayer(createExplosion(), 'core', {
      time: { offset: 0.2, stretch: 1.5, in: 0.1, out: 1.2 },
      keys: {
        'transform.x': [
          { t: 0, v: 0, ease: 'linear' },
          { t: 1, v: 40, ease: 'hold' },
        ],
        'glow.radius': [{ t: 0.5, v: 30, ease: 'ease' }],
        'style.ramp': [
          {
            t: 0,
            v: [
              { pos: 0, color: '#ffffff' },
              { pos: 1, color: '#000000' },
            ],
            ease: 'ease',
          },
        ],
      },
    });
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    expect(file.version).toBe(4);
    expect(parseExplosion(file).state).toEqual(s);
    const core = file.layers.find((l) => l.id === 'core');
    core.keys['made.up'] = [{ t: 0, v: 1 }];
    core.keys['glow.radius'].push({ t: 'soon', v: 1 }, { t: 0.1, v: 99999, ease: 'wobbly' });
    core.time.stretch = -2;
    const r = parseExplosion(file);
    const c = r.state.layers.find((l) => l.id === 'core');
    expect(c.keys['made.up']).toBeUndefined();
    expect(c.keys['glow.radius'].map((k) => k.t)).toEqual([0.1, 0.5]);
    expect(c.keys['glow.radius'][0].ease).toBe('ease');
    expect(c.keys['glow.radius'][0].v).toBeLessThan(99999); // clamped to the slider range
    expect(c.time.stretch).toBe(1);
    expect(r.warnings.join('\n')).toMatch(/unknown "made.up"/);
  });
});
