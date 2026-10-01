import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { frameTime } from '../../src/core/timing.js';
import {
  buildExplosion,
  createExplosion,
  EXPLOSION_LAYERS,
} from '../../src/effects/explosion/explosion.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { checkDeterminism } from '../../src/render/determinism.js';
import { sanitizeParams } from '../../src/schema/index.js';

const deps = {
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
};
const layer = (built, id) => built.effect.layers.find((l) => l.id === id);

describe('explosion layer stack', () => {
  it('has the brief’s layers, bottom → top, all with valid parameters', () => {
    const state = createExplosion();
    expect(state.layers.map((l) => l.id)).toEqual(EXPLOSION_LAYERS.map((l) => l.id));
    for (const l of state.layers) {
      expect(sanitizeParams(LAYER_TYPES[l.type].schema, l.params).warnings).toEqual([]);
    }
  });

  it('everything after the hit starts FROM the impact (moving the impact moves the explosion)', () => {
    const s = createExplosion();
    s.globals['explosion.impact'] = 0.3;
    const b = buildExplosion(s);
    expect(layer(b, 'fireball').params['burst.start']).toBeCloseTo(0.3, 12);
    expect(layer(b, 'smoke').params['burst.start']).toBeCloseTo(0.36, 12);
    expect(layer(b, 'shockwave').params['single.start']).toBeCloseTo(0.3, 12);
    expect(layer(b, 'anticipation').params['single.end']).toBe(0.3);
    expect(b.effect.timing.phases.impact).toBe(0.3);
  });

  it('the flash covers exactly N frames starting at the impact frame', () => {
    for (const frames of [1, 2, 3]) {
      const s = createExplosion();
      s.globals['explosion.flashFrames'] = frames;
      const p = layer(buildExplosion(s), 'flash').params;
      const lit = [];
      for (let f = 0; f < s.timing.frameCount; f++) {
        const { t } = frameTime(s.timing, f);
        if (t >= p['single.start'] && t <= p['single.end']) lit.push(f);
      }
      expect(lit.length).toBe(frames);
      expect(frameTime(s.timing, lit[0]).t).toBeGreaterThanOrEqual(s.globals['explosion.impact']);
    }
  });

  it('flash 0 and anticipation off disable those layers; impact 0 removes anticipation', () => {
    const s = createExplosion();
    s.globals['explosion.flashFrames'] = 0;
    s.globals['explosion.anticipation'] = false;
    let b = buildExplosion(s);
    expect(layer(b, 'flash').enabled).toBe(false);
    expect(layer(b, 'anticipation').enabled).toBe(false);
    s.globals['explosion.anticipation'] = true;
    s.globals['explosion.impact'] = 0;
    b = buildExplosion(s);
    expect(layer(b, 'anticipation').enabled).toBe(false);
  });

  it('building does not modify the editable state', () => {
    const s = createExplosion();
    const copy = structuredClone(s);
    buildExplosion(s);
    expect(s).toEqual(copy);
  });

  it('renders deterministically and actually explodes', () => {
    const { effect, scale } = buildExplosion(createExplosion());
    const result = checkDeterminism(deps, effect, 482913, {
      width: 160,
      height: 160,
      scale: scale * 0.3,
    });
    expect(result.ok).toBe(true);
    expect(new Set(result.hashes).size).toBeGreaterThan(15);
  });
});
