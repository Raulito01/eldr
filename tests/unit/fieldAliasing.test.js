import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';

// Strong swirl / curl used to leave dotted, "pixelated" rings (Raul, 3.8 fix): the 2-px grid
// can't follow a field that twists faster than that. Compare with a 4× supersampled reference.
describe('field fire anti-aliasing under strong swirl', () => {
  it('stays close to a 4× supersampled reference', () => {
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: LAYER_TYPES,
    });
    let s = createExplosion();
    s = {
      ...s,
      layers: s.layers.map((l) =>
        l.id === 'core'
          ? {
              ...l,
              solo: true,
              enabled: true,
              params: {
                ...l.params,
                'field.warp': 3,
                'field.swirl': 1,
                'field.form': 'flame',
                'field.curl': 6,
                'field.width': 260,
                'field.height': 420,
              },
            }
          : l,
      ),
    };
    const { effect, scale } = buildExplosion(s);
    const N = 160;
    const crop = (/** @type {number} */ k) => {
      const out = r.renderFrame(effect, 482913, 8, {
        width: 512 * k,
        height: 512 * k,
        scale: scale * k,
      });
      return out.ctx.getImageData(96 * k, 0, N * k, N * k).data;
    };
    const a = crop(1);
    const ref = crop(4);
    let err = 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let j = 0; j < 4; j++)
            for (let i = 0; i < 4; i++) {
              const o = ((y * 4 + j) * N * 4 + (x * 4 + i)) * 4;
              sum += c === 3 ? ref[o + 3] : (ref[o + c] * ref[o + 3]) / 255;
            }
          const o = (y * N + x) * 4;
          const mine = c === 3 ? a[o + 3] : (a[o + c] * a[o + 3]) / 255;
          err += Math.abs(mine - sum / 16);
        }
      }
    }
    const mean = err / (N * N * 4);
    // 0.0.36: 4.5 (dotted rings) → 1.8 after adaptive supersampling
    expect(mean).toBeLessThan(2.5);
  });
});
