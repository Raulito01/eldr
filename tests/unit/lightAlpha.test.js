import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { lightToAlpha } from '../../src/render/lightAlpha.js';
import { createRenderer } from '../../src/render/renderer.js';

const px = (r, g, b, a) => {
  const c = createCanvas(1, 1);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(1, 1);
  img.data.set([r, g, b, a]);
  ctx.putImageData(img, 0, 0);
  lightToAlpha(ctx, 1, 1);
  return [...ctx.getImageData(0, 0, 1, 1).data];
};

describe('light → alpha (D-096)', () => {
  it('alpha becomes the brightest premultiplied channel; premultiplied colour is kept', () => {
    const [r, g, b, a] = px(200, 100, 50, 128);
    expect(a).toBeGreaterThanOrEqual(99);
    expect(a).toBeLessThanOrEqual(101); // 128 × 200/255
    expect(r).toBe(255);
    expect(Math.abs((g * a) / 255 - (100 * 128) / 255)).toBeLessThan(1.5);
    expect(Math.abs((b * a) / 255 - (50 * 128) / 255)).toBeLessThan(1.5);
  });

  it('black light disappears, full-bright light is untouched', () => {
    expect(px(0, 0, 0, 200)[3]).toBe(0);
    expect(px(255, 40, 0, 90)).toEqual([255, 40, 0, 90]);
  });

  it('a glowing preset: identical over black, less alpha in the glow, paint untouched', () => {
    const r = createRenderer({
      backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
      layerTypes: LAYER_TYPES,
    });
    const { effect, scale } = buildExplosion(createExplosionFromPreset('animeBlast'));
    expect(effect.lightAlpha).toBe('unmult');
    const W = 96;
    const at = (mode) =>
      r.renderFrameImageData({ ...effect, lightAlpha: mode }, 5, 8, {
        width: W,
        height: W,
        scale: (scale * W) / 512,
      }).data;
    const a = at('additive');
    const b = at('unmult');
    let alphaA = 0;
    let alphaB = 0;
    let maxPremulDiff = 0;
    for (let i = 0; i < a.length; i += 4) {
      alphaA += a[i + 3];
      alphaB += b[i + 3];
      for (let k = 0; k < 3; k++)
        maxPremulDiff = Math.max(
          maxPremulDiff,
          Math.abs((a[i + k] * a[i + 3]) / 255 - (b[i + k] * b[i + 3]) / 255),
        );
    }
    expect(alphaB).toBeLessThan(alphaA);
    expect(maxPremulDiff).toBeLessThan(6); // over black it looks the same (8-bit rounding)
  });
});
