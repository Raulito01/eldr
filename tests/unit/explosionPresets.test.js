import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import {
  buildExplosion,
  createExplosion,
  EXPLOSION_SCHEMA,
} from '../../src/effects/explosion/explosion.js';
import {
  createExplosionFromPreset,
  EXPLOSION_PRESETS,
  explosionPreset,
} from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { checkDeterminism } from '../../src/render/determinism.js';
import { sanitizeParams } from '../../src/schema/index.js';

const deps = {
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
};

describe('explosion presets', () => {
  it('has the 4 presets with unique ids, names and a blurb', () => {
    expect(EXPLOSION_PRESETS.map((p) => p.name)).toEqual([
      'Cartoon Pop',
      'Anime Blast',
      'Small Hit',
      'Big Boom',
    ]);
    expect(new Set(EXPLOSION_PRESETS.map((p) => p.id)).size).toBe(EXPLOSION_PRESETS.length);
    for (const p of EXPLOSION_PRESETS) expect(p.blurb.length).toBeGreaterThan(10);
  });

  it('every preset only touches known layers and valid, in-range parameters', () => {
    const ids = createExplosion().layers.map((l) => l.id);
    for (const p of EXPLOSION_PRESETS) {
      for (const id of Object.keys(p.layers ?? {})) expect(ids).toContain(id);
      const s = createExplosionFromPreset(p.id);
      expect(sanitizeParams(EXPLOSION_SCHEMA, s.globals).warnings).toEqual([]);
      for (const l of s.layers) {
        expect(
          sanitizeParams(LAYER_TYPES[l.type].schema, l.params).warnings,
          `${p.id}/${l.id}`,
        ).toEqual([]);
      }
    }
  });

  it('applies globals, timing, on/off and params on top of the base stack', () => {
    const s = createExplosionFromPreset('smallHit');
    expect(s.timing.frameCount).toBe(15);
    expect(s.timing.fps).toBe(30);
    expect(s.globals['explosion.anticipation']).toBe(false);
    expect(s.layers.find((l) => l.id === 'smoke')?.enabled).toBe(false);
    expect(s.layers.find((l) => l.id === 'fireball')?.params['burst.count']).toBe(5);
    // untouched values keep the base defaults
    const base = createExplosion();
    expect(s.layers.find((l) => l.id === 'sparks')?.params['burst.drag']).toBe(
      base.layers.find((l) => l.id === 'sparks')?.params['burst.drag'],
    );
  });

  it('is pure: editing a loaded preset never changes the preset table', () => {
    const a = createExplosionFromPreset('cartoonPop');
    a.layers[0].params['style.ramp'][0].color = '#000000';
    a.globals['explosion.impact'] = 0.7;
    const b = createExplosionFromPreset('cartoonPop');
    expect(b).not.toEqual(a);
    expect(explosionPreset('cartoonPop')?.globals?.['explosion.impact']).toBe(0.1);
  });

  it('unknown id gives the base explosion', () => {
    expect(createExplosionFromPreset('nope')).toEqual(createExplosion());
  });

  it('every preset renders deterministically', () => {
    for (const p of EXPLOSION_PRESETS) {
      const { effect, scale } = buildExplosion(createExplosionFromPreset(p.id));
      const r = checkDeterminism(deps, effect, 7, { width: 96, height: 96, scale: scale * 0.2 });
      expect(r.ok, p.id).toBe(true);
      expect(new Set(r.hashes).size, p.id).toBeGreaterThan(effect.timing.frameCount / 2);
    }
  }, 60_000); // field fire + glow + dissolve on every preset: slow in Node (WebGL later, D-039)

  it('presets switch on the optional layers (core, wisps, twinkles) that the base leaves off', () => {
    const base = createExplosion();
    for (const id of ['core', 'wisps', 'twinkles']) {
      expect(base.layers.find((l) => l.id === id)?.enabled, id).toBe(false);
    }
    const anime = createExplosionFromPreset('animeBlast');
    for (const id of ['core', 'wisps', 'twinkles']) {
      expect(anime.layers.find((l) => l.id === id)?.enabled, id).toBe(true);
    }
  });

  it('dissolve curves in presets run over the whole effect (end at x = 1)', () => {
    for (const p of EXPLOSION_PRESETS) {
      for (const l of createExplosionFromPreset(p.id).layers) {
        const c = l.params['dissolve.amount'];
        if (c) expect(c[c.length - 1].x, `${p.id}/${l.id}`).toBe(1);
      }
    }
  });
});
