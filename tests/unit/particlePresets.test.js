import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { buildExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset, explosionPreset } from '../../src/effects/explosion/presets.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { PARTICLE_PRESETS } from '../../src/effects/particles/presets.js';
import { parseExplosion, serializeExplosion } from '../../src/project/index.js';
import { createCanvas2DBackend } from '../../src/render/canvas2d/backend.js';
import { createRenderer } from '../../src/render/renderer.js';

const r = createRenderer({
  backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
  layerTypes: LAYER_TYPES,
});
const visible = (img) => {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] > 8) n++;
  return n;
};

describe('particle presets (4.Pc)', () => {
  it.each(PARTICLE_PRESETS.map((p) => p.id))('%s builds, renders and round-trips', (id) => {
    const s = createExplosionFromPreset(id);
    expect(explosionPreset(id)?.name).toBeTruthy();
    expect(s.layers.some((l) => l.type.endsWith('Emitter'))).toBe(true);
    const { effect, scale } = buildExplosion(s);
    const mid = Math.floor(s.timing.frameCount / 2);
    const img = r.renderFrameImageData(effect, 1, mid, {
      width: 256,
      height: 256,
      scale: scale / 2,
    });
    expect(visible(img)).toBeGreaterThan(150);
    const file = JSON.parse(JSON.stringify(serializeExplosion(s, { seed: 1 })));
    const back = parseExplosion(file);
    expect(back.warnings).toEqual([]);
    expect(buildExplosion(back.state).effect.layers.length).toBe(effect.layers.length);
  });

  it('looping presets loop: the frame after the last is the first', () => {
    for (const p of PARTICLE_PRESETS) {
      const s = p.build();
      if (!s.timing.loop) continue;
      const { effect, scale } = buildExplosion(s);
      const a = r.renderFrameImageData(effect, 1, 0, { width: 128, height: 128, scale: scale / 4 });
      const b = r.renderFrameImageData(effect, 1, s.timing.frameCount, {
        width: 128,
        height: 128,
        scale: scale / 4,
      });
      expect(visible(a)).toBeGreaterThan(20);
      expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(true);
    }
  });

  it('the comet rides its path (the head moves with the keys)', () => {
    const s = createExplosionFromPreset('comet');
    const head = buildExplosion(s)
      .effect.at({ seconds: 0.6 })
      .layers.find((l) => l.params?.['emit.local']);
    const m0 = head.matrixAt(0.1);
    const m1 = head.matrixAt(1);
    expect(Math.hypot(m1[4] - m0[4], m1[5] - m0[5])).toBeGreaterThan(150);
  });
});
