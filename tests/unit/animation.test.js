// Keyframes + layer time in the build and renderer (3.6c).
import { createCanvas } from '@napi-rs/canvas';
import { describe, expect, it } from 'vitest';
import { setKey } from '../../src/core/keyframes.js';
import { frameTime } from '../../src/core/timing.js';
import { buildExplosion, createExplosion } from '../../src/effects/explosion/explosion.js';
import { createExplosionFromPreset } from '../../src/effects/explosion/presets.js';
import { layerAt, layerSeconds } from '../../src/effects/layerAnimation.js';
import { addLayer, updateLayer } from '../../src/effects/layerStack.js';
import { LAYER_TYPES } from '../../src/effects/layerTypes.js';
import { checkDeterminism } from '../../src/render/determinism.js';
import { createCanvas2DBackend, createRenderer } from '../../src/render/index.js';

const layer = (s, id) => s.layers.find((l) => l.id === id);
const at = (s, id, seconds) => {
  const { effect } = buildExplosion(s);
  const now = effect.at ? effect.at({ ...frameTime(effect.timing, 0), seconds }) : effect;
  return now.layers.find((l) => l.id === id);
};

describe('keyframes in the build', () => {
  it('animated transform, opacity and params resolve per moment (through parents too)', () => {
    let s = addLayer(createExplosion(), 'null').state;
    s = updateLayer(s, 'null', {
      keys: { 'transform.x': setKey(setKey([], 0, 0, 'linear'), 1, 100, 'linear') },
    });
    s = updateLayer(s, 'core', {
      parent: 'null',
      keys: {
        'layer.opacity': setKey(setKey([], 0, 100, 'linear'), 1, 0),
        'glow.radius': setKey(setKey([], 0, 10, 'linear'), 1, 50),
      },
    });
    expect(at(s, 'core', 0.5).matrix[4]).toBeCloseTo(50, 9);
    expect(at(s, 'core', 0.5).opacity).toBeCloseTo(0.5, 9);
    expect(at(s, 'core', 0.5).params['glow.radius']).toBeCloseTo(30, 9);
    expect(at(s, 'core', 2).params['glow.radius']).toBe(50);
    // without keys the build has no per-frame hook (no cost)
    expect(buildExplosion(createExplosion()).effect.at).toBeUndefined();
  });

  it('keys live in layer time: sliding / stretching a layer moves its keys', () => {
    const l = updateLayer(createExplosion(), 'core', {
      time: { offset: 1, stretch: 2, in: 0, out: null },
      keys: { 'glow.radius': setKey(setKey([], 0, 0, 'linear'), 1, 100, 'linear') },
    });
    const core = layer(l, 'core');
    expect(layerSeconds(core.time, 2)).toBe(0.5);
    expect(layerAt(core, 2).params['glow.radius']).toBeCloseTo(50, 9);
    expect(layerAt(core, 1).params['glow.radius']).toBe(0);
  });
});

describe('layer time in the renderer', () => {
  const r = createRenderer({
    backend: createCanvas2DBackend((w, h) => createCanvas(w, h)),
    layerTypes: {
      probe: {
        render(ctx, _params, frame) {
          // draws a dot whose x = layer seconds × 10
          ctx.fillStyle = '#fff';
          ctx.fillRect(frame.seconds * 10, 0, 1, 1);
        },
      },
    },
  });
  const xOf = (layerTime, frame) => {
    const img = r.renderFrameImageData(
      {
        id: 'p',
        timing: { frameCount: 40, fps: 10, loop: false, duration: 3.9 },
        layers: [{ id: 'p', type: 'probe', time: layerTime }],
      },
      1,
      frame,
      { width: 100, height: 3, pivot: { x: 0, y: 0 } },
    );
    for (let i = 0; i < 100; i++) if (img.data[i * 4 + 3]) return i;
    return null;
  };

  it('offset slides, stretch slows, in / out hide', () => {
    expect(xOf(undefined, 20)).toBe(20); // 2 s
    expect(xOf({ offset: 1, stretch: 1, in: 0, out: null }, 20)).toBe(10);
    expect(xOf({ offset: 0, stretch: 2, in: 0, out: null }, 20)).toBe(10);
    expect(xOf({ offset: 0, stretch: 1, in: 2.5, out: null }, 20)).toBeNull();
    expect(xOf({ offset: 0, stretch: 1, in: 0, out: 2 }, 20)).toBeNull();
    expect(xOf({ offset: 0, stretch: 1, in: 0, out: 2.1 }, 20)).toBe(20);
  });
});

describe('animated presets stay deterministic', () => {
  it('a keyframed, slid preset renders identically in any frame order', () => {
    let s = createExplosionFromPreset('smallHit');
    s = updateLayer(s, 'fireball', {
      time: { offset: 0.1, stretch: 1.5, in: 0.05, out: null },
      keys: { 'transform.rotation': setKey(setKey([], 0, 0), 0.4, 90) },
    });
    const { effect, scale } = buildExplosion(s);
    const res = checkDeterminism(
      { backend: createCanvas2DBackend((w, h) => createCanvas(w, h)), layerTypes: LAYER_TYPES },
      effect,
      3,
      { width: 64, height: 64, scale: scale * 0.15 },
    );
    expect(res.ok).toBe(true);
  });
});
