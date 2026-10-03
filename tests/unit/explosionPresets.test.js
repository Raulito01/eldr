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
    const s = createExplosionFromPreset('cartoonPop');
    expect(s.timing.frameCount).toBe(24);
    expect(s.globals['explosion.impact']).toBe(0.1);
    expect(s.layers.find((l) => l.id === 'twinkles')?.enabled).toBe(true);
    expect(s.layers.find((l) => l.id === 'fireball')?.params['puff.radius']).toBe(110);
    // untouched values keep the base defaults
    const base = createExplosion();
    expect(s.layers.find((l) => l.id === 'smoke')?.params['burst.drag']).toBe(
      base.layers.find((l) => l.id === 'smoke')?.params['burst.drag'],
    );
  });

  it('Anime Blast is Raul’s file without its switched-off layers (D-114)', () => {
    const s = createExplosionFromPreset('animeBlast');
    expect(s.layers.map((l) => l.id)).toEqual([
      'shockwave',
      'shockwave-2',
      'core',
      'core-2',
      'null',
      'orbitCrescent',
      'debris',
      'sparks',
      'anticipation',
      'flash',
    ]);
    expect(s.layers.find((l) => l.id === 'core')?.parent).toBe('null');
    expect(s.timing.frameCount).toBe(70);
    expect(s.globals['light.alpha']).toBe('unmult');
  });

  it('Small Hit and Big Boom: built stacks, a keyed parent, no switched-off layers', () => {
    const hit = createExplosionFromPreset('smallHit');
    expect(hit.timing.frameCount).toBe(20);
    expect(hit.globals['explosion.anticipation']).toBe(true);
    expect(hit.layers.find((l) => l.id === 'star')).toMatchObject({
      type: 'sparkle',
      anchor: 'flash',
    });
    expect(hit.layers.find((l) => l.id === 'core')?.parent).toBe('hitParent');
    const boom = createExplosionFromPreset('bigBoom');
    expect(boom.timing.frameCount).toBe(66);
    expect(boom.layers.find((l) => l.id === 'suckIn')?.anchor).toBe('anticipation');
    expect(boom.layers.find((l) => l.id === 'core')?.parent).toBe('boomParent');
    for (const s of [hit, boom]) {
      expect(s.layers.every((l) => l.enabled)).toBe(true);
      expect(s.timing.duration).toBeCloseTo((s.timing.frameCount - 1) / s.timing.fps, 12);
    }
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
      // frames inside the animation length move (Anime Blast's file runs on past its length)
      const moving = Math.min(
        effect.timing.frameCount,
        Math.round(effect.timing.duration * effect.timing.fps) + 1,
      );
      expect(new Set(r.hashes).size, p.id).toBeGreaterThan(moving / 2);
    }
  }, 60_000); // field fire + glow + dissolve on every preset: slow in Node (WebGL later, D-039)

  it('presets switch on the optional layers (core, wisps, twinkles) that the base leaves off', () => {
    const base = createExplosion();
    for (const id of ['core', 'wisps', 'twinkles']) {
      expect(base.layers.find((l) => l.id === id)?.enabled, id).toBe(false);
    }
    const pop = createExplosionFromPreset('cartoonPop');
    expect(pop.layers.find((l) => l.id === 'twinkles')?.enabled).toBe(true);
    for (const id of ['animeBlast', 'smallHit', 'bigBoom']) {
      expect(createExplosionFromPreset(id).layers.find((l) => l.id === 'core')?.enabled).toBe(true);
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
