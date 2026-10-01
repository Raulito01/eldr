// Determinism (brief §8.1): every test effect renders identically in any order.
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { checkDeterminism } from '../../src/render/determinism.js';
import { ALL_LAYER_TYPES, TEST_EFFECTS } from '../../test-pages/fixtures/test-effects.js';

const deps = {
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: ALL_LAYER_TYPES,
};

describe('determinism', () => {
  it.each(TEST_EFFECTS)(
    '$name: every frame identical in order and scrambled',
    ({ effect, seed }) => {
      const result = checkDeterminism(deps, effect, seed, { width: 128, height: 128, scale: 0.5 });
      expect(result.mismatches).toEqual([]);
      expect(result.ok).toBe(true);
      // It must actually animate (guards against a "deterministic" blank render).
      expect(new Set(result.hashes).size).toBeGreaterThan(1);
    },
  );

  it('detects hidden state (a deliberately broken layer fails the check)', () => {
    let counter = 0;
    const broken = {
      render(ctx) {
        counter++; // state that survives between frames — forbidden
        ctx.fillStyle = counter % 2 ? '#fff' : '#000';
        ctx.fillRect(-10, -10, 20, 20);
      },
    };
    const effect = {
      id: 'broken',
      timing: { frameCount: 6, fps: 24, loop: false },
      layers: [{ id: 'x', type: 'broken' }],
    };
    const result = checkDeterminism({ ...deps, layerTypes: { broken } }, effect, 1, {
      width: 32,
      height: 32,
    });
    expect(result.ok).toBe(false);
  });
});
